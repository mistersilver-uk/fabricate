/**
 * Runs versioned, idempotent startup data migrations from the ordered `MIGRATIONS` registry,
 * only those newer than the persisted `migrationVersion`.
 * `destructive-changes-and-migrations/spec.md` § Migration Policy owns the registry contract, the
 * startup flow, the writeback order, per-migration error handling and the abort guidance.
 */

import { SETTING_KEYS } from '../config/settings.js';

import { mergeEquivalentWorldEssences } from './mergeEquivalentWorldEssences.js';
import { migrateAlchemyCheckMode } from './migrateAlchemyCheckMode.js';
import { migrateBreakToolsOnFail } from './migrateBreakToolsOnFail.js';
import { migrateCatalystsToTools } from './migrateCatalystsToTools.js';
import { migrateCharacterLibrariesToWorldScope } from './migrateCharacterLibrariesToWorldScope.js';
import { migrateComponentEssenceSections } from './migrateComponentEssenceSections.js';
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
import { migrateSubjectModifierMarks } from './migrateSubjectModifierMarks.js';
import { migrateSystemCheckModifierCatalogue } from './migrateSystemCheckModifierCatalogue.js';
import { migrateToolRequirementSections } from './migrateToolRequirementSections.js';
import { migrateToolsToFirstClass } from './migrateToolsToFirstClass.js';
import { migrateToolsToSystem } from './migrateToolsToSystem.js';
import { migrateTravelToWorldScope } from './migrateTravelToWorldScope.js';
import { migrateUnifyGatheringRegions } from './migrateUnifyGatheringRegions.js';
import { migrateUnifyModifierLibraries } from './migrateUnifyModifierLibraries.js';
import { migrateVisibilityModeEnum } from './migrateVisibilityModeEnum.js';
import { migrateWorldScopeEntities } from './migrateWorldScopeEntities.js';
import { isFatalMigrationError } from './migrationErrors.js';
import { DOWNGRADE_ADVICE } from './migrationRecoveryPrompt.js';
import { WRITEBACK_LEGS } from './migrationWritebackLegs.js';

export { FatalMigrationError, isFatalMigrationError } from './migrationErrors.js';

/** The two corpus legs are read one at a time, each with its own containment and GM sentence. */
const LEG_BY_KEY = new Map(WRITEBACK_LEGS.map((leg) => [leg.key, leg]));

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
      // `_migratedCatalystCount` is transient: consumed by the runner for a GM notice, never
      // persisted as a setting.
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
    // Runs after 0.2.0 so it sees the per-system region vocab that migration preserves.
    // Reports through the transient `_unifiedRegionSystems` field.
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
    // Must run strictly after 1.0.0, which still reads the pre-rename `gatheringRegions` key for
    // its per-region modifier rewrite.
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
      // Reports dropped roll-table recipes and steps plus stripped gathering tasks through the
      // transient `_removedResultSelectionProviders` field.
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
      // Reads and returns `{ recipes }`: ingredient sets live under the recipes setting, and
      // `data.systems` is read-only here for alchemy components. Reports the collision-disabled
      // recipe names through the transient `_essenceCollisionDisabledRecipes` field.
      const { recipes, _essenceCollisionDisabledRecipes } = migrateEssencesToIngredientGroups(data);
      return { recipes, _essenceCollisionDisabledRecipes };
    },
  },
  {
    version: '1.18.0',
    label:
      'Strip the retired system-level progressive allowPlayerReorder from the crafting, ' +
      'salvage and gathering checks (the reorder permission now lives on the recipe and on salvage)',
    // The last release before the flag was retired: a world downgraded to it still finds its own
    // schema, since this only removes a key that release ignored.
    downgradeTo: '1.17.0',
    migrate: (data) => migrateRetireProgressiveAllowPlayerReorder(data.systems),
  },
  {
    version: '1.19.0',
    label:
      'Default-on the recipe time requirement for upgraded worlds: delete a persisted ' +
      'requirements.time.enabled === false (the pre-toggle normalizer coercion of an absent ' +
      'flag), so the new default-on reader keeps existing timed recipes running',
    // The last release before the toggle: the pre-714 normalizer re-coerces the deleted flag back
    // to `false` there, so the downgrade is lossless.
    downgradeTo: '1.18.0',
    migrate: (data) => migrateDefaultOnTimeRequirements(data.systems),
  },
  {
    version: '1.20.0',
    label:
      'Cap the modifier picks of systems already on the playerPicks combination rule at ' +
      'craftingCheck.maxModifierPicks = 1, the single pick that rule always meant, so the ' +
      'new generalized cap does not silently widen them to unlimited',
    // The last release before the cap existed: it drops the unknown `maxModifierPicks` key through
    // `_normalizeCheckModifierConfig`'s allowlist, and its `playerPicks` already means "pick one"
    // — exactly what the dropped cap encoded — so the downgrade is lossless.
    downgradeTo: '1.19.0',
    // Returns `{ recipes, systems }` with `recipes` unchanged, so the recipe-level no-op is explicit.
    migrate: (data) => migrateMaxModifierPicks(data),
  },
  {
    version: '1.21.0',
    label:
      'Retire the check-modifier roll-formula placeholder: strip it from every stored ' +
      'crafting, salvage and gathering check formula, because the resolved modifier ' +
      'scalar is now appended automatically as a flavoured term',
    // DATA-lossless but BEHAVIOUR-lossy, so deliberately NOT described as landing on that release's
    // own schema. A world downgraded to 1.20.0 finds its formulas and catalogue intact, but that
    // build resolves check modifiers ONLY through the placeholder it now lacks, so they stop
    // contributing to any roll until a GM retypes it into each formula by hand.
    downgradeTo: '1.20.0',
    // Reports per-system counts through the transient `_retiredCraftingModCounts` field.
    migrate: (data) => migrateRetireCraftingModToken(data),
  },
  {
    version: '1.22.0',
    // THE LOSSY-DOWNGRADE FACT IS IN THE LABEL, NOT IN A COMMENT. The label is the only string a GM
    // ever reads about this migration — `migrationRecoveryPrompt` renders it beside the
    // Keep/Downgrade buttons — and that is precisely the choice the warning is about.
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
    // MACHINE-READABLE, so the label clause above is a RULE rather than one entry's prose: a
    // migration marked here must name the loss in its own `label`, and
    // `tests/migration-runner.test.js` enforces that over the whole registry. `1.21.0` is
    // deliberately NOT marked — DATA-lossless and BEHAVIOUR-lossy is a different fact.
    downgradeLosesData: true,
    migrate: (data) => migrateSystemCheckModifierCatalogue(data),
  },
  {
    version: '1.23.0',
    // THE LOSSY-DOWNGRADE FACT IS IN THE LABEL, for the reason `1.22.0` states.
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
    // MACHINE-READABLE, per the rule `1.22.0` established.
    downgradeLosesData: true,
    // Reports per-system id-collision counts through the transient `_unifiedModifierCollisions`.
    migrate: (data) => migrateUnifyModifierLibraries(data),
  },
  {
    version: '1.24.0',
    // THE LOSSY-DOWNGRADE FACT IS IN THE LABEL, per the rule 1.22.0 established.
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
    // MACHINE-READABLE, per the rule 1.22.0 established.
    downgradeLosesData: true,
    // A DELIBERATE NO-OP, in 1.20.0's recipe-level shape: absence already reads as `static`, and
    // writing the default onto every stored routed slot would touch every system to change nothing.
    // What this entry buys is the boundary the recovery prompt warns at.
    migrate: (data) => data,
  },
  {
    version: '1.25.0',
    // NO LOSSY-DOWNGRADE CLAUSE, and that is the fact worth stating: this downgrade IS clean. The
    // rule 1.22.0 to 1.24.0 established is about naming a REAL loss, not about every entry claiming
    // one.
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
    // Reports nothing, so it adds no key to the runner's three return literals below.
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
      'category, tags, effect source, macro, breakage, on-break, prerequisites, check bonus ' +
      'and repair recipe it had, and ' +
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
    // DELIBERATELY NOT MARKED `downgradeLosesData`, and CHECKED rather than copied (issue 1363):
    // both candidate losses fail the registry's test, and the `toolSpecific` re-minting is
    // DATA-lossless and BEHAVIOUR-relevant — `1.21.0`'s fact — so it is a label caveat rather than a
    // data-loss claim. `tests/world-scope-migration-runner.test.js` holds both arms executable.
    downgradeLosesData: false,
    // Reports entities created, groups merged, every rename, refusals, the references that ALREADY
    // resolve to nothing (reported, never pruned — requirement 18) and the world-default sections a
    // constraint declined, through the transient `_worldScopeEntityReport` field.
    migrate: (data) => migrateWorldScopeEntities(data),
  },
  {
    version: '1.31.0',
    label:
      "Record each crafting system's own Tool prerequisites and check bonus as its own, now that " +
      'both are world defaults a system can inherit. Every Tool in every system keeps exactly ' +
      'the prerequisites and the check bonus it had, written down as that system’s override so ' +
      'nothing changes; no world default is created, because a Tool that requires nothing and ' +
      'one nobody ever configured are stored identically and guessing between them would put ' +
      'words in your mouth. Author the world defaults yourself on the Tools Catalogue when you ' +
      'want systems to share them. DOWNGRADING IS LOSSLESS: 1.30.0 reads a Tool’s ' +
      'prerequisites and bonus from the crafting system exactly as before and ignores the ' +
      'overrides this pass wrote, which survive untouched for a re-upgrade',
    downgradeTo: '1.30.0',
    // DATA-lossless in both directions: the pass only ADDS membership-record keys, and 1.30.0's
    // `TOOL_SECTIONS` does not name them, so `normalizeMembership` drops them on read there and the
    // crafting system's own values keep deciding.
    downgradeLosesData: false,
    migrate: (data) => migrateToolRequirementSections(data),
  },
  {
    version: '1.32.0',
    label:
      'Give every component ONE set of world essence values, shared by the crafting systems ' +
      'that use it. Each world component now carries the essence values it has in the oldest ' +
      'system holding rules for it, and every system whose own values already match is marked ' +
      'as inheriting them, so an edit on the Component Catalogue reaches those systems at once; ' +
      'a system whose values differ keeps its own as its override and is untouched until you ' +
      'choose otherwise in its rules editor. NO SYSTEM CHANGES BEHAVIOUR: a system marked as ' +
      'inheriting already had exactly the world values, and a system that did not keeps what ' +
      'it had. A component with no essence values anywhere gets no world values until you ' +
      'author them. DOWNGRADING IS NOT LOSSLESS: 1.31.0 reads each system’s own essence values ' +
      'and ignores the world values, so any world values you edit after this migration stop ' +
      'reaching the systems that inherit them, and the world values themselves are dropped from ' +
      'the setting on the first world-scope save there',
    downgradeTo: '1.31.0',
    // The elected map is a COPY and its loss costs nothing, but a world map a GM EDITS after this
    // pass is authored data 1.31.0's `COMPONENT_SECTIONS` does not name: `normalizeWorldDefaults`
    // drops the key on read, the next `save()` drops it from the setting, and the inheriting systems
    // still hold the pre-edit values. That is data loss, and the label says so beside the button.
    downgradeLosesData: true,
    migrate: (data) => migrateComponentEssenceSections(data),
  },
  {
    version: '1.33.0',
    label:
      'Keep every check modifier your recipes, components and gathering tasks already pick. ' +
      'Under the "each subject picks its own" rule, the check now MARKS which modifiers a ' +
      'subject may choose from — the Selectable switches on the Checks tab — and a pick the ' +
      'check does not mark no longer rolls. A check where nothing was ever marked would ' +
      'therefore have stopped applying every pick in your world at once, so each one is ' +
      'marked with exactly the modifiers its own subjects already pick, and every record ' +
      'that was inheriting that empty mark is given an explicit pick of no modifiers — ' +
      'which is what it was already rolling, because an empty mark was all it had to ' +
      'inherit. NO ROLL CHANGES: every record contributes exactly what it contributed ' +
      'before, and the Checks tab now shows the modifiers your subjects actually use as ' +
      'Selectable rather than showing none of them. The records that gained an explicit ' +
      'pick read "No modifiers" where they read "Inherit system default" before; both add ' +
      'nothing. Checks on the other three rules are untouched, and a check where you HAD ' +
      'marked something is left exactly as you set it. DOWNGRADING IS LOSSLESS: 1.32.0 ' +
      'reads a subject’s own picks whatever the check marks, and reads an explicit pick ' +
      'of no modifiers exactly as this release does, so nothing changes in that direction ' +
      'either',
    downgradeTo: '1.32.0',
    // Nothing is removed in either direction: the pass only ADDS ids to a mark and an empty pick to
    // a record that had none. `1.32.0` reads the mark as a plain default rather than a bound, so a
    // subject with its own picks rolls them there exactly as before, and one carrying the authored
    // `[]` resolves to no eligible modifier — what it resolved to under the mark it used to inherit.
    downgradeLosesData: false,
    migrate: (data) => migrateSubjectModifierMarks(data),
  },
  {
    version: '1.34.0',
    label:
      'Give the world ONE record per essence BEHAVIOUR, instead of one per crafting system. ' +
      "Until now the world's essence list held a separate record for every system's copy of the " +
      'same essence — three systems with Iron gave you three Iron essences — because the world ' +
      'scope migration matched essences by id, and an essence id is minted separately inside ' +
      'each system rather than shared between them. World essences whose name, property macro ' +
      'and active-effect source all match are now ONE essence, and every reference to the ones ' +
      'retired is rewritten across your recipes, components, crafting systems and gathering ' +
      'config in the same pass. Every essence that merged is listed for you by name with the ' +
      'systems it came from. NO SYSTEM CHANGES BEHAVIOUR: each system keeps its own effect ' +
      'source, property macro and enabled switch — written down as its own override wherever it ' +
      'was relying on the world record it is leaving — and two component essence values that ' +
      'land on the same essence are ADDED together rather than one replacing the other. Each ' +
      'system also keeps the name, icon, colour and description it gave its own copy, so the ' +
      'catalogue may now report that your systems DISAGREE about how one essence looks; that ' +
      'report is accurate, it is what your systems really say, and it is not an error. Where a ' +
      'merge could not be made safely — two equivalent essences inside ONE system, or an effect ' +
      'source this pass cannot prove names the same component — the whole group is REFUSED and ' +
      'reported rather than merged on a guess: nothing is changed for those essences and you can ' +
      'still merge them yourself. THE MERGE IS IRREVERSIBLE: a retired essence record is deleted ' +
      'with its name, icon, colour and description, its id is never handed out again, and no ' +
      'downgrade brings it back. DOWNGRADING IS LOSSLESS FOR DATA even so: 1.33.0 reads every ' +
      'setting this pass touched with unchanged rules and the new merge record survives ' +
      'untouched for a re-upgrade, so going back costs you nothing further — it simply does not ' +
      'undo the merge',
    downgradeTo: '1.33.0',
    // Deliberately not marked `downgradeLosesData` (issue 1654, requirement 15): the loss happens at
    // migration time, not on the downgrade. The label still carries the irreversibility caveat.
    downgradeLosesData: false,
    // Reports four legs through the transient `_worldEssenceMergeReport` field: groups merged,
    // groups refused with reasons, world essences whose members disagreed, and ones no system holds.
    migrate: (data) => mergeEquivalentWorldEssences(data),
  },
  // Future migrations added here in version order
];

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
      raw.recipes = await LEG_BY_KEY.get('recipes').read(io);
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
      raw.systems = await LEG_BY_KEY.get('systems').read(io);
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
      if (leg.key in raw) continue;
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
