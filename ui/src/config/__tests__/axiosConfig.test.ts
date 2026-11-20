import { mgr } from "../authConfig";
import { getBackendError, setBackendError } from "@/modules/api/backendStatus";
import {
  getAuxiliaryRequestFailureCounts,
  getGlobalBackendErrorActivations,
  resetRequestMetrics,
} from "@/modules/api/requestMetrics";

jest.mock("../authConfig", () => ({
  mgr: { removeUser: jest.fn() },
}));

jest.mock("../authUser", () => ({
  __esModule: true,
  default: jest.fn(() => ({ access_token: "token" })),
}));

const mockRemoveUser = jest.mocked(mgr.removeUser);

const rejectWith =
  (status: number | undefined, extra: Record<string, unknown> = {}) =>
  (config: unknown) =>
    Promise.reject({
      isAxiosError: true,
      config,
      response: status == null ? undefined : { status, data: {}, statusText: "", headers: {}, config },
      toJSON: () => ({}),
      ...extra,
    });

describe("axiosConfig response interceptor", () => {
  beforeEach(() => {
    mockRemoveUser.mockClear();
    setBackendError(null);
    resetRequestMetrics();
  });

  it("signs the user out when a request comes back 401", async () => {
    // Importing after mocks are registered so the interceptors below are wired
    // against the mocked authConfig/authUser modules.
    const { default: axiosInstance } = await import("../axiosConfig");

    axiosInstance.defaults.adapter = () =>
      Promise.reject({
        isAxiosError: true,
        response: { status: 401, data: {}, statusText: "Unauthorized", headers: {}, config: {} },
        config: {},
        toJSON: () => ({}),
      });

    await expect(axiosInstance.get("/organizations")).rejects.toBeTruthy();
    expect(mockRemoveUser).toHaveBeenCalledTimes(1);
  });

  it("does not sign the user out on other error statuses (e.g. 403)", async () => {
    const { default: axiosInstance } = await import("../axiosConfig");

    axiosInstance.defaults.adapter = () =>
      Promise.reject({
        isAxiosError: true,
        response: { status: 403, data: {}, statusText: "Forbidden", headers: {}, config: {} },
        config: {},
        toJSON: () => ({}),
      });

    await expect(axiosInstance.get("/organizations")).rejects.toBeTruthy();
    expect(mockRemoveUser).not.toHaveBeenCalled();
  });

  it("sets global backend-error state on a core 503 and records the activation", async () => {
    const { default: axiosInstance } = await import("../axiosConfig");
    axiosInstance.defaults.adapter = rejectWith(503);

    await expect(axiosInstance.get("/organizations")).rejects.toBeTruthy();

    expect(getBackendError()).toBe(503);
    expect(getGlobalBackendErrorActivations()).toEqual({ core: 1 });
  });
});

describe("axiosAuxiliary client", () => {
  beforeEach(() => {
    mockRemoveUser.mockClear();
    setBackendError(null);
    resetRequestMetrics();
  });

  it.each([404, 429, 500, 502, 503, 504])(
    "keeps a %s failure local - no global backend-error activation",
    async (status) => {
      const { axiosAuxiliary } = await import("../axiosConfig");
      axiosAuxiliary.defaults.adapter = rejectWith(status);

      await expect(axiosAuxiliary.get("/context/v1/1", { auxClass: "context" })).rejects.toBeTruthy();

      expect(getBackendError()).toBeNull();
      expect(getGlobalBackendErrorActivations()).toEqual({});
      expect(getAuxiliaryRequestFailureCounts()).toEqual({ [`context:${status}`]: 1 });
    }
  );

  it("classifies a network error (no response) as network", async () => {
    const { axiosAuxiliary } = await import("../axiosConfig");
    axiosAuxiliary.defaults.adapter = rejectWith(undefined, { message: "Network Error" });

    await expect(axiosAuxiliary.get("/tfoutput/v1/x", { auxClass: "step-log" })).rejects.toBeTruthy();

    expect(getBackendError()).toBeNull();
    expect(getAuxiliaryRequestFailureCounts()).toEqual({ "step-log:network": 1 });
  });

  it("still signs the user out on a 401", async () => {
    const { axiosAuxiliary } = await import("../axiosConfig");
    axiosAuxiliary.defaults.adapter = rejectWith(401);

    await expect(axiosAuxiliary.get("/context/v1/1", { auxClass: "context" })).rejects.toBeTruthy();

    expect(mockRemoveUser).toHaveBeenCalledTimes(1);
    expect(getBackendError()).toBeNull();
  });

  it("still enriches a 403 with a permission message", async () => {
    const { axiosAuxiliary } = await import("../axiosConfig");
    axiosAuxiliary.defaults.adapter = rejectWith(403);

    await expect(axiosAuxiliary.get("/context/v1/1", { auxClass: "context" })).rejects.toMatchObject({
      permissionError: true,
    });
    expect(mockRemoveUser).not.toHaveBeenCalled();
  });

  it("a successful auxiliary response does not clear a genuine global outage", async () => {
    const { axiosAuxiliary } = await import("../axiosConfig");
    setBackendError(503);
    axiosAuxiliary.defaults.adapter = (config) =>
      Promise.resolve({
        data: {},
        status: 200,
        statusText: "OK",
        headers: {},
        config,
      });

    await axiosAuxiliary.get("/context/v1/1", { auxClass: "context" });

    expect(getBackendError()).toBe(503);
  });
});

describe("getErrorMessage", () => {
  const axiosError = (status: number, data: unknown, extra: Record<string, unknown> = {}) => ({
    isAxiosError: true,
    message: `Request failed with status code ${status}`,
    response: { status, data, statusText: "", headers: {}, config: {} },
    ...extra,
  });

  it("prefers the server's JSON:API detail over axios's generic message", async () => {
    const { getErrorMessage } = await import("../axiosConfig");

    expect(getErrorMessage(axiosError(400, { errors: [{ detail: "Team already has access" }] }))).toBe(
      "Team already has access"
    );
  });

  it("falls back to axios's message when the body has no usable detail", async () => {
    const { getErrorMessage } = await import("../axiosConfig");

    expect(getErrorMessage(axiosError(500, { errors: [{ detail: "  " }] }))).toBe(
      "Request failed with status code 500"
    );
    expect(getErrorMessage(axiosError(500, "oops"))).toBe("Request failed with status code 500");
  });

  it("returns the interceptor's permission message on an enriched 403", async () => {
    const { getErrorMessage } = await import("../axiosConfig");

    expect(getErrorMessage(axiosError(403, {}, { permissionError: true, permissionMessage: "No access" }))).toBe(
      "No access"
    );
    expect(getErrorMessage(axiosError(403, {}))).toBe(
      "You do not have the required permissions to perform this action."
    );
  });

  it("returns a non-blank 429 body, otherwise the rate-limit message", async () => {
    const { getErrorMessage } = await import("../axiosConfig");

    expect(getErrorMessage(axiosError(429, "Slow down"))).toBe("Slow down");
    expect(getErrorMessage(axiosError(429, ""))).toMatch(/rate limit/);
  });

  it("reads the message of an ApiError or Error, and a default for anything else", async () => {
    const { getErrorMessage } = await import("../axiosConfig");

    expect(getErrorMessage({ status: "500", statusCode: 500, message: "Backend down" })).toBe("Backend down");
    expect(getErrorMessage(new Error("boom"))).toBe("boom");
    expect(getErrorMessage("boom")).toBe("An unexpected error occurred.");
    expect(getErrorMessage(null)).toBe("An unexpected error occurred.");
  });
});

describe("jsonApiErrorDetail", () => {
  it("returns the first error's detail only when it is a non-blank string", async () => {
    const { jsonApiErrorDetail } = await import("../axiosConfig");

    expect(jsonApiErrorDetail({ errors: [{ detail: "Bad name" }, { detail: "ignored" }] })).toBe("Bad name");
    expect(jsonApiErrorDetail({ errors: [{ detail: 42 }] })).toBeUndefined();
    expect(jsonApiErrorDetail({ errors: [] })).toBeUndefined();
    expect(jsonApiErrorDetail({ errors: "nope" })).toBeUndefined();
    expect(jsonApiErrorDetail("<html>")).toBeUndefined();
    expect(jsonApiErrorDetail(undefined)).toBeUndefined();
  });
});

describe("isPermissionError", () => {
  it("recognises an enriched error or a 403 response", async () => {
    const { isPermissionError } = await import("../axiosConfig");

    expect(isPermissionError({ permissionError: true })).toBe(true);
    expect(isPermissionError({ response: { status: 403 } })).toBe(true);
    expect(isPermissionError({ response: { status: 404 } })).toBe(false);
    expect(isPermissionError(undefined)).toBe(false);
    expect(isPermissionError("403")).toBe(false);
  });
});
