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
// Public write methods (`createItem`/`updateItem`/`replaceItemSource`) assert GM.
globalThis.game = { user: { isGM: true } };
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeManager() {
  const recipeManagerStub = { getRecipes: () => [] };
  return new CraftingSystemManager(recipeManagerStub);
}

// A manager holding real, normalized systems with `save()` stubbed, so the REAL public
// writer paths (createItem/updateItem/replaceItemSource) can be exercised — the house
// pattern (see component-category-normalization.test.js).
function makeLoadedManager(systems = []) {
  const manager = makeManager();
  for (const system of systems) {
    manager.systems.set(system.id, manager._normalizeSystem(system));
  }
  manager.initialized = true;
  manager.save = async () => {};
  return manager;
}

// ---------------------------------------------------------------------------
// Group 1: System-level salvage normalisation (4 tests)
// ---------------------------------------------------------------------------

test('features.salvage defaults to true (salvage is an opt-out feature)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.equal(system.features.salvage, true);
});

test('features.salvage honors an explicit false (salvage is optional)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: false }
  });
  assert.equal(system.features.salvage, false);
});

test('salvageResolutionMode defaults to "simple" when not provided', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  assert.equal(system.salvageResolutionMode, 'simple');
});

test('salvageResolutionMode accepts canonical values, maps legacy tiered to routed, and rejects invalid ones', () => {
  const manager = makeManager();

  const routed = manager._normalizeSystem({ id: 's1', salvageResolutionMode: 'routed' });
  assert.equal(routed.salvageResolutionMode, 'routed');

  const legacyTiered = manager._normalizeSystem({ id: 's1b', salvageResolutionMode: 'tiered' });
  assert.equal(legacyTiered.salvageResolutionMode, 'routed');

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

test('default salvageCraftingCheck has enabled: false, consumeComponentOnFail: true, breakToolsOnFail: false', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({ id: 'sys-1' });
  const check = system.salvageCraftingCheck;

  assert.equal(check.enabled, false);
  assert.equal(check.consumption.consumeComponentOnFail, true);
  assert.equal(check.consumption.breakToolsOnFail, false);
});

test('salvageCraftingCheck drops the deprecated check-source fields', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    salvageCraftingCheck: {
      enabled: false,
      macroUuid: 'Macro.abc123',
      successMacroUuid: 'Macro.success',
      failureMacroUuid: 'Macro.fail'
    }
  });
  const check = system.salvageCraftingCheck;

  assert.equal(check.macroUuid, undefined, 'root macroUuid is removed');
  assert.equal(check.successMacroUuid, undefined);
  assert.equal(check.failureMacroUuid, undefined);
  // `enabled` is now purely the on/off toggle — a legacy macro config no longer flips it on.
  assert.equal(check.enabled, false);
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

test('component salvage config is preserved even when features.salvage is off (non-destructive toggle)', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    // Salvage off: the feature is disabled, but the component still carries its
    // (inert) salvage config so re-enabling restores it.
    features: { salvage: false },
    components: [{ id: 'comp-1', name: 'Iron Ore' }]
  });
  const component = system.components[0];
  assert.equal(system.features.salvage, false);
  assert.equal(Object.prototype.hasOwnProperty.call(component, 'salvage'), true);
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
  assert.deepEqual(component.salvage.toolIds, []);
  assert.deepEqual(component.salvage.resultGroups, []);
});

test('salvage data is normalised: enabled, ingredientQuantity, toolIds, resultGroups', () => {
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
        toolIds: ['tool-1'],
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
  assert.deepEqual(salvage.toolIds, ['tool-1']);
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

test('salvage toolIds are normalised to trimmed, non-empty, deduped strings', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    features: { salvage: true },
    components: [{
      id: 'comp-1',
      name: 'Item',
      salvage: {
        toolIds: ['tool-a', '  tool-b  ', '', 'tool-a', null]
      }
    }]
  });
  const { toolIds } = system.components[0].salvage;
  assert.deepEqual(toolIds, ['tool-a', 'tool-b']);
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
  assert.deepEqual(salvage.toolIds, []);
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

test('salvageResolutionMode "alchemy" is rejected and falls back to "simple"', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'sys-1',
    salvageResolutionMode: 'alchemy'
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
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: {
      consumption: {
        consumeComponentOnFail: false,
        breakToolsOnFail: true
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
        toolIds: ['tool-acid-vial'],
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
  assert.equal(system.salvageResolutionMode, 'routed');
  assert.equal(system.salvageCraftingCheck.macroUuid, undefined, 'deprecated macroUuid is dropped');
  assert.equal(system.salvageCraftingCheck.consumption.consumeComponentOnFail, false);
  assert.equal(system.salvageCraftingCheck.consumption.breakToolsOnFail, true);
  assert.deepEqual(system.salvageCraftingCheck.outcomes, ['critical', 'pass', 'fail']);
  assert.equal(system.salvageCraftingCheck.progressive.awardMode, 'partial');
  // Issue 651: the salvage progressive block shares the crafting progressive allowlist,
  // so the retired system-level reorder flag is dropped here too.
  assert.equal(
    system.salvageCraftingCheck.progressive.allowPlayerReorder,
    undefined,
    'the retired system-level allowPlayerReorder is dropped'
  );

  // Component-level checks
  const comp = system.components[0];
  assert.ok(comp.salvage, 'salvage sub-object should be present');
  assert.equal(comp.salvage.enabled, true);
  assert.equal(comp.salvage.ingredientQuantity, 2);
  assert.deepEqual(comp.salvage.toolIds, ['tool-acid-vial']);
  assert.equal(comp.salvage.resultGroups.length, 2);
  assert.deepEqual(comp.salvage.outcomeRouting, { critical: 'rg-high', pass: 'rg-low', fail: 'rg-low' });
  assert.deepEqual(comp.salvage.timeRequirement, { hours: 2 });
  assert.deepEqual(comp.salvage.currencyRequirement, { unit: 'gp', amount: 50 });
});

// ---------------------------------------------------------------------------
// breakToolsOnFail: legacy consumeCatalystsOnFail read-fallback (1.7.0 rename)
// ---------------------------------------------------------------------------

test('normalization reads legacy consumeCatalystsOnFail as breakToolsOnFail on salvage consumption', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'legacy-salvage',
    name: 'Legacy',
    features: { salvage: true },
    salvageCraftingCheck: {
      enabled: true,
      consumption: { consumeComponentOnFail: true, consumeCatalystsOnFail: true },
    },
  });
  assert.equal(system.salvageCraftingCheck.consumption.breakToolsOnFail, true);
  assert.equal(
    'consumeCatalystsOnFail' in system.salvageCraftingCheck.consumption,
    false,
    'legacy key is not re-emitted'
  );
});

test('normalization reads legacy consumeCatalystsOnFail as breakToolsOnFail on crafting consumption', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'legacy-craft',
    name: 'Legacy',
    craftingCheck: {
      enabled: true,
      consumption: { consumeIngredientsOnFail: true, consumeCatalystsOnFail: true },
    },
  });
  assert.equal(system.craftingCheck.consumption.breakToolsOnFail, true);
  assert.equal('consumeCatalystsOnFail' in system.craftingCheck.consumption, false);
});

test('normalization prefers the new breakToolsOnFail key when both are present', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem({
    id: 'both-keys',
    name: 'Both',
    craftingCheck: {
      enabled: true,
      consumption: { breakToolsOnFail: true, consumeCatalystsOnFail: false },
    },
  });
  assert.equal(system.craftingCheck.consumption.breakToolsOnFail, true);
});

// ---------------------------------------------------------------------------
// Issue 764: the Simple-mode SUCCESS-FIRST retain-one clamp.
// ---------------------------------------------------------------------------

const successGroup = (id, componentId = 'scrap') => ({
  id,
  name: id,
  results: [{ id: `r-${id}`, componentId, quantity: 1 }],
});
const failureGroup = (id) => ({ ...successGroup(id), role: 'failure' });

function simpleContext(hasFormula = false) {
  return { salvageResolutionMode: 'simple', salvageSimpleCheckHasFormula: hasFormula };
}

test('_normalizeSalvage (simple): N>1 success groups clamp to one, preserved at index 0', () => {
  const manager = makeManager();
  const salvage = manager._normalizeSalvage(
    {
      enabled: true,
      resultGroups: [successGroup('grp-a'), successGroup('grp-b'), successGroup('grp-c')],
    },
    simpleContext()
  );
  assert.equal(salvage.enabled, true);
  assert.equal(salvage.resultGroups.length, 1);
  assert.equal(salvage.resultGroups[0].id, 'grp-a', 'the FIRST success group is retained');
  assert.equal(salvage.resultGroups[0].results.length, 1, 'its results are preserved');
});

test('_normalizeSalvage (simple): a reserved failure group is retained ONLY with a Simple formula', () => {
  const manager = makeManager();
  const input = { enabled: true, resultGroups: [successGroup('grp-ok'), failureGroup('grp-bad')] };

  const withFormula = manager._normalizeSalvage(input, simpleContext(true));
  assert.deepEqual(
    withFormula.resultGroups.map((g) => g.id),
    ['grp-ok', 'grp-bad'],
    'the reserved failure group survives when the Simple slot has a formula'
  );
  assert.equal(withFormula.resultGroups[1].role, 'failure', 'and keeps its role');
  assert.equal(withFormula.enabled, true);

  const noFormula = manager._normalizeSalvage(input, simpleContext(false));
  assert.deepEqual(
    noFormula.resultGroups.map((g) => g.id),
    ['grp-ok'],
    'the reserved failure group is dropped with no Simple formula'
  );
  assert.equal(noFormula.enabled, true);
});

test('_normalizeSalvage (simple): a failure-FIRST input re-orders so the success group is index 0', () => {
  const manager = makeManager();
  const salvage = manager._normalizeSalvage(
    { enabled: true, resultGroups: [failureGroup('grp-fail'), successGroup('grp-win')] },
    simpleContext(true)
  );
  assert.equal(salvage.resultGroups[0].id, 'grp-win', 'success-first: the engine awards slice(0,1)');
  assert.equal(salvage.resultGroups[0].role, undefined, 'index 0 is not a failure group');
  assert.equal(salvage.resultGroups[1].id, 'grp-fail');
});

test('_normalizeSalvage (simple): a failure-ONLY config clamps to enabled:false either way', () => {
  const manager = makeManager();
  for (const hasFormula of [true, false]) {
    const salvage = manager._normalizeSalvage(
      { enabled: true, resultGroups: [failureGroup('grp-fail')] },
      simpleContext(hasFormula)
    );
    assert.equal(
      salvage.enabled,
      false,
      `a failure-only Simple config cannot be enabled (formula=${hasFormula})`
    );
  }
});

test('_normalizeSalvage (routed/progressive): group counts are UNTOUCHED by the clamp', () => {
  const manager = makeManager();
  for (const mode of ['routed', 'progressive']) {
    const salvage = manager._normalizeSalvage(
      { enabled: true, resultGroups: [successGroup('grp-a'), successGroup('grp-b')] },
      { salvageResolutionMode: mode, salvageSimpleCheckHasFormula: false }
    );
    assert.equal(salvage.resultGroups.length, 2, `${mode} keeps every group`);
    assert.equal(salvage.enabled, true);
  }
});

test('_normalizeSalvage (no context): groups are left unchanged (no-clamp default)', () => {
  const manager = makeManager();
  const salvage = manager._normalizeSalvage({
    enabled: true,
    resultGroups: [successGroup('grp-a'), successGroup('grp-b')],
  });
  assert.equal(salvage.resultGroups.length, 2, 'a bare call (no system context) never clamps');
  assert.equal(salvage.enabled, true);
});

// --- Per-writer-path input→output (finding 10): each threaded writer clamps. -------

const SIMPLE_SYSTEM = (components) => ({
  id: 'sys-simple',
  name: 'Simple Salvage',
  features: { salvage: true },
  salvageResolutionMode: 'simple',
  components,
});

test('writer path — system map (_normalizeSystem / steady-state save) clamps Simple groups', () => {
  const manager = makeManager();
  const system = manager._normalizeSystem(
    SIMPLE_SYSTEM([
      {
        id: 'comp-1',
        name: 'Dragon Scale',
        salvage: { enabled: true, resultGroups: [successGroup('grp-a'), successGroup('grp-b')] },
      },
    ])
  );
  const { salvage } = system.components[0];
  assert.equal(salvage.resultGroups.length, 1);
  assert.equal(salvage.resultGroups[0].id, 'grp-a');
  assert.equal(salvage.enabled, true);
});

test('writer path — createItem clamps Simple groups', async () => {
  const manager = makeLoadedManager([SIMPLE_SYSTEM([])]);
  const item = await manager.createItem('sys-simple', {
    id: 'comp-new',
    name: 'New Scale',
    salvage: { enabled: true, resultGroups: [successGroup('grp-a'), successGroup('grp-b')] },
  });
  assert.equal(item.salvage.resultGroups.length, 1, 'createItem threads the Simple context');
  assert.equal(item.salvage.resultGroups[0].id, 'grp-a');
  assert.equal(item.salvage.enabled, true);
});

test('writer path — updateItem clamps Simple groups', async () => {
  const manager = makeLoadedManager([
    SIMPLE_SYSTEM([{ id: 'comp-1', name: 'Scale', salvage: { enabled: true, resultGroups: [successGroup('grp-a')] } }]),
  ]);
  const updated = await manager.updateItem('sys-simple', 'comp-1', {
    salvage: { enabled: true, resultGroups: [successGroup('grp-a'), successGroup('grp-b')] },
  });
  assert.equal(updated.salvage.resultGroups.length, 1, 'updateItem threads the Simple context');
  assert.equal(updated.salvage.resultGroups[0].id, 'grp-a');
});

test('writer path — replaceItemSource clamps the existing Simple groups', async () => {
  const manager = makeLoadedManager([
    SIMPLE_SYSTEM([
      {
        id: 'comp-1',
        name: 'Scale',
        salvage: { enabled: true, resultGroups: [successGroup('grp-a'), successGroup('grp-b')] },
      },
    ]),
  ]);
  // Stub the source-resolution collaborators so `replaceItemSource` reaches its
  // `_normalizeComponent` call with the existing (multi-group) salvage carried through.
  globalThis.fromUuid = async () => ({ documentName: 'Item', name: 'Scale', img: 'icons/svg/item-bag.svg' });
  manager._buildComponentSourceSnapshot = async () => ({
    name: 'Scale',
    img: 'icons/svg/item-bag.svg',
    description: '',
    registeredItemUuid: 'Item.new',
    originItemUuid: 'Item.new',
    aliasItemUuids: [],
    sourceFallbacks: [],
    references: ['Item.new'],
  });
  const { item } = await manager.replaceItemSource('sys-simple', 'comp-1', 'Item.new');
  assert.equal(item.salvage.resultGroups.length, 1, 'replaceItemSource threads the Simple context');
  assert.equal(item.salvage.resultGroups[0].id, 'grp-a');
  delete globalThis.fromUuid;
});
