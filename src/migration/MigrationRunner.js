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
import { migrateCharacterLibrariesToWorldScope } from './migrateCharacterLibrariesToWorldScope.js';
import { migrateRecipes, migrateCraftingSystems } from './migrateComponentId.js';
import { migrateCurrencyToWorldScope } from './migrateCurrencyToWorldScope.js';
import { migrateDefaultOnTimeRequirements } from './migrateDefaultOnTimeRequirements.js';
import { migrateEssencesToIngredientGroups } from './migrateEssencesToIngredientGroups.js';
import { migrateGatheringChecksToSystem } from './migrateGatheringChecksToSystem.js';
import { migrateGatheringConfig } from './migrateGatheringConfig.js';
import { migrateGatheringEconomy } from './migrateGatheringEconomy.js';
import { migrateGatheringLimitationToggles } from './migrateGatheringLimitationToggles.js';
import { migrateInvertRecipeItemLink } from './migrateInvertRecipeItemLink.js';
import { migrateLegacyResolutionModes } from './migrateLegacyResolutionModes.js';
import { migrateManualCompositionForces } from './migrateManualCompositionForces.js';
import { migrateMaxModifierPicks } from './migrateMaxModifierPicks.js';
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
import { migrateRetireCraftingModToken } from './migrateRetireCraftingModToken.js';
import { migrateRetireProgressiveAllowPlayerReorder } from './migrateRetireProgressiveAllowPlayerReorder.js';
import { migrateSeedFailureResultPolicy } from './migrateSeedFailureResultPolicy.js';
import { migrateSplitRoutedResolutionModes } from './migrateSplitRoutedResolutionModes.js';
import { migrateStaminaRegenPolicy } from './migrateStaminaRegenPolicy.js';
import { migrateSystemCheckModifierCatalogue } from './migrateSystemCheckModifierCatalogue.js';
import { migrateToolsToFirstClass } from './migrateToolsToFirstClass.js';
import { migrateToolsToSystem } from './migrateToolsToSystem.js';
import { migrateTravelToWorldScope } from './migrateTravelToWorldScope.js';
import { migrateUnifyGatheringRegions } from './migrateUnifyGatheringRegions.js';
import { migrateUnifyModifierLibraries } from './migrateUnifyModifierLibraries.js';
import { migrateVisibilityModeEnum } from './migrateVisibilityModeEnum.js';
import { migrateWorldScopeEntities } from './migrateWorldScopeEntities.js';
import { isFatalMigrationError } from './migrationErrors.js';
import { DOWNGRADE_ADVICE } from './migrationRecoveryPrompt.js';

export { FatalMigrationError, isFatalMigrationError } from './migrationErrors.js';

// ---------------------------------------------------------------------------
// Semver comparison utility (no npm dependency)
// ---------------------------------------------------------------------------

/**
 * Compare two semver strings numerically.
 *
 * Exported for issue 1224: the Valid Id Basis has to answer "is `migrationVersion` BEHIND
 * the highest registered migration", and re-implementing this comparison beside the
 * registry it compares against is how the two drift apart.
 *
 * @param {string} a
 * @param {string} b
 * @returns {-1|0|1}
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

/** The per-system count keys the 1.21.0 report carries, coerced to finite integers. */
const RETIRED_CRAFTING_MOD_COUNT_KEYS = ['inert', 'subtractive', 'repeated', 'untouched'];

/**
 * Normalize one entry of the transient `_retiredCraftingModCounts` report (1.21.0) into a
 * fixed `{ system, inert, subtractive, repeated, untouched }` shape.
 *
 * Coerced rather than passed through, so the GM notice can format the numbers without
 * re-guarding each one, and so a hand-built or partially-written entry cannot put `NaN`
 * or an object into a notification string.
 * @param {*} entry
 * @returns {{ system: string, inert: number, subtractive: number, repeated: number, untouched: number }|null}
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

/**
 * Normalize one entry of the transient `_characterLibraryCollisions` report (1.28.0) into a fixed
 * `{ library, entryId, keptFrom, discardedFrom }` shape, so the GM notice can format it without
 * re-guarding each field and a hand-written entry cannot put an object into a notification string.
 *
 * @param {*} entry
 * @returns {{ library: string, entryId: string, keptFrom: string, discardedFrom: string }|null}
 */
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
 * Normalize one entry of the transient `_unifiedModifierCollisions` report (1.23.0) into a
 * fixed `{ system, collisions }` shape, dropping an entry that reports no collision.
 *
 * Coerced rather than passed through, for the reason
 * {@link _normalizeRetiredCraftingModEntry} is: the GM notice formats the number without
 * re-guarding it, so a hand-built or partially-written entry cannot put `NaN` or an object
 * into a notification string.
 * @param {*} entry
 * @returns {{ system: string, collisions: number }|null}
 */
function _normalizeModifierCollisionEntry(entry) {
  if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const collisions = Number(entry.collisions);
  if (!Number.isFinite(collisions) || collisions <= 0) return null;
  return { system: String(entry.system ?? ''), collisions: Math.trunc(collisions) };
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
  {
    version: '1.19.0',
    label:
      'Default-on the recipe time requirement for upgraded worlds: delete a persisted ' +
      'requirements.time.enabled === false (the pre-toggle normalizer coercion of an absent ' +
      'flag), so the new default-on reader keeps existing timed recipes running',
    // The last release before the toggle: a world downgraded to it re-coerces the deleted
    // flag back to `false` via the pre-714 normalizer, landing on that release's own schema
    // (time requirements ignored) — so the downgrade is lossless.
    downgradeTo: '1.18.0',
    migrate: (data) => migrateDefaultOnTimeRequirements(data.systems),
  },
  {
    version: '1.20.0',
    label:
      'Cap the modifier picks of systems already on the playerPicks combination rule at ' +
      'craftingCheck.maxModifierPicks = 1, the single pick that rule always meant, so the ' +
      'new generalized cap does not silently widen them to unlimited',
    // The last release before the cap existed: a world downgraded to it drops the unknown
    // `maxModifierPicks` key through the allowlist literal in
    // `_normalizeCheckModifierConfig`, and its `playerPicks` already means "pick one" —
    // exactly what the dropped cap encoded — so the downgrade is lossless and lands on
    // that release's own schema.
    downgradeTo: '1.19.0',
    // Reads/returns `{ recipes, systems }`: only `systems` is rewritten, and `recipes` is
    // returned unchanged so the deliberate recipe-level no-op is explicit.
    migrate: (data) => migrateMaxModifierPicks(data),
  },
  {
    version: '1.21.0',
    label:
      'Retire the check-modifier roll-formula placeholder: strip it from every stored ' +
      'crafting, salvage and gathering check formula, because the resolved modifier ' +
      'scalar is now appended automatically as a flavoured term',
    // DATA-lossless but BEHAVIOUR-lossy, and deliberately NOT described as "lands on that
    // release's own schema" the way every entry above it can be. A world downgraded to
    // 1.20.0 finds its formulas intact and its catalogue intact — nothing was deleted but
    // a token that release no longer needs — yet that build resolves check modifiers ONLY
    // through the placeholder it now lacks, so they stop contributing to any roll until a
    // GM types the placeholder back into each formula by hand. No previous entry in this
    // registry carries that shape of caveat.
    downgradeTo: '1.20.0',
    // Reports the per-system counts through the transient `_retiredCraftingModCounts`
    // field (captured and deleted by the runner below for the GM notice).
    migrate: (data) => migrateRetireCraftingModToken(data),
  },
  {
    version: '1.22.0',
    // THE LOSSY-DOWNGRADE FACT IS IN THE LABEL, NOT IN A COMMENT. The label is the only
    // string a GM ever reads about this migration — `migrationRecoveryPrompt` renders it as
    // "aborted during …" beside the Keep/Downgrade buttons — and "Downgrade to 1.21.0" is
    // precisely the choice this warning is about. A source comment stating it would be
    // addressed to the wrong reader at the wrong moment.
    label:
      'Lift the check-modifier catalogue out of craftingCheck up to the system, so ' +
      'salvage and gathering can select over the same one, and rewrite the byRecipe ' +
      'combination rule to its activity-independent name bySubject. THE RUNNER ORDER IS ' +
      'LOAD-BEARING: this runs before any manager load, and _normalizeCraftingCheck is an ' +
      'allowlist rebuild that no longer emits checkModifiers, so a save running first ' +
      'would have DELETED the catalogue rather than relocating it. DOWNGRADING IS NOT ' +
      'LOSSLESS, and this is the first migration in this registry of which that is true: ' +
      '1.21.0 never saw a system-level checkModifiers, so it drops the relocated catalogue ' +
      'on the first read and every check modifier stops contributing to every roll until ' +
      'you re-author it. Your formulas and combination rules are unaffected',
    downgradeTo: '1.21.0',
    // MACHINE-READABLE, so the label clause above is a RULE rather than one entry's prose. A
    // migration that marks itself here must name the loss in its own `label`
    // (`tests/migration-runner.test.js` enforces it over the whole registry), because the label
    // is the only string a GM reads at the Keep/Downgrade prompt and a caveat left in a source
    // comment reaches nobody standing in front of that dialog. `1.21.0` is deliberately NOT
    // marked: it is DATA-lossless and BEHAVIOUR-lossy, which is a different fact.
    downgradeLosesData: true,
    migrate: (data) => migrateSystemCheckModifierCatalogue(data),
  },
  {
    version: '1.23.0',
    // THE LOSSY-DOWNGRADE FACT IS IN THE LABEL, for the reason `1.22.0` states: the label
    // is the only string a GM ever reads about this migration, and "Downgrade to 1.22.0"
    // is precisely the choice this warning is about.
    label:
      'Merge the two modifier libraries a crafting system authored — the check-modifier ' +
      'catalogue and the gathering character-modifier library — into one system.modifiers, ' +
      'so a named actor expression is defined once and referenced by checks, drop rows, ' +
      'events and stamina costs alike. An id authored in BOTH libraries keeps the check ' +
      "entry's id and the gathering entry is re-keyed with a -gathering suffix, with every " +
      'gathering reference rewritten to match. THE RUNNER ORDER IS LOAD-BEARING: this runs ' +
      'before any manager load, and both normalizers are allowlist rebuilds that no longer ' +
      'emit the old keys, so a save running first would have DELETED both libraries rather ' +
      'than merging them. DOWNGRADING IS NOT LOSSLESS: 1.22.0 never saw system.modifiers, ' +
      'so it drops the merged library on the first read — every check modifier stops ' +
      'contributing to every roll AND every gathering drop row, event and stamina cost ' +
      'loses the modifier it references, until you re-author both libraries',
    downgradeTo: '1.22.0',
    // MACHINE-READABLE, per the rule `1.22.0` established: a migration marked here must
    // name the loss in its own `label` (`tests/migration-runner.test.js` enforces it over
    // the whole registry).
    downgradeLosesData: true,
    // Reports the per-system id-collision counts through the transient
    // `_unifiedModifierCollisions` field (captured and deleted by the runner below).
    migrate: (data) => migrateUnifyModifierLibraries(data),
  },
  {
    version: '1.24.0',
    // THE LOSSY-DOWNGRADE FACT IS IN THE LABEL, per the rule 1.22.0 established: the label
    // is the only string a GM reads at the Keep/Downgrade prompt.
    label:
      'Give the routed check its own DC source, so a routed relative check can compute its ' +
      'base DC from a macro exactly as a simple check can. NO DATA IS REWRITTEN: the ' +
      'routed normalizer defaults an absent dcMode to static, so every existing system ' +
      'loads unchanged and this entry exists to mark the version boundary. DOWNGRADING IS ' +
      'NOT LOSSLESS: 1.23.0 never saw routed.dcMode or routed.macroUuid, and its routed ' +
      'normalizer is an allowlist rebuild that does not emit them, so the first save on ' +
      'that build DELETES both — a routed check set to Dynamic silently reverts to its ' +
      'static DC and loses the macro link, which you must re-author',
    downgradeTo: '1.23.0',
    // MACHINE-READABLE, per the rule 1.22.0 established: a migration marked here must name
    // the loss in its own `label` (`tests/migration-runner.test.js` enforces it over the
    // whole registry).
    downgradeLosesData: true,
    // A DELIBERATE NO-OP, in the shape 1.20.0's recipe-level entry already uses. There is
    // nothing to rewrite — absence already reads as `static` — and writing the default onto
    // every stored routed slot would touch every system in the world to change nothing.
    // What this entry buys is the boundary the recovery prompt warns at.
    migrate: (data) => data,
  },
  {
    version: '1.25.0',
    // NO LOSSY-DOWNGRADE CLAUSE, and that is the fact worth stating. Unlike 1.22.0,
    // 1.23.0 and 1.24.0 this migration's downgrade IS clean, so it is deliberately not
    // marked `downgradeLosesData` — the rule those three established is about naming a
    // real loss in the label, not about every entry claiming one.
    label:
      'Seed the new per-activity failure-result policy to "never" on every crafting, ' +
      'salvage and gathering check that already exists, so NO EXISTING WORLD CHANGES ' +
      'BEHAVIOUR. A failed check can now produce an authored failure result, and a ' +
      'newly-created system decides that per record — but a system you authored before ' +
      'this release was authored against an engine that could not produce on failure at ' +
      'all. A salvage component may already carry a reserved failure result group that ' +
      'has always awarded nothing; without this seed the upgrade would start awarding it ' +
      'on every failed salvage. Turn the policy on yourself, per activity, per system. ' +
      'Checks that do not exist yet are left alone, and DOWNGRADING IS LOSSLESS: 1.24.0 ' +
      'does not emit this key, drops it on the first save, and has no failure-result ' +
      'capability for it to govern',
    downgradeTo: '1.24.0',
    // Reports nothing, so it adds no key to the runner's three return literals below:
    // its entire observable effect is that nothing observable changes.
    migrate: (data) => migrateSeedFailureResultPolicy(data),
  },
  {
    version: '1.26.0',
    label:
      'Move the currency configuration from each crafting system to WORLD scope. The coin ' +
      'ladder, spend strategy, provider and macro set now live once per world, because a ' +
      'world runs exactly one game system and so has exactly one way actors store coins; a ' +
      'crafting system keeps only whether it participates. Units from every system are ' +
      'UNIONED by unit id (the first system wins an id collision) because recipe and salvage ' +
      'currency requirements reference units by id, so dropping any unit would orphan them. ' +
      'The strategy, provider and macros cannot be unioned, so they are taken from the first ' +
      'system that had currency ENABLED. If two of your systems configured DIFFERENT ' +
      'strategies or providers, only one survives — check World > Currency afterwards. ' +
      'DOWNGRADING IS NOT LOSSLESS: 1.25.0 reads currency only from the crafting system, so it ' +
      'would find no configuration at all and every authored currency cost would stop ' +
      'resolving until you re-authored it per system',
    downgradeTo: '1.25.0',
    downgradeLosesData: true,
    migrate: (data) => migrateCurrencyToWorldScope(data),
  },
  {
    version: '1.27.0',
    label:
      'Move the travel configuration from each crafting system to WORLD scope. Realms, their ' +
      'map region links, the reveal mode and the modifier visibility now live once per world, ' +
      'because realms are geography — the same valley is the same valley whichever crafting ' +
      'system a character is there to serve — and a crafting system keeps only whether it ' +
      'participates. Realms from every system are UNIONED by realm id (the first system wins ' +
      'an id collision) because environments, party overrides and character discovery all ' +
      'reference realms by id, so dropping any realm would orphan them. Two systems that ' +
      'authored a realm of the SAME NAME keep both records; merge them by hand if you want ' +
      'one. The reveal mode and modifier visibility cannot be unioned, so they are taken from ' +
      'the first system that had travel ENABLED — if two of your systems set DIFFERENT reveal ' +
      'modes, only one survives, so check World > Travel afterwards. Each party now has ONE ' +
      'current-realm override rather than one per system, keeping the most recently set. ' +
      'DOWNGRADING IS NOT LOSSLESS: 1.26.0 reads realms only from the crafting system, so it ' +
      'would find none, every realm-gated environment would report no current realm, and ' +
      'Travel would go dark until you re-authored it per system',
    downgradeTo: '1.26.0',
    downgradeLosesData: true,
    migrate: (data) => migrateTravelToWorldScope(data),
  },
  {
    version: '1.28.0',
    label:
      'Move the character prerequisite library and the modifier library from each crafting ' +
      'system to WORLD scope. Both describe the acting CHARACTER rather than the crafting ' +
      'system — a proficiency requirement is a fact about a character, and an ability modifier ' +
      'is a number read off a character sheet — so a world running three systems was ' +
      'maintaining three copies of every rule. Unlike currency and travel, NOTHING stays on the ' +
      'crafting system: there is no participation flag, because an unreferenced entry costs ' +
      'nothing. Entries from every system are UNIONED by id, per library, with the first system ' +
      'winning a collision, because books, tools, complications, recipes, components, gathering ' +
      'tasks, drop rows and events all reference entries by id and dropping one would orphan ' +
      'them. COLLISIONS ARE COMMON HERE, unlike the earlier moves: preset ids are stable slugs ' +
      'such as "smithsTools" and "perception", so seeding presets in two systems collides on ' +
      'every seeded entry, and presets are editable afterwards. Where two systems disagreed ' +
      'about what an id MEANS only one survives, so the reference still resolves but to a ' +
      'different rule — every such case is reported by name, and identical copies are not, so ' +
      'the list you see is the list that actually changed something. Check World > Character ' +
      'prerequisites and World > Modifiers afterwards. DOWNGRADING IS NOT LOSSLESS: 1.27.0 ' +
      'reads both libraries only from the crafting system, so it would find none, every ' +
      'learning gate and tool requirement would stop resolving and every check modifier would ' +
      'contribute nothing until you re-authored them per system',
    downgradeTo: '1.27.0',
    downgradeLosesData: true,
    migrate: (data) => migrateCharacterLibrariesToWorldScope(data),
  },
  {
    version: '1.29.0',
    label:
      'Give every gathering environment ONE list that decides what it composes. Force add is ' +
      "now an override of AUTOMATIC mode's biome-and-danger filter, which is the only mode " +
      'that has a filter to override; MANUAL mode composes exactly the records you picked, ' +
      "matching or not. So each manual environment's force-added tasks and events are FOLDED " +
      'into its picked list — appended in order, de-duplicated, with the display order left ' +
      'alone — because force add rendered in manual mode until now, and a manual environment ' +
      'whose picks were all force-added would otherwise compose NOTHING after the upgrade. ' +
      'Force lists are then cleared on every environment, automatic ones included: force add ' +
      'has never rendered in automatic mode in any released version, so an entry there is ' +
      'residue from a manual editing session or from an imported bundle, it composed nothing ' +
      'before and it must compose nothing now — which is what keeps the documented guarantee ' +
      'that switching a manual environment to automatic does not silently make its force-added ' +
      'non-matching records available. NO ENVIRONMENT LOSES OR GAINS A COMPOSED RECORD. ' +
      'DOWNGRADING IS NOT LOSSLESS: 1.28.0 filters a manual environment by match and reads an ' +
      'empty force list, so every non-matching record this migration rescued would vanish from ' +
      'the environment again, with no force list left to re-express it',
    downgradeTo: '1.28.0',
    downgradeLosesData: true,
    migrate: (data) => migrateManualCompositionForces(data),
  },
  {
    version: '1.30.0',
    label:
      'Give the world ONE record per component, essence and tool, instead of one per crafting ' +
      'system. The same real item registered in three systems was three unrelated records with ' +
      'three names, three images and three descriptions; it is now one WORLD entity plus one ' +
      'membership record per system. Records are merged by SOURCE ITEM — never by name, so two ' +
      'unlinked entries that merely share a name are left alone — and the OLDEST contributing ' +
      "system's identity wins the whole group, as a unit. Every rename is reported by name with " +
      'the two systems it spans, and every other reference to a re-keyed id is rewritten across ' +
      'your recipes, systems and gathering config in the same pass. NO SYSTEM CHANGES BEHAVIOUR: ' +
      'every membership record is created fully OVERRIDING, so each system keeps exactly the ' +
      'category, tags, effect source, macro, breakage, on-break and repair recipe it had, and ' +
      'no world defaults are written at all — a system created later inherits nothing until you ' +
      'author them. Essences are matched by id and are never re-keyed. Where a system could ' +
      'not be re-keyed safely the pass REFUSES that system outright and reports it, rather than ' +
      'making a definition unreachable. Owned items keep resolving throughout: their durable ' +
      'identity flags are remapped by a one-shot pass on the next reload, and until it runs they ' +
      'resolve by source item instead. TWO CAVEATS. Once the world scope is seeded, a reference ' +
      'that already pointed at nothing becomes prunable on the next save — those are listed for ' +
      'you. And DOWNGRADING IS LOSSLESS FOR DATA but pins one setting: 1.29.0 neither reads nor ' +
      'writes the three world scope settings, so they survive untouched and a re-upgrade finds ' +
      'them intact, but 1.29.0 re-mints a concrete "tool specific" breakage authority onto every ' +
      'system, which pins a system out of a world authority that a later release lets you author',
    downgradeTo: '1.29.0',
    // DELIBERATELY NOT MARKED `downgradeLosesData`, and that is a CHECKED declaration rather
    // than a copied one (issue 1363). The two candidate losses were each examined and each
    // fails the test the registry applies: the merged identities are a loss at MIGRATION time
    // rather than one the downgrade causes, and the three scope settings are PRESERVED as
    // orphaned `Setting` documents that a re-upgrade finds intact. The `toolSpecific`
    // re-minting is real, but it is DATA-lossless and BEHAVIOUR-relevant — the same fact
    // `1.21.0` is deliberately not marked for — so it is stated as a caveat in the label and
    // not claimed as data loss. `tests/world-scope-downgrade-declaration.test.js` holds both
    // arms executable rather than asserted.
    downgradeLosesData: false,
    // Reports entities created, groups merged, every rename, refusals and the newly-prunable
    // references through the transient `_worldScopeEntityReport` field (captured and deleted
    // by the runner below for the GM notice).
    migrate: (data) => migrateWorldScopeEntities(data),
  },
  // Future migrations added here in version order
];

/**
 * The highest version in the registry above — the version a fully migrated world's
 * `migrationVersion` setting holds once a migration pass has completed.
 *
 * Derived by comparison rather than read off the last element, so a future entry appended
 * out of order cannot silently lower the answer. Exported for issue 1224's Valid Id Basis,
 * which would otherwise hardcode the literal and stop being true the next time a migration
 * is registered — a hardcoded version that has fallen behind the registry reads as
 * "migrations current" forever, which is fail-OPEN in exactly the gate that must fail closed.
 *
 * @returns {string} a semver string, e.g. `'1.25.0'`.
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
 * Why a migration pass persisted nothing and left `migrationVersion` where it found it
 * (issue 1242).
 *
 * A DEFERRAL is not an abort. An abort is a fatal migration error, has per-document
 * remediation and a downgrade target, and gets the recovery dialog. A deferral is a storage
 * fact — the corpus could not be read, or could not be written — and its remedy is a reload
 * rather than a document fix, so it gets its own GM notice.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MIGRATION_DEFERRAL_REASONS = Object.freeze({
  /** The recipe corpus could not be read. Distinct from an EMPTY corpus, deliberately. */
  CORPUS_READ_FAILED: 'corpusReadFailed',
  /** A writeback leg failed, so the remaining legs and the version bump were abandoned. */
  WRITEBACK_FAILED: 'writebackFailed',
});

/**
 * The summary shape a pass returns when it persisted nothing.
 *
 * Written once rather than as a fourth copy of the same literal: the early return, the abort
 * and the two deferrals all describe "this pass wrote nothing", and four hand-maintained
 * copies drift the moment a summary key is added.
 *
 * @param {object} [overrides]
 * @returns {object}
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
    ...overrides,
  };
}

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
   *   recipeCorpus?: { loadAll: Function, createOrUpdateAll: Function },
   *   migrations?: Array<{ version: string, label: string, migrate: Function, downgradeTo?: string, downgradeLosesData?: boolean }>
   * }} opts
   *   `promptRecovery` is an optional seam invoked with the abort context so the
   *   caller can present a GM decision prompt; `migrations` overrides the default
   *   registry (used by tests to inject a fatal migration) and defaults to the
   *   production `MIGRATIONS`.
   *
   *   `recipeCorpus` and `craftingSystemCorpus` are the corpus accessors this pass reads and
   *   writes through (issue 1242). Both DEFAULT to the whole-array setting accessors below,
   *   which is what production uses; they stay injectable so a fixture can observe or refuse
   *   a corpus read or write without patching `game.settings`.
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
      return emptyPassSummary();
    }

    let rawRecipes;
    try {
      // Contained because an escaping rejection is INVISIBLE: the hook dispatcher's try/catch
      // is synchronous, so a rejection out of the module's async `ready` callback fires no
      // error hook and no notification, leaves the readiness promise unsettled and the module
      // with no managers.
      rawRecipes = await this._recipeCorpus.loadAll();
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
    let rawSystems;
    try {
      // Contained for the same reason the recipe read is.
      rawSystems = await this._craftingSystemCorpus.loadAll();
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
    const rawGatheringConfig = this._getSetting(SETTING_KEYS.GATHERING_CONFIG) ?? {};
    const rawEnvironments = this._getSetting(SETTING_KEYS.GATHERING_ENVIRONMENTS) ?? [];
    const rawGatheringParties = this._getSetting(SETTING_KEYS.GATHERING_PARTIES) ?? [];
    const rawCurrencyConfig = this._getSetting(SETTING_KEYS.CURRENCY_CONFIG) ?? {};
    const rawTravelConfig = this._getSetting(SETTING_KEYS.TRAVEL_CONFIG) ?? {};
    const rawCharacterLibraries = this._getSetting(SETTING_KEYS.CHARACTER_LIBRARIES) ?? {};
    const rawComponentScope = this._getSetting(SETTING_KEYS.COMPONENT_SCOPE) ?? {};
    const rawEssenceScope = this._getSetting(SETTING_KEYS.ESSENCE_SCOPE) ?? {};
    const rawToolScope = this._getSetting(SETTING_KEYS.TOOL_SCOPE) ?? {};
    const rawWorldScopeRekeyMap = this._getSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP) ?? {};

    const originalRecipesJson = JSON.stringify(rawRecipes);
    const originalSystemsJson = JSON.stringify(rawSystems);
    const originalGatheringConfigJson = JSON.stringify(rawGatheringConfig);
    const originalEnvironmentsJson = JSON.stringify(rawEnvironments);
    const originalGatheringPartiesJson = JSON.stringify(rawGatheringParties);
    const originalCurrencyConfigJson = JSON.stringify(rawCurrencyConfig);
    const originalTravelConfigJson = JSON.stringify(rawTravelConfig);
    const originalCharacterLibrariesJson = JSON.stringify(rawCharacterLibraries);
    const originalComponentScopeJson = JSON.stringify(rawComponentScope);
    const originalEssenceScopeJson = JSON.stringify(rawEssenceScope);
    const originalToolScopeJson = JSON.stringify(rawToolScope);
    const originalWorldScopeRekeyMapJson = JSON.stringify(rawWorldScopeRekeyMap);

    let data = {
      recipes: rawRecipes,
      systems: rawSystems,
      gatheringConfig: rawGatheringConfig,
      environments: rawEnvironments,
      gatheringParties: rawGatheringParties,
      currencyConfig: rawCurrencyConfig,
      travelConfig: rawTravelConfig,
      characterLibraries: rawCharacterLibraries,
      componentScope: rawComponentScope,
      essenceScope: rawEssenceScope,
      toolScope: rawToolScope,
      worldScopeRekeyMap: rawWorldScopeRekeyMap,
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

    // The 1.21.0 placeholder-retirement migration reports, per system, how many formulas
    // were inert for want of the placeholder (their modifiers go live now), how many
    // placed it subtractively (a 2x-scalar sign swing), how many carried it more than
    // once (double-counting collapses to one) and how many were left untouched in a
    // non-additive context. Capture it for the GM notice and strip the transient field so
    // it is never persisted — a migration cannot report through the return value, which
    // the loop above spread-merges into the DATA payload rather than into this summary.
    let retiredCraftingModCounts = [];
    if (Array.isArray(data._retiredCraftingModCounts)) {
      retiredCraftingModCounts = data._retiredCraftingModCounts
        .map((entry) => _normalizeRetiredCraftingModEntry(entry))
        .filter(Boolean);
    }
    delete data._retiredCraftingModCounts;

    // The 1.23.0 modifier-library unification reports, per system, how many gathering
    // entries had to be re-keyed because their id was already taken by a check-modifier
    // entry. Capture it for the GM notice — a re-keyed modifier is a visible rename in the
    // authoring surface, so the GM has to be told which systems it happened in — and strip
    // the transient field so it is never persisted.
    let unifiedModifierCollisions = [];
    if (Array.isArray(data._unifiedModifierCollisions)) {
      unifiedModifierCollisions = data._unifiedModifierCollisions
        .map((entry) => _normalizeModifierCollisionEntry(entry))
        .filter(Boolean);
    }
    delete data._unifiedModifierCollisions;

    // 1.28.0 reports the character-library id collisions where two systems disagreed about what
    // an id MEANS (issue 1308). Identical copies are not reported, so anything here changed a
    // real rule: the reference still resolves, but to the other system's definition, which is
    // invisible on screen and is exactly why the GM has to be told. Captured for the notice and
    // stripped so the transient field is never persisted.
    let characterLibraryCollisions = [];
    if (Array.isArray(data._characterLibraryCollisions)) {
      characterLibraryCollisions = data._characterLibraryCollisions
        .map((entry) => _normalizeCharacterLibraryCollisionEntry(entry))
        .filter(Boolean);
    }
    delete data._characterLibraryCollisions;

    // 1.30.0 reports what the world-scope entity migration did (issue 1363): entities created
    // per type, groups merged, EVERY rename with its two systems, the `(system, entityType)`
    // pairs it REFUSED to re-key, and the references the newly-decidable Valid Id Basis will
    // prune on the next save. Captured for the GM notice and stripped so the transient field is
    // never persisted — the loop above spread-merges a migration's return into the DATA payload
    // rather than into this summary, so a report can only travel this way.
    let worldScopeEntityReport = null;
    if (data._worldScopeEntityReport && typeof data._worldScopeEntityReport === 'object') {
      worldScopeEntityReport = data._worldScopeEntityReport;
    }
    delete data._worldScopeEntityReport;

    const recipesChanged = JSON.stringify(data.recipes) !== originalRecipesJson;
    const systemsChanged = JSON.stringify(data.systems) !== originalSystemsJson;
    const gatheringConfigChanged =
      JSON.stringify(data.gatheringConfig) !== originalGatheringConfigJson;
    const environmentsChanged = JSON.stringify(data.environments) !== originalEnvironmentsJson;
    const gatheringPartiesChanged =
      JSON.stringify(data.gatheringParties) !== originalGatheringPartiesJson;
    const currencyConfigChanged =
      JSON.stringify(data.currencyConfig) !== originalCurrencyConfigJson;
    const travelConfigChanged = JSON.stringify(data.travelConfig) !== originalTravelConfigJson;
    const characterLibrariesChanged =
      JSON.stringify(data.characterLibraries) !== originalCharacterLibrariesJson;
    const componentScopeChanged =
      JSON.stringify(data.componentScope) !== originalComponentScopeJson;
    const essenceScopeChanged = JSON.stringify(data.essenceScope) !== originalEssenceScopeJson;
    const toolScopeChanged = JSON.stringify(data.toolScope) !== originalToolScopeJson;
    const worldScopeRekeyMapChanged =
      JSON.stringify(data.worldScopeRekeyMap) !== originalWorldScopeRekeyMapJson;

    // ---------------------------------------------------------------------------
    // Writeback. The recipe corpus goes FIRST, and the order is pinned rather than
    // incidental (`destructive-changes-and-migrations/spec.md` § Startup Migration Flow).
    //
    // The reason is NOT "so a tear leaves the version un-advanced" — that is true in every
    // ordering, because the version bump is unconditionally last. A tear in the recipes leg
    // abandons the rest rather than continuing, because the 0.6.0 migration writes `toolIds`
    // onto recipes and the tool bodies onto systems: a systems write after a failed recipes
    // write is a dangling reference the re-run cannot reconstruct, since the source fields
    // have already been consumed.
    // ---------------------------------------------------------------------------
    // `worldScopeRekeyMap` is written BEFORE EVERY OTHER LEG, `recipes` included (issue 1363).
    // It is the `1.30.0` pass's DURABLE DECISION RECORD: it carries the old-to-new id pairs, so
    // a tear at ANY later leg leaves a re-run able to finish the rewrite whichever legs landed —
    // in particular the `craftingSystems`-then-`gatheringConfig` tear, where `craftingSystems`
    // no longer holds the old ids and re-deriving the map from it would answer EMPTY.
    //
    // Writing it ahead of `recipes` is strictly safer than the 0.6.0 ordering constraint the
    // recipes-first comment below records, because it touches neither `recipes` nor `systems`,
    // and a rejection here abandons everything under the same `_deferOnWriteFailure`
    // disposition.
    //
    // IT CARRIES ITS OWN CONTAINMENT, and that is not decoration: this leg sits OUTSIDE both
    // shipped try/catch blocks — the recipes leg's own and the big one below — so an escaping
    // rejection would propagate out of `run()` past a caller with no `catch`. The hook
    // dispatcher's try/catch is synchronous, so a rejection out of the module's async `ready`
    // callback fires no error hook and no notification, leaves the readiness promise unsettled
    // and the module with no managers.
    if (worldScopeRekeyMapChanged) {
      try {
        await this._setSetting(SETTING_KEYS.WORLD_SCOPE_REKEY_MAP, data.worldScopeRekeyMap);
      } catch (error) {
        return this._deferOnWriteFailure(error);
      }
    }
    if (recipesChanged) {
      try {
        await this._recipeCorpus.createOrUpdateAll(data.recipes);
      } catch (error) {
        return this._deferOnWriteFailure(error);
      }
    }
    try {
      // ORDER IS LOAD-BEARING: `currencyConfig` is written BEFORE `craftingSystems`.
      //
      // The 1.26.0 migration LIFTS the currency ladder out of the systems and then shrinks each
      // system's block to `{ enabled }`, so systems are the SOURCE and this setting is the
      // DESTINATION. Write the source first and a tear between the two — any rejection below
      // abandons the rest and leaves `migrationVersion` behind — destroys the ladder
      // irrecoverably: the re-run finds systems already shrunk, lifts nothing, and the
      // idempotence guard keeps the still-empty world config. Writing the destination first
      // makes the same tear fully recoverable, because the re-run finds a populated world
      // ladder, keeps it, and re-applies a shrink that is idempotent by construction.
      if (currencyConfigChanged) {
        await this._setSetting(SETTING_KEYS.CURRENCY_CONFIG, data.currencyConfig);
      }
      // `travelConfig` is the SECOND destination written before its source, for the identical
      // reason (issue 1282): 1.27.0 lifts the realm library out of the systems and then strips
      // it, so a tear after the systems write would leave every system shrunk and the world
      // library empty, the re-run would lift nothing, and the idempotence guard would
      // correctly decline to write. The realms, their scene mappings and the reveal mode would
      // be gone with no error and no recoverable copy.
      //
      // `gatheringParties` is NOT ordered against the systems write: its collapse is a
      // transform of parties into themselves and takes nothing from the systems, so a tear
      // either side of it is equally recoverable.
      if (travelConfigChanged) {
        await this._setSetting(SETTING_KEYS.TRAVEL_CONFIG, data.travelConfig);
      }
      // `characterLibraries` is the THIRD destination written before its source (issue 1308),
      // for the identical reason: 1.28.0 lifts both libraries out of the systems and then strips
      // them, so a tear after the systems write would leave every system shrunk and the world
      // setting empty, the re-run would lift nothing, and the idempotence guard would correctly
      // decline to write. Every prerequisite and every modifier in the world would be gone with
      // no error and no recoverable copy.
      if (characterLibrariesChanged) {
        await this._setSetting(SETTING_KEYS.CHARACTER_LIBRARIES, data.characterLibraries);
      }
      // The three world-scope entity settings are the FOURTH, FIFTH and SIXTH destinations
      // written before their source (issue 1363), for the identical reason: `1.30.0` lifts one
      // world entity per group out of the systems and re-keys the systems to match, so a tear
      // after the systems write would leave every system re-keyed and the world roster empty.
      // Unlike the three lifts above, the re-run WOULD still recover — the persisted re-key map
      // is what makes that true — but destination-before-source keeps the recovery cheap and
      // keeps this migration inside the ordering rule the three before it established.
      if (componentScopeChanged) {
        await this._setSetting(SETTING_KEYS.COMPONENT_SCOPE, data.componentScope);
      }
      if (essenceScopeChanged) {
        await this._setSetting(SETTING_KEYS.ESSENCE_SCOPE, data.essenceScope);
      }
      if (toolScopeChanged) {
        await this._setSetting(SETTING_KEYS.TOOL_SCOPE, data.toolScope);
      }
      if (systemsChanged) {
        await this._craftingSystemCorpus.createOrUpdateAll(data.systems);
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
    } catch (error) {
      // The remaining six legs and the version bump share one containment and one
      // disposition: a rejection from any of them would otherwise propagate out of `run()`
      // past a caller with no `catch`, leaving a partial writeback with no GM-facing notice.
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
    };
  }

  /**
   * Abandon the rest of the writeback and report the pass as deferred.
   *
   * `migrationVersion` is deliberately left where it was found, so the next boot re-runs the
   * whole pass. That is safe because every writeback leg is a plain whole-array replace.
   *
   * @param {Error} error
   * @returns {object} the deferred pass summary.
   * @private
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
   * Emit GM-facing recovery guidance to the console after a migration pass aborts.
   *
   * Output (spec § Migration Abort Recovery Guidance):
   *  - a clear abort header scoped to the pass that aborted,
   *  - a recommended downgrade action,
   *  - per-document fix instructions (type, id/name, exact error, required fix),
   *  - macro-oriented remediation hints when present.
   *
   * @param {{ label: string }} migration
   * @param {{ message?: string, documents?: object[] }} error
   * @param {string|null} downgradeTo
   */
  _emitMigrationRecoveryGuidance(migration, error, downgradeTo) {
    // Scoped to THIS PASS. It is not a claim that a failed migration leaves data unchanged: a
    // non-fatal migration error is logged and the pass continues, advancing the version past
    // the failed migration and writing. And it is a claim about STORED data — the migrations
    // transform the session's own setting values in place, so a reload is what discards them.
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
