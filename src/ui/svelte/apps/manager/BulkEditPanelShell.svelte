<!--
  The manager's one bulk-edit panel chrome: the eyebrow and Clear, the accent count hero, the
  caller's staged axes, and the docked Apply (issue 772, extracted for issue 1010). It replaces a
  browser's single-row inspector for as long as the selection is non-empty.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `heading` / `applyLabel` / `clearLabel` / `hint` | string | `''` | the hero's count sentence and Apply's label, already localized and pluralized — Apply's names the blast radius; the last two are already-localized overrides, and `''` keeps `BulkEdit.ClearSelection` / `BulkEdit.SelectedHint`. The noun stays with the studio: this panel's own copy is noun-free under `Admin.Manager.BulkEdit.*`, a namespace written without its `FABRICATE` root on purpose, since `tests/ui-lang-keys-resolve.test.js` scans every dotted literal in `src/`. |
  | `canApply` | boolean | `false` | Apply is genuinely inert until an axis is staged, so a no-op write cannot read as success |
  | `dockBleed` | `''` \| `'space-4'` | `''` | the spacing token the dock bleeds by; it must equal the containing rail's padding |
  | `panelAttr` / `clearAttr` / `countAttr` / `applyAttr` | string | the Component Studio's | test, smoke and view-lab hook names |
  | `onClearSelection()` / `onApply()` | | | the two callbacks |

  Snippets:
  - `children` — the staged axes, rendered between hero and dock. They are flex items of this panel,
    so a caller emits siblings rather than wrapping them; the panel's `gap` is the rhythm.
  - `dockFoot` — a caller's control inside the dock, under Apply.

  Invariants:
  - Apply's border box stays wholly inside the scrollport at every scroll offset, and that holds
    only while a sibling delete card is shorter than the scrollport — pinned by
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

  // Spread because the NAME is a parameter, with `''`: Svelte serializes `true` as `="true"`.
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
  /* Theme-root tokens only — design-system spec, *The token namespace is one generation and names
     its purpose*. The appearance lives here so `VIEW_RECIPES` routes a change to the views that
     render it, and this file is enumerated BY NAME there. */

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

  .fab-bulk-edit-eyebrow {
    margin: 0;
    color: var(--fab-accent);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* The documented escape from a mode that hides the single-row actions. */
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

  /* The dock pins Apply to the rail's bottom edge (issue 1015). All three negative bleeds are
     load-bearing, and the two vertical ones answer different clamps: `bottom` answers the
     scrollport clamp, since Chromium measures a sticky inset from the scroll container's CONTENT
     box while the rail runs on to its padding box; `margin-bottom` answers the containing-block
     clamp, which applies to the sticky box's MARGIN box at maximum scroll. Both are written as
     `.manager-inspector`'s own padding token so the two cannot drift, and
     `tests/components/bulk-edit-dock-pinning.test.js` samples the top of the scroll range as well
     as the bottom, because a dock that never sticks looks pinned at maximum scroll. Two
     configurations do not pin and neither is a regression: a SIBLING delete card un-pins it, and
     below the supported minimum the sheet's container query makes `.manager-body` the scrollport —
     do not reach into that block from here. No `z-index`, deliberately. */
  .fab-bulk-edit-dock {
    position: sticky;
    bottom: calc(-1 * var(--fab-space-3));
    margin-inline: calc(-1 * var(--fab-space-3));
    margin-bottom: calc(-1 * var(--fab-space-3));
    padding-top: var(--fab-space-3);
    padding-inline: var(--fab-space-3);
    padding-bottom: var(--fab-space-3);
    border-top: 1px solid var(--fab-border);
    background: var(--fab-bg-2);
    box-shadow: 0 -2px 6px var(--fab-overlay-dark-25);
  }

  /* Gated on the snippet: with no `dockFoot` the dock is byte-identical to what ships. */
  .fab-bulk-edit-dock.has-foot {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  /* A flex item's automatic minimum is its min-content width, so a `nowrap` delete label would
     widen the column past the rail. `:global` because the snippet's root is the consumer's. */
  .fab-bulk-edit-dock.has-foot > :global(*) {
    min-width: 0;
  }

  /* The base rule's container-bound declarations restated at the wider token, gated on `dockBleed`
     so the three studios in the shared rail are byte-identical. */
  .fab-bulk-edit-dock.is-bleed-space-4 {
    bottom: calc(-1 * var(--fab-space-4));
    margin-inline: calc(-1 * var(--fab-space-4));
    margin-bottom: calc(-1 * var(--fab-space-4));
    padding-inline: var(--fab-space-4);
    padding-bottom: var(--fab-space-4);
  }

  /* Full-width and accent, inert until an axis is staged. Geometry, weight and foreground are the
     browser inspector's primary button verbatim, because this button swaps places with it in the
     rail's bottom slot. `:global()` AND chained, both load-bearing (issue 1118): `:global()`
     because Apply is a `<ManagerButton>` whose internals Svelte does not stamp, so a scoped
     selector matches nothing with no unused-selector warning; chained because `:global()` alone is
     (0,2,0) and loses to the primitive's own (0,3,0) compound. The `:hover`, `:disabled` and
     `:focus-visible` companions below are written the same way. */
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

  /* Apply's half of what was one focus group with `.fab-bulk-edit-clear`: Clear carries this
     component's scoping class and Apply never will, so one selector cannot reach both. Anchored
     and chained like its companions, because the sheet states the same declarations at (0,2,1). */
  :global(.fabricate-manager .manager-button.fab-manager-button.fab-bulk-edit-apply:focus-visible) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
