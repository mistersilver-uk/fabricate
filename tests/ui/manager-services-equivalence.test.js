/**
 * The equivalence oracle for both shells' service bags (issue 1674): key set, per-key `typeof`, and
 * each key's observable under the corpus disposition table. Byte-frozen once green against the
 * unsplit shells, so every later phase is proved by substitution rather than by re-reading.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
  CORPUS_STACK_QUANTITY_PATH,
  MANAGER_DISPOSITIONS,
  MANAGER_SERVICE_KEYS,
  PLAYER_SERVICE_KEYS,
  PLAYER_STORE_KEYS,
  RecordingApplicationV2,
  buildManagerWorld,
  buildPlayerWorld,
  installPlayerWorld,
  installWorld,
  normaliseForGolden,
  playerArgumentsFor,
  recordingHooks,
  withoutFoundryGlobals,
} from '../fixtures/managerServicesCorpus.js';
import { withProductionApplication } from '../helpers/extension-composition-harness.js';
import {
  configureItemStackQuantityPath,
  resetItemStackQuantityPath,
} from '../../src/systems/itemStackQuantity.js';

const GOLDEN_PATH = resolve(import.meta.dirname, '../fixtures/managerServices.golden.json');
const MANAGER_MODULE = '/src/ui/SvelteCraftingSystemManagerApp.svelte.js';
const PLAYER_MODULE = '/src/ui/SvelteFabricateApp.svelte.js';
const REGENERATE = 'UPDATE_MANAGER_SERVICES_GOLDEN=1 node --conditions=browser --test tests/ui/manager-services-equivalence.test.js';

const regenerating = process.env.UPDATE_MANAGER_SERVICES_GOLDEN === '1';
const observed = {};

// Written at process exit rather than from one suite's `after`, so both shells' scenarios are in
// the file rather than only the suite that finished first.
if (regenerating) {
  process.on('exit', () => {
    writeFileSync(GOLDEN_PATH, `${JSON.stringify(observed, null, 2)}\n`);
  });
}

function recordObservation(scenario, value) {
  observed[scenario] = value;
}

function golden() {
  return JSON.parse(readFileSync(GOLDEN_PATH, 'utf8'));
}

function expectGolden(scenario, raw) {
  const actual = normaliseForGolden(raw);
  recordObservation(scenario, actual);
  if (regenerating) return;
  assert.deepStrictEqual(
    actual,
    golden()[scenario],
    `${scenario} diverged from the frozen golden; regenerate with ${REGENERATE} only when the ` +
      'change is intended'
  );
}

/** The golden's own shape: JSON-round-trippable, with a present `undefined` still visible. */
function jsonSafe(label, value) {
  const normalised = normaliseForGolden(value);
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(normalised)),
    normalised,
    `${label} is not JSON-round-trippable`
  );
  return normalised;
}

/** The arrangement's admin store, honouring an explicit `null` rather than defaulting over it. */
function adminStoreFor(world) {
  if (Object.hasOwn(world, 'adminStore')) return world.adminStore;
  return { refresh: async () => world.record('adminStore.refresh') };
}

/** One manager arrangement, driven end to end against a freshly constructed shell. */
async function driveManager(constructShell, world, hooks) {
  const restoreWorld = installWorld(world);
  const previousHooks = globalThis.Hooks;
  globalThis.Hooks = hooks;
  try {
    const app = constructShell();
    app._adminStore = adminStoreFor(world);
    const services = app._buildServices();
    return { app, services };
  } finally {
    globalThis.Hooks = previousHooks;
    restoreWorld();
  }
}

/**
 * Run `body` with the arrangement's globals installed for its whole duration, which is what the
 * asynchronous services need.
 */
async function withManager(constructShell, world, run) {
  const { hooks, fire, registered } = recordingHooks(world.record);
  const restoreWorld = installWorld(world);
  const previousHooks = globalThis.Hooks;
  globalThis.Hooks = hooks;
  try {
    const app = constructShell();
    app._adminStore = adminStoreFor(world);
    const services = app._buildServices();
    return await run({ app, services, fire, registered });
  } finally {
    globalThis.Hooks = previousHooks;
    restoreWorld();
  }
}

describe('the manager shell services bag', () => {
  let constructShell;
  let release;

  before(async () => {
    configureItemStackQuantityPath(CORPUS_STACK_QUANTITY_PATH);
    let resolveReady;
    const ready = new Promise((r) => {
      resolveReady = r;
    });
    let finish;
    const done = new Promise((r) => {
      finish = r;
    });
    const booted = withProductionApplication(
      {
        modulePath: MANAGER_MODULE,
        exportName: 'SvelteCraftingSystemManagerApp',
        ApplicationV2: RecordingApplicationV2,
        hooks: { on: () => 1, off: () => {}, once: () => 1 },
      },
      async (app) => {
        constructShell = () => new app.constructor();
        resolveReady();
        await done;
      }
    );
    release = () => {
      finish();
      return booted;
    };
    await ready;
  });

  after(async () => {
    resetItemStackQuantityPath();
    await release();
  });

  it('exposes exactly the keys the corpus names, each with a disposition', async () => {
    const world = buildManagerWorld();
    const { services } = await driveManager(constructShell, world, recordingHooks(world.record).hooks);
    assert.deepStrictEqual(
      Object.keys(services).sort(),
      [...MANAGER_SERVICE_KEYS],
      'the services bag key set moved; the corpus constant is the oracle, not the iteration source'
    );
    assert.ok(
      Object.keys(services).includes('isFabricateReady'),
      'the shorthand `isFabricateReady` entry is part of the bag'
    );
    for (const key of Object.keys(services)) {
      assert.ok(
        MANAGER_DISPOSITIONS[key],
        `${key} has no disposition, so nothing in this suite observes it`
      );
    }
    expectGolden(
      'manager.typeof',
      Object.fromEntries(Object.keys(services).sort().map((key) => [key, typeof services[key]]))
    );
  });

  it('forwards the enricher options rather than only the raw text', async () => {
    const world = buildManagerWorld();
    const journal = await withManager(constructShell, world, async ({ services }) => {
      await services.enrichToHtml('<p>@UUID[Item.hammer]</p>', { relativeTo: 'Item.hammer' });
      return [...world.journal];
    });
    expectGolden('manager.enrich', journal);
  });

  it('answers the same data for the full world, twice over', async () => {
    const readData = async () => {
      const world = buildManagerWorld();
      return withManager(constructShell, world, async ({ services }) => {
        const data = {};
        for (const key of MANAGER_SERVICE_KEYS) {
          if (MANAGER_DISPOSITIONS[key] !== 'data') continue;
          data[key] = await callDataService(services, key, world);
        }
        return jsonSafe('manager data', data);
      });
    };
    const first = await readData();
    const second = await readData();
    assert.deepStrictEqual(second, first, 'the bag is not idempotent across two builds');
    expectGolden('manager.data', first);
  });

  it('hands back the world stores themselves, and null with no facade', async () => {
    const world = buildManagerWorld();
    await withManager(constructShell, world, ({ services }) => {
      assert.strictEqual(services.getCraftingSystemManager(), world.handles.craftingSystemManager);
      assert.strictEqual(services.getRecipeManager(), world.handles.recipeManager);
      assert.strictEqual(services.getComponentScopeStore(), world.handles.componentScopeStore);
      assert.strictEqual(services.getEssenceScopeStore(), world.handles.essenceScopeStore);
      assert.strictEqual(services.getToolScopeStore(), world.handles.toolScopeStore);
      assert.strictEqual(services.getVocabularyScopeStore(), world.handles.vocabularyScopeStore);
      assert.strictEqual(services.getCurrencyConfigStore(), world.handles.currencyConfigStore);
      assert.strictEqual(services.getCharacterLibrariesStore(), world.handles.characterLibrariesStore);
      assert.strictEqual(services.getGatheringEnvironmentStore(), world.handles.gatheringEnvironmentStore);
      assert.strictEqual(services.getGatheringPartyStore(), world.handles.gatheringPartyStore);
      assert.strictEqual(services.getGatheringRealmStore(), world.handles.gatheringRealmStore);
      assert.strictEqual(services.getGatheringLocationService(), world.handles.gatheringLocationService);
      assert.deepStrictEqual(
        services.getWorldActors().map((actor) => actor === undefined),
        [false, false, false]
      );
      for (const [index, actor] of services.getWorldActors().entries()) {
        assert.strictEqual(actor, world.handles.actorDocuments[index], 'a projected actor is not the document');
      }
    });

    const empty = buildManagerWorld({ fabricate: false });
    await withManager(constructShell, empty, ({ services }) => {
      for (const key of ['getCraftingSystemManager', 'getRecipeManager', 'getComponentScopeStore',
        'getEssenceScopeStore', 'getToolScopeStore', 'getVocabularyScopeStore',
        'getCurrencyConfigStore', 'getCharacterLibrariesStore', 'getGatheringEnvironmentStore',
        'getGatheringPartyStore', 'getGatheringRealmStore', 'getGatheringLocationService']) {
        assert.strictEqual(services[key](), null, `${key} must answer null with no facade`);
      }
    });
  });

  it('reaches the world through the same ordered calls', async () => {
    const world = buildManagerWorld();
    const journal = await withManager(constructShell, world, async ({ services, fire, registered }) => {
      await services.setSetting('craftingHints', 'off');
      await services.setGatheringConditions({ weather: 'rain' });
      services.notify.info('info line');
      services.notify.warn('warn line');
      services.notify.error('error line');
      await services.copyToClipboard('Item.hammer');
      await services.pickImagePath('worlds/current.webp');
      await services.confirmDialog({ title: 'gone?' });
      await services.choiceDialog({
        title: 'which?',
        content: 'pick one',
        choices: [{ action: 'keep', label: 'Keep' }, { action: 'drop', label: 'Drop' }],
      });
      await services.renderImportDialog('sys-1');
      await services.renderSystemImportDialog();
      // The four GM-gated writes. Their return is journalled, because a denial is the failure a GM
      // cannot see: without it their observable collapses to "callable, does not throw".
      for (const [label, call] of [
        [
          'knowledge.expend',
          () =>
            services.expendRecipeItemUse({
              actorId: 'pc-arden',
              itemId: 'owned-modern',
              // Deliberately not the definition the item live-matches, so the journal shows which
              // rung answered: the row's own definition wins over a fresh match.
              definitionId: 'def-legacy',
              systemId: 'sys-1',
            }),
        ],
        [
          'knowledge.delete',
          () => services.deleteOwnedRecipeItem({ actorId: 'pc-arden', itemId: 'owned-modern' }),
        ],
        [
          'knowledge.erase',
          () => services.eraseLearnedRecipe({ actorId: 'pc-arden', recipeId: 'recipe-alpha' }),
        ],
        [
          'knowledge.reset',
          () => services.resetActorKnowledge({ actorId: 'pc-arden', systemId: 'sys-1' }),
        ],
      ]) {
        world.record(label, normaliseForGolden(await call()));
      }
      const unsubscribeScene = services.subscribeSceneChange(() => world.record('scene.changed'));
      const unsubscribeMarker = services.subscribeTravelMarkerMove(() => world.record('marker.moved'));
      unsubscribeScene();
      unsubscribeMarker();
      const unsubscribeData = services.onFabricateDataChanged((channel) =>
        world.record('data.changed', channel)
      );
      fire('fabricate.craftingSystemsChanged');
      fire('fabricate.recipesChanged');
      fire('fabricate.playerCharacterTypesChanged');
      unsubscribeData();
      assert.equal(registered.filter((entry) => entry.live).length, 0, 'every subscription is torn down');
      return [...world.journal];
    });
    expectGolden('manager.journal', journal);
  });

  it('delivers a deferred ready callback exactly once', async () => {
    const world = buildManagerWorld({ fabricate: false });
    const delivered = await withManager(constructShell, world, ({ services, fire }) => {
      const seen = [];
      services.onFabricateReady(() => seen.push('ready'));
      fire('fabricate.ready');
      fire('fabricate.ready');
      return seen;
    });
    assert.deepStrictEqual(delivered, ['ready'], 'the one-shot latch delivered more than once');
  });

  it('calls back synchronously when Fabricate is already ready', async () => {
    const world = buildManagerWorld();
    await withManager(constructShell, world, ({ services }) => {
      const seen = [];
      const unsubscribe = services.onFabricateReady(() => seen.push('ready'));
      assert.deepStrictEqual(seen, ['ready']);
      unsubscribe();
    });
  });

  // Two live subscribers over every channel. A handler constructed once per bag rather than once
  // per subscribing call routes both registrations at whichever callback subscribed last, so the
  // first subscriber silently stops receiving that channel while the delivery count stays right.
  it('gives each subscriber its own handler on every channel', async () => {
    const world = buildManagerWorld();
    const seen = await withManager(constructShell, world, ({ services, fire }) => {
      const received = [];
      services.onFabricateDataChanged((channel) => received.push(`a:${channel}`));
      services.onFabricateDataChanged((channel) => received.push(`b:${channel}`));
      fire('fabricate.craftingSystemsChanged');
      fire('fabricate.recipesChanged');
      fire('fabricate.playerCharacterTypesChanged');
      return received.sort();
    });
    assert.deepStrictEqual(seen, [
      'a:playerCharacterTypes',
      'a:recipes',
      'a:systems',
      'b:playerCharacterTypes',
      'b:recipes',
      'b:systems',
    ]);
  });

  it('keeps every later subscriber live when an earlier one unsubscribes', async () => {
    const world = buildManagerWorld();
    const seen = await withManager(constructShell, world, ({ services, fire }) => {
      const received = [];
      const unsubscribeA = services.onFabricateDataChanged((channel) =>
        received.push(`a:${channel}`)
      );
      services.onFabricateDataChanged((channel) => received.push(`b:${channel}`));
      unsubscribeA();
      fire('fabricate.craftingSystemsChanged');
      fire('fabricate.recipesChanged');
      fire('fabricate.playerCharacterTypesChanged');
      return received;
    });
    assert.deepStrictEqual(
      seen,
      ['b:systems', 'b:recipes', 'b:playerCharacterTypes'],
      'a subscriber stopped receiving a channel when an unrelated one unsubscribed'
    );
  });

  it('writes the download through the DOM anchor when saveDataToFile is absent', async () => {
    const present = buildManagerWorld();
    const presentJournal = await withManager(constructShell, present, async ({ services }) => {
      await services.downloadFile('{"a":1}', 'system.json');
      return [...present.journal];
    });
    expectGolden('manager.download.present', presentJournal);

    const absent = buildManagerWorld({ saveDataToFile: false });
    const absentJournal = await withManager(constructShell, absent, async ({ services }) => {
      await services.downloadFile('{"a":1}', 'system.json');
      return [...absent.journal];
    });
    expectGolden('manager.download.absent', absentJournal);
  });

  it('reports an import failure as a toast and a system import failure as a throw', async () => {
    const world = buildManagerWorld();
    world.adminStore = null;
    const journal = await withManager(constructShell, world, async ({ services }) => {
      await services.renderImportDialog('sys-1');
      return [...world.journal];
    });
    assert.ok(
      journal.some(([channel, message]) => channel === 'notify.error' && String(message).startsWith('Import failed')),
      'a null admin store inside renderImportDialog\'s try must surface as an Import failed toast'
    );

    const second = buildManagerWorld({ importFile: fakeImportFile() });
    second.adminStore = null;
    await withManager(constructShell, second, async ({ services }) => {
      await assert.rejects(
        () => services.renderSystemImportDialog(),
        'renderSystemImportDialog refreshes outside its try, so a null store throws out of the service'
      );
    });
  });

  it('survives a world whose actor collection is neither iterable nor a Collection', async () => {
    const plain = { contents: undefined };
    const world = buildManagerWorld({ actors: plain });
    await withManager(constructShell, world, ({ services }) => {
      assert.deepStrictEqual(
        services.getWorldActors(),
        [],
        'a non-iterable actors fallback must answer [], which is what a spread rewrite breaks'
      );
    });
  });

  it('reads an iterable actor set the way a spread of the same operand would', async () => {
    const documents = buildManagerWorld().handles.actorDocuments;
    const asMap = new Map(documents.map((actor) => [actor.id, actor]));
    const collection = {
      contents: documents,
      [Symbol.iterator]: () => documents[Symbol.iterator](),
      get: (id) => documents.find((actor) => actor.id === id) ?? null,
    };
    for (const shape of [asMap, collection]) {
      const world = buildManagerWorld({ actors: shape });
      await withManager(constructShell, world, ({ services }) => {
        const operand = shape.contents || shape;
        assert.deepStrictEqual(
          services.getWorldActors(),
          [...operand],
          'Array.from and spread agree over every iterable operand'
        );
      });
    }
  });

  it('falls back to the role floor when the canonical player roster is absent', async () => {
    const world = buildManagerWorld({ players: false });
    await withManager(constructShell, world, ({ services }) => {
      assert.deepStrictEqual(
        services.getWorldUsers().map((user) => user.id),
        ['alice', 'bram'],
        'a role-NONE user and a GM are both outside the grantable roster'
      );
    });
  });

  it('answers [] rather than throwing for a compendium-embedded region uuid', async () => {
    const world = buildManagerWorld();
    await withManager(constructShell, world, ({ services }) => {
      assert.deepStrictEqual(
        services.getActorUuidsInSceneRegion('Compendium.fab.scenes.Scene.a.Region.b', [
          'Actor.pc-arden',
        ]),
        [],
        'fromUuidSync throws strictly for an embedded document in a pack'
      );
      assert.deepStrictEqual(
        services.getActorUuidsInSceneRegion('Scene.stage.Region.grove', [
          'Actor.pc-arden',
          'Actor.pc-brisa',
          'Compendium.fab.actors.Actor.a.Item.b',
          // Malformed, which `parseUuid` refuses whatever `strict` says — so only a `catch`
          // covers it, and `{strict: false}` is not a substitute for one.
          'Actor.',
        ]),
        ['Actor.pc-arden'],
        'an actor uuid that throws must be skipped, not abort the filter'
      );
      assert.deepStrictEqual(
        services.getActorUuidsInSceneRegion('Scene.', ['Actor.pc-arden']),
        [],
        'a malformed region uuid answers [] rather than throwing out of the service'
      );
    });
  });

  it('builds the services bag with no Foundry global defined at all', async () => {
    const keys = withoutFoundryGlobals(() => {
      const app = Object.create(managerPrototype());
      app._adminStore = null;
      const services = app._buildServices();
      for (const [key, value] of Object.entries(services)) {
        assert.equal(typeof value, key === 'notify' ? 'object' : 'function', `${key} is not callable`);
      }
      return Object.keys(services).sort();
    });
    assert.deepStrictEqual(keys, [...MANAGER_SERVICE_KEYS]);
  });

  // A fresh bag per call, not a memoised one. The player shell creates six stores in its bag, so
  // a cached bag there would hand a second window the first one's selection state; the manager
  // shell answers the same contract so the two shells cannot drift on it.
  it('answers a distinct bag on every call', async () => {
    const world = buildManagerWorld();
    await withManager(constructShell, world, ({ app, services }) => {
      const second = app._buildServices();
      assert.ok(second !== services, 'the bag was memoised on the instance');
      assert.deepStrictEqual(Object.keys(second).sort(), [...MANAGER_SERVICE_KEYS]);
    });
  });

  it('reads the world at call time rather than at build time', async () => {
    const first = buildManagerWorld();
    const second = buildManagerWorld();
    second.handles.craftingSystemManager.marker = 'second-world';
    const { hooks } = recordingHooks(first.record);
    const restoreFirst = installWorld(first);
    const previousHooks = globalThis.Hooks;
    globalThis.Hooks = hooks;
    let services;
    try {
      const app = constructShell();
      app._adminStore = { refresh: async () => {} };
      services = app._buildServices();
    } finally {
      globalThis.Hooks = previousHooks;
      restoreFirst();
    }
    const restoreSecond = installWorld(second);
    try {
      assert.strictEqual(
        services.getCraftingSystemManager(),
        second.handles.craftingSystemManager,
        'the bag captured the world it was built in rather than reading it per call'
      );
      assert.equal(services.getFoundrySystemId(), 'dnd5e');
    } finally {
      restoreSecond();
    }
  });

  function managerPrototype() {
    return Object.getPrototypeOf(constructShell());
  }
});

/** A payload the importer resolves to an already-installed system, which is its cheapest exit. */
function fakeImportFile() {
  return {
    text: async () =>
      JSON.stringify({
        fabricateVersion: '1.0.0',
        system: { id: 'sys-import', name: 'Imported', components: [] },
        recipes: [],
      }),
  };
}

async function callDataService(services, key, world) {
  switch (key) {
    case 'getKnowledgeSnapshot':
      return services.getKnowledgeSnapshot('sys-1');
    case 'getActorUuidsInSceneRegion':
      return services.getActorUuidsInSceneRegion('Scene.stage.Region.grove', [
        'Actor.pc-arden',
        'Actor.pc-brisa',
      ]);
    case 'getActorRollData':
      return await services.getActorRollData('Actor.pc-arden');
    case 'getSetting':
      return services.getSetting('craftingHints');
    case 'resolveToolSource':
      return await services.resolveToolSource('Item.hammer');
    case 'localize':
      return services.localize('FABRICATE.Key', { count: 2 });
    case 'enrichToHtml':
      return await services.enrichToHtml('<p>@UUID[Item.hammer]</p>', {
        relativeTo: 'Item.hammer',
      });
    case 'isFabricateReady':
      return services.isFabricateReady();
    default:
      return services[key](world);
  }
}

describe('the player shell services bag', () => {
  let constructShell;
  let release;

  before(async () => {
    let resolveReady;
    const ready = new Promise((r) => {
      resolveReady = r;
    });
    let finish;
    const done = new Promise((r) => {
      finish = r;
    });
    const booted = withProductionApplication(
      {
        modulePath: PLAYER_MODULE,
        exportName: 'SvelteFabricateApp',
        ApplicationV2: RecordingApplicationV2,
        hooks: { on: () => 1, off: () => {}, once: () => 1 },
      },
      async (app) => {
        constructShell = () => new app.constructor();
        resolveReady();
        await done;
      }
    );
    release = () => {
      finish();
      return booted;
    };
    await ready;
  });

  after(async () => {
    await release();
  });

  it('exposes exactly the keys the corpus names, stores included', async () => {
    const world = buildPlayerWorld();
    const restore = installPlayerWorld(world);
    try {
      const services = constructShell()._buildServices();
      assert.deepStrictEqual(Object.keys(services).sort(), [...PLAYER_SERVICE_KEYS]);
      for (const key of PLAYER_STORE_KEYS) {
        assert.equal(typeof services[key], 'object', `${key} is the store the bag creates`);
        assert.ok(services[key], `${key} must not be null`);
      }
      assert.deepStrictEqual(
        Object.keys(services).filter((key) => PLAYER_STORE_KEYS.includes(key)),
        [...PLAYER_STORE_KEYS],
        'the six stores are created in a fixed order the crafting store depends on'
      );
    } finally {
      restore();
    }
  });

  it('forwards every non-store key to the facade method it names', async () => {
    const world = buildPlayerWorld();
    const restore = installPlayerWorld(world);
    try {
      const services = constructShell()._buildServices();
      const journalBefore = world.journal.length;
      const answers = {};
      for (const key of PLAYER_SERVICE_KEYS) {
        if (PLAYER_STORE_KEYS.includes(key)) continue;
        const value = services[key];
        assert.equal(typeof value, 'function', `${key} is not callable`);
        answers[key] = describeAnswer(await value(...playerArgumentsFor(key)));
      }
      // The whole journal entry, not only its channel: every forwarding key's observable is the
      // facade method it reaches and the arguments it threads there, and the two argument threads
      // this bag owns (`presentTools`, `interactableRef`) are invisible to a name-only list.
      const reached = world.journal
        .slice(journalBefore)
        .map((entry) => normaliseForGolden(entry));
      assert.ok(reached.length > 30, 'the forwarding keys must actually reach the facade');
      expectGolden('player.answers', answers);
      expectGolden('player.reached', reached);
    } finally {
      restore();
    }
  });

  // The player bag is not buildable with no globals: `createAlchemyStore` calls
  // `getSelectedAlchemySystemId` in its constructor, which reads `game`. The reachable floor is a
  // world with no `game.fabricate`, which every optional-chained forward already tolerates.
  it('builds the player bag against a world with no Fabricate facade', () => {
    const app = constructShell();
    const previous = globalThis.game;
    globalThis.game = { i18n: { localize: (key) => key, format: (key) => key } };
    try {
      assert.deepStrictEqual(Object.keys(app._buildServices()).sort(), [...PLAYER_SERVICE_KEYS]);
    } finally {
      globalThis.game = previous;
    }
  });
});

/** A JSON-safe description of one forwarded answer, whatever shape the facade handed back. */
function describeAnswer(value) {
  return normaliseForGolden(value);
}
