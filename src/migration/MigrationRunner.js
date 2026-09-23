/**
 * Runs versioned, idempotent startup data migrations from the ordered `MIGRATIONS` registry,
 * only those newer than the persisted `migrationVersion`.
 * `destructive-changes-and-migrations/spec.md` § Migration Policy owns the registry contract, the
 * startup flow, the writeback order, per-migration error handling and the abort guidance.
 */

import { SETTING_KEYS } from '../config/settings.js';

import { isFatalMigrationError } from './migrationErrors.js';
import { DOWNGRADE_ADVICE } from './migrationRecoveryPrompt.js';
import { MIGRATIONS } from './migrationRegistry.js';
import { WRITEBACK_LEGS } from './migrationWritebackLegs.js';

export { FatalMigrationError, isFatalMigrationError } from './migrationErrors.js';

/** The table by key, so the two corpus legs can be read one at a time with their own containment. */
const LEG_BY_KEY = new Map(WRITEBACK_LEGS.map((leg) => [leg.key, leg]));
const legFor = (key) => {
  const leg = LEG_BY_KEY.get(key);
  if (!leg) throw new Error(`Fabricate | writeback table is missing the "${key}" leg`);
  return leg;
};
const RECIPES_LEG = legFor('recipes');
const SYSTEMS_LEG = legFor('systems');

/**
 * Compare two semver strings numerically. Exported because the Valid Id Basis must answer "is
 * `migrationVersion` BEHIND the highest registered migration", and a second implementation beside
 * the registry it compares against is how the two drift (issue 1224).
 */
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

/** The transient `_removedResultSelectionProviders` payload shape the 1.6.0 migration emits. */
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

/**
 * Normalize one `_retiredCraftingModCounts` entry (1.21.0) to a fixed shape. Coerced rather than
 * passed through, so the GM notice formats the numbers without re-guarding each and a hand-built
 * entry cannot put `NaN` or an object into a notification string.
 */
function _normalizeRetiredCraftingModEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const normalized = { system: String(entry.system ?? '') };
  for (const key of RETIRED_CRAFTING_MOD_COUNT_KEYS) {
    const value = Number(entry[key]);
    normalized[key] = Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
  }
  return normalized;
}

/** Normalize one `_characterLibraryCollisions` entry (1.28.0), on the same coercion rule. */
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

/**
 * Normalize one `_unifiedModifierCollisions` entry (1.23.0), dropping one that reports no
 * collision, on the same coercion rule as its two siblings above.
 */
function _normalizeModifierCollisionEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const collisions = Number(entry.collisions);
  if (!Number.isFinite(collisions) || collisions <= 0) return null;
  return { system: String(entry.system ?? ''), collisions: Math.trunc(collisions) };
}

/**
 * The highest version in the registry above, derived by comparison so an entry appended out of order
 * cannot lower the answer. Exported for issue 1224's Valid Id Basis, which would otherwise hardcode
 * a literal that falls behind and reads as "migrations current" forever.
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
 * Why a pass persisted nothing and left `migrationVersion` where it found it (issue 1242). A
 * DEFERRAL is not an abort: an abort is fatal and gets the recovery dialog, while a deferral is a
 * storage fact whose remedy is a reload, so it gets its own GM notice.
 */
export const MIGRATION_DEFERRAL_REASONS = Object.freeze({
  /** The recipe corpus could not be read. Distinct from an EMPTY corpus, deliberately. */
  CORPUS_READ_FAILED: 'corpusReadFailed',
  /** A writeback leg failed, so the remaining legs and the version bump were abandoned. */
  WRITEBACK_FAILED: 'writebackFailed',
});

/**
 * The summary shape a pass returns when it persisted nothing, written once for the early return, the
 * abort and the two deferrals alike.
 */
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
   * `promptRecovery` is an optional seam invoked with the abort context; `migrations` overrides the
   * default registry for tests. `recipeCorpus` and `craftingSystemCorpus` are the accessors this
   * pass reads and writes through (issue 1242), defaulting to the whole-array setting accessors
   * below and injectable so a fixture can refuse a read or write without patching `game.settings`.
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

  /**
   * Run all pending migrations in order, persisting only what changed and advancing
   * `migrationVersion` to the highest that ran; the summary drives the one-time GM notices.
   */
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
      // Contained because an escaping rejection is INVISIBLE: the hook dispatcher's try/catch is
      // synchronous, so a rejection out of the module's async `ready` callback fires no error hook
      // and no notification, leaves the readiness promise unsettled and the module with no managers.
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
      // Contained for the same reason the recipe read is.
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
      // Capture the last known-good payload BEFORE this migration as the rollback baseline. The
      // deep clone isolates it from in-place mutation a fatal migration performs before throwing.
      const checkpoint = JSON.parse(JSON.stringify(data));
      try {
        const result = migration.migrate(data);
        if (result && typeof result === 'object') {
          // Spread-merge so a migration returning only a subset of keys leaves the rest intact.
          data = { ...data, ...result };
        }
        highestVersion = migration.version;
      } catch (error) {
        if (isFatalMigrationError(error)) {
          // Fatal: roll the in-memory payload back to the checkpoint, emit recovery guidance,
          // persist NOTHING, and abort. Restoring `data` keeps the in-memory state consistent for
          // any post-return inspection, since the aborted pass returns before any persistence.
          data = checkpoint;
          void data;

          const downgradeTo =
            error.downgradeTo ?? migration.downgradeTo ?? this._moduleVersion ?? null;
          const failures = Array.isArray(error.documents) ? error.documents : [];

          this._emitMigrationRecoveryGuidance(migration, error, downgradeTo);

          // Optional GM decision-prompt seam (defaults to "Keep existing data").
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

    // Capture each transient `_`-prefixed report for its GM notice and STRIP it, so it is never
    // persisted into a setting payload. A migration cannot report through its return value, which
    // the loop above spread-merges into the DATA payload rather than into this summary.
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

    // 1.21.0, per system: formulas inert for want of the placeholder (their modifiers go live now),
    // formulas that placed it subtractively (a 2x-scalar sign swing), ones carrying it more than
    // once (double-counting collapses to one), and ones left untouched in a non-additive context.
    let retiredCraftingModCounts = [];
    if (Array.isArray(data._retiredCraftingModCounts)) {
      retiredCraftingModCounts = data._retiredCraftingModCounts
        .map((entry) => _normalizeRetiredCraftingModEntry(entry))
        .filter(Boolean);
    }
    delete data._retiredCraftingModCounts;

    // 1.23.0, per system: gathering entries re-keyed because a check-modifier entry already held
    // the id. A re-keyed modifier is a visible rename in the authoring surface, so the GM is told.
    let unifiedModifierCollisions = [];
    if (Array.isArray(data._unifiedModifierCollisions)) {
      unifiedModifierCollisions = data._unifiedModifierCollisions
        .map((entry) => _normalizeModifierCollisionEntry(entry))
        .filter(Boolean);
    }
    delete data._unifiedModifierCollisions;

    // 1.28.0: character-library id collisions where two systems disagreed about what an id MEANS
    // (issue 1308). Identical copies are not reported, so anything here changed a real rule — the
    // reference still resolves, but to the other system's definition, which is invisible on screen.
    let characterLibraryCollisions = [];
    if (Array.isArray(data._characterLibraryCollisions)) {
      characterLibraryCollisions = data._characterLibraryCollisions
        .map((entry) => _normalizeCharacterLibraryCollisionEntry(entry))
        .filter(Boolean);
    }
    delete data._characterLibraryCollisions;

    // 1.30.0 (issue 1363): entities created per type, groups merged, EVERY rename with its two
    // systems, the `(system, entityType)` pairs it REFUSED to re-key, and the references that
    // ALREADY resolve to nothing — reported, never pruned, per the registry's requirement 18.
    let worldScopeEntityReport = null;
    if (data._worldScopeEntityReport && typeof data._worldScopeEntityReport === 'object') {
      worldScopeEntityReport = data._worldScopeEntityReport;
    }
    delete data._worldScopeEntityReport;

    // 1.34.0's four-leg merge report (issue 1654).
    let worldEssenceMergeReport = null;
    if (data._worldEssenceMergeReport && typeof data._worldEssenceMergeReport === 'object') {
      worldEssenceMergeReport = data._worldEssenceMergeReport;
    }
    delete data._worldEssenceMergeReport;

    const changedKeys = new Set();
    for (const leg of WRITEBACK_LEGS) {
      if (JSON.stringify(data[leg.key]) !== snapshots[leg.key]) changedKeys.add(leg.key);
    }

    // The table's order is the writeback order `destructive-changes-and-migrations/spec.md`
    // § Startup Migration Flow pins. Every leg and the version bump carry their own containment,
    // because a rejection would otherwise propagate out of `run()` past a caller with no `catch`.
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

  /**
   * Abandon the rest of the writeback and report the pass as deferred, leaving `migrationVersion`
   * where it was found: every writeback leg is a plain whole-array replace, so a re-run is safe.
   */
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

  /**
   * Emit GM-facing recovery guidance to the console after an aborted pass, per the spec's
   * § Migration Abort Recovery Guidance.
   */
  _emitMigrationRecoveryGuidance(migration, error, downgradeTo) {
    // Scoped to THIS PASS. Not a claim that a failed migration leaves data unchanged: a non-fatal
    // error is logged and the pass continues, advancing past it and writing. And a claim about
    // STORED data — the migrations transform the session's own values in place, so a reload is what
    // discards them.
    console.error(
      "Fabricate | Migration aborted. This pass saved nothing: your stored data is exactly as it was before this startup. Reload Foundry to discard this session's partly-migrated copy."
    );
    console.error(`Fabricate | Aborted during migration: "${migration.label}"`);
    if (error?.message) {
      console.error(`Fabricate | Reason: ${error.message}`);
    }

    const downgradeTarget = downgradeTo ?? 'unknown';
    // One complete sentence, from the same source the GM dialog reads.
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
