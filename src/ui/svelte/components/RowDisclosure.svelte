<!--
  The product's ONE row disclosure: the chevron that expands a single labelled ROW into its detail,
  carrying `aria-expanded`, `aria-controls` and an accessible name. It is deliberately NOT
  `CollapsibleGroupHeader`, which owns a heading, a count and the whole band above a set of rows.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `expanded` | boolean | `false` | Whether the controlled region is open. |
  | `controls` | element id | `''` | The region this discloses. Required for `aria-controls` to mean anything. |
  | `label` | pre-localized string | `''` | The accessible name. It names the ROW, not the action — "Trigger 1: on a natural 1" reads correctly under both states, because `aria-expanded` supplies the rest. |
  | `side` / `disabled` / `dataAttr` / `dataValue` | `'trailing'` \| `'leading'` / boolean / strings | `'trailing'` / `false` / `''` | Which way the collapsed chevron points, whether the `<button>` is disabled, and an optional test/screenshot hook. |
  | `onToggle()` | function | no-op | The caller owns `expanded`. |

  Invariants:
  - IT RENDERS A REAL `<button>` AND MUST NOT BE PLACED INSIDE ANOTHER ONE, because nested buttons
    are invalid DOM that `createElement` accepts and no mounted test notices. A caller nests this
    control BESIDE the row's own content rather than wrapping it.
-->
<script>
  let {
    expanded = false,
    controls = '',
    label = '',
    side = 'trailing',
    disabled = false,
    dataAttr = '',
    dataValue = '',
    onToggle = () => {},
  } = $props();

  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const collapsedIcon = $derived(
    side === 'leading' ? 'fas fa-chevron-right' : 'fas fa-chevron-down'
  );
  const icon = $derived(expanded ? 'fas fa-chevron-up' : collapsedIcon);
</script>

<button
  type="button"
  class="fab-row-disclosure"
  class:is-expanded={expanded}
  aria-expanded={expanded}
  aria-controls={controls || undefined}
  aria-label={label}
  {disabled}
  {...hookAttributes}
  onclick={() => onToggle(!expanded)}
>
  <i class={icon} aria-hidden="true"></i>
</button>

<style>
  .fab-row-disclosure {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 24px;
    height: 24px;
    min-height: 24px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    color: var(--fab-text-muted);
    background: transparent;
    line-height: 1;
    cursor: pointer;
  }

  .fab-row-disclosure:hover:not(:disabled) {
    border-color: var(--fab-border);
    color: var(--fab-text);
    background: var(--fab-surface-raised);
  }

  .fab-row-disclosure:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 1px;
  }

  .fab-row-disclosure:disabled {
    color: var(--fab-text-disabled);
    cursor: default;
  }

  .fab-row-disclosure > i {
    font-size: 0.72rem;
  }
</style>
