<!-- Svelte 5 runes mode -->
<!--
  The GM essence library (issue 1036): toolbar -> selection bar -> rows or cards -> pager,
  with the shell's own `.manager-inspector` column carrying `EssenceBrowserInspector` or,
  while a bulk selection exists, `EssenceBulkEditPanel`.

  It is the THIRD studio to get this shape, and it borrows rather than re-derives: the pure
  filter/sort/paginate pipeline is `essenceBrowserModel.js`, the selection maths is the
  shared `bulkSelectionModel.js` leaf reached through `essenceBulkEditModel.js`, the
  multi-select row is the shared `BulkSelectionToolbar`, and the pager is `Pagination`.
  Nothing about a list of essences is new; only the STATUS axis and the list/grid toggle
  are, and both are `SegmentedControl`.

  ── THE BROWSER STATE IS LIFTED ───────────────────────────────────────────────────
  Search, status, source, sort, view mode, page and the bulk selection all live on ONE
  `$state` object the manager root owns and binds here. That is criterion 12: the shipped
  browser kept them component-locally, so opening an essence unmounted this view and coming
  back reset the page, the filters and the search the GM had left. When UNBOUND — the
  isolated mounted tests — the local fallback below keeps every control reactive
  in-component.

  ── ROW ARIA ──────────────────────────────────────────────────────────────────────
  There is no `role="table"` head any more, so the rows are a plain container and carry no
  `role="row"` / `role="cell"` / `aria-selected`. A card row has no columns to label, and
  `aria-selected` is not valid on a plain `div`. Selection is conveyed by the `.is-selected`
  ring plus the inspector heading, matching `RecipesBrowserView`.
-->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import LibraryShelf from './library/LibraryShelf.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import BulkSelectionToolbar from './BulkSelectionToolbar.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import EssenceRow from './essences/EssenceRow.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import {
    ESSENCE_SORT_KEYS,
    buildEssenceBrowserModel,
    createEssenceBrowserState,
    describeActiveEssenceFilters,
  } from '../../../../utils/essenceBrowserModel.js';
  import {
    describeEssenceSelection,
    pruneEssenceSelection,
    setEssenceSelection,
    toggleEssenceSelection,
  } from '../../../../utils/essenceBulkEditModel.js';
  import { ESSENCE_VIEW_MODE_SEGMENTS } from './essences/essenceStudio.js';
  import { essenceShortValueName, essenceSystemState } from './scoped/essenceScoped.js';

  let {
    // ── THE WORLD-SCOPE SEAM (issue 1374), READ HERE FROM ISSUE 1372 ────────────────────────
    // `scope`, `actions` and `systemId` are three of the four keys `essenceScopeProps` supplies,
    // so declaring them is CORRECT rather than hazardous: the spread owns each name, and the
    // lookup never falls through to the bundle thunk. `systems` is deliberately NOT declared —
    // this screen resolves membership against `scope.entries`, which is the projection's join,
    // and the narrowed `{id, name}` roster answers none of the three questions it asks.
    scope = null,
    actions = null,
    systemId = '',
    essenceCards = [],
    showSourceUi = false,
    showPropertyMacroUi = false,
    selectedEssenceId = '',
    selectedSystemId = '',
    onSelectEssence = () => {},
    onEditEssence = () => {},
    onToggleEssenceEnabled = () => {},
    // Told AFTER the toolbar's Clear has emptied the selection (issue 1157). The clear is
    // still this browser's — the selection is its state — but the FEEDBACK is not: emptying
    // the selection unmounts the bulk panel and the Clear button that was pressed, so focus
    // and the announcement have to be handled by something that outlives both. Optional, so
    // a standalone mount still clears exactly as it did.
    onSelectionCleared = null,
    browserState = $bindable(null),
  } = $props();

  // ── THE MEMBERSHIP FILTER IS COMPONENT-LOCAL, AND THAT IS A DECISION ─────────────────────
  // Every other axis on this toolbar lives on the LIFTED browser state so it survives the editor
  // round-trip. This one does not, because it is not a preference: `All world essences` puts rows
  // on screen that this system does not have, and a GM returning from an editor to a list showing
  // entities that are not in the system they are editing would read it as data loss. It resets to
  // `in` on every mount, which is the state the shipped screen has always had.
  let membershipFilter = $state('in');

  let ownBrowserState = $state(createEssenceBrowserState());
  // The active view-state: the root's lifted object when bound, else the local fallback.
  // Both are `$state` proxies, so nested writes (`ui.statusFilter = …`) are reactive AND,
  // when bound, propagate back to the root so the state persists across the editor
  // round-trip.
  const ui = $derived(browserState ?? ownBrowserState);

  // Switching system resets the SOURCE filter, the page and the bulk selection: a source
  // filter names link states of a vocabulary the new system does not share, and the
  // selected ids name essences it does not have. Status, sort, view mode and page size are
  // NOT reset — enabled means the same thing in every system, so they are preferences.
  //
  // The sentinel is `ui.systemId`, PERSISTED on the lifted state rather than a
  // component-local `$state`: a local one re-initialises to '' on every mount, so returning
  // from the editor would be misread as a system switch and would wipe the very state this
  // object exists to preserve.
  $effect(() => {
    if (selectedSystemId === ui.systemId) return;
    ui.searchTerm = '';
    ui.sourceFilter = 'all';
    ui.pageIndex = 0;
    ui.bulkSelectedEssenceIds = new Set();
    ui.systemId = selectedSystemId;
    // The membership axis names THIS system's records, so it cannot survive a system switch for
    // the same reason the source filter cannot.
    membershipFilter = 'in';
  });

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

  // ── MEMBERSHIP, RESOLVED AGAINST THE WORLD CORPUS ────────────────────────────────────────
  //
  // TWO OPTIONS, NOT THREE. `In this system` and `All world essences`, each carrying its count.
  // The shared list model offers `all` / `in` / `out` for a system-scope list, and this screen is
  // the prototype's `sysEss`, which offers two: `out` alone is a list a GM cannot act on from
  // here beyond adding, and `all` already contains it with the members for context.
  const activeSystemId = $derived(String(systemId || selectedSystemId || ''));
  const worldEntries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);
  // The filter renders only when the world corpus can actually answer it. An unreadable corpus
  // publishes `available: false`, and a control offering `All world essences` over a corpus
  // nobody could read would report every essence as absent from this system.
  const membershipAvailable = $derived(scope?.available === true && activeSystemId !== '');
  const memberIds = $derived(new Set((essenceCards || []).map((essence) => essence.id)));
  const systemRows = $derived(
    new Map(
      worldEntries.map((entry) => [
        entry.id,
        (entry.systems ?? []).find((row) => row.systemId === activeSystemId) ?? null,
      ])
    )
  );
  const membershipCounts = $derived({
    in: (essenceCards || []).length,
    all: Math.max(worldEntries.length, (essenceCards || []).length),
  });

  // BOTH COUNTS ARE ALWAYS ON SCREEN, which is the whole reason this axis is a segmented control
  // rather than the `<select>` it shipped as: the pair is the fact, not either half of it.
  //
  // The count goes in the primitive's OWN `count` slot rather than into the label string. That is
  // the same rendering the status segments beside it already use (`All 6 / Enabled 5 /
  // Disabled 1`), so the two adjacent controls state a count one way on this bar instead of two;
  // the prototype's `(3)` parenthesis is the mock's spelling of the same slot.
  const membershipOptions = $derived([
    {
      value: 'in',
      labelKey: 'FABRICATE.Admin.Manager.Essence.MembershipIn',
      fallback: 'In this system',
      count: membershipCounts.in,
    },
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Essence.MembershipAll',
      fallback: 'All world essences',
      count: membershipCounts.all,
    },
  ]);

  /**
   * The world essences this system has NO record for, projected into the card shape the row
   * renders, so one list can carry both.
   *
   * `enabled: true` is not a fiction: `addToSystem` seeds a membership record with `enabled: true`,
   * so it is what this row WILL be the moment the Add beside it is pressed — which is also why the
   * status segment counts it as enabled under `All world essences`.
   */
  const absentCards = $derived(
    membershipFilter === 'all' && membershipAvailable
      ? worldEntries
          .filter((entry) => !memberIds.has(entry.id))
          .map((entry) => ({
            id: entry.id,
            name: entry.entity?.name || entry.id,
            description: entry.entity?.description || '',
            icon: entry.entity?.icon || 'fas fa-mortar-pestle',
            colorToken: entry.entity?.colorToken || '',
            enabled: true,
            componentUsageCount: 0,
            recipeUsageCount: 0,
            hasEffectTransfer: false,
            hasPropertyMacro: false,
            sourceState: 'none',
          }))
      : []
  );
  const listCards = $derived([...(essenceCards || []), ...absentCards]);

  /**
   * One row's three-state membership answer.
   *
   * @param {object} essence a rendered card.
   * @returns {string} one of `absent` / `disabled` / `enabled`.
   */
  function membershipStateOf(essence) {
    if (!memberIds.has(essence?.id)) return 'absent';
    return essenceSystemState({ member: true, enabled: essence?.enabled !== false });
  }

  /**
   * ONE ROW'S SUMMARY LINE: what this essence DOES in this system, section by section.
   *
   * ── IT NAMES THE VALUE. THE SHIPPED LINE NAMED THE STATE ─────────────────────────────────
   * The prototype's row reads `Effects from Ember Brand (override) · Macro: Radiant Blessing`
   * (`sysEss.png`): the effect source item and the macro by NAME, with the local override marked
   * in parentheses. What shipped was `Effect source overridden here · Property macro overridden
   * here` — the same four words twice, naming nothing, so a GM could not tell what any essence on
   * the list actually does without opening it, and two rows overriding different things read
   * identically.
   *
   * THE OVERRIDE MARK IS A SUFFIX, NOT THE SUBJECT. An inheriting section states its value with no
   * parenthesis, which is also why every member row now carries a line where only overriding rows
   * did: the value is the point, and the common case is exactly the one a GM most needs stated.
   *
   * ── WHAT IT CANNOT SAY, AND WHY ──────────────────────────────────────────────────────────
   * A macro is stored as a UUID and the store publishes no resolved name for it — naming the
   * document needs `await fromUuid` per row, which this projection cannot do. So the macro clause
   * carries `essenceShortValueName`'s terminal segment, which is the id a GM recognises, where the
   * prototype's mock carries a display name.
   *
   * @param {object} essence a rendered card.
   * @returns {Array<{section: string, label: string}>}
   */
  function summaryClauses(essence) {
    if (!membershipAvailable || !memberIds.has(essence?.id)) return [];
    const inherited = systemRows.get(essence?.id)?.inherited ?? null;
    const clauses = [];
    if (showSourceUi) {
      clauses.push({
        section: 'effectSource',
        label: withOverride(effectClause(essence), inherited?.effectSource === false),
      });
    }
    if (showPropertyMacroUi) {
      clauses.push({
        section: 'macro',
        label: withOverride(macroClause(essence), inherited?.macro === false),
      });
    }
    return clauses;
  }

  /**
   * The effect-source clause, in three states.
   *
   * A BROKEN LINK IS ITS OWN WORDING rather than the plain phrase. The row's Effects chip already
   * carries the breakage in a warning tone and a title, and this is the same fact in words beside
   * it — three channels for a state whose whole consequence is that nothing transfers.
   *
   * An early-return chain, not a nested ternary: SonarCloud reports S3358 in a file it indexes.
   *
   * @param {object} essence
   * @returns {string}
   */
  function effectClause(essence) {
    if (essence?.hasEffectTransfer !== true) {
      return text('FABRICATE.Admin.Manager.Essence.SummaryNoEffects', 'No effects');
    }
    const name =
      essenceShortValueName(essence?.sourceName) ||
      text('FABRICATE.Admin.Manager.Essence.SourceNoneShort', 'None');
    if (essence?.sourceState !== 'linked') {
      return format(
        'FABRICATE.Admin.Manager.Essence.SummaryEffectsBroken',
        'Effects from {name} (link broken)',
        { name }
      );
    }
    return format('FABRICATE.Admin.Manager.Essence.SummaryEffects', 'Effects from {name}', {
      name,
    });
  }

  /**
   * The macro clause, in two states.
   *
   * @param {object} essence
   * @returns {string}
   */
  function macroClause(essence) {
    const name = essenceShortValueName(essence?.propertyMacroUuid);
    if (!name) return text('FABRICATE.Admin.Manager.Essence.SummaryNoMacro', 'No macro');
    return format('FABRICATE.Admin.Manager.Essence.SummaryMacro', 'Macro: {name}', { name });
  }

  /**
   * Mark a clause as this system's own rather than the world's.
   *
   * @param {string} clause
   * @param {boolean} overridden
   * @returns {string}
   */
  function withOverride(clause, overridden) {
    if (!overridden) return clause;
    return format('FABRICATE.Admin.Manager.Essence.SummaryOverride', '{clause} (override)', {
      clause,
    });
  }

  // The SEARCH is applied here rather than in the pure model, which says so in its own
  // header: whether a source name is searchable depends on `showSourceUi`, and that is a
  // presentation fact the model has no business knowing. The TERM still lives on the lifted
  // state so it survives the round-trip.
  const searchTerm = $derived(String(ui.searchTerm || ''));
  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const searchedEssences = $derived(
    normalizedSearch
      ? listCards.filter((essence) =>
          [
            essence.name || '',
            essence.description || '',
            showSourceUi ? essence.sourceName || '' : '',
            essence.id || '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedSearch)
        )
      : listCards
  );

  // THE STATUS AND SOURCE AXES ARE STILL THREADED, AND THEY ARE NOW ALWAYS `all`.
  //
  // The two controls that wrote them are gone from the bar (see the note beside the membership
  // segment). The pure model keeps both axes because they are a property of a browser pipeline
  // three studios share rather than of this toolbar, and pinning them here is what makes the
  // removal a TOOLBAR change: nothing about which rows the model can express has moved, so the
  // axes remain available to a screen that has a reason to offer them.
  const model = $derived(
    buildEssenceBrowserModel(searchedEssences, {
      status: ui.statusFilter,
      source: showSourceUi ? ui.sourceFilter : 'all',
      key: ui.sortKey,
      direction: ui.sortDirection,
      pageIndex: ui.pageIndex,
      pageSize: ui.pageSize,
    })
  );

  $effect(() => {
    if (model.pageIndex !== ui.pageIndex) ui.pageIndex = model.pageIndex;
  });

  const chips = $derived(
    describeActiveEssenceFilters({
      status: ui.statusFilter,
      source: showSourceUi ? ui.sourceFilter : 'all',
      search: searchTerm,
    })
  );
  const filtersActive = $derived(chips.length > 0);

  // ── Bulk selection ───────────────────────────────────────────────────────────────
  // `pageIds` is the set of RENDERED ids and `filteredIds` the whole filtered set: the
  // tri-state page box acts on what the GM can see, and `Select all {N} results` is the
  // only route to a row the page control cannot reach.
  const bulkSelectedIds = $derived(ui.bulkSelectedEssenceIds ?? new Set());
  const selectionSummary = $derived(
    describeEssenceSelection({
      pageIds: model.pageIds,
      filteredIds: model.filteredIds,
      selectedIds: bulkSelectedIds,
    })
  );

  // A delete, a system refresh or a filter change must never leave a phantom id in the
  // count or in an Apply. Only assigned when something actually dropped — the pruned set is
  // a subset, so equal sizes mean an identical set — so this cannot loop.
  $effect(() => {
    const current = ui.bulkSelectedEssenceIds ?? new Set();
    if (current.size === 0) return;
    const pruned = pruneEssenceSelection(
      current,
      (essenceCards || []).map((essence) => essence.id)
    );
    if (pruned.size !== current.size) ui.bulkSelectedEssenceIds = pruned;
  });

  // Every mutation assigns a NEW Set. The reactive unit is `ui.bulkSelectedEssenceIds`, not
  // the Set, so an in-place mutation compiles, runs, and silently stops the bound lifted
  // state propagating back to the manager root.
  function toggleBulkSelected(id) {
    ui.bulkSelectedEssenceIds = toggleEssenceSelection(bulkSelectedIds, id);
  }

  function setPageSelected(on) {
    ui.bulkSelectedEssenceIds = setEssenceSelection(bulkSelectedIds, model.pageIds, on);
  }

  function selectAllResults() {
    ui.bulkSelectedEssenceIds = setEssenceSelection(bulkSelectedIds, model.filteredIds, true);
  }

  // The write comes FIRST, so the owner's callback runs with Svelte's flush already queued
  // ahead of the focus hop it schedules.
  function clearBulkSelection() {
    ui.bulkSelectedEssenceIds = new Set();
    onSelectionCleared?.();
  }

  const viewModeOptions = $derived(
    ESSENCE_VIEW_MODE_SEGMENTS.map((segment) => ({
      value: segment.value,
      labelKey: segment.labelKey,
      fallback: segment.fallback,
      icon: segment.icon,
    }))
  );

  const SORT_LABELS = {
    name: ['FABRICATE.Admin.Manager.Essence.SortName', 'Name'],
    status: ['FABRICATE.Admin.Manager.Essence.SortStatus', 'Status'],
    components: ['FABRICATE.Admin.Manager.Essence.SortComponents', 'Components'],
    recipes: ['FABRICATE.Admin.Manager.Essence.SortRecipes', 'Recipes'],
  };

  const CHIP_LABELS = {
    status: ['FABRICATE.Admin.Manager.Essence.ChipStatus', 'Status: {value}'],
    source: ['FABRICATE.Admin.Manager.Essence.ChipSource', 'Source: {value}'],
    search: ['FABRICATE.Admin.Manager.Essence.ChipSearch', 'Search: {value}'],
  };

  function sortLabel(key) {
    const [labelKey, fallback] = SORT_LABELS[key] || SORT_LABELS.name;
    return text(labelKey, fallback);
  }

  function chipLabel(chip) {
    const [labelKey, fallback] = CHIP_LABELS[chip.id];
    return format(labelKey, fallback, { value: chip.value });
  }

  function clearChip(chipId) {
    if (chipId === 'status') ui.statusFilter = 'all';
    if (chipId === 'source') ui.sourceFilter = 'all';
    if (chipId === 'search') ui.searchTerm = '';
  }

  function clearFilters() {
    ui.searchTerm = '';
    ui.statusFilter = 'all';
    ui.sourceFilter = 'all';
    ui.pageIndex = 0;
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.Essence.Title', 'Essences')}>
  <!-- `tabindex="-1"` makes this landmark a FOCUS TARGET without making it a tab stop
       (issue 1157). Emptying the bulk selection unmounts the panel and the Clear that was
       pressed, and the manager root puts the keyboard here: an inert element, so Space still
       scrolls, with an accessible name that says where the GM now is and the whole selection
       register one Tab away. The root addresses it through `data-essence-toolbar`. -->
  <section
    class="manager-toolbar manager-essence-toolbar"
    tabindex="-1"
    data-keyboard-focus="true"
    data-essence-toolbar
    aria-label={text('FABRICATE.Admin.Manager.Essence.Filters', 'Essence filters')}
  >
    <div class="manager-essence-filter-row">
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          value={searchTerm}
          oninput={(event) => {
            ui.searchTerm = event.currentTarget.value;
            ui.pageIndex = 0;
          }}
          placeholder={text(
            'FABRICATE.Admin.Manager.Essence.SearchPlaceholder',
            'Search essences...'
          )}
          aria-label={text('FABRICATE.Admin.Manager.Essence.SearchLabel', 'Search essences')}
        />
      </label>
      <!-- NO STATUS SEGMENT AND NO SOURCE SELECT (issue 1372, maintainer parity round 8).

           The reference's bar carries ONE filter — the membership pair below — beside the search
           field (`tmp/proto/essence-rules.png`, markup `proto:1537`-`1550`). This bar carried
           four controls: `All / Enabled / Disabled`, the membership pair, the presentation toggle
           and an `All sources` select. Two of them are gone.

           NEITHER LOSES A STATE A GM CANNOT REACH. Every row states its own enabled state as a
           pill and its own source breakage in the summary line and the Effects chip, both of
           which the search box reads — `sortKey: 'status'` still groups the list by enabled-ness,
           and a broken source is findable by the name the summary line prints. What the two
           controls added was a second way to narrow a list that is six rows long in a real world
           and is already narrowed by search, membership and sort.

           The PRESENTATION toggle stays, on row two: it is not a filter, it is the only route to
           the grid, and `### GM World Essence Screens` requirement 7 and the essence-library
           capability list both name that grid. -->
      <!-- THE MEMBERSHIP AXIS (issue 1372), AS A TWO-SEGMENT CONTROL ON THE TOP ROW.

           The prototype draws it as one control with BOTH counts on screen at once —
           `[In this system (3)] [All world essences (6)]` (`sysEss.png`) — beside the search box.
           It shipped as a `<select>` on the second row, which shows one count and hides the other
           behind a click: a GM cannot see that the world holds six essences and this system has
           three without opening a menu, and that comparison is the entire subject of the control.

           `SegmentedControl` is the shipped primitive for a two-to-four option axis and the same
           one the status filter beside it uses, so this is a conversion rather than a new control.

           It renders only when the world corpus can answer it: over an unreadable corpus every
           essence reports as absent from this system, which is a false statement rather than an
           empty one. -->
      {#if membershipAvailable}
        <SegmentedControl
          options={membershipOptions}
          value={membershipFilter}
          groupName="manager-essence-membership-filter"
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Essence.MembershipFilterLabel',
            'Filter essences by membership of this system'
          )}
          dataAttr="data-essence-membership-filter"
          optionDataAttr="data-essence-membership-option"
          onChange={(value) => {
            membershipFilter = value;
            ui.pageIndex = 0;
          }}
        />
      {/if}
    </div>

    <!-- ROW TWO carries how the list is ARRANGED — sort key, direction and the presentation
         toggle — plus the retained source filter and the count.

         ROW ONE IS THE FILTERS AND ROW TWO IS EVERYTHING ELSE, and the split is a WIDTH result
         rather than a taxonomy. The prototype's bar is three bands: `[search] [In this system]
         [All world essences]`, then `SORT BY [Name] [Asc] … 3 shown · 3 of 6 in this system`,
         then `[☐ Select all]` (`sysEss.png`). This screen carries two axes the prototype has
         no counterpart for — a status filter and a source filter — and a list/grid toggle it
         also lacks, and the four of them plus search will not fit on one 745px line.

         So the presentation toggle moved DOWN from row one when the membership control arrived,
         which is what keeps the bar at THREE bands with row one leading exactly as the prototype
         does. Putting the source filter here too is the same trade the shipped bar already made.
         The count keeps its `margin-left: auto`, so it sits at the far end of this row as the
         prototype draws it. -->
    <div class="manager-essence-filter-row is-secondary">
      <div class="manager-essence-filter-field">
        <span class="manager-essence-filter-label"
          >{text('FABRICATE.Admin.Manager.Essence.SortBy', 'Sort by')}</span
        >
        <select
          value={ui.sortKey}
          data-essence-sort
          onchange={(event) => (ui.sortKey = event.currentTarget.value)}
          aria-label={text('FABRICATE.Admin.Manager.Essence.SortLabel', 'Sort essences')}
        >
          {#each ESSENCE_SORT_KEYS as key (key)}
            <option value={key}>{sortLabel(key)}</option>
          {/each}
        </select>
        <ManagerButton
          data-essence-sort-direction={ui.sortDirection}
          aria-label={text(
            'FABRICATE.Admin.Manager.Essence.ToggleSortDirection',
            'Toggle sort direction'
          )}
          onclick={() => (ui.sortDirection = ui.sortDirection === 'asc' ? 'desc' : 'asc')}
        >
          <i
            class={ui.sortDirection === 'asc'
              ? 'fas fa-arrow-down-short-wide'
              : 'fas fa-arrow-down-wide-short'}
            aria-hidden="true"
          ></i>
          <span
            >{ui.sortDirection === 'asc'
              ? text('FABRICATE.Admin.Manager.Essence.SortAscending', 'Asc')
              : text('FABRICATE.Admin.Manager.Essence.SortDescending', 'Desc')}</span
          >
        </ManagerButton>
      </div>

      <!-- ICON-ONLY (issue 1036). The prototype draws this axis as two glyph tiles, and it
           is the one control on the bar whose options need no words: a list glyph and a
           grid glyph ARE the two layouts, unlike the status filter beside it, where
           "All / Enabled / Disabled" is the vocabulary. The labelled track measured ~135px
           against the prototype's ~86px and crowded the row hard enough that an earlier
           pass moved the source filter off it to compensate. The compact track lands at
           ~72px: it is sized to sit with the 34px `.manager-icon-button`s in a toolbar row
           rather than to match the prototype's pixel count, which is the constraint that
           actually keeps the row level. The label survives in the a11y tree — see the
           `is-icon-only` block in `SegmentedControl.svelte`. -->
      <SegmentedControl
        options={viewModeOptions}
        value={ui.viewMode}
        iconOnly
        groupName="manager-essence-view-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Essence.ViewModeLabel', 'Essence presentation')}
        dataAttr="data-essence-view-mode"
        optionDataAttr="data-essence-view-option"
        onChange={(value) => (ui.viewMode = value)}
      />

      {#each chips as chip (chip.id)}
        <Chip tone="info" class="manager-essence-filter-chip" data-essence-filter-chip={chip.id}>
          <span>{chipLabel(chip)}</span>
          <button
            type="button"
            class="manager-essence-chip-clear"
            aria-label={format(
              'FABRICATE.Admin.Manager.Essence.ClearChip',
              'Clear {filter} filter',
              {
                filter: chip.id,
              }
            )}
            onclick={() => clearChip(chip.id)}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </Chip>
      {/each}
      <!-- THE BAR'S COUNT ANSWERS MEMBERSHIP, NOT PAGINATION (`proto:1550`, data at
           `proto:4971`). The prototype writes `N shown · M of K in this system`: how many the
           filters left, how many of the world's essences this system has rules for, and how
           many there are. That is the one number this screen cannot get anywhere else — the
           range it replaces was already rendered, verbatim, by `Pagination` at the foot of the
           same list (`Showing 1–6 of 6`), so the bar was spending its far end restating the
           pager.

           It falls back to that range when the world corpus cannot answer membership. `M of K`
           over an unreadable corpus would report every essence as absent from this system,
           which is a false statement rather than an unavailable one — the same rule the
           membership filter beside it already follows. -->
      <span class="manager-essence-count" data-essence-count>
        {#if membershipAvailable}
          {format(
            'FABRICATE.Admin.Manager.Essence.CountInSystem',
            '{shown} shown · {members} of {total} in this system',
            {
              shown: model.totalCount,
              members: membershipCounts.in,
              total: membershipCounts.all,
            }
          )}
        {:else}
          {format('FABRICATE.Admin.Manager.Essence.CountRange', '{start}–{end} of {total}', {
            start: model.rangeStart,
            end: model.rangeEnd,
            total: model.totalCount,
          })}
        {/if}
      </span>
    </div>

    <!-- Every prop is an OVERRIDE: the shared primitive's hooks default to the Component
         Studio's strings, so this studio must name its own or three browsers would answer
         to one set of hooks. -->
    <BulkSelectionToolbar
      rowClass="manager-essence-filter-row"
      toolbarAttr="data-essence-selection-toolbar"
      pageBoxAttr="data-essence-select-all-page"
      countAttr="data-essence-selection-count"
      resultsAttr="data-essence-select-all-results"
      clearAttr="data-essence-clear-selection"
      pageSelectionState={selectionSummary.pageSelectionState}
      count={selectionSummary.count}
      showSelectAllResults={selectionSummary.showSelectAllResults}
      selectAllResultsCount={selectionSummary.selectAllResultsCount}
      onTogglePage={(on) => setPageSelected(on)}
      onSelectAllResults={selectAllResults}
      onClear={clearBulkSelection}
    />
  </section>

  <!-- The paginated rows/columns are the shared `LibraryShelf`: the scroll section, the two
       empty states, the list-or-grid `<ul>` and the pager, which all four studios re-derived.
       This studio still supplies its own ENTRY, its own hook class and view attribute, and
       its own grid template — the parts that are genuinely per-studio. -->
  <LibraryShelf
    items={model.essences}
    viewMode={ui.viewMode}
    listClass="manager-essences-table"
    listAttrs={{ 'data-essence-view': ui.viewMode }}
    scrollLabel={text('FABRICATE.Admin.Manager.Essence.TableShort', 'Essences')}
    isEmpty={listCards.length === 0}
    totalCount={model.totalCount}
    pageSize={ui.pageSize}
    pageIndex={model.pageIndex}
    pageSizeOptions={[10, 25, 50]}
    onPageChange={(next) => (ui.pageIndex = next)}
    onPageSizeChange={(next) => {
      ui.pageSize = next;
      ui.pageIndex = 0;
    }}
  >
    {#snippet empty()}
      <EmptyState
        icon="fas fa-mortar-pestle"
        title={text('FABRICATE.Admin.Manager.Essence.EmptyTitle', 'No essences yet')}
        hint={text(
          'FABRICATE.Admin.Manager.Essence.EmptyHint',
          'Create an essence definition to start assigning essence quantities to components.'
        )}
      />
    {/snippet}
    {#snippet emptyFiltered()}
      <EmptyState
        filtered
        hint={text(
          'FABRICATE.Admin.Manager.Essence.EmptySearchTitle',
          'No essences match these filters.'
        )}
      >
        <ManagerButton
          data-clear-filters="essences"
          disabled={!filtersActive}
          onclick={clearFilters}
          >{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</ManagerButton
        >
      </EmptyState>
    {/snippet}
    {#snippet entry(essence)}
      <EssenceRow
        {essence}
        variant={ui.viewMode}
        selected={selectedEssenceId === essence.id}
        bulkSelected={bulkSelectedIds.has(essence.id)}
        effectTransferEnabled={showSourceUi}
        propertyMacrosEnabled={showPropertyMacroUi}
        membershipState={membershipAvailable ? membershipStateOf(essence) : ''}
        summaryClauses={summaryClauses(essence)}
        {text}
        {format}
        onSelect={(id) => onSelectEssence(id)}
        onEdit={(id) => onEditEssence(id)}
        onToggleEnabled={(id, enabled) => onToggleEssenceEnabled(id, enabled)}
        onToggleBulkSelected={(id) => toggleBulkSelected(id)}
        onAddToSystem={(id) => actions?.addToSystem?.(id, activeSystemId)}
      />
    {/snippet}
  </LibraryShelf>
</main>

<style>
  /* The two list presentations, and the count. The TOOLBAR's own rhythm is no longer here:
     `.manager-essence-toolbar`, `.manager-essence-filter-row` (and its `.is-secondary` /
     `.is-selection` variants), `.manager-essence-filter-field`, `.manager-essence-filter-label`
     and the toolbar's `select` treatment all JOIN the recipe and component filter-bar rules
     in `styles/fabricate.css`, which is the one bar all three studios render.

     That is a correctness fix, not tidying. `BulkSelectionToolbar` renders
     `<div class="{rowClass} is-selection">` in ITS OWN template, so a rule scoped to THIS
     component never reached it: the selection row shipped with no row metrics at all, which
     is why it floated centred with its `Clear` action stranded mid-row. A row class a shared
     primitive wears has to be authored where that primitive can see it. */

  .manager-essence-count {
    margin-left: auto;
    color: var(--fab-text-muted);
    font-size: 0.7rem;
    white-space: nowrap;
  }

  .manager-essence-chip-clear {
    display: inline-flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  /* `:global` because the `<ul>` these style is rendered by `LibraryShelf` now, so a scoped
     selector would be hashed to THIS component, match nothing, and be reported as unused —
     which `lint:svelte:warnings` fails on. They stay HERE rather than moving into the shelf
     because the grid template is a per-studio content judgement: essences read well at a
     210px minimum, and a recipe card carrying a subtitle and a longer fact row will not.
     `.manager-essences-table` is unique to this studio, so the global escape leaks nothing. */
  :global(.manager-essences-table) {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The GRID presentation. `auto-fill` rather than a fixed count so the card width stays
     inside the readable range at every manager width, which is what stops the narrow
     breakpoint needing a second template.

     Cards STRETCH to the tallest in their row (issue 1036 fidelity pass). `align-items: start`
     sized every card to its own copy, so a row of four ran four different heights — a ragged
     shelf where the prototype shows a level one. The card's own control cluster takes
     `margin-top: auto` in `EssenceRow.svelte`, so the extra height lands between the
     description and the footer and the footers line up across the row. */
  :global(.manager-essences-table.is-grid) {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    align-items: stretch;
  }

  /* THE SEARCH FIELD SHRINKS BEFORE THE ROW WRAPS.

     The shipped `.manager-search` basis sizes it for a bar carrying one or two controls beside
     it. Row one now carries TWO segmented tracks — status and membership, about 215px and 250px
     — and at 1280px the field claimed 355px of a 745px bar, which pushed the membership control
     onto a fourth toolbar band. The prototype's bar is three bands with search and the membership
     segments on one line (`sysEss.png`).

     `flex: 1 1 220px` still lets it take every pixel the two tracks do not want, and gives it a
     floor a query is legible in. */
  .manager-essence-filter-row :global(.manager-search) {
    flex: 1 1 220px;
    min-width: 0;
  }

  /* Search wraps onto its own line before the segmented controls start colliding. The row
     is already `flex-wrap`, so this only has to release the search field's basis. */
  @container fabricate-manager (max-width: 1000px) {
    .manager-essence-filter-row :global(.manager-search) {
      flex: 1 1 100%;
    }
  }
</style>
