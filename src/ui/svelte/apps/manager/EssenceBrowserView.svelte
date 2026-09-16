<!-- Svelte 5 runes mode -->
<!--
  The GM essence library (issue 1036): toolbar, selection bar, rows or cards, pager, with the
  shell's own `.manager-inspector` column carrying `EssenceBrowserInspector` or, while a bulk
  selection exists, `EssenceBulkEditPanel`.

  It is the third studio to get this shape and it borrows rather than re-derives: the pure
  filter/sort/paginate pipeline is `essenceBrowserModel.js`, the selection maths is the shared
  `bulkSelectionModel.js` leaf reached through `essenceBulkEditModel.js`, the multi-select row is
  `BulkSelectionToolbar`, and the pager is `Pagination`.

  Invariants:
  - The browser state is LIFTED: search, status, source, sort, view mode, page and the bulk
    selection all live on ONE `$state` object the manager root owns and binds here, so opening an
    essence no longer resets them. Unbound, the local fallback keeps every control reactive.
  - There is no `role="table"` head, so the rows are a plain container and carry no `role="row"` /
    `role="cell"` / `aria-selected` — a card row has no columns to label, and `aria-selected` is
    not valid on a plain `div`. Selection is the `.is-selected` ring plus the inspector heading,
    matching `RecipesBrowserView`.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import LibraryShelf from './library/LibraryShelf.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import EssenceRow from './essences/EssenceRow.svelte';
  import { localize } from '../../util/foundryBridge.js';
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
  import { ESSENCE_VIEW_MODE_SEGMENTS } from './essences/essenceStudio.js';
  import { essenceShortValueName, essenceSystemState } from './scoped/essenceScoped.js';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';

  let {
    // The world-scope seam (issue 1374). `scope`, `actions` and `systemId` are three of the four
    // keys `essenceScopeProps` supplies, so declaring them is correct rather than hazardous: the
    // spread owns each name, and the lookup never falls through to the bundle thunk. `systems` is
    // deliberately NOT declared — this screen resolves membership against `scope.entries`, and
    // the narrowed `{id, name}` roster answers none of the three questions it asks.
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

  // THE MEMBERSHIP FILTER IS COMPONENT-LOCAL, AND THAT IS A DECISION. Every other axis on this
  // toolbar is lifted so it survives the editor round-trip; this one is not a preference, because
  // `All world essences` puts rows on screen that this system does not have, and a GM returning
  // from an editor to a list of entities absent from the system they are editing would read it as
  // data loss. It resets to `in` on every mount.
  let membershipFilter = $state('in');

  let ownBrowserState = $state(createEssenceBrowserState());
  // The root's lifted object when bound, else the local fallback. Both are `$state` proxies, so
  // nested writes are reactive and, when bound, propagate back to the root.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the SOURCE filter, the page and the bulk selection: a source filter
  // names link states of a vocabulary the new system does not share, and the selected ids name
  // essences it does not have. Status, sort, view mode and page size are NOT reset, because
  // enabled means the same thing in every system.
  //
  // The sentinel is `ui.systemId`, PERSISTED on the lifted state rather than a component-local
  // `$state`: a local one re-initialises to '' on every mount, so returning from the editor would
  // be misread as a system switch and would wipe the state this object exists to preserve.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.searchTerm = '';
    ui.sourceFilter = 'all';
    ui.pageIndex = 0;
    ui.bulkSelectedEssenceIds = new Set();
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

  // BOTH COUNTS ARE ALWAYS ON SCREEN, which is why this axis is a segmented control rather than
  // the `<select>` it shipped as: the pair is the fact, not either half of it. The count goes in
  // the primitive's own `count` slot rather than into the label string, which is the rendering
  // the status segments beside it already use.
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

  /**
   * The world essences this system has NO record for, projected into the card shape the row
   * renders, so one list can carry both. `enabled: true` is not a fiction: `addToSystem` seeds a
   * membership record with `enabled: true`, so it is what this row WILL be the moment the Add
   * beside it is pressed.
   */
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

  /**
   * One row's three-state membership answer.
   *
   * @param {object} essence a rendered card.
   * @returns {string} one of `absent` / `disabled` / `enabled`.
   */
  function membershipStateOf(essence) {
    if (!memberIds.has(essence?.id)) return 'absent';
    return essenceSystemState({ member: true, enabled: essence?.enabled !== false });
  }

  /**
   * One row's summary line: what this essence DOES in this system, section by section.
   *
   * IT NAMES THE VALUE; the shipped line named the STATE. `Effect source overridden here` said
   * the same four words on every row, naming nothing, so two rows overriding different things
   * read identically. The override mark is a SUFFIX, not the subject — an inheriting section
   * states its value with no parenthesis, which is why every member row now carries a line where
   * only overriding rows did.
   *
   * What it cannot say: a macro is stored as a UUID and the store publishes no resolved name for
   * it, so the macro clause carries `essenceShortValueName`'s terminal segment.
   *
   * @param {object} essence a rendered card.
   * @returns {Array<{section: string, label: string}>}
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

  /**
   * The effect-source clause, in three states. A BROKEN LINK IS ITS OWN WORDING rather than the
   * plain phrase: the row's Effects chip already carries the breakage in a warning tone and a
   * title, and this is the same fact in words beside it.
   *
   * An early-return chain, not a nested ternary: SonarCloud reports S3358 in a file it indexes.
   *
   * @param {object} essence
   * @returns {string}
   */
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

  /**
   * The macro clause, in two states.
   *
   * @param {object} essence
   * @returns {string}
   */
  function macroClause(essence) {
    const name = essenceShortValueName(essence?.propertyMacroUuid);
    if (!name) return text('FABRICATE.Admin.Manager.Essence.SummaryNoMacro', 'No macro');
    return format('FABRICATE.Admin.Manager.Essence.SummaryMacro', 'Macro: {name}', { name });
  }

  /**
   * Mark a clause as this system's own rather than the world's.
   *
   * @param {string} clause
   * @param {boolean} overridden
   * @returns {string}
   */
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

  // THE STATUS AND SOURCE AXES ARE STILL THREADED, AND ARE NOW ALWAYS `all`. The two controls
  // that wrote them are gone from the bar. The pure model keeps both axes because they are a
  // property of a browser pipeline three studios share rather than of this toolbar, and pinning
  // them here is what makes the removal a TOOLBAR change.
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
  const bulkSelectedIds = $derived(ui.bulkSelectedEssenceIds ?? new Set());
  const selectionSummary = $derived(
    describeEssenceSelection({
      pageIds: model.pageIds,
      filteredIds: model.filteredIds,
      selectedIds: bulkSelectedIds,
    })
  );

  // A delete, a system refresh or a filter change must never leave a phantom id in the count or
  // in an Apply. Only assigned when something actually dropped — the pruned set is a subset, so
  // equal sizes mean an identical set — so this cannot loop.
  $effect(() => {
    const current = ui.bulkSelectedEssenceIds ?? new Set();
    if (current.size === 0) return;
    const pruned = pruneEssenceSelection(
      current,
      (essenceCards || []).map((essence) => essence.id)
    );
    if (pruned.size !== current.size) ui.bulkSelectedEssenceIds = pruned;
  });

  // Every mutation assigns a NEW Set. The reactive unit is `ui.bulkSelectedEssenceIds`, not the
  // Set, so an in-place mutation compiles, runs, and silently stops the bound lifted state
  // propagating back to the manager root.
  function toggleBulkSelected(id) {
    ui.bulkSelectedEssenceIds = toggleEssenceSelection(bulkSelectedIds, id);
  }

  function setPageSelected(on) {
    ui.bulkSelectedEssenceIds = setEssenceSelection(bulkSelectedIds, model.pageIds, on);
  }

  function selectAllResults() {
    ui.bulkSelectedEssenceIds = setEssenceSelection(bulkSelectedIds, model.filteredIds, true);
  }

  // The write comes FIRST, so the owner's callback runs with Svelte's flush already queued ahead
  // of the focus hop it schedules.
  function clearBulkSelection() {
    ui.bulkSelectedEssenceIds = new Set();
    onSelectionCleared?.();
  }

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
       1157). Emptying the bulk selection unmounts the panel and the Clear that was pressed, and
       the manager root puts the keyboard here — an inert element, so Space still scrolls. The
       root addresses it through `data-essence-toolbar`. -->
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
      <!-- NO STATUS SEGMENT AND NO SOURCE SELECT (issue 1372). The reference's bar carries ONE
           filter — the membership pair below — beside the search field, where this bar carried
           four controls.

           NEITHER LOSES A STATE A GM CANNOT REACH: every row states its own enabled state as a
           pill and its own source breakage in the summary line and the Effects chip, both of which
           the search box reads, and `sortKey: 'status'` still groups the list by enabled-ness.

           The PRESENTATION toggle stays, on row two: it is not a filter, it is the only route to
           the grid, and `### GM World Essence Screens` requirement 7 and the essence-library
           capability list both name that grid. -->
      <!-- THE MEMBERSHIP AXIS, AS A TWO-SEGMENT CONTROL ON THE TOP ROW. It shipped as a `<select>`
           on the second row, which shows one count and hides the other behind a click — and that
           comparison is the entire subject of the control.

           It renders only when the world corpus can answer it: over an unreadable corpus every
           essence reports as absent from this system, which is a false statement rather than an
           empty one. -->
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

    <!-- ROW TWO carries how the list is ARRANGED — sort key, direction and the presentation
         toggle — plus the retained source filter and the count.

         ROW ONE IS THE FILTERS AND ROW TWO IS EVERYTHING ELSE, and the split is a WIDTH result
         rather than a taxonomy: this screen carries two axes the prototype has no counterpart for
         and a list/grid toggle it also lacks, and the four of them plus search will not fit on one
         745px line. The count keeps its `margin-left: auto`, so it sits at the far end of this
         row. -->
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

      <!-- ICON-ONLY (issue 1036): a list glyph and a grid glyph ARE the two layouts, unlike the
           status filter beside it, where "All / Enabled / Disabled" is the vocabulary. The compact
           track is sized to sit with the 34px `.manager-icon-button`s in a toolbar row rather than
           to match the prototype's pixel count. The label survives in the a11y tree — see the
           `is-icon-only` block in `SegmentedControl.svelte`. -->
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
      <!-- THE BAR'S COUNT ANSWERS MEMBERSHIP, NOT PAGINATION: how many the filters left, how many
           of the world's essences this system has rules for, and how many there are. The range it
           replaces was already rendered verbatim by `Pagination` at the foot of the same list.

           It falls back to that range when the world corpus cannot answer membership, because
           `M of K` over an unreadable corpus would report every essence as absent from this
           system. -->
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
      onTogglePage={(on) => setPageSelected(on)}
      onSelectAllResults={selectAllResults}
      onClear={clearBulkSelection}
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
        onToggleBulkSelected={(id) => toggleBulkSelected(id)}
        onAddToSystem={(id) => actions?.addToSystem?.(id, activeSystemId)}
      />
    {/snippet}
  </LibraryShelf>
</main>

<style>
  /* The two list presentations, and the count. The TOOLBAR's own rhythm is not here: those rules
     JOIN the recipe and component filter-bar rules in `styles/fabricate.css`, which is the one bar
     all three studios render.

     That is a correctness fix, not tidying. `BulkSelectionToolbar` renders its row in ITS OWN
     template, so a rule scoped to THIS component never reached it and the selection row shipped
     with no row metrics at all. A row class a shared primitive wears has to be authored where that
     primitive can see it. */

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

  /* `:global` because the `<ul>` these style is rendered by `LibraryShelf`, so a scoped selector
     would be hashed to THIS component, match nothing, and fail `lint:svelte:warnings` as unused.
     They stay here rather than moving into the shelf because the grid template is a per-studio
     content judgement, and `.manager-essences-table` is unique to this studio. */
  :global(.manager-essences-table) {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The GRID presentation. `auto-fill` rather than a fixed count so the card width stays inside
     the readable range at every manager width.

     Cards STRETCH to the tallest in their row: `align-items: start` sized every card to its own
     copy, so a row of four ran four different heights. The card's own control cluster takes
     `margin-top: auto` in `EssenceRow.svelte`, so the extra height lands between the description
     and the footer and the footers line up across the row. */
  :global(.manager-essences-table.is-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    align-items: stretch;
  }

  /* THE SEARCH FIELD SHRINKS BEFORE THE ROW WRAPS. The shipped `.manager-search` basis sizes it
     for a bar carrying one or two controls beside it; row one carries two segmented tracks, and at
     1280px the field claimed 355px of a 745px bar and pushed the membership control onto a fourth
     band. `flex: 1 1 220px` still lets it take every pixel the two tracks do not want, and gives
     it a floor a query is legible in. */
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
