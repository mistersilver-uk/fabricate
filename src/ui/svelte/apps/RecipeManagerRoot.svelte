<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import SystemSidebar from './SystemSidebar.svelte';
  import SystemSettings from './SystemSettings.svelte';
  import ItemsTab from './ItemsTab.svelte';
  import RecipesTab from './RecipesTab.svelte';
  import RulesTab from './RulesTab.svelte';
  import RecipeGraphTab from './RecipeGraphTab.svelte';
  import EnvironmentsTab from './EnvironmentsTab.svelte';

  let { store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  const activeTab = store.activeTab;
  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;

  const tabs = [
    { id: 'systems', icon: 'fas fa-layer-group', label: 'FABRICATE.Admin.Tabs.Systems' },
    { id: 'items', icon: 'fas fa-boxes', label: 'FABRICATE.Admin.Tabs.Items' },
    { id: 'recipes', icon: 'fas fa-scroll', label: 'FABRICATE.Admin.Tabs.Recipes' },
    { id: 'environments', icon: 'fas fa-seedling', label: 'FABRICATE.Admin.Tabs.Environments' },
    { id: 'rules', icon: 'fas fa-sliders-h', label: 'FABRICATE.Admin.Tabs.Rules' },
    { id: 'graph', icon: 'fas fa-project-diagram', label: 'FABRICATE.Admin.Tabs.Graph' }
  ];
</script>

<div class="fabricate-admin">
  <header class="admin-header">
    <nav class="admin-tabs">
      {#each tabs as tab}
        {#if tab.id !== 'environments' || $viewState.canShowEnvironmentsTab}
          <button
            type="button"
            class:active={$activeTab === tab.id}
            onclick={() => store.setTab(tab.id)}
          >
            <i class={tab.icon}></i> {localize(tab.label)}
          </button>
        {/if}
      {/each}
    </nav>

    <div class="admin-system-name">
      {#if $viewState.hasSystem}
        <span>{localize('FABRICATE.Admin.Selected')} <strong>{$viewState.selectedSystemName}</strong></span>
      {:else}
        <span>{localize('FABRICATE.Admin.NoSystemsYet')}</span>
      {/if}
    </div>
  </header>

  <div class="admin-body">
    <SystemSidebar
      systems={$viewState.systems}
      onSelectSystem={store.selectSystem}
      onCreateSystem={store.createSystem}
      onDeleteSystem={store.deleteSystem}
      onExportSystem={store.exportSystem}
      onImportSystem={store.importSystem}
    />

    <main class="admin-main">
      {#if $activeTab === 'systems'}
        <SystemSettings selectedSystem={$viewState.selectedSystem} {store} {services} />
      {:else if $activeTab === 'items'}
        <ItemsTab
          hasSystem={$viewState.hasSystem}
          itemCards={$viewState.itemCards}
          itemSearchTerm={$viewState.itemSearchTerm}
          onItemSearch={store.setItemSearch}
          onDropItem={(data) => services?.onDropItem?.(data)}
          onReplaceSource={(itemId, data) => services?.onReplaceSource?.(itemId, data)}
          onCopySourceUuid={(uuid) => services?.onCopySourceUuid?.(uuid)}
          onEditComponent={(id) => services?.onEditComponent?.(id)}
          onDeleteComponent={store.deleteComponent}
        />
      {:else if $activeTab === 'recipes'}
        <RecipesTab
          recipes={$viewState.recipes}
          recipeSearchTerm={$viewState.recipeSearchTerm}
          showVisibilitySummary={$viewState.showVisibilitySummary}
          onRecipeSearch={store.setRecipeSearch}
          onCreateRecipe={store.createRecipe}
          onEditRecipe={(id) => services?.onEditRecipe?.(id)}
          onDuplicateRecipe={store.duplicateRecipe}
          onDeleteRecipe={store.deleteRecipe}
          onToggleRecipeEnabled={store.toggleRecipeEnabled}
          onImportRecipes={store.importRecipes}
          onExportRecipes={store.exportRecipes}
        />
      {:else if $activeTab === 'environments' && $viewState.canShowEnvironmentsTab}
        <EnvironmentsTab
          environments={$viewState.environments}
          environmentDraft={$viewState.environmentDraft}
          dirty={$viewState.environmentDraftDirty}
          isNew={$viewState.environmentDraftIsNew}
          saving={$viewState.environmentSaving}
          saveError={$viewState.environmentSaveError}
          validationState={$viewState.environmentValidationState}
          loading={$viewState.environmentsLoading}
          error={$viewState.environmentsError}
          selectedTaskId={$viewState.selectedEnvironmentTaskId}
          managedItemOptions={$viewState.selectedSystem?.managedItemOptions || []}
          availableScriptMacros={$viewState.selectedSystem?.availableScriptMacros || []}
          sceneOptions={$viewState.selectedSystem?.sceneOptions || []}
          rollTableOptions={$viewState.selectedSystem?.rollTableOptions || []}
          onPickImagePath={services?.pickImagePath}
          onSelectEnvironment={store.selectEnvironment}
          onCreateEnvironment={store.createEnvironmentDraft}
          onUpdateEnvironment={store.updateEnvironmentDraft}
          onCancelEnvironment={store.cancelEnvironmentDraft}
          onSaveEnvironment={store.saveEnvironmentDraft}
          onDuplicateEnvironment={store.duplicateEnvironmentDraft}
          onDeleteEnvironment={store.deleteEnvironmentDraft}
          onMoveEnvironment={store.moveEnvironmentDraft}
          onToggleEnvironmentEnabled={store.toggleEnvironmentEnabled}
          onAddTask={store.addEnvironmentTask}
          onSelectTask={store.selectEnvironmentTask}
          onUpdateTask={store.updateEnvironmentTask}
          onDuplicateTask={store.duplicateEnvironmentTask}
          onDeleteTask={store.deleteEnvironmentTask}
          onMoveTask={store.moveEnvironmentTask}
          onAddResultGroup={store.addEnvironmentTaskResultGroup}
          onUpdateResultGroup={store.updateEnvironmentTaskResultGroup}
          onDeleteResultGroup={store.deleteEnvironmentTaskResultGroup}
          onMoveResultGroup={store.moveEnvironmentTaskResultGroup}
          onAddResult={store.addEnvironmentTaskResult}
          onUpdateResult={store.updateEnvironmentTaskResult}
          onDeleteResult={store.deleteEnvironmentTaskResult}
          onMoveResult={store.moveEnvironmentTaskResult}
          onAddCatalyst={store.addEnvironmentTaskCatalyst}
          onUpdateCatalyst={store.updateEnvironmentTaskCatalyst}
          onDeleteCatalyst={store.deleteEnvironmentTaskCatalyst}
          onUpdateVisibility={store.updateEnvironmentTaskVisibility}
          onUpdateResultSelection={store.updateEnvironmentTaskResultSelection}
          onUpdateProgressive={store.updateEnvironmentTaskProgressive}
          onUpdateCheck={store.updateEnvironmentTaskCheck}
          onUpdateTimeRequirement={store.updateEnvironmentTaskTimeRequirement}
          onUpdateFailureOutcome={store.updateEnvironmentTaskFailureOutcome}
        />
      {:else if $activeTab === 'rules'}
        <RulesTab system={$viewState.selectedSystem} onUpdateTeaserConfig={store.saveTeaserConfig} />
      {:else if $activeTab === 'graph'}
        <RecipeGraphTab
          graphData={$viewState.graphData}
          categories={$viewState.recipeCategories}
          searchTerm={$viewState.graphSearchTerm || ''}
          onSearch={store.setGraphSearch}
          onNodeClick={(recipeId) => services?.onEditRecipe?.(recipeId)}
        />
      {/if}
    </main>
  </div>
</div>
