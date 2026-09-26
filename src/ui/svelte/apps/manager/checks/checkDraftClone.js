/**
 * Detached copies of a system's check config, one per staged Checks Studio draft. Each clone
 * fills the defaults the editors render, so a draft and its baseline built from the same source
 * compare equal.
 */
import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';
import { normalizePreviewSandbox } from '../../../../../systems/progressiveCheckSandbox.js';

// The unified trigger block (issue 419), carried on every check draft so authoring it persists.
export function cloneCheckBreakage(checkBreakage) {
  const source = checkBreakage && typeof checkBreakage === 'object' ? checkBreakage : {};
  return {
    triggers: Array.isArray(source.triggers)
      ? source.triggers.map((trigger) => ({
          id: trigger?.id,
          condition:
            trigger?.condition && typeof trigger.condition === 'object'
              ? { ...trigger.condition }
              : null,
          outcome: ['success', 'failure', 'none'].includes(trigger?.outcome)
            ? trigger.outcome
            : 'none',
          breakTools: trigger?.breakTools === true,
          // Copied, not normalized: the draft holds what the GM authored and
          // `_normalizeTierStep` clamps it on save (issue 975).
          tierStep:
            trigger?.tierStep && typeof trigger.tierStep === 'object'
              ? { ...trigger.tierStep }
              : { mode: 'none', steps: 1, tierId: null },
        }))
      : [],
  };
}

// `rollExpression` is a read alias folded into `rollFormula` and never emitted.
function routedRollFormula(source) {
  if (typeof source.rollFormula === 'string') return source.rollFormula;
  return typeof source.rollExpression === 'string' ? source.rollExpression : '';
}

export function cloneRoutedCheck(routed) {
  const source = routed && typeof routed === 'object' ? routed : {};
  const dc = Number(source.dc);
  return {
    type: source.type === 'fixed' ? 'fixed' : 'relative',
    rollFormula: routedRollFormula(source),
    dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
    thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    tiers: Array.isArray(source.tiers) ? source.tiers.map((tier) => ({ ...tier })) : [],
    relativeOutcomes: Array.isArray(source.relativeOutcomes)
      ? source.relativeOutcomes.map((outcome) => ({ ...outcome }))
      : [],
    fixedOutcomes: Array.isArray(source.fixedOutcomes)
      ? source.fixedOutcomes.map((outcome) => ({ ...outcome }))
      : [],
    checkBreakage: cloneCheckBreakage(source.checkBreakage),
    evaluation: normalizeCheckEvaluation(source.evaluation),
  };
}

export function cloneSimpleCheck(simple) {
  const source = simple && typeof simple === 'object' ? simple : {};
  const dc = Number(source.dc);
  return {
    rollFormula: typeof source.rollFormula === 'string' ? source.rollFormula : '',
    dc: Number.isFinite(dc) ? Math.trunc(dc) : 15,
    thresholdMode: source.thresholdMode === 'exceed' ? 'exceed' : 'meet',
    dcMode: source.dcMode === 'dynamic' ? 'dynamic' : 'static',
    tiers: Array.isArray(source.tiers) ? source.tiers.map((tier) => ({ ...tier })) : [],
    macroUuid: source.macroUuid || null,
    checkBreakage: cloneCheckBreakage(source.checkBreakage),
    evaluation: normalizeCheckEvaluation(source.evaluation),
  };
}

// An activity check's `enabled` flag, which the rail's Active switch stages.
export function readCheckActive(config) {
  return config?.enabled === true;
}

export function cloneProgressiveCheck(progressive) {
  const source = progressive && typeof progressive === 'object' ? progressive : {};
  const preview = normalizePreviewSandbox(source.preview);
  const draft = {
    awardMode: ['partial', 'equal', 'exceed'].includes(source.awardMode)
      ? source.awardMode
      : 'equal',
    rollFormula: typeof source.rollFormula === 'string' ? source.rollFormula : '',
    checkBreakage: cloneCheckBreakage(source.checkBreakage),
    evaluation: normalizeCheckEvaluation(source.evaluation),
  };
  // Attached rather than spread, so an absent preview sandbox (issue 1097) stays absent in both
  // the draft and its baseline.
  if (preview) draft.preview = preview;
  return draft;
}
