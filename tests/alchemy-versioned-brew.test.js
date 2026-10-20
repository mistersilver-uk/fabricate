/**
 * A version-1 brew end to end (issue 2574): the authority prepares the start from the canonical
 * submission, the start funds and spends from the submitted units alone, and the execute applies
 * the alchemy tail. Real `IngredientSet`, `RecipeManager.canCraft` and `CraftingRunManager`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { IngredientSet } from '../src/models/IngredientSet.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { stageSelectionInputsComplete } from '../src/systems/stageReadiness.js';
import { resolveAlchemySubmissions } from '../src/utils/alchemySubmissions.js';
import { mergeHistoryFlag } from './helpers/journal-fixtures.js';

const SYS = 'brew-sys';

class OwnedItem {
  constructor(id, name, sourceUuid, quantity) {
    this._id = id;
    this._parent = null;
    this.name = name;
    this.type = 'loot';
    this._stats = { compendiumSource: sourceUuid };
    this.system = { quantity };
    this.flags = {};
    this.deleted = false;
  }

  get id() {
    return this._id;
  }

  get uuid() {
    return `${this._parent?.uuid}.Item.${this._id}`;
  }

  get parent() {
    return this._parent;
  }

  async delete() {
    this.deleted = true;
    this._parent.items = this._parent.items.filter((item) => item !== this);
    return this;
  }

  async update(payload) {
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
    return this;
  }
}

class BrewActor {
  constructor(id, items = []) {
    this.id = id;
    this.uuid = `Actor.${id}`;
    this.name = id;
    this.isOwner = true;
    this.items = items;
    for (const item of items) item._parent = this;
    this.flags = {};
    this.created = [];
  }

  getFlag(namespace, key) {
    return this.flags[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.flags[namespace] ??= {};
    this.flags[namespace][key] = mergeHistoryFlag(this.flags[namespace][key], value);
    return this;
  }

  async createEmbeddedDocuments(_type, data) {
    const made = data.map((entry, index) => {
      const item = new OwnedItem(`made-${this.created.length + index}`, entry.name, null, 1);
      item._parent = this;
      item.system = structuredClone(entry.system ?? {});
      item._source = structuredClone(entry);
      return item;
    });
    this.created.push(...made);
    return made;
  }
}

function components() {
  return [
    { id: 'herb', name: 'Herb', registeredItemUuid: 'Item.Herb', tags: ['green'] },
    { id: 'moss', name: 'Moss', registeredItemUuid: 'Item.Moss', tags: ['green'] },
    { id: 'ember', name: 'Ember', registeredItemUuid: 'Item.Ember', essences: { fire: 2 } },
    { id: 'salt', name: 'Salt', registeredItemUuid: 'Item.Salt' },
    { id: 'elixir', name: 'Elixir', registeredItemUuid: 'Item.Elixir' },
    { id: 'sludge', name: 'Sludge', registeredItemUuid: 'Item.Sludge' },
  ];
}

const component = (componentId, quantity = 1) => ({
  match: { type: 'component', componentId },
  quantity,
});
const essence = (essenceId, amount) => ({ match: { type: 'essence', essenceId, amount }, quantity: 1 });
const tag = (tags, quantity = 1) => ({ match: { type: 'tags', tags }, quantity });

const SUCCESS = { id: 'ok', name: 'On success', results: [{ id: 'r-ok', componentId: 'elixir', quantity: 1 }] };
const FAILURE = {
  id: 'fail',
  name: 'On a failed check',
  role: 'failure',
  results: [{ id: 'r-fail', componentId: 'sludge', quantity: 1 }],
};

function brewRecipe(ingredientGroups, { resultGroups = [SUCCESS], timeRequirement = null } = {}) {
  const set = new IngredientSet({ id: 'brew-set', ingredientGroups });
  return {
    id: 'brew',
    name: 'Brew',
    enabled: true,
    craftingSystemId: SYS,
    ingredientSets: [set],
    resultGroups,
    toolIds: [],
    validate: () => ({ valid: true, errors: [] }),
    getExecutionSteps() {
      return [
        {
          id: 'implicit-step',
          name: 'Step 1',
          ingredientSets: this.ingredientSets,
          resultGroups: this.resultGroups,
          toolIds: [],
          timeRequirement,
        },
      ];
    },
  };
}

/** A world with one alchemy recipe; `alchemy` and `craftingCheck` override the system's. */
function brewWorld(recipe, { alchemy = {}, craftingCheck = {}, essences = true } = {}) {
  const system = {
    id: SYS,
    resolutionMode: 'alchemy',
    features: { essences },
    alchemy: { checkMode: 'none', learnOnCraft: true, consumeOnFail: true, ...alchemy },
    craftingCheck,
    components: components(),
  };
  const resolutionService = new ResolutionModeService({ getSystem: (id) => (id === SYS ? system : null) });
  const recipeManager = new RecipeManager();
  recipeManager.getRecipes = () => [recipe];
  recipeManager.getRecipe = (id) => (id === recipe.id ? recipe : null);
  const runManager = new CraftingRunManager();
  const visibility = {
    learned: [],
    used: 0,
    guardCraftStart: () => ({ craftable: false }),
    async applyRecipeItemUseOnCraft() {
      this.used += 1;
    },
    async learnRecipeOnCraft(learned) {
      this.learned.push(learned.id);
    },
  };
  globalThis.foundry = { utils: { randomID: (() => { let id = 0; return () => `id-${++id}`; })() } };
  globalThis.fromUuid = async (uuid) => {
    const made = components().find((entry) => entry.registeredItemUuid === uuid);
    return made ? { toObject: () => ({ name: made.name, type: 'loot', system: {} }), effects: [] } : null;
  };
  globalThis.game = {
    user: { id: 'gm', isGM: true },
    time: { worldTime: 1000 },
    actors: [],
    i18n: { localize: (key) => key },
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === SYS ? system : null) }),
      getResolutionModeService: () => resolutionService,
      getRecipeManager: () => recipeManager,
      getRecipeVisibilityService: () => visibility,
      getCraftingRunManager: () => runManager,
    },
  };
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);
  return { engine, runManager, visibility, system };
}

const item = (id, sourceName, quantity = 1) => new OwnedItem(id, sourceName, `Item.${sourceName}`, quantity);

/**
 * Prepare and start through the engine as the authority does, the start grant holding the
 * prepared context as plain data. Answers the prepared plan and the start reply.
 */
async function startBrew(world, { crafter, source, componentIds = [], records = null }) {
  const submittedItems =
    records ?? resolveAlchemySubmissions([source], components(), componentIds, SYS);
  assert.equal(submittedItems.length, records?.length ?? componentIds.length, 'every unit resolves');
  let startContext = null;
  world.engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) =>
      context.operation === 'start' ? structuredClone(startContext) : { operationId: context.operation },
  });
  const prepared = await world.engine.prepareVersionedAlchemyStart({
    actor: crafter,
    sourceActors: [source],
    craftingSystemId: SYS,
    submittedItems,
    executionGrant: 'prepare-grant',
    requestId: 'prepare-request',
  });
  assert.equal(prepared.matched, true, 'the submission matches the recipe');
  startContext = { operationId: 'start-operation', ...prepared };
  const started = await world.engine.startVersionedRun({
    viewer: game.user,
    actor: crafter,
    sourceActors: [source],
    recipeId: prepared.recipeId,
    selectionPlan: prepared.selectionPlan,
    executionGrant: 'start-grant',
    requestId: 'start-request',
  });
  return { prepared, started };
}

/** Execute the started stage with `checkResult` as the validated result. */
async function executeBrew(world, { crafter, source, started, checkResult = { success: true } }) {
  world.engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) => ({
      operationId: `${context.operation}-operation`,
      resolvedCheckResult: { outcome: null, value: null, data: {}, engineEvaluated: true, ...checkResult },
    }),
  });
  return world.engine.executeVersionedStage({
    actor: crafter,
    componentSourceActors: [source],
    runId: started.runId,
    expectedRevision: world.runManager.getActiveRun(crafter, started.runId).runRevision,
    executionGrant: 'execute-grant',
    requestId: 'execute-request',
  });
}

test('an essence-signature brew starts with a complete saved plan and executes its result', async () => {
  const world = brewWorld(brewRecipe([{ id: 'heat', options: [essence('fire', 4)] }]));
  const embers = item('embers', 'Ember', 3);
  const source = new BrewActor('source', [embers]);
  const crafter = new BrewActor('crafter');

  const { started } = await startBrew(world, { crafter, source, componentIds: ['ember', 'ember'] });

  assert.equal(started.success, true, started.message);
  const run = world.runManager.getActiveRun(crafter, started.runId);
  const step = brewRecipe([]).getExecutionSteps()[0];
  const set = world.engine.recipeManager.getRecipe('brew').ingredientSets[0];
  assert.equal(stageSelectionInputsComplete(set, run.steps[0].selectionPlan, step.id), true);
  assert.equal(embers.system.quantity, 1, 'exactly the two submitted units are spent');
  assert.equal(started.canExecuteImmediately, true);

  const settled = await executeBrew(world, { crafter, source, started });
  assert.equal(settled.success, true, settled.message);
  assert.equal(settled.createdResultUuids.length, 1, 'the execute creates the result');
  assert.equal(crafter.created[0].name, 'Elixir');
  assert.equal(embers.system.quantity, 1, 'the execute spends nothing more');
});

test('an alternative-option brew records the option the submission satisfies', async () => {
  const world = brewWorld(brewRecipe([{ id: 'base', options: [component('salt'), component('herb')] }]));
  const herb = item('herb', 'Herb');
  const salt = item('salt', 'Salt');
  const source = new BrewActor('source', [salt, herb]);
  const crafter = new BrewActor('crafter');

  const { prepared, started } = await startBrew(world, { crafter, source, componentIds: ['herb'] });

  assert.deepEqual(prepared.selectionPlan.ingredientOptionOverrides, { base: { optionIndex: 1 } });
  assert.equal(started.success, true, started.message);
  assert.equal(herb.deleted, true, 'the submitted herb is spent');
  assert.equal(salt.deleted, false, 'the held, unsubmitted alternative is untouched');
});

test('a brew draws from the submitted stack, not another stack of the same component', async () => {
  const world = brewWorld(brewRecipe([{ id: 'base', options: [component('herb')] }]));
  const held = item('held-herb', 'Herb', 4);
  const submitted = item('submitted-herb', 'Herb', 2);
  const source = new BrewActor('source', [held, submitted]);
  const crafter = new BrewActor('crafter');
  const records = [{ item: submitted, componentId: 'herb' }];

  const { started } = await startBrew(world, { crafter, source, records });

  assert.equal(started.success, true, started.message);
  assert.equal(submitted.system.quantity, 1, 'one unit of the submitted stack is spent');
  assert.equal(held.system.quantity, 4, 'the unsubmitted stack is untouched');
});

test('a mixed component and essence brew spends the component and the essence carriers', async () => {
  const world = brewWorld(
    brewRecipe([
      { id: 'base', options: [component('herb')] },
      { id: 'heat', options: [essence('fire', 2)] },
    ])
  );
  const herb = item('herb', 'Herb');
  const ember = item('ember', 'Ember', 2);
  const source = new BrewActor('source', [herb, ember]);
  const crafter = new BrewActor('crafter');

  const { prepared, started } = await startBrew(world, { crafter, source, componentIds: ['herb', 'ember'] });

  assert.deepEqual(prepared.selectionPlan.ingredientEssenceAllocation, {
    stepId: 'implicit-step',
    ingredientSetId: 'brew-set',
    allocation: { [ember.uuid]: 1 },
  });
  assert.equal(started.success, true, started.message);
  assert.equal(herb.deleted, true);
  assert.equal(ember.system.quantity, 1, 'one carrier unit funds the essence');
});

test('a tag brew draws the submitted item, not a held alternative carrying the tag', async () => {
  const world = brewWorld(brewRecipe([{ id: 'greens', options: [tag(['green'])] }]));
  const moss = item('moss', 'Moss');
  const herb = item('herb', 'Herb');
  const source = new BrewActor('source', [moss, herb]);
  const crafter = new BrewActor('crafter');

  const { started } = await startBrew(world, { crafter, source, componentIds: ['herb'] });

  assert.equal(started.success, true, started.message);
  assert.equal(herb.deleted, true, 'the submitted tag carrier is spent');
  assert.equal(moss.deleted, false, 'the held alternative is untouched');
});

test('the start also spends every submitted unit the plan does not draw', async () => {
  const world = brewWorld(brewRecipe([{ id: 'base', options: [component('herb')] }]));
  const herbs = item('herbs', 'Herb', 5);
  const salt = item('salt', 'Salt');
  const source = new BrewActor('source', [herbs, salt]);
  const crafter = new BrewActor('crafter');

  const { started } = await startBrew(world, { crafter, source, componentIds: ['herb', 'herb', 'salt'] });

  assert.equal(started.success, true, started.message);
  assert.equal(herbs.system.quantity, 3, 'the extra unit of the signature component is spent');
  assert.equal(salt.deleted, true, 'the surplus component is spent');
  const run = world.runManager.getActiveRun(crafter, started.runId);
  const spent = run.steps[0].preparedConsumption.consumedSummary;
  assert.deepEqual(
    spent.map((entry) => [entry.itemUuid, entry.quantity, entry.componentId]),
    [
      [herbs.uuid, 1, 'herb'],
      [herbs.uuid, 1, 'herb'],
      [salt.uuid, 1, 'salt'],
    ]
  );
});

test('a matched brew the submission cannot fund is refused with nothing spent and no run', async () => {
  const world = brewWorld(
    brewRecipe([
      { id: 'base', options: [component('ember')] },
      { id: 'heat', options: [essence('fire', 2)] },
    ])
  );
  const ember = item('ember', 'Ember', 3);
  const source = new BrewActor('source', [ember]);
  const crafter = new BrewActor('crafter');

  const { started } = await startBrew(world, { crafter, source, componentIds: ['ember'] });

  assert.equal(started.success, false);
  assert.equal(started.message, 'The submitted ingredients cannot fund this brew.');
  assert.equal(ember.system.quantity, 3, 'nothing is spent');
  assert.deepEqual(world.runManager.getActiveRuns(crafter), []);
  assert.deepEqual(world.runManager.getRunHistory(crafter), []);
});
