<!-- Svelte 5 runes mode -->
<!--
  `NavSidebar`'s `labelled` rows and groups, drawn from `managerNavItems.js` entries (issue 1777).
  Its own file because `NavSidebar`'s scoped `<style>` would stamp its hash on every row here.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `entries` | model rows and `kind: 'group'` groups | `[]` | rendered in order |
  | `itemClass` | class string | `''` | appended to every top-level row and group parent |
  | `groupClasses` | `{[groupId]: class}` | `{}` | one group's own class beside `manager-nav-group` |

  Invariants:
  - A row with no `active` carries exactly its base class; a disabled row or locked chevron is
    described by a visually hidden reason — pinned by `tests/components/nav-sidebar-mounted.test.js`.
-->
<script>
  let { entries = [], itemClass = '', groupClasses = {} } = $props();

  function rowClass(base, item) {
    return item.active === undefined ? base : `${base} ${item.active ? 'is-active' : ''}`;
  }

  const reasonId = (domId) => `${domId}-reason`;
  const leafClass = $derived(itemClass ? ` ${itemClass}` : '');
</script>

{#snippet row(item, base, expanded)}
  <button
    type="button"
    class={rowClass(base, item)}
    data-keyboard-focus="true"
    id={item.domId}
    {...item.hooks}
    title={item.title ?? item.disabledReason}
    aria-label={item.ariaLabel}
    aria-current={item.current}
    aria-controls={item.controls}
    aria-expanded={expanded}
    aria-disabled={item.disabled ? 'true' : undefined}
    aria-describedby={item.disabledReason ? reasonId(item.domId) : undefined}
    disabled={item.disabled}
    onclick={item.onSelect}
  >
    <i class={item.icon} aria-hidden="true"></i>
    <span class="manager-nav-label">{item.label}</span>
    <!-- A record count, an issue badge naming its unit and an unsaved marker of its own shape stay
         distinguishable; "Soon" is a word, not a count (issue 1515). -->
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
  {#if item.disabledReason}
    <span class="visually-hidden" id={reasonId(item.domId)}>{item.disabledReason}</span>
  {/if}
{/snippet}

{#each entries as entry (entry.id)}
  {#if entry.kind === 'group'}
    {@const groupClass = groupClasses[entry.id] ? `${groupClasses[entry.id]} ` : ''}
    <div
      class={`manager-nav-group ${groupClass}${entry.expanded ? 'is-expanded' : ''}`}
      {...entry.hooks}
    >
      {@render row(
        entry.parent,
        `manager-nav-button manager-nav-parent${leafClass}`,
        entry.expanded
      )}
      <button
        type="button"
        class="manager-nav-toggle"
        data-keyboard-focus="true"
        id={entry.toggle.domId}
        {...entry.toggle.hooks}
        aria-label={entry.toggle.label}
        aria-controls={entry.submenu.domId}
        aria-expanded={entry.expanded}
        disabled={entry.locked}
        aria-disabled={entry.locked}
        aria-describedby={entry.locked ? reasonId(entry.submenu.domId) : undefined}
        title={entry.lockedReason}
        onclick={entry.toggle.onToggle}
      >
        <i class={entry.expanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"
        ></i>
      </button>
      {#if entry.locked}
        <span class="visually-hidden" id={reasonId(entry.submenu.domId)}>{entry.lockedReason}</span>
      {/if}
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
    {@render row(entry, `manager-nav-button${leafClass}`)}
  {/if}
{/each}
