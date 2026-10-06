/**
 * Issue 2218: a component import registers a World Component the target system holds. A real
 * manager and a real component scope store run over a counting settings seam; documents resolve
 * per uuid, and a pack document under both spellings of its uuid, as in core.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';

let minted = 0;
const DOCUMENTS = new Map();
const PACKS = new Map();

Object.assign(globalThis, {
  foundry: {
    utils: {
      randomID: () => `minted-${(minted += 1)}`,
      getProperty: (object, path) =>
        path.split('.').reduce((node, key) => node?.[key], object) ?? undefined,
    },
  },
  game: {
    user: { isGM: true },
    system: { id: 'dnd5e' },
    actors: [],
    packs: { get: (id) => PACKS.get(id) ?? null },
    fabricate: null,
  },
  ui: { notifications: { info() {}, warn() {}, error() {} } },
  fromUuid: async (uuid) => DOCUMENTS.get(uuid) ?? null,
});

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { createComponentScopeStore } = await import('../src/systems/worldScopeStores.js');
const { applyFolderImportDecisions } = await import('../src/ui/svelte/util/importFolderGroups.js');
const { projectWorldScopeEntity } = await import('../src/ui/svelte/stores/worldScopeProjection.js');
const { createWorldScopeEntityActions } =
  await import('../src/ui/svelte/stores/worldScopeActions.js');
const { makeScopeSettings } = await import('./helpers/worldScopeCorpus.js');

const FORGE = 'sys-forge';
const KITCHEN = 'sys-kitchen';
const REAGENT_PACK = 'world.reagents';
const TEMPLATE_UUID = 'Compendium.kit.templates.Item.blank';

beforeEach(() => {
  DOCUMENTS.clear();
  PACKS.clear();
});

/** A world Item, resolvable by its uuid. */
function worldItem(id, overrides = {}) {
  const document = {
    documentName: 'Item',
    id,
    uuid: `Item.${id}`,
    name: `Item ${id}`,
    img: `${id}.png`,
    ...overrides,
  };
  DOCUMENTS.set(document.uuid, document);
  return document;
}

/** A pack Item shaped as core shapes one, resolvable under both spellings of its uuid. */
function packItem(packId, id, overrides = {}) {
  const document = {
    documentName: 'Item',
    id,
    pack: packId,
    uuid: `Compendium.${packId}.Item.${id}`,
    name: `Item ${id}`,
    img: `${id}.png`,
    ...overrides,
  };
  DOCUMENTS.set(document.uuid, document);
  DOCUMENTS.set(typeless(document), document);
  return document;
}

const typeless = (document) => `Compendium.${document.pack}.${document.id}`;

function pack(packId, documents) {
  PACKS.set(packId, {
    collection: packId,
    documentName: 'Item',
    getDocuments: async () => documents,
  });
}

/** The in-system row an import of `document` leaves unchanged, registered under `uuid`. */
function heldRow(id, document, uuid = document.uuid, overrides = {}) {
  return { id, name: document.name, img: document.img, registeredItemUuid: uuid, ...overrides };
}

/** A world entity linked to `uuid`. */
function worldEntity(id, uuid, overrides = {}) {
  return {
    id,
    name: `World ${id}`,
    img: `${id}.png`,
    description: '',
    originItemUuid: uuid,
    registeredItemUuid: uuid,
    aliasItemUuids: [],
    ...overrides,
  };
}

function scopeOf({ entities = [], defaults = {}, membership = [] } = {}) {
  return {
    entities,
    defaults,
    membership: Object.fromEntries(
      membership.map(([entityId, systemId]) => [
        `${entityId}|${systemId}`,
        { entityId, systemId, inherit: {} },
      ])
    ),
  };
}

/**
 * A manager over `systems` and a component scope store over `scope` (`undefined` is an unseeded
 * world, `store: false` a manager with no store). The manager's own `save` writes the
 * `craftingSystems` setting through `game.settings`, which reads back what was written; `events`
 * names every setting write in order, and `failNextCorpusWrite` rejects the next such write.
 */
function world({ scope, systems = [{ id: FORGE }], store: withStore = true } = {}) {
  const events = [];
  const settings = makeScopeSettings(scope);
  const persistScope = settings.setSetting;
  settings.setSetting = async (...args) => {
    await persistScope(...args);
    events.push('componentScope');
  };
  const store = withStore ? createComponentScopeStore(settings) : null;
  const manager = new CraftingSystemManager(
    { getRecipes: () => [] },
    { componentScopeStore: store, essenceScopeStore: null, toolScopeStore: null }
  );
  for (const system of systems) {
    manager.systems.set(system.id, manager._normalizeSystem({ name: system.id, ...system }));
  }
  manager.initialized = true;
  const corpus = { rejection: null, persisted: asStored([...manager.systems.values()]) };
  const persistedIds = (systemId) =>
    (corpus.persisted.find((system) => system.id === systemId)?.components ?? []).map(
      (component) => component.id
    );
  corpus.componentIdsAtWrite = [];
  Object.assign(globalThis.game, {
    settings: {
      get: (_namespace, key) => {
        if (corpus.unreadable) throw new Error('the setting cannot be read');
        return key === 'craftingSystems' ? corpus.persisted : undefined;
      },
      set: async (_namespace, key, value) => {
        if (corpus.rejection) {
          const error = corpus.rejection;
          corpus.rejection = null;
          throw error;
        }
        corpus.persisted = asStored(value);
        corpus.componentIdsAtWrite.push(persistedIds(FORGE));
        events.push(key);
      },
    },
  });
  return {
    manager,
    store,
    settings,
    events,
    corpus,
    persistedIds,
    failNextCorpusWrite: (error) => (corpus.rejection = error),
    entityIds: () => (settings.value?.entities ?? []).map((entity) => entity.id),
    membershipKeys: () => Object.keys(settings.value?.membership ?? {}),
  };
}

const asStored = (value) => JSON.parse(JSON.stringify(value));

const componentIds = (manager, systemId) =>
  manager.getSystem(systemId).components.map((component) => component.id);

const resolvedRow = (manager, systemId, id) =>
  manager.resolveScopedComponents(manager.getSystem(systemId)).find((row) => row.id === id);

/** The three import routes over the same documents, each answering its run's result. */
const ROUTES = [
  {
    route: 'single drop',
    run: async (manager, systemId, documents) => {
      let last;
      for (const document of documents)
        last = await manager.addItemFromUuid(systemId, document.uuid);
      return last;
    },
  },
  {
    route: 'pack import',
    run: (manager, systemId, documents) => {
      pack(REAGENT_PACK, documents);
      return manager.addItemsFromPack(systemId, REAGENT_PACK);
    },
  },
  {
    route: 'folder import',
    run: (manager, systemId, documents, mapping = {}) =>
      applyFolderImportDecisions(manager, systemId, [
        {
          itemUuids: documents.map((document) => document.uuid),
          category: '',
          addTags: [],
          ...mapping,
        },
      ]),
  },
];
const BATCH_ROUTES = ROUTES.filter(({ route }) => route !== 'single drop');

describe('a new component gains its World Component and membership', () => {
  it('a single drop persists one entity and one membership under the new component id', async () => {
    const { manager, store, settings, events, entityIds, membershipKeys } = world();
    const ash = worldItem('ash');

    const result = await manager.addItemFromUuid(FORGE, ash.uuid);

    assert.equal(result.action, 'added');
    assert.deepEqual(entityIds(), [result.item.id]);
    assert.deepEqual(membershipKeys(), [`${result.item.id}|${FORGE}`]);
    assert.equal(settings.value.membership[`${result.item.id}|${FORGE}`].entityId, result.item.id);
    assert.deepEqual(events, ['craftingSystems', 'componentScope']);

    const projection = projectWorldScopeEntity({
      entityType: 'component',
      corpus: store.corpus(),
      systems: manager.getSystems(),
    });
    const entry = projection.entries.find((candidate) => candidate.id === result.item.id);
    assert.equal(entry.systems.find((row) => row.systemId === FORGE).member, true);
  });

  for (const { route, run } of BATCH_ROUTES) {
    it(`a ${route} of four new Items writes each setting exactly once`, async () => {
      const { manager, events, entityIds, membershipKeys } = world();
      const documents = ['ash', 'salt', 'moss', 'iron'].map((id) => packItem(REAGENT_PACK, id));

      const summary = await run(manager, FORGE, documents);

      assert.equal(summary.added, 4);
      assert.deepEqual(events, ['craftingSystems', 'componentScope']);
      assert.deepEqual(entityIds(), componentIds(manager, FORGE));
      assert.deepEqual(
        membershipKeys(),
        componentIds(manager, FORGE).map((id) => `${id}|${FORGE}`)
      );
    });
  }

  it('a batch owner that passes its own array decides when the registrations are written', async () => {
    const { manager, events, entityIds } = world();
    const registrations = [];
    const options = { persist: false, registrations };

    const ash = await manager.addItemFromUuid(FORGE, worldItem('ash').uuid, options);
    const salt = await manager.addItemFromUuid(FORGE, worldItem('salt').uuid, options);
    assert.deepEqual(events, [], 'nothing is written until the owner saves and flushes');

    await manager.save();
    assert.deepEqual(await manager.flushWorldComponentRegistrations(registrations), {
      registered: 2,
      error: null,
    });
    assert.deepEqual(entityIds(), [ash.item.id, salt.item.id]);
    assert.deepEqual(events, ['craftingSystems', 'componentScope']);
  });

  it('an unpersisted call with no array registers nothing and adopts nothing', async () => {
    const ash = worldItem('ash');
    const { manager, events } = world({
      scope: scopeOf({ entities: [worldEntity('world-ash', ash.uuid)] }),
    });

    const result = await manager.addItemFromUuid(FORGE, ash.uuid, { persist: false });

    assert.match(result.item.id, /^minted-/);
    assert.deepEqual(events, []);
  });
});

describe('an Item already linked to a World Component is adopted', () => {
  /** A world holding `world-ash` in the kitchen, linked to `document` under `storedUuid`. */
  function adoptionWorld(document, storedUuid, defaults = {}) {
    return world({
      scope: scopeOf({
        entities: [worldEntity('world-ash', storedUuid)],
        defaults,
        membership: [['world-ash', KITCHEN]],
      }),
      systems: [{ id: FORGE }, { id: KITCHEN }],
    });
  }

  for (const { route, run } of ROUTES) {
    it(`a ${route} imports it under the entity id and the roster does not grow`, async () => {
      const ash = packItem(REAGENT_PACK, 'ash');
      const { manager, events, entityIds, membershipKeys } = adoptionWorld(ash, ash.uuid);

      await run(manager, FORGE, [ash]);

      assert.deepEqual(componentIds(manager, FORGE), ['world-ash']);
      assert.deepEqual(entityIds(), ['world-ash']);
      assert.deepEqual(membershipKeys(), [`world-ash|${KITCHEN}`, `world-ash|${FORGE}`]);
      assert.deepEqual(events, ['craftingSystems', 'componentScope']);
    });
  }

  it('a pack Item is adopted whichever spelling of its uuid the entity stored', async () => {
    for (const spelling of ['four-part', 'type-less']) {
      const ash = packItem(REAGENT_PACK, 'ash');
      const stored = spelling === 'four-part' ? ash.uuid : typeless(ash);
      const { manager, entityIds } = adoptionWorld(ash, stored);
      pack(REAGENT_PACK, [ash]);

      await manager.addItemsFromPack(FORGE, REAGENT_PACK);

      assert.deepEqual(componentIds(manager, FORGE), ['world-ash'], `${spelling} link`);
      assert.deepEqual(entityIds(), ['world-ash'], `${spelling} link`);
    }
  });

  it('the adopted row resolves a world category default', async () => {
    const ash = worldItem('ash');
    const { manager } = adoptionWorld(ash, ash.uuid, {
      'world-ash': { id: 'world-ash', category: 'Reagent', essences: { fire: 2 } },
    });

    await manager.addItemFromUuid(FORGE, ash.uuid);

    const resolved = resolvedRow(manager, FORGE, 'world-ash');
    assert.equal(resolved.category, 'Reagent');
    assert.deepEqual(resolved.essences, { fire: 2 });
  });

  it('and resolves the category a folder mapping staged, where that differs', async () => {
    const ash = worldItem('ash');
    const { manager, settings } = adoptionWorld(ash, ash.uuid, {
      'world-ash': { id: 'world-ash', category: 'Reagent' },
    });

    await applyFolderImportDecisions(manager, FORGE, [
      { itemUuids: [ash.uuid], category: 'Herbs', addTags: [] },
    ]);

    assert.equal(resolvedRow(manager, FORGE, 'world-ash').category, 'Herbs');
    assert.deepEqual(settings.value.membership[`world-ash|${FORGE}`], {
      entityId: 'world-ash',
      systemId: FORGE,
      inherit: { category: false },
      category: 'Herbs',
    });
  });
});

describe('importing again a component that has no World Component', () => {
  for (const { route, run } of ROUTES) {
    it(`a ${route} writes the scope once and the corpus never, then neither`, async () => {
      const ash = packItem(REAGENT_PACK, 'ash');
      const { manager, events, entityIds, membershipKeys } = world({
        systems: [{ id: FORGE, components: [heldRow('comp-ash', ash)] }],
      });

      const first = await run(manager, FORGE, [ash]);

      assert.ok(first.action ? first.action === 'skipped' : first.skipped === 1);
      assert.deepEqual(events, ['componentScope']);
      assert.deepEqual(entityIds(), ['comp-ash']);
      assert.deepEqual(membershipKeys(), [`comp-ash|${FORGE}`]);

      await run(manager, FORGE, [ash]);
      assert.deepEqual(events, ['componentScope'], 'every component already has one');
    });
  }

  it('a membership added to an entity with world defaults keeps what the row resolved', async () => {
    const ash = worldItem('ash');
    const { manager, events, settings } = world({
      scope: scopeOf({
        entities: [worldEntity('world-ash', ash.uuid)],
        defaults: { 'world-ash': { id: 'world-ash', category: 'Reagent', essences: { fire: 2 } } },
        membership: [['world-ash', KITCHEN]],
      }),
      systems: [
        {
          id: FORGE,
          components: [
            heldRow('world-ash', ash, ash.uuid, { category: 'Herbs', essences: { water: 1 } }),
          ],
        },
        { id: KITCHEN },
      ],
    });
    const resolved = () => {
      const { category, essences } = resolvedRow(manager, FORGE, 'world-ash');
      return { category, essences };
    };
    const before = resolved();
    assert.deepEqual(before, { category: 'Herbs', essences: { water: 1 } });

    await manager.addItemFromUuid(FORGE, ash.uuid);

    assert.deepEqual(events, ['componentScope']);
    assert.equal(resolvedRow(manager, FORGE, 'world-ash').member, true);
    assert.deepEqual(resolved(), before);
    assert.deepEqual(settings.value.membership[`world-ash|${FORGE}`].inherit, {
      category: false,
      essences: false,
    });
  });
});

describe('what an import leaves unregistered', () => {
  it('a component whose source a World Component under another id shares', async () => {
    const ash = worldItem('ash');
    const { manager, events, entityIds, membershipKeys } = world({
      scope: scopeOf({ entities: [worldEntity('world-ash', ash.uuid)] }),
      systems: [{ id: FORGE, components: [heldRow('comp-ash', ash)] }],
    });

    assert.equal((await manager.addItemFromUuid(FORGE, ash.uuid)).action, 'skipped');

    assert.deepEqual(events, []);
    assert.deepEqual(entityIds(), ['world-ash']);
    assert.deepEqual(membershipKeys(), []);
  });

  it('a new row whose adoption target id the system already holds', async () => {
    const ash = worldItem('ash');
    const other = worldItem('other');
    const { manager, events, entityIds, membershipKeys } = world({
      scope: scopeOf({ entities: [worldEntity('world-ash', ash.uuid)] }),
      systems: [{ id: FORGE, components: [heldRow('world-ash', other)] }],
    });

    const result = await manager.addItemFromUuid(FORGE, ash.uuid);

    assert.equal(result.action, 'added');
    assert.match(result.item.id, /^minted-/);
    assert.deepEqual(events, ['craftingSystems']);
    assert.deepEqual(entityIds(), ['world-ash']);
    assert.deepEqual(membershipKeys(), []);
  });

  it('an Item embedded in an actor, which imports as it did before', async () => {
    const loot = worldItem('loot', {
      uuid: 'Actor.hero.Item.loot',
      isEmbedded: true,
      parent: { documentName: 'Actor', uuid: 'Actor.hero' },
    });
    const { manager, events, settings } = world({
      scope: scopeOf({ entities: [worldEntity('world-loot', loot.uuid)] }),
    });

    const result = await manager.addItemFromUuid(FORGE, loot.uuid);

    assert.equal(result.action, 'added');
    assert.match(result.item.id, /^minted-/, 'no World Component is adopted either');
    assert.deepEqual(events, ['craftingSystems']);
    assert.equal(settings.writes.length, 0);

    assert.equal((await manager.addItemFromUuid(FORGE, loot.uuid)).action, 'skipped');
    assert.deepEqual(events, ['craftingSystems'], 'nor is the row it left registered later');
  });
});

describe('one run, one registration per component', () => {
  it('one Item imported twice in a run yields one entity and one membership', async () => {
    const { manager, events, entityIds, membershipKeys } = world();
    const ash = worldItem('ash');

    const summary = await applyFolderImportDecisions(manager, FORGE, [
      { itemUuids: [ash.uuid, ash.uuid], category: '', addTags: [] },
    ]);

    assert.deepEqual([summary.added, summary.skipped], [1, 1]);
    assert.deepEqual(events, ['craftingSystems', 'componentScope']);
    assert.deepEqual(entityIds(), componentIds(manager, FORGE));
    assert.equal(membershipKeys().length, 1);
  });

  it('two overlapping runs each write only their own registrations', async () => {
    const { manager, entityIds } = world();
    const options = (registrations) => ({ persist: false, registrations });
    const first = [];
    const second = [];
    const ash = await manager.addItemFromUuid(FORGE, worldItem('ash').uuid, options(first));
    const salt = await manager.addItemFromUuid(FORGE, worldItem('salt').uuid, options(second));
    await manager.save();

    await manager.flushWorldComponentRegistrations(first);
    assert.deepEqual(entityIds(), [ash.item.id], 'the first run flushed none of the second');

    await manager.flushWorldComponentRegistrations(second);
    assert.deepEqual(entityIds(), [ash.item.id, salt.item.id]);
  });

  it('a registration whose row is deleted before the flush writes nothing', async () => {
    const { manager, events } = world();
    const registrations = [];
    const ash = await manager.addItemFromUuid(FORGE, worldItem('ash').uuid, {
      persist: false,
      registrations,
    });
    await manager.save();
    const system = manager.getSystem(FORGE);
    system.components = system.components.filter((component) => component.id !== ash.item.id);

    assert.deepEqual(await manager.flushWorldComponentRegistrations(registrations), {
      registered: 0,
      error: null,
    });
    assert.deepEqual(events, ['craftingSystems']);
  });

  it('a scope edit that lands between recording and the flush survives it', async () => {
    const { manager, store, entityIds } = world();
    const registrations = [];
    const ash = await manager.addItemFromUuid(FORGE, worldItem('ash').uuid, {
      persist: false,
      registrations,
    });
    const actions = createWorldScopeEntityActions({
      entityType: 'component',
      getStore: () => store,
    });
    await actions.createEntity({ id: 'world-late', name: 'Authored meanwhile' });

    await manager.save();
    await manager.flushWorldComponentRegistrations(registrations);

    assert.deepEqual(entityIds(), ['world-late', ash.item.id]);
  });
});

describe('a row the craftingSystems setting does not hold is never registered', () => {
  /** The memberships naming a row the persisted `craftingSystems` setting lacks. */
  function strandedMemberships({ settings, persistedIds }) {
    return Object.values(settings.value?.membership ?? {})
      .filter(({ entityId, systemId }) => !persistedIds(systemId).includes(entityId))
      .map(({ entityId, systemId }) => `${entityId}|${systemId}`);
  }

  it('a retry after a rejected craftingSystems write issues no scope write and persists no membership', async () => {
    const fixture = world();
    const { manager, events, entityIds, persistedIds, failNextCorpusWrite } = fixture;
    const ash = worldItem('ash');
    failNextCorpusWrite(new Error('the server refused the corpus write'));
    await assert.rejects(() => manager.addItemFromUuid(FORGE, ash.uuid));
    const [unsaved] = componentIds(manager, FORGE);
    assert.deepEqual(persistedIds(FORGE), [], 'the row exists in memory alone');

    assert.equal((await manager.addItemFromUuid(FORGE, ash.uuid)).action, 'skipped');

    assert.deepEqual(events, []);
    assert.deepEqual(fixture.membershipKeys(), []);

    // The next write of the system persists the row, and the import that then meets it registers it.
    const salt = await manager.addItemFromUuid(FORGE, worldItem('salt').uuid);
    assert.deepEqual(entityIds(), [salt.item.id]);
    await manager.addItemFromUuid(FORGE, ash.uuid);
    assert.deepEqual(entityIds(), [salt.item.id, unsaved]);
    assert.deepEqual(strandedMemberships(fixture), []);
  });

  it('a setting that cannot be read vouches for no row, and the import still resolves', async () => {
    const { manager, events, corpus, membershipKeys } = world();
    corpus.unreadable = true;

    const result = await manager.addItemFromUuid(FORGE, worldItem('ash').uuid);

    assert.deepEqual(Object.keys(result), ['item', 'action', 'sourceFallbacks']);
    assert.deepEqual(events, ['craftingSystems']);
    assert.deepEqual(membershipKeys(), []);
  });

  it('two overlapping runs over one system leave no membership for a row not yet saved', async () => {
    const fixture = world();
    const { manager, events, entityIds } = fixture;
    const ash = worldItem('ash');
    const pending = [];
    const added = await manager.addItemFromUuid(FORGE, ash.uuid, {
      persist: false,
      registrations: pending,
    });

    // A second run meets the first run's unsaved row and flushes before that run has saved.
    assert.equal((await manager.addItemFromUuid(FORGE, ash.uuid)).action, 'skipped');
    assert.deepEqual(events, []);
    assert.deepEqual(strandedMemberships(fixture), []);
    assert.deepEqual(fixture.membershipKeys(), []);

    await manager.save();
    await manager.flushWorldComponentRegistrations(pending);
    assert.deepEqual(entityIds(), [added.item.id]);
    assert.deepEqual(strandedMemberships(fixture), []);
  });
});

describe('a run that fails part-way', () => {
  /** Three pack Items, the third of which resolves to an Actor and so throws mid-run. */
  function failingDocuments() {
    const documents = ['ash', 'salt', 'bad'].map((id) => packItem(REAGENT_PACK, id));
    DOCUMENTS.set(documents[2].uuid, { documentName: 'Actor', name: 'Not an item' });
    return documents;
  }

  for (const { route, run } of BATCH_ROUTES) {
    it(`a ${route} writes each setting once, for the rows it persisted, and rejects as before`, async () => {
      const { manager, events, entityIds, corpus } = world();

      await assert.rejects(
        () => run(manager, FORGE, failingDocuments()),
        /Cannot add non-Item document/
      );

      assert.deepEqual(events, ['craftingSystems', 'componentScope']);
      assert.equal(corpus.componentIdsAtWrite[0].length, 2);
      assert.deepEqual(entityIds(), corpus.componentIdsAtWrite[0]);
    });

    it(`a ${route} whose scope write also rejects still rejects with the original error`, async () => {
      const { manager, settings, events } = world();
      settings.rejectNext(new Error('the server refused the scope write'));

      await assert.rejects(
        () => run(manager, FORGE, failingDocuments()),
        /Cannot add non-Item document/
      );
      assert.deepEqual(events, ['craftingSystems']);
    });
  }
});

describe('a rejected fabricate.componentScope write', () => {
  for (const { route, run } of ROUTES) {
    it(`a ${route} resolves, reports it, and the next import writes the registration`, async () => {
      const { manager, store, settings, events, entityIds } = world();
      const refused = new Error('the server refused the scope write');
      settings.rejectNext(refused);
      const ash = packItem(REAGENT_PACK, 'ash');

      const failed = await run(manager, FORGE, [ash]);

      assert.equal(failed.worldRegistrationError, refused);
      assert.deepEqual(events, ['craftingSystems']);
      assert.deepEqual(store.get(), { entities: [], defaults: {}, membership: {} });
      assert.equal(store.isSeeded('entities'), false, 'the world reads unseeded again');

      const retried = await run(manager, FORGE, [ash]);

      assert.ok(!('worldRegistrationError' in retried));
      assert.deepEqual(events, ['craftingSystems', 'componentScope']);
      assert.deepEqual(entityIds(), componentIds(manager, FORGE));
    });
  }
});

describe('a rejected craftingSystems write', () => {
  for (const { route, run } of ROUTES) {
    it(`a ${route} issues no scope write, and a later run writes none of its registrations`, async () => {
      const { manager, events, entityIds, failNextCorpusWrite } = world();
      const refused = new Error('the server refused the corpus write');
      failNextCorpusWrite(refused);

      await assert.rejects(() => run(manager, FORGE, [packItem(REAGENT_PACK, 'ash')]), refused);
      assert.deepEqual(events, []);
      const [orphan] = componentIds(manager, FORGE);

      const salt = await manager.addItemFromUuid(FORGE, worldItem('salt').uuid);

      assert.deepEqual(events, ['craftingSystems', 'componentScope']);
      assert.deepEqual(entityIds(), [salt.item.id]);
      assert.ok(!entityIds().includes(orphan));
    });
  }
});

describe('with no component scope store', () => {
  it('each route answers and writes exactly what it did before', async () => {
    const ash = packItem(REAGENT_PACK, 'ash');
    const single = world({ store: false });
    const dropped = await single.manager.addItemFromUuid(FORGE, ash.uuid);
    assert.deepEqual(Object.keys(dropped), ['item', 'action', 'sourceFallbacks']);
    assert.match(dropped.item.id, /^minted-/);
    assert.equal((await single.manager.addItemFromUuid(FORGE, ash.uuid)).action, 'skipped');
    assert.deepEqual(single.events, ['craftingSystems']);

    const summaryKeys = ['added', 'updated', 'skipped', 'total', 'sourceFallbacks'];
    for (const { route, run } of BATCH_ROUTES) {
      const batch = world({ store: false });
      const first = await run(batch.manager, FORGE, [ash]);
      const second = await run(batch.manager, FORGE, [ash]);
      assert.deepEqual(Object.keys(first), summaryKeys, route);
      assert.deepEqual([first.added, second.skipped], [1, 1], route);
      assert.deepEqual(batch.events, ['craftingSystems'], route);
      assert.equal(batch.settings.writes.length, 0, route);
    }
  });
});

describe('the first import into an unseeded world', () => {
  const essence = (overrides) => ({ id: 'ess-heat', name: 'Heat', ...overrides });

  it('keeps a sibling system references to ids in its own non-empty array', async () => {
    const { manager } = world({
      systems: [
        { id: FORGE },
        {
          id: KITCHEN,
          components: [{ id: 'comp-coal', name: 'Coal', registeredItemUuid: 'Item.coal' }],
          essenceDefinitions: [essence({ sourceComponentId: 'comp-coal' })],
        },
      ],
    });
    const linked = () => manager._normalizeSystem(manager.getSystem(KITCHEN)).essenceDefinitions[0];
    const before = linked();
    assert.equal(before.sourceItemUuid, 'Item.coal');

    const ash = await manager.addItemFromUuid(FORGE, worldItem('ash').uuid);

    assert.deepEqual(linked(), before);
    assert.deepEqual(
      [...manager._scopeBasis(manager.getSystem(KITCHEN)).componentIds],
      ['comp-coal', ash.item.id]
    );
  });

  it('gives a sibling whose array is empty a known basis, which stops vouching for a stranger', async () => {
    // Before the roster is seeded the basis is unknown and nothing is pruned; once it is seeded an
    // essence source naming a component in neither the roster nor the empty array loses its uuid.
    const { manager } = world({
      systems: [
        { id: FORGE },
        {
          id: KITCHEN,
          essenceDefinitions: [
            essence({ sourceComponentId: 'comp-ghost', sourceItemUuid: 'Item.ghost' }),
          ],
        },
      ],
    });
    const kitchen = manager.getSystem(KITCHEN);
    const linked = () => manager._normalizeSystem(kitchen).essenceDefinitions[0];
    assert.equal(manager._scopeBasis(kitchen).componentIds, null);
    assert.equal(linked().sourceItemUuid, 'Item.ghost');

    const ash = await manager.addItemFromUuid(FORGE, worldItem('ash').uuid);

    assert.deepEqual([...manager._scopeBasis(kitchen).componentIds], [ash.item.id]);
    assert.equal(linked().sourceItemUuid, null);
    assert.equal(linked().sourceComponentId, 'comp-ghost');
  });
});

describe('the three scrolls built from one template entry', () => {
  /** Three derivatives of the template: each records it as its compendium source, renamed. */
  function scrolls(make) {
    DOCUMENTS.set(TEMPLATE_UUID, { documentName: 'Item', name: 'Blank Scroll', img: 'scroll.png' });
    return ['fire', 'frost', 'storm'].map((id) =>
      make(id, { name: `Scroll of ${id}`, _stats: { compendiumSource: TEMPLATE_UUID } })
    );
  }

  for (const [kind, make] of [
    ['world Items', (id, overrides) => worldItem(`scroll-${id}`, overrides)],
    ['pack Items', (id, overrides) => packItem('world.scrolls', id, overrides)],
  ]) {
    it(`three ${kind} become three World Components`, async () => {
      const { manager, settings, events, entityIds } = world();
      const documents = scrolls(make);

      const summary = await applyFolderImportDecisions(manager, FORGE, [
        { itemUuids: documents.map((document) => document.uuid), category: '', addTags: [] },
      ]);

      assert.equal(summary.added, 3);
      assert.deepEqual(events, ['craftingSystems', 'componentScope']);
      assert.deepEqual(entityIds(), componentIds(manager, FORGE));
      assert.deepEqual(
        settings.value.entities.map((entity) => entity.registeredItemUuid),
        documents.map((document) => document.uuid)
      );
      assert.ok(
        settings.value.entities.every((entity) => entity.originItemUuid !== TEMPLATE_UUID),
        'no World Component claims the shared template entry'
      );
    });
  }

  it('a second system importing the pack scrolls adopts the three, whatever spelling they stored', async () => {
    const documents = scrolls((id, overrides) => packItem('world.scrolls', id, overrides));
    const ids = ['world-fire', 'world-frost', 'world-storm'];
    const { manager, entityIds } = world({
      scope: scopeOf({
        entities: documents.map((document, index) => worldEntity(ids[index], typeless(document))),
        membership: ids.map((id) => [id, KITCHEN]),
      }),
      systems: [{ id: FORGE }, { id: KITCHEN }],
    });
    pack('world.scrolls', documents);

    await manager.addItemsFromPack(FORGE, 'world.scrolls');

    assert.deepEqual(componentIds(manager, FORGE), ids);
    assert.deepEqual(entityIds(), ids);
  });

  it('a system holding the pre-fix merged component gains one World Component from that row', async () => {
    const documents = scrolls((id, overrides) => worldItem(`scroll-${id}`, overrides));
    const { manager, settings, events, entityIds, membershipKeys } = world({
      systems: [
        {
          id: FORGE,
          components: [
            {
              id: 'comp-merged',
              name: 'Scroll of storm',
              img: 'scroll-storm.png',
              registeredItemUuid: 'Item.scroll-storm',
              originItemUuid: TEMPLATE_UUID,
              aliasItemUuids: ['Item.scroll-fire', 'Item.scroll-frost'],
            },
          ],
        },
      ],
    });

    await applyFolderImportDecisions(manager, FORGE, [
      { itemUuids: documents.map((document) => document.uuid), category: '', addTags: [] },
    ]);

    assert.deepEqual(componentIds(manager, FORGE), ['comp-merged']);
    assert.deepEqual(entityIds(), ['comp-merged']);
    assert.deepEqual(membershipKeys(), [`comp-merged|${FORGE}`]);
    assert.equal(events.filter((event) => event === 'componentScope').length, 1);
    assert.deepEqual(
      new Set([
        settings.value.entities[0].originItemUuid,
        settings.value.entities[0].registeredItemUuid,
        ...settings.value.entities[0].aliasItemUuids,
      ]),
      new Set([TEMPLATE_UUID, 'Item.scroll-fire', 'Item.scroll-frost', 'Item.scroll-storm'])
    );
  });
});
