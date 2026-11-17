import { axiosAuxiliary, axiosClient } from "../../config/axiosConfig";
import { apiUrl } from "@/config/apiUrls";
import { isRecord } from "@/modules/utils/typeGuards";
import { getApiRequestUrl, isTerrakubeApiUrl } from "./outputUrl";

/** Objects at or above this size are fetched tail-first via a Range request. */
export const LARGE_LOG_THRESHOLD = 2 * 1024 * 1024;

export class StepLogNotFoundError extends Error {
  constructor() {
    super("Step log not found");
    this.name = "StepLogNotFoundError";
  }
}

export class StepLogFetchError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "StepLogFetchError";
    this.status = status;
  }
}

type FetchStepLogParams = {
  output?: string;
  jobId: string;
  organizationId: string;
  stepId: string;
  signal: AbortSignal;
  tailBytes?: number;
};

type FetchStepLogResult = {
  text: string;
  truncated: boolean;
  /** The step ended without its own saved output: this is only what was archived while it ran. */
  incomplete: boolean;
};

/** Set by the API when the log is only the parts archived while the step ran. */
export const OUTPUT_INCOMPLETE_HEADER = "x-terrakube-output-incomplete";

function resolveUrl(params: FetchStepLogParams): { url: string; terrakubeApi: boolean } {
  if (params.output != null && params.output !== "") {
    const url = getApiRequestUrl(params.output);
    return { url, terrakubeApi: isTerrakubeApiUrl(url) };
  }
  const url =
    `${apiUrl("")}/tfoutput/v1/organization/${params.organizationId}` + `/job/${params.jobId}/step/${params.stepId}`;
  return { url, terrakubeApi: true };
}

// Cap concurrent archived-log fetches so expanding a 30-step job doesn't fire 30 requests at once
// (each is a synchronous storage read server-side).
const MAX_CONCURRENT_FETCHES = 3;
let inFlight = 0;
const waiters: Array<() => void> = [];

function acquireSlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT_FETCHES) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waiters.push(resolve));
}

function releaseSlot(): void {
  const next = waiters.shift();
  if (next) {
    next();
  } else {
    inFlight = Math.max(0, inFlight - 1);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "CanceledError");
}

function statusOf(error: unknown): number | undefined {
  if (!isRecord(error) || !isRecord(error.response)) {
    return undefined;
  }
  const { status } = error.response;
  return typeof status === "number" ? status : undefined;
}

// Keeps the raw body: logs are plain text and must not go through axios's JSON parsing.
const keepRawBody = (data: unknown): unknown => data;

export async function fetchStepLog(params: FetchStepLogParams): Promise<FetchStepLogResult> {
  await acquireSlot();
  try {
    return await fetchStepLogInner(params);
  } finally {
    releaseSlot();
  }
}

async function fetchStepLogInner(params: FetchStepLogParams): Promise<FetchStepLogResult> {
  const { url, terrakubeApi } = resolveUrl(params);
  // Archived step logs are auxiliary Job Details data: a transient storage failure must stay local
  // to the step, never the application-wide backend-error screen.
  const client = terrakubeApi ? axiosAuxiliary : axiosClient;

  let contentLength: number | undefined;
  try {
    const head = await client.head(url, { signal: params.signal, auxClass: "step-log" });
    const raw = head.headers?.["content-length"];
    contentLength = raw != null ? Number(raw) : undefined;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (statusOf(error) === 404) {
      throw new StepLogNotFoundError();
    }
    // Some backends / proxies reject HEAD - fall through to a plain GET.
    contentLength = undefined;
  }

  const wantsTail = params.tailBytes != null && contentLength != null && contentLength >= LARGE_LOG_THRESHOLD;

  try {
    const response = wantsTail
      ? await client.get<unknown>(url, {
          signal: params.signal,
          headers: { Range: `bytes=-${params.tailBytes}` },
          responseType: "text",
          transformResponse: keepRawBody,
          auxClass: "step-log",
        })
      : await client.get<unknown>(url, {
          signal: params.signal,
          responseType: "text",
          transformResponse: keepRawBody,
          auxClass: "step-log",
        });

    const text = typeof response.data === "string" ? response.data : String(response.data ?? "");
    const rawContentRange: unknown = response.headers?.["content-range"];
    const contentRange = typeof rawContentRange === "string" ? rawContentRange : undefined;
    const truncated = response.status === 206 && contentRange != null && !/^bytes 0-/.test(contentRange);

    const incomplete = String(response.headers?.[OUTPUT_INCOMPLETE_HEADER] ?? "").toLowerCase() === "true";

    return { text, truncated, incomplete };
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    if (statusOf(error) === 404) {
      throw new StepLogNotFoundError();
    }
    throw new StepLogFetchError(`Step log request failed`, statusOf(error));
  }
}
