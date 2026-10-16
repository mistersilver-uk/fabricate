/**
 * A recipe whose ingredient group asks for an essence lists as craftable only when held
 * carriers cover it (issue 2318): the browse row and the hydrated detail agree, through the
 * production app, facades and presenters.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

test('an essence option gates the browse row as it gates the detail', async (t) => {
  await withFabricateLifecycleReplay(async ({ world, loadModule }) => {
    const { SvelteFabricateApp: App } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
    const { Recipe } = await loadModule('/src/models/Recipe.js');
    const f = world.fabricate;
    const actor = world.actorList[0];
    const system = f.craftingSystemManager.getSystem('lab-smithing');
    await f.setCraftingComponentSourceIds([actor.id]);
    const ore = actor.items.find((item) => item.name === 'Iron Ore');
    const app = new App({ actorId: actor.id });
    const services = app._buildServices();
    const sources = { componentSourceActorIds: [actor.id] };
    let serial = 0;

    // A recipe whose one group's one option asks for `amount` of `essenceId`.
    function essenceRecipe(essenceId, amount) {
      const id = `essence-option-${++serial}`;
      const recipe = new Recipe({
        id,
        name: 'Essence draught',
        craftingSystemId: system.id,
        enabled: true,
        toolIds: [],
        ingredientSets: [
          {
            id: `${id}-set`,
            ingredientGroups: [
              { id: `${id}-group`, options: [{ match: { type: 'essence', essenceId, amount } }] },
            ],
          },
        ],
        resultGroups: [
          {
            id: `${id}-result`,
            name: 'Ingot',
            results: [{ id: `${id}-ingot`, componentId: 'sm-iron-ingot', quantity: 1 }],
          },
        ],
      });
      f.recipeManager.recipes.set(recipe.id, recipe);
      return recipe;
    }

    // The detail's and the row's browse status for `recipe`, in that order.
    const statuses = (recipe) => [
      services.hydrateCraftingRecipe({ ...sources, actorId: actor.id, recipeId: recipe.id })
        ?.browseStatus,
      services
        .listCraftingForActor({ ...sources, rememberedActorId: actor.id })
        .summaries.find((summary) => summary.id === recipe.id)?.browseStatus,
    ];

    // Ore carries `perUnit` through its own essences flag, held as `quantity` units.
    function withFlaggedOre(perUnit, quantity, body) {
      const { getFlag } = ore;
      const stock = ore.system.quantity;
      ore.getFlag = function (scope, key) {
        return key === 'fabricate.essences' ? perUnit : getFlag.call(this, scope, key);
      };
      ore.system.quantity = quantity;
      try {
        body();
      } finally {
        ore.getFlag = getFlag;
        ore.system.quantity = stock;
      }
    }

    await t.test('no carrier lists the recipe short of materials', () => {
      assert.deepEqual(statuses(essenceRecipe('water', 2)), [
        'missingMaterials',
        'missingMaterials',
      ]);
    });

    await t.test('carriers holding part of the amount list it short', () => {
      withFlaggedOre({ water: 1 }, 1, () => {
        assert.deepEqual(statuses(essenceRecipe('water', 2)), [
          'missingMaterials',
          'missingMaterials',
        ]);
      });
    });

    await t.test('flagged carriers covering the amount list it available', () => {
      withFlaggedOre({ water: 1 }, 2, () => {
        assert.deepEqual(statuses(essenceRecipe('water', 2)), ['available', 'available']);
      });
    });
  });
});
