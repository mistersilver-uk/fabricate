<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import { clampComponentEssenceQuantity } from '../util/componentEditor.js';
  // The shared numeric stepper (issue 1050). This card used to hand-roll the −/+ pair
  // around a bare `type="number"`, which duplicated the primitive's shape without its
  // clamp, its commit path or its spinner suppression. It takes the INLINE default
  // rather than `fill`: the card is an `auto auto 1fr` grid with no sized slot for the
  // control to fill.
  import Stepper from '../components/Stepper.svelte';
  // The add-new offer projection (issue 1036). This standalone window reaches the SAME
  // whitelist rebuild the in-manager editor does — `handleSave` hands `essenceDraft`
  // straight to `buildComponentEditorUpdates` — so the draft stays whole and only the
  // rendered grid narrows.
  import { visibleEssenceOptions } from '../../../utils/essenceValidation.js';

  let {
    editorState = {
      itemName: '',
      hintKey: '',
      showTags: false,
      showEssences: false,
      hasEditableFields: false,
      tagOptions: [],
      essenceOptions: [],
    },
    onSave,
    onClose,
  } = $props();

  const cloneTagOptions = (options = []) =>
    options.map((option) => ({
      tag: option.tag,
      checked: option.checked === true,
    }));

  const cloneEssenceOptions = (options = []) =>
    options.map((option) => ({
      id: option.id,
      name: option.name,
      icon: option.icon,
      // Carried through the clone, or the offer filter below can never see it.
      enabled: option.enabled !== false,
      quantity: clampComponentEssenceQuantity(option.quantity),
    }));

  let tagDraft = $state([]);
  let essenceDraft = $state([]);
  // Every ENABLED essence, plus any disabled one this component already carries. The
  // draft stays whole; only the offer narrows (issue 1036).
  const offeredEssences = $derived(
    visibleEssenceOptions(
      essenceDraft,
      (option) => clampComponentEssenceQuantity(option?.quantity) > 0
    )
  );
  let saving = $state(false);

  $effect(() => {
    tagDraft = cloneTagOptions(editorState.tagOptions);
    essenceDraft = cloneEssenceOptions(editorState.essenceOptions);
  });

  function setEssenceQuantity(essenceId, rawValue) {
    const quantity = clampComponentEssenceQuantity(rawValue);
    const option = essenceDraft.find((entry) => entry.id === essenceId);
    if (option) option.quantity = quantity;
  }

  async function handleSave() {
    if (saving || !editorState.hasEditableFields) return;
    saving = true;
    try {
      await onSave?.({
        showTags: editorState.showTags,
        showEssences: editorState.showEssences,
        tagOptions: tagDraft,
        essenceOptions: essenceDraft,
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
            {#each offeredEssences as option (option.id)}
              <article class="essence-card">
                <Stepper
                  value={option.quantity}
                  min={0}
                  ariaLabel={localize('FABRICATE.Admin.Items.Editor.QuantityLabel', {
                    name: option.name,
                  })}
                  decrementLabel={localize('FABRICATE.Admin.Items.Editor.DecrementEssence', {
                    name: option.name,
                  })}
                  incrementLabel={localize('FABRICATE.Admin.Items.Editor.IncrementEssence', {
                    name: option.name,
                  })}
                  onChange={(next) => setEssenceQuantity(option.id, next)}
                />

                <div class="essence-icon" aria-hidden="true">
                  <i class={option.icon}></i>
                </div>

                <strong class="essence-name">{option.name}</strong>
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

  /* Three tracks, not five. The card once ran [−][qty][icon][name][+] and put the
     control before the thing it counted with its `+` stranded on the trailing edge;
     folding the pair onto the shared `Stepper` collapses −/qty/+ into one island and
     the grid to [stepper][icon][name]. */
  .essence-card {
    display: grid;
    grid-template-columns: auto auto 1fr;
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

  /* `.essence-quantity-input`, its half-finished `::-webkit-*-spin-button` suppression and
     the `.essence-step` button treatment are GONE with the hand-rolled pair. They are
     deleted rather than left behind because Svelte does not extend a parent's scope class
     to a child component's internals: a selector kept here would match nothing AND emit
     `Unused CSS selector`, which fails the compiler-warning gate. The stepper's chrome,
     including the spinner suppression, is the primitive's own. */

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
