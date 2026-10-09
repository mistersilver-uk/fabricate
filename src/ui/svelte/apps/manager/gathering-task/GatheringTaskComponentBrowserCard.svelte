<!--
  A d100 gathering task's Components card (issue 1522): a name search, a tag typeahead and a paged
  grid of draggable component cards a GM drops onto a drop rule row. The search, tag picks and page
  are bound from the view, so they survive a tab switch.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import SearchField from '../../../components/SearchField.svelte';
  import Typeahead from '../../../components/Typeahead.svelte';

  let {
    text,
    itemCards = [],
    componentSearchTerm = $bindable(''),
    componentTagSearchTerm = $bindable(''),
    selectedComponentTags = $bindable([]),
    componentPageIndex = $bindable(0),
    componentPageSize = $bindable(6),
  } = $props();

  const componentCards = $derived(Array.isArray(itemCards) ? itemCards : []);
  const normalizedComponentSearchTerm = $derived(componentSearchTerm.trim().toLowerCase());
  const componentTagOptions = $derived(
    uniqueSorted(componentCards.flatMap((item) => (Array.isArray(item.tags) ? item.tags : [])))
  );
  function componentTagSuggestions(query) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return componentTagOptions.filter(
      (tag) => !selectedComponentTags.includes(tag) && tag.toLowerCase().includes(needle)
    );
  }
  const filteredComponentCards = $derived(
    componentCards.filter((item) => {
      const name = String(item?.name || '').toLowerCase();
      const itemTags = Array.isArray(item?.tags) ? item.tags : [];
      const matchesName =
        !normalizedComponentSearchTerm || name.includes(normalizedComponentSearchTerm);
      const matchesTags =
        selectedComponentTags.length === 0 ||
        selectedComponentTags.every((tag) => itemTags.includes(tag));
      return matchesName && matchesTags;
    })
  );
  const paginatedComponentCards = $derived(
    filteredComponentCards.slice(
      componentPageIndex * componentPageSize,
      (componentPageIndex + 1) * componentPageSize
    )
  );
  // A card's linked source document resolves on demand (issue 1081), and nothing else here mounts
  // `ComponentsBrowserView`, so this card asks for its own page.
  $effect(() => {
    for (const card of paginatedComponentCards) card?.hydrate?.()?.catch?.(() => {});
  });
  const componentShowingStart = $derived(
    filteredComponentCards.length === 0 ? 0 : componentPageIndex * componentPageSize + 1
  );
  const componentShowingEnd = $derived(
    Math.min(filteredComponentCards.length, (componentPageIndex + 1) * componentPageSize)
  );

  $effect(() => {
    if (
      componentPageIndex > 0 &&
      componentPageIndex * componentPageSize >= filteredComponentCards.length
    )
      componentPageIndex = 0;
  });

  function uniqueSorted(values) {
    return Array.from(
      new Set(values.map((value) => String(value || '').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  function componentCardImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function componentDescription(item) {
    return String(item?.description || '').trim();
  }

  function addComponentTag(tag) {
    const normalizedTag = String(tag || '').trim();
    if (!normalizedTag || selectedComponentTags.includes(normalizedTag)) return;
    selectedComponentTags = [...selectedComponentTags, normalizedTag];
    componentTagSearchTerm = '';
    componentPageIndex = 0;
  }

  function removeComponentTag(tag) {
    selectedComponentTags = selectedComponentTags.filter((value) => value !== tag);
    componentPageIndex = 0;
  }

  // Takes the value: `<SearchField>` hands `onChange` the new string.
  function onComponentSearchInput(next) {
    componentSearchTerm = next;
    componentPageIndex = 0;
  }

  const tagSearchLabel = $derived(
    text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentTags', 'Search component tags')
  );

  function onComponentDragStart(item, event) {
    const componentId = String(item?.id || '').trim();
    if (!componentId) return;
    event.dataTransfer?.setData?.(
      'text/plain',
      JSON.stringify({
        type: 'FabricateManagedComponent',
        componentId,
      })
    );
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
  }
</script>

<section class="manager-task-component-browser-card" data-gathering-task-component-browser>
  <div class="manager-task-card-header">
    <div class="manager-task-drop-header-copy">
      <h3>
        {text('FABRICATE.Admin.Manager.Environment.Tasks.ComponentBrowser', 'Components')}
      </h3>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Environment.Tasks.ComponentBrowserHint',
          'Drag a component onto any drop rule row to assign or replace it.'
        )}
      </p>
    </div>
    <div class="manager-task-component-browser-controls">
      <SearchField
        density="compact"
        value={componentSearchTerm}
        onChange={onComponentSearchInput}
        placeholder={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsPlaceholder',
          'Search components...'
        )}
        ariaLabel={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsByName',
          'Search component names'
        )}
        data-gathering-component-name-search=""
      />
      <Typeahead
        class="manager-task-component-tag-search"
        density="compact"
        icon="fas fa-tags"
        bind:query={componentTagSearchTerm}
        source={componentTagSuggestions}
        itemLabel={(tag) => tag}
        onChoose={addComponentTag}
        placeholder={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.SearchTagsPlaceholder',
          'Search tags...'
        )}
        ariaLabel={tagSearchLabel}
        listClass="manager-task-component-tag-suggestions"
        listProps={{ 'data-gathering-component-tag-suggestions': '' }}
        listMaxHeight={132}
        optionDataAttr="data-gathering-component-tag-suggestion"
        data-gathering-component-tag-search=""
      />
    </div>
  </div>

  {#if selectedComponentTags.length > 0}
    <div
      class="manager-toolbar-pills manager-selected-tag-row manager-task-component-pills"
      role="list"
      aria-label={text('FABRICATE.Admin.Manager.Component.SelectedTags', 'Selected component tags')}
      data-gathering-component-tag-pills
    >
      {#each selectedComponentTags as tag (tag)}
        <Chip
          class="manager-selected-tag-pill"
          role="listitem"
          data-gathering-component-tag-pill={tag}
        >
          {tag}
          <button
            type="button"
            data-keyboard-focus="true"
            aria-label={text(
              'FABRICATE.Admin.Manager.Environment.Tasks.RemoveComponentTagFilter',
              'Remove {tag}'
            ).replace('{tag}', tag)}
            onclick={() => removeComponentTag(tag)}
          >
            <i class="fas fa-xmark" aria-hidden="true"></i>
          </button>
        </Chip>
      {/each}
    </div>
  {/if}

  <div class="manager-task-component-browser-scroll" data-gathering-task-component-browser-scroll>
    {#if componentCards.length === 0}
      <EmptyState
        compact
        icon="fas fa-box-open"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.NoComponents',
          'No components available'
        )}
      />
    {:else if filteredComponentCards.length === 0}
      <EmptyState
        compact
        icon="fas fa-search"
        title={text(
          'FABRICATE.Admin.Manager.Environment.Tasks.EmptyComponentSearchTitle',
          'No components match these filters'
        )}
      />
    {:else}
      <div class="manager-task-component-grid" data-gathering-task-component-grid role="list">
        {#each paginatedComponentCards as item (item.id)}
          <div
            class="manager-task-component-card"
            role="listitem"
            draggable="true"
            data-gathering-component-card={item.id}
            ondragstart={(event) => onComponentDragStart(item, event)}
          >
            <img class="manager-task-component-card-image" src={componentCardImage(item)} alt="" />
            <span class="manager-task-component-card-copy">
              <strong>{item.name}</strong>
              <span
                >{componentDescription(item) ||
                  text(
                    'FABRICATE.Admin.Manager.NoDescriptionAdded',
                    'No description has been added.'
                  )}</span
              >
              {#if Array.isArray(item.tags) && item.tags.length > 0}
                <span class="manager-task-component-card-tags">
                  {#each item.tags.slice(0, 3) as tag (tag)}
                    <small>{tag}</small>
                  {/each}
                </span>
              {/if}
            </span>
            <span class="manager-task-component-card-grip" aria-hidden="true">⋮⋮</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="manager-task-component-browser-footer">
    <span class="manager-muted manager-drop-count" data-gathering-component-count
      >{text(
        'FABRICATE.Admin.Manager.Environment.Tasks.ShowingComponents',
        'Showing {start}-{end} of {total} components'
      )
        .replace('{start}', componentShowingStart)
        .replace('{end}', componentShowingEnd)
        .replace('{total}', filteredComponentCards.length)}</span
    >
    <Pagination
      totalCount={filteredComponentCards.length}
      pageSize={componentPageSize}
      pageIndex={componentPageIndex}
      pageSizeOptions={[6, 9, 12]}
      onPageChange={(next) => (componentPageIndex = next)}
      onPageSizeChange={(next) => {
        componentPageSize = next;
        componentPageIndex = 0;
      }}
    />
  </div>
</section>
