/**
 * `1.29.0` — force add belongs to AUTOMATIC composition mode (issue 1315; spec § Manual Composition
 * Force-List Fold owns the FOLD, the CLEAR, and requirement 5's deleted-key rule). Pure, idempotent
 * and copy-on-write.
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

/** Coerce one entry as the store would; a number or stray object is NOT dropped. */
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

  // STRICT equality, matching the store's own gate: every other mode value is automatic.
  const isManual = environment.compositionMode === 'manual';
  const next = { ...environment };

  for (const { forced, enabled } of pending) {
    // The version-gated world pass clears an AUTOMATIC residue; the ungated import upcast must not.
    if (!isManual && !clearAutomaticForces) continue;
    if (isManual) {
      const merged = appendMissingIds(environment[enabled], idEntries(environment[forced]));
      // Never CREATE an empty list, on requirement 5's deleted-key rule.
      if (merged.length > 0) next[enabled] = merged;
    }
    delete next[forced];
  }

  return next;
}

/**
 * THE ONE IMPLEMENTATION of the fold and clear, called by the world migration and the export upcast
 * alike, as `import-export/spec.md` § Migration of older exports requires.
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

/** Run it over the runner's payload, answering a SUBSET: a spread-merged `undefined` blanks. */
export function migrateManualCompositionForces(data = {}) {
  if (!Array.isArray(data?.environments)) return {};
  return { environments: applyManualCompositionForceFold(data.environments).environments };
}
