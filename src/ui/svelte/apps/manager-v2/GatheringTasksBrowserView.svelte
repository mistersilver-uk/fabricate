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
    panelId = 'manager-v2-gathering-panel-tasks',
    labelledBy = 'manager-v2-gathering-tab-tasks',
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
  const environmentList = $derived(Array.isArray(environments) ? environments : []);
  const systemConfig = $derived(gatheringConfig?.systems?.[selectedSystemId] || {});
  const weatherCondition = $derived(systemConfig.conditions?.weather || {});
  const timeCondition = $derived(systemConfig.conditions?.timeOfDay || {});
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const regionOptions = $derived(uniqueSorted([
    ...taskList.map(task => task.region),
    ...vocabularyIds(systemConfig.vocabularies?.regions?.values)
  ]));
  const biomeOptions = $derived(uniqueSorted([
    ...taskList.flatMap(task => Array.isArray(task.biomes) ? task.biomes : []),
    ...vocabularyIds(systemConfig.vocabularies?.biomes?.values)
  ]));
  const filteredTasks = $derived(taskList.filter(task => {
    const haystack = `${taskName(task)} ${task.description || ''} ${dropSummary(task)} ${dropReferenceText(task)}`.toLowerCase();
    const matchesSearch = !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && task.enabled !== false)
      || (statusFilter === 'disabled' && task.enabled === false);
    const matchesRegion = regionFilter === 'all' || (task.region || '') === regionFilter;
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

  function optionLabel(kind, id) {
    const options = kind === 'biome'
      ? systemConfig.vocabularies?.biomes?.values
      : systemConfig.vocabularies?.regions?.values;
    const option = (Array.isArray(options) ? options : []).find(value => String(value?.id || value) === String(id || ''));
    return String(option?.label || option?.id || id || '').trim();
  }

  function conditionLabel(kind, id) {
    const setting = kind === 'weather' ? weatherCondition : timeCondition;
    const option = (Array.isArray(setting?.values) ? setting.values : [])
      .find(value => String(value?.id || value) === String(id || ''));
    return String(option?.label || option?.id || id || '').trim();
  }

  function taskName(task) {
    return String(task?.name || text('FABRICATE.Admin.ManagerV2.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')).trim();
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

  function dropSummary(task) {
    const count = dropRows(task).length;
    if (count === 1) return text('FABRICATE.Admin.ManagerV2.Environment.Tasks.OneDrop', '1 drop');
    return text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropCount', '{count} drops').replace('{count}', count);
  }

  function dropReferenceText(task) {
    return dropRows(task)
      .map(row => row.name || itemLabel(row.componentId) || row.itemUuid)
      .filter(Boolean)
      .join(' ');
  }

  function availabilityLabels(task) {
    const timeValues = Array.isArray(task?.timeOfDay) ? task.timeOfDay : [];
    const weatherValues = Array.isArray(task?.weather) ? task.weather : [];
    const times = timeValues.length > 0
      ? timeValues.map(id => conditionLabel('timeOfDay', id)).filter(Boolean).join(', ')
      : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyTime', 'Any time');
    const weather = weatherValues.length > 0
      ? weatherValues.map(id => conditionLabel('weather', id)).filter(Boolean).join(', ')
      : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyWeather', 'Any weather');
    return `${times}, ${weather}`;
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

  function taskAllowedInEnvironment(task, environment) {
    const enabledIds = Array.isArray(environment?.enabledTaskIds) ? environment.enabledTaskIds.map(String) : [];
    const disabledIds = Array.isArray(environment?.disabledTaskIds) ? environment.disabledTaskIds.map(String) : [];
    if (disabledIds.includes(String(task.id))) return false;
    if (enabledIds.length > 0 && !enabledIds.includes(String(task.id))) return false;
    return true;
  }

  function activeEnvironmentCount(task) {
    if (!task || task.enabled === false) return 0;
    const taskBiomes = Array.isArray(task.biomes) ? task.biomes : [];
    const taskWeather = Array.isArray(task.weather) ? task.weather : [];
    const taskTime = Array.isArray(task.timeOfDay) ? task.timeOfDay : [];
    return environmentList.filter(environment => {
      if (environment?.enabled === false) return false;
      if (String(environment?.craftingSystemId || selectedSystemId) !== String(selectedSystemId || '')) return false;
      if (!taskAllowedInEnvironment(task, environment)) return false;
      if (task.region && task.region !== String(environment?.region || '')) return false;
      const environmentBiomes = Array.isArray(environment?.biomes)
        ? environment.biomes
        : (environment?.biome ? [environment.biome] : []);
      if (taskBiomes.length > 0 && !taskBiomes.some(biome => environmentBiomes.includes(biome))) return false;
      if (weatherCondition?.enabled !== false && taskWeather.length > 0 && !taskWeather.includes(weatherCondition?.current)) return false;
      if (timeCondition?.enabled !== false && taskTime.length > 0 && !taskTime.includes(timeCondition?.current)) return false;
      return true;
    }).length;
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
  class="manager-v2-gathering-panel manager-v2-gathering-panel-tasks"
  id={panelId}
  role="tabpanel"
  aria-labelledby={labelledBy}
  data-gathering-tasks-browser
>
  <section class="manager-v2-toolbar manager-v2-task-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Filters', 'Gathering task filters')}>
    <label class="manager-v2-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchPlaceholder', 'Search gathering tasks...')}
        aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchLabel', 'Search gathering tasks')}
      />
    </label>
    <label class="manager-v2-filter">
      <span>{text('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.StatusAll', 'All gathering tasks')}</option>
        <option value="active">{text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled')}</option>
      </select>
    </label>
    <label class="manager-v2-filter">
      <span>{text('FABRICATE.Admin.ManagerV2.Environment.Region', 'Region')}</span>
      <select value={regionFilter} onchange={(event) => regionFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.RegionAll', 'All regions')}</option>
        {#each regionOptions as region (region)}
          <option value={region}>{optionLabel('region', region) || region}</option>
        {/each}
      </select>
    </label>
    <label class="manager-v2-filter">
      <span>{text('FABRICATE.Admin.ManagerV2.Environment.Biome', 'Biome')}</span>
      <select value={biomeFilter} onchange={(event) => biomeFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.BiomeAll', 'All biomes')}</option>
        {#each biomeOptions as biome (biome)}
          <option value={biome}>{optionLabel('biome', biome) || biome}</option>
        {/each}
      </select>
    </label>
    <label class="manager-v2-filter">
      <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Availability', 'Availability')}</span>
      <select value={availabilityFilter} onchange={(event) => availabilityFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AvailabilityAll', 'All availability')}</option>
        <option value="any">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AvailabilityAny', 'Any time/weather')}</option>
        <option value="current">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AvailabilityCurrent', 'Matches current')}</option>
        <option value="mismatch">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AvailabilityMismatch', 'Not current')}</option>
      </select>
    </label>
    <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredTasks.length).replace('{total}', taskList.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-v2-button manager-v2-clear-filters" data-clear-filters="gathering-tasks" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Table', 'Gathering tasks table')}>
    {#if taskList.length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-list-check" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EmptyTitle', 'No gathering tasks yet')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EmptyHint', 'Create gathering tasks before attaching them to environments.')}</p>
          <button type="button" class="manager-v2-button is-primary" onclick={() => onCreateTask(selectedSystemId)}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Create', 'Create gathering task')}</span>
          </button>
        </div>
      </div>
    {:else if filteredTasks.length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EmptySearchTitle', 'No gathering tasks match these filters')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EmptySearchHint', 'Clear search and filters to show all gathering tasks in this system.')}</p>
          <button type="button" class="manager-v2-button" onclick={clearFilters}>{text('FABRICATE.Admin.ManagerV2.ClearFilters', 'Clear filters')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-v2-gathering-tasks-table" role="table" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TableShort', 'Gathering tasks')}>
        <div class="manager-v2-table-head manager-v2-gathering-task-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Column.Task', 'Gathering task')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Region', 'Region')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Biome', 'Biome')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Drops', 'Drops')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Availability', 'Availability')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Environments', 'Environments')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedTasks as task (task.id)}
          <div class={`manager-v2-gathering-task-row ${selectedTaskId === task.id ? 'is-selected' : ''}`} role="row" aria-selected={selectedTaskId === task.id} data-gathering-task-id={task.id}>
            <button type="button" class="manager-v2-gathering-task-identity" onclick={() => onSelectTask(task.id)} role="cell">
              <img class="manager-v2-gathering-task-thumb" src={taskImage(task)} alt="" />
              <span class="manager-v2-system-copy">
                <span class="manager-v2-system-name" title={taskName(task)}>{taskName(task)}</span>
                {#if task.description}
                  <span class="manager-v2-system-description" title={task.description}>{task.description}</span>
                {:else}
                  <span class="manager-v2-system-description">{text('FABRICATE.Admin.ManagerV2.NoDescription', 'No description')}</span>
                {/if}
              </span>
            </button>
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Environment.Region', 'Region')}>
              <span class="manager-v2-chip">{optionLabel('region', task.region) || text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyRegion', 'Any region')}</span>
            </span>
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Environment.Biome', 'Biome')}>
              <span class="manager-v2-muted">{(Array.isArray(task.biomes) && task.biomes.length > 0) ? task.biomes.map(biome => optionLabel('biome', biome) || biome).join(', ') : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyBiome', 'Any biome')}</span>
            </span>
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Environment.Tasks.Drops', 'Drops')}>
              <strong>{dropSummary(task)}</strong>
            </span>
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Environment.Tasks.Availability', 'Availability')}>
              <span class="manager-v2-muted">{availabilityLabels(task)}</span>
            </span>
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Environment.Tasks.Environments', 'Environments')}>
              <strong>{activeEnvironmentCount(task)}</strong>
            </span>
            <span role="cell" class="manager-v2-labeled-cell manager-v2-status-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}>
              <button
                type="button"
                class={`manager-v2-status-toggle ${task.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={task.enabled !== false}
                aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ToggleNamed', 'Toggle {name}').replace('{name}', taskName(task))}
                onclick={(event) => { event.stopPropagation(); onToggleTaskEnabled(selectedSystemId, task.id, task.enabled === false); }}
                onkeydown={(event) => event.stopPropagation()}
              >
                <span class="manager-v2-status-toggle-track" aria-hidden="true">
                  <span class="manager-v2-status-toggle-knob"></span>
                </span>
                <span class="manager-v2-status-toggle-label">
                  {task.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusOff', 'Off') : text('FABRICATE.Admin.ManagerV2.StatusOn', 'On')}
                </span>
              </button>
            </span>
            <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EditNamed', 'Edit {name}').replace('{name}', taskName(task))} title={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Edit', 'Edit gathering task')} onclick={() => onEditTask(task.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DuplicateNamed', 'Duplicate {name}').replace('{name}', taskName(task))} title={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Duplicate', 'Duplicate gathering task')} onclick={() => onDuplicateTask(selectedSystemId, task.id)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DeleteNamed', 'Delete {name}').replace('{name}', taskName(task))} title={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Delete', 'Delete gathering task')} onclick={() => onDeleteTask(selectedSystemId, task.id)}>
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
