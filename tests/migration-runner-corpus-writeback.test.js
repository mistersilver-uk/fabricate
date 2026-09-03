/**
 * The startup migration pass's corpus WRITEBACK: its order, its containment, and its
 * order-independence.
 *
 * Successor to `migration-runner-recipe-corpus.test.js` (issue 1242), which paired each of
 * these with an arrangement-aware arm. Issue 1261 removed the arrangement; what survives here
 * is every case that never depended on one, because each states a property of the pass itself:
 *
 * - the recipes leg is issued FIRST and a tear on a later leg abandons the rest, so a failed
 *   pass cannot leave `toolIds` on recipes with the tool bodies missing from systems;
 * - a writeback rejection is CONTAINED into a deferred summary rather than escaping `run()`,
 *   where it would fire no error hook and leave the module with no managers;
 * - `migrationVersion` is not advanced by a deferred pass, so the next boot re-runs it;
 * - a corpus-global reduction reaches the same decision whatever order the corpus is stored
 *   in (`data-models/spec.md` § Destructive Pass Safety).
 *
 * The tear assertions read the recorded call log rather than the store's contents: the
 * migrations transform their input in place, so the store already carries the migrated field
 * even in a run whose write threw. Anything driven through `run()` seeds a `migrationVersion`
 * BELOW the migration under test, because `run()` returns early with no reads at all when
 * nothing is pending.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { SETTING_KEYS } from '../src/config/settings.js';
import { MIGRATION_DEFERRAL_REASONS, MigrationRunner } from '../src/migration/MigrationRunner.js';

/** A recipe the 0.6.0 catalyst-to-tool migration transforms. */
function catalystRecipe(id, systemId = 'sys-1') {
  return {
    id,
    craftingSystemId: systemId,
    catalysts: [{ componentId: 'forge', degradesOnUse: false }],
  };
}

/**
 * A whole-array world and a runner over it, recording every `setSetting` key in order.
 *
 * @param {object} [options]
 * @param {object} [options.settings] seed values, merged over the defaults
 * @param {(key: string, value: *) => Promise<void>|void} [options.onWrite] a hook that may
 *   throw to tear one leg; the key is recorded before it runs
 * @param {Array<object>} [options.migrations] override the production registry
 */
function makeWorld({ settings = {}, onWrite = null, migrations } = {}) {
  const store = new Map(
    Object.entries({
      recipes: [catalystRecipe('r1')],
      craftingSystems: [{ id: 'sys-1' }],
      gatheringConfig: {},
      migrationVersion: '0.5.0',
      ...settings,
    })
  );
  const written = [];
  const getSetting = (key) => store.get(key) ?? null;
  const setSetting = async (key, value) => {
    written.push(key);
    await onWrite?.(key, value);
    store.set(key, value);
  };
  const runner = new MigrationRunner({ getSetting, setSetting, migrations });
  return { store, written, getSetting, setSetting, runner };
}

// ---------------------------------------------------------------------------
// 1. The write order is pinned
// ---------------------------------------------------------------------------

test('the recipes key precedes every other whole-array write', async () => {
  const world = makeWorld();

  await world.runner.run();

  assert.ok(
    world.written.indexOf(SETTING_KEYS.RECIPES) <
      world.written.indexOf(SETTING_KEYS.CRAFTING_SYSTEMS),
    'the recipes leg is issued before the systems leg'
  );
  assert.ok(
    world.written.indexOf(SETTING_KEYS.RECIPES) <
      world.written.indexOf(SETTING_KEYS.MIGRATION_VERSION)
  );
  // Belt and braces only: this cannot fail while the version bump stays unconditional and
  // last, so it is NOT the ordering guard.
  assert.equal(
    world.written.indexOf(SETTING_KEYS.MIGRATION_VERSION),
    world.written.length - 1,
    'the version bump is last'
  );
});

// ---------------------------------------------------------------------------
// 2. Cross-key integrity is asserted by a TEAR, not by a clean run
// ---------------------------------------------------------------------------

for (const [label, settings] of [
  ['0.6.0 (recipes + systems)', { migrationVersion: '0.5.0' }],
  ['1.6.0 (recipes + gatheringConfig)', { migrationVersion: '1.5.0' }],
]) {
  test(`a tear on the next leg abandons the rest: ${label}`, async () => {
    const world = makeWorld({
      settings: {
        ...settings,
        recipes: [
          {
            id: 'r1',
            craftingSystemId: 'sys-1',
            catalysts: [{ componentId: 'forge', degradesOnUse: false }],
            resultSelection: { provider: 'macroOutcome' },
          },
        ],
      },
      onWrite: (key) => {
        if (key !== SETTING_KEYS.RECIPES) throw new Error(`tear on ${key}`);
      },
    });

    const summary = await world.runner.run();

    assert.equal(summary.deferred, true, 'the rejection did not escape run()');
    assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED);
    // The recipes leg landed FIRST, and exactly one further leg was attempted before the
    // pass abandoned the rest. A clean run proves nothing here: both legs land in either
    // order, which is why an ordering defect is invisible to it.
    assert.equal(world.written[0], SETTING_KEYS.RECIPES, 'the recipes leg was issued first');
    assert.equal(world.written.length, 2, 'the pass stopped at the first failed leg');
    assert.equal(
      world.written.includes(SETTING_KEYS.MIGRATION_VERSION),
      false,
      'the version bump was abandoned'
    );
    assert.equal(world.store.get('migrationVersion'), settings.migrationVersion);
  });
}

test('a rejection on the recipes leg defers before any other leg is issued', async () => {
  const world = makeWorld({
    onWrite: (key) => {
      if (key === SETTING_KEYS.RECIPES) throw new Error('tear on recipes');
    },
  });

  const summary = await world.runner.run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED);
  assert.deepEqual(world.written, [SETTING_KEYS.RECIPES]);
  assert.equal(world.store.get('migrationVersion'), '0.5.0');
});

test('a corpus read that throws defers the pass rather than escaping run()', async () => {
  const runner = new MigrationRunner({
    getSetting: (key) => (key === SETTING_KEYS.MIGRATION_VERSION ? '0.5.0' : null),
    setSetting: async () => {},
    recipeCorpus: {
      loadAll: async () => {
        throw new Error('unreadable corpus');
      },
      createOrUpdateAll: async () => {},
    },
  });

  const summary = await runner.run();

  assert.equal(summary.deferred, true);
  assert.equal(summary.deferredReason, MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED);
  assert.equal(summary.ran, 0, 'no migration ran');
});

test('a pending pass that transforms nothing issues ZERO corpus writes', async () => {
  // Not "zero writes": `MIGRATION_VERSION` is written unconditionally, outside every
  // changed-guard, so an unqualified claim could never pass and would be loosened to
  // something vacuous during implementation.
  const world = makeWorld({
    settings: { recipes: [], craftingSystems: [], migrationVersion: '0.0.1' },
    migrations: [{ version: '9.9.9', label: 'no-op', migrate: (data) => data }],
  });

  await world.runner.run();

  assert.deepEqual(
    world.written,
    [SETTING_KEYS.MIGRATION_VERSION],
    'the version bump is the only write, and it is unconditional'
  );
});

// ---------------------------------------------------------------------------
// 3. The deferral notices
// ---------------------------------------------------------------------------

test('only the write-failure notice instructs a reload', () => {
  const strings = JSON.parse(readFileSync(new URL('../lang/en.json', import.meta.url), 'utf8'))
    .FABRICATE.Migration.Deferred;

  // Only the writeback failure has already transformed this session's live setting values,
  // so only it can leave a GM writing migrated records back under an un-advanced version.
  assert.match(strings.WritebackFailed, /reload foundry now/i);
  assert.equal(/reload/i.test(strings.CorpusUnreadable), false);
});

test('main.js reports a deferred pass before it reports an aborted one', () => {
  // A source scan, and deliberately so: `main.js` cannot be imported under `node --test`, and
  // a unit test that hand-injects the collaborator cannot observe the wiring at all.
  const source = readFileSync(fileURLToPath(new URL('../src/main.js', import.meta.url)), 'utf8');

  assert.match(
    source,
    /if \(summary\?\.deferred === true\) \{/,
    'the deferral branch exists and sits above the abort branch'
  );
  assert.ok(
    source.indexOf('summary?.deferred === true') < source.indexOf('summary?.aborted === true'),
    'the deferral branch is checked BEFORE the abort branch, because a deferral reports aborted:false'
  );
  // The GM-facing notice: a deferred pass must reach `ui.notifications.error`, or a world
  // whose migrations silently did not run says nothing at all.
  assert.match(source, /MIGRATION_DEFERRAL_NOTICES\[summary\.deferredReason\]/);
  assert.match(source, /Migration\.Deferred\.WritebackFailed/);
});

// ---------------------------------------------------------------------------
// 4. Corpus order does not change any decision
// ---------------------------------------------------------------------------

test('a permuted corpus produces the same decisions and set-equal reference lists', async () => {
  const records = () => [
    {
      id: 'r1',
      craftingSystemId: 'alch-1',
      resultSelection: { provider: 'check' },
      resultGroups: [{ checkOutcomeIds: ['a'] }, { checkOutcomeIds: ['b'] }],
      linkedRecipeItemUuid: 'Item.book-1',
    },
    {
      id: 'r2',
      craftingSystemId: 'alch-1',
      resultSelection: { provider: 'check' },
      linkedRecipeItemUuid: 'Item.book-1',
    },
    // Two check voters and one ingredient voter, so the routed tie-break is decided by a
    // COUNT and not by whichever record happens to come first. Ordering r3 (check) first and
    // r5 (ingredientSet) first in the two runs is what makes a first-wins reduction visible.
    { id: 'r3', craftingSystemId: 'routed-1', resultSelection: { provider: 'check' } },
    { id: 'r4', craftingSystemId: 'routed-1', resultSelection: { provider: 'check' } },
    { id: 'r5', craftingSystemId: 'routed-1', resultSelection: { provider: 'ingredientSet' } },
  ];
  const systems = () => [
    {
      id: 'alch-1',
      resolutionMode: 'alchemy',
      // 1.13.0 appends recipe ids onto this list in CORPUS ITERATION ORDER, so it is the one
      // persisted value in the registry whose bytes change under permutation. Membership is a
      // set semantically, which is why the assertion below is set equality — and why the
      // ARRAY inequality is asserted too, so the set comparison cannot go vacuous.
      recipeItemDefinitions: [{ id: 'def-1', sourceItemUuid: 'Item.book-1' }],
    },
    { id: 'routed-1', resolutionMode: 'routed' },
  ];
  const run = async (order) => {
    const seeded = records();
    const world = makeWorld({
      settings: {
        recipes: order.map((id) => seeded.find((record) => record.id === id)),
        craftingSystems: systems(),
        migrationVersion: '1.8.0',
      },
    });
    await world.runner.run();
    return world.store.get('craftingSystems');
  };

  const forward = await run(['r1', 'r2', 'r3', 'r4', 'r5']);
  const reversed = await run(['r5', 'r4', 'r3', 'r2', 'r1']);

  const byId = (list, id) => list.find((system) => system.id === id);
  assert.equal(
    byId(forward, 'alch-1').alchemy.checkMode,
    byId(reversed, 'alch-1').alchemy.checkMode,
    'the alchemy check-mode reduction is order-free'
  );
  assert.equal(
    byId(forward, 'routed-1').resolutionMode,
    byId(reversed, 'routed-1').resolutionMode,
    'the routed tie-break is order-free'
  );
  assert.equal(
    byId(forward, 'routed-1').resolutionMode,
    'routedByCheck',
    'and the count really does decide it, so the comparison is not vacuous'
  );

  // SET equality, not array equality. 1.13.0 appends recipe ids in corpus iteration order, so
  // a re-sorted corpus yields a permuted list. Membership is a set semantically, and this is
  // the one accepted, gated deviation from order-independence.
  const recipeIdsOf = (list) => [...byId(list, 'alch-1').recipeItemDefinitions[0].recipeIds];
  assert.deepEqual(recipeIdsOf(forward).sort(), ['r1', 'r2'], 'the list really is populated');
  assert.deepEqual(recipeIdsOf(forward).sort(), recipeIdsOf(reversed).sort());
  assert.notDeepEqual(
    recipeIdsOf(forward),
    recipeIdsOf(reversed),
    'and the ARRAY really is permuted, so the set comparison above is not vacuous'
  );
});

test('a permuted corpus disables the same SET of colliding alchemy recipes', async () => {
  // The 1.17.0 reconciliation is the one cross-record migration whose order-independence is
  // not obvious: it computes conflicts and then disables BOTH participants of each. The
  // inseparable fixture is from `tests/migrate-essences-to-ingredient-groups.test.js` — A
  // requires component C; B requires fire essence, of which C is the sole carrier, so after
  // folding both reduce to the identical signature.
  const seedRecords = () => [
    {
      id: 'A',
      name: 'A',
      craftingSystemId: 'alch-1',
      enabled: true,
      ingredientSets: [
        {
          id: 'sA',
          ingredientGroups: [
            { id: 'gA', options: [{ quantity: 1, match: { type: 'component', componentId: 'C' } }] },
          ],
        },
      ],
    },
    {
      id: 'B',
      name: 'B',
      craftingSystemId: 'alch-1',
      enabled: true,
      ingredientSets: [{ id: 'sB', ingredientGroups: [], essences: { fire: 1 } }],
    },
  ];
  const seedSystems = () => [
    {
      id: 'alch-1',
      resolutionMode: 'alchemy',
      alchemy: { checkMode: 'none' },
      components: [
        { id: 'C', name: 'Cinder', tags: [], essences: { fire: 1 } },
        { id: 'X', name: 'Xenon', tags: [], essences: {} },
      ],
    },
  ];
  const disabledIdsFor = async (order) => {
    const seeded = seedRecords();
    const world = makeWorld({
      settings: {
        recipes: order.map((id) => seeded.find((record) => record.id === id)),
        craftingSystems: seedSystems(),
        migrationVersion: '1.16.0',
      },
    });
    await world.runner.run();
    return world.store
      .get('recipes')
      .filter((record) => record.enabled === false)
      .map((record) => record.id)
      .sort();
  };

  const forward = await disabledIdsFor(['A', 'B']);
  const reversed = await disabledIdsFor(['B', 'A']);

  assert.deepEqual(forward, ['A', 'B'], 'the fixture really does collide');
  assert.deepEqual(forward, reversed, 'the disabled SET is invariant under permutation');
});
