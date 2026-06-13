<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    events = [],
    environments = [],
    selectedEventId = '',
    selectedSystemId = '',
    gatheringConfig = null,
    panelId = 'manager-gathering-panel-events',
    labelledBy = 'manager-gathering-nav-events',
    onSelectEvent = () => {},
    onCreateEvent = () => {},
    onEditEvent = () => {},
    onDuplicateEvent = () => {},
    onDeleteEvent = () => {},
    onToggleEventEnabled = () => {}
  } = $props();

  let searchTerm = $state('');
  let statusFilter = $state('all');
  let biomeFilter = $state('all');
  let dangerFilter = $state('all');
  let lastSystemId = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  const DANGER_LEVEL_ORDER = ['safe', 'unsafe', 'hazardous', 'dangerous', 'deadly', 'extreme'];

  function dangerLevelRank(tag) {
    const idx = DANGER_LEVEL_ORDER.indexOf(tag);
    return idx === -1 ? DANGER_LEVEL_ORDER.length : idx;
  }

  const eventList = $derived(Array.isArray(events) ? events : []);
  const systemConfig = $derived(gatheringConfig?.systems?.[selectedSystemId] || {});
  const weatherCondition = $derived(systemConfig.conditions?.weather || {});
  const timeCondition = $derived(systemConfig.conditions?.timeOfDay || {});
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const biomeOptions = $derived(uniqueSorted([
    ...eventList.flatMap(event => Array.isArray(event.biomes) ? event.biomes : []),
    ...vocabularyIds(systemConfig.vocabularies?.biomes?.values)
  ]));
  const dangerOptions = $derived((() => {
    const seen = new Set();
    const all = [
      ...DANGER_LEVEL_ORDER,
      ...eventList.flatMap(event => Array.isArray(event.dangerTags) ? event.dangerTags : [])
    ]
      .map(value => String(value || '').trim())
      .filter(value => value && !seen.has(value) && seen.add(value));
    return all.sort((a, b) => {
      const rankDelta = dangerLevelRank(a) - dangerLevelRank(b);
      return rankDelta !== 0 ? rankDelta : a.localeCompare(b);
    });
  })());
  const filteredEvents = $derived(eventList.filter(event => {
    const dangerTags = Array.isArray(event.dangerTags) ? event.dangerTags : [];
    const haystack = `${eventName(event)} ${event.description || ''} ${dangerTags.join(' ')}`.toLowerCase();
    const matchesSearch = !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && event.enabled !== false)
      || (statusFilter === 'disabled' && event.enabled === false);
    const eventBiomes = Array.isArray(event.biomes) ? event.biomes : [];
    const matchesBiome = biomeFilter === 'all' || eventBiomes.includes(biomeFilter);
    const matchesDanger = dangerFilter === 'all' || dangerTags.includes(dangerFilter);
    return matchesSearch && matchesStatus && matchesBiome && matchesDanger;
  }));
  const filtersActive = $derived(
    normalizedSearchTerm.length > 0
    || statusFilter !== 'all'
    || biomeFilter !== 'all'
    || dangerFilter !== 'all'
  );
  const paginatedEvents = $derived(filteredEvents.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (selectedSystemId === lastSystemId) return;
    searchTerm = '';
    statusFilter = 'all';
    biomeFilter = 'all';
    dangerFilter = 'all';
    pageIndex = 0;
    lastSystemId = selectedSystemId;
  });

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredEvents.length) {
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
      case 'weather': return 'fas fa-cloud-sun';
      case 'timeOfDay': return 'fas fa-clock';
      case 'biome':
      default: return 'fas fa-tree';
    }
  }

  function vocabularyEntry(kind, id) {
    const values = systemConfig.vocabularies?.biomes?.values;
    const option = (Array.isArray(values) ? values : []).find(value => String(value?.id || value) === String(id || ''));
    const label = String(option?.label || option?.id || id || '').trim();
    const icon = String(option?.icon || '').trim() || defaultIcon(kind);
    const colorToken = typeof option === 'object' && option?.colorToken ? String(option.colorToken) : '';
    const customColor = typeof option === 'object' && option?.customColor ? String(option.customColor) : '';
    return { id: String(id || ''), label, icon, colorToken, customColor };
  }

  function biomeChipStyle(entry) {
    const hex = /^#[0-9a-fA-F]{6}$/.test(entry?.customColor || '') ? entry.customColor : '';
    const token = String(entry?.colorToken || 'sage').replace(/^--fab-tag-/, '');
    return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
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

  function dangerLabel(tag) {
    const key = `FABRICATE.Admin.Manager.Environment.Events.DangerTag.${tag}`;
    return text(key, tag.charAt(0).toUpperCase() + tag.slice(1));
  }

  function biomeChips(event) {
    const values = Array.isArray(event?.biomes) ? event.biomes : [];
    return values
      .map(id => vocabularyEntry('biome', id))
      .filter(entry => entry.label)
      .map(entry => ({ ...entry, kind: 'biome', key: `biome:${entry.id}`, pillClass: 'manager-availability-pill is-biome', style: biomeChipStyle(entry) }));
  }

  function timeChips(event) {
    const values = Array.isArray(event?.timeOfDay) ? event.timeOfDay : [];
    return values
      .map(id => conditionEntry('timeOfDay', id))
      .filter(entry => entry.label)
      .map(entry => ({ ...entry, key: `timeOfDay:${entry.id}`, pillClass: 'manager-availability-pill is-timeOfDay' }));
  }

  function weatherChips(event) {
    const values = Array.isArray(event?.weather) ? event.weather : [];
    return values
      .map(id => conditionEntry('weather', id))
      .filter(entry => entry.label)
      .map(entry => ({ ...entry, key: `weather:${entry.id}`, pillClass: 'manager-availability-pill is-weather' }));
  }

  function dangerChips(event) {
    const values = Array.isArray(event?.dangerTags) ? event.dangerTags : [];
    return values
      .filter(tag => typeof tag === 'string' && tag.trim())
      .slice()
      .sort((a, b) => {
        const rankDelta = dangerLevelRank(a) - dangerLevelRank(b);
        return rankDelta !== 0 ? rankDelta : String(a).localeCompare(String(b));
      })
      .map(tag => ({
        id: tag,
        key: `danger:${tag}`,
        kind: 'danger',
        label: dangerLabel(tag),
        icon: 'fa-solid fa-triangle-exclamation',
        pillClass: `manager-danger-tag-pill is-${tag}`
      }));
  }

  function rowChips(event) {
    return [
      ...biomeChips(event),
      ...timeChips(event),
      ...weatherChips(event),
      ...dangerChips(event)
    ];
  }

  function eventName(event) {
    return String(event?.name || text('FABRICATE.Admin.Manager.Environment.Events.UnnamedEvent', 'Unnamed event')).trim();
  }

  function eventImage(event) {
    return event?.img || 'icons/svg/mystery-man.svg';
  }

  function clearFilters() {
    searchTerm = '';
    statusFilter = 'all';
    biomeFilter = 'all';
    dangerFilter = 'all';
  }
</script>

<div
  class="manager-gathering-panel manager-gathering-panel-events"
  id={panelId}
  role="tabpanel"
  aria-labelledby={labelledBy}
  data-gathering-events-browser
>
  <section class="manager-toolbar manager-event-toolbar" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.Filters', 'Gathering event filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.Environment.Events.SearchPlaceholder', 'Search gathering events...')}
        aria-label={text('FABRICATE.Admin.Manager.Environment.Events.SearchLabel', 'Search gathering events')}
      />
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.Events.StatusAll', 'All events')}</option>
        <option value="active">{text('FABRICATE.Admin.Manager.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')}</option>
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
      <span>{text('FABRICATE.Admin.Manager.Environment.Events.DangerTag.Label', 'Danger')}</span>
      <select value={dangerFilter} onchange={(event) => dangerFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.Events.DangerAll', 'All danger tags')}</option>
        {#each dangerOptions as tag (tag)}
          <option value={tag}>{dangerLabel(tag)}</option>
        {/each}
      </select>
    </label>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredEvents.length).replace('{total}', eventList.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-button manager-clear-filters" data-clear-filters="gathering-events" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.Table', 'Gathering events table')}>
    {#if eventList.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-masks-theater" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Events.EmptyTitle', 'No gathering events yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Environment.Events.EmptyHint', 'Create reusable events before attaching them to environments.')}</p>
          <button type="button" class="manager-button is-primary" onclick={() => onCreateEvent(selectedSystemId)}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Environment.Events.Create', 'Create gathering event')}</span>
          </button>
        </div>
      </div>
    {:else if filteredEvents.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Events.EmptySearchTitle', 'No events match these filters')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Environment.Events.EmptySearchHint', 'Clear search and filters to show all events in this system.')}</p>
          <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-gathering-events-table" role="table" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.TableShort', 'Gathering events')}>
        <div class="manager-table-head manager-gathering-event-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Events.Column.Event', 'Event')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Tasks.Tags', 'Tags')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedEvents as event (event.id)}
          <div class={`manager-gathering-event-row ${selectedEventId === event.id ? 'is-selected' : ''}`} role="row" aria-selected={selectedEventId === event.id} data-gathering-event-id={event.id}>
            <button type="button" class="manager-gathering-event-identity" onclick={() => onSelectEvent(event.id)} role="cell">
              <img class="manager-gathering-event-thumb" src={eventImage(event)} alt="" />
              <span class="manager-system-copy">
                <span class="manager-system-name" title={eventName(event)}>{eventName(event)}</span>
                {#if event.description}
                  <span class="manager-system-description" title={event.description}>{event.description}</span>
                {:else}
                  <span class="manager-system-description">{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span>
                {/if}
              </span>
            </button>
            <div class="manager-gathering-event-tags-cell" role="cell" data-gathering-event-tags>
              {#each rowChips(event) as chip (chip.key)}
                <span class={chip.pillClass} style={chip.style}>
                  {#if chip.icon}<i class={chip.icon} aria-hidden="true"></i>{/if}
                  <span>{chip.label}</span>
                </span>
              {/each}
            </div>
            <span role="cell" class="manager-labeled-cell manager-status-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.StatusFilter', 'Status')}>
              <button
                type="button"
                class={`manager-status-toggle ${event.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={event.enabled !== false}
                aria-label={text('FABRICATE.Admin.Manager.Environment.Events.ToggleNamed', 'Toggle {name}').replace('{name}', eventName(event))}
                onclick={(event) => { event.stopPropagation(); onToggleEventEnabled(selectedSystemId, event.id, event.enabled === false); }}
                onkeydown={(event) => event.stopPropagation()}
              >
                <span class="manager-status-toggle-track" aria-hidden="true">
                  <span class="manager-status-toggle-knob"></span>
                </span>
                <span class="manager-status-toggle-label">
                  {event.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                </span>
              </button>
            </span>
            <span role="cell" class="manager-action-group manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.EditNamed', 'Edit {name}').replace('{name}', eventName(event))} title={text('FABRICATE.Admin.Manager.Environment.Events.Edit', 'Edit event')} onclick={() => onEditEvent(event.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.DuplicateNamed', 'Duplicate {name}').replace('{name}', eventName(event))} title={text('FABRICATE.Admin.Manager.Environment.Events.Duplicate', 'Duplicate event')} onclick={() => onDuplicateEvent(selectedSystemId, event.id)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Environment.Events.DeleteNamed', 'Delete {name}').replace('{name}', eventName(event))} title={text('FABRICATE.Admin.Manager.Environment.Events.Delete', 'Delete event')} onclick={() => onDeleteEvent(selectedSystemId, event.id)}>
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredEvents.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</div>
