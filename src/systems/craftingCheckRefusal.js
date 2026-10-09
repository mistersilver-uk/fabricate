/**
 * The crafting check's pre-roll target, one implementation for `CraftingEngine` and the player
 * listing (issue 2139): the selected recipe tier, the fixed anchor, the character value or count
 * pool, and whether the check the recipe's mode rolls refuses the actor before any roll.
 */

import { resolveActiveCraftingCheckFormula } from './checkModifierResolver.js';
import { activeCheckEvaluation, actorRollData, progressiveTargetRefusal } from './checkTarget.js';
import { countRequired, resolveActivityCheck } from './countCheck.js';

/** The recipe's selected difficulty tier on a check config, while it still exists. */
export function selectedCheckTier(config, recipe) {
  const tierId = recipe?.checkTierId;
  if (!tierId) return null;
  const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
  return tiers.find((entry) => entry?.id === tierId) ?? null;
}

/** The fixed DC before any macro: the selected difficulty tier, else the static default, else 15. */
export function craftingCheckAnchorDc(config, recipe) {
  const fallback = Number.isFinite(Number(config?.dc)) ? Math.trunc(Number(config.dc)) : 15;
  const tierDc = Number(selectedCheckTier(config, recipe)?.dc);
  return Number.isFinite(tierDc) ? Math.trunc(tierDc) : fallback;
}

/**
 * The target before any macro: the anchor, or the character value adjusted by the selected tier,
 * else the base; a count check validates its pool and answers its required count instead.
 */
export function resolveCraftingCheckTarget(
  config,
  recipe,
  actor,
  readRollData = () => actorRollData(actor)
) {
  const tier = selectedCheckTier(config, recipe);
  return resolveActivityCheck(config, {
    anchor: craftingCheckAnchorDc(config, recipe),
    override: tier?.adjustment,
    label: tier?.name ?? '',
    required: countRequired(activeCheckEvaluation(config), tier?.successes),
    readRollData,
  });
}

/**
 * The active check's pre-roll decision, `{ evaluation, progressive, resolved, refuses }`: a summed
 * progressive check refuses only roll-under, and a refusal counts only for a used or required check.
 */
export function resolveActiveCheckTarget(activeCheck, recipe, actor, readRollData) {
  const evaluation = activeCheckEvaluation(activeCheck.config);
  const progressive = activeCheck.slot === 'progressive';
  let resolved = { ok: true, target: null, source: null };
  if (progressive && evaluation.product !== 'count') {
    const reason = progressiveTargetRefusal(evaluation);
    if (reason) resolved = { ok: false, reason };
  } else if (activeCheck.slot) {
    resolved = resolveCraftingCheckTarget(activeCheck.config, recipe, actor, readRollData);
  }
  const refuses = !resolved.ok && (activeCheck.checkUsable || activeCheck.requiresCheck);
  return { evaluation, progressive, resolved, refuses: refuses === true };
}

/** A roll-data reader that reads `actor` once, so a listing pass checks every row on one read. */
export function memoizedRollData(actor) {
  let rollData;
  return () => (rollData ??= actorRollData(actor));
}

/** Whether the recipe's check refuses `actor` before any roll; `false` with no actor. */
export function craftingCheckRefuses(system, recipe, actor, readRollData) {
  if (!actor) return false;
  const activeCheck = resolveActiveCraftingCheckFormula(system);
  return resolveActiveCheckTarget(activeCheck, recipe, actor, readRollData).refuses;
}
