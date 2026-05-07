<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    essenceCards = [],
    showSourceUi = false,
    selectedEssenceId = '',
    onSelectEssence = () => {},
    onEditEssence = () => {},
    onRemoveEssence = () => {}
  } = $props();

  let searchTerm = $state('');
  let sourceFilter = $state('all');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filtersActive = $derived(normalizedSearchTerm.length > 0 || sourceFilter !== 'all');
  const filteredEssences = $derived((essenceCards || []).filter(essence => {
    const matchesSearch = !normalizedSearchTerm
      || [
        essence.name || '',
        essence.description || '',
        showSourceUi ? essence.sourceName || '' : '',
        essence.id || ''
      ].join(' ').toLowerCase().includes(normalizedSearchTerm);
    const state = essence.sourceState || 'none';
    const matchesSource = !showSourceUi
      || sourceFilter === 'all'
      || (sourceFilter === 'linked' && state === 'linked')
      || (sourceFilter === 'needs-attention' && (state === 'stale' || state === 'missing'))
      || (sourceFilter === 'none' && state === 'none');
    return matchesSearch && matchesSource;
  }));
  const paginatedEssences = $derived(filteredEssences.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredEssences.length) {
      pageIndex = 0;
    }
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function editEssence(essence, event) {
    event?.stopPropagation();
    onEditEssence(essence.id);
  }

  function removeEssence(essence, event) {
    event?.stopPropagation();
    if (essence.deleteBlocked) return;
    onRemoveEssence(essence.id);
  }

  function selectEssenceFromKeyboard(event, essenceId) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelectEssence(essenceId);
  }

  function clearSearch() {
    searchTerm = '';
    sourceFilter = 'all';
  }

  function sourceImageLabel(essence) {
    return essence?.associatedItem?.name
      || essence?.associatedItemName
      || essence?.sourceName
      || text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source');
  }
</script>

<main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Title', 'Essences')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Essence.Kicker', 'Essence definitions')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.Essence.Library', 'Essence browser')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.Essence.LibraryHint', 'Browse, create, and maintain essence definitions for the selected crafting system.')}</p>
    </div>
  </section>

  <section class="manager-v2-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Filters', 'Essence filters')}>
    <label class="manager-v2-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        value={searchTerm}
        oninput={(event) => searchTerm = event.currentTarget.value}
        placeholder={text('FABRICATE.Admin.ManagerV2.Essence.SearchPlaceholder', 'Search essences...')}
        aria-label={text('FABRICATE.Admin.ManagerV2.Essence.SearchLabel', 'Search essences')}
      />
    </label>
    {#if showSourceUi}
      <label class="manager-v2-filter">
        <span>{text('FABRICATE.Admin.ManagerV2.Essence.SourceFilter', 'Source')}</span>
        <select value={sourceFilter} onchange={(event) => sourceFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Essence.SourceFilterLabel', 'Filter essences by source state')}>
          <option value="all">{text('FABRICATE.Admin.ManagerV2.Essence.SourceAll', 'All sources')}</option>
          <option value="linked">{text('FABRICATE.Admin.ManagerV2.Essence.SourceLinkedFilter', 'Linked')}</option>
          <option value="needs-attention">{text('FABRICATE.Admin.ManagerV2.Essence.SourceNeedsAttention', 'Needs attention')}</option>
          <option value="none">{text('FABRICATE.Admin.ManagerV2.Essence.SourceNone', 'No source')}</option>
        </select>
      </label>
    {/if}
    <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredEssences.length).replace('{total}', essenceCards.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-v2-button manager-v2-clear-filters" data-clear-filters="essences" onclick={clearSearch}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Table', 'Essences table')}>
    {#if essenceCards.length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Essence.EmptyTitle', 'No essences yet')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Essence.EmptyHint', 'Create an essence definition to start assigning essence quantities to components.')}</p>
        </div>
      </div>
    {:else if filteredEssences.length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySearchTitle', 'No essences match these filters')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Essence.EmptySearchHint', 'Clear search and filters to show all essences in this system.')}</p>
          <button type="button" class="manager-v2-button" onclick={clearSearch}>{text('FABRICATE.Admin.ManagerV2.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <div class={`manager-v2-essences-table ${showSourceUi ? '' : 'has-no-source'}`} role="table" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.TableShort', 'Essences')}>
        <div class="manager-v2-table-head manager-v2-essence-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Essence.ColumnEssence', 'Essence')}</span>
          {#if showSourceUi}
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Essence.Usage', 'Usage')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedEssences as essence (essence.id)}
          <div
            class={`manager-v2-essence-row ${selectedEssenceId === essence.id ? 'is-selected' : ''}`}
            role="row"
            tabindex="0"
            aria-selected={selectedEssenceId === essence.id}
            data-essence-id={essence.id}
            onclick={() => onSelectEssence(essence.id)}
            onkeydown={(event) => selectEssenceFromKeyboard(event, essence.id)}
          >
            <span class="manager-v2-essence-identity" role="cell">
              <span class="manager-v2-essence-icon" aria-hidden="true"><i class={essence.icon || 'fas fa-mortar-pestle'}></i></span>
              <span class="manager-v2-system-copy">
                <span class="manager-v2-system-name" title={essence.name}>{essence.name}</span>
                <span class="manager-v2-system-description" title={essence.description || essence.id}>{essence.description || essence.id}</span>
              </span>
            </span>
            {#if showSourceUi}
              <span role="cell" class="manager-v2-labeled-cell manager-v2-essence-source-cell" data-label={text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}>
                {#if essence.associatedItem}
                  <img
                    class="manager-v2-essence-source-cell-image"
                    src={essence.associatedItem.img || 'icons/svg/item-bag.svg'}
                    alt={sourceImageLabel(essence)}
                    title={sourceImageLabel(essence)}
                    aria-label={sourceImageLabel(essence)}
                  />
                {:else}
                  <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Essence.SourceNoneShort', 'None')}</span>
                {/if}
              </span>
            {/if}
            <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Essence.Usage', 'Usage')}>
              <span class={essence.deleteBlocked ? 'manager-v2-chip is-warning' : 'manager-v2-chip'}>
                {text('FABRICATE.Admin.ManagerV2.Essence.ComponentUsageCount', '{count} components').replace('{count}', essence.componentUsageCount || 0)}
              </span>
            </span>
            <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.EditNamed', 'Edit {name}').replace('{name}', essence.name)} title={text('FABRICATE.Admin.ManagerV2.Essence.Edit', 'Edit essence')} onclick={(event) => editEssence(essence, event)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.DeleteNamed', 'Delete {name}').replace('{name}', essence.name)} title={essence.deleteBlocked ? text('FABRICATE.Admin.ManagerV2.Essence.DeleteBlocked', 'Remove component usage before deleting this essence.') : text('FABRICATE.Admin.ManagerV2.Essence.Delete', 'Delete essence')} disabled={essence.deleteBlocked} onclick={(event) => removeEssence(essence, event)}>
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredEssences.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</main>
