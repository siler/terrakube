import { rowFrom } from "../flatten";
import { fields } from "../../generated/apiPaths";
import type { Row } from "../selection";

const resource = (
  type: string,
  id: string,
  attributes: Record<string, unknown> = {},
  relationships: Record<string, { data?: { id: string } | { id: string }[] | null }> = {}
) => ({ type, id, attributes, relationships });

describe("rowFrom", () => {
  const provider = fields.provider("name", "imported");
  const single = { data: resource("provider", "p1", { name: "aws", imported: false }) };

  it("flattens a single-resource document by the fragment", () => {
    expect(rowFrom(provider, single)).toStrictEqual({ id: "p1", name: "aws", imported: false });
  });

  it("refuses a list document", () => {
    const document = { data: [resource("provider", "p1", { name: "aws" })] };

    expect(() => rowFrom(provider, document)).toThrow("Expected one provider, got a list");
  });

  it("refuses a null-data document", () => {
    expect(() => rowFrom(provider, { data: null })).toThrow("Expected one provider, got null");
  });

  it("joins includes along the fragment like a read does", () => {
    const document = {
      data: resource("provider", "p1", { name: "aws" }, { version: { data: [{ id: "v1" }] } }),
      included: [resource("version", "v1", { versionNumber: "1.0.0" })],
    };

    expect(rowFrom(fields.provider("name", { version: ["versionNumber"] }), document)).toStrictEqual({
      id: "p1",
      name: "aws",
      version: [{ id: "v1", versionNumber: "1.0.0" }],
    });
  });

  it("types the row by the fragment", () => {
    const row: Row<typeof provider> = rowFrom(provider, single);
    const imported: boolean | undefined = row.imported;

    expect([row.id, imported]).toEqual(["p1", false]);
    // @ts-expect-error description was not selected
    expect(row.description).toBeUndefined();
  });
});
