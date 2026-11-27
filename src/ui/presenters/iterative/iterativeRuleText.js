/**
 * The words for an iterative Counter Rule, one helper for every player surface: a counter rule
 * reads "{counter} ≥ {value}", a session-count rule "{threshold} sessions" and a previous-action
 * rule "right after {actions}". A rule that does not parse, or names an unknown label, reads `null`.
 */
import { counterRuleFault, iterativeNumber } from '../../../systems/iterative/counterRule.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

const K = Object.freeze({
  counter: 'FABRICATE.App.Journal.Iterative.Rule.Counter',
  sessions: 'FABRICATE.App.Journal.Iterative.Rule.Sessions',
  previous: 'FABRICATE.App.Journal.Iterative.Rule.Previous',
  and: 'FABRICATE.App.Journal.Iterative.List.And',
  or: 'FABRICATE.App.Journal.Iterative.List.Or',
  comma: 'FABRICATE.App.Journal.Iterative.List.Comma',
});

const THRESHOLD_KEYS = Object.freeze({
  '>=': 'FABRICATE.App.Journal.Iterative.Threshold.AtLeast',
  '<=': 'FABRICATE.App.Journal.Iterative.Threshold.AtMost',
  '>': 'FABRICATE.App.Journal.Iterative.Threshold.Above',
  '<': 'FABRICATE.App.Journal.Iterative.Threshold.Below',
  '=': 'FABRICATE.App.Journal.Iterative.Threshold.Exactly',
});

const SYMBOLS = Object.freeze({ '>=': '≥', '<=': '≤', '>': '>', '<': '<', '=': '=' });

/** "{v} or more", "{v} or less", "more than {v}", "less than {v}" or "exactly {v}". */
export function thresholdText(op, value, localize) {
  const key = THRESHOLD_KEYS[op];
  return key ? localize(key, { value: iterativeNumber(value) }) : '';
}

/** `items` joined as "a, b, c", for a reading that lists facts rather than choices. */
export function commaText(items, localize) {
  const words = arrayOrEmpty(items).filter(Boolean);
  return words.slice(1).reduce((first, next) => localize(K.comma, { first, next }), words[0] ?? '');
}

/** `items` joined as "a, b and c" under `all`, or "a, b or c" under `any`. */
export function listText(items, combine, localize) {
  const words = arrayOrEmpty(items).filter(Boolean);
  if (words.length < 2) return words[0] ?? '';
  const head = commaText(words.slice(0, -1), localize);
  return localize(combine === 'any' ? K.or : K.and, { first: head, last: words.at(-1) });
}

/**
 * A rule's words, `labels.counter(id)` and `labels.action(id)` naming what it reads; `null` when
 * the rule does not parse or names a counter or action with no label.
 */
export function ruleText(rule, labels, localize) {
  if (counterRuleFault(rule)) return null;
  if (rule.source === 'previousAction') {
    const actions = rule.actionIds.map((id) => labels.action(id));
    if (actions.some((label) => !label)) return null;
    return localize(K.previous, { actions: listText(actions, 'any', localize) });
  }
  const value = iterativeNumber(rule.value);
  if (rule.source === 'sessionCount') {
    return localize(K.sessions, { threshold: thresholdText(rule.op, value, localize) });
  }
  const counter = labels.counter(rule.counterId);
  return counter ? localize(K.counter, { counter, op: SYMBOLS[rule.op], value }) : null;
}

/** The counter a rule reads, or `null` for a session-count or previous-action rule. */
export const ruleCounterId = (rule) => (rule?.source === 'counter' ? rule.counterId : null);

/** Whether any of `rules` reads a counter in `ids`. */
export const readsAny = (rules, ids) =>
  arrayOrEmpty(rules).some((rule) => ids.has(ruleCounterId(rule)));
