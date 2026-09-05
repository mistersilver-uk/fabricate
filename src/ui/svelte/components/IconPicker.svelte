<!-- Svelte 5 runes mode -->
<!--
  THE ICON PICKER IS THE SHARED PICKER, WEARING ITS OWN CLOTHES (issue 1503).
  ---------------------------------------------------------------------------------------------
  This component used to own a second copy of everything `SearchablePopover` owns: a
  `role="listbox"`, an `anchoredPopover` panel, a `dismissOnOutsideClick` root, a search field, a
  keyboard cursor and a focus model. `openspec/specs/design-system/spec.md` names ONE picker
  primitive, and a second copy is a second place for the focus model, the ARIA and the panel box
  to drift — which is exactly what happened: the two panels disagreed about their backdrop, their
  radius, their padding and their search field.

  What is LEFT here is what is genuinely this picker's own, and each item is a capability the
  primitive now exposes rather than a reason to fork it:

    · a PINNED resolved row above an alphabetical list of 750, expressed through `filterOptions`
    · alias- and rank-aware search (`cog` finds the gear), same seam
    · the `.essence-icon-picker-preview` glyph tile on every row, through the `option` snippet
    · a trigger the caller styles, names, right-clicks and keys, through the `trigger` snippet
    · a right-aligned panel for the icon-only shape, a measured whole-row list height, and the
      manager scroller as the clipping boundary

  The CLASS FAMILY is preserved deliberately. `.essence-icon-picker-*` is addressed by the View
  Lab case registry, the live Foundry smoke and some thirty assertions across the test suites, so
  a rename would edit all of them to change nothing a GM sees; it belongs to the epic's
  family-rename child. `fabricate-icon-picker` and `fabricate-icon-picker-popover` are this
  picker's own namespace ROOTS (issue 1470) and reach the primitive's root and portaled panel
  through `pickerClass` and `popoverClass`.
-->
<script>
  import SearchablePopover from './SearchablePopover.svelte';
  import { localize } from '../util/foundryBridge.js';
  import {
    DEFAULT_ESSENCE_ICON,
    getEssenceIconOptions,
    filterEssenceIconOptions,
    getEssenceIconOption,
    normalizeEssenceIcon,
  } from '../util/essenceIcons.js';
  import { MANAGER_SCROLLER_SELECTOR } from '../util/overlayBounds.js';

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
    //
    // It is THIS component's default rather than the primitive's, which walks the manager and
    // admin scrollers instead. Adopting that walk would be a silent geometry change to nine
    // shipped surfaces, so the value is passed through unchanged.
    bounds = MANAGER_SCROLLER_SELECTOR,
    onChange = () => {},
  } = $props();

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
  const triggerName = $derived(
    buttonTitle || localize('FABRICATE.Admin.Features.Essences.ChooseIcon')
  );
  const dialogLabel = $derived(localize('FABRICATE.Admin.Features.Essences.IconDialogLabel'));

  /**
   * ONE ROW THE PRIMITIVE CAN KEY, MARK AND CHOOSE, built rather than stamped.
   *
   * The primitive keys its `each` on `option.id`, marks the current value with
   * `option.id === value` and calls `onChoose(option.id)`. `getEssenceIconOptions()` returns
   * `Object.freeze({ iconClass, iconName, label, variant, aliases, searchAliases, searchText })`
   * — no `id` at all, and frozen, so an `id` cannot be stamped onto it. Hence a NEW object per
   * row, whose `id` is the `iconClass`: that is the value this picker persists, the value
   * `aria-selected` has to compare against, and the value `onChange` is called with.
   *
   * `class` is the primitive's per-row state hook, appended after `optionClass`, and `pinned` is
   * a fact about the DATA rather than about styling plumbing — which is why it travels on the row.
   *
   * @param {object} option A frozen vocabulary row.
   * @param {boolean} pinned Whether this is the resolved row drawn above the list.
   * @returns {{id: string, iconClass: string, label: string, class: (string|undefined)}} The row.
   */
  function iconRow(option, pinned) {
    return {
      id: option.iconClass,
      iconClass: option.iconClass,
      label: option.label,
      class: pinned ? 'pinned' : undefined,
    };
  }

  /**
   * THE ROWS TO DRAW, for a query the primitive has already normalized.
   *
   * This is the picker's whole list behaviour in one seam, and none of the four parts survives
   * the primitive's own label-substring filter:
   *
   *   1. MATCHING is `filterEssenceIconOptions`, which token-matches each row's `searchText` —
   *      built from the label, the Font Awesome aliases AND the human alias tables — so a GM who
   *      types `cog`, `potion`, `gold` or `character` reaches the picture they meant.
   *   2. RANKING comes with it: an exact name beats a name prefix beats a word prefix beats a
   *      substring, because the panel shows seven or eight rows and `key` otherwise sat tenth
   *      behind `car-key`.
   *   3. THE PINNED RESOLVED ROW is drawn ONCE at the top of an UNFILTERED list, so the picker
   *      does not always open on `abacus` with the current selection hundreds of rows away. It
   *      falls back to the synthesised row `getEssenceIconOption` returns for a stored value the
   *      vocabulary no longer offers (`fas fa-folder` is the commonest), so such a value still
   *      opens with exactly one selected, selectable row naming what is actually persisted.
   *   4. THE PINNED ROW IS EXCLUDED FROM THE LIST BENEATH IT, which is a correctness requirement
   *      and not a tidiness one: the primitive keys its `each` on `option.id`, so returning both
   *      the pinned row and the row it pins would throw `each_key_duplicate`.
   *
   * It is called on EVERY pass INCLUDING an empty query, which is what makes 3 possible: pinning
   * is precisely a no-query behaviour, so a seam consulted only under a query would drop it.
   *
   * `searchIsActive` mirrors `normalizeSearch` in `essenceIcons.js`, which keeps only `[a-z0-9]`:
   * a query of punctuation alone filters nothing, so it must not un-pin the resolved row either.
   *
   * @param {Array<object>} options The raw vocabulary.
   * @param {string} query The normalized (trimmed, lower-cased) query.
   * @returns {Array<object>} The rows to render, in the order they are drawn.
   */
  function iconPickerRows(options, query) {
    const matched = filterEssenceIconOptions(options, query);
    const searchIsActive = /[a-z0-9]/i.test(query);
    const pinned = searchIsActive
      ? null
      : (options.find((option) => option.iconClass === selectedRowIconClass) ?? selectedOption);
    if (!pinned) return matched.map((option) => iconRow(option, false));

    return [
      iconRow(pinned, true),
      ...matched
        .filter((option) => option.iconClass !== pinned.iconClass)
        .map((option) => iconRow(option, false)),
    ];
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
   * The three elements are HANDED OVER rather than bound here, because after the re-platform all
   * three belong to the primitive. It re-runs this on every measure pass, exactly as this
   * component's own `layoutOptions` closure did.
   *
   * @param {object} elements
   * @param {Element|null} elements.popover The portaled panel.
   * @param {Element|null} elements.list The `role="listbox"` element.
   * @param {Element|null} elements.search The query field.
   * @returns {{rowPitch?: number, rowGap?: number, chromeHeight?: number}} The measured metrics.
   */
  function measurePopoverMetrics({ popover, list, search }) {
    if (!popover || !list) return {};
    const popoverStyles = getComputedStyle(popover);
    const listStyles = getComputedStyle(list);
    const firstRow = list.querySelector('.essence-icon-picker-option');
    const rowHeight = firstRow?.getBoundingClientRect?.().height ?? 0;
    const rowGap = Number.parseFloat(listStyles.rowGap) || 0;
    if (!rowHeight) return {};

    // THE PINNED ROW'S OUTER MARGIN IS CHROME, NOT PITCH (issue 1503). `rowPitch` is a row's
    // BORDER BOX plus the list's `row-gap`, and a margin sits outside the border box — so the
    // extra gap the sheet puts under the pinned resolved row, which separates it from the
    // alphabetical list, is height the list needs and the flooring never counted. Unfolded, the
    // list is floored to `rows x pitch` while its content is that plus the margin, and the panel
    // clips the last row by exactly the margin: the whole-row guarantee this callback exists to
    // make is false by 8px at the shipped `--fab-space-2`. Read from the row rather than restated
    // here for the same reason every other figure in this function is measured.
    const pinnedRow = list.querySelector('.essence-icon-picker-option.pinned');
    const pinnedMargin = pinnedRow
      ? Number.parseFloat(getComputedStyle(pinnedRow).marginBottom) || 0
      : 0;

    const chromeHeight =
      (Number.parseFloat(popoverStyles.paddingTop) || 0) +
      (Number.parseFloat(popoverStyles.paddingBottom) || 0) +
      (Number.parseFloat(popoverStyles.rowGap) || 0) +
      pinnedMargin +
      (search?.getBoundingClientRect?.().height ?? 0);

    return { rowPitch: rowHeight + rowGap, rowGap, chromeHeight };
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
  }
</script>

<!--
  `noMatchesHint`, NOT `emptyHint`, and the mapping is measured rather than chosen.

  The primitive distinguishes two emptinesses: a list that holds NOTHING (`emptyHint`) and a
  search that filtered an authored list to nothing (`noMatchesHint`). Only the second is reachable
  here, because a panel with no active query always pins the resolved row — so the sole route into
  the empty branch is a query that matched nothing. Wiring `NoIconsFound` to `emptyHint` would
  therefore leave a GM reading the primitive's generic `No matches` while this picker's own
  sentence never rendered at all.
-->
<SearchablePopover
  options={iconOptions}
  value={selectedRowIconClass}
  filterOptions={iconPickerRows}
  pickerClass="fabricate-icon-picker essence-icon-picker"
  popoverClass="fabricate-icon-picker-popover essence-icon-picker-popover"
  searchClass="essence-icon-picker-search"
  listClass="essence-icon-picker-options"
  optionClass="essence-icon-picker-option"
  dialogAriaLabel={dialogLabel}
  searchPlaceholder={localize('FABRICATE.Admin.Features.Essences.SearchIconPlaceholder')}
  searchAriaLabel={localize('FABRICATE.Admin.Features.Essences.SearchIconLabel')}
  noMatchesHint={localize('FABRICATE.Admin.Features.Essences.NoIconsFound')}
  horizontalAlign={iconOnly ? 'left' : 'right'}
  minWidth={260}
  maxWidth={340}
  measureListMetrics={measurePopoverMetrics}
  ignoreScrollWithin={true}
  triggerOnKeydown={handleTriggerKeydown}
  {bounds}
  onChoose={selectIcon}
>
  {#snippet trigger({ attributes, open })}
    <!--
      THE CALLER'S OWN BUTTON, and `{...attributes}` LAST is load-bearing.

      Last is what keeps the primitive's `type`, `aria-haspopup`, `aria-expanded`, `onclick`,
      `onkeydown` and the attachment that hands it this element — the panel is anchored to this
      button and focus returns to it on close, and `bind:this` cannot cross a snippet boundary.

      Everything the primitive does NOT emit stays ours and cannot be erased by that spread: the
      class family, the icon-only variant, the inline swatch `style`, `oncontextmenu`, and
      `disabled`, `aria-label` and `title`, which the primitive omits from the object rather than
      handing over an `undefined` (which would REMOVE them) or its own `false` (which would
      override a caller disabling this trigger mid-save). `triggerAriaLabel` is deliberately not
      passed: the button is named here, and passing both would let the spread win.
    -->
    <button
      class={`essence-icon-picker-trigger ${triggerClass}`}
      class:icon-only={iconOnly}
      style={triggerStyle}
      oncontextmenu={handleTriggerContextMenu}
      {disabled}
      aria-label={triggerName}
      title={triggerName}
      {...attributes}
    >
      <span class="essence-icon-picker-preview" aria-hidden="true">
        <i class={selectedOption.iconClass}></i>
      </span>
      {#if !iconOnly}
        <span class="essence-icon-picker-trigger-label">{selectedOption.label}</span>
      {/if}
      <span class="essence-icon-picker-trigger-caret" aria-hidden="true">
        <i class={`fas ${open ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
      </span>
    </button>
  {/snippet}

  <!--
    ONE ROW'S CONTENT, and the primitive draws nothing else inside the row button — no chip, no
    trailing marker — so the label span stays the row's LAST child. Its own suite reads a row's
    name with `span:last-child`.

    The row's `title` is the plain label, written by the primitive. It used to append
    `(${option.variant})`, and every row now reads `solid` because the list offers one solid row
    per glyph, so the tooltip was the last place in the UI implying a weight choice the GM no
    longer makes.
  -->
  {#snippet option(row)}
    <span class="essence-icon-picker-preview" aria-hidden="true">
      <i class={row.iconClass}></i>
    </span>
    <span>{row.label}</span>
  {/snippet}
</SearchablePopover>
