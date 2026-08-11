/**
 * Issue 1117 — 1.23.0: merge a system's TWO modifier libraries into one `system.modifiers`.
 *
 * The transform itself is small; what needs pinning is everything around it.
 *
 *  - THE MERGE ORDER and the retirement of BOTH old keys.
 *  - THE COLLISION RULE. Two independently authored libraries can carry the same id, and
 *    the resolution must be deterministic rather than last-write-wins. The check entry keeps
 *    the id and the gathering entry is re-keyed — because the gathering side's references
 *    all live inside the same `gatheringConfig` block this migration is already rewriting,
 *    so renaming it is a CLOSED rewrite, while the check side's references reach into the
 *    `recipes` world setting this migration never sees.
 *  - THE REFERENCE REWRITE. A re-key with no rewrite is silent data loss: the drop row would
 *    name an id the library no longer carries, and the gathering runtime reports that as a
 *    misconfigured attempt rather than as a missing modifier.
 *  - THE REGISTRY ENTRY, whose `downgradeLosesData` declaration is what routes the label
 *    into the registry-wide rule in `tests/migration-runner.test.js`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import {
  applyUnifiedModifierLibrary,
  migrateUnifyModifierLibraries,
} from '../src/migration/migrateUnifyModifierLibraries.js';
import { migrateExportPayload } from '../src/migration/migrateExportPayload.js';
import { FABRICATE_EXPORT_SCHEMA_VERSION } from '../src/systems/authoringExport.js';
import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';

const CHECK_LIBRARY = [
  { id: 'med', label: 'Medicine', expression: '@abilities.med.mod', min: -1, max: 5 },
  { id: 'nature', label: 'Nature', expression: '@skills.nat.mod' },
];

const GATHERING_LIBRARY = [
  { id: 'nature', label: 'Herbalism Training', expression: '@skills.nat.total' },
  { id: 'survival', label: 'Field Survival', expression: '@skills.sur.total' },
];

/** A world holding BOTH libraries, with gathering references into its own. */
function world() {
  return {
    systems: [
      {
        id: 'sys-1',
        name: 'Herbalism',
        checkModifiers: structuredClone(CHECK_LIBRARY),
        craftingCheck: { defaultModifierPolicy: 'addAll', defaultModifierIds: ['med', 'nature'] },
      },
    ],
    gatheringConfig: {
      systems: {
        'sys-1': {
          characterModifiers: structuredClone(GATHERING_LIBRARY),
          tasks: [
            {
              id: 'task-1',
              dropRows: [
                {
                  id: 'row-1',
                  characterModifiers: [
                    { id: 'ref-1', modifierId: 'nature', operator: '+' },
                    { id: 'ref-2', modifierId: 'survival', operator: '+' },
                  ],
                },
              ],
              staminaCostModifiers: [{ id: 'ref-3', modifierId: 'nature', operator: '-' }],
            },
          ],
          events: [
            {
              id: 'event-1',
              characterModifiers: [{ id: 'ref-4', modifierId: 'nature', operator: '-' }],
            },
          ],
        },
      },
    },
  };
}

const systemOf = (result) => result.systems[0];
const configOf = (result) => result.gatheringConfig.systems['sys-1'];

test('1.23.0 merges both libraries into system.modifiers and retires both old keys', () => {
  const result = migrateUnifyModifierLibraries(world());
  const system = systemOf(result);

  assert.deepEqual(
    system.modifiers.map((entry) => entry.id),
    ['med', 'nature', 'nature-gathering', 'survival'],
    'check entries first in their authored order, then gathering entries in theirs'
  );
  assert.equal(Object.hasOwn(system, 'checkModifiers'), false, 'the 1.22.0 key is retired');
  assert.equal(
    Object.hasOwn(configOf(result), 'characterModifiers'),
    false,
    'and so is the gathering one — two locations for one library is how two surfaces come ' +
      'to disagree about which is authoritative'
  );
  // The MERGED entries are carried verbatim: this migration relocates, it does not normalize.
  assert.deepEqual(
    system.modifiers[0],
    CHECK_LIBRARY[0],
    'a bounded check entry keeps both bounds through the move'
  );
});

test('1.23.0 resolves an id collision by re-keying the GATHERING entry, deterministically', () => {
  const result = migrateUnifyModifierLibraries(world());
  const system = systemOf(result);
  const byId = new Map(system.modifiers.map((entry) => [entry.id, entry]));

  assert.equal(
    byId.get('nature').label,
    'Nature',
    'the CHECK entry keeps the id: its references live in the `recipes` setting this ' +
      'migration cannot rewrite'
  );
  assert.equal(
    byId.get('nature-gathering').label,
    'Herbalism Training',
    'the gathering entry survives under a derived id rather than being overwritten'
  );
  assert.equal(byId.get('nature-gathering').expression, '@skills.nat.total');

  // DETERMINISTIC, not merely "not last-write-wins": the same input yields the same ids on
  // every run, so two GMs upgrading the same world land in the same place.
  const again = migrateUnifyModifierLibraries(world());
  assert.deepEqual(
    systemOf(again).modifiers,
    system.modifiers,
    'a second run over the same input produces byte-identical ids'
  );
});

test('1.23.0 rewrites EVERY gathering reference to a re-keyed entry', () => {
  const result = migrateUnifyModifierLibraries(world());
  const config = configOf(result);
  const task = config.tasks[0];

  assert.deepEqual(
    task.dropRows[0].characterModifiers.map((ref) => ref.modifierId),
    ['nature-gathering', 'survival'],
    'a drop-row reference follows the entry it named; an uncollided one is untouched'
  );
  assert.deepEqual(
    task.staminaCostModifiers.map((ref) => ref.modifierId),
    ['nature-gathering'],
    'and so does a stamina-cost reference'
  );
  assert.deepEqual(
    config.events[0].characterModifiers.map((ref) => ref.modifierId),
    ['nature-gathering'],
    'and an event reference'
  );

  // The invariant those three assertions exist to protect, stated once: every reference
  // resolves. A rename with a missed site is not a partial success, it is a misconfigured
  // gathering attempt at runtime.
  const libraryIds = new Set(systemOf(result).modifiers.map((entry) => entry.id));
  const referenced = [
    ...task.dropRows.flatMap((row) => row.characterModifiers.map((ref) => ref.modifierId)),
    ...task.staminaCostModifiers.map((ref) => ref.modifierId),
    ...config.events.flatMap((event) => event.characterModifiers.map((ref) => ref.modifierId)),
  ];
  assert.deepEqual(referenced.filter((id) => !libraryIds.has(id)), []);
});

test('1.23.0 keeps counting up when the derived id is ALSO taken', () => {
  const data = world();
  data.systems[0].checkModifiers.push({ id: 'nature-gathering', label: 'Decoy', expression: '@x' });
  const system = systemOf(migrateUnifyModifierLibraries(data));
  const ids = system.modifiers.map((entry) => entry.id);
  assert.ok(ids.includes('nature-gathering-2'), 'the search walks past a taken derived id');
  assert.equal(new Set(ids).size, ids.length, 'and every id in the merged library is unique');
});

test('1.23.0 is idempotent, and never clobbers an authored unified library', () => {
  const once = migrateUnifyModifierLibraries(world());
  const twice = migrateUnifyModifierLibraries(once);
  assert.deepEqual(twice.systems, once.systems, 'a second pass finds nothing to do');
  assert.deepEqual(twice.gatheringConfig, once.gatheringConfig);

  // A half-migrated system CONVERGES: the unified library wins and the legacy keys are
  // dropped without overwriting it. That is what makes idempotence independent of the
  // version gate, which the View Lab depends on directly.
  const half = world();
  half.systems[0].modifiers = [{ id: 'authored', label: 'Authored', expression: '@a' }];
  const converged = migrateUnifyModifierLibraries(half);
  assert.deepEqual(
    systemOf(converged).modifiers.map((entry) => entry.id),
    ['authored'],
    'an authored unified library is never clobbered'
  );
  assert.equal(Object.hasOwn(systemOf(converged), 'checkModifiers'), false);
  assert.equal(Object.hasOwn(configOf(converged), 'characterModifiers'), false);
});

test('1.23.0 seeds nothing onto a system that carries neither library', () => {
  const data = { systems: [{ id: 'sys-bare', name: 'Bare' }], gatheringConfig: { systems: {} } };
  const system = systemOf(migrateUnifyModifierLibraries(data));
  assert.equal(
    Object.hasOwn(system, 'modifiers'),
    false,
    'writing an empty array would be storage churn for zero observable change; the ' +
      'normalizer defaults it on the next read'
  );
});

test('1.23.0 skips a malformed legacy value rather than deleting it', () => {
  const data = world();
  data.systems[0].checkModifiers = 'not a library';
  const system = systemOf(migrateUnifyModifierLibraries(data));
  assert.equal(
    system.checkModifiers,
    'not a library',
    'deleting a value it cannot read is a repair, on the one path where the GM has no copy ' +
      'left; the allowlist rebuild drops it on the next save anyway'
  );
  assert.deepEqual(
    system.modifiers.map((entry) => entry.id),
    ['nature', 'survival'],
    'and the readable half still merges'
  );
});

test('1.23.0 is PURE: the input payload is never mutated', () => {
  const data = world();
  const snapshot = structuredClone(data);
  migrateUnifyModifierLibraries(data);
  assert.deepEqual(data, snapshot, 'the runner restores its checkpoint only on a FATAL abort');
});

test('the runner applies 1.23.0, reports the collisions and never persists the transient field', async () => {
  const data = world();
  const store = new Map([
    ['migrationVersion', '1.22.0'],
    ['craftingSystems', data.systems],
    ['gatheringConfig', data.gatheringConfig],
    ['recipes', []],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });

  const summary = await runner.run();

  // TWO, not one: issue 1096's 1.24.0 entry is a deliberate no-op that exists to mark the
  // routed DC-source downgrade boundary, and the runner counts every entry it applies.
  assert.equal(summary.ran, 2);
  assert.equal(store.get('migrationVersion'), '1.24.0');
  assert.deepEqual(summary.unifiedModifierCollisions, [{ system: 'Herbalism', collisions: 1 }]);
  for (const key of ['craftingSystems', 'gatheringConfig']) {
    assert.ok(
      !JSON.stringify(store.get(key)).includes('_unifiedModifierCollisions'),
      `the transient report is never persisted into ${key}`
    );
  }
  assert.ok(
    store.get('craftingSystems')[0].modifiers.some((entry) => entry.id === 'nature-gathering')
  );
});

test('the runner reports NO collision for a clean merge', async () => {
  const data = world();
  data.systems[0].checkModifiers = [{ id: 'med', label: 'Medicine', expression: '@med' }];
  const store = new Map([
    ['migrationVersion', '1.22.0'],
    ['craftingSystems', data.systems],
    ['gatheringConfig', data.gatheringConfig],
    ['recipes', []],
  ]);
  const summary = await new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  }).run();
  assert.deepEqual(summary.unifiedModifierCollisions, [], 'a clean merge is silent');
});

test('1.23.0 is registered as the highest version, with a downgrade target that states the loss', () => {
  // The registry is not exported, so it is read the way the runner reads it — through a real
  // instance. A copy of the list here would be a second registry to keep in sync.
  const registry = new MigrationRunner({ getSetting: () => undefined, setSetting: () => {} })
    ._migrations;
  const entry = registry.find((migration) => migration.version === '1.23.0');
  assert.ok(entry, 'the migration is registered, or it never runs');
  assert.equal(entry.downgradeTo, '1.22.0');
  assert.equal(
    entry.downgradeLosesData,
    true,
    'a downgraded world drops the merged library on the first read, and the registry rule ' +
      'turns that declaration into a required sentence in the label'
  );
  assert.match(
    entry.label,
    /LOAD-BEARING/,
    'the label names the runner-ordering precondition the merge depends on'
  );
  // NOT the tail of the registry any more: issue 1096's routed DC-source entry follows it.
  // Asserting its POSITION rather than its presence is what this is for — an entry inserted
  // out of version order would run at the wrong point.
  assert.ok(
    registry.findIndex((migration) => migration.version === '1.23.0') < registry.length,
    'the entry is registered in version order'
  );
});

test('the export upcast merges an imported bundle’s two libraries', () => {
  const data = world();
  const bundle = {
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    system: data.systems[0],
    recipes: [],
    gatheringConfig: { system: data.gatheringConfig.systems['sys-1'], shared: {} },
  };
  const migrated = migrateExportPayload(bundle);

  assert.deepEqual(
    migrated.system.modifiers.map((modifier) => modifier.id),
    ['med', 'nature', 'nature-gathering', 'survival']
  );
  assert.equal(Object.hasOwn(migrated.system, 'checkModifiers'), false);
  assert.equal(Object.hasOwn(migrated.gatheringConfig.system, 'characterModifiers'), false);
  assert.deepEqual(
    migrated.gatheringConfig.system.tasks[0].dropRows[0].characterModifiers.map(
      (ref) => ref.modifierId
    ),
    ['nature-gathering', 'survival'],
    'and the bundle’s own references are rewritten, exactly as a world’s are'
  );
  // …and the input is never aliased.
  assert.ok(Array.isArray(bundle.system.checkModifiers), 'the input is untouched');
});

// THE OTHER END OF THE LADDER'S ORDERING, and the reason the pre-1.22.0 location has to be
// upcast BEFORE this merge runs: reading only the system-level key would merge an empty
// catalogue and then retire it, silently dropping every check modifier in the bundle.
test('the export upcast composes with 1.22.0: a PRE-1.22.0 bundle keeps its catalogue', () => {
  const migrated = migrateExportPayload({
    fabricateVersion: '1.0.0',
    system: {
      id: 'sys-legacy',
      craftingCheck: { checkModifiers: structuredClone(CHECK_LIBRARY) },
    },
  });
  assert.deepEqual(
    migrated.system.modifiers.map((entry) => entry.id),
    ['med', 'nature'],
    'the 1.22.0 lift runs first, so the merge finds the catalogue where it now lives'
  );
});

// The whole point of the move: ONE library, read by the normalizer that owns it.
test('the merged library normalizes as the system library, bounds and all', () => {
  const merged = systemOf(migrateUnifyModifierLibraries(world()));
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const normalized = manager._normalizeSystem(merged);
  assert.deepEqual(
    normalized.modifiers.map((entry) => entry.id),
    ['med', 'nature', 'nature-gathering', 'survival']
  );
  assert.equal(normalized.modifiers[0].min, -1);
  assert.equal(normalized.modifiers[0].max, 5);
  assert.equal(normalized.modifiers[0].isRollExpression, false);
  assert.deepEqual(
    normalized.craftingCheck.defaultModifierIds,
    ['med', 'nature'],
    'and the crafting selection still resolves against it'
  );
});

// The shared per-system transform is what lets the world migration and the export upcast
// have ONE derivation rather than two copies. It is exercised directly so a caller that
// hands it a system with no gathering block is covered.
test('applyUnifiedModifierLibrary tolerates an absent gathering block', () => {
  const system = { id: 's', checkModifiers: structuredClone(CHECK_LIBRARY) };
  assert.equal(applyUnifiedModifierLibrary(system), 0, 'no gathering entries, no collisions');
  assert.deepEqual(
    system.modifiers.map((entry) => entry.id),
    ['med', 'nature']
  );
  assert.equal(Object.hasOwn(system, 'checkModifiers'), false);
});
