/**
 * What one Journal window remembers about each workpiece it has seen (issue 3011, D-3): the ids it
 * minted, the attempt count each step began from, whether it resumed the piece, the one notice its
 * last press left, and the verdict a step's end froze. Every value is rendered copy or an id.
 */
import { arrayOrEmpty } from '../../../utils/scalars.js';
import { listText } from '../../presenters/iterative/iterativeRuleText.js';

const without = (map, key) => Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
export const rowsOf = (run) => arrayOrEmpty(run?.iterative?.sessions);
export const attemptCountOf = (run) => rowsOf(run)[0]?.attempt ?? 0;

/** @param {(key: string, data?: object) => string} localize */
export function createAttemptMemory(localize) {
  let notes = $state.raw({});
  let verdicts = $state.raw({});
  let runs = $state.raw({});

  const track = (key, patch) => {
    runs = { ...runs, [key]: { own: [], baselines: {}, resumed: false, ...runs[key], ...patch } };
  };

  return {
    noteOf: (key) => notes[key] ?? null,
    note(key, descriptor) {
      notes = { ...notes, [key]: descriptor };
    },
    forget(key) {
      notes = without(notes, key);
      track(key, { resumed: false });
    },
    freeze(key, verdict) {
      verdicts = { ...verdicts, [key]: verdict };
    },
    verdictOf: (key) => verdicts[key] ?? null,
    resumed: (key) => runs[key]?.resumed === true,

    /** Records an id this window minted for the run, so it is never "(other window)". */
    mint(key, id) {
      track(key, { own: [...new Set([...(runs[key]?.own ?? []), id])] });
    },

    /** A run's first sight records its baseline for the step shown, and resume when it has attempts. */
    observe(key, run) {
      const step = run.iterative.focusStepIndex;
      const known = runs[key];
      if (known && step in known.baselines) return;
      const resumed = rowsOf(run).length > 0 || run.iterative.compactedCount > 0;
      track(key, {
        baselines: { ...known?.baselines, [step]: attemptCountOf(run) },
        ...(!known && { resumed }),
      });
    },

    /** Whether a listed session row came from another window: later than the baseline, not minted here. */
    isOtherWindow(key, run, row) {
      const known = runs[key];
      const baseline = known?.baselines?.[run?.iterative?.focusStepIndex];
      if (baseline === undefined || !row) return false;
      return row.attempt > baseline && !known.own.includes(row.requestId);
    },

    /** "Rest and Hammer": the actions of the entries past `floor` that no press here made, oldest first. */
    otherActions(key, run, floor) {
      const own = runs[key]?.own ?? [];
      const names = rowsOf(run)
        .filter((row) => row.attempt > floor && !own.includes(row.requestId))
        .map((row) => row.action)
        .toReversed();
      return names.length > 0 ? listText(names, 'all', localize) : '';
    },

    /** A selection clears every notice and resume, and every verdict but the selected run's. */
    select(key) {
      notes = {};
      verdicts = Object.fromEntries(Object.entries(verdicts).filter(([runKey]) => runKey === key));
      runs = Object.fromEntries(
        Object.entries(runs).map(([runKey, known]) => [runKey, { ...known, resumed: false }])
      );
    },
  };
}
