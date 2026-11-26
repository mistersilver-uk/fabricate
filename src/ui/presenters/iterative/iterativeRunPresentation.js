/**
 * The Journal's projection of an iterative run (issue 3011): the workpiece a player works, built
 * from the run's accepted terms and step states, with D18's hidden counters dropped for a viewer
 * who is not a GM. A closed run is never rebuilt into routes, rules or verdicts.
 */
import { iterativeStepsOf } from '../../../models/iterativeStepConfig.js';
import { actorRollData } from '../../../systems/checkTarget.js';
import { buildAttemptLibrary, stateFacts } from '../../../systems/iterative/attemptLibrary.js';
import { readIterativeStepState } from '../../../systems/iterative/iterativeStepState.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

import { cardViews } from './iterativeCards.js';
import { counterViews, hiddenCounterIds, recordCounterViews } from './iterativeCounters.js';
import { routeViews } from './iterativeRoutes.js';
import { listText, ruleCounterId, ruleText } from './iterativeRuleText.js';
import { readIterativeRun } from './iterativeRunRead.js';
import { outcomeNames, sessionRows } from './iterativeSessions.js';
import { iterativeVerdict, namedCounters } from './iterativeVerdict.js';

const K = Object.freeze({
  stepName: 'FABRICATE.App.Journal.Iterative.Step.Name',
  stepOf: 'FABRICATE.App.Journal.Iterative.Meta.StepOf',
  sessionNext: 'FABRICATE.App.Journal.Iterative.Meta.SessionNext',
  sessionsOne: 'FABRICATE.App.Journal.Iterative.Meta.SessionsOne',
  sessionsMany: 'FABRICATE.App.Journal.Iterative.Meta.SessionsMany',
  hiddenOne: 'FABRICATE.App.Journal.Iterative.Meta.HiddenOne',
  hiddenMany: 'FABRICATE.App.Journal.Iterative.Meta.HiddenMany',
  startedWith: 'FABRICATE.App.Journal.Iterative.Meta.StartedWith',
  startFormula: 'FABRICATE.App.Journal.Iterative.Meta.StartFormula',
  startHeld: 'FABRICATE.App.Journal.Iterative.Meta.StartHeld',
  startFormulaHeld: 'FABRICATE.App.Journal.Iterative.Meta.StartFormulaHeld',
  labelOne: 'FABRICATE.App.Journal.Iterative.StepLabel.One',
  labelMany: 'FABRICATE.App.Journal.Iterative.StepLabel.Many',
  labelSingleOne: 'FABRICATE.App.Journal.Iterative.StepLabel.SingleOne',
  labelSingleMany: 'FABRICATE.App.Journal.Iterative.StepLabel.SingleMany',
  progressNote: 'FABRICATE.App.Journal.Iterative.Progress.Note',
  progressNoteSingle: 'FABRICATE.App.Journal.Iterative.Progress.NoteSingle',
  counter: 'FABRICATE.App.Journal.Iterative.Counter.Named',
});

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);
const RISING = new Set(['>=', '>']);
const NONE = new Set();
/** The hidden set of a record whose recipe no longer resolves: every counter. */
const EVERY = Object.freeze({ has: () => true });

const plural = (count, one, many) => (count === 1 ? one : many);

/** A label reader that names no counter in `hidden`, so every rule and delta on one drops out. */
function labelReader({ counters, actions }, hidden) {
  const counterLabels = new Map(arrayOrEmpty(counters).map((entry) => [entry?.id, entry?.label]));
  const actionLabels = new Map(arrayOrEmpty(actions).map((entry) => [entry?.id, entry?.label]));
  return {
    counter: (id) => (hidden.has(id) ? null : (counterLabels.get(id) ?? null)),
    action: (id) => actionLabels.get(id) ?? null,
  };
}

/** A recipe's raw result groups for one step, names and results included. */
function rawGroups(recipeLike, index) {
  const steps = arrayOrEmpty(recipeLike?.steps);
  return arrayOrEmpty(steps.length > 0 ? steps[index]?.resultGroups : recipeLike?.resultGroups);
}

/** What a step's success routes would give: each routed group's results, named for the viewer. */
function producedYields(groups, mapResult) {
  const routed = groups.filter((group) =>
    arrayOrEmpty(group?.producedWhen).some((line) => line?.end === 'success')
  );
  return {
    groups: routed.length,
    items: routed.flatMap((group) =>
      arrayOrEmpty(group.results).map((result, index) => ({
        id: `${group.id}-${index}`,
        ...mapResult(result),
      }))
    ),
  };
}

const stepState = (run, index) => {
  const read = readIterativeStepState(run?.steps?.[index]?.iterative);
  return read?.supported ? read.state : null;
};

/** The step's first rising success rule on a counter the viewer may see: what it works toward. */
function goalOf(step, labels, localize) {
  const rule = arrayOrEmpty(step?.success).find(
    (entry) => RISING.has(entry?.op) && labels.counter(ruleCounterId(entry))
  );
  if (!rule) return null;
  return {
    counterId: rule.counterId,
    label: labels.counter(rule.counterId),
    op: rule.op,
    value: Number(rule.value),
    text: ruleText(rule, labels, localize),
  };
}

/** "Shape 0, Integrity 54 (formula 52, held at 60)", the hidden rows left out. */
function startedWithRows(state, labels, localize) {
  return arrayOrEmpty(state?.startedWith)
    .filter((row) => labels.counter(row?.counterId))
    .map((row) => {
      const counter = labels.counter(row.counterId);
      const formula = row.formulaValue != null;
      const data = { counter, value: row.value, formula: row.formulaValue };
      let key = K.counter;
      if (formula && row.clamped) key = K.startFormulaHeld;
      else if (formula) key = K.startFormula;
      else if (row.clamped) key = K.startHeld;
      return {
        counterId: row.counterId,
        label: counter,
        value: row.value,
        text: localize(key, data),
      };
    });
}

/** `{ counterId: label }` for the library counters this viewer may see, so a refusal can name one. */
function visibleCounterLabels(counters, labels) {
  const named = arrayOrEmpty(counters).map((entry) => [entry?.id, labels.counter(entry?.id)]);
  return Object.fromEntries(named.filter(([, label]) => label));
}

function namedRows(state, labels) {
  return arrayOrEmpty(state?.counters)
    .filter((row) => labels.counter(row?.counterId))
    .map((row) => ({
      counterId: row.counterId,
      label: labels.counter(row.counterId),
      value: Number(row.value),
    }));
}

function stageStatus(runStep, state) {
  if (state?.terminal?.kind === 'success' || runStep?.status === 'succeeded') return 'succeeded';
  if (state?.terminal?.kind === 'failure' || runStep?.status === 'failed') return 'failed';
  return state ? 'inProgress' : 'pending';
}

/** One step's bar and frozen-card facts, its rules and counters filtered for the viewer. */
function stageOf(index, ctx) {
  const { run, views, recipeLike, localize, redacted, live } = ctx;
  const runStep = arrayOrEmpty(run.steps)[index];
  const state = stepState(run, index);
  const labels = ctx.labelsOf(index);
  const step = views[index]?.iterative ?? null;
  const visibleRules = (rules) =>
    arrayOrEmpty(rules).filter((rule) => ruleText(rule, labels, localize));
  const success = live ? visibleRules(step?.success) : [];
  const failure = live ? visibleRules(step?.failure) : [];
  const groupId = state?.terminal?.resultGroupId ?? null;
  const set = rawGroups(recipeLike, index).find((group) => group?.id === groupId);
  return {
    index,
    name: redacted
      ? localize(K.stepName, { index: index + 1 })
      : runStep?.stepName || recipeLike?.steps?.[index]?.name || '',
    status: stageStatus(runStep, state),
    sessions: Number(state?.sessionCount ?? 0),
    success,
    failure,
    doneWhen: listText(
      success.map((rule) => ruleText(rule, labels, localize)),
      'all',
      localize
    ),
    failsWhen: listText(
      failure.map((rule) => ruleText(rule, labels, localize)),
      'any',
      localize
    ),
    check: live ? (ctx.checkLabel ?? null) : null,
    set: !redacted && live && set ? (set.name ?? null) : null,
    produces:
      !redacted && live
        ? producedYields(rawGroups(recipeLike, index), ctx.mapResult)
        : { groups: 0, items: [] },
    startsWith: state ? namedCounters(startedWithRows(state, labels, localize), localize) : '',
    endedWith: state?.terminal ? namedCounters(namedRows(state, labels), localize) : '',
  };
}

/** `{ stages, current, percent, note }` for `RunProgress`: one bar per step, the focus step's goal. */
function progressOf(ctx, { goal, state, ended }) {
  const stages = arrayOrEmpty(ctx.run.steps).map((_, index) => stageOf(index, ctx));
  const focus = ctx.focusStepIndex;
  const value = goal ? Number(stateFacts(state).counters.get(goal.counterId)) : null;
  const percent =
    goal && Number.isFinite(value) && goal.value > 0
      ? Math.min(100, Math.max(0, (value / goal.value) * 100))
      : 0;
  let note = '';
  if (goal && !ended && Number.isFinite(value)) {
    const data = { index: focus + 1, counter: goal.label, value, n: goal.value };
    note = ctx.localize(stages.length > 1 ? K.progressNote : K.progressNoteSingle, data);
  }
  return { stages, current: focus, percent: ended ? 0 : percent, note };
}

/** The header's step and session words, and the caption's started-with and hidden lines. */
function metaOf(ctx, { state, ended, startedWith, hiddenCount }) {
  const { localize, stepCount, focusStepIndex } = ctx;
  const sessions = Number(state?.sessionCount ?? 0);
  const session =
    state && !ended
      ? localize(K.sessionNext, { session: sessions + 1 })
      : localize(plural(sessions, K.sessionsOne, K.sessionsMany), { count: sessions });
  const counters = listText(
    startedWith.map((row) => row.text),
    'all',
    localize
  );
  return {
    step: stepCount > 1 ? localize(K.stepOf, { index: focusStepIndex + 1, count: stepCount }) : '',
    session,
    startedWith: counters ? localize(K.startedWith, { counters }) : '',
    hidden:
      hiddenCount > 0
        ? localize(plural(hiddenCount, K.hiddenOne, K.hiddenMany), { count: hiddenCount })
        : '',
  };
}

/** The list row's step line: "Step 2 of 3 · 4 sessions completed", or the sessions alone. */
function stepLabelOf({ localize, stepCount, focusStepIndex }, sessions) {
  const data = { index: focusStepIndex + 1, count: stepCount, sessions };
  if (stepCount > 1) return localize(plural(sessions, K.labelOne, K.labelMany), data);
  return localize(plural(sessions, K.labelSingleOne, K.labelSingleMany), data);
}

/** At a boundary, the verdict of the step that just succeeded, beside the next step's start. */
function boundaryOf(ctx, { state, routes, counters, progress, goal }) {
  if (!ctx.boundary || state?.terminal?.kind !== 'success') return null;
  const focus = ctx.focusStepIndex;
  const tier = routes?.tiers.find((entry) => entry.id === state.terminal.resultGroupId);
  const next = progress.stages[focus + 1];
  const verdict = iterativeVerdict({
    end: 'success',
    step: progress.stages[focus]?.name ?? '',
    redacted: ctx.redacted,
    set: tier ?? null,
    counters: counters.map(({ counterId, label, value }) => ({ counterId, label, value })),
    goal,
    next: next ? { index: focus + 1, name: next.name } : null,
    localize: ctx.localize,
  });
  return { stepIndex: focus, nextStepIndex: focus + 1, verdict };
}

/** The live workpiece: counters, cards, routes and sessions of the focus step. */
function livePresentation(ctx) {
  const { localize, focusStepIndex: focus, views, redacted, model } = ctx;
  const state = ctx.state;
  const library = buildAttemptLibrary(ctx.terms.iterative, ctx.recipeLike, focus);
  const hiddenIds = ctx.hiddenOf(focus);
  const labels = ctx.labelsOf(focus);
  const ended = ctx.boundary || state?.terminal != null;
  const groups = redacted ? [] : rawGroups(ctx.recipeLike, focus);
  const counters = state
    ? counterViews({
        state,
        library,
        step: views[focus]?.iterative ?? null,
        groups,
        laterViews: redacted ? [] : views.slice(focus + 1),
        facts: stateFacts(state),
        labels,
        localize,
        hiddenIds,
        markedIds: ctx.markedOf(focus),
      })
    : [];
  const hiddenCount = arrayOrEmpty(state?.counters).filter((row) =>
    hiddenIds.has(row?.counterId)
  ).length;
  const startedWith = startedWithRows(state, labels, localize);
  const goal = redacted ? null : goalOf(views[focus]?.iterative, labels, localize);
  const takeAction = model.actions?.takeAction === true;
  const cards = cardViews({
    state,
    library,
    rollData: actorRollData(ctx.actor),
    labels,
    localize,
    takeAction,
    ended,
    waiting: model.derivedStatus === 'waiting',
    availableAt: model.timeGate?.availableAt ?? null,
  });
  const nextIndex = focus + 1 < ctx.stepCount ? focus + 1 : null;
  const routes =
    redacted || !state
      ? null
      : routeViews({ groups, state, nextIndex, ended, labels, localize, mapResult: ctx.mapResult });
  const progress = progressOf(ctx, { goal, state, ended });
  const rolls = new Map(library.actions.map((action) => [action?.id, action?.check === 'roll']));
  return {
    ...sharedFields(ctx, { state, counters, hiddenCount, startedWith, ended }),
    boundary: boundaryOf(ctx, { state, routes, counters, progress, goal }),
    cards,
    nextSession: state && !ended ? Number(state.sessionCount ?? 0) + 1 : null,
    counterLabels: visibleCounterLabels(ctx.terms.iterative?.counters, labels),
    routes,
    sessions: sessionRows(state, {
      labels,
      localize,
      actionRolls: (id) => rolls.get(id) === true,
      outcomes: outcomeNames(ctx.terms.craftingCheck),
      privately: redacted,
    }),
    progress,
    goal,
    derivedStatus: takeAction && cards.some((card) => card.enabled) ? 'ready' : 'inProgress',
  };
}

/** A closed run's record: final counters and sessions over the archive's own labels. */
function recordPresentation(ctx) {
  const { localize, focusStepIndex: focus, state } = ctx;
  const labels = ctx.labelsOf(focus);
  const counters = recordCounterViews({
    state,
    labels,
    hiddenIds: ctx.hiddenOf(focus),
    markedIds: ctx.markedOf(focus),
  });
  const hiddenCount = ctx.unresolved ? 0 : arrayOrEmpty(state?.counters).length - counters.length;
  const startedWith = startedWithRows(state, labels, localize);
  return {
    ...sharedFields(ctx, { state, counters, hiddenCount, startedWith, ended: true }),
    boundary: null,
    cards: [],
    nextSession: null,
    counterLabels: {},
    routes: null,
    sessions: sessionRows(state, {
      labels,
      localize,
      actionRolls: () => false,
      outcomes: outcomeNames(ctx.system?.craftingCheck),
      privately: ctx.redacted,
    }),
    progress: progressOf(ctx, { goal: null, state, ended: true }),
    goal: null,
    derivedStatus: ctx.model.derivedStatus,
  };
}

function sharedFields(ctx, { state, counters, hiddenCount, startedWith, ended }) {
  return {
    redacted: ctx.redacted,
    supported: ctx.supported,
    viewer: ctx.gm ? 'gm' : 'player',
    focusStepIndex: ctx.focusStepIndex,
    meta: metaOf(ctx, { state, ended, startedWith, hiddenCount }),
    counters,
    hiddenCount,
    startedWith,
    compactedCount: Number(state?.compacted?.attempts ?? 0),
  };
}

/** The hidden ids each step's surfaces drop for this viewer, and the ones a GM sees marked. */
function hidingOf({ gm, live, terms, recipe, views }) {
  const instances = live
    ? arrayOrEmpty(terms.recipe?.iterative?.counters)
    : arrayOrEmpty(recipe?.iterative?.counters);
  // A closed record whose recipe no longer resolves cannot say which counters were hidden.
  const unresolved = !live && !gm && !recipe;
  const of = (index, asGm) =>
    hiddenCounterIds({ instances, step: views[index]?.iterative, gm: asGm });
  return {
    unresolved,
    hiddenOf: (index) => (unresolved ? EVERY : of(index, gm)),
    markedOf: (index) => (gm ? of(index, false) : NONE),
  };
}

function contextOf({ run, model, actor, viewer, system, recipe, localize, checkLabel, mapResult }) {
  const live = !TERMINAL_STATUSES.has(model?.status);
  const read = readIterativeRun(run, { terminal: !live });
  if (!read) return null;
  const terms = run.termsSnapshot ?? {};
  const gm = viewer?.isGM === true;
  const recipeLike = live ? (terms.recipe ?? null) : recipe;
  const views = iterativeStepsOf(recipeLike);
  const hiding = hidingOf({ gm, live, terms, recipe, views });
  const vocabulary = live
    ? { counters: terms.iterative?.counters, actions: terms.iterative?.actions }
    : (read.state?.labels ?? {});
  return {
    ...read,
    ...hiding,
    run,
    model,
    actor,
    system,
    terms,
    live,
    gm,
    redacted: model?.redacted === true,
    recipeLike,
    views,
    stepCount: arrayOrEmpty(run.steps).length,
    labelsOf: (index) => labelReader(vocabulary, hiding.hiddenOf(index)),
    localize,
    checkLabel,
    mapResult: typeof mapResult === 'function' ? mapResult : (result) => ({ ...result }),
  };
}

/**
 * `{}` for a run that is not iterative, else `{ iterative, derivedStatus, stepLabel }`, spread
 * over the run model. `iterative` holds `redacted`, `supported`, `viewer`, `focusStepIndex`,
 * `boundary`, `meta`, `counters`, `hiddenCount`, `startedWith`, `cards`, `nextSession`,
 * `counterLabels`, `routes`, `sessions`, `compactedCount`, `progress` and `goal`.
 */
export function iterativeRunFields(args) {
  const ctx = contextOf(args);
  if (!ctx) return {};
  const { derivedStatus, ...iterative } = ctx.live
    ? livePresentation(ctx)
    : recordPresentation(ctx);
  const sessions = ctx.live
    ? Number(ctx.state?.sessionCount ?? 0)
    : iterative.progress.stages.reduce((total, stage) => total + stage.sessions, 0);
  const stepLabel = ctx.live
    ? stepLabelOf(ctx, sessions)
    : ctx.localize(plural(sessions, K.sessionsOne, K.sessionsMany), { count: sessions });
  return { iterative, derivedStatus, stepLabel };
}
