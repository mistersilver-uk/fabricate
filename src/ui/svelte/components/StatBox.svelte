<!--
  THE AT-A-GLANCE FIGURE: a bordered box holding one value over a `Kicker` label. The specimen
  captions the routing rule — "Never for a number the GM can edit — that is a stepper." An
  IMPORT-FREE leaf but for `Kicker`, which it composes rather than restates, making `Kicker` a leaf
  TWO rungs down that a mount harness pulls in without naming a kicker anywhere.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The figure, ALREADY FORMATTED by the caller: this component does no arithmetic and no localization. |
  | `label` | already-localized string | `''` | The micro-label beneath it, rendered as a `Kicker` rather than a restatement of one. |
  | `icon` | Font Awesome classes | `''` | An optional leading glyph, INSIDE the value line, which is where the shipped ones sit. |
  | `tone` | `'default'` \| `'info'` \| `'danger'` | `'default'` | EVERY tone paints the value's ink; `danger` additionally paints the edge, the fill and the glyph. An unknown tone falls back to `default`. |
  | `dataAttr` / `dataValue` / `valueDataAttr` / `labelDataAttr` | strings | `''` | Hooks on the box root, the value element and the label. Attribute-only, carrying no behaviour. |

  Invariants:
  - IT ACCEPTS NO HANDLER OF ANY KIND and emits no interactive element. `design-system/spec.md`
    routes "a number a GM can change" to a stepper and never to a stat box, and
    `tests/stat-box-source-contract.test.js` asserts that as a clause. The four hook props are what
    keeps the clause exhaustive: the source contract enforces that every literal hook name at a
    call site starts with `data-`, because the name is caller-supplied and SPREAD, so a
    non-`data-` key would become a real handler.
  - THERE IS NO `size`, NO `unit`, NO `warning` TONE AND NO `accent` TONE. The specimen states ONE
    treatment, and a second is the drift this component exists to remove. `accent` in particular
    has no caller, no test acting on it and no variant on the specimen — the specimen's own accent
    modifier paints the LABEL's ink, not the value's — so shipping it would be unreachable
    configuration.
  - IT TAKES NO `class`, NO `style` AND NO REST SPREAD. A caller needing layout keeps its own
    wrapper: the grid both callers already own, which this component never touches.
  - A HOOK IS NOT LAYOUT, AND WHERE EACH ONE SITS IS WHAT DECIDES: the value and the label take a
    hook prop each, the label's forwarded into the composed `Kicker`, because the specimen draws
    the label AS the kicker and no wrapper element may carry a hook instead.
  - EVERY HOOK IS RENDERED WITH AN EMPTY-STRING VALUE, not the `="true"` a bare attribute on a
    component tag produces, because each is written bare on the element it replaces. Presence
    selectors resolve either way, which is why the difference would not have been caught.

  Four recorded deviations from the specimen: `icon`, `font-variant-numeric: tabular-nums` on the
  value, the `tone` prop at all — its three values are derived from shipped caller states, each
  mapped onto the token that caller already painted — and the four hook props above.
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
  /* THEME-ROOT TOKENS ONLY. No scoped `<style>` may reference `--fab-manager-*`, or any other
     property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY directory: a
     component is placed in a directory, not in a DOM subtree, so its scoped CSS cannot guarantee
     where its host renders. `tests/token-generation-gate.test.js` reds the reference. */
  .fab-stat-box {
    box-sizing: border-box;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
    text-align: center;
    /* The STRUT the composed label rides on. `Kicker`'s own leading reaches a kicker that is
       ITSELF the block; an inline one takes its line box from this host's strut instead, so the
       figure is declared here. */
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
