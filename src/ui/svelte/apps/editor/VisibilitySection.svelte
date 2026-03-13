<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    featureState = {},
    visibility = { restricted: false, allowedUserIds: [] },
    linkedRecipeItemUuid = '',
    linkedItem = null,
    nonGMUsers = [],
    onUpdateVisibility,
    onClearLinkedItem,
    onSetLinkedItemUuid,
    onBrowseLinkedItem,
    onCreateLinkedItem
  } = $props();

  function toggleRestricted(checked) {
    onUpdateVisibility?.({
      ...visibility,
      restricted: checked
    });
  }

  function toggleUserId(userId, checked) {
    const current = visibility.allowedUserIds || [];
    const next = checked
      ? [...current, userId]
      : current.filter(id => id !== userId);
    onUpdateVisibility?.({
      ...visibility,
      allowedUserIds: next
    });
  }

  const showSection = $derived(Boolean(
    featureState.showRecipeVisibilityGlobal ||
    featureState.showRecipeVisibilityPlayer ||
    featureState.showRecipeVisibilityKnowledge
  ));
</script>

{#if showSection}
  <div class="visibility-section">
    {#if featureState.showRecipeVisibilityGlobal}
      <p class="hint">{localize('FABRICATE.Editor.Visibility.GlobalHint')}</p>
    {/if}

    {#if featureState.showRecipeVisibilityPlayer}
      <div class="player-visibility">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={visibility.restricted}
            onchange={(e) => toggleRestricted(e.target.checked)}
          />
          {localize('FABRICATE.Editor.Visibility.RestrictLabel')}
        </label>

        {#if visibility.restricted}
          <div class="user-checkboxes">
            <h4>{localize('FABRICATE.Editor.Visibility.PlayerVisibilityTitle')}</h4>
            {#each nonGMUsers as user}
              <label class="checkbox-label user-checkbox">
                <input
                  type="checkbox"
                  checked={visibility.allowedUserIds?.includes(user.id)}
                  onchange={(e) => toggleUserId(user.id, e.target.checked)}
                />
                {user.name}
              </label>
            {/each}
            {#if nonGMUsers.length === 0}
              <p class="hint">{localize('FABRICATE.Editor.Visibility.NoNonGmUsers')}</p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    {#if featureState.showRecipeVisibilityKnowledge}
      <div class="linked-item-section">
        <h4>{localize('FABRICATE.Editor.LinkedItem.SectionTitle')}</h4>

        {#if linkedItem}
          <div class="linked-item-display">
            <img src={linkedItem.img || 'icons/svg/item-bag.svg'} alt={linkedItem.name} class="linked-item-img" />
            <div class="linked-item-info">
              <strong>{linkedItem.name}</strong>
              <span class="uuid-text">{linkedRecipeItemUuid}</span>
            </div>
            <button type="button" onclick={onClearLinkedItem} title={localize('FABRICATE.Editor.LinkedItem.ClearButton')}>
              <i class="fas fa-times"></i>
            </button>
          </div>
        {:else}
          <div class="linked-item-empty">
            <input
              type="text"
              value={linkedRecipeItemUuid}
              placeholder={localize('FABRICATE.Editor.LinkedItem.UuidPlaceholder')}
              oninput={(e) => onSetLinkedItemUuid?.(e.target.value)}
            />
            <div class="linked-item-buttons">
              <button type="button" onclick={onBrowseLinkedItem}>
                <i class="fas fa-search"></i> {localize('FABRICATE.Editor.LinkedItem.BrowseButton')}
              </button>
              <button type="button" onclick={onCreateLinkedItem}>
                <i class="fas fa-plus"></i> {localize('FABRICATE.Editor.LinkedItem.CreateButton')}
              </button>
            </div>

            {#if featureState.requiresLinkedRecipeItem && !linkedRecipeItemUuid}
              <p class="validation-warning">
                <i class="fas fa-exclamation-triangle"></i>
                {localize('FABRICATE.Editor.LinkedItem.MissingWarning')}
              </p>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .visibility-section {
    margin-bottom: 0;
    padding: 14px;
    border: 1px solid var(--fabricate-editor-border, rgba(255, 255, 255, 0.14));
    border-radius: 12px;
    background: var(--fabricate-editor-surface, rgba(0, 0, 0, 0.16));
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.2);
  }

  .hint {
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
    font-style: italic;
    margin: 4px 0;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--fabricate-editor-muted-strong, rgba(255, 236, 220, 0.82));
  }

  .user-checkboxes {
    margin-top: 8px;
    padding: 10px 0 0 12px;
    border-left: 1px solid rgba(255, 255, 255, 0.08);
  }

  .user-checkboxes h4 {
    margin: 0 0 6px;
  }

  .user-checkbox {
    margin-bottom: 4px;
  }

  .linked-item-section {
    margin-top: 12px;
  }

  .linked-item-section h4 {
    margin: 0 0 8px;
  }

  .linked-item-display {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
  }

  .linked-item-img {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }

  .linked-item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .uuid-text {
    font-size: 0.8rem;
    color: var(--fabricate-editor-muted, rgba(255, 229, 210, 0.68));
    word-break: break-all;
  }

  .linked-item-empty {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .linked-item-empty input {
    width: 100%;
  }

  .linked-item-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .validation-warning {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--fabricate-editor-danger, rgba(255, 216, 208, 0.95));
    margin: 0;
    font-size: 0.9rem;
    padding: 10px 12px;
    border: 1px solid var(--fabricate-editor-border-danger, rgba(255, 124, 102, 0.48));
    border-radius: 8px;
    background: var(--fabricate-editor-danger-soft, rgba(220, 53, 69, 0.18));
  }
</style>
