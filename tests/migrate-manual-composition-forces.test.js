/**
 * Issue 1315 — 1.29.0: force add belongs to AUTOMATIC composition mode.
 *
 * Manual mode composes exactly the library-enabled records in `enabled*Ids`, so a manual
 * environment has no filter left for a force to override. Force add nevertheless RENDERS in
 * manual mode in every shipped version — that is the defect 1315 reports — so real worlds
 * hold manual environments whose composed records live only in `forced*Ids`. This migration
 * folds those into the picked lists before the rule changes under them, and then clears every
 * force list in the world.
 *
 * These cover the pure transform, the runner registration and version gate, the SECOND
 * ingress (an export bundle upcast on import), and the View Lab world as a real corpus.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateExportPayload } from '../src/migration/migrateExportPayload.js';
import {
  applyManualCompositionForceFold,
  migrateManualCompositionForces,
} from '../src/migration/migrateManualCompositionForces.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

import { buildLabContent } from './view-lab/world/labContent.js';
import { environmentComposesRecord } from '../src/systems/gatheringComposition.js';

/** The schema version `migrateExportPayload` upcasts to, read off the module under test. */
const CURRENT_EXPORT_SCHEMA = migrateExportPayload({}).schemaVersion;

/**
 * A manual environment whose picked and forced lists both carry entries, so one fixture
 * exercises the append, the order and the clear at once.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function manualEnvironment(overrides = {}) {
  return {
    id: 'env-thicket',
    craftingSystemId: 'sys',
    name: 'Shadow Thicket',
    compositionMode: 'manual',
    enabledTaskIds: ['task-picked'],
    forcedTaskIds: ['task-forced'],
    enabledEventIds: ['event-picked'],
    forcedEventIds: ['event-forced'],
    taskOrder: ['task-forced', 'task-picked'],
    eventOrder: ['event-forced', 'event-picked'],
    ...overrides,
  };
}

/**
 * The `{ enabled*, forced* }` projection of an environment — what this migration is about,
 * with the identity and display fields that it must never touch dropped so a failure reads
 * as the composition change it is.
 *
 * @param {object} environment
 * @returns {object}
 */
function compositionKeys(environment) {
  const picked = {};
  for (const key of [
    'enabledTaskIds',
    'enabledEventIds',
    'disabledTaskIds',
    'disabledEventIds',
    'forcedTaskIds',
    'forcedEventIds',
    'taskOrder',
    'eventOrder',
  ]) {
    if (Object.prototype.hasOwnProperty.call(environment, key)) picked[key] = environment[key];
  }
  return picked;
}

/**
 * Drive the real registry through the real runner over an in-memory setting store.
 *
 * @param {object} [initial] Seed settings, merged over the empty-world defaults.
 * @returns {{ store: Map<string, any>, writes: string[], run: () => Promise<object> }}
 */
function makeLadder(initial = {}) {
  const store = new Map(
    Object.entries({
      recipes: [],
      craftingSystems: [],
      gatheringConfig: {},
      gatheringEnvironments: [],
      migrationVersion: '1.28.0',
      ...initial,
    })
  );
  const writes = [];
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key) ?? null,
    setSetting: async (key, value) => {
      writes.push(key);
      store.set(key, value);
      return value;
    },
  });
  return { store, writes, run: () => runner.run() };
}

/** The migrated environments of a ladder run, by id. */
const environmentsById = (store) =>
  new Map(store.get('gatheringEnvironments').map((environment) => [environment.id, environment]));

// ---------------------------------------------------------------------------
// The fold, on manual environments
// ---------------------------------------------------------------------------

test('1.29.0 folds a manual environment’s force lists into its picked lists and clears them', () => {
  const { environments, migratedCount } = applyManualCompositionForceFold([manualEnvironment()]);

  assert.equal(migratedCount, 1);
  assert.deepEqual(environments[0].enabledTaskIds, ['task-picked', 'task-forced']);
  assert.deepEqual(environments[0].enabledEventIds, ['event-picked', 'event-forced']);
  assert.ok(!('forcedTaskIds' in environments[0]), 'the task force list is cleared');
  assert.ok(!('forcedEventIds' in environments[0]), 'the event force list is cleared');
});

test('1.29.0 folds a manual environment whose ENTIRE composed set is force-added', () => {
  // The shape every real world hit by this defect carries, and the one the fold exists for:
  // no picked list at all, so without the fold this environment composes nothing afterwards.
  const [migrated] = applyManualCompositionForceFold([
    manualEnvironment({ enabledTaskIds: undefined, forcedTaskIds: ['task-a', 'task-b'] }),
  ]).environments;

  assert.deepEqual(migrated.enabledTaskIds, ['task-a', 'task-b']);
});

test('1.29.0 de-duplicates a record that is in BOTH lists, so it appears exactly once', () => {
  const [migrated] = applyManualCompositionForceFold([
    manualEnvironment({
      enabledTaskIds: ['task-both', 'task-picked'],
      forcedTaskIds: ['task-both', 'task-forced'],
      enabledEventIds: ['event-both'],
      forcedEventIds: ['event-both'],
    }),
  ]).environments;

  assert.deepEqual(migrated.enabledTaskIds, ['task-both', 'task-picked', 'task-forced']);
  assert.deepEqual(migrated.enabledEventIds, ['event-both']);
});

test('1.29.0 leaves taskOrder and eventOrder untouched and keeps the picked order', () => {
  const before = manualEnvironment({ enabledTaskIds: ['task-z', 'task-a'] });
  const [migrated] = applyManualCompositionForceFold([before]).environments;

  // Display order is a separate concern from membership, and the fold has no business in it.
  assert.deepEqual(migrated.taskOrder, before.taskOrder);
  assert.deepEqual(migrated.eventOrder, before.eventOrder);
  // Existing entries keep their positions; folded ids are APPENDED, never interleaved.
  assert.deepEqual(migrated.enabledTaskIds, ['task-z', 'task-a', 'task-forced']);
});

test('1.29.0 preserves the force list’s own order when it folds more than one id', () => {
  const [migrated] = applyManualCompositionForceFold([
    manualEnvironment({ enabledTaskIds: [], forcedTaskIds: ['task-c', 'task-a', 'task-b'] }),
  ]).environments;

  assert.deepEqual(migrated.enabledTaskIds, ['task-c', 'task-a', 'task-b']);
});

// ---------------------------------------------------------------------------
// The mode predicate — strict `=== 'manual'`, everything else is automatic
// ---------------------------------------------------------------------------

test('1.29.0 treats every non-manual mode shape as automatic: it clears, and never folds', () => {
  // Strict equality, matching `resolveGatheringCompositionMode` and the store's
  // `VALID_COMPOSITION_MODES` gate. Reading any of these as manual would fold force entries
  // into a list automatic mode ignores, silently GAINING the environment a record.
  const shapes = [
    ['absent', {}],
    ['undefined', { compositionMode: undefined }],
    ['null', { compositionMode: null }],
    ['Manual', { compositionMode: 'Manual' }],
    ['MANUAL', { compositionMode: 'MANUAL' }],
    ['42', { compositionMode: 42 }],
    ['{}', { compositionMode: {} }],
  ];

  for (const [label, override] of shapes) {
    const source = manualEnvironment({ compositionMode: undefined, ...override });
    const [migrated] = applyManualCompositionForceFold([source]).environments;
    assert.deepEqual(migrated.enabledTaskIds, ['task-picked'], `${label}: picked list untouched`);
    assert.deepEqual(migrated.enabledEventIds, ['event-picked'], `${label}: picked list untouched`);
    assert.ok(!('forcedTaskIds' in migrated), `${label}: residue is cleared anyway`);
    assert.ok(!('forcedEventIds' in migrated), `${label}: residue is cleared anyway`);
  }
});

// ---------------------------------------------------------------------------
// Nothing to do — returned by reference
// ---------------------------------------------------------------------------

test('1.29.0 returns an environment with no force entries BY REFERENCE, migratedCount 0', () => {
  // Copy-on-write is what keeps an upgrade from rewriting the environment list of every world
  // that never force-added anything: the runner detects change by `JSON.stringify`.
  const empties = [
    ['absent', {}],
    ['empty array', { forcedTaskIds: [], forcedEventIds: [] }],
    ['null', { forcedTaskIds: null, forcedEventIds: null }],
  ];

  for (const [label, override] of empties) {
    const source = manualEnvironment({
      forcedTaskIds: undefined,
      forcedEventIds: undefined,
      ...override,
    });
    if (!Object.prototype.hasOwnProperty.call(override, 'forcedTaskIds')) {
      delete source.forcedTaskIds;
      delete source.forcedEventIds;
    }
    const corpus = [source];
    const result = applyManualCompositionForceFold(corpus);
    assert.equal(result.migratedCount, 0, `${label}: nothing was migrated`);
    assert.ok(result.environments === corpus, `${label}: the corpus array itself is returned`);
    assert.ok(result.environments[0] === source, `${label}: the environment itself is returned`);
  }
});

test('1.29.0 leaves an ALREADY EMPTY force list exactly as it found it, key and all', () => {
  // The pinned decision, from the other side: a cleared list is a DELETED KEY rather than
  // `[]`, but a list that is already empty has nothing to clear, so normalising its shape
  // would be churn this migration was not asked for.
  const source = manualEnvironment({ forcedTaskIds: [], forcedEventIds: [] });
  const [migrated] = applyManualCompositionForceFold([source]).environments;

  assert.ok('forcedTaskIds' in migrated, 'the empty key is neither deleted nor rewritten');
  assert.deepEqual(migrated.forcedTaskIds, []);
});

test('1.29.0 clears a force list by DELETING the key, never by writing an empty array', () => {
  // Pinned, because both shapes exist in the wild and consumers must tolerate either:
  // `GatheringEnvironmentStore._normalizeEnvironment` emits `forced*Ids` only when non-empty,
  // so absence is the shape the world's own next save produces, and writing `[]` would invent
  // a shape this module never writes for itself.
  const [migrated] = applyManualCompositionForceFold([manualEnvironment()]).environments;

  assert.deepEqual(
    Object.keys(migrated).filter((key) => key.startsWith('forced')),
    []
  );
  // `"forced` rather than `forced`: the fixture's own ids END in "forced", and a substring
  // check that matched them would pass whatever the migration did.
  assert.equal(JSON.stringify(migrated).includes('"forced'), false);
});

test('1.29.0 never CREATES a picked list a fold could not populate', () => {
  const [migrated] = applyManualCompositionForceFold([
    { id: 'env', compositionMode: 'manual', forcedTaskIds: [null, undefined, ''] },
  ]).environments;

  assert.ok(!('enabledTaskIds' in migrated), 'no id survived normalisation, so no key is stamped');
  assert.ok(!('forcedTaskIds' in migrated), 'the force list is still cleared');
});

// ---------------------------------------------------------------------------
// Malformed input, permutation, idempotency
// ---------------------------------------------------------------------------

test('1.29.0 tolerates junk in a force list without throwing', () => {
  const [migrated] = applyManualCompositionForceFold([
    manualEnvironment({ enabledTaskIds: [], forcedTaskIds: [null, 42, {}] }),
  ]).environments;

  // `null` is dropped exactly as `GatheringEnvironmentStore.normalizeIdList` drops it; `42`
  // and `{}` are KEPT as their string forms, because the store keeps them too and a migration
  // that discarded an id the running engine honours would lose a composed record.
  assert.deepEqual(migrated.enabledTaskIds, ['42', '[object Object]']);
});

test('1.29.0 tolerates a malformed corpus and non-object entries without throwing', () => {
  assert.deepEqual(applyManualCompositionForceFold(undefined), {
    environments: undefined,
    migratedCount: 0,
  });
  assert.deepEqual(applyManualCompositionForceFold(null), { environments: null, migratedCount: 0 });

  const corpus = [null, 42, 'nonsense', []];
  const result = applyManualCompositionForceFold(corpus);
  assert.equal(result.migratedCount, 0);
  assert.ok(result.environments === corpus, 'nothing changed, so the input array comes back');
});

test('1.29.0 gives a set-equal result over a permuted corpus', () => {
  const corpus = [
    manualEnvironment({ id: 'env-a' }),
    manualEnvironment({ id: 'env-b', compositionMode: 'automatic' }),
    manualEnvironment({ id: 'env-c', enabledTaskIds: ['task-forced'] }),
  ];
  const permuted = [corpus[2], corpus[0], corpus[1]];

  const first = applyManualCompositionForceFold(corpus).environments;
  const second = applyManualCompositionForceFold(permuted).environments;

  const byId = (list) =>
    Object.fromEntries(list.map((environment) => [environment.id, JSON.stringify(environment)]));
  assert.deepEqual(byId(second), byId(first), 'position in the corpus decides nothing');
});

test('1.29.0 is idempotent: a second run is byte-identical with migratedCount 0', () => {
  const first = applyManualCompositionForceFold([
    manualEnvironment(),
    manualEnvironment({ id: 'env-auto', compositionMode: 'automatic' }),
  ]);
  const second = applyManualCompositionForceFold(first.environments);

  assert.equal(first.migratedCount, 2);
  assert.equal(second.migratedCount, 0, 'the second pass finds nothing left to do');
  assert.equal(JSON.stringify(second.environments), JSON.stringify(first.environments));
  assert.ok(second.environments === first.environments, 'and it returns the same array');
});

test('the runner adapter returns only the environments key, and omits it when there is none', () => {
  // The runner spread-merges a migration's return value into the payload, so returning
  // `{ environments: undefined }` would BLANK the setting rather than leave it alone.
  assert.deepEqual(migrateManualCompositionForces({}), {});
  assert.deepEqual(migrateManualCompositionForces(), {});
  assert.deepEqual(Object.keys(migrateManualCompositionForces({ environments: [] })), [
    'environments',
  ]);
});

// ---------------------------------------------------------------------------
// Registered in the runner, and reached
// ---------------------------------------------------------------------------

test('the runner runs 1.29.0 from 1.28.0 and bumps the version', async () => {
  // Starts at 1.28.0, the version immediately below, so the assertions below measure this
  // migration rather than the whole ladder.
  const ladder = makeLadder({ gatheringEnvironments: [manualEnvironment()] });

  const summary = await ladder.run();

  assert.equal(summary.aborted, false);
  assert.equal(summary.ran, 1, 'exactly one pending migration');
  assert.equal(ladder.store.get('migrationVersion'), '1.29.0');
  const migrated = ladder.store.get('gatheringEnvironments')[0];
  assert.deepEqual(migrated.enabledTaskIds, ['task-picked', 'task-forced']);
  assert.ok(!('forcedTaskIds' in migrated));
  assert.ok(ladder.writes.includes('gatheringEnvironments'), 'the environments leg is written');
});

test('1.29.0 is version-gated: it does not re-enter a world already at or past it', async () => {
  // The SECOND idempotency proof, and a different one from the pure function's: even a
  // migration that was not idempotent could not run twice through the runner.
  for (const version of ['1.29.0', '1.30.0']) {
    const ladder = makeLadder({
      migrationVersion: version,
      gatheringEnvironments: [manualEnvironment()],
    });

    const summary = await ladder.run();

    assert.equal(summary.ran, 0, `${version}: nothing pending`);
    assert.deepEqual(ladder.writes, [], `${version}: nothing is persisted`);
    assert.deepEqual(
      ladder.store.get('gatheringEnvironments')[0].forcedTaskIds,
      ['task-forced'],
      `${version}: the force list is left exactly as found`
    );
  }
});

test('1.29.0 composes with the neighbouring 1.28.0 migration in one pass', async () => {
  const ladder = makeLadder({
    migrationVersion: '1.27.0',
    craftingSystems: [{ id: 'sys', modifiers: [{ id: 'perception', label: 'Perception' }] }],
    gatheringEnvironments: [manualEnvironment()],
  });

  const summary = await ladder.run();

  assert.equal(summary.ran, 2, '1.28.0 and 1.29.0 both run');
  assert.equal(ladder.store.get('migrationVersion'), '1.29.0');
  // 1.28.0's leg still lands …
  assert.deepEqual(
    ladder.store.get('characterLibraries').modifiers.map((entry) => entry.id),
    ['perception']
  );
  // … and so does this one, in the same pass.
  assert.deepEqual(ladder.store.get('gatheringEnvironments')[0].enabledTaskIds, [
    'task-picked',
    'task-forced',
  ]);
});

test('1.29.0 composes with the 1.0.0 hazard rename, which is what produces its input key', async () => {
  // A world old enough to carry `forcedHazardIds` reaches this migration only because 1.0.0
  // renamed the key first; running the two in one pass is what proves the ladder joins up.
  const ladder = makeLadder({
    migrationVersion: '0.9.0',
    gatheringEnvironments: [
      {
        id: 'env-legacy',
        compositionMode: 'manual',
        enabledHazardIds: ['event-picked'],
        forcedHazardIds: ['event-forced'],
      },
    ],
  });

  await ladder.run();

  const migrated = ladder.store.get('gatheringEnvironments')[0];
  assert.deepEqual(migrated.enabledEventIds, ['event-picked', 'event-forced']);
  assert.ok(!('forcedEventIds' in migrated));
  assert.ok(!('forcedHazardIds' in migrated));
});

// ---------------------------------------------------------------------------
// The second ingress: an export bundle upcast on import
// ---------------------------------------------------------------------------

test('the export upcast applies the SAME fold, on a current-schema bundle', () => {
  // Branch-independent: every bundle the shipping build writes carries the current schema, so
  // a transform reachable only from the legacy branch would never run on a real bundle.
  const upcast = migrateExportPayload({
    schemaVersion: CURRENT_EXPORT_SCHEMA,
    system: { id: 'sys' },
    gatheringEnvironments: [manualEnvironment()],
  });

  assert.deepEqual(upcast.gatheringEnvironments[0].enabledTaskIds, ['task-picked', 'task-forced']);
  assert.ok(!('forcedTaskIds' in upcast.gatheringEnvironments[0]));
});

test('an automatic force list composed NOTHING before the upgrade, so clearing it drops no record', () => {
  // The migration's label promises a GM that no environment loses or gains a composed record, and
  // the automatic half of that promise rests on a claim about the ENGINE, not about the editor:
  // "force add never rendered in automatic mode" is a statement about the control, and a reader
  // could reasonably wonder whether the engine honoured a force list anyway. It did not.
  //
  // Captured from the rule as it stood at be04f069, the commit this branch is based on:
  //   automatic: matches && !disabled          — `forced*Ids` is not consulted at all
  //   manual:    forced || (matches && enabled)
  const composedBefore = (environment, record, mode, matches) => {
    const id = String(record.id);
    const list = (key) => (Array.isArray(environment[key]) ? environment[key].map(String) : []);
    if (mode === 'manual') {
      if (list('forcedTaskIds').includes(id)) return true;
      return Boolean(matches) && list('enabledTaskIds').includes(id);
    }
    return Boolean(matches) && !list('disabledTaskIds').includes(id);
  };

  const residue = {
    id: 'env-auto-residue',
    compositionMode: 'automatic',
    enabledTaskIds: [],
    forcedTaskIds: ['task-forced'],
  };
  const record = { id: 'task-forced', enabled: true };

  // Before: the force entry composed nothing, because automatic mode never read the list.
  assert.equal(
    composedBefore(residue, record, 'automatic', false),
    false,
    'an automatic force entry composed nothing before the upgrade'
  );

  // After the RULE change but before the migration, the same entry WOULD compose — which is
  // precisely why the migration clears it rather than leaving it to activate silently.
  assert.equal(
    environmentComposesRecord(residue, record, 'task', 'automatic', false),
    true,
    'the new rule would honour it, which is what the clear exists to prevent'
  );

  // After the migration: no list, so nothing composes. Net across both, no record is gained.
  const { environments } = applyManualCompositionForceFold([structuredClone(residue)]);
  assert.ok(!('forcedTaskIds' in environments[0]), 'the residue is cleared');
  assert.equal(
    environmentComposesRecord(environments[0], record, 'task', 'automatic', false),
    false,
    'and the environment composes exactly what it composed before the upgrade: nothing'
  );
});

test('the export upcast applies the SAME fold, on a legacy bundle', () => {
  const upcast = migrateExportPayload({
    fabricateVersion: '0.9.0',
    system: { id: 'sys' },
    gatheringEnvironments: [manualEnvironment({ compositionMode: 'automatic' })],
  });

  assert.equal(upcast.schemaVersion, CURRENT_EXPORT_SCHEMA);
  // Automatic residue is cleared here too, for the same reason it is in a world: it composed
  // nothing before the upgrade and must compose nothing after it.
  assert.deepEqual(upcast.gatheringEnvironments[0].enabledTaskIds, ['task-picked']);
  assert.ok(!('forcedTaskIds' in upcast.gatheringEnvironments[0]));
});

test('the export upcast reaches the same fixed point as the world migration', () => {
  const environments = [manualEnvironment(), manualEnvironment({ id: 'env-b' })];
  const world = applyManualCompositionForceFold(structuredClone(environments)).environments;
  const bundle = migrateExportPayload({
    schemaVersion: CURRENT_EXPORT_SCHEMA,
    system: { id: 'sys' },
    gatheringEnvironments: structuredClone(environments),
  });

  assert.deepEqual(bundle.gatheringEnvironments, world, 'one transform, two ingresses');
  // And upcasting an already-upcast bundle changes nothing further.
  assert.deepEqual(
    migrateExportPayload(bundle).gatheringEnvironments,
    bundle.gatheringEnvironments
  );
});

// ---------------------------------------------------------------------------
// The View Lab world, as a real corpus
//
// It already holds two manual environments whose ENTIRE composed task set lives in their
// force lists, which is exactly the shape this migration exists for. The expectations below
// were CAPTURED from the pre-change engine — `environmentComposesRecord` at `be04f069`, run
// over `buildLabContent()` — rather than derived from the code they test, and they are pinned
// as literals so that the engine flip landing in a sibling lane cannot move them.
// ---------------------------------------------------------------------------

const LAB_COMPOSED_BEFORE = Object.freeze({
  'hb-env-thicket': {
    tasks: ['hb-task-forage', 'hb-task-fungi'],
    events: ['hb-event-wolves', 'hb-event-storm'],
  },
  'sm-env-deepvault': { tasks: ['sm-task-prospect'], events: ['sm-event-collapse'] },
});

test('no manual View Lab environment loses a composed record, in membership or order', async () => {
  const content = buildLabContent();
  const ladder = makeLadder({
    migrationVersion: '1.28.0',
    craftingSystems: structuredClone(content.systems),
    gatheringConfig: structuredClone(content.gatheringConfig),
    gatheringEnvironments: structuredClone(content.environments),
  });

  await ladder.run();
  const after = environmentsById(ladder.store);

  for (const [id, composed] of Object.entries(LAB_COMPOSED_BEFORE)) {
    const environment = after.get(id);
    assert.equal(environment.compositionMode, 'manual', `${id} is the manual case under test`);
    // Manual mode now composes exactly the library-enabled records in `enabled*Ids`, so the
    // picked list IS the composed list, and it must reproduce the captured one exactly.
    assert.deepEqual(environment.enabledTaskIds, composed.tasks, `${id} keeps its composed tasks`);
    assert.deepEqual(
      environment.enabledEventIds,
      composed.events,
      `${id} keeps its composed events`
    );
    assert.ok(!('forcedTaskIds' in environment), `${id}: the force list is cleared`);
  }
});

test('no automatic View Lab environment gains one: its composition keys are untouched', async () => {
  const content = buildLabContent();
  const before = new Map(
    content.environments.map((environment) => [environment.id, compositionKeys(environment)])
  );
  const ladder = makeLadder({
    migrationVersion: '1.28.0',
    craftingSystems: structuredClone(content.systems),
    gatheringConfig: structuredClone(content.gatheringConfig),
    gatheringEnvironments: structuredClone(content.environments),
  });

  await ladder.run();
  const after = environmentsById(ladder.store);

  for (const [id, keys] of before) {
    if (after.get(id).compositionMode === 'manual') continue;
    assert.deepEqual(compositionKeys(after.get(id)), keys, `${id} is byte-identical`);
  }
});
