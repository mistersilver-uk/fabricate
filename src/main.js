// Import global stylesheet so Vite includes it in the module graph for HMR.
// In production builds, a Vite plugin resolves this to a no-op since Foundry
// loads the stylesheet via module.json's "styles" field instead.
import '../styles/fabricate.css';
import {
  createGatheringResultCreator,
} from './gatheringResultCreation.js';
import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE,
  buildStaleEntryNotice,
  createDeferredChunkFailureReporter,
} from './utils/deferredEntryNotice.js';
import { createMemoizedLoad } from './utils/memoizedModuleLoad.js';
import {
  processWorldTimeCallbacksSafely,
} from './gatheringBootstrapAdapters.js';
import {
  createGatheringToolAvailability,
  matchGatheringTools
} from './gatheringToolRuntime.js';
import {
  getCraftingSystemManagerAppClass,
} from './ui/appFactory.js';
import { getSetting, setSetting, SETTING_KEYS, RECIPE_ITEM_FLAG_STAMP_TARGET, COMPONENT_FLAG_STAMP_TARGET, TOOL_FLAG_STAMP_TARGET, OWNED_ITEM_COMPONENT_STAMP_TARGET, WORLD_SCOPE_IDENTITY_FLAG_TARGET, WORLD_ESSENCE_MERGE_FLAG_TARGET } from './config/settings.js';
import { getFabricateFlag, setFabricateFlag } from './config/flags.js';
import {
  buildWorldEssenceMergeRemapNotice,
  forcedReplacementFlagPath,
  hasPendingWorldEssenceMerge,
  mayClearWorldEssenceMergeMap,
  mayClearWorldScopeRekeyMap,
  remapCompletedCleanly,
  remapWorldEssenceIdentityFlags as remapEssenceFlagsAcrossActors,
  remapWorldScopeIdentityFlags as remapIdentityFlagsAcrossActors,
} from './systems/remapWorldScopeIdentityFlags.js';
import { hasPendingWorldScopeRekey } from './systems/worldScopeRekeyPending.js';
// THE SHARED READ SEAM (issue 1370). Seven call sites in this file enter through it, and this file
// is outside the CI lint glob — so an omitted import here is a ReferenceError that no lint, no test
// and no build reports. `tests/main-undefined-identifiers.test.js` is the guard.
import { restampOwnedItemComponentIdentity } from './systems/restampOwnedItemComponentIdentity.js';
import { buildWorldScopeIdentityRemapNotice } from './systems/worldScopeEntityNotice.js';
import { logMigrationNoticeDetail } from './migration/migrationNoticeDetail.js';
import { syncInteractableMarkers } from './canvas/regions/interactableMarkerDepletion.js';
import {
  createGatheringToolBreakage,
  getGatheringEngine,
} from './bootstrap/gatheringRuntime.js';
import { registerModuleHooks } from './bootstrap/hooks.js';
import { Fabricate } from './bootstrap/Fabricate.js';
import { installIdentityRepairs } from './bootstrap/migrations.js';
import { bindFabricateGlobal, buildMacroApi } from './bootstrap/publicApi.js';
import './ui/SvelteFabricateApp.svelte.js';
import './ui/InteractableBrowserApp.svelte.js';
import './ui/InteractionPromptApp.svelte.js';
import './ui/InteractableConfigApp.svelte.js';
import './ui/InteractablesManagerApp.svelte.js';


// The GM-only manager app is deferred to a lazy chunk so non-GM players never download its subtree.
// THE MEMOIZATION LIVES IN `src/utils/memoizedModuleLoad.js` (issue 1565), where a unit test can
// execute it; it clears on REJECTION so no dead promise is retained, which is not a retry capability
// — the host records a failed fetch, so only a reload recovers.
const loadCraftingSystemManagerAppClass = createMemoizedLoad(() =>
  import('./ui/SvelteCraftingSystemManagerApp.svelte.js').then(() =>
    getCraftingSystemManagerAppClass()
  )
);

/** Open the GM manager: the deferred load, then the app class's own `show()`. */
const showCraftingSystemManagerApp = () =>
  loadCraftingSystemManagerAppClass().then((AppClass) => AppClass.show());

/**
 * Report a failed deferred load of the manager subtree (issue 1565). NOT GM-GATED, `openRecipeManager`
 * being macro-reachable. THE INJECTED FUNCTIONS ARE CLOSURES OVER `ui.notifications`, NOT BARE
 * MEMBER VALUES: both touch private fields, so a bare one throws on the failure branch alone.
 */
const reportManagerLoadFailure = createDeferredChunkFailureReporter({
  notify: (message, options) => ui.notifications?.error?.(message, options),
  hasNotice: (notice) => ui.notifications?.has?.(notice),
  // `console.error`, pinned by `tests/release-build.test.js` against the BUILT BUNDLE: a spy passes
  // at any level. Rolldown drops a declared-pure call only when its RETURN VALUE IS UNUSED, and this
  // concise arrow returns it; the stale-entry write below does strip.
  log: (error) => console.error(DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE, error),
  localize: (key, data) => (data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key))
});

/**
 * Tell this client, once per session, that it is running a stale entry script (issue 1565). THE
 * DIRECT DETECTION: the `esmodules` entry has no cache-busting parameter while the reported version
 * comes from `module.json` on disk. EVERY READ OF `__FABRICATE_BUILD_VERSION__` IS INSIDE THE
 * `typeof` GUARD BELOW — `vite.config.js` declares it under `build` ONLY, so a bare read is a
 * `ReferenceError` everywhere else and ESLint cannot catch it.
 */
function reportStaleEntryScript() {
  const buildVersion =
    typeof __FABRICATE_BUILD_VERSION__ === 'string' ? __FABRICATE_BUILD_VERSION__ : '';
  const installedVersion = game.modules?.get('fabricate')?.version ?? '';
  const message = buildStaleEntryNotice({ buildVersion, installedVersion }, (key, data) =>
    data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
  );
  if (!message) return;
  // `warn`, not `error`, so a baked-versus-installed divergence cannot redden the smoke through
  // core's console mirror. `{ console: false }` because that mirror is deferred behind the
  // five-notice cap and lost to a `clear()`. `console.warn` because the declared `log`/`info`/`debug`
  // purity would let Rolldown delete this expression STATEMENT. `release-build.test.js` asserts both.
  console.warn(STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE, { buildVersion, installedVersion });
  ui.notifications?.warn?.(message, { console: false });
}

/**
 * Dispatch startup and `updateWorldTime` processing for crafting, salvage and gathering; timed
 * gathering completion goes to the module-internal GatheringEngine, never exposed on `game.fabricate`.
 */
function processFabricateWorldTime(worldTime = Number(game.time?.worldTime || 0)) {
  return Promise.all(processWorldTimeCallbacksSafely([
    {
      label: 'Crafting',
      callback: async () => {
        await game.fabricate?.getCraftingRunManager?.()?.processWorldTime?.(worldTime);
        await game.fabricate?.getCraftingEngine?.()?.processVersionedWorldTime?.({ worldTime });
      }
    },
    {
      label: 'Salvage',
      callback: () => game.fabricate?.getCraftingEngine?.()?.processPendingSalvageRuns?.(worldTime)
    },
    {
      label: 'Gathering',
      callback: () => getGatheringEngine()?.processWorldTime?.(worldTime)
    }
  ]));
}

const fabricate = new Fabricate();

/**
 * Issue 555 (repurposed by 567) — the one-shot, primary-GM-gated backfill stamping
 * `roles[systemId].recipeItemDefinitionId` on each definition's source Item, PER OWNING SYSTEM so a
 * source registered twice lands both leaves. NOT a MigrationRunner entry.
 */
async function runRecipeItemFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION)) >= RECIPE_ITEM_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampRecipeItemSources) return;
    const summary = await manager.autoStampRecipeItemSources();
    console.debug?.('Fabricate | recipe-item durable-flag auto-stamp complete', summary);
    await setSetting(SETTING_KEYS.RECIPE_ITEM_FLAG_STAMP_VERSION, RECIPE_ITEM_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | recipe-item durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 556 — the one-shot, primary-GM-gated backfill stamping `roles[system.id].componentId` onto
 * every registered component's source Item, BEFORE THE `updateItem` HOOK REGISTERS so restamp writes
 * cannot storm. ITS VERSION ADVANCE IS WITHHELD while `1.30.0` has not completed (requirement 17).
 */
async function runComponentFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.COMPONENT_FLAG_STAMP_VERSION)) >= COMPONENT_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampComponentSources) return;
    const summary = await manager.autoStampComponentSources();
    console.debug?.('Fabricate | component durable-flag auto-stamp complete', summary);
    // WITHHOLD THE VERSION ADVANCE UNTIL THE PRODUCING MIGRATION HAS COMPLETED (issue 1363);
    // `destructive-changes-and-migrations/spec.md` § World-Scope Entity Migration requirement 17
    // owns the rule and the permanent damage an unconditional advance produces.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) return;
    await setSetting(SETTING_KEYS.COMPONENT_FLAG_STAMP_VERSION, COMPONENT_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | component durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 561 — the one-shot, primary-GM-gated backfill stamping `roles[system.id].toolId` onto every
 * registered tool's source Item, withholding its advance for `runComponentFlagAutoStamp`'s reason.
 * ORDERING IS LOAD-BEARING: after `1.15.0` populates the source refs, before `updateItem` registers.
 */
async function runToolFlagAutoStamp() {
  try {
    // Primary-GM only, so exactly one client performs the write in a multi-GM world.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (Number(getSetting(SETTING_KEYS.TOOL_FLAG_STAMP_VERSION)) >= TOOL_FLAG_STAMP_TARGET) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    if (!manager?.autoStampToolSources) return;
    const summary = await manager.autoStampToolSources();
    console.debug?.('Fabricate | tool durable-flag auto-stamp complete', summary);
    // WITHHOLD THE VERSION ADVANCE UNTIL THE PRODUCING MIGRATION HAS COMPLETED (issue 1363);
    // `destructive-changes-and-migrations/spec.md` § World-Scope Entity Migration requirement 17
    // owns the rule and the permanent damage an unconditional advance produces.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) return;
    await setSetting(SETTING_KEYS.TOOL_FLAG_STAMP_VERSION, TOOL_FLAG_STAMP_TARGET);
  } catch (error) {
    console.error('Fabricate | tool durable-flag auto-stamp failed', error);
  }
}

/**
 * Issue 600 — the one-shot, active-GM-gated re-stamp writing `roles[systemId].componentId` onto OWNED
 * actor items resolving to a component by NAME ONLY. SCOPE: `game.actors` only, never an unlinked
 * synthetic-token actor. NOT a MigrationRunner entry: that runner has no Item handle.
 */
async function runOwnedItemComponentIdentityRestamp() {
  try {
    // Active-GM only, so exactly one client performs the inventory writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.OWNED_ITEM_COMPONENT_STAMP_VERSION)) >=
      OWNED_ITEM_COMPONENT_STAMP_TARGET
    ) {
      return;
    }
    const manager = fabricate?.getCraftingSystemManager?.();
    const systems = manager?.getSystems?.() ?? [];
    const summary = await restampOwnedItemComponentIdentity({
      actors: game.actors ?? [],
      systems,
      writeFlag: (item, flagKey, componentId) => setFabricateFlag(item, flagKey, componentId),
    });
    console.debug?.('Fabricate | owned-item component identity re-stamp complete', summary);
    await setSetting(
      SETTING_KEYS.OWNED_ITEM_COMPONENT_STAMP_VERSION,
      OWNED_ITEM_COMPONENT_STAMP_TARGET
    );
  } catch (error) {
    console.error('Fabricate | owned-item component identity re-stamp failed', error);
  }
}

/**
 * Issue 1363 — the one-shot, active-GM-gated pass remapping every durable identity flag the `1.30.0`
 * re-key invalidated. THE TWO GATES ARE DIFFERENT AND MUST STAY SO; § World-Scope Entity Migration
 * requirements 13 and 17 own both, the `compareSemver` rule and the withheld version advance.
 */
async function runWorldScopeIdentityFlagRemap() {
  try {
    // Active-GM only, so exactly one client performs the writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION)) >=
      WORLD_SCOPE_IDENTITY_FLAG_TARGET
    ) {
      return;
    }
    // THE RUN GATE IS CORPUS-DERIVED: a seeded scope with no pending map has nothing to remap, and a
    // world with nothing to remap still falls through to the version advance so it stops re-checking
    // — an advance itself gated on migration completion, so a deferred migration re-runs.
    const rekeyMap = getSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP) ?? {};
    let summary = null;
    if (hasPendingWorldScopeRekey(() => rekeyMap)) {
      summary = await applyWorldScopeIdentityFlagRemap(rekeyMap);
    }

    // THE CLEAR and the version advance share ONE gate, on `compareSemver` in the pure module so no
    // reader re-derives it as a bare JS `>=` over a STRING setting.
    if (!mayClearWorldScopeRekeyMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) {
      console.warn(
        'Fabricate | world-scope re-key map RETAINED: the 1.30.0 migration has not completed on this world yet, so the decision record it may still need is not destroyed. This pass will run again after a successful migration pass.'
      );
      return;
    }
    // THE SECOND WITHHOLD, asking whether THIS pass completed where the first asks about the
    // PRODUCING migration: destroying the map would strand a rejected write's actor on retired ids.
    if (!remapCompletedCleanly(summary)) {
      console.warn(
        `Fabricate | world-scope re-key map RETAINED: ${summary.skippedErrors} document(s) could not be updated, so the repair is incomplete and its decision record is not destroyed. Fix the cause and reload, or run game.fabricate.remapWorldScopeIdentityFlags().`
      );
      return;
    }
    await setSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, {});
    await setSetting(
      SETTING_KEYS.WORLD_SCOPE_IDENTITY_FLAG_VERSION,
      WORLD_SCOPE_IDENTITY_FLAG_TARGET
    );
  } catch (error) {
    console.error('Fabricate | world-scope identity flag remap failed', error);
  }
}

/** Apply the remap and post its GM notice; the gating above is the decision, this is the work. */
async function applyWorldScopeIdentityFlagRemap(rekeyMap) {
    const summary = await remapIdentityFlagsAcrossActors({
      actors: game.actors ?? [],
      rekeyMap,
      // Two depths, deliberately: the containers, the roles map and the legacy scalar are DOUBLY
      // nested under `flags.fabricate.fabricate.<key>`, while `gatheringRuns` is single-scope.
      readFlag: (document, key, fallback = null, options = {}) =>
        options.bare
          ? (document?.getFlag?.('fabricate', key) ?? fallback)
          : getFabricateFlag(document, key, fallback),
      writeFabricateFlag: (document, key, value) => setFabricateFlag(document, key, value),
      writeBareFlag: (document, key, value) => document?.setFlag?.('fabricate', key, value),
    });
    console.debug?.('Fabricate | world-scope identity flag remap complete', summary);

    const notice = buildWorldScopeIdentityRemapNotice(summary, (key, data) =>
      data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
    );
    if (notice.message && game.user?.isGM) {
      logMigrationNoticeDetail('1.30.0 world-scope identity flag remap', notice.detail);
      ui.notifications?.warn?.(notice.message, { permanent: true });
    }
    return summary;
}

/**
 * Issue 1654 — the one-shot, active-GM-gated pass remapping every durable essence reference the
 * `1.34.0` merge invalidated. It mirrors `runWorldScopeIdentityFlagRemap` but carries its OWN
 * decision record, so a world that consumed one may still owe the other.
 */
async function runWorldEssenceMergeFlagRemap() {
  try {
    // Active-GM only, so exactly one client performs the writes.
    if (game.users?.activeGM?.id !== game.user?.id) return;
    if (
      Number(getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION)) >=
      WORLD_ESSENCE_MERGE_FLAG_TARGET
    ) {
      return;
    }
    // The run gate. A world with nothing to remap still falls through to the version advance so it
    // stops re-checking every boot; that advance is itself gated on migration completion.
    const mergeMap = getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP) ?? {};
    let summary = null;
    if (hasPendingWorldEssenceMerge(mergeMap)) {
      summary = await applyWorldEssenceMergeFlagRemap(mergeMap);
    }

    // The clear and the version advance share one gate, on `compareSemver` in the pure module so
    // no reader re-derives it as a bare JS `>=` on a string setting.
    if (!mayClearWorldEssenceMergeMap(getSetting(SETTING_KEYS.MIGRATION_VERSION))) {
      console.warn(
        'Fabricate | world essence merge map RETAINED: the 1.34.0 migration has not completed on this world yet, so the decision record it may still need is not destroyed. This pass will run again after a successful migration pass.'
      );
      return;
    }
    // The second withhold asks a different question from the first: that gate asks whether the
    // producing migration completed, this whether this pass did.
    if (!remapCompletedCleanly(summary)) {
      console.warn(
        `Fabricate | world essence merge map RETAINED: ${summary.skippedErrors} document(s) could not be updated, so the repair is incomplete and its decision record is not destroyed. Fix the cause and reload, or run game.fabricate.remapWorldEssenceIdentityFlags().`
      );
      return;
    }
    // The `systems` leg only, `retired` written back explicitly: it is the tombstone keeping a
    // retired essence id taken for the life of the world, so a `{}` clear would let it reissue.
    const stored = getSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP) ?? {};
    await setSetting(SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP, {
      systems: {},
      retired: stored.retired ?? {},
    });
    await setSetting(
      SETTING_KEYS.WORLD_ESSENCE_MERGE_FLAG_VERSION,
      WORLD_ESSENCE_MERGE_FLAG_TARGET
    );
  } catch (error) {
    console.error('Fabricate | world essence merge flag remap failed', error);
  }
}

/**
 * Apply the essence remap; the gating above is the decision. EVERY WRITE IS A FORCED REPLACEMENT,
 * never `setFabricateFlag`: an essence id is an object KEY and `Document#update` merges without
 * deleting, so a merge write would leave the retired key beside the new one.
 */
async function applyWorldEssenceMergeFlagRemap(mergeMap) {
  // A write counts as landed on the strength of not throwing, so the counts can overstate —
  // deliberately, the overstatement reaching no gate that `skippedErrors` does not already serve.
  const replace = (document, path, value) => document?.update?.({ [path]: value });
  const summary = await remapEssenceFlagsAcrossActors({
    actors: game.actors ?? [],
    mergeMap,
    // The same two read depths the `1.30.0` edge supplies, for the same reason.
    readFlag: (document, key, fallback = null, options = {}) =>
      options.bare
        ? (document?.getFlag?.('fabricate', key) ?? fallback)
        : getFabricateFlag(document, key, fallback),
    replaceFabricateFlag: (document, key, value) =>
      replace(document, forcedReplacementFlagPath(key), value),
    replaceBareFlag: (document, key, value) =>
      replace(document, forcedReplacementFlagPath(key, { bare: true }), value),
  });
  console.debug?.('Fabricate | world essence merge flag remap complete', summary);

  // The GM channel: a refused group leaves the world merged in its settings and un-merged in its
  // actor flags, the one outcome of this pass a GM must act on.
  const notice = buildWorldEssenceMergeRemapNotice(summary, (key, data) =>
    data ? game.i18n?.format?.(key, data) : game.i18n?.localize?.(key)
  );
  if (notice.message && game.user?.isGM) {
    logMigrationNoticeDetail('1.34.0 essence flag remap', notice.detail);
    ui.notifications?.warn?.(notice.message, { permanent: true });
  }
  return summary;
}

/**
 * Run the env-node-driven marker image sync across all scenes, resolving environment and task the
 * way InteractableManager does and writing the tile texture as the active GM.
 */
async function runInteractableMarkerSync() {
  try {
    const environmentStore = fabricate?.getGatheringEnvironmentStore?.() ?? null;
    await syncInteractableMarkers({
      scenes: game.scenes,
      isActiveGM: () => game.user?.id === game.users?.activeGM?.id,
      resolveEnvironment: (environmentId) => environmentStore?.get?.(environmentId) ?? null,
      resolveTask: (systemId, taskId) => {
        const config = getSetting(SETTING_KEYS.GATHERING_CONFIG);
        const tasks = config?.systems?.[systemId]?.tasks;
        return (Array.isArray(tasks) ? tasks : []).find(task => task?.id === taskId) ?? null;
      },
      applyTileImage: (tile, update) => tile?.update?.(update)
    });
  } catch (_error) {
    // Defensive: marker sync must never throw into a hook body.
  }
}

/**
 * What `src/bootstrap/` needs from the module entry: the singleton, the world-time dispatcher, the
 * startup one-shots, the marker sync and the deferred manager entry. The dependency runs one way —
 * `src/main.js` to `src/bootstrap/` — so no bootstrap module imports this file.
 */
const io = {
  fabricate,
  bindFabricateGlobal: () => bindFabricateGlobal(fabricate, io),
  loadCraftingSystemManagerAppClass,
  processFabricateWorldTime,
  reportManagerLoadFailure,
  reportStaleEntryScript,
  runComponentFlagAutoStamp,
  runInteractableMarkerSync,
  runOwnedItemComponentIdentityRestamp,
  runRecipeItemFlagAutoStamp,
  runToolFlagAutoStamp,
  runWorldEssenceMergeFlagRemap,
  runWorldScopeIdentityFlagRemap,
  showCraftingSystemManagerApp,
};

// The two GM recovery repairs are declared here, beside the startup one-shots that also run them,
// and published to the facade through `src/bootstrap/migrations.js` so no bootstrap module imports
// this file.
installIdentityRepairs({ applyWorldEssenceMergeFlagRemap, applyWorldScopeIdentityFlagRemap });

registerModuleHooks(io);

// The macro-facing public surface.
const MACRO_API = buildMacroApi(io);

globalThis.fabricate = MACRO_API;

export const __test = {
  createGatheringToolAvailability,
  createGatheringToolBreakage,
  createGatheringResultCreator,
  matchGatheringTools
};

/**
 * The rest of the `ready` startup, exported so a Foundry-free host can run it: these flag
 * auto-stamps populate the tier-1 `roles` identity `sourceUuid.js` resolves against, and the listed
 * ORDER is load-bearing. Exported as a BLOCK, several tests asserting on their literal source text.
 */
export {
  processFabricateWorldTime,
  runRecipeItemFlagAutoStamp,
  runComponentFlagAutoStamp,
  runToolFlagAutoStamp,
  runOwnedItemComponentIdentityRestamp,
  runWorldScopeIdentityFlagRemap,
};

export default fabricate;
