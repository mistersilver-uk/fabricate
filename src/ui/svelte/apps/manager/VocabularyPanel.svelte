<!-- Svelte 5 runes mode -->
<!--
  One vocabulary section of the Tags & Categories screen: heading, add-form, feedback
  line, and the row list.

  Extracted when the screen gained its THIRD vocabulary (component categories, issue
  676). Recipe categories, component categories, and item tags are structurally
  identical panels over independent vocabularies, so a third copy-paste block would
  have been ~50 duplicated lines — over Sonar's 3% new-code duplication budget, which
  does not honour cpd exclusions.

  Everything vocabulary-SPECIFIC is a prop: the reserved/locked row is optional
  (`lockedRow`), validation is injected (`validate`), and the row `data-` attribute
  name is caller-chosen (`rowAttr`) so each section keeps its own distinct test hook
  rather than three sections colliding on one.
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
    searchMissTitle = '',
    hasSearchMiss = false,
    removeLabel = '',
    removeNamedLabel = '',
    // Returns a feedback string to show INSTEAD of submitting, or '' to proceed.
    validate = () => '',
    // Normalizes the raw input to the value handed to onAdd.
    normalize = (value) => String(value || '').trim(),
    // Reports the added value back so the caller can vary its success copy
    // (the tag section says something different when it lowercases the input).
    successFeedback = () => '',
    addFailedFeedback = '',
    onAdd = () => {},
    onRemove = () => {}
  } = $props();

  let inputValue = $state('');
  let feedback = $state('');
  let submitting = $state(false);
  let inputElement;

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Focus on the next microtask rather than `await tick()`: tick waits for Svelte's
  // full reactive flush, landing focus() one microtask after the surrounding state
  // mutations — which is later than the two ticks tests (and Foundry's app lifecycle)
  // await after a form submit. queueMicrotask runs after this batch's effect schedule,
  // so bind:this is current without adding await depth.
  function focusAfterUpdate(element) {
    queueMicrotask(() => element?.focus?.());
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;
    const rawValue = inputValue.trim();
    const value = normalize(inputValue);
    const validationFeedback = validate(value, rawValue);
    if (validationFeedback) {
      feedback = validationFeedback;
      focusAfterUpdate(inputElement);
      return;
    }
    submitting = true;
    try {
      const result = await onAdd(value);
      if (result === false) {
        feedback = addFailedFeedback;
        focusAfterUpdate(inputElement);
        return;
      }
      inputValue = '';
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
    return text('FABRICATE.Admin.Manager.TagsCategories.UsageCount', '{count} references').replace('{count}', count);
  }

  function remove(row) {
    if (!row || row.locked) return;
    onRemove(row);
  }
</script>

<section class="manager-vocabulary-panel" aria-label={label}>
  <div class="manager-vocabulary-heading">
    <div>
      <h3 class="manager-card-title">{title}</h3>
      <p class="manager-muted">{hint}</p>
    </div>
  </div>
  <form class="manager-vocabulary-form" onsubmit={submit}>
    <label class="manager-field" for={inputId}>
      <span>{inputLabel}</span>
      <input id={inputId} type="text" bind:value={inputValue} bind:this={inputElement} placeholder={inputPlaceholder} />
    </label>
    <button type="submit" class="manager-button is-primary" disabled={!inputValue.trim() || submitting}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{addLabel}</span>
    </button>
  </form>
  {#if feedback}
    <p class="manager-form-warning" role="status">{feedback}</p>
  {/if}
  <div class="manager-vocabulary-list">
    {#if lockedRow}
      <div class="manager-vocabulary-row is-locked" {...{ [rowAttr]: lockedRow.id }}>
        <div class="manager-vocabulary-main">
          <strong>{lockedRow.name}</strong>
          <span class="manager-muted">{lockedHint}</span>
        </div>
        <span class="manager-chip is-active">{usageLabel(lockedRow)}</span>
        <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.TagsCategories.Locked', 'Locked')}</span>
      </div>
    {/if}
    {#each rows as row (row.id)}
      <div class="manager-vocabulary-row" {...{ [rowAttr]: row.id }}>
        <div class="manager-vocabulary-main">
          <strong>{row.name}</strong>
          <span class="manager-muted">{usageLabel(row)}</span>
        </div>
        <span class={`manager-chip ${row.totalUsage > 0 ? 'is-warning' : ''}`}>{usageLabel(row)}</span>
        <button type="button" class="manager-icon-button is-danger" aria-label={removeNamedLabel.replace('{name}', row.name)} title={removeLabel} onclick={() => remove(row)}>
          <i class="fas fa-trash" aria-hidden="true"></i>
        </button>
      </div>
    {:else}
      <div class="manager-vocabulary-empty">
        {#if hasSearchMiss}
          <strong>{searchMissTitle}</strong>
        {:else}
          <strong>{emptyTitle}</strong>
          <span>{emptyHint}</span>
        {/if}
      </div>
    {/each}
  </div>
</section>
