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
  function openModel({ tools = [], components = [], store: overrides = {} } = {}) {
    const live = new SvelteMap([
      [
        'viewState',
        {
          worldScope: {
            tool: { entities: tools.map((entry) => entry.entity), entries: tools },
            component: { entities: [], entries: components },
            essence: { entities: [{ id: 'ash' }], entries: [], retiredIds: ['new-essence'] },
          },
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
    const sources = { [HAMMER.uuid]: HAMMER, [OWNED.uuid]: OWNED };
    const model = createWorldScopeModel({
      store: () => store,
      services: () => ({ resolveToolSource: async (uuid) => sources[uuid] ?? null }),
      viewState: () => live.get('viewState'),
      view: () => live.get('view'),
      selectedSystemId: () => 'sys',
      selectedEssenceForInspector: () => null,
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
});
