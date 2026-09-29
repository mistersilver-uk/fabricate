/**
 * The one display projection of a check (issues 2005 and 2006): immutable plain data rebuilt from
 * an allowlist, which the prompt, the descriptor, the result box and the chat cards read. It
 * carries no evaluation record, path or policy; executed evidence alone names the recorded typed
 * formula, character and tier labels. Actor reads and target resolution stay with their adapters.
 */
import { numberOrNull } from '../../utils/scalars.js';

import { tileModel } from './countDiceTiles.js';

const TERM_KINDS = Object.freeze(['anchor', 'adjustment', 'multiplier', 'benefit']);
const TERM_SOURCES = Object.freeze(['tool', 'library', 'situational', 'advantage']);
const ROLL_MODES = Object.freeze(['publicroll', 'gmroll', 'blindroll', 'selfroll']);

const oneOf = (allowed, value) => (allowed.includes(value) ? value : null);

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** One `{ kind, value, source?, label? }` target term, or null when it is not one. */
function targetTerm(term) {
  const kind = oneOf(TERM_KINDS, term?.kind);
  const value = numberOrNull(term?.value);
  if (!kind || value === null) return null;
  const source = kind === 'benefit' ? oneOf(TERM_SOURCES, term.source) : null;
  if (source) return { kind, value, source };
  const label = kind === 'adjustment' || kind === 'multiplier' ? text(term.label) : '';
  return label ? { kind, value, label } : { kind, value };
}

/** Target terms rebuilt from the allowlist, dropping anything that is not a term. */
export function sanitizeTargetTerms(terms) {
  return (Array.isArray(terms) ? terms : []).map(targetTerm).filter(Boolean);
}

/**
 * Folds target terms, then the pre-rolls that land on the target, into the executed target: the
 * anchor, each adjustment added and each multiplier applied (both rounded down, as the resolver
 * and the tier thresholds do), then each benefit. Null without a leading anchor.
 */
export function foldTargetTerms(terms, preRolls = []) {
  const [anchor, ...rest] = sanitizeTargetTerms(terms);
  if (anchor?.kind !== 'anchor') return null;
  let target = anchor.value;
  for (const { kind, value } of rest) {
    if (kind === 'anchor') return null;
    if (kind === 'adjustment') target = Math.floor(target + value);
    if (kind === 'multiplier') target = Math.floor(target * value);
    if (kind === 'benefit') target += value;
  }
  for (const entry of Array.isArray(preRolls) ? preRolls : []) {
    if (entry?.destination === 'target') target += numberOrNull(entry.total) ?? 0;
  }
  return target;
}

function preRollRow(entry) {
  const total = numberOrNull(entry?.total);
  if (total === null) return null;
  return {
    source: oneOf(TERM_SOURCES, entry.source),
    label: typeof entry.label === 'string' ? entry.label : '',
    expression: typeof entry.expression === 'string' ? entry.expression : '',
    total,
    destination: typeof entry.destination === 'string' ? entry.destination : null,
  };
}

/** The rolled dice as `{ group, results }`, for a card's dice line. */
function diceRows(groups) {
  return (Array.isArray(groups) ? groups : [])
    .filter((entry) => typeof entry?.group === 'string')
    .map((entry) => ({
      group: entry.group,
      results: (Array.isArray(entry.results) ? entry.results : [])
        .map(numberOrNull)
        .filter((face) => face !== null),
    }));
}

/** A character value's recorded typed formula and character name, each only when recorded. */
function attributeFacts(data) {
  const expression = text(data.targetExpression);
  const actor = text(data.targetActor);
  return {
    ...(expression && { targetExpression: expression }),
    ...(actor && { targetActor: actor }),
  };
}

/**
 * The executed evidence a result box or card may state, read from the check result's `data` only
 * and never from later actor or config state. Null for a refusal or a check that never rolled; a
 * legacy record without `preRolls`, `targetTerms`, its formula or its dice omits them.
 */
export function executedCheckEvidence(data) {
  if (!data || typeof data !== 'object' || data.targetRefusal) return null;
  const total = numberOrNull(data.total);
  // A count pool reduced to zero rolled nothing, yet its pre-rolls and failure are evidence.
  if (total === null && !(data.product === 'count' && data.zeroPool === true)) return null;
  const evidence = {
    total,
    target: numberOrNull(data.target),
    comparison: oneOf(['meet', 'exceed'], data.comparison),
    margin: numberOrNull(data.margin),
  };
  if (text(data.resolvedFormula)) {
    evidence.formula = text(data.resolvedFormula);
    // The typed formula: a Journal check's `rollFormula`, a direct runner's `formula`.
    const typed = text(data.rollFormula) || text(data.formula);
    if (typed) evidence.rollFormula = typed;
  }
  if (Array.isArray(data.diceGroups)) evidence.dice = diceRows(data.diceGroups);
  if (Array.isArray(data.preRolls)) {
    evidence.preRolls = data.preRolls.map(preRollRow).filter(Boolean);
  }
  if (Array.isArray(data.targetTerms)) {
    evidence.targetTerms = sanitizeTargetTerms(data.targetTerms);
    const targetSource = oneOf(['fixed', 'attribute'], data.targetSource);
    if (targetSource) evidence.targetSource = targetSource;
    if (targetSource === 'attribute') Object.assign(evidence, attributeFacts(data));
  }
  return evidence;
}

/** One executed die of a count projection, as `tileModel` reads it: numbers and flags only. */
function countResult(entry) {
  return {
    index: numberOrNull(entry?.index),
    face: numberOrNull(entry?.face),
    active: entry?.active !== false,
    explodedFrom: Number.isInteger(entry?.explodedFrom) ? entry.explodedFrom : null,
    qualified: entry?.qualified === true,
    cancelled: entry?.cancelled === true,
    exploded: entry?.exploded === true,
  };
}

/** A pool's or threshold's settled `{ source, value }` terms, rebuilt from the allowlist. */
function countTerms(terms) {
  return (Array.isArray(terms) ? terms : [])
    .map((term) => ({
      source: oneOf(TERM_SOURCES, term?.source),
      value: numberOrNull(term?.value),
    }))
    .filter((term) => term.source && term.value !== null);
}

/**
 * The executed dice of a count check (issue 2006), folded from the engine's unpersisted
 * `countDisplay`: tiles, totals, the required count and margin, and the pool and threshold with
 * their settled terms. Literal numbers and enumerated words only, never an expression, path,
 * label or policy; null without one.
 */
function countProjection(display) {
  if (!display || typeof display !== 'object') return null;
  const results = Array.isArray(display.results) ? display.results.map(countResult) : [];
  const pool = display.pool ?? {};
  const threshold = display.threshold ?? {};
  return {
    die: numberOrNull(display.die),
    tiles: tileModel({ results: results.filter((entry) => entry.face !== null) }),
    qualified: numberOrNull(display.qualified),
    cancelled: numberOrNull(display.cancelled),
    net: numberOrNull(display.net),
    required: numberOrNull(display.required),
    margin: numberOrNull(display.margin),
    zeroPool: display.zeroPool === true,
    pool: {
      base: numberOrNull(pool.base),
      terms: countTerms(pool.terms),
      rolled: numberOrNull(pool.rolled),
    },
    threshold: {
      anchor: numberOrNull(threshold.anchor),
      source: oneOf(['fixed', 'character'], threshold.source),
      terms: countTerms(threshold.terms),
      effective: numberOrNull(threshold.effective),
    },
  };
}

/** The executed visibility a card gates on, or null when it is unknown. */
function executedVisibility(visibility) {
  if (!visibility || typeof visibility !== 'object') return null;
  return { rollMode: oneOf(ROLL_MODES, visibility.rollMode), secret: visibility.secret === true };
}

/**
 * The projection itself. `evaluation` contributes only its product and direction; `terms` are the
 * permitted source terms, and `destination` is where a modifier lands for that evaluation. A count
 * projection also carries `count`, its executed dice, from the engine's `countDisplay`.
 */
export function buildCheckDisplay({
  evaluation = null,
  target = null,
  comparison = null,
  terms = [],
  evidence = null,
  visibility = null,
  countDisplay = null,
} = {}) {
  const product = oneOf(['sum', 'count'], evaluation?.product) ?? 'sum';
  const direction = oneOf(['over', 'under'], evaluation?.direction) ?? 'over';
  let destination = null;
  if (product === 'sum') destination = direction === 'under' ? 'target' : 'append';
  return deepFreeze({
    evaluation: { product, direction },
    target: numberOrNull(target),
    comparison: oneOf(['meet', 'exceed'], comparison),
    terms: sanitizeTargetTerms(terms),
    destination,
    evidence: evidence ? structuredClone(evidence) : null,
    visibility: executedVisibility(visibility),
    ...(product === 'count' && { count: countProjection(countDisplay) }),
  });
}

/**
 * Whether a chat card may state a projection's evidence: only a public, non-secret check. Every
 * client receives a card's content whatever its whisper, so an unknown visibility is never public.
 */
export function isPublicCheckDisplay(display) {
  return display?.visibility?.rollMode === 'publicroll' && display.visibility.secret !== true;
}

/** The projection of an executed check result for a result box or chat card. */
export function executedCheckDisplay(checkResult) {
  const data = checkResult?.data;
  const evidence = executedCheckEvidence(data);
  return buildCheckDisplay({
    evaluation: { product: data?.product, direction: data?.direction },
    target: evidence?.target ?? null,
    comparison: evidence?.comparison ?? null,
    evidence,
    visibility: checkResult?.visibility,
    countDisplay: checkResult?.countDisplay,
  });
}
