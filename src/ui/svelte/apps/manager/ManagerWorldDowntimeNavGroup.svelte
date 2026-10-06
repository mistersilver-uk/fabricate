<!-- Svelte 5 runes mode -->
<!--
  The world rail's Downtime group: the parent row with its premium chip and rollup badge, the
  disclosure, and one sub-item per preview tab (issue 1717, extracted from the root), built by
  `managerDowntimeNavGroup` and drawn by `NavSidebar`'s `rows` (issue 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `rows` | `NavSidebar`'s `rows` snippet | — | draws the group |
  | `navRail` | the `navRailModel` instance | — | supplies `expanded`/`lockedOpen`/`collapsedDisplay`/`railLockedOpen` and `toggleGroup` |
  | `downtimeTabText` | `(tab, field) => string` | — | localizes a tab field in Core mode and passes a companion's own copy through |
  | `downtimeNavLabelId` | `(tabId) => string` | — | the root's own id minter, because the Downtime host stamps the same id outside the rail |

  Every other prop is read by `managerDowntimeNavGroup` in `managerNavItems.js`, which holds the
  defaults. The rollup renders only while the children are hidden — both disjuncts of its
  visibility are load-bearing, pinned by `tests/components/manager-downtime-mounted.js`.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { managerDowntimeNavGroup } from './managerNavItems.js';

  let { rows, ...props } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const group = $derived(managerDowntimeNavGroup(props, text));

  // The group's own class and its sub-items', beside the shared ones.
  const GROUP_CLASS = Object.freeze({ worldDowntime: 'manager-world-downtime-group' });
  const CHILD_CLASS = Object.freeze({ worldDowntime: 'manager-downtime-subitem' });
</script>

<!--
  Downtime is a group, not a leaf: it nests the same previews Core's own tab strip offers, each
  carrying a premium padlock.
-->
{#if group}
  {@render rows([group], {
    itemClass: 'manager-world-nav-item',
    groupClasses: GROUP_CLASS,
    childClasses: CHILD_CLASS,
  })}
{/if}
