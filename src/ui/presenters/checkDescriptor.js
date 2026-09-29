/**
 * The player check card's target line for a summed check other than sum/over/fixed (issue 2005):
 * `Target {T} · stay at or under` or `· meet or beat`, and for a character value the character's
 * name, the typed formula, its value and the adjustment, separated by middots as the prompt's line
 * is. Roll-under names the target with the applied flat modifiers, as the prompt chip does, and a
 * rolled one as pending; a value that cannot be read says so.
 */
import { attributeTargetBasis, resolveActivityTarget } from '../../systems/checkTarget.js';
import { formatCheckAdjustment, formatSignedStep } from '../../utils/checkAdjustmentFormat.js';

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

/** `stay at or under`, `stay under`, `meet or beat` or `beat`, for a summed check's direction. */
export function comparisonText(evaluation, config, localize) {
  const comparison = config?.thresholdMode === 'exceed' ? 'exceed' : 'meet';
  return localize(COMPARISON_KEYS[evaluation.direction === 'under' ? 'under' : 'over'][comparison]);
}

function selectedTier(config, recipe) {
  const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
  return recipe?.checkTierId
    ? (tiers.find((tier) => tier?.id === recipe.checkTierId) ?? null)
    : null;
}

/** `{actor} {expression} {value}`, then the adjustment named by its tier, else as difficulty. */
function sourceFacts(basis, actorName, localize) {
  const fact = localize('FABRICATE.App.Crafting.Check.TargetSource', {
    actor: actorName,
    expression: basis.expression,
    value: basis.value,
  }).trim();
  if (!basis.adjustment) return [fact];
  const value = formatCheckAdjustment(basis.adjustment.kind, basis.adjustment.value);
  const adjustment = basis.adjustment.label
    ? localize('FABRICATE.App.Crafting.Check.TargetAdjustment', {
        label: basis.adjustment.label,
        value,
      })
    : localize('FABRICATE.App.Crafting.Check.TargetDifficulty', { value });
  return [fact, adjustment];
}

/**
 * The applied library modifiers a roll-under target gains before the roll: their flat total, and
 * each rolled one's formula, which the prompt rolls first and so names as pending.
 */
function appliedBenefits(modifiers, direction) {
  const applied = direction === 'under' && Array.isArray(modifiers) ? modifiers : [];
  const flat = applied.reduce((sum, modifier) => {
    const value = Number(modifier?.value);
    return Number.isFinite(value) && modifier?.value !== null ? sum + value : sum;
  }, 0);
  const pending = applied
    .filter((modifier) => modifier?.value === null && typeof modifier.display === 'string')
    .map((modifier) => modifier.display.replace(/^\+\s*/, ''));
  return { flat, pending };
}

/** The benefits a roll-under target names: held Tool bonuses, then applied library modifiers. */
function rollUnderBenefits(tools, modifiers, direction) {
  const applied = appliedBenefits(modifiers, direction);
  const held = direction === 'under' && tools ? tools : { flat: 0, pending: [] };
  return {
    tools: held.flat,
    modifiers: applied.flat,
    pending: [...held.pending, ...applied.pending],
  };
}

/** Each nonzero benefit group as the prompt's line names it: `tools +2`, `modifiers +1`. */
function benefitParts({ tools, modifiers }, localize) {
  return [
    ['FABRICATE.App.Crafting.Check.TargetTools', tools],
    ['FABRICATE.App.Crafting.Check.TargetModifiers', modifiers],
  ]
    .filter(([, value]) => value)
    .map(([key, value]) => localize(key, { value: formatSignedStep(value) }));
}

function targetValue(target, pending, localize) {
  return pending.length === 0
    ? target
    : localize('FABRICATE.App.Crafting.Check.TargetPending', {
        target,
        formula: pending.join(' + '),
      });
}

/**
 * `{ direction, text, source }`, `{ unresolved: reason }`, or null when the card names no target:
 * sum/over/fixed keeps its DC chip, and a count, progressive, routed or macro-moved check, a
 * fixed-range one, or a character value with no acting character, has no single target to name.
 * `modifiers` are the library entries the display resolver applied for this character, `tools`
 * the held Tool bonus (`{ flat, pending }`, see `heldToolBonus`), and `tier` (`{ adjustment,
 * name }`) replaces the recipe's selected tier for an activity without recipes.
 */
export function describeCheckTarget({
  config,
  recipe = null,
  tier = null,
  evaluation,
  anchor,
  actor,
  modifiers = [],
  tools = null,
  localize,
  activityKey = 'FABRICATE.App.Nav.Crafting',
}) {
  if (config?.type === 'fixed') return null;
  if (evaluation.product !== 'sum' || config?.dcMode === 'dynamic') return null;
  const attribute = evaluation.target.source === 'attribute';
  if (!attribute && evaluation.direction !== 'under') return null;
  if (attribute ? !actor : !Number.isFinite(Number(anchor))) return null;
  const selected = tier ?? selectedTier(config, recipe);
  const override = selected?.adjustment ?? null;
  const readRollData = () => actor?.getRollData?.() ?? actor?.system ?? {};
  const resolved = resolveActivityTarget(config, {
    anchor: Math.trunc(Number(anchor)),
    override,
    readRollData,
  });
  if (!resolved.ok) {
    const label = localize(activityKey);
    return { unresolved: localize('FABRICATE.Check.Roll.TargetUnresolved', { label }) };
  }
  const benefits = rollUnderBenefits(tools, modifiers, evaluation.direction);
  const text = localize('FABRICATE.App.Crafting.Check.TargetLine', {
    target: targetValue(
      resolved.target + benefits.tools + benefits.modifiers,
      benefits.pending,
      localize
    ),
    comparison: comparisonText(evaluation, config, localize),
  });
  const basis = attribute
    ? attributeTargetBasis(config, {
        override,
        label: selected?.name ?? '',
        readRollData,
      })
    : null;
  const parts = [
    ...(basis
      ? sourceFacts(basis, actor?.name ?? '', localize)
      : [localize('FABRICATE.App.Crafting.Check.TargetBase', { value: resolved.target })]),
    ...benefitParts(benefits, localize),
  ];
  return {
    direction: evaluation.direction,
    text,
    source: basis || parts.length > 1 ? parts.join(' · ') : '',
  };
}
