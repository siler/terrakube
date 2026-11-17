import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axiosInstance from "@/config/axiosConfig";
import { api, fields } from "@/domain/generated/apiPaths";
import type { Row } from "@/domain/api/fieldSelection";

// The permission summary lists what a custom role grants, so every right it can name is selected.
const TEAM_FIELDS = fields.team(
  "name",
  "role",
  "manageWorkspace",
  "manageState",
  "manageModule",
  "manageProvider",
  "manageTemplate",
  "manageVcs",
  "manageCollection",
  "managePolicies",
  "planJob",
  "approveJob",
  "destroyJob"
);

/** An organization team as the settings table lists it. */
export type TeamRow = Row<typeof TEAM_FIELDS>;

/**
 * Query keys for an organization's teams. Keys for data that belongs to an organization start with
 * `["organization", orgId, ...]`, so one organization's data can be invalidated or dropped as a whole.
 * Invalidate `teamKeys.list(orgId)` after any change to the teams.
 */
export const teamKeys = {
  list: (organizationId: string | undefined) => ["organization", organizationId, "teams"] as const,
};

export function useTeams(organizationId: string | undefined) {
  return useQuery({
    queryKey: teamKeys.list(organizationId),
    queryFn: async ({ signal }): Promise<TeamRow[]> => {
      if (!organizationId) throw new Error("No organization selected");
      return await api.organization(organizationId).team().select(TEAM_FIELDS).signal(signal);
    },
    enabled: Boolean(organizationId),
  });
}

/** Refetches the team list; call it after a team was created or edited outside these hooks. */
export function useInvalidateTeams(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: teamKeys.list(organizationId) });
}

type DeleteTeamCallbacks = {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
};

/**
 * Deletes a team and refetches the list. Report the outcome through `callbacks`, not through the options of
 * `mutate()`: the editor navigates to the list right after asking for a delete, which unmounts the page, and
 * `mutate()` callbacks are skipped once their component is gone. These run either way.
 */
export function useDeleteTeam(organizationId: string | undefined, callbacks: DeleteTeamCallbacks = {}) {
  const invalidateTeams = useInvalidateTeams(organizationId);
  return useMutation({
    mutationFn: (teamId: string) => axiosInstance.delete(`organization/${organizationId}/team/${teamId}`),
    onSuccess: () => {
      callbacks.onSuccess?.();
      return invalidateTeams();
    },
    onError: callbacks.onError,
  });
}
