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
