<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    recipe,
    onCraft,
    onLearnRecipe,
    onToggleFavourite,
    onShowDetails,
    onRestartRun,
    onAddToShoppingList
  } = $props();
</script>

<article
  class="fabricate-recipe-item"
  class:can-craft={recipe.canCraft}
  class:cannot-craft={!recipe.canCraft}
  class:is-teaser={recipe.isTeaser}
  data-recipe-id={recipe.id}
>
  {#if recipe.isTeaser}
    <div class="teaser-overlay">
      <i class="fas fa-lock teaser-lock-icon"></i>
      <div class="teaser-progress-bar">
        <div class="teaser-progress-fill" style="width: {recipe.teaserProgress}%"></div>
      </div>
      <span class="teaser-progress-label">{recipe.teaserProgress}%</span>
    </div>
  {/if}

  <div class="recipe-icon">
    <img src={recipe.img || 'icons/svg/item-bag.svg'} alt={recipe.name} />
  </div>

  <div class="recipe-info">
    <h3 class="recipe-name">
      {recipe.name}
      <span class="badge">{recipe.statusLabel}</span>
      {#if recipe.hasMultipleSets}
        <span class="badge">{localize('FABRICATE.RecipeCard.MultipleOptions')}</span>
      {/if}
      {#if recipe.hasMultipleActiveRuns}
        <span class="badge">{localize('FABRICATE.RecipeCard.ActiveRunCount', { count: recipe.activeRunCount })}</span>
      {/if}
    </h3>
    <p class="recipe-description">{recipe.description}</p>
    {#if recipe.activeRunStepLabel}
      <p class="hint">{localize('FABRICATE.RecipeCard.CurrentRun')}: {recipe.activeRunStepLabel}</p>
    {/if}

    <div class="recipe-requirements">
      {#if recipe.ingredients.length > 0}
        <div class="ingredient-list">
          <strong>{localize('FABRICATE.RecipeCard.Ingredients')}:</strong>
          {#each recipe.ingredients as ing}
            <span
              class="ingredient-badge"
              class:satisfied={ing.satisfied}
              class:unsatisfied={!ing.satisfied}
            >
              {ing.description}
              <span class="quantity">({ing.have}/{ing.need})</span>
            </span>
          {/each}
        </div>
      {/if}

      {#if recipe.essences.length > 0}
        <div class="essence-list">
          <strong>{localize('FABRICATE.RecipeCard.Essences')}:</strong>
          {#each recipe.essences as ess}
            <span
              class="essence-badge"
              class:satisfied={ess.satisfied}
              class:unsatisfied={!ess.satisfied}
            >
              {ess.type}: {ess.need}
            </span>
          {/each}
        </div>
      {/if}

      {#if recipe.catalysts.length > 0}
        <div class="catalyst-list">
          <strong>{localize('FABRICATE.RecipeCard.Requires')}:</strong>
          {#each recipe.catalysts as cat}
            <span
              class="catalyst-badge"
              class:have={cat.available}
              class:need={!cat.available}
            >
              <i class="fas fa-tools"></i> {cat.name}
            </span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="recipe-result">
      <i class="fas fa-arrow-right"></i>
      <strong>{recipe.resultDescription}</strong>
    </div>
  </div>

  <div class="recipe-actions">
    {#if recipe.allowCraftAction}
      <button
        type="button"
        class="craft-btn"
        onclick={() => onCraft?.(recipe.id, { runId: recipe.activeRunId || null })}
        title={localize('FABRICATE.RecipeCard.CraftTitle')}
      >
        <i class="fas fa-hammer"></i>
        {recipe.craftButtonLabel}
      </button>
    {:else}
      {#if recipe.activeRunId}
        <button
          type="button"
          class="craft-btn disabled"
          disabled
          title={recipe.statusLabel}
        >
          <i class="fas fa-hourglass-half"></i>
          {localize('FABRICATE.RecipeCard.Waiting')}
        </button>
      {:else}
        <button
          type="button"
          class="craft-btn disabled"
          disabled
          title={recipe.statusLabel}
        >
          <i class="fas fa-ban"></i>
          {localize('FABRICATE.RecipeCard.CannotCraft')}
        </button>
      {/if}
      {#if recipe.canLearn}
        <button
          type="button"
          class="craft-btn"
          onclick={() => onLearnRecipe?.(recipe.id)}
          title={localize('FABRICATE.RecipeCard.LearnTitle')}
        >
          <i class="fas fa-book-open"></i>
          {localize('FABRICATE.RecipeCard.Learn')}
        </button>
      {/if}
    {/if}

    <button
      type="button"
      class="details-btn shopping-btn"
      onclick={() => onAddToShoppingList?.(recipe.id)}
      title={localize('FABRICATE.ShoppingList.AddToList')}
    >
      <i class="fas fa-cart-plus"></i>
    </button>

    <button
      type="button"
      class="details-btn favourite-btn"
      class:is-favourite={recipe.isFavourite}
      onclick={() => onToggleFavourite?.(recipe.id)}
      title={recipe.isFavourite
        ? localize('FABRICATE.RecipeCard.RemoveFavourite')
        : localize('FABRICATE.RecipeCard.AddFavourite')}
    >
      <i class="fas fa-star"></i>
    </button>

    <button
      type="button"
      class="details-btn"
      onclick={() => onShowDetails?.(recipe.id)}
      title={localize('FABRICATE.RecipeCard.ShowDetails')}
    >
      <i class="fas fa-info-circle"></i>
    </button>

    {#if recipe.activeRunId}
      <button
        type="button"
        class="details-btn"
        onclick={() => onRestartRun?.(recipe.id, recipe.activeRunId)}
        title={localize('FABRICATE.RecipeCard.RestartRun')}
      >
        <i class="fas fa-rotate-left"></i>
      </button>
    {/if}
  </div>
</article>
