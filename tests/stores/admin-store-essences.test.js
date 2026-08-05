/**
 * Issue 1036 — the admin store's essence surface: the projections the redesigned library
 * reads, and the six write exports it drives.
 *
 * Two of the criteria here are about a hazard that has bitten this repo before, so both are
 * pinned with a deliberately awkward fixture:
 *
 * - **`enabled` is DEFAULT-TRUE**, so a `true` fixture round-trips green through a
 *   projection that drops the field entirely. Every assertion below uses `false`.
 * - **`selectedSystem` is a HAND-BUILT allowlist.** A persisted field is invisible to the
 *   whole UI until a projection names it, however correct the normalizer and the write path
 *   are — `componentCategories` and `categoryIcons` both shipped that way. These tests read
 *   the field through `viewState`, which is the only place a UI consumer can see it.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'svelte/store';

import { makeEssence, makeEssenceStoreHarness } from '../helpers/essenceFixtures.js';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');

/**
 * A recipe fixture shaped enough for the store's own recipe-list projection to run: it
 * calls `toJSON()` and `isSimpleRecipe()` on every recipe during `refresh()`, so a bare
 * literal makes the whole refresh throw rather than failing the assertion under test.
 */
function makeRecipeFixture(id, overrides = {}) {
  const recipe = {
    id,
    name: `Recipe ${id}`,
    description: '',
    img: 'recipe.png',
    category: 'general',
    craftingSystemId: 'sys1',
    enabled: true,
    locked: false,
    visibility: {},
    ingredientSets: [],
    steps: [],
    recipeItemId: '',
    isSimpleRecipe: () => true,
    ...overrides,
  };
  recipe.toJSON = () => ({ ...recipe });
  return recipe;
}

/** A recipe whose ingredient SET names the essence through the legacy per-set map. */
function recipeWithSetEssence(id, essenceId, overrides = {}) {
  return makeRecipeFixture(id, {
    ingredientSets: [{ id: `${id}-set`, essences: { [essenceId]: 2 } }],
    ...overrides,
  });
}

/** A recipe whose STEP names the essence through a first-class ingredient option. */
function recipeWithStepEssenceOption(id, essenceId, overrides = {}) {
  return makeRecipeFixture(id, {
    steps: [
      {
        id: `${id}-step`,
        ingredientSets: [
          {
            id: `${id}-step-set`,
            ingredientGroups: [
              { id: 'g1', options: [{ match: { type: 'essence', essenceId, amount: 1 } }] },
            ],
          },
        ],
      },
    ],
    ...overrides,
  });
}

async function openStore(harness) {
  const store = createAdminStore(harness.services);
  await store.selectSystem('sys1');
  return store;
}

function cardsOf(store) {
  return get(store.viewState).essenceCards;
}

function cardFor(store, id) {
  return cardsOf(store).find((card) => card.id === id);
}

// ---------------------------------------------------------------------------
// Criterion 13 (store half) — both new persisted fields reach the UI
// ---------------------------------------------------------------------------

test('1036/13: a FALSE `enabled` survives the selectedSystem projection', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', enabled: false })],
  });
  const store = await openStore(harness);

  const projected = get(store.viewState).selectedSystem.essenceDefinitions.find(
    (def) => def.id === 'fire'
  );
  // A `true` fixture here would pass against a projection that never emits the key at all,
  // because the consumer convention folds an absent value onto `true`. Only `false` can
  // distinguish "carried" from "dropped".
  assert.equal(projected.enabled, false, '`selectedSystem` carries the disabled state');
});

test('1036/13: a NON-NULL propertyMacroUuid survives the selectedSystem projection', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.heat' })],
  });
  const store = await openStore(harness);

  const projected = get(store.viewState).selectedSystem.essenceDefinitions.find(
    (def) => def.id === 'fire'
  );
  // Same inverted-default reasoning: `null` is the default, so only a non-null fixture can
  // tell a carried field from a dropped one.
  assert.equal(projected.propertyMacroUuid, 'Macro.heat');
});

test('1036/13: an essence CARD carries both fields and folds enabled to a real boolean', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [
      makeEssence({ id: 'fire', enabled: false, propertyMacroUuid: 'Macro.heat' }),
      // No `enabled` key at all — a definition that predates the field.
      { id: 'water', name: 'Water', icon: 'fas fa-droplet', colorToken: null },
    ],
  });
  const store = await openStore(harness);

  assert.equal(cardFor(store, 'fire').enabled, false);
  assert.equal(cardFor(store, 'fire').propertyMacroUuid, 'Macro.heat');
  assert.equal(
    cardFor(store, 'water').enabled,
    true,
    'an absent key reads as enabled, so no consumer has to repeat the convention'
  );
  assert.equal(cardFor(store, 'water').propertyMacroUuid, null);
});

test('1036: the capability facts are derived, not invented', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [
      makeEssence({ id: 'fire', propertyMacroUuid: 'Macro.heat', sourceComponentId: 'c1' }),
      makeEssence({ id: 'water', name: 'Water', propertyMacroUuid: '   ' }),
    ],
    components: [{ id: 'c1', name: 'Ember', essences: {} }],
  });
  const store = await openStore(harness);

  assert.equal(cardFor(store, 'fire').hasPropertyMacro, true);
  assert.equal(
    cardFor(store, 'fire').hasEffectTransfer,
    true,
    'a CONFIGURED source is what the pill reports; whether it resolves is `sourceState`'
  );
  assert.equal(
    cardFor(store, 'water').hasPropertyMacro,
    false,
    'a blank uuid is not an authored macro'
  );
  assert.equal(cardFor(store, 'water').hasEffectTransfer, false);
});

// ---------------------------------------------------------------------------
// Criterion 23 — recipeUsageCount across BOTH branches the shared walk covers
// ---------------------------------------------------------------------------

test('1036/23: recipeUsageCount counts BOTH the legacy set map and a step ingredient option', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire' }), makeEssence({ id: 'water', name: 'Water' })],
    recipes: [
      recipeWithSetEssence('r1', 'fire'),
      recipeWithStepEssenceOption('r2', 'fire'),
      // A recipe in ANOTHER system must not be counted, or the number the delete-impact
      // statement reports would exceed what the cascade actually rewrites.
      recipeWithSetEssence('r3', 'fire', { craftingSystemId: 'sys2' }),
    ],
  });
  const store = await openStore(harness);

  assert.equal(cardFor(store, 'fire').recipeUsageCount, 2, 'one per branch, and no cross-system');
  assert.equal(
    cardFor(store, 'water').recipeUsageCount,
    0,
    'negative control: an unreferenced essence counts zero, so the walk is not matching everything'
  );
});

test('1036: recipe usage does NOT become a delete block', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire' })],
    components: [{ id: 'c1', name: 'Ember', essences: {} }],
    recipes: [recipeWithSetEssence('r1', 'fire')],
  });
  const store = await openStore(harness);

  const card = cardFor(store, 'fire');
  // `deleteBlocked` keeps its COMPONENT-only meaning: deleting an essence a recipe requires
  // is allowed and rewrites the recipe, while deleting one a component carries is refused.
  assert.equal(card.deleteBlocked, false, 'a recipe reference alone never blocks the delete');
  assert.equal(card.deleteRewritesRecipes, true, 'it is reported through its own key');
  assert.equal(card.componentUsageCount, 0);
});

// ---------------------------------------------------------------------------
// Criterion 9 — duplicateEssence
// ---------------------------------------------------------------------------

test('1036/9: a duplicate takes a name updateEssence will still accept', async () => {
  const harness = makeEssenceStoreHarness({ essences: [makeEssence({ id: 'fire', name: 'Fire' })] });
  const store = await openStore(harness);

  const copyId = await store.duplicateEssence('fire');
  assert.ok(Boolean(copyId), 'the new id is returned so the caller can select the copy');

  // The real proof: SAVE the copy. `addEssence` and `updateEssence` both refuse a
  // case-insensitive name collision and `_uniqueKey` de-duplicates the ID only, so a naive
  // duplicate lands two same-named definitions after which NEITHER can ever be saved again.
  const saved = await store.updateEssence(copyId, { description: 'edited' });
  assert.equal(saved, true, 'the copy is savable, which a colliding name would prevent');
});

test('1036/9: duplicating twice yields THREE distinct names', async () => {
  const harness = makeEssenceStoreHarness({ essences: [makeEssence({ id: 'fire', name: 'Fire' })] });
  const store = await openStore(harness);

  await store.duplicateEssence('fire');
  await store.duplicateEssence('fire');

  const names = harness.system.essenceDefinitions.map((def) => def.name.toLowerCase());
  assert.equal(names.length, 3);
  assert.equal(new Set(names).size, 3, 'counting upwards, not appending "(copy)" repeatedly');
});

test('1036/9: a FALSE enabled is carried onto the copy', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', enabled: false, propertyMacroUuid: 'Macro.heat' })],
  });
  const store = await openStore(harness);

  const copyId = await store.duplicateEssence('fire');
  const copy = harness.system.essenceDefinitions.find((def) => def.id === copyId);

  // Silently re-enabling a copy would give it behaviour its original does not have.
  assert.equal(copy.enabled, false);
  assert.equal(copy.propertyMacroUuid, 'Macro.heat');
  assert.notEqual(copy.id, 'fire', 'a NEW id, or the copy would overwrite its original');
});

test('1036/9: duplicating something that is not there writes nothing', async () => {
  const harness = makeEssenceStoreHarness({ essences: [makeEssence({ id: 'fire' })] });
  const store = await openStore(harness);
  harness.writes.length = 0;

  assert.equal(await store.duplicateEssence('nope'), null);
  assert.equal(await store.duplicateEssence(''), null);
  assert.deepEqual(harness.writes, [], 'negative control: no write at all');
});

// ---------------------------------------------------------------------------
// Criterion 23 — deleteEssence's boolean return
// ---------------------------------------------------------------------------

test('1036/23: deleteEssence returns TRUE only when it actually deleted', async () => {
  const harness = makeEssenceStoreHarness({ essences: [makeEssence({ id: 'fire' })] });
  const store = await openStore(harness);

  assert.equal(await store.deleteEssence('fire'), true);
  assert.equal(harness.system.essenceDefinitions.length, 0);
});

test('1036/23: deleteEssence returns FALSE for a declined confirm, and writes nothing', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire' })],
    confirm: false,
  });
  const store = await openStore(harness);
  harness.writes.length = 0;

  assert.equal(await store.deleteEssence('fire'), false);
  assert.deepEqual(harness.writes, [], 'a declined confirm is not a partial delete');
  assert.equal(harness.system.essenceDefinitions.length, 1);
});

test('1036/23: deleteEssence returns FALSE for an unknown id and for an IN-USE essence', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire' })],
    components: [{ id: 'c1', name: 'Ember', essences: { fire: 2 } }],
  });
  const store = await openStore(harness);

  assert.equal(await store.deleteEssence('nope'), false, 'an unknown id is not a success');
  // The in-use refusal is enforced in the STORE, not by a disabled control: the manager
  // primitive deliberately strips the essence from carrying components regardless.
  assert.equal(await store.deleteEssence('fire'), false);
  assert.equal(harness.system.essenceDefinitions.length, 1, 'the definition is untouched');
  assert.ok(
    harness.notifications.warn.some((message) => message.includes('DeleteBlocked')),
    'and the refusal is LOCALIZED — the fixture returns keys, so an English sentence would fail'
  );
});

// ---------------------------------------------------------------------------
// deleteEssences — the set delete partitions blocked members in the store
// ---------------------------------------------------------------------------

test('1036: deleteEssences deletes the deletable and NAMES the blocked', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [
      makeEssence({ id: 'fire', name: 'Fire' }),
      makeEssence({ id: 'water', name: 'Water' }),
    ],
    components: [{ id: 'c1', name: 'Ember', essences: { fire: 2 } }],
  });
  const store = await openStore(harness);

  const result = await store.deleteEssences(['fire', 'water']);

  assert.equal(result.deleted, 1);
  assert.deepEqual(result.blocked, ['Fire'], 'blocked members are named, not silently skipped');
  assert.deepEqual(
    harness.system.essenceDefinitions.map((def) => def.id),
    ['fire'],
    'the carried essence survives; only the unblocked one is gone'
  );
});

test('1036: deleteEssences is INERT when every member is blocked', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire' })],
    components: [{ id: 'c1', name: 'Ember', essences: { fire: 1 } }],
  });
  const store = await openStore(harness);
  harness.writes.length = 0;

  const result = await store.deleteEssences(['fire']);

  assert.equal(result.deleted, 0);
  assert.deepEqual(result.blocked, ['Fire']);
  assert.deepEqual(harness.writes, [], 'no write is issued at all');
});

// ---------------------------------------------------------------------------
// setEssenceEnabled — one manager write, and the invalidated-recipe report
// ---------------------------------------------------------------------------

test('1036: setEssenceEnabled routes ONE set-apply write and reports invalidated recipes', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire' })],
    recipes: [
      recipeWithSetEssence('r1', 'fire'),
      recipeWithStepEssenceOption('r2', 'fire'),
      // Already disabled, so it was not invalidated by this toggle.
      recipeWithSetEssence('r3', 'fire', { enabled: false }),
    ],
  });
  const store = await openStore(harness);
  harness.writes.length = 0;

  const result = await store.setEssenceEnabled('fire', false);

  assert.equal(result.updated, true);
  assert.equal(result.invalidatedRecipes, 2, 'only recipes that were ENABLED are counted');
  assert.deepEqual(
    harness.writes.map((write) => write.kind),
    ['applyBulkEditToEssences'],
    'exactly one manager call, shared with the bulk Status axis'
  );
  assert.equal(harness.writes[0].edit.enabled, false, 'a falsy-but-real staged edit');
  assert.equal(harness.system.essenceDefinitions[0].enabled, false);
});

test('1036: re-enabling reports nothing invalidated and does not touch recipe state', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', enabled: false })],
    recipes: [recipeWithSetEssence('r1', 'fire')],
  });
  const store = await openStore(harness);

  const result = await store.setEssenceEnabled('fire', true);

  assert.equal(result.invalidatedRecipes, 0);
  assert.equal(harness.system.essenceDefinitions[0].enabled, true);
  assert.equal(harness.recipes[0].enabled, true, 'no recipe was written either way');
});

// ---------------------------------------------------------------------------
// applyEssenceBulkEdit — presence, never truthiness
// ---------------------------------------------------------------------------

test('1036: applyEssenceBulkEdit forwards a falsy-but-real edit VERBATIM', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', colorToken: 'rose' })],
  });
  const store = await openStore(harness);
  harness.writes.length = 0;

  const result = await store.applyEssenceBulkEdit(['fire'], { colorToken: null, enabled: false });

  assert.equal(result.updated, 1);
  assert.deepEqual(
    harness.writes[0].edit,
    { colorToken: null, enabled: false },
    'pruning "empty" keys would collapse Clear colour into leave-alone'
  );
  assert.equal(harness.system.essenceDefinitions[0].colorToken, null);
  assert.equal(harness.system.essenceDefinitions[0].enabled, false);
});

test('1036: applyEssenceBulkEdit writes nothing for an empty edit or an empty selection', async () => {
  const harness = makeEssenceStoreHarness({ essences: [makeEssence({ id: 'fire' })] });
  const store = await openStore(harness);
  harness.writes.length = 0;

  assert.equal(await store.applyEssenceBulkEdit(['fire'], {}), null);
  assert.equal(await store.applyEssenceBulkEdit([], { enabled: false }), null);
  assert.equal(await store.applyEssenceBulkEdit(['fire'], null), null);
  assert.deepEqual(harness.writes, [], 'negative control: an accidental Apply re-writes nothing');
});

// ---------------------------------------------------------------------------
// cancelEssenceDraft — the half worth naming is that it WRITES NOTHING
// ---------------------------------------------------------------------------

test('1036/23: cancelEssenceDraft republishes the persisted state and issues no write', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', name: 'Fire', enabled: false })],
  });
  const store = await openStore(harness);
  harness.writes.length = 0;

  assert.equal(await store.cancelEssenceDraft(), true);

  assert.deepEqual(harness.writes, [], 'a cancel that reached updateSystem would persist the edit');
  assert.equal(cardFor(store, 'fire').name, 'Fire', 'the browser shows what is STORED');
  assert.equal(cardFor(store, 'fire').enabled, false);
});

// ---------------------------------------------------------------------------
// updateEssence — the new fields follow the same presence semantics as colorToken
// ---------------------------------------------------------------------------

test('1036: updateEssence writes `enabled` and `propertyMacroUuid` only when PRESENT', async () => {
  const harness = makeEssenceStoreHarness({
    essences: [makeEssence({ id: 'fire', enabled: false, propertyMacroUuid: 'Macro.heat' })],
  });
  const store = await openStore(harness);

  await store.updateEssence('fire', { description: 'warm' });
  let stored = harness.system.essenceDefinitions[0];
  assert.equal(stored.enabled, false, 'an absent key leaves the stored value alone');
  assert.equal(stored.propertyMacroUuid, 'Macro.heat');

  await store.updateEssence('fire', { enabled: true, propertyMacroUuid: null });
  stored = harness.system.essenceDefinitions[0];
  assert.equal(stored.enabled, true);
  assert.equal(stored.propertyMacroUuid, null, 'an explicit null UNLINKS rather than no-opping');
});
