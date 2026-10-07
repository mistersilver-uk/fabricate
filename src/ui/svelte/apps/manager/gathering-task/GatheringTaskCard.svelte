<!-- ratchet-exempt(design-system): the gathering task editor's own card, the chrome and header snippet its view carried at base, shared by that editor's tabs and cards rather than offered as a vocabulary member -->
<!--
  One gathering task editor card (issue 1522): the section chrome the resolution, stamina, check,
  node and result cards share, opened by an `<h3>` title over an optional muted hint. `class`
  names the card, which picks its chrome; the rest spread carries the card's hooks.
-->
<script>
  let { class: cardClass = '', title, hint = '', children, ...rest } = $props();
</script>

<section class={cardClass} {...rest}>
  <div class="manager-task-card-header">
    <div class="manager-task-drop-header-copy">
      <h3>{title}</h3>
      {#if hint}
        <p class="manager-muted">{hint}</p>
      {/if}
    </div>
  </div>
  {@render children?.()}
</section>

<style>
  /* Card chrome matching the other task-editor cards. */
  .manager-task-stamina-card,
  .manager-task-nodes-card,
  .manager-task-dc-card,
  .manager-task-resolution-card,
  .manager-task-results-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    /* ratchet-exempt(design-system): moved unchanged from GatheringTaskEditView, which carried it at base */
    padding: 13px 16px;
    border: 1px solid var(--fab-border);
    border-radius: 11px;
    background: var(--fab-bg-3);
  }

  .manager-task-stamina-card,
  .manager-task-nodes-card,
  .manager-task-dc-card {
    /* ratchet-exempt(design-system): moved unchanged from GatheringTaskEditView, which carried it at base */
    box-shadow: inset 0 1px 0 var(--fab-overlay-light-06);
  }

  .manager-task-resolution-card,
  .manager-task-results-card {
    border-radius: 9px;
  }

  .manager-task-results-card :global(.manager-recipe-results-section) {
    display: grid;
    gap: var(--fab-space-3);
  }
</style>
