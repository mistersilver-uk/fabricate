<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../../util/iconPickerPopover.js';
  import Pagination from '../../components/Pagination.svelte';
  import IconPicker from '../../components/IconPicker.svelte';
  import ManagerColorPicker from '../../components/ManagerColorPicker.svelte';
  import ManagerColorPopover from '../../components/ManagerColorPopover.svelte';
  import GatheringTasksBrowserView from './GatheringTasksBrowserView.svelte';
  import GatheringHazardsBrowserView from './GatheringHazardsBrowserView.svelte';
  import GatheringEconomyView from './GatheringEconomyView.svelte';
  import GatheringTravelTabs from './GatheringTravelTabs.svelte';

  let {
    environments = [],
    environmentsLoading = false,
    environmentsError = '',
    environmentDraft = null,
    environmentDraftDirty = false,
    environmentValidationCount = 0,
    selectedEnvironmentId = '',
    selectedSystemName = '',
    selectedSystemId = '',
    gatheringConfig = null,
    sceneOptions = [],
    environmentTaskCounts = {},
    shouldUseEnvironmentDraftForDisplay = false,
    activeGatheringTab = 'environments',
    activeTravelTab = 'parties',
    onSelectTravelTab = () => {},
    services = null,
    selectedTaskId = '',
    selectedHazardId = '',
    managedItemOptions = [],
    onSelectGatheringTab = () => {},
    onSelectGatheringTask = () => {},
    onCreateGatheringTask = () => {},
    onEditGatheringTask = () => {},
    onDuplicateGatheringTask = () => {},
    onDeleteGatheringTask = () => {},
    onToggleGatheringTaskEnabled = () => {},
    onSelectGatheringHazard = () => {},
    onCreateGatheringHazard = () => {},
    onEditGatheringHazard = () => {},
    onDuplicateGatheringHazard = () => {},
    onDeleteGatheringHazard = () => {},
    onToggleGatheringHazardEnabled = () => {},
    onSelectEnvironment = () => {},
    onEditEnvironment = () => {},
    onCreateEnvironment = () => {},
    onDuplicateEnvironment = () => {},
    onDeleteEnvironment = () => {},
    onToggleEnvironmentEnabled = () => {},
    onUpdateGatheringConditions = () => {},
    onToggleGatheringConditionEnabled = () => {},
    onAddGatheringConditionValue = () => {},
    onUpdateGatheringConditionValue = () => {},
    onDeleteGatheringConditionValue = () => {},
    onAddGatheringVocabularyValue = () => {},
    onUpdateGatheringVocabularyValue = () => {},
    onDeleteGatheringVocabularyValue = () => {},
    gatheringRegionSettings = { enabled: false },
    onSetGatheringRegionsEnabled = () => {},
    onPickImagePath = null,
    travelParties = [],
    travelSelectedPartyId = '',
    travelSaving = false,
    travelError = null,
    travelFieldErrors = {},
    travelActorOptions = [],
    travelSystemRegions = [],
    onSelectParty = () => {},
    onCreateParty = () => {},
    onRenameParty = () => {},
    onSetPartyEnabled = () => {},
    onDeleteParty = () => {},
    onAddPartyMember = () => {},
    onRemovePartyMember = () => {},
    onMovePartyMember = () => {},
    onSetPartyTravelActor = () => {},
    onClearPartyTravelActor = () => {},
    onSetPartyRegionOverride = () => {},
    onClearPartyRegionOverride = () => {},
    onRemoveStaleMember = () => {},
    onClearStaleTravelActor = () => {},
    onDropStaleOverrideRegion = () => {},
    onCreateRegionQuick = () => {},
    onRenameRegion = () => {},
    onToggleRegionEnabled = () => {},
    onUpdateRegion = () => {},
    onDeleteRegion = () => {}
  } = $props();

  let searchTerm = $state('');
  let statusFilter = $state('all');
  let selectionFilter = $state('all');
  let riskFilter = $state('all');
  let biomeFilter = $state('all');
  let lastSystemId = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);
  let weatherInput = $state('');
  let timeOfDayInput = $state('');
  let biomeInput = $state('');
  let weatherIconInput = $state('fas fa-cloud-sun');
  let timeOfDayIconInput = $state('fas fa-clock');
  let biomeIconInput = $state('fas fa-tree');
  let biomeColorTokenInput = $state('sage');
  let biomeCustomColorInput = $state('');
  let openBiomeColorPickerId = $state('');
  let biomeColorTriggerButton = $state(null);
  let biomeColorPopoverRoot = $state(null);
  let biomeColorPopoverStyle = $state('');

  const gatheringTabs = [
    {
      id: 'environments',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Environments',
      labelFallback: 'Environments',
      icon: 'fas fa-seedling'
    },
    {
      id: 'tasks',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Tasks',
      labelFallback: 'Tasks',
      icon: 'fas fa-list-check',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksTitle',
      titleFallback: 'Gathering Tasks',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TasksHint',
      hintFallback: 'Browse gathering tasks before attaching them to environments.'
    },
    {
      id: 'encounters',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Encounters',
      labelFallback: 'Hazards',
      icon: 'fas fa-exclamation-triangle',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersTitle',
      titleFallback: 'Gathering hazards',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.EncountersHint',
      hintFallback: 'Browse reusable hazards before attaching them to environments.'
    },
    {
      id: 'travel',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Travel',
      labelFallback: 'Travel',
      icon: 'fas fa-route',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TravelTitle',
      titleFallback: 'Travel and parties',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.TravelHint',
      hintFallback: 'Manage Fabricate parties and set the current region for this crafting system.'
    },
    {
      id: 'settings',
      labelKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.Settings',
      labelFallback: 'Settings',
      icon: 'fas fa-sliders',
      titleKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderTitle',
      titleFallback: 'Gathering settings',
      hintKey: 'FABRICATE.Admin.Manager.Environment.GatheringTabs.SettingsPlaceholderHint',
      hintFallback: 'Set system-level drop resolution and hazard rules for gathering.'
    }
  ];

  $effect(() => {
    if (selectedSystemId === lastSystemId) return;
    searchTerm = '';
    statusFilter = 'all';
    selectionFilter = 'all';
    riskFilter = 'all';
    biomeFilter = 'all';
    weatherInput = '';
    timeOfDayInput = '';
    biomeInput = '';
    weatherIconInput = defaultConditionIcon('weather');
    timeOfDayIconInput = defaultConditionIcon('timeOfDay');
    biomeIconInput = 'fas fa-tree';
    biomeColorTokenInput = 'sage';
    biomeCustomColorInput = '';
    openBiomeColorPickerId = '';
    lastSystemId = selectedSystemId;
  });

  const environmentList = $derived(environments || []);
  const selectedGatheringSystemConfig = $derived(gatheringConfig?.systems?.[selectedSystemId] || {});
  // Top-level vocabularies from the admin store are normalised into
  // { id, label, icon, colorToken } records, so the fallback path used by
  // systems with no per-system override renders capitalised labels and
  // per-biome colour tokens.
  const weatherCondition = $derived(selectedGatheringSystemConfig.conditions?.weather || {
    enabled: true,
    current: gatheringConfig?.conditions?.weather || 'clear',
    values: gatheringConfig?.vocabularies?.weather || []
  });
  const timeOfDayCondition = $derived(selectedGatheringSystemConfig.conditions?.timeOfDay || {
    enabled: true,
    current: gatheringConfig?.conditions?.timeOfDay || 'day',
    values: gatheringConfig?.vocabularies?.timeOfDay || []
  });
  const biomeVocabulary = $derived(selectedGatheringSystemConfig.vocabularies?.biomes || {
    values: gatheringConfig?.vocabularies?.biomes || []
  });
  const biomeVocabularyOptions = $derived(Array.isArray(biomeVocabulary?.values) ? biomeVocabulary.values : []);
  const activeGatheringTabConfig = $derived(gatheringTabs.find(tab => tab.id === activeGatheringTab) || gatheringTabs[0]);
  const regionsEnabled = $derived(gatheringRegionSettings?.enabled === true);
  const biomeOptions = $derived(uniqueSorted(environmentList.flatMap(environment =>
    Array.isArray(environment.biomes) ? environment.biomes : (environment.biome ? [environment.biome] : []))));
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredEnvironments = $derived(environmentList.filter(environment => {
    const matchesSearch = !normalizedSearchTerm
      || `${environmentName(environment)} ${environment.description || ''}`.toLowerCase().includes(normalizedSearchTerm);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && environment.enabled !== false)
      || (statusFilter === 'disabled' && environment.enabled === false)
      || (statusFilter === 'dirty' && selectedEnvironmentId === environment.id && environmentDraftDirty === true)
      || (statusFilter === 'invalid' && selectedEnvironmentId === environment.id && environmentValidationCount > 0);
    const matchesSelection = selectionFilter === 'all'
      || environment.selectionMode === selectionFilter;
    const matchesRisk = riskFilter === 'all' || (environment.risk || 'safe') === riskFilter;
    const matchesBiome = biomeFilter === 'all'
      || (Array.isArray(environment.biomes)
        ? environment.biomes.includes(biomeFilter)
        : (environment.biome || '') === biomeFilter);
    return matchesSearch && matchesStatus && matchesSelection && matchesRisk && matchesBiome;
  }));
  const filtersActive = $derived(
    normalizedSearchTerm.length > 0
    || statusFilter !== 'all'
    || selectionFilter !== 'all'
    || riskFilter !== 'all'
    || biomeFilter !== 'all'
  );
  const paginatedEnvironments = $derived(filteredEnvironments.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredEnvironments.length) {
      pageIndex = 0;
    }
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function stackedLabel(key, fallback) {
    return `${text(key, fallback)}:`;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function prettifyTag(value) {
    const str = String(value || '').trim();
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  }

  function linkedSceneForEnvironment(environment) {
    const sceneUuid = environment?.sceneUuid || '';
    if (!sceneUuid) return null;
    return (sceneOptions || []).find(scene => scene.uuid === sceneUuid) || null;
  }

  function environmentName(environment) {
    const explicitName = typeof environment?.name === 'string' ? environment.name.trim() : '';
    if (explicitName) return explicitName;
    return text('FABRICATE.Admin.Environments.NewDraftTitle', 'New Gathering Environment');
  }

  function environmentSceneImage(environment) {
    const linkedScene = linkedSceneForEnvironment(environment);
    return linkedScene?.img || linkedScene?.thumbnail || linkedScene?.thumb || '';
  }

  function environmentImage(environment) {
    // A linked scene's thumbnail takes the place of the environment's own image; the stored
    // `img` is kept as a fallback for when the scene is unlinked.
    const sceneImage = environmentSceneImage(environment);
    if (sceneImage) return sceneImage;
    const explicitImage = typeof environment?.img === 'string' ? environment.img.trim() : '';
    return explicitImage || 'icons/svg/item-bag.svg';
  }

  function hasEnvironmentImage(environment) {
    const explicitImage = typeof environment?.img === 'string' ? environment.img.trim() : '';
    return Boolean(environmentSceneImage(environment) || explicitImage);
  }

  function environmentSelectionModeLabel(environment) {
    return environment?.selectionMode === 'blind'
      ? text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')
      : text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted');
  }

  function environmentTaskCount(environment) {
    const counts = environmentTaskCounts?.[environment?.id];
    if (counts && Number.isFinite(Number(counts.availableTaskCount))) return Number(counts.availableTaskCount);
    return 0;
  }

  function environmentDirtyFor(environment) {
    return environment?.id && environmentDraft?.id === environment.id && environmentDraftDirty === true;
  }

  function environmentInvalidFor(environment) {
    return environment?.id && environmentDraft?.id === environment.id && environmentValidationCount > 0;
  }

  function environmentDisplay(environment) {
    if (!environment) return null;
    if (shouldUseEnvironmentDraftForDisplay && environmentDraft?.id === environment.id) {
      return environmentDraft;
    }
    return environment;
  }

  function clearFilters() {
    searchTerm = '';
    statusFilter = 'all';
    selectionFilter = 'all';
    riskFilter = 'all';
    biomeFilter = 'all';
  }

  function selectGatheringTab(tabId) {
    onSelectGatheringTab(tabId);
  }

  function conditionTitle(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayTitle', 'Times of day')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.WeatherTitle', 'Weather conditions');
  }

  function conditionCurrentLabel(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.CurrentTimeOfDay', 'Current time')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.CurrentWeather', 'Current weather');
  }

  function conditionAddLabel(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.AddTimeOfDay', 'Add time of day')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.AddWeather', 'Add weather');
  }

  function conditionHint(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayHint', 'These values control current time matching for gathering tasks and hazards. Click the name of a time of day to edit it.')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.WeatherHint', 'These values control weather matching for gathering tasks and hazards. Click the name of a condition to edit it.');
  }

  function conditionInputPlaceholder(kind) {
    return kind === 'timeOfDay'
      ? text('FABRICATE.Admin.Manager.Environment.Conditions.TimeOfDayPlaceholder', 'e.g. Midnight')
      : text('FABRICATE.Admin.Manager.Environment.Conditions.WeatherPlaceholder', 'e.g. Ashfall');
  }

  function conditionInputValue(kind) {
    return kind === 'timeOfDay' ? timeOfDayInput : weatherInput;
  }

  function setConditionInput(kind, value) {
    if (kind === 'timeOfDay') timeOfDayInput = value;
    else weatherInput = value;
  }

  function conditionAddIcon(kind) {
    return kind === 'timeOfDay' ? timeOfDayIconInput : weatherIconInput;
  }

  function setConditionAddIcon(kind, value) {
    if (kind === 'timeOfDay') timeOfDayIconInput = value;
    else weatherIconInput = value;
  }

  function submitConditionValue(event, kind) {
    event.preventDefault();
    const value = conditionInputValue(kind).trim();
    if (!value) return;
    onAddGatheringConditionValue?.(kind, { label: value, icon: conditionAddIcon(kind) }, selectedSystemId);
    setConditionInput(kind, '');
  }

  function vocabularyTitle() {
    return text('FABRICATE.Admin.Manager.Environment.Vocabularies.BiomesTitle', 'Biomes');
  }

  function vocabularyAddLabel() {
    return text('FABRICATE.Admin.Manager.Environment.Vocabularies.AddBiome', 'Add biome');
  }

  function vocabularyHint() {
    return text('FABRICATE.Admin.Manager.Environment.Vocabularies.BiomesHint', 'Environments can have multiple biomes. Left-click the icon to swap it out, right-click to change the colour.');
  }

  function vocabularyPlaceholder() {
    return text('FABRICATE.Admin.Manager.Environment.Vocabularies.BiomePlaceholder', 'e.g. Mushroom forest');
  }

  function vocabularyInputValue() {
    return biomeInput;
  }

  function setVocabularyInput(value) {
    biomeInput = value;
  }

  function submitVocabularyValue(event, kind) {
    event.preventDefault();
    const value = vocabularyInputValue().trim();
    if (!value) return;
    const payload = { label: value, icon: biomeIconInput, colorToken: biomeColorTokenInput, customColor: biomeCustomColorInput };
    onAddGatheringVocabularyValue?.(kind, payload, selectedSystemId);
    setVocabularyInput('');
  }

  function vocabularyId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function vocabularyLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function vocabularyValues(vocabulary) {
    return Array.isArray(vocabulary?.values) ? vocabulary.values : [];
  }

  function biomeIcon(option) {
    if (option && typeof option === 'object' && option.icon) return option.icon;
    return 'fas fa-tree';
  }

  function biomeColorToken(option) {
    if (option && typeof option === 'object' && option.colorToken) return option.colorToken;
    return 'sage';
  }

  function biomeCustomColor(option) {
    if (option && typeof option === 'object' && option.customColor) return option.customColor;
    return '';
  }

  function biomeSwatchStyle(option) {
    const hex = /^#[0-9a-fA-F]{6}$/.test(biomeCustomColor(option)) ? biomeCustomColor(option) : '';
    const token = String(biomeColorToken(option) || 'sage').replace(/^--fab-tag-/, '');
    return `--manager-color-swatch: ${hex || `var(--fab-tag-${token})`}`;
  }

  function openBiomeColorPicker(event, id) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const shouldOpen = openBiomeColorPickerId !== id;
    openBiomeColorPickerId = shouldOpen ? id : '';
    biomeColorTriggerButton = shouldOpen ? event?.currentTarget ?? null : null;
    if (shouldOpen) {
      updateBiomeColorPopoverPosition();
    }
  }

  function handleBiomeIconKeydown(event, id) {
    if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;
    openBiomeColorPicker(event, id);
  }

  function closeBiomeColorPicker() {
    openBiomeColorPickerId = '';
    biomeColorTriggerButton = null;
  }

  function getBiomeColorPopoverHost() {
    if (!biomeColorTriggerButton || typeof document === 'undefined') return null;

    return biomeColorTriggerButton.closest('.fabricate-manager');
  }

  function getBiomeColorPopoverHorizontalBounds(hostRect) {
    if (!biomeColorTriggerButton) return {};

    const mainPanel = biomeColorTriggerButton.closest('.manager-main');
    const mainPanelRect = mainPanel?.getBoundingClientRect?.();
    if (!mainPanelRect) return {};

    return {
      minLeft: mainPanelRect.left - hostRect.left + 16,
      maxRight: mainPanelRect.right - hostRect.left - 16
    };
  }

  function updateBiomeColorPopoverPosition() {
    if (!openBiomeColorPickerId || !biomeColorTriggerButton || typeof window === 'undefined') return;

    const popoverHost = getBiomeColorPopoverHost();
    const hostRect = popoverHost?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const triggerRect = biomeColorTriggerButton.getBoundingClientRect();
    const horizontalBounds = getBiomeColorPopoverHorizontalBounds(hostRect);
    const layout = computeIconPickerPopoverLayout(
      {
        left: triggerRect.left - hostRect.left,
        right: triggerRect.right - hostRect.left,
        top: triggerRect.top - hostRect.top,
        bottom: triggerRect.bottom - hostRect.top,
        width: triggerRect.width,
        height: triggerRect.height
      },
      { width: hostRect.width || window.innerWidth, height: hostRect.height || window.innerHeight },
      {
        horizontalAlign: 'left',
        minLeft: horizontalBounds.minLeft,
        maxRight: horizontalBounds.maxRight,
        minWidth: 220,
        maxWidth: 220
      }
    );

    if (!layout) {
      biomeColorPopoverStyle = '';
      return;
    }

    const verticalPosition = layout.placement === 'top'
      ? `top: auto; bottom: ${layout.bottom}px;`
      : `top: ${layout.top}px; bottom: auto;`;

    biomeColorPopoverStyle = [
      `left: ${layout.left}px;`,
      'right: auto;',
      `width: ${layout.width}px;`,
      `max-height: ${layout.maxHeight}px;`,
      verticalPosition
    ].join(' ');
  }

  function registerBiomeColorPopoverNode(node) {
    biomeColorPopoverRoot = node;
  }

  $effect(() => {
    if (!openBiomeColorPickerId || typeof window === 'undefined' || typeof document === 'undefined') {
      biomeColorPopoverStyle = '';
      biomeColorPopoverRoot = null;
      return;
    }

    updateBiomeColorPopoverPosition();

    const handleViewportChange = () => updateBiomeColorPopoverPosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });

  function updateCurrentCondition(kind, value) {
    onUpdateGatheringConditions?.({ [kind]: value, systemId: selectedSystemId });
  }

  function conditionId(option) {
    if (option && typeof option === 'object') return String(option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionLabel(option) {
    if (option && typeof option === 'object') return String(option.label || option.id || '').trim();
    return String(option || '').trim();
  }

  function conditionIcon(option, kind) {
    if (option && typeof option === 'object' && option.icon) return option.icon;
    return defaultConditionIcon(kind);
  }

  function defaultConditionIcon(kind) {
    return kind === 'timeOfDay' ? 'fas fa-clock' : 'fas fa-cloud-sun';
  }

  function conditionValues(setting) {
    return Array.isArray(setting?.values) ? setting.values : [];
  }

  function gatheringHeaderTitle() {
    const titleKey = activeGatheringTabConfig?.titleKey;
    if (titleKey) return text(titleKey, activeGatheringTabConfig.titleFallback);
    return text('FABRICATE.Admin.Manager.Environment.Library', 'Gathering environments');
  }

  function gatheringHeaderHint() {
    const hintKey = activeGatheringTabConfig?.hintKey;
    if (hintKey) return text(hintKey, activeGatheringTabConfig.hintFallback);
    return text('FABRICATE.Admin.Manager.Environment.LibraryHint', 'Browse scene-linked gathering environments and open the existing editor for task authoring.');
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{gatheringHeaderTitle()}</h2>
      <p class="manager-subtitle">{gatheringHeaderHint()}</p>
    </div>
  </section>

  {#if activeGatheringTab === 'environments'}
    <div
      class="manager-gathering-panel manager-gathering-panel-environments"
      id="manager-gathering-panel-environments"
      role="tabpanel"
      aria-labelledby="manager-gathering-nav-environments"
    >
      <section class="manager-toolbar manager-environments-toolbar" aria-label={text('FABRICATE.Admin.Manager.Environment.Filters', 'Environment filters')}>
        <label class="manager-search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input
            type="search"
            bind:value={searchTerm}
            placeholder={text('FABRICATE.Admin.Manager.Environment.SearchPlaceholder', 'Search environments...')}
            aria-label={text('FABRICATE.Admin.Manager.Environment.SearchLabel', 'Search environments')}
          />
        </label>
        <label class="manager-filter">
          <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
          <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.Environment.StatusFilterLabel', 'Filter environments by status')}>
            <option value="all">{text('FABRICATE.Admin.Manager.Environment.StatusAll', 'All environments')}</option>
            <option value="active">{text('FABRICATE.Admin.Manager.StatusActive', 'Active')}</option>
            <option value="disabled">{text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')}</option>
            <option value="dirty">{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</option>
            <option value="invalid">{text('FABRICATE.Admin.Manager.Environment.Invalid', 'Invalid')}</option>
          </select>
        </label>
        <label class="manager-filter">
          <span>{text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode')}</span>
          <select value={selectionFilter} onchange={(event) => selectionFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.Environment.SelectionFilterLabel', 'Filter environments by selection mode')}>
            <option value="all">{text('FABRICATE.Admin.Manager.Environment.SelectionAll', 'All modes')}</option>
            <option value="targeted">{text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted')}</option>
            <option value="blind">{text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')}</option>
          </select>
        </label>
        <label class="manager-filter">
          <span>{text('FABRICATE.Admin.Manager.Environment.Risk', 'Risk')}</span>
          <select value={riskFilter} onchange={(event) => riskFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.Environment.RiskFilterLabel', 'Filter environments by risk')}>
            <option value="all">{text('FABRICATE.Admin.Manager.Environment.RiskAll', 'All risks')}</option>
            <option value="safe">{text('FABRICATE.Admin.Manager.Environment.RiskSafe', 'Safe')}</option>
            <option value="hazardous">{text('FABRICATE.Admin.Manager.Environment.RiskHazardous', 'Hazardous')}</option>
            <option value="unsafe">{text('FABRICATE.Admin.Manager.Environment.RiskUnsafe', 'Unsafe')}</option>
            <option value="extreme">{text('FABRICATE.Admin.Manager.Environment.RiskExtreme', 'Extreme')}</option>
          </select>
        </label>
        <label class="manager-filter">
          <span>{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>
          <select value={biomeFilter} onchange={(event) => biomeFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.Environment.BiomeFilterLabel', 'Filter environments by biome')}>
            <option value="all">{text('FABRICATE.Admin.Manager.Environment.BiomeAll', 'All biomes')}</option>
            {#each biomeOptions as biome (biome)}
              <option value={biome}>{prettifyTag(biome)}</option>
            {/each}
          </select>
        </label>
        <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredEnvironments.length).replace('{total}', environmentList.length)}</span>
        {#if filtersActive}
          <button type="button" class="manager-button manager-clear-filters" data-clear-filters="environments" onclick={clearFilters}>
            <i class="fas fa-times" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
          </button>
        {/if}
      </section>

      <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Environment.Table', 'Environments table')}>
        {#if environmentsLoading}
          <div class="manager-empty">
            <div>
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Environments.Loading', 'Loading environments...')}</h3>
            </div>
          </div>
        {:else if environmentsError}
          <div class="manager-empty">
            <div>
              <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Environments.ErrorTitle', 'Could Not Load Environments')}</h3>
              <p>{environmentsError}</p>
            </div>
          </div>
        {:else if environmentList.length === 0}
          <div class="manager-empty">
            <div>
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.EmptyTitle', 'Prepare gathering building blocks first')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Environment.EmptyHint', 'Define gathering tasks and hazards before creating environments, then attach those building blocks to each location players can gather from.')}</p>
              <div class="manager-action-group">
                <button type="button" class="manager-button is-primary" onclick={onCreateEnvironment}>
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Create', 'Create environment')}</span>
                </button>
                <button type="button" class="manager-button" onclick={() => selectGatheringTab('tasks')}>
                  <i class="fas fa-list-check" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenTasks', 'Review tasks')}</span>
                </button>
                <button type="button" class="manager-button" onclick={() => selectGatheringTab('encounters')}>
                  <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.GatheringTabs.OpenHazards', 'Review hazards')}</span>
                </button>
              </div>
            </div>
          </div>
        {:else if filteredEnvironments.length === 0}
          <div class="manager-empty">
            <div>
              <i class="fas fa-search" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.EmptySearchTitle', 'No environments match these filters')}</h3>
              <p>{text('FABRICATE.Admin.Manager.Environment.EmptySearchHint', 'Clear search and filters to show all environments in this system.')}</p>
              <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button>
            </div>
          </div>
        {:else}
          <div class="manager-environments-table" role="table" aria-label={text('FABRICATE.Admin.Manager.Environment.TableShort', 'Environments')}>
            <div class="manager-table-head manager-environment-table-head" role="row">
              <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Column.Environment', 'Environment')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Environments.Tasks', 'Tasks')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
            </div>
            {#each paginatedEnvironments as environment (environment.id)}
              {@const displayEnvironment = environmentDisplay(environment)}
              <div class={`manager-environment-row ${selectedEnvironmentId === environment.id ? 'is-selected' : ''}`} role="row" aria-selected={selectedEnvironmentId === environment.id} data-environment-id={environment.id}>
                <button type="button" class="manager-environment-identity" onclick={() => onSelectEnvironment(environment.id)} role="cell">
                  <img class={`manager-environment-thumb ${hasEnvironmentImage(displayEnvironment) ? '' : 'is-fallback'}`} src={environmentImage(displayEnvironment)} alt="" />
                  <span class="manager-system-copy">
                    <span class="manager-system-name" title={environmentName(displayEnvironment)}>{environmentName(displayEnvironment)}</span>
                    {#if displayEnvironment.description}
                      <span class="manager-system-description" title={displayEnvironment.description}>{displayEnvironment.description}</span>
                    {:else}
                      <span class="manager-system-description">{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span>
                    {/if}
                    <span class="manager-chip-row">
                      {#if environmentDirtyFor(environment)}
                        <span class="manager-chip is-warning">{text('FABRICATE.Admin.Manager.Environment.Dirty', 'Unsaved')}</span>
                      {/if}
                      {#if environmentInvalidFor(environment)}
                        <span class="manager-chip is-danger">{text('FABRICATE.Admin.Manager.Environment.Invalid', 'Invalid')}</span>
                      {/if}
                    </span>
                  </span>
                </button>
                <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode')}>
                  <span class="manager-chip">{environmentSelectionModeLabel(displayEnvironment)}</span>
                </span>
                <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Environments.Tasks', 'Tasks')}>
                  <strong class="manager-environment-task-count">{environmentTaskCount(environment)}</strong>
                </span>
                <span role="cell" class="manager-labeled-cell manager-status-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.StatusFilter', 'Status')}>
                  <button
                    type="button"
                    class={`manager-status-toggle ${displayEnvironment.enabled === false ? 'is-off' : 'is-on'}`}
                    aria-pressed={displayEnvironment.enabled !== false}
                    aria-label={text('FABRICATE.Admin.Manager.Environment.ToggleNamed', 'Toggle {name}').replace('{name}', environmentName(displayEnvironment))}
                    onclick={(event) => { event.stopPropagation(); onToggleEnvironmentEnabled(environment.id, displayEnvironment.enabled === false); }}
                    onkeydown={(event) => event.stopPropagation()}
                  >
                    <span class="manager-status-toggle-track" aria-hidden="true">
                      <span class="manager-status-toggle-knob"></span>
                    </span>
                    <span class="manager-status-toggle-label">
                      {displayEnvironment.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                    </span>
                  </button>
                </span>
                <span role="cell" class="manager-action-group manager-environment-actions manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}>
                  <span class="manager-environment-action-grid">
                    <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.EditNamed', 'Edit {name}').replace('{name}', environmentName(displayEnvironment))} title={text('FABRICATE.Admin.Manager.Environment.Edit', 'Edit environment')} onclick={() => onEditEnvironment(environment.id)}>
                      <i class="fas fa-edit" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.DuplicateNamed', 'Duplicate {name}').replace('{name}', environmentName(displayEnvironment))} title={text('FABRICATE.Admin.Manager.Environment.Duplicate', 'Duplicate environment')} onclick={() => onDuplicateEnvironment(environment.id)}>
                      <i class="fas fa-copy" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Environment.DeleteNamed', 'Delete {name}').replace('{name}', environmentName(displayEnvironment))} title={text('FABRICATE.Admin.Manager.Environment.Delete', 'Delete environment')} onclick={() => onDeleteEnvironment(environment.id)}>
                      <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                  </span>
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <Pagination
        totalCount={filteredEnvironments.length}
        {pageSize}
        {pageIndex}
        onPageChange={(next) => pageIndex = next}
        onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
      />
    </div>
  {:else if activeGatheringTab === 'tasks'}
    <GatheringTasksBrowserView
      tasks={selectedGatheringSystemConfig.tasks || []}
      environments={environmentList}
      {selectedTaskId}
      {selectedSystemId}
      {gatheringConfig}
      {managedItemOptions}
      labelledBy="manager-gathering-nav-tasks"
      onSelectTask={onSelectGatheringTask}
      onCreateTask={onCreateGatheringTask}
      onEditTask={onEditGatheringTask}
      onDuplicateTask={onDuplicateGatheringTask}
      onDeleteTask={onDeleteGatheringTask}
      onToggleTaskEnabled={onToggleGatheringTaskEnabled}
    />
  {:else if activeGatheringTab === 'encounters'}
    <div class="manager-gathering-encounters-shell" data-gathering-encounters-shell>
      <GatheringHazardsBrowserView
        hazards={selectedGatheringSystemConfig.hazards || []}
        environments={environmentList}
        {selectedHazardId}
        {selectedSystemId}
        {gatheringConfig}
        labelledBy="manager-gathering-nav-encounters"
        onSelectHazard={onSelectGatheringHazard}
        onCreateHazard={onCreateGatheringHazard}
        onEditHazard={onEditGatheringHazard}
        onDuplicateHazard={onDuplicateGatheringHazard}
        onDeleteHazard={onDeleteGatheringHazard}
        onToggleHazardEnabled={onToggleGatheringHazardEnabled}
      />
    </div>
  {:else if activeGatheringTab === 'travel'}
    <div class="manager-gathering-panel manager-travel-view" data-manager-travel-view>
      <GatheringTravelTabs activeTab={activeTravelTab} onSelect={onSelectTravelTab} />

      {#if activeTravelTab === 'parties'}
        <div
          class="manager-travel-panel"
          id="travel-panel-parties"
          role="tabpanel"
          aria-labelledby="travel-tab-parties"
          data-travel-panel="parties"
        >
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Tabs.PartiesPlaceholder', 'Party management will live here.')}</p>
        </div>
      {:else if activeTravelTab === 'regions'}
        <div
          class="manager-travel-panel"
          id="travel-panel-regions"
          role="tabpanel"
          aria-labelledby="travel-tab-regions"
          data-travel-panel="regions"
        >
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Tabs.RegionsPlaceholder', 'Region management will live here.')}</p>
        </div>
      {:else if activeTravelTab === 'map'}
        <div
          class="manager-travel-panel"
          id="travel-panel-map"
          role="tabpanel"
          aria-labelledby="travel-tab-map"
          data-travel-panel="map"
        >
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Tabs.MapLinksPlaceholder', 'Scene Region links will live here.')}</p>
        </div>
      {/if}
    </div>
  {:else if activeGatheringTab === 'settings'}
    <div
      class="manager-gathering-panel manager-gathering-settings"
      id="manager-gathering-panel-settings"
      role="tabpanel"
      aria-labelledby="manager-gathering-nav-settings"
    >
      <GatheringEconomyView {services} systemId={selectedSystemId} />

      <section class="manager-condition-panel manager-region-toggle-panel" data-gathering-region-toggle-panel aria-label={text('FABRICATE.Admin.Manager.Environment.RegionToggle.Title', 'Travel & Regions')}>
        <header class="manager-condition-panel-header">
          <span class="manager-condition-panel-title">
            <i class="fas fa-route" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Environment.RegionToggle.Title', 'Travel & Regions')}</span>
          </span>
          <button
            type="button"
            class={`manager-status-toggle ${regionsEnabled ? 'is-on' : 'is-off'}`}
            data-gathering-region-toggle
            aria-pressed={regionsEnabled}
            aria-label={regionsEnabled
              ? text('FABRICATE.Admin.Manager.Environment.RegionToggle.Disable', 'Disable Travel & Regions')
              : text('FABRICATE.Admin.Manager.Environment.RegionToggle.Enable', 'Enable Travel & Regions')}
            onclick={() => onSetGatheringRegionsEnabled?.(selectedSystemId, !regionsEnabled)}
          >
            <span class="manager-status-toggle-track" aria-hidden="true">
              <span class="manager-status-toggle-knob"></span>
            </span>
            <span class="manager-status-toggle-label">
              {regionsEnabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
            </span>
          </button>
        </header>
        <p class="manager-condition-panel-hint">{text('FABRICATE.Admin.Manager.Environment.RegionToggle.Hint', 'Enabling this reveals the Travel tab, where you build regions and place parties, and lets environments be assigned to regions. Leave it off if your game does not use travel or location-gated gathering.')}</p>
      </section>

      {#each [
        { kind: 'timeOfDay', icon: 'fas fa-clock', setting: timeOfDayCondition },
        { kind: 'weather', icon: 'fas fa-cloud-sun', setting: weatherCondition }
      ] as condition (condition.kind)}
        <section class={`manager-condition-panel ${condition.setting.enabled === false ? 'is-disabled' : ''}`} data-gathering-condition-panel={condition.kind} aria-label={conditionTitle(condition.kind)}>
          <header class="manager-condition-panel-header">
            <span class="manager-condition-panel-title">
              <i class={condition.icon} aria-hidden="true"></i>
              <span>{conditionTitle(condition.kind)}</span>
            </span>
            <button
              type="button"
              class={`manager-status-toggle ${condition.setting.enabled === false ? 'is-off' : 'is-on'}`}
              aria-pressed={condition.setting.enabled !== false}
              aria-label={condition.setting.enabled === false
                ? text('FABRICATE.Admin.Manager.Environment.Conditions.EnableMatching', 'Enable matching')
                : text('FABRICATE.Admin.Manager.Environment.Conditions.DisableMatching', 'Disable matching')}
              onclick={() => onToggleGatheringConditionEnabled?.(condition.kind, condition.setting.enabled === false, selectedSystemId)}
            >
              <span class="manager-status-toggle-track" aria-hidden="true">
                <span class="manager-status-toggle-knob"></span>
              </span>
              <span class="manager-status-toggle-label">
                {condition.setting.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
              </span>
            </button>
          </header>
          <p class="manager-condition-panel-hint">{conditionHint(condition.kind)}</p>

          <label class="manager-field manager-condition-current">
            <span>{conditionCurrentLabel(condition.kind)}</span>
            <select value={condition.setting.current} onchange={(event) => updateCurrentCondition(condition.kind, event.currentTarget.value)}>
              {#each conditionValues(condition.setting) as option (conditionId(option))}
                <option value={conditionId(option)}>{conditionLabel(option)}</option>
              {/each}
            </select>
          </label>

          <form class="manager-condition-add" onsubmit={(event) => submitConditionValue(event, condition.kind)}>
            <IconPicker
              value={conditionAddIcon(condition.kind)}
              iconOnly={true}
              buttonTitle={text('FABRICATE.Admin.Manager.Environment.Conditions.NewIcon', 'New value icon')}
              onChange={(icon) => setConditionAddIcon(condition.kind, icon)}
            />
            <label class="manager-field">
              <input
                value={conditionInputValue(condition.kind)}
                aria-label={conditionAddLabel(condition.kind)}
                placeholder={conditionInputPlaceholder(condition.kind)}
                oninput={(event) => setConditionInput(condition.kind, event.currentTarget.value)}
              />
            </label>
            <button type="submit" class="manager-button manager-add-button" aria-label={conditionAddLabel(condition.kind)} title={conditionAddLabel(condition.kind)}>
              <span>{text('FABRICATE.Admin.Manager.Environment.SettingsAdd', 'Add')}</span>
            </button>
          </form>

          <div class="manager-condition-pill-list" aria-label={text('FABRICATE.Admin.Manager.Environment.Conditions.Values', 'Condition values')}>
            {#each conditionValues(condition.setting) as option (conditionId(option))}
              {@const valueId = conditionId(option)}
              <span class="manager-condition-pill" data-gathering-condition-value={valueId}>
                <IconPicker
                  value={conditionIcon(option, condition.kind)}
                  iconOnly={true}
                  buttonTitle={text('FABRICATE.Admin.Manager.Environment.Conditions.EditIcon', 'Edit icon')}
                  onChange={(icon) => onUpdateGatheringConditionValue?.(condition.kind, valueId, { icon }, selectedSystemId)}
                />
                <input
                  class="manager-condition-label-input"
                  value={conditionLabel(option)}
                  aria-label={text('FABRICATE.Admin.Manager.Environment.Conditions.EditLabel', 'Edit label')}
                  onblur={(event) => onUpdateGatheringConditionValue?.(condition.kind, valueId, { label: event.currentTarget.value }, selectedSystemId)}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
                <button
                  type="button"
                  class="manager-condition-remove"
                  aria-label={text('FABRICATE.Admin.Manager.Environment.Conditions.RemoveValue', 'Remove {value}').replace('{value}', conditionLabel(option))}
                  title={text('FABRICATE.Admin.Manager.Environment.Conditions.RemoveValue', 'Remove {value}').replace('{value}', conditionLabel(option))}
                  disabled={condition.setting.enabled !== false && conditionValues(condition.setting).length <= 1}
                  onclick={() => onDeleteGatheringConditionValue?.(condition.kind, valueId, selectedSystemId)}
                >
                  <i class="fas fa-times" aria-hidden="true"></i>
                </button>
              </span>
            {/each}
          </div>
        </section>
      {/each}
      {#each [
        { kind: 'biomes', icon: 'fas fa-tree', vocabulary: biomeVocabulary }
      ] as vocabulary (vocabulary.kind)}
        <section class="manager-condition-panel manager-vocabulary-settings-panel is-biomes" data-gathering-vocabulary-panel={vocabulary.kind} aria-label={vocabularyTitle()}>
          <header class="manager-condition-panel-header">
            <span class="manager-condition-panel-title">
              <i class={vocabulary.icon} aria-hidden="true"></i>
              <span>{vocabularyTitle()}</span>
            </span>
          </header>
          <p class="manager-condition-panel-hint">{vocabularyHint()}</p>

          <form class="manager-condition-add manager-biome-add" onsubmit={(event) => submitVocabularyValue(event, vocabulary.kind)}>
            {#if vocabulary.kind === 'biomes'}
              <IconPicker
                value={biomeIconInput}
                iconOnly={true}
                buttonTitle={text('FABRICATE.Admin.Manager.Environment.Vocabularies.NewBiomeIcon', 'New biome icon')}
                onChange={(icon) => biomeIconInput = icon}
              />
              <ManagerColorPicker
                colorToken={biomeColorTokenInput}
                customColor={biomeCustomColorInput}
                buttonTitle={text('FABRICATE.Admin.Manager.Environment.Vocabularies.NewBiomeColor', 'New biome colour')}
                presetGridLabel={text('FABRICATE.Admin.Manager.Environment.Vocabularies.ColorPresets', 'Colour presets')}
                customHexLabel={text('FABRICATE.Admin.Manager.Environment.Vocabularies.CustomHex', 'Custom hex')}
                onChange={(updates) => {
                  biomeColorTokenInput = updates.colorToken;
                  biomeCustomColorInput = updates.customColor;
                }}
              />
            {/if}
            <label class="manager-field">
              <input
                value={vocabularyInputValue()}
                aria-label={vocabularyAddLabel()}
                placeholder={vocabularyPlaceholder()}
                oninput={(event) => setVocabularyInput(event.currentTarget.value)}
              />
            </label>
            <button type="submit" class="manager-button manager-add-button" aria-label={vocabularyAddLabel()} title={vocabularyAddLabel()}>
              <span>{text('FABRICATE.Admin.Manager.Environment.SettingsAdd', 'Add')}</span>
            </button>
          </form>

          <div class="manager-condition-pill-list" aria-label={text('FABRICATE.Admin.Manager.Environment.Vocabularies.Values', 'Vocabulary values')}>
            {#each vocabularyValues(vocabulary.vocabulary) as option (vocabularyId(option))}
              {@const valueId = vocabularyId(option)}
              <span class="manager-condition-pill manager-vocabulary-pill is-biome" data-gathering-vocabulary-value={valueId}>
                {#if vocabulary.kind === 'biomes'}
                  <span class="manager-biome-combined-picker">
                    <IconPicker
                      value={biomeIcon(option)}
                      iconOnly={true}
                      triggerClass="manager-biome-combined-trigger"
                      triggerStyle={biomeSwatchStyle(option)}
                      buttonTitle={text('FABRICATE.Admin.Manager.Environment.Vocabularies.EditBiomeIcon', 'Edit biome icon')}
                      onTriggerContextMenu={(event) => openBiomeColorPicker(event, valueId)}
                      onTriggerKeydown={(event) => handleBiomeIconKeydown(event, valueId)}
                      onChange={(icon) => onUpdateGatheringVocabularyValue?.(vocabulary.kind, valueId, { icon }, selectedSystemId)}
                    />
                    {#if openBiomeColorPickerId === valueId}
                      <ManagerColorPopover
                        colorToken={biomeColorToken(option)}
                        customColor={biomeCustomColor(option)}
                        presetGridLabel={text('FABRICATE.Admin.Manager.Environment.Vocabularies.ColorPresets', 'Colour presets')}
                        customHexLabel={text('FABRICATE.Admin.Manager.Environment.Vocabularies.CustomHex', 'Custom hex')}
                        onChange={(updates) => onUpdateGatheringVocabularyValue?.(vocabulary.kind, valueId, updates, selectedSystemId)}
                        onDismiss={closeBiomeColorPicker}
                        popoverStyle={biomeColorPopoverStyle}
                        portalTarget={() => getBiomeColorPopoverHost()}
                        registerPopoverNode={registerBiomeColorPopoverNode}
                      />
                    {/if}
                  </span>
                {/if}
                <input
                  class="manager-condition-label-input"
                  value={vocabularyLabel(option)}
                  aria-label={text('FABRICATE.Admin.Manager.Environment.Vocabularies.EditLabel', 'Edit label')}
                  onblur={(event) => onUpdateGatheringVocabularyValue?.(vocabulary.kind, valueId, { label: event.currentTarget.value }, selectedSystemId)}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      event.currentTarget.blur();
                    }
                  }}
                />
                <button
                  type="button"
                  class="manager-condition-remove"
                  aria-label={text('FABRICATE.Admin.Manager.Environment.Vocabularies.RemoveValue', 'Remove {value}').replace('{value}', vocabularyLabel(option))}
                  title={text('FABRICATE.Admin.Manager.Environment.Vocabularies.RemoveValue', 'Remove {value}').replace('{value}', vocabularyLabel(option))}
                  onclick={() => onDeleteGatheringVocabularyValue?.(vocabulary.kind, valueId, selectedSystemId)}
                >
                  <i class="fas fa-times" aria-hidden="true"></i>
                </button>
              </span>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {:else}
    {@const activeTab = gatheringTabs.find(tab => tab.id === activeGatheringTab)}
    <div
      class="manager-gathering-panel"
      id={`manager-gathering-panel-${activeGatheringTab}`}
      role="tabpanel"
      aria-labelledby={`manager-gathering-nav-${activeGatheringTab}`}
    >
      <div class="manager-empty manager-gathering-placeholder">
        <div>
          <i class={activeTab?.icon || 'fas fa-seedling'} aria-hidden="true"></i>
          <h3>{text(activeTab?.titleKey, activeTab?.titleFallback || '')}</h3>
          <p>{text(activeTab?.hintKey, activeTab?.hintFallback || '')}</p>
        </div>
      </div>
    </div>
  {/if}
</main>
