<!-- Svelte 5 runes mode -->
<!--
  The live-validated "add a vocabulary entry" form, extracted from VocabularyPanel
  (issue 771) so it can be REUSED by the folder-aware import mapping row: both the Tags
  & Categories panel and the import mapping's inline "＋ New" creation share ONE
  validation machine (`describeInput` → tone/message/blocked), one normalizer, and one
  success/failure feedback path, rather than two drifting copies.

  Everything vocabulary-specific stays a prop: the live hint machine (`describeInput`),
  the value normalizer (`normalize`), the optional per-entry icon field (`showIcon`),
  and the localized labels. Emits the normalized value (and trimmed icon, when shown) to
  `onAdd`; an `onAdd` that returns `false` renders the failure feedback and keeps focus.
  The markup preserves VocabularyPanel's exact classes so both callers style identically.
-->
<script>
  let {
    inputId = '',
    inputLabel = '',
    inputPlaceholder = '',
    addLabel = '',
    // Live hint machine: (rawValue) => { tone: 'info'|'success'|'danger'|'', message, blocked }.
    // `blocked` refuses submit; `tone` drives the hint styling and icon.
    describeInput = () => ({ tone: '', message: '', blocked: false }),
    // Normalizes the raw input to the value handed to onAdd.
    normalize = (value) => String(value || '').trim(),
    successFeedback = () => '',
    addFailedFeedback = '',
    showIcon = false,
    iconLabel = '',
    iconPlaceholder = '',
    defaultIcon = 'fas fa-folder',
    onAdd = () => {},
  } = $props();

  let inputValue = $state('');
  let iconValue = $state('');
  let feedback = $state('');
  let submitting = $state(false);
  let inputElement;

  const liveHint = $derived(describeInput(inputValue));

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

  function toneIcon(tone) {
    if (tone === 'success') return 'fas fa-circle-check';
    if (tone === 'danger') return 'fas fa-circle-exclamation';
    return 'fas fa-circle-info';
  }
</script>

<form class="manager-vocabulary-form" onsubmit={submit} data-inline-vocabulary-add>
  <div class="manager-vocabulary-form-fields">
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
  </div>

  {#if feedback}
    <p class="manager-form-warning" role="status">{feedback}</p>
  {:else if inputValue.trim() && liveHint.message}
    <p class={`manager-vocabulary-hint is-${liveHint.tone || 'info'}`} role="status">
      <i class={toneIcon(liveHint.tone)} aria-hidden="true"></i>
      <span>{liveHint.message}</span>
    </p>
  {/if}
</form>
