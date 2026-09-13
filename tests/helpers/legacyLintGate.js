/**
 * THE GATE AS IT STOOD BEFORE THE GLOB, FROZEN (issue #1660).
 *
 * `npm run lint` and `npm run format:check` used to name every file they covered. That list is
 * gone — both are globs now — so this is the only record of what the gate actually reached, and
 * `tests/lint-coverage.test.js` uses it to prove the new configuration is a SUPERSET rather than
 * a differently-shaped hole.
 *
 * WHY THE ARGV IS FROZEN HERE AND NOT READ FROM `package.json`
 * -----------------------------------------------------------
 * It cannot be read from `package.json` any more; that is the whole change. And a fixture derived
 * from the NEW configuration would prove nothing at all — it would assert that the new gate covers
 * what the new gate covers. So the argv below is a verbatim copy of the two scripts as they stood
 * at the commit this landed on, and `LEGACY_GATE_FILES` is what that argv actually selected when
 * it was run there.
 *
 * The pair is self-verifying rather than trusted: `deriveLegacyGateFiles()` expands the frozen
 * argv against the working tree, and the test asserts it still yields exactly `LEGACY_GATE_FILES`.
 * A file the legacy gate named that has since been deleted therefore fails HERE, loudly, instead
 * of quietly shrinking the set the superset assertion is measured against.
 *
 * DO NOT UPDATE THIS FILE TO MAKE A TEST PASS. It is a historical record; the only legitimate edit
 * is removing an entry whose file genuinely no longer exists, in the same commit that deletes it.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { byCodePoint } from './ratchetBaseline.js';

const REPOSITORY_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `package.json`'s `lint` script, verbatim, immediately before it became `eslint .`. */
export const LEGACY_LINT_ARGV =
  "eslint \"src/{models,utils,integrations,config,migration,canvas,systems}/**/*.js\" src/toolBreakageRuntime.js scripts/lib/semver.js scripts/lib/releaseTags.js scripts/lib/publishGuard.js scripts/lib/promoteGuards.js scripts/lib/hotfixPreflight.js scripts/lib/forwardPortProvenance.js scripts/lib/foundrySmokeSignal.js scripts/lib/managerLayoutGuards.js scripts/lib/managerRailEntries.js scripts/lib/screenshotCaptureMap.js scripts/lib/foundryCanvasReadiness.js scripts/lib/foundryRunIdentity.js scripts/lib/foundryRunBudget.js scripts/lib/foundryTourSuppression.js scripts/lib/agentModelTiers.js scripts/lib/foundryDataPreparation.js scripts/lib/worldScopeIdentitySmoke.js scripts/lib/smokeSectionFixture.js scripts/lib/svelteComponentFiles.js scripts/lib/svelteCompilerWarnings.js scripts/release-s3.js scripts/validate-release-tag.mjs scripts/hotfix-preflight.mjs scripts/forward-port-provenance.mjs scripts/compare-svelte-render.mjs scripts/check-svelte-warnings.mjs scripts/lib/zipRead.js scripts/lib/foundryImagePin.js scripts/lib/foundryChromeCache.js scripts/lib/foundryChromeSpec.js scripts/lib/designSystemPrimitives.js scripts/lib/componentImporters.js scripts/lib/viewLabCases.js scripts/lib/viewLabLayoutAssertion.js scripts/view-lab-chrome.mjs scripts/view-lab-screenshots.mjs scripts/lib/viewLabIndex.js scripts/view-lab-index.mjs scripts/lib/foundrySmokeArms.js scripts/lib/foundryBrowserBoot.js scripts/foundry-version-assert.mjs scripts/visual-parity/extract.mjs scripts/visual-parity/compare.mjs scripts/visual-parity/inventory.mjs scripts/visual-parity/lib/page-runtime.js scripts/visual-parity/lib/schema.js scripts/visual-parity/lib/inventory.js scripts/visual-parity/lib/subject.js scripts/lib/resolveExecutable.js scripts/lib/benchmarkBaselines.js scripts/lib/benchmarkEnvelope.js scripts/lib/benchmarkStats.js scripts/lib/benchmarkRunner.js scripts/benchmark-performance.mjs scripts/benchmark-compare.mjs scripts/lib/foundryPerfMeasurements.js scripts/lib/foundryPerfSeed.js scripts/lib/foundryPerfPreflight.js scripts/lib/foundryPerfRecord.js scripts/lib/foundryPerfCapture.js scripts/lib/foundryPerfScenarios.js scripts/foundry-perf-run.mjs scripts/visual-parity/lib/view-lab.js scripts/lib/screenshotEvidenceMatching.js scripts/lib/fontAwesomeBundle.js scripts/lib/fontAwesomeCompatibility.js scripts/lib/fontAwesomeSmokeExpectations.js scripts/lib/iconLicensing.js scripts/foundry-icon-bundle-assert.mjs scripts/generate-icon-catalogue.mjs scripts/lib/docsScreenshotMap.js scripts/docs-screenshots.mjs scripts/lib/webpFrames.js scripts/lib/docsScreenshotRun.js scripts/lib/stylesheetLiveClasses.js scripts/lib/stylesheetSelectorCensus.js scripts/stylesheet-selector-census.mjs scripts/lib/releaseZipChunks.js --max-warnings=0";

/** `package.json`'s `format:check` script, verbatim, immediately before it became `prettier --check .`. */
export const LEGACY_FORMAT_ARGV =
  "prettier --check \"src/**/*.svelte\" \"src/{models,utils,integrations,config,migration,canvas,systems}/**/*.js\" src/toolBreakageRuntime.js scripts/lib/semver.js scripts/lib/releaseTags.js scripts/lib/publishGuard.js scripts/lib/promoteGuards.js scripts/lib/hotfixPreflight.js scripts/lib/forwardPortProvenance.js scripts/lib/foundrySmokeSignal.js scripts/lib/managerLayoutGuards.js scripts/lib/managerRailEntries.js scripts/lib/screenshotCaptureMap.js scripts/lib/foundryCanvasReadiness.js scripts/lib/foundryRunIdentity.js scripts/lib/foundryRunBudget.js scripts/lib/foundryTourSuppression.js scripts/lib/agentModelTiers.js scripts/lib/foundryDataPreparation.js scripts/lib/worldScopeIdentitySmoke.js scripts/lib/smokeSectionFixture.js scripts/lib/svelteComponentFiles.js scripts/lib/svelteCompilerWarnings.js scripts/release-s3.js scripts/validate-release-tag.mjs scripts/hotfix-preflight.mjs scripts/forward-port-provenance.mjs scripts/compare-svelte-render.mjs scripts/check-svelte-warnings.mjs scripts/lib/zipRead.js scripts/lib/foundryImagePin.js scripts/lib/foundryChromeCache.js scripts/lib/foundryChromeSpec.js scripts/lib/designSystemPrimitives.js scripts/lib/componentImporters.js scripts/lib/viewLabCases.js scripts/lib/viewLabLayoutAssertion.js scripts/view-lab-chrome.mjs scripts/view-lab-screenshots.mjs scripts/lib/viewLabIndex.js scripts/view-lab-index.mjs scripts/lib/foundrySmokeArms.js scripts/lib/foundryBrowserBoot.js scripts/foundry-version-assert.mjs scripts/visual-parity/extract.mjs scripts/visual-parity/compare.mjs scripts/visual-parity/inventory.mjs scripts/visual-parity/lib/page-runtime.js scripts/visual-parity/lib/schema.js scripts/visual-parity/lib/inventory.js scripts/visual-parity/lib/subject.js scripts/lib/resolveExecutable.js scripts/lib/benchmarkBaselines.js scripts/lib/benchmarkEnvelope.js scripts/lib/benchmarkStats.js scripts/lib/benchmarkRunner.js scripts/benchmark-performance.mjs scripts/benchmark-compare.mjs scripts/lib/foundryPerfMeasurements.js scripts/lib/foundryPerfSeed.js scripts/lib/foundryPerfPreflight.js scripts/lib/foundryPerfRecord.js scripts/lib/foundryPerfCapture.js scripts/lib/foundryPerfScenarios.js scripts/foundry-perf-run.mjs scripts/visual-parity/lib/view-lab.js scripts/lib/screenshotEvidenceMatching.js scripts/lib/fontAwesomeBundle.js scripts/lib/fontAwesomeCompatibility.js scripts/lib/fontAwesomeSmokeExpectations.js scripts/lib/iconLicensing.js scripts/foundry-icon-bundle-assert.mjs scripts/generate-icon-catalogue.mjs scripts/lib/docsScreenshotMap.js scripts/docs-screenshots.mjs scripts/lib/webpFrames.js scripts/lib/docsScreenshotRun.js scripts/lib/stylesheetLiveClasses.js scripts/lib/stylesheetSelectorCensus.js scripts/stylesheet-selector-census.mjs scripts/lib/releaseZipChunks.js eslint.config.js";

/**
 * The 360 files `LEGACY_LINT_ARGV` selected, POSIX, sorted.
 *
 * Captured by running that exact command with `--format json` and reading back the `filePath` of
 * every result — ESLint's own answer to "what did you lint", not a re-implementation of its glob
 * handling.
 */
export const LEGACY_GATE_FILES = [
  'scripts/benchmark-compare.mjs',
  'scripts/benchmark-performance.mjs',
  'scripts/check-svelte-warnings.mjs',
  'scripts/compare-svelte-render.mjs',
  'scripts/docs-screenshots.mjs',
  'scripts/forward-port-provenance.mjs',
  'scripts/foundry-icon-bundle-assert.mjs',
  'scripts/foundry-perf-run.mjs',
  'scripts/foundry-version-assert.mjs',
  'scripts/generate-icon-catalogue.mjs',
  'scripts/hotfix-preflight.mjs',
  'scripts/lib/agentModelTiers.js',
  'scripts/lib/benchmarkBaselines.js',
  'scripts/lib/benchmarkEnvelope.js',
  'scripts/lib/benchmarkRunner.js',
  'scripts/lib/benchmarkStats.js',
  'scripts/lib/componentImporters.js',
  'scripts/lib/designSystemPrimitives.js',
  'scripts/lib/docsScreenshotMap.js',
  'scripts/lib/docsScreenshotRun.js',
  'scripts/lib/fontAwesomeBundle.js',
  'scripts/lib/fontAwesomeCompatibility.js',
  'scripts/lib/fontAwesomeSmokeExpectations.js',
  'scripts/lib/forwardPortProvenance.js',
  'scripts/lib/foundryBrowserBoot.js',
  'scripts/lib/foundryCanvasReadiness.js',
  'scripts/lib/foundryChromeCache.js',
  'scripts/lib/foundryChromeSpec.js',
  'scripts/lib/foundryDataPreparation.js',
  'scripts/lib/foundryImagePin.js',
  'scripts/lib/foundryPerfCapture.js',
  'scripts/lib/foundryPerfMeasurements.js',
  'scripts/lib/foundryPerfPreflight.js',
  'scripts/lib/foundryPerfRecord.js',
  'scripts/lib/foundryPerfScenarios.js',
  'scripts/lib/foundryPerfSeed.js',
  'scripts/lib/foundryRunBudget.js',
  'scripts/lib/foundryRunIdentity.js',
  'scripts/lib/foundrySmokeArms.js',
  'scripts/lib/foundrySmokeSignal.js',
  'scripts/lib/foundryTourSuppression.js',
  'scripts/lib/hotfixPreflight.js',
  'scripts/lib/iconLicensing.js',
  'scripts/lib/managerLayoutGuards.js',
  'scripts/lib/managerRailEntries.js',
  'scripts/lib/promoteGuards.js',
  'scripts/lib/publishGuard.js',
  'scripts/lib/releaseTags.js',
  'scripts/lib/releaseZipChunks.js',
  'scripts/lib/resolveExecutable.js',
  'scripts/lib/screenshotCaptureMap.js',
  'scripts/lib/screenshotEvidenceMatching.js',
  'scripts/lib/semver.js',
  'scripts/lib/smokeSectionFixture.js',
  'scripts/lib/stylesheetLiveClasses.js',
  'scripts/lib/stylesheetSelectorCensus.js',
  'scripts/lib/svelteCompilerWarnings.js',
  'scripts/lib/svelteComponentFiles.js',
  'scripts/lib/viewLabCases.js',
  'scripts/lib/viewLabIndex.js',
  'scripts/lib/viewLabLayoutAssertion.js',
  'scripts/lib/webpFrames.js',
  'scripts/lib/worldScopeIdentitySmoke.js',
  'scripts/lib/zipRead.js',
  'scripts/release-s3.js',
  'scripts/stylesheet-selector-census.mjs',
  'scripts/validate-release-tag.mjs',
  'scripts/view-lab-chrome.mjs',
  'scripts/view-lab-index.mjs',
  'scripts/view-lab-screenshots.mjs',
  'scripts/visual-parity/compare.mjs',
  'scripts/visual-parity/extract.mjs',
  'scripts/visual-parity/inventory.mjs',
  'scripts/visual-parity/lib/inventory.js',
  'scripts/visual-parity/lib/page-runtime.js',
  'scripts/visual-parity/lib/schema.js',
  'scripts/visual-parity/lib/subject.js',
  'scripts/visual-parity/lib/view-lab.js',
  'src/canvas/InteractableManager.js',
  'src/canvas/environmentDialog.js',
  'src/canvas/environmentResolution.js',
  'src/canvas/interactableDragPayload.js',
  'src/canvas/interactableItemResolution.js',
  'src/canvas/interactableResolution.js',
  'src/canvas/interactableSocket.js',
  'src/canvas/interactableSocketBridge.js',
  'src/canvas/linkedVisuals/linkedInteractableVisual.js',
  'src/canvas/regionHitTest.js',
  'src/canvas/regions/FabricateInteractableRegionBehavior.js',
  'src/canvas/regions/coercion.js',
  'src/canvas/regions/interactableCleanup.js',
  'src/canvas/regions/interactableConfigActions.js',
  'src/canvas/regions/interactableConfigSheet.js',
  'src/canvas/regions/interactableCreationGuard.js',
  'src/canvas/regions/interactableDeletion.js',
  'src/canvas/regions/interactableMarkerDepletion.js',
  'src/canvas/regions/interactablePromote.js',
  'src/canvas/regions/interactableRegionActivation.js',
  'src/canvas/regions/interactableRegionFlags.js',
  'src/canvas/regions/interactableRegionNodeAdapter.js',
  'src/canvas/regions/interactableSceneScan.js',
  'src/config/characterPrerequisitePresets.js',
  'src/config/currencyPresets.js',
  'src/config/currencyProviders.js',
  'src/config/flags.js',
  'src/config/gatheringCharacterModifierPresets.js',
  'src/config/hooks.js',
  'src/config/modifierExpressionSuggestions.js',
  'src/config/playerCharacterTypes.js',
  'src/config/playerCharacterTypesMenu.js',
  'src/config/preferencesCleanup.js',
  'src/config/repairItemData.js',
  'src/config/settingChangeBridge.js',
  'src/config/settings.js',
  'src/config/settingsMenu.js',
  'src/config/stackQuantityPathPresets.js',
  'src/integrations/ItemPilesIntegration.js',
  'src/migration/MigrationRunner.js',
  'src/migration/mergeEquivalentWorldEssences.js',
  'src/migration/migrateAlchemyCheckMode.js',
  'src/migration/migrateBreakToolsOnFail.js',
  'src/migration/migrateCatalystsToTools.js',
  'src/migration/migrateCharacterLibrariesToWorldScope.js',
  'src/migration/migrateComponentEssenceSections.js',
  'src/migration/migrateComponentId.js',
  'src/migration/migrateCurrencyToWorldScope.js',
  'src/migration/migrateDefaultOnTimeRequirements.js',
  'src/migration/migrateEssencesToIngredientGroups.js',
  'src/migration/migrateExportPayload.js',
  'src/migration/migrateGatheringChecksToSystem.js',
  'src/migration/migrateGatheringConfig.js',
  'src/migration/migrateGatheringEconomy.js',
  'src/migration/migrateGatheringLimitationToggles.js',
  'src/migration/migrateInvertRecipeItemLink.js',
  'src/migration/migrateLegacyResolutionModes.js',
  'src/migration/migrateManualCompositionForces.js',
  'src/migration/migrateMaxModifierPicks.js',
  'src/migration/migrateMoveRoutedByIngredientsCheck.js',
  'src/migration/migrateNodeRespawnIntervals.js',
  'src/migration/migrateNodeRespawnModes.js',
  'src/migration/migrateRecipeForModeChange.js',
  'src/migration/migrateRecipeItemCapsPerItem.js',
  'src/migration/migrateRemoveLegacyCheckSources.js',
  'src/migration/migrateRemoveResultSelectionProviders.js',
  'src/migration/migrateRemoveSystemProvider.js',
  'src/migration/migrateRenameGatheringHazardsToEvents.js',
  'src/migration/migrateRenameGatheringRegionsToRealms.js',
  'src/migration/migrateRenameSourceUuidFields.js',
  'src/migration/migrateRetireCraftingModToken.js',
  'src/migration/migrateRetireProgressiveAllowPlayerReorder.js',
  'src/migration/migrateSeedFailureResultPolicy.js',
  'src/migration/migrateSplitRoutedResolutionModes.js',
  'src/migration/migrateStaminaRegenPolicy.js',
  'src/migration/migrateSubjectModifierMarks.js',
  'src/migration/migrateSystemCheckModifierCatalogue.js',
  'src/migration/migrateToolRequirementSections.js',
  'src/migration/migrateToolsToFirstClass.js',
  'src/migration/migrateToolsToSystem.js',
  'src/migration/migrateTravelToWorldScope.js',
  'src/migration/migrateUnifyGatheringRegions.js',
  'src/migration/migrateUnifyModifierLibraries.js',
  'src/migration/migrateVisibilityModeEnum.js',
  'src/migration/migrateWorldScopeEntities.js',
  'src/migration/migrationErrors.js',
  'src/migration/migrationHelpers.js',
  'src/migration/migrationRecoveryPrompt.js',
  'src/migration/remapWorldScopeIdentityFlags.js',
  'src/migration/respawnTraversal.js',
  'src/migration/restampOwnedItemComponentIdentity.js',
  'src/migration/worldEssenceEquivalence.js',
  'src/migration/worldScopeDefaults.js',
  'src/migration/worldScopeEntityGrouping.js',
  'src/migration/worldScopeEntityNotice.js',
  'src/migration/worldScopeReferenceRewrite.js',
  'src/models/Ingredient.js',
  'src/models/IngredientGroup.js',
  'src/models/IngredientSet.js',
  'src/models/Recipe.js',
  'src/models/Result.js',
  'src/models/Tool.js',
  'src/models/match/matchTypes.js',
  'src/models/reconstructibleDefaults.js',
  'src/models/toolDisplay.js',
  'src/systems/AlchemyListingBuilder.js',
  'src/systems/AlchemySignatureReport.js',
  'src/systems/BulkDestroyService.js',
  'src/systems/BulkSalvageChatCard.js',
  'src/systems/BulkSalvageService.js',
  'src/systems/CharacterLibrariesStore.js',
  'src/systems/CoinSpenders.js',
  'src/systems/CompendiumImporter.js',
  'src/systems/CraftingChatCard.js',
  'src/systems/CraftingDefinitionRepository.js',
  'src/systems/CraftingEngine.js',
  'src/systems/CraftingListingBuilder.js',
  'src/systems/CraftingRunManager.js',
  'src/systems/CraftingSystemExporter.js',
  'src/systems/CraftingSystemManager.js',
  'src/systems/CurrencyConfigStore.js',
  'src/systems/FragmentDiscoveryHook.js',
  'src/systems/GatheringBlindRunStore.js',
  'src/systems/GatheringChatCard.js',
  'src/systems/GatheringDropReferenceValidator.js',
  'src/systems/GatheringEngine.js',
  'src/systems/GatheringEnvironmentStore.js',
  'src/systems/GatheringGateAndCheckEvaluator.js',
  'src/systems/GatheringHookPublisher.js',
  'src/systems/GatheringListingBuilder.js',
  'src/systems/GatheringLocationService.js',
  'src/systems/GatheringNodeService.js',
  'src/systems/GatheringPartyStore.js',
  'src/systems/GatheringRealmStore.js',
  'src/systems/GatheringRichStateService.js',
  'src/systems/GatheringRunManager.js',
  'src/systems/GatheringStaminaService.js',
  'src/systems/GatheringWorldTimeProcessor.js',
  'src/systems/InventoryListingBuilder.js',
  'src/systems/Pf2eInventoryCoinAdapter.js',
  'src/systems/RecipeActivationError.js',
  'src/systems/RecipeItemLearningHook.js',
  'src/systems/RecipeManager.js',
  'src/systems/RecipePersistenceError.js',
  'src/systems/RecipeVisibilityService.js',
  'src/systems/ResolutionModeService.js',
  'src/systems/RunJournalBuilder.js',
  'src/systems/SalvageChatCard.js',
  'src/systems/SalvageRunManager.js',
  'src/systems/SettingsCraftingDefinitionRepository.js',
  'src/systems/SignatureValidator.js',
  'src/systems/WorldVocabularyStore.js',
  'src/systems/advanceCraftingSources.js',
  'src/systems/authoringExport.js',
  'src/systems/bulkChatVisibility.js',
  'src/systems/characterLibraries.js',
  'src/systems/characterModifierPrerequisiteCopy.js',
  'src/systems/characterPrerequisites.js',
  'src/systems/checkModifierResolver.js',
  'src/systems/checkRoll.js',
  'src/systems/companionCheckRoll.js',
  'src/systems/companionComponentAward.js',
  'src/systems/companionContract.js',
  'src/systems/companionKnowledgeGrant.js',
  'src/systems/companionPooledConsumption.js',
  'src/systems/companionPooledHoldings.js',
  'src/systems/complicationRuntime.js',
  'src/systems/complicationSocket.js',
  'src/systems/componentEssenceOverride.js',
  'src/systems/componentScope.js',
  'src/systems/componentStacking.js',
  'src/systems/craftingBrowseStatus.js',
  'src/systems/craftingDataChange.js',
  'src/systems/currencyAffordance.js',
  'src/systems/currencyProfile.js',
  'src/systems/essenceScope.js',
  'src/systems/eventSceneCoordinator.js',
  'src/systems/foundryCalendar.js',
  'src/systems/gatheringBlindRunSocket.js',
  'src/systems/gatheringComposition.js',
  'src/systems/gatheringEngineInternals.js',
  'src/systems/gatheringLocation.js',
  'src/systems/gatheringMatch.js',
  'src/systems/gatheringNodeConfig.js',
  'src/systems/gatheringNodeSocket.js',
  'src/systems/gatheringRealmDiscovery.js',
  'src/systems/gatheringRealms.js',
  'src/systems/gatheringRichStateInternals.js',
  'src/systems/importReferenceResolver.js',
  'src/systems/importReportContent.js',
  'src/systems/invalidationDomains.js',
  'src/systems/inventorySnapshot.js',
  'src/systems/itemStackQuantity.js',
  'src/systems/modifierLibrary.js',
  'src/systems/mutationCleanupComposition.js',
  'src/systems/nodeRespawnMath.js',
  'src/systems/passInventorySnapshot.js',
  'src/systems/pooledAllocation.js',
  'src/systems/progressiveCheckSandbox.js',
  'src/systems/recipeItemPartyLearnPool.js',
  'src/systems/recipeKeyedFlagEntries.js',
  'src/systems/resolvedComponentEssences.js',
  'src/systems/revisionTokens.js',
  'src/systems/runContainerCoherence.js',
  'src/systems/runContainerStore.js',
  'src/systems/runFlagInvalidation.js',
  'src/systems/salvageCheckUsability.js',
  'src/systems/scopedDefinitionStore.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedEntityReads.js',
  'src/systems/startupMaintenance.js',
  'src/systems/startupPassComposition.js',
  'src/systems/stepRecipeView.js',
  'src/systems/summaryProjection.js',
  'src/systems/systemValidation.js',
  'src/systems/toolBreakageAuthority.js',
  'src/systems/toolCheckBonus.js',
  'src/systems/toolScope.js',
  'src/systems/worldIdentityDrift.js',
  'src/systems/worldScopeImportMerge.js',
  'src/systems/worldScopeRekeyPending.js',
  'src/systems/worldScopeStores.js',
  'src/systems/worldVocabulary.js',
  'src/systems/writableActors.js',
  'src/toolBreakageRuntime.js',
  'src/utils/FormulaEvaluator.js',
  'src/utils/MacroExecutor.js',
  'src/utils/alchemySignatureKey.js',
  'src/utils/alchemySubmissions.js',
  'src/utils/browserGroupCounts.js',
  'src/utils/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  'src/utils/categoryIcons.js',
  'src/utils/checkModifierPicks.js',
  'src/utils/complicationPlan.js',
  'src/utils/complicationSummary.js',
  'src/utils/componentBrowserModel.js',
  'src/utils/componentBulkEditModel.js',
  'src/utils/componentCategories.js',
  'src/utils/componentComplications.js',
  'src/utils/componentNameMatch.js',
  'src/utils/componentScopeValidation.js',
  'src/utils/craftingCheckExpression.js',
  'src/utils/deferredEntryNotice.js',
  'src/utils/definitionIndex.js',
  'src/utils/essenceAllocation.js',
  'src/utils/essenceBrowserModel.js',
  'src/utils/essenceBulkEditModel.js',
  'src/utils/essenceResolver.js',
  'src/utils/essenceValidation.js',
  'src/utils/failureResultPolicy.js',
  'src/utils/gatheringFailureOutcome.js',
  'src/utils/iconVocabulary.js',
  'src/utils/localizeWithFallback.js',
  'src/utils/macroReference.js',
  'src/utils/managerBrowserViewState.js',
  'src/utils/matchFolderVocabulary.js',
  'src/utils/memoizedModuleLoad.js',
  'src/utils/objectPath.js',
  'src/utils/plainTextDescription.js',
  'src/utils/progressiveAward.js',
  'src/utils/progressiveResultOrder.js',
  'src/utils/progressiveStageComplications.js',
  'src/utils/progressiveStageThresholds.js',
  'src/utils/recipeAccessRoster.js',
  'src/utils/recipeActivationMessages.js',
  'src/utils/recipeBrowserModel.js',
  'src/utils/recipeBulkEditModel.js',
  'src/utils/recipeCategories.js',
  'src/utils/recipeComponentReferences.js',
  'src/utils/recipeDeleteImpact.js',
  'src/utils/recipeEssenceReferences.js',
  'src/utils/recipeItemMembership.js',
  'src/utils/rollExpressionAverage.js',
  'src/utils/rollFormulaRollability.js',
  'src/utils/routedOutcomeKeywords.js',
  'src/utils/scopedEntityListModel.js',
  'src/utils/sourceReferenceUnion.js',
  'src/utils/sourceUuid.js',
  'src/utils/startupMarks.js',
  'src/utils/vocabularyCascade.js',
  'src/utils/vocabularyUsage.js',
];

/**
 * Expand a frozen legacy argv against the working tree.
 *
 * DELIBERATELY NOT A GENERAL GLOB ENGINE. It handles the three token shapes the two frozen
 * commands actually contain and THROWS on anything else, because the alternative — a permissive
 * matcher that shrugs at a shape it does not know — fails in the silent direction: an unrecognised
 * pattern contributes nothing, the derived set comes out smaller, and the superset assertion this
 * feeds gets easier to pass. The shapes are:
 *
 *   1. `dir/{a,b,c}/**\/*.ext` — a braced set of directories, walked recursively.
 *   2. `dir/**\/*.ext` — one directory, walked recursively.
 *   3. A literal path with no glob character.
 *
 * Options (anything starting with `-`) are skipped. So is the tool name in first position.
 *
 * @param {string} argv the frozen command text
 * @returns {string[]} repository-relative POSIX paths, sorted and de-duplicated
 */
export function deriveLegacyGateFiles(argv) {
  const [, ...tokens] = argv.split(/\s+/).filter(Boolean);
  const found = new Set();

  for (const raw of tokens) {
    if (raw.startsWith('-')) continue;
    const token = raw.replaceAll('"', '');

    const braced = /^(?<root>[\w./-]+)\/\{(?<dirs>[\w,-]+)\}\/\*\*\/\*(?<ext>\.\w+)$/u.exec(token);
    if (braced) {
      for (const dir of braced.groups.dirs.split(',')) {
        for (const file of walk(`${braced.groups.root}/${dir}`, braced.groups.ext)) found.add(file);
      }
      continue;
    }

    const recursive = /^(?<root>[\w./-]+)\/\*\*\/\*(?<ext>\.\w+)$/u.exec(token);
    if (recursive) {
      for (const file of walk(recursive.groups.root, recursive.groups.ext)) found.add(file);
      continue;
    }

    if (/[*?{}[\]]/u.test(token)) {
      throw new Error(
        `the frozen-argv expander does not know the pattern ${token}. Teach it that shape — ` +
          'ignoring one would silently shrink the set the superset assertion is measured against.'
      );
    }
    found.add(token);
  }

  return [...found].sort(byCodePoint);
}

/** Every file under `directory` ending in `extension`, repository-relative and POSIX. */
function walk(directory, extension) {
  const absolute = path.join(REPOSITORY_ROOT, directory);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) =>
      [directory, path.relative(absolute, path.join(entry.parentPath, entry.name))]
        .join('/')
        .split(String.fromCodePoint(92))
        .join('/')
    );
}
