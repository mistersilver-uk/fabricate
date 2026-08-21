/**
 * Issue 1055 — 1.20.0: cap the modifier picks of systems already on `playerPicks`.
 *
 * Before this change `playerPicks` meant "the player picks EXACTLY ONE modifier". The
 * change generalizes it to a bounded multi-pick governed by `craftingCheck.maxModifierPicks`,
 * and `resolveMaxModifierPicks` reads an ABSENT cap as UNLIMITED — so without this stamp
 * the upgrade would silently widen every existing `playerPicks` system from "pick one" to
 * "pick everything" and jump its check-modifier scalar from `max(...)` to the full sum.
 *
 * This covers the per-rule stamp (and the three rules deliberately left unbounded),
 * purity, idempotence, the no-throw guarantee, the runner registration and downgrade
 * target, and the IMPORT-side mirror — including the branch a bundle from the shipping
 * build actually takes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { migrateMaxModifierPicks, applyMaxModifierPicks } =
  await import('../src/migration/migrateMaxModifierPicks.js');
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');
const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');
const { FABRICATE_EXPORT_SCHEMA_VERSION } = await import('../src/systems/authoringExport.js');
const { resolveMaxModifierPicks } = await import('../src/systems/checkModifierResolver.js');

const MAX_PICKS = 'maxModifierPicks';

/** A system carrying a check block, so the stamp has somewhere to land. */
function system(craftingCheck = {}, overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Herbalism',
    craftingCheck: {
      checkModifiers: [{ id: 'med', expression: '@med' }],
      defaultModifierPolicy: 'addAll',
      ...craftingCheck,
    },
    ...overrides,
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

/** Run the migration over one system and hand back its (possibly stamped) check block. */
function migrateOne(craftingCheck, recipes = []) {
  return migrateMaxModifierPicks({ systems: [system(craftingCheck)], recipes }).systems[0]
    .craftingCheck;
}

// ---------------------------------------------------------------------------
// The stamp — `playerPicks` only
// ---------------------------------------------------------------------------

test('1.20.0 stamps maxModifierPicks = 1 onto a pre-existing playerPicks system', () => {
  const check = migrateOne({ defaultModifierPolicy: 'playerPicks' });
  assert.equal(check[MAX_PICKS], 1, 'the bound that rule always had is written back');
  assert.equal(
    resolveMaxModifierPicks(check),
    1,
    'and the engine now reads it as a real bound rather than as unlimited'
  );
});

// The OTHER three rules are deliberately left absent, i.e. unlimited. `addAll` and
// `highest` do not select at all; `byRecipe` selects, but its historical behaviour was
// NOT single-pick — a recipe already on disk may legitimately have picked several, and
// `resolveEligibleModifierIds` TRUNCATES to the cap, so a stamp of 1 would silently
// discard picks the GM authored.
test('1.20.0 leaves every rule other than playerPicks unbounded', () => {
  for (const defaultModifierPolicy of ['addAll', 'highest', 'byRecipe']) {
    const check = migrateOne({ defaultModifierPolicy });
    assert.equal(
      Object.hasOwn(check, MAX_PICKS),
      false,
      `${defaultModifierPolicy} gains no cap — a bound it never had would truncate authored picks`
    );
    assert.equal(resolveMaxModifierPicks(check), Infinity);
  }
});

// `byRecipe` is valid persisted data now, not a legacy token: it is a first-class
// combination rule (the recipe author selecting at recipe-edit time), so nothing maps or
// retires it at either level.
test('1.20.0 leaves a persisted byRecipe rule, and every recipe pick, exactly as authored', () => {
  const { systems, recipes } = migrateMaxModifierPicks({
    systems: [system({ defaultModifierPolicy: 'byRecipe' })],
    recipes: [recipe({ modifierIds: ['med', 'alch', 'herb'] })],
  });
  assert.equal(systems[0].craftingCheck.defaultModifierPolicy, 'byRecipe');
  assert.deepEqual(
    recipes[0].craftingModifier,
    { modifierIds: ['med', 'alch', 'herb'] },
    'a three-modifier pick already on disk is not truncated by an unasked-for cap'
  );
});

test('1.20.0 leaves an unrecognized rule alone rather than repairing it', () => {
  // Normalization is the normalizer's job; a migration that also repaired would make two
  // places responsible for the same coercion.
  const check = migrateOne({ defaultModifierPolicy: 'bogus' });
  assert.equal(check.defaultModifierPolicy, 'bogus');
  assert.equal(Object.hasOwn(check, MAX_PICKS), false);
});

// ---------------------------------------------------------------------------
// The stamp is CONDITIONAL — an authored cap always wins
// ---------------------------------------------------------------------------

test('1.20.0 NEVER overwrites an authored cap', () => {
  for (const authored of [1, 2, 5]) {
    assert.equal(
      migrateOne({ defaultModifierPolicy: 'playerPicks', [MAX_PICKS]: authored })[MAX_PICKS],
      authored,
      `an authored ${authored} survives — the View Lab boots this migration over its fixtures ` +
        'on every build, so an unconditional write would corrupt the frame it captures'
    );
  }
});

// Every unbounded FORM is "does not already carry a usable cap", because the condition
// goes through `resolveMaxModifierPicks` rather than re-deriving the rule here.
test('1.20.0 stamps over null, 0, a negative and a non-integer cap alike', () => {
  for (const stored of [null, undefined, 0, -1, 2.5, 'three']) {
    assert.equal(
      migrateOne({ defaultModifierPolicy: 'playerPicks', [MAX_PICKS]: stored })[MAX_PICKS],
      1,
      `${String(stored)} is not a usable bound, so the historical one is written`
    );
  }
});

test('1.20.0 does NOT seed a craftingCheck block on a system that has none', () => {
  // Deliberate: `checkModifiers` lives inside `craftingCheck`, so such a system has no
  // catalogue, nothing to pick from and no cap to observe — and it cannot be on
  // `playerPicks`, because that rule is persisted in the very block that is missing.
  const { systems } = migrateMaxModifierPicks({
    systems: [{ id: 'sys-1', name: 'No checks' }],
    recipes: [recipe({ modifierIds: ['med'] })],
  });
  assert.equal(systems[0].craftingCheck, undefined);
});

test('1.20.0 stamps per system, from that system’s own rule', () => {
  const { systems } = migrateMaxModifierPicks({
    systems: [
      system({ defaultModifierPolicy: 'playerPicks' }),
      system({ defaultModifierPolicy: 'highest' }, { id: 'sys-2' }),
      system({ defaultModifierPolicy: 'playerPicks' }, { id: 'sys-3' }),
    ],
    recipes: [],
  });
  assert.deepEqual(
    systems.map((entry) => entry.craftingCheck[MAX_PICKS]),
    [1, undefined, 1]
  );
});

// ---------------------------------------------------------------------------
// Purity, idempotence and the no-throw guarantee
// ---------------------------------------------------------------------------

test('1.20.0 is pure and clone-first — the input payload is never touched', () => {
  const input = {
    systems: [system({ defaultModifierPolicy: 'playerPicks' })],
    recipes: [recipe({ modifierIds: ['med'] })],
  };
  const before = structuredClone(input);
  const result = migrateMaxModifierPicks(input);
  assert.deepEqual(input, before, 'the runner payload is untouched, even half-way through');
  assert.notEqual(result.systems, input.systems, 'the returned arrays are clones');
  assert.notEqual(result.recipes, input.recipes);
  assert.equal(result.systems[0].craftingCheck[MAX_PICKS], 1, 'and the clone WAS stamped');
});

test('1.20.0 returns the recipe payload unchanged, deliberately and explicitly', () => {
  const recipes = [
    // A legacy `craftingModifier.policy` is left on disk: the resolver no longer consults
    // it, so it is inert, and leaving it is what keeps the downgrade lossless.
    recipe({ policy: 'byRecipe', modifierIds: ['med'] }),
    recipe(null, { id: 'r-2' }),
  ];
  const result = migrateMaxModifierPicks({
    systems: [system({ defaultModifierPolicy: 'playerPicks' })],
    recipes,
  });
  assert.deepEqual(result.recipes, recipes, 'recipes are read and returned verbatim');
});

test('1.20.0 is idempotent under re-run', () => {
  const input = {
    systems: [
      system({ defaultModifierPolicy: 'playerPicks' }),
      system({ defaultModifierPolicy: 'byRecipe' }, { id: 'sys-2' }),
      system({ defaultModifierPolicy: 'playerPicks', [MAX_PICKS]: 4 }, { id: 'sys-3' }),
    ],
    recipes: [recipe({ modifierIds: ['med'] })],
  };
  const once = migrateMaxModifierPicks(input);
  const twice = migrateMaxModifierPicks(once);
  assert.deepEqual(
    twice,
    once,
    'a second pass finds every affected system capped and changes nothing'
  );
});

test('1.20.0 tolerates malformed payloads without throwing', () => {
  // A non-fatal throw is a bare `console.warn` in the runner and the pass STILL persists,
  // so "does not throw" is the whole safety story for this migration.
  for (const data of [
    undefined,
    {},
    { systems: null, recipes: null },
    { systems: 'nope', recipes: 3 },
    { systems: [null, 'x', 7, [], { craftingCheck: 'nope' }], recipes: [null, 'x'] },
  ]) {
    assert.doesNotThrow(() => migrateMaxModifierPicks(data), JSON.stringify(data));
  }
  // A non-array `systems` is handed straight back rather than coerced into one.
  assert.equal(migrateMaxModifierPicks({ systems: 'nope' }).systems, 'nope');
});

test('applyMaxModifierPicks is the shared per-system transform', () => {
  // The world migration walks a list; an export bundle is already exactly one system, so
  // both share this rather than maintaining two derivations.
  const target = system({ defaultModifierPolicy: 'playerPicks' });
  applyMaxModifierPicks(target);
  assert.equal(target.craftingCheck[MAX_PICKS], 1, 'it mutates the structure it is handed');
  for (const junk of [null, undefined, 'nope', 7, [], { craftingCheck: 'nope' }]) {
    assert.doesNotThrow(() => applyMaxModifierPicks(junk), JSON.stringify(junk));
  }
});

// ---------------------------------------------------------------------------
// Runner registration
// ---------------------------------------------------------------------------

test('the 1.20.0 registry entry carries a lossless downgradeTo target', () => {
  const runner = new MigrationRunner({ getSetting: () => undefined, setSetting: async () => {} });
  const entry = runner._migrations.find((migration) => migration.version === '1.20.0');
  assert.ok(entry, '1.20.0 is registered');
  assert.equal(
    entry.downgradeTo,
    '1.19.0',
    'the pre-change build drops the unknown maxModifierPicks key through its allowlist ' +
      'normalizer, and its playerPicks already means "pick one" — exactly what the cap encoded'
  );
});

test('the runner applies 1.20.0 to craftingSystems and bumps the migration version', async () => {
  const store = new Map([
    ['migrationVersion', '1.19.0'],
    ['craftingSystems', [system({ defaultModifierPolicy: 'playerPicks' })]],
    ['recipes', [recipe({ modifierIds: ['med'] })]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.aborted, false);
  assert.equal(store.get('migrationVersion'), '1.26.0');
  assert.equal(store.get('craftingSystems')[0].craftingCheck[MAX_PICKS], 1);
  assert.deepEqual(
    store.get('recipes')[0].craftingModifier,
    { modifierIds: ['med'] },
    'the recipe setting is not rewritten'
  );
});

test('the runner does not re-run 1.20.0 once the world is at that version', async () => {
  const store = new Map([
    ['migrationVersion', '1.26.0'],
    ['craftingSystems', [system({ defaultModifierPolicy: 'playerPicks' })]],
    ['recipes', []],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.ran, 0);
  assert.equal(
    Object.hasOwn(store.get('craftingSystems')[0].craftingCheck, MAX_PICKS),
    false,
    'the gate holds: a GM who cleared the cap keeps it cleared across reloads'
  );
});

// ---------------------------------------------------------------------------
// The import-side mirror — branch-INDEPENDENT
// ---------------------------------------------------------------------------

function bundle(overrides = {}) {
  return {
    fabricateVersion: '1.5.0',
    system: system(),
    recipes: [recipe(undefined)],
    ...overrides,
  };
}

test('migrateExportPayload stamps the cap on a payload ALREADY at the current schema', () => {
  // The one that matters in practice: every bundle written by the shipping build carries
  // the current `schemaVersion`, so `migrateExportPayload` returns through its early
  // branch. A derivation reachable only from the legacy branch would never run on a real
  // bundle — the same trap `upcastLegacyTools` is called in both branches to avoid.
  const current = bundle({
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    system: system({ defaultModifierPolicy: 'playerPicks' }),
  });
  const migrated = migrateExportPayload(current);
  assert.equal(migrated.system.craftingCheck[MAX_PICKS], 1);
  assert.equal(
    Object.hasOwn(current.system.craftingCheck, MAX_PICKS),
    false,
    'and the caller’s payload is not aliased or mutated'
  );
});

test('migrateExportPayload stamps the cap on a LEGACY schema-1 payload too', () => {
  const migrated = migrateExportPayload(
    bundle({ system: system({ defaultModifierPolicy: 'playerPicks' }) })
  );
  assert.equal(migrated.schemaVersion, FABRICATE_EXPORT_SCHEMA_VERSION);
  assert.equal(migrated.system.craftingCheck[MAX_PICKS], 1);
});

test('migrateExportPayload leaves a bySubject bundle and its subject picks unbounded', () => {
  // The rule TOKEN was renamed by `1.22.0` (issue 1095), so the upcast chain rewrites a
  // bundle's `byRecipe` on the way in — which is asserted in
  // `tests/migrate-system-check-modifier-catalogue.test.js`. What THIS case owns is
  // unchanged: `1.20.0` stamps no cap on a subject-selecting rule and destroys no pick.
  const migrated = migrateExportPayload(
    bundle({
      schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
      system: system({ defaultModifierPolicy: 'byRecipe' }),
      recipes: [recipe({ modifierIds: ['med', 'alch'] })],
    })
  );
  assert.equal(migrated.system.craftingCheck.defaultModifierPolicy, 'bySubject');
  assert.equal(Object.hasOwn(migrated.system.craftingCheck, MAX_PICKS), false);
  assert.deepEqual(migrated.recipes[0].craftingModifier, { modifierIds: ['med', 'alch'] });
});

test('migrateExportPayload preserves an AUTHORED cap through the import', () => {
  assert.equal(
    migrateExportPayload(
      bundle({
        schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
        system: system({ defaultModifierPolicy: 'playerPicks', [MAX_PICKS]: 3 }),
      })
    ).system.craftingCheck[MAX_PICKS],
    3,
    'the GM’s decision travels with the bundle rather than being re-derived'
  );
});

test('migrateExportPayload is idempotent over the cap derivation', () => {
  const once = migrateExportPayload(
    bundle({ system: system({ defaultModifierPolicy: 'playerPicks' }) })
  );
  assert.deepEqual(migrateExportPayload(once), once);
});
