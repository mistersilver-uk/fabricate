import { stripRetiredModifierPlaceholder } from '../utils/craftingCheckExpression.js';

/** Canonical salvage modes; legacy `tiered`/`mapped` are rewritten upstream (1.4.0 migration). */
const SALVAGE_MODES = ['simple', 'routed', 'progressive'];

/** A config with a non-blank `rollFormula`: the one notion of a usable check (issue 859). */
export function hasCheckFormula(config) {
  return typeof config?.rollFormula === 'string' && config.rollFormula.trim().length > 0;
}

/**
 * The single derivation of the active salvage check (issue 859), read from
 * `system.salvageCraftingCheck`, never the recipe `craftingCheck`. An absent or unsupported mode
 * reports `simple`, but a caller that mutates must test `unsupportedMode` before `mode`.
 * `rollFormula` is trimmed with the retired placeholder stripped before the emptiness test that
 * sets `checkUsable` (issue 1094); `requiresCheck` marks `routed` and `progressive`, which abort
 * with zero mutation when `!checkUsable`.
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
