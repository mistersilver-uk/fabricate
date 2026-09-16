/**
 * Resolve a recipe's `access` grant ids into displayable player / character rows for the editor's
 * READ-ONLY context rail (issue 643 §4b). Two rules: an unresolvable id is dropped from DISPLAY and
 * never persisted away, because rendering must not mutate the grant; and characters resolve over
 * EVERY world actor rather than the player-character roster, because the runtime predicate applies
 * no type filter and the narrower roster would under-report access. Pure and dependency-free.
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
