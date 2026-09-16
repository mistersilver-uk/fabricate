/**
 * The World Vocabulary write path, and the GATED two-store deletion cascade (issue 1392, epic
 * 1357, PR 7a).
 *
 * ── WHY THE ASSERTIONS ARE ON THE PERSISTED PAYLOAD AND NOT ON `store.get()` ──────────────
 * Both stores publish their cache BEFORE awaiting the write, which is what stops a GM's second
 * edit reading a pre-first-edit corpus. The recorded cost is that a REJECTED write leaves the
 * cache ahead of the setting — and unlike a landed write no `updateSetting` fires, so the
 * replication bridge's `load()` never runs and the divergence persists until reload. Asserting
 * on `get()` would therefore report a torn write as a clean one.
 *
 * ── AND WHY BOTH STORES SHARE ONE `Map`-BACKED SEAM ──────────────────────────────────────
 * Both take their accessors by injection, so the whole cascade runs against real stores and a
 * real settings map. `makeSettingsSeam({isGM: false})` is deliberately NOT used: it rejects
 * EVERY world-scoped key, and the whole point of case (ii) is that exactly ONE of the two writes
 * fails.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import {
  normalizeComponentMemberships,
  normalizeComponentWorldDefaults,
} from '../src/systems/componentScope.js';
import { createScopedDefinitionStore } from '../src/systems/scopedDefinitionStore.js';
import {
  createWorldVocabularyStore,
  WORLD_VOCABULARY_SETTING_KEY,
} from '../src/systems/WorldVocabularyStore.js';
import { createWorldScopeActions } from '../src/ui/svelte/stores/worldScopeActions.js';

/**
 * Two real stores over one settings map, with an optional PER-KEY write refusal.
 *
 * @param {object} [options]
 * @param {string|null} [options.rejectKey] the one setting key whose write rejects.
 */
function world({ rejectKey = null } = {}) {
  const values = new Map();
  values.set(WORLD_VOCABULARY_SETTING_KEY, {
    componentCategories: [
      { id: 'reagent', name: 'Reagent' },
      { id: 'metal', name: 'Metal' },
    ],
    componentTags: [{ id: 'herb', name: 'herb' }],
    recipeCategories: [{ id: 'potions', name: 'Potions' }],
  });
  values.set(SETTING_KEYS.COMPONENT_SCOPE, {
    entities: [
      { id: 'c1', name: 'Ash Salt' },
      { id: 'c2', name: 'Bone Meal' },
    ],
    defaults: {
      c1: { id: 'c1', category: 'Reagent', tags: ['herb'] },
      c2: { id: 'c2', category: 'Metal' },
    },
    membership: { 'c1|sys-a': { entityId: 'c1', systemId: 'sys-a', inherit: {} } },
  });

  const getSetting = (key) => values.get(key);
  const setSetting = async (key, value) => {
    if (key === rejectKey) throw new Error(`User lacks permission to update Setting [${key}]`);
    values.set(key, value);
  };

  const vocabulary = createWorldVocabularyStore({ getSetting, setSetting });
  vocabulary.load();
  const component = createScopedDefinitionStore({
    settingKey: SETTING_KEYS.COMPONENT_SCOPE,
    getSetting,
    setSetting,
    normalizeDefaults: normalizeComponentWorldDefaults,
    normalizeMemberships: normalizeComponentMemberships,
  });
  component.load();

  const actions = createWorldScopeActions({
    getStores: {
      component: () => component,
      essence: () => null,
      tool: () => null,
      vocabulary: () => vocabulary,
    },
  });
  return { values, actions, vocabulary, component };
}

/** What is ON DISK for one key, never what a store's cache says. */
const persistedVocabulary = (values) => values.get(WORLD_VOCABULARY_SETTING_KEY);
const persistedDefaults = (values) => values.get(SETTING_KEYS.COMPONENT_SCOPE)?.defaults ?? {};
const categoryIds = (values) =>
  (persistedVocabulary(values).componentCategories ?? []).map((entry) => entry.id);

test('deleting a world category clears it from every world component default that carries it', async () => {
  const { values, actions } = world();
  assert.equal(await actions.vocabulary.removeEntry('componentCategories', 'reagent'), true);

  assert.deepEqual(categoryIds(values), ['metal'], 'the vocabulary entry is gone');
  assert.equal(
    'category' in persistedDefaults(values).c1,
    false,
    'the world default that named it no longer carries a category at all'
  );
  assert.deepEqual(
    persistedDefaults(values).c1.tags,
    ['herb'],
    'and nothing else on that record moved'
  );
  assert.equal(
    persistedDefaults(values).c2.category,
    'Metal',
    'a default naming a different category is untouched'
  );
});

test('deleting a world tag drops it from the defaults that carry it and nothing else', async () => {
  const { values, actions } = world();
  assert.equal(await actions.vocabulary.removeEntry('componentTags', 'herb'), true);
  assert.deepEqual(
    (persistedVocabulary(values).componentTags ?? []).map((entry) => entry.id),
    []
  );
  // The key is ABSENT rather than an empty array, and that is the scope normalizer's own rule
  // rather than the planner's: `attachLabels` omits an empty list on every normalize, on the
  // `complications` doctrine that an authored empty carries no meaning distinct from absence.
  // Both states resolve identically through `resolveComponentTags`.
  assert.deepEqual(
    persistedDefaults(values).c1.tags ?? [],
    [],
    'the tag is dropped from the default'
  );
  assert.equal(persistedDefaults(values).c1.category, 'Reagent', 'its category is untouched');
});

test('deleting a recipe category rewrites no world default at all', async () => {
  const { values, actions } = world();
  const before = JSON.stringify(values.get(SETTING_KEYS.COMPONENT_SCOPE));
  assert.equal(await actions.vocabulary.removeEntry('recipeCategories', 'potions'), true);
  assert.deepEqual((persistedVocabulary(values).recipeCategories ?? []).map((e) => e.id), []);
  assert.equal(
    JSON.stringify(values.get(SETTING_KEYS.COMPONENT_SCOPE)),
    before,
    'the world corpus holds no recipe record, so nothing cascades'
  );
});

test('a REFUSED vocabulary write leaves the entry on disk, the defaults cleared, and answers false', async () => {
  // THE TORN WRITE THE ORDERING IS CHOSEN FOR. Leg one has landed and leg two has not, so the
  // residue is an unused vocabulary entry — re-deletable, and leg one is idempotent so retrying
  // converges. The OTHER order would leave a world default naming an entry no vocabulary offers,
  // a state only re-authoring fixes.
  const { values, actions } = world({ rejectKey: WORLD_VOCABULARY_SETTING_KEY });
  assert.equal(
    await actions.vocabulary.removeEntry('componentCategories', 'reagent'),
    false,
    'a rejected `game.settings.set` becomes `false`, never an unhandled rejection'
  );
  assert.deepEqual(
    categoryIds(values).sort(),
    ['metal', 'reagent'],
    'the entry is still on disk, so the GM can delete it again'
  );
  assert.equal(
    'category' in persistedDefaults(values).c1,
    false,
    'and the defaults write DID land, which is what makes the retry converge'
  );
});

test('a REFUSED defaults write abandons the cascade and changes NOTHING', async () => {
  // THE GATE, not merely the order. `mutate` has no try/catch, `VocabularyPanel` calls
  // `onRemove(row)` unawaited, and a world-setting write really can reject — so an unawaited or
  // ungated second write would delete the vocabulary entry while its defaults still carry it.
  const { values, actions } = world({ rejectKey: SETTING_KEYS.COMPONENT_SCOPE });
  const vocabularyBefore = JSON.stringify(persistedVocabulary(values));
  const defaultsBefore = JSON.stringify(values.get(SETTING_KEYS.COMPONENT_SCOPE));

  assert.equal(await actions.vocabulary.removeEntry('componentCategories', 'reagent'), false);
  assert.equal(
    JSON.stringify(persistedVocabulary(values)),
    vocabularyBefore,
    'the vocabulary write was never issued'
  );
  assert.equal(
    JSON.stringify(values.get(SETTING_KEYS.COMPONENT_SCOPE)),
    defaultsBefore,
    'and the defaults are unchanged'
  );
});

test('addEntry refuses a kind, a blank, the reserved bucket and a duplicate', async () => {
  const { values, actions } = world();
  assert.equal(await actions.vocabulary.addEntry('nonsense', 'Thing'), false);
  assert.equal(await actions.vocabulary.addEntry('componentCategories', '   '), false);
  assert.equal(await actions.vocabulary.addEntry('componentCategories', 'General'), false);
  assert.equal(
    await actions.vocabulary.addEntry('componentCategories', 'reagent'),
    false,
    'de-duplication is on the DERIVED id, so a re-cased duplicate is refused'
  );
  assert.deepEqual(categoryIds(values).sort(), ['metal', 'reagent'], 'and nothing was written');

  assert.equal(await actions.vocabulary.addEntry('componentCategories', '  Alloy  '), true);
  assert.deepEqual(persistedVocabulary(values).componentCategories.at(-1), {
    id: 'alloy',
    name: 'Alloy',
  });
});

test('every verb answers false rather than throwing when there is no store', async () => {
  const actions = createWorldScopeActions({ getStores: {} });
  assert.equal(await actions.vocabulary.addEntry('componentTags', 'herb'), false);
  assert.equal(await actions.vocabulary.removeEntry('componentTags', 'herb'), false);
  assert.equal(await actions.vocabulary.removeEntry('nonsense', 'herb'), false);
});

test('removing an entry that is not there answers false and writes nothing', async () => {
  const { values, actions } = world();
  const before = JSON.stringify(persistedVocabulary(values));
  assert.equal(await actions.vocabulary.removeEntry('componentCategories', 'absent'), false);
  assert.equal(JSON.stringify(persistedVocabulary(values)), before);
});

test('the cascade tolerates an absent component store rather than abandoning the deletion', async () => {
  // A world with no component store has no world defaults to rewrite, so there is nothing for
  // leg one to do and refusing here would make the entry undeletable.
  const values = new Map([
    [WORLD_VOCABULARY_SETTING_KEY, { componentCategories: [{ id: 'reagent', name: 'Reagent' }] }],
  ]);
  const vocabulary = createWorldVocabularyStore({
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => {
      values.set(key, value);
    },
  });
  vocabulary.load();
  const actions = createWorldScopeActions({
    getStores: { component: () => null, vocabulary: () => vocabulary },
  });
  assert.equal(await actions.vocabulary.removeEntry('componentCategories', 'reagent'), true);
  assert.deepEqual(categoryIds(values), []);
});
