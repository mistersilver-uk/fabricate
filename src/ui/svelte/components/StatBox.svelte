<!--
  THE AT-A-GLANCE FIGURE: a bordered box holding one value over a `Kicker` label. The specimen
  captions the routing rule — "Never for a number the GM can edit — that is a stepper."

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | string | `''` | The figure, ALREADY FORMATTED by the caller: this component does no arithmetic and no localization. |
  | `label` / `icon` | already-localized string / Font Awesome classes | `''` | The micro-label, rendered as a `Kicker`, and an optional leading glyph inside the value line. |
  | `layout` | `'default'` \| `'start'` | `'default'` | `default` is the centred serif figure over its label. `start` is the label over a start-aligned mono figure. A CLOSED set: any other value draws `default`. |
  | `note` | already-localized string | `''` | An optional line after the figure and label, in the muted ink, or the danger ink in the `danger` tone, whose fill leaves the muted ink under 4.5:1 on `--fab-bg-2`. Empty draws nothing. |
  | `tone` | `'default'` \| `'info'` \| `'success'` \| `'danger'` | `'default'` | Every tone paints the value's ink; `danger` additionally paints the edge, the fill and the glyph, and inks the label secondary, because the muted ink falls under 4.5:1 on that fill over `--fab-bg-2` (issue 2841). `success` has no in-app caller and serves the published seam (issue 2847). An unknown tone falls back to `default`. |
  | `valueDataAttr` / `labelDataAttr` | attribute names | `''` | Hooks on the value element and the label. Attribute-only, carrying no behaviour. |
  | `children` | snippet | `undefined` | Content drawn after the figure and label and before the note, in a band as wide as the box's content, `--fab-space-2` below them, spacing its own children by `--fab-space-1` (issue 2841). Unset draws no band. |

  Reading order:
  - The DOM order is the reading order and the visual order: `default` is figure then label, `start`
    is label then figure, then the `children` band, and the note comes last in both. The box adds no
    role and no ARIA name, so each piece is announced once, as written, and the glyph is hidden. The
    note continues the reading and never repeats the label.

  Rest spread:
  - `{...rest}` lands on the box root, written after `class`, and exists for a test or screenshot
    hook, whose value is written as passed.

  Invariants:
  - IT ACCEPTS NO HANDLER OF ANY KIND and emits no interactive element. `design-system/spec.md`
    routes "a number a GM can change" to a stepper, and `tests/stat-box-source-contract.test.js`
    asserts that as a clause. The two hook props keep the clause exhaustive: the source contract
    requires every literal hook name at a call site to start with `data-`, because the name is
    caller-supplied and spread, so a non-`data-` key would become a real handler.
  - THERE IS NO `size`, NO `unit`, NO `warning` TONE AND NO `accent` TONE. The specimen states one
    treatment, and `accent` has no caller, no test and no specimen variant — its own accent modifier
    paints the LABEL's ink, not the value's.
  - It takes no `class` and no `style`; a caller needing layout keeps its own wrapper. A hook is
    not layout, so the value and the label take a hook prop each, the label's spread onto the
    composed `Kicker`, and each is rendered with an empty-string value.
  - Its scoped block reads THEME-ROOT TOKENS ONLY, never an area-scoped `--fab-manager-*` property;
    that rule and the `data-*` spelling one are `openspec/specs/design-system/spec.md`'s.

  Four recorded deviations from the specimen: `icon`, `font-variant-numeric: tabular-nums` on the
  value, the `tone` prop at all, and the hook props and rest spread above.
-->
<script>
  import Kicker from './Kicker.svelte';

  let {
    value = '',
    label = '',
    icon = '',
    tone = 'default',
    layout = 'default',
    note = '',
    valueDataAttr = '',
    labelDataAttr = '',
    children = undefined,
    ...rest
  } = $props();

  const TONES = new Set(['default', 'info', 'success', 'danger']);

  const resolvedTone = $derived(TONES.has(tone) ? tone : 'default');
  const labelFirst = $derived(layout === 'start');

  const valueHookAttributes = $derived(valueDataAttr ? { [valueDataAttr]: '' } : {});
  const labelHookAttributes = $derived(labelDataAttr ? { [labelDataAttr]: '' } : {});
</script>

{#snippet figure()}
  <span class="fab-stat-box-value" class:has-icon={Boolean(icon)} {...valueHookAttributes}>
    {#if icon}<i class={icon} aria-hidden="true"></i>{/if}
    <span class="fab-stat-box-figure">{value}</span>
  </span>
{/snippet}

{#snippet caption()}
  <!-- ratchet-exempt(design-system): the spread is the one `labelDataAttr` hook the caller names, or nothing -->
  <Kicker as="span" {...labelHookAttributes}>{label}</Kicker>
{/snippet}

<div
  class="fab-stat-box"
  class:is-info={resolvedTone === 'info'}
  class:is-success={resolvedTone === 'success'}
  class:is-danger={resolvedTone === 'danger'}
  class:is-start={labelFirst}
  data-stat-tone={resolvedTone}
  {...rest}
>
  {#if labelFirst}
    {@render caption()}
    {@render figure()}
  {:else}
    {@render figure()}
    {@render caption()}
  {/if}
  {#if children}<div class="fab-stat-box-slot">{@render children()}</div>{/if}
  {#if note}<span class="fab-stat-box-note">{note}</span>{/if}
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

  .fab-stat-box-note {
    display: block;
    margin-top: var(--fab-space-1);
    color: var(--fab-text-muted);
    font-family: var(--font-body, var(--font-primary, sans-serif));
    font-size: 10px;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .fab-stat-box-slot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--fab-space-1);
    margin-top: var(--fab-space-2);
  }

  .fab-stat-box.is-start {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: start;
    gap: var(--fab-space-1);
    text-align: start;
  }

  .fab-stat-box.is-start .fab-stat-box-value {
    font-family: var(--fab-font-mono);
    font-size: 14px;
    font-weight: 500;
  }

  .fab-stat-box.is-start .fab-stat-box-value.has-icon {
    justify-content: flex-start;
  }

  .fab-stat-box.is-start .fab-stat-box-note {
    margin-top: 0;
  }

  /* The start grid's own gap is space-1, so the band adds the rest of its space-2 and stretches. */
  .fab-stat-box.is-start .fab-stat-box-slot {
    justify-self: stretch;
    margin-top: var(--fab-space-1);
  }

  .fab-stat-box.is-info .fab-stat-box-value {
    color: var(--fab-info-text);
  }

  .fab-stat-box.is-success .fab-stat-box-value {
    color: var(--fab-success-text);
  }

  .fab-stat-box.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .fab-stat-box.is-danger > :global(.fab-kicker) {
    color: var(--fab-text-secondary);
  }

  .fab-stat-box.is-danger .fab-stat-box-value,
  .fab-stat-box.is-danger .fab-stat-box-value i,
  .fab-stat-box.is-danger .fab-stat-box-note {
    color: var(--fab-danger-text);
  }
</style>
