/**
 * End-to-end alchemy tier-4 craftability parity (issue 578).
 *
 * A submission resolvable SOLELY by the bare top-level `registeredItemUuid` tier
 * (no `uuid`/compendium/`duplicateSource`/`roles`/legacy scalar/name, and no own
 * `flags.fabricate.essences`) is bucketed to component X by the collector, but on
 * the pre-fix branch the rest of the alchemy craft path re-resolves through the
 * tier-4-BLIND shared resolvers, so the brew never completes. These tests drive the
 * REAL collector (`resolveAlchemySubmissions`) → REAL `craftAlchemy` → REAL `craft()`
 * pipeline with a REAL `RecipeManager` (so `canCraft`/`evaluateCraftability`/
 * `ingredientMatchesItem`/`_accumulateEssences` run genuinely), a REAL `IngredientSet`
 * (real `resolveIngredientSelection`), a REAL `SignatureValidator`, and a REAL
 * `ResolutionModeService`. Only `_runCraftingCheck` is stubbed (to force a pass/fail
 * without a live dice engine). NO `craft()` stub.
 *
 * The three load-bearing cases are RED on the base branch (`success:false` / essences
 * `{}` / effect not transferred) and GREEN after the full fix:
 *   1. Non-timed success — result created AND X's essence-sourced effect transferred.
 *   2. Time-gated — START/prepares (snapshot carries X's essences), FINISH creates the
 *      result with the effect transferred from the snapshot.
 *   3. Non-timed Simple FAILURE — the reserved failure result carries X's essence-sourced
 *      effect (site 7).
 * Plus: standard (non-alchemy) crafting of the same item stays unrecognized, the own-flag
 * short-circuit is preserved, and the UNMUTATED shared essence/ingredient resolvers still
 * have no tier 4.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';
import { CraftingRunManager } from '../src/systems/CraftingRunManager.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import { ResolutionModeService } from '../src/systems/ResolutionModeService.js';
import { SignatureValidator } from '../src/systems/SignatureValidator.js';
import { IngredientSet } from '../src/models/IngredientSet.js';
import { accumulateItemEssences, findMatchingComponent } from '../src/utils/essenceResolver.js';
import { resolveComponentForItem } from '../src/utils/sourceUuid.js';
import { resolveAlchemySubmissions } from '../src/utils/alchemySubmissions.js';

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
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
globalThis.foundry = {
  utils: {
    getProperty,
    setProperty,
    randomID: () => `id-${++_idCounter}`,
    deepClone: (value) => JSON.parse(JSON.stringify(value ?? null)),
  },
};
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };

const SYS = 'alch-sys';
const FIRE_ESSENCE_SRC = 'Item.FireEssence';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// A purely-tier-4 owned item: only a bare top-level `registeredItemUuid`. No `uuid`,
// compendium/duplicate source, `roles`, legacy scalar, or name — invisible to
// `getItemSourceReferences` and to the durable-flag tiers, so ONLY the bare-uuid
// supplement can attribute it. `flags` optionally carries own essences (own-flag test).
class Tier4Item {
  constructor(id, registeredItemUuid, { flags = null, quantity = 1, uuid = null } = {}) {
    this.id = id;
    this.registeredItemUuid = registeredItemUuid;
    // Optional live uuid — used ONLY by the own-flag pin, which is deliberately
    // source-ref-resolvable (uuid overlaps the component source) so it brews on BOTH
    // the base and fixed branches, isolating the own-flag ESSENCE short-circuit from
    // the tier-4 ingredient fix. The tier-4-only cases pass no uuid.
    if (uuid) this.uuid = uuid;
    this.system = { quantity };
    this.parent = null;
    this._flags = flags;
    this._deleted = false;
  }
  // Only present when own flags are supplied; otherwise getFabricateFlag's
  // "no getFlag" fallback returns the default (so no own essences/roles/scalar).
  getFlag(ns, key) {
    if (ns !== 'fabricate' || !this._flags) return undefined;
    return this._flags[key];
  }
  async delete() {
    this._deleted = true;
    if (this.parent) this.parent.items = this.parent.items.filter((i) => i !== this);
  }
  async update(payload) {
    if (payload['system.quantity'] !== undefined) this.system.quantity = payload['system.quantity'];
  }
}

class FakeResultItem {
  constructor(name, img) {
    this.name = name;
    this.img = img;
    this.uuid = `Item.result-${++_idCounter}`;
    this.effects = [];
  }
  async createEmbeddedDocuments(type, data) {
    if (type === 'ActiveEffect') this.effects.push(...data);
    return data;
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
    const made = data.map((d) => new FakeResultItem(d.name, d.img));
    this.created.push(...made);
    return made;
  }
}

// The essence-definition source item, whose active effect is transferred to the
// crafted result when X's `fire` essence contributes.
function fireEssenceSourceItem() {
  return {
    id: 'fire-essence-src',
    uuid: FIRE_ESSENCE_SRC,
    name: 'Fire Essence',
    effects: [{ name: 'Fire Ward', toObject: () => ({ name: 'Fire Ward', changes: [] }) }],
  };
}

// A managed result source item resolved via fromUuid; toObject() feeds _createSingleResult.
function resultSourceItem(name) {
  return {
    toObject: () => ({ name, img: `icons/${name}.webp`, type: 'consumable', system: {} }),
    effects: [],
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function components() {
  return [
    // Component X DEFINES { fire: 2 }; its source ref is Item.X (bare-uuid tier target).
    {
      id: 'cX',
      name: 'Xenon Root',
      registeredItemUuid: 'Item.X',
      originItemUuid: 'Item.X',
      aliasItemUuids: [],
      essences: { fire: 2 },
    },
    {
      id: 'cElixir',
      name: 'Elixir',
      img: 'icons/elixir.webp',
      registeredItemUuid: 'Item.Elixir',
      originItemUuid: 'Item.Elixir',
      aliasItemUuids: [],
    },
    {
      id: 'cSludge',
      name: 'Sludge',
      img: 'icons/sludge.webp',
      registeredItemUuid: 'Item.Sludge',
      originItemUuid: 'Item.Sludge',
      aliasItemUuids: [],
    },
  ];
}

const SUCCESS_GROUP = {
  id: 'rg-ok',
  name: 'On success',
  results: [{ id: 'r-ok', componentId: 'cElixir', quantity: 1 }],
};
const FAILURE_GROUP = {
  id: 'rg-fail',
  name: 'On a failed check',
  role: 'failure',
  results: [{ id: 'r-fail', componentId: 'cSludge', quantity: 1 }],
};

// A single-ingredient-set alchemy recipe requiring component X (quantity 1) AND
// declaring essences { fire: 2 }, built on a REAL IngredientSet so
// resolveIngredientSelection / canCraft run genuinely.
function makeRecipe({ resultGroups, timeRequirement = null, essences = { fire: 2 } }) {
  const set = new IngredientSet({
    id: 'brew-set',
    ingredientGroups: [
      {
        id: 'g1',
        options: [{ match: { type: 'component', componentId: 'cX' }, quantity: 1 }],
      },
    ],
    essences,
  });
  return {
    id: 'brew',
    name: 'Xenon Brew',
    enabled: true,
    craftingSystemId: SYS,
    ingredientSets: [set],
    resultGroups,
    toolIds: [],
    transferEffects: true,
    outcomeRouting: null,
    resultSelection: null,
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
          timeRequirement,
          outcomeRouting: null,
          resultSelection: null,
        },
      ];
    },
  };
}

function makeSystem({ checkMode }) {
  return {
    id: SYS,
    resolutionMode: 'alchemy',
    features: { essences: true, effectTransfer: true, chatOutput: false },
    alchemy: { checkMode, learnOnCraft: false, consumeOnFail: true, showAttemptHistoryToPlayers: false },
    craftingCheck: { enabled: false, consumption: {} },
    components: components(),
    essenceDefinitions: [{ id: 'fire', sourceItemUuid: FIRE_ESSENCE_SRC }],
  };
}

function setup({ checkMode, resultGroups, timeRequirement = null, runManager = null }) {
  const system = makeSystem({ checkMode });
  system.components = components();
  const comps = system.components;
  const recipe = makeRecipe({ resultGroups, timeRequirement });

  const resolutionService = new ResolutionModeService({
    getSystem: (id) => (id === SYS ? system : null),
  });
  const recipeManager = new RecipeManager();
  // Register the recipe for the alchemy match loop; the REAL canCraft /
  // evaluateCraftability / ingredientMatchesItem / _accumulateEssences remain intact.
  recipeManager.getRecipes = () => [recipe];

  const fire = fireEssenceSourceItem();
  globalThis.fromUuid = async (uuid) => {
    if (uuid === FIRE_ESSENCE_SRC) return fire;
    if (uuid === 'Item.Elixir') return resultSourceItem('Elixir');
    if (uuid === 'Item.Sludge') return resultSourceItem('Sludge');
    return null;
  };
  globalThis.game = {
    user: { id: 'gm', isGM: true },
    time: { worldTime: 1000 },
    actors: [],
    i18n: { localize: (k) => k },
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: (id) => (id === SYS ? system : null) }),
      getResolutionModeService: () => resolutionService,
      getRecipeManager: () => recipeManager,
      getRecipeVisibilityService: () => null,
      getCraftingRunManager: () => runManager,
    },
  };

  const engine = new CraftingEngine(recipeManager, runManager, resolutionService);
  const validator = new SignatureValidator({
    getSystem: () => system,
    getRecipesForSystem: () => [recipe],
    getComponentsForSystem: () => comps,
  });
  return { engine, system, recipe, validator, comps };
}

// Build the pre-bucketed submission records through the REAL collector, exactly as
// the facade does: the palette emits component id 'cX' for the placed unit, the
// collector dispenses the owned tier-4 item for that request.
function brewRecords(sourceActor, comps) {
  return resolveAlchemySubmissions([sourceActor], comps, ['cX'], SYS);
}

// ===========================================================================
// 1. Non-timed success — RED (signature gate) → GREEN (result + effect transfer)
// ===========================================================================

test('non-timed: a purely-tier-4 submission brews and transfers X\'s essence-sourced effect', async () => {
  const { engine, validator, comps } = setup({ checkMode: 'simple', resultGroups: [SUCCESS_GROUP] });
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: 18, data: {} });

  const tier4 = new Tier4Item('owned-x', 'Item.X');
  const source = new FakeActor('src', [tier4]);
  const crafter = new FakeActor('pc');
  const records = brewRecords(source, comps);

  // Non-vacuity: the record IS bucketed to cX and the item is genuinely tier-4-only.
  assert.equal(records.length, 1);
  assert.equal(records[0].componentId, 'cX');

  const result = await engine.craftAlchemy(crafter, [source], records, {
    craftingSystemId: SYS,
    signatureValidator: validator,
  });

  assert.equal(result.success, true, 'the tier-4-only brew completes end-to-end');
  assert.ok(Array.isArray(result.results) && result.results.length === 1, 'a result item is created');
  assert.equal(result.results[0].name, 'Elixir');
  assert.equal(tier4._deleted, true, 'the tier-4 ingredient is consumed');
  // The essence-sourced active effect from X's { fire } essence is transferred.
  assert.equal(result.results[0].effects.length, 1, 'X\'s essence-sourced effect is transferred');
  assert.equal(result.results[0].effects[0].name, 'Fire Ward');
});

// ===========================================================================
// 2. Time-gated — RED → GREEN (START prepares snapshot with X's essences, FINISH
//    creates the result with the effect transferred from the snapshot)
// ===========================================================================

test('time-gated: a purely-tier-4 submission starts, prepares an essence snapshot, and finishes with the effect transferred', async () => {
  const runManager = new CraftingRunManager();
  const { engine, validator, comps } = setup({
    checkMode: 'simple',
    resultGroups: [SUCCESS_GROUP],
    timeRequirement: { hours: 1 },
    runManager,
  });
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: 18, data: {} });

  const tier4 = new Tier4Item('owned-x', 'Item.X');
  const source = new FakeActor('src', [tier4]);
  const crafter = new FakeActor('pc');
  const records = brewRecords(source, comps);

  // START: arms the time gate + consumes the tier-4 ingredient.
  const startResult = await engine.craftAlchemy(crafter, [source], records, {
    craftingSystemId: SYS,
    signatureValidator: validator,
  });
  assert.equal(startResult.success, false, 'START returns "in progress" while the gate matures');
  assert.match(startResult.message, /in progress/i);
  assert.equal(tier4._deleted, true, 'the tier-4 ingredient is consumed at START');

  const run = runManager.getActiveRuns(crafter)[0];
  assert.ok(run, 'a waiting run is kept active');
  assert.equal(run.status, 'waitingTime');
  // The START essence snapshot credits X's fire essence (tier-4-aware).
  assert.deepEqual(
    run.steps[0].preparedConsumption.resolvedEssences,
    { fire: 2 },
    'the START snapshot carries X\'s component-defined essences'
  );

  // Advance world time past the gate and FINISH.
  game.time.worldTime = 1000 + 3600 + 1;
  const finishResult = await engine.craftAlchemy(crafter, [source], records, {
    craftingSystemId: SYS,
    signatureValidator: validator,
  });
  assert.equal(finishResult.success, true, 'FINISH completes the timed brew');
  assert.equal(finishResult.results.length, 1);
  assert.equal(finishResult.results[0].name, 'Elixir');
  assert.equal(
    finishResult.results[0].effects.length,
    1,
    'the effect is transferred from the START snapshot at FINISH'
  );
  assert.equal(finishResult.results[0].effects[0].name, 'Fire Ward');
});

// ===========================================================================
// 3. Non-timed Simple FAILURE — RED → GREEN (site 7: the reserved failure result
//    carries X's essence-sourced effect)
// ===========================================================================

test('non-timed Simple FAILURE: the reserved failure result carries X\'s essence-sourced effect (site 7)', async () => {
  const { engine, validator, comps } = setup({
    checkMode: 'simple',
    resultGroups: [SUCCESS_GROUP, FAILURE_GROUP],
  });
  engine._runCraftingCheck = async () => ({ success: false, outcome: 'fail', value: 3, data: {} });

  const tier4 = new Tier4Item('owned-x', 'Item.X');
  const source = new FakeActor('src', [tier4]);
  const crafter = new FakeActor('pc');
  const records = brewRecords(source, comps);

  const result = await engine.craftAlchemy(crafter, [source], records, {
    craftingSystemId: SYS,
    signatureValidator: validator,
  });

  // A matched-but-failed Simple brew routes to the reserved failure group (NOT the
  // no-match fizzle) and consumes the tier-4 ingredient.
  assert.equal(result.success, false);
  assert.equal(result.disposition, 'produced-on-failure', 'NOT the no-match fizzle path');
  assert.ok(Array.isArray(result.results) && result.results.length === 1, 'the failure result is produced');
  assert.equal(result.results[0].name, 'Sludge');
  assert.equal(tier4._deleted, true, 'the tier-4 ingredient is consumed on a matched fail');
  // Site 7: the failure result receives X's essence-sourced effect.
  assert.equal(
    result.results[0].effects.length,
    1,
    'X\'s essence-sourced effect is transferred to the failure result'
  );
  assert.equal(result.results[0].effects[0].name, 'Fire Ward');
});

// ===========================================================================
// 4. Standard-crafting-unaffected pin (the gating)
// ===========================================================================

test('standard (non-alchemy) craft of the same tier-4 item stays unrecognized', async () => {
  const { engine, recipe } = setup({ checkMode: 'simple', resultGroups: [SUCCESS_GROUP] });
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: 18, data: {} });

  const tier4 = new Tier4Item('owned-x', 'Item.X');
  const source = new FakeActor('src', [tier4]);
  const crafter = new FakeActor('pc');

  // A STANDARD craft — no isAlchemyAttempt, so no injected resolver.
  const result = await engine.craft(crafter, [source], recipe, null, {});
  assert.equal(result.success, false, 'the tier-4-only item is not recognized by standard crafting');
  assert.match(result.message, /Missing required items/i);
  assert.equal(tier4._deleted, false, 'nothing is consumed');
});

// ===========================================================================
// 5. Own-flag short-circuit preserved
// ===========================================================================

test('own-flag short-circuit: an item carrying its own essences brews even against a component with none', async () => {
  const { engine, validator, system, comps } = setup({
    checkMode: 'simple',
    resultGroups: [SUCCESS_GROUP],
  });
  engine._runCraftingCheck = async () => ({ success: true, outcome: 'pass', value: 18, data: {} });

  // Component X now DEFINES no essences; the submission carries its OWN { fire: 2 } and
  // is source-ref-resolvable (uuid overlaps X's source) so ONLY the essence contribution
  // depends on the own-flag short-circuit — which my change must preserve on every path.
  system.components.find((c) => c.id === 'cX').essences = {};
  const owned = new Tier4Item('owned-x', null, {
    uuid: 'Item.X',
    flags: { 'fabricate.essences': { fire: 2 } },
  });
  const source = new FakeActor('src', [owned]);
  const crafter = new FakeActor('pc');
  const records = brewRecords(source, comps);
  assert.equal(records[0].componentId, 'cX', 'the own-flag item still buckets to X (by source ref)');

  const result = await engine.craftAlchemy(crafter, [source], records, {
    craftingSystemId: SYS,
    signatureValidator: validator,
  });
  assert.equal(result.success, true, 'the own-essences submission satisfies the essence requirement and brews');
  assert.equal(result.results[0].name, 'Elixir');
});

// ===========================================================================
// 6. Non-alchemy shared resolvers still have no tier 4 (unmutated)
// ===========================================================================

test('the UNMUTATED shared essence/ingredient resolvers still have no tier 4 for the item', () => {
  const comps = components();
  const tier4 = new Tier4Item('owned-x', 'Item.X');

  assert.deepEqual(
    accumulateItemEssences([tier4], { components: comps, systemId: SYS }),
    {},
    'accumulateItemEssences credits no essences to a tier-4-only item'
  );
  assert.equal(
    findMatchingComponent(tier4, comps, SYS),
    null,
    'findMatchingComponent does not resolve a tier-4-only item'
  );
  assert.equal(
    resolveComponentForItem(tier4, comps, SYS),
    null,
    'resolveComponentForItem does not resolve a tier-4-only item'
  );
});
