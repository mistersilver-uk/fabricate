<!-- Svelte 5 runes mode -->
<script>
  import { anchoredPopover, hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { dragDrop } from '../actions/dragDrop.js';
  import { localize } from '../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { activeOptionId, nextActiveIndex } from '../util/listboxNavigation.js';
  import { MANAGER_SCROLLER_SELECTOR } from '../util/overlayBounds.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  // THE PANEL IS A TWO-COLUMN GRID, and the key map has to know it (issue 1503). The count is the
  // one `styles/fabricate.css` draws on `.fabricate-source-picker-popover
  // .essence-source-picker-grid`, and it is what makes ArrowDown step DOWN the column the GM is
  // reading rather than sideways to the item beside it — and what gives ArrowLeft/ArrowRight a
  // meaning at all. The two are a mirror, so `essence-source-selector-keyboard-mounted.test.js`
  // derives the count from the sheet and measures the cursor's real step against it.
  const GRID_COLUMNS = 2;

  let {
    value = null,
    items = [],
    disabled = false,
    // The clipping boundary the popover is clamped inside — see `IconPicker`, which takes the
    // same prop for the same reason: the selector is a value, not a shared component's business.
    bounds = MANAGER_SCROLLER_SELECTOR,
    onDrop = () => {},
    onSelect = () => {},
    onClear = () => {},
  } = $props();

  // A PER-INSTANCE PREFIX for the option `id`s (issue 1503). `aria-activedescendant` points at a
  // DOM id, so the ids have to be unique document-wide rather than merely within one panel: two
  // pickers open on the same screen, both numbering their rows from 0, would emit the same id and
  // make the reference ambiguous. `$props.id()` is Svelte's own answer to exactly this.
  const instanceId = $props.id();
  const listId = `${instanceId}-listbox`;

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  // THE KEYBOARD CURSOR, and -1 is not "the first item". It means the GM has opened the panel and
  // not yet pressed an arrow key, which is a different state from "the first item is active": no
  // tile carries the marker, and Enter is a NO-OP rather than a blind choice of whatever the
  // world happens to sort first. See `util/listboxNavigation.js`.
  let activeIndex = $state(-1);
  let selectorRoot = $state(null);
  let triggerButton = $state(null);
  let popoverRoot = $state(null);
  let searchInput = $state(null);

  const filteredItems = $derived.by(() => {
    const query = String(searchTerm || '')
      .trim()
      .toLowerCase();
    if (!query) return items;
    return items.filter((item) =>
      String(item?.name || '')
        .toLowerCase()
        .includes(query)
    );
  });

  // ── THE LISTBOX FOCUS MODEL (issue 1503) ──────────────────────────────────────────────────
  //
  // `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element —
  // the HOLDER — and drive selection with `aria-activedescendant`. Here the holder is the query
  // field, which is rendered for the panel's whole life, and the tiles NEVER receive DOM focus.
  // Roving focus onto them is what the prohibition forbids, because it re-arms Foundry's canvas
  // bindings — and there is a second, independent reason: `styles/fabricate.css` rings any focused
  // `[tabindex]` under `.fabricate` with a 2px accent outline at a POSITIVE offset, and every tile
  // is now a `[tabindex]` element, so one that took focus would draw a competing ring around the
  // keyboard cursor's own inset one.
  //
  // The cursor is indexed over `filteredItems`, which IS the rendered order: this panel has one
  // branch and no pinned row.
  const activeDescendantId = $derived(
    activeIndex >= 0 && activeIndex < filteredItems.length
      ? activeOptionId(instanceId, activeIndex)
      : undefined
  );

  // A CURSOR CANNOT OUTLIVE THE LIST IT INDEXES, and two independent inputs rebuild that list:
  // opening starts a fresh pass over the world's components, and every query keystroke rebuilds
  // `filteredItems` — so index 3 names an unrelated item the moment either moves. Resetting to -1
  // rather than clamping is the point: the GM has not arrowed into the NEW list, so nothing in it
  // is active and Enter stays a no-op until they do.
  const optionListGeneration = $derived(`${pickerOpen ? 'open' : 'closed'}/${searchTerm}`);
  let cursorGeneration = '';
  $effect(() => {
    if (cursorGeneration === optionListGeneration) return;
    cursorGeneration = optionListGeneration;
    activeIndex = -1;
  });

  const triggerLabel = $derived(
    value?.name
      ? `${localize('FABRICATE.Admin.Features.Essences.ChangeSourceItem')}: ${value.name}`
      : localize('FABRICATE.Admin.Features.Essences.DropOrPickSourceItem')
  );

  function closePicker() {
    pickerOpen = false;
    searchTerm = '';
    // FOCUS COMES BACK TO THE TRIGGER (issue 1503). The element it is on — the query field — is
    // about to be unmounted, and an unmounted focus owner leaves `document.activeElement` on
    // `<body>`, so the GM's next Tab restarts from the top of the sheet. The move is synchronous
    // and needs no `tick()`: this trigger is rendered for the component's whole life, so it is
    // already there to receive focus.
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

  function selectItem(itemId) {
    onSelect?.(itemId);
    closePicker();
  }

  // THE KEY MAP, on the holder. `nextActiveIndex` owns the arithmetic — including the grid's two
  // axes — and this owns the wiring: which keys are CONSUMED and what Enter chooses. A key the
  // module does not own returns `null` and is left entirely alone, which is what keeps every
  // printable character going to the query field. Escape is not handled here:
  // `dismissOnOutsideClick` on the selector root takes it at the document's capture phase.
  function onHolderKeydown(event) {
    if (event.key === 'Enter') {
      // Enter WITHOUT an active tile is a no-op rather than a choice of the first one, so it is
      // left unprevented and reaches the field it was pressed in.
      const active = filteredItems[activeIndex];
      if (!active) return;
      event.preventDefault();
      selectItem(active.id);
      return;
    }
    const next = nextActiveIndex(activeIndex, filteredItems.length, event.key, {
      columns: GRID_COLUMNS,
    });
    if (next === null) return;
    event.preventDefault();
    activeIndex = next;
  }

  function clearItem(event) {
    event.preventDefault();
    event.stopPropagation();
    onClear?.();
  }

  $effect(() => {
    if (!pickerOpen || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });

  // KEEP THE CURSOR IN VIEW. The grid scrolls, so the tile the GM has arrowed to can be outside
  // its window, and because nothing is FOCUSED the browser will not scroll to it on its own. The
  // call is optional because happy-dom's element does not implement `scrollIntoView`, and a bare
  // call would throw in every mounted suite that opens this panel.
  $effect(() => {
    if (activeIndex < 0 || !popoverRoot) return;
    popoverRoot.querySelector?.('[data-active-option="true"]')?.scrollIntoView?.({
      block: 'nearest',
    });
  });
</script>

<!-- `fabricate-source-picker` / `fabricate-source-picker-popover` are this primitive's own NAMESPACE
     roots (issue 1470): one on the element it owns, one on the panel it portals out of it. See
     `IconPicker` for the reasoning; the two components share every rule in the sheet. -->
<div
  bind:this={selectorRoot}
  class="fabricate-source-picker essence-source-selector"
  use:dismissOnOutsideClick={{
    enabled: pickerOpen,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot],
  }}
>
  <div
    class="essence-source-selector-shell"
    use:dragDrop={{ onDrop, disabled, activeClass: 'drop-active' }}
  >
    <button
      type="button"
      bind:this={triggerButton}
      class="essence-source-trigger"
      class:has-value={!!value}
      onclick={togglePicker}
      {disabled}
      aria-expanded={pickerOpen}
      aria-haspopup="dialog"
      aria-label={triggerLabel}
      title={triggerLabel}
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
        <i class={`fas ${pickerOpen ? 'fa-chevron-up' : 'fa-search'}`}></i>
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

  {#if pickerOpen}
    <div
      bind:this={popoverRoot}
      class="fabricate-source-picker-popover essence-source-picker-popover"
      role="dialog"
      aria-label={localize('FABRICATE.Admin.Features.Essences.SourcePickerLabel')}
      use:anchoredPopover={{
        component: 'EssenceSourceSelector',
        trigger: triggerButton,
        layout: popoverLayout,
        layoutOptions: () => ({ horizontalAlign: 'left', minWidth: 280, maxWidth: 420 }),
        bounds,
      }}
    >
      <div class="essence-source-picker-search">
        <!-- The HOLDER. It keeps DOM focus for the panel's whole life and announces the tile the
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
          placeholder={localize('FABRICATE.Admin.Features.Essences.SearchSourcePlaceholder')}
          aria-label={localize('FABRICATE.Admin.Features.Essences.SearchSourceLabel')}
          onkeydown={onHolderKeydown}
        />
      </div>

      <div
        class="essence-source-picker-grid"
        role="listbox"
        id={listId}
        aria-label={localize('FABRICATE.Admin.Features.Essences.SourcePickerLabel')}
      >
        {#each filteredItems as option, index (option.id)}
          <button
            type="button"
            class="essence-source-picker-option"
            class:selected={option.id === value?.id}
            role="option"
            id={activeOptionId(instanceId, index)}
            tabindex="-1"
            data-keyboard-focus="true"
            aria-selected={option.id === value?.id}
            data-active-option={index === activeIndex ? 'true' : undefined}
            title={option.name}
            onclick={() => selectItem(option.id)}
            onmousedown={(event) => event.preventDefault()}
          >
            <img src={option.img || 'icons/svg/item-bag.svg'} alt="" />
            <span>{option.name}</span>
          </button>
        {:else}
          <p class="hint essence-source-picker-empty">
            {localize(
              items.length > 0
                ? 'FABRICATE.Admin.Features.Essences.NoMatchingComponents'
                : 'FABRICATE.Admin.Features.Essences.NoComponentsAvailable'
            )}
          </p>
        {/each}
      </div>
    </div>
  {/if}
</div>
