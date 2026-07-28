<!-- Svelte 5 runes mode -->
<!--
  One vocabulary tab of the Tags & Categories screen: a description, a live-validated
  add form (wrapped in its own card, with an optional per-category icon field), a
  search + entry-count row, and the row grid with per-category icons and an inline
  delete-confirm strip.

  A row's icon IS the shared searchable `IconPicker` trigger (issue 878) — clicking it
  opens the same popover the gathering time-of-day, weather and biome icon fields use,
  and choosing an option commits immediately. It replaced a click-to-expand strip that
  asked the GM to type a raw Font Awesome class and press "Save icon".

  Extracted when the screen gained its THIRD vocabulary (component categories, issue
  676) and redesigned into a tabbed screen (issue 689). Recipe categories, component
  categories, and item tags are structurally identical tabs over independent
  vocabularies, so a third copy-paste block would have been ~50 duplicated lines —
  over Sonar's 3% new-code duplication budget, which does not honour cpd exclusions.

  Everything vocabulary-SPECIFIC is a prop: the reserved/locked row is optional
  (`lockedRow`), the live hint machine is injected (`describeInput`), icons are opt-in
  (`showIcon`), and the row `data-` attribute name is caller-chosen (`rowAttr`) so
  each tab keeps its own distinct test hook rather than three tabs colliding on one.
-->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import IconPicker from '../../components/IconPicker.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import InlineVocabularyAdd from './InlineVocabularyAdd.svelte';

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
    // A fixed, non-editable accent tile for vocabularies that carry no persisted
    // per-row icon (the tag tab). Rows still get the same 34x34 leading tile as the
    // category tabs — decorative only, so no add-form icon field and no click-to-edit.
    decorativeIcon = '',
    iconLabel = '',
    defaultIcon = 'fas fa-folder',
    changeIconLabel = '',
    lockedHint = '',
    removeConfirmHint = '',
    confirmRemoveLabel = '',
    cancelRemoveLabel = '',
    onSetIcon = () => {},
  } = $props();

  let searchTerm = $state('');
  let pendingRemovalId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredRows = $derived((rows || []).filter((row) => matchesSearch(row)));
  const hasQuery = $derived(Boolean(normalizedSearchTerm));
  const customRowCount = $derived((rows || []).length);
  // The count is the whole vocabulary (custom rows plus the reserved General row),
  // independent of the search query — it reports the library size, not the filter.
  // General is counted even in the state where it is deliberately NOT listed (see
  // `showLockedRow`), which is what keeps this chip, the tab badge and the inspector's
  // at-a-glance tile reporting the same number (issue 878).
  const entryCount = $derived(customRowCount + (lockedRow ? 1 : 0));
  // A reserved vocabulary with no custom entries now sits at exactly one entry as its
  // resting state, so "1 entries" stopped being a rare edge and became the first thing
  // a GM reads on this screen. The singular follows the `UsageCountSingular` precedent
  // directly above, and incidentally fixes the one-tag tag vocabulary too.
  const entriesLabel = $derived(
    entryCount === 1
      ? text('FABRICATE.Admin.Manager.TagsCategories.EntriesCountSingular', '1 entry')
      : text('FABRICATE.Admin.Manager.TagsCategories.EntriesCount', '{count} entries').replace(
          '{count}',
          entryCount
        )
  );
  // The reserved row exists to distinguish custom entries from the fallback bucket, so
  // it only earns a slot once there is something to distinguish it FROM. With no
  // GM-defined entries it was a lone immovable row that could not be renamed, deleted,
  // re-iconed or acted on in any way, occupying the space where the onboarding guidance
  // belongs — so below one custom entry the empty-state card names and explains General
  // instead, and the row appears alongside the first category the GM adds (issue 878).
  // Keyed on the UNFILTERED custom count: a search miss must not make General blink out.
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

  function confirmSentence(row) {
    return removeConfirmHint.replace('{name}', row.name).replace('{count}', row.totalUsage || 0);
  }

  function requestRemove(row) {
    if (!row || row.locked) return;
    // Unused entries delete in one click, matching the prototype's affordance. Only
    // referenced entries open the confirm strip — its copy reassigns the references,
    // which is meaningless for a 0-reference row.
    if ((row.totalUsage || 0) > 0) {
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

<section class="manager-vocabulary-panel" aria-label={label}>
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
    <label class="manager-search manager-vocabulary-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
      />
    </label>
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
          <!--
            The reserved row carries its name ALONE, so it sits at the same height as every
            custom row (the grid is `align-items: start`, so a second line of copy would
            make this the one card that sticks out). The explanatory sentence was inlined
            and ellipsised to buy that height, but at real column widths it truncated to
            "Built…" — one word, beside untruncated custom rows, reading as breakage rather
            than as brevity. The `Locked` chip already states the row cannot be edited, the
            inspector's help panel explains the fallback in full, and the sentence survives
            as the row's tooltip (issue 878).
          -->
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
          {#if row.totalUsage > 0}
            <Chip tone="warning" icon="fas fa-link">{refText(row)}</Chip>
          {:else}
            <Chip icon="fa-regular fa-circle" class="manager-vocabulary-chip-unused"
              >{text('FABRICATE.Admin.Manager.TagsCategories.Unused', 'Unused')}</Chip
            >
          {/if}
          <button
            type="button"
            class={`manager-icon-button ${row.totalUsage > 0 ? '' : 'is-danger'}`}
            aria-label={removeNamedLabel.replace('{name}', row.name)}
            title={removeLabel}
            onclick={() => requestRemove(row)}
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
          </button>
        </div>
        {#if pendingRemovalId === row.id}
          <div
            class="manager-vocabulary-confirm"
            data-vocabulary-confirm={row.id}
            role="alertdialog"
          >
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
            <span class="manager-vocabulary-confirm-copy">{confirmSentence(row)}</span>
            <button type="button" class="manager-button" onclick={cancelRemove}
              >{cancelRemoveLabel}</button
            >
            <button
              type="button"
              class="manager-button is-danger"
              onclick={() => confirmRemove(row)}>{confirmRemoveLabel}</button
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
      <!--
        This card is the ONLY place a reserved vocabulary's General bucket appears while
        no custom entry exists, so it carries the whole explanation ("Only General so
        far" + what falls under it) and answers the entry chip's count of 1 above it.
        It is the full dashed panel, not the compact one: the compact variant existed
        purely because General used to render as a row directly above it, and shrinking
        the only thing in an otherwise empty list is the opposite of what that traded
        for. Tags reach the same card by genuinely having nothing at all (issue 878).
      -->
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        hint={emptyHint}
        contextClass="manager-vocabulary-empty-panel"
      />
    {/if}
  </div>
</section>
