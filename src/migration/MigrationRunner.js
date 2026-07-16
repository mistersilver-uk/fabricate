/**
 * T-013: Startup Schema Migration Framework
 *
 * MigrationRunner runs versioned, idempotent data migrations on startup.
 * Each migration is registered in the MIGRATIONS array with a version and label.
 * The runner reads the last-run version from a persisted setting and only runs
 * migrations newer than that version, in order.
 */

import { SETTING_KEYS } from '../config/settings.js';

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
import { migrateRetireProgressiveAllowPlayerReorder } from './migrateRetireProgressiveAllowPlayerReorder.js';
import { migrateSplitRoutedResolutionModes } from './migrateSplitRoutedResolutionModes.js';
import { migrateStaminaRegenPolicy } from './migrateStaminaRegenPolicy.js';
import { migrateToolsToFirstClass } from './migrateToolsToFirstClass.js';
import { migrateToolsToSystem } from './migrateToolsToSystem.js';
import { migrateUnifyGatheringRegions } from './migrateUnifyGatheringRegions.js';
import { migrateVisibilityModeEnum } from './migrateVisibilityModeEnum.js';
import { isFatalMigrationError } from './migrationErrors.js';

export { FatalMigrationError, isFatalMigrationError } from './migrationErrors.js';

// ---------------------------------------------------------------------------
// Semver comparison utility (no npm dependency)
// ---------------------------------------------------------------------------

/**
 * Compare two semver strings numerically.
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
 */
function compareSemver(a, b) {
  const pa = String(a)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b)
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

/**
 * True when a value is the transient `_removedResultSelectionProviders` payload shape
 * emitted by the 1.6.0 migration (an object carrying at least one of the two arrays).
 * @param {*} value
 * @returns {boolean}
 */
function _isRemovedProvidersPayload(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Array.isArray(value.droppedRollTableRecipes) || Array.isArray(value.strippedGatheringTasks))
  );
}

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

const MIGRATIONS = [
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
      // Surface the migrated-catalyst count so the runner can fire a one-time GM notice.
      // (Spread-merged into the accumulated data; `_migratedCatalystCount` is consumed by
      // the runner and never persisted as a setting.)
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
    // Runs after the 0.2.0 migration (which preserves per-system region vocab)
    // so it sees that vocab. Surfaces the names of systems that had regions via
    // a transient `_unifiedRegionSystems` field for the runner's GM notice.
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
    // Must run strictly after 1.0.0, which still reads the pre-rename
    // `gatheringRegions` key for its per-region modifier rewrite. Semver-sorted
    // application keeps 1.1.0 after 1.0.0, so the rename only fires once the
    // earlier migrations have consumed the old schema.
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
      // Surfaces dropped roll-table recipes/steps + stripped gathering tasks via the
      // transient `_removedResultSelectionProviders` field (consumed by the runner for
      // a one-time GM recovery notice, then stripped — never persisted).
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
      // Reads/returns `{ recipes }` (ingredient sets live under the recipes setting;
      // data.systems holds zero sets and is read read-only for alchemy components).
      // Surfaces the collision-disabled recipe names via the transient
      // `_essenceCollisionDisabledRecipes` field (consumed by the runner for a
      // one-time GM notice, then stripped — never persisted).
      const { recipes, _essenceCollisionDisabledRecipes } = migrateEssencesToIngredientGroups(data);
      return { recipes, _essenceCollisionDisabledRecipes };
    },
  },
  {
    version: '1.18.0',
    label:
      'Strip the retired system-level progressive allowPlayerReorder from the crafting, ' +
      'salvage and gathering checks (the reorder permission now lives on the recipe and on salvage)',
    // The last release before the flag was retired: a world downgraded to it still finds
    // its own schema, since this migration only removes a key that release ignored.
    // (1.17.0 is the essence-ingredient migration; this took 1.18.0 on rebase.)
    downgradeTo: '1.17.0',
    migrate: (data) => migrateRetireProgressiveAllowPlayerReorder(data.systems),
  },
  // Future migrations added here in version order
];

// ---------------------------------------------------------------------------
// MigrationRunner class
// ---------------------------------------------------------------------------

export class MigrationRunner {
  /**
   * @param {{
   *   getSetting: Function,
   *   setSetting: Function,
   *   moduleVersion?: string,
   *   promptRecovery?: Function,
   *   migrations?: Array<{ version: string, label: string, migrate: Function, downgradeTo?: string }>
   * }} opts
   *   `promptRecovery` is an optional seam invoked with the abort context so the
   *   caller can present a GM decision prompt; `migrations` overrides the default
   *   registry (used by tests to inject a fatal migration) and defaults to the
   *   production `MIGRATIONS`.
   */
  constructor({ getSetting, setSetting, moduleVersion, promptRecovery, migrations } = {}) {
    this._getSetting = getSetting;
    this._setSetting = setSetting;
    this._moduleVersion = moduleVersion;
    this._promptRecovery = promptRecovery;
    this._migrations = Array.isArray(migrations) ? migrations : MIGRATIONS;
  }

  /**
   * Run all pending migrations in order.
   * Only persists data when changes are detected.
   * Updates migrationVersion to the highest migration version that ran.
   *
   * @returns {Promise<{ ran: number, aborted: boolean, migratedCatalystCount: number, unifiedRegionSystems: string[], removedResultSelectionProviders: { droppedRollTableRecipes: object[], strippedGatheringTasks: object[] }, abortedMigration?: string, downgradeTo?: string|null, failures?: object[] }>}
   *   a summary of the run so the caller can fire one-time edge effects (e.g. the
   *   GM catalyst-migration and region-unification notices) or surface an aborted pass.
   */
  async run() {
    const lastRunVersion = this._getSetting(SETTING_KEYS.MIGRATION_VERSION) ?? '0.0.0';

    const pending = this._migrations
      .filter((m) => compareSemver(m.version, lastRunVersion) > 0)
      .sort((a, b) => compareSemver(a.version, b.version));

    if (pending.length === 0) {
      return {
        ran: 0,
        aborted: false,
        migratedCatalystCount: 0,
        unifiedRegionSystems: [],
        removedResultSelectionProviders: {
          droppedRollTableRecipes: [],
          strippedGatheringTasks: [],
        },
        essenceCollisionDisabledRecipes: [],
      };
    }

    const rawRecipes = this._getSetting(SETTING_KEYS.RECIPES) ?? [];
    const rawSystems = this._getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) ?? [];
    const rawGatheringConfig = this._getSetting(SETTING_KEYS.GATHERING_CONFIG) ?? {};
    const rawEnvironments = this._getSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS) ?? [];
    const rawGatheringParties = this._getSetting(SETTING_KEYS.GATHERING_PARTIES) ?? [];

    const originalRecipesJson = JSON.stringify(rawRecipes);
    const originalSystemsJson = JSON.stringify(rawSystems);
    const originalGatheringConfigJson = JSON.stringify(rawGatheringConfig);
    const originalEnvironmentsJson = JSON.stringify(rawEnvironments);
    const originalGatheringPartiesJson = JSON.stringify(rawGatheringParties);

    let data = {
      recipes: rawRecipes,
      systems: rawSystems,
      gatheringConfig: rawGatheringConfig,
      environments: rawEnvironments,
      gatheringParties: rawGatheringParties,
    };
    let highestVersion = lastRunVersion;
    let migratedCatalystCount = 0;
    let unifiedRegionSystems = [];
    let removedResultSelectionProviders = {
      droppedRollTableRecipes: [],
      strippedGatheringTasks: [],
    };

    for (const migration of pending) {
      // Capture the last known-good transformed payload BEFORE running this
      // migration as the rollback baseline (spec § Startup Migration Flow step 8
      // / Per-Migration Error Handling). The deep clone isolates it from any
      // in-place mutation a fatal migration performs before throwing.
      const checkpoint = JSON.parse(JSON.stringify(data));
      try {
        const result = migration.migrate(data);
        if (result && typeof result === 'object') {
          // Spread-merge so a migration that returns only a subset of keys
          // (e.g., the 0.1.0 migration returns { recipes, systems } and does
          // not touch gatheringConfig) leaves the untouched keys intact.
          data = { ...data, ...result };
        }
        highestVersion = migration.version;
      } catch (error) {
        if (isFatalMigrationError(error)) {
          // Fatal: roll the in-memory payload back to the last known-good
          // checkpoint, emit recovery guidance, persist NOTHING (no
          // recipe/system/gathering writes and no migrationVersion bump), and
          // abort the pass (spec § Per-Migration Error Handling / Migration
          // Abort Recovery Guidance). Because the aborted pass returns before any
          // persistence, restoring `data` here keeps the in-memory state
          // consistent for any post-return inspection of the checkpoint.
          data = checkpoint;
          void data;

          const downgradeTo =
            error.downgradeTo ?? migration.downgradeTo ?? this._moduleVersion ?? null;
          const failures = Array.isArray(error.documents) ? error.documents : [];

          this._emitMigrationRecoveryGuidance(migration, error, downgradeTo);

          // Optional GM decision-prompt seam (defaults to "Keep existing data").
          this._promptRecovery?.({ downgradeTo, documents: failures, label: migration.label });

          return {
            ran: 0,
            aborted: true,
            abortedMigration: migration.label,
            downgradeTo,
            failures,
            migratedCatalystCount: 0,
            unifiedRegionSystems: [],
            removedResultSelectionProviders: {
              droppedRollTableRecipes: [],
              strippedGatheringTasks: [],
            },
            essenceCollisionDisabledRecipes: [],
          };
        }
        console.warn(`Fabricate | Migration "${migration.label}" failed: ${error.message}`);
      }
    }

    // The 0.6.0 catalyst→tool migration reports how many catalysts it converted via a
    // transient `_migratedCatalystCount` field. Capture it for the GM notice and strip it
    // so it is never persisted as part of any setting payload.
    if (Number.isFinite(Number(data._migratedCatalystCount))) {
      migratedCatalystCount = Number(data._migratedCatalystCount);
    }
    delete data._migratedCatalystCount;

    // The 0.9.0 region-unification migration reports the names of systems that had
    // legacy regions via a transient `_unifiedRegionSystems` field. Capture it for
    // the GM notice and strip it so it is never persisted as part of any setting.
    if (Array.isArray(data._unifiedRegionSystems)) {
      unifiedRegionSystems = data._unifiedRegionSystems.map(String);
    }
    delete data._unifiedRegionSystems;

    // The 1.6.0 legacy-result-selection-provider migration reports the recipes/steps
    // whose dropped `rollTableUuid` needs manual reconfiguration and the gathering
    // tasks whose `resultSelection` was stripped (the GM must populate
    // `gatheringCraftingCheck.routed.rollFormula`). Capture it for the GM notice and
    // strip it so it is never persisted as part of any setting payload.
    if (_isRemovedProvidersPayload(data._removedResultSelectionProviders)) {
      removedResultSelectionProviders = {
        droppedRollTableRecipes:
          data._removedResultSelectionProviders.droppedRollTableRecipes ?? [],
        strippedGatheringTasks: data._removedResultSelectionProviders.strippedGatheringTasks ?? [],
      };
    }
    delete data._removedResultSelectionProviders;

    // The 1.17.0 essence-group migration reports the recipes it disabled to clear a
    // newly-introduced alchemy signature collision. Capture the names for the GM
    // notice and strip the transient field so it is never persisted.
    let essenceCollisionDisabledRecipes = [];
    if (Array.isArray(data._essenceCollisionDisabledRecipes)) {
      essenceCollisionDisabledRecipes = data._essenceCollisionDisabledRecipes.map(String);
    }
    delete data._essenceCollisionDisabledRecipes;

    const recipesChanged = JSON.stringify(data.recipes) !== originalRecipesJson;
    const systemsChanged = JSON.stringify(data.systems) !== originalSystemsJson;
    const gatheringConfigChanged =
      JSON.stringify(data.gatheringConfig) !== originalGatheringConfigJson;
    const environmentsChanged = JSON.stringify(data.environments) !== originalEnvironmentsJson;
    const gatheringPartiesChanged =
      JSON.stringify(data.gatheringParties) !== originalGatheringPartiesJson;

    if (recipesChanged) {
      await this._setSetting(SETTING_KEYS.RECIPES, data.recipes);
    }
    if (systemsChanged) {
      await this._setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, data.systems);
    }
    if (gatheringConfigChanged) {
      await this._setSetting(SETTING_KEYS.GATHERING_CONFIG, data.gatheringConfig);
    }
    if (environmentsChanged) {
      await this._setSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS, data.environments);
    }
    if (gatheringPartiesChanged) {
      await this._setSetting(SETTING_KEYS.GATHERING_PARTIES, data.gatheringParties);
    }

    await this._setSetting(SETTING_KEYS.MIGRATION_VERSION, highestVersion);

    console.log(`Fabricate | Migrations complete: ran ${pending.length} migration(s)`);

    return {
      ran: pending.length,
      aborted: false,
      migratedCatalystCount,
      unifiedRegionSystems,
      removedResultSelectionProviders,
      essenceCollisionDisabledRecipes,
    };
  }

  /**
   * Emit GM-facing recovery guidance to the console after a migration pass aborts.
   *
   * Output (spec § Migration Abort Recovery Guidance):
   *  - a clear abort header confirming existing data was kept unchanged,
   *  - a recommended downgrade target version,
   *  - per-document fix instructions (type, id/name, exact error, required fix),
   *  - macro-oriented remediation hints when present.
   *
   * @param {{ label: string }} migration
   * @param {{ message?: string, documents?: object[] }} error
   * @param {string|null} downgradeTo
   */
  _emitMigrationRecoveryGuidance(migration, error, downgradeTo) {
    console.error('Fabricate | Migration aborted. Existing data has been kept unchanged.');
    console.error(`Fabricate | Aborted during migration: "${migration.label}"`);
    if (error?.message) {
      console.error(`Fabricate | Reason: ${error.message}`);
    }

    const downgradeTarget = downgradeTo ?? 'unknown';
    console.error(
      `Fabricate | Recommended action: downgrade Fabricate to version ${downgradeTarget} to continue using your existing data without manual remediation.`
    );

    const documents = Array.isArray(error?.documents) ? error.documents : [];
    if (documents.length === 0) {
      console.error('Fabricate | No per-document failure details were provided by this migration.');
      return;
    }

    console.error(`Fabricate | ${documents.length} document(s) require manual remediation:`);
    let index = 0;
    for (const doc of documents) {
      index += 1;
      const type = doc?.type ?? 'unknown';
      const identity = doc?.id ?? doc?.name ?? 'unknown';
      const name = doc?.name ? ` (${doc.name})` : '';
      console.error(
        `Fabricate |   [${index}] ${type} ${identity}${name}: ${doc?.error ?? 'unknown error'}`
      );
      console.error(`Fabricate |       Fix: ${doc?.fix ?? 'no fix action provided'}`);
      if (doc?.macroHint) {
        console.error(`Fabricate |       Macro hint: ${doc.macroHint}`);
      }
    }
  }
}
