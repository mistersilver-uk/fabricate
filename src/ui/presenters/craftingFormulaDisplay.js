/**
 * The check formula line the crafting listing shows: a summed check's authored formula resolved for
 * the acting character, and a count check's pool line. Pure over its arguments; the Foundry-facing
 * resolver and `localize` are injected, so this stays free of Foundry's `Roll` global.
 */
import { buildCheckModifierContext } from '../../systems/checkModifierResolver.js';
import { actorRollData } from '../../systems/checkTarget.js';
import { countFormulaValues, resolvePool } from '../../systems/countEvaluation.js';

const COUNT_FORMULA_KEY = 'FABRICATE.Check.CountRoll.Pool';

/**
 * A summed check's authored formula and its display resolved for the acting character.
 * `resolvedFormula` is null when not attempted (no actor / no dice engine), and `formulaResolved`
 * is false when the formula does not reduce to a number for this actor.
 */
export function sumFormulaDisplay(
  { rollFormula, craftingActor, system, recipe, evaluation },
  { resolveCheckFormula }
) {
  const resolution =
    rollFormula.length > 0 && craftingActor
      ? // The SAME check-modifier context the engine rolls with (issues 770, 1055, 1095), for the
        // CRAFTING activity, so the listed formula and the applied modifiers agree with the roll.
        resolveCheckFormula(
          rollFormula,
          craftingActor,
          buildCheckModifierContext(system, 'crafting', recipe),
          evaluation
        )
      : null;
  return {
    rollFormula: rollFormula.length > 0 ? rollFormula : null,
    resolvedFormula: resolution?.display ?? null,
    formulaResolved: resolution ? resolution.resolved === true : null,
    appliedModifiers: resolution?.modifiers ?? [],
  };
}

/**
 * A count check's formula line in place of its inert retained formula: the authored pool and
 * threshold, each bracketed when read from the character, else null when either is blank; and for
 * the acting character the pool resolved and floored, or `false` when a value cannot be read.
 */
export function countFormulaDisplay({ config, evaluation, craftingActor }, { localize }) {
  const { pool, direction } = evaluation;
  const comparison = config.thresholdMode;
  const line = (values) => localize(COUNT_FORMULA_KEY, countFormulaValues(values));
  const base = pool.base.trim();
  const threshold = pool.threshold.trim();
  const bracketed = (text, number) => (number.test(text) ? text : `(${text})`);
  const rollFormula =
    base && threshold
      ? line({
          dice: bracketed(base, /^\d+$/),
          die: pool.die,
          direction,
          comparison,
          threshold: bracketed(threshold, /^[+-]?\d+(?:\.\d+)?$/),
        })
      : null;
  if (!craftingActor) return { rollFormula, resolvedFormula: null, formulaResolved: null };
  const rollData = actorRollData(craftingActor);
  const resolved = resolvePool({ evaluation, thresholdMode: comparison, rollData });
  return {
    rollFormula,
    resolvedFormula: resolved.ok ? line(resolved.policy) : null,
    formulaResolved: resolved.ok,
  };
}
