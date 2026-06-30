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
    counts: { active: active.length, history: hist.length },
    activeRuns: active,
    history: hist
  };
}

function makeServices(overrides = {}) {
  const calls = { list: 0, advance: [], notify: [] };
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

    assert.deepEqual(setup.calls.advance, [{ runId: 'b', recipeId: 'r-b' }]);
    assert.deepEqual(setup.calls.notify, ['You must own the source character.']);
    assert.equal(setup.calls.list, 2, 'refetched after advance');
    assert.equal(store.busyRunId, '', 'busy flag cleared');
  });
});
