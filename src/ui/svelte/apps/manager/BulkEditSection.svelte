<!-- Svelte 5 runes mode -->
<!--
  The manager's ONE bulk edit SECTION heading: the uppercase micro-label, its optional
  label ROW (an inline hint and/or a trailing staged-axis control on the label's baseline),
  and its optional standing sub-hint (issue 772, extracted for issue 1010).

  It lives under `apps/manager/` rather than `apps/manager/components/` for the reason
  `BulkSelectionToolbar` records: `components/` holds area-agnostic leaves, this scale is
  manager-scoped, and staying here keeps `--fab-mv2-*` in scope so the extraction is a pure
  move rather than a re-tokenisation.

  IT WRAPS NOTHING. The heading, the hint and the sub-hint are emitted as SIBLINGS, not
  inside a section element, because `BulkEditPanelShell`'s uniform flex `gap` is what
  supplies the panel's rhythm — a wrapper would collapse a section's internal spacing into
  a single gap and re-space the whole rail. The control itself stays with the caller, as
  the next flex item.

  Props:
   - label: the micro-label, already localized.
   - hint: an optional INLINE aside that sits on the label's baseline. Its presence is what
     promotes the plain label to a label ROW.
   - trailing: an optional snippet rendered at the end of the label row — the staged-axis
     chip in the Component Studio. It promotes the label to a row too.
   - subhint: an optional STANDING SENTENCE below the heading.
   - subhintAttr / subhintValue: an optional test/screenshot hook on that sentence, e.g.
     `subhintAttr="data-component-bulk-tags-empty"`. Spread so the hook is genuinely absent
     when unset rather than an empty attribute a selector would still match. `subhintValue`
     defaults to `''` rather than `true`, because Svelte serializes `true` as `="true"` and
     the shipped hook this replaces was a BARE attribute.
-->
<script>
  let {
    label = '',
    hint = '',
    subhint = '',
    subhintAttr = '',
    subhintValue = '',
    trailing,
  } = $props();

  const subhintHook = $derived(subhintAttr ? { [subhintAttr]: subhintValue } : {});
  const asRow = $derived(Boolean(hint) || Boolean(trailing));
</script>

{#if asRow}
  <div class="fab-bulk-edit-label-row">
    <p class="fab-bulk-edit-label">{label}</p>
    {#if hint}
      <span class="fab-bulk-edit-hint">{hint}</span>
    {/if}
    {@render trailing?.()}
  </div>
{:else}
  <p class="fab-bulk-edit-label">{label}</p>
{/if}
{#if subhint}
  <p class="fab-bulk-edit-subhint" {...subhintHook}>{subhint}</p>
{/if}

<style>
  /* Manager-scoped by PLACEMENT — this component lives under `apps/manager/`, so
     `--fab-mv2-*` (declared on `.fabricate-manager`) is in scope. Its appearance lives
     HERE rather than in `styles/fabricate.css` so `VIEW_RECIPES` in
     `scripts/ui-pr-screenshot-evidence.mjs` routes a change to the views that actually
     render it. Because it sits OUTSIDE both `apps/manager/components/` and
     `apps/manager/recipes/`, it is enumerated BY NAME in that map's browser match lists. */

  /* Sections are uppercase micro-labels ON the panel background — the treatment the
     single-row inspector this panel replaces already uses, so the rail reads the same
     either way.

     The panel's SECTION RHYTHM lives on this margin and on the label row's below, because
     the container's flex `gap` is uniform, and a uniform gap puts a section heading
     exactly as far from the previous section's last control as from its own — so the
     panel reads as one undifferentiated stack. The prototype separates sections by twice
     what it puts between controls WITHIN one; the container gap already supplies the
     inner spacing, and this extra `space-2` is what turns the flat run back into groups. */
  .fab-bulk-edit-label {
    margin: var(--fab-space-2) 0 0;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .fab-bulk-edit-label-row {
    display: flex;
    gap: var(--fab-space-2);
    align-items: baseline;
    justify-content: space-between;
    min-width: 0;
    /* The row carries the section break for the label INSIDE it (which is zeroed just
       below, since a flex item's own margin would push it off the shared baseline). */
    margin-top: var(--fab-space-2);
  }

  .fab-bulk-edit-label-row > .fab-bulk-edit-label {
    margin-top: 0;
    /* The label holds ONE line. A two-word label (`RECIPE BOOKS`) otherwise wraps, which
       does not merely look untidy — it narrows the hint column beside it until the hint
       breaks as `…again to leave` / `unchanged`, severing the exact phrase that hint was
       added to state. `nowrap` alone is sufficient and `flex: 0 0 auto` would be
       redundant: a block-level flex item's automatic minimum size is its min-content
       width, and with `nowrap` that IS the whole string, so the item already cannot
       shrink below it.

       Scoped to the label ROW rather than to `.fab-bulk-edit-label`, so the standalone
       headings (`Category`, `Status`, `Lock`, `Check tier`) keep their existing wrapping
       behaviour untouched. Costs the Component Studio nothing: its only two label rows are
       `TAGS` and `ESSENCES`, both single words, which could not wrap either way. */
    white-space: nowrap;
  }

  /* Two hint scales, deliberately. `-hint` is the INLINE aside that sits on a label row's
     baseline and must not out-weigh the label beside it. `-subhint` is a STANDING
     SENTENCE addressed to the GM — the essence-overwrite warning, a DC's meaning, an
     empty-state aside — which is read, not glanced at, so it is a step larger and looser.
     Collapsing the two made the sentence explaining a panel's destructive axis the
     smallest text in it. The sub-hint is also NOT the global `manager-muted` (0.78rem):
     that class would make an empty-state aside the LARGEST text in a rail whose loudest
     copy is 0.62rem. */
  .fab-bulk-edit-hint {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.58rem;
    font-weight: 400;
    line-height: 1.4;
  }

  .fab-bulk-edit-subhint {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    font-weight: 400;
    line-height: 1.4;
  }
</style>
