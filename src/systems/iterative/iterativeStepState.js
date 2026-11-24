/**
 * The persisted Iterative Step State, `run.steps[i].iterative` (`data-models` IterativeStepState):
 * a closed key set rebuilt on every write, with explicit nulls, and an attempt log bounded by
 * folding its oldest entries into `compacted`.
 */
import { arrayOrEmpty, cloneJson, isPlainObject } from '../../utils/scalars.js';

import { buildAttemptLibrary, iterativeLabels } from './attemptLibrary.js';
import { ITERATIVE_STEP_STATE_VERSION } from './preflightAttempt.js';

export const ITERATIVE_LOG_LIMIT = 25;
export const ITERATIVE_ARCHIVE_LOG_LIMIT = 10;

const listOf = (value) => cloneJson(arrayOrEmpty(value));
const orNull = (value) => cloneJson(value) ?? null;

function terminalOf(terminal) {
  if (!isPlainObject(terminal)) return null;
  const { kind, attempt, resultGroupId = null } = terminal;
  return { kind, attempt, resultGroupId };
}

/** `raw` rebuilt with exactly the state's keys, every empty nullable one an explicit `null`. */
function closedState(raw) {
  return {
    version: raw.version,
    counters: listOf(raw.counters),
    attemptCount: raw.attemptCount,
    sessionCount: raw.sessionCount,
    startedWith: listOf(raw.startedWith),
    log: listOf(raw.log),
    compacted: orNull(raw.compacted),
    labels: orNull(raw.labels),
    toolBreakOwed: orNull(raw.toolBreakOwed),
    terminal: terminalOf(raw.terminal),
  };
}

/** A started step's state from its resolved start: `counters` and `startedWith` as resolved. */
export function createIterativeStepState({ counters, startedWith }) {
  return closedState({
    version: ITERATIVE_STEP_STATE_VERSION,
    counters,
    attemptCount: 0,
    sessionCount: 0,
    startedWith,
  });
}

/**
 * `{ supported: true, state }` with unknown keys dropped, `{ supported: false, state }` holding a
 * newer version verbatim, or `null` when the step has no state.
 */
export function readIterativeStepState(raw) {
  if (!isPlainObject(raw)) return null;
  if (Number(raw.version) > ITERATIVE_STEP_STATE_VERSION) return { supported: false, state: raw };
  return { supported: true, state: closedState(raw) };
}

/** Per-counter totals in first-touch order, the folded rows after the totals already held. */
function foldTotals(rows, entries, key) {
  const totals = new Map(arrayOrEmpty(rows).map((row) => [row.counterId, row.total]));
  for (const { counterId, delta } of entries.flatMap((entry) => arrayOrEmpty(entry?.[key]))) {
    totals.set(counterId, (totals.get(counterId) ?? 0) + delta);
  }
  return [...totals].map(([counterId, total]) => ({ counterId, total }));
}

function fold(compacted, entries) {
  if (entries.length === 0) return compacted ?? null;
  return {
    attempts: (compacted?.attempts ?? 0) + entries.length,
    sessions: (compacted?.sessions ?? 0) + entries.filter((e) => e?.sessionNumber != null).length,
    paid: foldTotals(compacted?.paid, entries, 'paid'),
    changed: foldTotals(compacted?.changed, entries, 'changed'),
  };
}

/** `state` keeping its newest `limit` log entries, the older ones folded into `compacted`. */
function trimLog(state, limit) {
  const log = arrayOrEmpty(state.log);
  const overflow = Math.max(0, log.length - limit);
  const compacted = fold(state.compacted, log.slice(0, overflow));
  return closedState({ ...state, log: log.slice(overflow), compacted });
}

/** `state` with the resolver's `entry` appended under its Attempt id, the log held to 25. */
export function appendAttemptEntry(state, entry, attemptId) {
  const stamped = {
    attempt: entry.attempt,
    sessionNumber: entry.sessionNumber ?? null,
    actionId: entry.actionId,
    requestId: attemptId,
    check: orNull(entry.check),
    rolls: listOf(entry.rolls),
    paid: listOf(entry.paid),
    changed: listOf(entry.changed),
  };
  return trimLog({ ...state, log: [...arrayOrEmpty(state.log), stamped] }, ITERATIVE_LOG_LIMIT);
}

/** The logged entry an Attempt id names on any step, and the step end it caused, or `null`. */
export function findAttemptEntry(run, attemptId) {
  if (typeof attemptId !== 'string' || attemptId === '') return null;
  for (const step of arrayOrEmpty(run?.steps)) {
    const state = step?.iterative;
    const entry = arrayOrEmpty(state?.log).find((logged) => logged?.requestId === attemptId);
    if (!entry) continue;
    const ended = state.terminal?.attempt === entry.attempt;
    return { attempt: cloneJson(entry), stepEnd: ended ? terminalOf(state.terminal) : null };
  }
  return null;
}

/**
 * At archive: trims each supported step state to 10 and labels it from the terms snapshot, then
 * deletes the snapshot. An unsupported state is kept verbatim.
 */
export function archiveRunTerms(run) {
  const terms = run?.termsSnapshot;
  const labels = terms?.iterative
    ? iterativeLabels(buildAttemptLibrary(terms.iterative, terms.recipe))
    : null;
  for (const step of arrayOrEmpty(run?.steps)) {
    const read = readIterativeStepState(step?.iterative);
    if (!read?.supported) continue;
    step.iterative = { ...trimLog(read.state, ITERATIVE_ARCHIVE_LOG_LIMIT), labels };
  }
  delete run.termsSnapshot;
}
