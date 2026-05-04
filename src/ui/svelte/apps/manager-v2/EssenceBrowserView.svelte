<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    essenceCards = [],
    managedItemOptions = [],
    selectedEssenceId = '',
    onSelectEssence = () => {},
    onCreateEssence = () => {},
    onUpdateEssence = () => {},
    onRemoveEssence = () => {}
  } = $props();

  let searchTerm = $state('');
  let sourceFilter = $state('all');
  let createName = $state('');
  let createDescription = $state('');
  let createIcon = $state('fas fa-mortar-pestle');
  let createSourceComponentId = $state('');
  let editingEssenceId = $state('');
  let editName = $state('');
  let editDescription = $state('');
  let editIcon = $state('fas fa-mortar-pestle');
  let editSourceComponentId = $state('');

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredEssences = $derived((essenceCards || []).filter(essence => {
    const matchesSearch = !normalizedSearchTerm
      || `${essence.name || ''} ${essence.description || ''} ${essence.sourceName || ''} ${essence.id || ''}`.toLowerCase().includes(normalizedSearchTerm);
    const state = essence.sourceState || 'none';
    const matchesSource = sourceFilter === 'all'
      || (sourceFilter === 'linked' && state === 'linked')
      || (sourceFilter === 'needs-attention' && (state === 'stale' || state === 'missing'))
      || (sourceFilter === 'none' && state === 'none');
    return matchesSearch && matchesSource;
  }));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function sourceStateLabel(essence) {
    const state = essence?.sourceState || 'none';
    if (state === 'linked') return text('FABRICATE.Admin.ManagerV2.Essence.SourceLinked', 'Linked source');
    if (state === 'missing') return text('FABRICATE.Admin.ManagerV2.Essence.SourceMissing', 'Source item missing');
    if (state === 'stale') return text('FABRICATE.Admin.ManagerV2.Essence.SourceStale', 'Source unresolved');
    return text('FABRICATE.Admin.ManagerV2.Essence.SourceNone', 'No source');
  }

  function sourceStateClass(essence) {
    const state = essence?.sourceState || 'none';
    if (state === 'linked') return 'is-active';
    if (state === 'missing' || state === 'stale') return 'is-warning';
    return 'is-disabled';
  }

  async function createEssence() {
    const result = await onCreateEssence(createName, createDescription, createIcon, createSourceComponentId || null);
    if (result === false) return;
    createName = '';
    createDescription = '';
    createIcon = 'fas fa-mortar-pestle';
    createSourceComponentId = '';
  }

  function beginEdit(essence, event) {
    event?.stopPropagation();
    editingEssenceId = essence.id;
    editName = essence.name || '';
    editDescription = essence.description || '';
    editIcon = essence.icon || 'fas fa-mortar-pestle';
    editSourceComponentId = essence.sourceComponentId || '';
  }

  function cancelEdit(event) {
    event?.stopPropagation();
    editingEssenceId = '';
    editName = '';
    editDescription = '';
    editIcon = 'fas fa-mortar-pestle';
    editSourceComponentId = '';
  }

  async function saveEdit(essence, event) {
    event?.stopPropagation();
    const result = await onUpdateEssence(essence.id, {
      name: editName,
      description: editDescription,
      icon: editIcon,
      sourceComponentId: editSourceComponentId || null
    });
    if (result === false) return;
    cancelEdit();
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
</script>

<main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Title', 'Essences')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Essence.Kicker', 'Essence definitions')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.Essence.Library', 'Essence browser')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.Essence.LibraryHint', 'Browse, create, and maintain essence definitions for the selected crafting system.')}</p>
    </div>
  </section>

  <section class="manager-v2-essence-create-band" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Create', 'Create essence')}>
    <label class="manager-v2-field" for="manager-v2-essence-create-name">
      <span>{text('FABRICATE.Admin.ManagerV2.Essence.Name', 'Name')}</span>
      <input id="manager-v2-essence-create-name" type="text" value={createName} oninput={(event) => createName = event.currentTarget.value} placeholder={text('FABRICATE.Admin.ManagerV2.Essence.NamePlaceholder', 'Essence name')} />
    </label>
    <label class="manager-v2-field" for="manager-v2-essence-create-icon">
      <span>{text('FABRICATE.Admin.ManagerV2.Essence.Icon', 'Icon')}</span>
      <input id="manager-v2-essence-create-icon" type="text" value={createIcon} oninput={(event) => createIcon = event.currentTarget.value} placeholder="fas fa-mortar-pestle" />
    </label>
    <label class="manager-v2-field" for="manager-v2-essence-create-source">
      <span>{text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}</span>
      <select id="manager-v2-essence-create-source" value={createSourceComponentId} onchange={(event) => createSourceComponentId = event.currentTarget.value}>
        <option value="">{text('FABRICATE.Admin.ManagerV2.Essence.SourceNone', 'No source')}</option>
        {#each managedItemOptions as item}
          <option value={item.id}>{item.name}</option>
        {/each}
      </select>
    </label>
    <label class="manager-v2-field is-wide" for="manager-v2-essence-create-description">
      <span>{text('FABRICATE.Admin.ManagerV2.Essence.Description', 'Description')}</span>
      <input id="manager-v2-essence-create-description" type="text" value={createDescription} oninput={(event) => createDescription = event.currentTarget.value} placeholder={text('FABRICATE.Admin.ManagerV2.Essence.DescriptionPlaceholder', 'Description')} />
    </label>
    <button type="button" class="manager-v2-button is-primary" onclick={createEssence} disabled={!createName.trim()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.ManagerV2.Essence.Create', 'Create essence')}</span>
    </button>
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
    <label class="manager-v2-filter">
      <span>{text('FABRICATE.Admin.ManagerV2.Essence.SourceFilter', 'Source')}</span>
      <select value={sourceFilter} onchange={(event) => sourceFilter = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Essence.SourceFilterLabel', 'Filter essences by source state')}>
        <option value="all">{text('FABRICATE.Admin.ManagerV2.Essence.SourceAll', 'All sources')}</option>
        <option value="linked">{text('FABRICATE.Admin.ManagerV2.Essence.SourceLinked', 'Linked source')}</option>
        <option value="needs-attention">{text('FABRICATE.Admin.ManagerV2.Essence.SourceNeedsAttention', 'Needs attention')}</option>
        <option value="none">{text('FABRICATE.Admin.ManagerV2.Essence.SourceNone', 'No source')}</option>
      </select>
    </label>
    <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredEssences.length).replace('{total}', essenceCards.length)}</span>
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
      <div class="manager-v2-essences-table" role="table" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.TableShort', 'Essences')}>
        <div class="manager-v2-table-head manager-v2-essence-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Essence.ColumnEssence', 'Essence')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Essence.Usage', 'Usage')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
        </div>
        {#each filteredEssences as essence (essence.id)}
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
            <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}>
              <span class={`manager-v2-chip ${sourceStateClass(essence)}`}>{sourceStateLabel(essence)}</span>
              {#if essence.sourceName}
                <span class="manager-v2-muted">{essence.sourceName}</span>
              {/if}
            </span>
            <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Essence.Usage', 'Usage')}>
              <span class={essence.deleteBlocked ? 'manager-v2-chip is-warning' : 'manager-v2-chip'}>
                {text('FABRICATE.Admin.ManagerV2.Essence.ComponentUsageCount', '{count} components').replace('{count}', essence.componentUsageCount || 0)}
              </span>
            </span>
            <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
              {#if editingEssenceId === essence.id}
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.SaveNamed', 'Save {name}').replace('{name}', essence.name)} title={text('FABRICATE.Admin.ManagerV2.Essence.Save', 'Save essence')} disabled={!editName.trim()} onclick={(event) => saveEdit(essence, event)}>
                  <i class="fas fa-save" aria-hidden="true"></i>
                </button>
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.CancelEdit', 'Cancel editing')} title={text('FABRICATE.Admin.ManagerV2.Essence.CancelEdit', 'Cancel editing')} onclick={cancelEdit}>
                  <i class="fas fa-times" aria-hidden="true"></i>
                </button>
              {:else}
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.EditNamed', 'Edit {name}').replace('{name}', essence.name)} title={text('FABRICATE.Admin.ManagerV2.Essence.Edit', 'Edit essence')} onclick={(event) => beginEdit(essence, event)}>
                  <i class="fas fa-edit" aria-hidden="true"></i>
                </button>
                <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.DeleteNamed', 'Delete {name}').replace('{name}', essence.name)} title={essence.deleteBlocked ? text('FABRICATE.Admin.ManagerV2.Essence.DeleteBlocked', 'Remove component usage before deleting this essence.') : text('FABRICATE.Admin.ManagerV2.Essence.Delete', 'Delete essence')} disabled={essence.deleteBlocked} onclick={(event) => removeEssence(essence, event)}>
                  <i class="fas fa-trash" aria-hidden="true"></i>
                </button>
              {/if}
            </span>
            {#if editingEssenceId === essence.id}
              <span class="manager-v2-essence-edit-row" role="cell">
                <input type="text" value={editName} oninput={(event) => editName = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Name', 'Name')} />
                <input type="text" value={editIcon} oninput={(event) => editIcon = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Icon', 'Icon')} />
                <select value={editSourceComponentId} onchange={(event) => editSourceComponentId = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}>
                  <option value="">{text('FABRICATE.Admin.ManagerV2.Essence.SourceNone', 'No source')}</option>
                  {#each managedItemOptions as item}
                    <option value={item.id}>{item.name}</option>
                  {/each}
                </select>
                <input type="text" value={editDescription} oninput={(event) => editDescription = event.currentTarget.value} aria-label={text('FABRICATE.Admin.ManagerV2.Essence.Description', 'Description')} />
              </span>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>
