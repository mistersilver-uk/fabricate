<!-- Svelte 5 runes mode -->
<!--
  The category-group header of a grouped browser list. A real
  `<button aria-expanded aria-controls>` — not a clickable `<div>` — so the group
  is operable and announced by keyboard and screen reader (issue 643 §6: the row
  ARIA is chosen explicitly rather than inherited).

  Import-free leaf (design-system §7): props only. The caller resolves the group
  name and the already-localized count text.

  Props:
   - name: the group's display name (already localized / cased).
   - countText: the mono count label (e.g. '4 recipes'), already localized.
   - expanded: whether the controlled region is open.
   - controls: the DOM id of the region this header expands (`aria-controls`).
   - onToggle(): called on activation.
-->
<script>
  let {
    name = '',
    countText = '',
    expanded = true,
    controls = '',
    onToggle = () => {}
  } = $props();
</script>

<button
  type="button"
  class="fab-group-header"
  data-group-header={name}
  aria-expanded={expanded}
  aria-controls={controls || undefined}
  onclick={() => onToggle()}
>
  <i
    class={expanded ? 'fas fa-chevron-down' : 'fas fa-chevron-right'}
    aria-hidden="true"
  ></i>
  <i class="fas fa-folder-open fab-group-folder" aria-hidden="true"></i>
  <span class="fab-group-name">{name}</span>
  <span class="fab-group-count">{countText}</span>
  <span class="fab-group-spacer" aria-hidden="true"></span>
</button>

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

  /*
    The header is a tight LEFT CLUSTER — chevron, folder, name, count — with the rest of
    the bar empty. `flex: 1 1 auto` on the name grew it to fill the row and flung the
    count to the far right edge, which made the bar read as a table header with a column
    of counts rather than as a group label. `0 1 auto` lets the name shrink (ellipsising
    a long category) without ever growing.
  */
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

  /* Keeps the bar full-bleed while the cluster stays left. */
  .fab-group-spacer {
    flex: 1 1 auto;
    min-width: 0;
  }
</style>
