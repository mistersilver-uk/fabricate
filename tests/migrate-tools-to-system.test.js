/**
 * Tests for the 0.7.0 tool-reconciliation migration
 * (src/migration/migrateToolsToSystem.js).
 *
 * Moves UI-authored library tools from gatheringConfig.systems[id].tools onto the
 * owning crafting system's `tools` (the single canonical source), dedupes by id
 * (existing system tool wins), clears the gathering-config copy, and is pure +
 * idempotent + version-gated through the MigrationRunner.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateToolsToSystem } from '../src/migration/migrateToolsToSystem.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

test('moves gatheringConfig-only tools onto the matching system and clears the config copy', () => {
  const systems = [{ id: 'sys-1', tools: [] }];
  const gatheringConfig = {
    systems: {
      'sys-1': { tasks: [], tools: [{ id: 't1', componentId: 'axe' }, { id: 't2', componentId: 'saw' }] }
    }
  };
  const result = migrateToolsToSystem(systems, gatheringConfig);
  assert.equal(result.movedCount, 2);
  assert.deepEqual(result.systems[0].tools.map(t => t.id), ['t1', 't2']);
  assert.equal('tools' in result.gatheringConfig.systems['sys-1'], false, 'config tools copy cleared');
  assert.deepEqual(result.gatheringConfig.systems['sys-1'].tasks, [], 'other config keys preserved');
});

test('creates system.tools when the system has no tools array yet', () => {
  const systems = [{ id: 'sys-1' }];
  const gatheringConfig = { systems: { 'sys-1': { tools: [{ id: 't1', componentId: 'axe' }] } } };
  const result = migrateToolsToSystem(systems, gatheringConfig);
  assert.deepEqual(result.systems[0].tools.map(t => t.id), ['t1']);
  assert.equal('tools' in result.gatheringConfig.systems['sys-1'], false);
});

test('dedupes on id collision: the existing system tool wins, the config copy is dropped', () => {
  const systems = [{ id: 'sys-1', tools: [{ id: 't1', componentId: 'system-axe' }] }];
  const gatheringConfig = {
    systems: { 'sys-1': { tools: [{ id: 't1', componentId: 'config-axe' }, { id: 't2', componentId: 'saw' }] } }
  };
  const result = migrateToolsToSystem(systems, gatheringConfig);
  // t1 keeps the system's componentId; only t2 is added.
  assert.equal(result.movedCount, 1);
  assert.deepEqual(result.systems[0].tools.map(t => t.id), ['t1', 't2']);
  assert.equal(result.systems[0].tools.find(t => t.id === 't1').componentId, 'system-axe');
  assert.equal('tools' in result.gatheringConfig.systems['sys-1'], false);
});

test('skips config tools without an id and tools for an unknown system (orphan-preserve)', () => {
  const systems = [{ id: 'sys-1', tools: [] }];
  const gatheringConfig = {
    systems: {
      'sys-1': { tools: [{ componentId: 'no-id' }, { id: 't1', componentId: 'axe' }] },
      'sys-missing': { tools: [{ id: 'orphan', componentId: 'x' }] }
    }
  };
  const result = migrateToolsToSystem(systems, gatheringConfig);
  assert.equal(result.movedCount, 1);
  assert.deepEqual(result.systems[0].tools.map(t => t.id), ['t1']);
  // The id-less config tool is skipped; with a moved tool the config copy is still cleared.
  assert.equal('tools' in result.gatheringConfig.systems['sys-1'], false);
  // Orphaned config tools (no matching system) are left in place, not dropped.
  assert.deepEqual(result.gatheringConfig.systems['sys-missing'].tools.map(t => t.id), ['orphan']);
});

test('is idempotent: a second run finds nothing to move', () => {
  const systems = [{ id: 'sys-1', tools: [] }];
  const gatheringConfig = { systems: { 'sys-1': { tools: [{ id: 't1', componentId: 'axe' }] } } };
  const first = migrateToolsToSystem(systems, gatheringConfig);
  const second = migrateToolsToSystem(first.systems, first.gatheringConfig);
  assert.equal(second.movedCount, 0);
  assert.deepEqual(second.systems[0].tools.map(t => t.id), ['t1']);
});

test('no-ops when there are no gathering-config systems', () => {
  const result = migrateToolsToSystem([{ id: 'sys-1', tools: [] }], {});
  assert.equal(result.movedCount, 0);
  assert.deepEqual(result.systems[0].tools, []);
});

// ---------------------------------------------------------------------------
// MigrationRunner integration (version gate + persistence)
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(Object.entries(initial));
  const calls = { set: [] };
  return {
    store,
    calls,
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => { calls.set.push({ key, value }); store.set(key, value); }
  };
}

test('0.7.0 runs from 0.6.0 and moves config tools onto the system, bumping the version', async () => {
  const settings = makeSettings({
    migrationVersion: '0.6.0',
    craftingSystems: [{ id: 'sys-1', tools: [] }],
    gatheringConfig: { systems: { 'sys-1': { tools: [{ id: 't1', componentId: 'axe' }] } } }
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  await runner.run();

  const systems = settings.store.get('craftingSystems');
  const config = settings.store.get('gatheringConfig');
  assert.deepEqual(systems[0].tools.map(t => t.id), ['t1']);
  assert.equal('tools' in config.systems['sys-1'], false);
  // The full runner also applies the later 0.8.0 economy-toggle and 0.9.0
  // region-unification migrations, so the version advances to the latest.
  assert.equal(settings.store.get('migrationVersion'), '1.17.0');
});

test('version gate: 0.7.0 is NOT re-applied when migrationVersion is already 0.7.0', async () => {
  const settings = makeSettings({
    migrationVersion: '0.7.0',
    craftingSystems: [{ id: 'sys-1', tools: [], visibilityMode: 'knowledge' }],
    gatheringConfig: { systems: { 'sys-1': { tools: [{ id: 't1', componentId: 'axe' }] } } }
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  await runner.run();

  // The 0.7.0 tool-reconciliation is gated out (config tools untouched). The
  // later 0.8.0 economy-toggle and 0.9.0 region-unification migrations are still
  // pending and run, but with no legacy economy `mode` and no region vocabulary
  // to rewrite they are data no-ops — only the version bumps.
  const config = settings.store.get('gatheringConfig');
  assert.ok('tools' in config.systems['sys-1'], 'config tools untouched when the 0.7.0 gate blocks the run');
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('craftingSystems'), 'craftingSystems not persisted');
  assert.ok(!setKeys.includes('gatheringConfig'), 'gatheringConfig not persisted (0.8.0/0.9.0 are data no-ops here)');
  assert.deepEqual(setKeys, ['migrationVersion'], 'only the version advances');
  assert.equal(settings.store.get('migrationVersion'), '1.17.0');
});
