import { ResponseShapeError } from "@/modules/api/responseShapeError";
import { parseCreatedToken, parseCurrentTeams, parseTeamTokens, parseUserTokens } from "../parse";

describe("token response parsers", () => {
  it("reads a personal access token, defaulting the nullable fields", () => {
    expect(
      parseUserTokens([
        {
          id: "p1",
          deleted: false,
          days: 30,
          description: null,
          source: "SOMETHING_NEW",
          lastUsedAt: null,
          createdDate: "2026-11-16T00:00:00.000+00:00",
          createdBy: "me",
          updatedDate: null,
        },
      ])
    ).toEqual([
      {
        id: "p1",
        deleted: false,
        days: 30,
        description: "",
        source: undefined,
        lastUsedAt: null,
        createdDate: "2026-11-16T00:00:00.000+00:00",
        createdBy: "me",
        updatedDate: undefined,
        updatedBy: undefined,
      },
    ]);
  });

  it("reads a team token", () => {
    expect(
      parseTeamTokens([{ id: "t1", days: 1, hours: 2, minutes: 3, group: "ops", description: "ci", deleted: false }])
    ).toEqual([expect.objectContaining({ id: "t1", days: 1, hours: 2, minutes: 3, group: "ops", description: "ci" })]);
  });

  it("reads the created token and the current teams", () => {
    expect(parseCreatedToken({ token: "secret" })).toEqual({ token: "secret" });
    expect(parseCurrentTeams({ groups: ["ops", "dev"] })).toEqual({ groups: ["ops", "dev"] });
  });

  it("rejects bodies that are not the endpoint's shape", () => {
    expect(() => parseUserTokens({ data: [] })).toThrow(ResponseShapeError);
    expect(() => parseTeamTokens([{ id: "t1", days: "1" }])).toThrow("Unexpected team token days");
    expect(() => parseCreatedToken("<html></html>")).toThrow("Expected the created token to be an object");
    expect(() => parseCurrentTeams({ groups: [1] })).toThrow("Unexpected current teams");
  });
});
