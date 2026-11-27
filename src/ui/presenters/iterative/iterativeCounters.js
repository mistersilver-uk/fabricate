/**
 * The counters of the step a workpiece surface describes: each with its value, the scale its meter
 * reads against, a tone, one caption and the route thresholds it decides. A counter hidden from
 * this viewer is left out entirely; a GM sees it marked instead.
 */
import { effectiveBounds } from '../../../systems/iterative/attemptLibrary.js';
import { evaluateCounterRule, iterativeNumber } from '../../../systems/iterative/counterRule.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

import { commaText, ruleCounterId, ruleText } from './iterativeRuleText.js';

const K = Object.freeze({
  doneAt: 'FABRICATE.App.Journal.Iterative.Counter.DoneAt',
  targetReached: 'FABRICATE.App.Journal.Iterative.Counter.TargetReached',
  target: 'FABRICATE.App.Journal.Iterative.Counter.Target',
  max: 'FABRICATE.App.Journal.Iterative.Counter.Max',
  breaksAt: 'FABRICATE.App.Journal.Iterative.Counter.BreaksAt',
  low: 'FABRICATE.App.Journal.Iterative.Counter.Low',
  broken: 'FABRICATE.App.Journal.Iterative.Counter.Broken',
  decides: 'FABRICATE.App.Journal.Iterative.Counter.Decides',
  carries: 'FABRICATE.App.Journal.Iterative.Counter.Carries',
  mark: 'FABRICATE.App.Journal.Iterative.Counter.Mark',
  markReached: 'FABRICATE.App.Journal.Iterative.Counter.MarkReached',
  value: 'FABRICATE.App.Journal.Iterative.Counter.Value',
});

const LOW_SHARE = 0.25;
const MARK_HEADROOM = 1.25;
const RISING = new Set(['>=', '>']);
const FALLING = new Set(['<=', '<']);

/** The ids a viewer who is not a GM may not see on step `step`: hidden instances and the step's own. */
export function hiddenCounterIds({ instances, step, gm }) {
  if (gm) return new Set();
  return new Set([
    ...arrayOrEmpty(instances)
      .filter((entry) => entry?.visible === false)
      .map((entry) => entry.counterId),
    ...arrayOrEmpty(step?.hiddenCounterIds),
  ]);
}

/** The first rule of `rules` on `counterId` whose op is in `ops`. */
const firstRule = (rules, counterId, ops) =>
  arrayOrEmpty(rules).find((rule) => ruleCounterId(rule) === counterId && ops.has(rule.op));

const groupLines = (group) => arrayOrEmpty(group?.producedWhen);
const linesRead = (groups, counterId) =>
  arrayOrEmpty(groups).some((group) =>
    groupLines(group).some((line) =>
      arrayOrEmpty(line?.rules).some((rule) => ruleCounterId(rule) === counterId)
    )
  );

/** Each success route threshold on `counterId`: its value, "{set} — {rule}" and whether it holds. */
function marksOf({ counterId, groups, facts, labels, localize }) {
  return arrayOrEmpty(groups).flatMap((group) =>
    groupLines(group)
      .flatMap((line) => (line?.end === 'success' ? arrayOrEmpty(line.rules) : []))
      .filter((rule) => ruleCounterId(rule) === counterId)
      .map((rule) => {
        const reached = evaluateCounterRule(rule, facts);
        const mark = localize(K.mark, { set: group.name, rule: ruleText(rule, labels, localize) });
        return {
          value: iterativeNumber(rule.value),
          label: reached ? localize(K.markReached, { mark }) : mark,
          reached,
        };
      })
  );
}

/** The step's own break caption on a counter a failure rule reads, else `null`. */
function breakCaption({ breakRule, value, max, facts, localize }) {
  if (!breakRule) return null;
  if (evaluateCounterRule(breakRule, facts)) return localize(K.broken);
  const n = iterativeNumber(breakRule.value);
  return localize(isLow(value, max) ? K.low : K.breaksAt, { value: n });
}

const isLow = (value, max) => max !== null && max > 0 && value <= max * LOW_SHARE;

/** The first caption that applies, in the order the counter card states them. */
function captionOf(read, { facts, localize, carriesInto }) {
  const { doneRule, target, value, max } = read;
  if (doneRule) {
    return evaluateCounterRule(doneRule, facts)
      ? localize(K.targetReached)
      : localize(K.doneAt, { value: iterativeNumber(doneRule.value) });
  }
  if (target !== null) {
    return value >= target ? localize(K.targetReached) : localize(K.target, { value: target });
  }
  const broken = breakCaption({ ...read, facts, localize });
  if (broken) return broken;
  if (max !== null) return localize(K.max, { value: max });
  if (read.decides) return localize(K.decides);
  return carriesInto === null ? '' : localize(K.carries, { index: carriesInto + 1 });
}

function toneOf({ failureNamed, value, max, doneRule, target }) {
  if (failureNamed && isLow(value, max)) return 'danger';
  if (doneRule || target !== null) return 'accent';
  return max === null ? null : 'info';
}

function scaleOf({ max, doneRule, target, marks }) {
  if (max !== null) return max;
  if (doneRule) return iterativeNumber(doneRule.value);
  if (target !== null) return target;
  const top = Math.max(...marks.map((mark) => mark.value));
  return marks.length > 0 ? top * MARK_HEADROOM : null;
}

/** The first later step whose routes read `counterId`, by index, else `null`. */
const carriesInto = (laterViews, counterId) =>
  laterViews.find((view) => linesRead(view.resultGroups, counterId))?.stepIndex ?? null;

/** One counter's reading on the described step. */
function counterView(row, context) {
  const { library, step, groups, facts, labels, localize, hidden } = context;
  const { counterId } = row;
  const value = Number(row.value);
  const meta = arrayOrEmpty(library.counters).find((entry) => entry?.id === counterId);
  const instance = arrayOrEmpty(library.instances).find((entry) => entry?.counterId === counterId);
  const { min, max } = effectiveBounds(counterId, library);
  const read = {
    value,
    max,
    target: Number.isFinite(instance?.target) ? instance.target : null,
    doneRule: firstRule(step?.success, counterId, RISING),
    breakRule: firstRule(step?.failure, counterId, FALLING),
    failureNamed: arrayOrEmpty(step?.failure).some((rule) => ruleCounterId(rule) === counterId),
    decides: linesRead(groups, counterId),
  };
  const marks = marksOf({ counterId, groups, facts, labels, localize });
  const caption = captionOf(read, {
    facts,
    localize,
    carriesInto: carriesInto(context.laterViews, counterId),
  });
  const scale = scaleOf({ ...read, marks });
  const reading = scale === null ? String(value) : localize(K.value, { value, scale });
  const reached = marks.filter((mark) => mark.reached).map((mark) => mark.label);
  return {
    counterId,
    label: meta?.label ?? counterId,
    description: meta?.description ?? '',
    value,
    scale,
    min,
    max,
    target: read.target,
    tone: toneOf(read),
    caption,
    marks,
    hidden: hidden.has(counterId),
    locked: arrayOrEmpty(step?.lockedCounterIds).includes(counterId),
    valueText: commaText([reading, caption, ...reached], localize),
  };
}

/**
 * The described step's counters for this viewer. `hiddenIds` are left out, `markedIds` (a GM's)
 * are kept and marked, and `groups` is empty where routes are not shown.
 */
export function counterViews(context) {
  const { state, hiddenIds } = context;
  const hidden = context.markedIds ?? new Set();
  return arrayOrEmpty(state?.counters)
    .filter((row) => !hiddenIds.has(row?.counterId))
    .map((row) => counterView(row, { ...context, hidden }));
}

/**
 * A closed record's final counters, read-only: the archive keeps labels and values alone, so no
 * scale, caption or threshold is rebuilt. The hidden ones are left out or marked.
 */
export function recordCounterViews({ state, labels, hiddenIds, markedIds }) {
  return arrayOrEmpty(state?.counters)
    .filter((row) => !hiddenIds.has(row?.counterId))
    .map(({ counterId, value }) => ({
      counterId,
      label: labels.counter(counterId) ?? counterId,
      description: '',
      value: Number(value),
      scale: null,
      min: null,
      max: null,
      target: null,
      tone: null,
      caption: '',
      marks: [],
      hidden: markedIds.has(counterId),
      locked: false,
      valueText: String(Number(value)),
    }));
}
