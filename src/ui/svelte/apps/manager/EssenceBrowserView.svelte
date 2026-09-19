<!--
  The GM essence library (issue 1036): toolbar, selection bar, rows or cards, pager, with the shell's
  own `.manager-inspector` column carrying `EssenceBrowserInspector` or, while a bulk selection
  exists, `EssenceBulkEditPanel`. It is the third studio to get this shape and it borrows rather than
  re-derives — `essenceBrowserModel.js`, the shared selection wiring in `./bulkSelection.svelte.js`,
  `BulkSelectionToolbar` and `Pagination`.

  Invariants:
  - The browser state is LIFTED: search, status, source, sort, view mode, page and the bulk selection
    live on ONE `$state` object the manager root owns and binds here. Unbound, the local fallback
    keeps every control reactive.
  - There is no `role="table"` head, so the rows carry no `role="row"` / `role="cell"` /
    `aria-selected` — a card row has no columns to label, and `aria-selected` is not valid on a plain
    `div`. Selection is the `.is-selected` ring plus the inspector heading.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import LibraryShelf from './library/LibraryShelf.svelte';
  import SegmentedControl from '../../components/SegmentedControl.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import EssenceRow from './essences/EssenceRow.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import {
    ESSENCE_SORT_KEYS,
    buildEssenceBrowserModel,
    createEssenceBrowserState,
    describeActiveEssenceFilters,
  } from '../../../model/essenceBrowserModel.js';
  import { createBulkSelection } from './bulkSelection.svelte.js';
  import { ESSENCE_VIEW_MODE_SEGMENTS } from './essences/essenceStudio.js';
  import { essenceShortValueName, essenceSystemState } from './scoped/essenceScoped.js';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';

  let {
    // The world-scope seam (issue 1374): three of the four keys `essenceScopeProps` supplies, so
    // the lookup never falls through to the bundle thunk. `systems` is deliberately NOT declared —
    // membership is resolved against `scope.entries`, which the narrowed roster cannot answer.
    scope = null,
    actions = null,
    systemId = '',
    essenceCards = [],
    showSourceUi = false,
    showPropertyMacroUi = false,
    selectedEssenceId = '',
    selectedSystemId = '',
    onSelectEssence = () => {},
    onEditEssence = () => {},
    onToggleEssenceEnabled = () => {},
    // Told AFTER the toolbar's Clear has emptied the selection (issue 1157). The clear is still
    // this browser's, but the FEEDBACK is not: emptying the selection unmounts the bulk panel and
    // the Clear that was pressed. Optional, so a standalone mount still clears as it did.
    onSelectionCleared = null,
    browserState = $bindable(null),
  } = $props();

  // THE MEMBERSHIP FILTER IS COMPONENT-LOCAL, AND THAT IS A DECISION: `All world essences` puts
  // rows on screen this system does not have, and a GM returning from an editor to a list of absent
  // entities would read it as data loss. It resets to `in` on every mount.
  let membershipFilter = $state('in');

  let ownBrowserState = $state(createEssenceBrowserState());
  // The root's lifted object when bound, else the local fallback. Both are `$state` proxies, so
  // nested writes are reactive and, when bound, propagate back to the root.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the SOURCE filter, the page and the bulk selection, whose subjects the
  // new system does not share; status, sort, view mode and page size are preferences and are not.
  // The sentinel is `ui.systemId`, PERSISTED on the lifted state rather than a component-local
  // `$state`, which re-initialises to '' on every mount and would misread a return as a switch.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.searchTerm = '';
    ui.sourceFilter = 'all';
    ui.pageIndex = 0;
    selection.reset();
    ui.systemId = selectedSystemId;
    // The membership axis names THIS system's records, so it cannot survive a system switch for
    // the same reason the source filter cannot.
    membershipFilter = 'in';
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

  // MEMBERSHIP, RESOLVED AGAINST THE WORLD CORPUS. Two options, not three: the shared list model
  // offers `all` / `in` / `out`, and `out` alone is a list a GM cannot act on from here beyond
  // adding, while `all` already contains it with the members for context.
  const activeSystemId = $derived(String(systemId || selectedSystemId || ''));
  const worldEntries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  // The filter renders only when the world corpus can actually answer it. An unreadable corpus
  // publishes `available: false`, and a control offering `All world essences` over one would
  // report every essence as absent from this system.
  const membershipAvailable = $derived(scope?.available === true && activeSystemId !== '');
  const memberIds = $derived(new Set((essenceCards || []).map((essence) => essence.id)));
  const systemRows = $derived(
    new Map(
      worldEntries.map((entry) => [
        entry.id,
        (entry.systems ?? []).find((row) => row.systemId === activeSystemId) ?? null,
      ])
    )
  );
  const membershipCounts = $derived({
    in: (essenceCards || []).length,
    all: Math.max(worldEntries.length, (essenceCards || []).length),
  });

  // BOTH COUNTS ARE ALWAYS ON SCREEN, which is why this axis is a segmented control rather than the
  // `<select>` it shipped as: the pair is the fact, not either half. The count rides the
  // primitive's own `count` slot, as the status segments beside it do.
  const membershipOptions = $derived([
    {
      value: 'in',
      labelKey: 'FABRICATE.Admin.Manager.Essence.MembershipIn',
      fallback: 'In this system',
      count: membershipCounts.in,
    },
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Essence.MembershipAll',
      fallback: 'All world essences',
      count: membershipCounts.all,
    },
  ]);

  /** The world essences this system has NO record for, in the card shape, so one list carries both.
      `enabled: true` is not a fiction: `addToSystem` seeds a membership record with it. */
  const absentCards = $derived(
    membershipFilter === 'all' && membershipAvailable
      ? worldEntries
          .filter((entry) => !memberIds.has(entry.id))
          .map((entry) => ({
            id: entry.id,
            name: entry.entity?.name || entry.id,
            description: entry.entity?.description || '',
            icon: entry.entity?.icon || 'fas fa-mortar-pestle',
            colorToken: entry.entity?.colorToken || '',
            enabled: true,
            componentUsageCount: 0,
            recipeUsageCount: 0,
            hasEffectTransfer: false,
            hasPropertyMacro: false,
            sourceState: 'none',
          }))
      : []
  );
  const listCards = $derived([...(essenceCards || []), ...absentCards]);

  /** One row's membership answer: `absent`, `disabled` or `enabled`. */
  function membershipStateOf(essence) {
    if (!memberIds.has(essence?.id)) return 'absent';
    return essenceSystemState({ member: true, enabled: essence?.enabled !== false });
  }

  /**
   * One row's summary line: what this essence DOES in this system, section by section. IT NAMES THE
   * VALUE, where the shipped line named the STATE and so read identically on every overriding row;
   * the override mark is a SUFFIX, not the subject. A macro is stored as a UUID with no resolved
   * name published, so that clause carries `essenceShortValueName`'s terminal segment.
   */
  function summaryClauses(essence) {
    if (!membershipAvailable || !memberIds.has(essence?.id)) return [];
    const inherited = systemRows.get(essence?.id)?.inherited ?? null;
    const clauses = [];
    if (showSourceUi) {
      clauses.push({
        section: 'effectSource',
        label: withOverride(effectClause(essence), inherited?.effectSource === false),
      });
    }
    if (showPropertyMacroUi) {
      clauses.push({
        section: 'macro',
        label: withOverride(macroClause(essence), inherited?.macro === false),
      });
    }
    return clauses;
  }

  /** The effect-source clause, in three states; A BROKEN LINK IS ITS OWN WORDING. An early-return
      chain rather than a nested ternary, which SonarCloud reports as S3358. */
  function effectClause(essence) {
    if (essence?.hasEffectTransfer !== true) {
      return text('FABRICATE.Admin.Manager.Essence.SummaryNoEffects', 'No effects');
    }
    const name =
      essenceShortValueName(essence?.sourceName) ||
      text('FABRICATE.Admin.Manager.Essence.SourceNoneShort', 'None');
    if (essence?.sourceState !== 'linked') {
      return format(
        'FABRICATE.Admin.Manager.Essence.SummaryEffectsBroken',
        'Effects from {name} (link broken)',
        { name }
      );
    }
    return format('FABRICATE.Admin.Manager.Essence.SummaryEffects', 'Effects from {name}', {
      name,
    });
  }

  /** The macro clause, in two states. */
  function macroClause(essence) {
    const name = essenceShortValueName(essence?.propertyMacroUuid);
    if (!name) return text('FABRICATE.Admin.Manager.Essence.SummaryNoMacro', 'No macro');
    return format('FABRICATE.Admin.Manager.Essence.SummaryMacro', 'Macro: {name}', { name });
  }

  /** Mark a clause as this system's own rather than the world's. */
  function withOverride(clause, overridden) {
    if (!overridden) return clause;
    return format('FABRICATE.Admin.Manager.Essence.SummaryOverride', '{clause} (override)', {
      clause,
    });
  }

  // The SEARCH is applied here rather than in the pure model, which says so in its own header:
  // whether a source name is searchable depends on `showSourceUi`, and that is a presentation
  // fact the model has no business knowing. The TERM still lives on the lifted state.
  const searchTerm = $derived(String(ui.searchTerm || ''));
  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const searchedEssences = $derived(
    normalizedSearch
      ? listCards.filter((essence) =>
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
      : listCards
  );

  // THE STATUS AND SOURCE AXES ARE STILL THREADED AND NOW ALWAYS `all`: the pure model keeps them
  // because they belong to a pipeline three studios share, and pinning them here is what makes the
  // removal a TOOLBAR change.
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

  // Bulk selection. `pageIds` is the set of RENDERED ids and `filteredIds` the whole filtered
  // set: the tri-state page box acts on what the GM can see, and `Select all {N} results` is the
  // only route to a row the page control cannot reach.
  const selection = createBulkSelection({
    state: () => ui,
    key: 'bulkSelectedEssenceIds',
    filteredIds: () => model.filteredIds,
    pageIds: () => model.pageIds,
    onCleared: () => onSelectionCleared?.(),
  });
  const bulkSelectedIds = $derived(selection.selectedIds);
  const selectionSummary = $derived(selection.summary);

  // A delete, a system refresh or a filter change must never leave a phantom id in the count or
  // in an Apply. The early return keeps the effect from subscribing to the corpus while nothing
  // is selected.
  $effect(() => {
    if (selection.selectedIds.size === 0) return;
    selection.prune((essenceCards || []).map((essence) => essence.id));
  });

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
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Essence.Title', 'Essences')}>
  <!-- `tabindex="-1"` makes this landmark a FOCUS TARGET without making it a tab stop (issue
       1157): emptying the bulk selection unmounts the panel and the Clear that was pressed. -->
  <ManagerToolbar
    class="manager-essence-toolbar"
    tabindex="-1"
    data-keyboard-focus="true"
    data-essence-toolbar=""
    ariaLabel={text('FABRICATE.Admin.Manager.Essence.Filters', 'Essence filters')}
  >
    <div class="manager-essence-filter-row">
      <ManagerSearchField
        value={searchTerm}
        onInput={(next) => {
          ui.searchTerm = next;
          ui.pageIndex = 0;
        }}
        placeholder={text(
          'FABRICATE.Admin.Manager.Essence.SearchPlaceholder',
          'Search essences...'
        )}
        ariaLabel={text('FABRICATE.Admin.Manager.Essence.SearchLabel', 'Search essences')}
      />
      <!-- NO STATUS SEGMENT AND NO SOURCE SELECT (issue 1372): the reference's bar carries ONE
           filter beside the search field. NEITHER LOSES A STATE A GM CANNOT REACH — every row
           states its enabled state as a pill and its source breakage in the summary line and the
           Effects chip, both of which the search box reads. The PRESENTATION toggle stays on row
           two: it is not a filter, it is the only route to the grid, which `### GM World Essence
           Screens` requirement 7 names. -->
      <!-- THE MEMBERSHIP AXIS, AS A TWO-SEGMENT CONTROL ON THE TOP ROW, because the comparison is
           the entire subject of the control and a `<select>` hides half of it. It renders only when
           the world corpus can answer it: over an unreadable one every essence reports as absent,
           which is false rather than empty. -->
      {#if membershipAvailable}
        <SegmentedControl
          options={membershipOptions}
          value={membershipFilter}
          groupName="manager-essence-membership-filter"
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Essence.MembershipFilterLabel',
            'Filter essences by membership of this system'
          )}
          dataAttr="data-essence-membership-filter"
          optionDataAttr="data-essence-membership-option"
          onChange={(value) => {
            membershipFilter = value;
            ui.pageIndex = 0;
          }}
        />
      {/if}
    </div>

    <!-- ROW TWO carries how the list is ARRANGED, plus the retained source filter and the count.
         The split is a WIDTH result rather than a taxonomy: this screen's extra axes plus search
         will not fit on one 745px line. -->
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
        <ManagerButton
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
        </ManagerButton>
      </div>

      <!-- ICON-ONLY (issue 1036): a list glyph and a grid glyph ARE the two layouts. The compact
           track is sized to sit with the 34px icon buttons rather than to the prototype's pixel
           count, and the label survives in the a11y tree. -->
      <SegmentedControl
        options={viewModeOptions}
        value={ui.viewMode}
        iconOnly
        groupName="manager-essence-view-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Essence.ViewModeLabel', 'Essence presentation')}
        dataAttr="data-essence-view-mode"
        optionDataAttr="data-essence-view-option"
        onChange={(value) => (ui.viewMode = value)}
      />

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
      <!-- THE BAR'S COUNT ANSWERS MEMBERSHIP, NOT PAGINATION, which `Pagination` already renders
           verbatim at the foot of the list. It falls back to that range when the world corpus
           cannot answer membership. -->
      <span class="manager-essence-count" data-essence-count>
        {#if membershipAvailable}
          {format(
            'FABRICATE.Admin.Manager.Essence.CountInSystem',
            '{shown} shown · {members} of {total} in this system',
            {
              shown: model.totalCount,
              members: membershipCounts.in,
              total: membershipCounts.all,
            }
          )}
        {:else}
          {format('FABRICATE.Admin.Manager.Essence.CountRange', '{start}–{end} of {total}', {
            start: model.rangeStart,
            end: model.rangeEnd,
            total: model.totalCount,
          })}
        {/if}
      </span>
    </div>

    <!-- Every prop is an OVERRIDE: the shared primitive's hooks default to the Component Studio's
         strings, so this studio must name its own or three browsers would answer to one set. -->
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
      onTogglePage={selection.setPageSelected}
      onSelectAllResults={selection.selectAllResults}
      onClear={selection.clear}
    />
  </ManagerToolbar>

  <!-- The paginated rows and columns are the shared `LibraryShelf`. This studio still supplies its
       own ENTRY, its own hook class and view attribute, and its own grid template — the parts that
       are genuinely per-studio. -->
  <LibraryShelf
    items={model.essences}
    viewMode={ui.viewMode}
    listClass="manager-essences-table"
    listAttrs={{ 'data-essence-view': ui.viewMode }}
    scrollLabel={text('FABRICATE.Admin.Manager.Essence.TableShort', 'Essences')}
    isEmpty={listCards.length === 0}
    totalCount={model.totalCount}
    pageSize={ui.pageSize}
    pageIndex={model.pageIndex}
    pageSizeOptions={[10, 25, 50]}
    onPageChange={(next) => (ui.pageIndex = next)}
    onPageSizeChange={(next) => {
      ui.pageSize = next;
      ui.pageIndex = 0;
    }}
  >
    {#snippet empty()}
      <EmptyState
        icon="fas fa-mortar-pestle"
        title={text('FABRICATE.Admin.Manager.Essence.EmptyTitle', 'No essences yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Essence.EmptyHint',
          'Create an essence definition to start assigning essence quantities to components.'
        )}
      />
    {/snippet}
    {#snippet emptyFiltered()}
      <EmptyState
        filtered
        hint={text(
          'FABRICATE.Admin.Manager.Essence.EmptySearchTitle',
          'No essences match these filters.'
        )}
      >
        <ManagerButton
          data-clear-filters="essences"
          disabled={!filtersActive}
          onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</ManagerButton
        >
      </EmptyState>
    {/snippet}
    {#snippet entry(essence)}
      <EssenceRow
        {essence}
        variant={ui.viewMode}
        selected={selectedEssenceId === essence.id}
        bulkSelected={bulkSelectedIds.has(essence.id)}
        effectTransferEnabled={showSourceUi}
        propertyMacrosEnabled={showPropertyMacroUi}
        membershipState={membershipAvailable ? membershipStateOf(essence) : ''}
        summaryClauses={summaryClauses(essence)}
        {text}
        {format}
        onSelect={(id) => onSelectEssence(id)}
        onEdit={(id) => onEditEssence(id)}
        onToggleEnabled={(id, enabled) => onToggleEssenceEnabled(id, enabled)}
        onToggleBulkSelected={(id) => selection.toggle(id)}
        onAddToSystem={(id) => actions?.addToSystem?.(id, activeSystemId)}
      />
    {/snippet}
  </LibraryShelf>
</main>

<style>
  /* The two list presentations, and the count. The TOOLBAR's own rhythm JOINS the recipe and
     component filter-bar rules in `styles/fabricate.css` instead, which is a correctness fix:
     `BulkSelectionToolbar` renders its row in ITS OWN template, so a rule scoped here never reached
     it and the selection row shipped with no row metrics at all. */

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

  /* `:global` because `LibraryShelf` renders the `<ul>` these style, so a scoped selector would be
     hashed here, match nothing and fail `lint:svelte:warnings`. They stay because the grid template
     is a per-studio content judgement. */
  :global(.manager-essences-table) {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The GRID presentation, `auto-fill` so the card width stays readable at every manager width.
     Cards STRETCH to the tallest in their row, and `EssenceRow.svelte`'s control cluster takes
     `margin-top: auto`, so the extra height lands above the footer and the footers line up. */
  :global(.manager-essences-table.is-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    align-items: stretch;
  }

  /* THE SEARCH FIELD SHRINKS BEFORE THE ROW WRAPS: the shipped `.manager-search` basis is sized for
     a bar with one or two controls, and at 1280px it pushed the membership control onto a fourth
     band. `flex: 1 1 220px` keeps a floor a query is legible in. */
  .manager-essence-filter-row :global(.manager-search) {
    flex: 1 1 220px;
    min-width: 0;
  }

  /* Search wraps onto its own line before the segmented controls start colliding. The row is
     already `flex-wrap`, so this only has to release the search field's basis. */
  @container fabricate-manager (max-width: 1000px) {
    .manager-essence-filter-row :global(.manager-search) {
      flex: 1 1 100%;
    }
  }
</style>
