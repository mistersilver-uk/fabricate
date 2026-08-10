/**
 * Issue 1095 — 1.22.0: lift the check-modifier catalogue to the system level and rename
 * `byRecipe` to `bySubject`.
 *
 * The migration's two failure modes are both silent. A move that clobbered an authored
 * system-level catalogue would destroy data with no error; a move that left the old key in
 * place would give one catalogue two locations, and `_normalizeCraftingCheck` (an allowlist
 * rebuild that no longer emits it) would drop whichever one the GM edited last. Neither
 * announces itself, so both are asserted here.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { MigrationRunner } from '../src/migration/MigrationRunner.js';
import { migrateExportPayload } from '../src/migration/migrateExportPayload.js';
import {
  applySystemCheckModifierCatalogue,
  migrateSystemCheckModifierCatalogue,
} from '../src/migration/migrateSystemCheckModifierCatalogue.js';
import { FABRICATE_EXPORT_SCHEMA_VERSION } from '../src/systems/authoringExport.js';

const CATALOGUE = [
  { id: 'med', label: 'Medicine', expression: '@abilities.med.mod' },
  { id: 'alch', label: 'Alchemy', expression: '@abilities.alch.mod' },
];

/** A pre-1.22.0 system: the catalogue lives INSIDE `craftingCheck`. */
function legacySystem(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Herbalism',
    craftingCheck: {
      enabled: true,
      simple: { rollFormula: '1d20 + 4', dc: 12 },
      checkModifiers: structuredClone(CATALOGUE),
      defaultModifierPolicy: 'byRecipe',
      defaultModifierIds: ['med'],
      ...overrides,
    },
  };
}

const migrateOne = (system) => migrateSystemCheckModifierCatalogue({ systems: [system] }).systems[0];

// ── the move ──────────────────────────────────────────────────────────────────

test('1.22.0 moves the catalogue to the system and DELETES the old key', () => {
  const migrated = migrateOne(legacySystem());
  assert.deepEqual(migrated.checkModifiers, CATALOGUE, 'the catalogue arrives at the system');
  assert.equal(
    Object.hasOwn(migrated.craftingCheck, 'checkModifiers'),
    false,
    'two locations for one catalogue is how two surfaces come to disagree about which wins'
  );
  // The SELECTION stays exactly where it was: only the catalogue moved.
  assert.deepEqual(migrated.craftingCheck.defaultModifierIds, ['med']);
  assert.equal(migrated.craftingCheck.simple.rollFormula, '1d20 + 4', 'siblings are untouched');
});

test('1.22.0 rewrites byRecipe to bySubject at the system level', () => {
  assert.equal(migrateOne(legacySystem()).craftingCheck.defaultModifierPolicy, 'bySubject');
});

// The rule rewrite is INDEPENDENT of the move: a system may carry the rule with no
// catalogue at all, and the token must still stop being re-emitted.
test('1.22.0 rewrites the rule even where there is no catalogue to move', () => {
  const system = { id: 's', craftingCheck: { defaultModifierPolicy: 'byRecipe' } };
  const migrated = migrateOne(system);
  assert.equal(migrated.craftingCheck.defaultModifierPolicy, 'bySubject');
  assert.equal(Object.hasOwn(migrated, 'checkModifiers'), false, 'and seeds no catalogue');
});

test('1.22.0 leaves the other three rules exactly as authored', () => {
  for (const policy of ['addAll', 'highest', 'playerPicks']) {
    assert.equal(
      migrateOne({ id: 's', craftingCheck: { defaultModifierPolicy: policy } }).craftingCheck
        .defaultModifierPolicy,
      policy
    );
  }
});

// ── the guard ─────────────────────────────────────────────────────────────────

test('1.22.0 never clobbers an authored system-level catalogue', () => {
  const authored = [{ id: 'own', label: 'Own', expression: '@own' }];
  const system = { ...legacySystem(), checkModifiers: structuredClone(authored) };
  const migrated = migrateOne(system);
  assert.deepEqual(
    migrated.checkModifiers,
    authored,
    'the newer, correct location wins — the legacy copy never overwrites it'
  );
  assert.equal(
    Object.hasOwn(migrated.craftingCheck, 'checkModifiers'),
    false,
    'and the legacy key is still deleted, so a half-migrated system CONVERGES'
  );
});

// A MALFORMED LEGACY VALUE IS SKIPPED, NOT DELETED — and skipping it is a decision, not an
// oversight. Deleting a non-array `craftingCheck.checkModifiers` would be this migration
// destroying data it has decided it cannot read, on the ONE path where the GM has no surviving
// copy. It costs nothing to leave: nothing reads it, and `_normalizeCraftingCheck` is an allowlist
// rebuild that drops it on the next save anyway, so the system still converges.
//
// Reverting the `Array.isArray` guard left the suite green: every other case here authors a
// well-formed array, so the guard was undiscriminated by the fixtures.
test('1.22.0 leaves a MALFORMED legacy catalogue exactly where it was', () => {
  const migrated = migrateOne({
    id: 's',
    craftingCheck: { checkModifiers: 'oops', defaultModifierPolicy: 'byRecipe' },
  });
  assert.equal(
    migrated.craftingCheck.checkModifiers,
    'oops',
    'the key survives untouched — not repairing data you cannot read is the point'
  );
  assert.equal(
    Object.hasOwn(migrated, 'checkModifiers'),
    false,
    'and a non-catalogue is never promoted to the system level, where the normalizer would ' +
      'read it as an EMPTY catalogue and the GM would lose nothing visibly at all'
  );
  assert.equal(
    migrated.craftingCheck.defaultModifierPolicy,
    'bySubject',
    'the rule rewrite is independent of the move and still runs'
  );
});

test('1.22.0 is idempotent under re-run', () => {
  const once = migrateOne(legacySystem());
  const twice = migrateOne(structuredClone(once));
  assert.deepEqual(twice, once);
});

test('1.22.0 seeds NOTHING onto a salvage or gathering check that has no block', () => {
  const migrated = migrateOne(legacySystem());
  assert.equal(Object.hasOwn(migrated, 'salvageCraftingCheck'), false);
  assert.equal(Object.hasOwn(migrated, 'gatheringCraftingCheck'), false);
});

// ── purity ────────────────────────────────────────────────────────────────────

test('1.22.0 is pure and clone-first — the input payload is never touched', () => {
  const systems = [legacySystem()];
  const before = structuredClone(systems);
  migrateSystemCheckModifierCatalogue({ systems });
  assert.deepEqual(systems, before, 'the runner payload is untouched, so a throw is recoverable');
});

test('1.22.0 tolerates malformed input without throwing', () => {
  assert.deepEqual(migrateSystemCheckModifierCatalogue({}).systems, undefined);
  assert.deepEqual(migrateSystemCheckModifierCatalogue({ systems: 'nope' }).systems, 'nope');
  const migrated = migrateSystemCheckModifierCatalogue({
    systems: [null, 7, 'x', {}, { craftingCheck: 'nope' }],
  }).systems;
  assert.equal(migrated.length, 5, 'a malformed system is skipped, never repaired');
  // The per-system transform is directly guarded too, so a caller that hands it junk
  // cannot make the pass throw halfway and persist a half-applied world.
  for (const junk of [null, undefined, 7, 'x', []]) {
    assert.doesNotThrow(() => applySystemCheckModifierCatalogue(junk));
  }
});

// ── the registry entry ────────────────────────────────────────────────────────

test('1.22.0 is registered with a downgrade target that states the loss', () => {
  // The registry is not exported, so it is read the way the runner reads it — through a
  // real instance. A copy of the list here would be a second registry to keep in sync.
  const registry = new MigrationRunner({ getSetting: () => undefined, setSetting: () => {} })
    ._migrations;
  const entry = registry.find((migration) => migration.version === '1.22.0');
  assert.ok(entry, 'the migration is registered, or it never runs');
  assert.equal(entry.downgradeTo, '1.21.0');
  // The downgrade is NOT lossless — the first entry in this registry of which that is
  // true — and the entry DECLARES that machine-readably. The declaration is what routes it
  // into the registry-wide rule in `tests/migration-runner.test.js`, which is where the
  // label's "DOWNGRADING IS NOT LOSSLESS" clause is held; asserting the clause here as well
  // would be a second copy of one rule.
  assert.equal(
    entry.downgradeLosesData,
    true,
    'a downgraded world drops the relocated catalogue on the first read, and the registry ' +
      'rule turns that declaration into a required sentence in the label'
  );
  assert.match(
    entry.label,
    /LOAD-BEARING/,
    'the label names the runner-ordering precondition the move depends on'
  );
  assert.equal(
    registry.at(-1).version,
    '1.22.0',
    'and it is the HIGHEST version, so the runner advances the world to it'
  );
});

// ── the export-payload upcast ─────────────────────────────────────────────────

test('the export upcast lifts an imported bundle’s catalogue and rewrites its rule', () => {
  const bundle = {
    schemaVersion: FABRICATE_EXPORT_SCHEMA_VERSION,
    system: legacySystem(),
    recipes: [],
  };
  const migrated = migrateExportPayload(bundle);
  assert.deepEqual(migrated.system.checkModifiers, CATALOGUE);
  assert.equal(Object.hasOwn(migrated.system.craftingCheck, 'checkModifiers'), false);
  assert.equal(migrated.system.craftingCheck.defaultModifierPolicy, 'bySubject');
  // Branch-independent: a LEGACY-schema bundle gets the same treatment, because the
  // catalogue's LOCATION is orthogonal to the envelope version.
  const legacyBundle = migrateExportPayload({ fabricateVersion: '1.0.0', system: legacySystem() });
  assert.deepEqual(legacyBundle.system.checkModifiers, CATALOGUE);
  assert.equal(legacyBundle.system.craftingCheck.defaultModifierPolicy, 'bySubject');
  // …and the input is never aliased.
  assert.ok(Array.isArray(bundle.system.craftingCheck.checkModifiers), 'the input is untouched');
});
