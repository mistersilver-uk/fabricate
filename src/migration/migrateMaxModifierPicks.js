/**
 * 1.20.0 — Preserve the historical single-pick behaviour of `playerPicks` by stamping
 * `craftingCheck.maxModifierPicks = 1` onto the systems that already used it (issue 1055;
 * pure, clone-first, idempotent, version-gated).
 *
 * WHY THIS EXISTS — read this before deleting it as redundant. Before issue 1055,
 * `playerPicks` meant "the player picks EXACTLY ONE modifier": the roll prompt was a radio
 * group and the non-interactive fallback was `max(...)`. Issue 1055 generalizes both to a
 * bounded multi-pick governed by the new `craftingCheck.maxModifierPicks`, and
 * `resolveMaxModifierPicks` (`craftingModifierResolver.js`) reads an ABSENT cap as
 * UNLIMITED. Every system already on `playerPicks` carries no cap — the field did not
 * exist when it was authored — so without this stamp the upgrade would silently widen
 * every one of those systems from "pick one" to "pick everything", and their
 * `@craftingmod` would jump from `max(...)` to the full sum. This migration writes back
 * the bound those systems always had, exactly once.
 *
 * ONLY `playerPicks` IS STAMPED. The other three rules are deliberately left absent, i.e.
 * unlimited:
 *
 * - `addAll` and `highest` do not select at all, so a cap means nothing to them and
 *   stamping one would only leak a bound into any later switch to a selecting rule.
 * - `byRecipe` ("Recipe picks") is the other selecting rule, but its historical behaviour
 *   was NOT single-pick: a recipe already on disk may legitimately have picked several
 *   modifiers, and `resolveEligibleModifierIds` TRUNCATES a recipe's pick to the cap. A
 *   stamp of 1 here would therefore silently discard picks the GM authored. Unlimited is
 *   the only value that preserves them, and a GM who wants a bound can set one.
 *
 * `byRecipe` is NOT mapped or retired at either level. It is a first-class combination
 * rule again — the recipe author selecting at recipe-edit time, the parallel of the player
 * selecting at roll time — so a persisted `byRecipe` is valid data that must survive
 * untouched.
 *
 * THE STAMP IS CONDITIONAL ON PURPOSE — do not "simplify" it into an unconditional write.
 * An authored cap always wins, for two reasons. It makes the migration idempotent under
 * re-run without relying on the version gate, and the View Lab depends on it directly:
 * `tests/view-lab/world/labWorld.js` boots the real runner over its fixtures
 * (`fabricate.initialize()`), the shim sets `game.user` to `game.users.activeGM` so the
 * primary-GM gate passes, and no lab fixture seeds `migrationVersion` — so `lastRunVersion`
 * is `'0.0.0'` and EVERY migration runs on EVERY lab build. An unconditional write would
 * overwrite an authored cap and corrupt the exact frame that case exists to capture.
 *
 * PURE AND CLONE-FIRST. The runner spread-merges a migration's return value
 * (`data = { ...data, ...result }`), so this returns `{ recipes, systems }` rather than
 * mutating the runner's payload. Clone-first is also what makes the no-throw guarantee
 * total: the runner restores its pre-migration checkpoint only on the FATAL branch — a
 * non-fatal throw is a bare `console.warn` and the pass continues to persist — so an
 * in-place migration that threw halfway would persist a half-applied world. Nothing here
 * throws (every level is guarded and a malformed system/check is skipped rather than
 * repaired — normalization is the normalizer's job), and because only the clone is ever
 * touched, even a hypothetical throw leaves the runner's payload untouched.
 *
 * THE RECIPE PAYLOAD IS READ AND RETURNED UNCHANGED, on purpose. Recipes are the other
 * half of this feature's data, so returning them makes the deliberate no-op explicit
 * rather than leaving a reader to wonder whether they were forgotten — and the runner
 * compares each setting's JSON against its pre-pass snapshot before writing, so an
 * unchanged clone persists nothing. In particular a recipe's legacy
 * `craftingModifier.policy` is NOT stripped: the resolver no longer consults it, so it is
 * inert, and leaving it on disk is what keeps the downgrade below lossless.
 *
 * Mutated setting key: `craftingSystems` (and only it).
 *
 * Idempotent: the stamp fires only where the cap is still unbounded, so a second pass
 * finds every affected system already capped and changes nothing.
 *
 * Downgrade target `1.19.0` is lossless. `maxModifierPicks` is a key the pre-change build
 * never knew, and its `_normalizeCheckModifierConfig` is an allowlist literal that never
 * spreads its source, so it silently drops the key on read; that build's `playerPicks`
 * already means "pick one", which is exactly what the dropped cap encoded. No other field
 * is touched, so a downgraded world lands on that release's own schema and behaviour with
 * no data loss.
 */

import {
  normalizeModifierPolicy,
  resolveMaxModifierPicks,
} from '../systems/craftingModifierResolver.js';

/** The one combination rule whose historical behaviour was a bound of exactly one pick. */
const HISTORICALLY_SINGLE_PICK_POLICY = 'playerPicks';

/** The bound that reproduces that behaviour under the generalized cap. */
const HISTORICAL_PICK_LIMIT = 1;

const MAX_PICKS_KEY = 'maxModifierPicks';

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Apply the whole 1.20.0 transform to ONE system.
 *
 * The argument is mutated in place, so callers must hand over a structure they already own
 * (a clone). Splitting the per-system transform out this way is what lets the world-setting
 * migration below and the export-payload upcast in `migrateExportPayload.js` share one
 * derivation instead of maintaining two copies of it: an export bundle carries exactly one
 * system, so there is nothing to group.
 *
 * IT DELIBERATELY DOES NOT SEED A MISSING CHECK BLOCK — this omission is a decision, not an
 * oversight (the same call `migrateRetireProgressiveAllowPlayerReorder` makes, for the same
 * reason: no storage churn for zero observable change). The modifier catalogue
 * `checkModifiers` lives INSIDE `craftingCheck`, so a system with no check block has no
 * catalogue, hence no modifiers to pick from and no cap to observe; it also cannot be on
 * `playerPicks`, since that rule is persisted in the very block that is missing.
 *
 * Both reads go through the resolver rather than re-deriving its rules here, so the
 * migration and the engine cannot disagree about which rules exist or about what an absent
 * cap means.
 *
 * @param {unknown} system - one raw crafting system, mutated in place.
 */
export function applyMaxModifierPicks(system) {
  if (!_isPlainObject(system)) return;
  const check = _isPlainObject(system.craftingCheck) ? system.craftingCheck : null;
  if (!check) return;
  if (normalizeModifierPolicy(check.defaultModifierPolicy) !== HISTORICALLY_SINGLE_PICK_POLICY) {
    return;
  }
  // `Infinity` is the resolver's report for every unbounded form — absent, `null`,
  // non-integer, non-positive — so this is exactly "does not already carry a usable cap",
  // and an authored cap survives untouched.
  if (Number.isFinite(resolveMaxModifierPicks(check))) return;
  check[MAX_PICKS_KEY] = HISTORICAL_PICK_LIMIT;
}

/**
 * Runner entry point.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {Array<object>} [data.recipes] Raw recipes setting, returned unchanged.
 * @returns {{ systems: Array<object>, recipes: Array<object> }}
 */
export function migrateMaxModifierPicks(data = {}) {
  const systems = structuredClone(data.systems ?? null);
  const recipes = structuredClone(data.recipes ?? null);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  for (const system of systems) applyMaxModifierPicks(system);

  return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
}
