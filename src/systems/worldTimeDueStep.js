/**
 * Whether the world-time scan takes a crafting run (D-010): the one rule the scan and the Journal's
 * "finishes this stage as time passes" bolt both read, so the two cannot disagree.
 */
import { RUN_JOURNAL_KEYS } from './runJournalReconstruction.js';
import { getRunLifecycleContract } from './runLifecycleState.js';

/**
 * The run's current stage record when the scan would take it at `worldTime`, else null. A null
 * `worldTime` drops the clock and asks whether it will be taken once its gate passes;
 * `owesAwardChoice(run)` is the stage start's own owed-pick predicate.
 */
export function worldTimeDueStep(run, { worldTime = null, owesAwardChoice = () => false } = {}) {
  if (getRunLifecycleContract(run) !== 'current') return null;
  if (run.status !== 'waitingTime' || run.completionMode !== 'worldTime' || run.pauseState) {
    return null;
  }
  if (RUN_JOURNAL_KEYS.some((key) => run[key] && run[key].status !== 'committed')) return null;
  const index = Number(run.currentStepIndex);
  if (!Number.isSafeInteger(index)) return null;
  const step = run.steps?.[index];
  if (!step?.timeGate) return null;
  if (worldTime !== null && Number(worldTime) < Number(step.timeGate.availableAt || 0)) return null;
  return owesAwardChoice(run) ? null : step;
}
