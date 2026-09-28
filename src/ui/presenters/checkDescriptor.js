/**
 * The player check card's target line for a summed check other than sum/over/fixed (issue 2005):
 * `Target {T} · stay at or under` or `· meet or beat`, and for a character value the character's
 * name, the typed formula, its value and the adjustment. The target is before any benefit, so the
 * line never states a modifier the roll has not applied; a value that cannot be read says so.
 */
import { attributeTargetBasis, resolveActivityTarget } from '../../systems/checkTarget.js';
import { formatCheckAdjustment } from '../../utils/checkAdjustmentFormat.js';

const COMPARISON_KEYS = Object.freeze({
  under: {
    meet: 'FABRICATE.App.Crafting.Check.StayAtOrUnder',
    exceed: 'FABRICATE.App.Crafting.Check.StayUnder',
  },
  over: {
    meet: 'FABRICATE.App.Crafting.Check.MeetOrBeat',
    exceed: 'FABRICATE.App.Crafting.Check.Beat',
  },
});

function selectedTier(config, recipe) {
  const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
  return recipe?.checkTierId
    ? (tiers.find((tier) => tier?.id === recipe.checkTierId) ?? null)
    : null;
}

/** `{actor} {expression} {value}`, then the adjustment named by its tier, else as difficulty. */
function sourceFact(basis, actorName, localize) {
  const fact = localize('FABRICATE.App.Crafting.Check.TargetSource', {
    actor: actorName,
    expression: basis.expression,
    value: basis.value,
  });
  if (!basis.adjustment) return fact.trim();
  const value = formatCheckAdjustment(basis.adjustment.kind, basis.adjustment.value);
  const adjustment = basis.adjustment.label
    ? localize('FABRICATE.App.Crafting.Check.TargetAdjustment', {
        label: basis.adjustment.label,
        value,
      })
    : localize('FABRICATE.App.Crafting.Check.TargetDifficulty', { value });
  return `${fact.trim()}, ${adjustment}`;
}

/**
 * `{ direction, text, source }`, `{ unresolved: reason }`, or null when the card names no target:
 * sum/over/fixed keeps its DC chip, and a count, progressive, routed or macro-moved check, or a
 * character value with no acting character, has no single target to name.
 */
export function describeCheckTarget({ config, recipe, evaluation, anchor, actor, localize }) {
  if (evaluation.product !== 'sum' || config?.dcMode === 'dynamic') return null;
  const attribute = evaluation.target.source === 'attribute';
  if (!attribute && evaluation.direction !== 'under') return null;
  if (attribute ? !actor : !Number.isFinite(Number(anchor))) return null;
  const override = selectedTier(config, recipe)?.adjustment ?? null;
  const readRollData = () => actor?.getRollData?.() ?? actor?.system ?? {};
  const resolved = resolveActivityTarget(config, {
    anchor: Math.trunc(Number(anchor)),
    override,
    readRollData,
  });
  if (!resolved.ok) {
    const label = localize('FABRICATE.App.Nav.Crafting');
    return { unresolved: localize('FABRICATE.Check.Roll.TargetUnresolved', { label }) };
  }
  const comparison = config.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  const text = localize('FABRICATE.App.Crafting.Check.TargetLine', {
    target: resolved.target,
    comparison: localize(COMPARISON_KEYS[evaluation.direction][comparison]),
  });
  const basis = attribute
    ? attributeTargetBasis(config, {
        override,
        label: selectedTier(config, recipe)?.name ?? '',
        readRollData,
      })
    : null;
  return {
    direction: evaluation.direction,
    text,
    source: basis ? sourceFact(basis, actor?.name ?? '', localize) : '',
  };
}
