<!-- Svelte 5 runes mode -->
<script>
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import { portal } from '../../actions/portal.js';
  import { localize } from '../../util/foundryBridge.js';
  import {
    RECIPE_IMAGE_OPTIONS,
    normalizeRecipeImage,
    filterRecipeImageOptions
  } from '../../util/recipeImageIcons.js';
  import { computeIconPickerPopoverLayout } from '../../util/iconPickerPopover.js';

  let {
    value = '',
    onChange = () => {},
    disabled = false,
    disabledTitle = ''
  } = $props();

  let pickerOpen = $state(false);
  let searchTerm = $state('');
  let pickerRoot = $state(null);
  let popoverRoot = $state(null);
  let triggerButton = $state(null);
  let searchInput = $state(null);
  let popoverStyle = $state('');

  const currentImage = $derived(normalizeRecipeImage(value));
  const filteredOptions = $derived(filterRecipeImageOptions(RECIPE_IMAGE_OPTIONS, searchTerm));

  function closePicker() {
    pickerOpen = false;
    searchTerm = '';
    triggerButton?.focus();
  }

  function togglePicker() {
    if (disabled) return;
    if (pickerOpen) {
      closePicker();
      return;
    }
    pickerOpen = true;
  }

  function selectImage(path) {
    onChange(path);
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
        minWidth: 240,
        maxWidth: 300,
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
    if (!disabled || !pickerOpen) return;
    closePicker();
  });

  $effect(() => {
    if (!pickerOpen || !searchInput) return;
    queueMicrotask(() => searchInput?.focus());
  });

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
    aria-label={localize('FABRICATE.Editor.BasicInfo.ChooseImage')}
    title={disabled ? disabledTitle : localize('FABRICATE.Editor.BasicInfo.ChooseImage')}
  >
    <img
      src={currentImage}
      alt=""
      class="recipe-image-thumbnail"
      width="48"
      height="48"
      aria-hidden="true"
    />
  </button>

  {#if pickerOpen}
    <div
      bind:this={popoverRoot}
      class="recipe-image-picker-popover"
      style={popoverStyle}
      role="dialog"
      aria-label={localize('FABRICATE.Editor.BasicInfo.ImageDialogLabel')}
      use:portal={() => getPopoverHost()}
    >
      <div class="recipe-image-picker-search">
        <input
          bind:this={searchInput}
          bind:value={searchTerm}
          type="text"
          placeholder={localize('FABRICATE.Editor.BasicInfo.SearchImage')}
          aria-label={localize('FABRICATE.Editor.BasicInfo.SearchImage')}
        />
      </div>

      <div
        class="recipe-image-picker-options"
        role="listbox"
        aria-label={localize('FABRICATE.Editor.BasicInfo.ImageDialogLabel')}
      >
        {#each filteredOptions as option (option.path)}
          <button
            type="button"
            class="recipe-image-picker-option"
            class:selected={option.path === currentImage}
            role="option"
            aria-selected={option.path === currentImage}
            title={option.label}
            onclick={() => selectImage(option.path)}
          >
            <img
              src={option.path}
              alt={option.label}
            />
          </button>
        {:else}
          <p class="recipe-image-picker-empty">
            {localize('FABRICATE.Admin.Features.Essences.NoIconsFound')}
          </p>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .recipe-image-picker {
    position: relative;
    display: inline-block;
    flex-shrink: 0;
  }

  .recipe-image-picker-trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 58px;
    height: 58px;
    box-sizing: border-box;
    padding: 4px;
    background: var(--fab-overlay-light-06);
    border: 1px solid var(--fab-overlay-light-16);
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .recipe-image-picker-trigger:hover {
    background: var(--fab-overlay-light-12);
    border-color: var(--fab-overlay-light-28);
  }

  .recipe-image-picker-trigger:disabled {
    cursor: not-allowed;
    opacity: 0.72;
    background: var(--fab-overlay-light-04);
    border-color: var(--fab-overlay-light-12);
  }

  .recipe-image-thumbnail {
    display: block;
    width: 48px;
    height: 48px;
    object-fit: contain;
    border-radius: 4px;
  }

  .recipe-image-picker-popover {
    position: absolute;
    z-index: 4000;
    background: var(--fab-editor-menu-bg);
    border: 1px solid var(--fab-overlay-light-18);
    border-radius: 10px;
    box-shadow: 0 8px 32px var(--fab-overlay-dark-48);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .recipe-image-picker-search {
    padding: 8px;
    border-bottom: 1px solid var(--fab-overlay-light-10);
    flex-shrink: 0;
  }

  .recipe-image-picker-search input {
    width: 100%;
    box-sizing: border-box;
    background: var(--fab-overlay-light-07);
    border: 1px solid var(--fab-overlay-light-16);
    border-radius: 6px;
    color: var(--fab-editor-text);
    padding: 6px 10px;
    font-size: 0.85rem;
  }

  .recipe-image-picker-options {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    padding: 8px;
    overflow-y: auto;
    flex: 1;
  }

  .recipe-image-picker-option {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 100%;
    height: 0;
    padding-bottom: 100%;
    position: relative;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    overflow: hidden;
    transition: background 0.12s, border-color 0.12s;
  }

  .recipe-image-picker-option:hover {
    background: var(--fab-overlay-light-10);
    border-color: var(--fab-overlay-light-20);
  }

  .recipe-image-picker-option.selected {
    background: var(--fab-editor-accent-soft);
    border-color: var(--fab-info-border);
  }

  .recipe-image-picker-option img {
    position: absolute;
    top: 4px;
    left: 4px;
    right: 4px;
    bottom: 4px;
    width: calc(100% - 8px);
    height: calc(100% - 8px);
    object-fit: contain;
  }

  .recipe-image-picker-empty {
    grid-column: 1 / -1;
    text-align: center;
    color: var(--fab-text-disabled);
    font-size: 0.85rem;
    padding: 16px;
    margin: 0;
  }
</style>
