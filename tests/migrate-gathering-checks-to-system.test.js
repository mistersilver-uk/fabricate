import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateGatheringChecksToSystem } from '../src/migration/migrateGatheringChecksToSystem.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

// ---------------------------------------------------------------------------
// Pure function
// ---------------------------------------------------------------------------

function configWith(systemId, tasks) {
  return { systems: { [systemId]: { tasks } } };
}

test('seeds the system gathering check from the first task with a check formula', () => {
  const systems = [{ id: 'sys-1' }];
  const config = configWith('sys-1', [
    { id: 't0', check: { formula: '' } },
    { id: 't1', check: { formula: '1d20 + @skills.sur.mod' }, progressive: { awardMode: 'exceed' } },
    { id: 't2', check: { formula: '1d20 + 5' }, progressive: { awardMode: 'partial' } },
  ]);

  const result = migrateGatheringChecksToSystem(systems, config);

  assert.equal(result.seededCount, 1);
  const check = result.systems[0].gatheringCraftingCheck;
  assert.equal(check.enabled, true);
  assert.equal(check.progressive.rollFormula, '1d20 + @skills.sur.mod', 'first non-empty formula wins');
  assert.equal(check.progressive.awardMode, 'exceed', 'award mode comes from the defining task');
  // Routed is intentionally not seeded.
  assert.equal(check.routed, undefined);
});

test('defaults the award mode to "equal" when the defining task has none/invalid', () => {
  const systems = [{ id: 'sys-1' }];
  const config = configWith('sys-1', [{ id: 't1', check: { formula: '2d6' } }]);

  const result = migrateGatheringChecksToSystem(systems, config);

  assert.equal(result.systems[0].gatheringCraftingCheck.progressive.awardMode, 'equal');
});

test('leaves per-task gathering config untouched (only the system copy is written)', () => {
  const systems = [{ id: 'sys-1' }];
  const config = configWith('sys-1', [
    { id: 't1', check: { formula: '1d20', threshold: '12' }, progressive: { awardMode: 'equal' }, resolutionMode: 'progressive', dcOverride: null },
  ]);

  const result = migrateGatheringChecksToSystem(systems, config);

  assert.deepEqual(result.gatheringConfig.systems['sys-1'].tasks[0], {
    id: 't1',
    check: { formula: '1d20', threshold: '12' },
    progressive: { awardMode: 'equal' },
    resolutionMode: 'progressive',
    dcOverride: null,
  });
});

test('is idempotent: a system already enabled is skipped, and a second run is a no-op', () => {
  const systems = [{ id: 'sys-1' }];
  const config = configWith('sys-1', [{ id: 't1', check: { formula: '1d20' } }]);

  const first = migrateGatheringChecksToSystem(systems, config);
  assert.equal(first.seededCount, 1);

  const second = migrateGatheringChecksToSystem(first.systems, first.gatheringConfig);
  assert.equal(second.seededCount, 0, 'an already-seeded (enabled) system is skipped');
});

test('skips a system that already carries a progressive roll formula', () => {
  const systems = [
    { id: 'sys-1', gatheringCraftingCheck: { progressive: { rollFormula: '1d20 + 3' } } },
  ];
  const config = configWith('sys-1', [{ id: 't1', check: { formula: '2d6' } }]);

  const result = migrateGatheringChecksToSystem(systems, config);

  assert.equal(result.seededCount, 0);
  assert.equal(result.systems[0].gatheringCraftingCheck.progressive.rollFormula, '1d20 + 3');
});

test('does not seed a system whose tasks have no check formula', () => {
  const systems = [{ id: 'sys-1' }];
  const config = configWith('sys-1', [
    { id: 't1', resolutionMode: 'routed', resultSelection: { provider: 'macroOutcome' } },
    { id: 't2', check: {} },
  ]);

  const result = migrateGatheringChecksToSystem(systems, config);

  assert.equal(result.seededCount, 0);
  assert.equal(result.systems[0].gatheringCraftingCheck, undefined);
});

test('a world with no gathering config is a no-op', () => {
  const systems = [{ id: 'sys-1' }];
  const result = migrateGatheringChecksToSystem(systems, {});
  assert.equal(result.seededCount, 0);
  assert.equal(result.systems[0].gatheringCraftingCheck, undefined);
});

test('tolerates non-array / nullish input', () => {
  assert.equal(migrateGatheringChecksToSystem(null, null).seededCount, 0);
  assert.deepEqual(migrateGatheringChecksToSystem(undefined, undefined).systems, []);
});

test('seeds only the systems that have a defining task (multi-system)', () => {
  const systems = [{ id: 'sys-1' }, { id: 'sys-2' }];
  const config = {
    systems: {
      'sys-1': { tasks: [{ id: 't1', check: { formula: '1d20' } }] },
      'sys-2': { tasks: [{ id: 't2', check: { formula: '' } }] },
    },
  };

  const result = migrateGatheringChecksToSystem(systems, config);

  assert.equal(result.seededCount, 1);
  assert.equal(result.systems[0].gatheringCraftingCheck.progressive.rollFormula, '1d20');
  assert.equal(result.systems[1].gatheringCraftingCheck, undefined, 'a system with no defining task is left alone');
});

test('preserves an existing (not-yet-enabled) sibling check config when seeding', () => {
  const systems = [
    {
      id: 'sys-1',
      gatheringCraftingCheck: {
        enabled: false,
        progressive: { allowPlayerReorder: true, rollFormula: '' },
        routed: { rollFormula: '1d20', relativeOutcomes: [{ id: 'o', name: 'Find', success: true, dc: 0 }] },
      },
    },
  ];
  const config = configWith('sys-1', [
    { id: 't1', check: { formula: '2d6' }, progressive: { awardMode: 'partial' } },
  ]);

  const result = migrateGatheringChecksToSystem(systems, config);

  assert.equal(result.seededCount, 1);
  const check = result.systems[0].gatheringCraftingCheck;
  assert.equal(check.enabled, true);
  assert.equal(check.progressive.rollFormula, '2d6');
  assert.equal(check.progressive.awardMode, 'partial');
  assert.equal(check.progressive.allowPlayerReorder, true, 'pre-existing progressive field preserved');
  assert.equal(check.routed.relativeOutcomes[0].name, 'Find', 'pre-existing routed sibling preserved');
});

// ---------------------------------------------------------------------------
// MigrationRunner integration
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(Object.entries(initial));
  const calls = { set: [] };
  return {
    store,
    calls,
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => {
      calls.set.push({ key, value });
      store.set(key, value);
    },
  };
}

test('1.5.0 runs from 1.4.0, seeds the system gathering check, and bumps the version', async () => {
  const settings = makeSettings({
    migrationVersion: '1.4.0',
    craftingSystems: [{ id: 'sys-1' }],
    gatheringConfig: configWith('sys-1', [
      { id: 't1', check: { formula: '1d20 + @abilities.wis.mod' }, progressive: { awardMode: 'partial' } },
    ]),
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  await runner.run();

  const systems = settings.store.get('craftingSystems');
  assert.equal(systems[0].gatheringCraftingCheck.enabled, true);
  assert.equal(systems[0].gatheringCraftingCheck.progressive.rollFormula, '1d20 + @abilities.wis.mod');
  assert.equal(systems[0].gatheringCraftingCheck.progressive.awardMode, 'partial');
  assert.equal(settings.store.get('migrationVersion'), '1.6.0');
});

test('version gate: 1.5.0 is NOT re-applied when migrationVersion is already 1.5.0', async () => {
  const settings = makeSettings({
    migrationVersion: '1.5.0',
    craftingSystems: [{ id: 'sys-1' }],
    gatheringConfig: configWith('sys-1', [{ id: 't1', check: { formula: '1d20' } }]),
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  await runner.run();

  const systems = settings.store.get('craftingSystems');
  assert.equal(systems[0].gatheringCraftingCheck, undefined, 'no seeding when the gate blocks the run');
  const setKeys = settings.calls.set.map((c) => c.key);
  assert.ok(!setKeys.includes('craftingSystems'), 'craftingSystems not persisted');
});
