<!-- Svelte 5 runes mode -->
<!--
  JournalCard is the shared titled-card chrome for the Journal's right column
  (RecentResults, AboutThisRun, WhatToExpect, JournalTips) and the step-details
  card. Factoring the identical container + uppercase title CSS into one component
  keeps the right-column cards from each pasting the same block (which would fail
  the SonarCloud new-code duplication gate). The body is supplied as children.
-->
<script>
  import Kicker from '../../components/Kicker.svelte';

  let { kind = '', title = '', children } = $props();
</script>

<section class="journal-card" data-journal-card={kind}>
  {#if title !== ''}
    <!--
      `h3` is one of the three hosts `Kicker` renders (`Kicker.svelte:93`), so this card's
      heading keeps its place in the document outline. The line box moves 12.00 to 11.05 —
      measured in the View Lab, NOT the 15.00 the plan's arithmetic assumed, because a
      bare heading here computes `line-height: 12px` rather than the inherited 1.25.
    -->
    <Kicker as="h3">{title}</Kicker>
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
</style>
