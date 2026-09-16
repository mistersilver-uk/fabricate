/**
 * `1.20.0` — stamp `craftingCheck.maxModifierPicks = 1` onto systems already on `playerPicks`, whose
 * absent cap would otherwise read as UNLIMITED (issue 1055; spec § Modifier Pick Cap Migration).
 * ONLY `playerPicks` is stamped: `bySubject` TRUNCATES a subject's pick to the cap, so a stamp of 1
 * there would discard picks the GM authored. THE STAMP IS CONDITIONAL ON PURPOSE.
 */

import {
  normalizeModifierPolicy,
  resolveMaxModifierPicks,
} from '../systems/checkModifierResolver.js';

/** The one combination rule whose historical behaviour was a bound of exactly one pick. */
const HISTORICALLY_SINGLE_PICK_POLICY = 'playerPicks';

/** The bound that reproduces that behaviour under the generalized cap. */
const HISTORICAL_PICK_LIMIT = 1;

const MAX_PICKS_KEY = 'maxModifierPicks';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Apply the whole `1.20.0` transform to ONE system, mutated in place, so callers hand over a
 * structure they already own. Split out so the world-setting migration and `migrateExportPayload.js`
 * share ONE derivation: an export bundle carries exactly one system.
 * IT DELIBERATELY DOES NOT SEED A MISSING CHECK BLOCK, the same call two sibling migrations make: a
 * system with no check block has no catalogue, so no modifiers to pick and no cap to observe — and
 * it cannot be on `playerPicks`, since that rule is persisted in the very block that is missing.
 * Both reads go through the resolver rather than re-deriving its rules, so the migration and the
 * engine cannot disagree about what an absent cap means.
 */
export function applyMaxModifierPicks(system) {
  if (!_isPlainObject(system)) return;
  const check = _isPlainObject(system.craftingCheck) ? system.craftingCheck : null;
  if (!check) return;
  if (normalizeModifierPolicy(check.defaultModifierPolicy) !== HISTORICALLY_SINGLE_PICK_POLICY) {
    return;
  }
  // `Infinity` is the resolver's report for every unbounded form — absent, `null`, non-integer,
  // non-positive — so this is exactly "does not already carry a usable cap".
  if (Number.isFinite(resolveMaxModifierPicks(check))) return;
  check[MAX_PICKS_KEY] = HISTORICAL_PICK_LIMIT;
}

/** Runner entry point. */
export function migrateMaxModifierPicks(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  const recipes = structuredClone(data.recipes ?? null);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  for (const system of systems) applyMaxModifierPicks(system);

  return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
}
