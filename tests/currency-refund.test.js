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
      // A real `Document#update` RESOLVES THE DOCUMENT when it applied a change, and resolves
      // `undefined` when the diff was empty — which is what an off-schema path produces. The
      // spender now judges the write by that return (issue 1301), so a stub that resolved
      // nothing was asserting the very behaviour that means NOTHING WAS WRITTEN.
      return this;
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
  // Issue 1278: the system carries only participation; the ladder is WORLD scope.
  const system = { id: 'sys-cur', requirements: { currency: { enabled: true } } };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
      getCurrencyConfigStore: () => ({
        get: () => ({ spendStrategy: 'actorProperty', providerId: '', macros: {}, units: UNITS }),
      }),
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
    // The RESOLVER is injected because the spender now gates on the macro document before it
    // delegates (issue 1301), and this suite defines no `fromUuid`: without it every uuid here
    // resolves nothing and refuses before reaching the injected runner, which would make this
    // case pass for the wrong reason if it asserted only `valid: false`.
    resolveMacro: async () => ({ type: 'script', command: 'return true;' }),
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

// ---------------------------------------------------------------------------
// Refund ACCUMULATION across aggregated groups (issue 902).
//
// §RunModel requires the reversal to be "best-effort" and to report the actual
// outcome. Aborting at the first failing group is neither: it strands every later
// group unrefunded and reports one opaque boolean.
// ---------------------------------------------------------------------------

const { aggregateCurrencySpends } = await import('../src/systems/currencyAffordance.js');
const { validateCurrencyProfile: validateProfile } = await import(
  '../src/systems/currencyProfile.js'
);
const { CurrencyCraftingActorFake, TWO_TERMINAL_CURRENCY_UNITS, makeDelegatingCoinSpender } =
  await import('./helpers/currency-spend-fixtures.js');

const TWO_TERMINAL_SPENDS = [
  { unit: 'gp', amount: 2 },
  { unit: 'gem', amount: 3 },
];

// Wire `game` for the two-terminal profile and assert the precondition that makes every
// downstream money assertion meaningful: a typo'd unit id or a shared terminal collapses
// the fixture to ONE group silently.
function setupTwoTerminalRefund() {
  const system = { id: 'sys-two-terminal', requirements: { currency: { enabled: true } } };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
      getCurrencyConfigStore: () => ({
        get: () => ({
          spendStrategy: 'actorProperty',
          providerId: '',
          macros: {},
          units: TWO_TERMINAL_CURRENCY_UNITS,
        }),
      }),
    },
  };
  const profile = validateProfile(TWO_TERMINAL_CURRENCY_UNITS, {
    spendStrategy: 'actorProperty',
  });
  assert.equal(
    aggregateCurrencySpends(TWO_TERMINAL_SPENDS, profile).length,
    2,
    'the fixture must aggregate to TWO terminal base units, not collapse to one'
  );
  return { recipe: { craftingSystemId: system.id } };
}

test('refundCurrencySpends refunds every group even when the FIRST one fails', async () => {
  const { recipe } = setupTwoTerminalRefund();
  const actor = new CurrencyCraftingActorFake('Refundee', { currency: { gp: 11, gem: 4 } });
  const spy = makeDelegatingCoinSpender(new ActorPropertyCoinSpender(), { failRefundFor: ['gp'] });

  const result = await refundCurrencySpends(actor, recipe, TWO_TERMINAL_SPENDS, {
    actorPropertyCoinSpender: spy,
  });

  assert.equal(spy.refundCalls.length, 2, 'a failing first group must not abort the second');
  assert.equal(actor.system.currency.gem, 7, 'the second group is still refunded (4 -> 7)');
  assert.equal(actor.system.currency.gp, 11, 'the failed group refunded nothing');
  assert.equal(result.valid, false, 'one failed group makes the whole refund invalid');
  assert.equal(result.groups.length, 2, 'per-group detail is reported for every group');
  assert.equal(result.groups[0].refunded, false);
  assert.equal(result.groups[1].refunded, true);
});

test('refundCurrencySpends still reports overall FAILURE when only the LAST group fails', async () => {
  const { recipe } = setupTwoTerminalRefund();
  const actor = new CurrencyCraftingActorFake('Refundee', { currency: { gp: 11, gem: 4 } });
  const spy = makeDelegatingCoinSpender(new ActorPropertyCoinSpender(), { failRefundFor: ['gem'] });

  const result = await refundCurrencySpends(actor, recipe, TWO_TERMINAL_SPENDS, {
    actorPropertyCoinSpender: spy,
  });

  assert.equal(spy.refundCalls.length, 2);
  assert.equal(actor.system.currency.gp, 13, 'the first group is refunded (11 -> 13)');
  assert.equal(actor.system.currency.gem, 4, 'the failed last group refunded nothing');
  assert.equal(result.valid, false, 'an accumulator must not report success because SOMETHING did');
  assert.equal(result.groups[0].refunded, true);
  assert.equal(result.groups[1].refunded, false);
});

test('refundCurrencySpends reports EVERY group unrefunded when the spender has no refund', async () => {
  const { recipe } = setupTwoTerminalRefund();
  const actor = new CurrencyCraftingActorFake('Refundee', { currency: { gp: 11, gem: 4 } });
  const base = new ActorPropertyCoinSpender();
  // The spend-only spy precedent: no `refund` method at all.
  const spendOnly = {
    readCoins: (a, ctx) => base.readCoins(a, ctx),
    check: (a, req, ctx) => base.check(a, req, ctx),
    spend: (a, req, ctx) => base.spend(a, req, ctx),
  };

  const result = await refundCurrencySpends(actor, recipe, TWO_TERMINAL_SPENDS, {
    actorPropertyCoinSpender: spendOnly,
  });

  assert.equal(result.valid, false);
  assert.match(result.message, /not available/i);
  assert.equal(result.groups.length, 2, 'missing detail must never read as "all refunded"');
  assert.ok(
    result.groups.every((group) => group.refunded === false && group.attempted === false),
    'no group was refunded and none was even attempted'
  );
  assert.equal(actor.updates.length, 0);
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
