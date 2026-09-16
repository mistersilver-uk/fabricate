<!-- Svelte 5 runes mode -->
<script>
  import EmptyState from './EmptyState.svelte';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import CollapsibleGroupHeader from '../../components/CollapsibleGroupHeader.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import ComponentRow from './components/ComponentRow.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import {
    describeComponentSelection,
    pruneComponentSelection,
    setComponentSelection,
    toggleComponentSelection,
  } from '../../../../utils/componentBulkEditModel.js';
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
  } from '../../../../utils/componentBrowserModel.js';
  import { getComponentCategoryLabel } from '../../../../utils/componentCategories.js';
  import {
    componentCohortCountText,
    componentMembershipFilters,
  } from './scoped/componentScoped.js';

  /**
   * The world entry route a GHOST ROW opens. A module constant rather than an inline literal,
   * because it is the one string that decides whether the link resolves at all: a token that does
   * not resolve lands the navigation on nothing without erroring.
   */
  const WORLD_ENTRY_ROUTE = 'world-component-entry';

  let {
    itemCards = [],
    itemSearchTerm = '',
    selectedComponentId = '',
    selectedSystemId = '',
    // Three of the four keys the call site's component bundle spreads. `systems` stays
    // undeclared, as the sibling Tool Rules list leaves it: declaring a name the site does NOT
    // pass makes the lookup fall through to the spread and turns every reader into a live
    // subscriber to the whole bundle, `scope` included.
    //
    // `systemId` is read rather than inferred: `scope.entries[].systems[]` is the world
    // projection's own JOIN, and it carries the two facts this list draws that the in-system
    // record cannot answer — the per-system `recipeCount`, and whether the category was inherited
    // or set here.
    scope = null,
    actions = null,
    systemId = '',
    // eslint-disable-next-line no-unused-vars -- deliberately reader-less; see the note below
    selectedSystemResolutionMode = 'simple',
    // Whether the system is progressive on ANY axis that reads `component.difficulty` — crafting,
    // salvage or the gathering economy (issue 772). Gated on the crafting mode alone, the row's
    // DC badge was invisible on a salvage-only-progressive system while the editor and the bulk
    // panel both showed it; all three read one predicate now.
    //
    // This prop has no reader in this component and is kept as a NEGATIVE CONTROL: the re-gate
    // test in `components-browser-view-mounted.test.js` passes a non-progressive crafting mode
    // beside a progressive salvage axis and the badge must still render.
    difficultyAxisProgressive = false,
    categoryVocabulary = [],
    dropEnabled = false,
    onSearchChange = () => {},
    onSelectComponent = () => {},
    onDropComponent = () => {},
    onEditComponent = () => {},
    // Told AFTER the toolbar's Clear has emptied the selection (issue 1157). The clear stays this
    // browser's, but the FEEDBACK cannot be: emptying the selection unmounts the bulk panel and
    // the Clear button that was pressed. Optional, so a standalone mount clears as it did.
    onSelectionCleared = null,
    // The deep link into the world catalogue entry that AUTHORS a record's identity. Called with
    // the ROUTE TOKEN and the entity id, because the token is the half that decides whether the
    // navigation resolves.
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
    // The bulk selection is scoped to the selected system, so a switch clears it and the root
    // discards the staged draft when the count reaches zero (issue 772).
    ui.bulkSelectedComponentIds = new Set();
    ui.systemId = selectedSystemId;
  });

  // The filter reads the run the ROWS draw (`essenceChips`), not the whole resolved map the
  // editor is seeded from: offering an option for an essence no row can show is the divergence
  // `ui-integration` requirement 2's one-function rule exists to prevent.
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

  // The world projection's per-system join, indexed by world entity id. A Map rather than a
  // `find` per row, which would walk the whole corpus once per component on every republish.
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

  // `all` is the one control that changes what a row IS: search, category and essence narrow
  // this system's components, while `All world components` widens past them to world records this
  // system has no rules for — the only route on this screen to adopt one. The shipped third
  // option, `Overriding`, is gone: it was a predicate over the member cohort rather than a cohort
  // of its own, which is why it alone could carry no count.
  //
  // Held locally rather than lifted: the lifted browser state is minted by
  // `createComponentBrowserState`, so a lifted axis would be a key that object does not declare.
  let membershipFilter = $state('in');
  const allWorldCohort = $derived(membershipFilter === 'all');

  const systemComponentIds = $derived(
    new Set((itemCards || []).map((item) => String(item?.id ?? '')))
  );

  /**
   * The world records this system has NO component for, projected into the SAME row shape the
   * member rows use. They are `member: false` and carry no category, essence, difficulty or
   * salvage answer, because everything a row states about behaviour is a MEMBERSHIP fact. What
   * they keep is identity — art, name and world description — because the reference draws the
   * ghost as the dimmed member row and not as a stub.
   */
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

  /**
   * The ghost half of the cohort, after the membership segment and the search term. The zero
   * state is gated on the COHORT and not on the raw prop, which is the whole point of naming
   * this: otherwise the toolbar reads `3 shown` over a body drawing the zero state, and the one
   * route in the product to adopt a component into an empty system becomes unreachable.
   */
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

  // ONE WINDOW OVER THE WHOLE COHORT. The pager and the body have to count the same list: with
  // the ghost half rendered unpaginated after a paginated member list, a widened cohort drew
  // every remaining world component in one column under a pager reading `1–10 of 8`.
  //
  // The cohort is `sorted MEMBERS then GHOSTS` and one window is taken across the join. The two
  // halves stay separate lists in the markup — see the ghost note there — but they are ONE
  // paginated sequence, so a page can hold members, ghosts, or the boundary between them.
  //
  // The arithmetic is here rather than in `buildComponentBrowserModel`, which is the shared
  // pipeline both studios read; the ghost cohort is a fact about THIS screen. So that model's own
  // `pageIndex`, `pageCount` and `rangeStart/End` describe the member half only and must not be
  // read below — `paginateRows` CLAMPS its page index into the member page count, so a page
  // wholly past the members answers the LAST member page rather than nothing.
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
  // `slice` clamps both bounds on its own, so a window entirely past the members answers `[]`
  // here and a window entirely before them answers `[]` for the ghosts.
  const memberWindow = $derived(model.sorted.slice(cohortWindowStart, cohortWindowEnd));
  const ghostWindow = $derived(
    visibleGhostRows.slice(
      Math.max(0, cohortWindowStart - memberCount),
      Math.max(0, cohortWindowEnd - memberCount)
    )
  );
  // The expensive half of a component card — its linked source document, the "Missing" badge and
  // the live description fallback — is resolved for the PAGE and nothing else (issue 1081).
  // `hydrate()` is idempotent and memoized per card. Called off the card rather than through the
  // projection's helper, because importing that store module here would pull it into the
  // dependency closure of every mounted suite that renders this tree, where a module missing from
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
  // Grouped over the cohort WINDOW, not the model's own page, so the headers describe the rows
  // actually drawn. `categoryTotals` stays the model's: a group header states its bucket's size
  // in the whole FILTERED cohort beside the count on this page (issue 676).
  const groups = $derived(
    ui.groupByCategory ? groupComponentsByCategory(memberWindow, model.categoryTotals) : []
  );

  // Bulk selection (issue 772). `pageIds` is the set of RENDERED MEMBER row ids: ghost rows are
  // not in it and carry no selection box, because `pruneComponentSelection` below drops every id
  // the system has no component for, so a ticked ghost would be a control that visibly does
  // nothing. See the ghost-row note in the markup.
  const bulkSelectedIds = $derived(ui.bulkSelectedComponentIds ?? new Set());
  const filteredIds = $derived(filteredComponents.map((item) => item.id));
  const pageIds = $derived(
    ui.groupByCategory
      ? groups.flatMap((group) => group.components.map((item) => item.id))
      : page.components.map((item) => item.id)
  );
  const selectionSummary = $derived(
    describeComponentSelection({
      pageIds,
      filteredIds,
      selectedIds: bulkSelectedIds,
    })
  );

  // A delete, an unlink or a store refresh must never leave a phantom id in the count or in an
  // `Apply`. Only assigned when something actually dropped — the pruned set is a subset, so equal
  // sizes mean an identical set — so this cannot loop.
  $effect(() => {
    const current = ui.bulkSelectedComponentIds ?? new Set();
    if (current.size === 0) return;
    const pruned = pruneComponentSelection(
      current,
      (itemCards || []).map((item) => item.id)
    );
    if (pruned.size !== current.size) ui.bulkSelectedComponentIds = pruned;
  });

  // NOT lifted: this is the "nothing is selected, pick the first row" guard, and it names one
  // mount's worth of auto-selection rather than anything the GM chose.
  let autoSelectedComponentId = $state('');

  $effect(() => {
    // A selection this system holds a row for is NEVER moved — not by a sort, a filter, a page
    // turn or the cohort segment. A deep link or a remembered selection arrives here as an id
    // this cohort holds, which is this branch; the root clears the id on a system switch, and a
    // deleted row leaves a dangling one, both of which read as "nothing is selected".
    if ((itemCards || []).some((item) => item.id === selectedComponentId)) {
      autoSelectedComponentId = '';
      return;
    }
    // The first row the GM is LOOKING at, read off `pageIds` — the member rows the body draws, in
    // the order it draws them. The root's inspector fallback answers `itemCards[0]`, the
    // manager's STORED order, which is how the panel opened on one component while the list's
    // first row was another and no row was marked.
    //
    // A ghost is never selected: `pageIds` holds member rows only, so a page drawing ghosts alone
    // selects nothing. A ghost's identity opens the world entry (see `ghostRowProps`), and the
    // inspector answers from the in-system record, which a ghost has none of.
    const firstId = pageIds[0] || '';
    if (!firstId || autoSelectedComponentId === firstId) return;
    autoSelectedComponentId = firstId;
    onSelectComponent(firstId);
  });

  // Every mutation assigns a NEW Set rather than mutating in place, so the bound lifted state
  // propagates back to the manager root.
  function toggleComponentBulkSelected(id) {
    ui.bulkSelectedComponentIds = toggleComponentSelection(bulkSelectedIds, id);
  }

  function setPageSelected(on) {
    ui.bulkSelectedComponentIds = setComponentSelection(bulkSelectedIds, pageIds, on);
  }

  function selectAllResults() {
    ui.bulkSelectedComponentIds = setComponentSelection(bulkSelectedIds, filteredIds, true);
  }

  // The write is FIRST, so the owner's callback runs with Svelte's flush already ahead of the
  // focus hop it schedules.
  function clearBulkSelection() {
    ui.bulkSelectedComponentIds = new Set();
    onSelectionCleared?.();
  }

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

  // `replacements` tolerates absence: a bare `Object.entries(replacements)` THROWS on a
  // two-argument call, and this helper is handed to the shared component-scope model as its
  // localizer, where several strings carry no token. A throw inside a render kills the route.
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

  // The group header's count is a bare numeral: the noun is the group band's whole subject, so
  // repeating it on every band is noise. The `of` form survives for the one case that needs it —
  // this view groups the PAGE, so a category spanning a page boundary would otherwise report the
  // slice as the whole bucket, and `group.total` is the category's size across the FILTERED rows.
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

  // Progressive-difficulty parity with the component editor (issue 651, re-gated for issue 772):
  // shown whenever the system is progressive on any axis that reads `component.difficulty`, and
  // only where a value is authored. It reads "None" when the axis is on but the component has no
  // difficulty, so a GM can see the gap.
  const showProgressiveDifficulty = $derived(difficultyAxisProgressive === true);

  function difficultyBadgeFor(item) {
    if (!showProgressiveDifficulty) return '';
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) && difficulty >= 1
      ? String(difficulty)
      : text('FABRICATE.Admin.Manager.Component.DifficultyNone', 'None');
  }

  // The `Recipes` column's value: the world projection's own per-system count, not a
  // re-derivation. That number is built once per refresh over every system's recipe cohort, and
  // counting it again per row would walk the corpus once per rendered component.
  function recipesValueFor(id) {
    const row = worldRowsByComponentId.get(String(id || ''));
    const count = Number(row?.recipeCount);
    return Number.isFinite(count) ? String(count) : '0';
  }

  const recipesLabel = $derived(text('FABRICATE.Admin.Manager.Component.RecipesStat', 'Recipes'));
  const salvageLabel = $derived(text('FABRICATE.Admin.Manager.Component.SalvagePill', 'Salvage'));
  // The em dash the ghost row draws in the `Recipes` column. A module constant rather than a
  // literal in the markup: a hyphen typed in its place would read as a minus sign.
  const NO_VALUE = '—';

  /**
   * One MEMBER row's props.
   *
   * @param {object} item
   * @returns {object}
   */
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
      onToggleSelect: toggleComponentBulkSelected,
    };
  }

  /**
   * One GHOST row's props — the same row, dimmed and stated.
   *
   * Adoption is two writes and this calls ONE key: `actions.addToSystem` is the composed verb,
   * writing the membership record AND the in-system record the read union's row set is built
   * from. A membership record written alone names a component no reader can see.
   *
   * @param {object} ghost
   * @returns {object}
   */
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
      // A ghost row's identity opens the world catalogue ENTRY, not the in-system selection.
      // `onSelectComponent` writes `selectedComponentId`, and the inspector resolves that id
      // against THIS system's row set, which by definition holds no row for a ghost — so wiring
      // the ghost's identity to it emptied the inspector and the click read as a control that
      // visibly does nothing. (The reference selects a ghost into its own inspector; Fabricate's
      // is built from the in-system record and cannot. Recorded as a deviation.) The world
      // catalogue entry is where that record's name, art and description ARE authored.
      onSelect: (id) => onOpenWorldEntry(WORLD_ENTRY_ROUTE, id),
      onAdd: (id) => actions?.addToSystem?.(id, systemId),
    };
  }

  const countText = $derived(
    componentCohortCountText(
      {
        allWorld: allWorldCohort,
        // `shown` IS the window, both halves of it; `mine` and `all` beside it are the cohort
        // totals and are unwindowed on purpose.
        shown: page.components.length + ghostWindow.length,
        total: (itemCards || []).length,
        mine: (itemCards || []).length,
        all: (itemCards || []).length + ghostRows.length,
      },
      format
    )
  );
</script>

<!--
  There is ONE page header, and the shell owns it.
-->
<main
  class="manager-main"
  data-component-library
  aria-label={text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}
>
  <!--
    ONE HEAD, AND THE CHILD COUNT IS THE POINT. `.manager-main` on this route is a four-track
    grid for four children: this head, the toolbar, the list and the pager. Anything drawn as a
    fifth DIRECT child pushes every child down one track — the toolbar lands in the `minmax(0,
    1fr)` track, whose min is 0, collapses, and paints itself over rows 1 to 3. The wrapper holds
    the count at four whatever it contains.

    The `SharedDefinitionCallout` that used to head this pane is gone: the reference draws that
    callout on the rules EDITOR only and puts its content on this screen in the inspector, as the
    `Shared identity` card. The subject-only `N inherit the world category · M override it` line
    went with it — its information is the inspector's `Category` block. The drop zone stays, under
    maintainer ruling M2.
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
    TWO TOOLBAR ROWS, NOT FOUR. Row one is the three controls that narrow the list — search,
    category, essence — plus the cohort switch that widens it. Row two carries the selection
    register, the two VIEW controls split by hairline dividers and each titled by an uppercase
    micro-label, and the count pinned to the trailing edge. The active-filter CHIP row is gone
    with the other two rows: each of the three filters already shows its state in the control that
    set it.
  -->
  <!-- `tabindex="-1"` makes this landmark a FOCUS TARGET without making it a tab stop (issue
       1157). The manager root lands the keyboard here when an action empties the bulk selection
       and unmounts the panel that was acted on. -->
  <ManagerToolbar
    class="manager-component-toolbar"
    tabindex="-1"
    data-keyboard-focus="true"
    data-component-toolbar=""
    ariaLabel={text('FABRICATE.Admin.Manager.Component.Filters', 'Component filters')}
  >
    <div class="manager-component-filter-row">
      <!--
        THREE CONTROLS AT 38px, which is a published rung (26 / 28 / 30 / 34 / 38 / 44) and what
        the reference draws. The field takes `size="38"` and each select carries `is-size-38`.

        The asymmetry is the tree's shape rather than a shortcut: `ManagerSearchField` is a
        component and owns its own class list, while the manager has no select COMPONENT, because
        the control beside the field is three different things across eleven bars and
        `ManagerToolbar` deliberately takes a slot rather than choosing between them.

        NEITHER IS A LOCAL HEIGHT, which is the point: a per-screen `height: 38px` here would be a
        fourth place this bar re-derives a control size. `.manager-toolbar select.is-size-38` is
        (0,3,1) and beats this bar's own (0,2,1) 34px rule, so it lands wherever the class is
        written rather than wherever the rule sits in the sheet.
      -->
      <!-- The capture registry's narrowing hook: a case that has to reach a specific component
           types into this field rather than depending on where that component happens to sort. -->
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

      <!--
        THE COHORT SWITCH, as the two-segment inline filter the reference draws rather than the
        `<select>` that shipped. `tone="accent"` fills the chosen segment and `density="compact"`
        is the rung its geometry lands on; the per-segment count rides the primitive's `badge`,
        which draws it in the mono face.
      -->
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
        THE SELECTION REGISTER, INLINE AND FIRST. `Select all` is the reference's first item on
        this row, not a fourth row of its own, and once a row is ticked the SAME register grows the
        accent count, the standing sentence pointing at the inspector, and the two bare text
        actions at the trailing edge.

        `rowClass` is a `display: contents` shim, so the primitive's own children become items of
        THIS row rather than a nested bar with its own metrics. Everything else this register
        states is already a parameter of the shared primitive.
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
        onTogglePage={(on) => setPageSelected(on)}
        onSelectAllResults={selectAllResults}
        onClear={clearBulkSelection}
      />
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <div class="manager-component-filter-field">
        <span class="manager-component-filter-label" id="manager-component-group-label"
          >{text('FABRICATE.Admin.Manager.Component.GroupByCategory', 'Group by category')}</span
        >
        <!-- `data-component-group-by-category=""` rather than the bare attribute: on a COMPONENT
             a bare attribute is the boolean `true`, which the rest spread would stamp as `="true"`
             and change the byte the sheet's own rule is written beside. -->
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
      <!--
        THE COUNT AND THE BODY AGREE, IN BOTH COHORTS: `{shown} of {total} catalogue entries` over
        this system's own library and `{shown} shown · {mine} of {all} in this system` once the
        cohort is widened, both computed over the rows the body is actually drawing.
      -->
      <span class="manager-component-count" data-component-count>{countText}</span>
    </div>
  </ManagerToolbar>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Component.Table', 'Components')}
  >
    <!--
      THE ZERO STATE IS GATED ON THE COHORT, never on the raw prop: an empty system under `All
      world components` drew the zero state over a toolbar counting three rows, and the only route
      in the product to adopt a component into an empty system became unreachable.
    -->
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
              <!--
                NO DISCLOSURE CHEVRON, AND NOT A BUTTON: the reference draws a folder glyph, the
                category name and a bare mono count on a `surface-soft` band, and nothing on it
                expands. `collapsible={false}` is the primitive's own answer, so collapsing this
                list is not shipped rather than shipped differently.
              -->
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
          THE GHOST COHORT: world components this system has no rules record for. They are THE
          SAME ROW, dimmed and stated — the medallion, the copy column and the `Recipes` column all
          stay, the pill reads `Not in this system`, the second line is the WORLD description and
          the trailing control is a dashed `+ Add to system`.

          THEY CARRY NO SELECTION BOX, and that is mechanical: the prune effect above drops every
          selected id the system has no component for, so a box rendered here would be untickable
          in practice, with nothing on screen explaining why. The one knowing divergence from C6's
          row table.

          They are rendered as their own list AFTER the member one rather than folded into the
          model, which would put unadoptable rows through a category grouping and a difficulty sort
          that mean nothing for them — but they are STILL PAGED through the same window:
          `ghostWindow` is the tail of the ONE window taken across `members ++ ghosts`, and the
          pager above counts both.
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
  /* STATIC class names, so Svelte can prove each selector is used and `lint:svelte:warnings`
     stays at zero. Everything this view drew before issue 1371 keeps its rules in
     `styles/fabricate.css`; only the surfaces this change ADDS are declared here. */

  /* The head wrapper exists to hold `.manager-main`'s child count at four; the column and the gap
     are what its child had as a sibling of the grid. */
  .manager-component-head {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* THE SELECTION REGISTER'S SHIM. `display: contents` removes `BulkSelectionToolbar`'s own box
     from the layout so its children become flex items of the toolbar row that hosts it, which is
     where the reference draws them. It declares nothing else: every metric is the row's.

     `:global()` is REQUIRED: the element is rendered by that component and not by this template,
     so Svelte's scoping hash is never applied to it and a plain selector would compile to a rule
     that matches nothing. */
  :global(.manager-component-selection-inline) {
    display: contents;
  }

  /* The register's `Select all` takes the solid secondary ink rather than the shared register's
     muted alpha of it (UX F-K).

     IT CANNOT BE WRITTEN IN `styles/fabricate.css`, and that is a cascade fact:
     `BulkSelectionToolbar` states this ink in its own scoped block, which Svelte injects
     UNLAYERED, while the sheet is imported at `layer(modules)` — so a sheet-authored override
     would be emitted, match, and silently lose. Written here it is unlayered too, and the leading
     `.fabricate-manager` puts it at (0,3,0) against the primitive's (0,2,0).

     AND IT IS SCOPED TO THIS REGISTER, not to the class: `.fab-bulk-selection-all` is drawn by
     the Recipe Studio and the Essence library too, and `.manager-component-selection-inline` is
     the `rowClass` THIS screen passes. `:global()` for the reason the shim above gives. */
  :global(.fabricate-manager .manager-component-selection-inline .fab-bulk-selection-all) {
    color: var(--fab-text-secondary);
  }
</style>
