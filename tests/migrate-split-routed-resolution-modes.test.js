/**
 * Tests for the 1.9.0 migration
 * (src/migration/migrateSplitRoutedResolutionModes.js): splitting the single
 * crafting `routed` mode into `routedByIngredients` / `routedByCheck` by majority
 * provider (ties → routedByIngredients, zero-recipe → routedByIngredients), with
 * minority reconciliation (drop the now-meaningless resultSelection + log), the
 * provider drop on every migrated recipe, the untouched salvage/gathering `routed`
 * enums, idempotency, and purity.
 *
 * node:test + node:assert/strict. Pure functions; no Foundry globals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateSplitRoutedResolutionModes } from '../src/migration/migrateSplitRoutedResolutionModes.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

function routedSystem(id = 'sys-r') {
  return { id, name: 'Routed Sys', resolutionMode: 'routed' };
}

function recipe(systemId, provider, id = 'recipe-1') {
  const base = { id, name: id, craftingSystemId: systemId, resultGroups: [{ id: 'g1', name: 'A' }] };
  return provider ? { ...base, resultSelection: { provider } } : base;
}

function migrate(systems, recipes) {
  return migrateSplitRoutedResolutionModes({ systems, recipes });
}

// --- Majority-provider system-mode decision ---------------------------------

test('majority check → routedByCheck; minority ingredientSet recipe reconciled (provider dropped)', () => {
  const recipes = [
    recipe('sys-r', 'check', 'a'),
    recipe('sys-r', 'check', 'b'),
    recipe('sys-r', 'ingredientSet', 'c'),
  ];
  const out = migrate([routedSystem()], recipes);
  assert.equal(out.systems[0].resolutionMode, 'routedByCheck');
  // Every recipe of a migrated system loses its now-meaningless resultSelection.
  for (const r of out.recipes) assert.equal(r.resultSelection, undefined);
});

test('majority ingredientSet → routedByIngredients', () => {
  const recipes = [
    recipe('sys-r', 'ingredientSet', 'a'),
    recipe('sys-r', 'ingredientSet', 'b'),
    recipe('sys-r', 'check', 'c'),
  ];
  const out = migrate([routedSystem()], recipes);
  assert.equal(out.systems[0].resolutionMode, 'routedByIngredients');
});

test('tie breaks to routedByIngredients', () => {
  const recipes = [recipe('sys-r', 'check', 'a'), recipe('sys-r', 'ingredientSet', 'b')];
  const out = migrate([routedSystem()], recipes);
  assert.equal(out.systems[0].resolutionMode, 'routedByIngredients');
});

test('a routed system with no recipes resolves to routedByIngredients', () => {
  const out = migrate([routedSystem()], []);
  assert.equal(out.systems[0].resolutionMode, 'routedByIngredients');
});

test('minority recipes are logged for re-authoring, never silently mis-routed', () => {
  const logged = [];
  const original = console.log;
  console.log = (msg) => logged.push(String(msg));
  try {
    const recipes = [
      recipe('sys-r', 'check', 'maj-1'),
      recipe('sys-r', 'check', 'maj-2'),
      recipe('sys-r', 'ingredientSet', 'minority'),
    ];
    migrate([routedSystem()], recipes);
    assert.ok(
      logged.some((line) => line.includes('minority') && line.includes('routedByCheck')),
      'the disagreeing recipe is flagged'
    );
    assert.ok(
      !logged.some((line) => line.includes('maj-1')),
      'agreeing recipes are not flagged'
    );
  } finally {
    console.log = original;
  }
});

// --- Scope: salvage / gathering / non-routed are untouched -------------------

test('does not touch a salvage routed token or a non-routed system', () => {
  const systems = [
    { id: 'a', resolutionMode: 'simple', salvageResolutionMode: 'routed' },
    { id: 'b', resolutionMode: 'progressive' },
  ];
  const out = migrate(systems, []);
  assert.equal(out.systems[0].resolutionMode, 'simple');
  assert.equal(out.systems[0].salvageResolutionMode, 'routed', 'salvage routed token kept');
  assert.equal(out.systems[1].resolutionMode, 'progressive');
});

test('only recipes of a migrated routed system are reconciled', () => {
  const systems = [routedSystem('sys-r'), { id: 'sys-s', resolutionMode: 'simple' }];
  const recipes = [recipe('sys-r', 'check', 'r1'), recipe('sys-s', 'check', 's1')];
  const out = migrate(systems, recipes);
  const bySystem = Object.fromEntries(out.recipes.map((r) => [r.craftingSystemId, r]));
  assert.equal(bySystem['sys-r'].resultSelection, undefined, 'migrated system recipe cleared');
  assert.deepEqual(
    bySystem['sys-s'].resultSelection,
    { provider: 'check' },
    'unrelated system recipe untouched'
  );
});

// --- Idempotency + purity ---------------------------------------------------

test('is idempotent — re-running over migrated data is a no-op', () => {
  const once = migrate([routedSystem()], [recipe('sys-r', 'check', 'a')]);
  const twice = migrateSplitRoutedResolutionModes(once);
  assert.deepEqual(twice.systems, once.systems);
  assert.deepEqual(twice.recipes, once.recipes);
});

test('does not mutate the input payload', () => {
  const input = { systems: [routedSystem()], recipes: [recipe('sys-r', 'check', 'a')] };
  const snapshot = structuredClone(input);
  migrateSplitRoutedResolutionModes(input);
  assert.deepEqual(input, snapshot, 'input payload is cloned, not mutated');
});

test('passes through absent settings keys without throwing', () => {
  const out = migrateSplitRoutedResolutionModes({});
  assert.equal(out.systems, undefined);
  assert.equal(out.recipes, undefined);
});

// --- Runs through the registered runner -------------------------------------

test('runs through MigrationRunner from 1.8.0 and lands at the highest version', async () => {
  const store = new Map([
    ['migrationVersion', '1.8.0'],
    ['craftingSystems', [routedSystem()]],
    ['recipes', [recipe('sys-r', 'check', 'a'), recipe('sys-r', 'ingredientSet', 'b')]],
  ]);
  const runner = new MigrationRunner({
    getSetting: (key) => store.get(key),
    setSetting: async (key, value) => store.set(key, value),
  });
  await runner.run();
  assert.equal(store.get('migrationVersion'), '1.14.0');
  // 1 check + 1 ingredientSet → tie → routedByIngredients.
  assert.equal(store.get('craftingSystems')[0].resolutionMode, 'routedByIngredients');
  for (const r of store.get('recipes')) assert.equal(r.resultSelection, undefined);
});
