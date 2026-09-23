/** One world factory and one flat, ordered effect journal over a real `CraftingEngine.craft()`
 * or `salvage()` call (issue 1701). The journal records no Foundry-getter call count. */
import { CraftingEngine } from '../../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../../src/systems/CraftingRunManager.js';
import { installRoutedCheckEnv } from './routedCheckEngine.js';

const SKIP_KEYS = new Set(['probeRef']);

/**
 * A run record's state at the moment of the call: enough of each step that a reordered or dropped
 * lifecycle write moves the journal, without the whole persisted record.
 */
function runDigest(run) {
  const steps = (run.steps || []).map((step) => {
    const marks = `${step.timeGate ? ' gate' : ''}${step.preparedConsumption ? ' prep' : ''}`;
    const settlement = step.historySettlement
      ? ` ${step.historySettlement.consumption}/${step.historySettlement.awards}`
      : '';
    const counts = `${(step.consumedIngredients || []).length}c/${(step.usedTools || []).length}t/${(step.createdResults || []).length}r`;
    return `${step.status} ${counts}${marks}${settlement}`;
  });
  return `Run:${run.id} ${run.status}@${run.currentStepIndex} [${steps.join(' | ')}]`;
}

/** Compact a value for the journal: probe documents become tags, functions vanish, data recurses. */
function label(value, seen = new Set()) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'function') return 'fn';
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '<cycle>';
  if (typeof value.probeRef === 'string') return value.probeRef;
  if (Array.isArray(value.steps) && 'recipeId' in value) return runDigest(value);
  const next = new Set(seen).add(value);
  if (Array.isArray(value)) return value.map((entry) => label(entry, next));
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined || SKIP_KEYS.has(key)) continue;
    out[key] = label(entry, next);
  }
  return out;
}

/** The journal: `push` appends one `[name, ...args]` effect in call order. */
export function makeJournal() {
  const entries = [];
  return {
    entries,
    push(name, ...args) {
      entries.push([name, ...args.map((arg) => label(arg))]);
    },
  };
}

/** Strip a chat card's markup to its rendered text, so the journal carries what a player reads. */
export function cardText(content) {
  return String(content ?? '')
    .replaceAll(/<[^>]*>/g, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();
}

export class ProbeItem {
  constructor({ id, name, quantity = 1, componentId = null, img = null }) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.img = img ?? `icons/${id}.png`;
    this.componentId = componentId;
    this.parent = null;
    this.system = { quantity };
    this.flags = {};
    this.effects = [];
    this.deleted = false;
    this.probeRef = `Item:${id}`;
    this.journal = null;
  }

  getFlag(scope, key) {
    return String(key)
      .split('.')
      .reduce((value, part) => (value == null ? undefined : value[part]), this.flags[scope]);
  }

  async setFlag(scope, key, value) {
    this.flags[scope] = this.flags[scope] || {};
    const parts = String(key).split('.');
    const last = parts.pop();
    let target = this.flags[scope];
    for (const part of parts) {
      if (!target[part] || typeof target[part] !== 'object') target[part] = {};
      target = target[part];
    }
    target[last] = value;
    this.journal?.push('item.setFlag', this, `${scope}.${key}`, value);
    return value;
  }

  async update(payload) {
    for (const [path, value] of Object.entries(payload)) {
      foundry.utils.setProperty(this, path, value);
    }
    this.journal?.push('item.update', this, payload);
    return this;
  }

  async delete() {
    this.deleted = true;
    this.journal?.push('item.delete', this);
    return this;
  }

  async createEmbeddedDocuments(type, data) {
    if (type === 'ActiveEffect') this.effects.push(...data);
    this.journal?.push(
      'item.createEmbedded',
      this,
      type,
      (data || []).map((entry) => entry?.name ?? null)
    );
    return data;
  }

  toObject() {
    return { name: this.name, img: this.img, type: 'loot', system: { ...this.system } };
  }
}

export class ProbeActor {
  constructor(name, items = []) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.isOwner = true;
    this.items = items;
    for (const item of items) item.parent = this;
    this.system = { currency: { gp: 0, sp: 0 } };
    this.flags = {};
    this.created = [];
    this.probeRef = `Actor:${name}`;
    this.journal = null;
  }

  getFlag(scope, key) {
    return this.flags?.[scope]?.[key];
  }

  async setFlag(scope, key, value) {
    this.flags[scope] = this.flags[scope] || {};
    this.flags[scope][key] = value;
    return this;
  }

  async update(payload) {
    for (const [path, value] of Object.entries(payload)) {
      foundry.utils.setProperty(this, path, value);
    }
    this.journal?.push('actor.update', this, payload);
    return this;
  }

  async createEmbeddedDocuments(type, data) {
    if (type === 'ActiveEffect') {
      this.journal?.push(
        'actor.createEmbedded',
        this,
        type,
        (data || []).map((entry) => entry?.name ?? null)
      );
      return data;
    }
    const created = (data || []).map((entry, index) => {
      const item = new ProbeItem({
        id: `made-${this.created.length + index + 1}`,
        name: entry?.name ?? 'Created',
        quantity: entry?.system?.quantity ?? 1,
        img: entry?.img ?? null,
      });
      item.parent = this;
      item.journal = this.journal;
      item.uuid = `${this.uuid}.Item.${item.id}`;
      item.probeRef = `Item:${item.id}`;
      item.system = { ...item.system, ...(entry?.system || {}) };
      return item;
    });
    this.created.push(...created);
    this.items = [...this.items, ...created];
    this.journal?.push(
      'actor.createEmbedded',
      this,
      type,
      created.map((item) => ({ name: item.name, quantity: item.system.quantity }))
    );
    return created;
  }
}

/**
 * A recording delegator over the real `CraftingRunManager`, so the journal carries every
 * engine-to-manager call and its arguments while the gate record, `durationToSeconds` and the
 * multi-step continuation stay the shipped ones.
 */
export function recordingRunManager(real, journal, onCall) {
  const wrapped = new Map();
  return new Proxy(real, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function' || typeof prop !== 'string') return value;
      if (!wrapped.has(prop)) {
        wrapped.set(prop, (...args) => {
          journal.push(`run.${prop}`, ...args);
          onCall?.(prop);
          return value.apply(target, args);
        });
      }
      return wrapped.get(prop);
    },
  });
}

/**
 * The module-private versioned-execution symbol, read back off the options bag `_routeVersionedCraft`
 * probes. A truthy answer makes that call return before any effect, so the capture mutates nothing.
 */
export async function versionedExecutionKey(engine) {
  const keys = [];
  const probe = new Proxy(
    {},
    {
      get(target, key) {
        if (typeof key === 'symbol') keys.push(key);
        return typeof key === 'symbol' ? {} : Reflect.get(target, key);
      },
    }
  );
  await engine._routeVersionedCraft(null, [], null, null, probe);
  return keys[0] ?? null;
}

/** Install the headless Foundry edge the engine reads, plus recording chat and notification seams. */
export function installProbeEnv(journal, { worldTime = 0, actorAlias = 'Crafter' } = {}) {
  installRoutedCheckEnv();
  // Per-world id sequence: a scenario's journal must not depend on how many scenarios ran first.
  let ids = 0;
  Object.assign(globalThis.foundry.utils, {
    randomID: () => `rid-${(ids += 1)}`,
    getProperty: (object, path) =>
      String(path)
        .split('.')
        .reduce((value, key) => (value == null ? undefined : value[key]), object),
    setProperty: (object, path, value) => {
      const keys = String(path).split('.');
      let cursor = object;
      for (const key of keys.slice(0, -1)) {
        cursor[key] = cursor[key] || {};
        cursor = cursor[key];
      }
      cursor[keys.at(-1)] = value;
      return object;
    },
    deepClone: (value) => JSON.parse(JSON.stringify(value ?? null)),
  });
  globalThis.ui.notifications = {
    info: (message) => journal.push('notify.info', String(message)),
    warn: (message) => journal.push('notify.warn', String(message)),
    error: (message) => journal.push('notify.error', String(message)),
  };
  globalThis.ChatMessage = {
    create(payload) {
      journal.push('chat.create', {
        alias: payload?.speaker?.alias ?? null,
        rolls: payload?.rolls?.length ?? 0,
        text: cardText(payload?.content),
      });
      return Promise.resolve({ id: 'msg' });
    },
    getSpeaker: () => ({ alias: actorAlias }),
  };
  return { worldTime };
}

/** A `RecipeVisibilityService` double: the craft-start guard plus both post-craft writes. */
function visibilityDouble(journal, guard) {
  if (!guard) return null;
  return {
    guardCraftStart(request) {
      journal.push('visibility.guardCraftStart', { recipe: request?.recipe?.id ?? null });
      return guard;
    },
    async applyRecipeItemUseOnCraft(request) {
      journal.push('visibility.applyRecipeItemUseOnCraft', { recipe: request?.recipe?.id ?? null });
    },
    async learnRecipeOnCraft(recipe) {
      journal.push('visibility.learnRecipeOnCraft', { recipe: recipe?.id ?? null });
    },
  };
}

/** An Item Piles afford/deduct seam whose two calls are journalled in the order craft() makes them. */
function itemPilesDouble(journal, itemPiles) {
  if (!itemPiles) return null;
  return {
    isEnabled: () => true,
    async canAfford(actor, currencies) {
      journal.push('itemPiles.canAfford', actor, currencies);
      return itemPiles.afford !== false;
    },
    async deductCurrency(actor, currencies) {
      journal.push('itemPiles.deductCurrency', actor, currencies);
    },
  };
}

/** A coin spender whose every check/spend/refund is journalled against an actor-property balance. */
function coinSpenderDouble(journal, { afford = true } = {}) {
  const balanceOf = (actor, requirement) =>
    Number(foundry.utils.getProperty(actor, requirement?.unit?.actorPath) || 0);
  return {
    readCoins: (actor) => ({ ...(actor?.system?.currency || {}) }),
    check(actor, requirement) {
      journal.push('currency.check', {
        unit: requirement?.unit?.id ?? null,
        amount: requirement?.amount ?? null,
      });
      if (!afford) return { valid: false, message: 'Not enough coin.' };
      return { valid: balanceOf(actor, requirement) >= Number(requirement?.amount || 0) };
    },
    async spend(actor, requirement) {
      journal.push('currency.spend', {
        unit: requirement?.unit?.id ?? null,
        amount: requirement?.amount ?? null,
      });
      await actor.update({
        [requirement.unit.actorPath]: balanceOf(actor, requirement) - Number(requirement.amount),
      });
      return { valid: true };
    },
    async refund(actor, requirement) {
      journal.push('currency.refund', {
        unit: requirement?.unit?.id ?? null,
        amount: requirement?.amount ?? null,
      });
      return { valid: true };
    },
  };
}

/** A `ResolutionModeService` double; by default it awards the step's own authored groups. */
export function probeResolutionService({
  mode = 'simple',
  validateRecipe = { valid: true, errors: [] },
  validateCheckResult = true,
  resolveResultGroups = ({ step }) => ({ groups: step?.resultGroups ?? [], meta: {} }),
  stages = null,
} = {}) {
  return {
    getMode: () => mode,
    getResultSelection: () => ({ provider: 'check' }),
    validateRecipe: () => validateRecipe,
    validateCheckResult: () => validateCheckResult,
    resolveResultGroups,
    ...(stages ? { progressiveStageOccurrences: () => stages } : {}),
  };
}

/**
 * A duck-typed ingredient set that matches owned items by component id. `shortAllocation` models a
 * player essence allocation that funds less than the set asks: honoured, never topped up, so the
 * selection comes back unsuccessful with the unfunded group named.
 */
function probeIngredientSet(id, ingredients, currencySpends, shortAllocation) {
  return {
    id,
    resolveIngredientSelection(availableItems, matcher, options = {}) {
      const plan = [];
      const missingGroups = [];
      for (const definition of ingredients) {
        const ingredient = {
          componentId: definition.componentId,
          systemItemId: definition.componentId,
          quantity: definition.quantity,
          match: { type: 'component', componentId: definition.componentId },
          getDescription: () => `${definition.quantity}x ${definition.componentId}`,
        };
        const item = availableItems.find((candidate) => matcher(ingredient, candidate));
        if (item) plan.push({ item, quantity: definition.quantity, ingredient });
        else missingGroups.push({ ingredient, have: 0, need: definition.quantity });
      }
      const short = shortAllocation && Boolean(options?.essenceAllocation);
      if (short) {
        missingGroups.push({ ingredient: plan[0].ingredient, have: 0, need: plan[0].quantity });
      }
      return {
        success: !short && plan.length === ingredients.length,
        plan,
        currencySpends: currencySpends.map((spend) => ({ ...spend })),
        missingGroups,
      };
    },
  };
}

/**
 * The per-group ingredient option the craftability gate resolves through `optionOverrides` (issue
 * 552): `group.options` is an ordered array of the componentIds that fund each option, exactly the
 * shape `resolveGroupOverride` (`src/models/ingredientAssignment.js:615-621`) reads — a valid
 * integer `optionIndex` in range pins that option; anything else is discarded and the callers walk
 * every option in author order for a stocked one, reporting index 0 only when none is stocked.
 */
function optionGroupShortfall(actors, optionGroups, optionOverrides) {
  const stockedBy = (componentId) =>
    actors.some((actor) => (actor.items || []).some((item) => item.componentId === componentId));
  for (const [groupId, group] of Object.entries(optionGroups)) {
    const options = group.options || [];
    const raw = optionOverrides?.[groupId];
    const idx = Number(raw?.optionIndex);
    const valid = raw && Number.isInteger(idx) && idx >= 0 && idx < options.length;
    const candidates = valid ? [options[idx]] : options;
    if (candidates.some(stockedBy)) continue;
    const componentId = valid ? options[idx] : options[0];
    const ingredient = {
      match: { type: 'component', componentId },
      getDescription: () => `1x ${componentId}`,
    };
    return { ingredients: [{ ingredient, have: 0, need: 1 }], essences: [], tools: [] };
  }
  return null;
}

function probeRecipeManager({ tools = [], canCraft = true, missing = null, optionGroups = null }) {
  return {
    // The satisfiable set is the step's own, so a collapsed chain resolves step 2 against step 2.
    canCraft(actors, executionRecipe, options = {}) {
      const shortfall = optionGroups
        ? optionGroupShortfall(actors, optionGroups, options.optionOverrides)
        : null;
      if (!canCraft || shortfall) {
        return {
          canCraft: false,
          satisfiableSet: null,
          missing: shortfall || missing || { ingredients: [], essences: [], tools: [] },
        };
      }
      return {
        canCraft: true,
        satisfiableSet: executionRecipe?.ingredientSets?.[0] ?? null,
        missing: { ingredients: [], essences: [], tools: [] },
      };
    },
    getToolsForSet: () => tools,
    toolMatchesItem: (_recipe, tool, item) => item?.componentId === tool?.componentId,
    ingredientMatchesItem: (_recipe, ingredient, item) =>
      item?.componentId === (ingredient.componentId || ingredient.systemItemId),
  };
}

const DEFAULT_STEP = Object.freeze({
  ingredients: [{ componentId: 'wood', quantity: 2 }],
  results: [{ componentId: 'plank', quantity: 1 }],
  timeRequirement: null,
});

/** The crafting system the recipe belongs to, with every optional block attached only when spelled. */
function probeSystem(
  {
    systemId = 'sys-probe',
    resolutionMode = 'simple',
    features = {},
    craftingCheck = { enabled: false, consumption: {} },
    tools = [],
    requirements,
    alchemy,
    toolBreakage,
    essenceDefinitions,
  },
  catalogue
) {
  return {
    id: systemId,
    resolutionMode,
    features: { chatOutput: true, ...features },
    craftingCheck,
    components: catalogue,
    tools: tools.map((tool) => ({ id: tool.id, componentId: tool.componentId, name: tool.name })),
    ...(requirements ? { requirements } : {}),
    ...(alchemy ? { alchemy } : {}),
    ...(toolBreakage ? { toolBreakage } : {}),
    ...(essenceDefinitions ? { essenceDefinitions } : {}),
  };
}

/** The recording run manager, plus the one-shot clock tick a scenario arms on a named call. */
function probeRunManager(journal, enabled) {
  const real = enabled ? new CraftingRunManager() : null;
  let armed = null;
  // The world clock can tick at any yield inside one craft, so a scenario arms the tick on a named
  // run-manager call rather than only between calls.
  const tick = (call) => {
    if (!armed || call !== armed.call) return;
    globalThis.game.time.worldTime += armed.seconds;
    journal.push('clock.advance', armed.seconds);
    armed = null;
  };
  return {
    real,
    recording: real ? recordingRunManager(real, journal, tick) : null,
    armClockTick: (call, seconds) => {
      armed = { call, seconds };
    },
  };
}

/** Publish the world the engine reads through `game` and `fromUuid`. */
function installProbeGame({
  system,
  resolutionService,
  visibilityService,
  runManager,
  worldTime,
  documents,
}) {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === system.id ? system : null) }),
      getResolutionModeService: () => resolutionService,
      getRecipeVisibilityService: () => visibilityService,
      getCraftingRunManager: () => runManager,
    },
    i18n: { localize: (key) => key, format: (key) => key },
    user: { id: 'user-probe', isGM: true },
    time: { worldTime },
    actors: [],
  };
  globalThis.fromUuid = async (uuid) =>
    documents.find((document) => document.uuid === uuid) ?? null;
}

/**
 * Build one craft world: the system, recipe, actors, run manager, engine and the seams the journal
 * records. Everything is a named spec field, so a scenario states only what makes it different.
 */
/** The owned items and the two actors every craft reads its inventory from. */
function probeActors(journal, { stock, tools, toolItemsPresent, actorCurrency }) {
  const own = (item) => Object.assign(item, { journal });
  const stockItems = Object.entries(stock).map(([componentId, quantity]) =>
    own(new ProbeItem({ id: componentId, name: componentId, quantity, componentId }))
  );
  const toolItems = (toolItemsPresent ? tools : []).map((tool) =>
    own(
      new ProbeItem({
        id: `tool-${tool.componentId}`,
        name: tool.name,
        componentId: tool.componentId,
      })
    )
  );
  const craftingActor = own(new ProbeActor('Crafter'));
  if (actorCurrency) {
    craftingActor.system.currency = { ...craftingActor.system.currency, ...actorCurrency };
  }
  const sourceActor = own(new ProbeActor('Source', [...stockItems, ...toolItems]));
  return { stockItems, toolItems, craftingActor, sourceActor };
}

/** One ingredient set and one result group per authored step, plus the reserved failure group. */
function probeExecutionSteps({ steps, tools, currencySpends, shortAllocation, failureResults }) {
  const sets = steps.map((step, index) =>
    probeIngredientSet(
      `set-${index + 1}`,
      step.ingredients ?? [],
      index === 0 ? currencySpends : [],
      shortAllocation
    )
  );
  const executionSteps = steps.map((step, index) => ({
    id: `step-${index + 1}`,
    name: `Step ${index + 1}`,
    ingredientSets: [sets[index]],
    resultGroups: [
      {
        id: `rg-${index + 1}`,
        results: (step.results ?? []).map((result, position) => ({
          id: `r-${index + 1}-${position + 1}`,
          ...result,
        })),
      },
    ],
    toolIds: tools.map((tool) => tool.id),
    outcomeRouting: step.outcomeRouting ?? null,
    timeRequirement: step.timeRequirement ?? null,
  }));
  if (failureResults) {
    executionSteps[0].resultGroups.push({
      id: 'rg-failure',
      role: 'failure',
      results: failureResults.map((result, position) => ({ id: `rf-${position + 1}`, ...result })),
    });
  }
  return { sets, executionSteps };
}

/** The system's component list: the authored ones, one registered source per result, and the stock. */
function probeCatalogue(components, executionSteps, ownedItems) {
  const resultSources = new Map();
  const catalogue = [...components];
  for (const step of executionSteps) {
    for (const result of step.resultGroups.flatMap((group) => group.results)) {
      if (!result.componentId || resultSources.has(result.componentId)) continue;
      const source = new ProbeItem({ id: `src-${result.componentId}`, name: result.componentId });
      resultSources.set(result.componentId, source);
      catalogue.push({
        id: result.componentId,
        name: result.componentId,
        registeredItemUuid: source.uuid,
      });
    }
  }
  for (const item of ownedItems) {
    if (!catalogue.some((component) => component.id === item.componentId)) {
      catalogue.push({ id: item.componentId, name: item.name });
    }
  }
  return { catalogue, resultSources };
}

/** The recipe document `craft()` is handed. */
function probeRecipeDocument({
  systemId,
  recipeId,
  recipeName,
  sets,
  executionSteps,
  tools,
  recipeCurrencyCost,
  recipeValid,
  noActiveStep,
}) {
  return {
    id: recipeId,
    name: recipeName,
    craftingSystemId: systemId,
    ingredientSets: [sets[0]],
    resultGroups: executionSteps[0].resultGroups,
    toolIds: tools.map((tool) => tool.id),
    outcomeRouting: executionSteps[0].outcomeRouting,
    resultSelection: null,
    transferEffects: false,
    steps: executionSteps,
    probeRef: `Recipe:${recipeId}`,
    ...(recipeCurrencyCost ? { currencyCost: recipeCurrencyCost } : {}),
    getExecutionSteps: () => (noActiveStep ? [] : executionSteps),
    validate: () =>
      recipeValid ? { valid: true, errors: [] } : { valid: false, errors: ['no result groups'] },
    toJSON: () => ({ id: recipeId, name: recipeName, craftingSystemId: systemId }),
  };
}

/** The engine under test, with the journalled seams and the two post-construction installs. */
function probeEngine(journal, spec, { runManager, coinSpender }) {
  const engine = new CraftingEngine(
    probeRecipeManager(spec),
    runManager,
    spec.resolutionService,
    itemPilesDouble(journal, spec.itemPiles),
    null,
    null,
    coinSpender,
    spec.currencyUnits
      ? {
          currencyConfigStore: {
            get: () => ({
              spendStrategy: 'actorProperty',
              providerId: '',
              macros: {},
              units: spec.currencyUnits,
            }),
          },
        }
      : {}
  );
  if (spec.checkResult) engine._runCraftingCheck = async () => ({ ...spec.checkResult });
  if (spec.complicationDelivery) {
    engine.installComplicationDelivery({
      writer: {
        deliver(request) {
          journal.push('complication.deliver', {
            complications: (request?.complications || []).map(
              (entry) => entry?.complicationId ?? null
            ),
          });
        },
      },
    });
  }
  return engine;
}

/**
 * Build one craft world: the system, recipe, actors, run manager, engine and the seams the journal
 * records. Everything is a named spec field, so a scenario states only what makes it different.
 */
export function craftProbe(spec = {}) {
  const {
    systemId = 'sys-probe',
    steps = [DEFAULT_STEP],
    stock = { wood: 5 },
    tools = [],
    currencySpends = [],
    currencyAfford = true,
    visibilityGuard = { craftable: true },
    recipeId = 'recipe-probe',
    recipeName = 'Probe Recipe',
    recipeCurrencyCost = null,
    recipeValid = true,
    noActiveStep = false,
    toolItemsPresent = true,
    shortAllocation = false,
    failureResults = null,
    actorCurrency = null,
    resolutionService = null,
    worldTime = 0,
    runManager: withRunManager = true,
  } = spec;
  const journal = makeJournal();
  installProbeEnv(journal, { worldTime });

  const { stockItems, toolItems, craftingActor, sourceActor } = probeActors(journal, {
    stock,
    tools,
    toolItemsPresent,
    actorCurrency,
  });
  const { sets, executionSteps } = probeExecutionSteps({
    steps,
    tools,
    currencySpends,
    shortAllocation,
    failureResults,
  });
  const { catalogue, resultSources } = probeCatalogue(spec.components ?? [], executionSteps, [
    ...stockItems,
    ...toolItems,
  ]);

  const system = probeSystem(spec, catalogue);
  const recipe = probeRecipeDocument({
    systemId,
    recipeId,
    recipeName,
    sets,
    executionSteps,
    tools,
    recipeCurrencyCost,
    recipeValid,
    noActiveStep,
  });

  const clock = probeRunManager(journal, withRunManager);
  const visibilityService = visibilityDouble(journal, visibilityGuard);
  installProbeGame({
    system,
    resolutionService,
    visibilityService,
    runManager: clock.recording,
    worldTime,
    documents: [...resultSources.values(), craftingActor, sourceActor],
  });

  const engine = probeEngine(journal, spec, {
    runManager: clock.recording,
    coinSpender: coinSpenderDouble(journal, { afford: currencyAfford }),
  });

  return {
    journal,
    engine,
    system,
    recipe,
    executionSteps,
    craftingActor,
    sourceActor,
    stockItems,
    toolItems,
    runManager: clock.real,
    advanceClock(seconds) {
      globalThis.game.time.worldTime += seconds;
      journal.push('clock.advance', seconds);
    },
    armClockTick: clock.armClockTick,
    async craft(ingredientSetId = null, options = {}) {
      return this.craftWith(craftingActor, [sourceActor], ingredientSetId, options);
    },
    async craftWith(actor, sourceActors, ingredientSetId = null, options = {}) {
      const result = await engine.craft(actor, sourceActors, recipe, ingredientSetId, options);
      journal.push('returned', result);
      return result;
    },
  };
}

/** The system-level currency ladder every currency scenario spends against. */
export const PROBE_CURRENCY_UNITS = Object.freeze([
  Object.freeze({
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  }),
  Object.freeze({
    id: 'sp',
    label: 'Silver',
    abbreviation: 'sp',
    actorPath: 'system.currency.sp',
    contains: [],
  }),
]);

/**
 * Build one salvage world on the same journal, so #1714 inherits a net over `salvage()` before
 * `craft()` moves. No salvage run manager: the observable is consumption, award and card.
 */
export function salvageProbe({
  systemId = 'sys-salvage',
  salvageResolutionMode = 'simple',
  salvageCraftingCheck = {},
  componentId = 'ore',
  componentQuantity = 3,
  ingredientQuantity = 1,
  resultGroups = [],
  awardDifficulty = null,
  worldTime = 0,
} = {}) {
  const journal = makeJournal();
  installProbeEnv(journal, { worldTime, actorAlias: 'Salvager' });

  const sourceItem = Object.assign(
    new ProbeItem({ id: componentId, name: 'Iron Ore', quantity: componentQuantity, componentId }),
    { journal }
  );
  const actor = Object.assign(new ProbeActor('Salvager', [sourceItem]), { journal });
  const awardSource = Object.assign(new ProbeItem({ id: 'src-shard', name: 'Shard' }), { journal });

  const component = {
    id: componentId,
    name: 'Iron Ore',
    img: 'icons/ore.png',
    registeredItemUuid: sourceItem.uuid,
    salvage: { enabled: true, ingredientQuantity, toolIds: [], resultGroups, outcomeRouting: {} },
  };
  const system = {
    id: systemId,
    features: { salvage: true, chatOutput: true },
    salvageResolutionMode,
    salvageCraftingCheck,
    components: [
      component,
      {
        id: 'shard',
        name: 'Shard',
        registeredItemUuid: awardSource.uuid,
        ...(awardDifficulty === null ? {} : { difficulty: awardDifficulty }),
      },
    ],
    tools: [],
  };

  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === systemId ? system : null) }),
      getResolutionModeService: () => null,
      getSalvageRunManager: () => null,
    },
    i18n: { localize: (key) => key, format: (key) => key },
    user: { id: 'user-probe', isGM: true },
    time: { worldTime },
  };
  globalThis.fromUuid = async (uuid) =>
    [actor, sourceItem, awardSource].find((document) => document.uuid === uuid) ?? null;

  const engine = new CraftingEngine({}, null, { validateSalvage: () => ({ valid: true, errors: [] }) });

  return {
    journal,
    engine,
    actor,
    sourceItem,
    async salvage(options = {}) {
      const result = await engine.salvage(actor.uuid, systemId, componentId, options);
      journal.push('returned', { ...result, salvageRun: result.salvageRun ?? null });
      return result;
    },
  };
}
