<!-- Svelte 5 runes mode -->
<!--
  The manager's navigation rail: the aside itself, its section label, the crafting-system scope
  card with the collapse toggle, and the nav shell that renders the system and world entry units
  (issue 1717, extracted from the root).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `navRail` | the `navRailModel` instance | — | the rail's own expansion, collapse and lock state; built by the root, which also writes to it |
  | `systems` | the selectable crafting systems | `[]` | the scope select's options, in the order the store publishes them |

  Every other prop is forwarded unchanged to `ManagerSystemNav` or `ManagerWorldNav`.

  Invariants:
  - Every rail-toggle attribute reads `navRail.collapsedDisplay`, never the stored preference, so
    a locked-open rail does not un-collapse every other route — pinned by
    `tests/components/manager-downtime-mounted.js`.
  - The toggle is written twice, once per scope-card branch, and both sites carry the same state
    attributes — pinned by `tests/components/manager-contract.test.js`.
-->
<script>
  import ManagerSystemNav from './ManagerSystemNav.svelte';
  import ManagerWorldNav from './ManagerWorldNav.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    navRail,
    systems = [],
    selectedSystem = null,
    currentView = '',
    changeScopeSystem = () => {},
    backToSystemsBrowser = () => {},
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
    worldScopedCounts = {},
    isWorldRoute = false,
    openWorldParties = () => {},
    travelParties = [],
    isWorldTravelRoute = false,
    activateWorldTravelParent = () => {},
    worldRealms = [],
    worldTravelTab = '',
    openWorldTravelDestination = () => {},
    isWorldRulesRoute = false,
    activateWorldRulesParent = () => {},
    selectedCurrencyUnits = [],
    selectedCharacterPrerequisites = [],
    selectedSystemModifiers = [],
    isWorldCurrencyRoute = false,
    isWorldPrerequisitesRoute = false,
    isWorldModifiersRoute = false,
    openWorldRulesDestination = () => {},
    worldDowntimeAvailable = false,
    isWorldDowntimeRoute = false,
    downtimeCoreFallback = true,
    downtimeTabs = [],
    downtimeNavTabBadges = null,
    downtimeTabText = () => '',
    downtimeNavLabelId = () => '',
    worldDowntimeTabId = '',
    openWorldDowntime = () => {},
    openWorldDowntimePreview = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Every rail-toggle attribute reads the display value, never the stored one.
  const railToggleLabel = $derived(
    navRail.collapsedDisplay
      ? text('FABRICATE.Admin.Manager.Nav.ExpandRail', 'Expand navigation rail')
      : text('FABRICATE.Admin.Manager.Nav.CollapseRail', 'Collapse navigation rail')
  );
  // Its own string, not the group lock's: `Nav.LockedOpen` is section-worded and wrong for the
  // whole sidebar.
  const railToggleTitle = $derived(
    navRail.railLockedOpen
      ? text('FABRICATE.Admin.Manager.Nav.RailLockedOpen', 'The sidebar stays open on this page.')
      : railToggleLabel
  );
  const railToggleIcon = $derived(
    navRail.collapsedDisplay ? 'fas fa-angles-right' : 'fas fa-angles-left'
  );
</script>

<aside
  class="manager-rail"
  aria-label={text('FABRICATE.Admin.Manager.Navigation', 'Crafting manager navigation')}
>
  <!--
    Name the workspace before its scope controls. Every manager route.
  -->
  <p class="manager-rail-title" data-manager-rail-section>
    {text('FABRICATE.Admin.Manager.Nav.SectionLabel', 'GM management')}
  </p>

  <!--
    The rail's crafting-system card.
  -->
  <section
    class="manager-rail-block"
    aria-label={text('FABRICATE.Admin.Manager.ManagerScope', 'Manager scope')}
  >
    {#if selectedSystem}
      <div class="manager-scope-card">
        <div class="manager-scope-card-head">
          <p class="manager-kicker">
            {text('FABRICATE.Admin.Manager.CraftingSystem', 'Crafting system')}
          </p>
          <button
            type="button"
            class="manager-rail-toggle manager-scope-collapse"
            data-manager-rail-toggle
            aria-pressed={navRail.collapsedDisplay}
            aria-label={railToggleLabel}
            title={railToggleTitle}
            disabled={navRail.railLockedOpen}
            aria-disabled={navRail.railLockedOpen}
            onclick={navRail.toggleRail}
          >
            <i class={railToggleIcon} aria-hidden="true"></i>
          </button>
        </div>
        <select
          class="manager-scope-select"
          data-manager-scope-select
          value={selectedSystem.id}
          aria-label={text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}
          onchange={(event) => changeScopeSystem(event.currentTarget.value)}
        >
          {#each systems as system (system.id)}
            <option value={system.id}>{system.name}</option>
          {/each}
        </select>
        <!--
          The systems browser IS the destination this link returns to.
        -->
        <button
          type="button"
          class={`manager-scope-return ${currentView === 'systems' ? 'is-disabled' : ''}`}
          disabled={currentView === 'systems'}
          aria-disabled={currentView === 'systems'}
          aria-label={text(
            'FABRICATE.Admin.Manager.ReturnToSystemLibrary',
            'Return to System Library'
          )}
          title={text('FABRICATE.Admin.Manager.ReturnToSystemLibrary', 'Return to System Library')}
          onclick={backToSystemsBrowser}
        >
          <i class="fas fa-arrow-left-long" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.AllCraftingSystems', 'All crafting systems')}</span>
        </button>
      </div>
    {:else}
      <div class="manager-scope-card">
        <div class="manager-scope-card-head">
          <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Product', 'Fabricate')}</p>
          <button
            type="button"
            class="manager-rail-toggle manager-scope-collapse"
            data-manager-rail-toggle
            aria-pressed={navRail.collapsedDisplay}
            aria-label={railToggleLabel}
            title={railToggleTitle}
            disabled={navRail.railLockedOpen}
            aria-disabled={navRail.railLockedOpen}
            onclick={navRail.toggleRail}
          >
            <i class={railToggleIcon} aria-hidden="true"></i>
          </button>
        </div>
        <h2 class="manager-title">
          {text('FABRICATE.Admin.Manager.Nav.Systems', 'Crafting Systems')}
        </h2>
      </div>
    {/if}
  </section>

  <nav
    class="manager-nav"
    aria-label={text('FABRICATE.Admin.Manager.ManagerSections', 'Manager sections')}
  >
    <ManagerSystemNav
      {navRail}
      {selectedSystem}
      {currentView}
      {setView}
      {editSystem}
      {systemOverviewCount}
      {isCraftingRoute}
      {activateCraftingParent}
      {craftingNavCount}
      {craftingNavItems}
      {activeCraftingTab}
      {openCraftingSection}
      {selectedCounts}
      {tagCategoryCounts}
      {canShowEssences}
      {toolsNavCount}
      {isChecksRoute}
      {activateChecksParent}
      {checksNavCount}
      {checksNavItems}
      {canShowEnvironments}
      {isGatheringRoute}
      {activateGatheringParent}
      {gatheringNavCounts}
      {visibleGatheringNavItems}
      {displayedGatheringTab}
      {openGatheringSection}
      {experimentalFeaturesEnabled}
    />
    <ManagerWorldNav
      {navRail}
      {currentView}
      {setView}
      {worldScopedCounts}
      {isWorldRoute}
      {openWorldParties}
      {travelParties}
      {isWorldTravelRoute}
      {activateWorldTravelParent}
      {worldRealms}
      {worldTravelTab}
      {openWorldTravelDestination}
      {isWorldRulesRoute}
      {activateWorldRulesParent}
      {selectedCurrencyUnits}
      {selectedCharacterPrerequisites}
      {selectedSystemModifiers}
      {isWorldCurrencyRoute}
      {isWorldPrerequisitesRoute}
      {isWorldModifiersRoute}
      {openWorldRulesDestination}
      {worldDowntimeAvailable}
      {isWorldDowntimeRoute}
      {downtimeCoreFallback}
      {downtimeTabs}
      {downtimeNavTabBadges}
      {downtimeTabText}
      {downtimeNavLabelId}
      {worldDowntimeTabId}
      {openWorldDowntime}
      {openWorldDowntimePreview}
    />
  </nav>
</aside>
