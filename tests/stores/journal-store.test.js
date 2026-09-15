/**
 * Coverage for the player-facing journalStore runes factory
 * (`src/ui/svelte/stores/journalStore.svelte.js`). Compiled like the actor-bar
 * store so the `$state`/`$derived` runes evaluate. Asserts the explicit
 * comparators (soonest-ready vs newest), history pagination, the selectedRun
 * completion fallback, advance notify-on-failure + refetch, navCount, and the
 * recent-terminal mini-history.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileModule } from 'svelte/compiler';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { rewriteClientImports } from '../helpers/rewriteClientImports.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let createJournalStore;


function writeCompiledModule(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compileModule(source, { filename: sourcePath, generate: 'client', dev: true });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

/** Copy a plain `.js` leaf the compiled store imports into the temp tree. */
function writePlainModule(sourcePath) {
  const destination = join(tempRoot, sourcePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, sourcePath), 'utf8'));
}

const EN = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));

/** Resolve a dotted `lang/en.json` path to its string leaf, or undefined. */
function langLeaf(key) {
  const leaf = key.split('.').reduce((node, segment) => node?.[segment], EN);
  return typeof leaf === 'string' ? leaf : undefined;
}

function run(overrides = {}) {
  const runType = overrides.runType ?? 'crafting';
  const id = overrides.id ?? 'run-1';
  return {
    id,
    key: JSON.stringify(['Actor.actor-1', runType, id]),
    actorUuid: 'Actor.actor-1',
    runType,
    activityKind: overrides.activityKind ?? runType,
    lifecycleContract: overrides.lifecycleContract ?? 'legacy',
    lifecycleVersion: overrides.lifecycleVersion ?? null,
    runRevision: overrides.runRevision ?? 0,
    derivedStatus: overrides.derivedStatus ?? 'inProgress',
    names: overrides.names ?? { title: id, subtitle: '' },
    actions: overrides.actions ?? {
      execute: true,
      pause: true,
      resume: true,
      setCompletionMode: true,
      setSelection: true,
      cancel: true,
      dismiss: false,
    },
    ...overrides,
  };
}

const ACTIVE = [
  run({ id: 'a', recipeId: 'r-a', startedAt: 80, timeGate: { availableAt: 1000 }, derivedStatus: 'waiting' }),
  run({ id: 'b', recipeId: 'r-b', startedAt: 50, timeGate: { availableAt: 100 }, derivedStatus: 'ready' }),
];

function history(count = 8) {
  return Array.from({ length: count }, (_unused, index) => ({
    ...run({
      id: `h${index + 1}`,
      derivedStatus: 'succeeded',
      actions: { dismiss: true },
    }),
    finishedAt: 100 - index * 10,
  }));
}

function baseListing(overrides = {}) {
  const hist = overrides.history ?? history();
  const active = overrides.activeRuns ?? ACTIVE;
  return {
    selectedActorId: overrides.selectedActorId ?? 'actor-1',
    selectedActorUuid: overrides.selectedActorUuid ?? 'Actor.actor-1',
    counts: { active: active.length, history: hist.length },
    activeRuns: active,
    history: hist
  };
}

function makeServices(overrides = {}) {
  const calls = { list: 0, advance: [], cancel: [], command: [], dismiss: [], notify: [] };
  const state = { listing: overrides.listing ?? baseListing() };
  const services = {
    getWorldTime: () => overrides.worldTime ?? 200,
    getSelectedActorId: () => 'actor-1',
    listJournalForActor: async () => {
      calls.list += 1;
      return state.listing;
    },
    advanceCraftingRun: async (args) => {
      calls.advance.push(args);
      if (overrides.advanceThrows) throw new Error('boom');
      return overrides.advanceResult ?? { success: true, message: 'Done' };
    },
    cancelCraftingRun: async (args) => {
      calls.cancel.push(args);
      if (overrides.cancelThrows) throw new Error('boom');
      return overrides.cancelResult ?? { success: true, cancelled: true, message: 'Craft cancelled.' };
    },
    executeJournalRunCommand: async (args) => {
      calls.command.push(args);
      if (overrides.commandThrows) throw new Error('command boom');
      return overrides.commandResult ?? { success: true, message: 'Updated' };
    },
    dismissJournalRun: async (args) => {
      calls.dismiss.push(args);
      if (overrides.dismissThrows) throw new Error('dismiss boom');
      return overrides.dismissResult ?? { success: true, message: 'Dismissed' };
    },
    notify: (message) => calls.notify.push(message),
    craftErrorMessage: () => 'Crafting failed.',
    // The REAL shipped strings: an echoing stub would hide a missing lang leaf.
    localize: (key) => langLeaf(key) ?? key
  };
  return { services, calls, state };
}

async function loadedStore(setup) {
  const store = createJournalStore({ services: setup.services });
  await store.load();
  flushSync();
  return store;
}

describe('journalStore', () => {
  before(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-journal-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    // Issue 1648: the authority-refusal wording. A leaf the store imports but the
    // temp tree lacks throws in `before` and CANCELS every subtest here.
    writePlainModule('src/ui/svelte/util/journalRunReasons.js');
    writeCompiledModule('src/ui/svelte/stores/journalStore.svelte.js');
    createJournalStore = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/stores/journalStore.svelte.js.js'
    )))).createJournalStore;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('correlates a trusted completed command notice and clears it on reselect', async () => {
    const active = run({ lifecycleContract: 'current' });
    const setup = makeServices({ listing: baseListing({ activeRuns: [active], history: [] }) });
    const store = await loadedStore(setup);
    setup.services.executeJournalRunCommand = async () => {
      setup.state.listing = baseListing({ activeRuns: [], history: [{ ...active, status: 'succeeded', runRevision: 1 }] });
      return { success: true, message: 'Untrusted presentation is not copied' };
    };
    await store.execute(active);
    flushSync();
    assert.deepEqual(store.commandResult, { runKey: active.key });
    store.select(store.selectedRun);
    assert.equal(store.commandResult, null);
  });

  for (const change of ['reselect', 'actor', 'timeout']) {
    it(`does not publish transient evidence after ${change}`, async () => {
      const active = run({ lifecycleContract: 'current' });
      const setup = makeServices({ listing: baseListing({ activeRuns: [active], history: [] }) });
      let complete;
      setup.services.executeJournalRunCommand = () => new Promise((resolve) => { complete = resolve; });
      const store = await loadedStore(setup);
      const pending = store.execute(active);
      if (change === 'reselect') store.select(active);
      if (change === 'actor') setup.services.getSelectedActorId = () => 'actor-2';
      setup.state.listing = baseListing({ activeRuns: [], history: [{ ...active, status: 'succeeded' }] });
      complete(change === 'timeout' ? { success: false, reason: 'timeout' } : { success: true });
      await pending;
      assert.equal(store.commandResult, null);
      assert.equal(store.busyRunKey, '');
    });
  }

  // Issue 1648: manual setup is GONE. The ledger is provisioned automatically, so the only
  // run the setup button could ever appear on is one no world reaches, and a store seam for it
  // would be an affordance for an impossible state. What the store still owes a blocked run is
  // its REASON, passed through untouched for the shared vocabulary to word.
  it('offers no manual authority setup and passes a blocked run its reason untouched', async () => {
    const blocked = run({
      lifecycleContract: 'current',
      actions: { disabledReason: 'ledger-missing' },
    });
    let setupCalls = 0;
    const store = createJournalStore({ services: {
      isActiveGM: () => true,
      getSelectedActorId: () => 'actor-1',
      listJournalForActor: async () => baseListing({ activeRuns: [blocked] }),
      setupJournalRunAuthority: () => { setupCalls += 1; return { success: true }; },
    } });
    await store.load();
    for (const removed of [
      'canSetupAuthority',
      'setupAuthority',
      'authoritySetupBusy',
      'authoritySetupError',
    ]) {
      assert.equal(removed in store, false, `${removed} is retired manual-setup surface`);
    }
    assert.equal(setupCalls, 0, 'the store never reaches the compatibility setup seam');
    assert.equal(store.selectedRun.actions.disabledReason, 'ledger-missing');
    assert.equal(
      typeof langLeaf('FABRICATE.App.Journal.Actions.LedgerMissing'),
      'string',
      'and the reason the detail words it with still resolves to a real string'
    );
  });

  it('loads the listing and exposes navCount from counts.active', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);

    assert.equal(setup.calls.list, 1);
    assert.equal(store.navCount, 2);
    assert.equal(store.loadedOnce, true);
    assert.equal(store.error, false);
    assert.equal(store.selectedRunKey, store.selectedRun.key, 'initial row and detail share a selection');
    assert.equal(store.selectedRunId, store.selectedRun.id);
  });

  it('sorts active runs soonest-ready (ready first, then ascending availableAt)', async () => {
    const store = await loadedStore(makeServices());
    assert.deepEqual(store.activeRuns.map((run) => run.id), ['b', 'a'], 'ready b before waiting a');

    store.setActiveSort('newest');
    flushSync();
    assert.deepEqual(store.activeRuns.map((run) => run.id), ['a', 'b'], 'newest by startedAt');
  });

  it('paginates history with the page size', async () => {
    const store = await loadedStore(makeServices());
    assert.equal(store.historyPageSize, 4);
    assert.equal(store.historyPageItems.length, 4);
    assert.deepEqual(store.historyPageItems[0].id, 'h1', 'newest first');

    store.setHistoryPage(1);
    flushSync();
    assert.equal(store.historyPageItems.length, 4, 'remaining 4 of 8');
  });

  it('exposes the top recent terminal runs', async () => {
    const store = await loadedStore(makeServices());
    assert.deepEqual(store.recentTerminalRuns.map((run) => run.id), ['h1', 'h2', 'h3']);
  });

  it('selectedRun re-resolves the same id after a run moves to history, then falls back', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);

    store.select('a');
    flushSync();
    assert.equal(store.selectedRun.id, 'a');

    // Run 'a' completes: it leaves activeRuns and appears in history.
    setup.state.listing = baseListing({
      activeRuns: [ACTIVE[1]],
      history: [run({ id: 'a', derivedStatus: 'succeeded', finishedAt: 200 }), ...history()]
    });
    await store.load(true);
    flushSync();
    assert.equal(store.selectedRun.id, 'a', 're-resolves the same id in history');

    // Selecting an unknown id falls back to the first active run (soonest ready).
    store.select('missing');
    flushSync();
    assert.equal(store.selectedRun.id, 'b');
  });

  it('filters by kind, search, and mutually exclusive active status while counting the kind cohort first', async () => {
    const activeRuns = [
      run({ id: 'craft-ready', activityKind: 'crafting', derivedStatus: 'ready', names: { title: 'Iron Sword', subtitle: 'Forge' } }),
      run({ id: 'craft-wait', activityKind: 'crafting', derivedStatus: 'waiting', names: { title: 'Oak Shield', subtitle: 'Forge' } }),
      run({ id: 'craft-paused', activityKind: 'crafting', derivedStatus: 'paused', names: { title: 'Silver Ring', subtitle: 'Forge' } }),
      run({ id: 'brew', activityKind: 'alchemy', derivedStatus: 'ready', names: { title: 'Silver Draught', subtitle: 'Alchemy' } }),
      run({ id: 'gather', runType: 'gathering', activityKind: 'gathering', derivedStatus: 'waiting', names: { title: 'Silver Herbs', subtitle: 'Wilds' } }),
    ];
    const store = await loadedStore(makeServices({ listing: baseListing({ activeRuns, history: [] }) }));

    store.setKindFilter('crafting');
    store.setSearch('silver');
    store.setActiveStatusFilter('paused');
    flushSync();

    assert.deepEqual(store.activeCounts, { all: 3, ready: 1, inProgress: 1, paused: 1 });
    assert.deepEqual(store.activeRuns.map((entry) => entry.id), ['craft-paused']);
    store.setActiveStatusFilter('ready');
    flushSync();
    assert.deepEqual(store.activeRuns, [], 'search is applied after the pre-filter counts');
  });

  // Issue 1648, D-029/M19. `Waiting` and `In progress` collapse into one badge, and the filter
  // vocabulary must not diverge from the badge vocabulary. This is a MERGE rather than a rename:
  // before it there was no tab for `inProgress` at all, so a run between stages — or any unbegun
  // stage — matched nothing but `All`, which is why the maintainer's own frame reads
  // `Active (1)` beside `Ready 0, Waiting 0, Paused 0`.
  it('selects both merged statuses from the one In progress tab, and counts them together', async () => {
    const activeRuns = [
      run({ id: 'craft-ready', derivedStatus: 'ready' }),
      run({ id: 'craft-wait', derivedStatus: 'waiting' }),
      run({ id: 'craft-between-stages', derivedStatus: 'inProgress' }),
      run({ id: 'craft-unbegun', derivedStatus: 'inProgress' }),
      run({ id: 'craft-paused', derivedStatus: 'paused' }),
    ];
    const store = await loadedStore(makeServices({ listing: baseListing({ activeRuns, history: [] }) }));
    flushSync();

    assert.deepEqual(store.activeCounts, { all: 5, ready: 1, inProgress: 3, paused: 1 });
    assert.equal(
      store.activeCounts.ready + store.activeCounts.inProgress + store.activeCounts.paused,
      store.activeCounts.all,
      'every active run is reachable from exactly one tab'
    );

    store.setActiveStatusFilter('inProgress');
    flushSync();
    assert.deepEqual(
      store.activeRuns.map((entry) => entry.id).sort(),
      ['craft-between-stages', 'craft-unbegun', 'craft-wait'],
      'the one tab selects the previously-waiting runs AND the previously-unreachable ones'
    );
    assert.equal(store.activeStatusFilter, 'inProgress');

    // The retired tab value is not silently honoured: the vocabulary moved, and a stale caller
    // gets the filter it already had rather than a tab that no longer exists.
    store.setActiveStatusFilter('waiting');
    flushSync();
    assert.equal(store.activeStatusFilter, 'inProgress', 'the retired value is refused');
  });

  it('keeps active/history pages independent, accepts 4/6/12/25 sizes, and clamps after filtering or reload deletion', async () => {
    const activeRuns = Array.from({ length: 10 }, (_unused, index) => run({ id: `a${index}`, startedAt: index }));
    const setup = makeServices({ listing: baseListing({ activeRuns, history: history(10) }) });
    const store = await loadedStore(setup);

    assert.deepEqual(store.pageSizes, [4, 6, 12, 25]);
    assert.equal(store.activePageSize, 4);
    assert.equal(store.historyPageSize, 4);
    store.setActivePage(2);
    store.setHistoryPage(2);
    flushSync();
    assert.equal(store.activePageItems.length, 2);
    assert.equal(store.historyPageItems.length, 2);

    store.setActivePageSize(6);
    flushSync();
    assert.equal(store.activePage, 0);
    assert.equal(store.historyPage, 2, 'history pager is independent');

    store.setHistoryPageSize(25);
    flushSync();
    assert.equal(store.historyPage, 0);
    store.setHistoryPage(9);
    flushSync();
    assert.equal(store.historyPage, 0, 'setter clamps to the last real page');

    store.setActivePageSize(4);
    store.setActivePage(2);
    setup.state.listing = baseListing({ activeRuns: activeRuns.slice(0, 2), history: history(2) });
    await store.load(true);
    flushSync();
    assert.equal(store.activePage, 0, 'reload deletion clamps active page');
  });

  it('retains selected detail when filtered or off-page and falls back only after actual removal', async () => {
    const activeRuns = Array.from({ length: 7 }, (_unused, index) => run({
      id: `a${index}`,
      activityKind: index === 6 ? 'alchemy' : 'crafting',
      names: { title: index === 6 ? 'Hidden Brew' : `Craft ${index}`, subtitle: '' },
    }));
    const setup = makeServices({ listing: baseListing({ activeRuns, history: [] }) });
    const store = await loadedStore(setup);
    store.select(activeRuns[6]);
    store.setKindFilter('crafting');
    store.setSearch('no-match');
    flushSync();

    assert.equal(store.selectedRun.id, 'a6', 'filtering does not change detail selection');
    assert.equal(store.selectedRunId, 'a6');
    assert.equal(store.selectedRunKey, activeRuns[6].key);

    setup.state.listing = baseListing({ activeRuns: activeRuns.slice(0, 6), history: [] });
    await store.load(true);
    flushSync();
    assert.equal(store.selectedRun.id, 'a0', 'actual removal chooses a remaining fallback');
    assert.equal(store.selectedRunKey, activeRuns[0].key);
    assert.equal(store.selectedRunId, 'a0');
  });

  it('retains the initial fallback selection across listing reorder and off-page filtering', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);
    const initialKey = store.selectedRun.key;
    store.setSearch('no-match');
    setup.state.listing = baseListing({ activeRuns: [...ACTIVE].reverse() });
    await store.load(true);
    flushSync();
    assert.equal(store.selectedRun.key, initialKey);
    assert.equal(store.selectedRunKey, initialKey);
  });

  it('uses composite selection so identical ids across run types do not collide', async () => {
    const crafting = run({ id: 'same', runType: 'crafting', names: { title: 'Craft', subtitle: '' } });
    const gathering = run({ id: 'same', runType: 'gathering', names: { title: 'Gather', subtitle: '' } });
    const store = await loadedStore(makeServices({ listing: baseListing({ activeRuns: [crafting, gathering], history: [] }) }));

    store.select(gathering);
    flushSync();
    assert.equal(store.selectedRun.names.title, 'Gather');
    assert.equal(store.selectedRunKey, gathering.key);
  });

  it('keeps viewed stage separate from executable stage and can return to current', async () => {
    const crafting = run({ id: 'stages', stepIndex: 2, steps: [{ index: 0 }, { index: 1 }, { index: 2 }] });
    const store = await loadedStore(makeServices({ listing: baseListing({ activeRuns: [crafting], history: [] }) }));
    store.select(crafting);
    store.viewStage(crafting, 0);
    flushSync();

    assert.equal(store.selectedRun.stepIndex, 2, 'persisted executable index is unchanged');
    assert.equal(store.viewedStageIndex, 0);
    assert.equal(store.viewedStage.index, 0);
    store.returnToCurrentStage(crafting);
    flushSync();
    assert.equal(store.viewedStageIndex, 2);
  });

  it('routes versioned commands with native composite identity/revision and refreshes', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);
    const selected = run({
      ...ACTIVE[1],
      lifecycleContract: 'current',
      lifecycleVersion: 1,
      runRevision: 0,
      stepIndex: 2,
    });

    await store.execute(selected, { interactive: true });
    await store.pause(selected);
    await store.resume(selected);
    await store.setCompletionMode(selected, 'worldTime');
    await store.setSelection(selected, { selectedIngredientSetId: 'set-1' });
    flushSync();

    assert.deepEqual(setup.calls.command.map(({ action }) => action), [
      'execute', 'pause', 'resume', 'setCompletionMode', 'setSelection',
    ]);
    assert.deepEqual(setup.calls.command[0], {
      actorUuid: 'Actor.actor-1',
      runType: 'crafting',
      runId: 'b',
      expectedRevision: 0,
      action: 'execute',
      payload: { interactive: true },
    });
    assert.equal(setup.calls.list, 6, 'each settled command refreshes authoritative state');
    assert.deepEqual(setup.calls.command[4].payload, {
      stepIndex: 2,
      selectionPlan: { selectedIngredientSetId: 'set-1' },
    }, 'selection targets the executable stage with the authority command contract');
    assert.equal(store.busyRunId, '');
  });

  it('anchors a terminal null execution index at its final stage without changing history', async () => {
    const terminal = run({ id: 'terminal', stepIndex: null, derivedStatus: 'succeeded',
      steps: [{ index: 0 }, { index: 1 }, { index: 2 }] });
    const store = await loadedStore(makeServices({ listing: baseListing({ activeRuns: [], history: [terminal] }) }));
    assert.equal(store.viewedStageIndex, 2);
    store.viewStage(terminal, 0);
    flushSync();
    assert.equal(store.viewedStageIndex, 0);
    store.returnToCurrentStage();
    flushSync();
    assert.equal(store.viewedStageIndex, 2);
    assert.equal(store.selectedRun.stepIndex, null);
  });

  for (const lifecycleContract of ['legacy', undefined, 'current']) {
    for (const status of ['succeeded', 'failed', 'done']) {
      it(`anchors ${lifecycleContract ?? 'missing-contract'} terminal history at ${status} evidence`, async () => {
        const terminal = run({ id: 'early-terminal', stepIndex: null, derivedStatus: 'failed',
          steps: [{ index: 0, status: 'succeeded' }, { index: 1, status }, { index: 2, status: 'pending' }] });
        terminal.lifecycleContract = lifecycleContract;
        const setup = makeServices({ listing: baseListing({ activeRuns: [], history: [terminal] }) });
        const store = await loadedStore(setup);
        const expected = lifecycleContract === 'current' ? 2 : 1;
        assert.equal(store.viewedStageIndex, expected);
        assert.equal(store.viewedStage.status, terminal.steps[expected].status);
        store.viewStage(terminal, 0);
        flushSync();
        await store.load(true);
        assert.equal(store.viewedStageIndex, 0, 'explicit browsing survives refresh');
        store.returnToCurrentStage();
        flushSync();
        assert.equal(store.viewedStageIndex, expected);
        assert.equal(store.selectedRun.stepIndex, null, 'browsing never changes execution history');
      });
    }
  }

  for (const staleOutcome of ['success', 'failure', 'empty']) {
    for (const latestFirst of [false, true]) {
      it(`ignores stale actor load ${staleOutcome} with latestFirst=${latestFirst}`, async () => {
        const setup = makeServices();
        let actorId = 'actor-1';
        const requests = [];
        setup.services.getSelectedActorId = () => actorId;
        setup.services.listJournalForActor = ({ rememberedActorId }) => {
          const deferred = Promise.withResolvers();
          requests.push({ ...deferred, actorId: rememberedActorId });
          return deferred.promise;
        };
        const store = createJournalStore({ services: setup.services });
        const older = store.load();
        actorId = 'actor-2';
        const latest = store.load();
        const next = baseListing({ selectedActorId: actorId, selectedActorUuid: 'Actor.actor-2',
          activeRuns: [run({ id: 'new-actor', actorUuid: 'Actor.actor-2' })], history: [] });
        assert.deepEqual(requests.map((request) => request.actorId), ['actor-1', 'actor-2']);
        if (latestFirst) {
          requests[1].resolve(next);
          await latest;
        }
        if (staleOutcome === 'failure') requests[0].reject(new Error('old actor failed'));
        else requests[0].resolve(staleOutcome === 'empty' ? null : baseListing());
        await older;
        flushSync();
        assert.equal(store.loading, !latestFirst, 'only the latest request settles loading');
        assert.equal(store.loadedOnce, latestFirst, 'stale completion does not mark the latest load complete');
        assert.equal(store.error, false);
        if (!latestFirst) {
          assert.equal(store.listing, null, 'stale success is not published while the new actor loads');
          requests[1].resolve(next);
          await latest;
        }
        flushSync();
        assert.equal(store.listing.selectedActorId, 'actor-2');
        assert.equal(store.selectedRun.id, 'new-actor');
        assert.equal(store.selectedRunKey, store.selectedRun.key);
        assert.equal(store.loading, false);
        assert.equal(store.error, false);
      });
    }
  }

  it('fails closed when the projection does not make a versioned action available', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);
    const current = run({
      id: 'blocked',
      lifecycleContract: 'current',
      lifecycleVersion: 1,
      actions: { execute: false, pause: false },
    });

    await store.pause(current);

    assert.deepEqual(setup.calls.command, []);
    assert.equal(setup.calls.list, 1, 'a rejected local action does not churn the listing');
  });

  it('keeps a newer same-actor load failure after an older success arrives', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);
    const olderRequest = Promise.withResolvers();
    const latestRequest = Promise.withResolvers();
    const requests = [olderRequest, latestRequest];
    setup.services.listJournalForActor = () => requests.shift().promise;
    const older = store.load(true);
    const latest = store.load();
    latestRequest.reject(new Error('latest failed'));
    await latest;
    olderRequest.resolve(baseListing({ activeRuns: [], history: [] }));
    await older;
    flushSync();
    assert.equal(store.error, true);
    assert.equal(store.loading, false);
    assert.equal(store.activeCount, ACTIVE.length, 'stale success does not replace the last accepted listing');
  });

  it('does not accept a pending result after the selected actor changes before another load starts', async () => {
    const setup = makeServices();
    let actorId = 'actor-1';
    const request = Promise.withResolvers();
    setup.services.getSelectedActorId = () => actorId;
    setup.services.listJournalForActor = () => request.promise;
    const store = createJournalStore({ services: setup.services });
    const pending = store.load();
    actorId = 'actor-2';
    request.resolve(baseListing());
    await pending;
    flushSync();
    assert.equal(store.listing, null);
    assert.equal(store.loadedOnce, false);
    assert.equal(store.loading, false);
    assert.equal(store.error, false);
  });

  it('dismisses terminal entries at the service seam and only falls back after reload removes them', async () => {
    const done = history(2);
    const setup = makeServices({ listing: baseListing({ activeRuns: [], history: done }) });
    const store = await loadedStore(setup);
    store.select(done[0]);
    setup.services.dismissJournalRun = async (args) => {
      setup.calls.dismiss.push(args);
      setup.state.listing = baseListing({ activeRuns: [], history: [done[1]] });
      return { success: true };
    };

    await store.dismiss(done[0]);
    flushSync();

    assert.deepEqual(setup.calls.dismiss, [{
      actorUuid: 'Actor.actor-1',
      runType: 'crafting',
      runId: 'h1',
    }]);
    assert.equal(store.selectedRun.id, 'h2');
  });

  it('command errors clear busy state, notify, and refresh without rejecting', async () => {
    const setup = makeServices({ commandThrows: true });
    const store = await loadedStore(setup);

    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
    await assert.doesNotReject(() => store.pause(current));
    flushSync();

    assert.equal(store.busyRunId, '');
    assert.deepEqual(setup.calls.notify, ['Crafting failed.']);
    assert.equal(setup.calls.list, 2, 'failure refreshes authoritative state');
    assert.deepEqual(store.commandError, {
      runKey: current.key,
      actorUuid: current.actorUuid,
      message: 'Crafting failed.',
    });
  });

  it('keeps a safe run-scoped refusal through a failed refresh and clears it on retry', async () => {
    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
    const setup = makeServices({
      listing: baseListing({ activeRuns: [current], history: [] }),
      commandResult: { success: false, message: 'The run changed. Try again.' },
    });
    const store = await loadedStore(setup);
    store.select(current);
    setup.services.listJournalForActor = async () => {
      throw new Error('refresh failed');
    };

    await store.pause(current);
    flushSync();
    assert.deepEqual(store.commandError, {
      runKey: current.key,
      actorUuid: current.actorUuid,
      message: 'The run changed. Try again.',
    });
    assert.deepEqual(setup.calls.notify, ['The run changed. Try again.']);
    assert.equal(store.error, false, 'a quiet refresh failure keeps the populated Journal visible');

    setup.services.executeJournalRunCommand = async (args) => {
      setup.calls.command.push(args);
      return { success: true, message: 'Updated' };
    };
    setup.services.listJournalForActor = async () => setup.state.listing;
    await store.retryCommandError();
    flushSync();
    assert.equal(store.commandError, null);
    assert.equal(setup.calls.command.length, 2);
  });

  // Issue 1648: a versioned-run authority refusal is `{success:false, reason}` with no
  // `message`, so `safeCommandMessage` produced '' — an EMPTY command-error notice and
  // no toast at all.
  it('words a reason-only command refusal in both the notice and the toast', async () => {
    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
    const setup = makeServices({
      listing: baseListing({ activeRuns: [current], history: [] }),
      commandResult: { success: false, reason: 'ledger-missing' },
    });
    const store = await loadedStore(setup);
    store.select(current);

    await store.pause(current);
    flushSync();

    const expected = langLeaf('FABRICATE.App.Journal.Actions.LedgerMissing');
    assert.equal(store.commandError.message, expected, 'the retry notice is never blank');
    assert.deepEqual(setup.calls.notify, [expected], 'a refused command is never silent');
  });

  it('falls back to the generic error, and never notifies undefined, for any failure shape', async () => {
    const shapes = [
      { success: false },
      { success: false, message: undefined },
      { success: false, message: '   ' },
      { success: false, message: 42 },
      { success: false, reason: 'command-timeout' },
      { success: false, reason: 'a-reason-nobody-mapped' },
    ];
    for (const commandResult of shapes) {
      const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
      const setup = makeServices({
        listing: baseListing({ activeRuns: [current], history: [] }),
        commandResult,
      });
      const store = await loadedStore(setup);
      await store.pause(current);
      flushSync();
      const label = JSON.stringify(commandResult);
      assert.equal(setup.calls.notify.length, 1, `one notification for ${label}`);
      assert.equal(typeof setup.calls.notify[0], 'string', `a string for ${label}`);
      assert.notEqual(setup.calls.notify[0], 'undefined', `never "undefined" for ${label}`);
      assert.notEqual(setup.calls.notify[0].trim(), '', `never blank for ${label}`);
      assert.equal(store.commandError.message, setup.calls.notify[0], `notice matches for ${label}`);
    }
  });

  // Issue 1648: finishing a timed run from the Journal whose CHECK fails is an outcome the
  // run's own history records, not a command error. It used to fall through the refusal
  // chain to the generic "Something went wrong while crafting. Nothing was consumed." and
  // park a persistent error notice on the row.
  it('reports a resolved failed check as an outcome, not as a command error', async () => {
    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
    const setup = makeServices({
      listing: baseListing({ activeRuns: [current], history: [] }),
      commandResult: {
        success: false,
        runId: current.id,
        status: 'failed',
        runRevision: 4,
        reason: null,
        message: null,
        disposition: 'failed',
        terminal: true,
      },
    });
    const store = await loadedStore(setup);
    store.select(current);

    await store.pause(current);
    flushSync();

    const expected = langLeaf('FABRICATE.App.Crafting.Notify.CheckFailed');
    assert.deepEqual(setup.calls.notify, [expected], 'the player is told the check failed');
    assert.notEqual(
      setup.calls.notify[0],
      langLeaf('FABRICATE.App.Crafting.Notify.CraftFailed'),
      'never the generic error and its "Nothing was consumed" promise'
    );
    assert.equal(store.commandError, null, 'an outcome leaves no retry notice on the row');
  });

  it('treats a cancelled versioned command as a silent retryable-state clear', async () => {
    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
    const setup = makeServices({
      listing: baseListing({ activeRuns: [current], history: [] }),
      commandResult: { success: false, message: 'The run changed. Try again.' },
    });
    const store = await loadedStore(setup);

    await store.pause(current);
    flushSync();
    assert.ok(store.commandError);

    setup.services.executeJournalRunCommand = async (args) => {
      setup.calls.command.push(args);
      return { success: false, cancelled: true, message: 'Roll cancelled.' };
    };
    await store.pause(current);
    flushSync();

    assert.equal(store.commandError, null);
    assert.deepEqual(setup.calls.notify, ['The run changed. Try again.']);
    assert.equal(setup.calls.list, 2, 'the cancelled command does not trigger another refresh');
  });

  // Issue 1648, M25. A versioned cancel SUCCEEDS with `cancelled: true` — the run was
  // cancelled — and the store used to read that as "the user dismissed a prompt" and return
  // before its refresh. The listing the view kept was the one the cancel's own actor write had
  // just triggered, taken while the command still held the execution claim, so every OTHER run
  // stayed painted `claim-held` against a claim that no longer existed. The maintainer could not
  // cancel the rest without reloading Foundry.
  it('refreshes after a successful versioned cancel, so a mid-command claim cannot outlive it', async () => {
    const target = run({ id: 'target', lifecycleContract: 'current', lifecycleVersion: 1 });
    const other = run({ id: 'other', lifecycleContract: 'current', lifecycleVersion: 1 });
    const setup = makeServices({
      listing: baseListing({ activeRuns: [target, other], history: [] }),
    });
    const store = await loadedStore(setup);
    const blocked = (entry) => ({
      ...entry,
      actions: { ...entry.actions, execute: false, disabledReason: 'claim-held' },
    });
    setup.services.executeJournalRunCommand = async (args) => {
      setup.calls.command.push(args);
      // The cancel's own run-flag write reloads the Journal WHILE its claim is live.
      setup.state.listing = baseListing({ activeRuns: [blocked(target), blocked(other)], history: [] });
      await store.load(true);
      // The command then settles and the claim is released, so the ledger is truthful again.
      setup.state.listing = baseListing({
        activeRuns: [other],
        history: [{ ...target, derivedStatus: 'cancelled', actions: { dismiss: true } }],
      });
      return { success: true, cancelled: true, refunded: false, restoredCount: 0 };
    };

    await store.cancel(target);
    flushSync();

    assert.equal(store.activeRuns.length, 1, 'the cancelled run leaves the active list');
    assert.equal(store.activeRuns[0].id, 'other');
    assert.equal(
      store.activeRuns[0].actions.disabledReason ?? null,
      null,
      'and the run that was never cancelled is no longer blocked by a claim that has gone'
    );
    assert.equal(store.busyRunKey, '', 'busy flag cleared');
  });

  it('clears a command failure when selection moves to another run', async () => {
    const setup = makeServices({ commandResult: { success: false, message: 'Stale run.' } });
    const store = await loadedStore(setup);
    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
    await store.pause(current);
    flushSync();
    assert.equal(store.commandError?.runKey, current.key);

    store.select(ACTIVE[1]);
    flushSync();
    assert.equal(store.commandError, null);
  });

  it('clears a command failure when the loaded actor changes', async () => {
    const setup = makeServices({ commandResult: { success: false, message: 'Stale run.' } });
    const store = await loadedStore(setup);
    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });
    await store.pause(current);
    flushSync();
    assert.equal(store.commandError?.actorUuid, 'Actor.actor-1');

    setup.state.listing = baseListing({
      selectedActorId: 'actor-2',
      selectedActorUuid: 'Actor.actor-2',
      activeRuns: [run({ id: 'other', actorUuid: 'Actor.actor-2' })],
      history: [],
    });
    await store.load(true);
    flushSync();
    assert.equal(store.commandError, null);
  });

  it('shares one busy guard across competing actions for the same store', async () => {
    const setup = makeServices();
    let release;
    setup.services.executeJournalRunCommand = async (args) => {
      setup.calls.command.push(args);
      return new Promise((resolvePromise) => {
        release = resolvePromise;
      });
    };
    const store = await loadedStore(setup);
    const current = run({ ...ACTIVE[0], lifecycleContract: 'current', lifecycleVersion: 1 });

    const first = store.pause(current);
    await Promise.resolve();
    await store.resume(current);
    assert.equal(setup.calls.command.length, 1, 'second action is ignored while the first is busy');
    assert.equal(store.busyRunId, 'a');

    release({ success: true });
    await first;
    flushSync();
    assert.equal(store.busyRunId, '');
  });

  it('surfaces listing load failures without leaving the loading state stuck', async () => {
    const setup = makeServices();
    setup.services.listJournalForActor = async () => {
      throw new Error('listing failed');
    };
    const store = createJournalStore({ services: setup.services });

    await assert.doesNotReject(() => store.load());
    flushSync();
    assert.equal(store.loading, false);
    assert.equal(store.loadedOnce, true);
    assert.equal(store.error, true);
  });

  it('advance surfaces the result message and refetches quietly', async () => {
    const setup = makeServices({ advanceResult: { success: false, message: 'You must own the source character.' } });
    const store = await loadedStore(setup);

    await store.advance({ id: 'b', recipeId: 'r-b' });
    flushSync();

    assert.deepEqual(setup.calls.advance, [
      { actorId: 'actor-1', runId: 'b', interactive: true }
    ]);
    assert.deepEqual(setup.calls.notify, ['You must own the source character.']);
    assert.equal(setup.calls.list, 2, 'refetched after advance');
    assert.equal(store.busyRunId, '', 'busy flag cleared');
  });

  it('advance treats a cancelled continuation as a silent no-op (no notify, no refetch)', async () => {
    const setup = makeServices({
      advanceResult: { success: false, cancelled: true, message: 'Crafting cancelled' }
    });
    const store = await loadedStore(setup);

    await store.advance({ id: 'b', recipeId: 'r-b' });
    flushSync();

    // The continuation opts into the interactive roll dialog.
    assert.deepEqual(setup.calls.advance, [
      { actorId: 'actor-1', runId: 'b', interactive: true }
    ]);
    // A cancel is a user choice, not a failure: no error notification, no refetch.
    assert.deepEqual(setup.calls.notify, [], 'no notification on cancel');
    assert.equal(setup.calls.list, 1, 'listing NOT refetched after a cancel');
    assert.equal(store.busyRunId, '', 'busy flag cleared');
  });

  it('cancel routes to cancelCraftingRun, notifies, retains selection, and refetches', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);
    store.select('b');
    flushSync();
    assert.equal(store.selectedRunId, 'b');

    await store.cancel({ id: 'b' });
    flushSync();

    assert.deepEqual(setup.calls.cancel, [{ actorId: 'actor-1', runId: 'b' }]);
    assert.deepEqual(setup.calls.notify, ['Craft cancelled.']);
    assert.equal(store.selectedRunId, 'b', 'selection stays while the refreshed run still exists');
    assert.equal(setup.calls.list, 2, 'refetched after cancel');
    assert.equal(store.busyRunId, '', 'busy flag cleared');
  });

  // Issue 966: without a catch, a throw from the Foundry edge became an unhandled
  // rejection inside the click handler — no toast, no refresh, no state change, so
  // the button visibly did nothing and the real cause was invisible.
  it('advance surfaces a thrown error and clears busy instead of rejecting', async () => {
    const setup = makeServices({ advanceThrows: true });
    const store = await loadedStore(setup);

    await assert.doesNotReject(() => store.advance({ id: 'b' }));
    flushSync();

    assert.deepEqual(setup.calls.notify, ['Crafting failed.']);
    assert.equal(store.busyRunId, '', 'busy flag cleared so the run is not wedged');
  });

  it('cancel surfaces a thrown error and clears busy instead of rejecting', async () => {
    const setup = makeServices({ cancelThrows: true });
    const store = await loadedStore(setup);

    await assert.doesNotReject(() => store.cancel({ id: 'b' }));
    flushSync();

    assert.deepEqual(setup.calls.notify, ['Crafting failed.']);
    assert.equal(store.busyRunId, '', 'busy flag cleared so the run is not wedged');
  });

  it('breaks soonest-ready ties by ascending availableAt', async () => {
    // Both runs are waiting at now=200, so readiness ties: ascending availableAt
    // orders the sooner-maturing run first.
    const active = [
      { id: 'late', recipeId: 'r', startedAt: 10, timeGate: { availableAt: 800 } },
      { id: 'soon', recipeId: 'r', startedAt: 10, timeGate: { availableAt: 300 } },
    ];
    const setup = makeServices({ listing: baseListing({ activeRuns: active }) });
    const store = await loadedStore(setup);
    assert.deepEqual(
      store.activeRuns.map((run) => run.id),
      ['soon', 'late']
    );
  });

  it('setHistorySort("oldest") reverses the finished order and resets the page', async () => {
    const store = await loadedStore(makeServices());
    assert.equal(store.historySort, 'newest');
    assert.deepEqual(store.historyPageItems[0].id, 'h1', 'newest first by default');

    store.setHistoryPage(1);
    flushSync();
    store.setHistorySort('oldest');
    flushSync();
    assert.equal(store.historySort, 'oldest');
    assert.equal(store.historyPage, 0, 'changing the sort resets to the first page');
    // history finishedAt runs 100..30 (h1..h8); oldest → h8 (30) first.
    assert.deepEqual(
      store.historyPageItems.slice(0, 3).map((run) => run.id),
      ['h8', 'h7', 'h6']
    );
  });

  it('tickWorldTime recomputes the world-time-derived active runs', async () => {
    let clock = 200;
    const { services, calls } = makeServices();
    services.getWorldTime = () => clock;
    const store = createJournalStore({ services });
    await store.load();
    flushSync();

    const before = store.activeRuns;
    // Reading again without any dependency change returns the memoized derived.
    assert.equal(store.activeRuns, before, 'derived is memoized between reads');

    clock = 5000;
    store.tickWorldTime();
    flushSync();
    assert.equal(store.worldTime, 5000, 'reactive world time reflects the advanced clock');
    assert.notEqual(
      store.activeRuns,
      before,
      'the worldTimeTick nudge re-ran the active-runs derived'
    );
    assert.equal(calls.list, 1, 'a tick does not refetch');
  });
});
