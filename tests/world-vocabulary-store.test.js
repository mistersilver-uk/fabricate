/**
 * The World Vocabulary store, its projection and the numbers both publish (issue 1392, epic
 * 1357, PR 7a).
 *
 * ── EVERYTHING HERE GOES THROUGH `buildWorldScopeState`, NEVER `projectWorldVocabulary` ────
 * A direct call to the projection bypasses `readCorpus`, which is the shared reader the three
 * scoped-entity legs use and which probes THIS store with THEIR sub-key names inside a guard
 * that converts any throw into an unavailable projection. `{available: false, total: 0}` is a
 * legitimate published shape, so a store whose `isSeeded` threw would blank the whole screen and
 * its rail badge with no error and no failing test anywhere else. Asserting through the
 * composition is what makes that reachable.
 *
 * ── AND THE COUNTS ARE ASSERTED AGAINST REAL STORES ───────────────────────────────────────
 * `tests/components/world-vocabulary-page-mounted.test.js` hand-supplies each row's
 * `silentlyDeletable`, which is what the page receives — so deleting the COMPUTATION would not
 * red there, and the panel's own default (`totalUsage === 0`) would silently restore the
 * one-click delete on exactly the row it must never be offered for. That arm is here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { createScopedDefinitionStore } from '../src/systems/scopedDefinitionStore.js';
import {
  normalizeComponentMemberships,
  normalizeComponentWorldDefaults,
} from '../src/systems/componentScope.js';
import {
  createWorldVocabularyStore,
  WORLD_VOCABULARY_SETTING_KEY,
} from '../src/systems/WorldVocabularyStore.js';
import {
  normalizeWorldVocabularyEntries,
  planWorldCategoryClear,
  planWorldTagStrip,
  worldVocabularyEntryId,
} from '../src/systems/worldVocabulary.js';
import { buildWorldScopeState } from '../src/ui/svelte/stores/worldScopeProjection.js';
import { buildVocabularyUsage } from '../src/utils/vocabularyUsage.js';

/** A `Map`-backed settings seam, shared by every store a case builds. */
function seam() {
  const values = new Map();
  return {
    values,
    getSetting: (key) => values.get(key),
    setSetting: async (key, value) => {
      values.set(key, value);
    },
  };
}

function vocabularyStore(seams, seed = null) {
  if (seed) seams.values.set(WORLD_VOCABULARY_SETTING_KEY, seed);
  const store = createWorldVocabularyStore(seams);
  store.load();
  return store;
}

function componentStore(seams, seed = null) {
  if (seed) seams.values.set(SETTING_KEYS.COMPONENT_SCOPE, seed);
  const store = createScopedDefinitionStore({
    settingKey: SETTING_KEYS.COMPONENT_SCOPE,
    getSetting: seams.getSetting,
    setSetting: seams.setSetting,
    normalizeDefaults: normalizeComponentWorldDefaults,
    normalizeMemberships: normalizeComponentMemberships,
  });
  store.load();
  return store;
}

const rowsById = (state, kind) => new Map(state[kind].map((row) => [row.id, row]));

test('the setting key this store owns is the one `settings.js` registers', () => {
  // A MIRROR, AND IT IS GUARDED. The store takes its seams by injection and deliberately does
  // not import `src/config/settings.js` — that import transitively pulls `src/ui/theme.js` into
  // every closure — so the key is restated. A drift would leave the store reading and writing a
  // key nothing registers, which `ClientSettings#assertSetting` turns into a throw that
  // `load()`'s guard swallows into a permanently empty vocabulary.
  assert.equal(WORLD_VOCABULARY_SETTING_KEY, SETTING_KEYS.WORLD_VOCABULARY);
});

test('the derived entry id is the key the shipped reference counter joins on', () => {
  // THE OTHER MIRROR. `vocabularyUsage.js` keys its maps with a module-private `vocabularyKey`,
  // and every world count is `usage.get(entry.id)`. If the two ever disagreed, every entry would
  // publish `totalUsage: 0` — and a zero-usage row offers a ONE-CLICK delete.
  const usage = buildVocabularyUsage(
    [{ category: '  Potions  ' }],
    [{ category: 'Reagent', tags: ['HERB'] }]
  );
  assert.equal(usage.componentCategoryUsage.get(worldVocabularyEntryId('Reagent')), 1);
  assert.equal(usage.tagUsage.get(worldVocabularyEntryId(' Herb ')), 1);
  assert.equal(usage.categoryUsage.get(worldVocabularyEntryId('POTIONS')), 1);
});

test('the badge reads the world vocabulary end to end, through the real store', () => {
  const seams = seam();
  const store = vocabularyStore(seams, {
    componentCategories: [
      { id: 'reagent', name: 'Reagent' },
      { id: 'metal', name: 'Metal' },
    ],
    componentTags: [
      { id: 'herb', name: 'herb' },
      { id: 'rare', name: 'rare' },
    ],
    recipeCategories: [
      { id: 'potions', name: 'Potions' },
      { id: 'smithing', name: 'Smithing' },
    ],
  });

  const { worldScope } = buildWorldScopeState({
    stores: { vocabulary: store },
    systems: [],
    recipes: [],
  });
  // THE NON-VACUITY FLOOR FIRST. `total === 6` against a producer that published `count` would
  // be an assertion about a number that does not exist; `> 0` states that something was counted
  // at all before the exact value is claimed.
  assert.ok(worldScope.vocabulary.total > 0, 'the projection counted something');
  assert.equal(worldScope.vocabulary.total, 6, 'the badge counts the WHOLE vocabulary');
  assert.equal(worldScope.vocabulary.available, true);
  assert.deepEqual(
    worldScope.vocabulary.componentCategories.map((row) => row.name),
    ['Reagent', 'Metal'],
    'authored order and authored casing both survive the projection'
  );
});

test('an unrecognised kind answers false rather than throwing, so the leg survives readCorpus', () => {
  // `readCorpus` asks THIS store `isSeeded('entities')`, `isSeeded('defaults')` and
  // `isSeeded('membership')` — three names it does not carry — inside a `try`/`catch` that turns
  // any throw into `{corpus: null}`.
  const seams = seam();
  const store = vocabularyStore(seams, { componentTags: [{ id: 'herb', name: 'herb' }] });
  for (const kind of ['entities', 'defaults', 'membership', 'nonsense']) {
    assert.equal(store.isSeeded(kind), false, `${kind} is not a vocabulary this store carries`);
  }
  const { worldScope } = buildWorldScopeState({ stores: { vocabulary: store }, systems: [] });
  assert.equal(worldScope.vocabulary.available, true, 'the leg survived the foreign probes');
  assert.equal(worldScope.vocabulary.total, 1);
});

test('key absence survives a round trip, PER KIND', () => {
  const seams = seam();
  const store = vocabularyStore(seams);
  assert.equal(store.isSeeded(), false, 'an unwritten setting is seeded nowhere');

  return (async () => {
    await store.save({ componentTags: [{ id: 'herb', name: 'herb' }] });
    // ASSERTED AFTER A RELOAD THROUGH THE SEAM, never against the in-memory flag: the flag is
    // what a store sets on its own write, and the claim is about what survives on disk.
    const reloaded = vocabularyStore(seams);
    assert.equal(reloaded.isSeeded('componentTags'), true);
    assert.equal(
      reloaded.isSeeded('componentCategories'),
      false,
      'a kind that has never been written must not be persisted as an empty one'
    );
    assert.equal(reloaded.isSeeded('recipeCategories'), false);

    await reloaded.save({
      ...reloaded.get(),
      componentCategories: [{ id: 'reagent', name: 'Reagent' }],
    });
    const twice = vocabularyStore(seams);
    assert.equal(twice.isSeeded('componentTags'), true);
    assert.equal(twice.isSeeded('componentCategories'), true);
    assert.equal(twice.isSeeded('recipeCategories'), false, 'and the third is still absent');

    // AN EMPTIED VOCABULARY IS NOT AN UNAUTHORED ONE. Deleting the last tag writes the key with
    // an empty list, and the key's presence is what records that the GM authored that emptiness.
    await twice.save({ ...twice.get(), componentTags: [] });
    const emptied = vocabularyStore(seams);
    assert.equal(emptied.isSeeded('componentTags'), true);
    assert.deepEqual(emptied.corpus().componentTags, []);
  })();
});

test('the normalizer derives ids, refuses the reserved bucket and de-duplicates first-wins', () => {
  assert.deepEqual(normalizeWorldVocabularyEntries('componentCategories', ['  Reagent  ']), [
    { id: 'reagent', name: 'Reagent' },
  ]);
  assert.deepEqual(
    normalizeWorldVocabularyEntries('componentCategories', [
      { name: 'Reagent' },
      { name: 'reagent' },
    ]),
    [{ id: 'reagent', name: 'Reagent' }],
    'FIRST-WINS on the derived id, which diverges from the case-preserving system rule'
  );
  for (const kind of ['componentCategories', 'recipeCategories']) {
    assert.deepEqual(
      normalizeWorldVocabularyEntries(kind, ['General', ' general ']),
      [],
      `${kind} refuses the reserved bucket through the shipped guard`
    );
  }
  assert.deepEqual(
    normalizeWorldVocabularyEntries('componentTags', ['general']),
    [{ id: 'general', name: 'general' }],
    'component tags have no reserved bucket and refuse nothing'
  );
  assert.deepEqual(normalizeWorldVocabularyEntries('nonsense', ['x']), []);
  assert.deepEqual(normalizeWorldVocabularyEntries('componentTags', 'not a list'), []);
});

test('the deletion planners answer what a deletion rewrites, and rewrite nothing else', () => {
  const defaults = [
    { id: 'c1', category: 'Reagent', tags: ['herb', 'moss'] },
    { id: 'c2', category: 'Metal' },
  ];
  const cleared = planWorldCategoryClear(defaults, 'reagent');
  assert.deepEqual(cleared.affectedIds, ['c1']);
  assert.equal('category' in cleared.defaults[0], false, 'the key is REMOVED, never set to general');
  assert.deepEqual(cleared.defaults[0].tags, ['herb', 'moss'], 'and nothing else on the record moves');
  assert.deepEqual(cleared.defaults[1], defaults[1], 'an unaffected record is untouched');
  assert.deepEqual(defaults[0].category, 'Reagent', 'the planner does not mutate its input');

  const stripped = planWorldTagStrip(defaults, 'herb');
  assert.deepEqual(stripped.affectedIds, ['c1']);
  assert.deepEqual(stripped.defaults[0].tags, ['moss']);
  assert.equal(stripped.defaults[0].category, 'Reagent');
  assert.deepEqual(planWorldTagStrip(defaults, 'absent').affectedIds, []);
});

test('the reference count is real on all three vocabularies, including the world-default tags', () => {
  const seams = seam();
  const vocabulary = vocabularyStore(seams, {
    componentCategories: [{ id: 'reagent', name: 'Reagent' }],
    componentTags: [
      { id: 'herb', name: 'herb' },
      { id: 'moss', name: 'moss' },
    ],
    recipeCategories: [{ id: 'potions', name: 'Potions' }],
  });
  // ONE WORLD COMPONENT DEFAULT CARRYING `moss`, AND NO SYSTEM COMPONENT CARRYING IT. The
  // migration deliberately leaves world tags unauthored, so a GM-authored world tag is a grant
  // no membership record mirrors: excluding it here would publish `Unused` for a tag every
  // member system has been granted, under a red one-click delete.
  const components = componentStore(seams, {
    entities: [{ id: 'c1', name: 'Moss Clump' }],
    defaults: { c1: { id: 'c1', category: 'Reagent', tags: ['moss'] } },
    membership: {},
  });

  const systems = [
    {
      id: 'sys-a',
      name: 'Alpha',
      components: [
        { id: 'a1', category: 'Reagent', tags: ['herb'] },
        { id: 'a2', category: 'Reagent' },
      ],
    },
    { id: 'sys-b', name: 'Beta', components: [{ id: 'b1', category: 'Reagent' }] },
  ];
  const recipes = [
    { id: 'r1', category: 'Potions' },
    { id: 'r2', category: 'Potions' },
    { id: 'r3', category: 'Potions' },
    {
      id: 'r4',
      category: 'Potions',
      ingredientSets: [
        { ingredientGroups: [{ options: [{ match: { type: 'tags', tags: ['herb'] } }] }] },
      ],
    },
  ];

  const { worldScope } = buildWorldScopeState({
    stores: { vocabulary, component: components },
    systems,
    recipes,
  });
  const categories = rowsById(worldScope.vocabulary, 'componentCategories');
  const tags = rowsById(worldScope.vocabulary, 'componentTags');
  const recipeCategories = rowsById(worldScope.vocabulary, 'recipeCategories');

  // THE THREE EXPECTED VALUES ARE MUTUALLY DISTINCT, so a wrong-map join cannot pass by
  // coincidence. `Reagent` is 3 and NOT 4: the world default's own `category` is excluded,
  // because a migrated world elected it from a system that already carries it.
  assert.equal(categories.get('reagent').totalUsage, 3);
  assert.equal(tags.get('herb').totalUsage, 2, 'a component AND a recipe tag placeholder');
  assert.equal(recipeCategories.get('potions').totalUsage, 4);
  assert.equal(tags.get('moss').totalUsage, 1, 'exactly one — the world default, counted once');

  // THE SECOND NUMBER, WHICH NOTHING ELSE PRODUCES. `confirmTokensFor`'s `componentTags` branch
  // can answer `{}` with every other assertion in this repository green, and the only symptom is
  // that the GM reads a literal `{components}` in a destructive confirm.
  assert.deepEqual(
    tags.get('moss').confirmTokens,
    { components: 1 },
    'a tag carried by one world component default states that one in its confirm'
  );
  assert.deepEqual(
    tags.get('herb').confirmTokens,
    { components: 0 },
    'and the POSITIVE CONTROL: a tag no world default carries states a zero, not an absent token'
  );
  // THE CATEGORY KIND STATES BOTH OF ITS OWN, and they are independent: this world default
  // carries `Reagent` and has no membership record, so one default is affected and nothing
  // inherits it. A branch that derived the second number from the first would read 1 here.
  assert.deepEqual(categories.get('reagent').confirmTokens, { defaults: 1, inheriting: 0 });
});

test('silentlyDeletable is COMPUTED from the corpus, and is narrower than the count', () => {
  const seams = seam();
  const vocabulary = vocabularyStore(seams, {
    componentCategories: [
      { id: 'reagent', name: 'Reagent' },
      { id: 'spare', name: 'Spare' },
    ],
    recipeCategories: [{ id: 'potions', name: 'Potions' }],
  });
  // TWO world component defaults carry `Reagent`, and they inherit into THREE crafting systems
  // between them. The roster is FIVE, so neither the roster size nor the default count
  // coincides with the expected 3.
  const components = componentStore(seams, {
    entities: [
      { id: 'c1', name: 'Ash Salt' },
      { id: 'c2', name: 'Bone Meal' },
    ],
    defaults: {
      c1: { id: 'c1', category: 'Reagent' },
      c2: { id: 'c2', category: 'Reagent' },
    },
    membership: {
      'c1|sys-a': { entityId: 'c1', systemId: 'sys-a', inherit: {} },
      'c1|sys-b': { entityId: 'c1', systemId: 'sys-b', inherit: {} },
      'c2|sys-c': { entityId: 'c2', systemId: 'sys-c', inherit: {} },
    },
  });
  const systems = ['sys-a', 'sys-b', 'sys-c', 'sys-d', 'sys-e'].map((id) => ({
    id,
    name: id,
    components: [],
  }));

  const { worldScope } = buildWorldScopeState({
    stores: { vocabulary, component: components },
    systems,
    recipes: [{ id: 'r1', category: 'Potions' }],
  });
  const categories = rowsById(worldScope.vocabulary, 'componentCategories');

  const gated = categories.get('reagent');
  assert.equal(gated.totalUsage, 0, 'no in-system component names it');
  assert.equal(
    gated.silentlyDeletable,
    false,
    'and it still opens the confirm, because deleting it rewrites two world defaults'
  );
  assert.deepEqual(
    gated.confirmTokens,
    { defaults: 2, inheriting: 3 },
    'the confirm states BOTH numbers, and the 3 is neither the roster size nor the default count'
  );

  // THE POSITIVE CONTROL. Without it a "confirm everything" implementation passes the assertion
  // above and removes the one-click delete from the whole screen.
  const free = categories.get('spare');
  assert.equal(free.totalUsage, 0);
  assert.equal(free.silentlyDeletable, true, 'nothing names it and its deletion rewrites nothing');

  // A RECIPE CATEGORY REWRITES NOTHING AND IS STILL GATED BY ITS COUNT ALONE.
  const potions = rowsById(worldScope.vocabulary, 'recipeCategories').get('potions');
  assert.equal(potions.totalUsage, 1);
  assert.equal(potions.silentlyDeletable, false);
  assert.deepEqual(potions.confirmTokens, {}, 'a recipe category has no second number');
});

test('the decoration builds NEW rows and leaves `total` where it was', () => {
  const seams = seam();
  const store = vocabularyStore(seams, {
    componentCategories: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    componentTags: [{ id: 'c', name: 'C' }],
    recipeCategories: [{ id: 'd', name: 'D' }, { id: 'e', name: 'E' }, { id: 'f', name: 'F' }],
  });
  const { worldScope } = buildWorldScopeState({
    stores: { vocabulary: store },
    systems: [{ id: 's', name: 'S', components: [{ id: 'x', category: 'A' }] }],
    recipes: [],
  });
  assert.equal(worldScope.vocabulary.total, 6, 'the decoration moves no count');
  // THE STORE'S CACHE IS NOT WRITTEN THROUGH. `WorldVocabularyStore` replaces its corpus
  // wholesale precisely so nothing mutates it, and the resolved-union memo elsewhere keys on
  // corpus identity.
  const corpus = store.corpus();
  assert.equal(
    'totalUsage' in corpus.componentCategories[0],
    false,
    'the projection stamped its per-row fields onto the store cache'
  );
  assert.notEqual(worldScope.vocabulary.componentCategories, corpus.componentCategories);
  assert.equal(worldScope.vocabulary.componentCategories[0].totalUsage, 1);
});
