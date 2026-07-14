/**
 * Resolve a recipe's `access` grant ids into displayable player / character rows.
 *
 * The recipe editor's context rail is READ-ONLY: in `restricted` visibility mode it
 * shows who a recipe is granted to, and authoring stays on the Access tab. Two rules
 * govern this module (issue 643 §4b):
 *
 * 1. **Unresolvable ids are dropped from DISPLAY, never persisted away.** A deleted
 *    actor or user leaves its id in `access`; rendering must not mutate the grant as
 *    a side effect, so the resolver simply omits it.
 * 2. **Characters resolve over EVERY world actor**, not the player-character roster.
 *    The runtime predicate applies no type filter, so a grant naming a non-PC actor
 *    is still honoured by the engine — resolving over the filtered roster would drop
 *    it and under-report access.
 *
 * Pure and dependency-free (no Svelte, no Foundry): the caller supplies both rosters,
 * which the admin store projects through its injected services.
 *
 * @typedef {object} AccessPlayer
 * @property {string} id
 * @property {string} name
 * @property {string} avatar
 *
 * @typedef {object} AccessController
 * @property {string} id
 * @property {string} name
 * @property {string} avatar
 * @property {boolean} assigned Whether this is the user's ASSIGNED character (vs. an
 *   OWNER-only grant). The two are a union, not a fallback chain.
 *
 * @typedef {object} AccessCharacter
 * @property {string} id
 * @property {string} name
 * @property {string} img
 * @property {AccessController[]} controlledBy
 * @property {boolean} sharedWithAllPlayers `ownership.default >= OWNER` — the grant
 *   reaches the whole table, so the rail must never name one player instead.
 */

function idList(value) {
  return Array.isArray(value) ? value.map((id) => String(id ?? '').trim()).filter(Boolean) : [];
}

function indexById(roster) {
  const map = new Map();
  for (const entry of Array.isArray(roster) ? roster : []) {
    const id = String(entry?.id ?? '').trim();
    if (id) map.set(id, entry);
  }
  return map;
}

/**
 * @param {{characterIds?: string[], playerIds?: string[]}|null} access
 * @param {{players?: AccessPlayer[], characters?: AccessCharacter[]}} [rosters]
 * @returns {{players: AccessPlayer[], characters: AccessCharacter[]}} Resolved rows in
 *   the grant's own order; unresolvable ids are omitted.
 */
export function resolveRecipeAccessRoster(access, rosters = {}) {
  const playersById = indexById(rosters.players);
  const charactersById = indexById(rosters.characters);

  return {
    players: idList(access?.playerIds)
      .map((id) => playersById.get(id))
      .filter(Boolean),
    characters: idList(access?.characterIds)
      .map((id) => charactersById.get(id))
      .filter(Boolean),
  };
}
