import { mgr } from "@/config/authConfig";
import { apiDelete, apiGet, apiGraphQL, apiPost } from "../apiWrapper";
import { GraphQLRequestError } from "../graphqlRequest";
import { ResponseShapeError } from "../responseShapeError";
import { failure } from "@/testUtils/apiResponse";

const mockedAxios = jest.fn<Promise<unknown>, [Record<string, unknown>]>();

jest.mock("axios", () => ({
  __esModule: true,
  default: Object.assign((config: Record<string, unknown>) => mockedAxios(config), { isAxiosError: () => true }),
}));

jest.mock("@/config/axiosConfig", () => ({ axiosGraphQL: { post: jest.fn() } }));

jest.mock("@/config/authConfig", () => ({
  mgr: { removeUser: jest.fn() },
}));

jest.mock("@/config/authUser", () => ({
  __esModule: true,
  default: jest.fn(() => ({ access_token: "token" })),
}));

const mockRemoveUser = jest.mocked(mgr.removeUser);

const asIs = (body: unknown) => body;

describe("apiWrapper GraphQL responses", () => {
  it("reports GraphQL errors returned with HTTP 200", async () => {
    mockedAxios.mockResolvedValueOnce({
      status: 200,
      data: { errors: [{ message: "Filter of type workspace is not StringValue." }] },
    });
    const result = await apiPost(
      "/graphql/api/v1",
      { query: "query WorkspacePage { organization { edges { node { name } } } }" },
      asIs,
      { dataWrapped: true }
    );
    expect(result.isError).toBe(true);
    expect(failure(result).error?.message).toBe("Filter of type workspace is not StringValue.");
    expect(result).not.toHaveProperty("data");
  });

  it("unwraps successful GraphQL responses", async () => {
    const data = { organization: { edges: [] } };
    mockedAxios.mockResolvedValueOnce({ status: 200, data: { data } });
    const result = await apiPost(
      "/graphql/api/v1",
      { query: "query WorkspacePage { organization { edges { node { name } } } }" },
      asIs,
      { dataWrapped: true }
    );
    expect(result).toEqual({ isError: false, responseCode: 200, data });
  });
});

describe("apiWrapper request shaping", () => {
  beforeEach(() => {
    mockedAxios.mockReset();
  });

  it("keeps the default content type when options only set other fields", async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: [] });

    await apiGet("/organizations", asIs, { query: { page: 1 } });

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "Content-type": "application/vnd.api+json", Authorization: "Bearer token" },
        params: { page: 1 },
      })
    );
  });

  it("skips the token when requireAuth is false", async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: "ok" });

    await expect(apiGet("/health", asIs, { requireAuth: false })).resolves.toEqual({
      isError: false,
      responseCode: 200,
      data: "ok",
    });
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { "Content-type": "application/vnd.api+json" } })
    );
  });

  it("yields undefined data when a wrapped response body is not an object", async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: "<html></html>" });

    await expect(apiGet("/graphql/api/v1", asIs, { dataWrapped: true })).resolves.toEqual({
      isError: false,
      responseCode: 200,
      data: undefined,
    });
  });

  it("joins GraphQL error messages, leaving entries without one blank", async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: { errors: [{ message: "first" }, {}, "x"] } });

    const result = await apiPost("/graphql/api/v1", {}, asIs, { dataWrapped: true });

    expect(failure(result).error?.message).toBe("first\n\n");
  });

  it("treats an empty GraphQL errors array as success", async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: { errors: [], data: { ok: true } } });

    await expect(apiPost("/graphql/api/v1", {}, asIs, { dataWrapped: true })).resolves.toEqual({
      isError: false,
      responseCode: 200,
      data: { ok: true },
    });
  });

  it("reports a body its parser rejects as an error", async () => {
    mockedAxios.mockResolvedValueOnce({ status: 200, data: { tokens: [] } });
    const reject = () => {
      throw new ResponseShapeError("Unexpected token list");
    };

    await expect(apiGet("/pat/v1", reject)).resolves.toEqual({
      isError: true,
      responseCode: 200,
      error: { status: "Unexpected response", message: "Unexpected token list" },
    });
  });

  it("returns no data from deletes", async () => {
    mockedAxios.mockResolvedValueOnce({ status: 204, data: "" });

    await expect(apiDelete("/pat/v1/t1")).resolves.toEqual({ isError: false, responseCode: 204, data: undefined });
  });
});

describe("apiWrapper 401 handling", () => {
  beforeEach(() => {
    mockedAxios.mockReset();
    mockRemoveUser.mockClear();
  });

  it("signs the user out and returns a friendly message when the API rejects the token with 401", async () => {
    mockedAxios.mockRejectedValue({
      response: { status: 401, data: {}, statusText: "Unauthorized" },
    });

    const result = await apiGet("/organizations", asIs);

    expect(mockRemoveUser).toHaveBeenCalledTimes(1);
    expect(result.isError).toBe(true);
    expect(result.responseCode).toBe(401);
  });

  it("does not sign the user out on unrelated errors (e.g. 403)", async () => {
    mockedAxios.mockRejectedValue({
      response: { status: 403, data: {}, statusText: "Forbidden" },
    });

    const result = await apiGet("/organizations", asIs);

    expect(mockRemoveUser).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    expect(result.responseCode).toBe(403);
  });
});

describe("apiGraphQL", () => {
  it("wraps a resolved read", async () => {
    expect(await apiGraphQL(() => Promise.resolve(["project-1"]))).toEqual({
      isError: false,
      responseCode: 200,
      data: ["project-1"],
    });
  });

  it("reports GraphQL errors the way apiPost does", async () => {
    const result = await apiGraphQL(() => Promise.reject(new GraphQLRequestError(["Forbidden field"])));

    expect(result.isError).toBe(true);
    expect(failure(result).error).toEqual({ status: "GraphQL request failed", message: "Forbidden field" });
  });

  it("reports HTTP failures the way apiPost does", async () => {
    const result = await apiGraphQL(() => Promise.reject({ response: { status: 403, data: {} } }));

    expect(result).toEqual(expect.objectContaining({ isError: true, responseCode: 403 }));
    expect(failure(result).error?.status).toBe("Forbidden");
  });
});
