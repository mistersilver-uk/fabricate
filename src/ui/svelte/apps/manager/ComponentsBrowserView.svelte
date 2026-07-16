<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import CollapsibleGroupHeader from '../../components/CollapsibleGroupHeader.svelte';
  import ComponentRow from './components/ComponentRow.svelte';
  import {
    COMPONENT_SORT_KEYS,
    componentCategoryOptions,
    createComponentBrowserState,
    filterComponents,
    groupComponentsByCategory,
    paginateComponents,
    sortComponents
  } from '../../../../utils/componentBrowserModel.js';
  import {
    GENERAL_COMPONENT_CATEGORY,
    getComponentCategoryLabel
  } from '../../../../utils/componentCategories.js';

  let {
    itemCards = [],
    totalComponentsCount = 0,
    itemSearchTerm = '',
    selectedComponentId = '',
    selectedSystemName = '',
    selectedSystemId = '',
    selectedSystemResolutionMode = 'simple',
    categoryVocabulary = [],
    dropEnabled = false,
    onSearchChange = () => {},
    onSelectComponent = () => {},
    onDropComponent = () => {},
    onEditComponent = () => {},
    onDeleteComponent = () => {},
    onCopySourceUuid = () => {},
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
  const sortedComponents = $derived(sortComponents(filteredComponents, {
    key: ui.sortKey,
    direction: ui.sortDirection
  }));
  const page = $derived(paginateComponents(sortedComponents, {
    pageIndex: ui.pageIndex,
    pageSize: ui.pageSize
  }));
  const groups = $derived(ui.groupByCategory ? groupComponentsByCategory(page.components) : []);

  const filtersActive = $derived(
    (itemSearchTerm || '').trim().length > 0
    || ui.categoryFilter !== 'all'
    || ui.essenceFilter !== 'all'
  );

  const sortOptions = $derived(COMPONENT_SORT_KEYS.map(key => ({
    key,
    label: sortLabel(key)
  })));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
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

  function componentSourceOrigin(item) {
    if (item?.sourceMissing) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.Manager.Component.SourceOriginMissing', 'Missing'),
        className: 'is-warning'
      };
    }
    const origin = item?.sourceOrigin || '';
    if (origin === 'compendium') {
      return {
        id: 'compendium',
        label: item?.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginCompendium', 'Compendium'),
        className: 'is-active'
      };
    }
    if (origin === 'world') {
      return {
        id: 'world',
        label: item?.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginWorld', 'Items Directory'),
        className: 'is-active'
      };
    }
    return {
      id: 'unknown',
      label: item?.sourceOriginLabel || text('FABRICATE.Admin.Manager.Component.SourceOriginUnknown', 'Unknown'),
      className: 'is-disabled'
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

  function groupCountText(count) {
    return text('FABRICATE.Admin.Manager.Component.GroupCount', '{count} components').replace('{count}', count);
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

  function rowProps(item) {
    const origin = componentSourceOrigin(item);
    return {
      component: item,
      selected: isSelectedComponent(item),
      categoryBadge: categoryBadgeFor(item),
      difficultyBadge: difficultyBadgeFor(item),
      originLabel: origin.label,
      originClass: origin.className,
      editLabel: text('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}').replace('{name}', item.name),
      editTitle: text('FABRICATE.Admin.Manager.Component.Edit', 'Edit component'),
      deleteLabel: text('FABRICATE.Admin.Manager.Component.DeleteNamed', 'Delete {name}').replace('{name}', item.name),
      deleteTitle: text('FABRICATE.Admin.Manager.Component.Delete', 'Delete component'),
      copyLabel: text('FABRICATE.Admin.Manager.Component.CopySourceNamed', 'Copy source UUID for {name}').replace('{name}', item.name),
      noDescriptionText: text('FABRICATE.Admin.Manager.NoDescription', 'No description'),
      onSelect: onSelectComponent,
      onEdit: onEditComponent,
      onDelete: onDeleteComponent,
      onCopySourceUuid
    };
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Component.Library', 'Component directory')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.Component.LibraryHint', 'Crafting metadata on borrowed Foundry items — category, tags, essence contributions and salvage.')}</p>
    </div>
  </section>

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

  <section class="manager-toolbar" aria-label={text('FABRICATE.Admin.Manager.Component.Filters', 'Component filters')}>
    <div class="manager-toolbar-primary">
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

      <label class="manager-filter">
        <span>{text('FABRICATE.Admin.Manager.Component.CategoryFilter', 'Category')}</span>
        <select
          value={ui.categoryFilter}
          data-component-category-filter
          onchange={(event) => setCategoryFilter(event.currentTarget.value)}
          aria-label={text('FABRICATE.Admin.Manager.Component.CategoryFilterLabel', 'Filter components by category')}
        >
          <option value="all">{text('FABRICATE.Admin.Manager.Component.CategoryAll', 'All categories')}</option>
          {#each categoryOptions as category (category)}
            <option value={category}>{categoryLabel(category)}</option>
          {/each}
        </select>
      </label>

      {#if showComponentEssences && componentEssenceOptions.length > 0}
        <label class="manager-filter">
          <span>{text('FABRICATE.Admin.Manager.Component.Essences', 'Essences')}</span>
          <select value={ui.essenceFilter} onchange={(event) => setEssenceFilter(event.currentTarget.value)} aria-label={text('FABRICATE.Admin.Manager.Component.EssenceFilterLabel', 'Filter components by essence')}>
            <option value="all">{text('FABRICATE.Admin.Manager.Component.EssenceAll', 'All essences')}</option>
            {#each componentEssenceOptions as essence (essence)}
              <option value={essence}>{essence}</option>
            {/each}
          </select>
        </label>
      {/if}

      <label class="manager-filter">
        <span>{text('FABRICATE.Admin.Manager.Component.SortBy', 'Sort by')}</span>
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
      </label>

      <button
        type="button"
        class="manager-button manager-component-sort-direction"
        data-component-sort-direction={ui.sortDirection}
        aria-pressed={ui.sortDirection === 'desc'}
        onclick={toggleSortDirection}
        title={text('FABRICATE.Admin.Manager.Component.SortDirection', 'Toggle sort direction')}
      >
        <i class={ui.sortDirection === 'asc' ? 'fas fa-arrow-down-a-z' : 'fas fa-arrow-down-z-a'} aria-hidden="true"></i>
        <span>{ui.sortDirection === 'asc'
          ? text('FABRICATE.Admin.Manager.Component.SortAsc', 'Asc')
          : text('FABRICATE.Admin.Manager.Component.SortDesc', 'Desc')}</span>
      </button>

      <button
        type="button"
        class="manager-button manager-component-group-toggle"
        data-component-group-by-category
        aria-pressed={ui.groupByCategory}
        onclick={toggleGroupByCategory}
      >
        <i class={ui.groupByCategory ? 'fas fa-folder-open' : 'fas fa-folder'} aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Component.GroupByCategory', 'Group by category')}</span>
      </button>

      <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredComponents.length).replace('{total}', totalComponentsCount)}</span>
      {#if filtersActive}
        <button type="button" class="manager-button manager-clear-filters" data-clear-filters="components" onclick={clearFilters}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
        </button>
      {/if}
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
      <div class="manager-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Component.EmptySearchTitle', 'No components match these filters')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Component.EmptySearchHint', 'Clear search and filters to show all components in this system.')}</p>
          <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <!-- A LIST of rows, not a grid: the table/row/columnheader/cell ARIA scaffolding
           is dropped rather than left orphaned on a non-table structure. -->
      <div class="manager-components-list">
        {#if ui.groupByCategory}
          {#each groups as group (group.category)}
            <section class="manager-component-group" data-component-group={group.category}>
              <CollapsibleGroupHeader
                name={categoryLabel(group.category)}
                countText={groupCountText(group.components.length)}
                expanded={!isCategoryCollapsed(group.category)}
                controls={`manager-component-group-${group.category}`}
                onToggle={() => toggleCategoryCollapsed(group.category)}
              />
              {#if !isCategoryCollapsed(group.category)}
                <div class="manager-component-group-body" id={`manager-component-group-${group.category}`}>
                  {#each group.components as item (item.id)}
                    <ComponentRow {...rowProps(item)} />
                  {:else}
                    <p class="manager-muted manager-component-group-empty">{text('FABRICATE.Admin.Manager.Component.EmptyCategory', 'No components in this category.')}</p>
                  {/each}
                </div>
              {/if}
            </section>
          {/each}
        {:else}
          {#each page.components as item (item.id)}
            <ComponentRow {...rowProps(item)} />
          {/each}
        {/if}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredComponents.length}
    pageSize={ui.pageSize}
    pageIndex={page.pageIndex}
    onPageChange={(next) => ui.pageIndex = next}
    onPageSizeChange={(next) => { ui.pageSize = next; ui.pageIndex = 0; }}
  />
</main>
