/**
 * Issue 1055 — 1.20.0: retire the `byRecipe` modifier policy and stamp the new
 * system-level `craftingCheck.recipeModifierAuthority`.
 *
 * Two axes used to be one setting: `defaultModifierPolicy` answered both "how do eligible
 * modifiers combine?" and "may a recipe override the system?", because its fourth value
 * `byRecipe` meant "delegate". This covers the transform that splits them, the runner
 * registration and downgrade target, and the two IMPORT-side derivations that mirror it —
 * including the branch a bundle from the shipping build actually takes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateRecipeModifierAuthority, applyRecipeModifierAuthority } = await import(
  '../src/migration/migrateRecipeModifierAuthority.js'
);
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');
const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');
const { FABRICATE_EXPORT_SCHEMA_VERSION } = await import('../src/systems/authoringExport.js');

const AUTHORITY = 'recipeModifierAuthority';

/** A system carrying a check block, so the derivation has somewhere to land. */
function system(overrides = {}) {
  const { craftingCheck, ...rest } = overrides;
  return {
    id: 'sys-1',
    name: 'Herbalism',
    craftingCheck: {
      checkModifiers: [{ id: 'med', expression: '@med' }],
      defaultModifierPolicy: 'addAll',
      ...craftingCheck,
    },
    ...rest,
  };
}

function recipe(craftingModifier, overrides = {}) {
  return {
    id: 'r-1',
    craftingSystemId: 'sys-1',
    ...(craftingModifier === undefined ? {} : { craftingModifier }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The `byRecipe` retirement, at both levels
// ---------------------------------------------------------------------------

test('1.20.0 maps a system-level byRecipe policy to addAll', () => {
  const { systems } = migrateRecipeModifierAuthority({
    systems: [system({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } })],
    recipes: [],
  });
  assert.equal(systems[0].craftingCheck.defaultModifierPolicy, 'addAll');
});

test('1.20.0 maps a recipe-level byRecipe policy to addAll, preserving its id set', () => {
  const { recipes } = migrateRecipeModifierAuthority({
    systems: [system()],
    recipes: [recipe({ policy: 'byRecipe', modifierIds: ['med'] })],
  });
  assert.deepEqual(recipes[0].craftingModifier, { policy: 'addAll', modifierIds: ['med'] });
});

test('1.20.0 maps a recipe orphaned from every system too', () => {
  // The demotion is owed to the recipe, not to its system, so it runs over the whole
  // list before the per-system grouping.
  const { recipes } = migrateRecipeModifierAuthority({
    systems: [system()],
    recipes: [recipe({ policy: 'byRecipe' }, { id: 'r-orphan', craftingSystemId: 'gone' })],
  });
  assert.equal(recipes[0].craftingModifier.policy, 'addAll');
});

test('1.20.0 leaves every other combination rule exactly as authored', () => {
  const { systems, recipes } = migrateRecipeModifierAuthority({
    systems: [system({ craftingCheck: { defaultModifierPolicy: 'highest' } })],
    recipes: [recipe({ policy: 'playerPicks', modifierIds: ['med'] })],
  });
  assert.equal(systems[0].craftingCheck.defaultModifierPolicy, 'highest');
  assert.equal(recipes[0].craftingModifier.policy, 'playerPicks');
});

// ---------------------------------------------------------------------------
// The stamp — derived from what the system was ALREADY delegating
// ---------------------------------------------------------------------------

test('1.20.0 stamps setAndRule when the system was delegating by policy', () => {
  const { systems } = migrateRecipeModifierAuthority({
    systems: [system({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } })],
    recipes: [],
  });
  // Read BEFORE the mapping erases `byRecipe` — the other order would collapse every
  // delegating system to `none`.
  assert.equal(systems[0].craftingCheck[AUTHORITY], 'setAndRule');
});

test('1.20.0 stamps setAndRule when ANY recipe carries a craftingModifier', () => {
  for (const override of [
    { policy: 'highest' },
    { modifierIds: ['med'] },
    // An AUTHORED EMPTY set is as much a delegation as any other override.
    { modifierIds: [] },
    {},
  ]) {
    const { systems } = migrateRecipeModifierAuthority({
      systems: [system()],
      recipes: [recipe(override)],
    });
    assert.equal(
      systems[0].craftingCheck[AUTHORITY],
      'setAndRule',
      `${JSON.stringify(override)} is a delegation`
    );
  }
});

test('1.20.0 stamps none when nothing was ever delegated', () => {
  const { systems } = migrateRecipeModifierAuthority({
    systems: [system()],
    recipes: [recipe(undefined), recipe(null, { id: 'r-2' })],
  });
  assert.equal(systems[0].craftingCheck[AUTHORITY], 'none');
});

test('1.20.0 counts only the recipes belonging to the system being stamped', () => {
  const { systems } = migrateRecipeModifierAuthority({
    systems: [system(), system({ id: 'sys-2' })],
    recipes: [recipe({ policy: 'highest' }, { craftingSystemId: 'sys-2' })],
  });
  const [first, second] = systems;
  assert.equal(first.craftingCheck[AUTHORITY], 'none', 'sys-1 has no delegating recipe');
  assert.equal(second.craftingCheck[AUTHORITY], 'setAndRule', 'sys-2 does');
});

test('1.20.0 NEVER overwrites an authored authority level', () => {
  for (const authored of ['none', 'setOnly', 'setAndRule']) {
    const { systems } = migrateRecipeModifierAuthority({
      // A delegating recipe, so an unconditional recompute would say `setAndRule`.
      systems: [system({ craftingCheck: { [AUTHORITY]: authored } })],
      recipes: [recipe({ policy: 'highest' })],
    });
    assert.equal(
      systems[0].craftingCheck[AUTHORITY],
      authored,
      `an authored ${authored} survives — the View Lab boots this migration over its fixtures`
    );
  }
});

test('1.20.0 stamps over an explicit null as well as an absent key', () => {
  const { systems } = migrateRecipeModifierAuthority({
    systems: [system({ craftingCheck: { [AUTHORITY]: null } })],
    recipes: [],
  });
  assert.equal(systems[0].craftingCheck[AUTHORITY], 'none');
});

test('1.20.0 does NOT seed a craftingCheck block on a system that has none', () => {
  // Deliberate: `checkModifiers` lives inside `craftingCheck`, so such a system has no
  // catalogue, no modifiers to combine and no observable authority. Seeding would force
  // a `craftingSystems` write for every world for zero observable change.
  const { systems } = migrateRecipeModifierAuthority({
    systems: [{ id: 'sys-1', name: 'No checks' }],
    recipes: [recipe({ policy: 'highest' })],
  });
  assert.equal(systems[0].craftingCheck, undefined);
  // …and the recipe-level mapping is still owed to its recipes.
  const mapped = migrateRecipeModifierAuthority({
    systems: [{ id: 'sys-1' }],
    recipes: [recipe({ policy: 'byRecipe' })],
  });
  assert.equal(mapped.recipes[0].craftingModifier.policy, 'addAll');
});

// ---------------------------------------------------------------------------
// Purity, idempotence and the no-throw guarantee
// ---------------------------------------------------------------------------

test('1.20.0 is pure and clone-first — the input payload is never touched', () => {
  const input = {
    systems: [system({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } })],
    recipes: [recipe({ policy: 'byRecipe', modifierIds: ['med'] })],
  };
  const before = structuredClone(input);
  const result = migrateRecipeModifierAuthority(input);
  assert.deepEqual(input, before, 'the runner payload is untouched, even half-way through');
  assert.notEqual(result.systems, input.systems, 'the returned arrays are clones');
  assert.notEqual(result.recipes, input.recipes);
});

test('1.20.0 is idempotent under re-run', () => {
  const input = {
    systems: [system({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } })],
    recipes: [recipe({ policy: 'byRecipe', modifierIds: ['med'] })],
  };
  const once = migrateRecipeModifierAuthority(input);
  const twice = migrateRecipeModifierAuthority(once);
  assert.deepEqual(twice, once, 'a second pass finds every authority resolved and changes nothing');
});

test('1.20.0 tolerates malformed payloads without throwing', () => {
  // A non-fatal throw is a bare `console.warn` in the runner and the pass STILL persists,
  // so "does not throw" is the whole safety story for this migration.
  for (const data of [
    {},
    { systems: null, recipes: null },
    { systems: 'nope', recipes: 3 },
    { systems: [null, 'x', 7, []], recipes: [null, 'x', { craftingModifier: 'nope' }] },
  ]) {
    assert.doesNotThrow(() => migrateRecipeModifierAuthority(data), JSON.stringify(data));
  }
});

test('applyRecipeModifierAuthority is the shared per-system transform', () => {
  // The world migration groups by system; an export bundle is already one system plus
  // its recipes, so both share this rather than maintaining two derivations.
  const target = system({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } });
  const recipes = [recipe({ policy: 'byRecipe' })];
  applyRecipeModifierAuthority(target, recipes);
  assert.equal(target.craftingCheck.defaultModifierPolicy, 'addAll');
  assert.equal(target.craftingCheck[AUTHORITY], 'setAndRule');
  assert.equal(recipes[0].craftingModifier.policy, 'addAll');
  assert.doesNotThrow(() => applyRecipeModifierAuthority(null, null));
});

// ---------------------------------------------------------------------------
// Runner registration
// ---------------------------------------------------------------------------

test('the 1.20.0 registry entry carries a lossless downgradeTo target', () => {
  const runner = new MigrationRunner({ getSetting: () => undefined, setSetting: async () => {} });
  const entry = runner._migrations.find((m) => m.version === '1.20.0');
  assert.ok(entry, '1.20.0 is registered');
  assert.equal(
    entry.downgradeTo,
    '1.19.0',
    'the pre-change build sums for addAll exactly as it did for byRecipe, and its ' +
      'allowlist normalizer drops the unknown authority key on read'
  );
});

test('the runner applies 1.20.0 to both settings and bumps the migration version', async () => {
  const store = new Map([
    ['migrationVersion', '1.19.0'],
    ['craftingSystems', [system({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } })]],
    ['recipes', [recipe({ policy: 'byRecipe', modifierIds: ['med'] })]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.aborted, false);
  assert.equal(store.get('migrationVersion'), '1.20.0');
  assert.equal(store.get('craftingSystems')[0].craftingCheck.defaultModifierPolicy, 'addAll');
  assert.equal(store.get('craftingSystems')[0].craftingCheck[AUTHORITY], 'setAndRule');
  assert.equal(store.get('recipes')[0].craftingModifier.policy, 'addAll');
});

test('the runner does not re-run 1.20.0 once the world is at that version', async () => {
  const store = new Map([
    ['migrationVersion', '1.20.0'],
    ['craftingSystems', [system({ craftingCheck: { [AUTHORITY]: 'none' } })]],
    ['recipes', [recipe({ policy: 'highest' })]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.ran, 0);
  assert.equal(
    store.get('craftingSystems')[0].craftingCheck[AUTHORITY],
    'none',
    'the gate holds: a GM who chose `none` keeps it across reloads'
  );
});

// ---------------------------------------------------------------------------
// The import-side derivation — branch-INDEPENDENT
// ---------------------------------------------------------------------------

function bundle(overrides = {}) {
  return {
    fabricateVersion: '1.5.0',
    system: system(),
    recipes: [recipe(undefined)],
    ...overrides,
  };
}

test('migrateExportPayload derives the authority on a payload ALREADY at the current schema', () => {
  // The one that matters in practice: every bundle written by the shipping build carries
  // the current `schemaVersion`, so `migrateExportPayload` returns through its early
  // branch. A derivation reachable only from the legacy branch would never run on a real
  // bundle — the same trap `upcastLegacyTools` is called in both branches to avoid.
  const current = bundle({
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    recipes: [recipe({ policy: 'byRecipe', modifierIds: ['med'] })],
  });
  const migrated = migrateExportPayload(current);
  assert.equal(migrated.system.craftingCheck[AUTHORITY], 'setAndRule');
  assert.equal(migrated.recipes[0].craftingModifier.policy, 'addAll');
  assert.equal(
    current.system.craftingCheck[AUTHORITY],
    undefined,
    'and the caller’s payload is not aliased or mutated'
  );
});

test('migrateExportPayload derives the authority on a LEGACY schema-1 payload too', () => {
  const migrated = migrateExportPayload(
    bundle({ system: system({ craftingCheck: { defaultModifierPolicy: 'byRecipe' } }) })
  );
  assert.equal(migrated.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
  assert.equal(migrated.system.craftingCheck.defaultModifierPolicy, 'addAll');
  assert.equal(migrated.system.craftingCheck[AUTHORITY], 'setAndRule');
});

test('migrateExportPayload stamps none for a bundle nothing ever delegated', () => {
  assert.equal(
    migrateExportPayload(bundle()).system.craftingCheck[AUTHORITY],
    'none',
    'no recipe override and no legacy policy'
  );
});

test('migrateExportPayload preserves an AUTHORED authority through the import', () => {
  const authored = bundle({
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    system: system({ craftingCheck: { [AUTHORITY]: 'setOnly' } }),
    recipes: [recipe({ policy: 'highest' })],
  });
  assert.equal(
    migrateExportPayload(authored).system.craftingCheck[AUTHORITY],
    'setOnly',
    'the GM’s decision travels with the bundle rather than being re-derived'
  );
});

test('migrateExportPayload is idempotent over the authority derivation', () => {
  const once = migrateExportPayload(bundle({ recipes: [recipe({ policy: 'byRecipe' })] }));
  assert.deepEqual(migrateExportPayload(once), once);
});
