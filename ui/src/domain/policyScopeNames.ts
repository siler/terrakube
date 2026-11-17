/** Names of the resources exemptions scope to, keyed by id; a missing name stays missing. */
export type ScopeNames = { workspace: Map<string, string>; project: Map<string, string> };

/** Reads the scope resources' names by id; a failed lookup only costs the names, not the rows. */
export const readNames = async (
  scopeIds: string[],
  read: (scopeIds: string[]) => PromiseLike<{ id: string; name: string }[]>
): Promise<Map<string, string>> => {
  if (scopeIds.length === 0) return new Map();
  try {
    return new Map((await read(scopeIds)).map((row) => [row.id, row.name]));
  } catch {
    return new Map();
  }
};
