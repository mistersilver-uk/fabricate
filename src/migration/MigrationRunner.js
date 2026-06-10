/**
 * T-013: Startup Schema Migration Framework
 *
 * MigrationRunner runs versioned, idempotent data migrations on startup.
 * Each migration is registered in the MIGRATIONS array with a version and label.
 * The runner reads the last-run version from a persisted setting and only runs
 * migrations newer than that version, in order.
 */

import { migrateRecipes, migrateCraftingSystems } from './migrateComponentId.js';
import { migrateGatheringConfig } from './migrateGatheringConfig.js';
import { migrateGatheringEconomy } from './migrateGatheringEconomy.js';
import { migrateNodeRespawnModes } from './migrateNodeRespawnModes.js';
import { migrateNodeRespawnIntervals } from './migrateNodeRespawnIntervals.js';
import { migrateCatalystsToTools } from './migrateCatalystsToTools.js';
import { migrateToolsToSystem } from './migrateToolsToSystem.js';
import { migrateGatheringLimitationToggles } from './migrateGatheringLimitationToggles.js';
import { migrateUnifyGatheringRegions } from './migrateUnifyGatheringRegions.js';
import { SETTING_KEYS } from '../config/settings.js';

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
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Migration registry
// ---------------------------------------------------------------------------

const MIGRATIONS = [
  {
    version: '0.1.0',
    label: 'Rename systemItemId to componentId',
    migrate(data) {
      return {
        recipes: migrateRecipes(data.recipes),
        systems: migrateCraftingSystems(data.systems)
      };
    }
  },
  {
    version: '0.2.0',
    label: 'Clear stale top-level gathering regions',
    migrate(data) {
      return {
        gatheringConfig: migrateGatheringConfig(data.gatheringConfig)
      };
    }
  },
  {
    version: '0.3.0',
    label: 'System-level gathering economy modes (remove attemptLimit/economyMode)',
    migrate(data) {
      return migrateGatheringEconomy(data.gatheringConfig, data.environments);
    }
  },
  {
    version: '0.4.0',
    label: 'Collapse resource-node respawn policies to manual|overTime + gainMode',
    migrate(data) {
      return migrateNodeRespawnModes(data.gatheringConfig, data.environments);
    }
  },
  {
    version: '0.5.0',
    label: 'Store node respawn intervals as unit+amount (calendar-aware) instead of raw seconds',
    migrate(data) {
      return migrateNodeRespawnIntervals(data.gatheringConfig, data.environments);
    }
  },
  {
    version: '0.6.0',
    label: 'Convert catalysts to shared library Tools',
    migrate(data) {
      const { recipes, systems, migratedCount } = migrateCatalystsToTools(data.recipes, data.systems);
      // Surface the migrated-catalyst count so the runner can fire a one-time GM notice.
      // (Spread-merged into the accumulated data; `_migratedCatalystCount` is consumed by
      // the runner and never persisted as a setting.)
      return { recipes, systems, _migratedCatalystCount: migratedCount };
    }
  },
  {
    version: '0.7.0',
    label: 'Reconcile UI-authored library tools from gatheringConfig onto the crafting system',
    migrate(data) {
      const { systems, gatheringConfig } = migrateToolsToSystem(data.systems, data.gatheringConfig);
      return { systems, gatheringConfig };
    }
  },
  {
    version: '0.8.0',
    label: 'Replace gathering economy mode enum with independent stamina/nodes toggles',
    migrate(data) {
      return migrateGatheringLimitationToggles(data.gatheringConfig);
    }
  },
  {
    version: '0.9.0',
    label: 'Unify gathering regions (vocabulary → GatheringRegion; drop region as a composition axis)',
    migrate(data) {
      // Runs after the 0.2.0 migration (which preserves per-system region vocab)
      // so it sees that vocab. Surfaces the names of systems that had regions via
      // a transient `_unifiedRegionSystems` field for the runner's GM notice.
      return migrateUnifyGatheringRegions(data);
    }
  }
  // Future migrations added here in version order
];

// ---------------------------------------------------------------------------
// MigrationRunner class
// ---------------------------------------------------------------------------

export class MigrationRunner {
  /**
   * @param {{ getSetting: Function, setSetting: Function, moduleVersion?: string }} opts
   */
  constructor({ getSetting, setSetting, moduleVersion }) {
    this._getSetting = getSetting;
    this._setSetting = setSetting;
    this._moduleVersion = moduleVersion;
  }

  /**
   * Run all pending migrations in order.
   * Only persists data when changes are detected.
   * Updates migrationVersion to the highest migration version that ran.
   *
   * @returns {Promise<{ ran: number, migratedCatalystCount: number, unifiedRegionSystems: string[] }>}
   *   a summary of the run so the caller can fire one-time edge effects (e.g. the
   *   GM catalyst-migration and region-unification notices).
   */
  async run() {
    const lastRunVersion = this._getSetting(SETTING_KEYS.MIGRATION_VERSION) ?? '0.0.0';

    const pending = MIGRATIONS
      .filter(m => compareSemver(m.version, lastRunVersion) > 0)
      .sort((a, b) => compareSemver(a.version, b.version));

    if (pending.length === 0) {
      return { ran: 0, migratedCatalystCount: 0, unifiedRegionSystems: [] };
    }

    const rawRecipes = this._getSetting(SETTING_KEYS.RECIPES) ?? [];
    const rawSystems = this._getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) ?? [];
    const rawGatheringConfig = this._getSetting(SETTING_KEYS.GATHERING_CONFIG) ?? {};
    const rawEnvironments = this._getSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS) ?? [];

    const originalRecipesJson = JSON.stringify(rawRecipes);
    const originalSystemsJson = JSON.stringify(rawSystems);
    const originalGatheringConfigJson = JSON.stringify(rawGatheringConfig);
    const originalEnvironmentsJson = JSON.stringify(rawEnvironments);

    let data = {
      recipes: rawRecipes,
      systems: rawSystems,
      gatheringConfig: rawGatheringConfig,
      environments: rawEnvironments
    };
    let highestVersion = lastRunVersion;
    let migratedCatalystCount = 0;
    let unifiedRegionSystems = [];

    for (const migration of pending) {
      try {
        const result = migration.migrate(data);
        if (result && typeof result === 'object') {
          // Spread-merge so a migration that returns only a subset of keys
          // (e.g., the 0.1.0 migration returns { recipes, systems } and does
          // not touch gatheringConfig) leaves the untouched keys intact.
          data = { ...data, ...result };
        }
        highestVersion = migration.version;
      } catch (err) {
        console.warn(`Fabricate | Migration "${migration.label}" failed: ${err.message}`);
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
      unifiedRegionSystems = data._unifiedRegionSystems.map(name => String(name));
    }
    delete data._unifiedRegionSystems;

    const recipesChanged = JSON.stringify(data.recipes) !== originalRecipesJson;
    const systemsChanged = JSON.stringify(data.systems) !== originalSystemsJson;
    const gatheringConfigChanged = JSON.stringify(data.gatheringConfig) !== originalGatheringConfigJson;
    const environmentsChanged = JSON.stringify(data.environments) !== originalEnvironmentsJson;

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

    await this._setSetting(SETTING_KEYS.MIGRATION_VERSION, highestVersion);

    console.log(`Fabricate | Migrations complete: ran ${pending.length} migration(s)`);

    return { ran: pending.length, migratedCatalystCount, unifiedRegionSystems };
  }
}
