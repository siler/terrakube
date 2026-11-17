export type ApiError = {
  status?: string;
  statusCode?: number;
  message?: string;
};

type ApiResponseMeta = {
  responseCode: number;
  originResponseCode?: number;
};

export type ApiSuccess<T> = ApiResponseMeta & {
  isError: false;
  data: T;
};

export type ApiFailure = ApiResponseMeta & {
  isError: true;
  error?: ApiError;
};

/** Result of an API call; narrow on `isError` to reach `data` or `error`. */
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type QueryParams = { [key: string]: string | boolean | number };
export type RequestOptions = {
  query?: QueryParams;
  requireAuth?: boolean;
  dataWrapped?: boolean;
  contentType?: string;
};
export type ErrorInformation = {
  title: string;
  message?: string;
};
