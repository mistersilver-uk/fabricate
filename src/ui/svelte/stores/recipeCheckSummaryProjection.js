/**
 * The recipe browser row's check pill, projected from the system's active crafting check
 * (issue 643 §9), a pure leaf beside `adminRecipeRowProjection.js`. A counting check (issue 2006)
 * rolls with no retained formula and names each recipe's successes needed, never its DC.
 */
import { activeCheckEvaluation } from '../../../systems/checkTarget.js';
import { isCountCheck } from '../../../systems/salvageCheckUsability.js';
import { checkTierUnit } from '../apps/manager/recipe/recipeOverviewSelectOptions.js';

/**
 * The crafting check a recipe row's check pill resolves against, keyed off the
 * SYSTEM's resolution mode. `routedByCheck` authors its check on the `routed`
 * slot; `simple`, `alchemy` and `routedByIngredients` share the `simple`
 * pass/fail slot; `progressive` has its own.
 * @private
 */
function _recipeCheckConfig(system) {
  const mode = system?.resolutionMode || 'simple';
  if (mode === 'routedByCheck') return system?.craftingCheck?.routed || null;
  if (mode === 'progressive') return system?.craftingCheck?.progressive || null;
  return system?.craftingCheck?.simple || null;
}

/**
 * The check pill the recipe row renders (issue 643 §9). The row cannot derive
 * this — the DC lives on the SYSTEM's check, keyed by the recipe's `checkTierId`
 * — so it is projected here.
 *
 * A check is USABLE only when it has an authored `rollFormula` or counts successes; "checks
 * enabled" is not the same thing. The DC resolution mirrors
 * `CraftingEngine._resolveSimpleCheckDc`: the recipe's selected tier wins, then
 * the check's static default.
 *
 * The two check-less kinds are NOT the same fact, and the row must not tell the GM
 * they are:
 *
 *  - `ingredients` — a `routedByIngredients` system with no usable check. Results
 *    route off the ingredient set that was used, so the recipe resolves perfectly
 *    well with no roll. This is a working configuration, reported neutrally.
 *  - `none` — every other mode with no usable check. The system cannot roll for this
 *    recipe, which is a state the GM should be able to SCAN a library for, so it
 *    carries a warning rather than an em dash that says nothing.
 *
 * Everything that depends on the SYSTEM alone is resolved ONCE per cohort here rather than
 * once per row (issue 1081).
 *
 * Three of the six branches in the original per-row derivation could not vary by recipe at
 * all — they read the system's mode, its check config and that config's `dcMode` — so each
 * collapses to a `constant` summary shared by every row. Only the last branch is per-recipe,
 * and its `tiers.find()` scan becomes a first-wins `Map` lookup (matching `Array#find`'s
 * precedence for a duplicated tier id).
 *
 * @param {object} system the selected crafting system (raw, not projected).
 * @returns {{constant: object|null, kind?: string, tierDcById: Map<string, number>, defaultDc: number}}
 */
export function recipeCheckContext(system) {
  const mode = system?.resolutionMode || 'simple';
  const constantOf = (kind) => ({ constant: Object.freeze({ kind, dc: null }) });

  // Alchemy's own check mode is system-level and independent of the crafting check;
  // `none` means the recipe resolves with no check at all.
  //
  // IT IS `checkOff`, NOT `none`, and the distinction is the difference between a
  // configuration and a fault. `none` renders the WARNING pill — "this system has no usable
  // crafting check" — which was a fair reading while `none` was an obscure mode. It is now
  // the state the Checks Studio's Active switch writes when a GM deliberately turns an
  // alchemy check off, so reporting it as a warning puts a triangle on every recipe in the
  // library, for a supported choice, with no per-recipe repair. A deliberate no-roll
  // configuration reads neutral, exactly as `progressive` and `ingredients` do.
  if (mode === 'alchemy' && (system?.alchemy?.checkMode || 'none') === 'none') {
    return constantOf('checkOff');
  }

  const config = _recipeCheckConfig(system);
  const rolls = isCountCheck(config) || Boolean(String(config?.rollFormula ?? '').trim());
  if (!config || !rolls) {
    return constantOf(mode === 'routedByIngredients' ? 'ingredients' : 'none');
  }
  if (mode === 'progressive') return constantOf('progressive');
  // A character value resolves per actor, so its pill names the source and sorts with the
  // number-less rows (issue 2005); a roll-under fixed number is a `target`, never a DC.
  const unit = checkTierUnit(config.evaluation);
  if (unit === 'add' || unit === 'multiply') return constantOf('attribute');
  // A dynamic DC is macro-resolved at craft time; there is no static number to show.
  if (config.dcMode === 'dynamic') {
    return constantOf(DYNAMIC_KINDS[unit] ?? 'dynamic');
  }
  if (unit === 'successes') return countCheckContext(config);

  const tierDcById = new Map();
  for (const entry of Array.isArray(config.tiers) ? config.tiers : []) {
    // FIRST-WINS, mirroring the `tiers.find()` this replaces: a duplicated tier id must
    // resolve to the same tier the scan resolved to.
    if (entry?.id !== undefined && !tierDcById.has(entry.id)) tierDcById.set(entry.id, entry.dc);
  }
  const defaultDc = Number(config.dc);
  return {
    constant: null,
    kind: unit === 'target' ? 'target' : 'dc',
    tierDcById,
    defaultDc: Number.isFinite(defaultDc) ? Math.trunc(defaultDc) : 15,
  };
}

const DYNAMIC_KINDS = Object.freeze({ target: 'dynamicTarget', successes: 'dynamicSuccesses' });

/**
 * A counting check's pill context: each tier's set successes needed (an unset tier falls back, as
 * the engine's `countRequired` does), else the pool's. It sorts through the same `dc` key.
 */
function countCheckContext(config) {
  const tierDcById = new Map();
  for (const entry of Array.isArray(config.tiers) ? config.tiers : []) {
    if (entry?.id === undefined || tierDcById.has(entry.id)) continue;
    tierDcById.set(entry.id, Number.isInteger(entry.successes) ? entry.successes : undefined);
  }
  const defaultDc = activeCheckEvaluation(config).pool.required;
  return { constant: null, kind: 'successes', tierDcById, defaultDc };
}

/**
 * The check pill for ONE recipe, against a cohort-scoped {@link recipeCheckContext}.
 *
 * A tier that EXISTS but carries a non-numeric `dc` falls through to the check's static
 * default, exactly as the `Number.isFinite(tierDc)` guard did before this was hoisted.
 *
 * @param {{constant: object|null, tierDcById: Map<string, number>, defaultDc: number}} context
 * @param {object} recipe the Recipe model.
 * @returns {{kind: 'none' | 'ingredients' | 'progressive' | 'dynamic' | 'dynamicTarget' |
 *   'dynamicSuccesses' | 'attribute' | 'dc' | 'target' | 'successes', dc: number | null}}
 */
export function recipeCheckSummary(context, recipe) {
  if (context.constant) return context.constant;
  const tierDc = recipe?.checkTierId ? Number(context.tierDcById.get(recipe.checkTierId)) : NaN;
  if (Number.isFinite(tierDc)) return { kind: context.kind, dc: Math.trunc(tierDc) };
  return { kind: context.kind, dc: context.defaultDc };
}
