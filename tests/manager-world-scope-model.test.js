/**
 * The world-scope model (issue 1721): the world corpus, the entry editors and the drop writes. The
 * view state, the route and the parser sit in a `SvelteMap` behind their thunks, as the shell's
 * `$derived` values and `foundry.utils` do, so a change after construction reaches every read.
 */
import assert from 'node:assert/strict';
import { describe, it, before, after, afterEach } from 'node:test';

import { SvelteMap } from 'svelte/reactivity';

import { flushSync } from '../node_modules/svelte/src/index-client.js';

import { createSvelteModuleCompiler } from './helpers/compile-svelte-module.js';
import { parseUuidDouble } from './helpers/manager/parseUuidDouble.js';

const MODEL_PATH = 'src/ui/svelte/apps/manager/worldScopeModel.svelte.js';
const HAMMER = Object.freeze({ uuid: 'Item.hammer', name: 'Hammer', img: 'h.webp' });
const OWNED = Object.freeze({ uuid: 'Actor.a.Item.b', name: 'Owned', img: '' });
const DESCRIBED = Object.freeze({
  uuid: 'Item.resolved',
  name: 'Anvil',
  img: 'a.webp',
  description: '<p>Heavy</p>',
});
const PACK_DROP = 'Compendium.p.q.Item.b';
const UNLINK_PATCH = Object.freeze({
  originItemUuid: null,
  registeredItemUuid: null,
  aliasItemUuids: [],
});

describe('world-scope model', () => {
  let compiler;
  let createWorldScopeModel;
  const originalUi = globalThis.ui;

  before(async () => {
    compiler = createSvelteModuleCompiler('fabricate-world-scope-model-');
    ({ createWorldScopeModel } = await compiler.loadWithClosure(MODEL_PATH));
  });

  after(() => {
    compiler.cleanup();
  });

  afterEach(() => {
    Object.assign(globalThis, { ui: originalUi });
  });

  /** One model over a live world corpus, with every write, toast and navigation logged. */
  function openModel({
    tools = [],
    components = [],
    essences = [],
    essenceExtras = {},
    vocabulary,
    actorOptions,
    selectedSystemId = 'sys',
    selectedEssenceId = null,
    sources: extraSources = {},
    store: overrides = {},
  } = {}) {
    const live = new SvelteMap([
      [
        'viewState',
        {
          worldScope: {
            tool: { entities: tools.map((entry) => entry.entity), entries: tools },
            component: { entities: [], entries: components },
            essence: {
              entities: [{ id: 'ash' }],
              entries: essences,
              retiredIds: ['new-essence'],
              ...essenceExtras,
            },
            ...(vocabulary && { vocabulary }),
          },
          actorOptions,
        },
      ],
      ['view', 'world-tools'],
      ['parseUuid', parseUuidDouble],
    ]);
    const writes = [];
    const opened = [];
    const toasts = { info: [], warn: [] };
    Object.assign(globalThis, {
      ui: {
        notifications: {
          info: (message) => {
            toasts.info.push(message);
          },
          warn: (message) => {
            toasts.warn.push(message);
          },
        },
      },
    });
    const family = (type) => ({
      createEntity: async (entity) => {
        writes.push(['create', type, entity]);
        return true;
      },
      updateEntity: async (id, patch) => {
        writes.push(['update', type, id, patch]);
        return true;
      },
    });
    const store = {
      randomID: () => 'minted',
      worldScope: {
        tool: family('tool'),
        component: family('component'),
        essence: family('essence'),
      },
      ...overrides,
    };
    const sources = { [HAMMER.uuid]: HAMMER, [OWNED.uuid]: OWNED, ...extraSources };
    const model = createWorldScopeModel({
      store: () => store,
      services: () => ({ resolveToolSource: async (uuid) => sources[uuid] ?? null }),
      viewState: () => live.get('viewState'),
      view: () => live.get('view'),
      selectedSystemId: () => selectedSystemId,
      selectedEssenceForInspector: () => (selectedEssenceId ? { id: selectedEssenceId } : null),
      parseUuid: () => live.get('parseUuid'),
      openWorldScopedEntry: (view, id) => {
        opened.push([view, id]);
      },
      text: (_key, fallback) => fallback,
      format: (_key, fallback, data) => fallback.replaceAll('{name}', data.name),
    });
    return { model, live, writes, opened, toasts };
  }

  it('opens an existing source through the injected navigation, and says so', async () => {
    const existing = {
      id: 'old',
      worldEnabled: false,
      entity: { name: 'Old', originItemUuid: HAMMER.uuid },
    };
    const { model, writes, opened, toasts } = openModel({ tools: [existing] });

    assert.equal(
      await model.createWorldToolFromItemDrop({ type: 'Item', uuid: HAMMER.uuid }),
      true
    );
    assert.deepEqual(opened, [['world-tool-entry', 'old']]);
    assert.deepEqual(writes, [], 'nothing is minted');
    assert.match(toasts.info[0], /^Old already exists .*disabled at world scope/);
  });

  it('navigates to a new record only when the store answers true', async () => {
    const refused = openModel({
      store: { worldScope: { tool: { createEntity: async () => undefined } } },
    });
    assert.equal(await refused.model.createWorldToolFromItemDrop({ uuid: HAMMER.uuid }), false);
    assert.deepEqual(refused.opened, [], 'a create that did not land opens nothing');

    const created = openModel();
    assert.equal(await created.model.createWorldToolFromItemDrop({ uuid: HAMMER.uuid }), true);
    assert.deepEqual(created.opened, [['world-tool-entry', 'minted']]);
  });

  it('reads the parser when a drop lands, not when the model is built', async () => {
    const { model, live, writes, toasts } = openModel();
    live.set('parseUuid', undefined);

    assert.equal(await model.createWorldComponentFromItemDrop({ uuid: HAMMER.uuid }), false);
    assert.equal(toasts.warn.length, 1, 'with no parser the component drop fails closed');

    live.set('parseUuid', parseUuidDouble);
    assert.equal(await model.createWorldComponentFromItemDrop({ uuid: HAMMER.uuid }), true);
    assert.deepEqual(writes.at(-1)?.slice(0, 2), ['create', 'component']);
  });

  it('refuses an embedded component relink and patches the same relink for a Tool', async () => {
    const { model, writes, toasts } = openModel();
    model.worldScopedEntryId = 'entry';

    assert.equal(await model.relinkWorldComponentSource({ uuid: OWNED.uuid }), false);
    assert.equal(toasts.warn.length, 1);
    assert.equal(await model.relinkWorldToolSource({ uuid: OWNED.uuid }), true);
    assert.deepEqual(writes, [
      [
        'update',
        'tool',
        'entry',
        {
          name: OWNED.name,
          img: '',
          description: '',
          originItemUuid: OWNED.uuid,
          registeredItemUuid: OWNED.uuid,
          aliasItemUuids: [],
        },
      ],
    ]);
  });

  it('mints a world essence against the retired ids and opens it', async () => {
    const { model, writes, opened } = openModel();
    await model.createWorldEssence();

    const entity = writes[0][2];
    assert.notEqual(entity.id, 'new-essence', 'a retired id is never reissued');
    assert.deepEqual(opened, [['world-essence-entry', entity.id]]);
  });

  it('flags an entry save while it runs and answers whether it landed', async () => {
    const { model } = openModel();
    let release;
    model.toolEntry.onDraft({ save: () => new Promise((resolve) => (release = resolve)) });
    model.toolEntry.onDirty(true);
    model.toolEntry.onSubline('Pick · world');

    const saving = model.toolEntry.save();
    assert.equal(model.toolEntry.saving, true);
    release(false);
    assert.equal(await saving, false, 'a refused write is not a save');
    assert.equal(model.toolEntry.saving, false);

    model.toolEntry.onDraft(null);
    assert.equal(model.toolEntry.dirty, false, 'a withdrawn editor is clean');
    assert.equal(model.toolEntry.subline, '');
    assert.equal(await model.toolEntry.save(), false, 'and has nothing to save');
  });

  it('follows the route and the entry id into the header record', () => {
    const tool = { id: 'pick', entity: { name: 'Pick' } };
    const { model, live } = openModel({ tools: [tool] });
    model.worldScopedEntryId = 'pick';
    assert.equal(model.worldToolEntryRecord, null, 'off the entry route there is no record');

    live.set('view', 'world-tool-entry');
    flushSync();
    assert.equal(model.worldToolEntryRecord, tool);
    assert.equal(model.worldToolEntryName, 'Pick');
    model.handleScopedEntryDraftIdentity({ name: 'Draft pick' });
    assert.equal(model.worldToolEntryName, 'Draft pick', 'the heading names the draft');
  });

  it('creates the whole entity from the resolved source, falling back to the dropped uuid', async () => {
    const resolved = openModel({ sources: { [PACK_DROP]: DESCRIBED } });
    await resolved.model.createWorldToolFromItemDrop({ uuid: PACK_DROP });
    assert.deepEqual(resolved.writes, [
      [
        'create',
        'tool',
        {
          id: 'minted',
          name: 'Anvil',
          img: 'a.webp',
          description: '<p>Heavy</p>',
          originItemUuid: DESCRIBED.uuid,
          registeredItemUuid: DESCRIBED.uuid,
        },
      ],
    ]);

    const bare = openModel({ sources: { 'Item.bare': { name: 'Bare' } } });
    await bare.model.createWorldComponentFromItemDrop({ uuid: 'Item.bare' });
    assert.deepEqual(bare.writes[0][2], {
      id: 'minted',
      name: 'Bare',
      img: '',
      description: '',
      originItemUuid: 'Item.bare',
      registeredItemUuid: 'Item.bare',
    });
  });

  it('relinks a component through the component family, and a Tool through the tool one', async () => {
    const patch = {
      name: DESCRIBED.name,
      img: DESCRIBED.img,
      description: DESCRIBED.description,
      originItemUuid: DESCRIBED.uuid,
      registeredItemUuid: DESCRIBED.uuid,
      aliasItemUuids: [],
    };
    const { model, writes } = openModel({ sources: { [DESCRIBED.uuid]: DESCRIBED } });
    model.worldScopedEntryId = 'entry';

    assert.equal(await model.relinkWorldComponentSource({ uuid: DESCRIBED.uuid }), true);
    assert.equal(await model.relinkWorldToolSource({ uuid: DESCRIBED.uuid }), true);
    assert.deepEqual(writes, [
      ['update', 'component', 'entry', patch],
      ['update', 'tool', 'entry', patch],
    ]);
    assert.equal(await model.relinkWorldToolSource(null), false, 'no payload relinks nothing');
    assert.equal(writes.length, 2);
  });

  it('unlinks with the exact clearing patch on each family, and needs an entry id', async () => {
    const { model, writes } = openModel();

    assert.equal(await model.unlinkWorldComponentSource('c1'), true);
    assert.equal(await model.unlinkWorldToolSource('t1'), true);
    assert.deepEqual(writes, [
      ['update', 'component', 'c1', UNLINK_PATCH],
      ['update', 'tool', 't1', UNLINK_PATCH],
    ]);
    assert.equal(await model.unlinkWorldComponentSource(''), false);
    assert.equal(await model.unlinkWorldToolSource(''), false);
    assert.equal(writes.length, 2, 'an empty id writes nothing');
  });

  it('names the existing component in the toast, falling back to its id', async () => {
    const named = openModel({
      components: [{ id: 'c1', entity: { name: 'Forge', registeredItemUuid: HAMMER.uuid } }],
    });
    await named.model.createWorldComponentFromItemDrop({ uuid: HAMMER.uuid });
    assert.deepEqual(named.toasts.info, [
      'Forge is already a world component, so this drop opened it instead of making a second one.',
    ]);
    assert.deepEqual(named.opened, [['world-component-entry', 'c1']]);

    const unnamed = openModel({
      components: [{ id: 'c9', entity: { originItemUuid: HAMMER.uuid } }],
    });
    await unnamed.model.createWorldComponentFromItemDrop({ uuid: HAMMER.uuid });
    assert.match(unnamed.toasts.info[0], /^c9 is already a world component/);
  });

  it('names an enabled existing Tool in its toast', async () => {
    const { model, toasts } = openModel({
      tools: [{ id: 't1', entity: { name: 'Pick', originItemUuid: HAMMER.uuid } }],
    });
    await model.createWorldToolFromItemDrop({ uuid: HAMMER.uuid });
    assert.match(toasts.info[0], /^Pick already exists for that Item\. Opened it/);
  });

  describe('the published corpus', () => {
    const COMPONENTS = [
      {
        id: 'c1',
        entity: {
          name: 'Resin',
          img: 'r.webp',
          registeredItemUuid: 'Item.r',
          originItemUuid: 'Item.o',
        },
        defaults: { tags: ['wood', 'alpha'] },
      },
      { id: 'c2', entity: {}, defaults: { tags: ['wood', 'Beta'] } },
      { id: 'c3', entity: { name: 'Bare', registeredItemUuid: 'Item.only' } },
    ];
    const ESSENCES = [
      { id: 'ash', worldEnabled: false, entity: { name: 'Ash' } },
      { id: 'ember', entity: { name: 'Ember' }, membershipCount: 3, systems: [{}, {}] },
    ];

    it('reads the offers and tags off one corpus', () => {
      const { model } = openModel({ components: COMPONENTS, essences: ESSENCES });
      const rows = [
        [
          'component options',
          model.worldComponentOptions,
          [
            {
              id: 'c1',
              name: 'Resin',
              img: 'r.webp',
              registeredItemUuid: 'Item.r',
              originItemUuid: 'Item.o',
            },
            { id: 'c2', name: 'c2', img: '' },
            { id: 'c3', name: 'Bare', img: '', registeredItemUuid: 'Item.only' },
          ],
        ],
        [
          'essence options',
          model.worldEssenceOptions,
          [
            { name: 'Ash', id: 'ash', enabled: false },
            { name: 'Ember', id: 'ember', enabled: true },
          ],
        ],
        ['tags, de-duplicated and sorted', model.worldComponentTags, ['alpha', 'Beta', 'wood']],
      ];
      for (const [label, actual, expected] of rows) assert.deepEqual(actual, expected, label);
    });

    it('joins the inspected essence to the selected system, and only when available', () => {
      const systems = [
        { systemId: 'other', inherited: true },
        { systemId: 'sys', inherited: false },
      ];
      const essences = [{ id: 'ash', entity: {}, membershipCount: 2, systems }];
      const available = { essenceExtras: { available: true } };
      const rows = [
        ['available, member', available, systems, false],
        ['unavailable', {}, [], null],
        ['available, not a member', { ...available, selectedSystemId: 'zz' }, systems, null],
        ['no inspected essence', { ...available, selectedEssenceId: null }, [], null],
      ];
      for (const [label, options, rowsOut, inherited] of rows) {
        const { model } = openModel({ essences, selectedEssenceId: 'ash', ...options });
        assert.deepEqual(model.inspectedEssenceSystemRows, rowsOut, `${label}: rows`);
        assert.equal(model.inspectedEssenceInherited, inherited, `${label}: inherited`);
      }
    });
  });

  describe('the entry headings', () => {
    const COMPONENT = { id: 'x', entity: { name: 'CompX', img: 'cx.webp' } };
    const TOOL = { id: 'x', entity: { name: 'ToolX', img: 'tx.webp' } };
    const ESSENCE = {
      id: 'x',
      entity: { name: 'Salt', icon: 'fas fa-salt', colorToken: 'amber' },
      membershipCount: 2,
      systems: [{}, {}, {}],
    };

    it('picks the record for the open route, then follows the draft', () => {
      const { model, live } = openModel({
        tools: [TOOL],
        components: [COMPONENT],
        essences: [ESSENCE],
      });
      model.worldScopedEntryId = 'x';

      live.set('view', 'world-component-entry');
      flushSync();
      assert.equal(model.worldComponentEntryRecord, COMPONENT, 'a component, not the tool');
      assert.equal(model.worldComponentEntryName, 'CompX');
      assert.equal(model.worldComponentEntryImage, 'cx.webp');
      model.handleScopedEntryDraftIdentity({ name: 'Draft', img: 'd.webp' });
      assert.equal(model.worldComponentEntryName, 'Draft');
      assert.equal(model.worldComponentEntryImage, 'd.webp', 'the image follows the draft too');

      model.handleScopedEntryDraftIdentity(null);
      live.set('view', 'world-essence-entry');
      flushSync();
      assert.equal(model.worldEssenceEntryRecord, ESSENCE);
      assert.equal(model.worldEssenceEntryName, 'Salt');
      assert.equal(model.worldEssenceEntryIcon, 'fas fa-salt');
      assert.equal(model.worldEssenceEntryTint, 'amber');
      assert.equal(model.worldEssenceEntrySubtitle, 'World definition · used by 2 of 3 systems');
      assert.equal(model.worldComponentEntryRecord, null, 'off its route there is no record');
    });
  });

  it('arms the world Tool header Delete and disarms it when the page withdraws it', () => {
    const { model } = openModel();
    const descriptor = { token: 'delete-pick', label: 'Delete' };

    assert.equal(model.worldToolEntryDelete, null);
    model.handleWorldToolEntryDelete(descriptor);
    assert.deepEqual(model.worldToolEntryDelete, descriptor);
    assert.equal(model.worldToolEntryDeleteArmed, '');
    model.worldToolEntryDeleteArmed = descriptor.token;
    assert.equal(model.worldToolEntryDeleteArmed, 'delete-pick');

    model.handleWorldToolEntryDelete(null);
    assert.equal(model.worldToolEntryDelete, null);
    assert.equal(model.worldToolEntryDeleteArmed, '', 'withdrawing the descriptor disarms it');
  });

  it('offers player characters for the Tool preview and reads their roll data', () => {
    const actorOptions = [
      { uuid: 'Actor.pc', name: 'Hero', img: 'h.webp', isPlayerCharacter: true },
      { uuid: 'Actor.npc', name: 'Goblin', isPlayerCharacter: false },
      { uuid: 'Actor.bare', isPlayerCharacter: true },
    ];
    const { model, live } = openModel({
      actorOptions,
      store: { getActorRollData: (uuid) => (uuid === 'Actor.pc' ? { str: 3 } : undefined) },
    });
    assert.deepEqual(model.worldToolPreviewActors, [], 'off the Tool entry route it offers none');
    live.set('view', 'world-tool-entry');
    flushSync();

    assert.deepEqual(model.worldToolPreviewActors, [
      { id: 'Actor.pc', name: 'Hero', img: 'h.webp' },
      { id: 'Actor.bare', name: 'Actor.bare', img: '' },
    ]);
    assert.deepEqual(model.worldToolPreviewRollData('Actor.pc'), { str: 3 });
    assert.equal(model.worldToolPreviewRollData('Actor.bare'), null, 'no data is null');
    assert.equal(model.worldToolPreviewRollData(''), null);
  });

  it('creates a world essence with its placeholder icon, and opens it unless refused', async () => {
    const { model, writes, opened } = openModel();
    await model.createWorldEssence();
    assert.deepEqual(writes[0][2], {
      id: writes[0][2].id,
      name: 'New essence',
      icon: 'fas fa-flask-vial',
      colorToken: '',
      description: '',
    });
    assert.equal(opened.length, 1);

    const refused = openModel({
      store: { worldScope: { essence: { createEntity: async () => false } } },
    });
    await refused.model.createWorldEssence();
    assert.deepEqual(refused.opened, [], 'a create the store refused opens nothing');
  });
});
