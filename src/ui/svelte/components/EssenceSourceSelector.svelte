<!-- Svelte 5 runes mode -->
<!--
  The essence SOURCE picker: a drop-or-pick tile that names the in-system managed component an
  essence is transferred from. Two callers, both under `apps/manager/essences/` — the on-craft tab
  and the browser inspector — and both render it in the UNLINKED state only, because a linked
  source is a card rather than a control.

  ── IT IS A `SearchablePopover` NOW (issue 1503) ─────────────────────────────────────────────
  This component used to hand-roll the whole widget: its own popover, its own `role="listbox"`, its
  own query field, its own `dismissOnOutsideClick`/`anchoredPopover` wiring and its own keyboard
  cursor. `openspec/specs/design-system/library.html`'s `<SearchPopover>` specimen names this
  catalogue among the pickers that collapse into the shared one, and the four capabilities that
  kept it out have been built: a caller-owned `trigger` snippet, a caller-owned `option` snippet,
  `as="grid"` with a column count, and a second empty message for the filtered emptiness.

  What this file still owns, and why each one had to stay owned rather than move:

    THE TRIGGER is a drop-target image tile with an empty state and a corner glyph, sitting beside
    a clear button inside a `dragDrop` shell. None of that is a picker trigger's business, so it is
    rendered from a `trigger` snippet and the primitive renders no button of its own. The snippet
    spreads the primitive's `attributes` LAST — `type`, `aria-haspopup`, `aria-expanded`, the
    click and the keydown all belong to the primitive, and a caller that spread them first would
    silently take over the contract. `aria-label`, `title` and `disabled` are this file's, and they
    survive that spread because the primitive OMITS them: an `undefined`-valued key would remove
    the name Svelte's `set_attributes` found on the element, and a `disabled: false` key would
    re-enable a trigger a caller had disabled mid-save.

    THE ROW CONTENT is a 34px image tile and a name, drawn from an `option` snippet. The primitive
    owns the row ELEMENT — its `id`, its `tabindex`, its `data-keyboard-focus`, its ARIA, its
    click and the keyboard cursor's marker — which is the whole point of the re-platform: the
    focus model is written once, in one component, for every picker in the product.

    THE ROW MEASUREMENT, handed to the primitive as `measureListMetrics`. The primitive floors the
    list to a WHOLE number of rows, but only a caller can say how tall a row is: the 44px tile and
    its 6px pitch are this file's own sheet rules. Measured from the rendered box rather than
    restated, and without it the grid fills the panel and slices its last row of bordered tiles
    against the bottom inset.

    THE CLASS FAMILY. `essence-source-*` is addressed by `styles/fabricate.css`, by
    `tests/components/overlay-portal-host-position.test.js`, by the manager's own mounted suites
    and by this component's own suite, so the families ride onto the primitive's elements through
    `pickerClass` / `popoverClass` / `searchClass` / `listClass` / `optionClass` rather than being
    renamed. A rename would edit ~30 assertions to change nothing a GM sees.

  Props:
    value    — the stored source component (`{ id, name, img }`) or null. Its `id` is what the
               primitive marks with `aria-selected`; passing the object itself would mark nothing.
    items    — the managed components to choose from (`{ id, name, img }`), mapped onto the
               primitive's `{ id, label, img }` row shape.
    disabled — refuses the drop, the click and the clear. Owned HERE rather than passed through the
               spread; see the trigger note above.
    onDrop / onSelect / onClear — the three things a GM can do to a source.
-->
<script>
  import SearchablePopover from './SearchablePopover.svelte';
  import { dragDrop } from '../actions/dragDrop.js';
  import { localize } from '../util/foundryBridge.js';
  import { MANAGER_SCROLLER_SELECTOR } from '../util/overlayBounds.js';

  // THE PANEL IS A TWO-COLUMN GRID, and the key map has to know it (issue 1503). The count is the
  // one `styles/fabricate.css` draws on `.fabricate-source-picker-popover
  // .essence-source-picker-grid`, and it is what makes ArrowDown step DOWN the column the GM is
  // reading rather than sideways to the item beside it — and what gives ArrowLeft/ArrowRight a
  // meaning at all. The primitive emits it as `data-picker-columns` on the list rather than as an
  // inline style, because `anchoredPopover` rewrites that element's whole `style` attribute on
  // every measure. The two are a mirror, so `essence-source-selector-keyboard-mounted.test.js`
  // derives the count from the sheet and measures the cursor's real step against it.
  const GRID_COLUMNS = 2;

  let {
    value = null,
    items = [],
    // Refuses the drop, the click and the clear. It is NOT passed through to the primitive: it
    // lives on this file's own trigger button, where the browser refuses the click outright, and
    // the primitive OMITS its own `disabled` from the spread so this one cannot be overridden.
    // Passing it through as well would work — the primitive's docs record that shape — but it
    // would move the invariant out of the primitive and into every future snippet caller's memory.
    disabled = false,
    // The clipping boundary the popover is clamped inside — see `IconPicker`, which takes the
    // same prop for the same reason: the selector is a value, not a shared component's business.
    // It is passed THROUGH to the primitive, whose own default is the wider picker walk; adopting
    // that walk instead would be a silent geometry change on both callers.
    bounds = MANAGER_SCROLLER_SELECTOR,
    onDrop = () => {},
    onSelect = () => {},
    onClear = () => {},
  } = $props();

  // The primitive's row shape. `label` rather than `name` is not a rename for its own sake: the
  // primitive filters, titles and marks a row by `label`, so a row that kept `name` would search
  // as an empty string and title itself as `undefined`.
  const sourceOptions = $derived(
    items.map((item) => ({ id: item?.id, label: item?.name || '', img: item?.img }))
  );

  const triggerLabel = $derived(
    value?.name
      ? `${localize('FABRICATE.Admin.Features.Essences.ChangeSourceItem')}: ${value.name}`
      : localize('FABRICATE.Admin.Features.Essences.DropOrPickSourceItem')
  );

  /**
   * The row pitch and the popover chrome the whole-row flooring needs (issue 1503).
   *
   * WITHOUT THIS THE GRID SIMPLY FILLS THE PANEL, and the panel's height comes from the viewport
   * — so the last visible row is sliced at whatever pixel the budget ran out on, hard against the
   * panel's bottom inset. On a grid of BORDERED tiles that reads worst of all: half a border box
   * with its bottom edge missing looks like a rendering fault rather than like "more below".
   * `SearchablePopover` has offered the seam since this component was re-platformed onto it, and
   * a caller that measures nothing gets `listMaxHeight: null` and the old fill behaviour.
   *
   * Every figure is MEASURED from the rendered box rather than restated here, for the same reason
   * the sibling icon picker measures its own: the row's height is a sheet rule and the gaps are
   * tokens, so a number written here would be a second copy free to drift from the stylesheet.
   * The row is read through the caller's own option class, which rides onto the primitive's row
   * element, because that is the element the sheet gives the 44px floor and the border to.
   *
   * `listExtra` is 0 and stated rather than omitted: it is height rendered INSIDE the list that no
   * pitch can see, which for the icon picker is the outer margin under its pinned resolved row.
   * This panel pins nothing — every tile is an ordinary option — so there is none, and saying so
   * is what stops a future reader assuming the key was forgotten.
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

<!-- `fabricate-source-picker` / `fabricate-source-picker-popover` are this picker's own NAMESPACE
     roots (issue 1470): one on the element the primitive owns, one on the panel it portals out of
     it. They ride onto the primitive's two elements beside its own `fabricate-picker` /
     `fabricate-picker-popover`, which is what keeps every `.fabricate-source-picker …` rule in
     `styles/fabricate.css` resolving after the re-platform. -->
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
      <!-- `{...attributes}` LAST, and the three attributes above it are this file's own. The
           spread can add but never subtract: it carries no `class`, no `disabled` and no
           `aria-disabled`, so the accessible name and the refusal written here are what render. -->
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

  <!-- The row's SOLE content, which is what the primitive renders inside its own row button when
       an `option` snippet is supplied. The trailing `<span>` is load-bearing as the LAST child:
       `styles/fabricate.css` ellipsises the name through `.essence-source-picker-option span`. -->
  {#snippet option(item)}
    <img src={item.img || 'icons/svg/item-bag.svg'} alt="" />
    <span>{item.label}</span>
  {/snippet}
</SearchablePopover>
