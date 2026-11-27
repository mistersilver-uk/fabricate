<!-- Svelte 5 runes mode -->
<!-- ratchet-exempt(design-system): a composition of the Kicker and CounterCard members, shared by the live workpiece and its closed record rather than offered as a vocabulary member -->
<!-- The workpiece's counters under their Kicker heading and one caption (issue 3011, D-7). The live
     step slots its results ladder between the heading and the grid; the closed record draws none. -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Kicker from '../../../components/Kicker.svelte';
  import CounterCard from './CounterCard.svelte';

  const KICKER = 'FABRICATE.App.Journal.Iterative.Workpiece.Kicker';

  let { counters = [], caption = '', children = undefined } = $props();
</script>

<section class="counter-section">
  <div class="counter-section-heading">
    <Kicker as="span">{localize(KICKER)}</Kicker>
    {#if caption}<span class="counter-section-caption">{caption}</span>{/if}
  </div>
  {@render children?.()}
  <div class="counter-section-grid">
    {#each counters as counter (counter.counterId)}<CounterCard {counter} />{/each}
  </div>
</section>

<style>
  .counter-section {
    display: grid;
    gap: var(--fab-space-3);
    min-width: 0;
  }
  .counter-section-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--fab-space-2);
  }
  .counter-section-caption {
    font-size: 10.5px;
    color: var(--fab-text-muted);
  }
  .counter-section-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--fab-space-2);
  }
</style>
