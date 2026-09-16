<!-- Svelte 5 runes mode -->
<!--
  The manager's one bulk-edit panel chrome: the eyebrow and Clear, the accent count hero, the
  caller's staged axes, and the docked Apply (issue 772, extracted for issue 1010). It replaces
  a browser's single-row inspector for as long as the selection is non-empty.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `heading` | string | `''` | the hero's count sentence, already localized and pluralized |
  | `applyLabel` | string | `''` | Apply's label, already localized and pluralized; it names the blast radius |
  | `canApply` | boolean | `false` | Apply is genuinely inert until an axis is staged, so a no-op write cannot read as success |
  | `clearLabel` | string | `''` | already-localized override for Clear; `''` keeps `BulkEdit.ClearSelection` |
  | `hint` | string | `''` | already-localized override for the hero sentence; `''` keeps `BulkEdit.SelectedHint` |
  | `dockBleed` | `''` \| `'space-4'` | `''` | the spacing token the dock bleeds by; it must equal the containing rail's padding |
  | `panelAttr` / `clearAttr` / `countAttr` / `applyAttr` | string | the Component Studio's | test, smoke and view-lab hook names |

  Snippets:
  - `children` — the staged axes, rendered between hero and dock. They are flex items of this
    panel, so a caller emits siblings rather than wrapping them; the panel's `gap` is the rhythm.
  - `dockFoot` — a caller's control inside the dock, under Apply (`proto:791-796`).

  Callbacks:
  - `onClearSelection()` / `onApply()`.

  Invariants:
  - The noun stays with the studio: `heading` and `applyLabel` are the caller's strings, and
    this panel's own copy is noun-free under `Admin.Manager.BulkEdit.*`. That namespace is
    written without its `FABRICATE` root on purpose — `tests/ui-lang-keys-resolve.test.js`
    scans every dotted literal in `src/`, so a prose mention spelled in full counts as one.
  - Apply's border box stays wholly inside the scrollport at every scroll offset, and that
    holds only while a sibling delete card is shorter than the scrollport — pinned by
    `tests/components/bulk-edit-dock-pinning.test.js`.
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
    // Already localized; `''` keeps the shipped `Clear selection`.
    clearLabel = '',
    // Already localized; `''` keeps the shipped noun-free copy.
    hint = '',
    dockFoot = undefined,
    // `''` (the shared rail's `--fab-space-3`) or `'space-4'` (the scoped list frame's column).
    dockBleed = '',
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

  // Spread because the attribute NAME is a parameter. The value is `''`, not `true`: Svelte
  // serializes `true` as `="true"` and these four hooks shipped as bare attributes.
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
      <span
        >{clearLabel ||
          text('FABRICATE.Admin.Manager.BulkEdit.ClearSelection', 'Clear selection')}</span
      >
    </button>
  </header>

  <div class="fab-bulk-edit-hero">
    <span class="fab-bulk-edit-hero-icon" aria-hidden="true"
      ><i class="fas fa-layer-group"></i></span
    >
    <div class="fab-bulk-edit-hero-copy">
      <strong class="fab-bulk-edit-hero-title" {...countHook}>{heading}</strong>
      <span class="fab-bulk-edit-hero-hint"
        >{hint ||
          text(
            'FABRICATE.Admin.Manager.BulkEdit.SelectedHint',
            'Stage changes below, then apply to all at once.'
          )}</span
      >
    </div>
  </div>

  {@render children?.()}

  <div
    class="fab-bulk-edit-dock"
    class:has-foot={Boolean(dockFoot)}
    class:is-bleed-space-4={dockBleed === 'space-4'}
  >
    <ManagerButton
      class="fab-bulk-edit-apply"
      {...applyHook}
      disabled={!canApply}
      onclick={() => onApply()}
    >
      <i class="fas fa-check-double" aria-hidden="true"></i>
      <span>{applyLabel}</span>
    </ManagerButton>
    {@render dockFoot?.()}
  </div>
</section>

<style>
  /* Theme-root tokens only — design-system spec, *The token namespace is one generation and
     names its purpose*, gated by `tests/token-generation-gate.test.js`. This appearance lives
     here rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the views that render it; sitting
     outside `apps/manager/components/` and `apps/manager/recipes/`, it is enumerated BY NAME in
     that map, and an unenumerated sibling here maps to no view at all. */

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

  /* Accent where the single-row inspector's eyebrow is subtle: the rail has changed what it is
     for, and that is the first thing the GM must read. */
  .fab-bulk-edit-eyebrow {
    margin: 0;
    color: var(--fab-accent);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* The documented escape from a mode that hides the single-row actions, so it is a real
     focusable button and the first control in the panel; Foundry's host button geometry is reset
     explicitly, as `Chip` does. */
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
    color: var(--fab-text-muted);
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .fab-bulk-edit-clear:hover {
    color: var(--fab-text);
  }

  .fab-bulk-edit-clear:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .fab-bulk-edit-clear > i {
    font-size: 0.58rem;
  }

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
    color: var(--fab-accent);
    font-size: 0.86rem;
  }

  .fab-bulk-edit-hero-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .fab-bulk-edit-hero-title {
    color: var(--fab-text);
    font-family: var(--fab-font-serif);
    font-size: 0.92rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .fab-bulk-edit-hero-hint {
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    line-height: 1.35;
  }

  /* The dock pins Apply to the rail's bottom edge; the panel is taller than the inspector's
     scrollport in the Recipe and Component studios (issue 1015).

     All three negative bleeds are load-bearing, and the two vertical ones answer different
     clamps: `bottom` answers the scrollport clamp, because Chromium measures a sticky inset
     from the scroll container's CONTENT box while the rail runs on to its padding box, one
     `--fab-space-3` lower; `margin-bottom` answers the containing-block clamp, which applies to
     the sticky box's MARGIN box and starts to bind at maximum scroll. Both are written as the
     same token as `.manager-inspector`'s padding so the two cannot drift.
     `tests/components/bulk-edit-dock-pinning.test.js` samples the top of the scroll range as
     well as the bottom, because a dock that never sticks is indistinguishable from a pinned one
     at maximum scroll.

     Two configurations do not pin, and neither is a regression. A studio that renders a SIBLING
     delete card after this shell un-pins because the shell no longer spans the rail's scrollable
     height; what survives is reachability, and only while that sibling is shorter than the
     scrollport. Below the manager's 1024px supported minimum,
     `@container fabricate-manager (max-width: 1120px)` in `styles/fabricate.css` makes
     `.manager-body` the scrollport, and a rail with no scroll range has nothing to stick within
     — do not reach into that block from here.

     No `z-index`, deliberately: nothing this dock can overlap establishes a competing stacking
     context, and `SearchablePopover` portals out to the `.fabricate-manager` host.

     The button's own box is untouched. `.fab-bulk-edit-apply` swaps places with
     `.manager-component-browser-inspector-edit` in the rail's bottom slot, so the dock adds no
     padding, border or min-height that would resize or re-type it. */
  .fab-bulk-edit-dock {
    position: sticky;
    bottom: calc(-1 * var(--fab-space-3));
    margin-inline: calc(-1 * var(--fab-space-3));
    margin-bottom: calc(-1 * var(--fab-space-3));
    /* The foot's own inset, so every consumer's foot breathes the same; Apply's `margin-top`
       moved here with it. */
    padding-top: var(--fab-space-3);
    padding-inline: var(--fab-space-3);
    padding-bottom: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
    box-shadow: 0 -2px 6px var(--fab-overlay-dark-25);
  }

  /* Gated on the snippet rather than declared unconditionally: with one child the two display
     modes are not obviously identical, and `.fab-bulk-edit-apply`'s `margin-top` is a block-flow
     question in one mode and not a question at all in the other. With no `dockFoot` the class is
     not emitted and the dock is byte-identical to what ships. */
  .fab-bulk-edit-dock.has-foot {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* A flex item's automatic minimum is its min-content width, so a `nowrap` delete label would
     widen the column past the rail instead of ellipsising. Stated on the dock because every
     consumer needs the same answer, and `:global` because the snippet's root carries the
     consumer's scope hash and never this one's. */
  .fab-bulk-edit-dock.has-foot > :global(*) {
    min-width: 0;
  }

  /* The base rule's five container-bound declarations restated at the wider token, for a
     container that pads `--fab-space-4`. Gated on `dockBleed`, so the three studios in the
     shared rail are byte-identical. */
  .fab-bulk-edit-dock.is-bleed-space-4 {
    bottom: calc(-1 * var(--fab-space-4));
    margin-inline: calc(-1 * var(--fab-space-4));
    margin-bottom: calc(-1 * var(--fab-space-4));
    padding-inline: var(--fab-space-4);
    padding-bottom: var(--fab-space-4);
  }

  /* Full-width and accent, and genuinely inert until an axis is staged. Geometry, weight and
     foreground are the browser inspector's primary button verbatim
     (`.manager-button.manager-component-browser-inspector-edit`, styles/fabricate.css), because
     this button literally swaps places with it in the rail's bottom slot: 38px and 0.78rem, and
     `--fab-on-accent` rather than the surface colour `--fab-bg-1`.

     `:global()` AND chained, both load-bearing (issue 1118). `:global()` because Apply is a
     `<ManagerButton>` and Svelte does not stamp a child component's internals, so a scoped
     selector matches nothing while the compiler reports no unused-selector warning. Chained
     because `:global()` alone is (0,2,0) and loses to
     `.fabricate-button.manager-button.fab-manager-button` (0,3,0), which would give up the two
     values the dock comment above says must not change; naming the ancestor and both primitive
     classes takes it to (0,4,0), winning on specificity rather than on injection order. The
     `:hover`, `:disabled` and `:focus-visible` companions below are written the same way. */
  :global(.fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply) {
    display: flex;
    gap: var(--fab-space-chip);
    align-items: center;
    justify-content: center;
    width: 100%;
    height: auto;
    min-height: 38px;
    margin-top: 0;
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

  :global(
    .fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply:not(:disabled):hover
  ) {
    border-color: var(--fab-accent);
    background: var(--fab-accent-strong);
  }

  :global(.fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply:disabled) {
    border-color: var(--fab-border);
    color: var(--fab-text-disabled);
    background: var(--fab-surface-soft);
    cursor: default;
  }

  /* Apply's half of what used to be one focus group with `.fab-bulk-edit-clear`: Clear is
     written here and carries this component's scoping class, Apply is a `<ManagerButton>` and
     never will, so one selector cannot reach both. Anchored and chained like its three
     companions, because `styles/fabricate.css` states `.fabricate button:focus-visible` at
     (0,2,1) with byte-identical declarations — an unchained rule here carries no weight. */
  :global(.fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
