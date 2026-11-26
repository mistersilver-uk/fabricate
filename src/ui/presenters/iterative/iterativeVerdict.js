/**
 * The verdict a step's end states: what the step left, the counter rule that chose it, and what
 * comes next. A redacted run names only "Step N", and no counter this viewer may not see is
 * named. Built from a workpiece projection, never from a raw reply, so the D18 filter holds.
 */
import { evaluateCounterRule } from '../../../systems/iterative/counterRule.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

import { listText, thresholdText } from './iterativeRuleText.js';

const K = Object.freeze({
  succeeded: 'FABRICATE.App.Journal.Iterative.Verdict.Succeeded',
  succeededSet: 'FABRICATE.App.Journal.Iterative.Verdict.SucceededSet',
  failed: 'FABRICATE.App.Journal.Iterative.Verdict.Failed',
  failedSet: 'FABRICATE.App.Journal.Iterative.Verdict.FailedSet',
  reaches: 'FABRICATE.App.Journal.Iterative.Verdict.Reaches',
  next: 'FABRICATE.App.Journal.Iterative.Verdict.Next',
  nextCarries: 'FABRICATE.App.Journal.Iterative.Verdict.NextCarries',
  finished: 'FABRICATE.App.Journal.Iterative.Verdict.Finished',
  failedBefore: 'FABRICATE.App.Journal.Iterative.Verdict.FailedBefore',
  failedReached: 'FABRICATE.App.Journal.Iterative.Verdict.FailedReached',
  leaves: 'FABRICATE.App.Journal.Iterative.Verdict.Leaves',
  leavesNothing: 'FABRICATE.App.Journal.Iterative.Verdict.LeavesNothing',
  redactedNext: 'FABRICATE.App.Journal.Iterative.Verdict.RedactedNext',
  counter: 'FABRICATE.App.Journal.Iterative.Counter.Named',
});

const TONES = Object.freeze({
  success: { tone: 'success', icon: 'fas fa-flag-checkered' },
  failure: { tone: 'danger', icon: 'fas fa-heart-crack' },
});

const sentences = (...parts) => parts.filter(Boolean).join(' ');

/** "Shape 65, Integrity 7 and Heat 25" for the counters a verdict may name. */
export function namedCounters(counters, localize) {
  return listText(
    arrayOrEmpty(counters).map(({ label, value }) =>
      localize(K.counter, { counter: label, value })
    ),
    'all',
    localize
  );
}

function successDetail({ set, counters, next, localize }) {
  const values = new Map(counters.map((row) => [row.counterId, row]));
  const chose = set?.rule && values.get(set.rule.counterId);
  const reaches =
    chose &&
    localize(K.reaches, {
      counter: chose.label,
      value: chose.value,
      set: set.name,
      threshold: thresholdText(set.rule.op, set.rule.value, localize),
    });
  if (!next) return sentences(reaches, localize(K.finished));
  const carried = namedCounters(counters, localize);
  const onward = carried
    ? localize(K.nextCarries, { index: next.index + 1, name: next.name, counters: carried })
    : localize(K.next, { index: next.index + 1, name: next.name });
  return sentences(reaches, onward);
}

function failureDetail({ set, counters, failure, goal, localize }) {
  const facts = { counters: new Map(counters.map((row) => [row.counterId, row.value])) };
  const rule = arrayOrEmpty(failure).find((entry) => evaluateCounterRule(entry, facts));
  const broke = rule && counters.find((row) => row.counterId === rule.counterId);
  let why = null;
  if (broke && goal) {
    why = localize(K.failedBefore, {
      counter: broke.label,
      value: broke.value,
      goal: goal.label,
      n: goal.value,
    });
  } else if (broke) why = localize(K.failedReached, { counter: broke.label, value: broke.value });
  const left = set ? localize(K.leaves, { set: set.name }) : localize(K.leavesNothing);
  return sentences(why, left);
}

/**
 * `{ end, tone, icon, title, detail, yields }` for a step that ended in `end`. `set` is the
 * selected tier `{ name, rule, yields }` or `null`, `counters` the final counters the viewer may
 * see, `failure` the step's visible failure rules, and `next` the following step `{ index, name }`.
 */
export function iterativeVerdict({
  end,
  step,
  redacted,
  set = null,
  counters = [],
  failure = [],
  goal = null,
  next = null,
  localize,
}) {
  const success = end === 'success';
  const named = !redacted && set?.name;
  const title = success
    ? localize(named ? K.succeededSet : K.succeeded, { step, set: set?.name })
    : localize(named ? K.failedSet : K.failed, { step, set: set?.name });
  let detail;
  if (redacted) detail = success ? localize(next ? K.redactedNext : K.finished) : '';
  else if (success) detail = successDetail({ set, counters, next, localize });
  else detail = failureDetail({ set, counters, failure, goal, localize });
  return {
    end: success ? 'success' : 'failure',
    ...TONES[success ? 'success' : 'failure'],
    title,
    detail,
    yields: redacted ? [] : arrayOrEmpty(set?.yields),
  };
}

/**
 * The verdict of the step `iterative` describes, for a `stepEnd` (`{ kind, resultGroupId }`)
 * whose final `counters` the caller derived from that projection's own D18-filtered counters.
 */
export function iterativeStepEndVerdict(iterative, { stepEnd, counters }, localize) {
  const focus = iterative.focusStepIndex;
  const stages = arrayOrEmpty(iterative.progress?.stages);
  const tier = arrayOrEmpty(iterative.routes?.tiers).find(
    (entry) => entry.id === stepEnd?.resultGroupId
  );
  const next = stepEnd?.kind === 'success' ? stages[focus + 1] : null;
  return iterativeVerdict({
    end: stepEnd?.kind,
    step: stages[focus]?.name ?? '',
    redacted: iterative.redacted === true,
    set: tier ?? null,
    counters,
    failure: stages[focus]?.failure,
    goal: iterative.goal,
    next: next ? { index: focus + 1, name: next.name } : null,
    localize,
  });
}
