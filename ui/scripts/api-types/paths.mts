#!/usr/bin/env node
// Generates src/domain/generated/apiPaths.ts from API_SCHEMA in the generated apiResources.ts, so it needs no
// OpenAPI document; generate.mts runs it after writing apiResources.ts.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as prettier from "prettier";
import { generatePaths } from "./lib/emitPaths.mts";

const here = dirname(fileURLToPath(import.meta.url));

export const writePaths = async (out: string): Promise<void> => {
  const { API_SCHEMA } = await import("../../src/domain/generated/apiResources.ts");
  const options = (await prettier.resolveConfig(out)) ?? {};
  writeFileSync(out, await prettier.format(generatePaths(API_SCHEMA), { ...options, filepath: out }));
  console.error(`wrote ${out}`);
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writePaths(resolve(here, "../../src/domain/generated/apiPaths.ts")).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
