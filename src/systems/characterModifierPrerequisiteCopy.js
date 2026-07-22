/**
 * Cross-list copy mapping between gathering **character modifiers** and
 * **character prerequisites** (issue 768). The two share a `label`/`name` and an
 * `icon`, but a modifier carries a roll `expression` while a prerequisite carries
 * a resolved `path` + comparison `op` + `value`. They live in DIFFERENT stores
 * (modifiers ride the gathering world config; prerequisites ride the crafting
 * system), so a copy is never a shared mutation — it is an ADD into the
 * destination store via its existing add op, which assigns a fresh id.
 *
 * These functions are intentionally Foundry-free and id-free so they can be
 * unit-tested in isolation and so the destination `add*` path owns id
 * generation. Their output is a partial for the destination normalizer
 * (`normalizeCharacterPrerequisite` / `_normalizeGatheringCharacterModifier`),
 * not a finished entry.
 *
 * The copy is deliberately lossy and honest about it: `label`/`name` and `icon`
 * cross cleanly; `expression`/`path` is a best-effort `@`-transform (faithful for
 * a bare `@path`, leaving a compound roll formula as a path the GM must fix); and
 * the pass/fail logic (`op`/`value`) and the roll math have no counterpart on the
 * other side, so they are dropped — surfaced to the GM via the opened-empty
 * editor, never silently lost.
 */

import { DEFAULT_PREREQUISITE_OPERATOR } from './characterPrerequisites.js';

/**
 * Strip a single leading `@` from a modifier expression to yield a prerequisite
 * path. Faithful for a bare `@abilities.str.mod`; a compound formula (e.g.
 * `@abilities.str.mod + 1d4`) yields a path the GM must fix by hand.
 *
 * @param {*} expression Raw modifier expression.
 * @returns {string} The path, without a leading `@`.
 */
function expressionToPath(expression) {
  return String(expression ?? '')
    .trim()
    .replace(/^@/, '');
}

/**
 * Re-add a leading `@` to a prerequisite path to yield a modifier expression.
 * An empty path yields an empty expression; an already-`@`-prefixed path is left
 * untouched.
 *
 * @param {*} path Raw prerequisite path.
 * @returns {string} The `@`-prefixed expression, or '' when the path is empty.
 */
function pathToExpression(path) {
  const clean = String(path ?? '').trim();
  if (!clean) return '';
  return clean.startsWith('@') ? clean : `@${clean}`;
}

/**
 * Map a gathering character modifier to a character-prerequisite partial.
 * Carries `label`→`name` and `icon`→`icon`, transforms `expression`→`path`
 * (`@`-strip), defaults `op` to the shared default and `value` to `null`, and
 * never carries the source `id` (the destination add op assigns a fresh one).
 *
 * @param {{label?: string, icon?: string, expression?: string}} [modifier]
 * @returns {{name: string, icon: string, path: string, op: string, value: null}}
 */
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

/**
 * Map a character prerequisite to a gathering-character-modifier partial.
 * Carries `name`→`label` and `icon`→`icon`, transforms `path`→`expression`
 * (`@`-add), and drops the pass/fail `op`/`value` (no counterpart on a roll
 * modifier). Never carries the source `id`.
 *
 * @param {{name?: string, icon?: string, path?: string}} [prerequisite]
 * @returns {{label: string, icon: string, expression: string}}
 */
export function mapPrerequisiteToModifier(prerequisite = {}) {
  const source = prerequisite && typeof prerequisite === 'object' ? prerequisite : {};
  return {
    label: String(source.name ?? '').trim(),
    icon: String(source.icon ?? '').trim(),
    expression: pathToExpression(source.path),
  };
}
