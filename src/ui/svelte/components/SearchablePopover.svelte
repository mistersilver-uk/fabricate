<!--
  THE app's searchable popover picker: a trigger, a portaled panel, an optional query field and a
  `role="listbox"` of options. Twenty-odd surfaces render through it and it absorbed ten hand-rolled
  popovers, so a control of this shape is routed here rather than rebuilt. The panel is portaled to
  the nearest Fabricate application root (`util/overlayHost.js`) so it escapes the `overflow: hidden`
  manager panel, positioned with `computeIconPickerPopoverLayout`, and dismissed on outside click or
  Escape — the portaled panel is registered as an additional "inside" node.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` | `[{ id, label, icon?, img?, meta?, trailing?, trailingIcon?, addMarker?, dataId?, data?, class?, disabled?, disabledReason?, group? }]` | `[]` | The caller builds the WHOLE list, any leading "special" option included. EVERY key that stamps an attribute is spread FIRST, so it can never override this component's own `type`, `role`, `aria-selected` or `onclick`. `dataId` and `data` are the singular and general forms of one hook, kept separate because a converted hand-rolled menu usually carries TWO hooks per row and folding either into the other would rename a hook a mounted suite, a source-contract pin and a sibling element all share. `meta` promotes the row to TWO LINES, for a picker whose choices differ by a FACT rather than by a name; both lines are inside the button, so both are in its accessible name. |
  | `option.disabled` / `option.disabledReason` | boolean / string | — | The row is gated with `aria-disabled`, NOT a native `disabled`: the rows are already `tabindex="-1"` and the HOLDER owns focus, so the only thing the native attribute would add is removing the row from the accessibility tree — exactly where its reason has to be announced from. `library.html:661` states it in one line: opacity alone is not a reason. The reason renders INSIDE the button, and therefore inside its accessible name, and ONLY for a gated row, because a reason on an available row is a lie. |
  | `optionGroups` | `[{ id, label }]` | `[]` | Buckets the options by `option.group`, each under its own heading as an ARIA `role="group"`. Ungrouped and unknown-group options render last, without a heading; a group whose options all filter out disappears. |
  | `value` | option id, or an ARRAY of ids in `multiple` mode | `''` | One prop rather than two, because a picker has one selection whichever cardinality it has. THE SCALAR PATH IS LITERALLY THE OLD EXPRESSION, a branch rather than a normalization: coercing `value` into a set would change the answer for an option whose `id` is `''`. |
  | `multiple` | boolean | `false` | Multi-select. It turns on THREE things at once, because a panel with any two of them lies about itself: `aria-selected` by MEMBERSHIP rather than equality, `aria-multiselectable="true"` on the listbox, and the panel staying open across choices. |
  | `stayOpen` | boolean | `false` | Do not close on choose — the gate ALONE. `multiple` implies it; it does NOT imply `multiple`, because a picker whose chosen option LEAVES the option set has nothing to mark, and announcing `aria-multiselectable` over an empty selection model is the same class of lie. |
  | `disabled` | boolean | `false` | Native disabled trigger; refuses to open. |
  | `triggerClass` / `valueClass` / `pickerClass` / `popoverClass` / `searchClass` / `listClass` / `optionClass` | class strings | `''` | Extra classes on the trigger, the value span, the picker root, the portaled panel, the search ROW, the listbox and every option row, beside this component's own. They are how an adopting picker keeps the class family its mounted suites, the View Lab registry and the Foundry smoke already address. An individual row may carry `option.class` too, appended AFTER `optionClass` — a fact about the DATA rather than the caller's plumbing. |
  | `triggerChip` | boolean | `false` | Render the trigger through `Chip` rather than a bare `<button>`. A chip is only a chip when it renders through that component: its scale lives in its scoped block, which a class name handed to a button here can never reach. |
  | `triggerButton` | `{ role, size, fullWidth }` or `null` | `null` | Render the trigger through `ManagerButton`, in that primitive's own prop names. Any object turns the form on. |
  | `triggerIcon` / `triggerImg` / `triggerLabel` / `triggerMeta` | strings | `''` | The bare trigger's leading glyph, leading portrait, current-selection text and a SECOND line under it. `triggerMeta` is the trigger-side twin of an option's `meta`; both lines are inside the button, so both are in its accessible name. |
  | `showChevron` | boolean | `true` | The open/closed chevron on the trigger. |
  | `showSearch` | boolean | `true` | Render the query field. With it off, `search` stays `''` and the filter and autofocus effect degrade to the full list. It also decides which element is the focus HOLDER. |
  | `inlineSearchTrigger` | boolean | `false` | The trigger REPLACES ITSELF with the query field while open, and the panel's own search row is suppressed: there is exactly one query and it lives in exactly one field. It wins over every trigger form while the panel is open. |
  | `inlineCloseLabel` | string | `''` | The inline field's close control's name. |
  | `popoverTitle` / `showFilteredCount` / `filteredCountTemplate` | string / boolean / template | `''` / `false` / `'{matched} of {total}'` | The shared panel header: a title top-left and a live count top-right. The caller supplies the template so its words stay localized, while this primitive owns the live numbers because it owns the query. |
  | `compactOptionRows` | boolean | `false` | The dense full-width presentation as a WHOLE: the 5px frame, bordered rows with a 24px leading tile, an accent fill on the current value, and the 30px bordered search field. |
  | `as` / `columns` | `'list'` \| `'grid'` / integer | `'list'` / `1` | The list's FORM and a grid's cells per row. Both are EMITTED as `data-picker-as`/`data-picker-columns`, never as an inline style: `anchoredPopover` writes the list's WHOLE `style` attribute on every measure, so a template riding an inline style would be erased the first time the panel repositioned. `columns` also re-maps the cursor, so a caller that draws two columns in CSS and forgets the prop gets a cursor that disagrees with what the GM can see. |
  | `trigger` | snippet `{ attributes, open }` | `undefined` | REPLACES this component's own trigger button; the caller writes its own element and spreads `attributes` onto it LAST. A snippet caller NAMES AND TITLES THE BUTTON IN THE SNIPPET and passes neither `triggerAriaLabel` nor `triggerTitle`, and `triggerClass` becomes a declared NO-OP. See the invariants for what the spread may and may not do. |
  | `option` | snippet `(option)` | `undefined` | Draws the row's CONTENT while this component keeps owning the row ELEMENT. When supplied it is the row's SOLE content: no `Chip`, no trailing marker, no label span — a picker's own suite reads its row label with `span:last-child`, so a trailing element appended after the caller's content would silently retarget every such reader onto the marker. |
  | `header` / `footer` | snippets | `undefined` | Caller-owned content above and below the list; the standard title/count header should use the shared props instead. `header` is rendered with `(matched, total)`, because the query lives in this component's state and a caller counting its own `options` computes a number that cannot change while the list shrinks. |
  | `maxHeight` / `minWidth` / `maxWidth` | px | `0` / `240` / `340` | The panel's size band; `maxHeight: 0` takes the layout's own value. |
  | `triggerAddMarker` / `triggerData` | string / `{ 'data-x': 'value' }` | `''` / `{}` | Stable hooks stamped on the trigger button itself, rather than on a wrapper that would move the hook off the control it names. `triggerData` is spread FIRST, so it can never override this component's `type`, `onclick` or ARIA contract. |
  | `triggerTitle` | string | `''` | Native `title` tooltip; omitted when empty. |
  | `triggerHasPopup` | `'dialog'` \| `'listbox'` | `'dialog'` | What activating the trigger opens. Pass `'listbox'` ONLY with `showSearch={false}` and WHENEVER `showSearch={false}` — one rule read from either end, since with a field the panel genuinely IS a dialog containing a listbox and without one it IS a bare listbox. Both directions are refused at the source by `tests/components/searchable-popover-source-contract.test.js`, which also holds the two `trigger`-snippet refusals above. |
  | `triggerAriaDisabled` | boolean | `false` | Render `aria-disabled="true"` and refuse to open, while leaving the trigger ENABLED and focusable. NOT a synonym for `disabled`, and the difference is a defect rather than a preference: several screen readers drop a `disabled` button from the tab order, so a capped control is tabbed past even though its own `aria-describedby` explains the cap, and `focus()` on a disabled button silently no-ops and drops the keyboard user to `<body>`. The trade is that `aria-disabled` does not suppress the click, so `toggle()` must. |
  | `triggerAriaLabel` / `triggerAriaLabelledBy` / `triggerAriaDescribedBy` | string / id list / id list | `''` | The trigger's name as a STRING, its name as a POINTER, and its description. All omitted when empty, so an absent pointer is absent rather than pointing at no element. |
  | `dialogAriaLabel` / `dialogAriaLabelledBy` | string / id list | `''` | The PANEL's name, emitted on both the `role="dialog"` and the `role="listbox"` inside it from ONE derived value, so the two cannot take different names. A labelledby SUPPRESSES the label rather than joining it. |
  | `searchPlaceholder` / `searchAriaLabel` | localized strings | `''` | The query field's placeholder and name. |
  | `emptyHint` / `emptyDetail` / `noMatchesHint` | localized strings | `''` / `''` / `FABRICATE.Common.Picker.NoMatches` | THE TWO EMPTINESSES ARE DIFFERENT FACTS, and `spec.md` requires an empty state to distinguish them. `emptyHint` is for a list that holds NOTHING and feeds `EmptyState`'s `title` slot (its `<h3>`) HERE, so it must stay SHORT — the panel renders it as one quiet line, and a sentence wraps rather than sets as a heading. `emptyDetail` feeds the `hint` slot (its `<p>`) and is suppressed with `emptyHint`, because an explanation of why a list holds nothing is false of a list that holds plenty and was searched. A filtered emptiness gets `noMatchesHint`, which defaults to the design's own words so no call site has to be edited to stop lying. This is the OPPOSITE slot mapping from `VocabularyPanel`, so read it from here rather than from the prop name. |
  | `filterOptions(options, query)` | function | label-substring | Replaces this component's own filter, called with the raw options and the normalized query and returning the rows to render, in order. IT IS CALLED ON EVERY PASS, INCLUDING AN EMPTY QUERY, and the DEFAULT short-circuits rather than the seam — a no-query behaviour such as a pinned resolved row would otherwise be silently dropped. It is also the only place a caller can see the query this component owns, and so the only place alias matching and ranking can live. A seam may return NEW row objects rather than members of `options`, and must when the caller's data carries no `id`; its result is coerced to an array, because everything below indexes it. |
  | `measureListMetrics({ popover, list, search })` | function | `undefined` | Returns `{ rowPitch, rowGap, chromeHeight, listExtra }` on EVERY layout pass. A callback rather than three numbers because the numbers are measured from the rendered box; restating stylesheet tokens here would be a second copy free to drift. `listExtra` is height rendered INSIDE the list that no pitch can see, so it is subtracted from the budget AND added back to the list's own height. A caller that passes nothing registers no secondary style target at all. |
  | `ignoreScrollWithin` | boolean | `false` | Drop viewport events that started INSIDE the panel: the panel is anchored to the trigger, and scrolling within it moves neither. |
  | `triggerOnKeydown` | function | `undefined` | A caller handler COMPOSED AFTER this component's own. A prop rather than something a caller spreads, because in the search-suppressed shape the TRIGGER is the focus holder and carries the key map, so a caller that overrode `onkeydown` through the spread would silently delete the focus model. Composed, not chained — this component acts first, and the caller sees an event that may already be prevented. |
  | `horizontalAlign` | `'left'` \| `'right'` | `'left'` | Which of the panel's edges meets the trigger's. |
  | `bounds` | selector, element, or resolver | `pickerScrollerBounds` | The clipping boundary the panel is clamped inside. A shared component must not name an area's own scroller, so the default is a value from `util/overlayBounds.js`. |
  | `open` | bindable boolean | `false` | Bind it when a surface must open the picker from something other than the trigger, or force it shut from outside. |

  Callbacks:
  - `onChoose(id)` — the chosen option's id. COMMIT-ON-CHOOSE IS THE CALLER'S BUSINESS: the
    primitive holds no selection of its own and emits one call per click, in every mode.

  Invariants:
  - `fabricate-picker` AND `fabricate-picker-popover` ARE THE PRIMITIVE'S OWN NAMESPACE ROOTS, one
    on the trigger's root and one on the portaled panel, because the panel escapes the root — so a
    popover-scoped style needs the second hook, which `pickerClass` cannot reach.
  - THE FOCUS MODEL: DOM focus stays on ONE element for the whole life of the panel — the query
    field where one is rendered, the TRIGGER where one is not — and the arrows move an
    `aria-activedescendant` cursor over rows that are `tabindex="-1"` and never focused. Roving
    focus onto rows is what `openspec/specs/design-system/spec.md` forbids, and the module focus
    ring targets any focused `[tabindex]` under `.fabricate`, so a focused row would also draw a
    second ring around the cursor's own. The arithmetic is `util/listboxNavigation.js`'s, and the
    keyboard and ARIA behaviour is pinned by `searchable-popover-keyboard-mounted.test.js` (40
    cases) and `-capabilities-mounted` (27) — read those for what each key does.
  - THE PANEL'S OWN CHROME MUST NOT TAKE FOCUS EITHER: it is `role="dialog" tabindex="-1"`, so a
    click on its inset, header or empty note would move focus off the holder and take the whole key
    map with it, invisibly, since the module ring matches `:focus-visible` only. The `mousedown`
    guard's exception list is every element with its OWN reason to take focus — the query field
    above all, plus the LIST, because a native scrollbar drag reaches the handler with the
    scrolling element as its target.
  - THE CURSOR CANNOT OUTLIVE THE LIST IT INDEXES, and the expiry is a READ rather than a write:
    the position is STAMPED with a generation derived from the list, so a stale cursor never
    renders, where a reset cleared from an `$effect` would land one flush late and the
    active-option attributes would name a position in the PREVIOUS list. A range clamp sits beside
    the stamp, for a `filterOptions` seam that narrows the list from state the generation cannot
    see. Both answer with the same -1 sentinel, which is NOT "the first row": no arrow has been
    pressed, so no row carries the marker and Enter is a NO-OP.
  - `close()` IS NOT MERELY "HIDE THE PANEL": it clears the query, drops the type-ahead prefix and
    returns focus to the trigger, and `stayOpen` gates the WHOLE of it rather than a flag inside
    it. That restoration waits for `tick()`, NOT a bare microtask: in `inlineSearchTrigger` mode
    the trigger is UNMOUNTED while open, so the element focus must return to does not exist yet.
  - ESCAPE IS HANDLED IN ONE PLACE, in every mode: `dismissOnOutsideClick` on the picker root
    registers a DOCUMENT-level capture-phase keydown, so it does not depend on the key reaching the
    portaled panel — which the inline field, a sibling of the trigger in a different subtree, never
    would. A second handler there would close an already-closed picker and restore focus twice.
  - A `trigger` SNIPPET'S SPREAD CAN ADD, BUT NEVER SUBTRACT OR OVERRIDE, and that takes TWO
    omissions. `set_attributes` REMOVES an attribute whose spread value is `undefined`, so
    `attributes` omits every undefined-valued key, or a spread-last `aria-label: undefined` would
    strip the name the caller wrote on its own button; and `disabled`/`aria-disabled` are omitted
    entirely for a snippet caller, because `disabled: false` is not undefined and WOULD override a
    caller's own `disabled={true}`. `attributes` also carries ONE symbol key, a
    `createAttachmentKey()` entry handing this component the caller's trigger ELEMENT, because
    `bind:this` cannot cross a snippet boundary. The key and its function are created ONCE at
    component scope, because attachments are guarded by identity.
-->
<script>
  import { tick } from 'svelte';
  import { createAttachmentKey } from 'svelte/attachments';
  import Chip from './Chip.svelte';
  import EmptyState from '../apps/manager/EmptyState.svelte';
  import ManagerButton from './ManagerButton.svelte';
  import { anchoredPopover, hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { localize } from '../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { activeOptionId, nextActiveIndex, typeAheadCursor } from '../util/listboxNavigation.js';
  import { pickerScrollerBounds } from '../util/overlayBounds.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  /**
   * The primitive's OWN localization, which none of its other strings need: `No matches` is a fact
   * about this control's own search box and is the same sentence at all 24 sites.
   *
   * @param {string} key
   * @param {string} fallback
   * @returns {string}
   */
  function localizedText(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /**
   * The default `filterOptions`, short-circuiting on an empty query rather than filtering with an
   * empty needle: `''` is a substring of every label, so the two agree.
   *
   * @param {Array<{label?: string}>} list The raw options.
   * @param {string} query The normalized query — trimmed and lower-cased.
   * @returns {Array<object>} The rows to render, in order.
   */
  function labelSubstringFilter(list, query) {
    if (!query) return list;
    return list.filter((option) =>
      String(option.label || '')
        .toLowerCase()
        .includes(query)
    );
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

  // A PER-INSTANCE PREFIX for the option ids: `aria-activedescendant` names a DOM id, so two
  // pickers on one screen both indexing their rows from 0 would make the reference ambiguous.
  const instanceId = $props.id();
  const listId = `${instanceId}-listbox`;

  let search = $state('');
  let cursor = $state({ generation: '', index: -1 });
  let typeAheadBuffer = $state(null);
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let optionsList = $state(null);
  // THE BINDING IS WHAT ANCHORS THE PANEL, and it also resolves the overlay HOST and the
  // clipping-bounds walk, so a form publishing no node would anchor the panel on the picker root.
  // All FOUR trigger forms write it, the `trigger` snippet through the attachment key below.
  let triggerElement = $state(null);
  let searchInput = $state(null);

  const normalizedSearch = $derived(search.trim().toLowerCase());
  const filteredOptions = $derived.by(() => {
    const rows = filterOptions(options, normalizedSearch);
    return Array.isArray(rows) ? rows : [];
  });

  const isGrid = $derived(as === 'grid');
  const gridColumns = $derived(isGrid && Number.isInteger(columns) && columns > 1 ? columns : 1);

  const groupedOptions = $derived.by(() => {
    const groups = Array.isArray(optionGroups) ? optionGroups.filter((group) => group?.id) : [];
    if (groups.length === 0) return [];
    const known = new Set(groups.map((group) => group.id));
    const buckets = groups.map((group) => ({
      id: group.id,
      label: group.label || '',
      options: filteredOptions.filter((option) => option.group === group.id),
    }));
    const ungrouped = filteredOptions.filter((option) => !known.has(option.group));
    if (ungrouped.length > 0) buckets.push({ id: '__ungrouped', label: '', options: ungrouped });
    // EACH BUCKET CARRIES ITS OFFSET in the flat rendered order, because the cursor and the option
    // ids are indexed over the CONCATENATION of the buckets. A per-`each` index would restart at 0
    // in every group, emitting duplicate DOM ids and an ambiguous `aria-activedescendant`.
    let offset = 0;
    return buckets
      .filter((bucket) => bucket.options.length > 0)
      .map((bucket) => {
        const positioned = { ...bucket, offset };
        offset += bucket.options.length;
        return positioned;
      });
  });
  const isGrouped = $derived(groupedOptions.length > 0);
  const renderedOptions = $derived(
    isGrouped ? groupedOptions.flatMap((bucket) => bucket.options) : filteredOptions
  );
  const typeAheadLabels = $derived(renderedOptions.map((option) => String(option.label ?? '')));

  function optionIsDisabled(index) {
    return Boolean(renderedOptions[index]?.disabled);
  }

  const selectedIdSet = $derived(
    multiple ? new Set(Array.isArray(value) ? value : [value]) : new Set()
  );

  function optionIsSelected(option) {
    return multiple ? selectedIdSet.has(option.id) : option.id === value;
  }

  const staysOpenOnChoose = $derived(multiple || stayOpen);

  const filteredCount = $derived(
    String(filteredCountTemplate)
      .replace('{matched}', String(filteredOptions.length))
      .replace('{total}', String(options.length))
  );

  const filteredToNothing = $derived(options.length > 0 && filteredOptions.length === 0);
  const noMatchesText = $derived(
    noMatchesHint || localizedText('FABRICATE.Common.Picker.NoMatches', 'No matches')
  );
  const emptyMessage = $derived(filteredToNothing ? noMatchesText : emptyHint);
  const emptyBody = $derived(filteredToNothing ? '' : emptyDetail);

  const optionListGeneration = $derived(
    [
      open ? 'open' : 'closed',
      normalizedSearch,
      options.length,
      options[0]?.id ?? '',
      options[options.length - 1]?.id ?? '',
    ].join('/')
  );

  const activeIndex = $derived(
    cursor.generation === optionListGeneration && cursor.index < renderedOptions.length
      ? cursor.index
      : -1
  );

  const listRendered = $derived(open && filteredOptions.length > 0);
  const controlledListId = $derived(listRendered ? listId : undefined);
  const activeDescendantId = $derived(
    listRendered ? activeOptionId(instanceId, activeIndex) : undefined
  );

  // KEEP THE CURSOR IN VIEW: nothing is FOCUSED, so the browser will not scroll the marked row
  // into its window by itself. The call is optional because happy-dom's element does not
  // implement `scrollIntoView`, and a bare call would throw inside every mounted picker suite.
  $effect(() => {
    if (activeIndex < 0 || !popoverRoot) return;
    const active = popoverRoot.querySelector?.('[data-active-option="true"]');
    active?.scrollIntoView?.({ block: 'nearest' });
  });

  const CARET_EDGE = new Map([
    ['ArrowLeft', 'start'],
    ['Home', 'start'],
    ['ArrowRight', 'end'],
    ['End', 'end'],
  ]);

  /**
   * Whether this keypress belongs to the query field's caret rather than to the list cursor. The
   * BOUNDARY, rather than a choice between the two key maps, is what makes both shippable:
   * Left/Right are not a convenience on a grid, and both pairs are text-editing keys in a field
   * the GM is typing into. A `<button>` holder has no `selectionStart`, so the search-suppressed
   * sites keep today's map exactly.
   *
   * @param {KeyboardEvent} event the keypress on the holder.
   * @returns {boolean} true when the field must keep the key.
   */
  function caretOwnsKey(event) {
    const field = event.target;
    if (typeof field?.selectionStart !== 'number') return false; // a trigger holder: never
    const edge = CARET_EDGE.get(event.key);
    if (!edge) return false;
    if (field.selectionStart !== field.selectionEnd) return true; // a selection is the caret's
    return edge === 'start' ? field.selectionStart > 0 : field.selectionEnd < field.value.length;
  }

  /**
   * THE TYPE-AHEAD, a native `<select>`'s answer to a printable character, active ONLY in the
   * search-suppressed shape — with a query field rendered, a printable character IS the query.
   * Closed, the panel OPENS with the match as the ACTIVE OPTION rather than selecting silently, so
   * every dismissal path leaves the value unchanged. Ctrl, Meta and Alt are refused here rather
   * than by the guard below, because Shift is not: Shift is how a capital is typed.
   *
   * @param {KeyboardEvent} event the keypress on the holder, open or closed.
   * @returns {boolean} true when the type-ahead consumed the key.
   */
  function typeAheadOwnsKey(event) {
    if (showSearch) return false;
    // THE REFUSAL `toggle()` MAKES IS THIS BRANCH'S TOO: opening a refusing trigger from a typed
    // character would be the one route around a refusal stated everywhere else.
    if (disabled || triggerAriaDisabled) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    const typed = typeAheadCursor(activeIndex, typeAheadLabels, event.key, {
      buffer: typeAheadBuffer,
      isDisabled: optionIsDisabled,
    });
    if (typed === null) return false;
    event.preventDefault();
    typeAheadBuffer = typed.buffer;
    if (typed.index === null) return true;
    // OPEN FIRST, then stamp: the generation reads `open`, so a stamp taken before the panel
    // opened would be stale in the very pass that was supposed to set it.
    open = true;
    cursor = { generation: optionListGeneration, index: typed.index };
    return true;
  }

  const OPENING_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

  /**
   * THE OPENING KEYS OF A CLOSED TRIGGER, which a native `<select>` answered and this did not.
   * They OPEN the panel and move an ACTIVE OPTION, so the value is still committed only by Enter
   * or a click. The cursor is SEEDED here rather than left at the sentinel because a GM who
   * presses ArrowDown has asked to move through the list; `Alt+ArrowDown` is the pattern's
   * exception and opens without moving anything. A modified press is never this widget's.
   *
   * @param {KeyboardEvent} event the keypress on a CLOSED trigger holder.
   * @returns {boolean} true when the key opened the panel and was consumed.
   */
  function openingKeyOwns(event) {
    if (showSearch) return false;
    if (disabled || triggerAriaDisabled) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey) return false;
    const altOpen = event.altKey && event.key === 'ArrowDown';
    if (!altOpen && (event.altKey || !OPENING_KEYS.has(event.key))) return false;
    event.preventDefault();
    open = true;
    if (altOpen) return true;
    const landing = nextActiveIndex(-1, renderedOptions.length, event.key, {
      columns: gridColumns,
      isDisabled: optionIsDisabled,
    });
    if (landing !== null) cursor = { generation: optionListGeneration, index: landing };
    return true;
  }

  // THE KEY MAP, on the holder: `nextActiveIndex` owns the arithmetic, this owns which keys are
  // CONSUMED, and a key the module does not answer is never prevented — which is what keeps every
  // printable character in the field.
  function onHolderKeydown(event) {
    if (!open) {
      if (openingKeyOwns(event)) return;
      typeAheadOwnsKey(event);
      return;
    }
    if (event.key === 'Enter') {
      // Enter WITHOUT an active option is a no-op rather than a choice of the first row, but on a
      // trigger holder it must still be prevented from reaching the button's own activation.
      const active = renderedOptions[activeIndex];
      if (!active) return;
      event.preventDefault();
      chooseOption(active);
      return;
    }
    if (typeAheadOwnsKey(event)) return;
    // A MODIFIED KEY IS NEVER THIS WIDGET'S. THE ORDER OF THESE TWO BLOCKS IS LOAD-BEARING, and
    // `Enter` above is deliberately BEFORE this test: on a trigger holder an unprevented `Enter`
    // reaches the button's own activation, so `Shift+Enter` would close the picker instead.
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (caretOwnsKey(event)) return;
    // THE PREDICATE IS PASSED UNCONDITIONALLY: one that gates nothing returns the same answer as
    // no predicate at all, which `tests/util/listbox-navigation.test.js` pins.
    const next = nextActiveIndex(activeIndex, renderedOptions.length, event.key, {
      columns: gridColumns,
      isDisabled: optionIsDisabled,
    });
    if (next === null) return;
    event.preventDefault();
    cursor = { generation: optionListGeneration, index: next };
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
    // A PREFIX DOES NOT SURVIVE THE PANEL: a GM who dismisses a panel and immediately types is
    // starting a new search, not continuing the one they just abandoned.
    typeAheadBuffer = null;
    if (restoreFocus) restoreTriggerFocus();
  }

  // A bound caller can force the picker shut without going through `close()`, so the query and
  // the cursor are cleared here too — while closed, which is the one window in which neither
  // can render late, because the panel is unmounted for the whole flush.
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

  /**
   * Choose an option, unless it is gated: `aria-disabled` is advisory, so the refusal has to be
   * stated, and both routes go through here because a caller can gate the row the cursor sits on.
   *
   * @param {{id: string, disabled?: boolean}} option The row the GM acted on.
   */
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

  // THE PANEL'S NAME, resolved ONCE for the two elements that carry it, so they cannot name
  // themselves differently. A labelledby SUPPRESSES the label rather than joining it.
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
    // THE TRIGGER IS THE HOLDER when no query field is rendered, and carries
    // `data-keyboard-focus="true"` because a `<button>` outside a `<form>` reads as `hasFocus`
    // false. It arrives through this SPREAD, which the source-reading gate cannot see, so the
    // trigger stays in that gate's baseline.
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

  // WHAT A `trigger` SNIPPET IS ALLOWED TO SEE; the caller spreads it LAST. Hence a value filter
  // AND a key list — see the header's spread invariant.
  const CALLER_OWNED_TRIGGER_KEYS = new Set(['disabled', 'aria-disabled']);

  function spreadableTriggerAttributes(attributes) {
    const spreadable = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || CALLER_OWNED_TRIGGER_KEYS.has(key)) continue;
      spreadable[key] = value;
    }
    return spreadable;
  }

  // THE ELEMENT, ACROSS A SNIPPET BOUNDARY. The key AND the function are created ONCE at
  // component scope, deliberately: Svelte's attachment handling guards against re-attaching the
  // same function, so a key or closure rebuilt on every pass would re-attach on every keystroke.
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

  // ONE ATTRIBUTE SET FOR BOTH SEARCH SHAPES: the inline field and the panel field are the same
  // HOLDER rendered in two places. An `<input>` is a tag `hasFocus` recognises on its own, so
  // unlike the trigger it needs no `data-keyboard-focus`.
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

<!-- `fabricate-picker` is the primitive's own NAMESPACE root; `pickerClass` is the caller's
         own family beside it, never a replacement. -->
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
    <div
      bind:this={popoverRoot}
      class={`fabricate-picker-popover manager-travel-popover ${popoverClass} ${compactOptionRows ? 'is-compact-option-rows' : ''}`}
      role="dialog"
      tabindex="-1"
      data-keyboard-focus="true"
      aria-label={dialogNameAttribute}
      aria-labelledby={dialogNamedBy}
      use:anchoredPopover={{
        component: 'SearchablePopover',
        // In `inlineSearchTrigger` mode the trigger is UNMOUNTED while open, so the anchor falls
        // back to the picker root, which is the element the inline field occupies. Both are read
        // EAGERLY, so the swap re-runs the measure.
        trigger: triggerElement ?? pickerRoot,
        layout: popoverLayout,
        // Read INSIDE the closure, so they are not dependencies of the action's `update`: it
        // re-runs on every measure rather than on a prop change. `measureListMetrics` is why the
        // closure exists at all — it MUST be re-read every pass.
        layoutOptions: () => ({
          horizontalAlign,
          minWidth,
          maxWidth,
          ...(measureListMetrics?.({
            popover: popoverRoot,
            list: optionsList,
            search: searchInput,
          }) ?? {}),
        }),
        maxHeightCap: maxHeight,
        bounds,
        // REGISTERED ONLY FOR A CALLER THAT MEASURES. Read EAGERLY in a ternary rather than behind
        // a callback, because the list binds one pass after the action runs and reading it here is
        // what makes Svelte re-run the update once it exists.
        targets: measureListMetrics ? { list: optionsList } : undefined,
        ignoreScrollWithin,
      }}
      onclick={stop}
      onmousedown={keepFocusOnHolder}
      onkeydown={(event) => {
        if (event.key === 'Escape') {
          stop(event);
          close();
        }
      }}
    >
      {#snippet optionRow(option, index)}
        <button
          {...option.data}
          type="button"
          class={`manager-travel-option ${optionClass} ${option.class || ''}`}
          role="option"
          id={activeOptionId(instanceId, index)}
          tabindex="-1"
          data-keyboard-focus="true"
          aria-selected={optionIsSelected(option)}
          aria-disabled={option.disabled ? 'true' : undefined}
          data-active-option={index === activeIndex ? 'true' : undefined}
          data-recipe-add={option.addMarker || undefined}
          data-popover-option={option.dataId || undefined}
          title={option.label}
          onclick={() => chooseOption(option)}
          onmousedown={(event) => event.preventDefault()}
        >
          {#if optionContent}
            {@render optionContent(option)}
          {:else}
            {#if option.img}
              <span class="manager-travel-portrait" aria-hidden="true"
                ><img src={option.img} alt="" /></span
              >
            {:else if option.icon}
              <i class={option.icon} aria-hidden="true"></i>
            {/if}
            {#if option.meta}
              <span class="manager-travel-option-lines">
                <span class="manager-travel-option-name">{option.label}</span>
                <span class="manager-travel-option-meta">{option.meta}</span>
              </span>
            {:else}
              <span class="manager-travel-option-name">{option.label}</span>
            {/if}
            {#if option.trailing}<Chip tone="disabled">{option.trailing}</Chip>{/if}
            {#if option.trailingIcon}<i
                class={`manager-travel-option-marker ${option.trailingIcon}`}
                aria-hidden="true"
              ></i>{/if}
            <!-- A CHIP, NOT A SECOND LABEL SPAN: `Chip`'s `disabled` tone IS the "unavailable"
                 family. It renders LAST so it sits at the row's trailing edge, and INSIDE the
                 button so the reason is part of the accessible name. -->
            {#if option.disabled && option.disabledReason}<Chip
                tone="disabled"
                data-popover-option-reason="">{option.disabledReason}</Chip
              >{/if}
          {/if}
        </button>
      {/snippet}

      {#if popoverTitle || showFilteredCount}
        <div class="manager-travel-popover-header" data-popover-header>
          {#if popoverTitle}
            <span class="manager-travel-popover-title">{popoverTitle}</span>
          {/if}
          {#if showFilteredCount}
            <!-- A POLITE STATUS, NOT A DECORATIVE NUMERAL. `stayOpen` made it owed: a panel that
                 stays open confirms a choice with nothing unless something announces, and the
                 count is the one element whose text moves on every choice. -->
            <span
              class="manager-travel-popover-count"
              data-popover-filtered-count
              role="status"
              aria-live="polite">{filteredCount}</span
            >
          {/if}
        </div>
      {/if}

      <!-- BELOW the title/count header: a field sitting over its own heading reads as belonging
           to the popover rather than to the list it filters. The leading glyph is part of the
           COMPACT presentation rather than of every search row. -->
      {#if showSearch && !inlineSearchTrigger}
        <div
          class={`manager-travel-popover-search ${searchClass}`}
          class:is-compact={compactOptionRows}
        >
          {#if compactOptionRows}<i class="fas fa-magnifying-glass" aria-hidden="true"></i>{/if}
          <input bind:this={searchInput} bind:value={search} {...searchFieldAttributes} />
        </div>
      {/if}

      {#if header}{@render header(filteredOptions.length, options.length)}{/if}

      <!-- The empty branch is a SIBLING of the listbox, never a child: a listbox's only valid
           children are its options and groups, so an empty note inside it would misrepresent the
           panel as a selectable part of the list. -->
      {#if filteredOptions.length > 0}
        <div
          bind:this={optionsList}
          class={`manager-travel-popover-options ${listClass}`}
          role="listbox"
          id={listId}
          aria-label={dialogNameAttribute}
          aria-labelledby={dialogNamedBy}
          aria-multiselectable={multiple ? 'true' : undefined}
          data-picker-as={as}
          data-picker-columns={isGrid ? String(gridColumns) : undefined}
        >
          {#if isGrouped}
            {#each groupedOptions as bucket (bucket.id)}
              <div
                class="manager-travel-popover-group"
                role="group"
                aria-label={bucket.label || undefined}
                data-popover-group={bucket.id}
              >
                {#if bucket.label}
                  <p class="manager-travel-popover-group-label" aria-hidden="true">
                    {bucket.label}
                  </p>
                {/if}
                {#each bucket.options as option, index (option.id)}
                  {@render optionRow(option, bucket.offset + index)}
                {/each}
              </div>
            {/each}
          {:else}
            {#each renderedOptions as option, index (option.id)}
              {@render optionRow(option, index)}
            {/each}
          {/if}
        </div>
      {:else}
        <!-- ONE QUIET LINE, NOT A NO-STATE PANEL: the dashed hero inside a panel that is already
             a bordered card drew a magnifier and, for the five callers that pass no `emptyHint`,
             no words. `role=status` stays on the WRAPPER, whose CONTENT changes as the GM
             types. -->
        <div class="manager-travel-popover-empty" role="status" aria-live="polite">
          <EmptyState note title={emptyMessage} hint={emptyBody || undefined} />
        </div>
      {/if}

      {#if footer}{@render footer()}{/if}
    </div>
  {/if}
</div>

<style>
  .manager-travel-popover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
    padding: 4px 7px 6px;
  }

  .manager-travel-popover-title {
    min-width: 0;
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.1em;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .manager-travel-popover-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9px;
    font-weight: 500;
  }

  .manager-travel-popover.is-compact-option-rows {
    padding: 5px;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-popover-header {
    flex: 0 0 auto;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option[aria-selected='true'] {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option:hover {
    border-color: var(--fab-border-strong);
    background: var(--fab-surface-raised);
  }

  .manager-travel-popover.is-compact-option-rows
    .manager-travel-option[aria-selected='true']:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  /* THE MULTI-SELECT SELECTED FACE. `design-system/spec.md` requires a SELECTED face to be a FILL
     and an EDGE; the shared row paints rest and hover only, so before this rule HOVER read
     stronger than SELECTED. KEYED ON THE LISTBOX'S `aria-multiselectable` rather than a caller
     class, which is what leaves the single-select importers untouched. `--fab-surface-active`
     behind `--fab-accent-border`, NOT `--fab-accent-soft`, which that paragraph reserves for the
     radio card group. The `:hover` half is restated so a selected row does not read as
     deselecting under the pointer. */
  .manager-travel-popover
    [aria-multiselectable='true']
    .manager-travel-option[aria-selected='true'],
  .manager-travel-popover
    [aria-multiselectable='true']
    .manager-travel-option[aria-selected='true']:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-active);
  }

  /* The compact search row. Its margin lands its edges on the option rows' list padding rather
     than on the popover's frame, so the field and the rows share one left edge. THE ROW IS THE
     FIELD, so the ring goes on the row: the input is borderless. `flex: 0 0 auto` is LOAD-BEARING
     — the popover is a column flex container under a `max-height` cap, so without it the height
     below is only a hint and a full list squeezes the field. */
  .manager-travel-popover-search.is-compact {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 7px;
    min-width: 0;
    box-sizing: border-box;
    height: 30px;
    margin: 2px 7px 6px;
    padding: 0 8px;
    border: 1px solid var(--fab-accent-border);
    border-bottom: 1px solid var(--fab-accent-border);
    border-radius: 8px;
    background: var(--fab-bg-0);
  }

  .manager-travel-popover-search.is-compact > i {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 9px;
  }

  .manager-travel-popover-search.is-compact input {
    flex: 1;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    color: var(--fab-text);
    background: transparent;
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-travel-popover-search.is-compact:focus-within {
    border-color: var(--fab-accent);
    box-shadow: inset 0 0 0 1px var(--fab-accent);
  }

  .manager-travel-popover-search.is-compact input:focus-visible {
    outline: none;
    border-color: transparent;
    box-shadow: none;
  }

  /* The scroll box carries NO right padding: the reserved gutter IS the right inset. `both-edges`
     fixes the wrong asymmetry — it reserves space INSIDE the scroll box only, so the rows end up
     inboard of the header and the search field, which are not in that box. The gutter width is
     engine-determined, so no static margin could have matched it anyway. */
  .manager-travel-popover.is-compact-option-rows .manager-travel-popover-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 0 7px 7px;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option {
    min-height: 40px;
    padding: 7px;
    gap: 7px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-3);
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-portrait {
    width: 24px;
    height: 24px;
  }

  /* An option carrying an ICON gets the SAME leading tile, so the two compact pickers on one card
     agree on where their names start. `:not(.manager-travel-option-marker)` is required, not
     defensive: the trailing "current value" check is also a direct `<i>` child, and tiling it
     would frame the marker as though it were a second leading element. */
  .manager-travel-popover.is-compact-option-rows
    .manager-travel-option
    > i:not(.manager-travel-option-marker) {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 6px;
    color: var(--fab-text-muted);
    background: var(--fab-surface-raised);
    font-size: 11px;
  }

  /* PINNED, NOT INHERITED: the row is a `<button>` under a `font: inherit` rule, so its label
     rendered at the manager's body size — larger and heavier than every other list on the card. */
  .manager-travel-popover.is-compact-option-rows .manager-travel-option {
    font-family: var(--font-primary);
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option-name {
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-travel-popover.is-compact-option-rows .manager-travel-option-meta {
    font-size: 9.5px;
    font-weight: 400;
  }

  /* THE TWO-LINE TRIGGER: the trigger-side twin of the option's own meta line, and deliberately
     the same shape. BOTH ELEMENTS ARE WRITTEN BY THIS COMPONENT, so these are ordinary scoped
     rules with no dependence on the global sheet. */
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
