/**
 * One iterative crafting world driven through the real Journal command service: the composed
 * crafting operations over a real `CraftingEngine` with a scripted `rollDie`, a real
 * `CraftingRunManager`, and a `FakeActor` holding ore. `take()` sends one `takeAction` command.
 */
import { createJournalCommandsForFabricate } from '../../src/bootstrap/journalOperations.js';
import { Recipe } from '../../src/models/Recipe.js';
import { Tool } from '../../src/models/Tool.js';
import { CraftingEngine } from '../../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../../src/systems/CraftingRunManager.js';
import { ResolutionModeService } from '../../src/systems/ResolutionModeService.js';

import { replicatedAuthorityFixture } from './replicatedJournalAuthority.js';
import { FakeActor } from './run-manager-fakes.js';
import { scriptedRollDie } from './scriptedRollDie.js';

const gte = (counterId, value) => ({ source: 'counter', counterId, op: '>=', value });

/** `heat` ends a step at 4; `fuel` is spent by `stoke`, which a `hammer` roll check also offers. */
export function forgeLibrary() {
  return {
    version: 1,
    counters: [
      { id: 'heat', label: 'Heat', limit: 'none' },
      { id: 'fuel', label: 'Fuel', limit: 'global', min: 0, max: 10 },
    ],
    actions: [
      {
        id: 'stoke',
        label: 'Stoke',
        categories: [],
        usesSession: true,
        availability: { combine: 'all', rules: [] },
        costs: [{ id: 'burn', counterId: 'fuel', amount: '1', needsEnough: true }],
        check: 'none',
        effects: [
          {
            id: 'warm',
            when: { combine: 'all' },
            target: { kind: 'counter', counterId: 'heat' },
            op: 'add',
            amount: '1',
          },
        ],
      },
      {
        id: 'hammer',
        label: 'Hammer',
        categories: [],
        usesSession: true,
        availability: { combine: 'all', rules: [] },
        costs: [],
        check: 'roll',
        effects: [
          {
            id: 'strike',
            when: { combine: 'all', success: true },
            target: { kind: 'counter', counterId: 'heat' },
            op: 'add',
            amount: '1',
          },
        ],
      },
    ],
  };
}

const stepConfig = (extra = {}) => ({
  actions: { mode: 'all', actionIds: [] },
  hiddenCounterIds: [],
  lockedCounterIds: [],
  success: [gte('heat', 4)],
  failure: [{ source: 'counter', counterId: 'fuel', op: '<=', value: 0 }],
  ...extra,
});

const oreSet = (id) => ({
  id,
  name: 'Ore',
  ingredientGroups: [
    {
      id: `${id}-ore`,
      options: [{ quantity: 1, match: { type: 'component', componentId: 'ore' } }],
    },
  ],
});

/** A two-step forge recipe, or a one-step one, each step consuming one ore. */
export function forgeRecipe({ steps = 2, timeRequirement = null, toolIds = [], fuel = 6 } = {}) {
  const groups = (prefix) => [
    {
      id: `${prefix}-fine`,
      name: 'Fine',
      producedWhen: [{ end: 'success', rules: [gte('heat', 6)] }],
      results: [{ id: `${prefix}-fine-r`, componentId: 'blade', quantity: 2 }],
    },
    {
      id: `${prefix}-plain`,
      name: 'Plain',
      producedWhen: [{ end: 'success', rules: [] }],
      results: [{ id: `${prefix}-plain-r`, componentId: 'blade', quantity: 1 }],
    },
    {
      id: `${prefix}-slag`,
      name: 'Slag',
      role: 'failure',
      producedWhen: [{ end: 'failure', rules: [] }],
      results: [{ id: `${prefix}-slag-r`, componentId: 'slag', quantity: 1 }],
    },
  ];
  const counters = [
    { counterId: 'heat', start: 0, visible: true },
    { counterId: 'fuel', start: fuel, visible: true },
  ];
  const step = (index) => ({
    id: `forge-${index}`,
    name: `Forge ${index + 1}`,
    ingredientSets: [oreSet(`set-${index}`)],
    resultGroups: index === steps - 1 ? groups(`s${index}`) : groups(`s${index}`).slice(0, 2),
    toolIds,
    timeRequirement,
    iterative: stepConfig(),
  });
  if (steps === 1) {
    const only = step(0);
    return new Recipe({
      id: 'forge-recipe',
      name: 'Forged Blade',
      craftingSystemId: 'forge',
      metadata: { version: '1.0.0' },
      ingredientSets: only.ingredientSets,
      resultGroups: only.resultGroups,
      toolIds,
      timeRequirement,
      iterative: { counters, step: stepConfig() },
    });
  }
  return new Recipe({
    id: 'forge-recipe',
    name: 'Forged Blade',
    craftingSystemId: 'forge',
    metadata: { version: '1.0.0' },
    iterative: { counters },
    steps: Array.from({ length: steps }, (_, index) => step(index)),
  });
}

/** A routed check rolling a fixed `1d20` whose 10 and up is the `hit` tier. */
export const ROUTED_CHECK = Object.freeze({
  rollFormula: '1d20',
  type: 'fixed',
  fixedOutcomes: [
    { id: 'miss', name: 'Miss', success: false, start: 1, end: 9 },
    { id: 'hit', name: 'Hit', success: true, start: 10, end: 20 },
  ],
  checkBreakage: { triggers: [] },
});

class OreItem {
  constructor(actor, index, componentId = 'ore') {
    this.id = `${componentId}-${index}`;
    this.uuid = `${actor.uuid}.Item.${this.id}`;
    this.name = componentId;
    this.img = 'icons/commodities/metal/ingot-iron.webp';
    this.componentId = componentId;
    this.parent = actor;
    this.documentName = 'Item';
    this.system = { quantity: 1 };
    this._source = { system: { quantity: 1 } };
    this.flags = {};
  }

  getFlag(namespace, key) {
    return this.flags?.[namespace]?.[key];
  }

  async delete() {
    this.parent.items = this.parent.items.filter((entry) => entry !== this);
    return this;
  }

  async update(patch) {
    if ('system.quantity' in patch) {
      this.system.quantity = patch['system.quantity'];
      this._source.system.quantity = patch['system.quantity'];
    }
    return this;
  }

  toObject() {
    return { name: this.name, img: this.img, type: 'loot', system: { ...this.system } };
  }
}

/** A `FakeActor` whose items the engine consumes and awards to. */
export function forgeActor({ ore = 3, tools = [] } = {}) {
  const actor = new FakeActor('Smith', { ownerIds: ['player'] });
  actor.items = [];
  for (let index = 0; index < ore; index += 1) actor.items.push(new OreItem(actor, index));
  for (const componentId of tools) actor.items.push(new OreItem(actor, 0, componentId));
  actor.created = [];
  actor.createEmbeddedDocuments = async (_type, data) => {
    actor.created.push(structuredClone(data));
    const made = data.map((entry, index) => {
      const item = new OreItem(actor, `made-${actor.created.length}-${index}`, 'made');
      Object.assign(item, { name: entry.name, flags: structuredClone(entry.flags ?? {}) });
      item.system = { ...item.system, ...structuredClone(entry.system ?? {}) };
      return item;
    });
    actor.items.push(...made);
    return made;
  };
  actor.getRollData = () => ({ skill: 3 });
  return actor;
}

function forgeSystem({ library, routed, toolBreakage, timeEnabled, tools }) {
  const registered = (id) => ({ id, name: id, registeredItemUuid: `Item.source-${id}` });
  return {
    id: 'forge',
    name: 'Forge',
    resolutionMode: 'iterative',
    features: { chatOutput: true, multiStepRecipes: true, craftingChecks: true },
    requirements: { time: { enabled: timeEnabled } },
    craftingCheck: { routed: structuredClone(routed), consumption: {} },
    components: [
      registered('ore'),
      registered('blade'),
      registered('slag'),
      ...tools.map(registered),
    ],
    tools: tools.map((componentId) => ({
      id: `tool-${componentId}`,
      componentId,
      name: componentId,
    })),
    ...(toolBreakage && { toolBreakage }),
    iterative: library,
  };
}

function recipeManagerFor(world) {
  const tools = () => world.system.tools.map((tool) => Tool.fromJSON({ ...tool }));
  return {
    getRecipe: (id) => (id === world.recipe.id ? world.recipe : null),
    canCraft: () => ({ canCraft: true, missing: { ingredients: [], essences: [], tools: [] } }),
    getToolsForSet: (recipe) => tools().filter((tool) => recipe?.toolIds?.includes(tool.id)),
    toolMatchesItem: (_recipe, tool, item) => item?.componentId === tool?.componentId,
    ingredientMatchesItem: (_recipe, ingredient, item) =>
      item?.componentId === ingredient?.match?.componentId,
  };
}

/** Installs the Foundry edge the engine and command service read, with a counter `randomID`. */
function installGlobals(world) {
  const gm = { id: 'gm', isGM: true };
  const users = new Map([
    ['gm', gm],
    ['player', { id: 'player', isGM: false }],
    ['observer', { id: 'observer', isGM: false }],
  ]);
  let ids = 0;
  const sources = new Map(
    world.system.components.map((component) => [
      component.registeredItemUuid,
      {
        uuid: component.registeredItemUuid,
        documentName: 'Item',
        name: component.id,
        img: 'icons/svg/item-bag.svg',
        toObject: () => ({ name: component.id, type: 'loot', system: { quantity: 1 } }),
      },
    ])
  );
  const game = {
    user: gm,
    users: { activeGM: gm, get: (id) => users.get(id) ?? null },
    socket: { emit: () => {} },
    settings: { get: () => undefined },
    i18n: { localize: (key) => key, format: (key) => key },
    time: { worldTime: 1000 },
    actors: [world.actor],
    fabricate: {
      getCraftingSystemManager: () => world.systems,
      getResolutionModeService: () => world.modes,
      getRecipeVisibilityService: () => world.visibility,
      getCraftingRunManager: () => world.manager,
    },
  };
  const utils = {
    randomID: () => `rid${String(++ids).padStart(4, '0')}`,
    getProperty: (object, path) =>
      String(path)
        .split('.')
        .reduce((value, key) => value?.[key], object),
    setProperty: (object, path, value) => {
      const keys = String(path).split('.');
      let cursor = object;
      for (const key of keys.slice(0, -1)) cursor = cursor[key] ??= {};
      cursor[keys.at(-1)] = value;
      return true;
    },
    deepClone: (value) => structuredClone(value),
  };
  Object.assign(globalThis, {
    game,
    foundry: { utils },
    Hooks: { callAll: () => true, call: () => true },
    ui: { notifications: { info() {}, warn() {}, error() {} } },
    fromUuid: async (uuid) =>
      uuid === world.actor.uuid ? world.actor : (sources.get(uuid) ?? null),
    fromUuidSync: (uuid) => (uuid === world.actor.uuid ? world.actor : null),
    ChatMessage: {
      create: async (data) => {
        world.messages.push(data);
        return data;
      },
      getSpeaker: () => ({ alias: 'Smith' }),
    },
  });
}

/** The roll a routed check evaluates, totalling `world.nextTotal` each time it is rolled. */
function installRoll(world) {
  class Roll {
    total = null;
    dice = [];
    terms = [];

    constructor(formula, data) {
      this.formula = formula;
      this.data = data;
    }

    async evaluate() {
      const total = world.nextTotal;
      this.total = total;
      this.dice = [{ faces: 20, number: 1, total, results: [{ result: total, active: true }] }];
      this.terms = this.dice;
      return this;
    }

    toJSON() {
      return { class: 'Roll', formula: this.formula, total: this.total, terms: [] };
    }

    static fromData(data) {
      return Object.assign(new Roll(data.formula), { total: data.total, dice: [] });
    }

    async toMessage(data, options) {
      world.messages.push({ ...data, rolls: [this], rollOptions: options });
      return data;
    }
  }
  Object.assign(globalThis, { Roll });
}

/**
 * Builds the world. `rolls` scripts the edge die every start formula and effect draws; a checked
 * action's routed check totals `world.nextTotal`.
 */
export function iterativeCommandWorld({
  steps = 2,
  timeRequirement = null,
  timeEnabled = true,
  library = forgeLibrary(),
  routed = ROUTED_CHECK,
  recipe = null,
  ore = 3,
  tools = [],
  toolBreakage = null,
  fuel = 6,
  rolls = [],
} = {}) {
  const toolIds = tools.map((componentId) => `tool-${componentId}`);
  const system = forgeSystem({ library, routed, toolBreakage, timeEnabled, tools });
  const world = {
    system,
    systems: { getSystem: (id) => (id === system.id ? system : null) },
    actor: forgeActor({ ore, tools }),
    recipe: recipe ?? forgeRecipe({ steps, timeRequirement, toolIds, fuel }),
    messages: [],
    nextTotal: 15,
    die: scriptedRollDie(rolls, { fill: 1 }),
    recipeUses: 0,
  };
  world.modes = new ResolutionModeService(world.systems);
  world.visibility = {
    guardCraftStart: () => ({ craftable: true }),
    evaluateRecipeAccess: () => ({ visible: true }),
    getVisibleRecipes: () => [{ recipe: world.recipe }],
    applyRecipeItemUseOnCraft: async () => {
      world.recipeUses += 1;
    },
    learnRecipeOnCraft: async () => {},
  };
  world.manager = new CraftingRunManager();
  installGlobals(world);
  installRoll(world);
  world.recipeManager = recipeManagerFor(world);
  world.engine = new CraftingEngine(
    world.recipeManager,
    world.manager,
    world.modes,
    null,
    null,
    null,
    {
      getCraftingSystem: (id) => world.systems.getSystem(id),
      resolveItemUuid: (uuid) => globalThis.fromUuid(uuid),
      rollDie: world.die.rollDie,
    }
  );
  world.fabricate = {
    craftingEngine: world.engine,
    craftingRunManager: world.manager,
    recipeManager: world.recipeManager,
    craftingSystemManager: world.systems,
    recipeVisibilityService: world.visibility,
  };
  world.authority = replicatedAuthorityFixture().authority;
  world.service = createJournalCommandsForFabricate(world.fabricate, world.authority);
  Object.assign(world, worldCommands(world));
  return world;
}

function worldCommands(world) {
  const run = () => {
    world.manager.invalidateCache(world.actor.id);
    return world.manager.getRun(world.actor, world.runId);
  };
  return {
    run,
    revision: () => run()?.runRevision ?? 0,
    stepState: (index = run()?.currentStepIndex ?? 0) => run()?.steps?.[index]?.iterative,
    flag: () => structuredClone(world.actor.getFlag('fabricate', 'fabricate.craftingRuns')),
    async start(payload = {}) {
      const reply = await world.service.executeJournalRunCommand(
        {
          actorUuid: world.actor.uuid,
          runType: 'crafting',
          runId: '',
          expectedRevision: 0,
          action: 'start',
          payload: {
            recipeId: world.recipe.id,
            selectionPlan: {
              selectedIngredientSetId: world.recipe.getExecutionSteps()[0].ingredientSets[0].id,
            },
            sourceActorUuids: [world.actor.uuid],
            ...payload,
          },
        },
        { interactive: false }
      );
      if (reply?.runId) world.runId = reply.runId;
      return reply;
    },
    begin: () =>
      world.service.executeJournalRunCommand(
        {
          actorUuid: world.actor.uuid,
          runType: 'crafting',
          runId: world.runId,
          expectedRevision: run().runRevision,
          action: 'beginStep',
          payload: { sourceActorUuids: [world.actor.uuid] },
        },
        { interactive: false }
      ),
    take: (actionId, { attemptId, expectedRevision, payload = {}, interactive = false } = {}) =>
      world.service.executeJournalRunCommand(
        {
          actorUuid: world.actor.uuid,
          runType: 'crafting',
          runId: world.runId,
          expectedRevision: expectedRevision ?? run().runRevision,
          action: 'takeAction',
          payload: { actionId, attemptId: attemptId ?? `attempt-${++world.attempts}`, ...payload },
        },
        { interactive }
      ),
    attempts: 0,
  };
}
