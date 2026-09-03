/**
 * `getCurrencyRequirementConfig` composing its two scopes (issue 1278) — and specifically the
 * degenerate half, which is the ONE new failure mode the relocation introduces.
 *
 * Before the move, "the system says currency is on" and "the ladder exists" were the same fact,
 * carried by one record. They are now two records that can disagree: a crafting system can have
 * `requirements.currency.enabled === true` while the world config is absent, empty, or malformed
 * — an upgraded world before its GM visits World > Currency, an import into a world that refused
 * the merge, a hand-edited setting.
 *
 * The rule that must hold in every one of those states is that DISPLAY AGREES WITH EXECUTION:
 * the afford probe reads false, and the spend refuses, for exactly the same reason. A state where
 * the probe says affordable and the spend then fails would strand a player mid-craft.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ActorInventoryCoinSpender } from '../src/systems/CoinSpenders.js';
import {
  buildCurrencyAffordProbe,
  getCurrencyRequirementConfig,
  resolveCurrencyContext,
} from '../src/systems/currencyAffordance.js';
import {
  makeCurrencyCraftingSystem,
  makeWorldCurrencyConfig,
} from './helpers/currency-spend-fixtures.js';

const RECIPE = { id: 'r1', craftingSystemId: 'sys-currency' };

function seamsFor(worldConfig, { enabled = true } = {}) {
  const system = makeCurrencyCraftingSystem({ enabled });
  return {
    getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
    getCurrencyConfig: () => worldConfig,
  };
}

// Every shape a world config can arrive in when the GM has not authored one, or has corrupted it.
const DEGENERATE_WORLDS = [
  ['absent', undefined],
  ['null', null],
  ['empty object', {}],
  ['a string', 'nope'],
  ['units not an array', { units: 'nope' }],
  ['an empty ladder', { spendStrategy: 'actorProperty', units: [] }],
  ['a unit with no actor path', { spendStrategy: 'actorProperty', units: [{ id: 'gp' }] }],
];

describe('the two-scope composition when the world has no usable ladder', () => {
  for (const [label, world] of DEGENERATE_WORLDS) {
    it(`refuses the craft, and says so through BOTH the probe and the context (${label})`, () => {
      const seams = seamsFor(world);

      const config = getCurrencyRequirementConfig(RECIPE, seams);
      assert.equal(config.enabled, true, 'participation is the SYSTEM’s answer and is unchanged');
      assert.ok(Array.isArray(config.units), 'the ladder always normalizes to an array');

      const context = resolveCurrencyContext(RECIPE, seams);
      assert.ok(context.error, `an unusable ladder must surface an error, not silently pass`);

      const probe = buildCurrencyAffordProbe(null, RECIPE, seams);
      assert.equal(probe(), false, 'and the probe must agree with it');
    });
  }

  it('falls back to actorProperty for an unknown spend strategy rather than trusting it', () => {
    const config = getCurrencyRequirementConfig(
      RECIPE,
      seamsFor({ spendStrategy: 'teleportation', units: [] })
    );
    assert.equal(config.spendStrategy, 'actorProperty');
  });

  it('normalizes a non-object macro set, so a macro read cannot throw downstream', () => {
    const config = getCurrencyRequirementConfig(RECIPE, seamsFor({ macros: 'nope', units: [] }));
    assert.deepEqual(config.macros, {});
  });
});

describe('the two-scope composition when the system opts out', () => {
  it('reports disabled even against a fully authored world ladder', () => {
    // The toggle is the whole point of the split: a world ladder that every other system uses
    // must not make THIS system's recipes chargeable.
    const seams = seamsFor(makeWorldCurrencyConfig(), { enabled: false });

    assert.equal(getCurrencyRequirementConfig(RECIPE, seams).enabled, false);
    assert.deepEqual(
      resolveCurrencyContext(RECIPE, seams),
      { enabled: false },
      'the context short-circuits before it ever looks at the ladder'
    );
    assert.equal(buildCurrencyAffordProbe(null, RECIPE, seams)(), false);
  });
});

describe('the two-scope composition when both halves are present', () => {
  it('takes participation from the system and everything else from the world', () => {
    const world = makeWorldCurrencyConfig({ spendStrategy: 'macro', providerId: 'pf2e-inventory' });
    const config = getCurrencyRequirementConfig(RECIPE, seamsFor(world));

    assert.equal(config.enabled, true);
    assert.equal(config.spendStrategy, 'macro');
    assert.equal(config.providerId, 'pf2e-inventory');
    assert.deepEqual(
      config.units.map((unit) => unit.id),
      world.units.map((unit) => unit.id)
    );
  });

  it('returns null for a recipe with no crafting system, before touching either scope', () => {
    assert.equal(getCurrencyRequirementConfig({ id: 'orphan' }, seamsFor(null)), null);
  });
});

/**
 * The refusal carries its REASON (issue 1493).
 *
 * The defect: a world whose currency cannot be resolved refused the option silently.
 * `resolveCurrencyContext` learned exactly why and then discarded it, so the constant-`false` probe
 * stopped the option ever being selected, the engine's currency gate was handed nothing to check,
 * and the craft died claiming the player could not afford a cost the system had never priced.
 *
 * Two causes, deliberately not conflated, because only one of them has an object to ask.
 */
describe('the refusal reason for a VALID ladder with no usable coin spender', () => {
  const VALID_INVENTORY_WORLD = makeWorldCurrencyConfig({ spendStrategy: 'actorInventory' });

  function withGame(systemId, run) {
    const previous = globalThis.game;
    globalThis.game = { system: { id: systemId }, fabricate: {} };
    try {
      return run();
    } finally {
      globalThis.game = previous;
    }
  }

  it('composes the reason ITSELF when no spender resolves at all', () => {
    // `spender?.describeUnavailable?.()` is `undefined` for precisely this case — there is no
    // object to ask — so a design that only asked the spender could not serve the very case the
    // fix exists for. The sentence has to be composed spender-independently.
    withGame('dnd5e', () => {
      const seams = { ...seamsFor(VALID_INVENTORY_WORLD), actorInventoryCoinSpender: null };
      const context = resolveCurrencyContext(RECIPE, seams);

      assert.equal(context.enabled, true);
      assert.equal(context.error, undefined, 'the ladder itself is fine; this is not a profile fault');
      assert.equal(context.spender, null, 'the precondition: there is no spender to ask');
      assert.match(context.spenderUnavailableReason, /no coin spender is registered/i);
      assert.match(context.spenderUnavailableReason, /actorInventory/, 'it names the strategy');
      assert.match(context.spenderUnavailableReason, /"dnd5e"/, 'and the game system, the real cause');

      assert.strictEqual(
        buildCurrencyAffordProbe({ name: 'Rich' }, RECIPE, seams)({ unit: 'gp', amount: 1 }),
        false,
        'the probe still refuses, and still refuses as a PRIMITIVE false — matchTypes does ' +
          '`!!affordCurrency(match)`, so a reason-carrying object would coerce truthy and invert it'
      );
    });
  });

  it('asks the SPENDER when one exists but has no adapter for the system', () => {
    withGame('dnd5e', () => {
      const seams = {
        ...seamsFor(VALID_INVENTORY_WORLD),
        actorInventoryCoinSpender: new ActorInventoryCoinSpender({
          adapters: new Map(),
          getSystemId: () => 'dnd5e',
        }),
      };
      const context = resolveCurrencyContext(RECIPE, seams);

      assert.equal(context.error, undefined);
      assert.ok(context.spender, 'the precondition: a spender DID resolve');
      assert.match(context.spenderUnavailableReason, /no currency inventory adapter/i);
      assert.match(context.spenderUnavailableReason, /"dnd5e"/);
    });
  });

  it('reports NO reason when the spender can spend, so the field cannot cry wolf', () => {
    withGame('dnd5e', () => {
      const seams = {
        ...seamsFor(VALID_INVENTORY_WORLD),
        actorInventoryCoinSpender: new ActorInventoryCoinSpender({
          adapters: new Map([['dnd5e', { readCoins: () => ({ copperValue: 1000 }) }]]),
          getSystemId: () => 'dnd5e',
        }),
      };
      assert.equal(resolveCurrencyContext(RECIPE, seams).spenderUnavailableReason, null);
    });
  });

  it('keeps the reason SYSTEM-framed, never actor-framed', () => {
    // The cause is that the world has no way to spend coins in this game system:
    // `_resolveAdapter` reads `game.system.id` and takes no actor. Telling a GM the problem is
    // "this actor" sends them to a character sheet to fix a world setting — and it is the same
    // conflation as the genuinely per-actor sentence in `CoinSpenders.readCoins`, which must stay
    // where it is.
    withGame('dnd5e', () => {
      const seams = { ...seamsFor(VALID_INVENTORY_WORLD), actorInventoryCoinSpender: null };
      const reason = resolveCurrencyContext(RECIPE, seams).spenderUnavailableReason;
      // The one permitted "actor" is inside the QUOTED strategy id (`"actorInventory"`), which is
      // a config value the GM authored rather than a claim about a character; strip it before
      // asserting, or this guard is satisfied by the very framing it forbids.
      const claim = reason.replace(/"actor(Inventory|Property)"/g, '"<strategy>"');
      assert.ok(!/actor/i.test(claim), claim);
    });
  });

  it('leaves the reason off an INVALID profile, which already carries its own error', () => {
    // Two fields, two causes: `error` is "the ladder is broken", `spenderUnavailableReason` is
    // "the ladder is fine but nothing can spend it". A context that set both would make a caller
    // choosing between them arbitrary.
    withGame('dnd5e', () => {
      const context = resolveCurrencyContext(
        RECIPE,
        seamsFor({ spendStrategy: 'actorProperty', units: [{ id: 'gp', label: 'Gold' }] })
      );
      assert.match(context.error, /Currency configuration is invalid/);
      assert.equal(context.spenderUnavailableReason, undefined);
    });
  });

  it('reports no reason under the default actorProperty strategy, which always resolves a spender', () => {
    withGame('dnd5e', () => {
      const context = resolveCurrencyContext(RECIPE, seamsFor(makeWorldCurrencyConfig()));
      assert.ok(context.spender, 'actorProperty falls back to a constructed spender');
      assert.equal(context.spenderUnavailableReason, null);
    });
  });
});
