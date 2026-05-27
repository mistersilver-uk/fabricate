<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    tasks = [],
    environments = [],
    selectedTaskId = '',
    selectedSystemId = '',
    gatheringConfig = null,
    managedItemOptions = [],
    panelId = 'manager-gathering-panel-tasks',
    labelledBy = 'manager-gathering-nav-tasks',
    onSelectTask = () => {},
    onCreateTask = () => {},
    onEditTask = () => {},
    onDuplicateTask = () => {},
    onDeleteTask = () => {},
    onToggleTaskEnabled = () => {}
  } = $props();

  let searchTerm = $state('');
  let statusFilter = $state('all');
  let regionFilter = $state('all');
  let biomeFilter = $state('all');
  let availabilityFilter = $state('all');
  let lastSystemId = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  const taskList = $derived(Array.isArray(tasks) ? tasks : []);
  const systemConfig = $derived(gatheringConfig?.systems?.[selectedSystemId] || {});
  const weatherCondition = $derived(systemConfig.conditions?.weather || {});
  const timeCondition = $derived(systemConfig.conditions?.timeOfDay || {});
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const regionOptions = $derived(uniqueSorted([
    ...taskList.flatMap(task => Array.isArray(task.regions)
      ? task.regions
      : (task.region ? [task.region] : [])),
    ...vocabularyIds(systemConfig.vocabularies?.regions?.values)
  ]));
  const biomeOptions = $derived(uniqueSorted([
    ...taskList.flatMap(task => Array.isArray(task.biomes) ? task.biomes : []),
    ...vocabularyIds(systemConfig.vocabularies?.biomes?.values)
  ]));
  const filteredTasks = $derived(taskList.filter(task => {
    const haystack = `${taskName(task)} ${task.description || ''} ${dropReferenceText(task)}`.toLowerCase();
    const matchesSearch = !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && task.enabled !== false)
      || (statusFilter === 'disabled' && task.enabled === false);
    const taskRegions = Array.isArray(task.regions)
      ? task.regions
      : (task.region ? [task.region] : []);
    const matchesRegion = regionFilter === 'all' || taskRegions.includes(regionFilter);
    const taskBiomes = Array.isArray(task.biomes) ? task.biomes : [];
    const matchesBiome = biomeFilter === 'all' || taskBiomes.includes(biomeFilter);
    const availability = availabilityState(task);
    const matchesAvailability = availabilityFilter === 'all'
      || availabilityFilter === availability
      || (availabilityFilter === 'limited' && availability !== 'any');
    return matchesSearch && matchesStatus && matchesRegion && matchesBiome && matchesAvailability;
  }));
  const filtersActive = $derived(
    normalizedSearchTerm.length > 0
    || statusFilter !== 'all'
    || regionFilter !== 'all'
    || biomeFilter !== 'all'
    || availabilityFilter !== 'all'
  );
  const paginatedTasks = $derived(filteredTasks.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (selectedSystemId === lastSystemId) return;
    searchTerm = '';
    statusFilter = 'all';
    regionFilter = 'all';
    biomeFilter = 'all';
    availabilityFilter = 'all';
    pageIndex = 0;
    lastSystemId = selectedSystemId;
  });

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredTasks.length) {
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

  function vocabularyIds(values = []) {
    return (Array.isArray(values) ? values : []).map(value => typeof value === 'object' ? value.id : value);
  }

  function defaultIcon(kind) {
    switch (kind) {
      case 'biome': return 'fas fa-tree';
      case 'weather': return 'fas fa-cloud-sun';
      case 'timeOfDay': return 'fas fa-clock';
      case 'region':
      default: return 'fas fa-map-location-dot';
    }
  }

  function vocabularyEntry(kind, id) {
    const values = kind === 'biome'
      ? systemConfig.vocabularies?.biomes?.values
      : systemConfig.vocabularies?.regions?.values;
    const option = (Array.isArray(values) ? values : []).find(value => String(value?.id || value) === String(id || ''));
    const label = String(option?.label || option?.id || id || '').trim();
    const icon = String(option?.icon || '').trim() || defaultIcon(kind);
    return { id: String(id || ''), label, icon };
  }

  function conditionEntry(kind, id) {
    const setting = kind === 'weather' ? weatherCondition : timeCondition;
    const option = (Array.isArray(setting?.values) ? setting.values : [])
      .find(value => String(value?.id || value) === String(id || ''));
    const label = String(option?.label || option?.id || id || '').trim();
    const icon = String(option?.icon || '').trim() || defaultIcon(kind);
    return { id: String(id || ''), label, icon, kind };
  }

  function optionLabel(kind, id) {
    return vocabularyEntry(kind, id).label;
  }

  function anyChip(kind, labelKey, fallback) {
    return {
      id: 'any',
      key: `${kind}:any`,
      kind,
      label: text(labelKey, fallback),
      icon: defaultIcon(kind),
      isAny: true
    };
  }

  function regionChips(task) {
    const values = Array.isArray(task?.regions)
      ? task.regions
      : (task?.region ? [task.region] : []);
    const entries = values
      .map(id => vocabularyEntry('region', id))
      .filter(entry => entry.label)
      .map(entry => ({ ...entry, kind: 'region', key: `region:${entry.id}`, isAny: false }));
    if (entries.length === 0) return [anyChip('region', 'FABRICATE.Admin.Manager.Environment.Tasks.AnyRegion', 'Any region')];
    return entries;
  }

  function biomeChips(task) {
    const values = Array.isArray(task?.biomes) ? task.biomes : [];
    const entries = values
      .map(id => vocabularyEntry('biome', id))
      .filter(entry => entry.label)
      .map(entry => ({ ...entry, kind: 'biome', key: `biome:${entry.id}`, isAny: false }));
    if (entries.length === 0) return [anyChip('biome', 'FABRICATE.Admin.Manager.Environment.Tasks.AnyBiome', 'Any biome')];
    return entries;
  }

  function timeChips(task) {
    const values = Array.isArray(task?.timeOfDay) ? task.timeOfDay : [];
    const entries = values
      .map(id => conditionEntry('timeOfDay', id))
      .filter(entry => entry.label)
      .map(entry => ({ ...entry, key: `timeOfDay:${entry.id}`, isAny: false }));
    if (entries.length === 0) return [anyChip('timeOfDay', 'FABRICATE.Admin.Manager.Environment.Tasks.AnyTime', 'Any time')];
    return entries;
  }

  function weatherChips(task) {
    const values = Array.isArray(task?.weather) ? task.weather : [];
    const entries = values
      .map(id => conditionEntry('weather', id))
      .filter(entry => entry.label)
      .map(entry => ({ ...entry, key: `weather:${entry.id}`, isAny: false }));
    if (entries.length === 0) return [anyChip('weather', 'FABRICATE.Admin.Manager.Environment.Tasks.AnyWeather', 'Any weather')];
    return entries;
  }

  function rowChips(task) {
    return [
      ...regionChips(task),
      ...biomeChips(task),
      ...timeChips(task),
      ...weatherChips(task)
    ];
  }

  function taskName(task) {
    return String(task?.name || text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')).trim();
  }

  function taskImage(task) {
    return task?.img || 'icons/svg/item-bag.svg';
  }

  function dropRows(task) {
    return Array.isArray(task?.dropRows) ? task.dropRows : [];
  }

  function itemLabel(id) {
    const item = (managedItemOptions || []).find(option => String(option.id || '') === String(id || ''));
    return item?.name || id || '';
  }

  function dropReferenceText(task) {
    return dropRows(task)
      .map(row => row.name || itemLabel(row.componentId) || row.itemUuid)
      .filter(Boolean)
      .join(' ');
  }

  function availabilityState(task) {
    const hasWeather = Array.isArray(task?.weather) && task.weather.length > 0;
    const hasTime = Array.isArray(task?.timeOfDay) && task.timeOfDay.length > 0;
    if (!hasWeather && !hasTime) return 'any';
    const weatherMatches = weatherCondition?.enabled === false
      || !hasWeather
      || task.weather.includes(weatherCondition?.current);
    const timeMatches = timeCondition?.enabled === false
      || !hasTime
      || task.timeOfDay.includes(timeCondition?.current);
    return weatherMatches && timeMatches ? 'current' : 'mismatch';
  }

  function clearFilters() {
    searchTerm = '';
    statusFilter = 'all';
    regionFilter = 'all';
    biomeFilter = 'all';
    availabilityFilter = 'all';
  }
</script>

<div
  class="manager-gathering-panel manager-gathering-panel-tasks"
  id={panelId}
  role="tabpanel"
  aria-labelledby={labelledBy}
  data-gathering-tasks-browser
>
  <section class="manager-toolbar manager-task-toolbar" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.Filters', 'Gathering task filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchPlaceholder', 'Search gathering tasks...')}
        aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchLabel', 'Search gathering tasks')}
      />
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.Tasks.StatusAll', 'All gathering tasks')}</option>
        <option value="active">{text('FABRICATE.Admin.Manager.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')}</option>
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Environment.Region', 'Region')}</span>
      <select value={regionFilter} onchange={(event) => regionFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.RegionAll', 'All regions')}</option>
        {#each regionOptions as region (region)}
          <option value={region}>{optionLabel('region', region) || region}</option>
        {/each}
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>
      <select value={biomeFilter} onchange={(event) => biomeFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.BiomeAll', 'All biomes')}</option>
        {#each biomeOptions as biome (biome)}
          <option value={biome}>{optionLabel('biome', biome) || biome}</option>
        {/each}
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Availability', 'Availability')}</span>
      <select value={availabilityFilter} onchange={(event) => availabilityFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityAll', 'All availability')}</option>
        <option value="any">{text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityAny', 'Any time/weather')}</option>
        <option value="current">{text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityCurrent', 'Matches current')}</option>
        <option value="mismatch">{text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityMismatch', 'Not current')}</option>
      </select>
    </label>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredTasks.length).replace('{total}', taskList.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-button manager-clear-filters" data-clear-filters="gathering-tasks" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.Table', 'Gathering tasks table')}>
    {#if taskList.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-list-check" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptyTitle', 'No gathering tasks yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptyHint', 'Create gathering tasks before attaching them to environments.')}</p>
          <button type="button" class="manager-button is-primary" onclick={() => onCreateTask(selectedSystemId)}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Create', 'Create gathering task')}</span>
          </button>
        </div>
      </div>
    {:else if filteredTasks.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptySearchTitle', 'No gathering tasks match these filters')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptySearchHint', 'Clear search and filters to show all gathering tasks in this system.')}</p>
          <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-gathering-tasks-table" role="table" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.TableShort', 'Gathering tasks')}>
        <div class="manager-table-head manager-gathering-task-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Tasks.Column.Task', 'Gathering task')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedTasks as task (task.id)}
          <div class={`manager-gathering-task-row ${selectedTaskId === task.id ? 'is-selected' : ''}`} role="row" aria-selected={selectedTaskId === task.id} data-gathering-task-id={task.id}>
            <div class="manager-gathering-task-info-cell" role="cell">
              <button type="button" class="manager-gathering-task-identity" onclick={() => onSelectTask(task.id)}>
                <img class="manager-gathering-task-thumb" src={taskImage(task)} alt="" />
                <span class="manager-system-copy">
                  <span class="manager-system-name" title={taskName(task)}>{taskName(task)}</span>
                  {#if task.description}
                    <span class="manager-system-description" title={task.description}>{task.description}</span>
                  {:else}
                    <span class="manager-system-description">{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span>
                  {/if}
                </span>
              </button>
              <div class="manager-gathering-task-tags-row" data-gathering-task-tags>
                {#each rowChips(task) as chip (chip.key)}
                  <span class={`manager-availability-pill is-${chip.kind}${chip.isAny ? ' is-any' : ''}`}>
                    <i class={chip.icon} aria-hidden="true"></i>
                    <span>{chip.label}</span>
                  </span>
                {/each}
              </div>
            </div>
            <span role="cell" class="manager-labeled-cell manager-status-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.StatusFilter', 'Status')}>
              <button
                type="button"
                class={`manager-status-toggle ${task.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={task.enabled !== false}
                aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.ToggleNamed', 'Toggle {name}').replace('{name}', taskName(task))}
                onclick={(event) => { event.stopPropagation(); onToggleTaskEnabled(selectedSystemId, task.id, task.enabled === false); }}
                onkeydown={(event) => event.stopPropagation()}
              >
                <span class="manager-status-toggle-track" aria-hidden="true">
                  <span class="manager-status-toggle-knob"></span>
                </span>
                <span class="manager-status-toggle-label">
                  {task.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                </span>
              </button>
            </span>
            <span role="cell" class="manager-action-group manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.EditNamed', 'Edit {name}').replace('{name}', taskName(task))} title={text('FABRICATE.Admin.Manager.Environment.Tasks.Edit', 'Edit gathering task')} onclick={() => onEditTask(task.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DuplicateNamed', 'Duplicate {name}').replace('{name}', taskName(task))} title={text('FABRICATE.Admin.Manager.Environment.Tasks.Duplicate', 'Duplicate gathering task')} onclick={() => onDuplicateTask(selectedSystemId, task.id)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DeleteNamed', 'Delete {name}').replace('{name}', taskName(task))} title={text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task')} onclick={() => onDeleteTask(selectedSystemId, task.id)}>
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredTasks.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</div>
