<!--
  One d100 drop rule row (issue 1522): its rank stepper under ranked rewards, its component cell and
  drop zone, its chance slider, count and modifier chips. A component drop assigns and selects the
  row; any other drop goes to `onImportDrop(rowId, data)`. Row writes go through
  `onUpdateDrop(rowId, patch)`.
-->
<script>
  import Chip from '../../../components/Chip.svelte';
  import ChanceSlider from '../../../components/ChanceSlider.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import { dragDrop } from '../../../actions/dragDrop.js';
  import { dropRateTierClass, dropRateTierColor } from '../../../util/dropRateTier.js';
  import {
    conditionIcon,
    conditionId,
    conditionLabel,
    managedItemFor,
  } from './taskEditorLookups.js';

  let {
    text,
    row,
    rankIndex,
    rowCount,
    rankedMode = false,
    selected = false,
    managedItemOptions = [],
    weatherOptions = [],
    timeOfDayOptions = [],
    biomeOptions = [],
    characterModifierLibrary = [],
    onSelectDrop = () => {},
    onUpdateDrop = () => {},
    onMoveDrop = () => {},
    onImportDrop = () => {},
  } = $props();

  const maxVisibleModifiers = 4;
  const assigned = $derived(Boolean(row.componentId || row.itemUuid));

  function componentLabel() {
    const item = managedItemFor(managedItemOptions, row?.componentId);
    return (
      row?.name ||
      item?.name ||
      row?.itemUuid ||
      text('FABRICATE.Admin.Manager.Environment.Tasks.UnresolvedDrop', 'Unresolved drop')
    );
  }

  function componentImage() {
    return managedItemFor(managedItemOptions, row?.componentId)?.img || 'icons/svg/item-bag.svg';
  }

  function characterModifierLibraryEntry(modifierId) {
    if (!modifierId) return null;
    return (characterModifierLibrary || []).find((entry) => entry.id === modifierId) || null;
  }

  function modifierEntries() {
    const modifiers = row?.conditionModifiers || {};
    const characterRefs = Array.isArray(row?.characterModifiers) ? row.characterModifiers : [];
    return [
      ...(Array.isArray(modifiers.biome)
        ? modifiers.biome.map((entry) => ({ ...entry, kind: 'biome' }))
        : []),
      ...(Array.isArray(modifiers.timeOfDay)
        ? modifiers.timeOfDay.map((entry) => ({ ...entry, kind: 'timeOfDay' }))
        : []),
      ...(Array.isArray(modifiers.weather)
        ? modifiers.weather.map((entry) => ({ ...entry, kind: 'weather' }))
        : []),
      ...characterRefs.map((ref) => ({ ...ref, kind: 'character' })),
    ];
  }

  function modifierConditionOptions(kind) {
    if (kind === 'weather') return weatherOptions;
    if (kind === 'biome') return biomeOptions;
    return timeOfDayOptions;
  }

  // Past the cap the row redirects to the selected rule's inspector.
  function hasModifierOverflow() {
    return modifierEntries().length >= maxVisibleModifiers + 1;
  }

  function visibleModifierEntries() {
    return hasModifierOverflow() ? [] : modifierEntries();
  }

  function modifierLabel(entry) {
    if (entry.kind === 'character') {
      const libraryEntry = characterModifierLibraryEntry(entry.modifierId);
      return (
        libraryEntry?.label ||
        libraryEntry?.id ||
        entry.modifierId ||
        text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.UnknownModifierShort', 'Unknown')
      );
    }
    const options = modifierConditionOptions(entry.kind);
    return (
      conditionLabel((options || []).find((option) => conditionId(option) === entry.conditionId)) ||
      entry.conditionId
    );
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
    const option = (options || []).find((option) => conditionId(option) === entry.conditionId);
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

  // A `Chip` tone name (issue 883); the pill keeps its own colours, this only picks the state.
  function modifierTone(entry) {
    if (entry && entry.kind === 'character') {
      return entry.operator === '-' ? 'negative' : 'positive';
    }
    if (
      entry &&
      (entry.kind === 'weather' || entry.kind === 'timeOfDay' || entry.kind === 'biome')
    ) {
      const magnitude = Math.abs(Math.trunc(Number(entry.value || 0)));
      if (magnitude === 0) return 'neutral';
      return modifierEffectiveOperator(entry) === '-' ? 'negative' : 'positive';
    }
    const number = Number((entry && typeof entry === 'object' ? entry.value : entry) || 0);
    if (number < 0) return 'negative';
    if (number > 0) return 'positive';
    return 'neutral';
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

  function quantityValue() {
    return normalizeQuantity(row?.quantity ?? 1);
  }

  function onQuantityInput(event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '')
      .replace(/\D+/g, '')
      .replace(/^0+/, '');
    input.value = normalized;
    const quantity = Number(normalized);
    if (Number.isInteger(quantity) && quantity >= 1 && quantity <= 999)
      onUpdateDrop(row.id, { quantity });
  }

  function onQuantityBlur(event) {
    const input = event.currentTarget;
    const normalized = String(input.value || '')
      .replace(/\D+/g, '')
      .replace(/^0+/, '');
    const quantity = Number(normalized);
    if (normalized !== '' && Number.isInteger(quantity) && quantity >= 1 && quantity <= 999) {
      input.value = String(quantity);
      onUpdateDrop(row.id, { quantity });
      return;
    }
    input.value = String(quantityValue());
  }

  function onQuantityKeydown(event) {
    event.stopPropagation();
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentValue =
      event.currentTarget.value === '' ? quantityValue() : Number(event.currentTarget.value);
    const quantity = normalizeQuantity(
      (Number.isFinite(currentValue) ? currentValue : quantityValue()) +
        (event.key === 'ArrowUp' ? 1 : -1)
    );
    event.currentTarget.value = String(quantity);
    onUpdateDrop(row.id, { quantity });
  }

  function onClearDropComponent(event) {
    event.preventDefault();
    event.stopPropagation();
    onUpdateDrop(row.id, { componentId: '', systemItemId: '', itemUuid: '', name: '' });
  }

  function onDropComponentMouseDown(event) {
    if (event.button !== 2) return;
    onClearDropComponent(event);
  }

  function handleDropZoneDrop(data) {
    if (data?.type === 'FabricateManagedComponent' && data.componentId) {
      onUpdateDrop(row.id, {
        componentId: data.componentId,
        itemUuid: '',
        systemItemId: '',
        name: '',
        enabled: true,
      });
      onSelectDrop(row.id);
      return;
    }
    onImportDrop(row.id, data);
  }
</script>

<!-- The row's `onclick` is a pointer convenience (issue 1512): the keyboard path is the component
     cell's real `<button>`, and `aria-selected` here is the single carrier. A focusable
     `role="row"` is invisible to Foundry's `KeyboardManager#hasFocus`, so the arrows panned. -->
<!-- svelte-ignore a11y_interactive_supports_focus -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class={`manager-gathering-task-drop-row ${selected ? 'is-selected' : ''}`}
  role="row"
  data-gathering-task-drop-id={row.id}
  data-gathering-task-drop-zone={row.id}
  aria-selected={selected}
  use:dragDrop={{
    onDrop: (data) => handleDropZoneDrop(data),
    activeClass: 'is-drop-active',
  }}
  onclick={() => onSelectDrop(row.id)}
>
  {#if rankedMode}
    <span
      role="cell"
      class="manager-drop-cell manager-drop-rank-cell"
      data-gathering-task-drop-rank-cell
    >
      <IconButton
        class="manager-drop-rank-button"
        ariaLabel={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropUp', 'Move drop up')}
        title={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropUp', 'Move drop up')}
        disabled={rankIndex <= 0}
        data-gathering-task-drop-move="up"
        onclick={(event) => {
          event.stopPropagation();
          onMoveDrop(row.id, 'up');
        }}
        onkeydown={(event) => event.stopPropagation()}
      >
        <i class="fas fa-chevron-up" aria-hidden="true"></i>
      </IconButton>
      <span class="manager-drop-rank-value" data-gathering-task-drop-rank>#{rankIndex + 1}</span>
      <IconButton
        class="manager-drop-rank-button"
        ariaLabel={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropDown', 'Move drop down')}
        title={text('FABRICATE.Admin.Manager.Environment.Tasks.MoveDropDown', 'Move drop down')}
        disabled={rankIndex < 0 || rankIndex >= rowCount - 1}
        data-gathering-task-drop-move="down"
        onclick={(event) => {
          event.stopPropagation();
          onMoveDrop(row.id, 'down');
        }}
        onkeydown={(event) => event.stopPropagation()}
      >
        <i class="fas fa-chevron-down" aria-hidden="true"></i>
      </IconButton>
    </span>
  {/if}
  <span
    role="cell"
    class="manager-drop-cell manager-drop-component-cell"
    data-gathering-task-drop-component-cell
  >
    <!-- The row's keyboard path in both branches (issue 1512): a new row is born empty, and a
         `<div>` there would leave it keyboard-unselectable. The empty branch clears nothing. -->
    <button
      type="button"
      class={`manager-gathering-task-identity ${
        assigned ? 'manager-drop-component-button' : 'manager-drop-empty-component is-empty'
      }`}
      data-keyboard-focus="true"
      aria-label={assigned
        ? componentLabel()
        : text('FABRICATE.Admin.Manager.Environment.Tasks.CreateOrAssign', 'Create or assign')}
      title={assigned
        ? text(
            'FABRICATE.Admin.Manager.Environment.Tasks.ClearDropComponentHint',
            'Right-click to clear component'
          )
        : undefined}
      onclick={(event) => {
        event.stopPropagation();
        onSelectDrop(row.id);
      }}
      onkeydown={(event) => event.stopPropagation()}
      onmousedown={assigned ? onDropComponentMouseDown : undefined}
      oncontextmenu={assigned ? onClearDropComponent : undefined}
    >
      {#if assigned}
        <img class="manager-gathering-task-thumb" src={componentImage()} alt="" />
        <span class="manager-system-copy">
          <span class="manager-system-name">{componentLabel()}</span>
        </span>
      {:else}
        <span
          class="manager-inline-drop-zone"
          data-gathering-task-drop-zone={row.id}
          data-gathering-task-inline-drop-zone={row.id}
        >
          <i class="fas fa-file-import" aria-hidden="true"></i>
        </span>
        <span class="manager-system-copy">
          <span class="manager-system-name"
            >{text('FABRICATE.Admin.Manager.Environment.Tasks.NoComponent', 'No Component')}</span
          >
          <span class="manager-system-description"
            >{text(
              'FABRICATE.Admin.Manager.Environment.Tasks.CreateOrAssign',
              'Create or assign'
            )}</span
          >
        </span>
      {/if}
    </button>
  </span>
  <span
    role="cell"
    class="manager-drop-cell manager-drop-rate-cell"
    data-gathering-task-drop-chance-cell
  >
    <ChanceSlider
      value={normalizeDropRate(row?.dropRate ?? 1)}
      numberLabel={text(
        'FABRICATE.Admin.Manager.Environment.Tasks.DropChancePercent',
        'Drop chance percent'
      )}
      rangeLabel={text('FABRICATE.Admin.Manager.Environment.Tasks.DropChance', 'Drop chance')}
      resolveColor={dropRateTierColor}
      controlClass={dropRateTierClass(row.dropRate)}
      stopPropagation={true}
      onChange={(dropRate) => onUpdateDrop(row.id, { dropRate })}
    />
  </span>
  <span role="cell" class="manager-drop-cell manager-drop-quantity-cell">
    <input
      type="text"
      inputmode="numeric"
      pattern={'[1-9][0-9]{0,2}'}
      value={quantityValue()}
      aria-label={text('FABRICATE.Admin.Manager.Environment.Tasks.Quantity', 'Quantity')}
      oninput={onQuantityInput}
      onblur={onQuantityBlur}
      onclick={(event) => event.stopPropagation()}
      onkeydown={onQuantityKeydown}
    />
  </span>
  <span role="cell" class="manager-drop-cell manager-chip-row">
    <span class="manager-drop-modifier-list">
      {#if hasModifierOverflow()}
        <Chip tone="neutral" class="manager-drop-modifier-overflow"
          >{text(
            'FABRICATE.Admin.Manager.Environment.Tasks.DropModifierOverflowHint',
            'See selected rule for modifiers'
          )}</Chip
        >
      {:else if visibleModifierEntries().length > 0}
        {#each visibleModifierEntries() as modifier (modifier.id)}
          <Chip
            tone={modifierTone(modifier)}
            icon={modifierIcon(modifier)}
            class="manager-drop-modifier-pill"
          >
            <span>{modifierLabel(modifier)}</span>
            {#if modifier.kind !== 'character'}
              <strong>{modifierValueLabel(modifier)}</strong>
            {/if}
          </Chip>
        {/each}
      {:else}
        <Chip tone="neutral"
          >{text('FABRICATE.Admin.Manager.Environment.Tasks.NoModifiers', 'Not specified')}</Chip
        >
      {/if}
    </span>
  </span>
</div>
