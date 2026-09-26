/**
 * Produces the persisted check-evaluation record while retaining inactive mode choices.
 * Invalid values fall back to the record's stable defaults.
 */
export function normalizeCheckEvaluation(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const target = source.target && typeof source.target === 'object' ? source.target : {};
  const pool = source.pool && typeof source.pool === 'object' ? source.pool : {};
  const die = integerAtLeast(pool.die, 2, 10);
  const explode = pool.explode && typeof pool.explode === 'object' ? pool.explode : {};
  const cancel = pool.cancel && typeof pool.cancel === 'object' ? pool.cancel : {};
  const additional =
    pool.additionalDice && typeof pool.additionalDice === 'object' ? pool.additionalDice : {};
  return {
    product: source.product === 'count' ? 'count' : 'sum',
    direction: source.direction === 'under' ? 'under' : 'over',
    target: {
      source: target.source === 'attribute' ? 'attribute' : 'fixed',
      expression: expression(target.expression, ''),
      adjustmentKind: target.adjustmentKind === 'multiply' ? 'multiply' : 'add',
      baseAdjustment: normalizeNullableAdjustment(target.baseAdjustment),
    },
    pool: {
      die,
      base: expression(pool.base, '2'),
      threshold: expression(pool.threshold, '8'),
      required: integerInRange(pool.required, 0, 20, 1),
      modifierDestination: pool.modifierDestination === 'threshold' ? 'threshold' : 'pool',
      zeroPoolFails: pool.zeroPoolFails !== false,
      explode: {
        enabled: explode.enabled === true,
        faces: normalizeFaces(explode.faces, 'best'),
        once: explode.once === true,
      },
      cancel: {
        enabled: cancel.enabled === true,
        faces: normalizeFaces(cancel.faces, 'worst'),
      },
      additionalDice: {
        enabled: additional.enabled === true,
        source: additional.source === 'macro' ? 'macro' : 'path',
        path: string(additional.path),
        readMacroUuid: string(additional.readMacroUuid),
        spendMacroUuid: string(additional.spendMacroUuid),
        max: integerInRange(additional.max, 1, 20, 1),
      },
    },
  };
}

/** Converts a finite adjustment to a number and represents an absent or invalid value as null. */
export function normalizeNullableAdjustment(value) {
  if ([null, undefined, ''].includes(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Clamps an authored integer success count to 0–20; an absent or non-integer value is null. */
export function normalizeNullableSuccesses(value) {
  return integerInRange(value, 0, 20, null);
}

// A face beyond the die is kept, not clamped: switching dice is lossless and readiness flags it.
function normalizeFaces(input, defaultKind) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    kind: source.kind === 'from' ? 'from' : defaultKind,
    value: integerAtLeast(source.value, 1, null),
  };
}

function integerAtLeast(value, minimum, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum ? number : fallback;
}

function integerInRange(value, minimum, maximum, fallback) {
  if ([null, undefined, ''].includes(value)) return fallback;
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function expression(value, fallback) {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
    ? String(value)
    : fallback;
}

function string(value) {
  return typeof value === 'string' ? value : '';
}
