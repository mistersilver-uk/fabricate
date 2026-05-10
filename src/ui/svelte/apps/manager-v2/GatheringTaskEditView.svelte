<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import ImagePathPicker from '../../components/ImagePathPicker.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    task = null,
    managedItemOptions = [],
    weatherOptions = [],
    timeOfDayOptions = [],
    selectedDropId = '',
    rewardRules = null,
    onPickImagePath = null,
    onBack = () => {},
    onUpdateTask = () => {},
    onSelectDrop = () => {},
    onAddDrop = () => {},
    onUpdateDrop = () => {},
    onDuplicateDrop = () => {},
    onDeleteDrop = () => {},
    onImportDrop = () => {}
  } = $props();

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);
  let lastTaskId = $state('');

  const dropRows = $derived(Array.isArray(task?.dropRows) ? task.dropRows : []);
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredRows = $derived(dropRows.filter(row => {
    const item = managedItem(row.componentId);
    const haystack = `${row.name || ''} ${item?.name || ''} ${row.itemUuid || ''}`.toLowerCase();
    return !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);
  }));
  const paginatedRows = $derived(filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));
  const selectedDrop = $derived(dropRows.find(row => row.id === selectedDropId) || dropRows[0] || null);
  const repeatedComponentRows = $derived(dropRows.filter(row => row.componentId && row.componentId === selectedDrop?.componentId));
  const showRewardRuleNotice = $derived(selectedDrop?.componentId
    && repeatedComponentRows.length > 1
    && rewardRules?.rewardSelectionMode !== 'allDrops');

  $effect(() => {
    if (task?.id === lastTaskId) return;
    searchTerm = '';
    pageIndex = 0;
    lastTaskId = task?.id || '';
  });

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredRows.length) pageIndex = 0;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function managedItem(componentId) {
    return (managedItemOptions || []).find(option => String(option.id || '') === String(componentId || '')) || null;
  }

  function taskName() {
    return String(task?.name || text('FABRICATE.Admin.ManagerV2.Environment.Tasks.UnnamedTask', 'Unnamed gathering task')).trim();
  }

  function taskImage() {
    return task?.img || 'icons/svg/item-bag.svg';
  }

  function conditionId(option) {
    return String(option?.id || option || '').trim();
  }

  function conditionLabel(option) {
    return String(option?.label || option?.id || option || '').trim();
  }

  function selectedConditions(kind) {
    const values = kind === 'weather' ? task?.weather : task?.timeOfDay;
    return Array.isArray(values) ? values.map(String) : [];
  }

  function toggleAvailability(kind, conditionIdValue, checked) {
    const current = selectedConditions(kind);
    const next = checked
      ? [...new Set([...current, conditionIdValue])]
      : current.filter(value => value !== conditionIdValue);
    onUpdateTask({ [kind]: next });
  }

  function componentLabel(row) {
    const item = managedItem(row?.componentId);
    return row?.name || item?.name || row?.itemUuid || text('FABRICATE.Admin.ManagerV2.Environment.Tasks.UnresolvedDrop', 'Unresolved drop');
  }

  function componentImage(row) {
    return managedItem(row?.componentId)?.img || 'icons/svg/item-bag.svg';
  }

  function modifierEntries(row) {
    const modifiers = row?.conditionModifiers || {};
    return [
      ...(Array.isArray(modifiers.timeOfDay) ? modifiers.timeOfDay.map(entry => ({ ...entry, kind: 'timeOfDay' })) : []),
      ...(Array.isArray(modifiers.weather) ? modifiers.weather.map(entry => ({ ...entry, kind: 'weather' })) : [])
    ];
  }

  function modifierLabel(entry) {
    const options = entry.kind === 'weather' ? weatherOptions : timeOfDayOptions;
    const label = conditionLabel((options || []).find(option => conditionId(option) === entry.conditionId)) || entry.conditionId;
    const sign = Number(entry.value || 0) >= 0 ? '+' : '';
    return `${label} ${sign}${Number(entry.value || 0)}%`;
  }

  function handleDropZoneDrop(rowId, data) {
    onImportDrop(rowId, data);
  }
</script>

<main
  class="manager-v2-main manager-v2-gathering-task-edit-view"
  aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EditTitle', 'Edit gathering task')}
  data-gathering-task-editor
>
  {#if task}
    <section class="manager-v2-editor-hero manager-v2-gathering-task-editor-hero">
      <img class="manager-v2-recipe-preview" src={taskImage()} alt="" />
      <div class="manager-v2-editor-fields">
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Name', 'Name')}</span>
          <input data-gathering-task-field="name" value={task.name || ''} oninput={(event) => onUpdateTask({ name: event.currentTarget.value })} />
        </label>
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Description', 'Description')}</span>
          <textarea data-gathering-task-field="description" value={task.description || ''} oninput={(event) => onUpdateTask({ description: event.currentTarget.value })}></textarea>
        </label>
      </div>
      <div class="manager-v2-editor-side-fields">
        <div class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Image', 'Image')}</span>
          <ImagePathPicker
            value={task.img || ''}
            defaultImage="icons/svg/item-bag.svg"
            chooseLabel={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ChooseImage', 'Choose task image')}
            unavailableLabel={text('FABRICATE.Admin.Environments.ImagePickerUnavailable', 'Image picker unavailable')}
            onChange={(value) => onUpdateTask({ img: value })}
            {onPickImagePath}
          />
        </div>
        <label class="manager-v2-check-row">
          <input type="checkbox" checked={task.enabled !== false} onchange={(event) => onUpdateTask({ enabled: event.currentTarget.checked })} />
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Enabled', 'Enabled')}</span>
        </label>
      </div>
    </section>

    <section class="manager-v2-task-editor-availability" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Availability', 'Availability')}>
      <fieldset class="manager-v2-chip-field" data-gathering-task-field="timeOfDay">
        <legend>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TimeOfDay', 'Time of day')}</legend>
        <span class={`manager-v2-chip ${selectedConditions('timeOfDay').length === 0 ? 'is-active' : ''}`}>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyTimeTitle', 'Any Time')}</span>
        {#each timeOfDayOptions as option (conditionId(option))}
          <label class="manager-v2-check-chip">
            <input type="checkbox" checked={selectedConditions('timeOfDay').includes(conditionId(option))} onchange={(event) => toggleAvailability('timeOfDay', conditionId(option), event.currentTarget.checked)} />
            <span>{conditionLabel(option)}</span>
          </label>
        {/each}
      </fieldset>
      <fieldset class="manager-v2-chip-field" data-gathering-task-field="weather">
        <legend>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Weather', 'Weather')}</legend>
        <span class={`manager-v2-chip ${selectedConditions('weather').length === 0 ? 'is-active' : ''}`}>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyWeatherTitle', 'Any Weather')}</span>
        {#each weatherOptions as option (conditionId(option))}
          <label class="manager-v2-check-chip">
            <input type="checkbox" checked={selectedConditions('weather').includes(conditionId(option))} onchange={(event) => toggleAvailability('weather', conditionId(option), event.currentTarget.checked)} />
            <span>{conditionLabel(option)}</span>
          </label>
        {/each}
      </fieldset>
    </section>

    {#if showRewardRuleNotice}
      <section class="manager-v2-warning-band" data-gathering-task-reward-rule-notice>
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.RewardRuleNotice', 'Multiple drop rows use this component. Current drop rules may award only one matching row.')}</span>
      </section>
    {/if}

    <section class="manager-v2-toolbar manager-v2-task-drop-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropRules', 'Drop rules')}>
      <label class="manager-v2-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input type="search" bind:value={searchTerm} placeholder={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDropsPlaceholder', 'Search drop rules...')} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDrops', 'Search drop rules')} />
      </label>
      <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.SearchCount', '{shown} of {total}').replace('{shown}', filteredRows.length).replace('{total}', dropRows.length)}</span>
      <button type="button" class="manager-v2-button is-primary" onclick={onAddDrop} disabled={(managedItemOptions || []).length === 0}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddDrop', 'Add drop rule')}</span>
      </button>
    </section>

    <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropRulesTable', 'Drop rules table')}>
      {#if dropRows.length === 0}
        <div class="manager-v2-empty">
          <div>
            <i class="fas fa-gift" aria-hidden="true"></i>
            <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoDrops', 'No drops have been added.')}</h3>
            <button type="button" class="manager-v2-button is-primary" onclick={onAddDrop} disabled={(managedItemOptions || []).length === 0}>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddDrop', 'Add drop rule')}</button>
          </div>
        </div>
      {:else if filteredRows.length === 0}
        <div class="manager-v2-empty">
          <div>
            <i class="fas fa-search" aria-hidden="true"></i>
            <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EmptyDropSearchTitle', 'No drop rules match this search')}</h3>
          </div>
        </div>
      {:else}
        <div class="manager-v2-gathering-task-drops-table" role="table" data-gathering-task-drops-table>
          <div class="manager-v2-table-head manager-v2-gathering-task-drop-table-head" role="row">
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponent', 'Drop component')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Modifiers', 'Modifiers')}</span>
            <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
          </div>
          {#each paginatedRows as row (row.id)}
            <div class={`manager-v2-gathering-task-drop-row ${selectedDrop?.id === row.id ? 'is-selected' : ''}`} role="row" data-gathering-task-drop-id={row.id} aria-selected={selectedDrop?.id === row.id}>
              <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponent', 'Drop component')}>
              <button type="button" class="manager-v2-gathering-task-identity" onclick={() => onSelectDrop(row.id)}>
                {#if row.componentId || row.itemUuid}
                  <img class="manager-v2-gathering-task-thumb" src={componentImage(row)} alt="" />
                  <span class="manager-v2-system-copy">
                    <span class="manager-v2-system-name">{componentLabel(row)}</span>
                    <span class="manager-v2-system-description">{row.componentId || row.itemUuid}</span>
                  </span>
                {:else}
                  <span
                    class="manager-v2-inline-drop-zone"
                    use:dragDrop={{ onDrop: (data) => handleDropZoneDrop(row.id, data), activeClass: 'is-drop-active' }}
                    data-gathering-task-drop-zone={row.id}
                  >
                    <i class="fas fa-file-import" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponentHere', 'Drop component here')}</span>
                  </span>
                {/if}
              </button>
              </span>
              <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')}>
                <input type="range" min="0" max="100" step="1" value={row.dropRate ?? 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')} oninput={(event) => onUpdateDrop(row.id, { dropRate: Number(event.currentTarget.value) })} />
                <strong>{row.dropRate ?? 1}%</strong>
              </span>
              <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')}>
                <input type="number" min="1" step="1" value={row.quantity || 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')} oninput={(event) => onUpdateDrop(row.id, { quantity: Number(event.currentTarget.value || 1) })} />
              </span>
              <span role="cell" class="manager-v2-chip-row manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Modifiers', 'Modifiers')}>
                {#if modifierEntries(row).length > 0}
                  {#each modifierEntries(row) as modifier (modifier.id)}
                    <span class={`manager-v2-chip ${Number(modifier.value || 0) < 0 ? 'is-danger' : 'is-active'}`}>{modifierLabel(modifier)}</span>
                  {/each}
                {:else}
                  <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoModifiers', 'No modifiers')}</span>
                {/if}
              </span>
              <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SelectDrop', 'Select drop rule')} onclick={() => onSelectDrop(row.id)}><i class="fas fa-arrow-pointer" aria-hidden="true"></i></button>
                <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DuplicateDrop', 'Duplicate drop rule')} onclick={() => onDuplicateDrop(row.id)}><i class="fas fa-copy" aria-hidden="true"></i></button>
                <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DeleteDrop', 'Delete drop rule')} onclick={() => onDeleteDrop(row.id)}><i class="fas fa-trash" aria-hidden="true"></i></button>
              </span>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <Pagination
      totalCount={filteredRows.length}
      {pageSize}
      {pageIndex}
      onPageChange={(next) => pageIndex = next}
      onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
    />
  {:else}
    <div class="manager-v2-empty">
      <div>
        <i class="fas fa-list-check" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SelectTask', 'Select a gathering task')}</h3>
        <button type="button" class="manager-v2-button" onclick={onBack}>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BackToLibrary', 'Back to task library')}</button>
      </div>
    </div>
  {/if}
</main>
