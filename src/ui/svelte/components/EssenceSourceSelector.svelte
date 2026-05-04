<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { dragDrop } from '../actions/dragDrop.js';
  import { portal } from '../actions/portal.js';
  import { localize } from '../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';

  let {
    value = null,
    items = [],
    disabled = false,
    onDrop = () => {},
    onSelect = () => {},
    onClear = () => {}
  } = $props();

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  let selectorRoot = $state(null);
  let triggerButton = $state(null);
  let popoverRoot = $state(null);
  let searchInput = $state(null);
  let popoverStyle = $state('');

  const filteredItems = $derived.by(() => {
    const query = String(searchTerm || '').trim().toLowerCase();
    if (!query) return items;
    return items.filter(item => String(item?.name || '').toLowerCase().includes(query));
  });

  const triggerLabel = $derived(
    value?.name
      ? `${localize('FABRICATE.Admin.Features.Essences.ChangeSourceItem')}: ${value.name}`
      : localize('FABRICATE.Admin.Features.Essences.DropOrPickSourceItem')
  );

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

  function selectItem(itemId) {
    onSelect?.(itemId);
    closePicker();
  }

  function clearItem(event) {
    event.preventDefault();
    event.stopPropagation();
    onClear?.();
  }

  function getPopoverHost() {
    if (!selectorRoot || typeof document === 'undefined') return null;
    return selectorRoot.closest('.fabricate-admin, .fabricate-manager-v2');
  }

  function getPopoverHorizontalBounds(hostRect) {
    if (!selectorRoot) return {};

    const mainPanel = selectorRoot.closest('.admin-main, .manager-v2-main, .manager-v2-table-scroll');
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
        horizontalAlign: 'left',
        minLeft: horizontalBounds.minLeft,
        maxRight: horizontalBounds.maxRight,
        minWidth: 280,
        maxWidth: 420
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
  bind:this={selectorRoot}
  class="essence-source-selector"
  use:dismissOnOutsideClick={{
    enabled: pickerOpen,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot]
  }}
>
  <div
    class="essence-source-selector-shell"
    use:dragDrop={{ onDrop, disabled, activeClass: 'drop-active' }}
  >
    <button
      type="button"
      bind:this={triggerButton}
      class="essence-source-trigger"
      class:has-value={!!value}
      onclick={togglePicker}
      disabled={disabled}
      aria-expanded={pickerOpen}
      aria-haspopup="dialog"
      aria-label={triggerLabel}
      title={triggerLabel}
    >
      {#if value}
        <img
          src={value.img || 'icons/svg/item-bag.svg'}
          alt=""
          class="essence-source-trigger-image"
        />
      {:else}
        <span class="essence-source-trigger-empty">
          <i class="fas fa-download" aria-hidden="true"></i>
          <span>{localize('FABRICATE.Admin.Features.Essences.DropOrPickSourceItem')}</span>
        </span>
      {/if}

      <span class="essence-source-trigger-corner" aria-hidden="true">
        <i class={`fas ${pickerOpen ? 'fa-chevron-up' : 'fa-search'}`}></i>
      </span>
    </button>

    {#if value && !disabled}
      <button
        type="button"
        class="essence-source-clear"
        onclick={clearItem}
        aria-label={localize('FABRICATE.Admin.Features.Essences.ClearSourceItem')}
        title={localize('FABRICATE.Admin.Features.Essences.ClearSourceItem')}
      >
        <i class="fas fa-times"></i>
      </button>
    {/if}
  </div>

  {#if pickerOpen}
    <div
      bind:this={popoverRoot}
      class="essence-source-picker-popover"
      style={popoverStyle}
      role="dialog"
      aria-label={localize('FABRICATE.Admin.Features.Essences.SourcePickerLabel')}
      use:portal={() => getPopoverHost()}
    >
      <div class="essence-source-picker-search">
        <input
          bind:this={searchInput}
          bind:value={searchTerm}
          type="text"
          placeholder={localize('FABRICATE.Admin.Features.Essences.SearchSourcePlaceholder')}
          aria-label={localize('FABRICATE.Admin.Features.Essences.SearchSourceLabel')}
        />
      </div>

      <div
        class="essence-source-picker-grid"
        role="listbox"
        aria-label={localize('FABRICATE.Admin.Features.Essences.SourcePickerLabel')}
      >
        {#each filteredItems as option (option.id)}
          <button
            type="button"
            class="essence-source-picker-option"
            class:selected={option.id === value?.id}
            role="option"
            aria-selected={option.id === value?.id}
            title={option.name}
            onclick={() => selectItem(option.id)}
          >
            <img src={option.img || 'icons/svg/item-bag.svg'} alt="" />
            <span>{option.name}</span>
          </button>
        {:else}
          <p class="hint essence-source-picker-empty">
            {localize(
              items.length > 0
                ? 'FABRICATE.Admin.Features.Essences.NoMatchingComponents'
                : 'FABRICATE.Admin.Features.Essences.NoComponentsAvailable'
            )}
          </p>
        {/each}
      </div>
    </div>
  {/if}
</div>
