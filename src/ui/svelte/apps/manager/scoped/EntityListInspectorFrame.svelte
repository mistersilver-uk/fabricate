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
   - inspectorCaption(entry): the one line under the inspected name — the slot the prototype
     fills with a colour name and its hex. A SNIPPET rather than a string prop, because what
     belongs there is per-entity and per-scope (a colour for an essence, a source item for a
     component) and only the lane knows which. The frame renders the colour TOKEN NAME when no
     lane supplies one.
   - inspectorFoot(entry): the full-width action pinned to the BOTTOM of the inspector, outside
     its scroll area, exactly as the pagination bar sits outside the list's.
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
    countUnit = '',
    // Whether the toolbar offers the world/system MEMBERSHIP `<select>`. Default ON, so every
    // other caller renders unchanged. The essence catalogue turns it off: the prototype's toolbar
    // is `[All] [search] SORT BY [Name] [Asc]  6 of 6 essences` and carries no such control
    // (`essences.png`), and on a WORLD catalogue the axis it filters — "held by at least one
    // system" — is already the `n/24 SYSTEMS` stat on every row and the `13 / 24` in the
    // inspector, so the select spent toolbar width on a question the list already answers.
    membershipFilter = true,
    // The VISIBLE caption on the select-all box. The prototype's reads `All` where the shipped
    // primitive says `Select all`. Only the caption moves: the primitive's `ariaLabel` is
    // untouched, because `All` is not an accessible name a screen-reader user can act on.
    selectAllLabel = '',
    bulk = undefined,
    selectedId = $bindable(''),
    onSelect = () => {},
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

  const DEFAULT_PAGE_SIZE = 25;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
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

  const laneFilters = $derived(Array.isArray(filters) ? filters : []);
  const laneSorts = $derived(Array.isArray(sorts) ? sorts : []);

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
   * @param {object|null} entry
   * @returns {{scope: object|null, systems: object[], systemId: string, selected: boolean,
   *   member: boolean, systemRow: object|null}}
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

  function descriptionOf(entry) {
    const description = entry?.entity?.description;
    return typeof description === 'string' && description.trim()
      ? description
      : text('FABRICATE.Admin.Manager.Scoped.List.NoDescription', 'No description');
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

  const membershipLabels = $derived({
    all: text('FABRICATE.Admin.Manager.Scoped.List.MembershipAll', 'All'),
    member: text('FABRICATE.Admin.Manager.Scoped.List.MembershipMember', 'In at least one system'),
    unused: text('FABRICATE.Admin.Manager.Scoped.List.MembershipUnused', 'In no system'),
    in: text('FABRICATE.Admin.Manager.Scoped.List.MembershipIn', 'In this system'),
    out: text('FABRICATE.Admin.Manager.Scoped.List.MembershipOut', 'Not in this system'),
  });

  const sortKeyLabels = $derived({
    name: text('FABRICATE.Admin.Manager.Scoped.List.SortKeyName', 'Name'),
    systems: text('FABRICATE.Admin.Manager.Scoped.List.SortKeySystems', 'Systems'),
  });

  const sortOptions = $derived([
    ...Object.keys(sortKeyLabels).map((id) => ({ id, label: sortKeyLabels[id] })),
    ...laneSorts.map((descriptor) => ({ id: descriptor.id, label: descriptor.label })),
  ]);

  const directionLabel = $derived(
    sortDirection === 'asc'
      ? text('FABRICATE.Admin.Manager.Scoped.List.SortAsc', 'Asc')
      : text('FABRICATE.Admin.Manager.Scoped.List.SortDesc', 'Desc')
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
      <div class="manager-scoped-list-column">
        <ManagerToolbar
          class="manager-scoped-list-toolbar"
          data-scoped-list-toolbar=""
          ariaLabel={text('FABRICATE.Admin.Manager.Scoped.List.Filters', 'List filters')}
        >
          <!--
            ONE ROW, AND THE SELECTION CONTROL IS IN IT.

            The prototype's catalogue toolbar is a single line — `[☐ All] [🔍 Search essences…]
            SORT BY [Name ▾] [⇅ Asc]  6 of 6 essences` (`essences.png`) — where this frame shipped
            two bands, the second holding nothing but a select-all box. The band cost about 40px
            above the first row and read as a mode the GM had entered rather than as a control.

            `BulkSelectionToolbar` renders its own `<div class="{rowClass} is-selection">` and
            cannot be told not to, so it is NESTED INSIDE the filter row and flattened to
            `display: contents` by the scoped rule below. Its children — the box, and the count,
            select-all-results and Clear controls that appear only at a non-zero count — then join
            this row directly, which is exactly the register the prototype draws.

            Its `rowClass` is UNCHANGED. `scoped-entity-list-shells-mounted.test.js` asserts this
            root wears `manager-scoped-list-filter-row` and no studio default, and the flattening
            is a layout fact rather than a naming one.
          -->
          <div class={TOOLBAR_ROW_CLASS}>
            <BulkSelectionToolbar
              rowClass={TOOLBAR_ROW_CLASS}
              toolbarAttr={TOOLBAR_ATTR}
              pageBoxAttr={PAGE_BOX_ATTR}
              countAttr={COUNT_ATTR}
              resultsAttr={RESULTS_ATTR}
              clearAttr={CLEAR_ATTR}
              pageSelectionState={selection.pageSelectionState}
              count={selection.count}
              showSelectAllResults={selection.showSelectAllResults}
              selectAllResultsCount={selection.selectAllResultsCount}
              {selectAllLabel}
              onTogglePage={togglePage}
              onSelectAllResults={selectAllResults}
              onClear={clearSelection}
            />

            <ManagerSearchField
              value={query}
              onInput={(next) => changeQuery(next)}
              placeholder={searchPlaceholder ||
                text('FABRICATE.Admin.Manager.Scoped.List.SearchPlaceholder', 'Search…')}
              ariaLabel={text('FABRICATE.Admin.Manager.Scoped.List.SearchLabel', 'Search')}
              inputAttrs={{ 'data-scoped-list-search': '' }}
            />

            {#if membershipFilter}
              <select
                value={membership}
                data-scoped-list-membership
                aria-label={text(
                  'FABRICATE.Admin.Manager.Scoped.List.MembershipLabel',
                  'Membership filter'
                )}
                onchange={(event) => changeMembership(event.currentTarget.value)}
              >
                {#each membershipOptions as option (option)}
                  <option value={option}>{membershipLabels[option]}</option>
                {/each}
              </select>
            {/if}

            {#each laneFilters as filter (filter.id)}
              <select
                value={filterValues[filter.id] ?? 'all'}
                data-scoped-list-filter={filter.id}
                aria-label={filter.label}
                onchange={(event) => changeFilter(filter.id, event.currentTarget.value)}
              >
                {#each filter.options ?? [] as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            {/each}

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
              <i class="fas fa-arrow-down-a-z" aria-hidden="true"></i>
              <span>{directionLabel}</span>
            </button>

            {#if resultCount}
              <span class="manager-scoped-list-count" data-scoped-list-count>{resultCount}</span>
            {/if}
          </div>
        </ManagerToolbar>

        {#if bulk && !inspectorBody && selection.count > 0}
          <!-- With no inspector column there is nowhere else for a bulk body to go, so it sits
             directly under the toolbar that states the count it acts on. -->
          <section class="manager-scoped-list-bulk" data-scoped-list-bulk>
            {@render bulk([...selectedIds], rowContext(null))}
          </section>
        {/if}

        <div class="manager-scoped-list-rows">
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
                {@const name = scopedEntryName(entry)}
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
                      size={40}
                    />
                    <span class="manager-system-copy">
                      <span class="manager-system-name" title={name}>{name}</span>
                      <span class="manager-system-description" title={descriptionOf(entry)}>
                        {descriptionOf(entry)}
                      </span>
                    </span>
                  </button>

                  <!-- A `<div>`, not the `<span>` `ComponentRow` uses: a lane's `rowMeta` — and the
                     rules-list shell's own `InheritRow` — render block elements, and a `<div>`
                     inside a `<span>` is invalid nesting the browser silently reparents. -->
                  <div class="manager-scoped-list-row-meta">
                    {#if scope?.sourceLinked === true}
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
                    {#if rowMeta}{@render rowMeta(entry, rowContext(entry))}{/if}
                  </div>

                  <span class="manager-action-group">
                    {#each rowActions as action (action.id)}
                      <IconButton
                        data-scoped-list-action={action.id}
                        ariaLabel={`${action.label} — ${name}`}
                        title={action.label}
                        onclick={() => action.run(entry)}
                      >
                        <i class={action.icon} aria-hidden="true"></i>
                      </IconButton>
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
      </div>

      {#if inspectorBody}
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
                  {#if caption}
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
              <EmptyState
                compact
                {icon}
                title={text('FABRICATE.Admin.Manager.Scoped.List.RestingTitle', 'Nothing selected')}
                hint={subtitle}
                dataAttr="data-scoped-list-inspector-state"
                dataValue="resting"
              />
            </div>
          {/if}
        </aside>
      {/if}
    {/if}
  </div>
</div>

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

  /* 300px, matching the shared aside this column stands in for, so a GM sees ONE inspector width
     across both scopes rather than learning a second one per screen. */
  .manager-scoped-list-layout.has-inspector {
    grid-template-columns: minmax(0, 1fr) 300px;
  }

  .manager-scoped-list-column {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
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

  /* THE SELECTION REGISTER IS FLATTENED INTO THE FILTER ROW. `BulkSelectionToolbar` renders its
     own row element and takes no "render inline" prop, so the box is nested and its wrapper is
     removed from the box tree — which also drops the global `.is-selection` hairline and its
     `padding-top`, since neither paints on a `display: contents` box.

     `:global()` because the element is the PRIMITIVE'S, not this template's: Svelte's
     unused-selector analysis cannot see across a component boundary and would emit this whole
     block as a dead comment. The local half of the selector keeps it out of every other screen,
     exactly as the `.manager-pagination` rule above does. */
  /* BOTH compounds are `:global` now (issue 1039), and it has to be both. The ancestor is a
     `<ManagerToolbar>` tag and the child is `BulkSelectionToolbar`'s own element, so NEITHER can
     carry this component's scope hash — leaving the ancestor scoped emitted
     `.manager-scoped-list-toolbar.svelte-… .manager-scoped-list-filter-row.is-selection`, which
     matched nothing while looking exactly like the working rule. Specificity is unchanged at
     (0,4,0): two classes on the ancestor, two on the child, and a `:global()` contributes none of
     its own. The pair still keeps this off every other screen, exactly as the note below says. */
  :global(.manager-toolbar.manager-scoped-list-toolbar)
    :global(.manager-scoped-list-filter-row.is-selection) {
    display: contents;
  }

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

  .manager-scoped-list-rows {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
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
  .manager-scoped-list-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
    min-height: 0;
    padding: var(--fab-space-2) 0 var(--fab-space-3) var(--fab-space-3);
    background: var(--fab-bg-0);
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

  .manager-scoped-list-inspector-identity {
    display: flex;
    flex: 0 0 auto;
    flex-direction: column;
    gap: var(--fab-space-2xs);
    min-width: 0;
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
