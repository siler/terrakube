import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { filterFor } from "@/domain/generated/apiPaths";
import { graphql } from "@/domain/generated/graphql";
import { connectionNodes, graphqlRequest } from "@/modules/api/graphqlRequest";
import LoadingFallback from "@/components/feedback/LoadingFallback";
import { ErrorState } from "@/components/feedback/ErrorState";

const ResolveRun = graphql(`
  query ResolveRun($orgFilter: String!, $wsFilter: String!, $jobFilter: String!) {
    organization(filter: $orgFilter) {
      edges {
        node {
          id
          workspace(filter: $wsFilter) {
            edges {
              node {
                id
                job(filter: $jobFilter) {
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
      }
    }
  }
`);

const UNAUTHORIZED_MESSAGE = "You are not authorized to view this run or the workspace does not exist.";

export const RunRedirectRoute = () => {
  const { orgName, wsName, runid } = useParams<{ orgName: string; wsName: string; runid: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function resolveAndRedirect() {
      if (!orgName || !wsName || !runid) {
        setError(UNAUTHORIZED_MESSAGE);
        return;
      }

      const cleanRunId = runid.replace(/^run-/, "");

      try {
        const data = await graphqlRequest(ResolveRun, {
          orgFilter: filterFor("organization", (o) => o.name.eq(orgName)),
          wsFilter: filterFor("workspace", (w) => w.name.eq(wsName)),
          jobFilter: filterFor("job", (j) => j.id.eq(cleanRunId)),
        });

        if (!isMounted) return;

        const orgNode = connectionNodes(data.organization)[0];
        const wsNode = connectionNodes(orgNode?.workspace)[0];
        const jobNode = connectionNodes(wsNode?.job)[0];

        if (orgNode?.id && wsNode?.id && jobNode?.id) {
          navigate(`/organizations/${orgNode.id}/workspaces/${wsNode.id}/runs/${cleanRunId}`, { replace: true });
        } else {
          setError(UNAUTHORIZED_MESSAGE);
        }
      } catch {
        if (!isMounted) return;
        setError(UNAUTHORIZED_MESSAGE);
      }
    }

    resolveAndRedirect();

    return () => {
      isMounted = false;
    };
  }, [orgName, wsName, runid, navigate]);

  if (error) {
    return <ErrorState status={403} title="Not Authorized" message={error} showHomeLink />;
  }

  return <LoadingFallback />;
};
