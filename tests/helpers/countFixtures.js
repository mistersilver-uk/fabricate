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

/**
 * A JSON-round-tripped prepared simple count check authoring `evaluation`, whose captured
 * `decisionPolicy.count` resolved a base of 2 at threshold 8 before any Tool; `count` overrides it.
 */
export function preparedCountCheck({
  evaluation = countEvaluation(),
  toolContributions = [],
  count = {},
} = {}) {
  return JSON.parse(
    JSON.stringify({
      mode: 'simple',
      slot: 'simple',
      rollFormula: '',
      flavor: 'Sun Tea — Crafting check',
      checkConfig: { rollFormula: '', dc: 10, evaluation, toolContributions },
      decisionPolicy: {
        dc: null,
        target: null,
        targetSource: null,
        thresholdMode: null,
        type: null,
        relativeOutcomes: [],
        fixedOutcomes: [],
        clampToNearest: false,
        minOutcomeId: null,
        count: {
          die: 10,
          direction: 'over',
          base: 2,
          threshold: 8,
          required: 1,
          comparison: 'meet',
          explode: evaluation.pool.explode,
          cancel: evaluation.pool.cancel,
          zeroPoolFails: true,
          modifierDestination: 'pool',
          ...count,
        },
      },
    })
  );
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
