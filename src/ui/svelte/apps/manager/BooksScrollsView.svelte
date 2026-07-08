<!-- Svelte 5 runes mode -->
<!--
  Books & Scrolls library (issue 511).

  "Books & Scrolls" is only the DISPLAY name of the surface; it manages EVERY
  recipe item in the system regardless of its Foundry item type (book, scroll,
  ring, wand, gem, note). "Recipe item" is the canonical noun.

  This is the browse column: a header with a "Create recipe item" primary action,
  a filter bar (search · type · uses/learning), and a library list of recipe-item
  rows. Each row shows the linked game-world item icon + name, a type pill, a
  recipe-count chip (danger when empty), and a mode-dependent chip — a USE chip in
  `visibilityMode==='item'`, a LEARNING chip in `'knowledge'`. Each row carries an
  enable/disable toggle and an Edit pencil. The right-hand "Item page" inspector is
  a separate component (ItemPageInspector).

  All display data (resolvedName/resolvedImg/derivedType, recipes[], learnedByCount)
  is projected upstream by adminStore — this component never resolves `fromUuid`.

  Props:
   - recipeItems: projected recipe items ({ id, resolvedName, resolvedImg,
     derivedType, enabled, caps, recipes, learnedByCount, linkMissing }).
   - selectedSystemName: the system's display name (kicker).
   - visibilityMode: 'item' | 'knowledge' — chooses the use vs learning chip.
   - selectedRecipeItemId: the row currently open in the inspector.
   - onSelectRecipeItem(id): select a row (opens the inspector).
   - onOpenRecipeItem(id): open the per-item editor (Edit pencil).
   - onCreateRecipeItem(): create a new recipe item.
   - onToggleEnabled(id, enabled): flip a recipe item's enabled flag.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    recipeItems = [],
    selectedSystemName = '',
    visibilityMode = 'knowledge',
    selectedRecipeItemId = '',
    onSelectRecipeItem = () => {},
    onOpenRecipeItem = () => {},
    onCreateRecipeItem = () => {},
    onToggleEnabled = () => {}
  } = $props();

  let statusFilter = $state('all');
  let typeFilter = $state('all');
  let capFilter = $state('all');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const isItemMode = $derived(visibilityMode === 'item');

  function recipeItemImage(item) {
    return item?.resolvedImg || item?.img || 'icons/svg/item-bag.svg';
  }

  function typeIcon(item) {
    const type = String(item?.derivedType || '').toLowerCase();
    if (type.includes('scroll')) return 'fas fa-scroll';
    if (type.includes('tome')) return 'fas fa-book-atlas';
    return 'fas fa-book';
  }

  function recipeCount(item) {
    return Array.isArray(item?.recipes) ? item.recipes.length : 0;
  }

  function recipeCountLabel(item) {
    const count = recipeCount(item);
    if (count === 0) return text('FABRICATE.Admin.Manager.BooksScrolls.NoRecipes', 'No recipes');
    if (count === 1) return text('FABRICATE.Admin.Manager.BooksScrolls.OneRecipe', '1 recipe');
    return text('FABRICATE.Admin.Manager.BooksScrolls.RecipeCount', '{n} recipes').replace('{n}', count);
  }

  // Use cap chip (item visibility mode). Reads the new `caps.item` shape; falls
  // back to a maxUses of 1 when absent.
  function useLimited(item) {
    return item?.caps?.item?.limitUses === true;
  }

  function maxUses(item) {
    const raw = Number(item?.caps?.item?.maxUses);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  }

  function useChipLabel(item) {
    if (!useLimited(item)) return text('FABRICATE.Admin.Manager.BooksScrolls.Unlimited', 'Unlimited');
    const max = maxUses(item);
    return max === 1
      ? text('FABRICATE.Admin.Manager.BooksScrolls.OneUse', '1 use')
      : text('FABRICATE.Admin.Manager.BooksScrolls.UseCount', '{n} uses').replace('{n}', max);
  }

  // Learning chip (knowledge visibility mode). Prefers the new `caps.learn` shape
  // (`limitLearning` / `learningMode` / `learnsAllowed`) and falls back to the
  // legacy `limitRecipes` / `maxRecipes` fields.
  function learnLimited(item) {
    const learn = item?.caps?.learn || {};
    return learn.limitLearning === true || learn.limitRecipes === true;
  }

  function learnsAllowed(item) {
    const learn = item?.caps?.learn || {};
    const raw = Number(learn.learnsAllowed ?? learn.maxRecipes);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  }

  function learnChipLabel(item) {
    if (!learnLimited(item)) return text('FABRICATE.Admin.Manager.BooksScrolls.LearnFreely', 'Learn freely');
    const mode = item?.caps?.learn?.learningMode;
    if (mode === 'once') return text('FABRICATE.Admin.Manager.BooksScrolls.LearnOnce', 'Learn once');
    if (mode === 'party') return text('FABRICATE.Admin.Manager.BooksScrolls.PartyLearn', 'Party learn');
    return text('FABRICATE.Admin.Manager.BooksScrolls.LearnTimes', '{n}× learn').replace('{n}', learnsAllowed(item));
  }

  function capChipLabel(item) {
    return isItemMode ? useChipLabel(item) : learnChipLabel(item);
  }

  function capLimited(item) {
    return isItemMode ? useLimited(item) : learnLimited(item);
  }

  const typeOptions = $derived(
    Array.from(new Set((recipeItems || []).map((item) => item?.derivedType || 'Book'))).sort()
  );

  const filteredItems = $derived((recipeItems || []).filter((item) => {
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'enabled' && item.enabled !== false)
      || (statusFilter === 'disabled' && item.enabled === false);
    const matchesType = typeFilter === 'all' || (item.derivedType || 'Book') === typeFilter;
    const matchesCap = capFilter === 'all'
      || (capFilter === 'limited' && capLimited(item))
      || (capFilter === 'unlimited' && !capLimited(item));
    return matchesStatus && matchesType && matchesCap;
  }));

  const filtersActive = $derived(
    statusFilter !== 'all' || typeFilter !== 'all' || capFilter !== 'all'
  );

  const paginatedItems = $derived(
    filteredItems.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredItems.length) {
      pageIndex = 0;
    }
  });

  function isSelected(item) {
    return !!selectedRecipeItemId && item.id === selectedRecipeItemId;
  }

  function clearFilters() {
    statusFilter = 'all';
    typeFilter = 'all';
    capFilter = 'all';
  }
</script>

<main class="manager-main manager-books-scrolls-main" aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Title', 'Books & Scrolls')} data-books-scrolls>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{selectedSystemName || text('FABRICATE.Admin.Manager.SelectSystem', 'Select a system')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.BooksScrolls.Library', 'Books & Scrolls')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.BooksScrolls.LibraryHint', 'Recipe items that grant recipes when read. Set their contents, uses and learning limits.')}</p>
    </div>
    <button
      type="button"
      class="manager-button is-primary manager-books-scrolls-create"
      data-books-scrolls-create
      onclick={() => onCreateRecipeItem()}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.BooksScrolls.Create', 'Create recipe item')}</span>
    </button>
  </section>

  <section class="manager-toolbar" aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Filters', 'Recipe item filters')}>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value} data-books-scrolls-status-filter aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.StatusFilterLabel', 'Filter recipe items by status')}>
        <option value="all">{text('FABRICATE.Admin.Manager.BooksScrolls.StatusAll', 'All statuses')}</option>
        <option value="enabled">{text('FABRICATE.Admin.Manager.StatusOn', 'On')}</option>
        <option value="disabled">{text('FABRICATE.Admin.Manager.StatusOff', 'Off')}</option>
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.BooksScrolls.TypeFilter', 'Type')}</span>
      <select value={typeFilter} onchange={(event) => typeFilter = event.currentTarget.value} data-books-scrolls-type-filter aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.TypeFilterLabel', 'Filter recipe items by type')}>
        <option value="all">{text('FABRICATE.Admin.Manager.BooksScrolls.TypeAll', 'All types')}</option>
        {#each typeOptions as option (option)}
          <option value={option}>{option}</option>
        {/each}
      </select>
    </label>
    <label class="manager-filter">
      <span>{isItemMode ? text('FABRICATE.Admin.Manager.BooksScrolls.UsesFilter', 'Uses') : text('FABRICATE.Admin.Manager.BooksScrolls.LearningFilter', 'Learning')}</span>
      <select value={capFilter} onchange={(event) => capFilter = event.currentTarget.value} data-books-scrolls-cap-filter aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.CapFilterLabel', 'Filter recipe items by limits')}>
        <option value="all">{text('FABRICATE.Admin.Manager.BooksScrolls.CapAll', 'All')}</option>
        <option value="limited">{isItemMode ? text('FABRICATE.Admin.Manager.BooksScrolls.LimitedUse', 'Limited use') : text('FABRICATE.Admin.Manager.BooksScrolls.LimitedLearning', 'Limited learning')}</option>
        <option value="unlimited">{isItemMode ? text('FABRICATE.Admin.Manager.BooksScrolls.Unlimited', 'Unlimited') : text('FABRICATE.Admin.Manager.BooksScrolls.LearnFreely', 'Learn freely')}</option>
      </select>
    </label>
    <span class="manager-chip" data-books-scrolls-count>{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredItems.length).replace('{total}', (recipeItems || []).length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-button manager-clear-filters" data-clear-filters="books-scrolls" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-table-scroll manager-books-scrolls-scroll" aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.Table', 'Recipe items')}>
    {#if (recipeItems || []).length === 0}
      <div class="manager-empty" data-books-scrolls-empty>
        <div>
          <i class="fas fa-book-sparkles" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyTitle', 'No recipe items yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyHint', 'Create a recipe item and link recipes to it, and it will appear here.')}</p>
          <button type="button" class="manager-button is-primary" data-books-scrolls-empty-create onclick={() => onCreateRecipeItem()}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.BooksScrolls.Create', 'Create recipe item')}</span>
          </button>
        </div>
      </div>
    {:else if filteredItems.length === 0}
      <div class="manager-empty" data-books-scrolls-empty-filtered>
        <div>
          <i class="fas fa-filter" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyFilterTitle', 'No recipe items match these filters')}</h3>
          <p>{text('FABRICATE.Admin.Manager.BooksScrolls.EmptyFilterHint', 'Clear the filters to show every recipe item in this system.')}</p>
          <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-books-scrolls-list" role="list">
        <div class="manager-books-scrolls-head" aria-hidden="true">
          <span class="manager-books-scrolls-head-cell is-item">{text('FABRICATE.Admin.Manager.BooksScrolls.ColItem', 'Recipe item')}</span>
          <span class="manager-books-scrolls-head-cell">{text('FABRICATE.Admin.Manager.BooksScrolls.ColRecipes', 'Recipes')}</span>
          <span class="manager-books-scrolls-head-cell">{isItemMode ? text('FABRICATE.Admin.Manager.BooksScrolls.ColUses', 'Uses') : text('FABRICATE.Admin.Manager.BooksScrolls.ColLearning', 'Learning')}</span>
          <span class="manager-books-scrolls-head-cell is-status">{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
        </div>
        {#each paginatedItems as item (item.id)}
          <div
            class={`manager-books-scrolls-listitem ${isSelected(item) ? 'is-selected' : ''} ${item.enabled === false ? 'is-disabled' : ''}`}
            role="listitem"
            data-books-scrolls-item={item.id}
          >
            <button
              type="button"
              class="manager-books-scrolls-identity"
              data-books-scrolls-select={item.id}
              aria-pressed={isSelected(item)}
              aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.SelectItem', 'Select {name}').replace('{name}', item.resolvedName)}
              onclick={() => onSelectRecipeItem(item.id)}
            >
              <img class="manager-books-scrolls-thumb" src={recipeItemImage(item)} alt="" />
              <span class="manager-books-scrolls-name" data-books-scrolls-name={item.id} title={item.resolvedName}>{item.resolvedName}</span>
              <span class="manager-chip is-neutral manager-books-scrolls-type-pill" data-books-scrolls-type={item.id}>{item.derivedType || text('FABRICATE.Admin.Manager.BooksScrolls.TypeBook', 'Book')}</span>
              {#if item.linkMissing}
                <span class="manager-chip is-danger manager-books-scrolls-link-chip" data-books-scrolls-link-missing={item.id}>
                  <i class="fas fa-link-slash" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Manager.BooksScrolls.LinkMissing', 'Item missing')}</span>
                </span>
              {/if}
            </button>

            <span
              class={`manager-chip manager-books-scrolls-recipe-chip ${recipeCount(item) === 0 ? 'is-danger' : ''}`}
              data-books-scrolls-recipe-count={item.id}
            >
              <i class={recipeCount(item) === 0 ? 'fas fa-circle-exclamation' : 'fas fa-scroll'} aria-hidden="true"></i>
              <span>{recipeCountLabel(item)}</span>
            </span>

            <span
              class={`manager-chip manager-books-scrolls-cap-chip ${capLimited(item) ? 'is-limited' : 'is-unlimited'}`}
              data-books-scrolls-cap-chip={item.id}
              data-books-scrolls-cap-limited={capLimited(item)}
            >
              <i class={isItemMode ? 'fas fa-fire-flame-curved' : 'fas fa-graduation-cap'} aria-hidden="true"></i>
              <span>{capChipLabel(item)}</span>
            </span>

            <div class="manager-books-scrolls-actions">
              <button
                type="button"
                class={`manager-status-toggle ${item.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={item.enabled !== false}
                data-books-scrolls-toggle={item.id}
                aria-label={item.enabled === false
                  ? text('FABRICATE.Admin.Manager.BooksScrolls.EnableNamed', 'Enable {name}').replace('{name}', item.resolvedName)
                  : text('FABRICATE.Admin.Manager.BooksScrolls.DisableNamed', 'Disable {name}').replace('{name}', item.resolvedName)}
                onclick={(event) => { event.stopPropagation(); onToggleEnabled(item.id, item.enabled === false); }}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">{item.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}</span>
              </button>
              <button
                type="button"
                class="manager-icon-button manager-books-scrolls-edit"
                data-books-scrolls-edit={item.id}
                aria-label={text('FABRICATE.Admin.Manager.BooksScrolls.EditNamed', 'Edit {name}').replace('{name}', item.resolvedName)}
                title={text('FABRICATE.Admin.Manager.BooksScrolls.Edit', 'Edit recipe item')}
                onclick={() => onOpenRecipeItem(item.id)}
              >
                <i class="fas fa-pen" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredItems.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</main>

<style>
  .manager-books-scrolls-main {
    gap: var(--fab-space-3);
    min-height: 0;
  }

  .manager-books-scrolls-scroll {
    overflow-y: auto;
    min-height: 0;
  }

  /* Column table: one parent grid defines the four columns (item · recipes ·
     uses/learning · status); the header and every row are subgrids of it, so the
     header labels line up with the cells beneath them regardless of chip width. */
  .manager-books-scrolls-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    column-gap: var(--fab-space-4);
    row-gap: var(--fab-space-2);
  }

  .manager-books-scrolls-head,
  .manager-books-scrolls-listitem {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
  }

  .manager-books-scrolls-head {
    padding: 0 var(--fab-space-3) var(--fab-space-1);
  }

  .manager-books-scrolls-head-cell {
    justify-self: start;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
  }

  .manager-books-scrolls-head-cell.is-status {
    justify-self: end;
  }

  .manager-books-scrolls-listitem {
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-mv2-border);
    border-radius: var(--fab-v2-radius-panel);
    background: var(--fab-bg-2);
  }

  .manager-books-scrolls-listitem.is-selected {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-soft);
  }

  .manager-books-scrolls-listitem.is-disabled {
    opacity: 0.55;
  }

  .manager-books-scrolls-identity {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: 0;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .manager-books-scrolls-identity:focus {
    outline: none;
    box-shadow: none;
  }

  .manager-books-scrolls-identity:focus-visible {
    outline: 2px solid var(--fab-accent-border);
    outline-offset: 3px;
    border-radius: var(--fab-v2-radius-control);
  }

  .manager-books-scrolls-thumb {
    width: var(--fab-v2-thumb-sm);
    height: var(--fab-v2-thumb-sm);
    border-radius: var(--fab-v2-radius-control);
    object-fit: cover;
    flex: none;
  }

  .manager-books-scrolls-name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .manager-books-scrolls-type-pill {
    flex: none;
  }

  .manager-books-scrolls-recipe-chip,
  .manager-books-scrolls-cap-chip {
    justify-self: start;
    white-space: nowrap;
  }

  .manager-books-scrolls-actions {
    display: flex;
    align-items: center;
    justify-self: end;
    gap: var(--fab-space-2);
  }

  /* Limited caps read as a "waiting/attention" warning tint; an uncapped item
     (Unlimited / Learn freely) reads as a neutral informational blue. Both use
     semantic tokens only — no literals. */
  .manager-books-scrolls-cap-chip.is-limited {
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
    border-color: var(--fab-warning-border);
  }

  .manager-books-scrolls-cap-chip.is-unlimited {
    color: var(--fab-info-text);
    background: var(--fab-info-soft);
    border-color: var(--fab-info-border);
  }
</style>
