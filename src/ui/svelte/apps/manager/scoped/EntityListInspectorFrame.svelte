<!-- Svelte 5 runes mode -->
<!--
  The ONE list-plus-inspector composition behind every scoped-entity list (issue 1380, epic 1357).

  Three lanes need it — the world catalogues (6a-ii), the system-scope rules lists (6b) and the
  tool rules list (6c) — and three independent compositions is not a tidiness argument. Issue 1050
  shipped the SonarCloud duplication gate red at 5.3% with 93 of 98 duplicated lines inside one
  component, and `.svelte` IS duplication-analysed. So the composition is built once here and
  configured per scope; `EntityCatalogueShell` and `EntityRulesListShell` are its two callers and
  neither may inline it.

  ── THE COMPOSITION IS ASYMMETRIC BY SCOPE, AND THAT IS A DECISION ────────────────────────────
  All seven world scoped routes are classified `full-width-2-track` in
  `CraftingSystemManagerRoot.svelte`, so `{#if !fullWidthLayout}` suppresses the shell's shared
  300px `.manager-inspector` aside on every one of them: a world catalogue must draw its own
  inspector column inside `<main>` or a GM gets none at all. The three system-scope routes
  (`components`, `essences`, `tools`) are ABSENT from that classification, so their shared aside is
  live and already holds the root's browser inspector — a second column beside it would put two
  inspectors on screen, and neither gateway file may be opened to reconcile them.

  So the inspector region renders ONLY when an `inspectorBody` snippet is supplied. That is the
  whole mechanism: the catalogue shell always supplies one, the rules-list shell never does.

  ── COMPOSED, NEVER RESTATED ──────────────────────────────────────────────────────────────────
  Selection reduction is `src/utils/bulkSelectionModel.js`, page arithmetic is
  `src/utils/browserPagination.js`, and filter/sort/memoisation is
  `src/utils/scopedEntityListModel.js`. The chrome is the shipped primitives:
  `BulkSelectionToolbar`, `Pagination`, `EmptyState`, `SelectionCheckbox`, `Medallion`,
  `StatusPill`, `Callout`.

  THE CLAMP IS A DEFECT SURFACE, NOT FREE SAFETY. `paginateRows` clamps the index IT RETURNS;
  `Pagination` computes its displayed range from the index its OWNER hands it. A frame that
  clamped for slicing and passed `Pagination` its own raw state would render zero rows under a
  footer reading "Showing 51–3 of 3", with no empty state, because the filtered set is not empty.
  Both the slice and the footer therefore read `page.pageIndex`, and an effect writes it back.

  `BulkSelectionToolbar` RENDERS UNCONDITIONALLY, at `count: 0` / `pageSelectionState: 'none'`.
  The primitive appends below the filter bar with a hairline where `design-system/spec.md` says the
  selection bar replaces it in place; a bar that appears on the first tick makes the list jump one
  row exactly as the GM's cursor lands on it. Always-present removes the jump without touching the
  primitive or the host sheet.

  `Pagination` takes `persistent={true}`. Its default is `false`, which hides the footer below a
  page's worth of rows, and `design-system/spec.md` requires a browse screen never to hide its
  disabled arrows. The prototype draws no foot pager at all on its six-row catalogue frame; that
  difference is kept deliberately, and the pager's own comment in the template records why.

  ── THE ROW IS NOT A BUTTON ───────────────────────────────────────────────────────────────────
  It contains `SelectionCheckbox`'s `<input>` and `<label>`, so the click target is the NESTED
  identity `<button>` and the box sits at the row's trailing edge after the actions, exactly as
  `ComponentRow` places it. A `role="button"` wrapper would nest interactive content and inherit
  Foundry's keybinding trap on a focused div.

  `is-selected` and `is-bulk-selected` are DIFFERENT QUESTIONS and one row carries both:
  "you are here" versus "this row is in the set the next Apply writes to". The inspected row also
  carries `aria-current`.

  ── THREE NO-CONTENT STATES, NOT TWO ──────────────────────────────────────────────────────────
  Unavailable (the corpus could not be read), empty (the world holds none), and
  filtered-to-nothing. Telling a GM their world is empty when a query matched nothing is the same
  class of harm as offering a destructive action over a corpus nobody could read, so `available:
  false` suspends search, the filters, the sort, the selection toolbar and every row affordance,
  and states itself through a `Callout` rather than through the no-state hero with different copy.

  ── WHY THE ROW CLASS AND ALL FIVE HOOKS ARE PASSED EXPLICITLY ────────────────────────────────
  `BulkSelectionToolbar` renders `<div class="{rowClass} is-selection">` in its OWN template, so a
  scoped rule here cannot reach it and the row metrics have to be authored in the host sheet — the
  defect `styles/fabricate.css` already records against the essence view. Its `rowClass` and its
  five hook attributes all DEFAULT to the Component Studio's strings; inheriting them would make
  six scoped screens retune silently whenever that studio does, so every one is stated here.

  ── COMPONENT-OWNED STYLING USES STATIC CLASS NAMES ───────────────────────────────────────────
  Svelte can then prove each selector is used and `lint:svelte:warnings` stays at zero. The
  container query below is this component's, including the stacked layout under a narrow
  container; only the markup this file does NOT own (the toolbar primitive's row) is authored in
  `styles/fabricate.css`.

  Props:
   - scope: one entity type's `worldScope` projection. Every shape fact is read from it —
     `available`, `entries`, `sections`, `sourceLinked`, `hasColorToken` — never inferred from
     `scope.entityType` at a call site.
   - systems: the crafting-system roster, `{id, name}` ONLY (`projectSystems` narrows to those
     two). `name` carries an id fallback because a field the allowlist omits reads `undefined`.
   - systemId: `''` in world scope; the addressed system in system scope.
   - title / subtitle / icon / emptyTitle / emptyHint: pre-localized, from the lane.
   - filters / sorts: the lane's extra descriptors, appended to this frame's own.
   - searchOf(entry): the per-entry searchable string; memoised per `(entries, searchOf)`.
   - rowActions: `{id, icon, label, run(entry)}` DESCRIPTORS, not markup, so both shells declare
     their navigation without either of them hand-writing a button run.
   - rowMeta(entry, ctx) / inspectorBody(entry, ctx) / bulk(selectedIds, ctx): see the ctx note
     on `rowContext` below.
   - inspectorKicker: the uppercase eyebrow over the inspector's identity block (`WORLD
     DEFINITION`, `SELECTED ESSENCE`). Pre-localized, from the lane, because it names the LAYER
     the panel is showing and only the lane knows which one it is.
   - rowTrailing(entry, ctx): the row's interactive trailing content, beside the row actions.
   - describeEntry(entry): the LINKED SOURCE's description, for the second rung of the row and
     inspector description. Not a snippet: it answers a string, so the frame can apply the same
     precedence in both places rather than a lane rendering two copies of it.
   - inspectorCaption(entry): the one line under the inspected name — the slot the prototype
     fills with a colour name and its hex. A SNIPPET rather than a string prop, because what
     belongs there is per-entity and per-scope (a colour for an essence, a source item for a
     component) and only the lane knows which. The frame renders the colour TOKEN NAME when no
     lane supplies one.
   - inspectorFoot(entry): the full-width action pinned to the BOTTOM of the inspector, outside
     its scroll area, exactly as the pagination bar sits outside the list's.
   - columnLead(): a scope-wide card standing above the toolbar INSIDE the list column, so the
     inspector beside it keeps the whole route's height. See the prop note.
   - restingTitle / restingHint: the resting inspector's own copy, replacing the generic
     `Nothing selected` over the page subtitle. See the prop note.
   - countUnit: the plural noun the result count is stated in (`essences`). The count itself is
     this frame's arithmetic; only the word is the lane's.
   - selectedId: the inspected row, and BINDABLE — the same idiom `armedToken` uses two lines
     below, for the same reason. A row click writes it, so the owner and this frame never hold
     different values, and an owner that sets it overrides the click at any time including back
     to `''` to return the list to resting. A deep link, a route parameter restored on re-entry,
     a re-selection after a create or a delete, and — the sharp one — a page whose route-exit
     guard REFUSES a navigation and has to put the selection back all drive it from outside.
     THAT LAST CASE IS WHY IT IS A BINDING RATHER THAN A VALUE PLUS INTERNAL STATE. A page that
     refuses a navigation never adopted the refused id — refusing is exactly not adopting it — so
     its own value still holds the PREVIOUS one, and "putting the selection back" means writing
     the value it last pushed. Against a frame holding separate internal state that write is a
     no-op, and no flip-flop rescues it: signals settle before effects run, so an effect sees
     only the final value and finds it unchanged. With the click written through, the refused
     click leaves the owner holding the new id and the restore is a genuine change.
     AN OWNER'S BOUND STATE MUST BE INITIALISED. Svelte 5 THROWS `props_invalid_value` when a
     bindable prop has a setter and the incoming value is `undefined`, rather than falling back
     to the default here — so `let selected = $state();` with no initialiser kills the whole
     mount, where `let selected = $state('');` is fine. It is loud, immediate and carries a
     documented code, and `armedToken` below has carried the identical shape since it shipped,
     which is why this is recorded rather than defended against: a runtime guard would turn a
     named crash into a silently ignored binding.
   - onSelect(entityId): called after the write, so an owner may also react without binding.
   - armedToken: BINDABLE. The frame clears it on any selection, filter, sort or page change, so
     the owner's single-armed-token invariant holds across a re-projection.
-->
<script>
  import { paginateRows } from '../../../../../utils/browserPagination.js';
  import {
    describeBulkSelection,
    pruneBulkSelection,
    setBulkSelection,
    toggleBulkSelection,
  } from '../../../../../utils/bulkSelectionModel.js';
  import {
    createScopedEntityListModel,
    defaultScopedSearchText,
    scopedEntryName,
    SYSTEM_MEMBERSHIP_FILTERS,
    WORLD_MEMBERSHIP_FILTERS,
  } from '../../../../../utils/scopedEntityListModel.js';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import Medallion from '../../../components/Medallion.svelte';
  import Pagination from '../../../components/Pagination.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import BulkSelectionToolbar from '../BulkSelectionToolbar.svelte';
  import Callout from '../Callout.svelte';
  import EmptyState from '../EmptyState.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import ManagerSearchField from '../../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../../components/ManagerToolbar.svelte';
  import SegmentedControl from '../SegmentedControl.svelte';
  import { createScopedListBrowserState } from '../../../../../utils/managerBrowserViewState.js';

  let {
    scope = null,
    systems = [],
    systemId = '',
    title = '',
    subtitle = '',
    icon = 'fas fa-cubes-stacked',
    emptyTitle = '',
    emptyHint = '',
    filters = [],
    sorts = [],
    searchOf = defaultScopedSearchText,
    // The list search box's placeholder. The lane supplies it because the prototype names what is
    // being searched — `Search essences…` — and only the lane knows the noun; the shipped generic
    // `Search…` stays the fallback so a caller that says nothing renders as before.
    searchPlaceholder = '',
    rowActions = [],
    rowMeta = undefined,
    inspectorBody = undefined,
    inspectorKicker = '',
    inspectorCaption = undefined,
    inspectorFoot = undefined,
    // WHICH FACT THE ROW'S SECOND LINE CARRIES: `description` (the shipped default, and what the
    // component and essence catalogues draw) or `meta`, which moves the lane's `rowMeta` snippet
    // out of the trailing column and under the name. See the row markup for the design argument.
    rowSecondLine = 'description',
    // The row's INTERACTIVE trailing content, rendered in the meta column beside the actions.
    // Separate from `rowMeta` because `rowSecondLine: 'meta'` moves that snippet inside the
    // identity `<button>`, where a control is invalid DOM; see the row markup.
    rowTrailing = undefined,
    // ── WHAT FOLLOWS THE NAME ON THE NAME LINE (issue 1371 r8-cat) ──────────────────────────
    // An INERT snippet rendered inside the identity `<button>`, directly after the name, which
    // is where the reference draws a row's source pill and its exception flag (`proto:601`).
    // `rowMeta` cannot answer this: under `rowSecondLine: 'description'` that snippet renders in
    // the TRAILING column, and under `'meta'` it renders on the second line — neither is the
    // name line. Nothing here may be interactive, for the reason the second-line note gives.
    //
    // Absent by default, so every shipped caller renders unchanged.
    rowNameTrailing = undefined,
    // ── WHETHER THE FRAME DRAWS ITS OWN SOURCE BADGE (issue 1371 r8-cat) ────────────────────
    // `true` is the shipped behaviour: a `Linked` / `No source item` pill in the trailing column
    // under `'description'`, and the warning half inside the fact run under `'meta'`. A lane that
    // draws the source on the NAME LINE itself — as the reference's component row does, where the
    // pill states the source TYPE rather than merely its presence — turns this off, so one row
    // never carries two answers to one question.
    rowSourceBadge = true,
    // The LINKED-SOURCE rung of `descriptionOf`. A lane that can resolve its entity's source
    // document answers that document's description here, and `''` when it cannot; see
    // `descriptionOf` for why the rung is the lane's and the PRECEDENCE is the frame's.
    describeEntry = undefined,
    // ── THE ROW'S NAME, WHEN THE LANE CAN RESOLVE A BETTER ONE ──────────────────────────────
    // `scopedEntryName` is the shipped answer and stays the default: the entity's own `name`,
    // falling back to its id. The world Tool catalogue overrides it because a Tool's display
    // label is OPTIONAL — the entry editor draws it empty with the linked Item's name as the
    // placeholder, under `Leave blank to use the linked Item name.` (issue 1373) — and only the
    // lane holds the Item roster that resolves the blank. Without this the row of a Tool that
    // takes the Item's name would print the record id under a screen that promised otherwise.
    //
    // It answers a NAME, not a fallback rung: the frame keeps its own `|| id` last resort, so a
    // lane that resolves nothing is exactly the shipped behaviour.
    nameEntry = undefined,
    // ── WHAT OPENS THE LIST, ABOVE THE FIRST ROW ────────────────────────────────────────────
    // A snippet rendered INSIDE the scroller, before the rows, and only when there are rows to
    // open. The world Tool catalogue puts its create-from-drop zone here, which is where the
    // design draws it — a full-width dashed zone directly under the toolbar as the list's first
    // element (`tmp/proto/tool-catalogue.png`) — rather than sharing the band above the toolbar
    // with the world breakage card and taking a third of its width (issue 1373).
    //
    // Absent by default, so the component and essence catalogues render unchanged. It is NOT a
    // row: it sits outside the `<ul>`, because a drop target is not a list item and every row
    // affordance below — selection, inspection, the row action — would be a lie on it.
    listLead = undefined,
    // ── WHAT STANDS ABOVE THE TOOLBAR, INSIDE THE LIST COLUMN ───────────────────────────────
    // A snippet rendered as the FIRST child of `.manager-scoped-list-column` — above the filter
    // row, outside the scroller, and inside the middle track rather than across the whole frame.
    //
    // The world Tool catalogue's breakage card is what needed it (issue 1373, maintainer
    // feedback round 2). That card is one value for every Tool in the world, so it is neither a
    // row nor an entity and the page drew it as a SIBLING of this frame — which put it across
    // the inspector's track as well as the list's, and pushed the inspector down so it started
    // a card's height below the app header instead of running the whole route. The design draws
    // it inside the list column with the inspector beside it, full height (`proto:1956`-`1959`).
    //
    // Absent by default, so the component and essence catalogues render unchanged.
    columnLead = undefined,
    countUnit = '',
    // Whether the toolbar offers the world/system MEMBERSHIP `<select>`. Default ON, so every
    // other caller renders unchanged. The essence catalogue turns it off: the prototype's toolbar
    // is `[All] [search] SORT BY [Name] [Asc]  6 of 6 essences` and carries no such control
    // (`essences.png`), and on a WORLD catalogue the axis it filters — "held by at least one
    // system" — is already the `n/24 SYSTEMS` stat on every row and the `13 / 24` in the
    // inspector, so the select spent toolbar width on a question the list already answers.
    membershipFilter = true,
    // ── THE TOOLBAR AS TWO ROWS (issue 1371 r8-cat) ──────────────────────────────────────────
    // `false` keeps the one row every caller renders today. `true` is the reference's toolbar
    // (`proto:576`-`586`): a lead row holding the search field and the lane's own filters, and
    // the filter row below it holding membership, a hairline, the sort pair and the count. The
    // FILTER ROW keeps its class and its identity either way — it is the row the selection band
    // joins — so only what stands ABOVE it moves.
    splitToolbar = false,
    // ── THE LEAD ROW'S CONTROL RUNG (issue 1371 r9-cat, maintainer ruling M12b) ──────────────
    // The control HEIGHT the search field and the lead row's lane-filter selects take, named
    // after the rung rather than after an adjective, exactly as `ManagerSearchField`'s own
    // `size` is: `''` is the shipped 34px control and `'38'` is the ladder's next rung up
    // (`design-system/spec.md`: 26 / 28 / 30 / 34 / 38 / 44).
    //
    // IT GOVERNS THE LEAD ROW AND NOT THE FILTER ROW, because that is what the reference draws:
    // `proto:577`-`578` puts the search field and the source-type select at 38px, and
    // `proto:582`-`585` puts the membership select, the sort select and the direction toggle one
    // row below at 32 — a RETIRED rung, so those three stay on the ladder's 34 under D-C and are
    // deliberately NOT moved by this prop. A single "toolbar size" would have taken all five.
    //
    // Anything outside the closed set renders the shipped 34px control: the field's own prop
    // drops an unrecognised value, and the select's class is emitted only for a literal match, so
    // a typo is the default rather than an unstyled `is-size-<whatever the caller composed>`.
    toolbarLeadSize = '',
    // ── THE ROW'S LEADING TILE (issue 1371 r9-cat, UX finding F12) ───────────────────────────
    // A `Medallion` descriptor — `{variant, size, glyph}`, the primitive's OWN prop names — for
    // the tile at the head of every list row. `null` is the shipped 40px bordered artwork tile,
    // so the essence and tool catalogues are byte-identical.
    //
    // It is a descriptor rather than three props because the three are ONE statement about one
    // element and are never set apart: the reference's row chip is a 38px borderless slate square
    // carrying a 15px tinted glyph (`proto:600`), and a caller that set the variant without the
    // size would get the shipped tile's geometry wearing the reference's edge. The primitive's
    // own note explains why the size and the glyph stayed its arguments rather than folding into
    // the variant; this prop keeps them together at the one place a caller states them.
    //
    // The INSPECTOR's medallion is deliberately not covered. It is a different site at a
    // different size on every catalogue, and no reference or region asks it to move.
    rowMedallion = null,
    // ── THE SELECTION BAND'S SELECT-ALL, AND WHAT IT REACHES (issue 1371 r9-cat, gap-list 37) ──
    // `'results'` (the shipped band: a tri-state master box for the page, and `Select all {n}
    // results` for the whole filtered corpus) or `'shown'` — the reference's band, which draws no
    // master box at all and offers one text action, `Select all {n} shown` (`proto:592`).
    //
    // Threaded straight to `BulkSelectionToolbar`, whose own prop it is. It is a SCOPE and not a
    // boolean because that is what changes: `results` and `shown` are two populations, and the
    // caller has to hand over the second one's count and its action as well — this frame does,
    // from `page.rows`, which is literally the rows it is rendering.
    //
    // WHAT IT COSTS, STATED: under `'shown'` the primitive renders NOTHING at zero selection, so
    // the resting toolbar loses the `All` box. That is the reference's own arrangement — a
    // selection opens from the ROW's checkbox (`proto:603`) and the band completes it — and it is
    // the trade the band's own note below already describes.
    selectAllScope = 'results',
    // The VISIBLE caption on the select-all box. The prototype's reads `All` where the shipped
    // primitive says `Select all`. Only the caption moves: the primitive's `ariaLabel` is
    // untouched, because `All` is not an accessible name a screen-reader user can act on.
    selectAllLabel = '',
    bulk = undefined,
    // ── THE RESTING INSPECTOR'S OWN COPY (issue 1373, maintainer feedback round 2) ───────────
    // What the panel says while nothing is selected. It shipped as a generic `Nothing selected`
    // over the PAGE SUBTITLE, which is the sentence already printed in the header a few pixels
    // above it — so on an empty catalogue the one column that could have told a GM what the
    // panel is for repeated the header instead. The system Tool Rules rail states the verb
    // (`Select a Tool` / `Choose a Tool to inspect its behaviour.`), and a lane that names its
    // noun gets to say the same thing here.
    //
    // Both default to exactly what shipped, so a lane that names neither renders unchanged.
    restingTitle = '',
    restingHint = '',
    selectedId = $bindable(''),
    onSelect = () => {},
    // ── THE FIRST ROW IS INSPECTED ON OPEN, WHEN A LANE ASKS (issue 1371 r13-cat, M14) ─────
    // "the component library should auto-select the first component when it is opened." OPT-IN
    // and OFF by default, so a frame that says nothing opens on the resting inspector it always
    // did and the essence and tool catalogues are byte-identical. The effect below fires ONLY
    // while nothing at all is selected: a selection the owner hands in — a deep link, a restore
    // after a refused navigation, a remembered id — is never fought, and a row the GM chose stays
    // chosen through a sort, a page turn or a filter that hides it (the frame keeps the id so
    // the row comes back when the filter clears; see `inspectedEntry`). It selects the first row
    // of the PAGE on screen, which on a remembered page is that page's first, and it does NOT
    // focus the inspector the way `inspect()` does for a click: a selection the frame made on
    // its own must not move the keyboard.
    //
    // THE ONE THING IT GIVES UP, recorded: while it is on and rows exist, an owner cannot park
    // the list on the resting inspector by writing `''`, because that is exactly the state it
    // fills. No caller of this opt-in does; the world Component catalogue never writes `''`.
    autoSelectFirst = false,
    armedToken = $bindable(''),
    // ── THE LIST'S VIEW-STATE IS LIFTED (issue 1438) ─────────────────────────────────────
    // Search, membership, the lane filters, the sort pair and the page live on an object the
    // MANAGER ROOT owns, threaded here by whichever shell mounts this frame. Opening an entry
    // switches `currentView` to the entry route, which unmounts the catalogue page, the shell
    // and this frame together — so a slot held in any of the three would die with the trip.
    // Unbound, the local fallback below keeps every control reactive in-component.
    //
    // The BULK SELECTION is not on it, deliberately: a selection is an in-progress action over
    // a set rather than a filter, and its owner is the lane that supplies the `bulk` descriptor.
    browserState = $bindable(null),
  } = $props();

  /**
   * The row class and the five hook names `BulkSelectionToolbar` wears here.
   *
   * STATED, never inherited. See the header: every one of these has a Component Studio default.
   */
  const TOOLBAR_ROW_CLASS = 'manager-scoped-list-filter-row';
  const TOOLBAR_ATTR = 'data-scoped-list-selection-toolbar';
  const PAGE_BOX_ATTR = 'data-scoped-list-select-all-page';
  const COUNT_ATTR = 'data-scoped-list-selection-count';
  const RESULTS_ATTR = 'data-scoped-list-select-all-results';
  const CLEAR_ATTR = 'data-scoped-list-clear-selection';

  /**
   * The scoped list's page window (issue 1373, maintainer feedback round 2).
   *
   * TEN, WHICH IS THE SMALLEST SIZE THE PAGER ITSELF OFFERS. The foot bar is `multiPageOnly`
   * since issue 1372 - it renders past one page and not before - and at a twenty-five row
   * window an eleven-tool world catalogue is one page, so a GM scrolled eleven rows under a
   * screen that offered no page control at all. The maintainer's ruling is stated on the pair:
   * eleven rows must show a pager and three must not, which is only true of a window at or
   * below ten. Ten is also what the column actually holds - about seven rows at 900px - so the
   * window and the viewport no longer disagree by a factor of three.
   *
   * It is the FRAME's default and `createScopedListBrowserState` restates it, because a lifted
   * view-state seeds its own `pageSize` and would otherwise pin the old window on every
   * surface that binds one.
   */
  const DEFAULT_PAGE_SIZE = 10;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /**
   * One row's displayed name.
   *
   * THE PRECEDENCE IS THE FRAME'S and the extra rung is the lane's, exactly as `descriptionOf`
   * splits the same question: the shipped `scopedEntryName` first, then whatever the lane can
   * resolve, then the record id. A lane that supplies no `nameEntry` gets `scopedEntryName`
   * unchanged, which is what every catalogue but the Tool one wants.
   *
   * @param {object} entry
   * @returns {string}
   */
  function rowName(entry) {
    const own = String(entry?.entity?.name ?? '').trim();
    if (own) return own;
    const resolved = typeof nameEntry === 'function' ? String(nameEntry(entry) ?? '').trim() : '';
    return resolved || scopedEntryName(entry);
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  const model = createScopedEntityListModel();

  let ownBrowserState = $state(createScopedListBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const query = $derived(String(ui.searchTerm || ''));
  const membership = $derived(ui.membership || 'all');
  const filterValues = $derived(ui.filterValues || {});
  // THE SORT IS TWO CONTROLS, NOT ONE `<select>` OF COMPOSITE IDS.
  //
  // The prototype's toolbar reads `SORT BY [Name ▾] [⇅ Asc]` (`essences.png`) — a KEY picker and
  // a DIRECTION toggle — where this frame shipped a single select offering `Name A–Z`,
  // `Name Z–A` and `Most systems`. The composite list is why the direction was unreachable for
  // the membership key at all: `systems-asc` did not exist, and nothing said so.
  //
  // The model still takes ONE id. The decomposition is presentational and composes back to it.
  const sortKey = $derived(ui.sortKey || 'name');
  const sortDirection = $derived(ui.sortDirection || 'asc');
  const pageIndex = $derived(ui.pageIndex || 0);
  const pageSize = $derived(ui.pageSize || DEFAULT_PAGE_SIZE);
  let selectedIds = $state(new Set());
  /** @type {HTMLElement|null} */
  let inspectorElement = $state(null);

  const available = $derived(scope?.available === true);
  const entries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  const roster = $derived(Array.isArray(systems) ? systems : []);

  const membershipOptions = $derived(
    systemId ? SYSTEM_MEMBERSHIP_FILTERS : WORLD_MEMBERSHIP_FILTERS
  );

  // The selection band's population, resolved once. A closed comparison rather than a truthiness
  // test, so an unrecognised scope keeps the shipped band exactly as `BulkSelectionToolbar`'s own
  // resolver does with the same value.
  const shownScope = $derived(selectAllScope === 'shown');

  const laneFilters = $derived(Array.isArray(filters) ? filters : []);
  const laneSorts = $derived(Array.isArray(sorts) ? sorts : []);

  /**
   * The class a LEAD-ROW select carries when the caller asked for the 38px rung, and `undefined`
   * otherwise.
   *
   * `undefined` rather than `''`, and that is the whole reason this is a function rather than a
   * `class:is-size-38` directive: a `class:` directive writes the attribute whatever the value
   * is, so an unset opt-in would take every other catalogue's `<select>` from no `class`
   * attribute at all to `class=""`. Svelte drops an `undefined` attribute, so a caller that does
   * not ask for the rung renders the exact markup it always did — which the default-output proof
   * compares byte for byte.
   *
   * The token is written as a LITERAL, never composed from `toolbarLeadSize`.
   * `scripts/lib/stylesheetLiveClasses.js` cannot see a customer for a class a component builds
   * by template, so `is-size-${size}` would report the sheet's rule as dead; the same reason
   * `ManagerSearchField` maps its rung to a literal instead of interpolating one.
   *
   * @param {object} filter a lane filter descriptor.
   * @returns {string|undefined}
   */
  function leadSelectSizeClass(filter) {
    const onLeadRow = (filter?.toolbarRow ?? 'lead') === 'lead';
    return toolbarLeadSize === '38' && onLeadRow ? 'is-size-38' : undefined;
  }

  /**
   * The row medallion's three arguments, merged over the shipped tile.
   *
   * The defaults restate `Medallion`'s own — `variant: ''`, `size: 40`, `glyph: 0` — rather than
   * omitting the attributes under an `{#if}`, because a single always-present element is what
   * keeps the unset case byte-identical: two branches of the same tag is how a keyed list starts
   * re-creating the node it used to update.
   */
  const rowMedallionSpec = $derived({
    variant: '',
    size: 40,
    glyph: 0,
    ...(rowMedallion && typeof rowMedallion === 'object' ? rowMedallion : {}),
  });

  // A LANE SORT IS ITS OWN WHOLE ORDER, so it is passed through verbatim and the direction
  // toggle goes inert against it. A descriptor supplies one `compare`, not a pair, so composing
  // a direction onto its id would produce an id `project` does not know and fall back silently to
  // name order — a control that changes nothing while looking as though it did.
  const laneSortIds = $derived(new Set(laneSorts.map((descriptor) => descriptor?.id)));
  const directional = $derived(!laneSortIds.has(sortKey));
  const sort = $derived(directional ? `${sortKey}-${sortDirection}` : sortKey);

  const projected = $derived(
    model.project({
      entries,
      searchOf,
      query,
      membership,
      systemId,
      filters: laneFilters,
      filterValues,
      sort,
      sorts: laneSorts,
    })
  );

  // THE RETURNED INDEX IS THE ONLY ONE ANYTHING READS. See the header.
  const page = $derived(paginateRows(projected.rows, { pageIndex, pageSize }, DEFAULT_PAGE_SIZE));

  const filtered = $derived(
    query.trim() !== '' ||
      membership !== 'all' ||
      laneFilters.some((filter) => {
        const value = filterValues[filter?.id];
        return typeof value === 'string' && value !== '' && value !== 'all';
      })
  );

  const selection = $derived(
    describeBulkSelection({
      pageIds: page.rows.map((entry) => entry.id),
      filteredIds: projected.rows.map((entry) => entry.id),
      selectedIds,
    })
  );

  // A row that leaves the FILTERED set stops being inspected: the alternative is an inspector
  // rendering a record the list no longer shows, with no way back to it.
  const inspectedEntry = $derived(projected.rows.find((entry) => entry.id === selectedId) ?? null);

  // The clamp writes back, so the owner's state and the footer cannot disagree on the next pass.
  // Converges in one tick: once they are equal the effect assigns nothing.
  $effect(() => {
    if (page.pageIndex !== pageIndex) ui.pageIndex = page.pageIndex;
  });

  // THE FIRST SHOWN ROW, WHEN NOTHING IS CHOSEN AND THE LANE OPTED IN (M14; see the prop note).
  // Guarded on the prop FIRST, so an unset frame never reads a row here. `selectedId` is written
  // through the binding exactly as `inspect()` writes it, and `onSelect` fires so an owner that
  // reacts without binding hears it too. Converges in one pass: once written, the guard returns.
  $effect(() => {
    if (!autoSelectFirst || selectedId !== '') return;
    const first = page.rows[0];
    if (!first) return;
    selectedId = first.id;
    onSelect(first.id);
  });

  // A filter that shrinks the list must not leave a phantom id in `Apply to {N}`. Guarded on
  // SIZE because `pruneBulkSelection` returns a new Set every call and an unguarded assignment
  // would re-trigger this effect forever.
  $effect(() => {
    const known = projected.rows.map((entry) => entry.id);
    const pruned = pruneBulkSelection(selectedIds, known);
    if (pruned.size !== selectedIds.size) selectedIds = pruned;
  });

  /**
   * Disarm. Any selection, filter, sort or page change clears the armed token, so a Remove armed
   * against one row cannot be confirmed against a different one after the list re-projects.
   */
  function disarm() {
    if (armedToken) armedToken = '';
  }

  function changeQuery(value) {
    ui.searchTerm = String(value ?? '');
    ui.pageIndex = 0;
    disarm();
  }

  function changeMembership(value) {
    ui.membership = String(value ?? 'all');
    ui.pageIndex = 0;
    disarm();
  }

  function changeFilter(id, value) {
    ui.filterValues = { ...filterValues, [id]: String(value ?? '') };
    ui.pageIndex = 0;
    disarm();
  }

  function changeSortKey(value) {
    ui.sortKey = String(value ?? 'name');
    ui.pageIndex = 0;
    disarm();
  }

  function toggleSortDirection() {
    ui.sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    ui.pageIndex = 0;
    disarm();
  }

  function changePage(next) {
    ui.pageIndex = next;
    disarm();
  }

  function changePageSize(next) {
    ui.pageSize = next;
    ui.pageIndex = 0;
    disarm();
  }

  function clearFilters() {
    ui.searchTerm = '';
    ui.membership = 'all';
    ui.filterValues = {};
    ui.pageIndex = 0;
    disarm();
  }

  /**
   * The colour caption's raw token, for the lane's `inspectorCaption` snippet.
   *
   * The frame does not RESOLVE it: what a caption says about a colour is scope copy, and the one
   * resolution this app has — the live `--fab-tag-*` value at the rendering element — belongs
   * beside the screens that state it. The frame passes the token through and renders the name
   * alone when no lane supplies a snippet.
   *
   * @param {string} token a `colorToken` value, e.g. `lavender`.
   * @returns {string} `''` when unset, so the caller renders nothing rather than a blank line.
   */
  function colourCaption(token) {
    const name = String(token ?? '').trim();
    if (name === '') return '';
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function inspect(entityId) {
    // THE WRITE IS THE WHOLE MECHANISM. It goes to the binding rather than to internal state, so
    // this frame and its owner can never hold different ideas of what is inspected — which is
    // what makes a later restore to a previous id a real change rather than a no-op.
    selectedId = entityId;
    disarm();
    onSelect(entityId);
    // `tabindex="-1"` makes the inspector a focus TARGET without a tab stop, so the keyboard
    // follows the selection into the panel that just changed.
    inspectorElement?.focus?.();
  }

  function toggleRow(entityId) {
    selectedIds = toggleBulkSelection(selectedIds, entityId);
    disarm();
  }

  function togglePage(on) {
    selectedIds = setBulkSelection(
      selectedIds,
      page.rows.map((entry) => entry.id),
      on
    );
    disarm();
  }

  function selectAllResults() {
    selectedIds = setBulkSelection(
      selectedIds,
      projected.rows.map((entry) => entry.id),
      true
    );
    disarm();
  }

  /**
   * `Select all {n} shown` — the reference band's ONE select-all, over the rows on screen.
   *
   * The rendered page rather than the filtered corpus, because that is what the word says: a GM
   * reading `Select all 10 shown` beside ten visible rows has been told which ten. `results`
   * keeps its own action above, over `projected.rows`, and the two are separate functions rather
   * than one taking a population — a select-all that silently changed which set it reached with
   * the caption beside it is the defect this scope exists to make impossible to write.
   */
  function selectAllShown() {
    selectedIds = setBulkSelection(
      selectedIds,
      page.rows.map((entry) => entry.id),
      true
    );
    disarm();
  }

  function clearSelection() {
    selectedIds = new Set();
    disarm();
  }

  /**
   * The context every snippet receives.
   *
   * IT CARRIES THE WHOLE PROJECTION, on purpose. A conditionally present field — a tool's
   * `toolBreakage`, published only when the corpus holds one — is reachable through `ctx.scope`
   * without adding a shell prop for it or reaching around the shells for the store.
   *
   * `selected` is "in the write set", not "inspected": the two are different questions and the
   * inspected row is the one the body is rendering anyway. `member` and `systemRow` are the
   * addressed system's answers, so both are inert in world scope where there is no addressed
   * system.
   *
   * `clearSelection` is on it because the SELECTION IS THIS FRAME'S (issue 1373, maintainer
   * feedback round 2): a `bulk` panel renders the shared `BulkEditPanelShell`, whose header
   * carries a Clear action, and a lane holds the ticked ids only as the array it was rendered
   * with. Without a way back to the set's owner that Clear would be a button that cannot do the
   * one thing it names.
   *
   * @param {object|null} entry
   * @returns {{scope: object|null, systems: object[], systemId: string, selected: boolean,
   *   member: boolean, systemRow: object|null, clearSelection: () => void}}
   */
  function rowContext(entry) {
    const systemRow = entry ? (projected.systemRows.get(entry.id) ?? null) : null;
    return {
      scope,
      systems: roster,
      systemId,
      selected: entry ? selectedIds.has(entry.id) : false,
      member: systemRow?.member === true,
      systemRow,
      clearSelection,
    };
  }

  /**
   * The thumbnail a row and an inspector header lead with.
   *
   * BY FIELD PRESENCE, never by entity type. A component and a tool lift `img`; an essence lifts
   * `icon`, which is a Font Awesome class rather than a path. `Medallion` renders the image when
   * `src` is truthy and the glyph otherwise, so reading both is the whole derivation.
   *
   * @param {object|null} entry
   * @returns {{src: string, icon: string, tint: string}}
   */
  function thumbnailOf(entry) {
    const entity = entry?.entity ?? null;
    const src = typeof entity?.img === 'string' ? entity.img : '';
    const glyph = typeof entity?.icon === 'string' && entity.icon ? entity.icon : icon;
    const tint =
      scope?.hasColorToken === true && typeof entity?.colorToken === 'string'
        ? entity.colorToken
        : '';
    return { src, icon: glyph, tint };
  }

  /**
   * The description a row and the inspector state, with a rung down to the LINKED ITEM.
   *
   * ── WHY A SECOND RUNG EXISTS AT ALL ──────────────────────────────────────────
   * A world entity's `description` is a SNAPSHOT taken when the link was made, and a record
   * created any other way — an import, a hand edit, a migration that had none to copy — carries
   * an empty one. Every such row read `No description` while wearing a `Linked` chip, on the
   * one screen whose whole premise is that the world record IS the Item. The system Tool editor
   * has always resolved the live Item for its own card, so the scope that OWNS identity was the
   * only one that could not see the description identity carries.
   *
   * ── THE RUNG IS THE LANE'S, NOT THIS FRAME'S ─────────────────────────────────
   * Resolving a uuid to a document needs a roster this frame has no business holding, and each
   * scope names its source link differently. So a lane supplies `describeEntry`, which answers
   * the linked source's description or `''`; the frame owns only the PRECEDENCE — authored
   * first, linked source second, the literal last — so the row and the inspector cannot
   * disagree about it.
   *
   * @param {object|null} entry
   * @returns {string}
   */
  function descriptionOf(entry) {
    const description = entry?.entity?.description;
    if (typeof description === 'string' && description.trim()) return description;
    const inherited = describeEntry?.(entry);
    if (typeof inherited === 'string' && inherited.trim()) return inherited;
    return text('FABRICATE.Admin.Manager.Scoped.List.NoDescription', 'No description');
  }

  /**
   * Whether this entity's identity record actually names a source Item.
   *
   * READ FROM THE PROJECTION, never re-derived here. `buildEntry` answers it beside the ONE list
   * of source-link field names. Restating those three names in this file would go on testing the
   * old ones after a rename — `scope.sourceLinked` would stay correct, so every type-level gate
   * would stay green, while each entity linked only by the renamed field started reporting
   * itself unlinked. One directory apart is still a second copy.
   *
   * @param {object} entry
   * @returns {boolean}
   */
  function sourceLinkedRow(entry) {
    return entry?.hasSourceLink === true;
  }

  // SHORT ENOUGH FOR A CHIP TRACK. A `<select>` shows one option at a time and can afford
  // `In at least one system`; a segmented control states all three side by side, and the long
  // pair pushed the sort controls onto a second toolbar band. Each segment now carries its COUNT
  // as well, which is the fact the long label was standing in for.
  const membershipLabels = $derived({
    all: text('FABRICATE.Admin.Manager.Scoped.List.MembershipAll', 'All'),
    member: text('FABRICATE.Admin.Manager.Scoped.List.MembershipMember', 'In a system'),
    unused: text('FABRICATE.Admin.Manager.Scoped.List.MembershipUnused', 'Unused'),
    in: text('FABRICATE.Admin.Manager.Scoped.List.MembershipIn', 'In this system'),
    out: text('FABRICATE.Admin.Manager.Scoped.List.MembershipOut', 'Not here'),
  });

  /**
   * The membership filter's segments, each carrying the number of rows it would show.
   *
   * COUNTED OVER THE WHOLE CORPUS, and deliberately not over the current page or the current
   * search: a segment's count answers "how many are there", and a count that moved with the
   * search box would make choosing a segment depend on what is already typed in another control.
   *
   * The predicate is the MODEL's, reached by asking it for each membership value in turn rather
   * than by re-deriving membership here — the frame must not hold a second opinion about what
   * `member` means.
   */
  const membershipSegments = $derived(
    membershipOptions.map((option) => ({
      value: option,
      fallback: membershipLabels[option],
      count: model.project({ entries, searchOf, membership: option, systemId }).rows.length,
    }))
  );

  // ── `SYSTEM COUNT` RATHER THAN `SYSTEMS` (issue 1371 r11-cat, UX F-C) ─────────────────────
  // The reference names this key `System count` on BOTH world catalogues it draws — `proto:5228`
  // for components and `proto:4775` for tools — and it is what the key sorts by: the number of
  // crafting systems holding the record. `Systems` reads as a sort BY the systems and left
  // `inventory` reporting `MISSING LABEL "system count"` on this route.
  //
  // ONE SHARED STRING RATHER THAN A PER-LANE OVERRIDE, and that is the whole argument for
  // touching it here: the three catalogues that compose this frame sort by the identical count,
  // so a prop threaded through the shell to relabel it on one of them would put two names on one
  // meaning — the failure the design-system spec names first. The row STAT label stays `Systems`
  // (`proto:5248`), which is a different fact in a different place.
  const sortKeyLabels = $derived({
    name: text('FABRICATE.Admin.Manager.Scoped.List.SortKeyName', 'Name'),
    systems: text('FABRICATE.Admin.Manager.Scoped.List.SortKeySystems', 'System count'),
  });

  // ── ONE OPTION MAY STAND FOR A PAIR OF DESCRIPTORS (issue 1371 r8-cat) ────────────────────
  // A lane sort shipped as ONE descriptor and therefore as one whole order, which is why the
  // direction toggle inerts against it — `systems-asc` did not exist and nothing said so. A lane
  // that wants its own sort REVERSIBLE declares the pair (`source-type-asc`, `source-type-desc`)
  // and names the OPTION they share through `optionId`; the composition below then resolves as
  // it does for the frame's own keys, and the toggle stays live because the composed id is a
  // real descriptor. A descriptor with no `optionId` is its own option, which is every shipped
  // one, so the list is byte-identical for them.
  const sortOptions = $derived([
    ...Object.keys(sortKeyLabels).map((id) => ({ id, label: sortKeyLabels[id] })),
    ...laneSorts.reduce((options, descriptor) => {
      const id = descriptor?.optionId ?? descriptor?.id;
      if (!id || options.some((option) => option.id === id)) return options;
      options.push({ id, label: descriptor.label });
      return options;
    }, []),
  ]);

  const directionLabel = $derived(
    sortDirection === 'asc'
      ? text('FABRICATE.Admin.Manager.Scoped.List.SortAsc', 'Asc')
      : text('FABRICATE.Admin.Manager.Scoped.List.SortDesc', 'Desc')
  );

  // AND THE GLYPH TURNS WITH IT (issue 1373). `proto:1971` binds this icon to `d.tl.dirIcon`,
  // a per-direction value, and the system Tool Rules list one screen away already swaps the
  // identical pair (`ToolsBrowserView`). This toggle drew `arrow-down-a-z` in BOTH positions,
  // so the only thing that moved under a click was the three-letter word beside it - and the
  // descending state was never photographed, which is why nothing caught a glyph asserting the
  // opposite of the order on screen.
  const directionIcon = $derived(
    sortDirection === 'asc' ? 'fas fa-arrow-down-a-z' : 'fas fa-arrow-up-a-z'
  );

  // `{shown} of {total} {unit}` — the prototype's `6 of 6 essences`, right-aligned on the toolbar
  // row. It states the FILTERED count against the corpus total, which is the pair a GM needs to
  // tell "this world holds six" from "four are hidden by a filter I forgot".
  const resultCount = $derived(
    countUnit
      ? format('FABRICATE.Admin.Manager.Scoped.List.ResultCount', '{shown} of {total} {unit}', {
          shown: projected.rows.length,
          total: entries.length,
          unit: countUnit,
        })
      : ''
  );

  /**
   * The selection band's standing sentence, and the condition on it is the honest half.
   *
   * `proto:594` reads `Bulk actions are in the inspector →`, and that is only TRUE when the bulk
   * body actually lands in the inspector — which is `bulk && inspectorBody`, exactly the pair the
   * inspector's own `{#if}` requires. `EntityRulesListShell` supplies a `bulk` snippet and NO
   * `inspectorBody`, so its bulk body renders in `.manager-scoped-list-bulk` directly under this
   * toolbar; pointing a GM at an inspector that is not on the screen would be a sentence about
   * another screen. There it says nothing, and the band is the count and its two actions.
   */
  const selectionHint = $derived(
    bulk && inspectorBody
      ? text(
          'FABRICATE.Admin.Manager.Scoped.List.SelectionInspectorHint',
          'Bulk actions are in the inspector →'
        )
      : ''
  );
</script>

<!--
  TWO ELEMENTS, AND THE SPLIT IS LOAD-BEARING. A container query NEVER matches the element that
  establishes the container — `@container` resolves against the nearest ANCESTOR container — so a
  `container-type` and an `@container` rule on one element silently resolve against something
  else. Here that something else is `.fabricate-manager`, which `styles/fabricate.css` declares as
  a named container: the query then measured the whole manager window instead of this column, and
  the stacked layout never applied at any width a GM can reach. The outer element is the container
  and the inner one is what the query lays out.
-->
<div class="manager-scoped-list-frame">
  <!--
    `&& available` is load-bearing, not defensive. The unavailable branch renders ONE callout and
    no inspector, so a two-track grid there reserves a 300px column beside a warning and paints a
    void the width of the panel that is not there.
  -->
  <div class="manager-scoped-list-layout" class:has-inspector={Boolean(inspectorBody) && available}>
    <!--
      THE COLUMN IS THE MIDDLE TRACK IN BOTH STATES, and the lead is above the branch rather than
      inside its available half (issue 1373, maintainer feedback round 2).

      A lane's `columnLead` is CHROME FOR THE ROUTE, not part of the list: the world Tool
      catalogue's breakage card states one value for every Tool in the world and is the only
      surface at world scope that authors it, so a corpus that failed to read must not make the
      control disappear — that was its shipped behaviour when the page drew it as a sibling of
      this frame, and the swap to `columnLead` must not quietly change it.
    -->
    <div class="manager-scoped-list-column">
      {#if columnLead}
        <div class="manager-scoped-list-column-lead">{@render columnLead()}</div>
      {/if}
      {#if !available}
        <div class="manager-scoped-list-unavailable">
          <Callout
            tone="warning"
            text={text(
              'FABRICATE.Admin.Manager.Scoped.List.Unavailable',
              'This world corpus could not be read, so nothing here can be listed or edited. Reload the world once its settings are readable.'
            )}
            dataAttr="data-scoped-list-state"
            dataValue="unavailable"
          />
        </div>
      {:else}
        <ManagerToolbar
          class="manager-scoped-list-toolbar"
          data-scoped-list-toolbar=""
          ariaLabel={text('FABRICATE.Admin.Manager.Scoped.List.Filters', 'List filters')}
        >
          <!--
            THE FILTER ROW HOLDS FILTERS, AND NOTHING THE SELECTION STATE CHANGES.

            `proto:1970` is this row for the tool catalogue and `proto:3162` is it for the essence
            one, and both are the same five things: the search field, `Sort by`, the sort select,
            the direction toggle, and the count pushed right by `margin-left: auto`. NO selection
            affordance appears in either, in any state — the design's own select-all is a text
            action inside the band below, which renders only while a selection is active
            (`proto:591`-`597`).

            THIS ROW HAS NOW BEEN THREE THINGS AND THIS IS THE REFERENCE'S. It shipped as two
            bands, the second holding nothing but a select-all box; round 3 flattened the register
            INTO this row with `display: contents` and then had to shrink the search field to
            about 150px under a selection to stop the eleven resulting items wrapping. Both were
            the same mistake at different sizes: a row whose composition depends on whether rows
            are ticked. With the register gone the row is the same five items ticked or not, and
            the field keeps its full ~400px in both states — which is what
            `scoped-list-inspector-geometry.test.js` now measures, at rest and selected, off one
            mount.
          -->
          <!--
            ── THE LEAD ROW, WHEN A LANE ASKS FOR TWO (issue 1371 r8-cat) ────────────────────

            `proto:576`-`577` draws the search field and the source-type select on their own row
            ABOVE the membership/sort row. It is rendered here rather than by re-ordering the
            filter row's children because the filter row is the row `BulkSelectionToolbar` joins
            with `is-selection`, so its identity — and everything pinned to its class — must not
            move. `splitToolbar` is off by default and the two snippets below render in their
            shipped positions inside the one row, so no other caller's DOM changes.
          -->
          {#if splitToolbar}
            <div class="manager-scoped-list-search-row" data-scoped-list-search-row>
              {@render searchField()}
              {@render laneFilterSelects('lead')}
            </div>
          {/if}

          <div class={TOOLBAR_ROW_CLASS}>
            {#if !splitToolbar}{@render searchField()}{/if}

            <!--
              SEGMENTED CHIPS, NOT A `<select>`. This is the SAME question the system Tool Rules
              list asks one screen away — which rows am I looking at — and that screen asks it
              with a segmented track. One filter drawn two ways, a click apart, is a GM having to
              learn the same control twice; and a `<select>` hides its other options behind a
              click, so the counts that make the choice decidable were unreadable until opened.

              THE COUNTS ARE THE PRIMITIVE'S OWN `count` SLOT, which exists for exactly this and
              which no consumer had used: each segment says how many rows choosing it would show,
              measured against the corpus rather than against the current page.
            -->
            {#if membershipFilter}
              <SegmentedControl
                density="compact"
                options={membershipSegments}
                value={membership}
                groupName={`scoped-list-membership-${scope?.entityType || 'entity'}`}
                ariaLabel={text(
                  'FABRICATE.Admin.Manager.Scoped.List.MembershipLabel',
                  'Membership filter'
                )}
                dataAttr="data-scoped-list-membership"
                optionDataAttr="data-scoped-list-membership-option"
                onChange={(next) => changeMembership(next)}
              />
            {/if}

            {#if splitToolbar}
              {@render laneFilterSelects('filters')}
              <!-- The reference's hairline between the membership control and the sort group
                   (`proto:582`). It renders only in the two-row toolbar, where there are two
                   groups on one row for it to separate. -->
              <span class="manager-scoped-list-toolbar-divider" aria-hidden="true"></span>
            {:else}
              {@render laneFilterSelects(null)}
            {/if}

            <span class="manager-scoped-list-sort-label" id="scoped-list-sort-label">
              {text('FABRICATE.Admin.Manager.Scoped.List.SortByLabel', 'Sort by')}
            </span>
            <select
              value={sortKey}
              data-scoped-list-sort
              aria-labelledby="scoped-list-sort-label"
              onchange={(event) => changeSortKey(event.currentTarget.value)}
            >
              {#each sortOptions as option (option.id)}
                <option value={option.id}>{option.label}</option>
              {/each}
            </select>

            <!-- The direction is a TOGGLE that states its current position, not a second select.
                 `aria-pressed` carries the same fact to a screen reader, and the control goes
                 `disabled` — never hidden — against a lane sort, so a GM who cannot reverse an
                 order can still see that reversing is what the control does. -->
            <button
              type="button"
              class="manager-scoped-list-direction"
              data-scoped-list-direction={sortDirection}
              aria-pressed={sortDirection === 'asc'}
              disabled={!directional}
              title={text(
                'FABRICATE.Admin.Manager.Scoped.List.SortDirection',
                'Reverse the sort order'
              )}
              onclick={toggleSortDirection}
            >
              <i class={directionIcon} aria-hidden="true"></i>
              <span>{directionLabel}</span>
            </button>

            {#if resultCount}
              <span class="manager-scoped-list-count" data-scoped-list-count>{resultCount}</span>
            {/if}
          </div>

          <!--
            ── THE SELECTION STATE IS ITS OWN BAND (issue 1373, maintainer feedback round 4) ────

            `proto:591`-`597`: a tinted row directly beneath the filter row, rendered ONLY while a
            selection is active, holding the count, a sentence pointing at the inspector, and the
            two text actions at its trailing edge. `{#if selection.count > 0}` is the whole of
            `sc-if value="{{ d.cl.selActive }}"` — the register is a STATE the screen enters, so
            it has no resting appearance to design.

            WHAT THIS COSTS, STATED RATHER THAN HIDDEN. `BulkSelectionToolbar` renders the
            tri-state page box unconditionally and takes no prop to suppress it, so gating the
            band on a non-empty selection takes the `All` box off the resting toolbar with it.
            That is the right half of the trade: the design draws NOTHING selection-shaped in the
            filter row, and it opens a selection from the row's own checkbox (`proto:603`, whose
            `title` on the essence and system lists is literally `Select for bulk edit`). So the
            row box is the entry point, the band's `All` completes the page once a selection
            exists, and `Select all N results` completes the corpus. The alternative — leaving
            `All` in the filter row — keeps a control the reference does not have on every frame
            of every state, which is the finding this round exists to close.

            IT STAYS INSIDE `<ManagerToolbar>`, as the register's last row. The toolbar is the
            labelled landmark the manager's "emptying a bulk selection" contract hops focus to
            (`design-system/spec.md`), and moving the band out of it would leave that hop landing
            on a row that no longer holds the selection register.
          -->
          {#if selection.count > 0}
            <BulkSelectionToolbar
              rowClass={TOOLBAR_ROW_CLASS}
              toolbarAttr={TOOLBAR_ATTR}
              pageBoxAttr={PAGE_BOX_ATTR}
              countAttr={COUNT_ATTR}
              resultsAttr={RESULTS_ATTR}
              clearAttr={CLEAR_ATTR}
              {selectAllScope}
              pageSelectionState={selection.pageSelectionState}
              count={selection.count}
              showSelectAllResults={shownScope
                ? selection.count > 0
                : selection.showSelectAllResults}
              selectAllResultsCount={shownScope
                ? page.rows.length
                : selection.selectAllResultsCount}
              {selectAllLabel}
              hint={selectionHint}
              trailingActions
              bareActions
              countIcon="fa-solid fa-check-double"
              onTogglePage={togglePage}
              onSelectAllResults={shownScope ? selectAllShown : selectAllResults}
              onClear={clearSelection}
            />
          {/if}
        </ManagerToolbar>

        {#if bulk && !inspectorBody && selection.count > 0}
          <!-- With no inspector column there is nowhere else for a bulk body to go, so it sits
             directly under the toolbar that states the count it acts on. -->
          <section class="manager-scoped-list-bulk" data-scoped-list-bulk>
            {@render bulk([...selectedIds], rowContext(null))}
          </section>
        {/if}

        <div class="manager-scoped-list-rows">
          <!-- WHAT OPENS THE LIST. Inside the scroller so it scrolls with the rows rather than
               standing as a fixed band that costs the list its height, and OUTSIDE the `<ul>`
               because it is not a list item. It renders in the empty states too: a catalogue
               with nothing in it is exactly when a GM most needs the surface that creates the
               first record. -->
          <!--
            WRAPPED, AND THE WRAPPER IS WHERE THE GAP LIVES (issue 1373, maintainer feedback
            round 2). The lead had no separation from whatever follows it at all: the drop zone
            touched the `No tools yet` hero on an empty catalogue and butted straight against
            the first row on a populated one. Those look like two defects and are one — the
            space belongs BELOW the lead, stated once here, so all three states below it inherit
            it rather than each restating a margin of its own. The design gives the zone the same
            relationship: a bottom margin about twice the row rhythm (`proto:1980`).
          -->
          {#if listLead}
            <div class="manager-scoped-list-lead">{@render listLead()}</div>
          {/if}
          {#if page.rows.length === 0 && filtered}
            <EmptyState
              filtered
              hint={text(
                'FABRICATE.Admin.Manager.Scoped.List.FilteredEmpty',
                'Nothing here matches the current search and filters.'
              )}
              dataAttr="data-scoped-list-state"
              dataValue="filtered"
            >
              <ManagerButton data-scoped-list-clear-filters onclick={clearFilters}>
                {text('FABRICATE.Admin.Manager.Scoped.List.ClearFilters', 'Clear filters')}
              </ManagerButton>
            </EmptyState>
          {:else if page.rows.length === 0}
            <EmptyState
              {icon}
              title={emptyTitle}
              hint={emptyHint}
              dataAttr="data-scoped-list-state"
              dataValue="empty"
            />
          {:else}
            <ul class="manager-scoped-list" role="list" aria-label={title}>
              {#each page.rows as entry (entry.id)}
                {@const inspected = inspectedEntry?.id === entry.id}
                {@const bulkSelected = selectedIds.has(entry.id)}
                {@const thumbnail = thumbnailOf(entry)}
                {@const name = rowName(entry)}
                <li
                  class="manager-scoped-list-row"
                  class:is-selected={inspected}
                  class:is-bulk-selected={bulkSelected}
                  data-scoped-list-row={entry.id}
                  data-scoped-list-bulk-selected={bulkSelected}
                  aria-current={inspected ? 'true' : undefined}
                >
                  <!--
                    THE SELECTION BOX LEADS THE ROW.

                    The prototype's row is `[☐] [icon] [name / description] [stats] [pill] [pen]`
                    (`essences.png`); this frame shipped it TRAILING, after the actions, matching
                    `ComponentRow`. Leading is the prototype's order and it is also the one the
                    select-all box in the toolbar directly above now points down a column at —
                    trailing left that box aligned over the row's pen.

                    It stays OUTSIDE the identity `<button>`: `SelectionCheckbox` renders a
                    `<label>` around an `<input>`, and interactive content inside a `<button>` is
                    invalid DOM that `createElement` lands silently.
                  -->
                  <SelectionCheckbox
                    size="lg"
                    wrapper="label"
                    checked={bulkSelected}
                    ariaLabel={format(
                      'FABRICATE.Admin.Manager.Scoped.List.SelectRow',
                      'Select {name}',
                      { name }
                    )}
                    data-scoped-list-select={entry.id}
                    onChange={() => toggleRow(entry.id)}
                  />

                  <button
                    type="button"
                    class="manager-scoped-list-identity"
                    data-scoped-list-inspect={entry.id}
                    onclick={() => inspect(entry.id)}
                  >
                    <Medallion
                      src={thumbnail.src}
                      icon={thumbnail.icon}
                      tint={thumbnail.tint}
                      variant={rowMedallionSpec.variant}
                      size={rowMedallionSpec.size}
                      glyph={rowMedallionSpec.glyph}
                    />
                    <span class="manager-system-copy">
                      <!--
                        THE NAME LINE, WHICH MAY CARRY MORE THAN THE NAME (issue 1371 r8-cat).
                        The reference puts a row's source pill and its exception flag directly
                        after the name (`proto:601`); both are inert, which is what lets them
                        live inside the identity `<button>` at all.
                      -->
                      {#if rowNameTrailing}
                        <span class="manager-scoped-list-row-name-line">
                          <span class="manager-system-name" title={name}>{name}</span>
                          {@render rowNameTrailing(entry, rowContext(entry))}
                        </span>
                      {:else}
                        <span class="manager-system-name" title={name}>{name}</span>
                      {/if}
                      <!--
                        THE SECOND LINE IS THE LANE'S CHOICE OF FACT.

                        `description` is the shipped default and stays it. `meta` is what the tool
                        catalogue needs: the design puts a Tool's chips — what it does, and how
                        far it reaches — directly under its name, and spends no row width on a
                        description the inspector states in full. Two lanes wanting two different
                        second lines is a placement prop, not a second row component.
                      -->
                      {#if rowSecondLine === 'description'}
                        <span class="manager-system-description" title={descriptionOf(entry)}>
                          {descriptionOf(entry)}
                        </span>
                      {:else if rowMeta}
                        <!--
                          INSIDE THE IDENTITY BUTTON, WHICH IS WHY `rowTrailing` EXISTS.

                          The design indents the chips under the NAME, not under the medallion,
                          so they have to share `.manager-system-copy` with it. That places them
                          inside a `<button>`, where interactive content is invalid DOM the
                          browser silently reparents — so a lane choosing `meta` puts only inert
                          content here and renders anything clickable through `rowTrailing`.
                        -->
                        <span
                          class="manager-scoped-list-row-facts"
                          data-scoped-list-row-facts={entry.id}
                        >
                          {#if rowSourceBadge && scope?.sourceLinked === true && !sourceLinkedRow(entry)}
                            <!-- ONLY THE WARNING HALF. A `Linked` pill on every row of a
                                 catalogue whose whole premise is that each record IS an Item
                                 states the rule rather than the exception; the design carries
                                 neither. What a GM has to see is the record that is NOT linked,
                                 because that one resolves to nothing in an inventory. -->
                            <span
                              class="manager-scoped-list-source"
                              data-scoped-list-source="unlinked"
                            >
                              <StatusPill
                                tone="warning"
                                icon="fas fa-link-slash"
                                label={text(
                                  'FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked',
                                  'No source item'
                                )}
                              />
                            </span>
                          {/if}
                          {@render rowMeta(entry, rowContext(entry))}
                        </span>
                      {/if}
                    </span>
                  </button>

                  <!-- A `<div>`, not the `<span>` `ComponentRow` uses: a lane's `rowMeta` — and the
                     rules-list shell's own `InheritRow` — render block elements, and a `<div>`
                     inside a `<span>` is invalid nesting the browser silently reparents. -->
                  <div class="manager-scoped-list-row-meta">
                    <!-- THE SOURCE PILL FOLLOWS THE FACTS. Under `rowSecondLine: 'meta'` the
                         lane's chips sit under the name and the design's row silhouette is
                         `[medallion] [name over its chips] [toggle] [action]` — a pill floating
                         in the trailing column reads as a third control there. It is rendered
                         inside the fact run instead, which keeps the information and the
                         silhouette at once. -->
                    {#if rowSourceBadge && scope?.sourceLinked === true && rowSecondLine === 'description'}
                      <span
                        class="manager-scoped-list-source"
                        data-scoped-list-source={sourceLinkedRow(entry) ? 'linked' : 'unlinked'}
                      >
                        <StatusPill
                          tone={sourceLinkedRow(entry) ? 'subtle' : 'warning'}
                          icon={sourceLinkedRow(entry) ? 'fas fa-link' : 'fas fa-link-slash'}
                          label={sourceLinkedRow(entry)
                            ? text('FABRICATE.Admin.Manager.Scoped.List.SourceLinked', 'Linked')
                            : text(
                                'FABRICATE.Admin.Manager.Scoped.List.SourceUnlinked',
                                'No source item'
                              )}
                        />
                      </span>
                    {/if}
                    {#if rowSecondLine === 'description' && rowMeta}
                      {@render rowMeta(entry, rowContext(entry))}
                    {/if}
                    {#if rowTrailing}{@render rowTrailing(entry, rowContext(entry))}{/if}
                  </div>

                  <!--
                    A LABELLED ACTION IS A DESCRIPTOR FLAG, NOT A SECOND ROW COMPONENT.

                    The design's catalogue row ends with a bordered `Edit tool ⧉`, and so does
                    own system Tool Rules row — while this frame drew a bare pen, so the two list
                    screens disagreed with each other as well as with the design. `labelled` is
                    opt-in per descriptor: a lane that sets none renders `IconButton` exactly as
                    before, which is what keeps the component and essence catalogues untouched by
                    this. The icon branch stays the PRIMITIVE (issue 1422): a labelled action is a
                    different control with a visible name, not a hand-rolled icon button, so
                    nothing here restores markup `IconButton` now owns.
                  -->
                  <span class="manager-action-group">
                    {#each rowActions as action (action.id)}
                      {#if action.labelled}
                        <button
                          type="button"
                          class="manager-scoped-list-row-action"
                          data-scoped-list-action={action.id}
                          aria-label={`${action.label} — ${name}`}
                          title={action.label}
                          onclick={() => action.run(entry)}
                        >
                          <span>{action.label}</span>
                          <i
                            class={action.trailingIcon || 'fas fa-arrow-up-right-from-square'}
                            aria-hidden="true"
                          ></i>
                        </button>
                      {:else}
                        <IconButton
                          data-scoped-list-action={action.id}
                          ariaLabel={`${action.label} — ${name}`}
                          title={action.label}
                          onclick={() => action.run(entry)}
                        >
                          <i class={action.icon} aria-hidden="true"></i>
                        </IconButton>
                      {/if}
                    {/each}
                  </span>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <!--
          THE FOOT PAGER RENDERS ONLY WHEN THERE IS MORE THAN ONE PAGE (issue 1372, maintainer
          parity round 4).

          The prototype's catalogue draws no foot pager at all (`essences.png`); its only pager is
          the inspector's, over the system list. This shipped `persistent`, so a six-essence world
          drew a full-width `Showing 1–6 of 6 · Page 1 of 1 · Per page 25` band under six rows —
          a control that can only restate what the rows already show.

          A PREVIOUS ATTEMPT REMOVED IT OUTRIGHT and was reverted, because `persistent={false}`
          means "more items than the smallest offered page size", which is not the same rule and
          broke four things that assert the browse archetype's guarantee. `multiPageOnly` is the
          ruling itself, so all four are re-pointed at it rather than deleted:

           - `design-system/spec.md`'s browse recipe now states the condition, and still binds the
             bar's position and its disabled arrows wherever it renders;
           - `scoped-entity-list-shells-mounted.test.js` asserts BOTH directions — absent at one
             page, present with its disabled prev arrow at two;
           - the clamp case in the same file clamps into a two-page corpus, where the footer is
             still the observation, and into a one-page corpus, where the row slice is;
           - `scoped-list-inspector-geometry.test.js` measures the rows region taking the column's
             slack on a short one-page list (no pager at all) and the pager NOT taking it on a
             short multi-page one.

          The per-page selector goes with the bar, which is the one thing this gives up; see
          `Pagination`'s own note for why that is bounded.
        -->
        <Pagination
          multiPageOnly={true}
          totalCount={page.totalCount}
          pageIndex={page.pageIndex}
          {pageSize}
          onPageChange={changePage}
          onPageSizeChange={changePageSize}
        />
      {/if}
    </div>

    <!-- `&& available` for the reason the layout's own note gives: the unavailable state draws
         one callout and no panel, so a 300px track beside it would be a painted void. -->
    {#if inspectorBody && available}
      <aside
        class="manager-scoped-list-inspector"
        bind:this={inspectorElement}
        tabindex="-1"
        data-keyboard-focus="true"
        data-scoped-list-inspector
        aria-label={text('FABRICATE.Admin.Manager.Scoped.List.Inspector', 'Details')}
      >
        {#if bulk && selection.count > 0}
          <div class="manager-scoped-list-inspector-scroll">
            {@render bulk([...selectedIds], rowContext(null))}
          </div>
        {:else if inspectedEntry}
          {@const thumbnail = thumbnailOf(inspectedEntry)}
          {@const caption = colourCaption(inspectedEntry?.entity?.colorToken)}
          <!--
              THE IDENTITY BLOCK IS THREE STACKED PARTS, NOT A TWO-COLUMN ROW.

              The prototype's inspector opens with a kicker, then the medallion beside the name
              and a colour caption, then the description ACROSS THE FULL COLUMN below both
              (`essences.png`). This frame shipped the description in the copy column beside the
              medallion, which is a 190px measure inside a 300px panel — the frame captured on
              the branch clipped `The binding between things, drawn thin…` at the first line.
            -->
          <div class="manager-scoped-list-inspector-identity">
            {#if inspectorKicker}
              <p class="manager-kicker" data-scoped-list-inspector-kicker>{inspectorKicker}</p>
            {/if}
            <div class="manager-inspector-title-row">
              <span class="manager-inspector-icon">
                <Medallion
                  src={thumbnail.src}
                  icon={thumbnail.icon}
                  tint={thumbnail.tint}
                  size={42}
                />
              </span>
              <span class="manager-inspector-copy">
                <!--
                    AN `<h2>`, as every shipped inspector renders it. `.manager-inspector-name`
                    fully specifies its own appearance, so the element choice is free — and it is
                    the entry point a screen-reader user browsing by heading needs into the panel
                    focus was just moved to. It also puts the catalogue shell's own `<h3>` group
                    head at a level that does not skip.
                  -->
                <h2 class="manager-inspector-name" data-scoped-list-inspector-name>
                  {scopedEntryName(inspectedEntry)}
                </h2>
                <!--
                    THE GATE IS THE SNIPPET OR THE COLOUR, NEVER THE COLOUR ALONE.

                    It was `{#if caption}`, and `caption` is `colourCaption(colorToken)` — so a
                    scope with no colour token could pass `inspectorCaption` and have it silently
                    never render. The tool catalogue did exactly that: its `On` / `Off` state pill
                    is the design's own caption for this slot (`tool-catalogue.png`), the lane
                    supplied the snippet, and nothing was drawn because a Tool has no colour.

                    A LANE SNIPPET WINS OUTRIGHT when it is supplied, which is unchanged; what
                    changed is that supplying one is now sufficient to reach the DOM.
                  -->
                {#if inspectorCaption || caption}
                  <span class="manager-scoped-list-inspector-caption" data-scoped-list-caption>
                    {#if inspectorCaption}
                      {@render inspectorCaption(inspectedEntry)}
                    {:else}{caption}{/if}
                  </span>
                {/if}
              </span>
            </div>
            <p class="manager-scoped-list-inspector-description">
              {descriptionOf(inspectedEntry)}
            </p>
          </div>
          <div class="manager-scoped-list-inspector-scroll">
            {@render inspectorBody(inspectedEntry, rowContext(inspectedEntry))}
          </div>
          {#if inspectorFoot}
            <div class="manager-scoped-list-inspector-foot" data-scoped-list-inspector-foot>
              {@render inspectorFoot(inspectedEntry)}
            </div>
          {/if}
        {:else}
          <div class="manager-scoped-list-inspector-scroll">
            <!-- THE LANE'S COPY WINS, and the shipped pair is the fallback. See the
                   `restingTitle` prop note: the hint defaulted to the page SUBTITLE, which is
                   the sentence the header already prints. -->
            <EmptyState
              compact
              {icon}
              title={restingTitle ||
                text('FABRICATE.Admin.Manager.Scoped.List.RestingTitle', 'Nothing selected')}
              hint={restingHint || subtitle}
              dataAttr="data-scoped-list-inspector-state"
              dataValue="resting"
            />
          </div>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<!--
  THE TWO TOOLBAR CONTROLS THAT MOVE ROW, WRITTEN ONCE (issue 1371 r8-cat).

  `splitToolbar` decides which row they land in and nothing else about them, so they are snippets
  rather than two copies under an `{#if}`: a copy is how the one-row and two-row toolbars would
  start disagreeing about a placeholder or a hook name, and the SonarCloud duplication gate reads
  a near-identical block as what it is.
-->
{#snippet searchField()}
  <ManagerSearchField
    value={query}
    size={toolbarLeadSize}
    onInput={(next) => changeQuery(next)}
    placeholder={searchPlaceholder ||
      text('FABRICATE.Admin.Manager.Scoped.List.SearchPlaceholder', 'Search…')}
    ariaLabel={text('FABRICATE.Admin.Manager.Scoped.List.SearchLabel', 'Search')}
    inputAttrs={{ 'data-scoped-list-search': '' }}
  />
{/snippet}

<!--
  `row` is `null` in the one-row toolbar, where every lane filter renders exactly where it always
  did. Under `splitToolbar` a descriptor chooses its row with `toolbarRow`, defaulting to the
  LEAD row beside the search field — the reference's own arrangement for the source-type select
  (`proto:578`) — so only a descriptor that names `'filters'` joins the sort group's row.

  `microLabel` is the second opt-in: the reference labels its membership control with a visible
  8px micro-label rather than an invisible accessible name (`proto:579`). A descriptor that names
  none renders the bare `aria-label`led select it always did.

  THE 38px RUNG IS THE ROW'S, NOT THE DESCRIPTOR'S (issue 1371 r9-cat). `proto:577`-`578` draws
  BOTH controls on the lead row at 38 and `proto:582`-`585` draws all three on the filter row at
  32, so the height is a fact about which row a control stands in and not about which filter it
  is. `toolbarLeadSize` therefore says it once for the row, and `leadSelectSizeClass` reads the
  descriptor only to find out which row it landed in.

  The class rather than a prop is `ManagerToolbar`'s own contract: the manager has no select
  COMPONENT, because the control beside the field is three different things across eleven bars and
  the bar takes a slot instead of choosing between them. `styles/fabricate.css`'s `r8-prim` block
  carries the rule at `.manager-scoped-list-toolbar select.is-size-38` — (0,3,1), which beats the
  shipped 34px `(0,2,1)` on specificity rather than on source order.
-->
{#snippet laneFilterSelects(row)}
  {#each laneFilters as filter (filter.id)}
    {#if !row || (filter.toolbarRow ?? 'lead') === row}
      {#if filter.microLabel}
        <span
          class="manager-micro-label manager-scoped-list-filter-label"
          id={`scoped-list-filter-label-${filter.id}`}
          data-scoped-list-filter-label={filter.id}
        >
          {filter.microLabel}
        </span>
      {/if}
      <select
        class={leadSelectSizeClass(filter)}
        value={filterValues[filter.id] ?? 'all'}
        data-scoped-list-filter={filter.id}
        aria-label={filter.microLabel ? undefined : filter.label}
        aria-labelledby={filter.microLabel ? `scoped-list-filter-label-${filter.id}` : undefined}
        onchange={(event) => changeFilter(filter.id, event.currentTarget.value)}
      >
        {#each filter.options ?? [] as option (option.value)}
          <option value={option.value}>{option.label}</option>
        {/each}
      </select>
    {/if}
  {/each}
{/snippet}

<style>
  /* THE FRAME IS ITS OWN CONTAINER. `.manager-body` is `220px minmax(0,1fr) 300px`, and under the
     released full-width classification `<main>` is the list column plus the freed 300px — so the
     budget this frame lays out against is the main column's inline size, not the window's. A
     `container-type: inline-size` root and a container query are what make that measurable from
     here rather than from a closed stylesheet. */
  /* A GRID WITH ONE `minmax(0, 1fr)` ROW, NEVER `display: block`, AND THAT IS THE WHOLE INSPECTOR.

     `.manager-main` gives this element a definite height — `display: grid; grid-template-rows:
     minmax(0, 1fr); overflow-y: auto` in `styles/fabricate.css` — but a `display: block` box does
     not pass that height on, so the layout below it was content-sized and BOTH `overflow-y: auto`
     declarations in this file were dead. Measured at 1400x900 on the default 25-row page: the
     frame was 868px with a 1957px scroll height, and the inspector was a 1957px-tall panel
     holding 175px of content, reporting `canScroll: false`.

     WHAT THAT COSTS A GM IS THE AFFORDANCE, NOT A SCROLLBAR. Scroll to the twentieth row, click
     its name, and `inspect()`'s focus call moves the page ONE pixel — the aside spans the entire
     scroll region, so it is never out of view and never scrolled to. The identity header, the
     inheriting-system counts and every Add / Remove / Enable control sit about a thousand pixels
     above the fold, and the `.is-selected` ring is the only feedback there is.

     The shipped `.manager-inspector` aside this column stands in for cannot do that: it is a
     sibling of `main` inside `.manager-body { overflow: hidden }`, so it is always on screen.
     Matching its 300px width while missing that is matching the wrong half.

     `container-type` stays HERE and the container query still targets a descendant, so the
     stacked layout is unaffected. */
  .manager-scoped-list-frame {
    container-type: inline-size;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
  }

  .manager-scoped-list-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
  }

  /* 340px AND NO COLUMN GAP, matching the shared aside this column stands in for, so a GM sees
     ONE inspector across both scopes rather than learning a second one per screen.

     It said 300px on the same argument and the argument outlived the number: the system Tool
     Rules route moved its own track to 340 in this epic's parity round
     (`[data-manager-view="tools"] .manager-body`), so the two scopes' asides drifted 40px apart
     while this comment still claimed they matched. The gap goes with it — the shared aside is a
     `.manager-body` grid cell with no gutter, so its `border-left` IS the column divider, and a
     12px gutter here left ours reading as a floating hairline instead. */
  .manager-scoped-list-layout.has-inspector {
    grid-template-columns: minmax(0, 1fr) 340px;
    column-gap: 0;
  }

  /* THE CONTENT CARRIES THE PANE'S INSET, BECAUSE THE SIDEBAR MUST NOT (issue 1373, round 4).
     The world catalogue routes drop `.manager-main`'s `--fab-space-4` so the aside beside this
     column can reach the pane's top, bottom and right edges the way the system scope's aside
     does. The inset moves here rather than disappearing, which is the same division the system
     scope already makes: pane insets the content, aside bleeds past it. */
  .manager-scoped-list-column {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-4);
  }

  /* THE ROWS TAKE THE SLACK AND THE CHROME DOES NOT. Without the explicit pair the column hands
     its height to whichever child grows, and the browse archetype's rule — the pagination bar
     sits OUTSIDE the scroll area so it never moves — is the opposite of that.

     SPLIT, and the toolbar half made `:global`, when the bar became a `<ManagerToolbar>`
     (issue 1039). `.manager-scoped-list-toolbar` lives only on a COMPONENT tag now, so Svelte no
     longer stamps this component's scoping class onto the element carrying it and the scoped form
     matched nothing. That failure is SILENT in this file rather than warned about: the
     `<div class={TOOLBAR_ROW_CLASS}>` above is a regular element with an expression-valued
     `class`, which makes every class selector in this block possibly-matching — so all three of
     this file's toolbar rules were emitted with the hash attached, `lint:svelte:warnings` stayed
     green, and the compiled `css.code` came out BYTE-IDENTICAL across the conversion. The bar
     would simply have started absorbing this column's slack instead of
     `.manager-scoped-list-rows`.

     The `:global` is CHAINED onto `.manager-toolbar`, the class the primitive emits itself, so
     the specificity is unchanged at (0,2,0) — exactly what `.manager-scoped-list-toolbar` plus
     the scoping class was. A bare `:global(.manager-scoped-list-toolbar)` would be (0,1,0) and
     would start losing ties it used to win.

     `.manager-scoped-list-bulk` stays SCOPED and keeps its own rule: it is still a `<section>`
     this component writes. */
  :global(.manager-toolbar.manager-scoped-list-toolbar) {
    flex: 0 0 auto;
  }

  /* THE COLUMN LEAD IS CHROME, so it takes none of the column's slack — the same `0 0 auto`
     the toolbar and the pager take, for the same reason. It is a `display: grid` box so a
     single card child spans the column exactly as the design draws it. */
  .manager-scoped-list-column-lead {
    display: grid;
    flex: 0 0 auto;
    min-width: 0;
  }

  .manager-scoped-list-bulk {
    flex: 0 0 auto;
  }

  /* `Pagination` renders its own `<section class="manager-pagination">`, so a scoped rule cannot
     reach it and the sizing has to be stated from this side of the boundary. */
  .manager-scoped-list-column > :global(.manager-pagination) {
    flex: 0 0 auto;
  }

  /*
     THE IDENTITY CELL IS LEFT-ALIGNED, AND IT TAKES A RULE TO SAY SO.

     It is a real `<button>`, and Foundry core's own button rule centres a button's flex content.
     The global reset beside this one resets height, padding, border and background but never
     `justify-content`, so a row whose meta run is wide enough to shrink the identity button below
     its 260px basis centred the medallion and the name inside whatever width was left: measured
     in the View Lab on the world essence catalogue, four of the five rows had their medallion
     floating 70-130px in from the left edge while the first row, whose description was long
     enough to fill the cell, sat flush. It reads as ragged data rather than as a layout fault,
     which is why it survived three frames.

     Declared HERE rather than in `styles/fabricate.css` — closed to this lane by
     `### GM World Scoped Entity Routes` requirement 7 — and it wins anyway: Svelte compiles a
     scoped selector to two classes, which ties the global `.fabricate-manager
     .manager-scoped-list-identity` and wins on source order, and core's rule is inside a
     cascade layer that any unlayered declaration beats outright.
  */
  .manager-scoped-list-identity {
    justify-content: flex-start;
    text-align: left;
  }

  /*
     THE ROW NAME IS THE PROTOTYPE'S 13.5px SERIF, matching the shipped precedent at
     `.manager-component-row .manager-system-name`, which records the same figure and the same
     reason: the shared `.manager-system-name` declares no base size, so a catalogue row's name
     bleeds to the inherited 14px.

     The WEIGHT is left at the shared 700 rather than taken to the prototype's 600. That single
     step is inside the standing E-3 escalation about the prototype's card-name weight, and
     re-typing it here alone would make the essence row's name a different weight from the
     component row's directly above it in the same rail.
  */
  .manager-scoped-list-row .manager-system-name {
    font-family: var(--fab-font-serif);
    font-size: 0.76rem;
  }

  /* ── THE TWO-ROW TOOLBAR'S OWN THREE ELEMENTS (issue 1371 r8-cat) ─────────────────────────
     Each renders only under `splitToolbar`, so no caller that keeps the one-row toolbar can
     reach any of them. The lead row takes the SAME metrics as the filter row rather than
     joining its class, for the reason that class's own note in `styles/fabricate.css` gives:
     the filter row is pinned by exact string and is the row the selection band joins. */
  .manager-scoped-list-search-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  /* `proto:582`'s 1px x 18px rule between the membership control and the sort group. A BOX
     rather than a border, because it separates two groups inside a flex row where a border
     would have to hang off one of them and would then move with it. */
  .manager-scoped-list-toolbar-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 18px;
    background: var(--fab-border);
  }

  /* A lane filter's visible micro-label sits on its control's baseline, not above it: this is a
     labelled control on one row, and `.manager-micro-label`'s shared block margin would push the
     whole row's alignment down by its own leading. */
  .manager-scoped-list-filter-label {
    flex: 0 0 auto;
    margin: 0;
  }

  /* ── THE NAME LINE, WHEN A LANE PUTS SOMETHING AFTER THE NAME ─────────────────────────────
     `proto:601` is `[name] [source pill] [flag]` on one line with the name allowed to ellipsise
     and the pills held at their intrinsic width. Rendered only when `rowNameTrailing` is
     supplied, so the shipped single-name row is untouched. */
  .manager-scoped-list-row-name-line {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* AND THE NAME TAKES THE REFERENCE'S 13.5px/600 SERIF (gap-list row 22). The shared rule two
     blocks up sizes it 0.76rem/700, which is the value the essence and tool rows draw and which
     the standing E-3 escalation covers for THEM; this rule reaches only a row whose lane supplies
     `rowNameTrailing`, so neither of those rows moves.

     IT IS HERE AND NOT IN `styles/fabricate.css`, and that is mechanical: this component's scoped
     block is injected unlayered and that sheet ships at `layer(modules)`, so a route-scoped rule
     there loses to the shared rule above whatever its specificity — silently, with the selector
     matching and the declaration unused. The selection band's own note in that sheet records the
     identical trap. */
  .manager-scoped-list-row-name-line .manager-system-name {
    min-width: 0;
    overflow: hidden;
    font-size: 0.844rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /*
     AND THE DESCRIPTION IS THE REFERENCE'S 11px, for the reason the name rule above states.

     `.manager-system-description` is a shared 0.78rem, sized for a browser row whose identity
     cell is the whole width. In this catalogue's row the cell is about 340px of a 714px row —
     the same ~49% share the reference gives it, measured on both — so the two rows differ not in
     LAYOUT but in TYPE: at 0.78rem the same cell holds about 62 characters where the reference's
     11px holds about 70, and every description longer than that ellipsised two words early while
     the reference's fitted whole. The row NAME took its own scoped size one rule above for
     exactly this reason; this is the sibling half of that, and it is the type divergence the
     standing ruling resolves in the reference's favour.
  */
  .manager-scoped-list-row .manager-system-description {
    font-size: 0.69rem;
  }

  /*
     THE FILTER ROW IS ONE LINE, AND IT TAKES A RULE TO SAY SO.

     Foundry core sizes every `<select>` to `width: 100%`, and neither the global toolbar block
     nor this one overrode it — so each of the three toolbar selects claimed the whole filter row
     and wrapped onto a line of its own. Measured in the View Lab on the world essence catalogue:
     a search field, a membership select and a sort select stacked as three full-width bars, about
     100px of chrome above the first row, where the prototype puts all of them side by side on one
     line (`proto:3159`).

     `width: auto` sizes each to its longest option and `flex: 0 1 auto` lets a narrow column
     shrink them before it shrinks the search field, which carries its own `flex: 1 1 260px`.

     Scoped rather than global for the reason the block above gives, and it wins for the same two:
     Svelte compiles this to two classes plus the element, which outranks the global
     `.fabricate-manager .manager-scoped-list-toolbar select`, and core's rule is layered.
  */
  /* WRAPPED WHOLE in one `:global()`, and the shape is load-bearing rather than stylistic.
     `:global(ancestor) select` looks like the smaller change and is not: it leaves `select` as
     the ONLY scoped compound, so Svelte stops writing the hash as `:where(.svelte-…)` — which
     contributes nothing — and writes a bare `.svelte-…` instead. Measured on this exact rule:
     the scoped form emitted `.manager-scoped-list-toolbar.svelte-… select:where(.svelte-…)` at
     (0,2,1), and the ancestor-only repair emits `… select.svelte-…` at (0,3,1). That is a
     silent cascade change smuggled in as a repair. Wrapping the whole selector emits
     `.manager-toolbar.manager-scoped-list-toolbar select` at (0,2,1), unchanged — which is what
     keeps this rule tied with, and ordered after, the global rule the comment above names.
     Reach is unchanged in practice: `manager-scoped-list-toolbar` is written by this component
     alone, which `tests/components/manager-filter-bar-source-contract.test.js` enforces. */
  :global(.manager-toolbar.manager-scoped-list-toolbar select) {
    flex: 0 1 auto;
    width: auto;
    min-width: 0;
  }

  /* ── TWO RULES USED TO LIVE HERE, AND BOTH WENT WITH THE FLATTENING (issue 1373, round 4) ───
     `.manager-scoped-list-filter-row.is-selection { display: contents }` removed the register's
     own wrapper from the box tree so its controls joined the filter row; the `:has()` rule under
     it then shrank the search field to about 150px whenever that row carried a selection count,
     because eleven items no longer fitted 1280px. The register is its own band now
     (`proto:591`-`597`), so the filter row never carries those items, never overflows, and the
     field never yields. A flattening rule against a band that is no longer nested, and a
     `:has()` guard against a count that is no longer in this row, would both compile to
     selectors matching nothing — silently, since neither compound could carry this component's
     hash. They are deleted rather than left as inert text.

     The band's own appearance is `.manager-scoped-list-filter-row.is-selection` in
     `styles/fabricate.css`, and it has to be: `BulkSelectionToolbar` writes that element in ITS
     template, so no rule in this block can reach it at all. */

  /* `SORT BY`, the prototype's tracked micro-label before the key select. It is a `<span>` rather
     than a `<label>` because it names TWO controls — the key and the direction toggle — and a
     `<label>` may point at only one; the select carries `aria-labelledby` back to it instead. */
  .manager-scoped-list-sort-label {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  /* The direction toggle. Its metrics are COPIED from the toolbar select beside it — 34px tall,
     `--fab-space-2` inline padding — so the two read as one control pair rather than as a button
     dropped next to a field. It needs the manager's `<button>` reset assumptions stated locally
     because Foundry's host rule centres content and pins a fixed height. */
  .manager-scoped-list-direction {
    display: inline-flex;
    flex: 0 0 auto;
    gap: var(--fab-space-chip);
    align-items: center;
    justify-content: center;
    width: auto;
    height: 34px;
    min-height: 34px;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    /* A FORM CONTROL, so it takes the control rung — the same one the search field and the
       selects beside it sit on (issue 1372). */
    background: var(--fab-bg-1);
    color: var(--fab-text);
    font-size: var(--fab-recipe-control-font);
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .manager-scoped-list-direction:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* ── THE WORLD COMPONENT CATALOGUE'S TWO MICRO-TYPE CORRECTIONS (issue 1371 r11-cat) ──────
     UX round-2 finding F-K. `proto:582` and `proto:585` draw `Membership` and `Sort by` with the
     IDENTICAL `font:700 8.5px var(--sans);letter-spacing:.09em`, and `proto:587` draws the
     direction toggle beside them at `font:600 11px var(--sans);color:var(--text2)`. On that route
     the membership label already measures right and these two do not — 9.28px/600/0.08em and
     11.52px/400 in the manager's own ink — so one toolbar row draws two micro-labels two ways and
     one control at a weight its neighbours do not use. That internal inconsistency is what makes
     these per-site drift rather than a systematic ramp, and no rung, scale or M-number covers it.

     ── AND WHY THEY ARE HERE RATHER THAN IN `styles/fabricate.css` ────────────────────────────
     That sheet already carries this route's other type corrections, including the membership
     label's own. It CANNOT carry these two: it is imported at `layer(modules)` while this
     component's `css: 'injected'` block is UNLAYERED, and an unlayered author declaration beats a
     layered one at ANY specificity — so a `font-size` for `.manager-scoped-list-sort-label`
     written there would match, be overridden and never be used. The sheet's own note beside
     `.manager-scoped-list-count` records that exact loss. The declarations these override are the
     two rules directly above, so the override lives beside them.

     ── ROUTE-SCOPED, SO THE ESSENCE AND TOOL CATALOGUES DO NOT MOVE ───────────────────────────
     Three screens compose this frame and only one of them has a reference to be right about. The
     `:global()` prefix reaches the manager area root, which is outside this component's markup;
     everything after it stays scoped, so these rules can still only match THIS frame's own
     elements. Deleting the attribute selector would take both values to all three catalogues. */
  :global(.fabricate-manager[data-manager-view='world-components'])
    .manager-scoped-list-sort-label {
    font-size: 0.531rem;
    font-weight: 700;
    letter-spacing: 0.09em;
  }

  :global(.fabricate-manager[data-manager-view='world-components']) .manager-scoped-list-direction {
    color: var(--fab-text-secondary);
    font-size: 0.6875rem;
    font-weight: 600;
  }

  /* `6 of 6 essences`, pushed to the trailing edge of the row exactly as the prototype draws it.
     `margin-left: auto` rather than a spacer element, so a narrow container wraps it onto its own
     line instead of stranding an empty box. */
  .manager-scoped-list-count {
    flex: 0 0 auto;
    margin-left: auto;
    color: var(--fab-text-subtle);
    font-size: 0.68rem;
    white-space: nowrap;
  }

  /* THE SCROLLER RESTS ON A ROW BOUNDARY, NEVER THROUGH ONE (issue 1373).

     Opening a catalogue on a selected row auto-scrolls it into view, and an auto-scroll lands
     wherever the target needs it to — which left the frame opening on a half-row, cut through
     its own title, with no mask or fade to say the list continues above. `proximity` snapping
     is the gentlest control that fixes it: it does not fight a wheel or a drag the way
     `mandatory` does, and it settles the rest position onto a row start.

     `scroll-padding-block-start` is what keeps the FIRST row reachable once a lead element sits
     above it: without it a snap to the first row hides the lead entirely. */
  .manager-scoped-list-rows {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    scroll-padding-block-start: var(--fab-space-1);
    scroll-snap-type: y proximity;
  }

  /* `:global` because the rows are `<li>` elements this component writes but whose class rules
     live in `styles/fabricate.css`; the SNAP is a fact about this scroller rather than about the
     row's appearance, so it is stated here, against the scroller that owns it. */
  .manager-scoped-list-rows :global(.manager-scoped-list-row) {
    scroll-snap-align: start;
  }

  /* AND THE TOP OF THE LIST IS A SNAP POINT, which is not optional once the rows are.

     `proximity` snapping resolves a rest position to the NEAREST snap point, and with points on
     the rows alone the nearest one to `scrollTop: 0` is the first ROW — so the scroller settled
     one lead-element down from its own top and the `listLead` creation zone was scrolled out of
     view at rest, with nothing having been scrolled. Caught by looking at the frame: the gate
     passed, because the zone was still inside the list's box.

     `:first-child` rather than a named class, because the first child is the lead when a lane
     supplies one and the `<ul>` when it does not, and both want the same answer. */
  .manager-scoped-list-rows > :global(:first-child) {
    scroll-snap-align: start;
  }

  /* THE ONE GAP UNDER THE LEAD (issue 1373, maintainer feedback round 2). Stated on the lead
     rather than on each of the three things that can follow it — the filtered hero, the empty
     hero and the `<ul>` — because it is one relationship, and three copies of it is how the
     empty state came to touch the drop zone while the rows did not.

     A step above the `--fab-space-2` rhythm the rows themselves keep, which is the design's own
     proportion at `proto:1980`: the zone is a different KIND of thing from the rows under it and
     reads as one only when it is spaced further than they are from each other. */
  .manager-scoped-list-lead {
    margin-bottom: var(--fab-space-3);
    min-width: 0;
  }

  /* THE SCROLL MOVED OFF THE PANEL AND ONTO ITS MIDDLE CHILD.

     The prototype pins `Open definition` to the FOOT of the inspector, full width, below a
     divider (`essences.png`) — the same relationship the pagination bar has to the list, and for
     the same reason: it is the panel's one primary action and it must not walk off the bottom of
     a column whose body is a world-defaults stack, a system list and a pager. So the identity
     block and the foot are `flex: 0 0 auto` and the body between them takes the slack and owns
     the `overflow-y`, exactly as `.manager-scoped-list-column` already arranges its own three
     parts. A `grid-template-rows` triple would do the same but charge two row gaps for the two
     tracks the resting and bulk states leave empty. */
  /* A BARE COLUMN, NOT A CARD (issue 1372, maintainer parity round 8).

     The reference's inspector is an unbordered column on the pane's own surface, with a single
     hairline above its pinned foot action (`tmp/proto/essence-catalogue.png`). This carried a
     1px border and a 10px radius around the whole panel, so its world-default cards, its system
     rows and its roster panel all read as cards inside a card — three nested borders where the
     reference has one, and a right third that looked like a separate screen.

     The surface stays `--fab-bg-0`, the pane's own: `--fab-bg-2` put the column two rungs above
     the pane, which is the divergence that made it read as a different screen in the first
     place. The `padding-inline-start` is what now separates the column from the list, since
     there is no border to do it. */
  /* THE SAME ASIDE AS THE SYSTEM SCOPE, IN FILL, EDGE AND INSET (issue 1373, maintainer round 4).

     This column stands in for the shared `.manager-inspector`, which the world routes release
     from the body grid, so it has to answer that aside's three surface facts and not invent its
     own: a `border-left` hairline (the shared rule, `styles/fabricate.css`), `--fab-bg-1` — one
     rung above the pane, which is `proto:2548` and what the tools route already takes — and a
     `--fab-space-4` inset on all four sides. It drew `--fab-bg-0` flat against the pane with no
     edge and an asymmetric inset that left no right-hand margin at all, so a GM crossing from
     Tool Rules to the Tools Catalogue met a differently-built column stating the same thing.

     AUTHORED HERE AND NOT IN THE SHEET, and that is mechanical rather than stylistic:
     `styles/fabricate.css` is imported at `layer(modules)` and a Svelte scoped block is injected
     unlayered, so a sheet rule for a property this block declares matches, out-specifies, and is
     discarded — silently, with no failing gate. See `tests/view-lab/cascade.css`. */
  .manager-scoped-list-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-4);
    border-left: 1px solid var(--fab-border);
    background: var(--fab-bg-1);
  }

  .manager-scoped-list-inspector-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }

  /* THE RESTING PANEL IS CONTENT-HEIGHT AT THE TOP OF THE COLUMN (issue 1373, maintainer
     feedback round 3). The ASIDE runs the full height of the app — that is finding 6 and it
     stays — but the panel inside it does not stretch to fill it.

     THIS REVERSES THE `flex: 1 1 auto` THE PREVIOUS ROUND SHIPPED, and the argument is already
     settled in this repository rather than re-opened here. `styles/fabricate.css` records the
     identical correction for the identical control on the screen the finding names as the
     model: `.manager-tool-browser-inspector-empty` went from `flex: 1 1 auto` to `flex: 0 0
     auto` for issue 1373 because stretching it "introduced a container the POPULATED panel does
     not have" — a ~700px dashed box answering a ~220px list card, the two halves of one screen
     stating the same absence at three times the size. The system Tool Rules rail draws it
     content-height and top-aligned, and this is the shared frame's half of the same treatment.

     `:global()` and a DIRECT-CHILD combinator: the element is `EmptyState`'s, so it can never
     carry this component's scope hash, and the `>` keeps the rule off any empty state a lane's
     own inspector body renders further down the same scroller. */
  .manager-scoped-list-inspector-scroll > :global(.manager-empty) {
    flex: 0 0 auto;
    min-height: 0;
  }

  .manager-scoped-list-inspector-identity {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* THE ROW'S FACT RUN, in the identity column under the name. It wraps rather than truncating,
     because every chip in it names a rule and a clipped rule is worse than a two-line row. */
  .manager-scoped-list-row-facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-1);
    min-width: 0;
    margin-top: var(--fab-space-2xs);
  }

  /* THE LABELLED ROW ACTION: a small bordered button with a trailing external-link glyph, which
     is what the design draws at the trailing edge of a catalogue row (`proto:1997`). Foundry's
     fixed button geometry is reset explicitly, as every other manager `<button>` wearing its own
     chrome resets it.

     IT IS NOT THE SAME BOX AS `SystemRulesRoster`'s `Rules ↗`, and this note used to claim it
     was. Read against the design's own markup the two are deliberately different controls: this
     one is a bordered button on a filled surface, and the roster's is a bare accent TEXT link
     inside a 300px panel (`proto:2031`). Matching them made the inspector's navigation compete
     with the panel's pinned primary action for the same weight. */
  .manager-scoped-list-row-action {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: auto;
    height: 26px;
    min-height: 26px;
    margin: 0;
    padding: 0 var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    color: var(--fab-text-muted);
    background: transparent;
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
    cursor: pointer;
  }

  .manager-scoped-list-row-action:hover {
    border-color: var(--fab-accent);
    color: var(--fab-accent);
  }

  .manager-scoped-list-row-action:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* The colour caption, under the name and above the description. See `colourCaption` for why it
     carries the token's NAME and not the prototype's hex. */
  .manager-scoped-list-inspector-caption {
    color: var(--fab-text-subtle);
    font-size: 0.66rem;
  }

  /* FULL COLUMN WIDTH, below the medallion rather than beside it. */
  .manager-scoped-list-inspector-description {
    margin: var(--fab-space-2xs) 0 0;
    color: var(--fab-text-muted);
    font-size: 0.72rem;
    line-height: 1.45;
    overflow-wrap: break-word;
  }

  /* The pinned foot. Its divider is the row's own border rather than a `<hr>`. It does NOT
     stretch its child: `ManagerButton` owns a `fullWidth` prop, so the lane says so at the call
     site rather than this frame reaching across a component boundary to re-declare it. */
  .manager-scoped-list-inspector-foot {
    display: grid;
    flex: 0 0 auto;
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
    min-width: 0;
  }

  /* The landmark is a focus TARGET, not a tab stop, so the ring is drawn only for a
     keyboard-driven landing. */
  .manager-scoped-list-inspector:focus {
    outline: none;
  }

  .manager-scoped-list-inspector:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .manager-scoped-list-unavailable {
    min-width: 0;
  }

  /* The source badge's hook wrapper. It carried the attribute every row assertion reads and NO
     rule at all, so the pill it wraps sat in the meta run as a bare inline box that could not
     align with the chips beside it. */
  .manager-scoped-list-source {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 0;
  }

  /* BELOW THE THRESHOLD THE INSPECTOR STACKS UNDER THE LIST rather than compressing to a column
     too narrow to read a name in. 760px is the list column's own floor plus the 300px inspector
     and the gap between them; under it the two-track grid would put both below their minimums at
     once, which is worse than one full-width column followed by the panel. */
  @container (max-width: 760px) {
    .manager-scoped-list-layout.has-inspector {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
