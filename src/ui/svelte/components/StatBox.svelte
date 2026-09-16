<!--
  THE AT-A-GLANCE FIGURE: a bordered box holding one value over a `Kicker` label. The specimen
  captions the routing rule — "Never for a number the GM can edit — that is a stepper."

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The figure, ALREADY FORMATTED by the caller: this component does no arithmetic and no localization. |
  | `label` / `icon` | already-localized string / Font Awesome classes | `''` | The micro-label beneath the figure, rendered as a `Kicker`, and an optional leading glyph inside the value line. |
  | `tone` | `'default'` \| `'info'` \| `'danger'` | `'default'` | Every tone paints the value's ink; `danger` additionally paints the edge, the fill and the glyph. An unknown tone falls back to `default`. |
  | `dataAttr` / `dataValue` / `valueDataAttr` / `labelDataAttr` | strings | `''` | Hooks on the box root, the value element and the label. Attribute-only, carrying no behaviour. |

  Invariants:
  - IT ACCEPTS NO HANDLER OF ANY KIND and emits no interactive element. `design-system/spec.md`
    routes "a number a GM can change" to a stepper, and `tests/stat-box-source-contract.test.js`
    asserts that as a clause. The four hook props keep the clause exhaustive: the source contract
    requires every literal hook name at a call site to start with `data-`, because the name is
    caller-supplied and SPREAD, so a non-`data-` key would become a real handler.
  - THERE IS NO `size`, NO `unit`, NO `warning` TONE AND NO `accent` TONE. The specimen states one
    treatment, and `accent` has no caller, no test and no specimen variant — its own accent modifier
    paints the LABEL's ink, not the value's.
  - IT TAKES NO `class`, NO `style` AND NO REST SPREAD; a caller needing layout keeps its own
    wrapper. A hook is not layout, so the value and the label take a hook prop each, the label's
    forwarded into the composed `Kicker`, and each is rendered with an empty-string value.
  - Its scoped block reads THEME-ROOT TOKENS ONLY, never an area-scoped `--fab-manager-*` property;
    that rule and the `data-*` spelling one are `openspec/specs/design-system/spec.md`'s.

  Four recorded deviations from the specimen: `icon`, `font-variant-numeric: tabular-nums` on the
  value, the `tone` prop at all, and the four hook props above.
-->
<script>
  import Kicker from './Kicker.svelte';

  let {
    value = '',
    label = '',
    icon = '',
    tone = 'default',
    dataAttr = '',
    dataValue = '',
    valueDataAttr = '',
    labelDataAttr = '',
  } = $props();

  const TONES = new Set(['default', 'info', 'danger']);

  const resolvedTone = $derived(TONES.has(tone) ? tone : 'default');

  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue } : {});
  const valueHookAttributes = $derived(valueDataAttr ? { [valueDataAttr]: '' } : {});
</script>

<div
  class="fab-stat-box"
  class:is-info={resolvedTone === 'info'}
  class:is-danger={resolvedTone === 'danger'}
  data-stat-tone={resolvedTone}
  {...hookAttributes}
>
  <span class="fab-stat-box-value" class:has-icon={Boolean(icon)} {...valueHookAttributes}>
    {#if icon}<i class={icon} aria-hidden="true"></i>{/if}
    <span class="fab-stat-box-figure">{value}</span>
  </span>
  <Kicker as="span" dataAttr={labelDataAttr}>{label}</Kicker>
</div>

<style>
  .fab-stat-box {
    box-sizing: border-box;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
    text-align: center;
    line-height: 11px;
  }

  .fab-stat-box-value {
    display: block;
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .fab-stat-box-value.has-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-chip);
  }

  .fab-stat-box-value i {
    color: var(--fab-text-muted);
    font-size: 14px;
  }

  .fab-stat-box.is-info .fab-stat-box-value {
    color: var(--fab-info-text);
  }

  .fab-stat-box.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .fab-stat-box.is-danger .fab-stat-box-value,
  .fab-stat-box.is-danger .fab-stat-box-value i {
    color: var(--fab-danger-text);
  }
</style>
