<!-- Svelte 5 runes mode -->
<!--
  The GM essence library (issue 1036): toolbar -> selection bar -> rows or cards -> pager,
  with the shell's own `.manager-inspector` column carrying `EssenceBrowserInspector` or,
  while a bulk selection exists, `EssenceBulkEditPanel`.

  It is the THIRD studio to get this shape, and it borrows rather than re-derives: the pure
  filter/sort/paginate pipeline is `essenceBrowserModel.js`, the selection maths is the
  shared `bulkSelectionModel.js` leaf reached through `essenceBulkEditModel.js`, the
  multi-select row is the shared `BulkSelectionToolbar`, and the pager is `Pagination`.
  Nothing about a list of essences is new; only the STATUS axis and the list/grid toggle
  are, and both are `SegmentedControl`.

  ── THE BROWSER STATE IS LIFTED ───────────────────────────────────────────────────
  Search, status, source, sort, view mode, page and the bulk selection all live on ONE
  `$state` object the manager root owns and binds here. That is criterion 12: the shipped
  browser kept them component-locally, so opening an essence unmounted this view and coming
  back reset the page, the filters and the search the GM had left. When UNBOUND — the
  isolated mounted tests — the local fallback below keeps every control reactive
  in-component.

  ── ROW ARIA ──────────────────────────────────────────────────────────────────────
  There is no `role="table"` head any more, so the rows are a plain container and carry no
  `role="row"` / `role="cell"` / `aria-selected`. A card row has no columns to label, and
  `aria-selected` is not valid on a plain `div`. Selection is conveyed by the `.is-selected`
  ring plus the inspector heading, matching `RecipesBrowserView`.
-->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import EssenceRow from './essences/EssenceRow.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { managerColorTokenLabel } from '../../util/managerColorTokens.js';
  import {
    ESSENCE_SORT_KEYS,
    buildEssenceBrowserModel,
    createEssenceBrowserState,
    describeActiveEssenceFilters,
  } from '../../../../utils/essenceBrowserModel.js';
  import {
    describeEssenceSelection,
    pruneEssenceSelection,
    setEssenceSelection,
    toggleEssenceSelection,
  } from '../../../../utils/essenceBulkEditModel.js';
  import { ESSENCE_STATUS_SEGMENTS, ESSENCE_VIEW_MODE_SEGMENTS } from './essences/essenceStudio.js';

  let {
    essenceCards = [],
    showSourceUi = false,
    showPropertyMacroUi = false,
    selectedEssenceId = '',
    selectedSystemId = '',
    onSelectEssence = () => {},
    onEditEssence = () => {},
    onToggleEssenceEnabled = () => {},
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createEssenceBrowserState());
  // The active view-state: the root's lifted object when bound, else the local fallback.
  // Both are `$state` proxies, so nested writes (`ui.statusFilter = …`) are reactive AND,
  // when bound, propagate back to the root so the state persists across the editor
  // round-trip.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the SOURCE filter, the page and the bulk selection: a source
  // filter names link states of a vocabulary the new system does not share, and the
  // selected ids name essences it does not have. Status, sort, view mode and page size are
  // NOT reset — enabled means the same thing in every system, so they are preferences.
  //
  // The sentinel is `ui.systemId`, PERSISTED on the lifted state rather than a
  // component-local `$state`: a local one re-initialises to '' on every mount, so returning
  // from the editor would be misread as a system switch and would wipe the very state this
  // object exists to preserve.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.searchTerm = '';
    ui.sourceFilter = 'all';
    ui.pageIndex = 0;
    ui.bulkSelectedEssenceIds = new Set();
    ui.systemId = selectedSystemId;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  // The SEARCH is applied here rather than in the pure model, which says so in its own
  // header: whether a source name is searchable depends on `showSourceUi`, and that is a
  // presentation fact the model has no business knowing. The TERM still lives on the lifted
  // state so it survives the round-trip.
  const searchTerm = $derived(String(ui.searchTerm || ''));
  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const searchedEssences = $derived(
    normalizedSearch
      ? (essenceCards || []).filter((essence) =>
          [
            essence.name || '',
            essence.description || '',
            showSourceUi ? essence.sourceName || '' : '',
            essence.id || '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedSearch)
        )
      : essenceCards || []
  );

  const model = $derived(
    buildEssenceBrowserModel(searchedEssences, {
      status: ui.statusFilter,
      source: showSourceUi ? ui.sourceFilter : 'all',
      key: ui.sortKey,
      direction: ui.sortDirection,
      pageIndex: ui.pageIndex,
      pageSize: ui.pageSize,
    })
  );

  $effect(() => {
    if (model.pageIndex !== ui.pageIndex) ui.pageIndex = model.pageIndex;
  });

  const chips = $derived(
    describeActiveEssenceFilters({
      status: ui.statusFilter,
      source: showSourceUi ? ui.sourceFilter : 'all',
      search: searchTerm,
    })
  );
  const filtersActive = $derived(chips.length > 0);

  // ── Bulk selection ───────────────────────────────────────────────────────────────
  // `pageIds` is the set of RENDERED ids and `filteredIds` the whole filtered set: the
  // tri-state page box acts on what the GM can see, and `Select all {N} results` is the
  // only route to a row the page control cannot reach.
  const bulkSelectedIds = $derived(ui.bulkSelectedEssenceIds ?? new Set());
  const selectionSummary = $derived(
    describeEssenceSelection({
      pageIds: model.pageIds,
      filteredIds: model.filteredIds,
      selectedIds: bulkSelectedIds,
    })
  );

  // A delete, a system refresh or a filter change must never leave a phantom id in the
  // count or in an Apply. Only assigned when something actually dropped — the pruned set is
  // a subset, so equal sizes mean an identical set — so this cannot loop.
  $effect(() => {
    const current = ui.bulkSelectedEssenceIds ?? new Set();
    if (current.size === 0) return;
    const pruned = pruneEssenceSelection(
      current,
      (essenceCards || []).map((essence) => essence.id)
    );
    if (pruned.size !== current.size) ui.bulkSelectedEssenceIds = pruned;
  });

  // Every mutation assigns a NEW Set. The reactive unit is `ui.bulkSelectedEssenceIds`, not
  // the Set, so an in-place mutation compiles, runs, and silently stops the bound lifted
  // state propagating back to the manager root.
  function toggleBulkSelected(id) {
    ui.bulkSelectedEssenceIds = toggleEssenceSelection(bulkSelectedIds, id);
  }

  function setPageSelected(on) {
    ui.bulkSelectedEssenceIds = setEssenceSelection(bulkSelectedIds, model.pageIds, on);
  }

  function selectAllResults() {
    ui.bulkSelectedEssenceIds = setEssenceSelection(bulkSelectedIds, model.filteredIds, true);
  }

  function clearBulkSelection() {
    ui.bulkSelectedEssenceIds = new Set();
  }

  // The counts the model computes ARE rendered, on the control they describe. Each is how
  // many rows choosing that segment would show — the model widens the status axis and keeps
  // every other active filter, so `Disabled 0` means "nothing to see here" rather than
  // "nothing within the filter you already have".
  const statusOptions = $derived(
    ESSENCE_STATUS_SEGMENTS.map((segment) => ({
      value: segment.value,
      labelKey: segment.labelKey,
      fallback: segment.fallback,
      count: model.statusCounts?.[segment.value] ?? 0,
    }))
  );
  const viewModeOptions = $derived(
    ESSENCE_VIEW_MODE_SEGMENTS.map((segment) => ({
      value: segment.value,
      labelKey: segment.labelKey,
      fallback: segment.fallback,
      icon: segment.icon,
    }))
  );

  const SORT_LABELS = {
    name: ['FABRICATE.Admin.Manager.Essence.SortName', 'Name'],
    status: ['FABRICATE.Admin.Manager.Essence.SortStatus', 'Status'],
    components: ['FABRICATE.Admin.Manager.Essence.SortComponents', 'Components'],
    recipes: ['FABRICATE.Admin.Manager.Essence.SortRecipes', 'Recipes'],
  };

  const CHIP_LABELS = {
    status: ['FABRICATE.Admin.Manager.Essence.ChipStatus', 'Status: {value}'],
    source: ['FABRICATE.Admin.Manager.Essence.ChipSource', 'Source: {value}'],
    search: ['FABRICATE.Admin.Manager.Essence.ChipSearch', 'Search: {value}'],
  };

  function sortLabel(key) {
    const [labelKey, fallback] = SORT_LABELS[key] || SORT_LABELS.name;
    return text(labelKey, fallback);
  }

  function chipLabel(chip) {
    const [labelKey, fallback] = CHIP_LABELS[chip.id];
    return format(labelKey, fallback, { value: chip.value });
  }

  function clearChip(chipId) {
    if (chipId === 'status') ui.statusFilter = 'all';
    if (chipId === 'source') ui.sourceFilter = 'all';
    if (chipId === 'search') ui.searchTerm = '';
  }

  function clearFilters() {
    ui.searchTerm = '';
    ui.statusFilter = 'all';
    ui.sourceFilter = 'all';
    ui.pageIndex = 0;
  }

  function colourLabel(token) {
    return managerColorTokenLabel(token, localize);
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Essence.Title', 'Essences')}>
  <section
    class="manager-toolbar manager-essence-toolbar"
    aria-label={text('FABRICATE.Admin.Manager.Essence.Filters', 'Essence filters')}
  >
    <div class="manager-essence-filter-row">
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={searchTerm}
          oninput={(event) => {
            ui.searchTerm = event.currentTarget.value;
            ui.pageIndex = 0;
          }}
          placeholder={text(
            'FABRICATE.Admin.Manager.Essence.SearchPlaceholder',
            'Search essences...'
          )}
          aria-label={text('FABRICATE.Admin.Manager.Essence.SearchLabel', 'Search essences')}
        />
      </label>
      <SegmentedControl
        options={statusOptions}
        value={ui.statusFilter}
        groupName="manager-essence-status-filter"
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Essence.StatusFilterLabel',
          'Filter essences by status'
        )}
        dataAttr="data-essence-status-filter"
        optionDataAttr="data-essence-status-option"
        onChange={(value) => {
          ui.statusFilter = value;
          ui.pageIndex = 0;
        }}
      />
      <SegmentedControl
        options={viewModeOptions}
        value={ui.viewMode}
        groupName="manager-essence-view-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Essence.ViewModeLabel', 'Essence presentation')}
        dataAttr="data-essence-view-mode"
        optionDataAttr="data-essence-view-option"
        onChange={(value) => (ui.viewMode = value)}
      />
    </div>

    <!-- ROW TWO carries how the list is ARRANGED — the ordering controls and the retained
         source filter — plus the active-filter chips and the count. They were three separate
         rows, which made a toolbar the prototype draws as one bar four rows tall, and the
         chip row was usually EMPTY, so it rendered as a blank band holding nothing but a
         right-aligned count.

         The source filter moved DOWN here rather than staying on row one, so row one is
         exactly the three controls the prototype draws: search, the status segments, and the
         presentation toggle. It is a filter sitting among view controls, which is a register
         mix — but the alternative is a four-control row whose minimum widths sum to within a
         pixel of the space the 1280px capture has, and a row that wraps is the defect this
         pass exists to remove. The count keeps its `margin-left: auto`, so it still sits at
         the far end of the bar. -->
    <div class="manager-essence-filter-row is-secondary">
      <div class="manager-essence-filter-field">
        <span class="manager-essence-filter-label"
          >{text('FABRICATE.Admin.Manager.Essence.SortBy', 'Sort by')}</span
        >
        <select
          value={ui.sortKey}
          data-essence-sort
          onchange={(event) => (ui.sortKey = event.currentTarget.value)}
          aria-label={text('FABRICATE.Admin.Manager.Essence.SortLabel', 'Sort essences')}
        >
          {#each ESSENCE_SORT_KEYS as key (key)}
            <option value={key}>{sortLabel(key)}</option>
          {/each}
        </select>
        <button
          type="button"
          class="manager-button manager-essence-sort-direction"
          data-essence-sort-direction={ui.sortDirection}
          aria-label={text(
            'FABRICATE.Admin.Manager.Essence.ToggleSortDirection',
            'Toggle sort direction'
          )}
          onclick={() => (ui.sortDirection = ui.sortDirection === 'asc' ? 'desc' : 'asc')}
        >
          <i
            class={ui.sortDirection === 'asc'
              ? 'fas fa-arrow-down-short-wide'
              : 'fas fa-arrow-down-wide-short'}
            aria-hidden="true"
          ></i>
          <span
            >{ui.sortDirection === 'asc'
              ? text('FABRICATE.Admin.Manager.Essence.SortAscending', 'Asc')
              : text('FABRICATE.Admin.Manager.Essence.SortDescending', 'Desc')}</span
          >
        </button>
      </div>

      <!-- RETAINED from the shipped browser and reachable only with source UI on: a broken
           source link is otherwise unfindable, which is the only reason `needs-attention`
           exists. The `aria-label` is the select's accessible name. -->
      {#if showSourceUi}
        <select
          class="manager-essence-source-filter"
          data-essence-source-filter
          value={ui.sourceFilter}
          onchange={(event) => {
            ui.sourceFilter = event.currentTarget.value;
            ui.pageIndex = 0;
          }}
          aria-label={text(
            'FABRICATE.Admin.Manager.Essence.SourceFilterLabel',
            'Filter essences by source state'
          )}
        >
          <option value="all"
            >{text('FABRICATE.Admin.Manager.Essence.SourceAll', 'All sources')}</option
          >
          <option value="linked"
            >{text('FABRICATE.Admin.Manager.Essence.SourceLinkedFilter', 'Linked')}</option
          >
          <option value="none"
            >{text('FABRICATE.Admin.Manager.Essence.SourceNone', 'No source')}</option
          >
          <option value="needs-attention"
            >{text(
              'FABRICATE.Admin.Manager.Essence.SourceNeedsAttention',
              'Needs attention'
            )}</option
          >
        </select>
      {/if}

      {#each chips as chip (chip.id)}
        <Chip tone="info" class="manager-essence-filter-chip" data-essence-filter-chip={chip.id}>
          <span>{chipLabel(chip)}</span>
          <button
            type="button"
            class="manager-essence-chip-clear"
            aria-label={format(
              'FABRICATE.Admin.Manager.Essence.ClearChip',
              'Clear {filter} filter',
              {
                filter: chip.id,
              }
            )}
            onclick={() => clearChip(chip.id)}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </Chip>
      {/each}
      <span class="manager-essence-count" data-essence-count>
        {format('FABRICATE.Admin.Manager.Essence.CountRange', '{start}–{end} of {total}', {
          start: model.rangeStart,
          end: model.rangeEnd,
          total: model.totalCount,
        })}
      </span>
    </div>

    <!-- Every prop is an OVERRIDE: the shared primitive's hooks default to the Component
         Studio's strings, so this studio must name its own or three browsers would answer
         to one set of hooks. -->
    <BulkSelectionToolbar
      rowClass="manager-essence-filter-row"
      toolbarAttr="data-essence-selection-toolbar"
      pageBoxAttr="data-essence-select-all-page"
      countAttr="data-essence-selection-count"
      resultsAttr="data-essence-select-all-results"
      clearAttr="data-essence-clear-selection"
      pageSelectionState={selectionSummary.pageSelectionState}
      count={selectionSummary.count}
      showSelectAllResults={selectionSummary.showSelectAllResults}
      selectAllResultsCount={selectionSummary.selectAllResultsCount}
      onTogglePage={(on) => setPageSelected(on)}
      onSelectAllResults={selectAllResults}
      onClear={clearBulkSelection}
    />
  </section>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Essence.TableShort', 'Essences')}
  >
    {#if (essenceCards || []).length === 0}
      <EmptyState
        icon="fas fa-mortar-pestle"
        title={text('FABRICATE.Admin.Manager.Essence.EmptyTitle', 'No essences yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Essence.EmptyHint',
          'Create an essence definition to start assigning essence quantities to components.'
        )}
      />
    {:else if model.totalCount === 0}
      <EmptyState
        filtered
        hint={text(
          'FABRICATE.Admin.Manager.Essence.EmptySearchTitle',
          'No essences match these filters.'
        )}
      >
        <button
          type="button"
          class="manager-button"
          data-clear-filters="essences"
          disabled={!filtersActive}
          onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</button
        >
      </EmptyState>
    {:else}
      <!-- A card row has no columns, so this is a list, not a table: the `role="table"` head
           and the `role="row"` / `role="cell"` spans are gone with it. -->
      <ul
        class={`manager-essences-table ${ui.viewMode === 'grid' ? 'is-grid' : 'is-list'}`}
        role="list"
        data-essence-view={ui.viewMode}
      >
        {#each model.essences as essence (essence.id)}
          <EssenceRow
            {essence}
            variant={ui.viewMode}
            selected={selectedEssenceId === essence.id}
            bulkSelected={bulkSelectedIds.has(essence.id)}
            colourLabel={colourLabel(essence.colorToken)}
            effectTransferEnabled={showSourceUi}
            propertyMacrosEnabled={showPropertyMacroUi}
            {text}
            {format}
            onSelect={(id) => onSelectEssence(id)}
            onEdit={(id) => onEditEssence(id)}
            onToggleEnabled={(id, enabled) => onToggleEssenceEnabled(id, enabled)}
            onToggleBulkSelected={(id) => toggleBulkSelected(id)}
          />
        {/each}
      </ul>
    {/if}
  </section>

  <Pagination
    totalCount={model.totalCount}
    pageSize={ui.pageSize}
    pageIndex={model.pageIndex}
    pageSizeOptions={[10, 25, 50]}
    onPageChange={(next) => (ui.pageIndex = next)}
    onPageSizeChange={(next) => {
      ui.pageSize = next;
      ui.pageIndex = 0;
    }}
  />
</main>

<style>
  /* The two list presentations, and the count. The TOOLBAR's own rhythm is no longer here:
     `.manager-essence-toolbar`, `.manager-essence-filter-row` (and its `.is-secondary` /
     `.is-selection` variants), `.manager-essence-filter-field`, `.manager-essence-filter-label`
     and the toolbar's `select` treatment all JOIN the recipe and component filter-bar rules
     in `styles/fabricate.css`, which is the one bar all three studios render.

     That is a correctness fix, not tidying. `BulkSelectionToolbar` renders
     `<div class="{rowClass} is-selection">` in ITS OWN template, so a rule scoped to THIS
     component never reached it: the selection row shipped with no row metrics at all, which
     is why it floated centred with its `Clear` action stranded mid-row. A row class a shared
     primitive wears has to be authored where that primitive can see it. */

  .manager-essence-count {
    margin-left: auto;
    color: var(--fab-text-muted);
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .manager-essence-chip-clear {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  .manager-essences-table {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The GRID presentation. `auto-fill` rather than a fixed count so the card width stays
     inside the readable range at every manager width, which is what stops the narrow
     breakpoint needing a second template.

     Cards STRETCH to the tallest in their row (issue 1036 fidelity pass). `align-items: start`
     sized every card to its own copy, so a row of four ran four different heights — a ragged
     shelf where the prototype shows a level one. The card's own control cluster takes
     `margin-top: auto` in `EssenceRow.svelte`, so the extra height lands between the
     description and the footer and the footers line up across the row. */
  .manager-essences-table.is-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    align-items: stretch;
  }

  /* Search wraps onto its own line before the segmented controls start colliding. The row
     is already `flex-wrap`, so this only has to release the search field's basis. */
  @container fabricate-manager (max-width: 1000px) {
    .manager-essence-filter-row :global(.manager-search) {
      flex: 1 1 100%;
    }
  }
</style>
