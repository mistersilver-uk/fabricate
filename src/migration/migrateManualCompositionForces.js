/**
 * 1.29.0 — force add belongs to AUTOMATIC composition mode (issue 1315).
 *
 * Each of a gathering environment's three id lists now belongs to exactly one composition
 * mode. **Automatic** composes the library-enabled records that match the environment's
 * biome and danger context, minus `disabled*Ids`, plus `forced*Ids` — force add and exclude
 * are its two overrides of its own filter. **Manual** composes exactly the library-enabled
 * records named in `enabled*Ids`, with no match filter at all, and therefore has nothing for
 * a force to override.
 *
 * Both halves of that rule move records, so this migration exists to make sure none are lost:
 *
 * 1. **Fold**, on `compositionMode === 'manual'` environments only: every id in
 *    `forcedTaskIds` is appended to `enabledTaskIds` and every id in `forcedEventIds` to
 *    `enabledEventIds`, de-duplicated, existing order preserved and new ids appended in the
 *    order the force list held them. Force add RENDERS in manual mode today — that is the
 *    defect issue 1315 reports — so a real world holds manual environments whose entire
 *    composed set lives in a force list. Without the fold those records would simply stop
 *    composing. `taskOrder` and `eventOrder` are display order and are untouched.
 * 2. **Clear**, on EVERY environment, manual and automatic alike. Force add has never
 *    rendered in automatic mode in any released version — `09d8e5f1`, the environment
 *    editor's first commit, already gated those branches on the mode their own enclosing
 *    section excludes — and `setEnvironmentCompositionMode` clears nothing when a GM flips a
 *    mode. An automatic force entry is therefore residue from a manual editing session or
 *    from an imported bundle; it composed nothing before this migration and it must compose
 *    nothing after it, which is what keeps `docs/gathering-environments.md`'s documented
 *    guarantee true: switching from manual to automatic does not silently make force-added
 *    non-matching records available.
 *
 * **A cleared list is a DELETED KEY, not `[]`**, and the choice is deliberate:
 * `GatheringEnvironmentStore._normalizeEnvironment` emits `forced*Ids` only when it is
 * non-empty (`...(forcedTaskIds.length > 0 && { forcedTaskIds })`), so absence is the shape
 * the world's own next save produces. Writing `[]` would invent a shape this module never
 * writes for itself and that the next save erases anyway, and — because the runner detects
 * change by `JSON.stringify` — it would rewrite the whole environment list of every world
 * that has no force lists at all. Both shapes exist in the wild regardless, since a world
 * saved before this migration may carry either; every consumer reads through
 * `normalizeIdList` or `gatheringComposition`'s `idList`, both of which map an absent key and
 * an empty array to the same `[]`, so the two are indistinguishable to a reader.
 *
 * A list that is ALREADY empty is left exactly as found, key and all: there is nothing to
 * clear, so the environment is returned by reference and counts as unmigrated.
 *
 * Pure, idempotent and copy-on-write: an environment with no force entries is returned by
 * reference, and an untouched corpus returns the input array itself. A second run finds no
 * force list and is byte-identical with `migratedCount` 0 — independently of the runner's
 * version gate, which blocks re-entry as well.
 */

import { isPlainObject } from './migrationHelpers.js';

/**
 * The two `forced*Ids` → `enabled*Ids` pairs, in task-then-event order.
 * @type {ReadonlyArray<{ forced: string, enabled: string }>}
 */
const COMPOSITION_ID_KEYS = Object.freeze([
  Object.freeze({ forced: 'forcedTaskIds', enabled: 'enabledTaskIds' }),
  Object.freeze({ forced: 'forcedEventIds', enabled: 'enabledEventIds' }),
]);

/**
 * Read a persisted id list the way `GatheringEnvironmentStore.normalizeIdList` reads it:
 * an array as itself, a truthy scalar as a one-entry list, anything else as empty. Matching
 * the store matters because the store is what every reader of this data goes through, so a
 * shape it would have accepted must not be silently dropped here.
 *
 * @param {*} value
 * @returns {Array<*>}
 */
function idEntries(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/**
 * Coerce one raw entry to the id string the store would normalize it to — `String(value)`
 * trimmed, with `null`/`undefined` becoming `''` so the caller can drop them. A number or a
 * stray object is NOT dropped, because the store keeps them too (`42` → `'42'`), and a
 * migration that discarded an id the running engine honours would lose a composed record.
 *
 * @param {*} value
 * @returns {string}
 */
function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/**
 * Append `forced` onto `existing`, de-duplicated by normalized id, existing entries left
 * byte-identical and in place.
 *
 * Existing entries are copied through UNCHANGED rather than normalized: this migration's job
 * is the fold, and rewriting ids it was not asked to touch would make a world's environment
 * list churn for no behavioural reason.
 *
 * @param {*} existing The current `enabled*Ids` value, in whatever shape it was persisted.
 * @param {Array<*>} forced The force-list entries to fold in.
 * @returns {Array<*>} The merged list.
 */
function appendMissingIds(existing, forced) {
  const merged = [...idEntries(existing)];
  const seen = new Set(merged.map((entry) => normalizeId(entry)));
  for (const entry of forced) {
    const id = normalizeId(entry);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

/**
 * Apply the fold-and-clear to one environment, copy-on-write.
 *
 * @param {*} environment
 * @returns {*} The same reference when nothing changed, otherwise a shallow copy.
 */
function migrateEnvironment(environment) {
  if (!isPlainObject(environment)) return environment;

  const pending = COMPOSITION_ID_KEYS.filter(
    ({ forced }) => idEntries(environment[forced]).length > 0
  );
  if (pending.length === 0) return environment;

  // STRICT equality, matching `resolveGatheringCompositionMode` and the store's
  // `VALID_COMPOSITION_MODES` gate: an absent, `undefined`, wrong-case or garbage mode is
  // automatic everywhere else in the module, and reading it as manual here would fold force
  // entries into a list automatic mode ignores.
  const isManual = environment.compositionMode === 'manual';
  const next = { ...environment };

  for (const { forced, enabled } of pending) {
    if (isManual) {
      const merged = appendMissingIds(environment[enabled], idEntries(environment[forced]));
      // Never CREATE an empty list. A force list holding nothing but `null` folds to no ids
      // at all, and stamping `enabledTaskIds: []` onto an environment that had no such key
      // would contradict this module's own deleted-key ruling above.
      if (merged.length > 0) next[enabled] = merged;
    }
    delete next[forced];
  }

  return next;
}

/**
 * Fold manual force lists into their picked lists and clear every force list.
 *
 * THE ONE IMPLEMENTATION of the 1.29.0 transform. The world migration and the export-payload
 * upcast both call this function, because `import-export/spec.md` requires the payload upcast
 * to apply the same transforms as the world migration rather than a second implementation of
 * them — and a bundle exported before the upgrade and imported after it is a second ingress
 * for exactly the records the world migration exists to rescue.
 *
 * @param {*} environments A raw environment list (the `gatheringEnvironments` world setting,
 *   or an export payload's `gatheringEnvironments` array).
 * @returns {{ environments: *, migratedCount: number }} `environments` is the input itself
 *   when nothing changed; `migratedCount` counts the environments actually rewritten.
 */
export function applyManualCompositionForceFold(environments) {
  if (!Array.isArray(environments)) return { environments, migratedCount: 0 };

  let migratedCount = 0;
  const next = environments.map((environment) => {
    const migrated = migrateEnvironment(environment);
    if (migrated !== environment) migratedCount += 1;
    return migrated;
  });

  return { environments: migratedCount > 0 ? next : environments, migratedCount };
}

/**
 * Run the 1.29.0 transform over the runner's one-pass data bundle.
 *
 * Returns a SUBSET of the bundle — only `environments`, and only when there is an environment
 * list to speak of. The runner spread-merges a migration's return value into the payload, so
 * returning the key with an `undefined` value would blank the setting rather than leave it
 * alone.
 *
 * @param {{ environments?: Array<object> }} [data]
 * @returns {{ environments?: Array<object> }}
 */
export function migrateManualCompositionForces(data = {}) {
  if (!Array.isArray(data?.environments)) return {};
  return { environments: applyManualCompositionForceFold(data.environments).environments };
}
