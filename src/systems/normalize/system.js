/**
 * The whole-system normalizer (issue 1923): the whitelist rebuild behind
 * `CraftingSystemManager._normalizeSystem`, which injects both Valid Id Bases as `basis`. Internal
 * to that aggregate, so only the manager imports it.
 */
import { deriveToolSourceFromComponents } from '../../migration/migrateToolsToFirstClass.js';
import { normalizeCategoryIconMap } from '../../utils/categoryIcons.js';
import { normalizeCharacterPrerequisiteList } from '../characterPrerequisites.js';
import { normalizeGatheringRealmSettings } from '../gatheringRealms.js';
import { normalizeModifierLibrary } from '../modifierLibrary.js';

import { normalizeComponent } from './components.js';
import {
  normalizeCraftingCheck,
  normalizeGatheringCraftingCheck,
  normalizeSalvageCraftingCheck,
} from './craftingCheck.js';
import { looksLikeDocumentUuid, normalizeEssenceDefinitions } from './essences.js';
import { normalizeRecipeItemDefinitions } from './recipeItems.js';
import { salvageNormalizationContext } from './salvage.js';
import {
  normalizeAlchemyConfig,
  normalizeFeatures,
  normalizeRecipeVisibility,
  normalizeRequirements,
  normalizeStringList,
  normalizeTeaserConfig,
  normalizeVisibilityMode,
} from './systemFields.js';
import { normalizeTool } from './tools.js';

/** The basis an omitted `basis` answers: every half UNKNOWN (`null`), so nothing is pruned. */
const unknownCharacterLibraryBasis = () => ({ prerequisiteIds: null, modifierIds: null });
const unknownScopeBasis = () => ({
  componentIds: null,
  essenceIds: null,
  toolIds: null,
  componentCategories: null,
  recipeCategories: null,
});

/** The names an icon map may carry: `general` plus the vocabulary for a known basis, or the map's
 * own keys for an unknown one, so keys are still normalized while nothing is pruned. */
function _iconAllowance(icons, vocabulary) {
  if (vocabulary !== null) return ['general', ...vocabulary];
  return icons && typeof icons === 'object' && !Array.isArray(icons) ? Object.keys(icons) : [];
}

function _normalizeResolutionMode(raw) {
  if (raw === 'cauldron') return 'alchemy'; // T-189: legacy alias
  // Legacy mode token aliases: `mapped` and bare `routed` → `routedByIngredients` (the 1.9.0
  // migration's tie-break), `tiered` → `routedByCheck`.
  if (raw === 'mapped' || raw === 'routed') return 'routedByIngredients';
  if (raw === 'tiered') return 'routedByCheck';
  return ['simple', 'routedByIngredients', 'routedByCheck', 'progressive', 'alchemy'].includes(raw)
    ? raw
    : 'simple';
}

/** Tool-breakage authority (issue 419), absence-preserving since 1.30.0 (issue 1363) so the world
 * half of `resolveToolBreakageAuthority` is reachable; every stored value is authored. */
function _normalizeToolBreakageAuthority(raw) {
  return ['toolSpecific', 'checkDriven'].includes(raw?.authority)
    ? { toolBreakage: { authority: raw.authority } }
    : {};
}

function normalizeSystemComponents(system, validEssenceIds, salvageContext) {
  const rawManagedItems = Array.isArray(system.components)
    ? system.components
    : Array.isArray(system.managedItems)
      ? system.managedItems
      : system.items;
  return Array.isArray(rawManagedItems)
    ? rawManagedItems.map((i) =>
        normalizeComponent(i, {
          validEssenceIds,
          salvageResolutionMode: salvageContext.salvageResolutionMode,
          salvageSimpleCheckHasFormula: salvageContext.salvageSimpleCheckHasFormula,
        })
      )
    : [];
}

/** First-class Tools (issue 561): a component-linked tool derives source refs and snapshot from
 * its component, after component normalization, so it matches owned items by source. */
function normalizeSystemTools(system, items, itemById, validToolPrerequisiteIds) {
  const normalizedTools = Array.isArray(system.tools)
    ? system.tools.map((t) => normalizeTool(t, { validPrerequisiteIds: validToolPrerequisiteIds }))
    : [];
  for (const normalizedTool of normalizedTools) {
    if (deriveToolSourceFromComponents(normalizedTool, items) && !normalizedTool.description) {
      normalizedTool.description = itemById.get(normalizedTool.componentId)?.description || '';
    }
  }
  return normalizedTools;
}

/** Each essence definition's source link, resolved against the normalized components. */
function linkEssenceSources(essenceDefinitions, itemIds, itemById, scopeBasis) {
  return essenceDefinitions.map((def) => {
    const sourceComponentId =
      def.sourceComponentId ||
      def.associatedSystemItemId ||
      (itemIds.has(def.sourceItemUuid) ? def.sourceItemUuid : null);
    const sourceComponent = sourceComponentId ? itemById.get(sourceComponentId) || null : null;
    // A source component absent from `items` nulls the uuid only under a known basis; otherwise
    // the id may name a component this client cannot see, and nulling would persist a deletion.
    const sourceItemUuid = sourceComponentId
      ? sourceComponent?.originItemUuid ||
        sourceComponent?.registeredItemUuid ||
        (scopeBasis.componentIds === null && looksLikeDocumentUuid(def.sourceItemUuid)
          ? def.sourceItemUuid
          : null)
      : looksLikeDocumentUuid(def.sourceItemUuid)
        ? def.sourceItemUuid
        : null;
    return {
      ...def,
      sourceComponentId,
      sourceItemUuid,
      associatedSystemItemId: sourceComponentId, // transitional alias kept in sync
    };
  });
}

function systemAuthoringFields(system, parts) {
  const { systemId, features, resolvedEssenceDefinitions, recipeItemDefinitions } = parts;
  return {
    id: systemId,
    name: system.name || 'New Crafting System',
    description: system.description || '',
    enabled: system.enabled !== false,
    resolutionMode: _normalizeResolutionMode(system.resolutionMode),
    features,
    itemTags: normalizeStringList(system.itemTags ?? system.tags),
    // The flat system visibility enum (issue 511); `recipeVisibility` stays for its residual
    // `knowledge.learn.dragDropEnabled`.
    visibilityMode: normalizeVisibilityMode(system.visibilityMode),
    recipeVisibility: normalizeRecipeVisibility(system.recipeVisibility),
    requirements: normalizeRequirements(system.requirements),
    essenceDefinitions: resolvedEssenceDefinitions,
    recipeItemDefinitions,
    // Which basis resolves book membership (issue 1011): monotonic, an OR over the persisted
    // value, so emptying the last array never flips it back.
    membershipResolvesByRecipeIds:
      system.membershipResolvesByRecipeIds === true ||
      recipeItemDefinitions.some((def) => Array.isArray(def.recipeIds) && def.recipeIds.length > 0),
    // A surviving legacy copy is carried through until the migration removes it (issue 1308).
    ...(parts.legacyModifiers.length > 0 && { modifiers: parts.legacyModifiers }),
  };
}

function systemCheckFields(system, { validCatalogueIds, salvageResolutionMode }) {
  return {
    craftingCheck: normalizeCraftingCheck(system.craftingCheck, validCatalogueIds),
    salvageResolutionMode,
    ..._normalizeToolBreakageAuthority(system.toolBreakage),
    salvageCraftingCheck: normalizeSalvageCraftingCheck(
      system.salvageCraftingCheck,
      validCatalogueIds
    ),
    gatheringCraftingCheck: normalizeGatheringCraftingCheck(
      system.gatheringCraftingCheck,
      validCatalogueIds
    ),
    alchemy: normalizeAlchemyConfig(system.alchemy ?? system.cauldron, system.resolutionMode),
    teaserConfig: normalizeTeaserConfig(system.teaserConfig),
  };
}

function systemLibraryFields(system, parts) {
  const { scopeBasis, features, resolvedEssenceDefinitions, legacyCharacterPrerequisites } = parts;
  return {
    // The component category vocabulary (issue 676), never merged with recipe `categories`.
    componentCategories: scopeBasis.componentCategories ?? [],
    // Per-category icons (issue 689), each map pruned against its own vocabulary basis.
    categoryIcons: normalizeCategoryIconMap(
      system.categoryIcons,
      _iconAllowance(system.categoryIcons, scopeBasis.recipeCategories)
    ),
    componentCategoryIcons: normalizeCategoryIconMap(
      system.componentCategoryIcons,
      _iconAllowance(system.componentCategoryIcons, scopeBasis.componentCategories)
    ),
    // Transitional aliases for existing UI code paths
    categories: scopeBasis.recipeCategories ?? [],
    tags: normalizeStringList(system.tags ?? system.itemTags),
    essences: resolvedEssenceDefinitions.map((def) => def.id),
    enableTags: true,
    enableEssences: features.essences === true,
    enableCategories: true,
    enableMultiStepRecipes: features.multiStepRecipes === true,
    components: parts.items,
    tools: parts.normalizedTools,
    ...(legacyCharacterPrerequisites.length > 0 && {
      characterPrerequisites: legacyCharacterPrerequisites,
    }),
    // Participation only (issue 1282): omitting `gatheringRealms` removes the stale per-system
    // copy, so the 1.27.0 migration must run before any system save.
    gatheringRealmSettings: normalizeGatheringRealmSettings(
      system.gatheringRealmSettings ?? system.gatheringRegionSettings
    ),
  };
}

/**
 * Normalize one stored crafting system. `basis.characterLibraryBasis(system)` and
 * `basis.scopeBasis(system)` answer the Valid Id Bases at their original call positions; an
 * omitted `basis` is UNKNOWN throughout, never an empty Set.
 */
export function normalizeSystem(system = {}, basis) {
  const systemId = system.id || foundry.utils.randomID();
  const features = normalizeFeatures(system);
  const essenceDefinitions = normalizeEssenceDefinitions(
    system.essenceDefinitions ?? system.essences
  );
  const recipeItemDefinitions = normalizeRecipeItemDefinitions(
    system.recipeItemDefinitions ?? system.recipeItems
  );
  // Prerequisites normalize before Tools, against the world-scope library basis (issue 1308).
  const characterLibraryBasis = basis?.characterLibraryBasis ?? unknownCharacterLibraryBasis;
  const { prerequisiteIds: validToolPrerequisiteIds, modifierIds: validCatalogueIds } =
    characterLibraryBasis(system);
  const legacyModifiers = normalizeModifierLibrary(system.modifiers);
  const legacyCharacterPrerequisites = normalizeCharacterPrerequisiteList(
    system.characterPrerequisites,
    () => foundry.utils.randomID()
  );
  // The world-scope basis (issue 1359) is judged on the raw system with its essence half taken
  // from the already-normalized definitions.
  const scopeBasis = (basis?.scopeBasis ?? unknownScopeBasis)({ ...system, essenceDefinitions });
  const salvageContext = salvageNormalizationContext(system);
  const items = normalizeSystemComponents(system, scopeBasis.essenceIds, salvageContext);
  const itemIds = new Set(items.map((i) => i.id));
  const itemById = new Map(items.map((i) => [i.id, i]));
  const normalizedTools = normalizeSystemTools(system, items, itemById, validToolPrerequisiteIds);
  const resolvedEssenceDefinitions = linkEssenceSources(
    essenceDefinitions,
    itemIds,
    itemById,
    scopeBasis
  );

  return {
    ...systemAuthoringFields(system, {
      systemId,
      features,
      resolvedEssenceDefinitions,
      recipeItemDefinitions,
      legacyModifiers,
    }),
    ...systemCheckFields(system, {
      validCatalogueIds,
      salvageResolutionMode: salvageContext.salvageResolutionMode,
    }),
    ...systemLibraryFields(system, {
      scopeBasis,
      features,
      resolvedEssenceDefinitions,
      legacyCharacterPrerequisites,
      items,
      normalizedTools,
    }),
  };
}
