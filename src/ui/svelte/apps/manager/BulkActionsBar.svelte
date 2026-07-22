<!-- Svelte 5 runes mode -->
<!--
  Multi-select bulk-actions bar for the GM component library (issue 772). Sticky at the
  TOP of `.manager-table-scroll` (the bottom is the pager), shown only when more than one
  component is selected. It mirrors the ImportFolderMappingModal's per-folder assignment
  controls — reusing the SAME shared controls — but applies ONE assignment across the whole
  selection in a single persist via the issue 771 set-apply primitive.

  Left → right: a selection summary (`N selected`), a tri-state `Select all M filtered`
  and `Clear`; a divider; a Set-category `<select>` (existing categories + inline-create
  via InlineVocabularyAdd); a Tags Add/Remove SegmentedControl over a chips + popover
  multi-assign (RecipeRoutingAssignment); `Apply`; and, after an apply, an `N updated`
  summary.

  Category is single-valued: selecting the reserved General entry CLEARS the category
  (resets to general). "Leave unchanged" ('') is the default and applies no category. Tags
  are many-valued: the mode toggle chooses whether the assigned chips are ADDED or REMOVED
  on the next Apply. Everything vocabulary-specific arrives as props; strings localize here.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { getComponentCategoryLabel } from '../../../../utils/componentCategories.js';
  import InlineVocabularyAdd from './InlineVocabularyAdd.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import RecipeRoutingAssignment from './recipe/RecipeRoutingAssignment.svelte';

  let {
    selectedCount = 0,
    filteredCount = 0,
    // Tri-state select-all: every filtered id selected, or only some.
    allFilteredSelected = false,
    someFilteredSelected = false,
    // The system's category vocabulary as [{ name, count }] (componentCategoryOptions),
    // general included and pinned last.
    categoryOptions = [],
    // The system's tag vocabulary (itemTags).
    tagVocabulary = [],
    onSelectAllFiltered = () => {},
    onClearSelection = () => {},
    // apply(mapping) → Promise<{ updated } | null>. Null signals a failure (already
    // surfaced by the store); a result carries the changed count for the summary.
    onApply = async () => null,
    // Inline CATEGORY creation, reusing the issue 689 store op (returns falsy `false` to
    // surface add-failed feedback). Tags are assign-from-existing only.
    onAddCategory = async () => {}
  } = $props();

  // Pending edit, applied on the next Apply. '' category = leave untouched; a value
  // (including the reserved general) OVERWRITES. Tags are split by mode so the Add and
  // Remove chip sets are independent; Apply sends both axes (remove-wins on overlap).
  let pendingCategory = $state('');
  let creatingCategory = $state(false);
  let tagMode = $state('add');
  let addTags = $state([]);
  let removeTags = $state([]);
  let applying = $state(false);
  let lastUpdated = $state(null);

  function text(key, fallback) {
    if (!key) return fallback ?? '';
    const translated = localize(key);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  function categoryLabel(name) {
    return getComponentCategoryLabel(name, localize);
  }

  const categorySelectOptions = $derived([
    { value: '', label: text('FABRICATE.Admin.Manager.Component.BulkCategoryLeave', 'Leave unchanged') },
    ...(Array.isArray(categoryOptions) ? categoryOptions : []).map((option) => ({
      value: option.name,
      label: `${categoryLabel(option.name)} (${option.count})`
    }))
  ]);

  const tagAssignOptions = $derived(
    (Array.isArray(tagVocabulary) ? tagVocabulary : []).map((tag) => ({ id: tag, name: `#${tag}` }))
  );

  const TAG_MODE_OPTIONS = [
    { value: 'add', labelKey: 'FABRICATE.Admin.Manager.Component.BulkTagsAdd', fallback: 'Add', icon: 'fas fa-plus' },
    { value: 'remove', labelKey: 'FABRICATE.Admin.Manager.Component.BulkTagsRemove', fallback: 'Remove', icon: 'fas fa-minus' }
  ];

  const activeTags = $derived(tagMode === 'add' ? addTags : removeTags);
  const hasPendingChange = $derived(pendingCategory !== '' || addTags.length > 0 || removeTags.length > 0);
  const applyDisabled = $derived(applying || selectedCount === 0 || !hasPendingChange);

  // The select-all checkbox reflects the current filter coverage as a tri-state: a full
  // selection is checked, a partial one indeterminate, none unchecked.
  function selectAllRef(node) {
    node.indeterminate = someFilteredSelected && !allFilteredSelected;
    return {
      update() {
        node.indeterminate = someFilteredSelected && !allFilteredSelected;
      }
    };
  }

  function setTagMode(mode) {
    tagMode = mode;
  }

  function addTag(tag) {
    lastUpdated = null;
    if (tagMode === 'add') {
      if (!addTags.includes(tag)) addTags = [...addTags, tag];
    } else if (!removeTags.includes(tag)) {
      removeTags = [...removeTags, tag];
    }
  }

  function removeTagChip(tag) {
    lastUpdated = null;
    if (tagMode === 'add') addTags = addTags.filter((t) => t !== tag);
    else removeTags = removeTags.filter((t) => t !== tag);
  }

  function setCategory(value) {
    lastUpdated = null;
    pendingCategory = value;
  }

  async function createCategory(value, icon) {
    const result = await onAddCategory(value, icon);
    if (result === false) return false;
    // The store refresh updates the vocabulary; select the freshly-created category.
    setCategory(value);
    creatingCategory = false;
    return true;
  }

  async function apply() {
    if (applyDisabled) return;
    const mapping = {};
    if (pendingCategory) mapping.category = pendingCategory;
    if (addTags.length > 0) mapping.addTags = [...addTags];
    if (removeTags.length > 0) mapping.removeTags = [...removeTags];

    applying = true;
    try {
      const result = await onApply(mapping);
      if (result) {
        lastUpdated = result.updated;
        // A successful apply consumes the pending edit; the selection is left intact so
        // the GM can run a second axis over the same set.
        pendingCategory = '';
        addTags = [];
        removeTags = [];
        creatingCategory = false;
      }
    } finally {
      applying = false;
    }
  }

  function categoryHint() {
    // A lightweight duplicate/reserved guard for the inline creator, mirroring the Tags &
    // Categories panel contract (blocked on empty/duplicate/reserved). `general` is the
    // reserved base category.
    return (rawValue) => {
      const value = String(rawValue || '').trim();
      if (!value) return { tone: '', message: '', blocked: true };
      const lower = value.toLowerCase();
      if (lower === 'general') {
        return {
          tone: 'danger',
          message: text(
            'FABRICATE.Admin.Manager.TagsCategories.GeneralReservedFeedback',
            'General is already available as the base category.'
          ),
          blocked: true
        };
      }
      const known = (Array.isArray(categoryOptions) ? categoryOptions : []).some(
        (option) => String(option.name).toLowerCase() === lower
      );
      if (known) {
        return {
          tone: 'danger',
          message: text(
            'FABRICATE.Admin.Manager.TagsCategories.DuplicateCategoryFeedback',
            'That category already exists.'
          ),
          blocked: true
        };
      }
      return {
        tone: 'success',
        message: format(
          'FABRICATE.Admin.Manager.TagsCategories.ReadyToAddCategory',
          'Ready to add "{name}".',
          { name: value }
        ),
        blocked: false
      };
    };
  }
</script>

<section class="manager-bulk-actions-bar" data-bulk-actions-bar aria-label={text('FABRICATE.Admin.Manager.Component.BulkActions', 'Bulk actions')}>
  <div class="manager-bulk-actions-selection">
    <span class="manager-bulk-actions-count" data-bulk-selected-count>
      {format('FABRICATE.Admin.Manager.Component.BulkSelectedCount', '{count} selected', { count: selectedCount })}
    </span>
    <label class="manager-bulk-actions-select-all">
      <input
        type="checkbox"
        data-bulk-select-all
        checked={allFilteredSelected}
        use:selectAllRef
        onchange={() => (allFilteredSelected ? onClearSelection() : onSelectAllFiltered())}
      />
      <span>{format('FABRICATE.Admin.Manager.Component.BulkSelectAllFiltered', 'Select all {count} filtered', { count: filteredCount })}</span>
    </label>
    <button type="button" class="manager-button is-subtle" data-bulk-clear onclick={onClearSelection}>
      <i class="fas fa-xmark" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Component.BulkClear', 'Clear')}</span>
    </button>
  </div>

  <span class="manager-bulk-actions-divider" aria-hidden="true"></span>

  <div class="manager-bulk-actions-controls">
    <div class="manager-bulk-actions-field manager-bulk-actions-category">
      <label class="manager-field">
        <span>{text('FABRICATE.Admin.Manager.Component.BulkSetCategory', 'Set category')}</span>
        <select
          data-bulk-category
          value={pendingCategory}
          onchange={(event) => setCategory(event.currentTarget.value)}
        >
          {#each categorySelectOptions as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      <button
        type="button"
        class="manager-button is-subtle manager-bulk-actions-new-category"
        data-bulk-new-category
        aria-pressed={creatingCategory}
        onclick={() => (creatingCategory = !creatingCategory)}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Component.BulkNewCategory', 'New')}</span>
      </button>
    </div>

    <div class="manager-bulk-actions-field manager-bulk-actions-tags">
      <span class="manager-bulk-actions-tags-label">{text('FABRICATE.Admin.Manager.Component.BulkTags', 'Tags')}</span>
      <SegmentedControl
        options={TAG_MODE_OPTIONS}
        value={tagMode}
        onChange={setTagMode}
        groupName="bulk-tag-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Component.BulkTagModeLabel', 'Add or remove tags')}
        dataAttr="data-bulk-tag-mode"
        optionDataAttr="data-bulk-tag-mode-option"
      />
      <RecipeRoutingAssignment
        options={tagAssignOptions}
        selectedIds={activeTags}
        addLabel={text('FABRICATE.Admin.Manager.Component.BulkAddTag', 'Choose tag')}
        placeholder={text('FABRICATE.Admin.Manager.Component.BulkSearchTags', 'Search tags...')}
        emptyHint={text('FABRICATE.Admin.Manager.Component.BulkNoTags', 'No tags yet — create them in Tags & Categories.')}
        onAdd={addTag}
        onRemove={removeTagChip}
      />
    </div>

    <button
      type="button"
      class="manager-button is-primary manager-bulk-actions-apply"
      data-bulk-apply
      disabled={applyDisabled}
      onclick={apply}
    >
      <i class="fas fa-check" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Component.BulkApply', 'Apply')}</span>
    </button>

    {#if lastUpdated !== null}
      <span class="manager-bulk-actions-result" data-bulk-result role="status">
        {format('FABRICATE.Admin.Manager.Component.BulkUpdated', '{count} components updated', { count: lastUpdated })}
      </span>
    {/if}
  </div>

  {#if creatingCategory}
    <div class="manager-bulk-actions-create" data-bulk-create-category>
      <InlineVocabularyAdd
        inputId="bulk-new-category"
        inputLabel={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryName', 'Component category name')}
        inputPlaceholder={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryPlaceholder', 'e.g. Reagent')}
        addLabel={text('FABRICATE.Admin.Manager.TagsCategories.AddComponentCategory', 'Add component category')}
        describeInput={categoryHint()}
        normalize={(value) => String(value || '').trim()}
        successFeedback={() => text('FABRICATE.Admin.Manager.TagsCategories.CategoryAddedFeedback', 'Category added.')}
        addFailedFeedback={text('FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryAddFailedFeedback', 'Component category could not be added.')}
        onAdd={(value) => createCategory(value)}
      />
    </div>
  {/if}
</section>

<style>
  .manager-bulk-actions-bar {
    position: sticky;
    top: 0;
    z-index: 5;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3);
    margin-bottom: var(--fab-space-2);
    border: 1px solid var(--fab-mv2-border);
    border-radius: 10px;
    background: var(--fab-mv2-surface-3, var(--fab-surface-active));
    box-shadow: var(--fab-shadow-sm);
  }

  .manager-bulk-actions-selection,
  .manager-bulk-actions-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-bulk-actions-count {
    font-weight: 600;
    color: var(--fab-mv2-text);
  }

  .manager-bulk-actions-select-all {
    display: inline-flex;
    align-items: center;
    gap: var(--fab-space-1);
    font-size: 0.76rem;
    color: var(--fab-mv2-text-secondary, var(--fab-text-secondary));
  }

  .manager-bulk-actions-select-all input {
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--fab-mv2-accent);
    cursor: pointer;
  }

  .manager-bulk-actions-divider {
    width: 1px;
    align-self: stretch;
    background: var(--fab-mv2-border);
  }

  .manager-bulk-actions-field {
    display: flex;
    align-items: flex-end;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  .manager-bulk-actions-tags {
    align-items: center;
  }

  .manager-bulk-actions-tags-label {
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.02em;
    color: var(--fab-mv2-text-secondary, var(--fab-text-secondary));
  }

  .manager-bulk-actions-category :global(select) {
    min-width: 150px;
  }

  .manager-bulk-actions-result {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--fab-mv2-accent, var(--fab-accent));
  }

  .manager-bulk-actions-create {
    flex: 1 1 100%;
  }
</style>
