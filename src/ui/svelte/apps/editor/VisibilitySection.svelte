<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';

  let {
    featureState = {},
    visibility = { restricted: false, allowedUserIds: [] },
    recipeItemId = '',
    recipeItems = [],
    selectedRecipeItem = null,
    nonGMUsers = [],
    onUpdateVisibility,
    onClearRecipeItem,
    onSelectRecipeItem,
    onAssignRecipeItemFromDrop,
    onCopyRecipeItemSource,
    onDeleteRecipeItem,
    onRefreshRecipeItem
  } = $props();

  let recipeItemSearch = $state('');

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

  function handleRecipeItemDrop(data) {
    onAssignRecipeItemFromDrop?.(data);
  }

  function handleDragStart(event, item) {
    event.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'recipeItem',
      recipeItemId: item.id
    }));
    event.dataTransfer.effectAllowed = 'copy';
  }

  function handleCopySource(recipeItemId, event) {
    event?.stopPropagation?.();
    onCopyRecipeItemSource?.(recipeItemId);
  }

  function handleDeleteRecipeItem(recipeItemId, event) {
    event?.stopPropagation?.();
    onDeleteRecipeItem?.(recipeItemId);
  }

  const filteredRecipeItems = $derived.by(() => {
    const query = String(recipeItemSearch || '').trim().toLowerCase();
    const items = Array.isArray(recipeItems) ? recipeItems : [];
    if (!query) return items;
    return items.filter(item => {
      const fields = [item?.name, item?.sourceItemUuid];
      return fields.some(field => String(field || '').toLowerCase().includes(query));
    });
  });

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
      <div class="recipe-item-section">
        <div class="recipe-item-section-header">
          <h4>{localize('FABRICATE.Editor.LinkedItem.SectionTitle')}</h4>
          <p class="hint">{localize('FABRICATE.Editor.LinkedItem.KnowledgeHint')}</p>
        </div>

        <div class="recipe-item-layout">
          <div class="recipe-item-target-column">
            <div
              class="recipe-item-target"
              data-field="recipeItemId"
              use:dragDrop={{ onDrop: handleRecipeItemDrop, activeClass: 'recipe-item-drop-active' }}
            >
              {#if selectedRecipeItem}
                <div class="recipe-item-current">
                  <button
                    type="button"
                    class="recipe-item-summary"
                    onclick={() => onRefreshRecipeItem?.()}
                    title={localize('FABRICATE.Editor.LinkedItem.RefreshButton')}
                  >
                    <img
                      src={selectedRecipeItem.img || 'icons/svg/item-bag.svg'}
                      alt={selectedRecipeItem.name}
                      class="recipe-item-img"
                    />
                    <span class="recipe-item-text">
                      <strong>{selectedRecipeItem.name}</strong>
                      {#if selectedRecipeItem.sourceMissing}
                        <span class="recipe-item-warning">
                          {localize('FABRICATE.Editor.LinkedItem.MissingSource')}
                        </span>
                      {:else}
                        <span class="recipe-item-summary-hint">
                          {localize('FABRICATE.Editor.LinkedItem.RefreshHint')}
                        </span>
                      {/if}
                    </span>
                  </button>

                  <div class="recipe-item-action-group">
                    {#if selectedRecipeItem.sourceItemUuid}
                      <button
                        type="button"
                        class="recipe-item-icon-button"
                        onclick={(event) => handleCopySource(selectedRecipeItem.id, event)}
                        title={selectedRecipeItem.sourceItemUuid}
                        aria-label={localize('FABRICATE.Admin.Items.CopySourceUuid')}
                      >
                        <i class="fas fa-copy"></i>
                      </button>
                    {/if}
                    <button
                      type="button"
                      class="recipe-item-icon-button"
                      onclick={() => onRefreshRecipeItem?.()}
                      title={localize('FABRICATE.Editor.LinkedItem.RefreshButton')}
                      aria-label={localize('FABRICATE.Editor.LinkedItem.RefreshButton')}
                    >
                      <i class="fas fa-rotate-right"></i>
                    </button>
                    <button
                      type="button"
                      class="recipe-item-icon-button"
                      onclick={onClearRecipeItem}
                      title={localize('FABRICATE.Editor.LinkedItem.ClearButton')}
                      aria-label={localize('FABRICATE.Editor.LinkedItem.ClearButton')}
                    >
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                </div>
              {:else}
                <div class="recipe-item-empty">
                  <i class="fas fa-scroll"></i>
                  <div class="recipe-item-empty-text">
                    <strong>{localize('FABRICATE.Editor.LinkedItem.EmptyTitle')}</strong>
                    <span>{localize('FABRICATE.Editor.LinkedItem.DropHint')}</span>
                  </div>
                </div>
              {/if}
            </div>

            {#if featureState.requiresLinkedRecipeItem && !recipeItemId}
              <p class="validation-warning">
                <i class="fas fa-exclamation-triangle"></i>
                {localize('FABRICATE.Editor.LinkedItem.MissingWarning')}
              </p>
            {/if}
          </div>

          <div class="recipe-item-picker">
            <div class="recipe-item-picker-header">
              <h5>{localize('FABRICATE.Editor.LinkedItem.AvailableTitle')}</h5>
              <input
                type="search"
                class="recipe-item-search"
                value={recipeItemSearch}
                oninput={(event) => { recipeItemSearch = event.target.value; }}
                placeholder={localize('FABRICATE.Editor.LinkedItem.SearchPlaceholder')}
                aria-label={localize('FABRICATE.Editor.LinkedItem.SearchLabel')}
              />
            </div>

            {#if recipeItems.length > 0}
              {#if filteredRecipeItems.length > 0}
                <div class="recipe-item-list">
                  {#each filteredRecipeItems as item (item.id)}
                    <article class:selected={item.id === recipeItemId} class="recipe-item-row">
                      <button
                        type="button"
                        class="recipe-item-row-main"
                        draggable="true"
                        ondragstart={(event) => handleDragStart(event, item)}
                        onclick={() => onSelectRecipeItem?.(item.id)}
                        title={item.name}
                      >
                        <img
                          src={item.img || 'icons/svg/item-bag.svg'}
                          alt={item.name}
                          class="recipe-item-row-img"
                        />
                        <span class="recipe-item-row-text">
                          <span class="recipe-item-row-name">{item.name}</span>
                          {#if item.sourceMissing}
                            <span class="recipe-item-row-state">
                              {localize('FABRICATE.Editor.LinkedItem.MissingSource')}
                            </span>
                          {/if}
                        </span>
                      </button>

                      <div class="recipe-item-row-actions">
                        {#if item.sourceItemUuid}
                          <button
                            type="button"
                            class="recipe-item-icon-button"
                            onclick={(event) => handleCopySource(item.id, event)}
                            title={item.sourceItemUuid}
                            aria-label={localize('FABRICATE.Admin.Items.CopySourceUuid')}
                          >
                            <i class="fas fa-copy"></i>
                          </button>
                        {/if}
                        <button
                          type="button"
                          class="recipe-item-icon-button danger"
                          onclick={(event) => handleDeleteRecipeItem(item.id, event)}
                          title={localize('FABRICATE.Editor.LinkedItem.DeleteButton')}
                          aria-label={localize('FABRICATE.Editor.LinkedItem.DeleteButton')}
                        >
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </article>
                  {/each}
                </div>
              {:else}
                <p class="hint">{localize('FABRICATE.Editor.LinkedItem.NoSearchResults')}</p>
              {/if}
            {:else}
              <p class="hint">{localize('FABRICATE.Editor.LinkedItem.EmptyLibrary')}</p>
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .visibility-section {
    margin-bottom: 0;
    padding: 14px;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    border-radius: 12px;
    background: var(--fab-editor-surface, var(--fab-overlay-dark-16));
    box-shadow: 0 14px 32px var(--fab-overlay-dark-20);
  }

  .hint {
    color: var(--fab-editor-muted, var(--fab-editor-muted));
    font-style: italic;
    margin: 4px 0;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .user-checkboxes {
    margin-top: 8px;
    padding: 10px 0 0 12px;
    border-left: 1px solid var(--fab-overlay-light-08);
  }

  .user-checkboxes h4 {
    margin: 0 0 6px;
  }

  .user-checkbox {
    margin-bottom: 4px;
  }

  .recipe-item-section {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .recipe-item-section-header h4,
  .recipe-item-picker-header h5 {
    margin: 0;
  }

  .recipe-item-layout {
    display: grid;
    grid-template-columns: minmax(0, 232px) minmax(0, 1fr);
    gap: 12px;
    align-items: stretch;
  }

  .recipe-item-target-column,
  .recipe-item-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .recipe-item-target {
    min-height: 182px;
    height: 100%;
    padding: 10px 8px;
    box-sizing: border-box;
    border: 1px dashed var(--fab-overlay-light-22);
    border-radius: 10px;
    background: var(--fab-overlay-light-03);
    overflow: hidden;
    transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
  }

  .recipe-item-target:global(.recipe-item-drop-active) {
    border-color: var(--fab-info-border);
    background: var(--fab-blue-soft);
    transform: translateY(-1px);
  }

  .recipe-item-current {
    display: flex;
    align-items: stretch;
    gap: 10px;
    min-width: 0;
    height: 100%;
  }

  .recipe-item-summary,
  .recipe-item-row-main {
    appearance: none;
    -webkit-appearance: none;
    border: 0;
    background: transparent;
    box-sizing: border-box;
    padding: 0;
    margin: 0;
    min-width: 0;
    min-height: 0;
    color: inherit;
    font: inherit;
    line-height: 1.1;
    text-align: left;
  }

  .recipe-item-summary {
    display: flex;
    flex: 0 0 152px;
    align-items: flex-end;
    justify-content: flex-end;
    width: 152px;
    height: 152px;
    position: relative;
    box-sizing: border-box;
    padding: 0;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    border-radius: 10px;
    background: var(--fab-editor-input-bg, var(--fab-overlay-light-04));
    overflow: hidden;
    cursor: pointer;
  }

  .recipe-item-empty {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 74px;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .recipe-item-empty i {
    font-size: 1.4rem;
  }

  .recipe-item-empty-text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .recipe-item-img,
  .recipe-item-row-img {
    border-radius: 8px;
    object-fit: cover;
    flex: 0 0 auto;
    background: var(--fab-overlay-light-05);
  }

  .recipe-item-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border-radius: 0;
    object-fit: cover;
  }

  .recipe-item-row-img {
    width: 24px;
    height: 24px;
    max-width: 24px;
    max-height: 24px;
    display: block;
    margin: 2px 0;
    border-radius: 6px;
  }

  .recipe-item-text,
  .recipe-item-row-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
  }

  .recipe-item-text {
    position: relative;
    z-index: 1;
    align-items: flex-start;
    justify-content: flex-end;
    width: 100%;
    min-height: 54px;
    gap: 3px;
    padding: 8px 9px 9px;
    box-sizing: border-box;
    background: var(--fab-overlay-dark-70);
  }

  .recipe-item-row-text {
    align-items: flex-start;
    justify-content: center;
  }

  .recipe-item-text strong {
    display: -webkit-box;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    -webkit-box-orient: vertical;
    line-clamp: 2;
    -webkit-line-clamp: 2;
  }

  .recipe-item-row-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
    text-align: left;
  }

  .recipe-item-summary-hint,
  .recipe-item-row-state,
  .recipe-item-warning {
    display: -webkit-box;
    font-size: 0.78rem;
    line-height: 1.3;
    color: var(--fab-editor-muted, var(--fab-editor-muted));
    overflow: hidden;
    white-space: normal;
    -webkit-box-orient: vertical;
  }

  .recipe-item-warning,
  .recipe-item-row-state {
    color: var(--fab-editor-danger, var(--fab-editor-danger));
  }

  .recipe-item-summary-hint,
  .recipe-item-warning {
    line-clamp: 3;
    -webkit-line-clamp: 3;
  }

  .recipe-item-row-state {
    line-clamp: 2;
    -webkit-line-clamp: 2;
    text-align: left;
  }

  .recipe-item-action-group,
  .recipe-item-row-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
  }

  .recipe-item-action-group {
    flex-direction: column;
    justify-content: flex-start;
    align-self: stretch;
  }

  .recipe-item-icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    border-radius: 8px;
    background: var(--fab-editor-input-bg, var(--fab-overlay-light-04));
    color: var(--fab-editor-text, var(--fab-editor-text));
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  }

  .recipe-item-icon-button:hover {
    background: var(--fab-overlay-light-12);
    border-color: var(--fab-overlay-light-24);
    transform: translateY(-1px);
  }

  .recipe-item-icon-button.danger:hover {
    border-color: var(--fab-danger-border);
    color: var(--fab-editor-danger, var(--fab-editor-danger));
  }

  .recipe-item-picker-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .recipe-item-picker-header h5 {
    font-size: 0.96rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    color: var(--fab-editor-muted-strong, var(--fab-editor-muted-strong));
  }

  .recipe-item-search {
    width: 100%;
    min-width: 0;
  }

  .recipe-item-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 248px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .recipe-item-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding: 8px 12px;
    box-sizing: border-box;
    border: 1px solid var(--fab-editor-border, var(--fab-overlay-light-14));
    border-radius: 10px;
    background: var(--fab-editor-input-bg, var(--fab-overlay-light-04));
    min-width: 0;
    overflow: hidden;
  }

  .recipe-item-row.selected {
    border-color: var(--fab-info-border);
    background: var(--fab-blue-soft);
  }

  .recipe-item-row-main {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    flex: 1;
    width: 100%;
    min-width: 0;
    min-height: 0;
    height: auto;
    overflow: hidden;
    box-sizing: border-box;
    padding: 8px 12px 8px 10px;
    border: 1px solid var(--fab-overlay-light-08);
    border-radius: 8px;
    background: var(--fab-overlay-light-02);
    cursor: pointer;
  }

  .validation-warning {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    color: var(--fab-editor-danger, var(--fab-editor-danger));
    margin: 0;
    font-size: 0.9rem;
    padding: 10px 12px;
    border: 1px solid var(--fab-editor-border-danger, var(--fab-editor-border-danger));
    border-radius: 8px;
    background: var(--fab-editor-danger-soft, var(--fab-editor-danger-soft));
  }

  @media (max-width: 900px) {
    .recipe-item-layout {
      grid-template-columns: 1fr;
    }

    .recipe-item-list {
      max-height: 220px;
    }
  }
</style>
