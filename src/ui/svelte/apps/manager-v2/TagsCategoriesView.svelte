<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    categoryRows = [],
    tagRows = [],
    counts = {},
    onAddCategory = () => {},
    onRemoveCategory = () => {},
    onAddTag = () => {},
    onRemoveTag = () => {},
    onConfirmRemove = () => true
  } = $props();

  let searchTerm = $state('');
  let categoryInput = $state('');
  let tagInput = $state('');
  let categoryFeedback = $state('');
  let tagFeedback = $state('');
  let categorySubmitting = $state(false);
  let tagSubmitting = $state(false);
  let categoryInputElement;
  let tagInputElement;

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const generalCategory = $derived((categoryRows || []).find(row => row.id === 'general') || null);
  const customCategoryRows = $derived((categoryRows || []).filter(row => row.id !== 'general'));
  const filteredCategoryRows = $derived(customCategoryRows.filter(row => matchesSearch(row)));
  const filteredTagRows = $derived((tagRows || []).filter(row => matchesSearch(row)));
  const hasCategorySearchMiss = $derived(normalizedSearchTerm && customCategoryRows.length > 0 && filteredCategoryRows.length === 0);
  const hasTagSearchMiss = $derived(normalizedSearchTerm && tagRows.length > 0 && filteredTagRows.length === 0);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function matchesSearch(row) {
    if (!normalizedSearchTerm) return true;
    return [
      row.name || '',
      row.id || '',
      row.kind || ''
    ].join(' ').toLowerCase().includes(normalizedSearchTerm);
  }

  function normalizeCategory(value) {
    return String(value || '').trim();
  }

  function normalizeTag(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isGeneral(value) {
    return String(value || '').trim().toLowerCase() === 'general';
  }

  function existingCategory(value) {
    const normalized = normalizeCategory(value).toLowerCase();
    return customCategoryRows.some(row => String(row.name || '').toLowerCase() === normalized);
  }

  function existingTag(value) {
    const normalized = normalizeTag(value);
    return (tagRows || []).some(row => String(row.name || '').toLowerCase() === normalized);
  }

  // Focus the element on the next microtask. We avoid `await tick()` here:
  // tick waits for Svelte's full reactive flush, which means focus() lands
  // one extra microtask later than the surrounding state mutations. Tests
  // (and Foundry's app lifecycle) only await two ticks after dispatching
  // a form submit, which was insufficient when transferring focus between
  // inputs — the assertion saw the previous activeElement and failed
  // (`assert.equal` then exploded formatting two unequal happy-dom elements).
  // queueMicrotask runs after Svelte's effect schedule for this batch so
  // bind:this is current, but does not introduce an additional await depth.
  function focusAfterUpdate(element) {
    queueMicrotask(() => element?.focus?.());
  }

  async function submitCategory(event) {
    event.preventDefault();
    if (categorySubmitting) return;
    const value = normalizeCategory(categoryInput);
    if (!value) {
      categoryFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.BlankCategoryFeedback', 'Enter a category name before adding it.');
      await focusAfterUpdate(categoryInputElement);
      return;
    }
    if (isGeneral(value)) {
      categoryFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.GeneralReservedFeedback', 'General is already available as the base category.');
      await focusAfterUpdate(categoryInputElement);
      return;
    }
    if (existingCategory(value)) {
      categoryFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.DuplicateCategoryFeedback', 'That category already exists.');
      await focusAfterUpdate(categoryInputElement);
      return;
    }
    categorySubmitting = true;
    try {
      const result = await onAddCategory(value);
      if (result === false) {
        categoryFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.CategoryAddFailedFeedback', 'Category could not be added.');
        await focusAfterUpdate(categoryInputElement);
        return;
      }
      categoryInput = '';
      categoryFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.CategoryAddedFeedback', 'Category added.');
      await focusAfterUpdate(categoryInputElement);
    } catch (_err) {
      categoryFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.CategoryAddFailedFeedback', 'Category could not be added.');
      await focusAfterUpdate(categoryInputElement);
    } finally {
      categorySubmitting = false;
    }
  }

  async function submitTag(event) {
    event.preventDefault();
    if (tagSubmitting) return;
    const rawValue = tagInput.trim();
    const value = normalizeTag(tagInput);
    if (!value) {
      tagFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.BlankTagFeedback', 'Enter a tag name before adding it.');
      await focusAfterUpdate(tagInputElement);
      return;
    }
    if (existingTag(value)) {
      tagFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.DuplicateTagFeedback', 'That tag already exists.');
      await focusAfterUpdate(tagInputElement);
      return;
    }
    tagSubmitting = true;
    try {
      const result = await onAddTag(value);
      if (result === false) {
        tagFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.TagAddFailedFeedback', 'Tag could not be added.');
        await focusAfterUpdate(tagInputElement);
        return;
      }
      tagInput = '';
      tagFeedback = value === rawValue
        ? text('FABRICATE.Admin.ManagerV2.TagsCategories.TagAddedFeedback', 'Tag added.')
        : text('FABRICATE.Admin.ManagerV2.TagsCategories.TagNormalizedFeedback', 'Tag added with cleaned-up lowercase text.');
      await focusAfterUpdate(tagInputElement);
    } catch (_err) {
      tagFeedback = text('FABRICATE.Admin.ManagerV2.TagsCategories.TagAddFailedFeedback', 'Tag could not be added.');
      await focusAfterUpdate(tagInputElement);
    } finally {
      tagSubmitting = false;
    }
  }

  function removeCategory(row) {
    if (!row || row.locked) return;
    if (!confirmRemoval('category', row)) return;
    onRemoveCategory(row.name);
  }

  function removeTag(row) {
    if (!row) return;
    if (!confirmRemoval('tag', row)) return;
    onRemoveTag(row.name);
  }

  function confirmRemoval(kind, row) {
    if ((row.totalUsage || 0) <= 0) return true;
    return onConfirmRemove(kind, row) !== false;
  }

  function usageLabel(row) {
    const count = row?.totalUsage || 0;
    if (count === 0) return text('FABRICATE.Admin.ManagerV2.TagsCategories.Unused', 'Unused');
    return text('FABRICATE.Admin.ManagerV2.TagsCategories.UsageCount', '{count} references').replace('{count}', count);
  }

  function clearSearch() {
    searchTerm = '';
  }
</script>

<main class="manager-v2-main" aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.Title', 'Tags & Categories')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.TagsCategories.Kicker', 'System vocabulary')}</p>
      <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.TagsCategories.Library', 'Tags & Categories')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.TagsCategories.LibraryHint', 'Define recipe categories and item tags before assigning them elsewhere.')}</p>
    </div>
  </section>

  <section class="manager-v2-toolbar" aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.Filters', 'Tags and categories filters')}>
    <label class="manager-v2-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.ManagerV2.TagsCategories.SearchPlaceholder', 'Search tags and categories...')}
        aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.SearchLabel', 'Search tags and categories')}
      />
    </label>
    <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.TagsCategories.CustomCategoryCount', '{count} custom categories').replace('{count}', counts.customCategories || 0)}</span>
    <span class="manager-v2-chip">{text('FABRICATE.Admin.ManagerV2.TagsCategories.ItemTagCount', '{count} item tags').replace('{count}', counts.itemTags || 0)}</span>
    {#if normalizedSearchTerm}
      <button type="button" class="manager-v2-button" onclick={clearSearch}>{text('FABRICATE.Admin.ManagerV2.ClearSearch', 'Clear search')}</button>
    {/if}
  </section>

  <section class="manager-v2-tags-categories-workspace" aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.Workspace', 'Tags and categories workspace')}>
    <section class="manager-v2-vocabulary-panel" aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.Categories', 'Recipe categories')}>
      <div class="manager-v2-vocabulary-heading">
        <div>
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.TagsCategories.Categories', 'Recipe categories')}</h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.TagsCategories.CategoriesHint', 'General is always available. Add custom categories for recipes that need clearer grouping.')}</p>
        </div>
      </div>
      <form class="manager-v2-vocabulary-form" onsubmit={submitCategory}>
        <label class="manager-v2-field" for="manager-v2-category-add">
          <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.CategoryName', 'Category name')}</span>
          <input id="manager-v2-category-add" type="text" bind:value={categoryInput} bind:this={categoryInputElement} placeholder={text('FABRICATE.Admin.ManagerV2.TagsCategories.CategoryPlaceholder', 'e.g. Potions')} />
        </label>
        <button type="submit" class="manager-v2-button is-primary" disabled={!categoryInput.trim() || categorySubmitting}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.AddCategory', 'Add category')}</span>
        </button>
      </form>
      {#if categoryFeedback}
        <p class="manager-v2-form-warning" role="status">{categoryFeedback}</p>
      {/if}
      <div class="manager-v2-vocabulary-list">
        {#if generalCategory}
          <div class="manager-v2-vocabulary-row is-locked" data-category-id="general">
            <span class="manager-v2-vocabulary-main">
              <strong>{generalCategory.name}</strong>
              <span class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.TagsCategories.GeneralHint', 'Base category, not stored as a custom category.')}</span>
            </span>
            <span class="manager-v2-chip is-active">{usageLabel(generalCategory)}</span>
            <span class="manager-v2-chip is-disabled">{text('FABRICATE.Admin.ManagerV2.TagsCategories.Locked', 'Locked')}</span>
          </div>
        {/if}
        {#each filteredCategoryRows as row (row.id)}
          <div class="manager-v2-vocabulary-row" data-category-id={row.id}>
            <span class="manager-v2-vocabulary-main">
              <strong>{row.name}</strong>
              <span class="manager-v2-muted">{usageLabel(row)}</span>
            </span>
            <span class={`manager-v2-chip ${row.totalUsage > 0 ? 'is-warning' : ''}`}>{usageLabel(row)}</span>
            <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.RemoveCategoryNamed', 'Remove category {name}').replace('{name}', row.name)} title={text('FABRICATE.Admin.ManagerV2.TagsCategories.RemoveCategory', 'Remove category')} onclick={() => removeCategory(row)}>
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        {:else}
          <div class="manager-v2-vocabulary-empty">
            {#if hasCategorySearchMiss}
              <strong>{text('FABRICATE.Admin.ManagerV2.TagsCategories.NoCategoryMatches', 'No custom categories match this search.')}</strong>
            {:else}
              <strong>{text('FABRICATE.Admin.ManagerV2.TagsCategories.OnlyGeneral', 'Only General is available.')}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.OnlyGeneralHint', 'Add a custom category when recipes need more specific grouping.')}</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="manager-v2-vocabulary-panel" aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.ItemTags', 'Item tags')}>
      <div class="manager-v2-vocabulary-heading">
        <div>
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.TagsCategories.ItemTags', 'Item tags')}</h3>
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.TagsCategories.ItemTagsHint', 'Use item tags for component organization and tag-based ingredient options.')}</p>
        </div>
      </div>
      <form class="manager-v2-vocabulary-form" onsubmit={submitTag}>
        <label class="manager-v2-field" for="manager-v2-tag-add">
          <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.TagName', 'Tag name')}</span>
          <input id="manager-v2-tag-add" type="text" bind:value={tagInput} bind:this={tagInputElement} placeholder={text('FABRICATE.Admin.ManagerV2.TagsCategories.TagPlaceholder', 'e.g. herb')} />
        </label>
        <button type="submit" class="manager-v2-button is-primary" disabled={!tagInput.trim() || tagSubmitting}>
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.AddTag', 'Add tag')}</span>
        </button>
      </form>
      {#if tagFeedback}
        <p class="manager-v2-form-warning" role="status">{tagFeedback}</p>
      {/if}
      <div class="manager-v2-vocabulary-list">
        {#each filteredTagRows as row (row.id)}
          <div class="manager-v2-vocabulary-row" data-tag-id={row.id}>
            <span class="manager-v2-vocabulary-main">
              <strong>{row.name}</strong>
              <span class="manager-v2-muted">{usageLabel(row)}</span>
            </span>
            <span class={`manager-v2-chip ${row.totalUsage > 0 ? 'is-warning' : ''}`}>{usageLabel(row)}</span>
            <button type="button" class="manager-v2-icon-button is-danger" aria-label={text('FABRICATE.Admin.ManagerV2.TagsCategories.RemoveTagNamed', 'Remove tag {name}').replace('{name}', row.name)} title={text('FABRICATE.Admin.ManagerV2.TagsCategories.RemoveTag', 'Remove tag')} onclick={() => removeTag(row)}>
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
        {:else}
          <div class="manager-v2-vocabulary-empty">
            {#if hasTagSearchMiss}
              <strong>{text('FABRICATE.Admin.ManagerV2.TagsCategories.NoTagMatches', 'No item tags match this search.')}</strong>
            {:else}
              <strong>{text('FABRICATE.Admin.ManagerV2.TagsCategories.NoTags', 'No item tags defined yet.')}</strong>
              <span>{text('FABRICATE.Admin.ManagerV2.TagsCategories.NoTagsHint', 'Add tags before using tag-based ingredient options.')}</span>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  </section>
</main>
