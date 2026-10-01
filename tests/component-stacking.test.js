/**
 * Issue 858 — created components stack onto a matching inventory item instead of
 * spawning duplicate stacks.
 *
 * Two layers:
 *  1. The pure create-vs-update seam {@link createOrStackComponentItem}: with a
 *     stubbed actor/item, it CREATES when nothing matches and UPDATES the existing
 *     item's quantity (never creating) when a match is supplied.
 *  2. The salvage engine end-to-end: recovering a component the actor ALREADY holds
 *     (resolved by durable component identity) increments that item's quantity and
 *     creates NO new item; recovering one with no match creates a single new item.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { SalvageRunManager } from '../src/systems/SalvageRunManager.js';
import {
  awardedQuantityOf,
  createOrStackComponentItem,
  tagAwardedQuantity,
} from '../src/systems/componentStacking.js';

// ---------------------------------------------------------------------------
// Foundry-ish globals (dotted get/set only; no cascade needed here)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

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
      if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    },
    async delete() {
      this.deleteCalled = true;
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
    },
    flags: {},
    createdItems: created,
    async createEmbeddedDocuments(_type, dataArr) {
      return dataArr.map((d, i) => {
        const it = makeItem(`created-${id}-${i}`, d.name || 'Created', d.system?.quantity || 1);
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

// ---------------------------------------------------------------------------
// 1. Pure create-vs-update seam
// ---------------------------------------------------------------------------

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

test('createOrStackComponentItem returns null when it can neither stack nor create', async () => {
  const result = await createOrStackComponentItem({
    actor: {},
    itemData: { name: 'x' },
    matchingItems: [],
    awardedQuantity: 1,
  });
  assert.equal(result, null);
});

test('awardedQuantityOf prefers the award tag and falls back to the item quantity', () => {
  const tagged = makeItem('t', 'Tagged', 9);
  tagAwardedQuantity(tagged, 2);
  assert.equal(awardedQuantityOf(tagged), 2, 'the award contribution, not the stack total');

  const untagged = makeItem('u', 'Untagged', 7);
  assert.equal(awardedQuantityOf(untagged), 7, 'falls back to the item quantity');
});

// ---------------------------------------------------------------------------
// 1b. tagAwardedQuantity — the award-scope seam (issue 2145)
// ---------------------------------------------------------------------------

test('tagAwardedQuantity sums successive calls that share the SAME scope object', () => {
  const item = makeItem('i1', 'Widget', 1);
  const scope = {};
  tagAwardedQuantity(item, 2, scope);
  tagAwardedQuantity(item, 3, scope);
  assert.equal(awardedQuantityOf(item), 5, 'two result rows in one award sum (issue 858)');
});

test('tagAwardedQuantity resets — never sums — across a DIFFERENT scope object', () => {
  const item = makeItem('i1', 'Widget', 1);
  const firstAward = {};
  const secondAward = {};
  tagAwardedQuantity(item, 2, firstAward);
  tagAwardedQuantity(item, 1, secondAward);
  assert.equal(
    awardedQuantityOf(item),
    1,
    'a later, separate award overwrites rather than accumulating onto the earlier one'
  );
});

test('tagAwardedQuantity called with no scope twice never accumulates', () => {
  const item = makeItem('i1', 'Widget', 1);
  tagAwardedQuantity(item, 1, null);
  tagAwardedQuantity(item, 1, null);
  assert.equal(awardedQuantityOf(item), 1, 'two unscoped calls each report 1, never a running total of 2');
});

test('the award tag stays non-enumerable', () => {
  const item = makeItem('i1', 'Widget', 1);
  tagAwardedQuantity(item, 1, {});
  assert.ok(
    !Object.keys(item).includes('_fabricateAwardedQuantity'),
    'the tag does not show up in Object.keys'
  );
  assert.equal(
    Object.prototype.propertyIsEnumerable.call(item, '_fabricateAwardedQuantity'),
    false,
    'the tag is not enumerable'
  );
});

// ---------------------------------------------------------------------------
// 2. Salvage engine end-to-end
// ---------------------------------------------------------------------------

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

test('salvage() reports the SAME component listed in two result rows once, with the summed award (issue 858 review)', async () => {
  // Two result rows of the same component: the second stacks onto the item the first
  // created (or the pre-existing stack), returning the same object. The award tag must
  // ACCUMULATE and the merged item must be reported ONCE — not twice, each showing the
  // last award (which would over-report the total).
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
  assert.equal(records.length, 1, 'the merged component is recorded ONCE, not per result row');
  assert.equal(records[0].quantity, 4, 'the single record sums both awards (2 + 2), not the stack total');
  assert.equal(
    result.results.filter((item) => item === existing).length,
    1,
    'the merged stack appears once in the results, not duplicated'
  );
});

// ---------------------------------------------------------------------------
// 3. Award scope across SEPARATE awards (issue 2145)
// ---------------------------------------------------------------------------

test('two separate engine.salvage() calls onto one persistent held item each report their own amount, not the running total', async () => {
  const existing = makeItem('have-scrap', 'Scrap Metal', 5, {
    roles: { 'sys-1': { componentId: 'recovered' } },
  });
  // Enough "Broken Widget" stock to survive two separate salvages (ingredientQuantity 1
  // each) without the source item being consumed to zero and deleted between calls.
  const { engine, actor, system, source } = makeSalvageWorld({
    existingRecovered: existing,
    recoverQuantity: 1,
  });
  actor.items.contents.find((i) => i.id === 'broken').system.quantity = 2;

  const first = await engine.salvage(actor.uuid, system.id, source.id);
  assert.equal(first.success, true);
  assert.equal(existing.system.quantity, 6, '5 held + 1 recovered on the first salvage');

  const second = await engine.salvage(actor.uuid, system.id, source.id);
  assert.equal(second.success, true);

  const recorded = second.salvageRun.createdResults.find((r) => r.componentId === 'recovered');
  assert.ok(recorded, 'the recovered component is recorded on the second run');
  assert.equal(
    recorded.quantity,
    1,
    "the second salvage's run record reports its own 1, not the running total of 2"
  );
  assert.equal(
    awardedQuantityOf(existing),
    1,
    "awardedQuantityOf reflects the second award alone, not the stack's running total"
  );
  assert.equal(existing.system.quantity, 7, '6 held + 1 more recovered — the stack still grew correctly');

  // The second salvage's chat card must not show the running total either.
  system.features.chatOutput = true;
  const chatCreated = [];
  globalThis.ChatMessage = {
    create(data) {
      chatCreated.push(data);
      return Promise.resolve({ id: `msg-${chatCreated.length}` });
    },
    getSpeaker: () => ({ alias: actor.name }),
  };
  await engine._postSalvageChatMessage({
    success: true,
    actor,
    system,
    component: source,
    consumedQuantity: 1,
    results: second.results,
  });
  assert.equal(chatCreated.length, 1, 'exactly one chat card posted');
  assert.ok(
    !chatCreated[0].content.includes('2×'),
    'the second salvage card does not show the running total of 2'
  );
});

test('a second salvage of two rows of the same component reports 4 again, not 8 (issue 858 + 2145)', async () => {
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
  const existing = makeItem('have-scrap', 'Scrap Metal', 5, {
    roles: { 'sys-1': { componentId: 'recovered' } },
  });
  // Two units of "Broken Widget" stock so a second, separate salvage can run.
  const actor = makeActor('actor-1', [makeItem('broken', 'Broken Widget', 2), existing]);
  const engine = makeEngine(setupSalvageGame(system, actor));
  engine._runSalvageCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const first = await engine.salvage(actor.uuid, system.id, source.id);
  assert.equal(first.success, true);
  const firstRecords = first.salvageRun.createdResults.filter((r) => r.componentId === 'recovered');
  assert.equal(firstRecords[0].quantity, 4, 'first salvage sums its own two rows to 4');
  assert.equal(existing.system.quantity, 9, '5 held + 2 + 2 recovered on the first salvage');

  const second = await engine.salvage(actor.uuid, system.id, source.id);
  assert.equal(second.success, true);
  const secondRecords = second.salvageRun.createdResults.filter((r) => r.componentId === 'recovered');
  assert.equal(secondRecords.length, 1, 'still one record, not per result row');
  assert.equal(
    secondRecords[0].quantity,
    4,
    'the second, separate salvage reports its own 4 again, never 8 (the running total)'
  );
  assert.equal(existing.system.quantity, 13, '9 held + 2 + 2 recovered on the second salvage');
});

// ---------------------------------------------------------------------------
// 4. Award scope across SEPARATE crafts, through _createResultItems (issue 2145)
// ---------------------------------------------------------------------------

test('two separate crafts through _createResultItems each report their own award, not the running total', async () => {
  const systemId = 'sys-craft-1';
  const component = { id: 'widget', name: 'Widget' };
  const system = {
    id: systemId,
    components: [component],
    features: {},
  };
  const existing = makeItem('have-widget', 'Widget', 5, {
    roles: { [systemId]: { componentId: 'widget' } },
  });
  const actor = makeActor('actor-1', [existing]);
  globalThis.fromUuid = async () => null;
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
    },
    i18n: { localize: (key) => key, format: (key) => key },
    user: { id: 'user-1' },
    time: { worldTime: 100 },
  };
  const engine = makeEngine(null);
  const recipe = { craftingSystemId: systemId, name: 'Make Widget', transferEffects: false };
  const step = {
    resultGroups: [
      { id: 'rg-1', results: [{ id: 'r-1', componentId: 'widget', quantity: 1 }] },
    ],
  };

  const first = await engine._createResultItems(actor, recipe, step, null, [], []);
  assert.equal(first.items.length, 1);
  assert.equal(awardedQuantityOf(first.items[0]), 1, 'the first craft reports the 1 it produced');
  assert.equal(existing.system.quantity, 6, '5 held + 1 crafted');

  const second = await engine._createResultItems(actor, recipe, step, null, [], []);
  assert.equal(second.items.length, 1);
  assert.equal(
    awardedQuantityOf(second.items[0]),
    1,
    "the second, separate craft reports its own 1, not the running total of 2"
  );
  assert.equal(existing.system.quantity, 7, '6 held + 1 more crafted — the stack still grew correctly');

  const chatCreated = [];
  globalThis.ChatMessage = {
    create(data) {
      chatCreated.push(data);
      return Promise.resolve({ id: `msg-${chatCreated.length}` });
    },
    getSpeaker: () => ({ alias: actor.name }),
  };
  system.features.chatOutput = true;
  await engine._postCraftChatMessage({
    success: true,
    craftingActor: actor,
    recipe,
    consumedIngredients: [],
    tools: [],
    createdResults: second.items,
  });
  assert.equal(chatCreated.length, 1, 'exactly one chat card posted');
  assert.ok(
    !chatCreated[0].content.includes('2×'),
    'the second craft card does not show the running total of 2'
  );
});

test('two result rows of the SAME component in one _createResultItems call sum, and a second call reports that sum again, not double', async () => {
  // Craft-path counterpart of the salvage issue-858 test. Catches dropping `awardScope`
  // from the `_createSingleResult` call inside `_createResultItems`: without it, two
  // rows of the same component in ONE call would each tag 2 instead of summing to 4.
  const systemId = 'sys-craft-2';
  const component = { id: 'widget', name: 'Widget' };
  const system = {
    id: systemId,
    components: [component],
    features: {},
  };
  const existing = makeItem('have-widget', 'Widget', 5, {
    roles: { [systemId]: { componentId: 'widget' } },
  });
  const actor = makeActor('actor-1', [existing]);
  globalThis.fromUuid = async () => null;
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
    },
    i18n: { localize: (key) => key, format: (key) => key },
    user: { id: 'user-1' },
    time: { worldTime: 100 },
  };
  const engine = makeEngine(null);
  const recipe = { craftingSystemId: systemId, name: 'Make Widget', transferEffects: false };
  const step = {
    resultGroups: [
      {
        id: 'rg-1',
        results: [
          { id: 'r-1', componentId: 'widget', quantity: 2 },
          { id: 'r-2', componentId: 'widget', quantity: 2 },
        ],
      },
    ],
  };

  const first = await engine._createResultItems(actor, recipe, step, null, [], []);
  assert.equal(first.items.length, 1, 'both rows stack onto the held item, no duplicate');
  assert.equal(awardedQuantityOf(first.items[0]), 4, 'the two rows of one craft sum to 4 (2 + 2)');
  assert.equal(existing.system.quantity, 9, '5 held + 2 + 2 crafted');

  const second = await engine._createResultItems(actor, recipe, step, null, [], []);
  assert.equal(second.items.length, 1);
  assert.equal(
    awardedQuantityOf(second.items[0]),
    4,
    'a second, separate craft with the same two rows reports its own 4 again, never 8'
  );
  assert.equal(existing.system.quantity, 13, '9 held + 2 + 2 crafted on the second call');
});
