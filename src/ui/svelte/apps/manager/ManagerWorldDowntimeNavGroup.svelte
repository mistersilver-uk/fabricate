<!-- Svelte 5 runes mode -->
<!--
  The world rail's Downtime group: the parent row with its premium chip and rollup badge, the
  disclosure, and one sub-item per preview tab (issue 1717, extracted from the root), rendered from
  `managerDowntimeNavGroup` (issue 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `navRail` | the `navRailModel` instance | — | supplies `expanded`/`lockedOpen`/`collapsedDisplay`/`railLockedOpen` and `toggleGroup` |
  | `downtimeTabText` | `(tab, field) => string` | — | localizes a tab field in Core mode and passes a companion's own copy through |
  | `downtimeNavLabelId` | `(tabId) => string` | — | the root's own id minter, because the Downtime host stamps the same id outside the rail |

  Every prop is read by `managerDowntimeNavGroup` in `managerNavItems.js`, which holds the defaults.

  Invariants:
  - The rollup renders only while the children are hidden — both disjuncts of its visibility are
    load-bearing, pinned by `tests/components/manager-downtime-mounted.js`.
  - The reveal effect stays with the `bind:this` registry it reads; neither crosses a prop boundary.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { managerDowntimeNavGroup, navRowClass } from './managerNavItems.js';

  const props = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const group = $derived(managerDowntimeNavGroup(props, text));

  // Reveal the switcher on route entry (issue 1213).
  const downtimeNavNodes = $state({});
  let revealedDowntimeNavId = null;
  $effect(() => {
    if (!props.navRail.railLockedOpen || !props.navRail.expanded.worldDowntime) {
      revealedDowntimeNavId = null;
      return;
    }
    const tabId = props.worldDowntimeTabId ?? '';
    if (revealedDowntimeNavId === tabId) return;
    const node = downtimeNavNodes[tabId];
    if (!node) return;
    revealedDowntimeNavId = tabId;
    // happy-dom does not implement it, hence the optional call.
    node.scrollIntoView?.({ block: 'nearest' });
  });
</script>

{#snippet markers(item)}
  {#each item.markers as marker (marker.kind)}
    {#if marker.kind === 'premium'}
      <!-- The chip is muted, never removed, once a companion holds the surface (issue 1185). -->
      <span
        class={`manager-nav-premium ${marker.installed ? 'is-installed' : ''}`}
        {...marker.hooks}>{marker.text}</span
      >
    {:else if marker.kind === 'issues'}
      <!-- The issue-summary vehicle, never the record count (issue 1515). -->
      <span
        class="manager-nav-issue-badge"
        {...marker.hooks}
        id={marker.domId}
        role="img"
        aria-label={marker.name}>{marker.count}</span
      >
    {:else if marker.kind === 'lock'}
      <span class="manager-nav-lock" {...marker.hooks}
        ><i class="fas fa-lock" aria-hidden="true"></i></span
      >
    {/if}
  {/each}
{/snippet}

<!--
  Downtime is a group, not a leaf: it nests the same previews Core's own tab strip offers, each
  carrying a premium padlock.
-->
{#if group}
  <div
    class={`manager-nav-group manager-world-downtime-group ${group.expanded ? 'is-expanded' : ''}`}
    {...group.hooks}
  >
    <button
      type="button"
      class={navRowClass(
        'manager-nav-button manager-nav-parent manager-world-nav-item',
        group.parent
      )}
      id={group.parent.domId}
      {...group.parent.hooks}
      title={group.parent.title}
      aria-label={group.parent.ariaLabel}
      aria-current={group.parent.current}
      aria-controls={group.parent.controls}
      aria-expanded={group.expanded}
      onclick={group.parent.onSelect}
    >
      <i class={group.parent.icon} aria-hidden="true"></i>
      <span class="manager-nav-label">{group.parent.label}</span>
      {@render markers(group.parent)}
    </button>
    <button
      type="button"
      class="manager-nav-toggle"
      id={group.toggle.domId}
      {...group.toggle.hooks}
      aria-label={group.toggle.label}
      aria-controls={group.submenu.domId}
      aria-expanded={group.expanded}
      disabled={group.locked}
      aria-disabled={group.locked}
      title={group.lockedReason}
      onclick={group.toggle.onToggle}
    >
      <i class={group.expanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"
      ></i>
    </button>
    {#if group.expanded}
      <div
        class="manager-nav-submenu"
        id={group.submenu.domId}
        {...group.submenu.hooks}
        aria-label={group.submenu.label}
      >
        {#each group.children as item (item.id)}
          <!-- `accessibleName` and `tooltip` land here in provider mode (issue 1213). -->
          <button
            type="button"
            class={navRowClass('manager-nav-subitem manager-downtime-subitem', item)}
            id={item.domId}
            bind:this={downtimeNavNodes[item.id]}
            {...item.hooks}
            title={item.title}
            aria-label={item.ariaLabel}
            aria-current={item.current}
            aria-describedby={item.ariaDescribedBy}
            onclick={item.onSelect}
          >
            <i class={item.icon} aria-hidden="true"></i>
            <span class="manager-nav-label" id={item.labelId}>{item.label}</span>
            {@render markers(item)}
          </button>
        {/each}
      </div>
      {#if group.callout}
        <p class="manager-nav-callout" data-world-downtime-callout>
          <span class="manager-nav-callout-kicker">
            <i class="fas fa-lock" aria-hidden="true"></i>
            {group.callout.kicker}
          </span>
          {group.callout.note}
        </p>
      {/if}
    {/if}
  </div>
{/if}
