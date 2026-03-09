<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    shoppingListData = null,
    shoppingListEntries = [],
    expanded = false,
    onToggleExpanded,
    onRemoveRecipe,
    onSetQuantity,
    onClearAll
  } = $props();

  let entryCount = $derived(shoppingListEntries.length);

  let missingCount = $derived(
    shoppingListData
      ? shoppingListData.ingredients.filter(i => !i.satisfied).length +
        shoppingListData.essences.filter(e => !e.satisfied).length +
        shoppingListData.catalysts.filter(c => !c.available).length
      : 0
  );
</script>

<section class="shopping-list-panel" class:expanded>
  <div class="shopping-list-header">
    <button
      type="button"
      class="shopping-list-toggle"
      onclick={() => onToggleExpanded?.()}
      title={expanded ? 'Collapse shopping list' : 'Expand shopping list'}
    >
      <i class="fas fa-shopping-cart"></i>
      {#if entryCount > 0}
        {localize('FABRICATE.ShoppingList.TitleCount').replace('{count}', entryCount)}
        <span class="shopping-badge" class:unsatisfied={!shoppingListData?.allSatisfied}>{entryCount}</span>
      {:else}
        {localize('FABRICATE.ShoppingList.Title')}
      {/if}
      <i class="fas fa-chevron-{expanded ? 'up' : 'down'} toggle-icon"></i>
    </button>

    {#if entryCount > 0}
      <button
        type="button"
        class="shopping-list-clear"
        onclick={() => onClearAll?.()}
        title={localize('FABRICATE.ShoppingList.ClearAll')}
      >
        <i class="fas fa-trash"></i>
      </button>
    {/if}
  </div>

  {#if expanded}
    <div class="shopping-list-body">
      {#if entryCount === 0}
        <p class="shopping-list-empty hint">
          <i class="fas fa-info-circle"></i>
          {localize('FABRICATE.ShoppingList.Empty')}
        </p>
      {:else}
        <!-- Recipe Entries -->
        <ul class="shopping-list-entries">
          {#each shoppingListEntries as entry (entry.recipeId)}
            <li class="shopping-list-entry">
              <span class="entry-name">{entry.recipeId}</span>
              <div class="entry-quantity-controls">
                <button
                  type="button"
                  class="qty-btn"
                  onclick={() => onSetQuantity?.(entry.recipeId, entry.quantity - 1)}
                  title="Decrease quantity"
                >
                  <i class="fas fa-minus"></i>
                </button>
                <span class="qty-value">{entry.quantity}</span>
                <button
                  type="button"
                  class="qty-btn"
                  onclick={() => onSetQuantity?.(entry.recipeId, entry.quantity + 1)}
                  title="Increase quantity"
                >
                  <i class="fas fa-plus"></i>
                </button>
              </div>
              <button
                type="button"
                class="entry-remove"
                onclick={() => onRemoveRecipe?.(entry.recipeId)}
                title={localize('FABRICATE.ShoppingList.RemoveFromList')}
              >
                <i class="fas fa-times"></i>
              </button>
            </li>
          {/each}
        </ul>

        <!-- Aggregated Materials Table -->
        {#if shoppingListData}
          {#if shoppingListData.ingredients.length > 0}
            <div class="shopping-list-materials">
              <table>
                <thead>
                  <tr>
                    <th>{localize('FABRICATE.ShoppingList.Material')}</th>
                    <th class="qty-col">{localize('FABRICATE.ShoppingList.Need')}</th>
                    <th class="qty-col">{localize('FABRICATE.ShoppingList.Have')}</th>
                    <th class="qty-col">{localize('FABRICATE.ShoppingList.Missing')}</th>
                  </tr>
                </thead>
                <tbody>
                  {#each shoppingListData.ingredients as ing}
                    <tr class:satisfied={ing.satisfied} class:unsatisfied={!ing.satisfied}>
                      <td class="material-name">{ing.description}</td>
                      <td class="qty-col">{ing.totalNeed}</td>
                      <td class="qty-col">{ing.have}</td>
                      <td class="qty-col missing-col">
                        {#if ing.satisfied}
                          <i class="fas fa-check"></i>
                        {:else}
                          {ing.missing}
                        {/if}
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          {/if}

          <!-- Essences -->
          {#if shoppingListData.essences.length > 0}
            <div class="shopping-list-essences">
              <strong>{localize('FABRICATE.ShoppingList.Essences')}:</strong>
              {#each shoppingListData.essences as ess}
                <span
                  class="essence-badge"
                  class:satisfied={ess.satisfied}
                  class:unsatisfied={!ess.satisfied}
                >
                  {ess.type}: {ess.have}/{ess.totalNeed}
                </span>
              {/each}
            </div>
          {/if}

          <!-- Catalysts -->
          {#if shoppingListData.catalysts.length > 0}
            <div class="shopping-list-catalysts">
              <strong>{localize('FABRICATE.ShoppingList.Catalysts')}:</strong>
              {#each shoppingListData.catalysts as cat}
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

          <!-- Summary Footer -->
          <div class="shopping-list-summary" class:all-satisfied={shoppingListData.allSatisfied}>
            {#if shoppingListData.allSatisfied}
              <i class="fas fa-check-circle"></i>
              {localize('FABRICATE.ShoppingList.AllSatisfied')}
            {:else}
              <i class="fas fa-exclamation-triangle"></i>
              {localize('FABRICATE.ShoppingList.MissingCount').replace('{count}', missingCount)}
            {/if}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>
