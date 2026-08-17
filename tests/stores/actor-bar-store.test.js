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
let createActorBarStore;


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

  // --- refreshSelectableActors (issue 1024) ---------------------------------
  //
  // The GM ticks a second player-character actor type mid-session. Every open bar must
  // re-project WITHOUT resetting the one-shot `loaded` latch, which exists to stop a
  // later `$effect` run clobbering a deliberate pick.

  it('refresh seeds and persists the first entry when the selection is empty', () => {
    // THE reported scenario: the player owns only a `robot`, so the bar loaded empty
    // and nothing was selected. A naive "re-seed only when the current pick is GONE"
    // guard short-circuits on the falsy id and leaves a populated but unselected bar.
    const overrides = { actors: [], seededId: '' };
    const { services, calls } = makeServices(overrides);
    const store = createActorBarStore({ services });

    store.loadSelectableActors();
    flushSync();
    assert.equal(store.selectedActorId, '', 'starts with nothing selectable');
    assert.deepEqual(calls.setSelectedActorId, []);

    overrides.actors = ACTORS;
    store.refreshSelectableActors();
    flushSync();

    assert.equal(store.selectableActors.length, 2, 'the list re-projects');
    assert.equal(store.selectedActorId, 'a1', 'an empty selection seeds the first entry');
    assert.deepEqual(calls.setSelectedActorId, ['a1'], 'and persists it exactly once');
  });

  it('refresh leaves a still-present pick untouched and un-re-persisted', () => {
    const overrides = { actors: ACTORS, seededId: 'a2' };
    const { services, calls } = makeServices(overrides);
    const store = createActorBarStore({ services });
    store.loadSelectableActors();
    flushSync();
    calls.setSelectedActorId.length = 0;

    store.refreshSelectableActors();
    flushSync();

    assert.equal(store.selectedActorId, 'a2', 'a valid pick survives the refresh');
    assert.deepEqual(calls.setSelectedActorId, [], 'and is not re-persisted');
  });

  it('refresh re-seeds when the current pick vanished from the list', () => {
    const overrides = { actors: ACTORS, seededId: 'a2' };
    const { services, calls } = makeServices(overrides);
    const store = createActorBarStore({ services });
    store.loadSelectableActors();
    flushSync();
    calls.setSelectedActorId.length = 0;

    // The GM UN-ticked the type `a2` belonged to.
    overrides.actors = [ACTORS[0]];
    store.refreshSelectableActors();
    flushSync();

    assert.equal(store.selectedActorId, 'a1', 're-seeds to the first remaining entry');
    assert.deepEqual(calls.setSelectedActorId, ['a1'], 'through selectActor, so it persists');
  });

  it('refresh does not throw, index, or persist when the list becomes empty', () => {
    const overrides = { actors: ACTORS, seededId: 'a1' };
    const { services, calls } = makeServices(overrides);
    const store = createActorBarStore({ services });
    store.loadSelectableActors();
    flushSync();
    calls.setSelectedActorId.length = 0;

    overrides.actors = [];
    assert.doesNotThrow(() => {
      store.refreshSelectableActors();
      flushSync();
    });

    assert.equal(store.selectableActors.length, 0);
    assert.deepEqual(calls.setSelectedActorId, [], 'nothing persisted on an empty list');
    assert.equal(store.selectedActor, null, 'the derived selection resolves to nothing');
  });

  it('refresh neither consults nor resets the `loaded` latch', () => {
    const overrides = { actors: ACTORS, seededId: '' };
    const { services, calls } = makeServices(overrides);
    const store = createActorBarStore({ services });

    store.loadSelectableActors();
    flushSync();
    store.selectActor('a2');
    flushSync();
    calls.setSelectedActorId.length = 0;

    store.refreshSelectableActors();
    flushSync();
    assert.equal(store.loaded, true, 'the latch is still set after a refresh');

    // If the refresh had cleared the latch, this load would re-seed to a1 and clobber
    // the deliberate pick — the exact regression the latch exists to prevent.
    store.loadSelectableActors();
    flushSync();
    assert.equal(store.selectedActorId, 'a2', 'the deliberate pick survives');
    assert.deepEqual(calls.setSelectedActorId, [], 'and nothing was re-persisted');
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

  it('selectScopedActor selects + persists a selectable id', () => {
    const { services, calls } = makeServices({ actors: ACTORS, seededId: 'a1' });
    const store = createActorBarStore({ services });
    store.loadSelectableActors();
    flushSync();
    calls.setSelectedActorId.length = 0;

    store.selectScopedActor('a2');
    flushSync();

    assert.equal(store.selectedActorId, 'a2', 'scoped actor becomes the selection');
    assert.deepEqual(calls.setSelectedActorId, ['a2'], 'scoped selection is persisted');
  });

  it('selectScopedActor no-ops for a non-selectable id (keeps the default seed)', () => {
    const { services, calls } = makeServices({ actors: ACTORS, seededId: 'a1' });
    const store = createActorBarStore({ services });
    store.loadSelectableActors();
    flushSync();
    calls.setSelectedActorId.length = 0;

    store.selectScopedActor('npc-1');
    flushSync();

    assert.equal(store.selectedActorId, 'a1', 'unselectable scoped id leaves the seed in place');
    assert.deepEqual(calls.setSelectedActorId, [], 'nothing persisted for an unselectable id');
  });

  it('setConditionVisibility defaults to shown and reflects pushed flags', () => {
    const { services } = makeServices({ actors: ACTORS });
    const store = createActorBarStore({ services });

    assert.deepEqual(
      store.conditionVisibility,
      { weather: true, timeOfDay: true },
      'both chips shown by default'
    );

    store.setConditionVisibility({ weather: false, timeOfDay: true });
    flushSync();
    assert.deepEqual(store.conditionVisibility, { weather: false, timeOfDay: true });

    // A missing flag defaults back to shown (true).
    store.setConditionVisibility({ timeOfDay: false });
    flushSync();
    assert.deepEqual(store.conditionVisibility, { weather: true, timeOfDay: false });
  });

  it('setRealmContext defaults to disabled/empty and reflects pushed summaries', () => {
    const { services } = makeServices({ actors: ACTORS });
    const store = createActorBarStore({ services });

    assert.deepEqual(
      store.realmContext,
      { enabled: false, realms: [] },
      'realm chip hidden by default'
    );

    const realms = [{ id: 'r1', label: 'Whispering Wood', placeholder: false }];
    store.setRealmContext({ enabled: true, realms });
    flushSync();
    assert.deepEqual(store.realmContext, { enabled: true, realms });

    // A null/partial push normalizes to disabled + empty.
    store.setRealmContext(null);
    flushSync();
    assert.deepEqual(store.realmContext, { enabled: false, realms: [] });
  });
});
