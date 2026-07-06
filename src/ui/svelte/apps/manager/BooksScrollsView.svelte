<!-- Svelte 5 runes mode -->
<!--
  Books & Scrolls management surface (issue 511).

  "Books & Scrolls" is only the DISPLAY name of the surface; it manages EVERY
  recipe item in the system regardless of its Foundry item type (book, scroll,
  ring, wand, gem, note). "Recipe item" is the canonical noun.

  The surface lists every recipe item with its linked recipes (matched by
  `recipe.recipeItemId`), and surfaces the system-level recipe-item rules — the
  use cap (craft charges), the learn cap, and the consume/destroy behaviour —
  from the persisted `recipeVisibility.knowledge` config. Those rules are
  system-wide (they apply to every recipe item), so they are edited once in a
  shared rules card and reflected per item as read-only chips.

  Editing is LIVE-APPLY: every control passes only its own field to
  `onSaveVisibilityConfig(patch)`, and the store's object-form
  `saveVisibilityConfig` merges the rest from the persisted config. There is no
  dirty draft and no route-exit guard — the surface never stages changes.

  Props:
   - recipeItems: `selectedSystem.recipeItemDefinitions` ({ id, name, img, description }).
   - recipes: the system's recipes (used to count/label linked recipes per item).
   - recipeVisibility: the system's `{ listMode, knowledge: { mode, item, learn } }`.
   - selectedSystemName: the system's display name (kicker).
   - selectedRecipeItemId / onSelectRecipeItem: row selection highlight.
   - onSaveVisibilityConfig(patch): live-apply a single-field config patch.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    recipeItems = [],
    recipes = [],
    recipeVisibility = {},
    selectedSystemName = '',
    selectedRecipeItemId = '',
    onSelectRecipeItem = () => {},
    onSaveVisibilityConfig = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const knowledge = $derived(recipeVisibility?.knowledge || {});
  const limitUses = $derived(knowledge?.item?.limitUses === true);
  const maxUses = $derived(
    Number.isFinite(Number(knowledge?.item?.maxUses)) ? Number(knowledge.item.maxUses) : 1
  );
  const destroyWhenExhausted = $derived(knowledge?.item?.destroyWhenExhausted === true);
  const consumeOnLearn = $derived(knowledge?.learn?.consumeOnLearn !== false);
  const limitRecipes = $derived(knowledge?.learn?.limitRecipes === true);
  const maxRecipes = $derived(
    Number.isFinite(Number(knowledge?.learn?.maxRecipes)) ? Number(knowledge.learn.maxRecipes) : 1
  );
  const destroyWhenSpent = $derived(knowledge?.learn?.destroyWhenSpent === true);

  function recipeItemImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
  }

  // The recipes this recipe item teaches, matched by the recipe's linked
  // `recipeItemId` (the same id the recipe editor stores on the recipe).
  function linkedRecipes(item) {
    const id = String(item?.id || '');
    if (!id) return [];
    return (recipes || []).filter((recipe) => String(recipe?.recipeItemId || '') === id);
  }

  function setLimitUses(next) {
    if (next) {
      onSaveVisibilityConfig({ limitUses: true, maxUses: Math.max(1, maxUses) });
    } else {
      onSaveVisibilityConfig({ limitUses: false });
    }
  }

  function setLimitRecipes(next) {
    if (next) {
      onSaveVisibilityConfig({ limitRecipes: true, maxRecipes: Math.max(1, maxRecipes) });
    } else {
      onSaveVisibilityConfig({ limitRecipes: false });
    }
  }

  function adjustMaxUses(delta) {
    onSaveVisibilityConfig({ maxUses: Math.max(1, maxUses + delta) });
  }

  function adjustMaxRecipes(delta) {
    onSaveVisibilityConfig({ maxRecipes: Math.max(1, maxRecipes + delta) });
  }
</script>

<!-- A compact live-apply boolean toggle used by the rules card. `onToggle(next)`
     lets the cap toggles commit a concrete cap alongside the flag. -->
{#snippet ruleToggle(dataField, ariaKey, ariaFallback, on, onToggle, disabled)}
  <button
    type="button"
    class={`manager-status-toggle ${on ? 'is-on' : 'is-off'}${disabled ? ' is-disabled' : ''}`}
    aria-pressed={on}
    aria-label={text(ariaKey, ariaFallback)}
    disabled={disabled}
    {...{ [dataField]: true }}
    onclick={() => onToggle(!on)}
  >
    <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
    <span class="manager-status-toggle-label">{on
      ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
      : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span>
  </button>
{/snippet}

{#snippet ruleStepper(dataField, ariaKey, ariaFallback, decAriaKey, decAriaFallback, incAriaKey, incAriaFallback, value, onDec, onInc, onInput, disabled)}
  <div class="manager-recipe-visibility-stepper" {...{ [dataField]: true }}>
    <button type="button" class="manager-icon-button" disabled={disabled} aria-label={text(decAriaKey, decAriaFallback)} onclick={onDec}><i class="fas fa-minus" aria-hidden="true"></i></button>
    <input type="number" min="1" step="1" value={value} disabled={disabled} aria-label={text(ariaKey, ariaFallback)} oninput={onInput} />
    <button type="button" class="manager-icon-button" disabled={disabled} aria-label={text(incAriaKey, incAriaFallback)} onclick={onInc}><i class="fas fa-plus" aria-hidden="true"></i></button>
  </div>
{/snippet}

<main class="manager-main manager-books-scrolls-main" aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Title', 'Books & Scrolls')} data-books-scrolls>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.BooksScrolls.Library', 'Books & Scrolls')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.BooksScrolls.LibraryHint', 'Every recipe item in this system — books, scrolls, or any item type — with its linked recipes and the shared recipe-item rules.')}</p>
    </div>
  </section>

  <section class="manager-inspector-card manager-books-scrolls-rules" data-books-scrolls-rules aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Rules', 'Recipe item rules')}>
    <div class="manager-inspector-title-row">
      <span class="manager-inspector-icon" aria-hidden="true"><i class="fas fa-sliders"></i></span>
      <div class="manager-inspector-copy">
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.BooksScrolls.RulesKicker', 'System-wide')}</p>
        <h3 class="manager-inspector-name">{text('FABRICATE.Admin.Manager.BooksScrolls.Rules', 'Recipe item rules')}</h3>
      </div>
    </div>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.BooksScrolls.RulesHint', 'These rules apply to every recipe item in this system. Changes apply immediately.')}</p>

    <div class="manager-rules-stack">
      <div class="manager-rule-row" data-books-scrolls-limit-uses-row>
        <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-repeat"></i></span>
        <span class="manager-rule-copy">
          <strong>{text('FABRICATE.Admin.Manager.BooksScrolls.UseCap', 'Limited uses of recipe items')}</strong>
          <span>{text('FABRICATE.Admin.Manager.BooksScrolls.UseCapHint', 'Cap how many times a recipe item grants crafting access.')}</span>
        </span>
        <span class="manager-rule-field">
          {@render ruleToggle('data-books-scrolls-limit-uses', 'FABRICATE.Admin.Manager.BooksScrolls.UseCap', 'Limited uses of recipe items', limitUses, setLimitUses, false)}
        </span>
      </div>
      <div class="manager-rule-row" class:is-disabled={!limitUses} data-books-scrolls-max-uses-row>
        <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-hashtag"></i></span>
        <span class="manager-rule-copy">
          <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses')}</strong>
        </span>
        <span class="manager-rule-field">
          {@render ruleStepper('data-books-scrolls-max-uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemMaxUses', 'Maximum uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesDecrease', 'Decrease maximum uses', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxUsesIncrease', 'Increase maximum uses', maxUses, () => adjustMaxUses(-1), () => adjustMaxUses(1), (event) => onSaveVisibilityConfig({ maxUses: Math.max(1, Number(event.target.value || 1)) }), !limitUses)}
        </span>
      </div>
      <div class="manager-rule-row" class:is-disabled={!limitUses} data-books-scrolls-destroy-exhausted-row>
        <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-trash"></i></span>
        <span class="manager-rule-copy">
          <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete when exhausted')}</strong>
        </span>
        <span class="manager-rule-field">
          {@render ruleToggle('data-books-scrolls-destroy-exhausted', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete when exhausted', destroyWhenExhausted, (next) => onSaveVisibilityConfig({ destroyWhenExhausted: next }), !limitUses)}
        </span>
      </div>

      <div class="manager-rule-row" data-books-scrolls-limit-recipes-row>
        <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-graduation-cap"></i></span>
        <span class="manager-rule-copy">
          <strong>{text('FABRICATE.Admin.Manager.BooksScrolls.LearnCap', 'Limited recipes learned per item')}</strong>
          <span>{text('FABRICATE.Admin.Manager.BooksScrolls.LearnCapHint', 'Cap how many recipes a player can learn from one recipe item.')}</span>
        </span>
        <span class="manager-rule-field">
          {@render ruleToggle('data-books-scrolls-limit-recipes', 'FABRICATE.Admin.Manager.BooksScrolls.LearnCap', 'Limited recipes learned per item', limitRecipes, setLimitRecipes, false)}
        </span>
      </div>
      <div class="manager-rule-row" class:is-disabled={!limitRecipes} data-books-scrolls-max-recipes-row>
        <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-hashtag"></i></span>
        <span class="manager-rule-copy">
          <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipes', 'Maximum recipes')}</strong>
        </span>
        <span class="manager-rule-field">
          {@render ruleStepper('data-books-scrolls-max-recipes', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipes', 'Maximum recipes', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipesDecrease', 'Decrease maximum recipes', 'FABRICATE.Admin.Manager.System.RecipeVisibility.MaxRecipesIncrease', 'Increase maximum recipes', maxRecipes, () => adjustMaxRecipes(-1), () => adjustMaxRecipes(1), (event) => onSaveVisibilityConfig({ maxRecipes: Math.max(1, Number(event.target.value || 1)) }), !limitRecipes)}
        </span>
      </div>
      <div class="manager-rule-row" class:is-disabled={!limitRecipes} data-books-scrolls-destroy-spent-row>
        <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-trash"></i></span>
        <span class="manager-rule-copy">
          <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.DestroyWhenSpent', 'Delete when spent')}</strong>
        </span>
        <span class="manager-rule-field">
          {@render ruleToggle('data-books-scrolls-destroy-spent', 'FABRICATE.Admin.Manager.System.RecipeVisibility.DestroyWhenSpent', 'Delete when spent', destroyWhenSpent, (next) => onSaveVisibilityConfig({ destroyWhenSpent: next }), !limitRecipes)}
        </span>
      </div>

      <!-- Consume-on-learn is incompatible with a learn cap (it deletes the item
           on the first learn), so it is hidden while the cap is on — the
           learn-cap Destroy-when-spent option replaces it. -->
      {#if !limitRecipes}
        <div class="manager-rule-row" data-books-scrolls-consume-on-learn-row>
          <span class="manager-rule-icon" aria-hidden="true"><i class="fas fa-wand-magic-sparkles"></i></span>
          <span class="manager-rule-copy">
            <strong>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearn', 'Consume item on learn')}</strong>
            <span>{text('FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearnHint', 'Delete the recipe item when a player learns it.')}</span>
          </span>
          <span class="manager-rule-field">
            {@render ruleToggle('data-books-scrolls-consume-on-learn', 'FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearn', 'Consume item on learn', consumeOnLearn, (next) => onSaveVisibilityConfig({ consumeOnLearn: next }), false)}
          </span>
        </div>
      {/if}
    </div>
  </section>

  <section class="manager-table-scroll manager-books-scrolls-scroll" aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Table', 'Recipe items')}>
    {#if (recipeItems || []).length === 0}
      <div class="manager-empty" data-books-scrolls-empty>
        <div>
          <i class="fas fa-book" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyTitle', 'No recipe items yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyHint', 'Link a recipe item to a recipe in the recipe editor and it will appear here.')}</p>
        </div>
      </div>
    {:else}
      <div class="manager-books-scrolls-list" role="list">
        {#each recipeItems as item (item.id)}
          {@const linked = linkedRecipes(item)}
          <!-- The listitem role lives on a plain wrapper div (codebase convention);
               the interactive card stays a native <button aria-pressed>, so screen
               readers announce a pressable control with its selected state. -->
          <div class="manager-books-scrolls-listitem" role="listitem">
          <button
            type="button"
            class={`manager-inspector-card manager-books-scrolls-card ${selectedRecipeItemId === item.id ? 'is-selected' : ''}`}
            aria-pressed={selectedRecipeItemId === item.id}
            data-books-scrolls-item={item.id}
            onclick={() => onSelectRecipeItem(item.id)}
          >
            <span class="manager-books-scrolls-identity">
              <img class="manager-books-scrolls-thumb" src={recipeItemImage(item)} alt="" />
              <span class="manager-books-scrolls-copy">
                <span class="manager-books-scrolls-name" title={item.name}>{item.name}</span>
                <span class="manager-books-scrolls-count" data-books-scrolls-linked-count={item.id}>
                  {text('FABRICATE.Admin.Manager.BooksScrolls.LinkedRecipes', 'Linked recipes')}: <strong>{linked.length}</strong>
                </span>
              </span>
            </span>

            <span class="manager-chip-row manager-books-scrolls-chips">
              <span class={`manager-chip ${limitUses ? 'is-active' : 'is-disabled'}`} data-books-scrolls-use-chip={item.id}>
                {limitUses
                  ? text('FABRICATE.Admin.Manager.BooksScrolls.UseCapChip', 'Use cap: {n}').replace('{n}', maxUses)
                  : text('FABRICATE.Admin.Manager.BooksScrolls.UseCapNone', 'Unlimited uses')}
              </span>
              <span class={`manager-chip ${limitRecipes ? 'is-active' : 'is-disabled'}`} data-books-scrolls-learn-chip={item.id}>
                {limitRecipes
                  ? text('FABRICATE.Admin.Manager.BooksScrolls.LearnCapChip', 'Learn cap: {n}').replace('{n}', maxRecipes)
                  : text('FABRICATE.Admin.Manager.BooksScrolls.LearnCapNone', 'Learn all')}
              </span>
              {#if limitRecipes ? destroyWhenSpent : consumeOnLearn}
                <span class="manager-chip" data-books-scrolls-consume-chip={item.id}>
                  {limitRecipes
                    ? text('FABRICATE.Admin.Manager.System.RecipeVisibility.DestroyWhenSpent', 'Delete when spent')
                    : text('FABRICATE.Admin.Manager.System.RecipeVisibility.ConsumeOnLearn', 'Consume item on learn')}
                </span>
              {/if}
              {#if limitUses && destroyWhenExhausted}
                <span class="manager-chip" data-books-scrolls-destroy-chip={item.id}>
                  {text('FABRICATE.Admin.Manager.System.RecipeVisibility.ItemDestroyWhenExhausted', 'Delete when exhausted')}
                </span>
              {/if}
            </span>

            {#if linked.length > 0}
              <span class="manager-books-scrolls-recipes" data-books-scrolls-recipe-list={item.id}>
                {#each linked as recipe (recipe.id)}
                  <span class="manager-chip is-neutral" data-books-scrolls-recipe={recipe.id}>{recipe.name}</span>
                {/each}
              </span>
            {:else}
              <span class="manager-muted manager-books-scrolls-unlinked">{text('FABRICATE.Admin.Manager.BooksScrolls.NoLinkedRecipes', 'No recipes link to this item yet.')}</span>
            {/if}
          </button>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  .manager-books-scrolls-main {
    gap: var(--fab-space-3);
    padding: var(--fab-space-3);
    overflow: hidden;
  }

  .manager-books-scrolls-rules {
    margin: 0;
  }

  .manager-books-scrolls-rules .manager-rule-row.is-disabled {
    opacity: 0.55;
  }

  .manager-books-scrolls-scroll {
    overflow-y: auto;
    min-height: 0;
  }

  .manager-books-scrolls-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-books-scrolls-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'identity chips'
      'recipes recipes';
    gap: var(--fab-space-2);
    width: 100%;
    text-align: left;
    align-items: start;
    cursor: pointer;
  }

  .manager-books-scrolls-card.is-selected {
    border-color: var(--fab-mv2-accent);
  }

  .manager-books-scrolls-identity {
    grid-area: identity;
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-books-scrolls-thumb {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    object-fit: cover;
    flex: none;
  }

  .manager-books-scrolls-copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .manager-books-scrolls-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-books-scrolls-chips {
    grid-area: chips;
    justify-content: flex-end;
    flex-wrap: wrap;
  }

  .manager-books-scrolls-recipes {
    grid-area: recipes;
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-1);
  }

  .manager-books-scrolls-unlinked {
    grid-area: recipes;
  }
</style>
