<!-- Svelte 5 runes mode -->
<!--
  The manager's standing-statement primitive: a leading semantic glyph plus one sentence
  in a tinted, rounded strip. Use it for a permanent hint about how a surface behaves and
  for a conditional hazard warning — same function, same layout, ONE implementation.

  It exists because the two Knowledge tabs had drifted into two of them (issue 785). The
  Recipe items tab rendered `.manager-component-info-banner` (compact:
  `var(--fab-space-chip) var(--fab-space-2)` padding at `0.66rem`) and the Learned recipes
  tab rendered `.manager-warning-band .manager-knowledge-learned-band` (taller:
  `var(--fab-space-3)` padding at `0.7rem`/`500`/`1.45`) — the same strip at two sizes on
  adjacent tabs of one screen.

  ONE shape, both tones. The geometry and type are the taller treatment, which is the one
  already approved visually; `tone` is purely a colour concern and changes the edge, the
  fill and the glyph, never the padding or the type scale. A tone that changed size would
  reintroduce exactly the drift this component removes.

  Tone is a real distinction, not decoration. `info` is a permanent explanation of how the
  surface works; `warning` is a conditional hazard the GM can still avoid. A screen that
  paints its permanent hint in `warning` too has spent the colour that was supposed to
  make the hazard stand out, so pick `info` unless something is genuinely at risk.

  Its CSS lives in this scoped `<style>`, not `styles/fabricate.css`, so `VIEW_RECIPES` in
  `scripts/ui-pr-screenshot-evidence.mjs` maps a change here to the views that actually
  render it instead of matching the broad `theme-or-global-ui` recipe.

  Props:
   - tone: 'info' (default) or 'warning'.
   - icon: Font Awesome classes; defaults per tone (`fas fa-circle-info` /
     `fas fa-triangle-exclamation`).
   - text: the single sentence. One idea per strip.
   - dataAttr / dataValue: an optional test/screenshot hook, e.g.
     `dataAttr="data-knowledge-learned-banner"`.
-->
<script>
  let { tone = 'info', icon = '', text = '', dataAttr = '', dataValue = '' } = $props();

  const DEFAULT_ICONS = {
    info: 'fas fa-circle-info',
    warning: 'fas fa-triangle-exclamation',
  };

  // An unknown tone falls back to `info` rather than rendering an unstyled strip.
  const resolvedTone = $derived(tone === 'warning' ? 'warning' : 'info');
  const resolvedIcon = $derived(icon || DEFAULT_ICONS[resolvedTone]);

  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<p
  class="manager-callout"
  class:is-warning={resolvedTone === 'warning'}
  data-callout-tone={resolvedTone}
  {...hookAttributes}
>
  <i class={resolvedIcon} aria-hidden="true"></i>
  <span>{text}</span>
</p>

<style>
  /* Theme-root tokens ONLY. This component is area-agnostic, so it must not reference
     `--fab-mv2-*` or any other alias declared on `.fabricate-manager` (styles/fabricate.css
     declares those inside that area block). Outside the manager — `.fabricate-app`,
     `.fabricate-admin`, `.fabricate-interactables-manager` — such a property is not in
     scope, the declaration becomes invalid at computed-value time and the colour silently
     falls back to inheritance. Nothing fails; it just looks wrong, and the trigger is
     exactly the reuse this primitive exists to enable. Every token below is declared in
     `:root` or in all seven `.fabricate[data-fabricate-theme="…"]` blocks, which every
     Fabricate surface carries. */
  /* The geometry and type of the approved taller treatment: roomier vertical padding and
     a readable body scale, not the compact one-line info-strip scale. */
  .manager-callout {
    /* See the EmptyState note: area-agnostic, so the padding model is declared, not
       inherited from `.fabricate-manager * { box-sizing }`. */
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    margin: 0;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-info-border);
    border-radius: 8px;
    color: var(--fab-text);
    background: var(--fab-info-soft);
    font-size: 0.7rem;
    font-weight: 500;
    line-height: 1.45;
  }

  /* The glyph carries the tone at full strength while the sentence stays in the neutral
     body colour, so a long statement reads as prose rather than as coloured text. */
  .manager-callout > i {
    flex: 0 0 auto;
    color: var(--fab-info);
    font-size: 0.8rem;
  }

  /* `tone` changes the edge, the fill and the glyph. Nothing else. */
  .manager-callout.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }

  .manager-callout.is-warning > i {
    color: var(--fab-warning);
  }

  .manager-callout > span {
    min-width: 0;
  }
</style>
