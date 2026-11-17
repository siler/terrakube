import { AxiosHeaders, type AxiosResponse } from "axios";

/** A complete 200 response carrying `fields`, for mocking axios calls without casting a partial one. */
export const axiosResponse = (fields: Partial<AxiosResponse<unknown>> = {}): AxiosResponse<unknown> => ({
  data: undefined,
  status: 200,
  statusText: "",
  headers: {},
  config: { headers: new AxiosHeaders() },
  ...fields,
});
