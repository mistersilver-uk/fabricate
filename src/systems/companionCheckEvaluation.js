import { normalizeCheckEvaluation } from './normalize/checkEvaluation.js';

const SUM_OVER_FIXED = Object.freeze({
  product: 'sum',
  direction: 'over',
  targetSources: Object.freeze(['fixed']),
  interactive: true,
});

export const CHECK_EVALUATION_CAPABILITIES = Object.freeze({
  version: 1,
  modes: Object.freeze([SUM_OVER_FIXED]),
  additionalDice: false,
});

const expression = (value) => typeof value === 'string' || Number.isFinite(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const integer = (value, min, max = Number.MAX_SAFE_INTEGER) =>
  Number.isInteger(value) && value >= min && value <= max;
const oneOf =
  (...values) =>
  (value) =>
    values.includes(value);
const nullable = (valid) => (value) => value === null || valid(value);

const faces = (kind) => ({
  kind: oneOf(kind, 'from'),
  value: nullable((value) => integer(value, 1)),
});
const poolSchema = {
  die: (value) => integer(value, 2),
  base: expression,
  threshold: expression,
  required: (value) => integer(value, 0, 20),
  modifierDestination: oneOf('pool', 'threshold'),
  zeroPoolFails: (value) => typeof value === 'boolean',
  explode: {
    enabled: (value) => typeof value === 'boolean',
    faces: faces('best'),
    once: (value) => typeof value === 'boolean',
  },
  cancel: {
    enabled: (value) => typeof value === 'boolean',
    faces: faces('worst'),
  },
  additionalDice: {
    enabled: (value) => typeof value === 'boolean',
    source: oneOf('path', 'macro'),
    path: (value) => typeof value === 'string',
    readMacroUuid: (value) => typeof value === 'string',
    spendMacroUuid: (value) => typeof value === 'string',
    max: (value) => integer(value, 1, 20),
  },
};

const evaluationSchema = {
  product: oneOf('sum', 'count'),
  direction: oneOf('over', 'under'),
  target: {
    source: oneOf('fixed', 'attribute'),
    expression,
    adjustmentKind: oneOf('add', 'multiply'),
    baseAdjustment: nullable(finite),
  },
  pool: poolSchema,
};

function plainRecord(record) {
  if (record === null || typeof record !== 'object') return false;
  const prototype = Object.getPrototypeOf(record);
  return prototype === Object.prototype || prototype === null;
}

function validatedSnapshot(record, schema) {
  if (!plainRecord(record)) return null;
  const snapshot = {};
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !Object.hasOwn(schema, key)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
    // An own `undefined` is omitted, as a top-level `evaluation: undefined` is.
    if (descriptor.value === undefined) continue;
    const rule = schema[key];
    if (typeof rule === 'function') {
      if (!rule(descriptor.value)) return null;
      snapshot[key] = descriptor.value;
    } else {
      const nested = validatedSnapshot(descriptor.value, rule);
      if (nested === null) return null;
      snapshot[key] = nested;
    }
  }
  return snapshot;
}

/**
 * Validate every supplied plain-data field before applying shared defaults.
 * A valid normalized evaluation still requires an advertised execution mode.
 */
export function resolveCompanionCheckEvaluation(input) {
  if (input === undefined) return { ok: true, evaluation: normalizeCheckEvaluation() };
  try {
    const snapshot = validatedSnapshot(input, evaluationSchema);
    if (snapshot === null) return { ok: false };
    const die = snapshot.pool?.die ?? 10;
    for (const value of [
      snapshot.pool?.explode?.faces?.value,
      snapshot.pool?.cancel?.faces?.value,
    ]) {
      if (value !== undefined && value !== null && value > die) return { ok: false };
    }
    return { ok: true, evaluation: normalizeCheckEvaluation(snapshot) };
  } catch {
    return { ok: false };
  }
}

/**
 * Match a normalized evaluation against the published standalone execution rows.
 * Interactive eligibility belongs to each advertised row.
 */
export function supportsCompanionCheckEvaluation(evaluation, interactive = false) {
  return CHECK_EVALUATION_CAPABILITIES.modes.some(
    (mode) =>
      mode.product === evaluation.product &&
      mode.direction === evaluation.direction &&
      mode.targetSources.includes(evaluation.target.source) &&
      (!interactive || mode.interactive)
  );
}
