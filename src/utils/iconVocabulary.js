/**
 * The curated icon vocabulary as PUBLISHED data (issue 1269).
 *
 * Fabricate curates one icon vocabulary out of the Font Awesome bundle Foundry ships, and every
 * icon field in the module draws from it. This module is the projection that turns that internal
 * set into the plain data `game.fabricate.listCuratedIcons()` and
 * `game.fabricate.findCuratedIcon()` hand to a caller, so the accessors on `src/main.js` stay
 * thin Foundry-facing edges and the published contract is testable without importing `main.js`.
 *
 * It reads the vocabulary through the GENERATION-AWARE accessors the pickers read, never from the
 * committed catalogue directly. The catalogue is measured from one Foundry release's Font Awesome
 * bundle, and an older client's bundle draws fewer names; publishing the catalogue itself would
 * answer a companion with icons this client cannot draw, and would make the published set and the
 * set a picker offers two vocabularies rather than one.
 */

import { getFoundryCuratedIconDefinitionsForMajor } from '../ui/svelte/util/essenceIcons.js';

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
  return getFoundryCuratedIconDefinitionsForMajor().map(toPublishedRecord);
}

/**
 * The name index for one curated vocabulary.
 *
 * Memoized against the VOCABULARY ARRAY rather than built once at module load, because the
 * generation-aware accessor answers with a different array for a measured client bundle than for
 * the committed catalogue, and it may answer with the fallback before the client's stylesheet has
 * parsed. Keying on the array means a later, measured vocabulary is indexed on its own terms
 * instead of being resolved through a stale index, and the index for a vocabulary nothing holds
 * any more is collectable.
 */
const nameIndexesByVocabulary = new WeakMap();

function curatedNameIndex(definitions) {
  const memoized = nameIndexesByVocabulary.get(definitions);
  if (memoized) return memoized;

  const index = new Map();
  for (const definition of definitions) {
    index.set(definition.iconCode, definition);
    for (const alias of definition.aliases ?? []) index.set(alias, definition);
  }
  nameIndexesByVocabulary.set(definitions, index);
  return index;
}

/**
 * The curated record a name resolves to, under its offered name or any of its aliases.
 *
 * Resolves against the SAME vocabulary `listCuratedIconVocabulary()` publishes, so the two
 * published calls can never disagree about what this client offers: a name the list omits because
 * this Foundry generation cannot draw it answers `null` here too, rather than resolving out of a
 * catalogue no picker on this client renders.
 *
 * @param {string} iconName a bare Font Awesome icon name, such as `cog`
 * @returns {{iconCode: string, label: string, aliases: string[]}|null}
 */
export function findCuratedIconRecord(iconName) {
  const definition = curatedNameIndex(getFoundryCuratedIconDefinitionsForMajor()).get(
    String(iconName ?? '').trim()
  );
  return definition ? toPublishedRecord(definition) : null;
}
