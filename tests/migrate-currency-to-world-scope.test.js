/**
 * Migration 1.26.0 — `migrateCurrencyToWorldScope` (issue 1278).
 *
 * Lifts the currency configuration off every crafting system and into the `currencyConfig` world
 * setting, leaving each system with `requirements.currency = { enabled }`. The two properties that
 * actually matter to a GM's world are pinned here:
 *
 *   - **Reference preservation.** Recipe currency options and salvage currency requirements store
 *     unit IDS. A unit dropped by the merge orphans every reference to it, so the merge is a union
 *     keyed by id, not a pick of one system's ladder.
 *   - **Idempotence.** A second run must never re-merge stale system blocks over a ladder the GM
 *     has since edited — including a unit they deliberately deleted.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWorldCurrencyConfig,
  migrateCurrencyToWorldScope,
  stripSystemCurrencyConfig,
} from '../src/migration/migrateCurrencyToWorldScope.js';

function systemWithCurrency(id, currency) {
  return { id, name: id, requirements: { time: { enabled: false }, currency } };
}

describe('buildWorldCurrencyConfig', () => {
  it('unions units across systems by id, first system winning a collision', () => {
    const built = buildWorldCurrencyConfig([
      systemWithCurrency('alchemy', {
        enabled: true,
        units: [
          { id: 'gp', label: 'Gold', abbreviation: 'gp' },
          { id: 'sp', label: 'Silver' },
        ],
      }),
      systemWithCurrency('smithing', {
        enabled: true,
        units: [
          { id: 'gp', label: 'Gulden', abbreviation: 'gu' },
          { id: 'cp', label: 'Copper' },
        ],
      }),
    ]);

    assert.deepEqual(
      built.units.map((unit) => unit.id),
      ['gp', 'sp', 'cp'],
      'every id from either system survives, in first-seen order'
    );
    assert.equal(
      built.units.find((unit) => unit.id === 'gp').label,
      'Gold',
      'the earlier system wins an id collision, deterministically'
    );
  });

  it('adopts the scalars from the first ENABLED system, not merely the first system', () => {
    // A system with currency switched off never configured these deliberately, so an enabled
    // system's choice is the only signal available about how this world actually stores coins.
    const built = buildWorldCurrencyConfig([
      systemWithCurrency('disabled-first', {
        enabled: false,
        spendStrategy: 'actorProperty',
        providerId: '',
        units: [],
      }),
      systemWithCurrency('enabled-second', {
        enabled: true,
        spendStrategy: 'macro',
        providerId: 'pf2e-inventory',
        macros: { canAfford: 'Macro.can', increment: '', decrement: '' },
        units: [{ id: 'gp', label: 'Gold' }],
      }),
    ]);

    assert.equal(built.spendStrategy, 'macro');
    assert.equal(built.providerId, 'pf2e-inventory');
    assert.equal(built.macros.canAfford, 'Macro.can');
  });

  it('falls back to the first system with any currency block when none is enabled', () => {
    // Otherwise a world whose GM switched every system off would silently revert to
    // `actorProperty` and lose the strategy they configured.
    const built = buildWorldCurrencyConfig([
      systemWithCurrency('only', { enabled: false, spendStrategy: 'macro', units: [] }),
    ]);
    assert.equal(built.spendStrategy, 'macro');
  });

  it('carries the legacy provider/adapter fields forward for the shared normalizer to map', () => {
    const built = buildWorldCurrencyConfig([
      systemWithCurrency('legacy', { enabled: true, provider: 'system', systemAdapter: 'pf2e' }),
    ]);
    assert.equal(built.provider, 'system');
    assert.equal(built.systemAdapter, 'pf2e');
  });

  it('skips malformed systems, requirements and units rather than repairing them', () => {
    const built = buildWorldCurrencyConfig([
      null,
      'not a system',
      { id: 'no-requirements' },
      { id: 'requirements-not-an-object', requirements: 'nope' },
      systemWithCurrency('units-not-an-array', { enabled: true, units: 'nope' }),
      systemWithCurrency('bad-units', {
        enabled: true,
        units: [null, { label: 'no id' }, { id: '   ' }, { id: 'gp', label: 'Gold' }],
      }),
    ]);

    assert.deepEqual(
      built.units.map((unit) => unit.id),
      ['gp']
    );
  });

  it('deep-copies units, so the migrated config cannot alias the system it came from', () => {
    const source = systemWithCurrency('alchemy', {
      enabled: true,
      units: [{ id: 'gp', label: 'Gold', contains: [{ unitId: 'sp', amount: 10 }] }],
    });
    const built = buildWorldCurrencyConfig([source]);
    built.units[0].contains[0].amount = 999;

    assert.equal(source.requirements.currency.units[0].contains[0].amount, 10);
  });
});

describe('stripSystemCurrencyConfig', () => {
  it('reduces the block to the participation flag alone', () => {
    const [system] = stripSystemCurrencyConfig([
      systemWithCurrency('alchemy', {
        enabled: true,
        spendStrategy: 'macro',
        providerId: 'x',
        macros: {},
        units: [{ id: 'gp' }],
      }),
    ]);

    assert.deepEqual(system.requirements.currency, { enabled: true });
    assert.deepEqual(
      system.requirements.time,
      { enabled: false },
      'sibling requirement blocks are untouched'
    );
  });

  it('returns an already-shrunk system BY REFERENCE, so change detection stays honest', () => {
    // The runner decides whether to write by comparing JSON. Rebuilding an unchanged system would
    // not change the JSON, but returning the same reference makes the no-op unmistakable and
    // keeps a re-run from looking like work.
    const system = systemWithCurrency('alchemy', { enabled: true });
    const [result] = stripSystemCurrencyConfig([system]);
    assert.equal(result, system);
  });

  it('leaves a system with no currency block untouched', () => {
    const system = { id: 'alchemy', requirements: { time: { enabled: false } } };
    const [result] = stripSystemCurrencyConfig([system]);
    assert.equal(result, system);
  });

  it('treats a missing `enabled` as off', () => {
    const [system] = stripSystemCurrencyConfig([
      systemWithCurrency('alchemy', { units: [{ id: 'gp' }] }),
    ]);
    assert.deepEqual(system.requirements.currency, { enabled: false });
  });
});

describe('migrateCurrencyToWorldScope', () => {
  it('lifts the ladder and shrinks every system in one pass', () => {
    const result = migrateCurrencyToWorldScope({
      systems: [
        systemWithCurrency('alchemy', {
          enabled: true,
          spendStrategy: 'actorProperty',
          units: [{ id: 'gp', label: 'Gold' }],
        }),
        systemWithCurrency('smithing', {
          enabled: false,
          units: [{ id: 'sp', label: 'Silver' }],
        }),
      ],
      currencyConfig: {},
    });

    assert.deepEqual(
      result.currencyConfig.units.map((unit) => unit.id),
      ['gp', 'sp'],
      "a disabled system's units are still lifted: its recipes may reference them"
    );
    assert.deepEqual(result.systems[0].requirements.currency, { enabled: true });
    assert.deepEqual(result.systems[1].requirements.currency, { enabled: false });
  });

  it('is idempotent: a populated world ladder is authoritative and never re-merged', () => {
    // The GM has since deleted `sp`. Re-running must not resurrect it from the stale system block.
    const systems = [
      systemWithCurrency('alchemy', {
        enabled: true,
        units: [{ id: 'gp', label: 'Gold' }, { id: 'sp', label: 'Silver' }],
      }),
    ];
    const once = migrateCurrencyToWorldScope({ systems, currencyConfig: {} });
    const edited = { ...once.currencyConfig, units: [{ id: 'gp', label: 'Gold' }] };

    const twice = migrateCurrencyToWorldScope({ systems, currencyConfig: edited });
    assert.deepEqual(
      twice.currencyConfig.units.map((unit) => unit.id),
      ['gp'],
      'the deleted unit must not come back'
    );
  });

  it('re-running over already-shrunk systems changes nothing', () => {
    const first = migrateCurrencyToWorldScope({
      systems: [systemWithCurrency('alchemy', { enabled: true, units: [{ id: 'gp' }] })],
      currencyConfig: {},
    });
    const second = migrateCurrencyToWorldScope({
      systems: first.systems,
      currencyConfig: first.currencyConfig,
    });

    assert.deepEqual(second.systems, first.systems);
    assert.deepEqual(second.currencyConfig, first.currencyConfig);
  });

  it('returns the STORED config object when there was nothing to lift', () => {
    // The runner detects change by JSON comparison, so emitting a freshly-built `{ units: [] }`
    // over a stored `{}` would register as a change and write the setting in every world that
    // never used currency — an unexplained write in an otherwise no-op upgrade.
    const stored = {};
    const result = migrateCurrencyToWorldScope({
      systems: [{ id: 'alchemy', requirements: { time: { enabled: false } } }],
      currencyConfig: stored,
    });

    assert.equal(result.currencyConfig, stored);
    assert.deepEqual(JSON.parse(JSON.stringify(result.currencyConfig)), {});
  });

  it('still lifts scalars when a system configured a strategy but authored no units', () => {
    const result = migrateCurrencyToWorldScope({
      systems: [systemWithCurrency('alchemy', { enabled: true, spendStrategy: 'macro' })],
      currencyConfig: {},
    });
    assert.equal(result.currencyConfig.spendStrategy, 'macro');
  });

  it('never throws on absent or malformed input', () => {
    assert.deepEqual(migrateCurrencyToWorldScope(), { systems: [], currencyConfig: {} });
    assert.deepEqual(migrateCurrencyToWorldScope({ systems: 'nope', currencyConfig: 'nope' }), {
      systems: [],
      currencyConfig: {},
    });
  });
});
