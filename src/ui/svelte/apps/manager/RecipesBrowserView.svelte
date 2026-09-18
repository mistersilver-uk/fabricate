<!--
  The GM recipe library (issue 643): filter bar, collapsible category groups, rich rows, pager,
  with the shell's own `.manager-inspector` column carrying the selected-recipe inspector. All
  list mechanics — filter, sort, group, paginate and the per-row derivations — live in the pure
  `recipeBrowserModel.js`; this component only renders.

  Invariants:
  - This view does NOT nest a second inspector grid: that overflows `.manager-recipe-row` at the
    smoke harness's 1280px width and `assertManagerLayoutStable()` throws.
  - Row ARIA is chosen, not inherited: a card row has no columns, so the rows are a real
    `<ul role="list">` of `<li>` cards rather than table / row / cell roles.
  - The class names `manager-recipes-table`, `manager-recipe-row`, `manager-recipe-identity` and
    `manager-recipe-status` are FROZEN — the smoke harness's overflow check pins them and FAILS
    OPEN, so a rename silently stops measuring the row rather than failing.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import CollapsibleGroupHeader from '../../components/CollapsibleGroupHeader.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import SegmentedControl from '../../components/SegmentedControl.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import { resolveRecipeImage } from '../../util/craftingImageDefaults.js';
  import { statusChipTone } from '../../util/statusChipTone.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';
  import {
    describeRecipeSelection,
    pruneRecipeSelection,
    setRecipeSelection,
    toggleRecipeSelection,
  } from '../../../model/recipeBulkEditModel.js';
  import {
    RECIPE_SORT_KEYS,
    buildRecipeBrowserModel,
    createRecipeBrowserState,
    deriveRecipeIo,
    deriveRecipeStatuses,
  } from '../../../model/recipeBrowserModel.js';
  import IconButton from '../../components/IconButton.svelte';
  import Notice from '../../components/Notice.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';

  let {
    recipes = [],
    recipeCategories = [],
    recipeSearchTerm = '',
    selectedRecipeId = '',
    selectedSystemId = '',
    showRecipeCategories = false,
    resolutionMode = 'simple',
    onSearchChange = () => {},
    onSelectRecipe = () => {},
    onEditRecipe = () => {},
    onToggleEnabled = () => {},
    onToggleLocked = () => {},
    // Told AFTER the toolbar's Clear has emptied the selection (issue 1157). The clear stays this
    // browser's, but the FEEDBACK cannot be: emptying the selection unmounts the bulk panel and
    // the Clear button that was pressed. Optional, so a standalone mount clears as it did.
    onSelectionCleared = null,
    // The filter / sort / group / paginate view-state (issue 643), lifted by the manager root as
    // a single `$state` object and bound here so it survives the editor round-trip. Unbound — the
    // isolated mounted tests — the local fallback below keeps every control reactive.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createRecipeBrowserState());
  // The root's lifted object when bound, else the local fallback. Both are `$state` proxies, so
  // nested writes are reactive and, when bound, propagate back to the root.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the CATEGORY filter and the group/page position, because a category
  // names a vocabulary the new system does not share; status and lock are preferences and are not
  // reset. The search term is the STORE's to clear, on a system switch and on leaving this route
  // alike (issue 1462), because an active term also changes counts on screens with no search box.
  // The sentinel is `ui.systemId`, PERSISTED on the lifted state rather than a component-local
  // `$state`, which re-initialises to '' on every mount and made returning from an editor read as
  // a system switch (issue 806); the equality early-return keeps the write from looping.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.categoryFilter = 'all';
    ui.pageIndex = 0;
    ui.collapsedCategories = new Set();
    // The bulk selection is scoped to the selected system, so a switch clears it and the root
    // discards the staged draft when the count reaches zero (issue 1010).
    ui.bulkSelectedRecipeIds = new Set();
    ui.systemId = selectedSystemId;
  });

  // The blocked-enable flash. This view CLAIMS the refusal message through the store's `onBlocked`
  // sink, so the store SUPPRESSES its own Foundry notification and the GM is not told twice; the
  // error is never surfaced from inside this component, which is what keeps that seam stubbable.
  // TWO PARTS since issue 1515, because `Notice` draws a `title` over a quieter `detail`, and each
  // half is built from its own material rather than cut at a colon a translation may move.
  let flashTitle = $state('');
  let flashDetail = $state('');

  // A REFUSAL COUNTER, WHICH THE SHARED NOTICE MAKES NECESSARY (issue 1515): clearing the term and
  // setting it again is ONE batched update, so the `{#if}` never goes false and a dismissed
  // instance survives, making the second refusal silent. Keying on a rising counter fixes that.
  let flashToken = $state(0);

  function handleToggleEnabled(recipe) {
    flashTitle = '';
    flashDetail = '';
    onToggleEnabled(recipe.id, recipe.enabled === false, {
      onBlocked: (message, parts) => {
        flashTitle = parts?.title || message;
        flashDetail = parts?.title ? parts.detail : '';
        flashToken += 1;
      },
    });
  }

  // Defaults are load-bearing for the smoke harness: it waits for a VISIBLE row and throws
  // "Manager rendered no table rows" on zero. Groups start EXPANDED, the status and lock filters
  // start at `all`, and the page size exceeds the fixture recipe count. They live in
  // `createRecipeBrowserState()`.
  const model = $derived(
    buildRecipeBrowserModel(recipes || [], {
      status: ui.statusFilter,
      lock: ui.lockFilter,
      category: ui.categoryFilter,
      search: recipeSearchTerm,
      sortKey: ui.sortKey,
      sortDirection: ui.sortDirection,
      pageIndex: ui.pageIndex,
      pageSize: ui.pageSize,
      groupByCategory: ui.groupByCategory && showRecipeCategories,
    })
  );

  $effect(() => {
    if (model.pageIndex !== ui.pageIndex) ui.pageIndex = model.pageIndex;
  });

  // Bulk selection (issue 1010). `pageIds` is the set of RENDERED row ids, NOT `model.page`: with
  // grouping on, a COLLAPSED group renders no rows at all, so a naive page list would let the
  // tri-state box select rows the GM cannot see. `filteredIds` is the whole filtered set, which
  // the results link reaches and the page box deliberately cannot.
  const bulkSelectedIds = $derived(ui.bulkSelectedRecipeIds ?? new Set());
  const filteredIds = $derived(model.filtered.map((recipe) => recipe.id));
  const pageIds = $derived(
    model.groups.filter(isGroupRendered).flatMap((group) => group.recipes.map((r) => r.id))
  );
  const selectionSummary = $derived(
    describeRecipeSelection({
      pageIds,
      filteredIds,
      selectedIds: bulkSelectedIds,
    })
  );

  // The SAME condition the markup renders a group's rows under, read once so the two can never
  // drift: an ungrouped run is always rendered, a grouped one only while expanded.
  function isGroupRendered(group) {
    const grouped = ui.groupByCategory && showRecipeCategories && !!group.category;
    return !grouped || isExpanded(group.category);
  }

  // A delete, an unlink or a store refresh must never leave a phantom id in the count or in an
  // `Apply`. Only assigned when something actually dropped — the pruned set is a subset, so equal
  // sizes mean an identical set — so this cannot loop.
  $effect(() => {
    const current = ui.bulkSelectedRecipeIds ?? new Set();
    if (current.size === 0) return;
    const pruned = pruneRecipeSelection(
      current,
      (recipes || []).map((recipe) => recipe.id)
    );
    if (pruned.size !== current.size) ui.bulkSelectedRecipeIds = pruned;
  });

  // Every mutation assigns a NEW Set rather than mutating in place: the reactive unit is
  // `ui.bulkSelectedRecipeIds`, not the Set, so an in-place mutation compiles, runs, and silently
  // stops the bound lifted state propagating back to the manager root.
  function toggleRecipeBulkSelected(id) {
    ui.bulkSelectedRecipeIds = toggleRecipeSelection(bulkSelectedIds, id);
  }

  function setPageSelected(on) {
    ui.bulkSelectedRecipeIds = setRecipeSelection(bulkSelectedIds, pageIds, on);
  }

  function selectAllResults() {
    ui.bulkSelectedRecipeIds = setRecipeSelection(bulkSelectedIds, filteredIds, true);
  }

  // The write is FIRST, so the owner's callback runs with Svelte's flush already ahead of the
  // focus hop it schedules.
  function clearBulkSelection() {
    ui.bulkSelectedRecipeIds = new Set();
    onSelectionCleared?.();
  }

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

  const statusOptions = $derived([
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.FilterAll', fallback: 'All' },
    { value: 'on', labelKey: 'FABRICATE.Admin.Manager.StatusOn', fallback: 'On' },
    { value: 'off', labelKey: 'FABRICATE.Admin.Manager.StatusOff', fallback: 'Off' },
  ]);
  const lockOptions = $derived([
    { value: 'all', labelKey: 'FABRICATE.Admin.Manager.Recipe.FilterAll', fallback: 'All' },
    {
      value: 'unlocked',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.Unlocked',
      fallback: 'Unlocked',
    },
    { value: 'locked', labelKey: 'FABRICATE.Admin.Manager.Recipe.LockedLabel', fallback: 'Locked' },
  ]);

  const SORT_LABELS = {
    name: ['FABRICATE.Admin.Manager.Recipe.SortName', 'Name'],
    attention: ['FABRICATE.Admin.Manager.Recipe.SortAttention', 'Needs attention'],
    dc: ['FABRICATE.Admin.Manager.Recipe.SortDc', 'Check DC'],
    ingredients: ['FABRICATE.Admin.Manager.Recipe.SortIngredients', 'Ingredients'],
    results: ['FABRICATE.Admin.Manager.Recipe.SortResults', 'Results'],
  };

  const FILTER_CHIP_LABELS = {
    status: ['FABRICATE.Admin.Manager.Recipe.ChipStatus', 'Status: {value}'],
    lock: ['FABRICATE.Admin.Manager.Recipe.ChipLock', 'Lock: {value}'],
    category: ['FABRICATE.Admin.Manager.Recipe.ChipCategory', 'Category: {value}'],
    search: ['FABRICATE.Admin.Manager.Recipe.ChipSearch', 'Search: {value}'],
  };

  function sortLabel(key) {
    const [labelKey, fallback] = SORT_LABELS[key] || SORT_LABELS.name;
    return text(labelKey, fallback);
  }

  function chipLabel(chip) {
    const [labelKey, fallback] = FILTER_CHIP_LABELS[chip.id];
    const value =
      chip.id === 'category' ? getRecipeCategoryLabel(chip.value, localize) : chip.value;
    return format(labelKey, fallback, { value });
  }

  function clearChip(chipId) {
    if (chipId === 'status') ui.statusFilter = 'all';
    if (chipId === 'lock') ui.lockFilter = 'all';
    if (chipId === 'category') ui.categoryFilter = 'all';
    if (chipId === 'search') onSearchChange('');
  }

  function clearFilters() {
    ui.statusFilter = 'all';
    ui.lockFilter = 'all';
    ui.categoryFilter = 'all';
    onSearchChange('');
  }

  function categoryLabel(category) {
    return getRecipeCategoryLabel(category, localize);
  }

  function groupRegionId(category) {
    return `manager-recipe-group-${category || 'all'}`;
  }

  // The header says BOTH numbers, because either alone lies (issue 676): the model groups the
  // PAGE, so `model.filtered` over-counts and the page alone under-counts. A partially-shown group
  // reads "25 of 282 recipes" against `group.total`, the category's size across the FILTERED list;
  // a group shown WHOLE says it once, and the plural agrees with the TOTAL.
  function groupCountText(group) {
    const count = (group?.recipes || []).length;
    const total = group?.total ?? count;
    if (total > count) {
      return format(
        'FABRICATE.Admin.Manager.Recipe.GroupCountOfTotal',
        '{count} of {total} recipes',
        { count, total }
      );
    }
    return count === 1
      ? text('FABRICATE.Admin.Manager.Recipe.GroupCountOne', '1 recipe')
      : format('FABRICATE.Admin.Manager.Recipe.GroupCount', '{count} recipes', { count });
  }

  function isExpanded(category) {
    return !ui.collapsedCategories.has(category);
  }

  function toggleGroup(category) {
    // Copy-then-reassign: the reactive unit is `ui.collapsedCategories`, not the Set. In-place
    // SvelteSet mutation would stop the bound state propagating back to the manager root.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const next = new Set(ui.collapsedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    ui.collapsedCategories = next;
  }

  // The four row states. Both authoring states read ONE predicate, `recipe.enableBlocked` (issue
  // 1010), so the pilled rows, the bulk panel's pre-flight count and the set-apply write are the
  // same set by construction.
  const STATUS_LABELS = {
    disabled: ['FABRICATE.Admin.Manager.StatusDisabled', 'Disabled'],
    locked: ['FABRICATE.Admin.Manager.Recipe.LockedLabel', 'Locked'],
    blocked: ['FABRICATE.Admin.Manager.Recipe.CantEnable', "Can't enable"],
    incomplete: ['FABRICATE.Admin.Manager.Recipe.Incomplete', 'Incomplete'],
  };

  function statusPills(recipe) {
    return deriveRecipeStatuses(recipe).map((pill) => {
      const [labelKey, fallback] = STATUS_LABELS[pill.id];
      return { ...pill, label: text(labelKey, fallback) };
    });
  }

  // The I/O readout (issue 643 §9): always "N in"; "N out" ONLY in simple and progressive — a
  // tier- or set-keyed mode has no single outputs number, so it reports the RESULT-GROUP count
  // with a routing glyph instead.
  function groupsText(count) {
    // "1 groups" is not a sentence. The singular is its own key.
    return count === 1
      ? text('FABRICATE.Admin.Manager.Recipe.CountResultGroupsOne', '1 group')
      : format('FABRICATE.Admin.Manager.Recipe.CountResultGroups', '{count} groups', { count });
  }

  function ioReadout(recipe) {
    const io = deriveRecipeIo(recipe, resolutionMode);
    const inText = format('FABRICATE.Admin.Manager.Recipe.CountIn', '{count} in', {
      count: io.inCount,
    });
    const outText =
      io.outKind === 'items'
        ? format('FABRICATE.Admin.Manager.Recipe.CountOut', '{count} out', { count: io.outCount })
        : groupsText(io.outCount);
    return { ...io, inText, outText, routed: io.outKind === 'groups' };
  }

  function stepText(recipe) {
    const steps = recipe?.stepCount ?? 0;
    return steps > 1
      ? format('FABRICATE.Admin.Manager.Recipe.StepRequirements', '{count} steps', { count: steps })
      : text('FABRICATE.Admin.Manager.Recipe.SingleStep', 'Single step');
  }

  // The five check states. `none` is the one WARNING: a system that cannot roll for this recipe
  // is a thing the GM must be able to scan a library for. `ingredients` is its neutral sibling —
  // a routedByIngredients system resolves off the ingredient set that was used, so no check is a
  // working configuration, not a gap.
  const CHECK_PILLS = {
    dc: ['FABRICATE.Admin.Manager.Recipe.CheckDc', 'DC {dc}', 'fas fa-dice-d20'],
    dynamic: ['FABRICATE.Admin.Manager.Recipe.CheckDynamic', 'Dynamic DC', 'fas fa-dice-d20'],
    progressive: [
      'FABRICATE.Admin.Manager.Recipe.CheckProgressive',
      'Progressive',
      'fas fa-list-ol',
    ],
    ingredients: [
      'FABRICATE.Admin.Manager.Recipe.CheckByIngredients',
      'By ingredients',
      'fas fa-code-branch',
    ],
    // A check the GM SWITCHED OFF, distinct from one the system cannot roll. Same neutral
    // treatment as `progressive` and `ingredients`: a working configuration, not a fault.
    checkOff: ['FABRICATE.Admin.Manager.Recipe.CheckOff', 'Check off', 'fas fa-power-off'],
    none: ['FABRICATE.Admin.Manager.Recipe.CheckNone', 'No check', 'fas fa-triangle-exclamation'],
  };

  const CHECK_TOOLTIPS = {
    ingredients: [
      'FABRICATE.Admin.Manager.Recipe.CheckByIngredientsTooltip',
      'This system routes results by the ingredient set used, with no crafting check.',
    ],
    checkOff: [
      'FABRICATE.Admin.Manager.Recipe.CheckOffTooltip',
      'This system’s crafting check is switched off, so every matched attempt resolves as a success.',
    ],
    none: [
      'FABRICATE.Admin.Manager.Recipe.CheckNoneTooltip',
      'This system has no usable crafting check.',
    ],
  };

  // The check pill is projected by the store (`recipe.checkSummary`) — the row cannot resolve
  // `checkTierId` to a tier DC, nor the system's mode, on its own.
  function checkPill(recipe) {
    const summary = recipe?.checkSummary || { kind: 'none', dc: null };
    const [labelKey, fallback, icon] = CHECK_PILLS[summary.kind] || CHECK_PILLS.none;
    const tooltip = CHECK_TOOLTIPS[summary.kind];
    return {
      kind: summary.kind,
      icon,
      label: format(labelKey, fallback, { dc: summary.dc ?? '' }),
      title: tooltip ? text(tooltip[0], tooltip[1]) : '',
    };
  }

  function isSelectedRecipe(recipe) {
    return !!selectedRecipeId && recipe.id === selectedRecipeId;
  }
</script>

<!--
  There is ONE page header, and the shell owns it.
-->
<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.Recipes', 'Recipes')}>
  <!--
    THE BLOCKED-ENABLE NOTICE (issue 1515). It REPLACES the Foundry notification, so it is the only
    place a GM is told why the switch did not move, and it does not auto-hide.
    `openspec/specs/design-system/spec.md` routes a `role="alert"` strip to a BLOCKING notice and
    fixes its position; this route has no page header, so that is the content region's first child.
    THE SLOT IS UNCONDITIONAL AND THE NOTICE INSIDE IT IS NOT: a CONDITIONAL direct child of
    `.manager-main` would move the collapsing `minmax(0, 1fr)` between children, which is what
    `assertOneTrackPerGridChild` names. An empty slot is a zero-height `auto` row.
  -->
  <div class="manager-recipe-notice">
    {#key flashToken}
      {#if flashTitle}
        <!-- NO `icon`, DELIBERATELY (issue 1515): `Notice` ships a per-tone default glyph and the
             danger tone's default IS the specimen's danger mark, so passing one here re-stated the
             primitive's own choice from a call site. The prop stays for the two accent callers
             whose glyph the specimen does not declare. -->
        <Notice
          blocking
          tone="danger"
          title={flashTitle}
          detail={flashDetail}
          dismissable
          dismissLabel={text('FABRICATE.Admin.Manager.Recipe.DismissFlash', 'Dismiss')}
          dataAttr="data-recipe-flash"
        />
      {/if}
    {/key}
  </div>

  <!-- `tabindex="-1"` makes this landmark a FOCUS TARGET without making it a tab stop (issue
       1157) — see the twin note in `EssenceBrowserView`. The manager root addresses it through
       `data-recipe-toolbar`. -->
  <ManagerToolbar
    class="manager-recipe-toolbar"
    tabindex="-1"
    data-keyboard-focus="true"
    data-recipe-toolbar=""
    ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Filters', 'Recipe filters')}
  >
    <div class="manager-recipe-filter-row">
      <ManagerSearchField
        value={recipeSearchTerm || ''}
        onInput={(next) => onSearchChange(next)}
        placeholder={text('FABRICATE.Admin.Manager.Recipe.SearchPlaceholder', 'Search recipes...')}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.SearchLabel', 'Search recipes')}
      />
      <SegmentedControl
        options={statusOptions}
        value={ui.statusFilter}
        groupName="manager-recipe-status-filter"
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Recipe.StatusFilterLabel',
          'Filter recipes by status'
        )}
        dataAttr="data-recipe-status-filter"
        optionDataAttr="data-recipe-status-option"
        onChange={(value) => {
          ui.statusFilter = value;
          ui.pageIndex = 0;
        }}
      />
      <SegmentedControl
        options={lockOptions}
        value={ui.lockFilter}
        groupName="manager-recipe-lock-filter"
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Recipe.LockFilterLabel',
          'Filter recipes by lock state'
        )}
        dataAttr="data-recipe-lock-filter"
        optionDataAttr="data-recipe-lock-option"
        onChange={(value) => {
          ui.lockFilter = value;
          ui.pageIndex = 0;
        }}
      />
    </div>

    <!-- Row two carries the category FILTER with the two VIEW controls on one tighter row (issue
      643), separated by a rule and each titled by a micro-label that never wraps. -->
    <div class="manager-recipe-filter-row is-secondary">
      {#if showRecipeCategories}
        <!-- Bare: the `aria-label` is the select's accessible name. -->
        <select
          class="manager-recipe-category-filter"
          data-recipe-category-filter
          value={ui.categoryFilter}
          onchange={(event) => {
            ui.categoryFilter = event.currentTarget.value;
            ui.pageIndex = 0;
          }}
          aria-label={text(
            'FABRICATE.Admin.Manager.Recipe.CategoryFilterLabel',
            'Filter recipes by category'
          )}
        >
          <option value="all"
            >{text('FABRICATE.Admin.Manager.Recipe.CategoryAll', 'All categories')}</option
          >
          {#each recipeCategories || [] as category (category.name)}
            <option value={category.name}>{categoryLabel(category.name)} ({category.count})</option>
          {/each}
        </select>
        <span class="manager-recipe-filter-divider" aria-hidden="true"></span>
        <div class="manager-recipe-filter-field">
          <span class="manager-recipe-filter-label" id="manager-recipe-group-label"
            >{text('FABRICATE.Admin.Manager.Recipe.GroupByCategory', 'Group by category')}</span
          >
          <StatusToggle
            on={ui.groupByCategory}
            data-recipe-group-toggle=""
            aria-labelledby="manager-recipe-group-label"
            onclick={() => (ui.groupByCategory = !ui.groupByCategory)}
          />
        </div>
        <span class="manager-recipe-filter-divider" aria-hidden="true"></span>
      {/if}
      <div class="manager-recipe-filter-field">
        <span class="manager-recipe-filter-label"
          >{text('FABRICATE.Admin.Manager.Recipe.SortBy', 'Sort by')}</span
        >
        <select
          value={ui.sortKey}
          data-recipe-sort
          onchange={(event) => (ui.sortKey = event.currentTarget.value)}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.SortLabel', 'Sort recipes')}
        >
          {#each RECIPE_SORT_KEYS as key (key)}
            <option value={key}>{sortLabel(key)}</option>
          {/each}
        </select>
        <ManagerButton
          class="manager-recipe-sort-direction"
          data-recipe-sort-direction={ui.sortDirection}
          aria-label={text(
            'FABRICATE.Admin.Manager.Recipe.ToggleSortDirection',
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
              ? text('FABRICATE.Admin.Manager.Recipe.SortAscending', 'Asc')
              : text('FABRICATE.Admin.Manager.Recipe.SortDescending', 'Desc')}</span
          >
        </ManagerButton>
      </div>
    </div>

    <div class="manager-recipe-filter-row is-chips">
      {#each model.chips as chip (chip.id)}
        <Chip tone="info" class="manager-recipe-filter-chip" data-recipe-filter-chip={chip.id}>
          <span>{chipLabel(chip)}</span>
          <button
            type="button"
            class="manager-recipe-chip-clear"
            aria-label={format(
              'FABRICATE.Admin.Manager.Recipe.ClearChip',
              'Clear {filter} filter',
              { filter: chip.id }
            )}
            onclick={() => clearChip(chip.id)}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </Chip>
      {/each}
      <!-- The count is quiet right-aligned metadata, not a control, and reports the page WINDOW. -->
      <span class="manager-recipe-count" data-recipe-count>
        {format('FABRICATE.Admin.Manager.Recipe.CountRange', '{start}–{end} of {total}', {
          start: model.rangeStart,
          end: model.rangeEnd,
          total: model.totalCount,
        })}
      </span>
    </div>

    <!--
      The multi-select row is the LAST row of THIS toolbar (issue 1010), not a sticky bar of its
      own, so it inherits the toolbar's metrics rather than declaring a second register. Every prop
      below is an OVERRIDE: the primitive's row class and five `data-*` hooks default to the
      Component Studio's strings, so both browsers would otherwise answer to one set.
    -->
    <BulkSelectionToolbar
      rowClass="manager-recipe-filter-row"
      toolbarAttr="data-recipe-selection-toolbar"
      pageBoxAttr="data-recipe-select-all-page"
      countAttr="data-recipe-selection-count"
      resultsAttr="data-recipe-select-all-results"
      clearAttr="data-recipe-clear-selection"
      pageSelectionState={selectionSummary.pageSelectionState}
      count={selectionSummary.count}
      showSelectAllResults={selectionSummary.showSelectAllResults}
      selectAllResultsCount={selectionSummary.selectAllResultsCount}
      onTogglePage={(on) => setPageSelected(on)}
      onSelectAllResults={selectAllResults}
      onClear={clearBulkSelection}
    />
  </ManagerToolbar>

  <section
    class="manager-table-scroll"
    aria-label={text('FABRICATE.Admin.Manager.Recipe.Table', 'Recipes table')}
  >
    {#if (recipes || []).length === 0}
      <EmptyState
        icon="fas fa-scroll"
        title={text('FABRICATE.Admin.Manager.Recipe.EmptyTitle', 'No recipes yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Recipe.EmptyHint',
          'Create recipes for the selected crafting system.'
        )}
      />
    {:else if model.filtered.length === 0}
      <!-- A filtered-to-nothing library is not an error state and does not want the full
           empty-panel apparatus: one dashed panel says it, and Clear filters is the way out. -->
      <EmptyState
        filtered
        hint={text(
          'FABRICATE.Admin.Manager.Recipe.EmptySearchTitle',
          'No recipes match your filters.'
        )}
      >
        <ManagerButton data-clear-filters="recipes" onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</ManagerButton
        >
      </EmptyState>
    {:else}
      <div class="manager-recipes-table">
        <!-- The column header sits ABOVE the whole list (issue 643) and shares the cluster's fixed
          column template with every row, so the labels line up. `aria-hidden`, because the rows
          carry their own labels, and hidden at the stacked breakpoint. -->
        <div class="manager-recipe-table-head" aria-hidden="true">
          <span class="manager-recipe-head-identity"
            >{text('FABRICATE.Admin.Manager.Recipe.Column.Recipe', 'Recipe')}</span
          >
          <div class="manager-recipe-head-cluster">
            <span class="manager-recipe-head-cell fab-truncate is-io"
              >{text('FABRICATE.Admin.Manager.Recipe.Column.Requirements', 'Requirements')}</span
            >
            <span class="manager-recipe-head-cell fab-truncate is-check"
              >{text('FABRICATE.Admin.Manager.Recipe.Column.Check', 'Check')}</span
            >
            <!-- STATUS spans both the lock and the enable-toggle columns: lock and enable are both
                 status controls, so the header sits over the pair. -->
            <span class="manager-recipe-head-cell fab-truncate is-status"
              >{text('FABRICATE.Admin.Manager.Recipe.Column.Status', 'Status')}</span
            >
            <span class="manager-recipe-head-cell fab-truncate is-edit"></span>
          </div>
        </div>
        {#each model.groups as group (group.category || '__ungrouped')}
          {@const grouped = ui.groupByCategory && showRecipeCategories && !!group.category}
          <div class="manager-recipe-group">
            {#if grouped}
              <CollapsibleGroupHeader
                name={categoryLabel(group.category)}
                countText={groupCountText(group)}
                expanded={isExpanded(group.category)}
                controls={groupRegionId(group.category)}
                onToggle={() => toggleGroup(group.category)}
              />
            {/if}
            {#if !grouped || isExpanded(group.category)}
              <!-- A card row has no columns, so this is a list, not a table. -->
              <ul class="manager-recipe-group-list" role="list" id={groupRegionId(group.category)}>
                {#each group.recipes as recipe (recipe.id)}
                  {@const io = ioReadout(recipe)}
                  {@const check = checkPill(recipe)}
                  <!-- `.is-bulk-selected` is a DIFFERENT question from `.is-selected`, and a row
                    can carry both (issue 1010). -->
                  <li
                    class={`manager-recipe-row ${isSelectedRecipe(recipe) ? 'is-selected' : ''} ${recipe.enabled === false ? 'is-off' : ''}`}
                    class:is-bulk-selected={bulkSelectedIds.has(recipe.id)}
                    data-recipe-id={recipe.id}
                    data-recipe-bulk-selected={bulkSelectedIds.has(recipe.id)}
                    aria-current={isSelectedRecipe(recipe) ? 'true' : undefined}
                  >
                    <button
                      type="button"
                      class="manager-recipe-identity"
                      onclick={() => onSelectRecipe(recipe.id)}
                    >
                      <Medallion
                        art={resolveRecipeImage(recipe)}
                        alt=""
                        icon="fas fa-scroll"
                        size={40}
                      />
                      <span class="manager-system-copy">
                        <span class="manager-recipe-name-row">
                          <span class="manager-system-name" title={recipe.name}>{recipe.name}</span>
                          {#each statusPills(recipe) as pill (pill.id)}
                            <Chip
                              tone={statusChipTone(pill.tone)}
                              icon={pill.icon}
                              truncate
                              title={pill.label}>{pill.label}</Chip
                            >
                          {/each}
                        </span>
                        <span
                          class="manager-system-description manager-recipe-description"
                          title={recipe.description}
                        >
                          {recipe.description ||
                            text('FABRICATE.Admin.Manager.NoDescription', 'No description')}
                        </span>
                      </span>
                    </button>

                    <div class="manager-recipe-cluster">
                      <span
                        class={`manager-recipe-io ${io.empty ? 'is-empty' : ''}`}
                        data-recipe-io
                      >
                        <span class="manager-recipe-io-counts">
                          <span>{io.inText}</span>
                          <span aria-hidden="true">·</span>
                          {#if io.routed}<i
                              class="fas fa-code-branch manager-recipe-io-routed"
                              aria-hidden="true"
                            ></i>{/if}
                          <span>{io.outText}</span>
                        </span>
                        <span class="manager-recipe-io-steps">
                          <i
                            class={(recipe.stepCount ?? 0) > 1 ? 'fas fa-list-ol' : 'fas fa-minus'}
                            aria-hidden="true"
                          ></i>
                          <span>{stepText(recipe)}</span>
                        </span>
                      </span>

                      <!-- The DC is the archetypal numeric in this row, so the pill takes the mono
                           face (`is-mono`, tabular figures) when it carries a number. The word-only
                           kinds stay in the UI face. -->
                      <Chip
                        class={`manager-recipe-check is-${check.kind}`}
                        mono={check.kind === 'dc'}
                        icon={check.icon}
                        data-recipe-check={check.kind}
                        title={check.title || undefined}
                      >
                        <span>{check.label}</span>
                      </Chip>

                      <IconButton
                        class={`manager-recipe-lock ${recipe.locked ? 'is-locked' : ''}`}
                        data-recipe-lock={recipe.locked === true}
                        aria-pressed={recipe.locked === true}
                        ariaLabel={format(
                          recipe.locked
                            ? 'FABRICATE.Admin.Manager.Recipe.UnlockNamed'
                            : 'FABRICATE.Admin.Manager.Recipe.LockNamed',
                          recipe.locked ? 'Unlock {name}' : 'Lock {name}',
                          { name: recipe.name }
                        )}
                        title={text(
                          'FABRICATE.Admin.Manager.Recipe.LockHint',
                          'Locked recipes stay visible to players, but only a GM can craft them.'
                        )}
                        onclick={() => onToggleLocked(recipe.id, recipe.locked !== true)}
                      >
                        <i
                          class={recipe.locked ? 'fas fa-lock' : 'fas fa-lock-open'}
                          aria-hidden="true"
                        ></i>
                      </IconButton>

                      <!-- No "On"/"Off" text IN THE ROW: the track carries the state, `aria-label`
                        names it, and the Disabled pill says it in words. -->
                      <span class="manager-recipe-status">
                        <StatusToggle
                          on={recipe.enabled !== false}
                          ariaLabel={format(
                            recipe.enabled === false
                              ? 'FABRICATE.Admin.Manager.Recipe.EnableNamed'
                              : 'FABRICATE.Admin.Manager.Recipe.DisableNamed',
                            recipe.enabled === false ? 'Enable {name}' : 'Disable {name}',
                            { name: recipe.name }
                          )}
                          onclick={() => handleToggleEnabled(recipe)}
                        />
                      </span>

                      <!-- The row's single Edit affordance (issue 643); Duplicate and Delete stay
                        inspector-only, or the row reads as a toolbar. -->
                      <IconButton
                        class="manager-recipe-edit"
                        data-recipe-edit={recipe.id}
                        ariaLabel={format(
                          'FABRICATE.Admin.Manager.Recipe.EditNamed',
                          'Edit {name}',
                          { name: recipe.name }
                        )}
                        title={text('FABRICATE.Admin.Manager.Recipe.Edit', 'Edit recipe')}
                        onclick={() => onEditRecipe(recipe.id)}
                      >
                        <i class="fas fa-pen" aria-hidden="true"></i>
                      </IconButton>

                      <!--
                        The bulk selection box (issue 1010), INSIDE this cluster as its last cell:
                        a row-level sibling would leave the appended select track nothing to place,
                        and trailing placement is what lets it be APPENDED at all, since the column
                        header's four explicit `grid-column` placements would break on a prepend.
                        `SelectionCheckbox` renders NO `<button>`, which is load-bearing: a
                        selection control answering to a looser row-button selector would intercept
                        the smoke walk's Edit and row clicks. The cluster is a `<div>`, so the
                        primitive renders its own `<label>` for the association and click target.
                      -->
                      <SelectionCheckbox
                        size="lg"
                        wrapper="label"
                        checked={bulkSelectedIds.has(recipe.id)}
                        ariaLabel={format(
                          'FABRICATE.Admin.Manager.BulkEdit.SelectRow',
                          'Select {name} for bulk edit',
                          { name: recipe.name }
                        )}
                        data-recipe-select={recipe.id}
                        onChange={() => toggleRecipeBulkSelected(recipe.id)}
                      />
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </div>
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
