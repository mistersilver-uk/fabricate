<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import VocabularyPanel from './VocabularyPanel.svelte';

  let {
    categoryRows = [],
    componentCategoryRows = [],
    tagRows = [],
    counts = {},
    onAddCategory = () => {},
    onRemoveCategory = () => {},
    onAddComponentCategory = () => {},
    onRemoveComponentCategory = () => {},
    onAddTag = () => {},
    onRemoveTag = () => {},
    onConfirmRemove = () => true
  } = $props();

  let searchTerm = $state('');

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const generalCategory = $derived((categoryRows || []).find(row => row.id === 'general') || null);
  const customCategoryRows = $derived((categoryRows || []).filter(row => row.id !== 'general'));
  const filteredCategoryRows = $derived(customCategoryRows.filter(row => matchesSearch(row)));
  // Component categories are a SIBLING vocabulary (issue 676) — filtered, counted and
  // written independently of the recipe categories above. They share only this screen.
  const generalComponentCategory = $derived((componentCategoryRows || []).find(row => row.id === 'general') || null);
  const customComponentCategoryRows = $derived((componentCategoryRows || []).filter(row => row.id !== 'general'));
  const filteredComponentCategoryRows = $derived(customComponentCategoryRows.filter(row => matchesSearch(row)));
  const filteredTagRows = $derived((tagRows || []).filter(row => matchesSearch(row)));
  const hasCategorySearchMiss = $derived(Boolean(normalizedSearchTerm) && customCategoryRows.length > 0 && filteredCategoryRows.length === 0);
  const hasComponentCategorySearchMiss = $derived(Boolean(normalizedSearchTerm) && customComponentCategoryRows.length > 0 && filteredComponentCategoryRows.length === 0);
  const hasTagSearchMiss = $derived(Boolean(normalizedSearchTerm) && tagRows.length > 0 && filteredTagRows.length === 0);

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

  function existsIn(rows, value) {
    const normalized = String(value || '').trim().toLowerCase();
    return (rows || []).some(row => String(row.name || '').toLowerCase() === normalized);
  }

  // Shared by BOTH category vocabularies: same rules, different row set. Each keeps
  // its own duplicate check so a recipe category and a component category may share a
  // name without either reporting a false duplicate.
  function validateCategory(rows) {
    return (value) => {
      if (!value) return text('FABRICATE.Admin.Manager.TagsCategories.BlankCategoryFeedback', 'Enter a category name before adding it.');
      if (isGeneral(value)) return text('FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback', 'General is already available as the base category.');
      if (existsIn(rows, value)) return text('FABRICATE.Admin.Manager.TagsCategories.DuplicateCategoryFeedback', 'That category already exists.');
      return '';
    };
  }

  function validateTag(value) {
    if (!value) return text('FABRICATE.Admin.Manager.TagsCategories.BlankTagFeedback', 'Enter a tag name before adding it.');
    if (existsIn(tagRows, value)) return text('FABRICATE.Admin.Manager.TagsCategories.DuplicateTagFeedback', 'That tag already exists.');
    return '';
  }

  function categoryAdded() {
    return text('FABRICATE.Admin.Manager.TagsCategories.CategoryAddedFeedback', 'Category added.');
  }

  function tagAdded(value, rawValue) {
    return value === rawValue
      ? text('FABRICATE.Admin.Manager.TagsCategories.TagAddedFeedback', 'Tag added.')
      : text('FABRICATE.Admin.Manager.TagsCategories.TagNormalizedFeedback', 'Tag added with cleaned-up lowercase text.');
  }

  function removeWithConfirm(kind, handler) {
    return (row) => {
      if (!confirmRemoval(kind, row)) return;
      handler(row.name);
    };
  }

  function confirmRemoval(kind, row) {
    if ((row.totalUsage || 0) <= 0) return true;
    return onConfirmRemove(kind, row) !== false;
  }

  function clearSearch() {
    searchTerm = '';
  }
</script>

<main class="manager-main" aria-label={text('FABRICATE.Admin.Manager.TagsCategories.Title', 'Tags & Categories')}>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.TagsCategories.Kicker', 'System vocabulary')}</p>
      <h2 class="manager-title">{text('FABRICATE.Admin.Manager.TagsCategories.Library', 'Tags & Categories')}</h2>
      <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.TagsCategories.LibraryHint', 'Define recipe categories, component categories and item tags before assigning them elsewhere.')}</p>
    </div>
  </section>

  <section class="manager-toolbar" aria-label={text('FABRICATE.Admin.Manager.TagsCategories.Filters', 'Tags and categories filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.TagsCategories.SearchPlaceholder', 'Search tags and categories...')}
        aria-label={text('FABRICATE.Admin.Manager.TagsCategories.SearchLabel', 'Search tags and categories')}
      />
    </label>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.TagsCategories.CustomCategoryCount', '{count} custom categories').replace('{count}', counts.customCategories || 0)}</span>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.TagsCategories.CustomComponentCategoryCount', '{count} component categories').replace('{count}', counts.customComponentCategories || 0)}</span>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.TagsCategories.ItemTagCount', '{count} item tags').replace('{count}', counts.itemTags || 0)}</span>
    {#if normalizedSearchTerm}
      <button type="button" class="manager-button" onclick={clearSearch}>{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button>
    {/if}
  </section>

  <section class="manager-tags-categories-workspace" aria-label={text('FABRICATE.Admin.Manager.TagsCategories.Workspace', 'Tags and categories workspace')}>
    <VocabularyPanel
      label={text('FABRICATE.Admin.Manager.TagsCategories.Categories', 'Recipe categories')}
      title={text('FABRICATE.Admin.Manager.TagsCategories.Categories', 'Recipe categories')}
      hint={text('FABRICATE.Admin.Manager.TagsCategories.CategoriesHint', 'General is always available. Add custom categories for recipes that need clearer grouping.')}
      inputId="manager-category-add"
      inputLabel={text('FABRICATE.Admin.Manager.TagsCategories.CategoryName', 'Category name')}
      inputPlaceholder={text('FABRICATE.Admin.Manager.TagsCategories.CategoryPlaceholder', 'e.g. Potions')}
      addLabel={text('FABRICATE.Admin.Manager.TagsCategories.AddCategory', 'Add category')}
      rowAttr="data-category-id"
      rows={filteredCategoryRows}
      lockedRow={generalCategory}
      lockedHint={text('FABRICATE.Admin.Manager.TagsCategories.GeneralHint', 'Base category, not stored as a custom category.')}
      emptyTitle={text('FABRICATE.Admin.Manager.TagsCategories.OnlyGeneral', 'Only General is available.')}
      emptyHint={text('FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralHint', 'Add a custom category when recipes need more specific grouping.')}
      searchMissTitle={text('FABRICATE.Admin.Manager.TagsCategories.NoCategoryMatches', 'No custom categories match this search.')}
      hasSearchMiss={hasCategorySearchMiss}
      removeLabel={text('FABRICATE.Admin.Manager.TagsCategories.RemoveCategory', 'Remove category')}
      removeNamedLabel={text('FABRICATE.Admin.Manager.TagsCategories.RemoveCategoryNamed', 'Remove category {name}')}
      validate={validateCategory(customCategoryRows)}
      normalize={normalizeCategory}
      successFeedback={categoryAdded}
      addFailedFeedback={text('FABRICATE.Admin.Manager.TagsCategories.CategoryAddFailedFeedback', 'Category could not be added.')}
      onAdd={onAddCategory}
      onRemove={removeWithConfirm('category', onRemoveCategory)}
    />

    <VocabularyPanel
      label={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategories', 'Component categories')}
      title={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategories', 'Component categories')}
      hint={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategoriesHint', 'General is always available. Add custom categories to group components in the component directory. Separate from recipe categories.')}
      inputId="manager-component-category-add"
      inputLabel={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryName', 'Component category name')}
      inputPlaceholder={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryPlaceholder', 'e.g. Reagent')}
      addLabel={text('FABRICATE.Admin.Manager.TagsCategories.AddComponentCategory', 'Add component category')}
      rowAttr="data-component-category-id"
      rows={filteredComponentCategoryRows}
      lockedRow={generalComponentCategory}
      lockedHint={text('FABRICATE.Admin.Manager.TagsCategories.GeneralHint', 'Base category, not stored as a custom category.')}
      emptyTitle={text('FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralComponent', 'Only General is available.')}
      emptyHint={text('FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralComponentHint', 'Add a custom category when components need more specific grouping.')}
      searchMissTitle={text('FABRICATE.Admin.Manager.TagsCategories.NoComponentCategoryMatches', 'No component categories match this search.')}
      hasSearchMiss={hasComponentCategorySearchMiss}
      removeLabel={text('FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategory', 'Remove component category')}
      removeNamedLabel={text('FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategoryNamed', 'Remove component category {name}')}
      validate={validateCategory(customComponentCategoryRows)}
      normalize={normalizeCategory}
      successFeedback={categoryAdded}
      addFailedFeedback={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryAddFailedFeedback', 'Component category could not be added.')}
      onAdd={onAddComponentCategory}
      onRemove={removeWithConfirm('component-category', onRemoveComponentCategory)}
    />

    <VocabularyPanel
      label={text('FABRICATE.Admin.Manager.TagsCategories.ItemTags', 'Item tags')}
      title={text('FABRICATE.Admin.Manager.TagsCategories.ItemTags', 'Item tags')}
      hint={text('FABRICATE.Admin.Manager.TagsCategories.ItemTagsHint', 'Use item tags for component organization and tag-based ingredient options.')}
      inputId="manager-tag-add"
      inputLabel={text('FABRICATE.Admin.Manager.TagsCategories.TagName', 'Tag name')}
      inputPlaceholder={text('FABRICATE.Admin.Manager.TagsCategories.TagPlaceholder', 'e.g. herb')}
      addLabel={text('FABRICATE.Admin.Manager.TagsCategories.AddTag', 'Add tag')}
      rowAttr="data-tag-id"
      rows={filteredTagRows}
      lockedRow={null}
      emptyTitle={text('FABRICATE.Admin.Manager.TagsCategories.NoTags', 'No item tags defined yet.')}
      emptyHint={text('FABRICATE.Admin.Manager.TagsCategories.NoTagsHint', 'Add tags before using tag-based ingredient options.')}
      searchMissTitle={text('FABRICATE.Admin.Manager.TagsCategories.NoTagMatches', 'No item tags match this search.')}
      hasSearchMiss={hasTagSearchMiss}
      removeLabel={text('FABRICATE.Admin.Manager.TagsCategories.RemoveTag', 'Remove tag')}
      removeNamedLabel={text('FABRICATE.Admin.Manager.TagsCategories.RemoveTagNamed', 'Remove tag {name}')}
      validate={validateTag}
      normalize={normalizeTag}
      successFeedback={tagAdded}
      addFailedFeedback={text('FABRICATE.Admin.Manager.TagsCategories.TagAddFailedFeedback', 'Tag could not be added.')}
      onAdd={onAddTag}
      onRemove={removeWithConfirm('tag', onRemoveTag)}
    />
  </section>
</main>
