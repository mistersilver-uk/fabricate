/**
 * The World Vocabulary's pure core (issue 1392, epic 1357, PR 7a).
 *
 * Three independent vocabularies — component categories, component tags and recipe categories —
 * authored ONCE for the world instead of once per crafting system. `## World Vocabulary` in
 * `openspec/specs/data-models/spec.md` is the canonical model; this module holds the parts of it
 * that are pure: the kind list, the entry normalizer, and the two planners that answer what
 * deleting an entry rewrites in the world component defaults.
 *
 * ## It is Foundry-free and UI-free, deliberately
 *
 * Nothing here reads a setting, a store or a Foundry global. `WorldVocabularyStore` binds the
 * settings seams, `worldScopeActions` performs the writes, and `worldScopeProjection` decorates
 * the rows a screen reads. That split is what lets `worldVocabularyStudio.js` — the world
 * vocabulary screen's own leaf — import this module without pulling a store into a mounted
 * component's closure.
 *
 * ## An entry is `{id, name}` and NOTHING renames it
 *
 * `id` is the trimmed, lowercased name. It is not a `randomID()`, and that is a consequence of
 * the model rather than a shortcut: there is no rename affordance at world scope, so an entry's
 * identity IS its name. The derived id then does three jobs at once — it is the de-duplication
 * key, it is the join key against `buildVocabularyUsage`'s maps (which key on the same
 * lowercased trimmed name), and it is what a world component default's `category` or `tags`
 * entry is matched against when a deletion is planned.
 *
 * ## De-duplication is on the ID, first-wins — and that DIVERGES from system scope
 *
 * `normalizeCustomComponentCategories` de-duplicates on the case-PRESERVING value, so `Reagent`
 * and `reagent` remain two distinct system categories while `## CraftingSystem` requirement 6c
 * already keys their shared icon map by the lowercased name. Issue 1397 is the symptom of that
 * inconsistency. This module takes the rule the icon maps and the reference counter already
 * assume; reconciling the system half, and deciding how a world `reagent` and a system `Reagent`
 * resolve in a merged list, is issue 1411's (`## World Vocabulary` requirement 3).
 *
 * ## The reserved general bucket is not a world entry
 *
 * `general` is implicit per system, never persisted, and refused on add at BOTH scopes. The
 * refusal is read from the two shipped guards rather than restated here, so a change to either
 * bucket's spelling cannot leave the world half accepting a name the system half refuses.
 * Component TAGS have no reserved bucket, so nothing is refused there.
 */

import { isGeneralComponentCategory } from '../utils/componentCategories.js';
import { isGeneralRecipeCategory } from '../utils/recipeCategories.js';

/**
 * The three vocabularies the World Vocabulary holds, in the order its screen lists them.
 *
 * DEFINED HERE AND RE-EXPORTED BY `worldScopeProjection.js`, which is where it shipped first
 * (issue 1362) and where `tests/world-scope-projection.test.js` still imports it from. The
 * direction is this way round because the projection needs {@link planWorldCategoryClear} and
 * {@link planWorldTagStrip} to state a deletion's second number, and defining the list in the
 * projection instead would make the two modules import each other.
 *
 * @type {readonly string[]}
 */
export const WORLD_VOCABULARY_KINDS = Object.freeze([
  'componentCategories',
  'componentTags',
  'recipeCategories',
]);

/**
 * Whether a kind is one this vocabulary carries.
 *
 * @param {unknown} kind
 * @returns {boolean}
 */
export function isWorldVocabularyKind(kind) {
  return typeof kind === 'string' && WORLD_VOCABULARY_KINDS.includes(kind);
}

/**
 * The id derived from an authored vocabulary name.
 *
 * IT MUST AGREE WITH `vocabularyUsage.js`'s `vocabularyKey`, which is a module-private function
 * there and is not exported. Restating one line is the smaller evil than widening that module's
 * surface, but the agreement is not left to inspection: `tests/world-vocabulary-store.test.js`
 * drives `buildVocabularyUsage` with a mixed-case name and asserts the count is reachable
 * through the id this function derives, so a divergence reds rather than silently reporting
 * every entry as unreferenced.
 *
 * @param {unknown} name
 * @returns {string} the derived id, or `''` for anything that cannot be a name.
 */
export function worldVocabularyEntryId(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase();
}

/**
 * Whether this kind refuses the reserved general bucket, and by which shipped guard.
 *
 * @param {string} kind
 * @param {string} name
 * @returns {boolean}
 */
function refusesReservedBucket(kind, name) {
  if (kind === 'componentCategories') return isGeneralComponentCategory(name);
  if (kind === 'recipeCategories') return isGeneralRecipeCategory(name);
  return false;
}

/**
 * The entries of a raw vocabulary, whether it arrived as an array or as a map.
 *
 * TOLERANT OF BOTH, and of bare strings inside either, on `subKeyEntries`' reason: an import or
 * a hand edit may legitimately deliver a map, and the shape a GM's earlier system-scope
 * vocabulary is copied from is a flat array of strings.
 *
 * @param {unknown} raw
 * @returns {unknown[]}
 */
function rawEntries(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

/**
 * The authored name of one raw entry.
 *
 * @param {unknown} entry
 * @returns {string}
 */
function authoredName(entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return typeof entry.name === 'string' ? entry.name.trim() : '';
  }
  return '';
}

/**
 * Normalize one vocabulary.
 *
 * TOTAL, NON-THROWING AND IDEMPOTENT, on the `normalizeModifierLibrary` contract: an unknown
 * kind answers an empty list, a non-array/non-map answers an empty list, and an entry that
 * cannot carry a name is DROPPED rather than repaired. Authored ORDER and authored CASING are
 * both preserved; only the derived `id` is folded to lower case.
 *
 * AN ALLOWLIST REBUILD of exactly `{id, name}`. That is safe here in a way it is not in
 * `_normalizeSystem` — where a key the rebuild stops emitting is destroyed on the next save —
 * because the persisted entry has no other key to lose.
 *
 * @param {string} kind One of {@link WORLD_VOCABULARY_KINDS}.
 * @param {unknown} raw
 * @returns {Array<{id: string, name: string}>}
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

/**
 * The world component default records of a persisted or normalized `defaults` payload.
 *
 * @param {unknown} raw an array of records, or the persisted map keyed by entity id.
 * @returns {Array<object>}
 */
function defaultRecords(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') return Object.values(raw);
  return [];
}

/**
 * Plan the deletion of a world COMPONENT CATEGORY against the world component defaults.
 *
 * THE CATEGORY IS CLEARED, NEVER REASSIGNED TO `general`. `### Component scope` requirement 2
 * forbids the reassignment, and clearing is what makes `resolveComponentCategory` reach ABSENCE
 * and let each inheriting system's own local value fall through — which is the behaviour
 * `componentScope.js` already documents for a deleted world category.
 *
 * PURE AND NON-MUTATING. It answers the FULL rewritten record list plus the ids it changed, so
 * one call serves both the write path (which persists the list) and the projection (which
 * states how many defaults a deletion would rewrite before the GM commits to it).
 *
 * @param {unknown} rawDefaults the world component defaults, as an array or the persisted map.
 * @param {string} entryId the vocabulary entry's derived id.
 * @returns {{defaults: Array<object>, affectedIds: string[]}}
 */
export function planWorldCategoryClear(rawDefaults, entryId) {
  const target = worldVocabularyEntryId(entryId);
  const affectedIds = [];
  const defaults = defaultRecords(rawDefaults).map((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
    if (!target || worldVocabularyEntryId(record.category) !== target) return record;
    affectedIds.push(record.id);
    // The key is REMOVED rather than set to `undefined` or to `''`: a world setting preserves
    // key absence, and `normalizeComponentWorldDefaults` is absence-preserving too, so the
    // cleared state survives the round trip as the absence the resolver is written to read.
    const { category: _cleared, ...rest } = record;
    return rest;
  });
  return { defaults, affectedIds };
}

/**
 * Plan the deletion of a world COMPONENT TAG against the world component defaults.
 *
 * The tag is dropped from each default's `tags`; a default left with no tags keeps an EMPTY
 * array rather than losing the key, because `attachLabels` already omits an empty one on the
 * next normalize and neither state changes what `resolveComponentTags` answers.
 *
 * A membership record's `mutedTags` entry naming the deleted tag is LEFT IN PLACE and is inert:
 * `resolveComponentTags` filters only the WORLD tags by the muted set and appends the record's
 * own tags unfiltered, so an orphaned mute cannot suppress a system's own same-named tag. It
 * re-applies if the GM re-adds the tag, which is the behaviour a GM who muted it would expect.
 *
 * @param {unknown} rawDefaults the world component defaults, as an array or the persisted map.
 * @param {string} entryId the vocabulary entry's derived id.
 * @returns {{defaults: Array<object>, affectedIds: string[]}}
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

/**
 * Which world component defaults a deletion of this entry would rewrite.
 *
 * The one place the per-kind answer is decided, so the projection's warning numbers and the
 * write path's cascade cannot disagree about what "affected" means. A RECIPE category rewrites
 * nothing: the world corpus holds no recipe record at all.
 *
 * @param {string} kind One of {@link WORLD_VOCABULARY_KINDS}.
 * @param {unknown} rawDefaults the world component defaults.
 * @param {string} entryId
 * @returns {string[]} the affected world component default ids.
 */
export function worldDefaultsAffectedByDeletion(kind, rawDefaults, entryId) {
  if (kind === 'componentCategories')
    return planWorldCategoryClear(rawDefaults, entryId).affectedIds;
  if (kind === 'componentTags') return planWorldTagStrip(rawDefaults, entryId).affectedIds;
  return [];
}
