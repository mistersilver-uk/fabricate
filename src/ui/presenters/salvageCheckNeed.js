import { activeCheckEvaluation } from '../../systems/checkTarget.js';
import { countRequired } from '../../systems/countCheck.js';
import { isCountCheck } from '../../systems/salvageCheckUsability.js';

/** The salvage DC shown to players; fixed routing, stages and a count check have no single DC. */
export function salvageDisplayDc({ mode, routedType, config, component }) {
  if (mode === 'progressive' || (mode === 'routed' && routedType === 'fixed')) return null;
  if (isCountCheck(config)) return null;
  const override = component?.salvage?.dcOverride;
  if (Number.isFinite(override)) return Math.trunc(override);
  const dc = Number(config?.dc);
  return Number.isFinite(dc) ? Math.trunc(dc) : 15;
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
  const dc = salvageDisplayDc({ mode, routedType, config, component });
  if (!Number.isFinite(dc)) return { kind: 'noSingleTarget' };
  // Only a summed check reaches here: a count check returned above.
  return evaluation.direction === 'under' ? { kind: 'target', target: dc } : { kind: 'dc', dc };
}
