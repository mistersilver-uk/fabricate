<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import Pagination from '../../components/Pagination.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { dropRateTierClass, dropRateTierColor } from '../../util/dropRateTier.js';

  let {
    task = null,
    itemCards = [],
    managedItemOptions = [],
    weatherOptions = [],
    timeOfDayOptions = [],
    regionOptions = [],
    biomeOptions = [],
    selectedDropId = '',
    rewardRules = null,
    characterModifierLibrary = [],
    libraryTools = [],
    onPickImagePath = null,
    onUpdateTask = () => {},
    onSelectDrop = () => {},
    onAddDrop = () => {},
    onUpdateDrop = () => {},
    onMoveDrop = () => {},
    onImportDrop = () => {},
    onAddToolReference = () => {},
    onRemoveToolReference = () => {}
  } = $props();

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(5);
  let componentSearchTerm = $state('');
  let componentTagSearchTerm = $state('');
  let selectedComponentTags = $state([]);
  let componentPageIndex = $state(0);
  let lastTaskId = $state('');
  let openAvailabilityMenu = $state('');
  let componentPageSize = $state(6);
  let toolSearchTerm = $state('');
  let toolPageIndex = $state(0);
  let toolPageSize = $state(6);

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
  const rankedMode = $derived(rewardRules?.rewardSelectionMode === 'highestRankedDrop');
  const componentCards = $derived(Array.isArray(itemCards) ? itemCards : []);
  const normalizedComponentSearchTerm = $derived(componentSearchTerm.trim().toLowerCase());
  const componentTagOptions = $derived(uniqueSorted(componentCards.flatMap(item => Array.isArray(item.tags) ? item.tags : [])));
  const normalizedComponentTagSearchTerm = $derived(componentTagSearchTerm.trim().toLowerCase());
  const componentTagSuggestions = $derived(normalizedComponentTagSearchTerm
    ? componentTagOptions.filter(tag => !selectedComponentTags.includes(tag) && tag.toLowerCase().includes(normalizedComponentTagSearchTerm))
    : []);
  const filteredComponentCards = $derived(componentCards.filter(item => {
    const name = String(item?.name || '').toLowerCase();
    const itemTags = Array.isArray(item?.tags) ? item.tags : [];
    const matchesName = !normalizedComponentSearchTerm || name.includes(normalizedComponentSearchTerm);
    const matchesTags = selectedComponentTags.length === 0 || selectedComponentTags.every(tag => itemTags.includes(tag));
    return matchesName && matchesTags;
  }));
  const paginatedComponentCards = $derived(filteredComponentCards.slice(
    componentPageIndex * componentPageSize,
    (componentPageIndex + 1) * componentPageSize
  ));
  const componentShowingStart = $derived(filteredComponentCards.length === 0 ? 0 : componentPageIndex * componentPageSize + 1);
  const componentShowingEnd = $derived(Math.min(filteredComponentCards.length, (componentPageIndex + 1) * componentPageSize));

  const libraryToolList = $derived(Array.isArray(libraryTools) ? libraryTools : []);
  const attachedToolIds = $derived(Array.isArray(task?.toolIds) ? task.toolIds : []);
  const libraryToolIndex = $derived(new Map(libraryToolList.map(tool => [String(tool?.id || ''), tool])));
  const attachedToolEntries = $derived(attachedToolIds.map(id => ({
    id,
    tool: libraryToolIndex.get(String(id)) || null
  })));
  const normalizedToolSearchTerm = $derived(toolSearchTerm.trim().toLowerCase());
  const unattachedLibraryTools = $derived(libraryToolList.filter(tool => !attachedToolIds.includes(tool?.id)));
  const filteredLibraryTools = $derived(unattachedLibraryTools.filter(tool => {
    if (!normalizedToolSearchTerm) return true;
    const component = managedItem(tool?.componentId);
    const haystack = `${tool?.label || ''} ${component?.name || ''}`.toLowerCase();
    return haystack.includes(normalizedToolSearchTerm);
  }));
  const paginatedLibraryTools = $derived(filteredLibraryTools.slice(
    toolPageIndex * toolPageSize,
    (toolPageIndex + 1) * toolPageSize
  ));
  const toolShowingStart = $derived(filteredLibraryTools.length === 0 ? 0 : toolPageIndex * toolPageSize + 1);
  const toolShowingEnd = $derived(Math.min(filteredLibraryTools.length, (toolPageIndex + 1) * toolPageSize));

  $effect(() => {
    if (task?.id === lastTaskId) return;
    searchTerm = '';
    pageIndex = 0;
    componentSearchTerm = '';
    componentTagSearchTerm = '';
    selectedComponentTags = [];
    componentPageIndex = 0;
    openAvailabilityMenu = '';
    toolSearchTerm = '';
    toolPageIndex = 0;
    lastTaskId = task?.id || '';
  });

  $effect(() => {
    if (toolPageIndex > 0 && toolPageIndex * toolPageSize >= filteredLibraryTools.length) toolPageIndex = 0;
  });

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredRows.length) pageIndex = 0;
  });

  $effect(() => {
    if (componentPageIndex > 0 && componentPageIndex * componentPageSize >= filteredComponentCards.length) componentPageIndex = 0;
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function managedItem(componentId) {
    return (managedItemOptions || []).find(option => String(option.id || '') === String(componentId || '')) || null;
  }

  function componentCardImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  function componentDescription(item) {
    return String(item?.description || '').trim();
  }

  function toolDisplayLabel(tool) {
    const label = String(tool?.label || '').trim();
    if (label) return label;
    const component = managedItem(tool?.componentId);
    return component?.name || text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTool', 'Unnamed tool');
  }

  function toolDisplayImage(tool) {
    const component = managedItem(tool?.componentId);
    return component?.img || 'icons/svg/item-bag.svg';
  }

  function toolSummary(tool) {
    const component = managedItem(tool?.componentId);
    return component?.name || '';
  }

  function onToolSearchInput(event) {
    toolSearchTerm = event.currentTarget.value;
    toolPageIndex = 0;
  }

  function addComponentTag(tag) {
    const normalizedTag = String(tag || '').trim();
    if (!normalizedTag || selectedComponentTags.includes(normalizedTag)) return;
    selectedComponentTags = [...selectedComponentTags, normalizedTag];
    componentTagSearchTerm = '';
    componentPageIndex = 0;
  }

  function removeComponentTag(tag) {
    selectedComponentTags = selectedComponentTags.filter(value => value !== tag);
    componentPageIndex = 0;
  }

  function onComponentSearchInput(event) {
    componentSearchTerm = event.currentTarget.value;
    componentPageIndex = 0;
  }

  function onComponentTagSearchInput(event) {
    componentTagSearchTerm = event.currentTarget.value;
  }

  function onComponentDragStart(item, event) {
    const componentId = String(item?.id || '').trim();
    if (!componentId) return;
    event.dataTransfer?.setData?.('text/plain', JSON.stringify({
      type: 'FabricateManagedComponent',
      componentId
    }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy';
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
    if (kind === 'regions') return regionOptions;
    return timeOfDayOptions;
  }

  function selectedConditionIds(kind) {
    let values;
    if (kind === 'weather') values = task?.weather;
    else if (kind === 'biomes') values = task?.biomes;
    else if (kind === 'regions') values = Array.isArray(task?.regions)
      ? task.regions
      : (task?.region ? [task.region] : []);
    else values = task?.timeOfDay;
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
        return text('FABRICATE.Admin.Manager.Environment.Tasks.AllWeatherSelected', 'All weather selected');
      }
      if (kind === 'biomes') {
        return text('FABRICATE.Admin.Manager.Environment.Tasks.AllBiomesSelected', 'All biomes selected');
      }
      if (kind === 'regions') {
        return text('FABRICATE.Admin.Manager.Environment.Tasks.AllRegionsSelected', 'All regions selected');
      }
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AllTimesSelected', 'All times selected');
    }
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AddWeatherCondition', 'Add weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AddBiomeCondition', 'Add biome');
    }
    if (kind === 'regions') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AddRegionCondition', 'Add region');
    }
    return text('FABRICATE.Admin.Manager.Environment.Tasks.AddTimeOfDayCondition', 'Add time of day');
  }

  function availabilityFieldLabel(kind) {
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.Weather', 'Weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.Biome', 'Biome');
    }
    if (kind === 'regions') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.Region', 'Region');
    }
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeOfDay', 'Time of day');
  }

  function emptyAvailabilityLabel(kind) {
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyWeatherTitle', 'Any Weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyBiomeTitle', 'Any Biome');
    }
    if (kind === 'regions') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyRegion', 'Any region');
    }
    return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyTimeTitle', 'Any Time');
  }

  function removeAvailabilityLabel(option) {
    return text('FABRICATE.Admin.Manager.Environment.Tasks.RemoveAvailabilityCondition', 'Remove {name}')
      .replace('{name}', conditionLabel(option));
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
    return row?.name || item?.name || row?.itemUuid || text('FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop', 'Unresolved drop');
  }

  function componentImage(row) {
    return managedItem(row?.componentId)?.img || 'icons/svg/item-bag.svg';
  }

  function characterModifierLibraryEntry(modifierId) {
    if (!modifierId) return null;
    return (characterModifierLibrary || []).find(entry => entry.id === modifierId) || null;
  }

  function modifierEntries(row) {
    const modifiers = row?.conditionModifiers || {};
    const characterRefs = Array.isArray(row?.characterModifiers) ? row.characterModifiers : [];
    return [
      ...(Array.isArray(modifiers.biome) ? modifiers.biome.map(entry => ({ ...entry, kind: 'biome' })) : []),
      ...(Array.isArray(modifiers.timeOfDay) ? modifiers.timeOfDay.map(entry => ({ ...entry, kind: 'timeOfDay' })) : []),
      ...(Array.isArray(modifiers.weather) ? modifiers.weather.map(entry => ({ ...entry, kind: 'weather' })) : []),
      ...characterRefs.map(ref => ({ ...ref, kind: 'character' }))
    ];
  }

  function modifierConditionOptions(kind) {
    if (kind === 'weather') return weatherOptions;
    if (kind === 'biome') return biomeOptions;
    return timeOfDayOptions;
  }


  function modifierLabel(entry) {
    if (entry.kind === 'character') {
      const libraryEntry = characterModifierLibraryEntry(entry.modifierId);
      return libraryEntry?.label || libraryEntry?.id || entry.modifierId || text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifierShort', 'Unknown');
    }
    const options = modifierConditionOptions(entry.kind);
    return conditionLabel((options || []).find(option => conditionId(option) === entry.conditionId)) || entry.conditionId;
  }

  function modifierFallbackIcon(kind) {
    if (kind === 'weather') return 'fas fa-cloud-sun';
    if (kind === 'biome') return 'fas fa-mountain-sun';
    return 'fas fa-clock';
  }

  function modifierIcon(entry) {
    if (entry.kind === 'character') {
      return characterModifierLibraryEntry(entry.modifierId)?.icon || 'fa-solid fa-user';
    }
    const options = modifierConditionOptions(entry.kind);
    const option = (options || []).find(option => conditionId(option) === entry.conditionId);
    return conditionIcon(option || { icon: modifierFallbackIcon(entry.kind) });
  }

  function modifierEffectiveOperator(entry) {
    if (entry?.operator === '-' || entry?.operator === '+') return entry.operator;
    return Number(entry?.value || 0) < 0 ? '-' : '+';
  }

  function modifierValueLabel(entry) {
    if (entry.kind === 'character') return '';
    const magnitude = Math.abs(Math.trunc(Number(entry.value || 0)));
    return `${modifierEffectiveOperator(entry)}${magnitude}%`;
  }

  function modifierClass(entry) {
    if (entry && entry.kind === 'character') {
      return entry.operator === '-' ? 'is-negative' : 'is-positive';
    }
    if (entry && (entry.kind === 'weather' || entry.kind === 'timeOfDay' || entry.kind === 'biome')) {
      const magnitude = Math.abs(Math.trunc(Number(entry.value || 0)));
      if (magnitude === 0) return 'is-neutral';
      return modifierEffectiveOperator(entry) === '-' ? 'is-negative' : 'is-positive';
    }
    const number = Number((entry && typeof entry === 'object' ? entry.value : entry) || 0);
    if (number < 0) return 'is-negative';
    if (number > 0) return 'is-positive';
    return 'is-neutral';
  }

  function normalizeDropRate(value) {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number)) return 1;
    return Math.min(100, Math.max(0, number));
  }

  function normalizeQuantity(value) {
    const number = Math.trunc(Number(value));
    if (!Number.isFinite(number)) return 1;
    return Math.min(999, Math.max(1, number));
  }

  function dropRateValue(row) {
    return normalizeDropRate(row?.dropRate ?? 1);
  }

  function quantityValue(row) {
    return normalizeQuantity(row?.quantity ?? 1);
  }

  function onDropRateInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
    input.value = normalized;
    const dropRate = Number(normalized);
    if (normalized !== '' && Number.isInteger(dropRate) && dropRate >= 0 && dropRate <= 100) {
      onUpdateDrop(rowId, { dropRate });
    }
  }

  function onDropRateBlur(row, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+(?=\d)/, '');
    const dropRate = Number(normalized);
    if (normalized !== '' && Number.isInteger(dropRate) && dropRate >= 0 && dropRate <= 100) {
      input.value = String(dropRate);
      onUpdateDrop(row.id, { dropRate });
      return;
    }
    input.value = String(dropRateValue(row));
  }

  function onDropRateKeydown(row, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentValue = event.currentTarget.value === '' ? dropRateValue(row) : Number(event.currentTarget.value);
    const dropRate = normalizeDropRate((Number.isFinite(currentValue) ? currentValue : dropRateValue(row)) + (event.key === 'ArrowUp' ? 1 : -1));
    event.currentTarget.value = String(dropRate);
    onUpdateDrop(row.id, { dropRate });
  }

  function onQuantityInput(rowId, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+/, '');
    input.value = normalized;
    const quantity = Number(normalized);
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) onUpdateDrop(rowId, { quantity });
  }

  function onQuantityBlur(row, event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '').replace(/\D+/g, '').replace(/^0+/, '');
    const quantity = Number(normalized);
    if (normalized !== '' && Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) {
      input.value = String(quantity);
      onUpdateDrop(row.id, { quantity });
      return;
    }
    input.value = String(quantityValue(row));
  }

  function onQuantityKeydown(row, event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentValue = event.currentTarget.value === '' ? quantityValue(row) : Number(event.currentTarget.value);
    const quantity = normalizeQuantity((Number.isFinite(currentValue) ? currentValue : quantityValue(row)) + (event.key === 'ArrowUp' ? 1 : -1));
    event.currentTarget.value = String(quantity);
    onUpdateDrop(row.id, { quantity });
  }

  function onClearDropComponent(rowId, event) {
    event.preventDefault();
    event.stopPropagation();
    onUpdateDrop(rowId, { componentId: '', systemItemId: '', itemUuid: '', name: '' });
  }

  function onDropComponentMouseDown(rowId, event) {
    if (event.button !== 2) return;
    onClearDropComponent(rowId, event);
  }

  function handleDropZoneDrop(rowId, data) {
    if (data?.type === 'FabricateManagedComponent' && data.componentId) {
      onUpdateDrop(rowId, { componentId: data.componentId, itemUuid: '', systemItemId: '', name: '', enabled: true });
      onSelectDrop(rowId);
      return;
    }
    onImportDrop(rowId, data);
  }

  async function chooseTaskImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(task?.img || '');
    if (value) onUpdateTask({ img: value });
  }
</script>

<main
  class="manager-main manager-gathering-task-edit-view"
  class:has-reward-rule-notice={showRewardRuleNotice}
  aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.EditTitle', 'Edit gathering task')}
  data-gathering-task-editor
>
  {#if task}
    <section class="manager-task-core-card" data-gathering-task-core-editor>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.TaskIdentity', 'Task Identity')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.TaskIdentityHint', 'Name the task, give it a description, choose an image, and toggle whether it is enabled.')}</p>
        </div>
      </div>
      <div class="manager-task-core-grid">
        <div class="manager-task-media-column">
          <button type="button" class="manager-task-image-picker" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.ChooseImage', 'Choose task image')} onclick={chooseTaskImage} disabled={typeof onPickImagePath !== 'function'}>
            <img src={taskImage()} alt="" />
            <i class="fas fa-pen" aria-hidden="true"></i>
          </button>

          <div class="manager-task-core-status">
            <button
              type="button"
              class={`manager-status-toggle ${task.enabled === false ? 'is-off' : 'is-on'}`}
              data-gathering-task-field="enabled"
              aria-pressed={task.enabled !== false}
              aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.ToggleNamed', 'Toggle {name}').replace('{name}', task.name || text('FABRICATE.Admin.Manager.Environment.Tasks.UnnamedTask', 'Unnamed gathering task'))}
              onclick={() => onUpdateTask({ enabled: task.enabled === false })}
            >
              <span class="manager-status-toggle-track" aria-hidden="true">
                <span class="manager-status-toggle-knob"></span>
              </span>
              <span class="manager-status-toggle-label">
                {task.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
              </span>
            </button>
            <p class="manager-muted">{task.enabled === false ? text('FABRICATE.Admin.Manager.Environment.Tasks.DisabledHint', 'Players cannot attempt this task while it is disabled.') : text('FABRICATE.Admin.Manager.Environment.Tasks.EnabledHint', 'This task is available when its gates match.')}</p>
          </div>
        </div>

        <div class="manager-task-identity-fields">
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Name', 'Name')}</span>
            <input data-gathering-task-field="name" value={task.name || ''} oninput={(event) => onUpdateTask({ name: event.currentTarget.value })} />
          </label>
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.Description', 'Description')}</span>
            <textarea data-gathering-task-field="description" value={task.description || ''} oninput={(event) => onUpdateTask({ description: event.currentTarget.value })}></textarea>
          </label>
        </div>
      </div>
    </section>

    <section class="manager-task-availability-card">
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.TaskAvailability', 'Task Availability')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.AvailabilityHint', 'Availability controls whether this task can be attempted. Individual drops can still have their own time and weather modifiers.')}</p>
        </div>
      </div>
      <div class="manager-task-availability-row" data-gathering-task-availability>
        {#each ['regions', 'biomes', 'timeOfDay', 'weather'] as kind (kind)}
          <div class="manager-field manager-availability-multi" data-gathering-task-field={kind}>
            <span>{availabilityFieldLabel(kind)}</span>
            <div
              class="manager-availability-picker"
              use:dismissOnOutsideClick={{
                enabled: openAvailabilityMenu === kind,
                onDismiss: () => { if (openAvailabilityMenu === kind) openAvailabilityMenu = ''; }
              }}
            >
              <button
                type="button"
                class="manager-availability-menu-button"
                aria-haspopup="listbox"
                aria-expanded={openAvailabilityMenu === kind}
                onclick={() => openAvailabilityMenu = openAvailabilityMenu === kind ? '' : kind}
              >
                <span>{availabilityMenuLabel(kind)}</span>
                <i class="fas fa-chevron-down" aria-hidden="true"></i>
              </button>
              {#if openAvailabilityMenu === kind}
                <div class="manager-availability-menu" role="listbox" aria-label={availabilityFieldLabel(kind)}>
                  {#if availableConditionOptions(kind).length > 0}
                    {#each availableConditionOptions(kind) as option (conditionId(option))}
                      <button
                        type="button"
                        class="manager-availability-option"
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
                    <span class="manager-availability-empty">{availabilityMenuLabel(kind)}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="manager-availability-pill-row" data-gathering-task-availability-pills={kind}>
              {#if selectedConditionOptions(kind).length > 0}
                {#each selectedConditionOptions(kind) as option (conditionId(option))}
                  <span class="manager-availability-pill" data-gathering-task-availability-pill={kind} data-condition-id={conditionId(option)}>
                    <i class={conditionIcon(option)} aria-hidden="true"></i>
                    <span>{conditionLabel(option)}</span>
                    <button type="button" class="manager-availability-remove" aria-label={removeAvailabilityLabel(option)} onclick={() => removeAvailability(kind, conditionId(option))}>
                      <i class="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted manager-availability-any">{emptyAvailabilityLabel(kind)}</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="manager-task-required-tools-card" data-gathering-task-required-tools>
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsTitle', 'Required Tools')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsHint', 'Pick tools the actor must wield to attempt this task. All listed tools are required.')}</p>
        </div>
      </div>

      <div class="manager-task-required-tools-attached" data-gathering-task-required-tools-attached>
        {#if attachedToolEntries.length === 0}
          <span class="manager-muted manager-availability-any">{text('FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsEmpty', 'No tools required.')}</span>
        {:else}
          <div class="manager-availability-pill-row">
            {#each attachedToolEntries as entry (entry.id)}
              {#if entry.tool}
                <span class="manager-availability-pill manager-required-tool-pill" data-gathering-task-required-tool-pill={entry.id}>
                  <img class="manager-required-tool-thumb" src={toolDisplayImage(entry.tool)} alt="" />
                  <span>{toolDisplayLabel(entry.tool)}</span>
                  <button type="button" class="manager-availability-remove"
                    aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.RemoveToolFromTask', 'Remove {name} from required tools').replace('{name}', toolDisplayLabel(entry.tool))}
                    onclick={() => onRemoveToolReference(entry.id)}>
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                  </button>
                </span>
              {:else}
                <span class="manager-availability-pill manager-required-tool-pill is-stale" data-gathering-task-required-tool-pill={entry.id}>
                  <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.StaleToolChip', 'Deleted tool')}</span>
                  <button type="button" class="manager-availability-remove"
                    aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.RemoveStaleToolFromTask', 'Remove deleted tool reference')}
                    onclick={() => onRemoveToolReference(entry.id)}>
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                  </button>
                </span>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

      {#if libraryToolList.length > 0}
        <div class="manager-task-required-tools-search">
          <label class="manager-search is-compact" data-gathering-task-required-tools-search>
            <i class="fas fa-search" aria-hidden="true"></i>
            <input type="search"
              value={toolSearchTerm}
              oninput={onToolSearchInput}
              placeholder={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchTools', 'Search tools...')}
              aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchToolsByName', 'Search tools by name')} />
          </label>
        </div>
      {/if}

      <div class="manager-task-required-tools-scroll" data-gathering-task-required-tools-scroll>
        {#if libraryToolList.length === 0}
          <div class="manager-empty is-compact" data-gathering-task-required-tools-library-empty>
            <div>
              <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsLibraryEmptyTitle', 'No tools in this system’s library')}</h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.RequiredToolsLibraryEmptyHint', 'Open the Tools page from the left rail to add tools first.')}</p>
            </div>
          </div>
        {:else if filteredLibraryTools.length === 0}
          <div class="manager-empty is-compact">
            <div>
              <i class="fas fa-search" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptyToolSearchTitle', 'No tools match your search')}</h3>
            </div>
          </div>
        {:else}
          <div class="manager-task-required-tools-grid" data-gathering-task-required-tools-grid>
            {#each paginatedLibraryTools as tool (tool.id)}
              <button type="button"
                class="manager-task-component-card manager-task-required-tools-card-item"
                data-gathering-task-required-tools-card={tool.id}
                aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.AddToolToTask', 'Add {name} to required tools').replace('{name}', toolDisplayLabel(tool))}
                onclick={() => onAddToolReference(tool.id)}>
                <img class="manager-task-component-card-image" src={toolDisplayImage(tool)} alt="" />
                <span class="manager-task-component-card-copy">
                  <strong>{toolDisplayLabel(tool)}</strong>
                  <span>{toolSummary(tool) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</span>
                </span>
                <i class="fas fa-plus manager-task-required-tools-add-icon" aria-hidden="true"></i>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      {#if libraryToolList.length > 0}
        <div class="manager-task-required-tools-footer">
          <span class="manager-muted manager-drop-count" data-gathering-task-required-tools-count>
            {text('FABRICATE.Admin.Manager.Environment.Tasks.ShowingTools', 'Showing {start}-{end} of {total} tools')
              .replace('{start}', toolShowingStart)
              .replace('{end}', toolShowingEnd)
              .replace('{total}', filteredLibraryTools.length)}
          </span>
          <Pagination
            totalCount={filteredLibraryTools.length}
            pageSize={toolPageSize}
            pageIndex={toolPageIndex}
            pageSizeOptions={[6, 9, 12]}
            onPageChange={(next) => toolPageIndex = next}
            onPageSizeChange={(next) => { toolPageSize = next; toolPageIndex = 0; }}
          />
        </div>
      {/if}
    </section>

    <section class="manager-task-component-browser-card" data-gathering-task-component-browser>
      <div class="manager-task-card-header">
        <div class="manager-task-drop-header-copy">
          <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.ComponentBrowser', 'Components')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.ComponentBrowserHint', 'Drag a component onto any drop rule row to assign or replace it.')}</p>
        </div>
        <div class="manager-task-component-browser-controls">
          <label class="manager-search is-compact" data-gathering-component-name-search>
            <i class="fas fa-search" aria-hidden="true"></i>
            <input type="search" value={componentSearchTerm} oninput={onComponentSearchInput} placeholder={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsPlaceholder', 'Search components...')} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentsByName', 'Search component names')} />
          </label>
          <label class="manager-search is-compact manager-task-component-tag-search" data-gathering-component-tag-search>
            <i class="fas fa-tags" aria-hidden="true"></i>
            <input type="search" value={componentTagSearchTerm} oninput={onComponentTagSearchInput} placeholder={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchTagsPlaceholder', 'Search tags...')} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchComponentTags', 'Search component tags')} />
            {#if componentTagSuggestions.length > 0}
              <div class="manager-tag-suggestions" data-gathering-component-tag-suggestions>
                {#each componentTagSuggestions as tag (tag)}
                  <button type="button" class="manager-tag-suggestion" data-gathering-component-tag-suggestion={tag} onclick={() => addComponentTag(tag)}>
                    {tag}
                  </button>
                {/each}
              </div>
            {/if}
          </label>
        </div>
      </div>

      {#if selectedComponentTags.length > 0}
        <div class="manager-toolbar-pills manager-selected-tag-row manager-task-component-pills" role="list" aria-label={text('FABRICATE.Admin.Manager.Component.SelectedTags', 'Selected component tags')} data-gathering-component-tag-pills>
          {#each selectedComponentTags as tag (tag)}
            <span class="manager-chip manager-selected-tag-pill" role="listitem" data-gathering-component-tag-pill={tag}>
              {tag}
              <button type="button" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.RemoveComponentTagFilter', 'Remove {tag}').replace('{tag}', tag)} onclick={() => removeComponentTag(tag)}>
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </span>
          {/each}
        </div>
      {/if}

      <div class="manager-task-component-browser-scroll" data-gathering-task-component-browser-scroll>
        {#if componentCards.length === 0}
          <div class="manager-empty is-compact">
            <div>
              <i class="fas fa-box-open" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.NoComponents', 'No components available')}</h3>
            </div>
          </div>
        {:else if filteredComponentCards.length === 0}
          <div class="manager-empty is-compact">
            <div>
              <i class="fas fa-search" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptyComponentSearchTitle', 'No components match these filters')}</h3>
            </div>
          </div>
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
                  <span>{componentDescription(item) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}</span>
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
        <span class="manager-muted manager-drop-count" data-gathering-component-count>{text('FABRICATE.Admin.Manager.Environment.Tasks.ShowingComponents', 'Showing {start}-{end} of {total} components').replace('{start}', componentShowingStart).replace('{end}', componentShowingEnd).replace('{total}', filteredComponentCards.length)}</span>
        <Pagination
          totalCount={filteredComponentCards.length}
          pageSize={componentPageSize}
          pageIndex={componentPageIndex}
          pageSizeOptions={[6, 9, 12]}
          onPageChange={(next) => componentPageIndex = next}
          onPageSizeChange={(next) => { componentPageSize = next; componentPageIndex = 0; }}
        />
      </div>
    </section>

    {#if showRewardRuleNotice}
      <section class="manager-warning-band" data-gathering-task-reward-rule-notice>
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.RewardRuleNotice', 'Multiple drop rows use this component. Current drop rules may award only one matching row.')}</span>
      </section>
    {/if}

    <section class="manager-task-drops-card">
      <div class="manager-task-card-header">
        <div class="manager-task-drop-header-copy">
          <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.DropRules', 'Drop Rules')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.DropRulesHint', 'Configure what can drop, how often, and which conditions modify each drop.')}</p>
        </div>
        <div class="manager-task-drop-controls">
          <label class="manager-search is-compact">
            <i class="fas fa-search" aria-hidden="true"></i>
            <input type="search" bind:value={searchTerm} placeholder={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchDropsPlaceholder', 'Search drop rules...')} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.SearchDrops', 'Search drop rules')} />
          </label>
          <button type="button" class="manager-button" onclick={onAddDrop}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.AddDrop', 'Add drop rule')}</span>
          </button>
        </div>
      </div>

      <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropRulesTable', 'Drop rules table')}>
        {#if dropRows.length === 0}
          <div class="manager-empty">
            <div>
              <i class="fas fa-gift" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.NoDrops', 'No drops have been added.')}</h3>
              <button type="button" class="manager-button is-primary" onclick={onAddDrop}>{text('FABRICATE.Admin.Manager.Environment.Tasks.AddDrop', 'Add drop rule')}</button>
            </div>
          </div>
        {:else if filteredRows.length === 0}
          <div class="manager-empty">
            <div>
              <i class="fas fa-search" aria-hidden="true"></i>
              <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.EmptyDropSearchTitle', 'No drop rules match this search')}</h3>
            </div>
          </div>
        {:else}
          <div class={`manager-gathering-task-drops-table${rankedMode ? ' is-ranked-mode' : ''}`} role="table" data-gathering-task-drops-table>
            <div class="manager-table-head manager-gathering-task-drop-table-head" role="row">
              {#if rankedMode}
                <span role="columnheader" class="manager-drop-rank-header" aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropRank', 'Drop rank')}>#</span>
              {/if}
              <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Tasks.DropComponent', 'Component')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Tasks.DropQuantityColumn', 'Count')}</span>
              <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Tasks.Modifiers', 'Modifiers')}</span>
            </div>
            {#each paginatedRows as row (row.id)}
              {@const rankIndex = dropRows.indexOf(row)}
              <div
                class={`manager-gathering-task-drop-row ${selectedDrop?.id === row.id ? 'is-selected' : ''}`}
                role="row"
                data-gathering-task-drop-id={row.id}
                data-gathering-task-drop-zone={row.id}
                aria-selected={selectedDrop?.id === row.id}
                tabindex="0"
                use:dragDrop={{ onDrop: (data) => handleDropZoneDrop(row.id, data), activeClass: 'is-drop-active' }}
                onclick={() => onSelectDrop(row.id)}
                onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectDrop(row.id); } }}
              >
                {#if rankedMode}
                  <span role="cell" class="manager-drop-cell manager-drop-rank-cell" data-gathering-task-drop-rank-cell>
                    <button
                      type="button"
                      class="manager-icon-button manager-drop-rank-button"
                      aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropUp', 'Move drop up')}
                      title={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropUp', 'Move drop up')}
                      disabled={rankIndex <= 0}
                      data-gathering-task-drop-move="up"
                      onclick={(event) => { event.stopPropagation(); onMoveDrop(row.id, 'up'); }}
                      onkeydown={(event) => event.stopPropagation()}
                    >
                      <i class="fas fa-chevron-up" aria-hidden="true"></i>
                    </button>
                    <span class="manager-drop-rank-value" data-gathering-task-drop-rank>#{rankIndex + 1}</span>
                    <button
                      type="button"
                      class="manager-icon-button manager-drop-rank-button"
                      aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropDown', 'Move drop down')}
                      title={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropDown', 'Move drop down')}
                      disabled={rankIndex < 0 || rankIndex >= dropRows.length - 1}
                      data-gathering-task-drop-move="down"
                      onclick={(event) => { event.stopPropagation(); onMoveDrop(row.id, 'down'); }}
                      onkeydown={(event) => event.stopPropagation()}
                    >
                      <i class="fas fa-chevron-down" aria-hidden="true"></i>
                    </button>
                  </span>
                {/if}
                <span role="cell" class="manager-drop-cell manager-drop-component-cell" data-gathering-task-drop-component-cell>
                  {#if row.componentId || row.itemUuid}
                    <button type="button" class="manager-gathering-task-identity manager-drop-component-button" title={text('FABRICATE.Admin.Manager.Environment.Tasks.ClearDropComponentHint', 'Right-click to clear component')} onclick={(event) => { event.stopPropagation(); onSelectDrop(row.id); }} onkeydown={(event) => event.stopPropagation()} onmousedown={(event) => onDropComponentMouseDown(row.id, event)} oncontextmenu={(event) => onClearDropComponent(row.id, event)}>
                      <img class="manager-gathering-task-thumb" src={componentImage(row)} alt="" />
                      <span class="manager-system-copy">
                        <span class="manager-system-name">{componentLabel(row)}</span>
                      </span>
                    </button>
                  {:else}
                    <div class="manager-gathering-task-identity manager-drop-empty-component is-empty">
                      <span
                        class="manager-inline-drop-zone"
                        data-gathering-task-drop-zone={row.id}
                        data-gathering-task-inline-drop-zone={row.id}
                      >
                        <i class="fas fa-file-import" aria-hidden="true"></i>
                      </span>
                      <span class="manager-system-copy">
                        <span class="manager-system-name">{text('FABRICATE.Admin.Manager.Environment.Tasks.NoComponent', 'No Component')}</span>
                        <span class="manager-system-description">{text('FABRICATE.Admin.Manager.Environment.Tasks.CreateOrAssign', 'Create or assign')}</span>
                      </span>
                    </div>
                  {/if}
                </span>
                <span role="cell" class="manager-drop-cell manager-drop-rate-cell" data-gathering-task-drop-chance-cell>
                  <span class="manager-drop-rate-value">
                    <span class="manager-drop-rate-percent">
                      <input type="text" inputmode="numeric" pattern="[0-9]*" value={dropRateValue(row)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent', 'Drop chance percent')} oninput={(event) => onDropRateInput(row.id, event)} onblur={(event) => onDropRateBlur(row, event)} onclick={(event) => event.stopPropagation()} onkeydown={(event) => onDropRateKeydown(row, event)} />
                      <span aria-hidden="true">%</span>
                    </span>
                    <span class={`manager-drop-rate-control ${dropRateTierClass(row.dropRate)}`} style={`--fab-drop-rate-value: ${dropRateValue(row)}%; --fab-drop-rate-color: ${dropRateTierColor(row.dropRate)};`}>
                      <span class="manager-drop-rate-track" aria-hidden="true">
                        <span class="manager-drop-rate-fill"></span>
                      </span>
                      <input type="range" min="0" max="100" step="1" value={dropRateValue(row)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')} oninput={(event) => onUpdateDrop(row.id, { dropRate: Number(event.currentTarget.value) })} onclick={(event) => event.stopPropagation()} onkeydown={(event) => event.stopPropagation()} />
                    </span>
                  </span>
                </span>
                <span role="cell" class="manager-drop-cell manager-drop-quantity-cell">
                  <input type="text" inputmode="numeric" pattern={'[1-9][0-9]{0,2}'} value={quantityValue(row)} aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.Quantity', 'Quantity')} oninput={(event) => onQuantityInput(row.id, event)} onblur={(event) => onQuantityBlur(row, event)} onclick={(event) => event.stopPropagation()} onkeydown={(event) => onQuantityKeydown(row, event)} />
                </span>
                <span role="cell" class="manager-drop-cell manager-chip-row">
                  <span class="manager-drop-modifier-list">
                    {#if modifierEntries(row).length > 0}
                      {#each modifierEntries(row) as modifier (modifier.id)}
                        <span class={`manager-chip manager-drop-modifier-pill ${modifierClass(modifier)}`}>
                          <i class={modifierIcon(modifier)} aria-hidden="true"></i>
                          <span>{modifierLabel(modifier)}</span>
                          {#if modifier.kind !== 'character'}
                            <strong>{modifierValueLabel(modifier)}</strong>
                          {/if}
                        </span>
                      {/each}
                    {:else}
                      <span class="manager-chip is-neutral">{text('FABRICATE.Admin.Manager.Environment.Tasks.NoModifiers', 'Not specified')}</span>
                    {/if}
                  </span>
                </span>
              </div>
            {/each}
          </div>
        {/if}
      </section>

      <div class="manager-task-drop-footer">
        <span class="manager-muted manager-drop-count" data-gathering-task-drop-count>{text('FABRICATE.Admin.Manager.Environment.Tasks.ShowingDrops', 'Showing {start}-{end} of {total} drops').replace('{start}', showingStart).replace('{end}', showingEnd).replace('{total}', filteredRows.length)}</span>
        <Pagination
          totalCount={filteredRows.length}
          {pageSize}
          {pageIndex}
          onPageChange={(next) => pageIndex = next}
          onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
        />
      </div>
    </section>

    <section class="manager-warning-band is-formula">
      <i class="fas fa-calculator" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DropCalculationHelp', 'Final drop chance = base chance + matching drop-level time/weather modifiers. Gathering modifiers affect the d100 roll.')}</span>
    </section>
  {:else}
    <div class="manager-empty">
      <div>
        <i class="fas fa-list-check" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Environment.Tasks.SelectTask', 'Select a gathering task')}</h3>
      </div>
    </div>
  {/if}
</main>
