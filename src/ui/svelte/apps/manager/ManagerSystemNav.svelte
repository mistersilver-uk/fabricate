<!-- Svelte 5 runes mode -->
<!--
  The rail's crafting-system entries: System Overview, the Crafting, Checks and Gathering groups,
  the four rule leaves, and the disabled placeholder row (issue 1717, extracted from the root),
  built by `managerSystemNavItems` and drawn by `NavSidebar`'s `rows` (issue 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `rows` | `NavSidebar`'s `rows` snippet | — | draws the entries inside the sidebar's `nav` |
  | `navRail` | the `navRailModel` instance | — | supplies group expansion, the locks and `toggleGroup` |
  | `experimentalFeaturesEnabled` | `boolean` | `false` | gates the Graph placeholder |
  | `craftingNavItems` / `checksNavItems` / `visibleGatheringNavItems` | entry arrays | `[]` | built by the root and the checks and gathering route models |

  Every other prop is read by `managerSystemNavItems` in `managerNavItems.js`, which holds the defaults.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { managerSystemNavItems } from './managerNavItems.js';

  let { rows, ...props } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const entries = $derived(managerSystemNavItems(props, text));
</script>

{@render rows(entries)}
