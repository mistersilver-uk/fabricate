/**
 * The gathering workspace's route model (issue 1721). The view state, route and gates sit in a
 * `SvelteMap` behind their thunks, as the shell's `$derived` values do, so a change after
 * construction reaches the model's own deriveds. Each reconciler is called by hand where the
 * shell's `$effect` would run it.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';

const MODULE_PATH = 'src/ui/svelte/apps/manager/gatheringRouteModel.svelte.js';

const TASKS = Object.freeze([
  { id: 't1', name: 'Moon herbs', dropRows: [{ id: 'd1' }, { id: 'd2' }] },
  { id: 't2', name: 'Crystal veins', dropRows: [] },
]);
const EVENTS = Object.freeze([
  { id: 'v1', name: 'Wolves', dropRate: 20 },
  { id: 'v2', name: 'Storm', dropRate: 5 },
]);

function viewStateFor({ tasks = TASKS, events = EVENTS, environments = [], ...rest } = {}) {
  return {
    environments,
    gatheringConfig: {
      systems: { alchemy: { tasks, events, economy: {} }, smithing: { tasks: [], events: [] } },
    },
    ...rest,
  };
}

describe('gatheringRouteModel', () => {
  let compiler;
  let createGatheringRouteModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-gathering-route-model-');
    ({ createGatheringRouteModel } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  /** One model over a live view state, route and gates, with the rail's writes logged. */
  function openModel({ viewState = viewStateFor(), system = {}, validateTask } = {}) {
    const live = new SvelteMap([
      ['viewState', viewState],
      ['system', { id: 'alchemy', features: { gathering: true }, ...system }],
      ['view', 'environments'],
      ['canShow', true],
      ['gatheringRoute', true],
    ]);
    const railWrites = [];
    const model = createGatheringRouteModel({
      store: () => ({ validateGatheringLibraryTask: validateTask }),
      viewState: () => live.get('viewState'),
      view: () => live.get('view'),
      selectedSystem: () => live.get('system'),
      selectedSystemId: () => live.get('system')?.id || '',
      canShowEnvironments: () => live.get('canShow'),
      isGatheringRoute: () => live.get('gatheringRoute'),
      navRail: () => ({ setGroupExpanded: (group, on) => railWrites.push([group, on]) }),
      text: (_key, fallback) => fallback,
    });
    return { model, live, railWrites };
  }

  function stageDrafts(model) {
    model.activeGatheringTab = 'encounters';
    for (const kind of ['Task', 'Event']) {
      model[`selectedGathering${kind}Id`] = kind === 'Task' ? 't2' : 'v2';
      model[`gathering${kind}Draft`] = { id: 'x' };
      model[`gathering${kind}DraftBaseline`] = { id: 'x' };
      model[`gathering${kind}Saving`] = true;
      model[`gathering${kind}SaveError`] = 'Save failed.';
    }
    model.selectedGatheringDropId = 'd2';
  }

  it('resets the tab, both selections and both drafts when the system switches', () => {
    const { model, live, railWrites } = openModel();
    model.resetOnSystemSwitch();
    stageDrafts(model);
    live.set('gatheringRoute', false);
    live.set('system', { id: 'smithing', features: { gathering: true } });
    flushSync();
    model.resetOnSystemSwitch();

    assert.equal(model.activeGatheringTab, 'environments');
    for (const kind of ['Task', 'Event']) {
      assert.equal(model[`selectedGathering${kind}Id`], '', `${kind} selection`);
      assert.equal(model[`gathering${kind}Draft`], null, `${kind} draft`);
      assert.equal(model[`gathering${kind}DraftBaseline`], null, `${kind} baseline`);
      assert.equal(model[`gathering${kind}Saving`], false, `${kind} saving`);
      assert.equal(model[`gathering${kind}SaveError`], '', `${kind} save error`);
    }
    assert.equal(model.selectedGatheringDropId, 'd2', 'the drop selection is left to its own reconciler');
    assert.deepEqual(railWrites, [
      ['gathering', true],
      ['gathering', false],
    ], 'and the rail group follows the route each time');
  });

  it('resets nothing when the same system is refreshed', () => {
    const { model, railWrites } = openModel();
    model.resetOnSystemSwitch();
    stageDrafts(model);
    model.resetOnSystemSwitch();

    assert.equal(model.activeGatheringTab, 'encounters');
    assert.deepEqual(model.gatheringTaskDraft, { id: 'x' });
    assert.equal(railWrites.length, 1);
  });

  it('returns a tab no longer offered to environments', () => {
    const { model } = openModel();
    model.activeGatheringTab = 'travel';
    model.normalizeTab();
    assert.equal(model.activeGatheringTab, 'environments');

    model.activeGatheringTab = 'settings';
    model.normalizeTab();
    assert.equal(model.activeGatheringTab, 'settings', 'an offered tab is kept');
  });

  // Every route the tab survives, with the workspace shown and hidden, and two it never does.
  const TAB_ROUTES = [
    { view: 'environments', shown: true, kept: true },
    { view: 'gathering-task-edit', shown: true, kept: true },
    { view: 'gathering-event-edit', shown: true, kept: true },
    { view: 'environments', shown: false, kept: false },
    { view: 'gathering-task-edit', shown: false, kept: false },
    { view: 'gathering-event-edit', shown: false, kept: false },
    { view: 'environment-edit', shown: true, kept: false },
    { view: 'recipes', shown: true, kept: false },
  ];
  for (const { view, shown, kept } of TAB_ROUTES) {
    it(`${kept ? 'keeps' : 'resets'} the tab on ${view} with the workspace ${shown ? 'shown' : 'hidden'}`, () => {
      const { model, live } = openModel();
      model.activeGatheringTab = 'tasks';
      live.set('view', view);
      live.set('canShow', shown);
      flushSync();
      model.resetTabOffRoute();
      assert.equal(model.activeGatheringTab, kept ? 'tasks' : 'environments');
    });
  }

  it('names the tab, and lights the child route only on a gathering route', () => {
    const { model, live } = openModel();
    model.activeGatheringTab = 'encounters';
    flushSync();
    assert.equal(model.gatheringTabLabel, 'Events');
    assert.equal(model.gatheringTabPageTitle, 'Gathering events');
    assert.equal(model.activeGatheringInspectorTab.id, 'encounters');
    assert.equal(model.isActiveGatheringChildRoute, true);
    live.set('gatheringRoute', false);
    flushSync();
    assert.equal(model.isActiveGatheringChildRoute, false);
    model.activeGatheringTab = 'environments';
    flushSync();
    assert.equal(model.activeGatheringInspectorTab, null, 'environments opens no inspector tab');
    assert.equal(model.gatheringTabPageTitle, '');
  });

  // The two record kinds reconcile alike; only the task clears the drop selection when hidden.
  const RECORD_KINDS = [
    { kind: 'Task', first: 't1', second: 't2', clearsDrop: true },
    { kind: 'Event', first: 'v1', second: 'v2', clearsDrop: false },
  ];
  for (const { kind, first, second, clearsDrop } of RECORD_KINDS) {
    const idKey = `selectedGathering${kind}Id`;
    const reselect = `reselect${kind}`;

    it(`falls a ${kind.toLowerCase()} selection back to the first entry`, () => {
      const { model } = openModel();
      model[reselect]();
      assert.equal(model[idKey], first, 'an empty selection takes the first entry');
      model[idKey] = second;
      model[reselect]();
      assert.equal(model[idKey], second, 'a live selection is kept');
      model[idKey] = 'gone';
      flushSync();
      assert.equal(model[`selectedGathering${kind}`].id, first, 'a stale one reads as the first');
      model[reselect]();
      assert.equal(model[idKey], first, 'and is replaced by it');
    });

    it(`clears a ${kind.toLowerCase()} selection while the workspace is hidden`, () => {
      const { model, live } = openModel();
      model[idKey] = second;
      model.selectedGatheringDropId = 'd2';
      live.set('canShow', false);
      flushSync();
      model[reselect]();
      assert.equal(model[idKey], '');
      assert.equal(model.selectedGatheringDropId, clearsDrop ? '' : 'd2');
    });

    it(`edits the ${kind.toLowerCase()} draft over the selection, and reads it dirty off its baseline`, () => {
      const { model } = openModel();
      model[idKey] = second;
      flushSync();
      assert.equal(model[`editingGathering${kind}`].id, second, 'no draft edits the selection');
      model[`gathering${kind}Draft`] = { id: second, name: 'A' };
      model[`gathering${kind}DraftBaseline`] = { id: second, name: 'A' };
      flushSync();
      assert.equal(model[`editingGathering${kind}`].name, 'A');
      assert.equal(model[`gathering${kind}DraftDirty`], false);
      model[`gathering${kind}Draft`] = { id: second, name: 'B' };
      flushSync();
      assert.equal(model[`gathering${kind}DraftDirty`], true);
    });
  }

  it('keeps a live drop selection and falls back to the editing task’s first row', () => {
    const { model } = openModel();
    model.selectedGatheringTaskId = 't1';
    flushSync();
    assert.equal(model.selectedGatheringDrop.id, 'd1', 'no selection reads as the first row');
    model.reselectDrop();
    assert.equal(model.selectedGatheringDropId, 'd1');
    model.selectedGatheringDropId = 'd2';
    model.reselectDrop();
    assert.equal(model.selectedGatheringDrop.id, 'd2');
    model.selectedGatheringTaskId = 't2';
    model.reselectDrop();
    assert.equal(model.selectedGatheringDropId, '', 'a task without rows selects none');
  });

  it('totals environments, tasks and events for the rail', () => {
    const { model, live } = openModel();
    assert.deepEqual(model.gatheringNavCounts, { environments: 0, tasks: 2, encounters: 2, total: 4 });
    live.set('viewState', viewStateFor({ environments: [{ id: 'e1' }], events: [] }));
    flushSync();
    assert.deepEqual(model.gatheringNavCounts, { environments: 1, tasks: 2, encounters: 0, total: 3 });
  });

  // Each invalid case alone, so one error cannot stand in for another.
  const EVENT_DRAFTS = [
    { draft: null, errors: [] },
    { draft: { name: 'Wolves', dropRate: 1 }, errors: [] },
    { draft: { name: 'Wolves', dropRate: 100 }, errors: [] },
    { draft: { name: '  ', dropRate: 50 }, errors: ['Name is required.'] },
    { draft: { name: 'Wolves', dropRate: 0 }, errors: ['Drop rate must be between 1 and 100.'] },
    { draft: { name: 'Wolves', dropRate: 101 }, errors: ['Drop rate must be between 1 and 100.'] },
    { draft: { name: 'Wolves', dropRate: 'x' }, errors: ['Drop rate must be between 1 and 100.'] },
  ];
  for (const { draft, errors } of EVENT_DRAFTS) {
    it(`validates the event draft ${JSON.stringify(draft)}`, () => {
      const { model } = openModel();
      model.gatheringEventDraft = draft;
      flushSync();
      assert.deepEqual(model.gatheringEventValidation, { valid: errors.length === 0, errors });
    });
  }

  it('validates the task draft through the store, and a missing draft without it', () => {
    const seen = [];
    const { model } = openModel({
      validateTask: (draft) => {
        seen.push(draft.id);
        return { valid: false, errors: ['bad'] };
      },
    });
    assert.deepEqual(model.gatheringTaskValidation, { valid: true, errors: [] });
    model.gatheringTaskDraft = { id: 't1' };
    flushSync();
    assert.deepEqual(model.gatheringTaskValidation, { valid: false, errors: ['bad'] });
    assert.deepEqual(seen, ['t1']);
  });

  it('counts a task in an environment with no system, and an event not', () => {
    const environments = [
      { id: 'unowned', enabled: true },
      { id: 'owned', enabled: true, craftingSystemId: 'alchemy' },
    ];
    const { model } = openModel({ viewState: viewStateFor({ environments }) });
    const record = { id: 'r', enabled: true };
    assert.equal(model.activeGatheringTaskEnvironmentCount(record), 2);
    assert.equal(model.activeGatheringEventEnvironmentCount(record), 1);
  });

  it('binds the presenters to the selected system', () => {
    const environments = [{ id: 'e1', craftingSystemId: 'alchemy', enabledTaskIds: ['t1'] }];
    const { model } = openModel({
      viewState: viewStateFor({ environments }),
      system: {
        sceneOptions: [{ uuid: 'Scene.a', img: 'scene.webp' }],
        managedItemOptions: [{ id: 'c1', name: 'Moonleaf' }],
      },
    });
    assert.equal(model.environmentImage({ sceneUuid: 'Scene.a' }), 'scene.webp');
    assert.equal(model.gatheringDropName({ componentId: 'c1' }), 'Moonleaf');
    assert.deepEqual(
      model.gatheringTaskReferencingEnvironments({ id: 't1' }).map((entry) => entry.id),
      ['e1']
    );
    assert.equal(model.gatheringModifierCardTitle('biome', 'event'), 'Biome modifiers');
  });

  // Each reason the environment draft stands in for the list's selection, and the one it does not.
  const DRAFT_DISPLAY = [
    { name: 'on the editor route', view: 'environment-edit', state: {}, usesDraft: true },
    { name: 'while dirty', view: 'environments', state: { environmentDraftDirty: true }, usesDraft: true },
    { name: 'while new', view: 'environments', state: { environmentDraftIsNew: true }, usesDraft: true },
    { name: 'as the selection', view: 'environments', state: { selectedEnvironmentId: 'draft' }, usesDraft: true },
    { name: 'otherwise', view: 'environments', state: {}, usesDraft: false },
  ];
  for (const { name, view, state, usesDraft } of DRAFT_DISPLAY) {
    it(`${usesDraft ? 'shows' : 'does not show'} the environment draft ${name}`, () => {
      const environments = [{ id: 'e1' }, { id: 'e2' }];
      const { model, live } = openModel({
        viewState: viewStateFor({
          environments,
          environmentDraft: { id: 'draft' },
          selectedEnvironmentId: 'e2',
          ...state,
        }),
      });
      live.set('view', view);
      flushSync();
      assert.equal(model.shouldUseEnvironmentDraftForDisplay, usesDraft);
      assert.equal(model.selectedEnvironment.id, usesDraft ? 'draft' : 'e2');
    });
  }

  it('offers a party realm override only with gathering and Travel & Realms on', () => {
    const { model, live } = openModel({
      viewState: viewStateFor({
        gatheringRealmSettings: { enabled: false },
        partyRealmOverridesAvailable: true,
      }),
    });
    assert.equal(model.partyRealmOverridesAvailable, false);
    assert.match(model.partyRealmOverridesUnavailableHint, /Enable Travel & Realms/);
    live.set('viewState', { ...live.get('viewState'), gatheringRealmSettings: { enabled: true } });
    flushSync();
    assert.equal(model.partyRealmOverridesAvailable, true);
    assert.equal(model.partyRealmOverridesUnavailableHint, '');
    live.set('system', { id: 'alchemy', features: { gathering: false } });
    live.set('canShow', false);
    flushSync();
    assert.equal(model.partyRealmOverridesAvailable, false);
    assert.match(model.partyRealmOverridesUnavailableHint, /Select a crafting system with Gathering/);
  });

  // An explicit `enabled` wins; without one the legacy single economy mode decides.
  const ECONOMIES = [
    { economy: { stamina: { enabled: true } }, stamina: true, nodes: false },
    { economy: { mode: 'stamina', stamina: { enabled: false } }, stamina: false, nodes: false },
    { economy: { mode: 'stamina' }, stamina: true, nodes: false },
    { economy: { mode: 'nodes', stamina: {} }, stamina: false, nodes: true },
    { economy: { nodes: { enabled: true }, resolutionMode: 'routed' }, stamina: false, nodes: true },
  ];
  for (const { economy, stamina, nodes } of ECONOMIES) {
    it(`reads the economy ${JSON.stringify(economy)}`, () => {
      const viewState = viewStateFor();
      viewState.gatheringConfig.systems.alchemy.economy = economy;
      const { model } = openModel({ viewState });
      assert.equal(model.selectedGatheringTaskStaminaEnabled, stamina);
      assert.equal(model.selectedGatheringTaskNodesEnabled, nodes);
      assert.equal(model.gatheringResolutionMode, economy.resolutionMode || 'd100');
    });
  }
});
