import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'svelte/store';

import { createGatheringStore } from '../../src/ui/svelte/stores/gatheringStore.js';

const actorA = { id: 'actor-a', uuid: 'Actor.actor-a', name: 'Rook', img: 'rook.webp' };
const actorB = { id: 'actor-b', uuid: 'Actor.actor-b', name: 'Vellum', img: 'vellum.webp' };

function makeListing(overrides = {}) {
  return {
    visible: true,
    attemptable: true,
    blockedReasons: [],
    state: 'ready',
    selectedActorId: 'actor-a',
    selectableActors: [
      { id: 'actor-a', name: 'Rook', img: 'rook.webp' },
      { id: 'actor-b', name: 'Vellum', img: 'vellum.webp' }
    ],
    environments: [
      {
        id: 'env-a',
        name: 'Old Mine',
        description: 'A narrow mine.',
        attemptable: true,
        blockedReasons: [],
        tasks: [
          {
            id: 'task-a',
            name: 'Gather Iron',
            label: 'Gather Iron',
            attemptable: true,
            blockedReasons: []
          }
        ]
      }
    ],
    activeRuns: [],
    history: [],
    ...overrides
  };
}

function makeServices(overrides = {}) {
  const settings = new Map(Object.entries({
    lastGatheringActor: '',
    ...(overrides.settings ?? {})
  }));
  const calls = {
    setSetting: [],
    list: [],
    start: [],
    info: [],
    warn: [],
    error: []
  };

  const services = {
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => {
      calls.setSetting.push({ key, value });
      settings.set(key, value);
    },
    getAvailableActors: () => [actorA, actorB],
    listGatheringForActor: async options => {
      calls.list.push(options);
      return makeListing(overrides.listing ?? {});
    },
    startGatheringAttempt: async options => {
      calls.start.push(options);
      if (overrides.startError) throw overrides.startError;
      return overrides.startResult ?? {
        accepted: true,
        started: true,
        state: 'succeeded',
        blockedReasons: []
      };
    },
    notify: {
      info: message => calls.info.push(message),
      warn: message => calls.warn.push(message),
      error: message => calls.error.push(message)
    },
    localize: (key, data) => data ? `${key}:${JSON.stringify(data)}` : key,
    ...overrides.services
  };

  return { services, calls, settings };
}

describe('createGatheringStore', () => {
  it('initializes from a valid lastGatheringActor preference', () => {
    const { services } = makeServices({ settings: { lastGatheringActor: 'actor-b' } });

    const store = createGatheringStore(services);
    const state = get(store.viewState);

    assert.equal(get(store.selectedActor)?.id, 'actor-b');
    assert.equal(state.selectedActorId, 'actor-b');
    assert.deepEqual(state.availableActors.map(actor => actor.id), ['actor-a', 'actor-b']);
  });

  it('clears invalid remembered gathering actors and falls back to a selectable actor', async () => {
    const { services, calls, settings } = makeServices({
      settings: { lastGatheringActor: 'actor-gone' }
    });

    const store = createGatheringStore(services);

    assert.equal(get(store.selectedActor)?.id, 'actor-a');
    assert.deepEqual(calls.setSetting, [{ key: 'lastGatheringActor', value: '' }]);
    assert.equal(settings.get('lastGatheringActor'), '');
  });

  it('persists valid actor selection', async () => {
    const { services, calls, settings } = makeServices();
    const store = createGatheringStore(services);

    await store.selectActor('actor-b');

    assert.equal(get(store.selectedActor)?.id, 'actor-b');
    assert.deepEqual(calls.setSetting.at(-1), { key: 'lastGatheringActor', value: 'actor-b' });
    assert.equal(settings.get('lastGatheringActor'), 'actor-b');
  });

  it('refreshes listing through viewer-safe injected listGatheringForActor options', async () => {
    const { services, calls } = makeServices({ settings: { lastGatheringActor: 'actor-b' } });
    const store = createGatheringStore(services);

    await store.refresh();

    assert.equal(calls.list.length, 1);
    assert.equal(calls.list[0].actor, actorB);
    assert.equal('viewer' in calls.list[0], false);
    assert.equal(get(store.viewState).environments[0].name, 'Old Mine');
  });

  it('carries active runs and history from listing into viewState', async () => {
    const { services } = makeServices({
      listing: {
        activeRuns: [{
          id: 'run-active',
          label: 'Gather Iron',
          status: 'waitingTime',
          timeGate: { availableAt: 500, requiredSeconds: 300 }
        }],
        history: [{
          id: 'run-history',
          label: 'Gather Iron',
          status: 'succeeded',
          completedAtWorldTime: 200,
          createdResultCount: 1,
          usedCatalystCount: 0
        }]
      }
    });
    const store = createGatheringStore(services);

    await store.refresh();
    const state = get(store.viewState);

    assert.deepEqual(state.activeRuns.map(run => run.id), ['run-active']);
    assert.deepEqual(state.history.map(run => run.id), ['run-history']);
  });

  it('normalizes system options and filters environments by selected gathering system', async () => {
    const { services } = makeServices({
      listing: {
        gatheringSystems: [
          { id: 'system-b', name: 'Alchemy' },
          { id: 'system-a', name: 'Mythwright' }
        ],
        environments: [
          { id: 'env-a', name: 'Mines', craftingSystemId: 'system-a', craftingSystemName: 'Mythwright', attemptable: true, blockedReasons: [], tasks: [] },
          { id: 'env-b', name: 'Greenhouse', craftingSystemId: 'system-b', craftingSystemName: 'Alchemy', attemptable: true, blockedReasons: [], tasks: [] }
        ],
        activeRuns: [{ id: 'run-a', craftingSystemId: 'system-a', craftingSystemName: 'Mythwright' }]
      }
    });
    const store = createGatheringStore(services);

    await store.refresh();
    assert.equal(get(store.viewState).hasMultipleGatheringSystems, true);
    assert.deepEqual(get(store.viewState).gatheringSystems.map(system => system.name), ['Alchemy', 'Mythwright']);
    assert.deepEqual(get(store.viewState).filteredEnvironments.map(environment => environment.id), ['env-a', 'env-b']);

    store.selectSystem('system-b');
    assert.equal(get(store.viewState).selectedSystemId, 'system-b');
    assert.deepEqual(get(store.viewState).filteredEnvironments.map(environment => environment.id), ['env-b']);

    store.selectSystem('missing-system');
    assert.equal(get(store.viewState).selectedSystemId, 'all');
  });

  it('tracks V2 tab, selected environment, selected task, and availability filter state', async () => {
    const { services } = makeServices({
      listing: {
        environments: [
          {
            id: 'env-a',
            name: 'Mines',
            attemptable: true,
            blockedReasons: [],
            tasks: [{ id: 'task-a', label: 'Gather Iron', attemptable: true, blockedReasons: [] }]
          },
          {
            id: 'env-b',
            name: 'Ruins',
            attemptable: false,
            blockedReasons: [{ code: 'SCENE_TOKEN_BLOCKED', message: 'Move to scene.' }],
            tasks: [{ action: 'blindGather', label: 'Gather', blind: true, attemptable: false, blockedReasons: [] }]
          }
        ]
      }
    });
    const store = createGatheringStore(services);

    await store.refresh();
    assert.equal(get(store.viewState).selectedEnvironmentId, null);
    assert.equal(get(store.viewState).selectedTaskKey, null);

    store.selectEnvironment('env-b');
    assert.equal(get(store.viewState).selectedEnvironmentId, 'env-b');
    assert.equal(get(store.viewState).selectedTaskKey, 'env-b:blindGather');

    store.selectTab('log');
    assert.equal(get(store.viewState).activeTab, 'log');

    store.setAvailabilityFilter('available');
    assert.deepEqual(get(store.viewState).filteredEnvironments.map(environment => environment.id), ['env-a']);
    assert.equal(get(store.viewState).selectedEnvironmentId, null);
    assert.equal(get(store.viewState).selectedTaskKey, null);
  });

  it('derives a stamina summary from rich task metadata', async () => {
    const { services } = makeServices({
      listing: {
        environments: [{
          id: 'env-a',
          name: 'Meadow',
          attemptable: true,
          blockedReasons: [],
          tasks: [{
            id: 'task-a',
            label: 'Harvest',
            attemptable: true,
            blockedReasons: [],
            rich: { stamina: { state: { current: 96, max: 120, provider: 'fabricate' } } }
          }]
        }]
      }
    });
    const store = createGatheringStore(services);

    await store.refresh();

    assert.deepEqual(get(store.viewState).staminaSummary, {
      current: 96,
      max: 120,
      provider: 'fabricate',
      regenerationMode: null
    });
  });

  it('starts a targeted task, refreshes listing, and notifies on success', async () => {
    const { services, calls } = makeServices();
    const store = createGatheringStore(services);

    await store.startTask('env-a', { id: 'task-a', label: 'Gather Iron' });

    assert.deepEqual(calls.start, [{
      actor: actorA,
      environmentId: 'env-a',
      taskId: 'task-a'
    }]);
    assert.equal(calls.list.length, 1);
    assert.deepEqual(calls.info, ['FABRICATE.Gathering.Notifications.Succeeded']);
    assert.equal(get(store.viewState).feedback.status, 'succeeded');
    assert.equal(get(store.viewState).feedback.label, 'Gather Iron');
  });

  it('does not show false started or duplicate generic warning notifications for immediate failed terminal results', async () => {
    const { services, calls } = makeServices({
      startResult: {
        accepted: true,
        started: true,
        state: 'failed',
        blockedReasons: [{ code: 'FAILED', message: 'The attempt failed.' }]
      }
    });
    const store = createGatheringStore(services);

    await store.startTask('env-a', { id: 'task-a', label: 'Gather Iron' });

    assert.deepEqual(calls.info, []);
    assert.deepEqual(calls.warn, []);
    assert.equal(get(store.viewState).lastResult.state, 'failed');
    assert.equal(get(store.viewState).feedback.status, 'failed');
    assert.equal(get(store.viewState).feedback.message, 'The attempt failed.');
  });

  it('starts a blind task without a task id and notifies on blocked attempts', async () => {
    const { services, calls } = makeServices({
      startResult: {
        accepted: false,
        started: false,
        state: 'SCENE_TOKEN_BLOCKED',
        blockedReasons: [{ code: 'SCENE_TOKEN_BLOCKED', message: 'Move to the linked scene.' }]
      }
    });
    const store = createGatheringStore(services);

    await store.startTask('blind-env', { action: 'blindGather', label: 'Gather' });

    assert.deepEqual(calls.start, [{
      actor: actorA,
      environmentId: 'blind-env',
      taskId: null
    }]);
    assert.equal(calls.list.length, 1);
    assert.deepEqual(calls.warn, ['Move to the linked scene.']);
    assert.equal(get(store.viewState).feedback.status, 'SCENE_TOKEN_BLOCKED');
    assert.equal(get(store.viewState).feedback.label, 'Gather');
  });

  it('notifies and records errors when startGatheringAttempt throws', async () => {
    const { services, calls } = makeServices({
      startError: new Error('runtime unavailable')
    });
    const store = createGatheringStore(services);

    await store.startTask('env-a', { id: 'task-a' });

    assert.equal(get(store.viewState).error, 'runtime unavailable');
    assert.deepEqual(calls.error, ['runtime unavailable']);
  });
});
