/**
 * Alchemy check-mode INTEGRATION tests (issue 554): drive `craftAlchemy` → the REAL
 * `craft()` pipeline with REALISTIC owned/duplicate-source items (uuid ≠ component
 * source ref; provenance in `_stats.duplicateSource`, matching `alchemy-mode.test.js`)
 * and a REAL `ResolutionModeService`. Only `_runCraftingCheck` is stubbed (to force a
 * pass/fail/tier without a live dice engine); `_resolveAlchemyResultGroups` and
 * `_createResultItems` run for real, so these prove that:
 *   - a matched Simple recipe with a FAILING check does NOT hit the `results:null`
 *     fizzle short-circuit — it routes into the failure path, consumes, produces the
 *     reserved failure group via the REAL `_createResultItems`, LEARNS the recipe, and
 *     returns `disposition: 'produced-on-failure'`;
 *   - Simple PASS, None (always-success), and Tiered-success each produce REAL items.
 *
 * Reverting the `craft()` failure-routing wiring makes the Simple-FAIL test fail (the
 * fizzle path returns `results:null`, no `produced-on-failure`, and no learn).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { RecipeVisibilityService } from '../src/systems/RecipeVisibilityService.js';
import { SignatureValidator } from '../src/systems/SignatureValidator.js';
import { getItemSourceReferences, getItemMatchUuids } from '../src/utils/sourceUuid.js';
import { toAlchemyRecords } from './helpers/alchemySubmissionRecords.js';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Fakes (realistic owned item: uuid differs from the component source ref)
// ---------------------------------------------------------------------------

class FakeItem {
  constructor(id, name, quantity, duplicateSource) {
    this.id = id;
    this.uuid = `Item.${id}`;
    this.name = name;
    this.parent = null;
    this.system = { quantity };
    // Provenance points at the component's compendium source, NOT the item uuid.
    this._stats = { duplicateSource: duplicateSource };
    this.flags = {};
    this._deleted = false;
    this._updates = [];
  }
  async delete() {
    this._deleted = true;
  }
  async update(payload) {
    this._updates.push({ ...payload });
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
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
      return item;
    });
    this.created.push(...made);
    return made;
  }
}

// A result source item resolved via fromUuid; toObject() feeds _createSingleResult.
function sourceItemFor(name) {
  return {
    toObject: () => ({ name, img: `icons/${name}.webp`, type: 'consumable', system: {} }),
    effects: [],
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

// A single-ingredient-set alchemy recipe with `resultGroups` (the second, role:'failure'
// group is included only when `failureResults` is provided).
function alchemyRecipe(resultGroups) {
  const set = {
    id: 'brew-set',
    essences: {},
    ingredientGroups: [
      { id: 'g1', options: [{ match: { type: 'component', componentId: 'emberroot' }, componentId: 'emberroot', quantity: 1 }] },
    ],
    // Duck-typed craft-plan matcher (mirrors the back-compat matchIngredients path):
    // one plan entry per group, matching the first source-ref-matching owned item.
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
    resultGroups,
    toolIds: [],
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
          toolIds: [],
          timeRequirement: null,
          outcomeRouting: null,
          resultSelection: null,
        },
      ];
    },
  };
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

function setup({ checkMode, resultGroups, learnOnCraft = true, consumeOnFail = true, routed = null, chatOutput = false }) {
  const comps = components();
  const recipe = alchemyRecipe(resultGroups);
  const system = {
    id: 'sys-a',
    resolutionMode: 'alchemy',
    features: { essences: false, chatOutput },
    alchemy: { checkMode, learnOnCraft, consumeOnFail, showAttemptHistoryToPlayers: false },
    craftingCheck: routed ? { routed } : {},
    components: comps,
    managedItems: comps,
  };
  const resolutionService = new ResolutionModeService({ getSystem: (id) => (id === 'sys-a' ? system : null) });
  const recipeManager = {
    getRecipes: () => [recipe],
    canCraft(_actors, execRecipe) {
      return { canCraft: true, satisfiableSet: execRecipe.ingredientSets[0], missing: { ingredients: [], essences: [], tools: [] } };
    },
    getToolsForSet: () => [],
    ingredientMatchesItem: makeMatcher(comps),
  };
  const visibility = {
    learned: [],
    itemUse: 0,
    guardCraftStart: () => ({ craftable: true }),
    async applyRecipeItemUseOnCraft() {
      this.itemUse += 1;
    },
    async learnRecipeOnCraft(r) {
      if (system.alchemy?.learnOnCraft !== true) return; // mirror the real gate
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
    getComponentsForSystem: () => comps,
  });
  return { engine, system, recipe, visibility, validator };
}

// One brew: an owned emberroot item + a matching submission (workbench expands the
// stack into one submission per unit; the submission shares the owned item's uuid).
function brewInputs() {
  const owned = new FakeItem('owned-emberroot', 'Emberroot', 1, EMBER_SRC);
  const actor = new FakeActor('src', [owned]);
  const crafter = new FakeActor('pc');
  const submitted = [{ uuid: owned.uuid, name: 'Emberroot', _stats: { duplicateSource: EMBER_SRC } }];
  return { owned, actor, crafter, submitted };
}

function successAndFailureGroups() {
  return [
    { id: 'rg-ok', name: 'On success', results: [{ id: 'r-ok', componentId: 'potion', quantity: 1 }] },
    { id: 'rg-fail', name: 'On a failed check', role: 'failure', results: [{ id: 'r-fail', componentId: 'sludge', quantity: 1 }] },
  ];
}

async function brew(engine, validator, inputs, options = {}) {
  // The collector hands craftAlchemy pre-bucketed `{ item, componentId }` records
  // (issue 572); build them through the production resolver, system-scoped.
  const submitted = toAlchemyRecords(inputs.submitted, components(), 'sys-a');
  return engine.craftAlchemy(inputs.crafter, [inputs.actor], submitted, {
    craftingSystemId: 'sys-a',
    signatureValidator: validator,
    ...options,
  });
}

// ===========================================================================
// None: always success
// ===========================================================================

test('None: a matched brew always succeeds and produces the single success group (no roll)', async () => {
  const { engine, validator, visibility } = setup({
    checkMode: 'none',
    resultGroups: [{ id: 'rg', name: 'Result', results: [{ id: 'r', componentId: 'potion', quantity: 1 }] }],
  });
  const inputs = brewInputs();
  const result = await brew(engine, validator, inputs);
  assert.equal(result.success, true);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].name, 'Potion of Vigor');
  assert.equal(inputs.owned._deleted, true, 'the ingredient is consumed');
  assert.deepEqual(visibility.learned, ['brew'], 'a matched None brew learns the recipe');
});

// ===========================================================================
// Simple: pass → success group; fail → reserved failure group (produced-on-failure)
// ===========================================================================

test('Simple PASS produces the success group and learns', async () => {
  const { engine, validator, visibility } = setup({ checkMode: 'simple', resultGroups: successAndFailureGroups() });
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: 18, data: {} });
  const inputs = brewInputs();
  const result = await brew(engine, validator, inputs);
  assert.equal(result.success, true);
  assert.equal(result.results[0].name, 'Potion of Vigor', 'the success result is produced on a pass');
  assert.deepEqual(visibility.learned, ['brew']);
});

test('Simple FAIL routes past the fizzle into the failure group: consumes, produces, learns, produced-on-failure', async () => {
  const { engine, validator, visibility } = setup({ checkMode: 'simple', resultGroups: successAndFailureGroups() });
  engine._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 4, data: {} });
  const inputs = brewInputs();

  const result = await brew(engine, validator, inputs);

  // Would be `results:null` with no disposition if the failure-routing were reverted.
  assert.equal(result.success, false);
  assert.equal(result.disposition, 'produced-on-failure', 'NOT the no-match fizzle path');
  assert.ok(Array.isArray(result.results) && result.results.length === 1, 'the failure group is produced');
  assert.equal(result.results[0].name, 'Toxic Sludge', 'the REAL _createResultItems produced the reserved failure result');
  assert.equal(inputs.owned._deleted, true, 'ingredients consumed on a matched fail (consumeOnFail=true)');
  assert.deepEqual(visibility.learned, ['brew'], 'a matched fail is still a discovery');
});

test('Simple FAIL with an EMPTY failure group consumes + learns but produces nothing (still produced-on-failure)', async () => {
  const { engine, validator, visibility } = setup({
    checkMode: 'simple',
    resultGroups: [
      { id: 'rg-ok', name: 'On success', results: [{ id: 'r-ok', componentId: 'potion', quantity: 1 }] },
      { id: 'rg-fail', name: 'On a failed check', role: 'failure', results: [] },
    ],
  });
  engine._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 4, data: {} });
  const inputs = brewInputs();
  const result = await brew(engine, validator, inputs);
  assert.equal(result.disposition, 'produced-on-failure');
  assert.equal(result.results, null, 'an empty failure group produces no items');
  assert.equal(inputs.owned._deleted, true, 'still consumes');
  assert.deepEqual(visibility.learned, ['brew'], 'still learns');
});

test('Simple FAIL with consumeOnFail=false does not consume, still produces + learns', async () => {
  const { engine, validator, visibility } = setup({
    checkMode: 'simple',
    consumeOnFail: false,
    resultGroups: successAndFailureGroups(),
  });
  engine._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 4, data: {} });
  const inputs = brewInputs();
  const result = await brew(engine, validator, inputs);
  assert.equal(result.disposition, 'produced-on-failure');
  assert.equal(inputs.owned._deleted, false, 'consumeOnFail=false spares the ingredient');
  assert.equal(result.results[0].name, 'Toxic Sludge', 'the failure group is still produced');
  assert.deepEqual(visibility.learned, ['brew']);
});

test('Simple FAIL with learnOnCraft=false consumes + produces but does NOT learn', async () => {
  const { engine, validator, visibility } = setup({
    checkMode: 'simple',
    learnOnCraft: false,
    resultGroups: successAndFailureGroups(),
  });
  engine._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 4, data: {} });
  const inputs = brewInputs();
  const result = await brew(engine, validator, inputs);
  assert.equal(result.disposition, 'produced-on-failure');
  assert.deepEqual(visibility.learned, [], 'learnOnCraft=false grants nothing');
});

// ===========================================================================
// Tiered: a success outcome routes to its assigned tier group
// ===========================================================================

// ===========================================================================
// Brew is NEVER gated by visibility (issue 563): exercise the REAL
// RecipeVisibilityService.guardCraftStart (not the {craftable:true} stub) so a
// NON-revealed recipe under every mode still succeeds + produces for a non-GM.
// Reverting the `craftable`-decoupling in the alchemy branch makes this fail:
// guardCraftStart would return craftable:false and craft() would short-circuit.
// ===========================================================================

test('brew is never gated by reveal: a non-revealed recipe still brews + produces under every mode (real service)', async () => {
  for (const mode of ['restricted', 'item', 'knowledge', 'global']) {
    const { engine, system, recipe, validator } = setup({
      checkMode: 'none',
      learnOnCraft: false,
      resultGroups: [{ id: 'rg', name: 'Result', results: [{ id: 'r', componentId: 'potion', quantity: 1 }] }],
    });
    system.visibilityMode = mode;
    // A Manual (restricted) grant that EXCLUDES the viewer, so restricted mode is
    // genuinely non-revealed (an un-restricted recipe would fall back to visible).
    recipe.access = { playerIds: ['someone-else'], characterIds: [] };

    const realService = new RecipeVisibilityService(
      { getRecipes: () => [recipe], getRecipe: (id) => (id === recipe.id ? recipe : null) },
      { getSystem: (id) => (id === 'sys-a' ? system : null) }
    );
    // Non-GM viewer; the crafting actor has learned nothing and holds no book.
    game.user = { id: 'player1', isGM: false };
    game.fabricate.getRecipeVisibilityService = () => realService;

    // The recipe is genuinely NOT revealed to this viewer, yet still craftable.
    const access = realService.evaluateRecipeAccess({
      recipe,
      viewer: game.user,
      craftingActor: new FakeActor('probe'),
    });
    assert.equal(access.visible, false, `${mode}: the recipe is not revealed`);
    assert.equal(access.craftable, true, `${mode}: brewing is never gated by reveal`);

    // The brew succeeds and produces through the REAL guardCraftStart.
    const inputs = brewInputs();
    const result = await brew(engine, validator, inputs);
    assert.equal(result.success, true, `${mode}: a matched brew succeeds despite being unrevealed`);
    assert.equal(result.results[0].name, 'Potion of Vigor', `${mode}: the success group is produced`);
    assert.equal(inputs.owned._deleted, true, `${mode}: the ingredient is consumed`);
  }
});

test('Tiered success routes the outcome to its assigned tier group and produces it', async () => {
  const routed = {
    type: 'relative',
    relativeOutcomes: [
      { id: 't-fine', name: 'Fine', success: true },
      { id: 't-superb', name: 'Superb', success: true },
    ],
  };
  const { engine, validator, visibility } = setup({
    checkMode: 'tiered',
    routed,
    resultGroups: [
      { id: 'rg-fine', name: 'Fine', checkOutcomeIds: ['t-fine'], results: [{ id: 'r-fine', componentId: 'potion', quantity: 1 }] },
      { id: 'rg-superb', name: 'Superb', checkOutcomeIds: ['t-superb'], results: [{ id: 'r-superb', componentId: 'sludge', quantity: 1 }] },
    ],
  });
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'Superb', value: 25, data: {} });
  const inputs = brewInputs();
  const result = await brew(engine, validator, inputs);
  assert.equal(result.success, true);
  assert.equal(result.results[0].name, 'Toxic Sludge', 'the Superb tier group is produced');
  assert.deepEqual(visibility.learned, ['brew']);
});
