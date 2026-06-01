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
  import GatheringTaskEditView from './GatheringTaskEditView.svelte';
  import GatheringHazardEditView from './GatheringHazardEditView.svelte';
  import ToolsBrowserView from './ToolsBrowserView.svelte';
  import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';
  import Pagination from '../../components/Pagination.svelte';
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
  let gatheringMenuExpanded = $state(false);
  let selectedGatheringTaskId = $state('');
  let selectedGatheringHazardId = $state('');
  let selectedGatheringDropId = $state('');
  let gatheringTaskDraft = $state(null);
  let gatheringTaskDraftBaseline = $state(null);
  let gatheringTaskSaving = $state(false);
  let gatheringTaskSaveError = $state('');
  let gatheringHazardDraft = $state(null);
  let gatheringHazardDraftBaseline = $state(null);
  let gatheringHazardSaving = $state(false);
  let gatheringHazardSaveError = $state('');
  let toolsComponentSearchTerm = $state('');
  let toolsComponentPageIndex = $state(0);
  let toolsComponentPageSize = $state(6);
  const placeholderViews = [
    { id: 'rules', icon: 'fas fa-sliders-h', labelKey: 'FABRICATE.Admin.Manager.Nav.Rules', fallback: 'Rules' },
    { id: 'graph', icon: 'fas fa-project-diagram', labelKey: 'FABRICATE.Admin.Manager.Nav.Graph', fallback: 'Graph' }
  ];

  const selectedSystem = $derived($viewState.selectedSystem);
  const selectedSystemId = $derived(selectedSystem?.id || '');
  const systemsLoading = $derived($viewState.systemsLoading === true);
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
  const toolsComponentCards = $derived(Array.isArray(itemCards) ? itemCards : []);
  const toolsNormalizedComponentSearchTerm = $derived(toolsComponentSearchTerm.trim().toLowerCase());
  const toolsFilteredComponentCards = $derived(toolsComponentCards.filter(item => {
    const name = String(item?.name || '').toLowerCase();
    return !toolsNormalizedComponentSearchTerm || name.includes(toolsNormalizedComponentSearchTerm);
  }));
  const toolsPaginatedComponentCards = $derived(toolsFilteredComponentCards.slice(
    toolsComponentPageIndex * toolsComponentPageSize,
    (toolsComponentPageIndex + 1) * toolsComponentPageSize
  ));
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
  const selectedGatheringConditionShortcuts = $derived(buildSelectedGatheringConditionShortcuts(
    selectedSystem,
    $viewState.gatheringConfig
  ));
  const selectedGatheringCharacterModifiers = $derived(
    Array.isArray($viewState.gatheringConfig?.systems?.[selectedSystemId]?.characterModifiers)
      ? $viewState.gatheringConfig.systems[selectedSystemId].characterModifiers
      : []
  );
  const foundrySystemId = $derived(String($viewState.foundrySystemId || ''));
  const characterModifierPresetsSupported = $derived(['dnd5e', 'pf2e'].includes(foundrySystemId));
  async function onAddCharacterModifier() {
    if (!selectedSystemId) return null;
    return await store.addGatheringCharacterModifier(selectedSystemId);
  }
  async function onSeedCharacterModifierPresets() {
    if (!selectedSystemId || !characterModifierPresetsSupported) return;
    await store.seedGatheringCharacterModifierPresets(selectedSystemId);
  }
  async function onUpdateCharacterModifier(modifierId, patch) {
    if (!selectedSystemId) return;
    await store.updateGatheringCharacterModifier(selectedSystemId, modifierId, patch);
  }
  async function onDeleteCharacterModifier(modifierId) {
    if (!selectedSystemId) return;
    await store.deleteGatheringCharacterModifier(selectedSystemId, modifierId);
  }

  function characterModifierLibraryEntry(modifierId) {
    if (!modifierId) return null;
    return selectedGatheringCharacterModifiers.find(entry => entry.id === modifierId) || null;
  }

  function characterModifierLabelForRef(ref) {
    const entry = characterModifierLibraryEntry(ref?.modifierId);
    if (entry) return entry.label || entry.id;
    return text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref?.modifierId || '');
  }

  function characterModifierIconForRef(ref) {
    return characterModifierLibraryEntry(ref?.modifierId)?.icon || 'fa-solid fa-user';
  }

  function characterModifierIsCustomized(ref) {
    if (!ref) return false;
    return Boolean(ref.expressionOverride);
  }

  function rowCharacterModifiers(row) {
    return Array.isArray(row?.characterModifiers) ? row.characterModifiers : [];
  }

  async function onAddDropCharacterModifier(rowId, modifierId = null) {
    if (!editingGatheringTask?.id || !rowId) return;
    const id = modifierId ?? selectedGatheringCharacterModifiers[0]?.id ?? '';
    if (!id) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find(entry => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const newRef = {
      id: `char-mod-${id}-${refs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      modifierId: id,
      operator: '+',
      min: null,
      max: null,
      expressionOverride: ''
    };
    updateGatheringTaskDrop(rowId, { characterModifiers: [...refs, newRef] });
  }

  let characterModifierSearchTerm = $state('');
  const characterModifierSearchSuggestions = $derived.by(() => {
    const term = characterModifierSearchTerm.trim().toLowerCase();
    if (!term) return [];
    const attached = new Set((selectedGatheringDrop?.characterModifiers || []).map(ref => ref.modifierId).filter(Boolean));
    return selectedGatheringCharacterModifiers.filter(entry => {
      if (attached.has(entry.id)) return false;
      const label = String(entry.label || '').toLowerCase();
      const id = String(entry.id || '').toLowerCase();
      return label.includes(term) || id.includes(term);
    });
  });
  $effect(() => {
    if (selectedGatheringDrop?.id) {
      characterModifierSearchTerm = '';
    }
  });

  const hazardCharacterModifierSearchSuggestions = $derived.by(() => {
    const term = characterModifierSearchTerm.trim().toLowerCase();
    if (!term) return [];
    const attached = new Set((editingGatheringHazard?.characterModifiers || []).map(ref => ref.modifierId).filter(Boolean));
    return selectedGatheringCharacterModifiers.filter(entry => {
      if (attached.has(entry.id)) return false;
      const label = String(entry.label || '').toLowerCase();
      const id = String(entry.id || '').toLowerCase();
      return label.includes(term) || id.includes(term);
    });
  });
  $effect(() => {
    if (editingGatheringHazard?.id) {
      characterModifierSearchTerm = '';
    }
  });

  let characterModifierSearchAnchor = $state(null);
  let characterModifierSearchOpenUp = $state(false);

  function characterModifierSearchClippingBounds(node) {
    const documentRef = globalThis.document;
    const windowRef = globalThis.window || globalThis;
    const viewportTop = 0;
    const viewportBottom = Number(globalThis.innerHeight || windowRef.innerHeight) || documentRef?.documentElement?.clientHeight || 0;
    let parent = node?.parentElement;
    while (parent && parent !== documentRef?.documentElement) {
      const style = globalThis.getComputedStyle?.(parent);
      const overflow = `${style?.overflow || ''} ${style?.overflowY || ''} ${style?.overflowX || ''}`;
      if (/(auto|scroll|hidden|clip)/.test(overflow)) {
        const rect = parent.getBoundingClientRect?.();
        if (rect) {
          return {
            top: Math.max(viewportTop, rect.top),
            bottom: Math.min(viewportBottom || rect.bottom, rect.bottom)
          };
        }
      }
      parent = parent.parentElement;
    }
    return { top: viewportTop, bottom: viewportBottom };
  }

  function updateCharacterModifierSearchDirection() {
    const node = characterModifierSearchAnchor;
    const rect = node?.getBoundingClientRect?.();
    if (!rect) {
      characterModifierSearchOpenUp = false;
      return;
    }
    const bounds = characterModifierSearchClippingBounds(node);
    const spaceBelow = bounds.bottom - rect.bottom;
    const spaceAbove = rect.top - bounds.top;
    const openUpThreshold = 160;
    characterModifierSearchOpenUp = spaceBelow < openUpThreshold && spaceAbove > spaceBelow;
  }

  $effect(() => {
    if (characterModifierSearchSuggestions.length === 0) {
      characterModifierSearchOpenUp = false;
      return;
    }
    updateCharacterModifierSearchDirection();
  });

  async function pickCharacterModifierForRow(rowId, modifierId) {
    characterModifierSearchTerm = '';
    await onAddDropCharacterModifier(rowId, modifierId);
  }

  function characterModifierOperatorClass(operator) {
    return operator === '-' ? 'is-negative' : 'is-positive';
  }

  let gatheringTimeOfDayPickerSelection = $state('');
  let gatheringWeatherPickerSelection = $state('');
  let gatheringBiomePickerSelection = $state('');
  $effect(() => {
    const biomeAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'biome');
    if (!biomeAvailable.some(option => option.id === gatheringBiomePickerSelection)) {
      gatheringBiomePickerSelection = biomeAvailable[0]?.id || '';
    }
    const timeAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'timeOfDay');
    if (!timeAvailable.some(option => option.id === gatheringTimeOfDayPickerSelection)) {
      gatheringTimeOfDayPickerSelection = timeAvailable[0]?.id || '';
    }
    const weatherAvailable = gatheringConditionAvailableOptions(selectedGatheringDrop, 'weather');
    if (!weatherAvailable.some(option => option.id === gatheringWeatherPickerSelection)) {
      gatheringWeatherPickerSelection = weatherAvailable[0]?.id || '';
    }
  });

  let gatheringHazardTimeOfDayPickerSelection = $state('');
  let gatheringHazardWeatherPickerSelection = $state('');
  let gatheringHazardBiomePickerSelection = $state('');
  $effect(() => {
    const biomeAvailable = gatheringConditionAvailableOptions(editingGatheringHazard, 'biome');
    if (!biomeAvailable.some(option => option.id === gatheringHazardBiomePickerSelection)) {
      gatheringHazardBiomePickerSelection = biomeAvailable[0]?.id || '';
    }
    const timeAvailable = gatheringConditionAvailableOptions(editingGatheringHazard, 'timeOfDay');
    if (!timeAvailable.some(option => option.id === gatheringHazardTimeOfDayPickerSelection)) {
      gatheringHazardTimeOfDayPickerSelection = timeAvailable[0]?.id || '';
    }
    const weatherAvailable = gatheringConditionAvailableOptions(editingGatheringHazard, 'weather');
    if (!weatherAvailable.some(option => option.id === gatheringHazardWeatherPickerSelection)) {
      gatheringHazardWeatherPickerSelection = weatherAvailable[0]?.id || '';
    }
  });

  function gatheringHazardModifierPickerSelection(kind) {
    if (kind === 'biome') return gatheringHazardBiomePickerSelection;
    return kind === 'weather' ? gatheringHazardWeatherPickerSelection : gatheringHazardTimeOfDayPickerSelection;
  }

  function setGatheringHazardModifierPickerSelection(kind, value) {
    if (kind === 'biome') gatheringHazardBiomePickerSelection = value;
    else if (kind === 'weather') gatheringHazardWeatherPickerSelection = value;
    else gatheringHazardTimeOfDayPickerSelection = value;
  }

  function gatheringDropModifierPickerSelection(kind) {
    if (kind === 'biome') return gatheringBiomePickerSelection;
    return kind === 'weather' ? gatheringWeatherPickerSelection : gatheringTimeOfDayPickerSelection;
  }

  function setGatheringDropModifierPickerSelection(kind, value) {
    if (kind === 'biome') gatheringBiomePickerSelection = value;
    else if (kind === 'weather') gatheringWeatherPickerSelection = value;
    else gatheringTimeOfDayPickerSelection = value;
  }

  function gatheringModifierSignedValue(modifier) {
    return (modifier?.operator === '-' ? -1 : 1) * Math.abs(Math.trunc(Number(modifier?.value || 0)));
  }

  function gatheringModifierValueClass(modifier) {
    const signed = gatheringModifierSignedValue(modifier);
    if (signed > 0) return 'is-positive';
    if (signed < 0) return 'is-negative';
    return 'is-zero';
  }

  function gatheringModifierDisplayValue(modifier) {
    const value = Math.abs(Math.trunc(Number(modifier?.value || 0)));
    if (modifier?.operator === '-') return value > 0 ? `-${value}` : '-';
    return value > 0 ? `+${value}` : '0';
  }

  function signedToOperatorValue(raw) {
    const text = String(raw ?? '');
    const negative = text.trim().startsWith('-');
    const digits = text.replace(/[^0-9]/g, '');
    const value = digits === '' ? 0 : Math.abs(Math.trunc(Number(digits)));
    return { operator: negative ? '-' : '+', value };
  }

  function onGatheringDropModifierKeydown(rowId, kind, modifier, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = signedToOperatorValue(String(gatheringModifierSignedValue(modifier) + (event.key === 'ArrowUp' ? 1 : -1)));
    event.currentTarget.value = gatheringModifierDisplayValue(next);
    updateGatheringDropModifier(rowId, kind, modifier.id, next);
  }

  function onGatheringHazardModifierKeydown(kind, modifier, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const next = signedToOperatorValue(String(gatheringModifierSignedValue(modifier) + (event.key === 'ArrowUp' ? 1 : -1)));
    event.currentTarget.value = gatheringModifierDisplayValue(next);
    updateGatheringHazardConditionModifier(kind, modifier.id, next);
  }

  async function setCharacterModifierOverrideEnabled(rowId, ref, enabled, libraryEntry) {
    const expressionOverride = enabled ? (libraryEntry?.expression || '') : '';
    await onUpdateDropCharacterModifier(rowId, ref.id, { expressionOverride });
  }

  async function onUpdateDropCharacterModifier(rowId, refId, patch) {
    if (!editingGatheringTask?.id || !rowId || !refId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find(entry => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const nextRefs = refs.map(ref => ref.id === refId ? { ...ref, ...patch } : ref);
    updateGatheringTaskDrop(rowId, { characterModifiers: nextRefs });
  }

  async function onDeleteDropCharacterModifier(rowId, refId) {
    if (!editingGatheringTask?.id || !rowId || !refId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const row = rows.find(entry => entry.id === rowId);
    if (!row) return;
    const refs = Array.isArray(row.characterModifiers) ? row.characterModifiers : [];
    const nextRefs = refs.filter(ref => ref.id !== refId);
    if (nextRefs.length === refs.length) return;
    updateGatheringTaskDrop(rowId, { characterModifiers: nextRefs });
  }

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
  const gatheringNavItems = [
    {
      id: 'environments',
      icon: 'fas fa-seedling',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments',
      labelFallback: 'Environments'
    },
    {
      id: 'tasks',
      icon: 'fas fa-list-check',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks',
      labelFallback: 'Tasks',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle',
      titleFallback: 'Gathering Tasks',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint',
      hintFallback: 'Browse gathering tasks before attaching them to environments.'
    },
    {
      id: 'encounters',
      icon: 'fas fa-exclamation-triangle',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters',
      labelFallback: 'Hazards',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle',
      titleFallback: 'Gathering hazards',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint',
      hintFallback: 'Browse reusable hazards before attaching them to environments.'
    },
    {
      id: 'settings',
      icon: 'fas fa-sliders',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings',
      labelFallback: 'Settings',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderTitle',
      titleFallback: 'Gathering settings',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint',
      hintFallback: 'Set system-level rules for gathering.'
    }
  ];
  const gatheringInspectorTabs = gatheringNavItems.filter(tab => tab.id !== 'environments');
  const isGatheringRoute = $derived(currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-hazard-edit');
  const isActiveGatheringChildRoute = $derived(
    isGatheringRoute && gatheringNavItems.some(tab => tab.id === activeGatheringTab)
  );
  const activeGatheringInspectorTab = $derived(
    gatheringInspectorTabs.find(tab => tab.id === activeGatheringTab) || null
  );
  const selectedGatheringRules = $derived($viewState.gatheringConfig?.systems?.[selectedSystemId]?.rules || {
    rewardSelectionMode: 'highestRankedDrop',
    rewardLimit: 1,
    hazardSelectionMode: 'allDrops',
    hazardLimit: 1,
    hazardPolicy: 'successWithHazard',
    toolBreakagePolicy: 'failureOnBreak',
    biomeModifierAggregation: 'strongestOfEach'
  });
  const selectedGatheringSystemConfig = $derived($viewState.gatheringConfig?.systems?.[selectedSystemId] || {});
  const gatheringTaskDefinitions = $derived(Array.isArray(selectedGatheringSystemConfig.tasks) ? selectedGatheringSystemConfig.tasks : []);
  const gatheringHazardDefinitions = $derived(Array.isArray(selectedGatheringSystemConfig.hazards) ? selectedGatheringSystemConfig.hazards : []);
  const selectedGatheringSystemTools = $derived(Array.isArray(selectedGatheringSystemConfig.tools) ? selectedGatheringSystemConfig.tools : []);
  const toolsNavCount = $derived(selectedGatheringSystemTools.length);
  const gatheringNavCounts = $derived({
    environments: environmentList.length,
    tasks: gatheringTaskDefinitions.length,
    encounters: gatheringHazardDefinitions.length,
    total: environmentList.length + gatheringTaskDefinitions.length + gatheringHazardDefinitions.length
  });
  const selectedGatheringTask = $derived(
    gatheringTaskDefinitions.find(task => task.id === selectedGatheringTaskId)
      || gatheringTaskDefinitions[0]
      || null
  );
  const selectedGatheringHazard = $derived(
    gatheringHazardDefinitions.find(hazard => hazard.id === selectedGatheringHazardId)
      || gatheringHazardDefinitions[0]
      || null
  );
  const editingGatheringTask = $derived(gatheringTaskDraft || selectedGatheringTask);
  const selectedGatheringDrop = $derived(
    gatheringTaskDropRows(editingGatheringTask).find(row => row.id === selectedGatheringDropId)
      || gatheringTaskDropRows(editingGatheringTask)[0]
      || null
  );
  const gatheringTaskDraftDirty = $derived(
    !!(gatheringTaskDraft && gatheringTaskDraftBaseline
      && JSON.stringify(gatheringTaskDraft) !== JSON.stringify(gatheringTaskDraftBaseline))
  );
  const gatheringTaskValidation = $derived(
    gatheringTaskDraft
      ? (store.validateGatheringLibraryTask?.(gatheringTaskDraft) || { valid: true, errors: [] })
      : { valid: true, errors: [] }
  );

  const editingGatheringHazard = $derived(gatheringHazardDraft || selectedGatheringHazard);
  const gatheringHazardDraftDirty = $derived(
    !!(gatheringHazardDraft && gatheringHazardDraftBaseline
      && JSON.stringify(gatheringHazardDraft) !== JSON.stringify(gatheringHazardDraftBaseline))
  );
  const gatheringHazardValidation = $derived(validateGatheringHazardDraft(gatheringHazardDraft));

  function validateGatheringHazardDraft(draft) {
    if (!draft) return { valid: true, errors: [] };
    const errors = [];
    if (!String(draft?.name || '').trim()) {
      errors.push(text('FABRICATE.Admin.Manager.Environment.Hazards.NameRequired', 'Name is required.'));
    }
    const rate = Number(draft?.dropRate);
    if (!Number.isFinite(rate) || rate < 1 || rate > 100) {
      errors.push(text('FABRICATE.Admin.Manager.Environment.Hazards.DropRateInvalid', 'Drop rate must be between 1 and 100.'));
    }
    return { valid: errors.length === 0, errors };
  }

  const libraryToolsList = $derived(Array.isArray($viewState.toolsDraft) ? $viewState.toolsDraft : []);
  const dirtyToolIds = $derived(Array.isArray($viewState.toolsDraftDirtyToolIds) ? $viewState.toolsDraftDirtyToolIds : []);
  const selectedLibraryTool = $derived(
    libraryToolsList.find(tool => tool.id === $viewState.toolsDraftSelectedToolId) || null
  );
  const selectedLibraryToolDirty = $derived(
    selectedLibraryTool ? dirtyToolIds.includes(selectedLibraryTool.id) : false
  );
  const selectedToolDraftValidation = $derived(
    currentView === 'tools' && selectedLibraryTool
      ? (store.validateToolDraft?.(selectedLibraryTool.id) || { valid: true, errors: [] })
      : { valid: true, errors: [] }
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
    selectedGatheringTaskId = '';
    selectedGatheringHazardId = '';
    gatheringTaskDraft = null;
    gatheringTaskDraftBaseline = null;
    gatheringTaskSaving = false;
    gatheringTaskSaveError = '';
    gatheringHazardDraft = null;
    gatheringHazardDraftBaseline = null;
    gatheringHazardSaving = false;
    gatheringHazardSaveError = '';
    gatheringMenuExpanded = isGatheringRoute;
    store?.cancelToolsDraft?.();
    lastGatheringSystemId = selectedSystemId;
  });

  $effect(() => {
    if (activeGatheringTab === 'environments') return;
    if (currentView === 'environments' && canShowEnvironments) return;
    if (currentView === 'gathering-task-edit' && canShowEnvironments) return;
    if (currentView === 'gathering-hazard-edit' && canShowEnvironments) return;
    activeGatheringTab = 'environments';
  });

  $effect(() => {
    if (!isActiveGatheringChildRoute || gatheringMenuExpanded) return;
    gatheringMenuExpanded = true;
  });

  $effect(() => {
    if (!canShowEnvironments) {
      selectedGatheringTaskId = '';
      selectedGatheringDropId = '';
      return;
    }
    if (selectedGatheringTaskId && gatheringTaskDefinitions.some(task => task.id === selectedGatheringTaskId)) return;
    selectedGatheringTaskId = gatheringTaskDefinitions[0]?.id || '';
  });

  $effect(() => {
    if (!canShowEnvironments) {
      selectedGatheringHazardId = '';
      return;
    }
    if (selectedGatheringHazardId && gatheringHazardDefinitions.some(hazard => hazard.id === selectedGatheringHazardId)) return;
    selectedGatheringHazardId = gatheringHazardDefinitions[0]?.id || '';
  });

  $effect(() => {
    if (!editingGatheringTask) {
      selectedGatheringDropId = '';
      return;
    }
    const rows = gatheringTaskDropRows(editingGatheringTask);
    if (selectedGatheringDropId && rows.some(row => row.id === selectedGatheringDropId)) return;
    selectedGatheringDropId = rows[0]?.id || '';
  });

  $effect(() => {
    services?.registerEssenceDirtyGuard?.(() => confirmEssenceRouteExit('close'));
    return () => services?.registerEssenceDirtyGuard?.(null);
  });

  $effect(() => {
    if (toolsComponentPageIndex > 0 && toolsComponentPageIndex * toolsComponentPageSize >= toolsFilteredComponentCards.length) toolsComponentPageIndex = 0;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function toolsComponentCardImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function toolsComponentDescription(item) {
    return String(item?.description || '').trim();
  }

  function onToolsComponentSearchInput(event) {
    toolsComponentSearchTerm = event.currentTarget.value;
    toolsComponentPageIndex = 0;
  }

  function onToolsComponentDragStart(item, event) {
    const componentId = String(item?.id || '').trim();
    if (!componentId) return;
    event.dataTransfer?.setData?.('text/plain', JSON.stringify({ type: 'FabricateManagedComponent', componentId }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }

  function gatheringDropModeLabel(mode) {
    const labels = {
      highestRankedDrop: text('FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop', 'Highest ranked successful drop'),
      allDrops: text('FABRICATE.Admin.Manager.Environment.Rules.AllDrops', 'All successful drops'),
      limitedDrops: text('FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops', 'Limit successful drops')
    };
    return labels[mode] || labels.highestRankedDrop;
  }

  function gatheringHazardPolicyLabel(policy) {
    return policy === 'failureWithHazard'
      ? text('FABRICATE.Admin.Manager.Environment.Rules.GatheringFails', 'Gathering fails')
      : text('FABRICATE.Admin.Manager.Environment.Rules.GatheringSucceeds', 'Gathering succeeds');
  }

  function updateSelectedGatheringRules(updates) {
    if (!selectedSystemId) return;
    store.updateGatheringRules?.(selectedSystemId, updates);
  }

  function updateSelectedGatheringCondition(kind, value) {
    if (!selectedSystemId || !kind) return;
    store.updateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId });
  }

  function adjustGatheringRuleLimit(field, delta) {
    const current = Number(selectedGatheringRules?.[field] || 1);
    updateSelectedGatheringRules({ [field]: Math.max(1, Math.floor(current + delta)) });
  }

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
  }

  function resolutionModeLabel(mode) {
    const labels = {
      simple: text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple'),
      routed: text('FABRICATE.Admin.Manager.ResolutionRouted', 'Routed'),
      mapped: text('FABRICATE.Admin.Manager.ResolutionMappedLegacy', 'Legacy routed'),
      tiered: text('FABRICATE.Admin.Manager.ResolutionTieredLegacy', 'Legacy routed by check'),
      progressive: text('FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'),
      alchemy: text('FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy')
    };
    return labels[mode] || mode || text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple');
  }

  function featureLabels(system) {
    if (!system?.features) return [];
    const featureMap = [
      ['gathering', 'FABRICATE.Admin.Manager.Feature.Gathering', 'Gathering'],
      ['essences', 'FABRICATE.Admin.Manager.Feature.Essences', 'Essences'],
      ['complexRecipes', 'FABRICATE.Admin.Manager.Feature.ComplexRecipes', 'Complex recipes'],
      ['multiStepRecipes', 'FABRICATE.Admin.Manager.Feature.MultiStepRecipes', 'Multi-step recipes'],
      ['craftingChecks', 'FABRICATE.Admin.Manager.Feature.CraftingChecks', 'Crafting checks'],
      ['outcomeRouting', 'FABRICATE.Admin.Manager.Feature.OutcomeRouting', 'Outcome routing'],
      ['effectTransfer', 'FABRICATE.Admin.Manager.Feature.EffectTransfer', 'Effect transfer'],
      ['propertyMacros', 'FABRICATE.Admin.Manager.Feature.PropertyMacros', 'Property macros']
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
    const offLabel = text('FABRICATE.Admin.Manager.Off', 'Off');
    return [
      {
        id: 'components',
        label: text('FABRICATE.Admin.Manager.Column.Components', 'Components'),
        value: counts.components
      },
      {
        id: 'recipes',
        label: text('FABRICATE.Admin.Manager.Column.Recipes', 'Recipes'),
        value: counts.recipes
      },
      counts.environments == null
        ? {
          id: 'environments',
          label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
          value: offLabel,
          isOff: true
        }
        : {
          id: 'environments',
          label: text('FABRICATE.Admin.Manager.GatheringEnvironments', 'Gathering environments'),
          value: counts.environments
        },
      {
        id: 'essences',
        label: text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences'),
        value: counts.essences
      },
      {
        id: 'item-tags',
        label: text('FABRICATE.Admin.Manager.Feature.ItemTags', 'Item tags'),
        value: counts.itemTags
      },
      {
        id: 'recipe-categories',
        label: text('FABRICATE.Admin.Manager.Feature.RecipeCategories', 'Recipe categories'),
        value: counts.recipeCategories
      }
    ];
  }

  function buildSelectedGatheringConditionShortcuts(system, gatheringConfig) {
    if (system?.features?.gathering !== true) return [];
    const systemConditions = gatheringConfig?.systems?.[system.id]?.conditions || {};
    return [
      {
        kind: 'timeOfDay',
        icon: 'fas fa-clock',
        label: text('FABRICATE.Admin.Manager.CurrentTimeOfDay', 'Current time of day'),
        setting: systemConditions.timeOfDay || {
          enabled: true,
          current: gatheringConfig?.conditions?.timeOfDay || 'day',
          values: gatheringConfig?.vocabularies?.timeOfDay || []
        }
      },
      {
        kind: 'weather',
        icon: 'fas fa-cloud-sun',
        label: text('FABRICATE.Admin.Manager.CurrentWeather', 'Current weather'),
        setting: systemConditions.weather || {
          enabled: true,
          current: gatheringConfig?.conditions?.weather || 'clear',
          values: gatheringConfig?.vocabularies?.weather || []
        }
      }
    ].filter(condition => condition.setting?.enabled !== false && conditionValues(condition.setting).length > 0);
  }

  function conditionId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionValues(setting) {
    return Array.isArray(setting?.values) ? setting.values : [];
  }

  function normalizedActiveView(view, system, environmentsAvailable, essencesAvailable) {
    if (!system) return 'systems';
    if ((view === 'environments' || view === 'environment-edit' || view === 'gathering-task-edit' || view === 'gathering-hazard-edit') && !environmentsAvailable) return 'systems';
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
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Title', 'Recipes');
    if (currentView === 'components') return text('FABRICATE.Admin.Manager.Component.Title', 'Components');
    if (currentView === 'component-edit') return text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Title', 'Tags & Categories');
    if (currentView === 'essences') return text('FABRICATE.Admin.Manager.Essence.Title', 'Essences');
    if (currentView === 'essence-edit') return isCreatingEssenceDraft
      ? text('FABRICATE.Admin.Manager.Essence.CreateTitle', 'Create essence')
      : text('FABRICATE.Admin.Manager.Essence.EditTitle', 'Edit essence');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle', 'Gathering Tasks');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Title', 'Tools');
    if (currentView === 'environments') return text('FABRICATE.Admin.Manager.Environment.Title', 'Environments');
    if (currentView === 'environment-edit') {
      const base = text('FABRICATE.Admin.Manager.Environment.EditTitle', 'Edit environment');
      const environmentName = String(environmentDraftForDisplay?.name || '').trim();
      return environmentName ? `${base}: ${environmentName}` : base;
    }
    if (currentView === 'gathering-task-edit') return text('FABRICATE.Admin.Manager.Environment.Tasks.EditTitle', 'Edit gathering task');
    if (currentView === 'gathering-hazard-edit') return text('FABRICATE.Admin.Manager.Environment.Hazards.EditTitle', 'Edit gathering hazard');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.Manager.SystemEdit.Title', 'System settings');
    return text('FABRICATE.Admin.Manager.Title', 'Crafting systems');
  }

  function viewSubtitle() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Subtitle', 'Manage recipes for the selected crafting system.');
    if (currentView === 'components') return text('FABRICATE.Admin.Manager.Component.Subtitle', 'Manage item-backed components for the selected crafting system.');
    if (currentView === 'component-edit') return text('FABRICATE.Admin.Manager.Component.EditSubtitle', 'Update tags, essences, and source linkage for this component.');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Subtitle', 'Manage recipe category and item tag vocabulary for the selected crafting system.');
    if (currentView === 'essences') return text('FABRICATE.Admin.Manager.Essence.Subtitle', 'Manage essence definitions for the selected crafting system.');
    if (currentView === 'essence-edit' && isCreatingEssenceDraft && showEssenceSourceUi) return text('FABRICATE.Admin.Manager.Essence.CreateSubtitle', 'Define identity, icon, and source linkage for a new essence.');
    if (currentView === 'essence-edit' && isCreatingEssenceDraft) return text('FABRICATE.Admin.Manager.Essence.CreateNoSourceSubtitle', 'Define identity and icon for a new essence.');
    if (currentView === 'essence-edit' && showEssenceSourceUi) return text('FABRICATE.Admin.Manager.Essence.EditSubtitle', 'Update identity, icon, and source linkage for this essence.');
    if (currentView === 'essence-edit') return text('FABRICATE.Admin.Manager.Essence.EditNoSourceSubtitle', 'Update identity and icon for this essence.');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint', 'Browse gathering tasks before attaching them to environments.');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Subtitle', 'Manage reusable gathering tools and configure how they behave when required by tasks.');
    if (currentView === 'environments') return text('FABRICATE.Admin.Manager.Environment.Subtitle', 'Manage gathering environments for the selected crafting system.');
    if (currentView === 'environment-edit') {
      const environmentDescription = String(environmentDraftForDisplay?.description || '').trim();
      return environmentDescription || text('FABRICATE.Admin.Manager.Environment.EditSubtitle', 'Edit scene linkage, environment details, tasks, results, catalysts, visibility, timing, and validation in the workspace.');
    }
    if (currentView === 'gathering-task-edit') return text('FABRICATE.Admin.Manager.Environment.Tasks.EditSubtitle', 'Edit availability, identity, and drop rules for the selected gathering task.');
    if (currentView === 'gathering-hazard-edit') return text('FABRICATE.Admin.Manager.Environment.Hazards.EditSubtitle', 'Edit identity, availability, danger, and modifiers for the selected hazard.');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.Manager.SystemEdit.Subtitle', 'Edit base settings for the selected crafting system.');
    return text('FABRICATE.Admin.Manager.Subtitle', 'Manage the system definitions that organize Fabricate components, recipes, gathering, and feature rules.');
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

  function headerActionsLabel() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Actions', 'Recipe actions');
    if (currentView === 'components' || currentView === 'component-edit') return text('FABRICATE.Admin.Manager.Component.Actions', 'Component actions');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Actions', 'Tags and categories actions');
    if (currentView === 'essences' || currentView === 'essence-edit') return text('FABRICATE.Admin.Manager.Essence.Actions', 'Essence actions');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.Tasks.Actions', 'Gathering task actions');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Actions', 'Tools actions');
    if (currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-hazard-edit') return text('FABRICATE.Admin.Manager.Environment.Actions', 'Environment actions');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.Manager.SystemEdit.Actions', 'System edit actions');
    return text('FABRICATE.Admin.Manager.SystemActions', 'System actions');
  }

  function inspectorLabel() {
    if (currentView === 'recipes') return text('FABRICATE.Admin.Manager.Recipe.Inspector', 'Selected recipe inspector');
    if (currentView === 'components') return text('FABRICATE.Admin.Manager.Component.Inspector', 'Selected component inspector');
    if (currentView === 'tags') return text('FABRICATE.Admin.Manager.TagsCategories.Inspector', 'Tags and categories inspector');
    if (currentView === 'essences' || currentView === 'essence-edit') return text('FABRICATE.Admin.Manager.Essence.Inspector', 'Selected essence inspector');
    if (currentView === 'environments' && activeGatheringTab === 'tasks') return text('FABRICATE.Admin.Manager.Environment.Tasks.Inspector', 'Selected gathering task inspector');
    if (currentView === 'tools') return text('FABRICATE.Admin.Manager.Tools.Inspector', 'Selected tool inspector');
    if (currentView === 'environments') return text('FABRICATE.Admin.Manager.Environment.Inspector', 'Selected environment inspector');
    if (currentView === 'system-edit') return text('FABRICATE.Admin.Manager.SystemEdit.Inspector', 'System edit evidence');
    return text('FABRICATE.Admin.Manager.SelectedSystemInspector', 'Selected system inspector');
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

  function finishGatheringTaskRouteExit(confirmed) {
    if (confirmed === false) return false;
    clearGatheringTaskDraft();
    return true;
  }

  function finishGatheringHazardRouteExit(confirmed) {
    if (confirmed === false) return false;
    clearGatheringHazardDraft();
    return true;
  }

  function confirmGatheringHazardRouteExit(nextView) {
    if (activeView !== 'gathering-hazard-edit') return true;
    if (!gatheringHazardDraftDirty) return finishGatheringHazardRouteExit(true);
    const confirmed = store.confirmDiscardDirtyGatheringHazardDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishGatheringHazardRouteExit);
    return finishGatheringHazardRouteExit(confirmed);
  }

  function confirmComponentRouteExit(nextView) {
    if (activeView !== 'component-edit') return true;
    if (componentEditDirty !== true) return true;
    const confirmed = store.confirmDiscardDirtyComponentDraft?.() ?? false;
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
    const confirmed = store.confirmDiscardDirtyEssenceDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishEssenceRouteExit);
    return finishEssenceRouteExit(confirmed);
  }

  function confirmGatheringTaskRouteExit(nextView) {
    if (activeView !== 'gathering-task-edit') return true;
    if (!gatheringTaskDraftDirty) return finishGatheringTaskRouteExit(true);
    const confirmed = store.confirmDiscardDirtyGatheringTaskDraft?.() ?? false;
    if (isPromise(confirmed)) return confirmed.then(finishGatheringTaskRouteExit);
    return finishGatheringTaskRouteExit(confirmed);
  }

  function confirmRouteExit(nextView) {
    const environmentConfirmed = confirmEnvironmentRouteExit(nextView);
    if (isPromise(environmentConfirmed)) {
      return environmentConfirmed.then(value => {
        if (value === false) return false;
        const essenceResult = confirmEssenceRouteExit(nextView);
        if (isPromise(essenceResult)) {
          return essenceResult.then(essenceValue => essenceValue === false
            ? false
            : continueRouteExitAfterEssence(nextView));
        }
        return essenceResult === false ? false : continueRouteExitAfterEssence(nextView);
      });
    }
    if (environmentConfirmed === false) return false;
    const essenceResult = confirmEssenceRouteExit(nextView);
    if (isPromise(essenceResult)) {
      return essenceResult.then(value => value === false ? false : continueRouteExitAfterEssence(nextView));
    }
    if (essenceResult === false) return false;
    return continueRouteExitAfterEssence(nextView);
  }

  function continueRouteExitAfterEssence(nextView) {
    const componentResult = confirmComponentRouteExit(nextView);
    if (isPromise(componentResult)) {
      return componentResult.then(value => value === false ? false : continueRouteExitAfterComponent(nextView));
    }
    if (componentResult === false) return false;
    return continueRouteExitAfterComponent(nextView);
  }

  function continueRouteExitAfterComponent(nextView) {
    const taskResult = confirmGatheringTaskRouteExit(nextView);
    if (isPromise(taskResult)) {
      return taskResult.then(value => value === false ? false : continueRouteExitAfterTask(nextView));
    }
    if (taskResult === false) return false;
    return continueRouteExitAfterTask(nextView);
  }

  function continueRouteExitAfterTask(nextView) {
    const hazardResult = confirmGatheringHazardRouteExit(nextView);
    if (isPromise(hazardResult)) {
      return hazardResult.then(value => value === false ? false : confirmToolsRouteExit(nextView));
    }
    if (hazardResult === false) return false;
    return confirmToolsRouteExit(nextView);
  }

  async function finishToolsRouteExit(action) {
    if (action === 'save') {
      const saved = await store?.saveAllDirtyToolDrafts?.();
      if (saved === false) return false;
      store?.cancelToolsDraft?.();
      return true;
    }
    if (action === 'discard' || action === true) {
      store?.cancelToolsDraft?.();
      return true;
    }
    return false;
  }

  function confirmToolsRouteExit(nextView) {
    if (activeView !== 'tools') return true;
    if (nextView === 'tools') return true;
    if (!store?.isToolsDraftDirty?.()) {
      store?.cancelToolsDraft?.();
      return true;
    }
    const confirmation = services?.confirmDirtyToolsNavigation
      ? services.confirmDirtyToolsNavigation({ dirtyCount: dirtyToolIds.length })
      : store?.confirmDiscardDirtyToolsDraft?.();
    if (isPromise(confirmation)) return confirmation.then(finishToolsRouteExit);
    return finishToolsRouteExit(confirmation);
  }

  function setView(view) {
    if ((view === 'recipes' || view === 'components' || view === 'component-edit' || view === 'tags' || view === 'system-edit' || view === 'tools') && !selectedSystem) return;
    if ((view === 'environments' || view === 'environment-edit' || view === 'gathering-task-edit' || view === 'gathering-hazard-edit') && !canShowEnvironments) return;
    if ((view === 'essences' || view === 'essence-edit') && !canShowEssences) return;
    afterTruthyResult(confirmRouteExit(view), () => {
      activeView = view;
      if (view === 'tools') store?.enterToolsDraft?.(selectedSystemId);
    });
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
      if (canShowEnvironments) gatheringMenuExpanded = true;
    });
  }

  function backToEssencesBrowse() {
    afterTruthyResult(confirmRouteExit('essences'), () => {
      activeView = canShowEssences ? 'essences' : 'systems';
    });
  }

  function saveEnvironmentEdit() {
    store.saveEnvironmentDraft?.();
  }

  function essenceEditSaveLabel() {
    if (essenceEditSaving) return text('FABRICATE.Admin.Manager.Essence.Saving', 'Saving...');
    return isCreatingEssenceDraft
      ? text('FABRICATE.Admin.Manager.Essence.Create', 'Create essence')
      : text('FABRICATE.Admin.Manager.Essence.Save', 'Save essence');
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
    if (componentEditSaving) return text('FABRICATE.Admin.Manager.Component.Saving', 'Saving...');
    return text('FABRICATE.Admin.Manager.Component.SaveComponent', 'Save Component');
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
      ? 'FABRICATE.Admin.Manager.TagsCategories.RemoveCategoryConfirm'
      : 'FABRICATE.Admin.Manager.TagsCategories.RemoveTagConfirm';
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

  function selectGatheringTask(taskId = selectedGatheringTask?.id) {
    selectedGatheringTaskId = taskId || '';
  }

  function createGatheringTask(systemId = selectedSystemId) {
    if (!systemId) return;
    const created = store.addGatheringLibraryTask?.(systemId);
    if (isPromise(created)) {
      created.then(task => {
        if (task?.id) selectedGatheringTaskId = task.id;
      });
      return;
    }
    if (created?.id) selectedGatheringTaskId = created.id;
  }

  function editGatheringTask(taskId = selectedGatheringTask?.id) {
    if (!taskId || !canShowEnvironments) return;
    selectedGatheringTaskId = taskId;
    const source = gatheringTaskDefinitions.find(task => task.id === taskId) || null;
    const snapshot = source ? JSON.parse(JSON.stringify(source)) : null;
    gatheringTaskDraft = snapshot;
    gatheringTaskDraftBaseline = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    gatheringTaskSaveError = '';
    activeGatheringTab = 'tasks';
    gatheringMenuExpanded = true;
    activeView = 'gathering-task-edit';
  }

  function clearGatheringTaskDraft() {
    gatheringTaskDraft = null;
    gatheringTaskDraftBaseline = null;
    gatheringTaskSaveError = '';
  }

  function backToGatheringTaskLibrary() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeGatheringTab = 'tasks';
      gatheringMenuExpanded = true;
      activeView = 'environments';
    });
  }

  async function saveGatheringTaskDraft() {
    if (!gatheringTaskDraft || !selectedSystemId || !selectedGatheringTaskId) return;
    const { valid, errors } = gatheringTaskValidation;
    if (!valid) {
      gatheringTaskSaveError = errors[0] || '';
      return;
    }
    gatheringTaskSaving = true;
    try {
      const ok = await store.updateGatheringLibraryTask?.(selectedSystemId, selectedGatheringTaskId, gatheringTaskDraft);
      if (ok) {
        gatheringTaskDraftBaseline = JSON.parse(JSON.stringify(gatheringTaskDraft));
        gatheringTaskSaveError = '';
      } else {
        gatheringTaskSaveError = text('FABRICATE.Admin.Manager.Environment.Tasks.SaveFailed', 'Save failed. Try again.');
      }
    } catch (error) {
      console.error('Failed to save gathering task draft', error);
      gatheringTaskSaveError = text('FABRICATE.Admin.Manager.Environment.Tasks.SaveFailed', 'Save failed. Try again.');
    } finally {
      gatheringTaskSaving = false;
    }
  }

  async function deleteGatheringTaskDraft() {
    if (!selectedSystemId || !selectedGatheringTaskId) return;
    const deletedTaskId = selectedGatheringTaskId;
    const result = await store.deleteGatheringLibraryTask?.(selectedSystemId, deletedTaskId);
    if (result === false) return;
    if (selectedGatheringTaskId === deletedTaskId) selectedGatheringTaskId = '';
    gatheringTaskDraft = null;
    gatheringTaskDraftBaseline = null;
    gatheringTaskSaveError = '';
    activeGatheringTab = 'tasks';
    gatheringMenuExpanded = true;
    activeView = 'environments';
  }

  function duplicateGatheringTask(systemId = selectedSystemId, taskId = selectedGatheringTask?.id) {
    if (!systemId || !taskId) return;
    const duplicated = store.duplicateGatheringLibraryTask?.(systemId, taskId);
    if (isPromise(duplicated)) {
      duplicated.then(task => {
        if (task?.id) selectedGatheringTaskId = task.id;
      });
      return;
    }
    if (duplicated?.id) selectedGatheringTaskId = duplicated.id;
  }

  function deleteGatheringTask(systemId = selectedSystemId, taskId = selectedGatheringTask?.id) {
    if (!systemId || !taskId) return;
    const deleted = store.deleteGatheringLibraryTask?.(systemId, taskId);
    if (isPromise(deleted)) {
      deleted.then(value => {
        if (value !== false && selectedGatheringTaskId === taskId) selectedGatheringTaskId = '';
      });
      return;
    }
    if (deleted !== false && selectedGatheringTaskId === taskId) selectedGatheringTaskId = '';
  }

  function toggleGatheringTaskEnabled(systemId = selectedSystemId, taskId = selectedGatheringTask?.id, enabled = true) {
    if (!systemId || !taskId) return;
    store.updateGatheringLibraryTask?.(systemId, taskId, { enabled });
  }

  function selectGatheringHazard(hazardId = selectedGatheringHazard?.id) {
    selectedGatheringHazardId = hazardId || '';
  }

  function createGatheringHazard(systemId = selectedSystemId) {
    if (!systemId) return;
    const created = store.addGatheringLibraryHazard?.(systemId);
    if (isPromise(created)) {
      created.then(hazard => {
        if (hazard?.id) selectedGatheringHazardId = hazard.id;
      });
      return;
    }
    if (created?.id) selectedGatheringHazardId = created.id;
  }

  function editGatheringHazard(hazardId = selectedGatheringHazard?.id) {
    if (!hazardId || !canShowEnvironments) return;
    selectedGatheringHazardId = hazardId;
    const source = gatheringHazardDefinitions.find(hazard => hazard.id === hazardId) || null;
    const snapshot = source ? JSON.parse(JSON.stringify(source)) : null;
    gatheringHazardDraft = snapshot;
    gatheringHazardDraftBaseline = snapshot ? JSON.parse(JSON.stringify(snapshot)) : null;
    gatheringHazardSaveError = '';
    activeGatheringTab = 'encounters';
    gatheringMenuExpanded = true;
    activeView = 'gathering-hazard-edit';
  }

  function clearGatheringHazardDraft() {
    gatheringHazardDraft = null;
    gatheringHazardDraftBaseline = null;
    gatheringHazardSaveError = '';
    gatheringHazardSaving = false;
  }

  function backToGatheringHazardLibrary() {
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeGatheringTab = 'encounters';
      gatheringMenuExpanded = true;
      activeView = 'environments';
    });
  }

  async function saveGatheringHazardDraft() {
    if (!gatheringHazardDraft || !selectedSystemId || !selectedGatheringHazardId) return;
    const { valid, errors } = gatheringHazardValidation;
    if (!valid) {
      gatheringHazardSaveError = errors[0] || '';
      return;
    }
    gatheringHazardSaving = true;
    try {
      const ok = await store.updateGatheringLibraryHazard?.(selectedSystemId, selectedGatheringHazardId, gatheringHazardDraft);
      if (ok !== false) {
        gatheringHazardDraftBaseline = JSON.parse(JSON.stringify(gatheringHazardDraft));
        gatheringHazardSaveError = '';
      }
    } finally {
      gatheringHazardSaving = false;
    }
  }

  async function deleteGatheringHazardDraft() {
    if (!selectedGatheringHazardId || !selectedSystemId) return;
    const message = text(
      'FABRICATE.Admin.Manager.Environment.Hazards.DeleteConfirm',
      'Delete this hazard? This cannot be undone.'
    );
    const confirmed = typeof globalThis.confirm === 'function' ? globalThis.confirm(message) : true;
    if (confirmed === false) return;
    const deletedId = selectedGatheringHazardId;
    await store.deleteGatheringLibraryHazard?.(selectedSystemId, deletedId);
    if (selectedGatheringHazardId === deletedId) selectedGatheringHazardId = '';
    clearGatheringHazardDraft();
    activeGatheringTab = 'encounters';
    gatheringMenuExpanded = true;
    activeView = 'environments';
  }

  function duplicateGatheringHazard(systemId = selectedSystemId, hazardId = selectedGatheringHazard?.id) {
    if (!systemId || !hazardId) return;
    const duplicated = store.duplicateGatheringLibraryHazard?.(systemId, hazardId);
    if (isPromise(duplicated)) {
      duplicated.then(hazard => {
        if (hazard?.id) selectedGatheringHazardId = hazard.id;
      });
      return;
    }
    if (duplicated?.id) selectedGatheringHazardId = duplicated.id;
  }

  function deleteGatheringHazard(systemId = selectedSystemId, hazardId = selectedGatheringHazard?.id) {
    if (!systemId || !hazardId) return;
    const deleted = store.deleteGatheringLibraryHazard?.(systemId, hazardId);
    if (isPromise(deleted)) {
      deleted.then(value => {
        if (value !== false && selectedGatheringHazardId === hazardId) selectedGatheringHazardId = '';
      });
      return;
    }
    if (deleted !== false && selectedGatheringHazardId === hazardId) selectedGatheringHazardId = '';
  }

  function toggleGatheringHazardEnabled(systemId = selectedSystemId, hazardId = selectedGatheringHazard?.id, enabled = true) {
    if (!systemId || !hazardId) return;
    store.updateGatheringLibraryHazard?.(systemId, hazardId, { enabled });
  }

  function updateSelectedGatheringHazard(updates = {}) {
    if (gatheringHazardDraft) {
      gatheringHazardDraft = { ...gatheringHazardDraft, ...updates };
      return true;
    }
    if (!selectedSystemId || !selectedGatheringHazard?.id) return false;
    return store.updateGatheringLibraryHazard?.(selectedSystemId, selectedGatheringHazard.id, updates);
  }

  function updateSelectedGatheringTask(updates = {}) {
    if (gatheringTaskDraft) {
      gatheringTaskDraft = { ...gatheringTaskDraft, ...updates };
      return true;
    }
    if (!selectedSystemId || !selectedGatheringTask?.id) return false;
    return store.updateGatheringLibraryTask?.(selectedSystemId, selectedGatheringTask.id, updates);
  }

  function addToolReferenceToSelectedTask(toolId) {
    if (!editingGatheringTask || !toolId) return;
    const existing = Array.isArray(editingGatheringTask.toolIds) ? editingGatheringTask.toolIds : [];
    if (existing.includes(toolId)) return;
    updateSelectedGatheringTask({ toolIds: [...existing, toolId] });
  }

  function removeToolReferenceFromSelectedTask(toolId) {
    if (!editingGatheringTask || !toolId) return;
    const existing = Array.isArray(editingGatheringTask.toolIds) ? editingGatheringTask.toolIds : [];
    updateSelectedGatheringTask({ toolIds: existing.filter(id => id !== toolId) });
  }

  function gatheringDropRowId() {
    return `drop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function addGatheringTaskDrop() {
    if (!editingGatheringTask) return;
    const row = {
      id: gatheringDropRowId(),
      name: '',
      componentId: '',
      itemUuid: '',
      quantity: 1,
      dropRate: 25,
      conditionModifiers: { timeOfDay: [], weather: [] },
      enabled: false
    };
    selectedGatheringDropId = row.id;
    updateSelectedGatheringTask({ dropRows: [...gatheringTaskDropRows(editingGatheringTask), row] });
  }

  function updateGatheringTaskDrop(rowId, updates = {}) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask).map(row => row.id === rowId ? { ...row, ...updates } : row);
    const patch = store.gatheringTaskAutopopulateFromComponent?.(selectedSystemId, editingGatheringTask, rows) || {};
    updateSelectedGatheringTask({ dropRows: rows, ...patch });
  }

  function duplicateGatheringTaskDrop(rowId = selectedGatheringDrop?.id) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex(row => row.id === rowId);
    if (index < 0) return;
    const duplicate = { ...JSON.parse(JSON.stringify(rows[index])), id: gatheringDropRowId() };
    selectedGatheringDropId = duplicate.id;
    updateSelectedGatheringTask({ dropRows: [...rows.slice(0, index + 1), duplicate, ...rows.slice(index + 1)] });
  }

  function deleteGatheringTaskDrop(rowId = selectedGatheringDrop?.id) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex(row => row.id === rowId);
    const nextRows = rows.filter(row => row.id !== rowId);
    selectedGatheringDropId = nextRows[Math.min(index, nextRows.length - 1)]?.id || '';
    updateSelectedGatheringTask({ dropRows: nextRows });
  }

  function moveGatheringTaskDrop(rowId, direction) {
    if (!editingGatheringTask || !rowId) return;
    const rows = gatheringTaskDropRows(editingGatheringTask);
    const index = rows.findIndex(row => row.id === rowId);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    updateSelectedGatheringTask({ dropRows: next });
  }

  async function importGatheringTaskDrop(rowId, data) {
    if (!rowId) return false;
    const item = await services?.importSingleManagedItemFromDrop?.(data);
    if (!item?.id) return false;
    updateGatheringTaskDrop(rowId, { componentId: item.id, itemUuid: '', name: '', enabled: true });
    selectedGatheringDropId = rowId;
    return true;
  }

  async function addToolFromDrop(data) {
    if (!data) return false;
    if (data.type === 'FabricateManagedComponent') {
      const componentId = data.componentId || data.id;
      if (!componentId) return false;
      return store.addToolToDraft?.({ componentId }) ?? false;
    }
    const item = await services?.importSingleManagedItemFromDrop?.(data);
    if (!item?.id) return false;
    return store.addToolToDraft?.({ componentId: item.id }) ?? false;
  }

  function gatheringConditionOptions(kind) {
    const setting = selectedGatheringSystemConfig.conditions?.[kind] || {};
    return Array.isArray(setting.values) ? setting.values : [];
  }

  function gatheringVocabularyOptions(kind) {
    const vocabulary = selectedGatheringSystemConfig.vocabularies?.[kind] || {};
    return Array.isArray(vocabulary.values) ? vocabulary.values : [];
  }

  function gatheringConditionModifierRows(row, kind) {
    const values = row?.conditionModifiers?.[kind];
    return Array.isArray(values) ? values : [];
  }

  function gatheringConditionAvailableOptions(row, kind) {
    const options = kind === 'biome' ? gatheringVocabularyOptions('biomes') : gatheringConditionOptions(kind);
    if (!row) return options;
    const attached = new Set(gatheringConditionModifierRows(row, kind).map(modifier => modifier.conditionId));
    return options.filter(option => !attached.has(option.id));
  }

  function gatheringConditionModifierGroups(row) {
    return {
      timeOfDay: gatheringConditionModifierRows(row, 'timeOfDay'),
      weather: gatheringConditionModifierRows(row, 'weather'),
      biome: gatheringConditionModifierRows(row, 'biome')
    };
  }

  function updateGatheringDropModifier(rowId, kind, modifierId, updates = {}) {
    if (!editingGatheringTask || !rowId || !kind || !modifierId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find(entry => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    conditionModifiers[kind] = conditionModifiers[kind].map(modifier => modifier.id === modifierId ? { ...modifier, ...updates } : modifier);
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function addGatheringDropModifier(rowId, kind, conditionId) {
    if (!editingGatheringTask || !rowId || !kind || !conditionId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find(entry => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    if (conditionModifiers[kind].some(modifier => modifier.conditionId === conditionId)) return;
    conditionModifiers[kind] = [
      ...conditionModifiers[kind],
      { id: `${kind}-${gatheringDropRowId()}`, conditionId, operator: '+', value: 0 }
    ];
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function deleteGatheringDropModifier(rowId, kind, modifierId) {
    if (!editingGatheringTask || !rowId || !kind || !modifierId) return;
    const row = gatheringTaskDropRows(editingGatheringTask).find(entry => entry.id === rowId);
    if (!row) return;
    const conditionModifiers = gatheringConditionModifierGroups(row);
    conditionModifiers[kind] = conditionModifiers[kind].filter(modifier => modifier.id !== modifierId);
    updateGatheringTaskDrop(rowId, { conditionModifiers });
  }

  function addGatheringHazardConditionModifier(kind, conditionId) {
    if (!editingGatheringHazard?.id || !kind || !conditionId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringHazard);
    if (conditionModifiers[kind].some(modifier => modifier.conditionId === conditionId)) return;
    conditionModifiers[kind] = [
      ...conditionModifiers[kind],
      { id: `${kind}-${gatheringDropRowId()}`, conditionId, operator: '+', value: 0 }
    ];
    updateSelectedGatheringHazard({ conditionModifiers });
  }

  function updateGatheringHazardConditionModifier(kind, modifierId, updates = {}) {
    if (!editingGatheringHazard?.id || !kind || !modifierId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringHazard);
    conditionModifiers[kind] = conditionModifiers[kind].map(modifier => modifier.id === modifierId ? { ...modifier, ...updates } : modifier);
    updateSelectedGatheringHazard({ conditionModifiers });
  }

  function deleteGatheringHazardConditionModifier(kind, modifierId) {
    if (!editingGatheringHazard?.id || !kind || !modifierId) return;
    const conditionModifiers = gatheringConditionModifierGroups(editingGatheringHazard);
    conditionModifiers[kind] = conditionModifiers[kind].filter(modifier => modifier.id !== modifierId);
    updateSelectedGatheringHazard({ conditionModifiers });
  }

  function pickCharacterModifierForHazard(modifierId) {
    if (!editingGatheringHazard?.id || !modifierId) return;
    const refs = Array.isArray(editingGatheringHazard.characterModifiers) ? editingGatheringHazard.characterModifiers : [];
    if (refs.some(ref => ref.modifierId === modifierId)) return;
    characterModifierSearchTerm = '';
    const newRef = {
      id: `char-mod-${modifierId}-${refs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
      modifierId,
      operator: '+',
      min: null,
      max: null,
      expressionOverride: ''
    };
    updateSelectedGatheringHazard({ characterModifiers: [...refs, newRef] });
  }

  function onUpdateHazardCharacterModifier(refId, patch) {
    if (!editingGatheringHazard?.id || !refId) return;
    const refs = Array.isArray(editingGatheringHazard.characterModifiers) ? editingGatheringHazard.characterModifiers : [];
    const next = refs.map(ref => ref.id === refId ? { ...ref, ...patch } : ref);
    updateSelectedGatheringHazard({ characterModifiers: next });
  }

  function onDeleteHazardCharacterModifier(refId) {
    if (!editingGatheringHazard?.id || !refId) return;
    const refs = Array.isArray(editingGatheringHazard.characterModifiers) ? editingGatheringHazard.characterModifiers : [];
    updateSelectedGatheringHazard({ characterModifiers: refs.filter(ref => ref.id !== refId) });
  }

  function setHazardCharacterModifierOverrideEnabled(ref, enabled, libraryEntry) {
    const expressionOverride = enabled ? (libraryEntry?.expression || '') : '';
    onUpdateHazardCharacterModifier(ref.id, { expressionOverride });
  }

  function moveEnvironment(environmentId = selectedEnvironment?.id, direction) {
    if (!environmentId || !direction) return;
    store.moveEnvironmentDraft?.(environmentId, direction);
  }

  function selectGatheringTab(tabId) {
    activeGatheringTab = gatheringNavItems.some(tab => tab.id === tabId) ? tabId : 'environments';
    gatheringMenuExpanded = true;
  }

  function openGatheringSection(tabId = 'environments') {
    if (!canShowEnvironments) return;
    const nextTab = gatheringNavItems.some(tab => tab.id === tabId) ? tabId : 'environments';
    afterTruthyResult(confirmRouteExit('environments'), () => {
      activeGatheringTab = nextTab;
      gatheringMenuExpanded = true;
      activeView = 'environments';
    });
  }

  async function saveSelectedToolDraft() {
    const toolId = $viewState.toolsDraftSelectedToolId;
    if (!toolId || !store?.saveToolDraft) return;
    await store.saveToolDraft(toolId);
  }

  function deleteSelectedLibraryTool() {
    const toolId = $viewState.toolsDraftSelectedToolId;
    if (!toolId) return;
    store?.deleteToolFromDraft?.(toolId);
  }

  function activateGatheringParent() {
    if (isActiveGatheringChildRoute) {
      gatheringMenuExpanded = true;
      return;
    }
    openGatheringSection('environments');
  }

  function toggleGatheringMenu(event) {
    event?.stopPropagation?.();
    if (isActiveGatheringChildRoute) {
      gatheringMenuExpanded = true;
      return;
    }
    gatheringMenuExpanded = !gatheringMenuExpanded;
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
      multiStep: text('FABRICATE.Admin.Manager.Recipe.MultiStep', 'Multi-step'),
      singleStep: text('FABRICATE.Admin.Manager.Recipe.SingleStep', 'Single step'),
      simple: text('FABRICATE.Admin.Manager.Recipe.Simple', 'Simple')
    };
    return labels[recipe?.structureKey] || (recipe?.isSimple
      ? text('FABRICATE.Admin.Manager.Recipe.Simple', 'Simple')
      : text('FABRICATE.Admin.Manager.Recipe.Advanced', 'Advanced'));
  }

  function stepRequirementSummary(step) {
    if (!step) return text('FABRICATE.Admin.Manager.Recipe.NoRequirements', 'No requirements');
    if (step.hasAlternatives) {
      return text('FABRICATE.Admin.Manager.Recipe.AlternativeSets', '{count} alternative sets')
        .replace('{count}', step.ingredientSetCount || step.ingredientSetSummaries?.length || 0);
    }
    const ingredients = step.ingredientCount || 0;
    const catalysts = step.catalystCount || 0;
    const ingredientLabel = formatCount(
      'FABRICATE.Admin.Manager.Recipe.Ingredient',
      'ingredient',
      'FABRICATE.Admin.Manager.Recipe.Ingredients',
      'ingredients',
      ingredients
    );
    if (catalysts <= 0) return ingredientLabel;
    const catalystLabel = formatCount(
      'FABRICATE.Admin.Manager.Recipe.Catalyst',
      'catalyst',
      'FABRICATE.Admin.Manager.Recipe.Catalysts',
      'catalysts',
      catalysts
    );
    return `${ingredientLabel}, ${catalystLabel}`;
  }

  function requirementsSummary(recipe) {
    const steps = Array.isArray(recipe?.requirementsPreview) ? recipe.requirementsPreview : [];
    if (steps.length > 1) {
      return text('FABRICATE.Admin.Manager.Recipe.StepRequirements', '{count} steps')
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
        label: text('FABRICATE.Admin.Manager.Recipe.Ingredients', 'ingredients'),
        value: ingredientCount(recipe)
      },
      {
        id: 'catalysts',
        label: text('FABRICATE.Admin.Manager.Recipe.Catalysts', 'catalysts'),
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
    return linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb || 'icons/svg/item-bag.svg';
  }

  function hasEnvironmentSceneImage(environment) {
    const linkedScene = linkedSceneForEnvironment(environment);
    return Boolean(linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb);
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
      ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')
      : text('FABRICATE.Admin.Manager.StatusActive', 'Active');
  }

  function environmentSceneState(environment) {
    if (!environment?.sceneUuid) {
      return {
        id: 'none',
        label: text('FABRICATE.Admin.Manager.Environment.SceneNone', 'No scene'),
        className: 'is-disabled'
      };
    }
    const scene = linkedSceneForEnvironment(environment);
    if (!scene) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.Manager.Environment.SceneMissing', 'Scene unresolved'),
        className: 'is-warning'
      };
    }
    return {
      id: 'linked',
      label: text('FABRICATE.Admin.Manager.Environment.SceneLinked', 'Linked scene'),
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

  function gatheringTaskName(task) {
    return String(task?.name || text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')).trim();
  }

  function gatheringTaskImage(task) {
    return task?.img || 'icons/svg/item-bag.svg';
  }

  function gatheringTaskDropRows(task) {
    return Array.isArray(task?.dropRows) ? task.dropRows : [];
  }

  function gatheringManagedItemLabel(componentId) {
    const item = (selectedSystem?.managedItemOptions || []).find(option => String(option.id || '') === String(componentId || ''));
    return item?.name || componentId || '';
  }

  function gatheringManagedItemImage(componentId) {
    const item = (selectedSystem?.managedItemOptions || []).find(option => String(option.id || '') === String(componentId || ''));
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function gatheringDropName(row) {
    return row?.name || gatheringManagedItemLabel(row?.componentId) || row?.itemUuid || text('FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop', 'Unresolved drop');
  }

  function gatheringDropImage(row) {
    return row?.img || gatheringManagedItemImage(row?.componentId) || 'icons/svg/item-bag.svg';
  }

  function gatheringTaskDropLabel(row) {
    const name = gatheringDropName(row);
    return `${name} x${row?.quantity || 1} (${row?.dropRate ?? 1}%)`;
  }

  function gatheringOptionLabel(kind, id) {
    const options = kind === 'biome'
      ? selectedGatheringSystemConfig.vocabularies?.biomes?.values
      : selectedGatheringSystemConfig.vocabularies?.regions?.values;
    const option = (Array.isArray(options) ? options : []).find(value => String(value?.id || value) === String(id || ''));
    return String(option?.label || option?.id || id || '').trim();
  }

  function gatheringConditionLabel(kind, id) {
    if (kind === 'biome') return gatheringOptionLabel('biome', id) || String(id || '');
    const setting = selectedGatheringSystemConfig.conditions?.[kind] || {};
    const option = (Array.isArray(setting.values) ? setting.values : [])
      .find(value => String(value?.id || value) === String(id || ''));
    return String(option?.label || option?.id || id || '').trim();
  }

  function gatheringModifierKindIcon(kind, conditionId = '') {
    if (kind === 'weather') return 'fas fa-cloud-sun';
    if (kind === 'timeOfDay') return 'fas fa-clock';
    const option = gatheringVocabularyOptions('biomes').find(value => String(value?.id || value) === String(conditionId || ''));
    return String(option?.icon || '').trim() || 'fas fa-mountain-sun';
  }

  function gatheringModifierCardTitle(kind, scope = 'task') {
    if (kind === 'biome') {
      return scope === 'hazard'
        ? text('FABRICATE.Admin.Manager.Environment.Hazards.BiomeModifiers', 'Biome modifiers')
        : text('FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiers', 'Biome modifiers');
    }
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiers', 'Weather modifiers');
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiers', 'Time modifiers');
  }

  function gatheringModifierCardHint(kind, scope = 'task') {
    if (scope === 'hazard') {
      if (kind === 'biome') return text('FABRICATE.Admin.Manager.Environment.Hazards.BiomeModifiersHint', "Adjust this hazard's chance based on the gathering environment's biomes.");
      if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Hazards.WeatherModifiersHint', "Adjust this hazard's chance based on the active weather condition.");
      return text('FABRICATE.Admin.Manager.Environment.Hazards.TimeModifiersHint', "Adjust this hazard's chance based on the active time of day.");
    }
    if (kind === 'biome') return text('FABRICATE.Admin.Manager.Environment.Tasks.BiomeModifiersHint', "Adjust this drop's chance based on the gathering environment's biomes.");
    if (kind === 'weather') return text('FABRICATE.Admin.Manager.Environment.Tasks.WeatherModifiersHint', "Adjust this drop's chance based on the active weather condition.");
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeModifiersHint', "Adjust this drop's chance based on the active time of day.");
  }

  function gatheringDropRateValue(row) {
    const number = Math.trunc(Number(row?.dropRate ?? 1));
    if (!Number.isFinite(number)) return 1;
    return Math.min(100, Math.max(0, number));
  }

  function gatheringDropCountValue(row) {
    const number = Math.trunc(Number(row?.quantity ?? 1));
    if (!Number.isFinite(number)) return 1;
    return Math.min(999, Math.max(1, number));
  }

  function gatheringDropRateTierClass(value) {
    const rate = gatheringDropRateValue({ dropRate: value });
    if (rate === 0) return 'is-none';
    if (rate >= 100) return 'is-guaranteed';
    if (rate >= 70) return 'is-common';
    if (rate >= 35) return 'is-uncommon';
    if (rate >= 15) return 'is-rare';
    if (rate >= 5) return 'is-very-rare';
    return 'is-legendary';
  }

  function gatheringDropRateTierColor(value) {
    const rate = gatheringDropRateValue({ dropRate: value });
    if (rate === 0) return 'var(--fab-drop-rate-none)';
    if (rate >= 100) return 'var(--fab-drop-rate-guaranteed)';
    if (rate >= 70) return 'var(--fab-drop-rate-common)';
    if (rate >= 35) return 'var(--fab-drop-rate-uncommon)';
    if (rate >= 15) return 'var(--fab-drop-rate-rare)';
    if (rate >= 5) return 'var(--fab-drop-rate-very-rare)';
    return 'var(--fab-drop-rate-legendary)';
  }

  function onGatheringDropRateInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
    input.value = normalized;
    const dropRate = Number(normalized);
    if (normalized !== '' && Number.isInteger(dropRate) && dropRate >= 0 && dropRate <= 100) {
      updateGatheringTaskDrop(rowId, { dropRate });
    }
  }

  function onGatheringDropRateBlur(row, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
    const dropRate = Number(normalized);
    if (normalized !== '' && Number.isInteger(dropRate) && dropRate >= 0 && dropRate <= 100) {
      input.value = String(dropRate);
      updateGatheringTaskDrop(row.id, { dropRate });
      return;
    }
    input.value = String(gatheringDropRateValue(row));
  }

  function onGatheringDropRateKeydown(row, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentValue = event.currentTarget.value === '' ? gatheringDropRateValue(row) : Number(event.currentTarget.value);
    const dropRate = gatheringDropRateValue({ dropRate: (Number.isFinite(currentValue) ? currentValue : gatheringDropRateValue(row)) + (event.key === 'ArrowUp' ? 1 : -1) });
    event.currentTarget.value = String(dropRate);
    updateGatheringTaskDrop(row.id, { dropRate });
  }

  function onGatheringDropCountInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+/, '');
    input.value = normalized;
    const quantity = Number(normalized);
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) updateGatheringTaskDrop(rowId, { quantity });
  }

  function onGatheringDropCountBlur(row, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+/, '');
    const quantity = Number(normalized);
    if (normalized !== '' && Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) {
      input.value = String(quantity);
      updateGatheringTaskDrop(row.id, { quantity });
      return;
    }
    input.value = String(gatheringDropCountValue(row));
  }

  function onGatheringDropCountKeydown(row, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentValue = event.currentTarget.value === '' ? gatheringDropCountValue(row) : Number(event.currentTarget.value);
    const quantity = gatheringDropCountValue({ quantity: (Number.isFinite(currentValue) ? currentValue : gatheringDropCountValue(row)) + (event.key === 'ArrowUp' ? 1 : -1) });
    event.currentTarget.value = String(quantity);
    updateGatheringTaskDrop(row.id, { quantity });
  }

  function gatheringTaskAvailability(task) {
    const timeValues = Array.isArray(task?.timeOfDay) ? task.timeOfDay : [];
    const weatherValues = Array.isArray(task?.weather) ? task.weather : [];
    const times = timeValues.length > 0
      ? timeValues.map(id => gatheringConditionLabel('timeOfDay', id)).filter(Boolean).join(', ')
      : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyTime', 'Any time');
    const weather = weatherValues.length > 0
      ? weatherValues.map(id => gatheringConditionLabel('weather', id)).filter(Boolean).join(', ')
      : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyWeather', 'Any weather');
    return `${times}, ${weather}`;
  }

  function gatheringTaskAllowedInEnvironment(task, environment) {
    const enabledIds = Array.isArray(environment?.enabledTaskIds) ? environment.enabledTaskIds.map(String) : [];
    const disabledIds = Array.isArray(environment?.disabledTaskIds) ? environment.disabledTaskIds.map(String) : [];
    if (disabledIds.includes(String(task?.id))) return false;
    if (enabledIds.length > 0 && !enabledIds.includes(String(task?.id))) return false;
    return true;
  }

  const DANGER_LEVEL_ORDER = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

  function sortedDangerTags(tags) {
    if (!Array.isArray(tags)) return [];
    return [...tags].sort((a, b) => {
      const ai = DANGER_LEVEL_ORDER.indexOf(a);
      const bi = DANGER_LEVEL_ORDER.indexOf(b);
      const aRank = ai === -1 ? DANGER_LEVEL_ORDER.length : ai;
      const bRank = bi === -1 ? DANGER_LEVEL_ORDER.length : bi;
      if (aRank !== bRank) return aRank - bRank;
      return String(a).localeCompare(String(b));
    });
  }

  function gatheringTaskReferencingEnvironments(task) {
    if (!task?.id) return [];
    const taskId = String(task.id);
    return environmentList.filter(environment => {
      if (String(environment?.craftingSystemId || '') !== String(selectedSystemId || '')) return false;
      const enabledIds = Array.isArray(environment?.enabledTaskIds) ? environment.enabledTaskIds.map(String) : [];
      return enabledIds.includes(taskId);
    });
  }

  function activeGatheringTaskEnvironmentCount(task) {
    if (!task || task.enabled === false) return 0;
    const weatherSetting = selectedGatheringSystemConfig.conditions?.weather || {};
    const timeSetting = selectedGatheringSystemConfig.conditions?.timeOfDay || {};
    const taskBiomes = Array.isArray(task.biomes) ? task.biomes : [];
    const taskWeather = Array.isArray(task.weather) ? task.weather : [];
    const taskTime = Array.isArray(task.timeOfDay) ? task.timeOfDay : [];
    const taskRegions = Array.isArray(task.regions)
      ? task.regions
      : (task.region ? [task.region] : []);
    return environmentList.filter(environment => {
      if (environment?.enabled === false) return false;
      if (String(environment?.craftingSystemId || selectedSystemId) !== String(selectedSystemId || '')) return false;
      if (!gatheringTaskAllowedInEnvironment(task, environment)) return false;
      if (taskRegions.length > 0 && !taskRegions.includes(String(environment?.region || ''))) return false;
      const environmentBiomes = Array.isArray(environment?.biomes)
        ? environment.biomes
        : (environment?.biome ? [environment.biome] : []);
      if (taskBiomes.length > 0 && !taskBiomes.some(biome => environmentBiomes.includes(biome))) return false;
      if (weatherSetting.enabled !== false && taskWeather.length > 0 && !taskWeather.includes(weatherSetting.current)) return false;
      if (timeSetting.enabled !== false && taskTime.length > 0 && !taskTime.includes(timeSetting.current)) return false;
      return true;
    }).length;
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
        label: text('FABRICATE.Admin.Manager.Component.SourceOriginMissing', 'Missing'),
        className: 'is-warning'
      };
    }
    if (item?.sourceOrigin === 'compendium') {
      return {
        id: 'compendium',
        label: item.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginCompendium', 'Compendium'),
        className: 'is-active'
      };
    }
    if (item?.sourceOrigin === 'world') {
      return {
        id: 'world',
        label: item.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginWorld', 'Items Directory'),
        className: 'is-active'
      };
    }
    return {
      id: 'unknown',
      label: item?.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginUnknown', 'Unknown'),
      className: 'is-disabled'
    };
  }

  function componentEvidenceItems(item) {
    const evidence = [];
    if (!item) return evidence;
    if (Object.prototype.hasOwnProperty.call(item, 'difficulty')) {
      evidence.push({
        id: 'difficulty',
        label: text('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty'),
        value: item.difficulty
      });
    }
    if (item.salvageSummary) {
      evidence.push({
        id: 'salvage',
        label: text('FABRICATE.Admin.Manager.Component.Salvage', 'Salvage'),
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
      ingredient: text('FABRICATE.Admin.Manager.Component.UsageIngredient', 'Ingredient usage'),
      result: text('FABRICATE.Admin.Manager.Component.UsageResult', 'Result usage'),
      catalyst: text('FABRICATE.Admin.Manager.Component.UsageCatalyst', 'Catalyst usage'),
      gathering: text('FABRICATE.Admin.Manager.Component.UsageGathering', 'Gathering usage'),
      salvage: text('FABRICATE.Admin.Manager.Component.UsageSalvage', 'Salvage usage')
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
      text('FABRICATE.Admin.Manager.Component.SalvageQuantity', '{count} required')
        .replace('{count}', summary.quantityRequired ?? 1)
    ];
    if (summary.catalystCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageCatalysts', '{count} catalysts').replace('{count}', summary.catalystCount));
    if (summary.resultGroupCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageResults', '{count} result groups').replace('{count}', summary.resultGroupCount));
    if (summary.outcomeCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageOutcomes', '{count} outcomes').replace('{count}', summary.outcomeCount));
    if (summary.hasTimeRequirement) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageTime', 'time'));
    if (summary.hasCurrencyRequirement) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageCost', 'cost'));
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
    const generalName = text('FABRICATE.Admin.Manager.Recipe.General', 'General');
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

<div class="fabricate-manager" data-manager-view={currentView}>
  <header class="manager-header">
    <div class="manager-heading">
      <nav class="manager-breadcrumbs" aria-label={text('FABRICATE.Admin.Manager.Breadcrumbs', 'Breadcrumbs')}>
        <button type="button" onclick={() => selectSystemAndShowBrowser()}>{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</button>
        {#if selectedSystem && currentView !== 'systems'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={() => editSystem(selectedSystem.id)}>{selectedSystem.name}</button>
        {/if}
        {#if currentView === 'recipes'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</span>
        {/if}
        {#if currentView === 'components'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}</span>
        {/if}
        {#if currentView === 'tags'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span>
        {/if}
        {#if currentView === 'essences'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences')}</span>
        {/if}
        {#if currentView === 'essence-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToEssencesBrowse}>{text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{isCreatingEssenceDraft
            ? text('FABRICATE.Admin.Manager.Essence.CreateBreadcrumb', 'Create essence')
            : text('FABRICATE.Admin.Manager.Essence.EditBreadcrumb', 'Edit essence')}</span>
        {/if}
        {#if currentView === 'component-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToComponentsBrowse}>{text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Component.EditBreadcrumb', 'Edit component')}</span>
        {/if}
        {#if currentView === 'environments'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span>
        {/if}
        {#if currentView === 'environment-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToEnvironmentsBrowse}>{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{viewTitle()}</span>
        {/if}
        {#if currentView === 'gathering-task-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToGatheringTaskLibrary}>{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks', 'Tasks')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.EditBreadcrumb', 'Edit gathering task')}</span>
        {/if}
        {#if currentView === 'gathering-hazard-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <button type="button" onclick={backToGatheringHazardLibrary}>{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters', 'Hazards')}</button>
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.EditBreadcrumb', 'Edit gathering hazard')}</span>
        {/if}
        {#if currentView === 'tools'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Nav.Tools', 'Tools')}</span>
        {/if}
        {#if currentView === 'system-edit'}
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.SystemEdit.Breadcrumb', 'System settings')}</span>
        {/if}
      </nav>
      <h1 class="manager-title">{viewTitle()}</h1>
      <p class="manager-subtitle">{viewSubtitle()}</p>
      {#if currentView === 'environment-edit' && environmentDraftForDisplay}
        <div class="manager-environment-header-pills" data-environment-status-pills>
          <span class={`manager-chip ${environmentDraftForDisplay.enabled === false ? 'is-neutral' : 'is-active'}`} data-status-pill="active">
            {environmentDraftForDisplay.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
          </span>
          <span class="manager-chip is-info" data-status-pill="selection">
            {environmentDraftForDisplay.selectionMode === 'blind' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Blind', 'Blind') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Overview.Targeted', 'Targeted')}
          </span>
          <span class="manager-chip is-info" data-status-pill="composition">
            {environmentDraftForDisplay.compositionMode === 'manual' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Manual', 'Manual') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Composition.Automatic', 'Automatic')}
          </span>
        </div>
      {/if}
    </div>
    {#if currentView !== 'tools'}
    <div class="manager-header-actions" aria-label={headerActionsLabel()}>
      {#if currentView === 'recipes'}
        <button type="button" class="manager-button" onclick={importRecipes} disabled={!selectedSystemId}>
          <i class="fas fa-file-import" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Import', 'Import')}</span>
        </button>
        <button type="button" class="manager-button" onclick={exportRecipes} disabled={!selectedSystemId}>
          <i class="fas fa-file-export" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Export', 'Export')}</span>
        </button>
        <button type="button" class="manager-button is-primary" onclick={createRecipe} disabled={!selectedSystemId}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.Create', 'Create Recipe')}</span>
        </button>
      {:else if currentView === 'components'}
      {:else if currentView === 'component-edit'}
        {#if componentEditDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Component.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={cancelComponentEdit} disabled={componentEditSaving}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Component.Cancel', 'Cancel')}</span>
        </button>
        <button type="submit" form="manager-component-edit-form" class="manager-button is-primary" disabled={!canSaveComponentEdit}>
          <i class={componentEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{componentEditSaveLabel()}</span>
        </button>
      {:else if currentView === 'tags'}
      {:else if currentView === 'essences'}
        <button type="button" class="manager-button is-primary" onclick={createEssenceDraft}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Essence.Create', 'Create essence')}</span>
        </button>
      {:else if currentView === 'essence-edit'}
        {#if essenceEditDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Essence.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={cancelEssenceEdit} disabled={essenceEditSaving}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Essence.Cancel', 'Cancel')}</span>
        </button>
        <button type="submit" form="manager-essence-edit-form" class="manager-button is-primary" disabled={!canSaveEssenceEdit}>
          <i class={essenceEditSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{essenceEditSaveLabel()}</span>
        </button>
      {:else if currentView === 'environments' && activeGatheringTab === 'tasks'}
        <button type="button" class="manager-button is-primary" onclick={() => createGatheringTask(selectedSystemId)} disabled={!canShowEnvironments}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Create', 'Create gathering task')}</span>
        </button>
      {:else if currentView === 'environments' && activeGatheringTab === 'encounters'}
        <button type="button" class="manager-button is-primary" onclick={() => createGatheringHazard(selectedSystemId)} disabled={!canShowEnvironments}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.Create', 'Create gathering hazard')}</span>
        </button>
      {:else if currentView === 'environments'}
        <button type="button" class="manager-button is-primary" onclick={createEnvironment} disabled={!canShowEnvironments}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Create', 'Create environment')}</span>
        </button>
      {:else if currentView === 'environment-edit'}
        {#if $viewState.environmentDraftDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={backToEnvironmentsBrowse} disabled={$viewState.environmentSaving}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.BackToBrowse', 'Back to environments')}</span>
        </button>
        <button type="button" class="manager-button is-danger" data-action="delete-environment" onclick={() => store.deleteEnvironmentDraft?.()} disabled={$viewState.environmentDraftIsNew || $viewState.environmentSaving}>
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Delete', 'Delete environment')}</span>
        </button>
        <button type="button" class="manager-button is-primary" onclick={saveEnvironmentEdit} disabled={!$viewState.environmentDraftDirty || $viewState.environmentSaving}>
          <i class={$viewState.environmentSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Environments.Save', 'Save')}</span>
        </button>
      {:else if currentView === 'gathering-task-edit'}
        {#if gatheringTaskDraftDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Tasks.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={backToGatheringTaskLibrary}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.BackToLibrary', 'Back to task library')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-danger"
          onclick={deleteGatheringTaskDraft}
          disabled={!selectedGatheringTaskId || gatheringTaskSaving}
          title={text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task')}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-primary"
          onclick={saveGatheringTaskDraft}
          disabled={!gatheringTaskDraftDirty || !gatheringTaskValidation.valid || gatheringTaskSaving}
          title={gatheringTaskValidation.valid ? '' : gatheringTaskValidation.errors.join('\n')}
        >
          <i class={gatheringTaskSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Save', 'Save task')}</span>
        </button>
      {:else if currentView === 'gathering-hazard-edit'}
        {#if gatheringHazardDraftDirty}
          <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Hazards.Dirty', 'Unsaved')}</span>
        {/if}
        <button type="button" class="manager-button" onclick={backToGatheringHazardLibrary}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.BackToLibrary', 'Back to hazard library')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-danger"
          onclick={deleteGatheringHazardDraft}
          disabled={!selectedGatheringHazardId || gatheringHazardSaving}
          title={text('FABRICATE.Admin.Manager.Environment.Hazards.Delete', 'Delete hazard')}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.Delete', 'Delete hazard')}</span>
        </button>
        <button
          type="button"
          class="manager-button is-primary"
          onclick={saveGatheringHazardDraft}
          disabled={!gatheringHazardDraftDirty || !gatheringHazardValidation.valid || gatheringHazardSaving}
          title={gatheringHazardValidation.valid ? '' : gatheringHazardValidation.errors.join('\n')}
        >
          <i class={gatheringHazardSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.Save', 'Save hazard')}</span>
        </button>
      {:else if currentView === 'system-edit'}
        <button type="button" class="manager-button" onclick={backToSystemsBrowser}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.SystemEdit.BackToSystems', 'Back to systems')}</span>
        </button>
      {:else}
        <button type="button" class="manager-button" onclick={importSystem}>
          <i class="fas fa-file-import" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Import', 'Import')}</span>
        </button>
        <button type="button" class="manager-button" onclick={() => exportSystem()} disabled={!selectedSystemId}>
          <i class="fas fa-file-export" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Export', 'Export')}</span>
        </button>
        <button type="button" class="manager-button is-primary" onclick={createSystem}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Create', 'Create')}</span>
        </button>
      {/if}
    </div>
    {/if}
  </header>

  <div class="manager-body">
    <aside class="manager-rail" aria-label={text('FABRICATE.Admin.Manager.Navigation', 'Crafting manager navigation')}>
      <section class="manager-rail-block" aria-label={text('FABRICATE.Admin.Manager.ManagerScope', 'Manager scope')}>
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Product', 'Fabricate')}</p>
        {#if selectedSystem}
          <div class="manager-scope-card">
            <span class="manager-scope-name" title={selectedSystem.name}>{selectedSystem.name}</span>
            <button
              type="button"
              class="manager-scope-return"
              aria-label={text('FABRICATE.Admin.Manager.ReturnToSystemLibrary', 'Return to System Library')}
              title={text('FABRICATE.Admin.Manager.ReturnToSystemLibrary', 'Return to System Library')}
              onclick={backToSystemsBrowser}
            >
              <i class="fas fa-list" aria-hidden="true"></i>
            </button>
          </div>
        {:else}
          <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}</h2>
        {/if}
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Workspace', 'GM management workspace')}</p>
      </section>

      <nav class="manager-nav" aria-label={text('FABRICATE.Admin.Manager.ManagerSections', 'Manager sections')}>
        {#if selectedSystem}
          <button type="button" class={`manager-nav-button ${currentView === 'system-edit' ? 'is-active' : ''}`} aria-current={currentView === 'system-edit' ? 'page' : undefined} onclick={() => editSystem(selectedSystem.id)}>
            <i class="fas fa-cog" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System settings')}</span>
          </button>
          <button type="button" class={`manager-nav-button ${currentView === 'recipes' ? 'is-active' : ''}`} aria-current={currentView === 'recipes' ? 'page' : undefined} onclick={() => setView('recipes')}>
            <i class="fas fa-scroll" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}</span>
            <span class="manager-nav-count">{$viewState.recipes?.length || 0}</span>
          </button>
          <button type="button" class={`manager-nav-button ${currentView === 'components' || currentView === 'component-edit' ? 'is-active' : ''}`} aria-current={currentView === 'components' || currentView === 'component-edit' ? 'page' : undefined} onclick={() => setView('components')}>
            <i class="fas fa-boxes" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}</span>
            <span class="manager-nav-count">{selectedCounts.components}</span>
          </button>
          <button type="button" class={`manager-nav-button ${currentView === 'tags' ? 'is-active' : ''}`} aria-current={currentView === 'tags' ? 'page' : undefined} onclick={() => setView('tags')}>
            <i class="fas fa-tags" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span>
            <span class="manager-nav-count">{selectedCounts.itemTags + selectedCounts.recipeCategories}</span>
          </button>
          {#if canShowEssences}
            <button type="button" class={`manager-nav-button ${currentView === 'essences' || currentView === 'essence-edit' ? 'is-active' : ''}`} aria-current={currentView === 'essences' || currentView === 'essence-edit' ? 'page' : undefined} onclick={() => setView('essences')}>
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Essences', 'Essences')}</span>
              <span class="manager-nav-count">{selectedCounts.essences}</span>
            </button>
          {/if}
          <button type="button" class={`manager-nav-button ${currentView === 'tools' ? 'is-active' : ''}`} aria-current={currentView === 'tools' ? 'page' : undefined} onclick={() => setView('tools')}>
            <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
            <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Tools', 'Tools')}</span>
            <span class="manager-nav-count">{toolsNavCount}</span>
          </button>
          {#if canShowEnvironments}
            <div class={`manager-nav-group ${gatheringMenuExpanded ? 'is-expanded' : ''}`}>
              <button
                type="button"
                class="manager-nav-button manager-nav-parent"
                id="manager-nav-gathering"
                aria-current={isGatheringRoute ? 'page' : undefined}
                aria-expanded={gatheringMenuExpanded}
                onclick={activateGatheringParent}
              >
                <i class="fas fa-seedling" aria-hidden="true"></i>
                <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span>
                <span class="manager-nav-count">{gatheringNavCounts.total}</span>
              </button>
              <button
                type="button"
                class="manager-nav-toggle"
                aria-label={gatheringMenuExpanded
                  ? text('FABRICATE.Admin.Manager.Nav.CollapseGathering', 'Collapse gathering menu')
                  : text('FABRICATE.Admin.Manager.Nav.ExpandGathering', 'Expand gathering menu')}
                aria-controls="manager-gathering-submenu"
                aria-expanded={gatheringMenuExpanded}
                onclick={toggleGatheringMenu}
              >
                <i class={gatheringMenuExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"></i>
              </button>
              {#if gatheringMenuExpanded}
                <div class="manager-nav-submenu" id="manager-gathering-submenu" aria-label={text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Label', 'Gathering sections')}>
                  {#each gatheringNavItems as gatheringItem (gatheringItem.id)}
                    <button
                      type="button"
                      class={`manager-nav-subitem ${isGatheringRoute && activeGatheringTab === gatheringItem.id ? 'is-active' : ''}`}
                      id={`manager-gathering-nav-${gatheringItem.id}`}
                      aria-current={isGatheringRoute && activeGatheringTab === gatheringItem.id ? 'page' : undefined}
                      onclick={() => openGatheringSection(gatheringItem.id)}
                    >
                      <i class={gatheringItem.icon} aria-hidden="true"></i>
                      <span class="manager-nav-label">{text(gatheringItem.labelKey, gatheringItem.labelFallback)}</span>
                      {#if gatheringNavCounts[gatheringItem.id] != null}
                        <span class="manager-nav-count">{gatheringNavCounts[gatheringItem.id]}</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/if}
        {#each visiblePlaceholderViews as view}
          <button type="button" class="manager-nav-button" disabled title={text('FABRICATE.Admin.Manager.PlannedView', '{view} is planned for a future release.').replace('{view}', text(view.labelKey, view.fallback))}>
            <i class={view.icon} aria-hidden="true"></i>
            <span class="manager-nav-label">{text(view.labelKey, view.fallback)}</span>
            <span class="manager-nav-count">{text('FABRICATE.Admin.Manager.Soon', 'Soon')}</span>
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
        gatheringConfig={$viewState.gatheringConfig}
        sceneOptions={selectedSystem?.sceneOptions || []}
        environmentTaskCounts={$viewState.environmentTaskCounts || {}}
        {shouldUseEnvironmentDraftForDisplay}
        {activeGatheringTab}
        selectedTaskId={selectedGatheringTask?.id || selectedGatheringTaskId}
        selectedHazardId={selectedGatheringHazard?.id || selectedGatheringHazardId}
        managedItemOptions={selectedSystem?.managedItemOptions || []}
        onSelectGatheringTab={selectGatheringTab}
        onSelectGatheringTask={selectGatheringTask}
        onCreateGatheringTask={createGatheringTask}
        onEditGatheringTask={editGatheringTask}
        onDuplicateGatheringTask={duplicateGatheringTask}
        onDeleteGatheringTask={deleteGatheringTask}
        onToggleGatheringTaskEnabled={toggleGatheringTaskEnabled}
        onSelectGatheringHazard={selectGatheringHazard}
        onCreateGatheringHazard={createGatheringHazard}
        onEditGatheringHazard={editGatheringHazard}
        onDuplicateGatheringHazard={duplicateGatheringHazard}
        onDeleteGatheringHazard={deleteGatheringHazard}
        onToggleGatheringHazardEnabled={toggleGatheringHazardEnabled}
        onSelectEnvironment={(id) => selectEnvironment(id)}
        onEditEnvironment={(id) => editEnvironment(id)}
        onCreateEnvironment={createEnvironment}
        onDuplicateEnvironment={(id) => duplicateEnvironment(id)}
        onDeleteEnvironment={(id) => deleteEnvironment(id)}
        onToggleEnvironmentEnabled={(id, enabled) => toggleEnvironmentEnabled(id, enabled)}
        onUpdateGatheringConditions={store.updateGatheringConditions}
        onToggleGatheringConditionEnabled={store.toggleGatheringConditionEnabled}
        onAddGatheringConditionValue={store.addGatheringConditionValue}
        onUpdateGatheringConditionValue={store.updateGatheringConditionValue}
        onDeleteGatheringConditionValue={store.deleteGatheringConditionValue}
        onAddGatheringVocabularyValue={store.addGatheringVocabularyValue}
        onUpdateGatheringVocabularyValue={store.updateGatheringVocabularyValue}
        onDeleteGatheringVocabularyValue={store.deleteGatheringVocabularyValue}
      />
    {:else if currentView === 'environment-edit' && selectedSystem}
      <main class="manager-main manager-environment-edit-main" aria-label={text('FABRICATE.Admin.Manager.Environment.EditTitle', 'Edit environment')}>
        <section class="manager-environment-editor-shell">
          <EnvironmentEditView
            environmentDraft={$viewState.environmentDraft}
            composition={$viewState.environmentComposition}
            hazardSelectionMode={selectedGatheringRules.hazardSelectionMode}
            isNew={$viewState.environmentDraftIsNew}
            regionOptions={gatheringVocabularyOptions('regions')}
            biomeOptions={gatheringVocabularyOptions('biomes')}
            dangerOptions={[]}
            onPickImagePath={services?.pickImagePath}
            onUpdateEnvironment={store.updateEnvironmentDraft}
            onSetCompositionMode={store.setEnvironmentCompositionMode}
            onIncludeRecord={store.includeEnvironmentRecord}
            onForceIncludeRecord={store.forceIncludeEnvironmentRecord}
            onExcludeRecord={store.excludeEnvironmentRecord}
            onRestoreRecord={store.restoreEnvironmentRecord}
            onReorderRecord={store.reorderEnvironmentRecord}
            onOpenSourceTask={(id) => editGatheringTask(id)}
            onOpenSourceHazard={(id) => editGatheringHazard(id)}
          />
        </section>
      </main>
    {:else if currentView === 'gathering-task-edit' && selectedSystem}
      <GatheringTaskEditView
        task={editingGatheringTask}
        {itemCards}
        managedItemOptions={selectedSystem.managedItemOptions || []}
        weatherOptions={gatheringConditionOptions('weather')}
        timeOfDayOptions={gatheringConditionOptions('timeOfDay')}
        regionOptions={gatheringVocabularyOptions('regions')}
        biomeOptions={gatheringVocabularyOptions('biomes')}
        selectedDropId={selectedGatheringDrop?.id || selectedGatheringDropId}
        rewardRules={selectedGatheringRules}
        characterModifierLibrary={selectedGatheringCharacterModifiers}
        libraryTools={selectedGatheringSystemTools}
        onPickImagePath={services?.pickImagePath}
        onUpdateTask={updateSelectedGatheringTask}
        onSelectDrop={(rowId) => { selectedGatheringDropId = rowId; }}
        onAddDrop={addGatheringTaskDrop}
        onUpdateDrop={updateGatheringTaskDrop}
        onMoveDrop={moveGatheringTaskDrop}
        onImportDrop={importGatheringTaskDrop}
        onAddModifier={addGatheringDropModifier}
        onUpdateModifier={updateGatheringDropModifier}
        onDeleteModifier={deleteGatheringDropModifier}
        onAddToolReference={addToolReferenceToSelectedTask}
        onRemoveToolReference={removeToolReferenceFromSelectedTask}
      />
    {:else if currentView === 'gathering-hazard-edit' && selectedSystem}
      <GatheringHazardEditView
        hazard={editingGatheringHazard}
        weatherOptions={gatheringConditionOptions('weather')}
        timeOfDayOptions={gatheringConditionOptions('timeOfDay')}
        regionOptions={gatheringVocabularyOptions('regions')}
        biomeOptions={gatheringVocabularyOptions('biomes')}
        onPickImagePath={services?.pickImagePath}
        onUpdateHazard={updateSelectedGatheringHazard}
      />
    {:else if currentView === 'tools' && selectedSystem}
      <ToolsBrowserView
        tools={$viewState.toolsDraft || []}
        selectedToolId={$viewState.toolsDraftSelectedToolId || ''}
        expandedToolId={$viewState.toolsDraftExpandedToolId || ''}
        dirtyToolIds={dirtyToolIds}
        managedItemOptions={selectedSystem?.managedItemOptions || []}
        onSelectTool={(id) => store.selectDraftTool?.(id)}
        onExpandTool={(id) => store.setExpandedDraftTool?.(id)}
        onToggleExpand={(id) => store.setExpandedDraftTool?.(id === $viewState.toolsDraftExpandedToolId ? '' : id)}
        onAddTool={(initialPatch) => initialPatch ? store.addToolToDraft?.(initialPatch) : store.addToolToDraft?.()}
        onAddToolDrop={addToolFromDrop}
        onUpdateTool={(id, patch) => store.updateToolInDraft?.(id, patch)}
        onDeleteTool={(id) => store.deleteToolFromDraft?.(id)}
      />
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
        <main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component')}>
          <div class="manager-empty">
            <div>
              <i class="fas fa-boxes" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Component.SelectComponent', 'Select a component')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Component.EditMissingHint', 'Pick a component from the browser to edit its tags, essences, and source linkage.')}</p>
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
        characterModifierLibrary={selectedGatheringCharacterModifiers}
        {characterModifierPresetsSupported}
        onAddCharacterModifier={onAddCharacterModifier}
        onUpdateCharacterModifier={onUpdateCharacterModifier}
        onDeleteCharacterModifier={onDeleteCharacterModifier}
        onSeedCharacterModifierPresets={onSeedCharacterModifierPresets}
      />
    {:else}
      <SystemsBrowserView
        systems={$viewState.systems || []}
        {systemsLoading}
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
    <aside class="manager-inspector" aria-label={inspectorLabel()}>
      {#if currentView === 'tags' && selectedSystem}
        <section class="manager-inspector-card">
          <div class="manager-inspector-title-row">
            <span class="manager-inspector-icon" aria-hidden="true">
              <i class="fas fa-tags"></i>
            </span>
            <div class="manager-inspector-copy">
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.TagsCategories.Selected', 'Selected vocabulary')}</p>
              <h2 class="manager-inspector-name">{text('FABRICATE.Admin.Manager.TagsCategories.Library', 'Tags & Categories')}</h2>
              <div class="manager-chip-row">
                <span class="manager-chip is-active">{text('FABRICATE.Admin.Manager.TagsCategories.AlwaysOn', 'Always available')}</span>
              </div>
            </div>
          </div>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.TagsCategories.InspectorHint', 'Define the vocabulary GMs use when assigning recipe categories and component tags.')}</p>
        </section>

        <section class="manager-inspector-card" data-tags-evidence="how-it-works">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.TagsCategories.HowItWorksTitle', 'How it works')}</h3>
          <ul class="manager-evidence-list">
            <li>{text('FABRICATE.Admin.Manager.TagsCategories.HowItWorksFlat', 'Categories are flat — each recipe picks one, with no parent or child folders.')}</li>
            <li>{text('FABRICATE.Admin.Manager.TagsCategories.HowItWorksGeneral', 'General is the reserved fallback for recipes without a custom category.')}</li>
            <li>{text('FABRICATE.Admin.Manager.TagsCategories.HowItWorksTags', 'Item tags appear on components and on tag-placeholder ingredients in recipes.')}</li>
          </ul>
        </section>

        <section class="manager-inspector-card">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.TagsCategories.Counts', 'Vocabulary counts')}</h3>
          <div class="manager-fact-grid">
            <div class="manager-fact" data-tags-category-fact="base-categories">
              <strong>{tagCategoryCounts.baseCategories}</strong>
              <span>{text('FABRICATE.Admin.Manager.TagsCategories.BaseCategory', 'Base category')}</span>
            </div>
            <div class="manager-fact" data-tags-category-fact="custom-categories">
              <strong>{tagCategoryCounts.customCategories}</strong>
              <span>{text('FABRICATE.Admin.Manager.TagsCategories.CustomCategories', 'Custom categories')}</span>
            </div>
            <div class="manager-fact" data-tags-category-fact="item-tags">
              <strong>{tagCategoryCounts.itemTags}</strong>
              <span>{text('FABRICATE.Admin.Manager.TagsCategories.ItemTags', 'Item tags')}</span>
            </div>
            <div class="manager-fact" data-tags-category-fact="references">
              <strong>{tagCategoryCounts.categoryReferences + tagCategoryCounts.tagReferences}</strong>
              <span>{text('FABRICATE.Admin.Manager.TagsCategories.References', 'References')}</span>
            </div>
          </div>
        </section>

        <section class="manager-inspector-card" data-tags-evidence="examples">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.TagsCategories.ExamplesTitle', 'Examples')}</h3>
          {#if topUsedCategoryExample || topUsedTagExample}
            <ul class="manager-evidence-list">
              {#if topUsedCategoryExample}
                <li data-tags-example="category">
                  {(topUsedCategoryExample.count === 1
                    ? text('FABRICATE.Admin.Manager.TagsCategories.ExampleCategorySingular', '"{name}" is used by 1 recipe.')
                    : text('FABRICATE.Admin.Manager.TagsCategories.ExampleCategory', '"{name}" is used by {count} recipes.')
                  ).replace('{name}', topUsedCategoryExample.name).replace('{count}', topUsedCategoryExample.count)}
                </li>
              {/if}
              {#if topUsedTagExample}
                <li data-tags-example="tag">
                  {(topUsedTagExample.count === 1
                    ? text('FABRICATE.Admin.Manager.TagsCategories.ExampleTagSingular', '"{name}" appears on 1 component.')
                    : text('FABRICATE.Admin.Manager.TagsCategories.ExampleTag', '"{name}" appears on {count} components.')
                  ).replace('{name}', topUsedTagExample.name).replace('{count}', topUsedTagExample.count)}
                </li>
              {/if}
            </ul>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.TagsCategories.ExamplesEmptyHint', 'Add a category or tag, then assign it to a recipe or component to see it appear here.')}</p>
          {/if}
        </section>

        <section class="manager-inspector-card">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.TagsCategories.GeneralTitle', 'General category')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.TagsCategories.GeneralInspectorHint', 'General is the built-in category for recipes without a custom category and cannot be removed.')}</p>
        </section>
      {:else if currentView === 'environments' || currentView === 'environment-edit' || currentView === 'gathering-task-edit' || currentView === 'gathering-hazard-edit'}
        {#if (currentView === 'environments' && activeGatheringTab === 'tasks') || currentView === 'gathering-task-edit'}
          {#if selectedGatheringTask}
            {#if currentView !== 'gathering-task-edit'}
            <section class="manager-inspector-card" data-gathering-task-inspector>
              <div class="manager-inspector-title-row is-hero-large">
                <img class="manager-recipe-preview" src={gatheringTaskImage(selectedGatheringTask)} alt="" />
                <div class="manager-inspector-copy">
                  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Tasks.Selected', 'Selected gathering task')}</p>
                  <h2 class="manager-inspector-name" title={gatheringTaskName(selectedGatheringTask)}>{gatheringTaskName(selectedGatheringTask)}</h2>
                  <div class="manager-chip-row">
                    <span class={`manager-chip ${selectedGatheringTask.enabled === false ? 'is-disabled' : 'is-active'}`}>
                      {selectedGatheringTask.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                    </span>
                    <span class="manager-chip">{gatheringTaskAvailability(selectedGatheringTask)}</span>
                  </div>
                </div>
              </div>

              <p class="manager-muted">
                {selectedGatheringTask.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
              </p>
            </section>

            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.Details', 'Gathering task details')}</h3>
              <div class="manager-fact-grid">
                <div class="manager-fact" data-gathering-task-fact="region">
                  <strong>{
                    (() => {
                      const regions = Array.isArray(selectedGatheringTask.regions)
                        ? selectedGatheringTask.regions
                        : (selectedGatheringTask.region ? [selectedGatheringTask.region] : []);
                      if (regions.length === 0) return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyRegion', 'Any region');
                      return regions.map(id => gatheringOptionLabel('region', id) || id).join(', ');
                    })()
                  }</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Region', 'Region')}</span>
                </div>
                <div class="manager-fact" data-gathering-task-fact="biomes">
                  <strong>{Array.isArray(selectedGatheringTask.biomes) && selectedGatheringTask.biomes.length > 0 ? selectedGatheringTask.biomes.length : text('FABRICATE.Admin.Manager.Environment.Tasks.AnyBiome', 'Any biome')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>
                </div>
                <div class="manager-fact" data-gathering-task-fact="drops">
                  <strong>{gatheringTaskDropRows(selectedGatheringTask).length}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Drops', 'Drops')}</span>
                </div>
                <div class="manager-fact" data-gathering-task-fact="environments">
                  <strong>{activeGatheringTaskEnvironmentCount(selectedGatheringTask)}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.ActiveEnvironments', 'Active environments')}</span>
                </div>
              </div>
            </section>

            <section class="manager-inspector-card manager-task-drops-summary-card" data-task-drops-summary>
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.DropsSummary', 'Drops summary')}</h3>
              {#if gatheringTaskDropRows(selectedGatheringTask).length === 0}
                <p class="manager-muted" data-task-drops-summary-empty>{text('FABRICATE.Admin.Manager.Environment.Tasks.NoDropsConfigured', 'No drops configured yet.')}</p>
              {:else}
                <div class="manager-task-drops-summary-list" data-task-drops-summary-list>
                  {#each gatheringTaskDropRows(selectedGatheringTask) as drop (drop.id)}
                    <span class="manager-task-drop-summary-chip" data-task-drop-summary-chip>
                      <img class="manager-task-drop-summary-thumb" src={gatheringDropImage(drop)} alt="" />
                      <span class="manager-task-drop-summary-label" title={gatheringDropName(drop)}>{gatheringDropName(drop)}</span>
                      <strong class="manager-task-drop-summary-percent">{Math.max(1, Math.min(100, Math.floor(Number(drop?.dropRate ?? 1))))}%</strong>
                    </span>
                  {/each}
                </div>
              {/if}
            </section>

            <section class="manager-inspector-card manager-task-environment-usage-card" data-task-environment-usage>
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.UsedInEnvironmentsCard', 'Used in environments')}</h3>
              {#if gatheringTaskReferencingEnvironments(selectedGatheringTask).length === 0}
                <p class="manager-muted" data-task-environment-usage-empty>{text('FABRICATE.Admin.Manager.Environment.Tasks.NotUsedInEnvironments', 'Not used in any environments yet.')}</p>
              {:else}
                <div class="manager-task-environment-usage-grid" data-task-environment-usage-chips>
                  {#each gatheringTaskReferencingEnvironments(selectedGatheringTask) as environment (environment.id)}
                    <article class="manager-task-environment-usage-card">
                      <img class="manager-task-environment-usage-thumb" src={environmentImage(environment)} alt="" />
                      <span class="manager-task-environment-usage-name" title={environmentName(environment)}>{environmentName(environment)}</span>
                    </article>
                  {/each}
                </div>
              {/if}
            </section>
            {/if}

            {#if currentView === 'gathering-task-edit'}
            {#if selectedGatheringDrop}
            <div class="manager-drop-inspector-stack" data-gathering-task-drop-inspector>
            <section class="manager-inspector-card manager-drop-editor-header-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop', 'Selected drop rule')}</h3>
              <div class="manager-inspector-title-row">
                <img class="manager-recipe-preview" src={gatheringDropImage(selectedGatheringDrop)} alt="" />
                <div class="manager-inspector-copy">
                  <h2 class="manager-inspector-name">{gatheringDropName(selectedGatheringDrop)}</h2>
                  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.ModifiersApplyOnlyThisDrop', 'Modifiers below apply only to this drop.')}</p>
                </div>
              </div>
              <div class="manager-drop-editor-actions">
                <button type="button" class="manager-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop', 'Duplicate')} onclick={() => duplicateGatheringTaskDrop(selectedGatheringDrop.id)}>
                  <i class="fas fa-copy" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DuplicateDrop', 'Duplicate')}</span>
                </button>
                <button type="button" class="manager-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop', 'Delete')} onclick={() => deleteGatheringTaskDrop(selectedGatheringDrop.id)}>
                  <i class="fas fa-trash" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteDrop', 'Delete')}</span>
                </button>
              </div>
            </section>

            <div class="manager-drop-inspector-divider" aria-hidden="true"></div>

            <div class="manager-drop-inspector-scroll">
            <section class="manager-inspector-card manager-drop-editor-card">
              <div class="manager-drop-editor-values">
                <label class="manager-field manager-drop-rate-editor" data-gathering-drop-inspector-rate>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')}</span>
                  <span class="manager-drop-rate-value">
                    <span class="manager-drop-rate-percent">
                      <input type="text" inputmode="numeric" pattern="[0-9]*" value={gatheringDropRateValue(selectedGatheringDrop)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent', 'Drop chance percent')} oninput={(event) => onGatheringDropRateInput(selectedGatheringDrop.id, event)} onblur={(event) => onGatheringDropRateBlur(selectedGatheringDrop, event)} onkeydown={(event) => onGatheringDropRateKeydown(selectedGatheringDrop, event)} />
                      <span aria-hidden="true">%</span>
                    </span>
                    <span class={`manager-drop-rate-control ${gatheringDropRateTierClass(selectedGatheringDrop.dropRate)}`} style={`--fab-drop-rate-value: ${gatheringDropRateValue(selectedGatheringDrop)}%; --fab-drop-rate-color: ${gatheringDropRateTierColor(selectedGatheringDrop.dropRate)};`}>
                      <span class="manager-drop-rate-track" aria-hidden="true">
                        <span class="manager-drop-rate-fill"></span>
                      </span>
                      <input type="range" min="0" max="100" step="1" value={gatheringDropRateValue(selectedGatheringDrop)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')} oninput={(event) => updateGatheringTaskDrop(selectedGatheringDrop.id, { dropRate: Number(event.currentTarget.value) })} onkeydown={(event) => event.stopPropagation()} />
                    </span>
                  </span>
                </label>

                <label class="manager-field manager-drop-count-editor" data-gathering-drop-inspector-count>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn', 'Count')}</span>
                  <input type="text" inputmode="numeric" pattern={'[1-9][0-9]{0,2}'} value={gatheringDropCountValue(selectedGatheringDrop)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn', 'Count')} oninput={(event) => onGatheringDropCountInput(selectedGatheringDrop.id, event)} onblur={(event) => onGatheringDropCountBlur(selectedGatheringDrop, event)} onkeydown={(event) => onGatheringDropCountKeydown(selectedGatheringDrop, event)} />
                </label>
              </div>
            </section>

            {#each ['biome', 'timeOfDay', 'weather'] as kind (kind)}
              {@const cardTitle = gatheringModifierCardTitle(kind, 'task')}
              {@const cardHint = gatheringModifierCardHint(kind, 'task')}
              {@const availableConditions = gatheringConditionAvailableOptions(selectedGatheringDrop, kind)}
              {@const pickerSelection = gatheringDropModifierPickerSelection(kind)}
              {@const attachedModifiers = gatheringConditionModifierRows(selectedGatheringDrop, kind)}
              <section class="manager-inspector-card manager-drop-editor-condition-modifier-card" data-gathering-drop-condition-modifiers={kind}>
                <header class="manager-character-modifier-row-card-header">
                  <div class="manager-character-modifier-row-card-heading">
                    <h3 class="manager-card-title">{cardTitle}</h3>
                    <p class="manager-muted">{cardHint}</p>
                  </div>
                </header>
                <div class="manager-condition-modifier-add-row" data-gathering-drop-condition-modifier-picker={kind}>
                  <label class="manager-field manager-condition-modifier-picker">
                    <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel', 'Condition')}</span>
                    <select
                      value={pickerSelection}
                      disabled={availableConditions.length === 0}
                      data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                      onchange={(event) => setGatheringDropModifierPickerSelection(kind, event.currentTarget.value)}
                    >
                      {#each availableConditions as option (option.id)}
                        <option value={option.id}>{option.label || option.id}</option>
                      {/each}
                    </select>
                  </label>
                  <button
                    type="button"
                    class="manager-icon-button"
                    aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                    title={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                    disabled={availableConditions.length === 0 || !pickerSelection}
                    data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                    onclick={() => addGatheringDropModifier(selectedGatheringDrop.id, kind, pickerSelection)}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                  </button>
                </div>
                <div class="manager-condition-modifier-row-list">
                  {#each attachedModifiers as modifier (modifier.id)}
                    <article class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`} data-gathering-drop-modifier-id={modifier.id}>
                      <header class="manager-character-modifier-row-reference-header">
                        <span class="manager-character-modifier-icon">
                          <i class={gatheringModifierKindIcon(kind, modifier.conditionId)} aria-hidden="true"></i>
                        </span>
                        <span class="manager-character-modifier-row-reference-label">{gatheringConditionLabel(kind, modifier.conditionId) || modifier.conditionId}</span>
                        <label class="manager-condition-modifier-value">
                          <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}</span>
                          <input
                            type="text"
                            inputmode="numeric"
                            value={gatheringModifierDisplayValue(modifier)}
                            aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}
                            oninput={(event) => updateGatheringDropModifier(selectedGatheringDrop.id, kind, modifier.id, signedToOperatorValue(event.currentTarget.value))}
                            onkeydown={(event) => onGatheringDropModifierKeydown(selectedGatheringDrop.id, kind, modifier, event)}
                          />
                          <span aria-hidden="true">%</span>
                        </label>
                        <button
                          type="button"
                          class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                          aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier', 'Delete modifier')}
                          onclick={() => deleteGatheringDropModifier(selectedGatheringDrop.id, kind, modifier.id)}
                        >
                          <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                      </header>
                    </article>
                  {:else}
                    <p class="manager-muted manager-condition-modifier-row-empty">{text('FABRICATE.Admin.Manager.Environment.Tasks.NoConditionModifiers', 'No modifiers attached.')}</p>
                  {/each}
                </div>
              </section>
            {/each}

            <section class="manager-inspector-card manager-character-modifier-row-card" data-gathering-drop-character-modifiers>
              <header class="manager-character-modifier-row-card-header">
                <div class="manager-character-modifier-row-card-heading">
                  <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle', 'Character modifiers')}</h3>
                  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint', 'Modifiers adjust the final chance based on the attempting character.')}</p>
                </div>
              </header>
              <div class="manager-character-modifier-add-search-row">
                <label bind:this={characterModifierSearchAnchor} class="manager-search is-compact manager-character-modifier-add-search" data-gathering-drop-character-modifier-search>
                  <i class="fas fa-search" aria-hidden="true"></i>
                  <input type="search"
                         value={characterModifierSearchTerm}
                         oninput={(event) => { characterModifierSearchTerm = event.currentTarget.value; }}
                         placeholder={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder', 'Search character modifiers...')}
                         aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel', 'Search character modifiers to add')}
                         disabled={selectedGatheringCharacterModifiers.length === 0}
                         data-tooltip={selectedGatheringCharacterModifiers.length === 0 ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint', 'Add a modifier to the system library first to reference it here.') : null} />
                  {#if characterModifierSearchSuggestions.length > 0}
                    <div class="manager-tag-suggestions manager-character-modifier-add-suggestions" class:is-above={characterModifierSearchOpenUp} data-gathering-drop-character-modifier-suggestions>
                      {#each characterModifierSearchSuggestions as option (option.id)}
                        <button type="button"
                                class="manager-tag-suggestion manager-character-modifier-add-suggestion"
                                data-gathering-drop-character-modifier-suggestion={option.id}
                                onclick={() => pickCharacterModifierForRow(selectedGatheringDrop.id, option.id)}>
                          <i class={option.icon || 'fa-solid fa-user'} aria-hidden="true"></i>
                          <span>{option.label || option.id}</span>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </label>
              </div>
              <div class="manager-character-modifier-row-list">
                {#each rowCharacterModifiers(selectedGatheringDrop) as ref (ref.id)}
                  {@const libraryEntry = characterModifierLibraryEntry(ref.modifierId)}
                  {@const hasOverride = characterModifierIsCustomized(ref)}
                  {@const operatorClass = characterModifierOperatorClass(ref.operator)}
                  <article class="manager-character-modifier-row-reference" data-gathering-drop-character-modifier-ref={ref.id}>
                    <header class="manager-character-modifier-row-reference-header">
                      <span class="manager-character-modifier-icon"><i class={characterModifierIconForRef(ref)} aria-hidden="true"></i></span>
                      <span class="manager-character-modifier-row-reference-label">{characterModifierLabelForRef(ref)}</span>
                      {#if !libraryEntry}
                        <span class="manager-character-modifier-stale-warning" data-tooltip={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref.modifierId)}>
                          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                        </span>
                      {/if}
                      <label class={`manager-character-modifier-operator-select ${operatorClass}`}>
                        <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Operator', 'Operator')}</span>
                        <select value={ref.operator || '+'} onchange={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { operator: event.currentTarget.value })}>
                          <option value="+">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive', 'Positive')}</option>
                          <option value="-">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative', 'Negative')}</option>
                        </select>
                      </label>
                      <button type="button" class="manager-icon-button is-danger manager-character-modifier-row-reference-delete" aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference', 'Delete character modifier reference')} onclick={() => onDeleteDropCharacterModifier(selectedGatheringDrop.id, ref.id)}>
                        <i class="fas fa-trash" aria-hidden="true"></i>
                      </button>
                    </header>
                    <div class="manager-character-modifier-row-bounds">
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Min', 'Min')}</span>
                        <input type="number" step="1" value={ref.min ?? ''} oninput={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { min: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                      </label>
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Max', 'Max')}</span>
                        <input type="number" step="1" value={ref.max ?? ''} oninput={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { max: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                      </label>
                    </div>
                    <div class="manager-character-modifier-override-row">
                      <button
                        type="button"
                        class={`manager-status-toggle ${hasOverride ? 'is-on' : 'is-off'}`}
                        aria-pressed={hasOverride}
                        aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                        onclick={() => setCharacterModifierOverrideEnabled(selectedGatheringDrop.id, ref, !hasOverride, libraryEntry)}
                      >
                        <span class="manager-status-toggle-track" aria-hidden="true">
                          <span class="manager-status-toggle-knob"></span>
                        </span>
                        <span class="manager-status-toggle-label">
                          {hasOverride
                            ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn', 'Overridden')
                            : text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                        </span>
                      </button>
                    </div>
                    {#if hasOverride}
                      <p class="manager-muted manager-character-modifier-override-hint">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint', 'Overrides the library expression for this row.')}</p>
                      <label class="manager-field" for={`drop-${selectedGatheringDrop.id}-character-modifier-${ref.id}-expression`}>
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression', 'Expression')}</span>
                        <input
                          type="text"
                          id={`drop-${selectedGatheringDrop.id}-character-modifier-${ref.id}-expression`}
                          value={ref.expressionOverride || ''}
                          oninput={(event) => onUpdateDropCharacterModifier(selectedGatheringDrop.id, ref.id, { expressionOverride: event.currentTarget.value })}
                        />
                      </label>
                    {/if}
                  </article>
                {:else}
                  <p class="manager-muted manager-character-modifier-row-empty">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty', 'No character modifiers attached.')}</p>
                {/each}
              </div>
            </section>
            </div>
            </div>
            {:else}
            <section class="manager-inspector-card" data-gathering-task-drop-inspector>
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.SelectedDrop', 'Selected drop rule')}</h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.NoDrops', 'No drops have been added.')}</p>
            </section>
            {/if}
            {/if}

          {:else}
            <div class="manager-empty">
              <div>
                <i class="fas fa-list-check" aria-hidden="true"></i>
                <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.SelectTask', 'Select a gathering task')}</h3>
                <p>{text('FABRICATE.Admin.Manager.Environment.Tasks.InspectorHint', 'The inspector shows gathering task availability, active environment matches, and drop summaries for the selected row.')}</p>
              </div>
            </div>
          {/if}
        {:else if (currentView === 'environments' && activeGatheringTab === 'encounters') || currentView === 'gathering-hazard-edit'}
          {#if currentView === 'gathering-hazard-edit' && editingGatheringHazard}
            <div class="manager-drop-inspector-stack" data-gathering-hazard-inspector-stack>
              <div class="manager-drop-inspector-scroll">
              {#each ['biome', 'timeOfDay', 'weather'] as kind (kind)}
                {@const cardTitle = gatheringModifierCardTitle(kind, 'hazard')}
                {@const cardHint = gatheringModifierCardHint(kind, 'hazard')}
                {@const availableConditions = gatheringConditionAvailableOptions(editingGatheringHazard, kind)}
                {@const pickerSelection = gatheringHazardModifierPickerSelection(kind)}
                {@const attachedModifiers = gatheringConditionModifierRows(editingGatheringHazard, kind)}
                <section class="manager-inspector-card manager-drop-editor-condition-modifier-card" data-gathering-hazard-condition-modifiers={kind}>
                  <header class="manager-character-modifier-row-card-header">
                    <div class="manager-character-modifier-row-card-heading">
                      <h3 class="manager-card-title">{cardTitle}</h3>
                      <p class="manager-muted">{cardHint}</p>
                    </div>
                  </header>
                  <div class="manager-condition-modifier-add-row" data-gathering-hazard-condition-modifier-picker={kind}>
                    <label class="manager-field manager-condition-modifier-picker">
                      <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ConditionPickerLabel', 'Condition')}</span>
                      <select
                        value={pickerSelection}
                        disabled={availableConditions.length === 0}
                        data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                        onchange={(event) => setGatheringHazardModifierPickerSelection(kind, event.currentTarget.value)}
                      >
                        {#each availableConditions as option (option.id)}
                          <option value={option.id}>{option.label || option.id}</option>
                        {/each}
                      </select>
                    </label>
                    <button
                      type="button"
                      class="manager-icon-button"
                      aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                      title={text('FABRICATE.Admin.Manager.Environment.Tasks.AddConditionModifier', 'Add modifier')}
                      disabled={availableConditions.length === 0 || !pickerSelection}
                      data-tooltip={availableConditions.length === 0 ? text('FABRICATE.Admin.Manager.Environment.Tasks.AllConditionsAdded', 'All conditions already added.') : null}
                      onclick={() => addGatheringHazardConditionModifier(kind, pickerSelection)}
                    >
                      <i class="fas fa-plus" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div class="manager-condition-modifier-row-list">
                    {#each attachedModifiers as modifier (modifier.id)}
                      <article class={`manager-condition-modifier-row-reference ${gatheringModifierValueClass(modifier)}`} data-gathering-hazard-modifier-id={modifier.id}>
                        <header class="manager-character-modifier-row-reference-header">
                          <span class="manager-character-modifier-icon">
                            <i class={gatheringModifierKindIcon(kind, modifier.conditionId)} aria-hidden="true"></i>
                          </span>
                          <span class="manager-character-modifier-row-reference-label">{gatheringConditionLabel(kind, modifier.conditionId) || modifier.conditionId}</span>
                          <label class="manager-condition-modifier-value">
                            <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}</span>
                            <input
                              type="text"
                              inputmode="numeric"
                              value={gatheringModifierDisplayValue(modifier)}
                              aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.ModifierValue', 'Modifier value')}
                              oninput={(event) => updateGatheringHazardConditionModifier(kind, modifier.id, signedToOperatorValue(event.currentTarget.value))}
                              onkeydown={(event) => onGatheringHazardModifierKeydown(kind, modifier, event)}
                            />
                            <span aria-hidden="true">%</span>
                          </label>
                          <button
                            type="button"
                            class="manager-icon-button is-danger manager-character-modifier-row-reference-delete"
                            aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteModifier', 'Delete modifier')}
                            onclick={() => deleteGatheringHazardConditionModifier(kind, modifier.id)}
                          >
                            <i class="fas fa-trash" aria-hidden="true"></i>
                          </button>
                        </header>
                      </article>
                    {/each}
                  </div>
                </section>
              {/each}

              <section class="manager-inspector-card manager-character-modifier-row-card" data-gathering-hazard-character-modifiers>
                <header class="manager-character-modifier-row-card-header">
                  <div class="manager-character-modifier-row-card-heading">
                    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionTitle', 'Character modifiers')}</h3>
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowSectionHint', 'Modifiers adjust the final chance based on the attempting character.')}</p>
                  </div>
                </header>
                <div class="manager-character-modifier-add-search-row">
                  <label bind:this={characterModifierSearchAnchor} class="manager-search is-compact manager-character-modifier-add-search" data-gathering-hazard-character-modifier-search>
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <input
                      type="search"
                      value={characterModifierSearchTerm}
                      oninput={(event) => { characterModifierSearchTerm = event.currentTarget.value; }}
                      placeholder={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchPlaceholder', 'Search character modifiers...')}
                      aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.AddSearchLabel', 'Search character modifiers to add')}
                      disabled={selectedGatheringCharacterModifiers.length === 0}
                      data-tooltip={selectedGatheringCharacterModifiers.length === 0 ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.LibraryEmptyHint', 'Add a modifier to the system library first to reference it here.') : null}
                    />
                    {#if hazardCharacterModifierSearchSuggestions.length > 0}
                      <div class="manager-tag-suggestions manager-character-modifier-add-suggestions" class:is-above={characterModifierSearchOpenUp} data-gathering-hazard-character-modifier-suggestions>
                        {#each hazardCharacterModifierSearchSuggestions as option (option.id)}
                          <button
                            type="button"
                            class="manager-tag-suggestion manager-character-modifier-add-suggestion"
                            data-gathering-hazard-character-modifier-suggestion={option.id}
                            onclick={() => pickCharacterModifierForHazard(option.id)}
                          >
                            <i class={option.icon || 'fa-solid fa-user'} aria-hidden="true"></i>
                            <span>{option.label || option.id}</span>
                          </button>
                        {/each}
                      </div>
                    {/if}
                  </label>
                </div>
                <div class="manager-character-modifier-row-list">
                  {#each rowCharacterModifiers(editingGatheringHazard) as ref (ref.id)}
                    {@const libraryEntry = characterModifierLibraryEntry(ref.modifierId)}
                    {@const hasOverride = characterModifierIsCustomized(ref)}
                    {@const operatorClass = characterModifierOperatorClass(ref.operator)}
                    <article class="manager-character-modifier-row-reference" data-gathering-hazard-character-modifier-ref={ref.id}>
                      <header class="manager-character-modifier-row-reference-header">
                        <span class="manager-character-modifier-icon"><i class={characterModifierIconForRef(ref)} aria-hidden="true"></i></span>
                        <span class="manager-character-modifier-row-reference-label">{characterModifierLabelForRef(ref)}</span>
                        {#if !libraryEntry}
                          <span class="manager-character-modifier-stale-warning" data-tooltip={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifier', 'Unknown modifier ({id})').replace('{id}', ref.modifierId)}>
                            <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                          </span>
                        {/if}
                        <label class={`manager-character-modifier-operator-select ${operatorClass}`}>
                          <span class="visually-hidden">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Operator', 'Operator')}</span>
                          <select value={ref.operator || '+'} onchange={(event) => onUpdateHazardCharacterModifier(ref.id, { operator: event.currentTarget.value })}>
                            <option value="+">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorPositive', 'Positive')}</option>
                            <option value="-">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OperatorNegative', 'Negative')}</option>
                          </select>
                        </label>
                        <button type="button" class="manager-icon-button is-danger manager-character-modifier-row-reference-delete" aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.DeleteRowReference', 'Delete character modifier reference')} onclick={() => onDeleteHazardCharacterModifier(ref.id)}>
                          <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                      </header>
                      <div class="manager-character-modifier-row-bounds">
                        <label class="manager-field">
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Min', 'Min')}</span>
                          <input type="number" step="1" value={ref.min ?? ''} oninput={(event) => onUpdateHazardCharacterModifier(ref.id, { min: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                        </label>
                        <label class="manager-field">
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Max', 'Max')}</span>
                          <input type="number" step="1" value={ref.max ?? ''} oninput={(event) => onUpdateHazardCharacterModifier(ref.id, { max: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} />
                        </label>
                      </div>
                      <div class="manager-character-modifier-override-row">
                        <button
                          type="button"
                          class={`manager-status-toggle ${hasOverride ? 'is-on' : 'is-off'}`}
                          aria-pressed={hasOverride}
                          aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                          onclick={() => setHazardCharacterModifierOverrideEnabled(ref, !hasOverride, libraryEntry)}
                        >
                          <span class="manager-status-toggle-track" aria-hidden="true">
                            <span class="manager-status-toggle-knob"></span>
                          </span>
                          <span class="manager-status-toggle-label">
                            {hasOverride
                              ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggleOn', 'Overridden')
                              : text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideToggle', 'Override?')}
                          </span>
                        </button>
                      </div>
                      {#if hasOverride}
                        <p class="manager-muted manager-character-modifier-override-hint">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.OverrideHint', 'Overrides the library expression for this row.')}</p>
                        <label class="manager-field" for={`hazard-${editingGatheringHazard.id}-character-modifier-${ref.id}-expression`}>
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression', 'Expression')}</span>
                          <input
                            id={`hazard-${editingGatheringHazard.id}-character-modifier-${ref.id}-expression`}
                            type="text"
                            value={ref.expressionOverride || ''}
                            oninput={(event) => onUpdateHazardCharacterModifier(ref.id, { expressionOverride: event.currentTarget.value })}
                          />
                        </label>
                      {/if}
                    </article>
                  {:else}
                    <p class="manager-muted manager-character-modifier-row-empty">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RowEmpty', 'No character modifiers attached.')}</p>
                  {/each}
                </div>
              </section>
              </div>
            </div>
          {:else if selectedGatheringHazard && currentView !== 'gathering-hazard-edit'}
            <section class="manager-inspector-card" data-gathering-hazard-inspector>
              <div class="manager-inspector-title-row is-hero-large">
                <img class="manager-recipe-preview" src={selectedGatheringHazard.img || 'icons/svg/hazard.svg'} alt="" />
                <div class="manager-inspector-copy">
                  <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Hazards.Selected', 'Selected gathering hazard')}</p>
                  <h2 class="manager-inspector-name" title={selectedGatheringHazard.name || ''}>{selectedGatheringHazard.name || text('FABRICATE.Admin.Manager.Environment.Hazards.UnnamedHazard', 'Unnamed hazard')}</h2>
                  <div class="manager-chip-row">
                    <span class={`manager-chip ${selectedGatheringHazard.enabled === false ? 'is-disabled' : 'is-active'}`}>
                      {selectedGatheringHazard.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                    </span>
                    {#if Array.isArray(selectedGatheringHazard.dangerTags) && selectedGatheringHazard.dangerTags.length > 0}
                      <span class="manager-chip">{sortedDangerTags(selectedGatheringHazard.dangerTags).join(', ')}</span>
                    {/if}
                  </div>
                </div>
              </div>

              <p class="manager-muted">
                {selectedGatheringHazard.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
              </p>
            </section>

            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Hazards.Details', 'Hazard details')}</h3>
              <div class="manager-fact-grid">
                <div class="manager-fact" data-gathering-hazard-fact="region">
                  <strong>{
                    (() => {
                      const regions = Array.isArray(selectedGatheringHazard.regions)
                        ? selectedGatheringHazard.regions
                        : (selectedGatheringHazard.region ? [selectedGatheringHazard.region] : []);
                      if (regions.length === 0) return text('FABRICATE.Admin.Manager.Environment.Hazards.AnyRegion', 'Any region');
                      return regions.map(id => gatheringOptionLabel('region', id) || id).join(', ');
                    })()
                  }</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Region', 'Region')}</span>
                </div>
                <div class="manager-fact" data-gathering-hazard-fact="biomes">
                  <strong>{Array.isArray(selectedGatheringHazard.biomes) && selectedGatheringHazard.biomes.length > 0 ? selectedGatheringHazard.biomes.length : text('FABRICATE.Admin.Manager.Environment.Hazards.AnyBiome', 'Any biome')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>
                </div>
                <div class="manager-fact" data-gathering-hazard-fact="drop-rate">
                  <strong>{(() => {
                    const rate = Number(selectedGatheringHazard.dropRate);
                    if (!Number.isFinite(rate)) return '—';
                    return `${Math.max(1, Math.min(100, Math.floor(rate)))}%`;
                  })()}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.DropRate', 'Drop rate')}</span>
                </div>
                <div class="manager-fact" data-gathering-hazard-fact="environments">
                  <strong>{(() => {
                    if (!selectedGatheringHazard?.id) return 0;
                    const hazardId = String(selectedGatheringHazard.id);
                    return environmentList.filter(env => {
                      if (String(env?.craftingSystemId || '') !== String(selectedSystemId || '')) return false;
                      const ids = Array.isArray(env?.enabledHazardIds) ? env.enabledHazardIds.map(String) : [];
                      return ids.includes(hazardId);
                    }).length;
                  })()}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.ActiveEnvironments', 'Active environments')}</span>
                </div>
              </div>
            </section>
          {:else if currentView !== 'gathering-hazard-edit'}
            <div class="manager-empty">
              <div>
                <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.SelectHazard', 'Select a gathering hazard')}</h3>
                <p>{text('FABRICATE.Admin.Manager.Environment.Hazards.InspectorHint', 'The inspector shows hazard availability, danger tags, drop rate, and active environment usage for the selected row.')}</p>
              </div>
            </div>
          {/if}
        {:else if currentView === 'environments' && activeGatheringTab === 'settings'}
          <section class="manager-inspector-card manager-gathering-rules-card" data-gathering-inspector-rules>
            <div class="manager-inspector-title-row">
              <span class="manager-inspector-icon" aria-hidden="true">
                <i class="fas fa-scale-balanced"></i>
              </span>
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Rules.Kicker', 'Gathering rules')}</p>
                <h2 class="manager-inspector-name">{text('FABRICATE.Admin.Manager.Environment.Rules.Title', 'Rules')}</h2>
              </div>
            </div>

            <div class="manager-rules-stack">
              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-gift"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-rewards">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.Rewards', 'Rewards')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.RewardsDescription', 'Choose how rewards are granted.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-rewards" value={selectedGatheringRules.rewardSelectionMode} onchange={(event) => updateSelectedGatheringRules({ rewardSelectionMode: event.target.value })}>
                    <option value="highestRankedDrop">{text('FABRICATE.Admin.Manager.Environment.Rules.HighestRankedDrop', 'Highest ranked successful drop')}</option>
                    <option value="allDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.AllDrops', 'All successful drops')}</option>
                    <option value="limitedDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.LimitedDrops', 'Limit successful drops')}</option>
                  </select>
                </span>
              </div>
              {#if selectedGatheringRules.rewardSelectionMode === 'limitedDrops'}
                <div class="manager-rule-stepper" data-gathering-rule-stepper="rewardLimit">
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.DecreaseRewardLimit', 'Decrease reward limit')} onclick={() => adjustGatheringRuleLimit('rewardLimit', -1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <input type="number" min="1" step="1" value={selectedGatheringRules.rewardLimit} aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.RewardLimit', 'Reward limit')} oninput={(event) => updateSelectedGatheringRules({ rewardLimit: Number(event.target.value || 1) })} />
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.IncreaseRewardLimit', 'Increase reward limit')} onclick={() => adjustGatheringRuleLimit('rewardLimit', 1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                </div>
              {/if}

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-triangle-exclamation"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-hazards">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.Hazards', 'Hazards')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.HazardsDescription', 'Choose how matching hazards are applied after a gathering roll.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-hazards" value={selectedGatheringRules.hazardSelectionMode} onchange={(event) => updateSelectedGatheringRules({ hazardSelectionMode: event.target.value })}>
                    <option value="highestRankedDrop">{text('FABRICATE.Admin.Manager.Environment.Rules.HazardHighestRankedDrop', 'Highest ranked triggered hazard')}</option>
                    <option value="allDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.HazardAllDrops', 'All triggered hazards')}</option>
                    <option value="limitedDrops">{text('FABRICATE.Admin.Manager.Environment.Rules.HazardLimitedDrops', 'Limit triggered hazards')}</option>
                  </select>
                </span>
              </div>
              {#if selectedGatheringRules.hazardSelectionMode === 'limitedDrops'}
                <div class="manager-rule-stepper" data-gathering-rule-stepper="hazardLimit">
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.DecreaseHazardLimit', 'Decrease hazard limit')} onclick={() => adjustGatheringRuleLimit('hazardLimit', -1)}><i class="fas fa-minus" aria-hidden="true"></i></button>
                  <input type="number" min="1" step="1" value={selectedGatheringRules.hazardLimit} aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.HazardLimit', 'Hazard limit')} oninput={(event) => updateSelectedGatheringRules({ hazardLimit: Number(event.target.value || 1) })} />
                  <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Rules.IncreaseHazardLimit', 'Increase hazard limit')} onclick={() => adjustGatheringRuleLimit('hazardLimit', 1)}><i class="fas fa-plus" aria-hidden="true"></i></button>
                </div>
              {/if}

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-scale-balanced"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-outcome">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.HazardOutcome', 'Hazard outcome')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.HazardOutcomeDescription', 'Decide whether rolling a hazard still allows the gathering attempt to succeed.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-outcome" value={selectedGatheringRules.hazardPolicy} onchange={(event) => updateSelectedGatheringRules({ hazardPolicy: event.target.value })}>
                    <option value="successWithHazard">{text('FABRICATE.Admin.Manager.Environment.Rules.GatheringSucceeds', 'Gathering succeeds')}</option>
                    <option value="failureWithHazard">{text('FABRICATE.Admin.Manager.Environment.Rules.GatheringFails', 'Gathering fails')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-screwdriver-wrench"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-tool-breakage">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageOutcome', 'Tool breakage outcome')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.ToolBreakageDescription', 'Decide whether a broken tool fails the gathering attempt or only reports the breakage.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-tool-breakage" value={selectedGatheringRules.toolBreakagePolicy ?? 'failureOnBreak'} onchange={(event) => updateSelectedGatheringRules({ toolBreakagePolicy: event.target.value })}>
                    <option value="failureOnBreak">{text('FABRICATE.Admin.Manager.Environment.Rules.ToolFailureOnBreak', 'Attempt fails on break')}</option>
                    <option value="successDespiteBreak">{text('FABRICATE.Admin.Manager.Environment.Rules.ToolSuccessDespiteBreak', 'Attempt succeeds despite break')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-mountain-sun"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-biome-aggregation">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiers', 'Biome modifiers')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeModifiersDescription', "Decide how multiple matching biome modifiers combine into one drop-rate adjustment.")}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-biome-aggregation" value={selectedGatheringRules.biomeModifierAggregation ?? 'strongestOfEach'} onchange={(event) => updateSelectedGatheringRules({ biomeModifierAggregation: event.target.value })}>
                    <option value="strongestOfEach">{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationStrongestOfEach', 'Strongest of each')}</option>
                    <option value="cumulative">{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationCumulative', 'Cumulative')}</option>
                    <option value="dominant">{text('FABRICATE.Admin.Manager.Environment.Rules.BiomeAggregationDominant', 'Dominant biome')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-eye-slash"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-blind-gate">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGate', 'Blind candidate gate')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.BlindCandidateGateDescription', 'In blind mode, choose whether the generic gather only resolves to tasks the character can attempt, or to any matching task.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-blind-gate" value={selectedGatheringRules.blindCandidateGate ?? 'attemptableOnly'} onchange={(event) => updateSelectedGatheringRules({ blindCandidateGate: event.target.value })}>
                    <option value="attemptableOnly">{text('FABRICATE.Admin.Manager.Environment.Rules.BlindGateAttemptableOnly', 'Only attemptable tasks')}</option>
                    <option value="allMatching">{text('FABRICATE.Admin.Manager.Environment.Rules.BlindGateAllMatching', 'Any matching task')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-wand-sparkles"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-reveal-policy">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealPolicy', 'Blind reveal')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealPolicyDescription', 'Decide whether a blind task is revealed to the player after they attempt it.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-reveal-policy" value={selectedGatheringRules.revealPolicy ?? 'never'} onchange={(event) => updateSelectedGatheringRules({ revealPolicy: event.target.value })}>
                    <option value="never">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealNever', 'Never reveal')}</option>
                    <option value="onSuccess">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealOnSuccess', 'Reveal on success')}</option>
                    <option value="onAttempt">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealOnAttempt', 'Reveal on any attempt')}</option>
                  </select>
                </span>
              </div>

              <div class="manager-rule-row">
                <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-users-viewfinder"></i></span>
                <label class="manager-rule-copy" for="manager-gathering-rule-reveal-scope">
                  <strong>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScope', 'Reveal scope')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeDescription', 'Who learns the revealed task: just the actor, the controlling user, the party, or everyone.')}</span>
                </label>
                <span class="manager-rule-field">
                  <select id="manager-gathering-rule-reveal-scope" value={selectedGatheringRules.revealScope ?? 'actor'} onchange={(event) => updateSelectedGatheringRules({ revealScope: event.target.value })}>
                    <option value="actor">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeActor', 'Actor')}</option>
                    <option value="user">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeUser', 'User')}</option>
                    <option value="party">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeParty', 'Party')}</option>
                    <option value="global">{text('FABRICATE.Admin.Manager.Environment.Rules.RevealScopeGlobal', 'Everyone')}</option>
                  </select>
                </span>
              </div>
            </div>
          </section>
        {:else if currentView === 'environments' && activeGatheringInspectorTab}
          <section class="manager-inspector-card" data-gathering-inspector-placeholder={activeGatheringInspectorTab.id}>
            <div class="manager-inspector-title-row is-hero-large">
              <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
                <i class={activeGatheringInspectorTab.icon}></i>
              </span>
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.Label', 'Gathering sections')}</p>
                <h2 class="manager-inspector-name">
                  {text(activeGatheringInspectorTab.titleKey, activeGatheringInspectorTab.titleFallback)}
                </h2>
              </div>
            </div>
            <p class="manager-muted">
              {text(activeGatheringInspectorTab.hintKey, activeGatheringInspectorTab.hintFallback)}
            </p>
          </section>
        {:else if selectedEnvironment}
          <section class="manager-inspector-card">
            <img class={`manager-environment-preview ${hasEnvironmentSceneImage(selectedEnvironment) ? '' : 'is-fallback'}`} src={environmentImage(selectedEnvironment)} alt="" />
            <div class="manager-inspector-copy">
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.Selected', 'Selected environment')}</p>
              <h2 class="manager-inspector-name" title={environmentName(selectedEnvironment)}>{environmentName(selectedEnvironment)}</h2>
              <div class="manager-chip-row">
                <span class={`manager-chip ${selectedEnvironment.enabled === false ? 'is-disabled' : 'is-active'}`}>{environmentStatusLabel(selectedEnvironment)}</span>
                <span class="manager-chip">{environmentSelectionModeLabel(selectedEnvironment)}</span>
                <span class={`manager-chip ${selectedEnvironmentSceneState.className}`}>{selectedEnvironmentSceneState.label}</span>
              </div>
            </div>

            <p class="manager-muted">
              {selectedEnvironment.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Details', 'Environment details')}</h3>
            <div class="manager-fact-grid">
              {#each selectedEnvironmentFacts as fact}
                <div class="manager-fact" data-environment-fact={fact.id}>
                  <strong>{fact.value}</strong>
                  <span>{fact.label}</span>
                </div>
              {/each}
            </div>
            {#if selectedEnvironment.sceneUuid}
              <p class="manager-muted">
                <strong>{text('FABRICATE.Admin.Manager.Environment.Scene', 'Scene')}:</strong>
                {selectedEnvironmentSceneState.name || selectedEnvironment.sceneUuid}
              </p>
            {/if}
          </section>

          {#if environmentDirtyFor(selectedEnvironment) || environmentInvalidFor(selectedEnvironment) || $viewState.environmentSaveError}
            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.DraftState', 'Draft state')}</h3>
              <div class="manager-feature-list">
                {#if environmentDirtyFor(selectedEnvironment)}
                  <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</span>
                {/if}
                {#if environmentInvalidFor(selectedEnvironment)}
                  <span class="manager-chip is-danger">{text('FABRICATE.Admin.Manager.Environment.ValidationCount', '{count} validation issues').replace('{count}', environmentValidationCount)}</span>
                {/if}
              </div>
              {#if $viewState.environmentSaveError}
                <p class="manager-muted">{$viewState.environmentSaveError}</p>
              {/if}
            </section>
          {/if}

        {:else if environmentList.length === 0}
          <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Environment.EmptySetup.Title', 'Plan gathering content')}>
            <div class="manager-setup-card-header">
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Kicker', 'Gathering setup')}</p>
                <h3>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Title', 'Plan gathering content')}</h3>
              </div>
            </div>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Hint', 'Gathering tasks and hazards give environments consistent activities, risks, and rewards across gathering locations.')}</p>
            <ol class="manager-setup-list">
              <li>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.StepTasks', 'Define gathering tasks with their checks, timing, result groups, and failure outcomes.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.StepHazards', 'Prepare encounter and hazard options that can be reused across risky locations.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.StepCreate', 'Create environments after the gathering task and hazard libraries are ready to attach.')}</li>
            </ol>
            <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Environment.EmptySetup.Resources', 'Environment resources')}>
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/gathering-environments/" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.GatheringDocs', 'Gathering docs')}</span>
              </a>
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Environment.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.SelectEnvironment', 'Select an environment')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Environment.InspectorHint', 'The inspector shows scene imagery, task evidence, draft state, and existing actions for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'essences' || currentView === 'essence-edit'}
        {#if selectedEssenceForInspector}
          <section class="manager-inspector-card">
            <div class="manager-inspector-title-row is-hero-large">
              <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
                <i class={selectedEssenceForInspector.icon || 'fas fa-mortar-pestle'}></i>
              </span>
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Essence.Selected', 'Selected essence')}</p>
                <h2 class="manager-inspector-name" title={selectedEssenceForInspector.name}>{selectedEssenceForInspector.name}</h2>
                <div class="manager-chip-row">
                  {#if selectedEssenceForInspector.deleteBlocked}
                    <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Essence.DeleteBlockedShort', 'In use')}</span>
                  {/if}
                </div>
              </div>
            </div>
            <p class="manager-muted">
              {selectedEssenceForInspector.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          {#if currentView === 'essence-edit' && (essenceEditDirty || essenceEditSaving)}
            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.DraftState', 'Draft state')}</h3>
              <div class="manager-feature-list">
                {#if essenceEditDirty}
                  <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Essence.Dirty', 'Unsaved')}</span>
                {/if}
                {#if essenceEditSaving}
                  <span class="manager-chip">{text('FABRICATE.Admin.Manager.Essence.Saving', 'Saving...')}</span>
                {/if}
              </div>
            </section>
          {/if}

          {#if showEssenceSourceUi && currentView !== 'essence-edit'}
          <section class="manager-inspector-card" data-essence-section="source">
            <div class="manager-edit-card-heading">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.Source', 'Source')}</h3>
            </div>
            {#if selectedEssenceForInspector.associatedItem}
              <div class="manager-essence-source-summary manager-essence-inspector-source-summary">
                <img class="manager-essence-source-thumb" src={selectedEssenceForInspector.associatedItem.img || 'icons/svg/item-bag.svg'} alt="" />
                <div class="manager-essence-source-copy">
                  <strong>{selectedEssenceForInspector.associatedItem.name || selectedEssenceForInspector.sourceName}</strong>
                </div>
              </div>
              <div class="manager-essence-inspector-source-actions">
                <button type="button" class="manager-button" data-essence-action="copy-source" title={selectedEssenceSourceUuid() || text('FABRICATE.Admin.Manager.Essence.SourceNoUuid', 'This component has no source item UUID.')} disabled={!selectedEssenceSourceUuid()} onclick={copySelectedEssenceSource}>
                  <i class="fas fa-copy" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Essence.CopySource', 'Copy source UUID')}</span>
                </button>
                <button type="button" class="manager-button is-warning-action" data-essence-action="unlink-source" onclick={unlinkSelectedEssenceSource}>
                  <i class="fas fa-unlink" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Essence.UnlinkSource', 'Unlink Source')}</span>
                </button>
              </div>
            {:else}
              <div class="manager-essence-source-drop-zone manager-essence-inspector-source-drop-zone">
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

          <section class="manager-inspector-card" data-essence-section="usage">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}</h3>
            <div class="manager-requirements-list">
              <div class="manager-requirement-row">
                <span>{text('FABRICATE.Admin.Manager.Essence.Usage', 'Usage')}</span>
                <strong>{text('FABRICATE.Admin.Manager.Essence.ComponentUsageCount', '{count} components').replace('{count}', selectedEssenceForInspector.componentUsageCount || 0)}</strong>
              </div>
            </div>
            {#if Array.isArray(selectedEssenceForInspector.componentUsageItems) && selectedEssenceForInspector.componentUsageItems.length > 0}
              <div class="manager-essence-usage-grid" aria-label={text('FABRICATE.Admin.Manager.Essence.ComponentUsageGrid', 'Components using this essence')}>
                {#each selectedEssenceForInspector.componentUsageItems as component (component.id)}
                  <button type="button" class="manager-essence-usage-item" title={component.name} aria-label={text('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}').replace('{name}', component.name)} onclick={() => editComponent(component.id)}>
                    <img src={componentImage(component)} alt="" />
                  </button>
                {/each}
              </div>
            {/if}
          </section>

          {#if selectedEssenceForInspector.deleteBlocked}
            <section class="manager-inspector-card">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.UsageBlockedTitle', 'Deletion blocked')}</h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Essence.UsageBlockedHint', 'Remove this essence from components before deleting the definition.')}</p>
            </section>
          {/if}

        {:else if currentView === 'essences' && essenceCards.length === 0}
          <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Essence.EmptySetup.Title', 'Set up essences')}>
            <div class="manager-setup-card-header">
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Essence.EmptySetup.Kicker', 'Essence setup')}</p>
                <h3>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.Title', 'Set up essences')}</h3>
              </div>
            </div>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Essence.EmptySetup.Hint', 'Create the first essence definition for this system, then assign quantities to components that should contribute that essence.')}</p>
            <ol class="manager-setup-list">
              <li>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.StepCreate', 'Create an essence with a clear name, icon, and description.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.StepAssign', 'Edit components to assign essence quantities that recipes can require.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.StepTransfer', 'If effect transfer is enabled, link source components whose effects should carry to crafted results.')}</li>
            </ol>
            <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Essence.EmptySetup.Resources', 'Essence resources')}>
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/essences/" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.EssenceDocs', 'Essence docs')}</span>
              </a>
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/effect-transfer/" target="_blank" rel="noreferrer">
                <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Essence.EmptySetup.EffectTransferDocs', 'Effect transfer')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
              <h3>{currentView === 'essence-edit'
                ? text('FABRICATE.Admin.Manager.Essence.CreateInspectorTitle', 'New essence draft')
                : text('FABRICATE.Admin.Manager.Essence.SelectEssence', 'Select an essence')}</h3>
              <p>{currentView === 'essence-edit'
                ? text('FABRICATE.Admin.Manager.Essence.CreateInspectorHint', 'The inspector will show the essence ID after the draft is saved.')
                : showEssenceSourceUi
                ? text('FABRICATE.Admin.Manager.Essence.InspectorHint', 'The inspector shows source linkage and component usage for the selected essence.')
                : text('FABRICATE.Admin.Manager.Essence.InspectorNoSourceHint', 'The inspector shows identity and component usage for the selected essence.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'components'}
        {#if selectedComponent}
          <section class="manager-inspector-card">
            <div class="manager-inspector-title-row is-hero-large">
              <img class="manager-component-preview" src={componentImage(selectedComponent)} alt="" />
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Component.Selected', 'Selected component')}</p>
                <h2 class="manager-inspector-name" title={selectedComponent.name}>{selectedComponent.name}</h2>
                <div class="manager-chip-row">
                  <span class={`manager-chip ${componentSourceState(selectedComponent).className}`}>{componentSourceState(selectedComponent).label}</span>
                </div>
              </div>
            </div>

            <p class="manager-muted">
              {selectedComponent.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          {#if showComponentTags}
            <section class="manager-inspector-card" data-component-section="tags">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Component.Tags', 'Tags')}</h3>
              <div class="manager-feature-list">
                {#each selectedComponent.tags || [] as tag}
                  <span class="manager-chip">{tag}</span>
                {:else}
                  <span class="manager-muted">{text('FABRICATE.Admin.Manager.Component.NoTags', 'No tags')}</span>
                {/each}
              </div>
            </section>
          {/if}

          {#if showComponentEssences}
            <section class="manager-inspector-card" data-component-section="essences">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Component.Essences', 'Essences')}</h3>
              <div class="manager-feature-list">
                {#each selectedComponent.essences || [] as essence}
                  <span class="manager-chip manager-essence-compact-chip" title={`${essence.name || essence.id} ${essence.quantity}`} aria-label={`${essence.name || essence.id} ${essence.quantity}`}>
                    <i class={essence.icon || 'fas fa-mortar-pestle'} aria-hidden="true"></i>{essence.quantity}
                  </span>
                {:else}
                  <span class="manager-muted">{text('FABRICATE.Admin.Manager.Component.NoEssences', 'No essences')}</span>
                {/each}
              </div>
            </section>
          {/if}

          <section class="manager-inspector-card" data-component-section="source">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Component.Source', 'Source')}</h3>
            {#if selectedComponent.hasSourceUuid}
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SourceHint', 'This component keeps a stored source ID for import matching and replacement.')}</p>
              {#if selectedComponent.sourceMissing}
                <p class="environment-stale-warning" data-component-source-missing>{text('FABRICATE.Admin.Manager.Component.SourceMissingHint', 'The stored source no longer resolves. Replace the component source or verify the original compendium/world item still exists.')}</p>
              {/if}
              <button type="button" class="manager-button" data-component-action="copy-source" title={selectedComponent.sourceUuidDisplay} onclick={() => copyComponentSource(selectedComponent.sourceUuidDisplay)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Component.CopySource', 'Copy source UUID')}</span>
              </button>
            {:else}
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.NoSourceHint', 'This component does not expose a stored source UUID in the current item-card data.')}</p>
            {/if}
          </section>

        {:else if itemCards.length === 0}
          <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Component.EmptySetup.Title', 'Set up components')}>
            <div class="manager-setup-card-header">
              <i class="fas fa-box-open" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Component.EmptySetup.Kicker', 'Component setup')}</p>
                <h3>{text('FABRICATE.Admin.Manager.Component.EmptySetup.Title', 'Set up components')}</h3>
              </div>
            </div>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.EmptySetup.Hint', 'Import item-backed components before recipes can reference ingredients, catalysts, results, or essence sources.')}</p>
            <ol class="manager-setup-list">
              <li>{text('FABRICATE.Admin.Manager.Component.EmptySetup.StepImport', 'Drop world, compendium, pack, or folder items into the component browser.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Component.EmptySetup.StepOrganize', 'Add tags, essences, source links, and difficulty metadata where the selected system uses them.')}</li>
              <li>{text('FABRICATE.Admin.Manager.Component.EmptySetup.StepRecipes', 'Use the managed components as recipe requirements, catalysts, and results.')}</li>
            </ol>
            <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Component.EmptySetup.Resources', 'Component resources')}>
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/crafting-systems/#components" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Component.EmptySetup.ComponentDocs', 'Component docs')}</span>
              </a>
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Component.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-boxes" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Component.SelectComponent', 'Select a component')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Component.InspectorHint', 'The inspector shows component identity, origin, tags, essences, and source copy context for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'recipes'}
        {#if selectedRecipe}
          <section class="manager-inspector-card">
            <div class="manager-inspector-title-row is-hero-large">
              <img class="manager-recipe-preview" src={recipeImage(selectedRecipe)} alt="" />
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Recipe.Selected', 'Selected recipe')}</p>
                <h2 class="manager-inspector-name" title={selectedRecipe.name}>{selectedRecipe.name}</h2>
                <div class="manager-chip-row">
                  <span class={`manager-chip ${selectedRecipe.enabled === false ? 'is-disabled' : 'is-active'}`}>
                    {selectedRecipe.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                  </span>
                  <span class={`manager-chip ${selectedRecipe.locked ? 'is-disabled' : 'is-active'}`}>
                    {selectedRecipe.locked ? text('FABRICATE.Admin.Manager.Recipe.Locked', 'Locked') : text('FABRICATE.Admin.Manager.Recipe.Unlocked', 'Unlocked')}
                  </span>
                </div>
              </div>
            </div>

            <p class="manager-muted">
              {selectedRecipe.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
            </p>
          </section>

          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Details', 'Recipe details')}</h3>
            <div class="manager-fact-grid">
              {#if showRecipeCategories}
                <div class="manager-fact" data-recipe-fact="category">
                  <strong>{selectedRecipe.category || text('FABRICATE.Admin.Manager.Recipe.General', 'General')}</strong>
                  <span>{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span>
                </div>
              {/if}
              <div class="manager-fact" data-recipe-fact="structure">
                <strong>{structureLabel(selectedRecipe)}</strong>
                <span>{text('FABRICATE.Admin.Manager.Recipe.Structure', 'Structure')}</span>
              </div>
              <div class="manager-fact" data-recipe-fact="steps">
                <strong>{stepCount(selectedRecipe)}</strong>
                <span>{text('FABRICATE.Admin.Manager.Recipe.Steps', 'Steps')}</span>
              </div>
              <div class="manager-fact" data-recipe-fact="result-groups">
                <strong>{resultGroupCount(selectedRecipe)}</strong>
                <span>{text('FABRICATE.Admin.Manager.Recipe.ResultGroups', 'Result groups')}</span>
              </div>
            </div>
            {#if $viewState.showVisibilitySummary}
              <p class="manager-muted">
                <strong>{text('FABRICATE.Admin.Manager.Recipe.PlayerVisibility', 'Player visibility')}:</strong>
                {selectedRecipe.visibilitySummary}
              </p>
            {/if}
          </section>

          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Requirements', 'Requirements')}</h3>
            <p class="manager-muted">{requirementsSummary(selectedRecipe)}</p>
            <div class="manager-requirements-list">
              {#each requirementsPreviewItems(selectedRecipe) as item}
                <div class="manager-requirement-row">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              {/each}
            </div>
          </section>

          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Actions', 'Recipe actions')}</h3>
            <div class="manager-inspector-actions">
              <button type="button" class="manager-button is-primary" data-recipe-action="edit" onclick={() => editRecipe()}>
                <i class="fas fa-edit" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Recipe.Edit', 'Edit recipe')}</span>
              </button>
              <button type="button" class="manager-button" data-recipe-action="duplicate" onclick={() => duplicateRecipe()}>
                <i class="fas fa-copy" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Recipe.Duplicate', 'Duplicate recipe')}</span>
              </button>
              <button type="button" class="manager-button is-danger" data-recipe-action="delete" onclick={() => deleteRecipe()}>
                <i class="fas fa-trash" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}</span>
              </button>
            </div>
          </section>
        {:else if ($viewState.recipes || []).length === 0}
          <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Title', 'Set up recipes')}>
            <div class="manager-setup-card-header">
              <i class="fas fa-scroll" aria-hidden="true"></i>
              <div>
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Kicker', 'Recipe setup')}</p>
                <h3>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Title', 'Set up recipes')}</h3>
              </div>
            </div>
            {#if selectedCounts.components > 0}
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Hint', 'Create the first recipe for this system after its reusable components are available.')}</p>
              <ol class="manager-setup-list">
                <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.StepStructure', 'Choose the recipe structure supported by the selected system.')}</li>
                <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.StepRequirements', 'Add ingredient sets, catalysts, and any visibility or timing requirements.')}</li>
                <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.StepResults', 'Define result groups and enable the recipe when it is ready for players.')}</li>
              </ol>
            {:else}
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsHint', 'Add components before creating recipes so ingredients, catalysts, and results have reusable items to reference.')}</p>
              <ol class="manager-setup-list">
                <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsStepComponents', 'Open Components and drop world, compendium, pack, or folder items into this system.')}</li>
                <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsStepOrganize', 'Review component names, source links, tags, essences, and difficulty metadata.')}</li>
                <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsStepRecipes', 'Return to Recipes and build requirements and results from those components.')}</li>
              </ol>
            {/if}
            <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Resources', 'Recipe resources')}>
              {#if selectedCounts.components <= 0}
                <button type="button" class="manager-button is-primary" onclick={() => setView('components')}>
                  <i class="fas fa-boxes" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.AddComponents', 'Add components')}</span>
                </button>
              {/if}
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/recipes/" target="_blank" rel="noreferrer">
                <i class="fas fa-book-open" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.RecipeDocs', 'Recipe docs')}</span>
              </a>
              <a class="manager-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
                <i class="fas fa-circle-question" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Quickstart', 'Quickstart')}</span>
              </a>
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-scroll" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Recipe.SelectRecipe', 'Select a recipe')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Recipe.InspectorHint', 'The inspector shows recipe status, structure, and requirements for the selected row.')}</p>
            </div>
          </div>
        {/if}
      {:else if currentView === 'tools'}
        {#if selectedLibraryTool}
          {@const toolImageSrc = (selectedSystem?.managedItemOptions || []).find(item => String(item.id) === String(selectedLibraryTool.componentId))?.img || 'icons/svg/item-bag.svg'}
          {@const toolComponent = (selectedSystem?.managedItemOptions || []).find(item => String(item.id) === String(selectedLibraryTool.componentId))}
          <section class="manager-inspector-card" data-manager-tool-inspector>
            <div class="manager-inspector-title-row is-hero-large">
              <img class="manager-recipe-preview" src={toolImageSrc} alt="" />
              <div class="manager-inspector-copy">
                <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.SelectedKicker', 'Selected tool')}</p>
                <div class="manager-tool-inspector-heading">
                  <h2 class="manager-inspector-name" title={selectedLibraryTool.label || toolComponent?.name || ''}>{selectedLibraryTool.label || toolComponent?.name || text('FABRICATE.Admin.Manager.Tools.OverviewComponentMissing', 'Not set')}</h2>
                  {#if selectedLibraryToolDirty}
                    <span class="manager-chip is-warning manager-tools-dirty-chip">
                      <i class="fas fa-save" aria-hidden="true"></i>
                      <span>{text('FABRICATE.Admin.Manager.Tools.Dirty', 'Unsaved')}</span>
                    </span>
                  {/if}
                </div>
              </div>
            </div>
            <div class="manager-tool-inspector-actions">
              <button type="button"
                class="manager-button is-danger"
                onclick={deleteSelectedLibraryTool}
                disabled={$viewState.toolsDraftSaving}>
                <i class="fas fa-trash" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Tools.Delete', 'Delete tool')}</span>
              </button>
              <button type="button"
                class="manager-button is-primary"
                onclick={saveSelectedToolDraft}
                disabled={!selectedLibraryToolDirty || !selectedToolDraftValidation.valid || $viewState.toolsDraftSaving}
                title={selectedToolDraftValidation.valid ? '' : selectedToolDraftValidation.errors.join('; ')}>
                <i class={$viewState.toolsDraftSaving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Tools.Save', 'Save changes')}</span>
              </button>
            </div>
          </section>

          <section class="manager-inspector-card manager-tools-component-browser-card" data-manager-tools-component-browser>
            <div class="manager-tools-component-browser-header">
              <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Environment.Tasks.ComponentBrowser', 'Components')}</h3>
              <label class="manager-search is-compact" data-manager-tools-component-search>
                <i class="fas fa-search" aria-hidden="true"></i>
                <input type="search"
                  value={toolsComponentSearchTerm}
                  oninput={onToolsComponentSearchInput}
                  placeholder={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsPlaceholder', 'Search components...')}
                  aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsByName', 'Search component names')} />
              </label>
            </div>

            <div class="manager-tools-component-browser-scroll">
              {#if toolsComponentCards.length === 0}
                <div class="manager-empty is-compact">
                  <div>
                    <i class="fas fa-box-open" aria-hidden="true"></i>
                    <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.NoComponents', 'No components available')}</h3>
                  </div>
                </div>
              {:else if toolsFilteredComponentCards.length === 0}
                <div class="manager-empty is-compact">
                  <div>
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptyComponentSearchTitle', 'No components match these filters')}</h3>
                  </div>
                </div>
              {:else}
                <div class="manager-tools-component-grid" role="list">
                  {#each toolsPaginatedComponentCards as item (item.id)}
                    <div class="manager-task-component-card"
                      role="listitem"
                      draggable="true"
                      data-manager-tools-component-card={item.id}
                      ondragstart={(event) => onToolsComponentDragStart(item, event)}>
                      <img class="manager-task-component-card-image" src={toolsComponentCardImage(item)} alt="" />
                      <span class="manager-task-component-card-copy">
                        <strong>{item.name}</strong>
                        <span>{toolsComponentDescription(item) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</span>
                        {#if Array.isArray(item.tags) && item.tags.length > 0}
                          <span class="manager-task-component-card-tags">
                            {#each item.tags.slice(0, 3) as tag (tag)}
                              <small>{tag}</small>
                            {/each}
                          </span>
                        {/if}
                      </span>
                      <span class="manager-task-component-card-grip" aria-hidden="true">⋮⋮</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="manager-tools-component-browser-footer">
              <Pagination
                totalCount={toolsFilteredComponentCards.length}
                pageSize={toolsComponentPageSize}
                pageIndex={toolsComponentPageIndex}
                pageSizeOptions={[6, 9, 12]}
                onPageChange={(next) => toolsComponentPageIndex = next}
                onPageSizeChange={(next) => { toolsComponentPageSize = next; toolsComponentPageIndex = 0; }}
              />
            </div>
          </section>
        {:else}
          <div class="manager-empty">
            <div>
              <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Tools.SelectEmpty', 'Select a tool to inspect.')}</h3>
            </div>
          </div>
        {/if}
      {:else if currentView === 'system-edit' && selectedSystem}
        <section class="manager-inspector-card">
          <div class="manager-inspector-title-row is-hero-large">
            <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
              <i class="fas fa-layer-group"></i>
            </span>
            <div class="manager-inspector-copy">
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.SystemEdit.Editing', 'Editing')}</p>
              <h2 class="manager-inspector-name" title={selectedSystem.name}>{selectedSystem.name}</h2>
              <div class="manager-chip-row">
                <span class="manager-chip is-active">{resolutionModeLabel(selectedSystem.resolutionMode)}</span>
                <span class={`manager-chip ${selectedSystem.advancedOptionsEnabled === false ? 'is-disabled' : 'is-active'}`}>
                  {selectedSystem.advancedOptionsEnabled === false
                    ? text('FABRICATE.Admin.Manager.SystemEdit.AdvancedHidden', 'Advanced hidden')
                    : text('FABRICATE.Admin.Manager.SystemEdit.AdvancedVisible', 'Advanced visible')}
                </span>
              </div>
            </div>
          </div>

          <p class="manager-muted">
            {selectedSystem.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
          </p>
        </section>

        <section class="manager-inspector-card">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.SystemEdit.Summary', 'Edit summary')}</h3>
          <div class="manager-fact-grid">
            <div class="manager-fact">
              <strong>{resolutionModeLabel(selectedSystem.resolutionMode)}</strong>
              <span>{text('FABRICATE.Admin.Manager.Column.Resolution', 'Resolution')}</span>
            </div>
            <div class="manager-fact">
              <strong>{enabledFeatureLabels.length}</strong>
              <span>{text('FABRICATE.Admin.Manager.SystemEdit.EnabledFeatureCount', 'Features enabled')}</span>
            </div>
          </div>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.SystemEdit.DeepConfigHint', 'Categories, tags, essences, checks, requirements, visibility, alchemy, and gathering configuration stay in later manager views.')}</p>
        </section>
      {:else if selectedSystem}
        <section class="manager-inspector-card">
          <div class="manager-inspector-title-row is-hero-large">
            <span class="manager-inspector-icon is-hero-large" aria-hidden="true">
              <i class="fas fa-layer-group"></i>
            </span>
            <div class="manager-inspector-copy">
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Column.System', 'System')}</p>
              <h2 class="manager-inspector-name" title={selectedSystem.name}>{selectedSystem.name}</h2>
              <div class="manager-chip-row">
                <span class="manager-chip is-active">{resolutionModeLabel(selectedSystem.resolutionMode)}</span>
                <span class={`manager-chip ${selectedSystem.enabled === false ? 'is-disabled' : 'is-active'}`}>
                  {selectedSystem.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
                </span>
              </div>
            </div>
          </div>

          <p class="manager-muted">
            {selectedSystem.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
          </p>
        </section>

        <section class="manager-inspector-card">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Counts', 'Counts')}</h3>
          <div class="manager-fact-grid">
            {#each selectedCountFacts as fact}
              {@const labelParts = countLabelParts(fact.label)}
              <div class="manager-fact" class:is-off={fact.isOff} data-count-id={fact.id}>
                {#if fact.isOff}
                  <span class="manager-fact-line">
                    <span class="manager-fact-label">{fact.label}</span>
                    <strong class="is-disabled">{fact.value}</strong>
                  </span>
                {:else}
                  <span class="manager-fact-line">
                    <span class="manager-fact-leading"><strong>{fact.value}</strong> {labelParts.lead}</span>{#if labelParts.rest}{' '}<span class="manager-fact-label">{labelParts.rest}</span>{/if}
                  </span>
                {/if}
              </div>
            {/each}
          </div>
        </section>

        <section class="manager-inspector-card" aria-label={text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}>
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnabledFeatures', 'Enabled features')}</h3>
          {#if enabledFeatureLabels.length > 0}
            <div class="manager-feature-list">
              {#each enabledFeatureLabels as feature}
                <span class="manager-chip is-active">{feature}</span>
              {/each}
            </div>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.NoOptionalFeatures', 'No optional features enabled.')}</p>
          {/if}
        </section>

        {#if selectedGatheringConditionShortcuts.length > 0}
          <section class="manager-inspector-card manager-condition-shortcut-card" data-systems-gathering-conditions aria-label={text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}>
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.GlobalConditions', 'Global conditions')}</h3>
            <div class="manager-condition-shortcut-list">
              {#each selectedGatheringConditionShortcuts as condition (condition.kind)}
                <label class="manager-field manager-condition-shortcut" data-systems-gathering-condition={condition.kind}>
                  <span class="manager-condition-shortcut-label">
                    <i class={condition.icon} aria-hidden="true"></i>
                    <span>{condition.label}</span>
                  </span>
                  <select value={condition.setting.current} onchange={(event) => updateSelectedGatheringCondition(condition.kind, event.currentTarget.value)}>
                    {#each conditionValues(condition.setting) as option (conditionId(option))}
                      <option value={conditionId(option)}>{conditionLabel(option)}</option>
                    {/each}
                  </select>
                </label>
              {/each}
            </div>
          </section>
        {/if}

      {:else if systemsLoading}
        <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}>
          <div class="manager-setup-card-header">
            <i class="fas fa-spinner" aria-hidden="true"></i>
            <div>
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.LoadingSystemsKicker', 'Startup')}</p>
              <h3>{text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}</h3>
            </div>
          </div>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.LoadingSystemsHint', 'Fabricate is finishing startup before the system library is shown.')}</p>
        </section>
      {:else if ($viewState.systems || []).length === 0}
        <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.EmptySetup.Title', 'Set up your first system')}>
          <div class="manager-setup-card-header">
            <i class="fas fa-compass" aria-hidden="true"></i>
            <div>
              <p class="manager-kicker">{text('FABRICATE.Admin.Manager.EmptySetup.Kicker', 'First run')}</p>
              <h3>{text('FABRICATE.Admin.Manager.EmptySetup.Title', 'Set up your first system')}</h3>
            </div>
          </div>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.EmptySetup.Hint', 'Create a crafting system, add item-backed components, then build recipes from those components.')}</p>
          <ol class="manager-setup-list">
            <li>{text('FABRICATE.Admin.Manager.EmptySetup.StepSystem', 'Create a system for one crafting discipline or ruleset.')}</li>
            <li>{text('FABRICATE.Admin.Manager.EmptySetup.StepComponents', 'Import world or compendium items as reusable components.')}</li>
            <li>{text('FABRICATE.Admin.Manager.EmptySetup.StepRecipes', 'Add recipes that consume components and award results.')}</li>
          </ol>
          <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.EmptySetup.Resources', 'Resources')}>
            <a class="manager-button" href="https://misterpotts.github.io/fabricate/quickstart/" target="_blank" rel="noreferrer">
              <i class="fas fa-book-open" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.EmptySetup.Quickstart', 'Quickstart')}</span>
            </a>
            <a class="manager-button" href="https://misterpotts.github.io/fabricate/" target="_blank" rel="noreferrer">
              <i class="fas fa-circle-question" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.EmptySetup.Docs', 'Docs')}</span>
            </a>
          </div>
        </section>
      {:else}
        <div class="manager-empty">
          <div>
            <i class="fas fa-arrow-pointer" aria-hidden="true"></i>
            <h3>{text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</h3>
            <p>{text('FABRICATE.Admin.Manager.InspectorHint', 'The inspector shows counts, resolution mode, and enabled features for the selected system.')}</p>
          </div>
        </div>
      {/if}
    </aside>
    {/if}
  </div>
</div>
