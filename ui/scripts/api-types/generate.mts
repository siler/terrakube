#!/usr/bin/env node
// Generates the UI's JSON:API resource types and field lists from the API's OpenAPI document (`/doc`), its
// JPA entities and its Liquibase changelogs. The OpenAPI document Elide builds names every field, type and
// relationship target but types every relationship as to-many, every date as an object, and nothing as
// nullable; the entity sources and changelog column constraints fill those gaps.
//
//   node scripts/api-types/generate.mts --spec /tmp/doc.json [--entities ../api/src/main/java]
//     [--changelog ../api/src/main/resources/db/changelog] [--out <file>]
//
// The spec may be a file or an http(s) URL; TERRAKUBE_TOKEN is sent as a bearer token when set.
// Parsing lives in lib/java.mts and lib/liquibase.mts, emission in lib/emit.mts; this CLI only loads inputs
// and writes the output.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as prettier from "prettier";
import { generate } from "./lib/emit.mts";
import { parseJava, type Spec } from "./lib/java.mts";
import { notNullFacts, parseChangelog } from "./lib/liquibase.mts";
import { writePaths } from "./paths.mts";

const here = dirname(fileURLToPath(import.meta.url));

const loadSpec = async (spec: string): Promise<Spec> => {
  if (/^https?:\/\//.test(spec)) {
    const token = process.env.TERRAKUBE_TOKEN;
    const response = await fetch(spec, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) {
      throw new Error(`GET ${spec}: ${response.status}`);
    }
    return (await response.json()) as Spec;
  }
  return JSON.parse(readFileSync(spec, "utf8")) as Spec;
};

const main = async (): Promise<void> => {
  const { values: args } = parseArgs({
    options: {
      spec: { type: "string" },
      entities: { type: "string", default: resolve(here, "../../../api/src/main/java") },
      changelog: { type: "string", default: resolve(here, "../../../api/src/main/resources/db/changelog") },
      out: { type: "string", default: resolve(here, "../../src/domain/generated/apiResources.ts") },
    },
  });
  if (!args.spec) {
    throw new Error("usage: generate.mts --spec <file|url> [--entities <dir>] [--changelog <dir>] [--out <file>]");
  }
  const changelogProblems: string[] = [];
  const changelog = parseChangelog(resolve(args.changelog, "changelog.xml"), changelogProblems);
  const classes = parseJava(args.entities);
  const { source, problems } = generate(await loadSpec(args.spec), classes, notNullFacts(classes, changelog));
  const options = (await prettier.resolveConfig(args.out)) ?? {};
  writeFileSync(args.out, await prettier.format(source, { ...options, filepath: args.out }));
  console.error(`wrote ${args.out}`);
  await writePaths(resolve(dirname(args.out), "apiPaths.ts"));
  for (const problem of [...changelogProblems, ...problems]) {
    console.error(`warning: ${problem}`);
  }
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
