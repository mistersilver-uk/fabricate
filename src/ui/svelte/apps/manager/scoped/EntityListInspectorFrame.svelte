<!-- Svelte 5 runes mode -->
<!--
  The ONE list-plus-inspector composition behind every scoped-entity list (issue 1380, epic 1357).
  Three lanes need it — the world catalogues (6a-ii), the system-scope rules lists (6b) and the
  tool rules list (6c) — and three independent compositions is not a tidiness argument. Issue 1050
  shipped the SonarCloud duplication gate red at 5.3% with 93 of 98 duplicated lines inside one
  component, and `.svelte` IS duplication-analysed. So the composition is built once here and
  configured per scope; `EntityCatalogueShell` and `EntityRulesListShell` are its two callers and
  neither may inline it.
-->
<script>
  import { paginateRows } from '../../../../../utils/browserPagination.js';
  import {
    describeBulkSelection,
    pruneBulkSelection,
    setBulkSelection,
    toggleBulkSelection,
  } from '../../../../../utils/bulkSelectionModel.js';
  import {
    createScopedEntityListModel,
    defaultScopedSearchText,
    scopedEntryName,
    SYSTEM_MEMBERSHIP_FILTERS,
    WORLD_MEMBERSHIP_FILTERS,
  } from '../../../../../utils/scopedEntityListModel.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import Select from '../../../components/Select.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import Chip from '../../../components/Chip.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { statusChipTone } from '../../../util/statusChipTone.js';
  import BulkSelectionToolbar from '../BulkSelectionToolbar.svelte';
  import Callout from '../Callout.svelte';
  import EmptyState from '../EmptyState.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import ManagerSearchField from '../../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../../components/ManagerToolbar.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { createScopedListBrowserState } from '../../../../../utils/managerBrowserViewState.js';

  let {
    scope = null,
    systems = [],
    systemId = '',
    title = '',
    subtitle = '',
    icon = 'fas fa-cubes-stacked',
    emptyTitle = '',
    emptyHint = '',
    filters = [],
    sorts = [],
    searchOf = defaultScopedSearchText,
    // The list search box's placeholder.
    searchPlaceholder = '',
    rowActions = [],
    rowMeta = undefined,
    inspectorBody = undefined,
    inspectorKicker = '',
    inspectorCaption = undefined,
    inspectorFoot = undefined,
    // WHICH FACT THE ROW'S SECOND LINE CARRIES: `description` (the shipped default, and what the
    // component and essence catalogues draw) or `meta`, which moves the lane's `rowMeta` snippet
    // out of the trailing column and under the name.
    rowSecondLine = 'description',
    // The row's INTERACTIVE trailing content, rendered in the meta column beside the actions.
    rowTrailing = undefined,
    // ── WHAT FOLLOWS THE NAME ON THE NAME LINE (issue 1371 r8-cat) ────────────────────────── An
    // INERT snippet rendered inside the identity `<button>`, directly after the name, which is
    // where the reference draws a row's source pill and its exception flag (`proto:601`).
    rowNameTrailing = undefined,
    // ── WHETHER THE FRAME DRAWS ITS OWN SOURCE BADGE (issue 1371 r8-cat) ────────────────────
    // `true` is the shipped behaviour: a `Linked` / `No source item` pill in the trailing column
    // under `'description'`, and the warning half inside the fact run under `'meta'`.
    rowSourceBadge = true,
    // The LINKED-SOURCE rung of `descriptionOf`.
    describeEntry = undefined,
    // ── THE ROW'S NAME, WHEN THE LANE CAN RESOLVE A BETTER ONE ──────────────────────────────
    // `scopedEntryName` is the shipped answer and stays the default: the entity's own `name`,
    // falling back to its id.
    nameEntry = undefined,
    // ── WHAT OPENS THE LIST, ABOVE THE FIRST ROW ──────────────────────────────────────────── A
    // snippet rendered INSIDE the scroller, before the rows, and only when there are rows to open.
    listLead = undefined,
    // ── WHAT STANDS ABOVE THE TOOLBAR, INSIDE THE LIST COLUMN ─────────────────────────────── A
    // snippet rendered as the FIRST child of `.manager-scoped-list-column` — above the filter row,
    // outside the scroller, and inside the middle track rather than across the whole frame.
    columnLead = undefined,
    countUnit = '',
    // Whether the toolbar offers the world/system MEMBERSHIP `<select>`. Default ON, so every
    // other caller renders unchanged.
    membershipFilter = true,
    // ── THE TOOLBAR AS TWO ROWS (issue 1371 r8-cat) ──────────────────────────────────────────
    // `false` keeps the one row every caller renders today.
    splitToolbar = false,
    // ── THE LEAD ROW'S CONTROL RUNG (issue 1371 r9-cat, maintainer ruling M12b) ──────────────
    // The control HEIGHT the search field and the lead row's lane-filter selects take, named after
    // the rung rather than after an adjective, exactly as `ManagerSearchField`'s own `size` is:
    // `''` is the shipped 34px control and `'38'` is the ladder's next rung up
    // (`design-system/spec.md`: 26 / 28 / 30 / 34 / 38 / 44).
    toolbarLeadSize = '',
    // ── THE ROW'S LEADING TILE (issue 1371 r9-cat, UX finding F12) ─────────────────────────── A
    // `Medallion` descriptor — `{variant, size, glyph}`, the primitive's OWN prop names — for the
    // tile at the head of every list row.
    rowMedallion = null,
    // ── THE SELECTION BAND'S SELECT-ALL, AND WHAT IT REACHES (issue 1371 r9-cat, gap-list 37) ──
    // `'results'` (the shipped band: a tri-state master box for the page, and `Select all {n}
    // results` for the whole filtered corpus) or `'shown'` — the reference's band, which draws no
    // master box at all and offers one text action, `Select all {n} shown` (`proto:592`).
    selectAllScope = 'results',
    // The VISIBLE caption on the select-all box. The prototype's reads `All` where the shipped
    // primitive says `Select all`.
    selectAllLabel = '',
    bulk = undefined,
    // ── THE RESTING INSPECTOR'S OWN COPY (issue 1373, maintainer feedback round 2) ───────────
    // What the panel says while nothing is selected.
    restingTitle = '',
    restingHint = '',
    selectedId = $bindable(''),
    onSelect = () => {},
    // ── THE FIRST ROW IS INSPECTED ON OPEN, WHEN A LANE ASKS (issue 1371 r13-cat, M14) ───── "the
    // component library should auto-select the first component when it is opened." OPT-IN and OFF
    // by default, so a frame that says nothing opens on the resting inspector it always did and
    // the essence and tool catalogues are byte-identical.
    autoSelectFirst = false,
    // ── THE LIST COLUMN RUNS EDGE TO EDGE (issue 1371 r16-cat, maintainer ruling M21) ────────
    // "the entire world component catalogue browser has unnecessary padding/whitespace around its
    // central rail body and does not occupy all of the space available to it." The column below
    // carries the pane's `--fab-space-4` inset on every side, so the toolbar, the rows scroller
    // and the pager all stopped 16px short of the pane's edges while the system Component Rules
    // list beside it — `ComponentsBrowserView`'s `.manager-main`, which carries no inset — runs
    // its toolbar and footer edge to edge.
    flushColumn = false,
    // ── THE BULK DOCK REACHES THE INSPECTOR'S EDGES (issue 1371 r16-cat, maintainer ruling M24)
    // "I also see a padding/whitespace around the bulk edit panel that prevents the button panel
    // from being full-width." The inspector column below pads `--fab-space-4` and the bulk panel
    // renders inside a `-scroll` child that owns the `overflow-y` — so `BulkEditPanelShell`'s
    // sticky dock, whose negative bleeds are sized for the shared rail's `--fab-space-3`, was
    // CLIPPED at the scroller's edge and stopped 16px short of the column's on every side.
    flushBulkDock = false,
    armedToken = $bindable(''),
    // ── THE LIST'S VIEW-STATE IS LIFTED (issue 1438) ─────────────────────────────────────
    // Search, membership, the lane filters, the sort pair and the page live on an object the
    // MANAGER ROOT owns, threaded here by whichever shell mounts this frame.
    browserState = $bindable(null),
  } = $props();

  /** The row class and the five hook names `BulkSelectionToolbar` wears here. */
  const TOOLBAR_ROW_CLASS = 'manager-scoped-list-filter-row';
  const TOOLBAR_ATTR = 'data-scoped-list-selection-toolbar';
  const PAGE_BOX_ATTR = 'data-scoped-list-select-all-page';
  const COUNT_ATTR = 'data-scoped-list-selection-count';
  const RESULTS_ATTR = 'data-scoped-list-select-all-results';
  const CLEAR_ATTR = 'data-scoped-list-clear-selection';

  /**
   * The scoped list's page window (issue 1373, maintainer feedback round 2).
   */
  const DEFAULT_PAGE_SIZE = 10;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /** One row's displayed name. */
  function rowName(entry) {
    const own = String(entry?.entity?.name ?? '').trim();
    if (own) return own;
    const resolved = typeof nameEntry === 'function' ? String(nameEntry(entry) ?? '').trim() : '';
    return resolved || scopedEntryName(entry);
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  const model = createScopedEntityListModel();

  let ownBrowserState = $state(createScopedListBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const query = $derived(String(ui.searchTerm || ''));
  const membership = $derived(ui.membership || 'all');
  const filterValues = $derived(ui.filterValues || {});
  // THE SORT IS TWO CONTROLS, NOT ONE `<select>` OF COMPOSITE IDS.
  const sortKey = $derived(ui.sortKey || 'name');
  const sortDirection = $derived(ui.sortDirection || 'asc');
  const pageIndex = $derived(ui.pageIndex || 0);
  const pageSize = $derived(ui.pageSize || DEFAULT_PAGE_SIZE);
  let selectedIds = $state(new Set());
  /** @type {HTMLElement|null} */
  let inspectorElement = $state(null);

  const available = $derived(scope?.available === true);
  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const roster = $derived(Array.isArray(systems) ? systems : []);

  const membershipOptions = $derived(
    systemId ? SYSTEM_MEMBERSHIP_FILTERS : WORLD_MEMBERSHIP_FILTERS
  );

  // The selection band's population, resolved once.
  const shownScope = $derived(selectAllScope === 'shown');

  const laneFilters = $derived(Array.isArray(filters) ? filters : []);
  const laneSorts = $derived(Array.isArray(sorts) ? sorts : []);

  /**
   * The class a LEAD-ROW select carries when the caller asked for the 38px rung, and `undefined`
   * otherwise.
   */
  function leadSelectSizeClass(filter) {
    const onLeadRow = (filter?.toolbarRow ?? 'lead') === 'lead';
    return toolbarLeadSize === '38' && onLeadRow ? 'is-size-38' : undefined;
  }

  /** The row medallion's three arguments, merged over the shipped tile. */
  const rowMedallionSpec = $derived({
    variant: '',
    size: 40,
    glyph: 0,
    ...(rowMedallion && typeof rowMedallion === 'object' ? rowMedallion : {}),
  });

  // A LANE SORT IS ITS OWN WHOLE ORDER, so it is passed through verbatim and the direction toggle
  // goes inert against it.
  const laneSortIds = $derived(new Set(laneSorts.map((descriptor) => descriptor?.id)));
  const directional = $derived(!laneSortIds.has(sortKey));
  const sort = $derived(directional ? `${sortKey}-${sortDirection}` : sortKey);

  const projected = $derived(
    model.project({
      entries,
      searchOf,
      query,
      membership,
      systemId,
      filters: laneFilters,
      filterValues,
      sort,
      sorts: laneSorts,
    })
  );

  // THE RETURNED INDEX IS THE ONLY ONE ANYTHING READS. See the header.
  const page = $derived(paginateRows(projected.rows, { pageIndex, pageSize }, DEFAULT_PAGE_SIZE));

  const filtered = $derived(
    query.trim() !== '' ||
      membership !== 'all' ||
      laneFilters.some((filter) => {
        const value = filterValues[filter?.id];
        return typeof value === 'string' && value !== '' && value !== 'all';
      })
  );

  const selection = $derived(
    describeBulkSelection({
      pageIds: page.rows.map((entry) => entry.id),
      filteredIds: projected.rows.map((entry) => entry.id),
      selectedIds,
    })
  );

  // A row that leaves the FILTERED set stops being inspected: the alternative is an inspector
  // rendering a record the list no longer shows, with no way back to it.
  const inspectedEntry = $derived(projected.rows.find((entry) => entry.id === selectedId) ?? null);

  // The clamp writes back, so the owner's state and the footer cannot disagree on the next pass.
  // Converges in one tick: once they are equal the effect assigns nothing.
  $effect(() => {
    if (page.pageIndex !== pageIndex) ui.pageIndex = page.pageIndex;
  });

  // THE FIRST SHOWN ROW, WHEN NOTHING IS CHOSEN AND THE LANE OPTED IN (M14; see the prop note).
  // Guarded on the prop FIRST, so an unset frame never reads a row here.
  $effect(() => {
    if (!autoSelectFirst || selectedId !== '') return;
    const first = page.rows[0];
    if (!first) return;
    selectedId = first.id;
    onSelect(first.id);
  });

  // A filter that shrinks the list must not leave a phantom id in `Apply to {N}`.
  $effect(() => {
    const known = projected.rows.map((entry) => entry.id);
    const pruned = pruneBulkSelection(selectedIds, known);
    if (pruned.size !== selectedIds.size) selectedIds = pruned;
  });

  /** Disarm. */
  function disarm() {
    if (armedToken) armedToken = '';
  }

  function changeQuery(value) {
    ui.searchTerm = String(value ?? '');
    ui.pageIndex = 0;
    disarm();
  }

  function changeMembership(value) {
    ui.membership = String(value ?? 'all');
    ui.pageIndex = 0;
    disarm();
  }

  function changeFilter(id, value) {
    ui.filterValues = { ...filterValues, [id]: String(value ?? '') };
    ui.pageIndex = 0;
    disarm();
  }

  function changeSortKey(value) {
    ui.sortKey = String(value ?? 'name');
    ui.pageIndex = 0;
    disarm();
  }

  function toggleSortDirection() {
    ui.sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    ui.pageIndex = 0;
    disarm();
  }

  function changePage(next) {
    ui.pageIndex = next;
    disarm();
  }

  function changePageSize(next) {
    ui.pageSize = next;
    ui.pageIndex = 0;
    disarm();
  }

  function clearFilters() {
    ui.searchTerm = '';
    ui.membership = 'all';
    ui.filterValues = {};
    ui.pageIndex = 0;
    disarm();
  }

  /** The colour caption's raw token, for the lane's `inspectorCaption` snippet. */
  function colourCaption(token) {
    const name = String(token ?? '').trim();
    if (name === '') return '';
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function inspect(entityId) {
    // THE WRITE IS THE WHOLE MECHANISM.
    selectedId = entityId;
    disarm();
    onSelect(entityId);
    // `tabindex="-1"` makes the inspector a focus TARGET without a tab stop, so the keyboard
    // follows the selection into the panel that just changed.
    inspectorElement?.focus?.();
  }

  function toggleRow(entityId) {
    selectedIds = toggleBulkSelection(selectedIds, entityId);
    disarm();
  }

  function togglePage(on) {
    selectedIds = setBulkSelection(
      selectedIds,
      page.rows.map((entry) => entry.id),
      on
    );
    disarm();
  }

  function selectAllResults() {
    selectedIds = setBulkSelection(
      selectedIds,
      projected.rows.map((entry) => entry.id),
      true
    );
    disarm();
  }

  /** `Select all {n} shown` — the reference band's ONE select-all, over the rows on screen. */
  function selectAllShown() {
    selectedIds = setBulkSelection(
      selectedIds,
      page.rows.map((entry) => entry.id),
      true
    );
    disarm();
  }

  function clearSelection() {
    selectedIds = new Set();
    disarm();
  }

  /**
   * The context every snippet receives. IT CARRIES THE WHOLE PROJECTION, on purpose.
   */
  function rowContext(entry) {
    const systemRow = entry ? (projected.systemRows.get(entry.id) ?? null) : null;
    return {
      scope,
      systems: roster,
      systemId,
      selected: entry ? selectedIds.has(entry.id) : false,
      member: systemRow?.member === true,
      systemRow,
      clearSelection,
    };
  }

  /** The thumbnail a row and an inspector header lead with. */
  function thumbnailOf(entry) {
    const entity = entry?.entity ?? null;
    const src = typeof entity?.img === 'string' ? entity.img : '';
    const glyph = typeof entity?.icon === 'string' && entity.icon ? entity.icon : icon;
    const tint =
      scope?.hasColorToken === true && typeof entity?.colorToken === 'string'
        ? entity.colorToken
        : '';
    return { src, icon: glyph, tint };
  }

  /**
   * The description a row and the inspector state, with a rung down to the LINKED ITEM.
   */
  function descriptionOf(entry) {
    const description = entry?.entity?.description;
    if (typeof description === 'string' && description.trim()) return description;
    const inherited = describeEntry?.(entry);
    if (typeof inherited === 'string' && inherited.trim()) return inherited;
    return text('FABRICATE.Admin.Manager.Scoped.List.NoDescription', 'No description');
  }

  /** Whether this entity's identity record actually names a source Item. */
  function sourceLinkedRow(entry) {
    return entry?.hasSourceLink === true;
  }

  // SHORT ENOUGH FOR A CHIP TRACK.
  const membershipLabels = $derived({
    all: text('FABRICATE.Admin.Manager.Scoped.List.MembershipAll', 'All'),
    member: text('FABRICATE.Admin.Manager.Scoped.List.MembershipMember', 'In a system'),
    unused: text('FABRICATE.Admin.Manager.Scoped.List.MembershipUnused', 'Unused'),
    in: text('FABRICATE.Admin.Manager.Scoped.List.MembershipIn', 'In this system'),
    out: text('FABRICATE.Admin.Manager.Scoped.List.MembershipOut', 'Not here'),
  });

  /** The membership filter's segments, each carrying the number of rows it would show. */
  const membershipSegments = $derived(
    membershipOptions.map((option) => ({
      value: option,
      fallback: membershipLabels[option],
      count: model.project({ entries, searchOf, membership: option, systemId }).rows.length,
    }))
  );

  // ── `SYSTEM COUNT` RATHER THAN `SYSTEMS` (issue 1371 r11-cat, UX F-C) ───────────────────── The
  // reference names this key `System count` on BOTH world catalogues it draws — `proto:5228` for
  // components and `proto:4775` for tools — and it is what the key sorts by: the number of
  // crafting systems holding the record.
  const sortKeyLabels = $derived({
    name: text('FABRICATE.Admin.Manager.Scoped.List.SortKeyName', 'Name'),
    systems: text('FABRICATE.Admin.Manager.Scoped.List.SortKeySystems', 'System count'),
  });

  // ── ONE OPTION MAY STAND FOR A PAIR OF DESCRIPTORS (issue 1371 r8-cat) ──────────────────── A
  // lane sort shipped as ONE descriptor and therefore as one whole order, which is why the
  // direction toggle inerts against it — `systems-asc` did not exist and nothing said so.
  const sortOptions = $derived([
    ...Object.keys(sortKeyLabels).map((id) => ({ id, label: sortKeyLabels[id] })),
    ...laneSorts.reduce((options, descriptor) => {
      const id = descriptor?.optionId ?? descriptor?.id;
      if (!id || options.some((option) => option.id === id)) return options;
      options.push({ id, label: descriptor.label });
      return options;
    }, []),
  ]);

  /** The sort keys as the shared select's option shape (issue 1504). */
  const sortSelectOptions = $derived(
    sortOptions.map((option) => ({ value: option.id, label: option.label }))
  );

  /** One lane filter's options in the shared select's shape (issue 1504). */
  function laneFilterOptions(filter) {
    return (filter?.options ?? []).map((option) => ({
      value: option.value,
      label: option.label,
    }));
  }

  const directionLabel = $derived(
    sortDirection === 'asc'
      ? text('FABRICATE.Admin.Manager.Scoped.List.SortAsc', 'Asc')
      : text('FABRICATE.Admin.Manager.Scoped.List.SortDesc', 'Desc')
  );

  // AND THE GLYPH TURNS WITH IT (issue 1373).
  const directionIcon = $derived(
    sortDirection === 'asc' ? 'fas fa-arrow-down-a-z' : 'fas fa-arrow-up-a-z'
  );

  // `{shown} of {total} {unit}` — the prototype's `6 of 6 essences`, right-aligned on the toolbar
  // row.
  const resultCount = $derived(
    countUnit
      ? format('FABRICATE.Admin.Manager.Scoped.List.ResultCount', '{shown} of {total} {unit}', {
          shown: projected.rows.length,
          total: entries.length,
          unit: countUnit,
        })
      : ''
  );

  /** The selection band's standing sentence, and the condition on it is the honest half. */
  const selectionHint = $derived(
    bulk && inspectorBody
      ? text(
          'FABRICATE.Admin.Manager.Scoped.List.SelectionInspectorHint',
          'Bulk actions are in the inspector →'
        )
      : ''
  );
</script>

<!-- TWO ELEMENTS, AND THE SPLIT IS LOAD-BEARING. -->
<div class="manager-scoped-list-frame">
  <!-- `&& available` is load-bearing, not defensive. -->
  <div class="manager-scoped-list-layout" class:has-inspector={Boolean(inspectorBody) && available}>
    <!-- THE COLUMN IS THE MIDDLE TRACK IN BOTH STATES, and the lead is above the branch rather
         than inside its available half (issue 1373, maintainer feedback round 2). -->
    <div class="manager-scoped-list-column" class:is-flush={flushColumn}>
      {#if columnLead}
        <div class="manager-scoped-list-column-lead">{@render columnLead()}</div>
      {/if}
      {#if !available}
        <div class="manager-scoped-list-unavailable">
          <!-- WARNING STANDS (issue 1505). -->
          <Callout
            tone="warning"
            text={text(
              'FABRICATE.Admin.Manager.Scoped.List.Unavailable',
              'This world corpus could not be read, so nothing here can be listed or edited. Reload the world once its settings are readable.'
            )}
            dataAttr="data-scoped-list-state"
            dataValue="unavailable"
          />
        </div>
      {:else}
        <ManagerToolbar
          class="manager-scoped-list-toolbar"
          data-scoped-list-toolbar=""
          ariaLabel={text('FABRICATE.Admin.Manager.Scoped.List.Filters', 'List filters')}
        >
          <!--
            THE FILTER ROW HOLDS FILTERS, AND NOTHING THE SELECTION STATE CHANGES.
          -->
          <!-- ── THE LEAD ROW, WHEN A LANE ASKS FOR TWO (issue 1371 r8-cat) ────────────────
               `proto:576`-`577` draws the search field and the source-type select on their own
               row ABOVE the membership/sort row. -->
          {#if splitToolbar}
            <div class="manager-scoped-list-search-row" data-scoped-list-search-row>
              {@render searchField()}
              {@render laneFilterSelects('lead')}
            </div>
          {/if}

          <div class={TOOLBAR_ROW_CLASS}>
            {#if !splitToolbar}{@render searchField()}{/if}

            <!-- SEGMENTED CHIPS, NOT A `<select>`. -->
            {#if membershipFilter}
              <SegmentedControl
                density="compact"
                options={membershipSegments}
                value={membership}
                groupName={`scoped-list-membership-${scope?.entityType || 'entity'}`}
                ariaLabel={text(
                  'FABRICATE.Admin.Manager.Scoped.List.MembershipLabel',
                  'Membership filter'
                )}
                dataAttr="data-scoped-list-membership"
                optionDataAttr="data-scoped-list-membership-option"
                onChange={(next) => changeMembership(next)}
              />
            {/if}

            {#if splitToolbar}
              {@render laneFilterSelects('filters')}
              <!-- The reference's hairline between the membership control and the sort group (`proto:582`). -->
              <span class="manager-scoped-list-toolbar-divider" aria-hidden="true"></span>
            {:else}
              {@render laneFilterSelects(null)}
            {/if}

            <span class="manager-scoped-list-sort-label" id="scoped-list-sort-label">
              {text('FABRICATE.Admin.Manager.Scoped.List.SortByLabel', 'Sort by')}
            </span>
            <Select
              size="toolbar"
              value={sortKey}
              options={sortSelectOptions}
              ariaLabelledBy="scoped-list-sort-label"
              triggerData={{ 'data-scoped-list-sort': '' }}
              onChange={(next) => changeSortKey(next)}
            />

            <!-- The direction is a TOGGLE that states its current position, not a second select. -->
            <button
              type="button"
              class="manager-scoped-list-direction"
              data-scoped-list-direction={sortDirection}
              aria-pressed={sortDirection === 'asc'}
              disabled={!directional}
              title={text(
                'FABRICATE.Admin.Manager.Scoped.List.SortDirection',
                'Reverse the sort order'
              )}
              onclick={toggleSortDirection}
            >
              <i class={directionIcon} aria-hidden="true"></i>
              <span>{directionLabel}</span>
            </button>

            {#if resultCount}
              <span class="manager-scoped-list-count" data-scoped-list-count>{resultCount}</span>
            {/if}
          </div>

          <!--
            ── THE SELECTION STATE IS ITS OWN BAND (issue 1373, maintainer feedback round 4) ────
            `proto:591`-`597`: a tinted row directly beneath the filter row, rendered ONLY while a
            selection is active, holding the count, a sentence pointing at the inspector, and the
            two text actions at its trailing edge.
          -->
          {#if selection.count > 0}
            <BulkSelectionToolbar
              rowClass={TOOLBAR_ROW_CLASS}
              toolbarAttr={TOOLBAR_ATTR}
              pageBoxAttr={PAGE_BOX_ATTR}
              countAttr={COUNT_ATTR}
              resultsAttr={RESULTS_ATTR}
              clearAttr={CLEAR_ATTR}
              {selectAllScope}
              pageSelectionState={selection.pageSelectionState}
              count={selection.count}
              showSelectAllResults={shownScope
                ? selection.count > 0
                : selection.showSelectAllResults}
              selectAllResultsCount={shownScope
                ? page.rows.length
                : selection.selectAllResultsCount}
              {selectAllLabel}
              hint={selectionHint}
              trailingActions
              bareActions
              countIcon="fa-solid fa-check-double"
              onTogglePage={togglePage}
              onSelectAllResults={shownScope ? selectAllShown : selectAllResults}
              onClear={clearSelection}
            />
          {/if}
        </ManagerToolbar>

        {#if bulk && !inspectorBody && selection.count > 0}
          <!-- With no inspector column there is nowhere else for a bulk body to go, so it sits
             directly under the toolbar that states the count it acts on. -->
          <section class="manager-scoped-list-bulk" data-scoped-list-bulk>
            {@render bulk([...selectedIds], rowContext(null))}
          </section>
        {/if}

        <div class="manager-scoped-list-rows">
          <!-- WHAT OPENS THE LIST. -->
          <!-- WRAPPED, AND THE WRAPPER IS WHERE THE GAP LIVES (issue 1373, maintainer feedback round 2). -->
          {#if listLead}
            <div class="manager-scoped-list-lead">{@render listLead()}</div>
          {/if}
          {#if page.rows.length === 0 && filtered}
            <EmptyState
              filtered
              hint={text(
                'FABRICATE.Admin.Manager.Scoped.List.FilteredEmpty',
                'Nothing here matches the current search and filters.'
              )}
              dataAttr="data-scoped-list-state"
              dataValue="filtered"
            >
              <ManagerButton data-scoped-list-clear-filters onclick={clearFilters}>
                {text('FABRICATE.Admin.Manager.Scoped.List.ClearFilters', 'Clear filters')}
              </ManagerButton>
            </EmptyState>
          {:else if page.rows.length === 0}
            <EmptyState
              {icon}
              title={emptyTitle}
              hint={emptyHint}
              dataAttr="data-scoped-list-state"
              dataValue="empty"
            />
          {:else}
            <ul class="manager-scoped-list" role="list" aria-label={title}>
              {#each page.rows as entry (entry.id)}
                {@const inspected = inspectedEntry?.id === entry.id}
                {@const bulkSelected = selectedIds.has(entry.id)}
                {@const thumbnail = thumbnailOf(entry)}
                {@const name = rowName(entry)}
                <li
                  class="manager-scoped-list-row"
                  class:is-selected={inspected}
                  class:is-bulk-selected={bulkSelected}
                  data-scoped-list-row={entry.id}
                  data-scoped-list-bulk-selected={bulkSelected}
                  aria-current={inspected ? 'true' : undefined}
                >
                  <!-- THE SELECTION BOX LEADS THE ROW. -->
                  <SelectionCheckbox
                    size="lg"
                    wrapper="label"
                    checked={bulkSelected}
                    ariaLabel={format(
                      'FABRICATE.Admin.Manager.Scoped.List.SelectRow',
                      'Select {name}',
                      { name }
                    )}
                    data-scoped-list-select={entry.id}
                    onChange={() => toggleRow(entry.id)}
                  />

                  <button
                    type="button"
                    class="manager-scoped-list-identity"
                    data-scoped-list-inspect={entry.id}
                    onclick={() => inspect(entry.id)}
                  >
                    <Medallion
                      art={thumbnail.src}
                      alt=""
                      icon={thumbnail.icon}
                      tint={thumbnail.tint}
                      variant={rowMedallionSpec.variant}
                      size={rowMedallionSpec.size}
                      glyph={rowMedallionSpec.glyph}
                    />
                    <span class="manager-system-copy">
                      <!-- THE NAME LINE, WHICH MAY CARRY MORE THAN THE NAME (issue 1371 r8-cat). -->
                      {#if rowNameTrailing}
                        <span class="manager-scoped-list-row-name-line">
                          <span class="manager-system-name" title={name}>{name}</span>
                          {@render rowNameTrailing(entry, rowContext(entry))}
                        </span>
                      {:else}
                        <span class="manager-system-name" title={name}>{name}</span>
                      {/if}
                      <!-- THE SECOND LINE IS THE LANE'S CHOICE OF FACT. -->
                      {#if rowSecondLine === 'description'}
                        <span class="manager-system-description" title={descriptionOf(entry)}>
                          {descriptionOf(entry)}
                        </span>
                      {:else if rowMeta}
                        <!-- INSIDE THE IDENTITY BUTTON, WHICH IS WHY `rowTrailing` EXISTS. -->
                        <span
                          class="manager-scoped-list-row-facts"
                          data-scoped-list-row-facts={entry.id}
                        >
                          {#if rowSourceBadge && scope?.sourceLinked === true && !sourceLinkedRow(entry)}
                            <!-- ONLY THE WARNING HALF. -->
                            <span
                              class="manager-scoped-list-source"
                              data-scoped-list-source="unlinked"
                            >
                              <Chip tone="warning" icon="fas fa-link-slash"
                                >{text(
                                  'FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked',
                                  'No source item'
                                )}</Chip
                              >
                            </span>
                          {/if}
                          {@render rowMeta(entry, rowContext(entry))}
                        </span>
                      {/if}
                    </span>
                  </button>

                  <!-- A `<div>`, not the `<span>` `ComponentRow` uses: a lane's `rowMeta` — and
                       the rules-list shell's own `InheritRow` — render block elements, and a
                       `<div>` inside a `<span>` is invalid nesting the browser reparents. -->
                  <div class="manager-scoped-list-row-meta">
                    <!-- THE SOURCE PILL FOLLOWS THE FACTS. -->
                    {#if rowSourceBadge && scope?.sourceLinked === true && rowSecondLine === 'description'}
                      <span
                        class="manager-scoped-list-source"
                        data-scoped-list-source={sourceLinkedRow(entry) ? 'linked' : 'unlinked'}
                      >
                        <Chip
                          tone={statusChipTone(sourceLinkedRow(entry) ? 'subtle' : 'warning')}
                          icon={sourceLinkedRow(entry) ? 'fas fa-link' : 'fas fa-link-slash'}
                          >{sourceLinkedRow(entry)
                            ? text('FABRICATE.Admin.Manager.Scoped.List.SourceLinked', 'Linked')
                            : text(
                                'FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked',
                                'No source item'
                              )}</Chip
                        >
                      </span>
                    {/if}
                    {#if rowSecondLine === 'description' && rowMeta}
                      {@render rowMeta(entry, rowContext(entry))}
                    {/if}
                    {#if rowTrailing}{@render rowTrailing(entry, rowContext(entry))}{/if}
                  </div>

                  <!-- A LABELLED ACTION IS A DESCRIPTOR FLAG, NOT A SECOND ROW COMPONENT. -->
                  <span class="manager-action-group">
                    {#each rowActions as action (action.id)}
                      {#if action.labelled}
                        <button
                          type="button"
                          class="manager-scoped-list-row-action"
                          data-scoped-list-action={action.id}
                          aria-label={`${action.label} — ${name}`}
                          title={action.label}
                          onclick={() => action.run(entry)}
                        >
                          <span>{action.label}</span>
                          <i
                            class={action.trailingIcon || 'fas fa-arrow-up-right-from-square'}
                            aria-hidden="true"
                          ></i>
                        </button>
                      {:else}
                        <IconButton
                          data-scoped-list-action={action.id}
                          ariaLabel={`${action.label} — ${name}`}
                          title={action.label}
                          onclick={() => action.run(entry)}
                        >
                          <i class={action.icon} aria-hidden="true"></i>
                        </IconButton>
                      {/if}
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <!--
          THE FOOT PAGER RENDERS ONLY WHEN THERE IS MORE THAN ONE PAGE (issue 1372, maintainer
          parity round 4).
        -->
        <Pagination
          multiPageOnly={true}
          totalCount={page.totalCount}
          pageIndex={page.pageIndex}
          {pageSize}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
        />
      {/if}
    </div>

    <!-- `&& available` for the reason the layout's own note gives: the unavailable state draws
         one callout and no panel, so a 300px track beside it would be a painted void. -->
    {#if inspectorBody && available}
      <aside
        class="manager-scoped-list-inspector"
        bind:this={inspectorElement}
        tabindex="-1"
        data-keyboard-focus="true"
        data-scoped-list-inspector
        aria-label={text('FABRICATE.Admin.Manager.Scoped.List.Inspector', 'Details')}
      >
        {#if bulk && selection.count > 0}
          <!-- THE CLASS IS ON THE SCROLLER, NOT THE ASIDE (M24). -->
          <div class="manager-scoped-list-inspector-scroll" class:is-flush-bulk={flushBulkDock}>
            {@render bulk([...selectedIds], rowContext(null))}
          </div>
        {:else if inspectedEntry}
          {@const thumbnail = thumbnailOf(inspectedEntry)}
          {@const caption = colourCaption(inspectedEntry?.entity?.colorToken)}
          <!-- THE IDENTITY BLOCK IS THREE STACKED PARTS, NOT A TWO-COLUMN ROW. -->
          <div class="manager-scoped-list-inspector-identity">
            {#if inspectorKicker}
              <p class="manager-kicker" data-scoped-list-inspector-kicker>{inspectorKicker}</p>
            {/if}
            <div class="manager-inspector-title-row">
              <span class="manager-inspector-icon">
                <Medallion
                  art={thumbnail.src}
                  alt=""
                  icon={thumbnail.icon}
                  tint={thumbnail.tint}
                  size={42}
                />
              </span>
              <span class="manager-inspector-copy">
                <!-- AN `<h2>`, as every shipped inspector renders it. -->
                <h2 class="manager-inspector-name" data-scoped-list-inspector-name>
                  {scopedEntryName(inspectedEntry)}
                </h2>
                <!-- THE GATE IS THE SNIPPET OR THE COLOUR, NEVER THE COLOUR ALONE. -->
                {#if inspectorCaption || caption}
                  <span class="manager-scoped-list-inspector-caption" data-scoped-list-caption>
                    {#if inspectorCaption}
                      {@render inspectorCaption(inspectedEntry)}
                    {:else}{caption}{/if}
                  </span>
                {/if}
              </span>
            </div>
            <p class="manager-scoped-list-inspector-description">
              {descriptionOf(inspectedEntry)}
            </p>
          </div>
          <div class="manager-scoped-list-inspector-scroll">
            {@render inspectorBody(inspectedEntry, rowContext(inspectedEntry))}
          </div>
          {#if inspectorFoot}
            <div class="manager-scoped-list-inspector-foot" data-scoped-list-inspector-foot>
              {@render inspectorFoot(inspectedEntry)}
            </div>
          {/if}
        {:else}
          <div class="manager-scoped-list-inspector-scroll">
            <!-- THE LANE'S COPY WINS, and the shipped pair is the fallback. -->
            <EmptyState
              compact
              {icon}
              title={restingTitle ||
                text('FABRICATE.Admin.Manager.Scoped.List.RestingTitle', 'Nothing selected')}
              hint={restingHint || subtitle}
              dataAttr="data-scoped-list-inspector-state"
              dataValue="resting"
            />
          </div>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<!-- THE TWO TOOLBAR CONTROLS THAT MOVE ROW, WRITTEN ONCE (issue 1371 r8-cat). -->
{#snippet searchField()}
  <ManagerSearchField
    value={query}
    size={toolbarLeadSize}
    onInput={(next) => changeQuery(next)}
    placeholder={searchPlaceholder ||
      text('FABRICATE.Admin.Manager.Scoped.List.SearchPlaceholder', 'Search…')}
    ariaLabel={text('FABRICATE.Admin.Manager.Scoped.List.SearchLabel', 'Search')}
    inputAttrs={{ 'data-scoped-list-search': '' }}
  />
{/snippet}

<!--
  `row` is `null` in the one-row toolbar, where every lane filter renders exactly where it always
  did.
-->
{#snippet laneFilterSelects(row)}
  {#each laneFilters as filter (filter.id)}
    {#if !row || (filter.toolbarRow ?? 'lead') === row}
      {#if filter.microLabel}
        <span
          class="manager-micro-label manager-scoped-list-filter-label"
          id={`scoped-list-filter-label-${filter.id}`}
          data-scoped-list-filter-label={filter.id}
        >
          {filter.microLabel}
        </span>
      {/if}
      <!--
        THE APP'S OWN LIST, AT THIS ROW'S OWN RUNG (issue 1504).
      -->
      <Select
        size="toolbar"
        class={leadSelectSizeClass(filter)}
        value={filterValues[filter.id] ?? 'all'}
        options={laneFilterOptions(filter)}
        ariaLabel={filter.microLabel ? undefined : filter.label}
        ariaLabelledBy={filter.microLabel ? `scoped-list-filter-label-${filter.id}` : undefined}
        triggerData={{ 'data-scoped-list-filter': filter.id }}
        onChange={(next) => changeFilter(filter.id, next)}
      />
    {/if}
  {/each}
{/snippet}

<style>
  /* THE FRAME IS ITS OWN CONTAINER. `.manager-body` is `220px minmax(0,1fr) 300px`, and under the
     released full-width classification `<main>` is the list column plus the freed 300px — so the
     budget this frame lays out against is the main column's inline size, not the window's. */
  .manager-scoped-list-frame {
    container-type: inline-size;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-list-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  /* 340px AND NO COLUMN GAP, matching the shared aside this column stands in for, so a GM sees ONE
     inspector across both scopes rather than learning a second one per screen. */
  .manager-scoped-list-layout.has-inspector {
    grid-template-columns: minmax(0, 1fr) 340px;
    column-gap: 0;
  }

  /* THE CONTENT CARRIES THE PANE'S INSET, BECAUSE THE SIDEBAR MUST NOT (issue 1373, round 4). */
  .manager-scoped-list-column {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-4);
  }

  /* AND THE ONE CATALOGUE THAT DROPS IT (M21; see `flushColumn`). */
  .manager-scoped-list-column.is-flush {
    padding: 0;
  }

  /* THE ROWS TAKE THE SLACK AND THE CHROME DOES NOT. Without the explicit pair the column hands
     its height to whichever child grows, and the browse archetype's rule — the pagination bar sits
     OUTSIDE the scroll area so it never moves — is the opposite of that. */
  :global(.manager-toolbar.manager-scoped-list-toolbar) {
    flex: 0 0 auto;
  }

  /* THE COLUMN LEAD IS CHROME, so it takes none of the column's slack — the same `0 0 auto` the
     toolbar and the pager take, for the same reason. */
  .manager-scoped-list-column-lead {
    display: grid;
    flex: 0 0 auto;
    min-width: 0;
  }

  .manager-scoped-list-bulk {
    flex: 0 0 auto;
  }

  /* `Pagination` renders its own `<section>` carrying two classes since issue 1502 — the family
     root `fabricate-pagination` and `manager-pagination` — so a scoped rule cannot reach it and
     the sizing has to be stated from this side of the boundary. */
  .manager-scoped-list-column > :global(.manager-pagination) {
    flex: 0 0 auto;
  }

  /* THE IDENTITY CELL IS LEFT-ALIGNED, AND IT TAKES A RULE TO SAY SO. It is a real `<button>`, and
     Foundry core's own button rule centres a button's flex content. */
  .manager-scoped-list-identity {
    justify-content: flex-start;
    text-align: left;
  }

  /* THE ROW NAME IS THE PROTOTYPE'S 13.5px SERIF, matching the shipped precedent at
     `.manager-component-row .manager-system-name`, which records the same figure and the same
     reason: the shared `.manager-system-name` declares no base size, so a catalogue row's name
     bleeds to the inherited 14px. */
  .manager-scoped-list-row .manager-system-name {
    font-family: var(--fab-font-serif);
    font-size: 0.76rem;
  }

  /* ── THE TWO-ROW TOOLBAR'S OWN THREE ELEMENTS (issue 1371 r8-cat) ───────────────────────── Each
     renders only under `splitToolbar`, so no caller that keeps the one-row toolbar can reach any
     of them. */
  .manager-scoped-list-search-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  /* `proto:582`'s 1px x 18px rule between the membership control and the sort group. */
  .manager-scoped-list-toolbar-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 18px;
    background: var(--fab-border);
  }

  /* A lane filter's visible micro-label sits on its control's baseline, not above it: this is a
     labelled control on one row, and `.manager-micro-label`'s shared block margin would push the
     whole row's alignment down by its own leading. */
  .manager-scoped-list-filter-label {
    flex: 0 0 auto;
    margin: 0;
  }

  /* ── THE NAME LINE, WHEN A LANE PUTS SOMETHING AFTER THE NAME ─────────────────────────────
     `proto:601` is `[name] [source pill] [flag]` on one line with the name allowed to ellipsise
     and the pills held at their intrinsic width. */
  .manager-scoped-list-row-name-line {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* AND THE NAME TAKES THE REFERENCE'S 13.5px/600 SERIF (gap-list row 22). */
  .manager-scoped-list-row-name-line .manager-system-name {
    min-width: 0;
    overflow: hidden;
    font-size: 0.844rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* AND THE DESCRIPTION IS THE REFERENCE'S 11px, for the reason the name rule above states. */
  .manager-scoped-list-row .manager-system-description {
    font-size: 0.69rem;
  }

  /* THE FILTER ROW IS ONE LINE, AND IT TAKES A RULE TO SAY SO. Foundry core sizes every `<select>`
     to `width: 100%`, and neither the global toolbar block nor this one overrode it — so each of
     the three toolbar selects claimed the whole filter row and wrapped onto a line of its own. */

  /* ── TWO RULES USED TO LIVE HERE, AND BOTH WENT WITH THE FLATTENING (issue 1373, round 4) ───
     `.manager-scoped-list-filter-row.is-selection { display: contents }` removed the register's
     own wrapper from the box tree so its controls joined the filter row; the `:has()` rule under
     it then shrank the search field to about 150px whenever that row carried a selection count,
     because eleven items no longer fitted 1280px. */

  /* `SORT BY`, the prototype's tracked micro-label before the key select. */
  .manager-scoped-list-sort-label {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The direction toggle. */
  .manager-scoped-list-direction {
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--fab-space-chip);
    align-items: center;
    justify-content: center;
    width: auto;
    height: 34px;
    min-height: 34px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    /* A FORM CONTROL, so it takes the control rung — the same one the search field and the
       selects beside it sit on (issue 1372). */
    background: var(--fab-bg-1);
    color: var(--fab-text);
    font-size: var(--fab-recipe-control-font);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .manager-scoped-list-direction:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ── THE WORLD COMPONENT CATALOGUE'S TWO MICRO-TYPE CORRECTIONS (issue 1371 r11-cat) ────── UX
     round-2 finding F-K. */
  :global(.fabricate-manager[data-manager-view='world-components'])
    .manager-scoped-list-sort-label {
    font-size: 0.531rem;
    font-weight: 700;
    letter-spacing: 0.09em;
  }

  :global(.fabricate-manager[data-manager-view='world-components']) .manager-scoped-list-direction {
    color: var(--fab-text-secondary);
    font-size: 0.6875rem;
    font-weight: 600;
  }

  /* `6 of 6 essences`, pushed to the trailing edge of the row exactly as the prototype draws it. */
  .manager-scoped-list-count {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--fab-text-subtle);
    font-size: 0.68rem;
    white-space: nowrap;
  }

  /* THE SCROLLER RESTS ON A ROW BOUNDARY, NEVER THROUGH ONE (issue 1373). */
  .manager-scoped-list-rows {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    scroll-padding-block-start: var(--fab-space-1);
    scroll-snap-type: y proximity;
  }

  /* `:global` because the rows are `<li>` elements this component writes but whose class rules
     live in `styles/fabricate.css`; the SNAP is a fact about this scroller rather than about the
     row's appearance, so it is stated here, against the scroller that owns it. */
  .manager-scoped-list-rows :global(.manager-scoped-list-row) {
    scroll-snap-align: start;
  }

  /* AND THE TOP OF THE LIST IS A SNAP POINT, which is not optional once the rows are. */
  .manager-scoped-list-rows > :global(:first-child) {
    scroll-snap-align: start;
  }

  /* THE ONE GAP UNDER THE LEAD (issue 1373, maintainer feedback round 2). */
  .manager-scoped-list-lead {
    margin-bottom: var(--fab-space-3);
    min-width: 0;
  }

  /* THE SCROLL MOVED OFF THE PANEL AND ONTO ITS MIDDLE CHILD. */
  .manager-scoped-list-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-4);
    border-left: 1px solid var(--fab-border);
    background: var(--fab-bg-1);
  }

  /* THE BULK PANEL'S SCROLLER TAKES THE COLUMN'S INSET (M24; see `flushBulkDock`). */
  .manager-scoped-list-inspector:has(> .manager-scoped-list-inspector-scroll.is-flush-bulk) {
    padding: 0;
  }

  .manager-scoped-list-inspector-scroll.is-flush-bulk {
    padding: var(--fab-space-4);
  }

  .manager-scoped-list-inspector-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  /* THE RESTING PANEL IS CONTENT-HEIGHT AT THE TOP OF THE COLUMN (issue 1373, maintainer feedback
     round 3). The ASIDE runs the full height of the app — that is finding 6 and it stays — but the
     panel inside it does not stretch to fill it. */
  .manager-scoped-list-inspector-scroll > :global(.manager-empty) {
    flex: 0 0 auto;
    min-height: 0;
  }

  .manager-scoped-list-inspector-identity {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* THE ROW'S FACT RUN, in the identity column under the name. It wraps rather than truncating,
     because every chip in it names a rule and a clipped rule is worse than a two-line row. */
  .manager-scoped-list-row-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    min-width: 0;
    margin-top: var(--fab-space-2xs);
  }

  /* THE LABELLED ROW ACTION: a small bordered button with a trailing external-link glyph, which is
     what the design draws at the trailing edge of a catalogue row (`proto:1997`). */
  .manager-scoped-list-row-action {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: auto;
    height: 26px;
    min-height: 26px;
    margin: 0;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    color: var(--fab-text-muted);
    background: transparent;
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .manager-scoped-list-row-action:hover {
    border-color: var(--fab-accent);
    color: var(--fab-accent);
  }

  .manager-scoped-list-row-action:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* The colour caption, under the name and above the description. See `colourCaption` for why it
     carries the token's NAME and not the prototype's hex. */
  .manager-scoped-list-inspector-caption {
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
  }

  /* FULL COLUMN WIDTH, below the medallion rather than beside it. */
  .manager-scoped-list-inspector-description {
    margin: var(--fab-space-2xs) 0 0;
    color: var(--fab-text-muted);
    font-size: 0.72rem;
    line-height: 1.45;
    overflow-wrap: break-word;
  }

  /* The pinned foot. Its divider is the row's own border rather than a `<hr>`. */
  .manager-scoped-list-inspector-foot {
    display: grid;
    flex: 0 0 auto;
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
    min-width: 0;
  }

  /* The landmark is a focus TARGET, not a tab stop, so the ring is drawn only for a
     keyboard-driven landing. */
  .manager-scoped-list-inspector:focus {
    outline: none;
  }

  .manager-scoped-list-inspector:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .manager-scoped-list-unavailable {
    min-width: 0;
  }

  /* The source badge's hook wrapper. */
  .manager-scoped-list-source {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 0;
  }

  /* BELOW THE THRESHOLD THE INSPECTOR STACKS UNDER THE LIST rather than compressing to a column
     too narrow to read a name in. */
  @container (max-width: 760px) {
    .manager-scoped-list-layout.has-inspector {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
