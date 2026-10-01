/**
 * Whether the crafting check a recipe's mode rolls would refuse before any roll for one actor
 * (issue 2139), decided as `CraftingEngine#_versionedCheckTarget` decides it: a used or required
 * slot refuses a target or pool path the character lacks, or a summed progressive roll-under.
 */

import { resolveActiveCraftingCheckFormula } from './checkModifierResolver.js';
import { actorRollData } from './checkTarget.js';
import { progressiveCheckRefusal, resolveActivityCheck } from './countCheck.js';

/** The recipe's selected difficulty tier on `config`, or null. */
function selectedTier(config, recipe) {
  const tierId = recipe?.checkTierId;
  const tiers = Array.isArray(config?.tiers) ? config.tiers : [];
  return tierId ? (tiers.find((entry) => entry?.id === tierId) ?? null) : null;
}

/** The engine's fixed anchor before any macro: the selected tier's DC, else the slot's, else 15. */
function anchorDc(config, tier) {
  const tierDc = Number(tier?.dc);
  if (tier && Number.isFinite(tierDc)) return Math.trunc(tierDc);
  return Number.isFinite(Number(config?.dc)) ? Math.trunc(Number(config.dc)) : 15;
}

/** `false` with no actor, since the listing asks only of a chosen character. */
export function craftingCheckRefuses(system, recipe, actor) {
  if (!actor) return false;
  const active = resolveActiveCraftingCheckFormula(system);
  if (!active.slot || !(active.checkUsable || active.requiresCheck)) return false;
  const readRollData = () => actorRollData(actor);
  if (active.slot === 'progressive') {
    return progressiveCheckRefusal(active.config, readRollData) !== null;
  }
  const tier = selectedTier(active.config, recipe);
  const resolved = resolveActivityCheck(active.config, {
    anchor: anchorDc(active.config, tier),
    override: tier?.adjustment,
    label: tier?.name ?? '',
    readRollData,
  });
  return resolved.ok !== true;
}
