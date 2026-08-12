<!-- Svelte 5 runes mode -->
<!--
  The product's ONE horizontal fill bar: a rounded track with a value-width fill.

  `ui-integration/spec.md` §Shared product UI primitives records five hand-rolled copies of
  this shape as a live non-conformance and names this component as the fix, including that
  `ChanceBar` must be REBUILT on it rather than widened — `ChanceBar` is a percentage
  instrument and does not own the have/need meaning, so widening it in place would make it
  the second component owning half a meaning.

  It is a LEAF. It renders the track and the fill and nothing else: no caption, no percent
  readout, no `role`, no `aria-*`. Those belong to the caller, because the accessible
  semantics differ per site — `ChanceBar` is a `meter` with its own `aria-valuenow`, while
  an odds histogram row is a label/value pair whose bar is decorative. A leaf that guessed
  would either duplicate the caller's announcement or invent one.

  §Semantic slider geometry is deliberately NOT claimed here: this is a value-width fill
  ("progress to the current value"), never a full-track semantic scale, so it renders a
  flat fill and no gradient. The band strip that DOES paint a scale across a track is
  `ThresholdBandStrip`, and it renders discrete solid bands rather than a gradient too.

  Props:
   - value: the fill percentage, 0–100. Out-of-range and non-finite input is clamped, so a
     caller that hands it a raw ratio cannot paint a 4000%-wide fill.
   - tone: the semantic fill colour — 'success' (default), 'warning', 'danger', 'info',
     'accent' or 'neutral'. An unknown tone falls back to 'neutral' rather than rendering
     an unpainted fill.
   - color: a CSS colour the CALLER owns, applied inline and overriding `tone`. Two kinds
     of caller need it: one whose colour is authored DATA (an outcome tier's own swatch),
     and one whose scale is its own domain meaning rather than one of the tones above
     (`ChanceBar`'s reversed four-step event scale, where a high chance is bad). It is a
     `style=` binding rather than a class because a scoped `<style>` in the caller cannot
     reach a child component's element at all; a source colour literal would fail
     `tests/components/theme-colour-contract.test.js`, so a caller passes a token
     reference or authored runtime data, never a hex.
   - size: 'sm' (6px) or 'md' (8px, default) track height.
   - dataAttr / dataValue: an optional test/screenshot hook.

  A component under `components/` may not reference `--fab-mv2-*` or any other alias
  declared on `.fabricate-manager`; every token below is declared in `:root` and in all
  seven theme blocks.
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
    // Only NaN falls back to zero — an UNREADABLE value paints nothing, which is the honest
    // reading of "I do not know". `Infinity` is readable and clamps to a full track like any
    // other over-range number; treating it as zero would paint an empty bar for a value that
    // plainly means "all of it".
    if (Number.isNaN(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
  });
  const resolvedTone = $derived(TONES.includes(tone) ? tone : 'neutral');
  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
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
