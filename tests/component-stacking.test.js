/**
 * Issue 858 — created components stack onto a matching inventory item instead of spawning duplicate
 * stacks.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import { createItemReceiptCollector } from '../src/systems/runHistoryEvidence.js';
import {
  awardedQuantityOf,
  createOrStackComponentItem,
} from '../src/systems/componentStacking.js';

// Foundry-ish globals (dotted get/set only; no cascade needed here)

function getProperty(obj, path) {
  if (!obj || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((v, k) => (v == null ? undefined : v[k]), obj);
}

function setProperty(obj, path, value) {
  if (!obj || !path) return;
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty,
    setProperty,
    deepClone: (v) => JSON.parse(JSON.stringify(v)),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.fromUuid = async () => null;

test('award receipts require matching acknowledgments and capture each stored delta independently', async () => {
  const actor = { uuid: 'Actor.receipts' };
  const item = { uuid: `${actor.uuid}.Item.stack`, parent: actor, name: 'Output',
    system: { quantity: 999 }, _source: { system: { quantity: 10 } },
    async update(payload) { this._source.system.quantity = payload['system.quantity']; return this; },
  };
  const collector = createItemReceiptCollector();
  for (const awardedQuantity of [2, 3]) {
    assert.equal(await createOrStackComponentItem({ actor, itemData: {}, matchingItems: [item], awardedQuantity,
      receiptCollector: collector, receiptIdentity: { resultRowId: `row-${awardedQuantity}` } }), item);
  }
  assert.deepEqual(collector.snapshot().map((receipt) => receipt.quantity), [2, 3]);
  assert.equal(item._source.system.quantity, 15);
  item.update = async () => undefined;
  await assert.rejects(createOrStackComponentItem({ actor, itemData: {}, matchingItems: [item], awardedQuantity: 2, receiptCollector: collector }), { code: 'HISTORY_EFFECT_UNCERTAIN' });
  assert.deepEqual(collector.snapshot().map((receipt) => receipt.quantity), [2, 3]);
});

test('native salvage retains a confirmed consumption prefix and refuses the same run after reload', async () => {
  const items = [makeItem('first', 'Input', 1), makeItem('refused', 'Input', 1)];
  const actor = makeActor('prefix', items);
  for (const item of items) { item.parent = actor; item.uuid = `${actor.uuid}.Item.${item.id}`; item._source = structuredClone(item.toObject()); }
  let deletes = 0;
  items[0].delete = async function() { deletes++; this.name = 'Changed after deletion'; return this; };
  items[1].delete = async () => { deletes++; return undefined; };
  const source = { id: 'input', name: 'Input', salvage: { enabled: true, ingredientQuantity: 2, toolIds: [], resultGroups: [] } };
  const system = { id: 'prefix-system', features: { salvage: true }, components: [source], salvageResolutionMode: 'simple', salvageCraftingCheck: {} };
  const manager = setupSalvageGame(system, actor);
  const engine = makeEngine(manager);
  await assert.rejects(engine.salvage(actor.uuid, system.id, source.id), { code: 'HISTORY_EFFECT_UNCERTAIN' });
  const reloaded = new SalvageRunManager().getActiveRuns(actor)[0];
  assert.equal(reloaded.historySettlement.consumption, 'uncertain');
  assert.deepEqual(reloaded.consumedComponents.map(({ name, quantity }) => ({ name, quantity })), [{ name: 'Input', quantity: 1 }]);
  await assert.rejects(engine.salvage(actor.uuid, system.id, source.id, { runId: reloaded.id }), { code: 'HISTORY_EFFECT_UNCERTAIN' });
  assert.equal(deletes, 2);
  assert.equal(actor.createdItems.length, 0);
});

// Builders

/**
 * @param {object} [opts]
 * @param {object} [opts.roles] durable `flags.fabricate.roles` map for identity resolution.
 */
function makeItem(id, name, quantity = 1, { roles = null } = {}) {
  const flags = roles ? { fabricate: { roles } } : {};
  return {
    id,
    uuid: `Item.${id}`,
    name,
    system: { quantity },
    flags,
    parent: null,
    effects: [],
    updateCalled: false,
    updatePayloads: [],
    deleteCalled: false,
    getFlag(ns, key) {
      return flags[ns]?.[key] ?? null;
    },
    toObject() {
      return { id: this.id, name: this.name, type: 'loot', system: { quantity: this.system.quantity } };
    },
    async update(payload) {
      this.updateCalled = true;
      this.updatePayloads.push({ ...payload });
      for (const [path, value] of Object.entries(payload)) {
        setProperty(this, path, value);
        if (this._source) setProperty(this._source, path, value);
      }
      return this;
    },
    async delete() {
      this.deleteCalled = true;
      return this;
    },
  };
}

function makeActor(id, items = []) {
  const flags = {};
  const created = [];
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    system: {},
    items: {
      contents: items,
      find: (fn) => items.find(fn),
      [Symbol.iterator]() {
        return items[Symbol.iterator]();
      },
    },
    getFlag(ns, key) {
      return flags[ns]?.[key] ?? null;
    },
    async setFlag(ns, key, value) {
      if (!flags[ns]) flags[ns] = {};
      flags[ns][key] = value;
      return this;
    },
    flags: {},
    createdItems: created,
    async createEmbeddedDocuments(_type, dataArr) {
      return dataArr.map((d, i) => {
        const it = makeItem(`created-${id}-${i}`, d.name || 'Created', d.system?.quantity || 1);
        it.parent = this;
        it.uuid = `${this.uuid}.Item.${it.id}`;
        it._source = structuredClone(it.toObject());
        created.push(it);
        return it;
      });
    },
  };
}

function makeEngine(salvageRunManager) {
  const mockRecipeManager = {
    canCraft: () => ({ canCraft: true, satisfiableSet: null, missing: {} }),
    getToolsForSet: () => [],
    toolMatchesItem: (_r, tool, item) => item.id === (tool.componentId || tool.systemItemId),
    ingredientMatchesItem: () => false,
  };
  return new CraftingEngine(mockRecipeManager, null, null, null, salvageRunManager);
}

function setupSalvageGame(system, actor) {
  const salvageRunManager = new SalvageRunManager();
  globalThis.fromUuid = async (uuid) => (actor && uuid === actor.uuid ? actor : null);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
      getSalvageRunManager: () => salvageRunManager,
    },
    user: { id: 'user-1' },
    time: { worldTime: 100 },
  };
  return salvageRunManager;
}

// 1. Pure create-vs-update seam

test('createOrStackComponentItem creates a new item when no match is supplied', async () => {
  const actor = makeActor('a1');
  const created = await createOrStackComponentItem({
    actor,
    itemData: { name: 'Scrap Metal', system: { quantity: 3 } },
    matchingItems: [],
    awardedQuantity: 3,
  });

  assert.equal(actor.createdItems.length, 1, 'exactly one item is created');
  assert.equal(created, actor.createdItems[0]);
  assert.equal(created.system.quantity, 3);
});

test('createOrStackComponentItem increments a matching item and creates nothing', async () => {
  const actor = makeActor('a1');
  const existing = makeItem('scrap', 'Scrap Metal', 5);

  const returned = await createOrStackComponentItem({
    actor,
    itemData: { name: 'Scrap Metal', system: { quantity: 3 } },
    matchingItems: [existing],
    awardedQuantity: 3,
  });

  assert.equal(actor.createdItems.length, 0, 'no new item is created');
  assert.equal(returned, existing, 'the existing item is returned');
  assert.equal(existing.updateCalled, true);
  assert.deepEqual(existing.updatePayloads.at(-1), { 'system.quantity': 8 }, '5 + 3');
  assert.equal(existing.system.quantity, 8);
});

test('createOrStackComponentItem honours an injected quantity path (issue #853 seam)', async () => {
  const actor = makeActor('a1');
  const existing = makeItem('scrap', 'Scrap Metal', 1);
  existing.system = { details: { count: 4 } };

  await createOrStackComponentItem({
    actor,
    itemData: {},
    matchingItems: [existing],
    awardedQuantity: 2,
    quantityPath: 'system.details.count',
  });

  assert.deepEqual(existing.updatePayloads.at(-1), { 'system.details.count': 6 });
});

test('createOrStackComponentItem refuses when it can neither stack nor create', async () => {
  await assert.rejects(createOrStackComponentItem({
    actor: {},
    itemData: { name: 'x' },
    matchingItems: [],
    awardedQuantity: 1,
  }), { code: 'HISTORY_EFFECT_UNCERTAIN' });
});

test('awardedQuantityOf prefers the award tag and falls back to the item quantity', () => {
  const tagged = makeItem('t', 'Tagged', 9);
  tagged._fabricateAwardedQuantity = 2;
  assert.equal(awardedQuantityOf(tagged), 2, 'the award contribution, not the stack total');

  const untagged = makeItem('u', 'Untagged', 7);
  assert.equal(awardedQuantityOf(untagged), 7, 'falls back to the item quantity');
});

// 2. Salvage engine end-to-end

function makeSalvageWorld({ existingRecovered = null, recoverQuantity = 2 } = {}) {
  const systemId = 'sys-1';
  const recovered = {
    id: 'recovered',
    name: 'Scrap Metal',
    // A registered uuid routes `_findComponentItems` through durable-identity matching
    // (not name), even though this test resolves the match via the roles flag below.
    registeredItemUuid: 'Item.recovered-src',
  };
  const source = {
    id: 'source',
    name: 'Broken Widget',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      toolIds: [],
      resultGroups: [
        {
          id: 'rg-1',
          name: 'Scraps',
          results: [{ id: 'r-1', componentId: 'recovered', quantity: recoverQuantity }],
        },
      ],
    },
  };
  const system = {
    id: systemId,
    features: { salvage: true },
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: { enabled: false, outcomes: [], progressive: null },
    components: [source, recovered],
    tools: [],
    craftingCheck: {},
  };

  const sourceItem = makeItem('broken', 'Broken Widget', 1);
  const items = existingRecovered ? [sourceItem, existingRecovered] : [sourceItem];
  const actor = makeActor('actor-1', items);
  const salvageRunManager = setupSalvageGame(system, actor);
  const engine = makeEngine(salvageRunManager);
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });
  return { engine, actor, system, source };
}

test('salvage() stacks a recovered component onto a matching inventory item (issue 858)', async () => {
  const existing = makeItem('have-scrap', 'Scrap Metal', 5, {
    roles: { 'sys-1': { componentId: 'recovered' } },
  });
  const { engine, actor, system, source } = makeSalvageWorld({
    existingRecovered: existing,
    recoverQuantity: 2,
  });

  const result = await engine.salvage(actor.uuid, system.id, source.id);

  assert.equal(result.success, true);
  assert.equal(actor.createdItems.length, 0, 'no duplicate stack is created');
  assert.equal(existing.updateCalled, true, 'the existing stack is updated');
  assert.equal(existing.system.quantity, 7, '5 held + 2 recovered');
  assert.ok(result.results.includes(existing), 'the merged stack is returned as the result');
});

test('salvage() creates a single new item when no matching stack exists', async () => {
  const { engine, actor, system, source } = makeSalvageWorld({
    existingRecovered: null,
    recoverQuantity: 2,
  });

  const result = await engine.salvage(actor.uuid, system.id, source.id);

  assert.equal(result.success, true);
  assert.equal(actor.createdItems.length, 1, 'exactly one new item is created');
  assert.equal(actor.createdItems[0].system.quantity, 2);
});

test('salvage() run record reports the amount recovered, not the merged stack total', async () => {
  const existing = makeItem('have-scrap', 'Scrap Metal', 5, {
    roles: { 'sys-1': { componentId: 'recovered' } },
  });
  const { engine, actor, system, source } = makeSalvageWorld({
    existingRecovered: existing,
    recoverQuantity: 2,
  });

  const result = await engine.salvage(actor.uuid, system.id, source.id);

  const recorded = result.salvageRun.createdResults.find((r) => r.componentId === 'recovered');
  assert.ok(recorded, 'the recovered component is recorded');
  assert.equal(recorded.quantity, 2, 'records the 2 recovered, not the stack total of 7');
});

test('salvage() retains independent receipt rows while returning one shared Item document', async () => {
  const existing = makeItem('have-scrap', 'Scrap Metal', 5, {
    roles: { 'sys-1': { componentId: 'recovered' } },
  });
  const systemId = 'sys-1';
  const recovered = { id: 'recovered', name: 'Scrap Metal', registeredItemUuid: 'Item.recovered-src' };
  const source = {
    id: 'source',
    name: 'Broken Widget',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      toolIds: [],
      resultGroups: [
        {
          id: 'rg-1',
          name: 'Scraps',
          results: [
            { id: 'r-1', componentId: 'recovered', quantity: 2 },
            { id: 'r-2', componentId: 'recovered', quantity: 2 },
          ],
        },
      ],
    },
  };
  const system = {
    id: systemId,
    features: { salvage: true },
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: { enabled: false, outcomes: [], progressive: null },
    components: [source, recovered],
    tools: [],
    craftingCheck: {},
  };
  const actor = makeActor('actor-1', [makeItem('broken', 'Broken Widget', 1), existing]);
  const engine = makeEngine(setupSalvageGame(system, actor));
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const result = await engine.salvage(actor.uuid, system.id, source.id);

  assert.equal(result.success, true);
  assert.equal(actor.createdItems.length, 0, 'both rows stack onto the held item, no duplicate');
  assert.equal(existing.system.quantity, 9, '5 held + 2 + 2 recovered');
  const records = result.salvageRun.createdResults.filter((r) => r.componentId === 'recovered');
  assert.deepEqual(records.map((record) => record.quantity), [2, 2]);
  assert.equal(new Set(records.map((record) => record.resultRowId)).size, 2);
  assert.equal(
    result.results.filter((item) => item === existing).length,
    1,
    'the merged stack appears once in the results, not duplicated'
  );
});
