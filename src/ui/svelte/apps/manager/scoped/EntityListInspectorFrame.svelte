<!-- Svelte 5 runes mode -->
<!--
  The ONE list-plus-inspector composition behind every scoped-entity list (issue 1380, epic 1357).

  Three lanes need it — the world catalogues (6a-ii), the system-scope rules lists (6b) and the
  tool rules list (6c) — and three independent compositions is not a tidiness argument. Issue 1050
  shipped the SonarCloud duplication gate red at 5.3% with 93 of 98 duplicated lines inside one
  component, and `.svelte` IS duplication-analysed. So the composition is built once here and
  configured per scope; `EntityCatalogueShell` and `EntityRulesListShell` are its two callers and
  neither may inline it.

  ── THE COMPOSITION IS ASYMMETRIC BY SCOPE, AND THAT IS A DECISION ────────────────────────────
  All seven world scoped routes are classified `full-width-2-track` in
  `CraftingSystemManagerRoot.svelte`, so `{#if !fullWidthLayout}` suppresses the shell's shared
  300px `.manager-inspector` aside on every one of them: a world catalogue must draw its own
  inspector column inside `<main>` or a GM gets none at all. The three system-scope routes
  (`components`, `essences`, `tools`) are ABSENT from that classification, so their shared aside is
  live and already holds the root's browser inspector — a second column beside it would put two
  inspectors on screen, and neither gateway file may be opened to reconcile them.

  So the inspector region renders ONLY when an `inspectorBody` snippet is supplied. That is the
  whole mechanism: the catalogue shell always supplies one, the rules-list shell never does.

  ── COMPOSED, NEVER RESTATED ──────────────────────────────────────────────────────────────────
  Selection reduction is `src/utils/bulkSelectionModel.js`, page arithmetic is
  `src/utils/browserPagination.js`, and filter/sort/memoisation is
  `src/utils/scopedEntityListModel.js`. The chrome is the shipped primitives:
  `BulkSelectionToolbar`, `Pagination`, `EmptyState`, `SelectionCheckbox`, `Medallion`,
  `StatusPill`, `Callout`.

  THE CLAMP IS A DEFECT SURFACE, NOT FREE SAFETY. `paginateRows` clamps the index IT RETURNS;
  `Pagination` computes its displayed range from the index its OWNER hands it. A frame that
  clamped for slicing and passed `Pagination` its own raw state would render zero rows under a
  footer reading "Showing 51–3 of 3", with no empty state, because the filtered set is not empty.
  Both the slice and the footer therefore read `page.pageIndex`, and an effect writes it back.

  `BulkSelectionToolbar` RENDERS UNCONDITIONALLY, at `count: 0` / `pageSelectionState: 'none'`.
  The primitive appends below the filter bar with a hairline where `design-system/spec.md` says the
  selection bar replaces it in place; a bar that appears on the first tick makes the list jump one
  row exactly as the GM's cursor lands on it. Always-present removes the jump without touching the
  primitive or the host sheet.

  `Pagination` takes `persistent={true}`. Its default is `false`, which hides the footer below a
  page's worth of rows, and `design-system/spec.md` requires a browse screen never to hide its
  disabled arrows.

  ── THE ROW IS NOT A BUTTON ───────────────────────────────────────────────────────────────────
  It contains `SelectionCheckbox`'s `<input>` and `<label>`, so the click target is the NESTED
  identity `<button>` and the box sits at the row's trailing edge after the actions, exactly as
  `ComponentRow` places it. A `role="button"` wrapper would nest interactive content and inherit
  Foundry's keybinding trap on a focused div.

  `is-selected` and `is-bulk-selected` are DIFFERENT QUESTIONS and one row carries both:
  "you are here" versus "this row is in the set the next Apply writes to". The inspected row also
  carries `aria-current`.

  ── THREE NO-CONTENT STATES, NOT TWO ──────────────────────────────────────────────────────────
  Unavailable (the corpus could not be read), empty (the world holds none), and
  filtered-to-nothing. Telling a GM their world is empty when a query matched nothing is the same
  class of harm as offering a destructive action over a corpus nobody could read, so `available:
  false` suspends search, the filters, the sort, the selection toolbar and every row affordance,
  and states itself through a `Callout` rather than through the no-state hero with different copy.

  ── WHY THE ROW CLASS AND ALL FIVE HOOKS ARE PASSED EXPLICITLY ────────────────────────────────
  `BulkSelectionToolbar` renders `<div class="{rowClass} is-selection">` in its OWN template, so a
  scoped rule here cannot reach it and the row metrics have to be authored in the host sheet — the
  defect `styles/fabricate.css` already records against the essence view. Its `rowClass` and its
  five hook attributes all DEFAULT to the Component Studio's strings; inheriting them would make
  six scoped screens retune silently whenever that studio does, so every one is stated here.

  ── COMPONENT-OWNED STYLING USES STATIC CLASS NAMES ───────────────────────────────────────────
  Svelte can then prove each selector is used and `lint:svelte:warnings` stays at zero. The
  container query below is this component's, including the stacked layout under a narrow
  container; only the markup this file does NOT own (the toolbar primitive's row) is authored in
  `styles/fabricate.css`.

  Props:
   - scope: one entity type's `worldScope` projection. Every shape fact is read from it —
     `available`, `entries`, `sections`, `sourceLinked`, `hasColorToken` — never inferred from
     `scope.entityType` at a call site.
   - systems: the crafting-system roster, `{id, name}` ONLY (`projectSystems` narrows to those
     two). `name` carries an id fallback because a field the allowlist omits reads `undefined`.
   - systemId: `''` in world scope; the addressed system in system scope.
   - title / subtitle / icon / emptyTitle / emptyHint: pre-localized, from the lane.
   - filters / sorts: the lane's extra descriptors, appended to this frame's own.
   - searchOf(entry): the per-entry searchable string; memoised per `(entries, searchOf)`.
   - rowActions: `{id, icon, label, run(entry)}` DESCRIPTORS, not markup, so both shells declare
     their navigation without either of them hand-writing a button run.
   - rowMeta(entry, ctx) / inspectorBody(entry, ctx) / bulk(selectedIds, ctx): see the ctx note
     on `rowContext` below.
   - selectedId / onSelect(entityId): the inspected row, controllable by the page.
   - armedToken: BINDABLE. The frame clears it on any selection, filter, sort or page change, so
     the owner's single-armed-token invariant holds across a re-projection.
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
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import BulkSelectionToolbar from '../BulkSelectionToolbar.svelte';
  import Callout from '../Callout.svelte';
  import EmptyState from '../EmptyState.svelte';

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
    rowActions = [],
    rowMeta = undefined,
    inspectorBody = undefined,
    bulk = undefined,
    selectedId = '',
    onSelect = () => {},
    armedToken = $bindable(''),
  } = $props();

  /**
   * The row class and the five hook names `BulkSelectionToolbar` wears here.
   *
   * STATED, never inherited. See the header: every one of these has a Component Studio default.
   */
  const TOOLBAR_ROW_CLASS = 'manager-scoped-list-filter-row';
  const TOOLBAR_ATTR = 'data-scoped-list-selection-toolbar';
  const PAGE_BOX_ATTR = 'data-scoped-list-select-all-page';
  const COUNT_ATTR = 'data-scoped-list-selection-count';
  const RESULTS_ATTR = 'data-scoped-list-select-all-results';
  const CLEAR_ATTR = 'data-scoped-list-clear-selection';

  const DEFAULT_PAGE_SIZE = 25;

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

  const model = createScopedEntityListModel();

  let query = $state('');
  let membership = $state('all');
  let filterValues = $state({});
  let sort = $state('name-asc');
  let pageIndex = $state(0);
  let pageSize = $state(DEFAULT_PAGE_SIZE);
  let selectedIds = $state(new Set());
  let inspectedId = $state('');
  /** @type {HTMLElement|null} */
  let inspectorElement = $state(null);

  const available = $derived(scope?.available === true);
  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const roster = $derived(Array.isArray(systems) ? systems : []);

  const membershipOptions = $derived(
    systemId ? SYSTEM_MEMBERSHIP_FILTERS : WORLD_MEMBERSHIP_FILTERS
  );

  const laneFilters = $derived(Array.isArray(filters) ? filters : []);
  const laneSorts = $derived(Array.isArray(sorts) ? sorts : []);

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
  const inspectedEntry = $derived(
    projected.rows.find((entry) => entry.id === (inspectedId || selectedId)) ?? null
  );

  // The clamp writes back, so the owner's state and the footer cannot disagree on the next pass.
  // Converges in one tick: once they are equal the effect assigns nothing.
  $effect(() => {
    if (page.pageIndex !== pageIndex) pageIndex = page.pageIndex;
  });

  // A filter that shrinks the list must not leave a phantom id in `Apply to {N}`. Guarded on
  // SIZE because `pruneBulkSelection` returns a new Set every call and an unguarded assignment
  // would re-trigger this effect forever.
  $effect(() => {
    const known = projected.rows.map((entry) => entry.id);
    const pruned = pruneBulkSelection(selectedIds, known);
    if (pruned.size !== selectedIds.size) selectedIds = pruned;
  });

  /**
   * Disarm. Any selection, filter, sort or page change clears the armed token, so a Remove armed
   * against one row cannot be confirmed against a different one after the list re-projects.
   */
  function disarm() {
    if (armedToken) armedToken = '';
  }

  function changeQuery(value) {
    query = String(value ?? '');
    pageIndex = 0;
    disarm();
  }

  function changeMembership(value) {
    membership = String(value ?? 'all');
    pageIndex = 0;
    disarm();
  }

  function changeFilter(id, value) {
    filterValues = { ...filterValues, [id]: String(value ?? '') };
    pageIndex = 0;
    disarm();
  }

  function changeSort(value) {
    sort = String(value ?? 'name-asc');
    pageIndex = 0;
    disarm();
  }

  function changePage(next) {
    pageIndex = next;
    disarm();
  }

  function changePageSize(next) {
    pageSize = next;
    pageIndex = 0;
    disarm();
  }

  function clearFilters() {
    query = '';
    membership = 'all';
    filterValues = {};
    pageIndex = 0;
    disarm();
  }

  function inspect(entityId) {
    inspectedId = entityId;
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

  function clearSelection() {
    selectedIds = new Set();
    disarm();
  }

  /**
   * The context every snippet receives.
   *
   * IT CARRIES THE WHOLE PROJECTION, on purpose. A conditionally present field — a tool's
   * `toolBreakage`, published only when the corpus holds one — is reachable through `ctx.scope`
   * without adding a shell prop for it or reaching around the shells for the store.
   *
   * `selected` is "in the write set", not "inspected": the two are different questions and the
   * inspected row is the one the body is rendering anyway. `member` and `systemRow` are the
   * addressed system's answers, so both are inert in world scope where there is no addressed
   * system.
   *
   * @param {object|null} entry
   * @returns {{scope: object|null, systems: object[], systemId: string, selected: boolean,
   *   member: boolean, systemRow: object|null}}
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
    };
  }

  /**
   * The thumbnail a row and an inspector header lead with.
   *
   * BY FIELD PRESENCE, never by entity type. A component and a tool lift `img`; an essence lifts
   * `icon`, which is a Font Awesome class rather than a path. `Medallion` renders the image when
   * `src` is truthy and the glyph otherwise, so reading both is the whole derivation.
   *
   * @param {object|null} entry
   * @returns {{src: string, icon: string, tint: string}}
   */
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

  function descriptionOf(entry) {
    const description = entry?.entity?.description;
    return typeof description === 'string' && description.trim()
      ? description
      : text('FABRICATE.Admin.Manager.Scoped.List.NoDescription', 'No description');
  }

  /**
   * Whether this entity's identity record actually names a source Item.
   *
   * Only asked when the DESCRIPTOR says the type has the fields at all: an essence carries none
   * of them, so a badge on an essence row would state the absence of something it never had.
   *
   * @param {object} entry
   * @returns {boolean}
   */
  function sourceLinkedRow(entry) {
    const entity = entry?.entity ?? null;
    return Boolean(
      entity?.originItemUuid ||
      entity?.registeredItemUuid ||
      (Array.isArray(entity?.aliasItemUuids) && entity.aliasItemUuids.length > 0)
    );
  }

  const membershipLabels = $derived({
    all: text('FABRICATE.Admin.Manager.Scoped.List.MembershipAll', 'All'),
    member: text('FABRICATE.Admin.Manager.Scoped.List.MembershipMember', 'In at least one system'),
    unused: text('FABRICATE.Admin.Manager.Scoped.List.MembershipUnused', 'In no system'),
    in: text('FABRICATE.Admin.Manager.Scoped.List.MembershipIn', 'In this system'),
    out: text('FABRICATE.Admin.Manager.Scoped.List.MembershipOut', 'Not in this system'),
  });

  const sortLabels = $derived({
    'name-asc': text('FABRICATE.Admin.Manager.Scoped.List.SortNameAsc', 'Name A–Z'),
    'name-desc': text('FABRICATE.Admin.Manager.Scoped.List.SortNameDesc', 'Name Z–A'),
    'systems-desc': text('FABRICATE.Admin.Manager.Scoped.List.SortSystemsDesc', 'Most systems'),
  });

  const sortOptions = $derived([
    ...Object.keys(sortLabels).map((id) => ({ id, label: sortLabels[id] })),
    ...laneSorts.map((descriptor) => ({ id: descriptor.id, label: descriptor.label })),
  ]);
</script>

<!--
  TWO ELEMENTS, AND THE SPLIT IS LOAD-BEARING. A container query NEVER matches the element that
  establishes the container — `@container` resolves against the nearest ANCESTOR container — so a
  `container-type` and an `@container` rule on one element silently resolve against something
  else. Here that something else is `.fabricate-manager`, which `styles/fabricate.css` declares as
  a named container: the query then measured the whole manager window instead of this column, and
  the stacked layout never applied at any width a GM can reach. The outer element is the container
  and the inner one is what the query lays out.
-->
<div class="manager-scoped-list-frame">
  <div class="manager-scoped-list-layout" class:has-inspector={Boolean(inspectorBody)}>
    {#if !available}
      <div class="manager-scoped-list-unavailable">
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
      <div class="manager-scoped-list-column">
        <section
          class="manager-toolbar manager-scoped-list-toolbar"
          data-scoped-list-toolbar
          aria-label={text('FABRICATE.Admin.Manager.Scoped.List.Filters', 'List filters')}
        >
          <div class={TOOLBAR_ROW_CLASS}>
            <label class="manager-search">
              <i class="fas fa-search" aria-hidden="true"></i>
              <input
                type="search"
                value={query}
                data-scoped-list-search
                placeholder={text(
                  'FABRICATE.Admin.Manager.Scoped.List.SearchPlaceholder',
                  'Search…'
                )}
                aria-label={text('FABRICATE.Admin.Manager.Scoped.List.SearchLabel', 'Search')}
                oninput={(event) => changeQuery(event.currentTarget.value)}
              />
            </label>

            <select
              value={membership}
              data-scoped-list-membership
              aria-label={text(
                'FABRICATE.Admin.Manager.Scoped.List.MembershipLabel',
                'Membership filter'
              )}
              onchange={(event) => changeMembership(event.currentTarget.value)}
            >
              {#each membershipOptions as option (option)}
                <option value={option}>{membershipLabels[option]}</option>
              {/each}
            </select>

            {#each laneFilters as filter (filter.id)}
              <select
                value={filterValues[filter.id] ?? 'all'}
                data-scoped-list-filter={filter.id}
                aria-label={filter.label}
                onchange={(event) => changeFilter(filter.id, event.currentTarget.value)}
              >
                {#each filter.options ?? [] as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            {/each}

            <select
              value={sort}
              data-scoped-list-sort
              aria-label={text('FABRICATE.Admin.Manager.Scoped.List.SortLabel', 'Sort order')}
              onchange={(event) => changeSort(event.currentTarget.value)}
            >
              {#each sortOptions as option (option.id)}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>
          </div>

          <BulkSelectionToolbar
            rowClass={TOOLBAR_ROW_CLASS}
            toolbarAttr={TOOLBAR_ATTR}
            pageBoxAttr={PAGE_BOX_ATTR}
            countAttr={COUNT_ATTR}
            resultsAttr={RESULTS_ATTR}
            clearAttr={CLEAR_ATTR}
            pageSelectionState={selection.pageSelectionState}
            count={selection.count}
            showSelectAllResults={selection.showSelectAllResults}
            selectAllResultsCount={selection.selectAllResultsCount}
            onTogglePage={togglePage}
            onSelectAllResults={selectAllResults}
            onClear={clearSelection}
          />
        </section>

        {#if bulk && !inspectorBody && selection.count > 0}
          <!-- With no inspector column there is nowhere else for a bulk body to go, so it sits
             directly under the toolbar that states the count it acts on. -->
          <section class="manager-scoped-list-bulk" data-scoped-list-bulk>
            {@render bulk([...selectedIds], rowContext(null))}
          </section>
        {/if}

        <div class="manager-scoped-list-rows">
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
                {@const name = scopedEntryName(entry)}
                <li
                  class="manager-scoped-list-row"
                  class:is-selected={inspected}
                  class:is-bulk-selected={bulkSelected}
                  data-scoped-list-row={entry.id}
                  data-scoped-list-bulk-selected={bulkSelected}
                  aria-current={inspected ? 'true' : undefined}
                >
                  <button
                    type="button"
                    class="manager-scoped-list-identity"
                    data-scoped-list-inspect={entry.id}
                    onclick={() => inspect(entry.id)}
                  >
                    <Medallion
                      src={thumbnail.src}
                      icon={thumbnail.icon}
                      tint={thumbnail.tint}
                      size={40}
                    />
                    <span class="manager-system-copy">
                      <span class="manager-system-name" title={name}>{name}</span>
                      <span class="manager-system-description" title={descriptionOf(entry)}>
                        {descriptionOf(entry)}
                      </span>
                    </span>
                  </button>

                  <!-- A `<div>`, not the `<span>` `ComponentRow` uses: a lane's `rowMeta` — and the
                     rules-list shell's own `InheritRow` — render block elements, and a `<div>`
                     inside a `<span>` is invalid nesting the browser silently reparents. -->
                  <div class="manager-scoped-list-row-meta">
                    {#if scope?.sourceLinked === true}
                      <span
                        class="manager-scoped-list-source"
                        data-scoped-list-source={sourceLinkedRow(entry) ? 'linked' : 'unlinked'}
                      >
                        <StatusPill
                          tone={sourceLinkedRow(entry) ? 'subtle' : 'warning'}
                          icon={sourceLinkedRow(entry) ? 'fas fa-link' : 'fas fa-link-slash'}
                          label={sourceLinkedRow(entry)
                            ? text('FABRICATE.Admin.Manager.Scoped.List.SourceLinked', 'Linked')
                            : text(
                                'FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked',
                                'No source item'
                              )}
                        />
                      </span>
                    {/if}
                    {#if rowMeta}{@render rowMeta(entry, rowContext(entry))}{/if}
                  </div>

                  <span class="manager-action-group">
                    {#each rowActions as action (action.id)}
                      <button
                        type="button"
                        class="manager-icon-button"
                        data-scoped-list-action={action.id}
                        aria-label={`${action.label} — ${name}`}
                        title={action.label}
                        onclick={() => action.run(entry)}
                      >
                        <i class={action.icon} aria-hidden="true"></i>
                      </button>
                    {/each}
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
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <Pagination
          persistent={true}
          totalCount={page.totalCount}
          pageIndex={page.pageIndex}
          {pageSize}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
        />
      </div>

      {#if inspectorBody}
        <aside
          class="manager-scoped-list-inspector"
          bind:this={inspectorElement}
          tabindex="-1"
          data-scoped-list-inspector
          aria-label={text('FABRICATE.Admin.Manager.Scoped.List.Inspector', 'Details')}
        >
          {#if bulk && selection.count > 0}
            {@render bulk([...selectedIds], rowContext(null))}
          {:else if inspectedEntry}
            {@const thumbnail = thumbnailOf(inspectedEntry)}
            <div class="manager-inspector-title-row">
              <span class="manager-inspector-icon">
                <Medallion
                  src={thumbnail.src}
                  icon={thumbnail.icon}
                  tint={thumbnail.tint}
                  size={42}
                />
              </span>
              <span class="manager-inspector-copy">
                <span class="manager-inspector-name" data-scoped-list-inspector-name>
                  {scopedEntryName(inspectedEntry)}
                </span>
                <span class="manager-system-description">{descriptionOf(inspectedEntry)}</span>
              </span>
            </div>
            {@render inspectorBody(inspectedEntry, rowContext(inspectedEntry))}
          {:else}
            <EmptyState
              compact
              {icon}
              title={text('FABRICATE.Admin.Manager.Scoped.List.RestingTitle', 'Nothing selected')}
              hint={subtitle}
              dataAttr="data-scoped-list-inspector-state"
              dataValue="resting"
            />
          {/if}
        </aside>
      {/if}
    {/if}
  </div>
</div>

<style>
  /* THE FRAME IS ITS OWN CONTAINER. `.manager-body` is `220px minmax(0,1fr) 300px`, and under the
     released full-width classification `<main>` is the list column plus the freed 300px — so the
     budget this frame lays out against is the main column's inline size, not the window's. A
     `container-type: inline-size` root and a container query are what make that measurable from
     here rather than from a closed stylesheet. */
  .manager-scoped-list-frame {
    container-type: inline-size;
    display: block;
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

  /* 300px, matching the shared aside this column stands in for, so a GM sees ONE inspector width
     across both scopes rather than learning a second one per screen. */
  .manager-scoped-list-layout.has-inspector {
    grid-template-columns: minmax(0, 1fr) 300px;
  }

  .manager-scoped-list-column {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-list-rows {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  .manager-scoped-list-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 10px;
    background: var(--fab-mv2-surface-1);
    overflow-y: auto;
  }

  /* The landmark is a focus TARGET, not a tab stop, so the ring is drawn only for a
     keyboard-driven landing. */
  .manager-scoped-list-inspector:focus {
    outline: none;
  }

  .manager-scoped-list-inspector:focus-visible {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  .manager-scoped-list-unavailable,
  .manager-scoped-list-bulk {
    min-width: 0;
  }

  /* BELOW THE THRESHOLD THE INSPECTOR STACKS UNDER THE LIST rather than compressing to a column
     too narrow to read a name in. 760px is the list column's own floor plus the 300px inspector
     and the gap between them; under it the two-track grid would put both below their minimums at
     once, which is worse than one full-width column followed by the panel. */
  @container (max-width: 760px) {
    .manager-scoped-list-layout.has-inspector {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
