/**
 * Grading and routed classification for summed checks (DOMAIN.md "Check"), which a count check
 * reaches as sum/over on its net. One direction-aware ranking drives matching, clamping, forcing,
 * tier steps and the minimum gate, so the runners, the prepared evaluator and the odds agree.
 */

import { evaluateCheckBreakageCondition } from '../toolBreakageRuntime.js';

import { compareToTarget, rankBest } from './checkEvaluation.js';
import { SUM_OVER_EVALUATION } from './checkModifierRouter.js';
import { multiplyTierThreshold } from './checkTarget.js';

/**
 * How a summed check grades: its direction, its target source, and whether relative tiers
 * multiply an attribute anchor. A count evaluation grades nothing here, so it reads as sum/over.
 */
export function sumGrading(evaluation) {
  const sum = (evaluation?.product ?? 'sum') === 'sum';
  const target = evaluation?.target ?? {};
  const attribute = sum && target.source === 'attribute';
  return {
    direction: sum && evaluation?.direction === 'under' ? 'under' : 'over',
    source: attribute ? 'attribute' : 'fixed',
    multiply: attribute && target.adjustmentKind === 'multiply',
  };
}

/** The target a total is graded against: under, the settled `targetDelta` applies exactly once. */
export function effectiveTarget(anchor, grading, targetDelta = 0) {
  return grading.direction === 'under' ? anchor + (Number(targetDelta) || 0) : anchor;
}

/**
 * The forced outcome from the unified trigger list (issue 419): a matching `success`/`failure`
 * trigger forces that disposition, and a forced failure beats a forced success. `outcomeTier`
 * conditions are skipped here, because the tier is resolved after this, but stay live for tier
 * steps and tool breakage. Answers `{ disposition }` or `null`.
 */
export function resolveForcedOutcome(triggers, { total, value, diceGroups } = {}) {
  const list = Array.isArray(triggers) ? triggers : [];
  const checkResult = {
    value,
    data: { total, diceGroups: Array.isArray(diceGroups) ? diceGroups : [] },
  };
  let forcedSuccess = null;
  for (const trigger of list) {
    if (!trigger || typeof trigger !== 'object') continue;
    const outcome = trigger.outcome;
    if (outcome !== 'success' && outcome !== 'failure') continue;
    if (trigger.condition?.type === 'outcomeTier') continue;
    if (!evaluateCheckBreakageCondition(trigger.condition, checkResult)) continue;
    if (outcome === 'failure') return { disposition: 'failure' }; // forced failure wins
    forcedSuccess = { disposition: 'success' };
  }
  return forcedSuccess;
}

function oppositeDirection(direction) {
  return direction === 'under' ? 'over' : 'under';
}

function routedTiers({ type, relativeOutcomes, fixedOutcomes }) {
  const source = type === 'fixed' ? fixedOutcomes : relativeOutcomes;
  return (Array.isArray(source) ? source : []).filter(Boolean);
}

/** Under an attribute/multiply check, a relative tier with no adjustment is the Otherwise tier. */
function isOtherwise(routing, outcome) {
  return routing.multiply && outcome.adjustment == null;
}

/**
 * A relative tier's threshold: `anchor + dc` over and `anchor − dc + targetDelta` under, or
 * `floor(anchor × adjustment)` plus `targetDelta` under a multiply check. NaN for Otherwise.
 */
function tierThreshold(routing, outcome) {
  const { anchor, direction, multiply, delta } = routing;
  if (multiply) {
    if (outcome.adjustment == null) return NaN;
    return multiplyTierThreshold(anchor, Number(outcome.adjustment)) + delta;
  }
  const step = Number(outcome.dc);
  return direction === 'under' ? anchor - step + delta : anchor + step;
}

/**
 * The one ranking rule, as `{ valueOf, direction }` for `rankBest`: fixed ranges by `start` and
 * multiply tiers by threshold, both in the check's direction. An additive tier's benefit-signed
 * `dc` orders exactly as its threshold does in either direction, so it ranks by `dc` over.
 */
function tierRanking(routing) {
  if (routing.type === 'fixed') {
    return { valueOf: (outcome) => Number(outcome.start), direction: routing.direction };
  }
  if (routing.multiply) {
    return { valueOf: (outcome) => tierThreshold(routing, outcome), direction: routing.direction };
  }
  return { valueOf: (outcome) => Number(outcome.dc), direction: 'over' };
}

/** The tiers a total can reach by its threshold or range: Otherwise and non-finite ranks excluded. */
function rankableTiers(routing) {
  const { valueOf } = tierRanking(routing);
  return routedTiers(routing).filter(
    (outcome) => !isOtherwise(routing, outcome) && Number.isFinite(valueOf(outcome))
  );
}

/**
 * Match a total to a routed tier, or `null`. The best qualifying tier wins. Under, a fixed range
 * matches `total − targetDelta`, so a benefit shifts toward the better, lower end (ruling D3).
 * With nothing qualifying, Otherwise applies, else `clampToNearest` routes to the least demanding
 * tier; there is no top-end clamp.
 */
function matchRoutedOutcome(routing, { total, comparison, clampToNearest }) {
  const { valueOf, direction } = tierRanking(routing);
  if (routing.type === 'fixed') {
    const value = total - routing.delta;
    const matching = rankableTiers(routing).filter((outcome) => {
      const end = Number(outcome.end);
      return Number.isFinite(end) && value >= Number(outcome.start) && value <= end;
    });
    return rankBest(matching, valueOf, direction)[0] ?? null;
  }
  const graded = rankableTiers(routing);
  const matching = graded.filter((outcome) =>
    compareToTarget(total, tierThreshold(routing, outcome), comparison, routing.direction)
  );
  if (matching.length > 0) return rankBest(matching, valueOf, direction)[0];
  const otherwise = routedTiers(routing).find((outcome) => isOtherwise(routing, outcome));
  if (otherwise) return otherwise;
  return clampToNearest
    ? (rankBest(graded, valueOf, oppositeDirection(direction))[0] ?? null)
    : null;
}

/**
 * The single derivation of routed tier order (issue 975), worst first: Otherwise tiers lowest in
 * authored order, then the rest by {@link tierRanking}, ties in authored order. Callers locate a
 * tier by id, never by identity, because this is a copy.
 */
function rankedRoutedOutcomes(routing) {
  const { valueOf, direction } = tierRanking(routing);
  const otherwise = routedTiers(routing).filter((outcome) => isOtherwise(routing, outcome));
  return [...otherwise, ...rankBest(rankableTiers(routing), valueOf, oppositeDirection(direction))];
}

/** The ranked tiers of one disposition, the only subset a forced outcome or a step moves in. */
function dispositionSubset(ranked, disposition) {
  const wantSuccess = disposition === 'success';
  return ranked.filter((outcome) => (outcome.success === true) === wantSuccess);
}

/** A forced failure routes to the lowest-ranked failing tier and a forced success to the
 *  highest-ranked succeeding one; equal ranks keep the first authored. `null` when none exists. */
function routeCritOutcome(routing, forcedSuccess) {
  const ranked = dispositionSubset(
    rankedRoutedOutcomes(routing),
    forcedSuccess ? 'success' : 'failure'
  );
  if (ranked.length === 0) return null;
  if (!forcedSuccess) return ranked[0];
  const { valueOf, direction } = tierRanking(routing);
  return rankBest(ranked, valueOf, direction)[0];
}

/**
 * The tier a forced failure routes to, with no step and no minimum gate: the lowest-ranked
 * failing tier, else `null`. A count check's zero pool routes here.
 */
export function forcedFailureTier({
  type,
  dc,
  relativeOutcomes,
  fixedOutcomes,
  evaluation = SUM_OVER_EVALUATION,
}) {
  const routing = routingOf({
    type,
    dc,
    evaluation,
    targetDelta: 0,
    relativeOutcomes,
    fixedOutcomes,
  });
  return routeCritOutcome(routing, false);
}

/** The `tierStep.mode` values that move; `none` and anything unrecognised is inert. */
const TIER_STEP_MODES = new Set(['target', 'up', 'down']);

/**
 * The frozen rolled-tier snapshot every step condition is evaluated against, once: a step asks
 * about the tier the dice landed on, never the stepped one, so steps cannot cycle. `value` stays
 * `undefined` so `progressiveValue` is invisible, as in `resolveForcedOutcome`.
 */
function rolledTierSnapshot(rolled, total, diceGroups) {
  return Object.freeze({
    value: undefined,
    outcome: rolled?.name ?? null,
    data: Object.freeze({
      total,
      diceGroups: Array.isArray(diceGroups) ? diceGroups : [],
      outcomeId: rolled?.id ?? null,
    }),
  });
}

/** Triggers matching the rolled tier whose `tierStep` moves, in author order. */
function matchedTierStepTriggers(triggers, snapshot) {
  return (Array.isArray(triggers) ? triggers : []).filter((trigger) => {
    if (!TIER_STEP_MODES.has(trigger?.tierStep?.mode)) return false;
    return evaluateCheckBreakageCondition(trigger.condition, snapshot);
  });
}

/** An integer `>= 1`, clamped here too so a raw negative never inverts the authored direction. */
function tierStepMagnitude(steps) {
  const value = Math.trunc(Number(steps));
  return Number.isFinite(value) && value >= 1 ? value : 1;
}

/**
 * The winning `target` trigger: a target is eligible only when its `tierId` is in the array in
 * play, and among eligible ones the lowest-ranked tier wins, order-independent and pessimistic.
 * `index` is -1 when none survives.
 */
function resolveTierStepTarget(stepping, inPlay) {
  let index = -1;
  let trigger = null;
  for (const candidate of stepping) {
    if (candidate.tierStep.mode !== 'target') continue;
    const tierId = candidate.tierStep.tierId;
    if (typeof tierId !== 'string' || tierId === '') continue;
    const found = inPlay.findIndex((outcome) => outcome.id === tierId);
    if (found === -1) continue;
    if (index === -1 || found < index) {
      index = found;
      trigger = candidate;
    }
  }
  return { index, trigger };
}

/** `Σ up − Σ down`: summing is commutative, so `up 1` plus `down 1` is a deliberate no-op. */
function netTierSteps(stepping) {
  return stepping.reduce((net, trigger) => {
    const { mode, steps } = trigger.tierStep;
    if (mode === 'up') return net + tierStepMagnitude(steps);
    if (mode === 'down') return net - tierStepMagnitude(steps);
    return net;
  }, 0);
}

/** The winning target plus every matched relative trigger; a losing target is not credited. */
function appliedTierStepTriggerIds(stepping, winningTarget) {
  return stepping
    .filter((trigger) => trigger.tierStep.mode !== 'target' || trigger === winningTarget)
    .map((trigger) => trigger.id)
    .filter((id) => typeof id === 'string' && id !== '');
}

/**
 * Apply every matching trigger's `tierStep` to the rolled tier (issue 975); "up" is better.
 * Stepping preserves disposition: under a forced outcome the array in play is that disposition's
 * subset, so `data.success` always agrees with the final tier. A winning target sets the base,
 * the net relative offset applies, and the result clamps to the array (`stepClamped`, unrelated
 * to `clampToNearest`). A `null` rolled tier steps nothing; `tierStepApplied` marks a real change.
 */
function applyTierStepTriggers(
  routing,
  { rolled, forcedDisposition, triggers, total, diceGroups }
) {
  if (!rolled) return { matched: null, tierStepApplied: null };

  const stepping = matchedTierStepTriggers(triggers, rolledTierSnapshot(rolled, total, diceGroups));
  if (stepping.length === 0) return { matched: rolled, tierStepApplied: null };

  const ranked = rankedRoutedOutcomes(routing);
  const inPlay = forcedDisposition === null ? ranked : dispositionSubset(ranked, forcedDisposition);
  const fromIndex = inPlay.findIndex((outcome) => outcome.id === rolled.id);
  if (fromIndex === -1) return { matched: rolled, tierStepApplied: null };

  const target = resolveTierStepTarget(stepping, inPlay);
  const base = target.index === -1 ? fromIndex : target.index;
  const requestedIndex = base + netTierSteps(stepping);
  const toIndex = Math.min(Math.max(requestedIndex, 0), inPlay.length - 1);
  // A clamped no-op or a cancelling pair leaves the rolled tier with no evidence.
  if (toIndex === fromIndex) return { matched: rolled, tierStepApplied: null };

  const stepped = inPlay[toIndex];
  // A winning target is `target` whatever the delta: a placement has no direction.
  let mode = 'target';
  if (target.index === -1) mode = toIndex > fromIndex ? 'up' : 'down';
  return {
    matched: stepped,
    tierStepApplied: {
      mode,
      // The realized magnitude, which the chat card renders; `stepClamped` says more was asked.
      steps: Math.abs(toIndex - fromIndex),
      fromOutcomeId: rolled.id ?? null,
      toOutcomeId: stepped.id ?? null,
      stepClamped: requestedIndex !== toIndex,
      triggerIds: appliedTierStepTriggerIds(stepping, target.trigger),
    },
  };
}

/**
 * Whether the fixed-type recipe minimum tier blocks the final tier. It compares `start` values in
 * the check's direction, never rank indices, because overlapping ranges are a readiness issue
 * rather than refused, and two tiers sharing a `start` must compare equal.
 */
function minSuccessTierFailed(routing, { minOutcomeId, matched }) {
  if (routing.type !== 'fixed' || !minOutcomeId) return false;
  const required = rankedRoutedOutcomes(routing).find((outcome) => outcome.id === minOutcomeId);
  const requiredStart = Number(required?.start);
  // A stale/unknown `minOutcomeId` no-ops gracefully, like `checkTierId`.
  if (!Number.isFinite(requiredStart)) return false;
  const matchedStart = Number(matched?.start);
  return (
    !Number.isFinite(matchedStart) ||
    !compareToTarget(matchedStart, requiredStart, 'meet', routing.direction)
  );
}

/**
 * Classify one total against a routed check's tiers: the whole post-roll resolution, which
 * `runFormulaRouted` calls so the Checks Studio's odds histogram cannot drift from it (issue
 * 1097). Order is load-bearing: forced reroute (an extreme tier), then the relative tier step,
 * then the minimum gate on the final tier. A caller synthesising `diceGroups` must build them
 * through `rolledDiceGroups`, or per-die triggers go silently invisible. `matched` is the
 * effective tier (`null` when the gate blocked it, naming it in `blockedOutcomeId`). `dc` is the
 * resolved anchor; `evaluation` and the settled `targetDelta` supply direction and placement.
 */
export function classifyCheckTotal({
  type,
  total,
  dc,
  comparison,
  relativeOutcomes,
  fixedOutcomes,
  triggers,
  diceGroups = [],
  clampToNearest = false,
  minOutcomeId = null,
  evaluation = SUM_OVER_EVALUATION,
  targetDelta = 0,
}) {
  const routing = routingOf({ type, dc, evaluation, targetDelta, relativeOutcomes, fixedOutcomes });
  const forced = resolveForcedOutcome(triggers, { total, diceGroups })?.disposition ?? null;
  const effectiveComparison = comparison === 'exceed' ? 'exceed' : 'meet';
  const rollMatched = matchRoutedOutcome(routing, {
    total,
    comparison: effectiveComparison,
    clampToNearest,
  });

  const tierStep = applyTierStepTriggers(routing, {
    rolled: forced ? routeCritOutcome(routing, forced === 'success') : rollMatched,
    forcedDisposition: forced,
    triggers,
    total,
    diceGroups,
  });
  const matched = tierStep.matched;
  const minTierFailed = !forced && minSuccessTierFailed(routing, { minOutcomeId, matched });
  const effectiveMatched = minTierFailed ? null : matched;

  return {
    matched: effectiveMatched,
    comparison: effectiveComparison,
    target: rolledThreshold(routing, rollMatched),
    forcedDisposition: forced,
    success: routedSuccess({ minTierFailed, forced, matched: effectiveMatched }),
    // The final tier's `breakTools` is the only `data.breakTools` source.
    breakTools: effectiveMatched?.breakTools === true,
    tierStepApplied: tierStep.tierStepApplied,
    minTierFailed,
    blockedOutcomeId: minTierFailed ? (matched?.id ?? null) : null,
  };
}

function routingOf({ type, dc, evaluation, targetDelta, relativeOutcomes, fixedOutcomes }) {
  const grading = sumGrading(evaluation);
  return {
    type,
    anchor: dc,
    direction: grading.direction,
    multiply: type !== 'fixed' && grading.multiply,
    delta: effectiveTarget(0, grading, targetDelta),
    relativeOutcomes,
    fixedOutcomes,
  };
}

/** The rolled tier's threshold as the executed target; a fixed range and Otherwise have none. */
function rolledThreshold(routing, rollMatched) {
  if (routing.type === 'fixed' || !rollMatched) return null;
  const threshold = tierThreshold(routing, rollMatched);
  return Number.isFinite(threshold) ? threshold : null;
}

/** A gate failure fails, a forced disposition is authoritative, else the final tier decides. */
function routedSuccess({ minTierFailed, forced, matched }) {
  if (minTierFailed) return false;
  if (forced) return forced === 'success';
  return matched?.success === true;
}
