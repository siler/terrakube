import type { TeamToken } from "@/domain/types";
import type { AuditFieldBase } from "@/modules/types";
import type { UserToken } from "@/modules/user/types";
import { isOneOf, isStringArray, stringOrUndefined } from "@/modules/utils/typeGuards";
import { field, isBoolean, isNumber, isString, list, record } from "@/modules/api/parseBody";
import type { CreatedToken } from "./types";

const TOKEN_SOURCES = ["API", "CLI_LOGIN"] as const;

// Audit columns are nullable Dates, serialised as strings or null; the UI only displays them.
const auditFields = (body: Record<string, unknown>): AuditFieldBase => ({
  createdDate: stringOrUndefined(body.createdDate),
  createdBy: stringOrUndefined(body.createdBy),
  updatedDate: stringOrUndefined(body.updatedDate),
  updatedBy: stringOrUndefined(body.updatedBy),
});

/** The `{ token }` body both token endpoints answer a create with. */
export const parseCreatedToken = (body: unknown): CreatedToken => ({
  token: field(record(body, "the created token").token, isString, "created token"),
});

const parseUserToken = (item: unknown): UserToken => {
  const body = record(item, "a personal access token");
  return {
    ...auditFields(body),
    id: field(body.id, isString, "personal access token id"),
    deleted: field(body.deleted, isBoolean, "personal access token deleted flag"),
    days: field(body.days, isNumber, "personal access token days"),
    description: stringOrUndefined(body.description) ?? "",
    source: isOneOf(TOKEN_SOURCES, body.source) ? body.source : undefined,
    lastUsedAt: stringOrUndefined(body.lastUsedAt) ?? null,
  };
};

/** `GET /pat/v1`: the caller's personal access tokens. */
export const parseUserTokens = (body: unknown): UserToken[] => list(body, parseUserToken, "personal access token");

const parseTeamToken = (item: unknown): TeamToken => {
  const body = record(item, "a team token");
  return {
    ...auditFields(body),
    id: field(body.id, isString, "team token id"),
    days: field(body.days, isNumber, "team token days"),
    hours: field(body.hours, isNumber, "team token hours"),
    minutes: field(body.minutes, isNumber, "team token minutes"),
    group: field(body.group, isString, "team token group"),
    description: stringOrUndefined(body.description) ?? "",
    deleted: field(body.deleted, isBoolean, "team token deleted flag"),
  };
};

/** `GET /access-token/v1/teams`: the team tokens of every group the caller belongs to. */
export const parseTeamTokens = (body: unknown): TeamToken[] => list(body, parseTeamToken, "team token");

/** `GET /access-token/v1/teams/current-teams`: the caller's identity provider groups. */
export const parseCurrentTeams = (body: unknown): { groups: string[] } => ({
  groups: field(record(body, "the current teams").groups, isStringArray, "current teams"),
});
