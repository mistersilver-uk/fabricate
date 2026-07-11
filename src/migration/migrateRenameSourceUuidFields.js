/**
 * 1.16.0 — Rename the registered-entry source-reference fields (issue 560; pure,
 * idempotent, version-gated).
 *
 * The three source-reference fields borne by every registered-entry kind are renamed so
 * their names say what they mean:
 *
 *   sourceUuid       -> registeredItemUuid   // the document actually registered; fromUuid spawns it
 *   sourceItemUuid   -> originItemUuid        // canonical origin (compendium pack uuid), else = registered
 *   fallbackItemIds  -> aliasItemUuids        // extra refs kept for matching after source repairs
 *
 * The rename is applied to every entry of the three stored entry-array kinds inside each
 * system of the `craftingSystems` settings payload — `system.components[]`,
 * `system.recipeItemDefinitions[]`, and `system.tools[]`. `MigrationRunner` reads/writes the
 * payload as pure DATA (no Item handles), so this is exactly what a data migration can do.
 *
 * Per entry, for each `[oldKey, newKey]` pair the value is mapped ONLY when the old key is
 * present and the new key is absent, then the old key is deleted:
 *
 *   - Old-only entry: value is copied to the new key, old key removed.
 *   - Both-present entry: the new key WINS (already-renamed value kept), old key removed.
 *   - New-only entry: untouched (no old key to migrate).
 *
 * Idempotent: after a run no old keys remain, so a second run is a no-op. Never throws. A
 * world that matched an item before the migration matches it identically after — the
 * semantics are frozen, only the field NAMES change.
 *
 * The essence definition's own `sourceItemUuid` pointer is a DIFFERENT field family (it names
 * the item an essence's source component points at, not a registered-entry match ref) and is
 * deliberately NOT touched here; likewise the canvas interactable RegionBehaviour
 * `sourceUuid` DataModel field lives outside the settings payload entirely.
 *
 * @param {Array<object>} systems - raw craftingSystems setting
 * @returns {{ systems: Array<object> }}
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
