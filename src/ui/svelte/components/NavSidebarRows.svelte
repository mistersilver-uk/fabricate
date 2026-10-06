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
  | `childClasses` | `{[groupId]: class}` | `{}` | appended to every child row of that group |

  Invariants:
  - A row with no `active` carries exactly its base class; a disabled row or locked chevron is
    described by a visually hidden reason — pinned by `tests/components/nav-sidebar-mounted.test.js`.
  - A `tierGated` row draws the premium padlock after its marks, hidden from assistive technology;
    a `reveal` row scrolls itself into view, once each time it starts revealing (issue 1213).
-->
<script>
  let { entries = [], itemClass = '', groupClasses = {}, childClasses = {} } = $props();

  // `base`, the caller's `extra` class, then the pill slot a row with no `active` does not carry.
  function rowClass(base, extra, item) {
    const classes = extra ? `${base} ${extra}` : base;
    return item.active === undefined ? classes : `${classes} ${item.active ? 'is-active' : ''}`;
  }

  const reasonId = (domId) => `${domId}-reason`;

  // A stable function, so a row that stays revealed across re-renders is not scrolled again.
  function revealRow(node) {
    // happy-dom does not implement it, hence the optional call.
    node.scrollIntoView?.({ block: 'nearest' });
  }
</script>

{#snippet row(item, base, extra, expanded)}
  <button
    type="button"
    class={rowClass(base, extra, item)}
    data-keyboard-focus="true"
    id={item.domId}
    {...item.hooks}
    title={item.title ?? item.disabledReason}
    aria-label={item.ariaLabel}
    aria-current={item.current}
    aria-controls={item.controls}
    aria-expanded={expanded}
    aria-disabled={item.disabled ? 'true' : undefined}
    aria-describedby={item.disabledReason ? reasonId(item.domId) : item.ariaDescribedBy}
    disabled={item.disabled}
    onclick={item.onSelect}
    {@attach item.reveal && revealRow}
  >
    <i class={item.icon} aria-hidden="true"></i>
    <span class="manager-nav-label" id={item.labelId}>{item.label}</span>
    <!-- A record count, an issue badge naming its unit and an unsaved marker of its own shape stay
         distinguishable; "Soon" is a word, not a count (issue 1515). -->
    {#each item.markers as marker (marker.kind)}
      {#if marker.kind === 'count'}
        <span class="manager-nav-count" aria-label={marker.label}>{marker.value}</span>
      {:else if marker.kind === 'dirty'}
        <span class="manager-nav-dirty-marker" {...marker.hooks} role="img" aria-label={marker.name}
        ></span>
      {:else if marker.kind === 'issues'}
        <span
          class="manager-nav-issue-badge"
          {...marker.hooks}
          id={marker.domId}
          role="img"
          aria-label={marker.name}>{marker.count}</span
        >
      {:else if marker.kind === 'planned'}
        <span class="manager-nav-planned">{marker.text}</span>
      {:else if marker.kind === 'premium'}
        <!-- The chip is muted, never removed, once a companion holds the surface (issue 1185). -->
        <span
          class={`manager-nav-premium ${marker.installed ? 'is-installed' : ''}`}
          {...marker.hooks}>{marker.text}</span
        >
      {/if}
    {/each}
    {#if item.tierGated}
      <span class="manager-nav-lock" {...item.lockHooks}
        ><i class="fas fa-lock" aria-hidden="true"></i></span
      >
    {/if}
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
        'manager-nav-button manager-nav-parent',
        itemClass,
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
            {@render row(child, 'manager-nav-subitem', childClasses[entry.id])}
          {/each}
        </div>
        {#if entry.callout}
          <p class="manager-nav-callout" {...entry.callout.hooks}>
            <span class="manager-nav-callout-kicker">
              <i class="fas fa-lock" aria-hidden="true"></i>
              {entry.callout.kicker}
            </span>
            {entry.callout.note}
          </p>
        {/if}
      {/if}
    </div>
  {:else}
    {@render row(entry, 'manager-nav-button', itemClass)}
  {/if}
{/each}
