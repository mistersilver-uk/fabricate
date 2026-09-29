/**
 * Alchemy simple-mode tool breakage (issue 2100): verify that a failed simple-mode alchemy
 * check breaks tools only when `breakToolsOnFail` is enabled, the same as crafting.
 * Tests spy on _applyToolBreakage to verify the engine reaches the correct code path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { SignatureValidator } from '../src/systems/SignatureValidator.js';
import { getItemSourceReferences, getItemMatchUuids } from '../src/utils/sourceUuid.js';
import { toAlchemyRecords } from './helpers/alchemySubmissionRecords.js';
import { mergeHistoryFlag } from './helpers/journal-fixtures.js';

// Globals

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((v, k) => (v == null ? undefined : v[k]), object);
}
function setProperty(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (target[part] == null || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[last] = value;
  return true;
}

let _idCounter = 0;
globalThis.foundry = { utils: { getProperty, setProperty, randomID: () => `id-${++_idCounter}` } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

// Fakes

class FakeItem {
  constructor(id, name, quantity, duplicateSource) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.parent = null;
    this.system = { quantity };
    this._stats = { duplicateSource: duplicateSource };
    this.flags = {};
    this._deleted = false;
    this._updates = [];
  }
  async delete() {
    this._deleted = true;
    return this;
  }
  async update(payload) {
    this._updates.push({ ...payload });
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    return this;
  }
}

class FakeActor {
  constructor(name, items = []) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.items = items;
    for (const item of items) item.parent = this;
    this.created = [];
  }
  async createEmbeddedDocuments(_type, data) {
    const made = data.map((d, i) => {
      const item = new FakeItem(`created-${this.created.length + i}`, d.name, d.system?.quantity ?? 1, null);
      item.img = d.img;
      item.parent = this;
      item.uuid = `${this.uuid}.Item.${item.id}`;
      item._source = structuredClone(d);
      return item;
    });
    this.created.push(...made);
    return made;
  }
}

function sourceItemFor(name) {
  return {
    toObject: () => ({ name, img: `icons/${name}.webp`, type: 'consumable', system: {} }),
    effects: [],
  };
}

// Fixtures

const EMBER_SRC = 'Compendium.src.Item.emberroot';
const POTION_SRC = 'Compendium.src.Item.potion';
const SLUDGE_SRC = 'Compendium.src.Item.sludge';

function components() {
  return [
    { id: 'emberroot', name: 'Emberroot', registeredItemUuid: EMBER_SRC, originItemUuid: EMBER_SRC },
    { id: 'potion', name: 'Potion of Vigor', img: 'icons/potion.webp', registeredItemUuid: POTION_SRC, originItemUuid: POTION_SRC },
    { id: 'sludge', name: 'Toxic Sludge', img: 'icons/sludge.webp', registeredItemUuid: SLUDGE_SRC, originItemUuid: SLUDGE_SRC },
  ];
}

function makeMatcher(comps) {
  const byId = new Map(comps.map((c) => [c.id, c]));
  return (_recipe, ingredient, item) => {
    const compId = ingredient?.match?.componentId ?? ingredient?.componentId;
    const comp = byId.get(compId);
    if (!comp) return false;
    const compRefs = new Set(getItemMatchUuids(comp));
    for (const ref of getItemSourceReferences(item)) {
      if (compRefs.has(ref)) return true;
    }
    return false;
  };
}

function alchemyRecipe(toolIds) {
  const set = {
    id: 'brew-set',
    essences: {},
    ingredientGroups: [
      { id: 'g1', options: [{ match: { type: 'component', componentId: 'emberroot' }, componentId: 'emberroot', quantity: 1 }] },
    ],
    matchIngredients(availableItems, matcher) {
      const plan = [];
      for (const group of this.ingredientGroups) {
        for (const option of group.options) {
          const ingredient = {
            componentId: option.componentId,
            match: option.match,
            quantity: option.quantity,
            getDescription: () => option.componentId,
          };
          const item = availableItems.find((i) => matcher(null, ingredient, i));
          if (item) {
            plan.push({ item, quantity: option.quantity, ingredient });
            break;
          }
        }
      }
      return plan;
    },
  };
  return {
    id: 'brew',
    name: 'Volatile Draught',
    enabled: true,
    craftingSystemId: 'sys-a',
    ingredientSets: [set],
    resultGroups: [
      { id: 'rg-ok', name: 'On success', results: [{ id: 'r-ok', componentId: 'potion', quantity: 1 }] },
      { id: 'rg-fail', name: 'On a failed check', role: 'failure', results: [{ id: 'r-fail', componentId: 'sludge', quantity: 1 }] },
    ],
    toolIds,
    transferEffects: false,
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return {
        id: this.id,
        name: this.name,
        craftingSystemId: this.craftingSystemId,
        ingredientSets: this.ingredientSets,
        resultGroups: this.resultGroups,
      };
    },
    getExecutionSteps() {
      return [
        {
          id: 'implicit-step',
          name: 'Step 1',
          ingredientSets: this.ingredientSets,
          resultGroups: this.resultGroups,
          toolIds: this.toolIds,
          timeRequirement: null,
          outcomeRouting: null,
          resultSelection: null,
        },
      ];
    },
  };
}

function setup(checkMode, breakToolsOnFail, breakToolsTrigger = false) {
  const system = {
    id: 'sys-a',
    resolutionMode: 'alchemy',
    features: {},
    alchemy: { checkMode, learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: false },
    craftingCheck: checkMode === 'simple' ? { simple: { rollFormula: '1d20', dc: 15 } } : {},
    components: components(),
    managedItems: components(),
  };
  if (breakToolsOnFail) {
    system.craftingCheck.consumption = { breakToolsOnFail: true };
  }
  const recipe = alchemyRecipe(['tool1']);
  if (breakToolsTrigger) {
    // `checkDriven` authority is required for ANY trigger to force-break (data-models/spec.md
    // requirement 22); the trigger itself lives on `craftingCheck.simple.checkBreakage.triggers`,
    // the same shape `evaluateCheckBreakage` reads for crafting.
    system.toolBreakage = { authority: 'checkDriven' };
    if (!system.craftingCheck.simple) system.craftingCheck.simple = { rollFormula: '1d20', dc: 15 };
    system.craftingCheck.simple.checkBreakage = {
      triggers: [{ id: 'break-on-fail', breakTools: true, condition: { type: 'rollTotal', operator: '<=', value: 10 } }],
    };
  }
  const resolutionService = new ResolutionModeService({ getSystem: (id) => (id === 'sys-a' ? system : null) });
  const recipeManager = {
    getRecipes: () => [recipe],
    canCraft(_actors, execRecipe) {
      return { canCraft: true, satisfiableSet: execRecipe.ingredientSets[0], missing: { ingredients: [], essences: [], tools: [] } };
    },
    getToolsForSet: () => [{ id: 'tool1', name: 'Alchemy Tool', quantity: 1 }],
    ingredientMatchesItem: makeMatcher(components()),
    toolMatchesItem: () => true,
  };
  const visibility = {
    learned: [],
    itemUse: 0,
    guardCraftStart: () => ({ craftable: true }),
    async applyRecipeItemUseOnCraft() {
      this.itemUse += 1;
    },
    async learnRecipeOnCraft(r) {
      if (system.alchemy?.learnOnCraft !== true) return;
      this.learned.push(r.id);
    },
  };
  const engine = new CraftingEngine(recipeManager, null, resolutionService);
  globalThis.fromUuid = async (uuid) => {
    if (uuid === POTION_SRC) return sourceItemFor('Potion of Vigor');
    if (uuid === SLUDGE_SRC) return sourceItemFor('Toxic Sludge');
    return null;
  };
  globalThis.game = {
    user: { id: 'gm', isGM: true },
    time: { worldTime: 1000 },
    actors: [],
    i18n: { localize: (k) => k },
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === 'sys-a' ? system : null) }),
      getResolutionModeService: () => resolutionService,
      getRecipeManager: () => recipeManager,
      getRecipeVisibilityService: () => visibility,
      getCraftingRunManager: () => null,
    },
  };
  const validator = new SignatureValidator({
    getSystem: () => system,
    getRecipesForSystem: () => [recipe],
    getComponentsForSystem: () => components(),
  });
  return { engine, system, recipe, visibility, validator };
}

function brewInputs() {
  const owned = new FakeItem('owned-emberroot', 'Emberroot', 1, EMBER_SRC);
  const actor = new FakeActor('src', [owned]);
  const crafter = new FakeActor('pc');
  const submitted = [{ uuid: owned.uuid, name: 'Emberroot', _stats: { duplicateSource: EMBER_SRC } }];
  return { owned, actor, crafter, submitted };
}

async function brew(engine, validator, inputs) {
  const submitted = toAlchemyRecords(inputs.submitted, components(), 'sys-a');
  return engine.craftAlchemy(inputs.crafter, [inputs.actor], submitted, {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
  });
}

// Tests

test('Simple check FAIL with breakToolsOnFail OFF: _applyToolBreakage NOT called', async () => {
  const { engine, validator } = setup('simple', false);
  engine._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 4, data: {} });
  const inputs = brewInputs();

  let applyToolBreakageCalled = false;
  const originalApplyToolBreakage = engine._applyToolBreakage;
  engine._applyToolBreakage = async (...args) => {
    applyToolBreakageCalled = true;
    return originalApplyToolBreakage.call(engine, ...args);
  };

  const result = await brew(engine, validator, inputs);

  assert.equal(result.success, false, 'the check failed');
  assert.equal(applyToolBreakageCalled, false, '_applyToolBreakage NOT called when breakToolsOnFail is off');
});

test('Simple check FAIL with breakToolsOnFail ON: _applyToolBreakage called', async () => {
  const { engine, validator } = setup('simple', true);
  engine._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 4, data: {} });
  const inputs = brewInputs();

  let applyToolBreakageCalled = false;
  const originalApplyToolBreakage = engine._applyToolBreakage;
  engine._applyToolBreakage = async (...args) => {
    applyToolBreakageCalled = true;
    return originalApplyToolBreakage.call(engine, ...args);
  };

  const result = await brew(engine, validator, inputs);

  assert.equal(result.success, false, 'the check failed');
  assert.equal(applyToolBreakageCalled, true, '_applyToolBreakage called when breakToolsOnFail is on');
});

test('Simple check PASS: _applyToolBreakage always called', async () => {
  const { engine, validator } = setup('simple', false);
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: 18, data: {} });
  const inputs = brewInputs();

  let applyToolBreakageCalled = false;
  const originalApplyToolBreakage = engine._applyToolBreakage;
  engine._applyToolBreakage = async (...args) => {
    applyToolBreakageCalled = true;
    return originalApplyToolBreakage.call(engine, ...args);
  };

  const result = await brew(engine, validator, inputs);

  assert.equal(result.success, true, 'the check passed');
  assert.equal(applyToolBreakageCalled, true, '_applyToolBreakage called on success regardless of breakToolsOnFail');
});

test('Simple check FAIL with a FIRED breakTools trigger and breakToolsOnFail OFF: tools do not break', async () => {
  // A matching `checkDriven` trigger only decides the breakage MODE once the gate is open; the
  // `breakToolsOnFail` policy alone decides whether tools are at risk on a failed attempt at all
  // (mirrors `resolveCheckFailure`'s crafting gate and data-models/spec.md requirement 25).
  const { engine, validator } = setup('simple', false, true);
  engine._runCraftingCheck = async () => ({
    success: false,
    outcome: 'fail',
    value: 4,
    data: { total: 4 },
    engineEvaluated: true,
  });
  const inputs = brewInputs();

  let applyToolBreakageCalled = false;
  const originalApplyToolBreakage = engine._applyToolBreakage;
  engine._applyToolBreakage = async (...args) => {
    applyToolBreakageCalled = true;
    return originalApplyToolBreakage.call(engine, ...args);
  };

  const result = await brew(engine, validator, inputs);

  assert.equal(result.success, false, 'the check failed');
  assert.equal(
    applyToolBreakageCalled,
    false,
    'a fired trigger does not force breakage when breakToolsOnFail is off, same as crafting'
  );
});

// Crafting control (non-alchemy): identical trigger + policy setup, proving parity with the
// alchemy assertion above rather than merely asserting alchemy in isolation.

function craftingControlFixture(breakToolsOnFail) {
  const ingredientItem = new FakeItem('ing-1', 'Herb', 2);
  const toolItem = new FakeItem('tool-item-1', 'Tool', 1);
  const ingredientSet = {
    id: 'set-1',
    matchIngredients: (availableItems) => {
      const matched = availableItems.find((item) => item === ingredientItem);
      return matched
        ? [{ item: matched, quantity: 1, ingredient: { quantity: 1, getDescription: () => 'Herb' } }]
        : [];
    },
  };
  const recipe = {
    id: 'recipe-craft-control',
    name: 'Test Recipe',
    craftingSystemId: 'sys-craft-control',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    toolIds: ['tool-1'],
    outcomeRouting: null,
    steps: [],
    transferEffects: false,
    getExecutionSteps: null,
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name };
    },
  };
  const system = {
    id: 'sys-craft-control',
    toolBreakage: { authority: 'checkDriven' },
    craftingCheck: {
      simple: {
        rollFormula: '1d20',
        dc: 15,
        checkBreakage: {
          triggers: [{ id: 'break-on-fail', breakTools: true, condition: { type: 'rollTotal', operator: '<=', value: 10 } }],
        },
      },
      consumption: { breakToolsOnFail },
    },
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 },
  };
  const recipeManager = {
    canCraft: () => ({ canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } }),
    getToolsForSet: () => [{ id: 'lib-tool-1', componentId: 'tool-1' }],
    toolMatchesItem: (_recipe, _tool, item) => item === toolItem,
    ingredientMatchesItem: (_recipe, _ingredient, item) => item === ingredientItem,
  };
  const engine = new CraftingEngine(recipeManager, null, null);
  return { engine, recipe, ingredientItem, toolItem };
}

test('Crafting control: check FAIL with a FIRED breakTools trigger and breakToolsOnFail OFF: tools do not break', async () => {
  const { engine, recipe, ingredientItem, toolItem } = craftingControlFixture(false);
  engine._runCraftingCheck = async () => ({
    success: false,
    outcome: 'fail',
    value: 4,
    data: { total: 4 },
    engineEvaluated: true,
  });

  let applyToolBreakageCalled = false;
  const originalApplyToolBreakage = engine._applyToolBreakage;
  engine._applyToolBreakage = async (...args) => {
    applyToolBreakageCalled = true;
    return originalApplyToolBreakage.call(engine, ...args);
  };

  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem, toolItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };
  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'the check failed');
  assert.equal(
    applyToolBreakageCalled,
    false,
    'crafting also gates trigger-forced breakage behind breakToolsOnFail'
  );
});

// Versioned/Journal path (`executeVersionedStage` -> `_buildVersionedStageOperation`): the
// `apply-tools` effect is only PLANNED when `shouldUseTools` is true, so its presence in the
// committed journal is itself the assertion (module docblock at CraftingEngine.js:1941).

class VersionedRunActor {
  constructor(id, items = []) {
    this.id = id;
    this.uuid = `Actor.${id}`;
    this.isOwner = true;
    this.items = items;
    this.flags = {};
  }
  getFlag(namespace, key) {
    return this.flags?.[namespace]?.[key];
  }
  async setFlag(namespace, key, value) {
    this.flags[namespace] ||= {};
    this.flags[namespace][key] = mergeHistoryFlag(this.flags[namespace][key], value);
    return this;
  }
}

function setupVersionedAlchemy(breakToolsOnFail) {
  const system = {
    id: 'sys-versioned',
    resolutionMode: 'alchemy',
    features: {},
    alchemy: { checkMode: 'simple', consumeOnFail: false, learnOnCraft: false, showAttemptHistoryToPlayers: false },
    craftingCheck: { simple: { rollFormula: '1d20', dc: 15 }, consumption: { breakToolsOnFail } },
    components: [],
  };
  const ingredientSet = { id: 'set-1', matchIngredients: () => [], toJSON() { return { id: this.id }; } };
  const recipe = {
    id: 'recipe-versioned',
    name: 'Versioned Brew',
    craftingSystemId: 'sys-versioned',
    validate: () => ({ valid: true, errors: [] }),
    getExecutionSteps: () => [
      {
        id: 'step-1',
        name: 'Brew',
        ingredientSets: [ingredientSet],
        resultGroups: [],
        toolIds: ['tool-1'],
        timeRequirement: { minutes: 2 },
      },
    ],
  };
  const recipeManager = {
    getRecipe: (id) => (id === recipe.id ? recipe : null),
    canCraft: () => ({ canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } }),
    getToolsForSet: () => [{ id: 'tool-1', name: 'Tool' }],
    toolMatchesItem: (_recipe, _tool, item) => item.id === 'tool-item-1',
    ingredientMatchesItem: () => false,
  };
  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(recipeManager, runManager);
  globalThis.game = {
    user: { id: 'gm' },
    time: { worldTime: 1000 },
    actors: [],
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === 'sys-versioned' ? system : null) }),
      getResolutionModeService: () => null,
      getRecipeVisibilityService: () => ({
        guardCraftStart: () => ({ craftable: true }),
        applyRecipeItemUseOnCraft: async () => {},
        learnRecipeOnCraft: async () => {},
      }),
    },
  };
  return { engine, runManager, recipe };
}

async function runVersionedAlchemyFailure(breakToolsOnFail) {
  const { engine, runManager, recipe } = setupVersionedAlchemy(breakToolsOnFail);
  const actor = new VersionedRunActor('alchemist');
  const source = new VersionedRunActor('source', [{ id: 'tool-item-1', uuid: 'Actor.source.Item.tool-item-1' }]);
  let applyToolBreakageCalled = false;
  engine._applyToolBreakage = async () => {
    applyToolBreakageCalled = true;
    return [];
  };
  engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: `${context.operation}-operation`,
      resolvedCheckResult: { success: false, message: 'Alchemy check failed', outcome: 'fail', value: 4, data: {} },
      activityKind: 'alchemy',
      alchemySubmittedItems: [],
    }),
  });
  const started = await engine.startVersionedRun({
    viewer: game.user,
    actor,
    sourceActors: [source],
    recipeId: recipe.id,
    selectionPlan: { selectedIngredientSetId: 'set-1' },
    executionGrant: 'start-grant',
  });
  assert.equal(started.success, true, 'the versioned run started');
  game.time.worldTime += 120;
  const result = await engine.executeVersionedStage({
    actor,
    componentSourceActors: [source],
    runId: started.runId,
    expectedRevision: runManager.getActiveRun(actor, started.runId).runRevision,
    executionGrant: 'execute-grant',
    requestId: 'execute-request',
  });
  assert.equal(result.success, false, 'the alchemy check failed');
  const history = runManager.getRunHistory(actor)[0];
  const applyToolsEffect = history?.executionJournal?.effects?.find(
    (effect) => effect.effectId === 'apply-tools'
  );
  return { applyToolBreakageCalled, applyToolsEffect };
}

test('Versioned/Journal alchemy simple FAIL with breakToolsOnFail OFF: no apply-tools effect', async () => {
  const { applyToolBreakageCalled, applyToolsEffect } = await runVersionedAlchemyFailure(false);
  assert.equal(applyToolsEffect, undefined, 'no apply-tools effect is journalled when the policy is off');
  assert.equal(applyToolBreakageCalled, false, '_applyToolBreakage is never reached');
});

test('Versioned/Journal alchemy simple FAIL with breakToolsOnFail ON: apply-tools effect applies breakage', async () => {
  const { applyToolBreakageCalled, applyToolsEffect } = await runVersionedAlchemyFailure(true);
  assert.ok(applyToolsEffect, 'the apply-tools effect is journalled when the policy is on');
  assert.equal(applyToolBreakageCalled, true, '_applyToolBreakage runs the breakage decision');
});
