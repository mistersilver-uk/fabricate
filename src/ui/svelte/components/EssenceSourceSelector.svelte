<!--
  The essence SOURCE picker: a drop-or-pick tile naming the in-system managed component an essence is
  transferred from. It is a `SearchablePopover` wearing its own clothes, and both callers render it
  in the UNLINKED state only, because a linked source is a card rather than a control.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | `{ id, name, img }` or `null` | `null` | Its `id` is what the primitive marks with `aria-selected`; passing the object itself would mark nothing. |
  | `items` | `{ id, name, img }[]` | `[]` | The managed components to choose from, mapped onto the primitive's `{ id, label, img }` row shape. `label` rather than `name` is not a rename for its own sake: the primitive filters, titles and marks a row by `label`, so a row keeping `name` would search as an empty string and title itself as `undefined`. |
  | `disabled` | boolean | `false` | Refuses the drop, the click and the clear. Owned HERE rather than passed through the spread; see the invariants. |
  | `bounds` | selector | manager scroller | The clipping boundary, passed THROUGH to the primitive, whose own default is the wider picker walk — adopting that walk would be a silent geometry change on both callers. |
  | `onDrop` / `onSelect` / `onClear` | functions | no-ops | The three things a GM can do to a source. |

  Invariants:
  - THE TRIGGER SNIPPET SPREADS THE PRIMITIVE'S `attributes` LAST, because `type`, the ARIA and the
    handlers belong to the primitive and a caller spreading them first would take over the
    contract. `aria-label`, `title` and `disabled` are this file's and survive that spread because
    the primitive OMITS them: an `undefined` value would REMOVE the name, and `disabled: false`
    would re-enable a trigger a caller had disabled mid-save.
  - THE PRIMITIVE OWNS THE ROW ELEMENT — its `id`, `tabindex`, `data-keyboard-focus`, ARIA, click
    and cursor marker — which is the whole point: the focus model is written once, in one
    component, for every picker in the product. The `option` snippet is the row's SOLE content,
    and its trailing `<span>` is load-bearing as the LAST child, because the sheet ellipsises the
    name through a `… span` selector.
  - THE PANEL IS A TWO-COLUMN GRID, AND THE KEY MAP HAS TO KNOW IT: the count is what makes
    ArrowDown step DOWN the column the GM is reading rather than sideways. It and the sheet are a
    mirror, so `essence-source-selector-keyboard-mounted.test.js` derives the count from the SHEET
    and measures the cursor's real step against it.
  - THE CLASS FAMILY RIDES ONTO THE PRIMITIVE'S ELEMENTS rather than being renamed: it is
    addressed by the sheet, by the portal-host test, by the manager's mounted suites and by this
    component's own, so a rename would edit ~30 assertions to change nothing a GM sees.
    `fabricate-source-picker` and `-popover` are this picker's own namespace ROOTS, one on the
    element the primitive owns and one on the panel it portals out of it.
-->
<script>
  import SearchablePopover from './SearchablePopover.svelte';
  import { dragDrop } from '../actions/dragDrop.js';
  import { localize } from '../util/foundryBridge.js';
  import { MANAGER_SCROLLER_SELECTOR } from '../util/overlayBounds.js';

  const GRID_COLUMNS = 2;

  let {
    value = null,
    items = [],
    disabled = false,
    bounds = MANAGER_SCROLLER_SELECTOR,
    onDrop = () => {},
    onSelect = () => {},
    onClear = () => {},
  } = $props();

  const sourceOptions = $derived(
    items.map((item) => ({ id: item?.id, label: item?.name || '', img: item?.img }))
  );

  const triggerLabel = $derived(
    value?.name
      ? `${localize('FABRICATE.Admin.Features.Essences.ChangeSourceItem')}: ${value.name}`
      : localize('FABRICATE.Admin.Features.Essences.DropOrPickSourceItem')
  );

  /**
   * The row pitch and the popover chrome the whole-row flooring needs. WITHOUT THIS THE GRID
   * SIMPLY FILLS THE PANEL and slices its last row of BORDERED tiles against the bottom inset,
   * which reads as a rendering fault rather than as "more below". Every figure is MEASURED from
   * the rendered box rather than restated here, because the row's height is a sheet rule and the
   * gaps are tokens. `listExtra` is 0 and STATED rather than omitted — this panel pins nothing,
   * and saying so stops a future reader assuming the key was forgotten.
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
    const firstTile = list.querySelector('.essence-source-picker-option');
    const rowHeight = firstTile?.getBoundingClientRect?.().height ?? 0;
    const rowGap = Number.parseFloat(listStyles.rowGap) || 0;
    if (!rowHeight) return {};

    // Composed from the panel's own computed box rather than by subtracting the list's height,
    // which would be circular: the list's height is what the layout is about to set.
    const chromeHeight =
      (Number.parseFloat(popoverStyles.paddingTop) || 0) +
      (Number.parseFloat(popoverStyles.paddingBottom) || 0) +
      (Number.parseFloat(popoverStyles.rowGap) || 0) +
      (search?.getBoundingClientRect?.().height ?? 0);

    return { rowPitch: rowHeight + rowGap, rowGap, chromeHeight, listExtra: 0 };
  }

  function clearItem(event) {
    event.preventDefault();
    event.stopPropagation();
    onClear?.();
  }
</script>

<!-- This picker's own NAMESPACE roots ride onto the primitive's two elements beside its own,
     which is what keeps every `.fabricate-source-picker …` rule resolving after the
     re-platform. -->
<SearchablePopover
  options={sourceOptions}
  value={value?.id}
  {bounds}
  as="grid"
  columns={GRID_COLUMNS}
  minWidth={280}
  maxWidth={340}
  pickerClass="fabricate-source-picker essence-source-selector"
  popoverClass="fabricate-source-picker-popover essence-source-picker-popover"
  searchClass="essence-source-picker-search"
  listClass="essence-source-picker-grid"
  optionClass="essence-source-picker-option"
  dialogAriaLabel={localize('FABRICATE.Admin.Features.Essences.SourcePickerLabel')}
  searchPlaceholder={localize('FABRICATE.Admin.Features.Essences.SearchSourcePlaceholder')}
  searchAriaLabel={localize('FABRICATE.Admin.Features.Essences.SearchSourceLabel')}
  emptyHint={localize('FABRICATE.Admin.Features.Essences.NoComponentsAvailable')}
  noMatchesHint={localize('FABRICATE.Admin.Features.Essences.NoMatchingComponents')}
  measureListMetrics={measurePopoverMetrics}
  onChoose={(itemId) => onSelect?.(itemId)}
>
  {#snippet trigger({ attributes, open })}
    <div
      class="essence-source-selector-shell"
      use:dragDrop={{ onDrop, disabled, activeClass: 'drop-active' }}
    >
      <button
        class="essence-source-trigger"
        class:has-value={!!value}
        {disabled}
        aria-label={triggerLabel}
        title={triggerLabel}
        {...attributes}
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
          <i class={`fas ${open ? 'fa-chevron-up' : 'fa-search'}`}></i>
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
  {/snippet}

  {#snippet option(item)}
    <img src={item.img || 'icons/svg/item-bag.svg'} alt="" />
    <span>{item.label}</span>
  {/snippet}
</SearchablePopover>
