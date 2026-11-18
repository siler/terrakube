import { graphql } from "@/domain/generated/graphql";
import type { OrganizationSummariesQuery } from "@/domain/generated/graphql/graphql";
import { ConnectionNode, connectionNodes, graphqlRequest } from "@/modules/api/graphqlRequest";
import { WorkspaceStatusFilter } from "@/modules/workspaces/utils/workspaceFilter";
import { isOrgId } from "@/config/orgId";

const OrganizationSummaries = graphql(`
  query OrganizationSummaries {
    organization {
      edges {
        node {
          id
          name
          description
          executionMode
          icon
        }
      }
    }
  }
`);

const OrganizationWorkspaceCounts = graphql(`
  query OrganizationWorkspaceCounts {
    organization {
      edges {
        node {
          id
          workspace {
            edges {
              node {
                id
                lastJobStatus
              }
            }
          }
        }
      }
    }
  }
`);

const OrganizationName = graphql(`
  query OrganizationName($ids: [String]) {
    organization(ids: $ids) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
`);

const OrganizationTags = graphql(`
  query OrganizationTags($ids: [String]) {
    organization(ids: $ids) {
      edges {
        node {
          tag {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    }
  }
`);

const toOrganizationSummary = (node: ConnectionNode<OrganizationSummariesQuery["organization"]>) => ({
  id: node.id ?? "",
  name: node.name ?? "",
  description: node.description ?? undefined,
  executionMode: node.executionMode ?? undefined,
  icon: node.icon ?? undefined,
});

/** An organization as the picker and sidebar list it. */
export type OrganizationSummary = ReturnType<typeof toOrganizationSummary>;

const countByStatus = (workspaces: { lastJobStatus?: string | null }[]) => {
  const counts: Record<string, number> = {};
  for (const { lastJobStatus } of workspaces) {
    const status = lastJobStatus || WorkspaceStatusFilter.NeverExecuted;
    counts[status] = (counts[status] || 0) + 1;
  }
  return { workspaceCount: workspaces.length, workspaceStatusCounts: counts };
};

/** Workspace totals of an organization, keyed by its id in {@link listOrganizationWorkspaceCounts}. */
export type OrganizationWorkspaceCounts = ReturnType<typeof countByStatus>;

async function listOrganizationSummaries(): Promise<OrganizationSummary[]> {
  const data = await graphqlRequest(OrganizationSummaries, {});
  return connectionNodes(data.organization).map(toOrganizationSummary);
}

// Listing every workspace is what makes this slow, so only the picker, which shows the totals, asks for it.
async function listOrganizationWorkspaceCounts(): Promise<Record<string, OrganizationWorkspaceCounts>> {
  const data = await graphqlRequest(OrganizationWorkspaceCounts, {});
  return Object.fromEntries(
    connectionNodes(data.organization).map((node) => [node.id ?? "", countByStatus(connectionNodes(node.workspace))])
  );
}

async function getOrganizationNameGraphQL(orgId: string): Promise<string | null> {
  if (!isOrgId(orgId)) {
    return null;
  }
  const data = await graphqlRequest(OrganizationName, { ids: [orgId] });
  return connectionNodes(data.organization)[0]?.name ?? null;
}

async function listOrganizationTags(organizationId: string) {
  const data = await graphqlRequest(OrganizationTags, { ids: [organizationId] });
  return connectionNodes(connectionNodes(data.organization)[0]?.tag).map((tag) => ({
    id: tag.id ?? "",
    name: tag.name ?? "",
  }));
}

/** An organization tag as the workspace filter, cards, table and tag editor use it. */
export type TagModel = Awaited<ReturnType<typeof listOrganizationTags>>[number];

const methods = {
  listOrganizationSummaries,
  listOrganizationWorkspaceCounts,
  getOrganizationNameGraphQL,
  listOrganizationTags,
};

export default methods;
