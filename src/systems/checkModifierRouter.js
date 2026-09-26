/**
 * Places already resolved check benefits without selecting, bounding or rolling them.
 * Original contribution indices identify pre-rolls even when labels repeat.
 */

const SOURCES = new Set(['tool', 'library', 'situational', 'advantage']);

function placementOrder({ source, form }) {
  if (source === 'tool') return 0;
  if (source === 'library') return form === 'scalar' ? 1 : 2;
  if (source === 'situational') return 3;
  return 4;
}

function destinationFor(evaluation, source) {
  if (evaluation.product === 'sum') return evaluation.direction === 'over' ? 'append' : 'target';
  if (source === 'advantage') return 'pool';
  return evaluation.pool?.modifierDestination === 'threshold' ? 'threshold' : 'pool';
}

function benefitSign(destination, direction) {
  return destination === 'threshold' && direction === 'over' ? -1 : 1;
}

function addBenefit(plan, destination, value) {
  if (destination === 'target') plan.targetDelta += value;
  if (destination === 'threshold') {
    plan.thresholdDelta += benefitSign(destination, plan.direction) * value;
  }
  if (destination === 'pool') plan.poolDelta += value;
}

function validateEvaluation(evaluation) {
  if (!['sum', 'count'].includes(evaluation?.product)) {
    throw new TypeError('A sum or count evaluation is required');
  }
  if (!['over', 'under'].includes(evaluation.direction)) {
    throw new TypeError('An over or under direction is required');
  }
  if (
    evaluation.product === 'count' &&
    !['pool', 'threshold'].includes(evaluation.pool?.modifierDestination)
  ) {
    throw new TypeError('A count modifier destination is required');
  }
}

function validateContribution(contribution) {
  if (!SOURCES.has(contribution?.source)) throw new TypeError('Unknown contribution source');
  if (contribution.form === 'scalar') {
    if (!Number.isFinite(contribution.value)) throw new TypeError('Scalar benefit must be finite');
  } else if (
    contribution.form !== 'expression' ||
    typeof contribution.expression !== 'string' ||
    !contribution.expression.trim()
  ) {
    throw new TypeError('Contribution requires a scalar or expression form');
  }
  if (contribution.preRoll) {
    if (contribution.form !== 'scalar') {
      throw new TypeError('Evaluated pre-roll evidence requires a scalar benefit');
    }
    if (
      typeof contribution.preRoll.expression !== 'string' ||
      !contribution.preRoll.expression.trim() ||
      !Number.isFinite(contribution.preRoll.total) ||
      contribution.preRoll.total !== contribution.value
    ) {
      throw new TypeError('Pre-roll evidence must match its finite scalar benefit');
    }
  }
}

function preRollRecord({ index, contribution, destination }) {
  const evidence = contribution.preRoll;
  const record = {
    index,
    source: contribution.source,
    label: contribution.label,
    expression: evidence?.expression ?? contribution.expression,
    destination,
  };
  if (evidence) {
    record.total = evidence.total;
    if (Object.hasOwn(evidence, 'serializedRoll')) {
      record.serializedRoll = structuredClone(evidence.serializedRoll);
    }
  }
  return record;
}

/**
 * Orders resolved sources once and routes their benefit without selecting or evaluating them.
 * Pending expressions retain their source order so settlement and evidence describe the same plan.
 */
export function planModifierPlacement({ evaluation, contributions = [] } = {}) {
  validateEvaluation(evaluation);
  if (!Array.isArray(contributions)) throw new TypeError('Contributions must be an array');

  const ordered = contributions
    .map((contribution, index) => {
      validateContribution(contribution);
      return { contribution, index };
    })
    .sort(
      (left, right) =>
        placementOrder(left.contribution) - placementOrder(right.contribution) ||
        left.index - right.index
    );
  const plan = {
    direction: evaluation.direction,
    appendTerms: [],
    targetDelta: 0,
    thresholdDelta: 0,
    poolDelta: 0,
    preRolls: [],
  };

  for (const { contribution, index } of ordered) {
    if (
      contribution.source === 'advantage' &&
      contribution.form === 'scalar' &&
      evaluation.product !== 'count'
    ) {
      throw new TypeError('A scalar advantage benefit belongs only to a count pool');
    }
    const destination = destinationFor(evaluation, contribution.source);
    if (contribution.preRoll) {
      plan.preRolls.push(preRollRecord({ index, contribution, destination }));
    }
    if (destination === 'append') {
      if (contribution.form === 'expression' || contribution.value !== 0) {
        plan.appendTerms.push({
          index,
          source: contribution.source,
          label: contribution.label,
          form: contribution.form,
          ...(contribution.form === 'scalar'
            ? { value: contribution.value }
            : { expression: contribution.expression }),
        });
      }
    } else if (contribution.form === 'scalar') {
      addBenefit(plan, destination, contribution.value);
    } else {
      plan.preRolls.push(preRollRecord({ index, contribution, destination }));
    }
  }

  return plan;
}

/** Settles each pending expression once; preserved evidence adds no second benefit. */
export function settlePlacement(plan, preRollResults = []) {
  if (!Array.isArray(preRollResults)) throw new TypeError('Pre-roll results must be an array');
  const pending = new Set(
    plan.preRolls.filter((entry) => !Object.hasOwn(entry, 'total')).map((entry) => entry.index)
  );
  const results = new Map();
  for (const result of preRollResults) {
    if (results.has(result?.index)) throw new TypeError('Duplicate pre-roll result index');
    if (!pending.has(result?.index)) throw new TypeError('Unknown pre-roll result index');
    if (!Number.isFinite(result.total)) throw new TypeError('Pre-roll total must be finite');
    results.set(result.index, result);
  }
  if (results.size !== pending.size) throw new TypeError('Missing pre-roll result');

  const settled = {
    ...plan,
    appendTerms: plan.appendTerms.map((term) => ({ ...term })),
    preRolls: plan.preRolls.map((entry) => structuredClone(entry)),
  };
  for (const entry of settled.preRolls) {
    if (!pending.has(entry.index)) continue;
    const result = results.get(entry.index);
    entry.total = result.total;
    if (Object.hasOwn(result, 'serializedRoll')) {
      entry.serializedRoll = structuredClone(result.serializedRoll);
    }
    addBenefit(settled, entry.destination, result.total);
  }
  return settled;
}
