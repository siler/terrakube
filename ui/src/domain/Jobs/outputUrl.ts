import { apiPrefix, getPublicApiOrigin } from "@/config/apiUrls";

export { getPublicApiOrigin };

// The API records log and state URLs with the host it was configured with, which the browser may not reach.
const API_FILE_PATHS = ["/tfoutput/", "/tfstate/"];

/**
 * Points a log or state URL the API stored at the API origin this UI talks to, leaving other storage URLs alone.
 * Relative paths resolve against that origin.
 */
export function getApiRequestUrl(output: string): string {
  const publicApiOrigin = getPublicApiOrigin();

  try {
    const outputUrl = new URL(output);

    if (outputUrl.origin === publicApiOrigin) {
      return outputUrl.toString();
    }

    if (API_FILE_PATHS.some((path) => outputUrl.pathname.startsWith(path))) {
      return `${publicApiOrigin}${apiPrefix()}${outputUrl.pathname}${outputUrl.search}${outputUrl.hash}`;
    }

    return output;
  } catch {
    return new URL(output, publicApiOrigin).toString();
  }
}

export function isTerrakubeApiUrl(url: string): boolean {
  const publicApiOrigin = getPublicApiOrigin();

  try {
    const resolvedUrl = new URL(url, publicApiOrigin);
    return resolvedUrl.origin === publicApiOrigin;
  } catch {
    return false;
  }
}
