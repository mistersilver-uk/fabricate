<!--
  THE app's searchable popover picker: a trigger, a portaled panel, an optional query field and a
  `role="listbox"` of options. The panel is portaled to the nearest Fabricate application root
  (`util/overlayHost.js`), positioned with `computeIconPickerPopoverLayout`, and dismissed on outside
  click or Escape, with itself registered as an additional "inside" node.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` | `[{ id, label, icon?, img?, meta?, trailing?, trailingIcon?, addMarker?, dataId?, data?, class?, disabled?, disabledReason?, group? }]` | `[]` | The caller builds the WHOLE list, any leading "special" option included. Every key that stamps an attribute is spread FIRST, so it can never override this component's own `type`, `role`, `aria-selected` or `onclick`. `dataId` and `data` are the singular and general forms of one hook, kept separate because a converted menu usually carries two hooks per row. `meta` promotes the row to two lines, both inside the button and so both in its accessible name. |
  | `option.disabled` / `option.disabledReason` | boolean / string | — | The row is gated with `aria-disabled`, NOT a native `disabled`: the rows are already `tabindex="-1"` and the holder owns focus, so the native attribute would only remove the row from the accessibility tree — exactly where its reason has to be announced from. The reason renders inside the button, and only for a gated row. |
  | `optionGroups` | `[{ id, label }]` | `[]` | Buckets the options by `option.group` under ARIA `role="group"` headings. Ungrouped and unknown-group options render last without a heading, and a group whose options all filter out disappears. |
  | `value` | option id, or an ARRAY of ids in `multiple` mode | `''` | One prop rather than two, because a picker has one selection whichever cardinality it has. The scalar path is a BRANCH rather than a normalization: coercing into a set would change the answer for an option whose `id` is `''`. |
  | `multiple` / `stayOpen` / `disabled` | booleans | `false` | `multiple` turns on THREE things at once, because a panel with any two of them lies about itself: `aria-selected` by membership, `aria-multiselectable` on the listbox, and the panel staying open across choices. `stayOpen` is that last gate ALONE — `multiple` implies it and it does not imply `multiple`. `disabled` is a native disabled trigger that refuses to open. |
  | `triggerClass` / `valueClass` / `pickerClass` / `popoverClass` / `searchClass` / `listClass` / `optionClass` | class strings | `''` | Extra classes beside this component's own, so an adopting picker keeps the class family its mounted suites, the View Lab registry and the smoke already address. `option.class` is appended AFTER `optionClass`, being a fact about the DATA rather than the caller's plumbing. |
  | `triggerChip` / `triggerButton` | boolean / `{ role, size, fullWidth }` or `null` | `false` / `null` | Render the trigger through `Chip` or through `ManagerButton`, in that primitive's own prop names. A chip is only a chip when it renders through that component, because its scale lives in its scoped block. |
  | `triggerIcon` / `triggerImg` / `triggerLabel` / `triggerMeta` / `showChevron` | strings / boolean | `''` / `true` | The bare trigger's leading glyph, portrait, current-selection text, second line, and open/closed chevron. |
  | `showSearch` | boolean | `true` | Render the query field. With it off, `search` stays `''`, the filter degrades to the full list, and the TRIGGER becomes the focus holder. |
  | `inlineSearchTrigger` / `inlineCloseLabel` | boolean / string | `false` / `''` | The trigger REPLACES ITSELF with the query field while open and the panel's search row is suppressed, so there is exactly one query in exactly one field; it wins over every trigger form while open. |
  | `popoverTitle` / `showFilteredCount` / `filteredCountTemplate` / `compactOptionRows` | string / boolean / template / boolean | `''` / `false` / `'{matched} of {total}'` / `false` | The shared panel header — the caller supplies the template so its words stay localized, while this primitive owns the live numbers because it owns the query — and the dense full-width presentation as a WHOLE: the 5px frame, bordered rows with a 24px leading tile, an accent fill on the current value, and the 30px bordered search field. |
  | `as` / `columns` | `'list'` \| `'grid'` / integer | `'list'` / `1` | The list's FORM and a grid's cells per row, EMITTED as `data-picker-as`/`data-picker-columns` and never as an inline style, because `anchoredPopover` rewrites the list's whole `style` attribute on every measure. `columns` also re-maps the cursor. |
  | `trigger` | snippet `{ attributes, open }` | `undefined` | REPLACES this component's trigger button; the caller spreads `attributes` onto its own element LAST, names and titles the button itself, passes neither `triggerAriaLabel` nor `triggerTitle`, and gets `triggerClass` as a declared no-op. See the spread invariant. |
  | `option` | snippet `(option)` | `undefined` | Draws the row's CONTENT while this component keeps the row ELEMENT. When supplied it is the row's SOLE content — no `Chip`, no trailing marker, no label span — because a picker's suite reads its row label with `span:last-child`. |
  | `header` / `footer` | snippets | `undefined` | Caller-owned content above and below the list. `header` is rendered with `(matched, total)`, because a caller counting its own `options` computes a number that cannot change while the list shrinks. |
  | `maxHeight` / `minWidth` / `maxWidth` | px | `0` / `240` / `340` | The panel's size band; `0` takes the layout's own value. |
  | `triggerAddMarker` / `triggerData` / `triggerTitle` / `triggerHasPopup` | string / attribute bag / string / `'dialog'` \| `'listbox'` | `''` / `{}` / `''` / `'dialog'` | Stable hooks and a native tooltip stamped on the trigger button itself rather than on a wrapper, plus what activating it opens. `triggerData` is spread FIRST, so it can never override this component's `type`, `onclick` or ARIA contract; and `'listbox'` is passed ONLY with `showSearch={false}` and WHENEVER `showSearch={false}`, both directions being refused at the source by `tests/components/searchable-popover-source-contract.test.js`, which also holds the two `trigger`-snippet refusals above. |
  | `triggerAriaDisabled` | boolean | `false` | Render `aria-disabled="true"` and refuse to open while leaving the trigger ENABLED and focusable. Not a synonym for `disabled`: several screen readers drop a `disabled` button from the tab order and `focus()` on one silently no-ops. The trade is that `aria-disabled` does not suppress the click, so `toggle()` must. |
  | `triggerAriaLabel` / `triggerAriaLabelledBy` / `triggerAriaDescribedBy` / `searchPlaceholder` / `searchAriaLabel` | strings and id lists | `''` | The trigger's name as a string, its name as a pointer, its description, and the query field's placeholder and name; all omitted when empty, so an absent pointer is absent rather than pointing at no element. |
  | `dialogAriaLabel` / `dialogAriaLabelledBy` | string / id list | `''` | The PANEL's name, emitted on both the `role="dialog"` and the `role="listbox"` from ONE derived value. A labelledby SUPPRESSES the label rather than joining it. |
  | `horizontalAlign` / `bounds` / `ignoreScrollWithin` | `'left'` \| `'right'` / selector, element or resolver / boolean | `'left'` / `pickerScrollerBounds` / `false` | Which of the panel's edges meets the trigger's, the clipping boundary it is clamped inside, and whether to drop viewport events that started INSIDE the panel, which is anchored to the trigger and moves with neither. A shared component must not name an area's own scroller, so the `bounds` default comes from `util/overlayBounds.js`. |
  | `emptyHint` / `emptyDetail` / `noMatchesHint` | localized strings | `''` / `''` / `FABRICATE.Common.Picker.NoMatches` | THE TWO EMPTINESSES ARE DIFFERENT FACTS. `emptyHint` is for a list that holds NOTHING and feeds `EmptyState`'s `title` slot, so it stays SHORT; `emptyDetail` feeds the `hint` slot and is suppressed with `emptyHint`. A filtered emptiness gets `noMatchesHint`. This is the OPPOSITE slot mapping from `VocabularyPanel`. |
  | `filterOptions(options, query)` | function | label-substring | Replaces this component's own filter, called with the raw options and the normalized query. IT IS CALLED ON EVERY PASS, INCLUDING AN EMPTY QUERY, and the DEFAULT short-circuits rather than the seam, so a pinned resolved row is not silently dropped. It is the only place a caller can see the query, and so the only home for alias matching and ranking; it may return NEW row objects, and its result is coerced to an array. |
  | `measureListMetrics({ popover, list, search })` / `triggerOnKeydown` | functions | `undefined` | The first returns `{ rowPitch, rowGap, chromeHeight, listExtra }` on EVERY layout pass, measured from the rendered box rather than restated from stylesheet tokens, where `listExtra` is height rendered inside the list that no pitch can see, so it is subtracted from the budget and added back to the list's height. The second is a caller keydown handler COMPOSED AFTER this component's own — a prop rather than a spread key, because in the search-suppressed shape the trigger holds the key map and an overridden `onkeydown` would delete the focus model. |
  | `open` | bindable boolean | `false` | Bind it to open the picker from something other than the trigger, or to force it shut from outside. |

  Callbacks:
  - `onChoose(id)` — the chosen option's id. COMMIT-ON-CHOOSE IS THE CALLER'S BUSINESS: the primitive
    holds no selection of its own and emits one call per click, in every mode.

  Invariants:
  - `fabricate-picker` AND `fabricate-picker-popover` ARE THE PRIMITIVE'S OWN NAMESPACE ROOTS, one on
    the trigger's root and one on the portaled panel, which escapes the first.
  - THE FOCUS MODEL, the key map, the caret-edge rules, the type-ahead and the flat-order option ids
    are the shipped instance of the listbox contract in `openspec/specs/design-system/spec.md`; the
    arithmetic and the key decision alike are `util/listboxNavigation.js`'s and
    `util/pickerOptionModel.js`'s, this component applying the intent they hand back, and
    `searchable-popover-keyboard-mounted.test.js` (43 cases) and `-capabilities-mounted` (33) pin it.
  - THE PANEL IS A PART, `SearchablePopoverPanel.svelte`, and the invariants that live inside it —
    its own chrome refusing focus above all — are stated there rather than restated here.
  - THE CURSOR CANNOT OUTLIVE THE LIST IT INDEXES, and the expiry is a READ rather than a write: the
    position is STAMPED with a generation derived from the list, where an `$effect` reset would land
    one flush late. A range clamp sits beside the stamp for a `filterOptions` seam that narrows the
    list from state the generation cannot see, and both answer with the same -1 sentinel, which is
    NOT "the first row".
  - `close()` IS NOT MERELY "HIDE THE PANEL": it clears the query, drops the type-ahead prefix and
    returns focus to the trigger, and `stayOpen` gates the WHOLE of it. That restoration waits for
    `tick()`, not a bare microtask, because in `inlineSearchTrigger` mode the trigger is unmounted
    while open. ESCAPE IS HANDLED IN ONE PLACE in every mode: `dismissOnOutsideClick` on the picker
    root registers a DOCUMENT-level capture-phase keydown, so it does not depend on the key reaching
    the portaled panel, which the inline field — a sibling of the trigger in another subtree — never
    would.
  - A `trigger` SNIPPET'S SPREAD CAN ADD, BUT NEVER SUBTRACT OR OVERRIDE, and that takes two
    omissions: `set_attributes` REMOVES an attribute whose spread value is `undefined`, so
    `attributes` omits every undefined-valued key; and `disabled`/`aria-disabled` are omitted
    entirely, because `disabled: false` is not undefined and would override a caller's own
    `disabled={true}`. `attributes` also carries ONE symbol key, a `createAttachmentKey()` entry
    handing this component the caller's trigger ELEMENT, because `bind:this` cannot cross a snippet
    boundary; it and its function are created ONCE at component scope, attachments being guarded by
    identity.
-->
<script>
  import { tick } from 'svelte';
  import { createAttachmentKey } from 'svelte/attachments';
  import Chip from './Chip.svelte';
  import ManagerButton from './ManagerButton.svelte';
  import SearchablePopoverPanel from './SearchablePopoverPanel.svelte';
  import { hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { localize } from '../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { activeOptionId, holderKeyIntent } from '../util/listboxNavigation.js';
  import { pickerScrollerBounds } from '../util/overlayBounds.js';
  import {
    activeCursorIndex,
    filteredCountLabel,
    groupedOptionBuckets,
    labelSubstringFilter,
    optionListGeneration as listGenerationOf,
    pickerEmptiness,
    renderedOptionOrder,
    selectedOptionIds,
  } from '../util/pickerOptionModel.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  function localizedText(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let {
    options = [],
    optionGroups = [],
    value = '',
    multiple = false,
    stayOpen = false,
    disabled = false,
    triggerClass = '',
    triggerChip = false,
    triggerButton = null,
    triggerIcon = '',
    triggerImg = '',
    triggerLabel = '',
    triggerMeta = '',
    valueClass = '',
    showChevron = true,
    showSearch = true,
    inlineSearchTrigger = false,
    inlineCloseLabel = '',
    popoverTitle = '',
    showFilteredCount = false,
    filteredCountTemplate = '{matched} of {total}',
    compactOptionRows = false,
    as = 'list',
    columns = 1,
    trigger = undefined,
    option: optionContent = undefined,
    header = undefined,
    footer = undefined,
    maxHeight = 0,
    popoverClass = '',
    triggerAddMarker = '',
    triggerData = {},
    triggerTitle = '',
    triggerHasPopup = 'dialog',
    triggerAriaDisabled = false,
    triggerAriaLabel = '',
    triggerAriaLabelledBy = '',
    triggerAriaDescribedBy = '',
    dialogAriaLabel = '',
    dialogAriaLabelledBy = '',
    searchPlaceholder = '',
    searchAriaLabel = '',
    emptyHint = '',
    emptyDetail = '',
    noMatchesHint = '',
    pickerClass = '',
    searchClass = '',
    listClass = '',
    optionClass = '',
    filterOptions = labelSubstringFilter,
    measureListMetrics = undefined,
    ignoreScrollWithin = false,
    triggerOnKeydown = undefined,
    horizontalAlign = 'left',
    minWidth = 240,
    maxWidth = 340,
    bounds = pickerScrollerBounds,
    open = $bindable(false),
    onChoose = () => {},
  } = $props();

  const instanceId = $props.id();
  const listId = `${instanceId}-listbox`;

  let search = $state('');
  let cursor = $state({ generation: '', index: -1 });
  let typeAheadBuffer = $state(null);
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerElement = $state(null);
  let searchInput = $state(null);

  const normalizedSearch = $derived(search.trim().toLowerCase());
  const filteredOptions = $derived.by(() => {
    const rows = filterOptions(options, normalizedSearch);
    return Array.isArray(rows) ? rows : [];
  });

  const isGrid = $derived(as === 'grid');
  const gridColumns = $derived(isGrid && Number.isInteger(columns) && columns > 1 ? columns : 1);

  const groupedOptions = $derived(groupedOptionBuckets(filteredOptions, optionGroups));
  const isGrouped = $derived(groupedOptions.length > 0);
  const renderedOptions = $derived(renderedOptionOrder(groupedOptions, filteredOptions));
  const typeAheadLabels = $derived(renderedOptions.map((option) => String(option.label ?? '')));

  function optionIsDisabled(index) {
    return Boolean(renderedOptions[index]?.disabled);
  }

  const selectedIdSet = $derived(selectedOptionIds(value, multiple));

  function optionIsSelected(option) {
    return multiple ? selectedIdSet.has(option.id) : option.id === value;
  }

  const staysOpenOnChoose = $derived(multiple || stayOpen);

  const filteredCount = $derived(
    filteredCountLabel(filteredCountTemplate, filteredOptions.length, options.length)
  );

  const noMatchesText = $derived(
    noMatchesHint || localizedText('FABRICATE.Common.Picker.NoMatches', 'No matches')
  );
  const emptiness = $derived(
    pickerEmptiness({
      total: options.length,
      matched: filteredOptions.length,
      noMatchesText,
      emptyHint,
      emptyDetail,
    })
  );
  const emptyMessage = $derived(emptiness.message);
  const emptyBody = $derived(emptiness.body);

  const optionListGeneration = $derived(
    listGenerationOf({ open, query: normalizedSearch, options })
  );

  const activeIndex = $derived(
    activeCursorIndex(cursor, optionListGeneration, renderedOptions.length)
  );

  const listRendered = $derived(open && filteredOptions.length > 0);
  const controlledListId = $derived(listRendered ? listId : undefined);
  const activeDescendantId = $derived(
    listRendered ? activeOptionId(instanceId, activeIndex) : undefined
  );

  $effect(() => {
    if (activeIndex < 0 || !popoverRoot) return;
    const active = popoverRoot.querySelector?.('[data-active-option="true"]');
    active?.scrollIntoView?.({ block: 'nearest' });
  });

  function moveCursorTo(index) {
    cursor = { generation: optionListGeneration, index };
  }

  // Every side effect the key model has lives here; which one to run is `holderKeyIntent`'s answer.
  function onHolderKeydown(event) {
    const intent = holderKeyIntent(event, {
      open,
      showSearch,
      holderDisabled: disabled || triggerAriaDisabled,
      current: activeIndex,
      count: renderedOptions.length,
      columns: gridColumns,
      isDisabled: optionIsDisabled,
      labels: typeAheadLabels,
      buffer: typeAheadBuffer,
    });
    if (intent.kind === 'pass-through') return;
    event.preventDefault();
    if (intent.kind === 'choose') {
      chooseOption(renderedOptions[intent.index]);
      return;
    }
    if (intent.kind === 'move-cursor') {
      moveCursorTo(intent.index);
      return;
    }
    if (intent.kind === 'type-ahead') {
      typeAheadBuffer = intent.buffer;
      if (intent.index === null) return;
    }
    open = true;
    if (intent.index !== null) moveCursorTo(intent.index);
  }

  function restoreTriggerFocus() {
    tick().then(() => {
      const target = triggerElement ?? pickerRoot?.querySelector?.('button');
      if (target?.isConnected !== false) target?.focus?.();
    });
  }

  function close({ restoreFocus = true } = {}) {
    open = false;
    search = '';
    typeAheadBuffer = null;
    if (restoreFocus) restoreTriggerFocus();
  }

  $effect(() => {
    if (open) return;
    if (search) search = '';
    cursor = { generation: '', index: -1 };
  });

  function toggle(event) {
    event.stopPropagation();
    if (disabled || triggerAriaDisabled) return;
    if (open) {
      close({ restoreFocus: false });
      return;
    }
    open = true;
  }

  function choose(id) {
    onChoose(id);
    if (staysOpenOnChoose) return;
    close();
  }

  function chooseOption(option) {
    if (option?.disabled) return;
    choose(option.id);
  }

  function stop(event) {
    event.stopPropagation();
  }

  const FOCUSABLE_PANEL_CHROME = 'input, button, textarea, select, [href]';

  function keepFocusOnHolder(event) {
    if (!event.target?.closest?.(FOCUSABLE_PANEL_CHROME)) event.preventDefault();
  }

  function onTriggerKeydown(event) {
    if (!showSearch) onHolderKeydown(event);
    stop(event);
    triggerOnKeydown?.(event);
  }

  const dialogNameAttribute = $derived(
    dialogAriaLabelledBy ? undefined : dialogAriaLabel || undefined
  );
  const dialogNamedBy = $derived(dialogAriaLabelledBy || undefined);

  const triggerAttributes = $derived({
    ...triggerData,
    type: 'button',
    'aria-haspopup': triggerHasPopup,
    'aria-expanded': open,
    'aria-disabled': triggerAriaDisabled ? 'true' : undefined,
    disabled,
    'data-recipe-add': triggerAddMarker || undefined,
    title: triggerTitle || undefined,
    'aria-label': triggerAriaLabel || undefined,
    'aria-labelledby': triggerAriaLabelledBy || undefined,
    'aria-describedby': triggerAriaDescribedBy || undefined,
    ...(showSearch
      ? {}
      : {
          role: 'combobox',
          'aria-controls': controlledListId,
          'aria-activedescendant': activeDescendantId,
          'data-keyboard-focus': 'true',
        }),
    onclick: toggle,
    onkeydown: onTriggerKeydown,
  });

  const CALLER_OWNED_TRIGGER_KEYS = new Set(['disabled', 'aria-disabled']);

  function spreadableTriggerAttributes(attributes) {
    const spreadable = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || CALLER_OWNED_TRIGGER_KEYS.has(key)) continue;
      spreadable[key] = value;
    }
    return spreadable;
  }

  const triggerElementKey = createAttachmentKey();

  function captureTrigger(node) {
    triggerElement = node;
    return () => {
      triggerElement = null;
    };
  }

  const triggerSnippetAttributes = $derived({
    ...spreadableTriggerAttributes(triggerAttributes),
    [triggerElementKey]: captureTrigger,
  });

  const searchFieldAttributes = $derived({
    type: 'text',
    role: 'combobox',
    'aria-expanded': open,
    'aria-controls': controlledListId,
    'aria-activedescendant': activeDescendantId,
    placeholder: searchPlaceholder,
    'aria-label': searchAriaLabel || undefined,
    onkeydown: onHolderKeydown,
  });

  $effect(() => {
    if (!open || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });
</script>

<div
  class={`fabricate-picker manager-travel-picker ${pickerClass}`}
  bind:this={pickerRoot}
  use:dismissOnOutsideClick={{
    enabled: open,
    onDismiss: () => close(),
    additionalNodes: () => [popoverRoot],
  }}
>
  {#snippet triggerBody()}
    {#if triggerImg}<span class="manager-travel-portrait" aria-hidden="true"
        ><img src={triggerImg} alt="" /></span
      >{:else if triggerIcon}<i class={triggerIcon} aria-hidden="true"></i>{/if}
    {#if triggerMeta}<span class="manager-travel-picker-copy"
        ><span class={`manager-travel-picker-value ${valueClass}`}>{triggerLabel}</span><span
          class="manager-travel-picker-meta"
          data-popover-trigger-meta>{triggerMeta}</span
        ></span
      >{:else if triggerLabel}<span class={`manager-travel-picker-value ${valueClass}`}
        >{triggerLabel}</span
      >{/if}
    {#if showChevron}<i
        class={open ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
        aria-hidden="true"
      ></i>{/if}
  {/snippet}

  {#if inlineSearchTrigger && open}
    <div class="manager-travel-picker-inline">
      <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
      <input bind:this={searchInput} bind:value={search} {...searchFieldAttributes} />
      <button
        type="button"
        class="manager-travel-picker-inline-close"
        aria-label={inlineCloseLabel || undefined}
        title={inlineCloseLabel || undefined}
        onclick={() => close()}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
  {:else if trigger}
    {@render trigger({ attributes: triggerSnippetAttributes, open })}
  {:else if triggerChip}
    <Chip tag="button" bind:element={triggerElement} class={triggerClass} {...triggerAttributes}
      >{@render triggerBody()}</Chip
    >
  {:else if triggerButton}
    <ManagerButton
      bind:element={triggerElement}
      {...triggerAttributes}
      role={triggerButton.role ?? 'neutral'}
      size={triggerButton.size ?? ''}
      fullWidth={triggerButton.fullWidth ?? false}
      class={triggerClass}>{@render triggerBody()}</ManagerButton
    >
  {:else}
    <button bind:this={triggerElement} class={triggerClass} {...triggerAttributes}>
      {@render triggerBody()}
    </button>
  {/if}

  {#if open}
    <SearchablePopoverPanel
      bind:popover={popoverRoot}
      bind:search={searchInput}
      bind:query={search}
      anchor={triggerElement ?? pickerRoot}
      {popoverLayout}
      {popoverClass}
      {compactOptionRows}
      {dialogNameAttribute}
      {dialogNamedBy}
      {horizontalAlign}
      {minWidth}
      {maxWidth}
      {maxHeight}
      {bounds}
      {ignoreScrollWithin}
      {measureListMetrics}
      {popoverTitle}
      {showFilteredCount}
      {filteredCount}
      {showSearch}
      {inlineSearchTrigger}
      {searchClass}
      {searchFieldAttributes}
      {filteredOptions}
      totalCount={options.length}
      {groupedOptions}
      {isGrouped}
      {renderedOptions}
      {listId}
      {listClass}
      {multiple}
      {as}
      {isGrid}
      {gridColumns}
      {optionClass}
      option={optionContent}
      {instanceId}
      {activeIndex}
      {emptyMessage}
      {emptyBody}
      {header}
      {footer}
      {chooseOption}
      {optionIsSelected}
      {close}
      {stop}
      {keepFocusOnHolder}
    />
  {/if}
</div>

<style>
  .manager-travel-picker-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    text-align: left;
  }

  .manager-travel-picker-meta {
    min-width: 0;
    margin-top: var(--fab-space-2xs);
    overflow: hidden;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.6rem;
    font-weight: 400;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
