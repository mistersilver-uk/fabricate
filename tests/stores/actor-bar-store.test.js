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
let createActorBarStore;

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

function makeServices(overrides = {}) {
  const calls = { setSelectedActorId: [] };
  const services = {
    listSelectableActors: () => overrides.actors ?? [],
    getSelectedActorId: () => overrides.seededId ?? '',
    setSelectedActorId: (id) => {
      calls.setSelectedActorId.push(id);
    },
    getGatheringConditions: () => overrides.conditions ?? null
  };
  return { services, calls };
}

const ACTORS = [
  { id: 'a1', uuid: 'Actor.a1', name: 'Aria', img: 'icons/a.webp' },
  { id: 'a2', uuid: 'Actor.a2', name: 'Borin', img: null }
];

describe('actorBarStore', () => {
  before(async () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-actorbar-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');
    writeCompiledModule('src/ui/svelte/stores/actorBarStore.svelte.js');
    createActorBarStore = (await import(pathToFileURL(join(
      tempRoot,
      'src/ui/svelte/stores/actorBarStore.svelte.js.js'
    )))).createActorBarStore;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('populates the selectable list and seeds the selection from the persisted id', () => {
    const { services, calls } = makeServices({ actors: ACTORS, seededId: 'a2' });
    const store = createActorBarStore({ services });

    store.loadSelectableActors();
    flushSync();

    assert.equal(store.selectableActors.length, 2);
    assert.equal(store.selectedActorId, 'a2', 'seeds from the persisted id');
    assert.equal(store.selectedActor?.name, 'Borin', 'derived selectedActor resolves');
    assert.equal(calls.setSelectedActorId.length, 0, 'a valid seed is not re-persisted');
  });

  it('falls back to the first actor and re-persists when the persisted id is empty', () => {
    const { services, calls } = makeServices({ actors: ACTORS, seededId: '' });
    const store = createActorBarStore({ services });

    store.loadSelectableActors();
    flushSync();

    assert.equal(store.selectedActorId, 'a1', 'empty seed falls back to the first actor');
    assert.deepEqual(calls.setSelectedActorId, ['a1'], 're-persists exactly once');
  });

  it('treats a stale (present-but-not-in-list) persisted id as a fallback case', () => {
    // 'npc-1' models a legacy owned non-PC id: present in persistence, absent
    // from the PC selectable list.
    const { services, calls } = makeServices({ actors: ACTORS, seededId: 'npc-1' });
    const store = createActorBarStore({ services });

    store.loadSelectableActors();
    flushSync();

    assert.equal(store.selectedActorId, 'a1', 'stale id converges to the first PC');
    assert.deepEqual(calls.setSelectedActorId, ['a1'], 're-persists the fallback exactly once');
  });

  it('does not select, persist, or throw when the selectable list is empty', () => {
    const { services, calls } = makeServices({ actors: [], seededId: '' });
    const store = createActorBarStore({ services });

    assert.doesNotThrow(() => {
      store.loadSelectableActors();
      flushSync();
    });
    assert.equal(store.selectableActors.length, 0);
    assert.equal(store.selectedActorId, '', 'no selection on an empty list');
    assert.deepEqual(calls.setSelectedActorId, [], 'nothing persisted on an empty list');
    assert.equal(store.selectedActor, null);
  });

  it('selectActor sets and persists the selection', () => {
    const { services, calls } = makeServices({ actors: ACTORS, seededId: 'a1' });
    const store = createActorBarStore({ services });
    store.loadSelectableActors();
    flushSync();
    calls.setSelectedActorId.length = 0;

    store.selectActor('a2');
    flushSync();

    assert.equal(store.selectedActorId, 'a2');
    assert.deepEqual(calls.setSelectedActorId, ['a2']);
  });

  it('re-entry guard: a second load does not clobber a deliberate selection', () => {
    const { services, calls } = makeServices({ actors: ACTORS, seededId: '' });
    const store = createActorBarStore({ services });

    store.loadSelectableActors();
    flushSync();
    assert.equal(store.selectedActorId, 'a1', 'first load falls back to a1');

    store.selectActor('a2');
    flushSync();
    calls.setSelectedActorId.length = 0;

    store.loadSelectableActors();
    flushSync();

    assert.equal(store.selectedActorId, 'a2', 'second load does NOT re-seed the user choice');
    assert.deepEqual(calls.setSelectedActorId, [], 'no re-persist on the guarded second load');
  });

  it('setStaminaPool stores the active pool and clears to null', () => {
    const { services } = makeServices({ actors: ACTORS });
    const store = createActorBarStore({ services });

    assert.equal(store.staminaPool, null, 'defaults to null');

    store.setStaminaPool({ current: 4, max: 10 });
    flushSync();
    assert.deepEqual(store.staminaPool, { current: 4, max: 10 });

    store.setStaminaPool(null);
    flushSync();
    assert.equal(store.staminaPool, null, 'cleared back to null');
  });

  it('refreshConditions pulls the current conditions through services', () => {
    const conditions = { weather: 'clear', timeOfDay: 'dusk' };
    const { services } = makeServices({ actors: ACTORS, conditions });
    const store = createActorBarStore({ services });

    assert.equal(store.conditions, null, 'no conditions before refresh');
    store.refreshConditions();
    flushSync();
    assert.deepEqual(store.conditions, conditions);
  });
});
