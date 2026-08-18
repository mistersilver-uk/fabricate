/**
 * Issue 1226 — the **Valid Id Basis** gate on the MUTATION-TIME door
 * (`openspec/specs/data-models/spec.md` § Valid Id Basis).
 *
 * Issue 1224 gated the startup housekeeping and deliberately left this door open, recording
 * it in the spec as unsafe. The same id sets are recomputed and the same destructive
 * collaborators are called from `RecipeManager#_cleanupFlagsAfterRecipeMutation` and
 * `CraftingSystemManager#_cleanupSystemScopedState`, so a GM deleting a recipe against a
 * partially converted corpus destroys the same durable actor state — and the trigger is far
 * more ordinary than a boot.
 *
 * **Both directions are asserted, and the open one is not decoration.** A gate that never
 * fires is a data-loss bug; a gate that always fires converts it into an orphaned-flag leak
 * nothing detects. Every closed-direction case here has a positive control in the same
 * shape, and the fixtures reach the gate through the REAL `RecipeManager` driven from
 * SETTINGS — never by injecting a basis — because injecting the answer is how two earlier
 * acceptance sets for #1224 went green against an implementation whose gate never ran.
 *
 * **The third direction the spec adds here**: refusing the sweep must not itself leak the
 * flags the mutation orphaned. A refused sweep falls back to a SUBJECT-TARGETED prune of
 * exactly the ids the caller removed, so the closed cases assert both that the corpus-wide
 * sweep did NOT run and that the just-deleted recipe's flags went anyway.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { relative as relativePath, resolve, sep as pathSeparator, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { stripComments } from './helpers/sourceScan.js';
import { seedKnownCompleteValidIdBasis } from './helpers/validIdBasis.js';

const { DEFINITION_STORAGE_LAYOUTS, DEFINITION_STORAGE_TARGETS, SETTING_KEYS } = await import(
  '../src/config/settings.js'
);
const { getHighestRegisteredMigrationVersion } = await import(
  '../src/migration/MigrationRunner.js'
);
const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingRunManager } = await import('../src/systems/CraftingRunManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { MUTATION_CLEANUP_ENTITY_KINDS, runGatedMutationCleanup } = await import(
  '../src/systems/mutationCleanupComposition.js'
);
const { STARTUP_PASS_ENTITY_KINDS } = await import('../src/systems/startupMaintenance.js');
const { readValidIdBasis } = await import('../src/systems/validIdBasis.js');
const { describeCorpusStorage } = await import('../src/systems/corpusStorageReports.js');
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

const HIGHEST_MIGRATION = getHighestRegisteredMigrationVersion();
const SYSTEM_ID = 'sys-1';
/** Sentinel for "this setting has no value at all", distinct from a stored `undefined`. */
const ABSENT = Symbol('absent');

console.debug = () => {};

// ---------------------------------------------------------------------------
// The fixture
// ---------------------------------------------------------------------------

/**
 * A recipe-visibility stand-in that records WHICH of the two prunes it was asked for.
 *
 * Shared by both fixtures below rather than written out twice: the block is what the
 * SonarCloud new-code duplication gate counts, and it counts `tests/**` exactly like `src/`.
 *
 * @param {Array} calls shared collector
 */
function recordingVisibilityService(calls) {
  return {
    cleanupLearnedRecipes: (validRecipeIds) => {
      calls.push({
        method: 'sweep:cleanupLearnedRecipes',
        validRecipeIds: [...validRecipeIds].sort(),
      });
      return Promise.resolve();
    },
    forgetDeletedRecipes: (recipeIds) => {
      calls.push({ method: 'targeted:forgetDeletedRecipes', recipeIds: [...recipeIds].sort() });
      return Promise.resolve();
    },
  };
}

/** @param {Map<string, *>} settings @param {Record<string, *>} overrides */
function applySettings(settings, overrides) {
  for (const [key, value] of Object.entries(overrides)) {
    if (value === ABSENT) settings.delete(key);
    else settings.set(key, value);
  }
}

/**
 * A REAL `RecipeManager` that has genuinely read a corpus, plus recording stand-ins for the
 * two destructive collaborators.
 *
 * The order below is the production order and it is what makes the cases mean anything:
 * settings are seeded, the manager is constructed (which is when it commits to an
 * arrangement), and only then does `initialize()` sample the layout ACROSS its corpus read.
 * `afterCorpusRead` is applied last, so a case that moves a setting there is modelling a
 * conversion that landed between this client's read and its next mutation — the widest and
 * least detectable of the five windows, and the one #1211's conversion actually produces.
 *
 * @param {object} [options]
 * @param {Record<string, *>} [options.settings] Applied BEFORE construction.
 * @param {Record<string, *>} [options.afterCorpusRead] Applied AFTER `initialize()`.
 */
async function makeRecipeFixture({ settings: before = {}, afterCorpusRead = {} } = {}) {
  const env = installFoundryEnv();
  seedKnownCompleteValidIdBasis(env.settings);
  applySettings(env.settings, before);
  env.settings.set(SETTING_KEYS.RECIPES, [
    new Recipe({ id: 'r-doomed', name: 'Doomed', craftingSystemId: SYSTEM_ID }).toJSON(),
    new Recipe({ id: 'r-kept', name: 'Kept', craftingSystemId: SYSTEM_ID }).toJSON(),
  ]);

  const calls = [];
  const runManager = {
    cleanupInvalidRuns: (validRecipeIds, validSystemIds) => {
      calls.push({
        method: 'sweep:cleanupInvalidRuns',
        validRecipeIds: [...validRecipeIds].sort(),
        validSystemIds: [...validSystemIds].sort(),
      });
      return Promise.resolve();
    },
    removeRunsForRecipes: (recipeIds) => {
      calls.push({ method: 'targeted:removeRunsForRecipes', recipeIds: [...recipeIds].sort() });
      return Promise.resolve();
    },
  };
  const visibilityService = recordingVisibilityService(calls);

  const systems = [{ id: SYSTEM_ID, name: 'System', components: [{ id: 'c-1' }] }];
  const systemManager = {
    getSystems: () => systems,
    getSystem: (id) => systems.find((system) => system.id === id) ?? null,
    describeDefinitionStorage: () => ({
      granular: false,
      arrangement: null,
      layoutAtCorpusRead: null,
      systems: { granular: false, arrangement: null, layoutAtCorpusRead: null },
      components: {
        granular: false,
        arrangement: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
        layoutAtCorpusRead: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
      },
    }),
  };

  globalThis.game.fabricate = {
    getCraftingSystemManager: () => systemManager,
    getCraftingRunManager: () => runManager,
    getRecipeVisibilityService: () => visibilityService,
  };

  const recipeManager = new RecipeManager();
  await recipeManager.initialize();
  applySettings(env.settings, afterCorpusRead);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  return {
    env,
    recipeManager,
    calls,
    warnings,
    restore: () => {
      console.warn = originalWarn;
    },
    methods: () => calls.map((call) => call.method),
  };
}

/**
 * Every partial-corpus state, one Valid Id Basis input each, expressed the way a world
 * actually arrives at it.
 *
 * Named rather than derived so a case that stops reaching its intended input fails as a
 * case rather than quietly joining another one.
 */
const PARTIAL_CORPUS_CASES = [
  [
    'input 1+5 — the layout is UNSETTLED across the corpus read (a conversion in flight)',
    {
      settings: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.UNSETTLED },
      afterCorpusRead: {
        [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
      },
    },
  ],
  [
    'input 2 — a FAILED conversion left the layout behind its target',
    {
      afterCorpusRead: {
        [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_TARGETS.PER_RECORD,
      },
    },
  ],
  [
    'input 3 — migrationVersion is behind the highest registered migration',
    { afterCorpusRead: { [SETTING_KEYS.MIGRATION_VERSION]: '0.9.0' } },
  ],
  [
    'input 4 — the repository was BUILT for an arrangement the layout does not equal',
    {
      settings: { [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_TARGETS.PER_RECORD },
      afterCorpusRead: {
        [SETTING_KEYS.RECIPE_STORAGE_TARGET]: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
      },
    },
  ],
  [
    'input 5 — the layout MOVED between the corpus read and the mutation',
    {
      afterCorpusRead: {
        [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
      },
    },
  ],
  [
    'an UNREADABLE layout is not known-complete — the gate fails closed, never open',
    { afterCorpusRead: { [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: ABSENT } },
  ],
];

// ---------------------------------------------------------------------------
// The public orphan sweep: every input, both directions
// ---------------------------------------------------------------------------
//
// `cleanupOrphanedRecipeFlags` writes NOTHING of its own, so it reaches the gate from every
// one of the states below. The delete paths issue a `save()` first, and the
// stale-arrangement write guard (#1232) refuses some of those states before the cleanup is
// reached — which is why the end-to-end delete cases further down use states that guard
// admits.

test('the OPEN direction — a known-complete corpus still runs both corpus-derived sweeps', async () => {
  // The positive control, and it is the assertion that stops this whole change from being a
  // gate that simply never lets anything run. Without it, every case below is satisfied by
  // an implementation that prunes nothing, ever.
  const fixture = await makeRecipeFixture();
  try {
    await fixture.recipeManager.cleanupOrphanedRecipeFlags();
    assert.deepEqual(fixture.methods(), [
      'sweep:cleanupInvalidRuns',
      'sweep:cleanupLearnedRecipes',
    ]);
    assert.deepEqual(fixture.calls[0].validRecipeIds, ['r-doomed', 'r-kept']);
    assert.deepEqual(fixture.calls[0].validSystemIds, [SYSTEM_ID]);
    assert.equal(fixture.warnings.length, 0, 'a healthy world warns about nothing');
  } finally {
    fixture.restore();
  }
});

for (const [name, options] of PARTIAL_CORPUS_CASES) {
  test(`the CLOSED direction — ${name}`, async () => {
    const fixture = await makeRecipeFixture(options);
    try {
      await fixture.recipeManager.cleanupOrphanedRecipeFlags();
      assert.deepEqual(
        fixture.methods(),
        [],
        'no corpus-derived prune runs against a corpus that cannot be attested complete'
      );
      assert.equal(fixture.warnings.length, 1, 'and the omission is reported, not silent');
      assert.match(String(fixture.warnings[0][0]), /not known to be complete/);
      assert.deepEqual(fixture.warnings[0][1].omitted.map((entry) => entry.label).sort(), [
        'orphaned crafting runs',
        'orphaned learned recipes',
      ]);
    } finally {
      fixture.restore();
    }
  });
}

test('a refused sweep still prunes what the caller REMOVED — the gate leaks nothing', async () => {
  // The third direction. Gating alone would trade a data-loss defect for an orphaned-flag
  // leak that nothing detects, because the flags a deletion orphans are the entire reason
  // this cleanup path exists.
  const fixture = await makeRecipeFixture(PARTIAL_CORPUS_CASES[0][1]);
  try {
    await fixture.recipeManager.cleanupOrphanedRecipeFlags({
      removedRecipeIds: ['r-doomed', 'r-also-gone'],
    });
    assert.deepEqual(fixture.methods(), [
      'targeted:removeRunsForRecipes',
      'targeted:forgetDeletedRecipes',
    ]);
    for (const call of fixture.calls) {
      assert.deepEqual(
        call.recipeIds,
        ['r-also-gone', 'r-doomed'],
        'the fallback prunes EXACTLY the ids the caller removed, and infers nothing'
      );
    }
  } finally {
    fixture.restore();
  }
});

test('a known-complete corpus takes the SWEEP, not the targeted fallback', async () => {
  // The pairing that makes the fallback a fallback rather than a second unconditional prune:
  // one actor walk on a healthy world, not two.
  const fixture = await makeRecipeFixture();
  try {
    await fixture.recipeManager.cleanupOrphanedRecipeFlags({ removedRecipeIds: ['r-doomed'] });
    assert.deepEqual(fixture.methods(), [
      'sweep:cleanupInvalidRuns',
      'sweep:cleanupLearnedRecipes',
    ]);
  } finally {
    fixture.restore();
  }
});

test('a mutation that removed NOTHING has no fallback, so an omission removes nothing', async () => {
  // The import path. It only adds or replaces records, so its cleanup is a pure orphan hunt
  // with no subject to target, and a refusal there is a no-op rather than a leak.
  const fixture = await makeRecipeFixture(PARTIAL_CORPUS_CASES[2][1]);
  try {
    await fixture.recipeManager.cleanupOrphanedRecipeFlags();
    assert.deepEqual(fixture.methods(), []);
    assert.deepEqual(fixture.warnings[0][1].targetedFallbacks, []);
  } finally {
    fixture.restore();
  }
});

// ---------------------------------------------------------------------------
// The delete paths, end to end
// ---------------------------------------------------------------------------

test('deleteRecipe on a known-complete corpus prunes against the POST-deletion id set', async () => {
  const fixture = await makeRecipeFixture();
  try {
    await fixture.recipeManager.deleteRecipe('r-doomed');
    assert.deepEqual(fixture.methods(), [
      'sweep:cleanupInvalidRuns',
      'sweep:cleanupLearnedRecipes',
    ]);
    assert.deepEqual(
      fixture.calls[1].validRecipeIds,
      ['r-kept'],
      'the deleted recipe is excluded from the valid set the sweep prunes against'
    );
  } finally {
    fixture.restore();
  }
});

test('deleteRecipe on a PARTIAL corpus prunes only the deleted recipe', async () => {
  // The reported defect, from the direction a GM actually reaches it: this client read the
  // corpus while a conversion held the layout `unsettled`, the conversion finished, and every
  // settings clause now reports a settled, converged world. The recipes that did not land are
  // absent from `getRecipes()`, so the ungated sweep pruned every actor's runs and learned
  // entries naming them.
  const fixture = await makeRecipeFixture(PARTIAL_CORPUS_CASES[0][1]);
  try {
    await fixture.recipeManager.deleteRecipe('r-doomed');
    assert.deepEqual(fixture.methods(), [
      'targeted:removeRunsForRecipes',
      'targeted:forgetDeletedRecipes',
    ]);
    assert.deepEqual(fixture.calls[0].recipeIds, ['r-doomed']);
  } finally {
    fixture.restore();
  }
});

test('deleteRecipes carries the whole removed SET into the fallback', async () => {
  const fixture = await makeRecipeFixture(PARTIAL_CORPUS_CASES[2][1]);
  try {
    await fixture.recipeManager.deleteRecipes(['r-doomed', 'r-kept']);
    assert.deepEqual(fixture.methods(), [
      'targeted:removeRunsForRecipes',
      'targeted:forgetDeletedRecipes',
    ]);
    assert.deepEqual(fixture.calls[1].recipeIds, ['r-doomed', 'r-kept']);
  } finally {
    fixture.restore();
  }
});

test('deleteRecipes on a known-complete corpus still sweeps', async () => {
  const fixture = await makeRecipeFixture();
  try {
    await fixture.recipeManager.deleteRecipes(['r-doomed']);
    assert.deepEqual(fixture.methods(), [
      'sweep:cleanupInvalidRuns',
      'sweep:cleanupLearnedRecipes',
    ]);
    assert.deepEqual(fixture.calls[0].validRecipeIds, ['r-kept']);
  } finally {
    fixture.restore();
  }
});

test('an import names no removed ids, so its sweep is gated and its fallback is empty', async () => {
  const fixture = await makeRecipeFixture(PARTIAL_CORPUS_CASES[2][1]);
  try {
    await fixture.recipeManager.importRecipes([
      { id: 'r-new', name: 'New', craftingSystemId: SYSTEM_ID },
    ]);
    assert.deepEqual(fixture.methods(), []);
  } finally {
    fixture.restore();
  }
});

// ---------------------------------------------------------------------------
// The declaration table
// ---------------------------------------------------------------------------

/**
 * Which startup pass each mutation-time pass is the same prune as.
 *
 * The mutation-time table is a SUBSET — `phantom crafting runs` and `salvage runs` have no
 * mutation-time entrance — so the mirror cannot be a key-set equality against the startup
 * table. It is a key-set equality against THIS map instead, which is what makes a fourth
 * mutation-time label fail rather than pass unexamined.
 */
const MUTATION_TO_STARTUP_LABEL = Object.freeze({
  'orphaned crafting runs': 'crafting runs',
  'orphaned learned recipes': 'learned recipes',
  'orphaned crafting preferences': 'stale preferences',
});

test('the mutation-time declarations mirror the startup ones pass for pass', () => {
  // The two doors call the SAME collaborators, so a kind declared on one and not the other
  // is a gate that disagrees with itself about what a prune reads.
  //
  // Three assertions, because three things can drift. The key sets catch a mutation-time
  // pass with no startup counterpart — the case the earlier three-pair comparison could not
  // see, since it named its pairs and asserted nothing about what else was in the table. The
  // startup lookup catches a renamed startup pass. The kind arrays catch a widened basis.
  assert.deepEqual(
    Object.keys(MUTATION_CLEANUP_ENTITY_KINDS).sort(),
    Object.keys(MUTATION_TO_STARTUP_LABEL).sort(),
    'every mutation-time pass must state which startup pass it is the same prune as'
  );
  for (const [mutationLabel, startupLabel] of Object.entries(MUTATION_TO_STARTUP_LABEL)) {
    assert.ok(
      Array.isArray(STARTUP_PASS_ENTITY_KINDS[startupLabel]),
      `${startupLabel} is no longer a declared startup pass`
    );
    assert.deepEqual(
      [...MUTATION_CLEANUP_ENTITY_KINDS[mutationLabel]],
      [...STARTUP_PASS_ENTITY_KINDS[startupLabel]],
      `${mutationLabel} and ${startupLabel} derive from different entity kinds`
    );
  }
});

/**
 * A `getSetting` plus manager stand-ins that score KNOWN-COMPLETE for every entity kind.
 *
 * Needed because a call with no managers omits every pass — declared or not — so a case
 * built on one cannot tell "omitted because undeclared" from "omitted because the basis is
 * unknown", and would keep passing if the undeclared rule were deleted.
 */
function knownCompleteGateInputs() {
  const settings = new Map();
  seedKnownCompleteValidIdBasis(settings);
  const attested = {
    granular: false,
    arrangement: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
    layoutAtCorpusRead: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
  };
  return {
    getSetting: (key) => settings.get(key),
    recipeManager: { describeDefinitionStorage: () => ({ ...attested }) },
    craftingSystemManager: {
      describeDefinitionStorage: () => ({
        ...attested,
        systems: { granular: false, arrangement: null, layoutAtCorpusRead: null },
        components: { ...attested },
      }),
    },
  };
}

test('the seeded fixture really does produce a known-complete basis for every kind', () => {
  // Two jobs, because they are the same assertion.
  //
  // It is the precondition the undeclared case below rests on: without it, "the undeclared
  // pass was omitted" is satisfiable by a basis that omits everything, which is exactly what
  // the earlier version of that case did.
  //
  // And it is the guard on `seedKnownCompleteValidIdBasis`, which three suites now build
  // their OPEN-direction cases on. Asserting a couple of the settings it writes proves only
  // that it wrote them; asserting the BASIS VALUE proves the seed states a world the gate
  // genuinely attests rather than a gate switched off, and it reddens if a sixth input is
  // added to `validIdBasis.js` that the seed does not satisfy.
  const inputs = knownCompleteGateInputs();
  assert.deepEqual(
    readValidIdBasis({
      getSetting: inputs.getSetting,
      getHighestRegisteredMigrationVersion,
      storage: describeCorpusStorage(inputs),
    }),
    { recipes: true, systems: true, components: true }
  );
  assert.equal(
    inputs.getSetting(SETTING_KEYS.MIGRATION_VERSION),
    HIGHEST_MIGRATION,
    'and it is the REAL highest registered migration, never a hardcoded version'
  );
});

test('an UNDECLARED mutation-time pass is omitted rather than run', async () => {
  // The property that stops a future destructive prune from shipping ungated by forgetting
  // to declare it — and it is only observable against a KNOWN-COMPLETE basis, where
  // undeclaredness is the sole remaining reason anything can be omitted. The declared pass
  // running in the same call is what proves the basis is complete; the `undeclared: true`
  // flag on the omission is what proves the omission was decided by the declaration table
  // rather than by an incomplete kind. Asserting only "it did not run" leaves both.
  const inputs = knownCompleteGateInputs();
  const ran = [];
  const warnings = [];
  const pass = (label) => ({
    label,
    sweep: () => {
      ran.push(label);
      return Promise.resolve();
    },
  });

  const outcome = await runGatedMutationCleanup({
    ...inputs,
    passes: [pass('orphaned learned recipes'), pass('a pass nobody declared')],
    warn: (message, detail) => warnings.push(detail),
  });

  assert.deepEqual(ran, ['orphaned learned recipes'], 'the DECLARED pass ran, so the basis is complete');
  assert.deepEqual(outcome.omitted, ['a pass nobody declared']);
  assert.deepEqual(warnings[0].omitted, [
    { label: 'a pass nobody declared', incompleteKinds: [], undeclared: true },
  ]);
});

// ---------------------------------------------------------------------------
// The subject-targeted collaborators
// ---------------------------------------------------------------------------

test('removeRunsForRecipes drops the named runs and keeps everything it was not told about', async () => {
  // The safety property the fallback rests on: it removes by NAME, so a run whose recipe is
  // merely missing from a half-read corpus survives. That is the whole difference from
  // `cleanupInvalidRuns`, and it is why this needs no basis.
  installFoundryEnv();
  const container = {
    active: {
      'run-doomed': { id: 'run-doomed', recipeId: 'r-doomed', craftingSystemId: SYSTEM_ID },
      'run-unread': { id: 'run-unread', recipeId: 'r-unread', craftingSystemId: SYSTEM_ID },
    },
    history: [
      { id: 'h-doomed', recipeId: 'r-doomed', craftingSystemId: SYSTEM_ID },
      { id: 'h-unread', recipeId: 'r-unread', craftingSystemId: SYSTEM_ID },
      { id: 'h-fizzle', isFizzle: true, craftingSystemId: SYSTEM_ID },
    ],
  };
  globalThis.game.actors = [
    {
      id: 'a1',
      isOwner: true,
      getFlag: () => container,
      async update() {
        return this;
      },
    },
  ];

  const manager = new CraftingRunManager();
  manager._getContainer = () => container;
  manager._persist = async () => {};
  await manager.removeRunsForRecipes(['r-doomed']);

  assert.deepEqual(Object.keys(container.active), ['run-unread']);
  assert.deepEqual(
    container.history.map((entry) => entry.id),
    ['h-unread', 'h-fizzle'],
    'a recipe-less fizzle names nothing and is never matched'
  );
});

test('removeRunsForRecipes with an empty id set touches nothing at all', async () => {
  installFoundryEnv();
  let persisted = 0;
  const manager = new CraftingRunManager();
  manager._getContainer = () => ({ active: { r: { recipeId: 'r-x' } }, history: [] });
  manager._persist = async () => {
    persisted += 1;
  };
  globalThis.game.actors = [{ id: 'a1', isOwner: true }];
  await manager.removeRunsForRecipes([]);
  await manager.removeRunsForRecipes(['  ', null, undefined]);
  assert.equal(persisted, 0, 'an empty target set is a no-op, never a corpus-wide prune');
});

test('forgetDeletedRecipes forgets the named ids and leaves an unread recipe learned', async () => {
  installFoundryEnv();
  const forgotten = [];
  const learned = { 'r-doomed': { learnedAt: 1 }, 'r-unread': { learnedAt: 2 } };
  globalThis.game.actors = [
    {
      id: 'a1',
      isOwner: true,
      getFlag: (scope, key) =>
        scope === 'fabricate' && key === 'fabricate.learnedRecipes' ? learned : undefined,
    },
  ];

  const service = new RecipeVisibilityService(
    { getRecipes: () => [], getRecipe: () => null },
    { getSystems: () => [], getSystem: () => null }
  );
  service.forgetLearnedRecipes = async (target, ids, options) => {
    forgotten.push({ actorId: target.id, ids: [...ids].sort(), options });
    return { success: true, count: ids.length };
  };

  await service.forgetDeletedRecipes(['r-doomed']);
  assert.deepEqual(forgotten, [
    { actorId: 'a1', ids: ['r-doomed'], options: { freeLearnBudget: false } },
  ]);

  forgotten.length = 0;
  await service.cleanupLearnedRecipes(new Set(['r-unread']));
  assert.deepEqual(
    forgotten[0].ids,
    ['r-doomed'],
    'the corpus-derived sweep still prunes by absence — the two prunes stay different'
  );
});

// ---------------------------------------------------------------------------
// The crafting-system doors: system-scoped state and the preference sweep
// ---------------------------------------------------------------------------

/**
 * A REAL `CraftingSystemManager` holding one system with one component, over a settings
 * store carrying a progressive-order map with a live and a stale key in BOTH scopes.
 *
 * `_cleanupCraftingPreferences` replaces that map wholesale, so the four keys are what make
 * "which basis governs it" observable at all.
 *
 * @param {object} [options]
 * @param {Record<string, *>} [options.afterCorpusRead] Applied after the managers have
 *   attested their corpus read, modelling a conversion that landed since.
 */
function makeSystemFixture({ afterCorpusRead = {} } = {}) {
  const env = installFoundryEnv();
  seedKnownCompleteValidIdBasis(env.settings);
  env.settings.set(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, {
    'recipe:r-kept': ['live recipe'],
    'recipe:r-gone': ['stale recipe'],
    'salvage:c-1': ['live component'],
    'salvage:c-gone': ['stale component'],
  });

  const calls = [];
  const recipeManager = {
    getRecipes: () => [{ id: 'r-kept', craftingSystemId: SYSTEM_ID }],
    describeDefinitionStorage: () => ({
      granular: false,
      arrangement: DEFINITION_STORAGE_TARGETS.SINGLE_ARRAY,
      layoutAtCorpusRead: DEFINITION_STORAGE_LAYOUTS.SINGLE_ARRAY,
    }),
    deleteRecipe: async () => {},
  };
  globalThis.game.fabricate = {
    getRecipeVisibilityService: () => recordingVisibilityService(calls),
  };

  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.save = async () => {};
  manager.systems.set(
    SYSTEM_ID,
    manager._normalizeSystem({
      id: SYSTEM_ID,
      name: 'System',
      components: [{ id: 'c-1', name: 'Live component' }],
    })
  );
  // This fixture seeds `systems` directly rather than running the corpus read that stamps
  // the layout observed across it, so state what that read would have seen.
  seedKnownCompleteValidIdBasis(new Map(), { craftingSystemManager: manager });
  applySettings(env.settings, afterCorpusRead);

  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);

  return {
    env,
    manager,
    calls,
    warnings,
    order: () => env.settings.get(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER),
    methods: () => calls.map((call) => call.method),
    restore: () => {
      console.warn = originalWarn;
    },
  };
}

/** The component basis alone, moved after the corpus read. */
const COMPONENT_BASIS_INCOMPLETE = {
  afterCorpusRead: {
    [SETTING_KEYS.COMPONENT_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
  },
};

test('the preference sweep KEEPS the live salvage key on a known-complete corpus', async () => {
  // The open direction, and it also pins a defect this gate exposed: the component ids were
  // never passed, so `validComponentIds` took its empty-set default and EVERY
  // `salvage:<componentId>` key was dropped on every resolution-mode change and every system
  // deletion — a corpus-derived prune against a basis of nothing.
  const fixture = makeSystemFixture();
  try {
    await fixture.manager._cleanupCraftingPreferences();
    assert.deepEqual(Object.keys(fixture.order()).sort(), ['recipe:r-kept', 'salvage:c-1']);
  } finally {
    fixture.restore();
  }
});

test('the preference sweep is refused when the COMPONENT basis alone is incomplete', async () => {
  // The union declaration doing its job. This pass rewrites ONE map keyed by both scopes, so
  // an incomplete component basis must stop the whole thing rather than let the recipe half
  // proceed and take every `salvage:` key with it.
  const fixture = makeSystemFixture(COMPONENT_BASIS_INCOMPLETE);
  try {
    await fixture.manager._cleanupCraftingPreferences();
    assert.deepEqual(Object.keys(fixture.order()).sort(), [
      'recipe:r-gone',
      'recipe:r-kept',
      'salvage:c-1',
      'salvage:c-gone',
    ]);
    assert.deepEqual(fixture.warnings[0][1].omitted.map((entry) => entry.label), [
      'orphaned crafting preferences',
    ]);
  } finally {
    fixture.restore();
  }
});

test('deleteSystem sweeps learned recipes on a known-complete corpus', async () => {
  const fixture = makeSystemFixture();
  try {
    await fixture.manager._cleanupSystemScopedState(SYSTEM_ID, { removedRecipeIds: ['r-gone'] });
    assert.deepEqual(fixture.methods(), ['sweep:cleanupLearnedRecipes']);
    assert.deepEqual(fixture.calls[0].validRecipeIds, ['r-kept']);
  } finally {
    fixture.restore();
  }
});

test('deleteSystem on a PARTIAL corpus forgets only the recipes it actually deleted', async () => {
  const fixture = makeSystemFixture({
    afterCorpusRead: {
      [SETTING_KEYS.RECIPE_STORAGE_LAYOUT]: DEFINITION_STORAGE_LAYOUTS.PER_RECORD,
    },
  });
  try {
    await fixture.manager._cleanupSystemScopedState(SYSTEM_ID, {
      removedRecipeIds: ['r-gone', 'r-also-gone'],
    });
    assert.deepEqual(fixture.methods(), ['targeted:forgetDeletedRecipes']);
    assert.deepEqual(fixture.calls[0].recipeIds, ['r-also-gone', 'r-gone']);
  } finally {
    fixture.restore();
  }
});

// ---------------------------------------------------------------------------
// The source contract: no ungated route to a corpus-derived prune
// ---------------------------------------------------------------------------

const HERE = dirname(fileURLToPath(import.meta.url));
const readSource = (relative) => readFileSync(resolve(HERE, '..', relative), 'utf8');

/**
 * The two modules that ARE the gate, and are therefore allowed to call a corpus-derived
 * prune outside a `sweep:`.
 *
 * An allowlist rather than a path filter, so adding a third gate is a deliberate edit here
 * rather than something a new filename quietly acquires.
 */
const GATE_COMPOSITION_SITES = Object.freeze([
  'src/systems/startupPassComposition.js',
  'src/systems/mutationCleanupComposition.js',
]);

/** Repo-relative POSIX form, so an assertion reads the same on Windows and Linux. */
const toPosix = (value) => value.split(pathSeparator).join('/');

/** Every `.js` under `src/`, so the scan cannot miss a door by living in a new file. */
function everySourceFile(directory = resolve(HERE, '..', 'src'), collected = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = resolve(directory, entry.name);
    if (entry.isDirectory()) everySourceFile(full, collected);
    else if (entry.name.endsWith('.js')) collected.push(full);
  }
  return collected;
}

test('every corpus-derived prune anywhere under src is reached through a gate', () => {
  // A hand-maintained mirror guard, and the reason it walks the WHOLE tree: the issue that
  // filed this under-counted its own reachable sites — it named four and there are seven —
  // so the durable protection has to fail when an EIGHTH appears in a file nobody thought
  // to list. An earlier version of this scanned two named managers, which would have said
  // nothing about a new door in a third.
  //
  // The rule: a call to one of the three destructive corpus-derived collaborators may only
  // appear as the `sweep:` of a pass handed to a gate. Three exemptions, all narrow:
  // the two composition sites that ARE the gate, and the DEFINITION of each collaborator.
  const DESTRUCTIVE = /(cleanupInvalidRuns|cleanupLearnedRecipes|cleanupStalePreferences)\(/;
  const DEFINITION = /^\s*(?:export\s+)?(?:async\s+)?(?:function\s+)?(?:cleanupInvalidRuns|cleanupLearnedRecipes|cleanupStalePreferences)\(/;
  const root = resolve(HERE, '..');
  const ungated = [];

  for (const full of everySourceFile()) {
    const relative = toPosix(relativePath(root, full));
    if (GATE_COMPOSITION_SITES.includes(relative)) continue;
    // Comment text is BLANKED before the scan, never filtered after it. The `sweep:`
    // exemption is tested against the whole line, so a TRAILING comment carrying that token
    // waives a live ungated call: `cleanupInvalidRuns(new Set(), new Set()); // sweep: n/a`
    // was proven to pass this guard while pruning player-owned run data. A leading-marker
    // filter cannot see it, because the line does not begin with a marker. Same shape as
    // `tests/actor-type-literal-gate.test.js`, which is why `stripComments` is shared.
    const lines = stripComments(readFileSync(full, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (!DESTRUCTIVE.test(line)) return;
      if (DEFINITION.test(line)) return;
      // The call may sit on the `sweep:` line itself or be wrapped onto the next one.
      // `async` is admitted: a legitimate `sweep: async () =>` wrap is not an ungated call.
      const previous = lines[index - 1] ?? '';
      if (/sweep:/.test(line) || /sweep:\s*(?:async\s*)?\(\)\s*=>\s*$/.test(previous)) return;
      ungated.push(`${relative}:${index + 1} ${line.trim()}`);
    });
  }

  assert.deepEqual(ungated, [], 'a corpus-derived prune is reached without a Valid Id Basis gate');
});

test('that scan is not vacuous — it sees the calls it exempts', () => {
  // The scan reports nothing, which is also what a scan reading zero files reports. This
  // pins the population: the three collaborator definitions and the four gated calls at the
  // startup composition site are all present in the tree the walk produces.
  const DESTRUCTIVE = /(cleanupInvalidRuns|cleanupLearnedRecipes|cleanupStalePreferences)\(/;
  const matched = everySourceFile().filter((full) =>
    DESTRUCTIVE.test(stripComments(readFileSync(full, 'utf8')))
  );
  const root = resolve(HERE, '..');
  assert.deepEqual(
    matched.map((full) => toPosix(relativePath(root, full))).sort(),
    [
      'src/config/preferencesCleanup.js',
      'src/systems/CraftingRunManager.js',
      'src/systems/CraftingSystemManager.js',
      'src/systems/RecipeManager.js',
      'src/systems/RecipeVisibilityService.js',
      'src/systems/SalvageRunManager.js',
      // `mutationCleanupComposition.js` is deliberately absent: it names these collaborators
      // only in prose, and `stripComments` blanks prose. That it drops out here is itself
      // evidence the blanking runs before the scan rather than after it.
      'src/systems/startupPassComposition.js',
    ],
    'the walk must actually reach every file that names a corpus-derived prune'
  );
});

test('no caller anywhere under src invokes the orphan sweep without naming its ids', () => {
  // The public wrapper is the entrance the issue's site list missed TWICE — the compendium
  // importer's prune phase and `_deleteRecipeSet` — so this walks the whole tree rather than
  // the two files that happen to hold today's callers. A caller that omits its ids gets a
  // gate that protects the world and leaks its own orphans.
  const BARE_CALL = /cleanupOrphanedRecipeFlags\??\.?\(\s*\)/;
  const root = resolve(HERE, '..');
  const bare = [];
  const callers = new Set();
  for (const full of everySourceFile()) {
    const source = stripComments(readFileSync(full, 'utf8'));
    const relative = toPosix(relativePath(root, full));
    if (!/cleanupOrphanedRecipeFlags/.test(source)) continue;
    // The DEFINITION is not a call, and it is the one place the name legitimately appears
    // with an empty-ish parameter list.
    if (relative === 'src/systems/RecipeManager.js') {
      callers.add(relative);
    }
    source.split('\n').forEach((line, index) => {
      if (/async cleanupOrphanedRecipeFlags/.test(line)) return;
      if (!/cleanupOrphanedRecipeFlags/.test(line)) return;
      callers.add(relative);
      if (BARE_CALL.test(line)) bare.push(`${relative}:${index + 1} ${line.trim()}`);
    });
  }

  assert.deepEqual(bare, [], 'a batch caller invoked the orphan sweep with no id set');
  // Pins the population, so "no bare calls" cannot be satisfied by a walk that read nothing.
  assert.deepEqual(
    [...callers].sort(),
    [
      'src/systems/CompendiumImporter.js',
      'src/systems/CraftingSystemManager.js',
      'src/systems/RecipeManager.js',
    ],
    'the walk must actually reach every file naming the public orphan sweep'
  );
  assert.match(
    readSource('src/systems/CompendiumImporter.js'),
    /cleanupOrphanedRecipeFlags\?\.\(\{/,
    'the compendium importer must name its pruned recipe ids'
  );
  assert.match(
    readSource('src/systems/CraftingSystemManager.js'),
    /cleanupOrphanedRecipeFlags\?\.\(\{\s*removedRecipeIds/,
    'the recipe-set delete must name its removed recipe ids'
  );
});

