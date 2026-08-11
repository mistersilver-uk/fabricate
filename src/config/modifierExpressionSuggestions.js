/**
 * Roll-data suggestion chips for the system Modifiers editor's expression field
 * (issue 1096).
 *
 * A modifier expression resolves against the ACTING CHARACTER's roll data, and the
 * paths that carry a useful number are different in every Foundry game system —
 * `@abilities.wis.mod` in `dnd5e` is `@actor.system.abilities.wis.mod` in `pf2e`.
 * A hard-coded chip row would therefore be right in one world and wrong in every
 * other, which is why the system-specific half of this list is DERIVED rather than
 * written out: it reads the same per-Foundry-system bundle the card's own
 * `Seed presets` button seeds from
 * (`getCharacterModifierPresetsForFoundrySystem`), so a chip can never suggest a
 * path the product would not itself author for that world, and adding a third
 * supported system adds its chips with no edit here.
 *
 * What this module curates is only WHICH CONCEPTS to surface, not their paths. Five
 * chips is the whole budget — the row sits under a single field — so it takes three
 * ability/skill concepts that both shipped bundles carry and appends two
 * system-agnostic terms.
 *
 * The agnostic half is genuinely agnostic: a flat constant and a die are valid in
 * every system because they reference no roll data at all. A die is legal EVERYWHERE
 * (issue 1118) — a gathering drop row applies its result and a check appends the dice
 * to its roll formula — so the die chip suggests a first-class expression rather than
 * one the editor has to warn about.
 */

import { getCharacterModifierPresetsForFoundrySystem } from './gatheringCharacterModifierPresets.js';

/**
 * The preset ids surfaced as system-specific chips, in row order. Every id here is
 * present in both shipped bundles; an id a bundle lacks is skipped rather than
 * rendered with a missing expression, so a partial bundle degrades to fewer chips
 * instead of a broken one.
 *
 * @type {ReadonlyArray<string>}
 */
const SUGGESTED_PRESET_IDS = Object.freeze(['intelligence', 'wisdom', 'survival']);

/**
 * Terms that reference no roll data and are therefore valid in every game system.
 *
 * @type {ReadonlyArray<{id: string, expression: string, label: string}>}
 */
const SYSTEM_AGNOSTIC_SUGGESTIONS = Object.freeze([
  Object.freeze({ id: 'flat-2', expression: '2', label: 'Flat bonus' }),
  Object.freeze({ id: 'die-1d4', expression: '1d4', label: '1d4' }),
]);

/**
 * The suggestion chips offered under a modifier expression for the active world.
 *
 * @param {string} foundrySystemId Foundry game system id (`game.system.id`).
 * @returns {Array<{id: string, expression: string, label: string, systemSpecific: boolean}>}
 *   Ordered chips: the system-specific roll-data terms first, then the agnostic ones.
 *   An unsupported world yields the agnostic terms alone rather than a `dnd5e` row
 *   mislabelled as universal.
 */
export function getModifierExpressionSuggestions(foundrySystemId) {
  const presets = getCharacterModifierPresetsForFoundrySystem(foundrySystemId);
  const byId = new Map(presets.map((preset) => [String(preset.id), preset]));
  const specific = SUGGESTED_PRESET_IDS.map((id) => byId.get(id))
    .filter((preset) => preset?.expression)
    .map((preset) => ({
      id: `preset-${preset.id}`,
      expression: String(preset.expression),
      label: String(preset.label || preset.id),
      systemSpecific: true,
    }));
  return [
    ...specific,
    ...SYSTEM_AGNOSTIC_SUGGESTIONS.map((suggestion) => ({ ...suggestion, systemSpecific: false })),
  ];
}

// A trailing arithmetic operator (or an opening bracket) the GM has already typed. The
// suggestion completes it rather than adding a second `+` beside it.
const TRAILING_OPERATOR = /[+\-*/(]$/;

/**
 * Append a suggested term to an authored expression.
 *
 * Appending — not replacing — is the whole point: the chips build up a compound
 * expression such as `@abilities.wis.mod + 1d4`. Three cases the naive
 * `${current} + ${term}` gets wrong, and this does not:
 *
 *  - an EMPTY expression yields the term alone, never a leading `+`;
 *  - an expression the GM left ending in an operator (`@abilities.wis.mod +`) is
 *    COMPLETED by the term rather than given a second `+`;
 *  - surrounding whitespace is normalised, so a trailing space does not defeat the
 *    operator check above.
 *
 * @param {*} current The stored expression, possibly empty.
 * @param {*} term The suggested term to append.
 * @returns {string} The expression to persist.
 */
export function appendModifierExpressionTerm(current, term) {
  const base = String(current ?? '').trim();
  const addition = String(term ?? '').trim();
  if (!addition) return base;
  if (!base) return addition;
  if (TRAILING_OPERATOR.test(base)) return `${base} ${addition}`;
  return `${base} + ${addition}`;
}
