/**
 * The SINGLE derivation of "which salvage check is active, and is it usable" (issue
 * 859).
 *
 * Salvage dispatches on the PAIR `(system.salvageResolutionMode,
 * system.salvageCraftingCheck[mode].rollFormula)`, and that pair was being derived
 * independently in five places — three `CraftingEngine` readers
 * (`_resolveSalvageCheckBreakage`, `_resolveSalvageResultGroups`,
 * `_runSalvageCraftingCheck`), `InventoryListingBuilder._buildSalvage` and
 * `ResolutionModeService.validateSalvage` — which had already drifted: the engine's
 * check runner tested the formula with raw truthiness while the builder and the whole
 * crafting path tested it trimmed, so a whitespace-only formula rolled `"   "` for the
 * engine and read as "no check" for the player's panel.
 *
 * THE SOURCE IS `system.salvageCraftingCheck`, NOT `system.craftingCheck` — the latter
 * is the RECIPE check block. Both exist and both are typically authored, so reading the
 * wrong one renders and rolls plausibly while using a formula and a DC salvage never
 * configured.
 *
 * `validateSalvage` deliberately keeps its own derivation: it is the AUTHORITY this
 * resolver is aligned to, not a consumer of it.
 *
 * This module is pure — no `game`, no Foundry globals, no I/O — so every consumer can
 * be tested against a plain system object. The one Foundry TOUCH is the retirement
 * shim's optional `Roll.validate` residue check, which fails open when the global is
 * absent, so the headless posture is unchanged.
 */

import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

/** The canonical salvage resolution modes. Legacy tokens (`tiered`/`mapped`) are
 * rewritten to these by the manager's salvage token normalizer and the 1.4.0
 * migration, so an authored token outside this set is a config defect, not a legacy
 * spelling. */
const SALVAGE_MODES = ['simple', 'routed', 'progressive'];

/**
 * True when a check sub-config carries an authored, NON-EMPTY roll formula — the
 * single notion of a "usable" check, shared by the crafting and salvage paths (matches
 * `ResolutionModeService._hasRollFormula`).
 *
 * The trim is the point: an authored formula of `"   "` is not a check. Handing it to
 * `Roll` throws inside the runner and surfaces as a rolled (consuming) FAILURE, which
 * is the opposite of the "no formula, no check" answer every reader intends.
 *
 * @param {{rollFormula?: unknown}|null|undefined} config A `simple` / `routed` /
 *   `progressive` check sub-config.
 * @returns {boolean}
 */
export function hasCheckFormula(config) {
  return typeof config?.rollFormula === 'string' && config.rollFormula.trim().length > 0;
}

/**
 * Resolve a crafting system's active SALVAGE check.
 *
 * @param {object|null|undefined} system The crafting system.
 * @returns {{
 *   mode: 'simple'|'routed'|'progressive',
 *   config: object|null,
 *   rollFormula: string,
 *   checkUsable: boolean,
 *   requiresCheck: boolean,
 *   unsupportedMode: boolean,
 * }}
 *
 * - `mode` is the CANONICAL mode the engine dispatches on. An absent token defaults to
 *   `simple`, and an UNSUPPORTED one also reports `simple` so a display-only consumer
 *   keeps rendering something rather than nothing — but it is paired with
 *   `unsupportedMode: true`, and **a consumer that would MUTATE (award result groups,
 *   break tools, roll a check) must test `unsupportedMode` BEFORE reading `mode`**.
 *   Acting on the coerced `simple` would award `resultGroups[0]` for a configuration
 *   `ResolutionModeService.validateSalvage` already reports as invalid.
 * - `config` is `system.salvageCraftingCheck[mode]` (null when absent).
 * - `rollFormula` is that config's TRIMMED formula, with the retired modifier
 *   placeholder stripped (`''` when there is none). Salvage never AUTHORED that token,
 *   but an imported bundle can carry one, so the shim runs here too (issue 1094).
 * - `checkUsable` is that post-shim formula's emptiness test — the only gate. "No check" and
 *   "pass/fail" are not two modes; they are one `simple` mode read at two usability
 *   states, so callers dispatch on the PAIR `(mode, checkUsable)`.
 * - `requiresCheck` marks the modes that CANNOT resolve without a rolled outcome:
 *   `routed` (result-group routing keys off the outcome tier name) and `progressive`
 *   (the total IS the award budget). `requiresCheck && !checkUsable` is the
 *   misconfiguration the engine aborts on with zero mutation.
 * - `unsupportedMode` is a defensive guard, not a fix — the same posture
 *   `validateSalvage` takes, which guards the identical case despite the normalizer
 *   claiming to have removed it.
 *
 * THE RETIREMENT SHIM RUNS BEFORE THE EMPTINESS TEST (issue 1094). A formula whose only
 * content was the retired placeholder would otherwise report USABLE, pass the
 * `requiresCheck && !checkUsable` abort, reach `evaluateCheckRoll`, strip to `''` and
 * throw inside `new Roll('')` — a rolled, and therefore CONSUMING, failure. Reported as
 * "no formula" instead, so readiness and the roll path cannot disagree.
 */
export function resolveSalvageCheck(system) {
  const authoredMode = system?.salvageResolutionMode || 'simple';
  const unsupportedMode = !SALVAGE_MODES.includes(authoredMode);
  const mode = unsupportedMode ? 'simple' : authoredMode;
  const config = (system?.salvageCraftingCheck ?? {})[mode] ?? null;
  const authored = hasCheckFormula(config) ? config.rollFormula.trim() : '';
  const rollFormula = stripRetiredModifierPlaceholder(authored).trim();
  return {
    mode,
    config,
    rollFormula,
    checkUsable: rollFormula.length > 0,
    requiresCheck: mode === 'routed' || mode === 'progressive',
    unsupportedMode,
  };
}
