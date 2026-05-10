<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { buildComponentEditorState } from '../../util/componentEditor.js';
  import ComponentEditView from './ComponentEditView.svelte';
  import ComponentsBrowserView from './ComponentsBrowserView.svelte';
  import EnvironmentEditView from './EnvironmentEditView.svelte';
  import EnvironmentsBrowserView from './EnvironmentsBrowserView.svelte';
  import EssenceBrowserView from './EssenceBrowserView.svelte';
  import EssenceEditView from './EssenceEditView.svelte';
  import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';
  import RecipesBrowserView from './RecipesBrowserView.svelte';
  import SystemEditView from './SystemEditView.svelte';
  import SystemsBrowserView from './SystemsBrowserView.svelte';
  import TagsCategoriesView from './TagsCategoriesView.svelte';

  let { store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  const viewState = store.viewState;

  let activeView = $state('systems');
  let selectedRecipeId = $state('');
  let selectedComponentId = $state('');
  let selectedEssenceId = $state('');
  let lastComponentSystemId = $state('');
  let lastEssenceSystemId = $state('');
  let lastGatheringSystemId = $state('');
  let essenceEditDirty = $state(false);
  let essenceEditSaving = $state(false);
  let essenceEditDraft = $state(null);
  let componentEditDirty = $state(false);
  let componentEditSaving = $state(false);
  let componentEditDraft = $state(null);
  let activeGatheringTab = $state('environments');
  const placeholderViews = [
    { id: 'rules', icon: 'fas fa-sliders-h', labelKey: 'FABRICATE.Admin.ManagerV2.Nav.Rules', fallback: 'Rules' },
    { id: 'graph', icon: 'fas fa-project-diagram', labelKey: 'FABRICATE.Admin.ManagerV2.Nav.Graph', fallback: 'Graph' }
  ];

  const selectedSystem = $derived($viewState.selectedSystem);
  const selectedSystemId = $derived(selectedSystem?.id || '');
  const canShowEnvironments = $derived(selectedSystem?.features?.gathering === true);
  const canShowEssences = $derived(selectedSystem?.features?.essences === true);
  const showEssenceSourceUi = $derived(selectedSystem?.features?.effectTransfer === true);
  const currentView = $derived(normalizedActiveView(activeView, selectedSystem, canShowEnvironments, canShowEssences));
  const selectedCounts = $derived({
    components: selectedSystem?.managedItemOptions?.length || 0,
    recipes: $viewState.recipes?.length || 0,
    environments: selectedSystem?.features?.gathering === true ? ($viewState.environments?.length || 0) : null,
    essences: selectedSystem?.essenceDefinitions?.length || 0,
    itemTags: selectedSystem?.itemTags?.length || 0,
    recipeCategories: selectedSystem?.categories?.length || 0
  });
  const itemCards = $derived($viewState.itemCards || []);
  const tagCategoryUsage = $derived(buildTagCategoryUsage(selectedSystem, $viewState.recipes || [], itemCards));
  const categoryRows = $derived(buildCategoryRows(selectedSystem?.categories || [], tagCategoryUsage.categoryUsage));
  const tagRows = $derived(buildTagRows(selectedSystem?.itemTags || [], tagCategoryUsage.tagUsage));
  const tagCategoryCounts = $derived({
    baseCategories: 1,
    customCategories: categoryRows.filter(row => row.id !== 'general').length,
    itemTags: tagRows.length,
    categoryReferences: tagCategoryUsage.categoryReferenceCount,
    tagReferences: tagCategoryUsage.tagReferenceCount
  });
  const topUsedCategoryExample = $derived(
    categoryRows
      .filter(row => row.id !== 'general' && (row.count || 0) > 0)
      .sort((a, b) => (b.count || 0) - (a.count || 0))[0] || null
  );
  const topUsedTagExample = $derived(
    tagRows
      .filter(row => (row.count || 0) > 0)
      .sort((a, b) => (b.count || 0) - (a.count || 0))[0] || null
  );
  const selectedCountFacts = $derived(buildSelectedCountFacts(selectedCounts));
  const enabledFeatureLabels = $derived(featureLabels(selectedSystem));
  const visiblePlaceholderViews = $derived(selectedSystem
    ? placeholderViews.filter(view => isViewAvailableForSystem(view, selectedSystem))
    : []
  );
  const showRecipeCategories = $derived(!!selectedSystem);
  const selectedRecipe = $derived(
    ($viewState.recipes || []).find(recipe => recipe.id === selectedRecipeId)
      || ($viewState.recipes || [])[0]
      || null
  );
  const showComponentTags = $derived(itemCards.some(item => item.showTags || (Array.isArray(item.tags) && item.tags.length > 0)));
  const showComponentEssences = $derived(itemCards.some(item => item.showEssences || (Array.isArray(item.essences) && item.essences.length > 0)));
  const selectedComponent = $derived(
    itemCards.find(item => item.id === selectedComponentId)
      || itemCards[0]
      || null
  );
  const essenceCards = $derived($viewState.essenceCards || selectedSystem?.essenceDefinitions || []);
  const selectedEssenceStrict = $derived(essenceCards.find(essence => essence.id === selectedEssenceId) || null);
  const isCreatingEssenceDraft = $derived(currentView === 'essence-edit' && !selectedEssenceId);
  const selectedEssence = $derived(
    selectedEssenceStrict
      || essenceCards[0]
      || null
  );
  const selectedEssenceForInspector = $derived(currentView === 'essence-edit' ? essenceEditDraft : selectedEssence);
  const canSaveEssenceEdit = $derived(essenceEditDirty === true
    && essenceEditDraft?.validName === true
    && essenceEditSaving !== true);
  const canSaveComponentEdit = $derived(componentEditDirty === true
    && componentEditSaving !== true);
  const componentForEdit = $derived(currentView === 'component-edit'
    ? itemCards.find(item => item.id === selectedComponentId) || null
    : null);
  const componentEditTagOptions = $derived(componentTagOptionsFor(componentForEdit));
  const componentEditEssenceOptions = $derived(componentEssenceOptionsFor(componentForEdit));
  const componentEditShowTags = $derived(componentShowTagsFor(componentForEdit));
  const componentEditShowEssences = $derived(componentShowEssencesFor(componentForEdit));
  const environmentList = $derived($viewState.environments || []);
  const environmentValidationCount = $derived(Array.isArray($viewState.environmentValidationState?.errors)
    ? $viewState.environmentValidationState.errors.length
    : 0);
  const selectedEnvironmentId = $derived($viewState.selectedEnvironmentId || $viewState.environmentDraft?.id || '');
  const environmentDraftForDisplay = $derived($viewState.environmentDraft || null);
  const shouldUseEnvironmentDraftForDisplay = $derived(Boolean(environmentDraftForDisplay)
    && (currentView === 'environment-edit'
      || $viewState.environmentDraftDirty === true
      || $viewState.environmentDraftIsNew === true
      || environmentDraftForDisplay.id === selectedEnvironmentId));
  const selectedEnvironment = $derived(
    shouldUseEnvironmentDraftForDisplay
      ? environmentDraftForDisplay
      : (environmentList.find(environment => environment.id === selectedEnvironmentId)
        || environmentList.find(environment => environment.id === environmentDraftForDisplay?.id)
        || environmentList[0]
        || null)
  );
  const selectedEnvironmentFacts = $derived(environmentFacts(selectedEnvironment));
  const selectedEnvironmentSceneState = $derived(environmentSceneState(selectedEnvironment));
  const gatheringInspectorTabs = [
    {
      id: 'tasks',
      icon: 'fas fa-list-check',
      titleKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.TasksPlaceholderTitle',
      titleFallback: 'Gathering tasks',
      hintKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.TasksPlaceholderHint',
      hintFallback: 'Reusable gathering task management is planned for a later slice.'
    },
    {
      id: 'encounters',
      icon: 'fas fa-compass',
      titleKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.EncountersPlaceholderTitle',
      titleFallback: 'Gathering encounters',
      hintKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.EncountersPlaceholderHint',
      hintFallback: 'Encounter and hazard authoring is planned for a later slice.'
    },
    {
      id: 'settings',
      icon: 'fas fa-sliders',
      titleKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.SettingsPlaceholderTitle',
      titleFallback: 'Gathering settings',
      hintKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.SettingsPlaceholderHint',
      hintFallback: 'Gathering-wide configuration is planned for a later slice.'
    }
  ];
  const activeGatheringInspectorTab = $derived(
    gatheringInspectorTabs.find(tab => tab.id === activeGatheringTab) || null
  );

  $effect(() => {
    if (selectedSystemId === lastComponentSystemId) return;
    selectedComponentId = '';
    componentEditDirty = false;
    componentEditSaving = false;
    componentEditDraft = null;
    lastComponentSystemId = selectedSystemId;
  });

  $effect(() => {
    if (selectedSystemId === lastEssenceSystemId) return;
    selectedEssenceId = '';
    essenceEditDirty = false;
    essenceEditSaving = false;
    essenceEditDraft = null;
    lastEssenceSystemId = selectedSystemId;
  });

  $effect(() => {
    if (selectedSystemId === lastGatheringSystemId) return;
    activeGatheringTab = 'environments';
    lastGatheringSystemId = selectedSystemId;
  });

  $effect(() => {
    if (activeGatheringTab === 'environments') return;
    if (currentView === 'environments' && canShowEnvironments) return;
    activeGatheringTab = 'environments';
  });

  $effect(() => {
    services?.registerEssenceDirtyGuard?.(() => confirmEssenceRouteExit('close'));
    return () => services?.registerEssenceDirtyGuard?.(null);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
  }

  function resolutionModeLabel(mode) {
    const labels = {
      simple: text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple'),
      routed: text('FABRICATE.Admin.ManagerV2.ResolutionRouted', 'Routed'),
      mapped: text('FABRICATE.Admin.ManagerV2.ResolutionMappedLegacy', 'Legacy routed'),
      tiered: text('FABRICATE.Admin.ManagerV2.ResolutionTieredLegacy', 'Legacy routed by check'),
      progressive: text('FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'),
      alchemy: text('FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy')
    };
    return labels[mode] || mode || text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple');
  }

  function featureLabels(system) {
    if (!system?.features) return [];
    const featureMap = [
      ['gathering', 'FABRICATE.Admin.ManagerV2.Feature.Gathering', 'Gathering'],
      ['essences', 'FABRICATE.Admin.ManagerV2.Feature.Essences', 'Essences'],
      ['complexRecipes', 'FABRICATE.Admin.ManagerV2.Feature.ComplexRecipes', 'Complex recipes'],
      ['multiStepRecipes', 'FABRICATE.Admin.ManagerV2.Feature.MultiStepRecipes', 'Multi-step recipes'],
      ['craftingChecks', 'FABRICATE.Admin.ManagerV2.Feature.CraftingChecks', 'Crafting checks'],
      ['outcomeRouting', 'FABRICATE.Admin.ManagerV2.Feature.OutcomeRouting', 'Outcome routing'],
      ['effectTransfer', 'FABRICATE.Admin.ManagerV2.Feature.EffectTransfer', 'Effect transfer'],
      ['propertyMacros', 'FABRICATE.Admin.ManagerV2.Feature.PropertyMacros', 'Property macros']
    ];
    return featureMap
      .filter(([key]) => system.features[key] === true)
      .map(([, key, fallback]) => text(key, fallback));
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function buildSelectedCountFacts(counts) {
    const offLabel = text('FABRICATE.Admin.ManagerV2.Off', 'Off');
    return [
      {
        id: 'components',
        label: text('FABRICATE.Admin.ManagerV2.Column.Components', 'Components'),
        value: counts.components
      },
      {
        id: 'recipes',
        label: text('FABRICATE.Admin.ManagerV2.Column.Recipes', 'Recipes'),
        value: counts.recipes
      },
      counts.environments == null
        ? {
          id: 'environments',
          label: text('FABRICATE.Admin.ManagerV2.GatheringEnvironments', 'Gathering environments'),
          value: offLabel,
          isOff: true
        }
        : {
          id: 'environments',
          label: text('FABRICATE.Admin.ManagerV2.GatheringEnvironments', 'Gathering environments'),
          value: counts.environments
        },
      {
        id: 'essences',
        label: text('FABRICATE.Admin.ManagerV2.Nav.Essences', 'Essences'),
        value: counts.essences
      },
      {
        id: 'item-tags',
        label: text('FABRICATE.Admin.ManagerV2.Feature.ItemTags', 'Item tags'),
        value: counts.itemTags
      },
      {
        id: 'recipe-categories',
        label: text('FABRICATE.Admin.ManagerV2.Feature.RecipeCategories', 'Recipe categories'),
        value: counts.recipeCategories
      }
    ];
  }

  function normalizedActiveView(view, system, environmentsAvailable, essencesAvailable) {
    if (!system) return 'systems';
    if ((view === 'environments' || view === 'environment-edit') && !environmentsAvailable) return 'systems';
    if ((view === 'essences' || view === 'essence-edit') && !essencesAvailable) return 'systems';
    return view;
  }

  function componentTagOptionsFor(item) {
    if (!selectedSystem || !item) return [];
    return buildComponentEditorState(selectedSystem, item).tagOptions || [];
  }

  function componentEssenceOptionsFor(item) {
    if (!selectedSystem || !item) return [];
    return buildComponentEditorState(selectedSystem, item).essenceOptions || [];
  }

  function componentShowTagsFor(item) {
    if (!selectedSystem || !item) return false;
    return buildComponentEditorState(selectedSystem, item).showTags === true;
  }

  function componentShowEssencesFor(item) {
    if (!selectedSystem || !item) return false;
    return buildComponentEditorState(selectedSystem, item).showEssences === true;
  }

  function viewTitle() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.ManagerV2.Recipe.Title', 'Recipes');
    if (currentView === 'components') return text('FABRICATE.Admin.ManagerV2.Component.Title', 'Components');
    if (currentView === 'component-edit') return text('FABRICATE.Admin.ManagerV2.Component.EditTitle', 'Edit component');
    if (currentView === 'tags') return text('FABRICATE.Admin.ManagerV2.TagsCategories.Title', 'Tags & Categories');
    if (currentView === 'essences') return text('FABRICATE.Admin.ManagerV2.Essence.Title', 'Essences');
    if (currentView === 'essence-edit') return isCreatingEssenceDraft
      ? text('FABRICATE.Admin.ManagerV2.Essence.CreateTitle', 'Create essence')
      : text('FABRICATE.Admin.ManagerV2.Essence.EditTitle', 'Edit essence');
    if (currentView === 'environments') return text('FABRICATE.Admin.ManagerV2.Environment.Title', 'Environments');
    if (currentView === 'environment-edit') return text('FABRICATE.Admin.ManagerV2.Environment.EditTitle', 'Edit environment');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.ManagerV2.SystemEdit.Title', 'System settings');
    return text('FABRICATE.Admin.ManagerV2.Title', 'Crafting systems');
  }

  function viewSubtitle() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.ManagerV2.Recipe.Subtitle', 'Manage recipes for the selected crafting system.');
    if (currentView === 'components') return text('FABRICATE.Admin.ManagerV2.Component.Subtitle', 'Manage item-backed components for the selected crafting system.');
    if (currentView === 'component-edit') return text('FABRICATE.Admin.ManagerV2.Component.EditSubtitle', 'Update tags, essences, and source linkage for this component.');
    if (currentView === 'tags') return text('FABRICATE.Admin.ManagerV2.TagsCategories.Subtitle', 'Manage recipe category and item tag vocabulary for the selected crafting system.');
    if (currentView === 'essences') return text('FABRICATE.Admin.ManagerV2.Essence.Subtitle', 'Manage essence definitions for the selected crafting system.');
    if (currentView === 'essence-edit' && isCreatingEssenceDraft && showEssenceSourceUi) return text('FABRICATE.Admin.ManagerV2.Essence.CreateSubtitle', 'Define identity, icon, and source linkage for a new essence.');
    if (currentView === 'essence-edit' && isCreatingEssenceDraft) return text('FABRICATE.Admin.ManagerV2.Essence.CreateNoSourceSubtitle', 'Define identity and icon for a new essence.');
    if (currentView === 'essence-edit' && showEssenceSourceUi) return text('FABRICATE.Admin.ManagerV2.Essence.EditSubtitle', 'Update identity, icon, and source linkage for this essence.');
    if (currentView === 'essence-edit') return text('FABRICATE.Admin.ManagerV2.Essence.EditNoSourceSubtitle', 'Update identity and icon for this essence.');
    if (currentView === 'environments') return text('FABRICATE.Admin.ManagerV2.Environment.Subtitle', 'Manage gathering environments for the selected crafting system.');
    if (currentView === 'environment-edit') return text('FABRICATE.Admin.ManagerV2.Environment.EditSubtitle', 'Edit scene linkage, environment details, tasks, results, catalysts, visibility, timing, and validation in the v2 workspace.');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.ManagerV2.SystemEdit.Subtitle', 'Edit base settings for the selected crafting system without leaving manager v2.');
    return text('FABRICATE.Admin.ManagerV2.Subtitle', 'Manage the system definitions that organize Fabricate components, recipes, gathering, and feature rules.');
  }

  function isViewAvailableForSystem(view, system) {
    if (!view.feature) return true;
    return system?.features?.[view.feature] === true;
  }

  function isSelectedRecipe(recipe) {
    return selectedRecipe?.id === recipe.id;
  }

  function isPromise(value) {
    return value && typeof value.then === 'function';
  }

  function afterTruthyResult(result, callback) {
    if (isPromise(result)) {
      return result.then(value => {
        if (value !== false) callback();
        return value;
      });
    }
    if (result !== false) callback();
    return result;
  }

  function finishEnvironmentRouteExit(confirmed) {
    if (confirmed === false) return false;
    const cancelled = store.cancelEnvironmentDraft?.();
    if (isPromise(cancelled)) return cancelled.then(() => true);
    return true;
  }

  function finishEssenceRouteExit(confirmed) {
    if (confirmed === false) return false;
    essenceEditDirty = false;
    essenceEditDraft = null;
    return true;
  }

  function finishComponentRouteExit(confirmed) {
    if (confirmed === false) return false;
    componentEditDirty = false;
    componentEditDraft = null;
    return true;
  }

  function confirmComponentRouteExit(nextView) {
    if (activeView !== 'component-edit') return true;
    if (componentEditDirty !== true) return true;
    const message = text(
      'FABRICATE.Admin.ManagerV2.Component.DiscardDirtyContent',
      'The current component has unsaved changes. Discard them and continue?'
    );
    const confirmed = services?.confirmDiscardComponentDraft?.()
      ?? (typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : false);
    if (isPromise(confirmed)) return confirmed.then(finishComponentRouteExit);
    return finishComponentRouteExit(confirmed);
  }

  function confirmEnvironmentRouteExit(nextView) {
    if (activeView !== 'environment-edit' || nextView === 'environment-edit') return true;
    if ($viewState.environmentDraftDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyEnvironmentDraft?.();
    if (isPromise(confirmed)) return confirmed.then(finishEnvironmentRouteExit);
    return finishEnvironmentRouteExit(confirmed);
  }

  function confirmEssenceRouteExit(nextView) {
    if (activeView !== 'essence-edit') return true;
    if (essenceEditDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyEssenceDraft?.()
      ?? services?.confirmDiscardEssenceDraft?.()
      ?? (typeof globalThis.confirm === 'function'
        ? globalThis.confirm(text('FABRICATE.Admin.ManagerV2.Essence.DiscardDirtyContent', 'The current essence has unsaved changes. Discard them and continue?'))
        : false);
    if (isPromise(confirmed)) return confirmed.then(finishEssenceRouteExit);
    return finishEssenceRouteExit(confirmed);
  }

  function confirmRouteExit(nextView) {
    const environmentConfirmed = confirmEnvironmentRouteExit(nextView);
    if (isPromise(environmentConfirmed)) {
      return environmentConfirmed.then(value => {
        if (value === false) return false;
        const essenceResult = confirmEssenceRouteExit(nextView);
        if (isPromise(essenceResult)) {
          return essenceResult.then(essenceValue => essenceValue === false ? false : confirmComponentRouteExit(nextView));
        }
        return essenceResult === false ? false : confirmComponentRouteExit(nextView);
      });
    }
    if (environmentConfirmed === false) return false;
    const essenceResult = confirmEssenceRouteExit(nextView);
    if (isPromise(essenceResult)) {
      return essenceResult.then(value => value === false ? false : confirmComponentRouteExit(nextView));
    }
    if (essenceResult === false) return false;
    return confirmComponentRouteExit(nextView);
  }

  function setView(view) {
    if ((view === 'recipes' || view === 'components' || view === 'component-edit' || view === 'tags' || view === 'system-edit') && !selectedSystem) return;
    if ((view === 'environments' || view === 'environment-edit') && !canShowEnvironments) return;
    if ((view === 'essences' || view === 'essence-edit') && !canShowEssences) return;
    afterTruthyResult(confirmRouteExit(view), () => { activeView = view; });
  }

  function selectSystem(systemId, nextView = 'systems') {
    const runSelection = () => {
      const selected = store.selectSystem?.(systemId);
      if (isPromise(selected)) return selected.then(value => value !== false);
      return selected !== false;
    };
    if (systemId === selectedSystemId) {
      const confirmed = confirmRouteExit(nextView);
      if (isPromise(confirmed)) return confirmed.then(value => value === false ? false : runSelection());
      if (confirmed === false) return false;
    }
    return runSelection();
  }

  function selectSystemAndShowBrowser(systemId = selectedSystemId) {
    const selected = systemId ? selectSystem(systemId, 'systems') : confirmRouteExit('systems');
    afterTruthyResult(selected, () => { activeView = 'systems'; });
  }

  function editSystem(systemId) {
    if (!systemId) return;
    afterTruthyResult(selectSystem(systemId, 'system-edit'), () => { activeView = 'system-edit'; });
  }

  function backToSystemsBrowser() {
    afterTruthyResult(confirmRouteExit('systems'), () => { activeView = 'systems'; });
  }

  function backToEnvironmentsBrowse() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeView = canShowEnvironments ? 'environments' : 'systems';
    });
  }

  function backToEssencesBrowse() {
    afterTruthyResult(confirmRouteExit('essences'), () => {
      activeView = canShowEssences ? 'essences' : 'systems';
    });
  }

  function cancelEnvironmentEdit() {
    const cancelled = store.cancelEnvironmentDraft?.();
    afterTruthyResult(cancelled, () => {
      activeView = canShowEnvironments ? 'environments' : 'systems';
    });
  }

  function saveEnvironmentEdit() {
    store.saveEnvironmentDraft?.();
  }

  function essenceEditSaveLabel() {
    if (essenceEditSaving) return text('FABRICATE.Admin.ManagerV2.Essence.Saving', 'Saving...');
    return isCreatingEssenceDraft
      ? text('FABRICATE.Admin.ManagerV2.Essence.Create', 'Create essence')
      : text('FABRICATE.Admin.ManagerV2.Essence.Save', 'Save essence');
  }


  function selectRecipe(recipeId) {
    selectedRecipeId = recipeId;
  }

  function selectComponent(componentId) {
    selectedComponentId = componentId;
  }

  function selectEssence(essenceId) {
    selectedEssenceId = essenceId;
  }

  function createEssenceDraft() {
    if (!canShowEssences) return;
    afterTruthyResult(confirmRouteExit('essence-edit'), () => {
      selectedEssenceId = '';
      essenceEditDirty = false;
      essenceEditDraft = null;
      activeView = 'essence-edit';
    });
  }

  function editEssence(essenceId = selectedEssence?.id) {
    if (!essenceId || !canShowEssences) return;
    if (currentView === 'essence-edit' && essenceId === selectedEssenceId) return;
    afterTruthyResult(confirmRouteExit('essence-edit'), () => {
      selectedEssenceId = essenceId;
      essenceEditDirty = false;
      essenceEditDraft = null;
      activeView = 'essence-edit';
    });
  }

  function selectSystemRow(systemId) {
    if (!systemId) return;
    selectSystem(systemId);
  }

  function createSystem() {
    store.createSystem?.();
  }

  function importSystem() {
    store.importSystem?.();
  }

  function exportSystem(systemId = selectedSystemId) {
    if (!systemId) return;
    store.exportSystem?.(systemId);
  }

  function deleteSystem(systemId = selectedSystemId) {
    if (!systemId) return;
    store.deleteSystem?.(systemId);
  }

  function createRecipe() {
    store.createRecipe?.();
  }

  function importRecipes() {
    store.importRecipes?.();
  }

  function exportRecipes() {
    store.exportRecipes?.();
  }

  function editRecipe(recipeId = selectedRecipe?.id) {
    if (!recipeId) return;
    services?.onEditRecipe?.(recipeId);
  }

  function duplicateRecipe(recipeId = selectedRecipe?.id) {
    if (!recipeId) return;
    store.duplicateRecipe?.(recipeId);
  }

  function deleteRecipe(recipeId = selectedRecipe?.id) {
    if (!recipeId) return;
    store.deleteRecipe?.(recipeId);
  }

  function toggleRecipeEnabled(recipeId, enabled) {
    store.toggleRecipeEnabled?.(recipeId, enabled);
  }

  function dropComponent(data) {
    services?.onDropItem?.(data);
  }

  function editComponent(itemId = selectedComponent?.id) {
    if (!itemId || !selectedSystem) return;
    if (currentView === 'component-edit' && itemId === selectedComponentId) return;
    afterTruthyResult(confirmRouteExit('component-edit'), () => {
      selectedComponentId = itemId;
      componentEditDirty = false;
      componentEditDraft = null;
      activeView = 'component-edit';
    });
  }

  function backToComponentsBrowse() {
    afterTruthyResult(confirmRouteExit('components'), () => { activeView = 'components'; });
  }

  function cancelComponentEdit() {
    backToComponentsBrowse();
  }

  function handleComponentDraftChange(draft) {
    componentEditDraft = draft || null;
    componentEditDirty = draft?.dirty === true;
  }

  async function saveComponentEdit(itemId, updates) {
    if (componentEditSaving || !itemId) return false;
    componentEditSaving = true;
    try {
      const result = await store.updateComponent?.(itemId, updates);
      if (result === false) return false;
      componentEditDirty = false;
      componentEditDraft = null;
      activeView = 'components';
      return true;
    } catch (err) {
      return false;
    } finally {
      componentEditSaving = false;
    }
  }

  function replaceComponentSource(itemId, data) {
    if (!itemId) return;
    services?.onReplaceSource?.(itemId, data);
  }

  function unlinkComponentSource(itemId = selectedComponent?.id) {
    if (!itemId) return;
    services?.onUnlinkSource?.(itemId);
  }

  function openComponentSource(uuid = selectedComponent?.sourceUuidDisplay) {
    if (!uuid) return;
    services?.onOpenSource?.(uuid);
  }

  function componentEditSaveLabel() {
    if (componentEditSaving) return text('FABRICATE.Admin.ManagerV2.Component.Saving', 'Saving...');
    return text('FABRICATE.Admin.ManagerV2.Component.SaveComponent', 'Save Component');
  }

  function deleteComponent(itemId = selectedComponent?.id) {
    if (!itemId) return;
    store.deleteComponent?.(itemId);
  }

  function addCategory(value) {
    if (!selectedSystemId) return;
    return store.addCategory?.(value);
  }

  function removeCategory(category) {
    if (!selectedSystemId) return;
    return store.removeCategory?.(category);
  }

  function addTag(value) {
    if (!selectedSystemId) return;
    return store.addTag?.(value);
  }

  function removeTag(tag) {
    if (!selectedSystemId) return;
    return store.removeTag?.(tag);
  }

  function confirmTagCategoryRemoval(kind, row) {
    if (!row || (row.totalUsage || 0) <= 0) return true;
    const messageKey = kind === 'category'
      ? 'FABRICATE.Admin.ManagerV2.TagsCategories.RemoveCategoryConfirm'
      : 'FABRICATE.Admin.ManagerV2.TagsCategories.RemoveTagConfirm';
    const fallback = kind === 'category'
      ? 'Remove {name}? {count} references may keep this category value until you update them.'
      : 'Remove {name}? {count} references may keep this tag value until you update them.';
    const message = text(messageKey, fallback)
      .replace('{name}', row.name)
      .replace('{count}', row.totalUsage || 0);
    if (services?.confirmVocabularyRemoval) return services.confirmVocabularyRemoval(kind, row, message) !== false;
    if (typeof globalThis.confirm === 'function') return globalThis.confirm(message);
    return false;
  }

  async function saveEssenceEdit(essenceId, updates) {
    if (essenceEditSaving) return false;
    essenceEditSaving = true;
    try {
      const result = essenceId
        ? await store.updateEssence?.(essenceId, updates)
        : await store.addEssence?.(
          updates.name,
          updates.description,
          updates.icon,
          showEssenceSourceUi ? updates.sourceComponentId || null : null
        );
      if (result === false) return false;
      essenceEditDirty = false;
      essenceEditDraft = null;
      activeView = canShowEssences ? 'essences' : 'systems';
      return result;
    } catch (err) {
      return false;
    } finally {
      essenceEditSaving = false;
    }
  }

  function cancelEssenceEdit() {
    afterTruthyResult(confirmRouteExit('essences'), () => {
      activeView = canShowEssences ? 'essences' : 'systems';
    });
  }

  function handleEssenceDraftChange(draft) {
    essenceEditDraft = draft || null;
    essenceEditDirty = draft?.dirty === true;
  }

  function removeEssence(essenceId = selectedEssence?.id) {
    if (!essenceId) return;
    const essence = essenceCards.find(card => card.id === essenceId);
    if (essence?.deleteBlocked) return;
    store.removeEssence?.(essenceId);
  }

  function importEssenceSourceDrop(data) {
    return services?.importSingleManagedItemFromDrop?.(data) ?? null;
  }

  async function updateSelectedEssenceSource(sourceComponentId) {
    if (!selectedEssenceForInspector?.id || currentView === 'essence-edit') return false;
    return store.updateEssence?.(selectedEssenceForInspector.id, { sourceComponentId });
  }

  async function handleInspectorEssenceSourceDrop(data) {
    const item = await importEssenceSourceDrop(data);
    if (!item?.id) return false;
    return updateSelectedEssenceSource(item.id);
  }

  function handleInspectorEssenceSourceSelect(itemId) {
    return updateSelectedEssenceSource(itemId || null);
  }

  function unlinkSelectedEssenceSource() {
    return updateSelectedEssenceSource(null);
  }

  function selectEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId) return;
    store.selectEnvironment?.(environmentId);
  }

  function editEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId || !canShowEnvironments) return;
    afterTruthyResult(store.selectEnvironment?.(environmentId), () => { activeView = 'environment-edit'; });
  }

  function createEnvironment() {
    if (!canShowEnvironments) return;
    const created = store.createEnvironmentDraft?.();
    if (isPromise(created)) {
      created.then(value => {
        if (value !== false && value !== null) activeView = 'environment-edit';
      });
      return;
    }
    if (created !== false && created !== null) activeView = 'environment-edit';
  }

  function toggleEnvironmentEnabled(environmentId, enabled) {
    if (!environmentId) return;
    store.toggleEnvironmentEnabled?.(environmentId, enabled);
  }

  function duplicateEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId) return;
    store.duplicateEnvironmentDraft?.(environmentId);
  }

  function deleteEnvironment(environmentId = selectedEnvironment?.id) {
    if (!environmentId) return;
    store.deleteEnvironmentDraft?.(environmentId);
  }

  function moveEnvironment(environmentId = selectedEnvironment?.id, direction) {
    if (!environmentId || !direction) return;
    store.moveEnvironmentDraft?.(environmentId, direction);
  }

  function selectGatheringTab(tabId) {
    activeGatheringTab = gatheringInspectorTabs.some(tab => tab.id === tabId) ? tabId : 'environments';
  }

  function environmentListIndex(environmentId) {
    return environmentList.findIndex(environment => environment.id === environmentId);
  }

  function canMoveEnvironmentUp(environmentId) {
    return environmentListIndex(environmentId) > 0;
  }

  function canMoveEnvironmentDown(environmentId) {
    const index = environmentListIndex(environmentId);
    return index >= 0 && index < environmentList.length - 1;
  }

  function copyComponentSource(uuid = selectedComponent?.sourceUuidDisplay) {
    if (!uuid) return;
    services?.onCopySourceUuid?.(uuid);
  }

  function selectedEssenceSourceUuid() {
    if (!selectedEssenceForInspector?.associatedItem) return '';
    return selectedEssenceForInspector.sourceItemUuid || selectedEssenceForInspector.associatedItem.sourceItemUuid || '';
  }

  function copySelectedEssenceSource() {
    const uuid = selectedEssenceSourceUuid();
    if (!uuid) return;
    services?.onCopySourceUuid?.(uuid);
  }

  function openCurrentAdmin() {
    services?.openCurrentAdmin?.();
  }

  function ingredientCount(recipe) {
    return recipe?.ingredientCount ?? recipe?.ingredients?.length ?? 0;
  }

  function catalystCount(recipe) {
    return recipe?.catalystCount ?? recipe?.catalysts?.length ?? 0;
  }

  function stepCount(recipe) {
    return recipe?.stepCount ?? 0;
  }

  function resultGroupCount(recipe) {
    return recipe?.resultGroupCount ?? 0;
  }

  function structureLabel(recipe) {
    const labels = {
      multiStep: text('FABRICATE.Admin.ManagerV2.Recipe.MultiStep', 'Multi-step'),
      singleStep: text('FABRICATE.Admin.ManagerV2.Recipe.SingleStep', 'Single step'),
      simple: text('FABRICATE.Admin.ManagerV2.Recipe.Simple', 'Simple')
    };
    return labels[recipe?.structureKey] || (recipe?.isSimple
      ? text('FABRICATE.Admin.ManagerV2.Recipe.Simple', 'Simple')
      : text('FABRICATE.Admin.ManagerV2.Recipe.Advanced', 'Advanced'));
  }

  function stepRequirementSummary(step) {
    if (!step) return text('FABRICATE.Admin.ManagerV2.Recipe.NoRequirements', 'No requirements');
    if (step.hasAlternatives) {
      return text('FABRICATE.Admin.ManagerV2.Recipe.AlternativeSets', '{count} alternative sets')
        .replace('{count}', step.ingredientSetCount || step.ingredientSetSummaries?.length || 0);
    }
    const ingredients = step.ingredientCount || 0;
    const catalysts = step.catalystCount || 0;
    const ingredientLabel = formatCount(
      'FABRICATE.Admin.ManagerV2.Recipe.Ingredient',
      'ingredient',
      'FABRICATE.Admin.ManagerV2.Recipe.Ingredients',
      'ingredients',
      ingredients
    );
    if (catalysts <= 0) return ingredientLabel;
    const catalystLabel = formatCount(
      'FABRICATE.Admin.ManagerV2.Recipe.Catalyst',
      'catalyst',
      'FABRICATE.Admin.ManagerV2.Recipe.Catalysts',
      'catalysts',
      catalysts
    );
    return `${ingredientLabel}, ${catalystLabel}`;
  }

  function requirementsSummary(recipe) {
    const steps = Array.isArray(recipe?.requirementsPreview) ? recipe.requirementsPreview : [];
    if (steps.length > 1) {
      return text('FABRICATE.Admin.ManagerV2.Recipe.StepRequirements', '{count} steps')
        .replace('{count}', steps.length);
    }
    if (steps.length === 1) return stepRequirementSummary(steps[0]);
    return stepRequirementSummary({
      ingredientCount: ingredientCount(recipe),
      catalystCount: catalystCount(recipe),
      ingredientSetCount: 1
    });
  }

  function requirementsPreviewItems(recipe) {
    const steps = Array.isArray(recipe?.requirementsPreview) ? recipe.requirementsPreview : [];
    if (steps.length > 0) {
      return steps.map(step => ({
        id: step.id,
        label: step.name,
        value: stepRequirementSummary(step)
      }));
    }
    return [
      {
        id: 'ingredients',
        label: text('FABRICATE.Admin.ManagerV2.Recipe.Ingredients', 'ingredients'),
        value: ingredientCount(recipe)
      },
      {
        id: 'catalysts',
        label: text('FABRICATE.Admin.ManagerV2.Recipe.Catalysts', 'catalysts'),
        value: catalystCount(recipe)
      }
    ];
  }

  function recipeImage(recipe) {
    return recipe?.img || 'icons/svg/item-bag.svg';
  }

  function componentImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function environmentName(environment) {
    const explicitName = typeof environment?.name === 'string' ? environment.name.trim() : '';
    if (explicitName) return explicitName;
    const firstTaskName = Array.isArray(environment?.tasks) && typeof environment.tasks[0]?.name === 'string'
      ? environment.tasks[0].name.trim()
      : '';
    if (firstTaskName) return `${text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment')} - ${firstTaskName}`;
    return text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment');
  }

  function environmentImage(environment) {
    const linkedScene = linkedSceneForEnvironment(environment);
    return linkedScene?.background?.src || linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb || 'icons/svg/item-bag.svg';
  }

  function hasEnvironmentSceneImage(environment) {
    const linkedScene = linkedSceneForEnvironment(environment);
    return Boolean(linkedScene?.background?.src || linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb);
  }

  function linkedSceneForEnvironment(environment) {
    const sceneUuid = environment?.sceneUuid || '';
    if (!sceneUuid) return null;
    return (selectedSystem?.sceneOptions || []).find(scene => scene.uuid === sceneUuid) || null;
  }

  function environmentSelectionModeLabel(environment) {
    return environment?.selectionMode === 'blind'
      ? text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')
      : text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted');
  }

  function environmentStatusLabel(environment) {
    return environment?.enabled === false
      ? text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled')
      : text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active');
  }

  function environmentSceneState(environment) {
    if (!environment?.sceneUuid) {
      return {
        id: 'none',
        label: text('FABRICATE.Admin.ManagerV2.Environment.SceneNone', 'No scene'),
        className: 'is-disabled'
      };
    }
    const scene = linkedSceneForEnvironment(environment);
    if (!scene) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.ManagerV2.Environment.SceneMissing', 'Scene unresolved'),
        className: 'is-warning'
      };
    }
    return {
      id: 'linked',
      label: text('FABRICATE.Admin.ManagerV2.Environment.SceneLinked', 'Linked scene'),
      name: scene.name || environment.sceneUuid,
      className: 'is-active'
    };
  }

  function environmentTaskCount(environment) {
    return Array.isArray(environment?.tasks) ? environment.tasks.length : 0;
  }

  function environmentResultCount(environment) {
    return (Array.isArray(environment?.tasks) ? environment.tasks : []).reduce((total, task) => {
      return total + (Array.isArray(task?.resultGroups) ? task.resultGroups : [])
        .reduce((groupTotal, group) => groupTotal + (Array.isArray(group?.results) ? group.results.length : 0), 0);
    }, 0);
  }

  function environmentCatalystCount(environment) {
    return (Array.isArray(environment?.tasks) ? environment.tasks : [])
      .reduce((total, task) => total + (Array.isArray(task?.catalysts) ? task.catalysts.length : 0), 0);
  }

  function environmentFacts(environment) {
    if (!environment) return [];
    return [
      {
        id: 'tasks',
        label: text('FABRICATE.Admin.Environments.Tasks', 'Tasks'),
        value: environmentTaskCount(environment)
      },
      {
        id: 'results',
        label: text('FABRICATE.Admin.Environments.Results', 'Results'),
        value: environmentResultCount(environment)
      },
      {
        id: 'catalysts',
        label: text('FABRICATE.Admin.Environments.Catalysts', 'Catalysts'),
        value: environmentCatalystCount(environment)
      },
      {
        id: 'mode',
        label: text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode'),
        value: environmentSelectionModeLabel(environment)
      }
    ];
  }

  function environmentDirtyFor(environment) {
    return environment?.id && $viewState.environmentDraft?.id === environment.id && $viewState.environmentDraftDirty === true;
  }

  function environmentInvalidFor(environment) {
    return environment?.id && $viewState.environmentDraft?.id === environment.id && environmentValidationCount > 0;
  }

  function environmentDisplay(environment) {
    if (!environment) return null;
    if (shouldUseEnvironmentDraftForDisplay && environmentDraftForDisplay?.id === environment.id) {
      return environmentDraftForDisplay;
    }
    return environment;
  }

  function componentSourceState(item) {
    if (item?.sourceMissing) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.ManagerV2.Component.SourceOriginMissing', 'Missing'),
        className: 'is-warning'
      };
    }
    if (item?.sourceOrigin === 'compendium') {
      return {
        id: 'compendium',
        label: item.sourceOriginLabel || text('FABRICATE.Admin.ManagerV2.Component.SourceOriginCompendium', 'Compendium'),
        className: 'is-active'
      };
    }
    if (item?.sourceOrigin === 'world') {
      return {
        id: 'world',
        label: item.sourceOriginLabel || text('FABRICATE.Admin.ManagerV2.Component.SourceOriginWorld', 'Items Directory'),
        className: 'is-active'
      };
    }
    return {
      id: 'unknown',
      label: item?.sourceOriginLabel || text('FABRICATE.Admin.ManagerV2.Component.SourceOriginUnknown', 'Unknown'),
      className: 'is-disabled'
    };
  }

  function componentEvidenceItems(item) {
    const evidence = [];
    if (!item) return evidence;
    if (Object.prototype.hasOwnProperty.call(item, 'difficulty')) {
      evidence.push({
        id: 'difficulty',
        label: text('FABRICATE.Admin.ManagerV2.Component.ProgressiveDifficulty', 'Progressive difficulty'),
        value: item.difficulty
      });
    }
    if (item.salvageSummary) {
      evidence.push({
        id: 'salvage',
        label: text('FABRICATE.Admin.ManagerV2.Component.Salvage', 'Salvage'),
        value: salvageSummaryLabel(item.salvageSummary)
      });
    }
    for (const fact of usageEvidenceItems(item)) {
      evidence.push(fact);
    }
    return evidence;
  }

  function usageEvidenceItems(item) {
    if (!item?.usageCounts || typeof item.usageCounts !== 'object') return [];
    const labels = {
      ingredient: text('FABRICATE.Admin.ManagerV2.Component.UsageIngredient', 'Ingredient usage'),
      result: text('FABRICATE.Admin.ManagerV2.Component.UsageResult', 'Result usage'),
      catalyst: text('FABRICATE.Admin.ManagerV2.Component.UsageCatalyst', 'Catalyst usage'),
      gathering: text('FABRICATE.Admin.ManagerV2.Component.UsageGathering', 'Gathering usage'),
      salvage: text('FABRICATE.Admin.ManagerV2.Component.UsageSalvage', 'Salvage usage')
    };
    return Object.entries(item.usageCounts)
      .filter(([, count]) => Number.isFinite(Number(count)))
      .map(([key, count]) => ({
        id: `usage-${key}`,
        label: labels[key] || key,
        value: Number(count)
      }));
  }

  function salvageSummaryLabel(summary) {
    const parts = [
      text('FABRICATE.Admin.ManagerV2.Component.SalvageQuantity', '{count} required')
        .replace('{count}', summary.quantityRequired ?? 1)
    ];
    if (summary.catalystCount > 0) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageCatalysts', '{count} catalysts').replace('{count}', summary.catalystCount));
    if (summary.resultGroupCount > 0) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageResults', '{count} result groups').replace('{count}', summary.resultGroupCount));
    if (summary.outcomeCount > 0) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageOutcomes', '{count} outcomes').replace('{count}', summary.outcomeCount));
    if (summary.hasTimeRequirement) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageTime', 'time'));
    if (summary.hasCurrencyRequirement) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageCost', 'cost'));
    return parts.join(', ');
  }

  function stackedLabel(key, fallback) {
    return `${text(key, fallback)}:`;
  }

  function normalizeVocabularyKey(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'general';
  }

  function buildTagCategoryUsage(system, recipes, items) {
    const categoryUsage = new Map();
    const tagUsage = new Map();
    for (const recipe of recipes || []) {
      const categoryKey = normalizeVocabularyKey(recipe?.category);
      categoryUsage.set(categoryKey, (categoryUsage.get(categoryKey) || 0) + 1);
    }
    for (const item of items || []) {
      for (const tag of item?.tags || []) {
        const tagKey = normalizeVocabularyKey(tag);
        tagUsage.set(tagKey, (tagUsage.get(tagKey) || 0) + 1);
      }
    }
    return {
      categoryUsage,
      tagUsage,
      categoryReferenceCount: Array.from(categoryUsage.values()).reduce((sum, count) => sum + count, 0),
      tagReferenceCount: Array.from(tagUsage.values()).reduce((sum, count) => sum + count, 0)
    };
  }

  function buildCategoryRows(categories, usage) {
    const generalName = text('FABRICATE.Admin.ManagerV2.Recipe.General', 'General');
    const customRows = uniqueSorted(categories || []).map(category => {
      const key = normalizeVocabularyKey(category);
      const recipeUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'category',
        name: category,
        recipeUsageCount,
        totalUsage: recipeUsageCount,
        locked: false
      };
    });
    return [
      {
        id: 'general',
        kind: 'category',
        name: generalName,
        recipeUsageCount: usage.get('general') || 0,
        totalUsage: usage.get('general') || 0,
        locked: true
      },
      ...customRows
    ];
  }

  function buildTagRows(tags, usage) {
    return uniqueSorted(tags || []).map(tag => {
      const key = normalizeVocabularyKey(tag);
      const componentUsageCount = usage.get(key) || 0;
      return {
        id: key,
        kind: 'tag',
        name: tag,
        componentUsageCount,
        totalUsage: componentUsageCount
      };
    });
  }

  function countLabelParts(label) {
    const normalized = String(label ?? '').trim().replace(/\s+/g, ' ');
    const firstSpace = normalized.indexOf(' ');
    if (firstSpace === -1) return { lead: normalized, rest: '' };
    return {
      lead: normalized.slice(0, firstSpace),
      rest: normalized.slice(firstSpace + 1)
    };
  }

</script>

<div class="fabricate-manager-v2" data-manager-v2-view={currentView}>
  <header class="manager-v2-header">
    <div class="manager-v2-heading">
      <nav class="manager-v2-breadcrumbs" aria-label={text('FABRICATE.Admin.ManagerV2.Breadcrumbs', 'Breadcrumbs')}>
        <button type="button" onclick={() => selectSystemAndShowBrowser()}>{text('FABRICATE.Admin.ManagerV2.Nav.Systems', 'Crafting Systems')}</button>
        {#if selectedSystem && currentView !== 'systems'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => editSystem(selectedSystem.id)}>{selectedSystem.name}</button>
        {/if}
        {#if currentView === 'recipes'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Nav.Recipes', 'Recipes')}</span>
        {/if}
        {#if currentView === 'components'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Nav.Components', 'Components')}</span>
        {/if}
        {#if currentView === 'tags'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Nav.TagsCategories', 'Tags & Categories')}</span>
        {/if}
        {#if currentView === 'essences'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Nav.Essences', 'Essences')}</span>
        {/if}
        {#if currentView === 'essence-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToEssencesBrowse}>{text('FABRICATE.Admin.ManagerV2.Nav.Essences', 'Essences')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{isCreatingEssenceDraft
            ? text('FABRICATE.Admin.ManagerV2.Essence.CreateBreadcrumb', 'Create essence')
            : text('FABRICATE.Admin.ManagerV2.Essence.EditBreadcrumb', 'Edit essence')}</span>
        {/if}
        {#if currentView === 'component-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToComponentsBrowse}>{text('FABRICATE.Admin.ManagerV2.Nav.Components', 'Components')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Component.EditBreadcrumb', 'Edit component')}</span>
        {/if}
        {#if currentView === 'environments'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Nav.Environments', 'Gathering')}</span>
        {/if}
        {#if currentView === 'environment-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToEnvironmentsBrowse}>{text('FABRICATE.Admin.ManagerV2.Nav.Environments', 'Gathering')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.EditBreadcrumb', 'Edit environment')}</span>
        {/if}
        {#if currentView === 'system-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.SystemEdit.Breadcrumb', 'System settings')}</span>
        {/if}
      </nav>
      <h1 class="manager-v2-title">{viewTitle()}</h1>
      <p class="manager-v2-subtitle">{viewSubtitle()}</p>
    </div>
    <div class="manager-v2-header-actions" aria-label={currentView === 'recipes' ? text('FABRICATE.Admin.ManagerV2.Recipe.Actions', 'Recipe actions') : currentView === 'components' || currentView === 'component-edit' ? text('FABRICATE.Admin.ManagerV2.Component.Actions', 'Component actions') : currentView === 'tags' ? text('FABRICATE.Admin.ManagerV2.TagsCategories.Actions', 'Tags and categories actions') : currentView === 'essences' || currentView === 'essence-edit' ? text('FABRICATE.Admin.ManagerV2.Essence.Actions', 'Essence actions') : currentView === 'environments' || currentView === 'environment-edit' ? text('FABRICATE.Admin.ManagerV2.Environment.Actions', 'Environment actions') : currentView === 'system-edit' ? text('FABRICATE.Admin.ManagerV2.SystemEdit.Actions', 'System edit actions') : text('FABRICATE.Admin.ManagerV2.SystemActions', 'System actions')}>
      {#if currentView === 'recipes'}
        <button type="button" class="manager-v2-button" onclick={importRecipes} disabled={!selectedSystemId}>
          <i class="fas fa-file-import" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Import', 'Import')}</span>
        </button>
        <button type="button" class="manager-v2-button" onclick={exportRecipes} disabled={!selectedSystemId}>
          <i class="fas fa-file-export" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Export', 'Export')}</span>
        </button>
        <button type="button" class="manager-v2-button is-primary" onclick={createRecipe} disabled={!selectedSystemId}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Create', 'Create Recipe')}</span>
        </button>
      {:else if currentView === 'components'}
        <button type="button" class="manager-v2-button" onclick={openCurrentAdmin}>
          <i class="fas fa-book" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.OpenCurrentAdmin', 'Open current admin')}</span>
        </button>
      {:else if currentView === 'component-edit'}
        {#if componentEditDirty}
          <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Component.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-v2-button" onclick={cancelComponentEdit} disabled={componentEditSaving}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Component.Cancel', 'Cancel')}</span>
        </button>
        <button type="submit" form="manager-v2-component-edit-form" class="manager-v2-button is-primary" disabled={!canSaveComponentEdit}>
          <i class={componentEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{componentEditSaveLabel()}</span>
        </button>
      {:else if currentView === 'tags'}
        <button type="button" class="manager-v2-button" onclick={openCurrentAdmin}>
          <i class="fas fa-book" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.OpenCurrentAdmin', 'Open current admin')}</span>
        </button>
      {:else if currentView === 'essences'}
        <button type="button" class="manager-v2-button is-primary" onclick={createEssenceDraft}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Essence.Create', 'Create essence')}</span>
        </button>
      {:else if currentView === 'essence-edit'}
        {#if essenceEditDirty}
          <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Essence.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-v2-button" onclick={cancelEssenceEdit} disabled={essenceEditSaving}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Essence.Cancel', 'Cancel')}</span>
        </button>
        <button type="submit" form="manager-v2-essence-edit-form" class="manager-v2-button is-primary" disabled={!canSaveEssenceEdit}>
          <i class={essenceEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{essenceEditSaveLabel()}</span>
        </button>
      {:else if currentView === 'environments'}
        <button type="button" class="manager-v2-button is-primary" onclick={createEnvironment} disabled={!canShowEnvironments}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Create', 'Create environment')}</span>
        </button>
      {:else if currentView === 'environment-edit'}
        {#if $viewState.environmentDraftDirty}
          <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Environment.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-v2-button" onclick={cancelEnvironmentEdit} disabled={$viewState.environmentSaving}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Environments.Cancel', 'Cancel')}</span>
        </button>
        <button type="button" class="manager-v2-button is-primary" onclick={saveEnvironmentEdit} disabled={!$viewState.environmentDraftDirty || $viewState.environmentSaving}>
          <i class={$viewState.environmentSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Environments.Save', 'Save Environment')}</span>
        </button>
      {:else if currentView === 'system-edit'}
        <button type="button" class="manager-v2-button" onclick={backToSystemsBrowser}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.SystemEdit.BackToSystems', 'Back to systems')}</span>
        </button>
        <button type="button" class="manager-v2-button" onclick={openCurrentAdmin}>
          <i class="fas fa-book" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.OpenCurrentAdmin', 'Open current admin')}</span>
        </button>
      {:else}
        <button type="button" class="manager-v2-button" onclick={importSystem}>
          <i class="fas fa-file-import" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Import', 'Import')}</span>
        </button>
        <button type="button" class="manager-v2-button" onclick={() => exportSystem()} disabled={!selectedSystemId}>
          <i class="fas fa-file-export" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Export', 'Export')}</span>
        </button>
        <button type="button" class="manager-v2-button is-primary" onclick={createSystem}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Create', 'Create')}</span>
        </button>
      {/if}
    </div>
  </header>

  <div class="manager-v2-body">
    <aside class="manager-v2-rail" aria-label={text('FABRICATE.Admin.ManagerV2.Navigation', 'Crafting manager navigation')}>
      <section class="manager-v2-rail-block" aria-label={text('FABRICATE.Admin.ManagerV2.ManagerScope', 'Manager scope')}>
        <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Product', 'Fabricate')}</p>
        {#if selectedSystem}
          <div class="manager-v2-scope-card">
            <span class="manager-v2-scope-name" title={selectedSystem.name}>{selectedSystem.name}</span>
            <button
              type="button"
              class="manager-v2-scope-return"
              aria-label={text('FABRICATE.Admin.ManagerV2.ReturnToSystemLibrary', 'Return to System Library')}
              title={text('FABRICATE.Admin.ManagerV2.ReturnToSystemLibrary', 'Return to System Library')}
              onclick={backToSystemsBrowser}
            >
              <i class="fas fa-list" aria-hidden="true"></i>
            </button>
          </div>
        {:else}
          <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.Nav.Systems', 'Crafting Systems')}</h2>
        {/if}
        <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Workspace', 'GM management workspace')}</p>
      </section>

      <nav class="manager-v2-nav" aria-label={text('FABRICATE.Admin.ManagerV2.ManagerSections', 'Manager sections')}>
        {#if selectedSystem}
          <button type="button" class={`manager-v2-nav-button ${currentView === 'system-edit' ? 'is-active' : ''}`} aria-current={currentView === 'system-edit' ? 'page' : undefined} onclick={() => editSystem(selectedSystem.id)}>
            <i class="fas fa-cog" aria-hidden="true"></i>
            <span class="manager-v2-nav-label">{text('FABRICATE.Admin.ManagerV2.SystemEdit.Nav', 'System settings')}</span>
          </button>
          <button type="button" class={`manager-v2-nav-button ${currentView === 'recipes' ? 'is-active' : ''}`} aria-current={currentView === 'recipes' ? 'page' : undefined} onclick={() => setView('recipes')}>
            <i class="fas fa-scroll" aria-hidden="true"></i>
            <span class="manager-v2-nav-label">{text('FABRICATE.Admin.ManagerV2.Nav.Recipes', 'Recipes')}</span>
            <span class="manager-v2-nav-count">{$viewState.recipes?.length || 0}</span>
          </button>
          <button type="button" class={`manager-v2-nav-button ${currentView === 'components' || currentView === 'component-edit' ? 'is-active' : ''}`} aria-current={currentView === 'components' || currentView === 'component-edit' ? 'page' : undefined} onclick={() => setView('components')}>
            <i class="fas fa-boxes" aria-hidden="true"></i>
            <span class="manager-v2-nav-label">{text('FABRICATE.Admin.ManagerV2.Nav.Components', 'Components')}</span>
            <span class="manager-v2-nav-count">{selectedCounts.components}</span>
          </button>
          <button type="button" class={`manager-v2-nav-button ${currentView === 'tags' ? 'is-active' : ''}`} aria-current={currentView === 'tags' ? 'page' : undefined} onclick={() => setView('tags')}>
            <i class="fas fa-tags" aria-hidden="true"></i>
            <span class="manager-v2-nav-label">{text('FABRICATE.Admin.ManagerV2.Nav.TagsCategories', 'Tags & Categories')}</span>
            <span class="manager-v2-nav-count">{selectedCounts.itemTags + selectedCounts.recipeCategories}</span>
          </button>
          {#if canShowEssences}
            <button type="button" class={`manager-v2-nav-button ${currentView === 'essences' || currentView === 'essence-edit' ? 'is-active' : ''}`} aria-current={currentView === 'essences' || currentView === 'essence-edit' ? 'page' : undefined} onclick={() => setView('essences')}>
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <span class="manager-v2-nav-label">{text('FABRICATE.Admin.ManagerV2.Nav.Essences', 'Essences')}</span>
              <span class="manager-v2-nav-count">{selectedCounts.essences}</span>
            </button>
          {/if}
          {#if canShowEnvironments}
            <button type="button" class={`manager-v2-nav-button ${currentView === 'environments' || currentView === 'environment-edit' ? 'is-active' : ''}`} aria-current={currentView === 'environments' || currentView === 'environment-edit' ? 'page' : undefined} onclick={() => setView('environments')}>
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <span class="manager-v2-nav-label">{text('FABRICATE.Admin.ManagerV2.Nav.Environments', 'Gathering')}</span>
              <span class="manager-v2-nav-count">{selectedCounts.environments ?? 0}</span>
            </button>
          {/if}
        {/if}
        {#each visiblePlaceholderViews as view}
          <button type="button" class="manager-v2-nav-button" disabled title={text('FABRICATE.Admin.ManagerV2.PlannedView', '{view} is planned for manager v2.').replace('{view}', text(view.labelKey, view.fallback))}>
            <i class={view.icon} aria-hidden="true"></i>
            <span class="manager-v2-nav-label">{text(view.labelKey, view.fallback)}</span>
            <span class="manager-v2-nav-count">{text('FABRICATE.Admin.ManagerV2.Soon', 'Soon')}</span>
          </button>
        {/each}
      </nav>
    </aside>

    {#if currentView === 'environments'}
      <EnvironmentsBrowserView
        environments={environmentList}
        environmentsLoading={$viewState.environmentsLoading}
        environmentsError={$viewState.environmentsError}
        environmentDraft={environmentDraftForDisplay}
        environmentDraftDirty={$viewState.environmentDraftDirty}
        {environmentValidationCount}
        {selectedEnvironmentId}
        selectedSystemName={selectedSystem?.name || ''}
        {selectedSystemId}
        sceneOptions={selectedSystem?.sceneOptions || []}
        {shouldUseEnvironmentDraftForDisplay}
        {activeGatheringTab}
        onSelectGatheringTab={selectGatheringTab}
        onSelectEnvironment={(id) => selectEnvironment(id)}
        onEditEnvironment={(id) => editEnvironment(id)}
        onCreateEnvironment={createEnvironment}
        onDuplicateEnvironment={(id) => duplicateEnvironment(id)}
        onDeleteEnvironment={(id) => deleteEnvironment(id)}
        onMoveEnvironment={(id, direction) => moveEnvironment(id, direction)}
        onToggleEnvironmentEnabled={(id, enabled) => toggleEnvironmentEnabled(id, enabled)}
      />
    {:else if currentView === 'environment-edit' && selectedSystem}
      <main class="manager-v2-main manager-v2-environment-edit-main" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.EditTitle', 'Edit environment')}>
        <section class="manager-v2-environment-editor-shell">
          <EnvironmentEditView
            environments={$viewState.environments}
            environmentDraft={$viewState.environmentDraft}
            dirty={$viewState.environmentDraftDirty}
            isNew={$viewState.environmentDraftIsNew}
            saving={$viewState.environmentSaving}
            saveError={$viewState.environmentSaveError}
            validationState={$viewState.environmentValidationState}
            selectedTaskId={$viewState.selectedEnvironmentTaskId}
            managedItemOptions={$viewState.selectedSystem?.managedItemOptions || []}
            availableScriptMacros={$viewState.selectedSystem?.availableScriptMacros || []}
            sceneOptions={$viewState.selectedSystem?.sceneOptions || []}
            rollTableOptions={$viewState.selectedSystem?.rollTableOptions || []}
            gatheringConfig={$viewState.gatheringConfig}
            onPickImagePath={services?.pickImagePath}
            onUpdateEnvironment={store.updateEnvironmentDraft}
            onUpdateGatheringConditions={store.updateGatheringConditions}
            onUpdateGatheringVocabulary={store.updateGatheringVocabulary}
            onAddGatheringLibraryTask={store.addGatheringLibraryTask}
            onUpdateGatheringLibraryTask={store.updateGatheringLibraryTask}
            onDeleteGatheringLibraryTask={store.deleteGatheringLibraryTask}
            onAddGatheringLibraryHazard={store.addGatheringLibraryHazard}
            onUpdateGatheringLibraryHazard={store.updateGatheringLibraryHazard}
            onDeleteGatheringLibraryHazard={store.deleteGatheringLibraryHazard}
            onCancelEnvironment={store.cancelEnvironmentDraft}
            onSaveEnvironment={store.saveEnvironmentDraft}
            onDuplicateEnvironment={store.duplicateEnvironmentDraft}
            onDeleteEnvironment={store.deleteEnvironmentDraft}
            onMoveEnvironment={store.moveEnvironmentDraft}
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
        </section>
      </main>
    {:else if currentView === 'essences' && selectedSystem}
      <EssenceBrowserView
        {essenceCards}
        showSourceUi={showEssenceSourceUi}
        selectedEssenceId={selectedEssence?.id || selectedEssenceId}
        onSelectEssence={selectEssence}
        onEditEssence={editEssence}
        onRemoveEssence={removeEssence}
      />
    {:else if currentView === 'essence-edit' && selectedSystem}
      <EssenceEditView
        essence={selectedEssenceId ? selectedEssenceStrict : null}
        managedItemOptions={selectedSystem.managedItemOptions || []}
        showSourceUi={showEssenceSourceUi}
        saving={essenceEditSaving}
        onSave={saveEssenceEdit}
        onDirtyChange={(dirty) => { essenceEditDirty = dirty; }}
        onDraftChange={handleEssenceDraftChange}
        onImportSourceDrop={importEssenceSourceDrop}
      />
    {:else if currentView === 'tags' && selectedSystem}
      <TagsCategoriesView
        {categoryRows}
        {tagRows}
        counts={tagCategoryCounts}
        onAddCategory={addCategory}
        onRemoveCategory={removeCategory}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onConfirmRemove={confirmTagCategoryRemoval}
      />
    {:else if currentView === 'component-edit' && selectedSystem}
      {#if componentForEdit}
      <ComponentEditView
        component={componentForEdit}
        tagOptions={componentEditTagOptions}
        essenceOptions={componentEditEssenceOptions}
        showTags={componentEditShowTags}
        showEssences={componentEditShowEssences}
        showSourceUi={true}
        saving={componentEditSaving}
        onSave={saveComponentEdit}
        onDirtyChange={(dirty) => { componentEditDirty = dirty; }}
        onDraftChange={handleComponentDraftChange}
        onReplaceSource={(itemId, data) => replaceComponentSource(itemId, data)}
        onUnlinkSource={(itemId) => unlinkComponentSource(itemId)}
        onOpenSource={(uuid) => openComponentSource(uuid)}
        onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
      />
      {:else}
        <main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.Component.EditTitle', 'Edit component')}>
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-boxes" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Component.SelectComponent', 'Select a component')}</h3>
              <p>{text('FABRICATE.Admin.ManagerV2.Component.EditMissingHint', 'Pick a component from the browser to edit its tags, essences, and source linkage.')}</p>
            </div>
          </div>
        </main>
      {/if}
    {:else if currentView === 'components'}
      <ComponentsBrowserView
        {itemCards}
        totalComponentsCount={selectedCounts.components}
        itemSearchTerm={$viewState.itemSearchTerm || ''}
        selectedComponentId={selectedComponent?.id || ''}
        selectedSystemName={selectedSystem?.name || ''}
        {selectedSystemId}
        selectedSystemResolutionMode={selectedSystem?.resolutionMode || 'simple'}
        dropEnabled={!!selectedSystemId && !!services?.onDropItem}
        onSearchChange={(term) => store.setItemSearch?.(term)}
        onSelectComponent={(id) => selectComponent(id)}
        onDropComponent={(data) => dropComponent(data)}
        onEditComponent={(id) => editComponent(id)}
        onDeleteComponent={(id) => deleteComponent(id)}
        onCopySourceUuid={(uuid) => copyComponentSource(uuid)}
      />
    {:else if currentView === 'recipes'}
      <RecipesBrowserView
        recipes={$viewState.recipes || []}
        recipeCategories={$viewState.recipeCategories || []}
        recipeSearchTerm={$viewState.recipeSearchTerm || ''}
        selectedRecipeId={selectedRecipe?.id || ''}
        {showRecipeCategories}
        selectedSystemName={selectedSystem?.name || ''}
        onSearchChange={(term) => store.setRecipeSearch?.(term)}
        onSelectRecipe={(id) => selectRecipe(id)}
        onCreateRecipe={createRecipe}
        onEditRecipe={(id) => editRecipe(id)}
        onDuplicateRecipe={(id) => duplicateRecipe(id)}
        onDeleteRecipe={(id) => deleteRecipe(id)}
        onToggleEnabled={(id, enabled) => store.toggleRecipeEnabled?.(id, enabled)}
      />
    {:else if currentView === 'system-edit' && selectedSystem}
      <SystemEditView
        {selectedSystem}
        onSaveDetails={(name, description, advancedOptionsEnabled) => store.saveSystemDetails?.(name, description, advancedOptionsEnabled)}
        onSetResolutionMode={(nextMode) => store.setResolutionMode?.(nextMode)}
        onToggleAdvancedOptions={(checked) => store.toggleAdvancedOptions?.(checked)}
        onToggleFeature={(storeKey, checked) => store.toggleFeature?.(storeKey, checked)}
      />
    {:else}
      <SystemsBrowserView
        systems={$viewState.systems || []}
        {selectedSystemId}
        onSelectSystem={(id) => selectSystemRow(id)}
        onCreateSystem={createSystem}
        onEditSystem={(id) => editSystem(id)}
        onExportSystem={(id) => exportSystem(id)}
        onDeleteSystem={(id) => deleteSystem(id)}
        onToggleSystemEnabled={(id, enabled) => store.toggleSystemEnabled?.(id, enabled)}
      />
    {/if}

    {#if currentView !== 'environment-edit' && currentView !== 'component-edit'}
    <aside class="manager-v2-inspector" aria-label={currentView === 'recipes' ? text('FABRICATE.Admin.ManagerV2.Recipe.Inspector', 'Selected recipe inspector') : currentView === 'components' ? text('FABRICATE.Admin.ManagerV2.Component.Inspector', 'Selected component inspector') : currentView === 'tags' ? text('FABRICATE.Admin.ManagerV2.TagsCategories.Inspector', 'Tags and categories inspector') : currentView === 'essences' || currentView === 'essence-edit' ? text('FABRICATE.Admin.ManagerV2.Essence.Inspector', 'Selected essence inspector') : currentView === 'environments' ? text('FABRICATE.Admin.ManagerV2.Environment.Inspector', 'Selected environment inspector') : currentView === 'system-edit' ? text('FABRICATE.Admin.ManagerV2.SystemEdit.Inspector', 'System edit evidence') : text('FABRICATE.Admin.ManagerV2.SelectedSystemInspector', 'Selected system inspector')}>
      {#if currentView === 'tags' && selectedSystem}
        <section class="manager-v2-inspector-card">
          <div class="manager-v2-inspector-title-row">
            <span class="manager-v2-inspector-icon" aria-hidden="true">
              <i class="fas fa-tags"></i>
            </span>
            <div class="manager-v2-inspector-copy">
              <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.TagsCategories.Selected', 'Selected vocabulary')}</p>
              <h2 class="manager-v2-inspector-name">{text('FABRICATE.Admin.ManagerV2.TagsCategories.Library', 'Tags & Categories')}</h2>
              <div class="manager-v2-chip-row">
                <span class="manager-v2-chip is-active">{text('FABRICATE.Admin.ManagerV2.TagsCategories.AlwaysOn', 'Always available')}</span>
              </div>
            </div>
          </div>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.TagsCategories.InspectorHint', 'Define the vocabulary GMs use when assigning recipe categories and component tags.')}</p>
        </section>

        <section class="manager-v2-inspector-card" data-tags-evidence="how-it-works">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.TagsCategories.HowItWorksTitle', 'How it works')}</h3>
          <ul class="manager-v2-evidence-list">
            <li>{text('FABRICATE.Admin.ManagerV2.TagsCategories.HowItWorksFlat', 'Categories are flat — each recipe picks one, with no parent or child folders.')}</li>
            <li>{text('FABRICATE.Admin.ManagerV2.TagsCategories.HowItWorksGeneral', 'General is the reserved fallback for recipes without a custom category.')}</li>
            <li>{text('FABRICATE.Admin.ManagerV2.TagsCategories.HowItWorksTags', 'Item tags appear on components and on tag-placeholder ingredients in recipes.')}</li>
          </ul>
        </section>

        <section class="manager-v2-inspector-card">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.TagsCategories.Counts', 'Vocabulary counts')}</h3>
          <div class="manager-v2-fact-grid">
            <div class="manager-v2-fact" data-tags-category-fact="base-categories">
              <strong>{tagCategoryCounts.baseCategories}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.BaseCategory', 'Base category')}</span>
            </div>
            <div class="manager-v2-fact" data-tags-category-fact="custom-categories">
              <strong>{tagCategoryCounts.customCategories}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.CustomCategories', 'Custom categories')}</span>
            </div>
            <div class="manager-v2-fact" data-tags-category-fact="item-tags">
              <strong>{tagCategoryCounts.itemTags}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.ItemTags', 'Item tags')}</span>
            </div>
            <div class="manager-v2-fact" data-tags-category-fact="references">
              <strong>{tagCategoryCounts.categoryReferences + tagCategoryCounts.tagReferences}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.References', 'References')}</span>
            </div>
          </div>
        </section>

        <section class="manager-v2-inspector-card" data-tags-evidence="examples">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.TagsCategories.ExamplesTitle', 'Examples')}</h3>
          {#if topUsedCategoryExample || topUsedTagExample}
            <ul class="manager-v2-evidence-list">
              {#if topUsedCategoryExample}
                <li data-tags-example="category">
                  {(topUsedCategoryExample.count === 1
                    ? text('FABRICATE.Admin.ManagerV2.TagsCategories.ExampleCategorySingular', '"{name}" is used by 1 recipe.')
                    : text('FABRICATE.Admin.ManagerV2.TagsCategories.ExampleCategory', '"{name}" is used by {count} recipes.')
                  ).replace('{name}', topUsedCategoryExample.name).replace('{count}', topUsedCategoryExample.count)}
                </li>
              {/if}
              {#if topUsedTagExample}
                <li data-tags-example="tag">
                  {(topUsedTagExample.count === 1
                    ? text('FABRICATE.Admin.ManagerV2.TagsCategories.ExampleTagSingular', '"{name}" appears on 1 component.')
                    : text('FABRICATE.Admin.ManagerV2.TagsCategories.ExampleTag', '"{name}" appears on {count} components.')
                  ).replace('{name}', topUsedTagExample.name).replace('{count}', topUsedTagExample.count)}
                </li>
              {/if}
            </ul>
          {:else}
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.TagsCategories.ExamplesEmptyHint', 'Add a category or tag, then assign it to a recipe or component to see it appear here.')}</p>
          {/if}
        </section>

        <section class="manager-v2-inspector-card">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.TagsCategories.GeneralTitle', 'General category')}</h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.TagsCategories.GeneralInspectorHint', 'General is the built-in category for recipes without a custom category and cannot be removed.')}</p>
        </section>
      {:else if currentView === 'environments' || currentView === 'environment-edit'}
        {#if currentView === 'environments' && activeGatheringInspectorTab}
          <section class="manager-v2-inspector-card" data-gathering-inspector-placeholder={activeGatheringInspectorTab.id}>
            <div class="manager-v2-inspector-title-row is-hero-large">
              <span class="manager-v2-inspector-icon is-hero-large" aria-hidden="true">
                <i class={activeGatheringInspectorTab.icon}></i>
              </span>
              <div class="manager-v2-inspector-copy">
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Label', 'Gathering sections')}</p>
                <h2 class="manager-v2-inspector-name">
                  {text(activeGatheringInspectorTab.titleKey, activeGatheringInspectorTab.titleFallback)}
                </h2>
              </div>
            </div>
            <p class="manager-v2-muted">
              {text(activeGatheringInspectorTab.hintKey, activeGatheringInspectorTab.hintFallback)}
            </p>
          </section>
        {:else if selectedEnvironment}
          <section class="manager-v2-inspector-card">
            <img class={`manager-v2-environment-preview ${hasEnvironmentSceneImage(selectedEnvironment) ? '' : 'is-fallback'}`} src={environmentImage(selectedEnvironment)} alt="" />
            <div class="manager-v2-inspector-copy">
              <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.Selected', 'Selected environment')}</p>
              <h2 class="manager-v2-inspector-name" title={environmentName(selectedEnvironment)}>{environmentName(selectedEnvironment)}</h2>
              <div class="manager-v2-chip-row">
                <span class={`manager-v2-chip ${selectedEnvironment.enabled === false ? 'is-disabled' : 'is-active'}`}>{environmentStatusLabel(selectedEnvironment)}</span>
                <span class="manager-v2-chip">{environmentSelectionModeLabel(selectedEnvironment)}</span>
                <span class={`manager-v2-chip ${selectedEnvironmentSceneState.className}`}>{selectedEnvironmentSceneState.label}</span>
              </div>
            </div>

            <p class="manager-v2-muted">
              {selectedEnvironment.description || text('FABRICATE.Admin.ManagerV2.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          <section class="manager-v2-inspector-card">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.Details', 'Environment details')}</h3>
            <div class="manager-v2-fact-grid">
              {#each selectedEnvironmentFacts as fact}
                <div class="manager-v2-fact" data-environment-fact={fact.id}>
                  <strong>{fact.value}</strong>
                  <span>{fact.label}</span>
                </div>
              {/each}
            </div>
            {#if selectedEnvironment.sceneUuid}
              <p class="manager-v2-muted">
                <strong>{text('FABRICATE.Admin.ManagerV2.Environment.Scene', 'Scene')}:</strong>
                {selectedEnvironmentSceneState.name || selectedEnvironment.sceneUuid}
              </p>
            {/if}
          </section>

          {#if environmentDirtyFor(selectedEnvironment) || environmentInvalidFor(selectedEnvironment) || $viewState.environmentSaveError}
            <section class="manager-v2-inspector-card">
              <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.DraftState', 'Draft state')}</h3>
              <div class="manager-v2-feature-list">
                {#if environmentDirtyFor(selectedEnvironment)}
                  <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Environment.Dirty', 'Unsaved')}</span>
                {/if}
                {#if environmentInvalidFor(selectedEnvironment)}
                  <span class="manager-v2-chip is-danger">{text('FABRICATE.Admin.ManagerV2.Environment.ValidationCount', '{count} validation issues').replace('{count}', environmentValidationCount)}</span>
                {/if}
              </div>
              {#if $viewState.environmentSaveError}
                <p class="manager-v2-muted">{$viewState.environmentSaveError}</p>
              {/if}
            </section>
          {/if}

          <section class="manager-v2-inspector-card">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Environment.Actions', 'Environment actions')}</h3>
            <div class="manager-v2-inspector-actions">
              <button type="button" class="manager-v2-button" onclick={() => editEnvironment()}>
                <i class="fas fa-edit" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Environment.Edit', 'Edit environment')}</span>
              </button>
              <button type="button" class="manager-v2-button" onclick={() => duplicateEnvironment()}>
                <i class="fas fa-copy" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Environment.Duplicate', 'Duplicate environment')}</span>
              </button>
              <button type="button" class="manager-v2-button" onclick={() => toggleEnvironmentEnabled(selectedEnvironment.id, selectedEnvironment.enabled === false)}>
                <i class={selectedEnvironment.enabled === false ? 'fas fa-toggle-off' : 'fas fa-toggle-on'} aria-hidden="true"></i>
                <span>{selectedEnvironment.enabled === false ? text('FABRICATE.Admin.ManagerV2.Environment.Enable', 'Enable environment') : text('FABRICATE.Admin.ManagerV2.Environment.Disable', 'Disable environment')}</span>
              </button>
              <div class="manager-v2-action-group">
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.Environments.MoveUp', 'Move up')} title={text('FABRICATE.Admin.Environments.MoveUp', 'Move up')} onclick={() => moveEnvironment(selectedEnvironment.id, 'up')}>
                  <i class="fas fa-arrow-up" aria-hidden="true"></i>
                </button>
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.Environments.MoveDown', 'Move down')} title={text('FABRICATE.Admin.Environments.MoveDown', 'Move down')} onclick={() => moveEnvironment(selectedEnvironment.id, 'down')}>
                  <i class="fas fa-arrow-down" aria-hidden="true"></i>
                </button>
              </div>
              <button type="button" class="manager-v2-button is-danger" onclick={() => deleteEnvironment()}>
                <i class="fas fa-trash" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Environment.Delete', 'Delete environment')}</span>
              </button>
            </div>
          </section>
        {:else if environmentList.length === 0}
          <section class="manager-v2-setup-card" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Title', 'Plan gathering content')}>
            <div class="manager-v2-setup-card-header">
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <div>
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Kicker', 'Gathering setup')}</p>
                <h3>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Title', 'Plan gathering content')}</h3>
              </div>
            </div>
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Hint', 'Reusable tasks and hazards give environments consistent activities, risks, and rewards across gathering locations.')}</p>
            <ol class="manager-v2-setup-list">
              <li>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.StepTasks', 'Define reusable gathering tasks with their checks, timing, result groups, and failure outcomes.')}</li>
              <li>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.StepHazards', 'Prepare encounter and hazard options that can be reused across risky locations.')}</li>
              <li>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.StepCreate', 'Create environments after the reusable task and hazard libraries are ready to attach.')}</li>
            </ol>
            <div class="manager-v2-setup-links" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Resources', 'Environment resources')}>
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/gathering-environments/" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.GatheringDocs', 'Gathering docs')}</span>
              </a>
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Environment.SelectEnvironment', 'Select an environment')}</h3>
              <p>{text('FABRICATE.Admin.ManagerV2.Environment.InspectorHint', 'The inspector shows scene imagery, task evidence, draft state, and existing actions for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'essences' || currentView === 'essence-edit'}
        {#if selectedEssenceForInspector}
          <section class="manager-v2-inspector-card">
            <div class="manager-v2-inspector-title-row is-hero-large">
              <span class="manager-v2-inspector-icon is-hero-large" aria-hidden="true">
                <i class={selectedEssenceForInspector.icon || 'fas fa-mortar-pestle'}></i>
              </span>
              <div class="manager-v2-inspector-copy">
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Essence.Selected', 'Selected essence')}</p>
                <h2 class="manager-v2-inspector-name" title={selectedEssenceForInspector.name}>{selectedEssenceForInspector.name}</h2>
                <div class="manager-v2-chip-row">
                  {#if selectedEssenceForInspector.deleteBlocked}
                    <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Essence.DeleteBlockedShort', 'In use')}</span>
                  {/if}
                </div>
              </div>
            </div>
            <p class="manager-v2-muted">
              {selectedEssenceForInspector.description || text('FABRICATE.Admin.ManagerV2.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          {#if currentView === 'essence-edit' && (essenceEditDirty || essenceEditSaving)}
            <section class="manager-v2-inspector-card">
              <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Essence.DraftState', 'Draft state')}</h3>
              <div class="manager-v2-feature-list">
                {#if essenceEditDirty}
                  <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Essence.Dirty', 'Unsaved')}</span>
                {/if}
                {#if essenceEditSaving}
                  <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.Essence.Saving', 'Saving...')}</span>
                {/if}
              </div>
            </section>
          {/if}

          {#if showEssenceSourceUi && currentView !== 'essence-edit'}
          <section class="manager-v2-inspector-card" data-essence-section="source">
            <div class="manager-v2-edit-card-heading">
              <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}</h3>
            </div>
            {#if selectedEssenceForInspector.associatedItem}
              <div class="manager-v2-essence-source-summary manager-v2-essence-inspector-source-summary">
                <img class="manager-v2-essence-source-thumb" src={selectedEssenceForInspector.associatedItem.img || 'icons/svg/item-bag.svg'} alt="" />
                <div class="manager-v2-essence-source-copy">
                  <strong>{selectedEssenceForInspector.associatedItem.name || selectedEssenceForInspector.sourceName}</strong>
                </div>
              </div>
              <div class="manager-v2-essence-inspector-source-actions">
                <button type="button" class="manager-v2-button" data-essence-action="copy-source" title={selectedEssenceSourceUuid() || text('FABRICATE.Admin.ManagerV2.Essence.SourceNoUuid', 'This component has no source item UUID.')} disabled={!selectedEssenceSourceUuid()} onclick={copySelectedEssenceSource}>
                  <i class="fas fa-copy" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Essence.CopySource', 'Copy source UUID')}</span>
                </button>
                <button type="button" class="manager-v2-button is-warning-action" data-essence-action="unlink-source" onclick={unlinkSelectedEssenceSource}>
                  <i class="fas fa-unlink" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Essence.UnlinkSource', 'Unlink Source')}</span>
                </button>
              </div>
            {:else}
              <div class="manager-v2-essence-source-drop-zone manager-v2-essence-inspector-source-drop-zone">
                <EssenceSourceSelector
                  value={null}
                  items={selectedSystem?.managedItemOptions || []}
                  onDrop={handleInspectorEssenceSourceDrop}
                  onSelect={handleInspectorEssenceSourceSelect}
                  onClear={() => updateSelectedEssenceSource(null)}
                />
              </div>
            {/if}
          </section>
          {/if}

          <section class="manager-v2-inspector-card" data-essence-section="usage">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Essence.Usage', 'Usage')}</h3>
            <div class="manager-v2-requirements-list">
              <div class="manager-v2-requirement-row">
                <span>{text('FABRICATE.Admin.ManagerV2.Essence.Usage', 'Usage')}</span>
                <strong>{text('FABRICATE.Admin.ManagerV2.Essence.ComponentUsageCount', '{count} components').replace('{count}', selectedEssenceForInspector.componentUsageCount || 0)}</strong>
              </div>
            </div>
            {#if Array.isArray(selectedEssenceForInspector.componentUsageItems) && selectedEssenceForInspector.componentUsageItems.length > 0}
              <div class="manager-v2-essence-usage-grid" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.ComponentUsageGrid', 'Components using this essence')}>
                {#each selectedEssenceForInspector.componentUsageItems as component (component.id)}
                  <button type="button" class="manager-v2-essence-usage-item" title={component.name} aria-label={text('FABRICATE.Admin.ManagerV2.Component.EditNamed', 'Edit {name}').replace('{name}', component.name)} onclick={() => editComponent(component.id)}>
                    <img src={componentImage(component)} alt="" />
                  </button>
                {/each}
              </div>
            {/if}
          </section>

          {#if selectedEssenceForInspector.deleteBlocked}
            <section class="manager-v2-inspector-card">
              <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Essence.UsageBlockedTitle', 'Deletion blocked')}</h3>
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Essence.UsageBlockedHint', 'Remove this essence from components before deleting the definition.')}</p>
            </section>
          {/if}

        {:else if currentView === 'essences' && essenceCards.length === 0}
          <section class="manager-v2-setup-card" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.Title', 'Set up essences')}>
            <div class="manager-v2-setup-card-header">
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <div>
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.Kicker', 'Essence setup')}</p>
                <h3>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.Title', 'Set up essences')}</h3>
              </div>
            </div>
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.Hint', 'Create the first essence definition for this system, then assign quantities to components that should contribute that essence.')}</p>
            <ol class="manager-v2-setup-list">
              <li>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.StepCreate', 'Create an essence with a clear name, icon, and description.')}</li>
              <li>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.StepAssign', 'Edit components to assign essence quantities that recipes can require.')}</li>
              <li>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.StepTransfer', 'If effect transfer is enabled, link source components whose effects should carry to crafted results.')}</li>
            </ol>
            <div class="manager-v2-setup-links" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.Resources', 'Essence resources')}>
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/essences/" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.EssenceDocs', 'Essence docs')}</span>
              </a>
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/effect-transfer/" target="_blank" rel="noreferrer">
                <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySetup.EffectTransferDocs', 'Effect transfer')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <h3>{currentView === 'essence-edit'
                ? text('FABRICATE.Admin.ManagerV2.Essence.CreateInspectorTitle', 'New essence draft')
                : text('FABRICATE.Admin.ManagerV2.Essence.SelectEssence', 'Select an essence')}</h3>
              <p>{currentView === 'essence-edit'
                ? text('FABRICATE.Admin.ManagerV2.Essence.CreateInspectorHint', 'The inspector will show the essence ID after the draft is saved.')
                : showEssenceSourceUi
                ? text('FABRICATE.Admin.ManagerV2.Essence.InspectorHint', 'The inspector shows source linkage and component usage for the selected essence.')
                : text('FABRICATE.Admin.ManagerV2.Essence.InspectorNoSourceHint', 'The inspector shows identity and component usage for the selected essence.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'components'}
        {#if selectedComponent}
          <section class="manager-v2-inspector-card">
            <div class="manager-v2-inspector-title-row is-hero-large">
              <img class="manager-v2-component-preview" src={componentImage(selectedComponent)} alt="" />
              <div class="manager-v2-inspector-copy">
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Component.Selected', 'Selected component')}</p>
                <h2 class="manager-v2-inspector-name" title={selectedComponent.name}>{selectedComponent.name}</h2>
                <div class="manager-v2-chip-row">
                  <span class={`manager-v2-chip ${componentSourceState(selectedComponent).className}`}>{componentSourceState(selectedComponent).label}</span>
                </div>
              </div>
            </div>

            <p class="manager-v2-muted">
              {selectedComponent.description || text('FABRICATE.Admin.ManagerV2.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          {#if showComponentTags}
            <section class="manager-v2-inspector-card" data-component-section="tags">
              <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Component.Tags', 'Tags')}</h3>
              <div class="manager-v2-feature-list">
                {#each selectedComponent.tags || [] as tag}
                  <span class="manager-v2-chip">{tag}</span>
                {:else}
                  <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.NoTags', 'No tags')}</span>
                {/each}
              </div>
            </section>
          {/if}

          {#if showComponentEssences}
            <section class="manager-v2-inspector-card" data-component-section="essences">
              <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Component.Essences', 'Essences')}</h3>
              <div class="manager-v2-feature-list">
                {#each selectedComponent.essences || [] as essence}
                  <span class="manager-v2-chip manager-v2-essence-compact-chip" title={`${essence.name || essence.id} ${essence.quantity}`} aria-label={`${essence.name || essence.id} ${essence.quantity}`}>
                    <i class={essence.icon || 'fas fa-mortar-pestle'} aria-hidden="true"></i>{essence.quantity}
                  </span>
                {:else}
                  <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.NoEssences', 'No essences')}</span>
                {/each}
              </div>
            </section>
          {/if}

          <section class="manager-v2-inspector-card" data-component-section="source">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Component.Source', 'Source')}</h3>
            {#if selectedComponent.hasSourceUuid}
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.SourceHint', 'This component keeps a stored source ID for import matching and replacement.')}</p>
              {#if selectedComponent.sourceMissing}
                <p class="environment-stale-warning" data-component-source-missing>{text('FABRICATE.Admin.ManagerV2.Component.SourceMissingHint', 'The stored source no longer resolves. Replace the component source or verify the original compendium/world item still exists.')}</p>
              {/if}
              <button type="button" class="manager-v2-button" data-component-action="copy-source" title={selectedComponent.sourceUuidDisplay} onclick={() => copyComponentSource(selectedComponent.sourceUuidDisplay)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Component.CopySource', 'Copy source UUID')}</span>
              </button>
            {:else}
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.NoSourceHint', 'This component does not expose a stored source UUID in the current item-card data.')}</p>
            {/if}
          </section>

        {:else if itemCards.length === 0}
          <section class="manager-v2-setup-card" aria-label={text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.Title', 'Set up components')}>
            <div class="manager-v2-setup-card-header">
              <i class="fas fa-box-open" aria-hidden="true"></i>
              <div>
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.Kicker', 'Component setup')}</p>
                <h3>{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.Title', 'Set up components')}</h3>
              </div>
            </div>
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.Hint', 'Import item-backed components before recipes can reference ingredients, catalysts, results, or essence sources.')}</p>
            <ol class="manager-v2-setup-list">
              <li>{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.StepImport', 'Drop world, compendium, pack, or folder items into the component browser.')}</li>
              <li>{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.StepOrganize', 'Add tags, essences, source links, and difficulty metadata where the selected system uses them.')}</li>
              <li>{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.StepRecipes', 'Use the managed components as recipe requirements, catalysts, and results.')}</li>
            </ol>
            <div class="manager-v2-setup-links" aria-label={text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.Resources', 'Component resources')}>
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/crafting-systems/#components" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.ComponentDocs', 'Component docs')}</span>
              </a>
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Component.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-boxes" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Component.SelectComponent', 'Select a component')}</h3>
              <p>{text('FABRICATE.Admin.ManagerV2.Component.InspectorHint', 'The inspector shows component identity, source evidence, tags, essences, and existing actions for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'recipes'}
        {#if selectedRecipe}
          <section class="manager-v2-inspector-card">
            <div class="manager-v2-inspector-title-row is-hero-large">
              <img class="manager-v2-recipe-preview" src={recipeImage(selectedRecipe)} alt="" />
              <div class="manager-v2-inspector-copy">
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Recipe.Selected', 'Selected recipe')}</p>
                <h2 class="manager-v2-inspector-name" title={selectedRecipe.name}>{selectedRecipe.name}</h2>
                <div class="manager-v2-chip-row">
                  <span class={`manager-v2-chip ${selectedRecipe.enabled === false ? 'is-disabled' : 'is-active'}`}>
                    {selectedRecipe.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}
                  </span>
                  <span class={`manager-v2-chip ${selectedRecipe.locked ? 'is-disabled' : 'is-active'}`}>
                    {selectedRecipe.locked ? text('FABRICATE.Admin.ManagerV2.Recipe.Locked', 'Locked') : text('FABRICATE.Admin.ManagerV2.Recipe.Unlocked', 'Unlocked')}
                  </span>
                </div>
              </div>
            </div>

            <p class="manager-v2-muted">
              {selectedRecipe.description || text('FABRICATE.Admin.ManagerV2.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          <section class="manager-v2-inspector-card">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Recipe.Details', 'Recipe details')}</h3>
            <div class="manager-v2-fact-grid">
              {#if showRecipeCategories}
                <div class="manager-v2-fact" data-recipe-fact="category">
                  <strong>{selectedRecipe.category || text('FABRICATE.Admin.ManagerV2.Recipe.General', 'General')}</strong>
                  <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Category', 'Category')}</span>
                </div>
              {/if}
              <div class="manager-v2-fact" data-recipe-fact="structure">
                <strong>{structureLabel(selectedRecipe)}</strong>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Structure', 'Structure')}</span>
              </div>
              <div class="manager-v2-fact" data-recipe-fact="steps">
                <strong>{stepCount(selectedRecipe)}</strong>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Steps', 'Steps')}</span>
              </div>
              <div class="manager-v2-fact" data-recipe-fact="result-groups">
                <strong>{resultGroupCount(selectedRecipe)}</strong>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.ResultGroups', 'Result groups')}</span>
              </div>
            </div>
            {#if $viewState.showVisibilitySummary}
              <p class="manager-v2-muted">
                <strong>{text('FABRICATE.Admin.ManagerV2.Recipe.PlayerVisibility', 'Player visibility')}:</strong>
                {selectedRecipe.visibilitySummary}
              </p>
            {/if}
          </section>

          <section class="manager-v2-inspector-card">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Recipe.Requirements', 'Requirements')}</h3>
            <p class="manager-v2-muted">{requirementsSummary(selectedRecipe)}</p>
            <div class="manager-v2-requirements-list">
              {#each requirementsPreviewItems(selectedRecipe) as item}
                <div class="manager-v2-requirement-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              {/each}
            </div>
          </section>

          <section class="manager-v2-inspector-card">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Recipe.Actions', 'Recipe actions')}</h3>
            <div class="manager-v2-inspector-actions">
              <button type="button" class="manager-v2-button is-primary" data-recipe-action="edit" onclick={() => editRecipe()}>
                <i class="fas fa-edit" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Edit', 'Edit recipe')}</span>
              </button>
              <button type="button" class="manager-v2-button" data-recipe-action="duplicate" onclick={() => duplicateRecipe()}>
                <i class="fas fa-copy" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Duplicate', 'Duplicate recipe')}</span>
              </button>
              <button type="button" class="manager-v2-button is-danger" data-recipe-action="delete" onclick={() => deleteRecipe()}>
                <i class="fas fa-trash" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.Delete', 'Delete recipe')}</span>
              </button>
            </div>
          </section>
        {:else if ($viewState.recipes || []).length === 0}
          <section class="manager-v2-setup-card" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Title', 'Set up recipes')}>
            <div class="manager-v2-setup-card-header">
              <i class="fas fa-scroll" aria-hidden="true"></i>
              <div>
                <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Kicker', 'Recipe setup')}</p>
                <h3>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Title', 'Set up recipes')}</h3>
              </div>
            </div>
            {#if selectedCounts.components > 0}
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Hint', 'Create the first recipe for this system after its reusable components are available.')}</p>
              <ol class="manager-v2-setup-list">
                <li>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.StepStructure', 'Choose the recipe structure supported by the selected system.')}</li>
                <li>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.StepRequirements', 'Add ingredient sets, catalysts, and any visibility or timing requirements.')}</li>
                <li>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.StepResults', 'Define result groups and enable the recipe when it is ready for players.')}</li>
              </ol>
            {:else}
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.NoComponentsHint', 'Add components before creating recipes so ingredients, catalysts, and results have reusable items to reference.')}</p>
              <ol class="manager-v2-setup-list">
                <li>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.NoComponentsStepComponents', 'Open Components and drop world, compendium, pack, or folder items into this system.')}</li>
                <li>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.NoComponentsStepOrganize', 'Review component names, source links, tags, essences, and difficulty metadata.')}</li>
                <li>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.NoComponentsStepRecipes', 'Return to Recipes and build requirements and results from those components.')}</li>
              </ol>
            {/if}
            <div class="manager-v2-setup-links" aria-label={text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Resources', 'Recipe resources')}>
              {#if selectedCounts.components <= 0}
                <button type="button" class="manager-v2-button is-primary" onclick={() => setView('components')}>
                  <i class="fas fa-boxes" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.AddComponents', 'Add components')}</span>
                </button>
              {/if}
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/recipes/" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.RecipeDocs', 'Recipe docs')}</span>
              </a>
              <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-scroll" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Recipe.SelectRecipe', 'Select a recipe')}</h3>
              <p>{text('FABRICATE.Admin.ManagerV2.Recipe.InspectorHint', 'The inspector shows recipe status, structure, and requirements for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'system-edit' && selectedSystem}
        <section class="manager-v2-inspector-card">
          <div class="manager-v2-inspector-title-row is-hero-large">
            <span class="manager-v2-inspector-icon is-hero-large" aria-hidden="true">
              <i class="fas fa-layer-group"></i>
            </span>
            <div class="manager-v2-inspector-copy">
              <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.SystemEdit.Editing', 'Editing')}</p>
              <h2 class="manager-v2-inspector-name" title={selectedSystem.name}>{selectedSystem.name}</h2>
              <div class="manager-v2-chip-row">
                <span class="manager-v2-chip is-active">{resolutionModeLabel(selectedSystem.resolutionMode)}</span>
                <span class={`manager-v2-chip ${selectedSystem.advancedOptionsEnabled === false ? 'is-disabled' : 'is-active'}`}>
                  {selectedSystem.advancedOptionsEnabled === false
                    ? text('FABRICATE.Admin.ManagerV2.SystemEdit.AdvancedHidden', 'Advanced hidden')
                    : text('FABRICATE.Admin.ManagerV2.SystemEdit.AdvancedVisible', 'Advanced visible')}
                </span>
              </div>
            </div>
          </div>

          <p class="manager-v2-muted">
            {selectedSystem.description || text('FABRICATE.Admin.ManagerV2.NoDescriptionAdded', 'No description has been added.')}
          </p>
        </section>

        <section class="manager-v2-inspector-card">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.SystemEdit.Summary', 'Edit summary')}</h3>
          <div class="manager-v2-fact-grid">
            <div class="manager-v2-fact">
              <strong>{resolutionModeLabel(selectedSystem.resolutionMode)}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.Column.Resolution', 'Resolution')}</span>
            </div>
            <div class="manager-v2-fact">
              <strong>{enabledFeatureLabels.length}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.SystemEdit.EnabledFeatureCount', 'Features enabled')}</span>
            </div>
          </div>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.SystemEdit.DeepConfigHint', 'Categories, tags, essences, checks, requirements, visibility, alchemy, and gathering configuration stay in later manager-v2 views or the current admin for this slice.')}</p>
        </section>

        <section class="manager-v2-inspector-card">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.SystemEdit.LegacyFallback', 'Legacy fallback')}</h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.SystemEdit.LegacyFallbackHint', 'Open the current admin when you need deeper configuration that is not part of this v2 edit slice.')}</p>
          <button type="button" class="manager-v2-button" onclick={openCurrentAdmin}>
            <i class="fas fa-book" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.OpenCurrentAdmin', 'Open current admin')}</span>
          </button>
        </section>
      {:else if selectedSystem}
        <section class="manager-v2-inspector-card">
          <div class="manager-v2-inspector-title-row is-hero-large">
            <span class="manager-v2-inspector-icon is-hero-large" aria-hidden="true">
              <i class="fas fa-layer-group"></i>
            </span>
            <div class="manager-v2-inspector-copy">
              <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Column.System', 'System')}</p>
              <h2 class="manager-v2-inspector-name" title={selectedSystem.name}>{selectedSystem.name}</h2>
              <div class="manager-v2-chip-row">
                <span class="manager-v2-chip is-active">{resolutionModeLabel(selectedSystem.resolutionMode)}</span>
                <span class={`manager-v2-chip ${selectedSystem.enabled === false ? 'is-disabled' : 'is-active'}`}>
                  {selectedSystem.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}
                </span>
              </div>
            </div>
          </div>

          <p class="manager-v2-muted">
            {selectedSystem.description || text('FABRICATE.Admin.ManagerV2.NoDescriptionAdded', 'No description has been added.')}
          </p>
        </section>

        <section class="manager-v2-inspector-card">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Counts', 'Counts')}</h3>
          <div class="manager-v2-fact-grid">
            {#each selectedCountFacts as fact}
              {@const labelParts = countLabelParts(fact.label)}
              <div class="manager-v2-fact" class:is-off={fact.isOff} data-count-id={fact.id}>
                {#if fact.isOff}
                  <span class="manager-v2-fact-line">
                    <span class="manager-v2-fact-label">{fact.label}</span>
                    <strong class="is-disabled">{fact.value}</strong>
                  </span>
                {:else}
                  <span class="manager-v2-fact-line">
                    <span class="manager-v2-fact-leading"><strong>{fact.value}</strong> {labelParts.lead}</span>{#if labelParts.rest}{' '}<span class="manager-v2-fact-label">{labelParts.rest}</span>{/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        <section class="manager-v2-inspector-card" aria-label={text('FABRICATE.Admin.ManagerV2.EnabledFeatures', 'Enabled features')}>
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.EnabledFeatures', 'Enabled features')}</h3>
          {#if enabledFeatureLabels.length > 0}
            <div class="manager-v2-feature-list">
              {#each enabledFeatureLabels as feature}
                <span class="manager-v2-chip is-active">{feature}</span>
              {/each}
            </div>
          {:else}
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.NoOptionalFeatures', 'No optional features enabled.')}</p>
          {/if}
        </section>
      {:else if ($viewState.systems || []).length === 0}
        <section class="manager-v2-setup-card" aria-label={text('FABRICATE.Admin.ManagerV2.EmptySetup.Title', 'Set up your first system')}>
          <div class="manager-v2-setup-card-header">
            <i class="fas fa-compass" aria-hidden="true"></i>
            <div>
              <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.EmptySetup.Kicker', 'First run')}</p>
              <h3>{text('FABRICATE.Admin.ManagerV2.EmptySetup.Title', 'Set up your first system')}</h3>
            </div>
          </div>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.EmptySetup.Hint', 'Create a crafting system, add item-backed components, then build recipes from those components.')}</p>
          <ol class="manager-v2-setup-list">
            <li>{text('FABRICATE.Admin.ManagerV2.EmptySetup.StepSystem', 'Create a system for one crafting discipline or ruleset.')}</li>
            <li>{text('FABRICATE.Admin.ManagerV2.EmptySetup.StepComponents', 'Import world or compendium items as reusable components.')}</li>
            <li>{text('FABRICATE.Admin.ManagerV2.EmptySetup.StepRecipes', 'Add recipes that consume components and award results.')}</li>
          </ol>
          <div class="manager-v2-setup-links" aria-label={text('FABRICATE.Admin.ManagerV2.EmptySetup.Resources', 'Resources')}>
            <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
              <i class="fas fa-book-open" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.ManagerV2.EmptySetup.Quickstart', 'Quickstart')}</span>
            </a>
            <a class="manager-v2-button" href="https://misterpotts.github.io/fabricate/" target="_blank" rel="noreferrer">
              <i class="fas fa-circle-question" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.ManagerV2.EmptySetup.Docs', 'Docs')}</span>
            </a>
          </div>
        </section>
      {:else}
        <div class="manager-v2-empty">
          <div>
            <i class="fas fa-arrow-pointer" aria-hidden="true"></i>
            <h3>{text('FABRICATE.Admin.ManagerV2.SelectSystem', 'Select a system')}</h3>
            <p>{text('FABRICATE.Admin.ManagerV2.InspectorHint', 'The inspector shows counts, resolution mode, and enabled features for the selected system.')}</p>
          </div>
        </div>
      {/if}
    </aside>
    {/if}
  </div>
</div>
