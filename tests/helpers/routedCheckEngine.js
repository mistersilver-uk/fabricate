// Shared fixtures for the routed crafting/salvage check engine tests. Building the
// engine, wiring `game.fabricate`, and the deterministic `Roll` stub all live here
// so the suites that exercise `CraftingEngine._runRoutedCheck` (and the routed
// dispatch through `_runCraftingCheck`) do not each re-copy the boilerplate — a
// fresh copy in `tests/**` would trip the SonarCloud new-code duplication gate.
//
// The fixtures intentionally do NOT import from `salvage-crafting-check-engine.test.js`
// (Sonar counts test files); they are authored once here and reused.

import { CraftingEngine } from '../../src/systems/CraftingEngine.js';

/** Minimal Foundry shims the engine + checkRoll touch in a headless test run. */
export function installRoutedCheckEnv() {
  globalThis.foundry = globalThis.foundry || {
    utils: { randomID: () => Math.random().toString(36).slice(2) },
  };
  globalThis.ui = globalThis.ui || { notifications: { warn: () => {}, error: () => {} } };
}

/**
 * Stub Foundry's `Roll`: `evaluate()` resolves to a fixed total and dice terms,
 * each `{ number, faces, total }` (mirroring an evaluated DiceTerm). Mirrors the
 * stub used by the simple/salvage suites.
 */
export function stubRoll(total, dice = []) {
  globalThis.Roll = class {
    constructor(formula) {
      this.formula = formula;
    }
    async evaluate() {
      return { total, dice };
    }
  };
}

/** Remove the dice engine so the routed check returns its headless no-route result. */
export function clearRollEngine() {
  delete globalThis.Roll;
}

/**
 * Build a default routed crafting-check config. `type` selects the active tier
 * list; pass `relativeOutcomes` / `fixedOutcomes` / `diceCrits` / `tiers` /
 * `dcMode` / `macroUuid` overrides as needed.
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
    macroUuid: null,
    diceCrits: [],
    ...overrides,
  };
}

export const ROUTED_ACTOR = { id: 'a1', name: 'Crafter', items: [] };

/**
 * Construct a `CraftingEngine` wired to a single routed system whose
 * `craftingCheck.routed` is the supplied config, and install the `game.fabricate`
 * manager/resolution-service stubs `_runCraftingCheck` reads. Returns
 * `{ engine, system }`.
 *
 * `craftingCheck` overrides merge into `{ enabled, routed }` so a test can add a
 * sibling `simple`/`progressive`/`checkSource`/`macroUuid` without re-stating the
 * routed block.
 */
export function makeRoutedEngine({
  routed,
  resolutionMode = 'routed',
  provider = 'check',
  enabled = true,
  features = {},
  craftingCheck = {},
} = {}) {
  const system = {
    id: 'sys-1',
    resolutionMode,
    features,
    craftingCheck: { enabled, routed, ...craftingCheck },
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
export function runRoutedCheck(engine, recipe = { craftingSystemId: 'sys-1' }, ingredientSet = null) {
  return engine._runCraftingCheck(recipe, ROUTED_ACTOR, [ROUTED_ACTOR], ingredientSet);
}
