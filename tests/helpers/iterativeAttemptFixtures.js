/**
 * Plain-data builders for the iterative resolver suites: a library with one bounded and one
 * unbounded counter, an action, a step and a persisted step state, each overridable by key.
 * Every builder returns fresh data, and `deepFreeze` skips functions such as a die source.
 */

export const atLeast = (counterId, value) => ({ source: 'counter', counterId, op: '>=', value });

export const counter = (id, extra = {}) => ({ id, label: `Label ${id}`, limit: 'none', ...extra });

export const instance = (counterId, extra = {}) => ({
  counterId,
  start: 0,
  visible: true,
  ...extra,
});

export const cost = (id, counterId, amount, needsEnough = true) => ({
  id,
  counterId,
  amount,
  needsEnough,
});

export const effect = (id, counterId, op, amount, when = { combine: 'all' }) => ({
  id,
  when,
  target: { kind: 'counter', counterId },
  op,
  amount,
});

export const action = (extra = {}) => ({
  id: 'work',
  label: 'Work',
  categories: [],
  usesSession: true,
  availability: { combine: 'all', rules: [] },
  costs: [],
  check: 'none',
  effects: [],
  ...extra,
});

export const step = (extra = {}) => ({
  actions: { mode: 'all', actionIds: [] },
  hiddenCounterIds: [],
  lockedCounterIds: [],
  success: [atLeast('heat', 10)],
  failure: [],
  ...extra,
});

export const RESULT_GROUPS = Object.freeze([
  { id: 'g-fine', producedWhen: [{ end: 'success', rules: [atLeast('heat', 15)] }] },
  { id: 'g-plain', producedWhen: [{ end: 'success', rules: [] }] },
  { id: 'g-slag', role: 'failure', producedWhen: [{ end: 'failure', rules: [] }] },
]);

/** heat is `perRecipe` (instance bounds 1 to 18), ember is unbounded and fuel is `global` (0 to 10). */
export const library = (extra = {}) => ({
  version: 1,
  counters: [
    counter('heat', { limit: 'perRecipe', min: 0, max: 20 }),
    counter('ember'),
    counter('fuel', { limit: 'global', min: 0, max: 10 }),
  ],
  actions: [],
  instances: [
    instance('heat', { start: 2, min: 1, max: 18, target: 12 }),
    instance('ember', { start: 5 }),
    instance('fuel', { start: 3, min: 4, max: 6 }),
  ],
  step: step(),
  resultGroups: structuredClone(RESULT_GROUPS),
  ...extra,
});

/** A persisted step state holding heat 2, ember 5 and fuel 3 unless `values` says otherwise. */
export function state({ values = {}, ...extra } = {}) {
  const held = { heat: 2, ember: 5, fuel: 3, ...values };
  return {
    version: 1,
    counters: Object.entries(held).map(([counterId, value]) => ({ counterId, value })),
    attemptCount: 0,
    sessionCount: 0,
    startedWith: [],
    log: [],
    compacted: null,
    labels: null,
    toolBreakOwed: null,
    terminal: null,
    ...extra,
  };
}

export const logEntry = (attempt, actionId) => ({
  attempt,
  sessionNumber: attempt,
  actionId,
  requestId: `req-${attempt}`,
  check: null,
  rolls: [],
  paid: [],
  changed: [],
});

/** Freezes `value` and everything under it, leaving functions alone. */
export function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
