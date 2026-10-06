<!-- Svelte 5 runes mode -->
<!--
  The rail's world section: its heading row, the four world scoped-entity catalogue leaves, the
  Parties leaf, and the Travel, Rules & Resources and Downtime groups (issue 1717), rendered from
  `managerWorldNavItems` (issue 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
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
  import { managerWorldNavItems, navRowClass } from './managerNavItems.js';

  const props = $props();

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

{#snippet row(item, base, expanded)}
  <button
    type="button"
    class={navRowClass(base, item)}
    id={item.domId}
    {...item.hooks}
    aria-label={item.ariaLabel}
    aria-current={item.current}
    aria-controls={item.controls}
    aria-expanded={expanded}
    onclick={item.onSelect}
  >
    <i class={item.icon} aria-hidden="true"></i>
    <span class="manager-nav-label">{item.label}</span>
    {#each item.markers as marker (marker.kind)}
      <span class="manager-nav-count">{marker.value}</span>
    {/each}
  </button>
{/snippet}

<section class="manager-world-nav" data-world-nav-section aria-labelledby="manager-world-heading">
  <div class="manager-world-heading-row">
    <h2 id="manager-world-heading">
      {text('FABRICATE.Admin.Manager.World.Heading', 'WORLD')}
    </h2>
    <span id="manager-world-scope">
      {text('FABRICATE.Admin.Manager.World.Scope', 'every system')}
    </span>
  </div>
  {#each entries as entry (entry.id)}
    {#if entry.kind === 'group'}
      <div
        class={`manager-nav-group ${GROUP_CLASS[entry.id]} ${entry.expanded ? 'is-expanded' : ''}`}
        {...entry.hooks}
      >
        {@render row(
          entry.parent,
          'manager-nav-button manager-nav-parent manager-world-nav-item',
          entry.expanded
        )}
        <button
          type="button"
          class="manager-nav-toggle"
          id={entry.toggle.domId}
          {...entry.toggle.hooks}
          aria-label={entry.toggle.label}
          aria-controls={entry.submenu.domId}
          aria-expanded={entry.expanded}
          disabled={entry.locked}
          aria-disabled={entry.locked}
          title={entry.lockedReason}
          onclick={entry.toggle.onToggle}
        >
          <i class={entry.expanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"
          ></i>
        </button>
        {#if entry.expanded}
          <div
            class="manager-nav-submenu"
            id={entry.submenu.domId}
            {...entry.submenu.hooks}
            aria-label={entry.submenu.label}
          >
            {#each entry.children as child (child.id)}
              {@render row(child, 'manager-nav-subitem')}
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      {@render row(entry, 'manager-nav-button manager-world-nav-item')}
    {/if}
  {/each}
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
