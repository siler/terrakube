#!/usr/bin/env node
// Writes the API's Elide GraphQL schema as SDL, the input codegen.ts types the UI's GraphQL documents from.
//
//   TERRAKUBE_TOKEN=… node scripts/api-types/graphql-schema.mts --api https://<api host> [--out-dir <dir>]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildClientSchema, getIntrospectionQuery, printSchema, type IntrospectionQuery } from "graphql";

type Args = { api: string; "out-dir": string };

const here = dirname(fileURLToPath(import.meta.url));

const USAGE = "usage: graphql-schema.mts --api <origin> [--out-dir <dir>]";

// Elide builds this schema from the entities at startup; the subscriptions schema is a source file codegen reads directly.
const SCHEMAS = [{ path: "/graphql/api/v1", file: "graphql/schema.graphql" }];

const parseArgs = (argv: string[]): Args => {
  const args: Partial<Args> = { "out-dir": resolve(here, "../../src/domain/generated") };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, "");
    const value = argv[i + 1];
    if ((key !== "api" && key !== "out-dir") || value === undefined) {
      throw new Error(`${USAGE} (bad argument ${argv[i]})`);
    }
    args[key] = value;
  }
  const { api, "out-dir": outDir } = args;
  if (!api || !outDir) {
    throw new Error(USAGE);
  }
  return { api, "out-dir": outDir };
};

const introspect = async (url: string, token: string): Promise<string> => {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  if (!response.ok) {
    throw new Error(`POST ${url}: ${response.status}`);
  }
  const { data, errors } = (await response.json()) as { data?: IntrospectionQuery; errors?: { message: string }[] };
  if (errors?.length || !data) {
    throw new Error(`POST ${url}: ${(errors ?? []).map((error) => error.message).join("; ") || "no data"}`);
  }
  return `${printSchema(buildClientSchema(data))}\n`;
};

const main = async (): Promise<void> => {
  const { api, "out-dir": outDir } = parseArgs(process.argv.slice(2));
  const token = process.env.TERRAKUBE_TOKEN;
  if (!token) {
    throw new Error("TERRAKUBE_TOKEN must be set; the API answers introspection only for an authenticated caller");
  }
  for (const { path, file } of SCHEMAS) {
    const sdl = await introspect(new URL(path, api).toString(), token);
    const out = resolve(outDir, file);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, sdl);
    console.error(`wrote ${out}`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
