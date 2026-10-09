/**
 * An activated canvas Tool station through the production app, facades, presenters, engine and lab
 * Journal authority (issue 2265): it counts as present for its own crafting system on every player
 * crafting path, per call, and is never persisted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

test('canvas stations reach the player crafting path', async (t) => {
  await withFabricateLifecycleReplay(async ({ world, loadModule }) => {
    const { SvelteFabricateApp: App } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
    const { Recipe } = await loadModule('/src/models/Recipe.js');
    const { buildGrantPayload } = await loadModule('/src/canvas/interactableGrant.js');
    const { InteractableManager } = await loadModule('/src/canvas/InteractableManager.js');
    const { engineWithStationPresence } = await loadModule('/src/systems/stationPresence.js');
    const f = world.fabricate;
    const game = globalThis.game;
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
    ore.system.quantity = 40; // enough for every stage the suite runs
    const stock = () => ({ ore: ore.system.quantity, ingot: ingot.system.quantity });

    // Every crafting command a client sends, marked by whether the sending app had a station, so a
    // station can be proved to ride its payload only.
    const sentCommands = [];
    let currentApp = null;
    const service = f.journalRunCommands;
    const execute = service.executeJournalRunCommand;
    service.executeJournalRunCommand = (command, options) => {
      if (command?.runType === 'crafting') {
        const station = Boolean(currentApp?._activeCanvasTool);
        sentCommands.push({ command: structuredClone(command), station });
      }
      return execute.call(service, command, options);
    };

    async function assertCraftRefused(services, options) {
      const before = stock();
      const result = await services.craftRecipe(options);
      assert.equal(result?.success, false, JSON.stringify(result));
      assert.deepEqual(stock(), before, 'a refused craft consumes and awards nothing');
    }

    function stationTool(id, { legacy = false, enabled = true } = {}) {
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
      return tool;
    }

    function stationRecipe(id, toolIds, { multiStep = false, timedStep = null } = {}) {
      const ingredientSets = [
        {
          id: `${id}-set`,
          ingredientGroups: [
            {
              id: `${id}-ore`,
              options: [{ match: { type: 'component', componentId: 'sm-iron-ore' }, quantity: 1 }],
            },
          ],
        },
      ];
      const resultGroups = [
        {
          id: `${id}-result`,
          name: 'Ingot',
          results: [{ id: `${id}-ingot`, componentId: 'sm-iron-ingot', quantity: 1 }],
        },
      ];
      const steps = (multiStep ? [0, 1] : []).map((index) => ({
        id: `${id}-step-${index}`,
        name: `Stage ${index + 1}`,
        toolIds,
        ingredientSets,
        resultGroups,
        ...(index === 1 && timedStep && { timeRequirement: timedStep }),
      }));
      const recipe = new Recipe({
        id,
        name: 'Station ingot',
        craftingSystemId: system.id,
        enabled: true,
        toolIds,
        ingredientSets,
        resultGroups,
        ...(steps.length > 0 && { steps }),
      });
      f.recipeManager.recipes.set(recipe.id, recipe);
      return recipe;
    }

    // The production grant builder over the production canvas manager's resolution reads.
    function grantedStation(tool) {
      const { payload } = buildGrantPayload({
        request: { userId: game.user.id, behaviorId: 'b', sceneId: 's', regionId: 'r' },
        system: { interactableType: 'tool', systemId: system.id, toolId: tool.id },
        resolutionDeps: () => InteractableManager.instance._resolutionDeps(),
      });
      return payload.grant.context.activeCanvasTool;
    }

    function fixture({ componentOnly = false, ...options } = {}) {
      const id = `station-${++serial}`;
      const tool = stationTool(id, options);
      const recipe = stationRecipe(id, [tool.id], options);
      const granted = grantedStation(tool);
      // A station carrying only the legacy componentId exercises the componentIds branch.
      const activeCanvasTool = componentOnly ? { ...granted, toolId: '' } : granted;
      const app = new App({ activeCanvasTool, actorId: actor.id });
      app._services = app._buildServices();
      currentApp = app;
      const runOptions = {
        actorId: actor.id,
        componentSourceActorIds: [actor.id],
        recipeId: recipe.id,
      };
      return { app, recipe, tool, activeCanvasTool, services: app._services, options: runOptions };
    }

    // The browse row's status, through the same app seam the crafting store lists with.
    const listedStatus = (services, recipe) =>
      services
        .listCraftingForActor({ rememberedActorId: actor.id, componentSourceActorIds: [actor.id] })
        .summaries.find((summary) => summary.id === recipe.id)?.browseStatus;

    const activeRun = (recipe) => f.craftingRunManager.findActiveRunForRecipe(actor, recipe.id);

    async function journalEntry(services, run) {
      await services.setSelectedActorId(actor.id);
      await services.journal.load();
      return services.journal.listing?.activeRuns?.find((entry) => entry.id === run.id) ?? null;
    }

    function stageCommand(services, run, action, payload = {}) {
      return services.executeJournalRunCommand({
        actorUuid: actor.uuid,
        runType: 'crafting',
        runId: run.id,
        expectedRevision: run.runRevision,
        action,
        payload,
      });
    }

    async function withOwnedAnvil(body) {
      actor.items.push(anvil);
      try {
        await body();
      } finally {
        const index = actor.items.indexOf(anvil);
        if (index !== -1) actor.items.splice(index, 1);
      }
    }

    async function withTimeEnabled(body) {
      system.requirements.time.enabled = true;
      try {
        await body();
      } finally {
        system.requirements.time.enabled = false;
      }
    }

    const variants = [
      { name: 'item-sourced', legacy: false },
      { name: 'component-linked', legacy: true },
      { name: 'component-only', legacy: true, componentOnly: true },
    ];
    for (const { name, ...variant } of variants) {
      await t.test(`${name} station hydrates and re-evaluates as available`, () => {
        const { services, options, recipe, activeCanvasTool } = fixture(variant);
        assert.equal(activeCanvasTool.toolId === '', variant.componentOnly === true);
        const detail = services.hydrateCraftingRecipe(options);
        assert.ok(detail);
        assert.equal(detail.ingredientSets[0].craftability.toolStates[0].virtual, true);
        assert.equal(detail.ingredientSets[0].craftability.canCraft, true);
        assert.equal(detail.browseStatus, 'available');
        assert.equal(listedStatus(services, recipe), 'available');
        const evaluated = services.evaluateSelectedSet({
          ...options,
          setId: recipe.ingredientSets[0].id,
        });
        assert.equal(evaluated.canCraft, true);
        assert.equal(evaluated.toolStates[0].virtual, true);
      });
    }

    await t.test(
      'a station craft consumes material and awards its result without an owned Tool',
      async () => {
        const { services, options, activeCanvasTool } = fixture();
        assert.equal(activeCanvasTool.label, 'Station anvil', 'the chip names the Display label');
        const before = stock();
        const itemIds = actor.items.map((item) => item.id);
        sentCommands.length = 0;
        const result = await services.craftRecipe(options);
        assert.equal(result.success, true, JSON.stringify(result));
        assert.equal(ore.system.quantity, before.ore - 1);
        assert.equal(ingot.system.quantity, before.ingot + 1);
        // A one-use destroy-on-break Tool is untouched: no owned item is destroyed or added.
        assert.deepEqual(
          actor.items.map((item) => item.id),
          itemIds
        );
        assert.deepEqual(
          sentCommands.map(({ command }) => command.action),
          ['start', 'execute']
        );
      }
    );

    await t.test('the chip names a nameless component-linked Tool by its component', () => {
      const tool = Object.assign(stationTool(`station-${++serial}`, { legacy: true }), {
        label: '',
        name: '',
      });
      system.components.find((entry) => entry.id === tool.componentId).name = 'Linked anvil';
      assert.equal(grantedStation(tool).label, 'Linked anvil');
    });

    await t.test('check-driven breakage records the station Tool as virtual evidence', async () => {
      const { services, options, recipe, tool } = fixture();
      const authority = system.toolBreakage;
      system.toolBreakage = { authority: 'checkDriven' };
      try {
        assert.equal((await services.craftRecipe(options)).success, true);
      } finally {
        system.toolBreakage = authority;
      }
      const run = f.craftingRunManager
        .getRunHistory(actor)
        .find((entry) => entry.recipeId === recipe.id);
      const usedTools = run.steps.flatMap((step) => step.usedTools ?? []);
      assert.deepEqual(
        usedTools.map((entry) => [entry.toolId, entry.virtual, entry.broken, entry.itemUuid]),
        [[tool.id, true, false, null]]
      );
    });

    await t.test('no station and a mismatched system remain unavailable', async () => {
      const { app, services, options, recipe, activeCanvasTool } = fixture();
      for (const context of [null, { ...activeCanvasTool, systemId: 'another-system' }]) {
        app._activeCanvasTool = context;
        const detail = services.hydrateCraftingRecipe(options);
        assert.equal(detail.ingredientSets[0].craftability.canCraft, false);
        assert.equal(detail.ingredientSets[0].craftability.toolStates[0].available, false);
        assert.equal(detail.browseStatus, 'missingMaterials');
        assert.equal(listedStatus(services, recipe), 'missingMaterials', 'the row agrees');
        const evaluated = services.evaluateSelectedSet({
          ...options,
          setId: recipe.ingredientSets[0].id,
        });
        assert.equal(evaluated.canCraft, false);
        await assertCraftRefused(services, options);
      }
    });

    await t.test('disabled stations cannot satisfy a recipe requirement', () => {
      const { services, options, recipe } = fixture({ enabled: false });
      assert.equal(
        services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
        false
      );
      assert.equal(listedStatus(services, recipe), 'missingMaterials');
    });

    await t.test('without a station, an owned Tool alone lists the recipe available', async () => {
      const { app, services, recipe } = fixture();
      app._activeCanvasTool = null;
      assert.equal(listedStatus(services, recipe), 'missingMaterials');
      await withOwnedAnvil(async () => {
        assert.equal(listedStatus(services, recipe), 'available');
      });
    });

    await t.test("a routed set cannot lend its materials to another set's Tools", async () => {
      const { app, services, options, recipe: stationOnly, tool } = fixture();
      app._activeCanvasTool = null;
      const ore = { match: { type: 'component', componentId: 'sm-iron-ore' }, quantity: 1 };
      const ingots = { match: { type: 'component', componentId: 'sm-iron-ingot' }, quantity: 999 };
      const set = (name, option, toolIds) => ({
        id: `${stationOnly.id}-${name}`,
        name,
        toolIds,
        ingredientGroups: [{ id: `${stationOnly.id}-${name}-group`, options: [option] }],
      });
      // "Forge" holds its materials but not its Tool; "Cold" needs no Tool but its materials.
      const recipe = new Recipe({
        ...stationOnly.toJSON(),
        id: `${stationOnly.id}-routed`,
        toolIds: [],
        ingredientSets: [set('Forge', ore, [tool.id]), set('Cold', ingots, [])],
      });
      f.recipeManager.recipes.set(recipe.id, recipe);
      options.recipeId = recipe.id;
      const mode = system.resolutionMode;
      system.resolutionMode = 'routedByIngredients';
      try {
        assert.equal(services.hydrateCraftingRecipe(options).browseStatus, 'missingMaterials');
        assert.equal(listedStatus(services, recipe), 'missingMaterials', 'the row agrees');
        await withOwnedAnvil(async () => {
          assert.equal(listedStatus(services, recipe), 'available');
        });
      } finally {
        system.resolutionMode = mode;
        f.recipeManager.recipes.delete(recipe.id);
      }
    });

    await t.test('multi-step details apply the station to every step requirement', () => {
      const { services, options, recipe } = fixture({ multiStep: true });
      const detail = services.hydrateCraftingRecipe(options);
      assert.equal(detail.steps.length, 2);
      assert.equal(listedStatus(services, recipe), 'available');
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

    await t.test('the Journal resolves a station stage only with the station', async () => {
      const { app, services, options, recipe, activeCanvasTool } = fixture({ multiStep: true });
      const first = await services.craftRecipe(options);
      assert.equal(first.success, true, JSON.stringify(first));
      const run = activeRun(recipe);
      assert.ok(run, 'the first step leaves an active run');
      assert.equal((await journalEntry(services, run)).actions.execute, true);

      app._activeCanvasTool = null;
      assert.equal((await journalEntry(services, run)).actions.execute, false, 'Needs tools');
      const before = stock();
      assert.equal((await stageCommand(services, run, 'execute')).success, false);
      assert.equal(
        (await services.advanceCraftingRun({ actorId: actor.id, runId: run.id })).success,
        false
      );
      assert.deepEqual(stock(), before, 'a refused Resolve consumes nothing');

      app._activeCanvasTool = activeCanvasTool;
      await services.journal.execute(await journalEntry(services, run));
      assert.equal(ore.system.quantity, before.ore - 1, 'the Journal Resolve ran the stage');
      assert.equal(activeRun(recipe), null, 'and finished the run');
    });

    await t.test('a Journal step advance carries the station into the next stage', async () => {
      const { app, services, options, recipe, activeCanvasTool } = fixture({ multiStep: true });
      assert.equal((await services.craftRecipe(options)).success, true);
      const advance = { actorId: actor.id, runId: activeRun(recipe).id };
      app._activeCanvasTool = activeCanvasTool;
      const before = stock();
      const second = await services.advanceCraftingRun(advance);
      assert.equal(second.success, true, JSON.stringify(second));
      assert.equal(ore.system.quantity, before.ore - 1);
    });

    await t.test('a timed stage begins and resolves only with the station', async () => {
      await withTimeEnabled(async () => {
        const { app, services, options, recipe, activeCanvasTool } = fixture({
          multiStep: true,
          timedStep: { minutes: 10 },
        });
        assert.equal((await services.craftRecipe(options)).success, true);
        const run = activeRun(recipe);
        assert.equal((await journalEntry(services, run)).actions.beginStep, true);

        app._activeCanvasTool = null;
        assert.equal((await journalEntry(services, run)).actions.beginStep, false);
        const before = stock();
        assert.equal((await stageCommand(services, run, 'beginStep')).success, false);
        assert.deepEqual(stock(), before, 'a refused Begin spends nothing');

        app._activeCanvasTool = activeCanvasTool;
        await services.journal.beginStep(await journalEntry(services, run));
        assert.equal(ore.system.quantity, before.ore - 1, 'Begin spent the stage');
        game.time.worldTime += 3600;

        app._activeCanvasTool = null;
        const begun = activeRun(recipe);
        assert.equal((await stageCommand(services, begun, 'execute')).success, false);
        assert.equal(f.getJournalRunAuthorityAvailability().available, true);
        app._activeCanvasTool = activeCanvasTool;
        await services.journal.execute(await journalEntry(services, begun));
        assert.equal(activeRun(recipe), null, 'Resolve with the station finished the run');
      });
    });

    await t.test(
      'a player over the socket transport crafts and resolves at a station',
      async () => {
        const { services, options, recipe } = fixture({ multiStep: true });
        const emit = game.socket.emit;
        game.socket.emit = (channel, payload, emitOptions) =>
          emit.call(game.socket, channel, JSON.parse(JSON.stringify(payload)), emitOptions);
        world.shim.setViewer('player');
        try {
          const first = await services.craftRecipe(options);
          assert.equal(first.success, true, JSON.stringify(first));
          await services.journal.execute(await journalEntry(services, activeRun(recipe)));
          assert.equal(activeRun(recipe), null, 'the player Resolve finished the run');
        } finally {
          world.shim.setViewer('gm');
          game.socket.emit = emit;
        }
      }
    );

    await t.test('every station crafting command carries the station in its payload only', () => {
      const atStation = sentCommands.filter((entry) => entry.station).map(({ command }) => command);
      assert.deepEqual(
        [...new Set(atStation.map((command) => command.action))].sort((a, b) => a.localeCompare(b)),
        ['beginStep', 'execute', 'start']
      );
      assert.ok(
        atStation.some((command) => command.payload.selectionPlan),
        'an advance is seen'
      );
      for (const { command, station } of sentCommands) {
        const { presentTools, selectionPlan } = command.payload ?? {};
        assert.equal(Boolean(presentTools), station, `${command.action} carries only its station`);
        assert.equal(Object.hasOwn(selectionPlan ?? {}, 'presentTools'), false);
      }
    });

    await t.test('the station is never written to a run record or the authority ledger', () => {
      const runs = JSON.stringify(actor.flags);
      assert.ok(runs.includes('station-'), 'the scan reads the station runs');
      assert.equal(runs.includes('presentTools'), false);
      const ledgers = game.journal.contents.filter(
        (entry) => entry.flags?.fabricate?.journalRunAuthorityLedger
      );
      assert.equal(ledgers.length, 1);
      assert.equal(JSON.stringify(ledgers[0]).includes('presentTools'), false);
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
      await withOwnedAnvil(async () => {
        assert.equal(
          services.hydrateCraftingRecipe(options).ingredientSets[0].craftability.canCraft,
          true
        );
        assert.equal((await services.craftRecipe(options)).success, true);
      });
    });

    await t.test('reshowing with a different station refreshes the open reads', async () => {
      const { app, services, recipe, activeCanvasTool } = fixture();
      app._activeCanvasTool = null;
      await services.crafting.load();
      services.crafting.select(recipe.id);
      assert.equal(services.crafting.selectedRecipe.ingredientSets[0].craftability.canCraft, false);
      const calls = [];
      const failing = new Set();
      const spy = (store, method, label) => {
        const original = store[method];
        store[method] = (...args) => {
          calls.push([label, ...args]);
          return failing.has(label) ? Promise.reject(new Error(label)) : original(...args);
        };
      };
      spy(services.crafting, 'flushProgressiveOrder', 'flush');
      spy(services.crafting, 'load', 'crafting');
      spy(services.journal, 'load', 'journal');
      app.rendered = true;
      app.bringToFront = () => {
        calls.push(['front']);
      };
      App._instance = app;
      try {
        await App.show('crafting', { activeCanvasTool, actorId: actor.id });
        assert.equal(
          services.crafting.selectedRecipe.ingredientSets[0].craftability.canCraft,
          true
        );
        assert.equal(services.crafting.selectedRecipe.id, recipe.id, 'the open recipe stays');
        assert.deepEqual(calls, [['front'], ['flush'], ['crafting', true], ['journal', true]]);
        calls.length = 0;
        await App.show('crafting', {
          activeCanvasTool: { ...activeCanvasTool },
          actorId: actor.id,
        });
        assert.deepEqual(calls, [['front']], 'an equal station does not reload');
        await App.show('crafting', { actorId: actor.id });
        assert.equal(app._activeCanvasTool, null, 'a plain show clears the station');
        assert.equal(
          services.crafting.selectedRecipe.ingredientSets[0].craftability.canCraft,
          false
        );
        // A rejected read neither rejects the show nor skips the reads after it.
        for (const [label, tool] of [
          ['flush', activeCanvasTool],
          ['crafting', null],
        ]) {
          failing.add(label);
          calls.length = 0;
          await App.show('crafting', { activeCanvasTool: tool, actorId: actor.id });
          failing.delete(label);
          assert.deepEqual(
            calls.map(([name]) => name),
            ['front', 'flush', 'crafting', 'journal'],
            label
          );
        }
        app._services = null;
        await App.show('crafting', { activeCanvasTool, actorId: actor.id });
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

    // A station Tool no actor item matches, so it can only ever be planned as virtual.
    function bellowsStation(id) {
      return Object.assign(stationTool(id), {
        name: 'Station bellows',
        label: '',
        originItemUuid: `Item.${id}-elsewhere`,
        registeredItemUuid: `Item.${id}-elsewhere`,
      });
    }

    // One engine stage at the station; `stopAt` stops it just before that effect applies and resumes
    // it with a station-less command, so the pairing comes from the persisted plan alone.
    async function stationStage(recipe, station, { stopAt = null, beforeResume = () => {} } = {}) {
      const id = `${recipe.id}-${++serial}`;
      const shared = Object.create(f.craftingEngine);
      shared.versionedRunAuthority = {
        consumeExecutionGrant: async (_grant, context) => ({
          operationId: `${id}-${context.operation}`,
          resolvedCheckResult: { success: true, outcome: null, value: null, data: {} },
        }),
      };
      const presentTools = { systemId: system.id, componentIds: [], toolIds: [station.id] };
      const engine = engineWithStationPresence(shared, presentTools);
      const started = await engine.startVersionedRun({
        viewer: game.user,
        actor,
        sourceActors: [actor],
        recipeId: recipe.id,
        selectionPlan: { selectedIngredientSetId: recipe.ingredientSets[0].id },
        executionGrant: 'grant',
        requestId: `${id}-start`,
      });
      assert.equal(started.success, true, JSON.stringify(started));
      const stage = {
        actor,
        componentSourceActors: [actor],
        requestId: `${id}-execute`,
        executionGrant: 'grant',
        runId: started.runId,
        expectedRevision: started.runRevision,
      };
      const runManager = f.craftingRunManager;
      if (stopAt) {
        runManager.updateExecutionJournal = async (...args) => {
          if (args[2]?.type === 'effectApplying' && args[2].effectId === stopAt) {
            throw new Error(`simulated stop before ${stopAt}`);
          }
          return Object.getPrototypeOf(runManager).updateExecutionJournal.apply(runManager, args);
        };
        try {
          await assert.rejects(() => engine.executeVersionedStage(stage), /simulated stop/);
        } finally {
          delete runManager.updateExecutionJournal;
        }
        runManager.invalidateCache(actor.id);
        stage.expectedRevision = runManager.getActiveRun(actor, started.runId).runRevision;
        beforeResume();
      }
      const result = await (stopAt ? shared : engine).executeVersionedStage(stage);
      assert.equal(result.success, true, JSON.stringify(result));
      const history = runManager.getRunHistory(actor).find((run) => run.id === started.runId);
      return history.steps.flatMap((step) => step.usedTools ?? []);
    }

    await t.test('a station-only stage resumes after an interrupted tool effect', async () => {
      const id = `station-${++serial}`;
      const station = bellowsStation(id);
      const before = stock();
      await stationStage(stationRecipe(id, [station.id]), station, { stopAt: 'apply-tools' });
      assert.deepEqual(stock(), { ore: before.ore - 1, ingot: before.ingot + 1 });
    });

    await t.test('an unapplied resume refuses when its planned owned item is gone', async () => {
      const id = `station-${++serial}`;
      const station = bellowsStation(id);
      const recipe = stationRecipe(id, [station.id, 'sm-tool-anvil']);
      await withOwnedAnvil(async () => {
        await assert.rejects(
          () =>
            stationStage(recipe, station, {
              stopAt: 'apply-tools',
              beforeResume: () => {
                const index = actor.items.indexOf(anvil);
                if (index !== -1) actor.items.splice(index, 1);
              },
            }),
          /no longer available/
        );
      });
    });

    await t.test('a resumed stage pairs each planned tool item with its own Tool', async () => {
      // [virtual A (one use, destroy), owned B]: B is the lab's own anvil Tool, the identity the
      // owned anvil Item is stamped with.
      const id = `station-${++serial}`;
      const station = bellowsStation(id);
      const recipe = stationRecipe(id, [station.id, 'sm-tool-anvil']);
      await withOwnedAnvil(async () => {
        const usedTools = await stationStage(recipe, station, { stopAt: 'apply-tools' });
        assert.ok(actor.items.includes(anvil), "the station Tool's destroy never reaches B");
        assert.equal(anvil.getFlag?.('fabricate', 'toolBroken') ?? false, false);
        assert.deepEqual(
          usedTools.filter((entry) => entry.itemUuid === anvil.uuid).map((entry) => entry.toolId),
          ['sm-tool-anvil'],
          "the owned item is used as its own Tool, not the station's"
        );
      });
    });

    await t.test(
      'a resumed check-driven stage records the evidence of an uninterrupted one',
      async () => {
        const id = `station-${++serial}`;
        const station = bellowsStation(id);
        const recipe = stationRecipe(id, [station.id, 'sm-tool-anvil']);
        const authority = system.toolBreakage;
        system.toolBreakage = { authority: 'checkDriven' };
        try {
          await withOwnedAnvil(async () => {
            const uninterrupted = await stationStage(recipe, station);
            assert.deepEqual(
              uninterrupted.map((entry) => [entry.toolId, entry.virtual === true]),
              [
                [station.id, true],
                ['sm-tool-anvil', false],
              ]
            );
            assert.deepEqual(
              await stationStage(recipe, station, { stopAt: 'apply-tools' }),
              uninterrupted
            );
            // Applied tools replay from their receipt, even once the owned item is gone.
            const replayed = await stationStage(recipe, station, {
              stopAt: 'award-results',
              beforeResume: () => actor.items.splice(actor.items.indexOf(anvil), 1),
            });
            assert.deepEqual(replayed, uninterrupted);
          });
        } finally {
          system.toolBreakage = authority;
        }
      }
    );
  });
});
