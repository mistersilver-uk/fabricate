<!-- Svelte 5 runes mode -->
<!--
  ComplexRecipeInspector renders the full V2 craft-plan layout for complex
  recipes: complexity chips, path selector, ingredient-set cards (AND/OR with
  read-only source allocation), expected outcome, active run + step timeline.

  Source allocation is advisory display data only. The user cannot reassign
  sources from this inspector — `craftingEngine.craft()` aggregates inventory
  across all source actors.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ComplexityChips from './ComplexityChips.svelte';
  import IngredientSetCard from './IngredientSetCard.svelte';
  import StepTimeline from './StepTimeline.svelte';

  let {
    recipe = null,
    onCraft = () => {},
    onAddToShoppingList = () => {},
    onToggleFavourite = () => {},
    onShowDetails = () => {},
    onSelectPath = () => {}
  } = $props();

  function handlePathChange(event) {
    const next = Number(event.currentTarget.value);
    if (!Number.isNaN(next) && recipe?.id) onSelectPath(recipe.id, next);
  }

  let selectedPath = $derived.by(() => {
    if (!recipe?.craftPlan) return null;
    return recipe.craftPlan.paths?.[recipe.craftPlan.selectedPathIndex] ?? null;
  });

  function outcomeToneClass(type) {
    if (type === 'progressive') return 'outcome--progressive';
    if (type === 'routed') return 'outcome--routed';
    return 'outcome--fixed';
  }

  function outcomeLabel(type) {
    if (type === 'progressive') return localize('FABRICATE.ActorApp.CraftPlan.OutcomeProgressive');
    if (type === 'routed') return localize('FABRICATE.ActorApp.CraftPlan.OutcomeRouted');
    return localize('FABRICATE.ActorApp.CraftPlan.OutcomeFixed');
  }
</script>

<aside class="complex-inspector" data-testid="complex-recipe-inspector" aria-label={recipe?.name ?? ''}>
  {#if !recipe}
    <p class="complex-inspector__empty">
      {localize('FABRICATE.ActorApp.Crafting.SelectRecipeHint')}
    </p>
  {:else}
    <header class="complex-inspector__header">
      <img
        class="complex-inspector__image"
        src={recipe.img || 'icons/svg/item-bag.svg'}
        alt=""
        width="64"
        height="64"
      />
      <div class="complex-inspector__identity">
        <h3 class="complex-inspector__name">{recipe.name}</h3>
        <ComplexityChips classification={recipe.classification} />
      </div>
      <button
        type="button"
        class="complex-inspector__icon-btn"
        class:is-favourite={recipe.isFavourite}
        aria-label={recipe.isFavourite
          ? localize('FABRICATE.RecipeCard.RemoveFavourite')
          : localize('FABRICATE.RecipeCard.AddFavourite')}
        aria-pressed={recipe.isFavourite}
        onclick={() => onToggleFavourite(recipe.id)}
      >
        <i class={recipe.isFavourite ? 'fas fa-star' : 'far fa-star'} aria-hidden="true"></i>
      </button>
    </header>

    {#if recipe.description}
      <p class="complex-inspector__description">{recipe.description}</p>
    {/if}

    {#if recipe.craftPlan?.paths?.length > 1}
      <section class="complex-inspector__path-selector">
        <h4 class="complex-inspector__heading">
          {localize('FABRICATE.ActorApp.CraftPlan.SelectPath')}
        </h4>
        <select
          class="complex-inspector__path-select"
          value={recipe.craftPlan.selectedPathIndex}
          onchange={handlePathChange}
          aria-label={localize('FABRICATE.ActorApp.CraftPlan.SelectPath')}
        >
          {#each recipe.craftPlan.paths as path (path.id)}
            <option value={path.index}>
              {path.name}
              {#if path.isSatisfiable}
                — {localize('FABRICATE.ActorApp.CraftPlan.PathSatisfiable')}
              {:else}
                — {localize('FABRICATE.ActorApp.CraftPlan.PathMissing')}
              {/if}
            </option>
          {/each}
        </select>
      </section>
    {/if}

    {#if selectedPath}
      <section class="complex-inspector__plan">
        <h4 class="complex-inspector__heading">
          {localize('FABRICATE.ActorApp.CraftPlan.IngredientSets')}
        </h4>
        <IngredientSetCard path={selectedPath} />
      </section>
    {/if}

    {#if recipe.craftPlan?.outcome}
      <section class="complex-inspector__outcome {outcomeToneClass(recipe.craftPlan.outcome.type)}">
        <h4 class="complex-inspector__heading">
          {localize('FABRICATE.ActorApp.CraftPlan.OutcomeHeading')}
        </h4>
        <span class="complex-inspector__outcome-tag">{outcomeLabel(recipe.craftPlan.outcome.type)}</span>
        {#if recipe.craftPlan.outcome.label}
          <p class="complex-inspector__outcome-label">{recipe.craftPlan.outcome.label}</p>
        {/if}
      </section>
    {/if}

    {#if recipe.craftPlan?.steps?.length > 0}
      <section class="complex-inspector__timeline">
        <h4 class="complex-inspector__heading">
          {localize('FABRICATE.ActorApp.CraftPlan.StepTimeline')}
        </h4>
        <StepTimeline steps={recipe.craftPlan.steps} />
      </section>
    {/if}

    <footer class="complex-inspector__actions">
      <button
        type="button"
        class="complex-inspector__btn complex-inspector__btn--primary"
        disabled={!recipe.allowCraftAction}
        onclick={() => {
          if (recipe.allowCraftAction) onCraft(recipe.id, recipe.activeRunId ? { runId: recipe.activeRunId } : undefined);
        }}
      >
        <i class={recipe.activeRunId ? 'fas fa-play' : 'fas fa-hammer'} aria-hidden="true"></i>
        {recipe.craftButtonLabel}
      </button>
      <button
        type="button"
        class="complex-inspector__btn complex-inspector__btn--secondary"
        disabled={recipe.isTeaser}
        onclick={() => onAddToShoppingList(recipe.id, 1)}
      >
        <i class="fas fa-cart-plus" aria-hidden="true"></i>
        {localize('FABRICATE.ShoppingList.AddToList')}
      </button>
      <button
        type="button"
        class="complex-inspector__btn complex-inspector__btn--secondary"
        onclick={() => onShowDetails(recipe.id)}
      >
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        {localize('FABRICATE.RecipeCard.ShowDetails')}
      </button>
    </footer>
  {/if}
</aside>

<style>
  .complex-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-surface);
    overflow-y: auto;
    min-width: 0;
  }

  .complex-inspector__empty {
    margin: 0;
    color: var(--fab-text-subtle);
    font-style: italic;
    font-size: 13px;
  }

  .complex-inspector__header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .complex-inspector__image {
    border-radius: 6px;
    object-fit: contain;
    background: var(--fab-surface-raised);
  }

  .complex-inspector__identity {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 4px;
  }

  .complex-inspector__name {
    margin: 0;
    color: var(--fab-text);
    font-size: 16px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .complex-inspector__icon-btn {
    appearance: none;
    -webkit-appearance: none;
    width: var(--fab-v2-icon-button);
    height: var(--fab-v2-icon-button);
    border-radius: var(--fab-v2-radius-control);
    border: 1px solid var(--fab-border);
    background: transparent;
    color: var(--fab-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
  }

  .complex-inspector__icon-btn.is-favourite {
    color: var(--fab-warning);
    border-color: var(--fab-warning);
  }

  .complex-inspector__description {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 12px;
  }

  .complex-inspector__path-selector,
  .complex-inspector__plan,
  .complex-inspector__outcome,
  .complex-inspector__timeline {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .complex-inspector__heading {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
  }

  .complex-inspector__path-select {
    width: 100%;
    height: var(--fab-v2-control-height);
    padding: 0 var(--fab-space-2);
    border-radius: var(--fab-v2-radius-control);
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text);
    font-size: 13px;
  }

  .complex-inspector__outcome {
    padding: var(--fab-space-2);
    border-radius: var(--fab-v2-radius-control);
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
  }

  .complex-inspector__outcome.outcome--routed {
    border-color: var(--fab-info);
    background: var(--fab-info-soft);
  }

  .complex-inspector__outcome.outcome--progressive {
    border-color: var(--fab-purple);
    background: var(--fab-purple-soft);
  }

  .complex-inspector__outcome.outcome--fixed {
    border-color: var(--fab-accent);
    background: var(--fab-accent-soft);
  }

  .complex-inspector__outcome-tag {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }

  .complex-inspector__outcome-label {
    margin: 0;
    color: var(--fab-text);
    font-size: 13px;
  }

  .complex-inspector__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
  }

  .complex-inspector__btn {
    appearance: none;
    -webkit-appearance: none;
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    padding: 6px 12px;
    border-radius: var(--fab-v2-radius-control);
    border: 1px solid var(--fab-border);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .complex-inspector__btn--primary {
    background: var(--fab-accent);
    color: #051e0c;
    border-color: var(--fab-accent-strong);
    flex: 1;
    justify-content: center;
  }

  .complex-inspector__btn--primary:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .complex-inspector__btn--primary:disabled {
    background: var(--fab-surface-raised);
    color: var(--fab-text-subtle);
    border-color: var(--fab-border);
    cursor: not-allowed;
  }

  .complex-inspector__btn--secondary {
    background: transparent;
    color: var(--fab-text-muted);
  }

  .complex-inspector__btn--secondary:hover:not(:disabled),
  .complex-inspector__btn--secondary:focus-visible {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }
</style>
