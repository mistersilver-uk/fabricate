/**
 * Consumption is confirmed from the consumed Item's persisted state, never from the identity of
 * the object a write returned: a Definite Effect Refusal (nothing written) records nothing
 * uncertain and stays retryable, and every other unconfirmed write stays uncertain. The fakes
 * model Foundry: an embedded collection answering `get`, writes landing on `_source`, a veto or
 * no-op diff resolving `undefined`, and a delete removing the document from its collection.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import {
  confirmItemConsumption,
  isDefiniteEffectRefusal,
} from '../src/systems/runHistoryEvidence.js';

import { nativeCraftRunManager } from './helpers/native-run-manager.js';

Object.assign(globalThis, {
  foundry: { utils: { deepClone: (value) => structuredClone(value) } },
  ui: { notifications: { info() {}, warn() {}, error() {} } },
});

const REFUSED = 'HISTORY_EFFECT_REFUSED';
const UNCERTAIN = 'HISTORY_EFFECT_UNCERTAIN';

/** An actor whose `items` is a live embedded collection: iterable, and answering `get`. */
function liveActor(id = 'a1') {
  const docs = [];
  const items = Object.assign(docs, { get: (itemId) => docs.find((doc) => doc.id === itemId) });
  return { id, uuid: `Actor.${id}`, items };
}

/** One embedded Item whose writes persist to `_source` and are recorded on `calls`. */
function liveItem(actor, id, quantity) {
  const item = {
    id,
    uuid: `${actor.uuid}.Item.${id}`,
    name: `Item ${id}`,
    img: null,
    parent: actor,
    system: { quantity },
    _source: { system: { quantity } },
    calls: [],
    async update(payload) {
      this.calls.push(['update', payload]);
      this._source.system.quantity = payload['system.quantity'];
      this.system.quantity = payload['system.quantity'];
      return this;
    },
    async delete() {
      this.calls.push(['delete']);
      actor.items.splice(actor.items.indexOf(this), 1);
      return this;
    },
  };
  actor.items.push(item);
  return item;
}

/** Another instance of the same document, as a write may resolve with. */
const otherInstance = (item) => ({ ...item, _source: structuredClone(item._source) });

const quantityOf = (item) => item._source.system.quantity;

async function rejectsWith(promise, code) {
  let caught = null;
  await promise.catch((error) => {
    caught = error;
  });
  assert.ok(caught, `expected a ${code} rejection`);
  assert.equal(caught.code, code, caught.message);
  return caught;
}

test('a delete that returns another instance of the Item confirms the whole stack', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 2);
  item.delete = async function remove() {
    actor.items.splice(actor.items.indexOf(this), 1);
    return otherInstance(this);
  };
  assert.equal(await confirmItemConsumption(item, 2), 2);
});

test('an update that returns another instance confirms an exact decrement', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 5);
  const write = item.update;
  item.update = async function returnsCopy(payload) {
    await write.call(this, payload);
    return otherInstance(this);
  };
  assert.equal(await confirmItemConsumption(item, 2), 2);
  assert.equal(quantityOf(item), 3);
});

test('an update that resolves undefined still confirms when _source dropped exactly', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 5);
  const write = item.update;
  item.update = async function silent(payload) {
    await write.call(this, payload);
    return undefined;
  };
  assert.equal(await confirmItemConsumption(item, 1), 1);
});

test('an Item already gone before dispatch is refused definitely and nothing is dispatched', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 3);
  actor.items.length = 0;
  const error = await rejectsWith(confirmItemConsumption(item, 1), REFUSED);
  assert.match(error.message, /"Item ore": it is no longer on the actor/);
  assert.deepEqual(item.calls, [], 'no write was dispatched');
});

for (const [label, update] of [
  ['a module veto', async () => undefined],
  ['a no-op diff the schema discarded', async () => undefined],
  [
    'a rejected write',
    async () => {
      throw new Error('permission denied');
    },
  ],
]) {
  test(`${label} that left the Item unchanged is a Definite Effect Refusal`, async () => {
    const actor = liveActor();
    const item = liveItem(actor, 'ore', 3);
    item.update = update;
    const error = await rejectsWith(confirmItemConsumption(item, 1), REFUSED);
    assert.match(error.message, /^Could not consume "Item ore": the write left the item unchanged/);
    assert.match(error.message, /Nothing was changed\.$/);
    assert.equal(quantityOf(item), 3);
  });
}

test('a refusal carries the rejection as its cause and names the item', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 3);
  const rejection = new Error('permission denied');
  item.update = async () => {
    throw rejection;
  };
  const error = await rejectsWith(confirmItemConsumption(item, 1), REFUSED);
  assert.equal(error.cause, rejection);
  assert.match(error.message, /"Item ore"/);
});

test('a parent collection without get falls back to the returned object identity', async () => {
  const item = liveItem(liveActor(), 'ore', 3);
  item.parent = { uuid: 'Actor.flat', items: [item] };
  assert.equal(await confirmItemConsumption(item, 1), 1, 'the item acknowledged itself');
  item.update = async () => undefined;
  await rejectsWith(confirmItemConsumption(item, 1), UNCERTAIN);
});

test('a delete that throws with the Item already absent stays uncertain', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 1);
  item.delete = async function lost() {
    actor.items.splice(actor.items.indexOf(this), 1);
    throw new Error('connection lost');
  };
  await rejectsWith(confirmItemConsumption(item, 1), UNCERTAIN);
});

test('a delete that resolves undefined with the Item gone stays uncertain', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 1);
  item.delete = async function vanished() {
    actor.items.splice(actor.items.indexOf(this), 1);
    return undefined;
  };
  await rejectsWith(confirmItemConsumption(item, 1), UNCERTAIN);
});

test('a stale planning instance whose live quantity already equals the target is not confirmed', async () => {
  const actor = liveActor();
  const live = liveItem(actor, 'ore', 4);
  // The plan counted 5 on a detached copy, so its own target of 4 is already the live value.
  const stale = {
    ...live,
    _source: { system: { quantity: 5 } },
    calls: [],
    async update(payload) {
      this._source.system.quantity = payload['system.quantity'];
      return this;
    },
  };
  await rejectsWith(confirmItemConsumption(stale, 1), UNCERTAIN);
  assert.equal(quantityOf(live), 4, 'the live Item never moved');
});

test('a short update stays uncertain and retains what it did consume', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 5);
  item.update = async function short() {
    this._source.system.quantity = 4;
    return this;
  };
  const error = await rejectsWith(confirmItemConsumption(item, 3), UNCERTAIN);
  assert.deepEqual(
    error.receipts.map((receipt) => receipt.quantity),
    [1]
  );
});

test('a write that throws after the decrement landed stays uncertain', async () => {
  const actor = liveActor();
  const item = liveItem(actor, 'ore', 5);
  const write = item.update;
  item.update = async function landedThenThrew(payload) {
    await write.call(this, payload);
    throw new Error('socket closed after commit');
  };
  await rejectsWith(confirmItemConsumption(item, 1), UNCERTAIN);
});

test('a refusal after an earlier Item was consumed leaves the batch uncertain', async () => {
  const engine = new CraftingEngine({ getRecipe: () => null }, null);
  const actor = liveActor();
  const first = liveItem(actor, 'first', 2);
  const second = liveItem(actor, 'second', 2);
  second.update = async () => undefined;
  const error = await rejectsWith(
    engine._consumeIngredients([
      { item: first, quantity: 1 },
      { item: second, quantity: 1 },
    ]),
    UNCERTAIN
  );
  assert.equal(error.historyField, 'consumption');
  assert.deepEqual(
    error.receipts.map(({ itemUuid, quantity }) => ({ itemUuid, quantity })),
    [{ itemUuid: first.uuid, quantity: 1 }]
  );
});

test('a first-Item refusal stays definite and dispatches nothing later', async () => {
  const engine = new CraftingEngine({ getRecipe: () => null }, null);
  const actor = liveActor();
  const first = liveItem(actor, 'first', 2);
  const second = liveItem(actor, 'second', 2);
  first.update = async () => undefined;
  const error = await rejectsWith(
    engine._consumeIngredients([
      { item: first, quantity: 1 },
      { item: second, quantity: 1 },
    ]),
    REFUSED
  );
  assert.ok(isDefiniteEffectRefusal(error));
  assert.deepEqual(second.calls, [], 'the second Item was never written');
});

test('the predicate admits the stack-path guard and nothing uncertain', () => {
  assert.equal(isDefiniteEffectRefusal({ code: 'STACK_QUANTITY_PATH_REFUSED' }), true);
  assert.equal(isDefiniteEffectRefusal({ code: REFUSED }), true);
  assert.equal(isDefiniteEffectRefusal({ code: UNCERTAIN }), false);
  assert.equal(isDefiniteEffectRefusal(null), false);
});

// craft(): a Definite Effect Refusal on the legacy commit path leaves the stage retryable.

function installCraftWorld() {
  Object.assign(globalThis, {
    game: {
      fabricate: {
        getCraftingSystemManager: () => ({ getSystem: () => ({ id: 'sys-1', tools: [] }) }),
        getResolutionModeService: () => null,
      },
      user: { id: 'user-1', isGM: true },
      time: { worldTime: 0 },
    },
  });
}

/** One recipe over one live ingredient, an optional tool, and a scripted check. */
function craftFixture({ runManager, checkSucceeds = true, tool = false, stepCount = 1 }) {
  installCraftWorld();
  const source = liveActor('a1');
  const ingredient = liveItem(source, 'ing-1', 3);
  const toolItem = tool ? liveItem(source, 'tool-1', 1) : null;
  const fakeTool = tool ? { componentId: 'tool-1', breakage: { mode: 'limitedUses' } } : null;
  const option = {
    systemItemId: ingredient.id,
    quantity: 1,
    getDescription: () => ingredient.name,
  };
  const ingredientSet = {
    id: 'set-1',
    matchIngredients: (available) =>
      available.includes(ingredient) ? [{ item: ingredient, quantity: 1, ingredient: option }] : [],
  };
  const recipe = {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    toolIds: [],
    steps: [],
    getExecutionSteps: () =>
      Array.from({ length: stepCount }, (_unused, index) => ({
        id: `step-${index + 1}`,
        name: `Step ${index + 1}`,
        ingredientSets: [ingredientSet],
        resultGroups: [],
        toolIds: [],
        timeRequirement: null,
      })),
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name };
    },
  };
  const recipeManager = {
    canCraft: () => ({
      canCraft: true,
      satisfiableSet: ingredientSet,
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    getToolsForSet: () => (fakeTool ? [fakeTool] : []),
    toolMatchesItem: (_recipe, candidate, item) => candidate === fakeTool && item === toolItem,
    ingredientMatchesItem: (_recipe, _option, item) => item === ingredient,
  };
  const engine = new CraftingEngine(recipeManager, runManager, null);
  const check = { success: checkSucceeds, message: checkSucceeds ? 'ok' : 'Failed', data: {} };
  engine._runCraftingCheck = async () => ({ outcome: null, value: null, ...check });
  engine._createResultItems = async () => ({ items: [], rollTableMeta: null, resolutionMeta: {} });
  engine._postCraftChatMessage = async () => {};
  const craft = (options = {}) => engine.craft(source, [source], recipe, null, options);
  return { engine, source, ingredient, craft };
}

/** Veto the next update only, so the retry writes normally. */
function vetoOnce(item) {
  const write = item.update;
  item.update = async function vetoed(payload) {
    item.update = write;
    this.calls.push(['vetoed', payload]);
    return undefined;
  };
}

test('craft(): a refusal discards the run it created, and the same recipe crafts again', async () => {
  const runManager = nativeCraftRunManager();
  const { ingredient, craft } = craftFixture({ runManager });
  vetoOnce(ingredient);
  await rejectsWith(craft(), REFUSED);
  assert.equal(runManager.inspectDiscarded(), true, 'the phantom run was discarded');
  const stage = runManager.inspectRun().steps[0];
  assert.ok(!Object.hasOwn(stage, 'historySettlement'), 'the stage settlement was removed');
  assert.ok(!Object.hasOwn(stage, 'resolutionSnapshot'), 'and the snapshots it added');
  assert.equal(quantityOf(ingredient), 3);

  const retried = await craft();
  assert.equal(retried.success, true, retried.message);
  assert.equal(quantityOf(ingredient), 2);
});

test('craft(): a refusal on a reused run restores the stage, keeping the earlier step', async () => {
  let succeeded = null;
  const runManager = nativeCraftRunManager({
    stepCount: 2,
    stepIndex: 1,
    onSuccess: (payload) => {
      succeeded = payload;
    },
  });
  const run = runManager.inspectRun();
  const earlier = { consumption: 'complete', awards: 'complete' };
  Object.assign(run.steps[0], { status: 'succeeded', historySettlement: { ...earlier } });
  run.steps[1].historySettlement = { consumption: 'notApplicable', awards: 'notApplicable' };
  const { ingredient, craft } = craftFixture({ runManager, stepCount: 2 });
  vetoOnce(ingredient);
  await rejectsWith(craft({ runId: run.id }), REFUSED);
  assert.equal(runManager.inspectDiscarded(), false, 'a reused run is never discarded');
  assert.deepEqual(run.steps[0].historySettlement, earlier);
  assert.deepEqual(run.steps[1].historySettlement, {
    consumption: 'notApplicable',
    awards: 'notApplicable',
  });
  const persisted = runManager.inspectUpdates().at(-1).steps[1];
  assert.equal(persisted.historySettlement.consumption, 'notApplicable', 'the restore persisted');

  const retried = await craft({ runId: run.id });
  assert.equal(retried.success, true, retried.message);
  assert.ok(succeeded, 'the retried stage completed');
});

test('craft(): a refused consume-on-fail still breaks tools and settles complete-empty', async () => {
  let failure = null;
  const runManager = nativeCraftRunManager({
    onFailure: (payload) => {
      failure = payload;
    },
  });
  const { engine, ingredient, craft } = craftFixture({
    runManager,
    checkSucceeds: false,
    tool: true,
  });
  engine._getFailureConsumptionPolicy = () => ({
    consumeIngredientsOnFail: true,
    breakToolsOnFail: true,
  });
  const broken = [{ itemUuid: 'Actor.a1.Item.tool-1', broken: true }];
  let breakages = 0;
  engine._applyToolBreakage = async () => {
    breakages += 1;
    return broken;
  };
  let spends = 0;
  engine._spendCraftCurrency = async () => {
    spends += 1;
    return [];
  };
  let awarded = null;
  engine._produceCraftingFailureResults = async ({ consumedItems }) => {
    awarded = consumedItems;
    return [];
  };
  vetoOnce(ingredient);
  const errors = [];
  const original = console.error;
  console.error = (...args) => {
    errors.push(args);
  };
  try {
    const result = await craft();
    assert.equal(result.success, false);
  } finally {
    console.error = original;
  }
  assert.equal(breakages, 1, 'breakage still applied');
  assert.equal(spends, 1, 'the currency spend still ran');
  assert.deepEqual(awarded, [], 'the failure award saw nothing consumed');
  assert.deepEqual(failure.consumedIngredients, []);
  assert.deepEqual(failure.usedTools, broken);
  const stage = runManager.inspectRun().steps[0];
  assert.equal(stage.historySettlement.consumption, 'complete');
  assert.deepEqual(stage.consumedIngredients, []);
  assert.equal(quantityOf(ingredient), 3);
  assert.equal(errors.length, 1, 'the refusal was logged once');
});

test('craft(): a refusal after consumption settled never rewinds the stage', async () => {
  const runManager = nativeCraftRunManager();
  const { engine, ingredient, craft } = craftFixture({ runManager });
  engine._createResultItems = async () => {
    const refusal = new Error('The configured item stack-quantity path resolves an object');
    refusal.code = 'STACK_QUANTITY_PATH_REFUSED';
    throw refusal;
  };
  await rejectsWith(craft(), 'STACK_QUANTITY_PATH_REFUSED');
  const stage = runManager.inspectRun().steps[0];
  assert.equal(stage.historySettlement.consumption, 'complete', 'the real spend stays recorded');
  assert.equal(runManager.inspectDiscarded(), false);
  assert.equal(quantityOf(ingredient), 2);
});

test('craftAlchemy(): a refused fizzle consumption settles complete-empty, never uncertain', async () => {
  const system = { id: 'alc', resolutionMode: 'alchemy', alchemy: { consumeOnFail: true } };
  installCraftWorld();
  globalThis.game.fabricate.getCraftingSystemManager = () => ({ getSystem: () => system });
  const settled = [];
  const runManager = {
    recordFizzle: async () => ({ id: 'fizz-1' }),
    settleHistory: async (_actor, id, payload) => {
      settled.push({ id, ...payload });
    },
  };
  const engine = new CraftingEngine({ getRecipes: () => [] }, runManager);
  engine._matchAlchemySignature = () => ({ matched: false });
  engine._recordAlchemyDeadEnd = async () => {};
  const source = liveActor('a1');
  const herb = liveItem(source, 'herb', 2);
  herb.update = async () => undefined;

  await rejectsWith(
    engine.craftAlchemy(source, [source], [{ item: herb, componentId: 'herb' }], {
      craftingSystemId: 'alc',
    }),
    REFUSED
  );
  assert.deepEqual(settled, [
    {
      id: 'fizz-1',
      consumedIngredients: [],
      historySettlement: { consumption: 'complete', awards: 'complete' },
    },
  ]);
  assert.equal(quantityOf(herb), 2);
});
