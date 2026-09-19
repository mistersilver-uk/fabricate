<script>
  import EmptyState from '../../components/EmptyState.svelte';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import CollapsibleGroupHeader from '../../components/CollapsibleGroupHeader.svelte';
  import SegmentedControl from '../../components/SegmentedControl.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import ComponentRow from './components/ComponentRow.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import { createBulkSelection } from './bulkSelection.svelte.js';
  import {
    COMPONENT_DEFAULT_PAGE_SIZE,
    COMPONENT_ESSENCE_FILTER_ANY,
    COMPONENT_ESSENCE_FILTER_NONE,
    COMPONENT_SORT_KEYS,
    buildComponentBrowserModel,
    componentCategoryOptions,
    componentEssenceRun,
    createComponentBrowserState,
    groupComponentsByCategory,
  } from '../../../model/componentBrowserModel.js';
  import { getComponentCategoryLabel } from '../../../../utils/componentCategories.js';
  import {
    componentCohortCountText,
    componentMembershipFilters,
  } from './scoped/componentScoped.js';

  /** The world entry route a GHOST ROW opens; the one string deciding whether the link resolves. */
  const WORLD_ENTRY_ROUTE = 'world-component-entry';

  let {
    itemCards = [],
    itemSearchTerm = '',
    selectedComponentId = '',
    selectedSystemId = '',
    // Three of the four keys the call site's component bundle spreads. `systems` stays undeclared, as
    // the sibling Tool Rules list leaves it: a name the site does NOT pass falls through to the
    // spread and makes every reader a live subscriber to the whole bundle. `systemId` is read rather
    // than inferred, because `scope.entries[].systems[]` is the world projection's own JOIN.
    scope = null,
    actions = null,
    systemId = '',
    // eslint-disable-next-line no-unused-vars -- deliberately reader-less; see the note below
    selectedSystemResolutionMode = 'simple',
    // Whether the system is progressive on ANY axis that reads `component.difficulty` (issue 772);
    // gated on the crafting mode alone, the row's DC badge vanished on a salvage-only system. It has
    // no reader here and is kept as a NEGATIVE CONTROL for the re-gate mounted test.
    difficultyAxisProgressive = false,
    categoryVocabulary = [],
    dropEnabled = false,
    onSearchChange = () => {},
    onSelectComponent = () => {},
    onDropComponent = () => {},
    onEditComponent = () => {},
    // Told AFTER the toolbar's Clear has emptied the selection (issue 1157): the clear stays this
    // browser's, but emptying the selection unmounts the panel and the button that was pressed.
    onSelectionCleared = null,
    // The deep link into the world catalogue entry that AUTHORS a record's identity. Called with the
    // ROUTE TOKEN and the entity id.
    onOpenWorldEntry = () => {},
    // The filter / sort / group / paginate view-state (issue 676), lifted by the manager root and
    // bound here so it survives the editor round-trip.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createComponentBrowserState());
  // The root's lifted object when bound, else the local fallback. Both are `$state` proxies, so
  // nested writes are reactive and, when bound, propagate back to the root.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the filters — they name a vocabulary the new system does not share.
  // The page, sort and group PREFERENCES are deliberately kept.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.categoryFilter = 'all';
    ui.essenceFilter = 'all';
    ui.pageIndex = 0;
    // The bulk selection is scoped to the selected system, so a switch resets it SILENTLY and
    // the root discards the staged draft when the count reaches zero (issue 772).
    selection.reset();
    ui.systemId = selectedSystemId;
  });

  // The filter reads the run the ROWS draw (`essenceChips`), not the resolved map the editor is
  // seeded from: `ui-integration` requirement 2's one-function rule exists to prevent that divergence.
  const showComponentEssences = $derived(
    (itemCards || []).some((item) => item.showEssences || componentEssenceRun(item).length > 0)
  );
  const componentEssenceOptions = $derived(
    uniqueSorted(
      (itemCards || []).flatMap((item) =>
        componentEssenceRun(item).map((essence) => essence.name || essence.id)
      )
    )
  );
  const categoryOptions = $derived(componentCategoryOptions(itemCards || [], categoryVocabulary));

  // The world projection's per-system join, indexed by world entity id. A Map rather than a `find`
  // per row, which would walk the whole corpus once per component on every republish.
  const worldRowsByComponentId = $derived(
    new Map(
      (Array.isArray(scope?.entries) ? scope.entries : []).map((entry) => [
        String(entry?.id ?? ''),
        (Array.isArray(entry?.systems) ? entry.systems : []).find(
          (row) => row?.systemId === systemId
        ) ?? null,
      ])
    )
  );

  // `all` is the one control that changes what a row IS: it widens to world records this system has
  // no rules for, the only route here to adopting one. The shipped `Overriding` option was a
  // predicate over the member cohort, not a cohort, and is gone. Held locally, not lifted, because
  // `createComponentBrowserState` declares no such key.
  let membershipFilter = $state('in');
  const allWorldCohort = $derived(membershipFilter === 'all');

  const systemComponentIds = $derived(
    new Set((itemCards || []).map((item) => String(item?.id ?? '')))
  );

  /** The world records this system has NO component for, in the SAME row shape the member rows use:
      `member: false`, with no category, essence, difficulty or salvage answer, because each is a
      MEMBERSHIP fact. They keep identity, because the reference draws the ghost as the dimmed row. */
  const ghostRows = $derived(
    (Array.isArray(scope?.entries) ? scope.entries : [])
      .filter((entry) => !systemComponentIds.has(String(entry?.id ?? '')))
      .map((entry) => ({
        id: String(entry?.id ?? ''),
        member: false,
        name: entry?.entity?.name || String(entry?.id ?? ''),
        img: entry?.entity?.img || '',
        description: entry?.entity?.description || '',
        search: `${entry?.entity?.name ?? ''} ${entry?.entity?.description ?? ''}`.toLowerCase(),
      }))
  );

  const membershipFilters = $derived(
    componentMembershipFilters({
      members: (itemCards || []).length,
      world: (itemCards || []).length + ghostRows.length,
    })
  );

  /** The ghost half of the cohort, after the membership segment and the search term. The zero state
      is gated on the COHORT and not the raw prop, or the toolbar reads `3 shown` over a body drawing
      the zero state and adoption into an empty system becomes unreachable. */
  const visibleGhostRows = $derived(
    allWorldCohort
      ? ghostRows.filter((row) => {
          const needle = String(itemSearchTerm || '')
            .trim()
            .toLowerCase();
          return !needle || row.search.includes(needle);
        })
      : []
  );

  const model = $derived(
    buildComponentBrowserModel(itemCards || [], {
      category: ui.categoryFilter,
      essence: ui.essenceFilter,
      // Not applied as a filter here (the store searches before projecting).
      search: itemSearchTerm,
      sortKey: ui.sortKey,
      sortDirection: ui.sortDirection,
      pageIndex: ui.pageIndex,
      pageSize: ui.pageSize,
      groupByCategory: ui.groupByCategory,
    })
  );
  const filteredComponents = $derived(model.filtered);

  // ONE WINDOW OVER THE WHOLE COHORT: the pager and the body have to count the same list. With the
  // ghost half rendered unpaginated, a widened cohort drew every remaining world component under a
  // pager reading `1–10 of 8`. The cohort is `sorted MEMBERS then GHOSTS`, so a page can hold either
  // half or the boundary — and the shared `buildComponentBrowserModel`'s own `pageIndex`, `pageCount`
  // and `rangeStart/End` describe the member half only and must not be read below.
  const cohortPageSize = $derived(
    Math.max(1, Math.trunc(Number(ui.pageSize)) || COMPONENT_DEFAULT_PAGE_SIZE)
  );
  const memberCount = $derived(model.totalCount);
  const cohortTotalCount = $derived(memberCount + visibleGhostRows.length);
  const cohortPageCount = $derived(Math.max(1, Math.ceil(cohortTotalCount / cohortPageSize)));
  const cohortPageIndex = $derived(
    Math.min(Math.max(0, Math.trunc(Number(ui.pageIndex)) || 0), cohortPageCount - 1)
  );
  const cohortWindowStart = $derived(cohortPageIndex * cohortPageSize);
  const cohortWindowEnd = $derived(cohortWindowStart + cohortPageSize);
  // `slice` clamps both bounds, so a window entirely past the members answers `[]` here.
  const memberWindow = $derived(model.sorted.slice(cohortWindowStart, cohortWindowEnd));
  const ghostWindow = $derived(
    visibleGhostRows.slice(
      Math.max(0, cohortWindowStart - memberCount),
      Math.max(0, cohortWindowEnd - memberCount)
    )
  );
  // The expensive half of a component card — linked source document, "Missing" badge, live
  // description fallback — is resolved for the PAGE and nothing else (issue 1081). `hydrate()` is
  // memoized per card and is called off the card rather than through the projection's helper: that
  // store module would enter every mounted suite rendering this tree, where a module missing from
  // the harness allowlist HANGS the suite as `# cancelled`.
  $effect(() => {
    for (const card of memberWindow) card?.hydrate?.()?.catch?.(() => {});
  });
  const page = $derived({
    components: memberWindow,
    pageIndex: cohortPageIndex,
    pageCount: cohortPageCount,
    totalCount: cohortTotalCount,
    rangeStart: cohortTotalCount === 0 ? 0 : cohortWindowStart + 1,
    rangeEnd: Math.min(cohortWindowEnd, cohortTotalCount),
  });
  // Grouped over the cohort WINDOW, not the model's page, so the headers describe the rows drawn.
  // `categoryTotals` stays the model's: a header states its bucket's size in the whole FILTERED
  // cohort (issue 676).
  const groups = $derived(
    ui.groupByCategory ? groupComponentsByCategory(memberWindow, model.categoryTotals) : []
  );

  // Bulk selection (issue 772). `pageIds` is the set of RENDERED MEMBER row ids: ghost rows carry no
  // selection box, because the prune below drops every id the system has no component for.
  const filteredIds = $derived(filteredComponents.map((item) => item.id));
  const pageIds = $derived(
    ui.groupByCategory
      ? groups.flatMap((group) => group.components.map((item) => item.id))
      : page.components.map((item) => item.id)
  );
  const selection = createBulkSelection({
    state: () => ui,
    key: 'bulkSelectedComponentIds',
    filteredIds: () => filteredIds,
    pageIds: () => pageIds,
    onCleared: () => onSelectionCleared?.(),
  });
  const bulkSelectedIds = $derived(selection.selectedIds);
  const selectionSummary = $derived(selection.summary);

  // A delete, unlink or store refresh must never leave a phantom id in the count or in an `Apply`.
  // The early return keeps the effect from subscribing to the corpus while nothing is selected.
  $effect(() => {
    if (selection.selectedIds.size === 0) return;
    selection.prune((itemCards || []).map((item) => item.id));
  });

  // NOT lifted: the "nothing is selected, pick the first row" guard names one mount's auto-selection
  // rather than anything the GM chose.
  let autoSelectedComponentId = $state('');

  $effect(() => {
    // A selection this system holds a row for is NEVER moved — not by a sort, filter, page turn or
    // cohort segment. The root clears the id on a system switch, and a deleted row leaves a dangling
    // one; both read as "nothing is selected".
    if ((itemCards || []).some((item) => item.id === selectedComponentId)) {
      autoSelectedComponentId = '';
      return;
    }
    // The first row the GM is LOOKING at, read off `pageIds` — the member rows the body draws, in
    // its order; the root's inspector fallback answers the manager's STORED order, so the panel
    // opened on one component while the list's first row was another. A ghost is never selected.
    const firstId = pageIds[0] || '';
    if (!firstId || autoSelectedComponentId === firstId) return;
    autoSelectedComponentId = firstId;
    onSelectComponent(firstId);
  });

  const sortOptions = $derived(
    COMPONENT_SORT_KEYS.map((key) => ({
      key,
      label: sortLabel(key),
    }))
  );

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // `replacements` tolerates absence: a bare `Object.entries(replacements)` THROWS on a two-argument
  // call, several strings here carry no token, and a throw in a render kills the route.
  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements ?? {})) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  function sortLabel(key) {
    const labels = {
      name: text('FABRICATE.Admin.Manager.Component.SortName', 'Name'),
      category: text('FABRICATE.Admin.Manager.Component.SortCategory', 'Category'),
      essences: text('FABRICATE.Admin.Manager.Component.SortEssences', 'Essences'),
      tags: text('FABRICATE.Admin.Manager.Component.SortTags', 'Tags'),
      salvage: text('FABRICATE.Admin.Manager.Component.SortSalvage', 'Salvage'),
    };
    return labels[key] || key;
  }

  function categoryLabel(category) {
    return getComponentCategoryLabel(category, localize);
  }

  function uniqueSorted(values) {
    return Array.from(
      new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  function isSelectedComponent(item) {
    return !!selectedComponentId && item.id === selectedComponentId;
  }

  function setCategoryFilter(value) {
    ui.categoryFilter = value;
    ui.pageIndex = 0;
  }

  function setEssenceFilter(value) {
    ui.essenceFilter = value;
    ui.pageIndex = 0;
  }

  function setSortKey(value) {
    ui.sortKey = value;
    ui.pageIndex = 0;
  }

  function toggleSortDirection() {
    ui.sortDirection = ui.sortDirection === 'asc' ? 'desc' : 'asc';
  }

  function toggleGroupByCategory() {
    ui.groupByCategory = !ui.groupByCategory;
  }

  // The group header's count is a bare numeral: the band's subject is the noun. The `of` form
  // survives because this view groups the PAGE, so a category spanning a page boundary would
  // otherwise report the slice as the whole bucket.
  function groupCountText(group) {
    const count = group.components.length;
    const total = group.total ?? count;
    if (total > count) {
      return format(
        'FABRICATE.Admin.Manager.Component.GroupCountOfTotalBare',
        '{count} of {total}',
        { count, total }
      );
    }
    return String(count);
  }

  function clearFilters() {
    ui.categoryFilter = 'all';
    ui.essenceFilter = 'all';
    ui.pageIndex = 0;
    onSearchChange('');
  }

  // Progressive-difficulty parity with the component editor (issue 651, re-gated for issue 772),
  // shown on any axis reading `component.difficulty`. It reads "None" where the axis is on and the
  // component has no difficulty.
  const showProgressiveDifficulty = $derived(difficultyAxisProgressive === true);

  function difficultyBadgeFor(item) {
    if (!showProgressiveDifficulty) return '';
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) && difficulty >= 1
      ? String(difficulty)
      : text('FABRICATE.Admin.Manager.Component.DifficultyNone', 'None');
  }

  // The `Recipes` column's value: the world projection's own per-system count, built once per
  // refresh. Re-deriving it would walk the corpus once per rendered component.
  function recipesValueFor(id) {
    const row = worldRowsByComponentId.get(String(id || ''));
    const count = Number(row?.recipeCount);
    return Number.isFinite(count) ? String(count) : '0';
  }

  const recipesLabel = $derived(text('FABRICATE.Admin.Manager.Component.RecipesStat', 'Recipes'));
  const salvageLabel = $derived(text('FABRICATE.Admin.Manager.Component.SalvagePill', 'Salvage'));
  // The em dash the ghost row draws in the `Recipes` column; a hyphen would read as a minus sign.
  const NO_VALUE = '—';

  /** One MEMBER row's props. */
  function rowProps(item) {
    return {
      component: item,
      member: true,
      selected: isSelectedComponent(item),
      difficultyBadge: difficultyBadgeFor(item),
      difficultyBadgeTitle: text(
        'FABRICATE.Admin.Manager.Component.ProgressiveDifficulty',
        'Progressive difficulty'
      ),
      salvageLabel: item?.salvageSummary ? salvageLabel : '',
      recipesValue: recipesValueFor(item?.id),
      recipesLabel,
      editLabel: text('FABRICATE.Admin.Manager.Component.EditRules', 'Edit rules'),
      editNamedLabel: format('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}', {
        name: item.name,
      }),
      noDescriptionText: text('FABRICATE.Admin.Manager.NoDescription', 'No description'),
      bulkSelected: bulkSelectedIds.has(item.id),
      selectLabel: format(
        'FABRICATE.Admin.Manager.BulkEdit.SelectRow',
        'Select {name} for bulk edit',
        { name: item.name }
      ),
      onSelect: onSelectComponent,
      onEdit: onEditComponent,
      onToggleSelect: selection.toggle,
    };
  }

  /** One GHOST row's props — the same row, dimmed and stated. Adoption is two writes and this calls
      ONE key: `actions.addToSystem` writes the membership record AND the in-system record. */
  function ghostRowProps(ghost) {
    return {
      component: ghost,
      member: false,
      notInSystemLabel: text('FABRICATE.Admin.Manager.Component.GhostPill', 'Not in this system'),
      recipesValue: NO_VALUE,
      recipesLabel,
      noDescriptionText: text(
        'FABRICATE.Admin.Manager.Component.GhostNoDescription',
        'No description yet.'
      ),
      addLabel: text('FABRICATE.Admin.Manager.Component.GhostAdd', 'Add to system'),
      addNamedLabel: format(
        'FABRICATE.Admin.Manager.Component.GhostAddNamed',
        'Add {name} to this system',
        { name: ghost.name }
      ),
      // A ghost row's identity opens the world catalogue ENTRY, not the in-system selection:
      // `onSelectComponent` writes `selectedComponentId`, which the inspector resolves against THIS
      // system's row set, and a ghost has no row there. (The reference selects a ghost into its own
      // inspector; Fabricate's cannot. Recorded as a deviation.)
      onSelect: (id) => onOpenWorldEntry(WORLD_ENTRY_ROUTE, id),
      onAdd: (id) => actions?.addToSystem?.(id, systemId),
    };
  }

  const countText = $derived(
    componentCohortCountText(
      {
        allWorld: allWorldCohort,
        // `shown` IS the window, both halves; `mine` and `all` are the unwindowed cohort totals.
        shown: page.components.length + ghostWindow.length,
        total: (itemCards || []).length,
        mine: (itemCards || []).length,
        all: (itemCards || []).length + ghostRows.length,
      },
      format
    )
  );
</script>

<!-- There is ONE page header, and the shell owns it. -->
<main
  class="manager-main"
  data-component-library
  aria-label={text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}
>
  <!--
    ONE HEAD, AND THE CHILD COUNT IS THE POINT. `.manager-main` on this route is a four-track grid
    for four children: this head, the toolbar, the list and the pager. A fifth DIRECT child pushes
    every child down one track and the toolbar lands in a `minmax(0, 1fr)` track that collapses. The
    `SharedDefinitionCallout` that used to head this pane is gone — its content is the inspector's
    `Shared identity` card — and the drop zone stays under maintainer ruling M2.
  -->
  <div class="manager-component-head">
    <section
      class="manager-component-drop-zone"
      use:dragDrop={{
        onDrop: onDropComponent,
        disabled: !dropEnabled,
        activeClass: 'is-drop-active',
      }}
      aria-label={text(
        'FABRICATE.Admin.Manager.Component.DropZoneLabel',
        'Drop Foundry items to add components'
      )}
    >
      <i class="fas fa-download" aria-hidden="true"></i>
      <span>
        <strong
          >{text(
            'FABRICATE.Admin.Manager.Component.DropZoneTitle',
            'Drop items to add components'
          )}</strong
        >
        <small
          >{text(
            'FABRICATE.Admin.Manager.Component.DropZoneHint',
            'World, compendium, pack, or folder drops use the existing component import flow for the selected system.'
          )}</small
        >
      </span>
    </section>
  </div>

  <!--
    TWO TOOLBAR ROWS, NOT FOUR. Row one is the three controls that narrow the list plus the cohort
    switch that widens it; row two carries the selection register, the two VIEW controls and the
    count. The active-filter CHIP row is gone: each filter shows its state in the control that set it.
  -->
  <!-- `tabindex="-1"` makes this landmark a FOCUS TARGET without making it a tab stop (issue 1157).
       The manager root lands the keyboard here when an action empties the bulk selection. -->
  <ManagerToolbar
    class="manager-component-toolbar"
    tabindex="-1"
    data-keyboard-focus="true"
    data-component-toolbar=""
    ariaLabel={text('FABRICATE.Admin.Manager.Component.Filters', 'Component filters')}
  >
    <div class="manager-component-filter-row">
      <!--
        THREE CONTROLS AT 38px, a published rung (26 / 28 / 30 / 34 / 38 / 44) and what the reference
        draws: the field takes `size="38"` and each select carries `is-size-38`. The asymmetry is the
        tree's shape — `ManagerSearchField` owns its own class list, while the manager has no select
        COMPONENT because the control beside the field is three different things across eleven bars.
        NEITHER IS A LOCAL HEIGHT: `.manager-toolbar select.is-size-38` is (0,3,1) and beats this
        bar's own (0,2,1) 34px rule, so it lands wherever the class is written.
      -->
      <!-- The capture registry's narrowing hook: a case that has to reach a specific component types
           into this field rather than depending on where that component happens to sort. -->
      <ManagerSearchField
        size="38"
        data-component-search=""
        value={itemSearchTerm || ''}
        onInput={(next) => onSearchChange(next)}
        placeholder={text(
          'FABRICATE.Admin.Manager.Component.SearchPlaceholder',
          'Search name or tags…'
        )}
        ariaLabel={text('FABRICATE.Admin.Manager.Component.SearchLabel', 'Search components')}
      />

      <!-- Bare: the `aria-label` is the select's accessible name. A filter bar whose controls each
           announce themselves in sentence case reads as a form. -->
      <select
        class="manager-component-category-filter is-size-38"
        data-component-category-filter
        value={ui.categoryFilter}
        onchange={(event) => setCategoryFilter(event.currentTarget.value)}
        aria-label={text(
          'FABRICATE.Admin.Manager.Component.CategoryFilterLabel',
          'Filter components by category'
        )}
      >
        <option value="all"
          >{text('FABRICATE.Admin.Manager.Component.CategoryAll', 'All categories')}</option
        >
        {#each categoryOptions as category (category.name)}
          <option value={category.name}>{categoryLabel(category.name)} ({category.count})</option>
        {/each}
      </select>

      {#if showComponentEssences && componentEssenceOptions.length > 0}
        <select
          class="manager-component-essence-filter is-size-38"
          data-component-essence-filter
          value={ui.essenceFilter}
          onchange={(event) => setEssenceFilter(event.currentTarget.value)}
          aria-label={text(
            'FABRICATE.Admin.Manager.Component.EssenceFilterLabel',
            'Filter components by essence'
          )}
        >
          <option value="all"
            >{text('FABRICATE.Admin.Manager.Component.EssenceAll', 'All essences')}</option
          >
          <!-- The reference's two PREDICATES ahead of the per-essence entries. Their values are
               the model's sentinels, not names. -->
          <option value={COMPONENT_ESSENCE_FILTER_ANY}
            >{text('FABRICATE.Admin.Manager.Component.EssenceAny', 'Carries any essence')}</option
          >
          <option value={COMPONENT_ESSENCE_FILTER_NONE}
            >{text('FABRICATE.Admin.Manager.Component.EssenceNone', 'No essences')}</option
          >
          {#each componentEssenceOptions as essence (essence)}
            <option value={essence}>{essence}</option>
          {/each}
        </select>
      {/if}

      <!-- THE COHORT SWITCH, as the two-segment inline filter the reference draws rather than the
        `<select>` that shipped; the per-segment count rides the primitive's `badge`. -->
      <SegmentedControl
        options={membershipFilters}
        value={membershipFilter}
        density="compact"
        tone="accent"
        groupName="component-membership"
        dataAttr="data-component-membership-filter"
        optionDataAttr="data-component-membership-option"
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Component.MembershipFilterLabel',
          'Filter components by world membership'
        )}
        onChange={(next) => {
          membershipFilter = next;
          ui.pageIndex = 0;
        }}
      />
    </div>

    <div class="manager-component-filter-row is-secondary">
      <!--
        THE SELECTION REGISTER, INLINE AND FIRST, as the reference draws it: once a row is ticked the
        SAME register grows the accent count, the standing sentence and the two trailing text actions.
        `rowClass` is a `display: contents` shim, so the primitive's children become items of THIS row
        rather than a nested bar with its own metrics.
      -->
      <BulkSelectionToolbar
        rowClass="manager-component-selection-inline"
        pageSelectionState={selectionSummary.pageSelectionState}
        count={selectionSummary.count}
        showSelectAllResults={selectionSummary.showSelectAllResults}
        selectAllResultsCount={selectionSummary.selectAllResultsCount}
        countIcon="fas fa-check-double"
        bareActions
        trailingActions
        hint={text(
          'FABRICATE.Admin.Manager.Component.BulkInInspector',
          'Bulk actions are in the inspector →'
        )}
        onTogglePage={selection.setPageSelected}
        onSelectAllResults={selection.selectAllResults}
        onClear={selection.clear}
      />
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <div class="manager-component-filter-field">
        <span class="manager-component-filter-label" id="manager-component-group-label"
          >{text('FABRICATE.Admin.Manager.Component.GroupByCategory', 'Group by category')}</span
        >
        <!-- `data-component-group-by-category=""` rather than the bare attribute: on a COMPONENT a
             bare attribute is the boolean `true`, which the rest spread would stamp as `="true"`. -->
        <StatusToggle
          on={ui.groupByCategory}
          data-component-group-by-category=""
          aria-labelledby="manager-component-group-label"
          onclick={toggleGroupByCategory}
        />
      </div>
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <div class="manager-component-filter-field">
        <span class="manager-component-filter-label"
          >{text('FABRICATE.Admin.Manager.Component.SortBy', 'Sort by')}</span
        >
        <select
          value={ui.sortKey}
          data-component-sort
          onchange={(event) => setSortKey(event.currentTarget.value)}
          aria-label={text('FABRICATE.Admin.Manager.Component.SortLabel', 'Sort components')}
        >
          {#each sortOptions as option (option.key)}
            <option value={option.key}>{option.label}</option>
          {/each}
        </select>
        <ManagerButton
          class="manager-component-sort-direction"
          data-component-sort-direction={ui.sortDirection}
          aria-label={text(
            'FABRICATE.Admin.Manager.Component.SortDirection',
            'Toggle sort direction'
          )}
          onclick={toggleSortDirection}
        >
          <!-- The alphabetical pair the reference draws and the sibling lists already draw; this
               bar drew the AMOUNT pair. -->
          <i
            class={ui.sortDirection === 'asc' ? 'fas fa-arrow-down-a-z' : 'fas fa-arrow-up-a-z'}
            aria-hidden="true"
          ></i>
          <span
            >{ui.sortDirection === 'asc'
              ? text('FABRICATE.Admin.Manager.Component.SortAsc', 'Asc')
              : text('FABRICATE.Admin.Manager.Component.SortDesc', 'Desc')}</span
          >
        </ManagerButton>
      </div>
      <!-- THE COUNT AND THE BODY AGREE, IN BOTH COHORTS: `{shown} of {total} catalogue entries`, or
        `{shown} shown · {mine} of {all} in this system` once widened, over the rows actually drawn. -->
      <span class="manager-component-count" data-component-count>{countText}</span>
    </div>
  </ManagerToolbar>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Component.Table', 'Components')}
  >
    <!-- THE ZERO STATE IS GATED ON THE COHORT, never on the raw prop: an empty system under `All
      world components` drew the zero state over a toolbar counting three rows, and adoption into an
      empty system became unreachable. -->
    {#if (itemCards || []).length === 0 && visibleGhostRows.length === 0}
      <EmptyState
        icon="fas fa-box-open"
        title={text('FABRICATE.Admin.Manager.Component.EmptyTitle', 'No components yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Component.EmptyHint',
          'Drop Foundry items into this page to add components to the selected system.'
        )}
      />
    {:else if filteredComponents.length === 0 && visibleGhostRows.length === 0}
      <!-- A filtered-to-nothing library is not an error state and does not want the full
           empty-panel apparatus: one dashed panel says it, and Clear filters is the way out. -->
      <EmptyState
        filtered
        hint={text(
          'FABRICATE.Admin.Manager.Component.EmptySearchTitle',
          'No components match these filters.'
        )}
      >
        <ManagerButton data-clear-filters="components" onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</ManagerButton
        >
      </EmptyState>
    {:else}
      <!-- A card row has no columns, so this is a LIST, not a grid: a real `<ul role="list">`
           of `<li>` cards carrying `aria-current`. -->
      <div class="manager-components-list">
        {#if ui.groupByCategory}
          {#each groups as group (group.category)}
            <section class="manager-component-group" data-component-group={group.category}>
              <!-- NO DISCLOSURE CHEVRON, AND NOT A BUTTON: the reference draws a folder glyph, the
                category name and a bare mono count on a `surface-soft` band, and nothing expands.
                `collapsible={false}` is the primitive's own answer. -->
              <CollapsibleGroupHeader
                collapsible={false}
                name={categoryLabel(group.category)}
                countText={groupCountText(group)}
              />
              <ul class="manager-component-group-body" role="list">
                {#each group.components as item (item.id)}
                  <ComponentRow {...rowProps(item)} />
                {:else}
                  <li class="manager-muted manager-component-group-empty">
                    {text(
                      'FABRICATE.Admin.Manager.Component.EmptyCategory',
                      'No components in this category.'
                    )}
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        {:else}
          <ul class="manager-component-group-body" role="list">
            {#each page.components as item (item.id)}
              <ComponentRow {...rowProps(item)} />
            {/each}
          </ul>
        {/if}

        <!--
          THE GHOST COHORT: world components this system has no rules record for, drawn as THE SAME
          ROW, dimmed and stated — medallion, copy column and `Recipes` column stay, the pill reads
          `Not in this system`, the second line is the WORLD description and the trailing control is
          a dashed `+ Add to system`. THEY CARRY NO SELECTION BOX, because the prune effect above
          drops every selected id the system has no component for; the one knowing divergence from
          C6's row table. They are their own list AFTER the member one rather than folded into the
          model, which would put unadoptable rows through a grouping and a sort that mean nothing for
          them — but they are STILL PAGED through the same window.
        -->
        {#if ghostWindow.length > 0}
          <ul
            class="manager-component-group-body manager-component-ghost-body"
            data-component-ghost-body
            role="list"
            aria-label={text(
              'FABRICATE.Admin.Manager.Component.GhostListLabel',
              'World components this system has no rules for'
            )}
          >
            {#each ghostWindow as ghost (ghost.id)}
              <ComponentRow {...ghostRowProps(ghost)} />
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={page.totalCount}
    pageSize={ui.pageSize}
    pageIndex={page.pageIndex}
    onPageChange={(next) => (ui.pageIndex = next)}
    onPageSizeChange={(next) => {
      ui.pageSize = next;
      ui.pageIndex = 0;
    }}
  />
</main>

<style>
  /* STATIC class names, so Svelte can prove each selector used and `lint:svelte:warnings` stays at
     zero. Only the surfaces this change ADDS are declared here; the rest stay in the sheet. */

  /* The head wrapper exists to hold `.manager-main`'s child count at four; the column and the gap
     are what its child had as a sibling of the grid. */
  .manager-component-head {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* THE SELECTION REGISTER'S SHIM: `display: contents` removes `BulkSelectionToolbar`'s own box from
     the layout so its children become flex items of the toolbar row that hosts it. `:global()` is
     REQUIRED — that component renders the element, so Svelte's scoping hash never reaches it. */
  :global(.manager-component-selection-inline) {
    display: contents;
  }

  /* The register's `Select all` takes the solid secondary ink rather than the shared register's muted
     alpha of it (UX F-K). IT CANNOT BE WRITTEN IN `styles/fabricate.css`: `BulkSelectionToolbar`
     states this ink in its own scoped block, which Svelte injects UNLAYERED, while the sheet is
     imported at `layer(modules)`, so a sheet-authored override would match and silently lose. It is
     scoped to THIS register rather than to `.fab-bulk-selection-all`, which the Recipe Studio and the
     Essence library draw too. `:global()` for the reason the shim above gives. */
  :global(.fabricate-manager .manager-component-selection-inline .fab-bulk-selection-all) {
    color: var(--fab-text-secondary);
  }
</style>
