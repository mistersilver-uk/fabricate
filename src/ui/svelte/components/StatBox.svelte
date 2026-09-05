<!-- Svelte 5 runes mode -->
<!--
  THE AT-A-GLANCE FIGURE (issue 1505).

  ── WHY IT EXISTS ─────────────────────────────────────────────────────────────────
  `library.html:884-886` draws three of them in a row and captions the rule: "Never
  for a number the GM can edit — that is a stepper." Two screens had each hand-rolled
  the same box, in two directions at once — the player Shopping list at an 18px sans
  numeral over a sentence-case 10px label, the manager's item page at a 1.15rem sans
  numeral over a sentence-case 0.7rem label — and neither is the specimen. One
  component makes the figure ONE treatment and makes the label the shared `Kicker`,
  which is what `library.html:885` draws: `<div class="k-stat"><span class="v">…</span>
  <span class="k-kicker">…</span></div>`.

  ── THE FIGURES ───────────────────────────────────────────────────────────────────
  Geometry from `library.html:237-239`: `--fab-bg-1`, 1px `--fab-border`, r9,
  `var(--fab-space-3)`, centred, with the value at serif 17px / 700 / line-height 1.1.
  The label is a `Kicker` rather than a restatement of one.

  ── THE FOUR RECORDED DEVIATIONS FROM THAT SPECIMEN ───────────────────────────────
  1. `icon`. `library.html:237-239` draws no glyph, and the Shopping list renders one
     on the value line of all three cards (`fa-scroll`, `fa-cubes`,
     `fa-screwdriver-wrench`). Without the prop the conversion silently drops three
     glyphs. It sits INSIDE the value line, which is where those three sit today.
  2. `font-variant-numeric: tabular-nums` on the value, which `library.html:238`
     omits and both callers declare — the Shopping list on its count, and the
     already-converged manager stat family in `styles/fabricate.css` with the stated
     reason "so a 9 -> 10 change cannot reflow the tile". Three numerals in a
     3-column grid is where tabular figures matter most.
  3. The `tone` prop AT ALL. `library.html:237-239` declares no `.k-stat` variant, so
     all three values are derived from shipped caller states rather than from the
     specimen, and each is justified by a caller: `default` is the Shopping list's
     resting card and the item page's two plain figures; `info` is
     `ItemPageInspector`'s `is-accent`, which paints `--fab-info-text` and NOTHING
     else, so mapping it here rather than inventing an `accent` tone keeps the token
     unchanged; `danger` is the Shopping list's `is-alert`, which tints the edge, the
     fill and the glyph as well as being the state the label already names.
     So the model is: EVERY tone paints the value's ink, and `danger` additionally
     paints the edge, the fill and the glyph — because that is what the two shipped
     states are, and a model that tinted the item page's edge as well would move a
     frame nothing in the product asked to move.
  4. `dataAttr`/`dataValue`/`valueDataAttr`/`labelDataAttr`. Attribute-only, carrying
     no behaviour — see below.

  ── WHAT IT DOES NOT TAKE, AND WHY EACH ONE IS ABSENT ─────────────────────────────
  No `size`, no `unit`, no handler, no `warning` tone and no `accent` tone. The
  specimen states ONE treatment, and a second one is the drift this component exists
  to remove; `accent` in particular has no caller in this change, no test acting on
  it and no `.k-stat` variant on the specimen — `.k-kicker.accent` paints the LABEL's
  ink, not the value's — so shipping it would be exactly the unreachable
  configuration that withdrew the other three.

  No handler of any kind is the load-bearing one: `design-system/spec.md` routes "a
  number a GM can change" to a stepper and never to a stat box, and
  `tests/stat-box-source-contract.test.js` asserts that as a clause — this component
  accepts no `onChange`/`onInput`/`onclick` prop and emits no interactive element.
  The four hook props are what keeps that clause exhaustive: they are attribute-only
  and carry no behaviour, and the source contract enforces that every literal hook
  name at a call site starts with `data-`, because the name is caller-supplied and
  spread, so a non-`data-` key would become a real handler.

  No `class`, no `style` and no rest spread. A caller needing layout keeps its own
  wrapper — here, the grid both callers already own and which this component never
  touches.

  ── WHERE THE HOOKS SIT, WHICH IS WHY THERE ARE FOUR OF THEM ──────────────────────
  A hook is not layout, and the distinction is decided by WHERE each one sits.
  `ItemPageInspector.svelte` is the measured case: `[data-item-page-stats]` is the
  GRID, outside every box, and this component never sees it; `[data-item-page-stat]`
  is the box ROOT and rides `dataAttr`/`dataValue`; and `[data-item-page-recipe-count]`,
  `[data-item-page-mid-value]`, `[data-item-page-learned-by]` and
  `[data-item-page-mid-label]` sit INSIDE the box, on the two elements this component
  itself renders, and nine assertions read their `textContent`. So the value and the
  label take a hook prop each, the label's being forwarded into the composed `Kicker`
  because `library.html:885` draws the label AS the kicker and no wrapper element is
  permitted to carry a hook instead.

  Every one of those four is written BARE on an element today, so each is rendered
  with an EMPTY-STRING value here rather than the `="true"` a bare attribute on a
  component tag produces. Presence selectors resolve either way, which is exactly why
  the difference would not have been caught by the suites that read them.

  It is an IMPORT-FREE leaf but for `Kicker.svelte`, which it composes rather than
  restates. That makes `Kicker` a leaf TWO rungs down: a mount harness that compiles
  a caller of this component pulls `Kicker` in without naming a kicker anywhere, and
  a missing entry HANGS that suite (`# cancelled`) rather than failing it.

  Props:
   - value: the figure. Already formatted by the caller — this component does no
     arithmetic and no localization.
   - label: the micro-label beneath it, already localized, rendered as a `Kicker`.
   - icon: optional Font Awesome classes for a leading glyph on the value line.
   - tone: `'default' | 'info' | 'danger'`.
   - dataAttr / dataValue: an optional hook on the box root.
   - valueDataAttr: an optional hook on the value element.
   - labelDataAttr: an optional hook on the label, forwarded to the `Kicker`.
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

  /** The measured tone set. `warning` and `accent` have no caller and are not in it. */
  const TONES = new Set(['default', 'info', 'danger']);

  // An unknown tone falls back to `default` rather than rendering unstyled.
  const resolvedTone = $derived(TONES.has(tone) ? tone : 'default');

  // Spread so each hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match. `dataValue` is passed through as written — the empty string
  // included — so a hook written bare on the element it replaces renders `data-x=""`.
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
  /* Theme-root tokens ONLY. NO scoped `<style>` may reference `--fab-manager-*`, or any other
     custom property `styles/fabricate.css` declares inside `.fabricate-manager`, from ANY
     directory — a component is placed in a directory, not in a DOM subtree, so its scoped CSS
     cannot guarantee where its host renders, and `tests/token-generation-gate.test.js` reds the
     reference wherever it is written. Every token below is declared in `:root` and in all seven
     `.fabricate[data-fabricate-theme="…"]` blocks, which every Fabricate surface carries. */
  .fab-stat-box {
    /* See the Callout note: area-agnostic, so the padding model is declared rather than
       inherited from `.fabricate-manager * { box-sizing }`. */
    box-sizing: border-box;
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
    background: var(--fab-bg-1);
    text-align: center;
  }

  /* `display: block` is the specimen's `.k-stat .v`. The value and the label are the only two
     children and the box is centred, so there is nothing here for a flex column to do — and a
     flex column would have to restate the 2px both callers lose. */
  .fab-stat-box-value {
    display: block;
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 17px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  /* Only when a glyph is present, so the specimen's own case renders the specimen's own box.
     The figure is wrapped rather than left as a bare text run because a run directly inside a
     flex container is wrapped in an ANONYMOUS flex item that swallows the template's newlines,
     which would add a space's width beside the gap. Wrapped, the whitespace-only runs either
     side are not rendered at all. */
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

  /* `info` paints the value's ink and NOTHING else, which is the whole of what the manager's
     item page paints today. */
  .fab-stat-box.is-info .fab-stat-box-value {
    color: var(--fab-info-text);
  }

  /* `danger` paints the edge, the fill and the glyph as well, which is the whole of what the
     player's Shopping list paints today. */
  .fab-stat-box.is-danger {
    border-color: var(--fab-danger-border);
    background: var(--fab-danger-soft);
  }

  .fab-stat-box.is-danger .fab-stat-box-value,
  .fab-stat-box.is-danger .fab-stat-box-value i {
    color: var(--fab-danger-text);
  }
</style>
