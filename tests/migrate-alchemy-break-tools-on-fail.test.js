/**
 * Issue 2100 (maintainer ruling) — 1.35.0: stamp the old always-break alchemy default onto every
 * existing alchemy system so `breakToolsOnFail` genuinely gating alchemy breakage does not
 * silently change what an existing brew does on a failed check.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateAlchemyBreakToolsOnFail, applyAlchemyBreakToolsOnFailDefault } = await import(
  '../src/migration/migrateAlchemyBreakToolsOnFail.js'
);
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');
const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');
const { FABRICATE_EXPORT_SCHEMA_VERSION } = await import('../src/systems/authoringExport.js');

const FIELD = 'breakToolsOnFail';

function alchemySystem(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Alchemy Lab',
    resolutionMode: 'alchemy',
    alchemy: { checkMode: 'simple' },
    craftingCheck: { simple: { rollFormula: '1d20', dc: 15 } },
    ...overrides,
  };
}

function craftingSystem(overrides = {}) {
  return {
    id: 'sys-2',
    name: 'Blacksmithing',
    resolutionMode: 'simple',
    craftingCheck: { simple: { rollFormula: '1d20', dc: 15 } },
    ...overrides,
  };
}

function consumption(system) {
  return system.craftingCheck?.consumption;
}

// Stamp: unset → true

test('1.35.0 stamps breakToolsOnFail = true onto an alchemy system with no explicit value', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({ systems: [alchemySystem()] });
  assert.equal(consumption(systems[0])[FIELD], true);
});

test('1.35.0 stamps a checkMode: tiered alchemy system too', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({
    systems: [alchemySystem({ alchemy: { checkMode: 'tiered' } })],
  });
  assert.equal(consumption(systems[0])[FIELD], true);
});

test('1.35.0 seeds craftingCheck itself when the system has no craftingCheck block at all', () => {
  const { craftingCheck: _unused, ...withoutCraftingCheck } = alchemySystem();
  const { systems } = migrateAlchemyBreakToolsOnFail({ systems: [withoutCraftingCheck] });
  assert.equal(consumption(systems[0])[FIELD], true);
});

test('1.35.0 seeds craftingCheck.consumption when the system has neither', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({
    systems: [alchemySystem({ craftingCheck: { simple: { rollFormula: '1d20', dc: 15 } } })],
  });
  assert.equal(consumption(systems[0])[FIELD], true);
});

// An explicit value, true OR false, is left exactly as authored

test('1.35.0 leaves an explicit false alone', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({
    systems: [alchemySystem({ craftingCheck: { consumption: { [FIELD]: false } } })],
  });
  assert.equal(consumption(systems[0])[FIELD], false);
});

test('1.35.0 leaves an explicit true alone (no-op, not a re-write)', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({
    systems: [alchemySystem({ craftingCheck: { consumption: { [FIELD]: true } } })],
  });
  assert.equal(consumption(systems[0])[FIELD], true);
});

// A non-alchemy system is untouched, whether or not it carries a consumption block

test('1.35.0 leaves a non-alchemy system alone', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({ systems: [craftingSystem()] });
  assert.equal(
    Object.hasOwn(systems[0].craftingCheck, 'consumption'),
    false,
    'no consumption block is seeded for a system this migration does not target'
  );
});

test('1.35.0 leaves a non-alchemy system\'s own explicit false as it was', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({
    systems: [craftingSystem({ craftingCheck: { consumption: { [FIELD]: false } } })],
  });
  assert.equal(consumption(systems[0])[FIELD], false);
});

// A system whose resolutionMode moved away from alchemy but still carries an alchemy checkMode
// config is still treated as an alchemy system, per the ruling.

test('1.35.0 still stamps a system no longer on resolutionMode alchemy but with a live checkMode', () => {
  const { systems } = migrateAlchemyBreakToolsOnFail({
    systems: [alchemySystem({ resolutionMode: 'simple', alchemy: { checkMode: 'simple' } })],
  });
  assert.equal(consumption(systems[0])[FIELD], true);
});

test('1.35.0 still stamps an alchemy-resolutionMode system whose checkMode is none', () => {
  // checkMode "none" never runs a check, so the field is inert today, but the system is still
  // "alchemy enabled" and a GM can flip checkMode to simple/tiered later without re-running any
  // migration, so the stamp is written defensively rather than only when a check is reachable.
  const { systems } = migrateAlchemyBreakToolsOnFail({
    systems: [alchemySystem({ alchemy: { checkMode: 'none' } })],
  });
  assert.equal(consumption(systems[0])[FIELD], true);
});

// Purity and idempotence

test('1.35.0 is pure — the input payload is never touched', () => {
  const input = { systems: [alchemySystem()] };
  const before = structuredClone(input);
  const result = migrateAlchemyBreakToolsOnFail(input);
  assert.deepEqual(input, before, 'the runner payload is untouched');
  assert.notEqual(result.systems, input.systems, 'the returned array is a clone');
  assert.equal(consumption(result.systems[0])[FIELD], true, 'and the clone WAS stamped');
});

test('1.35.0 is idempotent under re-run', () => {
  const input = {
    systems: [
      alchemySystem(),
      craftingSystem(),
      alchemySystem({ id: 'sys-3', craftingCheck: { consumption: { [FIELD]: false } } }),
    ],
  };
  const once = migrateAlchemyBreakToolsOnFail(input);
  const twice = migrateAlchemyBreakToolsOnFail(once);
  assert.deepEqual(twice, once, 'a second pass finds every affected system stamped and changes nothing');
});

test('1.35.0 tolerates malformed payloads without throwing', () => {
  for (const data of [
    undefined,
    {},
    { systems: null },
    { systems: 'nope' },
    { systems: [null, 'x', 7, [], { craftingCheck: 'nope' }] },
  ]) {
    assert.doesNotThrow(() => migrateAlchemyBreakToolsOnFail(data), JSON.stringify(data));
  }
  assert.equal(migrateAlchemyBreakToolsOnFail({ systems: 'nope' }).systems, 'nope');
});

test('applyAlchemyBreakToolsOnFailDefault is the shared per-system transform', () => {
  const target = alchemySystem();
  applyAlchemyBreakToolsOnFailDefault(target);
  assert.equal(consumption(target)[FIELD], true, 'it mutates the structure it is handed');
  for (const junk of [null, undefined, 'nope', 7, [], { craftingCheck: 'nope' }]) {
    assert.doesNotThrow(() => applyAlchemyBreakToolsOnFailDefault(junk), JSON.stringify(junk));
  }
});

// Runner registration

test('the 1.35.0 registry entry carries a lossless downgradeTo target', () => {
  const runner = new MigrationRunner({ getSetting: () => undefined, setSetting: async () => {} });
  const entry = runner._migrations.find((migration) => migration.version === '1.35.0');
  assert.ok(entry, '1.35.0 is registered');
  assert.equal(
    entry.downgradeTo,
    '1.34.0',
    'the pre-change build never read breakToolsOnFail for alchemy, so the stamped value is inert'
  );
});

test('the runner applies 1.35.0 to craftingSystems and bumps the migration version', async () => {
  const store = new Map([
    ['migrationVersion', '1.34.0'],
    ['craftingSystems', [alchemySystem()]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.aborted, false);
  assert.equal(store.get('migrationVersion'), '1.35.0');
  assert.equal(consumption(store.get('craftingSystems')[0])[FIELD], true);
});

test('the runner does not re-run 1.35.0 once the world is at that version', async () => {
  const store = new Map([
    ['migrationVersion', '1.35.0'],
    ['craftingSystems', [alchemySystem()]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.ran, 0);
  assert.equal(
    consumption(store.get('craftingSystems')[0]),
    undefined,
    'the gate holds: this world was never touched by 1.35.0 in this test, so nothing was stamped'
  );
});

// The import-side mirror — branch-INDEPENDENT, same as `deriveMaxModifierPicks`

function bundle(overrides = {}) {
  return {
    fabricateVersion: '1.5.0',
    system: alchemySystem(),
    recipes: [],
    ...overrides,
  };
}

test('migrateExportPayload stamps the default on a payload ALREADY at the current schema', () => {
  const current = bundle({ schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION });
  const migrated = migrateExportPayload(current);
  assert.equal(consumption(migrated.system)[FIELD], true);
  assert.equal(
    Object.hasOwn(current.system.craftingCheck, 'consumption'),
    false,
    'the caller’s payload is not aliased or mutated'
  );
});

test('migrateExportPayload stamps the default on a LEGACY schema-1 payload too', () => {
  const migrated = migrateExportPayload(bundle());
  assert.equal(migrated.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
  assert.equal(consumption(migrated.system)[FIELD], true);
});

test('migrateExportPayload preserves an AUTHORED false through the import', () => {
  const migrated = migrateExportPayload(
    bundle({
      schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
      system: alchemySystem({ craftingCheck: { consumption: { [FIELD]: false } } }),
    })
  );
  assert.equal(consumption(migrated.system)[FIELD], false);
});

test('migrateExportPayload leaves a non-alchemy bundle without a consumption block', () => {
  const migrated = migrateExportPayload(
    bundle({ schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION, system: craftingSystem() })
  );
  assert.equal(Object.hasOwn(migrated.system.craftingCheck, 'consumption'), false);
});

test('migrateExportPayload is idempotent over the default derivation', () => {
  const once = migrateExportPayload(bundle());
  assert.deepEqual(migrateExportPayload(once), once);
});
