<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let {
    value = '',
    defaultImage = 'icons/svg/item-bag.svg',
    chooseLabel = '',
    unavailableLabel = '',
    dataEnvironmentField = undefined,
    ariaInvalid = undefined,
    ariaDescribedBy = undefined,
    onChange = () => {},
    onPickImagePath = null,
    showInput = true
  } = $props();

  let picking = $state(false);
  const previewPath = $derived(String(value || defaultImage || '').trim() || defaultImage);
  const pickerAvailable = $derived(typeof onPickImagePath === 'function');
  const buttonLabel = $derived(
    pickerAvailable
      ? (chooseLabel || localize('FABRICATE.Admin.Environments.ChooseImage'))
      : (unavailableLabel || localize('FABRICATE.Admin.Environments.ImagePickerUnavailable'))
  );

  async function pickImagePath() {
    if (!pickerAvailable || picking) return;
    picking = true;
    try {
      const nextPath = await onPickImagePath(value || '');
      if (typeof nextPath === 'string' && nextPath.trim()) {
        onChange(nextPath);
      }
    } catch (err) {
      // A failed picker leaves the manual text entry untouched.
    } finally {
      picking = false;
    }
  }
</script>

<div class="image-path-picker" class:is-button-only={!showInput}>
  <img class="image-path-picker-preview" src={previewPath} alt="" aria-hidden="true" />
  <div class="image-path-picker-controls">
    {#if showInput}
      <input
        type="text"
        value={value || ''}
        data-environment-field={dataEnvironmentField}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        oninput={(event) => onChange(event.target.value)}
      />
    {/if}
    <button
      type="button"
      class="image-path-picker-button"
      data-environment-field={!showInput ? dataEnvironmentField : undefined}
      aria-describedby={!showInput ? ariaDescribedBy : undefined}
      onclick={pickImagePath}
      disabled={!pickerAvailable || picking}
      title={buttonLabel}
      aria-label={buttonLabel}
    >
      <i class={picking ? 'fas fa-spinner fa-spin' : 'fas fa-folder-open'}></i>
      <span>{buttonLabel}</span>
    </button>
  </div>
</div>
