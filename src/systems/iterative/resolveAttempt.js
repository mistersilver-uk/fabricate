/**
 * The Iterative Attempt resolver (`resolution-modes` § Iterative Attempt Resolution), pure and
 * synchronous: the same state, action, library, roll data, check summary and die source always give
 * the same result, and no input is ever mutated. A refusal changes nothing. It never rolls the
 * check; the executor does, and passes the summary in.
 */
import { arrayOrEmpty, cloneJson, isPlainObject } from '../../utils/scalars.js';
import { ITERATIVE_LIBRARY_VERSION } from '../normalize/iterativeLibrary.js';

import {
  clampToBounds,
  combineHolds,
  effectiveBounds,
  expressionRoots,
  namesCheckFact,
  stateFacts,
} from './attemptLibrary.js';
import { evaluateCounterRule } from './counterRule.js';
import { analyzeIterativeExpression, evaluateIterativeExpression } from './expression.js';
import {
  applyActionAdjustment,
  expressionRefusal,
  ITERATIVE_ATTEMPT_REFUSALS,
  nullNumberFault,
  preflightAttempt,
  refuse,
  stepOf,
} from './preflightAttempt.js';
import { selectProducedGroup } from './routing.js';

export {
  ITERATIVE_ATTEMPT_REFUSALS,
  ITERATIVE_STEP_STATE_VERSION,
  preflightAttempt,
} from './preflightAttempt.js';

/** The frozen evaluation order; every extension phase exists as a no-op until its extension lands. */
export const ATTEMPT_PHASES = Object.freeze([
  'preflight',
  'check',
  'costs',
  'effects',
  'clamp',
  'terminal',
  'everySession',
  'reclamp',
  'countdown',
  'routing',
]);

const REASON = ITERATIVE_ATTEMPT_REFUSALS;

const sum = (values) => values.reduce((total, value) => total + value, 0);

/** Per-counter deltas in first-touch order; a counter whose deltas cancel is left out. */
function createLedger() {
  const totals = new Map();
  return {
    add: (counterId, delta) => totals.set(counterId, (totals.get(counterId) ?? 0) + delta),
    rows: () =>
      [...totals]
        .filter(([, delta]) => delta !== 0)
        .map(([counterId, delta]) => ({ counterId, delta })),
  };
}

function createContext({ state, action, library, rollData, check, rollDie }) {
  const before = stateFacts(state);
  const checkValue = check?.value ?? null;
  return {
    state,
    action,
    library,
    check,
    rollDie,
    rollData: rollData ?? {},
    step: stepOf(library),
    before,
    roots: expressionRoots(library, {
      counters: before.counters,
      sessionCount: before.sessionCount,
      checkValue,
    }),
    draft: { counters: new Map(before.counters), sessionCount: before.sessionCount },
    costs: [],
    paid: createLedger(),
    changed: createLedger(),
    rolls: [],
    ended: null,
    resultGroupId: null,
  };
}

/** What phases 6 to 10 read: the draft, with the action being resolved as the previous action. */
const draftFacts = ({ draft, action }) => ({
  counters: draft.counters,
  sessionCount: draft.sessionCount,
  previousActionId: action.id,
});

function clampDraft({ draft, library }) {
  for (const [counterId, value] of draft.counters) {
    draft.counters.set(counterId, clampToBounds(value, effectiveBounds(counterId, library)));
  }
}

/** `'success'` when the step has a success rule and all hold, else `'failure'` when any failure rule holds. */
function endOf(ctx) {
  const facts = draftFacts(ctx);
  const holds = (rule) => evaluateCounterRule(rule, facts);
  const success = arrayOrEmpty(ctx.step.success);
  if (success.length > 0 && success.every(holds)) return 'success';
  return arrayOrEmpty(ctx.step.failure).some(holds) ? 'failure' : null;
}

function checkPhase({ action, check }) {
  const wellFormed =
    isPlainObject(check) &&
    typeof check.success === 'boolean' &&
    (check.outcomeId === null || typeof check.outcomeId === 'string') &&
    Number.isFinite(check.value);
  const matches = action.check === 'roll' ? wellFormed : check === null;
  return matches ? null : refuse(REASON.checkMismatch, { actionId: action.id });
}

function costsPhase(ctx) {
  for (const { counterId, amount } of ctx.costs) {
    ctx.draft.counters.set(counterId, ctx.draft.counters.get(counterId) - amount);
    ctx.paid.add(counterId, -amount);
  }
}

/** A comparison of the check value, read through the rule evaluator with the value as the one fact. */
const checkValueHolds = (comparison, value) =>
  evaluateCounterRule(
    { source: 'sessionCount', op: comparison.op, value: comparison.value },
    { counters: new Map(), sessionCount: value, previousActionId: null }
  );

function whenHolds(when, check, facts) {
  const ids = arrayOrEmpty(when?.checkOutcomeIds);
  const conditions = [
    ...(ids.length > 0 ? [check !== null && ids.includes(check.outcomeId)] : []),
    ...(typeof when?.success === 'boolean'
      ? [check !== null && check.success === when.success]
      : []),
    ...(when?.value == null ? [] : [check !== null && checkValueHolds(when.value, check.value)]),
    ...arrayOrEmpty(when?.rules).map((rule) => evaluateCounterRule(rule, facts)),
  ];
  return combineHolds(when?.combine, conditions);
}

/** Whether `entry` runs now: not on a locked counter, and not on a check fact the attempt lacks. */
function effectApplies(entry, ctx) {
  if (arrayOrEmpty(ctx.step.lockedCounterIds).includes(entry.target.counterId)) return false;
  const readsCheck =
    namesCheckFact(entry.when) || analyzeIterativeExpression(entry.amount, 'effect').roots.check;
  if (ctx.check === null && readsCheck) return false;
  return whenHolds(entry.when, ctx.check, ctx.before);
}

function applyEffect({ draft, changed }, { op, target }, amount) {
  const held = draft.counters.get(target.counterId);
  const delta = { add: amount, subtract: -amount, set: amount - held }[op];
  draft.counters.set(target.counterId, op === 'set' ? amount : held + delta);
  changed.add(target.counterId, delta);
}

function effectsPhase(ctx) {
  for (const entry of arrayOrEmpty(ctx.action.effects)) {
    if (!effectApplies(entry, ctx)) continue;
    const { roots, rollData, rollDie } = ctx;
    const outcome = evaluateIterativeExpression(entry.amount, {
      profile: 'effect',
      roots,
      rollData,
      rollDie,
    });
    if (!outcome.ok) return expressionRefusal(entry.id, outcome.reason);
    applyEffect(ctx, entry, applyActionAdjustment(outcome.value));
    if (outcome.dice.length > 0) {
      ctx.rolls.push({ effectId: entry.id, total: sum(outcome.dice.map((term) => term.value)) });
    }
  }
  return null;
}

/** Phase runners by name; `ATTEMPT_PHASES` fixes the order, and a runner returns a refusal or nothing. */
const PHASE_RUNNERS = {
  preflight(ctx) {
    const outcome = preflightAttempt(ctx);
    if (!outcome.ok) return outcome;
    ctx.costs = outcome.costs;
    return null;
  },
  check: checkPhase,
  costs: costsPhase,
  effects: effectsPhase,
  clamp(ctx) {
    clampDraft(ctx);
    if (ctx.action.usesSession) ctx.draft.sessionCount += 1;
  },
  terminal(ctx) {
    ctx.ended = endOf(ctx);
  },
  everySession() {},
  reclamp(ctx) {
    if (ctx.ended !== null) return;
    clampDraft(ctx);
    ctx.ended = endOf(ctx);
  },
  countdown() {},
  routing(ctx) {
    if (ctx.ended === null) return;
    const group = selectProducedGroup(ctx.library.resultGroups, ctx.ended, draftFacts(ctx));
    ctx.resultGroupId = group?.id ?? null;
  },
};

function buildResult(ctx) {
  const { state, action, check, draft } = ctx;
  const attempt = state.attemptCount + 1;
  const terminal = ctx.ended && { kind: ctx.ended, attempt, resultGroupId: ctx.resultGroupId };
  return {
    ok: true,
    next: {
      version: state.version,
      counters: arrayOrEmpty(state.counters).map(({ counterId }) => ({
        counterId,
        value: draft.counters.get(counterId),
      })),
      attemptCount: attempt,
      sessionCount: draft.sessionCount,
      startedWith: cloneJson(state.startedWith) ?? [],
      log: cloneJson(state.log) ?? [],
      compacted: cloneJson(state.compacted) ?? null,
      labels: cloneJson(state.labels) ?? null,
      toolBreakOwed: cloneJson(state.toolBreakOwed) ?? null,
      terminal: terminal || null,
    },
    entry: {
      attempt,
      sessionNumber: action.usesSession ? state.sessionCount + 1 : null,
      actionId: action.id,
      check: check && { success: check.success, outcomeId: check.outcomeId, value: check.value },
      rolls: ctx.rolls,
      paid: ctx.paid.rows(),
      changed: ctx.changed.rows(),
    },
    terminal: terminal ? { ...terminal } : null,
  };
}

/**
 * Resolves one attempt. `check` is `null` exactly when `action.check` is `'none'`, else
 * `{ success, outcomeId, value }`; `rollDie(faces)` returns an integer in `[1, faces]`.
 * @returns {{ ok: true, next: object, entry: object, terminal: object | null }
 *   | { ok: false, reason: string, detail: object }}
 */
export function resolveAttempt({ state, action, library, rollData, check = null, rollDie }) {
  const ctx = createContext({ state, action, library, rollData, check, rollDie });
  for (const phase of ATTEMPT_PHASES) {
    const refusal = PHASE_RUNNERS[phase](ctx);
    if (refusal) return refusal;
  }
  return buildResult(ctx);
}

/** A Counter Instance's start: the formula's value and dice totals, or the plain `start`, then clamped. */
function startRow(entry, { library, roots, rollData, rollDie }) {
  const counterId = entry.counterId;
  let formulaValue = null;
  let rolls = [];
  if (entry.startFormula) {
    const outcome = evaluateIterativeExpression(entry.startFormula, {
      profile: 'start',
      roots,
      rollData,
      rollDie,
    });
    if (!outcome.ok) return expressionRefusal(counterId, outcome.reason);
    formulaValue = outcome.value;
    rolls = outcome.dice.map((term) => term.value);
  }
  const raw = formulaValue ?? entry.start;
  if (!Number.isFinite(raw))
    return refuse(REASON.invalidEntry, { entryId: counterId, kind: 'instance' });
  const value = clampToBounds(raw, effectiveBounds(counterId, library));
  return {
    ok: true,
    startedWith: { counterId, value, formulaValue, rolls, clamped: value !== raw },
  };
}

/**
 * Resolves every Counter Instance's start value once, in authored order, drawing each formula's
 * dice left to right. `startedWith` is what the run records beside the values.
 * @returns {{ ok: true, counters: { counterId: string, value: number }[], startedWith: object[] }
 *   | { ok: false, reason: string, detail: object }}
 */
export function resolveStartedWith({ library, rollData = {}, rollDie }) {
  if (Number(library?.version) > ITERATIVE_LIBRARY_VERSION) {
    return refuse(REASON.versionUnsupported, { libraryVersion: library.version });
  }
  const invalid = nullNumberFault(library);
  if (invalid) return refuse(REASON.invalidEntry, invalid);
  const roots = expressionRoots(library, {
    counters: new Map(),
    sessionCount: 0,
    checkValue: null,
  });
  const startedWith = [];
  for (const entry of arrayOrEmpty(library?.instances)) {
    const row = startRow(entry, { library, roots, rollData, rollDie });
    if (!row.ok) return row;
    startedWith.push(row.startedWith);
  }
  return {
    ok: true,
    counters: startedWith.map(({ counterId, value }) => ({ counterId, value })),
    startedWith,
  };
}
