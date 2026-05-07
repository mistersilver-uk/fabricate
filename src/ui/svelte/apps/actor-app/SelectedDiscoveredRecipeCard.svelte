<!-- Svelte 5 runes mode -->
<!--
  SelectedDiscoveredRecipeCard renders the inspector card under the discovered
  recipes panel. It shows expected result, required components, and required
  essences for the actor's currently-selected discovered recipe.

  Secrecy: this component must only ever receive a payload built from the
  filtered `discoveredRecipes` writable. The store helper
  `_recomputeSelectedDiscoveredRecipe()` enforces that. If the payload is
  null (no selection or selection no longer in the filtered list), the card
  renders an empty hint without leaking any recipe data.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let { recipe = null } = $props();
</script>

<section class="selected-discovered-card" data-testid="selected-discovered-card">
  <header class="selected-discovered-card__header">
    <h4 class="selected-discovered-card__title">
      {localize('FABRICATE.ActorApp.Alchemy.SelectedRecipe')}
    </h4>
  </header>

  {#if !recipe}
    <p class="selected-discovered-card__empty">
      {localize('FABRICATE.ActorApp.Alchemy.SelectRecipeHint')}
    </p>
  {:else}
    <div class="selected-discovered-card__identity">
      {#if recipe.img}
        <img
          class="selected-discovered-card__image"
          src={recipe.img}
          alt=""
          width="48"
          height="48"
        />
      {/if}
      <div class="selected-discovered-card__name-block">
        <strong class="selected-discovered-card__name">{recipe.name}</strong>
        <span
          class="selected-discovered-card__status"
          class:available={recipe.canCraft}
          class:missing={!recipe.canCraft}
        >
          {recipe.canCraft
            ? localize('FABRICATE.Alchemy.StatusAvailable')
            : localize('FABRICATE.Alchemy.StatusMissing')}
        </span>
      </div>
    </div>

    {#if recipe.resultDescription}
      <div class="selected-discovered-card__section">
        <h5 class="selected-discovered-card__heading">
          {localize('FABRICATE.ActorApp.Alchemy.ExpectedResult')}
        </h5>
        <p class="selected-discovered-card__result">{recipe.resultDescription}</p>
      </div>
    {/if}

    {#if recipe.ingredientStates && recipe.ingredientStates.length > 0}
      <div class="selected-discovered-card__section">
        <h5 class="selected-discovered-card__heading">
          {localize('FABRICATE.ActorApp.Alchemy.RequiredComponents')}
        </h5>
        <ul class="selected-discovered-card__list">
          {#each recipe.ingredientStates as state, i (`ing-${i}`)}
            <li
              class="selected-discovered-card__row"
              class:satisfied={state.satisfied}
              class:unsatisfied={!state.satisfied}
            >
              <i
                class={state.satisfied ? 'fas fa-check-circle' : 'fas fa-times-circle'}
                aria-hidden="true"
              ></i>
              <span class="selected-discovered-card__row-label">{state.description}</span>
              <span class="selected-discovered-card__row-counts">
                {state.have} / {state.need}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if recipe.essenceStates && recipe.essenceStates.length > 0}
      <div class="selected-discovered-card__section">
        <h5 class="selected-discovered-card__heading">
          {localize('FABRICATE.ActorApp.Alchemy.RequiredEssences')}
        </h5>
        <ul class="selected-discovered-card__list">
          {#each recipe.essenceStates as state, i (`ess-${i}`)}
            <li
              class="selected-discovered-card__row"
              class:satisfied={state.satisfied}
              class:unsatisfied={!state.satisfied}
            >
              <i
                class={state.satisfied ? 'fas fa-check-circle' : 'fas fa-times-circle'}
                aria-hidden="true"
              ></i>
              <span class="selected-discovered-card__row-label">{state.type}</span>
              <span class="selected-discovered-card__row-counts">
                {state.have} / {state.need}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</section>

<style>
  .selected-discovered-card {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-surface-soft);
  }

  .selected-discovered-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .selected-discovered-card__title {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-muted);
  }

  .selected-discovered-card__empty {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-subtle);
    font-style: italic;
  }

  .selected-discovered-card__identity {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .selected-discovered-card__image {
    border-radius: 6px;
    object-fit: contain;
    background: var(--fab-surface-raised);
  }

  .selected-discovered-card__name-block {
    display: flex;
    flex-direction: column;
    min-width: 0;
    gap: 2px;
  }

  .selected-discovered-card__name {
    font-size: 14px;
    font-weight: 700;
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-discovered-card__status {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    align-self: flex-start;
  }

  .selected-discovered-card__status.available {
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .selected-discovered-card__status.missing {
    background: var(--fab-warning-soft);
    color: var(--fab-warning);
  }

  .selected-discovered-card__section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
  }

  .selected-discovered-card__heading {
    margin: 0;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--fab-text-subtle);
  }

  .selected-discovered-card__result {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text);
  }

  .selected-discovered-card__list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .selected-discovered-card__row {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: center;
    gap: var(--fab-space-2);
    padding: 2px 4px;
    font-size: 12px;
  }

  .selected-discovered-card__row.satisfied i {
    color: var(--fab-accent);
  }

  .selected-discovered-card__row.unsatisfied i {
    color: var(--fab-warning);
  }

  .selected-discovered-card__row-label {
    color: var(--fab-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-discovered-card__row-counts {
    font-variant-numeric: tabular-nums;
    color: var(--fab-text-muted);
    font-size: 11px;
  }
</style>
