<!-- Svelte 5 runes mode -->
<!--
  The rail's crafting-system entries: System Overview, the Crafting, Checks and Gathering groups,
  the four rule leaves, and the disabled placeholder row (issue 1717, extracted from the root).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `navRail` | the `navRailModel` instance | — | supplies group expansion, the locks and `toggleGroup` |
  | `experimentalFeaturesEnabled` | `boolean` | `false` | gates the Graph placeholder, which `isViewAvailableForSystem` reads |
  | `craftingNavItems` / `checksNavItems` / `visibleGatheringNavItems` | entry arrays | `[]` | built by the root and the checks route model |

  Invariants:
  - The rail id and its label are authored three lines apart here, because
    `tests/foundry-manager-rail-hooks.test.js` requires every declared id to resolve in a file
    that renders `manager-nav-button`, with its label inside the same window.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    navRail,
    selectedSystem = null,
    currentView = '',
    setView = () => {},
    editSystem = () => {},
    systemOverviewCount = 0,
    isCraftingRoute = false,
    activateCraftingParent = () => {},
    craftingNavCount = 0,
    craftingNavItems = [],
    activeCraftingTab = '',
    openCraftingSection = () => {},
    selectedCounts = {},
    tagCategoryCounts = {},
    canShowEssences = false,
    toolsNavCount = 0,
    isChecksRoute = false,
    activateChecksParent = () => {},
    checksNavCount = 0,
    checksNavItems = [],
    canShowEnvironments = false,
    isGatheringRoute = false,
    activateGatheringParent = () => {},
    gatheringNavCounts = {},
    visibleGatheringNavItems = [],
    displayedGatheringTab = '',
    openGatheringSection = () => {},
    experimentalFeaturesEnabled = false,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // One sentence for all five groups, and deliberately generic: the Downtime group's children
  // come from whichever provider holds the surface, so this cannot name a section.
  const railGroupLockedTitle = $derived(
    text(
      'FABRICATE.Admin.Manager.Nav.LockedOpen',
      'This section stays open while you are on one of its pages.'
    )
  );

  // The Graph surface (issue 442) is unimplemented; it stays a disabled placeholder
  // and, as of issue 745, renders only when experimental features are enabled.
  const placeholderViews = [
    {
      id: 'graph',
      // The rail id as a complete literal, never a `manager-nav-${view.id}` template: both
      // harnesses target rail entries by id and an interpolated one is invisible to the gate.
      navId: 'manager-nav-graph',
      icon: 'fas fa-project-diagram',
      labelKey: 'FABRICATE.Admin.Manager.Nav.Graph',
      fallback: 'Graph',
    },
  ];

  function isViewAvailableForSystem(view, system) {
    // Issue 745: the Graph placeholder is advertised only behind the experimental toggle.
    if (view.id === 'graph') return experimentalFeaturesEnabled;
    if (!view.feature) return true;
    return system?.features?.[view.feature] === true;
  }

  const visiblePlaceholderViews = $derived(
    selectedSystem
      ? placeholderViews.filter((view) => isViewAvailableForSystem(view, selectedSystem))
      : []
  );

  function checksIssueName(count) {
    const key = count === 1 ? 'IssueCountOne' : 'IssueCountOther';
    const fallback = count === 1 ? '{count} issue' : '{count} issues';
    return text(`FABRICATE.Admin.Manager.Checks.Sections.${key}`, fallback).replace(
      '{count}',
      String(count)
    );
  }
</script>

{#if selectedSystem}
  <button
    type="button"
    class={`manager-nav-button ${currentView === 'system-edit' ? 'is-active' : ''}`}
    id="manager-nav-system-overview"
    aria-current={currentView === 'system-edit' ? 'page' : undefined}
    data-nav-system-edit
    onclick={() => editSystem(selectedSystem.id)}
  >
    <i class="fas fa-clipboard-check" aria-hidden="true"></i>
    <span class="manager-nav-label"
      >{text('FABRICATE.Admin.Manager.SystemEdit.Nav', 'System Overview')}</span
    >
    {#if systemOverviewCount > 0}
      <span
        class="manager-nav-count"
        aria-label={text(
          'FABRICATE.Admin.Manager.SystemOverview.CountBadgeAria',
          'Open validation issues'
        )}>{systemOverviewCount}</span
      >
    {/if}
  </button>
  <!--
    Crafting group is unconditional as of issue 745 (v1.3 headline).
  -->
  <div class={`manager-nav-group ${navRail.expanded.crafting ? 'is-expanded' : ''}`}>
    <button
      type="button"
      class="manager-nav-button manager-nav-parent"
      id="manager-nav-crafting"
      aria-current={isCraftingRoute ? 'page' : undefined}
      aria-expanded={navRail.expanded.crafting}
      onclick={activateCraftingParent}
    >
      <i class="fas fa-hammer" aria-hidden="true"></i>
      <span class="manager-nav-label"
        >{text('FABRICATE.Admin.Manager.Nav.Crafting', 'Crafting')}</span
      >
      <span class="manager-nav-count">{craftingNavCount}</span>
    </button>
    <!--
      Locked ⇒ genuinely `disabled`, with the reason on the control.
    -->
    <button
      type="button"
      class="manager-nav-toggle"
      aria-label={navRail.expanded.crafting
        ? text('FABRICATE.Admin.Manager.Nav.CollapseCrafting', 'Collapse crafting menu')
        : text('FABRICATE.Admin.Manager.Nav.ExpandCrafting', 'Expand crafting menu')}
      aria-controls="manager-crafting-submenu"
      aria-expanded={navRail.expanded.crafting}
      disabled={navRail.lockedOpen.crafting}
      aria-disabled={navRail.lockedOpen.crafting}
      title={navRail.lockedOpen.crafting ? railGroupLockedTitle : undefined}
      onclick={(event) => navRail.toggleGroup('crafting', event)}
    >
      <i
        class={navRail.expanded.crafting ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
        aria-hidden="true"
      ></i>
    </button>
    {#if navRail.expanded.crafting}
      <div
        class="manager-nav-submenu"
        id="manager-crafting-submenu"
        aria-label={text(
          'FABRICATE.Admin.Manager.Crafting.CraftingTabs.Label',
          'Crafting sections'
        )}
      >
        {#each craftingNavItems as craftingItem (craftingItem.id)}
          <button
            type="button"
            class={`manager-nav-subitem ${isCraftingRoute && activeCraftingTab === craftingItem.id ? 'is-active' : ''}`}
            id={`manager-crafting-nav-${craftingItem.id}`}
            aria-current={isCraftingRoute && activeCraftingTab === craftingItem.id
              ? 'page'
              : undefined}
            onclick={() => openCraftingSection(craftingItem.id)}
          >
            <i class={craftingItem.icon} aria-hidden="true"></i>
            <span class="manager-nav-label"
              >{text(craftingItem.labelKey, craftingItem.labelFallback)}</span
            >
            {#if craftingItem.count != null}
              <span class="manager-nav-count">{craftingItem.count}</span>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  <!-- A screen title, not a domain noun (issue 1362). -->
  <button
    type="button"
    class={`manager-nav-button ${currentView === 'components' || currentView === 'component-edit' ? 'is-active' : ''}`}
    id="manager-nav-component-rules"
    aria-current={currentView === 'components' || currentView === 'component-edit'
      ? 'page'
      : undefined}
    onclick={() => setView('components')}
  >
    <i class="fas fa-boxes" aria-hidden="true"></i>
    <span class="manager-nav-label"
      >{text('FABRICATE.Admin.Manager.Nav.ComponentRules', 'Component Rules')}</span
    >
    <span class="manager-nav-count">{selectedCounts.components}</span>
  </button>
  <button
    type="button"
    class={`manager-nav-button ${currentView === 'tags' ? 'is-active' : ''}`}
    id="manager-nav-tags"
    aria-current={currentView === 'tags' ? 'page' : undefined}
    onclick={() => setView('tags')}
  >
    <i class="fas fa-tags" aria-hidden="true"></i>
    <span class="manager-nav-label"
      >{text('FABRICATE.Admin.Manager.Nav.TagsCategories', 'Tags & Categories')}</span
    >
    <!--
      The rail badge is the whole screen's vocabulary.
    -->
    <span class="manager-nav-count"
      >{tagCategoryCounts.recipeCategories +
        tagCategoryCounts.componentCategories +
        tagCategoryCounts.itemTags}</span
    >
  </button>
  {#if canShowEssences}
    <button
      type="button"
      class={`manager-nav-button ${currentView === 'essences' || currentView === 'essence-edit' ? 'is-active' : ''}`}
      id="manager-nav-essence-rules"
      aria-current={currentView === 'essences' || currentView === 'essence-edit'
        ? 'page'
        : undefined}
      onclick={() => setView('essences')}
    >
      <i class="fas fa-mortar-pestle" aria-hidden="true"></i>
      <span class="manager-nav-label"
        >{text('FABRICATE.Admin.Manager.Nav.EssenceRules', 'Essence Rules')}</span
      >
      <span class="manager-nav-count">{selectedCounts.essences}</span>
    </button>
  {/if}
  <button
    type="button"
    class={`manager-nav-button ${currentView === 'tools' || currentView === 'tool-edit' ? 'is-active' : ''}`}
    id="manager-nav-tool-rules"
    aria-current={currentView === 'tools' || currentView === 'tool-edit' ? 'page' : undefined}
    onclick={() => setView('tools')}
  >
    <i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
    <span class="manager-nav-label"
      >{text('FABRICATE.Admin.Manager.Nav.ToolRules', 'Tool Rules')}</span
    >
    <!-- No zero badge on this row (issue 1373): the count renders only where there is
         something to count. -->
    {#if toolsNavCount > 0}
      <span class="manager-nav-count">{toolsNavCount}</span>
    {/if}
  </button>
  <div class={`manager-nav-group ${navRail.expanded.checks ? 'is-expanded' : ''}`}>
    <button
      type="button"
      class={`manager-nav-button manager-nav-parent ${isChecksRoute ? 'is-active' : ''}`}
      id="manager-nav-checks"
      aria-current={isChecksRoute ? 'page' : undefined}
      aria-expanded={navRail.expanded.checks}
      onclick={activateChecksParent}
    >
      <i class="fas fa-dice-d20" aria-hidden="true"></i>
      <span class="manager-nav-label">{text('FABRICATE.Admin.Manager.Nav.Checks', 'Checks')}</span>
      <!-- An issue count, not a record count, so it wears the pill and names its unit; a
           collapsed rail still renders it, being the only signal left. -->
      {#if checksNavCount > 0}
        <span
          class="manager-nav-issue-badge"
          data-checks-nav-issues="checks"
          role="img"
          aria-label={checksIssueName(checksNavCount)}>{checksNavCount}</span
        >
      {/if}
    </button>
    <button
      type="button"
      class="manager-nav-toggle"
      aria-label={navRail.expanded.checks
        ? text('FABRICATE.Admin.Manager.Nav.CollapseChecks', 'Collapse checks menu')
        : text('FABRICATE.Admin.Manager.Nav.ExpandChecks', 'Expand checks menu')}
      aria-controls="manager-checks-submenu"
      aria-expanded={navRail.expanded.checks}
      disabled={navRail.lockedOpen.checks}
      aria-disabled={navRail.lockedOpen.checks}
      title={navRail.lockedOpen.checks ? railGroupLockedTitle : undefined}
      onclick={(event) => navRail.toggleGroup('checks', event)}
    >
      <i
        class={navRail.expanded.checks ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
        aria-hidden="true"
      ></i>
    </button>
    {#if navRail.expanded.checks}
      <div
        class="manager-nav-submenu"
        id="manager-checks-submenu"
        aria-label={text('FABRICATE.Admin.Manager.Checks.Tabs.Label', 'Checks sections')}
      >
        {#each checksNavItems as checksItem (checksItem.id)}
          <button
            type="button"
            class={`manager-nav-subitem ${currentView === checksItem.view ? 'is-active' : ''}`}
            id={`manager-checks-nav-${checksItem.id}`}
            data-checks-nav-item={checksItem.id}
            aria-current={currentView === checksItem.view ? 'page' : undefined}
            onclick={() => setView(checksItem.view)}
          >
            <i class={checksItem.icon} aria-hidden="true"></i>
            <span class="manager-nav-label"
              >{text(checksItem.labelKey, checksItem.labelFallback)}</span
            >
            <!-- Three markers can land in this column and must stay distinguishable: a
                 record count, an issue badge naming its unit, and an unsaved marker of
                 its own shape. -->
            {#if checksItem.dirty}
              <span
                class="manager-nav-dirty-marker"
                data-checks-nav-dirty={checksItem.id}
                role="img"
                aria-label={text('FABRICATE.Admin.Manager.Checks.Nav.Unsaved', 'Unsaved changes')}
              ></span>
            {/if}
            {#if checksItem.issueCount > 0}
              <span
                class="manager-nav-issue-badge"
                data-checks-nav-issues={checksItem.id}
                role="img"
                aria-label={checksIssueName(checksItem.issueCount)}>{checksItem.issueCount}</span
              >
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
  {#if canShowEnvironments}
    <div class={`manager-nav-group ${navRail.expanded.gathering ? 'is-expanded' : ''}`}>
      <button
        type="button"
        class="manager-nav-button manager-nav-parent"
        id="manager-nav-gathering"
        aria-current={isGatheringRoute ? 'page' : undefined}
        aria-expanded={navRail.expanded.gathering}
        onclick={activateGatheringParent}
      >
        <i class="fas fa-seedling" aria-hidden="true"></i>
        <span class="manager-nav-label"
          >{text('FABRICATE.Admin.Manager.Nav.Environments', 'Gathering')}</span
        >
        <span class="manager-nav-count">{gatheringNavCounts.total}</span>
      </button>
      <button
        type="button"
        class="manager-nav-toggle"
        aria-label={navRail.expanded.gathering
          ? text('FABRICATE.Admin.Manager.Nav.CollapseGathering', 'Collapse gathering menu')
          : text('FABRICATE.Admin.Manager.Nav.ExpandGathering', 'Expand gathering menu')}
        aria-controls="manager-gathering-submenu"
        aria-expanded={navRail.expanded.gathering}
        disabled={navRail.lockedOpen.gathering}
        aria-disabled={navRail.lockedOpen.gathering}
        title={navRail.lockedOpen.gathering ? railGroupLockedTitle : undefined}
        onclick={(event) => navRail.toggleGroup('gathering', event)}
      >
        <i
          class={navRail.expanded.gathering ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
          aria-hidden="true"
        ></i>
      </button>
      {#if navRail.expanded.gathering}
        <div
          class="manager-nav-submenu"
          id="manager-gathering-submenu"
          aria-label={text(
            'FABRICATE.Admin.Manager.Environment.GatheringTabs.Label',
            'Gathering sections'
          )}
        >
          {#each visibleGatheringNavItems as gatheringItem (gatheringItem.id)}
            <button
              type="button"
              class={`manager-nav-subitem ${isGatheringRoute && displayedGatheringTab === gatheringItem.id ? 'is-active' : ''}`}
              id={`manager-gathering-nav-${gatheringItem.id}`}
              aria-current={isGatheringRoute && displayedGatheringTab === gatheringItem.id
                ? 'page'
                : undefined}
              onclick={() => openGatheringSection(gatheringItem.id)}
            >
              <i class={gatheringItem.icon} aria-hidden="true"></i>
              <span class="manager-nav-label"
                >{text(gatheringItem.labelKey, gatheringItem.labelFallback)}</span
              >
              {#if gatheringNavCounts[gatheringItem.id] != null}
                <span class="manager-nav-count">{gatheringNavCounts[gatheringItem.id]}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
{/if}
{#each visiblePlaceholderViews as view (view.labelKey)}
  <!-- A stable id here too (issue 1362). Both harnesses target every rail entry by id,
       and a planned-view placeholder is still a rail entry the smoke's membership loop
       names. -->
  <button
    type="button"
    class="manager-nav-button"
    id={view.navId}
    disabled
    title={text(
      'FABRICATE.Admin.Manager.PlannedView',
      '{view} is planned for a future release.'
    ).replace('{view}', text(view.labelKey, view.fallback))}
  >
    <i class={view.icon} aria-hidden="true"></i>
    <span class="manager-nav-label">{text(view.labelKey, view.fallback)}</span>
    <!-- Not a rail marker: a record count is a numeral, and "Soon" is a word on a row with
         no records, so it takes `.manager-nav-planned` rather than the count (issue 1515). -->
    <span class="manager-nav-planned">{text('FABRICATE.Admin.Manager.Soon', 'Soon')}</span>
  </button>
{/each}
