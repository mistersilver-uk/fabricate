/**
 * The startup migration pass: the primary-GM gate and every GM notice. The arithmetic lives in
 * `src/migration/`; what is here is the Foundry edge that localizes and dispatches it.
 */

import { getSetting, setSetting } from '../config/settings.js';
import { buildRetiredCraftingModNotice } from '../migration/migrateRetireCraftingModToken.js';
import {
  composeMigrationNotice,
  logMigrationNoticeDetail,
} from '../migration/migrationNoticeDetail.js';
import { buildMigrationRecoveryPrompt } from '../migration/migrationRecoveryPrompt.js';
import { MIGRATION_DEFERRAL_REASONS, MigrationRunner } from '../migration/MigrationRunner.js';
import {
  buildWorldEssenceMergeNotice,
  buildWorldScopeEntityNotice,
} from '../systems/worldScopeEntityNotice.js';

// One complete sentence per deferral reason (issue 1242): only the writeback failure instructs
// a reload, since only it leaves this session holding transformed values under an old version.
const MIGRATION_DEFERRAL_NOTICES = Object.freeze({
  [MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED]: 'FABRICATE.Migration.Deferred.CorpusUnreadable',
  [MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED]: 'FABRICATE.Migration.Deferred.WritebackFailed',
});

// The two GM recovery repairs, declared in `src/main.js` and published here so no bootstrap module
// imports the entry.
let identityRepairs = {};

export function installIdentityRepairs(repairs) {
  identityRepairs = repairs ?? {};
}

/** An absent wire is silent, so the boot contract pins this. */
export function identityRepairsInstalled() {
  return (
    typeof identityRepairs.applyWorldScopeIdentityFlagRemap === 'function' &&
    typeof identityRepairs.applyWorldEssenceMergeFlagRemap === 'function'
  );
}

/** A missing repair throws rather than answering `null`, which a clean world also answers. */
function requireRepair(name) {
  const repair = identityRepairs[name];
  if (typeof repair !== 'function') {
    throw new TypeError(
      `Fabricate | ${name} was never installed, so the GM recovery action is dead`
    );
  }
  return repair;
}

export function applyWorldScopeIdentityFlagRemap(rekeyMap) {
  return requireRepair('applyWorldScopeIdentityFlagRemap')(rekeyMap);
}

export function applyWorldEssenceMergeFlagRemap(mergeMap) {
  return requireRepair('applyWorldEssenceMergeFlagRemap')(mergeMap);
}

/** The GM notice for a deferred or an aborted pass; `true` means nothing further is reported. */
function reportDeferralOrAbort(summary, localize) {
  // A deferred pass (issue 1242) is not an abort: its own permanent notice, not the dialog.
  if (summary?.deferred === true) {
    const key =
      MIGRATION_DEFERRAL_NOTICES[summary.deferredReason] ??
      MIGRATION_DEFERRAL_NOTICES[MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED];
    const notice = composeMigrationNotice(key, undefined, localize);
    console.error(
      `Fabricate | migration pass deferred (${summary.deferredReason}): ${notice.detail}`,
      summary.deferredError ?? ''
    );
    if (game.user?.isGM) ui.notifications?.error?.(notice.message, { permanent: true });
    return true;
  }

  // An aborted pass persisted nothing, so no success notice follows; the runner logged guidance.
  if (summary?.aborted === true) {
    if (game.user?.isGM) {
      ui.notifications?.error?.(
        composeMigrationNotice('FABRICATE.Migration.Aborted.Notice', undefined, localize).message
      );
    }
    return true;
  }
  return false;
}

/** The 0.6.0 to 1.17.0 GM notices, in release order. */
function reportEarlyVersionNotices(summary, localize) {
  // 0.6.0 converted catalysts into library Tools.
  const migratedCount = Number(summary?.migratedCatalystCount || 0);
  if (migratedCount > 0 && game.user?.isGM) {
    const message =
      game.i18n?.format?.('FABRICATE.Migration.CatalystsToTools.Notice', {
        count: migratedCount,
      }) ||
      `Fabricate migrated ${migratedCount} catalyst(s) to the Tools library. Find them under the Tools tab.`;
    ui.notifications?.info?.(message);
  }

  // 0.9.0 unified legacy realms: name the systems so the GM can re-enable Travel & Realms.
  const unifiedRegionSystems = Array.isArray(summary?.unifiedRegionSystems)
    ? summary.unifiedRegionSystems
    : [];
  if (unifiedRegionSystems.length > 0 && game.user?.isGM) {
    const notice = composeMigrationNotice(
      'FABRICATE.Migration.UnifyRegions.Notice',
      { systems: unifiedRegionSystems.join(', ') },
      localize
    );
    logMigrationNoticeDetail('0.9.0 unified gathering realms', notice.detail);
    ui.notifications?.info?.(notice.message);
  }

  // 1.6.0 removed the legacy routed result-selection providers.
  const removedProviders = summary?.removedResultSelectionProviders ?? null;
  const droppedRollTableRecipes = Array.isArray(removedProviders?.droppedRollTableRecipes)
    ? removedProviders.droppedRollTableRecipes
    : [];
  const strippedGatheringTasks = Array.isArray(removedProviders?.strippedGatheringTasks)
    ? removedProviders.strippedGatheringTasks
    : [];
  if (
    (droppedRollTableRecipes.length > 0 || strippedGatheringTasks.length > 0) &&
    game.user?.isGM
  ) {
    console.warn(
      'Fabricate | 1.6.0 migration removed legacy result-selection providers. ' +
        'Populate gatheringCraftingCheck.routed.rollFormula for any stripped gathering task. Affected items:',
      { droppedRollTableRecipes, strippedGatheringTasks }
    );
  }

  // 1.17.0 disabled recipes to clear an alchemy signature collision.
  const essenceCollisionDisabledRecipes = Array.isArray(summary?.essenceCollisionDisabledRecipes)
    ? summary.essenceCollisionDisabledRecipes
    : [];
  if (essenceCollisionDisabledRecipes.length > 0 && game.user?.isGM) {
    const notice = composeMigrationNotice(
      'FABRICATE.Migration.EssenceGroups.CollisionNotice',
      {
        count: essenceCollisionDisabledRecipes.length,
        recipes: essenceCollisionDisabledRecipes.join(', '),
      },
      localize
    );
    logMigrationNoticeDetail('1.17.0 essence-group collisions', notice.detail);
    ui.notifications?.warn?.(notice.message);
  }
}

/** The 1.21.0 to 1.34.0 GM notices, in release order. */
function reportLaterVersionNotices(summary, localize) {
  // 1.21.0 retired the check-modifier placeholder; the notice composes in the pure module.
  const retiredCraftingModCounts = Array.isArray(summary?.retiredCraftingModCounts)
    ? summary.retiredCraftingModCounts
    : [];
  if (retiredCraftingModCounts.length > 0 && game.user?.isGM) {
    const notice = buildRetiredCraftingModNotice(retiredCraftingModCounts, localize);
    logMigrationNoticeDetail('1.21.0 retired check-modifier placeholder', notice.detail);
    if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
    else ui.notifications?.info?.(notice.message);
  }

  // 1.23.0 re-keyed the gathering entry of an id in both libraries, a visible rename.
  const unifiedModifierCollisions = Array.isArray(summary?.unifiedModifierCollisions)
    ? summary.unifiedModifierCollisions
    : [];
  if (unifiedModifierCollisions.length > 0 && game.user?.isGM) {
    const notice = composeMigrationNotice(
      'FABRICATE.Migration.UnifyModifiers.CollisionNotice',
      {
        count: unifiedModifierCollisions.reduce((sum, entry) => sum + entry.collisions, 0),
        systems: unifiedModifierCollisions.map((entry) => entry.system).join(', '),
      },
      localize
    );
    logMigrationNoticeDetail('1.23.0 unified modifier collisions', notice.detail);
    ui.notifications?.warn?.(notice.message, { permanent: true });
  }

  // 1.28.0 (issue 1308): identical copies are filtered upstream, so each collision here changed a
  // rule invisibly.
  const characterLibraryCollisions = Array.isArray(summary?.characterLibraryCollisions)
    ? summary.characterLibraryCollisions
    : [];
  if (characterLibraryCollisions.length > 0 && game.user?.isGM) {
    const notice = composeMigrationNotice(
      'FABRICATE.Migration.CharacterLibraries.CollisionNotice',
      {
        count: characterLibraryCollisions.length,
        entries: [...new Set(characterLibraryCollisions.map((entry) => entry.entryId))].join(', '),
      },
      localize
    );
    logMigrationNoticeDetail('1.28.0 character library collisions', notice.detail);
    ui.notifications?.warn?.(notice.message, { permanent: true });
  }

  // 1.30.0 (issue 1363). The report is `null` unless the migration ran, so an omission is silent;
  // tests assert its presence.
  const worldScopeEntityReport = summary?.worldScopeEntityReport ?? null;
  if (worldScopeEntityReport && game.user?.isGM) {
    const notice = buildWorldScopeEntityNotice(worldScopeEntityReport, localize);
    if (notice.message) {
      logMigrationNoticeDetail('1.30.0 world-scope entities', notice.detail);
      if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
      else ui.notifications?.info?.(notice.message);
    }
  }

  // 1.34.0 (issue 1654): always a permanent warning, as every message needs GM action (issue 1737).
  const worldEssenceMergeReport = summary?.worldEssenceMergeReport ?? null;
  if (worldEssenceMergeReport && game.user?.isGM) {
    const essenceNotice = buildWorldEssenceMergeNotice(worldEssenceMergeReport, localize);
    if (essenceNotice.message) {
      logMigrationNoticeDetail('1.34.0 equivalent essence merge', essenceNotice.detail);
      ui.notifications?.warn?.(essenceNotice.message, { permanent: true });
    }
  }
}

export async function runMigrations(fabricate) {
  // `activeGM`, not `isGM`: assistant GMs hold SETTINGS_MODIFY, so `isGM` would let each of them
  // transform and write concurrently.
  if (game.users?.activeGM?.id !== game.user?.id) return;
  const runner = new MigrationRunner({
    getSetting,
    setSetting,
    // On a fatal abort. Informational only: the runner has kept existing data, and the GM repairs
    // and reloads; there is no same-pass retry.
    promptRecovery: (context) => fabricate._promptMigrationRecovery(context),
  });
  const summary = await runner.run();
  const localize = (key, data) =>
    data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key);
  if (reportDeferralOrAbort(summary, localize)) return;
  reportEarlyVersionNotices(summary, localize);
  reportLaterVersionNotices(summary, localize);
}

/** GM-only and never throwing: the console guidance and abort notice have already fired. */
export async function promptMigrationRecovery(context) {
  try {
    if (!game.user?.isGM) return;
    const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
    if (!DialogV2?.wait && !DialogV2?.prompt) return;

    const localize = (key, data) =>
      data ? (game.i18n?.format?.(key, data) ?? key) : (game.i18n?.localize?.(key) ?? key);
    const config = buildMigrationRecoveryPrompt(context, localize);

    const buttons = config.buttons.map((button) => ({
      action: button.action,
      label: button.label,
      default: button.default,
    }));

    // Both choices are informational; closing the dialog equals keeping the data.
    await DialogV2.wait({
      window: { title: config.title },
      content: config.content,
      buttons,
      default: config.default,
      rejectClose: false,
    });
  } catch (error) {
    console.warn(
      `Fabricate | Failed to present migration recovery prompt: ${error?.message ?? error}`
    );
  }
}
