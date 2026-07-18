<!-- Svelte 5 runes mode -->
<!--
  One vocabulary tab of the Tags & Categories screen: heading, a live-validated
  add form (with an optional per-category icon field), a per-tab search, and the
  row list with per-category icons and an inline delete-confirm strip.

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
  import { localize } from '../../util/foundryBridge.js';

  let {
    label = '',
    title = '',
    hint = '',
    inputId = '',
    inputLabel = '',
    inputPlaceholder = '',
    addLabel = '',
    rowAttr = 'data-category-id',
    rows = [],
    lockedRow = null,
    lockedHint = '',
    emptyTitle = '',
    emptyHint = '',
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
    iconLabel = '',
    iconPlaceholder = '',
    defaultIcon = 'fas fa-folder',
    changeIconLabel = '',
    saveIconLabel = '',
    removeConfirmTitle = '',
    removeConfirmHint = '',
    confirmRemoveLabel = '',
    cancelRemoveLabel = '',
    onSetIcon = () => {},
  } = $props();

  let inputValue = $state('');
  let iconValue = $state('');
  let feedback = $state('');
  let submitting = $state(false);
  let searchTerm = $state('');
  let pendingRemovalId = $state('');
  let editingIconId = $state('');
  let editingIconValue = $state('');
  let inputElement;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const filteredRows = $derived((rows || []).filter((row) => matchesSearch(row)));
  const hasSearchMiss = $derived(
    Boolean(normalizedSearchTerm) && (rows || []).length > 0 && filteredRows.length === 0
  );
  const shownCount = $derived(filteredRows.length + (lockedRow ? 1 : 0));
  const liveHint = $derived(describeInput(inputValue));

  function matchesSearch(row) {
    if (!normalizedSearchTerm) return true;
    return [row.name || '', row.id || '', row.kind || '']
      .join(' ')
      .toLowerCase()
      .includes(normalizedSearchTerm);
  }

  // Focus on the next microtask rather than `await tick()`: tick waits for Svelte's
  // full reactive flush, landing focus() one microtask after the surrounding state
  // mutations — later than the two ticks tests (and Foundry's app lifecycle) await
  // after a form submit. queueMicrotask runs after this batch's effect schedule, so
  // bind:this is current without adding await depth.
  function focusAfterUpdate(element) {
    queueMicrotask(() => element?.focus?.());
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const rawValue = inputValue.trim();
    const value = normalize(inputValue);
    if (!rawValue || liveHint.blocked) {
      focusAfterUpdate(inputElement);
      return;
    }
    submitting = true;
    try {
      const icon = showIcon ? iconValue.trim() : undefined;
      const result = await onAdd(value, icon);
      if (result === false) {
        feedback = addFailedFeedback;
        focusAfterUpdate(inputElement);
        return;
      }
      inputValue = '';
      iconValue = '';
      feedback = successFeedback(value, rawValue);
      focusAfterUpdate(inputElement);
    } catch (_err) {
      feedback = addFailedFeedback;
      focusAfterUpdate(inputElement);
    } finally {
      submitting = false;
    }
  }

  function usageLabel(row) {
    const count = row?.totalUsage || 0;
    if (count === 0) return text('FABRICATE.Admin.Manager.TagsCategories.Unused', 'Unused');
    return text('FABRICATE.Admin.Manager.TagsCategories.UsageCount', '{count} references').replace(
      '{count}',
      count
    );
  }

  function requestRemove(row) {
    if (!row || row.locked) return;
    pendingRemovalId = row.id;
  }

  function cancelRemove() {
    pendingRemovalId = '';
  }

  function confirmRemove(row) {
    pendingRemovalId = '';
    onRemove(row);
  }

  function startIconEdit(row) {
    editingIconId = row.id;
    editingIconValue = row.icon || '';
  }

  function saveIconEdit(row) {
    onSetIcon(row.name, editingIconValue.trim());
    editingIconId = '';
    editingIconValue = '';
  }

  function clearSearch() {
    searchTerm = '';
  }

  function toneIcon(tone) {
    if (tone === 'success') return 'fas fa-circle-check';
    if (tone === 'danger') return 'fas fa-circle-exclamation';
    return 'fas fa-circle-info';
  }
</script>

<section class="manager-vocabulary-panel" aria-label={label}>
  <div class="manager-vocabulary-heading">
    <div>
      <h3 class="manager-card-title">{title}</h3>
      <p class="manager-muted">{hint}</p>
    </div>
    <span class="manager-chip" data-vocabulary-shown-count
      >{text('FABRICATE.Admin.Manager.TagsCategories.ShownCount', '{count} shown').replace(
        '{count}',
        shownCount
      )}</span
    >
  </div>

  <label class="manager-search manager-vocabulary-search">
    <i class="fas fa-search" aria-hidden="true"></i>
    <input
      type="search"
      bind:value={searchTerm}
      placeholder={searchPlaceholder}
      aria-label={searchLabel}
    />
  </label>

  <form class="manager-vocabulary-form" onsubmit={submit}>
    <label class="manager-field" for={inputId}>
      <span>{inputLabel}</span>
      <input
        id={inputId}
        type="text"
        bind:value={inputValue}
        bind:this={inputElement}
        oninput={() => (feedback = '')}
        placeholder={inputPlaceholder}
      />
    </label>
    {#if showIcon}
      <label class="manager-field manager-vocabulary-icon-field" for={`${inputId}-icon`}>
        <span>{iconLabel}</span>
        <span class="manager-vocabulary-icon-input">
          <i class={iconValue.trim() || defaultIcon} aria-hidden="true"></i>
          <input
            id={`${inputId}-icon`}
            type="text"
            bind:value={iconValue}
            placeholder={iconPlaceholder}
          />
        </span>
      </label>
    {/if}
    <button
      type="submit"
      class="manager-button is-primary"
      disabled={!inputValue.trim() || liveHint.blocked || submitting}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{addLabel}</span>
    </button>
  </form>

  {#if feedback}
    <p class="manager-form-warning" role="status">{feedback}</p>
  {:else if inputValue.trim() && liveHint.message}
    <p class={`manager-vocabulary-hint is-${liveHint.tone || 'info'}`} role="status">
      <i class={toneIcon(liveHint.tone)} aria-hidden="true"></i>
      <span>{liveHint.message}</span>
    </p>
  {/if}

  <div class="manager-vocabulary-list">
    {#if lockedRow}
      <div class="manager-vocabulary-row is-locked" {...{ [rowAttr]: lockedRow.id }}>
        {#if showIcon}
          <span class="manager-vocabulary-icon" aria-hidden="true"
            ><i class={lockedRow.icon || defaultIcon}></i></span
          >
        {/if}
        <div class="manager-vocabulary-main">
          <strong>{lockedRow.name}</strong>
          <span class="manager-muted"
            >{text(
              'FABRICATE.Admin.Manager.TagsCategories.BuiltInFallback',
              'Built-in fallback'
            )}</span
          >
        </div>
        <span class="manager-chip is-active">{usageLabel(lockedRow)}</span>
        <span class="manager-chip is-disabled"
          >{text('FABRICATE.Admin.Manager.TagsCategories.Locked', 'Locked')}</span
        >
      </div>
    {/if}
    {#each filteredRows as row (row.id)}
      <div class="manager-vocabulary-row" {...{ [rowAttr]: row.id }}>
        {#if showIcon}
          <button
            type="button"
            class="manager-vocabulary-icon is-editable"
            title={changeIconLabel}
            aria-label={changeIconLabel}
            onclick={() => startIconEdit(row)}
          >
            <i class={row.icon || defaultIcon} aria-hidden="true"></i>
          </button>
        {/if}
        <div class="manager-vocabulary-main">
          <strong>{row.displayName || row.name}</strong>
          <span class="manager-muted">{usageLabel(row)}</span>
        </div>
        <span class={`manager-chip ${row.totalUsage > 0 ? 'is-warning' : ''}`}>{usageLabel(row)}</span>
        <button
          type="button"
          class="manager-icon-button is-danger"
          aria-label={removeNamedLabel.replace('{name}', row.name)}
          title={removeLabel}
          onclick={() => requestRemove(row)}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </div>
      {#if editingIconId === row.id}
        <div class="manager-vocabulary-icon-edit" data-vocabulary-icon-edit={row.id}>
          <span class="manager-vocabulary-icon-input">
            <i class={editingIconValue.trim() || defaultIcon} aria-hidden="true"></i>
            <input
              type="text"
              bind:value={editingIconValue}
              placeholder={iconPlaceholder}
              aria-label={iconLabel}
            />
          </span>
          <button type="button" class="manager-button is-primary" onclick={() => saveIconEdit(row)}
            >{saveIconLabel}</button
          >
        </div>
      {/if}
      {#if pendingRemovalId === row.id}
        <div class="manager-vocabulary-confirm" data-vocabulary-confirm={row.id} role="alertdialog">
          <div class="manager-vocabulary-confirm-copy">
            <strong>{removeConfirmTitle.replace('{name}', row.name)}</strong>
            <span class="manager-muted"
              >{removeConfirmHint
                .replace('{name}', row.name)
                .replace('{count}', row.totalUsage || 0)}</span
            >
          </div>
          <div class="manager-vocabulary-confirm-actions">
            <button type="button" class="manager-button" onclick={cancelRemove}
              >{cancelRemoveLabel}</button
            >
            <button
              type="button"
              class="manager-button is-danger"
              onclick={() => confirmRemove(row)}>{confirmRemoveLabel}</button
            >
          </div>
        </div>
      {/if}
    {:else}
      <div class="manager-vocabulary-empty">
        {#if hasSearchMiss}
          <strong>{searchMissTitle}</strong>
          <button type="button" class="manager-button" onclick={clearSearch}
            >{text('FABRICATE.Admin.Manager.ClearSearch', 'Clear search')}</button
          >
        {:else}
          <strong>{emptyTitle}</strong>
          <span>{emptyHint}</span>
        {/if}
      </div>
    {/each}
  </div>
</section>
