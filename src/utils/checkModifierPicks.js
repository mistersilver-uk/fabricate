/**
 * The ONE authoredness rule for a subject's check-modifier pick (issue 1095).
 *
 * Under the `bySubject` combination rule the pick lives on the record being resolved, and
 * there are THREE of those — `Recipe.craftingModifier.modifierIds`,
 * `Component.salvage.checkModifierIds` and `GatheringTask.checkModifierIds` — normalized
 * across FIVE whitelist rebuilds. `Recipe._normalizeCraftingModifier` and
 * `CraftingSystemManager._normalizeSalvage` are one each; `GatheringTask` needs three,
 * because it is mirrored by `normalizeLibraryTask` and `_normalizeGatheringTask`
 * (`adminStore.js`) on the LIBRARY side and rebuilt again by
 * `_libraryTaskToRuntimeTask` (`GatheringRichStateService.js`) on the way to the engine.
 *
 * Five hand-written copies of "an authored empty array is a real pick of zero" is exactly
 * the drift this module exists to prevent: the rule is subtle (it is keyed on
 * `Array.isArray` AT ENTRY, never on the filtered array's length) and a copy that got it
 * wrong would silently turn an authored pick of nothing back into "inherit the default
 * set", which resolves to a DIFFERENT roll rather than to an error.
 *
 * Deliberately import-free, so every normalizer — including the two that must stay
 * Foundry-free — can reach it.
 */

/**
 * Coerce an authored id list to trimmed, non-empty, de-duplicated STRINGS, preserving
 * authored order.
 *
 * Non-string members are DROPPED rather than coerced: an id is a catalogue key, and `123`
 * is not one. The resolver drops any surviving id that names nothing in the catalogue, so
 * this only has to guarantee shape.
 *
 * TRIMMING IS PART OF THE SHAPE, not a nicety. `Recipe._normalizeCraftingModifier` used to
 * keep its own filter, which rejected a whitespace-only id but kept `' med '` untrimmed —
 * so one authored id resolved against the catalogue on salvage and gathering and was
 * dropped as unknown on crafting. It routes through here now for exactly that reason.
 *
 * @param {unknown} ids
 * @returns {string[]}
 */
export function normalizeCheckModifierIds(ids) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const normalized = [];
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const trimmed = id.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

/**
 * The absence-preserving ATTACH every subject normalizer spreads.
 *
 * Returns `{ checkModifierIds }` when the source authored an array — INCLUDING an empty
 * one, which is a real pick of zero and must survive — and `{}` when it did not, so the
 * key stays absent and the subject inherits its activity's `defaultModifierIds`.
 *
 * The authoredness test is `Array.isArray` at ENTRY, before any filtering. Keying it on
 * the filtered length instead would read `{ checkModifierIds: [123, ''] }` — an authored
 * pick whose members are junk — as an absence and silently restore inheritance.
 *
 * @param {unknown} authored The raw value read off the persisted record.
 * @param {string} [key] The field name to emit under; the gathering task and the
 *   component both use `checkModifierIds`, and `Recipe` keeps its own `modifierIds`
 *   spelling inside `craftingModifier`.
 * @returns {{ [key: string]: string[] }|{}}
 */
export function authoredCheckModifierIds(authored, key = 'checkModifierIds') {
  return Array.isArray(authored) ? { [key]: normalizeCheckModifierIds(authored) } : {};
}
