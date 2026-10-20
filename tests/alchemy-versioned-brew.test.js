/**
 * A version-1 brew end to end (issue 2574): the authority prepares the start from the canonical
 * submission, the start funds and spends from the submitted units alone, and the execute applies
 * the alchemy tail. Real `IngredientSet`, `RecipeManager.canCraft` and `CraftingRunManager`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { IngredientSet } from '../src/models/IngredientSet.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { stageSelectionInputsComplete } from '../src/systems/stageReadiness.js';
import { resolveAlchemySubmissions } from '../src/utils/alchemySubmissions.js';

import { expandObject } from './helpers/foundryExpandObject.js';
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

/** Every fake actor by uuid, so a refund resolves its recorded source actor as Foundry would. */
const ACTORS = new Map();

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
    ACTORS.set(this.uuid, this);
  }

  getFlag(namespace, key) {
    return this.flags[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this.flags[namespace] ??= {};
    // Foundry dot-expands a written flag, so a UUID-keyed allocation is saved nested.
    this.flags[namespace][key] = mergeHistoryFlag(this.flags[namespace][key], expandObject(value));
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
const essence = (essenceId, amount) => ({
  match: { type: 'essence', essenceId, amount },
  quantity: 1,
});
const tag = (tags, quantity = 1) => ({ match: { type: 'tags', tags }, quantity });

const SUCCESS = {
  id: 'ok',
  name: 'On success',
  results: [{ id: 'r-ok', componentId: 'elixir', quantity: 1 }],
};
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
  const resolutionService = new ResolutionModeService({
    getSystem: (id) => (id === SYS ? system : null),
  });
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
  const foundry = {
    utils: {
      randomID: (() => {
        let id = 0;
        return () => `id-${++id}`;
      })(),
    },
  };
  const fromUuid = async (uuid) => {
    const made = components().find((entry) => entry.registeredItemUuid === uuid);
    return made
      ? { toObject: () => ({ name: made.name, type: 'loot', system: {} }), effects: [] }
      : null;
  };
  const game = {
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
  const fromUuidSync = (uuid) => ACTORS.get(uuid) ?? null;
  Object.assign(globalThis, { foundry, fromUuid, fromUuidSync, game });
  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);
  return { engine, runManager, visibility, system };
}

const item = (id, sourceName, quantity = 1) =>
  new OwnedItem(id, sourceName, `Item.${sourceName}`, quantity);

/**
 * Prepare and start through the engine as the authority does, the start grant holding the
 * prepared context as plain data. Answers the prepared plan and the start reply.
 */
async function startBrew(world, { crafter, source, componentIds = [], records = null }) {
  const submittedItems =
    records ?? resolveAlchemySubmissions([source], components(), componentIds, SYS);
  assert.equal(
    submittedItems.length,
    records?.length ?? componentIds.length,
    'every unit resolves'
  );
  let startContext = null;
  world.engine.installVersionedRunAuthority({
    consumeExecutionGrant: async (_grant, context) =>
      context.operation === 'start'
        ? structuredClone(startContext)
        : { operationId: context.operation },
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
      resolvedCheckResult: {
        outcome: null,
        value: null,
        data: {},
        engineEvaluated: true,
        ...checkResult,
      },
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

  const { prepared, started } = await startBrew(world, {
    crafter,
    source,
    componentIds: ['ember', 'ember'],
  });

  assert.equal(started.success, true, started.message);
  const step = brewRecipe([]).getExecutionSteps()[0];
  const set = world.engine.recipeManager.getRecipe('brew').ingredientSets[0];
  assert.equal(stageSelectionInputsComplete(set, prepared.selectionPlan, step.id), true);
  const saved = world.runManager.getActiveRun(crafter, started.runId).steps[0].selectionPlan;
  assert.equal(Object.hasOwn(saved.ingredientEssenceAllocation.allocation, embers.uuid), false);
  assert.equal(embers.system.quantity, 1, 'exactly the two submitted units are spent');
  assert.equal(started.canExecuteImmediately, true);

  const settled = await executeBrew(world, { crafter, source, started });
  assert.equal(settled.success, true, settled.message);
  assert.equal(settled.createdResultUuids.length, 1, 'the execute creates the result');
  assert.equal(crafter.created[0].name, 'Elixir');
  assert.equal(embers.system.quantity, 1, 'the execute spends nothing more');
});

test('an alternative-option brew records the option the submission satisfies', async () => {
  const world = brewWorld(
    brewRecipe([{ id: 'base', options: [component('salt'), component('herb')] }])
  );
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

  const { prepared, started } = await startBrew(world, {
    crafter,
    source,
    componentIds: ['herb', 'ember'],
  });

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

  const { started } = await startBrew(world, {
    crafter,
    source,
    componentIds: ['herb', 'herb', 'salt'],
  });

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
  assert.equal(started.reason, 'alchemy-submission-unfunded');
  assert.equal(started.message, 'FABRICATE.App.Journal.Reason.AlchemySubmissionUnfunded');
  assert.equal(ember.system.quantity, 3, 'nothing is spent');
  assert.deepEqual(world.runManager.getActiveRuns(crafter), []);
  assert.deepEqual(world.runManager.getRunHistory(crafter), []);
});

/** A one-herb brew started under `options`, ready for its execute. */
async function startedHerbBrew(options = {}, componentIds = ['herb']) {
  const world = brewWorld(
    brewRecipe([{ id: 'base', options: [component('herb')] }], {
      resultGroups: [SUCCESS, FAILURE],
    }),
    options
  );
  const herb = item('herb', 'Herb');
  const salt = item('salt', 'Salt');
  const source = new BrewActor('source', [herb, salt]);
  const crafter = new BrewActor('crafter');
  const { started } = await startBrew(world, { crafter, source, componentIds });
  assert.equal(started.success, true, started.message);
  assert.equal(herb.deleted, true, 'the start spends the bench');
  return { world, crafter, source, started };
}

const SIMPLE = { checkMode: 'simple' };
const FAILED = { success: false, outcome: 'fail', value: 3, message: 'The brew failed' };

test('a passed brew executed later learns the recipe from its system, not from the grant', async () => {
  const brew = await startedHerbBrew();
  const settled = await executeBrew(brew.world, brew);
  assert.equal(settled.success, true, settled.message);
  assert.deepEqual(brew.world.visibility.learned, ['brew']);
  assert.equal(brew.world.visibility.used, 1);
});

test('a matched Simple brew that fails learns, records use and awards the reserved failure group', async () => {
  const brew = await startedHerbBrew({ alchemy: SIMPLE });
  const settled = await executeBrew(brew.world, { ...brew, checkResult: FAILED });
  assert.equal(settled.success, false);
  assert.equal(settled.disposition, 'failed');
  assert.deepEqual(brew.world.visibility.learned, ['brew']);
  assert.equal(brew.world.visibility.used, 1);
  assert.equal(settled.createdResultUuids.length, 1);
  assert.deepEqual(
    brew.crafter.created.map((made) => made.name),
    ['Sludge']
  );
});

test("consumeOnFail false returns a failed Simple brew's start spend over the generic policy", async () => {
  const brew = await startedHerbBrew({
    alchemy: { ...SIMPLE, consumeOnFail: false },
    craftingCheck: { consumption: { consumeIngredientsOnFail: true } },
  });
  await executeBrew(brew.world, { ...brew, checkResult: FAILED });
  const history = brew.world.runManager.getRunHistory(brew.crafter)[0];
  const refund = history.executionJournal.effects.find(
    (effect) => effect.effectId === 'refund-start-consumption'
  );
  assert.ok(refund, 'the refund is journalled');
  assert.equal(refund.receipt.restoredCount, 1);
  assert.deepEqual(
    brew.source.created.map((made) => made.name),
    ['Herb'],
    'the herb returns to the actor it came from'
  );
  assert.deepEqual(
    brew.crafter.created.map((made) => made.name),
    ['Sludge'],
    'the crafter receives only the failure result'
  );
});

const ONE_FAIL_REFUND = {
  alchemy: { ...SIMPLE, consumeOnFail: false },
  craftingCheck: { consumption: { consumeIngredientsOnFail: true } },
};

test('consumeOnFail false also returns the residual units the start spent', async () => {
  const brew = await startedHerbBrew(ONE_FAIL_REFUND, ['herb', 'salt']);
  await executeBrew(brew.world, { ...brew, checkResult: FAILED });
  const history = brew.world.runManager.getRunHistory(brew.crafter)[0];
  const refund = history.executionJournal.effects.find(
    (effect) => effect.effectId === 'refund-start-consumption'
  );
  assert.equal(refund.receipt.restoredCount, 2);
  assert.deepEqual(brew.source.created.map((made) => made.name).sort(), ['Herb', 'Salt']);
});

test('cancelling a started brew returns its residual units as well', async () => {
  const brew = await startedHerbBrew({ alchemy: SIMPLE }, ['herb', 'salt']);
  brew.world.engine.installVersionedRunAuthority({
    consumeExecutionGrant: async () => ({ operationId: 'cancel-operation' }),
  });
  const cancelled = await brew.world.engine.cancelVersionedRun({
    actor: brew.crafter,
    runId: brew.started.runId,
    expectedRevision: brew.world.runManager.getActiveRun(brew.crafter, brew.started.runId)
      .runRevision,
    executionGrant: 'cancel-grant',
    requestId: 'cancel-request',
  });
  assert.equal(cancelled.refunded, true);
  assert.equal(cancelled.restoredCount, 2);
  assert.deepEqual(brew.source.created.map((made) => made.name).sort(), ['Herb', 'Salt']);
});

test('a Tiered brew that fails keeps the generic consumption policy', async () => {
  const brew = await startedHerbBrew({
    alchemy: { checkMode: 'tiered', consumeOnFail: false },
    craftingCheck: { consumption: { consumeIngredientsOnFail: true } },
  });
  await executeBrew(brew.world, { ...brew, checkResult: FAILED });
  const history = brew.world.runManager.getRunHistory(brew.crafter)[0];
  const effects = history.executionJournal.effects.map((effect) => effect.effectId);
  assert.equal(effects.includes('refund-start-consumption'), false);
  assert.equal(brew.crafter.created.length, 0, 'nothing is restored or awarded');
});

test('a resumed journal with a consume-alchemy-extras receipt still hydrates its consumption', () => {
  const { engine } = brewWorld(brewRecipe([]));
  const state = { consumedItems: [], resolvedEssences: null, essenceEnabled: null };
  engine._hydrateVersionedStageState(state, {
    'consume-alchemy-extras': {
      items: [{ actorUuid: 'Actor.source', itemUuid: 'Actor.source.Item.herb', quantity: 1 }],
      resolvedEssences: { fire: 2 },
      essenceEnabled: { fire: true },
    },
  });
  assert.equal(state.consumedItems.length, 1);
  assert.deepEqual(state.resolvedEssences, { fire: 2 });
});

test('an alternative the submission fits but cannot spare is not pinned over one that funds', async () => {
  const world = brewWorld(
    brewRecipe([
      { id: 'greens', options: [tag(['green']), component('salt')] },
      { id: 'base', options: [component('herb')] },
    ])
  );
  const herb = item('herb', 'Herb');
  const salt = item('salt', 'Salt');
  const source = new BrewActor('source', [herb, salt]);
  const crafter = new BrewActor('crafter');

  const { prepared, started } = await startBrew(world, {
    crafter,
    source,
    componentIds: ['herb', 'salt'],
  });

  assert.deepEqual(prepared.selectionPlan.ingredientOptionOverrides, {
    greens: { optionIndex: 1 },
  });
  assert.equal(started.success, true, started.message);
  assert.equal(herb.deleted && salt.deleted, true);
});

test('an essence alternative whose carrier another group claims falls to the option that funds', async () => {
  const world = brewWorld(
    brewRecipe([
      { id: 'core', options: [component('ember')] },
      { id: 'heat', options: [essence('fire', 2), component('herb')] },
    ])
  );
  const ember = item('ember', 'Ember');
  const herb = item('herb', 'Herb');
  const source = new BrewActor('source', [ember, herb]);
  const crafter = new BrewActor('crafter');

  const { prepared, started } = await startBrew(world, {
    crafter,
    source,
    componentIds: ['ember', 'herb'],
  });

  assert.deepEqual(prepared.selectionPlan.ingredientOptionOverrides, { heat: { optionIndex: 1 } });
  assert.equal(started.success, true, started.message);
});

test('an essence-only alternative group the matcher ignores never refuses as an unmade choice', async () => {
  const world = brewWorld(
    brewRecipe([
      { id: 'base', options: [component('herb')] },
      { id: 'heat', options: [essence('fire', 2), essence('frost', 1)] },
    ]),
    { essences: false }
  );
  const herb = item('herb', 'Herb');
  const ember = item('ember', 'Ember');
  const source = new BrewActor('source', [herb, ember]);
  const crafter = new BrewActor('crafter');

  const { started } = await startBrew(world, { crafter, source, componentIds: ['herb', 'ember'] });

  assert.notEqual(started.message, 'Choose the crafting requirements before executing this step.');
  assert.equal(started.success, true, started.message);
  assert.equal(herb.deleted && ember.deleted, true, 'the whole bench is spent');
});

test('a later alternative group is not pinned to a tag the earlier group needs', async () => {
  const world = brewWorld(
    brewRecipe([
      { id: 'a', options: [component('herb')] },
      { id: 'b', options: [tag(['green']), component('salt')] },
    ])
  );
  const herb = item('herb', 'Herb');
  const salt = item('salt', 'Salt');
  const source = new BrewActor('source', [herb, salt]);
  const crafter = new BrewActor('crafter');

  const { prepared, started } = await startBrew(world, {
    crafter,
    source,
    componentIds: ['herb', 'salt'],
  });

  assert.deepEqual(prepared.selectionPlan.ingredientOptionOverrides, { b: { optionIndex: 1 } });
  assert.equal(started.success, true, started.message);
});

for (const [label, quantity] of [
  ['more units than the stack holds', 1],
  ['a stack stored at zero', 0],
]) {
  test(`a submission claiming ${label} is refused with nothing spent`, async () => {
    const world = brewWorld(brewRecipe([{ id: 'base', options: [component('herb')] }]));
    const herbs = item('herbs', 'Herb', quantity);
    const source = new BrewActor('source', [herbs]);
    const crafter = new BrewActor('crafter');
    const records = [
      { item: herbs, componentId: 'herb' },
      { item: herbs, componentId: 'herb' },
    ];

    const { started } = await startBrew(world, { crafter, source, records });

    assert.equal(started.success, false);
    assert.equal(started.message, 'The submitted alchemy ingredients are stale.');
    assert.equal(herbs.system.quantity, quantity, 'nothing is spent');
    assert.deepEqual(world.runManager.getActiveRuns(crafter), []);
  });
}

test('a component and an essence requirement on the same carrier fund from two units', async () => {
  const world = brewWorld(
    brewRecipe([
      { id: 'core', options: [component('ember')] },
      { id: 'heat', options: [essence('fire', 2)] },
    ])
  );
  const embers = item('embers', 'Ember', 3);
  const source = new BrewActor('source', [embers]);
  const crafter = new BrewActor('crafter');

  const { started } = await startBrew(world, { crafter, source, componentIds: ['ember', 'ember'] });

  assert.equal(started.success, true, started.message);
  assert.equal(embers.system.quantity, 1, 'one unit for the component, one for the essence');
  const settled = await executeBrew(world, { crafter, source, started });
  assert.equal(settled.createdResultUuids.length, 1);
});
