/**
 * What the Workpiece view's step card says about one step (issue 3011, D-5): whether it is the
 * live step or a frozen past or future one, its tag and sub-line, and a frozen card's facts and
 * inputs and outputs. Pure: `localize` is injected, and every string is already filtered (D18).
 */
import { formatAuthoredDuration } from '../../../util/formatDuration.js';
import { presentStage } from '../historyPresentation.js';
import { quantityText } from '../runDetailPresentation.js';

const K = Object.freeze({
  working: 'FABRICATE.App.Journal.Iterative.Step.TagWorking',
  succeeded: 'FABRICATE.App.Journal.Iterative.Step.TagSucceeded',
  done: 'FABRICATE.App.Journal.Iterative.Step.TagDone',
  failed: 'FABRICATE.App.Journal.Iterative.Step.TagFailed',
  notReached: 'FABRICATE.App.Journal.Iterative.Step.TagNotReached',
  inProgressOne: 'FABRICATE.App.Journal.Iterative.Step.InProgressOne',
  inProgressMany: 'FABRICATE.App.Journal.Iterative.Step.InProgressMany',
  succeededOne: 'FABRICATE.App.Journal.Iterative.Step.SucceededOne',
  succeededMany: 'FABRICATE.App.Journal.Iterative.Step.SucceededMany',
  failedOne: 'FABRICATE.App.Journal.Iterative.Step.FailedOne',
  failedMany: 'FABRICATE.App.Journal.Iterative.Step.FailedMany',
  succeededSet: 'FABRICATE.App.Journal.Iterative.Step.SucceededSet',
  carried: 'FABRICATE.App.Journal.Iterative.Step.Carried',
  startsAfter: 'FABRICATE.App.Journal.Iterative.Step.StartsAfter',
  doneWhen: 'FABRICATE.App.Journal.Iterative.Step.DoneWhen',
  failsWhen: 'FABRICATE.App.Journal.Iterative.Step.FailsWhen',
  ended: 'FABRICATE.App.Journal.Iterative.Step.Ended',
  startsWith: 'FABRICATE.App.Journal.Iterative.Step.StartsWith',
  willProduceOne: 'FABRICATE.App.Journal.Iterative.Step.WillProduceOne',
  requiresTime: 'FABRICATE.App.Journal.StepDetails.RequiresTime',
  check: 'FABRICATE.App.Journal.StepDetails.Check',
  requiredTools: 'FABRICATE.App.Journal.StepDetails.RequiredTools',
  toolsUsed: 'FABRICATE.App.Journal.History.ToolsUsed',
  consumed: 'FABRICATE.App.Journal.History.Consumed',
  willConsume: 'FABRICATE.App.Journal.History.WillConsume',
  produced: 'FABRICATE.App.Journal.History.Produced',
  willProduce: 'FABRICATE.App.Journal.History.WillProduce',
  pastNote: 'FABRICATE.App.Journal.History.PastNote',
  futureNote: 'FABRICATE.App.Journal.History.FutureNote',
  notRecorded: 'FABRICATE.App.Journal.History.NotRecorded',
});

const plural = (count, one, many) => (count === 1 ? one : many);

/** `live`, `past` or `future`: the focus step is the live one, whatever its state. */
export function stepView(focusStepIndex, index) {
  if (index === focusStepIndex) return 'live';
  return index < focusStepIndex ? 'past' : 'future';
}

/** The tag and sub-line of step `index`, read from its projected progress stage. */
export function stepHeading(stage, view, localize) {
  const n = Number(stage?.sessions ?? 0);
  if (view === 'future') {
    return {
      tag: { label: localize(K.notReached), tone: 'neutral' },
      sub: localize(K.startsAfter, { index: stage?.index ?? 0 }),
    };
  }
  if (view === 'past') {
    return {
      tag: { label: localize(K.done), tone: 'positive' },
      sub: stage?.set
        ? localize(K.succeededSet, { set: stage.set })
        : localize(K.carried, { index: (stage?.index ?? 0) + 2 }),
    };
  }
  if (stage?.status === 'succeeded') {
    return {
      tag: { label: localize(K.succeeded), tone: 'positive' },
      sub: localize(plural(n, K.succeededOne, K.succeededMany), { n }),
    };
  }
  if (stage?.status === 'failed') {
    return {
      tag: { label: localize(K.failed), tone: 'danger' },
      sub: localize(plural(n, K.failedOne, K.failedMany), { n }),
    };
  }
  return {
    tag: { label: localize(K.working), tone: 'accent' },
    sub: localize(plural(n, K.inProgressOne, K.inProgressMany), { n }),
  };
}

/** A frozen card's facts: its time, check and rules, then how it ended or what it starts with. */
export function frozenFacts({ stage, runStep, view, heading, localize }) {
  const seconds = Number(runStep?.detail?.requiredSeconds);
  const rows = [
    [
      'time',
      'fas fa-clock',
      K.requiresTime,
      seconds > 0 ? formatAuthoredDuration(seconds, { localize }) : '',
    ],
    ['check', '', K.check, stage?.check ?? ''],
    ['done', '', K.doneWhen, stage?.doneWhen ?? ''],
    ['fails', '', K.failsWhen, stage?.failsWhen ?? ''],
    view === 'past'
      ? ['ended', '', K.ended, heading.sub]
      : ['starts', '', K.startsWith, stage?.startsWith || stage?.carriedWith || ''],
  ];
  return rows
    .map(([id, icon, label, value]) => ({ id, icon, label: localize(label), value }))
    .filter((fact) => fact.value);
}

const listOf = (items) => (Array.isArray(items) ? items : []);

/** The future step's inputs: every option of every group of every route it may take. */
const futureInputs = (runStep, localize) =>
  listOf(runStep?.inputPreview?.routes).flatMap((route) =>
    listOf(route.groups).flatMap((group) =>
      listOf(group.options).map((option) => ({
        ...option,
        quantityText: quantityText(option.need, localize),
      }))
    )
  );

/** What a future step's success routes would give, each with its quantity. */
const futureYields = (stage, localize) =>
  listOf(stage?.produces?.items).map((item) => ({
    ...item,
    quantityText: quantityText(item.quantity, localize),
  }));

/** A frozen card's io groups, the empty ones left out; a future step's yields are its routes'. */
export function frozenIo({ stage, runStep, view, localize }) {
  const past = view === 'past';
  const evidence = past ? presentStage(runStep, localize) : null;
  const oneOf = (stage?.produces?.groups ?? 0) > 1;
  const groups = [
    {
      kind: 'consumed',
      label: localize(past ? K.consumed : K.willConsume),
      items: past ? evidence.consumed : futureInputs(runStep, localize),
    },
    {
      kind: 'produced',
      label: localize(past ? K.produced : oneOf ? K.willProduceOne : K.willProduce),
      items: past ? evidence.produced : futureYields(stage, localize),
    },
    {
      kind: 'tools',
      label: localize(past ? K.toolsUsed : K.requiredTools),
      items: (past ? evidence.tools : listOf(runStep?.detail?.tools)).map((tool) => ({
        icon: 'fas fa-hammer',
        ...tool,
      })),
    },
  ];
  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({ ...group, emptyText: localize(K.notRecorded) }));
}

/** The shipped past or future note under a frozen card. */
export const frozenNote = (view, localize) => localize(view === 'past' ? K.pastNote : K.futureNote);
