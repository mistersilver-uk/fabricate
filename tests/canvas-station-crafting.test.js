import assert from 'node:assert/strict';
import test from 'node:test';

import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

// Use the production app, facade, presenter and engine in the existing Foundry host.
test('canvas stations reach the player crafting path', async (t) => {
  await withFabricateLifecycleReplay(async ({ world, loadModule }) => {
    const { SvelteFabricateApp: App } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
    const { Recipe } = await loadModule('/src/models/Recipe.js');
    const { buildActiveCanvasTool } = await loadModule('/src/canvas/interactableResolution.js');
    const f = world.fabricate;
    const actor = world.actorList[0];
    const system = f.craftingSystemManager.getSystem('lab-smithing');
    const anvil = actor.items.find((item) => item.name === 'Anvil');
    assert.ok(anvil, 'the owned-item control has a real source Item');
    actor.items.splice(actor.items.indexOf(anvil), 1);
    system.craftingCheck.simple.rollFormula = '';
    system.features.chatOutput = false;
    system.requirements.time.enabled = false;
    await f.setCraftingComponentSourceIds([actor.id]);
    let serial = 0;
    const ore = actor.items.find((item) => item.name === 'Iron Ore');
    const ingot = actor.items.find((item) => item.name === 'Iron Ingot');
    const stock = () => ({ ore: ore.system.quantity, ingot: ingot.system.quantity });

    async function assertCraftRefused(services, options) {
      const before = stock();
      const result = await services.craftRecipe(options);
      assert.equal(result?.success, false, JSON.stringify(result));
      assert.deepEqual(stock(), before, 'a refused craft consumes and awards nothing');
    }

    function fixture({ legacy = false, enabled = true, multiStep = false, componentOnly = false } = {}) {
      const id = `station-${++serial}`;
      const componentId = legacy ? `${id}-component` : null;
      if (componentId) {
        system.components.push({
          id: componentId,
          name: 'Anvil',
          originItemUuid: 'Item.sm-tool-anvil',
        });
      }
      const tool = {
        id: `${id}-tool`,
        name: 'Anvil',
        label: 'Station anvil',
        enabled,
        componentId,
        originItemUuid: 'Item.sm-tool-anvil',
        registeredItemUuid: 'Item.sm-tool-anvil',
        breakage: { mode: 'limitedUses', maxUses: 1 },
        onBreak: { mode: 'destroy' },
      };
      system.tools.push(tool);
      let recipe = new Recipe({
        id,
        name: 'Station ingot',
        craftingSystemId: system.id,
        enabled: true,
        toolIds: [tool.id],
        ingredientSets: [
          {
            id: `${id}-set`,
            ingredientGroups: [
              {
                id: `${id}-ore`,
                options: [
                  { match: { type: 'component', componentId: 'sm-iron-ore' }, quantity: 1 },
                ],
              },
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
      if (multiStep) {
        recipe = new Recipe({
          ...recipe.toJSON(),
          steps: [0, 1].map((index) => ({
            id: `${id}-step-${index}`,
            name: `Stage ${index + 1}`,
            toolIds: [tool.id],
            ingredientSets: recipe.ingredientSets,
            resultGroups: recipe.resultGroups,
          })),
        });
      }
      f.recipeManager.recipes.set(recipe.id, recipe);
      const built = buildActiveCanvasTool({
        systemId: system.id,
        toolId: tool.id,
        tool,
      });
      // A station carrying only the legacy componentId exercises the componentIds branch.
      const activeCanvasTool = componentOnly ? { ...built, toolId: '' } : built;
      const app = new App({ activeCanvasTool, actorId: actor.id });
      app._services = app._buildServices();
      const options = {
        actorId: actor.id,
        componentSourceActorIds: [actor.id],
        recipeId: recipe.id,
      };
      return { app, recipe, tool, activeCanvasTool, services: app._services, options };
    }

    const variants = [
      { name: 'item-sourced', legacy: false },
      { name: 'component-linked', legacy: true },
      { name: 'component-only', legacy: true, componentOnly: true },
    ];
    for (const { name, ...variant } of variants) {
      await t.test(
        `${name} station hydrates and re-evaluates as available`,
        () => {
          const { services, options, recipe, activeCanvasTool } = fixture(variant);
          assert.equal(activeCanvasTool.toolId === '', variant.componentOnly === true);
          const detail = services.hydrateCraftingRecipe(options);
          assert.ok(detail);
          assert.equal(detail.ingredientSets[0].craftability.toolStates[0].virtual, true);
          assert.equal(detail.ingredientSets[0].craftability.canCraft, true);
          assert.equal(detail.browseStatus, 'available');
          const evaluated = services.evaluateSelectedSet({
            ...options,
            setId: recipe.ingredientSets[0].id,
          });
          assert.equal(evaluated.canCraft, true);
          assert.equal(evaluated.toolStates[0].virtual, true);
        }
      );
    }

    await t.test(
      'a station craft consumes material and awards its result without an owned Tool',
      async () => {
        const { services, options } = fixture();
        const before = stock();
        const itemIds = actor.items.map((item) => item.id);
        const result = await services.craftRecipe(options);
        assert.equal(result.success, true, JSON.stringify(result));
        assert.equal(ore.system.quantity, before.ore - 1);
        assert.equal(ingot.system.quantity, before.ingot + 1);
        // A one-use destroy-on-break Tool is untouched: no owned item is destroyed or added.
        assert.deepEqual(actor.items.map((item) => item.id), itemIds);
      }
    );

    await t.test('no station and a mismatched system remain unavailable', async () => {
      const { app, services, options, recipe, activeCanvasTool } = fixture();
      for (const context of [null, { ...activeCanvasTool, systemId: 'another-system' }]) {
        app._activeCanvasTool = context;
        const detail = services.hydrateCraftingRecipe(options);
        assert.equal(detail.ingredientSets[0].craftability.canCraft, false);
        assert.equal(detail.ingredientSets[0].craftability.toolStates[0].available, false);
        const evaluated = services.evaluateSelectedSet({
          ...options,
          setId: recipe.ingredientSets[0].id,
        });
        assert.equal(evaluated.canCraft, false);
        await assertCraftRefused(services, options);
      }
    });

    await t.test('disabled stations cannot satisfy a recipe requirement', () => {
      const { services, options } = fixture({ enabled: false });
      assert.equal(
        services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
        false
      );
    });

    await t.test('multi-step details apply the station to every step requirement', () => {
      const { services, options, recipe } = fixture({ multiStep: true });
      const detail = services.hydrateCraftingRecipe(options);
      assert.equal(detail.steps.length, 2);
      for (const step of detail.steps) {
        assert.equal(step.ingredientSets[0].craftability.canCraft, true);
        assert.equal(step.ingredientSets[0].craftability.toolStates[0].virtual, true);
      }
      const evaluated = services.evaluateSelectedSet({
        ...options,
        setId: recipe.steps[1].ingredientSets[0].id,
        stepId: recipe.steps[1].id,
        optionOverrides: {},
      });
      assert.equal(evaluated.canCraft, true);
      assert.equal(evaluated.toolStates[0].virtual, true);
    });

    await t.test('a Journal advance carries the station into the next run step', async () => {
      const { app, services, options, activeCanvasTool } = fixture({ multiStep: true });
      const first = await services.craftRecipe(options);
      assert.equal(first.success, true, JSON.stringify(first));
      const run = f.craftingRunManager.findActiveRunForRecipe(actor, options.recipeId);
      assert.ok(run, 'the first step leaves an active run');
      const advance = { actorId: actor.id, runId: run.id };
      app._activeCanvasTool = null;
      const before = stock();
      assert.equal((await services.advanceCraftingRun(advance)).success, false);
      assert.deepEqual(stock(), before, 'a refused advance consumes nothing');
      app._activeCanvasTool = activeCanvasTool;
      const second = await services.advanceCraftingRun(advance);
      assert.equal(second.success, true, JSON.stringify(second));
      assert.equal(ore.system.quantity, before.ore - 1);
    });

    await t.test('virtual presence does not bypass Tool prerequisites', () => {
      const { services, options, tool } = fixture();
      tool.prerequisites = { enabled: true, ids: ['unresolved-training'], gateMode: 'usability' };
      assert.equal(
        services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
        false
      );
    });

    await t.test('a station cannot bypass the facade actor ownership gate', async () => {
      const { services, options } = fixture();
      const permission = actor.testUserPermission;
      const owned = actor.isOwner;
      world.shim.setViewer('player');
      try {
        assert.equal(
          services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
          true
        );
        actor.testUserPermission = () => false;
        actor.isOwner = false;
        assert.equal((await services.craftRecipe(options)).success, false);
        const detail = services.hydrateCraftingRecipe(options);
        assert.equal(detail?.ingredientSets[0]?.craftability?.canCraft === true, false);
      } finally {
        actor.testUserPermission = permission;
        actor.isOwner = owned;
        world.shim.setViewer('gm');
      }
    });

    await t.test('ordinary owned-item crafting still works without a station', async () => {
      const { app, services, options } = fixture();
      app._activeCanvasTool = null;
      actor.items.push(anvil);
      try {
        assert.equal(
          services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
          true
        );
        assert.equal((await services.craftRecipe(options)).success, true);
      } finally {
        const index = actor.items.indexOf(anvil);
        if (index !== -1) actor.items.splice(index, 1);
      }
    });

    await t.test('reopening an existing app refreshes hydrated station availability', async () => {
      const { app, services, recipe, activeCanvasTool } = fixture();
      app._activeCanvasTool = null;
      await services.crafting.load();
      services.crafting.select(recipe.id);
      assert.equal(services.crafting.selectedRecipe.ingredientSets[0].craftability.canCraft, false);
      const calls = [];
      const { crafting } = services;
      const { load, flushProgressiveOrder } = crafting;
      crafting.load = (...args) => {
        calls.push('load');
        return load(...args);
      };
      crafting.flushProgressiveOrder = () => {
        calls.push('flush');
        return flushProgressiveOrder();
      };
      app.rendered = true;
      app.bringToFront = () => {
        calls.push('front');
      };
      App._instance = app;
      try {
        await App.show('crafting', { activeCanvasTool, actorId: actor.id });
        assert.equal(
          services.crafting.selectedRecipe.ingredientSets[0].craftability.canCraft,
          true
        );
        // The window surfaces first; a pending stage reorder is persisted before the reload.
        assert.deepEqual(calls, ['front', 'flush', 'load']);
        calls.length = 0;
        await App.show('crafting', { activeCanvasTool, actorId: actor.id });
        assert.deepEqual(calls, ['front'], 're-showing with the same session object does not reload');
        await App.show('crafting', { actorId: actor.id });
        assert.equal(
          services.crafting.selectedRecipe.ingredientSets[0].craftability.canCraft,
          false
        );
      } finally {
        App._instance = null;
      }
    });

    await t.test(
      'closing the session removes the virtual Tool from retained services',
      async () => {
        const { app, services, options } = fixture();
        assert.equal(
          services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
          true
        );
        await app.close();
        assert.equal(
          services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
          false
        );
        await assertCraftRefused(services, options);
      }
    );
  });
});
