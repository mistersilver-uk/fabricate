<!--
  THE ICON PICKER IS THE SHARED PICKER, WEARING ITS OWN CLOTHES: `openspec/specs/design-system/spec.md`
  names ONE picker primitive, and the second copy this used to own duly disagreed with it about its
  backdrop, radius, padding and field. What is LEFT is what is genuinely this picker's own, each
  through a capability the primitive exposes: a PINNED resolved row above an alphabetical list of
  750 and alias- and rank-aware search through `filterOptions`, the glyph tile on every row through
  the `option` snippet, a trigger the caller styles and keys through the `trigger` snippet, and a
  right-aligned panel with a measured whole-row list height through props.

  Invariants:
  - THE `.essence-icon-picker-*` CLASS FAMILY IS PRESERVED DELIBERATELY. It is addressed by the
    View Lab case registry, the live Foundry smoke and some thirty assertions, so a rename would
    edit all of them to change nothing a GM sees; it belongs to the family-rename child.
    `fabricate-icon-picker` and `fabricate-icon-picker-popover` are this picker's own namespace
    ROOTS and reach the primitive's root and portaled panel through `pickerClass`/`popoverClass`.
  - `bounds` IS THIS COMPONENT'S DEFAULT RATHER THAN THE PRIMITIVE'S, which walks the manager and
    admin scrollers instead. Adopting that walk would be a silent geometry change to nine shipped
    surfaces, so the value is passed through unchanged. A shared component must not name an
    application's own scroller, so the value comes from `util/overlayBounds.js` and a caller in
    another application passes its own.
  - THE TRIGGER MAY PRESERVE A STORED REGULAR-WEIGHT CLASS, BUT THE LIST OFFERS ONE SOLID ROW PER
    GLYPH. Resolve the row by glyph name or alias rather than by comparing the raw persisted
    class, or an alias and a regular-weight spelling both open with no `aria-selected` option even
    though their glyph is present.
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
    bounds = MANAGER_SCROLLER_SELECTOR,
    onChange = () => {},
  } = $props();

  const iconOptions = getEssenceIconOptions();
  const selectedIconClass = $derived(normalizeEssenceIcon(value));
  const selectedOption = $derived(getEssenceIconOption(selectedIconClass, iconOptions));
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
   * ONE ROW THE PRIMITIVE CAN KEY, MARK AND CHOOSE, built rather than stamped: the vocabulary's own
   * rows are frozen and carry no `id`, so this makes a NEW object whose `id` is the `iconClass` —
   * the value this picker persists, compares `aria-selected` against and calls `onChange` with.
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
   * THE ROWS TO DRAW, for a query the primitive has already normalized. None of the four parts
   * survives a label-substring filter:
   *
   *   1. MATCHING token-matches each row's `searchText`, built from the label, the Font Awesome
   *      aliases AND the human alias tables, so a GM who types `cog` reaches the picture they meant.
   *   2. RANKING comes with it — an exact name beats a name prefix beats a word prefix beats a
   *      substring — because the panel shows seven or eight rows.
   *   3. THE PINNED RESOLVED ROW is drawn ONCE at the top of an UNFILTERED list, falling back to a
   *      synthesised row for a stored value the vocabulary no longer offers, so such a value still
   *      opens with exactly one selected, selectable row naming what is persisted.
   *   4. THE PINNED ROW IS EXCLUDED FROM THE LIST BENEATH IT, which is a CORRECTNESS requirement:
   *      the primitive keys its `each` on `option.id`, so returning both would throw
   *      `each_key_duplicate`.
   *
   * It is called on EVERY pass INCLUDING an empty query, which is what makes 3 possible. The
   * active-search test mirrors the vocabulary's own normalization, which keeps only `[a-z0-9]`, so
   * a query of punctuation alone must not un-pin the resolved row either.
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
   * The row pitch and the popover chrome the whole-row flooring needs, MEASURED rather than
   * assumed: the row height is a derived CSS value and the gaps are tokens, so restating either
   * would be a second copy free to drift.
   *
   * @param {object} elements
   * @param {Element|null} elements.popover The portaled panel.
   * @param {Element|null} elements.list The `role="listbox"` element.
   * @param {Element|null} elements.search The query field.
   * @returns {{rowPitch?: number, rowGap?: number, chromeHeight?: number, listExtra?: number}}
   *   The measured metrics.
   */
  function measurePopoverMetrics({ popover, list, search }) {
    if (!popover || !list) return {};
    const popoverStyles = getComputedStyle(popover);
    const listStyles = getComputedStyle(list);
    const firstRow = list.querySelector('.essence-icon-picker-option');
    const rowHeight = firstRow?.getBoundingClientRect?.().height ?? 0;
    const rowGap = Number.parseFloat(listStyles.rowGap) || 0;
    if (!rowHeight) return {};

    // THE PINNED ROW'S OUTER MARGIN IS NEITHER PITCH NOR CHROME: a margin sits outside the border
    // box `rowPitch` measures, so the gap separating the pinned row from the list is height the
    // flooring never counted. It is returned as `listExtra` rather than folded into
    // `chromeHeight`, because chrome is height OUTSIDE the list — subtracting it can change the
    // row COUNT while the list's own max-height comes back with no term for the margin, where
    // `floorListToWholeRows` takes `listExtra` off the budget AND puts it back on the height.
    const pinnedRow = list.querySelector('.essence-icon-picker-option.pinned');
    const pinnedMargin = pinnedRow
      ? Number.parseFloat(getComputedStyle(pinnedRow).marginBottom) || 0
      : 0;

    const chromeHeight =
      (Number.parseFloat(popoverStyles.paddingTop) || 0) +
      (Number.parseFloat(popoverStyles.paddingBottom) || 0) +
      (Number.parseFloat(popoverStyles.rowGap) || 0) +
      (search?.getBoundingClientRect?.().height ?? 0);

    return { rowPitch: rowHeight + rowGap, rowGap, chromeHeight, listExtra: pinnedMargin };
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
  `noMatchesHint`, NOT `emptyHint`, and the mapping is measured rather than chosen. Only the
  FILTERED emptiness is reachable here, because a panel with no active query always pins the
  resolved row — so wiring this picker's own sentence to `emptyHint` would leave a GM reading the
  primitive's generic `No matches` while that sentence never rendered at all.
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
      THE CALLER'S OWN BUTTON, and `{...attributes}` LAST is load-bearing: it keeps the primitive's
      `type`, ARIA, handlers and the attachment that hands it this element, which the panel is
      anchored to and focus returns to on close. Everything the primitive does NOT emit stays ours
      and cannot be erased by that spread: the class family, the icon-only variant, the inline
      swatch `style`, `oncontextmenu`, and `disabled`, `aria-label` and `title`, which the
      primitive omits rather than handing over an `undefined` (which would REMOVE them) or its own
      `false` (which would override a caller disabling this trigger mid-save).
      `triggerAriaLabel` is deliberately not passed: the button is named here.
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
    ONE ROW'S CONTENT, and the primitive draws nothing else inside the row button, so the label
    span stays the row's LAST child: its own suite reads a row's name with `span:last-child`. The
    row's `title` is the plain label, written by the primitive.
  -->
  {#snippet option(row)}
    <span class="essence-icon-picker-preview" aria-hidden="true">
      <i class={row.iconClass}></i>
    </span>
    <span>{row.label}</span>
  {/snippet}
</SearchablePopover>
