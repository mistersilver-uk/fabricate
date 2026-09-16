/** The curated icon vocabulary as PUBLISHED data (issue 1269). */

import { getFoundryCuratedIconDefinitionsForMajor } from '../ui/svelte/util/essenceIcons.js';

/** One curated definition as a caller-owned record. */
function toPublishedRecord({ iconCode, label, aliases }) {
  return {
    iconCode,
    label,
    aliases: Array.isArray(aliases) ? [...aliases] : [],
  };
}

/** The curated vocabulary as plain, caller-owned data. */
export function listCuratedIconVocabulary() {
  return getFoundryCuratedIconDefinitionsForMajor().map(toPublishedRecord);
}

/** The name index for one curated vocabulary. */
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

/** The curated record a name resolves to, under its offered name or any of its aliases. */
export function findCuratedIconRecord(iconName) {
  const definition = curatedNameIndex(getFoundryCuratedIconDefinitionsForMajor()).get(
    String(iconName ?? '').trim()
  );
  return definition ? toPublishedRecord(definition) : null;
}
