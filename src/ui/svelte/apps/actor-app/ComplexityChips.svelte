<!-- Svelte 5 runes mode -->
<!--
  ComplexityChips renders the chip strip describing why a recipe is complex:
  Complex / Multi-step / Routed / Progressive / N Paths / N Choice. Driven by
  the prepared classification payload from
  craftingStore._buildComplexityClassification.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { classification = null } = $props();

  let chips = $derived.by(() => {
    if (!classification?.isComplex) return [];
    const items = [{ id: 'complex', label: localize('FABRICATE.ActorApp.CraftPlan.ChipComplex'), tone: 'purple' }];
    if (classification.isMultiStep) {
      items.push({ id: 'multi-step', label: localize('FABRICATE.ActorApp.CraftPlan.ChipMultiStep'), tone: 'info' });
    }
    if (classification.isRouted) {
      items.push({ id: 'routed', label: localize('FABRICATE.ActorApp.CraftPlan.ChipRouted'), tone: 'info' });
    }
    if (classification.isProgressive) {
      items.push({ id: 'progressive', label: localize('FABRICATE.ActorApp.CraftPlan.ChipProgressive'), tone: 'purple' });
    }
    if ((classification.pathCount ?? 0) > 1) {
      items.push({
        id: 'paths',
        label: localize('FABRICATE.ActorApp.CraftPlan.ChipPaths').replace('{count}', String(classification.pathCount)),
        tone: 'info'
      });
    }
    if ((classification.choiceCount ?? 0) > 0) {
      items.push({
        id: 'choices',
        label: localize('FABRICATE.ActorApp.CraftPlan.ChipChoices').replace('{count}', String(classification.choiceCount)),
        tone: 'info'
      });
    }
    return items;
  });
</script>

{#if chips.length > 0}
  <div class="complexity-chips" data-testid="complexity-chips">
    {#each chips as chip (chip.id)}
      <span class="complexity-chips__chip complexity-chips__chip--{chip.tone}">{chip.label}</span>
    {/each}
  </div>
{/if}

<style>
  .complexity-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }

  .complexity-chips__chip {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .complexity-chips__chip--purple {
    background: var(--fab-purple-soft);
    color: var(--fab-purple);
  }

  .complexity-chips__chip--info {
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }
</style>
