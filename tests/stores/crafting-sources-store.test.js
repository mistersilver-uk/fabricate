import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from '../helpers/compile-svelte-module.js';

let compiler;
let createCraftingSourcesStore;

const AVAILABLE = [
  { id: 'hero', uuid: 'Actor.hero', name: 'Hero', img: 'icons/hero.webp' },
  { id: 'ally', uuid: 'Actor.ally', name: 'Ally', img: null },
  { id: 'mule', uuid: 'Actor.mule', name: 'Mule', img: null },
];

function makeServices(overrides = {}) {
  const calls = { setCraftingComponentSourceIds: [] };
  const services = {
    listCraftingSourceActors: () => overrides.available ?? AVAILABLE,
    getSelectedCraftingActorId: () => overrides.actorId ?? '',
    getCraftingComponentSourceIds: () => overrides.sourceIds ?? [],
    setCraftingComponentSourceIds: (ids) => calls.setCraftingComponentSourceIds.push(ids),
  };
  return { services, calls };
}

describe('craftingSourcesStore', () => {
  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-crafting-sources-');
    ({ createCraftingSourcesStore } = await compiler.load(
      'src/ui/svelte/stores/craftingSourcesStore.svelte.js'
    ));
  });

  after(() => {
    compiler.cleanup();
  });

  it('force-includes the owned crafting actor as a non-removable source', () => {
    const { services } = makeServices({ actorId: 'hero', sourceIds: [] });
    const store = createCraftingSourcesStore({ services });
    store.load();
    flushSync();

    assert.equal(store.requiredId, 'hero');
    assert.deepEqual(store.selectedSourceIds, ['hero']);
    const hero = store.sources.find((actor) => actor.id === 'hero');
    assert.equal(hero.removable, false, 'the crafting actor cannot be removed');
  });

  it('does not force a crafting actor the viewer does not own', () => {
    const { services } = makeServices({ actorId: 'stranger', sourceIds: ['ally'] });
    const store = createCraftingSourcesStore({ services });
    store.load();
    flushSync();

    assert.equal(store.requiredId, null);
    assert.deepEqual(store.selectedSourceIds, ['ally']);
  });

  it('adds, removes, and toggles sources, persisting the effective set', () => {
    const { services, calls } = makeServices({ actorId: 'hero', sourceIds: [] });
    const store = createCraftingSourcesStore({ services });
    store.load();
    flushSync();

    store.add('ally');
    flushSync();
    assert.deepEqual(store.selectedSourceIds, ['hero', 'ally']);
    assert.deepEqual(calls.setCraftingComponentSourceIds.at(-1), ['hero', 'ally']);

    store.toggle('mule');
    flushSync();
    assert.deepEqual(store.selectedSourceIds, ['hero', 'ally', 'mule']);

    store.toggle('ally');
    flushSync();
    assert.deepEqual(store.selectedSourceIds, ['hero', 'mule']);

    store.remove('hero');
    flushSync();
    assert.deepEqual(
      store.selectedSourceIds,
      ['hero', 'mule'],
      'the required actor is non-removable'
    );
  });

  it('ignores adding an actor the viewer does not own', () => {
    const { services, calls } = makeServices({ actorId: 'hero' });
    const store = createCraftingSourcesStore({ services });
    store.load();
    flushSync();

    store.add('ghost');
    flushSync();
    assert.deepEqual(store.selectedSourceIds, ['hero']);
    assert.equal(calls.setCraftingComponentSourceIds.length, 0, 'no persist for a non-owned id');
  });

  it('migrates the required source when the crafting actor changes', () => {
    const { services, calls } = makeServices({ actorId: 'hero', sourceIds: [] });
    const store = createCraftingSourcesStore({ services });
    store.load();
    flushSync();

    store.setCraftingActor('ally');
    flushSync();

    assert.equal(store.requiredId, 'ally');
    // The previously-forced actor is retained as a now-removable pick.
    assert.deepEqual(store.selectedSourceIds, ['ally', 'hero']);
    const hero = store.sources.find((actor) => actor.id === 'hero');
    assert.equal(hero.removable, true, 'the old crafting actor becomes removable');
    assert.deepEqual(calls.setCraftingComponentSourceIds.at(-1), ['ally', 'hero']);
  });

  it('a no-op crafting-actor change does not persist', () => {
    const { services, calls } = makeServices({ actorId: 'hero' });
    const store = createCraftingSourcesStore({ services });
    store.load();
    flushSync();

    store.setCraftingActor('hero');
    flushSync();
    assert.equal(calls.setCraftingComponentSourceIds.length, 0);
  });

  it('drops persisted ids that are no longer owned/extant', () => {
    const { services } = makeServices({ actorId: '', sourceIds: ['ghost', 'ally', 'phantom'] });
    const store = createCraftingSourcesStore({ services });
    store.load();
    flushSync();

    assert.deepEqual(store.selectedSourceIds, ['ally'], 'stale ids are filtered out');
  });
});
