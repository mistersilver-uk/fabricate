<!--
  The product's ONE horizontal fill bar: a rounded track with a value-width fill. It is a LEAF and
  renders no caption, percent readout, `role` or `aria-*`, because the accessible semantics differ
  per site and a leaf that guessed would duplicate or invent an announcement.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `value` | 0–100 | `0` | Out-of-range and non-finite input is clamped, so a caller handing it a raw ratio cannot paint a 4000%-wide fill. |
  | `tone` | `'success'` \| `'warning'` \| `'danger'` \| `'info'` \| `'accent'` \| `'neutral'` | `'success'` | An unknown tone falls back to `neutral` rather than rendering an unpainted fill. |
  | `color` | CSS colour | `''` | A colour the CALLER owns, applied inline and overriding `tone`, for a caller whose colour is authored DATA. A `style=` binding rather than a class, because a scoped `<style>` in the caller cannot reach a child component's element; a source colour literal would fail `tests/components/theme-colour-contract.test.js`, so a caller passes a token reference or runtime data, never a hex. |
  | `size` / `dataAttr` / `dataValue` | `'sm'` \| `'md'` / strings | `'md'` / `''` | A 6px or 8px track height, and an optional test/screenshot hook. |

  Invariants:
  - NO GRADIENT. `ui-integration/spec.md`'s semantic-slider geometry is deliberately NOT claimed:
    this is a value-width fill, never a full-track semantic scale.
  - Its scoped block reads theme-root tokens only, never an area-scoped `--fab-manager-*` property,
    per `openspec/specs/design-system/spec.md`.
-->
<script>
  let {
    value = 0,
    tone = 'success',
    color = '',
    size = 'md',
    dataAttr = '',
    dataValue = '',
  } = $props();

  const TONES = ['success', 'warning', 'danger', 'info', 'accent', 'neutral'];

  const pct = $derived.by(() => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
  });
  const resolvedTone = $derived(TONES.includes(tone) ? tone : 'neutral');
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<span
  class="fab-fill-bar"
  class:is-sm={size === 'sm'}
  data-fill-bar-tone={resolvedTone}
  {...hookAttributes}
>
  <span
    class={`fab-fill-bar-fill is-${resolvedTone}`}
    style={color ? `width: ${pct}%; background: ${color};` : `width: ${pct}%;`}
  ></span>
</span>

<style>
  .fab-fill-bar {
    position: relative;
    display: block;
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    height: 8px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-raised);
  }

  .fab-fill-bar.is-sm {
    height: 6px;
  }

  .fab-fill-bar-fill {
    position: absolute;
    inset: 0 auto 0 0;
    height: 100%;
    border-radius: 999px;
    background: var(--fab-text-subtle);
  }

  .fab-fill-bar-fill.is-success {
    background: var(--fab-success);
  }

  .fab-fill-bar-fill.is-warning {
    background: var(--fab-warning);
  }

  .fab-fill-bar-fill.is-danger {
    background: var(--fab-danger);
  }

  .fab-fill-bar-fill.is-info {
    background: var(--fab-info);
  }

  .fab-fill-bar-fill.is-accent {
    background: var(--fab-accent);
  }

  .fab-fill-bar-fill.is-neutral {
    background: var(--fab-text-subtle);
  }
</style>
