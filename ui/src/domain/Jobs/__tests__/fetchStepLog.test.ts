import { fetchStepLog, StepLogFetchError, StepLogNotFoundError } from "../fetchStepLog";

jest.mock("../../../config/axiosConfig", () => ({
  __esModule: true,
  default: { get: jest.fn(), head: jest.fn() },
  axiosClient: { get: jest.fn(), head: jest.fn() },
  axiosAuxiliary: { get: jest.fn(), head: jest.fn() },
}));

jest.mock("../outputUrl", () => ({
  getApiRequestUrl: (o: string) => o,
  getPublicApiOrigin: () => "https://api.example.com",
  isTerrakubeApiUrl: () => true,
}));

import { axiosAuxiliary } from "../../../config/axiosConfig";
import { axiosResponse } from "@/testUtils/fakeAxiosResponse";

const ac = () => new AbortController().signal;

const head = jest.mocked(axiosAuxiliary.head);
const get = jest.mocked(axiosAuxiliary.get);

const base = {
  output: "https://api.example.com/tfoutput/v1/organization/o/job/j/step/s",
  jobId: "j",
  organizationId: "o",
  stepId: "s",
};

describe("fetchStepLog", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns the body for a small completed-step log", async () => {
    head.mockResolvedValue(axiosResponse({ headers: { "content-length": "12" } }));
    get.mockResolvedValue(axiosResponse({ status: 200, data: "hello world!", headers: {} }));

    const result = await fetchStepLog({ ...base, signal: ac() });

    expect(result).toEqual({ text: "hello world!", truncated: false, incomplete: false });
  });

  it("flags a log that is only what was archived before the step ended", async () => {
    head.mockResolvedValue(axiosResponse({ headers: { "content-length": "7" } }));
    get.mockResolvedValue(
      axiosResponse({
        status: 200,
        data: "partial",
        headers: { "x-terrakube-output-incomplete": "true" },
      })
    );

    const result = await fetchStepLog({ ...base, signal: ac() });

    expect(result).toEqual({ text: "partial", truncated: false, incomplete: true });
  });

  it("does not flag a log when the header is anything but true", async () => {
    head.mockResolvedValue(axiosResponse({ headers: { "content-length": "4" } }));
    get.mockResolvedValue(
      axiosResponse({
        status: 200,
        data: "done",
        headers: { "x-terrakube-output-incomplete": "false" },
      })
    );

    const result = await fetchStepLog({ ...base, signal: ac() });

    expect(result.incomplete).toBe(false);
  });

  it("tails a large log with a Range request and marks it truncated", async () => {
    head.mockResolvedValue(
      axiosResponse({
        headers: { "content-length": String(5 * 1024 * 1024) },
      })
    );
    get.mockResolvedValue(
      axiosResponse({
        status: 206,
        data: "...tail...",
        headers: { "content-range": "bytes 5000000-5242879/5242880" },
      })
    );

    const result = await fetchStepLog({ ...base, signal: ac(), tailBytes: 262144 });

    expect(result.truncated).toBe(true);
    expect(get.mock.calls[0][1]).toMatchObject({ headers: { Range: "bytes=-262144" } });
  });

  it("does not tail when the object is under the threshold", async () => {
    head.mockResolvedValue(axiosResponse({ headers: { "content-length": "1024" } }));
    get.mockResolvedValue(axiosResponse({ status: 200, data: "small", headers: {} }));

    await fetchStepLog({ ...base, signal: ac(), tailBytes: 262144 });

    expect(get.mock.calls[0][1]?.headers).toBeUndefined();
  });

  it("throws StepLogNotFoundError on 404", async () => {
    head.mockRejectedValue({ response: { status: 404 } });

    await expect(fetchStepLog({ ...base, signal: ac() })).rejects.toBeInstanceOf(StepLogNotFoundError);
  });

  it("throws StepLogFetchError with status on 502", async () => {
    head.mockResolvedValue(axiosResponse({ headers: {} }));
    get.mockRejectedValue({ response: { status: 502 } });

    const result = fetchStepLog({ ...base, signal: ac() });

    await expect(result).rejects.toBeInstanceOf(StepLogFetchError);
    await expect(result).rejects.toMatchObject({ status: 502 });
  });

  it("falls through to GET when HEAD is rejected with a non-404", async () => {
    head.mockRejectedValue({ response: { status: 405 } });
    get.mockResolvedValue(axiosResponse({ status: 200, data: "body", headers: {} }));

    const result = await fetchStepLog({ ...base, signal: ac() });

    expect(result.text).toBe("body");
  });
});
