<!-- Svelte 5 runes mode -->
<!--
  The rail's crafting-system entries: System Overview, the Crafting, Checks and Gathering groups,
  the four rule leaves, and the disabled placeholder row (issue 1717, extracted from the root),
  rendered from `managerSystemNavItems` (issue 1777).

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `navRail` | the `navRailModel` instance | — | supplies group expansion, the locks and `toggleGroup` |
  | `experimentalFeaturesEnabled` | `boolean` | `false` | gates the Graph placeholder |
  | `craftingNavItems` / `checksNavItems` / `visibleGatheringNavItems` | entry arrays | `[]` | built by the root and the checks and gathering route models |

  Every prop is read by `managerSystemNavItems` in `managerNavItems.js`, which holds the defaults.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { managerSystemNavItems, navRowClass } from './managerNavItems.js';

  const props = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const entries = $derived(managerSystemNavItems(props, text));
</script>

{#snippet row(item, base, expanded)}
  <button
    type="button"
    class={navRowClass(base, item)}
    id={item.domId}
    {...item.hooks}
    title={item.title}
    aria-current={item.current}
    aria-expanded={expanded}
    disabled={item.disabled}
    onclick={item.onSelect}
  >
    <i class={item.icon} aria-hidden="true"></i>
    <span class="manager-nav-label">{item.label}</span>
    <!-- Three markers can land in this column and must stay distinguishable: a record count, an
         issue badge naming its unit, and an unsaved marker of its own shape. "Soon" is a word on
         a row with no records, so it is not a count either (issue 1515). -->
    {#each item.markers as marker (marker.kind)}
      {#if marker.kind === 'count'}
        <span class="manager-nav-count" aria-label={marker.label}>{marker.value}</span>
      {:else if marker.kind === 'dirty'}
        <span class="manager-nav-dirty-marker" {...marker.hooks} role="img" aria-label={marker.name}
        ></span>
      {:else if marker.kind === 'issues'}
        <span class="manager-nav-issue-badge" {...marker.hooks} role="img" aria-label={marker.name}
          >{marker.count}</span
        >
      {:else if marker.kind === 'planned'}
        <span class="manager-nav-planned">{marker.text}</span>
      {/if}
    {/each}
  </button>
{/snippet}

{#each entries as entry (entry.id)}
  {#if entry.kind === 'group'}
    <div class={`manager-nav-group ${entry.expanded ? 'is-expanded' : ''}`}>
      {@render row(entry.parent, 'manager-nav-button manager-nav-parent', entry.expanded)}
      <!-- Locked ⇒ genuinely `disabled`, with the reason on the control. -->
      <button
        type="button"
        class="manager-nav-toggle"
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
        <div class="manager-nav-submenu" id={entry.submenu.domId} aria-label={entry.submenu.label}>
          {#each entry.children as child (child.id)}
            {@render row(child, 'manager-nav-subitem')}
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    {@render row(entry, 'manager-nav-button')}
  {/if}
{/each}
