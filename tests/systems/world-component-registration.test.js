/**
 * Issue 2218: the World Component registration planner and its single-write flush, driven as pure
 * functions over a persisted `fabricate.componentScope` payload and the in-system rows passed in.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adoptedWorldComponentId,
  flushWorldComponentRegistrations,
  planWorldComponentRegistration,
} from '../../src/systems/manager/worldComponentRegistration.js';
import { reportWorldIdentityDrift } from '../../src/systems/worldIdentityDrift.js';
import { identityOf } from '../../src/systems/worldScopeEntityGrouping.js';
import { createWorldScopeEntityActions } from '../../src/ui/svelte/stores/worldScopeActions.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { makeScopeSettings, makeScopeStore } from '../helpers/worldScopeCorpus.js';

const SYSTEM = 'sys-forge';
const OTHER_SYSTEM = 'sys-kitchen';

/** An in-system component row as the normalizer emits one, linked to `uuid`. */
function row(id, uuid, overrides = {}) {
  return {
    id,
    name: `Name of ${id}`,
    img: `${id}.png`,
    description: `About ${id}`,
    originItemUuid: uuid,
    registeredItemUuid: uuid,
    aliasItemUuids: [],
    category: 'general',
    tags: [],
    essences: {},
    ...overrides,
  };
}

/** A world entity carrying the identity and source link of a row linked to `uuid`. */
function entity(id, uuid, overrides = {}) {
  return { id, ...identityOf(row(id, uuid), 'components'), ...overrides };
}

function payload({ entities = [], defaults = {}, membership = [] } = {}) {
  return {
    entities,
    defaults,
    membership: Object.fromEntries(
      membership.map(([entityId, systemId, rest = {}]) => [
        `${entityId}|${systemId}`,
        { entityId, systemId, inherit: {}, ...rest },
      ])
    ),
  };
}

const plan = (scope, record, options = {}) =>
  planWorldComponentRegistration(scope, { systemId: SYSTEM, record, ...options });

describe('the registration decision for one in-system record', () => {
  it('case 1: an entity under its id that the system already holds writes nothing', () => {
    const record = row('world-ash', 'Item.ash');
    const scope = payload({
      entities: [entity('world-ash', 'Item.ash')],
      membership: [['world-ash', SYSTEM]],
    });
    assert.equal(plan(scope, record), null);
  });

  it('case 2: an entity under its id that shares its source gains the membership alone', () => {
    const record = row('world-ash', 'Item.ash');
    const scope = payload({
      entities: [entity('world-ash', 'Item.ash')],
      membership: [['world-ash', OTHER_SYSTEM]],
    });
    assert.deepEqual(plan(scope, record), {
      membership: { entityId: 'world-ash', systemId: SYSTEM, inherit: {} },
    });
  });

  it('case 3: an id match with no shared source binds nothing', () => {
    const record = row('world-ash', 'Item.ash');
    const scope = payload({ entities: [entity('world-ash', 'Item.unrelated')] });
    assert.equal(plan(scope, record), null);
    assert.equal(plan(scope, row('world-ash', null)), null, 'nor does an unlinked record');
  });

  it('cases 4 and 5: no entity under its id and none sharing its source creates the pair', () => {
    const record = row('comp-salt', 'Item.salt', { aliasItemUuids: ['Item.old-salt'] });
    const scope = payload({ entities: [entity('world-ash', 'Item.ash')] });
    for (const added of [true, false]) {
      assert.deepEqual(plan(scope, record, { added }), {
        entity: { id: 'comp-salt', ...identityOf(record, 'components') },
        membership: { entityId: 'comp-salt', systemId: SYSTEM, inherit: {} },
      });
    }
  });

  it('cases 4 and 5: an entity under another id sharing its source leaves it unregistered', () => {
    const record = row('comp-salt', 'Item.salt');
    const scope = payload({ entities: [entity('world-salt', 'Item.salt')] });
    for (const added of [true, false]) assert.equal(plan(scope, record, { added }), null);
  });

  it('a created entity carries exactly the lifted identity, so it reports no drift', () => {
    const record = row('comp-salt', 'Item.salt', { salvage: { enabled: true } });
    const planned = plan(payload(), record);
    assert.deepEqual(Object.keys(planned.entity).sort(byCodePoint), [
      'aliasItemUuids',
      'description',
      'id',
      'img',
      'name',
      'originItemUuid',
      'registeredItemUuid',
    ]);
    assert.notEqual(planned.entity.aliasItemUuids, record.aliasItemUuids, 'the alias list is a copy');
  });
});

describe('sharing a source is spelling-tolerant for a pack Item', () => {
  const FOUR_PART = 'Compendium.world.scrolls.Item.fire';
  const TYPE_LESS = 'Compendium.world.scrolls.fire';

  it('matches the type-less spelling against the document uuid, in both directions', () => {
    for (const [held, imported] of [
      [TYPE_LESS, FOUR_PART],
      [FOUR_PART, TYPE_LESS],
    ]) {
      const scope = payload({ entities: [entity('world-fire', held)] });
      assert.equal(plan(scope, row('comp-fire', imported)), null, 'no second entity is created');
      assert.deepEqual(plan(scope, row('world-fire', imported)), {
        membership: { entityId: 'world-fire', systemId: SYSTEM, inherit: {} },
      });
    }
  });

  it('folds only a pack Item uuid, never another pack, id, document type or embedded Item', () => {
    const scope = payload({ entities: [entity('world-fire', TYPE_LESS)] });
    for (const uuid of [
      'Compendium.world.potions.Item.fire',
      'Compendium.world.scrolls.Item.frost',
      'Compendium.world.scrolls.JournalEntry.fire',
      'Compendium.world.scrolls.Actor.fire.Item.fire',
      'Item.fire',
    ]) {
      assert.ok(plan(scope, row('comp-other', uuid))?.entity, `${uuid} is its own component`);
    }
  });
});

describe('the membership record', () => {
  const WORLD_DEFAULT = { id: 'world-ash', category: 'Reagent', essences: { fire: 2 } };
  const scopeWithDefault = (worldDefault = WORLD_DEFAULT) =>
    payload({
      entities: [entity('world-ash', 'Item.ash')],
      defaults: { 'world-ash': worldDefault },
    });

  it('is deep-equal to what addToSystem persists for a component', async () => {
    const record = row('world-ash', 'Item.ash');
    const seeded = () => payload({ entities: [entity('world-ash', 'Item.ash')] });

    const viaCatalogue = makeScopeSettings(seeded());
    const catalogueStore = makeScopeStore('components', viaCatalogue.value, viaCatalogue);
    const actions = createWorldScopeEntityActions({
      entityType: 'component',
      getStore: () => catalogueStore,
    });
    assert.equal(await actions.addToSystem('world-ash', SYSTEM), true);

    const viaImport = makeScopeSettings(seeded());
    await flushWorldComponentRegistrations({
      store: makeScopeStore('components', viaImport.value, viaImport),
      registrations: [{ systemId: SYSTEM, componentId: 'world-ash', added: true }],
      rowsOf: () => [record],
    });

    assert.deepEqual(viaImport.value.membership, viaCatalogue.value.membership);
    assert.deepEqual(viaImport.value.membership[`world-ash|${SYSTEM}`], {
      entityId: 'world-ash',
      systemId: SYSTEM,
      inherit: {},
    });
  });

  it('keeps what a component the system already held resolves, section by section', () => {
    const record = row('world-ash', 'Item.ash', { category: 'Herbs', essences: { water: 1 } });
    assert.deepEqual(plan(scopeWithDefault(), record, { added: false }).membership, {
      entityId: 'world-ash',
      systemId: SYSTEM,
      inherit: { category: false, essences: false },
      category: 'Herbs',
      essences: { water: 1 },
    });
  });

  it('overrides an authored world map with the empty map a held component carries', () => {
    const record = row('world-ash', 'Item.ash', { category: 'Reagent', essences: {} });
    assert.deepEqual(plan(scopeWithDefault(), record, { added: false }).membership, {
      entityId: 'world-ash',
      systemId: SYSTEM,
      inherit: { essences: false },
      essences: {},
    });
  });

  it('inherits a section the world default does not author, or authors equal', () => {
    const equal = row('world-ash', 'Item.ash', { category: 'Reagent', essences: { fire: 2 } });
    assert.deepEqual(plan(scopeWithDefault(), equal, { added: false }).membership.inherit, {});

    const differing = row('world-ash', 'Item.ash', { category: 'Herbs', essences: { water: 1 } });
    assert.deepEqual(
      plan(scopeWithDefault({ id: 'world-ash' }), differing, { added: false }).membership,
      { entityId: 'world-ash', systemId: SYSTEM, inherit: {} }
    );
  });

  it('lets a row the run added inherit the world defaults', () => {
    const record = row('world-ash', 'Item.ash', { essences: { water: 1 } });
    assert.deepEqual(plan(scopeWithDefault(), record, { added: true }).membership, {
      entityId: 'world-ash',
      systemId: SYSTEM,
      inherit: {},
    });
  });

  it('writes a category the run staged on its own row as an override', () => {
    const staged = row('world-ash', 'Item.ash', { category: 'Herbs', essences: { water: 1 } });
    assert.deepEqual(plan(scopeWithDefault(), staged, { added: true }).membership, {
      entityId: 'world-ash',
      systemId: SYSTEM,
      inherit: { category: false },
      category: 'Herbs',
    });

    const same = row('world-ash', 'Item.ash', { category: 'Reagent' });
    assert.deepEqual(plan(scopeWithDefault(), same, { added: true }).membership.inherit, {});
  });
});

describe('adoption, decided before the id is minted', () => {
  const snapshot = { registeredItemUuid: 'Item.ash', originItemUuid: 'Item.ash' };
  const adopt = (options) =>
    adoptedWorldComponentId({
      entities: [],
      registrations: [],
      rowsOf: () => [],
      systemId: SYSTEM,
      record: snapshot,
      ...options,
    });

  it('takes the first entity in roster order that shares a source', () => {
    const entities = [
      entity('world-other', 'Item.other'),
      entity('world-ash', 'Item.ash'),
      entity('world-ash-twin', 'Item.ash'),
    ];
    assert.equal(adopt({ entities }), 'world-ash');
  });

  it('answers nothing when no entity shares a source, or the record is unlinked', () => {
    assert.equal(adopt({ entities: [entity('world-other', 'Item.other')] }), null);
    assert.equal(adopt({ entities: [entity('world-ash', 'Item.ash')], record: {} }), null);
  });

  it('answers nothing when the system already holds a row under the entity id', () => {
    const entities = [entity('world-ash', 'Item.ash')];
    const rowsOf = () => [row('world-ash', 'Item.unrelated')];
    assert.equal(adopt({ entities, rowsOf }), null);
  });

  it('counts a registration already made in the run as an entity', () => {
    const pending = row('comp-ash', 'Item.ash');
    const rows = { [OTHER_SYSTEM]: [pending], [SYSTEM]: [] };
    const registrations = [{ systemId: OTHER_SYSTEM, componentId: 'comp-ash', added: true }];
    const rowsOf = (systemId) => rows[systemId];
    assert.equal(adopt({ registrations, rowsOf }), 'comp-ash');

    assert.equal(
      adopt({
        registrations: [{ systemId: SYSTEM, componentId: 'comp-ash', added: true }],
        rowsOf: () => [pending],
      }),
      null,
      'a row of the same system is never adopted over itself'
    );
  });
});

describe('adoption never follows an id alone', () => {
  it('ignores a registered row whose id a foreign entity already holds', () => {
    const rows = { [OTHER_SYSTEM]: [row('comp-ash', 'Item.ash')], [SYSTEM]: [] };
    const adopted = adoptedWorldComponentId({
      entities: [entity('comp-ash', 'Item.unrelated')],
      registrations: [{ systemId: OTHER_SYSTEM, componentId: 'comp-ash', added: false }],
      rowsOf: (systemId) => rows[systemId],
      systemId: SYSTEM,
      record: { registeredItemUuid: 'Item.ash' },
    });
    assert.equal(adopted, null, 'that row becomes no entity at the flush, so nothing adopts it');
  });
});

describe('the flush', () => {
  function world(initial, rows) {
    const settings = makeScopeSettings(initial);
    const store = makeScopeStore('components', settings.value, settings);
    const flush = (registrations) =>
      flushWorldComponentRegistrations({
        store,
        registrations,
        rowsOf: (systemId) => rows[systemId] ?? [],
      });
    return { settings, store, flush, rows };
  }
  const added = (componentId, systemId = SYSTEM) => ({ systemId, componentId, added: true });

  it('writes every registration of the run in one setting write', async () => {
    const rows = { [SYSTEM]: [row('comp-ash', 'Item.ash'), row('comp-salt', 'Item.salt')] };
    const { settings, flush } = world(undefined, rows);

    const result = await flush([added('comp-ash'), added('comp-salt')]);

    assert.deepEqual(result, { registered: 2, error: null });
    assert.equal(settings.writes.length, 1);
    assert.deepEqual(
      settings.value.entities.map((entry) => entry.id),
      ['comp-ash', 'comp-salt']
    );
    assert.deepEqual(Object.keys(settings.value.membership), [
      `comp-ash|${SYSTEM}`,
      `comp-salt|${SYSTEM}`,
    ]);
    assert.deepEqual(
      reportWorldIdentityDrift([{ id: SYSTEM, components: rows[SYSTEM] }], {
        components: settings.value,
      }),
      [],
      'each entity is created equal to its in-system record'
    );
  });

  it('writes nothing for an empty run, a missing store, or a run that changes nothing', async () => {
    const rows = { [SYSTEM]: [row('world-ash', 'Item.ash')] };
    const initial = payload({
      entities: [entity('world-ash', 'Item.ash')],
      membership: [['world-ash', SYSTEM]],
    });
    const { settings, flush } = world(initial, rows);

    assert.deepEqual(await flush([]), { registered: 0, error: null });
    assert.deepEqual(await flush([added('world-ash')]), { registered: 0, error: null });
    assert.deepEqual(
      await flushWorldComponentRegistrations({
        store: null,
        registrations: [added('world-ash')],
        rowsOf: () => rows[SYSTEM],
      }),
      { registered: 0, error: null }
    );
    assert.equal(settings.writes.length, 0);
  });

  it('registers one Item recorded twice in a run once', async () => {
    const { settings, flush } = world(undefined, { [SYSTEM]: [row('comp-ash', 'Item.ash')] });

    const result = await flush([added('comp-ash'), { ...added('comp-ash'), added: false }]);

    assert.equal(result.registered, 1);
    assert.equal(settings.value.entities.length, 1);
    assert.equal(Object.keys(settings.value.membership).length, 1);
  });

  it('drops a registration whose row was deleted before the flush', async () => {
    const rows = { [SYSTEM]: [row('comp-ash', 'Item.ash')] };
    const { settings, flush } = world(undefined, rows);
    const registrations = [added('comp-ash')];
    rows[SYSTEM] = [];

    assert.deepEqual(await flush(registrations), { registered: 0, error: null });
    assert.equal(settings.writes.length, 0);
  });

  it('keeps a scope edit that lands between recording and the flush', async () => {
    const { settings, store, flush } = world(undefined, {
      [SYSTEM]: [row('comp-ash', 'Item.ash')],
    });
    const registrations = [added('comp-ash')];
    const actions = createWorldScopeEntityActions({ entityType: 'component', getStore: () => store });
    await actions.createEntity({ id: 'world-late', name: 'Authored meanwhile' });

    await flush(registrations);

    assert.deepEqual(
      settings.value.entities.map((entry) => entry.id),
      ['world-late', 'comp-ash']
    );
  });

  it('lets two overlapping runs each write its own registrations, losing neither', async () => {
    const { settings, flush } = world(undefined, {
      [SYSTEM]: [row('comp-ash', 'Item.ash')],
      [OTHER_SYSTEM]: [row('comp-salt', 'Item.salt')],
    });

    const [first, second] = await Promise.all([
      flush([added('comp-ash')]),
      flush([added('comp-salt', OTHER_SYSTEM)]),
    ]);

    assert.deepEqual([first.registered, second.registered], [1, 1]);
    assert.equal(settings.writes.length, 2);
    assert.deepEqual(Object.keys(settings.value.membership), [
      `comp-ash|${SYSTEM}`,
      `comp-salt|${OTHER_SYSTEM}`,
    ]);
  });

  it('catches a rejected write, reloads the store from the setting, and can be run again', async () => {
    const initial = payload({ entities: [entity('world-other', 'Item.other')] });
    const { settings, store, flush } = world(initial, { [SYSTEM]: [row('comp-ash', 'Item.ash')] });
    const refused = new Error('the server refused the write');
    settings.rejectNext(refused);

    const failed = await flush([added('comp-ash')]);

    assert.deepEqual(failed, { registered: 0, error: refused });
    assert.deepEqual(store.get(), initial, 'the published corpus is the persisted setting again');
    assert.equal(settings.writes.length, 0);

    assert.deepEqual(await flush([added('comp-ash')]), { registered: 1, error: null });
    assert.deepEqual(
      settings.value.entities.map((entry) => entry.id),
      ['world-other', 'comp-ash']
    );
  });
});
