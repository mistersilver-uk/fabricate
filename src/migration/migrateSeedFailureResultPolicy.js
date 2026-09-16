/**
 * `1.25.0` — seed `failureResultPolicy: 'never'` onto every check block that ALREADY EXISTS on disk
 * (issue 1098; spec § Failure-Result Policy Seed Migration owns every rule, its no-behaviour-change
 * purpose and why the runner's before-any-load ordering is load-bearing).
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
 * Apply the whole `1.25.0` transform to ONE system, mutated in place. Split out so the
 * world-setting migration and `migrateExportPayload.js` share ONE derivation.
 * The guard is `POLICY_KEY in check`, not a truthiness or validity test, so a value the GM authored
 * — including one this build would normalize away — is never overwritten by a migration whose only
 * job is to decide the ABSENT case.
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

/** Runner entry point. */
export function migrateSeedFailureResultPolicy(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  const recipes = structuredClone(data.recipes ?? null);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  for (const system of systems) applySeededFailureResultPolicy(system);

  return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
}
