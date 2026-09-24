/**
 * Runs the registered migrations newer than `migrationVersion`, in order.
 * `destructive-changes-and-migrations/spec.md` § Migration Policy owns the contract, flow,
 * writeback order, error handling and abort guidance.
 */

import { SETTING_KEYS } from '../config/settings.js';

import { isFatalMigrationError } from './migrationErrors.js';
import { DOWNGRADE_ADVICE } from './migrationRecoveryPrompt.js';
import { MIGRATIONS } from './migrationRegistry.js';
import { WRITEBACK_LEGS } from './migrationWritebackLegs.js';

export { FatalMigrationError, isFatalMigrationError } from './migrationErrors.js';

/** So each corpus leg is read alone, under its own containment. */
const LEG_BY_KEY = new Map(WRITEBACK_LEGS.map((leg) => [leg.key, leg]));
const legFor = (key) => {
  const leg = LEG_BY_KEY.get(key);
  if (!leg) throw new Error(`Fabricate | writeback table is missing the "${key}" leg`);
  return leg;
};
const RECIPES_LEG = legFor('recipes');
const SYSTEMS_LEG = legFor('systems');

/** Numeric semver compare, exported so the Valid Id Basis cannot drift from it (issue 1224). */
export function compareSemver(a, b) {
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

function _isRemovedProvidersPayload(value) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Array.isArray(value.droppedRollTableRecipes) || Array.isArray(value.strippedGatheringTasks))
  );
}

/** The per-system count keys the 1.21.0 report carries, coerced to finite integers. */
const RETIRED_CRAFTING_MOD_COUNT_KEYS = ['inert', 'subtractive', 'repeated', 'untouched'];

/** 1.21.0. Coerced, so no `NaN` or object reaches a notification string. */
function _normalizeRetiredCraftingModEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const normalized = { system: String(entry.system ?? '') };
  for (const key of RETIRED_CRAFTING_MOD_COUNT_KEYS) {
    const value = Number(entry[key]);
    normalized[key] = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }
  return normalized;
}

/** 1.28.0, coerced likewise. */
function _normalizeCharacterLibraryCollisionEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const entryId = String(entry.entryId ?? '').trim();
  if (!entryId) return null;
  return {
    library: String(entry.library ?? ''),
    entryId,
    keptFrom: String(entry.keptFrom ?? ''),
    discardedFrom: String(entry.discardedFrom ?? ''),
  };
}

/** 1.23.0, coerced likewise; an entry reporting no collision is dropped. */
function _normalizeModifierCollisionEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const collisions = Number(entry.collisions);
  if (!Number.isFinite(collisions) || collisions <= 0) return null;
  return { system: String(entry.system ?? ''), collisions: Math.trunc(collisions) };
}

/**
 * Derived by comparison, so an out-of-order entry cannot lower it. Exported so the Valid Id Basis
 * (issue 1224) never hardcodes a literal that reads as "current" forever.
 */
export function getHighestRegisteredMigrationVersion() {
  let highest = '0.0.0';
  for (const migration of MIGRATIONS) {
    const version = String(migration?.version ?? '');
    if (version !== '' && compareSemver(version, highest) > 0) highest = version;
  }
  return highest;
}

/**
 * Why a pass persisted nothing and kept `migrationVersion` (issue 1242). Not an abort, which is
 * fatal and gets the dialog: a deferral's remedy is a reload, so it gets its own notice.
 */
export const MIGRATION_DEFERRAL_REASONS = Object.freeze({
  /** Unreadable, which is distinct from empty. */
  CORPUS_READ_FAILED: 'corpusReadFailed',
  /** The remaining legs and the version bump were abandoned. */
  WRITEBACK_FAILED: 'writebackFailed',
});

/** For every pass that persisted nothing: early return, abort and both deferrals. */
function emptyPassSummary(overrides = {}) {
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
    retiredCraftingModCounts: [],
    unifiedModifierCollisions: [],
    characterLibraryCollisions: [],
    worldScopeEntityReport: null,
    worldEssenceMergeReport: null,
    ...overrides,
  };
}

export class MigrationRunner {
  /**
   * `promptRecovery` receives the abort context. The corpus accessors (issue 1242) default to the
   * whole-array settings, injectable so a fixture can refuse a read or write.
   */
  constructor({
    getSetting,
    setSetting,
    moduleVersion,
    promptRecovery,
    recipeCorpus,
    craftingSystemCorpus,
    migrations,
  } = {}) {
    this._getSetting = getSetting;
    this._setSetting = setSetting;
    this._moduleVersion = moduleVersion;
    this._promptRecovery = promptRecovery;
    this._migrations = Array.isArray(migrations) ? migrations : MIGRATIONS;
    this._recipeCorpus = recipeCorpus ?? {
      loadAll: async () => this._getSetting(SETTING_KEYS.RECIPES) ?? [],
      createOrUpdateAll: async (records) => {
        await this._setSetting(SETTING_KEYS.RECIPES, records);
      },
    };
    this._craftingSystemCorpus = craftingSystemCorpus ?? {
      loadAll: async () => this._getSetting(SETTING_KEYS.CRAFTING_SYSTEMS) ?? [],
      createOrUpdateAll: async (systems) => {
        await this._setSetting(SETTING_KEYS.CRAFTING_SYSTEMS, systems);
      },
    };
  }

  /** Persist only what changed and advance `migrationVersion`; the summary drives the notices. */
  async run() {
    const lastRunVersion = this._getSetting(SETTING_KEYS.MIGRATION_VERSION) ?? '0.0.0';

    const pending = this._migrations
      .filter((m) => compareSemver(m.version, lastRunVersion) > 0)
      .sort((a, b) => compareSemver(a.version, b.version));

    if (pending.length === 0) {
      return emptyPassSummary();
    }

    const io = {
      getSetting: (key) => this._getSetting(key),
      setSetting: (key, value) => this._setSetting(key, value),
      recipeCorpus: this._recipeCorpus,
      craftingSystemCorpus: this._craftingSystemCorpus,
    };

    const raw = {};
    try {
      // Contained: the hook dispatcher's try/catch is synchronous, so a rejection out of the async
      // `ready` callback is invisible and leaves readiness unsettled with no managers.
      raw.recipes = await RECIPES_LEG.read(io);
    } catch (error) {
      console.error(
        'Fabricate | Migrations deferred: the recipe corpus could not be read, so no migration ran and nothing was saved.',
        error
      );
      return emptyPassSummary({
        deferred: true,
        deferredReason: MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED,
        deferredError: error,
      });
    }
    try {
      raw.systems = await SYSTEMS_LEG.read(io);
    } catch (error) {
      console.error(
        'Fabricate | Migrations deferred: the crafting system corpus could not be read, so no migration ran and nothing was saved.',
        error
      );
      return emptyPassSummary({
        deferred: true,
        deferredReason: MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED,
        deferredError: error,
      });
    }
    // One uninterrupted synchronous block: `ClientSettings#get` reads live storage, so an inbound
    // `updateSetting` can land between two awaited reads but never between two synchronous ones.
    for (const leg of WRITEBACK_LEGS) {
      if (Object.hasOwn(raw, leg.key)) continue;
      raw[leg.key] = leg.read(io);
    }

    const snapshots = {};
    let data = {};
    for (const leg of WRITEBACK_LEGS) {
      data[leg.key] = raw[leg.key];
      snapshots[leg.key] = JSON.stringify(raw[leg.key]);
    }
    let highestVersion = lastRunVersion;
    let migratedCatalystCount = 0;
    let unifiedRegionSystems = [];
    let removedResultSelectionProviders = {
      droppedRollTableRecipes: [],
      strippedGatheringTasks: [],
    };

    for (const migration of pending) {
      // The rollback baseline, deep-cloned against a fatal migration's in-place mutation.
      const checkpoint = JSON.parse(JSON.stringify(data));
      try {
        const result = migration.migrate(data);
        if (result && typeof result === 'object') {
          // A migration may return a subset of keys.
          data = { ...data, ...result };
        }
        highestVersion = migration.version;
      } catch (error) {
        if (isFatalMigrationError(error)) {
          // Fatal: restore the checkpoint, emit recovery guidance, persist nothing, abort.
          data = checkpoint;
          void data;

          const downgradeTo =
            error.downgradeTo ?? migration.downgradeTo ?? this._moduleVersion ?? null;
          const failures = Array.isArray(error.documents) ? error.documents : [];

          this._emitMigrationRecoveryGuidance(migration, error, downgradeTo);

          this._promptRecovery?.({
            downgradeTo,
            documents: failures,
            label: migration.label,
          });

          return emptyPassSummary({
            aborted: true,
            abortedMigration: migration.label,
            downgradeTo,
            failures,
          });
        }
        console.warn(`Fabricate | Migration "${migration.label}" failed: ${error.message}`);
      }
    }

    // Capture each transient `_`-prefixed report and strip it, so it is never persisted.
    if (Number.isFinite(Number(data._migratedCatalystCount))) {
      migratedCatalystCount = Number(data._migratedCatalystCount);
    }
    delete data._migratedCatalystCount;

    if (Array.isArray(data._unifiedRegionSystems)) {
      unifiedRegionSystems = data._unifiedRegionSystems.map(String);
    }
    delete data._unifiedRegionSystems;

    if (_isRemovedProvidersPayload(data._removedResultSelectionProviders)) {
      removedResultSelectionProviders = {
        droppedRollTableRecipes:
          data._removedResultSelectionProviders.droppedRollTableRecipes ?? [],
        strippedGatheringTasks: data._removedResultSelectionProviders.strippedGatheringTasks ?? [],
      };
    }
    delete data._removedResultSelectionProviders;

    let essenceCollisionDisabledRecipes = [];
    if (Array.isArray(data._essenceCollisionDisabledRecipes)) {
      essenceCollisionDisabledRecipes = data._essenceCollisionDisabledRecipes.map(String);
    }
    delete data._essenceCollisionDisabledRecipes;

    // 1.21.0, per system: inert, subtractive, repeated and non-additive placeholder formulas.
    let retiredCraftingModCounts = [];
    if (Array.isArray(data._retiredCraftingModCounts)) {
      retiredCraftingModCounts = data._retiredCraftingModCounts
        .map((entry) => _normalizeRetiredCraftingModEntry(entry))
        .filter(Boolean);
    }
    delete data._retiredCraftingModCounts;

    // 1.23.0, per system: gathering entries re-keyed on an id clash, a visible rename.
    let unifiedModifierCollisions = [];
    if (Array.isArray(data._unifiedModifierCollisions)) {
      unifiedModifierCollisions = data._unifiedModifierCollisions
        .map((entry) => _normalizeModifierCollisionEntry(entry))
        .filter(Boolean);
    }
    delete data._unifiedModifierCollisions;

    // 1.28.0 (issue 1308): each collision now resolves to the other system's definition.
    let characterLibraryCollisions = [];
    if (Array.isArray(data._characterLibraryCollisions)) {
      characterLibraryCollisions = data._characterLibraryCollisions
        .map((entry) => _normalizeCharacterLibraryCollisionEntry(entry))
        .filter(Boolean);
    }
    delete data._characterLibraryCollisions;

    // 1.30.0 (issue 1363): dangling references are reported, never pruned (requirement 18).
    let worldScopeEntityReport = null;
    if (data._worldScopeEntityReport && typeof data._worldScopeEntityReport === 'object') {
      worldScopeEntityReport = data._worldScopeEntityReport;
    }
    delete data._worldScopeEntityReport;

    let worldEssenceMergeReport = null;
    if (data._worldEssenceMergeReport && typeof data._worldEssenceMergeReport === 'object') {
      worldEssenceMergeReport = data._worldEssenceMergeReport;
    }
    delete data._worldEssenceMergeReport;

    const changedKeys = new Set();
    for (const leg of WRITEBACK_LEGS) {
      if (JSON.stringify(data[leg.key]) !== snapshots[leg.key]) changedKeys.add(leg.key);
    }

    // The writeback order § Startup Migration Flow pins. Each leg and the bump is contained,
    // since `run()`'s caller has no `catch`.
    for (const leg of WRITEBACK_LEGS) {
      if (!changedKeys.has(leg.key)) continue;
      try {
        await leg.write(data[leg.key], io);
      } catch (error) {
        return this._deferOnWriteFailure(error);
      }
    }
    try {
      await this._setSetting(SETTING_KEYS.MIGRATION_VERSION, highestVersion);
    } catch (error) {
      return this._deferOnWriteFailure(error);
    }

    console.log(`Fabricate | Migrations complete: ran ${pending.length} migration(s)`);

    return {
      ran: pending.length,
      aborted: false,
      migratedCatalystCount,
      unifiedRegionSystems,
      removedResultSelectionProviders,
      essenceCollisionDisabledRecipes,
      retiredCraftingModCounts,
      unifiedModifierCollisions,
      characterLibraryCollisions,
      worldScopeEntityReport,
      worldEssenceMergeReport,
    };
  }

  /** Keeps `migrationVersion`: each leg is a whole-array replace, so a re-run is safe. */
  _deferOnWriteFailure(error) {
    console.error(
      'Fabricate | Migrations deferred: a migrated setting could not be saved, so the remaining writes and the version bump were abandoned. Nothing was marked as migrated.',
      error
    );
    return emptyPassSummary({
      deferred: true,
      deferredReason: MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED,
      deferredError: error,
    });
  }

  /** Spec § Migration Abort Recovery Guidance. */
  _emitMigrationRecoveryGuidance(migration, error, downgradeTo) {
    // Scoped to this pass and to stored data: a non-fatal error is logged and the pass writes on,
    // and a reload discards the session's in-place transforms.
    console.error(
      "Fabricate | Migration aborted. This pass saved nothing: your stored data is exactly as it was before this startup. Reload Foundry to discard this session's partly-migrated copy."
    );
    console.error(`Fabricate | Aborted during migration: "${migration.label}"`);
    if (error?.message) {
      console.error(`Fabricate | Reason: ${error.message}`);
    }

    const downgradeTarget = downgradeTo ?? 'unknown';
    // The GM dialog's source.
    console.error(
      `Fabricate | Recommended action: ${DOWNGRADE_ADVICE.consoleSentence(downgradeTarget)}`
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
