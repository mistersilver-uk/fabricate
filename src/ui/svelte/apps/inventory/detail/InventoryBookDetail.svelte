<!-- Svelte 5 runes mode -->
<!--
  InventoryBookDetail is the inspector body for an owned recipe-item "book"
  (`isRecipeItem`). It shows the book's access badge, its learning requirements,
  its flavour text, and the recipes it can teach — a single recipe inline, or
  several in a searchable, paginated accordion — each with a Learn button
  (knowledge mode) or a Craft button (item mode).

  Extracted verbatim from the former double-duty `InventoryDetail.svelte`
  (issue 675). `InventoryDetail` remains the entry point that routes here, which
  is what keeps the GM "How players see it" preview in `RecipeItemEditor.svelte`
  rendering the REAL player component rather than a re-implementation — a
  no-drift guarantee that is canonical spec text. A book is never salvageable, so
  this branch never reaches the salvage tree.

  Prop-driven; learning routes back through the store seams.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { recipeItemAccessBadge } from '../../../util/recipeItemAccessBadge.js';
  import CraftingThumb from '../../crafting/CraftingThumb.svelte';

  let {
    item = null,
    onOpenRecipe = null,
    onLearn = null,
    onLearnAll = null,
    learningRecipeId = null
  } = $props();

  // Exclusive affordances: a knowledge book is LEARNABLE (per-recipe Learn), an item
  // book is CRAFTABLE by being held (per-recipe Craft → navigate to the recipe).
  const learnable = $derived(item?.learnable === true);
  const craftable = $derived(item?.craftable === true);
  const bookMode = $derived(craftable ? 'item' : 'knowledge');
  const bookDescription = $derived(String(item?.description ?? '').trim());
  const bookRecipes = $derived(Array.isArray(item?.recipes) ? item.recipes : []);
  const recipeTotal = $derived(bookRecipes.length);
  // Per-book learning requirements (issue 544): read-only "Needs: <name>" chips
  // (Required Knowledge + Learning prerequisites) with per-requirement met/unmet.
  // Empty unless the book is learnable with Limited learning on (builder-decided).
  const requirements = $derived(Array.isArray(item?.requirements) ? item.requirements : []);
  const learningLimit = $derived(item?.limits?.learning ?? null);
  // The learn budget is spent when a finite learning cap has no remaining slots.
  const budgetSpent = $derived(Boolean(learningLimit) && Number(learningLimit.remaining ?? 0) <= 0);

  // The access badge mirrors the GM "How players see it" preview EXACTLY (shared helper):
  // "Learn freely" / "Learn up to N …" for knowledge books; "Reread anytime" / "N uses"
  // for item books.
  const badgeText = (key, fallback, data) => {
    const translated = localize(key, data);
    return translated && translated !== key
      ? translated
      : fallback.replace('{n}', String(data?.n ?? ''));
  };
  const accessBadge = $derived(
    recipeItemAccessBadge(
      { mode: bookMode, item: item?.caps?.item, learn: item?.caps?.learn },
      badgeText
    )
  );

  // Knowledge-mode "Read & learn all N recipes" convenience: shown ONLY when the reader
  // can actually learn everything — no learn limit, or a limit that meets/exceeds the
  // book size — and there is at least one unlearned recipe.
  const learnLimited = $derived(item?.caps?.learn?.limitLearning === true);
  const learnCap = $derived(
    Number.isFinite(item?.caps?.learn?.learnsAllowed) && item.caps.learn.learnsAllowed > 0
      ? item.caps.learn.learnsAllowed
      : null
  );
  // Exclude gate-blocked recipes (issue 544) so "Learn all" never sends a recipe
  // the runtime will refuse (which would halt the batch mid-way).
  const unlearnedRecipeIds = $derived(
    bookRecipes
      .filter((recipe) => !recipe?.learned && !recipe?.learnBlocked)
      .map((recipe) => recipe.id)
  );
  const canLearnAll = $derived(
    learnable &&
      !budgetSpent &&
      unlearnedRecipeIds.length > 0 &&
      (!learnLimited || (learnCap != null && learnCap >= recipeTotal))
  );
  function learnAll() {
    if (learningRecipeId == null && unlearnedRecipeIds.length > 0) onLearnAll?.(unlearnedRecipeIds);
  }
  function craftRecipe(recipeId) {
    if (recipeId) onOpenRecipe?.(recipeId);
  }

  // Search appears only once a book teaches more than a page's worth of recipes.
  const RECIPE_PAGE_SIZES = [6, 9, 12];
  let recipeSearch = $state('');
  let recipePageSize = $state(6);
  let recipePage = $state(0);
  let expandedRecipeId = $state(null);
  // Reset the accordion + recipe browse state whenever the selected book changes.
  $effect(() => {
    void item?.key;
    recipeSearch = '';
    recipePage = 0;
    expandedRecipeId = null;
  });

  const searchableRecipes = $derived(bookRecipes.length > RECIPE_PAGE_SIZES[0]);
  const filteredRecipes = $derived.by(() => {
    const query = recipeSearch.trim().toLowerCase();
    if (query.length === 0) return bookRecipes;
    return bookRecipes.filter(
      (recipe) =>
        String(recipe?.name ?? '').toLowerCase().includes(query) ||
        String(recipe?.description ?? '').toLowerCase().includes(query)
    );
  });
  const recipePageCount = $derived(
    Math.max(1, Math.ceil(filteredRecipes.length / (recipePageSize > 0 ? recipePageSize : 1)))
  );
  const pagedRecipes = $derived.by(() => {
    const size = recipePageSize > 0 ? recipePageSize : filteredRecipes.length || 1;
    const clamped = Math.min(Math.max(0, recipePage), recipePageCount - 1);
    return filteredRecipes.slice(clamped * size, clamped * size + size);
  });

  function canLearn(recipe) {
    return !recipe?.learned && !recipe?.learnBlocked && !budgetSpent;
  }
  function toggleRecipe(recipeId) {
    expandedRecipeId = expandedRecipeId === recipeId ? null : recipeId;
  }
  function learnRecipe(recipeId) {
    if (recipeId && learningRecipeId == null) onLearn?.(recipeId);
  }
  function onRecipeSearch(event) {
    recipeSearch = event.currentTarget.value;
    recipePage = 0;
  }
  function onRecipePageSize(event) {
    const value = Number(event.currentTarget.value);
    recipePageSize = RECIPE_PAGE_SIZES.includes(value) ? value : RECIPE_PAGE_SIZES[0];
    recipePage = 0;
  }
</script>

{#snippet learnControl(recipe)}
  {#if recipe.learned}
    <span class="inventory-chip inventory-detail-learned" data-inventory-learned={recipe.id}>
      <i class="fas fa-check" aria-hidden="true"></i>
      {localize('FABRICATE.App.Inventory.Detail.Learned')}
    </span>
  {:else}
    <!-- A blocked recipe renders a DISABLED Learn button (canLearn is false when
         learnBlocked). The blocking requirements are enumerated once, book-level, in
         the "Needs:" chips above — not repeated per recipe row. -->
    <button
      type="button"
      class="inventory-detail-learn-btn"
      data-inventory-learn={recipe.id}
      disabled={!canLearn(recipe) || learningRecipeId != null}
      aria-busy={learningRecipeId === recipe.id}
      title={recipe.learnBlocked
        ? localize('FABRICATE.App.Inventory.Detail.LearnBlockedShort')
        : undefined}
      aria-label={recipe.learnBlocked
        ? localize('FABRICATE.App.Inventory.Detail.LearnBlockedShort')
        : undefined}
      onclick={() => learnRecipe(recipe.id)}
    >
      <i
        class="fas"
        class:fa-book-sparkles={learningRecipeId !== recipe.id}
        class:fa-spinner={learningRecipeId === recipe.id}
        class:fa-spin={learningRecipeId === recipe.id}
        aria-hidden="true"
      ></i>
      <span>{localize('FABRICATE.App.Inventory.Detail.LearnAction')}</span>
    </button>
  {/if}
{/snippet}

{#snippet craftControl(recipe)}
  <button
    type="button"
    class="inventory-detail-craft-btn"
    data-inventory-craft={recipe.id}
    onclick={() => craftRecipe(recipe.id)}
  >
    <i class="fas fa-hammer" aria-hidden="true"></i>
    <span>{localize('FABRICATE.App.Inventory.Detail.CraftAction')}</span>
  </button>
{/snippet}

<div class="inventory-detail" data-inventory-detail={item.key} data-inventory-recipe-item>
  <header class="inventory-detail-header">
    <CraftingThumb src={item.img ?? ''} alt="" size={72} />
    <div class="inventory-detail-heading">
      <p class="inventory-detail-name">{item.name}</p>
      <p class="inventory-detail-total">
        {localize('FABRICATE.App.Inventory.Detail.Total', { count: Number(item.totalQuantity ?? 0) })}
      </p>
      <div class="inventory-detail-chips">
        <span
          class="inventory-chip inventory-detail-access-badge is-{accessBadge.tone}"
          data-inventory-access-badge
          data-badge-tone={accessBadge.tone}
        >
          <i class={accessBadge.icon} aria-hidden="true"></i>
          <span>{accessBadge.label}</span>
        </span>
      </div>
    </div>
  </header>

  <!-- Requirements + description span the FULL detail width below the header (not
       squeezed into the narrow heading column beside the thumbnail). -->
  {#if requirements.length > 0}
    <div
      class="inventory-detail-requirements"
      data-inventory-requirements
      role="list"
      aria-label={localize('FABRICATE.App.Inventory.Detail.RequirementsLabel')}
    >
      {#each requirements as req (req.id)}
        <span
          class="inventory-chip inventory-detail-requirement is-{req.met ? 'met' : 'unmet'}"
          role="listitem"
          data-inventory-requirement={req.id}
          data-requirement-met={req.met}
          aria-label={localize(
            req.met
              ? 'FABRICATE.App.Inventory.Detail.RequirementMet'
              : 'FABRICATE.App.Inventory.Detail.RequirementUnmet',
            { name: req.name }
          )}
        >
          <i class={req.icon} aria-hidden="true"></i>
          <span class="inventory-detail-requirement-name">{localize('FABRICATE.App.Inventory.Detail.Needs', { name: req.name })}</span>
          <i
            class={req.met ? 'fas fa-circle-check' : 'fas fa-lock'}
            data-requirement-status={req.met ? 'met' : 'unmet'}
            aria-hidden="true"
          ></i>
        </span>
      {/each}
    </div>
  {/if}
  {#if bookDescription}
    <p class="inventory-detail-book-desc">{bookDescription}</p>
  {/if}

  {#if canLearnAll}
    <button
      type="button"
      class="inventory-detail-read-learn"
      data-inventory-learn-all
      disabled={learningRecipeId != null}
      onclick={learnAll}
    >
      <i class="fas fa-graduation-cap" aria-hidden="true"></i>
      <span>{recipeTotal === 1
        ? localize('FABRICATE.App.Inventory.Detail.ReadLearnAllRecipeSingular')
        : localize('FABRICATE.App.Inventory.Detail.ReadLearnAllRecipes', { total: recipeTotal })}</span>
    </button>
  {/if}

  <section class="inventory-detail-section" data-inventory-section="learn">
    <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.RecipesTitle')}</p>
    {#if bookRecipes.length === 0}
      <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.NoRecipes')}</p>
    {:else if bookRecipes.length === 1}
      {@const recipe = bookRecipes[0]}
      <div class="inventory-detail-accordion-item" data-inventory-learn-recipe={recipe.id}>
        <div class="inventory-detail-accordion-header">
          <span class="inventory-detail-book-recipe-static">
            <CraftingThumb src={recipe.img ?? ''} alt="" size={40} />
            <span class="inventory-detail-row-name">{recipe.name}</span>
          </span>
          {#if learnable}{@render learnControl(recipe)}{:else if craftable}{@render craftControl(recipe)}{/if}
        </div>
        {#if recipe.description}
          <div class="inventory-detail-accordion-body" data-inventory-recipe-body={recipe.id}>
            <p class="inventory-detail-recipe-desc">{recipe.description}</p>
          </div>
        {/if}
      </div>
    {:else}
      {#if searchableRecipes}
        <div class="inventory-detail-recipe-search">
          <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input
            type="text"
            value={recipeSearch}
            placeholder={localize('FABRICATE.App.Inventory.Detail.RecipeSearchPlaceholder')}
            aria-label={localize('FABRICATE.App.Inventory.Detail.RecipeSearchLabel')}
            oninput={onRecipeSearch}
            data-inventory-recipe-search
          />
        </div>
      {/if}
      {#if filteredRecipes.length === 0}
        <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.NoRecipeMatches')}</p>
      {:else}
        <ul class="inventory-detail-accordion" data-inventory-recipe-accordion>
          {#each pagedRecipes as recipe (recipe.id)}
            {@const expanded = expandedRecipeId === recipe.id}
            <li class="inventory-detail-accordion-item" data-inventory-learn-recipe={recipe.id}>
              <div class="inventory-detail-accordion-header">
                <button
                  type="button"
                  class="inventory-detail-accordion-toggle"
                  aria-expanded={expanded}
                  onclick={() => toggleRecipe(recipe.id)}
                >
                  <CraftingThumb src={recipe.img ?? ''} alt="" size={40} />
                  <span class="inventory-detail-row-name">{recipe.name}</span>
                  <i
                    class="fas inventory-detail-accordion-caret"
                    class:fa-chevron-down={expanded}
                    class:fa-chevron-right={!expanded}
                    aria-hidden="true"
                  ></i>
                </button>
                {#if learnable}{@render learnControl(recipe)}{:else if craftable}{@render craftControl(recipe)}{/if}
              </div>
              {#if expanded}
                <div class="inventory-detail-accordion-body" data-inventory-recipe-body={recipe.id}>
                  {#if recipe.description}
                    <p class="inventory-detail-recipe-desc">{recipe.description}</p>
                  {:else}
                    <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.NoRecipeDescription')}</p>
                  {/if}
                </div>
              {/if}
            </li>
          {/each}
        </ul>
        {#if filteredRecipes.length > RECIPE_PAGE_SIZES[0]}
          <div class="inventory-detail-recipe-pager" data-inventory-recipe-pager>
            <label class="inventory-detail-recipe-pagesize">
              <span>{localize('FABRICATE.App.Inventory.Detail.RecipesPerPage')}</span>
              <select value={recipePageSize} onchange={onRecipePageSize} aria-label={localize('FABRICATE.App.Inventory.Detail.RecipesPerPage')}>
                {#each RECIPE_PAGE_SIZES as size (size)}
                  <option value={size}>{size}</option>
                {/each}
              </select>
            </label>
            <div class="inventory-detail-pager">
              <button
                type="button"
                class="inventory-detail-pager-btn"
                disabled={recipePage === 0}
                aria-label={localize('FABRICATE.App.Inventory.Detail.PagePrevious')}
                onclick={() => (recipePage = Math.max(0, recipePage - 1))}
              >
                <i class="fas fa-chevron-left" aria-hidden="true"></i>
              </button>
              <span class="inventory-detail-pager-range">
                {Math.min(recipePage, recipePageCount - 1) + 1} / {recipePageCount}
              </span>
              <button
                type="button"
                class="inventory-detail-pager-btn"
                disabled={recipePage >= recipePageCount - 1}
                aria-label={localize('FABRICATE.App.Inventory.Detail.PageNext')}
                onclick={() => (recipePage = Math.min(recipePageCount - 1, recipePage + 1))}
              >
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        {/if}
      {/if}
    {/if}
  </section>
</div>

<style>
  .inventory-detail {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-4);
    height: 100%;
    min-height: 0;
    padding: var(--fab-space-4);
    overflow-y: auto;
  }

  .inventory-detail-header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .inventory-detail-heading {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .inventory-detail-name {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .inventory-detail-total {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .inventory-detail-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
  }

  .inventory-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 8px;
    border-radius: 999px;
    border: 1px solid var(--fab-border);
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
  }

  .inventory-detail-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .inventory-detail-section-title {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fab-text-muted);
  }

  .inventory-detail-row-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .inventory-detail-empty-note {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  .inventory-detail-pager {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 2px;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .inventory-detail-pager-range {
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .inventory-detail-pager-btn {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    cursor: pointer;
  }

  .inventory-detail-pager-btn:hover:not(:disabled) {
    background: var(--fab-surface-raised);
  }

  .inventory-detail-pager-btn:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-pager-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  /* --- Recipe-item "book" learning ------------------------------------------ */
  .inventory-detail-book-desc {
    margin: 0;
    /* Full-width block child of the scrolling flex column: don't let the column
       compress it below its clamped height (that clipped the text before the
       4-line ellipsis). The column's own overflow-y handles any excess. */
    flex-shrink: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    overflow: hidden;
  }

  /* The "Read & learn" (knowledge) / "Use" (item) call-to-action that expands the
     recipe list — mirrors the GM "How players see it" preview CTA: a large, centered,
     solid-accent button. */
  .inventory-detail-read-learn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--fab-space-2);
    width: 100%;
    box-sizing: border-box;
    padding: 13px 16px;
    min-height: 48px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 8px;
    background: var(--fab-accent);
    color: var(--fab-on-accent);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    text-align: center;
  }

  .inventory-detail-read-learn:hover {
    filter: brightness(1.08);
  }

  .inventory-detail-read-learn:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-read-learn:disabled {
    opacity: 0.5;
    cursor: default;
    filter: none;
  }

  /* Access badge under the book name — the SAME learn/use badge as the GM preview. */
  .inventory-detail-access-badge {
    gap: 5px;
  }

  .inventory-detail-access-badge.is-warning {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
    color: var(--fab-warning-text);
  }

  .inventory-detail-access-badge.is-info {
    border-color: var(--fab-info-border);
    background: var(--fab-info-soft);
    color: var(--fab-info-text);
  }

  .inventory-detail-access-badge.is-success {
    border-color: var(--fab-success-border);
    background: var(--fab-success-soft);
    color: var(--fab-success-text);
  }

  /* The static (non-toggle) headline for a single-recipe book, mirroring the
     accordion toggle's layout so both row types are identical. */
  .inventory-detail-book-recipe-static {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
  }

  .inventory-detail-recipe-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.4;
    color: var(--fab-text-muted);
  }

  /* The Learn button + the Learned chip share the trailing slot in a recipe row. */
  .inventory-detail-learn-btn,
  .inventory-detail-craft-btn {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border: 1px solid var(--fab-accent);
    border-radius: 8px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
  }

  .inventory-detail-learn-btn:hover:not(:disabled),
  .inventory-detail-craft-btn:hover:not(:disabled) {
    background: var(--fab-accent);
    color: var(--fab-on-accent);
  }

  .inventory-detail-learn-btn:focus-visible,
  .inventory-detail-craft-btn:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-learn-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .inventory-detail-learned {
    flex: 0 0 auto;
    border-color: var(--fab-success-border, var(--fab-border));
    background: var(--fab-success-soft, var(--fab-surface-raised));
    color: var(--fab-success-text, var(--fab-text-muted));
  }

  /* Book-level "Needs: <name>" requirement chips (issue 544): a full-width wrapping
     row below the header. Met vs unmet is a two-signal state — a success/danger ramp
     AND a trailing status glyph (check / lock) plus a stateful aria-label — never
     colour alone. */
  .inventory-detail-requirements {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    /* Full-width child of the scrolling flex column — keep its natural height
       (don't let the column squeeze the chip rows). */
    flex-shrink: 0;
  }

  /* A long recipe/prereq name truncates instead of overflowing the narrow player
     column; the "Needs:" text + both icons stay visible. */
  .inventory-detail-requirement {
    max-width: 100%;
    min-width: 0;
  }

  .inventory-detail-requirement-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .inventory-detail-requirement.is-met {
    border-color: var(--fab-success-border, var(--fab-border));
    background: var(--fab-success-soft, var(--fab-surface-raised));
    color: var(--fab-success-text, var(--fab-text-muted));
  }

  .inventory-detail-requirement.is-unmet {
    border-color: var(--fab-danger-border, var(--fab-border));
    background: var(--fab-danger-soft, var(--fab-surface-raised));
    color: var(--fab-danger-text, var(--fab-text-muted));
  }

  .inventory-detail-recipe-search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .inventory-detail-recipe-search i {
    position: absolute;
    left: 10px;
    font-size: 12px;
    color: var(--fab-text-muted);
    pointer-events: none;
  }

  .inventory-detail-recipe-search input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 10px 6px 28px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface);
    color: var(--fab-text);
    font-size: 13px;
  }

  .inventory-detail-accordion {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .inventory-detail-accordion-item {
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    overflow: hidden;
  }

  /* The header carries the row height itself (54px + the item's 1px borders = the
     56px of a standalone `.inventory-detail-row`), rather than stretching to fill
     the item. That keeps the thumbnail + name fixed: expanding a row appends the
     body BELOW the header instead of shrinking it, so nothing shifts up. */
  .inventory-detail-accordion-header {
    box-sizing: border-box;
    min-height: 54px;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2);
  }

  .inventory-detail-accordion-toggle {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: 0;
    /* Defuse Foundry's fixed global button height so the 40px thumb isn't clamped/misaligned
       (matches the min-height the sibling recipe/read-learn buttons pin). */
    height: auto;
    min-height: 40px;
    border: none;
    background: none;
    color: var(--fab-text);
    text-align: left;
    cursor: pointer;
  }

  .inventory-detail-accordion-caret {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .inventory-detail-accordion-toggle:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .inventory-detail-accordion-body {
    padding: 0 var(--fab-space-2) var(--fab-space-2) calc(40px + var(--fab-space-2) + var(--fab-space-3));
  }

  .inventory-detail-recipe-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 4px;
  }

  .inventory-detail-recipe-pagesize {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--fab-text-muted);
  }

  .inventory-detail-recipe-pagesize select {
    padding: 2px 6px;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    background: var(--fab-surface);
    color: var(--fab-text);
    font-size: 11px;
  }
</style>
