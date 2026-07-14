<!-- Svelte 5 runes mode -->
<!--
  Generic searchable popover used by the Travel tab (region-override picker and
  move-to-party picker). The popover is portaled to the `.fabricate-manager`
  host so it escapes the `overflow: hidden` manager panel, positioned with
  `computeIconPickerPopoverLayout`, and dismissed on outside click / Escape (the
  portaled popover is registered as an additional "inside" node so clicking
  within it does not dismiss).

  Props:
    options      — [{ id, label, icon?, trailing? }] (consumer builds the full
                   list, including any leading "special" option such as Auto)
    value        — id of the currently selected option (for aria-selected)
    triggerClass — class string for the trigger button (consumer-controlled)
    triggerIcon  — leading icon class on the trigger (optional)
    triggerImg   — leading portrait image src on the trigger (optional; mirrors
                   how list options render `option.img`), shown before the label
    triggerLabel — current-selection text on the trigger (omitted when empty)
    valueClass   — extra class on the trigger value span
    showChevron  — render the open/closed chevron on the trigger (default true)
    triggerAddMarker — optional value for a `data-recipe-add` attribute on the
                   trigger button (lets the recipe editor mark popover-backed add
                   controls without wrapping the button)
    triggerTitle — optional native `title` tooltip on the trigger button
                   (backward-compatible; omitted when empty)
    *AriaLabel / searchPlaceholder / emptyHint — localized strings
    onChoose(id) — called with the chosen option id
-->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';
  import { computeIconPickerPopoverLayout } from '../../util/iconPickerPopover.js';

  let {
    options = [],
    value = '',
    disabled = false,
    triggerClass = '',
    triggerIcon = '',
    triggerImg = '',
    triggerLabel = '',
    valueClass = '',
    showChevron = true,
    triggerAddMarker = '',
    triggerTitle = '',
    triggerAriaLabel = '',
    dialogAriaLabel = '',
    searchPlaceholder = '',
    searchAriaLabel = '',
    emptyHint = '',
    pickerClass = '',
    minWidth = 240,
    maxWidth = 340,
    onChoose = () => {}
  } = $props();

  let open = $state(false);
  let search = $state('');
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let searchInput = $state(null);
  let popoverStyle = $state('');

  const normalizedSearch = $derived(search.trim().toLowerCase());
  const filteredOptions = $derived(
    normalizedSearch
      ? options.filter(option => String(option.label || '').toLowerCase().includes(normalizedSearch))
      : options
  );

  function close() {
    open = false;
    search = '';
  }

  function toggle(event) {
    event.stopPropagation();
    if (disabled) return;
    open = !open;
    if (!open) search = '';
  }

  function choose(id) {
    onChoose(id);
    close();
  }

  function stop(event) {
    event.stopPropagation();
  }

  function getPopoverHost() {
    if (!pickerRoot || typeof document === 'undefined') return null;
    return pickerRoot.closest('.fabricate-manager');
  }

  function getHorizontalBounds(hostRect) {
    if (!pickerRoot) return {};
    const mainPanel = pickerRoot.closest('.admin-main, .manager-main, .manager-table-scroll');
    const rect = mainPanel?.getBoundingClientRect?.();
    if (!rect) return {};
    return { minLeft: rect.left - hostRect.left + 16, maxRight: rect.right - hostRect.left - 16 };
  }

  function updatePosition() {
    if (!open || !triggerButton || typeof window === 'undefined') return;
    const host = getPopoverHost();
    const hostRect = host?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const triggerRect = triggerButton.getBoundingClientRect();
    const bounds = getHorizontalBounds(hostRect);
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
      { horizontalAlign: 'left', minWidth, maxWidth, minLeft: bounds.minLeft, maxRight: bounds.maxRight }
    );
    if (!layout) {
      popoverStyle = '';
      return;
    }
    const vertical = layout.placement === 'top'
      ? `top: auto; bottom: ${layout.bottom}px;`
      : `top: ${layout.top}px; bottom: auto;`;
    popoverStyle = [`left: ${layout.left}px;`, 'right: auto;', `width: ${layout.width}px;`, `max-height: ${layout.maxHeight}px;`, vertical].join(' ');
  }

  $effect(() => {
    if (!open || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });

  $effect(() => {
    if (!open || typeof window === 'undefined' || typeof document === 'undefined') {
      popoverStyle = '';
      return;
    }
    updatePosition();
    if (typeof window.addEventListener !== 'function') return;
    const handleViewportChange = () => updatePosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);
    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<div
  class={`manager-travel-picker ${pickerClass}`}
  bind:this={pickerRoot}
  use:dismissOnOutsideClick={{ enabled: open, onDismiss: close, additionalNodes: () => [popoverRoot] }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class={triggerClass}
    aria-haspopup="dialog"
    aria-expanded={open}
    {disabled}
    data-recipe-add={triggerAddMarker || undefined}
    title={triggerTitle || undefined}
    aria-label={triggerAriaLabel || undefined}
    onclick={toggle}
    onkeydown={stop}
  >
    {#if triggerImg}<span class="manager-travel-portrait" aria-hidden="true"><img src={triggerImg} alt="" /></span>{:else if triggerIcon}<i class={triggerIcon} aria-hidden="true"></i>{/if}
    {#if triggerLabel}<span class={`manager-travel-picker-value ${valueClass}`}>{triggerLabel}</span>{/if}
    {#if showChevron}<i class={open ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"></i>{/if}
  </button>

  {#if open}
    <div
      bind:this={popoverRoot}
      class="manager-travel-popover"
      style={popoverStyle}
      role="dialog"
      tabindex="-1"
      aria-label={dialogAriaLabel || undefined}
      use:portal={() => getPopoverHost()}
      onclick={stop}
      onkeydown={(event) => { if (event.key === 'Escape') { stop(event); close(); } }}
    >
      <div class="manager-travel-popover-search">
        <input
          bind:this={searchInput}
          bind:value={search}
          type="text"
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel || undefined}
        />
      </div>
      <div class="manager-travel-popover-options" role="listbox" aria-label={dialogAriaLabel || undefined}>
        {#each filteredOptions as option (option.id)}
          <button
            type="button"
            class="manager-travel-option"
            role="option"
            aria-selected={option.id === value}
            title={option.label}
            onclick={() => choose(option.id)}
          >
            {#if option.img}
              <span class="manager-travel-portrait" aria-hidden="true"><img src={option.img} alt="" /></span>
            {:else if option.icon}
              <i class={option.icon} aria-hidden="true"></i>
            {/if}
            <span class="manager-travel-option-name">{option.label}</span>
            {#if option.trailing}<span class="manager-chip is-disabled">{option.trailing}</span>{/if}
          </button>
        {:else}
          <p class="manager-travel-empty-hint">{emptyHint}</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
