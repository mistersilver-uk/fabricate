<!-- Svelte 5 runes mode -->
<!--
  JournalCard is the shared titled-card chrome for the Journal's right column
  (RecentResults, AboutThisRun, WhatToExpect, JournalTips) and the step-details
  card. Factoring the identical container + uppercase title CSS into one component
  keeps the right-column cards from each pasting the same block (which would fail
  the SonarCloud new-code duplication gate). The body is supplied as children.
-->
<script>
  let { kind = '', title = '', children } = $props();
</script>

<section class="journal-card" data-journal-card={kind}>
  {#if title !== ''}
    <h3 class="journal-card-title">{title}</h3>
  {/if}
  {@render children?.()}
</section>

<style>
  .journal-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
  }

  .journal-card-title {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }
</style>
