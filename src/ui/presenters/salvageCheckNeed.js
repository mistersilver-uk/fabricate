import { activeCheckEvaluation, isFixedSumOver } from '../../systems/checkTarget.js';
import { countRequired } from '../../systems/countCheck.js';
import { isCountCheck } from '../../systems/salvageCheckUsability.js';

import { comparisonText, describeCheckTarget } from './checkDescriptor.js';

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
 * The Salvage tab's target for a summed pass/fail or relative check other than sum/over/fixed
 * (issue 2005): the banner's `rule`, and the check card's `{ direction, text, source }` or
 * `{ unresolved }` for the salvaging character. Null for sum/over/fixed, a count, stages or ranges.
 */
export function salvageCheckTarget({ mode, config, component, actor, localize }) {
  const evaluation = activeCheckEvaluation(config);
  const routedType = config?.type === 'fixed' ? 'fixed' : 'relative';
  if (evaluation.product !== 'sum' || isFixedSumOver(evaluation)) return null;
  if (mode === 'progressive' || (mode === 'routed' && routedType === 'fixed')) return null;
  const target = describeCheckTarget({
    config,
    tier: { adjustment: component?.salvage?.adjustmentOverride ?? null, name: '' },
    evaluation,
    anchor: salvageAnchorDc({ mode, routedType, config, component }),
    actor,
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
