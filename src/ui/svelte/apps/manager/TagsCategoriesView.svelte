<!-- Svelte 5 runes mode -->
<!--
  The Tags & Categories screen (issue 689): a tabbed screen over the three
  independent vocabularies — recipe categories, component categories, and item
  tags. One tab is shown at a time; each tab owns its own search, live-validated
  add form, and rows. The right inspector rail (stat tiles, contextual help,
  reference-safe reassurance) lives in the shared manager inspector slot in
  CraftingSystemManagerRoot, not here.
-->
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
    onSetCategoryIcon = () => {},
    onSetComponentCategoryIcon = () => {},
    // The active tab is owned by the root so the inspector's contextual help can
    // track it; this view stays a controlled component over that one piece of state.
    activeTab = 'recipe',
    onTabChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const generalCategory = $derived((categoryRows || []).find((row) => row.id === 'general') || null);
  const customCategoryRows = $derived((categoryRows || []).filter((row) => row.id !== 'general'));
  const generalComponentCategory = $derived(
    (componentCategoryRows || []).find((row) => row.id === 'general') || null
  );
  const customComponentCategoryRows = $derived(
    (componentCategoryRows || []).filter((row) => row.id !== 'general')
  );
  // Tag rows are display-decorated with a `#` prefix per the prototype, without
  // disturbing `row.name` (the value handed back to remove/confirm handlers).
  const decoratedTagRows = $derived(
    (tagRows || []).map((row) => ({ ...row, displayName: `#${row.name}` }))
  );

  const tabs = $derived([
    {
      id: 'recipe',
      icon: 'fas fa-scroll',
      label: text('FABRICATE.Admin.Manager.TagsCategories.Categories', 'Recipe categories'),
      count: counts.customCategories || 0,
    },
    {
      id: 'component',
      icon: 'fas fa-cubes',
      label: text(
        'FABRICATE.Admin.Manager.TagsCategories.ComponentCategories',
        'Component categories'
      ),
      count: counts.customComponentCategories || 0,
    },
    {
      id: 'tag',
      icon: 'fas fa-tag',
      label: text('FABRICATE.Admin.Manager.TagsCategories.ItemTags', 'Component tags'),
      count: counts.itemTags || 0,
    },
  ]);

  function existsIn(rows, value) {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    return (rows || []).some((row) => String(row.name || '').toLowerCase() === normalized);
  }

  function isGeneral(value) {
    return (
      String(value || '')
        .trim()
        .toLowerCase() === 'general'
    );
  }

  // The live hint machine shared by BOTH category vocabularies: same rules, its own
  // row set (so a recipe and a component category may share a name without a false
  // duplicate). `blocked` refuses submit; `tone` drives the hint styling.
  function categoryHint(rows) {
    return (rawValue) => {
      const value = String(rawValue || '').trim();
      if (!value) return { tone: '', message: '', blocked: true };
      if (isGeneral(value)) {
        return {
          tone: 'danger',
          message: text(
            'FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback',
            'General is already available as the base category.'
          ),
          blocked: true,
        };
      }
      if (existsIn(rows, value)) {
        return {
          tone: 'danger',
          message: text(
            'FABRICATE.Admin.Manager.TagsCategories.DuplicateCategoryFeedback',
            'That category already exists.'
          ),
          blocked: true,
        };
      }
      return {
        tone: 'success',
        message: text(
          'FABRICATE.Admin.Manager.TagsCategories.ReadyToAddCategory',
          'Ready to add "{name}".'
        ).replace('{name}', value),
        blocked: false,
      };
    };
  }

  function tagHint(rawValue) {
    const raw = String(rawValue || '').trim();
    if (!raw) return { tone: '', message: '', blocked: true };
    const lower = raw.toLowerCase();
    if (existsIn(tagRows, lower)) {
      return {
        tone: 'danger',
        message: text(
          'FABRICATE.Admin.Manager.TagsCategories.DuplicateTagFeedback',
          'That tag already exists.'
        ),
        blocked: true,
      };
    }
    if (lower !== raw) {
      return {
        tone: 'info',
        message: text(
          'FABRICATE.Admin.Manager.TagsCategories.TagLowercasePreview',
          'Will be added as "{name}" — tags are stored lowercase.'
        ).replace('{name}', lower),
        blocked: false,
      };
    }
    return {
      tone: 'success',
      message: text(
        'FABRICATE.Admin.Manager.TagsCategories.ReadyToAddTag',
        'Ready to add "{name}".'
      ).replace('{name}', lower),
      blocked: false,
    };
  }

  function normalizeCategory(value) {
    return String(value || '').trim();
  }

  function normalizeTag(value) {
    return String(value || '')
      .trim()
      .toLowerCase();
  }

  function categoryAdded() {
    return text('FABRICATE.Admin.Manager.TagsCategories.CategoryAddedFeedback', 'Category added.');
  }

  function tagAdded(value, rawValue) {
    return value === rawValue
      ? text('FABRICATE.Admin.Manager.TagsCategories.TagAddedFeedback', 'Tag added.')
      : text(
          'FABRICATE.Admin.Manager.TagsCategories.TagNormalizedFeedback',
          'Tag added with cleaned-up lowercase text.'
        );
  }
</script>

<main
  class="manager-main manager-tags-categories"
  aria-label={text('FABRICATE.Admin.Manager.TagsCategories.Title', 'Tags & Categories')}
>
  <section class="manager-section-header">
    <div class="manager-heading">
      <p class="manager-kicker">
        {text('FABRICATE.Admin.Manager.TagsCategories.Kicker', 'System vocabulary')}
      </p>
      <h2 class="manager-title">
        {text('FABRICATE.Admin.Manager.TagsCategories.Library', 'Tags & Categories')}
      </h2>
      <p class="manager-subtitle">
        {text(
          'FABRICATE.Admin.Manager.TagsCategories.LibraryHint',
          'Define the recipe categories, component categories and component tags the rest of the system references.'
        )}
      </p>
    </div>
  </section>

  <nav
    class="manager-tabs manager-vocabulary-tabs"
    role="tablist"
    aria-label={text('FABRICATE.Admin.Manager.TagsCategories.TabList', 'Vocabulary tabs')}
  >
    {#each tabs as tab (tab.id)}
      <button
        type="button"
        role="tab"
        class={`manager-tab ${activeTab === tab.id ? 'is-active' : ''}`}
        aria-selected={activeTab === tab.id}
        data-vocabulary-tab={tab.id}
        onclick={() => onTabChange(tab.id)}
      >
        <i class={tab.icon} aria-hidden="true"></i>
        <span>{tab.label}</span>
        <span class="manager-tab-count">{tab.count}</span>
      </button>
    {/each}
  </nav>

  <section
    class="manager-tags-categories-workspace"
    aria-label={text(
      'FABRICATE.Admin.Manager.TagsCategories.Workspace',
      'Tags and categories workspace'
    )}
  >
    {#if activeTab === 'recipe'}
      <VocabularyPanel
        label={text('FABRICATE.Admin.Manager.TagsCategories.Categories', 'Recipe categories')}
        hint={text(
          'FABRICATE.Admin.Manager.TagsCategories.CategoriesHint',
          'General is always available. Add custom categories for recipes that need clearer grouping — categories are flat, and each recipe picks exactly one.'
        )}
        inputId="manager-category-add"
        inputLabel={text('FABRICATE.Admin.Manager.TagsCategories.CategoryName', 'Category name')}
        inputPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.CategoryPlaceholder',
          'e.g. Potions'
        )}
        addLabel={text('FABRICATE.Admin.Manager.TagsCategories.AddCategory', 'Add category')}
        rowAttr="data-category-id"
        rows={customCategoryRows}
        lockedRow={generalCategory}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.SearchCategories',
          'Search recipe categories...'
        )}
        searchLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.SearchCategoriesLabel',
          'Search recipe categories'
        )}
        emptyTitle={text(
          'FABRICATE.Admin.Manager.TagsCategories.OnlyGeneral',
          'No recipe categories yet'
        )}
        emptyHint={text(
          'FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralHint',
          'Every recipe falls under General until you add one. Group recipes that need clearer organisation by adding a category above.'
        )}
        emptyIcon="fas fa-scroll"
        searchMissTitle={text(
          'FABRICATE.Admin.Manager.TagsCategories.NoCategoryMatches',
          'No matches for "{query}".'
        )}
        removeLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveCategory',
          'Remove category'
        )}
        removeNamedLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveCategoryNamed',
          'Remove category {name}'
        )}
        removeConfirmHint={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveCategoryConfirmHint',
          '"{name}" is used by {count} recipes. Deleting reassigns them to General.'
        )}
        confirmRemoveLabel={text('FABRICATE.Admin.Manager.TagsCategories.ConfirmRemove', 'Remove')}
        cancelRemoveLabel={text('FABRICATE.Admin.Manager.Cancel', 'Cancel')}
        describeInput={categoryHint(customCategoryRows)}
        normalize={normalizeCategory}
        successFeedback={categoryAdded}
        addFailedFeedback={text(
          'FABRICATE.Admin.Manager.TagsCategories.CategoryAddFailedFeedback',
          'Category could not be added.'
        )}
        showIcon={true}
        iconLabel={text('FABRICATE.Admin.Manager.TagsCategories.IconLabel', 'Icon')}
        iconPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.IconPlaceholder',
          'e.g. fas fa-flask'
        )}
        changeIconLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.ChangeIcon',
          'Change icon'
        )}
        saveIconLabel={text('FABRICATE.Admin.Manager.TagsCategories.SaveIcon', 'Save icon')}
        onAdd={onAddCategory}
        onRemove={(row) => onRemoveCategory(row.name)}
        onSetIcon={onSetCategoryIcon}
      />
    {:else if activeTab === 'component'}
      <VocabularyPanel
        label={text(
          'FABRICATE.Admin.Manager.TagsCategories.ComponentCategories',
          'Component categories'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoriesHint',
          'General is always available. Add custom categories to group components in the component directory. Separate from recipe categories.'
        )}
        inputId="manager-component-category-add"
        inputLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryName',
          'Component category name'
        )}
        inputPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryPlaceholder',
          'e.g. Reagent'
        )}
        addLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.AddComponentCategory',
          'Add component category'
        )}
        rowAttr="data-component-category-id"
        rows={customComponentCategoryRows}
        lockedRow={generalComponentCategory}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.SearchComponentCategories',
          'Search component categories...'
        )}
        searchLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.SearchComponentCategoriesLabel',
          'Search component categories'
        )}
        emptyTitle={text(
          'FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralComponent',
          'No component categories yet'
        )}
        emptyHint={text(
          'FABRICATE.Admin.Manager.TagsCategories.OnlyGeneralComponentHint',
          'Every component falls under General until you add one. Group your component directory by adding a category above.'
        )}
        emptyIcon="fas fa-cubes-stacked"
        searchMissTitle={text(
          'FABRICATE.Admin.Manager.TagsCategories.NoComponentCategoryMatches',
          'No matches for "{query}".'
        )}
        removeLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategory',
          'Remove component category'
        )}
        removeNamedLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategoryNamed',
          'Remove component category {name}'
        )}
        removeConfirmHint={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveComponentCategoryConfirmHint',
          '"{name}" is used by {count} components. Deleting reassigns them to General.'
        )}
        confirmRemoveLabel={text('FABRICATE.Admin.Manager.TagsCategories.ConfirmRemove', 'Remove')}
        cancelRemoveLabel={text('FABRICATE.Admin.Manager.Cancel', 'Cancel')}
        describeInput={categoryHint(customComponentCategoryRows)}
        normalize={normalizeCategory}
        successFeedback={categoryAdded}
        addFailedFeedback={text(
          'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryAddFailedFeedback',
          'Component category could not be added.'
        )}
        showIcon={true}
        iconLabel={text('FABRICATE.Admin.Manager.TagsCategories.IconLabel', 'Icon')}
        iconPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.IconPlaceholder',
          'e.g. fas fa-flask'
        )}
        changeIconLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.ChangeIcon',
          'Change icon'
        )}
        saveIconLabel={text('FABRICATE.Admin.Manager.TagsCategories.SaveIcon', 'Save icon')}
        onAdd={onAddComponentCategory}
        onRemove={(row) => onRemoveComponentCategory(row.name)}
        onSetIcon={onSetComponentCategoryIcon}
      />
    {:else}
      <VocabularyPanel
        label={text('FABRICATE.Admin.Manager.TagsCategories.ItemTags', 'Component tags')}
        hint={text(
          'FABRICATE.Admin.Manager.TagsCategories.ItemTagsHint',
          'Component tags organise components and power tag-based ingredient options in recipes. Tags are stored lowercase and can be reused across the whole system.'
        )}
        inputId="manager-tag-add"
        inputLabel={text('FABRICATE.Admin.Manager.TagsCategories.TagName', 'Tag name')}
        inputPlaceholder={text('FABRICATE.Admin.Manager.TagsCategories.TagPlaceholder', 'e.g. herb')}
        addLabel={text('FABRICATE.Admin.Manager.TagsCategories.AddTag', 'Add tag')}
        rowAttr="data-tag-id"
        rows={decoratedTagRows}
        lockedRow={null}
        searchPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.SearchTags',
          'Search item tags...'
        )}
        searchLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.SearchTagsLabel',
          'Search item tags'
        )}
        emptyTitle={text(
          'FABRICATE.Admin.Manager.TagsCategories.NoTags',
          'No component tags yet'
        )}
        emptyHint={text(
          'FABRICATE.Admin.Manager.TagsCategories.NoTagsHint',
          'Tags let a recipe require any component that carries them. Add a tag above, then apply it to components.'
        )}
        emptyIcon="fas fa-tag"
        searchMissTitle={text(
          'FABRICATE.Admin.Manager.TagsCategories.NoTagMatches',
          'No matches for "{query}".'
        )}
        removeLabel={text('FABRICATE.Admin.Manager.TagsCategories.RemoveTag', 'Remove tag')}
        removeNamedLabel={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveTagNamed',
          'Remove tag {name}'
        )}
        removeConfirmHint={text(
          'FABRICATE.Admin.Manager.TagsCategories.RemoveTagConfirmHint',
          '"{name}" is on {count} components. Deleting removes the tag from them.'
        )}
        confirmRemoveLabel={text('FABRICATE.Admin.Manager.TagsCategories.ConfirmRemove', 'Remove')}
        cancelRemoveLabel={text('FABRICATE.Admin.Manager.Cancel', 'Cancel')}
        describeInput={tagHint}
        normalize={normalizeTag}
        successFeedback={tagAdded}
        addFailedFeedback={text(
          'FABRICATE.Admin.Manager.TagsCategories.TagAddFailedFeedback',
          'Tag could not be added.'
        )}
        decorativeIcon="fas fa-tag"
        onAdd={onAddTag}
        onRemove={(row) => onRemoveTag(row.name)}
      />
    {/if}
  </section>
</main>
