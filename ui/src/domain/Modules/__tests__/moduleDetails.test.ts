import { parseModuleDetails } from "../moduleDetails";

const valid = {
  submodules: ["vpc"],
  variables: [{ name: "cidr", type: "string", description: null, defaultValue: '"10.0.0.0/16"' }],
  outputs: [{ name: "id", description: "The VPC id" }],
  resources: [{ type: "aws_vpc", name: "this" }],
  readme: "# VPC",
};

describe("parseModuleDetails", () => {
  it("accepts the registry's details response", () => {
    expect(parseModuleDetails(valid)).toEqual(valid);
  });

  it("treats omitted nullable fields as null", () => {
    expect(
      parseModuleDetails({ submodules: [], variables: [{ name: "x" }], outputs: [{ name: "y" }], resources: [] })
    ).toEqual({
      submodules: [],
      variables: [{ name: "x", type: null, description: null, defaultValue: null }],
      outputs: [{ name: "y", description: null }],
      resources: [],
      readme: null,
    });
  });

  it.each([
    ["a non-object", "oops"],
    ["a missing list", { ...valid, resources: undefined }],
    ["a non-string submodule", { ...valid, submodules: [1] }],
    ["a variable without a name", { ...valid, variables: [{ type: "string" }] }],
    ["a non-string description", { ...valid, outputs: [{ name: "id", description: 3 }] }],
    ["a resource without a type", { ...valid, resources: [{ name: "this" }] }],
    ["a non-string readme", { ...valid, readme: 42 }],
  ])("rejects %s", (_case, body) => {
    expect(parseModuleDetails(body)).toBeUndefined();
  });
});
