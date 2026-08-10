/**
 * Issue 1036 — criterion 8/21 END TO END, across the START/FINISH boundary.
 *
 * The behaviour gate's timed-craft half is THREE collaborating sites, and every other
 * test in this change pins them one at a time:
 *
 *  1. `_startTimedStep` builds the snapshot (`_snapshotEssenceEnabled`) and passes it to
 *     `markStepPrepared`;
 *  2. `markStepPrepared`'s literal — a whitelist REBUILD — has to name `essenceEnabled`
 *     or the key is silently dropped;
 *  3. `_finishTimedStep` reads it back (`_resumedEssenceEnabled`) and threads it into
 *     `_createResultItems`.
 *
 * A leaf-by-leaf suite cannot see a break in the WIRING between them, and the failure is
 * silent in the worst direction: drop the key at (1) and `markStepPrepared` stores `{}`,
 * which `_resumedEssenceEnabled` reads as "no snapshot" and answers with an ALL-TRUE map,
 * so a GM who disabled an essence at START gets its property macro AND its effect
 * transfer at FINISH. That is precisely what criterion 8 forbids, and it ships green.
 *
 * So these two tests drive the REAL `craft()` → `_startTimedStep` → persisted actor-flag
 * run → matured `craft()` → `_finishTimedStep` path with a REAL `CraftingRunManager`, and
 * assert the CRAFTED ITEM. Only `_runCraftingCheck` is stubbed.
 *
 * Both flip the live enabled state MID-RUN, in opposite directions, which is what makes
 * them discriminating: the snapshot and the live definition disagree at FINISH, so a
 * FINISH that consulted the live definition — or one that lost the snapshot — produces
 * the opposite item in each.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { getFabricateFlag } from '../src/config/flags.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';

import { installEngineGlobals, makeEssence, makeScriptMacro } from './helpers/essenceFixtures.js';

const SYSTEM_ID = 'sys-timed-gate';
const MACRO_UUID = 'Macro.fire';
const EFFECT_SOURCE_UUID = 'Item.fire-source';
const GATE_SECONDS = 3600;

installEngineGlobals();

// ---------------------------------------------------------------------------
// Fakes — an actor whose run flag really round-trips, and items that really vanish
// ---------------------------------------------------------------------------

class FakeItem {
  constructor(id, name, quantity = 1, essences = null) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.img = `icons/${id}.png`;
    this.parent = null;
    this.system = { quantity };
    this.effects = [];
    this._essences = essences;
  }
  getFlag(_namespace, key) {
    return String(key).endsWith('essences') ? this._essences : null;
  }
  async delete() {
    this.deleted = true;
    if (this.parent) this.parent.items = this.parent.items.filter((item) => item !== this);
  }
  async update(payload) {
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
  }
  toObject() {
    return { name: this.name, img: this.img, type: 'loot', system: { ...this.system }, flags: {} };
  }
}

class FakeActor {
  constructor(name, items = []) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.items = items;
    for (const item of items) item.parent = this;
    this._flags = {};
    this.createdItems = [];
  }
  getFlag(namespace, key) {
    return this._flags?.[namespace]?.[key];
  }
  async setFlag(namespace, key, value) {
    // The run container round-trips through JSON so no test can accidentally share a live
    // object reference between START and FINISH — persistence is the whole point here.
    this._flags[namespace] = this._flags[namespace] || {};
    this._flags[namespace][key] = JSON.parse(JSON.stringify(value));
    return value;
  }
  async createEmbeddedDocuments(type, data) {
    if (type === 'ActiveEffect') return data;
    const created = data.map((entry, index) => {
      const item = new FakeItem(`created-${this.createdItems.length + index}`, entry.name, 1);
      item.parent = this;
      item.data = entry;
      item.effects = [];
      item.createEmbeddedDocuments = async (_type, effects) => {
        item.effects.push(...effects);
        return effects;
      };
      return item;
    });
    this.createdItems.push(...created);
    return created;
  }
}

// ---------------------------------------------------------------------------
// The system, the recipe, and the world
// ---------------------------------------------------------------------------

function buildSystem(fireEnabled) {
  return {
    id: SYSTEM_ID,
    resolutionMode: 'simple',
    features: {
      essences: true,
      propertyMacros: true,
      effectTransfer: true,
      craftingChecks: false,
      multiStepRecipes: false,
    },
    craftingCheck: { enabled: false, consumption: {} },
    components: [
      { id: 'herb', name: 'Herb' },
      { id: 'elixir', name: 'Elixir' },
    ],
    essenceDefinitions: [
      makeEssence({
        id: 'fire',
        enabled: fireEnabled,
        propertyMacroUuid: MACRO_UUID,
        sourceItemUuid: EFFECT_SOURCE_UUID,
      }),
    ],
  };
}

function buildIngredientSet() {
  return {
    id: 'set-1',
    resolveIngredientSelection(availableItems, matcher) {
      const ingredient = {
        componentId: 'herb',
        systemItemId: 'herb',
        quantity: 1,
        match: { type: 'component', componentId: 'herb' },
        getDescription: () => '1x Herb',
      };
      const item = availableItems.find((candidate) => matcher(ingredient, candidate));
      return {
        success: Boolean(item),
        plan: item ? [{ item, quantity: 1, ingredient }] : [],
        currencySpends: [],
        missingGroups: [],
      };
    },
  };
}

function buildRecipe(ingredientSet) {
  const resultGroups = [
    { id: 'rg-1', results: [{ id: 'r-1', componentId: 'elixir', quantity: 1 }] },
  ];
  const step = {
    id: 'implicit-step',
    name: 'Steep',
    ingredientSets: [ingredientSet],
    resultGroups,
    toolIds: [],
    outcomeRouting: null,
    timeRequirement: { hours: 1 },
  };
  return {
    id: 'recipe-steep',
    name: 'Steeped Elixir',
    craftingSystemId: SYSTEM_ID,
    ingredientSets: [ingredientSet],
    resultGroups,
    toolIds: [],
    outcomeRouting: null,
    resultSelection: null,
    // Both essence-carried behaviours must be reachable, so the recipe transfers effects.
    transferEffects: true,
    getExecutionSteps: () => [step],
    validate: () => ({ valid: true, errors: [] }),
    toJSON() {
      return { id: this.id, name: this.name, craftingSystemId: this.craftingSystemId };
    },
  };
}

function buildRecipeManager(ingredientSet) {
  return {
    canCraft: () => ({
      canCraft: true,
      satisfiableSet: ingredientSet,
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    getToolsForSet: () => [],
    toolMatchesItem: () => false,
    ingredientMatchesItem: (_recipe, ingredient, item) =>
      item.id === (ingredient.componentId || ingredient.systemItemId),
  };
}

function setupWorld(system) {
  const systemManager = { getSystem: (id) => (id === system.id ? system : null) };
  globalThis.game = {
    user: { id: 'user-1', isGM: true },
    time: { worldTime: 1000 },
    actors: [],
    fabricate: { getCraftingSystemManager: () => systemManager },
  };
  globalThis.fromUuid = async (uuid) => {
    if (uuid === MACRO_UUID) return makeScriptMacro('return { "system.school": "fire" };');
    if (uuid === EFFECT_SOURCE_UUID) {
      return {
        uuid: EFFECT_SOURCE_UUID,
        effects: [{ toObject: () => ({ name: 'Burning', changes: [] }) }],
      };
    }
    return null;
  };
}

/**
 * Arm a timed craft, flip the essence's LIVE enabled state while the gate matures, then
 * mature it and finish.
 *
 * @param {{enabledAtStart: boolean, enabledAtFinish: boolean}} timeline
 */
async function runTimedCraft({ enabledAtStart, enabledAtFinish }) {
  const system = buildSystem(enabledAtStart);
  setupWorld(system);

  const ingredientSet = buildIngredientSet();
  const recipe = buildRecipe(ingredientSet);
  const herb = new FakeItem('herb', 'Herb', 5, { fire: 2 });
  const crafter = new FakeActor('Crafter');
  const source = new FakeActor('Source', [herb]);

  const runManager = new CraftingRunManager();
  const engine = new CraftingEngine(buildRecipeManager(ingredientSet), runManager, null);
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  const started = await engine.craft(crafter, [source], recipe, null, {});
  assert.equal(started.disposition, 'timed-start', 'the gate really was armed');
  assert.equal(herb.system.quantity, 4, 'and the ingredient really was consumed at START');

  const runId = runManager.getActiveRuns(crafter)[0].id;
  // Read the FLAG, not the manager's in-memory cache: the whole point of the snapshot is
  // that it survives `markStepPrepared`'s whitelist rebuild and the actor-flag round trip.
  const persisted = getFabricateFlag(crafter, 'craftingRuns');

  // The GM toggles the essence WHILE the gate counts down.
  system.essenceDefinitions[0].enabled = enabledAtFinish;
  game.time.worldTime = 1000 + GATE_SECONDS;

  const finished = await engine.craft(crafter, [source], recipe, null, { runId });
  assert.equal(finished.success, true, finished.message);
  assert.equal(crafter.createdItems.length, 1, 'the matured craft produced its result');

  return { created: crafter.createdItems[0], persisted, runId };
}

/** The `essenceEnabled` map as it survived the actor-flag round trip. */
function persistedSnapshot(persisted, runId) {
  return persisted?.active?.[runId]?.steps?.[0]?.preparedConsumption?.essenceEnabled;
}

// ---------------------------------------------------------------------------

test('1036/8 END TO END: an essence disabled at START carries NOTHING at FINISH, even after a re-enable', async () => {
  const { created, persisted, runId } = await runTimedCraft({
    enabledAtStart: false,
    enabledAtFinish: true,
  });

  assert.deepEqual(
    persistedSnapshot(persisted, runId),
    { fire: false },
    'the START snapshot reached the persisted run — a dropped key would read back as all-enabled'
  );
  assert.equal(
    created.data.system?.school,
    undefined,
    'the crafted item carries NO essence property-macro mutation'
  );
  assert.equal(
    created.effects.length,
    0,
    'and no active effect was transferred from the essence source'
  );
});

test('1036/8 END TO END: an essence disabled AFTER START still carries its behaviour at FINISH', async () => {
  const { created, persisted, runId } = await runTimedCraft({
    enabledAtStart: true,
    enabledAtFinish: false,
  });

  assert.deepEqual(
    persistedSnapshot(persisted, runId),
    { fire: true },
    'the snapshot is COMPLETE — every contributing essence, not only the disabled ones'
  );
  assert.equal(
    created.data.system.school,
    'fire',
    'a mid-run disable cannot change the outcome of a craft whose inputs are already gone'
  );
  assert.equal(created.effects.length, 1, 'the active effect transferred, as it did at START');
});
