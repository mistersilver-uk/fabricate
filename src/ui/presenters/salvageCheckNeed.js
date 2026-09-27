import { activeCheckEvaluation } from '../../systems/checkTarget.js';
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
 * target differs per actor, so a summed check reading one has no single target.
 */
export function salvageCheckNeed({ mode, config, checkUsable, component }) {
  if (!checkUsable) return { kind: 'noCheck' };
  const evaluation = activeCheckEvaluation(config);
  const summed = evaluation.product === 'sum';
  if (summed && evaluation.target.source === 'attribute') return { kind: 'noSingleTarget' };
  const routedType = mode === 'routed' && config?.type === 'fixed' ? 'fixed' : 'relative';
  const dc = salvageDisplayDc({ mode, routedType, config, component });
  if (!Number.isFinite(dc)) return { kind: 'noSingleTarget' };
  return summed && evaluation.direction === 'under'
    ? { kind: 'target', target: dc }
    : { kind: 'dc', dc };
}
