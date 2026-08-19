import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { composeStartupPassList } from '../src/systems/startupPassComposition.js';
import { STARTUP_PASS_ENTITY_KINDS } from '../src/systems/startupMaintenance.js';

/*
 * The boot-time destructive door (issues 1196, 1224, 1261).
 *
 * `composeStartupPassList` builds five labelled thunks, one of which prunes `user`-scoped
 * replicated preferences. Issue 1261 deleted `tests/startup-valid-id-basis.test.js` with the
 * Valid Id Basis gate it was written for, and took the arrangement-independent half of that
 * file's coverage with it — leaving this composition with no executable guard at all. This
 * suite restores that half and nothing else: there is no basis to compute any more, so nothing
 * here asserts one.
 *
 * Every failure this covers is SILENT in production. `runStartupMaintenance` catches per pass
 * into `console.error`, and an omitted pass is a `console.warn`, so a pass that stops running
 * looks exactly like a pass that ran and found nothing.
 */

/** A crafting system whose components are the salvage ids for that system. */
function system(id, componentIds) {
  return { id, components: componentIds.map((componentId) => ({ id: componentId })) };
}

/**
 * Collaborators that record what they were called with.
 *
 * Deliberately permissive: this suite is about WHICH passes are emitted and WHAT id sets they
 * carry, so every collaborator resolves and none refuses. A double that refused would test the
 * caller's error handling instead, which `runStartupMaintenance` owns.
 */
function harness({ recipes = ['r-1'], systems = [system('s-1', ['c-1'])] } = {}) {
  const calls = [];
  const record =
    (name) =>
    (...args) => {
      calls.push({ name, args });
      return Promise.resolve();
    };
  return {
    calls,
    options: {
      recipeManager: {
        getRecipes: () => recipes.map((id) => ({ id })),
        getRecipe: (id) => (recipes.includes(id) ? { id } : null),
      },
      craftingSystemManager: { getSystems: () => systems },
      craftingRunManager: {
        cleanupInvalidRuns: record('cleanupInvalidRuns'),
        pruneInstantaneousActiveRuns: record('pruneInstantaneousActiveRuns'),
      },
      salvageRunManager: { cleanupInvalidRuns: record('salvageCleanupInvalidRuns') },
      recipeVisibilityService: { cleanupLearnedRecipes: record('cleanupLearnedRecipes') },
      getSetting: () => null,
      setSetting: record('setSetting'),
      resolveGatheringActor: () => null,
      isSelectableGatheringActor: () => false,
    },
  };
}

describe('composeStartupPassList', () => {
  test('emits every declared pass on a healthy world', () => {
    const { options } = harness();
    const labels = composeStartupPassList(options).map(([label]) => label);
    assert.deepEqual(labels, Object.keys(STARTUP_PASS_ENTITY_KINDS));
  });

  /*
   * THE DRIFT GUARD, and the reason this file exists.
   *
   * `buildStartupPassList` omits any candidate whose label is absent from
   * `STARTUP_PASS_ENTITY_KINDS`, so the candidate labels and the declaration table are two
   * hand-maintained lists that must agree exactly. Renaming a label on ONE side silently
   * removes that pass from every boot, forever, reported only as a `console.warn`.
   *
   * A test that looked passes up BY the declaration table's own keys cannot see this: it would
   * agree with itself whatever the composition emits. This compares the emitted set against the
   * table, which is the only comparison that can fail.
   */
  test('every emitted label is declared, and every declared label is emitted', () => {
    const { options } = harness();
    const emitted = new Set(composeStartupPassList(options).map(([label]) => label));
    const declared = new Set(Object.keys(STARTUP_PASS_ENTITY_KINDS));
    assert.deepEqual(
      [...emitted].filter((label) => !declared.has(label)),
      [],
      'a candidate label drifted from the declaration table and its pass is being omitted'
    );
    assert.deepEqual(
      [...declared].filter((label) => !emitted.has(label)),
      [],
      'a declared pass is not being emitted'
    );
  });

  /*
   * Issue 1196's failure mode, at the composition site rather than at the function.
   *
   * `salvage:<componentId>` preference keys are NOT system-scoped, so the prune needs one flat
   * id set across every system. A derivation that kept them per-system, or that passed the
   * first system's set, prunes every live `salvage:` key belonging to any other system.
   */
  test('stale preferences prunes against the flat union, keeping other systems salvage keys', async () => {
    // A `salvage:` key belonging to the SECOND system. If the derivation kept the sets
    // per-system, or passed only the first system's, this key is not in the id set the prune
    // consults and is deleted — silently, on a healthy world. That is issue 1196's shape.
    const stored = {
      'salvage:c-1': ['a'],
      'salvage:c-3': ['b'],
      'salvage:gone': ['c'],
    };
    const writes = [];
    const { options } = harness({
      systems: [system('s-1', ['c-1', 'c-2']), system('s-2', ['c-3'])],
    });
    const stale = composeStartupPassList({
      ...options,
      getSetting: (key) => (key === 'progressiveResultOrder' ? stored : null),
      setSetting: (key, value) => {
        writes.push([key, value]);
        return Promise.resolve();
      },
    }).find(([label]) => label === 'stale preferences');
    await stale[1]();

    const write = writes.find(([key]) => key === 'progressiveResultOrder');
    assert.ok(write, 'the prune wrote nothing, so it cannot have pruned the stale key');
    assert.deepEqual(
      Object.keys(write[1]).sort(),
      ['salvage:c-1', 'salvage:c-3'],
      'a live salvage key from a second system was pruned, or the stale one survived'
    );
  });

  /*
   * The required-parameter guard `preferencesCleanup` gained in issue 1261 throws when
   * `validComponentIds` is missing. Its startup caller is the one place that supplies it, and
   * the throw would be swallowed by `runStartupMaintenance`'s per-pass catch — so if this
   * composition ever stopped passing it, the pass would simply never run again.
   *
   * Asserted by running the thunk and requiring it to resolve: the guard throws BEFORE any
   * write, so a rejection here is the argument going missing.
   */
  test('the stale-preferences thunk supplies validComponentIds, so it does not refuse', async () => {
    const { options } = harness({ systems: [system('s-1', ['c-1'])] });
    const stale = composeStartupPassList(options).find(([label]) => label === 'stale preferences');
    await assert.doesNotReject(
      stale[1](),
      'the composition dropped validComponentIds and the pass now refuses on every boot'
    );
  });

  test('each pass calls its own collaborator, with the corpus-derived id sets', async () => {
    const { options, calls } = harness({
      recipes: ['r-1', 'r-2'],
      systems: [system('s-1', ['c-1'])],
    });
    for (const [, thunk] of composeStartupPassList(options)) await thunk();
    const named = (name) => calls.find((entry) => entry.name === name);

    assert.ok(named('cleanupInvalidRuns'), 'crafting runs did not run');
    assert.deepEqual([...named('cleanupInvalidRuns').args[0]], ['r-1', 'r-2']);
    assert.deepEqual([...named('cleanupInvalidRuns').args[1]], ['s-1']);

    assert.ok(named('pruneInstantaneousActiveRuns'), 'phantom crafting runs did not run');
    assert.ok(named('salvageCleanupInvalidRuns'), 'salvage runs did not run');
    assert.deepEqual([...named('salvageCleanupInvalidRuns').args[0]], ['s-1']);

    assert.ok(named('cleanupLearnedRecipes'), 'learned recipes did not run');
    assert.deepEqual([...named('cleanupLearnedRecipes').args[0]], ['r-1', 'r-2']);
  });

  /*
   * Client identity is not an input (`data-models/spec.md`). Composition is pure and takes no
   * `game.user`, so this asserts the property by construction: the same collaborators produce
   * the same pass list however the client is placed.
   */
  test('composition is identity-independent: the same world yields the same passes', () => {
    const first = composeStartupPassList(harness().options).map(([label]) => label);
    const second = composeStartupPassList(harness().options).map(([label]) => label);
    assert.deepEqual(first, second);
  });

  test('the omission warning names what was omitted, and stays silent on a healthy world', () => {
    const { options } = harness();
    const warnings = [];
    composeStartupPassList({ ...options, warn: (...args) => warnings.push(args) });
    assert.deepEqual(warnings, [], 'a healthy world must omit nothing');
  });
});
