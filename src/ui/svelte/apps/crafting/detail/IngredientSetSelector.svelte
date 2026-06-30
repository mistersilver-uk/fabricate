<!-- Svelte 5 runes mode -->
<!--
  IngredientSetSelector lets the player pick which ingredient set (Option A/B/C)
  the craft will consume, driving store.chooseIngredientSet. Each option flags
  whether that set is currently craftable so the player can see at a glance which
  set their inventory can satisfy. Renders nothing for a single-set recipe.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let { sets = [], selectedSetId = null, onChoose = null } = $props();

  const options = $derived(Array.isArray(sets) ? sets.filter((set) => set?.id) : []);
  const multiple = $derived(options.length > 1);
</script>

{#if multiple}
  <section class="crafting-set-selector" data-recipe-section="ingredient-sets">
    <p class="crafting-detail-section-title">
      {localize('FABRICATE.App.Crafting.Detail.IngredientSetsTitle')}
    </p>
    <div class="crafting-set-options" role="group">
      {#each options as set (set.id)}
        <button
          type="button"
          class="crafting-set-option"
          class:is-selected={set.id === selectedSetId}
          class:is-craftable={set.craftability?.canCraft === true}
          data-set-id={set.id}
          aria-pressed={set.id === selectedSetId}
          onclick={() => onChoose?.(set.id)}
        >
          <span class="crafting-set-option-label">{set.label}</span>
          {#if set.craftability?.canCraft === true}
            <i class="fas fa-circle-check" aria-hidden="true"></i>
          {/if}
        </button>
      {/each}
    </div>
  </section>
{/if}

<style>
  .crafting-set-selector {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .crafting-set-options {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .crafting-set-option {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: auto;
    min-height: 32px;
    padding: 4px 12px;
    border: 1px solid var(--fab-border);
    border-radius: 999px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    cursor: pointer;
  }

  .crafting-set-option.is-craftable {
    color: var(--fab-success-text);
  }

  .crafting-set-option.is-selected {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .crafting-set-option:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .crafting-set-option i {
    font-size: 11px;
  }
</style>
