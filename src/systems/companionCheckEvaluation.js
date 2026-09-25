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

function validRecord(record, schema) {
  if (!plainRecord(record)) return false;
  for (const key of Reflect.ownKeys(record)) {
    if (typeof key !== 'string' || !Object.hasOwn(schema, key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return false;
    const rule = schema[key];
    if (typeof rule === 'function') {
      if (!rule(descriptor.value)) return false;
    } else if (!validRecord(descriptor.value, rule)) return false;
  }
  return true;
}

/** Validate every supplied field before applying persisted-record defaults. */
export function resolveCompanionCheckEvaluation(input) {
  if (input === undefined) return { ok: true, evaluation: normalizeCheckEvaluation() };
  try {
    if (!validRecord(input, evaluationSchema)) return { ok: false };
    const die = input.pool?.die ?? 10;
    for (const value of [input.pool?.explode?.faces?.value, input.pool?.cancel?.faces?.value]) {
      if (value !== undefined && value !== null && value > die) return { ok: false };
    }
    return { ok: true, evaluation: normalizeCheckEvaluation(input) };
  } catch {
    return { ok: false };
  }
}

/** The published rows are the executable standalone dispatch contract. */
export function supportsCompanionCheckEvaluation(evaluation, interactive = false) {
  return CHECK_EVALUATION_CAPABILITIES.modes.some(
    (mode) =>
      mode.product === evaluation.product &&
      mode.direction === evaluation.direction &&
      mode.targetSources.includes(evaluation.target.source) &&
      (!interactive || mode.interactive)
  );
}
