import axiosInstance from "@/config/axiosConfig";
import type { CreateBody, UpdateBody } from "@/domain/api/writeBodies";
import type { ApiAttributes } from "@/domain/generated/apiResources";
import { apiPost } from "@/modules/api/apiWrapper";
import { ApiResponse } from "@/modules/api/types";

/** A team's access to a workspace, with the API's unset permissions read as their defaults. */
export type WorkspaceAccessModel = {
  id: string;
  name: string;
  role: string;
  manageWorkspace: boolean;
  manageState: boolean;
  planJob: boolean;
  approveJob: boolean;
  destroyJob: boolean;
};

/** The permissions a custom role grants, as written back to the API; `Pick` fails if one isn't an access attribute. */
export type WorkspaceAccessPermissions = Pick<
  ApiAttributes["access"],
  Exclude<keyof WorkspaceAccessModel, "id" | "name" | "role">
>;

async function listWorkspaceAccess(
  _organizationId: string,
  workspaceId: string
): Promise<ApiResponse<WorkspaceAccessModel[]>> {
  const body = {
    query: `{
      workspace(ids: ["${workspaceId}"]) {
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
    }`,
  };

  const tempData = await apiPost("/graphql/api/v1", body, (data): any => data, {
    dataWrapped: true,
    contentType: "application/json",
  });

  if (tempData.isError) {
    return tempData;
  }

  const edges = tempData.data?.workspace?.edges?.[0]?.node?.access?.edges ?? [];

  return {
    isError: false,
    responseCode: tempData.responseCode,
    data: edges.map((edge: any) => ({
      id: edge.node.id,
      name: edge.node.name,
      role: edge.node.role ?? "custom",
      manageWorkspace: edge.node.manageWorkspace ?? false,
      manageState: edge.node.manageState ?? false,
      planJob: edge.node.planJob ?? false,
      approveJob: edge.node.approveJob ?? false,
      // Before this permission existed, a custom team could destroy.
      destroyJob: edge.node.destroyJob ?? true,
    })),
  };
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
