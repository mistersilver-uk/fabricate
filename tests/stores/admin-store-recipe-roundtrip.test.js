/**
 * THE named-field round-trip test (issue 643 §2b F2).
 *
 * Two recipes are driven through the whole chain, because the draft path has TWO
 * halves and the second one has no other guard:
 *
 *  1. `SILENT_RECIPE` — single-scope: sets, groups and result groups hang off the
 *     recipe itself.
 *  2. `MULTI_STEP_RECIPE` — `complex: true` with a real `steps[]`. A step's
 *     `ingredientSets[]` is the IDENTICAL `IngredientSet` shape (`Recipe._normalizeStep`
 *     builds it with `IngredientSet.fromJSON`) — the same `toolIds`, `essences`,
 *     `resultMapping` and per-option `tagMatch` — and `_buildRecipeList` projects
 *     `steps` WHOLESALE into the draft. The step-scope transformations in
 *     `CraftingSystemManagerRoot.svelte` (`handleEnterMultiStep`,
 *     `handleRevertToSingleStep`, `backfillScopeIds`, `trimScope`) genuinely move
 *     sets between recipe scope and step scope, so a lossy rewrite THERE would be
 *     invisible to a single-scope fixture and would ship green.
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

  // 4b. Single-step duration (issue 845). UNLIKE the silent fields above this one HAS a
  //     UI — the Overview Duration steppers — but the projection must still carry it or
  //     the editor seeds the control from `undefined` and renders "Instant" on every
  //     open. The persisted value is never lost (the shallow-merge floor restores it),
  //     so its loss is DISPLAY-only and is guarded against the projected row, not the
  //     byte-for-byte round trip.
  timeRequirement: { minutes: 0, hours: 2, days: 3, months: 0, years: 0 },

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

// The multi-step half of the same guard. Every silent field that has a per-SET or
// per-OPTION home is re-declared at STEP scope here, because `steps[].ingredientSets[]`
// is the same `IngredientSet` shape and the projection copies `steps` wholesale: a
// draft path that flattened, re-keyed or re-built a step's sets could drop exactly
// these and no screen would show it.
const MULTI_STEP_RECIPE = Object.freeze({
  id: 'r-steps',
  name: 'Sequence of Silence',
  description: 'A multi-step recipe carrying the same silent fields at STEP scope.',
  img: 'icons/scroll.webp',
  category: 'Potions',
  craftingSystemId: 'sys1',
  enabled: true,
  locked: false,

  // An explicit authoring flag — NOT derived. A multi-step recipe that lost it would
  // collapse back to the streamlined single-set editor on reload.
  complex: true,
  transferEffects: true,
  isVariable: true,

  steps: [
    {
      id: 'step-1',
      name: 'Macerate',
      description: 'Break the reagents down.',
      // Step-scope tools (distinct from the per-SET tools below and from the
      // recipe-level `toolIds`).
      toolIds: ['tool-mortar'],
      timeRequirement: { minutes: 30, hours: 0, days: 0, months: 0, years: 0 },
      ingredientSets: [
        {
          id: 'step-1-set-1',
          name: 'Macerate primary',
          essences: { fire: 1 },
          // Per-SET tools INSIDE a step: two nested scopes deep, and no editor at all.
          toolIds: ['tool-alembic'],
          resultMapping: ['step-1-group'],
          resultGroupId: 'step-1-group',
          ingredientGroups: [
            {
              id: 'step-1-grp',
              options: [
                {
                  id: 'step-1-ing-1',
                  quantity: 3,
                  match: { type: 'component', componentId: 'cmp-herb' },
                  extractEffects: true,
                  effectFilter: ['Poisoned'],
                },
                {
                  id: 'step-1-ing-2',
                  quantity: 1,
                  // tagMatch at STEP scope: the "or…" popover lands on this row too.
                  match: { type: 'tags', tags: ['herbal', 'rare'], tagMatch: 'all' },
                },
                {
                  id: 'step-1-ing-3',
                  quantity: 1,
                  match: { type: 'currency', unit: 'gp', amount: 5 },
                },
              ],
            },
          ],
        },
      ],
      resultGroups: [
        {
          id: 'step-1-group',
          name: 'Macerated pulp',
          results: [{ id: 'step-1-res', componentId: 'cmp-sludge', quantity: 1 }],
        },
      ],
    },
    {
      id: 'step-2',
      name: 'Distil',
      description: 'Draw the essence off.',
      toolIds: [],
      timeRequirement: { minutes: 0, hours: 2, days: 0, months: 0, years: 0 },
      ingredientSets: [
        {
          id: 'step-2-set-1',
          name: 'Distil primary',
          essences: { fire: 2 },
          toolIds: ['tool-alembic', 'tool-mortar'],
          resultMapping: ['step-2-group'],
          resultGroupId: 'step-2-group',
          ingredientGroups: [
            {
              id: 'step-2-grp',
              options: [
                {
                  id: 'step-2-ing-1',
                  quantity: 1,
                  match: { type: 'component', componentId: 'cmp-sludge' },
                },
              ],
            },
          ],
        },
      ],
      resultGroups: [
        {
          id: 'step-2-group',
          name: 'On success',
          results: [{ id: 'step-2-res', componentId: 'cmp-potion', quantity: 1 }],
        },
      ],
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
    recipeManager.recipes.set(MULTI_STEP_RECIPE.id, Recipe.fromJSON(MULTI_STEP_RECIPE));
    recipeManager.initialized = true;

    store = createAdminStore(createServices(recipeManager));
    await store.refresh();
  });

  function persisted(id = SILENT_RECIPE.id) {
    return recipeManager.getRecipe(id).toJSON();
  }

  function projectedRow(id = SILENT_RECIPE.id) {
    return (get(store.viewState).recipes || []).find((row) => row.id === id);
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
  //
  // ---------------------------------------------------------------------------
  // The MERGE FLOOR, named honestly.
  //
  // `complex`, `teaser`, `transferEffects`, `isVariable` and `outcomeRouting` are
  // TOP-LEVEL scalars, and `RecipeManager.updateRecipe` saves
  // `{ ...recipe.toJSON(), ...updates, id }` — a SHALLOW merge. A top-level key that
  // the draft never carried is therefore restored from the persisted record, so these
  // assertions pin `RecipeManager`'s merge floor, NOT the Studio's draft path: they
  // cannot fail from a projection or draft-clone regression (three of the five —
  // `teaser`, `transferEffects`, `isVariable` — are not even in `_buildRecipeList`'s
  // projection today, and still survive).
  //
  // They are kept because the merge floor is itself worth pinning — a `set()` that
  // replaced rather than merged would silently null every one of them — but the test
  // says what it guards. What guards the DRAFT path for nested scope is the per-set /
  // per-option / per-step group below, where the draft really does carry the values.
  // ---------------------------------------------------------------------------
  it('RecipeManager.updateRecipe restores top-level complex/teaser/transferEffects/isVariable/outcomeRouting from the persisted record (the shallow-merge floor, not the draft path)', async () => {
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

  // The other half of that story: the merge floor holds even when the draft drops the
  // key entirely. This is the assertion the test above was silently making.
  it('restores a top-level silent field even when the draft omits the key outright', async () => {
    const draft = cloneRecipeDraft(projectedRow());
    delete draft.complex;
    delete draft.outcomeRouting;

    await store.updateRecipe(draft.id, { ...draft, name: 'Merge floor' }, { allowIncomplete: true });

    const after = persisted();
    assert.equal(after.complex, true, 'a missing top-level key falls back to the persisted value');
    assert.deepEqual(after.outcomeRouting, { success: 'grp-success' });
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

  // The single-step DURATION display guard (issue 845). Unlike the silent fields above,
  // this loss never reaches persistence (the shallow-merge floor restores a top-level
  // key the draft omits), so the byte-for-byte round trip cannot see it — the craft time
  // keeps applying. The defect is that `_buildRecipeList` dropped `timeRequirement` from
  // the projected row, so the editor's draft seeded the Overview Duration steppers from
  // `undefined` and rendered "Instant". This asserts the projection carries it.
  it('projects the single-step recipe timeRequirement so the Overview Duration steppers seed (issue 845)', () => {
    const row = projectedRow();
    assert.ok(row, 'the recipe is projected into the browser list');
    assert.deepEqual(
      row.timeRequirement,
      { minutes: 0, hours: 2, days: 3, months: 0, years: 0 },
      'the projected row carries the persisted duration — without it the Duration control resets to Instant on every editor open'
    );
  });

  // -------------------------------------------------------------------------
  // The MULTI-STEP half. `steps[].ingredientSets[]` is the same `IngredientSet`
  // shape as the recipe's own, and `steps` is a NESTED array the shallow merge in
  // `RecipeManager.updateRecipe` cannot repair: once the draft carries a `steps`
  // key at all, whatever it holds REPLACES the persisted array wholesale. So unlike
  // the top-level scalars above, every assertion here really does guard the draft
  // path — projection → clone → patch → save.
  // -------------------------------------------------------------------------
  describe('a complex, multi-step recipe (the step-scope draft path)', () => {
    function stepDraft(patch) {
      return patchRecipeDraft(cloneRecipeDraft(projectedRow(MULTI_STEP_RECIPE.id)), patch);
    }

    it('survives load -> edit an unrelated field -> save byte-for-byte', async () => {
      const before_ = persisted(MULTI_STEP_RECIPE.id);

      const draft = stepDraft({ name: 'Sequence of Silence (revised)' });
      const saved = await store.updateRecipe(draft.id, draft, { allowIncomplete: true });
      assert.equal(saved, true, 'the save succeeds');

      assert.deepEqual(
        persisted(MULTI_STEP_RECIPE.id),
        { ...before_, name: 'Sequence of Silence (revised)' },
        'no step, set, group, option or result field moved'
      );
    });

    it('preserves per-STEP toolIds, timeRequirement and step identity', async () => {
      const draft = stepDraft({ description: 'Rewritten.' });
      await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

      const steps = persisted(MULTI_STEP_RECIPE.id).steps;
      assert.equal(steps.length, 2, 'both steps survive — a flattening rewrite drops one');
      assert.deepEqual(
        steps.map((step) => [step.id, step.name]),
        [
          ['step-1', 'Macerate'],
          ['step-2', 'Distil'],
        ],
        'step ids and names survive in order (order is load-bearing: steps craft in sequence)'
      );
      assert.deepEqual(steps[0].toolIds, ['tool-mortar'], 'step-scope tools survive');
      assert.deepEqual(steps[1].toolIds, [], 'a step with no tools stays empty rather than inheriting');
      assert.equal(steps[0].timeRequirement.minutes, 30, 'per-step duration survives');
      assert.equal(steps[1].timeRequirement.hours, 2);
    });

    it('preserves per-SET toolIds, essences and resultMapping INSIDE a step', async () => {
      const draft = stepDraft({ img: 'icons/other.webp' });
      await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

      const [first, second] = persisted(MULTI_STEP_RECIPE.id).steps;
      const firstSet = first.ingredientSets[0];
      const secondSet = second.ingredientSets[0];

      assert.deepEqual(
        firstSet.toolIds,
        ['tool-alembic'],
        'per-SET tools inside a step have no editor at ANY scope — round-trip is their only guard'
      );
      assert.deepEqual(secondSet.toolIds, ['tool-alembic', 'tool-mortar']);
      assert.deepEqual(firstSet.essences, { fire: 1 }, 'the per-set essence requirement survives');
      assert.deepEqual(secondSet.essences, { fire: 2 });
      assert.deepEqual(firstSet.resultMapping, ['step-1-group'], 'the variable-output mapping survives');
      assert.equal(firstSet.resultGroupId, 'step-1-group', 'set -> result-group routing survives');
      assert.equal(secondSet.resultGroupId, 'step-2-group');
    });

    it("preserves a step option's tagMatch: 'all', extractEffects/effectFilter and currency match", async () => {
      const draft = stepDraft({ category: 'general' });
      await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

      const options = persisted(MULTI_STEP_RECIPE.id).steps[0].ingredientSets[0].ingredientGroups[0]
        .options;
      const component = options.find((option) => option.match.type === 'component');
      const tags = options.find((option) => option.match.type === 'tags');
      const currency = options.find((option) => option.match.type === 'currency');

      assert.equal(tags.match.tagMatch, 'all', "a step-scoped tagMatch: 'all' survives");
      assert.deepEqual(tags.match.tags, ['herbal', 'rare']);
      assert.equal(component.quantity, 3, 'the option quantity survives');
      assert.equal(component.extractEffects, true);
      assert.deepEqual(component.effectFilter, ['Poisoned']);
      assert.deepEqual(currency.match, { type: 'currency', unit: 'gp', amount: 5 });
    });

    it("preserves each step's result groups and their items", async () => {
      const draft = stepDraft({ name: 'Renamed again' });
      await store.updateRecipe(draft.id, draft, { allowIncomplete: true });

      const [first, second] = persisted(MULTI_STEP_RECIPE.id).steps;
      assert.equal(first.resultGroups[0].id, 'step-1-group');
      assert.equal(first.resultGroups[0].results[0].componentId, 'cmp-sludge');
      assert.equal(second.resultGroups[0].results[0].componentId, 'cmp-potion');
      assert.equal(second.resultGroups[0].results[0].quantity, 1);
    });

    it('survives a SECOND round trip at step scope', async () => {
      const first = stepDraft({ name: 'Pass one' });
      await store.updateRecipe(first.id, first, { allowIncomplete: true });
      const afterFirst = persisted(MULTI_STEP_RECIPE.id);

      const second = stepDraft({ name: 'Pass two' });
      await store.updateRecipe(second.id, second, { allowIncomplete: true });

      assert.deepEqual(
        persisted(MULTI_STEP_RECIPE.id),
        { ...afterFirst, name: 'Pass two' },
        'the second pass moves nothing but the name either'
      );
    });
  });
});
