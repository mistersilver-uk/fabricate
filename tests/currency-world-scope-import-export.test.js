/**
 * The two halves of carrying the WORLD currency ladder through an export/import round trip
 * (issue 1278), and the pre-v3 upcast that reads a legacy per-system export.
 *
 * Both are decisions rather than mechanics, which is why they are pinned here:
 *
 *   - **Import merges, it never replaces.** Currency is world scope, so an imported system's
 *     ladder cannot simply overwrite one the destination GM authored for unrelated systems.
 *     Units merge by id with the DESTINATION winning a collision, which is also what makes an
 *     import safe to run twice and keeps existing recipe currency costs resolving to the units
 *     their author meant.
 *   - **The upcast is branch-independent.** `migrateExportPayload` early-returns once
 *     `schemaVersion` is current, so a derivation written only on the main path silently never
 *     runs for a current-schema payload that still carries the legacy shape.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { CompendiumImporter } from '../src/systems/CompendiumImporter.js';
import { buildExportPayload } from '../src/systems/CraftingSystemExporter.js';
import { migrateExportPayload } from '../src/migration/migrateExportPayload.js';
import { FABRICATE_EXPORT_SCHEMA_VERSION } from '../src/systems/authoringExport.js';

function importerOver(seedCurrencyConfig) {
  const settings = { currencyConfig: seedCurrencyConfig };
  // Seams are the THIRD constructor argument; the currency merge touches neither manager.
  const importer = new CompendiumImporter(null, null, {
    getSetting: (key) => settings[key],
    setSetting: async (key, value) => {
      settings[key] = value;
    },
  });
  return { importer, settings };
}

describe('importing the world currency config', () => {
  it('seeds an unconfigured world with the whole incoming config', async () => {
    const { importer, settings } = importerOver(undefined);
    await importer._persistCurrencyConfig({
      spendStrategy: 'macro',
      providerId: 'pf2e-inventory',
      macros: { canAfford: 'Macro.can', increment: '', decrement: '' },
      units: [{ id: 'gp', label: 'Gold' }],
    });

    assert.deepEqual(
      settings.currencyConfig.units.map((unit) => unit.id),
      ['gp']
    );
    assert.equal(settings.currencyConfig.spendStrategy, 'macro');
    assert.equal(settings.currencyConfig.providerId, 'pf2e-inventory');
    assert.equal(settings.currencyConfig.macros.canAfford, 'Macro.can');
  });

  it('appends only genuinely new denominations — the DESTINATION wins an id collision', async () => {
    const { importer, settings } = importerOver({
      spendStrategy: 'actorProperty',
      units: [{ id: 'gp', label: 'Gold', actorPath: 'system.currency.gp' }],
    });
    await importer._persistCurrencyConfig({
      spendStrategy: 'macro',
      units: [
        { id: 'gp', label: 'Gulden', actorPath: 'system.purse.gulden' },
        { id: 'sp', label: 'Silver' },
      ],
    });

    assert.deepEqual(
      settings.currencyConfig.units.map((unit) => unit.id),
      ['gp', 'sp']
    );
    assert.equal(
      settings.currencyConfig.units[0].label,
      'Gold',
      "the destination's own definition survives, so its recipes keep resolving"
    );
  });

  it('never overrules an already-configured world about how actors store coins', async () => {
    const { importer, settings } = importerOver({
      spendStrategy: 'actorProperty',
      providerId: '',
      units: [{ id: 'gp', label: 'Gold' }],
    });
    await importer._persistCurrencyConfig({
      spendStrategy: 'macro',
      providerId: 'pf2e-inventory',
      macros: { canAfford: 'Macro.can', increment: '', decrement: '' },
      units: [{ id: 'sp', label: 'Silver' }],
    });

    assert.equal(settings.currencyConfig.spendStrategy, 'actorProperty');
    assert.equal(settings.currencyConfig.providerId, '');
    assert.equal(settings.currencyConfig.macros, undefined);
  });

  it('is idempotent: re-importing the same pack writes nothing new', async () => {
    const { importer, settings } = importerOver({ units: [{ id: 'gp', label: 'Gold' }] });
    const incoming = { units: [{ id: 'gp', label: 'Gold' }] };

    await importer._persistCurrencyConfig(incoming);
    const first = structuredClone(settings.currencyConfig);
    await importer._persistCurrencyConfig(incoming);

    assert.deepEqual(settings.currencyConfig, first);
  });

  it('does nothing for a pack carrying no currency slice at all', async () => {
    const { importer, settings } = importerOver({ units: [{ id: 'gp' }] });
    await importer._persistCurrencyConfig(undefined);
    await importer._persistCurrencyConfig({});
    await importer._persistCurrencyConfig({ units: [] });

    assert.deepEqual(
      settings.currencyConfig.units.map((unit) => unit.id),
      ['gp']
    );
  });

  it('deep-copies incoming units, so the persisted config cannot alias the pack payload', async () => {
    const { importer, settings } = importerOver({ units: [] });
    const incoming = { units: [{ id: 'gp', label: 'Gold', contains: [] }] };
    await importer._persistCurrencyConfig(incoming);
    incoming.units[0].label = 'Mutated';

    assert.equal(settings.currencyConfig.units[0].label, 'Gold');
  });
});

describe('upcasting a legacy export payload', () => {
  const legacySystem = () => ({
    id: 'alchemy',
    name: 'Alchemy',
    requirements: {
      currency: {
        enabled: true,
        spendStrategy: 'macro',
        units: [{ id: 'gp', label: 'Gold' }],
      },
    },
  });

  it('hoists a pre-v3 payload’s per-system currency into the envelope', () => {
    const migrated = migrateExportPayload({ schemaVersion: 2, system: legacySystem() });

    assert.equal(migrated.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
    assert.deepEqual(
      migrated.currencyConfig.units.map((unit) => unit.id),
      ['gp']
    );
    assert.equal(migrated.currencyConfig.spendStrategy, 'macro');
    assert.deepEqual(
      migrated.system.requirements.currency,
      { enabled: true },
      'the system is left carrying participation alone'
    );
  });

  it('runs on the CURRENT-schema branch too, which early-returns before the main path', () => {
    // The trap this guards: a hand-authored or force-stamped payload can claim the current
    // schema while still carrying the legacy shape. A derivation written only after the
    // early return would silently never run for it.
    const payload = { schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION, system: legacySystem() };
    const migrated = migrateExportPayload(payload);

    assert.deepEqual(
      migrated.currencyConfig.units.map((unit) => unit.id),
      ['gp']
    );
    assert.deepEqual(migrated.system.requirements.currency, { enabled: true });
  });

  it('leaves an envelope that already carries a ladder alone', () => {
    const migrated = migrateExportPayload({
      schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
      system: legacySystem(),
      currencyConfig: { units: [{ id: 'authored', label: 'Authored' }] },
    });

    assert.deepEqual(
      migrated.currencyConfig.units.map((unit) => unit.id),
      ['authored']
    );
  });

  it('does not alias the input payload', () => {
    const payload = { schemaVersion: 2, system: legacySystem() };
    const migrated = migrateExportPayload(payload);
    migrated.system.requirements.currency.enabled = false;

    assert.equal(payload.system.requirements.currency.enabled, true);
  });
});

describe('the export/import round trip carries the ladder into a fresh world', () => {
  // The acceptance criterion issue 1278 states outright. It is asserted end to end rather than
  // as a call-shape guard because every parameter of `buildExportPayload` after `version` is
  // defaulted: a dropped argument produces an export that is silently empty, not one that throws.
  const worldLadder = {
    spendStrategy: 'actorProperty',
    providerId: '',
    macros: { canAfford: '', increment: '', decrement: '' },
    units: [
      { id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp' },
      { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp' },
    ],
  };

  function exportedEnvelope() {
    return buildExportPayload(
      { id: 'alchemy', name: 'Alchemy', requirements: { currency: { enabled: true } } },
      [],
      '1.26.0',
      [],
      {},
      worldLadder
    );
  }

  it('stamps the current schema and carries the world ladder in the envelope', () => {
    const envelope = exportedEnvelope();

    assert.equal(envelope.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
    assert.deepEqual(
      envelope.currencyConfig.units.map((unit) => unit.id),
      ['gp', 'sp'],
      'an export that carried an empty ladder would land every currency cost as an unresolvable id'
    );
  });

  it('lands the ladder in a fresh world, so an authored cost still resolves to a label', async () => {
    const envelope = exportedEnvelope();
    const { importer, settings } = importerOver(undefined);
    await importer._persistCurrencyConfig(envelope.currencyConfig);

    assert.deepEqual(
      settings.currencyConfig.units.map((unit) => unit.id),
      ['gp', 'sp']
    );
    assert.equal(
      settings.currencyConfig.units.find((unit) => unit.id === 'gp').label,
      'Gold',
      'the label a recipe cost renders is what came across'
    );
  });
});
