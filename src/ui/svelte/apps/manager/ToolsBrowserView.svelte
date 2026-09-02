<!-- Svelte 5 runes mode -->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import { projectToolRow, toolSearchText } from './tools/toolStudio.js';
  import {
    breakModeSourcePill,
    INHERIT_BREAK_MODE,
    systemBreakModeOptions,
  } from './scoped/worldToolStudio.js';
  import {
    DEFAULT_BROWSER_PAGE_SIZE,
    createToolsBrowserState,
  } from '../../../../utils/managerBrowserViewState.js';

  let {
    tools = [],
    selectedToolId = '',
    // THE WORLD TOOL SELECTED THAT THIS SYSTEM HAS NO RULES RECORD FOR. It is a second id
    // rather than a widening of `selectedToolId`, because that one is derived from the OPEN
    // TOOL DRAFT and an unadopted Tool has no draft to be derived from. Held by the root,
    // because the inspector it fills is rendered by the shell's aside rather than by this
    // view; see `selectLibraryTool` there.
    selectedUnadoptedToolId = '',
    managedItemOptions = [],
    breakageAuthority = 'toolSpecific',
    // THE WORLD SCOPE'S OWN PROJECTION and the AUTHORING LAYER of the resolved token above
    // (issue 1373). Both are already passed by the call site, which is what makes the
    // tri-state buildable without reopening a gateway file: `CraftingSystemManagerRoot`
    // spreads the tool bundle FIRST and restates `breakageAuthority` / `breakageSource`
    // after, so declaring exactly what the site passes keeps the lookup off the spread.
    //
    // Declaring a name the site does NOT pass would make every reader of it a live
    // subscriber to the whole bundle, which the root's own note records; both of these are
    // passed, so neither does.
    scope = null,
    // THE WORLD TOOL WRITE FAMILY, for the one write this screen makes that its own system
    // cannot: adopting a world Tool that has no rules record here. Passed by the call site in
    // the same tool bundle as `scope`.
    actions = null,
    // THE CRAFTING SYSTEM THIS SCREEN IS SCOPED TO, and it is read rather than inferred.
    // `scope.entries[].systems[]` is the world projection's own JOIN, and picking this
    // system's row out of it is the only way a row can state whether it INHERITS the world
    // defaults or overrides one — the system's own tool record carries the resolved values
    // and cannot tell the two apart. The call site already passes it in the tool bundle.
    systemId = '',
    breakageSource = 'default',
    onSelectTool = () => {},
    onEditTool = () => {},
    // NO `onCreateToolDrop`, AND NO DROP ZONE. Creation moved to the WORLD Tools Catalogue,
    // which is where the design puts it and where it belongs: a Tool is one world record every
    // system adopts, and this screen can only ever author RULES for a record the world already
    // holds. `WorldToolCataloguePage` carries the zone now, and the root resolves the dropped
    // Item through `services.resolveToolSource` before creating the world entity - the seam
    // that did not exist when the zone was parked here.
    onToggleToolEnabled = () => {},
    onSetBreakageAuthority = () => {},
    // THE ROUTE OUT OF THE ZERO STATE that leaves this system. Passed rather than reached
    // through `actions`, which is the world Tool WRITE family: opening a route is the shell's
    // job and the write family has no navigation on it (issue 1373).
    onOpenWorldCatalogue = () => {},
    // ── THE VIEW-STATE IS LIFTED (issue 1438) ────────────────────────────────────────────
    // Search and page live on an object the manager root owns and binds here: opening a tool
    // switches `currentView` to `tool-edit`, which unmounts this component, so held locally
    // both were reset by the trip out and back. Unbound, the local fallback keeps the controls
    // reactive in-component for the isolated mounted tests.
    browserState = $bindable(null),
  } = $props();

  /**
   * The FOUR INHERITED world-default sections, named once. `repairRequirements` is deliberately
   * absent: `worldToolStudio` records that it is SEEDED on adoption and then diverges, so it
   * has no inherit state a row could report.
   *
   * `prerequisites` and `bonus` joined at `1.31.0` (issue 1373). A row that overrides one of
   * them now SAYS so, where before it read `Inherits world defaults` over a character gate its
   * own system authored — which was true of every migrated world, because the model held both
   * fields per system only and there was no world layer for them to inherit from.
   */
  const TOOL_WORLD_SECTIONS = [
    { id: 'breakage', key: 'FABRICATE.Admin.Manager.Tools.Breakage', label: 'Breakage' },
    { id: 'onBreak', key: 'FABRICATE.Admin.Manager.Tools.OnBreak', label: 'On break' },
    {
      id: 'prerequisites',
      key: 'FABRICATE.Admin.Manager.Scoped.Sections.Prerequisites',
      label: 'Prerequisites',
    },
    { id: 'bonus', key: 'FABRICATE.Admin.Manager.Scoped.Sections.Bonus', label: 'Check bonus' },
  ];

  // ── THE VIEW-STATE IS LIFTED (issue 1438), ON ALL SIX AXES ───────────────────────────
  // Search and page live on an object the manager root owns and binds here: opening a tool
  // switches `currentView` to `tool-edit`, which unmounts this component, so held locally
  // both were reset by the trip out and back. Unbound, the local fallback keeps the controls
  // reactive in-component for the isolated mounted tests.
  //
  // MEMBERSHIP, SORT KEY AND SORT DIRECTION ARE LIFTED WITH THEM (issue 1373). They arrived
  // on this screen after the lift was written, and they are the same KIND of state by that
  // change's own test: view filters over rows the store has already published, not cohort
  // selectors the store must hold. Leaving them component-local would half-lift the toolbar —
  // a GM who filters to `Overriding`, opens a tool and comes back would find the search term
  // preserved beside a membership segment silently snapped back to `In this system`, which is
  // the exact defect issue 1438 exists to remove, made harder to see by being partial.
  let ownBrowserState = $state(createToolsBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const searchTerm = $derived(String(ui.searchTerm || ''));
  const membershipFilter = $derived(ui.membershipFilter || 'in');
  const sortKey = $derived(ui.sortKey || 'name');
  const sortDirection = $derived(ui.sortDirection || 'asc');
  const pageIndex = $derived(ui.pageIndex || 0);
  const pageSize = $derived(ui.pageSize || DEFAULT_BROWSER_PAGE_SIZE);
  // NOT lifted: this is the "nothing is selected, pick the first row" guard, and it names one
  // mount's worth of auto-selection rather than anything the GM chose.
  let autoSelectedToolId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // PROJECTED TO A SCALAR IMMEDIATELY, and that is a cost decision rather than a style one.
  // `scope` is a NEW OBJECT on every world-corpus publish, so reading it inside a reactive
  // scope would re-render this whole view on every world-scope edit. One derivation bounds
  // that to a string comparison; world-corpus publishes are GM-edit-driven, not per-frame.
  //
  // `worldScopeProjection` attaches `toolBreakage` ONLY when the corpus holds one, so `''`
  // means the world authored nothing - which is a different label and a different pill from
  // an authored `toolSpecific`, and is why this is read rather than inferred from the
  // resolved token.
  const worldAuthority = $derived(scope?.toolBreakage?.authority ?? '');

  const authoritySegments = $derived(
    systemBreakModeOptions({
      worldAuthority,
      systemAuthority: breakageAuthority,
      source: breakageSource,
      text,
    })
  );

  const authorityPill = $derived(breakModeSourcePill(breakageSource, text));

  // THE WORLD PROJECTION'S PER-SYSTEM JOIN, indexed by world entity id. Read as a Map rather
  // than scanned per row: `scope` republishes a NEW object on every world-scope edit and a
  // `find` per row would walk the whole corpus once per Tool on every one of them.
  const worldRowsByToolId = $derived(
    new Map(
      (Array.isArray(scope?.entries) ? scope.entries : []).map((entry) => [
        String(entry?.id ?? ''),
        (Array.isArray(entry?.systems) ? entry.systems : []).find(
          (row) => row?.systemId === systemId
        ) ?? null,
      ])
    )
  );

  /**
   * How many of THIS system's recipes require one Tool.
   *
   * READ OFF THE PROJECTION'S PER-SYSTEM ROW, never counted here. `adminStore` walks every
   * recipe in every system once per publish - across a recipe's top-level `toolIds`, each
   * ingredient set's, and both again per step - and keys the answer by `(tool, system)`. This
   * screen has no recipe corpus at all, so counting here would mean threading one in and
   * recounting it per row on every re-render.
   *
   * `0` for a world Tool this system has no rules for is a real answer rather than a fallback:
   * a recipe here cannot reference a Tool the system is not a member of.
   *
   * @param {string} toolId
   * @returns {number}
   */
  function recipeCount(toolId) {
    return Number(worldRowsByToolId.get(String(toolId || ''))?.recipeCount) || 0;
  }

  /**
   * What one row says about its relationship to the world defaults, or `null` when the world
   * corpus has no record of this Tool and there is therefore nothing to inherit FROM.
   *
   * `null` is a real answer rather than a fallback: a Tool that exists only in this system
   * inherits nothing, and writing "Inherits world defaults" over it would claim a parent that
   * does not exist. The screen states nothing there instead.
   *
   * @param {string} toolId
   * @returns {{state: string, label: string}|null}
   */
  function inheritState(toolId) {
    const row = worldRowsByToolId.get(String(toolId || ''));
    if (!row || row.member !== true) return null;
    const overridden = TOOL_WORLD_SECTIONS.filter(
      (section) => row.inherited?.[section.id] === false
    );
    if (overridden.length === 0) {
      return {
        state: 'inherited',
        label: text('FABRICATE.Admin.Manager.Tools.RowInheritsWorld', 'Inherits world defaults'),
      };
    }
    return {
      state: 'overridden',
      label: text('FABRICATE.Admin.Manager.Tools.RowOverrides', 'Overrides {sections}').replace(
        '{sections}',
        overridden.map((section) => text(section.key, section.label).toLocaleLowerCase()).join(', ')
      ),
    };
  }

  // ── THE THREE MEMBERSHIP FILTERS ────────────────────────────────────────────────────────
  // `all` is the one that changes what a row IS. Search and sort narrow a list of THIS
  // system's tools; `All world tools` widens it past them, to world records this system has
  // no rules for at all — which is the only route on this screen to a Tool a GM has not
  // adopted yet, and therefore the only thing the inspector's `Add … to …` button can act on.
  const systemToolIds = $derived(new Set(tools.map((tool) => String(tool?.id ?? ''))));
  const worldEntries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);

  /**
   * The world records this system has NO tool for, projected to the same row shape a member
   * renders through. They are `member: false` and carry no breakage, enabled or validation
   * answer, because this system has authored none: everything a row states about behaviour is
   * a MEMBERSHIP fact, and inventing one from the world default would claim rules that do not
   * exist here.
   */
  const ghostRows = $derived(
    worldEntries
      .filter((entry) => !systemToolIds.has(String(entry?.id ?? '')))
      .map((entry) => ({
        id: String(entry?.id ?? ''),
        member: false,
        tool: null,
        name: entry?.entity?.name || String(entry?.id ?? ''),
        img: entry?.entity?.img || '',
        description: entry?.entity?.description || '',
        search: `${entry?.entity?.name ?? ''} ${entry?.entity?.description ?? ''}`.toLowerCase(),
      }))
  );

  const memberRows = $derived(
    tools.map((tool) => {
      const projected = projectToolRow(tool, managedItemOptions, breakageAuthority);
      return {
        id: projected.id,
        member: true,
        tool,
        name: projected.name,
        img: projected.img,
        description: projected.description,
        search: toolSearchText(tool, managedItemOptions),
        projected,
      };
    })
  );

  const membershipFilters = $derived([
    {
      id: 'in',
      label: text(
        'FABRICATE.Admin.Manager.Tools.FilterInSystem',
        'In this system ({count})'
      ).replace('{count}', String(memberRows.length)),
    },
    {
      id: 'all',
      label: text(
        'FABRICATE.Admin.Manager.Tools.FilterAllWorld',
        'All world tools ({count})'
      ).replace('{count}', String(memberRows.length + ghostRows.length)),
    },
    {
      id: 'over',
      label: text('FABRICATE.Admin.Manager.Tools.FilterOverriding', 'Overriding'),
    },
  ]);

  const filteredRows = $derived(
    (membershipFilter === 'all' ? [...memberRows, ...ghostRows] : memberRows)
      .filter((row) => membershipFilter !== 'over' || inheritState(row.id)?.state === 'overridden')
      .filter((row) => {
        const needle = searchTerm.trim().toLowerCase();
        return !needle || row.search.includes(needle);
      })
      .sort((left, right) => {
        const order =
          sortKey === 'state'
            ? Number(right.member) - Number(left.member) || left.name.localeCompare(right.name)
            : left.name.localeCompare(right.name);
        return sortDirection === 'desc' ? -order : order;
      })
  );

  // KEPT AS THE PAGER'S INPUT under its shipped name, because the Foundry smoke's
  // `assertToolLibraryPagination` phase pins this list's footer geometry — and, since issue
  // 1373, its PRESENCE: the pager below is `multiPageOnly`, so that phase now asserts the bar is
  // absent at eight rows on an eight-row page and present at nine.
  const filteredTools = $derived(filteredRows);
  const pagedTools = $derived(
    filteredTools.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  // `{shown}` IS THE PAGE, NOT THE FILTER (issue 1373). It was fed `filteredRows.length`, so a
  // two-page result read `11 shown` over eight rows while the pager immediately below read
  // `Showing 1-8 of 11`. Two counts in one pane contradicting each other is worse than either
  // alone; the filter total is not lost, because `{world}` and the membership filter's own
  // `All world tools (11)` both still state it.
  const resultCountText = $derived(
    text(
      'FABRICATE.Admin.Manager.Tools.ResultCountScoped',
      '{shown} shown · {member} of {world} in this system'
    )
      .replace('{shown}', String(pagedTools.length))
      .replace('{member}', String(memberRows.length))
      .replace('{world}', String(memberRows.length + ghostRows.length))
  );

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredTools.length) ui.pageIndex = 0;
  });

  /**
   * Whether one row is the inspected one, across BOTH selection kinds.
   *
   * @param {string} toolId
   * @returns {boolean}
   */
  function rowSelected(toolId) {
    return selectedUnadoptedToolId ? selectedUnadoptedToolId === toolId : selectedToolId === toolId;
  }

  $effect(() => {
    // A DELIBERATE UNADOPTED SELECTION SUPPRESSES THE AUTO-SELECT. Without this the effect
    // sees an id that is not in `tools`, decides nothing is selected, and re-selects the first
    // adopted Tool - which would snap the panel away from the row the GM just clicked, on the
    // one row whose whole purpose is the `Add {tool} to {system}` action.
    if (selectedUnadoptedToolId) {
      autoSelectedToolId = '';
      return;
    }
    if (tools.some((tool) => tool.id === selectedToolId)) {
      autoSelectedToolId = '';
      return;
    }
    // THE FIRST ROW THE GM IS LOOKING AT, read off `pagedTools` rather than off the raw
    // `tools` prop. The list renders `pagedTools`, which is the membership filter, the search
    // term, the sort key and direction and the page slice applied in that order; `tools` is
    // the unsorted, unfiltered authored array. Since this screen gained the design's
    // `SORT BY [Name] [Asc]` control (issue 1373) those two disagree for every library whose
    // authored order is not name-ascending, and the effect selected a row the GM could not
    // see - the Foundry smoke reads the top row as `Alchemist's Supplies` while this selected
    // the sixth, `Smith's Hammer`.
    //
    // `.member` SKIPS THE GHOST ROWS, and that is not an optimisation. Under the `all`
    // membership filter `filteredRows` also carries unadopted world Tools, which are inspected
    // through `selectedUnadoptedToolId` and not through `onSelectTool`; auto-selecting one here
    // would push an unadopted id down the adopted path AND then latch, because the first early
    // return above suppresses every later auto-select while an unadopted row is selected.
    // A page holding no member row at all selects nothing: there is no adopted Tool to inspect
    // and the GM chooses.
    const firstToolId = pagedTools.find((row) => row.member)?.id || '';
    if (!firstToolId || autoSelectedToolId === firstToolId) return;
    autoSelectedToolId = firstToolId;
    onSelectTool(firstToolId);
  });

  /**
   * Select a row, ADOPTED OR NOT.
   *
   * It used to refuse a world Tool with no rules record here, because the inspector was fed
   * `selectedLibraryTool` alone - a lookup over THIS system's tools - so selecting one emptied
   * the panel rather than describing the row. The panel now takes the world entry too and
   * answers that state with the design's `No rules here` pill and its `Add {tool} to {system}`
   * action, so refusing the click would withhold the one affordance the row exists for.
   *
   * @param {{id: string}} entry
   * @returns {void}
   */
  function chooseTool(entry) {
    onSelectTool(entry.id);
  }

  function breakageLabel(tool, kind) {
    if (kind === 'immune') return text('FABRICATE.Admin.Manager.Tools.SummaryImmune', 'Immune');
    if (kind === 'breakable')
      return text('FABRICATE.Admin.Manager.Tools.SummaryCheckDriven', 'Roll to break');
    if (kind === 'breakageChance') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryChanceValue', '{count}% break').replace(
        '{count}',
        String(tool?.breakage?.breakageChance ?? 0)
      );
    }
    if (kind === 'diceExpression') {
      return text('FABRICATE.Admin.Manager.Tools.SummaryDiceValue', '{formula} roll').replace(
        '{formula}',
        String(tool?.breakage?.formula || '—')
      );
    }
    const maxUses = Number(tool?.breakage?.maxUses);
    if (Number.isInteger(maxUses) && maxUses > 0) {
      return text(
        maxUses === 1
          ? 'FABRICATE.Admin.Manager.Tools.SummaryUseCountOne'
          : 'FABRICATE.Admin.Manager.Tools.SummaryUseCount',
        maxUses === 1 ? '{count} use' : '{count} uses'
      ).replace('{count}', String(maxUses));
    }
    return text('FABRICATE.Admin.Manager.Tools.SummaryUnlimitedUses', 'Unlimited uses');
  }
</script>

<main
  class="manager-main manager-tools-main"
  aria-label={text('FABRICATE.Admin.Manager.Tools.Title', 'Tools')}
  data-tool-library
>
  <div class="manager-tools-main-content">
    <InspectorCard class="manager-tools-authority-card" data-manager-tools-authority="">
      <div class="manager-tools-authority-heading">
        <span><i class="fas fa-sliders" aria-hidden="true"></i></span>
        <!--
          THE PILL SITS INSIDE THE TITLE CELL, not beside the `ALL TOOLS` chip, and that is a
          layout constraint rather than a preference. `styles/fabricate.css` gives this heading
          `grid-template-columns: 20px minmax(0, 1fr) max-content` and is closed to this lane,
          so a FOURTH child would flow into an implicit second row under the glyph. Nesting it
          in the `1fr` cell keeps the heading at three children and lets the pill wrap under a
          long title instead of forcing a row.
        -->
        <div class="manager-tools-authority-title">
          <strong>{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'Breakage mode')}</strong>
          <Chip tone={authorityPill.tone} data-tool-authority-pill={authorityPill.state}
            >{authorityPill.label}</Chip
          >
        </div>
      </div>
      <!--
        THREE SEGMENTS, SELECTED ON THE AUTHORED LAYER (issue 1373). `selected` comes from
        `breakageSource`, never from `breakageAuthority === value`: the resolved token cannot
        tell "this system chose it" from "this system inherited it", so a two-state control
        drew the inherited value as current and MINTED a per-system override the moment a GM
        clicked the segment already highlighted - an override nothing could then clear.
      -->
      <div
        class="manager-tools-authority-segments"
        role="radiogroup"
        aria-label={text('FABRICATE.Admin.Manager.Tools.AuthorityTitle', 'Tool breakage source')}
      >
        {#each authoritySegments as segment (segment.value)}
          <label class:is-selected={segment.selected} data-tool-authority-segment={segment.value}>
            <input
              type="radio"
              name="tool-breakage-authority"
              value={segment.value}
              checked={segment.selected}
              onchange={() =>
                onSetBreakageAuthority(segment.value === INHERIT_BREAK_MODE ? null : segment.value)}
            />
            <!-- NO GLYPH, and that is the prototype's own composition: the WORLD card leads
                 each segment with an icon, the system card does not. `systemBreakModeOptions`
                 emits no `icon` for the same reason. -->
            <span class="manager-tools-authority-option">{segment.label}</span>
          </label>
        {/each}
      </div>
    </InspectorCard>

    <section class="manager-tools-library-card" data-manager-tools-search>
      <ManagerSearchField
        value={searchTerm}
        onInput={(next) => {
          ui.searchTerm = next;
          ui.pageIndex = 0;
        }}
        placeholder={text('FABRICATE.Admin.Manager.Tools.Search', 'Search tools')}
        ariaLabel={text('FABRICATE.Admin.Manager.Tools.Search', 'Search tools')}
      />
      <div
        class="manager-tools-membership-filter"
        role="radiogroup"
        aria-label={text(
          'FABRICATE.Admin.Manager.Tools.FilterLabel',
          'Which Tools this list shows'
        )}
        data-tool-membership-filter={membershipFilter}
      >
        {#each membershipFilters as option (option.id)}
          <label
            class:is-selected={membershipFilter === option.id}
            data-tool-membership-option={option.id}
          >
            <input
              type="radio"
              name="tool-membership-filter"
              value={option.id}
              checked={membershipFilter === option.id}
              onchange={() => {
                ui.membershipFilter = option.id;
                ui.pageIndex = 0;
              }}
            />
            <span>{option.label}</span>
          </label>
        {/each}
      </div>
    </section>

    <!--
      SORT AND THE RESULT COUNT ON ONE ROW, which is where the prototype puts them and is also
      the only place the count can say something useful: `3 tools` states the length of a list
      the GM is looking at, while `3 shown · 3 of 10 in this system` states the two numbers the
      membership filter above is switching between.
    -->
    <div class="manager-tools-sort-row" data-manager-tools-sort>
      <span class="manager-tools-sort-label"
        >{text('FABRICATE.Admin.Manager.Tools.SortBy', 'Sort by')}</span
      >
      <select
        class="manager-tools-sort-select"
        value={sortKey}
        aria-label={text('FABRICATE.Admin.Manager.Tools.SortBy', 'Sort by')}
        onchange={(event) => {
          ui.sortKey = event.currentTarget.value;
          ui.pageIndex = 0;
        }}
      >
        <option value="name">{text('FABRICATE.Admin.Manager.Tools.SortName', 'Name')}</option>
        <option value="state"
          >{text('FABRICATE.Admin.Manager.Tools.FilterInSystemShort', 'In this system')}</option
        >
      </select>
      <button
        type="button"
        class="manager-tools-sort-direction"
        data-tool-sort-direction={sortDirection}
        onclick={() => (ui.sortDirection = sortDirection === 'asc' ? 'desc' : 'asc')}
      >
        <i
          class={sortDirection === 'asc' ? 'fas fa-arrow-down-a-z' : 'fas fa-arrow-up-a-z'}
          aria-hidden="true"
        ></i>
        <span
          >{sortDirection === 'asc'
            ? text('FABRICATE.Admin.Manager.Tools.SortAsc', 'Asc')
            : text('FABRICATE.Admin.Manager.Tools.SortDesc', 'Desc')}</span
        >
      </button>
      <span class="manager-tools-result-summary" data-tool-result-count>{resultCountText}</span>
    </div>

    <section class="manager-tools-library-card" data-manager-tools-browser>
      <div class="manager-tools-library-scroll" data-tool-library-scroll>
        {#if tools.length === 0}
          <!--
            THE EMPTY STATE NAMES A DESTINATION, SO IT OFFERS ONE (issue 1373).

            It read `Add a Tool from the world Tools Catalogue, where Tools are created.` and
            gave the GM no control at all - while the toolbar directly above it said
            `All world tools (11)`, i.e. eleven Tools were adoptable one chip-click away without
            leaving the screen. `EmptyState` has taken `children` for exactly this since it was
            extracted; this call site simply passed none.

            TWO ROUTES, because the state has two honest answers and they are different sizes.
            The nearer one switches the membership filter in place and is the primary: nothing
            is created, nothing is navigated, and the eleven adoptable rows appear with their
            own `Add to system` buttons. It renders only when there is something to show. The
            farther one leaves for the world catalogue, which is where a Tool that does not
            exist yet has to be made, and is the only route when the world holds none either.
          -->
          <EmptyState
            icon="fas fa-screwdriver-wrench"
            title={text('FABRICATE.Admin.Manager.Tools.EmptyTitle', 'No Tools yet')}
            hint={text(
              'FABRICATE.Admin.Manager.Tools.EmptyHintWorld',
              'Add a Tool from the world Tools Catalogue, where Tools are created.'
            )}
            dataAttr="data-tool-library-empty"
          >
            <div class="manager-tools-empty-actions">
              {#if ghostRows.length > 0}
                <ManagerButton
                  role="primary"
                  data-tool-empty-browse-world={String(ghostRows.length)}
                  onclick={() => {
                    ui.membershipFilter = 'all';
                    ui.pageIndex = 0;
                  }}
                >
                  <i class="fas fa-plus" aria-hidden="true"></i>
                  <span
                    >{text(
                      'FABRICATE.Admin.Manager.Tools.EmptyBrowseWorld',
                      'Show the {count} world Tools you can add'
                    ).replace('{count}', String(ghostRows.length))}</span
                  >
                </ManagerButton>
              {/if}
              <ManagerButton data-tool-empty-open-catalogue onclick={onOpenWorldCatalogue}>
                <i class="fas fa-globe" aria-hidden="true"></i>
                <span
                  >{text(
                    'FABRICATE.Admin.Manager.Tools.EmptyOpenCatalogue',
                    'Open the world Tools Catalogue'
                  )}</span
                >
              </ManagerButton>
            </div>
          </EmptyState>
        {:else if filteredTools.length === 0}
          <!--
            FILTERED TO NOTHING IS NOT AN ABSENCE (issue 1373), and the primitive has said so
            since it was extracted. This call site passed an `icon` and a `title` and no
            `filtered`, so a list that simply matched no rows drew the full hero panel — a 44px
            inset, a 46px glyph tile and a 13px serif heading — where `proto:2545` draws one
            dashed box, 26px around a single 11.5px sentence, with no icon and no title at all.

            THE SENTENCE NAMES THE FILTER, not the search. Three controls narrow this list and
            only one of them is the query: a GM who has switched the membership segment to
            `Overriding` on a system that overrides nothing was told `No Tools match your
            search` over an empty search box.
          -->
          <EmptyState
            filtered
            hint={text(
              'FABRICATE.Admin.Manager.Tools.EmptyFiltered',
              'Nothing matches that filter.'
            )}
            dataAttr="data-tool-library-filtered-empty"
          />
        {:else}
          <div class="manager-tools-library-list" role="list">
            {#each pagedTools as entry (entry.id)}
              {@const row = entry.projected}
              {@const inherit = inheritState(entry.id)}
              <article
                class="manager-tools-row"
                class:is-selected={rowSelected(entry.id)}
                class:is-unadopted={!entry.member}
                data-manager-tool-id={entry.id}
                data-tool-row-member={entry.member ? 'member' : 'absent'}
                role="listitem"
              >
                <button
                  type="button"
                  class="manager-tools-select-target"
                  aria-pressed={rowSelected(entry.id)}
                  onclick={() => chooseTool(entry)}
                >
                  <img src={entry.img} alt="" />
                  <span class="manager-tools-library-copy">
                    <strong title={entry.name}>{entry.name}</strong>
                    <small
                      >{entry.description ||
                        text(
                          'FABRICATE.Admin.Manager.NoDescriptionAdded',
                          'No description has been added.'
                        )}</small
                    >
                    <span class="manager-tools-library-chips">
                      {#if entry.member}
                        <Chip
                          tone={row.validation.valid ? 'positive' : 'danger'}
                          density="list"
                          class={`manager-tools-validation-chip ${row.validation.valid ? 'is-ready' : ''}`}
                          icon={row.validation.valid
                            ? 'fas fa-circle-check'
                            : 'fas fa-circle-exclamation'}
                          data-tool-validation-status={row.validation.valid
                            ? 'ready'
                            : 'needs-attention'}
                        >
                          {row.validation.valid
                            ? text('FABRICATE.Admin.Manager.Tools.ValidationReady', 'Ready')
                            : text(
                                'FABRICATE.Admin.Manager.Tools.ValidationNeedsAttention',
                                'Needs attention'
                              )}
                        </Chip>
                        <!-- ONE BREAKAGE CHIP, not two. The prototype's system row carries
                             `[breakage] [Enabled|Disabled]`; the ON-BREAK action is a WORLD
                             default, stated on the world catalogue's row, and repeating it
                             here says nothing this screen decides. The enabled half of that
                             pair is the toggle in the action cluster rather than a second
                             chip beside it - see the note there. -->
                        <Chip tone="neutral" density="list" class="manager-tools-breakage-chip"
                          >{breakageLabel(entry.tool, row.breakage)}</Chip
                        >
                      {/if}
                      {#if inherit}
                        <span
                          class="manager-tools-row-inherit"
                          class:is-overridden={inherit.state === 'overridden'}
                          data-tool-row-inherit={inherit.state}>{inherit.label}</span
                        >
                      {:else if !entry.member}
                        <span class="manager-tools-row-inherit" data-tool-row-inherit="absent"
                          >{text(
                            'FABRICATE.Admin.Manager.Tools.RowNoRulesHere',
                            'No rules in this system'
                          )}</span
                        >
                      {/if}
                    </span>
                  </span>
                </button>
                <div class="manager-tools-library-actions">
                  <!-- HOW MANY RECIPES HERE REQUIRE IT, which is the fact the design ends this
                       row with. It sits before the action rather than among the chips because
                       it is not a property of the Tool: it is how much of this system leans on
                       it, and it is the number a GM checks before disabling or removing one. -->
                  <span class="manager-tools-row-recipes" data-tool-row-recipes={entry.id}>
                    <!-- A DASH, NOT A ZERO, for a world Tool this system holds no rules for. A
                         recipe here cannot reference a Tool the system is not a member of, so
                         `0` is not a count that came out low - there is nothing to count, and
                         the reference draws the em dash for exactly that (issue 1373). -->
                    <strong>{entry.member ? recipeCount(entry.id) : '\u2014'}</strong>
                    <!-- THE PLURAL IS OURS AND IT STAYS (issue 1373 parity round). `proto:2536`
                         writes an invariant `Recipes` under the figure, and the audit asked for
                         a decision either way. Kept: the reference is a single-locale artefact
                         and English is the one language where an invariant unit caption happens
                         to read acceptably at 1. `RowRecipeOne` is a real localization seam - a
                         language with a dual or a paucal needs it - and deleting it to match a
                         mock would be trading a translator's affordance for a character. The
                         two labels are the same size, weight and tracking, so nothing about the
                         column's geometry turns on which one renders. -->
                    <small
                      >{recipeCount(entry.id) === 1 && entry.member
                        ? text('FABRICATE.Admin.Manager.Tools.RowRecipeOne', 'Recipe')
                        : text('FABRICATE.Admin.Manager.Tools.RowRecipeCount', 'Recipes')}</small
                    >
                  </span>
                  {#if entry.member}
                    <!--
                      THE TOGGLE STAYS, AND THE PROTOTYPE'S `Enabled` PILL IS THEREFORE NOT
                      ALSO DRAWN. The prototype states the enabled flag as a read-only pill
                      because its own inspector footer is where membership is authored; that
                      footer needs `systemName` and the membership flag, neither of which this
                      screen's call site passes, so the pill would replace a working control
                      with a label and leave nothing able to set it. Drawing BOTH is worse
                      still: two controls over one field is the redundancy the prototype's
                      composition exists to avoid.
                      It is also the only surface the Foundry smoke's Tool Studio phase drives
                      `toggleToolEnabled` through, so removing it deletes proven coverage.
                    -->
                    <button
                      type="button"
                      class={`manager-tools-enabled-toggle ${row.enabled ? 'is-on' : ''}`}
                      aria-pressed={row.enabled}
                      aria-label={row.enabled
                        ? text('FABRICATE.Admin.Manager.Tools.Disable', 'Disable Tool')
                        : text('FABRICATE.Admin.Manager.Tools.Enable', 'Enable Tool')}
                      onclick={() => onToggleToolEnabled(entry.id, !row.enabled)}
                    >
                      <span aria-hidden="true"><span></span></span>
                    </button>
                  {/if}
                  {#if entry.member}
                    <!-- A LABELLED, BORDERED BUTTON rather than a bare pen: the row leads
                         somewhere named, and the prototype names it. The `data-tool-edit-rules`
                         hook is what the View Lab cases select on now that the pen is gone. -->
                    <button
                      type="button"
                      class="manager-tools-edit-rules"
                      data-tool-edit-rules={entry.id}
                      aria-label={text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}
                      title={text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}
                      onclick={() => onEditTool(entry.id)}
                    >
                      <span>{text('FABRICATE.Admin.Manager.Tools.EditRules', 'Edit rules')}</span>
                      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="manager-tools-edit-rules is-add"
                      data-tool-add-to-system={entry.id}
                      onclick={() => actions?.addToSystem?.(entry.id, systemId)}
                    >
                      <i class="fas fa-plus" aria-hidden="true"></i>
                      <span
                        >{text('FABRICATE.Admin.Manager.Tools.AddToSystem', 'Add to system')}</span
                      >
                    </button>
                  {/if}
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
  <!-- THE FOOT PAGER RENDERS ONLY WHERE THERE IS MORE THAN ONE PAGE (issue 1373).

       `PROTO-tool-rules.png` draws three rows and NO bar under them, and this list shipped a
       `persistent` one — a full-width `Showing 1-8 of 8 · Page 1 of 1 · Per page 8` band stating
       nothing the `3 shown · 3 of 10 in this system` count above the list does not already say.
       That is the maintainer's ruling on the world catalogues applied to the remaining caller;
       `multiPageOnly` is the mode the essence lane added to `Pagination` for it.

       THE WRAPPER STAYS UNCONDITIONAL (given any tools at all) and only the BAR inside it comes
       and goes. It is the bottom-pinned layout slot — `margin-top: auto`, zero padding — and it
       is also what decides whether the browser card above is `:last-child`, which is what the
       `.manager-tools-main-content > .manager-tools-library-card:last-child` rule keys its
       `flex: 1 1 auto` off. Removing the slot on the one-page case would therefore stretch the
       list card to the foot of the pane on exactly the frames the reference draws it
       content-sized on, which is a second, unasked-for change riding along with this one. Empty,
       the slot measures zero and the flex free space it would have occupied is absorbed by its
       own auto margin.

       The Foundry smoke's `assertToolLibraryPagination` phase reads the BAR rather than this
       slot for the same reason. -->
  {#if tools.length > 0}
    <div class="manager-tools-browser-pagination" data-tool-browser-pagination>
      <Pagination
        totalCount={filteredTools.length}
        {pageSize}
        {pageIndex}
        pageSizeOptions={[8, 16, 24]}
        multiPageOnly
        onPageChange={(next) => {
          ui.pageIndex = next;
        }}
        onPageSizeChange={(next) => {
          ui.pageSize = next;
          ui.pageIndex = 0;
        }}
      />
    </div>
  {/if}
</main>

<style>
  /* The title cell holds the heading word AND the authoring-source pill (issue 1373). STATIC
     class name, so Svelte can prove the selector is used and `lint:svelte:warnings` stays at
     zero.

     The PILL'S OWN SIZING is not authored here: the host sheet's descendant rule under
     `.manager-tools-authority-heading` still reaches it one level deeper, which is why it
     stays the smaller 18px/0.56rem treatment its sibling wears.

     The token that rule selects on is deliberately not written out. `manager-layout.test.js`
     ratchets the hand-rolled-chip migration by matching that token ANYWHERE in a manager
     `.svelte` file, comment prose included - which is a decision it records, because one site
     passes the classes to a child as a string prop and an attribute-shaped scan missed it. */
  .manager-tools-authority-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* ── THE TOOLBAR ────────────────────────────────────────────────────────────────────────
     Two rows, matching the prototype: search and the membership filter share the first, sort
     and the result count share the second. The rules live HERE rather than in
     `styles/fabricate.css` so `VIEW_RECIPES` maps a change to the tool views alone; the
     search field's own geometry is already stated in the global sheet under
     `[data-manager-tools-search]` and is reused rather than restated. */
  [data-manager-tools-search] {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
  }

  /* `:global()` ON THE FIELD HALF ONLY (issue 1039). `.manager-search` now sits on a
     `<ManagerSearchField>` tag rather than on an element this component writes, so Svelte
     stamps no `svelte-<hash>` onto it and prunes the whole selector - `lint:svelte:warnings`
     fails on the `css_unused_selector` that produces. The ANCESTOR half stays local, so the
     hash lands on `[data-manager-tools-search]` instead and the selector keeps the same three
     components of specificity it had. */
  [data-manager-tools-search] :global(.manager-search) {
    flex: 1 1 150px;
    min-width: 0;
  }

  /* ── THE THREE FILLS ON THIS SCREEN ARE THE DESIGN'S OWN, AND THEY STAY ─────────────────
     The flattening pass across these screens removes card fills that paint a surface the
     design does not have. These three are not that: the membership filter, the sort select
     and the two bordered buttons are RAISED CONTROLS, and the design fills each of them with
     its own `--surface-soft` — the same token, not merely a similar one.

     Measured out of the design's own tool-rules frame: the filter track and the sort select
     sample exactly what `--fab-surface-soft` composites to over the pane colour. Removing
     these fills would flatten a CONTROL into the page rather than flattening a card into it,
     so they keep the token.

     The SELECT is the one exception, and its own block says why: a translucent background on
     a `<select>` opens a light native popup, so it inherits the shipped opaque fill instead
     of the design's composited one. */
  /* THE PER-ROW RECIPE COUNT, stacked as a figure over its unit exactly as the design draws
     it: the number is what a GM scans down the column, and the word beneath it is what tells
     them what the number counts. Right-aligned so the figures line up row to row. */
  /* `proto:2536` states `text-align: right; min-width: 50px; flex: 0 0 auto` — and the
     `min-width` is the one that does the work. Without it a `1` and a `12` give two different
     column widths, so the `Edit rules` buttons beside them do not line up down the list and
     the eye has nothing to run along. */
  .manager-tools-row-recipes {
    display: inline-flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    min-width: 50px;
    line-height: 1.1;
    text-align: right;
  }

  /* MONO AND ONE RUNG DOWN. The reference sets this figure at `700 12px var(--mono)` in the
     SECONDARY ink - a column of numerals a GM scans down, in the face that lines them up. It
     rendered in the full text colour, which made it the brightest thing in a row whose subject
     is the Tool's name (issue 1373). */
  .manager-tools-row-recipes strong {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 0.76rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* `proto:2536`: `font: 600 8px var(--sans); letter-spacing: .07em`. 0.52rem is 8.32px, so
     only the tracking was short — and tracking is most of what makes an 8px uppercase caption
     legible at all. */
  .manager-tools-row-recipes small {
    color: var(--fab-text-subtle);
    font-size: 0.52rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .manager-tools-membership-filter {
    display: flex;
    flex: 0 1 auto;
    flex-wrap: wrap;
    gap: var(--fab-space-2xs);
    padding: var(--fab-space-2xs);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    min-width: 0;
  }

  .manager-tools-membership-filter label {
    display: inline-flex;
    align-items: center;
    padding: var(--fab-space-chip) var(--fab-space-2);
    border-radius: 6px;
    color: var(--fab-text-muted);
    font-size: 0.66rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .manager-tools-membership-filter label.is-selected {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  /* The radio itself carries the state and the keyboard behaviour; the label paints it.
     Sized to 1px rather than `display: none` so it stays focusable. */
  .manager-tools-membership-filter input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }

  .manager-tools-sort-row {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* `proto:2519`: `font: 700 8.5px var(--sans); letter-spacing: .09em; text-transform:
     uppercase; color: var(--subtle)`. The tracking and the transform were already right; the
     ink was a rung bright, which put a control's LABEL at the same weight of attention as the
     controls it labels. */
  .manager-tools-sort-label {
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  /* `flex: 0 0 auto` AND an explicit `width`, because the manager sheet gives every `select`
     a full-row width: without both, the select took the whole sort row and pushed the
     direction toggle and the count onto lines of their own. This block is unlayered and the
     sheet's is layered, so it wins on cascade layer rather than on specificity. */
  /* NO BACKGROUND DECLARATION, and that is a correctness fix rather than a tidy-up. The
     design fills this control with its own translucent surface token — but a TRANSLUCENT
     background on a `<select>` makes the browser open a LIGHT native popup, which
     `manager-layout.test.js` gates against by name. The
     shipped `.fabricate-manager select` rule already paints `--fab-bg-1`, one opaque rung
     that lands within a few units of the design's composited value, so this block states
     geometry only and inherits the fill every other manager select wears. */
  /* `proto:2520`: `height: 32px; padding: 0 10px; color: var(--text2); font: 500 11.5px
     var(--sans)`. 32 is a retired control height, so this takes the ladder's nearest surviving
     rung, 30 — the same substitution every 32px control on this screen makes, stated once in
     the segment block of `styles/fabricate.css`. 10px has no step on the 4px spacing scale and
     takes 12. */
  .manager-tools-sort-select {
    flex: 0 0 auto;
    width: auto;
    height: 30px;
    min-width: 92px;
    max-width: 180px;
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text-secondary);
    font-size: 11.5px;
    font-weight: 500;
  }

  /* `height: auto` and `min-height` rather than a bare `height`, and `justify-content:
     flex-start` — Foundry's global button rule centres content and pins a fixed height, which
     crops a two-child button like this one. See the CSS section of `CONTRIBUTING.md`. */
  /* `proto:2521` (the direction toggle) and `proto:2538` (the row's route) both state
     `gap: 6px` and an 8px corner over the soft surface. The gap was 4. The direction toggle is
     a 32px control and takes the ladder's 30; the row button is 30 in the design itself, so
     its own block below leaves the floor alone. */
  .manager-tools-sort-direction,
  .manager-tools-edit-rules {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
    width: auto;
    height: auto;
    min-height: 30px;
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text-secondary);
    font-size: 11.5px;
    font-weight: 600;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
  }

  /* `proto:2538`: `height: 30px; padding: 0 12px; border: 1px solid var(--border-strong);
     font: 600 10.5px var(--sans); color: var(--text)`. Everything but the label size and the
     glyph was already exact. */
  .manager-tools-edit-rules {
    flex: 0 0 auto;
    min-height: 30px;
    padding: 0 var(--fab-space-3);
    border-color: var(--fab-border-strong);
    color: var(--fab-text);
    font-size: 10.5px;
  }

  /* `proto:2541`: the same control, dashed, in the SECONDARY ink rather than the muted one.
     Nothing else on it differs, which is why only the colour is restated here. */
  .manager-tools-edit-rules.is-add {
    border-style: dashed;
    background: transparent;
    color: var(--fab-text-secondary);
  }

  /* `proto:2538` sets the launch arrow at 8px; `proto:2541` sets the plus at 9px. They are
     different glyphs doing different jobs — one is a destination mark after a label, the other
     is the verb in front of one — so the design sizes them apart and so does this. */
  .manager-tools-edit-rules i {
    font-size: 8px;
  }

  .manager-tools-edit-rules.is-add i {
    font-size: 9px;
  }

  /* `proto:2522`: `font: 500 11px var(--sans); color: var(--subtle)`. It read at 10.56px in
     the muted ink, which put a running total at almost the same emphasis as the controls that
     produce it. */
  .manager-tools-sort-row .manager-tools-result-summary {
    margin: 0 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 11px;
    font-weight: 500;
    text-align: right;
  }

  /* THE INHERIT STATE IS NOT A CHIP, deliberately. It is a sentence about where the values
     came from, not a badge naming one of them, and the prototype sets it as plain text beside
     the pills for exactly that reason.

     ── THE READING ORDER WAS INVERTED, AND A TOKEN THAT DOES NOT EXIST IS WHY (issue 1373) ──
     This resolved `var(--fab-status-warning-text, var(--fab-accent))`, and
     `--fab-status-warning-text` IS DECLARED NOWHERE in this repository - the only reference to
     it was this one call site. So the live branch was always the FALLBACK, and the qualifying
     sentence rendered in the full accent while the stat chip it qualifies rendered in
     `--fab-text-muted`: the caption outshone the fact.

     The warning FAMILY is right and the reference uses it here - `--fab-warning-text` for the
     overriding sentence, the subtle tone for the inheriting one. That token is real and is
     declared in all seven theme blocks, which is the whole difference. It is not spelled as a
     literal for the reason `theme-colour-contract.test.js` exists: seven themes redefine this
     ramp, and one theme's value frozen into the sheet is six wrong colours. */
  .manager-tools-row-inherit {
    color: var(--fab-text-subtle);
    font-size: 0.6rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .manager-tools-row-inherit.is-overridden {
    color: var(--fab-warning-text);
  }

  /* The stat chip is the FACT and reads one rung brighter than the sentence beside it, which is
     the reference's own relationship between the two. `:global()` is required and is not a
     loosening: the chip element is written by `Chip.svelte`, so a class handed to it as a prop
     never carries this block's scoping attribute - `ToolBrowserInspector` repairs the same
     hazard the same way. The ANCESTOR half stays local, so the hash lands on the wrapper. */
  .manager-tools-library-chips :global(.manager-tools-breakage-chip) {
    color: var(--fab-text-secondary);
  }

  /* The way out of the zero state. A column, so a long localized label does not force the two
     routes onto one squeezed row inside a panel that is already centred and capped. */
  .manager-tools-empty-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* A world Tool with no rules here is present but not adopted, and reads that way. */
  .manager-tools-row.is-unadopted {
    background: transparent;
    opacity: 0.72;
  }
</style>
