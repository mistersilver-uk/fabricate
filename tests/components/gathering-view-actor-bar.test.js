import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile, compileModule } from 'svelte/compiler';
import { flushSync, mount, tick, unmount } from '../../node_modules/svelte/src/index-client.js';
import { setupDOM, teardownDOM } from '../helpers/svelte-dom.js';

const repoRoot = resolve(import.meta.dirname, '../..');

let tempRoot;
let GatheringView;
let createActorBarStore;
let mounted;
let target;

function rewriteClientImports(code) {
  return code
    .replace(/from 'svelte';/g, "from 'svelte/internal/client';")
    .replace(/(from\s+['"][^'"]+\.svelte)(['"])/g, '$1.js$2');
}

function writeCompiledSvelte(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compile(source, { filename: sourcePath, generate: 'client', dev: true, css: 'injected' });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function writeCompiledModule(sourcePath) {
  const source = readFileSync(resolve(repoRoot, sourcePath), 'utf8');
  const compiled = compileModule(source, { filename: sourcePath, generate: 'client', dev: true });
  const destination = join(tempRoot, `${sourcePath}.js`);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, rewriteClientImports(compiled.js.code));
}

function copyModule(sourcePath) {
  const destination = join(tempRoot, sourcePath);
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(destination, readFileSync(resolve(repoRoot, sourcePath), 'utf8'));
}

function environment(overrides = {}) {
  return {
    id: 'env-meadow',
    name: 'Sunlit Meadow',
    img: 'icons/svg/sun.svg',
    description: 'A field.',
    locked: false,
    selectionMode: 'targeted',
    revealPolicy: 'never',
    region: 'Greenvale',
    risk: 'safe',
    attemptable: true,
    discoveredTaskCount: 0,
    composedTaskCount: 0,
    biomeTags: [],
    tasks: [],
    discoveredTasks: [],
    ...overrides
  };
}

function listing(environments, selectedActorId = 'a1') {
  return { visible: true, selectedActorId, environments };
}

// A `services` bag whose listGatheringForActor records calls and their options.
function makeGatheringServices(result) {
  const calls = { list: [] };
  const services = {
    listGatheringForActor: (opts) => {
      calls.list.push(opts);
      return Promise.resolve(typeof result === 'function' ? result(opts) : result);
    },
    startGatheringAttempt: () => Promise.resolve({ accepted: true })
  };
  return { services, calls };
}

// A store backed by the real actorBarStore (so its `selectedActorId` is a
// reactive source the GatheringView fetch $effect can track).
function makeStore({ actors = [], seededId = '' } = {}) {
  const storeServices = {
    listSelectableActors: () => actors,
    getSelectedActorId: () => seededId,
    setSelectedActorId: () => {},
    getGatheringConditions: () => ({ weather: 'clear', timeOfDay: 'day' })
  };
  return createActorBarStore({ services: storeServices });
}

async function mountView(services) {
  target = document.createElement('div');
  document.body.appendChild(target);
  mounted = mount(GatheringView, { target, props: { services } });
  flushSync();
  await tick();
  await tick();
  flushSync();
}

async function settle() {
  await tick();
  await tick();
  flushSync();
}

describe('GatheringView ↔ actor bar wiring', () => {
  before(async () => {
    setupDOM();
    globalThis.Text = document.createTextNode('').constructor;
    globalThis.Comment = document.createComment('').constructor;
    globalThis.game = {
      i18n: { localize: (key) => key, format: (key, data) => `${key}:${JSON.stringify(data)}` }
    };
    tempRoot = mkdtempSync(join(tmpdir(), 'fabricate-gathering-bar-'));
    symlinkSync(resolve(repoRoot, 'node_modules'), join(tempRoot, 'node_modules'), 'junction');

    copyModule('src/ui/svelte/util/foundryBridge.js');
    copyModule('src/ui/svelte/apps/gathering/selectionDefault.js');
    copyModule('src/ui/svelte/util/sceneImages.js');
    writeCompiledModule('src/ui/svelte/stores/actorBarStore.svelte.js');

    writeCompiledSvelte('src/ui/svelte/components/Pagination.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/EnvironmentCard.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringEnvironmentList.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/SuccessChanceBar.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/LinkedScene.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringTaskRow.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringDetail.svelte');
    writeCompiledSvelte('src/ui/svelte/apps/gathering/GatheringView.svelte');

    GatheringView = (await import(pathToFileURL(join(
      tempRoot, 'src/ui/svelte/apps/gathering/GatheringView.svelte.js'
    )))).default;
    createActorBarStore = (await import(pathToFileURL(join(
      tempRoot, 'src/ui/svelte/stores/actorBarStore.svelte.js.js'
    )))).createActorBarStore;
  });

  afterEach(() => {
    if (mounted) {
      unmount(mounted);
      mounted = null;
    }
    target?.remove();
    target = null;
  });

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    teardownDOM();
    delete globalThis.game;
  });

  it('passes the store selection as rememberedActorId and fetches exactly once on mount', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    const { services, calls } = makeGatheringServices(listing([environment()]));
    services.actorBar = store;

    await mountView(services);

    assert.equal(calls.list.length, 1, 'no spurious mount-time double fetch');
    assert.equal(calls.list[0].rememberedActorId, 'a1', 'passes the live store selection');
  });

  it('re-fetches with the new rememberedActorId when the store selection changes', async () => {
    const store = makeStore({
      actors: [{ id: 'a1', name: 'Aria', img: null }, { id: 'a2', name: 'Borin', img: null }],
      seededId: 'a1'
    });
    store.loadSelectableActors();
    flushSync();
    const { services, calls } = makeGatheringServices(listing([environment()]));
    services.actorBar = store;

    await mountView(services);
    assert.equal(calls.list.length, 1);

    store.selectActor('a2');
    flushSync();
    await settle();

    assert.equal(calls.list.length, 2, 'actor change re-fetches the listing');
    assert.equal(calls.list[1].rememberedActorId, 'a2', 're-fetch uses the new selection');
  });

  it('reports the selected environment region to the store', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
    store.loadSelectableActors();
    flushSync();
    const { services } = makeGatheringServices(listing([environment({ id: 'env-r', region: 'Ashfen' })]));
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.region, 'Ashfen', 'the selected environment region is reported to the store');
  });

  it('first-load backstop adopts listing.selectedActorId once, only when present in the bar list', async () => {
    const store = makeStore({
      actors: [{ id: 'a1', name: 'Aria', img: null }, { id: 'a2', name: 'Borin', img: null }],
      seededId: ''
    });
    // Deliberately leave the store seed empty (do NOT call loadSelectableActors's
    // fallback here): set the selectable list but keep selectedActorId empty.
    // We emulate that by mutating through a fresh store that only populated its list.
    store.selectableActors.push({ id: 'a1', name: 'Aria', img: null }, { id: 'a2', name: 'Borin', img: null });

    const { services, calls } = makeGatheringServices(listing([environment()], 'a2'));
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.selectedActorId, 'a2', 'adopts the in-list resolved actor on the empty seed');
    const adoptCalls = calls.list.length;
    assert.ok(adoptCalls >= 1);

    // Subsequent fetch (same selection) must NOT re-adopt or ping-pong.
    store.selectActor('a1');
    flushSync();
    await settle();
    assert.equal(store.selectedActorId, 'a1', 'later selection is honored, no re-adopt back to a2');
  });

  it('does not adopt an owned non-PC listing actor absent from the bar list', async () => {
    const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: '' });
    store.selectableActors.push({ id: 'a1', name: 'Aria', img: null });

    const { services } = makeGatheringServices(listing([environment()], 'npc-9'));
    services.actorBar = store;

    await mountView(services);
    await settle();

    assert.equal(store.selectedActorId, '', 'an out-of-list (owned non-PC) id is not adopted');
  });

  it('subscribes to scene changes and quietly re-fetches the listing on canvasReady', async () => {
    let registered = null;
    const offCalls = [];
    globalThis.Hooks = {
      on: (event, fn) => { registered = { event, fn }; return 'hook-canvas'; },
      off: (event, id) => { offCalls.push({ event, id }); }
    };
    try {
      const store = makeStore({ actors: [{ id: 'a1', name: 'Aria', img: null }], seededId: 'a1' });
      store.loadSelectableActors();
      flushSync();
      const { services, calls } = makeGatheringServices(listing([environment()]));
      services.actorBar = store;

      await mountView(services);
      assert.equal(calls.list.length, 1);
      assert.ok(registered, 'a Foundry hook was registered on mount');
      assert.equal(registered.event, 'canvasReady', 'subscribes to canvasReady');

      // Simulate the player navigating to / the GM activating a scene.
      registered.fn();
      await settle();
      assert.equal(calls.list.length, 2, 'canvasReady triggers a listing re-fetch');
      // The populated grid stays mounted across the quiet refresh (no spinner swap).
      assert.ok(target.querySelector('[data-gathering-state="populated"]'), 'keeps the populated layout');

      unmount(mounted);
      mounted = null;
      assert.ok(
        offCalls.some(({ event, id }) => event === 'canvasReady' && id === 'hook-canvas'),
        'unsubscribes the canvasReady hook on destroy'
      );
    } finally {
      delete globalThis.Hooks;
    }
  });

  it('REGRESSION: mounts and fetches unmodified when services has no actorBar', async () => {
    const { services, calls } = makeGatheringServices(listing([environment()]));
    // No services.actorBar at all.
    await mountView(services);

    assert.equal(calls.list.length, 1, 'still fetches exactly once');
    assert.equal(calls.list[0].rememberedActorId, null, 'rememberedActorId defaults to null without a store');
    assert.ok(target.querySelector('[data-gathering-state="populated"]'), 'renders the populated layout');
  });
});
