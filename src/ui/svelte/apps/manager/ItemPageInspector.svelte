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
  import Chip from './Chip.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import StatusToggle from '../../components/StatusToggle.svelte';
  import InspectorCard from '../../components/InspectorCard.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    item = null,
    visibilityMode = 'knowledge',
    onOpenRecipeItem = () => {},
    onToggleEnabled = () => {},
    onToggleQuickLimit = () => {},
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

  // Matches the Books & Scrolls library pill and the Knowledge row: a multi-recipe
  // item names its own count, so one recipe item reads the same way on every screen.
  function typePillLabel() {
    if (recipeCount >= 2) {
      return text(
        'FABRICATE.Admin.Manager.BooksScrolls.TypeRecipeBook',
        '{count} Recipe Book'
      ).replace('{count}', recipeCount);
    }
    if (recipeCount === 1) return text('FABRICATE.Admin.Manager.BooksScrolls.TypeScroll', 'Scroll');
    return text('FABRICATE.Admin.Manager.BooksScrolls.TypeIncomplete', 'Incomplete');
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
        ? text('FABRICATE.Admin.Manager.BooksScrolls.UseSubLimited', '{n} use(s) per copy').replace(
            '{n}',
            maxUses
          )
        : text(
            'FABRICATE.Admin.Manager.BooksScrolls.UseSubFree',
            'Can be read any number of times'
          );
    }
    if (!learnLimited) {
      return text(
        'FABRICATE.Admin.Manager.BooksScrolls.LearnSubFree',
        'Recipes can be learned freely'
      );
    }
    return learnScope === 'total'
      ? text('FABRICATE.Admin.Manager.BooksScrolls.LearnSubTotal', 'Shared cap across all copies')
      : text('FABRICATE.Admin.Manager.BooksScrolls.LearnSubLimited', 'Learning is capped per copy');
  });
</script>

<div class="manager-books-scrolls-inspector" data-item-page-inspector>
  {#if !item}
    <div class="manager-inspector-empty" data-item-page-empty>
      <i class="fas fa-book" aria-hidden="true"></i>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.BooksScrolls.SelectHint',
          'Select a recipe item to see its page.'
        )}
      </p>
    </div>
  {:else}
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.BooksScrolls.ItemPage', 'Item page')}
    </p>

    <div class="manager-inspector-title-row is-hero-large">
      <span class="manager-inspector-icon is-hero-large" aria-hidden="true"
        ><i class={typeIcon()}></i></span
      >
      <div class="manager-inspector-copy">
        <h3 class="manager-inspector-name" data-item-page-name>{item.resolvedName}</h3>
        <span class="manager-books-scrolls-inspector-meta">
          <Chip tone={recipeCount === 0 ? 'danger' : 'neutral'} data-item-page-type
            >{typePillLabel()}</Chip
          >
          <StatusToggle
            on={enabled}
            label={enabled
              ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
              : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
            ariaLabel={enabled
              ? text('FABRICATE.Admin.Manager.BooksScrolls.DisableNamed', 'Disable {name}').replace(
                  '{name}',
                  item.resolvedName
                )
              : text('FABRICATE.Admin.Manager.BooksScrolls.EnableNamed', 'Enable {name}').replace(
                  '{name}',
                  item.resolvedName
                )}
            data-item-page-toggle=""
            onclick={() => onToggleEnabled(item.id, !enabled)}
          />
        </span>
      </div>
    </div>

    <p class="manager-muted manager-books-scrolls-inspector-desc" data-item-page-desc>
      {item.description ||
        text(
          'FABRICATE.Admin.Manager.BooksScrolls.NoDescription',
          'No description for this recipe item yet.'
        )}
    </p>

    <div class="manager-books-scrolls-stat-grid" data-item-page-stats>
      <div class="manager-books-scrolls-stat" data-item-page-stat="recipes">
        <div class="manager-books-scrolls-stat-value" data-item-page-recipe-count>
          {recipeCount}
        </div>
        <div class="manager-books-scrolls-stat-label">
          {text('FABRICATE.Admin.Manager.BooksScrolls.Recipes', 'Recipes')}
        </div>
      </div>
      <div
        class="manager-books-scrolls-stat"
        data-item-page-stat={isItemMode ? 'uses' : 'learning'}
      >
        <div class="manager-books-scrolls-stat-value is-accent" data-item-page-mid-value>
          {midValue}
        </div>
        <div class="manager-books-scrolls-stat-label" data-item-page-mid-label>{midLabel}</div>
      </div>
      <div class="manager-books-scrolls-stat" data-item-page-stat="learned-by">
        <div class="manager-books-scrolls-stat-value" data-item-page-learned-by>
          {item.learnedByCount || 0}
        </div>
        <div class="manager-books-scrolls-stat-label">
          {text('FABRICATE.Admin.Manager.BooksScrolls.LearnedBy', 'Learned by')}
        </div>
      </div>
    </div>

    <div class="manager-books-scrolls-recipes-inside" data-item-page-recipes-inside>
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.BooksScrolls.RecipesInside', 'Recipes inside')}
      </p>
      {#if recipeCount === 0}
        <p class="manager-muted" data-item-page-no-recipes>
          {text('FABRICATE.Admin.Manager.BooksScrolls.NoRecipesLinked', 'No recipes linked yet.')}
        </p>
      {:else}
        <div class="manager-books-scrolls-recipe-preview">
          {#each previewRecipes as recipe (recipe.id)}
            <div class="manager-books-scrolls-recipe-preview-row" data-item-page-recipe={recipe.id}>
              <span class="manager-books-scrolls-recipe-preview-icon" aria-hidden="true"
                ><i class="fas fa-scroll"></i></span
              >
              <span class="manager-books-scrolls-recipe-preview-name">{recipe.name}</span>
              {#if recipe.category}
                <Chip tone="neutral">{recipe.category}</Chip>
              {/if}
            </div>
          {/each}
        </div>
        {#if moreCount > 0}
          <p class="manager-muted manager-books-scrolls-more" data-item-page-more>
            {text('FABRICATE.Admin.Manager.BooksScrolls.MoreRecipes', '+{n} more recipes').replace(
              '{n}',
              moreCount
            )}
          </p>
        {/if}
      {/if}
    </div>

    <InspectorCard class="manager-books-scrolls-quick-limits" data-item-page-quick-limits="">
      <div class="manager-inspector-title-row">
        <span class="manager-inspector-icon" aria-hidden="true"><i class="fas fa-sliders"></i></span
        >
        <div class="manager-inspector-copy">
          <h4 class="manager-inspector-name">
            {isItemMode
              ? text('FABRICATE.Admin.Manager.BooksScrolls.UseLimits', 'Use limits')
              : text('FABRICATE.Admin.Manager.BooksScrolls.LearningLimits', 'Learning limits')}
          </h4>
        </div>
      </div>
      <div class="manager-rule-row" data-item-page-quick-limit-row>
        <span class="manager-rule-copy">
          <strong
            >{isItemMode
              ? text('FABRICATE.Admin.Manager.BooksScrolls.LimitedUse', 'Limited use')
              : text(
                  'FABRICATE.Admin.Manager.BooksScrolls.LimitedLearning',
                  'Limited learning'
                )}</strong
          >
          <span>{quickSub}</span>
        </span>
        <span class="manager-rule-field">
          <StatusToggle
            on={quickLimited}
            label={quickLimited
              ? text('FABRICATE.Admin.Manager.StatusOn', 'On')
              : text('FABRICATE.Admin.Manager.StatusOff', 'Off')}
            ariaLabel={isItemMode
              ? text('FABRICATE.Admin.Manager.BooksScrolls.LimitedUse', 'Limited use')
              : text('FABRICATE.Admin.Manager.BooksScrolls.LimitedLearning', 'Limited learning')}
            data-item-page-quick-limit-toggle=""
            onclick={() => onToggleQuickLimit(item.id, !quickLimited)}
          />
        </span>
      </div>
    </InspectorCard>

    <ManagerButton
      role="primary"
      class="manager-books-scrolls-edit-action"
      data-item-page-edit
      onclick={() => onOpenRecipeItem(item.id)}
    >
      <i class="fas fa-pen" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.BooksScrolls.EditRecipeItem', 'Edit recipe item')}</span>
    </ManagerButton>
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
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-books-panel-radius);
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
    border: 1px solid var(--fab-border);
    border-radius: var(--fab-books-panel-radius);
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
    border-radius: var(--fab-books-control-radius);
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

  /* `:global()` AND CHAINED (issue 1427), for the reason the `.manager-books-scrolls-edit-action`
     rule below states for `<ManagerButton>`. The quick-limits card is an `<InspectorCard>` now,
     so `manager-books-scrolls-quick-limits` rides the `class` prop onto an element THIS
     component does not write, and Svelte stamps its `svelte-<hash>` only onto the ones it does.
     This half of the sweep was the LOUD one — the component spreads no attributes onto a regular
     element, so the compiler pruned the descendant rule and `lint:svelte:warnings` named it. The
     bare rule beside it did NOT warn and was equally dead, so both are repaired.
     `.manager-inspector-card` is chained rather than left off so the selector stays at (0,2,0),
     exactly where the scoped form put it. */
  :global(.manager-inspector-card.manager-books-scrolls-quick-limits) {
    margin: 0;
  }

  /* Same repair, and WHOLLY `:global()` rather than a `:global()` ancestor with a scoped
     descendant — which is the form that looks right and quietly changes the cascade. Svelte
     writes the hash as `:where(.svelte-<hash>)`, worth nothing, only while the selector has
     another scoped compound to carry it; leave `.manager-rule-row` as the ONLY scoped compound
     and the compiler emits a bare `.svelte-<hash>` instead, taking the rule from (0,3,0) to
     (0,4,0). Measured, not assumed. Inside the `:global()` it stays at (0,3,0), and the ancestor
     compound is written by nothing but this component, so the match set is unchanged. */
  :global(.manager-inspector-card.manager-books-scrolls-quick-limits .manager-rule-row) {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* `:global()` AND CHAINED (issue 1118), for the two reasons `BulkEditPanelShell` gives at
     length. `:global()` because this is a `<ManagerButton>` now, and Svelte stamps its
     `svelte-<hash>` class onto the elements this component WRITES rather than onto a child
     component's internals — a scoped selector would have matched nothing while the compiler,
     `lint:svelte:warnings` and every hand-stamped fixture all reported clean, and this
     button would have quietly stopped filling the rail and stopped sitting on its bottom
     edge. Chained because `justify-content` is stated by the base control at (0,2,0) and a
     bare `:global(.manager-books-scrolls-edit-action)` would be (0,1,0); naming the ancestor
     and both primitive classes puts all three declarations at (0,4,0), which is decided by
     specificity rather than by which sheet the browser loaded last. */
  :global(.fabricate-manager .manager-button.fab-manager-button.manager-books-scrolls-edit-action) {
    width: 100%;
    justify-content: center;
    margin-top: auto;
  }
</style>
