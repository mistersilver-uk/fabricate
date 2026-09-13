/**
 * Issue 1608 — 1.33.0: record the mark that keeps every existing subject pick rolling.
 *
 * Under `bySubject` the activity check's `defaultModifierIds` stopped being a mere default and
 * became the MARK that BOUNDS what a subject may pick. Every already-shipped check carries a
 * real array — `_normalizeCheckModifierSelection` emits the key unconditionally — so a check
 * whose GM never toggled a row "Selectable" is persisted as `[]`, and an empty mark bounds
 * everything away. Without this pass the upgrade would silently stop applying every pick those
 * worlds authored.
 *
 * THE PASS HAS TWO HALVES AND BOTH ARE LOAD-BEARING. Seeding the mark restores the AUTHORING
 * subjects; pinning the INHERITING ones is what stops the seed handing them the whole union,
 * because under `bySubject` a subject with no authored pick resolves the mark itself. The
 * suite asserts the outcome the way a GM measures it — through `resolveEligibleModifierIds`,
 * before and after — rather than only on the persisted shape, so a half that stopped working
 * cannot pass by writing plausible-looking data.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const { migrateSubjectModifierMarks, applySubjectModifierMarks } = await import(
  '../src/migration/migrateSubjectModifierMarks.js'
);
const { MigrationRunner } = await import('../src/migration/MigrationRunner.js');
const { migrateExportPayload } = await import('../src/migration/migrateExportPayload.js');
const { FABRICATE_EXPORT_SCHEMA_VERSION } = await import('../src/systems/authoringExport.js');
const { resolveEligibleModifierIds } = await import('../src/systems/checkModifierResolver.js');
const { projectComponentSummary } = await import('../src/systems/summaryProjection.js');

const CATALOGUE = [
  { id: 'med', label: 'Medicine', expression: '@med' },
  { id: 'alch', label: 'Alchemy', expression: '@alch' },
  { id: 'herb', label: 'Herbalism', expression: '@herb' },
];

const LIBRARIES = { modifiers: CATALOGUE };

/** A system whose three activity checks all defer to the subject with NOTHING marked. */
function system(overrides = {}) {
  const check = { defaultModifierPolicy: 'bySubject', defaultModifierIds: [] };
  return {
    id: 'sys-1',
    name: 'Herbalism',
    craftingCheck: { ...check },
    salvageCraftingCheck: { ...check },
    gatheringCraftingCheck: { ...check },
    components: [],
    ...overrides,
  };
}

/**
 * The three subject fixtures. `picks` defaults to the INHERIT sentinel: an absent key, which is
 * the state every record that never opened its picker is in, and the one the pass pins.
 */
const INHERITS = Symbol('inherits');

function recipe(id, picks = INHERITS) {
  const record = { id, craftingSystemId: 'sys-1' };
  if (picks !== INHERITS) record.craftingModifier = { modifierIds: picks };
  return record;
}

function component(id, picks = INHERITS) {
  const record = { id, salvage: { enabled: true } };
  if (picks !== INHERITS) record.salvage.checkModifierIds = picks;
  return record;
}

function task(id, picks = INHERITS) {
  const record = { id };
  if (picks !== INHERITS) record.checkModifierIds = picks;
  return record;
}

function gatheringConfig(tasks) {
  return { systems: { 'sys-1': { tasks } } };
}

/** Run the pass over one system's world and hand back everything it may have rewritten. */
function migrate({ systems = [system()], recipes = [], tasks = [] } = {}) {
  return migrateSubjectModifierMarks({
    systems,
    recipes,
    gatheringConfig: gatheringConfig(tasks),
    characterLibraries: LIBRARIES,
  });
}

/**
 * What a subject actually rolls for an activity, measured through the shipped resolver — the
 * one oracle that answers "did this pass change a roll".
 */
function rolled(check, subjectPick) {
  return resolveEligibleModifierIds({
    catalogue: CATALOGUE,
    systemPolicy: check.defaultModifierPolicy,
    defaultModifierIds: check.defaultModifierIds,
    subjectModifierIds: Array.isArray(subjectPick) ? subjectPick : null,
  });
}

// ---------------------------------------------------------------------------
// The seed — the authoring subjects keep rolling
// ---------------------------------------------------------------------------

test('1.33.0 seeds an empty bySubject mark with the union of what its recipes pick', () => {
  const result = migrate({
    recipes: [recipe('r-1', ['med']), recipe('r-2', ['herb', 'med'])],
  });
  assert.deepEqual(
    result.systems[0].craftingCheck.defaultModifierIds,
    ['med', 'herb'],
    'first-seen authored order, de-duplicated across the subjects'
  );
});

test('1.33.0 leaves every recipe rolling exactly what it rolled before the bound existed', () => {
  const before = { defaultModifierPolicy: 'bySubject', defaultModifierIds: [] };
  const picks = ['herb', 'med'];
  // The PRE-1608 reading of the same data: the mark defaulted, it did not bound.
  const preUpgrade = ['herb', 'med'];
  assert.deepEqual(
    rolled(before, picks),
    [],
    'the bound alone would have silenced this recipe — the defect this pass repairs'
  );

  const result = migrate({ recipes: [recipe('r-1', picks)] });
  assert.deepEqual(
    rolled(result.systems[0].craftingCheck, result.recipes[0].craftingModifier.modifierIds),
    preUpgrade,
    'after the pass it rolls what it always rolled, in its own authored order'
  );
});

test('1.33.0 pins an INHERITING subject so the seeded mark does not hand it the whole union', () => {
  const result = migrate({ recipes: [recipe('r-1', ['med']), recipe('r-2')] });
  const check = result.systems[0].craftingCheck;
  assert.deepEqual(
    result.recipes[1].craftingModifier,
    { modifierIds: [] },
    'the recipe that never opened the picker gets an explicit pick of nothing'
  );
  assert.deepEqual(
    rolled(check, result.recipes[1].craftingModifier.modifierIds),
    [],
    'so it rolls nothing, which is what the empty mark it used to inherit gave it'
  );
  assert.deepEqual(
    rolled(check, null),
    ['med'],
    'the seeded mark IS what an unpinned inheritor would have started rolling'
  );
});

test('1.33.0 preserves a key already in a recipe’s craftingModifier block when it pins', () => {
  const legacy = { id: 'r-2', craftingSystemId: 'sys-1', craftingModifier: { policy: 'byRecipe' } };
  const result = migrate({ recipes: [recipe('r-1', ['med']), legacy] });
  assert.deepEqual(
    result.recipes[1].craftingModifier,
    { policy: 'byRecipe', modifierIds: [] },
    'the pass adds a pick; it never removes what it found beside it'
  );
});

// ---------------------------------------------------------------------------
// The other two subjects
// ---------------------------------------------------------------------------

test('1.33.0 seeds and pins the SALVAGE mark from the components’ own picks', () => {
  const systems = [
    system({ components: [component('c-1', ['alch']), component('c-2'), component('c-3', [])] }),
  ];
  const migrated = migrate({ systems }).systems[0];
  assert.deepEqual(migrated.salvageCraftingCheck.defaultModifierIds, ['alch']);
  assert.deepEqual(
    migrated.components[1].salvage.checkModifierIds,
    [],
    'the inheriting component is pinned'
  );
  assert.deepEqual(
    migrated.components[2].salvage.checkModifierIds,
    [],
    'and one that already authored a pick of zero is left exactly as it was'
  );
});

test('1.33.0 pins a component carrying NO salvage block without making it salvageable', () => {
  // The pin writes `salvage.checkModifierIds` and creates the block when a component has none.
  // It MUST NOT be guarded on the block's presence: a genuinely salvageable component that
  // simply never opened its picker has no `checkModifierIds` sub-key either, and skipping it
  // would hand it the whole seeded union. What makes the CREATED block inert is that every
  // reader keys on `salvage.enabled === true`, which the pin never writes — measured here
  // through a shipped reader rather than by inspecting the shape.
  const systems = [
    system({
      components: [
        component('c-1', ['alch']),
        { id: 'c-bare' },
        { id: 'c-open', salvage: { enabled: true } },
      ],
    }),
  ];
  const [, bare, open] = migrate({ systems }).systems[0].components;

  assert.deepEqual(bare.salvage.checkModifierIds, [], 'the block-less component is pinned');
  assert.deepEqual(
    open.salvage.checkModifierIds,
    [],
    'and so is the salvageable one that never authored a pick'
  );
  assert.equal(
    projectComponentSummary({ component: bare }).salvageEnabled,
    false,
    'the block the pin created carries no `enabled`, so no reader takes it for salvageable'
  );
  assert.equal(
    projectComponentSummary({ component: open }).salvageEnabled,
    true,
    'and a component that really is salvageable is not switched off by being pinned'
  );
});

test('1.33.0 seeds and pins the GATHERING mark from the tasks’ own picks', () => {
  const result = migrate({ tasks: [task('t-1', ['herb']), task('t-2')] });
  assert.deepEqual(
    result.systems[0].gatheringCraftingCheck.defaultModifierIds,
    ['herb'],
    'the task pick reaches its own activity check'
  );
  const tasks = result.gatheringConfig.systems['sys-1'].tasks;
  assert.deepEqual(tasks[1].checkModifierIds, [], 'the inheriting task is pinned');
  assert.deepEqual(tasks[0].checkModifierIds, ['herb'], 'the authoring task is untouched');
});

test('1.33.0 reads each activity from its OWN subjects, never from another activity’s', () => {
  const systems = [system({ components: [component('c-1', ['alch'])] })];
  const migrated = migrate({ systems, recipes: [recipe('r-1', ['med'])], tasks: [task('t-1')] })
    .systems[0];
  assert.deepEqual(migrated.craftingCheck.defaultModifierIds, ['med']);
  assert.deepEqual(migrated.salvageCraftingCheck.defaultModifierIds, ['alch']);
  assert.deepEqual(
    migrated.gatheringCraftingCheck.defaultModifierIds,
    [],
    'no gathering task picked anything, so its mark is left empty and its task unpinned'
  );
});

test('1.33.0 reads a recipe only for the system it belongs to', () => {
  const other = { id: 'r-9', craftingSystemId: 'sys-2', craftingModifier: { modifierIds: ['alch'] } };
  const result = migrate({ recipes: [recipe('r-1', ['med']), other] });
  assert.deepEqual(result.systems[0].craftingCheck.defaultModifierIds, ['med']);
  assert.equal(
    Object.hasOwn(result.recipes[1].craftingModifier, 'modifierIds'),
    true,
    'and another system’s recipe is neither read nor pinned'
  );
  assert.deepEqual(result.recipes[1].craftingModifier.modifierIds, ['alch']);
});

// ---------------------------------------------------------------------------
// What it deliberately leaves alone
// ---------------------------------------------------------------------------

for (const policy of ['addAll', 'highest', 'playerPicks']) {
  test(`1.33.0 leaves an empty ${policy} mark alone — there it is the SOURCE, not a bound`, () => {
    const systems = [
      system({ craftingCheck: { defaultModifierPolicy: policy, defaultModifierIds: [] } }),
    ];
    const result = migrate({ systems, recipes: [recipe('r-1', ['med']), recipe('r-2')] });
    assert.deepEqual(
      result.systems[0].craftingCheck.defaultModifierIds,
      [],
      'seeding would ADD modifiers to every roll under a rule that does not select'
    );
    assert.equal(
      Object.hasOwn(result.recipes[1], 'craftingModifier'),
      false,
      'and no subject is pinned, because none was ever going to be bounded'
    );
  });
}

test('1.33.0 never widens a mark the GM actually authored', () => {
  const systems = [
    system({ craftingCheck: { defaultModifierPolicy: 'bySubject', defaultModifierIds: ['med'] } }),
  ];
  const result = migrate({ systems, recipes: [recipe('r-1', ['med', 'herb']), recipe('r-2')] });
  assert.deepEqual(
    result.systems[0].craftingCheck.defaultModifierIds,
    ['med'],
    'a pick the check refuses is exactly the state issue 1608 reports; re-marking it here ' +
      'would re-authorize it'
  );
  assert.equal(
    Object.hasOwn(result.recipes[1], 'craftingModifier'),
    false,
    'and the inheriting recipe keeps inheriting the mark the GM set'
  );
});

test('1.33.0 leaves a NON-ARRAY mark alone, because it bounds nothing already', () => {
  const systems = [system({ craftingCheck: { defaultModifierPolicy: 'bySubject' } })];
  const result = migrate({ systems, recipes: [recipe('r-1', ['med'])] });
  assert.equal(Object.hasOwn(result.systems[0].craftingCheck, 'defaultModifierIds'), false);
});

test('1.33.0 writes NOTHING when no subject of that activity has picked anything', () => {
  const before = JSON.stringify({ systems: [system()], recipes: [recipe('r-1'), recipe('r-2')] });
  const result = migrate({ recipes: [recipe('r-1'), recipe('r-2')] });
  assert.equal(
    JSON.stringify({ systems: result.systems, recipes: result.recipes }),
    before,
    'nothing was suppressed, so nothing is pinned and the world is byte-identical'
  );
});

test('1.33.0 declines to write an id the world catalogue does not know', () => {
  const result = migrateSubjectModifierMarks({
    systems: [system()],
    recipes: [recipe('r-1', ['med', 'ghost'])],
    gatheringConfig: gatheringConfig([]),
    characterLibraries: LIBRARIES,
  });
  assert.deepEqual(
    result.systems[0].craftingCheck.defaultModifierIds,
    ['med'],
    'an unknown id resolves to nothing before and after, so the mark does not carry it'
  );
});

test('1.33.0 finds the catalogue in a surviving in-system copy as well as the world library', () => {
  const systems = [system({ modifiers: CATALOGUE })];
  const result = migrateSubjectModifierMarks({
    systems,
    recipes: [recipe('r-1', ['med'])],
    gatheringConfig: gatheringConfig([]),
    characterLibraries: {},
  });
  assert.deepEqual(
    result.systems[0].craftingCheck.defaultModifierIds,
    ['med'],
    'a world whose 1.28.0 lift has not landed still has its live corpus in the system'
  );
});

// ---------------------------------------------------------------------------
// Purity, idempotence, and the no-throw guarantee
// ---------------------------------------------------------------------------

test('1.33.0 is idempotent: a second pass over its own output changes nothing', () => {
  const first = migrate({
    recipes: [recipe('r-1', ['med']), recipe('r-2')],
    tasks: [task('t-1', ['herb']), task('t-2')],
  });
  const second = migrateSubjectModifierMarks({
    systems: first.systems,
    recipes: first.recipes,
    gatheringConfig: first.gatheringConfig,
    characterLibraries: LIBRARIES,
  });
  assert.deepEqual(second.systems, first.systems);
  assert.deepEqual(second.recipes, first.recipes);
  assert.deepEqual(second.gatheringConfig, first.gatheringConfig);
});

test('1.33.0 is pure: the caller’s own payload is never mutated', () => {
  const systems = [system()];
  const recipes = [recipe('r-1', ['med']), recipe('r-2')];
  const snapshot = JSON.stringify({ systems, recipes });
  migrateSubjectModifierMarks({
    systems,
    recipes,
    gatheringConfig: gatheringConfig([]),
    characterLibraries: LIBRARIES,
  });
  assert.equal(JSON.stringify({ systems, recipes }), snapshot);
});

test('1.33.0 skips malformed input rather than throwing or repairing it', () => {
  assert.doesNotThrow(() => migrateSubjectModifierMarks());
  assert.doesNotThrow(() => migrateSubjectModifierMarks({ systems: 'not a list' }));
  assert.doesNotThrow(() => applySubjectModifierMarks(null));
  assert.doesNotThrow(() =>
    migrateSubjectModifierMarks({
      systems: [null, 7, system({ craftingCheck: 'junk' })],
      recipes: [null, recipe('r-1', ['med'])],
      gatheringConfig: { systems: { 'sys-1': { tasks: 'junk' } } },
      characterLibraries: LIBRARIES,
    })
  );
});

// ---------------------------------------------------------------------------
// Runner registration
// ---------------------------------------------------------------------------

test('the 1.33.0 registry entry declares a lossless downgrade to 1.32.0', () => {
  const runner = new MigrationRunner({ getSetting: () => undefined, setSetting: async () => {} });
  const entry = runner._migrations.find((migration) => migration.version === '1.33.0');
  assert.ok(entry, '1.33.0 is registered');
  assert.equal(entry.downgradeTo, '1.32.0');
  assert.equal(
    entry.downgradeLosesData,
    false,
    'the pass only ADDS a mark and an empty pick, and 1.32.0 rolls the same thing from both'
  );
});

test('the runner applies 1.33.0 across all three settings and bumps the version', async () => {
  const store = new Map([
    ['migrationVersion', '1.32.0'],
    ['craftingSystems', [system({ components: [component('c-1', ['alch']), component('c-2')] })]],
    ['recipes', [recipe('r-1', ['med']), recipe('r-2')]],
    ['gatheringConfig', gatheringConfig([task('t-1', ['herb']), task('t-2')])],
    ['characterLibraries', LIBRARIES],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.aborted, false);
  assert.equal(store.get('migrationVersion'), '1.34.0');
  const migrated = store.get('craftingSystems')[0];
  assert.deepEqual(migrated.craftingCheck.defaultModifierIds, ['med']);
  assert.deepEqual(migrated.salvageCraftingCheck.defaultModifierIds, ['alch']);
  assert.deepEqual(migrated.gatheringCraftingCheck.defaultModifierIds, ['herb']);
  assert.deepEqual(store.get('recipes')[1].craftingModifier, { modifierIds: [] });
  assert.deepEqual(
    store.get('gatheringConfig').systems['sys-1'].tasks[1].checkModifierIds,
    [],
    'the gathering setting is written back too, not only the systems'
  );
});

test('the runner does not re-run 1.33.0 once the world is at that version', async () => {
  const store = new Map([
    ['migrationVersion', '1.34.0'],
    ['craftingSystems', [system()]],
    ['recipes', [recipe('r-1', ['med'])]],
    ['gatheringConfig', gatheringConfig([])],
    ['characterLibraries', LIBRARIES],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const result = await runner.run();

  assert.equal(result.ran, 0);
  assert.deepEqual(
    store.get('craftingSystems')[0].craftingCheck.defaultModifierIds,
    [],
    'the gate holds: a GM who cleared the mark by hand keeps it cleared across reloads'
  );
});

// ---------------------------------------------------------------------------
// The IMPORT-side mirror — a bundle exported before the upgrade
// ---------------------------------------------------------------------------

test('the export upcast seeds a LEGACY bundle’s mark from its own recipes and tasks', () => {
  const upcast = migrateExportPayload({
    system: system({ components: [component('c-1', ['alch']), component('c-2')] }),
    recipes: [recipe('r-1', ['med']), recipe('r-2')],
    gatheringConfig: { system: { tasks: [task('t-1', ['herb']), task('t-2')] }, shared: {} },
    characterLibraries: LIBRARIES,
  });

  assert.deepEqual(upcast.system.craftingCheck.defaultModifierIds, ['med']);
  assert.deepEqual(upcast.system.salvageCraftingCheck.defaultModifierIds, ['alch']);
  assert.deepEqual(upcast.system.gatheringCraftingCheck.defaultModifierIds, ['herb']);
  assert.deepEqual(
    upcast.recipes[1].craftingModifier,
    { modifierIds: [] },
    'and the inheriting recipe is pinned here too, or the import would widen its roll'
  );
  assert.deepEqual(upcast.system.components[1].salvage.checkModifierIds, []);
  assert.deepEqual(upcast.gatheringConfig.system.tasks[1].checkModifierIds, []);
});

test('the export upcast reads a LEGACY bundle whose modifier library has not been lifted yet', () => {
  // A bundle predating the 1308 lift carries its library on the SYSTEM. The seed runs after the
  // upcast's own lift, so the catalogue is known by the time the intersection is taken.
  const upcast = migrateExportPayload({
    system: system({ modifiers: CATALOGUE }),
    recipes: [recipe('r-1', ['med'])],
    gatheringConfig: { system: {}, shared: {} },
  });
  assert.deepEqual(upcast.system.craftingCheck.defaultModifierIds, ['med']);
});

test('the export upcast leaves a CURRENT-schema bundle alone — there an empty mark is an ANSWER', () => {
  // Since issue 1608 an empty mark under `bySubject` MEANS “nothing is selectable”, so a GM who
  // un-marks the last row authors exactly the shape this seed keys on. The current-schema branch
  // runs on EVERY payload forever, so seeding there would revert that answer — and pin every
  // sibling subject of the activity — on every export/import round trip, which is the selection
  // triple round-trip `import-export/spec.md` § Round-trip integrity requires.
  const payload = {
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    system: system({ components: [component('c-1', ['alch']), component('c-2')] }),
    recipes: [recipe('r-1', ['med']), recipe('r-2')],
    gatheringConfig: { system: { tasks: [task('t-1', ['herb']), task('t-2')] }, shared: {} },
    characterLibraries: LIBRARIES,
  };
  const before = structuredClone(payload);

  const upcast = migrateExportPayload(payload);

  // The selection triple, which `import-export/spec.md` § Round-trip integrity names by field.
  // `failureResultPolicy` is a separate, legitimate branch-independent derivation and is not
  // part of the triple, so the comparison is per key rather than over the whole check.
  const triple = (check) => ({
    defaultModifierPolicy: check.defaultModifierPolicy,
    defaultModifierIds: check.defaultModifierIds,
    maxModifierPicks: check.maxModifierPicks,
  });
  for (const key of ['craftingCheck', 'salvageCraftingCheck', 'gatheringCraftingCheck']) {
    assert.deepEqual(
      triple(upcast.system[key]),
      triple(before.system[key]),
      `${key}'s selection triple must round-trip: the GM emptied this mark on purpose`
    );
  }
  assert.deepEqual(upcast.recipes, before.recipes, 'no recipe pick is rewritten or pinned');
  assert.deepEqual(
    upcast.system.components,
    before.system.components,
    'no component salvage pick is rewritten or pinned'
  );
  assert.deepEqual(
    upcast.gatheringConfig.system.tasks,
    before.gatheringConfig.system.tasks,
    'no gathering task pick is rewritten or pinned'
  );
});
