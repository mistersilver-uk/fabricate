<!-- Svelte 5 runes mode -->
<!--
  The world rail's Downtime group: the parent row with its premium chip and rollup badge, the
  disclosure, and one sub-item per preview tab (issue 1717, extracted from the root).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `navRail` | the `navRailModel` instance | — | supplies `expanded`/`lockedOpen`/`collapsedDisplay`/`railLockedOpen` and `toggleGroup` |
  | `downtimeTabText` | `(tab, field) => string` | — | localizes a tab field in Core mode and passes a companion's own copy through |
  | `downtimeNavLabelId` | `(tabId) => string` | — | the root's own id minter, because the Downtime host stamps the same id outside the rail |

  Invariants:
  - The rollup renders only while the children are hidden — both disjuncts of
    `downtimeNavRollupVisible` are load-bearing, pinned by `tests/components/manager-downtime-mounted.js`.
  - The reveal effect stays with the `bind:this` registry it reads; neither crosses a prop boundary.
-->
<script>
  import { resolveNavTabBadge, navTabBadgeTotal } from '../../../navTabBadgeStore.js';
  import { localize } from '../../util/foundryBridge.js';

  let {
    navRail,
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

  // ONE sentence for all five groups, and deliberately generic: the Downtime group's
  // children come from whichever provider holds the surface, so this cannot name a section.
  const railGroupLockedTitle = $derived(
    text(
      'FABRICATE.Admin.Manager.Nav.LockedOpen',
      'This section stays open while you are on one of its pages.'
    )
  );
  // The rail's Downtime children render the active tab set.
  const downtimeNavItems = $derived(downtimeTabs);
  // The rail sub-item BUTTON's element id. It is the click target the mounted suite drives and
  // the anchor the group's markup is keyed on.
  const downtimeNavItemId = (tabId) => `manager-downtime-nav-${tabId}`;
  // The id of the sub-item's badge element (issue 1302) — the `aria-describedby` target, and
  // never a descendant of `downtimeNavLabelId`'s span, which names the companion panel region.
  const downtimeNavBadgeId = (tabId) => `manager-downtime-nav-badge-${tabId}`;
  // The badge Core renders for one sub-item, in provider mode only: Core's own preview tabs never
  // carry a `badge`.
  function downtimeSubitemBadge(item) {
    return downtimeCoreFallback ? null : resolveNavTabBadge(item, downtimeNavTabBadges);
  }
  // The Downtime parent rollup total (issue 1302) — Core's own summary of what is hidden behind a
  // closed disclosure.
  const downtimeNavRollupTotal = $derived(
    downtimeCoreFallback ? 0 : navTabBadgeTotal(downtimeTabs, downtimeNavTabBadges)
  );
  // Renders only while the children are hidden — BOTH disjuncts are load-bearing.
  const downtimeNavRollupVisible = $derived(
    !downtimeCoreFallback &&
      downtimeNavRollupTotal > 0 &&
      (!navRail.expanded.worldDowntime || navRail.collapsedDisplay)
  );
  // "{count} update" / "{count} updates" — Core's own generic word.
  function downtimeRollupName(count) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Manager.World.Downtime.BadgeTotalOne'
        : 'FABRICATE.Admin.Manager.World.Downtime.BadgeTotalOther';
    const fallback = count === 1 ? '{count} update' : '{count} updates';
    return text(key, fallback).replace('{count}', String(count));
  }
  // The parent row's composed accessible name while the rollup shows.
  function downtimeParentName(count) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Manager.World.Downtime.NavWithBadgeOne'
        : 'FABRICATE.Admin.Manager.World.Downtime.NavWithBadgeOther';
    const fallback = count === 1 ? '{label}, {count} update' : '{label}, {count} updates';
    const label = text('FABRICATE.Admin.Manager.World.Downtime.Nav', 'Downtime');
    return text(key, fallback).replace('{label}', label).replace('{count}', String(count));
  }
  // REVEAL THE SWITCHER ON ROUTE ENTRY (issue 1213).
  const downtimeNavNodes = $state({});
  let revealedDowntimeNavId = null;
  $effect(() => {
    if (!navRail.railLockedOpen || !navRail.expanded.worldDowntime) {
      revealedDowntimeNavId = null;
      return;
    }
    const tabId = worldDowntimeTabId;
    if (revealedDowntimeNavId === tabId) return;
    const node = downtimeNavNodes[tabId];
    if (!node) return;
    revealedDowntimeNavId = tabId;
    // happy-dom does not implement it, hence the optional call.
    node.scrollIntoView?.({ block: 'nearest' });
  });
</script>

<!--
  Downtime is a GROUP, not a leaf: the design nests the same four previews under it that
  Core's own tab strip offers, each carrying a premium padlock.
-->
{#if worldDowntimeAvailable}
  <div
    class={`manager-nav-group manager-world-downtime-group ${navRail.expanded.worldDowntime ? 'is-expanded' : ''}`}
    data-world-downtime-section
  >
    <button
      type="button"
      class={`manager-nav-button manager-nav-parent manager-world-nav-item ${isWorldDowntimeRoute ? 'is-active' : ''}`}
      id="manager-world-nav-downtime"
      data-world-nav-item="downtime"
      title={downtimeCoreFallback
        ? text(
            'FABRICATE.Admin.Manager.World.Downtime.PremiumTooltip',
            'Unlock Downtime Studio with Fabricate Premium'
          )
        : text(
            'FABRICATE.Admin.Manager.World.Downtime.InstalledTooltip',
            'Downtime Studio is unlocked by Fabricate Premium'
          )}
      aria-label={downtimeNavRollupVisible
        ? downtimeParentName(downtimeNavRollupTotal)
        : text('FABRICATE.Admin.Manager.World.Downtime.Nav', 'Downtime')}
      aria-current={isWorldDowntimeRoute ? 'page' : undefined}
      aria-controls="manager-downtime-submenu"
      aria-expanded={navRail.expanded.worldDowntime}
      onclick={openWorldDowntime}
    >
      <i class="fas fa-hourglass-half" aria-hidden="true"></i>
      <span class="manager-nav-label">
        {text('FABRICATE.Admin.Manager.World.Downtime.Nav', 'Downtime')}
      </span>
      <!-- The chip is MUTED, never removed, once a companion holds the surface (issue 1185). -->
      {#if !downtimeNavRollupVisible}
        <span
          class={`manager-nav-premium ${downtimeCoreFallback ? '' : 'is-installed'}`}
          data-world-nav-premium
          data-world-nav-premium-state={downtimeCoreFallback ? 'preview' : 'installed'}
          >{text('FABRICATE.Admin.Manager.World.Downtime.Premium', 'PREMIUM')}</span
        >
      {/if}
      <!-- The rollup — Core's own summary of what the closed disclosure is hiding. -->
      {#if !downtimeCoreFallback}
        {#if downtimeNavRollupVisible}
          <span
            class="manager-nav-issue-badge"
            data-world-downtime-badge-total
            role="img"
            aria-label={downtimeRollupName(downtimeNavRollupTotal)}>{downtimeNavRollupTotal}</span
          >
        {/if}
      {/if}
    </button>
    <button
      type="button"
      class="manager-nav-toggle"
      id="manager-downtime-toggle"
      data-world-downtime-toggle
      aria-label={navRail.expanded.worldDowntime
        ? text('FABRICATE.Admin.Manager.World.Downtime.CollapseNav', 'Collapse Downtime')
        : text('FABRICATE.Admin.Manager.World.Downtime.ExpandNav', 'Expand Downtime')}
      aria-controls="manager-downtime-submenu"
      aria-expanded={navRail.expanded.worldDowntime}
      disabled={navRail.lockedOpen.worldDowntime}
      aria-disabled={navRail.lockedOpen.worldDowntime}
      title={navRail.lockedOpen.worldDowntime ? railGroupLockedTitle : undefined}
      onclick={(event) => navRail.toggleGroup('worldDowntime', event)}
    >
      <i
        class={navRail.expanded.worldDowntime ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}
        aria-hidden="true"
      ></i>
    </button>
    {#if navRail.expanded.worldDowntime}
      <div
        class="manager-nav-submenu"
        id="manager-downtime-submenu"
        data-world-downtime-submenu
        aria-label={text('FABRICATE.Admin.Manager.World.Downtime.NavSections', 'Downtime previews')}
      >
        {#each downtimeNavItems as item (item.id)}
          <!-- `accessibleName` and `tooltip` LAND HERE in provider mode (issue 1213). -->
          <button
            type="button"
            class={`manager-nav-subitem manager-downtime-subitem ${isWorldDowntimeRoute && worldDowntimeTabId === item.id ? 'is-active' : ''}`}
            id={downtimeNavItemId(item.id)}
            bind:this={downtimeNavNodes[item.id]}
            data-world-downtime-item={item.id}
            title={downtimeTabText(item, 'tooltip')}
            aria-label={downtimeCoreFallback ? undefined : downtimeTabText(item, 'accessibleName')}
            aria-current={isWorldDowntimeRoute && worldDowntimeTabId === item.id
              ? 'true'
              : undefined}
            aria-describedby={downtimeSubitemBadge(item) ? downtimeNavBadgeId(item.id) : undefined}
            onclick={() => openWorldDowntimePreview(item.id)}
          >
            <i class={item.icon} aria-hidden="true"></i>
            <span class="manager-nav-label" id={downtimeNavLabelId(item.id)}
              >{downtimeTabText(item, 'label')}</span
            >
            <!-- IT IS THE ISSUE-SUMMARY VEHICLE, not the record count (issue 1515). -->
            {#if !downtimeCoreFallback}
              {@const badge = downtimeSubitemBadge(item)}
              {#if badge}
                <span
                  class="manager-nav-issue-badge"
                  data-world-downtime-badge={item.id}
                  id={downtimeNavBadgeId(item.id)}
                  role="img"
                  aria-label={badge.accessibleName}>{badge.count}</span
                >
              {/if}
            {/if}
            <!--
              The padlock and the premium note below advertise CORE'S preview. A companion
              owning the surface has nothing locked, so neither renders.
            -->
            {#if downtimeCoreFallback}
              <span class="manager-nav-lock" data-world-downtime-lock
                ><i class="fas fa-lock" aria-hidden="true"></i></span
              >
            {/if}
          </button>
        {/each}
      </div>
      {#if downtimeCoreFallback}
        <p class="manager-nav-callout" data-world-downtime-callout>
          <span class="manager-nav-callout-kicker">
            <i class="fas fa-lock" aria-hidden="true"></i>
            {text('FABRICATE.Admin.Manager.World.Downtime.RailKicker', 'PREMIUM PREVIEW')}
          </span>
          {text(
            'FABRICATE.Admin.Manager.World.Downtime.RailNote',
            'Open any Downtime page to preview how Fabricate Premium can help you run downtime.'
          )}
        </p>
      {/if}
    {/if}
  </div>
{/if}
