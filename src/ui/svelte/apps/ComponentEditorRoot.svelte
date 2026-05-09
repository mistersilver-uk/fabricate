<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import {
    adjustComponentEssenceQuantity,
    clampComponentEssenceQuantity
  } from '../util/componentEditor.js';

  let {
    editorState = {
      itemName: '',
      hintKey: '',
      showTags: false,
      showEssences: false,
      hasEditableFields: false,
      tagOptions: [],
      essenceOptions: []
    },
    onSave,
    onClose
  } = $props();

  const cloneTagOptions = (options = []) => options.map(option => ({
    tag: option.tag,
    checked: option.checked === true
  }));

  const cloneEssenceOptions = (options = []) => options.map(option => ({
    id: option.id,
    name: option.name,
    icon: option.icon,
    quantity: clampComponentEssenceQuantity(option.quantity)
  }));

  let tagDraft = $state([]);
  let essenceDraft = $state([]);
  let saving = $state(false);

  $effect(() => {
    tagDraft = cloneTagOptions(editorState.tagOptions);
    essenceDraft = cloneEssenceOptions(editorState.essenceOptions);
  });

  function setEssenceQuantity(essenceId, rawValue) {
    const quantity = clampComponentEssenceQuantity(rawValue);
    const option = essenceDraft.find(entry => entry.id === essenceId);
    if (option) option.quantity = quantity;
  }

  function adjustEssenceQuantity(essenceId, delta) {
    const option = essenceDraft.find(entry => entry.id === essenceId);
    if (!option) return;
    option.quantity = adjustComponentEssenceQuantity(option.quantity, delta);
  }

  async function handleSave() {
    if (saving || !editorState.hasEditableFields) return;
    saving = true;
    try {
      await onSave?.({
        showTags: editorState.showTags,
        showEssences: editorState.showEssences,
        tagOptions: tagDraft,
        essenceOptions: essenceDraft
      });
    } finally {
      saving = false;
    }
  }
</script>

<div class="fabricate-component-editor">
  <header class="component-editor-header">
    <h2>{localize('FABRICATE.Admin.Items.Editor.WindowTitle', { name: editorState.itemName })}</h2>
    {#if editorState.hasEditableFields}
      <p class="hint">{localize(editorState.hintKey)}</p>
    {/if}
  </header>

  <div class="component-editor-body">
    {#if editorState.showTags}
      <section class="component-editor-section">
        <h3>{localize('FABRICATE.Admin.Items.Tags')}</h3>
        {#if tagDraft.length > 0}
          <div class="tag-grid">
            {#each tagDraft as option (option.tag)}
              <label class="tag-chip">
                <input type="checkbox" bind:checked={option.checked} />
                <span>{option.tag}</span>
              </label>
            {/each}
          </div>
        {:else}
          <p class="hint">{localize('FABRICATE.Admin.Items.Editor.NoTagsDefined')}</p>
        {/if}
      </section>
    {/if}

    {#if editorState.showEssences}
      <section class="component-editor-section">
        <h3>{localize('FABRICATE.Admin.Items.Essences')}</h3>
        {#if essenceDraft.length > 0}
          <div class="essence-grid">
            {#each essenceDraft as option (option.id)}
              <article class="essence-card">
                <button
                  type="button"
                  class="essence-step essence-step-minus"
                  onclick={() => adjustEssenceQuantity(option.id, -1)}
                  aria-label={localize('FABRICATE.Admin.Items.Editor.DecrementEssence', { name: option.name })}
                  title={localize('FABRICATE.Admin.Items.Editor.DecrementEssence', { name: option.name })}
                >
                  <i class="fas fa-minus"></i>
                </button>

                <input
                  class="essence-quantity-input"
                  type="number"
                  min="0"
                  step="1"
                  value={option.quantity}
                  aria-label={localize('FABRICATE.Admin.Items.Editor.QuantityLabel', { name: option.name })}
                  oninput={(event) => setEssenceQuantity(option.id, event.currentTarget.value)}
                />

                <div class="essence-icon" aria-hidden="true">
                  <i class={option.icon}></i>
                </div>

                <strong class="essence-name">{option.name}</strong>

                <button
                  type="button"
                  class="essence-step essence-step-plus"
                  onclick={() => adjustEssenceQuantity(option.id, 1)}
                  aria-label={localize('FABRICATE.Admin.Items.Editor.IncrementEssence', { name: option.name })}
                  title={localize('FABRICATE.Admin.Items.Editor.IncrementEssence', { name: option.name })}
                >
                  <i class="fas fa-plus"></i>
                </button>
              </article>
            {/each}
          </div>
        {:else}
          <p class="hint">{localize('FABRICATE.Admin.Items.Editor.NoEssencesDefined')}</p>
        {/if}
      </section>
    {/if}

    {#if !editorState.hasEditableFields}
      <section class="component-editor-section">
        <p class="hint">{localize('FABRICATE.Admin.Items.Editor.NoEditableFields')}</p>
      </section>
    {/if}
  </div>

  <footer class="component-editor-footer">
    <button type="button" class="cancel-btn" onclick={() => onClose?.()}>
      {localize('FABRICATE.Admin.Items.Editor.Cancel')}
    </button>
    <button
      type="button"
      class="save-btn"
      onclick={handleSave}
      disabled={saving || !editorState.hasEditableFields}
    >
      {localize('FABRICATE.Admin.Items.Editor.Save')}
    </button>
  </footer>
</div>

<style>
  .fabricate-component-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .component-editor-header {
    padding: 14px 16px 10px;
    border-bottom: 1px solid var(--fab-border);
    flex-shrink: 0;
  }

  .component-editor-header h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  .component-editor-header .hint {
    margin: 6px 0 0;
  }

  .component-editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .component-editor-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .component-editor-section h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  .tag-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--fab-border);
    background: var(--fab-overlay-dark-05);
  }

  .tag-chip input {
    margin: 0;
  }

  .essence-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .essence-card {
    display: grid;
    grid-template-columns: auto auto auto 1fr auto;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 9px;
    border: 1px solid var(--fab-border);
    background: var(--fab-overlay-dark-05);
  }

  .essence-icon {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: var(--fab-overlay-dark-08);
    flex: 0 0 auto;
  }

  .essence-icon i {
    font-size: 13px;
  }

  .essence-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.88rem;
  }

  .essence-quantity-input {
    width: 44px;
    min-width: 44px;
    height: 28px;
    text-align: center;
    padding: 0 4px;
  }

  .essence-quantity-input::-webkit-outer-spin-button,
  .essence-quantity-input::-webkit-inner-spin-button {
    margin: 0;
  }

  .essence-step {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    border: 1px solid var(--fab-border-strong);
    background: var(--fab-overlay-dark-04, var(--fab-overlay-dark-05));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: inherit;
  }

  .essence-step i {
    font-size: 9px;
    opacity: 0.85;
  }

  .essence-step:hover,
  .essence-step:focus-visible {
    border-color: var(--color-text-accent, var(--fab-text-subtle));
    background: var(--fab-overlay-dark-08);
  }

  .component-editor-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--fab-border);
    flex-shrink: 0;
  }

  .component-editor-footer button {
    min-width: 120px;
  }

  @media (max-width: 560px) {
    .component-editor-body {
      padding: 12px;
    }

    .essence-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 420px) {
    .essence-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
