<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let { recipes = [], onCraft, onShowDetails } = $props();
</script>

{#if recipes.length > 0}
  <div class="fabricate-quick-section recent-section">
    <h4><i class="fas fa-clock"></i> {localize('FABRICATE.RecentsSection.Title')}</h4>
    <div class="quick-recipe-list">
      {#each recipes as recipe (recipe.id)}
        <div class="quick-recipe-item" data-recipe-id={recipe.id}>
          <img src={recipe.img} alt={recipe.name} class="quick-recipe-icon" />
          <span class="quick-recipe-name">{recipe.name}</span>
          <span class="badge">{recipe.statusLabel}</span>
          {#if recipe.allowCraftAction}
            <button
              type="button"
              class="craft-btn"
              onclick={() => onCraft?.(recipe.id, { runId: recipe.activeRunId || null })}
              title={localize('FABRICATE.RecipeCard.CraftTitle')}
            >
              <i class="fas fa-hammer"></i> {recipe.craftButtonLabel}
            </button>
          {/if}
          <button
            type="button"
            class="details-btn"
            onclick={() => onShowDetails?.(recipe.id)}
            title={localize('FABRICATE.RecipeCard.ShowDetails')}
          >
            <i class="fas fa-info-circle"></i>
          </button>
        </div>
      {/each}
    </div>
  </div>
{/if}
