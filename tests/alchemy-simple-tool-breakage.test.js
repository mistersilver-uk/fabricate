/**
 * Alchemy simple-mode tool breakage (issue 2100): verify that a failed simple-mode alchemy
 * check breaks tools only when `breakToolsOnFail` is enabled, the same as crafting.
 * Tests spy on _applyToolBreakage to verify the engine reaches the correct code path.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { SignatureValidator } from '../src/systems/SignatureValidator.js';
import { getItemSourceReferences, getItemMatchUuids } from '../src/utils/sourceUuid.js';
import { toAlchemyRecords } from './helpers/alchemySubmissionRecords.js';

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
    if (!system.craftingCheck.simple) system.craftingCheck.simple = { rollFormula: '1d20', dc: 15 };
    system.craftingCheck.simple.triggers = [
      {
        id: 'break-on-fail',
        name: 'Break on Fail',
        matches: { outcomeId: 'fail' },
        effects: [{ id: 'eff1', breakTools: true }],
      },
    ];
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

test('Simple check FAIL respects only breakToolsOnFail setting and policy, not triggers', async () => {
  // Alchemy simple-mode checks do not currently support trigger-based tool breakage.
  // Tool breakage is gated solely by the `breakToolsOnFail` policy, same as crafting.
  // This test documents the current behavior: forceBreak from triggers does not apply to alchemy simple.
  const { engine, validator } = setup('simple', false, true);
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
  assert.equal(applyToolBreakageCalled, false, 'alchemy simple does not force-break tools via triggers; only breakToolsOnFail setting applies');
});
