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
 * nothing detects.
 *
 * **The third direction the spec adds here**: refusing the sweep must not itself leak the
 * flags the mutation orphaned. A refused sweep falls back to a SUBJECT-TARGETED prune of
 * exactly the ids the caller removed, so the closed cases assert both that the corpus-wide
 * sweep did NOT run and that the just-deleted recipe's flags went anyway.
 *
 * ## What CLOSES the gate after issue 1261, and why the fixtures changed
 *
 * Every closed-direction case used to build a PARTIAL CORPUS by moving a Definition Storage
 * setting after the corpus read, and reach the gate through the real `RecipeManager` driven
 * from SETTINGS — never by injecting a basis — because injecting the answer is how two
 * earlier acceptance sets for #1224 went green against an implementation whose gate never ran.
 *
 * Issue 1261 removed the storage arrangement, and with it the only mechanism that could
 * produce a partial corpus: each class now arrives in one whole-array read that either
 * returns the corpus or throws. So no production seam can drive `basis[kind] !== true`, and
 * a settings-driven closed case can no longer be written at all. The compromise is forced
 * rather than chosen, and it is bounded to ONE seam: the closed direction is asserted
 * directly against {@link buildStartupPassList} with an injected basis, which is the pure
 * builder both composition sites call, while every case that reaches the real managers is an
 * OPEN-direction case with no injection anywhere in it.
 *
 * The remaining production route to an omission is an UNDECLARED pass, which is not
 * hypothetical: it is what stops a future destructive prune from shipping ungated by
 * forgetting to declare its entity kinds. The targeted-fallback cases are driven through it.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { relative as relativePath, resolve, sep as pathSeparator, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { installFoundryEnv } from './helpers/foundryEnv.js';
import { stripComments } from './helpers/sourceScan.js';

const { SETTING_KEYS } = await import('../src/config/settings.js');
const { Recipe } = await import('../src/models/Recipe.js');
const { CraftingRunManager } = await import('../src/systems/CraftingRunManager.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { MUTATION_CLEANUP_ENTITY_KINDS, runGatedMutationCleanup } = await import(
  '../src/systems/mutationCleanupComposition.js'
);
const { STARTUP_PASS_ENTITY_KINDS, buildStartupPassList, WHOLE_CORPUS_ID_BASIS } = await import(
  '../src/systems/startupMaintenance.js'
);
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

const SYSTEM_ID = 'sys-1';

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

/**
 * A REAL `RecipeManager` that has genuinely read a corpus, plus recording stand-ins for the
 * two destructive collaborators.
 *
 * Nothing is injected: the manager reads its corpus through the shipped repository and the
 * gate decides from the pass declarations, so every case built on this fixture observes the
 * production path end to end.
 */
async function makeRecipeFixture() {
  const env = installFoundryEnv();
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
  };

  globalThis.game.fabricate = {
    getCraftingSystemManager: () => systemManager,
    getCraftingRunManager: () => runManager,
    getRecipeVisibilityService: () => visibilityService,
  };

  const recipeManager = new RecipeManager();
  await recipeManager.initialize();

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

// ---------------------------------------------------------------------------
// The public orphan sweep
// ---------------------------------------------------------------------------

test('the OPEN direction — a whole corpus still runs both corpus-derived sweeps', async () => {
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

test('an omitted sweep still prunes what the caller REMOVED — the gate leaks nothing', async () => {
  // The third direction. Gating alone would trade a data-loss defect for an orphaned-flag
  // leak that nothing detects, because the flags a deletion orphans are the entire reason
  // this cleanup path exists.
  //
  // Driven through an UNDECLARED pass, which after issue 1261 is the production route to an
  // omission: a future destructive prune shipped without declaring its entity kinds is
  // omitted rather than run, and its targeted fallback must still fire.
  const removed = ['r-also-gone', 'r-doomed'];
  const targeted = [];
  const swept = [];

  const outcome = await runGatedMutationCleanup({
    passes: [
      {
        label: 'a pass nobody declared',
        sweep: () => {
          swept.push('sweep');
          return Promise.resolve();
        },
        targeted: () => {
          targeted.push([...removed]);
          return Promise.resolve();
        },
      },
    ],
    warn: () => {},
  });

  assert.deepEqual(swept, [], 'the corpus-derived sweep did not run');
  assert.deepEqual(outcome.omitted, ['a pass nobody declared']);
  assert.deepEqual(outcome.targeted, ['a pass nobody declared']);
  assert.deepEqual(
    targeted,
    [['r-also-gone', 'r-doomed']],
    'the fallback prunes EXACTLY the ids the caller removed, and infers nothing'
  );
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
  // with no subject to target, and an omission there is a no-op rather than a leak.
  const warnings = [];

  const outcome = await runGatedMutationCleanup({
    passes: [
      {
        label: 'a pass nobody declared',
        sweep: () => Promise.reject(new Error('the omitted sweep must not run')),
        targeted: null,
      },
    ],
    warn: (_message, detail) => warnings.push(detail),
  });

  assert.deepEqual(outcome.omitted, ['a pass nobody declared']);
  assert.deepEqual(outcome.targeted, []);
  assert.deepEqual(warnings[0].targetedFallbacks, []);
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

test('an import sweeps against the POST-import corpus and names no removed ids', async () => {
  const fixture = await makeRecipeFixture();
  try {
    await fixture.recipeManager.importRecipes([
      { id: 'r-new', name: 'New', craftingSystemId: SYSTEM_ID },
    ]);
    assert.deepEqual(fixture.methods(), [
      'sweep:cleanupInvalidRuns',
      'sweep:cleanupLearnedRecipes',
    ]);
    assert.deepEqual(
      fixture.calls[0].validRecipeIds,
      fixture.recipeManager
        .getRecipes({})
        .map((recipe) => recipe.id)
        .sort(),
      'an import adds records, so the sweep prunes against the POST-import corpus'
    );
    assert.ok(
      fixture.calls[0].validRecipeIds.includes('r-kept'),
      'and the set is really populated, so the comparison is not vacuous'
    );
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

test('an UNDECLARED mutation-time pass is omitted rather than run', async () => {
  // The property that stops a future destructive prune from shipping ungated by forgetting
  // to declare it. The declared pass running in the same call is what proves the omission was
  // not a blanket refusal; the `undeclared: true` flag on the omission is what proves it was
  // decided by the declaration table rather than by an incomplete kind. Asserting only "it
  // did not run" leaves both.
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
 * the scope of the prune observable at all.
 */
function makeSystemFixture() {
  const env = installFoundryEnv();
  env.settings.set(SETTING_KEYS.PROGRESSIVE_RESULT_ORDER, {
    'recipe:r-kept': ['live recipe'],
    'recipe:r-gone': ['stale recipe'],
    'salvage:c-1': ['live component'],
    'salvage:c-gone': ['stale component'],
  });

  const calls = [];
  const recipeManager = {
    getRecipes: () => [{ id: 'r-kept', craftingSystemId: SYSTEM_ID }],
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

test('the preference sweep KEEPS the live salvage key while dropping the stale one', async () => {
  // The open direction, and it also pins a defect this gate exposed: the component ids were
  // never passed, so `validComponentIds` took its empty-set default and EVERY
  // `salvage:<componentId>` key was dropped on every resolution-mode change and every system
  // deletion — a corpus-derived prune against a basis of nothing. Issue 1261 closed the
  // default itself: the parameter is now REQUIRED, so omitting it throws rather than pruning.
  const fixture = makeSystemFixture();
  try {
    await fixture.manager._cleanupCraftingPreferences();
    assert.deepEqual(Object.keys(fixture.order()).sort(), ['recipe:r-kept', 'salvage:c-1']);
  } finally {
    fixture.restore();
  }
});

test('the preference pass is omitted when the COMPONENT basis alone is incomplete', () => {
  // The union declaration doing its job, asserted at the BUILDER seam because no production
  // seam can produce an incomplete basis after issue 1261. This pass rewrites ONE map keyed
  // by both `recipe:` and `salvage:` scopes, so an incomplete component basis must stop the
  // whole thing rather than let the recipe half proceed and take every `salvage:` key with
  // it — which is why it is declared on the UNION and must not be decomposed.
  const ran = [];
  const omissions = [];
  const candidates = [
    ['orphaned learned recipes', () => ran.push('orphaned learned recipes')],
    ['orphaned crafting preferences', () => ran.push('orphaned crafting preferences')],
  ];

  const emitted = buildStartupPassList({
    candidates,
    // `componentIdentityRemap` is supplied TRUE so this arm isolates the `components: false`
    // case. It is a separate kind (issue 1363) asking whether component ids are still CURRENT
    // rather than whether the corpus is COMPLETE, and it has its own arm below.
    basis: { ...WHOLE_CORPUS_ID_BASIS, components: false, componentIdentityRemap: true },
    declarations: MUTATION_CLEANUP_ENTITY_KINDS,
    onOmit: (omission) => omissions.push(omission),
  });

  assert.deepEqual(
    emitted.map(([label]) => label),
    ['orphaned learned recipes'],
    'the recipe-only pass still runs, so the omission is not a blanket refusal'
  );
  assert.deepEqual(omissions, [
    {
      label: 'orphaned crafting preferences',
      incompleteKinds: ['components'],
      undeclared: false,
    },
  ]);
});

test('the preference pass is omitted when component ids are COMPLETE but not CURRENT', () => {
  // The second, independent reason to withhold the same pass (issue 1363): the `1.30.0`
  // migration MOVES component ids, and the pass that repairs every actor-side reference to
  // them runs later. Completeness and CURRENCY are different questions, and the shared
  // `WHOLE_CORPUS_ID_BASIS` only ever answered the first.
  const omissions = [];
  const emitted = buildStartupPassList({
    candidates: [
      ['orphaned learned recipes', () => {}],
      ['orphaned crafting preferences', () => {}],
    ],
    basis: { ...WHOLE_CORPUS_ID_BASIS, componentIdentityRemap: false },
    declarations: MUTATION_CLEANUP_ENTITY_KINDS,
    onOmit: (omission) => omissions.push(omission),
  });

  assert.deepEqual(emitted.map(([label]) => label), ['orphaned learned recipes']);
  assert.deepEqual(omissions, [
    {
      label: 'orphaned crafting preferences',
      incompleteKinds: ['componentIdentityRemap'],
      undeclared: false,
    },
  ]);
});

test('a caller that supplies NO basis for the new kind omits the pass, rather than running it', () => {
  // FAIL CLOSED. `runGatedMutationCleanup` defaults to `WHOLE_CORPUS_ID_BASIS`, which does not
  // carry `componentIdentityRemap` at all — so a caller that forgets to answer the currency
  // question skips the sweep instead of pruning against ids that may have moved.
  const omissions = [];
  const emitted = buildStartupPassList({
    candidates: [['orphaned crafting preferences', () => {}]],
    basis: WHOLE_CORPUS_ID_BASIS,
    declarations: MUTATION_CLEANUP_ENTITY_KINDS,
    onOmit: (omission) => omissions.push(omission),
  });
  assert.deepEqual(emitted, []);
  assert.deepEqual(omissions[0].incompleteKinds, ['componentIdentityRemap']);
});

test('a declared kind must be positively true, so a renamed key omits rather than runs', () => {
  // `basis[kind] === true` rather than `!== false`: a threading typo or a renamed entity kind
  // must omit the pass, never ship it against ids nothing vouched for.
  const omissions = [];

  const emitted = buildStartupPassList({
    candidates: [['orphaned learned recipes', () => {}]],
    basis: { recipesTypo: true, systems: true, components: true },
    declarations: MUTATION_CLEANUP_ENTITY_KINDS,
    onOmit: (omission) => omissions.push(omission),
  });

  assert.deepEqual(emitted, []);
  assert.deepEqual(omissions, [
    { label: 'orphaned learned recipes', incompleteKinds: ['recipes'], undeclared: false },
  ]);
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

