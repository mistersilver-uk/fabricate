<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE no-state primitive: one dashed panel, one rounded icon tile, a serif
  title, a capped body line and an optional way out. Matched to the reference prototype
  (padding 44px 20px · 1.5px dashed · radius 12px · no fill · 9px gap · 46px tile holding
  an 18px subtle glyph · 13px/600 serif title · 11px/1.5 subtle body).

  Every manager "nothing here" message renders through this component — a central panel,
  or `compact` for a sidebar, popover or inline one. There is no shared `.manager-empty`
  CSS class for a screen to hand-roll markup against any more: the appearance lives in
  this file's scoped `<style>`, so a site that does not import this component gets no
  empty-state styling at all. That is deliberate. It also keeps required-screenshot
  detection honest: `VIEW_RECIPES` in `scripts/ui-pr-screenshot-evidence.mjs` maps changed
  FILE PATHS to views, so a tweak here matches only the recipes that name this component
  instead of the broad `theme-or-global-ui` recipe a global-sheet edit triggers.

  The `.manager-empty` class name is retained (not renamed) because the smoke harness and
  several mounted tests locate the panel by it, and because a handful of LAYOUT-CONTEXT
  rules still legitimately live in `styles/fabricate.css` — an ancestor cannot be reached
  from a scoped block, so a rule like
  `.manager-task-required-tools-scroll > .manager-empty { flex; width; min-height }` stays
  global. Those rules own only how the panel is placed by its container, never how it
  looks.

  The DOM shape is part of the contract: the icon, title and body rules are written as
  `> div > i` / `h3` / `p` descendants of an inner stack `<div>`, so the wrapper cannot be
  flattened without silently dropping the icon tile and the stack gap.

  Props:
   - icon: Font Awesome classes for the glyph (omit for a panel with no tile).
   - title: the short statement of what is absent (omit for a one-sentence panel).
   - hint: the optional explanatory sentence beneath it.
   - compact: smaller tile and tighter padding for sidebars, popovers and inline panels.
   - inline: the ONE-LINE form (issue 1286) — the stack becomes a ROW and the 46px icon
     tile is released into a bare inline glyph, so the panel reads as a single sentence
     with a leading mark rather than as a centred hero block. It is NOT a smaller
     `compact`: `compact` keeps the tile (at 32px) and keeps the column, and a "nothing
     goes wrong with this component yet" line sitting directly above an Add button cannot
     afford either. The Component Studio's complications section is its first consumer;
     the PLAYER app's own empties (`salvage-empty`, `alchemy-*-empty`,
     `inventory-detail-empty-note`) are still a different area shell and are NOT this
     variant's remit, as the note at the foot of this block says of the primitive at large.
   - filtered: the filtered-to-nothing treatment — a quieter, wider-padded panel for
     "your filters match nothing", which is not an absence of content and deliberately
     skips the icon/title apparatus while keeping ONE dashed panel vocabulary.
   - contextClass: extra class(es) whose rules live in the global sheet because they
     describe how a specific container places this panel (fill, min-height). Never use it
     for appearance — add a prop here instead.
   - dataAttr / dataValue: an optional test/screenshot hook, e.g.
     `dataAttr="data-knowledge-learned-empty"`.
   - children: trailing content inside the panel — a "Clear filters" button, a primary
     CTA, or a docs link. It is the way out of the dead end, so it belongs inside the
     panel rather than beside it.

  A component wearing `.manager-*` classes belongs under `apps/manager/` (not the
  import-free `components/` leaf directory), which is why it lives here. The player app's
  own empties (`salvage-empty`, `alchemy-*-empty`, `inventory-detail-empty-note`) are a
  different area shell with their own scoped styles and are NOT this primitive's remit.
-->
<script>
  let {
    icon = '',
    title = '',
    hint = '',
    compact = false,
    inline = false,
    filtered = false,
    contextClass = '',
    dataAttr = '',
    dataValue = '',
    children = undefined,
  } = $props();

  // Spread so the hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
</script>

<div
  class="manager-empty {contextClass}"
  class:is-compact={compact}
  class:is-inline={inline}
  class:is-filtered={filtered}
  {...hookAttributes}
>
  <div>
    {#if icon}
      <i class={icon} aria-hidden="true"></i>
    {/if}
    {#if title}
      <h3>{title}</h3>
    {/if}
    {#if hint}
      <p>{hint}</p>
    {/if}
    {#if children}
      {@render children()}
    {/if}
  </div>
</div>

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
  /* The no-state panel, matched to the reference prototype:
       padding 44px 20px · 1.5px dashed · radius 12px · no fill · 9px stack gap
     Height is padding-driven, as in the prototype — the old 220px floor made every empty
     state taller than its design. */
  .manager-empty {
    /* Declared here rather than leaned on: `.fabricate-manager * { box-sizing }` covers
       every current consumer, but an area-agnostic primitive that a container widens to
       `width: 100%` must not depend on the host area for its padding model. */
    box-sizing: border-box;
    display: grid;
    place-items: center;
    padding: 44px 20px;
    border: 1.5px dashed var(--fab-border);
    border-radius: 12px;
    color: var(--fab-text-subtle);
    text-align: center;
  }

  .manager-empty > div {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  /* A 46px rounded tile holding an 18px glyph in the SUBTLE tone — the prototype's icon is
     both smaller and dimmer than a heading. It previously rendered at 1.55rem in the full
     text colour, which read as the loudest thing in an otherwise quiet panel. Spacing comes
     from the stack gap, not a margin. */
  .manager-empty > div > i {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 46px;
    border-radius: 12px;
    color: var(--fab-text-subtle);
    background: var(--fab-surface-soft);
    font-size: 18px;
  }

  /* Serif title at the prototype's 13px/600 in the secondary tone, over an 11px body in the
     subtle tone capped at 280px so the sentence wraps into a readable column instead of
     spanning a wide pane. Matches the Tool Studio's type scale rather than the ambient ~1rem
     the old 0.98rem heading approximated. */
  .manager-empty h3 {
    margin: 0;
    color: var(--fab-text-secondary);
    font-family: var(--fab-font-serif);
    font-size: 13px;
    font-weight: 600;
    line-height: 1.25;
  }

  /* `overflow-wrap` is carried here for every consumer rather than by a `.manager-muted`
     class a few sites used to add by hand: an unbreakable token (a long item name, a
     pasted uuid) otherwise overflows the 280px cap. */
  .manager-empty p {
    max-width: 280px;
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 11px;
    line-height: 1.5;
    overflow-wrap: break-word;
  }

  /* The sidebar / inline scale of the same vocabulary: same dashed panel, tile and type,
     just less furniture. A roster column, a dropdown popover or an inline card cannot
     afford the 44px hero padding, and the alternative — a bare sentence — is what made
     these states look unrelated to each other in the first place. */
  .manager-empty.is-compact {
    padding: var(--fab-space-4) var(--fab-space-3);
  }

  .manager-empty.is-compact > div {
    gap: var(--fab-space-chip);
  }

  .manager-empty.is-compact > div > i {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    font-size: 14px;
  }

  .manager-empty.is-compact h3 {
    font-size: 12px;
  }

  /* The ONE-LINE variant (issue 1286): `display:flex; align-items:center; gap:10px;
     padding:14px 16px` with a 13px glyph, taken from the prototype's own empty. Two
     declarations do the work, and BOTH are required — `is-compact` already makes the panel
     smaller and would have been the cheap answer:

       1. the inner stack flips from a column to a ROW, so the glyph sits beside the
          sentence instead of above it;
       2. the 46px icon TILE is released — width, height, radius, fill and all — into a
          bare glyph. `is-compact` only shrinks the tile to 32px, which is a third tile
          size, not the absence of one.

     Written AFTER `.is-compact` so a caller that (wrongly) set both still gets the row.
     The dashed edge, the border radius and the type stay exactly the shared panel's: this
     is one vocabulary at a second density, which is the whole reason it is a variant here
     rather than a hand-rolled dashed div in the section that needs it. */
  .manager-empty.is-inline {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    padding: 14px 16px;
    text-align: left;
  }

  .manager-empty.is-inline > div {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .manager-empty.is-inline > div > i {
    width: auto;
    height: auto;
    border-radius: 0;
    background: none;
    font-size: 13px;
  }

  /* The 280px column cap is a HERO-panel rule: it exists so a centred sentence wraps into a
     readable measure. On one line it would clip the sentence into a narrow column beside
     the glyph, which is the opposite of what this variant is for. */
  .manager-empty.is-inline p {
    max-width: none;
    font-size: 11.5px;
  }

  /*
    Filtered to nothing is not an error and does not want the full empty-panel apparatus
    (a 46px icon, an <h3>, a paragraph). One dashed panel says it in a sentence, and the
    Clear-filters button — which the prototype has no equivalent of, and which is kept —
    is the way out of it.
  */
  .manager-empty.is-filtered {
    align-content: center;
    padding: 40px;
    border-color: var(--fab-border-strong);
  }

  .manager-empty.is-filtered > div {
    gap: var(--fab-space-3);
  }

  .manager-empty.is-filtered p {
    font-size: 0.8rem;
  }
</style>
