/**
 * Tests for the 0.6.0 Catalyst → Tool migration (src/migration/migrateCatalystsToTools.js)
 * and its registration in MigrationRunner.
 *
 * node:test + node:assert/strict. Pure functions; no Foundry globals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateCatalystsToTools } from '../src/migration/migrateCatalystsToTools.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function system(id, extra = {}) {
  return { id, name: id, ...extra };
}

function recipe(id, systemId, extra = {}) {
  return { id, craftingSystemId: systemId, ...extra };
}

// ---------------------------------------------------------------------------
// Mapping matrix
// ---------------------------------------------------------------------------

test('degradesOnUse:false maps to presence-only breakageChance:0 + flagBroken (no item flag)', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [{ componentId: 'forge', degradesOnUse: false }]
  })];

  const out = migrateCatalystsToTools(recipes, systems);

  const tools = out.systems[0].tools;
  assert.equal(tools.length, 1);
  assert.equal(tools[0].componentId, 'forge');
  assert.deepEqual(tools[0].breakage, { mode: 'breakageChance', breakageChance: 0 });
  assert.deepEqual(tools[0].onBreak, { mode: 'flagBroken' });
  assert.equal(tools[0].requirement, null);
  // The recipe references the new tool and no longer carries catalysts.
  assert.deepEqual(out.recipes[0].toolIds, [tools[0].id]);
  assert.equal('catalysts' in out.recipes[0], false);
});

test('degradesOnUse:true + destroyWhenExhausted:true maps to limitedUses + destroy', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [{ componentId: 'whetstone', degradesOnUse: true, maxUses: 3, destroyWhenExhausted: true }]
  })];

  const out = migrateCatalystsToTools(recipes, systems);
  const tool = out.systems[0].tools[0];
  assert.deepEqual(tool.breakage, { mode: 'limitedUses', maxUses: 3 });
  assert.deepEqual(tool.onBreak, { mode: 'destroy' });
});

test('degradesOnUse:true + destroyWhenExhausted:false maps to limitedUses + flagBroken', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [{ componentId: 'whetstone', degradesOnUse: true, maxUses: 5, destroyWhenExhausted: false }]
  })];

  const out = migrateCatalystsToTools(recipes, systems);
  const tool = out.systems[0].tools[0];
  assert.deepEqual(tool.breakage, { mode: 'limitedUses', maxUses: 5 });
  assert.deepEqual(tool.onBreak, { mode: 'flagBroken' });
});

test('degradesOnUse:true with null maxUses maps to limitedUses maxUses:null', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [{ componentId: 'anvil', degradesOnUse: true, maxUses: null, destroyWhenExhausted: false }]
  })];

  const out = migrateCatalystsToTools(recipes, systems);
  const tool = out.systems[0].tools[0];
  assert.deepEqual(tool.breakage, { mode: 'limitedUses', maxUses: null });
});

// ---------------------------------------------------------------------------
// Dedupe — collapse
// ---------------------------------------------------------------------------

test('identical catalysts across recipes collapse to one shared library tool', () => {
  const systems = [system('sys-1')];
  const recipes = [
    recipe('r1', 'sys-1', { catalysts: [{ componentId: 'forge', degradesOnUse: false }] }),
    recipe('r2', 'sys-1', { catalysts: [{ componentId: 'forge', degradesOnUse: false }] })
  ];

  const out = migrateCatalystsToTools(recipes, systems);

  assert.equal(out.systems[0].tools.length, 1, 'only one shared tool created');
  const id = out.systems[0].tools[0].id;
  assert.deepEqual(out.recipes[0].toolIds, [id]);
  assert.deepEqual(out.recipes[1].toolIds, [id]);
});

test('duplicate identical catalysts within a single array collapse to one toolId', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [
      { componentId: 'forge', degradesOnUse: false },
      { componentId: 'forge', degradesOnUse: false }
    ]
  })];

  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal(out.systems[0].tools.length, 1);
  assert.equal(out.recipes[0].toolIds.length, 1);
});

// ---------------------------------------------------------------------------
// Dedupe — negative
// ---------------------------------------------------------------------------

test('semantically different catalysts on the same componentId are NOT merged', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [
      { componentId: 'forge', degradesOnUse: false },
      { componentId: 'forge', degradesOnUse: true, maxUses: 2, destroyWhenExhausted: true },
      { componentId: 'forge', degradesOnUse: true, maxUses: 2, destroyWhenExhausted: false }
    ]
  })];

  const out = migrateCatalystsToTools(recipes, systems);

  assert.equal(out.systems[0].tools.length, 3, 'three distinct tools (different breakage/onBreak)');
  assert.equal(out.recipes[0].toolIds.length, 3);
  // All same componentId, but distinct breakage/onBreak.
  const modes = out.systems[0].tools.map(t => `${t.breakage.mode}:${t.onBreak.mode}`).sort();
  assert.deepEqual(modes, ['breakageChance:flagBroken', 'limitedUses:destroy', 'limitedUses:flagBroken']);
});

test('different maxUses on the same componentId produce distinct tools', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [
      { componentId: 'forge', degradesOnUse: true, maxUses: 2, destroyWhenExhausted: true },
      { componentId: 'forge', degradesOnUse: true, maxUses: 3, destroyWhenExhausted: true }
    ]
  })];

  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal(out.systems[0].tools.length, 2);
});

// ---------------------------------------------------------------------------
// All granularities: recipe / step / ingredientSet / salvage
// ---------------------------------------------------------------------------

test('recipe, step, step-set, and recipe-set catalysts all migrate to toolIds', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [{ componentId: 'recipe-cat', degradesOnUse: false }],
    steps: [{
      id: 'step-1',
      catalysts: [{ componentId: 'step-cat', degradesOnUse: false }],
      ingredientSets: [{ id: 'set-a', catalysts: [{ componentId: 'step-set-cat', degradesOnUse: false }] }]
    }],
    ingredientSets: [{ id: 'set-b', catalysts: [{ componentId: 'recipe-set-cat', degradesOnUse: false }] }]
  })];

  const out = migrateCatalystsToTools(recipes, systems);
  const r = out.recipes[0];

  assert.equal('catalysts' in r, false);
  assert.equal(r.toolIds.length, 1);
  assert.equal('catalysts' in r.steps[0], false);
  assert.equal(r.steps[0].toolIds.length, 1);
  assert.equal('catalysts' in r.steps[0].ingredientSets[0], false);
  assert.equal(r.steps[0].ingredientSets[0].toolIds.length, 1);
  assert.equal('catalysts' in r.ingredientSets[0], false);
  assert.equal(r.ingredientSets[0].toolIds.length, 1);

  // Four distinct componentIds → four library tools.
  assert.equal(out.systems[0].tools.length, 4);
  const componentIds = out.systems[0].tools.map(t => t.componentId).sort();
  assert.deepEqual(componentIds, ['recipe-cat', 'recipe-set-cat', 'step-cat', 'step-set-cat']);
});

test('component salvage catalysts migrate into the owning system tools + salvage.toolIds', () => {
  const systems = [system('sys-1', {
    components: [
      {
        id: 'comp-1',
        salvage: {
          enabled: true,
          catalysts: [{ componentId: 'salvage-cat', degradesOnUse: true, maxUses: 4, destroyWhenExhausted: true }]
        }
      }
    ]
  })];

  const out = migrateCatalystsToTools([], systems);
  const salvage = out.systems[0].components[0].salvage;

  assert.equal('catalysts' in salvage, false);
  assert.equal(salvage.toolIds.length, 1);
  const tool = out.systems[0].tools.find(t => t.id === salvage.toolIds[0]);
  assert.equal(tool.componentId, 'salvage-cat');
  assert.deepEqual(tool.breakage, { mode: 'limitedUses', maxUses: 4 });
  assert.deepEqual(tool.onBreak, { mode: 'destroy' });
});

test('a salvage catalyst and an identical recipe catalyst in the same system collapse to one tool', () => {
  const systems = [system('sys-1', {
    components: [{
      id: 'comp-1',
      salvage: { enabled: true, catalysts: [{ componentId: 'shared', degradesOnUse: false }] }
    }]
  })];
  const recipes = [recipe('r1', 'sys-1', { catalysts: [{ componentId: 'shared', degradesOnUse: false }] })];

  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal(out.systems[0].tools.length, 1);
  const id = out.systems[0].tools[0].id;
  assert.deepEqual(out.recipes[0].toolIds, [id]);
  assert.deepEqual(out.systems[0].components[0].salvage.toolIds, [id]);
});

// ---------------------------------------------------------------------------
// Missing system / robustness
// ---------------------------------------------------------------------------

test('recipe with a missing crafting system is skipped untouched (not thrown)', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('orphan', 'sys-missing', {
    catalysts: [{ componentId: 'forge', degradesOnUse: false }]
  })];

  const out = migrateCatalystsToTools(recipes, systems);

  // Catalysts untouched, no toolIds added, no tools created anywhere.
  assert.deepEqual(out.recipes[0].catalysts, [{ componentId: 'forge', degradesOnUse: false }]);
  assert.equal('toolIds' in out.recipes[0], false);
  assert.equal((out.systems[0].tools || []).length, 0);
});

test('null/non-object recipes and systems do not throw', () => {
  const out = migrateCatalystsToTools([null, 42], [null, { id: 'sys-1' }]);
  assert.ok(Array.isArray(out.recipes));
  assert.ok(Array.isArray(out.systems));
});

test('catalysts without componentId are ignored (no tool, no toolId)', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', { catalysts: [{ degradesOnUse: false }] })];
  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal((out.systems[0].tools || []).length, 0);
  assert.deepEqual(out.recipes[0].toolIds, []);
});

test('catalyst systemItemId alias is honored as componentId', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', { catalysts: [{ systemItemId: 'legacy', degradesOnUse: false }] })];
  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal(out.systems[0].tools[0].componentId, 'legacy');
});

// ---------------------------------------------------------------------------
// Existing library tool reuse
// ---------------------------------------------------------------------------

test('an existing equivalent library tool is reused rather than duplicated', () => {
  const systems = [system('sys-1', {
    tools: [{
      id: 'existing-tool',
      componentId: 'forge',
      requirement: null,
      breakage: { mode: 'breakageChance', breakageChance: 0 },
      onBreak: { mode: 'flagBroken' }
    }]
  })];
  const recipes = [recipe('r1', 'sys-1', { catalysts: [{ componentId: 'forge', degradesOnUse: false }] })];

  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal(out.systems[0].tools.length, 1, 'no duplicate created');
  assert.deepEqual(out.recipes[0].toolIds, ['existing-tool']);
});

test('an existing tool WITH a requirement gate is not reused (catalysts had no requirement)', () => {
  const systems = [system('sys-1', {
    tools: [{
      id: 'gated-tool',
      componentId: 'forge',
      requirement: { provider: 'dnd5e', formula: '1', macroUuid: '' },
      breakage: { mode: 'breakageChance', breakageChance: 0 },
      onBreak: { mode: 'flagBroken' }
    }]
  })];
  const recipes = [recipe('r1', 'sys-1', { catalysts: [{ componentId: 'forge', degradesOnUse: false }] })];

  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal(out.systems[0].tools.length, 2, 'a new tool is added, gated tool untouched');
  assert.notEqual(out.recipes[0].toolIds[0], 'gated-tool');
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('running twice produces identical output', () => {
  const systems = [system('sys-1')];
  const recipes = [
    recipe('r1', 'sys-1', { catalysts: [{ componentId: 'forge', degradesOnUse: false }] }),
    recipe('r2', 'sys-1', {
      catalysts: [{ componentId: 'whetstone', degradesOnUse: true, maxUses: 3, destroyWhenExhausted: true }]
    })
  ];

  const first = migrateCatalystsToTools(
    JSON.parse(JSON.stringify(recipes)),
    JSON.parse(JSON.stringify(systems))
  );
  const firstJson = JSON.stringify({ recipes: first.recipes, systems: first.systems });

  // Feed the migrated output back through (catalyst arrays already gone).
  const second = migrateCatalystsToTools(
    JSON.parse(JSON.stringify(first.recipes)),
    JSON.parse(JSON.stringify(first.systems))
  );
  const secondJson = JSON.stringify({ recipes: second.recipes, systems: second.systems });

  assert.equal(firstJson, secondJson);
  assert.equal(second.migratedCount, 0, 're-run migrates nothing');
});

test('generated tool ids are stable across runs', () => {
  const mk = () => migrateCatalystsToTools(
    [recipe('r1', 'sys-1', { catalysts: [{ componentId: 'forge', degradesOnUse: false }] })],
    [system('sys-1')]
  );
  assert.equal(mk().systems[0].tools[0].id, mk().systems[0].tools[0].id);
});

test('migratedCount reflects the number of catalysts converted', () => {
  const systems = [system('sys-1')];
  const recipes = [recipe('r1', 'sys-1', {
    catalysts: [
      { componentId: 'a', degradesOnUse: false },
      { componentId: 'b', degradesOnUse: false }
    ]
  })];
  const out = migrateCatalystsToTools(recipes, systems);
  assert.equal(out.migratedCount, 2);
});

// ---------------------------------------------------------------------------
// MigrationRunner integration + version gate
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(Object.entries({
    recipes: [],
    craftingSystems: [],
    gatheringConfig: {},
    migrationVersion: '0.0.0',
    ...initial
  }));
  const calls = { set: [] };
  const getSetting = (key) => store.get(key) ?? null;
  const setSetting = async (key, value) => { calls.set.push({ key, value }); store.set(key, value); return value; };
  return { store, calls, getSetting, setSetting };
}

test('0.6.0 runs from 0.5.0: catalysts become tools + toolIds and version advances', async () => {
  const settings = makeSettings({
    migrationVersion: '0.5.0',
    recipes: [{ id: 'r1', craftingSystemId: 'sys-1', catalysts: [{ componentId: 'forge', degradesOnUse: false }] }],
    craftingSystems: [{ id: 'sys-1' }]
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  const summary = await runner.run();

  const recipes = settings.store.get('recipes');
  const systems = settings.store.get('craftingSystems');
  assert.equal('catalysts' in recipes[0], false);
  assert.equal(recipes[0].toolIds.length, 1);
  assert.equal(systems[0].tools.length, 1);
  // The full runner also applies the later 0.7.0, 0.8.0, and 0.9.0 migrations, so the
  // persisted version advances to the highest migration version.
  assert.equal(settings.store.get('migrationVersion'), '0.9.0');
  assert.equal(summary.migratedCatalystCount, 1);

  // The transient count field is never persisted onto any setting payload.
  for (const { value } of settings.calls.set) {
    if (value && typeof value === 'object') {
      assert.equal('_migratedCatalystCount' in value, false);
    }
  }
});

test('version gate: 0.6.0 is NOT re-applied when migrationVersion is already 0.6.0', async () => {
  const settings = makeSettings({
    migrationVersion: '0.6.0',
    recipes: [{ id: 'r1', craftingSystemId: 'sys-1', catalysts: [{ componentId: 'forge', degradesOnUse: false }] }],
    craftingSystems: [{ id: 'sys-1' }]
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  const summary = await runner.run();

  // The 0.6.0 catalyst migration itself is gated out (catalysts untouched). The
  // later 0.7.0 tool-reconciliation migration is still pending and runs, but with
  // no gathering-config tools to move it is a data no-op — only the version bumps.
  const recipes = settings.store.get('recipes');
  assert.ok('catalysts' in recipes[0], 'catalysts untouched when 0.6.0 gate blocks the run');
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('recipes'), 'recipes not persisted (0.6.0 gated, 0.7.0 untouched)');
  assert.ok(!setKeys.includes('craftingSystems'), 'craftingSystems not persisted');
  assert.ok(!setKeys.includes('gatheringConfig'), 'gatheringConfig not persisted');
  assert.equal(settings.store.get('migrationVersion'), '0.9.0');
  assert.equal(summary.migratedCatalystCount, 0);
});

test('0.6.0 does not touch gatheringConfig', async () => {
  const settings = makeSettings({
    migrationVersion: '0.5.0',
    recipes: [{ id: 'r1', craftingSystemId: 'sys-1', catalysts: [{ componentId: 'forge', degradesOnUse: false }] }],
    craftingSystems: [{ id: 'sys-1' }],
    gatheringConfig: { systems: { 'sys-1': { tasks: [{ id: 't', catalysts: [{ componentId: 'x' }] }] } } }
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('gatheringConfig'), 'gatheringConfig is never persisted by 0.6.0');
  // dead task.catalysts left exactly as-is
  assert.deepEqual(
    settings.store.get('gatheringConfig').systems['sys-1'].tasks[0].catalysts,
    [{ componentId: 'x' }]
  );
});
