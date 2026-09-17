<!--
  Folder-aware bulk-import mapping step (issue 771), opened before a folder or whole-pack drop
  commits: it lists the detected folders with their item counts and lets the GM assign — or inline
  create — a category and tags per folder, or skip one. Match-by-name is ON by default and pre-fills
  each row; the primary `Import N items` commits, and its count updates live as folders are skipped.

  The dialog chrome comes from the shared `ManagerModal` primitive (issue 877), so this modal and
  the post-import reference report are ONE implementation of "manager modal dialog"; this file owns
  only the mapping body, and each row mirrors the compact `RecipeRoutingAssignment` +
  `SearchablePopover` "assign X per Y" pattern.
-->
<script>
  import Field from '../../components/Field.svelte';
  import Chip from '../../components/Chip.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { matchFolderNameToVocabulary } from '../../../../utils/matchFolderVocabulary.js';
  import InlineVocabularyAdd from './InlineVocabularyAdd.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import ManagerModal from './ManagerModal.svelte';
  import RecipeRoutingAssignment from './recipe/RecipeRoutingAssignment.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import Select from '../../components/Select.svelte';

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

  // THE GENERAL BUCKET IS THE SENTINEL ROW (issue 1510): its value is `''`, and `Select` stamps
  // `data-popover-option="__unchanged__"` on any such row, because `SearchablePopover` omits the
  // attribute for a falsy `dataId` and the row a driver most needs to click would have no handle.
  // Every mounted assertion and capture step that clicks General must use that literal.

  // The caption id, per ROW: the modal renders one category control per detected folder, so a
  // single component-level id would name every trigger in the list the same way.
  const instanceId = $props.id();

  /** The document-unique id of one folder row's category caption. */
  function categoryCaptionId(rowIndex) {
    return `${instanceId}-category-${rowIndex}`;
  }

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

  // Every existing tag, UNFILTERED, which IS `RecipeRoutingAssignment`'s contract: it derives its
  // own picker from `options` beside `selectedIds`. Filtering here would be a divergent copy of
  // that rule and would break the selected chips, whose labels resolve back through `options`.
  function tagOptionsFor(_state) {
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
    <!-- The manager's ONE selection control (issue 772), in place of a raw checkbox wearing
         Foundry's default control chrome. -->
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
            <ManagerButton
              class={`is-subtle manager-import-mapping-skip ${row.state.skipped ? 'is-active' : ''}`}
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
            </ManagerButton>
          </div>

          {#if !row.state.skipped}
            <div class="manager-import-mapping-controls">
              <!-- A `Field as="div"` RATHER THAN `as="label"` (issue 1510): the wrapper keeps its
                   class but must stop naming the trigger by containment, because a `<label>`
                   forwards a caption click into a control whose panel is dismissed on `mousedown`
                   while open. The caption is pointed at instead. -->
              <Field as="div" class="manager-import-mapping-category">
                <span id={categoryCaptionId(row.index)}
                  >{text('FABRICATE.Admin.Items.ImportMapping.Category', 'Category')}</span
                >
                <Select
                  value={row.state.category}
                  options={categorySelectOptions}
                  showTick={false}
                  ariaLabelledBy={categoryCaptionId(row.index)}
                  triggerData={{ 'data-import-mapping-category': '' }}
                  onChange={(next) => setCategory(row.index, next)}
                />
              </Field>
              <ManagerButton
                class="is-subtle manager-import-mapping-new-category"
                data-import-mapping-new-category
                onclick={() =>
                  (creatingCategoryFor = creatingCategoryFor === row.index ? -1 : row.index)}
              >
                <i class="fas fa-plus" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Items.ImportMapping.NewCategory', 'New')}</span>
              </ManagerButton>

              <RecipeRoutingAssignment
                options={tagOptionsFor(row.state)}
                selectedIds={row.state.tags}
                label={text('FABRICATE.Admin.Items.ImportMapping.Tags', 'Tags')}
                addLabel={text('FABRICATE.Admin.Items.ImportMapping.AddTag', 'Add tag')}
                placeholder={text(
                  'FABRICATE.Admin.Items.ImportMapping.SearchTags',
                  'Search tags...'
                )}
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
                    text(
                      'FABRICATE.Admin.Manager.TagsCategories.CategoryAddedFeedback',
                      'Category added.'
                    )}
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
    <ManagerButton data-import-mapping-cancel onclick={() => onClose()}>
      {text('FABRICATE.Admin.Manager.Cancel', 'Cancel')}
    </ManagerButton>
    <ManagerButton
      role="primary"
      data-import-mapping-commit
      disabled={importDisabled}
      onclick={commit}
    >
      <i class="fas fa-file-import" aria-hidden="true"></i>
      <span>
        {commitLabel(importCount)}
      </span>
    </ManagerButton>
  {/snippet}
</ManagerModal>

<style>
  /* One control scale for the whole dialog (issue 772): it is dense, and it sits between surfaces
     that read at `--fab-recipe-control-font`, so the manager's default body size made it both the
     largest type on screen and the one with the least room for it. */
  .manager-import-mapping-match {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: var(--fab-recipe-control-font);
    color: var(--fab-text-secondary);
  }

  /* The row's inline actions are secondary to the dialog's Cancel and Import, which keep the
     default 34px so the commit action stays the heaviest thing in the footer.

     RE-CHAINED, and split in two, at the conversion (issue 1118). `:global()` is load-bearing: the
     row carries this component's hash and the buttons inside it do not. At (0,3,0) this rule TIED
     the primitive's own compound and kept its 28px only on injection order, so naming that class
     takes it to (0,4,0). The SECOND selector is the half a plain re-chain would have broken: the
     "Add tag" control is a `SearchablePopover` trigger from a `triggerClass` STRING and will never
     carry `fab-manager-button`, so it is named by its own trigger class instead. */
  .manager-import-mapping-row :global(.manager-button.fab-manager-button),
  .manager-import-mapping-row :global(.manager-button.manager-recipe-routing-add-trigger) {
    min-height: 28px;
    padding: 0 var(--fab-space-2);
    font-size: var(--fab-recipe-control-font);
  }

  /* `InlineVocabularyAdd`'s Add is `role="primary"`, whose companion rule ties the one above at
     (0,4,0) and is settled by injection order, so the row's compact padding is restated one class
     higher. Only `padding`: the other two are uncontested. */
  .manager-import-mapping-row :global(.manager-button.fab-manager-button.is-primary) {
    padding: 0 var(--fab-space-2);
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

  /* The field labels read as the bulk rail's micro-labels rather than as body text: the two
     surfaces caption the same vocabulary and sat at two different scales. */
  .manager-import-mapping-controls :global(.manager-field > span) {
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--fab-text-muted);
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

  /* ONE RULE, ON THE TRIGGER (issue 1510), where this was two blocks with the identical selector,
     both element-typed against a `<select>` this row no longer renders — an element-typed leg in a
     scoped block dies SILENTLY on conversion and no gate sees it. `:global(...)` chained with
     `.manager-field`, because a scoped rule cannot reach a class handed to a child, and the
     compound restores the (0,2,0) the scoped form had.

     THE FLOOR IS WHAT KEEPS THE ROW STILL: the controls row is `flex-wrap` with
     `align-items: flex-end`, so the trigger hugs its value, and without a floor choosing General
     after a long category name would shrink the control and re-flow the New button beside it.
     AND THE FLOOR DECIDES THE PANEL'S CEILING, which is the accepted cost of the hug: with neither
     bound stated the `form` rung's 240/340 applies, so the panel never widens with the list and a
     long enough category name ellipsises. Accepted rather than fixed, since raising `maxWidth`
     cannot help while the trigger is the floor and the categories are world-authored. No View Lab
     case can photograph it — the modal opens only on a drop — so
     `tests/components/manager-select-conversion-rendered.test.js` measures it. */
  :global(.manager-field.manager-import-mapping-category .fabricate-select-trigger) {
    min-width: 140px;
    font-size: var(--fab-recipe-control-font);
  }

  /* The real control is 1px and transparent, so the ring is drawn on the visible box.
     `SelectionCheckbox` scopes its own ring to the `<label>` IT renders, which this host opts out
     of with `wrapper="contents"`, so the host draws it — reaching in with `:global()`, which the
     adjacent-sibling form makes sufficient. */
  .manager-import-mapping-match :global(.fab-selection-input:focus-visible + .fab-selection-check) {
    outline: 2px solid var(--fab-accent);
    outline-offset: 2px;
  }
</style>
