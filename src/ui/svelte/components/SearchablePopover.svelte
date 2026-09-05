<!-- Svelte 5 runes mode -->
<!--
  Generic searchable popover used by the World > Parties and selected-system
  Travel surfaces (realm-override picker and move-to-party picker). The popover is portaled to the
  nearest Fabricate application root (`util/overlayHost.js`, issue 1466) so it escapes the
  `overflow: hidden` manager panel, positioned with
  `computeIconPickerPopoverLayout`, and dismissed on outside click / Escape (the
  portaled popover is registered as an additional "inside" node so clicking
  within it does not dismiss).

  KEYBOARD (issue 1503). DOM focus stays on ONE element for the whole life of the panel — the
  query field where one is rendered, the trigger where it is not — and the arrow keys move an
  `aria-activedescendant` cursor over the rows instead of moving focus onto them. The rows are
  `tabindex="-1"` and never receive focus; the arithmetic lives in `util/listboxNavigation.js`.
  See the focus-model block in the script below for what the two halves of that buy.

  Props:
    options      — [{ id, label, icon?, img?, meta?, trailing?, trailingIcon?,
                   addMarker?, dataId?, data?, disabled?, disabledReason?,
                   group? }] (consumer builds the full list, including any leading
                   "special" option such as Auto).
                   `addMarker` stamps `data-recipe-add` on that OPTION (the recipe
                   editor's add menu keeps its token family on the four type choices
                   rather than on a trigger per type)
                   `meta` promotes the option to TWO LINES: the label above, this
                   secondary sentence below (issue 1010). It exists because a picker
                   whose choices differ by a FACT rather than by a name cannot put that
                   fact in the label without making every row read as a sentence — the
                   recipe bulk panel's book picker states "Recipe book · holds 3 of 12
                   selected" per book, which is the whole basis on which the GM chooses.
                   Both lines are inside the button, so they are both in its accessible
                   name and a screen-reader user hears the same two facts.
                   `dataId` stamps `data-popover-option` on that option — the sibling of
                   the `data-popover-group` this component already stamps on a bucket.
                   Capture walks and mounted tests address an option by identity through
                   it; without one the only handle is the display label, which is
                   localized and therefore not a selector.
                   `data` is `dataId`'s general form — an OPTIONAL `{ 'data-x': 'value' }`
                   map stamped verbatim on that option's button, standing to `dataId`
                   exactly as `triggerData` stands to `triggerAddMarker` below. It exists
                   because a converted hand-rolled menu usually carries TWO hooks per row
                   rather than one, and they are its own rather than this component's: the
                   gathering availability menus stamp both
                   `data-gathering-task-availability-option="<kind>"` — which of the three
                   menus this row belongs to — and `data-condition-id="<id>"`, the same
                   attribute their selected PILLS carry, so one selector reads a row and
                   its pill. Folding either into `dataId` would rename a hook that a
                   mounted suite, a source-contract pin and a sibling element all share.
                   Spread FIRST, so it can never override this component's own `type`,
                   `role`, `aria-selected` or `onclick`.
                   `trailingIcon` marks an option that IS the current value with a
                   glyph rather than a word — the travel-actor picker checks the
                   linked actor, and `trailing` renders a Chip, which is a label.
                   `disabled` gates the row (issue 1504): it renders
                   `aria-disabled="true"`, refuses its own click, and the keyboard
                   cursor steps OVER it rather than landing on it. It is
                   `aria-disabled` rather than a native `disabled` attribute
                   because an option is not a control the GM tabs to — the rows are
                   already `tabindex="-1"` and the HOLDER owns focus — so the only
                   thing `disabled` would add is removing the row from the
                   accessibility tree, which is exactly where its reason has to be
                   announced from. `openspec/specs/design-system/library.html:661`
                   is the requirement in one line: opacity alone is not a reason.
                   `disabledReason` is that reason, rendered as the row's trailing
                   badge and therefore inside the button and inside its accessible
                   name, so a screen-reader user is told WHY as well as THAT. It is
                   rendered only for a gated row, because a reason for being
                   unavailable on an available row is a lie; and only in this
                   component's OWN row content — a caller supplying an `option`
                   snippet draws the whole row, this badge included, which is the
                   same rule that snippet's own note states.
    optionGroups — OPTIONAL [{ id, label }]. When non-empty the options are bucketed
                   by `option.group` and each bucket renders under its own heading as
                   an ARIA `role="group"` with that label. This exists because a menu
                   whose choices do NOT all mean the same thing must not present them
                   as one flat list: the recipe editor's "or…" menu offers OR
                   alternatives (Accept instead) alongside an AND requirement that
                   bubbles to the ingredient SET (Require as well), and a screen-reader
                   user told "Accept instead" and handed an AND control has been lied
                   to. Options with no `group` (or an unknown one) render last, without
                   a heading; a group whose options are all filtered out disappears.
                   Callers that pass no groups render exactly as before.
    value        — id of the currently selected option (for aria-selected)
    triggerClass — class string for the trigger button (consumer-controlled)
    triggerChip  — render the trigger through the shared `Chip` primitive instead of a
                   bare `<button>` (issue 883). The recipe editor's "or…" control is a
                   dashed accent CHIP, and a chip is only a chip when it renders through
                   that component: the scale lives in its scoped block, which a class
                   name handed to a button in THIS component can never reach. Callers
                   pass only their own modifier class in `triggerClass`; the chip's own
                   class hook comes from the primitive.
    triggerIcon  — leading icon class on the trigger (optional)
    triggerImg   — leading portrait image src on the trigger (optional; mirrors
                   how list options render `option.img`), shown before the label
    triggerLabel — current-selection text on the trigger (omitted when empty)
    triggerMeta  — a SECOND line under `triggerLabel`, inside the trigger button (issue
                   1373). It is the trigger-side twin of an option's `meta`, and it
                   exists for the same reason that one does: a trigger whose value is
                   identified by a FACT as well as by a name — the Tool editors'
                   replacement-Component tile states where the chosen Component lives
                   under its name — cannot put that fact in the label without making the
                   label read as a sentence. Both lines are inside the button, so both
                   are in its accessible name and a screen-reader user hears the same two
                   facts. EMPTY BY DEFAULT, and the empty case renders the label span
                   exactly as before, so every shipped call site's markup is unchanged.
    valueClass   — extra class on the trigger value span
    showChevron  — render the open/closed chevron on the trigger (default true)
    triggerAddMarker — optional value for a `data-recipe-add` attribute on the
                   trigger button (lets the recipe editor mark popover-backed add
                   controls without wrapping the button)
    triggerData  — OPTIONAL `{ 'data-x': 'value' }` map stamped verbatim on the
                   trigger button. The general form of `triggerAddMarker`, for a
                   caller whose stable hook is its own rather than the recipe
                   editor's: the Checks Studio's "Preview as" control carries
                   `data-checks-preview-actor`, which a mounted test and the View
                   Lab case registry both address, and a wrapper element around
                   the trigger would move that hook off the control it names.
                   Spread FIRST, so it can never override this component's own
                   `type`, `onclick` or ARIA contract.
    triggerTitle — optional native `title` tooltip on the trigger button
                   (backward-compatible; omitted when empty)
    triggerHasPopup — `'dialog'` (default) or `'listbox'`, the trigger's `aria-haspopup`
                   (issue 1458). This is INFORMATIONAL rather than structural: it tells
                   assistive technology what activating the trigger will open, and it is
                   the one axis on which the ten hand-rolled popovers this primitive
                   absorbs did not agree. Four announced `dialog` and four `listbox`, and
                   the difference tracks the panel each of them actually opened — a
                   searchable panel with a query field is a dialog, while a bare list of
                   choices with no field is a listbox. This primitive renders BOTH shapes
                   (`showSearch={false}` is the second one), so a single hard-coded value
                   made one of them announce a control the GM never gets. It is a
                   capability rather than a recorded divergence for exactly that reason:
                   the difference is real, and absorbing it is what lets the four listbox
                   sites convert without their screen-reader announcement changing.

                   Pass `'listbox'` only with `showSearch={false}`, and pass it WHENEVER
                   `showSearch={false}`. The two directions are one rule read from either
                   end. With the search field rendered the panel genuinely IS a dialog
                   containing a listbox, so announcing a bare listbox promises a control
                   the panel does not present; without one the panel IS a bare listbox,
                   so the `dialog` default announces a panel the GM never gets — which is
                   what the recipe row-level "or..." menu shipped, alone among the
                   search-suppressed sites. Both directions are refused at the source by
                   `tests/components/searchable-popover-source-contract.test.js` rather
                   than trusted to this note — "a popover announcing a listbox does not
                   render a search field" holds the first and "a popover that renders no
                   search field announces a listbox" holds the second.
    triggerAriaDisabled — render the trigger with `aria-disabled="true"` and refuse to
                   open, while leaving it ENABLED and focusable (default false, issue
                   1458). Not a synonym for `disabled`, and the difference is a defect
                   rather than a preference. `ModifierPillSelect` reached its pick cap
                   with a control that must stay reachable in the one direction that can
                   un-hit the cap: several screen readers drop a `disabled` button from
                   the tab order, so a capped GM would tab straight past the only control
                   whose `aria-describedby` explains the cap, and that component's
                   post-removal focus fallback targets this very button — `focus()` on a
                   `disabled` button silently no-ops and drops the keyboard user to
                   `<body>`. The trade is that `aria-disabled` does not suppress the
                   click, so `toggle()` has to, which is why this is a prop here and not
                   a `triggerData` entry the caller could pass today.
    showSearch   — render the search input (default true). A caller with only a
                   handful of fixed options (the recipe row-level "or…" menu) drops
                   it: `search` stays '' so `filteredOptions` and the autofocus
                   `$effect` degrade gracefully to the full, unfiltered list.
    inlineSearchTrigger — the trigger REPLACES ITSELF with the search field while open
                   (default false, so all 19 shipped consumers render unchanged). The
                   World > Parties travel-actor control is a 210px column whose
                   "Link an actor" / "Change actor" button becomes the search box on
                   activation rather than stacking a second field inside the popover;
                   the popover's own search row is suppressed in this mode, because
                   there is exactly one query and it must live in exactly one field.
    popoverTitle / showFilteredCount / filteredCountTemplate — OPTIONAL shared header
                   additions. `popoverTitle` renders at top-left and a live
                   `{matched} of {total}` count at top-right when `showFilteredCount`
                   is true. `filteredCountTemplate` is supplied by the caller so its
                   words remain localised, while this primitive owns the live numbers
                   because it owns the query. The header renders ABOVE the search field:
                   it names and counts the list, and a field sitting over its own heading
                   reads as belonging to the popover rather than to the list it filters.
    compactOptionRows — opts a caller into the dense full-width presentation as a WHOLE,
                   not just the row metrics: the 5px popover frame, bordered rows with
                   their 24px leading tile, the accent fill on the row that is the
                   current value, and a search field drawn as the same 30px bordered
                   control with a leading glyph that `inlineSearchTrigger` renders. Both
                   World > Parties pickers use it, so the two stacked in one 210px column
                   read as one kind of control over two vocabularies. Existing popover
                   consumers are untouched.
    trigger      — OPTIONAL snippet that REPLACES this component's own trigger button, rendered
                   with `{ attributes, open }` (issue 1503). The caller writes its own element —
                   its markup, its `class`, its `style`, its `oncontextmenu` — and spreads
                   `attributes` onto it LAST, which is what keeps this component's `type`,
                   `aria-haspopup`, `aria-expanded`, `onclick`, `onkeydown` and (in the
                   search-suppressed shape) the whole combobox contract from being overridden by
                   a caller that did not mean to. It exists because two shipped pickers draw a
                   trigger this component cannot: a 28px preview tile plus a caret, and a
                   drag-and-drop tile with its own clear button.

                   THE SPREAD CAN ADD, BUT NEVER SUBTRACT OR OVERRIDE, and making that true takes
                   TWO omissions rather than one. Svelte's `set_attributes` REMOVES an attribute
                   whose spread value is `undefined`, so `attributes` omits every
                   undefined-valued key — otherwise a spread-last `aria-label: undefined` would
                   strip the very name the caller wrote on its own button, and eleven shipped
                   trigger buttons would render UNNAMED. And `disabled` is `false` rather than
                   absent whenever the caller does not pass `disabled`, which is not undefined
                   and would therefore OVERRIDE a caller's own `disabled={true}`: three surfaces
                   would render an ENABLED trigger mid-save. So `disabled` and `aria-disabled`
                   are omitted TOO whenever a `trigger` snippet is supplied, and belong to the
                   caller's own button. (The equally correct alternative is for every snippet
                   caller to pass `disabled` THROUGH to this component so the spread value
                   matches its own; it is recorded rather than taken because it makes each
                   future caller responsible for remembering the pass-through, where the
                   omission puts the invariant here. A caller that wants the `aria-disabled`
                   shape — refuse the click, keep the tab stop — writes the attribute itself and
                   passes `triggerAriaDisabled` so `toggle()` also refuses.)

                   `attributes` also carries ONE symbol key, a `createAttachmentKey()` entry that
                   hands this component the caller's trigger ELEMENT. `bind:this` cannot cross a
                   snippet boundary, and without the element the popover would anchor to the
                   picker ROOT — for a drag-and-drop shell, a box several times the trigger's —
                   and focus would return to whatever button the root happened to hold first. The
                   key is a symbol, so neither half of the omission rule touches it.

                   A caller supplying a `trigger` snippet names AND titles the button IN the
                   snippet and does NOT pass `triggerAriaLabel` or `triggerTitle`; passing either
                   is a conflict the spread-last rule resolves in favour of the prop, because it
                   arrives through the spread. `triggerTitle` is the quieter of the two — it
                   would replace a tooltip rather than a name — and both are refused at the
                   source by `tests/components/searchable-popover-source-contract.test.js`.
                   `triggerClass` becomes a declared NO-OP with a `trigger` snippet: it
                   is a pass-through to this component's own button, which is then not rendered
                   at all, and `inlineSearchTrigger` still wins over BOTH while the panel is
                   open, exactly as it wins over `triggerChip` — the two shapes contradict each
                   other, and the inline field is the one the GM is typing into.

                   The click REFUSAL is the caller's too, and it has two halves for the same
                   reason the omission does. A snippet caller's own `disabled` attribute stops
                   the browser dispatching the click at all; a caller that also wants this
                   component's own guard to refuse — the `aria-disabled` shape, where the button
                   stays focusable — passes `triggerAriaDisabled`, and one that passes `disabled`
                   through as well gets the same answer from both.
    option       — OPTIONAL snippet that draws the row's CONTENT while this component keeps
                   owning the row ELEMENT — its `id`, its `tabindex`, its
                   `data-keyboard-focus`, its ARIA, its click and its keyboard-cursor marker
                   (issue 1503). It is rendered with the option. When supplied it is the row's
                   ONLY content: no `Chip`, no trailing marker, no label span. That is not
                   parsimony — a picker's own suite reads its row label with `span:last-child`,
                   and a trailing element appended after a caller's content would silently
                   retarget every such reader onto the marker.
    searchClass / listClass / optionClass — OPTIONAL extra classes on the search ROW, the
                   `role="listbox"` element and every option row, beside this component's own
                   (issue 1503). They are how an adopting picker keeps its own class family on
                   elements this component now writes: `.essence-icon-picker-search input` and
                   `.essence-source-picker-grid` are addressed by mounted suites, the View Lab
                   case registry and the live Foundry smoke, so a re-platform that dropped them
                   would edit a registry and ~30 assertions to change nothing a GM sees.
                   An individual row may carry `option.class` as well, appended AFTER
                   `optionClass` — a fact about the DATA (the icon picker's `pinned` resolved
                   row) rather than about the caller's styling plumbing.
    header / footer — OPTIONAL snippets rendered inside the popover, above the option
                   list and below it. They remain for exceptional caller-owned content;
                   the standard title/count header should use the shared props above.
                   `header` is rendered with `(matched, total)` — the length of the
                   FILTERED list and of the whole option list. It has to be: the search
                   term lives in this component's own state, so a caller counting its own
                   `options` array computes a number that can never change while the list
                   below it shrinks on every keystroke. A header snippet declaring no
                   parameters is unaffected.
    as / columns — the list's own FORM: `'list'` (default) or `'grid'`, and how many cells a grid
                   row holds (issue 1503). Both are EMITTED on the `role="listbox"` element as
                   `data-picker-as` / `data-picker-columns` rather than written as an inline
                   style, and that is a requirement rather than a preference: `anchoredPopover`
                   writes the list's WHOLE `style` attribute on every measure, so a template
                   riding an inline style would be erased the first time the panel repositioned.
                   The sheet paints the grid from the attributes.

                   `columns` also re-maps the keyboard cursor: in the grid form ArrowUp/ArrowDown
                   move by `columns` and ArrowLeft/ArrowRight by one cell, over the FLAT rendered
                   order so a ragged last row stays reachable. A grid with no `columns` is a
                   single column, which is the list form's arithmetic — so a caller that draws two
                   columns in CSS and forgets the prop gets a cursor that disagrees with what the
                   GM can see.
    filterOptions(options, query) — OPTIONAL replacement for this component's own filter, called
                   with the raw option list and the normalized (trimmed, lower-cased) query and
                   returning the rows to render, in order (issue 1503). The default is today's
                   exact label-substring filter, so every shipped caller is unchanged.

                   IT IS CALLED ON EVERY PASS, INCLUDING AN EMPTY QUERY, and the default
                   short-circuits rather than the seam. The derivation this replaces returned the
                   raw array untouched when the query was empty, and the icon picker's PINNED
                   resolved row — the row above the alphabetical list showing what is currently
                   chosen — is precisely a no-query behaviour, so a seam consulted only under a
                   query would silently drop it. It is also the only place a caller can see the
                   query this component owns, and the only place alias matching and result
                   ranking can live: the icon picker matches `cog`, `potion` and `gold` through
                   its own alias tables and RANKS what it returns, neither of which a substring
                   filter can express. A seam may return NEW row objects rather than members of
                   `options` — it must, when the caller's own data carries no `id`.
    horizontalAlign — which of the panel's edges meets the trigger's, `'left'` (default, today's
                   hard-coded value) or `'right'`. A trigger at the right of a narrow column
                   wants the panel's right edge on its own, or the panel is laid out off the
                   pane.
    measureListMetrics({ popover, list, search }) — OPTIONAL callback returning
                   `{ rowPitch, rowGap, chromeHeight, listExtra }`, called on EVERY layout pass
                   and spread into the layout's options (issue 1503). The fourth key is height
                   rendered INSIDE the list that no pitch can see — an outer margin on a row,
                   which is how the icon picker separates its pinned resolved row from the
                   alphabetical list. It is not chrome: chrome is subtracted from the budget the
                   floor divides, whereas this is subtracted from that budget AND added back to
                   the list's own height, because the list's box has to contain it. It is what
                   floors the list to a WHOLE number of rows instead of slicing the last one
                   against the panel's bottom inset, and it is a CALLBACK rather than three
                   numbers because the numbers are measured from the rendered box — a row's
                   height and the popover's chrome are tokens in the stylesheet, so a caller
                   restating them here would be a second copy free to drift. The three elements
                   are handed over because after adoption this component owns all three of them.
                   A caller that passes nothing is unaffected: without a `rowPitch` the layout
                   derives no list height, and this component then registers no secondary style
                   target at all.
    ignoreScrollWithin — drop viewport events that started INSIDE the panel (default false).
                   The panel is anchored to the trigger and scrolling within it moves neither, so
                   for a long list the re-measure recomputes the answer already applied.
    triggerOnKeydown — OPTIONAL caller handler on the trigger, composed AFTER this component's
                   own (issue 1503). It is a prop rather than something a caller could spread,
                   because in the search-suppressed shape the TRIGGER is the focus holder and
                   carries the key map: a caller that overrode `onkeydown` through the spread
                   would silently delete the focus model. Composed, not chained — this component
                   acts first and the caller sees an event that may already be prevented.
    maxHeight    — OPTIONAL px cap clamped against the computed layout height (0 = the
                   layout's own value). A picker anchored in a narrow column wants a
                   shorter panel than the viewport would allow.
    popoverClass — optional extra class on the portaled popover element (the
                   pickerClass lands on the trigger's root, which the portaled
                   popover escapes, so a popover-scoped style needs its own hook)
    *AriaLabel / searchPlaceholder / emptyHint — localized strings. `emptyHint` feeds
                   `EmptyState`'s `title` slot (its `<h3>`) HERE, so it must stay short:
                   the panel renders it as ONE quiet line (`EmptyState note`, issue 1373),
                   and a sentence handed to it wraps rather than sets as a heading. This is
                   the opposite mapping from `VocabularyPanel`, whose own `emptyHint` prop
                   feeds `EmptyState`'s `hint` slot (its `<p>`) — the two components chose
                   the same prop name for two different `EmptyState` slots, so read the
                   mapping from this doc rather than from the name alone.

                   IT ANSWERS FOR ONE OF THE TWO EMPTINESSES ONLY. `emptyHint` is the
                   sentence for a list that holds NOTHING; a search that filters an
                   authored list to nothing is a different fact and gets `noMatchesHint`.
                   The primitive used to show `emptyHint` for both, so a GM who typed `zzz`
                   into a picker holding twelve tags was told `No tags defined`, which is
                   false — and `openspec/specs/design-system/spec.md` requires an empty
                   state to distinguish "an unfiltered emptiness from a filtered one".
    noMatchesHint — OPTIONAL localized sentence for the FILTERED emptiness. It defaults to
                   `FABRICATE.Common.Picker.NoMatches` (`No matches`, the design's own words
                   at `proto:2281`) so no call site has to be edited to stop lying, and a
                   surface with a more specific sentence can still state one.
    emptyDetail  — OPTIONAL explanatory sentence rendered as `EmptyState`'s `hint` slot
                   (its `<p>`, beneath the `title` slot `emptyHint` feeds). It exists
                   because at least one empty reason is a configuration explanation rather
                   than a name — the travel-actor picker's "no actor has a configured
                   player-character type" names the module setting to change — and prose
                   belongs in a body, not in a heading. Callers passing only `emptyHint`
                   render exactly as before.

                   IT BELONGS TO `emptyHint` AND IS SUPPRESSED WITH IT. It explains why a
                   list holds nothing, which is false of a list that holds plenty and was
                   searched, so the filtered branch renders `noMatchesHint` alone.
    open         — OPTIONAL `$bindable` open state (default false). Bind it when a
                   surface must open the picker from something OTHER than the trigger,
                   or must force it shut from outside — the World > Parties card does
                   both. Unbound consumers are unaffected.
    onChoose(id) — called with the chosen option id
-->
<script>
  import { tick } from 'svelte';
  import { createAttachmentKey } from 'svelte/attachments';
  import Chip from '../apps/manager/Chip.svelte';
  import EmptyState from '../apps/manager/EmptyState.svelte';
  import { anchoredPopover, hostRelativePopoverLayout } from '../actions/anchoredPopover.js';
  import { dismissOnOutsideClick } from '../actions/dismissOnOutsideClick.js';
  import { localize } from '../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../util/iconPickerPopover.js';
  import { activeOptionId, nextActiveIndex } from '../util/listboxNavigation.js';
  import { pickerScrollerBounds } from '../util/overlayBounds.js';

  const popoverLayout = hostRelativePopoverLayout(computeIconPickerPopoverLayout);

  /**
   * The primitive's OWN localization, which none of its other strings need.
   *
   * Every other label here arrives pre-localized from the call site, because every other label
   * is a fact about that surface — what the picker is for, what it is empty OF. `No matches` is
   * a fact about this control's own search box and is the same sentence at all 22 sites, so a
   * new required prop would have been 22 identical edits to say one thing once.
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
   * The filter this component has always applied, and now applies as `filterOptions`' default.
   *
   * It short-circuits on an empty query rather than filtering with an empty needle, which is the
   * behaviour the derivation it replaces had: `''` is a substring of every label, so the two
   * agree on the result and differ only in whether they allocate a new array.
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
    disabled = false,
    triggerClass = '',
    triggerChip = false,
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
    dialogAriaLabel = '',
    searchPlaceholder = '',
    searchAriaLabel = '',
    emptyHint = '',
    emptyDetail = '',
    noMatchesHint = '',
    pickerClass = '',
    searchClass = '',
    listClass = '',
    optionClass = '',
    // The filter this component applies to `options`, defaulting to the label-substring match it
    // has always applied. See the prop docs above for why the DEFAULT short-circuits on an empty
    // query while the SEAM is still called with one.
    filterOptions = labelSubstringFilter,
    measureListMetrics = undefined,
    ignoreScrollWithin = false,
    triggerOnKeydown = undefined,
    horizontalAlign = 'left',
    minWidth = 240,
    maxWidth = 340,
    // The clipping boundary the popover is clamped inside: a selector string for the nearest
    // matching ancestor, or a resolver. The default is the shipped WALK over the manager and
    // admin scrollers, which skips a zero-sized or `display: contents` candidate and falls back
    // to the host's own inset edges — a shared component must not name an application's scroller
    // itself, so the selector is a value from `util/overlayBounds.js`.
    bounds = pickerScrollerBounds,
    // OPTIONAL two-way handle on the open state (default false, so every consumer that
    // does not `bind:` it behaves exactly as before). The World > Parties travel-actor
    // panel needs it in both directions: its TILE opens the picker without being the
    // trigger, and a page or page-size change must force every open picker shut so no
    // popover outlives the card that anchored it.
    open = $bindable(false),
    onChoose = () => {},
  } = $props();

  // A PER-INSTANCE PREFIX for the option `id`s (issue 1503). `aria-activedescendant` points at a
  // DOM id, so the ids have to be unique document-wide rather than merely within one panel: two
  // pickers mounted on the same screen both indexing their rows from 0 would emit the same id and
  // make the reference ambiguous. `$props.id()` is Svelte's own answer to exactly this.
  const instanceId = $props.id();
  const listId = `${instanceId}-listbox`;

  let search = $state('');
  // THE KEYBOARD CURSOR, and -1 is not "the first row" (issue 1503). It means the GM has opened
  // the panel and not yet pressed an arrow key, which is a different state from "row 0 is
  // active": no row carries the active marker, and Enter is a NO-OP rather than a blind choice of
  // whatever sits at the top of a list they have not looked through. See `util/listboxNavigation.js`.
  //
  // The position is STAMPED WITH THE LIST IT INDEXES rather than held on its own, because a
  // cursor cannot outlive that list and the expiry must be a READ. See `optionListGeneration`
  // below for what a generation is and why the reset cannot be an `$effect`.
  let cursor = $state({ generation: '', index: -1 });
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let optionsList = $state(null);
  let triggerButton = $state(null);
  let searchInput = $state(null);

  const normalizedSearch = $derived(search.trim().toLowerCase());
  // `filterOptions` is a CALLER'S seam, and everything below indexes what it returns — the
  // cursor arithmetic, the option ids, `renderedOptions[activeIndex]`. A seam that returns
  // something other than an array would throw on `.length` inside a derived, which surfaces as a
  // dead panel rather than as a message naming the caller, so the coercion is here and not there.
  const filteredOptions = $derived.by(() => {
    const rows = filterOptions(options, normalizedSearch);
    return Array.isArray(rows) ? rows : [];
  });

  // THE LIST'S FORM, resolved once. A grid with no usable `columns` is a single column, which is
  // the list form's arithmetic — the horizontal axis exists only where there is more than one
  // cell in a row for it to move between.
  const isGrid = $derived(as === 'grid');
  const gridColumns = $derived(isGrid && Number.isInteger(columns) && columns > 1 ? columns : 1);

  // Grouped rendering. Each declared group keeps its declared order; anything with no
  // (or an unknown) group falls into a trailing, heading-less bucket so an option can
  // never be silently dropped by a mismatched group id.
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
    // EACH BUCKET CARRIES ITS OFFSET in the flat rendered order (issue 1503), because the keyboard
    // cursor and the option `id`s are indexed over the CONCATENATION of the buckets rather than
    // per bucket. A per-`each` index would restart at 0 in every group, so `id={optionId(i)}`
    // would emit duplicate DOM ids, `aria-activedescendant` would be ambiguous between them, and
    // a cursor indexed into `filteredOptions` would not match the order the rows are drawn in.
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
  // THE FLAT RENDERED ORDER — what the cursor indexes and what the ids are numbered over. It is
  // the concatenation of the buckets when grouped and `filteredOptions` otherwise, which is
  // exactly the order the two branches below draw their rows in.
  const renderedOptions = $derived(
    isGrouped ? groupedOptions.flatMap((bucket) => bucket.options) : filteredOptions
  );
  // WHAT THE CURSOR SKIPS (issue 1504), over the FLAT rendered order because that is the order
  // `util/listboxNavigation.js` indexes. It is a FUNCTION rather than a derived array so the
  // module stays off the option shape: a caller whose rows spell availability differently answers
  // the same question here.
  function optionIsDisabled(index) {
    return Boolean(renderedOptions[index]?.disabled);
  }

  const filteredCount = $derived(
    String(filteredCountTemplate)
      .replace('{matched}', String(filteredOptions.length))
      .replace('{total}', String(options.length))
  );

  // WHICH EMPTINESS THIS IS. A list that holds nothing and a search that matched nothing are
  // different facts and the design writes them differently — `proto:2262` is the tag picker's
  // `No tags left.` over its own authored vocabulary, `proto:2281` the sibling popover's
  // `No matches` under a typed query — and `openspec/specs/design-system/spec.md` requires an
  // empty state to "distinguish an unfiltered emptiness from a filtered one". The predicate is
  // the whole distinction: `options` non-empty with `filteredOptions` empty is true if and only
  // if the SEARCH removed everything, so a picker whose world has authored nothing keeps the
  // caller's sentence whatever the GM types into it.
  const filteredToNothing = $derived(options.length > 0 && filteredOptions.length === 0);
  const noMatchesText = $derived(
    noMatchesHint || localizedText('FABRICATE.Common.Picker.NoMatches', 'No matches')
  );
  const emptyMessage = $derived(filteredToNothing ? noMatchesText : emptyHint);
  // `emptyDetail` goes WITH `emptyHint` and never with the filtered sentence. It exists to
  // explain why a list holds nothing — the travel-actor picker names the module setting to
  // change — and that explanation is false of a list that holds plenty and was searched. The
  // actor bar is the site that proves it: rendered under `No character matches your search`,
  // its body still read `ask your GM to add its actor type`.
  const emptyBody = $derived(filteredToNothing ? '' : emptyDetail);

  // ── THE LISTBOX FOCUS MODEL (issue 1503) ──────────────────────────────────────────────────
  //
  // `openspec/specs/design-system/spec.md` requires a listbox to keep DOM focus on ONE element —
  // the HOLDER — and drive selection with `aria-activedescendant`. The holder is the query
  // `<input>` where one is rendered and the TRIGGER where one is not (`showSearch={false}`, four
  // app surfaces plus `ModifierPillSelect`), and the option rows NEVER receive DOM focus. Roving
  // focus onto them is what the prohibition forbids, because it re-arms Foundry's canvas
  // bindings — and there is a second, independent reason: `styles/fabricate.css` rings any focused
  // `[tabindex]` under `.fabricate` (`.fabricate [tabindex]:focus-visible`, a 2px accent outline
  // at a POSITIVE offset), so a row that took focus would draw a competing ring around the
  // keyboard cursor's own inset one.
  //
  // `aria-controls` and `aria-activedescendant` are OMITTED while the list itself is absent: the
  // `role="listbox"` element renders only when `filteredOptions.length > 0`, and the empty branch
  // below replaces it entirely. An `aria-controls` pointing at an id that resolves to no element
  // is a defect, so both attributes are conditioned on the same predicate the list is.
  // A CURSOR CANNOT OUTLIVE THE LIST IT INDEXES, and three independent inputs rebuild that list.
  // Opening starts a fresh pass over the options, every query keystroke rebuilds
  // `filteredOptions`, and a caller may replace `options` under an open panel with the query
  // unchanged — so index 3 names an unrelated option the moment any of them moves. Resetting to
  // -1 rather than clamping is the point: the GM has not arrowed into the NEW list, so nothing in
  // it is active and Enter stays a no-op until they do.
  //
  // All three are read through one GENERATION string because `open` is `$bindable` — the World
  // Parties travel tile opens the picker without being the trigger, and a page-size change forces
  // it shut — so neither direction reliably passes through `toggle` or `close`. The options leg
  // is their count plus the first and last id rather than the whole list, because the generation
  // is rebuilt on every keystroke and a whole-list key would be O(n) per character; a swap that
  // keeps the count AND both ends is the one case it cannot see, and `renderedOptions[activeIndex]`
  // still refuses an index past the end.
  const optionListGeneration = $derived(
    [
      open ? 'open' : 'closed',
      normalizedSearch,
      options.length,
      options[0]?.id ?? '',
      options[options.length - 1]?.id ?? '',
    ].join('/')
  );

  // THE RESET IS A READ, NOT A WRITE, and that is the whole reason the cursor carries the
  // generation it was set in. Cleared from an `$effect`, the reset lands AFTER the derived pass
  // that rebuilt `filteredOptions` — so for one flush `data-active-option` and
  // `aria-activedescendant` name a position in the PREVIOUS list, and only a test that refuses to
  // flush can see it. Stamped, the stale cursor never renders at all: the generation it was
  // written under no longer matches, so it reads as the -1 sentinel in the same pass.
  const activeIndex = $derived(cursor.generation === optionListGeneration ? cursor.index : -1);

  const listRendered = $derived(open && filteredOptions.length > 0);
  const controlledListId = $derived(listRendered ? listId : undefined);
  const activeDescendantId = $derived(
    listRendered ? activeOptionId(instanceId, activeIndex) : undefined
  );

  // KEEP THE CURSOR IN VIEW. The list scrolls, so the row the GM has arrowed to can be outside
  // its window — and because nothing is FOCUSED, the browser will not scroll to it on its own.
  // `$effect` runs after the DOM update, so the marked row is already rendered when this reads
  // it. The call is optional because happy-dom's element does not implement `scrollIntoView`, and
  // a bare call would throw inside every mounted picker suite.
  $effect(() => {
    if (activeIndex < 0 || !popoverRoot) return;
    const active = popoverRoot.querySelector?.('[data-active-option="true"]');
    active?.scrollIntoView?.({ block: 'nearest' });
  });

  // WHICH EDGE OF A TEXT FIELD EACH CARET KEY BELONGS TO (issue 1503).
  //
  // The holder is USUALLY A TEXT FIELD, and these four keys are the caret's before they are the
  // cursor's. The map records the edge at which pressing the key would move the caret NOWHERE,
  // which is exactly the state in which handing it to the list costs the GM nothing.
  const CARET_EDGE = new Map([
    ['ArrowLeft', 'start'],
    ['Home', 'start'],
    ['ArrowRight', 'end'],
    ['End', 'end'],
  ]);

  /**
   * Whether this keypress belongs to the query field's caret rather than to the list cursor.
   *
   * The boundary, rather than a choice between the two key maps, is what makes both shippable.
   * `ArrowLeft`/`ArrowRight` are not a convenience on a grid: with `columns = 2` `ArrowDown`
   * steps +2 over the flat order, so on an even filtered count half the tiles are unreachable
   * without them. Home/End reach the ends of a long list. But both pairs are text-editing keys in
   * a field the GM is typing into, and taking them unconditionally is what
   * `util/listboxNavigation.js` refuses to do for Left/Right in the list form while doing it for
   * Home/End everywhere — an inconsistency this predicate removes rather than documents.
   *
   * Nothing becomes unreachable: every cursor movement is still one extra keypress away, which is
   * the behaviour of every editable combobox. And two populations do not change at all — a
   * `<button>` holder has no `selectionStart`, so the five search-suppressed sites keep today's
   * map exactly, and a freshly opened panel has an empty query, so both edges hold and the cursor
   * takes all four keys, which is when a GM actually arrows.
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

  // THE KEY MAP, on the holder. `nextActiveIndex` owns the arithmetic; this owns the wiring —
  // which keys are CONSUMED, and what Enter chooses. A key the module does not own returns `null`
  // and is left entirely alone, which is what keeps every printable character going to the query
  // field. Escape is not handled here: `dismissOnOutsideClick` on the picker root takes it at the
  // document's capture phase, which is the only place that reaches the inline search shape.
  function onHolderKeydown(event) {
    if (!open) return;
    if (event.key === 'Enter') {
      // Enter WITHOUT an active option is a no-op rather than a choice of the first row. On a
      // trigger holder it must still be prevented from reaching the button's own click, or the
      // panel would toggle shut — but only when there is a cursor to confirm.
      const active = renderedOptions[activeIndex];
      if (!active) return;
      event.preventDefault();
      chooseOption(active);
      return;
    }
    // A MODIFIED KEY IS NEVER THIS WIDGET'S. `Shift+End` selects to the end of the query,
    // `Ctrl+Home` jumps to its start, and both are the ordinary way a GM fixes a typo in a long
    // search — none of them is a cursor movement, and consuming them would take the field's
    // selection keys away with no listbox behaviour offered in exchange. It governs the ARROWS
    // too, not only the four caret keys below it: a modified press is the control's own.
    //
    // THE ORDER OF THESE TWO BLOCKS IS LOAD-BEARING, and `Enter` above is deliberately outside
    // this test rather than accidentally so. On a TRIGGER holder an `Enter` this widget declines
    // reaches the button's own activation and shuts the panel, so `Shift+Enter` would close the
    // picker instead of confirming the row the GM had arrowed to.
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    if (caretOwnsKey(event)) return;
    // THE PREDICATE IS PASSED UNCONDITIONALLY, and that IS the compatibility contract rather
    // than a widening of it: a predicate that gates nothing returns the same number as no
    // predicate at all, which `tests/util/listbox-navigation.test.js` pins directly against a
    // bare call. Branching on "does this list hold a gated row" would be a second code path for
    // the arithmetic to differ on, bought with nothing.
    const next = nextActiveIndex(activeIndex, renderedOptions.length, event.key, {
      columns: gridColumns,
      isDisabled: optionIsDisabled,
    });
    if (next === null) return;
    event.preventDefault();
    // Stamped with the generation it indexes, so the list that replaces this one reads it as the
    // -1 sentinel rather than inheriting a position in a list that no longer exists.
    cursor = { generation: optionListGeneration, index: next };
  }

  // Focus restoration waits for `tick()`, NOT a bare microtask. In `inlineSearchTrigger`
  // mode the trigger is UNMOUNTED while open, so `bind:this` has already nulled
  // `triggerButton` when `close()` runs: the element focus must return to does not exist
  // yet, and the restore is only correct once Svelte has remounted it. A `queueMicrotask`
  // callback lands on a null reference and silently does nothing unless Svelte's own flush
  // happens to have been scheduled first — true today, but an internal ordering of the
  // framework's batching that this primitive must not depend on. `tick()` states the
  // requirement instead of relying on it. The `querySelector` fallback covers a trigger
  // shape that is not the bound element. Shared by all 19 consumers, so it is not branched
  // on the mode.
  function restoreTriggerFocus() {
    tick().then(() => {
      const target = triggerButton ?? pickerRoot?.querySelector?.('button');
      if (target?.isConnected !== false) target?.focus?.();
    });
  }

  function close({ restoreFocus = true } = {}) {
    open = false;
    search = '';
    if (restoreFocus) restoreTriggerFocus();
  }

  // A bound caller can force the picker shut without going through `close()` — World Parties
  // does that when a page-size change keeps the card mounted but invalidates its page-local UI.
  // Keep the query owned by the primitive in step with that externally controlled state, or the
  // next open resurrects a filter the caller cannot see or reset while the picker is closed.
  //
  // A CURSOR CANNOT OUTLIVE ITS PANEL EITHER. The generation string repeats across a
  // close/reopen with the same options and an empty query, so a stamp alone would restore the
  // index the GM abandoned. Cleared while closed, which is the one window in which a write
  // cannot render late: the panel is unmounted for the whole flush.
  $effect(() => {
    if (open) return;
    if (search) search = '';
    cursor = { generation: '', index: -1 };
  });

  // ESCAPE, in every mode including `inlineSearchTrigger`, is handled by
  // `dismissOnOutsideClick` on the picker root below: that action registers a
  // DOCUMENT-level capture-phase keydown while `enabled` (`dismissOnOutsideClick.js:47-56`),
  // so it does not depend on the key reaching the portaled dialog's own handler — which the
  // inline search field, a sibling of the trigger and in a different subtree from the
  // portaled panel, never would. A second handler on the inline field would close an
  // already-closed picker and restore focus twice.

  function toggle(event) {
    event.stopPropagation();
    // `aria-disabled` is advisory to the browser — it neither blocks the click nor removes
    // the tab stop — so the refusal has to be stated here. See `triggerAriaDisabled` above
    // for why the caller wants a focusable, clickable, refusing button rather than a
    // `disabled` one.
    if (disabled || triggerAriaDisabled) return;
    if (open) {
      close({ restoreFocus: false });
      return;
    }
    open = true;
  }

  function choose(id) {
    onChoose(id);
    close();
  }

  /**
   * Choose an option, unless it is gated (issue 1504).
   *
   * `aria-disabled` is advisory to the browser exactly as it is on the trigger: it neither blocks
   * the click nor removes the row from the pointer's reach, so the refusal has to be stated. Both
   * routes to a choice go through here — the row's own click and the Enter that confirms the
   * keyboard cursor — because the cursor's skip scan is not a guarantee: a caller can gate the
   * row the cursor is already sitting on, and the arrows would then have nothing to do with the
   * next Enter.
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

  // THE PANEL'S OWN CHROME MUST NOT TAKE FOCUS EITHER (issue 1503).
  //
  // The portaled panel is `role="dialog" tabindex="-1"`, so it is the nearest focusable
  // ancestor of everything inside it: a click on the panel inset, on an inter-row gap, on the
  // header or on the empty note moves DOM focus off the holder and onto the dialog. The option
  // rows suppress their own `mousedown`, but nothing else did — and with focus on the dialog the
  // key map is gone, because it is bound to the holder rather than to the panel, so the arrows
  // stop moving and typing goes nowhere. It is also INVISIBLE: the module root rings
  // `:focus-visible` only, and a mouse click does not match it, so the panel draws no ring to
  // explain what happened.
  //
  // The exception list is every element that has its OWN reason to take focus — the query field
  // above all, whose caret placement and text selection are exactly what a suppressed `mousedown`
  // would break.
  //
  // A native scrollbar drag DOES reach this handler — Chromium dispatches `mousedown` for a
  // scrollbar press with the SCROLLING ELEMENT as its target, so the list matches no entry in the
  // exception list and its default is prevented. Measured rather than assumed, and the drag is
  // unaffected: thumb tracking is not the mousedown default action, so the scroll distance is
  // identical with the guard and without it. It is not merely tolerated either — without the
  // guard, dragging the list's scrollbar moved focus onto the panel exactly as clicking the inset
  // did, so the scrollbar was a second, quieter route to the same broken keyboard model.
  const FOCUSABLE_PANEL_CHROME = 'input, button, textarea, select, [href]';

  function keepFocusOnHolder(event) {
    if (!event.target?.closest?.(FOCUSABLE_PANEL_CHROME)) event.preventDefault();
  }

  // The trigger keeps its `stopPropagation` in BOTH shapes, gains the key map in the one where it
  // is the holder, and calls the CALLER'S handler last.
  //
  // Last is the whole point. In the search-suppressed shape the trigger is the focus holder and
  // carries the key map, so a caller that took `onkeydown` for itself — the only route it would
  // have, since it spreads `attributes` last — would delete the focus model without any way to
  // notice. Composing here means a caller can add a key without being able to remove one.
  function onTriggerKeydown(event) {
    if (!showSearch) onHolderKeydown(event);
    stop(event);
    triggerOnKeydown?.(event);
  }

  // One attribute set for both trigger shapes. Writing it twice would be a copy the
  // duplication gate counts and a place for the two shapes to drift apart.
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
    // THE TRIGGER IS THE HOLDER when no query field is rendered (`spec.md`'s own case for the
    // search-suppressed shape): `role="combobox"` plus the activedescendant pair, and
    // `data-keyboard-focus="true"` because a `<button>` outside a `<form>` answers Foundry's
    // `hasFocus` false — without it every keybinding stays live while the trigger holds focus,
    // so Space pauses the game and the arrows pan the canvas behind the window. The attribute
    // arrives through this SPREAD, which the source-reading keyboard-focus gate cannot see, so
    // the trigger stays in that gate's baseline and nothing is accidentally paid down.
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

  // WHAT A `trigger` SNIPPET IS ALLOWED TO SEE, and the two keys it must not.
  //
  // The caller spreads this LAST, so every key here beats the caller's own — which is the point
  // for `type`, the ARIA and the handlers, and a defect for anything the caller owns. Svelte's
  // `set_attributes` REMOVES an attribute whose spread value is `undefined`, so an undefined key
  // would strip the caller's own `aria-label` and `title` rather than leaving them alone; and
  // `disabled` is `false` rather than absent whenever the caller passes no `disabled`, which is
  // not undefined and would therefore OVERRIDE a caller's own `disabled={true}`. One filter
  // cannot answer both: hence a value filter AND a key list. See the `trigger` prop's docs.
  const CALLER_OWNED_TRIGGER_KEYS = new Set(['disabled', 'aria-disabled']);

  function spreadableTriggerAttributes(attributes) {
    const spreadable = {};
    for (const [key, value] of Object.entries(attributes)) {
      if (value === undefined || CALLER_OWNED_TRIGGER_KEYS.has(key)) continue;
      spreadable[key] = value;
    }
    return spreadable;
  }

  // THE ELEMENT, ACROSS A SNIPPET BOUNDARY. `bind:this` does not cross one, and this component
  // needs the caller's trigger for two things a fallback gets wrong: `anchoredPopover` anchors
  // the panel to it, and `restoreTriggerFocus` returns focus to it. `createAttachmentKey()` makes
  // a symbol Svelte recognises on a SPREAD object, so the element arrives through the same
  // `attributes` the caller already spreads.
  //
  // The key AND the function are created ONCE at component scope, deliberately: Svelte's
  // attachment handling walks the spread object's symbols and guards against re-attaching the
  // same function, so a key or a closure rebuilt on every `$derived` pass would detach and
  // re-attach on every keystroke.
  const triggerElementKey = createAttachmentKey();

  function captureTrigger(node) {
    triggerButton = node;
    return () => {
      triggerButton = null;
    };
  }

  const triggerSnippetAttributes = $derived({
    ...spreadableTriggerAttributes(triggerAttributes),
    [triggerElementKey]: captureTrigger,
  });

  // ONE ATTRIBUTE SET FOR BOTH SEARCH SHAPES, for the same reason `triggerAttributes` is one
  // object: the inline field and the panel field are the same HOLDER rendered in two places, and
  // writing the combobox contract twice is a copy that would let them drift apart. An `<input>`
  // is one of the tags `hasFocus` recognises on its own, so unlike the trigger it needs no
  // `data-keyboard-focus`.
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

<!-- `fabricate-picker` is the primitive's own NAMESPACE root, and it is what lets this component
     paint outside the manager (issue 1464). `styles/fabricate.css` is loaded page-wide into the
     Foundry document, so every selector in it must begin with `.fabricate` or it bleeds into
     other modules' sheets; the family used to satisfy that by hanging off `.fabricate-manager`,
     which is why a player-window caller drew nothing at all. A root the COMPONENT writes
     satisfies the same rule and travels with it. Do not swap it back for an app root, and do not
     delete it: `tests/components/searchable-popover-area-scope.test.js` fails on either. -->
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
    <!-- The caller's own trigger. This component renders NO button of its own in this shape, so
         `triggerClass` is a declared no-op here and the accessible name is the caller's
         responsibility — enforced at the source by
         `tests/components/searchable-popover-source-contract.test.js`. -->
    {@render trigger({ attributes: triggerSnippetAttributes, open })}
  {:else if triggerChip}
    <Chip tag="button" bind:element={triggerButton} class={triggerClass} {...triggerAttributes}
      >{@render triggerBody()}</Chip
    >
  {:else}
    <button bind:this={triggerButton} class={triggerClass} {...triggerAttributes}>
      {@render triggerBody()}
    </button>
  {/if}

  {#if open}
    <!-- `fabricate-picker-popover` is the panel's own half of the primitive's namespace root. It
         is a SECOND class rather than the one on the picker root because `use:anchoredPopover`
         below moves this node out of that root, taking its classes and losing its ancestors. -->
    <div
      bind:this={popoverRoot}
      class={`fabricate-picker-popover manager-travel-popover ${popoverClass} ${compactOptionRows ? 'is-compact-option-rows' : ''}`}
      role="dialog"
      tabindex="-1"
      data-keyboard-focus="true"
      aria-label={dialogAriaLabel || undefined}
      use:anchoredPopover={{
        component: 'SearchablePopover',
        // In `inlineSearchTrigger` mode the trigger button is UNMOUNTED while open (the search
        // field takes its place), so the anchor falls back to the picker root — which is the
        // element the inline field occupies. Without the fallback the panel would keep its last
        // style and drift on scroll. Both are read EAGERLY, so the swap re-runs the measure.
        trigger: triggerButton ?? pickerRoot,
        layout: popoverLayout,
        // `minWidth`, `maxWidth` and `horizontalAlign` are read INSIDE this closure, so they are
        // not dependencies of the action's `update`: the action re-runs the closure on its next
        // measure rather than when a prop changes. All three are fixed for the life of one open
        // at every shipped call site, so nothing is owed; a caller that needed to change a width
        // band mid-open would have to re-measure it. `measureListMetrics` is the opposite case
        // and is why the closure exists at all — it MUST be re-read every pass.
        layoutOptions: () => ({
          horizontalAlign,
          minWidth,
          maxWidth,
          // Spread LAST and re-measured on every pass, exactly as the caller's own copy of this
          // did: the numbers come from the rendered box, so they are only right for the frame
          // they were read in.
          ...(measureListMetrics?.({
            popover: popoverRoot,
            list: optionsList,
            search: searchInput,
          }) ?? {}),
        }),
        maxHeightCap: maxHeight,
        bounds,
        // REGISTERED ONLY FOR A CALLER THAT MEASURES. `targets.list` is what the layout's
        // `listMaxHeight` is written to, and without a `rowPitch` there is no such height — so
        // for the callers that pass no `measureListMetrics` the action would write an empty
        // `style` attribute onto a list it has nothing to say about. Read EAGERLY inside the
        // ternary rather than behind a callback: the list binds one pass after this action first
        // runs, and reading it here is what makes Svelte re-run the action's update, and
        // therefore the measure, once it exists.
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
      <!-- `index` is the row's position in the FLAT rendered order, which is why the grouped
           branch below adds its bucket's own offset rather than passing the `each` index: the
           `id`s and the cursor are numbered over the concatenation of the buckets. -->
      {#snippet optionRow(option, index)}
        <button
          {...option.data}
          type="button"
          class={`manager-travel-option ${optionClass} ${option.class || ''}`}
          role="option"
          id={activeOptionId(instanceId, index)}
          tabindex="-1"
          data-keyboard-focus="true"
          aria-selected={option.id === value}
          aria-disabled={option.disabled ? 'true' : undefined}
          data-active-option={index === activeIndex ? 'true' : undefined}
          data-recipe-add={option.addMarker || undefined}
          data-popover-option={option.dataId || undefined}
          title={option.label}
          onclick={() => chooseOption(option)}
          onmousedown={(event) => event.preventDefault()}
        >
          {#if optionContent}
            <!-- SOLE CONTENT, not additional content — which is why this is one branch around
                 everything rather than a preamble in front of it. A picker's own suite reads its
                 row label with `span:last-child`, so a marker appended after a caller's tile
                 would silently retarget that reader onto the marker. -->
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
              <!-- The two-line form. The wrapper is what carries the flex sizing the
                   single-line `-name` carries on its own, so the label keeps ellipsising
                   rather than pushing the trailing Chip out of the row. -->
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
            <!-- WHY THE REASON IS A CHIP AND NOT A SECOND LABEL SPAN (issue 1504). The design
                 draws a gated row as dimmed text with a trailing badge, and this component
                 already draws exactly that badge for `option.trailing`, through the primitive
                 that owns it — `Chip`'s `disabled` tone IS the "unavailable" family. A second
                 hand-rolled span would be a copy of a shipped treatment. It renders LAST so it
                 sits at the row's trailing edge, and inside the button so the reason is part of
                 the row's accessible name rather than a tooltip a keyboard user never reaches. -->
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
            <span class="manager-travel-popover-count" data-popover-filtered-count
              >{filteredCount}</span
            >
          {/if}
        </div>
      {/if}

      <!-- BELOW the title/count header, not above it. The header names the list and
           counts it; a search field sitting over its own heading reads as belonging to
           the popover rather than to the list it filters. Only order changes, and only
           where a header exists — the callers that pass no `popoverTitle` and no
           `showFilteredCount` render no header at all, so for them this is the same DOM.

           The leading glyph is part of the COMPACT presentation, not of every search row:
           `inlineSearchTrigger` mode already carries one, so a compact caller that keeps
           its value-bearing trigger (the realm-override picker) would otherwise read as a
           different control from the actor picker directly above it in the same column. -->
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

      <!-- The empty branch is a SIBLING of the `role="listbox"` box, never a child of it
           (issue 1035): a listbox's only valid children are its options/groups, so a
           no-matches `<h3>`/`<p>` rendered inside it misrepresented the empty panel as a
           selectable part of the list to assistive tech. `filteredOptions.length` alone
           decides which renders — `isGrouped` is derived FROM `filteredOptions` (it is
           false whenever every bucket is empty), so a grouped picker whose search matches
           nothing already falls out of `isGrouped` and into this same empty branch. -->
      {#if filteredOptions.length > 0}
        <div
          bind:this={optionsList}
          class={`manager-travel-popover-options ${listClass}`}
          role="listbox"
          id={listId}
          aria-label={dialogAriaLabel || undefined}
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
        <!-- ONE QUIET LINE, NOT A NO-STATE PANEL (issue 1373). The design draws this as
             `padding:7px; font:500 10px var(--sans); color:var(--subtle)` and nothing else
             (`proto:2262`, and `proto:2281` for the sibling popover); we drew `EmptyState`'s
             dashed hero — a tiled magnifier over a serif heading, centred in its own bordered
             box — inside a panel that is already a bordered, shadowed 240px card.
             `EmptyState`'s `note` variant is that treatment, and it is the DEFAULT rather than
             an opt-in because every one of this primitive's call sites reaches this branch and
             five of them pass no `emptyHint` at all: for those the hero panel was a dashed box
             containing a magnifier and no words.

             The wrapper is its own class rather than `-options`, because the list's inset and
             scroll belong to a list; the note takes its inset from `EmptyState`. `role=status`
             and `aria-live` stay on the wrapper — it is the region whose CONTENT changes as the
             GM types, and the note replaces itself inside it. -->
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

  /* The 5px frame the compact popover draws around its own contents, so the header, the
     search field and the option list all sit on one inset. It hangs on the MODE rather
     than on a caller class — it used to be `.manager-travel-actor-popover`'s in
     `styles/fabricate.css`, which the realm-override picker could only have reached by
     borrowing a class named after actors. */
  .manager-travel-popover.is-compact-option-rows {
    padding: 5px;
  }

  /* The header is a column flex item too, and the same shrink applies to it. */
  .manager-travel-popover.is-compact-option-rows .manager-travel-popover-header {
    flex: 0 0 auto;
  }

  /* The row that IS the current value: an accent fill beside the marker glyph, so the
     marked row reads as marked without relying on an icon alone. */
  .manager-travel-popover.is-compact-option-rows .manager-travel-option[aria-selected='true'] {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  /* Pointer feedback, restated for this mode. The compact row's resting
     `background: var(--fab-bg-3)` below computes to (0,4,0) and so OUTRANKS the
     global `.manager-travel-option:hover` — meaning the shared hover silently stopped
     landing the moment a caller opted in. Issue 1464 took `.fabricate-manager` off that
     global rule so the primitive paints outside the manager, which widens the gap rather
     than closing it: the mode's own rules still win, by two classes now instead of one. The actor picker
     had already lost it; opting the realm-override picker in would have taken pointer
     feedback off ten clickable realms as well. */
  .manager-travel-popover.is-compact-option-rows .manager-travel-option:hover {
    border-color: var(--fab-border-strong);
    background: var(--fab-surface-raised);
  }

  /* The selected row keeps its accent on hover rather than reverting to the neutral
     surface, so hovering the current value does not read as deselecting it. */
  .manager-travel-popover.is-compact-option-rows
    .manager-travel-option[aria-selected='true']:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
  }

  /* The compact search row, matching `.manager-travel-picker-inline`'s 30px bordered field
     with its leading glyph — so a compact picker that keeps its value-bearing trigger reads
     as the same control as one that swaps its trigger for the field. `margin: 0 7px` lands
     its edges on the option rows' 7px list padding rather than on the popover's 5px frame,
     so the field and the rows below it share one left edge.

     The row IS the field, so the ring goes on the row: the input inside it is borderless,
     and an outset ring around a borderless input lands outside the boundary a GM sees —
     the defect `styles/fabricate.css` records at the composite search fields.

     `flex: 0 0 auto` is LOAD-BEARING, not tidiness. The popover is a column flex container
     under a `max-height` cap, so a full option list makes every item a shrink candidate:
     with the default `flex-shrink: 1` the `height: 30px` below is only a hint, and the
     field is squeezed to whatever is left over — visibly shorter than the identical
     add-a-member field two columns away, and by a different amount per list length. */
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
    /* 11.5px, matching the ROWS this field filters and the add-a-member field two columns
       away — not the 10.5px of `.manager-travel-picker-inline`, which is sized to a
       210px-column button rather than to a list. A field smaller than its own list reads
       as secondary to it. */
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

  /* The scroll box carries NO right padding: the reserved gutter IS the right inset, so
     it replaces padding instead of adding to it.

     `both-edges` was the obvious reading and it is wrong, because it fixes the wrong
     asymmetry. It equalises a row's left and right gaps by reserving ~10px on each side —
     but it reserves them INSIDE the scroll box only, so the rows end up 10px inboard of
     the header and the search field, which are not in that box. Measured at 268px: rows
     43->265 under a header and field at 33->275, a visible three-step indent, plus 20px of
     a 256px content box permanently blank whether or not the list scrolls.

     Single-edge `stable` with `padding-right: 0` puts every left edge on 7px exactly and
     leaves the right edges differing by the gutter minus that padding (~3px) rather than
     by the full gutter. The gutter width is engine-determined, so no static margin on the
     header or the field could have matched `both-edges` anyway. */
  .manager-travel-popover.is-compact-option-rows .manager-travel-popover-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 7px 0 7px 7px;
    scrollbar-gutter: stable;
    scrollbar-width: thin;
  }

  /* One 7px inset on every side of the row, and a portrait sized to sit INSIDE it
     (24px + 2 × 7px padding + 2 × 1px border = 40px) rather than fill it. At the
     shipped 32px the portrait left 2px above and below itself against 8px to its
     left, so a row read as an image jammed into a box that was generously padded
     everywhere else. */
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

  /* An option that carries an ICON rather than an `img` gets the SAME 24px leading tile
     the portrait gets, instead of a bare glyph. Without it the two compact pickers on one
     card disagree twice over: the realm rows' names started at a different indent from the
     actor rows' names, and a 14px glyph against a 24px tile put different visual weight at
     the head of otherwise identical rows.

     `:not(.manager-travel-option-marker)` is required, not defensive — the trailing
     "this is the current value" check is also a direct `<i>` child of the row, and tiling
     it would frame the marker as though it were a second leading element. */
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

  /* Pinned, not inherited. The row is a `<button>` under `.fabricate-manager button {
     font: inherit }`, so its label was rendering at the manager's inherited body size —
     larger and heavier than every other list on this card, including the add-a-member
     candidate rows (`PartyAddMemberPanel.svelte`) that sit directly beneath it in the same
     column at 11.5px/500 over a 9.5px meta. Stating the scale here puts both compact
     pickers and that list on one type family instead of leaving it to whatever the
     manager root happens to inherit from Foundry. */
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

  /* ── THE TWO-LINE TRIGGER (issue 1373) ─────────────────────────────────────
     The trigger-side twin of `.manager-travel-option-meta` above, and deliberately the same
     shape: a column that may shrink to nothing, with the second line quiet, capped and
     ellipsised so a long address cannot widen the control past its container.

     BOTH ELEMENTS ARE WRITTEN BY THIS COMPONENT, so these are ordinary scoped rules — no
     `:global()` and no dependence on `styles/fabricate.css`, which has no rule for either
     class. `triggerMeta` is empty at every shipped call site, so neither element exists
     anywhere but the Tool editors' replacement tile today. */
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
