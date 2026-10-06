<!-- Svelte 5 runes mode -->
<!--
  The rail's world section: its heading row, the four world scoped-entity catalogue leaves, the
  Parties leaf, and the Travel, Rules & Resources and Downtime groups (issue 1717), rendered from
  `managerWorldNavItems` and drawn by `NavSidebar`'s `rows` (issue 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `rows` | `NavSidebar`'s `rows` snippet | — | draws the entries below the heading row |
  | `navRail` | the `navRailModel` instance | — | supplies group expansion, the locks and `toggleGroup` |
  | `worldScopedCounts` | `{components, vocabulary, essences, tools}` | `{}` | one count per catalogue leaf, keyed by `WORLD_CATALOGUE_LEAVES[].countKey` |
  | `downtimeNavLabelId` | `(tabId) => string` | — | forwarded to the Downtime group; the root mints it because the Downtime host stamps it too |

  Every other prop is read by `managerWorldNavItems` in `managerNavItems.js`, which holds the
  defaults, or forwarded to `ManagerWorldDowntimeNavGroup`. The leaves' shape is pinned by the rail
  census in `tests/components/manager-rail-mounted.js`, and each leaf's `countKey` by
  `tests/components/manager-world-scope-mounted.js`.
-->
<script>
  import ManagerWorldDowntimeNavGroup from './ManagerWorldDowntimeNavGroup.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { managerWorldNavItems } from './managerNavItems.js';

  let { rows, ...props } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const entries = $derived(managerWorldNavItems(props, text));

  // Each world group's own class, beside the shared group class.
  const GROUP_CLASS = Object.freeze({
    worldTravel: 'manager-world-travel-group',
    worldRules: 'manager-world-rules-group',
  });
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
  {@render rows(entries, { itemClass: 'manager-world-nav-item', groupClasses: GROUP_CLASS })}
  <ManagerWorldDowntimeNavGroup
    navRail={props.navRail}
    worldDowntimeAvailable={props.worldDowntimeAvailable}
    isWorldDowntimeRoute={props.isWorldDowntimeRoute}
    downtimeCoreFallback={props.downtimeCoreFallback}
    downtimeTabs={props.downtimeTabs}
    downtimeNavTabBadges={props.downtimeNavTabBadges}
    downtimeTabText={props.downtimeTabText}
    downtimeNavLabelId={props.downtimeNavLabelId}
    worldDowntimeTabId={props.worldDowntimeTabId}
    openWorldDowntime={props.openWorldDowntime}
    openWorldDowntimePreview={props.openWorldDowntimePreview}
  />
</section>
