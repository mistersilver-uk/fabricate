<!--
  A cross-reference list: the read-only list that states which records a record relates to,
  named by its own kicker. Every row is ListRow's dense row, or its selectable dense form for a
  row that opens, composed rather than restated.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `label` | string | — | Required and already localized; the kicker names the list. |
  | `items` | `{ id?, name, art?, icon?, tint?, quantity?, detail?, opens?, attrs? }[]` | `[]` | Ordered; keyed by `id`, else by position. `quantity` and `detail` are caller-formatted, and a role or kind is `detail`, drawn at the trailing edge. `opens: false` keeps that row from being a control; `attrs` is spread on its row root. |

  Callbacks:
  - `onOpen(item)` — optional. With it, each row whose `opens` is not `false` is ListRow's one
    native button, never pressed, and a click hands back the item as passed.

  Rest spread:
  - `{...rest}` lands on the root `<div>`, written after `class={…}`.
  - `class` is a named prop, because a rest key would replace it instead of extending it.

  Invariants:
  - With zero items it draws the label and no `<ul>`; the caller owns the empty state and pager —
    pinned by `tests/components/xref-list-mounted.test.js`.
  - Every row is one ellipsized line, 40px border-box whether it opens or not — pinned by
    `tests/components/xref-list-rendered.test.js`.
-->
<script>
  import Kicker from './Kicker.svelte';
  import ListRow from './ListRow.svelte';

  let { label, items = [], onOpen = null, class: extraClass = '', ...rest } = $props();

  const labelId = $props.id();
  const rows = $derived(Array.isArray(items) ? items : []);
</script>

<div class={['fab-xref-list', extraClass]} {...rest}>
  <p class="fab-xref-list-label" id={labelId}><Kicker as="span">{label}</Kicker></p>
  {#if rows.length > 0}
    <ul class="fab-xref-list-items" aria-labelledby={labelId}>
      {#each rows as item, index (item.id ?? `#${index}`)}
        <li>
          <!-- ratchet-exempt(design-system): per-item `attrs` carry the caller's data-* hooks; Required for and Produced by need two hook names with different values, which one `<part>DataAttr` cannot carry -->
          <ListRow
            {...item.attrs}
            name={item.name}
            art={item.art}
            icon={item.icon}
            tint={item.tint}
            quantity={item.quantity}
            detail={item.detail}
            onOpen={onOpen && item.opens !== false ? () => onOpen(item) : null}
            truncateName
            inset="row"
            detailAlign="end"
          />
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .fab-xref-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    min-width: 0;
  }

  /* A zero line-height leaves the label the kicker's own line box. */
  .fab-xref-list-label {
    margin: 0;
    line-height: 0;
  }

  /* Clears core's list margins, indent, bullets and item spacing. */
  .fab-xref-list-items {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fab-xref-list-items > li {
    min-width: 0;
    margin: 0;
  }
</style>
