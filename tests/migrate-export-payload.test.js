/**
 * Q2 — migrateExportPayload idempotency + legacy upcast.
 *
 * A legacy (schema 1) export `{ fabricateVersion, system, recipes }` upcasts to
 * schema 2 with the gathering-authoring fields; the migrator is idempotent:
 *   - migrate(migrate(v1)) deep-equals migrate(v1)
 *   - migrate(v2) is a no-op
 */

import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');
const { FABRICATE_EXPORT_SCHEMA_VERSION } = await import('../src/systems/authoringExport.js');

function legacyPayload() {
  return {
    fabricateVersion: '1.5.0',
    exportedAt: '2024-01-01T00:00:00.000Z',
    system: { id: 'sys-1', name: 'Legacy System', components: [] },
    recipes: [{ id: 'r1', name: 'Legacy Recipe', craftingSystemId: '__SYSTEM_ID__' }],
  };
}

test('migrate: upcasts a legacy schema-1 payload to schema 2', () => {
  const migrated = migrateExportPayload(legacyPayload());

  assert.equal(migrated.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
  assert.equal(migrated.runtimeStateIncluded, false);
  assert.deepEqual(migrated.gatheringEnvironments, []);
  assert.deepEqual(migrated.gatheringConfig, { system: {}, shared: {} });
  // Original authoring data preserved.
  assert.equal(migrated.system.name, 'Legacy System');
  assert.equal(migrated.recipes[0].id, 'r1');
});

test('migrate: is idempotent — migrate(migrate(v1)) equals migrate(v1)', () => {
  const once = migrateExportPayload(legacyPayload());
  const twice = migrateExportPayload(once);
  assert.deepEqual(twice, once);
});

test('migrate: migrate(v2) is a no-op', () => {
  const v2 = migrateExportPayload(legacyPayload());
  const again = migrateExportPayload(v2);
  assert.deepEqual(again, v2);
});

test('migrate: does not mutate its input', () => {
  const input = legacyPayload();
  migrateExportPayload(input);
  assert.equal(input.schemaVersion, undefined, 'input must stay a legacy payload');
});

test('migrate: reads a hand-authored system.gatheringConfig defensively', () => {
  const legacy = legacyPayload();
  legacy.system.gatheringConfig = { system: { rules: { rewardLimit: 2 } }, shared: {} };
  const migrated = migrateExportPayload(legacy);
  assert.deepEqual(migrated.gatheringConfig, { system: { rules: { rewardLimit: 2 } }, shared: {} });
});

test('migrate: passes through non-object input unchanged', () => {
  assert.equal(migrateExportPayload(null), null);
  assert.equal(migrateExportPayload('nope'), 'nope');
});
