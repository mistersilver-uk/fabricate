<!-- Svelte 5 runes mode -->
<!--
  Books & Scrolls "Item page" inspector (issue 511).

  The right-hand context panel for the selected recipe item. Shows the linked
  game-world item's icon/name/type and On/Off status, its description, a three-stat
  grid (Recipes · Uses-or-Learning · Learned by), a "Recipes inside" preview list,
  a mode-dependent quick limits block (Limited use in `item` mode, Limited learning
  in `knowledge` mode), and an "Edit recipe item" action.

  All display data is projected upstream by adminStore — this component never
  resolves `fromUuid`.

  Props:
   - item: the selected projected recipe item (or null → placeholder).
   - visibilityMode: 'item' | 'knowledge' — chooses the middle stat + quick limit.
   - onOpenRecipeItem(id): open the per-item editor.
   - onToggleEnabled(id, enabled): flip the item's enabled flag.
   - onToggleQuickLimit(id, limited): flip Limited use / Limited learning.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    item = null,
    visibilityMode = 'knowledge',
    onOpenRecipeItem = () => {},
    onToggleEnabled = () => {},
    onToggleQuickLimit = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const isItemMode = $derived(visibilityMode === 'item');

  const recipes = $derived(Array.isArray(item?.recipes) ? item.recipes : []);
  const recipeCount = $derived(recipes.length);
  const previewRecipes = $derived(recipes.slice(0, 3));
  const moreCount = $derived(Math.max(0, recipeCount - previewRecipes.length));
  const enabled = $derived(item?.enabled !== false);

  function typeIcon() {
    // Type is derived from the linked-recipe count: no recipes → Incomplete
    // (warning), one → Scroll, two or more → Book.
    if (recipeCount === 0) return 'fas fa-triangle-exclamation';
    const type = String(item?.derivedType || '').toLowerCase();
    if (type.includes('scroll')) return 'fas fa-scroll';
    return 'fas fa-book';
  }

  // --- Use caps (item mode) ---
  const useLimited = $derived(item?.caps?.item?.limitUses === true);
  const maxUses = $derived.by(() => {
    const raw = Number(item?.caps?.item?.maxUses);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });

  // --- Learn caps (knowledge mode) — prefer the new shape, fall back to legacy ---
  const learnLimited = $derived(
    item?.caps?.learn?.limitLearning === true || item?.caps?.learn?.limitRecipes === true
  );
  const learnsAllowed = $derived.by(() => {
    const learn = item?.caps?.learn || {};
    const raw = Number(learn.learnsAllowed ?? learn.maxRecipes);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const learnScope = $derived(
    ['perInstance', 'total'].includes(item?.caps?.learn?.learnScope)
      ? item.caps.learn.learnScope
      : item?.caps?.learn?.learningMode === 'party'
        ? 'total'
        : 'perInstance'
  );

  const quickLimited = $derived(isItemMode ? useLimited : learnLimited);

  const midLabel = $derived(
    isItemMode
      ? text('FABRICATE.Admin.Manager.BooksScrolls.Uses', 'Uses')
      : text('FABRICATE.Admin.Manager.BooksScrolls.Learning', 'Learning')
  );

  const midValue = $derived.by(() => {
    if (isItemMode) {
      return useLimited ? String(maxUses) : '∞';
    }
    if (!learnLimited) return text('FABRICATE.Admin.Manager.BooksScrolls.Free', 'Free');
    return `${learnsAllowed}×`;
  });

  const quickSub = $derived.by(() => {
    if (isItemMode) {
      return useLimited
        ? text('FABRICATE.Admin.Manager.BooksScrolls.UseSubLimited', '{n} use(s) per copy').replace('{n}', maxUses)
        : text('FABRICATE.Admin.Manager.BooksScrolls.UseSubFree', 'Can be read any number of times');
    }
    if (!learnLimited) {
      return text('FABRICATE.Admin.Manager.BooksScrolls.LearnSubFree', 'Recipes can be learned freely');
    }
    return learnScope === 'total'
      ? text('FABRICATE.Admin.Manager.BooksScrolls.LearnSubTotal', 'Shared cap across all copies')
      : text('FABRICATE.Admin.Manager.BooksScrolls.LearnSubLimited', 'Learning is capped per copy');
  });
</script>

<div class="manager-books-scrolls-inspector" data-item-page-inspector>
  {#if !item}
    <div class="manager-inspector-empty" data-item-page-empty>
      <i class="fas fa-book-sparkles" aria-hidden="true"></i>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.BooksScrolls.SelectHint', 'Select a recipe item to see its page.')}</p>
    </div>
  {:else}
    <p class="manager-kicker">{text('FABRICATE.Admin.Manager.BooksScrolls.ItemPage', 'Item page')}</p>

    <div class="manager-inspector-title-row is-hero-large">
      <span class="manager-inspector-icon is-hero-large" aria-hidden="true"><i class={typeIcon()}></i></span>
      <div class="manager-inspector-copy">
        <h3 class="manager-inspector-name" data-item-page-name>{item.resolvedName}</h3>
        <span class="manager-books-scrolls-inspector-meta">
          <span class={`manager-chip ${recipeCount === 0 ? 'is-danger' : 'is-neutral'}`} data-item-page-type>{item.derivedType || text('FABRICATE.Admin.Manager.BooksScrolls.TypeBook', 'Book')}</span>
          <button
            type="button"
            class={`manager-status-toggle ${enabled ? 'is-on' : 'is-off'}`}
            aria-pressed={enabled}
            data-item-page-toggle
            aria-label={enabled
              ? text('FABRICATE.Admin.Manager.BooksScrolls.DisableNamed', 'Disable {name}').replace('{name}', item.resolvedName)
              : text('FABRICATE.Admin.Manager.BooksScrolls.EnableNamed', 'Enable {name}').replace('{name}', item.resolvedName)}
            onclick={() => onToggleEnabled(item.id, !enabled)}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{enabled ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
        </span>
      </div>
    </div>

    <p class="manager-muted manager-books-scrolls-inspector-desc" data-item-page-desc>
      {item.description || text('FABRICATE.Admin.Manager.BooksScrolls.NoDescription', 'No description for this recipe item yet.')}
    </p>

    <div class="manager-books-scrolls-stat-grid" data-item-page-stats>
      <div class="manager-books-scrolls-stat" data-item-page-stat="recipes">
        <div class="manager-books-scrolls-stat-value" data-item-page-recipe-count>{recipeCount}</div>
        <div class="manager-books-scrolls-stat-label">{text('FABRICATE.Admin.Manager.BooksScrolls.Recipes', 'Recipes')}</div>
      </div>
      <div class="manager-books-scrolls-stat" data-item-page-stat={isItemMode ? 'uses' : 'learning'}>
        <div class="manager-books-scrolls-stat-value is-accent" data-item-page-mid-value>{midValue}</div>
        <div class="manager-books-scrolls-stat-label" data-item-page-mid-label>{midLabel}</div>
      </div>
      <div class="manager-books-scrolls-stat" data-item-page-stat="learned-by">
        <div class="manager-books-scrolls-stat-value" data-item-page-learned-by>{item.learnedByCount || 0}</div>
        <div class="manager-books-scrolls-stat-label">{text('FABRICATE.Admin.Manager.BooksScrolls.LearnedBy', 'Learned by')}</div>
      </div>
    </div>

    <div class="manager-books-scrolls-recipes-inside" data-item-page-recipes-inside>
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.BooksScrolls.RecipesInside', 'Recipes inside')}</p>
      {#if recipeCount === 0}
        <p class="manager-muted" data-item-page-no-recipes>{text('FABRICATE.Admin.Manager.BooksScrolls.NoRecipesLinked', 'No recipes linked yet.')}</p>
      {:else}
        <div class="manager-books-scrolls-recipe-preview">
          {#each previewRecipes as recipe (recipe.id)}
            <div class="manager-books-scrolls-recipe-preview-row" data-item-page-recipe={recipe.id}>
              <span class="manager-books-scrolls-recipe-preview-icon" aria-hidden="true"><i class="fas fa-scroll"></i></span>
              <span class="manager-books-scrolls-recipe-preview-name">{recipe.name}</span>
              {#if recipe.category}
                <span class="manager-chip is-neutral">{recipe.category}</span>
              {/if}
            </div>
          {/each}
        </div>
        {#if moreCount > 0}
          <p class="manager-muted manager-books-scrolls-more" data-item-page-more>{text('FABRICATE.Admin.Manager.BooksScrolls.MoreRecipes', '+{n} more recipes').replace('{n}', moreCount)}</p>
        {/if}
      {/if}
    </div>

    <section class="manager-inspector-card manager-books-scrolls-quick-limits" data-item-page-quick-limits>
      <div class="manager-inspector-title-row">
        <span class="manager-inspector-icon" aria-hidden="true"><i class="fas fa-sliders"></i></span>
        <div class="manager-inspector-copy">
          <h4 class="manager-inspector-name">{isItemMode
            ? text('FABRICATE.Admin.Manager.BooksScrolls.UseLimits', 'Use limits')
            : text('FABRICATE.Admin.Manager.BooksScrolls.LearningLimits', 'Learning limits')}</h4>
        </div>
      </div>
      <div class="manager-rule-row" data-item-page-quick-limit-row>
        <span class="manager-rule-copy">
          <strong>{isItemMode
            ? text('FABRICATE.Admin.Manager.BooksScrolls.LimitedUse', 'Limited use')
            : text('FABRICATE.Admin.Manager.BooksScrolls.LimitedLearning', 'Limited learning')}</strong>
          <span>{quickSub}</span>
        </span>
        <span class="manager-rule-field">
          <button
            type="button"
            class={`manager-status-toggle ${quickLimited ? 'is-on' : 'is-off'}`}
            aria-pressed={quickLimited}
            data-item-page-quick-limit-toggle
            aria-label={isItemMode
              ? text('FABRICATE.Admin.Manager.BooksScrolls.LimitedUse', 'Limited use')
              : text('FABRICATE.Admin.Manager.BooksScrolls.LimitedLearning', 'Limited learning')}
            onclick={() => onToggleQuickLimit(item.id, !quickLimited)}
          >
            <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
            <span class="manager-status-toggle-label">{quickLimited ? text('FABRICATE.Admin.Manager.StatusOn', 'On') : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</span>
          </button>
        </span>
      </div>
    </section>

    <button
      type="button"
      class="manager-button is-primary manager-books-scrolls-edit-action"
      data-item-page-edit
      onclick={() => onOpenRecipeItem(item.id)}
    >
      <i class="fas fa-pen" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.BooksScrolls.EditRecipeItem', 'Edit recipe item')}</span>
    </button>
  {/if}
</div>

<style>
  .manager-books-scrolls-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-height: 0;
  }

  .manager-inspector-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-6) var(--fab-space-3);
    text-align: center;
  }

  .manager-inspector-empty i {
    font-size: 1.5rem;
    color: var(--fab-text-subtle);
  }

  .manager-books-scrolls-inspector-meta {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    margin-top: var(--fab-space-1);
  }

  .manager-books-scrolls-inspector-desc {
    margin: 0;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 5;
    overflow: hidden;
  }

  .manager-books-scrolls-stat-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--fab-space-2);
  }

  .manager-books-scrolls-stat {
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-mv2-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-bg-1);
    text-align: center;
  }

  .manager-books-scrolls-stat-value {
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--fab-text);
  }

  .manager-books-scrolls-stat-value.is-accent {
    color: var(--fab-info-text);
  }

  .manager-books-scrolls-stat-label {
    margin-top: var(--fab-space-2xs);
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--fab-text-subtle);
  }

  .manager-books-scrolls-recipes-inside {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-books-scrolls-recipe-preview {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-chip);
  }

  .manager-books-scrolls-recipe-preview-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-bg-1);
    min-width: 0;
  }

  .manager-books-scrolls-recipe-preview-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: none;
    border-radius: var(--fab-v2-radius-control);
    background: var(--fab-bg-3);
    color: var(--fab-accent);
    font-size: 0.65rem;
  }

  .manager-books-scrolls-recipe-preview-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.8rem;
  }

  .manager-books-scrolls-more {
    margin: 0;
    padding-left: var(--fab-space-2);
  }

  .manager-books-scrolls-quick-limits {
    margin: 0;
  }

  .manager-books-scrolls-quick-limits .manager-rule-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .manager-books-scrolls-edit-action {
    width: 100%;
    justify-content: center;
    margin-top: auto;
  }
</style>
