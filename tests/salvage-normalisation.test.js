/**
 * Unit tests for salvage normalisation (T-043)
 * Covers system-level salvage settings, component-level salvage sub-object,
 * and all helper normalisation methods added to CraftingSystemManager.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal stubs so the module can load without a Foundry runtime
let idCounter = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `random-${++idCounter}`,
    getProperty: () => undefined
  }
};
globalThis.game = {};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  const recipeManagerStub = { getRecipes: () => [] };
  return new CraftingSystemManager(recipeManagerStub);
}

// ---------------------------------------------------------------------------
// Group 1: System-level salvage normalisation (4 tests)
// ---------------------------------------------------------------------------

test('features.salvage defaults to false when not provided', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.equal(system.features.salvage, false);
});

test('features.salvage is true when explicitly set to true', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true }
  });
  assert.equal(system.features.salvage, true);
});

test('salvageResolutionMode defaults to "simple" when not provided', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.equal(system.salvageResolutionMode, 'simple');
});

test('salvageResolutionMode accepts valid values and rejects invalid ones', () => {
  const manager = makeManager();

  const tiered = manager._normalizeSystem({ id: 's1', salvageResolutionMode: 'tiered' });
  assert.equal(tiered.salvageResolutionMode, 'tiered');

  const progressive = manager._normalizeSystem({ id: 's2', salvageResolutionMode: 'progressive' });
  assert.equal(progressive.salvageResolutionMode, 'progressive');

  // "mapped" is NOT allowed for salvage
  const mapped = manager._normalizeSystem({ id: 's3', salvageResolutionMode: 'mapped' });
  assert.equal(mapped.salvageResolutionMode, 'simple');

  const invalid = manager._normalizeSystem({ id: 's4', salvageResolutionMode: 'random-value' });
  assert.equal(invalid.salvageResolutionMode, 'simple');
});

// ---------------------------------------------------------------------------
// Group 2: salvageCraftingCheck normalisation (5 tests)
// ---------------------------------------------------------------------------

test('default salvageCraftingCheck has enabled: false, consumeComponentOnFail: true, consumeCatalystsOnFail: false', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  const check = system.salvageCraftingCheck;

  assert.equal(check.enabled, false);
  assert.equal(check.consumption.consumeComponentOnFail, true);
  assert.equal(check.consumption.consumeCatalystsOnFail, false);
});

test('salvageCraftingCheck preserves macro UUIDs when provided', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    salvageCraftingCheck: {
      macroUuid: 'Macro.abc123',
      successMacroUuid: 'Macro.success',
      failureMacroUuid: 'Macro.fail'
    }
  });
  const check = system.salvageCraftingCheck;

  assert.equal(check.macroUuid, 'Macro.abc123');
  assert.equal(check.successMacroUuid, 'Macro.success');
  assert.equal(check.failureMacroUuid, 'Macro.fail');
  // enabled=true because macroUuid is set
  assert.equal(check.enabled, true);
});

test('salvageCraftingCheck.consumption.consumeComponentOnFail can be set to false', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    salvageCraftingCheck: {
      consumption: { consumeComponentOnFail: false }
    }
  });
  assert.equal(system.salvageCraftingCheck.consumption.consumeComponentOnFail, false);
});

test('salvageCraftingCheck.progressive.awardMode defaults to "equal"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.equal(system.salvageCraftingCheck.progressive.awardMode, 'equal');
});

test('salvageCraftingCheck.outcomes defaults to ["fail", "pass"]', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.deepEqual(system.salvageCraftingCheck.outcomes, ['fail', 'pass']);
});

// ---------------------------------------------------------------------------
// Group 3: Component-level salvage normalisation (6 tests)
// ---------------------------------------------------------------------------

test('when features.salvage is false, normalised component does NOT have a salvage key', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: false },
    components: [{ id: 'comp-1', name: 'Iron Ore' }]
  });
  const component = system.components[0];
  assert.equal(Object.prototype.hasOwnProperty.call(component, 'salvage'), false);
});

test('when features.salvage is true and component has no salvage data, defaults are applied', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true },
    components: [{ id: 'comp-1', name: 'Iron Ore' }]
  });
  const component = system.components[0];
  assert.ok(Object.prototype.hasOwnProperty.call(component, 'salvage'), 'salvage key should be present');
  assert.equal(component.salvage.enabled, false);
  assert.equal(component.salvage.ingredientQuantity, 1);
  assert.deepEqual(component.salvage.catalysts, []);
  assert.deepEqual(component.salvage.resultGroups, []);
});

test('salvage data is normalised: enabled, ingredientQuantity, catalysts, resultGroups', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true },
    components: [{
      id: 'comp-1',
      name: 'Iron Ore',
      salvage: {
        enabled: true,
        ingredientQuantity: 3,
        catalysts: [{ componentId: 'cat-1', degradesOnUse: true, maxUses: 5 }],
        resultGroups: [{
          id: 'rg-1',
          name: 'Iron Scraps',
          results: [{ id: 'r-1', componentId: 'scrap-1', quantity: 2 }]
        }]
      }
    }]
  });
  const { salvage } = system.components[0];
  assert.equal(salvage.enabled, true);
  assert.equal(salvage.ingredientQuantity, 3);
  assert.equal(salvage.catalysts.length, 1);
  assert.equal(salvage.catalysts[0].componentId, 'cat-1');
  assert.equal(salvage.resultGroups.length, 1);
  assert.equal(salvage.resultGroups[0].id, 'rg-1');
});

test('invalid ingredientQuantity (0, negative, non-numeric) defaults to 1', () => {
  const manager = makeManager();

  for (const qty of [0, -5, 'abc', null]) {
    const system = manager._normalizeSystem({
      id: 'sys-1',
      features: { salvage: true },
      components: [{ id: 'c', name: 'Item', salvage: { ingredientQuantity: qty } }]
    });
    assert.equal(
      system.components[0].salvage.ingredientQuantity,
      1,
      `expected 1 for ingredientQuantity=${qty}`
    );
  }
});

test('salvage catalyst normalises componentId with systemItemId fallback', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true },
    components: [{
      id: 'comp-1',
      name: 'Item',
      salvage: {
        catalysts: [
          { componentId: 'primary-id', degradesOnUse: false },
          { systemItemId: 'legacy-id', degradesOnUse: true, maxUses: 3 }
        ]
      }
    }]
  });
  const { catalysts } = system.components[0].salvage;
  assert.equal(catalysts.length, 2);
  assert.equal(catalysts[0].componentId, 'primary-id');
  assert.equal(catalysts[1].componentId, 'legacy-id');
  assert.equal(catalysts[1].degradesOnUse, true);
  assert.equal(catalysts[1].maxUses, 3);
});

test('salvage resultGroups normalises id, name, and nested results with componentId', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true },
    components: [{
      id: 'comp-1',
      name: 'Item',
      salvage: {
        resultGroups: [{
          id: 'rg-1',
          name: 'Scrap Pile',
          results: [
            { id: 'r-1', componentId: 'scrap-a', quantity: 2 },
            { id: 'r-2', systemItemId: 'scrap-b', quantity: 1 }
          ]
        }]
      }
    }]
  });
  const [group] = system.components[0].salvage.resultGroups;
  assert.equal(group.id, 'rg-1');
  assert.equal(group.name, 'Scrap Pile');
  assert.equal(group.results.length, 2);
  assert.equal(group.results[0].componentId, 'scrap-a');
  assert.equal(group.results[0].quantity, 2);
  assert.equal(group.results[1].componentId, 'scrap-b');
});

// ---------------------------------------------------------------------------
// Group 4: Edge cases (4 tests)
// ---------------------------------------------------------------------------

test('empty salvage object on component produces defaults', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true },
    components: [{ id: 'c', name: 'Item', salvage: {} }]
  });
  const { salvage } = system.components[0];
  assert.equal(salvage.enabled, false);
  assert.equal(salvage.ingredientQuantity, 1);
  assert.deepEqual(salvage.catalysts, []);
  assert.deepEqual(salvage.resultGroups, []);
});

test('salvageResolutionMode "mapped" is rejected and falls back to "simple"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    salvageResolutionMode: 'mapped'
  });
  assert.equal(system.salvageResolutionMode, 'simple');
});

test('outcomeRouting is preserved in salvage sub-object when provided', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true },
    components: [{
      id: 'c',
      name: 'Item',
      salvage: {
        outcomeRouting: { high: 'rg-gold', low: 'rg-iron' }
      }
    }]
  });
  const { salvage } = system.components[0];
  assert.deepEqual(salvage.outcomeRouting, { high: 'rg-gold', low: 'rg-iron' });
});

test('full round-trip: system with salvage enabled, component with full salvage config', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'full-sys',
    name: 'Full Salvage System',
    features: { salvage: true },
    salvageResolutionMode: 'tiered',
    salvageCraftingCheck: {
      macroUuid: 'Macro.salvage-check',
      consumption: {
        consumeComponentOnFail: false,
        consumeCatalystsOnFail: true
      },
      outcomes: ['critical', 'pass', 'fail'],
      progressive: { awardMode: 'partial', allowPlayerReorder: true }
    },
    components: [{
      id: 'comp-full',
      name: 'Dragon Scale',
      salvage: {
        enabled: true,
        ingredientQuantity: 2,
        catalysts: [{ componentId: 'acid-vial', degradesOnUse: true, destroyWhenExhausted: true, maxUses: 1 }],
        resultGroups: [
          {
            id: 'rg-high',
            name: 'Critical Salvage',
            results: [{ id: 'r-1', componentId: 'pristine-scale', quantity: 3 }]
          },
          {
            id: 'rg-low',
            name: 'Partial Salvage',
            results: [{ id: 'r-2', componentId: 'cracked-scale', quantity: 1 }]
          }
        ],
        outcomeRouting: { critical: 'rg-high', pass: 'rg-low', fail: 'rg-low' },
        timeRequirement: { hours: 2 },
        currencyRequirement: { unit: 'gp', amount: 50 }
      }
    }]
  });

  // System-level checks
  assert.equal(system.features.salvage, true);
  assert.equal(system.salvageResolutionMode, 'tiered');
  assert.equal(system.salvageCraftingCheck.macroUuid, 'Macro.salvage-check');
  assert.equal(system.salvageCraftingCheck.consumption.consumeComponentOnFail, false);
  assert.equal(system.salvageCraftingCheck.consumption.consumeCatalystsOnFail, true);
  assert.deepEqual(system.salvageCraftingCheck.outcomes, ['critical', 'pass', 'fail']);
  assert.equal(system.salvageCraftingCheck.progressive.awardMode, 'partial');
  assert.equal(system.salvageCraftingCheck.progressive.allowPlayerReorder, true);

  // Component-level checks
  const comp = system.components[0];
  assert.ok(comp.salvage, 'salvage sub-object should be present');
  assert.equal(comp.salvage.enabled, true);
  assert.equal(comp.salvage.ingredientQuantity, 2);
  assert.equal(comp.salvage.catalysts.length, 1);
  assert.equal(comp.salvage.catalysts[0].componentId, 'acid-vial');
  assert.equal(comp.salvage.catalysts[0].destroyWhenExhausted, true);
  assert.equal(comp.salvage.resultGroups.length, 2);
  assert.deepEqual(comp.salvage.outcomeRouting, { critical: 'rg-high', pass: 'rg-low', fail: 'rg-low' });
  assert.deepEqual(comp.salvage.timeRequirement, { hours: 2 });
  assert.deepEqual(comp.salvage.currencyRequirement, { unit: 'gp', amount: 50 });
});
