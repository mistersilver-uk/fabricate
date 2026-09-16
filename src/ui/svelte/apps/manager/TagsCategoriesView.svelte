<!-- Svelte 5 runes mode -->
<!--
  The Tags & Categories screen (issue 689): a tabbed screen over the three
  independent vocabularies — recipe categories, component categories, and item
  tags. One tab is shown at a time; each tab owns its own search, live-validated
  add form, and rows. The right inspector rail (stat tiles, contextual help,
  reference-safe reassurance) lives in the shared manager inspector slot in
  CraftingSystemManagerRoot, not here.

  The strip uses the shared `.manager-editor-tab*` treatment every other manager tab
  bar uses (issue 878) rather than its own vocabulary-only look, and the view renders
  NO page header of its own — the shell's `.manager-header` is the only one.

  Since issue 1429 the strip is not authored here at all: it is `VocabularyTabs`, a thin
  caller of the shared `EditorTabs` primitive. It was the LAST hand-rolled manager tab strip,
  and it survived issue 1038's sweep only because it was inlined in this view rather than
  standing as its own component — so converting it meant extracting it first. This view keeps
  the two things that are genuinely its own: which tab is active, and which panel that renders.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import VocabularyPanel from './VocabularyPanel.svelte';
  import VocabularyTabs from './VocabularyTabs.svelte';

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
    // The three vocabulary panels' lifted search terms (issue 1438), owned by the root. The
    // three panels are mutually exclusive branches below, so switching tab unmounts one and
    // mounts another; a slot held HERE would still die when this whole view unmounts on a
    // route change, which is the other half of the same defect.
    recipeCategoryBrowserState = $bindable(null),
    componentCategoryBrowserState = $bindable(null),
    componentTagBrowserState = $bindable(null),
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const generalCategory = $derived(
    (categoryRows || []).find((row) => row.id === 'general') || null
  );
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
  <!-- No per-view page header: the shell's `.manager-header` already renders the
       "Tags & Categories" title and its subtitle, so a second one restated the title
       inside the panel. Removed for the same reason as the components and recipes
       libraries (issue 676) and Books & Scrolls (issue 785). -->
  <!-- The strip, which this view no longer authors (issue 1429). `VocabularyTabs` renders it
       through the shared `EditorTabs` primitive, which emits the SAME `<div role="tablist">`
       host this view used to — a `<div>` and not a `<nav>`, because `role="tablist"` on a
       `<nav>` overrides its implicit `navigation` landmark and the compiler reports it, while a
       `<div>` has no implicit role to conflict with. The ids, the `data-vocabulary-tab` hook and
       both classes are unchanged, so the View Lab's `#vocabulary-tab-*` steps, the smoke
       harness's `[data-vocabulary-tab]` locator and `.manager-vocabulary-tabs` in
       `styles/fabricate.css` all still resolve.

       The counts are whole-vocabulary totals, General included — the same total the panel's own
       entry chip and the inspector's at-a-glance tile report (issue 878) — and they are RECORD
       COUNTS, so `VocabularyTabs` draws them on the Rail Marker Family's count vehicle rather
       than through the neutral chip this view used to pass. See that file for why. -->
  <VocabularyTabs
    {activeTab}
    recipeCategoryCount={counts.recipeCategories || 0}
    componentCategoryCount={counts.componentCategories || 0}
    tagCount={counts.itemTags || 0}
    onSelect={onTabChange}
  />

  <!-- Same rule for the panel: an `aria-label` promotes a `<section>` from generic to
       the `region` landmark, which `role="tabpanel"` then overrides. A `<div>` has
       nothing to override. The panel is named by ITS OWN TAB rather than by a standalone
       label — matching `KnowledgeView`, `RecipeEditView` and `ChecksView` — so the
       accessible name tracks the tab the reader just activated. -->
  <div
    class="manager-tags-categories-workspace"
    role="tabpanel"
    id={`vocabulary-panel-${activeTab}`}
    aria-labelledby={`vocabulary-tab-${activeTab}`}
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
          'Only General so far'
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
        changeIconLabel={text('FABRICATE.Admin.Manager.TagsCategories.ChangeIcon', 'Change icon')}
        onAdd={onAddCategory}
        onRemove={(row) => onRemoveCategory(row.name)}
        onSetIcon={onSetCategoryIcon}
        bind:browserState={recipeCategoryBrowserState}
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
          'Only General so far'
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
        changeIconLabel={text('FABRICATE.Admin.Manager.TagsCategories.ChangeIcon', 'Change icon')}
        onAdd={onAddComponentCategory}
        onRemove={(row) => onRemoveComponentCategory(row.name)}
        onSetIcon={onSetComponentCategoryIcon}
        bind:browserState={componentCategoryBrowserState}
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
        inputPlaceholder={text(
          'FABRICATE.Admin.Manager.TagsCategories.TagPlaceholder',
          'e.g. herb'
        )}
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
        emptyTitle={text('FABRICATE.Admin.Manager.TagsCategories.NoTags', 'No component tags yet')}
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
        bind:browserState={componentTagBrowserState}
      />
    {/if}
  </div>
</main>
