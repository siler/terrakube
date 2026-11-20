import axiosInstance from "@/config/axiosConfig";
import type { CreateBody, UpdateBody } from "@/domain/api/writeBodies";
import type { ApiAttributes } from "@/domain/generated/apiResources";
import { graphql } from "@/domain/generated/graphql";
import type { WorkspaceAccessListQuery } from "@/domain/generated/graphql/graphql";
import { apiGraphQL } from "@/modules/api/apiWrapper";
import { ConnectionNode, connectionNodes, graphqlRequest } from "@/modules/api/graphqlRequest";
import { ApiResponse } from "@/modules/api/types";

const WorkspaceAccessList = graphql(`
  query WorkspaceAccessList($workspaceIds: [String]) {
    workspace(ids: $workspaceIds) {
      edges {
        node {
          access {
            edges {
              node {
                id
                name
                role
                manageWorkspace
                manageState
                planJob
                approveJob
                destroyJob
              }
            }
          }
        }
      }
    }
  }
`);

type WorkspaceAccessNode = ConnectionNode<ConnectionNode<WorkspaceAccessListQuery["workspace"]>["access"]>;

const toWorkspaceAccess = (node: WorkspaceAccessNode) => ({
  id: node.id ?? "",
  name: node.name ?? "",
  role: node.role ?? "custom",
  manageWorkspace: node.manageWorkspace ?? false,
  manageState: node.manageState ?? false,
  planJob: node.planJob ?? false,
  approveJob: node.approveJob ?? false,
  // Before this permission existed, a custom team could destroy.
  destroyJob: node.destroyJob ?? true,
});

/** A team's access to a workspace, with the API's unset permissions read as their defaults. */
export type WorkspaceAccessModel = ReturnType<typeof toWorkspaceAccess>;

/** The permissions a custom role grants, as written back to the API; `Pick` fails if one isn't an access attribute. */
export type WorkspaceAccessPermissions = Pick<
  ApiAttributes["access"],
  Exclude<keyof WorkspaceAccessModel, "id" | "name" | "role">
>;

async function listWorkspaceAccess(
  _organizationId: string,
  workspaceId: string
): Promise<ApiResponse<WorkspaceAccessModel[]>> {
  return apiGraphQL(async () => {
    const data = await graphqlRequest(WorkspaceAccessList, { workspaceIds: [workspaceId] });
    return connectionNodes(connectionNodes(data.workspace)[0]?.access).map(toWorkspaceAccess);
  });
}

async function addWorkspaceAccess(
  organizationId: string,
  workspaceId: string,
  teamName: string,
  role: string,
  permissions?: WorkspaceAccessPermissions
): Promise<void> {
  const body: CreateBody<"access"> = {
    data: {
      type: "access",
      attributes: {
        name: teamName,
        role,
        ...(permissions ?? {}),
      },
    },
  };

  await axiosInstance.post(`organization/${organizationId}/workspace/${workspaceId}/access`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

async function updateWorkspaceAccess(
  organizationId: string,
  workspaceId: string,
  accessId: string,
  role: string,
  permissions?: WorkspaceAccessPermissions
): Promise<void> {
  const body: UpdateBody<"access"> = {
    data: {
      id: accessId,
      type: "access",
      attributes: { role, ...(permissions ?? {}) },
    },
  };
  await axiosInstance.patch(`organization/${organizationId}/workspace/${workspaceId}/access/${accessId}`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

async function removeWorkspaceAccess(organizationId: string, workspaceId: string, accessId: string): Promise<void> {
  await axiosInstance.delete(`organization/${organizationId}/workspace/${workspaceId}/access/${accessId}`);
}

const methods = {
  listWorkspaceAccess,
  addWorkspaceAccess,
  updateWorkspaceAccess,
  removeWorkspaceAccess,
};

export default methods;
