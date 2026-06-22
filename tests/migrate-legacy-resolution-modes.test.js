/**
 * Tests for the 1.4.0 migration
 * (src/migration/migrateLegacyResolutionModes.js): hard-migrating legacy
 * `mapped`/`tiered` resolution modes to canonical `routed` + a seeded
 * result-selection provider, with the tiered group-name reconciliation
 * (rename + fan-in split + drop `outcomeRouting`), orphan/unrouted/reserved-keyword
 * edge cases, the post-rename collision hard-delete + JSON log, idempotency, and
 * purity.
 *
 * node:test + node:assert/strict. Pure functions; no Foundry globals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateLegacyResolutionModes } from '../src/migration/migrateLegacyResolutionModes.js';

// ---------------------------------------------------------------------------
// Fixture helpers (DRY: every case builds from these tiny shape factories so the
// suite never re-declares the same large literal — satisfies the Sonar new-code
// duplication gate the way migrate-remove-system-provider.test.js does).
// ---------------------------------------------------------------------------

function group(id, name, results = [{ id: `${id}-r` }]) {
  return { id, name, results };
}

function mappedSystem(id = 'sys-mapped') {
  return { id, name: 'Mapped Sys', resolutionMode: 'mapped' };
}

function tieredSystem(id = 'sys-tiered') {
  return { id, name: 'Tiered Sys', resolutionMode: 'tiered', salvageResolutionMode: 'tiered' };
}

function recipe(systemId, extra = {}) {
  return {
    id: extra.id || 'recipe-1',
    name: extra.name || 'Recipe',
    craftingSystemId: systemId,
    ingredientSets: [{ id: 'set-1', resultGroupId: 'g1' }],
    resultGroups: extra.resultGroups || [group('g1', 'Output')],
    ...extra,
  };
}

function migrate(systems, recipes) {
  return migrateLegacyResolutionModes({ systems, recipes });
}

function groupsByName(groups) {
  return Object.fromEntries(groups.map((g) => [g.name, g]));
}

// ---------------------------------------------------------------------------
// System + mapped recipes
// ---------------------------------------------------------------------------

test('mapped system → routed; its recipes get ingredientSet provider', () => {
  const out = migrate([mappedSystem()], [recipe('sys-mapped')]);
  assert.equal(out.systems[0].resolutionMode, 'routed');
  assert.equal(out.recipes[0].resultSelection.provider, 'ingredientSet');
  // No data reshaping beyond provider seeding.
  assert.deepEqual(out.recipes[0].resultGroups, [group('g1', 'Output')]);
});

test('tiered system → routed; salvageResolutionMode token tiered → routed', () => {
  const out = migrate([tieredSystem()], []);
  assert.equal(out.systems[0].resolutionMode, 'routed');
  assert.equal(out.systems[0].salvageResolutionMode, 'routed');
});

test('non-legacy systems and their recipes are left untouched', () => {
  const systems = [{ id: 'sys-r', resolutionMode: 'routed' }];
  const recipes = [recipe('sys-r', { resultSelection: { provider: 'ingredientSet' } })];
  const out = migrate(systems, recipes);
  assert.equal(out.systems[0].resolutionMode, 'routed');
  assert.equal(out.recipes.length, 1);
});

// ---------------------------------------------------------------------------
// Tiered group-name reconciliation
// ---------------------------------------------------------------------------

test('tiered recipe → macroOutcome; routed groups renamed to outcome, outcomeRouting dropped', () => {
  const recipes = [
    recipe('sys-tiered', {
      resultGroups: [group('g1', 'Old A'), group('g2', 'Old B')],
      outcomeRouting: { success: 'g1', critical: 'g2' },
    }),
  ];
  const out = migrate([tieredSystem()], recipes);
  const r = out.recipes[0];
  assert.equal(r.resultSelection.provider, 'macroOutcome');
  assert.equal('outcomeRouting' in r, false, 'outcomeRouting removed');
  const byId = Object.fromEntries(r.resultGroups.map((g) => [g.id, g.name]));
  assert.equal(byId.g1, 'success');
  assert.equal(byId.g2, 'critical');
});

test('orphan outcome (no resolvable group) is logged and leaves the recipe migratable', () => {
  const recipes = [
    recipe('sys-tiered', {
      resultGroups: [group('g1', 'Output')],
      outcomeRouting: { success: 'g1', bonus: 'missing-group' },
    }),
  ];
  const out = migrate([tieredSystem()], recipes);
  assert.equal(out.recipes.length, 1, 'recipe is not deleted for an orphan outcome');
  const byId = Object.fromEntries(out.recipes[0].resultGroups.map((g) => [g.id, g.name]));
  assert.equal(byId.g1, 'success');
});

test('fan-in (multiple outcomes → one group) splits into per-outcome clones with identical results', () => {
  const recipes = [
    recipe('sys-tiered', {
      resultGroups: [group('g1', 'Shared', [{ id: 'shared-r' }])],
      outcomeRouting: { success: 'g1', critical: 'g1' },
    }),
  ];
  const out = migrate([tieredSystem()], recipes);
  const groups = out.recipes[0].resultGroups;
  assert.equal(groups.length, 2, 'group split into two');
  const byName = groupsByName(groups);
  // Lowest-sorted outcome ('critical') keeps the original group id.
  assert.equal(byName.critical.id, 'g1');
  assert.notEqual(byName.success.id, 'g1', 'clone gets a fresh id');
  assert.deepEqual(byName.critical.results, [{ id: 'shared-r' }]);
  assert.deepEqual(byName.success.results, [{ id: 'shared-r' }], 'clone awards the same results');
});

test('unrouted group keeps its name (unreachable by name matching, like the old behavior)', () => {
  const recipes = [
    recipe('sys-tiered', {
      resultGroups: [group('g1', 'Output'), group('g2', 'Untouched')],
      outcomeRouting: { success: 'g1' },
    }),
  ];
  const out = migrate([tieredSystem()], recipes);
  const byId = Object.fromEntries(out.recipes[0].resultGroups.map((g) => [g.id, g.name]));
  assert.equal(byId.g1, 'success');
  assert.equal(byId.g2, 'Untouched', 'unrouted group name preserved');
});

test('reserved-keyword outcome drops to the failure path without renaming any group', () => {
  const recipes = [
    recipe('sys-tiered', {
      resultGroups: [group('g1', 'Output'), group('g2', 'Fallback')],
      outcomeRouting: { success: 'g1', fail: 'g2', hazard: 'g2' },
    }),
  ];
  const out = migrate([tieredSystem()], recipes);
  const byId = Object.fromEntries(out.recipes[0].resultGroups.map((g) => [g.id, g.name]));
  assert.equal(byId.g1, 'success');
  // 'fail' and 'hazard' are reserved → no rename, group keeps its original name.
  assert.equal(byId.g2, 'Fallback');
});

test('post-rename normalized-name collision → recipe hard-deleted with JSON log', () => {
  const logged = [];
  const original = console.log;
  console.log = (msg) => logged.push(String(msg));
  try {
    const recipes = [
      recipe('sys-tiered', {
        id: 'doomed',
        resultGroups: [group('g1', 'A'), group('g2', 'B')],
        // Both outcomes normalize to the same name → unavoidable collision.
        outcomeRouting: { Success: 'g1', success: 'g2' },
      }),
      recipe('sys-tiered', { id: 'survivor', outcomeRouting: { success: 'g1' } }),
    ];
    const out = migrate([tieredSystem()], recipes);
    assert.deepEqual(
      out.recipes.map((r) => r.id),
      ['survivor'],
      'unmigratable recipe removed, others survive'
    );
    assert.ok(
      logged.some((line) => line.includes('doomed') && line.includes('unmigratable')),
      'removal is JSON-logged'
    );
  } finally {
    console.log = original;
  }
});

test('reconciliation applies per-step as well as at the recipe level', () => {
  const recipes = [
    recipe('sys-tiered', {
      resultGroups: [group('g1', 'Top')],
      outcomeRouting: { success: 'g1' },
      steps: [
        {
          id: 'step-1',
          resultGroups: [group('s1', 'StepOld')],
          outcomeRouting: { critical: 's1' },
        },
      ],
    }),
  ];
  const out = migrate([tieredSystem()], recipes);
  const r = out.recipes[0];
  assert.equal(r.resultGroups[0].name, 'success');
  assert.equal('outcomeRouting' in r, false);
  assert.equal(r.steps[0].resultGroups[0].name, 'critical');
  assert.equal('outcomeRouting' in r.steps[0], false, 'step outcomeRouting removed');
});

// ---------------------------------------------------------------------------
// Idempotency, purity, absent keys
// ---------------------------------------------------------------------------

test('is idempotent — re-running over migrated data is a no-op', () => {
  const recipes = [
    recipe('sys-tiered', {
      resultGroups: [group('g1', 'A'), group('g2', 'B')],
      outcomeRouting: { success: 'g1', critical: 'g2' },
    }),
  ];
  const once = migrate([tieredSystem()], recipes);
  const twice = migrateLegacyResolutionModes(once);
  assert.deepEqual(twice.systems, once.systems);
  assert.deepEqual(twice.recipes, once.recipes);
});

test('does not mutate the input payload', () => {
  const input = {
    systems: [tieredSystem()],
    recipes: [
      recipe('sys-tiered', {
        resultGroups: [group('g1', 'A')],
        outcomeRouting: { success: 'g1' },
      }),
    ],
  };
  const snapshot = JSON.parse(JSON.stringify(input));
  migrateLegacyResolutionModes(input);
  assert.deepEqual(input, snapshot, 'input payload is cloned, not mutated');
});

test('passes through absent settings keys without throwing', () => {
  const out = migrateLegacyResolutionModes({});
  assert.equal(out.systems, undefined);
  assert.equal(out.recipes, undefined);
});
