import axiosInstance from "@/config/axiosConfig";
import type { CreateBody, UpdateBody } from "@/domain/api/writeBodies";
import { graphql } from "@/domain/generated/graphql";
import type { ProjectAccessListQuery, ProjectListQuery } from "@/domain/generated/graphql/graphql";
import { apiGraphQL } from "@/modules/api/apiWrapper";
import { ConnectionNode, connectionNodes, graphqlRequest } from "@/modules/api/graphqlRequest";
import { ApiResponse } from "@/modules/api/types";

graphql(`
  fragment ProjectFields on Project {
    id
    name
    description
  }
`);

const ProjectList = graphql(`
  query ProjectList($organizationIds: [String]) {
    organization(ids: $organizationIds) {
      edges {
        node {
          project {
            edges {
              node {
                ...ProjectFields
              }
            }
          }
        }
      }
    }
  }
`);

const ProjectById = graphql(`
  query ProjectById($organizationIds: [String], $projectIds: [String]) {
    organization(ids: $organizationIds) {
      edges {
        node {
          project(ids: $projectIds) {
            edges {
              node {
                ...ProjectFields
              }
            }
          }
        }
      }
    }
  }
`);

const ProjectAccessList = graphql(`
  query ProjectAccessList($projectIds: [String]) {
    project(ids: $projectIds) {
      edges {
        node {
          projectAccess {
            edges {
              node {
                id
                name
                role
                manageWorkspace
                manageState
                manageJob
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

type ProjectNode = ConnectionNode<ConnectionNode<ProjectListQuery["organization"]>["project"]>;

const toProject = (node: ProjectNode) => ({
  id: node.id ?? "",
  name: node.name ?? "",
  description: node.description ?? undefined,
});

/** A project as the project pages and pickers show it. */
export type Project = ReturnType<typeof toProject>;

type ProjectAccessNode = ConnectionNode<ConnectionNode<ProjectAccessListQuery["project"]>["projectAccess"]>;

const toProjectAccess = (node: ProjectAccessNode) => ({
  id: node.id ?? "",
  name: node.name ?? "",
  role: node.role ?? "custom",
  manageWorkspace: node.manageWorkspace ?? false,
  manageState: node.manageState ?? false,
  manageJob: node.manageJob ?? false,
  planJob: node.planJob ?? false,
  approveJob: node.approveJob ?? false,
  destroyJob: node.destroyJob ?? true,
});

/** A team's access to a project, with the API's unset permissions read as their defaults. */
export type ProjectAccessModel = ReturnType<typeof toProjectAccess>;

/** The individual permissions a team gets on every workspace of the project when its role is "custom". */
export type ProjectAccessPermissions = Pick<
  ProjectAccessModel,
  "manageWorkspace" | "manageState" | "planJob" | "approveJob" | "destroyJob"
>;

async function listProjects(organizationId: string): Promise<ApiResponse<Project[]>> {
  return apiGraphQL(async () => {
    const data = await graphqlRequest(ProjectList, { organizationIds: [organizationId] });
    return connectionNodes(connectionNodes(data.organization)[0]?.project).map(toProject);
  });
}

async function createProject(organizationId: string, data: { name: string; description?: string }): Promise<void> {
  const body: CreateBody<"project"> = {
    data: {
      type: "project",
      attributes: {
        name: data.name,
        description: data.description ?? "",
      },
    },
  };

  await axiosInstance.post(`organization/${organizationId}/project`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

async function updateProject(
  organizationId: string,
  projectId: string,
  data: { name: string; description?: string }
): Promise<void> {
  const body: UpdateBody<"project"> = {
    data: {
      id: projectId,
      type: "project",
      attributes: {
        name: data.name,
        description: data.description ?? "",
      },
    },
  };

  await axiosInstance.patch(`organization/${organizationId}/project/${projectId}`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

async function getProject(organizationId: string, projectId: string): Promise<ApiResponse<Project>> {
  return apiGraphQL(async () => {
    const data = await graphqlRequest(ProjectById, { organizationIds: [organizationId], projectIds: [projectId] });
    const node = connectionNodes(connectionNodes(data.organization)[0]?.project)[0];
    return node ? toProject(node) : { id: "", name: "", description: undefined };
  });
}

async function deleteProject(organizationId: string, projectId: string): Promise<void> {
  await axiosInstance.delete(`organization/${organizationId}/project/${projectId}`);
}

async function listProjectAccess(
  _organizationId: string,
  projectId: string
): Promise<ApiResponse<ProjectAccessModel[]>> {
  return apiGraphQL(async () => {
    const data = await graphqlRequest(ProjectAccessList, { projectIds: [projectId] });
    return connectionNodes(connectionNodes(data.project)[0]?.projectAccess).map(toProjectAccess);
  });
}

async function addProjectAccess(
  organizationId: string,
  projectId: string,
  teamName: string,
  role: string,
  permissions?: ProjectAccessPermissions
): Promise<void> {
  const body: CreateBody<"project_access"> = {
    data: {
      type: "project_access",
      attributes: {
        name: teamName,
        role,
        ...permissions,
      },
    },
  };

  await axiosInstance.post(`organization/${organizationId}/project/${projectId}/projectAccess`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

async function removeProjectAccess(organizationId: string, projectId: string, accessId: string): Promise<void> {
  await axiosInstance.delete(`organization/${organizationId}/project/${projectId}/projectAccess/${accessId}`);
}

async function updateProjectAccess(
  organizationId: string,
  projectId: string,
  accessId: string,
  role: string,
  permissions?: ProjectAccessPermissions
): Promise<void> {
  const body: UpdateBody<"project_access"> = {
    data: {
      id: accessId,
      type: "project_access",
      attributes: { role, ...permissions },
    },
  };
  await axiosInstance.patch(`organization/${organizationId}/project/${projectId}/projectAccess/${accessId}`, body, {
    headers: { "Content-Type": "application/vnd.api+json" },
  });
}

const methods = {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  listProjectAccess,
  addProjectAccess,
  updateProjectAccess,
  removeProjectAccess,
};

export default methods;
