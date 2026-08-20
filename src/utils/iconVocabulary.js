/**
 * The curated icon vocabulary as PUBLISHED data (issue 1269).
 *
 * Fabricate curates one icon vocabulary out of the Font Awesome bundle Foundry ships, and every
 * icon field in the module draws from it. This module is the projection that turns that internal
 * set into the plain data `game.fabricate.listCuratedIcons()` and
 * `game.fabricate.findCuratedIcon()` hand to a caller, so the accessors on `src/main.js` stay
 * thin Foundry-facing edges and the published contract is testable without importing `main.js`.
 */

import {
  FOUNDRY_CURATED_ICON_DEFINITIONS,
  findCuratedIcon,
} from '../ui/svelte/util/foundryIconVocabulary.js';

/**
 * One curated definition as a caller-owned record.
 *
 * Shared by both published entry points so the two can never answer with different shapes, and
 * so neither has to restate the copying rule.
 *
 * Copies rather than handing the definition back, and the reason has changed since this
 * projection was written. The catalogue now freezes entry by entry — the entry, its `aliases`
 * array and the vocabulary array are all frozen — so the old hazard, a caller writing through a
 * shared object into every picker in the module, is closed at the source. Two reasons to copy
 * survive it. A frozen array cannot be sorted, filtered in place or appended to, and this API
 * promises data a caller owns, so handing back a frozen row would make the obvious next line
 * (`icons.sort(…)`) throw. And that freezing is Fabricate's own defence inside a GENERATED file,
 * not a term of this contract; copying at the publication boundary is what makes the guarantee
 * hold whatever a later regeneration does.
 *
 * The fields are named one at a time rather than spread, so regenerating the catalogue with a new
 * field cannot silently widen what is published.
 *
 * @param {{iconCode: string, label: string, aliases?: ReadonlyArray<string>}} definition
 * @returns {{iconCode: string, label: string, aliases: string[]}}
 */
function toPublishedRecord({ iconCode, label, aliases }) {
  return {
    iconCode,
    label,
    aliases: Array.isArray(aliases) ? [...aliases] : [],
  };
}

/**
 * The curated vocabulary as plain, caller-owned data.
 *
 * @returns {Array<{iconCode: string, label: string, aliases: string[]}>} a fresh array of fresh
 *   records, in the curated order, safe for a caller to keep, sort or mutate.
 */
export function listCuratedIconVocabulary() {
  return FOUNDRY_CURATED_ICON_DEFINITIONS.map(toPublishedRecord);
}

/**
 * The curated record a name resolves to, under its offered name or any of its aliases.
 *
 * Delegates to the vocabulary's own resolver rather than re-deriving membership here, so the
 * answer a companion gets and the answer a picker gets come from one index. Answers `null` for a
 * name the catalogue does not carry, however plausible the name looks.
 *
 * @param {string} iconName a bare Font Awesome icon name, such as `cog`
 * @returns {{iconCode: string, label: string, aliases: string[]}|null}
 */
export function findCuratedIconRecord(iconName) {
  const definition = findCuratedIcon(iconName);
  return definition ? toPublishedRecord(definition) : null;
}
