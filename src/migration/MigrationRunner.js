/**
 * T-013: Startup Schema Migration Framework
 *
 * MigrationRunner runs versioned, idempotent data migrations on startup.
 * Each migration is registered in the MIGRATIONS array with a version and label.
 * The runner reads the last-run version from a persisted setting and only runs
 * migrations newer than that version, in order.
 */

import { DEFINITION_STORAGE_LAYOUTS, SETTING_KEYS } from '../config/settings.js';

import { migrateAlchemyCheckMode } from './migrateAlchemyCheckMode.js';
import { migrateBreakToolsOnFail } from './migrateBreakToolsOnFail.js';
import { migrateCatalystsToTools } from './migrateCatalystsToTools.js';
import { migrateRecipes, migrateCraftingSystems } from './migrateComponentId.js';
import { migrateDefaultOnTimeRequirements } from './migrateDefaultOnTimeRequirements.js';
import { migrateEssencesToIngredientGroups } from './migrateEssencesToIngredientGroups.js';
import { migrateGatheringChecksToSystem } from './migrateGatheringChecksToSystem.js';
import { migrateGatheringConfig } from './migrateGatheringConfig.js';
import { migrateGatheringEconomy } from './migrateGatheringEconomy.js';
import { migrateGatheringLimitationToggles } from './migrateGatheringLimitationToggles.js';
import { migrateInvertRecipeItemLink } from './migrateInvertRecipeItemLink.js';
import { migrateLegacyResolutionModes } from './migrateLegacyResolutionModes.js';
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
import { migrateUnifyGatheringRegions } from './migrateUnifyGatheringRegions.js';
import { migrateUnifyModifierLibraries } from './migrateUnifyModifierLibraries.js';
import { migrateVisibilityModeEnum } from './migrateVisibilityModeEnum.js';
import { isFatalMigrationError } from './migrationErrors.js';
import { selectDowngradeAdvice } from './migrationRecoveryPrompt.js';

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
 * fact — the corpus could not be read, could not be written, or is mid-conversion — and its
 * remedy is a reload rather than a document fix, so it gets its own GM notice.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const MIGRATION_DEFERRAL_REASONS = Object.freeze({
  /** The recipe corpus is spread across both arrangements and neither can be read alone. */
  UNSETTLED_STORAGE: 'unsettledStorage',
  /** The recipe corpus could not be read. Distinct from an EMPTY corpus, deliberately. */
  CORPUS_READ_FAILED: 'corpusReadFailed',
  /** A writeback leg failed, so the remaining legs and the version bump were abandoned. */
  WRITEBACK_FAILED: 'writebackFailed',
});

/**
 * The summary shape a pass returns when it persisted nothing.
 *
 * Written once rather than as a fourth copy of the same eleven-key literal: the early
 * return, the abort and the three deferrals all describe "this pass wrote nothing", and four
 * hand-maintained copies drift the moment a summary key is added.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function emptyPassSummary(overrides = {}) {
  return {
    ran: 0,
    aborted: false,
    // Issue 1211. Defaults to "this pass persisted nothing", which is correct for the early
    // return, the abort and the two deferrals that never reach the writeback. The writeback's
    // own deferral overrides it, because the granular leg can partially commit.
    persistedCorpusKey: false,
    migratedCatalystCount: 0,
    unifiedRegionSystems: [],
    removedResultSelectionProviders: {
      droppedRollTableRecipes: [],
      strippedGatheringTasks: [],
    },
    essenceCollisionDisabledRecipes: [],
    retiredCraftingModCounts: [],
    unifiedModifierCollisions: [],
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
   *   recipeCorpus?: { layout: Function, loadAll: Function, createOrUpdateAll: Function },
   *   migrations?: Array<{ version: string, label: string, migrate: Function, downgradeTo?: string, downgradeLosesData?: boolean }>
   * }} opts
   *   `promptRecovery` is an optional seam invoked with the abort context so the
   *   caller can present a GM decision prompt; `migrations` overrides the default
   *   registry (used by tests to inject a fatal migration) and defaults to the
   *   production `MIGRATIONS`.
   *
   *   `recipeCorpus` is the ARRANGEMENT-AWARE recipe corpus accessor (issue 1242).
   *   `src/systems/recipeCorpus.js` builds the real one and `main.js` wires it; it is
   *   injected rather than imported so this module keeps importing nothing but
   *   `../config/settings.js` and its own directory, and so the several dozen fixtures that
   *   construct a runner keep working untouched. Its DEFAULT is the legacy whole-array
   *   accessor below, which is byte-for-byte the read and write this runner performed before
   *   the seam existed — deliberately unguarded, matching the shipped convention that an
   *   injected repository gets the no-op arrangement guard.
   */
  constructor({
    getSetting,
    setSetting,
    moduleVersion,
    promptRecovery,
    recipeCorpus,
    migrations,
  } = {}) {
    this._getSetting = getSetting;
    this._setSetting = setSetting;
    this._moduleVersion = moduleVersion;
    this._promptRecovery = promptRecovery;
    this._migrations = Array.isArray(migrations) ? migrations : MIGRATIONS;
    this._recipeCorpus = recipeCorpus ?? {
      layout: () => null,
      loadAll: async () => this._getSetting(SETTING_KEYS.RECIPES) ?? [],
      createOrUpdateAll: async (records) => {
        await this._setSetting(SETTING_KEYS.RECIPES, records);
      },
    };
  }

  /**
   * Run all pending migrations in order.
   * Only persists data when changes are detected.
   * Updates migrationVersion to the highest migration version that ran.
   *
   * @returns {Promise<{ ran: number, aborted: boolean, persistedCorpusKey: boolean, migratedCatalystCount: number, unifiedRegionSystems: string[], removedResultSelectionProviders: { droppedRollTableRecipes: object[], strippedGatheringTasks: object[] }, abortedMigration?: string, downgradeTo?: string|null, failures?: object[] }>}
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

    // Read the LAYOUT only now — after the early return above. An up-to-date world therefore
    // still performs zero corpus reads and zero layout reads, which is the property the
    // startup-performance programme cares about.
    const storageLayout = this._recipeCorpus.layout?.() ?? null;
    if (storageLayout === DEFINITION_STORAGE_LAYOUTS.UNSETTLED) {
      // Refuse the pass outright. The corpus is spread across both arrangements, so either
      // arm would reduce over a PARTIAL corpus — and a partial corpus is the worst input to a
      // corpus-global reduction, not a skipped one. Worse, a pass that wrote and bumped the
      // version here would then have its records overwritten by the storage reconcile that
      // runs later in the same boot, resuming the conversion from the still-present legacy
      // array, with the version claiming success and no detector anywhere. Refusing costs one
      // boot: the reconcile settles the layout on this same boot and the next boot re-runs
      // the whole pass over a whole corpus from an un-advanced version.
      console.error(
        'Fabricate | Migrations deferred: this world is part-way through a recipe storage conversion, so the recipe corpus cannot be read whole. Nothing was migrated and nothing was saved.'
      );
      return emptyPassSummary({
        deferred: true,
        deferredReason: MIGRATION_DEFERRAL_REASONS.UNSETTLED_STORAGE,
        deferredError: null,
        storageLayout,
      });
    }

    let rawRecipes;
    try {
      // Contained, because the granular arm adds throw sites a whole-array setting read does
      // not have: an unparseable record document, an unavailable document class, a collection
      // this client cannot resolve. An escaping rejection is INVISIBLE — the hook
      // dispatcher's try/catch is synchronous, so a rejection out of the module's async
      // `ready` callback fires no error hook and no notification, leaves the readiness promise
      // unsettled and the module with no managers.
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
        storageLayout,
      });
    }
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

          // The layout the pass RESOLVED, not a fresh read. The GM's message has to describe
          // the pass that just failed, and a re-read at guidance time can report a layout a
          // remote conversion moved mid-pass.
          this._emitMigrationRecoveryGuidance(migration, error, downgradeTo, storageLayout);

          // Optional GM decision-prompt seam (defaults to "Keep existing data").
          this._promptRecovery?.({
            downgradeTo,
            documents: failures,
            label: migration.label,
            storageLayout,
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

    const recipesChanged = JSON.stringify(data.recipes) !== originalRecipesJson;
    const systemsChanged = JSON.stringify(data.systems) !== originalSystemsJson;
    const gatheringConfigChanged =
      JSON.stringify(data.gatheringConfig) !== originalGatheringConfigJson;
    const environmentsChanged = JSON.stringify(data.environments) !== originalEnvironmentsJson;
    const gatheringPartiesChanged =
      JSON.stringify(data.gatheringParties) !== originalGatheringPartiesJson;

    // Issue 1211: whether this pass ISSUED a write to any corpus key. A later step of the
    // same boot decides its own legality from it — a Storage Layout Conversion must not run
    // in a boot whose migration pass persisted a corpus key, because two clients' passes are
    // not byte-reproducible over the same source, so a conversion whose source read
    // interleaves with the other client's write converts a state no single pass produced.
    //
    // It reports writes ISSUED, not the pass completing, and that distinction is the whole
    // value: a leg that was issued and then threw may have PARTIALLY committed under the
    // granular arrangement, which is exactly the byte-divergent input the conversion must not
    // consume. Deriving it from `ran` instead would report the migrations executed rather than
    // the writes issued, and would be wrong on every pass that transformed nothing.
    const persistedCorpusKey =
      recipesChanged ||
      systemsChanged ||
      gatheringConfigChanged ||
      environmentsChanged ||
      gatheringPartiesChanged;

    // ---------------------------------------------------------------------------
    // Writeback. The recipe corpus goes FIRST, and the order is pinned rather than
    // incidental (`destructive-changes-and-migrations/spec.md` § Startup Migration Flow).
    //
    // The reason is NOT "so a tear leaves the version un-advanced" — that is true in every
    // ordering, because the version bump is unconditionally last. It is that under a granular
    // arrangement the recipe corpus is the ONLY leg that can PARTIALLY commit: it is up to two
    // document calls where every other leg is one atomic whole-array write. Issuing it first
    // minimises the set of cross-setting states a tear can produce.
    //
    // A tear in that leg therefore abandons the rest rather than continuing. The 0.6.0
    // migration writes `toolIds` onto recipes and the tool bodies onto systems, so a systems
    // write after a failed recipes write is a dangling reference the re-run cannot
    // reconstruct: the source fields have already been consumed.
    // ---------------------------------------------------------------------------
    if (recipesChanged) {
      try {
        await this._recipeCorpus.createOrUpdateAll(data.recipes);
      } catch (error) {
        return this._deferOnWriteFailure(error, storageLayout, persistedCorpusKey);
      }
    }
    try {
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
    } catch (error) {
      // The remaining four legs and the version bump share one containment and one
      // disposition. This is a deliberate extension of the seam's own scope: a rejection from
      // any of these already propagates out of `run()` past a caller with no `catch`, which is
      // a partial writeback reachable with no conversion involved at all.
      return this._deferOnWriteFailure(error, storageLayout, persistedCorpusKey);
    }

    console.log(`Fabricate | Migrations complete: ran ${pending.length} migration(s)`);

    return {
      ran: pending.length,
      aborted: false,
      persistedCorpusKey,
      migratedCatalystCount,
      unifiedRegionSystems,
      removedResultSelectionProviders,
      essenceCollisionDisabledRecipes,
      retiredCraftingModCounts,
      unifiedModifierCollisions,
    };
  }

  /**
   * Abandon the rest of the writeback and report the pass as deferred.
   *
   * `migrationVersion` is deliberately left where it was found, so the next boot re-runs the
   * whole pass. That is safe because the granular writeback is convergent — record document
   * ids are derived from record keys and a create with a kept id is an idempotent upsert —
   * and because every whole-array leg is a plain replace.
   *
   * @param {Error} error
   * @param {string|null} storageLayout
   * @returns {object} the deferred pass summary.
   * @private
   */
  _deferOnWriteFailure(error, storageLayout, persistedCorpusKey = false) {
    console.error(
      'Fabricate | Migrations deferred: a migrated setting could not be saved, so the remaining writes and the version bump were abandoned. Nothing was marked as migrated.',
      error
    );
    return emptyPassSummary({
      deferred: true,
      deferredReason: MIGRATION_DEFERRAL_REASONS.WRITEBACK_FAILED,
      deferredError: error,
      persistedCorpusKey,
      storageLayout,
    });
  }

  /**
   * Emit GM-facing recovery guidance to the console after a migration pass aborts.
   *
   * Output (spec § Migration Abort Recovery Guidance):
   *  - a clear abort header scoped to the pass that aborted,
   *  - a recommended downgrade action, selected by the recipe storage layout,
   *  - per-document fix instructions (type, id/name, exact error, required fix),
   *  - macro-oriented remediation hints when present.
   *
   * @param {{ label: string }} migration
   * @param {{ message?: string, documents?: object[] }} error
   * @param {string|null} downgradeTo
   * @param {string|null} [storageLayout] The recipe Definition Storage Layout this pass ran
   *   against, resolved once by `run()`. It selects the downgrade advice, because
   *   "downgrade to keep using your existing data" is FALSE on a granularly-stored world.
   */
  _emitMigrationRecoveryGuidance(migration, error, downgradeTo, storageLayout = null) {
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
    // One complete sentence per layout, from the single table the GM dialog also selects from,
    // and never a sentence with a layout token interpolated into it.
    console.error(
      `Fabricate | Recommended action: ${selectDowngradeAdvice(storageLayout).consoleSentence(downgradeTarget)}`
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
