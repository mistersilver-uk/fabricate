/**
 * Issue 595: structural / resolution-mode validation errors must be user-facing —
 * localized and free of leaked internal step/set/result ids on EVERY resolution
 * mode. This is the follow-up to #550 (signature collisions); it covers the
 * remaining uncoded structural strings in `ResolutionModeService` and the
 * `RecipeManager` SAVE path.
 *
 * These tests RED-fail on the pre-fix behavior (the cardinality / reference-
 * integrity strings fall back to the internal step/set id when unnamed, and the
 * save-path `invalid resultGroupId` rides a plain `Error` whose message leaks the
 * ids) and pass once each failure carries a stable `code` + human-readable params
 * (name-or-1-based-position) that the localizer maps to id-free copy.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// A Foundry-shaped random id (16 alphanumerics) — the shape that leaked in #550.
const FOUNDRY_ID_RE = /\b[A-Za-z0-9]{16}\b/;

// --- Minimal Foundry globals so RecipeManager's save path is reachable. --------
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
    get: (_ns, key) => settingsStore.get(key),
    set: async (_ns, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { RecipePersistenceError } = await import('../src/systems/RecipePersistenceError.js');
const { localizeActivationIssue, localizeRecipePersistenceError } = await import(
  '../src/systems/recipeActivationMessages.js'
);

// A Foundry-shaped id every UNNAMED step/set below carries, so a leak is detectable.
const STEP_ID = 'aZrvhxMlMBWxYFam';
const SET_ID = 'ZskumdJApJlvdmvw';
const GHOST_GROUP_ID = 'GhOsTgRoUp123456';

function buildService(system) {
  return new ResolutionModeService({
    getSystem: (id) => (system && id === system.id ? system : null),
  });
}

function buildRecipe(steps, overrides = {}) {
  return {
    id: 'r-1',
    craftingSystemId: 'sys-1',
    getExecutionSteps: () => steps,
    ...overrides,
  };
}

// A step with NO name (only a Foundry-shaped id) and a deliberately-wrong
// cardinality so the mode's step-cardinality rule fires.
function unnamedFailingStep() {
  return { id: STEP_ID, ingredientSets: [], resultGroups: [{ id: 'rg-1', results: [] }] };
}

const NON_ALCHEMY_MODES = ['simple', 'routedByIngredients', 'routedByCheck', 'progressive'];

for (const mode of NON_ALCHEMY_MODES) {
  test(`${mode} — an UNNAMED step's cardinality error is coded, id-free, and reports a 1-based position`, () => {
    const system = {
      id: 'sys-1',
      resolutionMode: mode,
      // Give progressive an authored check so ONLY the cardinality issue is coded
      // (the missing-check message is a separate, id-free system-level string).
      craftingCheck: { progressive: { rollFormula: '1d20' } },
    };
    const result = buildService(system).validateRecipe(buildRecipe([unnamedFailingStep()]));

    assert.equal(result.valid, false, 'an empty ingredient set must fail cardinality');
    assert.ok(Array.isArray(result.issues), 'validateRecipe must expose structured issues');

    // The ingredient-set cardinality failure carries a stable code + a position label.
    const coded = result.issues.find(
      (issue) => issue.code && issue.params?.step === '1' && /ingredient set/i.test(issue.message)
    );
    assert.ok(
      coded,
      `expected a coded ingredient-set cardinality issue with step position 1, got: ${JSON.stringify(result.issues)}`
    );
    assert.match(coded.message, /Step "1"/, 'unnamed step must render as its 1-based position');

    // No issue message (nor param) may leak the internal step id on ANY mode.
    for (const issue of result.issues) {
      assert.doesNotMatch(issue.message, FOUNDRY_ID_RE, `message leaked an id: ${issue.message}`);
      assert.ok(!issue.message.includes(STEP_ID), `message leaked the step id: ${issue.message}`);
      for (const value of Object.values(issue.params || {})) {
        assert.doesNotMatch(String(value), FOUNDRY_ID_RE, `param leaked an id: ${value}`);
      }
    }
  });
}

test('a NAMED step keeps the pre-fix English wording byte-for-byte (headless contract unchanged)', () => {
  const system = { id: 'sys-1', resolutionMode: 'simple' };
  const named = { id: STEP_ID, name: 'Forge Blade', ingredientSets: [], resultGroups: [] };
  const result = buildService(system).validateRecipe(buildRecipe([named]));
  assert.ok(
    result.errors.includes('Step "Forge Blade" must have exactly 1 ingredient set in simple mode'),
    `named-step wording drifted: ${JSON.stringify(result.errors)}`
  );
});

test('routedByIngredients — an UNNAMED set mapping to a missing group is coded and id-free (no set id, no group id)', () => {
  const system = { id: 'sys-1', resolutionMode: 'routedByIngredients' };
  const step = {
    id: 'step-x',
    name: 'Only Step',
    ingredientSets: [{ id: SET_ID, resultGroupId: GHOST_GROUP_ID, ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-real', results: [] }],
  };
  const result = buildService(system).validateRecipe(buildRecipe([step]));

  assert.equal(result.valid, false);
  const coded = result.issues.find((issue) => issue.code === 'ingredientSetInvalidResultGroup');
  assert.ok(coded, `expected the coded reference-integrity issue, got: ${JSON.stringify(result.issues)}`);
  assert.equal(coded.params.set, '1', 'the unnamed set reports its 1-based position');
  assert.match(coded.message, /result group/i);
  // Neither the set id nor the dangling group id may appear anywhere the user sees.
  assert.doesNotMatch(coded.message, FOUNDRY_ID_RE, `message leaked an id: ${coded.message}`);
  assert.ok(!coded.message.includes(SET_ID));
  assert.ok(!coded.message.includes(GHOST_GROUP_ID));
});

test('routedByCheck — an UNNAMED step with a reserved result-group name is coded and id-free', () => {
  const system = { id: 'sys-1', resolutionMode: 'routedByCheck' };
  const step = {
    id: STEP_ID,
    ingredientSets: [{ id: 'set-a', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', name: 'Hazard', results: [] }],
  };
  const result = buildService(system).validateRecipe(buildRecipe([step]));

  assert.equal(result.valid, false);
  const coded = result.issues.find((issue) => issue.code === 'routedGroupNameReserved');
  assert.ok(coded, `expected the reserved-name issue, got: ${JSON.stringify(result.issues)}`);
  assert.equal(coded.params.step, '1', 'the unnamed step reports its 1-based position');
  assert.ok(coded.message.includes('Hazard'), 'the authored group name is preserved');
  assert.doesNotMatch(coded.message, FOUNDRY_ID_RE, `message leaked an id: ${coded.message}`);
  assert.ok(!coded.message.includes(STEP_ID));
});

test('localizeActivationIssue maps a structural code through the localize fn with position params', () => {
  const issue = {
    code: 'stepIngredientSetCountExact',
    params: { step: '2', mode: 'simple' },
    message: 'fallback',
  };
  const echo = (key) => key; // Foundry echoes an absent key → built-in fallback used
  const out = localizeActivationIssue(issue, echo);
  assert.ok(!out.startsWith('FABRICATE.'), `must not surface the raw key: ${out}`);
  assert.match(out, /Step "2"/);
  assert.match(out, /simple mode/);
});

// --- RecipeManager SAVE path (issue 595): an ordinary update, not an enable. ----

function makeRoutedManager() {
  const system = { id: 'sys-1', resolutionMode: 'routedByIngredients', features: {} };
  const csm = { getSystem: (id) => (id === system.id ? system : null) };
  game.fabricate.getCraftingSystemManager = () => csm;
  game.fabricate.getResolutionModeService = () => new ResolutionModeService(csm);
  const manager = new RecipeManager();
  manager.initialized = true;
  return manager;
}

test('RecipeManager.updateRecipe — a save-time invalid result-group reference throws a coded, id-free persistence error', async () => {
  settingsStore.clear();
  const manager = makeRoutedManager();

  // A persisted shell first (born disabled, allowIncomplete waives completeness).
  const shell = await manager.createRecipe({ craftingSystemId: 'sys-1' }, { allowIncomplete: true });

  // An ordinary SAVE (not an enable) whose only fault is a set pointing at a group
  // that does not exist — the pre-fix path threw a plain Error leaking both ids.
  const badUpdate = {
    ingredientSets: [{ id: SET_ID, resultGroupId: GHOST_GROUP_ID, ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-real', results: [] }],
  };

  let thrown = null;
  await assert.rejects(
    () => manager.updateRecipe(shell.id, badUpdate, { allowIncomplete: true }),
    (err) => {
      thrown = err;
      return err instanceof RecipePersistenceError;
    }
  );

  // The structured issue is coded + id-free; the headless message keeps its prefix
  // but no longer echoes the set/group id.
  const coded = thrown.persistenceIssues.find(
    (issue) => issue.code === 'ingredientSetInvalidResultGroup'
  );
  assert.ok(coded, `expected the coded reference issue, got: ${JSON.stringify(thrown.persistenceIssues)}`);
  assert.match(thrown.message, /Invalid recipe update/, 'headless prefix preserved');
  assert.doesNotMatch(thrown.message, FOUNDRY_ID_RE, `save error leaked an id: ${thrown.message}`);
  assert.ok(!thrown.message.includes(SET_ID) && !thrown.message.includes(GHOST_GROUP_ID));

  // The UI toast the store would show is likewise localized + id-free.
  const echo = (key) => key;
  const toast = localizeRecipePersistenceError(thrown, echo);
  assert.ok(toast, 'a persistence error must localize to a toast');
  assert.doesNotMatch(toast, FOUNDRY_ID_RE, `toast leaked an id: ${toast}`);
  assert.match(toast, /result group/i);
});

test('localizeRecipePersistenceError returns null for a plain (non-persistence) error', () => {
  assert.equal(
    localizeRecipePersistenceError(new Error('boom'), (k) => k),
    null
  );
});
