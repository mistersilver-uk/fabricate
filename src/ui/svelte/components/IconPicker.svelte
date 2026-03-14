<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { portal } from '../actions/portal.js';
  import { localize } from '../util/foundryBridge.js';
  import {
    DEFAULT_ESSENCE_ICON,
    getEssenceIconOptions,
    filterEssenceIconOptions,
    getEssenceIconOption,
    normalizeEssenceIcon
  } from '../util/essenceIcons.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';

  let {
    value = DEFAULT_ESSENCE_ICON,
    disabled = false,
    buttonTitle = '',
    iconOnly = false,
    onChange = () => {}
  } = $props();

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let searchInput = $state(null);
  let popoverStyle = $state('');

  const iconOptions = getEssenceIconOptions();
  const selectedIconClass = $derived(normalizeEssenceIcon(value));
  const selectedOption = $derived(getEssenceIconOption(selectedIconClass, iconOptions));
  const filteredOptions = $derived(filterEssenceIconOptions(iconOptions, searchTerm));

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

  function getPopoverHost() {
    if (!pickerRoot || typeof document === 'undefined') return null;

    return pickerRoot.closest('.fabricate-admin');
  }

  function getPopoverHorizontalBounds(hostRect) {
    if (!pickerRoot) return {};

    const mainPanel = pickerRoot.closest('.admin-main');
    const mainPanelRect = mainPanel?.getBoundingClientRect?.();
    if (!mainPanelRect) return {};

    return {
      minLeft: mainPanelRect.left - hostRect.left + 16,
      maxRight: mainPanelRect.right - hostRect.left - 16
    };
  }

  function updatePopoverPosition() {
    if (!pickerOpen || !triggerButton || typeof window === 'undefined') return;

    const popoverHost = getPopoverHost();
    const hostRect = popoverHost?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const triggerRect = triggerButton.getBoundingClientRect();
    const horizontalBounds = getPopoverHorizontalBounds(hostRect);

    const layout = computeIconPickerPopoverLayout(
      {
        left: triggerRect.left - hostRect.left,
        right: triggerRect.right - hostRect.left,
        top: triggerRect.top - hostRect.top,
        bottom: triggerRect.bottom - hostRect.top,
        width: triggerRect.width,
        height: triggerRect.height
      },
      { width: hostRect.width || window.innerWidth, height: hostRect.height || window.innerHeight },
      {
        horizontalAlign: iconOnly ? 'left' : 'right',
        minLeft: horizontalBounds.minLeft,
        maxRight: horizontalBounds.maxRight
      }
    );

    if (!layout) {
      popoverStyle = '';
      return;
    }

    const verticalPosition = layout.placement === 'top'
      ? `top: auto; bottom: ${layout.bottom}px;`
      : `top: ${layout.top}px; bottom: auto;`;

    popoverStyle = [
      `left: ${layout.left}px;`,
      'right: auto;',
      `width: ${layout.width}px;`,
      `max-height: ${layout.maxHeight}px;`,
      verticalPosition
    ].join(' ');
  }

  $effect(() => {
    if (!pickerOpen || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });

  $effect(() => {
    if (!pickerOpen || typeof window === 'undefined' || typeof document === 'undefined') {
      popoverStyle = '';
      return;
    }

    updatePopoverPosition();

    const handleViewportChange = () => updatePopoverPosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<div
  bind:this={pickerRoot}
  class="essence-icon-picker"
  use:dismissOnOutsideClick={{
    enabled: pickerOpen,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot]
  }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class="essence-icon-picker-trigger"
    class:icon-only={iconOnly}
    onclick={togglePicker}
    disabled={disabled}
    aria-expanded={pickerOpen}
    aria-haspopup="dialog"
    aria-label={buttonTitle || localize('FABRICATE.Admin.Features.Essences.ChooseIcon')}
    title={buttonTitle || localize('FABRICATE.Admin.Features.Essences.ChooseIcon')}
  >
    <span class="essence-icon-picker-preview" aria-hidden="true">
      <i class={selectedOption.iconClass}></i>
    </span>
    {#if !iconOnly}
      <span class="essence-icon-picker-trigger-label">{selectedOption.label}</span>
    {/if}
    <span class="essence-icon-picker-trigger-caret" aria-hidden="true">
      <i class={`fas ${pickerOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
    </span>
  </button>

  {#if pickerOpen}
    <div
      bind:this={popoverRoot}
      class="essence-icon-picker-popover"
      style={popoverStyle}
      role="dialog"
      aria-label={localize('FABRICATE.Admin.Features.Essences.IconDialogLabel')}
      use:portal={() => getPopoverHost()}
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
            title={`${option.label} (${option.variant})`}
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
