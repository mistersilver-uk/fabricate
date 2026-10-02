/**
 * Cross-list copy between modifiers and character prerequisites (issue 768). They share a
 * `label`/`name` and an `icon`; a modifier carries a roll `expression`, a prerequisite a `path`,
 * `op` and `value`. A copy is an add through the destination's add op, which assigns a fresh id,
 * so these return id-free partials for the destination normalizer. The copy is lossy on purpose:
 * `expression`/`path` is a best-effort `@` transform, and `op`/`value` and the roll math have no
 * counterpart, so the GM finds them empty in the opened editor rather than silently lost.
 */

import { DEFAULT_PREREQUISITE_OPERATOR } from './characterPrerequisites.js';

/** Trim and strip one leading `@`; a `@`-less expression is returned unchanged. */
export function stripExpressionSigil(expression) {
  return String(expression ?? '')
    .trim()
    .replace(/^@/, '');
}

const BARE_ROLL_DATA_PATH = /^[A-Za-z_][\w.]*$/;
const SIGIL_ROLL_DATA_PATH = /^@[A-Za-z_][\w.]*$/;

/** A pure roll-data path loses its `@` for display; any formula stays byte-for-byte visible. */
export function displayRollDataExpression(expression) {
  const clean = String(expression ?? '').trim();
  return SIGIL_ROLL_DATA_PATH.test(clean) ? clean.slice(1) : clean;
}

/** Restore `@` on a pure path; dice, constants, functions and compound formulas pass unchanged. */
export function toStoredRollDataExpression(input) {
  const clean = String(input ?? '').trim();
  if (!clean) return '';
  if (clean.startsWith('@')) return clean;
  return BARE_ROLL_DATA_PATH.test(clean) ? `@${clean}` : clean;
}

function expressionToPath(expression) {
  return stripExpressionSigil(expression);
}

function pathToExpression(path) {
  const clean = String(path ?? '').trim();
  if (!clean) return '';
  return clean.startsWith('@') ? clean : `@${clean}`;
}

/** `op` takes the shared default and `value` is `null`; the source `id` is never carried. */
export function mapModifierToPrerequisite(modifier = {}) {
  const source = modifier && typeof modifier === 'object' ? modifier : {};
  return {
    name: String(source.label ?? '').trim(),
    icon: String(source.icon ?? '').trim(),
    path: expressionToPath(source.expression),
    op: DEFAULT_PREREQUISITE_OPERATOR,
    value: null,
  };
}

/** Drops `op`/`value`, which have no counterpart on a roll modifier. */
export function mapPrerequisiteToModifier(prerequisite = {}) {
  const source = prerequisite && typeof prerequisite === 'object' ? prerequisite : {};
  return {
    label: String(source.name ?? '').trim(),
    icon: String(source.icon ?? '').trim(),
    expression: pathToExpression(source.path),
  };
}
