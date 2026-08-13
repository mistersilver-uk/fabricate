/**
 * 1.25.0 — Seed `failureResultPolicy: 'never'` onto every activity check block that
 * ALREADY EXISTS on disk (issue 1098; pure, clone-first, idempotent, version-gated).
 *
 * ## Its entire purpose is that NO UPGRADED WORLD CHANGES BEHAVIOUR
 *
 * Read this before deleting it as a no-op — it looks like one and is the opposite.
 * `_normalizeFailureResultPolicy` reads an absent value as `perRecord`, which PERMITS a
 * failed check to produce an authored failure result. That default is right for a system
 * a GM creates after the upgrade and wrong for every system that already exists, because
 * those systems were authored against engines that could not produce on failure at all.
 *
 * The hazard is concrete, not theoretical. A salvage component may legally persist a
 * reserved `role: 'failure'` result group carrying results: `_normalizeSalvage` tolerates
 * one whenever the Simple salvage check has an authored roll formula, and until issue 1098
 * `CraftingEngine.salvage()` returned before ever resolving a group on a failed check — so
 * that group awarded NOTHING, in every world, always. Without this migration the upgrade
 * would silently turn it on: every failed salvage would start handing out loot the GM
 * authored years ago for a capability that did not exist. Seeding `never` makes the
 * upgrade invisible and leaves the GM to opt in deliberately, per activity, per system.
 *
 * ## What it writes, and what it deliberately does not
 *
 * Each of `craftingCheck`, `salvageCraftingCheck` and `gatheringCraftingCheck` that is
 * present as an object gets the key. A check block that is ABSENT gets NOTHING — the same
 * no-storage-churn call `migrateMaxModifierPicks` and `migrateRetireProgressiveAllowPlayerReorder`
 * both record: an absent block has no authored failure output to award and no surface to
 * observe the policy on, so seeding one would touch every system in the world to change
 * nothing. It will pick up the read-time default the first time the GM authors that check,
 * which is a system they are creating rather than one they are upgrading.
 *
 * An ALREADY-SEEDED value always wins, which is what makes this idempotent without relying
 * on the version gate — and the View Lab depends on that directly: it boots the real runner
 * over its fixtures with no `migrationVersion`, so every migration runs on every lab build.
 *
 * ## It reports nothing
 *
 * Unlike `1.21.0` it adds no key to the runner's three return literals, because there is no
 * GM notice to give: its entire observable effect is that nothing observable changes.
 *
 * ## The runner's before-any-load ordering is load-bearing
 *
 * `_runMigrations()` runs before any manager reads persisted data, and all three check
 * normalizers are allowlist rebuilds. A save running first would emit the `perRecord`
 * default onto every check — and this migration would then find a value already present
 * and correctly decline to overwrite it, permanently locking in the behaviour change it
 * exists to prevent.
 *
 * ## Downgrading to 1.24.0 is CLEAN
 *
 * That release's normalizers do not emit `failureResultPolicy`, so the key is dropped on
 * the next save — and since that release has no failure-result capability at all, nothing
 * changes behaviourally. This is the one recent migration of which that is true, so it is
 * deliberately NOT marked `downgradeLosesData`.
 *
 * Mutated setting key: `craftingSystems` (and only it).
 */

import { SEEDED_FAILURE_RESULT_POLICY } from '../utils/failureResultPolicy.js';

/** The three activity check blocks that carry a failure-result policy. */
const CHECK_KEYS = Object.freeze([
  'craftingCheck',
  'salvageCraftingCheck',
  'gatheringCraftingCheck',
]);

const POLICY_KEY = 'failureResultPolicy';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Apply the whole 1.25.0 transform to ONE system.
 *
 * The argument is mutated in place, so callers must hand over a structure they already own
 * (a clone). Splitting the per-system transform out this way is what lets the world-setting
 * migration below and the export-payload upcast in `migrateExportPayload.js` share one
 * derivation instead of maintaining two copies: an export bundle carries exactly one
 * system, so there is nothing to group.
 *
 * The guard is `POLICY_KEY in check`, not a truthiness or validity test, so a value the
 * GM authored — including one this build would normalize away — is never overwritten by a
 * migration whose only job is to decide the ABSENT case.
 *
 * @param {unknown} system - one raw crafting system, mutated in place.
 */
export function applySeededFailureResultPolicy(system) {
  if (!_isPlainObject(system)) return;
  for (const key of CHECK_KEYS) {
    const check = system[key];
    if (!_isPlainObject(check)) continue;
    if (POLICY_KEY in check) continue;
    check[POLICY_KEY] = SEEDED_FAILURE_RESULT_POLICY;
  }
}

/**
 * Runner entry point.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {Array<object>} [data.recipes] Raw recipes setting, returned unchanged.
 * @returns {{ systems: Array<object>, recipes: Array<object> }}
 */
export function migrateSeedFailureResultPolicy(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  const recipes = structuredClone(data.recipes ?? null);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  for (const system of systems) applySeededFailureResultPolicy(system);

  return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
}
