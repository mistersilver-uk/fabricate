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

  <button
    type="button"
    class="manager-button fab-bulk-edit-apply"
    {...applyHook}
    disabled={!canApply}
    onclick={() => onApply()}
  >
    <i class="fas fa-check-double" aria-hidden="true"></i>
    <span>{applyLabel}</span>
  </button>
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
    color: var(--fab-text-subtle);
    font-family: inherit;
    font-size: 0.62rem;
    font-weight: 600;
    line-height: 1.2;
    cursor: pointer;
  }

  .fab-bulk-edit-clear:hover {
    color: var(--fab-mv2-text);
  }

  .fab-bulk-edit-clear:focus-visible,
  .fab-bulk-edit-apply:focus-visible {
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

  /* Full-width and accent, the loudest thing on the panel — and genuinely inert until an
     axis is staged, so the GM cannot fire a no-op write and read success from it.
     Geometry, weight and foreground are the browser inspector's primary button verbatim
     (`.manager-button.manager-component-browser-inspector-edit`, styles/fabricate.css),
     because this button LITERALLY SWAPS PLACES with it in the rail's bottom slot the
     moment a box is ticked: 38px and 0.78rem, so the swap does not resize or re-type the
     slot, and `--fab-on-accent` — the token that means "foreground ON an accent fill" —
     rather than `--fab-bg-1`, which is a surface colour and differs from it in all seven
     themes. */
  .fab-bulk-edit-apply {
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
  .fab-bulk-edit-apply:not(:disabled):hover {
    border-color: var(--fab-accent);
    background: var(--fab-accent-strong);
  }

  .fab-bulk-edit-apply:disabled {
    border-color: var(--fab-mv2-border);
    color: var(--fab-text-disabled);
    background: var(--fab-surface-soft);
    cursor: default;
  }
</style>
