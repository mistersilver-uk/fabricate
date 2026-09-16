/**
 * `1.29.0` — force add belongs to AUTOMATIC composition mode (issue 1315; spec § Manual Composition
 * Force-List Fold owns the FOLD and the CLEAR). Pure, idempotent and copy-on-write.
 * A CLEARED LIST IS A DELETED KEY, NOT `[]`: the store emits `forced*Ids` only when non-empty, so
 * writing `[]` would rewrite the environment list of every world that has no force lists at all.
 */

import { isPlainObject } from './migrationHelpers.js';

/** The two `forced*Ids` → `enabled*Ids` pairs, in task-then-event order. */
const COMPOSITION_ID_KEYS = Object.freeze([
  Object.freeze({ forced: 'forcedTaskIds', enabled: 'enabledTaskIds' }),
  Object.freeze({ forced: 'forcedEventIds', enabled: 'enabledEventIds' }),
]);

/** Read an id list as the store's `normalizeIdList` does — the path every reader goes through. */
function idEntries(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

/**
 * Coerce one entry as the store would: a number or stray object is NOT dropped, because discarding
 * an id the running engine honours would lose a composed record.
 */
function normalizeId(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Append de-duplicated, copying existing entries UNCHANGED so the fold churns no untouched id. */
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

/** Apply the fold-and-clear to one environment, copy-on-write. */
function migrateEnvironment(environment, clearAutomaticForces) {
  if (!isPlainObject(environment)) return environment;

  const pending = COMPOSITION_ID_KEYS.filter(
    ({ forced }) => idEntries(environment[forced]).length > 0
  );
  if (pending.length === 0) return environment;

  // STRICT equality, matching the store's own gate: an absent, wrong-case or garbage mode is
  // automatic everywhere else, and reading it as manual here would fold force entries into a list
  // automatic mode ignores.
  const isManual = environment.compositionMode === 'manual';
  const next = { ...environment };

  for (const { forced, enabled } of pending) {
    // An AUTOMATIC force list is residue only in a world predating this change. The world migration
    // is version-gated, so clearing there repairs residue and meets nothing else; the IMPORT upcast
    // has no version to gate on, so clearing there would destroy a legitimate list every round trip.
    if (!isManual && !clearAutomaticForces) continue;
    if (isManual) {
      const merged = appendMissingIds(environment[enabled], idEntries(environment[forced]));
      // Never CREATE an empty list: a force list holding nothing but `null` folds to no ids at all,
      // and stamping `enabledTaskIds: []` would contradict the deleted-key ruling above.
      if (merged.length > 0) next[enabled] = merged;
    }
    delete next[forced];
  }

  return next;
}

/**
 * THE ONE IMPLEMENTATION of the fold and clear, called by the world migration and the export upcast
 * alike — `import-export/spec.md` requires the upcast to apply the same transform, and a bundle
 * exported before the upgrade is a second ingress for the records it exists to rescue.
 */
export function applyManualCompositionForceFold(environments, options = {}) {
  const { clearAutomaticForces = true } = options;
  if (!Array.isArray(environments)) return { environments, migratedCount: 0 };

  let migratedCount = 0;
  const next = environments.map((environment) => {
    const migrated = migrateEnvironment(environment, clearAutomaticForces);
    if (migrated !== environment) migratedCount += 1;
    return migrated;
  });

  return { environments: migratedCount > 0 ? next : environments, migratedCount };
}

/**
 * Run the transform over the runner's payload, answering a SUBSET: the runner spread-merges the
 * return value, so returning the key with an `undefined` value would blank the setting.
 */
export function migrateManualCompositionForces(data = {}) {
  if (!Array.isArray(data?.environments)) return {};
  return { environments: applyManualCompositionForceFold(data.environments).environments };
}
