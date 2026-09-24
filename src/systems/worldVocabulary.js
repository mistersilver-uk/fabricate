/**
 * The World Vocabulary's pure core (issue 1392): component categories, component tags and recipe
 * categories authored once per world. Foundry- and UI-free, so `worldVocabularyStudio.js` imports
 * it without a store. An entry is `{id, name}` with `id` the trimmed lower-cased name, since
 * nothing renames one; de-duplication is first-wins on that id, unlike system scope's
 * case-preserving storage (issue 1411). `general` is never a world entry, refused through the two
 * shipped guards; tags reserve nothing. Contract: `data-models/spec.md` § World Vocabulary.
 */

import { isGeneralComponentCategory } from '../utils/componentCategories.js';
import { isGeneralRecipeCategory } from '../utils/recipeCategories.js';

/**
 * The three vocabularies in screen order, re-exported by `worldScopeProjection.js`; defined here
 * because the projection imports the deletion planners, which would otherwise form a cycle.
 */
export const WORLD_VOCABULARY_KINDS = Object.freeze([
  'componentCategories',
  'componentTags',
  'recipeCategories',
]);

export function isWorldVocabularyKind(kind) {
  return typeof kind === 'string' && WORLD_VOCABULARY_KINDS.includes(kind);
}

/**
 * The id derived from a name, `''` for a non-name. Must agree with `vocabularyUsage.js`'s private
 * `vocabularyKey`, which `tests/world-vocabulary-store.test.js` pins.
 */
export function worldVocabularyEntryId(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}

function refusesReservedBucket(kind, name) {
  if (kind === 'componentCategories') return isGeneralComponentCategory(name);
  if (kind === 'recipeCategories') return isGeneralRecipeCategory(name);
  return false;
}

/** An array or a map, with bare strings allowed in either, as an import may deliver. */
function rawEntries(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

function authoredName(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return typeof entry.name === 'string' ? entry.name.trim() : '';
  }
  return '';
}

/**
 * Normalize one vocabulary: total, non-throwing and idempotent, keeping authored order and
 * casing. An allowlist rebuild of `{id, name}` is safe, as the entry has no other key to lose.
 */
export function normalizeWorldVocabularyEntries(kind, raw) {
  if (!isWorldVocabularyKind(kind)) return [];
  const seen = new Set();
  const entries = [];
  for (const entry of rawEntries(raw)) {
    const name = authoredName(entry);
    if (!name || refusesReservedBucket(kind, name)) continue;
    const id = worldVocabularyEntryId(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, name });
  }
  return entries;
}

function defaultRecords(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

/**
 * Plan deleting a world component category: each matching default's category is cleared, never
 * reassigned to `general`, so inheriting systems fall through to their own. Pure; answers the
 * whole rewritten list and the changed ids, for the write path and the warning alike.
 */
export function planWorldCategoryClear(rawDefaults, entryId) {
  const target = worldVocabularyEntryId(entryId);
  const affectedIds = [];
  const defaults = defaultRecords(rawDefaults).map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    if (!target || worldVocabularyEntryId(record.category) !== target) return record;
    affectedIds.push(record.id);
    // Removed, not blanked: the world setting and the normalizer both keep absence.
    const { category: _cleared, ...rest } = record;
    return rest;
  });
  return { defaults, affectedIds };
}

/**
 * Plan deleting a world component tag from each default's `tags`, leaving an empty array. A
 * membership's `mutedTags` entry for it stays, inert, and re-applies if the tag returns.
 */
export function planWorldTagStrip(rawDefaults, entryId) {
  const target = worldVocabularyEntryId(entryId);
  const affectedIds = [];
  const defaults = defaultRecords(rawDefaults).map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    const tags = Array.isArray(record.tags) ? record.tags : null;
    if (!target || !tags) return record;
    const kept = tags.filter((tag) => worldVocabularyEntryId(tag) !== target);
    if (kept.length === tags.length) return record;
    affectedIds.push(record.id);
    return { ...record, tags: kept };
  });
  return { defaults, affectedIds };
}

/** The defaults a deletion rewrites, decided once per kind; a recipe category rewrites none. */
export function worldDefaultsAffectedByDeletion(kind, rawDefaults, entryId) {
  if (kind === 'componentCategories')
    return planWorldCategoryClear(rawDefaults, entryId).affectedIds;
  if (kind === 'componentTags') return planWorldTagStrip(rawDefaults, entryId).affectedIds;
  return [];
}
