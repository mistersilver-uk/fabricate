/**
 * Unit tests for ResolutionModeService.validateSalvage (T-044)
 * Tests salvage-specific validation for simple, routed, and progressive modes.
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
// Group 1: Pre-checks (4 tests)
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

test('pre-check — alchemy salvageResolutionMode → invalid with clear error', () => {
  const service = buildService();
  const component = buildComponent();
  const system = buildSystem({ salvageResolutionMode: 'alchemy' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /alchemy/i.test(e)),
    `expected error mentioning "alchemy", got: ${JSON.stringify(result.errors)}`
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

test('simple mode — one success + one reserved failure group → valid (issue 764)', () => {
  // The Simple clamp emits `[success, reserved-failure]` when the Simple check slot has a
  // formula; validation must never reject a clamp-emitted shape. It counts SUCCESS groups
  // (`role !== 'failure'`), so exactly one success + a tolerated reserved failure is valid.
  const service = buildService();
  const component = buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        { id: 'rg-ok', results: [] },
        { id: 'rg-fail', role: 'failure', results: [] },
      ],
    },
  });
  const system = buildSystem({ salvageResolutionMode: 'simple' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
});

test('simple mode — two SUCCESS groups still invalid even with a reserved failure group (issue 764)', () => {
  const service = buildService();
  const component = buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        { id: 'rg-1', results: [] },
        { id: 'rg-2', results: [] },
        { id: 'rg-fail', role: 'failure', results: [] },
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
// Group 3: Routed mode
//
// Routing keys on the salvage check's routed outcome-tier NAMES (the same source
// the authoring UI offers and the runtime routes by), NOT the legacy flat
// `outcomes` list. Validation requires every SUCCESS tier to route to a real
// result group; failure tiers may stay unrouted. When the check defines no tiers,
// the gap is reported once at the SYSTEM level (see system-validation tests), so
// the component itself is not faulted.
// ---------------------------------------------------------------------------

function buildRoutedSystem(overrides = {}) {
  return buildSystem({
    salvageResolutionMode: 'routed',
    salvageCraftingCheck: {
      enabled: true,
      outcomes: ['fail', 'pass'],
      progressive: null,
      routed: {
        type: 'relative',
        rollFormula: '1d20',
        dc: 15,
        thresholdMode: 'meet',
        relativeOutcomes: [
          { id: 't-pass', name: 'pass', success: true, dc: 0 },
          { id: 't-fail', name: 'fail', success: false, dc: -5 },
        ],
        fixedOutcomes: [],
      },
    },
    ...overrides,
  });
}

// Only the SUCCESS tier ("pass") needs a route; the failure tier may stay unrouted.
function buildRoutedComponent(outcomeRouting = { pass: 'rg-pass' }) {
  return buildComponent({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [
        { id: 'rg-fail', results: [] },
        { id: 'rg-pass', results: [] },
      ],
      outcomeRouting,
    },
  });
}

test('routed mode — success tier routed to a real group → valid', () => {
  const service = buildService();
  const system = buildRoutedSystem();
  const component = buildRoutedComponent();

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

test('routed mode — failure tier left unrouted → valid (matches runtime tolerance)', () => {
  const service = buildService();
  const system = buildRoutedSystem();
  // Route only the success tier; the "fail" tier is intentionally unrouted.
  const component = buildRoutedComponent({ pass: 'rg-pass' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

test('routed mode — fixed-type check reads fixedOutcomes for tier names', () => {
  const service = buildService();
  const system = buildRoutedSystem({
    salvageCraftingCheck: {
      enabled: true,
      outcomes: ['fail', 'pass'],
      progressive: null,
      routed: {
        type: 'fixed',
        rollFormula: '1d20',
        dc: 15,
        thresholdMode: 'meet',
        relativeOutcomes: [],
        fixedOutcomes: [
          { id: 'f-pass', name: 'pass', success: true, start: 10, end: 20 },
          { id: 'f-fail', name: 'fail', success: false, start: 0, end: 9 },
        ],
      },
    },
  });
  const component = buildRoutedComponent({ pass: 'rg-pass' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

test('legacy tiered salvageResolutionMode token normalizes to routed and validates', async () => {
  // The legacy `tiered` salvage token is normalized to canonical `routed` by the
  // manager's salvage token normalizer (and the 1.4.0 migration) before reaching
  // validateSalvage; the service itself no longer carries a tiered branch.
  const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
  const manager = new CraftingSystemManager(null);
  const normalized = manager._normalizeSystem({
    id: 'test-system',
    salvageResolutionMode: 'tiered',
    salvageCraftingCheck: {
      enabled: true,
      outcomes: ['fail', 'pass'],
      progressive: null,
      routed: {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [
          { id: 't-pass', name: 'pass', success: true, dc: 0 },
          { id: 't-fail', name: 'fail', success: false, dc: -5 },
        ],
      },
    },
  });
  assert.equal(normalized.salvageResolutionMode, 'routed');

  const service = buildService();
  const component = buildRoutedComponent();

  const result = service.validateSalvage(component, normalized);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

test('routed mode — no outcome tiers defined → valid (gap deferred to system level)', () => {
  // The reported bug: a routed salvage check with no outcome tiers left every
  // component permanently critical with no UI path to author routing. The
  // component must now validate; the missing tiers surface as a single
  // system-level issue instead.
  const service = buildService();
  const system = buildRoutedSystem({
    salvageCraftingCheck: {
      enabled: true,
      outcomes: ['fail', 'pass'],
      progressive: null,
      routed: {
        type: 'relative',
        rollFormula: '1d20',
        relativeOutcomes: [],
        fixedOutcomes: [],
      },
    },
  });
  const component = buildRoutedComponent({});

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

test('routed mode — success tier routes to non-existent result group → invalid', () => {
  const service = buildService();
  const system = buildRoutedSystem();
  const component = buildRoutedComponent({ pass: 'rg-does-not-exist' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /valid salvage result group/i.test(e)),
    `expected error mentioning "valid salvage result group", got: ${JSON.stringify(result.errors)}`
  );
});

test('routed mode — success tier left unrouted → invalid', () => {
  const service = buildService();
  const system = buildRoutedSystem();
  // The "pass" success tier has no routing entry.
  const component = buildRoutedComponent({ fail: 'rg-fail' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /pass/i.test(e) && /result group/i.test(e)),
    `expected error about missing routing for "pass", got: ${JSON.stringify(result.errors)}`
  );
});

test('routed mode — dangling route to a deleted group → invalid', () => {
  const service = buildService();
  const system = buildRoutedSystem();
  // Success tier routed correctly, but a stale route points at a removed group.
  const component = buildRoutedComponent({ pass: 'rg-pass', fail: 'rg-removed' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /missing result group/i.test(e)),
    `expected error about a missing result group, got: ${JSON.stringify(result.errors)}`
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
      outcomes: [],
      progressive: { awardMode: 'equal', rollFormula: '2d6' },
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
      resultGroups: [{ id: 'rg-1', results }],
    },
  });
}

test('progressive mode — authored progressive formula, progressive config, difficulty >= 1 → valid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([{ id: 'scrap-1', difficulty: 2 }]);
  const component = buildProgressiveComponent([{ id: 'r-1', componentId: 'scrap-1' }]);

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('progressive mode — no progressive roll formula → invalid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([], {
    salvageCraftingCheck: {
      enabled: false,
      outcomes: [],
      progressive: { awardMode: 'equal', rollFormula: '' },
    },
  });
  const component = buildProgressiveComponent([]);

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /roll formula/i.test(e)),
    `expected error about the missing progressive roll formula, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — missing progressive config → invalid', () => {
  const service = buildService();
  const system = buildProgressiveSystem([], {
    salvageCraftingCheck: {
      enabled: true,
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

// ---------------------------------------------------------------------------
// Group 5: Messages never leak an internal component / result id (issue 611)
//
// A salvage validation message must identify the component by its author-given
// NAME, or a name-free phrase when unnamed — never the raw internal id. The same
// applies to a progressive result (reported by 1-based position, not its id).
// ---------------------------------------------------------------------------

const SECRET_COMPONENT_ID = 'secret-internal-component-id';

function unnamed(overrides = {}) {
  return buildComponent({ id: SECRET_COMPONENT_ID, name: undefined, ...overrides });
}

function assertNoComponentIdLeak(errors) {
  for (const message of errors) {
    assert.ok(
      !message.includes(SECRET_COMPONENT_ID),
      `message leaked the internal component id: ${message}`
    );
  }
}

test('named component — message uses the component name, not its id (simple mode)', () => {
  const service = buildService();
  const component = buildComponent({
    id: SECRET_COMPONENT_ID,
    name: 'Iron Ore',
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [] },
  });
  const system = buildSystem({ salvageResolutionMode: 'simple' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assertNoComponentIdLeak(result.errors);
  assert.ok(
    result.errors.some((e) => e.includes('Iron Ore')),
    `expected the component name in the message, got: ${JSON.stringify(result.errors)}`
  );
});

test('unnamed component — simple mode message uses a name-free phrase, not the id', () => {
  const service = buildService();
  const component = unnamed({
    salvage: { enabled: true, ingredientQuantity: 1, resultGroups: [] },
  });
  const system = buildSystem({ salvageResolutionMode: 'simple' });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assertNoComponentIdLeak(result.errors);
  assert.ok(
    result.errors.some((e) => /this component/i.test(e)),
    `expected a name-free component phrase, got: ${JSON.stringify(result.errors)}`
  );
});

test('unnamed component — routed mode messages never leak the id', () => {
  const service = buildService();
  const system = buildRoutedSystem();
  const component = buildRoutedComponent({ pass: 'rg-does-not-exist' });
  component.id = SECRET_COMPONENT_ID;
  component.name = undefined;

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assertNoComponentIdLeak(result.errors);
});

test('unnamed component — progressive result reported by position, no component/result id', () => {
  const service = buildService();
  const system = buildProgressiveSystem([{ id: 'scrap-bad', difficulty: 0.5 }]);
  const component = unnamed({
    salvage: {
      enabled: true,
      ingredientQuantity: 1,
      resultGroups: [{ id: 'rg-1', results: [{ id: 'r-secret-id', componentId: 'scrap-bad' }] }],
    },
  });

  const result = service.validateSalvage(component, system);

  assert.equal(result.valid, false);
  assertNoComponentIdLeak(result.errors);
  const difficultyError = result.errors.find((e) => /difficulty/i.test(e));
  assert.ok(difficultyError, `expected a difficulty error, got: ${JSON.stringify(result.errors)}`);
  assert.ok(
    !difficultyError.includes('r-secret-id'),
    `message leaked the internal result id: ${difficultyError}`
  );
  assert.ok(
    /Result 1\b/.test(difficultyError),
    `expected the result reported by 1-based position, got: ${difficultyError}`
  );
});
