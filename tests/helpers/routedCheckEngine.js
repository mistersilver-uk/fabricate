// Shared fixtures for the routed crafting/salvage check engine tests. Building the
// engine, wiring `game.fabricate`, and the deterministic `Roll` stub all live here
// so the suites that exercise `CraftingEngine._runRoutedCheck` (and the routed
// dispatch through `_runCraftingCheck`) do not each re-copy the boilerplate — a
// fresh copy in `tests/**` would trip the SonarCloud new-code duplication gate.
//
// The fixtures intentionally do NOT import from `salvage-crafting-check-engine.test.js`
// (Sonar counts test files); they are authored once here and reused.

import { CraftingEngine } from '../../src/systems/CraftingEngine.js';

/** Deterministic id sequence for the headless `randomID` shim (no Math.random — Sonar S2245). */
let _routedIdSeq = 0;

/** Minimal Foundry shims the engine + checkRoll touch in a headless test run. */
export function installRoutedCheckEnv() {
  globalThis.foundry = globalThis.foundry || {
    utils: {
      randomID: () => {
        _routedIdSeq += 1;
        return `rid-${_routedIdSeq.toString(36)}`;
      },
    },
  };
  globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };
}

/**
 * The first argument captured from every `evaluate()` call on the routed stub,
 * so suites can assert the non-interactive option `{ allowInteractive: false }`.
 * Cleared by `stubRoll`.
 */
export const evaluateArgs = [];

/**
 * Stub Foundry's `Roll`: `evaluate()` resolves to a fixed total and dice terms,
 * each `{ number, faces, total, results }` (mirroring an evaluated DiceTerm).
 * Mirrors the stub used by the simple/salvage suites. Records each `evaluate()`
 * argument in {@link evaluateArgs} so the non-interactive contract can be asserted.
 *
 * Per-die `results[]` (issue 419): each dice term may carry an explicit
 * `results: [{ result, active? }]` so the `checkBreakage` `diceGroup` per-die
 * aggregates (`anyDie`/`allDice`/`lowestDie`/`highestDie`) have raw faces to read.
 * When a term omits `results` and its `total` divides evenly across a single die
 * (`number: 1`), a `[{ result: total }]` is synthesised so the natural-1 default
 * still fires without each suite re-stating the faces. Multi-die terms with no
 * `results` are left as-is (the aggregates fail open, by design).
 */
export function stubRoll(total, dice = []) {
  evaluateArgs.length = 0;
  const withResults = dice.map((die) => {
    if (Array.isArray(die.results)) return die;
    if (Number(die.number) === 1 && Number.isFinite(Number(die.total))) {
      return { ...die, results: [{ result: Number(die.total), active: true }] };
    }
    return die;
  });
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate(options) {
      evaluateArgs.push(options);
      return { total, dice: withResults };
    }
  };
}

/** Remove the dice engine so the routed check returns its headless no-route result. */
export function clearRollEngine() {
  delete globalThis.Roll;
}

/**
 * Build a default routed crafting-check config. `type` selects the active tier
 * list; pass `relativeOutcomes` / `fixedOutcomes` / `checkBreakage` / `tiers` /
 * `dcMode` overrides as needed.
 */
export function defaultRouted(overrides = {}) {
  return {
    rollFormula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    dcMode: 'static',
    type: 'relative',
    relativeOutcomes: [],
    fixedOutcomes: [],
    tiers: [],
    checkBreakage: { triggers: [] },
    ...overrides,
  };
}

export const ROUTED_ACTOR = { id: 'a1', name: 'Crafter', items: [] };

/**
 * Build a default simple (pass/fail) crafting-check config — the shared optional
 * pass/fail slot that backs `simple`/`alchemy`/`routedByIngredients`. Pass
 * `dc`/`thresholdMode`/`dcMode`/`macroUuid`/`tiers`/`checkBreakage` overrides as
 * needed. Kept alongside {@link defaultRouted} so `routedByIngredients` suites can
 * author the simple slot without re-stating the shape.
 */
export function defaultSimple(overrides = {}) {
  return {
    rollFormula: '1d20',
    dc: 15,
    thresholdMode: 'meet',
    dcMode: 'static',
    macroUuid: null,
    tiers: [],
    checkBreakage: { triggers: [] },
    ...overrides,
  };
}

/**
 * Construct a `CraftingEngine` wired to a single routed system whose
 * `craftingCheck.routed` (and optionally `craftingCheck.simple`) is the supplied
 * config, and install the `game.fabricate` manager/resolution-service stubs
 * `_runCraftingCheck` reads. Returns `{ engine, system }`.
 *
 * `simple` is an additive param: pass it to author the shared pass/fail slot (used by
 * `routedByIngredients` suites, whose check now reads `craftingCheck.simple`). Both
 * `routed` and `simple` can coexist so a test can prove which slot the engine reads.
 * `craftingCheck` overrides merge last, over `{ enabled, routed, simple }`.
 */
export function makeRoutedEngine({
  routed,
  simple = undefined,
  // The routed crafting-check engine path is driven by the `routedByCheck` mode now
  // (the routing basis is a property of the mode, not a per-recipe provider). The
  // legacy `provider` param is retained for call-site compat but no longer read by
  // the engine's `_runCraftingCheck`.
  resolutionMode = 'routedByCheck',
  provider = 'check',
  enabled = true,
  features = {},
  craftingCheck = {},
} = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode,
    features,
    craftingCheck: {
      enabled,
      ...(routed === undefined ? {} : { routed }),
      ...(simple === undefined ? {} : { simple }),
      ...craftingCheck,
    },
  };
  const systemManager = { getSystem: () => system };
  const resolutionService = {
    getMode: () => system.resolutionMode,
    getResultSelection: () => ({ provider }),
  };
  const engine = new CraftingEngine({}, null, resolutionService);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => systemManager,
      getResolutionModeService: () => resolutionService,
    },
  };
  return { engine, system };
}

/**
 * Drive the routed check through the engine's public-ish `_runCraftingCheck`
 * dispatch (mirrors the simple suite's `run` seam), passing the recipe + optional
 * ingredient set so recipe-tier / dynamic DC resolution is exercised end to end.
 */
const DEFAULT_ROUTED_RECIPE = Object.freeze({ craftingSystemId: 'sys-1' });

export function runRoutedCheck(engine, recipe = DEFAULT_ROUTED_RECIPE, ingredientSet = null) {
  return engine._runCraftingCheck(recipe, ROUTED_ACTOR, [ROUTED_ACTOR], ingredientSet);
}

/**
 * A recipe with no ingredients, results or tools, so a `craft()` resolves on the
 * CHECK alone and the posted result card is the only observable. `validate` is the
 * one method `craft()` calls on it before the check runs.
 */
const CHAT_CRAFT_RECIPE = Object.freeze({
  id: 'r-chat',
  name: 'Iron Sword',
  craftingSystemId: 'sys-1',
  ingredientSets: [],
  resultGroups: [],
  toolIds: [],
  outcomeRouting: null,
  validate: () => ({ valid: true, errors: [] }),
});

/**
 * Capture every `ChatMessage.create` payload and install the minimal `game` shims the
 * chat posters read. Shared by {@link craftForChatCard} and
 * {@link salvageForChatCard}: a second copy of this stub would be new test code
 * duplicating new test code against SonarCloud's `new_duplicated_lines_density` gate.
 *
 * Assumes `globalThis.game` already exists (both callers build it first).
 */
function captureChatMessages(speakerAlias) {
  const chatMessages = [];
  globalThis.ChatMessage = {
    create(payload) {
      chatMessages.push(payload);
      return Promise.resolve({ id: `msg-${chatMessages.length}` });
    },
    getSpeaker: () => ({ alias: speakerAlias }),
  };
  globalThis.game.i18n = { localize: (key) => key, format: (key) => key };
  globalThis.game.user = { id: 'user-1' };
  return chatMessages;
}

/**
 * Drive a whole `craft()` through the REAL routed check to the posted result chat
 * card, and return the `ChatMessage.create` payloads it produced.
 *
 * This exists because the engine's chat-model mapping had no coverage at all: every
 * `_postCraftChatMessage` call site could drop its routed check evidence and still
 * ship green, since the chat-card suites feed the presentation model directly and the
 * routed-check suites stop at the check result. Driving the real check means the
 * evidence asserted on is the runtime's own `data.tierStepApplied`, not a fixture of
 * it (issue 975).
 *
 * @param {object} routed - The routed crafting-check config (see {@link defaultRouted}).
 * @returns {Promise<{result: object, chatMessages: Array<object>}>}
 */
export async function craftForChatCard(routed) {
  const { engine } = makeRoutedEngine({ routed, features: { chatOutput: true } });
  // `_runCraftingCheck` needs only the mode/selection stubs `makeRoutedEngine` installs;
  // the surrounding `craft()` additionally asks the same service to validate.
  Object.assign(engine.resolutionModeService, {
    validateRecipe: () => ({ valid: true, errors: [] }),
    validateCheckResult: () => true,
    resolveResultGroups: () => ({ groups: [], meta: {} }),
  });
  engine.recipeManager = {
    canCraft: () => ({
      canCraft: true,
      satisfiableSet: { id: 'set-1', matchIngredients: () => [] },
      missing: { ingredients: [], essences: [], tools: [] },
    }),
    ingredientMatchesItem: () => false,
    getToolsForSet: () => [],
  };
  const chatMessages = captureChatMessages(ROUTED_ACTOR.name);
  const craftingActor = { ...ROUTED_ACTOR, items: { contents: [] } };
  const result = await engine.craft(craftingActor, [ROUTED_ACTOR], CHAT_CRAFT_RECIPE, null, {});
  return { result, chatMessages };
}

/**
 * The salvaged source. It requires no tools and routes to no result group, so the
 * whole fixture is the CHECK and the card it produces — the same reduction
 * {@link CHAT_CRAFT_RECIPE} makes on the crafting side. `_findComponentItems` reaches
 * the owned item through the case-sensitive NAME fallback, so the item below carries
 * this exact name.
 */
const CHAT_SALVAGE_COMPONENT = Object.freeze({
  id: 'comp-ore',
  name: 'Iron Ore',
  img: 'icons/ore.png',
  salvage: Object.freeze({
    enabled: true,
    ingredientQuantity: 1,
    toolIds: [],
    resultGroups: [],
    // Routed salvage looks the FINAL tier name up here; an empty map routes to no
    // group, so the success path awards nothing and needs no item-creation plumbing.
    outcomeRouting: {},
  }),
});

/**
 * Drive a whole `salvage()` through the REAL routed salvage check to the posted chat
 * card, and return the `ChatMessage.create` payloads it produced.
 *
 * The crafting twin above exists because the engine's chat-model mapping had no
 * coverage; this is the salvage half of the same gap. `_postSalvageChatMessage` has
 * TWO call sites — the rolled-failure path and the success path — each passing
 * `tierStep: tierStepForCard(checkResult)`, and a suite that calls the poster directly
 * with its own `tierStep:` argument exercises neither, so deleting either argument
 * would ship green (issue 975 review).
 *
 * The caller stubs `Roll` first: which of the two call sites runs is decided by the
 * tier the rolled total lands on.
 *
 * @param {object} salvageCraftingCheck - The system's salvage check config.
 * @returns {Promise<{result: object, chatMessages: Array<object>}>}
 */
export async function salvageForChatCard(salvageCraftingCheck) {
  const system = {
    id: 'sys-1',
    features: { salvage: true, chatOutput: true },
    salvageResolutionMode: 'routed',
    salvageCraftingCheck,
    components: [CHAT_SALVAGE_COMPONENT],
    tools: [],
  };
  const sourceItem = {
    id: 'item-ore',
    uuid: 'Item.item-ore',
    name: CHAT_SALVAGE_COMPONENT.name,
    system: { quantity: 1 },
    flags: {},
    async delete() {
      this.deleted = true;
    },
    async update() {},
  };
  const actor = {
    id: 'a-salvager',
    uuid: 'Actor.a-salvager',
    name: 'Salvager',
    items: [sourceItem],
  };
  // No run manager and no tools: `salvage()` then reduces to check → consume → post,
  // which is the seam under test.
  const engine = new CraftingEngine({}, null, {
    validateSalvage: () => ({ valid: true, errors: [] }),
  });
  globalThis.fromUuid = async (uuid) => (uuid === actor.uuid ? actor : null);
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({ getSystem: () => system }),
      getResolutionModeService: () => null,
      getSalvageRunManager: () => null,
    },
    time: { worldTime: 0 },
  };
  const chatMessages = captureChatMessages(actor.name);
  const result = await engine.salvage(actor.uuid, system.id, CHAT_SALVAGE_COMPONENT.id);
  return { result, chatMessages };
}
