/**
 * The system-level field normalizers (issue 1713): free pure functions the `CraftingSystemManager`
 * delegates to for the feature flags, the visibility strategy, the teaser, requirements and alchemy
 * sub-configs. Internal to that aggregate — a private continuation of the `_normalizeSystem`
 * chokepoint, reached only through the manager, so nothing else imports it.
 */

export function normalizeFeatures(system = {}) {
  const features = system.features || {};
  const has = (k) => Object.prototype.hasOwnProperty.call(features, k);
  // `complexRecipes` was removed as a feature (#102): recipe-control visibility
  // derives from resolution mode, not a persistent flag. It survives ONLY as a
  // legacy compatibility INPUT that seeds `multiStepRecipes` for old systems
  // saved before the rename; it is no longer emitted as a normalized feature.
  const multiStepEnabled = has('multiStepRecipes')
    ? features.multiStepRecipes === true
    : has('complexRecipes')
      ? features.complexRecipes === true
      : false;
  return {
    recipeCategories: true,
    // Transitional alias
    categories: true,
    itemTags: true,
    essences: has('essences') ? features.essences === true : system.enableEssences === true,
    multiStepRecipes: multiStepEnabled,
    propertyMacros: has('propertyMacros') ? features.propertyMacros === true : false,
    craftingChecks: has('craftingChecks') ? features.craftingChecks === true : false,
    outcomeRouting: has('outcomeRouting') ? features.outcomeRouting === true : false,
    effectTransfer: has('effectTransfer') ? features.effectTransfer === true : false,
    gathering: has('gathering') ? features.gathering === true : false,
    // Salvage is optional, defaulting ON for backward compatibility. When off the subsystem is
    // hidden and skipped, but authored component salvage config is preserved so the toggle is
    // reversible.
    salvage: has('salvage') ? features.salvage === true : true,
    chatOutput: has('chatOutput') ? features.chatOutput === true : true,
    itemPiles: has('itemPiles') ? features.itemPiles === true : false,
    // Whether a player self-cancelling an in-progress craft gets their consumed
    // ingredients + spent currency back (issue 848). Default ON for a forgiving
    // experience, but a GM may forfeit inputs on cancel by setting it false — an
    // explicit false is honoured, mirroring the `features.salvage` default-on toggle.
    refundOnPlayerCancel: has('refundOnPlayerCancel')
      ? features.refundOnPlayerCancel === true
      : true,
  };
}

// Flat system-level visibility STRATEGY enum (issue 511): `visibilityMode` ∈ {global,
// restricted, item, knowledge} gates the whole Crafting authoring surface, with unknown or
// missing reading as `knowledge`.
export function normalizeVisibilityMode(value) {
  return ['global', 'restricted', 'item', 'knowledge'].includes(value) ? value : 'knowledge';
}

export function normalizeRecipeVisibility(recipeVisibility = {}) {
  const listMode = ['global', 'player', 'knowledge', 'teaser'].includes(recipeVisibility?.listMode)
    ? recipeVisibility.listMode
    : 'global';
  const knowledge = recipeVisibility?.knowledge || {};
  return {
    listMode,
    knowledge: {
      mode: ['item', 'learned', 'itemOrLearned'].includes(knowledge?.mode)
        ? knowledge.mode
        : 'itemOrLearned',
      learn: {
        dragDropEnabled: knowledge?.learn?.dragDropEnabled !== false,
      },
    },
  };
}

export function normalizeTeaserConfig(config = {}) {
  if (!config || typeof config !== 'object') {
    return { enabled: false, discoveryMode: 'threshold', fragments: [] };
  }
  return {
    enabled: config.enabled === true,
    discoveryMode: ['threshold', 'fragments', 'both'].includes(config.discoveryMode)
      ? config.discoveryMode
      : 'threshold',
    fragments: Array.isArray(config.fragments)
      ? config.fragments.map((f) => normalizeTeaserFragment(f)).filter(Boolean)
      : [],
  };
}

function normalizeTeaserFragment(fragment = {}) {
  if (!fragment || typeof fragment !== 'object') return null;
  const id = String(fragment.id || '').trim();
  if (!id) return null;
  return {
    id,
    name: String(fragment.name || '').trim() || 'Fragment',
    linkedItemUuid: fragment.linkedItemUuid || null,
    recipeIds: Array.isArray(fragment.recipeIds)
      ? fragment.recipeIds.filter((id) => typeof id === 'string')
      : [],
    progressValue: Math.min(100, Math.max(0, Number(fragment.progressValue) || 0)),
  };
}

export function normalizeRequirements(requirements = {}) {
  const time = requirements?.time || {};
  const currency = requirements?.currency || {};
  return {
    time: {
      // Default ON for backward compatibility, mirroring the `features.salvage` convention:
      // recipes authored before this toggle carry configs that already run, so only an explicit
      // `false` disables them. Upgraded worlds are re-defaulted on once by the 1.19.0
      // `migrateDefaultOnTimeRequirements` migration, not here on read.
      enabled: time.enabled !== false,
    },
    currency: normalizeCurrencyConfig(currency),
  };
}

/** Normalize the per-system currency block, which since issue 1278 is ONLY the participation
 * flag, because a world runs one Foundry game system and so has one way actors store coins.
 * This whitelist rebuild sheds the pre-1278 sibling keys, which the 1.26.0 migration lifts into
 * the world config before any system write. */
export function normalizeCurrencyConfig(currency = {}) {
  return { enabled: currency?.enabled === true };
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v || '').trim()).filter(Boolean))];
}

// Normalise the alchemy sub-config for alchemy-mode systems.
// Accepts both 'alchemy' (canonical) and 'cauldron' (T-189 legacy alias) so that persisted
// data written before the rename continues to produce a valid config object on load.
export function normalizeAlchemyConfig(config, resolutionMode) {
  if (resolutionMode !== 'alchemy' && resolutionMode !== 'cauldron') return null; // T-189: accept both
  const c = config && typeof config === 'object' ? config : {};
  // System-level alchemy check mode, replacing the retired per-recipe `resultSelection.provider`:
  // `none` (a matched brew always succeeds), `simple` (mandatory pass/fail) or `tiered`
  // (mandatory routed check, identical routing to `routedByCheck`). Defaults to `none`.
  const checkMode = ['none', 'simple', 'tiered'].includes(c.checkMode) ? c.checkMode : 'none';
  return {
    checkMode,
    // Defaults ON (issue 966). Alchemy's `global` visibility mode reveals a recipe ONLY from
    // `learnedRecipes`, which only this flag ever writes, so an absent flag left the most
    // permissive-sounding mode revealing nothing. An explicitly stored `false` is honoured.
    learnOnCraft: c.learnOnCraft !== false,
    consumeOnFail: c.consumeOnFail !== false,
    showAttemptHistoryToPlayers: c.showAttemptHistoryToPlayers !== false,
  };
}
