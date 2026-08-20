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
    normalizeEssenceIcon,
  } from '../util/essenceIcons.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';

  let {
    value = DEFAULT_ESSENCE_ICON,
    disabled = false,
    buttonTitle = '',
    iconOnly = false,
    triggerClass = '',
    triggerStyle = '',
    onTriggerContextMenu = null,
    onTriggerKeydown = null,
    onChange = () => {},
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
  // The trigger is allowed to preserve a stored regular-weight class, but the list deliberately
  // offers one SOLID row per glyph. Resolve the row by glyph name/alias rather than comparing the
  // raw persisted class, otherwise `fas fa-cog` (alias of gear) and `far fa-bell` both open with no
  // aria-selected option even though their glyph is present in the list.
  const selectedRowIconClass = $derived(
    iconOptions.find(
      (option) =>
        option.iconName === selectedOption.iconName ||
        option.aliases?.includes(selectedOption.iconName)
    )?.iconClass ?? selectedOption.iconClass
  );
  const filteredOptions = $derived(filterEssenceIconOptions(iconOptions, searchTerm));
  // Mirrors `normalizeSearch` in `essenceIcons.js`, which keeps only `[a-z0-9]`: a query of
  // punctuation alone filters nothing, so it must not un-pin the resolved row either.
  const searchIsActive = $derived(/[a-z0-9]/i.test(searchTerm));
  // The row the stored value resolves to, rendered ONCE at the top of an unfiltered list.
  //
  // The popover shows seven or eight rows of an alphabetical list hundreds long, so without this
  // the picker always opens on `abacus` and the current selection is a scroll away — the default
  // essence icon `fas fa-mortar-pestle` sits at row 1075. Pinning is a render-order change rather
  // than scroll math, so it costs no measurement and stays correct when the popover flips to
  // `placement: 'top'`.
  //
  // It falls back to `selectedOption`, the synthesised row `getEssenceIconOption` returns for a
  // name the list does not offer. A stored value the vocabulary no longer carries — `fas fa-folder`,
  // `src/utils/categoryIcons.js`'s `DEFAULT_CATEGORY_ICON`, is the commonest — therefore still
  // opens with exactly one selected, selectable row naming what is actually persisted, instead of
  // no selection and no explanation.
  const pinnedOption = $derived(
    searchIsActive
      ? null
      : (iconOptions.find((option) => option.iconClass === selectedRowIconClass) ?? selectedOption)
  );
  const listedOptions = $derived(
    pinnedOption
      ? filteredOptions.filter((option) => option.iconClass !== pinnedOption.iconClass)
      : filteredOptions
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

  function handleTriggerContextMenu(event) {
    if (typeof onTriggerContextMenu === 'function') {
      onTriggerContextMenu(event);
    }
  }

  function handleTriggerKeydown(event) {
    if (typeof onTriggerKeydown === 'function') {
      onTriggerKeydown(event);
    }
  }

  function selectIcon(iconClass) {
    onChange(normalizeEssenceIcon(iconClass));
    closePicker();
  }

  function getPopoverHost() {
    if (!pickerRoot || typeof document === 'undefined') return null;

    return pickerRoot.closest('.fabricate-manager');
  }

  function getPopoverHorizontalBounds(hostRect) {
    if (!pickerRoot) return {};

    const mainPanel = pickerRoot.closest('.admin-main, .manager-main, .manager-table-scroll');
    const mainPanelRect = mainPanel?.getBoundingClientRect?.();
    if (!mainPanelRect) return {};

    return {
      minLeft: mainPanelRect.left - hostRect.left + 16,
      maxRight: mainPanelRect.right - hostRect.left - 16,
    };
  }

  function updatePopoverPosition() {
    if (!pickerOpen || !triggerButton || typeof window === 'undefined') return;

    const popoverHost = getPopoverHost();
    const hostRect = popoverHost?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
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
        height: triggerRect.height,
      },
      { width: hostRect.width || window.innerWidth, height: hostRect.height || window.innerHeight },
      {
        horizontalAlign: iconOnly ? 'left' : 'right',
        minLeft: horizontalBounds.minLeft,
        maxRight: horizontalBounds.maxRight,
      }
    );

    if (!layout) {
      popoverStyle = '';
      return;
    }

    const verticalPosition =
      layout.placement === 'top'
        ? `top: auto; bottom: ${layout.bottom}px;`
        : `top: ${layout.top}px; bottom: auto;`;

    popoverStyle = [
      `left: ${layout.left}px;`,
      'right: auto;',
      `width: ${layout.width}px;`,
      `max-height: ${layout.maxHeight}px;`,
      verticalPosition,
    ].join(' ');
  }

  function isPopoverScroll(event) {
    const target = event?.target;
    if (!target || !popoverRoot) return false;
    return target === popoverRoot || popoverRoot.contains?.(target) === true;
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

    // Scroll is listened for in CAPTURE on `document`, so it also sees the options list's own
    // scrolling — and repositioning costs two `closest()` traversals, three forced reflows and a
    // style write per event. The popover is anchored to the trigger, and scrolling INSIDE the
    // popover moves neither, so those events are dropped rather than coalesced: the answer they
    // would recompute is the one already applied. Scrolling an ancestor panel does move the
    // trigger and still repositions.
    const handleViewportChange = (event) => {
      if (isPopoverScroll(event)) return;
      updatePopoverPosition();
    };
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<!--
  One row, rendered by both the pinned resolved row and the alphabetical list beneath it. A snippet
  rather than a second copy of the markup: the two differ only in which flags they pass.

  `title` is the plain label. It used to append `(${option.variant})`, and every row now reads
  `solid` because the list offers one solid row per glyph, so the tooltip was the last place in the
  UI implying a weight choice the GM no longer makes.
-->
{#snippet iconOptionRow(option, selected, pinned)}
  <button
    type="button"
    class="essence-icon-picker-option"
    class:selected
    class:pinned
    role="option"
    aria-selected={selected}
    title={option.label}
    onclick={() => selectIcon(option.iconClass)}
  >
    <span class="essence-icon-picker-preview" aria-hidden="true">
      <i class={option.iconClass}></i>
    </span>
    <span>{option.label}</span>
  </button>
{/snippet}

<div
  bind:this={pickerRoot}
  class="essence-icon-picker"
  use:dismissOnOutsideClick={{
    enabled: pickerOpen,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot],
  }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class={`essence-icon-picker-trigger ${triggerClass}`}
    class:icon-only={iconOnly}
    style={triggerStyle}
    onclick={togglePicker}
    oncontextmenu={handleTriggerContextMenu}
    onkeydown={handleTriggerKeydown}
    {disabled}
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
        {#if pinnedOption}
          {@render iconOptionRow(pinnedOption, true, true)}
        {/if}
        {#each listedOptions as option (option.iconClass)}
          {@render iconOptionRow(option, option.iconClass === selectedRowIconClass, false)}
        {/each}
        {#if listedOptions.length === 0 && !pinnedOption}
          <p class="hint essence-icon-picker-empty">
            {localize('FABRICATE.Admin.Features.Essences.NoIconsFound')}
          </p>
        {/if}
      </div>
    </div>
  {/if}
</div>
