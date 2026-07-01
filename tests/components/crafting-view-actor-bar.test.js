import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync, tick } from '../../node_modules/svelte/src/index-client.js';

import {
  createMountedComponentHarness,
  CRAFTING_APP_RAW_MODULES,
  CRAFTING_APP_COMPILED_MODULES
} from '../helpers/svelte-component-harness.js';
import { recipe } from '../helpers/crafting-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// Real runes stores compiled into the harness temp tree so they share the mounted
// CraftingView's Svelte signal runtime — this exercises the ACTUAL bar → listing
// wiring rather than a stubbed getSelectedCraftingActorId.
const RUNE_MODULES = [
  'src/ui/svelte/stores/actorBarStore.svelte.js',
  'src/ui/svelte/stores/craftingSourcesStore.svelte.js',
  'src/ui/svelte/stores/craftingStore.svelte.js'
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-crafting-actor-bar-',
  rawModules: [...CRAFTING_APP_RAW_MODULES, 'src/ui/svelte/util/shoppingListAggregator.js'],
  compiledModules: CRAFTING_APP_COMPILED_MODULES,
  runeModules: RUNE_MODULES,
  componentPath: 'src/ui/svelte/apps/crafting/CraftingView.svelte'
});

let createActorBarStore;
let createCraftingSourcesStore;
let createCraftingStore;

// A services bag whose gathering / crafting actor selections persist to SEPARATE
// keys (mirroring LAST_GATHERING_ACTOR vs LAST_CRAFTING_ACTOR). This is what makes
// the regression real: the shared bar writes only the gathering key, so unless the
// crafting view persists LAST_CRAFTING_ACTOR the listing resolves to no actor.
function makeServices() {
  const settings = { gathering: '', crafting: '', sources: [] };
  const calls = { list: [] };
  const actors = [{ id: 'actor-x', uuid: 'Actor.actor-x', name: 'Hero', img: null }];
  const services = {
    listSelectableActors: () => actors,
    getSelectedActorId: () => settings.gathering,
    setSelectedActorId: (id) => { settings.gathering = id ?? ''; },
    getGatheringConditions: () => null,
    listCraftingSourceActors: () => actors,
    getSelectedCraftingActorId: () => settings.crafting,
    setSelectedCraftingActorId: (id) => { settings.crafting = id ?? ''; },
    getCraftingComponentSourceIds: () => settings.sources,
    setCraftingComponentSourceIds: (ids) => { settings.sources = Array.isArray(ids) ? ids : []; },
    getRecipeManager: () => null,
    getCraftingSourceActors: () => [],
    notify: () => {},
    craftErrorMessage: () => 'Crafting failed.',
    listCraftingForActor: async (opts) => {
      calls.list.push(opts);
      // The listing resolves an actor ONLY when an id was threaded through — this
      // is the crafting actor the view persisted, not the raw bar selection.
      return opts.rememberedActorId
        ? {
            selectedActorId: 'Actor.actor-x',
            actor: { id: 'actor-x', name: 'Hero' },
            componentSourceIds: ['actor-x'],
            worldTime: 0,
            recipes: [recipe()],
            counts: { available: 1, total: 1 }
          }
        : { selectedActorId: null, actor: null, componentSourceIds: [], worldTime: 0, recipes: [], counts: { available: 0, total: 0 } };
    }
  };
  return { services, calls, settings };
}

function wireStores() {
  const { services, calls, settings } = makeServices();
  services.actorBar = createActorBarStore({ services });
  services.craftingSources = createCraftingSourcesStore({ services });
  services.crafting = createCraftingStore({ services });
  return { services, calls, settings };
}

async function settle() {
  flushSync();
  await tick();
  await tick();
  flushSync();
}

describe('CraftingView ↔ actor bar wiring', () => {
  before(async () => {
    await harness.setup();
    ({ createActorBarStore } = await harness.loadRuneModule('src/ui/svelte/stores/actorBarStore.svelte.js'));
    ({ createCraftingSourcesStore } = await harness.loadRuneModule('src/ui/svelte/stores/craftingSourcesStore.svelte.js'));
    ({ createCraftingStore } = await harness.loadRuneModule('src/ui/svelte/stores/craftingStore.svelte.js'));
  });
  after(harness.teardown);
  afterEach(harness.remount);

  it('persists the shared bar selection to LAST_CRAFTING_ACTOR and resolves the listing for that actor', async () => {
    const { services, calls, settings } = wireStores();
    // No selection yet: the crafting setting is empty and the view lands on
    // no-actor (this is the pre-fix steady state).
    const target = await harness.mount({ services });
    await settle();
    assert.ok(target.querySelector('[data-crafting-state="no-actor"]'), 'no-actor until a character is selected');
    assert.equal(settings.crafting, '', 'no crafting actor persisted before a selection');

    // Drive the shared top bar exactly as ActorSelectTopBar does.
    services.actorBar.selectActor('actor-x');
    await settle();

    const lastCall = calls.list.at(-1);
    assert.equal(lastCall.rememberedActorId, 'actor-x', 'the listing loads for the selected actor');
    assert.equal(settings.crafting, 'actor-x', 'the crafting view persisted LAST_CRAFTING_ACTOR');
    assert.equal(target.querySelector('[data-crafting-state="no-actor"]'), null, 'leaves the no-actor state');
    assert.ok(target.querySelector('[data-crafting-state="populated"]'), 'renders the populated layout for the selected actor');
  });

  it('adopts a bar selection seeded before mount (persist-before-load on first render)', async () => {
    const { services, calls, settings } = wireStores();
    services.actorBar.loadSelectableActors();
    flushSync();

    const target = await harness.mount({ services });
    await settle();

    assert.equal(settings.crafting, 'actor-x', 'the seeded bar selection is persisted as the crafting actor');
    assert.ok(
      calls.list.some((call) => call.rememberedActorId === 'actor-x'),
      'the listing is fetched for the seeded actor'
    );
    assert.ok(target.querySelector('[data-crafting-state="populated"]'), 'renders the populated layout on first render');
  });
});
