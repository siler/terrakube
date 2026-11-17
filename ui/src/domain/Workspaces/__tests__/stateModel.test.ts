import { buildStateDiagram, outputCopyText, parseOldState, parseState, walkShowJsonResources } from "../stateModel";

jest.mock("reactflow", () => ({ MarkerType: { Arrow: "arrow" } }));

const showJsonResource = (address: string, dependsOn?: string[]) => ({
  address,
  mode: "managed",
  type: "null_resource",
  name: address.split(".").pop(),
  provider_name: "registry.terraform.io/hashicorp/null",
  values: { id: address },
  ...(dependsOn ? { depends_on: dependsOn } : {}),
});

const nestedState = {
  values: {
    root_module: {
      resources: [showJsonResource("null_resource.root")],
      child_modules: [
        {
          address: "module.a",
          resources: [showJsonResource("module.a.null_resource.first", ["null_resource.root"])],
          child_modules: [
            {
              address: "module.a.module.b",
              resources: [showJsonResource("module.a.module.b.null_resource.deep", ["module.a.null_resource.first"])],
            },
          ],
        },
        { address: "module.c", resources: [showJsonResource("module.c.null_resource.last")] },
      ],
    },
  },
};

describe("parseState", () => {
  it("lists resources of every nested module, labelled with their module address", () => {
    expect(parseState(nestedState).resources.map((r) => [r.module, r.name])).toEqual([
      ["root_module", "root"],
      ["module.a", "first"],
      ["module.a.module.b", "deep"],
      ["module.c", "last"],
    ]);
  });

  it("keeps depends_on as a list", () => {
    expect(parseState(nestedState).resources[1].depends_on).toEqual(["null_resource.root"]);
  });

  it("reads outputs as display text, masking sensitive ones", () => {
    const state = {
      values: {
        outputs: {
          enabled: { type: "bool", value: false },
          count: { type: "number", value: 3 },
          nothing: { type: "string", value: null },
          name: { type: "string", value: "web" },
          secret: { type: "string", value: "hunter2", sensitive: true },
          tags: { type: ["map", "string"], value: { env: "prod" } },
          secretTags: { type: ["map", "string"], value: { env: "prod" }, sensitive: true },
        },
      },
    };

    expect(parseState(state).outputs).toEqual([
      { name: "enabled", type: "bool", value: "false" },
      { name: "count", type: "number", value: "3" },
      { name: "nothing", type: "string", value: "null" },
      { name: "name", type: "string", value: "web" },
      { name: "secret", type: "string", value: "*****" },
      { name: "tags", type: "Other type", value: '{"env":"prod"}' },
      { name: "secretTags", type: "Other type", value: "*****" },
    ]);
  });

  it.each([undefined, null, "state", 42, [], { values: "x" }, { values: { root_module: [], outputs: [] } }])(
    "returns nothing for malformed state %p",
    (state) => {
      expect(parseState(state)).toEqual({ resources: [], outputs: [] });
    }
  );

  it("skips malformed modules, resources and outputs", () => {
    const state = {
      values: {
        outputs: { broken: null, ok: { type: "string", value: "y" } },
        root_module: {
          resources: [null, { name: "no_type" }, "x", showJsonResource("null_resource.ok")],
          child_modules: [null, 7, { address: "module.m", resources: "nope", child_modules: [{ resources: [{}] }] }],
        },
      },
    };

    const result = parseState(state);
    expect(result.resources.map((r) => r.name)).toEqual(["ok"]);
    expect(result.outputs).toEqual([{ name: "ok", type: "string", value: "y" }]);
  });
});

describe("parseOldState", () => {
  const rawState = {
    version: 4,
    outputs: {
      enabled: { type: "bool", value: true },
      secret: { type: "string", value: "hunter2", sensitive: true },
      list: { type: ["list", "number"], value: [1, 2] },
    },
    resources: [
      {
        module: "module.a.module.b",
        mode: "managed",
        type: "null_resource",
        name: "n",
        provider: 'provider["registry.terraform.io/hashicorp/null"]',
        instances: [
          { index_key: 0, attributes: { id: "1" }, dependencies: ["null_resource.root"] },
          { index_key: "k", attributes: { id: "2" } },
          null,
        ],
      },
      { mode: "managed", type: "null_resource", name: "root", provider: "provider[x]", instances: [{}] },
      { name: "missing_type", instances: [{}] },
      "junk",
    ],
  };

  it("reads every instance with its module, provider and index", () => {
    expect(parseOldState(rawState).resources).toEqual([
      {
        name: "n",
        type: "null_resource",
        provider: "registry.terraform.io/hashicorp/null",
        module: "module.a.module.b",
        index: 0,
        values: { id: "1" },
        depends_on: ["null_resource.root"],
      },
      {
        name: "n",
        type: "null_resource",
        provider: "registry.terraform.io/hashicorp/null",
        module: "module.a.module.b",
        index: "k",
        values: { id: "2" },
        depends_on: [],
      },
      {
        name: "root",
        type: "null_resource",
        provider: "x",
        module: "root_module",
        index: undefined,
        values: {},
        depends_on: [],
      },
    ]);
  });

  it("reads outputs with the raw-state mask", () => {
    expect(parseOldState(rawState).outputs).toEqual([
      { name: "enabled", type: "bool", value: "true" },
      { name: "secret", type: "string", value: "********" },
      { name: "list", type: "Other type", value: "[1,2]" },
    ]);
  });

  it.each([undefined, null, "x", { resources: "x", outputs: 3 }])("returns nothing for malformed state %p", (state) => {
    expect(parseOldState(state)).toEqual({ resources: [], outputs: [] });
  });
});

describe("walkShowJsonResources", () => {
  it("falls back to a computed address when a resource has none", () => {
    const state = {
      values: {
        root_module: {
          child_modules: [{ address: "module.m", resources: [{ type: "null_resource", name: "n", index: 2 }] }],
        },
      },
    };
    expect(walkShowJsonResources(state).map((r) => r.address)).toEqual(["module.m.null_resource.n[2]"]);
  });
});

describe("buildStateDiagram", () => {
  it("draws a node for each resource in nested modules and an edge per dependency", () => {
    const showDrawer = jest.fn();
    const { nodes, edges } = buildStateDiagram(nestedState, showDrawer);

    expect(nodes.map((n) => [n.id, n.position])).toEqual([
      ["null_resource.root", { x: 350, y: 100 }],
      ["module.a.null_resource.first", { x: 350, y: 230 }],
      ["module.a.module.b.null_resource.deep", { x: 700, y: 230 }],
      ["module.c.null_resource.last", { x: 700, y: 100 }],
    ]);
    expect(nodes[2].data).toMatchObject({ module: "module.a.module.b", name: "deep", showDrawer });
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ["module.a.null_resource.first", "null_resource.root"],
      ["module.a.module.b.null_resource.deep", "module.a.null_resource.first"],
    ]);
  });

  it("draws nothing for malformed state", () => {
    expect(buildStateDiagram({ values: { root_module: { resources: [null] } } }, jest.fn())).toEqual({
      nodes: [],
      edges: [],
    });
  });
});

describe("outputCopyText", () => {
  it("copies the unmasked value from either state format", () => {
    const outputs = {
      secret: { type: "string", value: "hunter2", sensitive: true },
      enabled: { type: "bool", value: false },
      tags: { type: ["map", "string"], value: { env: "prod" } },
    };
    expect(outputCopyText({ values: { outputs } }, "secret")).toBe("hunter2");
    expect(outputCopyText({ outputs }, "enabled")).toBe("false");
    expect(outputCopyText({ outputs }, "tags")).toBe('{"env":"prod"}');
  });

  it("is empty for a missing output or malformed state", () => {
    expect(outputCopyText({ values: { outputs: {} } }, "x")).toBe("");
    expect(outputCopyText(null, "x")).toBe("");
    expect(outputCopyText({ outputs: { x: 1 } }, "x")).toBe("");
  });
});
