import formatSshUrl from "@/modules/workspaces/utils/formatSshUrl";
import { VcsTypeOrUnknown } from "../../../domain/types";

export default function (normalizedSource: string): VcsTypeOrUnknown {
  const githubEndpoints = ["github.com", "ghe.com"];
  const devOpsEndpints = ["visualstudio.com", "dev.azure.com"];
  const gitlabEndpoints = ["gitlab.com"];
  const bitbucketEndpoints = ["bitbucket.org"];
  // Let's just be safe in case the wrong url was passed
  const fixedUrl = formatSshUrl(normalizedSource);
  let hostname: string;
  try {
    hostname = new URL(fixedUrl).hostname;
  } catch {
    return VcsTypeOrUnknown.UNKNOWN;
  }
  // ghe.com uses subdomain
  if (githubEndpoints.includes(hostname) || githubEndpoints.some((h) => hostname.endsWith(h)))
    return VcsTypeOrUnknown.GITHUB;
  // visualstudio.com uses subdomin
  if (devOpsEndpints.includes(hostname) || devOpsEndpints.some((h) => hostname.endsWith(h)))
    return VcsTypeOrUnknown.AZURE_DEVOPS;
  if (gitlabEndpoints.includes(hostname)) return VcsTypeOrUnknown.GITLAB;
  if (bitbucketEndpoints.includes(hostname)) return VcsTypeOrUnknown.BITBUCKET;
  return VcsTypeOrUnknown.UNKNOWN;
}
