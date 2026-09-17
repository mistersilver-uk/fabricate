<!--
  The live-validated "add a vocabulary entry" form, extracted from `VocabularyPanel` (issue 771) so
  the import mapping's inline "＋ New" shares ONE validation machine (`describeInput` →
  tone/message/blocked), one normalizer and one feedback path rather than two drifting copies.
  Everything vocabulary-specific stays a prop, and the markup preserves `VocabularyPanel`'s exact
  classes so both callers style identically. It emits the normalized value (and trimmed icon, when
  shown) to `onAdd`; an `onAdd` returning `false` renders the failure feedback and keeps focus.

  The icon field is the shared `IconPicker` (issue 878), not a free-text class box, and stays UNSET
  until the GM picks one, so an untouched form emits an empty icon and the row falls back.
-->
<script>
  import Field from '../../components/Field.svelte';
  import IconPicker from '../../components/IconPicker.svelte';
  import ManagerButton from '../../components/ManagerButton.svelte';

  let {
    inputId = '',
    inputLabel = '',
    inputPlaceholder = '',
    addLabel = '',
    // `(rawValue) => { tone, message, blocked }`; `blocked` refuses submit, `tone` styles the hint.
    describeInput = () => ({ tone: '', message: '', blocked: false }),
    normalize = (value) => String(value || '').trim(),
    successFeedback = () => '',
    addFailedFeedback = '',
    showIcon = false,
    iconLabel = '',
    changeIconLabel = '',
    defaultIcon = 'fas fa-folder',
    onAdd = () => {},
  } = $props();

  let inputValue = $state('');
  let iconValue = $state('');
  let feedback = $state('');
  let submitting = $state(false);
  let inputElement;

  const liveHint = $derived(describeInput(inputValue));

  // `queueMicrotask` rather than `await tick()`: tick waits for the full reactive flush and lands
  // focus one microtask after the surrounding mutations, later than the two ticks tests and
  // Foundry's app lifecycle await after a submit.
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
    <Field as="label" for={inputId}>
      <span>{inputLabel}</span>
      <input
        id={inputId}
        type="text"
        bind:value={inputValue}
        bind:this={inputElement}
        oninput={() => (feedback = '')}
        placeholder={inputPlaceholder}
      />
    </Field>
    {#if showIcon}
      <!-- A `<div>`, not a `<label>`: the control is a button, which is not a labelable element,
        so a wrapping label would name nothing. `buttonTitle` carries the accessible name. -->
      <Field as="div" class="manager-vocabulary-icon-field" data-vocabulary-add-icon="">
        <span>{iconLabel}</span>
        <IconPicker
          value={iconValue.trim() || defaultIcon}
          iconOnly={true}
          triggerClass="manager-vocabulary-icon-trigger"
          buttonTitle={changeIconLabel || iconLabel}
          onChange={(icon) => (iconValue = icon)}
        />
      </Field>
    {/if}
    <ManagerButton
      role="primary"
      type="submit"
      data-vocabulary-add
      disabled={!inputValue.trim() || liveHint.blocked || submitting}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{addLabel}</span>
    </ManagerButton>
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
