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
    onImportDrop = () => {},
    onAddModifier = () => {},
    onUpdateModifier = () => {},
    onDeleteModifier = () => {}
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

  function availabilityText(kind) {
    const values = selectedConditions(kind);
    if (values.length === 0) {
      return kind === 'weather'
        ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyWeatherAvailable', 'Available in any weather')
        : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyTimeAvailable', 'Available at any time');
    }
    const options = kind === 'weather' ? weatherOptions : timeOfDayOptions;
    return values
      .map(value => conditionLabel((options || []).find(option => conditionId(option) === value)) || value)
      .join(', ');
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

  function modifierRows(kind) {
    const values = selectedDrop?.conditionModifiers?.[kind];
    return Array.isArray(values) ? values : [];
  }

  function modifierLabel(entry) {
    const options = entry.kind === 'weather' ? weatherOptions : timeOfDayOptions;
    const label = conditionLabel((options || []).find(option => conditionId(option) === entry.conditionId)) || entry.conditionId;
    const sign = Number(entry.value || 0) >= 0 ? '+' : '';
    return `${label} ${sign}${Number(entry.value || 0)}%`;
  }

  function modifierClass(value) {
    return Number(value || 0) < 0 ? 'is-danger' : 'is-active';
  }

  function quantityText(row) {
    if (row?.quantityMin || row?.quantityMax) return `${row.quantityMin || 1}-${row.quantityMax || row.quantityMin || 1}`;
    return row?.quantity || 1;
  }

  function rankLabel(row, index) {
    return row?.rank || row?.rarity || (index === 0 ? 'Common' : index === 1 ? 'Uncommon' : 'Rare');
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
    <header class="manager-v2-task-workspace-header">
      <button type="button" class="manager-v2-link-button" onclick={onBack}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BackToLibrary', 'Back to tasks')}</span>
      </button>
      <div class="manager-v2-task-title-row">
        <img class="manager-v2-gathering-task-large-icon" src={taskImage()} alt="" />
        <div class="manager-v2-task-title-copy">
          <input class="manager-v2-task-title-input" data-gathering-task-field="name" value={task.name || ''} oninput={(event) => onUpdateTask({ name: event.currentTarget.value })} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Name', 'Name')} />
          <textarea class="manager-v2-task-description-input" data-gathering-task-field="description" value={task.description || ''} oninput={(event) => onUpdateTask({ description: event.currentTarget.value })} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Description', 'Description')}></textarea>
        </div>
        <div class="manager-v2-task-header-actions">
          <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TaskId', 'ID')}: {task.id}</span>
          <ImagePathPicker
            value={task.img || ''}
            defaultImage="icons/svg/item-bag.svg"
            chooseLabel={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ChooseImage', 'Choose task image')}
            unavailableLabel={text('FABRICATE.Admin.Environments.ImagePickerUnavailable', 'Image picker unavailable')}
            onChange={(value) => onUpdateTask({ img: value })}
            {onPickImagePath}
          />
        </div>
      </div>
    </header>

    <nav class="manager-v2-task-editor-tabs" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EditSections', 'Task editor sections')}>
      <button type="button">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DetailsTab', 'Details')}</button>
      <button type="button" class="is-active" aria-current="page">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropsTab', 'Drops')}</button>
      <button type="button">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ConditionsTab', 'Conditions & Modifiers')}</button>
      <button type="button">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.OverridesTab', 'Environment Overrides')}</button>
      <button type="button">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NotesTab', 'Notes')}</button>
    </nav>

    <section class="manager-v2-task-overview-card">
      <div class="manager-v2-task-basic-info">
        <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BasicInformation', 'Basic Information')}</h3>
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Name', 'Name')}</span>
          <input value={task.name || ''} oninput={(event) => onUpdateTask({ name: event.currentTarget.value })} />
        </label>
        <label class="manager-v2-field">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Description', 'Description')}</span>
          <textarea value={task.description || ''} oninput={(event) => onUpdateTask({ description: event.currentTarget.value })}></textarea>
        </label>
      </div>
      <div class="manager-v2-task-availability-summary">
        <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AvailabilityTitle', 'Task Availability')} <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TaskLevelGates', '(Task-Level Gates)')}</span></h3>
        <div class="manager-v2-task-condition-line">
          <i class="far fa-clock" aria-hidden="true"></i>
          <strong>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TimeOfDay', 'Time of day')}</strong>
          <span>{availabilityText('timeOfDay')}</span>
        </div>
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
        <div class="manager-v2-task-condition-line">
          <i class="fas fa-cloud-showers-heavy" aria-hidden="true"></i>
          <strong>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Weather', 'Weather')}</strong>
          <span>{availabilityText('weather')}</span>
        </div>
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
      </div>
      <div class="manager-v2-task-status-summary">
        <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TaskStatus', 'Task Status')}</h3>
        <label class="manager-v2-check-row">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Enabled', 'Enabled')}</span>
          <input type="checkbox" checked={task.enabled !== false} onchange={(event) => onUpdateTask({ enabled: event.currentTarget.checked })} />
        </label>
        <div class="manager-v2-requirement-row">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Drops', 'Drops')}</span>
          <strong>{dropRows.length}</strong>
        </div>
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
        <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropsTab', 'Drops')}</h3>
        <label class="manager-v2-search is-compact">
          <i class="fas fa-search" aria-hidden="true"></i>
          <input type="search" bind:value={searchTerm} placeholder={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDropsPlaceholder', 'Search drop rules...')} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDrops', 'Search drop rules')} />
        </label>
        <button type="button" class="manager-v2-button" onclick={onAddDrop} disabled={(managedItemOptions || []).length === 0}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddDrop', 'Add Drop')}</span>
        </button>
      </div>

      <section class="manager-v2-table-scroll" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropRulesTable', 'Drop rules table')}>
        {#if dropRows.length === 0}
          <div class="manager-v2-empty">
            <div>
              <i class="fas fa-gift" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoDrops', 'No drops have been added.')}</h3>
              <button type="button" class="manager-v2-button is-primary" onclick={onAddDrop} disabled={(managedItemOptions || []).length === 0}>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddDrop', 'Add Drop')}</button>
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
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BaseRate', 'Base Rate')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Rank', 'Rank')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.PerDropModifiers', 'Per-Drop Modifiers')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.ManagerV2.Column.Actions', 'Actions')}</span>
            </div>
            {#each paginatedRows as row, index (row.id)}
              <div class={`manager-v2-gathering-task-drop-row ${selectedDrop?.id === row.id ? 'is-selected' : ''}`} role="row" data-gathering-task-drop-id={row.id} aria-selected={selectedDrop?.id === row.id}>
                <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponent', 'Component')}>
                  <button type="button" class="manager-v2-gathering-task-identity" onclick={() => onSelectDrop(row.id)}>
                    {#if row.componentId || row.itemUuid}
                      <img class="manager-v2-gathering-task-thumb" src={componentImage(row)} alt="" />
                      <span class="manager-v2-system-copy">
                        <span class="manager-v2-system-name">{componentLabel(row)}</span>
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
                <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BaseRate', 'Base Rate')}>
                  <input type="range" min="0" max="100" step="1" value={row.dropRate ?? 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')} oninput={(event) => onUpdateDrop(row.id, { dropRate: Number(event.currentTarget.value) })} />
                  <strong>{row.dropRate ?? 1}%</strong>
                </span>
                <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Rank', 'Rank')}>
                  <span class="manager-v2-rank-chip">{rankLabel(row, index)}</span>
                </span>
                <span role="cell" class="manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')}>
                  <input type="number" min="1" step="1" value={row.quantity || 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')} oninput={(event) => onUpdateDrop(row.id, { quantity: Number(event.currentTarget.value || 1) })} />
                </span>
                <span role="cell" class="manager-v2-chip-row manager-v2-labeled-cell" data-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.PerDropModifiers', 'Per-Drop Modifiers')}>
                  {#if modifierEntries(row).length > 0}
                    {#each modifierEntries(row) as modifier (modifier.id)}
                      <span class={`manager-v2-chip ${modifierClass(modifier.value)}`}>{modifierLabel(modifier)}</span>
                    {/each}
                  {:else}
                    <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoModifiers', 'No modifiers')}</span>
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

    {#if selectedDrop}
      <section class="manager-v2-selected-drop-editor" data-gathering-task-drop-inspector>
        <div class="manager-v2-task-card-header">
          <h3>
            <img class="manager-v2-gathering-task-thumb" src={componentImage(selectedDrop)} alt="" />
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EditSelectedDrop', 'Edit Selected Drop')}:</span>
            <strong>{componentLabel(selectedDrop)}</strong>
          </h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ModifiersApplyOnlyThisDrop', 'Modifiers below apply only to this drop.')}</p>
        </div>
        <div class="manager-v2-selected-drop-fields">
          <label class="manager-v2-field">
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.BaseRate', 'Base Rate')}</span>
            <input type="number" min="0" max="100" step="1" value={selectedDrop.dropRate ?? 1} oninput={(event) => onUpdateDrop(selectedDrop.id, { dropRate: Number(event.currentTarget.value || 0) })} />
          </label>
          <label class="manager-v2-field">
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropComponent', 'Drop component')}</span>
            <select value={selectedDrop.componentId || ''} onchange={(event) => { if (event.currentTarget.value) onUpdateDrop(selectedDrop.id, { componentId: event.currentTarget.value, itemUuid: '' }); }}>
              <option value="" disabled>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.UnresolvedDrop', 'Unresolved drop')}</option>
              {#each managedItemOptions || [] as item (item.id)}
                <option value={item.id}>{item.name || item.id}</option>
              {/each}
            </select>
          </label>
          <label class="manager-v2-field">
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')}</span>
            <input type="number" min="1" step="1" value={selectedDrop.quantity || 1} oninput={(event) => onUpdateDrop(selectedDrop.id, { quantity: Number(event.currentTarget.value || 1) })} />
          </label>
        </div>
        <div class="manager-v2-drop-modifier-grid">
          {#each [['timeOfDay', timeOfDayOptions], ['weather', weatherOptions]] as modifierGroup (modifierGroup[0])}
            <section class="manager-v2-drop-modifier-panel" data-gathering-drop-modifier-kind={modifierGroup[0]}>
              <div class="manager-v2-task-card-header">
                <h4>
                  <i class={modifierGroup[0] === 'weather' ? 'fas fa-cloud-rain' : 'far fa-clock'} aria-hidden="true"></i>
                  <span>{modifierGroup[0] === 'weather' ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.WeatherModifiers', 'Weather Modifiers') : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TimeModifiers', 'Time of Day Modifiers')}</span>
                </h4>
                <button type="button" class="manager-v2-button" onclick={() => onAddModifier(selectedDrop.id, modifierGroup[0])}>
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddModifier', 'Add')}</span>
                </button>
              </div>
              <div class="manager-v2-requirements-list">
                {#each modifierRows(modifierGroup[0]) as modifier (modifier.id)}
                  <div class="manager-v2-requirement-row manager-v2-modifier-row" data-gathering-drop-modifier-id={modifier.id}>
                    <select value={modifier.conditionId} onchange={(event) => onUpdateModifier(selectedDrop.id, modifierGroup[0], modifier.id, { conditionId: event.currentTarget.value })}>
                      {#each modifierGroup[1] as option (conditionId(option))}
                        <option value={conditionId(option)}>{conditionLabel(option)}</option>
                      {/each}
                    </select>
                    <span class={`manager-v2-modifier-arrow ${modifierClass(modifier.value)}`}>{Number(modifier.value || 0) < 0 ? '-' : '+'}</span>
                    <input class={`manager-v2-modifier-value ${modifierClass(modifier.value)}`} type="number" step="1" value={modifier.value || 0} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ModifierValue', 'Modifier value')} oninput={(event) => onUpdateModifier(selectedDrop.id, modifierGroup[0], modifier.id, { value: Number(event.currentTarget.value || 0) })} />
                    <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DeleteModifier', 'Delete modifier')} onclick={() => onDeleteModifier(selectedDrop.id, modifierGroup[0], modifier.id)}>
                      <i class="fas fa-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                {:else}
                  <div class="manager-v2-requirement-row">
                    <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NotSpecified', 'Not specified')}</span>
                    <strong>0%</strong>
                  </div>
                {/each}
              </div>
            </section>
          {/each}
        </div>
      </section>
    {/if}

    <section class="manager-v2-warning-band is-formula">
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.FinalChanceFormula', 'Final drop chance for this item = base rate + selected drop modifiers + environment overrides.')}</span>
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
