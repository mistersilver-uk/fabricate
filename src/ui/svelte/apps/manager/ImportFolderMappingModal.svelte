<!-- Svelte 5 runes mode -->
<!--
  Folder-aware bulk-import mapping step (issue 771). Opened before a folder / whole-pack
  drop commits: it lists the folders detected in the drop, each with its item count, and
  lets the GM assign (or inline-create) a category and/or tags per folder — or skip a
  folder — before importing.

  The dialog chrome — portal into `.fabricate-manager`, centring, the compact title +
  subtitle, the round close control, and the footer rail — comes from the shared
  `ManagerModal` primitive (issue 877), so this modal and the post-import reference
  report are ONE implementation of "manager modal dialog" rather than two. This file
  owns only the mapping body. Each per-folder row mirrors the compact
  RecipeRoutingAssignment + SearchablePopover "assign X per Y" pattern: a folder name, a
  `tabular-nums` item-count badge, a category `<select>` with an inline "＋ New" (the
  shared InlineVocabularyAdd), a tags multi-assign (RecipeRoutingAssignment chips +
  popover), and a per-row Skip.

  Match-by-name (ON by default) pre-fills each row from the folder name; the primary
  "Import N items" button commits the pre-filled assignments, and the count updates live
  as folders are skipped (a skipped folder's items are excluded from the import).
-->
<script>
  import Chip from './Chip.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { matchFolderNameToVocabulary } from '../../../../utils/matchFolderVocabulary.js';
  import InlineVocabularyAdd from './InlineVocabularyAdd.svelte';
  import ManagerModal from './ManagerModal.svelte';
  import RecipeRoutingAssignment from './recipe/RecipeRoutingAssignment.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';

  let {
    open = false,
    folders = [],
    // System vocabularies (live; updated by the store after an inline create).
    componentCategories = [],
    itemTags = [],
    // Inline CATEGORY creation, reusing the issue 689 store op. Returns truthy on success
    // (or `false` to surface add-failed feedback in InlineVocabularyAdd). Tags are
    // assign-from-existing only (Design G) — a new tag is created in Tags & Categories.
    onAddCategory = async () => {},
    // commit(decisions) — decisions is [{ folderId, folderName, itemUuids, category, addTags }]
    // for the NON-skipped rows only. category '' means "no category assignment".
    onCommit = () => {},
    onClose = () => {},
  } = $props();

  // Per-folder assignment state, keyed by folder-group index (folderId can be null for
  // the whole-pack unfiled group, so the index is the stable key).
  let assignments = $state([]);
  let matchByName = $state(true);
  let creatingCategoryFor = $state(-1);
  let matchToggle = $state(null);

  function text(key, fallback) {
    if (!key) return fallback ?? '';
    const translated = localize(key);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  // Localized item count with a singular form (house pattern: VocabularyPanel's
  // UsageCountSingular), so a one-item folder reads "1 item", not "1 items".
  function itemCountLabel(count) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Items.ImportMapping.ItemCountSingular'
        : 'FABRICATE.Admin.Items.ImportMapping.ItemCount';
    return text(key, count === 1 ? '{count} item' : '{count} items').replace('{count}', count);
  }

  function commitLabel(count) {
    const key =
      count === 1
        ? 'FABRICATE.Admin.Items.ImportMapping.CommitSingular'
        : 'FABRICATE.Admin.Items.ImportMapping.Commit';
    return text(key, count === 1 ? 'Import {count} item' : 'Import {count} items').replace(
      '{count}',
      count
    );
  }

  // (Re)seed assignments whenever the drop's folders change. Match-by-name pre-fills the
  // category/tags from the folder name; with it off, rows start empty (today's behavior).
  function seedAssignments() {
    assignments = (folders || []).map((group) => {
      if (!matchByName) return { category: '', tags: [], skipped: false };
      const match = matchFolderNameToVocabulary(group.folderName, {
        componentCategories,
        itemTags,
      });
      return {
        category: match.category || '',
        tags: match.tag ? [match.tag] : [],
        skipped: false,
      };
    });
  }

  // Re-seed on open and when the folder set identity changes, not on every vocab tick.
  let seededKey = '';
  $effect(() => {
    const key = `${open}|${(folders || []).map((g) => `${g.folderId}:${g.itemCount}`).join(',')}`;
    if (key === seededKey) return;
    seededKey = key;
    if (open) {
      matchByName = true;
      creatingCategoryFor = -1;
      seedAssignments();
      // Land keyboard focus on the match-by-name toggle after the portaled node mounts.
      queueMicrotask(() => matchToggle?.focus?.());
    }
  });

  // The reserved General bucket leads; custom categories follow. General's value is ''
  // (no explicit category assignment) — imported components already default to general.
  const categorySelectOptions = $derived([
    { value: '', label: text('FABRICATE.Common.General', 'General') },
    ...(componentCategories || []).map((category) => ({ value: category, label: category })),
  ]);

  const activeRows = $derived(
    (folders || []).map((group, index) => ({
      group,
      index,
      state: assignments[index] || { category: '', tags: [], skipped: false },
    }))
  );

  // Live count: items across every non-skipped folder.
  const importCount = $derived(
    activeRows.reduce((sum, row) => (row.state.skipped ? sum : sum + (row.group.itemCount || 0)), 0)
  );
  const importDisabled = $derived(importCount === 0);

  function tagOptionsFor(state) {
    // Existing tags not yet assigned to this row (RecipeRoutingAssignment shape).
    return (itemTags || []).map((tag) => ({ id: tag, name: `#${tag}` }));
  }

  function setCategory(index, value) {
    assignments[index] = { ...assignments[index], category: value };
  }

  function addTag(index, tag) {
    const current = assignments[index].tags || [];
    if (current.includes(tag)) return;
    assignments[index] = { ...assignments[index], tags: [...current, tag] };
  }

  function removeTag(index, tag) {
    const current = assignments[index].tags || [];
    assignments[index] = { ...assignments[index], tags: current.filter((t) => t !== tag) };
  }

  function toggleSkip(index) {
    assignments[index] = { ...assignments[index], skipped: !assignments[index].skipped };
  }

  function toggleMatchByName() {
    matchByName = !matchByName;
    seedAssignments();
  }

  async function createCategory(index, value, icon) {
    const result = await onAddCategory(value, icon);
    if (result === false) return false;
    // The store refresh updates componentCategories; select the freshly-created one.
    setCategory(index, value);
    creatingCategoryFor = -1;
    return true;
  }

  function commit() {
    const decisions = activeRows
      .filter((row) => !row.state.skipped)
      .map((row) => ({
        folderId: row.group.folderId,
        folderName: row.group.folderName,
        itemUuids: row.group.itemUuids || [],
        category: row.state.category || '',
        addTags: row.state.tags || [],
      }));
    onCommit(decisions);
  }

  function categoryHint() {
    // A lightweight duplicate/reserved guard for the inline category creator, mirroring
    // the Tags & Categories panel's contract (blocked on empty/duplicate/reserved).
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
          blocked: true,
        };
      }
      if ((componentCategories || []).some((c) => String(c).toLowerCase() === lower)) {
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
</script>

<ManagerModal
  {open}
  title={text('FABRICATE.Admin.Items.ImportMapping.Title', 'Categorize imported folders')}
  subtitle={text(
    'FABRICATE.Admin.Items.ImportMapping.Subtitle',
    'Assign a category and tags to each detected folder, or skip it.'
  )}
  closeLabel={text('FABRICATE.Admin.ImportReport.Close', 'Close')}
  rootAttributes={{ 'data-import-mapping': '' }}
  {onClose}
>
  {#snippet body()}
    <!-- The manager's ONE selection control (issue 772). This was a raw checkbox wearing
         Foundry's default control chrome, which is exactly the inconsistency the shared
         primitive exists to remove — and it sat one dialog away from the component
         browser's rows, which now render through the same component. -->
    <label class="manager-import-mapping-match" data-import-mapping-match>
      <SelectionCheckbox
        size="sm"
        wrapper="contents"
        bind:input={matchToggle}
        checked={matchByName}
        ariaLabel={text(
          'FABRICATE.Admin.Items.ImportMapping.MatchByName',
          'Match folder names to existing categories and tags'
        )}
        onChange={toggleMatchByName}
      />
      <span>
        {text(
          'FABRICATE.Admin.Items.ImportMapping.MatchByName',
          'Match folder names to existing categories and tags'
        )}
      </span>
    </label>

    <div class="manager-import-mapping-list">
      {#each activeRows as row (row.index)}
        <div
          class={`manager-import-mapping-row ${row.state.skipped ? 'is-skipped' : ''}`}
          data-import-mapping-row={row.group.folderId ?? `unfiled-${row.index}`}
        >
          <div class="manager-import-mapping-row-head">
            <span class="manager-import-mapping-folder">
              <i class="fas fa-folder" aria-hidden="true"></i>
              <strong>{row.group.folderName}</strong>
            </span>
            <!-- "12 items" is a PHRASE, so it stays in the UI face rather than taking the
                 `mono` prop; only the figures inside it need to stop shifting width. -->
            <Chip
              class="manager-import-mapping-count"
              data-import-mapping-count
              style="font-variant-numeric: tabular-nums;"
            >
              {itemCountLabel(row.group.itemCount)}
            </Chip>
            <button
              type="button"
              class={`manager-button is-subtle manager-import-mapping-skip ${row.state.skipped ? 'is-active' : ''}`}
              data-import-mapping-skip
              aria-pressed={row.state.skipped}
              onclick={() => toggleSkip(row.index)}
            >
              <i class={row.state.skipped ? 'fas fa-rotate-left' : 'fas fa-ban'} aria-hidden="true"
              ></i>
              <span>
                {row.state.skipped
                  ? text('FABRICATE.Admin.Items.ImportMapping.Unskip', 'Include')
                  : text('FABRICATE.Admin.Items.ImportMapping.Skip', 'Skip')}
              </span>
            </button>
          </div>

          {#if !row.state.skipped}
            <div class="manager-import-mapping-controls">
              <label class="manager-field manager-import-mapping-category">
                <span>{text('FABRICATE.Admin.Items.ImportMapping.Category', 'Category')}</span>
                <select
                  data-import-mapping-category
                  value={row.state.category}
                  onchange={(event) => setCategory(row.index, event.currentTarget.value)}
                >
                  {#each categorySelectOptions as option (option.value)}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </label>
              <button
                type="button"
                class="manager-button is-subtle manager-import-mapping-new-category"
                data-import-mapping-new-category
                onclick={() =>
                  (creatingCategoryFor = creatingCategoryFor === row.index ? -1 : row.index)}
              >
                <i class="fas fa-plus" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Items.ImportMapping.NewCategory', 'New')}</span>
              </button>

              <RecipeRoutingAssignment
                options={tagOptionsFor(row.state)}
                selectedIds={row.state.tags}
                label={text('FABRICATE.Admin.Items.ImportMapping.Tags', 'Tags')}
                addLabel={text('FABRICATE.Admin.Items.ImportMapping.AddTag', 'Add tag')}
                placeholder={text('FABRICATE.Admin.Items.ImportMapping.SearchTags', 'Search tags...')}
                emptyHint={text(
                  'FABRICATE.Admin.Items.ImportMapping.NoTags',
                  'No tags yet — create them in Tags & Categories.'
                )}
                onAdd={(tag) => addTag(row.index, tag)}
                onRemove={(tag) => removeTag(row.index, tag)}
              />
            </div>

            {#if creatingCategoryFor === row.index}
              <div class="manager-import-mapping-create" data-import-mapping-create-category>
                <InlineVocabularyAdd
                  inputId={`import-mapping-new-category-${row.index}`}
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
                  describeInput={categoryHint()}
                  normalize={(value) => String(value || '').trim()}
                  successFeedback={() =>
                    text('FABRICATE.Admin.Manager.TagsCategories.CategoryAddedFeedback', 'Category added.')}
                  addFailedFeedback={text(
                    'FABRICATE.Admin.Manager.TagsCategories.ComponentCategoryAddFailedFeedback',
                    'Component category could not be added.'
                  )}
                  onAdd={(value) => createCategory(row.index, value)}
                />
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet footer()}
    <button type="button" class="manager-button" data-import-mapping-cancel onclick={() => onClose()}>
      {text('FABRICATE.Admin.Manager.Cancel', 'Cancel')}
    </button>
    <button
      type="button"
      class="manager-button is-primary"
      data-import-mapping-commit
      disabled={importDisabled}
      onclick={commit}
    >
      <i class="fas fa-file-import" aria-hidden="true"></i>
      <span>
        {commitLabel(importCount)}
      </span>
    </button>
  {/snippet}
</ManagerModal>

<style>
  /*
    One control scale for the whole dialog (issue 772).

    Every control in here rendered at the manager's default body size while the surfaces
    it sits between — the components toolbar it is launched from, and the bulk edit rail
    beside it — read at `--fab-recipe-control-font`. The dialog is dense (a row per
    detected folder, each with a select, a chip, and three buttons), so it was both the
    largest type on screen and the one with the least room for it.
  */
  .manager-import-mapping-match {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: var(--fab-recipe-control-font);
    color: var(--fab-text-secondary);
  }

  /* The row's inline actions — Skip / New / Add tag — are secondary to the dialog's own
     Cancel and Import, which keep the default 34px so the commit action stays the
     heaviest thing in the footer. */
  .manager-import-mapping-row :global(.manager-button) {
    min-height: 28px;
    padding: 0 var(--fab-space-2);
    font-size: var(--fab-recipe-control-font);
  }

  .manager-import-mapping-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .manager-import-mapping-row {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding: var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 10px;
    background: var(--fab-surface-soft);
  }

  .manager-import-mapping-row.is-skipped {
    opacity: 0.55;
  }

  .manager-import-mapping-row-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
  }

  .manager-import-mapping-folder {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    flex: 1;
    color: var(--fab-text);
    font-size: var(--fab-recipe-control-font);
  }

  /* The field labels read as the bulk rail's micro-labels rather than as body text: the
     two surfaces sit side by side and were captioning the same vocabulary — a category
     and a tag set — at two different scales. This also settles an inconsistency inside
     the dialog itself, where "Category" was sentence case beside an uppercase "TAGS". */
  .manager-import-mapping-controls :global(.manager-field > span) {
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fab-text-muted);
  }

  .manager-import-mapping-category select {
    font-size: var(--fab-recipe-control-font);
  }

  .manager-import-mapping-folder strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-import-mapping-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--fab-space-2);
  }

  .manager-import-mapping-category select {
    min-width: 140px;
  }
</style>
