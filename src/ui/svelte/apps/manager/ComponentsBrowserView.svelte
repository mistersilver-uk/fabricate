<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import CollapsibleGroupHeader from '../../components/CollapsibleGroupHeader.svelte';
  import ComponentRow from './components/ComponentRow.svelte';
  import {
    COMPONENT_SORT_KEYS,
    componentCategoryOf,
    componentCategoryOptions,
    createComponentBrowserState,
    describeActiveComponentFilters,
    filterComponents,
    groupComponentsByCategory,
    paginateComponents,
    sortComponents
  } from '../../../../utils/componentBrowserModel.js';
  import { countByCategory } from '../../../../utils/browserGroupCounts.js';
  import {
    GENERAL_COMPONENT_CATEGORY,
    getComponentCategoryLabel
  } from '../../../../utils/componentCategories.js';

  let {
    itemCards = [],
    itemSearchTerm = '',
    selectedComponentId = '',
    selectedSystemId = '',
    selectedSystemResolutionMode = 'simple',
    categoryVocabulary = [],
    dropEnabled = false,
    onSearchChange = () => {},
    onSelectComponent = () => {},
    onDropComponent = () => {},
    onEditComponent = () => {},
    // The filter / sort / group / paginate view-state (issue 676). The manager root
    // LIFTS this up and binds it here so it survives the editor round-trip: opening a
    // component unmounts this browser, and remounting it with the controls reset to
    // defaults threw away the page, filters, sort and grouping the GM left — which is
    // exactly what this view did before, because it kept all of it locally. Mirrors
    // RecipesBrowserView. When unbound (the isolated mounted tests) the local fallback
    // below keeps every control reactive in-component.
    browserState = $bindable(null)
  } = $props();

  // svelte-ignore state_referenced_locally
  let ownBrowserState = $state(createComponentBrowserState());
  // The active view-state: the root's lifted object when bound, else the local
  // fallback. Both are `$state` proxies, so nested writes (`ui.categoryFilter = …`)
  // are reactive AND, when bound, propagate back to the root.
  const ui = $derived(browserState ?? ownBrowserState);

  let lastSystemId = $state('');

  // Switching system resets the filters — they name a vocabulary the new system does
  // not share. The page/sort/group PREFERENCES are deliberately kept.
  $effect(() => {
    if (selectedSystemId === lastSystemId) return;
    ui.categoryFilter = 'all';
    ui.essenceFilter = 'all';
    ui.pageIndex = 0;
    ui.collapsedCategories = new Set();
    lastSystemId = selectedSystemId;
  });

  const showComponentEssences = $derived((itemCards || []).some(item => item.showEssences || (Array.isArray(item.essences) && item.essences.length > 0)));
  const componentEssenceOptions = $derived(uniqueSorted((itemCards || []).flatMap(item => Array.isArray(item.essences) ? item.essences.map(essence => essence.name || essence.id) : [])));
  const categoryOptions = $derived(componentCategoryOptions(itemCards || [], categoryVocabulary));

  const filteredComponents = $derived(filterComponents(itemCards || [], {
    category: ui.categoryFilter,
    essence: ui.essenceFilter
  }));
  // Grouping ON ⇒ order category-major BEFORE pagination (issue 801), so each category is
  // a contiguous run across page boundaries rather than an interleaved slice on every
  // page. `groups` still groups the current `page.components`; the header's "N of M" stays
  // truthful for a category that spans a boundary. When grouping is OFF the order is
  // unchanged.
  const sortedComponents = $derived(sortComponents(filteredComponents, {
    key: ui.sortKey,
    direction: ui.sortDirection,
    categoryMajor: ui.groupByCategory
  }));
  const page = $derived(paginateComponents(sortedComponents, {
    pageIndex: ui.pageIndex,
    pageSize: ui.pageSize
  }));
  // The per-category totals the group headers pair with their rendered count. Counted
  // over the FILTERED rows (`itemCards` arrives already search-filtered by the store),
  // so a total can never ignore an active filter.
  const categoryTotals = $derived(countByCategory(filteredComponents, componentCategoryOf));
  const groups = $derived(ui.groupByCategory ? groupComponentsByCategory(page.components, categoryTotals) : []);

  // The active-filter chips, derived by the pure model so the run and the "is anything
  // on?" question can never disagree.
  const chips = $derived(describeActiveComponentFilters({
    category: ui.categoryFilter,
    essence: ui.essenceFilter,
    search: itemSearchTerm
  }));

  const sortOptions = $derived(COMPONENT_SORT_KEYS.map(key => ({
    key,
    label: sortLabel(key)
  })));

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

  const CHIP_LABELS = {
    category: ['FABRICATE.Admin.Manager.Component.ChipCategory', 'Category: {value}'],
    essence: ['FABRICATE.Admin.Manager.Component.ChipEssence', 'Essence: {value}'],
    search: ['FABRICATE.Admin.Manager.Component.ChipSearch', 'Search: {value}']
  };

  function chipLabel(chip) {
    const [labelKey, fallback] = CHIP_LABELS[chip.id];
    const value = chip.id === 'category' ? categoryLabel(chip.value) : chip.value;
    return format(labelKey, fallback, { value });
  }

  function clearChip(chipId) {
    if (chipId === 'category') setCategoryFilter('all');
    if (chipId === 'essence') setEssenceFilter('all');
    if (chipId === 'search') onSearchChange('');
  }

  function sortLabel(key) {
    const labels = {
      name: text('FABRICATE.Admin.Manager.Component.SortName', 'Name'),
      category: text('FABRICATE.Admin.Manager.Component.SortCategory', 'Category'),
      essences: text('FABRICATE.Admin.Manager.Component.SortEssences', 'Essences'),
      salvage: text('FABRICATE.Admin.Manager.Component.SortSalvage', 'Salvage')
    };
    return labels[key] || key;
  }

  function categoryLabel(category) {
    return getComponentCategoryLabel(category, localize);
  }

  // Suppressed for `general`: no redundant "General" chip on every uncategorized row.
  // `general` remains a selectable FILTER option, pinned last as the catch-all — the
  // same badge-vs-filter asymmetry the Recipe Studio settled on.
  function categoryBadgeFor(item) {
    const category = item?.category || GENERAL_COMPONENT_CATEGORY;
    return category === GENERAL_COMPONENT_CATEGORY ? '' : categoryLabel(category);
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  // Where the component's linked item lives — a real state, so it reads as a StatusPill
  // (the shared vehicle the Recipe Studio's row states use) rather than a raw chip.
  // A resolved link (compendium / world) is ACCENT; an unresolved stored source is the
  // one WARNING, because a component whose source no longer exists is a thing the GM
  // must be able to scan a library for.
  function componentSourceOrigin(item) {
    if (item?.sourceMissing) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.Manager.Component.SourceOriginMissing', 'Missing'),
        tone: 'warning',
        icon: 'fas fa-link-slash'
      };
    }
    const origin = item?.sourceOrigin || '';
    if (origin === 'compendium') {
      return {
        id: 'compendium',
        label: item?.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginCompendium', 'Compendium'),
        tone: 'accent',
        icon: 'fas fa-book-atlas'
      };
    }
    if (origin === 'world') {
      return {
        id: 'world',
        label: item?.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginWorld', 'Items Directory'),
        tone: 'accent',
        icon: 'fas fa-box-archive'
      };
    }
    return {
      id: 'unknown',
      label: item?.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginUnknown', 'Unknown'),
      tone: 'subtle',
      icon: 'fas fa-circle-question'
    };
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

  // Collapse is opt-IN: a category absent from the set is expanded. A new Set is
  // assigned rather than mutated so the bound state propagates back to the root.
  function toggleCategoryCollapsed(category) {
    const next = new Set(ui.collapsedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    ui.collapsedCategories = next;
  }

  function isCategoryCollapsed(category) {
    return ui.collapsedCategories.has(category);
  }

  // The header says BOTH numbers, because either one alone lies (issue 676). This view
  // groups the PAGE, so counting `filteredComponents` would put "282 components" above
  // the 25 rows page 1 renders — but counting only the page put "General · 25 components"
  // above page 1 of a 282-strong General bucket, which says the bucket holds 25. So a
  // partially-shown group reads "25 of 282 components"; `group.total` is the category's
  // size across the FILTERED rows.
  //
  // A group shown WHOLE says it once — "25 components", not "25 of 25". Grouping is on by
  // default and most libraries fit one page, so the "of" form would otherwise be pure
  // noise on the common case. The plural agrees with the TOTAL, which is >= 2 whenever
  // the "of" form is used; "1 components" (the shipped bug) is what the GroupCountOne key
  // exists to prevent.
  function groupCountText(group) {
    const count = group.components.length;
    const total = group.total ?? count;
    if (total > count) {
      return format('FABRICATE.Admin.Manager.Component.GroupCountOfTotal', '{count} of {total} components', { count, total });
    }
    return count === 1
      ? text('FABRICATE.Admin.Manager.Component.GroupCountOne', '1 component')
      : format('FABRICATE.Admin.Manager.Component.GroupCount', '{count} components', { count });
  }

  function clearFilters() {
    ui.categoryFilter = 'all';
    ui.essenceFilter = 'all';
    ui.pageIndex = 0;
    onSearchChange('');
  }

  // Progressive-difficulty parity with the component editor (issue 651): shown ONLY for
  // a progressive system, and only where a value is authored. It reads "None" when the
  // system is progressive but the component has no difficulty, so a GM can see the gap.
  const showProgressiveDifficulty = $derived(selectedSystemResolutionMode === 'progressive');

  function difficultyBadgeFor(item) {
    if (!showProgressiveDifficulty) return '';
    const difficulty = Number(item?.difficulty);
    const label = text('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty');
    return Number.isFinite(difficulty) && difficulty >= 1
      ? `${label} ${difficulty}`
      : `${label} ${text('FABRICATE.Admin.Manager.Component.DifficultyNone', 'None')}`;
  }

  // The row carries ONE action — Edit. Copy-source-UUID and Delete moved into the
  // browser inspector (issue 676): three ghost icons on every row turned it into a
  // toolbar and truncated the description, exactly as the Recipe Studio found.
  function rowProps(item) {
    const origin = componentSourceOrigin(item);
    return {
      component: item,
      selected: isSelectedComponent(item),
      categoryBadge: categoryBadgeFor(item),
      difficultyBadge: difficultyBadgeFor(item),
      originLabel: origin.label,
      originTone: origin.tone,
      originIcon: origin.icon,
      editLabel: format('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}', { name: item.name }),
      editTitle: text('FABRICATE.Admin.Manager.Component.Edit', 'Edit component'),
      noDescriptionText: text('FABRICATE.Admin.Manager.NoDescription', 'No description'),
      onSelect: onSelectComponent,
      onEdit: onEditComponent
    };
  }
</script>

<!--
  There is ONE page header, and the shell owns it. This view used to render a SECOND
  one — kicker + "Component directory" + a second subtitle — directly under the shell's
  breadcrumb / "Components" / subtitle block: ~74px of duplicated chrome saying what the
  breadcrumb and the titlebar's gold system badge already said. The Recipe Studio
  deleted exactly this; ruling 1 says it wins.
-->
<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}>
  <section
    class="manager-component-drop-zone"
    use:dragDrop={{ onDrop: onDropComponent, disabled: !dropEnabled, activeClass: 'is-drop-active' }}
    aria-label={text('FABRICATE.Admin.Manager.Component.DropZoneLabel', 'Drop Foundry items to add components')}
  >
    <i class="fas fa-download" aria-hidden="true"></i>
    <span>
      <strong>{text('FABRICATE.Admin.Manager.Component.DropZoneTitle', 'Drop items to add components')}</strong>
      <small>{text('FABRICATE.Admin.Manager.Component.DropZoneHint', 'World, compendium, pack, or folder drops use the existing component import flow for the selected system.')}</small>
    </span>
  </section>

  <!--
    The three-row filter bar, adopted from the Recipe Studio (ruling 1). Row one is
    every FILTER (search, essence); row two carries the category filter with the two
    VIEW controls — how the list is grouped, and how it is ordered — split by rules and
    each titled by an uppercase micro-label that precedes its control and never wraps;
    row three is the active-filter chips and the count.

    It replaces a flat run of eight sentence-case `.manager-filter` controls, in which
    the group toggle and the sort-direction button carried NO CSS at all: the toggle had
    no visual pressed state, and the direction button sat at the boxy base
    `.manager-button` scale the Recipe Studio already documented fixing.
  -->
  <section class="manager-toolbar manager-component-toolbar" aria-label={text('FABRICATE.Admin.Manager.Component.Filters', 'Component filters')}>
    <div class="manager-component-filter-row">
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={itemSearchTerm || ''}
          oninput={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={text('FABRICATE.Admin.Manager.Component.SearchPlaceholder', 'Search components...')}
          aria-label={text('FABRICATE.Admin.Manager.Component.SearchLabel', 'Search components')}
        />
      </label>

      {#if showComponentEssences && componentEssenceOptions.length > 0}
        <!-- Bare: the `aria-label` is the select's accessible name. A filter bar whose
             controls each announce themselves in sentence case reads as a form. -->
        <select
          class="manager-component-essence-filter"
          data-component-essence-filter
          value={ui.essenceFilter}
          onchange={(event) => setEssenceFilter(event.currentTarget.value)}
          aria-label={text('FABRICATE.Admin.Manager.Component.EssenceFilterLabel', 'Filter components by essence')}
        >
          <option value="all">{text('FABRICATE.Admin.Manager.Component.EssenceAll', 'All essences')}</option>
          {#each componentEssenceOptions as essence (essence)}
            <option value={essence}>{essence}</option>
          {/each}
        </select>
      {/if}
    </div>

    <div class="manager-component-filter-row is-secondary">
      <select
        class="manager-component-category-filter"
        data-component-category-filter
        value={ui.categoryFilter}
        onchange={(event) => setCategoryFilter(event.currentTarget.value)}
        aria-label={text('FABRICATE.Admin.Manager.Component.CategoryFilterLabel', 'Filter components by category')}
      >
        <option value="all">{text('FABRICATE.Admin.Manager.Component.CategoryAll', 'All categories')}</option>
        {#each categoryOptions as category (category.name)}
          <option value={category.name}>{categoryLabel(category.name)} ({category.count})</option>
        {/each}
      </select>
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <div class="manager-component-filter-field">
        <span class="manager-component-filter-label" id="manager-component-group-label">{text('FABRICATE.Admin.Manager.Component.GroupByCategory', 'Group by category')}</span>
        <button
          type="button"
          class={`manager-status-toggle ${ui.groupByCategory ? 'is-on' : 'is-off'}`}
          data-component-group-by-category
          aria-pressed={ui.groupByCategory}
          aria-labelledby="manager-component-group-label"
          onclick={toggleGroupByCategory}
        >
          <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
        </button>
      </div>
      <span class="manager-component-filter-divider" aria-hidden="true"></span>
      <div class="manager-component-filter-field">
        <span class="manager-component-filter-label">{text('FABRICATE.Admin.Manager.Component.SortBy', 'Sort by')}</span>
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
        <button
          type="button"
          class="manager-button manager-component-sort-direction"
          data-component-sort-direction={ui.sortDirection}
          aria-label={text('FABRICATE.Admin.Manager.Component.SortDirection', 'Toggle sort direction')}
          onclick={toggleSortDirection}
        >
          <i class={ui.sortDirection === 'asc' ? 'fas fa-arrow-down-short-wide' : 'fas fa-arrow-down-wide-short'} aria-hidden="true"></i>
          <span>{ui.sortDirection === 'asc'
            ? text('FABRICATE.Admin.Manager.Component.SortAsc', 'Asc')
            : text('FABRICATE.Admin.Manager.Component.SortDesc', 'Desc')}</span>
        </button>
      </div>
    </div>

    <div class="manager-component-filter-row is-chips">
      {#each chips as chip (chip.id)}
        <span class="manager-chip is-info manager-component-filter-chip" data-component-filter-chip={chip.id}>
          <span>{chipLabel(chip)}</span>
          <button
            type="button"
            class="manager-component-chip-clear"
            aria-label={format('FABRICATE.Admin.Manager.Component.ClearChip', 'Clear {filter} filter', { filter: chip.id })}
            onclick={() => clearChip(chip.id)}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </span>
      {/each}
      <!--
        The count is quiet right-aligned metadata, not a control: a bordered chip read as
        something to press. It reports the page WINDOW ("1–5 of 12") — `paginateComponents`
        has computed `rangeStart`/`rangeEnd` since it was written and nothing read them —
        because "6 of 6" never told the GM which page they were looking at.
      -->
      <span class="manager-component-count" data-component-count>
        {format('FABRICATE.Admin.Manager.Component.CountRange', '{start}–{end} of {total}', {
          start: page.rangeStart,
          end: page.rangeEnd,
          total: page.totalCount
        })}
      </span>
    </div>
  </section>

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Component.Table', 'Components')}>
    {#if (itemCards || []).length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-box-open" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Component.EmptyTitle', 'No components yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Component.EmptyHint', 'Drop Foundry items into this page to add components to the selected system.')}</p>
        </div>
      </div>
    {:else if filteredComponents.length === 0}
      <!-- A filtered-to-nothing library is not an error state and does not want the full
           empty-panel apparatus: one dashed panel says it, and Clear filters is the way
           out (the Recipe Studio's treatment). -->
      <div class="manager-empty manager-component-empty-filtered">
        <div>
          <p>{text('FABRICATE.Admin.Manager.Component.EmptySearchTitle', 'No components match your filters.')}</p>
          <button type="button" class="manager-button" data-clear-filters="components" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</button>
        </div>
      </div>
    {:else}
      <!-- A card row has no columns, so this is a LIST, not a grid: a real
           `<ul role="list">` of `<li>` cards carrying `aria-current`, mirroring the
           Recipe Studio, rather than nested `<div>`s with no selection semantics at all. -->
      <div class="manager-components-list">
        {#if ui.groupByCategory}
          {#each groups as group (group.category)}
            <section class="manager-component-group" data-component-group={group.category}>
              <CollapsibleGroupHeader
                name={categoryLabel(group.category)}
                countText={groupCountText(group)}
                expanded={!isCategoryCollapsed(group.category)}
                controls={`manager-component-group-${group.category}`}
                onToggle={() => toggleCategoryCollapsed(group.category)}
              />
              {#if !isCategoryCollapsed(group.category)}
                <ul class="manager-component-group-body" role="list" id={`manager-component-group-${group.category}`}>
                  {#each group.components as item (item.id)}
                    <ComponentRow {...rowProps(item)} />
                  {:else}
                    <li class="manager-muted manager-component-group-empty">{text('FABRICATE.Admin.Manager.Component.EmptyCategory', 'No components in this category.')}</li>
                  {/each}
                </ul>
              {/if}
            </section>
          {/each}
        {:else}
          <ul class="manager-component-group-body" role="list">
            {#each page.components as item (item.id)}
              <ComponentRow {...rowProps(item)} />
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
    onPageChange={(next) => ui.pageIndex = next}
    onPageSizeChange={(next) => { ui.pageSize = next; ui.pageIndex = 0; }}
  />
</main>
