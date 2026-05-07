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
    onToggleSystemEnabled = () => {}
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
      routed: text('FABRICATE.Admin.ManagerV2.ResolutionRouted', 'Routed'),
      mapped: text('FABRICATE.Admin.ManagerV2.ResolutionMappedLegacy', 'Legacy routed'),
      tiered: text('FABRICATE.Admin.ManagerV2.ResolutionTieredLegacy', 'Legacy routed by check'),
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

<main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.Nav.SystemsShort', 'Systems')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Browse', 'Browse')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.SystemLibrary', 'System library')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.SystemLibraryHint', 'Select a row to view counts and enabled features.')}</p>
    </div>
  </section>

  <section class="manager-v2-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.SystemFilters', 'System filters')}>
    <label class="manager-v2-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.ManagerV2.SearchPlaceholder', 'Search by name or description')}
        aria-label={text('FABRICATE.Admin.ManagerV2.SearchLabel', 'Search systems')}
      />
    </label>
    <label class="manager-v2-filter">
      <span>{text('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.StatusFilterLabel', 'Filter systems by status')}>
        <option value="all">{text('FABRICATE.Admin.ManagerV2.StatusAll', 'All systems')}</option>
        <option value="active">{text('FABRICATE.Admin.ManagerV2.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled')}</option>
      </select>
    </label>
    <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredSystems.length).replace('{total}', systems.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-v2-button manager-v2-clear-filters" data-clear-filters="systems" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.SystemsTable', 'Crafting systems table')}>
    {#if (systems || []).length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-layer-group" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.EmptyTitle', 'No crafting systems yet')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.EmptyHint', 'Create a system to start organizing components and recipes.')}</p>
          <button type="button" class="manager-v2-button is-primary" onclick={onCreateSystem}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.CreateSystem', 'Create system')}</span>
          </button>
        </div>
      </div>
    {:else if filteredSystems.length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.EmptySearchTitle', 'No systems match this search')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.EmptySearchHint', 'Clear the search to show all configured systems.')}</p>
          <button type="button" class="manager-v2-button" onclick={() => searchTerm = ''}>{text('FABRICATE.Admin.ManagerV2.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-v2-systems-table" role="table" aria-label={text('FABRICATE.Admin.ManagerV2.SystemsTableShort', 'Crafting systems')}>
        <div class="manager-v2-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.System', 'System')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Resolution', 'Resolution')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedSystems as system (system.id)}
          <div
            class={`manager-v2-system-row ${isSelectedSystem(system) ? 'is-selected' : ''}`}
            role="row"
            tabindex="0"
            aria-selected={isSelectedSystem(system)}
            data-system-id={system.id}
            onclick={() => selectRow(system.id)}
            onkeydown={(event) => selectRowFromKeyboard(event, system.id)}
          >
            <span class="manager-v2-system-identity" role="cell">
              <span class="manager-v2-system-icon" aria-hidden="true">
                <i class="fas fa-layer-group"></i>
              </span>
              <span class="manager-v2-system-copy">
                <span class="manager-v2-system-name" title={system.name}>{system.name}</span>
                {#if system.description}
                  <span class="manager-v2-system-description" title={system.description}>{system.description}</span>
                {:else}
                  <span class="manager-v2-system-description">{text('FABRICATE.Admin.ManagerV2.NoDescription', 'No description')}</span>
                {/if}
              </span>
            </span>
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Column.Resolution', 'Resolution')}>
              <span class="manager-v2-chip">{resolutionModeLabel(system.resolutionMode)}</span>
            </span>
            <span role="cell" class="manager-v2-labeled-cell manager-v2-status-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.StatusFilter', 'Status')}>
              <button
                type="button"
                class={`manager-v2-status-toggle ${system.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={system.enabled !== false}
                aria-label={system.enabled === false
                  ? text('FABRICATE.Admin.ManagerV2.EnableSystemNamed', 'Enable {name}').replace('{name}', system.name)
                  : text('FABRICATE.Admin.ManagerV2.DisableSystemNamed', 'Disable {name}').replace('{name}', system.name)}
                onclick={(event) => toggleEnabled(system.id, system.enabled === false, event)}
                onkeydown={(event) => event.stopPropagation()}
              >
                <span class="manager-v2-status-toggle-track" aria-hidden="true">
                  <span class="manager-v2-status-toggle-knob"></span>
                </span>
                <span class="manager-v2-status-toggle-label">
                  {system.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusOff', 'Off') : text('FABRICATE.Admin.ManagerV2.StatusOn', 'On')}
                </span>
              </button>
            </span>
            <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.EditNamed', 'Edit {name}').replace('{name}', system.name)} title={text('FABRICATE.Admin.ManagerV2.EditSystem', 'Edit system')} onclick={(event) => { event.stopPropagation(); onEditSystem(system.id); }}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.ExportNamed', 'Export {name}').replace('{name}', system.name)} title={text('FABRICATE.Admin.ManagerV2.ExportSystem', 'Export system')} onclick={(event) => { event.stopPropagation(); onExportSystem(system.id); }}>
                <i class="fas fa-file-export" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.DeleteNamed', 'Delete {name}').replace('{name}', system.name)} title={text('FABRICATE.Admin.ManagerV2.DeleteSystem', 'Delete system')} onclick={(event) => { event.stopPropagation(); onDeleteSystem(system.id); }}>
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
