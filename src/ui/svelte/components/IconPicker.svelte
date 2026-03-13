<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { localize } from '../util/foundryBridge.js';
  import {
    DEFAULT_ESSENCE_ICON,
    filterEssenceIconOptions,
    getEssenceIconOption,
    normalizeEssenceIcon
  } from '../util/essenceIcons.js';

  let {
    value = DEFAULT_ESSENCE_ICON,
    disabled = false,
    buttonTitle = '',
    onChange = () => {}
  } = $props();

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  let searchInput = $state(null);

  const selectedIconClass = $derived(normalizeEssenceIcon(value));
  const selectedOption = $derived(getEssenceIconOption(selectedIconClass));
  const filteredOptions = $derived(filterEssenceIconOptions(searchTerm));

  function closePicker() {
    pickerOpen = false;
    searchTerm = '';
  }

  function togglePicker() {
    if (disabled) return;
    if (pickerOpen) {
      closePicker();
      return;
    }

    pickerOpen = true;
  }

  function selectIcon(iconClass) {
    onChange(normalizeEssenceIcon(iconClass));
    closePicker();
  }

  $effect(() => {
    if (!pickerOpen || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });
</script>

<div
  class="essence-icon-picker"
  use:dismissOnOutsideClick={{ enabled: pickerOpen, onDismiss: closePicker }}
>
  <button
    type="button"
    class="essence-icon-picker-trigger"
    onclick={togglePicker}
    disabled={disabled}
    aria-expanded={pickerOpen}
    aria-haspopup="dialog"
    title={buttonTitle || localize('FABRICATE.Admin.Features.Essences.ChooseIcon')}
  >
    <span class="essence-icon-picker-preview" aria-hidden="true">
      <i class={selectedOption.iconClass}></i>
    </span>
    <span class="essence-icon-picker-trigger-label">{selectedOption.label}</span>
    <i class={`fas ${pickerOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} aria-hidden="true"></i>
  </button>

  {#if pickerOpen}
    <div
      class="essence-icon-picker-popover"
      role="dialog"
      aria-label={localize('FABRICATE.Admin.Features.Essences.IconDialogLabel')}
    >
      <div class="essence-icon-picker-search">
        <input
          bind:this={searchInput}
          bind:value={searchTerm}
          type="text"
          placeholder={localize('FABRICATE.Admin.Features.Essences.SearchIconPlaceholder')}
          aria-label={localize('FABRICATE.Admin.Features.Essences.SearchIconLabel')}
        />
      </div>

      <div
        class="essence-icon-picker-options"
        role="listbox"
        aria-label={localize('FABRICATE.Admin.Features.Essences.IconDialogLabel')}
      >
        {#each filteredOptions as option (option.iconClass)}
          <button
            type="button"
            class:selected={option.iconClass === selectedIconClass}
            class="essence-icon-picker-option"
            role="option"
            aria-selected={option.iconClass === selectedIconClass}
            title={option.label}
            onclick={() => selectIcon(option.iconClass)}
          >
            <span class="essence-icon-picker-preview" aria-hidden="true">
              <i class={option.iconClass}></i>
            </span>
            <span>{option.label}</span>
          </button>
        {:else}
          <p class="hint essence-icon-picker-empty">
            {localize('FABRICATE.Admin.Features.Essences.NoIconsFound')}
          </p>
        {/each}
      </div>
    </div>
  {/if}
</div>
