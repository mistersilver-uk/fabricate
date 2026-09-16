<!--
  The manager's ONE bulk edit SECTION heading: the uppercase micro-label, its optional label ROW (an
  inline hint and/or a trailing staged-axis control) and its optional standing sub-hint (issue 772).
  IT WRAPS NOTHING — heading, hint and sub-hint are emitted as SIBLINGS, because
  `BulkEditPanelShell`'s uniform flex `gap` supplies the panel's rhythm and a wrapper would collapse
  a section's internal spacing into one gap. `subhintAttr` / `subhintValue` are spread so an unset
  hook is absent, and valued `''` rather than `true`, which Svelte serializes as `="true"`.
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
  /* THEME-ROOT tokens only. The appearance lives HERE so `VIEW_RECIPES` routes a change to the
     views that render it, and this file is enumerated BY NAME there. */

  /* The panel's SECTION RHYTHM is this margin and the label row's: the flex `gap` is uniform. */
  .fab-bulk-edit-label {
    margin: var(--fab-space-2) 0 0;
    color: var(--fab-text-muted);
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
    margin-top: var(--fab-space-2);
  }

  .fab-bulk-edit-label-row > .fab-bulk-edit-label {
    margin-top: 0;
    /* The label holds ONE line, or it narrows the hint column beside it until the hint breaks
       mid-phrase. Scoped to the label ROW, so standalone headings keep their wrapping. */
    white-space: nowrap;
  }

  /* Two hint scales: `-hint` must not out-weigh its label, `-subhint` is read rather than glanced
     at, and neither is the global `manager-muted`, larger than the rail's loudest copy. */
  .fab-bulk-edit-hint {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.58rem;
    font-weight: 400;
    line-height: 1.4;
  }

  .fab-bulk-edit-subhint {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 0.62rem;
    font-weight: 400;
    line-height: 1.4;
  }
</style>
