/**
 * Issue 651 — 1.18.0 retirement of the system-level progressive `allowPlayerReorder`.
 *
 * Covers the strip across all three progressive check blocks, idempotency, tolerance of
 * malformed payloads, the deliberate no-seed decision, and the runner registration.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateRetireProgressiveAllowPlayerReorder } = await import(
  '../src/migration/migrateRetireProgressiveAllowPlayerReorder.js'
);
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');

// ---------------------------------------------------------------------------
// The strip — all three progressive blocks
// ---------------------------------------------------------------------------

test('1.18.0 strips allowPlayerReorder from all three progressive check blocks', () => {
  const { systems } = migrateRetireProgressiveAllowPlayerReorder([
    {
      id: 'sys',
      craftingCheck: { progressive: { awardMode: 'equal', allowPlayerReorder: true } },
      salvageCraftingCheck: { progressive: { awardMode: 'partial', allowPlayerReorder: false } },
      gatheringCraftingCheck: { progressive: { awardMode: 'exceed', allowPlayerReorder: true } },
    },
  ]);
  const sys = systems[0];
  assert.ok(!('allowPlayerReorder' in sys.craftingCheck.progressive));
  assert.ok(!('allowPlayerReorder' in sys.salvageCraftingCheck.progressive));
  assert.ok(!('allowPlayerReorder' in sys.gatheringCraftingCheck.progressive));
  // Siblings on the same object are untouched — this is a targeted delete, not a rebuild.
  assert.equal(sys.craftingCheck.progressive.awardMode, 'equal');
  assert.equal(sys.salvageCraftingCheck.progressive.awardMode, 'partial');
  assert.equal(sys.gatheringCraftingCheck.progressive.awardMode, 'exceed');
});

test('1.18.0 mutates in place and returns the same systems array', () => {
  const input = [{ id: 'sys', craftingCheck: { progressive: { allowPlayerReorder: true } } }];
  const { systems } = migrateRetireProgressiveAllowPlayerReorder(input);
  assert.equal(systems, input, 'the input array is returned by identity');
  assert.ok(!('allowPlayerReorder' in input[0].craftingCheck.progressive));
});

test('1.18.0 is idempotent — a second run is a no-op', () => {
  const first = migrateRetireProgressiveAllowPlayerReorder([
    { id: 'sys', craftingCheck: { progressive: { awardMode: 'equal', allowPlayerReorder: true } } },
  ]);
  const second = migrateRetireProgressiveAllowPlayerReorder(first.systems);
  assert.deepEqual(second.systems, [
    { id: 'sys', craftingCheck: { progressive: { awardMode: 'equal' } } },
  ]);
});

// ---------------------------------------------------------------------------
// Never throws — every level is guarded
// ---------------------------------------------------------------------------

test('1.18.0 tolerates malformed payloads without throwing', () => {
  assert.deepEqual(migrateRetireProgressiveAllowPlayerReorder(undefined), { systems: [] });
  assert.deepEqual(migrateRetireProgressiveAllowPlayerReorder(null), { systems: [] });
  assert.deepEqual(migrateRetireProgressiveAllowPlayerReorder('not-an-array'), { systems: [] });

  const { systems } = migrateRetireProgressiveAllowPlayerReorder([
    null,
    'not-an-object',
    { id: 'no-checks' },
    { id: 'check-not-an-object', craftingCheck: 'nope' },
    { id: 'progressive-not-an-object', salvageCraftingCheck: { progressive: 'nope' } },
    { id: 'progressive-absent', gatheringCraftingCheck: { enabled: true } },
  ]);
  assert.equal(systems.length, 6, 'malformed entries are skipped, not dropped or repaired');
  assert.equal(systems[3].craftingCheck, 'nope', 'a malformed check is left exactly as found');
  assert.equal(systems[4].salvageCraftingCheck.progressive, 'nope');
});

// ---------------------------------------------------------------------------
// The deliberate no-seed decision
// ---------------------------------------------------------------------------

test('1.18.0 does NOT seed allowPlayerResultReorder onto recipes or salvage', () => {
  // Seeding would churn stored JSON for zero observable change: the Recipe constructor
  // and _normalizeSalvage both read an absent key as `true` already. If someone "fixes"
  // the omission, this test tells them it was a decision.
  const { systems } = migrateRetireProgressiveAllowPlayerReorder([
    {
      id: 'sys',
      craftingCheck: { progressive: { allowPlayerReorder: true } },
      recipes: [{ id: 'r1', name: 'Potion' }],
      components: [{ id: 'c1', salvage: { enabled: true } }],
    },
  ]);
  assert.ok(!('allowPlayerResultReorder' in systems[0].recipes[0]));
  assert.ok(!('allowPlayerResultReorder' in systems[0].components[0].salvage));
});

// ---------------------------------------------------------------------------
// Runner registration
// ---------------------------------------------------------------------------

test('the runner applies 1.18.0 and bumps the migration version', async () => {
  const store = new Map([
    // Start at 1.17.0, not lower: 1.17.0 is the essence-ingredient migration, and starting
    // beneath it would run that one over this fixture too, making the assertions below
    // measure two migrations instead of this one.
    ['migrationVersion', '1.17.0'],
    [
      'craftingSystems',
      [
        {
          id: 'sys',
          craftingCheck: { progressive: { awardMode: 'equal', allowPlayerReorder: true } },
        },
      ],
    ],
  ]);
  const runner = new MigrationRunner({
    getSetting: (k) => store.get(k),
    setSetting: async (k, v) => store.set(k, v),
  });

  const result = await runner.run();

  assert.equal(result.aborted, false);
  // Lands at the current highest (1.19.0, the time-requirement default-on backfill runs
  // after 1.18.0 in the same pass); it is a no-op on this fixture, so the strip still holds.
  assert.equal(store.get('migrationVersion'), '1.19.0');
  assert.ok(!('allowPlayerReorder' in store.get('craftingSystems')[0].craftingCheck.progressive));
});

test('1.18.0 is version-gated — it does not re-run once the version is already at the latest', async () => {
  const store = new Map([
    ['migrationVersion', '1.19.0'],
    ['craftingSystems', [{ id: 'sys', craftingCheck: { progressive: { allowPlayerReorder: true } } }]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (k) => store.get(k),
    setSetting: async (k, v) => store.set(k, v),
  });

  const result = await runner.run();

  assert.equal(result.ran, 0);
  assert.equal(
    store.get('craftingSystems')[0].craftingCheck.progressive.allowPlayerReorder,
    true,
    'the gate holds: an already-migrated world is not touched again'
  );
});

test('the 1.18.0 registry entry carries a downgradeTo target', async () => {
  const runner = new MigrationRunner({ getSetting: () => undefined, setSetting: async () => {} });
  const entry = runner._migrations.find((m) => m.version === '1.18.0');
  assert.ok(entry, '1.18.0 is registered');
  // 1.17.0, not 1.18.0: downgradeTo names the last release BEFORE this migration, whose
  // schema a downgraded world still finds intact (this only removes a key that release
  // ignored). 1.17.0 is the essence-ingredient migration, which this one now follows.
  assert.equal(entry.downgradeTo, '1.17.0');
});
