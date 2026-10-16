/**
 * A result's fixed-or-rolled amount through the real `createAdminStore` (issue 1516): a recipe
 * result at recipe and at step scope, and a gathering task result. Each edit is the payload the
 * result row forwards, merged by the row's own adapter (`fromValue`), exactly as the editor does.
 * The dice double seeds its answers per formula: the maxima the save path's floor reads and the
 * totals the award rolls.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { get } from 'svelte/store';

import { fromValue, toValue } from '../../src/ui/svelte/apps/manager/recipe/pickerRowKinds.js';
import { createServices, makeSystem } from '../helpers/adminStoreServices.js';
import { seededRollClass } from '../helpers/seededRoll.js';

const { createAdminStore } = await import('../../src/ui/svelte/stores/adminStore.js');
const { RecipeManager } = await import('../../src/systems/RecipeManager.js');
const { Recipe } = await import('../../src/models/Recipe.js');
const { applyBulkEditToRecipes } = await import('../../src/systems/manager/bulkEdits.js');
const { resolveRolledAmount } = await import('../../src/systems/rolledAmountResolver.js');
const { ResolutionModeService } = await import('../../src/systems/ResolutionModeService.js');

const { Roll: SEEDED_ROLL } = seededRollClass({
  maxima: { '1d4+1': 5, 0: 0 },
  totals: { '1d4+1': 4 },
  unparsable: ['max(, 2)'],
});

const ingredientSet = (id) => ({
  id,
  ingredientGroups: [
    {
      id: `${id}-grp`,
      options: [{ quantity: 1, match: { type: 'component', componentId: 'cmp-herb' } }],
    },
  ],
});

const FLAT = Object.freeze({
  id: 'r-flat',
  name: 'Healing Draught',
  craftingSystemId: 'sys1',
  category: 'general',
  enabled: false,
  ingredientSets: [ingredientSet('set-1')],
  resultGroups: [
    {
      id: 'grp-1',
      name: 'On success',
      results: [{ id: 'res-1', componentId: 'cmp-potion', quantity: 3 }],
    },
  ],
});

const STEPPED = Object.freeze({
  id: 'r-steps',
  name: 'Sequence',
  craftingSystemId: 'sys1',
  category: 'general',
  enabled: false,
  complex: true,
  steps: [
    {
      id: 'step-1',
      name: 'Distil',
      ingredientSets: [ingredientSet('step-set')],
      resultGroups: [
        {
          id: 'step-grp',
          name: 'Out',
          results: [{ id: 'step-res', componentId: 'cmp-potion', quantity: 2 }],
        },
      ],
    },
  ],
});

/** Where a scope's one result lives on a draft or a persisted recipe. */
const SCOPES = Object.freeze({
  recipe: { recipe: FLAT, groups: (recipe) => recipe.resultGroups },
  step: { recipe: STEPPED, groups: (recipe) => recipe.steps[0].resultGroups },
});

/** The row's own edit: `toValue`, the forwarded change, and `fromValue` merging it back. */
function rowEdit(result, change) {
  return fromValue(result, { ...toValue(result), ...change });
}

let previous;
before(() => {
  previous = {
    foundry: globalThis.foundry,
    game: globalThis.game,
    ui: globalThis.ui,
    Roll: globalThis.Roll,
  };
  Object.assign(globalThis, { Roll: SEEDED_ROLL });
});
after(() => {
  Object.assign(globalThis, previous);
});

describe('a recipe result’s rolled amount through the admin store', () => {
  let recipeManager;
  let store;
  let errors;

  async function loadStore() {
    store = createAdminStore(
      createServices(makeSystem({ items: [{ id: 'cmp-herb' }, { id: 'cmp-potion' }] }), [], [], {
        getRecipeManager: () => recipeManager,
        getAccessCharacterActors: () => [],
        notify: {
          info: () => {},
          warn: () => {},
          error: (message) => {
            errors.push(message);
          },
        },
        getCraftingSystemManager: () => ({
          getSystems: () => [makeSystem()],
          getSystem: () => makeSystem(),
          getItems: () => [],
          applyBulkEditToRecipes: (systemId, ids, edit) =>
            applyBulkEditToRecipes(
              {
                assertGM: () => {},
                getSystem: () => makeSystem(),
                recipeManager: () => recipeManager,
              },
              systemId,
              ids,
              edit
            ),
        }),
      })
    );
    await store.refresh();
  }

  beforeEach(async () => {
    let seq = 0;
    Object.assign(globalThis, {
      foundry: { utils: { randomID: () => `rid-${(seq += 1)}` } },
      game: { user: { isGM: true }, settings: { get: () => [], set: async () => {} } },
      ui: { notifications: { info: () => {}, warn: () => {}, error: () => {} } },
    });
    errors = [];
    recipeManager = new RecipeManager();
    for (const recipe of [FLAT, STEPPED])
      recipeManager.recipes.set(recipe.id, Recipe.fromJSON(recipe));
    recipeManager.initialized = true;
    await loadStore();
  });

  const persisted = (id) => recipeManager.getRecipe(id).toJSON();
  const draftOf = (id) =>
    JSON.parse(JSON.stringify(get(store.viewState).recipes.find((row) => row.id === id)));

  for (const [scope, { recipe, groups }] of Object.entries(SCOPES)) {
    /** A draft of `recipe` whose one result is replaced by `edit(result)`. */
    const editedDraft = (edit) => {
      const draft = draftOf(recipe.id);
      const [group] = groups(draft);
      group.results = [edit(group.results[0])];
      return draft;
    };
    const savedResult = () => groups(persisted(recipe.id))[0].results[0];

    it(`${scope}: '1d4+1' survives save → reload → unrelated edit → save byte for byte`, async () => {
      const typed = editedDraft((result) => rowEdit(result, { quantityFormula: '1d4+1' }));
      assert.equal(await store.updateRecipe(recipe.id, typed, { allowIncomplete: true }), true);
      const saved = persisted(recipe.id);
      assert.equal(groups(saved)[0].results[0].quantityFormula, '1d4+1');

      // Reload: a fresh manager hydrates the persisted JSON, and a fresh store projects it.
      recipeManager = new RecipeManager();
      recipeManager.recipes.set(recipe.id, Recipe.fromJSON(saved));
      recipeManager.initialized = true;
      await loadStore();
      const renamed = { ...draftOf(recipe.id), name: `${recipe.name} (revised)` };
      assert.equal(await store.updateRecipe(recipe.id, renamed, { allowIncomplete: true }), true);
      assert.deepEqual(persisted(recipe.id), { ...saved, name: `${recipe.name} (revised)` });
    });

    it(`${scope}: Rolled opened and left empty saves no formula key`, async () => {
      // A blank expression is the most an opened-but-empty field can forward.
      const blank = editedDraft((result) => rowEdit(result, { quantityFormula: '' }));
      assert.equal(Object.hasOwn(groups(blank)[0].results[0], 'quantityFormula'), false);
      assert.equal(await store.updateRecipe(recipe.id, blank, { allowIncomplete: true }), true);
      assert.equal(Object.hasOwn(savedResult(), 'quantityFormula'), false);
    });

    it(`${scope}: Rolled → Fixed removes the key and keeps quantity`, async () => {
      const typed = editedDraft((result) => rowEdit(result, { quantityFormula: '1d4+1' }));
      await store.updateRecipe(recipe.id, typed, { allowIncomplete: true });
      const fixed = editedDraft((result) => rowEdit(result, { quantityFormula: undefined }));
      assert.equal(Object.hasOwn(groups(fixed)[0].results[0], 'quantityFormula'), false);
      assert.equal(await store.updateRecipe(recipe.id, fixed, { allowIncomplete: true }), true);
      assert.equal(Object.hasOwn(savedResult(), 'quantityFormula'), false);
      assert.equal(savedResult().quantity, groups(recipe)[0].results[0].quantity);
    });

    it(`${scope}: an unrollable or never-positive formula is refused, complete or not`, async () => {
      const before_ = persisted(recipe.id);
      for (const quantityFormula of ['max(, 2)', '0']) {
        const bad = editedDraft((result) => rowEdit(result, { quantityFormula }));
        for (const allowIncomplete of [true, false]) {
          assert.equal(
            await store.updateRecipe(recipe.id, bad, { allowIncomplete }),
            false,
            `${quantityFormula} is refused, never saved as incomplete`
          );
        }
      }
      assert.deepEqual(persisted(recipe.id), before_, 'nothing was written');
      assert.equal(errors.length, 4, 'and each refusal told the GM');
    });
  }

  it('duplicate and bulk edit keep the formula', async () => {
    const draft = draftOf(FLAT.id);
    draft.resultGroups[0].results = [
      rowEdit(draft.resultGroups[0].results[0], { quantityFormula: '1d4+1' }),
    ];
    await store.updateRecipe(FLAT.id, draft, { allowIncomplete: true });

    assert.equal(await store.duplicateRecipe(FLAT.id), true);
    const copy = recipeManager.getRecipes().find((recipe) => recipe.name === `${FLAT.name} (Copy)`);
    assert.equal(copy.toJSON().resultGroups[0].results[0].quantityFormula, '1d4+1');

    await store.selectSystem('sys1');
    const outcome = await store.applyRecipeBulkEdit([FLAT.id], { category: 'Potions' });
    assert.ok(outcome, 'the bulk edit applied');
    const bulked = persisted(FLAT.id);
    assert.equal(bulked.category, 'Potions', 'the bulk edit landed');
    assert.equal(bulked.resultGroups[0].results[0].quantityFormula, '1d4+1');
  });

  it('the saved payload awards a rolled amount, and a progressive stage still drops it', async () => {
    const draft = draftOf(FLAT.id);
    draft.resultGroups[0].results = [
      rowEdit(draft.resultGroups[0].results[0], { quantityFormula: '1d4+1' }),
    ];
    await store.updateRecipe(FLAT.id, draft, { allowIncomplete: true });
    const saved = persisted(FLAT.id);
    const [result] = saved.resultGroups[0].results;

    const system = makeSystem({
      resolutionMode: 'progressive',
      components: [{ id: 'cmp-potion', difficulty: 1 }],
      craftingCheck: { enabled: true, progressive: { awardMode: 'equal' } },
    });
    const service = new ResolutionModeService({ getSystem: () => system });
    const step = { id: 'implicit', resultGroups: saved.resultGroups };
    const routed = service.resolveResultGroups({ recipe: saved, step, checkResult: { value: 5 } });
    const [stage] = routed.groups[0].results;
    assert.equal(stage.quantityFormula, null, 'a progressive stage awards one, never a roll');

    system.resolutionMode = 'simple';
    const plain = service.resolveResultGroups({ recipe: saved, step, checkResult: { value: 5 } });
    const [awarded] = plain.groups[0].results;
    assert.equal(awarded.quantityFormula, '1d4+1', 'every other mode hands the formula on');
    const roll = await resolveRolledAmount(awarded, null, { Roll: SEEDED_ROLL });
    assert.equal(roll.amount, 4);
    assert.deepEqual(roll.rolled, { formula: result.quantityFormula, total: 4 });
  });
});

describe('a gathering task result’s rolled amount through the admin store', () => {
  let gatheringConfig;
  let writes;
  let errors;

  const TASK = Object.freeze({
    id: 'task-straight',
    name: 'Mine ore',
    resolutionMode: 'straight',
    dropRows: [],
    resultGroups: [
      { id: 'results', name: 'Ore', results: [{ id: 'ore', componentId: 'ore', quantity: 3 }] },
    ],
  });

  async function loadStore() {
    const store = createAdminStore(
      createServices(makeSystem({ features: { gathering: true } }), [], [], {
        getSetting: (key) => (key === 'gatheringConfig' ? gatheringConfig : ''),
        setSetting: async (key, value) => {
          if (key !== 'gatheringConfig') return;
          writes += 1;
          gatheringConfig = structuredClone(value);
        },
        notify: {
          info: () => {},
          warn: () => {},
          error: (message) => {
            errors.push(message);
          },
        },
      })
    );
    await store.selectSystem('sys1');
    return store;
  }

  const savedTask = () => gatheringConfig.systems.sys1.tasks[0];
  const draftOf = (store) =>
    structuredClone(get(store.viewState).gatheringConfig.systems.sys1.tasks[0]);
  /** The editor's `resultGroups` patch with the one result replaced by the row's edit. */
  const resultPatch = (task, change) => ({
    resultGroups: [
      { ...task.resultGroups[0], results: [rowEdit(task.resultGroups[0].results[0], change)] },
    ],
  });

  beforeEach(() => {
    Object.assign(globalThis, {
      foundry: { utils: { randomID: () => 'rid' } },
      game: { user: { isGM: true }, settings: { get: () => undefined, set: async () => {} } },
    });
    gatheringConfig = { systems: { sys1: { tasks: [structuredClone(TASK)] } } };
    writes = 0;
    errors = [];
  });

  it(`'1d4+1' survives save → reload → unrelated edit → save byte for byte`, async () => {
    let store = await loadStore();
    const patch = resultPatch(draftOf(store), { quantityFormula: '1d4+1' });
    assert.equal(await store.updateGatheringLibraryTask('sys1', TASK.id, patch), true);
    const saved = structuredClone(savedTask());
    assert.equal(saved.resultGroups[0].results[0].quantityFormula, '1d4+1');

    store = await loadStore();
    assert.equal(
      await store.updateGatheringLibraryTask('sys1', TASK.id, { name: 'Mine rich ore' }),
      true
    );
    assert.deepEqual(savedTask(), { ...saved, name: 'Mine rich ore' });
  });

  it('a blank expression writes no key, and Rolled → Fixed removes it and keeps quantity', async () => {
    const store = await loadStore();
    const blank = resultPatch(draftOf(store), { quantityFormula: '' });
    assert.equal(Object.hasOwn(blank.resultGroups[0].results[0], 'quantityFormula'), false);
    await store.updateGatheringLibraryTask('sys1', TASK.id, blank);
    assert.equal(Object.hasOwn(savedTask().resultGroups[0].results[0], 'quantityFormula'), false);
    await store.updateGatheringLibraryTask(
      'sys1',
      TASK.id,
      resultPatch(draftOf(store), { quantityFormula: '1d4+1' })
    );
    await store.updateGatheringLibraryTask(
      'sys1',
      TASK.id,
      resultPatch(draftOf(store), { quantityFormula: undefined })
    );
    const [result] = savedTask().resultGroups[0].results;
    assert.equal(Object.hasOwn(result, 'quantityFormula'), false);
    assert.equal(result.quantity, 3);
  });

  it('an unrollable or never-positive formula is refused and nothing is written', async () => {
    const store = await loadStore();
    for (const quantityFormula of ['max(, 2)', '0']) {
      const patch = resultPatch(draftOf(store), { quantityFormula });
      assert.equal(
        await store.updateGatheringLibraryTask('sys1', TASK.id, patch),
        false,
        quantityFormula
      );
    }
    assert.equal(writes, 0);
    assert.deepEqual(savedTask(), TASK);
    assert.equal(errors.length, 2, 'and each refusal told the GM');
  });
});
