<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    systems = [],
    selectedSystemId = '',
    onSelectSystem = () => {},
    onCreateSystem = () => {},
    onEditSystem = () => {},
    onExportSystem = () => {},
    onDeleteSystem = () => {},
    onToggleSystemEnabled = () => {},
    systemsLoading = false
  } = $props();

  let searchTerm = $state('');
  let statusFilter = $state('all');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredSystems = $derived((systems || []).filter(system => {
    const matchesSearch = !normalizedSearchTerm
      || `${system.name || ''} ${system.description || ''}`.toLowerCase().includes(normalizedSearchTerm);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && system.enabled !== false)
      || (statusFilter === 'disabled' && system.enabled === false);
    return matchesSearch && matchesStatus;
  }));
  const filtersActive = $derived(normalizedSearchTerm.length > 0 || statusFilter !== 'all');
  const paginatedSystems = $derived(filteredSystems.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredSystems.length) {
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

  function isSelectedSystem(system) {
    return system.selected === true || (!!selectedSystemId && system.id === selectedSystemId);
  }

  function selectRow(systemId) {
    if (!systemId) return;
    onSelectSystem(systemId);
  }

  function selectRowFromKeyboard(event, systemId) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectRow(systemId);
  }

  function clearFilters() {
    searchTerm = '';
    statusFilter = 'all';
  }

  function toggleEnabled(systemId, enabled, event) {
    event?.stopPropagation();
    onToggleSystemEnabled(systemId, enabled);
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.SystemsShort', 'Systems')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Browse', 'Browse')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.SystemLibrary', 'System library')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.SystemLibraryHint', 'Select a row to view counts and enabled features.')}</p>
    </div>
  </section>

  <section class="manager-toolbar" aria-label={text('FABRICATE.Admin.Manager.SystemFilters', 'System filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.SearchPlaceholder', 'Search by name or description')}
        aria-label={text('FABRICATE.Admin.Manager.SearchLabel', 'Search systems')}
      />
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.Manager.StatusFilterLabel', 'Filter systems by status')}>
        <option value="all">{text('FABRICATE.Admin.Manager.StatusAll', 'All systems')}</option>
        <option value="active">{text('FABRICATE.Admin.Manager.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')}</option>
      </select>
    </label>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredSystems.length).replace('{total}', systems.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-button manager-clear-filters" data-clear-filters="systems" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.SystemsTable', 'Crafting systems table')}>
    {#if systemsLoading}
      <div class="manager-empty" data-systems-loading>
        <div>
          <i class="fas fa-spinner" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}</h3>
          <p>{text('FABRICATE.Admin.Manager.LoadingSystemsHint', 'Fabricate is finishing startup before the system library is shown.')}</p>
        </div>
      </div>
    {:else if (systems || []).length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-layer-group" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.EmptyTitle', 'No crafting systems yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.EmptyHint', 'Create a system to start organizing components and recipes.')}</p>
          <button type="button" class="manager-button is-primary" onclick={onCreateSystem}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.CreateSystem', 'Create system')}</span>
          </button>
        </div>
      </div>
    {:else if filteredSystems.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.EmptySearchTitle', 'No systems match this search')}</h3>
          <p>{text('FABRICATE.Admin.Manager.EmptySearchHint', 'Clear the search to show all configured systems.')}</p>
          <button type="button" class="manager-button" onclick={() => searchTerm = ''}>{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-systems-table" role="table" aria-label={text('FABRICATE.Admin.Manager.SystemsTableShort', 'Crafting systems')}>
        <div class="manager-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.System', 'System')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Resolution', 'Resolution')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedSystems as system (system.id)}
          <div
            class={`manager-system-row ${isSelectedSystem(system) ? 'is-selected' : ''}`}
            role="row"
            tabindex="0"
            aria-selected={isSelectedSystem(system)}
            data-system-id={system.id}
            onclick={() => selectRow(system.id)}
            onkeydown={(event) => selectRowFromKeyboard(event, system.id)}
          >
            <span class="manager-system-identity" role="cell">
              <span class="manager-system-icon" aria-hidden="true">
                <i class="fas fa-layer-group"></i>
              </span>
              <span class="manager-system-copy">
                <span class="manager-system-name" title={system.name}>{system.name}</span>
                {#if system.description}
                  <span class="manager-system-description" title={system.description}>{system.description}</span>
                {:else}
                  <span class="manager-system-description">{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span>
                {/if}
              </span>
            </span>
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Resolution', 'Resolution')}>
              <span class="manager-chip">{resolutionModeLabel(system.resolutionMode)}</span>
            </span>
            <span role="cell" class="manager-labeled-cell manager-status-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.StatusFilter', 'Status')}>
              <button
                type="button"
                class={`manager-status-toggle ${system.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={system.enabled !== false}
                aria-label={system.enabled === false
                  ? text('FABRICATE.Admin.Manager.EnableSystemNamed', 'Enable {name}').replace('{name}', system.name)
                  : text('FABRICATE.Admin.Manager.DisableSystemNamed', 'Disable {name}').replace('{name}', system.name)}
                onclick={(event) => toggleEnabled(system.id, system.enabled === false, event)}
                onkeydown={(event) => event.stopPropagation()}
              >
                <span class="manager-status-toggle-track" aria-hidden="true">
                  <span class="manager-status-toggle-knob"></span>
                </span>
                <span class="manager-status-toggle-label">
                  {system.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                </span>
              </button>
            </span>
            <span role="cell" class="manager-action-group manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.EditNamed', 'Edit {name}').replace('{name}', system.name)} title={text('FABRICATE.Admin.Manager.EditSystem', 'Edit system')} onclick={(event) => { event.stopPropagation(); onEditSystem(system.id); }}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.ExportNamed', 'Export {name}').replace('{name}', system.name)} title={text('FABRICATE.Admin.Manager.ExportSystem', 'Export system')} onclick={(event) => { event.stopPropagation(); onExportSystem(system.id); }}>
                <i class="fas fa-file-export" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.DeleteNamed', 'Delete {name}').replace('{name}', system.name)} title={text('FABRICATE.Admin.Manager.DeleteSystem', 'Delete system')} onclick={(event) => { event.stopPropagation(); onDeleteSystem(system.id); }}>
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredSystems.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</main>
