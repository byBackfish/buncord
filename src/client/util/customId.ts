/**
 * Build a namespaced customId (`action` or `action:state`) within Discord's
 * 1-100 character limit. Prefer one stable id per action and disambiguate
 * concurrent uses with `awaitInteraction` filters, not random ids.
 */
export function createCustomId(action: string, state?: string | number): string {
  if (!action || action.includes(":"))
    throw new Error('Action must be a non-empty string without ":"');
  const id = state === undefined ? action : `${action}:${state}`;
  if (id.length < 1 || id.length > 100)
    throw new Error(`custom_id must be 1-100 characters (got ${id.length})`);
  return id;
}

export function parseCustomId(customId: string): {
  action: string;
  state?: string;
} {
  const idx = customId.indexOf(":");
  if (idx === -1) return { action: customId };
  return {
    action: customId.slice(0, idx),
    state: customId.slice(idx + 1),
  };
}
