<!-- Svelte 5 runes mode -->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { DEFAULT_GATHERING_TASK_IMG } from '../../../../gatheringImageDefaults.js';
  import { localize } from '../../util/foundryBridge.js';
  import { biomeChipStyle } from '../../util/gatheringFormat.js';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import ActionMenu from '../../components/ActionMenu.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import Select from '../../components/Select.svelte';
  import {
    DEFAULT_BROWSER_PAGE_SIZE,
    createGatheringTasksBrowserState,
  } from '../../../model/managerBrowserViewState.js';
  import { createBrowserListState, createBrowserPageWindow } from './browserListState.svelte.js';

  let {
    tasks = [],
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
    onToggleTaskEnabled = () => {},
    // ── THE VIEW-STATE IS LIFTED (issue 1438) ────────────────────────────────────────────
    // Search, the filter axes, the page AND the system-switch sentinel all live on one
    // object the manager root owns and binds here. Opening a record switches `currentView`
    // to the editor route, which unmounts this component; held locally every control was
    // reset by the trip out and back. The SENTINEL has to come too: a component-local one
    // re-initialises to '' on the remount, so the reset effect below would read the return
    // as a system switch and wipe the very state this object exists to preserve.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createGatheringTasksBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const searchTerm = $derived(String(ui.searchTerm || ''));
  const statusFilter = $derived(ui.statusFilter || 'all');
  const biomeFilter = $derived(ui.biomeFilter || 'all');
  const availabilityFilter = $derived(ui.availabilityFilter || 'all');
  const pageIndex = $derived(ui.pageIndex || 0);
  const pageSize = $derived(ui.pageSize || DEFAULT_BROWSER_PAGE_SIZE);

  const taskList = $derived(Array.isArray(tasks) ? tasks : []);
  const systemConfig = $derived(gatheringConfig?.systems?.[selectedSystemId] || {});
  const weatherCondition = $derived(systemConfig.conditions?.weather || {});
  const timeCondition = $derived(systemConfig.conditions?.timeOfDay || {});
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const biomeOptions = $derived(
    uniqueSorted([
      ...taskList.flatMap((task) => (Array.isArray(task.biomes) ? task.biomes : [])),
      ...vocabularyIds(systemConfig.vocabularies?.biomes?.values),
    ])
  );
  // The toolbar's three filter vocabularies, each label carried verbatim from the `<option>` text
  // it replaced (issue 1510).
  const statusSelectOptions = $derived([
    {
      value: 'all',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.StatusAll', 'All gathering tasks'),
    },
    { value: 'active', label: text('FABRICATE.Admin.Manager.StatusActive', 'Active') },
    { value: 'disabled', label: text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') },
  ]);
  const biomeSelectOptions = $derived([
    { value: 'all', label: text('FABRICATE.Admin.Manager.Environment.BiomeAll', 'All biomes') },
    ...biomeOptions.map((biome) => ({ value: biome, label: optionLabel('biome', biome) || biome })),
  ]);
  const availabilitySelectOptions = $derived([
    {
      value: 'all',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityAll', 'All availability'),
    },
    {
      value: 'any',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityAny', 'Any time/weather'),
    },
    {
      value: 'current',
      label: text(
        'FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityCurrent',
        'Matches current'
      ),
    },
    {
      value: 'mismatch',
      label: text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityMismatch', 'Not current'),
    },
  ]);
  const instanceId = $props.id();
  const filteredTasks = $derived(
    taskList.filter((task) => {
      const haystack =
        `${taskName(task)} ${task.description || ''} ${dropReferenceText(task)}`.toLowerCase();
      const matchesSearch = !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && task.enabled !== false) ||
        (statusFilter === 'disabled' && task.enabled === false);
      const taskBiomes = Array.isArray(task.biomes) ? task.biomes : [];
      const matchesBiome = biomeFilter === 'all' || taskBiomes.includes(biomeFilter);
      const availability = availabilityState(task);
      const matchesAvailability =
        availabilityFilter === 'all' ||
        availabilityFilter === availability ||
        (availabilityFilter === 'limited' && availability !== 'any');
      return matchesSearch && matchesStatus && matchesBiome && matchesAvailability;
    })
  );
  const filtersActive = $derived(
    normalizedSearchTerm.length > 0 ||
      statusFilter !== 'all' ||
      biomeFilter !== 'all' ||
      availabilityFilter !== 'all'
  );
  const page = createBrowserPageWindow({ state: () => ui, rows: () => filteredTasks });
  const paginatedTasks = $derived(page.pageRows);
  const list = createBrowserListState({
    state: () => ui,
    resetAxes: {
      searchTerm: '',
      statusFilter: 'all',
      biomeFilter: 'all',
      availabilityFilter: 'all',
      pageIndex: 0,
    },
  });
  $effect(() => {
    list.syncSystem(selectedSystemId);
  });
  $effect(() => {
    page.clampPage();
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function stackedLabel(key, fallback) {
    return `${text(key, fallback)}:`;
  }

  function uniqueSorted(values) {
    return Array.from(
      new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  function vocabularyIds(values = []) {
    return (Array.isArray(values) ? values : []).map((value) =>
      typeof value === 'object' ? value.id : value
    );
  }

  function defaultIcon(kind) {
    switch (kind) {
      case 'weather':
        return 'fas fa-cloud-sun';
      case 'timeOfDay':
        return 'fas fa-clock';
      case 'biome':
      default:
        return 'fas fa-tree';
    }
  }

  function vocabularyEntry(kind, id) {
    const values = systemConfig.vocabularies?.biomes?.values;
    const option = (Array.isArray(values) ? values : []).find(
      (value) => String(value?.id || value) === String(id || '')
    );
    const label = String(option?.label || option?.id || id || '').trim();
    const icon = String(option?.icon || '').trim() || defaultIcon(kind);
    const colorToken =
      typeof option === 'object' && option?.colorToken ? String(option.colorToken) : '';
    const customColor =
      typeof option === 'object' && option?.customColor ? String(option.customColor) : '';
    return { id: String(id || ''), label, icon, colorToken, customColor };
  }

  function conditionEntry(kind, id) {
    const setting = kind === 'weather' ? weatherCondition : timeCondition;
    const option = (Array.isArray(setting?.values) ? setting.values : []).find(
      (value) => String(value?.id || value) === String(id || '')
    );
    const label = String(option?.label || option?.id || id || '').trim();
    const icon = String(option?.icon || '').trim() || defaultIcon(kind);
    return { id: String(id || ''), label, icon, kind };
  }

  function optionLabel(kind, id) {
    return vocabularyEntry(kind, id).label;
  }

  // THE FACET'S OWN FACE, ROUTED ONCE HERE (issue 1515). A biome carries an AUTHORED colour,
  // so it takes the primitive's `tint` - "this chip IS that colour" - and the style string
  // states the exact value, because a biome may hold a hex and `tint` validates bare
  // `--fab-tag-*` keys only. Time of day and weather have no authored colour: their purple
  // and amber are the family's, and they are stated as TONES so a theme owns them.
  function biomeChips(task) {
    const values = Array.isArray(task?.biomes) ? task.biomes : [];
    return values
      .map((id) => vocabularyEntry('biome', id))
      .filter((entry) => entry.label)
      .map((entry) => ({
        ...entry,
        kind: 'biome',
        key: `biome:${entry.id}`,
        tint: entry.colorToken || 'sage',
        style: biomeChipStyle(entry),
      }));
  }

  function timeChips(task) {
    const values = Array.isArray(task?.timeOfDay) ? task.timeOfDay : [];
    return values
      .map((id) => conditionEntry('timeOfDay', id))
      .filter((entry) => entry.label)
      .map((entry) => ({ ...entry, key: `timeOfDay:${entry.id}`, tone: 'tag' }));
  }

  function weatherChips(task) {
    const values = Array.isArray(task?.weather) ? task.weather : [];
    return values
      .map((id) => conditionEntry('weather', id))
      .filter((entry) => entry.label)
      .map((entry) => ({ ...entry, key: `weather:${entry.id}`, tone: 'warning' }));
  }

  function rowChips(task) {
    return [...biomeChips(task), ...timeChips(task), ...weatherChips(task)];
  }

  function taskName(task) {
    return String(
      task?.name ||
        text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')
    ).trim();
  }

  // The two commands that left the row's three-button cluster for the overflow menu (issue 1515).
  // Edit stays an `<IconButton>` — it is the row's primary act — and Duplicate and Delete are
  // built as data so the shared `<ActionMenu>` owns the trigger, the portaled panel and the
  // keyboard contract that three loose buttons never had.
  // THE MENU ITEMS NAME THE COMMAND, NOT THE ROW (issue 1515). `ActionMenu`'s `label` is both the
  // visible text and the `menuitem`'s accessible name, and the shipped callers that predate this
  // conversion — `ComponentBrowserInspector` and `environment/CompositionList` — both spell it as a
  // generic verb ("Delete component", "Move up"). The row is identified by the trigger the menu was
  // opened from, so repeating its name in every item widens the panel to restate what the reader
  // just acted on. This is also why `Recipe.DuplicateNamed` and `Component.DeleteNamed` are already
  // dead in `tests/lang-known-orphans.js`: the earlier conversions retired the same `{name}` copy.
  function rowMenuItems() {
    return [
      {
        id: 'duplicate',
        label: text(
          'FABRICATE.Admin.Manager.Environment.Tasks.Duplicate',
          'Duplicate gathering task'
        ),
        icon: 'fas fa-copy',
      },
      {
        id: 'delete',
        label: text('FABRICATE.Admin.Manager.Environment.Tasks.Delete', 'Delete gathering task'),
        icon: 'fas fa-trash',
        danger: true,
      },
    ];
  }

  function taskImage(task) {
    return task?.img || DEFAULT_GATHERING_TASK_IMG;
  }

  function dropRows(task) {
    return Array.isArray(task?.dropRows) ? task.dropRows : [];
  }

  function itemLabel(id) {
    const item = (managedItemOptions || []).find(
      (option) => String(option.id || '') === String(id || '')
    );
    return item?.name || id || '';
  }

  function dropReferenceText(task) {
    return dropRows(task)
      .map((row) => row.name || itemLabel(row.componentId) || row.itemUuid)
      .filter(Boolean)
      .join(' ');
  }

  function availabilityState(task) {
    const hasWeather = Array.isArray(task?.weather) && task.weather.length > 0;
    const hasTime = Array.isArray(task?.timeOfDay) && task.timeOfDay.length > 0;
    if (!hasWeather && !hasTime) return 'any';
    const weatherMatches =
      weatherCondition?.enabled === false ||
      !hasWeather ||
      task.weather.includes(weatherCondition?.current);
    const timeMatches =
      timeCondition?.enabled === false ||
      !hasTime ||
      task.timeOfDay.includes(timeCondition?.current);
    return weatherMatches && timeMatches ? 'current' : 'mismatch';
  }

  function clearFilters() {
    ui.searchTerm = '';
    ui.statusFilter = 'all';
    ui.biomeFilter = 'all';
    ui.availabilityFilter = 'all';
  }
</script>

<div
  class="manager-gathering-panel manager-gathering-panel-tasks"
  id={panelId}
  role="tabpanel"
  aria-labelledby={labelledBy}
  data-gathering-tasks-browser
>
  <ManagerToolbar
    class="manager-task-toolbar"
    ariaLabel={text('FABRICATE.Admin.Manager.Environment.Tasks.Filters', 'Gathering task filters')}
  >
    <ManagerSearchField
      value={searchTerm}
      onInput={(next) => (ui.searchTerm = next)}
      placeholder={text(
        'FABRICATE.Admin.Manager.Environment.Tasks.SearchPlaceholder',
        'Search gathering tasks...'
      )}
      ariaLabel={text(
        'FABRICATE.Admin.Manager.Environment.Tasks.SearchLabel',
        'Search gathering tasks'
      )}
    />
    <!-- Spans, not labels: a label forwards a caption click into the trigger and re-opens its
         panel, so each caption names its trigger through an instance-scoped id (issue 1510). -->
    <span class="manager-filter">
      <span id={`${instanceId}-status-filter`}
        >{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span
      >
      <Select
        size="toolbar"
        value={statusFilter}
        options={statusSelectOptions}
        showTick={false}
        ariaLabelledBy={`${instanceId}-status-filter`}
        onChange={(next) => (ui.statusFilter = next)}
      />
    </span>
    <span class="manager-filter">
      <span id={`${instanceId}-biome-filter`}
        >{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span
      >
      <Select
        size="toolbar"
        value={biomeFilter}
        options={biomeSelectOptions}
        ariaLabelledBy={`${instanceId}-biome-filter`}
        onChange={(next) => (ui.biomeFilter = next)}
      />
    </span>
    <span class="manager-filter">
      <span id={`${instanceId}-availability-filter`}
        >{text('FABRICATE.Admin.Manager.Environment.Tasks.Availability', 'Availability')}</span
      >
      <Select
        size="toolbar"
        value={availabilityFilter}
        options={availabilitySelectOptions}
        ariaLabelledBy={`${instanceId}-availability-filter`}
        onChange={(next) => (ui.availabilityFilter = next)}
      />
    </span>
    <Chip
      >{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}')
        .replace('{shown}', filteredTasks.length)
        .replace('{total}', taskList.length)}</Chip
    >
    {#if filtersActive}
      <ManagerButton
        class="manager-clear-filters"
        data-clear-filters="gathering-tasks"
        onclick={clearFilters}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </ManagerButton>
    {/if}
  </ManagerToolbar>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.Table', 'Gathering tasks table')}
  >
    {#if taskList.length === 0}
      <EmptyState
        icon="fas fa-list-check"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.EmptyTitle',
          'No gathering tasks yet'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.EmptyHint',
          'Create gathering tasks before attaching them to environments.'
        )}
      >
        <ManagerButton role="primary" onclick={() => onCreateTask(selectedSystemId)}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span
            >{text(
              'FABRICATE.Admin.Manager.Environment.Tasks.Create',
              'Create gathering task'
            )}</span
          >
        </ManagerButton>
      </EmptyState>
    {:else if filteredTasks.length === 0}
      <EmptyState
        icon="fas fa-search"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.EmptySearchTitle',
          'No gathering tasks match these filters'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.EmptySearchHint',
          'Clear search and filters to show all gathering tasks in this system.'
        )}
      >
        <ManagerButton onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</ManagerButton
        >
      </EmptyState>
    {:else}
      <!-- A LIST, NOT A TABLE (issue 1515): see `SystemsBrowserView` for the whole reasoning. The
           column strip stays as the VISUAL header over the shared grid and is `aria-hidden`,
           because a `columnheader` outside a `table` names nothing. -->
      <div
        class="manager-gathering-tasks-table"
        role="list"
        aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.TableShort', 'Gathering tasks')}
      >
        <div class="manager-table-head manager-gathering-task-table-head" aria-hidden="true">
          <span
            >{text('FABRICATE.Admin.Manager.Environment.Tasks.Column.Task', 'Gathering task')}</span
          >
          <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Tags', 'Tags')}</span>
          <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
          <span>{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedTasks as task (task.id)}
          <div
            class={`manager-gathering-task-row ${selectedTaskId === task.id ? 'is-selected' : ''}`}
            role="listitem"
            aria-current={selectedTaskId === task.id ? 'true' : undefined}
            data-gathering-task-id={task.id}
          >
            <button
              type="button"
              class="manager-gathering-task-identity"
              onclick={() => onSelectTask(task.id)}
            >
              <img class="manager-gathering-task-thumb" src={taskImage(task)} alt="" />
              <span class="manager-system-copy">
                <span class="manager-system-name" title={taskName(task)}>{taskName(task)}</span>
                {#if task.description}
                  <span class="manager-system-description" title={task.description}
                    >{task.description}</span
                  >
                {:else}
                  <span class="manager-system-description"
                    >{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span
                  >
                {/if}
              </span>
            </button>
            <div class="manager-gathering-task-tags-cell" data-gathering-task-tags>
              {#each rowChips(task) as chip (chip.key)}
                <Chip
                  tone={chip.tone || ''}
                  tint={chip.tint || ''}
                  icon={chip.icon}
                  style={chip.style}
                  data-gathering-task-tag={chip.kind}>{chip.label}</Chip
                >
              {/each}
            </div>
            <span
              class="manager-labeled-cell manager-status-cell"
              data-label={stackedLabel('FABRICATE.Admin.Manager.StatusFilter', 'Status')}
            >
              <StatusToggle
                on={task.enabled !== false}
                label={task.enabled === false
                  ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
                  : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                ariaLabel={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.ToggleNamed',
                  'Toggle {name}'
                ).replace('{name}', taskName(task))}
                onclick={(event) => {
                  event.stopPropagation();
                  onToggleTaskEnabled(selectedSystemId, task.id, task.enabled === false);
                }}
                onkeydown={(event) => event.stopPropagation()}
              />
            </span>
            <span
              class="manager-action-group manager-labeled-cell"
              data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}
            >
              <IconButton
                ariaLabel={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.EditNamed',
                  'Edit {name}'
                ).replace('{name}', taskName(task))}
                title={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.Edit',
                  'Edit gathering task'
                )}
                onclick={() => onEditTask(task.id)}
              >
                <i class="fas fa-edit" aria-hidden="true"></i>
              </IconButton>
              <ActionMenu
                items={rowMenuItems()}
                triggerLabel={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.ActionsFor',
                  'Gathering task actions for {name}'
                ).replace('{name}', taskName(task))}
                triggerTitle={text(
                  'FABRICATE.Admin.Manager.Environment.Tasks.Actions',
                  'Gathering task actions'
                )}
                onSelect={(action) => {
                  if (action === 'duplicate') onDuplicateTask(selectedSystemId, task.id);
                  else if (action === 'delete') onDeleteTask(selectedSystemId, task.id);
                }}
              />
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
    onPageChange={(next) => (ui.pageIndex = next)}
    onPageSizeChange={(next) => {
      ui.pageSize = next;
      ui.pageIndex = 0;
    }}
  />
</div>
