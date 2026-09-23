<!-- Svelte 5 runes mode -->
<!--
  The rail's world section: its heading row, the four world scoped-entity catalogue leaves, the
  Parties leaf, and the Travel, Rules & Resources and Downtime groups (issue 1717).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `navRail` | the `navRailModel` instance | — | supplies group expansion, the locks and `toggleGroup` |
  | `worldScopedCounts` | `{components, vocabulary, essences, tools}` | `{}` | one count per catalogue leaf, keyed by `WORLD_CATALOGUE_LEAVES[].countKey` |
  | `downtimeNavLabelId` | `(tabId) => string` | — | forwarded to the Downtime group; the root mints it because the Downtime host stamps it too |

  Invariants:
  - The four catalogue leaves render from one `{#each}` over a frozen table and emit the markup
    the four authored copies did — their shape pinned by the rail census in
    `tests/components/manager-rail-mounted.js`, and each leaf's `countKey` by
    `tests/components/manager-world-scope-mounted.js`, whose fixture gives the four columns
    distinct values.
-->
<script>
  import ManagerWorldDowntimeNavGroup from './ManagerWorldDowntimeNavGroup.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    navRail,
    currentView = '',
    setView = () => {},
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

  // One sentence for all five groups, and deliberately generic: the Downtime group's children
  // come from whichever provider holds the surface, so this cannot name a section.
  const railGroupLockedTitle = $derived(
    text(
      'FABRICATE.Admin.Manager.Nav.LockedOpen',
      'This section stays open while you are on one of its pages.'
    )
  );

  // The four world scoped-entity leaves (issue 1362, epic 1357), authored once: `routes` is the
  // set of views the leaf owns and `countKey` its column in `worldScopedCounts`.
  const WORLD_CATALOGUE_LEAVES = Object.freeze([
    {
      id: 'manager-world-nav-component-catalogue',
      dataToken: 'component-catalogue',
      icon: 'fas fa-cubes-stacked',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.ComponentCatalogueTitle',
      labelFallback: 'Component catalogue',
      routes: ['world-components', 'world-component-entry'],
      countKey: 'components',
    },
    {
      id: 'manager-world-nav-vocabulary',
      dataToken: 'vocabulary',
      icon: 'fas fa-tags',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.VocabularyTitle',
      labelFallback: 'Tags & Categories',
      routes: ['world-vocabulary'],
      countKey: 'vocabulary',
    },
    {
      id: 'manager-world-nav-essence-catalogue',
      dataToken: 'essence-catalogue',
      icon: 'fas fa-flask-vial',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.EssenceCatalogueTitle',
      labelFallback: 'Essence Catalogue',
      routes: ['world-essences', 'world-essence-entry'],
      countKey: 'essences',
    },
    {
      id: 'manager-world-nav-tool-catalogue',
      dataToken: 'tool-catalogue',
      icon: 'fas fa-screwdriver-wrench',
      labelKey: 'FABRICATE.Admin.Manager.Scoped.ToolCatalogueTitle',
      labelFallback: 'Tools Catalogue',
      routes: ['world-tools', 'world-tool-entry'],
      countKey: 'tools',
    },
  ]);
</script>

<section class="manager-world-nav" data-world-nav-section aria-labelledby="manager-world-heading">
  <div class="manager-world-heading-row">
    <h2 id="manager-world-heading">
      {text('FABRICATE.Admin.Manager.World.Heading', 'WORLD')}
    </h2>
    <span id="manager-world-scope">
      {text('FABRICATE.Admin.Manager.World.Scope', 'every system')}
    </span>
  </div>
  {#each WORLD_CATALOGUE_LEAVES as leaf (leaf.id)}
    {@const isActive = leaf.routes.includes(currentView)}
    <button
      type="button"
      class={`manager-nav-button manager-world-nav-item ${isActive ? 'is-active' : ''}`}
      id={leaf.id}
      data-world-nav-item={leaf.dataToken}
      aria-label={text(leaf.labelKey, leaf.labelFallback)}
      aria-current={isActive ? 'page' : undefined}
      onclick={() => setView(leaf.routes[0])}
    >
      <i class={leaf.icon} aria-hidden="true"></i>
      <span class="manager-nav-label">
        {text(leaf.labelKey, leaf.labelFallback)}
      </span>
      <span class="manager-nav-count">{worldScopedCounts[leaf.countKey]}</span>
    </button>
  {/each}
  <button
    type="button"
    class={`manager-nav-button manager-world-nav-item ${isWorldRoute ? 'is-active' : ''}`}
    id="manager-world-nav-parties"
    data-world-nav-item="parties"
    aria-label={text('FABRICATE.Admin.Manager.Travel.Tabs.Parties', 'Parties')}
    aria-current={isWorldRoute ? 'page' : undefined}
    onclick={openWorldParties}
  >
    <i class="fas fa-users" aria-hidden="true"></i>
    <span class="manager-nav-label">
      {text('FABRICATE.Admin.Manager.Travel.Tabs.Parties', 'Parties')}
    </span>
    <span class="manager-nav-count">{travelParties.length}</span>
  </button>
  <!--
    World > Travel (issue 1282).
  -->
  <div
    class={`manager-nav-group manager-world-travel-group ${navRail.expanded.worldTravel ? 'is-expanded' : ''}`}
    data-world-travel-section
  >
    <button
      type="button"
      class={`manager-nav-button manager-nav-parent manager-world-nav-item ${isWorldTravelRoute ? 'is-active' : ''}`}
      id="manager-world-nav-travel"
      data-world-nav-item="travel"
      aria-label={text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel')}
      aria-current={isWorldTravelRoute ? 'page' : undefined}
      aria-controls="manager-travel-submenu"
      aria-expanded={navRail.expanded.worldTravel}
      onclick={activateWorldTravelParent}
    >
      <i class="fas fa-route" aria-hidden="true"></i>
      <span class="manager-nav-label">
        {text('FABRICATE.Admin.Manager.World.TravelNav', 'Travel')}
      </span>
      <span class="manager-nav-count">{worldRealms.length}</span>
    </button>
    <button
      type="button"
      class="manager-nav-toggle"
      id="manager-travel-toggle"
      data-world-travel-toggle
      aria-label={navRail.expanded.worldTravel
        ? text('FABRICATE.Admin.Manager.World.CollapseTravel', 'Collapse Travel')
        : text('FABRICATE.Admin.Manager.World.ExpandTravel', 'Expand Travel')}
      aria-controls="manager-travel-submenu"
      aria-expanded={navRail.expanded.worldTravel}
      disabled={navRail.lockedOpen.worldTravel}
      aria-disabled={navRail.lockedOpen.worldTravel}
      title={navRail.lockedOpen.worldTravel ? railGroupLockedTitle : undefined}
      onclick={(event) => navRail.toggleGroup('worldTravel', event)}
    >
      <i
        class={navRail.expanded.worldTravel ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
        aria-hidden="true"
      ></i>
    </button>
    {#if navRail.expanded.worldTravel}
      <div
        class="manager-nav-submenu"
        id="manager-travel-submenu"
        data-world-travel-submenu
        aria-label={text('FABRICATE.Admin.Manager.World.TravelDestinations', 'Travel destinations')}
      >
        <button
          type="button"
          class={`manager-nav-subitem ${isWorldTravelRoute && worldTravelTab === 'realms' ? 'is-active' : ''}`}
          id="manager-travel-nav-realms"
          data-world-travel-item="realms"
          aria-current={isWorldTravelRoute && worldTravelTab === 'realms' ? 'page' : undefined}
          onclick={() => openWorldTravelDestination('realms')}
        >
          <i class="fas fa-mountain-sun" aria-hidden="true"></i>
          <span class="manager-nav-label">
            {text('FABRICATE.Admin.Manager.Travel.Tabs.Realms', 'Realms')}
          </span>
        </button>
        <button
          type="button"
          class={`manager-nav-subitem ${isWorldTravelRoute && worldTravelTab === 'map' ? 'is-active' : ''}`}
          id="manager-travel-nav-map"
          data-world-travel-item="map"
          aria-current={isWorldTravelRoute && worldTravelTab === 'map' ? 'page' : undefined}
          onclick={() => openWorldTravelDestination('map')}
        >
          <i class="fas fa-map-location-dot" aria-hidden="true"></i>
          <span class="manager-nav-label">
            {text('FABRICATE.Admin.Manager.Travel.Tabs.MapLinks', 'Map Region Links')}
          </span>
        </button>
      </div>
    {/if}
  </div>
  <!--
    World > Rules & Resources (issue 1311).
  -->
  <div
    class={`manager-nav-group manager-world-rules-group ${navRail.expanded.worldRules ? 'is-expanded' : ''}`}
    data-world-rules-section
  >
    <button
      type="button"
      class={`manager-nav-button manager-nav-parent manager-world-nav-item ${isWorldRulesRoute ? 'is-active' : ''}`}
      id="manager-world-nav-rules"
      data-world-nav-item="rules"
      aria-label={text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources')}
      aria-current={isWorldRulesRoute ? 'page' : undefined}
      aria-controls="manager-rules-submenu"
      aria-expanded={navRail.expanded.worldRules}
      onclick={activateWorldRulesParent}
    >
      <i class="fas fa-scale-balanced" aria-hidden="true"></i>
      <span class="manager-nav-label">
        {text('FABRICATE.Admin.Manager.World.RulesNav', 'Rules & Resources')}
      </span>
      <span class="manager-nav-count">
        {selectedCurrencyUnits.length +
          selectedCharacterPrerequisites.length +
          selectedSystemModifiers.length}
      </span>
    </button>
    <button
      type="button"
      class="manager-nav-toggle"
      id="manager-rules-toggle"
      data-world-rules-toggle
      aria-label={navRail.expanded.worldRules
        ? text('FABRICATE.Admin.Manager.World.CollapseRules', 'Collapse Rules & Resources')
        : text('FABRICATE.Admin.Manager.World.ExpandRules', 'Expand Rules & Resources')}
      aria-controls="manager-rules-submenu"
      aria-expanded={navRail.expanded.worldRules}
      disabled={navRail.lockedOpen.worldRules}
      aria-disabled={navRail.lockedOpen.worldRules}
      title={navRail.lockedOpen.worldRules ? railGroupLockedTitle : undefined}
      onclick={(event) => navRail.toggleGroup('worldRules', event)}
    >
      <i
        class={navRail.expanded.worldRules ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
        aria-hidden="true"
      ></i>
    </button>
    {#if navRail.expanded.worldRules}
      <div
        class="manager-nav-submenu"
        id="manager-rules-submenu"
        data-world-rules-submenu
        aria-label={text('FABRICATE.Admin.Manager.World.RulesDestinations', 'Rules & Resources')}
      >
        <button
          type="button"
          class={`manager-nav-subitem ${isWorldCurrencyRoute ? 'is-active' : ''}`}
          id="manager-rules-nav-currency"
          data-world-rules-item="currency"
          aria-current={isWorldCurrencyRoute ? 'page' : undefined}
          onclick={() => openWorldRulesDestination('currency')}
        >
          <i class="fas fa-coins" aria-hidden="true"></i>
          <span class="manager-nav-label">
            {text('FABRICATE.Admin.Manager.World.CurrencyNav', 'Currency')}
          </span>
        </button>
        <button
          type="button"
          class={`manager-nav-subitem ${isWorldPrerequisitesRoute ? 'is-active' : ''}`}
          id="manager-rules-nav-prerequisites"
          data-world-rules-item="prerequisites"
          aria-current={isWorldPrerequisitesRoute ? 'page' : undefined}
          onclick={() => openWorldRulesDestination('prerequisites')}
        >
          <i class="fas fa-user-shield" aria-hidden="true"></i>
          <span class="manager-nav-label">
            {text(
              'FABRICATE.Admin.Manager.CharacterPrerequisites.Title',
              'Character prerequisites'
            )}
          </span>
        </button>
        <button
          type="button"
          class={`manager-nav-subitem ${isWorldModifiersRoute ? 'is-active' : ''}`}
          id="manager-rules-nav-modifiers"
          data-world-rules-item="modifiers"
          aria-current={isWorldModifiersRoute ? 'page' : undefined}
          onclick={() => openWorldRulesDestination('modifiers')}
        >
          <i class="fas fa-user-gear" aria-hidden="true"></i>
          <span class="manager-nav-label">
            {text('FABRICATE.Admin.Manager.Modifiers.Title', 'Modifiers')}
          </span>
        </button>
      </div>
    {/if}
  </div>
  <ManagerWorldDowntimeNavGroup
    {navRail}
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
</section>
