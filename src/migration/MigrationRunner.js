/**
 * T-013: Startup Schema Migration Framework
 *
 * MigrationRunner runs versioned, idempotent data migrations on startup.
 * Each migration is registered in the MIGRATIONS array with a version and label.
 * The runner reads the last-run version from a persisted setting and only runs
 * migrations newer than that version, in order.
 */

import { migrateRecipes, migrateCraftingSystems } from './migrateComponentId.js';
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
   */
  async run() {
    const lastRunVersion = this._getSetting(SETTING_KEYS.MIGRATION_VERSION) ?? '0.0.0';

    const pending = MIGRATIONS
      .filter(m => compareSemver(m.version, lastRunVersion) > 0)
      .sort((a, b) => compareSemver(a.version, b.version));

    if (pending.length === 0) {
      return;
    }

    const rawRecipes = this._getSetting(SETTING_KEYS.RECIPES) ?? [];
    const rawSystems = this._getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) ?? [];

    const originalRecipesJson = JSON.stringify(rawRecipes);
    const originalSystemsJson = JSON.stringify(rawSystems);

    let data = { recipes: rawRecipes, systems: rawSystems };
    let highestVersion = lastRunVersion;

    for (const migration of pending) {
      try {
        const result = migration.migrate(data);
        if (result !== undefined) {
          data = result;
        }
        highestVersion = migration.version;
      } catch (err) {
        console.warn(`Fabricate | Migration "${migration.label}" failed: ${err.message}`);
      }
    }

    const recipesChanged = JSON.stringify(data.recipes) !== originalRecipesJson;
    const systemsChanged = JSON.stringify(data.systems) !== originalSystemsJson;

    if (recipesChanged) {
      await this._setSetting(SETTING_KEYS.RECIPES, data.recipes);
    }
    if (systemsChanged) {
      await this._setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, data.systems);
    }

    await this._setSetting(SETTING_KEYS.MIGRATION_VERSION, highestVersion);

    console.log(`Fabricate | Migrations complete: ran ${pending.length} migration(s)`);
  }
}
