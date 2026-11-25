/**
 * The iterative expression grammar (`resolution-modes` § Iterative Expression Grammar and Field
 * Profiles). It is the shared deterministic grammar plus `abs`, `min`, `max`, `NdF` dice with an
 * optional `x` and `kh` or `kl`, and the reserved roots. Both entry points are pure: dice come from
 * an injected `rollDie(faces)`, and nothing here reads a Foundry global.
 */
import { createExpressionReader, DEFAULT_FUNCTIONS, readFoundryPath } from '../expressionReader.js';

import { COMPARISONS } from './counterRule.js';

/** Dice results one term may hold, base dice and explosions together. */
const MAX_TERM_RESULTS = 1000;

const ALL_ROOTS = Object.freeze(['counter', 'min', 'max', 'target', 'sessionCount', 'check']);

const profile = (dice, roots) => Object.freeze({ dice, roots: Object.freeze(roots) });

/** Per field: whether dice may be rolled, and the reserved roots it may read. */
export const ITERATIVE_EXPRESSION_PROFILES = Object.freeze({
  cost: profile(false, ['counter', 'min', 'max', 'target', 'sessionCount']),
  start: profile(true, ['min', 'max', 'target']),
  effect: profile(true, ALL_ROOTS),
  actionAdjustment: profile(false, ALL_ROOTS),
});

/** `@counter.<id>`, `@min.<id>`, `@max.<id>`, `@target.<id>`, `@sessionCount` and `@check.value`. */
export const RESERVED_ROOT_TOKEN =
  /@(?:(?:counter|min|max|target)\.[a-z][A-Za-z0-9]*|sessionCount|check\.value)(?![\w.])/;

/** Roots that read workpiece state or configuration, so a braced form or extra segment is unresolved. */
const STATE_ROOTS = new Set(['counter', 'min', 'max', 'target', 'sessionCount']);
/** Roots held back: only `@check.value` reads, and the rest wait for their extensions. */
const HELD_ROOTS = new Set(['check', 'recipe', 'circumstance', 'status']);

/** `NdF`, then an optional `x` with an optional comparison, then an optional `kh` or `kl`. */
const DICE_TOKEN = /(\d+)?d(\d+)(?:(x)(?:(>=|<=|>|<)?(\d+))?)?(?:(kh|kl)(\d*))?(?![\w.])/;

const ITERATIVE_FUNCTIONS = Object.freeze({
  ...DEFAULT_FUNCTIONS,
  abs: Object.freeze({ minArgs: 1, maxArgs: 1, apply: (value) => Math.abs(value) }),
  min: Object.freeze({ minArgs: 1, maxArgs: Infinity, apply: (...values) => Math.min(...values) }),
  max: Object.freeze({ minArgs: 1, maxArgs: Infinity, apply: (...values) => Math.max(...values) }),
});

const REASONS = Object.freeze([
  'invalid',
  'dice',
  'forbidden-root',
  'unresolved-path',
  'non-finite',
  'explode-limit',
  'roll-unavailable',
]);

export const sum = (values) => values.reduce((total, value) => total + value, 0);

/** One face from the injected die, or `'roll-unavailable'` for a throw or a value off the die. */
function drawFace(rollDie, faces) {
  let face;
  try {
    face = rollDie(faces);
  } catch {
    throw 'roll-unavailable';
  }
  if (!Number.isInteger(face) || face < 1 || face > faces) throw 'roll-unavailable';
  return face;
}

/** The `keep.count` highest (`kh`) or lowest (`kl`) results; a count past the results keeps them all. */
function keptResults(results, { mode, count }) {
  const ordered = [...results].sort((left, right) => left - right);
  return mode === 'kl'
    ? ordered.slice(0, count)
    : ordered.slice(Math.max(0, ordered.length - count));
}

/** Rolls one parsed dice term: base dice first, then each explosion in the order appended. */
function rollTerm({ count, faces, explode, keep }, rollDie) {
  const results = [];
  for (let drawn = 0; drawn < count; drawn += 1) results.push(drawFace(rollDie, faces));
  if (explode) {
    const explodes = COMPARISONS[explode.op];
    for (let checked = 0; checked < results.length; checked += 1) {
      if (!explodes(results[checked], explode.threshold)) continue;
      if (results.length >= MAX_TERM_RESULTS) throw 'explode-limit';
      results.push(drawFace(rollDie, faces));
    }
  }
  return { faces, results, value: sum(keep ? keptResults(results, keep) : results) };
}

/** Whether every face of the die meets the explosion, so the term could never stop. */
function explodeNeverStops({ faces, explode }) {
  if (!explode) return false;
  const explodes = COMPARISONS[explode.op];
  return faces < 2 || (explodes(1, explode.threshold) && explodes(faces, explode.threshold));
}

/** The term a dice match describes, or the reason it cannot be rolled. */
function termOf(match, allowed) {
  if (!allowed) throw 'dice';
  const [, countText, facesText, explodes, comparison, thresholdText, keepMode, keepText] = match;
  const count = countText === undefined ? 1 : Number(countText);
  const faces = Number(facesText);
  const keepCount = keepText === '' ? 1 : Number(keepText);
  if (count < 1 || faces < 1 || (keepMode && keepCount < 1)) throw 'invalid';
  if (count > MAX_TERM_RESULTS) throw 'explode-limit';
  return {
    count,
    faces,
    explode: explodes
      ? {
          op: comparison ?? '=',
          threshold: thresholdText === undefined ? faces : Number(thresholdText),
        }
      : null,
    keep: keepMode ? { mode: keepMode, count: keepCount } : null,
  };
}

/** The first run of word characters after `@` and an optional brace. */
const rootWord = (token) => /^@\{?(\w+)/.exec(token)?.[1];

/**
 * Parses `text` once. `host` supplies the value of each read: `reserved(kind, id)`,
 * `path(token)` and `term(term)`; the profile gates every dice term and reserved root first.
 */
function parseWith(text, fieldProfile, host) {
  const reserved = ({ 0: token }) => {
    const [kind, id] = token.slice(1).split('.');
    if (!fieldProfile.roots.includes(kind)) throw 'forbidden-root';
    return host.reserved(kind, id);
  };
  const readPath = (token) => {
    const word = rootWord(token);
    if (HELD_ROOTS.has(word)) throw 'forbidden-root';
    if (STATE_ROOTS.has(word)) throw 'unresolved-path';
    return host.path(token);
  };
  const reader = createExpressionReader(text.trim(), {
    readPath,
    functions: ITERATIVE_FUNCTIONS,
    tokens: [
      { pattern: RESERVED_ROOT_TOKEN, read: reserved },
      { pattern: DICE_TOKEN, read: (match) => host.term(termOf(match, fieldProfile.dice)) },
    ],
  });
  const value = reader.parseExpression();
  if (!reader.atEnd()) throw 'invalid';
  return value;
}

const reasonOf = (error) => (REASONS.includes(error) ? error : 'invalid');

/**
 * Evaluates one expression under a field profile. `roots` is `{ counters, min, max, target }` as
 * `Map`s by counter id, with `sessionCount` and `checkValue` (null with no check). `rollDie(faces)`
 * must return an integer in `[1, faces]`.
 * @returns {{ ok: true, value: number, dice: { faces: number, results: number[], value: number }[] }
 *   | { ok: false, reason: string }}
 */
export function evaluateIterativeExpression(
  text,
  { profile: profileName, roots, rollData = {}, rollDie }
) {
  const fieldProfile = ITERATIVE_EXPRESSION_PROFILES[profileName];
  if (typeof text === 'number') {
    return Number.isFinite(text)
      ? { ok: true, value: text, dice: [] }
      : { ok: false, reason: 'non-finite' };
  }
  if (!fieldProfile || typeof text !== 'string') return { ok: false, reason: 'invalid' };
  const dice = [];
  const host = {
    reserved: (kind, id) => {
      const value = readReserved(roots, kind, id);
      if (!Number.isFinite(value)) throw 'unresolved-path';
      return value;
    },
    path: (token) => readFoundryPath(token, rollData),
    term: (term) => {
      const rolled = rollTerm(term, rollDie);
      dice.push(rolled);
      return rolled.value;
    },
  };
  try {
    const value = parseWith(text, fieldProfile, host);
    return Number.isFinite(value) ? { ok: true, value, dice } : { ok: false, reason: 'non-finite' };
  } catch (error) {
    return { ok: false, reason: reasonOf(error) };
  }
}

function readReserved(roots, kind, id) {
  if (kind === 'sessionCount') return roots?.sessionCount;
  if (kind === 'check') return roots?.checkValue ?? undefined;
  const table = {
    counter: roots?.counters,
    min: roots?.min,
    max: roots?.max,
    target: roots?.target,
  };
  return table[kind]?.get(id);
}

/**
 * Parses `text` with no roll data and no dice, reporting the first syntax, profile or limit fault,
 * the reserved roots and ids it reads, and whether an explosion could never stop.
 * @returns {{ ok: boolean, reason?: string, roots: object, explodeUnbounded: boolean }}
 */
export function analyzeIterativeExpression(text, profileName) {
  const read = { counter: [], min: [], max: [], target: [], sessionCount: false, check: false };
  let explodeUnbounded = false;
  const outcome = (reason = null) => ({
    ok: reason === null,
    ...(reason !== null && { reason }),
    roots: read,
    explodeUnbounded,
  });
  const fieldProfile = ITERATIVE_EXPRESSION_PROFILES[profileName];
  if (typeof text === 'number') return outcome(Number.isFinite(text) ? null : 'non-finite');
  if (!fieldProfile || typeof text !== 'string') return outcome('invalid');
  const host = {
    reserved: (kind, id) => {
      if (Array.isArray(read[kind])) {
        if (!read[kind].includes(id)) read[kind].push(id);
      } else read[kind] = true;
      return 0;
    },
    path: () => 0,
    term: (term) => {
      explodeUnbounded ||= explodeNeverStops(term);
      return 0;
    },
  };
  try {
    parseWith(text, fieldProfile, host);
    return outcome(null);
  } catch (error) {
    return outcome(reasonOf(error));
  }
}
