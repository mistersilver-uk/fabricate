<!-- Svelte 5 runes mode -->
<!--
  RecipeTable renders the player-facing crafting recipe table for the V2
  Crafting tab. Rows summarize requirements/results; full detail lives in the
  selected-recipe inspector.

  Teaser/non-GM rules: rows respect `recipe.isTeaser` and `teaserHiddenFields`.
  Hidden requirements/essences/catalysts/results render as the existing teaser
  placeholders (provided in the prepared recipe shape) and never the real
  values.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    recipes = [],
    selectedRecipeId = null,
    onSelectRecipe = () => {},
    onCraft = () => {},
    onAddToShoppingList = () => {},
    onToggleFavourite = () => {}
  } = $props();

  function selectRow(id) {
    onSelectRecipe(id);
  }

  function selectRowFromKeyboard(event, id) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectRecipe(id);
    }
  }

  function ingredientCountSummary(recipe) {
    const list = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    if (list.length === 0) return '';
    const satisfied = list.filter(i => i.satisfied).length;
    return `${satisfied}/${list.length}`;
  }

  function statusToneClass(recipe) {
    if (recipe.activeRunStatusLabel) return 'status--in-progress';
    if (recipe.accessReason === 'locked') return 'status--locked';
    if (recipe.accessReason === 'knowledge' && recipe.canLearn) return 'status--learnable';
    if (recipe.canCraft) return 'status--available';
    return 'status--missing';
  }
</script>

<div class="recipe-table" role="table" data-testid="recipe-table">
  <div class="recipe-table__head" role="row">
    <span class="recipe-table__cell recipe-table__cell--recipe" role="columnheader">
      {localize('FABRICATE.ActorApp.Crafting.ColumnRecipe')}
    </span>
    <span class="recipe-table__cell recipe-table__cell--status" role="columnheader">
      {localize('FABRICATE.ActorApp.Crafting.ColumnStatus')}
    </span>
    <span class="recipe-table__cell recipe-table__cell--requirements" role="columnheader">
      {localize('FABRICATE.ActorApp.Crafting.ColumnRequirements')}
    </span>
    <span class="recipe-table__cell recipe-table__cell--result" role="columnheader">
      {localize('FABRICATE.ActorApp.Crafting.ColumnResult')}
    </span>
    <span class="recipe-table__cell recipe-table__cell--actions" role="columnheader">
      {localize('FABRICATE.ActorApp.Crafting.ColumnActions')}
    </span>
  </div>

  {#if recipes.length === 0}
    <div class="recipe-table__empty">
      <i class="fas fa-search" aria-hidden="true"></i>
      <p>{localize('FABRICATE.RecipeList.NoRecipes')}</p>
    </div>
  {:else}
    {#each recipes as recipe (recipe.id)}
      <div
        class="recipe-table__row"
        class:recipe-table__row--selected={selectedRecipeId === recipe.id}
        class:recipe-table__row--teaser={recipe.isTeaser}
        data-recipe-id={recipe.id}
        role="row"
        tabindex="0"
        aria-selected={selectedRecipeId === recipe.id}
        onclick={() => selectRow(recipe.id)}
        onkeydown={(e) => selectRowFromKeyboard(e, recipe.id)}
      >
        <div class="recipe-table__cell recipe-table__cell--recipe" role="cell">
          <img
            class="recipe-table__image"
            src={recipe.img || 'icons/svg/item-bag.svg'}
            alt=""
            width="48"
            height="48"
          />
          <div class="recipe-table__name-block">
            <strong class="recipe-table__name">{recipe.name}</strong>
            <span class="recipe-table__description">{recipe.description}</span>
          </div>
        </div>
        <div class="recipe-table__cell recipe-table__cell--status" role="cell">
          <span class="recipe-table__status {statusToneClass(recipe)}">
            {recipe.statusLabel}
          </span>
          {#if recipe.classification?.isComplex || recipe.classification?.isMultiStep || (recipe.classification?.pathCount ?? 0) > 1 || (recipe.classification?.choiceCount ?? 0) > 0}
            <span class="recipe-table__chips">
              {#if recipe.classification?.isComplex}
                <span class="recipe-table__chip recipe-table__chip--complex">
                  {localize('FABRICATE.ActorApp.CraftPlan.ChipComplex')}
                </span>
              {/if}
              {#if recipe.classification?.isMultiStep}
                <span class="recipe-table__chip recipe-table__chip--info">
                  {localize('FABRICATE.ActorApp.CraftPlan.ChipMultiStep')}
                </span>
              {/if}
              {#if (recipe.classification?.pathCount ?? 0) > 1}
                <span class="recipe-table__chip recipe-table__chip--info">
                  {localize('FABRICATE.ActorApp.CraftPlan.ChipPaths').replace('{count}', String(recipe.classification.pathCount))}
                </span>
              {/if}
              {#if (recipe.classification?.choiceCount ?? 0) > 0}
                <span class="recipe-table__chip recipe-table__chip--info">
                  {localize('FABRICATE.ActorApp.CraftPlan.ChipChoices').replace('{count}', String(recipe.classification.choiceCount))}
                </span>
              {/if}
            </span>
          {/if}
        </div>
        <div class="recipe-table__cell recipe-table__cell--requirements" role="cell">
          {#if recipe.ingredients?.length > 0}
            <span class="recipe-table__counter">
              <i class="fas fa-cubes" aria-hidden="true"></i>
              {ingredientCountSummary(recipe)}
            </span>
          {/if}
          {#if recipe.essences?.length > 0}
            <span class="recipe-table__counter">
              <i class="fas fa-droplet" aria-hidden="true"></i>
              {recipe.essences.filter(e => e.satisfied).length}/{recipe.essences.length}
            </span>
          {/if}
          {#if recipe.catalysts?.length > 0}
            <span class="recipe-table__counter">
              <i class="fas fa-flask" aria-hidden="true"></i>
              {recipe.catalysts.filter(c => c.available).length}/{recipe.catalysts.length}
            </span>
          {/if}
        </div>
        <div class="recipe-table__cell recipe-table__cell--result" role="cell">
          <span class="recipe-table__result">{recipe.resultDescription}</span>
        </div>
        <div class="recipe-table__cell recipe-table__cell--actions" role="cell">
          <button
            type="button"
            class="recipe-table__action recipe-table__action--icon"
            class:is-favourite={recipe.isFavourite}
            aria-label={recipe.isFavourite
              ? localize('FABRICATE.RecipeCard.RemoveFavourite')
              : localize('FABRICATE.RecipeCard.AddFavourite')}
            aria-pressed={recipe.isFavourite}
            onclick={(event) => { event.stopPropagation(); onToggleFavourite(recipe.id); }}
          >
            <i class={recipe.isFavourite ? 'fas fa-star' : 'far fa-star'} aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="recipe-table__action recipe-table__action--icon"
            aria-label={localize('FABRICATE.ShoppingList.AddToList')}
            disabled={recipe.isTeaser}
            onclick={(event) => { event.stopPropagation(); onAddToShoppingList(recipe.id, 1); }}
          >
            <i class="fas fa-cart-plus" aria-hidden="true"></i>
          </button>
          <button
            type="button"
            class="recipe-table__action recipe-table__action--primary"
            disabled={!recipe.allowCraftAction}
            onclick={(event) => {
              event.stopPropagation();
              if (recipe.allowCraftAction) onCraft(recipe.id, recipe.activeRunId ? { runId: recipe.activeRunId } : undefined);
            }}
          >
            {recipe.craftButtonLabel}
          </button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .recipe-table {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-surface);
    overflow: hidden;
  }

  .recipe-table__head,
  .recipe-table__row {
    display: grid;
    grid-template-columns: minmax(0, 2.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, auto);
    gap: var(--fab-space-2);
    align-items: center;
    padding: var(--fab-space-2) var(--fab-space-3);
  }

  .recipe-table__head {
    background: var(--fab-surface-soft);
    border-bottom: 1px solid var(--fab-border);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
  }

  .recipe-table__row {
    cursor: pointer;
    border-bottom: 1px solid var(--fab-border);
    min-height: var(--fab-v2-row-height);
  }

  .recipe-table__row:last-child {
    border-bottom: none;
  }

  .recipe-table__row:hover {
    background: var(--fab-surface-raised);
  }

  .recipe-table__row:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: -2px;
  }

  .recipe-table__row--selected {
    background: var(--fab-accent-soft);
    box-shadow: inset 3px 0 0 var(--fab-accent);
  }

  .recipe-table__row--selected:hover {
    background: var(--fab-accent-soft);
  }

  .recipe-table__row--teaser {
    opacity: 0.85;
  }

  .recipe-table__cell--recipe {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .recipe-table__image {
    border-radius: 6px;
    object-fit: contain;
    background: var(--fab-surface-raised);
    flex-shrink: 0;
  }

  .recipe-table__name-block {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .recipe-table__name {
    color: var(--fab-text);
    font-size: 14px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recipe-table__description {
    color: var(--fab-text-muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recipe-table__cell--status {
    display: flex;
    flex-direction: column;
    gap: 4px;
    align-items: flex-start;
  }

  .recipe-table__status {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .recipe-table__status.status--available {
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }
  .recipe-table__status.status--in-progress {
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }
  .recipe-table__status.status--missing {
    background: var(--fab-warning-soft);
    color: var(--fab-warning);
  }
  .recipe-table__status.status--locked {
    background: var(--fab-danger-soft);
    color: var(--fab-danger);
  }
  .recipe-table__status.status--learnable {
    background: var(--fab-purple-soft);
    color: var(--fab-purple);
  }

  .recipe-table__chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .recipe-table__chip {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
    background: var(--fab-surface-raised);
    border: 1px solid var(--fab-border);
    padding: 1px 6px;
    border-radius: 4px;
  }

  .recipe-table__chip--complex {
    background: var(--fab-purple-soft);
    color: var(--fab-purple);
    border-color: var(--fab-purple);
  }

  .recipe-table__chip--info {
    background: var(--fab-info-soft);
    color: var(--fab-info);
    border-color: var(--fab-info);
  }

  .recipe-table__cell--requirements {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    color: var(--fab-text-muted);
    font-size: 12px;
  }

  .recipe-table__counter {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-variant-numeric: tabular-nums;
  }

  .recipe-table__result {
    color: var(--fab-text-muted);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recipe-table__cell--actions {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    justify-content: flex-end;
  }

  .recipe-table__action {
    appearance: none;
    -webkit-appearance: none;
    border: 1px solid var(--fab-border);
    background: transparent;
    color: var(--fab-text-muted);
    cursor: pointer;
    border-radius: var(--fab-v2-radius-control);
  }

  .recipe-table__action--icon {
    width: var(--fab-v2-icon-button);
    height: var(--fab-v2-icon-button);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .recipe-table__action--icon.is-favourite {
    color: var(--fab-warning);
    border-color: var(--fab-warning);
  }

  .recipe-table__action--icon:hover:not(:disabled),
  .recipe-table__action--icon:focus-visible {
    color: var(--fab-text);
    border-color: var(--fab-border-strong);
  }

  .recipe-table__action--primary {
    height: var(--fab-v2-icon-button);
    padding: 0 var(--fab-space-3);
    background: var(--fab-accent);
    color: #051e0c;
    border-color: var(--fab-accent-strong);
    font-size: 13px;
    font-weight: 700;
  }

  .recipe-table__action--primary:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .recipe-table__action--primary:disabled {
    background: var(--fab-surface-raised);
    color: var(--fab-text-subtle);
    border-color: var(--fab-border);
    cursor: not-allowed;
  }

  .recipe-table__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-6);
    color: var(--fab-text-subtle);
  }

  .recipe-table__empty i {
    font-size: 28px;
    opacity: 0.5;
  }

  .recipe-table__empty p {
    margin: 0;
    font-size: 13px;
  }

  /* Responsive: collapse the description below the name at narrow widths */
  @container actor-app (max-width: 1080px) {
    .recipe-table__head,
    .recipe-table__row {
      grid-template-columns: minmax(0, 2.2fr) minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, auto);
    }
    .recipe-table__cell--result {
      display: none;
    }
  }

  @container actor-app (max-width: 760px) {
    .recipe-table__head {
      display: none;
    }
    .recipe-table__row {
      grid-template-columns: 1fr;
      gap: var(--fab-space-1);
    }
    .recipe-table__cell--actions {
      justify-content: flex-start;
    }
  }
</style>
