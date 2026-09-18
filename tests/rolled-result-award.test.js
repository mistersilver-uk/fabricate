/**
 * Issue 1645: the crafting award path resolves a rolled amount ONCE per result and awards the
 * integer it rolled — including zero, which creates nothing and is still reported.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { seededRollClass } from './helpers/seededRoll.js';

function setProperty(object, path, value) {
  const parts = String(path).split('.');
  let cursor = object;
  for (const key of parts.slice(0, -1)) {
    if (cursor[key] == null) cursor[key] = {};
    cursor = cursor[key];
  }
  cursor[parts.at(-1)] = value;
}

globalThis.foundry = {
  utils: {
    randomID: () => 'rid',
    setProperty,
    getProperty: (object, path) =>
      String(path ?? '')
        .split('.')
        .reduce((value, key) => (value == null ? undefined : value[key]), object),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');

const SYSTEM_ID = 'sys-1645';
const COMPONENT = {
  id: 'ore',
  name: 'Iron Ore',
  registeredItemUuid: 'Item.ore-src',
  originItemUuid: null,
  aliasItemUuids: [],
  difficulty: 5,
};
const SYSTEM = { id: SYSTEM_ID, components: [COMPONENT], features: {} };
const RECIPE = { craftingSystemId: SYSTEM_ID, transferEffects: false };

globalThis.game = {
  fabricate: { getCraftingSystemManager: () => ({ getSystem: () => SYSTEM }) },
};
globalThis.fromUuid = async (uuid) =>
  uuid === COMPONENT.registeredItemUuid
    ? {
        uuid,
        toObject: () => ({
          name: COMPONENT.name,
          type: 'loot',
          img: 'icons/svg/item-bag.svg',
          system: { quantity: 1 },
          flags: {},
        }),
      }
    : null;

function capturingActor() {
  const captured = [];
  const actor = {
    uuid: 'Actor.smith',
    captured,
    getRollData: () => ({ abilities: { str: { mod: 3 } } }),
    async createEmbeddedDocuments(_type, dataArray) {
      captured.push(...dataArray);
      return dataArray.map((data, index) => ({
        ...structuredClone(data),
        parent: actor,
        uuid: `${actor.uuid}.Item.made-${index}`,
        _source: structuredClone(data),
      }));
    },
  };
  return actor;
}

function withRoll(seed, run) {
  const seeded = seededRollClass(seed);
  const previous = globalThis.Roll;
  globalThis.Roll = seeded.Roll;
  return Promise.resolve(run(seeded)).finally(() => {
    if (previous === undefined) delete globalThis.Roll;
    else globalThis.Roll = previous;
  });
}

const engine = () => new CraftingEngine({ canCraft: () => ({ canCraft: false }) }, null, null);
const resultRow = (id, quantityFormula) => ({ id, componentId: COMPONENT.id, quantity: 1, quantityFormula });

test('1645: the crafted stack is the seeded roll total, rolled once against the crafter', async () => {
  await withRoll({ totals: { '1d4+1': 4 } }, async ({ calls }) => {
    const actor = capturingActor();
    const { items, rolledAmounts } = await engine()._createResultItems(
      actor,
      RECIPE,
      { resultGroups: [{ id: 'g', results: [resultRow('r1', '1d4+1')] }] },
      null,
      [],
      []
    );

    assert.equal(actor.captured.length, 1, 'one item is created');
    assert.equal(actor.captured[0].system.quantity, 4, 'the stack is the rolled total, not `quantity`');
    assert.equal(items.historyReceipts[0].quantity, 4, 'and so is the receipt');
    assert.equal(calls.length, 1, 'ONE roll for one result');
    assert.deepEqual(calls[0].data, { abilities: { str: { mod: 3 } } }, 'against the crafter');
    assert.deepEqual(rolledAmounts, [
      { resultId: 'r1', componentId: COMPONENT.id, formula: '1d4+1', total: 4, quantity: 4 },
    ]);
  });
});

test('1645: a result rolling to zero creates no item and is still reported', async () => {
  await withRoll({ totals: { '1d4-8': -3, '1d4+1': 2 } }, async ({ calls }) => {
    const actor = capturingActor();
    const { items, rolledAmounts } = await engine()._createResultItems(
      actor,
      RECIPE,
      {
        resultGroups: [
          { id: 'g', results: [resultRow('r1', '1d4-8'), resultRow('r2', '1d4+1')] },
        ],
      },
      null,
      [],
      []
    );

    assert.equal(actor.captured.length, 1, 'only the second result produced anything');
    assert.equal(items.historyReceipts.length, 1, 'an empty award writes no receipt');
    assert.equal(calls.length, 2, 'one roll per result');
    assert.deepEqual(rolledAmounts[0], {
      resultId: 'r1',
      componentId: COMPONENT.id,
      formula: '1d4-8',
      total: -3,
      quantity: 0,
    });
  });
});

test('1645: a fixed result still awards its authored quantity and rolls nothing', async () => {
  await withRoll({}, async ({ calls }) => {
    const actor = capturingActor();
    const { rolledAmounts } = await engine()._createResultItems(
      actor,
      RECIPE,
      { resultGroups: [{ id: 'g', results: [{ id: 'r1', componentId: COMPONENT.id, quantity: 3 }] }] },
      null,
      [],
      []
    );
    assert.equal(actor.captured[0].system.quantity, 3);
    assert.equal(calls.length, 0, 'no formula, no roll');
    assert.deepEqual(rolledAmounts, [], 'and nothing to report');
  });
});

test('1645: a progressive salvage award forces one and drops the formula before the resolver', () => {
  const component = {
    salvage: {
      allowPlayerResultReorder: false,
      resultGroups: [{ id: 'g', results: [resultRow('r1', '1d4+1'), resultRow('r2', '1d4+1')] }],
    },
  };
  const system = {
    ...SYSTEM,
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: { progressive: { rollFormula: '1d20', awardMode: 'equal' } },
  };
  component.salvage.resultGroups[0].results[0].quantity = 7;
  const [group] = engine()._resolveSalvageResultGroups(component, system, { value: 10 }, null);

  assert.equal(group.results.length, 2, 'the budget affords both stages');
  for (const result of group.results) {
    assert.equal(result.quantity, 1, 'a progressive stage awards exactly one');
    assert.equal(result.quantityFormula, null, 'the formula never reaches the resolver');
  }
});
