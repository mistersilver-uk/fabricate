<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
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
    onImportDrop = () => {},
    onShowComponents = () => {}
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
  const showingStart = $derived(filteredRows.length === 0 ? 0 : pageIndex * pageSize + 1);
  const showingEnd = $derived(Math.min(filteredRows.length, (pageIndex + 1) * pageSize));
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

  function taskImage() {
    return task?.img || 'icons/svg/item-bag.svg';
  }

  function conditionId(option) {
    return String(option?.id || option || '').trim();
  }

  function conditionLabel(option) {
    return String(option?.label || option?.id || option || '').trim();
  }

  function selectedCondition(kind) {
    const values = kind === 'weather' ? task?.weather : task?.timeOfDay;
    return Array.isArray(values) && values.length > 0 ? String(values[0]) : '';
  }

  function updateAvailability(kind, value) {
    onUpdateTask({ [kind]: value ? [value] : [] });
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

  function modifierClass(value) {
    const number = Number(value || 0);
    if (number < 0) return 'is-danger';
    if (number > 0) return 'is-active';
    return 'is-neutral';
  }

  function handleDropZoneDrop(rowId, data) {
    onImportDrop(rowId, data);
  }

  async function chooseTaskImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(task?.img || '');
    if (value) onUpdateTask({ img: value });
  }
</script>

<main
  class="manager-v2-main manager-v2-gathering-task-edit-view"
  aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EditTitle', 'Edit gathering task')}
  data-gathering-task-editor
>
  {#if task}
    <section class="manager-v2-task-core-card" data-gathering-task-core-editor>
      <div class="manager-v2-task-card-heading is-action-only">
        <button type="button" class="manager-v2-link-button" onclick={onBack}>
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BackToLibrary', 'Back to task library')}</span>
        </button>
      </div>
      <div class="manager-v2-task-core-grid">
        <button type="button" class="manager-v2-task-image-picker" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ChooseImage', 'Choose task image')} onclick={chooseTaskImage} disabled={typeof onPickImagePath !== 'function'}>
          <img src={taskImage()} alt="" />
          <i class="fas fa-pen" aria-hidden="true"></i>
        </button>

        <div class="manager-v2-task-identity-fields">
          <label class="manager-v2-field">
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Name', 'Name')}</span>
            <input data-gathering-task-field="name" value={task.name || ''} oninput={(event) => onUpdateTask({ name: event.currentTarget.value })} />
          </label>
          <label class="manager-v2-field">
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Description', 'Description')}</span>
            <textarea data-gathering-task-field="description" value={task.description || ''} oninput={(event) => onUpdateTask({ description: event.currentTarget.value })}></textarea>
          </label>
        </div>

        <div class="manager-v2-task-core-status">
          <label class="manager-v2-status-toggle {task.enabled === false ? 'is-off' : 'is-on'}" data-gathering-task-field="enabled">
            <input type="checkbox" checked={task.enabled !== false} onchange={(event) => onUpdateTask({ enabled: event.currentTarget.checked })} />
            <span class="manager-v2-status-toggle-track" aria-hidden="true"><span class="manager-v2-status-toggle-knob"></span></span>
            <span class="manager-v2-status-toggle-label">{task.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.ManagerV2.StatusEnabled', 'Enabled')}</span>
          </label>
          <p class="manager-v2-muted">{task.enabled === false ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DisabledHint', 'Players cannot attempt this task while it is disabled.') : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EnabledHint', 'This task is available when its gates match.')}</p>
        </div>
      </div>
    </section>

    <section class="manager-v2-task-availability-card">
      <div class="manager-v2-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TaskAvailability', 'Task Availability')}</h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AvailabilityHint', 'Availability controls whether this task can be attempted. Individual drops can still have their own time and weather modifiers.')}</p>
        </div>
      </div>
      <div class="manager-v2-task-availability-row" data-gathering-task-availability>
        <label class="manager-v2-field" data-gathering-task-field="timeOfDay">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TimeOfDay', 'Time of day')}</span>
          <select value={selectedCondition('timeOfDay')} onchange={(event) => updateAvailability('timeOfDay', event.currentTarget.value)}>
            <option value="">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyTimeTitle', 'Any Time')}</option>
            {#each timeOfDayOptions as option (conditionId(option))}
              <option value={conditionId(option)}>{conditionLabel(option)}</option>
            {/each}
          </select>
        </label>
        <label class="manager-v2-field" data-gathering-task-field="weather">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Weather', 'Weather')}</span>
          <select value={selectedCondition('weather')} onchange={(event) => updateAvailability('weather', event.currentTarget.value)}>
            <option value="">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyWeatherTitle', 'Any Weather')}</option>
            {#each weatherOptions as option (conditionId(option))}
              <option value={conditionId(option)}>{conditionLabel(option)}</option>
            {/each}
          </select>
        </label>
      </div>
    </section>

    {#if showRewardRuleNotice}
      <section class="manager-v2-warning-band" data-gathering-task-reward-rule-notice>
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.RewardRuleNotice', 'Multiple drop rows use this component. Current drop rules may award only one matching row.')}</span>
      </section>
    {/if}

    <section class="manager-v2-task-drops-card">
      <div class="manager-v2-task-card-header">
        <div class="manager-v2-task-drop-header-copy">
          <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropRules', 'Drop Rules')}</h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropRulesHint', 'Configure what can drop, how often, and which conditions modify each drop.')}</p>
        </div>
        <label class="manager-v2-search is-compact">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input type="search" bind:value={searchTerm} placeholder={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDropsPlaceholder', 'Search drop rules...')} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDrops', 'Search drop rules')} />
        </label>
        <span class="manager-v2-muted manager-v2-drop-count">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ShowingDrops', 'Showing {start}-{end} of {total} drops').replace('{start}', showingStart).replace('{end}', showingEnd).replace('{total}', filteredRows.length)}</span>
        <button type="button" class="manager-v2-button" onclick={onAddDrop}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddDrop', 'Add drop rule')}</span>
        </button>
      </div>

      <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropRulesTable', 'Drop rules table')}>
        {#if dropRows.length === 0}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-gift" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoDrops', 'No drops have been added.')}</h3>
              <button type="button" class="manager-v2-button is-primary" onclick={onAddDrop}>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddDrop', 'Add drop rule')}</button>
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
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponent', 'Component')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Modifiers', 'Modifiers')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
            </div>
            {#each paginatedRows as row (row.id)}
              <div class={`manager-v2-gathering-task-drop-row ${selectedDrop?.id === row.id ? 'is-selected' : ''}`} role="row" data-gathering-task-drop-id={row.id} aria-selected={selectedDrop?.id === row.id}>
                <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponent', 'Component')}>
                  {#if row.componentId || row.itemUuid}
                    <button type="button" class="manager-v2-gathering-task-identity" onclick={() => onSelectDrop(row.id)}>
                      <img class="manager-v2-gathering-task-thumb" src={componentImage(row)} alt="" />
                      <span class="manager-v2-system-copy">
                        <span class="manager-v2-system-name">{componentLabel(row)}</span>
                        <span class="manager-v2-system-description">{row.componentId || row.itemUuid}</span>
                      </span>
                    </button>
                  {:else}
                    <div class="manager-v2-gathering-task-identity is-empty">
                      <span class="manager-v2-empty-drop-cell">
                        <span
                          class="manager-v2-inline-drop-zone"
                          use:dragDrop={{ onDrop: (data) => handleDropZoneDrop(row.id, data), activeClass: 'is-drop-active' }}
                          data-gathering-task-drop-zone={row.id}
                        >
                          <i class="fas fa-file-import" aria-hidden="true"></i>
                          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponentHere', 'Drop component here')}</span>
                        </span>
                        <button type="button" class="manager-v2-empty-drop-action" onclick={(event) => { event.stopPropagation(); onShowComponents(row.id); }}>
                          {text('FABRICATE.Admin.ManagerV2.Environment.Tasks.OrCreateComponent', 'or create/select component')}
                        </button>
                      </span>
                    </div>
                  {/if}
                </span>
                <span role="cell" class="manager-v2-labeled-cell manager-v2-drop-rate-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')}>
                  <input type="range" min="0" max="100" step="1" value={row.dropRate ?? 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')} oninput={(event) => onUpdateDrop(row.id, { dropRate: Number(event.currentTarget.value) })} />
                  <strong>{row.dropRate ?? 1}%</strong>
                </span>
                <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')}>
                  <label class="manager-v2-quantity-input">
                    <input type="number" min="1" step="1" value={row.quantity || 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')} oninput={(event) => onUpdateDrop(row.id, { quantity: Number(event.currentTarget.value || 1) })} />
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.QuantityShortHint', 'award')}</span>
                  </label>
                </span>
                <span role="cell" class="manager-v2-chip-row manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Modifiers', 'Modifiers')}>
                  {#if modifierEntries(row).length > 0}
                    {#each modifierEntries(row) as modifier (modifier.id)}
                      <span class={`manager-v2-chip ${modifierClass(modifier.value)}`}>{modifierLabel(modifier)}</span>
                    {/each}
                  {:else}
                    <span class="manager-v2-chip is-neutral">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoModifiers', 'Not specified')}</span>
                  {/if}
                </span>
                <span role="cell" class="manager-v2-action-group manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}>
                  <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SelectDrop', 'Select drop rule')} onclick={() => onSelectDrop(row.id)}><i class="fas fa-pen" aria-hidden="true"></i></button>
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
    </section>

    <section class="manager-v2-warning-band is-formula">
      <i class="fas fa-calculator" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropCalculationHelp', 'Final drop chance = base chance + matching drop-level time/weather modifiers. Gathering modifiers affect the d100 roll.')}</span>
    </section>
  {:else}
    <div class="manager-v2-empty">
      <div>
        <i class="fas fa-list-check" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SelectTask', 'Select a gathering task')}</h3>
        <button type="button" class="manager-v2-button" onclick={onBack}>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BackToLibrary', 'Back to tasks')}</button>
      </div>
    </div>
  {/if}
</main>
