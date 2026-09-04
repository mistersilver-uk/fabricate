<!-- Svelte 5 runes mode -->
<script>
  import { anchoredPopover, hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { localize } from '../util/foundryBridge.js';
  import {
    DEFAULT_ESSENCE_ICON,
    getEssenceIconOptions,
    filterEssenceIconOptions,
    getEssenceIconOption,
    normalizeEssenceIcon,
  } from '../util/essenceIcons.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { MANAGER_SCROLLER_SELECTOR } from '../util/overlayBounds.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  let {
    value = DEFAULT_ESSENCE_ICON,
    disabled = false,
    buttonTitle = '',
    iconOnly = false,
    triggerClass = '',
    triggerStyle = '',
    onTriggerContextMenu = null,
    onTriggerKeydown = null,
    // The clipping boundary the popover is clamped inside, as a selector for the nearest matching
    // ancestor. A shared component must not name an application's own scroller, so the default is
    // a value from `util/overlayBounds.js` and a caller in another application passes its own.
    bounds = MANAGER_SCROLLER_SELECTOR,
    onChange = () => {},
  } = $props();

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let searchInput = $state(null);
  let optionsList = $state(null);

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

  /**
   * The row pitch and the popover chrome the whole-row flooring needs (issue 1280).
   *
   * Measured rather than assumed: the row height is a derived CSS value
   * (`--fab-icon-picker-row`) and the gaps are tokens, so restating either here would be a second
   * copy free to drift from the stylesheet — which is the exact fault this change exists to fix.
   *
   * Chrome is composed from the popover's own computed box rather than by subtracting the list's
   * height, which would be circular: the list's height is what we are about to set.
   *
   * Re-run on EVERY measure, because `anchoredPopover` calls `layoutOptions` per pass.
   */
  function measurePopoverMetrics() {
    if (!popoverRoot || !optionsList) return {};
    const popoverStyles = getComputedStyle(popoverRoot);
    const listStyles = getComputedStyle(optionsList);
    const firstRow = optionsList.querySelector('.essence-icon-picker-option');
    const rowHeight = firstRow?.getBoundingClientRect?.().height ?? 0;
    const rowGap = Number.parseFloat(listStyles.rowGap) || 0;
    if (!rowHeight) return {};

    const chromeHeight =
      (Number.parseFloat(popoverStyles.paddingTop) || 0) +
      (Number.parseFloat(popoverStyles.paddingBottom) || 0) +
      (Number.parseFloat(popoverStyles.rowGap) || 0) +
      (searchInput?.getBoundingClientRect?.().height ?? 0);

    return { rowPitch: rowHeight + rowGap, rowGap, chromeHeight };
  }

  $effect(() => {
    if (!pickerOpen || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
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

<!-- `fabricate-icon-picker` is this primitive's own NAMESPACE root, and `fabricate-icon-picker-popover`
     below is the panel's half of it (issue 1470). Every rule the picker owns hangs off one of the two
     rather than off `.fabricate-manager`, so the component paints in whatever application it is mounted
     in — the shared directory's premise. A portaled node keeps its classes and loses its ancestors,
     which is why the panel needs a root class of its own rather than inheriting this one. -->
<div
  bind:this={pickerRoot}
  class="fabricate-icon-picker essence-icon-picker"
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
      class="fabricate-icon-picker-popover essence-icon-picker-popover"
      role="dialog"
      aria-label={localize('FABRICATE.Admin.Features.Essences.IconDialogLabel')}
      use:anchoredPopover={{
        component: 'IconPicker',
        trigger: triggerButton,
        layout: popoverLayout,
        // `iconOnly` is read INSIDE this closure, so it is not a dependency of the action's
        // `update`: the closure is re-run on the next measure rather than when the prop changes.
        // That is what `measurePopoverMetrics()` wants — it must re-measure every pass — and
        // `iconOnly` is fixed for the life of one open at every call site, so the two share it.
        layoutOptions: () => ({
          horizontalAlign: iconOnly ? 'left' : 'right',
          ...measurePopoverMetrics(),
        }),
        bounds,
        // Read eagerly rather than behind a callback: the list binds one pass after this action
        // first runs, and reading it here is what makes Svelte re-run the action's `update` — and
        // therefore the measure — once it exists.
        targets: { list: optionsList },
        // Scroll is listened for in CAPTURE on `document`, so it also sees the options list's own
        // scrolling. The popover is anchored to the trigger, and scrolling INSIDE the popover
        // moves neither, so those events are dropped: the answer they would recompute is the one
        // already applied. Scrolling an ancestor panel does move the trigger and still repositions.
        ignoreScrollWithin: true,
      }}
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
        bind:this={optionsList}
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
