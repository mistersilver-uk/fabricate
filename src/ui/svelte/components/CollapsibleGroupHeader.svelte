<!--
  The category-group header of a grouped browser list: a folder glyph, the group name and a mono
  count, optionally collapsible. An import-free leaf (design-system §7), so the caller resolves the
  group name and the already-localized count text.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `name` | already-localized string | `''` | The group's display name. |
  | `countText` | already-localized string | `''` | The mono count label, e.g. `'4 recipes'`. |
  | `expanded` | boolean | `false` | Whether the controlled region is open. |
  | `controls` | element id | `''` | The region this header expands. |
  | `onToggle()` | function | no-op | Called on activation. |
  | `collapsible` | boolean | `true` | See the invariant. |

  Invariants:
  - A COLLAPSIBLE HEADER IS A REAL `<button aria-expanded aria-controls>`, never a clickable
    `<div>`, so the group is operable and announced by keyboard and screen reader. A
    NON-COLLAPSIBLE one is a `<div>` with no chevron and neither attribute, because a header that
    cannot collapse must not claim it can: `aria-expanded` on a control that never changes state
    is a lie to a screen reader, and a `<button>` that does nothing is a keyboard stop leading
    nowhere. Both forms keep `data-group-header` and every class, so the sheet, the smoke
    selectors and the mounted assertions resolve against either.
-->
<script>
  let {
    name = '',
    countText = '',
    expanded = true,
    controls = '',
    collapsible = true,
    onToggle = () => {},
  } = $props();
</script>

{#if collapsible}
  <button
    type="button"
    class="fab-group-header"
    data-group-header={name}
    aria-expanded={expanded}
    aria-controls={controls || undefined}
    onclick={() => onToggle()}
  >
    <i class={expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right'} aria-hidden="true"></i>
    <i class="fas fa-folder-open fab-group-folder" aria-hidden="true"></i>
    <span class="fab-group-name">{name}</span>
    <span class="fab-group-count">{countText}</span>
    <span class="fab-group-spacer" aria-hidden="true"></span>
  </button>
{:else}
  <div class="fab-group-header is-static" data-group-header={name}>
    <i class="fas fa-folder-open fab-group-folder" aria-hidden="true"></i>
    <span class="fab-group-name">{name}</span>
    <span class="fab-group-count">{countText}</span>
    <span class="fab-group-spacer" aria-hidden="true"></span>
  </div>
{/if}

<style>
  .fab-group-header {
    appearance: none;
    -webkit-appearance: none;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--fab-space-2);
    width: 100%;
    height: auto;
    min-height: 32px;
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    color: var(--fab-text-secondary);
    background: var(--fab-surface-soft);
    font-size: 0.72rem;
    line-height: 1.3;
    text-align: left;
    cursor: pointer;
  }

  .fab-group-header:hover {
    border-color: var(--fab-border-strong);
    background: var(--fab-surface-raised);
  }

  .fab-group-header:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  /* The non-collapsible band: not a control, so no pointer cursor and no hover repaint. PADDING IS
     THE SCALE, not the reference's own raw pair, because padding, margin and gap must derive from
     the published spacing scale and the raw values are debt the ratchet reds on; TYPE IS THE
     REFERENCE'S, in px, because font sizes are NOT scale members. Both are stated on `.is-static`
     alone, so the collapsible header is untouched. */
  .fab-group-header.is-static {
    padding: var(--fab-space-chip) var(--fab-space-3);
    border-radius: 7px;
    font-size: 11px;
    cursor: default;
  }

  .fab-group-header.is-static .fab-group-count {
    font-size: 10.5px;
  }

  .fab-group-header.is-static:hover {
    border-color: var(--fab-border);
    background: var(--fab-surface-soft);
  }

  .fab-group-header > i {
    flex: 0 0 auto;
    width: 10px;
    color: var(--fab-text-subtle);
    font-size: 0.6rem;
  }

  .fab-group-folder {
    color: var(--fab-accent);
    font-size: 0.7rem;
  }

  /* A tight LEFT CLUSTER, with the rest of the bar empty. `flex: 1 1 auto` on the name grew it to
     fill the row and flung the count to the far right edge, which made the bar read as a table
     header with a column of counts rather than as a group label. `0 1 auto` lets the name shrink
     without ever growing. */
  .fab-group-name {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    color: var(--fab-text-secondary);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fab-group-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 0.66rem;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  .fab-group-spacer {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
