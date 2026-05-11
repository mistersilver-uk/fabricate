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
    regionOptions = [],
    biomeOptions = [],
    selectedDropId = '',
    rewardRules = null,
    onPickImagePath = null,
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
  let openAvailabilityMenu = $state('');

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
    openAvailabilityMenu = '';
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

  function conditionIcon(option) {
    return String(option?.icon || 'fas fa-circle').trim();
  }

  function conditionOptions(kind) {
    if (kind === 'weather') return weatherOptions;
    if (kind === 'biomes') return biomeOptions;
    return timeOfDayOptions;
  }

  function selectedConditionIds(kind) {
    const values = kind === 'weather'
      ? task?.weather
      : kind === 'biomes'
        ? task?.biomes
        : task?.timeOfDay;
    return Array.isArray(values)
      ? values.map(value => String(value || '').trim()).filter(Boolean)
      : [];
  }

  function selectedConditionOptions(kind) {
    const selectedIds = selectedConditionIds(kind);
    return selectedIds.map(id => (conditionOptions(kind) || []).find(option => conditionId(option) === id) || { id, label: id });
  }

  function availableConditionOptions(kind) {
    const selectedIds = new Set(selectedConditionIds(kind));
    return (conditionOptions(kind) || []).filter(option => {
      const id = conditionId(option);
      return id && !selectedIds.has(id);
    });
  }

  function availabilityMenuLabel(kind) {
    const available = availableConditionOptions(kind);
    if (available.length === 0) {
      if (kind === 'weather') {
        return text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AllWeatherSelected', 'All weather selected');
      }
      return kind === 'biomes'
        ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AllBiomesSelected', 'All biomes selected')
        : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AllTimesSelected', 'All times selected');
    }
    if (kind === 'weather') {
      return text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddWeatherCondition', 'Add weather');
    }
    return kind === 'biomes'
      ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddBiomeCondition', 'Add biome')
      : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddTimeOfDayCondition', 'Add time of day');
  }

  function availabilityFieldLabel(kind) {
    if (kind === 'weather') {
      return text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Weather', 'Weather');
    }
    return kind === 'biomes'
      ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Biome', 'Biome')
      : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.TimeOfDay', 'Time of day');
  }

  function emptyAvailabilityLabel(kind) {
    if (kind === 'weather') {
      return text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyWeatherTitle', 'Any Weather');
    }
    return kind === 'biomes'
      ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyBiomeTitle', 'Any Biome')
      : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AnyTimeTitle', 'Any Time');
  }

  function removeAvailabilityLabel(option) {
    return text('FABRICATE.Admin.ManagerV2.Environment.Tasks.RemoveAvailabilityCondition', 'Remove {name}')
      .replace('{name}', conditionLabel(option));
  }

  function regionLabel(option) {
    return conditionLabel(option);
  }

  function regionId(option) {
    return conditionId(option);
  }

  function selectedRegionId() {
    return String(task?.region || '').trim();
  }

  function updateRegion(event) {
    onUpdateTask({ region: String(event.currentTarget.value || '').trim() });
  }

  function addAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) return;
    const selectedIds = selectedConditionIds(kind);
    if (selectedIds.includes(normalizedId)) return;
    onUpdateTask({ [kind]: [...selectedIds, normalizedId] });
    openAvailabilityMenu = '';
  }

  function removeAvailability(kind, id) {
    const normalizedId = String(id || '').trim();
    onUpdateTask({ [kind]: selectedConditionIds(kind).filter(value => value !== normalizedId) });
  }

  function componentLabel(row) {
    const item = managedItem(row?.componentId);
    return row?.name || item?.name || row?.itemUuid || text('FABRICATE.Admin.ManagerV2.Environment.Tasks.UnresolvedDrop', 'Unresolved drop');
  }

  function componentImage(row) {
    return managedItem(row?.componentId)?.img || 'icons/svg/item-bag.svg';
  }

  function componentDescription(row) {
    const item = managedItem(row?.componentId);
    const description = String(item?.description || row?.description || '').trim();
    if (description) return description;
    return item
      ? text('FABRICATE.Admin.ManagerV2.NoDescription', 'No description')
      : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.UnresolvedDrop', 'Unresolved drop');
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
    return conditionLabel((options || []).find(option => conditionId(option) === entry.conditionId)) || entry.conditionId;
  }

  function modifierIcon(entry) {
    const options = entry.kind === 'weather' ? weatherOptions : timeOfDayOptions;
    const option = (options || []).find(option => conditionId(option) === entry.conditionId);
    return conditionIcon(option || { icon: entry.kind === 'weather' ? 'fas fa-cloud-sun' : 'fas fa-clock' });
  }

  function modifierValueLabel(entry) {
    const sign = Number(entry.value || 0) >= 0 ? '+' : '';
    return `${sign}${Number(entry.value || 0)}%`;
  }

  function modifierClass(value) {
    const number = Number(value || 0);
    if (number < 0) return 'is-negative';
    if (number > 0) return 'is-positive';
    return 'is-neutral';
  }

  function onQuantityInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+/, '');
    input.value = normalized;
    const quantity = Number(normalized);
    if (Number.isInteger(quantity) && quantity > 0) onUpdateDrop(rowId, { quantity });
  }

  function onQuantityBlur(row, event) {
    const quantity = Number(String(event.currentTarget.value || '').replace(/\D+/g, ''));
    if (!Number.isInteger(quantity) || quantity < 1) event.currentTarget.value = String(row.quantity || 1);
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
      <div class="manager-v2-task-core-grid">
        <div class="manager-v2-task-media-column">
          <button type="button" class="manager-v2-task-image-picker" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ChooseImage', 'Choose task image')} onclick={chooseTaskImage} disabled={typeof onPickImagePath !== 'function'}>
            <img src={taskImage()} alt="" />
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>

          <div class="manager-v2-task-core-status">
            <button
              type="button"
              class={`manager-v2-status-toggle ${task.enabled === false ? 'is-off' : 'is-on'}`}
              data-gathering-task-field="enabled"
              aria-pressed={task.enabled !== false}
              aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ToggleNamed', 'Toggle {name}').replace('{name}', task.name || text('FABRICATE.Admin.ManagerV2.Environment.Tasks.UnnamedTask', 'Unnamed gathering task'))}
              onclick={() => onUpdateTask({ enabled: task.enabled === false })}
            >
              <span class="manager-v2-status-toggle-track" aria-hidden="true">
                <span class="manager-v2-status-toggle-knob"></span>
              </span>
              <span class="manager-v2-status-toggle-label">
                {task.enabled === false ? text('FABRICATE.Admin.ManagerV2.StatusOff', 'Off') : text('FABRICATE.Admin.ManagerV2.StatusOn', 'On')}
              </span>
            </button>
            <p class="manager-v2-muted">{task.enabled === false ? text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DisabledHint', 'Players cannot attempt this task while it is disabled.') : text('FABRICATE.Admin.ManagerV2.Environment.Tasks.EnabledHint', 'This task is available when its gates match.')}</p>
          </div>
        </div>

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
        <label class="manager-v2-field" data-gathering-task-field="region">
          <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Region', 'Region')}</span>
          <select value={selectedRegionId()} onchange={updateRegion}>
            <option value="">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AllRegionsTitle', 'All regions')}</option>
            {#each regionOptions as option (regionId(option))}
              {#if regionId(option)}
                <option value={regionId(option)}>{regionLabel(option)}</option>
              {/if}
            {/each}
          </select>
        </label>
        {#each ['biomes', 'timeOfDay', 'weather'] as kind (kind)}
          <div class="manager-v2-field manager-v2-availability-multi" data-gathering-task-field={kind}>
            <span>{availabilityFieldLabel(kind)}</span>
            <div class="manager-v2-availability-picker">
              <button
                type="button"
                class="manager-v2-availability-menu-button"
                aria-haspopup="listbox"
                aria-expanded={openAvailabilityMenu === kind}
                onclick={() => openAvailabilityMenu = openAvailabilityMenu === kind ? '' : kind}
              >
                <span>{availabilityMenuLabel(kind)}</span>
                <i class="fas fa-chevron-down" aria-hidden="true"></i>
              </button>
              {#if openAvailabilityMenu === kind}
                <div class="manager-v2-availability-menu" role="listbox" aria-label={availabilityFieldLabel(kind)}>
                  {#if availableConditionOptions(kind).length > 0}
                    {#each availableConditionOptions(kind) as option (conditionId(option))}
                      <button
                        type="button"
                        class="manager-v2-availability-option"
                        role="option"
                        aria-selected="false"
                        data-gathering-task-availability-option={kind}
                        data-condition-id={conditionId(option)}
                        onclick={() => addAvailability(kind, conditionId(option))}
                      >
                        <i class={conditionIcon(option)} aria-hidden="true"></i>
                        <span>{conditionLabel(option)}</span>
                      </button>
                    {/each}
                  {:else}
                    <span class="manager-v2-availability-empty">{availabilityMenuLabel(kind)}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="manager-v2-availability-pill-row" data-gathering-task-availability-pills={kind}>
              {#if selectedConditionOptions(kind).length > 0}
                {#each selectedConditionOptions(kind) as option (conditionId(option))}
                  <span class="manager-v2-availability-pill" data-gathering-task-availability-pill={kind} data-condition-id={conditionId(option)}>
                    <i class={conditionIcon(option)} aria-hidden="true"></i>
                    <span>{conditionLabel(option)}</span>
                    <button type="button" class="manager-v2-availability-remove" aria-label={removeAvailabilityLabel(option)} onclick={() => removeAvailability(kind, conditionId(option))}>
                      <i class="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="manager-v2-muted manager-v2-availability-any">{emptyAvailabilityLabel(kind)}</span>
              {/if}
            </div>
          </div>
        {/each}
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
        <div class="manager-v2-task-drop-controls">
          <label class="manager-v2-search is-compact">
            <i class="fas fa-search" aria-hidden="true"></i>
            <input type="search" bind:value={searchTerm} placeholder={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDropsPlaceholder', 'Search drop rules...')} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.SearchDrops', 'Search drop rules')} />
          </label>
          <button type="button" class="manager-v2-button" onclick={onAddDrop}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.AddDrop', 'Add drop rule')}</span>
          </button>
        </div>
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
              <div
                class={`manager-v2-gathering-task-drop-row ${selectedDrop?.id === row.id ? 'is-selected' : ''}`}
                role="row"
                data-gathering-task-drop-id={row.id}
                aria-selected={selectedDrop?.id === row.id}
                tabindex="0"
                onclick={() => onSelectDrop(row.id)}
                onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDrop(row.id); } }}
              >
                <span role="cell" class="manager-v2-drop-cell manager-v2-drop-component-cell" data-gathering-task-drop-component-cell>
                  {#if row.componentId || row.itemUuid}
                    <button type="button" class="manager-v2-gathering-task-identity manager-v2-drop-component-button" onclick={(event) => { event.stopPropagation(); onSelectDrop(row.id); }} onkeydown={(event) => event.stopPropagation()}>
                      <img class="manager-v2-gathering-task-thumb" src={componentImage(row)} alt="" />
                      <span class="manager-v2-system-copy">
                        <span class="manager-v2-system-name">{componentLabel(row)}</span>
                        <span class="manager-v2-system-description">{componentDescription(row)}</span>
                      </span>
                    </button>
                  {:else}
                    <div class="manager-v2-gathering-task-identity manager-v2-drop-empty-component is-empty">
                      <span
                        class="manager-v2-inline-drop-zone"
                        use:dragDrop={{ onDrop: (data) => handleDropZoneDrop(row.id, data), activeClass: 'is-drop-active' }}
                        data-gathering-task-drop-zone={row.id}
                      >
                        <i class="fas fa-file-import" aria-hidden="true"></i>
                      </span>
                      <span class="manager-v2-system-copy">
                        <span class="manager-v2-system-name">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoComponent', 'No Component')}</span>
                        <span class="manager-v2-system-description">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.CreateOrAssign', 'Create or assign')}</span>
                      </span>
                    </div>
                  {/if}
                </span>
                <span role="cell" class="manager-v2-drop-cell manager-v2-drop-rate-cell" data-gathering-task-drop-chance-cell>
                  <span class="manager-v2-drop-rate-value">
                    <strong>{row.dropRate ?? 1}%</strong>
                    <span class="manager-v2-drop-rate-control">
                      <span class="manager-v2-drop-rate-tier-track" aria-hidden="true">
                        <span class="is-mythic"></span>
                        <span class="is-very-rare"></span>
                        <span class="is-rare"></span>
                        <span class="is-uncommon"></span>
                        <span class="is-common"></span>
                      </span>
                      <input type="range" min="0" max="100" step="1" value={row.dropRate ?? 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DropChance', 'Drop chance')} oninput={(event) => onUpdateDrop(row.id, { dropRate: Number(event.currentTarget.value) })} onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()} />
                    </span>
                  </span>
                </span>
                <span role="cell" class="manager-v2-drop-cell manager-v2-drop-quantity-cell">
                  <input type="text" inputmode="numeric" pattern="[1-9][0-9]*" value={row.quantity || 1} aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.Quantity', 'Quantity')} oninput={(event) => onQuantityInput(row.id, event)} onblur={(event) => onQuantityBlur(row, event)} onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()} />
                </span>
                <span role="cell" class="manager-v2-drop-cell manager-v2-chip-row">
                  <span class="manager-v2-drop-modifier-list">
                    {#if modifierEntries(row).length > 0}
                      {#each modifierEntries(row) as modifier (modifier.id)}
                        <span class={`manager-v2-chip manager-v2-drop-modifier-pill ${modifierClass(modifier.value)}`}>
                          <i class={modifierIcon(modifier)} aria-hidden="true"></i>
                          <span>{modifierLabel(modifier)}</span>
                          <strong>{modifierValueLabel(modifier)}</strong>
                        </span>
                      {/each}
                    {:else}
                      <span class="manager-v2-chip is-neutral">{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.NoModifiers', 'Not specified')}</span>
                    {/if}
                  </span>
                </span>
                <span role="cell" class="manager-v2-drop-cell manager-v2-action-group manager-v2-drop-actions" data-gathering-task-drop-actions>
                  <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DuplicateDrop', 'Duplicate drop rule')} onclick={(event) => { event.stopPropagation(); onDuplicateDrop(row.id); }} onkeydown={(event) => event.stopPropagation()}><i class="fas fa-copy" aria-hidden="true"></i></button>
                  <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Environment.Tasks.DeleteDrop', 'Delete drop rule')} onclick={(event) => { event.stopPropagation(); onDeleteDrop(row.id); }} onkeydown={(event) => event.stopPropagation()}><i class="fas fa-trash" aria-hidden="true"></i></button>
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <div class="manager-v2-task-drop-footer">
        <span class="manager-v2-muted manager-v2-drop-count" data-gathering-task-drop-count>{text('FABRICATE.Admin.ManagerV2.Environment.Tasks.ShowingDrops', 'Showing {start}-{end} of {total} drops').replace('{start}', showingStart).replace('{end}', showingEnd).replace('{total}', filteredRows.length)}</span>
        <Pagination
          totalCount={filteredRows.length}
          {pageSize}
          {pageIndex}
          onPageChange={(next) => pageIndex = next}
          onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
        />
      </div>
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
      </div>
    </div>
  {/if}
</main>
