/**
 * Tests for the pure system-validation aggregator and the GM-aware, cached
 * two-tier visibility gate it powers.
 *
 * The aggregator (`evaluateSystemValidation`) composes the per-entity readiness
 * evaluators (recipe / environment / salvage / signature) plus the NEW
 * system-level blocker checks. The visibility gate (`computeSystemVisibility`,
 * wired into `RecipeManager.getAvailableRecipes` and the gathering listing) hides
 * a whole system from non-GM users when it has a `blocks: 'system'` issue, hides
 * single entities marked `blocks: 'visibility'`, never mutates `enabled`, and
 * bypasses both tiers for GMs.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const settingsStore = new Map();

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {},
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};

globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} },
};

const { evaluateSystemValidation, computeSystemVisibility } = await import(
  '../src/systems/systemValidation.js'
);
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// ---------------------------------------------------------------------------
// Shared fixtures (kept here so Sonar duplication stays low across the suite).
// ---------------------------------------------------------------------------

function componentMatch(componentId) {
  return { type: 'component', componentId };
}

/**
 * A complete, craftable recipe JSON in a single ingredient set / result group.
 * `routedCheck` flips it to the routed `check` provider.
 */
function makeRecipe(overrides = {}) {
  const { routedCheck = false, checkOutcomeIds, ...rest } = overrides;
  return {
    id: rest.id || `recipe-${++idSeq}`,
    name: rest.name || 'Iron Sword',
    craftingSystemId: rest.craftingSystemId || 'sys-1',
    enabled: rest.enabled !== false,
    ingredientSets: rest.ingredientSets || [
      {
        id: 'set-1',
        ingredientGroups: [
          { id: 'group-1', name: 'Iron', options: [{ id: 'opt-1', match: componentMatch('iron') }] },
        ],
        essences: {},
      },
    ],
    resultGroups: rest.resultGroups || [
      {
        id: 'result-group-1',
        ...(checkOutcomeIds ? { checkOutcomeIds } : {}),
        results: [{ id: 'result-1', itemUuid: 'Item.sword', quantity: 1 }],
      },
    ],
    ...(routedCheck ? { resultSelection: { provider: 'check' } } : {}),
    ...rest,
  };
}

function makeSystem(overrides = {}) {
  return {
    id: 'sys-1',
    name: 'Forge',
    enabled: true,
    resolutionMode: 'simple',
    features: { craftingChecks: false },
    craftingCheck: {},
    components: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Aggregator: composition
// ---------------------------------------------------------------------------

describe('evaluateSystemValidation — composition', () => {
  it('composes per-entity recipe issues (re-tagged with kind/entityId/nav)', () => {
    const recipe = makeRecipe({ id: 'r-1', name: '', resultGroups: [] });
    const report = evaluateSystemValidation(makeSystem(), { recipes: [recipe] });

    const noName = report.issues.find((issue) => issue.code === 'noName');
    assert.ok(noName, 'expected the recipe noName issue to surface');
    assert.equal(noName.kind, 'recipe');
    assert.equal(noName.entityId, 'r-1');
    assert.equal(noName.nav.view, 'recipe-edit');

    const noResultGroup = report.issues.find((issue) => issue.code === 'noResultGroup');
    assert.ok(noResultGroup, 'expected the missing-result-group issue to surface');
    assert.equal(noResultGroup.blocks, 'enable');
    assert.equal(report.blocksSystem, false, 'a per-recipe gap is not a system blocker');
  });

  it('surfaces the #431 routed warnings for a check-mode recipe (projection + routing context)', () => {
    // A routed check system with two success tiers; the recipe has TWO result
    // groups (so mapping is required) both routed to tier "hit" only — so tier
    // "crit" is unproduced AND nothing would surface these warnings unless the
    // aggregator passes the routing context (routingProvider:'check' + the
    // success-filtered tier options).
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          relativeOutcomes: [
            { id: 'tier-hit', name: 'Hit', success: true },
            { id: 'tier-crit', name: 'Crit', success: true },
          ],
        },
      },
    });
    const recipe = makeRecipe({
      id: 'r-routed',
      routedCheck: true,
      resultGroups: [
        { id: 'rg-a', name: 'A', checkOutcomeIds: ['tier-hit'], results: [] },
        { id: 'rg-b', name: 'B', checkOutcomeIds: ['tier-hit'], results: [] },
      ],
    });

    const report = evaluateSystemValidation(system, { recipes: [recipe] });

    const unproduced = report.issues.find((issue) => issue.code === 'unproducedOutcomeTier');
    assert.ok(unproduced, 'expected the #431 unproduced-tier warning to surface');
    assert.equal(unproduced.severity, 'warning');
    assert.equal(unproduced.blocks, undefined, 'the #431 routed warning stays a warning');
    assert.equal(unproduced.kind, 'recipe');
  });

  it('flags an unrouted result group (no valid assigned tier) for a check-mode recipe', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          relativeOutcomes: [{ id: 'tier-hit', name: 'Hit', success: true }],
        },
      },
    });
    // TWO result groups (mapping required): one routes a valid tier, the other
    // lists only a since-deleted tier id → unrouted.
    const recipe = makeRecipe({
      id: 'r-unrouted',
      routedCheck: true,
      resultGroups: [
        { id: 'rg-ok', name: 'OK', checkOutcomeIds: ['tier-hit'], results: [] },
        { id: 'rg-gone', name: 'Gone', checkOutcomeIds: ['tier-gone'], results: [] },
      ],
    });

    const report = evaluateSystemValidation(system, { recipes: [recipe] });
    assert.ok(
      report.issues.some((issue) => issue.code === 'unroutedResultGroup'),
      'expected the #431 unrouted-result-group warning to surface'
    );
  });

  it('does not surface #431 routed warnings for a single-result-group check-mode recipe', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          relativeOutcomes: [
            { id: 'tier-hit', name: 'Hit', success: true },
            { id: 'tier-crit', name: 'Crit', success: true },
          ],
        },
      },
    });
    // One result group, no mapping — the single-group exemption suppresses both
    // the unrouted-group and unproduced-tier warnings.
    const recipe = makeRecipe({ id: 'r-one', routedCheck: true });

    const report = evaluateSystemValidation(system, { recipes: [recipe] });
    assert.equal(
      report.issues.some(
        (issue) =>
          issue.code === 'unroutedResultGroup' || issue.code === 'unproducedOutcomeTier'
      ),
      false,
      'a single-result-group routedByCheck recipe needs no mapping'
    );
  });

  it('composes salvage issues for an invalid component salvage config', () => {
    const component = {
      id: 'comp-1',
      name: 'Cracked Gem',
      salvage: { resultGroups: [{ id: 'g1', results: [] }, { id: 'g2', results: [] }] },
    };
    const system = makeSystem({ salvageResolutionMode: 'simple' });
    const report = evaluateSystemValidation(system, { components: [component] });

    const salvage = report.issues.find((issue) => issue.kind === 'salvage');
    assert.ok(salvage, 'expected the invalid-salvage issue to surface');
    assert.equal(salvage.entityId, 'comp-1');
    assert.equal(salvage.blocks, 'visibility');
  });

  it('treats a component with no salvage result sets as not salvageable (no issue)', () => {
    // An empty salvage config means the component simply is not salvageable — an
    // opt-in state, not a misconfiguration — so it must produce no salvage issue,
    // even though `validateSalvage` would otherwise reject 0 result groups.
    const component = { id: 'comp-2', name: 'Plain Stone', salvage: { resultGroups: [] } };
    const system = makeSystem({ salvageResolutionMode: 'simple' });
    const report = evaluateSystemValidation(system, { components: [component] });

    assert.equal(
      report.issues.find((issue) => issue.kind === 'salvage'),
      undefined,
      'a component with no salvage result sets must not surface a salvage issue'
    );
  });

  it('composes environment issues from a precomputed composition view-model', () => {
    const environment = {
      id: 'env-1',
      name: 'Old Forest',
      enabled: true,
      composition: { counts: { availableTasks: 0 }, tasks: [], events: [] },
    };
    const report = evaluateSystemValidation(makeSystem(), { environments: [environment] });

    const envIssue = report.issues.find((issue) => issue.kind === 'environment');
    assert.ok(envIssue, 'expected an environment readiness issue');
    assert.equal(envIssue.entityId, 'env-1');
    assert.equal(envIssue.nav.view, 'environment-edit');
  });
});

// ---------------------------------------------------------------------------
// Aggregator: system-level blocker checks
// ---------------------------------------------------------------------------

describe('evaluateSystemValidation — system blockers set blocksSystem', () => {
  it('routedByCheck with no routed formula blocks the system unconditionally (with a recipe)', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      features: { craftingChecks: false },
      craftingCheck: { routed: { rollFormula: '' } },
    });
    const recipe = makeRecipe({ routedCheck: true });
    const report = evaluateSystemValidation(system, { recipes: [recipe] });

    assert.equal(report.blocksSystem, true);
    const blocker = report.issues.find((issue) => issue.code === 'routedCheckNoFormula');
    assert.ok(blocker);
    assert.equal(blocker.severity, 'critical');
    assert.equal(blocker.blocks, 'system');
    assert.equal(blocker.kind, 'system');
    assert.equal(blocker.nav.view, 'system-overview');
    assert.ok(report.counts.blockers >= 1, 'the critical blocker counts as a blocker');
  });

  it('routedByCheck with no routed formula blocks the system with ZERO recipes (unconditional)', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      features: { craftingChecks: false },
      craftingCheck: { routed: { rollFormula: '' } },
    });
    // The routing basis is the MODE, so the missing formula blocks the whole system
    // independent of any recipe — verified here with no recipes at all.
    const report = evaluateSystemValidation(system, { recipes: [] });

    const blocker = report.issues.find((issue) => issue.code === 'routedCheckNoFormula');
    assert.ok(blocker, 'the blocker is computed with no recipe scan');
    assert.equal(blocker.blocks, 'system');
    assert.equal(report.blocksSystem, true);
  });

  it('routedByIngredients with an empty simple formula raises no blocker (its check is optional, like simple/alchemy)', () => {
    // RI now reads craftingCheck.simple (unified onto the shared optional pass/fail
    // slot). An unauthored simple formula simply means no check runs — its readiness
    // stays identical to its equally-optional simple/alchemy peers; collectSystemBlockers
    // only raises routedCheckNoFormula for routedByCheck.
    const system = makeSystem({
      resolutionMode: 'routedByIngredients',
      features: { craftingChecks: false },
      craftingCheck: { simple: { rollFormula: '' }, routed: { rollFormula: '' } },
    });
    const report = evaluateSystemValidation(system, { recipes: [makeRecipe({})] });

    assert.equal(
      report.issues.some((issue) => issue.code === 'routedCheckNoFormula'),
      false,
      'routedByIngredients carries no routedCheckNoFormula pressure'
    );
    assert.equal(report.blocksSystem, false, 'the optional RI check raises no system blocker');
  });

  it('does NOT block a routedByCheck system once a routed formula is configured', () => {
    const system = makeSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: { routed: { rollFormula: '1d20' } },
    });
    const recipe = makeRecipe({ routedCheck: true });
    const report = evaluateSystemValidation(system, { recipes: [recipe] });
    assert.equal(report.blocksSystem, false, 'configuring the check clears the blocker');
    assert.equal(
      report.issues.some((issue) => issue.code === 'routedCheckNoFormula'),
      false,
      'a configured routed formula clears the routedCheckNoFormula issue'
    );
  });

  it('routed salvage with no tiers and salvage in use surfaces ONE critical system issue (not per-component)', () => {
    // The Mythwright bug: routed salvage with no outcome tiers left every
    // salvageable component permanently critical. Now the per-component salvage
    // is valid and the gap is a single system-level issue instead.
    const component = {
      id: 'comp-1',
      name: 'Slain Balehound',
      salvage: { resultGroups: [{ id: 'g1', results: [] }] },
    };
    const system = makeSystem({ salvageResolutionMode: 'routed' });
    const report = evaluateSystemValidation(system, { components: [component] });

    assert.equal(
      report.issues.some((issue) => issue.kind === 'salvage'),
      false,
      'the per-component salvage critical no longer fires'
    );
    const noTiers = report.issues.find((issue) => issue.code === 'salvageRoutedNoTiers');
    const noFormula = report.issues.find((issue) => issue.code === 'salvageRoutedNoFormula');
    assert.ok(noTiers, 'expected a single salvageRoutedNoTiers system issue');
    assert.ok(noFormula, 'expected a single salvageRoutedNoFormula system issue');
    assert.equal(noTiers.severity, 'critical', 'salvage in use escalates to critical');
    assert.equal(noTiers.kind, 'system');
    assert.equal(noTiers.entityId, null);
    assert.equal(noTiers.nav.view, 'system-overview');
    assert.equal(report.blocksSystem, false, 'a salvage gap never blocks the whole system');
    assert.equal(report.counts.blockers, 0, 'salvage gaps carry no blocks field');
  });

  it('routed salvage with no tiers and NO salvage in use warns without escalating', () => {
    const system = makeSystem({ salvageResolutionMode: 'routed' });
    const report = evaluateSystemValidation(system, { components: [] });

    const noTiers = report.issues.find((issue) => issue.code === 'salvageRoutedNoTiers');
    assert.ok(noTiers, 'expected the salvageRoutedNoTiers issue');
    assert.equal(noTiers.severity, 'warning', 'no salvageable component → warning, not critical');
    assert.equal(report.blocksSystem, false);
  });

  it('routed salvage with a formula and outcome tiers surfaces no salvage system issue', () => {
    const component = {
      id: 'comp-1',
      name: 'Slain Balehound',
      salvage: {
        resultGroups: [{ id: 'rg-pass', results: [] }],
        outcomeRouting: { pass: 'rg-pass' },
      },
    };
    const system = makeSystem({
      salvageResolutionMode: 'routed',
      salvageCraftingCheck: {
        routed: {
          type: 'relative',
          rollFormula: '1d20',
          relativeOutcomes: [{ id: 't-pass', name: 'pass', success: true, dc: 0 }],
        },
      },
    });
    const report = evaluateSystemValidation(system, { components: [component] });

    assert.equal(
      report.issues.some(
        (issue) =>
          issue.code === 'salvageRoutedNoTiers' || issue.code === 'salvageRoutedNoFormula'
      ),
      false,
      'a configured routed salvage check clears the salvage system issues'
    );
  });

  it('routed salvage with no formula/tiers raises NO salvage warnings when the salvage feature is off', () => {
    const component = {
      id: 'comp-1',
      name: 'Slain Balehound',
      salvage: { resultGroups: [{ id: 'g1', results: [] }] },
    };
    // Same gap as the warning cases above, but salvage is disabled — the whole
    // salvage subsystem is inert, so no salvage issues (system or per-component)
    // are raised even though the config is still present on the component.
    const system = makeSystem({ salvageResolutionMode: 'routed', features: { salvage: false } });
    const report = evaluateSystemValidation(system, { components: [component] });

    assert.equal(
      report.issues.some(
        (issue) =>
          issue.kind === 'salvage' ||
          issue.code === 'salvageRoutedNoTiers' ||
          issue.code === 'salvageRoutedNoFormula'
      ),
      false,
      'a disabled salvage feature raises no salvage validation issues'
    );
  });

  it('progressive mode with no progressive check', () => {
    const system = makeSystem({
      resolutionMode: 'progressive',
      features: { craftingChecks: false },
      craftingCheck: { progressive: { rollFormula: '' } },
    });
    const report = evaluateSystemValidation(system, { recipes: [] });
    assert.equal(report.blocksSystem, true);
    assert.ok(report.issues.some((issue) => issue.code === 'progressiveNoCheck'));
  });

  it('legacy enabled toggle cannot mask a missing progressive roll formula', () => {
    // A check is usable IFF it has an authored roll formula. The legacy
    // `craftingCheck.enabled` / `features.craftingChecks` toggles must NOT suppress
    // the progressiveNoCheck blocker when no progressive formula is configured.
    const system = makeSystem({
      resolutionMode: 'progressive',
      features: { craftingChecks: true },
      craftingCheck: { enabled: true, progressive: { rollFormula: '' } },
    });
    const report = evaluateSystemValidation(system, { recipes: [] });
    assert.equal(report.blocksSystem, true);
    assert.ok(
      report.issues.some((issue) => issue.code === 'progressiveNoCheck'),
      'the missing formula still blocks despite the legacy enabled toggle'
    );
  });

  it('multi-step recipes left on in alchemy mode', () => {
    const system = makeSystem({
      resolutionMode: 'alchemy',
      features: { multiStepRecipes: true },
    });
    const report = evaluateSystemValidation(system, { recipes: [] });
    assert.equal(report.blocksSystem, true);
    const blocker = report.issues.find((issue) => issue.code === 'multiStepInAlchemy');
    assert.ok(blocker);
    assert.equal(blocker.blocks, 'system');
  });

  it('alchemy ingredient-signature collision (subsumes #99)', () => {
    const system = makeSystem({ resolutionMode: 'alchemy', features: {} });
    // Two recipes whose single ingredient set expands to the same component → an
    // ambiguous signature collision in alchemy mode.
    const a = makeRecipe({ id: 'a', name: 'Potion A' });
    const b = makeRecipe({ id: 'b', name: 'Potion B' });
    const components = [{ id: 'iron', tags: [] }];

    const report = evaluateSystemValidation(system, { recipes: [a, b], components });
    assert.equal(report.blocksSystem, true);
    const blocker = report.issues.find((issue) => issue.code === 'alchemySignatureCollision');
    assert.ok(blocker, 'expected the alchemy signature collision blocker');
    assert.equal(blocker.blocks, 'system');
  });
});

// ---------------------------------------------------------------------------
// Visibility gate: recipes (RecipeManager.getAvailableRecipes)
// ---------------------------------------------------------------------------

describe('two-tier visibility gate — recipes', () => {
  let manager;
  let blockedSystem;

  function makeManagerWithSystem(system) {
    const csm = { getSystem: (id) => (id === system.id ? system : null) };
    game.fabricate.getCraftingSystemManager = () => csm;
    const recipeManager = new RecipeManager();
    recipeManager.initialized = true;
    // Isolate the gate from inventory craftability — every enabled recipe is
    // otherwise "available".
    recipeManager.canCraft = () => ({ canCraft: true });
    return recipeManager;
  }

  beforeEach(() => {
    // A routedByCheck system with NO routed formula and checks disabled →
    // blocksSystem unconditionally.
    blockedSystem = makeSystem({
      resolutionMode: 'routedByCheck',
      features: { craftingChecks: false },
      craftingCheck: { routed: { rollFormula: '' } },
    });
    manager = makeManagerWithSystem(blockedSystem);
    manager.recipes.set('r-1', {
      ...makeRecipe({ id: 'r-1', routedCheck: true }),
      toJSON() {
        return this;
      },
    });
  });

  afterEach(() => {
    delete game.fabricate.getCraftingSystemManager;
    game.user = { isGM: true };
  });

  it('a system-blocker hides ALL recipes from a non-GM user', () => {
    game.user = { isGM: false };
    assert.deepEqual(manager.getAvailableRecipes([{ name: 'Hero', items: [] }]), []);
  });

  it('a GM still sees recipes from a blocked system (GM bypass)', () => {
    game.user = { isGM: true };
    const available = manager.getAvailableRecipes([{ name: 'GM', items: [] }]);
    assert.equal(available.length, 1, 'GM bypasses the system blocker');
  });

  it('does not mutate the recipe enabled flag and auto-restores once the gap clears', () => {
    game.user = { isGM: false };
    assert.deepEqual(manager.getAvailableRecipes([{ name: 'Hero', items: [] }]), []);
    // enabled is never touched by the computed gate.
    assert.equal(manager.getRecipe('r-1').enabled, true, 'enabled must not be mutated');

    // Fix the gap: configure the routed formula. The next read auto-restores
    // visibility with no manual re-enable.
    blockedSystem.craftingCheck.routed.rollFormula = '1d20';
    const available = manager.getAvailableRecipes([{ name: 'Hero', items: [] }]);
    assert.equal(available.length, 1, 'visibility auto-restores once the blocker clears');
    assert.equal(manager.getRecipe('r-1').enabled, true);
  });

  it('without a system blocker, non-GM users still see craftable recipes', () => {
    const goodSystem = makeSystem({ id: 'sys-1', resolutionMode: 'simple' });
    const goodManager = makeManagerWithSystem(goodSystem);
    goodManager.recipes.set('r-ok', {
      ...makeRecipe({ id: 'r-ok' }),
      toJSON() {
        return this;
      },
    });
    game.user = { isGM: false };
    const available = goodManager.getAvailableRecipes([{ name: 'Hero', items: [] }]);
    assert.equal(available.length, 1);
  });
});

// ---------------------------------------------------------------------------
// computeSystemVisibility — the hot-path decision used by the gates
// ---------------------------------------------------------------------------

describe('computeSystemVisibility', () => {
  it('reports blocksSystem and the per-entity hidden set without messages', () => {
    const system = makeSystem({ salvageResolutionMode: 'simple' });
    const components = [
      {
        id: 'bad-salvage',
        name: 'Cracked Gem',
        salvage: { resultGroups: [{ id: 'g1', results: [] }, { id: 'g2', results: [] }] },
      },
    ];
    const { blocksSystem, hiddenEntityIds } = computeSystemVisibility(system, { components });
    assert.equal(blocksSystem, false);
    assert.ok(hiddenEntityIds.has('bad-salvage'), 'invalid salvage hides the component');
  });

  it('reports blocksSystem true for a structural system gap', () => {
    const system = makeSystem({
      resolutionMode: 'alchemy',
      features: { multiStepRecipes: true },
    });
    const { blocksSystem } = computeSystemVisibility(system, {});
    assert.equal(blocksSystem, true);
  });
});
