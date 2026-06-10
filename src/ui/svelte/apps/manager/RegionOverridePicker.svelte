<!-- Svelte 5 runes mode -->
<!--
  Searchable region-override popover for a single party row on the Travel >
  Parties tab. Replaces a plain <select> so it scales to systems with many
  regions. Mirrors the IconPicker popover mechanics: the popover is portaled to
  the `.fabricate-manager` host so it escapes the `overflow: hidden` manager
  panel, positioned with `computeIconPickerPopoverLayout`, and dismissed on
  outside click / Escape (the portaled popover is registered as an additional
  "inside" node so clicking within it does not dismiss).
-->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';
  import { localize } from '../../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../../util/iconPickerPopover.js';

  let {
    value = '',
    regions = [],
    disabled = false,
    onChoose = () => {}
  } = $props();

  let open = $state(false);
  let search = $state('');
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let searchInput = $state(null);
  let popoverStyle = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearch = $derived(search.trim().toLowerCase());
  const filteredRegions = $derived(
    normalizedSearch
      ? regions.filter(region => String(region.name || '').toLowerCase().includes(normalizedSearch))
      : regions
  );
  const selectedName = $derived(
    value
      ? (regions.find(region => region.id === value)?.name
        || text('FABRICATE.Admin.Manager.Travel.Parties.OverrideStale', 'Unknown region'))
      : text('FABRICATE.Admin.Manager.Travel.Parties.OverrideAuto', 'Auto')
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

  function choose(regionId) {
    onChoose(regionId || null);
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
      { horizontalAlign: 'left', minWidth: 240, maxWidth: 340, minLeft: bounds.minLeft, maxRight: bounds.maxRight }
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
  class="manager-travel-picker manager-travel-parties-override"
  bind:this={pickerRoot}
  use:dismissOnOutsideClick={{ enabled: open, onDismiss: close, additionalNodes: () => [popoverRoot] }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class="manager-button manager-travel-picker-trigger manager-travel-parties-override-trigger"
    aria-haspopup="dialog"
    aria-expanded={open}
    {disabled}
    aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}
    onclick={toggle}
    onkeydown={stop}
  >
    <i class="fas fa-location-crosshairs" aria-hidden="true"></i>
    <span class="manager-travel-parties-override-value">{selectedName}</span>
    <i class={open ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"></i>
  </button>

  {#if open}
    <div
      bind:this={popoverRoot}
      class="manager-travel-popover manager-travel-parties-override-popover"
      style={popoverStyle}
      role="dialog"
      aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}
      use:portal={() => getPopoverHost()}
      onclick={stop}
      onkeydown={(event) => { if (event.key === 'Escape') { stop(event); close(); } }}
    >
      <div class="manager-travel-popover-search">
        <input
          bind:this={searchInput}
          bind:value={search}
          type="text"
          placeholder={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchPlaceholder', 'Search regions...')}
          aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchLabel', 'Search regions')}
        />
      </div>
      <div class="manager-travel-popover-options" role="listbox" aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}>
        <button
          type="button"
          class="manager-travel-option"
          role="option"
          aria-selected={!value}
          onclick={() => choose(null)}
        >
          <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
          <span class="manager-travel-option-name">{text('FABRICATE.Admin.Manager.Travel.Parties.OverrideAuto', 'Auto')}</span>
        </button>
        {#each filteredRegions as region (region.id)}
          <button
            type="button"
            class="manager-travel-option"
            role="option"
            aria-selected={region.id === value}
            title={region.name}
            onclick={() => choose(region.id)}
          >
            <i class="fas fa-map-location-dot" aria-hidden="true"></i>
            <span class="manager-travel-option-name">{region.name}</span>
            {#if !region.enabled}
              <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.Parties.OverrideDisabledSuffix', '(disabled)')}</span>
            {/if}
          </button>
        {:else}
          <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.Parties.NoRegionMatches', 'No regions match your search.')}</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
