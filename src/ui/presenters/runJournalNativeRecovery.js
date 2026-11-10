/**
 * Native Reconciliation's read side: a legacy run's native recovery evidence, whether the viewer
 * may close it, and the closed record a history entry carries.
 */
import { normalizeList } from '../../systems/gatheringEngineInternals.js';
import {
  gmReconciliationRecord,
  holdsUncertainSettlement,
} from '../../systems/runHistoryEvidence.js';
import { getRunLifecycleContract } from '../../systems/runLifecycleState.js';

const PHASES = Object.freeze({
  complete: 'applied',
  pending: 'applying',
  uncertain: 'applying',
  notApplicable: 'notApplicable',
});

/** A crafting record must name its closed stage, so a record without one reads as absent. */
function closedRecord(run) {
  if (run?.status !== 'cancelled') return null;
  return gmReconciliationRecord(run.gmReconciliation, { staged: Array.isArray(run.steps) });
}

/** The closed stage, else on a live run the first uncertain stage, else the current one. */
function settlementOwner(run, { closed, live }) {
  if (run.historySettlement) return run;
  const steps = normalizeList(run.steps);
  const fallback = steps[closed ? closed.stepIndex : run.currentStepIndex] ?? null;
  return (live && steps.find(holdsUncertainSettlement)) || fallback;
}

function ownerReceipts(owner, key) {
  return key === 'consumption'
    ? normalizeList(owner.consumedIngredients ?? owner.consumedComponents)
    : [owner.createdResults, owner.currencyCredits, owner.knowledgeGrants].flatMap(normalizeList);
}

function recoveryEvidence(owner, { closed, entitled, project }) {
  const settlement = owner?.historySettlement;
  const states = Object.values(settlement ?? {});
  if (!states.some((state) => state === 'pending' || state === 'uncertain')) return null;
  const required = !closed && states.includes('uncertain');
  const effects = ['consumption', 'awards']
    .filter((key) => settlement[key])
    .map((key, index) => ({
      index,
      kind: key === 'consumption' ? 'consumeItems' : 'awardItems',
      phase: PHASES[settlement[key]],
      hasReceipt: true,
      receipt: entitled ? project(ownerReceipts(owner, key)) : null,
    }));
  let status = required ? 'recoveryRequired' : 'planned';
  if (closed) status = 'gmClosed';
  return {
    status,
    required,
    appliedEffectCount: effects.filter((effect) => effect.phase === 'applied').length,
    effectCount: effects.length,
    effects,
    uncertainEffectIndex: effects.find((effect) => effect.phase === 'applying')?.index ?? null,
  };
}

/** Whether the seam would accept this run: salvage settles on the run, crafting on its stages. */
function reconcilable(run, runType) {
  if (runType === 'salvage') return holdsUncertainSettlement(run);
  return runType === 'crafting' && normalizeList(run.steps).some(holdsUncertainSettlement);
}

/**
 * `project` maps receipt entries to their projected rows. `activeGM` alone opens the
 * `reconcileUncertain` action, and `gmReconciliation` is withheld from a viewer not `entitled`.
 */
export function nativeRecoveryProjection({ run, runType, live, entitled, activeGM, project }) {
  const none = { recoveryEvidence: null, reconcileUncertain: false, gmReconciliation: null };
  if (!run || getRunLifecycleContract(run) !== 'legacy') return none;
  const closed = live ? null : closedRecord(run);
  const owner = settlementOwner(run, { closed, live });
  return {
    recoveryEvidence: recoveryEvidence(owner, { closed, entitled, project }),
    reconcileUncertain: activeGM === true && live && reconcilable(run, runType),
    gmReconciliation:
      closed && entitled
        ? { disposition: closed.disposition, userName: closed.userName, note: closed.note ?? null }
        : null,
  };
}
