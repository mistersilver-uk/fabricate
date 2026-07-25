/**
 * Currency-refund coverage for the player-cancel reversal (issue 848).
 *
 * A cancel with refund ON must give back the exact currency a craft spent at START.
 * The refund is the inverse of the spend: `buildCurrencyRefundUpdates` adds the
 * requirement's own denomination back to the actor's balance (no change-making), the
 * ActorPropertyCoinSpender applies it, and `refundCurrencySpends` drives the aggregated
 * groups. Reusable by the GM cancel/reverse (issue 847).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}
function setProperty(object, path, value) {
  const keys = String(path).split('.');
  let cursor = object;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cursor[keys[i]] = cursor[keys[i]] || {};
    cursor = cursor[keys[i]];
  }
  cursor[keys[keys.length - 1]] = value;
  return object;
}
globalThis.foundry = { utils: { getProperty, setProperty } };

const { buildCurrencyRefundUpdates } = await import('../src/systems/currencyProfile.js');
const { ActorPropertyCoinSpender, ActorInventoryCoinSpender, MacroCoinSpender } = await import(
  '../src/systems/CoinSpenders.js'
);
const { Pf2eInventoryCoinAdapter } = await import('../src/systems/Pf2eInventoryCoinAdapter.js');
const { refundCurrencySpends } = await import('../src/systems/currencyAffordance.js');

// A dnd5e-shaped currency profile: gp (base value 10) contains sp (base value 1).
const UNITS = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  },
  { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp', contains: [] },
];

function makeActor(gp = 0, sp = 0) {
  return {
    name: 'Refundee',
    system: { currency: { gp, sp } },
    _updates: [],
    async update(payload) {
      this._updates.push(payload);
      for (const [path, value] of Object.entries(payload)) setProperty(this, path, value);
    },
  };
}

test('buildCurrencyRefundUpdates adds the requirement back in its own denomination', () => {
  const actor = makeActor(2, 5);
  const result = buildCurrencyRefundUpdates(actor, { unit: 'gp', amount: 5 }, UNITS);
  assert.equal(result.valid, true);
  assert.deepEqual(result.updates, { 'system.currency.gp': 7 }, 'gp balance goes 2 -> 7');
});

test('buildCurrencyRefundUpdates is a no-op for a zero/absent amount', () => {
  const actor = makeActor(2, 5);
  const result = buildCurrencyRefundUpdates(actor, { unit: 'gp', amount: 0 }, UNITS);
  assert.equal(result.valid, true);
  assert.deepEqual(result.updates, {}, 'no update for a zero refund');
});

test('ActorPropertyCoinSpender.refund applies the refund via a single actor.update', async () => {
  const actor = makeActor(1, 0);
  const spender = new ActorPropertyCoinSpender();
  const { profile } = await import('../src/systems/currencyProfile.js').then((m) => ({
    profile: m.validateCurrencyProfile(UNITS),
  }));
  const unit = profile.units.find((u) => u.id === 'gp');
  const result = await spender.refund(actor, { unit, amount: 3 }, { profile });
  assert.equal(result.valid, true);
  assert.equal(actor.system.currency.gp, 4, 'gp 1 -> 4');
  assert.equal(actor._updates.length, 1, 'exactly one batched update');
});

test('refundCurrencySpends restores every spend against the system currency profile', async () => {
  const system = {
    id: 'sys-cur',
    requirements: { currency: { enabled: true, spendStrategy: 'actorProperty', units: UNITS } },
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
    },
  };
  const actor = makeActor(0, 0);
  const recipe = { craftingSystemId: 'sys-cur' };
  const result = await refundCurrencySpends(actor, recipe, [{ unit: 'gp', amount: 2 }], {});
  assert.equal(result.valid, true);
  assert.equal(actor.system.currency.gp, 2, 'the 2 gp spend is refunded');
});

test('Pf2eInventoryCoinAdapter.addCoins refunds via actor.inventory.addCoins (inverse of spend)', async () => {
  const added = [];
  const actor = { inventory: { addCoins: async (coins) => added.push(coins) } };
  const adapter = new Pf2eInventoryCoinAdapter();
  const result = await adapter.addCoins(actor, { unit: { denomination: 'gp' }, amount: 3 });
  assert.equal(result.valid, true);
  assert.deepEqual(added, [{ gp: 3 }], 'a single denomination count is added back');
});

test('ActorInventoryCoinSpender.refund routes to the pf2e adapter addCoins (issue 848 gap fix)', async () => {
  const added = [];
  const actor = { inventory: { addCoins: async (coins) => added.push(coins) } };
  const adapters = new Map([['pf2e', new Pf2eInventoryCoinAdapter()]]);
  const spender = new ActorInventoryCoinSpender({ adapters, getSystemId: () => 'pf2e' });
  const result = await spender.refund(
    actor,
    { unit: { denomination: 'sp' }, amount: 4 },
    { profile: { units: [] } }
  );
  assert.equal(result.valid, true, 'the pf2e refund path is now functional, not a silent loss');
  assert.deepEqual(added, [{ sp: 4 }]);
});

test('MacroCoinSpender.refund runs the increment macro (the reserved refund flow)', async () => {
  const runs = [];
  const spender = new MacroCoinSpender({
    macros: { canAfford: 'M.afford', decrement: 'M.dec', increment: 'M.inc' },
    runMacro: async (uuid, ctx) => {
      runs.push({ uuid, ctx });
      return true;
    },
  });
  const ctx = { profile: { units: [] }, macroContext: { actor: { name: 'A' } } };
  const result = await spender.refund({ name: 'A' }, { unit: { id: 'gp' }, amount: 2 }, ctx);
  assert.equal(result.valid, true);
  assert.deepEqual(runs.map((r) => r.uuid), ['M.inc'], 'the increment macro is invoked for a refund');
});

test('MacroCoinSpender.refund fails loudly when no increment macro is configured', async () => {
  const spender = new MacroCoinSpender({
    macros: { canAfford: 'M.afford', decrement: 'M.dec' },
    runMacro: async () => true,
  });
  const result = await spender.refund({ name: 'A' }, { unit: { id: 'gp' }, amount: 2 }, { profile: { units: [] } });
  assert.equal(result.valid, false, 'a missing increment macro cannot silently drop a refund');
});

test('refundCurrencySpends is a no-op when currency is disabled or nothing was spent', async () => {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({ id: 'sys-off', requirements: { currency: { enabled: false } } }),
      }),
    },
  };
  const actor = makeActor(0, 0);
  const disabled = await refundCurrencySpends(
    actor,
    { craftingSystemId: 'sys-off' },
    [{ unit: 'gp', amount: 5 }],
    {}
  );
  assert.equal(disabled.valid, true);
  assert.equal(actor._updates.length, 0, 'disabled currency refunds nothing');
  const empty = await refundCurrencySpends(actor, { craftingSystemId: 'sys-off' }, [], {});
  assert.equal(empty.valid, true);
});
