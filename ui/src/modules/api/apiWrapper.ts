import axios from "axios";
import { mgr } from "../../config/authConfig";
import { apiUrl } from "../../config/apiUrls";
import getUserFromStorage from "../../config/authUser";
import { ApiError, ApiResponse, RequestOptions } from "./types";
import { ResponseShapeError } from "./responseShapeError";
import { isRecord } from "../utils/typeGuards";

const BASE_API_URL = apiUrl("");
const sendCookiesWithRequests = window._env_.REACT_APP_TERRAKUBE_SEND_COOKIES?.trim().toLowerCase() === "true";

type ResolvedRequestOptions = Omit<RequestOptions, "requireAuth" | "contentType"> & {
  requireAuth: boolean;
  contentType: string;
};

const defaultRequestOptions: ResolvedRequestOptions = {
  requireAuth: true,
  contentType: "application/vnd.api+json",
};

function getOptions(options?: RequestOptions): ResolvedRequestOptions {
  if (options === undefined) {
    return defaultRequestOptions;
  }
  return {
    ...options,
    requireAuth: options.requireAuth ?? defaultRequestOptions.requireAuth,
    contentType: options.contentType ?? defaultRequestOptions.contentType,
  };
}

/** Unwraps `{ data }` when the endpoint wraps its payload, as GraphQL does. */
const responseBody = (body: unknown, dataWrapped: boolean | undefined): unknown => {
  if (!dataWrapped) {
    return body;
  }
  return isRecord(body) ? body.data : undefined;
};

/** Joins the messages of a GraphQL `errors` array, or undefined when the body carries no errors. */
const graphQLErrorMessage = (body: unknown): string | undefined => {
  if (!isRecord(body) || !Array.isArray(body.errors) || body.errors.length === 0) {
    return undefined;
  }
  const errors: unknown[] = body.errors;
  return errors.map((error) => (isRecord(error) && typeof error.message === "string" ? error.message : "")).join("\n");
};

// Spring's default error body has a numeric status, so it falls back to the HTTP status text.
const isApiError = (value: unknown): value is ApiError =>
  typeof value === "object" &&
  value !== null &&
  ("status" in value || "message" in value) &&
  (!("status" in value) || typeof value.status === "string") &&
  (!("message" in value) || typeof value.message === "string");

async function requestWrapper<T>(
  requireAuth: boolean = true,
  requestFunc: (accessToken?: string) => Promise<ApiResponse<T>>
): Promise<ApiResponse<T>> {
  try {
    if (requireAuth) {
      const tokenModel = getUserFromStorage();
      if (tokenModel?.access_token === undefined || tokenModel?.access_token === null) {
        return {
          isError: true,
          error: {
            status: "Unauthorized",
            statusCode: 401,
          },
          responseCode: 404,
        };
      }
      return await requestFunc(tokenModel.access_token);
    }
    return await requestFunc();
  } catch (error) {
    if (error instanceof ResponseShapeError) {
      return {
        isError: true,
        error: { status: "Unexpected response", message: error.message },
        responseCode: 200,
      };
    }
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        // Token rejected by the API - sign out so the user lands back on Login.
        mgr.removeUser();
        return {
          isError: true,
          error: {
            status: "Unauthorized",
            statusCode: 401,
            message: "Your session has expired. Please sign in again.",
          },
          responseCode: 401,
        };
      }

      if (error.response?.status === 404) {
        return {
          isError: true,
          error: {
            status: "Not Found",
            statusCode: 404,
            message: "The requested resource could not be found",
          },
          responseCode: 404,
        };
      }

      if (error.response?.status === 403) {
        return {
          isError: true,
          error: {
            status: "Forbidden",
            statusCode: 403,
            message:
              "You do not have the required permissions to perform this action. Please contact your organization administrator.",
          },
          responseCode: 403,
        };
      }

      const responseCode = error.response?.status || 500;
      const body: unknown = error.response?.data;
      return {
        isError: true,
        error: isApiError(body)
          ? body
          : {
              statusCode: responseCode,
              message: error.response?.statusText || "Failed to request",
              status: error.response?.statusText || "Internal server error",
            },
        responseCode,
      };
    } else {
      return {
        isError: true,
        responseCode: 500,
      };
    }
  }
}

/** Reads a response body into the caller's type, throwing {@link ResponseShapeError} when it does not fit. */
export type ParseBody<T> = (body: unknown) => T;

export async function apiPost<TRequest, TResponse>(
  path: string,
  body: TRequest,
  parse: ParseBody<TResponse>,
  options?: RequestOptions
): Promise<ApiResponse<TResponse>> {
  return await post(`${BASE_API_URL}${path}`, body, parse, getOptions(options));
}

export async function apiPut<TRequest, TResponse>(
  path: string,
  body: TRequest,
  parse: ParseBody<TResponse>,
  options?: RequestOptions
): Promise<ApiResponse<TResponse>> {
  return await put(`${BASE_API_URL}${path}`, body, parse, getOptions(options));
}
export async function apiGet<T>(path: string, parse: ParseBody<T>, options?: RequestOptions): Promise<ApiResponse<T>> {
  return await get(`${BASE_API_URL}${path}`, parse, getOptions(options));
}

export async function apiDelete(path: string, options?: RequestOptions): Promise<ApiResponse<undefined>> {
  return await intDelete(`${BASE_API_URL}${path}`, getOptions(options));
}

async function get<T>(path: string, parse: ParseBody<T>, options: ResolvedRequestOptions): Promise<ApiResponse<T>> {
  return await requestWrapper(options.requireAuth, async (accessToken?: string) => {
    const headers: Record<string, string> = {
      "Content-type": options.contentType,
    };

    if (options.requireAuth) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await axios<unknown>({
      method: "GET",
      url: path,
      headers: headers,
      params: options.query,
      withCredentials: sendCookiesWithRequests,
    });
    return {
      isError: false,
      data: parse(responseBody(response.data, options.dataWrapped)),
      responseCode: response.status,
    };
  });
}

async function post<TRequest, TResponse>(
  path: string,
  body: TRequest,
  parse: ParseBody<TResponse>,
  options: ResolvedRequestOptions
): Promise<ApiResponse<TResponse>> {
  return await requestWrapper(options.requireAuth, async (accessToken?: string) => {
    const headers: Record<string, string> = {
      "Content-type": options.contentType,
    };

    if (options.requireAuth) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const response = await axios<unknown>({
      method: "POST",
      url: path,
      headers: headers,
      data: body,
      params: options.query,
      withCredentials: sendCookiesWithRequests,
    });

    const errorMessage = options.dataWrapped ? graphQLErrorMessage(response.data) : undefined;
    if (errorMessage !== undefined) {
      return {
        isError: true,
        error: {
          status: "GraphQL request failed",
          message: errorMessage,
        },
        responseCode: response.status,
      };
    }

    return {
      isError: false,
      data: parse(responseBody(response.data, options.dataWrapped)),
      responseCode: response.status,
    };
  });
}
async function put<TRequest, TResponse>(
  path: string,
  body: TRequest,
  parse: ParseBody<TResponse>,
  options: ResolvedRequestOptions
): Promise<ApiResponse<TResponse>> {
  return await requestWrapper(options.requireAuth, async (accessToken?: string) => {
    const headers: Record<string, string> = {
      "Content-type": options.contentType,
    };

    if (options.requireAuth) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }
    const response = await axios<unknown>({
      method: "PUT",
      url: path,
      headers: headers,
      data: body,
      params: options.query,
      withCredentials: sendCookiesWithRequests,
    });
    return {
      isError: false,
      data: parse(responseBody(response.data, options.dataWrapped)),
      responseCode: response.status,
    };
  });
}
async function intDelete(path: string, options: ResolvedRequestOptions): Promise<ApiResponse<undefined>> {
  return await requestWrapper(options.requireAuth, async (accessToken?: string) => {
    const headers: Record<string, string> = {
      "Content-type": options.contentType,
    };

    if (options.requireAuth) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await axios<unknown>({
      method: "DELETE",
      url: path,
      headers: headers,
      params: options.query,
      withCredentials: sendCookiesWithRequests,
    });
    return {
      isError: false,
      data: undefined,
      responseCode: response.status,
    };
  });
}
