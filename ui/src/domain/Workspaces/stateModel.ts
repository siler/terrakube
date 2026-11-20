import { Edge, MarkerType, Node } from "reactflow";
import { isRecord } from "@/modules/utils/typeGuards";
import type { Resource, ResourceNodeData, StateOutputValue } from "../types";

/** A state output with the name it is declared under. */
export type StateOutputVariableWithName = { name: string } & StateOutputValue;

/** Resources and outputs read from a state document. */
export type ParsedState = { resources: Resource[]; outputs: StateOutputVariableWithName[] };

/** A `show -json` resource with the full address the diagram keys nodes and edges by. */
export type AddressedResource = { address: string; resource: Resource };

const ROOT_MODULE = "root_module";
const SHOW_JSON_MASK = "*****";
const RAW_STATE_MASK = "********";

const asString = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);

const asIndex = (value: unknown): string | number | undefined =>
  typeof value === "string" || typeof value === "number" ? value : undefined;

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const asValues = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Reconstructs the terraform address of a parsed resource; root resources carry the "root_module" label,
 * which is not an address prefix.
 */
export const getResourceAddress = (resource: Pick<Resource, "index" | "module" | "name" | "type">): string => {
  let indexSuffix = "";
  if (typeof resource.index === "string") {
    indexSuffix = `["${resource.index}"]`;
  } else if (typeof resource.index === "number") {
    indexSuffix = `[${resource.index}]`;
  }
  const typeAndName = `${resource.type}.${resource.name}${indexSuffix}`;
  return resource.module && resource.module !== ROOT_MODULE ? `${resource.module}.${typeAndName}` : typeAndName;
};

const outputText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  // JSON.stringify returns undefined for undefined and functions.
  return JSON.stringify(value) ?? "";
};

// Primitive outputs declare their type as a string; complex ones as a type-constructor array.
const unmaskedOutputText = (output: Record<string, unknown>): string =>
  typeof output.type === "string" ? outputText(output.value) : (JSON.stringify(output.value) ?? "");

const parseOutputs = (outputs: unknown, mask: string): StateOutputVariableWithName[] => {
  if (!isRecord(outputs)) {
    return [];
  }
  return Object.entries(outputs).flatMap(([name, output]): StateOutputVariableWithName[] => {
    if (!isRecord(output)) {
      return [];
    }
    const type = typeof output.type === "string" ? output.type : "Other type";
    if (output.sensitive === true) {
      return [{ name, type, value: mask }];
    }
    return [{ name, type, value: unmaskedOutputText(output) }];
  });
};

const parseShowJsonResource = (value: unknown, module: string): AddressedResource | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = asString(value.name);
  const type = asString(value.type);
  if (name === undefined || type === undefined) {
    return undefined;
  }
  const resource: Resource = {
    name,
    type,
    provider: asString(value.provider_name) ?? "",
    module,
    index: asIndex(value.index),
    values: asValues(value.values),
    depends_on: asStrings(value.depends_on),
  };
  return { address: asString(value.address) ?? getResourceAddress(resource), resource };
};

const walkModule = (module: unknown, label: string, into: AddressedResource[]): AddressedResource[] => {
  if (!isRecord(module)) {
    return into;
  }
  for (const value of asArray(module.resources)) {
    const parsed = parseShowJsonResource(value, label);
    if (parsed) {
      into.push(parsed);
    }
  }
  for (const child of asArray(module.child_modules)) {
    if (isRecord(child)) {
      walkModule(child, asString(child.address) ?? label, into);
    }
  }
  return into;
};

/**
 * Lists every resource of a `terraform show -json` document, root module first, then each child module
 * depth-first. Malformed modules and resources are skipped.
 */
export const walkShowJsonResources = (state: unknown): AddressedResource[] => {
  if (!isRecord(state) || !isRecord(state.values)) {
    return [];
  }
  return walkModule(state.values.root_module, ROOT_MODULE, []);
};

/** Reads resources and outputs from a `terraform show -json` document. */
export const parseState = (state: unknown): ParsedState => {
  const values = isRecord(state) && isRecord(state.values) ? state.values : {};
  return {
    resources: walkShowJsonResources(state).map(({ resource }) => resource),
    outputs: parseOutputs(values.outputs, SHOW_JSON_MASK),
  };
};

const parseProvider = (provider: unknown): string =>
  typeof provider === "string"
    ? provider.replace('provider["', "").replace("provider[", "").replace('"]', "").replace("]", "")
    : "";

const parseRawResource = (value: unknown): Resource[] => {
  if (!isRecord(value)) {
    return [];
  }
  const name = asString(value.name);
  const type = asString(value.type);
  if (name === undefined || type === undefined) {
    return [];
  }
  const module = asString(value.module) ?? ROOT_MODULE;
  const provider = parseProvider(value.provider);
  return asArray(value.instances).flatMap((instance): Resource[] =>
    isRecord(instance)
      ? [
          {
            name,
            type,
            provider,
            module,
            index: asIndex(instance.index_key),
            values: asValues(instance.attributes),
            depends_on: asStrings(instance.dependencies),
          },
        ]
      : []
  );
};

/** Reads resources and outputs from a raw (version 4) tfstate file. */
export const parseOldState = (state: unknown): ParsedState => {
  if (!isRecord(state)) {
    return { resources: [], outputs: [] };
  }
  return {
    resources: asArray(state.resources).flatMap(parseRawResource),
    outputs: parseOutputs(state.outputs, RAW_STATE_MASK),
  };
};

/**
 * The unmasked text of a named output, for copying, from either state format; empty when it is absent.
 */
export const outputCopyText = (state: unknown, outputName: string): string => {
  if (!isRecord(state)) {
    return "";
  }
  const outputs = isRecord(state.values) ? state.values.outputs : state.outputs;
  const output = isRecord(outputs) ? outputs[outputName] : undefined;
  if (!isRecord(output)) {
    return "";
  }
  return unmaskedOutputText(output);
};

/** Diagram nodes and dependency edges for a state. */
export type StateDiagram = { nodes: Node<ResourceNodeData>[]; edges: Edge[] };

const COLUMN_WIDTH = 350;
const ROW_HEIGHT = 130;
const TOP = 100;

/**
 * Lays out every resource of a `show -json` document, including nested modules, one row per dependency count,
 * with an edge to each resource it depends on.
 */
export const buildStateDiagram = (state: unknown, showDrawer: (resource: Resource) => void): StateDiagram => {
  const nodes: Node<ResourceNodeData>[] = [];
  const edges: Edge[] = [];
  const rowWidths = new Map<number, number>();

  for (const { address, resource } of walkShowJsonResources(state)) {
    const dependencies = resource.depends_on.length;
    const x = (rowWidths.get(dependencies) ?? 0) + COLUMN_WIDTH;
    rowWidths.set(dependencies, x);
    nodes.push({
      id: address,
      type: "resourceNode",
      data: { ...resource, showDrawer },
      position: { x, y: TOP + dependencies * ROW_HEIGHT },
    });
    for (const dependency of resource.depends_on) {
      edges.push({
        id: `${address}-${dependency}`,
        source: address,
        target: dependency,
        className: "normal-edge",
        animated: true,
        markerEnd: { type: MarkerType.Arrow },
        markerStart: { type: MarkerType.Arrow },
        style: { stroke: "var(--tk-accent)" },
      });
    }
  }

  return { nodes, edges };
};
