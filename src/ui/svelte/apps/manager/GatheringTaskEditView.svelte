<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import Pagination from '../../components/Pagination.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { dropRateTierClass, dropRateTierColor } from '../../util/dropRateTier.js';

  let {
    task = null,
    staminaEnabled = false,
    nodesEnabled = false,
    itemCards = [],
    managedItemOptions = [],
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    selectedDropId = '',
    rewardRules = null,
    characterModifierLibrary = [],
    libraryTools = [],
    environmentOptions = [],
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
  const maxVisibleModifiers = 4;

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
    return timeOfDayOptions;
  }

  function selectedConditionIds(kind) {
    let values;
    if (kind === 'weather') values = task?.weather;
    else if (kind === 'biomes') values = task?.biomes;
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
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AllTimesSelected', 'All times selected');
    }
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AddWeatherCondition', 'Add weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AddBiomeCondition', 'Add biome');
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
    return text('FABRICATE.Admin.Manager.Environment.Tasks.TimeOfDay', 'Time of day');
  }

  function emptyAvailabilityLabel(kind) {
    if (kind === 'weather') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyWeatherTitle', 'Any Weather');
    }
    if (kind === 'biomes') {
      return text('FABRICATE.Admin.Manager.Environment.Tasks.AnyBiomeTitle', 'Any Biome');
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

  // Stamina cost authoring (enforced only when the system has stamina enabled).
  const staminaCostValue = $derived(Number(task?.staminaCost ?? 0));
  const staminaCostModifiers = $derived(Array.isArray(task?.staminaCostModifiers) ? task.staminaCostModifiers : []);

  function updateStaminaCost(value) {
    const next = Number(value);
    onUpdateTask({ staminaCost: Number.isFinite(next) && next > 0 ? Math.floor(next) : 0 });
  }
  function addStaminaCostModifier() {
    const first = (characterModifierLibrary || [])[0];
    if (!first) return;
    onUpdateTask({
      staminaCostModifiers: [
        ...staminaCostModifiers,
        { id: `scm-${first.id}-${staminaCostModifiers.length + 1}`, modifierId: first.id, operator: '-', min: null, max: null, expressionOverride: '' }
      ]
    });
  }
  function updateStaminaCostModifier(index, patch) {
    onUpdateTask({ staminaCostModifiers: staminaCostModifiers.map((ref, i) => (i === index ? { ...ref, ...patch } : ref)) });
  }
  function removeStaminaCostModifier(index) {
    onUpdateTask({ staminaCostModifiers: staminaCostModifiers.filter((_, i) => i !== index) });
  }
  function numericFieldValue(value) {
    return value === null || value === undefined ? '' : value;
  }

  // Resource-node authoring (enforced only when the system has resource nodes enabled).
  const DEFAULT_NODES = { enabled: false, max: 0, current: 0, depletionTiming: 'onStart', respawn: { policy: 'manual', intervalUnit: 'hours', intervalAmount: 0, gainMode: 'guaranteed', chance: 0, amountExpression: '' } };
  const RESPAWN_UNITS = { minutes: 60, hours: 3600, days: 86400, weeks: 604800 };

  const nodes = $derived(task?.nodes || DEFAULT_NODES);
  const respawn = $derived(nodes.respawn || DEFAULT_NODES.respawn);
  const respawnIsOverTime = $derived(respawn.policy === 'overTime');
  const respawnGainMode = $derived(respawn.gainMode || 'guaranteed');
  const respawnIsChance = $derived(respawnIsOverTime && respawnGainMode === 'chance');
  const respawnIsExpression = $derived(respawnIsOverTime && respawnGainMode === 'expression');
  // The interval is authored as amount + unit; day/week lengths resolve against
  // the world calendar at runtime. A legacy draft may still carry raw seconds —
  // surface it as the largest whole unit that divides evenly.
  const intervalParts = $derived((() => {
    if (respawn.intervalUnit) return { value: Number(respawn.intervalAmount) || 0, unit: respawn.intervalUnit };
    const seconds = Number(respawn.intervalSeconds) || 0;
    for (const unit of ['weeks', 'days', 'hours', 'minutes']) {
      const size = RESPAWN_UNITS[unit];
      if (seconds > 0 && seconds % size === 0) return { value: seconds / size, unit };
    }
    return { value: seconds ? seconds / RESPAWN_UNITS.hours : 0, unit: 'hours' };
  })());

  function updateNodes(patch) {
    onUpdateTask({ nodes: { ...nodes, enabled: true, ...patch } });
  }
  function updateRespawn(patch) {
    updateNodes({ respawn: { ...respawn, ...patch } });
  }
  function setNodeCount(value) {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) { onUpdateTask({ nodes: null }); return; }
    const max = Math.floor(next);
    updateNodes({ max, current: max });
  }
  function setRespawnInterval(value, unit) {
    const next = Number(value);
    const intervalUnit = RESPAWN_UNITS[unit] ? unit : 'hours';
    // Persist amount + unit (calendar-aware at runtime); normalization drops any
    // legacy intervalSeconds now that a unit is present.
    updateRespawn({ intervalUnit, intervalAmount: Number.isFinite(next) && next > 0 ? Math.round(next) : 0 });
  }
  function setRespawnChance(percent) {
    const next = Number(percent);
    updateRespawn({ chance: Number.isFinite(next) ? Math.min(1, Math.max(0, next / 100)) : 0 });
  }
  function setRespawnPolicy(value) {
    // Switching to over-time always carries a gain mode so the draft is valid
    // even before normalization (defaults to the current/guaranteed mode).
    updateRespawn(value === 'overTime' ? { policy: 'overTime', gainMode: respawnGainMode } : { policy: value });
  }
  function setRespawnGainMode(value) {
    updateRespawn({ gainMode: value });
  }
  function setRespawnExpression(value) {
    updateRespawn({ amountExpression: String(value ?? '') });
  }

  // --- Depleted-behavior authoring (linked-marker canvas visual on depletion). -
  // Applies to a placed gathering-task interactable's linked Tile marker. The only
  // behavior is swap-image: while the environment's node for this task is depleted
  // the marker shows `swapImage`, and it flips back to the available image when the
  // node respawns. (A Tile marker has no nameplate, so the postfix mode is not
  // offered; there is no destructive delete behavior.)
  const depletedBehavior = $derived(nodes.depletedBehavior || {});
  const depletedSwapImage = $derived(typeof depletedBehavior.swapImage === 'string' ? depletedBehavior.swapImage : '');

  function updateDepletedBehavior(patch) {
    const next = { ...depletedBehavior, ...patch };
    const cleaned = {};
    if (typeof next.swapImage === 'string' && next.swapImage.trim()) {
      cleaned.swapImage = next.swapImage.trim();
    }
    updateNodes({ depletedBehavior: Object.keys(cleaned).length > 0 ? cleaned : null });
  }
  async function chooseDepletedImage() {
    if (typeof onPickImagePath !== 'function') return;
    const value = await onPickImagePath(depletedSwapImage || nodes.depletedBehavior?.swapImage || '');
    if (value) updateDepletedBehavior({ swapImage: value });
  }
  function clearDepletedImage() {
    updateDepletedBehavior({ swapImage: '' });
  }
  function onDepletedImageContextMenu(event) {
    // Right-click on the thumbnail clears the chosen depleted image (the visible
    // "Remove image" button below covers keyboard users).
    event.preventDefault();
    event.stopPropagation();
    if (depletedSwapImage) clearDepletedImage();
  }

  function setDefaultEnvironment(value) {
    const id = String(value ?? '').trim();
    onUpdateTask({ defaultEnvironmentId: id || null });
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

  // Cap the number of modifier chips a drop row shows; beyond that, redirect to the selected
  // rule's inspector. (Up to the cap, the chips still scroll if long names overflow the cell.)
  function hasModifierOverflow(row) {
    return modifierEntries(row).length >= maxVisibleModifiers + 1;
  }

  function visibleModifierEntries(row) {
    return hasModifierOverflow(row) ? [] : modifierEntries(row);
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
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Environment.Tasks.DefaultEnvironment', 'Default environment (canvas drop)')}</span>
            <select
              data-gathering-task-field="defaultEnvironmentId"
              value={task.defaultEnvironmentId || ''}
              onchange={(event) => setDefaultEnvironment(event.currentTarget.value)}
            >
              <option value="">{text('FABRICATE.Admin.Manager.Environment.Tasks.DefaultEnvironmentNone', 'None (ask on drop)')}</option>
              {#each environmentOptions as environment (environment.id)}
                <option value={environment.id}>{environment.name}</option>
              {/each}
            </select>
            <span class="manager-muted">{text('FABRICATE.Admin.Manager.Environment.Tasks.DefaultEnvironmentHint', 'Used when a dropped node is not inside a tagged scene region. Hold Alt while dropping to always pick manually.')}</span>
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
        {#each ['biomes', 'timeOfDay', 'weather'] as kind (kind)}
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

    {#if staminaEnabled}
    <section class="manager-task-stamina-card" data-gathering-task-stamina>
      <div class="manager-task-card-header">
        <div class="manager-task-drop-header-copy">
          <h3>{text('FABRICATE.Admin.Manager.Economy.TaskStaminaTitle', 'Stamina cost')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.TaskStaminaHint', 'Stamina spent per attempt when this system has stamina enabled.')}</p>
        </div>
      </div>

      <div class="manager-task-stamina-row">
        <label class="manager-field manager-task-stamina-cost-field">
          <span>{text('FABRICATE.Admin.Manager.Economy.TaskStaminaCost', 'Cost per attempt')}</span>
          <input
            type="number" min="0" step="1"
            value={staminaCostValue > 0 ? staminaCostValue : ''}
            oninput={(event) => updateStaminaCost(event.currentTarget.value)}
            data-gathering-task-stamina-cost
          />
        </label>

        <div class="manager-field manager-task-stamina-modifiers">
          <span title={text('FABRICATE.Admin.Manager.Economy.TaskStaminaModifiersHint', 'Adjust the cost for an actor (e.g. a strong character mines for less).')}>{text('FABRICATE.Admin.Manager.Economy.TaskStaminaModifiers', 'Per-actor cost modifiers')}</span>
          <div class="manager-task-stamina-modifier-list">
            {#each staminaCostModifiers as ref, index (ref.id)}
              <div class="manager-task-stamina-modifier-row" data-gathering-stamina-modifier={ref.id}>
                <select value={ref.modifierId} onchange={(event) => updateStaminaCostModifier(index, { modifierId: event.currentTarget.value })} aria-label={text('FABRICATE.Admin.Manager.Economy.TaskStaminaModifiers', 'Per-actor cost modifiers')}>
                  {#each characterModifierLibrary as entry (entry.id)}
                    <option value={entry.id}>{entry.label || entry.id}</option>
                  {/each}
                </select>
                <select value={ref.operator} onchange={(event) => updateStaminaCostModifier(index, { operator: event.currentTarget.value })} aria-label="operator">
                  <option value="-">−</option>
                  <option value="+">+</option>
                </select>
                <input type="number" step="1" placeholder="min" value={numericFieldValue(ref.min)} oninput={(event) => updateStaminaCostModifier(index, { min: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} aria-label="min" />
                <input type="number" step="1" placeholder="max" value={numericFieldValue(ref.max)} oninput={(event) => updateStaminaCostModifier(index, { max: event.currentTarget.value === '' ? null : Number(event.currentTarget.value) })} aria-label="max" />
                <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Economy.RemoveModifier', 'Remove')} onclick={() => removeStaminaCostModifier(index)}><i class="fas fa-times" aria-hidden="true"></i></button>
              </div>
            {/each}
            <button type="button" class="manager-button manager-task-stamina-add" disabled={(characterModifierLibrary || []).length === 0} onclick={addStaminaCostModifier} data-gathering-add-stamina-modifier>
              <i class="fas fa-plus" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Economy.AddModifier', 'Add modifier')}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
    {/if}

    {#if nodesEnabled}
    <section class="manager-task-nodes-card" data-gathering-task-nodes>
      <div class="manager-task-card-header">
        <div class="manager-task-drop-header-copy">
          <h3>{text('FABRICATE.Admin.Manager.Economy.TaskNodesTitle', 'Resource node')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.TaskNodesHint', 'Finite nodes for this task, depleted as it is gathered and optionally respawning over world time.')}</p>
        </div>
      </div>

      <div class="manager-task-nodes-grid">
        <label class="manager-field">
          <span>{text('FABRICATE.Admin.Manager.Economy.TaskNodeCount', 'Node count')}</span>
          <input
            type="number" min="0" step="1" placeholder="—"
            value={nodes.max > 0 ? nodes.max : ''}
            oninput={(event) => setNodeCount(event.currentTarget.value)}
            data-gathering-task-node-count
          />
        </label>

        <label class="manager-field">
          <span>{text('FABRICATE.Admin.Manager.Economy.TaskNodeDeplete', 'Deplete')}</span>
          <select value={nodes.depletionTiming} onchange={(event) => updateNodes({ depletionTiming: event.currentTarget.value })} data-gathering-task-node-deplete>
            <option value="onStart">{text('FABRICATE.Admin.Manager.Economy.DepleteOnStart', 'On start')}</option>
            <option value="onSuccess">{text('FABRICATE.Admin.Manager.Economy.DepleteOnSuccess', 'On success')}</option>
          </select>
        </label>

        <label class="manager-field">
          <span>{text('FABRICATE.Admin.Manager.Economy.TaskNodeRespawn', 'Respawn')}</span>
          <select value={respawn.policy} onchange={(event) => setRespawnPolicy(event.currentTarget.value)} data-gathering-task-node-respawn>
            <option value="manual">{text('FABRICATE.Admin.Manager.Economy.RespawnManual', 'Manual')}</option>
            <option value="overTime">{text('FABRICATE.Admin.Manager.Economy.RespawnOverTime', 'Over world time')}</option>
          </select>
        </label>

        {#if respawnIsOverTime}
          <label class="manager-field manager-task-node-interval">
            <span>{text('FABRICATE.Admin.Manager.Economy.RespawnEvery', 'Every')}</span>
            <div class="manager-task-node-interval-row">
              <input
                type="number" min="0" step="1"
                value={intervalParts.value || ''}
                oninput={(event) => setRespawnInterval(event.currentTarget.value, intervalParts.unit)}
                data-gathering-task-node-interval
              />
              <select value={intervalParts.unit} onchange={(event) => setRespawnInterval(intervalParts.value, event.currentTarget.value)} data-gathering-task-node-interval-unit>
                <option value="minutes">{text('FABRICATE.Admin.Manager.Economy.Unit.minutes', 'minutes')}</option>
                <option value="hours">{text('FABRICATE.Admin.Manager.Economy.Unit.hours', 'hours')}</option>
                <option value="days">{text('FABRICATE.Admin.Manager.Economy.Unit.days', 'days')}</option>
                <option value="weeks">{text('FABRICATE.Admin.Manager.Economy.Unit.weeks', 'weeks')}</option>
              </select>
            </div>
          </label>

          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RespawnGainMode', 'Each interval')}</span>
            <select value={respawnGainMode} onchange={(event) => setRespawnGainMode(event.currentTarget.value)} data-gathering-task-node-gain-mode>
              <option value="guaranteed">{text('FABRICATE.Admin.Manager.Economy.GainGuaranteed', 'Add one node')}</option>
              <option value="chance">{text('FABRICATE.Admin.Manager.Economy.GainChance', 'Chance to add one')}</option>
              <option value="expression">{text('FABRICATE.Admin.Manager.Economy.GainExpression', 'Roll an amount')}</option>
            </select>
          </label>
        {/if}

        {#if respawnIsChance}
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RespawnChance', 'Chance')}</span>
            <div class="manager-task-node-chance-row">
              <input
                type="number" min="0" max="100" step="1"
                value={Math.round((Number(respawn.chance) || 0) * 100) || ''}
                oninput={(event) => setRespawnChance(event.currentTarget.value)}
                data-gathering-task-node-chance
              />
              <span class="manager-muted">%</span>
            </div>
          </label>
        {/if}

        {#if respawnIsExpression}
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Economy.RespawnAmount', 'Amount per interval')}</span>
            <input
              type="text"
              placeholder="1d4"
              value={respawn.amountExpression || ''}
              oninput={(event) => setRespawnExpression(event.currentTarget.value)}
              aria-describedby="gathering-task-node-amount-hint"
              data-gathering-task-node-amount
            />
            <span id="gathering-task-node-amount-hint" class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.RespawnAmountHint', 'Plain dice only (e.g. 1d4) — no character data.')}</span>
          </label>
        {/if}
      </div>

      <div class="manager-task-depleted-behavior" data-gathering-task-depleted-behavior>
        <div class="manager-task-depleted-row">
          <div class="manager-task-drop-header-copy manager-task-depleted-copy">
            <h4>{text('FABRICATE.Admin.Manager.Economy.DepletedBehaviorTitle', 'When depleted (linked marker)')}</h4>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Economy.DepletedBehaviorHint', 'How a placed interactable\'s linked marker looks once this node runs out. Restored automatically when it respawns.')}</p>
          </div>

          <div class="manager-task-depleted-image-column" data-gathering-task-depleted-image-column>
            <button
              type="button"
              class="manager-task-image-picker manager-task-depleted-image-picker"
              aria-label={text('FABRICATE.Admin.Manager.Economy.DepletedSwapImagePick', 'Choose depleted marker image')}
              onclick={chooseDepletedImage}
              oncontextmenu={onDepletedImageContextMenu}
              disabled={typeof onPickImagePath !== 'function'}
              data-gathering-task-depleted-image
            >
              {#if depletedSwapImage}
                <img src={depletedSwapImage} alt="" />
              {:else}
                <i class="fas fa-image" aria-hidden="true"></i>
              {/if}
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            {#if depletedSwapImage}
              <button
                type="button"
                class="manager-link-button manager-task-depleted-image-clear"
                aria-label={text('FABRICATE.Admin.Manager.Economy.DepletedSwapImageClear', 'Remove image')}
                onclick={clearDepletedImage}
                data-gathering-task-depleted-image-clear
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.Economy.DepletedSwapImageClear', 'Remove image')}</span>
              </button>
            {/if}
          </div>
        </div>
      </div>
    </section>
    {:else}
    <section class="manager-task-nodes-card manager-task-nodes-hint-card" data-gathering-task-nodes-hint>
      <div class="manager-task-card-header">
        <div class="manager-task-drop-header-copy">
          <h3>{text('FABRICATE.Admin.Manager.Economy.TaskNodesTitle', 'Resource node')}</h3>
        </div>
      </div>
      <p class="manager-muted manager-task-nodes-hint-text">
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Economy.TaskNodesEconomyHint', 'Canvas per-token depletion and depleted-token behavior are only available when this system has resource nodes enabled. Turn on the Resource nodes toggle in the system\'s Economy settings to author a resource node here.')}</span>
      </p>
    </section>
    {/if}

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
                    {#if hasModifierOverflow(row)}
                      <span class="manager-chip is-neutral manager-drop-modifier-overflow">{text('FABRICATE.Admin.Manager.Environment.Tasks.DropModifierOverflowHint', 'See selected rule for modifiers')}</span>
                    {:else if visibleModifierEntries(row).length > 0}
                      {#each visibleModifierEntries(row) as modifier (modifier.id)}
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

<style>
  /* Card chrome matching the other task-editor cards. */
  .manager-task-stamina-card,
  .manager-task-nodes-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding: 13px 16px;
    border: 1px solid var(--fab-mv2-border);
    border-radius: 8px;
    background: var(--fab-mv2-surface-2);
    box-shadow: inset 0 1px 0 var(--fab-overlay-light-06);
  }

  .manager-task-nodes-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--fab-space-3);
    align-items: end;
  }

  /* Guidance shown in the node area when the system does NOT have resource nodes enabled. */
  .manager-task-nodes-hint-text {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin: 0;
  }

  .manager-task-nodes-hint-text i {
    margin-top: 2px;
    flex: 0 0 auto;
  }

  .manager-task-node-interval-row,
  .manager-task-node-chance-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-task-node-interval-row input,
  .manager-task-node-chance-row input {
    min-width: 0;
  }

  /* Depleted-behavior authoring: a sub-block of the node card. */
  .manager-task-depleted-behavior {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-3);
    border-top: 1px solid var(--fab-mv2-border);
  }

  .manager-task-depleted-behavior h4 {
    margin: 0;
    font-size: var(--font-size-13, 0.8125rem);
  }

  /* Title/hint sit on the SAME row as the swap-image thumbnail (image alongside
     the heading + description, not stacked beneath it). */
  .manager-task-depleted-row {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-3);
  }

  .manager-task-depleted-copy {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* The image picker plus the "Remove image" button stack vertically: the clear
     control sits directly UNDERNEATH the thumbnail. */
  .manager-task-depleted-image-column {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-1);
  }

  .manager-task-depleted-image-picker {
    flex: 0 0 auto;
  }

  .manager-task-depleted-image-clear {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
  }

  /* Cost field sits beside the per-actor modifiers; captions align at the top so
     the cost input and the first modifier row land on the same line. Grids (not
     flex) so each control fills its track and the global input width:100% can't
     force them onto separate lines. */
  .manager-task-stamina-row {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: var(--fab-space-3);
    align-items: start;
  }

  .manager-task-stamina-cost-field {
    width: 100%;
  }

  .manager-task-stamina-cost-field > span {
    white-space: nowrap;
  }

  .manager-task-stamina-modifiers {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-task-stamina-modifier-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-task-stamina-modifier-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 56px 72px 72px auto;
    gap: var(--fab-space-2);
    align-items: center;
  }

  .manager-task-stamina-add {
    justify-self: start;
  }
</style>
