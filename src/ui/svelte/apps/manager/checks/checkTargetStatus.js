/**
 * What the Studio says about a check's target reading. A missing path names only the `@` paths with
 * no value; every other refusal reuses the runtime's own sentence. Pure; `text(key, fallback)`
 * localizes.
 */
import {
  PATH_TOKEN,
  resolveDeterministicExpression,
} from '../../../../../systems/checkEvaluation.js';
import { checkRefusalMessage } from '../../../../../systems/checkTarget.js';

import { interpolate } from './checksCopy.js';

/** The `@` paths in `expression` with no value in `rollData`, each once, in written order. */
export function missingTargetPaths(expression, rollData = {}) {
  const tokens = String(expression ?? '').match(PATH_TOKEN) ?? [];
  return [...new Set(tokens)].filter(
    (token) =>
      resolveDeterministicExpression(token, rollData, { pathMode: 'foundry' }).reason ===
      'unresolved-path'
  );
}

/**
 * The fault a character-value expression carries whatever character reads it: `dice` or `invalid`
 * once every path is neutralized to a number, else null.
 */
export function targetExpressionFault(expression) {
  if (!String(expression ?? '').trim()) return null;
  const neutralized = String(expression ?? '').replaceAll(PATH_TOKEN, '1');
  const read = resolveDeterministicExpression(neutralized, {}, { pathMode: 'foundry' });
  return !read.ok && (read.reason === 'dice' || read.reason === 'invalid') ? read.reason : null;
}

/** Whether `source` reads a character value through an `@` path. */
export function readsCharacter(source) {
  return (String(source ?? '').match(PATH_TOKEN) ?? []).length > 0;
}

/** The runtime's refusal sentence for `reason`, localized through the Studio's `text`. */
export function targetRefusalSentence(reason, text) {
  const subject = text('FABRICATE.Admin.Manager.Checks.Evaluation.RefusalSubject', 'This');
  return checkRefusalMessage(reason, subject, (key, data) => {
    const sentence = text(key, key);
    return sentence === key ? key : interpolate(sentence, data);
  });
}

/**
 * The character-value status line for the Preview-as `character` (`{ name, rollData }`):
 * `{ tone, text }`, or null while no expression is written.
 */
export function targetValueStatus(expression, character, text) {
  const source = String(expression ?? '').trim();
  if (!source) return null;
  const rollData = character?.rollData ?? {};
  const read = resolveDeterministicExpression(source, rollData, { pathMode: 'foundry' });
  if (!character && (read.ok || read.reason === 'unresolved-path')) {
    return {
      tone: 'muted',
      text: text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.ValueNoActor',
        'Choose a character in Preview as to see what this resolves to.'
      ),
    };
  }
  if (read.ok) {
    return {
      tone: 'resolved',
      text: interpolate(
        text('FABRICATE.Admin.Manager.Checks.Evaluation.ValueResolved', '{actor} → {value}'),
        { actor: character.name, value: read.value }
      ),
    };
  }
  if (read.reason !== 'unresolved-path') {
    return { tone: 'unresolved', text: targetRefusalSentence(read.reason, text) };
  }
  return {
    tone: 'unresolved',
    text: interpolate(
      text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.ValueUnresolved',
        '{actor} has no value at {path}. The check cannot resolve for them.'
      ),
      { actor: character.name, path: missingTargetPaths(source, rollData).join(', ') }
    ),
  };
}
