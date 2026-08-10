/**
 * 1.22.0 — Lift the check-modifier catalogue out of `craftingCheck` and up to the system,
 * and rename the `byRecipe` combination rule to `bySubject` (issue 1095; pure,
 * clone-first, idempotent, version-gated).
 *
 * WHY THIS EXISTS. Before issue 1095 the catalogue was persisted at
 * `craftingCheck.checkModifiers`, which made it crafting-owned by construction: salvage
 * and gathering had no modifier seam at all. They now select over the SAME catalogue
 * through their own `{defaultModifierPolicy, defaultModifierIds, maxModifierPicks?}`
 * triples, so the catalogue cannot go on belonging to one of the three activities. It
 * moves to `CraftingSystem.checkModifiers` and the old key is deleted — not aliased, so
 * there is exactly one location and nothing to keep in sync.
 *
 * THE RUNNER'S ORDERING IS LOAD-BEARING, and is the whole reason this can be a move
 * rather than a rescue. `_runMigrations()` runs BEFORE any manager loads persisted data
 * (`src/main.js`), and it is gated to the primary GM. `_normalizeCraftingCheck` is an
 * ALLOWLIST REBUILD that no longer emits `checkModifiers`, so had any save run first, the
 * catalogue would have been DELETED rather than relocated — silently, with no error and
 * no recoverable copy. Nothing about that is incidental to this migration; it is the
 * precondition it depends on.
 *
 * THE MOVE IS GUARDED. An authored system-level catalogue always wins and the legacy key
 * is dropped without overwriting it. That is what makes the migration idempotent without
 * relying on the version gate, and the View Lab depends on it directly:
 * `tests/view-lab/world/labWorld.js` boots the real runner over fixtures that seed no
 * `migrationVersion`, so `lastRunVersion` is `'0.0.0'` and EVERY migration runs on EVERY
 * lab build. `labContent.js` deliberately authors its catalogue at the OLD location, so
 * the lab build IS a live exercise of this transform and its frames render
 * post-migration data — exactly the state a GM upgrading will see.
 *
 * `byRecipe` → `bySubject` at the SYSTEM level only. The rule's meaning ("the record
 * being resolved picks, at authoring time") is activity-independent while its LABEL is
 * not, so the token was renamed. `normalizeModifierPolicy` accepts `byRecipe` as a
 * never-re-emitted READ alias, so a world that somehow misses this migration still
 * behaves correctly; rewriting it here is what stops the alias becoming permanent. This
 * deliberately supersedes `1.20.0`'s item 3 ("`byRecipe` is NOT mapped or retired"),
 * which was the correct call for its own release — the rule was first-class then and had
 * no activity-independent name.
 *
 * IT SEEDS NOTHING onto a salvage or gathering check that has no block — the same
 * no-storage-churn call `migrateMaxModifierPicks` and
 * `migrateRetireProgressiveAllowPlayerReorder` already make. An absent selection
 * normalizes to `addAll` with an empty id set, which resolves to a scalar of 0 and
 * appends no term: writing one would be storage churn for zero observable change.
 *
 * PURE AND CLONE-FIRST. The runner spread-merges a migration's return value
 * (`data = { ...data, ...result }`), so this returns `{ systems }` rather than mutating
 * the runner's payload. Clone-first is also what makes the no-throw guarantee total: the
 * runner restores its pre-migration checkpoint only on the FATAL branch, so an in-place
 * migration that threw halfway would persist a half-applied world. Nothing here throws
 * (every level is guarded and a malformed system/check is skipped rather than repaired —
 * normalization is the normalizer's job), and because only the clone is ever touched,
 * even a hypothetical throw leaves the runner's payload untouched.
 *
 * Mutated setting key: `craftingSystems`, and only it.
 *
 * THE DOWNGRADE LOSES THE CATALOGUE, and the registry entry says so rather than leaving
 * it to be inferred. `1.21.0`'s `_normalizeCheckModifierConfig` is an allowlist that
 * never saw a system-level `checkModifiers`, so a downgraded world drops it on the first
 * read and every check modifier stops contributing. This is the first entry in that
 * registry whose downgrade is not lossless.
 */

import { normalizeModifierPolicy } from '../systems/checkModifierResolver.js';

/** The key the catalogue used to be persisted under, inside `craftingCheck`. */
const LEGACY_CATALOGUE_KEY = 'checkModifiers';

/** Where it lives now: the system itself. */
const SYSTEM_CATALOGUE_KEY = 'checkModifiers';

/** The rule token this migration rewrites, and what it becomes. */
const LEGACY_POLICY = 'byRecipe';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Apply the whole 1.22.0 transform to ONE system.
 *
 * The argument is mutated in place, so callers must hand over a structure they already own
 * (a clone). Splitting the per-system transform out this way is what lets the world-setting
 * migration below and the export-payload upcast in `migrateExportPayload.js` share one
 * derivation instead of maintaining two copies of it: an export bundle carries exactly one
 * system, so there is nothing to group.
 *
 * @param {unknown} system - one raw crafting system, mutated in place.
 */
export function applySystemCheckModifierCatalogue(system) {
  if (!_isPlainObject(system)) return;
  const check = _isPlainObject(system.craftingCheck) ? system.craftingCheck : null;

  // A MALFORMED LEGACY VALUE IS SKIPPED, NOT DELETED. The header's no-throw guarantee rests
  // on "a malformed system/check is skipped rather than repaired — normalization is the
  // normalizer's job", and deleting a non-array `craftingCheck.checkModifiers` is a repair:
  // this migration would be destroying data it has decided it cannot read, on the one code
  // path where the GM has no copy left. It costs nothing to leave it — the value is not a
  // catalogue, nothing reads it, and `_normalizeCraftingCheck` is an allowlist rebuild that
  // drops it on the next save anyway.
  if (check && Array.isArray(check[LEGACY_CATALOGUE_KEY])) {
    // GUARDED. An authored system-level catalogue is the newer, correct location and is
    // never clobbered; the legacy key is still deleted, so a half-migrated system
    // converges rather than carrying two catalogues that could disagree.
    if (!Array.isArray(system[SYSTEM_CATALOGUE_KEY])) {
      system[SYSTEM_CATALOGUE_KEY] = check[LEGACY_CATALOGUE_KEY];
    }
    delete check[LEGACY_CATALOGUE_KEY];
  }

  // The rule rewrite is INDEPENDENT of the move: a system may carry `byRecipe` with no
  // catalogue at all (the rule is persisted even when nothing is catalogued), and the
  // token must still stop being re-emitted.
  if (check && check.defaultModifierPolicy === LEGACY_POLICY) {
    check.defaultModifierPolicy = normalizeModifierPolicy(LEGACY_POLICY);
  }
}

/**
 * Runner entry point.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @returns {{ systems: Array<object> }}
 */
export function migrateSystemCheckModifierCatalogue(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  if (!Array.isArray(systems)) return { systems: data.systems };
  for (const system of systems) applySystemCheckModifierCatalogue(system);
  return { systems };
}
