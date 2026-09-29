import {
  buildCheckModifierContext,
  makeRollDataExpressionResolver,
  resolveCheckModifierContribution,
} from '../../systems/checkModifierResolver.js';
import { activeCheckEvaluation, isFixedSumOver } from '../../systems/checkTarget.js';
import { countRequired } from '../../systems/countCheck.js';
import { countFormulaValues, resolvePool } from '../../systems/countEvaluation.js';
import { isCountCheck } from '../../systems/salvageCheckUsability.js';
import { salvageToolsFor } from '../../systems/scopedEntityReads.js';

import { comparisonText, describeCheckTarget } from './checkDescriptor.js';
import { heldToolBonus } from './heldToolBonus.js';

/** The salvage check's fixed anchor; fixed routing, stages and a count check have none. */
function salvageAnchorDc({ mode, routedType, config, component }) {
  if (mode === 'progressive' || (mode === 'routed' && routedType === 'fixed')) return null;
  if (isCountCheck(config)) return null;
  const override = component?.salvage?.dcOverride;
  if (Number.isFinite(override)) return Math.trunc(override);
  const dc = Number(config?.dc);
  return Number.isFinite(dc) ? Math.trunc(dc) : 15;
}

/** The salvage DC shown to players: only a fixed sum/over check has a DC to meet or beat. */
export function salvageDisplayDc(input) {
  return isFixedSumOver(activeCheckEvaluation(input.config)) ? salvageAnchorDc(input) : null;
}

/**
 * What the salvage prompt adds to its target before any roll: the library modifiers it applies,
 * resolved as the versioned prompt resolves them, and the salvager's held Tool bonus, from the
 * same tool states the engine validates (the component's required Tools, on that one actor).
 */
function salvageBenefits({ system, component, recipeManager, actor }) {
  const context = buildCheckModifierContext(system, 'salvage', component);
  const modifiers = resolveCheckModifierContribution(
    context,
    makeRollDataExpressionResolver(actor)
  ).selected.filter((entry) => !entry.blocked);
  const tools = salvageToolsFor(system, component?.salvage);
  const states =
    tools.length > 0 && typeof recipeManager?.resolveToolStates === 'function'
      ? recipeManager.resolveToolStates({ craftingSystemId: system?.id ?? null }, tools, [actor], {
          primaryActor: actor,
        })
      : [];
  return { modifiers, tools: heldToolBonus([states]) };
}

/**
 * A count check's Salvage line for the salvaging character (issue 2006): the successes needed,
 * the die and the per-die test at that character's threshold, or `{ unresolved }` when the pool
 * cannot read them. Null where no single count applies.
 */
function countSalvageTarget({ mode, config, component, actor, evaluation, localize }) {
  const need = salvageCheckNeed({ mode, config, checkUsable: true, component });
  if (need.kind !== 'successes') return null;
  const rollData = actor?.getRollData?.() ?? actor?.system ?? {};
  const pool = resolvePool({ evaluation, thresholdMode: config?.thresholdMode, rollData });
  if (!pool.ok) {
    const label = localize('FABRICATE.App.Inventory.Detail.KindSalvage');
    const key =
      pool.refusedInput === 'threshold'
        ? 'FABRICATE.Check.Roll.TargetUnresolved'
        : 'FABRICATE.Check.Roll.PoolUnresolved';
    return { unresolved: localize(key, { label }) };
  }
  const { die, comparison, threshold } = countFormulaValues(pool.policy);
  const key =
    need.count === 1
      ? 'FABRICATE.Check.CountEvidence.SalvageLineOne'
      : 'FABRICATE.Check.CountEvidence.SalvageLine';
  const text = localize(key, { count: need.count, die, symbol: comparison, threshold });
  return { direction: evaluation.direction, text };
}

/**
 * The Salvage tab's target for a summed pass/fail or relative check other than sum/over/fixed
 * (issue 2005): the banner's `rule`, and the check card's `{ direction, text, source }` or
 * `{ unresolved }` for the salvaging character, naming the modifiers and held Tool bonus the
 * prompt adds. A count check states its successes needed and per-die test instead. Null for
 * sum/over/fixed, stages or ranges.
 */
export function salvageCheckTarget({
  mode,
  config,
  component,
  system = null,
  recipeManager = null,
  actor,
  localize,
}) {
  const evaluation = activeCheckEvaluation(config);
  if (evaluation.product === 'count') {
    return countSalvageTarget({ mode, config, component, actor, evaluation, localize });
  }
  const routedType = config?.type === 'fixed' ? 'fixed' : 'relative';
  if (evaluation.product !== 'sum' || isFixedSumOver(evaluation)) return null;
  if (mode === 'progressive' || (mode === 'routed' && routedType === 'fixed')) return null;
  const target = describeCheckTarget({
    config,
    tier: { adjustment: component?.salvage?.adjustmentOverride ?? null, name: '' },
    evaluation,
    anchor: salvageAnchorDc({ mode, routedType, config, component }),
    actor,
    ...salvageBenefits({ system, component, recipeManager, actor }),
    localize,
    activityKey: 'FABRICATE.App.Inventory.Detail.KindSalvage',
  });
  const comparison = comparisonText(evaluation, config, localize);
  const rule = localize('FABRICATE.App.Inventory.Salvage.BannerSimpleRuleTarget', { comparison });
  return { rule, ...target };
}

/**
 * Display-only need; evaluation continues to use the system's authored check. A character-value
 * target differs per actor, so a summed check reading one has no single target. A count check
 * needs the component's successes override, else its pool's required count, and names where
 * its modifiers go.
 */
export function salvageCheckNeed({ mode, config, checkUsable, component }) {
  if (!checkUsable) return { kind: 'noCheck' };
  const evaluation = activeCheckEvaluation(config);
  const summed = evaluation.product === 'sum';
  if (summed && evaluation.target.source === 'attribute') {
    return { kind: 'noSingleTarget', direction: evaluation.direction };
  }
  const routedType = mode === 'routed' && config?.type === 'fixed' ? 'fixed' : 'relative';
  if (!summed) {
    if (mode === 'progressive' || routedType === 'fixed') return { kind: 'noSingleTarget' };
    return {
      kind: 'successes',
      count: countRequired(evaluation, component?.salvage?.successesOverride),
      destination: evaluation.pool?.modifierDestination === 'threshold' ? 'threshold' : 'pool',
    };
  }
  const dc = salvageAnchorDc({ mode, routedType, config, component });
  if (!Number.isFinite(dc)) return { kind: 'noSingleTarget' };
  // Only a summed check reaches here: a count check returned above.
  return evaluation.direction === 'under' ? { kind: 'target', target: dc } : { kind: 'dc', dc };
}
