/**
 * One card per Crafting Action the described step allows, judged by the pure `preflightAttempt`
 * against the drawn state: whether it can be taken, the one note that says why or what it does,
 * the costs it will pay and the effects whose Counter Rules already hold. The authority still
 * decides; a card only states what the drawn state predicts.
 */
import {
  combineHolds,
  namesCheckFact,
  stateFacts,
} from '../../../systems/iterative/attemptLibrary.js';
import { evaluateCounterRule, iterativeNumber } from '../../../systems/iterative/counterRule.js';
import { preflightAttempt, stepOf } from '../../../systems/iterative/preflightAttempt.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

import { listText, ruleCounterId, ruleText } from './iterativeRuleText.js';

const K = Object.freeze({
  ended: 'FABRICATE.App.Journal.Iterative.Card.Ended',
  needs: 'FABRICATE.App.Journal.Iterative.Card.Needs',
  needsHidden: 'FABRICATE.App.Journal.Iterative.Card.NeedsHidden',
  setup: 'FABRICATE.App.Journal.Iterative.Card.Setup',
  short: 'FABRICATE.App.Journal.Iterative.Card.Short',
  shortHidden: 'FABRICATE.App.Journal.Iterative.Card.ShortHidden',
  rolls: 'FABRICATE.App.Journal.Iterative.Card.Rolls',
  checkName: 'FABRICATE.App.Journal.Iterative.Card.CheckName',
  noCheck: 'FABRICATE.App.Journal.Iterative.Card.NoCheck',
  working: 'FABRICATE.App.Journal.Iterative.Card.Working',
  workingFree: 'FABRICATE.App.Journal.Iterative.Card.WorkingFree',
  add: 'FABRICATE.App.Journal.Iterative.Chip.Add',
  subtract: 'FABRICATE.App.Journal.Iterative.Chip.Subtract',
  set: 'FABRICATE.App.Journal.Iterative.Chip.Set',
});

const HAZARD_KEYS = Object.freeze({
  '<': 'FABRICATE.App.Journal.Iterative.Card.HazardBelow',
  '<=': 'FABRICATE.App.Journal.Iterative.Card.HazardAtMost',
  '>': 'FABRICATE.App.Journal.Iterative.Card.HazardAbove',
  '>=': 'FABRICATE.App.Journal.Iterative.Card.HazardAtLeast',
  '=': 'FABRICATE.App.Journal.Iterative.Card.HazardExactly',
});

/** Preflight refusals that only the GM can mend: the action's setup cannot be read here. */
const SETUP_REASONS = new Set([
  'invalid-entry',
  'unknown-counter',
  'expression-invalid',
  'version-unsupported',
]);

/** "{counter} −{amount}", "{counter} +{amount}" or "{counter} = {amount}". */
export function deltaText(op, counter, amount, localize) {
  const key = { add: K.add, subtract: K.subtract, set: K.set }[op];
  return key ? localize(key, { counter, amount }) : '';
}

/** The library actions the step allows, in library order. */
export function allowedActions(library) {
  const { mode, actionIds } = stepOf(library).actions;
  const actions = arrayOrEmpty(library?.actions);
  return mode === 'only' ? actions.filter((action) => actionIds.includes(action?.id)) : actions;
}

/** The action as preflight prices it with its requirements met and every cost allowed to drain. */
const pricingView = (action) => ({
  ...action,
  availability: { ...action.availability, rules: [] },
  costs: arrayOrEmpty(action.costs).map((entry) => ({ ...entry, needsEnough: false })),
});

/** Each cost the attempt pays, priced by preflight, the hidden ones only counted. */
function costChips({ action, context, setupFault }) {
  const { state, library, rollData, labels, localize } = context;
  if (setupFault) return { chips: [], hiddenCost: false };
  const priced = preflightAttempt({
    state: { ...state, terminal: null },
    action: pricingView(action),
    library,
    rollData,
  });
  const costs = priced.ok ? priced.costs : [];
  const facts = stateFacts(state);
  const authored = new Map(arrayOrEmpty(action.costs).map((entry) => [entry.id, entry]));
  const shown = costs.filter((cost) => labels.counter(cost.counterId));
  return {
    hiddenCost: shown.length < costs.length,
    chips: shown.map(({ costId, counterId, amount }) => ({
      costId,
      counterId,
      label: deltaText('subtract', labels.counter(counterId), amount, localize),
      short: authored.get(costId)?.needsEnough !== false && amount > facts.counters.get(counterId),
    })),
  };
}

/** Whether `entry` is a hazard now: Counter Rules that hold, no check fact, an unlocked target. */
function isHazard(entry, { facts, locked }) {
  const rules = arrayOrEmpty(entry?.when?.rules);
  if (rules.length === 0 || namesCheckFact(entry.when)) return false;
  if (locked.has(entry?.target?.counterId)) return false;
  return combineHolds(
    entry.when.combine,
    rules.map((rule) => evaluateCounterRule(rule, facts))
  );
}

/** The effects that apply whatever the check gives, none naming a counter this viewer may not see. */
function hazardsOf(action, { state, library, labels, localize }) {
  const facts = stateFacts(state);
  const locked = new Set(arrayOrEmpty(stepOf(library).lockedCounterIds));
  const visible = (entry) =>
    labels.counter(entry?.target?.counterId) &&
    entry.when.rules.every((rule) => !ruleCounterId(rule) || labels.counter(rule.counterId));
  return arrayOrEmpty(action.effects)
    .filter((entry) => isHazard(entry, { facts, locked }) && visible(entry))
    .map((entry) => ({
      effectId: entry.id,
      counterId: entry.target.counterId,
      label: deltaText(entry.op, labels.counter(entry.target.counterId), entry.amount, localize),
      rule: entry.when.rules.find(
        (rule) => ruleCounterId(rule) && evaluateCounterRule(rule, facts)
      ),
    }));
}

/** "Heat 45 is at or above 30: also Integrity −1", from the first hazard's first holding counter rule. */
function hazardNote(hazards, { state, labels, localize }) {
  const lead = hazards.find((hazard) => hazard.rule);
  if (!lead) return null;
  const { rule } = lead;
  return localize(HAZARD_KEYS[rule.op], {
    counter: labels.counter(rule.counterId),
    value: stateFacts(state).counters.get(rule.counterId),
    threshold: iterativeNumber(rule.value),
    effects: listText(
      hazards.map((hazard) => hazard.label),
      'all',
      localize
    ),
  });
}

/** "Needs {a} and {b}", or the generic line when an unmet requirement reads a hidden counter. */
function needsNote(action, { state, labels, localize }) {
  const facts = stateFacts(state);
  const { combine, rules } = action.availability;
  const unmet = arrayOrEmpty(rules).filter((rule) => !evaluateCounterRule(rule, facts));
  const words = unmet.map((rule) => ruleText(rule, labels, localize));
  if (words.length === 0 || words.some((word) => !word)) return localize(K.needsHidden);
  return localize(K.needs, { requirements: listText(words, combine, localize) });
}

function shortNote(detail, { labels, localize }) {
  const counter = labels.counter(detail?.counterId);
  if (!counter) return localize(K.shortHidden);
  return localize(K.short, { amount: detail.amount, counter, value: detail.value });
}

/** The card's note code, its words and their ink, the first of the card's rules that applies. */
function noteOf({ action, preflight, hazards, context }) {
  const { localize } = context;
  if (context.ended) return { note: 'ended', text: localize(K.ended), tone: 'muted' };
  if (context.waiting) return { note: 'waiting', text: null, tone: 'muted' };
  if (preflight.reason === 'step-ended') {
    return { note: 'ended', text: localize(K.ended), tone: 'muted' };
  }
  if (preflight.reason === 'action-unavailable') {
    return { note: 'needs', text: needsNote(action, context), tone: 'muted' };
  }
  if (preflight.reason === 'cost-unaffordable') {
    return { note: 'cost', text: shortNote(preflight.detail, context), tone: 'danger' };
  }
  if (!preflight.ok) return { note: 'setup', text: localize(K.setup), tone: 'muted' };
  const hazard = hazardNote(hazards, context);
  if (hazard) return { note: 'hazard', text: hazard, tone: 'danger' };
  if (action.check !== 'roll') return { note: 'none', text: localize(K.noCheck), tone: 'muted' };
  const check = localize(K.checkName);
  return { note: 'rolls', text: localize(K.rolls, { check }), tone: 'muted' };
}

/** The note a pressed card reads while its Iterative Attempt saves. */
function busyNote(action, { state, localize }) {
  if (action.usesSession === false) return localize(K.workingFree);
  return localize(K.working, { session: Number(state?.sessionCount ?? 0) + 1 });
}

function cardOf(action, context) {
  const preflight = preflightAttempt({
    state: context.state,
    action,
    library: context.library,
    rollData: context.rollData,
  });
  const setupFault = !preflight.ok && SETUP_REASONS.has(preflight.reason);
  const { chips, hiddenCost } = costChips({ action, context, setupFault });
  const hazards = setupFault ? [] : hazardsOf(action, context);
  const note = noteOf({ action, preflight, hazards, context });
  return {
    actionId: action.id,
    name: action.label ?? action.id,
    icon: action.icon ?? '',
    description: action.description ?? '',
    check: action.check === 'roll',
    enabled: context.takeAction && preflight.ok,
    reason: preflight.ok ? null : preflight.reason,
    note: note.note,
    noteText: note.text,
    noteTone: note.tone,
    busyNote: busyNote(action, context),
    ...(note.note === 'waiting' && { availableAt: context.availableAt }),
    costs: chips,
    hazards: hazards.map(({ rule, ...chip }) => chip),
    noCost: chips.length === 0 && hazards.length === 0 && !hiddenCost,
  };
}

/**
 * The cards of the described step. `context` holds its `state`, `library`, `rollData`, the
 * viewer's `labels`, `takeAction`, and whether the step has `ended` or is `waiting` until
 * `availableAt`.
 */
export function cardViews(context) {
  if (!context.state) return [];
  return allowedActions(context.library).map((action) => cardOf(action, context));
}
