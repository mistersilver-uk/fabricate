/**
 * Issue 1224 — the **Valid Id Basis** gate (`openspec/specs/data-models/spec.md`
 * § Valid Id Basis).
 *
 * A destructive startup pass prunes durable state that names an id outside the live
 * corpus. When the corpus it read is only PART of the corpus — a Storage Layout Conversion
 * that crashed between its first and last step, or a cross-client race where the GM
 * converted while this client was still constructing collaborators — every learned recipe,
 * discovery flag, active run and GM preference naming a record that did not land is pruned
 * as "naming deleted content". Finishing the conversion afterwards recovers none of it:
 * the actor flags are already gone.
 *
 * **What makes this suite necessary, and what makes it different from the two acceptance
 * sets that came before it.** Both earlier versions of this plan were proven vacuous by
 * construction — a reviewer built the implementation each described and got 9/9 and then
 * 13/13 green against a gate that never fired, because every assertion INJECTED the basis
 * and therefore tested the helper rather than the gate. So the composition-site cases here
 * drive `composeStartupPassList` from SETTINGS, one case per basis input, and each varies
 * exactly one input away from a baseline that emits all five passes. A site that reads
 * three of the four inputs reddens exactly one case.
 *
 * Every omission assertion is an exact-array `deepEqual`, never a `.includes()` and never
 * an unqualified "omitted": `salvage runs` declares systems + components, neither of which
 * has a granular repository today, so it MUST SURVIVE a recipes-incomplete basis. An
 * implementer reading "omitted" literally would gate all five together and this suite is
 * what stops that.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFINITION_STORAGE_LAYOUTS,
  DEFINITION_STORAGE_TARGETS,
  SETTING_KEYS,
} from '../src/config/settings.js';
import { getHighestRegisteredMigrationVersion } from '../src/migration/MigrationRunner.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import {
  buildStartupPassList,
  STARTUP_PASS_ENTITY_KINDS,
} from '../src/systems/startupMaintenance.js';
import { composeStartupPassList } from '../src/systems/startupPassComposition.js';
import {
  DEFINITION_STORAGE_KEY_PAIRS,
  GRANULAR_DEFINITION_REPOSITORY_KINDS,
  readValidIdBasis,
  VALID_ID_BASIS_ENTITY_KINDS,
} from '../src/systems/validIdBasis.js';

import { mainMethodSource, MAIN_SOURCE } from './helpers/fabricateFacadeHarness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = resolve(__dirname, '../src');

/** The highest version the real registry holds, so no fixture hardcodes `'1.25.0'`. */
const HIGHEST_MIGRATION = getHighestRegisteredMigrationVersion();

/** Every pass the composition site can emit, in run order. */
const ALL_PASSES = [
  'crafting runs',
  'phantom crafting runs',
  'salvage runs',
  'learned recipes',
  'stale preferences',
];

/**
 * The passes that survive when the RECIPE basis alone is incomplete.
 *
 * Spelled out rather than derived, because it is the assertion: `salvage runs` declares
 * only systems + components, and both are known-complete by construction today.
 */
const RECIPES_INCOMPLETE = ['salvage runs'];

/** Sentinel for "this setting has no value at all", distinct from a stored `undefined`. */
const ABSENT = Symbol('absent');

/** @param {Array<[string, Function]>} passes */
const labelsOf = (passes) => passes.map(([label]) => label);

/**
 * The whole composition-site fixture: a settings map, recording collaborators, and the
 * options object `composeStartupPassList` takes.
 *
 * Every case in this file starts from the SAME known-complete baseline and overrides one
 * thing. That is what makes "one case per basis input" mean anything: a case that omits is
 * omitting because of the single input it changed.
 *
 * @param {object} [overrides]
 * @returns {{options: object, calls: Array, settings: Map<string, *>, warnings: Array}}
 */
function makeComposition({
  settings: settingOverrides = {},
  arrangement = DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
  recipes = [{ id: 'r1' }],
  systems = [{ id: 's1', components: [{ id: 'c1' }] }],
  onInitialize = null,
} = {}) {
  const settings = new Map([
    [SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY],
    [SETTING_KEYS.RECIPE_STORAGE_TARGET, DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY],
    [SETTING_KEYS.MIGRATION_VERSION, HIGHEST_MIGRATION],
  ]);
  for (const [key, value] of Object.entries(settingOverrides)) {
    if (value === ABSENT) settings.delete(key);
    else settings.set(key, value);
  }

  const calls = [];
  const warnings = [];
  const record =
    (name) =>
    (...args) => {
      calls.push([name, args]);
      return Promise.resolve();
    };

  const options = {
    recipeManager: {
      getRecipes: () => recipes,
      getRecipe: (id) => recipes.find((recipe) => recipe.id === id) ?? null,
      getDefinitionStorageArrangement: () => arrangement,
      // Mirrors #1211's conversion: the layout flips from INSIDE `initialize()`, which is
      // why a basis fact sampled before this point describes a corpus that no longer exists.
      initialize: async () => onInitialize?.(settings),
    },
    craftingSystemManager: { getSystems: () => systems },
    craftingRunManager: {
      cleanupInvalidRuns: record('craftingRunManager.cleanupInvalidRuns'),
      pruneInstantaneousActiveRuns: record('craftingRunManager.pruneInstantaneousActiveRuns'),
    },
    salvageRunManager: { cleanupInvalidRuns: record('salvageRunManager.cleanupInvalidRuns') },
    recipeVisibilityService: {
      cleanupLearnedRecipes: record('recipeVisibilityService.cleanupLearnedRecipes'),
    },
    getSetting: (key) => settings.get(key),
    setSetting: async (key, value) => {
      calls.push(['setSetting', [key, value]]);
      settings.set(key, value);
    },
    resolveGatheringActor: () => null,
    isSelectableGatheringActor: () => false,
    warn: (message, detail) => warnings.push({ message, detail }),
  };
  return { options, calls, settings, warnings };
}

/** @param {object} [overrides] @returns {string[]} the emitted labels. */
const composedLabels = (overrides) => labelsOf(composeStartupPassList(makeComposition(overrides).options));

// ---------------------------------------------------------------------------
// The composition site, driven from settings, over EVERY input
// ---------------------------------------------------------------------------

test('the composition site emits every declared pass on a known-complete basis', () => {
  // The positive control. Without it, "omitted" is satisfied by a builder that emits
  // nothing at all — which is how the first acceptance set went 9/9 green.
  assert.deepEqual(composedLabels(), ALL_PASSES);
});

test('composition-site input 1 — the LAYOUT decides it', () => {
  assert.deepEqual(
    composedLabels({
      settings: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.PER_RECORD },
    }),
    RECIPES_INCOMPLETE
  );
});

test('composition-site input 2 — the TARGET decides it', () => {
  // The input revision 2's implementation never read. It went 13/13 green while emitting
  // all five passes in exactly this state.
  assert.deepEqual(
    composedLabels({
      settings: { [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_TARGETS.PER_RECORD },
    }),
    RECIPES_INCOMPLETE
  );
});

test('composition-site input 3 — the repository ARRANGEMENT decides it', () => {
  assert.deepEqual(
    composedLabels({ arrangement: DEFINITION_STORAGE_TARGETS.PER_RECORD }),
    RECIPES_INCOMPLETE
  );
});

test('composition-site input 4 — the migration VERSION decides it', () => {
  assert.deepEqual(
    composedLabels({ settings: { [SETTING_KEYS.MIGRATION_VERSION]: '0.9.0' } }),
    RECIPES_INCOMPLETE
  );
});

// ---------------------------------------------------------------------------
// WHEN the facts are sampled
// ---------------------------------------------------------------------------

test('the basis is sampled AFTER initialize(), against a layout that changes when it runs', async () => {
  // #1211's crash window, and it needs no destructive fixture. A static fixture returns the
  // same value at both candidate read points, so it cannot tell a site that samples beside
  // `registerSettings()` from one that samples beside the id sets.
  const flipToUnsettled = (settings) =>
    settings.set(SETTING_KEYS.RECIPE_STORAGE_LAYOUT, DEFINITION_STORAGE_LAYOUTS.UNSETTLED);

  const early = makeComposition({ onInitialize: flipToUnsettled });
  assert.deepEqual(
    labelsOf(composeStartupPassList(early.options)),
    ALL_PASSES,
    'control: before initialize() the fixture reads settled, so the two read points DIFFER'
  );

  const late = makeComposition({ onInitialize: flipToUnsettled, recipes: [] });
  await late.options.recipeManager.initialize();
  assert.deepEqual(
    labelsOf(composeStartupPassList(late.options)),
    RECIPES_INCOMPLETE,
    'production order: the conversion flipped the layout during the corpus read'
  );
});

test('an arrangement mismatch omits — the cross-client race no settings-only fixture reaches', () => {
  // The player built the settings adapter at construction time; the GM's conversion then
  // completed in full, including deleting the legacy document, before this client read its
  // corpus. Layout and target now agree, are not `unsettled`, and the version is current:
  // all three settings clauses hold and the corpus is empty.
  assert.deepEqual(
    composedLabels({
      arrangement: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
      recipes: [],
      settings: {
        [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
        [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_TARGETS.PER_RECORD,
      },
    }),
    RECIPES_INCOMPLETE
  );
});

// ---------------------------------------------------------------------------
// The basis clauses, each isolated
// ---------------------------------------------------------------------------

test('clause: the compensated-failure state omits (layout singleArray, target perRecord)', () => {
  // A failed conversion's compensation DELETES the layout document, restoring the
  // registered `singleArray` default, while the target stays `perRecord`. Repository
  // selection reads the TARGET, so the per-record adapter is built and returns zero
  // records — with the layout reading "settled".
  assert.deepEqual(
    composedLabels({
      arrangement: DEFINITION_STORAGE_TARGETS.PER_RECORD,
      recipes: [],
      settings: { [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_TARGETS.PER_RECORD },
    }),
    RECIPES_INCOMPLETE
  );
});

test('clause 1 isolated: layout AND target both `unsettled` omits', () => {
  // For any registered pair clause 1 is otherwise SUBSUMED by clause 2 — a target is
  // constrained to singleArray/perRecord, so `unsettled` forces layout !== target. This
  // out-of-domain fixture is the only shape where clauses 2 and 4 hold and clause 1 must
  // still omit; without it clause 1 reads as dead code with every other test green.
  assert.deepEqual(
    composedLabels({
      arrangement: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
      settings: {
        [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
        [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
      },
    }),
    RECIPES_INCOMPLETE
  );
});

test('a missing, unreadable or unrecognised basis fact omits — the fail-OPEN accident', () => {
  const absentLayout = { settings: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: ABSENT } };
  assert.deepEqual(composedLabels(absentLayout), RECIPES_INCOMPLETE, 'absent layout');
  assert.deepEqual(
    composedLabels({ settings: { [SETTING_KEYS.RECIPE_STORAGE_TARGET]: ABSENT } }),
    RECIPES_INCOMPLETE,
    'absent target'
  );
  assert.deepEqual(
    composedLabels({ settings: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: 'perrecord' } }),
    RECIPES_INCOMPLETE,
    'an unrecognised layout string is not a settled layout'
  );
  assert.deepEqual(composedLabels({ arrangement: null }), RECIPES_INCOMPLETE, 'unknown arrangement');
  assert.deepEqual(
    composedLabels({ settings: { [SETTING_KEYS.MIGRATION_VERSION]: ABSENT } }),
    RECIPES_INCOMPLETE,
    'absent migration version'
  );
});

test('a setting read that THROWS omits rather than passing the !== unsettled test', () => {
  const { options } = makeComposition();
  options.getSetting = (key) => {
    if (key === SETTING_KEYS.RECIPE_STORAGE_LAYOUT) throw new Error('not a registered setting');
    return DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY;
  };
  assert.deepEqual(labelsOf(composeStartupPassList(options)), RECIPES_INCOMPLETE);
});

test('a version BEHIND the highest registered migration omits; a version AHEAD emits', () => {
  assert.deepEqual(
    composedLabels({ settings: { [SETTING_KEYS.MIGRATION_VERSION]: '0.0.0' } }),
    RECIPES_INCOMPLETE,
    'behind'
  );
  // `compareSemver(stored, highest) >= 0`, never `=== highest`: a DOWNGRADED build sits
  // ahead of its own highest registered migration, and reading "not equal" as "behind"
  // would omit every destructive pass on every downgraded world, permanently.
  assert.deepEqual(
    composedLabels({ settings: { [SETTING_KEYS.MIGRATION_VERSION]: '99.0.0' } }),
    ALL_PASSES,
    'ahead'
  );
});

// ---------------------------------------------------------------------------
// The basis contract, and the input the spec forbids
// ---------------------------------------------------------------------------

test('the basis carries EXACTLY the declared entity kinds', () => {
  const basis = readValidIdBasis({
    getSetting: () => null,
    getHighestRegisteredMigrationVersion,
    arrangements: {},
  });
  assert.deepEqual(Object.keys(basis), [...VALID_ID_BASIS_ENTITY_KINDS]);
  assert.deepEqual(Object.keys(basis), ['recipes', 'systems', 'components']);
});

test('a kind with no granular repository is known-complete by construction', () => {
  const basis = readValidIdBasis({
    getSetting: () => null,
    getHighestRegisteredMigrationVersion,
    arrangements: {},
  });
  assert.deepEqual(basis, { recipes: false, systems: true, components: true });
  assert.deepEqual([...GRANULAR_DEFINITION_REPOSITORY_KINDS], ['recipes']);
});

test('a healthy NON-PRIMARY client runs every pass — primacy is not an input', () => {
  // `data-models/spec.md` forbids "this client did not run the migration pass" as a third
  // input BY NAME: it is true on every non-primary client on every boot, and some pruned
  // state is `user`-scoped, so only that user's own client can ever prune it.
  const previous = globalThis.game;
  globalThis.game = { user: { id: 'player' }, users: { activeGM: { id: 'gm' } } };
  try {
    assert.deepEqual(composedLabels(), ALL_PASSES);
    assert.deepEqual(
      composedLabels({ settings: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: ABSENT } }),
      RECIPES_INCOMPLETE,
      'and the same partial-corpus state on that client still omits'
    );
  } finally {
    globalThis.game = previous;
  }
});

// ---------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------

test('the declaration map key set equals the complete-basis output exactly', () => {
  assert.deepEqual(Object.keys(STARTUP_PASS_ENTITY_KINDS), ALL_PASSES);
  assert.deepEqual(composedLabels(), Object.keys(STARTUP_PASS_ENTITY_KINDS));
});

test('an UNDECLARED pass fails closed, so a future destructive pass cannot ship ungated', () => {
  const emitted = buildStartupPassList({
    candidates: [
      ['declared', async () => {}],
      ['brand new destructive pass', async () => {}],
    ],
    basis: { recipes: true, systems: true, components: true },
    declarations: { declared: ['recipes'] },
  });
  assert.deepEqual(labelsOf(emitted), ['declared']);
});

test('a declared kind missing from the basis fails closed, not open', () => {
  const emitted = buildStartupPassList({
    candidates: [['declared', async () => {}]],
    // The renamed-key / threading-typo accident: `undefined !== false`, so a
    // `basis[kind] === false` test would ship the pass.
    basis: { recipe: true, systems: true, components: true },
    declarations: { declared: ['recipes'] },
  });
  assert.deepEqual(labelsOf(emitted), []);
});

test('the emitted thunks carry the right collaborator call and the right id sets', async () => {
  const { options, calls, settings } = makeComposition({
    recipes: [{ id: 'r1' }],
    systems: [{ id: 's1', components: [{ id: 'c1' }] }],
    settings: {
      [SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM]: 'deleted-system',
      [SETTING_KEYS.PROGRESSIVE_RESULT_ORDER]: {
        'recipe:r1': ['a'],
        'recipe:gone': ['b'],
        'salvage:c1': ['c'],
        'salvage:gone': ['d'],
      },
    },
  });
  const passes = composeStartupPassList(options);
  assert.deepEqual(labelsOf(passes), ALL_PASSES);
  for (const [, run] of passes) await run();

  const byName = new Map(calls.map(([name, args]) => [name, args]));
  assert.deepEqual(
    [...byName.get('craftingRunManager.cleanupInvalidRuns')],
    [new Set(['r1']), new Set(['s1'])],
    'crafting runs prunes against the recipe AND system id sets'
  );
  assert.deepEqual(
    [...byName.get('salvageRunManager.cleanupInvalidRuns')],
    [new Set(['s1']), new Map([['s1', new Set(['c1'])]])],
    'salvage runs prunes against systems and the per-system salvage components'
  );
  assert.deepEqual(
    [...byName.get('recipeVisibilityService.cleanupLearnedRecipes')],
    [new Set(['r1'])],
    'learned recipes prunes against the recipe id set — under an incomplete basis THIS is the data loss'
  );
  const [resolveRecipe] = byName.get('craftingRunManager.pruneInstantaneousActiveRuns');
  assert.equal(typeof resolveRecipe, 'function');
  assert.deepEqual(resolveRecipe('r1'), { id: 'r1' }, 'the phantom prune resolves through the manager');
  assert.equal(resolveRecipe('gone'), null);
  assert.equal(settings.get(SETTING_KEYS.LAST_MANAGED_CRAFTING_SYSTEM), '');
  assert.deepEqual(
    settings.get(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER),
    { 'recipe:r1': ['a'], 'salvage:c1': ['c'] },
    'stale preferences rewrites ONE map keyed by both scopes, which is why it is gated on the union'
  );
});

test('the composition site reads no Foundry global while it builds the list', () => {
  // Purity by trap, not by absence: an absence-based demonstration is defeated by a single
  // `?.`. The trap covers the BUILDER BODY at call time only — the returned thunks
  // legitimately call `getSetting`/`setSetting`, so they are not invoked here.
  const trapped = ['game', 'foundry', 'ui', 'canvas'];
  const previous = trapped.map((name) => [name, globalThis[name]]);
  const trap = new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(`the pass-list builder read a Foundry global: ${String(property)}`);
      },
      has(_target, property) {
        throw new Error(`the pass-list builder probed a Foundry global: ${String(property)}`);
      },
    }
  );
  try {
    for (const name of trapped) globalThis[name] = trap;
    assert.deepEqual(composedLabels(), ALL_PASSES);
  } finally {
    for (const [name, value] of previous) globalThis[name] = value;
  }
});

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

test('the composition site warns the omitted labels AND the deciding input', () => {
  const { options, warnings } = makeComposition({
    settings: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.UNSETTLED },
  });
  composeStartupPassList(options);
  assert.equal(warnings.length, 1);
  const [{ message, detail }] = warnings;
  for (const label of ALL_PASSES.filter((label) => !RECIPES_INCOMPLETE.includes(label))) {
    assert.ok(message.includes(label), `the warning names the omitted pass "${label}"`);
  }
  assert.ok(!message.includes('salvage runs'), 'and does not claim a pass that ran was skipped');
  assert.deepEqual(detail.basis, { recipes: false, systems: true, components: true });
  assert.equal(
    detail.basisInputs.recipes.layout,
    DEFINITION_STORAGE_LAYOUTS.UNSETTLED,
    'the deciding input is reported, not just the verdict'
  );
  assert.deepEqual(
    detail.omitted.map((omission) => omission.incompleteKinds),
    [['recipes'], ['recipes'], ['recipes'], ['recipes']]
  );
});

test('nothing is warned on a healthy world, so the warning stays a real signal', () => {
  const { options, warnings } = makeComposition();
  assert.deepEqual(labelsOf(composeStartupPassList(options)), ALL_PASSES);
  assert.deepEqual(warnings, [], 'a clean boot stays quiet');
});

test('the default reporter is console.warn', () => {
  const { options } = makeComposition({
    settings: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: ABSENT },
  });
  delete options.warn;
  const previous = console.warn;
  const seen = [];
  console.warn = (...args) => seen.push(args);
  try {
    composeStartupPassList(options);
  } finally {
    console.warn = previous;
  }
  assert.equal(seen.length, 1);
  assert.match(seen[0][0], /^Fabricate \| Startup cleanup skipped/);
});

// ---------------------------------------------------------------------------
// Hand-maintained mirrors
// ---------------------------------------------------------------------------

test('every registered storage layout/target key has a mapping, and vice versa', () => {
  const registered = Object.values(SETTING_KEYS)
    .filter((key) => /StorageLayout$|StorageTarget$/.test(key))
    .sort((a, b) => a.localeCompare(b));
  const mapped = Object.values(DEFINITION_STORAGE_KEY_PAIRS)
    .flatMap((pair) => [pair.layout, pair.target])
    .sort((a, b) => a.localeCompare(b));
  assert.deepEqual(registered, mapped);
});

test('every granular repository belongs to a kind with a registered pair', () => {
  // The direction component extraction trips: landing a granular repository for a kind
  // BEFORE registering its settings pair would otherwise score that kind known-complete
  // while its corpus is already partial — fail-open in the release that arms the hazard.
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.js')) files.push(path);
    }
  };
  walk(SRC_ROOT);
  const constructors = files
    .filter((path) => readFileSync(path, 'utf8').includes('new PerRecordCraftingDefinitionRepository('))
    .map((path) => relative(SRC_ROOT, path).replaceAll('\\', '/'))
    .sort((a, b) => a.localeCompare(b));

  // Declared here so a NEW granular repository fails this test and forces its author to
  // register a pair and declare the kind, instead of inheriting "known-complete".
  const declared = { 'systems/RecipeManager.js': 'recipes' };
  assert.deepEqual(constructors, Object.keys(declared));
  for (const kind of Object.values(declared)) {
    assert.ok(GRANULAR_DEFINITION_REPOSITORY_KINDS.includes(kind), `${kind} is declared granular`);
    assert.ok(DEFINITION_STORAGE_KEY_PAIRS[kind], `${kind} has a registered layout/target pair`);
  }
});

// ---------------------------------------------------------------------------
// `src/main.js` — the production call site
// ---------------------------------------------------------------------------

test('main.js composes the pass list AFTER both managers initialize, from the accessor', () => {
  // `src/main.js` imports the global stylesheet and Svelte UI roots at module load, so it
  // cannot be imported under `node --test` (see `tests/helpers/fabricateFacadeHarness.js`).
  // The call POSITION is therefore pinned as source, the way this repo already pins the
  // readiness pair — and position is the whole hazard: a fact sampled beside
  // `registerSettings()` records the pre-conversion value.
  const body = mainMethodSource('  async initialize() {', MAIN_SOURCE);
  const recipeInit = body.indexOf('await this.recipeManager.initialize();');
  const systemInit = body.indexOf('await this.craftingSystemManager.initialize();');
  const compose = body.indexOf('composeStartupPassList({');
  assert.ok(recipeInit > -1 && systemInit > -1, 'initialize() still loads both corpora');
  assert.ok(compose > -1, 'initialize() composes the pass list through the exported builder');
  assert.ok(compose > recipeInit, 'the basis is sampled after the recipe corpus is read');
  assert.ok(compose > systemInit, 'the basis is sampled after the system corpus is read');

  const before = body.slice(0, compose);
  for (const key of ['RECIPE_STORAGE_LAYOUT', 'RECIPE_STORAGE_TARGET', 'MIGRATION_VERSION']) {
    assert.ok(
      !before.includes(key),
      `initialize() must not read ${key} before the composition site — that is the too-early sample`
    );
  }
  assert.ok(
    !before.includes('getDefinitionStorageArrangement'),
    'nor capture the repository arrangement early'
  );
  assert.match(
    body.slice(compose),
    /composeStartupPassList\(\{[\s\S]*?\n\s+getSetting,\n/,
    'and it passes the ACCESSOR, so the read happens at composition time'
  );
  assert.ok(
    !body.includes("['crafting runs', () =>"),
    'the ungated inline pass-list literal is gone'
  );
});

// ---------------------------------------------------------------------------
// The fourth clause's source: the arrangement the repository was BUILT for
// ---------------------------------------------------------------------------

test('RecipeManager records the arrangement its repository was built for', () => {
  const previous = globalThis.game;
  try {
    globalThis.game = {
      settings: {
        get: (_namespace, key) =>
          key === SETTING_KEYS.RECIPE_STORAGE_TARGET
            ? DEFINITION_STORAGE_TARGETS.PER_RECORD
            : undefined,
      },
    };
    assert.equal(
      new RecipeManager().getDefinitionStorageArrangement(),
      DEFINITION_STORAGE_TARGETS.PER_RECORD
    );
    globalThis.game = undefined;
    assert.equal(
      new RecipeManager().getDefinitionStorageArrangement(),
      DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
      'an unreadable target still builds the settings adapter, and reports THAT'
    );
    assert.equal(
      new RecipeManager({ repository: { loadAll: async () => [] } }).getDefinitionStorageArrangement(),
      null,
      'an injected repository reports unknown, and unknown is not known-complete'
    );
  } finally {
    globalThis.game = previous;
  }
});
