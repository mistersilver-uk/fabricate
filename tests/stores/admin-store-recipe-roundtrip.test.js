/**
 * THE named-field round-trip test (issue 643 §2b F2).
 *
 * Seven groups of fields are persisted and runtime-honoured but have **no UI
 * affordance at all**. They survive only by round-trip, and nothing on screen would
 * reveal their loss:
 *
 *   - `Recipe.complex`                                  (a real authoring flag)
 *   - `IngredientSet.toolIds`                           (per-SET tools; the Tools tab is recipe-/step-scope only)
 *   - `Ingredient.match.tagMatch: 'all'`                (a control DOES exist — and it sits exactly where the "or..." popover lands)
 *   - a reserved `role: 'failure'` result group         (alchemy Simple)
 *   - `Ingredient.extractEffects` / `effectFilter`
 *   - `Recipe.transferEffects`, `Recipe.teaser`
 *   - `Recipe.isVariable` + `IngredientSet.resultMapping`
 *   - `Recipe.outcomeRouting`                           (legacy map; validated, not read by the live routing path)
 *   - a `currency` ingredient option
 *
 * The Recipe Studio rebuilt the draft/patch path for ingredients, sets, groups and
 * steps — the one realistic vector for dropping any of them. A dropped field here is
 * invisible until a GM's recipe silently stops working.
 *
 * So this drives the REAL chain end to end, with no stand-in for the parts that could
 * lose a field:
 *
 *   real Recipe model  ->  real RecipeManager  ->  the store's real recipe projection
 *   ->  the ROOT's real draft mechanics (a JSON deep clone + a shallow patch spread,
 *       exactly as `cloneRecipeDraft` / `patchRecipeDraft` do)
 *   ->  the store's real `updateRecipe`  ->  back out through `Recipe.toJSON()`.
 *
 * The assertion is byte-for-byte: the persisted JSON after "load, edit an unrelated
 * field, save" must equal the original with ONLY that field changed.
 */
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');
const { RecipeManager } = await import('../../src/systems/RecipeManager.js');
const { Recipe } = await import('../../src/models/Recipe.js');

// Every silent field, on one recipe. A currency option, a per-set toolIds, a
// tagMatch: 'all' tag alternative, effect extraction, a variable output with its
// result mapping, a legacy outcomeRouting map, a teaser, and the reserved failure
// group all coexist here on purpose: the point is that ONE unrelated edit must not
// disturb ANY of them.
const SILENT_RECIPE = Object.freeze({
  id: 'r-silent',
  name: 'Philtre of Silence',
  description: 'A recipe carrying every field with no UI.',
  img: 'icons/potion.webp',
  category: 'Potions',
  craftingSystemId: 'sys1',
  enabled: true,
  locked: false,

  // 1. A real persisted authoring flag (NOT derivable from resolutionMode).
  complex: true,

  // 2. No affordance anywhere. `teaser` is a STRUCTURED block (enabled, hiddenFields,
  //    revealThreshold, teaserDescription), not a string — and every field of it is
  //    unreachable from the UI.
  teaser: {
    enabled: true,
    hiddenFields: ['ingredients', 'tools'],
    revealThreshold: 40,
    teaserDescription: 'Something is missing.',
  },
  transferEffects: true,

  // 3. Variable output + the per-set mapping it drives.
  isVariable: true,

  // 4. The legacy routing map: validated on save, not read by the live routing path.
  outcomeRouting: { success: 'grp-success' },

  ingredientSets: [
    {
      id: 'set-1',
      name: 'Primary',
      essences: { fire: 2 },
      // 5. Per-SET tools. The Tools tab is recipe-/step-scope only, so this has no
      //    editor at all.
      toolIds: ['tool-mortar', 'tool-alembic'],
      // 6. resultMapping — meaningless without isVariable, and vice versa.
      resultMapping: ['grp-success'],
      resultGroupId: 'grp-success',
      ingredientGroups: [
        {
          id: 'grp-a',
          options: [
            {
              id: 'ing-1',
              quantity: 2,
              match: { type: 'component', componentId: 'cmp-herb' },
              // 7. Effect extraction, with a filter.
              extractEffects: true,
              effectFilter: ['Poisoned'],
            },
            {
              id: 'ing-2',
              quantity: 1,
              // 8. tagMatch: 'all' — the highest-risk field in the set, because its
              //    control sits exactly where the new "or..." popover lands.
              match: { type: 'tags', tags: ['herbal', 'rare'], tagMatch: 'all' },
            },
            {
              id: 'ing-3',
              quantity: 1,
              // 9. A currency option.
              match: { type: 'currency', unit: 'gp', amount: 25 },
            },
          ],
        },
      ],
    },
  ],

  resultGroups: [
    {
      id: 'grp-success',
      name: 'On success',
      results: [{ id: 'res-1', componentId: 'cmp-potion', quantity: 1 }],
    },
    {
      // 10. The reserved alchemy-Simple failure group — the ONLY failure result group
      //     in the model. (There is no crit/success/fail tier vocabulary.)
      id: 'grp-failure',
      name: 'On a failed check',
      role: 'failure',
      results: [{ id: 'res-2', componentId: 'cmp-sludge', quantity: 1 }],
    },
  ],
});

function createSystem() {
  return {
    id: 'sys1',
    name: 'System One',
    description: '',
    resolutionMode: 'routedByIngredients',
    features: { essences: true },
    categories: ['Potions'],
    itemTags: ['herbal', 'rare'],
    essenceDefinitions: [{ id: 'fire', name: 'Fire' }],
    items: [
      { id: 'cmp-herb', name: 'Herb', img: 'icons/herb.webp' },
      { id: 'cmp-potion', name: 'Potion', img: 'icons/potion.webp' },
      { id: 'cmp-sludge', name: 'Sludge', img: 'icons/sludge.webp' },
    ],
    requirements: { time: { enabled: false }, currency: { enabled: true, units: [{ id: 'gp' }] } },
    craftingCheck: {},
    recipeVisibility: { listMode: 'global' },
    recipeItemDefinitions: [],
    tools: [
      { id: 'tool-mortar', label: 'Mortar', componentId: 'cmp-herb' },
      { id: 'tool-alembic', label: 'Alembic', componentId: 'cmp-herb' },
    ],
  };
}

function createServices(recipeManager) {
  const systems = [createSystem()];
  return {
    getSetting: (key) => (key === 'lastManagedCraftingSystem' ? 'sys1' : ''),
    setSetting: async () => {},
    getCraftingSystemManager: () => ({
      getSystems: () => systems,
      getSystem: (id) => systems.find((system) => system.id === id) || null,
      getItems: (id) => systems.find((system) => system.id === id)?.items || [],
    }),
    getRecipeManager: () => recipeManager,
    getScriptMacros: () => [],
    getSceneOptions: () => [],
    getWorldUsers: () => [],
    getAccessCharacterActors: () => [],
    localize: (key) => key,
    notify: { info: () => {}, warn: () => {}, error: () => {} },
  };
}

// The root's draft mechanics, verbatim: `cloneRecipeDraft` is a JSON deep clone of the
// PROJECTED row, and `patchRecipeDraft` a shallow spread. Reproducing them here (rather
// than mounting the whole manager) keeps the test focused on the one thing that can
// lose a field — the projection -> clone -> patch -> save round trip.
function cloneRecipeDraft(source) {
  return source ? JSON.parse(JSON.stringify(source)) : null;
}
function patchRecipeDraft(draft, patch) {
  return { ...draft, ...patch };
}

describe('the named-field round trip (issue 643 §2b F2)', () => {
  let recipeManager;
  let store;
  let originalGame;
  let originalUi;

  before(() => {
    originalGame = globalThis.game;
    originalUi = globalThis.ui;
  });

  after(() => {
    globalThis.game = originalGame;
    globalThis.ui = originalUi;
  });

  beforeEach(async () => {
    // RecipeManager._assertGM + save() reach for the Foundry globals; save() is a
    // settings write we neutralise, because persistence is not what is under test —
    // the SHAPE that reaches it is.
    globalThis.game = {
      user: { isGM: true },
      settings: { get: () => [], set: async () => {} },
    };
    globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };

    recipeManager = new RecipeManager();
    recipeManager.recipes.set(SILENT_RECIPE.id, Recipe.fromJSON(SILENT_RECIPE));
    recipeManager.initialized = true;

    store = createAdminStore(createServices(recipeManager));
    await store.refresh();
  });

  function persisted() {
    return recipeManager.getRecipe(SILENT_RECIPE.id).toJSON();
  }

  function projectedRow() {
    return (get(store.viewState).recipes || []).find((row) => row.id === SILENT_RECIPE.id);
  }

  it('survives load -> edit an unrelated field -> save byte-for-byte', async () => {
    const before_ = persisted();

    // 1. LOAD: the editor seeds its draft from the store's projected row.
    const row = projectedRow();
    assert.ok(row, 'the recipe is projected into the browser list');
    const draft = cloneRecipeDraft(row);

    // 2. EDIT something entirely unrelated to any silent field.
    const edited = patchRecipeDraft(draft, { name: 'Philtre of Silence (revised)' });

    // 3. SAVE the whole draft, exactly as the editor's Save does.
    const saved = await store.updateRecipe(edited.id, edited, { allowIncomplete: true });
    assert.equal(saved, true, 'the save succeeds');

    // 4. The persisted JSON differs ONLY by the field we edited.
    const after = persisted();
    assert.equal(after.name, 'Philtre of Silence (revised)', 'the edit landed');
    assert.deepEqual(
      after,
      { ...before_, name: 'Philtre of Silence (revised)' },
      'no other persisted field moved — this is the whole point of the test'
    );
  });

  // The deepEqual above would catch every one of these, but it would fail as one
  // opaque diff. These name the field, so a regression reports WHICH silent field the
  // draft path dropped.
  it('preserves Recipe.complex, teaser, transferEffects, isVariable and outcomeRouting', async () => {
    const draft = patchRecipeDraft(cloneRecipeDraft(projectedRow()), { description: 'Rewritten.' });
    await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

    const after = persisted();
    assert.equal(after.complex, true, 'complex is a real authoring flag, not derived');
    assert.deepEqual(
      after.teaser,
      {
        enabled: true,
        hiddenFields: ['ingredients', 'tools'],
        revealThreshold: 40,
        teaserDescription: 'Something is missing.',
      },
      'every field of the teaser block has no UI and survives by round-trip'
    );
    assert.equal(after.transferEffects, true, 'transferEffects has no UI');
    assert.equal(after.isVariable, true, 'isVariable has no UI');
    assert.deepEqual(after.outcomeRouting, { success: 'grp-success' }, 'the legacy routing map survives');
  });

  it('preserves per-SET toolIds and resultMapping (neither has any editor)', async () => {
    const draft = patchRecipeDraft(cloneRecipeDraft(projectedRow()), { img: 'icons/other.webp' });
    await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

    const set = persisted().ingredientSets[0];
    assert.deepEqual(
      set.toolIds,
      ['tool-mortar', 'tool-alembic'],
      'per-set tools survive — the Tools tab is recipe-/step-scope only, so nothing else guards them'
    );
    assert.deepEqual(set.resultMapping, ['grp-success'], 'the variable-output mapping survives');
    assert.deepEqual(set.essences, { fire: 2 }, 'the per-set essence requirement survives');
  });

  it("preserves tagMatch: 'all', extractEffects/effectFilter, and the currency option", async () => {
    const draft = patchRecipeDraft(cloneRecipeDraft(projectedRow()), { category: 'general' });
    await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

    const options = persisted().ingredientSets[0].ingredientGroups[0].options;
    const component = options.find((option) => option.match.type === 'component');
    const tags = options.find((option) => option.match.type === 'tags');
    const currency = options.find((option) => option.match.type === 'currency');

    assert.equal(
      tags.match.tagMatch,
      'all',
      "tagMatch: 'all' survives — its control sits exactly where the new \"or...\" popover lands"
    );
    assert.deepEqual(tags.match.tags, ['herbal', 'rare'], 'the tag list survives');
    assert.equal(component.extractEffects, true, 'extractEffects survives');
    assert.deepEqual(component.effectFilter, ['Poisoned'], 'effectFilter survives');
    assert.deepEqual(
      currency.match,
      { type: 'currency', unit: 'gp', amount: 25 },
      'the currency option survives with its unit and amount'
    );
  });

  it("preserves the reserved role: 'failure' result group", async () => {
    const draft = patchRecipeDraft(cloneRecipeDraft(projectedRow()), { name: 'Renamed again' });
    await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

    const groups = persisted().resultGroups;
    const failure = groups.find((group) => group.role === 'failure');
    assert.ok(failure, "the reserved failure group survives — it is the ONLY failure group in the model");
    assert.equal(failure.id, 'grp-failure');
    // (`Result.toJSON` also emits `itemUuid: null`; assert the authored fields.)
    assert.equal(failure.results.length, 1);
    assert.equal(failure.results[0].componentId, 'cmp-sludge');
    assert.equal(failure.results[0].quantity, 1);
    // And it is not confused with a success group: the success group has no role.
    const success = groups.find((group) => group.id === 'grp-success');
    assert.equal(success.role, undefined, 'a success group carries no role — there is no tier vocabulary here');
  });

  it('survives a SECOND round trip (an edit on top of an already round-tripped recipe)', async () => {
    // A single pass can pass by luck; a field dropped on load and re-derived on save
    // would look stable once. Two passes rule that out.
    const first = patchRecipeDraft(cloneRecipeDraft(projectedRow()), { name: 'Pass one' });
    await store.updateRecipe(first.id, first, { allowIncomplete: true });
    const afterFirst = persisted();

    const second = patchRecipeDraft(cloneRecipeDraft(projectedRow()), { name: 'Pass two' });
    await store.updateRecipe(second.id, second, { allowIncomplete: true });

    assert.deepEqual(
      persisted(),
      { ...afterFirst, name: 'Pass two' },
      'the second pass moves nothing but the name either'
    );
  });
});
