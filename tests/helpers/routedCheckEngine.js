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
