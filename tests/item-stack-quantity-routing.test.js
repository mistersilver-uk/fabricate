/**
 * Acceptance criterion 6 (issue 1024): under a CONFIGURED stack-quantity path, every
 * consume and award path reads and writes ONLY the configured field.
 *
 * ## The load-bearing fixture shape
 *
 * Every item here carries **only** `system.qtd` — there is no `system.quantity` key on it
 * at all. That is what makes these assertions mean something. ~15 test files in this suite
 * hardcode `payload['system.quantity']` in their Item fakes and stay green whether the
 * sites are routed or not, because the UNCONFIGURED default *is* `system.quantity`.
 * `npm test` cannot otherwise distinguish "routed" from "not routed".
 *
 * ## What this file does NOT prove
 *
 * It proves the payload **shape**, not that the write lands. Every Item fake in this repo
 * applies its payload by hand, so a fake keyed on the configured path always applies it and
 * nothing here can observe a Foundry schema discard. That proof is routed to
 * `probeStackQuantityPath`'s `_source` verdict (`tests/item-stack-quantity.test.js`) and to
 * the manual test.
 *
 * Note also that an assertion under a MISCONFIGURED path would prove nothing at all: under
 * a misconfigured path the engine correctly deletes, so "delete was called" is the right
 * answer for the wrong reason.
 *
 * ## Ambient-state discipline
 *
 * The configured path is module state. Nothing here configures it at module scope, and
 * every test registers `t.after(resetItemStackQuantityPath)` as its FIRST statement, before
 * the configure call, so a mid-test throw still resets.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// The `foundry.utils` path helpers are wired from the repo's own shared walker rather
// than re-hand-rolled here for a fourth time. They are fixture plumbing only — nothing
// below asserts on a value they produce — and `objectPath.js` has its own test file.
import { getByPath, setByPath } from '../src/utils/objectPath.js';

globalThis.foundry = {
  utils: {
    getProperty: getByPath,
    setProperty: setByPath,
    deepClone: (value) => JSON.parse(JSON.stringify(value ?? null)),
    randomID: () => 'id-routing',
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.game = { user: { id: 'gm', isGM: true }, actors: [], time: { worldTime: 0 } };

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
const { createOrStackComponentItem } = await import('../src/systems/componentStacking.js');
const { createGatheringResultCreator } = await import('../src/gatheringResultCreation.js');
const { createToolReplacementCreator } = await import('../src/toolBreakageRuntime.js');
const { findStackableMatch } = await import('../src/utils/sourceUuid.js');
const { configureItemStackQuantityPath, resetItemStackQuantityPath } = await import(
  '../src/systems/itemStackQuantity.js'
);

const CONFIGURED_PATH = 'system.qtd';

/**
 * An owned item whose stack count lives ONLY at `system.qtd`. It applies whatever
 * flattened payload it is handed, so a write to the wrong key is visible in `updates`
 * rather than silently swallowed.
 */
function ownedItem(id, qtd, extra = {}) {
  return {
    id,
    uuid: `Item.${id}`,
    name: id,
    img: `icons/${id}.png`,
    system: { qtd },
    deleted: false,
    updates: [],
    async delete() {
      this.deleted = true;
    },
    async update(payload) {
      this.updates.push({ ...payload });
      for (const [key, value] of Object.entries(payload)) setByPath(this, key, value);
    },
    toObject() {
      return { name: this.name, img: this.img, type: 'loot', system: { ...this.system } };
    },
    ...extra,
  };
}

function capturingActor(items = []) {
  const created = [];
  return {
    id: 'actor-1',
    uuid: 'Actor.actor-1',
    items,
    created,
    async createEmbeddedDocuments(type, payloads) {
      created.push(...payloads);
      return payloads.map((payload, index) => ({
        ...payload,
        documentName: 'Item',
        id: `created-${index}`,
        uuid: `Item.created-${index}`,
      }));
    },
  };
}

/** Nothing may ever be written to the default path while another one is configured. */
function assertNoDefaultPathWrite(item) {
  for (const payload of item.updates) {
    for (const key of Object.keys(payload)) {
      assert.ok(
        !key.startsWith('system.quantity'),
        `wrote to the unconfigured default path: ${key}`
      );
    }
  }
  assert.equal(item.system.quantity, undefined, 'the item never grew a default-path key');
}

// ---------------------------------------------------------------------------
// The four delete-on-underrun sites.
// ---------------------------------------------------------------------------

describe('craft consumption (_consumeIngredients — also the timed step START path)', () => {
  it('decrements the configured field and does NOT delete', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const item = ownedItem('iron-ingot', 20);
    const engine = new CraftingEngine({});
    await engine._consumeIngredients([{ item, quantity: 1, ingredient: null }]);

    assert.equal(item.deleted, false, 'a stack of twenty must survive consuming one');
    assert.deepEqual(item.updates, [{ 'system.qtd': 19 }]);
    assertNoDefaultPathWrite(item);
  });

  it('still deletes on a genuine underrun', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const item = ownedItem('iron-ingot', 2);
    const engine = new CraftingEngine({});
    await engine._consumeIngredients([{ item, quantity: 2, ingredient: null }]);

    assert.equal(item.deleted, true);
    assert.deepEqual(item.updates, []);
  });
});

describe('salvage consumption (_consumeComponentItems)', () => {
  it('decrements the configured field and does NOT delete', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const item = ownedItem('hide', 20);
    const engine = new CraftingEngine({});
    const consumed = await engine._consumeComponentItems(capturingActor([item]), [item], 1);

    assert.equal(item.deleted, false);
    assert.deepEqual(item.updates, [{ 'system.qtd': 19 }]);
    assert.deepEqual(consumed, [{ item, quantity: 1 }]);
    assertNoDefaultPathWrite(item);
  });
});

describe('alchemy EXTRA consumption (_consumeAlchemyExtraItems)', () => {
  it('decrements the configured field and does NOT delete', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const item = ownedItem('ember', 20);
    const engine = new CraftingEngine({});
    const consumedItems = [];
    await engine._consumeAlchemyExtraItems(consumedItems, [capturingActor([item])], {
      isAlchemyAttempt: true,
      alchemySubmittedItems: [item],
    });

    assert.equal(item.deleted, false);
    assert.deepEqual(item.updates, [{ 'system.qtd': 19 }]);
    assert.deepEqual(consumedItems, [{ item, quantity: 1, ingredient: null }]);
    assertNoDefaultPathWrite(item);
  });
});

describe('alchemy NO-MATCH consumption (_consumeSubmittedAlchemyItems)', () => {
  it('decrements the configured field and does NOT delete', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const item = ownedItem('ember', 20);
    const engine = new CraftingEngine({});
    await engine._consumeSubmittedAlchemyItems([capturingActor([item])], [item]);

    assert.equal(item.deleted, false);
    assert.deepEqual(item.updates, [{ 'system.qtd': 19 }]);
    assertNoDefaultPathWrite(item);
  });
});

// ---------------------------------------------------------------------------
// The award/creation paths.
// ---------------------------------------------------------------------------

describe('the timed-step restore path (_restoreComponentItem)', () => {
  it('authors the restored quantity at the configured field only', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const actor = capturingActor();
    const engine = new CraftingEngine({});
    await engine._restoreComponentItem({
      actor,
      system: { id: 'sys-1', components: [{ id: 'wood', name: 'Wood' }] },
      componentId: 'wood',
      quantity: 3,
    });

    assert.equal(actor.created.length, 1);
    assert.equal(actor.created[0].system.qtd, 3);
    assert.equal(actor.created[0].system.quantity, undefined);
  });
});

describe('component award stacking (createOrStackComponentItem)', () => {
  it('increments the configured field on an existing stack', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const existing = ownedItem('plank', 20);
    const result = await createOrStackComponentItem({
      actor: capturingActor([existing]),
      itemData: { name: 'Plank', system: {} },
      matchingItems: [existing],
      awardedQuantity: 4,
    });

    assert.equal(result, existing);
    assert.deepEqual(existing.updates, [{ 'system.qtd': 24 }]);
    assertNoDefaultPathWrite(existing);
  });

  it('still honours its explicit path parameter — the pure test seam survives', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const existing = ownedItem('plank', 20);
    existing.system.custom = 5;
    await createOrStackComponentItem({
      actor: capturingActor([existing]),
      itemData: { name: 'Plank', system: {} },
      matchingItems: [existing],
      awardedQuantity: 1,
      quantityPath: 'system.custom',
    });

    assert.deepEqual(existing.updates, [{ 'system.custom': 6 }]);
  });
});

describe('the stackability probe (findStackableMatch)', () => {
  it('matches on the CONFIGURED field, not on the default one', (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const source = { uuid: 'Item.src', _stats: { compendiumSource: 'Compendium.pack.Item.src' } };
    const stackable = {
      uuid: 'Item.owned-a',
      system: { qtd: 4 },
      _stats: { compendiumSource: 'Compendium.pack.Item.src' },
    };
    // Unique gear under the CONFIGURED path: it carries the old default field, which
    // must no longer count as "this stacks".
    const unique = {
      uuid: 'Item.owned-b',
      system: { quantity: 4 },
      _stats: { compendiumSource: 'Compendium.pack.Item.src' },
    };

    assert.equal(findStackableMatch([unique, stackable], source), stackable);
    assert.equal(findStackableMatch([unique], source), null);
  });
});

describe('gathering awards (createGatheringResultCreator)', () => {
  const SYSTEM = {
    id: 'sys-gather',
    components: [{ id: 'berries', name: 'Wild Berries', registeredItemUuid: null }],
  };
  const manager = { getSystem: (id) => (id === SYSTEM.id ? SYSTEM : null) };
  const resultGroups = [{ results: [{ componentId: 'berries', quantity: 3 }] }];

  it('authors a NEW award at the configured field only', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const actor = capturingActor([]);
    await createGatheringResultCreator(manager).create({ actor, system: SYSTEM, resultGroups });

    assert.equal(actor.created.length, 1);
    assert.equal(actor.created[0].system.qtd, 3);
    assert.equal(actor.created[0].system.quantity, undefined);
  });

  it('increments the configured field when stacking onto an existing award', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const component = {
      id: 'berries',
      name: 'Wild Berries',
      registeredItemUuid: 'Item.berries-src',
    };
    const system = { id: 'sys-gather-2', components: [component] };
    const sourceItem = {
      uuid: 'Item.berries-src',
      id: 'berries-src',
      getFlag: () => undefined,
      toObject: () => ({ name: 'Wild Berries', type: 'loot', system: { qtd: 1 }, flags: {} }),
    };
    globalThis.fromUuidSync = (uuid) => (uuid === 'Item.berries-src' ? sourceItem : null);
    t.after(() => {
      delete globalThis.fromUuidSync;
    });

    const existing = ownedItem('owned-berries', 5, {
      getFlag: () => undefined,
      flags: { core: { sourceId: 'Item.berries-src' } },
    });
    const actor = capturingActor([existing]);
    await createGatheringResultCreator({ getSystem: () => system }).create({
      actor,
      system,
      resultGroups: [{ results: [{ componentId: 'berries', quantity: 3 }] }],
    });

    assert.equal(actor.created.length, 0, 'the award stacked instead of creating a duplicate');
    assert.deepEqual(existing.updates, [{ 'system.qtd': 8 }]);
    assertNoDefaultPathWrite(existing);
  });
});

describe('tool replacement creation (createToolReplacementCreator)', () => {
  it('authors the replacement quantity at the configured field only', async (t) => {
    t.after(resetItemStackQuantityPath);
    configureItemStackQuantityPath(CONFIGURED_PATH);

    const actor = capturingActor();
    const create = createToolReplacementCreator({
      system: { id: 'sys-1', tools: [] },
      resolveComponentSource: async () => ({
        uuid: 'Item.hammer-src',
        toObject: () => ({ name: 'Hammer', type: 'loot', system: {}, flags: {} }),
      }),
    });
    await create({ actor, target: { type: 'component', componentId: 'hammer' } });

    assert.equal(actor.created.length, 1);
    assert.equal(actor.created[0].system.qtd, 1);
    assert.equal(actor.created[0].system.quantity, undefined);
  });
});
