/**
 * An activated canvas Tool station through the production app, facade, engine and lab Journal
 * authority for an alchemy brew (issue 2274): the station's Tool counts as present for the brew's
 * start and its immediate execute, rides each command's payload only, and is never persisted.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { withFabricateLifecycleReplay } from './helpers/extension-composition-harness.js';

test('a canvas station reaches alchemy submission', async (t) => {
  await withFabricateLifecycleReplay(async ({ world, loadModule }) => {
    const { SvelteFabricateApp: App } = await loadModule('/src/ui/SvelteFabricateApp.svelte.js');
    const { Recipe } = await loadModule('/src/models/Recipe.js');
    const f = world.fabricate;
    const game = globalThis.game;
    const actor = world.actorList.find((entry) => entry.id === 'lab-actor-idrin');
    const system = f.craftingSystemManager.getSystem('lab-alchemy');
    system.alchemy = { ...system.alchemy, checkMode: 'none' };
    system.features.chatOutput = false;
    system.requirements.time.enabled = false;
    const tool = {
      id: 'al-station-athanor',
      name: 'Athanor',
      label: 'Station athanor',
      enabled: true,
      componentId: null,
      originItemUuid: 'Item.al-station-athanor',
      registeredItemUuid: 'Item.al-station-athanor',
      breakage: { mode: 'limitedUses', maxUses: 1 },
      onBreak: { mode: 'destroy' },
    };
    system.tools.push(tool);
    const smokestick = f.recipeManager.getRecipe('al-r-smokestick');
    f.recipeManager.recipes.set(
      smokestick.id,
      new Recipe({ ...smokestick.toJSON(), toolIds: [tool.id] })
    );
    const station = { systemId: system.id, toolId: tool.id, componentId: '', label: tool.label };

    const count = (componentName) =>
      actor.items
        .filter((item) => item.name === componentName)
        .reduce((sum, item) => sum + Number(item.system?.quantity ?? 0), 0);
    const stock = () => ({
      saltpetre: count('Saltpetre'),
      sulphur: count('Yellow Sulphur'),
      smokestick: count('Smokestick'),
    });

    const sentCommands = [];
    let currentApp = null;
    const service = f.journalRunCommands;
    const execute = service.executeJournalRunCommand;
    service.executeJournalRunCommand = (command, options) => {
      if (command?.runType === 'crafting') {
        const atStation = Boolean(currentApp?._activeCanvasTool);
        sentCommands.push({ command: structuredClone(command), atStation });
      }
      return execute.call(service, command, options);
    };

    function brewer(activeCanvasTool) {
      const app = new App({ activeCanvasTool, actorId: actor.id });
      app._services = app._buildServices();
      currentApp = app;
      return app._services;
    }

    const brew = (services) =>
      services.submitAlchemyAttempt({
        actorId: actor.id,
        craftingSystemId: system.id,
        submittedComponentIds: ['al-saltpetre', 'al-sulphur'],
        componentSourceActorIds: [actor.id],
      });

    await t.test(
      'without a station the brew is refused for its Tool and spends nothing',
      async () => {
        const before = stock();
        sentCommands.length = 0;
        const result = await brew(brewer(null));
        assert.equal(result?.success, false, JSON.stringify(result));
        assert.match(result.message ?? '', /Station athanor/);
        assert.deepEqual(stock(), before);
        assert.deepEqual(
          sentCommands.map(({ command }) => [
            command.action,
            Object.hasOwn(command.payload, 'presentTools'),
          ]),
          [['start', false]],
          'a station-less brew sends no presentTools key'
        );
      }
    );

    await t.test('a station supplies the Tool to the brew start and its execute', async () => {
      const before = stock();
      sentCommands.length = 0;
      const result = await brew(brewer(station));
      assert.equal(result?.success, true, JSON.stringify(result));
      assert.deepEqual(stock(), {
        saltpetre: before.saltpetre - 1,
        sulphur: before.sulphur - 1,
        smokestick: before.smokestick + 2,
      });
      assert.deepEqual(
        sentCommands.map(({ command }) => command.action),
        ['start', 'execute']
      );
    });

    await t.test('a station from another crafting system supplies nothing', async () => {
      const before = stock();
      const result = await brew(brewer({ ...station, systemId: 'lab-herbalism' }));
      assert.equal(result?.success, false, JSON.stringify(result));
      assert.deepEqual(stock(), before);
    });

    await t.test('each brew command carries its own station in its payload only', () => {
      assert.ok(sentCommands.length > 0, 'the brews were observed');
      for (const { command, atStation } of sentCommands) {
        const { presentTools, selectionPlan } = command.payload ?? {};
        assert.equal(
          Boolean(presentTools),
          atStation,
          `${command.action} carries only its station`
        );
        assert.equal(Object.hasOwn(command.payload, 'presentTools'), atStation);
        assert.equal(Object.hasOwn(selectionPlan ?? {}, 'presentTools'), false);
      }
    });

    await t.test('the station is never written to a run record or the authority ledger', () => {
      assert.equal(JSON.stringify(actor.flags).includes('presentTools'), false);
      const ledgers = game.journal.contents.filter(
        (entry) => entry.flags?.fabricate?.journalRunAuthorityLedger
      );
      assert.equal(ledgers.length, 1);
      assert.equal(JSON.stringify(ledgers[0]).includes('presentTools'), false);
    });
  });
});
