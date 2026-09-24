/**
 * The Checks Studio's route model (issue 1721). The selected system, the gathering mode and the
 * route sit in a `SvelteMap` behind their thunks, as the shell's `$derived` values do, so a switch
 * after construction is visible to the model's own deriveds. `reseed()` is called by hand where the
 * shell's `$effect` would run it.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';

const MODULE_PATH = 'src/ui/svelte/apps/manager/checks/checksRouteModel.svelte.js';

const SAVES = Object.freeze([
  'setAlchemyCheckMode',
  'saveCraftingCheckActive',
  'saveCraftingCheckRouted',
  'saveCraftingCheckSimple',
  'saveCraftingCheckProgressive',
  'saveSalvageCheckActive',
  'saveSalvageCheckRouted',
  'saveSalvageCheckProgressive',
  'saveSalvageCheckSimple',
  'saveGatheringCheckActive',
  'saveGatheringCheckRouted',
  'saveGatheringCheckProgressive',
]);

const SYSTEM = Object.freeze({
  id: 'alchemy',
  resolutionMode: 'simple',
  salvageResolutionMode: 'simple',
  features: { salvage: true, gathering: true },
  craftingCheck: { enabled: true, simple: { rollFormula: '1d20', dc: 12 } },
  salvageCraftingCheck: { enabled: true, simple: { rollFormula: '1d12', dc: 10 } },
  gatheringCraftingCheck: {
    enabled: true,
    routed: { rollFormula: '2d6', relativeOutcomes: [{ id: 'g', name: 'Vein', success: true }] },
  },
});

describe('checksRouteModel', () => {
  let compiler;
  let createChecksRouteModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-checks-route-model-');
    ({ createChecksRouteModel } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /** One model over a live system, gathering mode and route, with every store save logged. */
  function openModel({ system = SYSTEM, gatheringMode = 'routed', results = {} } = {}) {
    const live = new SvelteMap([
      ['system', system],
      ['gatheringMode', gatheringMode],
      ['view', 'checks-crafting'],
    ]);
    const calls = [];
    const store = Object.fromEntries(
      SAVES.map((name) => [
        name,
        (value) => {
          calls.push([name, JSON.parse(JSON.stringify(value))]);
          return results[name];
        },
      ])
    );
    store.saveAlchemyConfig = (config) => calls.push(['saveAlchemyConfig', config]);
    const model = createChecksRouteModel({
      store: () => store,
      selectedSystem: () => live.get('system'),
      selectedSystemId: () => live.get('system')?.id || '',
      salvageResolutionMode: () => live.get('system')?.salvageResolutionMode || 'simple',
      gatheringResolutionMode: () => live.get('gatheringMode'),
      selectedSystemModifiers: () => [],
      currentView: () => live.get('view'),
    });
    return { model, live, calls, store };
  }

  const withFormula = (draft, rollFormula) => ({ ...draft, rollFormula });

  function switchSystem(live, model, patch) {
    live.set('system', { ...live.get('system'), ...patch });
    flushSync();
    model.reseed();
    flushSync();
  }

  it('seeds every draft from the selected system and reads clean', () => {
    const { model } = openModel();

    assert.equal(model.checkSimpleDraft.rollFormula, '1d20');
    assert.equal(model.salvageSimpleDraft.rollFormula, '1d12');
    assert.equal(model.gatheringRoutedDraft.rollFormula, '2d6');
    assert.equal(model.alchemyCheckModeDraft, 'none');
    assert.equal(model.craftingCheckMode, 'simple');
    assert.deepEqual(model.checksDirtyActivities, []);
    assert.equal(model.checksDirty, false);
  });

  it('dirties an activity only through the slot it rolls', () => {
    const { model } = openModel();

    model.onUpdateCraftingCheckProgressive(withFormula(model.checkProgressiveDraft, '3d6'));
    model.onUpdateSalvageCheckRouted(withFormula(model.salvageRoutedDraft, '3d6'));
    flushSync();
    assert.deepEqual(model.checksDirtyActivities, [], 'a slot the mode does not roll is inert');

    model.onUpdateSalvageCheckSimple(withFormula(model.salvageSimpleDraft, '1d12 + 1'));
    model.onUpdateCraftingCheckSimple(withFormula(model.checkSimpleDraft, '1d20 + 1'));
    flushSync();
    assert.deepEqual(model.checksDirtyActivities, ['crafting', 'salvage'], 'in activity order');
    assert.equal(model.checksDirty, true);
    assert.equal(model.checksNavItems.find((item) => item.id === 'salvage').dirty, true);
  });

  it('reseeds every draft on a system switch, and only crafting on a mode change', () => {
    const { model, live } = openModel();
    model.onUpdateCraftingCheckSimple(withFormula(model.checkSimpleDraft, 'staged'));
    model.onUpdateSalvageCheckSimple(withFormula(model.salvageSimpleDraft, 'staged'));
    flushSync();

    switchSystem(live, model, { craftingCheck: { simple: { rollFormula: 'refreshed' } } });
    assert.equal(
      model.checkSimpleDraft.rollFormula,
      'staged',
      'a same-system refresh keeps drafts'
    );

    switchSystem(live, model, {
      resolutionMode: 'routedByIngredients',
      craftingCheck: { simple: { rollFormula: '1d8' } },
    });
    assert.equal(model.checkSimpleDraft.rollFormula, '1d8', 'a mode change reseeds crafting');
    assert.equal(model.salvageSimpleDraft.rollFormula, 'staged', 'and leaves salvage alone');
    assert.deepEqual(model.checksDirtyActivities, ['salvage']);

    switchSystem(live, model, {
      id: 'smithing',
      salvageCraftingCheck: { simple: { rollFormula: '1d4' } },
      gatheringCraftingCheck: { routed: { rollFormula: '4d4' } },
    });
    assert.equal(model.salvageSimpleDraft.rollFormula, '1d4', 'a switch reseeds salvage');
    assert.equal(model.gatheringRoutedDraft.rollFormula, '4d4', 'and gathering');
    assert.deepEqual(model.checksDirtyActivities, [], 'against a new baseline');
  });

  it('raises the saving flag for the save in flight and rebaselines when it lands', async () => {
    let land;
    const { model, store, calls } = openModel();
    store.saveCraftingCheckSimple = (draft) => {
      calls.push(['saveCraftingCheckSimple', draft.rollFormula]);
      return new Promise((resolve) => {
        land = resolve;
      });
    };
    model.onUpdateCraftingCheckSimple(withFormula(model.checkSimpleDraft, '1d20 + 2'));
    flushSync();

    const saving = model.saveChecks();
    flushSync();
    assert.equal(model.checksSaving, true, 'saving while the store call is pending');
    land(undefined);
    assert.equal(await saving, true);
    flushSync();
    assert.equal(model.checksSaving, false);
    assert.deepEqual(model.checksDirtyActivities, [], 'a landed save rebaselines');
    assert.deepEqual(calls, [['saveCraftingCheckSimple', '1d20 + 2']]);
  });

  it('answers false and keeps the draft dirty when a store save refuses', async () => {
    const { model } = openModel({ results: { saveSalvageCheckSimple: false } });
    model.onUpdateSalvageCheckSimple(withFormula(model.salvageSimpleDraft, '1d12 + 4'));
    flushSync();

    assert.equal(await model.saveChecks(), false);
    flushSync();
    assert.deepEqual(model.checksDirtyActivities, ['salvage']);
    assert.equal(model.checksSaving, false);
  });

  it('saves nothing without a selected system', async () => {
    const { model, live, calls } = openModel();
    model.onUpdateCraftingCheckSimple(withFormula(model.checkSimpleDraft, '1d20 + 9'));
    live.set('system', { ...SYSTEM, id: '' });
    flushSync();

    assert.equal(await model.saveChecks(), true);
    assert.deepEqual(calls, [], 'the id is read at save time, not at construction');
  });

  it('discards every staged draft back to its baseline', () => {
    const { model } = openModel();
    model.onUpdateCraftingCheckSimple(withFormula(model.checkSimpleDraft, 'x'));
    model.onUpdateGatheringCheckRouted(withFormula(model.gatheringRoutedDraft, 'y'));
    model.onToggleCheckActive('salvage', false);
    flushSync();
    assert.deepEqual(model.checksDirtyActivities, ['crafting', 'salvage', 'gathering']);

    model.discardChecksDrafts();
    flushSync();
    assert.deepEqual(model.checksDirtyActivities, []);
    assert.equal(model.checkSimpleDraft.rollFormula, '1d20');
    assert.equal(model.checkActivation.salvage.enabled, true);
  });

  it('stages the alchemy Active switch as a check mode of simple or none', async () => {
    const alchemy = { ...SYSTEM, resolutionMode: 'alchemy', alchemy: { checkMode: 'none' } };
    const { model, calls } = openModel({ system: alchemy });

    model.onToggleCheckActive('crafting', true);
    flushSync();
    assert.equal(model.alchemyCheckModeDraft, 'simple');
    assert.equal(model.checkActivation.crafting.enabled, true);
    model.onToggleCheckActive('crafting', false);
    flushSync();
    assert.equal(model.alchemyCheckModeDraft, 'none');

    model.onToggleCheckActive('crafting', true);
    flushSync();
    await model.saveChecks();
    assert.deepEqual(
      calls.map(([name]) => name),
      ['setAlchemyCheckMode'],
      'the mode alone, never the crafting Active flag'
    );
  });

  it('reports no issues for a switched-off activity', () => {
    const off = { ...SYSTEM, craftingCheck: { enabled: false, simple: { rollFormula: '' } } };
    const { model } = openModel({ system: off });
    const craftingIssues = () => model.checksNavItems.find((item) => item.id === 'crafting');

    assert.equal(craftingIssues().issueCount, 0);
    model.onToggleCheckActive('crafting', true);
    flushSync();
    assert.ok(craftingIssues().issueCount > 0, 'the same draft switched on is not ready');
    assert.equal(model.checksNavCount, craftingIssues().issueCount);
  });

  it('opens the tab the route names, and counts each deep-link request', () => {
    const { model, live } = openModel();
    live.set('view', 'checks-salvage');
    flushSync();
    assert.equal(model.checksActiveTab, 'salvage');
    live.set('view', 'systems');
    flushSync();
    assert.equal(model.checksActiveTab, 'crafting');

    model.requestSection('');
    model.requestSection('outcomes');
    assert.equal(model.checksActiveSection, 'outcomes');
    assert.equal(model.checksSectionRequestNonce, 2);
  });

  it('persists an alchemy behaviour flag live over the stored flags', () => {
    const alchemy = {
      ...SYSTEM,
      alchemy: { checkMode: 'simple', learnOnCraft: true, consumeOnFail: false },
    };
    const { model, calls } = openModel({ system: alchemy });
    model.onUpdateAlchemyFlags({ learnOnCraft: false });
    assert.deepEqual(calls, [
      [
        'saveAlchemyConfig',
        {
          checkMode: 'simple',
          learnOnCraft: false,
          consumeOnFail: false,
          showAttemptHistoryToPlayers: true,
        },
      ],
    ]);
  });
});
