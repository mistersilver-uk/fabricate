/**
 * `1.16.0` — rename the three registered-entry source-reference fields so their names say what they
 * mean (issue 560), across every system's components, recipe-item definitions and tools. The
 * semantics are frozen: a world that matched an item before matches it identically after.
 * The essence definition's own `sourceItemUuid` and the canvas interactable `sourceUuid` are
 * DIFFERENT field families and are deliberately not touched.
 */

const FIELD_RENAMES = [
  ['sourceUuid', 'registeredItemUuid'],
  ['sourceItemUuid', 'originItemUuid'],
  ['fallbackItemIds', 'aliasItemUuids'],
];

const ENTRY_ARRAY_KEYS = ['components', 'recipeItemDefinitions', 'tools'];

function _renameEntryFields(entry) {
  if (!entry || typeof entry !== 'object') return;
  for (const [oldKey, newKey] of FIELD_RENAMES) {
    if (!Object.prototype.hasOwnProperty.call(entry, oldKey)) continue;
    // Map only when the new key is absent; when both are present the NEW value wins.
    if (!Object.prototype.hasOwnProperty.call(entry, newKey)) {
      entry[newKey] = entry[oldKey];
    }
    delete entry[oldKey];
  }
}

export function migrateRenameSourceUuidFields(systems) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  for (const system of safeSystems) {
    if (!system || typeof system !== 'object') continue;
    for (const key of ENTRY_ARRAY_KEYS) {
      const list = system[key];
      if (!Array.isArray(list)) continue;
      for (const entry of list) _renameEntryFields(entry);
    }
  }
  return { systems: safeSystems };
}
