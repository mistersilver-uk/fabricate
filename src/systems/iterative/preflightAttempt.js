/**
 * Phase 1 of an Iterative Attempt, and the refusal vocabulary the resolver shares. Preflight is
 * pure: it refuses with nothing spent, or returns the cost amounts the attempt will pay, so the
 * executor can run it before it prepares a check and the resolver can run it again.
 */
import {
  producedWhenLineFault,
  STEP_ACTION_MODES,
  stepIdListFault,
} from '../../models/iterativeStepConfig.js';
import { arrayOrEmpty, isPlainObject } from '../../utils/scalars.js';
import {
  ACTION_CHECKS,
  actionEntryFaults,
  COUNTER_LIMITS,
  ITERATIVE_LIBRARY_VERSION,
  RULE_COMBINES,
} from '../normalize/iterativeLibrary.js';

import { combineHolds, expressionRoots, stateFacts } from './attemptLibrary.js';
import { counterRuleFault, evaluateCounterRule } from './counterRule.js';
import { evaluateIterativeExpression } from './expression.js';

export const ITERATIVE_STEP_STATE_VERSION = 1;

/** Every reason an attempt, or the start of a step, can be refused. */
export const ITERATIVE_ATTEMPT_REFUSALS = Object.freeze({
  versionUnsupported: 'version-unsupported',
  stepEnded: 'step-ended',
  invalidEntry: 'invalid-entry',
  actionNotAllowed: 'action-not-allowed',
  unknownCounter: 'unknown-counter',
  actionUnavailable: 'action-unavailable',
  costUnaffordable: 'cost-unaffordable',
  expressionInvalid: 'expression-invalid',
  rollUnavailable: 'roll-unavailable',
  checkMismatch: 'check-mismatch',
});

const REASON = ITERATIVE_ATTEMPT_REFUSALS;

const EMPTY_STEP = Object.freeze({
  actions: Object.freeze({ mode: 'all', actionIds: Object.freeze([]) }),
  hiddenCounterIds: Object.freeze([]),
  lockedCounterIds: Object.freeze([]),
  success: Object.freeze([]),
  failure: Object.freeze([]),
});

/** A refusal; it changes nothing, and `detail` names what was refused. */
export const refuse = (reason, detail = {}) => ({ ok: false, reason, detail });

/** An evaluator failure as a refusal: a die that cannot answer on its own, the rest as an invalid expression. */
export function expressionRefusal(entryId, reason) {
  return reason === 'roll-unavailable'
    ? refuse(REASON.rollUnavailable, { entryId })
    : refuse(REASON.expressionInvalid, { entryId, expressionReason: reason });
}

/** The Action Adjustment hook: an amount passes through unchanged until Recipe Values define one. */
export const applyActionAdjustment = (amount) => amount;

/** The step's configuration, or an empty step that allows every action and never ends. */
export const stepOf = (library) => library?.step ?? EMPTY_STEP;

const ruleLists = (action, step, library) => [
  ...arrayOrEmpty(action?.availability?.rules),
  ...arrayOrEmpty(step.success),
  ...arrayOrEmpty(step.failure),
  ...arrayOrEmpty(action?.effects).flatMap((entry) => arrayOrEmpty(entry?.when?.rules)),
  ...arrayOrEmpty(library?.resultGroups).flatMap((group) =>
    arrayOrEmpty(group?.producedWhen).flatMap((line) => arrayOrEmpty(line?.rules))
  ),
];

function enumFault(action, step) {
  const enumsHold =
    ACTION_CHECKS.includes(action?.check) && RULE_COMBINES.includes(action?.availability?.combine);
  if (!enumsHold) return { entryId: action?.id ?? null, kind: 'action' };
  const { actions } = step;
  const stepHolds =
    isPlainObject(actions) &&
    STEP_ACTION_MODES.includes(actions.mode) &&
    ![actions.actionIds, step.hiddenCounterIds, step.lockedCounterIds].some(stepIdListFault);
  return stepHolds ? null : { entryId: null, kind: 'step' };
}

/** An `availability.rules`, `costs` or `effects` kept as authored because it is not a list. */
function listFault(action) {
  const lists = [action?.availability?.rules, action?.costs, action?.effects];
  return lists.every(Array.isArray) ? null : { entryId: action?.id ?? null, kind: 'action' };
}

/** The library's counters that one of its Counter Instances uses; the others never reach a run. */
const usedCounters = (library) => {
  const used = new Set(arrayOrEmpty(library?.instances).map((entry) => entry?.counterId));
  return arrayOrEmpty(library?.counters).filter((entry) => used.has(entry?.id));
};

/** The first used counter whose `limit` is outside its enum. */
export function limitFault(library) {
  const bad = usedCounters(library).find((entry) => !COUNTER_LIMITS.includes(entry?.limit));
  return bad ? { entryId: bad.id ?? null, kind: 'counter' } : null;
}

function entryFault(action) {
  const [bad] = actionEntryFaults(action);
  return bad ? { entryId: bad.entry?.id ?? null, kind: bad.kind, fault: bad.fault } : null;
}

function producedWhenFault(library) {
  for (const group of arrayOrEmpty(library?.resultGroups)) {
    for (const line of arrayOrEmpty(group?.producedWhen)) {
      const fault = producedWhenLineFault(line);
      if (fault) return { entryId: group?.id ?? null, kind: 'producedWhen', fault };
    }
  }
  return null;
}

function ruleFault(action, step, library) {
  for (const rule of ruleLists(action, step, library)) {
    const fault = counterRuleFault(rule);
    if (fault) return { entryId: null, kind: 'rule', fault };
  }
  return null;
}

/** The first Counter Instance, or used counter bound, whose number is `null`: a value that did not parse. */
export function nullNumberFault(library) {
  const nullInstance = arrayOrEmpty(library?.instances).find((entry) =>
    ['start', 'startFormula', 'min', 'max', 'target'].some((key) => entry?.[key] === null)
  );
  if (nullInstance) return { entryId: nullInstance.counterId, kind: 'instance' };
  const nullCounter = usedCounters(library).find(
    (entry) => entry?.min === null || entry?.max === null
  );
  return nullCounter ? { entryId: nullCounter.id, kind: 'counter' } : null;
}

function stateFault(state, library) {
  const numbers = [state?.attemptCount, state?.sessionCount];
  const rows = arrayOrEmpty(state?.counters);
  const missing = arrayOrEmpty(library?.instances).find(({ counterId }) =>
    rows.every((row) => row?.counterId !== counterId)
  );
  const unreadable = (row) => !Number.isFinite(row?.value);
  if (rows.some(unreadable) || missing || !numbers.every(Number.isFinite)) {
    const entryId = rows.find(unreadable)?.counterId ?? missing?.counterId ?? null;
    return { entryId, kind: 'state' };
  }
  return null;
}

/** Judges every entry the attempt reads with the helpers the normalizers and readiness share. */
function invalidEntry({ state, action, library }) {
  const step = stepOf(library);
  return (
    enumFault(action, step) ??
    listFault(action) ??
    entryFault(action) ??
    producedWhenFault(library) ??
    ruleFault(action, step, library) ??
    nullNumberFault(library) ??
    limitFault(library) ??
    stateFault(state, library)
  );
}

function unknownCounterId(action, step, library) {
  const known = new Set(arrayOrEmpty(library?.instances).map((entry) => entry.counterId));
  const named = [
    ...arrayOrEmpty(action.costs).map((entry) => entry.counterId),
    ...arrayOrEmpty(action.effects).map((entry) => entry.target.counterId),
    ...ruleLists(action, step, library)
      .filter((rule) => rule.source === 'counter')
      .map((rule) => rule.counterId),
  ];
  return named.find((id) => !known.has(id)) ?? null;
}

function priceCosts({ action, library, step, before, rollData }) {
  const locked = new Set(arrayOrEmpty(step.lockedCounterIds));
  const roots = expressionRoots(library, {
    counters: before.counters,
    sessionCount: before.sessionCount,
    checkValue: null,
  });
  const priced = [];
  for (const entry of arrayOrEmpty(action.costs)) {
    if (locked.has(entry.counterId)) continue;
    const outcome = evaluateIterativeExpression(entry.amount, { profile: 'cost', roots, rollData });
    if (!outcome.ok) return expressionRefusal(entry.id, outcome.reason);
    const amount = applyActionAdjustment(outcome.value);
    if (amount < 0) {
      return refuse(REASON.expressionInvalid, {
        entryId: entry.id,
        expressionReason: 'negative-cost',
      });
    }
    priced.push({
      costId: entry.id,
      counterId: entry.counterId,
      amount,
      needsEnough: entry.needsEnough,
    });
  }
  const short = priced.find(
    (cost) => cost.needsEnough !== false && cost.amount > before.counters.get(cost.counterId)
  );
  if (short) {
    const { costId: entryId, counterId, amount } = short;
    return refuse(REASON.costUnaffordable, {
      entryId,
      counterId,
      amount,
      value: before.counters.get(counterId),
    });
  }
  return {
    ok: true,
    costs: priced.map(({ costId, counterId, amount }) => ({ costId, counterId, amount })),
  };
}

const versionAhead = (state, library) =>
  Number(state?.version) > ITERATIVE_STEP_STATE_VERSION ||
  Number(library?.version) > ITERATIVE_LIBRARY_VERSION;

/**
 * Refuses an attempt before anything is spent or any check is prepared, in this order: version,
 * ended step, invalid entry, disallowed action, unknown counter, unavailable action, invalid cost
 * amount, unaffordable cost. A success carries the cost amounts, locked counters left out.
 * @returns {{ ok: true, costs: { costId: string, counterId: string, amount: number }[] }
 *   | { ok: false, reason: string, detail: object }}
 */
export function preflightAttempt({ state, action, library, rollData = {} }) {
  if (versionAhead(state, library)) {
    return refuse(REASON.versionUnsupported, {
      stateVersion: state?.version,
      libraryVersion: library?.version,
    });
  }
  if (state?.terminal != null) return refuse(REASON.stepEnded);
  const invalid = invalidEntry({ state, action, library });
  if (invalid) return refuse(REASON.invalidEntry, invalid);
  const step = stepOf(library);
  const { mode, actionIds } = step.actions;
  if (mode === 'only' && !actionIds.includes(action.id)) {
    return refuse(REASON.actionNotAllowed, { actionId: action.id });
  }
  const unknown = unknownCounterId(action, step, library);
  if (unknown !== null) return refuse(REASON.unknownCounter, { counterId: unknown });
  const before = stateFacts(state);
  const rules = arrayOrEmpty(action.availability.rules);
  if (
    !combineHolds(
      action.availability.combine,
      rules.map((rule) => evaluateCounterRule(rule, before))
    )
  ) {
    return refuse(REASON.actionUnavailable, { actionId: action.id });
  }
  return priceCosts({ action, library, step, before, rollData });
}
