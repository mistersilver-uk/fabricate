<!-- Svelte 5 runes mode -->
<!--
  InventoryDetail is the right-hand panel for the selected owned item. For a
  component/essence it shows the image + name + type/tag/tier chips, a per-source
  quantity breakdown, essence content, and the recipes that use it ("Used By").
  For a recipe-item "book" (isRecipeItem) it instead shows the book's use/learn
  limits and the recipes it can teach — a single recipe inline, or several in a
  searchable, paginated accordion — each with a Learn button. Prop-driven;
  navigation + learning route back through the store seams.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { recipeItemAccessBadge } from '../../util/recipeItemAccessBadge.js';
  import CraftingThumb from '../crafting/CraftingThumb.svelte';

  let {
    item = null,
    onOpenRecipe = null,
    onLearn = null,
    onLearnAll = null,
    learningRecipeId = null
  } = $props();

  // Each detail list (sources, used-by, required-for, produced-by, contributors)
  // paginates independently at this many rows.
  const PAGE_SIZE = 6;

  const isEssence = $derived(item?.isEssenceSource === true);
  const isTool = $derived(item?.isTool === true);
  const icon = $derived(
    typeof item?.icon === 'string' && item.icon.trim() !== '' ? item.icon : 'fas fa-mortar-pestle'
  );
  const tags = $derived(Array.isArray(item?.tags) ? item.tags.filter((tag) => String(tag ?? '').trim() !== '') : []);
  const essences = $derived(Array.isArray(item?.essences) ? item.essences : []);
  const sources = $derived(Array.isArray(item?.sources) ? item.sources : []);
  const usedBy = $derived(Array.isArray(item?.usedBy) ? item.usedBy : []);
  const requiredFor = $derived(Array.isArray(item?.requiredFor) ? item.requiredFor : []);
  const producedBy = $derived(Array.isArray(item?.producedBy) ? item.producedBy : []);
  const contributors = $derived(Array.isArray(item?.contributors) ? item.contributors : []);
  const tierLabel = $derived(
    item?.tier != null && item.tier !== '' ? localize('FABRICATE.App.Inventory.Detail.Tier', { tier: item.tier }) : null
  );
  const typeLabel = $derived(
    localize(
      isEssence
        ? 'FABRICATE.App.Inventory.Detail.TypeEssence'
        : 'FABRICATE.App.Inventory.Detail.TypeComponent'
    )
  );

  // Per-section current page, keyed by section id, reset when the item changes.
  let pages = $state({});
  $effect(() => {
    void item?.key;
    pages = {};
  });
  function pageOf(list, key) {
    const count = Math.max(1, Math.ceil((list?.length ?? 0) / PAGE_SIZE));
    return Math.min(Math.max(0, pages[key] ?? 0), count - 1);
  }
  function sliceOf(list, key) {
    const start = pageOf(list, key) * PAGE_SIZE;
    return (Array.isArray(list) ? list : []).slice(start, start + PAGE_SIZE);
  }
  function setPage(key, value) {
    pages = { ...pages, [key]: Math.max(0, value) };
  }

  function hasImg(value) {
    return typeof value === 'string' && value.trim() !== '';
  }
  function roleLabel(role) {
    const key =
      role === 'tool' ? 'RoleTool' : role === 'essence' ? 'RoleEssence' : 'RoleIngredient';
    return localize(`FABRICATE.App.Inventory.Detail.${key}`);
  }
  function kindLabel(kind) {
    const key =
      kind === 'salvage' ? 'KindSalvage' : kind === 'gathering' ? 'KindGathering' : 'KindRecipe';
    return localize(`FABRICATE.App.Inventory.Detail.${key}`);
  }
  function openRecipe(recipeId) {
    if (recipeId) onOpenRecipe?.(recipeId);
  }

  // --- Recipe-item "book" learning / crafting state --------------------------
  const isRecipeItem = $derived(item?.isRecipeItem === true);
  // Exclusive affordances: a knowledge book is LEARNABLE (per-recipe Learn), an item
  // book is CRAFTABLE by being held (per-recipe Craft → navigate to the recipe).
  const learnable = $derived(item?.learnable === true);
  const craftable = $derived(item?.craftable === true);
  const bookMode = $derived(craftable ? 'item' : 'knowledge');
  const bookDescription = $derived(String(item?.description ?? '').trim());
  const bookRecipes = $derived(Array.isArray(item?.recipes) ? item.recipes : []);
  const recipeTotal = $derived(bookRecipes.length);
  const usesLimit = $derived(item?.limits?.uses ?? null);
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
  const unlearnedRecipeIds = $derived(
    bookRecipes.filter((recipe) => !recipe?.learned).map((recipe) => recipe.id)
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

{#snippet pager(list, key)}
  {#if (list?.length ?? 0) > PAGE_SIZE}
    {@const total = list.length}
    {@const page = pageOf(list, key)}
    {@const count = Math.ceil(total / PAGE_SIZE)}
    <div class="inventory-detail-pager" data-inventory-pager={key}>
      <button
        type="button"
        class="inventory-detail-pager-btn"
        disabled={page === 0}
        aria-label={localize('FABRICATE.App.Inventory.Detail.PagePrevious')}
        onclick={() => setPage(key, page - 1)}
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="inventory-detail-pager-range" data-inventory-pager-range>
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} / {total}
      </span>
      <button
        type="button"
        class="inventory-detail-pager-btn"
        disabled={page >= count - 1}
        aria-label={localize('FABRICATE.App.Inventory.Detail.PageNext')}
        onclick={() => setPage(key, page + 1)}
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  {/if}
{/snippet}

{#snippet learnControl(recipe)}
  {#if recipe.learned}
    <span class="inventory-chip inventory-detail-learned" data-inventory-learned={recipe.id}>
      <i class="fas fa-check" aria-hidden="true"></i>
      {localize('FABRICATE.App.Inventory.Detail.Learned')}
    </span>
  {:else if recipe.learnBlocked}
    <span
      class="inventory-chip inventory-detail-blocked"
      data-inventory-learn-blocked={recipe.id}
      title={recipe.learnBlockedReason}
    >
      <i class="fas fa-lock" aria-hidden="true"></i>
      {localize('FABRICATE.App.Inventory.Detail.LearnBlocked', { reason: recipe.learnBlockedReason })}
    </span>
  {:else}
    <button
      type="button"
      class="inventory-detail-learn-btn"
      data-inventory-learn={recipe.id}
      disabled={!canLearn(recipe) || learningRecipeId != null}
      aria-busy={learningRecipeId === recipe.id}
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

{#if !item}
  <div class="inventory-detail-empty" data-inventory-detail-empty>
    <i class="fas fa-boxes-stacked" aria-hidden="true"></i>
    <p>{localize('FABRICATE.App.Inventory.Detail.SelectHint')}</p>
  </div>
{:else if isRecipeItem}
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
        {#if bookDescription}
          <p class="inventory-detail-book-desc">{bookDescription}</p>
        {/if}
      </div>
    </header>

    {#if canLearnAll}
      <button
        type="button"
        class="inventory-detail-read-learn"
        data-inventory-learn-all
        disabled={learningRecipeId != null}
        onclick={learnAll}
      >
        <i class="fas fa-graduation-cap" aria-hidden="true"></i>
        <span>{localize('FABRICATE.App.Inventory.Detail.ReadLearnAllRecipes', { total: recipeTotal })}</span>
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
{:else}
  <div class="inventory-detail" data-inventory-detail={item.key}>
    <header class="inventory-detail-header">
      {#if isEssence}
        <span class="inventory-detail-essence" aria-hidden="true"><i class={icon}></i></span>
      {:else}
        <CraftingThumb src={item.img ?? ''} alt="" size={72} />
      {/if}
      <div class="inventory-detail-heading">
        <p class="inventory-detail-name">{item.name}</p>
        <p class="inventory-detail-total">
          {localize('FABRICATE.App.Inventory.Detail.Total', { count: Number(item.totalQuantity ?? 0) })}
        </p>
        <div class="inventory-detail-chips">
          <span class="inventory-chip inventory-chip-type">{typeLabel}</span>
          {#if tierLabel}
            <span class="inventory-chip">{tierLabel}</span>
          {/if}
          {#each tags as tag (tag)}
            <span class="inventory-chip inventory-chip-tag">{tag}</span>
          {/each}
        </div>
      </div>
    </header>

    <section class="inventory-detail-section">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.SourcesTitle')}</p>
      <ul class="inventory-detail-list">
        {#each sliceOf(sources, 'sources') as source (source.actorId)}
          <li class="inventory-detail-row">
            <span class="inventory-detail-portrait" aria-hidden="true">
              {#if hasImg(source.actorImg)}
                <img src={source.actorImg} alt="" />
              {:else}
                <i class="fas fa-user"></i>
              {/if}
            </span>
            <span class="inventory-detail-row-name">{source.actorName}</span>
            <span class="inventory-detail-row-qty" data-inventory-source-qty>×{source.quantity}</span>
          </li>
        {/each}
      </ul>
      {@render pager(sources, 'sources')}
    </section>

    {#if isEssence}
      <section class="inventory-detail-section">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.ContributingTitle')}</p>
        {#if contributors.length > 0}
          <ul class="inventory-detail-list">
            {#each sliceOf(contributors, 'contributors') as contributor (contributor.componentId)}
              <li class="inventory-detail-row" data-inventory-contributor={contributor.componentId}>
                <CraftingThumb src={contributor.img ?? ''} alt="" size={40} />
                <span class="inventory-detail-row-name">{contributor.name}</span>
                <span class="inventory-detail-row-qty">×{contributor.quantity}</span>
              </li>
            {/each}
          </ul>
          {@render pager(contributors, 'contributors')}
        {:else}
          <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.ContributingEmpty')}</p>
        {/if}
      </section>
    {/if}

    {#if essences.length > 0}
      <section class="inventory-detail-section">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.EssenceContentTitle')}</p>
        <div class="inventory-detail-essences">
          {#each essences as essence (essence.id)}
            <span class="inventory-chip inventory-chip-essence">
              {#if essence.icon}<i class={essence.icon} aria-hidden="true"></i>{/if}
              <span>{essence.name}</span>
              <span class="inventory-chip-qty">×{essence.quantity}</span>
            </span>
          {/each}
        </div>
      </section>
    {/if}

    <section class="inventory-detail-section">
      <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.UsedByTitle')}</p>
      {#if usedBy.length > 0}
        <ul class="inventory-detail-list">
          {#each sliceOf(usedBy, 'used') as use (use.recipeId + ':' + use.role)}
            <li>
              <button
                type="button"
                class="inventory-detail-recipe"
                data-inventory-used-by={use.recipeId}
                onclick={() => openRecipe(use.recipeId)}
              >
                <CraftingThumb src={use.recipeImg ?? ''} alt="" size={40} />
                <span class="inventory-detail-row-name">{use.recipeName}</span>
                <span class="inventory-chip inventory-chip-role">{roleLabel(use.role)}</span>
              </button>
            </li>
          {/each}
        </ul>
        {@render pager(usedBy, 'used')}
      {:else}
        <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.UsedByEmpty')}</p>
      {/if}
    </section>

    {#if isTool}
      <section class="inventory-detail-section" data-inventory-section="required">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.RequiredForTitle')}</p>
        {#if requiredFor.length > 0}
          <ul class="inventory-detail-list">
            {#each sliceOf(requiredFor, 'required') as req, index (req.kind + ':' + (req.recipeId ?? req.name) + ':' + index)}
              <li>
                {#if req.kind === 'recipe' && req.recipeId}
                  <button
                    type="button"
                    class="inventory-detail-recipe"
                    data-inventory-required-for={req.recipeId}
                    onclick={() => openRecipe(req.recipeId)}
                  >
                    <CraftingThumb src={req.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{req.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(req.kind)}</span>
                  </button>
                {:else}
                  <div class="inventory-detail-row" data-inventory-required-for-kind={req.kind}>
                    <CraftingThumb src={req.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{req.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(req.kind)}</span>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          {@render pager(requiredFor, 'required')}
        {:else}
          <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.RequiredForEmpty')}</p>
        {/if}
      </section>
    {/if}

    {#if !isEssence}
      <section class="inventory-detail-section">
        <p class="inventory-detail-section-title">{localize('FABRICATE.App.Inventory.Detail.ProducedByTitle')}</p>
        {#if producedBy.length > 0}
          <ul class="inventory-detail-list">
            {#each sliceOf(producedBy, 'produced') as producer, index (producer.kind + ':' + (producer.recipeId ?? producer.name) + ':' + index)}
              <li>
                {#if producer.kind === 'recipe' && producer.recipeId}
                  <button
                    type="button"
                    class="inventory-detail-recipe"
                    data-inventory-produced-by={producer.recipeId}
                    onclick={() => openRecipe(producer.recipeId)}
                  >
                    <CraftingThumb src={producer.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{producer.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(producer.kind)}</span>
                  </button>
                {:else}
                  <div class="inventory-detail-row" data-inventory-produced-by-kind={producer.kind}>
                    <CraftingThumb src={producer.img ?? ''} alt="" size={40} />
                    <span class="inventory-detail-row-name">{producer.name}</span>
                    <span class="inventory-chip inventory-chip-role">{kindLabel(producer.kind)}</span>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
          {@render pager(producedBy, 'produced')}
        {:else}
          <p class="inventory-detail-empty-note">{localize('FABRICATE.App.Inventory.Detail.ProducedByEmpty')}</p>
        {/if}
      </section>
    {/if}
  </div>
{/if}

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

  .inventory-detail-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    padding: var(--fab-space-4);
    text-align: center;
    color: var(--fab-text-muted);
  }

  .inventory-detail-empty i {
    font-size: 28px;
    opacity: 0.7;
  }

  .inventory-detail-empty p {
    margin: 0;
    font-size: 13px;
  }

  .inventory-detail-header {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }

  .inventory-detail-essence {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    border-radius: 6px;
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
    font-size: 28px;
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

  .inventory-chip-type {
    border-color: var(--fab-accent-border);
    background: var(--fab-accent-soft);
    color: var(--fab-accent);
  }

  .inventory-chip-qty {
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
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

  .inventory-detail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* Row height + padding mirror the Crafting browser's RecipeListRow so the
     thumbnail sits framed with vertical breathing room rather than edge-to-edge. */
  .inventory-detail-row,
  .inventory-detail-recipe {
    box-sizing: border-box;
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--fab-space-3);
    padding: var(--fab-space-2);
    min-height: 56px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-surface-soft);
    color: var(--fab-text);
    text-align: left;
  }

  .inventory-detail-recipe {
    cursor: pointer;
  }

  .inventory-detail-recipe:hover {
    background: var(--fab-surface-raised);
    border-color: var(--fab-accent-border);
  }

  .inventory-detail-recipe:focus-visible {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }

  .inventory-detail-portrait {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--fab-surface-raised);
    color: var(--fab-text-muted);
    font-size: 15px;
  }

  .inventory-detail-portrait img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .inventory-detail-row-name {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .inventory-detail-row-qty {
    flex: 0 0 auto;
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--fab-text);
  }

  .inventory-chip-role {
    flex: 0 0 auto;
  }

  .inventory-detail-essences {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .inventory-chip-essence i {
    font-size: 10px;
  }

  .inventory-detail-empty-note {
    margin: 0;
    font-size: 12px;
    color: var(--fab-text-muted);
  }

  /* Compact per-section pager: prev/next + an "x–y / total" range readout. */
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
    margin: 4px 0 0;
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

  .inventory-chip-uses i {
    font-size: 10px;
  }

  .inventory-detail-learned {
    flex: 0 0 auto;
    border-color: var(--fab-success-border, var(--fab-border));
    background: var(--fab-success-soft, var(--fab-surface-raised));
    color: var(--fab-success-text, var(--fab-text-muted));
  }

  .inventory-detail-blocked {
    flex: 0 0 auto;
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
