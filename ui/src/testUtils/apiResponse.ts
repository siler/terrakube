import type { ApiFailure, ApiResponse } from "@/modules/api/types";

/** Returns the data of a successful response, failing the test with the error otherwise. */
export const successData = <T>(response: ApiResponse<T>): T => {
  if (response.isError) {
    throw new Error(`Expected a successful response, got ${JSON.stringify(response)}`);
  }
  return response.data;
};

/** Returns a failed response, failing the test if the call succeeded. */
export const failure = <T>(response: ApiResponse<T>): ApiFailure => {
  if (!response.isError) {
    throw new Error(`Expected a failed response, got ${JSON.stringify(response)}`);
  }
  return response;
};
