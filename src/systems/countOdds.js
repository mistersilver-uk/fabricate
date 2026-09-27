/**
 * Exact success-counting odds from explicit inputs, scored by `countEvaluation.js`'s own predicates
 * and projection. Original dice convolve natively as `NdX`, and each separately evaluated pre-roll
 * is mixed exactly over the pool or threshold it settles; nothing is sampled or averaged.
 */
import { settlePlacement } from './checkModifierRouter.js';
import {
  countCheckPasses,
  countFacePredicates,
  projectCountResults,
  resolvePool,
} from './countEvaluation.js';

/** The odds refusals count adds; any pool refusal passes through as `resolvePool` reports it. */
export const COUNT_ODDS_REASONS = Object.freeze({
  preRollNotEnumerable: 'modifier-preroll-not-enumerable',
  tooManyOutcomes: 'too-many-outcomes',
  residualTooLarge: 'count-residual-too-large',
});

/** Recursive explosion expands until the pool's unexpanded mass is below this, or the depth. */
export const COUNT_ODDS_RESIDUAL = 1e-9;
export const COUNT_ODDS_MAX_DEPTH = 20;

const MAX_PRE_ROLL_OUTCOMES = 50_000;
const MAX_CONVOLUTION_WORK = 25_000_000;
const AGGREGATES = new Set(['anyDie', 'allDice']);

/**
 * `{ ok: true, status, outcomes, residual, expected }` or `{ ok: false, reason, … }`. `placement`
 * is the router plan, `preRollTotals` each pending pre-roll's equally likely `totals` by `index`.
 * Outcomes `{ net, zeroPool, matches, probability }` plus `residual` sum to one unrenormalized;
 * `status` is `exact` with no residual, `bounded` below the limit, and `expected` is closed-form.
 */
export function countOdds({
  evaluation,
  thresholdMode,
  rollData = {},
  placement = null,
  preRollTotals = [],
  faceAggregates = [],
}) {
  const aggregates = aggregateShape(faceAggregates);
  const deltas = deltaMixture(placement ?? EMPTY_PLACEMENT, preRollTotals);
  if (!deltas.ok) return deltas;
  const policies = new Map();
  for (const { poolDelta, thresholdDelta, weight } of deltas.entries) {
    const settled = { poolDelta, thresholdDelta, preRolls: [] };
    const pool = resolvePool({ evaluation, thresholdMode, rollData, placement: settled });
    if (!pool.ok) return pool;
    const key = `${pool.policy.dice}|${pool.policy.threshold}`;
    const entry = policies.get(key) ?? { policy: pool.policy, weight: 0 };
    entry.weight += weight;
    policies.set(key, entry);
  }
  return mixPolicies([...policies.values()], aggregates);
}

/** The mass of outcomes graded as a pass by `countCheckPasses`; a zero pool never passes. */
export function countPassProbability({ odds, required }) {
  return odds.outcomes
    .filter((outcome) =>
      countCheckPasses({ policy: { zeroPool: outcome.zeroPool }, net: outcome.net, required })
    )
    .reduce((sum, outcome) => sum + outcome.probability, 0);
}

const EMPTY_PLACEMENT = Object.freeze({ poolDelta: 0, thresholdDelta: 0, preRolls: [] });

function aggregateShape(faceAggregates) {
  const anyBits = faceAggregates.reduce((bits, { aggregate }, bit) => {
    if (!AGGREGATES.has(aggregate)) throw new TypeError(`Unknown face aggregate ${aggregate}`);
    return aggregate === 'anyDie' ? bits | (1 << bit) : bits;
  }, 0);
  const size = 1 << faceAggregates.length;
  return { list: faceAggregates, size, anyBits, identity: (size - 1) & ~anyBits };
}

// Any-die marks OR across dice and all-dice marks AND, so an all mark starts set.
function combineMarks(left, right, anyBits) {
  return (anyBits & (left | right)) | (~anyBits & left & right);
}

// Each pending pre-roll settles once per distinct total through the router, so its sign and
// destination come from `settlePlacement`; the joint space then folds into distinct deltas.
function deltaMixture(plan, preRollTotals) {
  const pending = (plan.preRolls ?? []).filter((entry) => !Object.hasOwn(entry, 'total'));
  const tallies = [];
  for (const entry of pending) {
    const totals = preRollTotals.find((candidate) => candidate.index === entry.index)?.totals;
    if (!Array.isArray(totals) || totals.length === 0 || !totals.every(Number.isFinite)) {
      return { ok: false, reason: COUNT_ODDS_REASONS.preRollNotEnumerable };
    }
    tallies.push({ entry, totals });
  }
  const joint = tallies.reduce((product, { totals }) => product * totals.length, 1);
  if (joint > MAX_PRE_ROLL_OUTCOMES)
    return { ok: false, reason: COUNT_ODDS_REASONS.tooManyOutcomes };
  let entries = [{ poolDelta: plan.poolDelta, thresholdDelta: plan.thresholdDelta, weight: 1 }];
  for (const tally of tallies) entries = foldPreRoll(entries, preRollEffects(plan, tally));
  return { ok: true, entries };
}

function preRollEffects(plan, { entry, totals }) {
  const isolated = { ...plan, appendTerms: [], poolDelta: 0, thresholdDelta: 0, preRolls: [entry] };
  const effects = new Map();
  for (const total of totals) {
    const known = effects.get(total);
    if (known) {
      known.weight += 1 / totals.length;
      continue;
    }
    const settled = settlePlacement(isolated, [{ index: entry.index, total }]);
    effects.set(total, {
      poolDelta: settled.poolDelta,
      thresholdDelta: settled.thresholdDelta,
      weight: 1 / totals.length,
    });
  }
  return [...effects.values()];
}

function foldPreRoll(entries, effects) {
  const folded = new Map();
  for (const entry of entries) {
    for (const effect of effects) {
      const poolDelta = entry.poolDelta + effect.poolDelta;
      const thresholdDelta = entry.thresholdDelta + effect.thresholdDelta;
      const key = `${poolDelta}|${thresholdDelta}`;
      const target = folded.get(key) ?? { poolDelta, thresholdDelta, weight: 0 };
      target.weight += entry.weight * effect.weight;
      folded.set(key, target);
    }
  }
  return [...folded.values()];
}

function mixPolicies(policies, aggregates) {
  const chained = chainPolicies(policies, aggregates);
  if (!chained.ok) return chained;
  const mixture = new Map();
  let residual = 0;
  let expected = 0;
  for (const { policy, weight, chain } of chained.chains) {
    if (!chain) {
      addOutcome(mixture, { net: 0, zeroPool: true, mask: 0 }, weight);
      continue;
    }
    for (const outcome of convolvePool(chain, policy.dice, aggregates)) {
      addOutcome(mixture, outcome, weight * outcome.probability);
    }
    residual += weight * chain.residual;
    expected += weight * policy.dice * chain.expectedPerDie;
  }
  return {
    ok: true,
    status: residual > 0 ? 'bounded' : 'exact',
    outcomes: listOutcomes(mixture, aggregates.list.length),
    residual,
    expected,
  };
}

// Every policy's chain and residual is judged, and the whole budget priced, before any convolution.
function chainPolicies(policies, aggregates) {
  const chains = [];
  let work = 0;
  for (const { policy, weight } of policies) {
    if (policy.zeroPool) {
      chains.push({ policy, weight, chain: null });
      continue;
    }
    const chain = dieChain(policy, aggregates);
    if (chain.residual >= COUNT_ODDS_RESIDUAL) {
      return { ok: false, reason: COUNT_ODDS_REASONS.residualTooLarge, residual: chain.residual };
    }
    work += convolutionWork(chain, policy.dice, aggregates.size);
    chains.push({ policy, weight, chain });
  }
  if (work > MAX_CONVOLUTION_WORK) return { ok: false, reason: COUNT_ODDS_REASONS.tooManyOutcomes };
  return { ok: true, chains };
}

// One original die and every die its explosion generates: `explodes(face, { generated })`
// decides each continuation, so explode-once stops after the first generated die.
function dieChain(policy, aggregates) {
  const { explodes } = countFacePredicates(policy);
  const faces = Array.from({ length: policy.die }, (_, index) => index + 1);
  const { results } = projectCountResults({
    policy,
    results: faces.map((result) => ({ result })),
    number: policy.die,
  });
  const scored = results.map(({ face, contribution }) => ({
    face,
    contribution,
    mask: aggregates.list.reduce(
      (bits, { matches }, bit) => (matches(face) ? bits | (1 << bit) : bits),
      0
    ),
    share: 1 / policy.die,
  }));
  const settled = new Map();
  let pending = new Map();
  for (const die of scored) {
    addState(explodes(die.face) ? pending : settled, die.contribution, die.mask, die.share);
  }
  let depth = 0;
  while (pending.size > 0 && poolResidual(pending, policy.dice) >= COUNT_ODDS_RESIDUAL) {
    if (depth === COUNT_ODDS_MAX_DEPTH) break;
    pending = expand(pending, settled, scored, { explodes, anyBits: aggregates.anyBits });
    depth += 1;
  }
  return {
    states: [...settled.values()],
    residual: pending.size > 0 ? poolResidual(pending, policy.dice) : 0,
    expectedPerDie: expectedPerDie(scored, explodes),
  };
}

function expand(pending, settled, scored, { explodes, anyBits }) {
  const next = new Map();
  for (const state of pending.values()) {
    for (const die of scored) {
      const target = explodes(die.face, { generated: true }) ? next : settled;
      const mask = combineMarks(state.mask, die.mask, anyBits);
      addState(target, state.net + die.contribution, mask, state.probability * die.share);
    }
  }
  return next;
}

function addState(states, net, mask, probability) {
  const key = `${net}|${mask}`;
  const state = states.get(key) ?? { net, mask, probability: 0 };
  state.probability += probability;
  states.set(key, state);
}

// The chance that at least one of the pool's dice is still exploding: 1 - (1 - r)^dice.
function poolResidual(pending, dice) {
  let perDie = 0;
  for (const state of pending.values()) perDie += state.probability;
  return -Math.expm1(dice * Math.log1p(-perDie));
}

// Each generated die repeats the mean face contribution, and recursion continues geometrically.
function expectedPerDie(scored, explodes) {
  const mean = scored.reduce((sum, die) => sum + die.contribution * die.share, 0);
  const original = scored.filter((die) => explodes(die.face)).length / scored.length;
  const generated =
    scored.filter((die) => explodes(die.face, { generated: true })).length / scored.length;
  return mean * (1 + original / (1 - generated));
}

function netSpan(states) {
  const nets = states.map((state) => state.net);
  return { low: Math.min(...nets), high: Math.max(...nets) };
}

function convolutionWork(chain, dice, size) {
  const { low, high } = netSpan(chain.states);
  const growth = high - low;
  return size * chain.states.length * (dice + (growth * dice * (dice - 1)) / 2);
}

// Dense rows of `size` mark slots per net, grown one original die at a time.
function convolvePool(chain, dice, { size, anyBits, identity }) {
  const { low, high } = netSpan(chain.states);
  let slots = new Float64Array(size);
  slots[identity] = 1;
  for (let rolled = 0; rolled < dice; rolled += 1) {
    const next = new Float64Array(slots.length + (high - low) * size);
    for (const [slot, mass] of slots.entries()) {
      if (mass === 0) continue;
      const row = Math.floor(slot / size);
      const mask = slot % size;
      for (const state of chain.states) {
        const target = (row + state.net - low) * size + combineMarks(mask, state.mask, anyBits);
        next[target] += mass * state.probability;
      }
    }
    slots = next;
  }
  const outcomes = [];
  for (const [slot, probability] of slots.entries()) {
    if (probability === 0) continue;
    const net = Math.floor(slot / size) + low * dice;
    outcomes.push({ net, zeroPool: false, mask: slot % size, probability });
  }
  return outcomes;
}

function addOutcome(mixture, { net, zeroPool, mask }, probability) {
  const key = `${zeroPool}|${net}|${mask}`;
  const outcome = mixture.get(key) ?? { net, zeroPool, mask, probability: 0 };
  outcome.probability += probability;
  mixture.set(key, outcome);
}

function listOutcomes(mixture, count) {
  return [...mixture.values()]
    .toSorted(
      (left, right) =>
        Number(right.zeroPool) - Number(left.zeroPool) ||
        left.net - right.net ||
        left.mask - right.mask
    )
    .map(({ net, zeroPool, mask, probability }) => ({
      net,
      zeroPool,
      matches: Array.from({ length: count }, (_, bit) => Boolean(mask & (1 << bit))),
      probability,
    }));
}
