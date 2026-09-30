/**
 * The summary line and rows a result box and a result chat card state for an executed
 * success-counting check (issue 2006), read from its display projection's `count` only: Success
 * on, Count, Needed and Pre-rolled, or for a pool reduced to zero, Pool and Result. `localize` is
 * key-only, as every card module's is.
 */
import { benefitSign } from '../../systems/checkModifierRouter.js';
import { countFormulaValues } from '../../systems/countEvaluation.js';
import { formatCheckAdjustment, formatSignedStep } from '../../utils/checkAdjustmentFormat.js';
import { fill } from '../../utils/fillPlaceholders.js';

import { bareExpression, preRollLabel } from './checkEvidenceRows.js';

const KEYS = Object.freeze({
  summary: 'FABRICATE.Check.CountEvidence.Summary',
  summaryGrown: 'FABRICATE.Check.CountEvidence.SummaryGrown',
  summaryZero: 'FABRICATE.Check.CountEvidence.SummaryZero',
  summaryZeroBare: 'FABRICATE.Check.CountEvidence.SummaryZeroBare',
  successOn: 'FABRICATE.Check.CountEvidence.SuccessOn',
  successOnCharacter: 'FABRICATE.Check.CountEvidence.SuccessOnCharacter',
  successOnFixed: 'FABRICATE.Check.CountEvidence.SuccessOnFixed',
  successOnMoved: 'FABRICATE.Check.CountEvidence.SuccessOnMoved',
  count: 'FABRICATE.Check.CountEvidence.Count',
  countNet: 'FABRICATE.Admin.Manager.Checks.Simulator.CountNet',
  needed: 'FABRICATE.Check.Evidence.Needed',
  neededMargin: 'FABRICATE.Check.CountEvidence.NeededMargin',
  neededBotch: 'FABRICATE.Check.CountEvidence.NeededBotch',
  preRolled: 'FABRICATE.Check.Evidence.PreRolled',
  preRollDice: 'FABRICATE.Check.CountEvidence.PreRollDice',
  preRollThreshold: 'FABRICATE.Check.CountEvidence.PreRollThreshold',
  pool: 'FABRICATE.Check.CountEvidence.Pool',
  poolReduced: 'FABRICATE.Check.CountEvidence.PoolReduced',
  poolReducedSeveral: 'FABRICATE.Check.CountEvidence.PoolReducedSeveral',
  result: 'FABRICATE.Check.CountEvidence.Result',
  zeroPoolResult: 'FABRICATE.Check.CountEvidence.ZeroPoolResult',
  modifiers: 'FABRICATE.Check.CountEvidence.SourceModifiers',
});

/** The word each settled source reads as in a zero-pool sentence. */
const SOURCE_KEYS = Object.freeze({
  tool: 'FABRICATE.Check.CountEvidence.SourceTool',
  library: 'FABRICATE.Check.CountEvidence.SourceLibrary',
  situational: 'FABRICATE.Check.CountEvidence.SourceSituational',
  advantage: 'FABRICATE.Check.CountEvidence.SourceAdvantage',
});

/** Whether a projection's surfaces state count evidence: a count check with executed dice. */
export function statesCountEvidence(display) {
  return display?.evaluation?.product === 'count' && Boolean(display.count);
}

/** Whether the executed count botched: a net below zero. */
export function countBotched(display) {
  return statesCountEvidence(display) && display.count.net < 0;
}

const sum = (terms) => terms.reduce((total, term) => total + term.value, 0);

/** `2`, or `−1` with the true minus sign. */
const netText = (net) => (net < 0 ? formatCheckAdjustment('add', net) : String(net));

/** `− 6` or `+ 2`: a change set apart from the dice it changes. */
const spacedChange = (value) => formatSignedStep(value).replace(/^([+−])/, '$1 ');

function formulaValues(display, dice, threshold) {
  const { direction } = display.evaluation;
  return countFormulaValues({
    dice,
    die: display.count.die,
    direction,
    comparison: display.comparison,
    threshold,
  });
}

/** The one source's word, or `modifiers` for several: the terms hold one entry per source. */
function sourceWord(terms, loc) {
  return loc(terms.length === 1 ? SOURCE_KEYS[terms[0].source] : KEYS.modifiers);
}

/**
 * The line a result states in place of a roll total: `6d10, each ≥ 8 (pool grown +1 by
 * modifiers)`, or for a pool reduced to zero `6d10 − 6 situational = 0 dice`. '' without count
 * evidence.
 */
export function countSummaryText(display, localize = (key) => key) {
  if (!statesCountEvidence(display)) return '';
  const loc = (key) => localize(key) ?? key;
  const { count } = display;
  const grown = sum(count.pool.terms);
  if (count.zeroPool) {
    const base = { base: count.pool.base, die: count.die };
    if (count.pool.terms.length === 0) return fill(loc(KEYS.summaryZeroBare), base);
    const source = sourceWord(count.pool.terms, loc);
    return fill(loc(KEYS.summaryZero), { ...base, change: spacedChange(grown), source });
  }
  const values = formulaValues(display, count.pool.rolled, count.threshold.effective);
  const line = { ...values, symbol: values.comparison };
  if (grown === 0) return fill(loc(KEYS.summary), line);
  return fill(loc(KEYS.summaryGrown), { ...line, grown: formatSignedStep(grown) });
}

/**
 * `≤ 14 · character value 13, moved +1 by modifiers`, only when it read or moved; the move is
 * signed by its benefit, as the prompt's rule line signs it.
 */
function successOnRow(display, loc) {
  const { threshold } = display.count;
  const sign = benefitSign('threshold', display.evaluation.direction);
  const moved = sign * (threshold.effective - threshold.anchor);
  if (threshold.source !== 'character' && moved === 0) return null;
  const effective = formulaValues(display, 0, threshold.effective);
  const anchor = formulaValues(display, 0, threshold.anchor).threshold;
  const rule = fill(
    loc(threshold.source === 'character' ? KEYS.successOnCharacter : KEYS.successOnFixed),
    { symbol: effective.comparison, threshold: effective.threshold, value: anchor }
  );
  const text =
    moved === 0 ? rule : fill(loc(KEYS.successOnMoved), { rule, moved: formatSignedStep(moved) });
  return { id: 'successOn', label: loc(KEYS.successOn), text };
}

function countRow(count, loc) {
  const text = fill(loc(KEYS.countNet), {
    qualified: count.qualified,
    cancelled: count.cancelled,
    net: netText(count.net),
  });
  return { id: 'count', label: loc(KEYS.count), text, ...(count.net < 0 && { tone: 'danger' }) };
}

function neededRow(count, loc) {
  if (count.required === null) return null;
  const text =
    count.net < 0
      ? fill(loc(KEYS.neededBotch), { required: count.required })
      : fill(loc(KEYS.neededMargin), {
          required: count.required,
          margin: formatSignedStep(count.margin ?? count.net - count.required),
        });
  return { id: 'needed', label: loc(KEYS.needed), text };
}

/** Each pre-roll that grew the pool or moved the threshold, in the order it settled. */
function preRolledRow(display, loc) {
  const text = (display.evidence?.preRolls ?? [])
    .filter((entry) => entry.destination === 'pool' || entry.destination === 'threshold')
    .map((entry) => {
      const facts = {
        label: preRollLabel(entry, loc),
        formula: bareExpression(entry.expression),
        total: entry.total,
      };
      if (entry.destination === 'pool') return fill(loc(KEYS.preRollDice), facts);
      const moved = formatSignedStep(entry.total);
      return fill(loc(KEYS.preRollThreshold), { ...facts, moved });
    })
    .join('; ');
  return text ? { id: 'preRolled', label: loc(KEYS.preRolled), text } : null;
}

function zeroPoolRows(count, loc) {
  const { terms } = count.pool;
  const change = formatSignedStep(sum(terms));
  let reduced = null;
  if (terms.length === 1) {
    reduced = fill(loc(KEYS.poolReduced), { source: sourceWord(terms, loc), change });
  } else if (terms.length > 1) {
    reduced = fill(loc(KEYS.poolReducedSeveral), { change });
  }
  return [
    reduced && { id: 'pool', label: loc(KEYS.pool), text: reduced },
    { id: 'result', label: loc(KEYS.result), text: loc(KEYS.zeroPoolResult) },
  ];
}

/**
 * `[{ id, label, text, tone? }]` for an executed count check, empty without count evidence; the
 * Count row reads `danger` below zero. A progressive or fixed-range check states no Needed row.
 */
export function countEvidenceRows(display, localize = (key) => key) {
  if (!statesCountEvidence(display)) return [];
  const loc = (key) => localize(key) ?? key;
  const { count } = display;
  const preRolled = preRolledRow(display, loc);
  const rows = count.zeroPool
    ? [preRolled, ...zeroPoolRows(count, loc)]
    : [successOnRow(display, loc), countRow(count, loc), neededRow(count, loc), preRolled];
  return rows.filter(Boolean);
}
