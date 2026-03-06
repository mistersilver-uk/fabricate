/**
 * Unit tests for ResolutionModeService.validateSalvage (T-044)
 * Tests salvage-specific validation for simple, tiered, and progressive modes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function buildSystem(overrides = {}) {
  return {
    id: 'test-system',
    salvageResolutionMode: 'simple',
    salvageCraftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: ['fail', 'pass'],
      progressive: null,
    },
    components: [],
    ...overrides,
  };
}

function buildComponent(overrides = {}) {
  return {
    id: 'comp-1',
    name: 'Iron Ore',
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      catalysts: [],
      resultGroups: [{ id: 'rg-1', name: 'Scraps', results: [] }],
    },
    ...overrides,
  };
}

function buildService() {
  // validateSalvage does not use craftingSystemManager — pass null
  return new ResolutionModeService(null);
}

// ---------------------------------------------------------------------------
// Group 1: Pre-checks (3 tests)
// ---------------------------------------------------------------------------

test('pre-check — component has no salvage data → valid (no errors)', () => {
  const service = buildService();
  const component = { id: 'comp-1', name: 'Iron Ore' }; // no salvage key
  const system = buildSystem();

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('pre-check — system is null → valid (no errors)', () => {
  const service = buildService();
  const component = buildComponent();

  const result = service.validateSalvage(component, null);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('pre-check — mapped salvageResolutionMode → invalid with clear error', () => {
  const service = buildService();
  const component = buildComponent();
  const system = buildSystem({ salvageResolutionMode: 'mapped' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /mapped/i.test(e)),
    `expected error mentioning "mapped", got: ${JSON.stringify(result.errors)}`
  );
});

// ---------------------------------------------------------------------------
// Group 2: Simple mode (3 tests)
// ---------------------------------------------------------------------------

test('simple mode — exactly 1 result group → valid', () => {
  const service = buildService();
  const component = buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      catalysts: [],
      resultGroups: [{ id: 'rg-1', results: [] }],
    },
  });
  const system = buildSystem({ salvageResolutionMode: 'simple' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('simple mode — 0 result groups → invalid', () => {
  const service = buildService();
  const component = buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      catalysts: [],
      resultGroups: [],
    },
  });
  const system = buildSystem({ salvageResolutionMode: 'simple' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /result group/i.test(e) && /simple/i.test(e)),
    `expected error about result groups in simple mode, got: ${JSON.stringify(result.errors)}`
  );
});

test('simple mode — 2 result groups → invalid', () => {
  const service = buildService();
  const component = buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      catalysts: [],
      resultGroups: [
        { id: 'rg-1', results: [] },
        { id: 'rg-2', results: [] },
      ],
    },
  });
  const system = buildSystem({ salvageResolutionMode: 'simple' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /result group/i.test(e) && /simple/i.test(e)),
    `expected error about result groups in simple mode, got: ${JSON.stringify(result.errors)}`
  );
});

// ---------------------------------------------------------------------------
// Group 3: Tiered mode (6 tests — 5 original + 1 macroUuid test)
// ---------------------------------------------------------------------------

function buildTieredSystem(overrides = {}) {
  return buildSystem({
    salvageResolutionMode: 'tiered',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: ['fail', 'pass'],
      progressive: null,
    },
    ...overrides,
  });
}

function buildTieredComponent(outcomeRouting = { fail: 'rg-fail', pass: 'rg-pass' }) {
  return buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      catalysts: [],
      resultGroups: [
        { id: 'rg-fail', results: [] },
        { id: 'rg-pass', results: [] },
      ],
      outcomeRouting,
    },
  });
}

test('tiered mode — checks enabled, outcomes present, valid routing → valid', () => {
  const service = buildService();
  const system = buildTieredSystem();
  const component = buildTieredComponent();

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('tiered mode — salvageCraftingCheck disabled → invalid', () => {
  const service = buildService();
  const system = buildTieredSystem({
    salvageCraftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: ['fail', 'pass'],
      progressive: null,
    },
  });
  const component = buildTieredComponent();

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /check/i.test(e)),
    `expected error about checks being disabled, got: ${JSON.stringify(result.errors)}`
  );
});

test('tiered mode — checks enabled via macroUuid (not boolean enabled) → valid', () => {
  const service = buildService();
  const system = buildTieredSystem({
    salvageCraftingCheck: {
      enabled: false,
      macroUuid: 'Macro.some-uuid',
      outcomes: ['fail', 'pass'],
      progressive: null,
    },
  });
  const component = buildTieredComponent();

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('tiered mode — empty outcomes array → invalid', () => {
  const service = buildService();
  const system = buildTieredSystem({
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
    },
  });
  const component = buildTieredComponent({});

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /outcome/i.test(e)),
    `expected error mentioning outcomes, got: ${JSON.stringify(result.errors)}`
  );
});

test('tiered mode — outcome maps to non-existent result group → invalid', () => {
  const service = buildService();
  const system = buildTieredSystem();
  const component = buildTieredComponent({ fail: 'rg-fail', pass: 'rg-does-not-exist' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /valid salvage result group/i.test(e)),
    `expected error mentioning "valid salvage result group", got: ${JSON.stringify(result.errors)}`
  );
});

test('tiered mode — missing routing entry for an outcome → invalid', () => {
  const service = buildService();
  const system = buildTieredSystem();
  // 'pass' outcome has no routing entry
  const component = buildTieredComponent({ fail: 'rg-fail' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /pass/i.test(e) || /outcome/i.test(e)),
    `expected error about missing routing for "pass", got: ${JSON.stringify(result.errors)}`
  );
});

// ---------------------------------------------------------------------------
// Group 4: Progressive mode (5 tests)
// ---------------------------------------------------------------------------

function buildProgressiveSystem(components = [], overrides = {}) {
  return buildSystem({
    salvageResolutionMode: 'progressive',
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
    components,
    ...overrides,
  });
}

function buildProgressiveComponent(results = []) {
  return buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      catalysts: [],
      resultGroups: [{ id: 'rg-1', results }],
    },
  });
}

test('progressive mode — checks enabled, progressive config, difficulty >= 1 → valid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([{ id: 'scrap-1', difficulty: 2 }]);
  const component = buildProgressiveComponent([{ id: 'r-1', componentId: 'scrap-1' }]);

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('progressive mode — salvageCraftingCheck disabled → invalid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([], {
    salvageCraftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
  });
  const component = buildProgressiveComponent([]);

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /check/i.test(e)),
    `expected error about checks being disabled, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — missing progressive config → invalid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([], {
    salvageCraftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
    },
  });
  const component = buildProgressiveComponent([]);

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /progressive/i.test(e)),
    `expected error mentioning progressive config, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — result references component with difficulty < 1 → invalid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([{ id: 'scrap-bad', difficulty: 0.5 }]);
  const component = buildProgressiveComponent([{ id: 'r-1', componentId: 'scrap-bad' }]);

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /component.*difficulty/i.test(e)),
    `expected error about invalid difficulty, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — empty results array in single group → invalid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([]);
  const component = buildProgressiveComponent([]); // no results

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /result|progressive/i.test(e)),
    `expected error about empty results in progressive mode, got: ${JSON.stringify(result.errors)}`
  );
});
