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

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let createJournalStore;

function rewriteClientImports(code) {
  return code.replace(/from 'svelte';/g, "from 'svelte/internal/client';");
}

function writeCompiledModule(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compileModule(source, { filename: sourcePath, generate: 'client', dev: true });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

const ACTIVE = [
  { id: 'a', recipeId: 'r-a', startedAt: 80, timeGate: { availableAt: 1000 } }, // waiting (now=200)
  { id: 'b', recipeId: 'r-b', startedAt: 50, timeGate: { availableAt: 100 } } // ready
];

function history(count = 8) {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `h${index + 1}`,
    finishedAt: 100 - index * 10
  }));
}

function baseListing(overrides = {}) {
  const hist = overrides.history ?? history();
  const active = overrides.activeRuns ?? ACTIVE;
  return {
    selectedActorId: overrides.selectedActorId ?? 'actor-1',
    counts: { active: active.length, history: hist.length },
    activeRuns: active,
    history: hist
  };
}

function makeServices(overrides = {}) {
  const calls = { list: 0, advance: [], cancel: [], notify: [] };
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
      return overrides.advanceResult ?? { success: true, message: 'Done' };
    },
    cancelCraftingRun: async (args) => {
      calls.cancel.push(args);
      return overrides.cancelResult ?? { success: true, cancelled: true, message: 'Craft cancelled.' };
    },
    notify: (message) => calls.notify.push(message)
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
    writeCompiledModule('src/ui/svelte/stores/journalStore.svelte.js');
    createJournalStore = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/stores/journalStore.svelte.js.js'
    )))).createJournalStore;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('loads the listing and exposes navCount from counts.active', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);

    assert.equal(setup.calls.list, 1);
    assert.equal(store.navCount, 2);
    assert.equal(store.loadedOnce, true);
    assert.equal(store.error, false);
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
    assert.equal(store.historyPageSize, 6);
    assert.equal(store.historyPageItems.length, 6);
    assert.deepEqual(store.historyPageItems[0].id, 'h1', 'newest first');

    store.setHistoryPage(1);
    flushSync();
    assert.equal(store.historyPageItems.length, 2, 'remaining 2 of 8');
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
      history: [{ id: 'a', finishedAt: 200 }, ...history()]
    });
    await store.load(true);
    flushSync();
    assert.equal(store.selectedRun.id, 'a', 're-resolves the same id in history');

    // Selecting an unknown id falls back to the first active run (soonest ready).
    store.select('missing');
    flushSync();
    assert.equal(store.selectedRun.id, 'b');
  });

  it('advance surfaces the result message and refetches quietly', async () => {
    const setup = makeServices({ advanceResult: { success: false, message: 'You must own the source character.' } });
    const store = await loadedStore(setup);

    await store.advance({ id: 'b', recipeId: 'r-b' });
    flushSync();

    assert.deepEqual(setup.calls.advance, [
      { actorId: 'actor-1', runId: 'b', recipeId: 'r-b', interactive: true }
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
      { actorId: 'actor-1', runId: 'b', recipeId: 'r-b', interactive: true }
    ]);
    // A cancel is a user choice, not a failure: no error notification, no refetch.
    assert.deepEqual(setup.calls.notify, [], 'no notification on cancel');
    assert.equal(setup.calls.list, 1, 'listing NOT refetched after a cancel');
    assert.equal(store.busyRunId, '', 'busy flag cleared');
  });

  it('cancel routes to cancelCraftingRun, notifies, clears selection, and refetches', async () => {
    const setup = makeServices();
    const store = await loadedStore(setup);
    store.select('b');
    flushSync();
    assert.equal(store.selectedRunId, 'b');

    await store.cancel({ id: 'b' });
    flushSync();

    assert.deepEqual(setup.calls.cancel, [{ actorId: 'actor-1', runId: 'b' }]);
    assert.deepEqual(setup.calls.notify, ['Craft cancelled.']);
    assert.equal(store.selectedRunId, '', 'the cancelled run is deselected');
    assert.equal(setup.calls.list, 2, 'refetched after cancel');
    assert.equal(store.busyRunId, '', 'busy flag cleared');
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
