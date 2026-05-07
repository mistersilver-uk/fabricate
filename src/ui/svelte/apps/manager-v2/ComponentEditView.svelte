<!-- Svelte 5 runes mode -->
<script>
  import { dragDrop } from '../../actions/dragDrop.js';
  import { localize } from '../../util/foundryBridge.js';
  import {
    adjustComponentEssenceQuantity,
    clampComponentEssenceQuantity
  } from '../../util/componentEditor.js';

  let {
    component = null,
    tagOptions = [],
    essenceOptions = [],
    showTags = false,
    showEssences = false,
    showSourceUi = true,
    saving = false,
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onReplaceSource = () => {},
    onUnlinkSource = () => {},
    onOpenSource = () => {},
    onCopySourceUuid = () => {}
  } = $props();

  let activeTab = $state('details');
  let tagDraft = $state([]);
  let essenceDraft = $state([]);
  let saveFailed = $state(false);
  let lastComponentKey = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');

  const componentKey = $derived(`${component?.id || ''}|${tagOptions.length}|${essenceOptions.length}`);
  const dirty = $derived(isDirty());
  const draftSummary = $derived(buildDraftSummary());
  const draftSignature = $derived([
    component?.id || '',
    tagDraft.filter(opt => opt.checked).map(opt => opt.tag).sort().join(','),
    essenceDraft.map(opt => `${opt.id}:${opt.quantity}`).sort().join(','),
    dirty ? 'dirty' : 'clean'
  ].join(''));

  $effect(() => {
    if (componentKey === lastComponentKey) return;
    tagDraft = cloneTagOptions(tagOptions);
    essenceDraft = cloneEssenceOptions(essenceOptions);
    saveFailed = false;
    lastComponentKey = componentKey;
  });

  $effect(() => {
    if (dirty === lastDirty) return;
    lastDirty = dirty;
    onDirtyChange(dirty);
  });

  $effect(() => {
    if (draftSignature === lastDraftSignature) return;
    lastDraftSignature = draftSignature;
    onDraftChange(draftSummary);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function cloneTagOptions(options = []) {
    return (options || []).map(option => ({
      tag: option.tag,
      checked: option.checked === true
    }));
  }

  function cloneEssenceOptions(options = []) {
    return (options || []).map(option => ({
      id: option.id,
      name: option.name,
      icon: option.icon,
      quantity: clampComponentEssenceQuantity(option.quantity)
    }));
  }

  function tagsAreEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i].tag !== right[i].tag) return false;
      if ((left[i].checked === true) !== (right[i].checked === true)) return false;
    }
    return true;
  }

  function essencesAreEqual(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i].id !== right[i].id) return false;
      if (clampComponentEssenceQuantity(left[i].quantity) !== clampComponentEssenceQuantity(right[i].quantity)) return false;
    }
    return true;
  }

  function isDirty() {
    if (!component) return false;
    if (showTags && !tagsAreEqual(tagDraft, tagOptions)) return true;
    if (showEssences && !essencesAreEqual(essenceDraft, essenceOptions)) return true;
    return false;
  }

  function buildDraftSummary() {
    return {
      id: component?.id || '',
      name: component?.name || '',
      tagCount: tagDraft.filter(opt => opt.checked).length,
      essenceCount: essenceDraft.filter(opt => clampComponentEssenceQuantity(opt.quantity) > 0).length,
      dirty
    };
  }

  function setEssenceQuantity(essenceId, rawValue) {
    const quantity = clampComponentEssenceQuantity(rawValue);
    const next = essenceDraft.map(entry => entry.id === essenceId ? { ...entry, quantity } : entry);
    essenceDraft = next;
  }

  function adjustEssence(essenceId, delta) {
    const next = essenceDraft.map(entry => {
      if (entry.id !== essenceId) return entry;
      return { ...entry, quantity: adjustComponentEssenceQuantity(entry.quantity, delta) };
    });
    essenceDraft = next;
  }

  function toggleTag(tag, checked) {
    const next = tagDraft.map(entry => entry.tag === tag ? { ...entry, checked: checked === true } : entry);
    tagDraft = next;
  }

  function tabClass(id) {
    return `manager-v2-component-edit-tab ${activeTab === id ? 'is-active' : ''}`;
  }

  function selectTab(id) {
    activeTab = id;
  }

  async function handleSave(event) {
    event?.preventDefault();
    if (!component?.id || saving) return;
    saveFailed = false;
    const updates = {};
    if (showTags) {
      updates.tags = tagDraft.filter(opt => opt.checked).map(opt => opt.tag);
    }
    if (showEssences) {
      const essences = {};
      for (const option of essenceDraft) {
        const quantity = clampComponentEssenceQuantity(option.quantity);
        if (quantity > 0 && option.id) essences[option.id] = quantity;
      }
      updates.essences = essences;
    }
    let result = false;
    try {
      result = await onSave(component.id, updates);
    } catch (err) {
      result = false;
    }
    if (result === false) saveFailed = true;
  }

  function handleSourceDrop(data) {
    if (!component?.id) return;
    onReplaceSource(component.id, data);
  }

  function handleUnlink() {
    if (!component?.id) return;
    onUnlinkSource(component.id);
  }

  function handleOpenSource() {
    if (component?.sourceUuidDisplay) onOpenSource(component.sourceUuidDisplay);
  }

  function handleCopySource() {
    if (component?.sourceUuidDisplay) onCopySourceUuid(component.sourceUuidDisplay);
  }
</script>

<main
  class="manager-v2-main manager-v2-component-edit-main"
  aria-label={text('FABRICATE.Admin.ManagerV2.Component.EditTitle', 'Edit component')}
>
  <form
    id="manager-v2-component-edit-form"
    class="manager-v2-component-edit-view"
    onsubmit={handleSave}
  >
    <div class="manager-v2-component-edit-tabs" role="tablist" aria-label={text('FABRICATE.Admin.ManagerV2.Component.EditTabs', 'Edit component tabs')}>
      <button
        type="button"
        class={tabClass('details')}
        role="tab"
        aria-selected={activeTab === 'details'}
        data-component-edit-tab="details"
        onclick={() => selectTab('details')}
      >
        {text('FABRICATE.Admin.ManagerV2.Component.Tabs.Details', 'Details')}
      </button>
      {#if showTags || showEssences}
        <button
          type="button"
          class={tabClass('tags-essences')}
          role="tab"
          aria-selected={activeTab === 'tags-essences'}
          data-component-edit-tab="tags-essences"
          onclick={() => selectTab('tags-essences')}
        >
          {text('FABRICATE.Admin.ManagerV2.Component.Tabs.TagsEssences', 'Tags & Essences')}
        </button>
      {/if}
    </div>

    {#if activeTab === 'details'}
      <section class="manager-v2-edit-card manager-v2-component-identity" data-component-edit-section="identity">
        <div class="manager-v2-edit-card-heading">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Component.Identity.Title', 'Identity')}</h3>
        </div>

        <div class="manager-v2-component-identity-grid">
          <div class="manager-v2-component-identity-image">
            <span class="manager-v2-component-identity-label">{text('FABRICATE.Admin.ManagerV2.Component.Identity.ImageLabel', 'Image')}</span>
            {#if component?.img}
              <img class="manager-v2-component-preview" src={component.img} alt="" />
            {:else}
              <span class="manager-v2-component-preview is-empty" aria-hidden="true">
                <i class="fas fa-box-open"></i>
              </span>
            {/if}
          </div>

          <div class="manager-v2-component-identity-fields">
            <label class="manager-v2-field" for="manager-v2-component-edit-name">
              <span>{text('FABRICATE.Admin.ManagerV2.Component.Identity.NameLabel', 'Name')}</span>
              <input
                id="manager-v2-component-edit-name"
                type="text"
                value={component?.name || ''}
                readonly
                disabled
              />
            </label>

            <label class="manager-v2-field" for="manager-v2-component-edit-description">
              <span>{text('FABRICATE.Admin.ManagerV2.Component.Identity.DescriptionLabel', 'Description')}</span>
              <textarea
                id="manager-v2-component-edit-description"
                rows="4"
                value={component?.description || ''}
                readonly
                disabled
              ></textarea>
            </label>
          </div>
        </div>

        <p class="manager-v2-muted manager-v2-component-identity-hint">
          {text('FABRICATE.Admin.ManagerV2.Component.Identity.SourceBackedHint', 'This component is backed by a Foundry item. Changes to its source item’s name, image, or description will be reflected here.')}
        </p>
      </section>

      {#if showSourceUi}
        <section class="manager-v2-edit-card manager-v2-component-source-card" data-component-edit-section="source">
          <div class="manager-v2-edit-card-heading">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Component.SourceCard.Title', 'Linked Source Item')}</h3>
            {#if component?.sourceMissing}
              <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Component.SourceOriginMissing', 'Missing')}</span>
            {:else if component?.hasSourceUuid}
              <span class="manager-v2-chip is-active">{component.sourceOriginLabel || text('FABRICATE.Admin.ManagerV2.Component.SourceOriginLinked', 'Linked')}</span>
            {:else}
              <span class="manager-v2-chip is-disabled">{text('FABRICATE.Admin.ManagerV2.Component.SourceCard.NoneLabel', 'No source')}</span>
            {/if}
          </div>

          <div class="manager-v2-component-source-stack">
            <div class="manager-v2-component-source-summary">
              {#if component?.img}
                <img class="manager-v2-component-source-thumb" src={component.img} alt="" />
              {:else}
                <span class="manager-v2-component-source-thumb is-empty" aria-hidden="true">
                  <i class="fas fa-link"></i>
                </span>
              {/if}
              <div class="manager-v2-component-source-copy">
                {#if component?.hasSourceUuid}
                  <strong>{component?.name || ''}</strong>
                  <p class="manager-v2-muted manager-v2-component-source-uuid">{component.sourceUuidDisplay}</p>
                {:else}
                  <strong>{text('FABRICATE.Admin.ManagerV2.Component.SourceCard.NoneLabel', 'No source')}</strong>
                  <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.SourceCard.NoSourceHint', 'Drop or replace a Foundry item to link this component to a source.')}</p>
                {/if}
              </div>
            </div>

            {#if component?.sourceMissing}
              <p class="manager-v2-muted manager-v2-component-source-warning">
                {text('FABRICATE.Admin.ManagerV2.Component.SourceMissingHint', 'The stored source no longer resolves. Replace the component source or verify the original compendium/world item still exists.')}
              </p>
            {/if}

            <div class="manager-v2-component-source-actions">
              <button
                type="button"
                class="manager-v2-button"
                data-component-edit-action="open-source"
                onclick={handleOpenSource}
                disabled={!component?.hasSourceUuid}
              >
                <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Component.SourceCard.Open', 'Open Source Item')}</span>
              </button>
              <button
                type="button"
                class="manager-v2-button"
                data-component-edit-action="copy-source"
                onclick={handleCopySource}
                disabled={!component?.hasSourceUuid}
              >
                <i class="fas fa-copy" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Component.CopySource', 'Copy source UUID')}</span>
              </button>
              <button
                type="button"
                class="manager-v2-button is-danger"
                data-component-edit-action="unlink-source"
                onclick={handleUnlink}
                disabled={!component?.hasSourceUuid}
              >
                <i class="fas fa-link-slash" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.ManagerV2.Component.SourceCard.Unlink', 'Unlink Source Item')}</span>
              </button>
            </div>

            <div
              class="manager-v2-component-source-drop-zone"
              data-component-edit-action="replace-source"
              use:dragDrop={{ onDrop: handleSourceDrop, activeClass: 'is-drop-active' }}
            >
              <i class="fas fa-arrows-rotate" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.ManagerV2.Component.SourceCard.ReplaceHint', 'Drop a Foundry item here to replace the linked source.')}</span>
            </div>
          </div>
        </section>
      {/if}
    {/if}

    {#if activeTab === 'tags-essences'}
      {#if showTags}
        <section class="manager-v2-edit-card" data-component-edit-section="tags">
          <div class="manager-v2-edit-card-heading">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Component.TagsEdit.Title', 'Tags')}</h3>
          </div>
          {#if tagDraft.length > 0}
            <div class="manager-v2-component-tag-grid">
              {#each tagDraft as option (option.tag)}
                <label class="manager-v2-component-tag-option">
                  <input
                    type="checkbox"
                    checked={option.checked}
                    onchange={(event) => toggleTag(option.tag, event.currentTarget.checked)}
                    disabled={saving}
                  />
                  <span>{option.tag}</span>
                </label>
              {/each}
            </div>
          {:else}
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.TagsEdit.NoTags', 'No tags are defined for this system yet.')}</p>
          {/if}
        </section>
      {/if}

      {#if showEssences}
        <section class="manager-v2-edit-card" data-component-edit-section="essences">
          <div class="manager-v2-edit-card-heading">
            <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Component.EssencesEdit.Title', 'Essences')}</h3>
          </div>
          {#if essenceDraft.length > 0}
            <div class="manager-v2-component-essence-grid">
              {#each essenceDraft as option (option.id)}
                <article class="manager-v2-component-essence-card" data-component-edit-essence={option.id}>
                  <button
                    type="button"
                    class="manager-v2-icon-button"
                    onclick={() => adjustEssence(option.id, -1)}
                    aria-label={text('FABRICATE.Admin.Items.Editor.DecrementEssence', 'Decrement {name}').replace('{name}', option.name)}
                    title={text('FABRICATE.Admin.Items.Editor.DecrementEssence', 'Decrement {name}').replace('{name}', option.name)}
                    disabled={saving}
                  >
                    <i class="fas fa-minus" aria-hidden="true"></i>
                  </button>

                  <input
                    class="manager-v2-component-essence-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={option.quantity}
                    aria-label={text('FABRICATE.Admin.Items.Editor.QuantityLabel', 'Quantity for {name}').replace('{name}', option.name)}
                    oninput={(event) => setEssenceQuantity(option.id, event.currentTarget.value)}
                    disabled={saving}
                  />

                  <span class="manager-v2-component-essence-icon" aria-hidden="true">
                    <i class={option.icon || 'fas fa-mortar-pestle'}></i>
                  </span>

                  <strong class="manager-v2-component-essence-name">{option.name}</strong>

                  <button
                    type="button"
                    class="manager-v2-icon-button"
                    onclick={() => adjustEssence(option.id, 1)}
                    aria-label={text('FABRICATE.Admin.Items.Editor.IncrementEssence', 'Increment {name}').replace('{name}', option.name)}
                    title={text('FABRICATE.Admin.Items.Editor.IncrementEssence', 'Increment {name}').replace('{name}', option.name)}
                    disabled={saving}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                  </button>
                </article>
              {/each}
            </div>
          {:else}
            <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.EssencesEdit.NoEssences', 'No essences are defined for this system yet.')}</p>
          {/if}
        </section>
      {/if}

      {#if !showTags && !showEssences}
        <section class="manager-v2-edit-card">
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Component.NoEditableFields', 'There are no editable tag or essence fields for this component in the selected system.')}</p>
        </section>
      {/if}
    {/if}

    {#if saveFailed}
      <p class="manager-v2-muted manager-v2-form-warning">{text('FABRICATE.Admin.ManagerV2.Component.SaveFailed', 'Save failed. Try again or refresh the manager.')}</p>
    {/if}
  </form>
</main>
