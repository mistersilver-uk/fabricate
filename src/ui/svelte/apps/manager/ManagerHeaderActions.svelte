<!-- Svelte 5 runes mode -->
<!--
  The page header's trailing action group: the visibility gate, the world routes' own actions, and
  the two family units the crafting and gathering routes dispatch into (issue 1720).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `header` | the `headerModel` instance | — | `actionsLabel` names the group and `actionsFamily` selects the family unit |
  | `currentView` | the active route token | `''` | selects one branch of the world half |
  | `text` | the shell's localizer | — | `(key, fallback)` |

  Every other prop is one branch's own state or handler leg, or is forwarded to a family unit.

  Invariants:
  - The group renders its labelled `<div>` whenever the gate holds, including on the four routes
    whose branch draws nothing.
  - Branch order and the family dispatch are pinned by `tests/manager-header-families.test.js`.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import ManagerHeaderCraftingActions from './ManagerHeaderCraftingActions.svelte';
  import ManagerHeaderGatheringActions from './ManagerHeaderGatheringActions.svelte';
  import ScopedEntryHeaderActions from './scoped/ScopedEntryHeaderActions.svelte';
  import { managerHeaderActionClass } from '../../../managerExtensions.js';

  const PATREON_URL = 'https://www.patreon.com/c/mistersilver';

  let {
    header,
    text = () => '',
    currentView = '',
    isWorldRulesRoute = false,
    isWorldScopedRoute = false,
    isWorldTravelRoute = false,
    worldTravelTab = '',
    selectedSystemId = '',
    worldEssenceEntryDirty = false,
    worldEssenceEntrySaving = false,
    backToWorldEssences = () => {},
    saveWorldEssenceEntry = () => {},
    worldToolEntryDirty = false,
    worldToolEntrySaving = false,
    worldToolEntryDelete = false,
    worldToolDeleteAction = null,
    backToWorldTools = () => {},
    saveWorldToolEntry = () => {},
    worldComponentEntryDirty = false,
    worldComponentEntrySaving = false,
    backToWorldComponents = () => {},
    saveWorldComponentEntry = () => {},
    createWorldEssence = () => {},
    downtimeCoreFallback = false,
    downtimeHeaderStatus = null,
    downtimeHeaderActions = [],
    runDowntimeHeaderAction = () => {},
    travelSaving = false,
    createParty = () => {},
    createTravelRealm = () => {},
    backToSystemsBrowser = () => {},
    importSystem = () => {},
    exportSelectedSystem = () => {},
    createSystem = () => {},
    isChecksRoute = false,
    createRecipe = () => {},
    recipeEditDirty = false,
    recipeEditSaving = false,
    recipeEditSaveLabel = () => '',
    canSaveRecipeEdit = false,
    selectedRecipeId = '',
    backToRecipesBrowse = () => {},
    deleteRecipeFromEdit = () => {},
    saveRecipeDraft = () => {},
    recipeItemDraft = null,
    recipeItemEditDirty = false,
    recipeItemEditSaving = false,
    recipeItemSaveFailed = false,
    canSaveRecipeItemEdit = false,
    backToBooksScrolls = () => {},
    deleteRecipeItemFromEdit = () => {},
    saveRecipeItemDraft = () => {},
    openComponentAddFromCatalogue = () => {},
    componentEditCombinedDirty = false,
    componentEditSaving = false,
    componentEditSaveLabel = () => '',
    canSaveComponentEdit = false,
    backToComponentsBrowse = () => {},
    checksDirty = false,
    checksSaving = false,
    saveChecks = () => {},
    essenceEditDirty = false,
    essenceEditSaving = false,
    essenceEditSaveLabel = () => '',
    canSaveEssenceEdit = false,
    cancelEssenceEdit = () => {},
    displayedGatheringTab = '',
    canShowEnvironments = false,
    createGatheringTaskForSystem = () => {},
    createGatheringEventForSystem = () => {},
    createEnvironment = () => {},
    environmentDraftDirty = false,
    environmentDraftIsNew = false,
    environmentSaving = false,
    backToEnvironmentsBrowse = () => {},
    deleteEnvironmentDraft = () => {},
    saveEnvironmentEdit = () => {},
    gatheringTaskDraftDirty = false,
    gatheringTaskSaving = false,
    gatheringTaskValidation = null,
    gatheringTaskSaveError = '',
    selectedGatheringTaskId = '',
    backToGatheringTaskLibrary = () => {},
    deleteGatheringTaskDraft = () => {},
    saveGatheringTaskDraft = () => {},
    gatheringEventDraftDirty = false,
    gatheringEventSaving = false,
    gatheringEventValidation = null,
    gatheringEventSaveError = '',
    selectedGatheringEventId = '',
    backToGatheringEventLibrary = () => {},
    deleteGatheringEventDraft = () => {},
    saveGatheringEventDraft = () => {},
  } = $props();
</script>

<!--
  World > Currency and the world scoped-entity routes draw no page-header actions; the four
  world routes the gate names on its right are back in as a seam (issues 1278, 1362, 1372).
-->
{#if (currentView !== 'tools' && currentView !== 'tool-edit' && !isWorldRulesRoute && !isWorldScopedRoute) || currentView === 'world-essences' || currentView === 'world-essence-entry' || currentView === 'world-tool-entry' || currentView === 'world-component-entry'}
  <div class="manager-header-actions" aria-label={header.actionsLabel}>
    {#if currentView === 'world-essence-entry'}
      <!-- The editor action pair, through the shared component (issue 1372). -->
      <ScopedEntryHeaderActions
        backAttribute="data-world-essence-back"
        saveAttribute="data-world-essence-save"
        backLabel={text('FABRICATE.Admin.Manager.Scoped.Essence.BackToCatalogueShort', 'Back')}
        saveLabel={text('FABRICATE.Admin.Manager.Scoped.Essence.Save', 'Save essence')}
        saveDisabled={!worldEssenceEntryDirty}
        saving={worldEssenceEntrySaving}
        onBack={backToWorldEssences}
        onSave={saveWorldEssenceEntry}
      />
    {:else if currentView === 'world-tool-entry'}
      <!-- The same pair, through the same component (issue 1373). -->
      <ScopedEntryHeaderActions
        backAttribute="data-world-tool-back"
        saveAttribute="data-world-tool-save"
        backLabel={text('FABRICATE.Admin.Manager.Scoped.Entry.BackToTools', 'Back to tools')}
        saveLabel={text('FABRICATE.Admin.Manager.Scoped.Tool.Save', 'Save tool')}
        saveDisabled={!worldToolEntryDirty}
        saving={worldToolEntrySaving}
        onBack={backToWorldTools}
        onSave={saveWorldToolEntry}
        danger={worldToolEntryDelete ? worldToolDeleteAction : undefined}
      />
    {:else if currentView === 'world-component-entry'}
      <!-- The third caller of the same pair, led by the unsaved marker the band had nowhere
           else to draw (`proto:817`, gap-list row 53; issue 1371). -->
      {#if worldComponentEntryDirty}
        <span class="manager-header-unsaved" data-world-component-entry-unsaved>
          <span class="manager-header-unsaved-dot" aria-hidden="true"></span>
          {text('FABRICATE.Admin.Manager.Scoped.Component.Entry.Unsaved', 'Unsaved changes')}
        </span>
      {/if}
      <ScopedEntryHeaderActions
        backAttribute="data-world-component-back"
        saveAttribute="data-world-component-save"
        backLabel={text('FABRICATE.Admin.Manager.Scoped.Component.BackToCatalogueShort', 'Back')}
        saveLabel={text('FABRICATE.Admin.Manager.Scoped.Component.Save', 'Save entry')}
        saveDisabled={!worldComponentEntryDirty}
        saving={worldComponentEntrySaving}
        onBack={backToWorldComponents}
        onSave={saveWorldComponentEntry}
      />
    {:else if currentView === 'world-essences'}
      <!-- Create takes no name field. -->
      <ManagerButton role="primary" data-world-essence-create onclick={createWorldEssence}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Scoped.Essence.New', 'New essence')}</span>
      </ManagerButton>
    {:else if currentView === 'world-downtime'}
      {#if downtimeCoreFallback}
        <!-- The promotional pill sits at the top of every Downtime screen. -->
        <ManagerButton
          tag="a"
          class="manager-downtime-unlock"
          data-downtime-unlock
          href={PATREON_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <i class="fas fa-crown" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.World.Downtime.Unlock', 'Unlock with Premium')}</span
          >
        </ManagerButton>
      {:else}
        <!-- The status chip leads the group, where every core editor puts its own chip. -->
        {#if downtimeHeaderStatus}
          <Chip
            tone={downtimeHeaderStatus.tone}
            truncate
            density="action"
            data-downtime-chrome-status
            title={downtimeHeaderStatus.tooltip ?? downtimeHeaderStatus.label}
            >{downtimeHeaderStatus.label}</Chip
          >
        {/if}
        {#each downtimeHeaderActions as action (action.id)}
          {#if action.href}
            <a
              class={managerHeaderActionClass(action)}
              data-manager-header-action={action.id}
              href={action.href}
              title={action.tooltip}
              target="_blank"
              rel="noopener noreferrer"
            >
              {#if action.icon}<i class={action.icon} aria-hidden="true"></i>{/if}
              <span>{action.label}</span>
            </a>
          {:else}
            <button
              type="button"
              class={managerHeaderActionClass(action)}
              data-manager-header-action={action.id}
              title={action.tooltip}
              disabled={action.disabled === true}
              onclick={() => runDowntimeHeaderAction(action)}
            >
              {#if action.icon}<i class={action.icon} aria-hidden="true"></i>{/if}
              <span>{action.label}</span>
            </button>
          {/if}
        {/each}
      {/if}
    {:else if header.actionsFamily === 'crafting'}
      <ManagerHeaderCraftingActions
        {text}
        {currentView}
        {isChecksRoute}
        {createRecipe}
        {selectedSystemId}
        {recipeEditDirty}
        {recipeEditSaving}
        {recipeEditSaveLabel}
        {canSaveRecipeEdit}
        {selectedRecipeId}
        {backToRecipesBrowse}
        {deleteRecipeFromEdit}
        {saveRecipeDraft}
        {recipeItemDraft}
        {recipeItemEditDirty}
        {recipeItemEditSaving}
        {recipeItemSaveFailed}
        {canSaveRecipeItemEdit}
        {backToBooksScrolls}
        {deleteRecipeItemFromEdit}
        {saveRecipeItemDraft}
        {openComponentAddFromCatalogue}
        {componentEditCombinedDirty}
        {componentEditSaving}
        {componentEditSaveLabel}
        {canSaveComponentEdit}
        {backToComponentsBrowse}
        {checksDirty}
        {checksSaving}
        {saveChecks}
        {essenceEditDirty}
        {essenceEditSaving}
        {essenceEditSaveLabel}
        {canSaveEssenceEdit}
        {cancelEssenceEdit}
      />
    {:else if header.actionsFamily === 'gathering'}
      <ManagerHeaderGatheringActions
        {text}
        {currentView}
        {displayedGatheringTab}
        {canShowEnvironments}
        {createGatheringTaskForSystem}
        {createGatheringEventForSystem}
        {createEnvironment}
        {environmentDraftDirty}
        {environmentDraftIsNew}
        {environmentSaving}
        {backToEnvironmentsBrowse}
        {deleteEnvironmentDraft}
        {saveEnvironmentEdit}
        {gatheringTaskDraftDirty}
        {gatheringTaskSaving}
        {gatheringTaskValidation}
        {gatheringTaskSaveError}
        {selectedGatheringTaskId}
        {backToGatheringTaskLibrary}
        {deleteGatheringTaskDraft}
        {saveGatheringTaskDraft}
        {gatheringEventDraftDirty}
        {gatheringEventSaving}
        {gatheringEventValidation}
        {gatheringEventSaveError}
        {selectedGatheringEventId}
        {backToGatheringEventLibrary}
        {deleteGatheringEventDraft}
        {saveGatheringEventDraft}
      />
    {:else if currentView === 'world'}
      <ManagerButton role="primary" onclick={createParty} disabled={travelSaving}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.World.Parties.CreateAction', 'New party')}</span>
      </ManagerButton>
    {:else if isWorldTravelRoute && worldTravelTab === 'realms'}
      <ManagerButton role="primary" onclick={createTravelRealm} disabled={travelSaving}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Travel.CreateRealm', 'Create realm')}</span>
      </ManagerButton>
    {:else if isWorldTravelRoute}
      <!-- Map Region Links has no create action: a Scene Region is authored in Foundry. -->
    {:else if currentView === 'system-edit'}
      <!-- `ghost` here rests on the verb, not on a neighbour. -->
      <ManagerButton role="ghost" data-system-edit-back onclick={backToSystemsBrowser}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.SystemEdit.BackToSystems', 'Back to systems')}</span>
      </ManagerButton>
    {:else}
      <!-- `data-manager-import-system` is a zero-behaviour hook: the only other handle on this
           button is `manager-button`, which a dozen header controls share. -->
      <ManagerButton data-manager-import-system onclick={importSystem}>
        <i class="fas fa-file-import" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Import', 'Import')}</span>
      </ManagerButton>
      <ManagerButton onclick={exportSelectedSystem} disabled={!selectedSystemId}>
        <i class="fas fa-file-export" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Export', 'Export')}</span>
      </ManagerButton>
      <ManagerButton role="primary" onclick={createSystem}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Create', 'Create')}</span>
      </ManagerButton>
    {/if}
  </div>
{/if}
