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
    // The world Tool selected that this system has no rules record for. A second id, because
    // `selectedToolId` derives from the open tool DRAFT an unadopted Tool has none of.
    selectedUnadoptedToolId = '',
    managedItemOptions = [],
    breakageAuthority = 'toolSpecific',
    // The world scope's projection and the AUTHORING layer of the resolved token above. Declaring
    // exactly what the site passes keeps every reader off a subscription to the whole bundle.
    scope = null,
    // The world Tool write family, for the one write this screen makes that its system cannot:
    // adopting a world Tool with no rules record here.
    actions = null,
    // Read rather than inferred: `scope.entries[].systems[]` is the world projection's own JOIN, and
    // only it can say whether a row INHERITS the world defaults or overrides one.
    systemId = '',
    breakageSource = 'default',
    onSelectTool = () => {},
    onEditTool = () => {},
    // No `onCreateToolDrop`, and no drop zone: this screen only ever authors RULES for a record the
    // world already holds. `WorldToolCataloguePage` carries the zone.
    onToggleToolEnabled = () => {},
    onSetBreakageAuthority = () => {},
    // The route out of the zero state that leaves this system. Passed rather than reached through
    // `actions`, the world Tool WRITE family: opening a route is the shell's job.
    onOpenWorldCatalogue = () => {},
    // The view-state is LIFTED (issue 1438): opening a tool unmounts this component, so local state
    // was reset by the trip out and back. Unbound, the local fallback keeps the mounted tests live.
    browserState = $bindable(null),
  } = $props();

  /** The four inherited world-default sections. `repairRequirements` is deliberately absent:
      `worldToolStudio` records that it is SEEDED on adoption and then diverges. */
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

  // Lifted on all six axes (issue 1438): membership, sort key and direction are view filters over
  // published rows, the same KIND of state as search and page. Half-lifting is the defect itself.
  let ownBrowserState = $state(createToolsBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const searchTerm = $derived(String(ui.searchTerm || ''));
  const membershipFilter = $derived(ui.membershipFilter || 'in');
  const sortKey = $derived(ui.sortKey || 'name');
  const sortDirection = $derived(ui.sortDirection || 'asc');
  const pageIndex = $derived(ui.pageIndex || 0);
  const pageSize = $derived(ui.pageSize || DEFAULT_BROWSER_PAGE_SIZE);
  // NOT lifted: this is the "nothing is selected, pick the first row" guard, which names one mount's
  // auto-selection rather than anything the GM chose.
  let autoSelectedToolId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Projected to a scalar immediately, as a cost decision: `scope` is a NEW object on every
  // world-corpus publish. `worldScopeProjection` attaches `toolBreakage` only when the corpus holds
  // one, so `''` means the world authored nothing — a different label and pill from `toolSpecific`.
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

  // The world projection's per-system join, indexed by world entity id. A Map rather than a `find`
  // per row, which would walk the whole corpus once per Tool on every re-render.
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

  /** How many of THIS system's recipes require one Tool, read off the projection's per-system row:
      `adminStore` keys it by `(tool, system)` and this screen has no recipe corpus. `0` for an
      unadopted world Tool is real, since a recipe here cannot reference a non-member. */
  function recipeCount(toolId) {
    return Number(worldRowsByToolId.get(String(toolId || ''))?.recipeCount) || 0;
  }

  /** What one row says about its relationship to the world defaults, or `null` when the world corpus
      has no record of this Tool — a real answer, since such a Tool inherits nothing. */
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

  // `all` is the one filter that changes what a row IS: it widens to world records this system has
  // no rules for, the only route here to an unadopted Tool and so to the `Add … to …` action.
  const systemToolIds = $derived(new Set(tools.map((tool) => String(tool?.id ?? ''))));
  const worldEntries = $derived(Array.isArray(scope?.entries) ? scope.entries : []);

  /** The world records this system has NO tool for, in the member row shape: `member: false`, with
      no breakage, enabled or validation answer, because each of those is a MEMBERSHIP fact. */
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

  // The cohort segments, in the shape the shared segmented control reads. It localizes each label
  // itself and the tally rides its `count` slot, so the two filter keys interpolate no `{count}`.
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

  /** The set the membership segment selected, before the search term and before the page. NAMED
      RATHER THAN INLINED, and that is the whole repair (issue 1373): three places asked "is there
      anything on this screen" against the raw `tools` prop while everything else read the widened
      cohort, making adoption unreachable for a system that had adopted nothing. */
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

  // Kept under its shipped name: the Foundry smoke's `assertToolLibraryPagination` phase pins this
  // list's footer geometry and, since the pager became `multiPageOnly`, its PRESENCE.
  const filteredTools = $derived(filteredRows);
  const pagedTools = $derived(
    filteredTools.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  // `{shown}` is the PAGE, not the filter: fed the filter total, a two-page result read `11 shown`
  // over eight rows. `{world}` and the membership filter still state the filter total.
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

  /** Whether one row is the inspected one, across BOTH selection kinds. */
  function rowSelected(toolId) {
    return selectedUnadoptedToolId ? selectedUnadoptedToolId === toolId : selectedToolId === toolId;
  }

  $effect(() => {
    // A deliberate unadopted selection suppresses the auto-select; without this the effect snaps the
    // panel away from the one row whose purpose is the `Add {tool} to {system}` action.
    if (selectedUnadoptedToolId) {
      autoSelectedToolId = '';
      return;
    }
    if (tools.some((tool) => tool.id === selectedToolId)) {
      autoSelectedToolId = '';
      return;
    }
    // The first row the GM is LOOKING at, read off `pagedTools` rather than the unsorted `tools`
    // prop. `.member` skips the ghost rows: auto-selecting an unadopted one would push its id down
    // the adopted path AND latch, since the early return suppresses every later auto-select.
    const firstToolId = pagedTools.find((row) => row.member)?.id || '';
    if (!firstToolId || autoSelectedToolId === firstToolId) return;
    autoSelectedToolId = firstToolId;
    onSelectTool(firstToolId);
  });

  /** Select a row, adopted or not: the panel answers an unadopted row with `No rules here` and its
      `Add {tool} to {system}` action, so refusing the click withholds that row's one affordance. */
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
        <!-- THE PILL SITS INSIDE THE TITLE CELL: `styles/fabricate.css` gives this heading three
          grid columns and is closed to this lane, so a fourth child would flow into an implicit
          second row. The `1fr` cell also lets the pill wrap under a long title. -->
        <div class="manager-tools-authority-title">
          <strong>{text('FABRICATE.Admin.Manager.Tools.AuthorityKicker', 'Breakage mode')}</strong>
          <Chip tone={authorityPill.tone} data-tool-authority-pill={authorityPill.state}
            >{authorityPill.label}</Chip
          >
        </div>
      </div>
      <!-- Three segments, selected on the AUTHORED layer: `selected` comes from `breakageSource`,
        never from `breakageAuthority === value`. The resolved token cannot tell "this system chose
        it" from "this system inherited it", so a two-state control minted a spurious override. -->
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
            <!-- No glyph: the WORLD card leads each segment with an icon and the system card does
                 not. `systemBreakModeOptions` emits no `icon` for the same reason. -->
            <span class="manager-tools-authority-option">{segment.label}</span>
          </label>
        {/each}
      </div>
    </InspectorCard>

    <!--
      The browse archetype's filter bar, INSIDE this section rather than instead of it: the browse
      recipe in `openspec/specs/design-system/spec.md` puts a search and a filter in the bar, while
      the three segments above are a SETTING. It NESTS because `styles/fabricate.css`'s Tools-browser
      search overrides are descendants of `.manager-tools-library-card`, and the landmark has its own
      name so band and control do not announce alike.
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
        <!-- The cohort switch is the SHARED segmented control, not a fourth copy of it, at the same
          `density="compact" tone="accent"` as `ComponentsBrowserView`'s. (Spelled without its angle
          bracket deliberately: `screenshot-capture-scoping.test.js` scans this directory for opening
          tags of the primitive and would count a prose mention as one.) `dataAttr` stamps the
          TRACK, so the selected segment is read from its radio. -->
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

    <!-- Sort and the result count on one row, the only place the count says something useful:
      `3 tools` is the length of the list in view, while `3 shown · 3 of 10 in this system` states
      the two numbers the membership filter switches between. -->
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
          <!-- The zero state is a fact about the SELECTED COHORT, not about `tools`: gated on the
            raw prop it won unconditionally for a system that had adopted nothing. A cohort non-empty
            before the search term and empty after it is the FILTERED state below. TWO ROUTES: the
            nearer switches the membership filter in place, the farther leaves for the catalogue. -->
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
          <!-- Filtered to nothing is not an absence: without `filtered` the primitive draws the
            full hero panel. THE SENTENCE NAMES THE FILTER, not the search — three controls narrow
            this list and only one is the query. -->
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
                        <!-- ONE breakage chip, not two: the on-break action is a WORLD default. The
                             enabled half of that pair is the toggle in the action cluster. -->
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
                  <!-- How many recipes here require it. Before the action rather than among the
                       chips: it is how much of this system leans on the Tool, not a property of it. -->
                  <span class="manager-tools-row-recipes" data-tool-row-recipes={entry.id}>
                    <!-- A dash, not a zero, for a world Tool this system holds no rules for: there
                         is nothing to count. -->
                    <strong>{entry.member ? recipeCount(entry.id) : '\u2014'}</strong>
                    <!-- The plural stays: `RowRecipeOne` is a real localization seam, and the two
                         labels share size, weight and tracking. -->
                    <small
                      >{recipeCount(entry.id) === 1 && entry.member
                        ? text('FABRICATE.Admin.Manager.Tools.RowRecipeOne', 'Recipe')
                        : text('FABRICATE.Admin.Manager.Tools.RowRecipeCount', 'Recipes')}</small
                    >
                  </span>
                  {#if entry.member}
                    <!-- THE TOGGLE STAYS, so the prototype's read-only `Enabled` pill is not also
                      drawn: that pill needs `systemName` and the membership flag, which this call
                      site does not pass. It is the only surface the Foundry smoke drives
                      `toggleToolEnabled` through, and `class` is composed rather than replaced so
                      `manager-tools-enabled-toggle` survives for it and for the View Lab. -->
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
                    <!-- A labelled, bordered button rather than a bare pen: the row leads somewhere
                         named. `data-tool-edit-rules` is what the View Lab cases select on. -->
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
  <!-- THE FOOT PAGER RENDERS ONLY WHERE THERE IS MORE THAN ONE PAGE (issue 1373), through
       `Pagination`'s `multiPageOnly`. THE WRAPPER STAYS UNCONDITIONAL given any cohort at all, and
       only the BAR comes and goes: it is the bottom-pinned layout slot, empty it measures zero, and
       it decides nothing about `:last-child` because it is a SIBLING of
       `.manager-tools-main-content`. "Any cohort" is the SELECTED cohort, not the `tools` prop. -->
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
     Svelte can prove the selector used and `lint:svelte:warnings` stays at zero. The pill's sizing
     comes from the host sheet's rule under `.manager-tools-authority-heading`; the token that rule
     selects on is deliberately not written out, because `manager-layout.test.js` matches it
     ANYWHERE in a manager `.svelte` file, comment prose included. */
  .manager-tools-authority-title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* THE TOOLBAR: two rows, matching the prototype. Here rather than in `styles/fabricate.css` so
     `VIEW_RECIPES` maps a change to the tool views alone. The first row's box is `ManagerToolbar`'s,
     which states the wrap, centring and gap for every browse screen; what remains is the grow. */

  /* `:global()` on the FIELD half only (issue 1039): `.manager-search` sits on a
     `<ManagerSearchField>` tag rather than an element this component writes, so Svelte stamps no
     `svelte-<hash>` and prunes the whole selector, failing `lint:svelte:warnings`. The ANCESTOR half
     stays local, keeping the same three components of specificity. */
  [data-manager-tools-search] :global(.manager-search) {
    flex: 1 1 150px;
    min-width: 0;
  }

  /* THE THREE FILLS ON THIS SCREEN ARE THE DESIGN'S OWN: the membership filter, the sort select and
     the two bordered buttons are RAISED CONTROLS, each filled with the design's `--surface-soft`, so
     removing them would flatten a control into the page. The SELECT is the one exception. */
  /* The per-row recipe count, a figure over its unit, right-aligned so the figures line up. */
  /* The `min-width` does the work: without it a `1` and a `12` give two different column widths. */
  .manager-tools-row-recipes {
    display: inline-flex;
    flex: 0 0 auto;
    flex-direction: column;
    align-items: flex-end;
    min-width: 50px;
    line-height: 1.1;
    text-align: right;
  }

  /* Mono and one rung down, in the secondary ink: a column of numerals a GM scans down, in the face
     that lines them up. */
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

  /* The ink was a rung bright, putting a control's LABEL at the weight of the controls it labels. */
  .manager-tools-sort-label {
    color: var(--fab-text-subtle);
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.09em;
    text-transform: uppercase;
  }

  /* `flex: 0 0 auto` AND an explicit `width`, because the manager sheet gives every `select` a
     full-row width. This block is unlayered and the sheet's is layered, so it wins on layer. */
  /* NO BACKGROUND DECLARATION, and that is a correctness fix: a TRANSLUCENT background on a
     `<select>` makes the browser open a LIGHT native popup, which `manager-layout.test.js` gates
     against by name. `.fabricate-manager select` already paints `--fab-bg-1`. */
  /* `proto:2520`: 32 is a retired control height, so this takes the nearest surviving rung, 30 —
     the substitution every 32px control on this screen makes. 10px takes 12. */
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

  /* `height: auto` and `min-height` rather than a bare `height`, and `justify-content: flex-start` —
     Foundry's global button rule centres content and pins a height, cropping a two-child button. */
  /* `proto:2521` and `proto:2538` both state `gap: 6px` and an 8px corner; the gap was 4. */
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

  /* `proto:2538`: everything but the label size and the glyph was already exact. */
  .manager-tools-edit-rules {
    flex: 0 0 auto;
    min-height: 30px;
    padding: 0 var(--fab-space-3);
    border-color: var(--fab-border-strong);
    color: var(--fab-text);
    font-size: 10.5px;
  }

  /* `proto:2541`: the same control, dashed, in the SECONDARY ink rather than the muted one. */
  .manager-tools-edit-rules.is-add {
    border-style: dashed;
    background: transparent;
    color: var(--fab-text-secondary);
  }

  /* `proto:2538` sets the launch arrow at 8px and `proto:2541` the plus at 9px: a destination mark
     after a label and a verb in front of one are sized apart by the design, and so here. */
  .manager-tools-edit-rules i {
    font-size: 8px;
  }

  .manager-tools-edit-rules.is-add i {
    font-size: 9px;
  }

  /* `proto:2522`: it read at 10.56px in the muted ink, putting a running total at almost the same
     emphasis as the controls that produce it. */
  .manager-tools-sort-row .manager-tools-result-summary {
    margin: 0 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 11px;
    font-weight: 500;
    text-align: right;
  }

  /* THE INHERIT STATE IS NOT A CHIP: it is a sentence about where the values came from, and the
     prototype sets it as plain text beside the pills. THE READING ORDER WAS INVERTED (issue 1373)
     because this resolved `var(--fab-status-warning-text, var(--fab-accent))` and
     `--fab-status-warning-text` is declared NOWHERE, so the caption outshone the fact. The warning
     FAMILY is right, and is not spelled as a literal for `theme-colour-contract.test.js`'s reason. */
  .manager-tools-row-inherit {
    color: var(--fab-text-subtle);
    font-size: 0.6rem;
    font-weight: 600;
    white-space: nowrap;
  }

  .manager-tools-row-inherit.is-overridden {
    color: var(--fab-warning-text);
  }

  /* The stat chip is the FACT and reads one rung brighter than the sentence beside it. `:global()`
     is required and is not a loosening: `Chip.svelte` writes the element, so a class handed to it as
     a prop never carries this block's scoping attribute. The ANCESTOR half stays local. */
  .manager-tools-library-chips :global(.manager-tools-breakage-chip) {
    color: var(--fab-text-secondary);
  }

  /* The way out of the zero state. A column, so a long localized label does not squeeze the two
     routes onto one row. */
  .manager-tools-empty-actions {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* A world Tool with no rules here is present but not adopted, and reads that way.

     IT DECLARES NO `background`, AND THAT IS THE WHOLE OF THE RULE (issue 1373). It used to declare
     `background: transparent`, which is this file's layer trap: `styles/fabricate.css` is imported
     at `layer(modules)` and this block is UNLAYERED, so it beat the sheet's
     `.manager-tools-library-list > article.is-selected` fill while NOT beating its `border-color` —
     a chosen unadopted row drew an accent edge around no fill. Ceding the declaration rather than
     out-specifying it keeps both selected fills arbitrated in the sheet, in one place. Nothing about
     the resting row moves: the sheet already clears that fill for this route. `opacity` was always
     what said "not adopted". `tool-rules-list-parity.test.js` measures all four combinations. */
  .manager-tools-row.is-unadopted {
    opacity: 0.72;
  }
</style>
