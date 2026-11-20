import type { CodegenConfig } from "@graphql-codegen/cli";

// Subscriptions come from a separate server and schema, so their documents are typed by their own target.
const SUBSCRIPTION_DOCUMENTS = "src/hooks/use*JobStatusSubscription.ts";

const config: CodegenConfig = {
  generates: {
    "src/domain/generated/graphql/": {
      schema: "src/domain/generated/graphql/schema.graphql",
      documents: ["src/**/*.{ts,tsx}", "!src/domain/generated/**", `!${SUBSCRIPTION_DOCUMENTS}`],
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: {
        enumsAsTypes: true,
        useTypeImports: true,
        // Elide serializes ids and dates as strings and accepts page arguments as either.
        scalars: {
          DeferredID: "string",
          Date: "string",
          Instant: "string",
          BigInteger: "number",
          StringOrInt: { input: "string | number", output: "string | number" },
        },
      },
    },
    "src/domain/generated/graphql-subscriptions/": {
      schema: "../api/src/main/resources/graphql/subscriptions.graphqls",
      documents: [SUBSCRIPTION_DOCUMENTS],
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: { enumsAsTypes: true, useTypeImports: true },
    },
  },
};

export default config;
