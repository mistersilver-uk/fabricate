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

// sentence per reason, because the two differ in what the GM must do: only the writeback failure
// instructs a reload, that path alone leaving this session holding unsaved transformed data.
const MIGRATION_DEFERRAL_NOTICES = Object.freeze({
  [MIGRATION_DEFERRAL_REASONS.CORPUS_READ_FAILED]: 'FABRICATE.Migration.Deferred.CorpusUnreadable',
  [MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED]: 'FABRICATE.Migration.Deferred.WritebackFailed',
});

/**
 * The two identity repairs `game.fabricate` re-exposes as GM recovery actions. They are DECLARED in
 * `src/main.js`, beside the startup one-shots that also run them, and published here so the facade
 * reaches them without a `src/bootstrap/` module importing the module entry.
 */
let identityRepairs = {};

export function installIdentityRepairs(repairs) {
  identityRepairs = repairs ?? {};
}

export function applyWorldScopeIdentityFlagRemap(rekeyMap) {
  return identityRepairs.applyWorldScopeIdentityFlagRemap?.(rekeyMap) ?? null;
}

export function applyWorldEssenceMergeFlagRemap(mergeMap) {
  return identityRepairs.applyWorldEssenceMergeFlagRemap?.(mergeMap) ?? null;
}

/** The GM notice for a DEFERRED or an ABORTED pass; `true` means nothing further is reported. */
function reportDeferralOrAbort(summary, localize) {
  // A DEFERRED pass (issue 1242) is NOT an abort, so it gets its own permanent notice rather than
  // the dialog — ABOVE that branch, a deferred summary reporting `aborted: false`.
  if (summary?.deferred === true) {
    // A COMPLETE sentence per reason, and only the writeback failure instructs a reload: it alone
    // leaves this session holding transformed values under an un-advanced version.
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

  // An ABORTED pass rolled back and persisted nothing. Surface a GM-facing error and return
  // WITHOUT any success notice; the runner already emitted per-document guidance to the console.
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
  // 0.6.0 converted catalysts into shared library Tools: tell the GM where the catalyst data
  // went. GM-only and only when something was migrated; the pure migration stays edge-free.
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

  // 1.6.0 removed the legacy routed result-selection providers, dropping roll-table references and
  // stripping gathering-task result selections; name them so the GM can reconfigure.
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
    // Console recovery log naming the affected recipes and tasks: a routed gathering task now
    // resolves via `gatheringCraftingCheck.routed.rollFormula`, which the GM must populate.
    console.warn(
      'Fabricate | 1.6.0 migration removed legacy result-selection providers. ' +
        'Populate gatheringCraftingCheck.routed.rollFormula for any stripped gathering task. Affected items:',
      { droppedRollTableRecipes, strippedGatheringTasks }
    );
  }

  // 1.17.0 disabled recipes to clear an alchemy signature collision; name them so the GM can fix.
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
  // 1.21.0 retired the check-modifier roll-formula placeholder, its consequences being behaviour
  // changes. THE COMPOSITION IS NOT HERE: three semantic mutations survived a green suite inline.
  const retiredCraftingModCounts = Array.isArray(summary?.retiredCraftingModCounts)
    ? summary.retiredCraftingModCounts
    : [];
  if (retiredCraftingModCounts.length > 0 && game.user?.isGM) {
    const notice = buildRetiredCraftingModNotice(retiredCraftingModCounts, localize);
    logMigrationNoticeDetail('1.21.0 retired check-modifier placeholder', notice.detail);
    if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
    else ui.notifications?.info?.(notice.message);
  }

  // 1.23.0: an id authored in BOTH libraries had its gathering entry RE-KEYED, a visible rename, so
  // it is reported rather than discovered. Only colliding systems are listed.
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

  // 1.28.0 (issue 1308): the character-library id collisions where two systems disagreed about what
  // an id MEANS. Identical copies are filtered upstream, so every one here changed a rule INVISIBLY.
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

  // 1.30.0 (issue 1363): what the world-scope entity migration did. THE COMPOSITION IS NOT HERE —
  // it lives in `buildWorldScopeEntityNotice` — and the report is `null` unless the migration ran,
  // so an omission fails SILENT, hence the PRESENCE assertion.
  const worldScopeEntityReport = summary?.worldScopeEntityReport ?? null;
  if (worldScopeEntityReport && game.user?.isGM) {
    const notice = buildWorldScopeEntityNotice(worldScopeEntityReport, localize);
    if (notice.message) {
      logMigrationNoticeDetail('1.30.0 world-scope entities', notice.detail);
      if (notice.severity === 'warn') ui.notifications?.warn?.(notice.message, { permanent: true });
      else ui.notifications?.info?.(notice.message);
    }
  }

  // 1.34.0 (issue 1654): the equivalent-essence merge notice, ALWAYS a permanent warning, every
  // case that produces a message being one the GM must act on (§ Migration Notices, issue 1737).
  const worldEssenceMergeReport = summary?.worldEssenceMergeReport ?? null;
  if (worldEssenceMergeReport && game.user?.isGM) {
    const essenceNotice = buildWorldEssenceMergeNotice(worldEssenceMergeReport, localize);
    if (essenceNotice.message) {
      logMigrationNoticeDetail('1.34.0 equivalent essence merge', essenceNotice.detail);
      ui.notifications?.warn?.(essenceNotice.message, { permanent: true });
    }
  }
}

/** Run versioned startup data migrations via MigrationRunner. */
export async function runMigrations(fabricate) {
  // Primary-GM only, so exactly one client runs the pass. `isGM` is TRUE FOR ASSISTANT GMs, who
  // hold SETTINGS_MODIFY, so an `isGM` gate would let every assistant transform-and-write
  // concurrently; `activeGM` fires on exactly one client.
  if (game.users?.activeGM?.id !== game.user?.id) return;
  const runner = new MigrationRunner({
    getSetting,
    setSetting,
    // The GM-only recovery prompt, invoked by the runner on a fatal abort. "Keep existing data" is
    // the default and matches what the runner already did; the fix/retry choice is INFORMATIONAL
    // ONLY — the GM repairs and RELOADS. There is NO same-pass auto-retry.
    promptRecovery: (context) => fabricate._promptMigrationRecovery(context),
  });
  const summary = await runner.run();
  const localize = (key, data) =>
    data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key);
  if (reportDeferralOrAbort(summary, localize)) return;
  reportEarlyVersionNotices(summary, localize);
  reportLaterVersionNotices(summary, localize);
}

/**
 * The thin Foundry edge for the GM migration-abort recovery prompt. GM-only and never throwing:
 * the console guidance and the abort notification have already covered the GM.
 */
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

    // `DialogV2.wait` resolves to the chosen action; both choices are informational, the runner
    // having already kept existing data, and closing the dialog is equivalent to keeping it.
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
