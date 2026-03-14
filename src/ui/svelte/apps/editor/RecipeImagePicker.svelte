<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';
  import { localize } from '../../util/foundryBridge.js';
  import { computeIconPickerPopoverLayout } from '../../util/iconPickerPopover.js';
  import {
    RECIPE_IMAGE_ICONS,
    DEFAULT_RECIPE_IMAGE,
    normalizeRecipeImage,
    getRecipeImageLabel
  } from '../../../../utils/recipeImageIcons.js';

  let {
    value = DEFAULT_RECIPE_IMAGE,
    disabled = false,
    onChange = () => {}
  } = $props();

  let pickerOpen = $state(false);
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let popoverStyle = $state('');

  const currentImage = $derived(normalizeRecipeImage(value));

  function closePicker() {
    pickerOpen = false;
  }

  function togglePicker() {
    if (disabled) return;
    if (pickerOpen) {
      closePicker();
      return;
    }
    pickerOpen = true;
  }

  function selectImage(iconPath) {
    onChange(iconPath);
    closePicker();
  }

  function getPopoverHost() {
    if (!pickerRoot || typeof document === 'undefined') return null;
    return pickerRoot.closest('.fabricate-recipe-editor');
  }

  function getPopoverHorizontalBounds(hostRect) {
    if (!pickerRoot) return {};

    const mainPanel = pickerRoot.closest('.editor-main');
    const mainPanelRect = mainPanel?.getBoundingClientRect?.();
    if (!mainPanelRect) return {};

    return {
      minLeft: mainPanelRect.left - hostRect.left + 16,
      maxRight: mainPanelRect.right - hostRect.left - 16
    };
  }

  function updatePopoverPosition() {
    if (!pickerOpen || !triggerButton || typeof window === 'undefined') return;

    const popoverHost = getPopoverHost();
    const hostRect = popoverHost?.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight
    };
    const triggerRect = triggerButton.getBoundingClientRect();
    const horizontalBounds = getPopoverHorizontalBounds(hostRect);

    const layout = computeIconPickerPopoverLayout(
      {
        left: triggerRect.left - hostRect.left,
        right: triggerRect.right - hostRect.left,
        top: triggerRect.top - hostRect.top,
        bottom: triggerRect.bottom - hostRect.top,
        width: triggerRect.width,
        height: triggerRect.height
      },
      { width: hostRect.width || window.innerWidth, height: hostRect.height || window.innerHeight },
      {
        horizontalAlign: 'left',
        minLeft: horizontalBounds.minLeft,
        maxRight: horizontalBounds.maxRight
      }
    );

    if (!layout) {
      popoverStyle = '';
      return;
    }

    const verticalPosition = layout.placement === 'top'
      ? `top: auto; bottom: ${layout.bottom}px;`
      : `top: ${layout.top}px; bottom: auto;`;

    popoverStyle = [
      `left: ${layout.left}px;`,
      'right: auto;',
      `width: ${layout.width}px;`,
      `max-height: ${layout.maxHeight}px;`,
      verticalPosition
    ].join(' ');
  }

  $effect(() => {
    if (!pickerOpen || typeof window === 'undefined' || typeof document === 'undefined') {
      popoverStyle = '';
      return;
    }

    updatePopoverPosition();

    const handleViewportChange = () => updatePopoverPosition();
    window.addEventListener('resize', handleViewportChange);
    document.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      document.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

<div
  bind:this={pickerRoot}
  class="recipe-image-picker"
  use:dismissOnOutsideClick={{
    enabled: pickerOpen,
    onDismiss: closePicker,
    additionalNodes: () => [popoverRoot]
  }}
>
  <button
    type="button"
    bind:this={triggerButton}
    class="recipe-image-picker-trigger"
    onclick={togglePicker}
    disabled={disabled}
    aria-expanded={pickerOpen}
    aria-haspopup="dialog"
    aria-label={localize('FABRICATE.Editor.BasicInfo.PickImageLabel')}
    title={localize('FABRICATE.Editor.BasicInfo.PickImageLabel')}
  >
    <img
      src={currentImage}
      alt={getRecipeImageLabel(currentImage)}
      class="recipe-image-picker-preview"
      aria-hidden="true"
    />
  </button>

  {#if pickerOpen}
    <div
      bind:this={popoverRoot}
      class="recipe-image-picker-popover"
      style={popoverStyle}
      role="dialog"
      aria-label={localize('FABRICATE.Editor.BasicInfo.PickImageDialogLabel')}
      use:portal={() => getPopoverHost()}
    >
      <div
        class="recipe-image-picker-grid"
        role="listbox"
        aria-label={localize('FABRICATE.Editor.BasicInfo.PickImageDialogLabel')}
      >
        {#each RECIPE_IMAGE_ICONS as iconPath (iconPath)}
          <button
            type="button"
            class="recipe-image-picker-option"
            class:selected={iconPath === currentImage}
            role="option"
            aria-selected={iconPath === currentImage}
            title={getRecipeImageLabel(iconPath)}
            onclick={() => selectImage(iconPath)}
          >
            <img
              src={iconPath}
              alt={getRecipeImageLabel(iconPath)}
              class="recipe-image-picker-option-img"
            />
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .recipe-image-picker {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .recipe-image-picker-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--fabricate-editor-input-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    border-radius: 8px;
    padding: 6px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    width: 84px;
    height: 84px;
  }

  .recipe-image-picker-trigger:hover:not(:disabled) {
    border-color: var(--fabricate-editor-border-strong, rgba(255, 255, 255, 0.24));
    background: var(--fabricate-editor-input-bg-hover, rgba(255, 255, 255, 0.07));
  }

  .recipe-image-picker-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .recipe-image-picker-preview {
    width: 64px;
    height: 64px;
    object-fit: contain;
    display: block;
  }
</style>
