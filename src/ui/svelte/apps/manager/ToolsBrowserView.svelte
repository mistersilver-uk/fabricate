<!-- Svelte 5 runes mode -->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
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
    // The world Tool selected that this system has no rules record for. A second id rather than
    // a widening of `selectedToolId`, which is derived from the open tool DRAFT that an unadopted
    // Tool has none of. Held by the root, because the shell's aside renders the inspector it
    // fills; see `selectLibraryTool` there.
    selectedUnadoptedToolId = '',
    managedItemOptions = [],
    breakageAuthority = 'toolSpecific',
    // The world scope's own projection and the AUTHORING layer of the resolved token above.
    // Both are restated by the call site after it spreads the tool bundle, so declaring exactly
    // what the site passes keeps the lookup off the spread: declaring a name the site does NOT
    // pass would make every reader a live subscriber to the whole bundle.
    scope = null,
    // The world Tool write family, for the one write this screen makes that its own system
    // cannot: adopting a world Tool with no rules record here.
    actions = null,
    // Read rather than inferred. `scope.entries[].systems[]` is the world projection's own JOIN,
    // and picking this system's row out of it is the only way a row can state whether it INHERITS
    // the world defaults or overrides one — the system's own tool record carries the resolved
    // values and cannot tell the two apart.
    systemId = '',
    breakageSource = 'default',
    onSelectTool = () => {},
    onEditTool = () => {},
    // No `onCreateToolDrop`, and no drop zone: a Tool is one world record every system adopts,
    // and this screen can only ever author RULES for a record the world already holds.
    // `WorldToolCataloguePage` carries the zone, and the root resolves the dropped Item through
    // `services.resolveToolSource` before creating the world entity.
    onToggleToolEnabled = () => {},
    onSetBreakageAuthority = () => {},
    // The route out of the zero state that leaves this system. Passed rather than reached through
    // `actions`, the world Tool WRITE family: opening a route is the shell's job.
    onOpenWorldCatalogue = () => {},
    // The view-state is LIFTED (issue 1438): opening a tool switches `currentView` and unmounts
    // this component, so state held locally was reset by the trip out and back. Unbound, the
    // local fallback keeps the controls reactive for the isolated mounted tests.
    browserState = $bindable(null),
  } = $props();

  /**
   * The four inherited world-default sections, named once. `repairRequirements` is deliberately
   * absent: `worldToolStudio` records that it is SEEDED on adoption and then diverges, so it has
   * no inherit state a row could report.
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

  // Lifted on all six axes, for the reason above. Membership, sort key and sort direction are
  // lifted with search and page because they are the same KIND of state: view filters over rows
  // the store has already published, not cohort selectors the store must hold. Leaving them
  // local would half-lift the toolbar, which is the defect issue 1438 removes, made harder to
  // see by being partial.
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

  // Projected to a scalar immediately, as a cost decision: `scope` is a NEW object on every
  // world-corpus publish, so reading it inside a reactive scope would re-render this whole view
  // on every world-scope edit. `worldScopeProjection` attaches `toolBreakage` ONLY when the
  // corpus holds one, so `''` means the world authored nothing — a different label and a
  // different pill from an authored `toolSpecific`.
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

  // The world projection's per-system join, indexed by world entity id. A Map rather than a
  // `find` per row, which would walk the whole corpus once per Tool on every re-render.
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
   * How many of THIS system's recipes require one Tool, read off the projection's per-system row
   * and never counted here: `adminStore` walks every recipe once per publish and keys the answer
   * by `(tool, system)`, and this screen has no recipe corpus at all. `0` for a world Tool this
   * system has no rules for is a real answer, since a recipe here cannot reference a Tool the
   * system is not a member of.
   *
   * @param {string} toolId
   * @returns {number}
   */
  function recipeCount(toolId) {
    return Number(worldRowsByToolId.get(String(toolId || ''))?.recipeCount) || 0;
  }

  /**
   * What one row says about its relationship to the world defaults, or `null` when the world
   * corpus has no record of this Tool. `null` is a real answer: a Tool that exists only in this
   * system inherits nothing, and the screen states nothing there rather than claiming a parent.
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

  // `all` is the one filter that changes what a row IS: search and sort narrow this system's
  // tools, while `All world tools` widens past them to world records this system has no rules
  // for — the only route on this screen to an unadopted Tool, and therefore the only thing the
  // inspector's `Add … to …` button can act on.
  const systemToolIds = $derived(new Set(tools.map((tool) => String(tool?.id ?? ''))));
  const worldEntries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);

  /**
   * The world records this system has NO tool for, projected to the member row shape. They are
   * `member: false` and carry no breakage, enabled or validation answer: everything a row states
   * about behaviour is a MEMBERSHIP fact, and inventing one from the world default would claim
   * rules that do not exist here.
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

  // The cohort segments, in the shape the shared segmented control reads. The primitive
  // localizes each label itself, so the options carry `labelKey` / `fallback` and the tally rides
  // its `count` slot — which is why `Tools.FilterInSystem` and `Tools.FilterAllWorld` no longer
  // interpolate a `{count}`. `Overriding` supplies none and renders none.
  const membershipFilters = $derived([
    {
      value: 'in',
      labelKey: 'FABRICATE.Admin.Manager.Tools.FilterInSystem',
      fallback: 'In this system',
      count: memberRows.length,
    },
    {
      value: 'all',
      labelKey: 'FABRICATE.Admin.Manager.Tools.FilterAllWorld',
      fallback: 'All world tools',
      count: memberRows.length + ghostRows.length,
    },
    {
      value: 'over',
      labelKey: 'FABRICATE.Admin.Manager.Tools.FilterOverriding',
      fallback: 'Overriding',
    },
  ]);

  /**
   * The set the membership segment selected, before the search term and before the page.
   *
   * NAMED RATHER THAN INLINED, and that is the whole repair (issue 1373): three places asked "is
   * there anything on this screen" and answered with the raw `tools` prop — this system's ADOPTED
   * tools — while the counts, the list, the pager's total and the result summary were computed
   * over the widened cohort. For a system that has adopted nothing that made the one route in the
   * product to adopt a world Tool unreachable.
   *
   * A superset of `memberRows` in every case, so every previously reachable state is reached
   * identically: `all` widens, `in` and `over` are `memberRows` exactly.
   */
  const cohortRows = $derived(
    membershipFilter === 'all' ? [...memberRows, ...ghostRows] : memberRows
  );

  const filteredRows = $derived(
    cohortRows
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

  // Kept as the pager's input under its shipped name: the Foundry smoke's
  // `assertToolLibraryPagination` phase pins this list's footer geometry and, since the pager
  // became `multiPageOnly`, its PRESENCE — absent at eight rows on an eight-row page, present at
  // nine.
  const filteredTools = $derived(filteredRows);
  const pagedTools = $derived(
    filteredTools.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  // `{shown}` is the PAGE, not the filter: fed the filter total, a two-page result read
  // `11 shown` over eight rows while the pager below read `Showing 1-8 of 11`. The filter total
  // is not lost — `{world}` and the membership filter both still state it.
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
    // A deliberate unadopted selection suppresses the auto-select. Without this the effect sees
    // an id that is not in `tools`, decides nothing is selected, and snaps the panel away from
    // the one row whose whole purpose is the `Add {tool} to {system}` action.
    if (selectedUnadoptedToolId) {
      autoSelectedToolId = '';
      return;
    }
    if (tools.some((tool) => tool.id === selectedToolId)) {
      autoSelectedToolId = '';
      return;
    }
    // The first row the GM is LOOKING at, read off `pagedTools` rather than the raw `tools` prop:
    // `tools` is the unsorted, unfiltered authored array, and since this screen gained a sort
    // control the two disagree for every library whose authored order is not name-ascending.
    //
    // `.member` skips the ghost rows, and that is not an optimisation. Under `all`,
    // `filteredRows` also carries unadopted world Tools, which are inspected through
    // `selectedUnadoptedToolId`; auto-selecting one would push an unadopted id down the adopted
    // path AND then latch, because the early return above suppresses every later auto-select. A
    // page holding no member row selects nothing.
    const firstToolId = pagedTools.find((row) => row.member)?.id || '';
    if (!firstToolId || autoSelectedToolId === firstToolId) return;
    autoSelectedToolId = firstToolId;
    onSelectTool(firstToolId);
  });

  /**
   * Select a row, adopted or not. The panel takes the world entry too and answers an unadopted
   * row with `No rules here` and its `Add {tool} to {system}` action, so refusing the click would
   * withhold the one affordance that row exists for.
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
          THE PILL SITS INSIDE THE TITLE CELL, not beside the chip, and that is a layout
          constraint: `styles/fabricate.css` gives this heading three grid columns and is closed
          to this lane, so a fourth child would flow into an implicit second row under the glyph.
          Nesting it in the `1fr` cell keeps the heading at three children and lets the pill wrap
          under a long title.
        -->
        <div class="manager-tools-authority-title">
          <strong>{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'Breakage mode')}</strong>
          <Chip tone={authorityPill.tone} data-tool-authority-pill={authorityPill.state}
            >{authorityPill.label}</Chip
          >
        </div>
      </div>
      <!--
        Three segments, selected on the AUTHORED layer: `selected` comes from `breakageSource`,
        never from `breakageAuthority === value`. The resolved token cannot tell "this system
        chose it" from "this system inherited it", so a two-state control minted a per-system
        override the moment a GM clicked the segment already highlighted.
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
            <!-- No glyph: the WORLD card leads each segment with an icon and the system card
                 does not. `systemBreakModeOptions` emits no `icon` for the same reason. -->
            <span class="manager-tools-authority-option">{segment.label}</span>
          </label>
        {/each}
      </div>
    </InspectorCard>

    <!--
      The browse archetype's filter bar, INSIDE this section rather than instead of it. The two
      controls in this band are a search and a filter, which is what the browse recipe in
      `openspec/specs/design-system/spec.md` puts in the filter bar; the three segments above are
      a SETTING — they author `breakageSource` on the system record rather than narrow this list —
      so they stay in their own card.

      THE SECTION STAYS AND THE BAR NESTS INSIDE IT. `styles/fabricate.css`'s three Tools-browser
      search overrides are written as descendants of `.manager-tools-library-card`, whose premise
      is that this view writes exactly one search field inside the one section carrying both that
      class and `data-manager-tools-search`. Putting the class on the bar would move the field out
      of a carrier the class names. `tool-rules-list-parity.test.js` reads the source for both
      halves.

      The landmark has its own name: every other bar is named `<Area>.Filters`, and reusing the
      radiogroup's `Tools.FilterLabel` made the band and the control inside it announce the same
      sentence.
    -->
    <section class="manager-tools-library-card" data-manager-tools-search>
      <ManagerToolbar ariaLabel={text('FABRICATE.Admin.Manager.Tools.Filters', 'Tool filters')}>
        <ManagerSearchField
          value={searchTerm}
          onInput={(next) => {
            ui.searchTerm = next;
            ui.pageIndex = 0;
          }}
          placeholder={text('FABRICATE.Admin.Manager.Tools.Search', 'Search tools')}
          ariaLabel={text('FABRICATE.Admin.Manager.Tools.Search', 'Search tools')}
        />
        <!--
          The cohort switch is the SHARED segmented control, not a fourth copy of it: this view
          hand-rolled the radiogroup and re-derived the primitive's track, segment, selected fill
          and visually-hidden radio in scoped CSS. The sibling `ComponentsBrowserView` cohort
          switch renders through the same primitive at `density="compact" tone="accent"`, which is
          why the props below match it. (Spelled without its angle bracket deliberately:
          `screenshot-capture-scoping.test.js` scans this directory for opening tags of the
          primitive, and a prose mention is counted as one and swallows the real span below.)
          `dataAttr` stamps `true` on the TRACK rather than the current value, so the selected
          segment is read from its radio (`[data-tool-membership-option="…"] input:checked`).
        -->
        <SegmentedControl
          options={membershipFilters}
          value={membershipFilter}
          density="compact"
          tone="accent"
          groupName="tool-membership-filter"
          dataAttr="data-tool-membership-filter"
          optionDataAttr="data-tool-membership-option"
          ariaLabel={text(
            'FABRICATE.Admin.Manager.Tools.FilterLabel',
            'Which Tools this list shows'
          )}
          onChange={(next) => {
            ui.membershipFilter = next;
            ui.pageIndex = 0;
          }}
        />
      </ManagerToolbar>
    </section>

    <!--
      Sort and the result count on one row, which is the only place the count can say something
      useful: `3 tools` states the length of the list the GM is looking at, while
      `3 shown · 3 of 10 in this system` states the two numbers the membership filter switches
      between.
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
        {#if cohortRows.length === 0}
          <!--
            The zero state is a fact about the SELECTED COHORT, not about `tools`: gated on the
            raw prop this branch won unconditionally for a system that had adopted nothing, so
            both controls that widen the cohort moved a filter whose result the panel then hid.
            A cohort non-empty before the search term and empty after it is the FILTERED state
            and falls through below.

            TWO ROUTES, because the state has two honest answers of different sizes. The nearer
            one switches the membership filter in place and is the primary, and renders only when
            there is something to show; the farther one leaves for the world catalogue, and is the
            only route when the world holds none either.
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
            Filtered to nothing is not an absence: without `filtered` the primitive draws the full
            hero panel where the design draws one dashed box around a single sentence, with no icon
            and no title.

            THE SENTENCE NAMES THE FILTER, not the search. Three controls narrow this list and
            only one is the query, so a GM who switched the membership segment to `Overriding` was
            told `No Tools match your search` over an empty search box.
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
                        <!-- ONE breakage chip, not two: the on-break action is a WORLD default,
                             stated on the world catalogue's row, and repeating it here says
                             nothing this screen decides. The enabled half of that pair is the
                             toggle in the action cluster — see the note there. -->
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
                  <!-- How many recipes here require it. It sits before the action rather than
                       among the chips because it is not a property of the Tool: it is how much of
                       this system leans on it, and it is the number a GM checks before disabling
                       or removing one. -->
                  <span class="manager-tools-row-recipes" data-tool-row-recipes={entry.id}>
                    <!-- A dash, not a zero, for a world Tool this system holds no rules for: a
                         recipe here cannot reference a Tool the system is not a member of, so
                         there is nothing to count. -->
                    <strong>{entry.member ? recipeCount(entry.id) : '\u2014'}</strong>
                    <!-- The plural stays. `RowRecipeOne` is a real localization seam — a language
                         with a dual or a paucal needs it — and the two labels are the same size,
                         weight and tracking, so nothing about the column's geometry turns on which
                         one renders. -->
                    <small
                      >{recipeCount(entry.id) === 1 && entry.member
                        ? text('FABRICATE.Admin.Manager.Tools.RowRecipeOne', 'Recipe')
                        : text('FABRICATE.Admin.Manager.Tools.RowRecipeCount', 'Recipes')}</small
                    >
                  </span>
                  {#if entry.member}
                    <!--
                      THE TOGGLE STAYS, so the prototype's read-only `Enabled` pill is not also
                      drawn: that pill belongs to an inspector footer needing `systemName` and the
                      membership flag, neither of which this call site passes, so it would replace
                      a working control with a label. Drawing both is worse — two controls over
                      one field. It is also the only surface the Foundry smoke's Tool Studio phase
                      drives `toggleToolEnabled` through.

                      A `StatusToggle` rather than a hand-rolled switch. `class` is composed rather
                      than replaced, so `manager-tools-enabled-toggle` survives and neither the
                      smoke's selector nor the View Lab's steps move. It does not satisfy the
                      browse recipe's "a row's state renders as a status button rather than a
                      toggle" clause, which wants a different control and is a successor.
                    -->
                    <StatusToggle
                      class="manager-tools-enabled-toggle"
                      on={row.enabled}
                      ariaLabel={row.enabled
                        ? text('FABRICATE.Admin.Manager.Tools.Disable', 'Disable Tool')
                        : text('FABRICATE.Admin.Manager.Tools.Enable', 'Enable Tool')}
                      onclick={() => onToggleToolEnabled(entry.id, !row.enabled)}
                    />
                  {/if}
                  {#if entry.member}
                    <!-- A labelled, bordered button rather than a bare pen: the row leads
                         somewhere named. `data-tool-edit-rules` is what the View Lab cases select
                         on now that the pen is gone. -->
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
  <!-- THE FOOT PAGER RENDERS ONLY WHERE THERE IS MORE THAN ONE PAGE (issue 1373): a persistent
       `Showing 1-8 of 8 · Page 1 of 1` band states nothing the count above the list does not.
       `multiPageOnly` is the mode the essence lane added to `Pagination` for it.

       THE WRAPPER STAYS UNCONDITIONAL, given any cohort at all, and only the BAR inside it comes
       and goes. It is the bottom-pinned layout slot — `margin-top: auto`, zero padding — so a
       bar, when there is one, sits full-bleed at the foot of the pane. Empty, the slot measures
       zero and its own auto margin absorbs the free space, so leaving it in costs nothing.

       It decides nothing about `:last-child`: the slot is a SIBLING of
       `.manager-tools-main-content`, so that section's `:last-child` rule matches the browser card
       whether the slot renders or not. The Foundry smoke's `assertToolLibraryPagination` phase
       reads the BAR rather than this slot for the same reason.

       "Given any tools at all" is the selected COHORT, not the `tools` prop: read off the prop,
       the slot stayed absent for a zero-member system even once the widened list drew rows. -->
  {#if cohortRows.length > 0}
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
  /* The title cell holds the heading word AND the authoring-source pill. STATIC class name, so
     Svelte can prove the selector is used and `lint:svelte:warnings` stays at zero.

     The pill's own sizing is not authored here: the host sheet's descendant rule under
     `.manager-tools-authority-heading` still reaches it one level deeper. The token that rule
     selects on is deliberately not written out — `manager-layout.test.js` ratchets the
     hand-rolled-chip migration by matching that token ANYWHERE in a manager `.svelte` file,
     comment prose included. */
  .manager-tools-authority-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* THE TOOLBAR: two rows, matching the prototype — search and the membership filter share the
     first, sort and the result count the second. The rules live here rather than in
     `styles/fabricate.css` so `VIEW_RECIPES` maps a change to the tool views alone; the search
     field's own geometry is already stated in the global sheet and is reused rather than
     restated.

     The first row's own box is `ManagerToolbar`'s now, which states the same wrap, centring and
     gap for every browse screen. A copy here would be a second source of truth, and a wrong one:
     the section holds a single child, and `flex-direction: row` with `align-items: center` sizes
     that child to its content instead of to the section. What remains is the field's own grow. */

  /* `:global()` on the FIELD half only (issue 1039): `.manager-search` sits on a
     `<ManagerSearchField>` tag rather than an element this component writes, so Svelte stamps no
     `svelte-<hash>` onto it and prunes the whole selector, which fails `lint:svelte:warnings`.
     The ANCESTOR half stays local, so the hash lands on `[data-manager-tools-search]` and the
     selector keeps the same three components of specificity. */
  [data-manager-tools-search] :global(.manager-search) {
    flex: 1 1 150px;
    min-width: 0;
  }

  /* THE THREE FILLS ON THIS SCREEN ARE THE DESIGN'S OWN. The flattening pass removes card fills
     that paint a surface the design does not have; the membership filter, the sort select and the
     two bordered buttons are RAISED CONTROLS, and the design fills each with its own
     `--surface-soft` — the same token, not merely a similar one. Removing these would flatten a
     control into the page rather than a card into it.

     The SELECT is the one exception, and its own block says why: a translucent background on a
     `<select>` opens a light native popup, so it inherits the shipped opaque fill. */
  /* The per-row recipe count, stacked as a figure over its unit: the number is what a GM scans
     down the column, and the word beneath says what it counts. Right-aligned so the figures line
     up row to row. */
  /* The `min-width` is the one that does the work: without it a `1` and a `12` give two different
     column widths, so the `Edit rules` buttons beside them do not line up down the list. */
  .manager-tools-row-recipes {
    display: inline-flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    min-width: 50px;
    line-height: 1.1;
    text-align: right;
  }

  /* Mono and one rung down, in the secondary ink: a column of numerals a GM scans down, in the
     face that lines them up. In the full text colour it was the brightest thing in a row whose
     subject is the Tool's name. */
  .manager-tools-row-recipes strong {
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-mono);
    font-size: 0.76rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  /* Tracking is most of what makes an 8px uppercase caption legible at all. */
  .manager-tools-row-recipes small {
    color: var(--fab-text-subtle);
    font-size: 0.52rem;
    font-weight: 600;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .manager-tools-sort-row {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The ink was a rung bright, which put a control's LABEL at the same weight of attention as the
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

  /* A world Tool with no rules here is present but not adopted, and reads that way.

     IT DECLARES NO `background`, AND THAT IS THE WHOLE OF THE RULE (issue 1373). It used to
     declare `background: transparent`, which is the file's own layer trap for the fifth time:
     `styles/fabricate.css` is imported at `layer(modules)` and this block is UNLAYERED, so an
     unlayered declaration beats a layered one at ANY specificity. That discarded the sheet's
     `.manager-tools-library-list > article.is-selected { background: var(--fab-surface-active) }`
     and did NOT discard its `border-color`, because `.is-unadopted` never declared one - so a
     CHOSEN unadopted row drew an accent edge around no fill at all, on exactly the row whose
     selection is the point of the widened cohort.

     Ceding the declaration rather than out-specifying it is deliberate: a more specific
     unlayered `.is-unadopted.is-selected` rule is how this component accumulated the other four
     occurrences, and it would put the two selected states in two different layers. The fill for
     both is arbitrated in the sheet, in one place.

     NOTHING ABOUT THE RESTING ROW MOVES, which is why the whole declaration goes rather than
     only its selected case. The sheet ALREADY clears the resting fill for this route -
     `[data-manager-view='tools'] .manager-tools-row { background: transparent }`, at (0,3,0),
     which the (0,3,1) selected rule outranks - so this was a duplicate of that at rest and a
     defeat of the selected rule when chosen. `opacity` was always what said "not adopted".
     `tool-rules-list-parity.test.js` measures all four adopted x selected combinations. */
  .manager-tools-row.is-unadopted {
    opacity: 0.72;
  }
</style>
