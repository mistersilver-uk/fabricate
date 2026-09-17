<!--
  One vocabulary tab of the Tags & Categories screen: a description, a live-validated add form, a
  search and entry-count row, and the row grid with per-category icons and an inline delete-confirm
  strip. A row's icon IS the shared searchable `IconPicker` trigger (issue 878), and choosing an
  option commits immediately.

  Extracted when the screen gained its THIRD vocabulary (issue 676) and redesigned into a tabbed
  screen (issue 689): the three tabs are structurally identical over independent vocabularies, so a
  third copy-paste block would have been ~50 duplicated lines, over Sonar's new-code budget.

  Everything vocabulary-SPECIFIC is a prop — the reserved row (`lockedRow`), the live hint machine
  (`describeInput`), icons (`showIcon`) and the row hook name (`rowAttr`), so three tabs do not
  collide on one selector. Two knobs are per-ROW rather than per-panel (issue 1392), because they
  vary row by row on one surface: `row.confirmTokens` and `row.silentlyDeletable`. Both default to
  today's rendering, so the two shipped call sites are byte-identical.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import IconPicker from '../../components/IconPicker.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import InlineVocabularyAdd from './InlineVocabularyAdd.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';
  import IconButton from '../../components/IconButton.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import { createVocabularyBrowserState } from '../../../../utils/managerBrowserViewState.js';

  let {
    label = '',
    hint = '',
    inputId = '',
    inputLabel = '',
    inputPlaceholder = '',
    addLabel = '',
    rowAttr = 'data-category-id',
    rows = [],
    lockedRow = null,
    emptyTitle = '',
    emptyHint = '',
    emptyIcon = 'fas fa-cubes-stacked',
    searchPlaceholder = '',
    searchLabel = '',
    searchMissTitle = '',
    removeLabel = '',
    removeNamedLabel = '',
    // Live hint machine: (rawValue) => { tone: 'info'|'success'|'danger'|'', message, blocked }.
    // `blocked` refuses submit; `tone` drives the hint styling and icon.
    describeInput = () => ({ tone: '', message: '', blocked: false }),
    // Normalizes the raw input to the value handed to onAdd.
    normalize = (value) => String(value || '').trim(),
    successFeedback = () => '',
    addFailedFeedback = '',
    onAdd = () => {},
    onRemove = () => {},
    // Per-category icon (issue 689): opt-in for the two category tabs.
    showIcon = false,
    // A fixed, non-editable accent tile for a vocabulary with no persisted per-row icon: the same
    // leading tile as the category tabs, decorative only.
    decorativeIcon = '',
    iconLabel = '',
    defaultIcon = 'fas fa-folder',
    changeIconLabel = '',
    lockedHint = '',
    removeConfirmHint = '',
    confirmRemoveLabel = '',
    cancelRemoveLabel = '',
    onSetIcon = () => {},
    // THE SEARCH IS LIFTED (issue 1438), and each caller binds its OWN slot, because the three
    // vocabularies are mutually exclusive branches of one tabbed surface and "herb" names a tag
    // and nothing next door. `pendingRemovalId` below is deliberately NOT lifted: an armed
    // destructive confirmation that outlives its surface is a delete the GM did not re-confirm.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createVocabularyBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const searchTerm = $derived(String(ui.searchTerm || ''));
  let pendingRemovalId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredRows = $derived((rows || []).filter((row) => matchesSearch(row)));
  const hasQuery = $derived(Boolean(normalizedSearchTerm));
  const customRowCount = $derived((rows || []).length);
  // The whole vocabulary, independent of the search query: it reports the library size, not the
  // filter, and counts General even where it is deliberately not listed, which is what keeps this
  // chip, the tab badge and the inspector's tile on one number (issue 878).
  const entryCount = $derived(customRowCount + (lockedRow ? 1 : 0));
  // A reserved vocabulary with no custom entries rests at exactly one, so "1 entries" is the
  // first thing a GM reads here. The singular follows the `UsageCountSingular` precedent above.
  const entriesLabel = $derived(
    entryCount === 1
      ? text('FABRICATE.Admin.Manager.TagsCategories.EntriesCountSingular', '1 entry')
      : text('FABRICATE.Admin.Manager.TagsCategories.EntriesCount', '{count} entries').replace(
          '{count}',
          entryCount
        )
  );
  // The reserved row distinguishes custom entries from the fallback bucket, so it earns a slot
  // only once there is something to distinguish it FROM; below one custom entry the empty-state
  // card names and explains General instead (issue 878). Keyed on the UNFILTERED custom count, so
  // a search miss cannot make General blink out.
  const showLockedRow = $derived(Boolean(lockedRow) && customRowCount > 0);
  // A query with no surviving rows is a search miss; a genuinely empty vocabulary
  // (no custom rows and no query) is the onboarding state. They render differently.
  const showNoResults = $derived(hasQuery && filteredRows.length === 0);
  const showEmpty = $derived(!hasQuery && customRowCount === 0);
  const lockedFallbackHint = $derived(
    lockedHint ||
      text(
        'FABRICATE.Admin.Manager.TagsCategories.BuiltInFallback',
        'Built-in fallback — cannot be renamed or removed.'
      )
  );

  function matchesSearch(row) {
    if (!normalizedSearchTerm) return true;
    return [row.name || '', row.id || '', row.kind || '']
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearchTerm);
  }

  function refText(row) {
    const count = row?.totalUsage || 0;
    if (count === 1) {
      return text('FABRICATE.Admin.Manager.TagsCategories.UsageCountSingular', '1 reference');
    }
    return text('FABRICATE.Admin.Manager.TagsCategories.UsageCount', '{count} references').replace(
      '{count}',
      count
    );
  }

  // TWO PER-ROW FACTS, EACH DEFAULTING TO TODAY'S RENDERING (issue 1392): the world-scope screen
  // needs a confirm stating a SECOND number and a one-click predicate strictly NARROWER than the
  // reference count. Both are per-ROW because both vary row by row on one surface.

  /** The confirm sentence. `row.confirmTokens` is merged OVER the two defaults rather than
      replacing them, and substitution is split/join rather than `String#replace`, because a value
      containing `$&` would otherwise read as a back-reference. */
  function confirmSentence(row) {
    const tokens = { name: row.name, count: row.totalUsage || 0, ...(row.confirmTokens || {}) };
    let sentence = removeConfirmHint;
    for (const [token, value] of Object.entries(tokens)) {
      sentence = sentence.split(`{${token}}`).join(String(value));
    }
    return sentence;
  }

  /**
   * Whether this row deletes in ONE CLICK, derived ONCE, because all THREE renderings of that
   * affordance read it — the gate in `requestRemove`, the usage chip and the delete control's tone.
   * Any of them left keyed on `row.totalUsage` would let a surface state one thing and do another.
   * The default makes the predicate exactly `!(row.totalUsage > 0)`, so the two shipped call sites
   * render byte-identically.
   */
  function isSilentlyDeletable(row) {
    return typeof row?.silentlyDeletable === 'boolean'
      ? row.silentlyDeletable
      : (row?.totalUsage || 0) === 0;
  }

  function requestRemove(row) {
    if (!row || row.locked) return;
    // Everything else opens the confirm strip, which states what the deletion changes.
    if (!isSilentlyDeletable(row)) {
      pendingRemovalId = row.id;
    } else {
      onRemove(row);
    }
  }

  function cancelRemove() {
    pendingRemovalId = '';
  }

  function confirmRemove(row) {
    pendingRemovalId = '';
    onRemove(row);
  }
</script>

<!-- `label || undefined`, the guarded spelling `IconButton` and `SelectionCheckbox` ship: an EMPTY
     `aria-label` REPLACES the accessible name with nothing, where omitting the attribute leaves
     the element to take one from elsewhere. -->
<section class="manager-vocabulary-panel" aria-label={label || undefined}>
  <p class="manager-vocabulary-desc manager-muted">{hint}</p>

  <InlineVocabularyAdd
    {inputId}
    {inputLabel}
    {inputPlaceholder}
    {addLabel}
    {describeInput}
    {normalize}
    {successFeedback}
    {addFailedFeedback}
    {showIcon}
    {iconLabel}
    {changeIconLabel}
    {defaultIcon}
    {onAdd}
  />

  <div class="manager-vocabulary-search-row">
    <ManagerSearchField
      class="manager-vocabulary-search"
      value={searchTerm}
      onInput={(next) => (ui.searchTerm = next)}
      placeholder={searchPlaceholder}
      ariaLabel={searchLabel}
    />
    <Chip icon="fas fa-hashtag" class="manager-vocabulary-count" data-vocabulary-shown-count>
      <span>{entriesLabel}</span>
    </Chip>
  </div>

  <div class="manager-vocabulary-list">
    {#if showLockedRow}
      <div class="manager-vocabulary-card is-locked" {...{ [rowAttr]: lockedRow.id }}>
        <div class="manager-vocabulary-row">
          <span class="manager-vocabulary-icon is-locked-icon" aria-hidden="true"
            ><i class="fas fa-lock"></i></span
          >
          <!-- The reserved row carries its name ALONE, so it sits at the same height as every
            custom row; ellipsised inline, the explanatory sentence truncated to one word beside
            untruncated neighbours. It survives as the row's tooltip (issue 878). -->
          <div class="manager-vocabulary-main is-inline" title={lockedFallbackHint}>
            <strong>{lockedRow.name}</strong>
          </div>
          {#if (lockedRow.totalUsage || 0) > 0}
            <Chip tone="warning" icon="fas fa-link">{refText(lockedRow)}</Chip>
          {/if}
          <Chip icon="fas fa-lock" class="manager-vocabulary-chip-locked"
            >{text('FABRICATE.Admin.Manager.TagsCategories.Locked', 'Locked')}</Chip
          >
        </div>
      </div>
    {/if}
    {#each filteredRows as row (row.id)}
      <div class="manager-vocabulary-card" {...{ [rowAttr]: row.id }}>
        <div class="manager-vocabulary-row">
          {#if showIcon}
            <span class="manager-vocabulary-icon-picker" data-vocabulary-icon-picker={row.id}>
              <IconPicker
                value={row.icon || defaultIcon}
                iconOnly={true}
                triggerClass="manager-vocabulary-icon-trigger"
                buttonTitle={changeIconLabel}
                onChange={(icon) => onSetIcon(row.name, icon)}
              />
            </span>
          {:else if decorativeIcon}
            <span class="manager-vocabulary-icon is-decorative" aria-hidden="true">
              <i class={decorativeIcon}></i>
            </span>
          {/if}
          <div class="manager-vocabulary-main">
            <strong>{row.displayName || row.name}</strong>
          </div>
          {#if !isSilentlyDeletable(row)}
            <Chip tone="warning" icon="fas fa-link">{refText(row)}</Chip>
          {:else}
            <Chip icon="fas fa-circle" class="manager-vocabulary-chip-unused"
              >{text('FABRICATE.Admin.Manager.TagsCategories.Unused', 'Unused')}</Chip
            >
          {/if}
          <IconButton
            class={isSilentlyDeletable(row) ? 'is-danger' : ''}
            ariaLabel={removeNamedLabel.replace('{name}', row.name)}
            title={removeLabel}
            onclick={() => requestRemove(row)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </IconButton>
        </div>
        {#if pendingRemovalId === row.id}
          <div
            class="manager-vocabulary-confirm"
            data-vocabulary-confirm={row.id}
            role="alertdialog"
          >
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            <span class="manager-vocabulary-confirm-copy">{confirmSentence(row)}</span>
            <ManagerButton data-vocabulary-cancel-remove onclick={cancelRemove}
              >{cancelRemoveLabel}</ManagerButton
            >
            <ManagerButton
              role="danger"
              data-vocabulary-confirm-remove
              onclick={() => confirmRemove(row)}>{confirmRemoveLabel}</ManagerButton
            >
          </div>
        {/if}
      </div>
    {/each}
    {#if showNoResults}
      <EmptyState
        compact
        icon="fas fa-magnifying-glass"
        title={searchMissTitle.replace('{query}', searchTerm.trim())}
        contextClass="manager-vocabulary-empty-panel"
      />
    {:else if showEmpty}
      <!-- The ONLY place a reserved vocabulary's General bucket appears while no custom entry
        exists, so it carries the whole explanation and answers the entry chip's count of 1. The
        full dashed panel, not the compact one, which existed only because General used to render
        as a row directly above it (issue 878). -->
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        hint={emptyHint}
        contextClass="manager-vocabulary-empty-panel"
      />
    {/if}
  </div>
</section>
