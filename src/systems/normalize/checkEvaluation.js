/** The persisted evaluation record keeps inactive choices for later mode switches. */
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
        faces: normalizeFaces(explode.faces, 'best', die),
        once: explode.once === true,
      },
      cancel: {
        enabled: cancel.enabled === true,
        faces: normalizeFaces(cancel.faces, 'worst', die),
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

export function normalizeNullableAdjustment(value) {
  if ([null, undefined, ''].includes(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeNullableSuccesses(value) {
  if ([null, undefined, ''].includes(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 20 ? number : null;
}

function normalizeFaces(input, defaultKind, die) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    kind: source.kind === 'from' ? 'from' : defaultKind,
    value: integerInRange(source.value, 1, die, null),
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
