<!-- Svelte 5 runes mode -->
<script>
  import { anchoredPopover, hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { dragDrop } from '../actions/dragDrop.js';
  import { localize } from '../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { MANAGER_SCROLLER_SELECTOR } from '../util/overlayBounds.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  let {
    value = null,
    items = [],
    disabled = false,
    // The clipping boundary the popover is clamped inside — see `IconPicker`, which takes the
    // same prop for the same reason: the selector is a value, not a shared component's business.
    bounds = MANAGER_SCROLLER_SELECTOR,
    onDrop = () => {},
    onSelect = () => {},
    onClear = () => {},
  } = $props();

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  let selectorRoot = $state(null);
  let triggerButton = $state(null);
  let popoverRoot = $state(null);
  let searchInput = $state(null);

  const filteredItems = $derived.by(() => {
    const query = String(searchTerm || '')
      .trim()
      .toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      String(item?.name || '')
        .toLowerCase()
        .includes(query)
    );
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

  $effect(() => {
    if (!pickerOpen || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });
</script>

<!-- `fabricate-source-picker` / `fabricate-source-picker-popover` are this primitive's own NAMESPACE
     roots (issue 1470): one on the element it owns, one on the panel it portals out of it. See
     `IconPicker` for the reasoning; the two components share every rule in the sheet. -->
<div
  bind:this={selectorRoot}
  class="fabricate-source-picker essence-source-selector"
  use:dismissOnOutsideClick={{
    enabled: pickerOpen,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot],
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
      {disabled}
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
      class="fabricate-source-picker-popover essence-source-picker-popover"
      role="dialog"
      aria-label={localize('FABRICATE.Admin.Features.Essences.SourcePickerLabel')}
      use:anchoredPopover={{
        component: 'EssenceSourceSelector',
        trigger: triggerButton,
        layout: popoverLayout,
        layoutOptions: () => ({ horizontalAlign: 'left', minWidth: 280, maxWidth: 420 }),
        bounds,
      }}
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
