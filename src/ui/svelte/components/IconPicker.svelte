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
  import { activeOptionId, nextActiveIndex } from '../util/listboxNavigation.js';
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

  // A PER-INSTANCE PREFIX for the option `id`s (issue 1503). `aria-activedescendant` points at a
  // DOM id, so the ids have to be unique document-wide rather than merely within one panel: two
  // pickers open on the same screen, both numbering their rows from 0, would emit the same id and
  // make the reference ambiguous. `$props.id()` is Svelte's own answer to exactly this.
  const instanceId = $props.id();
  const listId = `${instanceId}-listbox`;

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  // THE KEYBOARD CURSOR, and -1 is not "the first row" (issue 1503). It means the GM has opened
  // the panel and not yet pressed an arrow key, which is a different state from "row 0 is
  // active": no row carries the marker, and Enter is a NO-OP rather than a blind choice of
  // whatever sits at the top of a 750-row alphabetical list. See `util/listboxNavigation.js`.
  let activeIndex = $state(-1);
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

  // ── THE LISTBOX FOCUS MODEL (issue 1503) ──────────────────────────────────────────────────
  //
  // `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element —
  // the HOLDER — and drive selection with `aria-activedescendant`. Here the holder is the query
  // field, which is rendered for the panel's whole life, and the option rows NEVER receive DOM
  // focus. Roving focus onto them is what the prohibition forbids, because it re-arms Foundry's
  // canvas bindings — and there is a second, independent reason: `styles/fabricate.css` rings any
  // focused `[tabindex]` under `.fabricate` with a 2px accent outline at a POSITIVE offset, and
  // every row is now a `[tabindex]` element, so a row that took focus would draw a competing ring
  // around the keyboard cursor's own inset one.
  //
  // THE FLAT RENDERED ORDER is what the cursor indexes and what the option `id`s are numbered
  // over. The pinned resolved row is drawn ONCE at the top, outside the alphabetical `each`, so an
  // index counted over `listedOptions` alone would put id 0 on the SECOND row the GM sees:
  // `aria-activedescendant` would name one row while another drew the cursor.
  const renderedOptions = $derived(pinnedOption ? [pinnedOption, ...listedOptions] : listedOptions);
  // The holder announces a row only while that row EXISTS. The reset below covers every input
  // that rebuilds the list; this bound covers the render in between, because an id resolving to
  // no element is worse than no id at all.
  const activeDescendantId = $derived(
    activeIndex >= 0 && activeIndex < renderedOptions.length
      ? activeOptionId(instanceId, activeIndex)
      : undefined
  );

  // A CURSOR CANNOT OUTLIVE THE LIST IT INDEXES, and two independent inputs rebuild that list:
  // opening starts a fresh pass over the vocabulary, and every query keystroke rebuilds
  // `filteredOptions` — so index 3 names an unrelated glyph the moment either moves. Resetting to
  // -1 rather than clamping is the point: the GM has not arrowed into the NEW list, so nothing in
  // it is active and Enter stays a no-op until they do.
  const optionListGeneration = $derived(`${pickerOpen ? 'open' : 'closed'}/${searchTerm}`);
  let cursorGeneration = '';
  $effect(() => {
    if (cursorGeneration === optionListGeneration) return;
    cursorGeneration = optionListGeneration;
    activeIndex = -1;
  });

  // KEEP THE CURSOR IN VIEW. The list scrolls — seven or eight rows of hundreds — so the row the
  // GM has arrowed to can be outside its window, and because nothing is FOCUSED the browser will
  // not scroll to it on its own. The call is optional because happy-dom's element does not
  // implement `scrollIntoView`, and a bare call would throw in every mounted picker suite.
  $effect(() => {
    if (activeIndex < 0 || !optionsList) return;
    optionsList.querySelector?.('[data-active-option="true"]')?.scrollIntoView?.({
      block: 'nearest',
    });
  });

  // THE KEY MAP, on the holder. `nextActiveIndex` owns the arithmetic; this owns the wiring —
  // which keys are CONSUMED and what Enter chooses. A key the module does not own returns `null`
  // and is left entirely alone, which is what keeps every printable character going to the query
  // field. Escape is not handled here: `dismissOnOutsideClick` on the picker root takes it at the
  // document's capture phase.
  function onHolderKeydown(event) {
    if (event.key === 'Enter') {
      // Enter WITHOUT an active option is a no-op rather than a choice of the first row, so it
      // is left unprevented and reaches the field it was pressed in.
      const active = renderedOptions[activeIndex];
      if (!active) return;
      event.preventDefault();
      selectIcon(active.iconClass);
      return;
    }
    const next = nextActiveIndex(activeIndex, renderedOptions.length, event.key);
    if (next === null) return;
    event.preventDefault();
    activeIndex = next;
  }

  function closePicker() {
    pickerOpen = false;
    searchTerm = '';
    // FOCUS COMES BACK TO THE TRIGGER (issue 1503). The element it is on — the query field — is
    // about to be unmounted, and an unmounted focus owner leaves `document.activeElement` on
    // `<body>`, so the GM's next Tab restarts from the top of the sheet. The move is synchronous
    // and needs no `tick()`: unlike `SearchablePopover`'s inline-search shape, this trigger is
    // rendered for the component's whole life, so it is already there to receive focus.
    triggerButton?.focus?.();
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
{#snippet iconOptionRow(option, index, selected, pinned)}
  <button
    type="button"
    class="essence-icon-picker-option"
    class:selected
    class:pinned
    role="option"
    id={activeOptionId(instanceId, index)}
    tabindex="-1"
    data-keyboard-focus="true"
    aria-selected={selected}
    data-active-option={index === activeIndex ? 'true' : undefined}
    title={option.label}
    onclick={() => selectIcon(option.iconClass)}
    onmousedown={(event) => event.preventDefault()}
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
        <!-- The HOLDER. It keeps DOM focus for the panel's whole life and announces the row the
             keyboard cursor is on; an `<input>` is one of the tags Foundry's `hasFocus` already
             recognises, so unlike a trigger holder it needs no `data-keyboard-focus`. -->
        <input
          bind:this={searchInput}
          bind:value={searchTerm}
          type="text"
          role="combobox"
          aria-expanded={pickerOpen}
          aria-controls={listId}
          aria-activedescendant={activeDescendantId}
          placeholder={localize('FABRICATE.Admin.Features.Essences.SearchIconPlaceholder')}
          aria-label={localize('FABRICATE.Admin.Features.Essences.SearchIconLabel')}
          onkeydown={onHolderKeydown}
        />
      </div>

      <div
        bind:this={optionsList}
        class="essence-icon-picker-options"
        role="listbox"
        id={listId}
        aria-label={localize('FABRICATE.Admin.Features.Essences.IconDialogLabel')}
      >
        <!-- `index` is the row's position in the FLAT rendered order, which is why the `each`
             below offsets by the pinned row: the `id`s and the cursor are numbered over the
             concatenation of the two branches, not per branch. -->
        {#if pinnedOption}
          {@render iconOptionRow(pinnedOption, 0, true, true)}
        {/if}
        {#each listedOptions as option, index (option.iconClass)}
          {@render iconOptionRow(
            option,
            pinnedOption ? index + 1 : index,
            option.iconClass === selectedRowIconClass,
            false
          )}
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
