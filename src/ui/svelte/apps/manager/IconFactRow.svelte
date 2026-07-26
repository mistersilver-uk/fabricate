<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE icon fact row: a bordered well holding a leading accent glyph, a bold
  one-line statement, and a muted qualifying line under it. Use it wherever a side panel
  states a single derived fact about the selected thing — "Roll to break · Check-driven,
  follows the crafting roll".

  It exists because the Tool Studio shipped the same row twice (issue 881). The editor's
  behavior preview rendered `.manager-tool-preview-rules > li` (28px glyph column, radius
  6, 9px/11px padding, 0.76rem title) and the library inspector rendered
  `.manager-tool-inspector-rule-card` (the same 28px column, radius 7, 12px padding,
  0.72rem title) — one meaning, two geometries, both fed by the SAME
  `projectToolBehaviorFacts` projection. The geometry kept here is the behavior preview's,
  which is the treatment issue 881 names as the reference.

  Its CSS lives in this scoped `<style>`, not `styles/fabricate.css`, so `VIEW_RECIPES` in
  `scripts/ui-pr-screenshot-evidence.mjs` maps a change here to the views that actually
  render it instead of matching the broad `theme-or-global-ui` recipe.

  The row owns only its own well. How a container STACKS rows (the list grid and its gap)
  stays with the container, because a scoped block cannot reach an ancestor.

  Props:
   - icon: Font Awesome classes for the leading glyph (omit for a glyph-less row, which
     releases the glyph column rather than leaving it blank).
   - title: the fact itself. One line, bold.
   - subtitle: the qualifying line under it. Optional.
   - titleAttr: an optional test/screenshot hook set on the <strong>, e.g.
     `titleAttr="data-tool-preview-breakage"`, for a caller that needs to assert the
     rendered value of ONE named fact.
   - dataAttr / dataValue: an optional test/screenshot hook on the row itself.

  A component wearing `.manager-*` classes belongs under `apps/manager/` (not the
  import-free `components/` leaf directory), which is why it lives here.
-->
<script>
  let {
    icon = '',
    title = '',
    subtitle = '',
    titleAttr = '',
    dataAttr = '',
    dataValue = '',
  } = $props();

  // Spread so a hook is genuinely absent when unset, rather than an empty attribute a
  // selector would still match.
  const hookAttributes = $derived(dataAttr ? { [dataAttr]: dataValue || true } : {});
  const titleAttributes = $derived(titleAttr ? { [titleAttr]: true } : {});
</script>

<div class="manager-icon-fact-row" class:is-glyphless={!icon} {...hookAttributes}>
  {#if icon}
    <i class={icon} aria-hidden="true"></i>
  {/if}
  <span>
    <strong {...titleAttributes}>{title}</strong>
    {#if subtitle}
      <small>{subtitle}</small>
    {/if}
  </span>
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
  .manager-icon-fact-row {
    /* See the EmptyState note: area-agnostic, so the padding model is declared, not
       inherited from `.fabricate-manager * { box-sizing }`. */
    box-sizing: border-box;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: 9px 11px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-bg-1);
  }

  /* A glyph-less row releases the column instead of holding 28px of empty space. */
  .manager-icon-fact-row.is-glyphless {
    grid-template-columns: minmax(0, 1fr);
  }

  .manager-icon-fact-row > i {
    color: var(--fab-accent);
    text-align: center;
  }

  .manager-icon-fact-row > span {
    display: grid;
    gap: var(--fab-space-2xs);
    min-width: 0;
  }

  /* `overflow-wrap: anywhere` is carried for every consumer: a fact is often a generated
     value (a dice expression, a roll-data path, an item name) with no break opportunity. */
  .manager-icon-fact-row strong {
    font-size: 0.76rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .manager-icon-fact-row small {
    color: var(--fab-text-muted);
    font-size: 0.64rem;
    line-height: 1.3;
  }
</style>
