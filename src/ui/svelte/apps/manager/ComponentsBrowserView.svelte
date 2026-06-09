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
    'manager-components-table',
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

  function usageEvidenceItems(item) {
    if (!item?.usageCounts || typeof item.usageCounts !== 'object') return [];
    const labels = {
      ingredient: text('FABRICATE.Admin.Manager.Component.UsageIngredient', 'Ingredient usage'),
      result: text('FABRICATE.Admin.Manager.Component.UsageResult', 'Result usage'),
      tool: text('FABRICATE.Admin.Manager.Component.UsageTool', 'Tool usage'),
      gathering: text('FABRICATE.Admin.Manager.Component.UsageGathering', 'Gathering usage'),
      salvage: text('FABRICATE.Admin.Manager.Component.UsageSalvage', 'Salvage usage')
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
      text('FABRICATE.Admin.Manager.Component.SalvageQuantity', '{count} required')
        .replace('{count}', summary.quantityRequired ?? 1)
    ];
    if (summary.toolCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageTools', '{count} tools').replace('{count}', summary.toolCount));
    if (summary.resultGroupCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageResults', '{count} result groups').replace('{count}', summary.resultGroupCount));
    if (summary.outcomeCount > 0) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageOutcomes', '{count} outcomes').replace('{count}', summary.outcomeCount));
    if (summary.hasTimeRequirement) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageTime', 'time'));
    if (summary.hasCurrencyRequirement) parts.push(text('FABRICATE.Admin.Manager.Component.SalvageCost', 'cost'));
    return parts.join(', ');
  }

  function componentEvidenceItems(item) {
    const evidence = [];
    if (!item) return evidence;
    if (Object.prototype.hasOwnProperty.call(item, 'difficulty')) {
      evidence.push({
        id: 'difficulty',
        label: text('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty'),
        value: item.difficulty
      });
    }
    if (item.salvageSummary) {
      evidence.push({
        id: 'salvage',
        label: text('FABRICATE.Admin.Manager.Component.Salvage', 'Salvage'),
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

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Nav.Components', 'Components')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Component.Library', 'Component directory')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.Component.LibraryHint', 'Browse item-backed components and open the existing component editor for changes.')}</p>
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
      {#if showComponentTags && componentTagOptions.length > 0}
        <div class="manager-tag-search" data-component-tag-search>
          <label class="manager-filter manager-tag-search-label">
            <span>{text('FABRICATE.Admin.Manager.Component.Tags', 'Tags')}</span>
            <input
              type="search"
              value={tagSearchTerm}
              oninput={(event) => tagSearchTerm = event.currentTarget.value}
              placeholder={text('FABRICATE.Admin.Manager.Component.TagSearchPlaceholder', 'Search tags...')}
              aria-label={text('FABRICATE.Admin.Manager.Component.TagSearchLabel', 'Search component tags')}
              aria-controls="manager-component-tag-suggestions"
            />
          </label>
          {#if normalizedTagSearchTerm.length > 0}
            <div id="manager-component-tag-suggestions" class="manager-tag-suggestions" role="listbox" aria-label={text('FABRICATE.Admin.Manager.Component.TagSuggestions', 'Matching component tags')}>
              {#each tagSearchSuggestions as tag}
                <button type="button" role="option" aria-selected="false" class="manager-tag-suggestion" onclick={() => addTagFilter(tag)}>
                  <i class="fas fa-tag" aria-hidden="true"></i>
                  <span>{tag}</span>
                </button>
              {:else}
                <span class="manager-tag-no-matches">{text('FABRICATE.Admin.Manager.Component.TagNoMatches', 'No matching tags')}</span>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      {#if showComponentEssences && componentEssenceOptions.length > 0}
        <label class="manager-filter">
          <span>{text('FABRICATE.Admin.Manager.Component.Essences', 'Essences')}</span>
          <select value={essenceFilter} onchange={(event) => setEssenceFilter(event.currentTarget.value)} aria-label={text('FABRICATE.Admin.Manager.Component.EssenceFilterLabel', 'Filter components by essence')}>
            <option value="all">{text('FABRICATE.Admin.Manager.Component.EssenceAll', 'All essences')}</option>
            {#each componentEssenceOptions as essence}
              <option value={essence}>{essence}</option>
            {/each}
          </select>
        </label>
      {/if}
      <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredComponents.length).replace('{total}', totalComponentsCount)}</span>
      {#if filtersActive}
        <button type="button" class="manager-button manager-clear-filters" data-clear-filters="components" onclick={clearFilters}>
          <i class="fas fa-times" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
        </button>
      {/if}
    </div>
    {#if selectedTagFilters.length > 0}
      <div class="manager-toolbar-pills manager-selected-tag-row" role="list" aria-label={text('FABRICATE.Admin.Manager.Component.SelectedTags', 'Selected component tags')}>
        {#each selectedTagFilters as tag}
          <span class="manager-chip manager-selected-tag-pill" role="listitem" data-component-tag-pill={tag} oncontextmenu={(event) => removeTagFilterFromContext(event, tag)}>
            <span>{tag}</span>
            <button type="button" aria-label={text('FABRICATE.Admin.Manager.Component.RemoveTagNamed', 'Remove tag {name}').replace('{name}', tag)} title={text('FABRICATE.Admin.Manager.Component.RemoveTag', 'Remove tag')} onclick={() => removeTagFilter(tag)}>
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </span>
        {/each}
      </div>
    {/if}
  </section>

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Component.Table', 'Components table')}>
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
      <div class={componentTableClass} role="table" aria-label={text('FABRICATE.Admin.Manager.Component.TableShort', 'Components')}>
        <div class="manager-table-head manager-component-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Component.Column.Component', 'Component')}</span>
          {#if showComponentTags}
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Component.Tags', 'Tags')}</span>
          {/if}
          {#if showComponentEssences}
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Component.Essences', 'Essences')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Component.Origin', 'Origin')}</span>
          {#if showProgressiveDifficulty}
            <span role="columnheader">{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty')}</span>
          {/if}
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedComponents as item (item.id)}
          <div class={`manager-component-row ${isSelectedComponent(item) ? 'is-selected' : ''}`} role="row" aria-selected={isSelectedComponent(item)} data-component-id={item.id}>
            <button type="button" class="manager-component-identity" onclick={() => onSelectComponent(item.id)} role="cell">
              <img class="manager-component-thumb" src={componentImage(item)} alt="" />
              <span class="manager-system-copy">
                <span class="manager-system-name" title={item.name}>{item.name}</span>
                {#if item.description}
                  <span class="manager-system-description" title={item.description}>{item.description}</span>
                {:else}
                  <span class="manager-system-description">{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span>
                {/if}
              </span>
            </button>
            {#if showComponentTags}
              <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Component.Tags', 'Tags')}>
                <span class="manager-chip-row">
                  {#each item.tags || [] as tag}
                    <span class="manager-chip">{tag}</span>
                  {:else}
                    <span class="manager-muted">{text('FABRICATE.Admin.Manager.Component.NoTags', 'No tags')}</span>
                  {/each}
                </span>
              </span>
            {/if}
            {#if showComponentEssences}
              <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Component.Essences', 'Essences')}>
                <span class="manager-chip-row">
                  {#each item.essences || [] as essence}
                    <span class="manager-chip manager-essence-compact-chip" title={`${essence.name || essence.id} ${essence.quantity}`} aria-label={`${essence.name || essence.id} ${essence.quantity}`}>
                      <i class={essence.icon || 'fas fa-mortar-pestle'} aria-hidden="true"></i>{essence.quantity}
                    </span>
                  {:else}
                    <span class="manager-muted">{text('FABRICATE.Admin.Manager.Component.NoEssences', 'No essences')}</span>
                  {/each}
                </span>
              </span>
            {/if}
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Component.Origin', 'Origin')}>
              <span class={`manager-chip ${componentSourceOrigin(item).className}`}>{componentSourceOrigin(item).label}</span>
            </span>
            {#if showProgressiveDifficulty}
              <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Component.ProgressiveDifficulty', 'Progressive difficulty')}>
                {#if Object.prototype.hasOwnProperty.call(item, 'difficulty')}
                  <span class="manager-chip">{item.difficulty}</span>
                {:else}
                  <span class="manager-muted">{text('FABRICATE.Admin.Manager.Component.NoDifficulty', 'No difficulty')}</span>
                {/if}
              </span>
            {/if}
            <span role="cell" class="manager-action-group manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}>
              {#if item.hasSourceUuid}
                <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Component.CopySourceNamed', 'Copy source UUID for {name}').replace('{name}', item.name)} title={item.sourceUuidDisplay} onclick={() => onCopySourceUuid(item.sourceUuidDisplay)}>
                  <i class="fas fa-copy" aria-hidden="true"></i>
                </button>
              {/if}
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Component.EditNamed', 'Edit {name}').replace('{name}', item.name)} title={text('FABRICATE.Admin.Manager.Component.Edit', 'Edit component')} onclick={() => onEditComponent(item.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Component.DeleteNamed', 'Delete {name}').replace('{name}', item.name)} title={text('FABRICATE.Admin.Manager.Component.Delete', 'Delete component')} onclick={() => onDeleteComponent(item.id)}>
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
