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
  checkCurrencySpends,
  getCurrencyRequirementConfig,
  refundCurrencySpends,
  resolveCurrencyContext,
  spendCurrencySpends,
} from '../src/systems/currencyAffordance.js';
import {
  makeCurrencyCraftingSystem,
  makeWorldCurrencyConfig,
} from './helpers/currency-spend-fixtures.js';

const RECIPE = { id: 'r1', craftingSystemId: 'sys-currency' };

/**
 * Run `run()` with `globalThis.game` set to a minimal stub carrying `system.id` and an empty
 * `fabricate` accessor, restoring whatever was there before. Shared by every describe block below
 * that reaches `describeUnavailableCoinSpender`'s `globalThis.game?.system?.id` read.
 */
function withGame(systemId, run) {
  const previous = globalThis.game;
  globalThis.game = { system: { id: systemId }, fabricate: {} };
  try {
    return run();
  } finally {
    globalThis.game = previous;
  }
}

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

/**
 * The joined error list is CAPPED (issue 1493 follow-up).
 *
 * `validateCurrencyProfile` returns one error per malformed unit, so an uncapped join renders a
 * whole paragraph into `context.error` — a chat message and, via the requirement rail, an
 * accessible name. Each fixture unit here omits ONLY `actorPath` (empty `contains`, a real
 * label/abbreviation/id), so under `actorProperty` it contributes EXACTLY one
 * "is missing an actor data path" error and nothing else — the count of listed faults is
 * therefore exactly `min(n, 3)`, which is what each assertion below checks for.
 */
describe('the joined profile-error list caps its listed faults (issue 1493)', () => {
  function unitsMissingActorPath(n) {
    return Array.from({ length: n }, (_, i) => ({
      id: `gp${i}`,
      label: `Gold ${i}`,
      abbreviation: `g${i}`,
      contains: [],
    }));
  }

  function errorFor(n) {
    const context = resolveCurrencyContext(
      RECIPE,
      seamsFor({ spendStrategy: 'actorProperty', units: unitsMissingActorPath(n) })
    );
    return context.error;
  }

  it('lists all 1 error untouched, with no overflow suffix', () => {
    const error = errorFor(1);
    assert.equal((error.match(/is missing an actor data path/g) || []).length, 1);
    assert.ok(!/more issue/.test(error), error);
  });

  it('lists all 2 errors untouched, with no overflow suffix', () => {
    const error = errorFor(2);
    assert.equal((error.match(/is missing an actor data path/g) || []).length, 2);
    assert.ok(!/more issue/.test(error), error);
  });

  it('lists all 3 errors untouched — exactly at the cap, so overflow must not trigger', () => {
    const error = errorFor(3);
    assert.equal((error.match(/is missing an actor data path/g) || []).length, 3);
    assert.ok(!/more issue/.test(error), error);
  });

  it('caps a dozen errors at 3 listed, summarising the other 9 by count', () => {
    const error = errorFor(12);
    assert.equal(
      (error.match(/is missing an actor data path/g) || []).length,
      3,
      'only the first 3 units are named'
    );
    assert.match(error, /and 9 more issues\.$/, error);
  });
});

/**
 * A player-facing currency refusal carries a directive naming who can fix it and where
 * (issue 1493 follow-up). `checkCurrencySpends` returns its message DIRECTLY as
 * `CraftingEngine.craft`'s result, which is what the crafting player reads, so both of its
 * refusal branches must carry it.
 *
 * `spendCurrencySpends` and `refundCurrencySpends` compose from the SAME context fields but only
 * ever `console.error` the result (the deduction/refund neither abort nor surface to a caller a
 * player can read), so they — and the raw context fields themselves, read by the GM editor's
 * validation report and the requirement rail — must NOT carry it. Both are pinned as negative
 * controls below.
 */
describe('the player-facing currency setup directive (issue 1493)', () => {
  const DIRECTIVE = /Ask your GM to finish the world's currency setup \(Crafting Systems/;
  const SPENDS = [{ unit: 'gp', amount: 1 }];

  it('appends the directive when checkCurrencySpends refuses on an INVALID profile', async () => {
    const seams = seamsFor({ spendStrategy: 'actorProperty', units: [{ id: 'gp', label: 'Gold' }] });
    const result = await checkCurrencySpends(null, RECIPE, SPENDS, seams);

    assert.equal(result.valid, false);
    assert.match(result.message, /Currency configuration is invalid/);
    assert.match(result.message, DIRECTIVE);
  });

  it('appends the directive when checkCurrencySpends refuses on a valid profile with NO spender', async () => {
    const world = makeWorldCurrencyConfig({ spendStrategy: 'actorInventory' });
    await withGame('dnd5e', async () => {
      const seams = { ...seamsFor(world), actorInventoryCoinSpender: null };
      const result = await checkCurrencySpends(null, RECIPE, SPENDS, seams);

      assert.equal(result.valid, false);
      assert.match(result.message, /no coin spender is registered/i);
      assert.match(result.message, DIRECTIVE);
    });
  });

  it('leaves the raw context fields undirected, for the GM editor and rail readers', () => {
    withGame('dnd5e', () => {
      const context = resolveCurrencyContext(
        RECIPE,
        seamsFor({ spendStrategy: 'actorProperty', units: [{ id: 'gp', label: 'Gold' }] })
      );
      assert.ok(!DIRECTIVE.test(context.error), context.error);
    });
  });

  it('leaves the DEDUCTION message undirected — it only ever reaches a console.error, never a player', async () => {
    const seams = seamsFor({ spendStrategy: 'actorProperty', units: [{ id: 'gp', label: 'Gold' }] });
    const result = await spendCurrencySpends(null, RECIPE, SPENDS, seams);

    assert.equal(result.valid, false);
    assert.match(result.message, /Currency configuration is invalid/);
    assert.ok(!DIRECTIVE.test(result.message), result.message);
  });

  it('leaves the REFUND message undirected — same GM-diagnostic-only path as the deduction', async () => {
    const seams = seamsFor({ spendStrategy: 'actorProperty', units: [{ id: 'gp', label: 'Gold' }] });
    const result = await refundCurrencySpends(null, RECIPE, SPENDS, seams);

    assert.equal(result.valid, false);
    assert.match(result.message, /Currency configuration is invalid/);
    assert.ok(!DIRECTIVE.test(result.message), result.message);
  });
});
