<!-- Svelte 5 runes mode -->
<!--
  SimpleRecipeInspector is the right-side inspector panel for the V2 Crafting
  tab when the selected recipe is a simple (single-step / single-set) recipe.

  It honours teaser/non-GM rules: the prepared recipe shape already replaces
  hidden requirements/results with placeholders. The inspector renders only
  what was provided, never raw recipe internals.

  The complex-recipe variant is added in Slice 3 and dispatched to via
  `SelectedRecipeInspector.svelte`.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    recipe = null,
    onCraft = () => {},
    onAddToShoppingList = () => {},
    onToggleFavourite = () => {},
    onShowDetails = () => {},
    onLearnRecipe = () => {},
    onRestartRun = () => {}
  } = $props();

  function formatRemaining(seconds) {
    const value = Math.max(0, Math.ceil(Number(seconds) || 0));
    if (value < 60) return `${value}s`;
    const minutes = Math.floor(value / 60);
    const remainder = value % 60;
    if (minutes < 60) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const min = minutes % 60;
    return min > 0 ? `${hours}h ${min}m` : `${hours}h`;
  }
</script>

<aside class="simple-inspector" data-testid="simple-recipe-inspector" aria-label={recipe?.name ?? ''}>
  {#if !recipe}
    <p class="simple-inspector__empty">
      {localize('FABRICATE.ActorApp.Crafting.SelectRecipeHint')}
    </p>
  {:else}
    <header class="simple-inspector__header">
      <img
        class="simple-inspector__image"
        src={recipe.img || 'icons/svg/item-bag.svg'}
        alt=""
        width="64"
        height="64"
      />
      <div class="simple-inspector__identity">
        <h3 class="simple-inspector__name">{recipe.name}</h3>
        <span class="simple-inspector__status status--{recipe.canCraft ? 'available' : (recipe.activeRunStatusLabel ? 'in-progress' : 'missing')}">
          {recipe.statusLabel}
        </span>
      </div>
      <button
        type="button"
        class="simple-inspector__icon-btn"
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
      <p class="simple-inspector__description">{recipe.description}</p>
    {/if}

    {#if recipe.activeRunStepLabel || recipe.activeRunRemainingSeconds > 0}
      <section class="simple-inspector__active-run">
        <h4 class="simple-inspector__heading">
          {localize('FABRICATE.ActorApp.Crafting.ActiveRun')}
        </h4>
        {#if recipe.activeRunStepLabel}
          <p class="simple-inspector__step">{recipe.activeRunStepLabel}</p>
        {/if}
        {#if recipe.activeRunRemainingSeconds > 0}
          <p class="simple-inspector__remaining">
            {localize('FABRICATE.ActorApp.Crafting.RemainingTime').replace('{time}', formatRemaining(recipe.activeRunRemainingSeconds))}
          </p>
        {/if}
      </section>
    {/if}

    {#if recipe.resultDescription}
      <section class="simple-inspector__section">
        <h4 class="simple-inspector__heading">
          {localize('FABRICATE.ActorApp.Crafting.ExpectedResult')}
        </h4>
        <p class="simple-inspector__result">{recipe.resultDescription}</p>
      </section>
    {/if}

    {#if recipe.ingredients?.length > 0}
      <section class="simple-inspector__section">
        <h4 class="simple-inspector__heading">
          {localize('FABRICATE.ActorApp.Crafting.Requirements')}
        </h4>
        <ul class="simple-inspector__list">
          {#each recipe.ingredients as ing, i (`ing-${i}`)}
            <li class="simple-inspector__row" class:satisfied={ing.satisfied} class:unsatisfied={!ing.satisfied}>
              <i class={ing.satisfied ? 'fas fa-check-circle' : 'fas fa-times-circle'} aria-hidden="true"></i>
              <span class="simple-inspector__row-label">{ing.description}</span>
              <span class="simple-inspector__row-counts">{ing.have} / {ing.need}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if recipe.essences?.length > 0}
      <section class="simple-inspector__section">
        <h4 class="simple-inspector__heading">
          {localize('FABRICATE.ActorApp.Crafting.Essences')}
        </h4>
        <ul class="simple-inspector__list">
          {#each recipe.essences as ess, i (`ess-${i}`)}
            <li class="simple-inspector__row" class:satisfied={ess.satisfied} class:unsatisfied={!ess.satisfied}>
              <i class={ess.satisfied ? 'fas fa-check-circle' : 'fas fa-times-circle'} aria-hidden="true"></i>
              <span class="simple-inspector__row-label">{ess.type}</span>
              <span class="simple-inspector__row-counts">{ess.have} / {ess.need}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if recipe.catalysts?.length > 0}
      <section class="simple-inspector__section">
        <h4 class="simple-inspector__heading">
          {localize('FABRICATE.ActorApp.Crafting.Catalysts')}
        </h4>
        <ul class="simple-inspector__list">
          {#each recipe.catalysts as cat, i (`cat-${i}`)}
            <li class="simple-inspector__row" class:satisfied={cat.available} class:unsatisfied={!cat.available}>
              <i class={cat.available ? 'fas fa-check-circle' : 'fas fa-times-circle'} aria-hidden="true"></i>
              <span class="simple-inspector__row-label">{cat.name}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if recipe.timeAndCost}
      <section class="simple-inspector__time-cost" data-testid="time-cost-card">
        <h4 class="simple-inspector__heading">
          {localize('FABRICATE.ActorApp.CraftPlan.TimeAndCost')}
        </h4>
        <dl class="simple-inspector__time-cost-list">
          {#if recipe.timeAndCost.timeLabel}
            <div class="simple-inspector__time-cost-row">
              <dt><i class="fas fa-clock" aria-hidden="true"></i> {localize('FABRICATE.ActorApp.CraftPlan.TimeLabel')}</dt>
              <dd>{recipe.timeAndCost.timeLabel}</dd>
            </div>
          {/if}
          {#if recipe.timeAndCost.currencyLabel}
            <div class="simple-inspector__time-cost-row">
              <dt><i class="fas fa-coins" aria-hidden="true"></i> {localize('FABRICATE.ActorApp.CraftPlan.CoinCostLabel')}</dt>
              <dd>{recipe.timeAndCost.currencyLabel}</dd>
            </div>
          {/if}
        </dl>
      </section>
    {/if}

    <footer class="simple-inspector__actions">
      {#if recipe.canLearn}
        <button
          type="button"
          class="simple-inspector__btn simple-inspector__btn--primary"
          onclick={() => onLearnRecipe(recipe.id)}
        >
          <i class="fas fa-book-open" aria-hidden="true"></i>
          {localize('FABRICATE.RecipeCard.Learn')}
        </button>
      {:else}
        <button
          type="button"
          class="simple-inspector__btn simple-inspector__btn--primary"
          disabled={!recipe.allowCraftAction}
          onclick={() => {
            if (recipe.allowCraftAction) onCraft(recipe.id, recipe.activeRunId ? { runId: recipe.activeRunId } : undefined);
          }}
        >
          <i class={recipe.activeRunId ? 'fas fa-play' : 'fas fa-hammer'} aria-hidden="true"></i>
          {recipe.craftButtonLabel}
        </button>
      {/if}
      <button
        type="button"
        class="simple-inspector__btn simple-inspector__btn--secondary"
        disabled={recipe.isTeaser}
        onclick={() => onAddToShoppingList(recipe.id, 1)}
      >
        <i class="fas fa-cart-plus" aria-hidden="true"></i>
        {localize('FABRICATE.ShoppingList.AddToList')}
      </button>
      {#if recipe.activeRunId}
        <button
          type="button"
          class="simple-inspector__btn simple-inspector__btn--secondary"
          onclick={() => onRestartRun(recipe.id, recipe.activeRunId)}
        >
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
          {localize('FABRICATE.RecipeCard.RestartRun')}
        </button>
      {/if}
      <button
        type="button"
        class="simple-inspector__btn simple-inspector__btn--secondary"
        onclick={() => onShowDetails(recipe.id)}
      >
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        {localize('FABRICATE.RecipeCard.ShowDetails')}
      </button>
    </footer>
  {/if}
</aside>

<style>
  .simple-inspector {
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

  .simple-inspector__empty {
    margin: 0;
    color: var(--fab-text-subtle);
    font-style: italic;
    font-size: 13px;
  }

  .simple-inspector__header {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .simple-inspector__image {
    border-radius: 6px;
    object-fit: contain;
    background: var(--fab-surface-raised);
  }

  .simple-inspector__identity {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 4px;
  }

  .simple-inspector__name {
    margin: 0;
    color: var(--fab-text);
    font-size: 16px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .simple-inspector__status {
    align-self: flex-start;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .simple-inspector__status.status--available {
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }
  .simple-inspector__status.status--in-progress {
    background: var(--fab-info-soft);
    color: var(--fab-info);
  }
  .simple-inspector__status.status--missing {
    background: var(--fab-warning-soft);
    color: var(--fab-warning);
  }

  .simple-inspector__icon-btn {
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

  .simple-inspector__icon-btn.is-favourite {
    color: var(--fab-warning);
    border-color: var(--fab-warning);
  }

  .simple-inspector__description {
    margin: 0;
    color: var(--fab-text-muted);
    font-size: 12px;
  }

  .simple-inspector__section,
  .simple-inspector__active-run {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .simple-inspector__active-run {
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-info);
    border-radius: var(--fab-v2-radius-control);
    background: var(--fab-info-soft);
  }

  .simple-inspector__heading {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
  }

  .simple-inspector__step,
  .simple-inspector__remaining,
  .simple-inspector__result {
    margin: 0;
    color: var(--fab-text);
    font-size: 13px;
  }

  .simple-inspector__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .simple-inspector__row {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: var(--fab-space-2);
    padding: 2px 4px;
    font-size: 12px;
  }

  .simple-inspector__row.satisfied i {
    color: var(--fab-accent);
  }

  .simple-inspector__row.unsatisfied i {
    color: var(--fab-warning);
  }

  .simple-inspector__row-label {
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .simple-inspector__row-counts {
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
    font-size: 11px;
  }

  .simple-inspector__time-cost {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    padding: var(--fab-space-2);
    border-radius: var(--fab-v2-radius-control);
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-soft);
  }

  .simple-inspector__time-cost-list {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .simple-inspector__time-cost-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: 13px;
  }

  .simple-inspector__time-cost-row dt {
    margin: 0;
    color: var(--fab-text-muted);
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
  }

  .simple-inspector__time-cost-row dd {
    margin: 0;
    color: var(--fab-text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .simple-inspector__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    padding-top: var(--fab-space-2);
    border-top: 1px solid var(--fab-border);
  }

  .simple-inspector__btn {
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

  .simple-inspector__btn--primary {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    border-color: var(--fab-accent-strong);
    flex: 1;
    justify-content: center;
  }

  .simple-inspector__btn--primary:hover:not(:disabled) {
    background: var(--fab-accent-hover);
  }

  .simple-inspector__btn--primary:disabled {
    background: var(--fab-surface-raised);
    color: var(--fab-text-subtle);
    border-color: var(--fab-border);
    cursor: not-allowed;
  }

  .simple-inspector__btn--secondary {
    background: transparent;
    color: var(--fab-text-muted);
  }

  .simple-inspector__btn--secondary:hover:not(:disabled),
  .simple-inspector__btn--secondary:focus-visible {
    background: var(--fab-surface-raised);
    color: var(--fab-text);
  }
</style>
