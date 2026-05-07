<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    itemCards = [],
    totalComponentsCount = 0,
    itemSearchTerm = '',
    selectedComponentId = '',
    selectedSystemName = '',
    selectedSystemId = '',
    selectedSystemResolutionMode = 'simple',
    dropEnabled = false,
    onSearchChange = () => {},
    onSelectComponent = () => {},
    onDropComponent = () => {},
    onEditComponent = () => {},
    onDeleteComponent = () => {},
    onCopySourceUuid = () => {}
  } = $props();

  let selectedTagFilters = $state([]);
  let tagSearchTerm = $state('');
  let essenceFilter = $state('all');
  let lastSystemId = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  $effect(() => {
    if (selectedSystemId === lastSystemId) return;
    selectedTagFilters = [];
    tagSearchTerm = '';
    essenceFilter = 'all';
    lastSystemId = selectedSystemId;
  });

  const showComponentTags = $derived((itemCards || []).some(item => item.showTags || (Array.isArray(item.tags) && item.tags.length > 0)));
  const showComponentEssences = $derived((itemCards || []).some(item => item.showEssences || (Array.isArray(item.essences) && item.essences.length > 0)));
  const componentTagOptions = $derived(uniqueSorted((itemCards || []).flatMap(item => Array.isArray(item.tags) ? item.tags : [])));
  const componentEssenceOptions = $derived(uniqueSorted((itemCards || []).flatMap(item => Array.isArray(item.essences) ? item.essences.map(essence => essence.name || essence.id) : [])));
  const normalizedTagSearchTerm = $derived((tagSearchTerm || '').trim().toLowerCase());
  const tagSearchSuggestions = $derived(normalizedTagSearchTerm
    ? componentTagOptions.filter(tag =>
        !selectedTagFilters.includes(tag)
        && tag.toLowerCase().includes(normalizedTagSearchTerm)
      )
    : []);
  const filteredComponents = $derived((itemCards || []).filter(item => {
    const itemTags = Array.isArray(item.tags) ? item.tags : [];
    const matchesTag = selectedTagFilters.length === 0
      || selectedTagFilters.every(tag => itemTags.includes(tag));
    const matchesEssence = essenceFilter === 'all'
      || (Array.isArray(item.essences) && item.essences.some(essence => (essence.name || essence.id) === essenceFilter));
    return matchesTag && matchesEssence;
  }));
  const showProgressiveDifficulty = $derived(
    selectedSystemResolutionMode === 'progressive'
    && filteredComponents.some(item => Object.prototype.hasOwnProperty.call(item, 'difficulty'))
  );
  const filtersActive = $derived(
    (itemSearchTerm || '').trim().length > 0
    || selectedTagFilters.length > 0
    || (tagSearchTerm || '').trim().length > 0
    || essenceFilter !== 'all'
  );
  const componentTableClass = $derived([
    'manager-v2-components-table',
    showComponentTags ? '' : 'has-no-tags',
    showComponentEssences ? '' : 'has-no-essences',
    showProgressiveDifficulty ? 'has-progressive-difficulty' : ''
  ].filter(Boolean).join(' '));
  const paginatedComponents = $derived(filteredComponents.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredComponents.length) {
      pageIndex = 0;
    }
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function stackedLabel(key, fallback) {
    return `${text(key, fallback)}:`;
  }

  function componentImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function componentSourceOrigin(item) {
    if (item?.sourceMissing) {
      return {
        id: 'missing',
        label: text('FABRICATE.Admin.ManagerV2.Component.SourceOriginMissing', 'Missing'),
        className: 'is-warning'
      };
    }
    const origin = item?.sourceOrigin || '';
    if (origin === 'compendium') {
      return {
        id: 'compendium',
        label: item?.sourceOriginLabel || text('FABRICATE.Admin.ManagerV2.Component.SourceOriginCompendium', 'Compendium'),
        className: 'is-active'
      };
    }
    if (origin === 'world') {
      return {
        id: 'world',
        label: item?.sourceOriginLabel || text('FABRICATE.Admin.ManagerV2.Component.SourceOriginWorld', 'Items Directory'),
        className: 'is-active'
      };
    }
    return {
      id: 'unknown',
      label: item?.sourceOriginLabel || text('FABRICATE.Admin.ManagerV2.Component.SourceOriginUnknown', 'Unknown'),
      className: 'is-disabled'
    };
  }

  function usageEvidenceItems(item) {
    if (!item?.usageCounts || typeof item.usageCounts !== 'object') return [];
    const labels = {
      ingredient: text('FABRICATE.Admin.ManagerV2.Component.UsageIngredient', 'Ingredient usage'),
      result: text('FABRICATE.Admin.ManagerV2.Component.UsageResult', 'Result usage'),
      catalyst: text('FABRICATE.Admin.ManagerV2.Component.UsageCatalyst', 'Catalyst usage'),
      gathering: text('FABRICATE.Admin.ManagerV2.Component.UsageGathering', 'Gathering usage'),
      salvage: text('FABRICATE.Admin.ManagerV2.Component.UsageSalvage', 'Salvage usage')
    };
    return Object.entries(item.usageCounts)
      .filter(([, count]) => Number.isFinite(Number(count)))
      .map(([key, count]) => ({
        id: `usage-${key}`,
        label: labels[key] || key,
        value: Number(count)
      }));
  }

  function salvageSummaryLabel(summary) {
    const parts = [
      text('FABRICATE.Admin.ManagerV2.Component.SalvageQuantity', '{count} required')
        .replace('{count}', summary.quantityRequired ?? 1)
    ];
    if (summary.catalystCount > 0) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageCatalysts', '{count} catalysts').replace('{count}', summary.catalystCount));
    if (summary.resultGroupCount > 0) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageResults', '{count} result groups').replace('{count}', summary.resultGroupCount));
    if (summary.outcomeCount > 0) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageOutcomes', '{count} outcomes').replace('{count}', summary.outcomeCount));
    if (summary.hasTimeRequirement) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageTime', 'time'));
    if (summary.hasCurrencyRequirement) parts.push(text('FABRICATE.Admin.ManagerV2.Component.SalvageCost', 'cost'));
    return parts.join(', ');
  }

  function componentEvidenceItems(item) {
    const evidence = [];
    if (!item) return evidence;
    if (Object.prototype.hasOwnProperty.call(item, 'difficulty')) {
      evidence.push({
        id: 'difficulty',
        label: text('FABRICATE.Admin.ManagerV2.Component.ProgressiveDifficulty', 'Progressive difficulty'),
        value: item.difficulty
      });
    }
    if (item.salvageSummary) {
      evidence.push({
        id: 'salvage',
        label: text('FABRICATE.Admin.ManagerV2.Component.Salvage', 'Salvage'),
        value: salvageSummaryLabel(item.salvageSummary)
      });
    }
    for (const fact of usageEvidenceItems(item)) {
      evidence.push(fact);
    }
    return evidence;
  }

  function isSelectedComponent(item) {
    return !!selectedComponentId && item.id === selectedComponentId;
  }

  function addTagFilter(tag) {
    const normalized = String(tag || '').trim();
    if (!normalized || selectedTagFilters.includes(normalized)) return;
    selectedTagFilters = [...selectedTagFilters, normalized];
    tagSearchTerm = '';
    pageIndex = 0;
  }

  function removeTagFilter(tag) {
    selectedTagFilters = selectedTagFilters.filter(selected => selected !== tag);
    pageIndex = 0;
  }

  function removeTagFilterFromContext(event, tag) {
    event.preventDefault();
    removeTagFilter(tag);
  }

  function setEssenceFilter(value) {
    essenceFilter = value;
    pageIndex = 0;
  }

  function clearFilters() {
    selectedTagFilters = [];
    tagSearchTerm = '';
    essenceFilter = 'all';
    pageIndex = 0;
    onSearchChange('');
  }
</script>

<main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.Nav.Components', 'Components')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{selectedSystemName || text('FABRICATE.Admin.ManagerV2.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.Component.Library', 'Component directory')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.Component.LibraryHint', 'Browse item-backed components and open the existing component editor for changes.')}</p>
    </div>
  </section>

  <section
    class="manager-v2-component-drop-zone"
    use:dragDrop={{ onDrop: onDropComponent, disabled: !dropEnabled, activeClass: 'is-drop-active' }}
    aria-label={text('FABRICATE.Admin.ManagerV2.Component.DropZoneLabel', 'Drop Foundry items to add components')}
  >
    <i class="fas fa-download" aria-hidden="true"></i>
    <span>
      <strong>{text('FABRICATE.Admin.ManagerV2.Component.DropZoneTitle', 'Drop items to add components')}</strong>
      <small>{text('FABRICATE.Admin.ManagerV2.Component.DropZoneHint', 'World, compendium, pack, or folder drops use the existing component import flow for the selected system.')}</small>
    </span>
  </section>

  <section class="manager-v2-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.Component.Filters', 'Component filters')}>
    <div class="manager-v2-toolbar-primary">
      <label class="manager-v2-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={itemSearchTerm || ''}
          oninput={(event) => onSearchChange(event.currentTarget.value)}
          placeholder={text('FABRICATE.Admin.ManagerV2.Component.SearchPlaceholder', 'Search components...')}
          aria-label={text('FABRICATE.Admin.ManagerV2.Component.SearchLabel', 'Search components')}
        />
      </label>
      {#if showComponentTags && componentTagOptions.length > 0}
        <div class="manager-v2-tag-search" data-component-tag-search>
          <label class="manager-v2-filter manager-v2-tag-search-label">
            <span>{text('FABRICATE.Admin.ManagerV2.Component.Tags', 'Tags')}</span>
            <input
              type="search"
              value={tagSearchTerm}
              oninput={(event) => tagSearchTerm = event.currentTarget.value}
              placeholder={text('FABRICATE.Admin.ManagerV2.Component.TagSearchPlaceholder', 'Search tags...')}
              aria-label={text('FABRICATE.Admin.ManagerV2.Component.TagSearchLabel', 'Search component tags')}
              aria-controls="manager-v2-component-tag-suggestions"
            />
          </label>
          {#if normalizedTagSearchTerm.length > 0}
            <div id="manager-v2-component-tag-suggestions" class="manager-v2-tag-suggestions" role="listbox" aria-label={text('FABRICATE.Admin.ManagerV2.Component.TagSuggestions', 'Matching component tags')}>
              {#each tagSearchSuggestions as tag}
                <button type="button" role="option" aria-selected="false" class="manager-v2-tag-suggestion" onclick={() => addTagFilter(tag)}>
                  <i class="fas fa-tag" aria-hidden="true"></i>
                  <span>{tag}</span>
                </button>
              {:else}
                <span class="manager-v2-tag-no-matches">{text('FABRICATE.Admin.ManagerV2.Component.TagNoMatches', 'No matching tags')}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      {#if showComponentEssences && componentEssenceOptions.length > 0}
        <label class="manager-v2-filter">
          <span>{text('FABRICATE.Admin.ManagerV2.Component.Essences', 'Essences')}</span>
          <select value={essenceFilter} onchange={(event) => setEssenceFilter(event.currentTarget.value)} aria-label={text('FABRICATE.Admin.ManagerV2.Component.EssenceFilterLabel', 'Filter components by essence')}>
            <option value="all">{text('FABRICATE.Admin.ManagerV2.Component.EssenceAll', 'All essences')}</option>
            {#each componentEssenceOptions as essence}
              <option value={essence}>{essence}</option>
            {/each}
          </select>
        </label>
      {/if}
      <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredComponents.length).replace('{total}', totalComponentsCount)}</span>
      {#if filtersActive}
        <button type="button" class="manager-v2-button manager-v2-clear-filters" data-clear-filters="components" onclick={clearFilters}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.ClearFilters', 'Clear filters')}</span>
        </button>
      {/if}
    </div>
    {#if selectedTagFilters.length > 0}
      <div class="manager-v2-toolbar-pills manager-v2-selected-tag-row" role="list" aria-label={text('FABRICATE.Admin.ManagerV2.Component.SelectedTags', 'Selected component tags')}>
        {#each selectedTagFilters as tag}
          <span class="manager-v2-chip manager-v2-selected-tag-pill" role="listitem" data-component-tag-pill={tag} oncontextmenu={(event) => removeTagFilterFromContext(event, tag)}>
            <span>{tag}</span>
            <button type="button" aria-label={text('FABRICATE.Admin.ManagerV2.Component.RemoveTagNamed', 'Remove tag {name}').replace('{name}', tag)} title={text('FABRICATE.Admin.ManagerV2.Component.RemoveTag', 'Remove tag')} onclick={() => removeTagFilter(tag)}>
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </span>
        {/each}
      </div>
    {/if}
  </section>

  <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Component.Table', 'Components table')}>
    {#if (itemCards || []).length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-box-open" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Component.EmptyTitle', 'No components yet')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Component.EmptyHint', 'Drop Foundry items into this page to add components to the selected system.')}</p>
        </div>
      </div>
    {:else if filteredComponents.length === 0}
      <div class="manager-v2-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.ManagerV2.Component.EmptySearchTitle', 'No components match these filters')}</h3>
          <p>{text('FABRICATE.Admin.ManagerV2.Component.EmptySearchHint', 'Clear search and filters to show all components in this system.')}</p>
          <button type="button" class="manager-v2-button" onclick={clearFilters}>{text('FABRICATE.Admin.ManagerV2.ClearSearch', 'Clear search')}</button>
        </div>
      </div>
    {:else}
      <div class={componentTableClass} role="table" aria-label={text('FABRICATE.Admin.ManagerV2.Component.TableShort', 'Components')}>
        <div class="manager-v2-table-head manager-v2-component-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Component.Column.Component', 'Component')}</span>
          {#if showComponentTags}
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Component.Tags', 'Tags')}</span>
          {/if}
          {#if showComponentEssences}
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Component.Essences', 'Essences')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Component.Origin', 'Origin')}</span>
          {#if showProgressiveDifficulty}
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Component.ProgressiveDifficulty', 'Progressive difficulty')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedComponents as item (item.id)}
          <div class={`manager-v2-component-row ${isSelectedComponent(item) ? 'is-selected' : ''}`} role="row" aria-selected={isSelectedComponent(item)} data-component-id={item.id}>
            <button type="button" class="manager-v2-component-identity" onclick={() => onSelectComponent(item.id)} role="cell">
              <img class="manager-v2-component-thumb" src={componentImage(item)} alt="" />
              <span class="manager-v2-system-copy">
                <span class="manager-v2-system-name" title={item.name}>{item.name}</span>
                {#if item.description}
                  <span class="manager-v2-system-description" title={item.description}>{item.description}</span>
                {:else}
                  <span class="manager-v2-system-description">{text('FABRICATE.Admin.ManagerV2.NoDescription', 'No description')}</span>
                {/if}
              </span>
            </button>
            {#if showComponentTags}
              <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Component.Tags', 'Tags')}>
                <span class="manager-v2-chip-row">
                  {#each item.tags || [] as tag}
                    <span class="manager-v2-chip">{tag}</span>
                  {:else}
                    <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.NoTags', 'No tags')}</span>
                  {/each}
                </span>
              </span>
            {/if}
            {#if showComponentEssences}
              <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Component.Essences', 'Essences')}>
                <span class="manager-v2-chip-row">
                  {#each item.essences || [] as essence}
                    <span class="manager-v2-chip manager-v2-essence-compact-chip" title={`${essence.name || essence.id} ${essence.quantity}`} aria-label={`${essence.name || essence.id} ${essence.quantity}`}>
                      <i class={essence.icon || 'fas fa-mortar-pestle'} aria-hidden="true"></i>{essence.quantity}
                    </span>
                  {:else}
                    <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.NoEssences', 'No essences')}</span>
                  {/each}
                </span>
              </span>
            {/if}
            <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Component.Origin', 'Origin')}>
              <span class={`manager-v2-chip ${componentSourceOrigin(item).className}`}>{componentSourceOrigin(item).label}</span>
            </span>
            {#if showProgressiveDifficulty}
              <span role="cell" class="manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Component.ProgressiveDifficulty', 'Progressive difficulty')}>
                {#if Object.prototype.hasOwnProperty.call(item, 'difficulty')}
                  <span class="manager-v2-chip">{item.difficulty}</span>
                {:else}
                  <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.NoDifficulty', 'No difficulty')}</span>
                {/if}
              </span>
            {/if}
            <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
              {#if item.hasSourceUuid}
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Component.CopySourceNamed', 'Copy source UUID for {name}').replace('{name}', item.name)} title={item.sourceUuidDisplay} onclick={() => onCopySourceUuid(item.sourceUuidDisplay)}>
                  <i class="fas fa-copy" aria-hidden="true"></i>
                </button>
              {/if}
              <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Component.EditNamed', 'Edit {name}').replace('{name}', item.name)} title={text('FABRICATE.Admin.ManagerV2.Component.Edit', 'Edit component')} onclick={() => onEditComponent(item.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Component.DeleteNamed', 'Delete {name}').replace('{name}', item.name)} title={text('FABRICATE.Admin.ManagerV2.Component.Delete', 'Delete component')} onclick={() => onDeleteComponent(item.id)}>
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredComponents.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</main>
