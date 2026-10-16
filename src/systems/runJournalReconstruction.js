/**
 * What recovery reconstruction does to a versioned crafting run's interrupted journals: the
 * stage's `executionJournal` and the award choice's `awardChoiceJournal` (issue 1773).
 */
import { observeExecutionJournal } from './runExecutionJournal.js';
import { getRunLifecycleContract } from './runLifecycleState.js';

export const RUN_JOURNAL_KEYS = Object.freeze(['executionJournal', 'awardChoiceJournal']);

/**
 * An applying effect requires recovery on either journal. An award choice's plan stopped between
 * transitions is discarded when nothing applied, so a fresh request can plan again, and otherwise
 * requires recovery, which makes the run dismissible; a stage's plan stays for its own request.
 */
function interruptedTransition(key, { effects }) {
  if (effects.some((effect) => effect.phase === 'applying')) {
    return { type: 'reconstructAfterReload' };
  }
  if (key !== 'awardChoiceJournal') return null;
  const applied = effects.some((effect) => effect.phase === 'applied');
  return { type: applied ? 'recoveryRequired' : 'abandonPlan' };
}

/** `run`'s planned journals, of `operationId` when one is named, each with its reconstruction. */
export function interruptedJournals(run, operationId) {
  if (getRunLifecycleContract(run) !== 'current') return [];
  return RUN_JOURNAL_KEYS.flatMap((key) => {
    const journal = run[key] ? observeExecutionJournal(run[key]) : null;
    if (journal?.status !== 'planned') return [];
    if (operationId && journal.operationId !== operationId) return [];
    const transition = interruptedTransition(key, journal);
    return transition ? [{ key, transition }] : [];
  });
}
