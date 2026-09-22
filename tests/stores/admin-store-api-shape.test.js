/**
 * The admin store's public shape, pinned key by key (issue 1708). The 236-key set, each member's
 * kind and each action's function name are the contract the section split must preserve; a key
 * bound to the wrong section member changes neither the key set nor any kind, so the name
 * assertion is the only guard that sees it.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createSectionHarness } from '../helpers/adminSectionCorpus.js';
import { expectedMemberKinds, storeMemberKinds } from '../helpers/storeMemberKinds.js';

const STORE_MEMBERS = [
  'selectedSystemId',
  'activeTab',
  'recipeSearch',
  'itemSearch',
  'selectedEnvironmentId',
  'viewState',
  'worldScope',
];

const ACTION_MEMBERS = [
  'selectSystem',
  'createSystem',
  'deleteSystem',
  'saveSystemDetails',
  'setResolutionMode',
  'setVisibilityMode',
  'setSalvageResolutionMode',
  'setTab',
  'selectEnvironment',
  'createEnvironmentDraft',
  'updateEnvironmentDraft',
  'setEnvironmentCompositionMode',
  'includeEnvironmentRecord',
  'forceIncludeEnvironmentRecord',
  'excludeEnvironmentRecord',
  'restoreEnvironmentRecord',
  'reorderEnvironmentRecord',
  'confirmDiscardDirtyEnvironmentDraft',
  'confirmDiscardDirtyComponentDraft',
  'confirmDiscardDirtyEssenceDraft',
  'confirmDiscardDirtyToolEntryDraft',
  'confirmDiscardDirtySystemDetailsDraft',
  'confirmDiscardDirtyChecksDraft',
  'confirmDiscardDirtyRecipeDraft',
  'confirmRecipeAction',
  'confirmDiscardDirtyGatheringTaskDraft',
  'confirmDiscardDirtyGatheringEventDraft',
  'confirmGatheringLibraryTaskCompositionLoss',
  'confirmGatheringLibraryEventCompositionLoss',
  'cancelEnvironmentDraft',
  'saveEnvironmentDraft',
  'duplicateEnvironmentDraft',
  'deleteEnvironmentDraft',
  'reorderEnvironments',
  'moveEnvironmentDraft',
  'toggleEnvironmentEnabled',
  'setEnvironmentRealmMembership',
  'toggleSystemEnabled',
  'setToolBreakageAuthority',
  'toggleFeature',
  'toggleRequirement',
  'addCategory',
  'removeCategory',
  'setCategoryIcon',
  'addComponentCategory',
  'removeComponentCategory',
  'setComponentCategoryIcon',
  'addTag',
  'removeTag',
  'addEssence',
  'updateEssence',
  'setEssenceEnabled',
  'applyEssenceBulkEdit',
  'deleteEssence',
  'deleteEssences',
  'cancelEssenceDraft',
  'updateGatheringConditions',
  'updateGatheringVocabulary',
  'toggleGatheringConditionEnabled',
  'addGatheringConditionValue',
  'updateGatheringConditionValue',
  'deleteGatheringConditionValue',
  'addGatheringVocabularyValue',
  'updateGatheringVocabularyValue',
  'deleteGatheringVocabularyValue',
  'updateGatheringRules',
  'addGatheringLibraryTask',
  'updateGatheringLibraryTask',
  'validateGatheringLibraryTask',
  'deleteGatheringLibraryTask',
  'duplicateGatheringLibraryTask',
  'addGatheringLibraryTool',
  'updateGatheringLibraryTool',
  'deleteGatheringLibraryTool',
  'validateGatheringLibraryTool',
  'createToolDraft',
  'randomID',
  'openToolDraft',
  'getActorRollData',
  'setToolSectionInherited',
  'removeToolFromSystem',
  'patchToolDraft',
  'stageToolDraftSource',
  'unlinkToolDraftSource',
  'discardToolDraft',
  'deleteToolDraft',
  'toggleToolEnabled',
  'enterToolsDraft',
  'updateToolsDraft',
  'addToolFromUuidToDraft',
  'updateToolInDraft',
  'deleteToolFromDraft',
  'selectDraftTool',
  'setExpandedDraftTool',
  'validateToolsDraft',
  'validateToolDraft',
  'isToolDraftDirty',
  'saveToolDraft',
  'saveAllDirtyToolDrafts',
  'saveToolsDraft',
  'cancelToolsDraft',
  'isToolsDraftDirty',
  'confirmDiscardDirtyToolsDraft',
  'gatheringTaskAutopopulateFromComponent',
  'addGatheringLibraryEvent',
  'updateGatheringLibraryEvent',
  'deleteGatheringLibraryEvent',
  'duplicateGatheringLibraryEvent',
  'addModifier',
  'updateModifier',
  'deleteModifier',
  'reorderModifier',
  'seedModifierPresets',
  'addCharacterPrerequisite',
  'updateCharacterPrerequisite',
  'deleteCharacterPrerequisite',
  'reorderCharacterPrerequisite',
  'seedPrerequisitePresets',
  'addGatheringDropRowCharacterModifier',
  'updateGatheringDropRowCharacterModifier',
  'deleteGatheringDropRowCharacterModifier',
  'addGatheringEventCharacterModifier',
  'updateGatheringEventCharacterModifier',
  'deleteGatheringEventCharacterModifier',
  'saveCraftingCheckRouted',
  'saveCraftingCheckSimple',
  'saveCraftingCheckProgressive',
  'saveCraftingCheckActive',
  'saveCraftingCheckConsumption',
  'saveSalvageCheckConsumption',
  'saveCraftingCheckFailureResultPolicy',
  'saveSalvageCheckFailureResultPolicy',
  'saveGatheringCheckFailureResultPolicy',
  'saveCraftingCheckModifiers',
  'saveSalvageCheckModifiers',
  'saveGatheringCheckModifiers',
  'saveSalvageCheckActive',
  'saveSalvageCheckProgressive',
  'saveSalvageCheckSimple',
  'saveSalvageCheckRouted',
  'saveGatheringCheckActive',
  'saveGatheringCheckProgressive',
  'saveGatheringCheckRouted',
  'addCurrencyUnit',
  'updateCurrencyUnit',
  'deleteCurrencyUnit',
  'reorderCurrencyUnit',
  'addCurrencySubUnit',
  'updateCurrencySubUnit',
  'deleteCurrencySubUnit',
  'setCurrencySpendStrategy',
  'setCurrencyProvider',
  'setCurrencyMacro',
  'clearCurrencyMacro',
  'seedCurrencyUnitPresets',
  'saveAlchemyConfig',
  'setAlchemyCheckMode',
  'saveTeaserConfig',
  'createRecipe',
  'deleteRecipe',
  'deleteRecipes',
  'describeRecipeDelete',
  'duplicateRecipe',
  'toggleRecipeEnabled',
  'toggleRecipeLocked',
  'updateRecipe',
  'getRecipeSignatureConflicts',
  'getPcRoster',
  'saveRecipeAccess',
  'addRecipeItemFromUuid',
  'updateRecipeItemCaps',
  'setRecipeBookMembership',
  'setRecipeItemEnabled',
  'saveRecipeItem',
  'deleteRecipeItemDefinition',
  'confirmDiscardDirtyRecipeItemDraft',
  'importRecipes',
  'exportRecipes',
  'exportSystem',
  'importSystem',
  'deleteComponent',
  'deleteComponents',
  'describeComponentDelete',
  'updateComponent',
  'applyComponentBulkEdit',
  'applyRecipeBulkEdit',
  'setRecipeSearch',
  'setItemSearch',
  'clearLibrarySearches',
  'setGraphSearch',
  'refreshTravelParties',
  'selectParty',
  'createParty',
  'renameParty',
  'setPartyEnabled',
  'deleteParty',
  'addPartyMember',
  'addOrMovePartyMember',
  'removePartyMember',
  'movePartyMember',
  'setPartyTravelActor',
  'clearPartyTravelActor',
  'setPartyRealmOverride',
  'clearPartyRealmOverride',
  'removeStaleMember',
  'clearStaleTravelActor',
  'dropStaleOverrideRealm',
  'createRealmQuick',
  'renameRealm',
  'toggleRealmEnabled',
  'updateRealm',
  'setMapRegionLink',
  'deleteRealm',
  'setGatheringRealmsEnabled',
  'setKnowledgeActive',
  'refreshKnowledge',
  'scheduleKnowledgeRefresh',
  'markLearnedRecipeIndexStale',
  'selectKnowledgeActor',
  'expendRecipeItemUse',
  'deleteOwnedRecipeItem',
  'eraseLearnedRecipe',
  'resetActorSystemKnowledge',
  'resetActorAllKnowledge',
  'refresh',
  'refreshGatheringConfig',
  'refreshAccessRosters',
  'resolveRecipeAccess',
  'destroy',
];

// `randomID` is the one action whose name is not its key: it is the module-private `_randomID`,
// exposed under a public name because a world-scope create needs an id minter.
const RENAMED_ACTIONS = { randomID: '_randomID' };

describe('adminStore public shape', () => {
  it('exposes exactly 236 members, split into 7 stores and 229 actions', async () => {
    const harness = await createSectionHarness();
    try {
      assert.equal(STORE_MEMBERS.length + ACTION_MEMBERS.length, 236);
      assert.equal(Object.keys(harness.store).length, 236);
      assert.deepEqual(
        storeMemberKinds(harness.store),
        expectedMemberKinds({ stores: STORE_MEMBERS, methods: ACTION_MEMBERS })
      );
    } finally {
      harness.dispose();
    }
  });

  it('binds every action to the member of its own name', async () => {
    const harness = await createSectionHarness();
    try {
      const actual = Object.fromEntries(
        ACTION_MEMBERS.map((key) => [key, harness.store[key].name])
      );
      const expected = Object.fromEntries(
        ACTION_MEMBERS.map((key) => [key, RENAMED_ACTIONS[key] || key])
      );
      assert.deepEqual(actual, expected);
    } finally {
      harness.dispose();
    }
  });

  it('exposes every store member as a subscribable Svelte store', async () => {
    const harness = await createSectionHarness();
    try {
      for (const key of STORE_MEMBERS) {
        if (key === 'worldScope') continue;
        assert.equal(typeof harness.store[key].subscribe, 'function', key);
      }
      assert.equal(typeof harness.store.worldScope, 'object');
    } finally {
      harness.dispose();
    }
  });
});
