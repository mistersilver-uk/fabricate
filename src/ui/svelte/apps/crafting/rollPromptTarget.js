/**
 * The roll prompt's target chip text, a summed roll-under target's explanation line, and a count
 * check's settled pool line, rule note and zero-pool notice.
 */
import { planModifierPlacement } from '../../../../systems/checkModifierRouter.js';
import { countFormulaValues, settledPoolDice } from '../../../../systems/countEvaluation.js';
import {
  formatCheckAdjustment,
  formatSignedStep,
} from '../../../../utils/checkAdjustmentFormat.js';
import { fill } from '../../../../utils/fillPlaceholders.js';

const signed = (value) => (value < 0 ? String(value) : `+${value}`);

/** A modifier's chip value: its prepared display, else its signed flat value. */
export function modifierValue(modifier) {
  if (typeof modifier?.display === 'string' && modifier.display) return modifier.display;
  const value = Number(modifier?.value);
  if (!Number.isFinite(value)) return '0';
  return signed(value);
}

function appliedModifiers(data, selectedIds) {
  const options = data.choicePlan.options;
  return options.length > 0
    ? options.filter((modifier) => selectedIds.includes(modifier.id))
    : (data.selectedModifiers ?? []);
}

/** The applied modifiers' flat values; a rolled one is rolled first, so it adds nothing yet. */
function flatModifierTotal(applied) {
  return applied.reduce((sum, modifier) => {
    const value = Number(modifier?.value);
    return Number.isFinite(value) ? sum + value : sum;
  }, 0);
}

/**
 * What the player's picks and typed bonus contribute before anything rolls: the flat total a
 * typed number adds, and the formulas still to roll, which the chip names as pending.
 */
function contributions(data, selectedIds, bonus) {
  const applied = appliedModifiers(data, selectedIds);
  const pending = applied
    // A rolling modifier carries `value: null` beside its display, as the resolver builds it.
    .filter((modifier) => modifier?.value === null && modifier.display)
    .map((modifier) => modifier.display.replace(/^\+\s*/, ''));
  const typed = String(bonus ?? '')
    .replace(/^\s*\+/, '')
    .trim();
  const flat = typed !== '' && Number.isFinite(Number(typed));
  // Text the dice engine rejects rolls nothing, so it is never named as a pending contribution.
  if (typed !== '' && !flat && globalThis.Roll?.validate?.(typed) !== false) pending.push(typed);
  const situational = flat ? Number(typed) : 0;
  return { modifiers: flatModifierTotal(applied), situational, pending };
}

/** `{actor} {expression} {value}`: the typed formula, named for the character it read. */
function basisParts(basis, labels, actorName) {
  const fact = fill(labels.targetValueOf, {
    actor: actorName,
    source: basis.expression,
    value: basis.value,
  });
  const parts = [fact.trim()];
  const adjustment = basis.adjustment;
  if (adjustment) {
    const value =
      adjustment.kind === 'multiply'
        ? formatCheckAdjustment('multiply', adjustment.value)
        : formatSignedStep(adjustment.value);
    parts.push(
      adjustment.label
        ? fill(labels.targetAdjustment, { label: adjustment.label, value })
        : fill(labels.targetDifficulty, { value })
    );
  }
  return parts;
}

/**
 * Any other chip keeps its prepared `chipText`. A summed roll-under chip names the target after
 * its flat modifiers, Tool bonus and typed flat bonus, which raise it, so it follows the player's
 * picks and typing; a rolled contribution is named as pending, never averaged in. The line names a
 * character-value basis always, and a fixed target only when something raised it. A count pool
 * also settles the `additionalDice` the player chose (issue 2008).
 */
export function rollPromptTarget(data, selectedIds, bonus = '', additionalDice = 0) {
  if (data.count) return countTarget(data, selectedIds, bonus, additionalDice);
  if (data.direction !== 'under') return { chipText: data.chipText, source: '' };
  const { labels } = data;
  const comparison = data.comparison === 'exceed' ? labels.exceed : labels.meet;
  const tools = Number.isFinite(data.toolBonus) ? data.toolBonus : 0;
  const { modifiers, situational, pending } = contributions(data, selectedIds, bonus);
  const parts = data.targetBasis
    ? basisParts(data.targetBasis, labels, data.actorName ?? '')
    : [fill(labels.targetBase, { value: data.dc })];
  if (tools) parts.push(fill(labels.targetTools, { value: formatSignedStep(tools) }));
  if (modifiers) parts.push(fill(labels.targetModifiers, { value: formatSignedStep(modifiers) }));
  if (situational) {
    parts.push(fill(labels.targetSituational, { value: formatSignedStep(situational) }));
  }
  const settled = fill(labels.targetValue, { target: data.dc + tools + modifiers + situational });
  const target =
    pending.length > 0
      ? fill(labels.targetPending, { target: settled, formula: pending.join(' + ') })
      : settled;
  return {
    chipText: `${target} · ${comparison}`,
    source: data.targetBasis || parts.length > 1 ? parts.join(' · ') : '',
  };
}

/**
 * A count check's line as the player's picks and typed bonus settle onto its pool or threshold
 * through the router, the pool floored after them (issue 2006): `{ chipText, source, formula, note,
 * zeroPool }`, plus the pool before bought dice (`reachPool`) and the formulas still to roll into it
 * (`pendingPool`). A rolled contribution is named as pending, and nothing is rolled or averaged.
 */
function countTarget(data, selectedIds, bonus, additionalDice) {
  const { count, labels, direction, comparison } = data;
  const unresolved = { chipText: data.chipText, source: '', formula: '', note: '', zeroPool: '' };
  if (![count.pool, count.die, count.threshold].every(Number.isFinite)) return unresolved;
  const { modifiers, situational, pending } = contributions(data, selectedIds, bonus);
  const destination = count.destination === 'threshold' ? 'threshold' : 'pool';
  const plan = planModifierPlacement({
    evaluation: { product: 'count', direction, pool: { modifierDestination: destination } },
    contributions: [modifiers, situational].map((value) => ({
      source: 'situational',
      label: '',
      form: 'scalar',
      value,
    })),
  });
  const zeroPoolFails = count.zeroPoolFails !== false;
  const settled = settledPoolDice(count.pool, plan.poolDelta + additionalDice, zeroPoolFails);
  const threshold = count.threshold + plan.thresholdDelta;
  const values = countFormulaValues({
    dice: settled.dice,
    die: count.die,
    direction,
    comparison,
    threshold,
  });
  let template = labels.countFormula;
  if (pending.length > 0) {
    template = destination === 'threshold' ? labels.countPendingThreshold : labels.countPendingDice;
  }
  return {
    chipText: data.chipText,
    source: '',
    formula: fill(template, { ...values, formula: pending.join(' + ') }),
    note: `${countRule(count, values, { threshold, direction }, labels)}${labels.countFaces}`,
    // A pending roll that adds dice may still lift the pool above zero.
    zeroPool:
      settled.zeroPool && !(pending.length > 0 && destination === 'pool')
        ? labels.countZeroPool
        : '',
    reachPool: {
      base: count.pool,
      poolDelta: plan.poolDelta,
      zeroPoolFails,
      dice: settledPoolDice(count.pool, plan.poolDelta, zeroPoolFails).dice,
    },
    pendingPool: destination === 'pool' ? pending : [],
  };
}

/**
 * `Success on {sym} {threshold}`, the character value it read, and how far modifiers moved it,
 * signed by the benefit: a +1 bonus reads `moved +1` whichever way the threshold travelled.
 */
function countRule(count, values, { threshold, direction }, labels) {
  const character = count.thresholdSource === 'character' && Number.isFinite(count.thresholdAnchor);
  const rule = character
    ? fill(labels.countRuleCharacter, {
        ...values,
        value: countFormulaValues({ threshold: count.thresholdAnchor }).threshold,
      })
    : fill(labels.countRule, values);
  const delta = Number.isFinite(count.thresholdAnchor) ? threshold - count.thresholdAnchor : 0;
  const moved = Number((direction === 'over' ? -delta : delta).toFixed(2));
  return moved === 0 ? rule : fill(labels.countRuleMoved, { rule, moved: formatSignedStep(moved) });
}
