<!--
  THE ICON PICKER IS THE SHARED PICKER, WEARING ITS OWN CLOTHES: `openspec/specs/design-system/spec.md`
  names ONE picker primitive, and the second copy this used to own duly disagreed with it about its
  backdrop, radius, padding and field. What is LEFT is what is genuinely this picker's own, each
  through a capability the primitive exposes: a PINNED resolved row above an alphabetical list of 750
  and alias- and rank-aware search through `filterOptions`, the glyph tile on every row through the
  `option` snippet, a trigger the caller styles and keys through the `trigger` snippet, and a
  right-aligned panel with a measured whole-row list height through props.

  Invariants:
  - THE `.essence-icon-picker-*` CLASS FAMILY IS PRESERVED DELIBERATELY, being addressed by the View
    Lab case registry, the live Foundry smoke and some thirty assertions.
    `fabricate-icon-picker` and `fabricate-icon-picker-popover` are this picker's own namespace ROOTS
    and reach the primitive's root and portaled panel through `pickerClass`/`popoverClass`.
  - `bounds` IS THIS COMPONENT'S DEFAULT RATHER THAN THE PRIMITIVE'S, which walks the manager and
    admin scrollers instead; adopting that walk would be a silent geometry change to nine shipped
    surfaces. The value comes from `util/overlayBounds.js`, because a shared component must not name
    an application's own scroller.
  - THE TRIGGER MAY PRESERVE A STORED REGULAR-WEIGHT CLASS, BUT THE LIST OFFERS ONE SOLID ROW PER
    GLYPH. Resolve the row by glyph name or alias rather than by comparing the raw persisted class,
    or an alias and a regular-weight spelling both open with no `aria-selected` option even though
    their glyph is present.
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

  function iconRow(option, pinned) {
    return {
      id: option.iconClass,
      iconClass: option.iconClass,
      label: option.label,
      class: pinned ? 'pinned' : undefined,
    };
  }

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

  function measurePopoverMetrics({ popover, list, search }) {
    if (!popover || !list) return {};
    const popoverStyles = getComputedStyle(popover);
    const listStyles = getComputedStyle(list);
    const firstRow = list.querySelector('.essence-icon-picker-option');
    const rowHeight = firstRow?.getBoundingClientRect?.().height ?? 0;
    const rowGap = Number.parseFloat(listStyles.rowGap) || 0;
    if (!rowHeight) return {};

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

  {#snippet option(row)}
    <span class="essence-icon-picker-preview" aria-hidden="true">
      <i class={row.iconClass}></i>
    </span>
    <span>{row.label}</span>
  {/snippet}
</SearchablePopover>
