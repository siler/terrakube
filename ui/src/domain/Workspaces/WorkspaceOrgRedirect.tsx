import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { filterFor } from "@/domain/generated/apiPaths";
import { graphql } from "@/domain/generated/graphql";
import { connectionNodes, graphqlRequest } from "@/modules/api/graphqlRequest";
import LoadingFallback from "@/components/feedback/LoadingFallback";
import { ErrorState } from "@/components/feedback/ErrorState";

const ResolveWorkspaceOrganization = graphql(`
  query ResolveWorkspaceOrganization($orgFilter: String!, $wsFilter: String!) {
    organization(filter: $orgFilter) {
      edges {
        node {
          id
          workspace(filter: $wsFilter) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    }
  }
`);

const NOT_FOUND_MESSAGE = "You are not authorized to view this workspace or it does not exist.";

/** Rewrites `/workspaces/<id>/...` to the same path under the workspace's organization. */
export const organizationWorkspacePath = (pathname: string, organizationId: string): string =>
  pathname.replace(/^\/workspaces\//, `/organizations/${organizationId}/workspaces/`);

/** Sends workspace links without an organization to the organization-scoped route for the same page. */
export const WorkspaceOrgRedirect = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) {
      setFailed(true);
      return;
    }
    let current = true;
    graphqlRequest(ResolveWorkspaceOrganization, {
      orgFilter: filterFor("organization", (o) => o.id.notNull()),
      wsFilter: filterFor("workspace", (w) => w.id.eq(id)),
    })
      .then((data) => {
        if (!current) {
          return;
        }
        const organization = connectionNodes(data.organization).find(
          (org) => connectionNodes(org.workspace).length > 0
        );
        if (organization?.id) {
          const path = organizationWorkspacePath(location.pathname, organization.id);
          navigate(`${path}${location.search}${location.hash}`, { replace: true });
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (current) {
          setFailed(true);
        }
      });
    return () => {
      current = false;
    };
  }, [id, location.pathname, location.search, location.hash, navigate]);

  if (failed) {
    return <ErrorState status={403} title="Not Authorized" message={NOT_FOUND_MESSAGE} showHomeLink />;
  }
  return <LoadingFallback />;
};
