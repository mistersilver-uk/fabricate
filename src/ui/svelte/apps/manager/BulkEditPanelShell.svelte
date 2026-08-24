<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE bulk edit panel CHROME: the header eyebrow + Clear, the accent count
  hero, the staged sections a caller supplies, and the Apply button (issue 772, extracted
  for issue 1010).

  It lives under `apps/manager/` rather than `apps/manager/components/` for the reason
  `BulkSelectionToolbar` records: `components/` holds area-agnostic leaves, this chrome is
  manager-scoped, and staying here keeps `--fab-mv2-*` in scope so the extraction is a pure
  move rather than a re-tokenisation.

  It renders in a browser's existing `.manager-inspector` column and REPLACES that
  browser's single-row inspector for as long as the selection is non-empty. The chrome is
  shared; what a studio STAGES is not, so the axes arrive as `children`.

  THE NOUN STAYS WITH THE STUDIO. `heading` ("3 components selected") and `applyLabel`
  ("Apply to 3 components") name what is being edited and are therefore the caller's
  strings; the panel title, the Clear action and the standing hint are noun-free and live
  in the neutral `Admin.Manager.BulkEdit.*` namespace here. (Written without its `FABRICATE`
  root on purpose: `tests/ui-lang-keys-resolve.test.js` scans every dotted literal in `src/`
  and pins how many of them resolve to an OBJECT, so a prose mention of a namespace base
  spelled in full counts as one and moves a number no behaviour changed.)

  Props:
   - heading: the hero's count sentence, already localized and already pluralized.
   - applyLabel: the Apply button's label, already localized and already pluralized. It
     names the exact blast radius.
   - canApply: Apply is GENUINELY inert until an axis is staged, so the GM cannot fire a
     no-op write and read success from it.
   - onClearSelection() / onApply().
   - panelAttr / clearAttr / countAttr / applyAttr: the four test and screenshot hook
     names, defaulted to the Component Studio's strings so its shipped call site, the smoke
     selectors and the view-lab cases keep working untouched.
   - children: the staged axes, rendered between the hero and Apply. They are FLEX ITEMS of
     this panel, so a caller emits its labels, controls and hints as siblings rather than
     wrapping them — the panel's uniform `gap` is the section rhythm.
-->
<script>
  import ManagerButton from '../../components/ManagerButton.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    heading = '',
    applyLabel = '',
    canApply = false,
    onClearSelection = () => {},
    onApply = () => {},
    panelAttr = 'data-component-bulk-panel',
    clearAttr = 'data-component-bulk-clear',
    countAttr = 'data-component-bulk-count',
    applyAttr = 'data-component-bulk-apply',
    children,
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Spread, following `Callout`'s hook idiom: the attribute NAME is a parameter, so it
  // cannot be written literally in the markup. The value is `''`, not `true` — Svelte
  // serializes `true` as `="true"` and these four hooks shipped as BARE attributes; see the
  // fuller note in `BulkSelectionToolbar.svelte`.
  const panelHook = $derived({ [panelAttr]: '' });
  const clearHook = $derived({ [clearAttr]: '' });
  const countHook = $derived({ [countAttr]: '' });
  const applyHook = $derived({ [applyAttr]: '' });
</script>

<section class="fab-bulk-edit-panel" {...panelHook}>
  <header class="fab-bulk-edit-header">
    <p class="fab-bulk-edit-eyebrow">
      {text('FABRICATE.Admin.Manager.BulkEdit.PanelTitle', 'Bulk edit')}
    </p>
    <button
      type="button"
      class="fab-bulk-edit-clear"
      {...clearHook}
      onclick={() => onClearSelection()}
    >
      <i class="fas fa-xmark" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.BulkEdit.ClearSelection', 'Clear selection')}</span>
    </button>
  </header>

  <div class="fab-bulk-edit-hero">
    <span class="fab-bulk-edit-hero-icon" aria-hidden="true"
      ><i class="fas fa-layer-group"></i></span
    >
    <div class="fab-bulk-edit-hero-copy">
      <strong class="fab-bulk-edit-hero-title" {...countHook}>{heading}</strong>
      <span class="fab-bulk-edit-hero-hint"
        >{text(
          'FABRICATE.Admin.Manager.BulkEdit.SelectedHint',
          'Stage changes below, then apply to all at once.'
        )}</span
      >
    </div>
  </div>

  {@render children?.()}

  <div class="fab-bulk-edit-dock">
    <ManagerButton
      class="fab-bulk-edit-apply"
      {...applyHook}
      disabled={!canApply}
      onclick={() => onApply()}
    >
      <i class="fas fa-check-double" aria-hidden="true"></i>
      <span>{applyLabel}</span>
    </ManagerButton>
  </div>
</section>

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is in scope. Its appearance lives
     HERE rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the views that actually
     render it instead of matching the broad `theme-or-global-ui` recipe. Because it sits
     OUTSIDE both `apps/manager/components/` and `apps/manager/recipes/`, it is enumerated
     BY NAME in that map's browser match lists; a new sibling here that is not enumerated
     falls through every glob and maps to no view at all. */

  .fab-bulk-edit-panel {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .fab-bulk-edit-header {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    justify-content: space-between;
    min-width: 0;
  }

  /* ACCENT, where the single-row inspector's eyebrow is subtle: the rail has changed what
     it is for, and that is the first thing the GM must read. */
  .fab-bulk-edit-eyebrow {
    margin: 0;
    color: var(--fab-mv2-accent);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* The documented escape from a mode that hides the single-row actions, so it is a real
     focusable button and the FIRST control in the panel — Foundry's host button geometry
     (fixed height, its own font) reset explicitly, as `Chip` does. */
  .fab-bulk-edit-clear {
    appearance: none;
    display: inline-flex;
    gap: var(--fab-space-chip);
    align-items: center;
    flex: 0 0 auto;
    width: auto;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--fab-mv2-text-muted);
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .fab-bulk-edit-clear:hover {
    color: var(--fab-mv2-text);
  }

  .fab-bulk-edit-clear:focus-visible {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  /* Apply's half of what used to be one group with the rule above. It is split out rather
     than left in it because the two controls are no longer the same KIND of element: Clear
     is written here and carries this component's scoping class, Apply is a `<ManagerButton>`
     and never will, so one selector cannot reach both. Nothing else in the sheet states an
     `outline` for a manager button, so this needs no chain — only the `:global()`, without
     which Apply would silently lose its keyboard focus ring. */
  :global(.fab-bulk-edit-apply:focus-visible) {
    outline: 2px solid var(--fab-mv2-accent);
    outline-offset: 2px;
  }

  .fab-bulk-edit-clear > i {
    font-size: 0.58rem;
  }

  /* The hero restates the blast radius in the rail, so the number the Apply button names
     is never the only place it appears. */
  .fab-bulk-edit-hero {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    min-width: 0;
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-accent-border);
    border-radius: 10px;
    background: var(--fab-accent-soft);
  }

  .fab-bulk-edit-hero-icon {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 9px;
    background: var(--fab-bg-0);
    color: var(--fab-mv2-accent);
    font-size: 0.86rem;
  }

  .fab-bulk-edit-hero-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .fab-bulk-edit-hero-title {
    color: var(--fab-mv2-text);
    font-family: var(--fab-font-serif);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .fab-bulk-edit-hero-hint {
    color: var(--fab-mv2-text-muted);
    font-size: 0.62rem;
    line-height: 1.35;
  }

  /* THE DOCK PINS APPLY TO THE RAIL'S BOTTOM EDGE. The panel is taller than the
     inspector's scrollport in the Recipe and Component studios, so the panel's primary
     action scrolled out of view exactly when the GM had staged enough to want it.

     TWO SUPPORTED CONFIGURATIONS DO NOT PIN. Both are accepted, and neither is a
     regression — `origin/main` behaves identically in each:
      - A STUDIO THAT RENDERS A SIBLING DELETE CARD. `EssenceBulkEditPanel` closes this shell
        and renders its delete card AFTER it, so the shell does not span that rail's
        scrollable height and Apply un-pins there. `ComponentBulkEditPanel` is the second
        such studio (issue 1129) and un-pins for the identical reason; this is a shape, not
        an Essence Studio quirk, so a third sibling-delete panel needs no new entry here.

        WHAT IS STILL GUARANTEED, AND WHERE THE BOUND IS (issue 1132). "Un-pinned" is not
        "unbounded". A sibling shortens `.fab-bulk-edit-panel`, which is this dock's
        CONTAINING BLOCK, so at maximum scroll the dock clamps to the PANEL's padding-box
        bottom instead of the rail's — measured at −142px on a staged recipe panel and −154px
        on a component panel. That is a rhythm regression, not a reachability one: Apply never
        leaves the scrollport, it merely stops being glued to the bottom edge. The requirement
        that survives is therefore the reachability one — APPLY'S BORDER BOX STAYS WHOLLY
        INSIDE THE SCROLLPORT AT EVERY SCROLL OFFSET — and it holds only WHILE THE SIBLING IS
        SHORTER THAN THE SCROLLPORT. A taller sibling scrolls Apply off the TOP, which is
        issue 1015's original symptom and is NOT accepted.

        That is a gate, not prose: `tests/components/bulk-edit-dock-pinning.test.js` mounts a
        real `BulkDeleteCard` after this shell and asserts exactly those two things, with the
        shorter-than-scrollport bound asserted first so the case cannot go vacuous. Do not
        move a delete card INSIDE this shell to "fix" the un-pin — placed after the dock it
        would leave the dock stuck out of flow OVER the card at maximum scroll, and it would
        contradict both studios' shipped layout.
      - A `fabricate-manager` CONTAINER AT 1120px OR NARROWER. There,
        `@container fabricate-manager (max-width: 1120px)` in `styles/fabricate.css` gives
        `.manager-body` `grid-auto-rows: max-content` + `overflow-y: auto`, so the BODY
        becomes the scrollport and `.manager-inspector` is sized to its content. A rail that
        never overflows has no scroll range, and a sticky box with no scroll range has
        nothing to stick within. Measured at a 1000px container: the rail does not scroll,
        the body does, and Apply's overhang runs 1350px to 0 across the range — against a
        perfect pin at 1400px. The manager's supported minimum is 1024px, so issue 1015's
        symptom does persist below that breakpoint. Closing it means re-deciding which box
        scrolls once the three regions stack, which is that block's decision and not this
        rule's; do NOT reach into the `@container` block from here.

     A SECOND sticky rule rather than reuse of `.manager-inspector-card.is-sticky`
     (styles/fabricate.css): that class is a bordered, rounded, TOP-anchored card SHELL,
     and Apply is not a card. This mirrors its idiom at the opposite edge — surface fill, a
     hairline against the content it covers, and a shadow thrown away from the edge it is
     pinned to — without inheriting a card's border box.

     NO `z-index`, deliberately. Nothing this dock can overlap establishes a competing
     stacking context: `Chip`, `BulkEditSelect` and all three bulk panels declare neither
     `position` nor `z-index`, and `SearchablePopover` portals out to the
     `.fabricate-manager` host rather than stacking inside the rail. A `z-index` here would
     be an unfalsifiable guess at a conflict that does not exist.

     ALL THREE BLEEDS ARE LOAD-BEARING, and the two vertical ones for DIFFERENT reasons.
     TWO clamps act on a sticky box at once, and each negative value answers one of them:

      - `bottom` answers the SCROLLPORT clamp. Chromium measures a sticky inset from the
        scroll container's CONTENT box, while the rail the GM sees runs on to its PADDING
        box — `--fab-space-3` lower, because `.manager-inspector` carries
        `padding: var(--fab-space-3)` (styles/fabricate.css). Measured by construction:
        with the rail's `padding-bottom` forced to 40px, `bottom: 0` still rests the dock on
        the content-box edge and the shipped inset still rests it exactly `--fab-space-3`
        below that edge. So the inset is what carries the fill out to the line the eye reads
        as the bottom of the rail, and it is written as the SAME token as the rail's padding
        so the two cannot drift apart.
      - `margin-bottom` answers the CONTAINING-BLOCK clamp. A sticky box may not escape its
        containing block — here `.fab-bulk-edit-panel` — and that clamp applies to its
        MARGIN box. At maximum scroll the panel's bottom edge has arrived at the rail's
        content-box bottom, so the clamp starts to bind at exactly the point the inset above
        needs the dock a `--fab-space-3` lower. The matching negative bottom margin lifts
        the margin box that far above the border box, which is what lets the border box keep
        the position the inset asked for.

     Measured on this shell in a real rail — `tests/components/bulk-edit-dock-pinning.test.js`
     renders precisely this stack — with the rail's padding-box bottom at 520 and its
     content-box bottom at 508, reading the dock's bottom at scroll top / mid / max:

       bottom -space-3 + margin-bottom -space-3   520 / 520 / 519.91   <- shipped
       bottom -space-3, no margin-bottom          520 / 520 / 507.91   <- drops at the end
       bottom 0, with or without the margin       508 / 508 / 508      <- a strip uncovered
       no `position: sticky` at all               643 / 582 / 520      <- meets only at max

     All three declarations are therefore load-bearing, and the last row is why that gate
     samples the TOP of the scroll range as well as the bottom: a dock that never sticks at
     all is indistinguishable from a pinned one at maximum scroll.

     The inline pair is the same trade sideways: the negative margin takes the fill out to
     the rail's edges so the dock reads as an edge rather than a floating slab, and the
     matching padding puts the button back exactly where it was.

     THE BUTTON'S OWN BOX IS UNTOUCHED. `.fab-bulk-edit-apply` swaps places with
     `.manager-component-browser-inspector-edit` in the rail's bottom slot, so a changed
     min-height or font-size would desynchronise the swap. The dock therefore adds no
     padding, border or min-height that resizes or re-types the button. */
  .fab-bulk-edit-dock {
    position: sticky;
    bottom: calc(-1 * var(--fab-space-3));
    margin-inline: calc(-1 * var(--fab-space-3));
    margin-bottom: calc(-1 * var(--fab-space-3));
    padding-inline: var(--fab-space-3);
    padding-bottom: var(--fab-space-3);
    border-top: 1px solid var(--fab-mv2-border);
    background: var(--fab-mv2-surface-1);
    box-shadow: 0 -2px 6px var(--fab-overlay-dark-25);
  }

  /* Full-width and accent, the loudest thing on the panel — and genuinely inert until an
     axis is staged, so the GM cannot fire a no-op write and read success from it.
     Geometry, weight and foreground are the browser inspector's primary button verbatim
     (`.manager-button.manager-component-browser-inspector-edit`, styles/fabricate.css),
     because this button LITERALLY SWAPS PLACES with it in the rail's bottom slot the
     moment a box is ticked: 38px and 0.78rem, so the swap does not resize or re-type the
     slot, and `--fab-on-accent` — the token that means "foreground ON an accent fill" —
     rather than `--fab-bg-1`, which is a surface colour and differs from it in all seven
     themes.

     `:global()` AND CHAINED (issue 1118), and both halves are load-bearing.

     `:global()` first, because Apply is a `<ManagerButton>` now and a scoped selector could
     not reach it at all. Svelte scopes a rule by appending its `svelte-<hash>` class to the
     selector and stamping that class onto the elements THIS component writes — it does not
     stamp a child component's internals, and a `class` prop passed to a child is forwarded
     verbatim. So `.fab-bulk-edit-apply.svelte-<hash>` matched nothing the moment this button
     became a component, and Svelte reported NO unused-selector warning for it, because the
     class literal is right there in the markup. The failure is silent in the compiler, in
     `lint:svelte:warnings` and in any fixture that stamps the hash by hand
     (`tests/helpers/scoped-component-css.js` does exactly that) — only
     `bulk-edit-dock-pinning.test.js`, which mounts the real component, could see it, and it
     did: Apply lost `width: 100%` and stopped filling the rail.

     Then chained, because `:global()` alone would be (0,2,0) and lose outright to
     `.fabricate-manager .manager-button.fab-manager-button` (0,3,0): this button would have
     given up `min-height` 38px for 34px and `font-size` 0.78rem for 0.72rem — the two values
     the dock comment above says must not change, because Apply swaps places with
     `.manager-component-browser-inspector-edit` in the rail's bottom slot and a resized or
     re-typed box desynchronises the swap. Naming the ancestor and both primitive classes
     takes it to (0,4,0), which wins on specificity rather than on where the sheet happens to
     be injected — see the header of `tests/helpers/scoped-component-css.js` for why
     injection order is not a thing a rule may depend on. The `:hover`, `:disabled` and
     `:focus-visible` companions below are written the same way for the same two reasons. */
  :global(.fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply) {
    display: flex;
    gap: var(--fab-space-chip);
    align-items: center;
    justify-content: center;
    width: 100%;
    height: auto;
    min-height: 38px;
    margin-top: var(--fab-space-1);
    padding: 0 var(--fab-space-3);
    border: 1px solid var(--fab-accent-border);
    border-radius: 9px;
    color: var(--fab-on-accent);
    background: var(--fab-accent);
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  /* The same accent-strong hover its twin carries. Without it the rail's primary action
     is the only button on the panel with no pointer feedback. */
  :global(
    .fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply:not(:disabled):hover
  ) {
    border-color: var(--fab-accent);
    background: var(--fab-accent-strong);
  }

  :global(.fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply:disabled) {
    border-color: var(--fab-mv2-border);
    color: var(--fab-text-disabled);
    background: var(--fab-surface-soft);
    cursor: default;
  }
</style>
