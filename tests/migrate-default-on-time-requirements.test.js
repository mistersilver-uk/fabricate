/**
 * Issue 714 — 1.19.0 default-on backfill for the recipe time requirement.
 *
 * The pre-toggle normalizer coerced `enabled: time.enabled === true` and `save()` persists
 * the normalized systems, so every system saved while the requirements block was live carries
 * `requirements.time.enabled: false` in STORAGE. The 714 reader flips to default-on, under
 * which that persisted literal `false` reads as a deliberate disable — the opposite of the
 * decision. This migration deletes the persisted `false` once so it re-defaults on.
 *
 * Covers the targeted delete, the conservative scope (only literal false), idempotency,
 * malformed-payload tolerance, the deliberate no-seed, and the runner registration + gate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateDefaultOnTimeRequirements } = await import(
  '../src/migration/migrateDefaultOnTimeRequirements.js'
);
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');

// ---------------------------------------------------------------------------
// The delete — a persisted `false` re-defaults on
// ---------------------------------------------------------------------------

test('1.19.0 deletes a persisted requirements.time.enabled === false', () => {
  const { systems } = migrateDefaultOnTimeRequirements([
    { id: 'sys', requirements: { time: { enabled: false }, currency: { enabled: true } } },
  ]);
  assert.ok(!('enabled' in systems[0].requirements.time), 'the persisted false is removed');
  // A sibling requirements block is untouched — this is a targeted delete, not a rebuild.
  assert.equal(systems[0].requirements.currency.enabled, true);
});

test('1.19.0 leaves a persisted `true` in place (honoured, never coerced by the old normalizer)', () => {
  const { systems } = migrateDefaultOnTimeRequirements([
    { id: 'sys', requirements: { time: { enabled: true } } },
  ]);
  assert.equal(systems[0].requirements.time.enabled, true);
});

test('1.19.0 leaves an absent flag absent (already default-on under the 714 reader)', () => {
  const { systems } = migrateDefaultOnTimeRequirements([
    { id: 'sys', requirements: { time: {} } },
  ]);
  assert.ok(!('enabled' in systems[0].requirements.time));
});

test('1.19.0 mutates in place and returns the same systems array', () => {
  const input = [{ id: 'sys', requirements: { time: { enabled: false } } }];
  const { systems } = migrateDefaultOnTimeRequirements(input);
  assert.equal(systems, input, 'the input array is returned by identity');
  assert.ok(!('enabled' in input[0].requirements.time));
});

test('1.19.0 is idempotent — a second run is a no-op', () => {
  const first = migrateDefaultOnTimeRequirements([
    { id: 'sys', requirements: { time: { enabled: false }, currency: { enabled: false } } },
  ]);
  const second = migrateDefaultOnTimeRequirements(first.systems);
  assert.deepEqual(second.systems, [
    { id: 'sys', requirements: { time: {}, currency: { enabled: false } } },
  ]);
});

// ---------------------------------------------------------------------------
// Never throws — every level is guarded
// ---------------------------------------------------------------------------

test('1.19.0 tolerates malformed payloads without throwing', () => {
  assert.deepEqual(migrateDefaultOnTimeRequirements(undefined), { systems: [] });
  assert.deepEqual(migrateDefaultOnTimeRequirements(null), { systems: [] });
  assert.deepEqual(migrateDefaultOnTimeRequirements('not-an-array'), { systems: [] });

  const { systems } = migrateDefaultOnTimeRequirements([
    null,
    'not-an-object',
    { id: 'no-requirements' },
    { id: 'requirements-not-an-object', requirements: 'nope' },
    { id: 'time-not-an-object', requirements: { time: 'nope' } },
    { id: 'time-absent', requirements: { currency: { enabled: true } } },
  ]);
  assert.equal(systems.length, 6, 'malformed entries are skipped, not dropped or repaired');
  assert.equal(systems[3].requirements, 'nope', 'a malformed requirements is left exactly as found');
  assert.equal(systems[4].requirements.time, 'nope');
});

// ---------------------------------------------------------------------------
// Runner registration + version gate
// ---------------------------------------------------------------------------

test('the runner applies 1.19.0 and bumps the migration version', async () => {
  const store = new Map([
    // Start at 1.18.0 so this fixture measures only the 1.19.0 pass.
    ['migrationVersion', '1.18.0'],
    ['craftingSystems', [{ id: 'sys', requirements: { time: { enabled: false } } }]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (k) => store.get(k),
    setSetting: async (k, v) => store.set(k, v),
  });

  const result = await runner.run();

  assert.equal(result.aborted, false);
  assert.equal(store.get('migrationVersion'), '1.19.0');
  assert.ok(!('enabled' in store.get('craftingSystems')[0].requirements.time));
});

test('1.19.0 is version-gated — a later deliberate opt-out is NOT flipped back on', async () => {
  // The gate is the whole point: once the world is at 1.19.0, a GM who turns the new toggle
  // OFF (persisting a deliberate `false` under 714) must keep it off across reloads.
  const store = new Map([
    ['migrationVersion', '1.19.0'],
    ['craftingSystems', [{ id: 'sys', requirements: { time: { enabled: false } } }]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (k) => store.get(k),
    setSetting: async (k, v) => store.set(k, v),
  });

  const result = await runner.run();

  assert.equal(result.ran, 0);
  assert.equal(
    store.get('craftingSystems')[0].requirements.time.enabled,
    false,
    'the gate holds: an already-migrated deliberate opt-out survives'
  );
});

test('the 1.19.0 registry entry carries a downgradeTo target', () => {
  const runner = new MigrationRunner({ getSetting: () => undefined, setSetting: async () => {} });
  const entry = runner._migrations.find((m) => m.version === '1.19.0');
  assert.ok(entry, '1.19.0 is registered');
  assert.equal(entry.downgradeTo, '1.18.0');
});
