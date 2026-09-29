/**
 * The Formula card's count inset (issue 2006): the authored roll with each modifier chip on the
 * term it moves, the face clauses, the Preview-as actor's composed pool and threshold, and the
 * expected-successes reading. Pure; faces and signs come from `describeCountPolicy`, and
 * `text(key, fallback)` localizes. Nothing constructs or evaluates a Roll.
 */
import {
  describeAuthoredCountPolicy,
  describeCountPolicy,
  resolvePool,
} from '../../../../../systems/countEvaluation.js';

import { checkIssueSentence, formatSigned, interpolate, MINUS } from './checksCopy.js';
import {
  missingTargetPaths,
  readsCharacter,
  targetExpressionFault,
  targetRefusalSentence,
} from './checkTargetStatus.js';

const SETTLED_NONE = Object.freeze({ poolDelta: 0, thresholdDelta: 0, preRolls: [] });

/** Whether a stored pool input reads as the Number mode: an integer literal. */
export function isIntegerLiteral(value) {
  return /^\s*-?\d+\s*$/.test(String(value ?? ''));
}

/** `{faces}`: the face, or `{v} or above` / `{v} or under` for a from-face. */
function facesText({ from, face, sign }, text) {
  if (!from) return String(face);
  const side =
    sign === '≤'
      ? text('FABRICATE.Admin.Manager.Checks.Count.OrUnder', 'or under')
      : text('FABRICATE.Admin.Manager.Checks.Count.OrAbove', 'or above');
  return `${face} ${side}`;
}

/** The clauses after the roll: `explodes on {faces}` (`… once`) and `{faces} cancels a success`. */
export function countFaceClauses(described, text) {
  const clauses = [];
  const { explode, cancel } = described;
  if (explode) {
    const copy = explode.once
      ? text('FABRICATE.Admin.Manager.Checks.Count.InsetExplodesOnce', 'explodes on {faces} once')
      : text('FABRICATE.Admin.Manager.Checks.Count.InsetExplodes', 'explodes on {faces}');
    clauses.push(interpolate(copy, { faces: facesText(explode, text) }));
  }
  if (cancel) {
    const copy = text(
      'FABRICATE.Admin.Manager.Checks.Count.InsetCancels',
      '{faces} cancels a success'
    );
    clauses.push(interpolate(copy, { faces: facesText(cancel, text) }));
  }
  return clauses;
}

// A chip run: the first join carries the accent, the rest are the list's own separators.
function chipRun(modifiers, sign) {
  return modifiers.flatMap((modifier, index) => [
    { kind: index === 0 ? 'join' : 'sep', text: sign },
    { kind: 'chip', modifier },
  ]);
}

/**
 * The authored roll as inset terms, `{ kind: 'term' | 'word' | 'join' | 'sep' | 'chip' }`, then
 * its face clauses. Chips attach to the term they move: inside the pool's brackets, or after the
 * threshold (`−` over, where a benefit lowers it, `+` under).
 */
export function countAuthoredTerms({ evaluation, thresholdMode, modifiers = [] }, text) {
  const described = describeAuthoredCountPolicy({ evaluation, thresholdMode });
  const base = String(described.pool ?? '').trim();
  const toPool = evaluation.pool.modifierDestination !== 'threshold' && modifiers.length > 0;
  const toThreshold = evaluation.pool.modifierDestination === 'threshold' && modifiers.length > 0;
  const poolTerms = toPool
    ? [
        { kind: 'word', text: '(' },
        { kind: 'term', text: base },
        ...chipRun(modifiers, '+'),
        { kind: 'term', text: `)d${described.die}` },
      ]
    : [{ kind: 'term', text: `${isIntegerLiteral(base) ? base : `(${base})`}d${described.die}` }];
  const thresholdChips = toThreshold
    ? chipRun(modifiers, evaluation.direction === 'under' ? '+' : MINUS)
    : [];
  const terms = [
    ...poolTerms,
    { kind: 'word', text: text('FABRICATE.Admin.Manager.Checks.Count.InsetEach', 'each') },
    { kind: 'term', text: `${described.symbol} ${String(described.threshold ?? '').trim()}` },
    ...thresholdChips,
  ];
  return { terms, clauses: countFaceClauses(described, text) };
}

// The Preview-as actor's reason the pool does not compose: issue 2004's transient sentences for a value
// the actor lacks or that is not a number, else the runtime's own refusal sentence.
function refusalLine(read, evaluation, character, text) {
  const expression = evaluation.pool[read.refusedInput];
  const readsActor =
    ['base', 'threshold'].includes(read.refusedInput) &&
    readsCharacter(expression) &&
    !targetExpressionFault(expression);
  if (!readsActor) return targetRefusalSentence(read, text);
  const actor = character.name ?? '';
  if (read.reason !== 'unresolved-path') {
    return checkIssueSentence('countValueNotNumericForPreview', { actor }, text);
  }
  const rollData = character.rollData ?? {};
  const paths = new Set([
    ...missingTargetPaths(evaluation.pool.base, rollData),
    ...missingTargetPaths(evaluation.pool.threshold, rollData),
  ]);
  return checkIssueSentence(
    'countPathUnresolvedForPreview',
    { actor, path: [...paths].join(', ') },
    text
  );
}

/** The settled scalar part of a placement: a pending rolled benefit shows as an unsettled term. */
export function settledPlacement(placement) {
  if (!placement) return SETTLED_NONE;
  return { poolDelta: placement.poolDelta, thresholdDelta: placement.thresholdDelta, preRolls: [] };
}

function pendingFormula(placement, destination) {
  return (placement?.preRolls ?? [])
    .filter((entry) => !Object.hasOwn(entry, 'total') && entry.destination === destination)
    .map((entry) => entry.expression)
    .join(' + ');
}

/**
 * The inset's actor line, `{ tone, text }`: the pool floored after every settled benefit, and
 * which input the benefits moved. With no actor it asks for one; a refusal is never read as 0.
 */
export function countActorLine({ evaluation, thresholdMode, character, placement }, text) {
  if (!character) {
    return {
      tone: 'muted',
      text: text(
        'FABRICATE.Admin.Manager.Checks.Count.NoActor',
        'Choose a character in Preview as to see the composed pool and threshold.'
      ),
    };
  }
  const settled = settledPlacement(placement);
  const rollData = character.rollData ?? {};
  const read = resolvePool({ evaluation, thresholdMode, rollData, placement: settled });
  if (!read.ok) {
    return { tone: 'unresolved', text: refusalLine(read, evaluation, character, text) };
  }
  const described = describeCountPolicy(read.policy);
  let dice = `${described.pool}d${described.die}`;
  let threshold = formatSigned(described.threshold);
  const poolPending = pendingFormula(placement, 'pool');
  const thresholdPending = pendingFormula(placement, 'threshold');
  if (poolPending) {
    dice = interpolate(
      text('FABRICATE.Admin.Manager.Checks.Count.ActorPendingDice', '{dice} + {formula} dice'),
      {
        dice,
        formula: poolPending,
      }
    );
  }
  if (thresholdPending) {
    threshold = interpolate(
      text('FABRICATE.Admin.Manager.Checks.Count.ActorPendingThreshold', '{threshold} + {formula}'),
      {
        threshold,
        formula: thresholdPending,
      }
    );
  }
  const data = { actor: character.name ?? '', dice, symbol: described.symbol, threshold };
  return { tone: 'resolved', text: interpolate(actorCopy(read.policy, settled, data, text), data) };
}

// Which sentence the line takes: the pool grown, the threshold moved (by the benefit, which lowers
// an over threshold), or neither.
function actorCopy(policy, settled, data, text) {
  const benefit = policy.direction === 'under' ? settled.thresholdDelta : -settled.thresholdDelta;
  if (settled.poolDelta !== 0) {
    Object.assign(data, {
      base: formatSigned(policy.resolved.base),
      n: formatSigned(settled.poolDelta),
    });
    return text(
      'FABRICATE.Admin.Manager.Checks.Count.ActorLineGrown',
      'For {actor}: {dice}, each {symbol} {threshold} (pool {base} grown by {n}).'
    );
  }
  if (benefit !== 0) {
    Object.assign(data, {
      base: formatSigned(policy.resolved.threshold),
      n: formatSigned(benefit),
    });
    return text(
      'FABRICATE.Admin.Manager.Checks.Count.ActorLineMoved',
      'For {actor}: {dice}, each {symbol} {threshold} (threshold {base} moved by {n}).'
    );
  }
  return text(
    'FABRICATE.Admin.Manager.Checks.Count.ActorLine',
    'For {actor}: {dice}, each {symbol} {threshold}.'
  );
}

/**
 * The reading beside the inset's kicker: the odds panel's own expected net, or null whenever the
 * count odds abstain. `{ value, nearlyExact }`.
 */
export function countExpectedReading(odds) {
  if (odds?.product !== 'count' || odds.enumerable !== true) return null;
  return { value: String(odds.expected).replace('-', MINUS), nearlyExact: odds.status !== 'exact' };
}
