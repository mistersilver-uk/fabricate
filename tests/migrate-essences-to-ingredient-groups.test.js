/**
 * Tests for the 1.17.0 migration (issue 649): supersede the per-set
 * `IngredientSet.essences` map with first-class single-option essence GROUPS, and
 * reconcile the alchemy signature collisions folding essences into signature-bearing
 * groups can introduce.
 *
 * Covers: idempotency; map→group round-trip; AND-semantics preserved; step-level set
 * migration; essence-only set; non-positive-entry drop; the payload read from
 * `data.recipes` (nothing under `data.systems`); and the post-migration collision
 * reconciliation (both colliding recipes disabled, gate cleared).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateEssencesToIngredientGroups } from '../src/migration/migrateEssencesToIngredientGroups.js';
import { evaluateSystemValidation } from '../src/systems/systemValidation.js';

function recipe(id, overrides = {}) {
  return { id, name: id, craftingSystemId: 'sys-1', enabled: true, ...overrides };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

test('rewrites each positive per-set essence into a single-option essence group and deletes the map', () => {
  const data = {
    recipes: [
      recipe('r1', {
        ingredientSets: [
          {
            id: 's-1',
            ingredientGroups: [
              { id: 'g-1', options: [{ quantity: 1, match: { type: 'component', componentId: 'c1' } }] },
            ],
            essences: { fire: 2, water: 1 },
          },
        ],
      }),
    ],
  };

  const { recipes } = migrateEssencesToIngredientGroups(data);
  const set = recipes[0].ingredientSets[0];
  assert.equal('essences' in set, false, 'the legacy map is deleted');
  // The component group is preserved; two essence groups are appended (AND-required).
  assert.equal(set.ingredientGroups.length, 3);
  const essenceGroups = set.ingredientGroups.filter((g) => g.options[0].match.type === 'essence');
  assert.equal(essenceGroups.length, 2);
  for (const group of essenceGroups) {
    assert.match(group.id, UUID_RE, 'ids are crypto.randomUUID()');
    assert.equal(group.options.length, 1);
    assert.equal(group.options[0].quantity, 1);
  }
  const byEssence = Object.fromEntries(
    essenceGroups.map((g) => [g.options[0].match.essenceId, g.options[0].match.amount])
  );
  assert.deepEqual(byEssence, { fire: 2, water: 1 }, 'amounts preserved (AND semantics)');
});

test('is idempotent — a set with no essence map is untouched on a re-run', () => {
  const data = {
    recipes: [
      recipe('r1', {
        ingredientSets: [{ id: 's-1', ingredientGroups: [], essences: { fire: 2 } }],
      }),
    ],
  };
  const once = migrateEssencesToIngredientGroups(data);
  const twice = migrateEssencesToIngredientGroups({ recipes: once.recipes });
  assert.deepEqual(twice.recipes, once.recipes, 'a second pass changes nothing');
});

test('migrates step-level ingredient sets too (no orphaned step essences)', () => {
  const data = {
    recipes: [
      recipe('r1', {
        steps: [
          { id: 'st-1', ingredientSets: [{ id: 's-1', ingredientGroups: [], essences: { earth: 3 } }] },
        ],
      }),
    ],
  };
  const { recipes } = migrateEssencesToIngredientGroups(data);
  const set = recipes[0].steps[0].ingredientSets[0];
  assert.equal('essences' in set, false);
  assert.equal(set.ingredientGroups.length, 1);
  assert.deepEqual(set.ingredientGroups[0].options[0].match, {
    type: 'essence',
    essenceId: 'earth',
    amount: 3,
  });
});

test('an essence-ONLY set becomes a set carrying one essence group (no groups before)', () => {
  const data = {
    recipes: [recipe('r1', { ingredientSets: [{ id: 's-1', essences: { fire: 4 } }] })],
  };
  const { recipes } = migrateEssencesToIngredientGroups(data);
  const set = recipes[0].ingredientSets[0];
  assert.equal(set.ingredientGroups.length, 1);
  assert.equal(set.ingredientGroups[0].options[0].match.amount, 4);
});

test('drops empty / non-positive essence entries (runtime no-ops)', () => {
  const data = {
    recipes: [
      recipe('r1', {
        ingredientSets: [{ id: 's-1', ingredientGroups: [], essences: { fire: 0, water: -2, air: 3 } }],
      }),
    ],
  };
  const { recipes } = migrateEssencesToIngredientGroups(data);
  const groups = recipes[0].ingredientSets[0].ingredientGroups;
  assert.equal(groups.length, 1, 'only the positive entry becomes a group');
  assert.equal(groups[0].options[0].match.essenceId, 'air');
});

test('reads and returns the recipes payload — data.systems carries no ingredient sets', () => {
  const systemsBefore = [{ id: 'sys-1', resolutionMode: 'alchemy', components: [] }];
  const data = {
    recipes: [recipe('r1', { ingredientSets: [{ id: 's-1', essences: { fire: 2 } }] })],
    systems: systemsBefore,
  };
  const result = migrateEssencesToIngredientGroups(data);
  assert.ok(Array.isArray(result.recipes), 'returns recipes');
  assert.equal(result.systems, undefined, 'does not return systems (read-only)');
  // The systems payload is untouched (read-only): no ingredient sets appear on it.
  assert.deepEqual(data.systems, systemsBefore);
});

// --- Post-migration alchemy-collision reconciliation (§3a) ------------------

test('disables BOTH colliding recipes after folding essences into signature-bearing groups', () => {
  // Worked case: A requires {C}; B requires {X} + fire essence, where C carries fire.
  // Post-migration B's transversal {X, C} now covers A → a NEW collision. One pass over
  // the all-enabled migrated set disables both participants so the system is unblocked.
  const components = [
    { id: 'C', name: 'Cinder', tags: [], essences: { fire: 1 } },
    { id: 'X', name: 'Xenon', tags: [], essences: {} },
  ];
  const system = { id: 'sys-1', resolutionMode: 'alchemy', components };
  const data = {
    recipes: [
      recipe('A', {
        ingredientSets: [
          { id: 'sA', ingredientGroups: [{ id: 'gA', options: [{ quantity: 1, match: { type: 'component', componentId: 'C' } }] }] },
        ],
      }),
      recipe('B', {
        ingredientSets: [
          {
            id: 'sB',
            ingredientGroups: [{ id: 'gB', options: [{ quantity: 1, match: { type: 'component', componentId: 'X' } }] }],
            essences: { fire: 1 },
          },
        ],
      }),
    ],
    systems: [system],
  };

  const { recipes, _essenceCollisionDisabledRecipes } = migrateEssencesToIngredientGroups(data);

  // (1) both recipes still present (not deleted).
  assert.deepEqual(recipes.map((r) => r.id).sort((a, b) => a.localeCompare(b)), ['A', 'B']);
  // (2) at least one collider disabled — the reconciliation disables BOTH.
  const byId = Object.fromEntries(recipes.map((r) => [r.id, r]));
  assert.equal(byId.A.enabled, false);
  assert.equal(byId.B.enabled, false);
  assert.ok(_essenceCollisionDisabledRecipes.includes('A'));
  assert.ok(_essenceCollisionDisabledRecipes.includes('B'));

  // (3) the system is NOT blocked after migration (enabled residual is collision-free).
  const report = evaluateSystemValidation(system, { recipes, components });
  assert.equal(report.blocksSystem, false, 'no blocks:system after the reconciliation');

  // Guard: the disabled recipe STILL textually collides — re-enabling both re-introduces
  // the block, proving it is the enabled-scoping that clears the gate, not a data rewrite.
  const reEnabled = recipes.map((r) => ({ ...r, enabled: true }));
  const blockedReport = evaluateSystemValidation(system, { recipes: reEnabled, components });
  assert.equal(blockedReport.blocksSystem, true, 're-enabling both restores the collision block');
});
