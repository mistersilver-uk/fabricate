<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

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
    sceneOptions = [],
    shouldUseEnvironmentDraftForDisplay = false,
    onSelectEnvironment = () => {},
    onEditEnvironment = () => {},
    onCreateEnvironment = () => {},
    onDuplicateEnvironment = () => {},
    onDeleteEnvironment = () => {},
    onMoveEnvironment = () => {},
    onToggleEnvironmentEnabled = () => {}
  } = $props();

  let searchTerm = $state('');
  let statusFilter = $state('all');
  let selectionFilter = $state('all');
  let riskFilter = $state('all');
  let regionFilter = $state('all');
  let biomeFilter = $state('all');
  let lastSystemId = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);
  let activeGatheringTab = $state('environments');

  const gatheringTabs = [
    {
      id: 'environments',
      labelKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Environments',
      labelFallback: 'Environments',
      icon: 'fas fa-seedling'
    },
    {
      id: 'tasks',
      labelKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Tasks',
      labelFallback: 'Tasks',
      icon: 'fas fa-list-check',
      titleKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.TasksPlaceholderTitle',
      titleFallback: 'Gathering tasks',
      hintKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.TasksPlaceholderHint',
      hintFallback: 'Reusable gathering task management is planned for a later slice.'
    },
    {
      id: 'encounters',
      labelKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Encounters',
      labelFallback: 'Encounters',
      icon: 'fas fa-compass',
      titleKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.EncountersPlaceholderTitle',
      titleFallback: 'Gathering encounters',
      hintKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.EncountersPlaceholderHint',
      hintFallback: 'Encounter and hazard authoring is planned for a later slice.'
    },
    {
      id: 'settings',
      labelKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Settings',
      labelFallback: 'Settings',
      icon: 'fas fa-sliders',
      titleKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.SettingsPlaceholderTitle',
      titleFallback: 'Gathering settings',
      hintKey: 'FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.SettingsPlaceholderHint',
      hintFallback: 'Gathering-wide configuration is planned for a later slice.'
    }
  ];

  $effect(() => {
    if (selectedSystemId === lastSystemId) return;
    searchTerm = '';
    statusFilter = 'all';
    selectionFilter = 'all';
    riskFilter = 'all';
    regionFilter = 'all';
    biomeFilter = 'all';
    activeGatheringTab = 'environments';
    lastSystemId = selectedSystemId;
  });

  const environmentList = $derived(environments || []);
  const regionOptions = $derived(uniqueSorted(environmentList.map(environment => environment.region)));
  const biomeOptions = $derived(uniqueSorted(environmentList.map(environment => environment.biome)));
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
    const matchesRegion = regionFilter === 'all' || (environment.region || '') === regionFilter;
    const matchesBiome = biomeFilter === 'all' || (environment.biome || '') === biomeFilter;
    return matchesSearch && matchesStatus && matchesSelection && matchesRisk && matchesRegion && matchesBiome;
  }));
  const filtersActive = $derived(
    normalizedSearchTerm.length > 0
    || statusFilter !== 'all'
    || selectionFilter !== 'all'
    || riskFilter !== 'all'
    || regionFilter !== 'all'
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

  function linkedSceneForEnvironment(environment) {
    const sceneUuid = environment?.sceneUuid || '';
    if (!sceneUuid) return null;
    return (sceneOptions || []).find(scene => scene.uuid === sceneUuid) || null;
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

  function environmentSelectionModeLabel(environment) {
    return environment?.selectionMode === 'blind'
      ? text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')
      : text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted');
  }

  function environmentTaskCount(environment) {
    return Array.isArray(environment?.tasks) ? environment.tasks.length : 0;
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

  function clearFilters() {
    searchTerm = '';
    statusFilter = 'all';
    selectionFilter = 'all';
    riskFilter = 'all';
    regionFilter = 'all';
    biomeFilter = 'all';
  }

  function selectGatheringTab(tabId) {
    activeGatheringTab = tabId;
  }
</script>

<main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.Nav.Environments', 'Gathering')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{selectedSystemName || text('FABRICATE.Admin.ManagerV2.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.Environment.Library', 'Gathering environments')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.Environment.LibraryHint', 'Browse scene-linked gathering environments and open the existing editor for task authoring.')}</p>
    </div>
  </section>

  <div class="manager-v2-gathering-tabs" role="tablist" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.Label', 'Gathering sections')}>
    {#each gatheringTabs as tab (tab.id)}
      <button
        type="button"
        class={`manager-v2-gathering-tab ${activeGatheringTab === tab.id ? 'is-active' : ''}`}
        id={`manager-v2-gathering-tab-${tab.id}`}
        role="tab"
        aria-selected={activeGatheringTab === tab.id}
        aria-controls={`manager-v2-gathering-panel-${tab.id}`}
        onclick={() => selectGatheringTab(tab.id)}
      >
        <i class={tab.icon} aria-hidden="true"></i>
        <span>{text(tab.labelKey, tab.labelFallback)}</span>
      </button>
    {/each}
  </div>

  {#if activeGatheringTab === 'environments'}
    <div
      class="manager-v2-gathering-panel"
      id="manager-v2-gathering-panel-environments"
      role="tabpanel"
      aria-labelledby="manager-v2-gathering-tab-environments"
    >
      <section class="manager-v2-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Filters', 'Environment filters')}>
        <label class="manager-v2-search">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input
            type="search"
            bind:value={searchTerm}
            placeholder={text('FABRICATE.Admin.ManagerV2.Environment.SearchPlaceholder', 'Search environments...')}
            aria-label={text('FABRICATE.Admin.ManagerV2.Environment.SearchLabel', 'Search environments')}
          />
        </label>
        <label class="manager-v2-filter">
          <span>{text('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}</span>
          <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.StatusFilterLabel', 'Filter environments by status')}>
            <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.StatusAll', 'All environments')}</option>
            <option value="active">{text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}</option>
            <option value="disabled">{text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled')}</option>
            <option value="dirty">{text('FABRICATE.Admin.ManagerV2.Environment.Dirty', 'Unsaved')}</option>
            <option value="invalid">{text('FABRICATE.Admin.ManagerV2.Environment.Invalid', 'Invalid')}</option>
          </select>
        </label>
        <label class="manager-v2-filter">
          <span>{text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode')}</span>
          <select value={selectionFilter} onchange={(event) => selectionFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.SelectionFilterLabel', 'Filter environments by selection mode')}>
            <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.SelectionAll', 'All modes')}</option>
            <option value="targeted">{text('FABRICATE.Admin.Environments.SelectionTargeted', 'Targeted')}</option>
            <option value="blind">{text('FABRICATE.Admin.Environments.SelectionBlind', 'Blind')}</option>
          </select>
        </label>
        <label class="manager-v2-filter">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Risk', 'Risk')}</span>
          <select value={riskFilter} onchange={(event) => riskFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.RiskFilterLabel', 'Filter environments by risk')}>
            <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.RiskAll', 'All risks')}</option>
            <option value="safe">{text('FABRICATE.Admin.ManagerV2.Environment.RiskSafe', 'Safe')}</option>
            <option value="hazardous">{text('FABRICATE.Admin.ManagerV2.Environment.RiskHazardous', 'Hazardous')}</option>
            <option value="unsafe">{text('FABRICATE.Admin.ManagerV2.Environment.RiskUnsafe', 'Unsafe')}</option>
            <option value="extreme">{text('FABRICATE.Admin.ManagerV2.Environment.RiskExtreme', 'Extreme')}</option>
          </select>
        </label>
        <label class="manager-v2-filter">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Region', 'Region')}</span>
          <select value={regionFilter} onchange={(event) => regionFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.RegionFilterLabel', 'Filter environments by region')}>
            <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.RegionAll', 'All regions')}</option>
            {#each regionOptions as region (region)}
              <option value={region}>{region}</option>
            {/each}
          </select>
        </label>
        <label class="manager-v2-filter">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Biome', 'Biome')}</span>
          <select value={biomeFilter} onchange={(event) => biomeFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.BiomeFilterLabel', 'Filter environments by biome')}>
            <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.BiomeAll', 'All biomes')}</option>
            {#each biomeOptions as biome (biome)}
              <option value={biome}>{biome}</option>
            {/each}
          </select>
        </label>
        <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredEnvironments.length).replace('{total}', environmentList.length)}</span>
        {#if filtersActive}
          <button type="button" class="manager-v2-button manager-v2-clear-filters" data-clear-filters="environments" onclick={clearFilters}>
            <i class="fas fa-times" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.ClearFilters', 'Clear filters')}</span>
          </button>
        {/if}
      </section>

      <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Table', 'Environments table')}>
        {#if environmentsLoading}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Environments.Loading', 'Loading environments...')}</h3>
            </div>
          </div>
        {:else if environmentsError}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Environments.ErrorTitle', 'Could Not Load Environments')}</h3>
              <p>{environmentsError}</p>
            </div>
          </div>
        {:else if environmentList.length === 0}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-seedling" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Environment.EmptyTitle', 'Prepare gathering building blocks first')}</h3>
              <p>{text('FABRICATE.Admin.ManagerV2.Environment.EmptyHint', 'Define reusable tasks and hazards before creating environments, then attach those building blocks to each location players can gather from.')}</p>
              <div class="manager-v2-action-group">
                <button type="button" class="manager-v2-button is-primary" onclick={onCreateEnvironment}>
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Environment.Create', 'Create environment')}</span>
                </button>
                <button type="button" class="manager-v2-button" onclick={() => selectGatheringTab('tasks')}>
                  <i class="fas fa-list-check" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.OpenTasks', 'Review tasks')}</span>
                </button>
                <button type="button" class="manager-v2-button" onclick={() => selectGatheringTab('encounters')}>
                  <i class="fas fa-compass" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Environment.GatheringTabs.OpenHazards', 'Review hazards')}</span>
                </button>
              </div>
            </div>
          </div>
        {:else if filteredEnvironments.length === 0}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-search" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySearchTitle', 'No environments match these filters')}</h3>
              <p>{text('FABRICATE.Admin.ManagerV2.Environment.EmptySearchHint', 'Clear search and filters to show all environments in this system.')}</p>
              <button type="button" class="manager-v2-button" onclick={clearFilters}>{text('FABRICATE.Admin.ManagerV2.ClearSearch', 'Clear search')}</button>
            </div>
          </div>
        {:else}
          <div class="manager-v2-environments-table" role="table" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.TableShort', 'Environments')}>
            <div class="manager-v2-table-head manager-v2-environment-table-head" role="row">
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Column.Environment', 'Environment')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Environments.Tasks', 'Tasks')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
            </div>
            {#each paginatedEnvironments as environment (environment.id)}
              {@const displayEnvironment = environmentDisplay(environment)}
              <div class={`manager-v2-environment-row ${selectedEnvironmentId === environment.id ? 'is-selected' : ''}`} role="row" aria-selected={selectedEnvironmentId === environment.id} data-environment-id={environment.id}>
                <button type="button" class="manager-v2-environment-identity" onclick={() => onSelectEnvironment(environment.id)} role="cell">
                  <img class={`manager-v2-environment-thumb ${hasEnvironmentSceneImage(displayEnvironment) ? '' : 'is-fallback'}`} src={environmentImage(displayEnvironment)} alt="" />
                  <span class="manager-v2-system-copy">
                    <span class="manager-v2-system-name" title={environmentName(displayEnvironment)}>{environmentName(displayEnvironment)}</span>
                    {#if displayEnvironment.description}
                      <span class="manager-v2-system-description" title={displayEnvironment.description}>{displayEnvironment.description}</span>
                    {:else}
                      <span class="manager-v2-system-description">{text('FABRICATE.Admin.ManagerV2.NoDescription', 'No description')}</span>
                    {/if}
                    <span class="manager-v2-chip-row">
                      {#if environmentDirtyFor(environment)}
                        <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Environment.Dirty', 'Unsaved')}</span>
                      {/if}
                      {#if environmentInvalidFor(environment)}
                        <span class="manager-v2-chip is-danger">{text('FABRICATE.Admin.ManagerV2.Environment.Invalid', 'Invalid')}</span>
                      {/if}
                    </span>
                  </span>
                </button>
                <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Environments.SelectionMode', 'Selection mode')}>
                  <span class="manager-v2-chip">{environmentSelectionModeLabel(displayEnvironment)}</span>
                </span>
                <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Environments.Tasks', 'Tasks')}>
                  <strong class="manager-v2-environment-task-count">{environmentTaskCount(displayEnvironment)}</strong>
                </span>
                <span role="cell" class="manager-v2-labeled-cell manager-v2-status-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}>
                  <button
                    type="button"
                    class={`manager-v2-status-toggle ${displayEnvironment.enabled === false ? 'is-off' : 'is-on'}`}
                    aria-pressed={displayEnvironment.enabled !== false}
                    aria-label={text('FABRICATE.Admin.ManagerV2.Environment.ToggleNamed', 'Toggle {name}').replace('{name}', environmentName(displayEnvironment))}
                    onclick={(event) => { event.stopPropagation(); onToggleEnvironmentEnabled(environment.id, displayEnvironment.enabled === false); }}
                    onkeydown={(event) => event.stopPropagation()}
                  >
                    <span class="manager-v2-status-toggle-track" aria-hidden="true">
                      <span class="manager-v2-status-toggle-knob"></span>
                    </span>
                    <span class="manager-v2-status-toggle-label">
                      {displayEnvironment.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusOff', 'Off') : text('FABRICATE.Admin.ManagerV2.StatusOn', 'On')}
                    </span>
                  </button>
                </span>
                <span role="cell" class="manager-v2-action-group manager-v2-environment-actions manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
                  <span class="manager-v2-environment-action-grid">
                    <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.EditNamed', 'Edit {name}').replace('{name}', environmentName(displayEnvironment))} title={text('FABRICATE.Admin.ManagerV2.Environment.Edit', 'Edit environment')} onclick={() => onEditEnvironment(environment.id)}>
                      <i class="fas fa-edit" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.DuplicateNamed', 'Duplicate {name}').replace('{name}', environmentName(displayEnvironment))} title={text('FABRICATE.Admin.ManagerV2.Environment.Duplicate', 'Duplicate environment')} onclick={() => onDuplicateEnvironment(environment.id)}>
                      <i class="fas fa-copy" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.DeleteNamed', 'Delete {name}').replace('{name}', environmentName(displayEnvironment))} title={text('FABRICATE.Admin.ManagerV2.Environment.Delete', 'Delete environment')} onclick={() => onDeleteEnvironment(environment.id)}>
                      <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                  </span>
                  <span class="manager-v2-environment-reorder-stack">
                    <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.Environments.MoveUp', 'Move up')} title={text('FABRICATE.Admin.Environments.MoveUp', 'Move up')} disabled={!canMoveEnvironmentUp(environment.id)} onclick={() => onMoveEnvironment(environment.id, 'up')}>
                      <i class="fas fa-arrow-up" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.Environments.MoveDown', 'Move down')} title={text('FABRICATE.Admin.Environments.MoveDown', 'Move down')} disabled={!canMoveEnvironmentDown(environment.id)} onclick={() => onMoveEnvironment(environment.id, 'down')}>
                      <i class="fas fa-arrow-down" aria-hidden="true"></i>
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
  {:else}
    {@const activeTab = gatheringTabs.find(tab => tab.id === activeGatheringTab)}
    <div
      class="manager-v2-gathering-panel"
      id={`manager-v2-gathering-panel-${activeGatheringTab}`}
      role="tabpanel"
      aria-labelledby={`manager-v2-gathering-tab-${activeGatheringTab}`}
    >
      <div class="manager-v2-empty manager-v2-gathering-placeholder">
        <div>
          <i class={activeTab?.icon || 'fas fa-seedling'} aria-hidden="true"></i>
          <h3>{text(activeTab?.titleKey, activeTab?.titleFallback || '')}</h3>
          <p>{text(activeTab?.hintKey, activeTab?.hintFallback || '')}</p>
        </div>
      </div>
    </div>
  {/if}
</main>
