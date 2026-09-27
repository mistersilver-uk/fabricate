/** The success-counting fixtures the count evaluation, odds and Roll suites share. */

/** A count evaluation over a d10 pool of 2 dice at threshold 8; `pool` overrides any field. */
export function countEvaluation({ direction = 'over', ...pool } = {}) {
  return {
    product: 'count',
    direction,
    pool: {
      die: 10,
      base: '2',
      threshold: '8',
      required: 1,
      modifierDestination: 'pool',
      zeroPoolFails: true,
      explode: { enabled: false, faces: { kind: 'best', value: null }, once: false },
      cancel: { enabled: false, faces: { kind: 'worst', value: null } },
      ...pool,
    },
  };
}

export function scalar(source, value) {
  return { source, label: source, form: 'scalar', value };
}

export function deepFreeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child);
  }
  return Object.freeze(value);
}
