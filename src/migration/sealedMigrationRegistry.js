/**
 * The migrations at or below 1.17.0, sealed: closed to new entries and to metadata growth, and the
 * last of the entries carrying exactly `version`, `label` and `migrate`. They still run on a world
 * left at 0.0.0, so this is not a retired shape.
 */

import { migrateAlchemyCheckMode } from './migrateAlchemyCheckMode.js';
import { migrateBreakToolsOnFail } from './migrateBreakToolsOnFail.js';
import { migrateCatalystsToTools } from './migrateCatalystsToTools.js';
import { migrateRecipes, migrateCraftingSystems } from './migrateComponentId.js';
import { migrateEssencesToIngredientGroups } from './migrateEssencesToIngredientGroups.js';
import { migrateGatheringChecksToSystem } from './migrateGatheringChecksToSystem.js';
import { migrateGatheringConfig } from './migrateGatheringConfig.js';
import { migrateGatheringEconomy } from './migrateGatheringEconomy.js';
import { migrateGatheringLimitationToggles } from './migrateGatheringLimitationToggles.js';
import { migrateInvertRecipeItemLink } from './migrateInvertRecipeItemLink.js';
import { migrateLegacyResolutionModes } from './migrateLegacyResolutionModes.js';
import { migrateMoveRoutedByIngredientsCheck } from './migrateMoveRoutedByIngredientsCheck.js';
import { migrateNodeRespawnIntervals } from './migrateNodeRespawnIntervals.js';
import { migrateNodeRespawnModes } from './migrateNodeRespawnModes.js';
import { migrateRecipeItemCapsPerItem } from './migrateRecipeItemCapsPerItem.js';
import { migrateRemoveLegacyCheckSources } from './migrateRemoveLegacyCheckSources.js';
import { migrateRemoveResultSelectionProviders } from './migrateRemoveResultSelectionProviders.js';
import { migrateRemoveSystemProvider } from './migrateRemoveSystemProvider.js';
import { migrateRenameGatheringHazardsToEvents } from './migrateRenameGatheringHazardsToEvents.js';
import { migrateRenameGatheringRegionsToRealms } from './migrateRenameGatheringRegionsToRealms.js';
import { migrateRenameSourceUuidFields } from './migrateRenameSourceUuidFields.js';
import { migrateSplitRoutedResolutionModes } from './migrateSplitRoutedResolutionModes.js';
import { migrateStaminaRegenPolicy } from './migrateStaminaRegenPolicy.js';
import { migrateToolsToFirstClass } from './migrateToolsToFirstClass.js';
import { migrateToolsToSystem } from './migrateToolsToSystem.js';
import { migrateUnifyGatheringRegions } from './migrateUnifyGatheringRegions.js';
import { migrateVisibilityModeEnum } from './migrateVisibilityModeEnum.js';

/** The sealed half of `MIGRATIONS`, in version order and first within it. */
export const SEALED_MIGRATIONS = Object.freeze([
  {
    version: '0.1.0',
    label: 'Rename systemItemId to componentId',
    migrate: (data) => ({
      recipes: migrateRecipes(data.recipes),
      systems: migrateCraftingSystems(data.systems),
    }),
  },
  {
    version: '0.2.0',
    label: 'Clear stale top-level gathering regions',
    migrate: (data) => ({
      gatheringConfig: migrateGatheringConfig(data.gatheringConfig),
    }),
  },
  {
    version: '0.3.0',
    label: 'System-level gathering economy modes (remove attemptLimit/economyMode)',
    migrate: (data) => migrateGatheringEconomy(data.gatheringConfig, data.environments),
  },
  {
    version: '0.4.0',
    label: 'Collapse resource-node respawn policies to manual|overTime + gainMode',
    migrate: (data) => migrateNodeRespawnModes(data.gatheringConfig, data.environments),
  },
  {
    version: '0.5.0',
    label: 'Store node respawn intervals as unit+amount (calendar-aware) instead of raw seconds',
    migrate: (data) => migrateNodeRespawnIntervals(data.gatheringConfig, data.environments),
  },
  {
    version: '0.6.0',
    label: 'Convert catalysts to shared library Tools',
    migrate(data) {
      const { recipes, systems, migratedCount } = migrateCatalystsToTools(
        data.recipes,
        data.systems
      );
      // `_migratedCatalystCount` is transient: consumed by the runner for a GM notice, never
      // persisted as a setting.
      return { recipes, systems, _migratedCatalystCount: migratedCount };
    },
  },
  {
    version: '0.7.0',
    label: 'Reconcile UI-authored library tools from gatheringConfig onto the crafting system',
    migrate(data) {
      const { systems, gatheringConfig } = migrateToolsToSystem(data.systems, data.gatheringConfig);
      return { systems, gatheringConfig };
    },
  },
  {
    version: '0.8.0',
    label: 'Replace gathering economy mode enum with independent stamina/nodes toggles',
    migrate: (data) => migrateGatheringLimitationToggles(data.gatheringConfig),
  },
  {
    version: '0.9.0',
    label:
      'Unify gathering regions (vocabulary → GatheringRegion; drop region as a composition axis)',
    // Runs after 0.2.0 so it sees the per-system region vocab that migration preserves.
    // Reports through the transient `_unifiedRegionSystems` field.
    migrate: (data) => migrateUnifyGatheringRegions(data),
  },
  {
    version: '1.0.0',
    label: 'Rename gathering Hazard concept to Event (keys, policy values, region-modifier kind)',
    migrate: (data) => migrateRenameGatheringHazardsToEvents(data),
  },
  {
    version: '1.1.0',
    label: 'Rename gathering Region concept to Realm (system/environment/party keys)',
    // Must run strictly after 1.0.0, which still reads the pre-rename `gatheringRegions` key for
    // its per-region modifier rewrite.
    migrate: (data) => migrateRenameGatheringRegionsToRealms(data),
  },
  {
    version: '1.2.0',
    label: 'Unify stamina-regen policy name elapsedTime → overTime (matches node respawn)',
    migrate: (data) => migrateStaminaRegenPolicy(data.gatheringConfig),
  },
  {
    version: '1.3.0',
    label:
      'Remove the dnd5e/pf2e/macro provider model from gathering gates, checks, tool requirements, and character modifiers (formula-only)',
    migrate: (data) => migrateRemoveSystemProvider(data),
  },
  {
    version: '1.4.0',
    label:
      'Hard-migrate legacy mapped/tiered resolution modes to canonical routed + provider (ingredientSet/macroOutcome with tiered group-name reconciliation)',
    migrate: (data) => migrateLegacyResolutionModes(data),
  },
  {
    version: '1.5.0',
    label: 'Seed the system-level gathering check from per-task gathering check formulas',
    migrate(data) {
      const { systems, gatheringConfig } = migrateGatheringChecksToSystem(
        data.systems,
        data.gatheringConfig
      );
      return { systems, gatheringConfig };
    },
  },
  {
    version: '1.6.0',
    label:
      'Remove legacy routed result-selection providers (macroOutcome/rollTableOutcome → check); drop rollTableUuid; strip gathering-task result selections',
    migrate(data) {
      // Reports dropped roll-table recipes and steps plus stripped gathering tasks through the
      // transient `_removedResultSelectionProviders` field.
      const { recipes, gatheringConfig, _removedResultSelectionProviders } =
        migrateRemoveResultSelectionProviders(data);
      return { recipes, gatheringConfig, _removedResultSelectionProviders };
    },
  },
  {
    version: '1.7.0',
    label:
      'Rename consumeCatalystsOnFail → breakToolsOnFail on crafting/salvage consumption; ' +
      'strip residual dead catalysts arrays from recipes, component salvage, and gathering tasks',
    migrate: (data) => migrateBreakToolsOnFail(data),
  },
  {
    version: '1.8.0',
    label:
      'Remove deprecated check sources (root macroUuid/successMacroUuid/failureMacroUuid/checkSource/builtIn) from crafting/salvage/gathering checks, and the orphaned recipe resultSelection.macroUuid',
    migrate: (data) => migrateRemoveLegacyCheckSources(data),
  },
  {
    version: '1.9.0',
    label:
      'Split the crafting routed resolution mode into routedByIngredients/routedByCheck ' +
      '(majority provider wins, ties → routedByIngredients; minority recipes reconciled)',
    migrate: (data) => migrateSplitRoutedResolutionModes(data),
  },
  {
    version: '1.10.0',
    label:
      'Move routedByIngredients systems’ optional pass/fail crafting check from ' +
      'craftingCheck.routed to the shared craftingCheck.simple slot (tier ids preserved; routed formula cleared)',
    migrate: (data) => migrateMoveRoutedByIngredientsCheck(data),
  },
  {
    version: '1.11.0',
    label:
      'Move recipe-item use/learn caps from the system-wide recipeVisibility.knowledge config ' +
      'onto each recipe item definition (per-item caps; mode + dragDropEnabled stay system-wide)',
    migrate: (data) => migrateRecipeItemCapsPerItem(data),
  },
  {
    version: '1.12.0',
    label:
      'Seed the flat system-level visibilityMode enum (global/restricted/item/knowledge) ' +
      'from the legacy recipeVisibility.listMode + knowledge.mode pair (recipeVisibility kept)',
    migrate: (data) => migrateVisibilityModeEnum(data),
  },
  {
    version: '1.13.0',
    label:
      'Invert the recipe ↔ recipe-item link: move book/scroll membership onto each ' +
      'definition as recipeIds[] (many-to-many) and strip recipe.recipeItemId / linkedRecipeItemUuid',
    migrate: (data) => migrateInvertRecipeItemLink(data),
  },
  {
    version: '1.14.0',
    label:
      'Retire the per-recipe alchemy resultSelection.provider for the system-level ' +
      'alchemy.checkMode (none/simple/tiered); strip resultSelection; collapse multi-ingredient-set alchemy recipes',
    migrate: (data) => migrateAlchemyCheckMode(data),
  },
  {
    version: '1.15.0',
    label:
      'Convert legacy componentId-referencing library Tools into first-class tools carrying ' +
      'their own source references + name/img display snapshot (componentId preserved)',
    migrate: (data) => migrateToolsToFirstClass(data.systems),
  },
  {
    version: '1.16.0',
    label:
      'Rename registered-entry source-uuid fields (sourceUuid→registeredItemUuid, ' +
      'sourceItemUuid→originItemUuid, fallbackItemIds→aliasItemUuids) on components, ' +
      'recipe-item definitions, and tools',
    migrate: (data) => migrateRenameSourceUuidFields(data.systems),
  },
  {
    version: '1.17.0',
    label:
      'Supersede the per-set IngredientSet.essences map with first-class essence ingredient ' +
      'groups (single-option essence groups preserve AND semantics); reconcile alchemy signature ' +
      'collisions by disabling both colliding recipes',
    migrate(data) {
      // Reads and returns `{ recipes }`: ingredient sets live under the recipes setting, and
      // `data.systems` is read-only here for alchemy components. Reports the collision-disabled
      // recipe names through the transient `_essenceCollisionDisabledRecipes` field.
      const { recipes, _essenceCollisionDisabledRecipes } = migrateEssencesToIngredientGroups(data);
      return { recipes, _essenceCollisionDisabledRecipes };
    },
  },
]);
