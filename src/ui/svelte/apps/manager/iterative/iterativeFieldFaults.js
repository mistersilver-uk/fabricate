/**
 * The marks the Crafting Action editor draws beside a field, one `{ code, reason?, field? }` each,
 * where `code` is the readiness code Validation reports for it and `field` names the field a mark
 * is drawn under when it belongs to no single row. Nothing here re-judges: C2's fault helpers and
 * C3's expression analysis do, so a mark and the readiness issue cannot disagree on what parses.
 * `faultSentence(fault, text)` is the one copy for every mark, and `expressionFaults` takes any C3
 * profile, `start` included, so recipe authoring reuses both unchanged.
 */
import { namesCheckFact } from '../../../../../systems/iterative/attemptLibrary.js';
import { counterRuleFault, entryFaults } from '../../../../../systems/iterative/counterRule.js';
import { analyzeIterativeExpression } from '../../../../../systems/iterative/expression.js';
import {
  ACTION_CHECKS,
  iterativeEntryFault,
  RULE_COMBINES,
} from '../../../../../systems/normalize/iterativeLibrary.js';
import { arrayOrEmpty } from '../../../../../utils/scalars.js';

const WARNING_CODES = new Set(['iterativeCheckFactWithoutCheck']);

/** Whether `fault` is a warning rather than a blocking mark. */
export const isWarningFault = (fault) => WARNING_CODES.has(fault?.code);

/** Whether `fault` belongs under an amount field rather than under its row. */
export const isAmountFault = (fault) =>
  fault?.code === 'iterativeInvalidExpression' ||
  fault?.code === 'iterativeExplodeUnbounded' ||
  fault?.reason === 'expression';

const idsRead = ({ roots }) => [...roots.counter, ...roots.min, ...roots.max, ...roots.target];

function analysisFaults(analysis, { counterIds }) {
  return [
    ...(analysis.ok ? [] : [{ code: 'iterativeInvalidExpression', reason: analysis.reason }]),
    ...(analysis.explodeUnbounded ? [{ code: 'iterativeExplodeUnbounded' }] : []),
    ...(idsRead(analysis).some((id) => !counterIds.has(id))
      ? [{ code: 'iterativeUnknownCounter', reason: 'expression' }]
      : []),
  ];
}

/**
 * The marks one amount or formula earns under a C3 profile (`cost`, `effect`, `start`): its parse
 * reason, an explosion that cannot stop, and a counter it reads that `counterIds` does not hold.
 * @param {string} text The expression as typed.
 * @param {string} profile A key of `ITERATIVE_EXPRESSION_PROFILES`.
 * @param {{ counterIds: Set<string> }} context The counters the expression may read.
 */
export function expressionFaults(text, profile, context) {
  return analysisFaults(analyzeIterativeExpression(text, profile), context);
}

/** Each entry's `'id'`-aware entry fault, aligned to `entries`; `null` for one that parses. */
export function listEntryFaults(kind, entries) {
  const list = arrayOrEmpty(entries);
  return entryFaults(list, (entry) => iterativeEntryFault(kind, entry)).map(({ fault }) => fault);
}

const entryMark = (fault) => (fault ? [{ code: 'iterativeInvalidEntry', reason: fault }] : []);
const unknownCounter = (id, counterIds) =>
  typeof id === 'string' && !counterIds.has(id) ? [{ code: 'iterativeUnknownCounter' }] : [];

/** The marks on one cost: its entry fault, a counter the library lacks, and its amount. */
export function costFaults(cost, entryFault, context) {
  const parses = iterativeEntryFault('cost', cost) === null;
  return [
    ...entryMark(entryFault),
    ...unknownCounter(cost?.counterId, context.counterIds),
    ...(parses ? expressionFaults(cost.amount, 'cost', context) : []),
  ];
}

/**
 * The marks on one effect: its entry fault, a target the library lacks, its rules, an outcome the
 * routed check lacks, its amount, and a check fact read where `action` rolls no check.
 * @param {object} effect The effect as drafted.
 * @param {object} action The action holding it, for its `check`.
 * @param {string|null} entryFault Its `'id'`-aware entry fault.
 * @param {{ counterIds: Set<string>, actionIds: Set<string>, tierIds: Set<string> }} context
 */
export function effectFaults(effect, action, entryFault, context) {
  const parses = iterativeEntryFault('effect', effect) === null;
  const analysis = parses ? analyzeIterativeExpression(effect.amount, 'effect') : null;
  const readsCheck = parses && (namesCheckFact(effect.when) || analysis.roots.check);
  return [
    ...entryMark(entryFault),
    ...unknownCounter(effect?.target?.counterId, context.counterIds),
    ...arrayOrEmpty(effect?.when?.rules).flatMap((rule) => {
      const fault = ruleFault(rule, context);
      return fault ? [{ ...fault, field: 'rule' }] : [];
    }),
    ...(arrayOrEmpty(effect?.when?.checkOutcomeIds).some((id) => !context.tierIds.has(id))
      ? [{ code: 'iterativeUnknownCheckOutcome' }]
      : []),
    ...(analysis ? analysisFaults(analysis, context) : []),
    ...(action?.check === 'none' && readsCheck ? [{ code: 'iterativeCheckFactWithoutCheck' }] : []),
  ];
}

/** The mark on one rule: unreadable, naming a counter, or naming an action the lists lack. */
export function ruleFault(rule, { counterIds, actionIds }) {
  const fault = counterRuleFault(rule);
  if (fault) return { code: 'iterativeInvalidRule', reason: fault };
  if (rule.source === 'counter' && !counterIds.has(rule.counterId)) {
    return { code: 'iterativeUnknownCounter' };
  }
  const unknown =
    rule.source === 'previousAction' && rule.actionIds.some((id) => !actionIds.has(id));
  return unknown ? { code: 'iterativeUnknownAction' } : null;
}

/**
 * The marks that belong to no single row: a `check` or `availability.combine` outside its enum, and
 * a list that is not an array. Each carries the `field` it is drawn under.
 */
export function actionLevelFaults(action) {
  const marks = [];
  if (!ACTION_CHECKS.includes(action?.check)) marks.push({ field: 'check', reason: 'check' });
  if (!RULE_COMBINES.includes(action?.availability?.combine)) {
    marks.push({ field: 'availability', reason: 'combine' });
  }
  const lists = [
    ['availability', action?.availability?.rules],
    ['costs', action?.costs],
    ['effects', action?.effects],
  ];
  for (const [field, list] of lists)
    if (!Array.isArray(list)) marks.push({ field, reason: 'list' });
  return marks.map((mark) => ({ code: 'iterativeInvalidEntry', ...mark }));
}

/** The sentence for one expression reason; every key is a literal for `lang-keys-no-orphans`. */
const REASON_SENTENCES = Object.freeze({
  invalid: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.ReasonInvalid',
      'This is not a formula the action can read. Check the brackets and operators.'
    ),
  dice: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.ReasonDice',
      'Dice cannot be rolled in this field. Use a plain number or a counter.'
    ),
  'forbidden-root': (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.ReasonForbiddenRoot',
      'This field cannot read that value. Pick one from the list under the field.'
    ),
  'unresolved-path': (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.ReasonUnresolvedPath',
      'That value cannot be looked up here.'
    ),
  'non-finite': (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.ReasonNonFinite',
      'This does not come to a finite number.'
    ),
  'explode-limit': (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.ReasonExplodeLimit',
      'This rolls more dice than one term may hold.'
    ),
  'roll-unavailable': (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.ReasonRollUnavailable',
      'The dice for this formula cannot be rolled.'
    ),
});

const CODE_SENTENCES = Object.freeze({
  iterativeExplodeUnbounded: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.FaultExplodeUnbounded',
      'An exploding die here can never stop. Raise its threshold.'
    ),
  iterativeUnknownCounter: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.FaultUnknownCounter',
      'This counter is not in the counter library. Choose another counter.'
    ),
  iterativeUnknownAction: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.FaultUnknownAction',
      'This rule names an action that is not in the action library.'
    ),
  iterativeInvalidRule: (text) =>
    text('FABRICATE.Admin.Manager.Iterative.FaultInvalidRule', 'This rule is incomplete.'),
  iterativeInvalidEntry: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.FaultInvalidEntry',
      'This setting cannot be read. Choose it again.'
    ),
  iterativeUnknownCheckOutcome: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.FaultUnknownCheckOutcome',
      'This effect names an outcome the crafting check does not have.'
    ),
  iterativeCheckFactWithoutCheck: (text) =>
    text(
      'FABRICATE.Admin.Manager.Iterative.FaultCheckFactWithoutCheck',
      'This effect reads the check, but this action rolls no check. It will never apply as written.'
    ),
});

/**
 * The one sentence a mark reads. An expression fault speaks its `reason`; every other code speaks
 * for itself. Unknown faults fall back to the unreadable-setting sentence.
 * @param {{ code: string, reason?: string }} fault
 * @param {(key: string, fallback: string) => string} text The shell's localizer.
 */
export function faultSentence(fault, text) {
  if (fault?.code === 'iterativeInvalidExpression') {
    return (REASON_SENTENCES[fault.reason] ?? REASON_SENTENCES.invalid)(text);
  }
  return (CODE_SENTENCES[fault?.code] ?? CODE_SENTENCES.iterativeInvalidEntry)(text);
}
