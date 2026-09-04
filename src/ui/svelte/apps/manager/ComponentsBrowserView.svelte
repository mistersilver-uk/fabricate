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
    COMPONENT_SORT_KEYS,
    buildComponentBrowserModel,
    componentCategoryOptions,
    createComponentBrowserState,
  } from '../../../../utils/componentBrowserModel.js';
  import { getComponentCategoryLabel } from '../../../../utils/componentCategories.js';
  import {
    componentCohortCountText,
    componentMembershipFilters,
  } from './scoped/componentScoped.js';

  let {
    itemCards = [],
    itemSearchTerm = '',
    selectedComponentId = '',
    selectedSystemId = '',
    // ── THE WORLD SCOPE'S OWN PROJECTION, ITS WRITE FAMILY, AND THE SYSTEM THIS SCREEN IS ON ──
    // Three of the four keys the call site's component bundle spreads. `systems` stays
    // undeclared, as the sibling Tool Rules list leaves it: declaring a name the site does not
    // pass makes the lookup fall THROUGH to the spread and turns every reader of that prop into
    // a live subscriber to the whole bundle, including `scope`, which is a new object on every
    // publish. All three of these ARE passed, so none of them does.
    //
    // `systemId` is read rather than inferred: `scope.entries[].systems[]` is the world
    // projection's own JOIN, and it carries the two facts this list draws that the in-system
    // record cannot answer — the per-system `recipeCount` the `Recipes` column states, and
    // whether the category was inherited or set here, which the inspector's `Category` block
    // reads.
    scope = null,
    actions = null,
    systemId = '',
    // eslint-disable-next-line no-unused-vars -- deliberately reader-less; see the note below
    selectedSystemResolutionMode = 'simple',
    // Whether the system is progressive on ANY axis that reads `component.difficulty` —
    // crafting resolution mode, salvage resolution mode, or the gathering economy's
    // (issue 772). The row's read-only DC badge used to gate on the CRAFTING mode alone,
    // which made it invisible on a salvage-only-progressive system while the editor
    // control and the bulk panel both showed it. All three read ONE predicate now, and it
    // arrives as its own prop rather than being re-derived from
    // `selectedSystemResolutionMode`. That prop now has no reader in this component at
    // all, and is kept ANYWAY as a NEGATIVE CONTROL: the re-gate test in
    // `components-browser-view-mounted.test.js` passes a non-progressive crafting mode
    // alongside a progressive salvage axis, and the badge must still render. Deleting it
    // would leave that test unable to state the thing it is checking.
    difficultyAxisProgressive = false,
    categoryVocabulary = [],
    dropEnabled = false,
    onSearchChange = () => {},
    onSelectComponent = () => {},
    onDropComponent = () => {},
    onEditComponent = () => {},
    // Told AFTER the toolbar's Clear has emptied the selection (issue 1157). The clear stays
    // this browser's — the selection is its state — but the FEEDBACK cannot be: emptying the
    // selection unmounts the bulk panel and the Clear button that was pressed, so the
    // announcement and the focus hop belong to something that outlives both. Optional, so a
    // standalone mount clears exactly as it did.
    onSelectionCleared = null,
    // The filter / sort / group / paginate view-state (issue 676). The manager root
    // LIFTS this up and binds it here so it survives the editor round-trip.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createComponentBrowserState());
  // The active view-state: the root's lifted object when bound, else the local
  // fallback. Both are `$state` proxies, so nested writes (`ui.categoryFilter = …`)
  // are reactive AND, when bound, propagate back to the root.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the filters — they name a vocabulary the new system does
  // not share. The page/sort/group PREFERENCES are deliberately kept.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.categoryFilter = 'all';
    ui.essenceFilter = 'all';
    ui.pageIndex = 0;
    // The bulk selection is scoped to the selected system — its ids name components the
    // new system does not have — so a switch clears it, and the root discards the staged
    // draft when the count reaches zero (issue 772).
    ui.bulkSelectedComponentIds = new Set();
    ui.systemId = selectedSystemId;
  });

  const showComponentEssences = $derived(
    (itemCards || []).some(
      (item) => item.showEssences || (Array.isArray(item.essences) && item.essences.length > 0)
    )
  );
  const componentEssenceOptions = $derived(
    uniqueSorted(
      (itemCards || []).flatMap((item) =>
        Array.isArray(item.essences)
          ? item.essences.map((essence) => essence.name || essence.id)
          : []
      )
    )
  );
  const categoryOptions = $derived(componentCategoryOptions(itemCards || [], categoryVocabulary));

  // ── THE WORLD PROJECTION'S PER-SYSTEM JOIN, indexed by world entity id ──────────────────
  // Read as a Map rather than scanned per row: `scope` republishes a NEW object on every
  // world-scope edit, and a `find` per row would walk the whole corpus once per component on
  // every one of them.
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

  // ── THE COHORT SWITCH ────────────────────────────────────────────────────────────────────
  // `all` is the one control that changes what a row IS. Search, category and essence narrow a
  // list of THIS system's components; `All world components` widens it past them, to world
  // records this system has no rules for at all — which is the only route on this screen to
  // adopt a component a GM has not added yet.
  //
  // The shipped third option, `Overriding`, is GONE (gap-list row 145): the reference draws two
  // segments and no third, and that option was a predicate over the member cohort rather than a
  // cohort of its own, which is why it alone could carry no count.
  //
  // HELD LOCALLY RATHER THAN LIFTED, and that is a scope decision rather than a preference: the
  // lifted browser state is minted by `createComponentBrowserState`, in a file this change does
  // not open, so a lifted axis would be a key that object does not declare.
  let membershipFilter = $state('in');
  const allWorldCohort = $derived(membershipFilter === 'all');

  const systemComponentIds = $derived(
    new Set((itemCards || []).map((item) => String(item?.id ?? '')))
  );

  /**
   * The world records this system has NO component for, projected into the SAME row shape the
   * member rows use.
   *
   * They are `member: false` and carry no category, essence, difficulty or salvage answer,
   * because this system has authored none: everything a row states about behaviour is a
   * MEMBERSHIP fact, and inventing one from the world default would claim rules that do not
   * exist here. What they DO keep is identity — the art, the name and the world description —
   * because the reference draws the ghost as the dimmed member row and not as a stub.
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
   * THE GHOST HALF OF THE COHORT, after the membership segment and the search term.
   *
   * THE ZERO STATE IS GATED ON THE COHORT AND NOT ON THE RAW PROP, which is the whole point of
   * naming this. The sibling Tool Rules list records what happens otherwise: for a system that
   * has adopted nothing, the toolbar reads `3 shown` over a body drawing the zero state, and the
   * ONE route in the product to adopt a component into an empty system becomes unreachable.
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
  // The expensive half of a component card — its linked source document, the "Missing"
  // badge and the live description fallback — is resolved for the PAGE and nothing else
  // (issue 1081). `hydrate()` is idempotent and memoized per card. Called off the card rather
  // than through the projection's helper on purpose: importing that store module here would
  // pull it into the dependency closure of every mounted suite that renders this tree, where a
  // module missing from the harness allowlist HANGS the suite as `# cancelled`.
  $effect(() => {
    for (const card of model.page) card?.hydrate?.()?.catch?.(() => {});
  });
  const page = $derived({
    components: model.page,
    pageIndex: model.pageIndex,
    pageCount: model.pageCount,
    totalCount: model.totalCount,
    rangeStart: model.rangeStart,
    rangeEnd: model.rangeEnd,
  });
  const groups = $derived(model.groups);

  // ── Bulk selection (issue 772) ───────────────────────────────────────────────────
  // `pageIds` is the set of RENDERED MEMBER row ids. Ghost rows are not in it and carry no
  // selection box at all: `pruneComponentSelection` below drops every id the system has no
  // component for, so a ticked ghost would be removed on the very next render and the box
  // would be a control that visibly does nothing. See the ghost-row note in the markup.
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

  // A delete, an unlink or a store refresh must never leave a phantom id in the count or
  // in an `Apply`. Only assigned when something actually dropped — the pruned set is a
  // subset, so equal sizes mean an identical set — so this cannot loop.
  $effect(() => {
    const current = ui.bulkSelectedComponentIds ?? new Set();
    if (current.size === 0) return;
    const pruned = pruneComponentSelection(
      current,
      (itemCards || []).map((item) => item.id)
    );
    if (pruned.size !== current.size) ui.bulkSelectedComponentIds = pruned;
  });

  // Every mutation assigns a NEW Set rather than mutating in place, so the bound lifted
  // state propagates back to the manager root.
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

  // `replacements` TOLERATES ABSENCE (issue 1371). It was a bare `Object.entries(replacements)`,
  // which THROWS on a two-argument call — and this helper is handed to the shared
  // component-scope model as its localizer, where several strings carry no token at all. A throw
  // inside a render kills the whole route.
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

  // ── THE GROUP HEADER'S COUNT IS A BARE NUMERAL ───────────────────────────────────────────
  // `proto:1073` draws it as a mono count and nothing else — the reference frame reads
  // `Beast 1` — where this list wrote `1 component` / `7 components`. The noun is the group
  // band's whole subject, so repeating it on every band is the noise the reference removes.
  //
  // The `of` form SURVIVES for the one case that needs it: this view groups the PAGE, so a
  // category spanning a page boundary would otherwise report the slice as the whole bucket.
  // `group.total` is the category's size across the FILTERED rows.
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

  // Progressive-difficulty parity with the component editor (issue 651, re-gated for
  // issue 772): shown whenever the system is progressive on ANY axis that reads
  // `component.difficulty`, and only where a value is authored. It reads "None" when the
  // axis is on but the component has no difficulty, so a GM can see the gap.
  const showProgressiveDifficulty = $derived(difficultyAxisProgressive === true);

  function difficultyBadgeFor(item) {
    if (!showProgressiveDifficulty) return '';
    const difficulty = Number(item?.difficulty);
    return Number.isFinite(difficulty) && difficulty >= 1
      ? String(difficulty)
      : text('FABRICATE.Admin.Manager.Component.DifficultyNone', 'None');
  }

  // THE `Recipes` COLUMN'S VALUE (gap-list row 112). It is the world projection's own
  // per-system count — `scope.entries[].systems[].recipeCount` — and not a re-derivation:
  // that number is built once per refresh over every system's recipe cohort, and counting it
  // again per row would walk the corpus once per rendered component.
  function recipesValueFor(id) {
    const row = worldRowsByComponentId.get(String(id || ''));
    const count = Number(row?.recipeCount);
    return Number.isFinite(count) ? String(count) : '0';
  }

  const recipesLabel = $derived(text('FABRICATE.Admin.Manager.Component.RecipesStat', 'Recipes'));
  const salvageLabel = $derived(text('FABRICATE.Admin.Manager.Component.SalvagePill', 'Salvage'));
  // The em dash the ghost row draws in the `Recipes` column. A MODULE-LEVEL constant rather
  // than a literal in the markup: it is the one glyph that says "this system has no rules, so
  // there is no number", and a hyphen typed in its place would read as a minus sign.
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
   * ADOPTION IS TWO WRITES AND THIS CALLS ONE KEY. `actions.addToSystem` is the COMPOSED verb:
   * it writes the membership record AND the in-system record the read union's row set is built
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
      onSelect: onSelectComponent,
      onAdd: (id) => actions?.addToSystem?.(id, systemId),
    };
  }

  const countText = $derived(
    componentCohortCountText(
      {
        allWorld: allWorldCohort,
        shown: page.components.length + visibleGhostRows.length,
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
    ONE HEAD, AND THE CHILD COUNT IS THE POINT (issue 1371).

    `.manager-main` on this route is a FOUR-TRACK grid — `auto auto minmax(0, 1fr) auto` — for
    four children: this head, the toolbar, the list and the pager. Anything drawn as a fifth
    DIRECT child pushes every child down one track: the toolbar lands in `minmax(0, 1fr)`, whose
    min is 0, collapses, and paints itself on top of rows 1 to 3. The wrapper holds the count at
    four whatever it contains.

    THE `SharedDefinitionCallout` THAT USED TO HEAD THIS PANE IS GONE (gap-list row 101,
    `rebuild-spec.md` C2). The reference draws that callout on the rules EDITOR only, and puts
    its content on THIS screen in the inspector, as the `Shared identity` card — a card in the
    wrong screen is the exact class the parity inventory exists to name. The subject-only
    `N inherit the world category · M override it` line went with it (row 105): its information
    is the inspector's `Category` block.

    The drop zone STAYS, under maintainer ruling M2 ("KEEP the system-scope one"). It is the one
    subject-only card on this screen that is licensed.
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
    TWO TOOLBAR ROWS, NOT FOUR (gap-list row 103, `rebuild-spec.md` C3). Row one is the three
    controls that narrow the list — search, category, essence — plus the cohort switch that
    widens it. Row two carries the selection register, the two VIEW controls (how the list is
    grouped and how it is ordered) split by hairline dividers and each titled by an uppercase
    micro-label, and the count pinned to the trailing edge.

    The active-filter CHIP row is gone with the other two rows: the reference draws none, and
    each of the three filters already shows its own state in the control that set it.
  -->
  <!-- `tabindex="-1"` makes this landmark a FOCUS TARGET without making it a tab stop
       (issue 1157). The manager root lands the keyboard here when an action empties the bulk
       selection and unmounts the panel that was acted on. -->
  <ManagerToolbar
    class="manager-component-toolbar"
    tabindex="-1"
    data-keyboard-focus="true"
    data-component-toolbar=""
    ariaLabel={text('FABRICATE.Admin.Manager.Component.Filters', 'Component filters')}
  >
    <div class="manager-component-filter-row">
      <!-- The capture registry's narrowing hook: a case that has to reach a specific component
           types into this field rather than depending on where that component happens to sort. -->
      <ManagerSearchField
        data-component-search=""
        value={itemSearchTerm || ''}
        onInput={(next) => onSearchChange(next)}
        placeholder={text(
          'FABRICATE.Admin.Manager.Component.SearchPlaceholder',
          'Search name or tags…'
        )}
        ariaLabel={text('FABRICATE.Admin.Manager.Component.SearchLabel', 'Search components')}
      />

      <!-- Bare: the `aria-label` is the select's accessible name. A filter bar whose controls
           each announce themselves in sentence case reads as a form. -->
      <select
        class="manager-component-category-filter"
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
          class="manager-component-essence-filter"
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
          {#each componentEssenceOptions as essence (essence)}
            <option value={essence}>{essence}</option>
          {/each}
        </select>
      {/if}

      <!--
        THE COHORT SWITCH, as the two-segment inline filter the reference draws (`proto:1558`,
        gap-list row 145) rather than the `<select>` that shipped. `tone="accent"` fills the
        chosen segment; `density="compact"` is the rung its `padding: 5px 11px` / radius-6 /
        10.5px-600 geometry lands on. The per-segment count rides the primitive's `badge`, which
        draws it in the mono face the reference sets it in.
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
        THE SELECTION REGISTER, INLINE AND FIRST (gap-list rows 104 and 147). `Select all` is
        the reference's first item on this row, not a fourth row of its own, and once a row is
        ticked the SAME register grows the accent count, the standing sentence pointing at the
        inspector, and the two bare text actions at the trailing edge.

        `rowClass` is a `display: contents` shim, so the primitive's own children become items
        of THIS row rather than a nested bar with its own metrics. Everything else the reference
        states about this register — the check-double glyph, the bare actions with no underline
        and no xmark, the trailing pair — is already a parameter of the shared primitive.
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
        <!-- `data-component-group-by-category=""` rather than the bare attribute: on a
             COMPONENT a bare attribute is the boolean `true`, which the rest spread would
             stamp as `="true"` and change the byte the sheet's own rule is written beside. -->
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
          <i
            class={ui.sortDirection === 'asc'
              ? 'fas fa-arrow-down-short-wide'
              : 'fas fa-arrow-down-wide-short'}
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
        THE COUNT AND THE BODY AGREE, IN BOTH COHORTS. It reads `{shown} of {total} catalogue
        entries` over this system's own library and `{shown} shown · {mine} of {all} in this
        system` once the cohort is widened — the sentence the reference writes for each — and
        both are computed over the rows the body is actually drawing.
      -->
      <span class="manager-component-count" data-component-count>{countText}</span>
    </div>
  </ManagerToolbar>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Component.Table', 'Components')}
  >
    <!--
      THE ZERO STATE IS GATED ON THE COHORT, NEVER ON THE RAW PROP: an empty system under
      `All world components` drew the zero state over a toolbar counting three rows, and the
      only route in the product to adopt a component into an empty system became unreachable.
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
                NO DISCLOSURE CHEVRON, AND NOT A BUTTON (gap-list rows 107 and 108). The
                reference draws a folder glyph, the category name and a bare mono count on a
                `surface-soft` band, and nothing on it expands. `collapsible={false}` is the
                primitive's own answer; collapsing this list is not shipped rather than shipped
                differently, which is what gap-list row 107 asks for.
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
          THE GHOST COHORT: world components this system has NO rules record for.

          They are THE SAME ROW, dimmed and stated (`rebuild-spec.md` C6, gap-list row 146) —
          the medallion, the copy column and the `Recipes` column all stay, the pill reads
          `Not in this system`, the second line is the WORLD description and the trailing
          control is a dashed `+ Add to system`.

          THEY CARRY NO SELECTION BOX, and that is mechanical rather than a preference: the
          prune effect above drops every selected id the system has no component for, so a box
          rendered here would be untickable in practice — the id would be removed on the next
          render, with nothing on screen explaining why. Reported to the driver as the one
          knowing divergence from C6's row table.

          They are rendered as their own list AFTER the paginated one — a different verb with a
          different membership answer — rather than folded into the model, which would put
          unadoptable rows through a category grouping and a difficulty sort that mean nothing
          for them.
        -->
        {#if visibleGhostRows.length > 0}
          <ul
            class="manager-component-group-body manager-component-ghost-body"
            data-component-ghost-body
            role="list"
            aria-label={text(
              'FABRICATE.Admin.Manager.Component.GhostListLabel',
              'World components this system has no rules for'
            )}
          >
            {#each visibleGhostRows as ghost (ghost.id)}
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

  /* THE HEAD WRAPPER. It exists to hold `.manager-main`'s child count at four; the column and
     the gap are what its child had as a sibling of the grid. */
  .manager-component-head {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* THE SELECTION REGISTER'S SHIM. `BulkSelectionToolbar` renders one element carrying the
     class this prop names; `display: contents` removes that box from the layout so its
     children — the select-all label, the divider, the count, the standing sentence and the two
     text actions — become flex items of the toolbar row that hosts it, which is where the
     reference draws them. It declares nothing else: every metric is the row's.

     `:global()` is REQUIRED and is not laziness. The element is rendered by that component,
     not by this template, so Svelte's scoping hash is never applied to it and a plain selector
     here would compile to a rule that matches nothing. */
  :global(.manager-component-selection-inline) {
    display: contents;
  }
</style>
