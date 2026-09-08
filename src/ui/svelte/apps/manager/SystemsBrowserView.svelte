<!-- Svelte 5 runes mode -->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import { buildSystemLabelMap, systemDisplayLabel } from '../../util/systemDisambiguation.js';
  import IconButton from '../../components/IconButton.svelte';
  import ActionMenu from '../../components/ActionMenu.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import {
    DEFAULT_BROWSER_PAGE_SIZE,
    createSystemsBrowserState,
  } from '../../../../utils/managerBrowserViewState.js';

  let {
    systems = [],
    selectedSystemId = '',
    onSelectSystem = () => {},
    onCreateSystem = () => {},
    onEditSystem = () => {},
    onExportSystem = () => {},
    onDeleteSystem = () => {},
    onToggleSystemEnabled = () => {},
    systemsLoading = false,
    // ── THE VIEW-STATE IS LIFTED (issue 1438) ────────────────────────────────────────────
    // Search, status, page and page size live on ONE object the manager root owns and binds
    // here, because opening a system switches `currentView` to `system-edit` and UNMOUNTS this
    // component: held locally, every control was reset by the trip out and back. When UNBOUND —
    // the isolated mounted tests — the local fallback below keeps each control reactive
    // in-component, exactly as the three shipped studios do.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createSystemsBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const searchTerm = $derived(String(ui.searchTerm || ''));
  const statusFilter = $derived(ui.statusFilter || 'all');
  const pageIndex = $derived(ui.pageIndex || 0);
  const pageSize = $derived(ui.pageSize || DEFAULT_BROWSER_PAGE_SIZE);

  // Same-named systems are indistinguishable in the rail; disambiguate colliding
  // display names with a short id suffix (issue 346). Built from the FULL list so a
  // collision is detected even when filtering/pagination hides the sibling.
  const systemLabels = $derived(buildSystemLabelMap(systems));

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredSystems = $derived(
    (systems || []).filter((system) => {
      const matchesSearch =
        !normalizedSearchTerm ||
        `${system.name || ''} ${system.description || ''}`
          .toLowerCase()
          .includes(normalizedSearchTerm);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && system.enabled !== false) ||
        (statusFilter === 'disabled' && system.enabled === false);
      return matchesSearch && matchesStatus;
    })
  );
  const filtersActive = $derived(normalizedSearchTerm.length > 0 || statusFilter !== 'all');
  const paginatedSystems = $derived(
    filteredSystems.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredSystems.length) {
      ui.pageIndex = 0;
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
      routedByIngredients: text(
        'FABRICATE.Admin.Manager.ResolutionRoutedByIngredients',
        'Routed by ingredients'
      ),
      routedByCheck: text('FABRICATE.Admin.Manager.ResolutionRoutedByCheck', 'Routed by check'),
      progressive: text('FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'),
      alchemy: text('FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy'),
    };
    return (
      labels[mode] || mode || text('FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple')
    );
  }

  function isSelectedSystem(system) {
    return system.selected === true || (!!selectedSystemId && system.id === selectedSystemId);
  }

  function selectRow(systemId) {
    if (!systemId) return;
    onSelectSystem(systemId);
  }

  function clearFilters() {
    ui.searchTerm = '';
    ui.statusFilter = 'all';
  }

  // The two commands that left the row's three-button cluster for the overflow menu. Edit stays
  // an `<IconButton>` because it is the row's primary act; Export and Delete are built as data so
  // the shared `<ActionMenu>` owns the trigger, the portaled panel and the keyboard contract.
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
        id: 'export',
        label: text('FABRICATE.Admin.Manager.ExportSystem', 'Export system'),
        icon: 'fas fa-file-export',
      },
      {
        id: 'delete',
        label: text('FABRICATE.Admin.Manager.DeleteSystem', 'Delete system'),
        icon: 'fas fa-trash',
        danger: true,
      },
    ];
  }

  function toggleEnabled(systemId, enabled, event) {
    event?.stopPropagation();
    onToggleSystemEnabled(systemId, enabled);
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.SystemsShort', 'Systems')}>
  <ManagerToolbar ariaLabel={text('FABRICATE.Admin.Manager.SystemFilters', 'System filters')}>
    <ManagerSearchField
      value={searchTerm}
      onInput={(next) => (ui.searchTerm = next)}
      placeholder={text(
        'FABRICATE.Admin.Manager.SearchPlaceholder',
        'Search by name or description'
      )}
      ariaLabel={text('FABRICATE.Admin.Manager.SearchLabel', 'Search systems')}
    />
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
      <select
        value={statusFilter}
        onchange={(event) => (ui.statusFilter = event.currentTarget.value)}
        aria-label={text('FABRICATE.Admin.Manager.StatusFilterLabel', 'Filter systems by status')}
      >
        <option value="all">{text('FABRICATE.Admin.Manager.StatusAll', 'All systems')}</option>
        <option value="active">{text('FABRICATE.Admin.Manager.StatusActive', 'Active')}</option>
        <option value="disabled"
          >{text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')}</option
        >
      </select>
    </label>
    <Chip
      >{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}')
        .replace('{shown}', filteredSystems.length)
        .replace('{total}', systems.length)}</Chip
    >
    {#if filtersActive}
      <ManagerButton
        class="manager-clear-filters"
        data-clear-filters="systems"
        onclick={clearFilters}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </ManagerButton>
    {/if}
  </ManagerToolbar>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.SystemsTable', 'Crafting systems table')}
  >
    {#if systemsLoading}
      <EmptyState
        icon="fas fa-spinner"
        title={text('FABRICATE.Admin.Manager.LoadingSystems', 'Loading crafting systems...')}
        hint={text(
          'FABRICATE.Admin.Manager.LoadingSystemsHint',
          'Fabricate is finishing startup before the system library is shown.'
        )}
        dataAttr="data-systems-loading"
      />
    {:else if (systems || []).length === 0}
      <EmptyState
        icon="fas fa-layer-group"
        title={text('FABRICATE.Admin.Manager.EmptyTitle', 'No crafting systems yet')}
        hint={text(
          'FABRICATE.Admin.Manager.EmptyHint',
          'Create a system to start organizing components and recipes.'
        )}
      >
        <ManagerButton role="primary" onclick={onCreateSystem}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.CreateSystem', 'Create system')}</span>
        </ManagerButton>
      </EmptyState>
    {:else if filteredSystems.length === 0}
      <EmptyState
        icon="fas fa-search"
        title={text('FABRICATE.Admin.Manager.EmptySearchTitle', 'No systems match this search')}
        hint={text(
          'FABRICATE.Admin.Manager.EmptySearchHint',
          'Clear the search to show all configured systems.'
        )}
      >
        <ManagerButton onclick={() => (ui.searchTerm = '')}
          >{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</ManagerButton
        >
      </EmptyState>
    {:else}
      <!--
        THE LIBRARY IS A LIST, NOT A TABLE (issue 1515). `role="table"` promises columns a screen
        reader can walk cell by cell, and this surface has never had them: the leading column is an
        identity block and the trailing one a control cluster, and at the stacked breakpoint the
        grid collapses to a single column entirely. So the container announces `role="list"`, each
        row announces `role="listitem"`, and the column strip is `aria-hidden` — it labels the
        VISUAL grid the rows share, and the rows carry their own labels through `data-label` once
        the strip is hidden. `RecipesBrowserView`'s `manager-recipe-table-head` is the same answer,
        already shipped.
      -->
      <div
        class="manager-systems-table"
        role="list"
        aria-label={text('FABRICATE.Admin.Manager.SystemsTableShort', 'Crafting systems')}
      >
        <div class="manager-table-head" aria-hidden="true">
          <span>{text('FABRICATE.Admin.Manager.Column.System', 'System')}</span>
          <span>{text('FABRICATE.Admin.Manager.Column.Resolution', 'Resolution')}</span>
          <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
          <span>{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedSystems as system (system.id)}
          <!-- SELECTION IS `aria-current`, AND THE SELECTING CONTROL IS A REAL `<button>`.
               `aria-selected` is not valid on a `listitem` outside a listbox, and the row itself
               is no longer a focus target: it was a handler-bearing `<div>` carrying `role="row"`
               and `tabindex="0"`, which put a whole row in the tab order announcing a table row
               that no longer exists. The identity button is what a keyboard reaches now, exactly
               as `RecipesBrowserView` and `EssenceRow` already do. It declares
               `data-keyboard-focus` because Foundry recognises a `<button>` only inside a
               `<form>` and this window renders none, so without it Space pauses the game and the
               arrows pan the canvas while the row has focus. -->
          <div
            class={`manager-system-row ${isSelectedSystem(system) ? 'is-selected' : ''}`}
            role="listitem"
            aria-current={isSelectedSystem(system) ? 'true' : undefined}
            data-system-id={system.id}
          >
            <button
              type="button"
              class="manager-system-identity"
              data-keyboard-focus="true"
              onclick={() => selectRow(system.id)}
            >
              <span class="manager-system-icon" aria-hidden="true">
                <i class="fas fa-layer-group"></i>
              </span>
              <span class="manager-system-copy">
                <span class="manager-system-name" title={systemDisplayLabel(system, systemLabels)}
                  >{systemDisplayLabel(system, systemLabels)}</span
                >
                {#if system.description}
                  <span class="manager-system-description" title={system.description}
                    >{system.description}</span
                  >
                {:else}
                  <span class="manager-system-description"
                    >{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span
                  >
                {/if}
              </span>
            </button>
            <span
              class="manager-labeled-cell"
              data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Resolution', 'Resolution')}
            >
              <Chip>{resolutionModeLabel(system.resolutionMode)}</Chip>
            </span>
            <span
              class="manager-labeled-cell manager-status-cell"
              data-label={stackedLabel('FABRICATE.Admin.Manager.StatusFilter', 'Status')}
            >
              <StatusToggle
                on={system.enabled !== false}
                label={system.enabled === false
                  ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
                  : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                ariaLabel={system.enabled === false
                  ? text('FABRICATE.Admin.Manager.EnableSystemNamed', 'Enable {name}').replace(
                      '{name}',
                      systemDisplayLabel(system, systemLabels)
                    )
                  : text('FABRICATE.Admin.Manager.DisableSystemNamed', 'Disable {name}').replace(
                      '{name}',
                      systemDisplayLabel(system, systemLabels)
                    )}
                onclick={(event) => toggleEnabled(system.id, system.enabled === false, event)}
                onkeydown={(event) => event.stopPropagation()}
              />
            </span>
            <span
              class="manager-action-group manager-labeled-cell"
              data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}
            >
              <IconButton
                ariaLabel={text('FABRICATE.Admin.Manager.EditNamed', 'Edit {name}').replace(
                  '{name}',
                  systemDisplayLabel(system, systemLabels)
                )}
                title={text('FABRICATE.Admin.Manager.EditSystem', 'Edit system')}
                onclick={(event) => {
                  event.stopPropagation();
                  onEditSystem(system.id);
                }}
              >
                <i class="fas fa-edit" aria-hidden="true"></i>
              </IconButton>
              <ActionMenu
                items={rowMenuItems()}
                triggerLabel={text('FABRICATE.Admin.Manager.SystemActions', 'System actions')}
                triggerTitle={text('FABRICATE.Admin.Manager.SystemActions', 'System actions')}
                onSelect={(action) => {
                  if (action === 'export') onExportSystem(system.id);
                  else onDeleteSystem(system.id);
                }}
              />
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
    onPageChange={(next) => (ui.pageIndex = next)}
    onPageSizeChange={(next) => {
      ui.pageSize = next;
      ui.pageIndex = 0;
    }}
  />
</main>
