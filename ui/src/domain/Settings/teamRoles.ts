import { isOneOf } from "@/modules/utils/typeGuards";

/** Every role a team can hold, in the order the role picker lists them. */
export const TEAM_ROLES = ["admin", "write", "plan", "read", "custom"] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

/** Narrows a stored or watched role value to a known role. */
export const isTeamRole = (value: unknown): value is TeamRole => isOneOf(TEAM_ROLES, value);

// Shared with the team list so a role reads the same everywhere.
// Tag colors meet 4.5:1 in both themes (antd orange does not); custom is neutral.
export const teamRoles: Record<TeamRole, { label: string; color: string; description: string }> = {
  admin: {
    label: "Admin",
    color: "red",
    description: "Full control over all resources, including workspace settings, team permissions and infrastructure.",
  },
  write: {
    label: "Write",
    color: "magenta",
    description: "Can plan, apply and destroy, manage workspaces, and read and write state and variables.",
  },
  plan: {
    label: "Plan",
    color: "blue",
    description:
      "Can queue plans, including a destroy that waits for an approval, but not apply; a Write or Admin member has to approve.",
  },
  read: {
    label: "Read",
    color: "default",
    description: "Can view workspaces, runs, state and variables, but not change anything.",
  },
  custom: {
    label: "Custom",
    color: "default",
    description: "Only the permissions you choose below.",
  },
};
