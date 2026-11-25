/**
 * The active iterative runs a manager editor counts: the pure walk, the store memo behind
 * `watchActiveRuns`, the route model's counts, and the actor hooks that republish the memo.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { SvelteMap } from 'svelte/reactivity';
import { writable } from 'svelte/store';

import { flushSync } from '../node_modules/svelte/src/index-client.js';
import { effect_root, user_effect } from '../node_modules/svelte/src/internal/client/index.js';
import { activeIterativeRuns } from '../src/systems/runTerms.js';
import { createIterativeLibrarySection } from '../src/ui/svelte/stores/adminIterativeLibrarySection.js';

import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';
import { withProductionApplication } from './helpers/extension-composition-harness.js';
import { buildLabContent } from './view-lab/world/labContent.js';
import { seedIterativeRecipes, seedIterativeState } from './view-lab/world/labIterative.js';

const snapshotWith = (...actionIds) => ({
  iterative: { version: 1, counters: [], actions: actionIds.map((id) => ({ id })) },
});

const run = (recipeId, craftingSystemId, termsSnapshot) => ({
  id: `run-${recipeId}`,
  recipeId,
  craftingSystemId,
  termsSnapshot,
});

/** A manager that answers `runs` for the actor named in its table, and breaks on any other member. */
function managerOf(table) {
  return new Proxy(
    { getActiveRuns: (actor) => table.get(actor) ?? [] },
    {
      get(target, key) {
        if (key !== 'getActiveRuns') throw new Error(`the walk read ${String(key)}`);
        return target[key];
      },
    }
  );
}

describe('activeIterativeRuns', () => {
  const arden = { id: 'arden' };
  const brisa = { id: 'brisa' };

  it('lists each run with an iterative snapshot, its system and the snapshot action ids', () => {
    const manager = managerOf(
      new Map([
        [arden, [run('blade', 'iron', snapshotWith('strike', 'stoke'))]],
        [brisa, [run('nail', 'iron', snapshotWith())]],
      ])
    );
    assert.deepEqual(activeIterativeRuns(manager, [arden, brisa]), [
      { recipeId: 'blade', craftingSystemId: 'iron', actionIds: ['strike', 'stoke'] },
      { recipeId: 'nail', craftingSystemId: 'iron', actionIds: [] },
    ]);
  });

  it('skips a run whose snapshot is an array, null, absent or has no iterative part', () => {
    const manager = managerOf(
      new Map([
        [
          arden,
          [
            run('a', 'iron', { iterative: [] }),
            run('b', 'iron', { iterative: null }),
            run('c', 'iron', {}),
            run('d', 'iron', null),
            run('e', 'iron', undefined),
            run('f', 'iron', { iterative: 'strike' }),
          ],
        ],
      ])
    );
    assert.deepEqual(activeIterativeRuns(manager, [arden]), []);
  });

  it('answers nothing without a manager, without actors, or for an actor with no runs', () => {
    assert.deepEqual(activeIterativeRuns(null, [arden]), []);
    assert.deepEqual(activeIterativeRuns(managerOf(new Map()), [arden, brisa]), []);
    assert.deepEqual(activeIterativeRuns(managerOf(new Map()), null), []);
    assert.deepEqual(activeIterativeRuns({}, [arden]), []);
  });

  it('reads only getActiveRuns, so history is never walked', () => {
    const manager = managerOf(new Map([[arden, [run('a', 'iron', snapshotWith('strike'))]]]));
    assert.equal(activeIterativeRuns(manager, [arden]).length, 1);
  });

  it('leaves deep-frozen runs unchanged and keeps ids it was given apart from the live library', () => {
    const frozen = structuredClone(run('a', 'iron', snapshotWith('strike')));
    const deepFreeze = (value) => {
      for (const child of Object.values(value)) {
        if (child && typeof child === 'object') deepFreeze(child);
      }
      return Object.freeze(value);
    };
    deepFreeze(frozen);
    const before = JSON.stringify(frozen);
    const [entry] = activeIterativeRuns(managerOf(new Map([[arden, [frozen]]])), [arden]);
    assert.equal(JSON.stringify(frozen), before);
    assert.deepEqual(entry.actionIds, ['strike']);
  });
});

describe('the section memo', () => {
  function memo() {
    const calls = { walks: 0 };
    let runs = [];
    const section = createIterativeLibrarySection({
      services: {
        getActiveIterativeRuns: () => {
          calls.walks += 1;
          return runs;
        },
      },
      selectedSystemId: writable('sys'),
      refresh: async () => {},
      confirmDiscardDirty: () => 'discard',
    });
    let current;
    section.activeIterativeRuns.subscribe((value) => {
      current = value;
    });
    return { section, calls, read: () => current, setRuns: (next) => (runs = next) };
  }
  const tick = () => new Promise((resolve) => queueMicrotask(resolve));

  it('is empty, and walks nothing, until it is watched', async () => {
    const { section, calls, read } = memo();
    assert.deepEqual(read(), []);
    section.scheduleActiveRunsRefresh();
    await tick();
    assert.equal(calls.walks, 0);
  });

  it('recomputes once when watching turns on', () => {
    const { section, calls, read, setRuns } = memo();
    setRuns([{ recipeId: 'blade', craftingSystemId: 'iron', actionIds: [] }]);
    section.watchActiveRuns(true);
    assert.equal(calls.walks, 1);
    assert.equal(read().length, 1);
  });

  it('coalesces two schedules in one tick into one walk', async () => {
    const { section, calls } = memo();
    section.watchActiveRuns(true);
    section.scheduleActiveRunsRefresh();
    section.scheduleActiveRunsRefresh();
    await tick();
    await tick();
    assert.equal(calls.walks, 2, 'one on entry and one for the two schedules');
  });

  it('does nothing once watching is turned off', async () => {
    const { section, calls } = memo();
    section.watchActiveRuns(true);
    section.watchActiveRuns(false);
    section.scheduleActiveRunsRefresh();
    await tick();
    await tick();
    assert.equal(calls.walks, 1);
  });

  it('is empty without the service', () => {
    const section = createIterativeLibrarySection({
      services: {},
      selectedSystemId: writable('sys'),
      refresh: async () => {},
      confirmDiscardDirty: () => 'discard',
    });
    section.watchActiveRuns(true);
    let current;
    section.activeIterativeRuns.subscribe((value) => {
      current = value;
    });
    assert.deepEqual(current, []);
  });
});

describe('the route model counts', () => {
  const MODULE_PATH = 'src/ui/svelte/apps/manager/iterative/iterativeRouteModel.svelte.js';
  let compiler;
  let createIterativeRouteModel;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-iterative-route-model-');
    ({ createIterativeRouteModel } = await compiler.loadWithClosure(MODULE_PATH));
  });

  after(() => compiler.cleanup());

  const RUNS = [
    { recipeId: 'blade', craftingSystemId: 'iron', actionIds: ['strike'] },
    { recipeId: 'blade', craftingSystemId: 'iron', actionIds: ['strike', 'stoke'] },
    { recipeId: 'blade', craftingSystemId: 'other', actionIds: ['strike'] },
    { recipeId: 'nail', craftingSystemId: 'iron', actionIds: [] },
  ];

  function open(view = 'recipe-edit') {
    const live = new SvelteMap([['view', view]]);
    const memo = writable(RUNS);
    const watched = [];
    const store = {
      iterative: {
        activeIterativeRuns: { subscribe: memo.subscribe },
        watchActiveRuns: (on) => {
          watched.push(on);
        },
      },
    };
    // Built outside any component effect, as the action editor's suite builds it.
    const model = createIterativeRouteModel({
      store: () => store,
      selectedSystem: () => ({ id: 'iron', resolutionMode: 'iterative' }),
      currentView: () => live.get('view'),
      viewState: () => null,
      setView: () => {},
      services: () => ({}),
      text: (key, fallback) => fallback,
    });
    return { model, live, watched, memo };
  }

  it('counts the selected system only, and each recipe and action on its own', () => {
    const { model } = open();
    assert.equal(model.activeRunCount('blade'), 2);
    assert.equal(model.activeRunCount('nail'), 1);
    assert.equal(model.activeRunCount('ghost'), 0);
    assert.equal(model.actionActiveRunCount('strike'), 2);
    assert.equal(model.actionActiveRunCount('stoke'), 1);
  });

  it('reads the snapshot action ids, so an action the library no longer holds still counts', () => {
    const { model } = open('iterative-action-edit');
    assert.equal(model.actionActiveRunCount('strike'), 2);
  });

  it('answers 0 off the editor routes', () => {
    const { model, live } = open('iterative-actions');
    assert.equal(model.activeRunCount('blade'), 0);
    assert.equal(model.actionActiveRunCount('strike'), 0);
    live.set('view', 'recipe-edit');
    flushSync();
    assert.equal(model.activeRunCount('blade'), 2);
  });

  it('is built outside a component without an error, and leaves the watch off', () => {
    const { watched } = open();
    flushSync();
    assert.deepEqual(watched, []);
  });

  it('watches the memo only on an editor route, and stops with the effect that asked', () => {
    const { model, live, watched } = open('iterative-actions');
    const stop = effect_root(() => {
      user_effect(() => model.watchRuns(live.get('view')));
    });
    flushSync();
    live.set('view', 'recipe-edit');
    flushSync();
    live.set('view', 'iterative-actions');
    flushSync();
    stop();
    assert.deepEqual(watched, [false, false, true, false, false, false]);
  });

  it('republishes a count when the memo changes', () => {
    const { model, memo } = open();
    assert.equal(model.activeRunCount('nail'), 1);
    memo.set([]);
    flushSync();
    assert.equal(model.activeRunCount('nail'), 0);
  });
});

describe('the actor hooks that republish the memo', () => {
  const CRAFTING_DIFF = { flags: { fabricate: { fabricate: { craftingRuns: { active: {} } } } } };

  it('schedules on every actor create and delete, and on a crafting-run diff only', async () => {
    const scheduled = [];
    const store = {
      iterative: {
        scheduleActiveRunsRefresh: () => {
          scheduled.push('runs');
        },
      },
    };
    const drained = () => {
      const taken = [...scheduled];
      scheduled.length = 0;
      return taken;
    };
    const { handlersFor } = await captureHandlers(store);
    const [onCreate] = handlersFor('createActor');
    const [onUpdate] = handlersFor('updateActor');
    assert.equal(handlersFor('deleteActor')[0], onCreate);

    onCreate({});
    assert.deepEqual(drained(), ['runs'], 'every actor create or delete');
    onUpdate({}, CRAFTING_DIFF);
    assert.deepEqual(drained(), ['runs'], 'a crafting-run diff');
    onUpdate({}, { system: { attributes: { hp: { value: 3 } } } });
    onUpdate({}, { flags: { fabricate: { gatheringRuns: {} } } });
    onUpdate({}, { name: 'Renamed' });
    assert.deepEqual(drained(), [], 'an HP tick, a gathering run or a rename');
  });

  it('tolerates a store with no iterative section', async () => {
    const { handlersFor } = await captureHandlers({});
    assert.doesNotThrow(() => handlersFor('createActor')[0]({}));
    assert.doesNotThrow(() => handlersFor('updateActor')[0]({}, CRAFTING_DIFF));
  });
});

describe('the lab midRun state', () => {
  /** A run manager over the lab actors' persisted flags, as the booted runtime reads them. */
  function labManager() {
    return {
      getActiveRuns: (actor) =>
        Object.values(actor.flags?.fabricate?.fabricate?.craftingRuns?.active ?? {}),
    };
  }
  const totals = (state) => {
    const content = buildLabContent();
    seedIterativeState(content, 'populated');
    const actors = [
      { uuid: 'Actor.a', flags: {} },
      { uuid: 'Actor.b', flags: {} },
    ];
    seedIterativeRecipes(content, actors, state);
    return activeIterativeRuns(labManager(), actors);
  };

  it('holds two Blade runs that can use strike, and none in any other state', () => {
    const runs = totals('midRun');
    assert.equal(runs.length, 2);
    assert.ok(runs.every((entry) => entry.recipeId === 'iw-r-blade'));
    assert.ok(runs.every((entry) => entry.craftingSystemId === 'lab-ironworks'));
    assert.ok(runs.every((entry) => entry.actionIds.includes('strike')));
    for (const state of ['authoring', 'multiStepOff', 'noLibrary', null, 'nonsense']) {
      assert.deepEqual(totals(state), [], String(state));
    }
  });
});

/** The production hook handlers, registered against a recording `Hooks` over `store`. */
async function captureHandlers(store) {
  const registrations = [];
  await withProductionApplication(
    {
      modulePath: '/src/ui/SvelteCraftingSystemManagerApp.svelte.js',
      exportName: 'SvelteCraftingSystemManagerApp',
      ApplicationV2: class {},
      hooks: {
        on: (hook, handler) => {
          registrations.push([hook, handler]);
        },
        off: () => {},
        once: () => 1,
      },
    },
    (app) => {
      app._adminStore = store;
      app._registerUserHooks();
    }
  );
  return {
    handlersFor: (hook) =>
      registrations.filter(([name]) => name === hook).map(([, handler]) => handler),
  };
}
