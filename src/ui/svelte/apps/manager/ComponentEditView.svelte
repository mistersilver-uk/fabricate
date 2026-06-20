<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
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
    saving = false,
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {}
  } = $props();

  let tagDraft = $state([]);
  let essenceDraft = $state([]);
  let tagMenuOpen = $state(false);
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
    tagMenuOpen = false;
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

  function componentImage(item) {
    return item?.img || 'icons/svg/item-bag.svg';
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

  function buildUpdates() {
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
    return updates;
  }

  function buildDraftSummary() {
    return {
      id: component?.id || '',
      name: component?.name || '',
      tagCount: tagDraft.filter(opt => opt.checked).length,
      essenceCount: essenceDraft.filter(opt => clampComponentEssenceQuantity(opt.quantity) > 0).length,
      updates: buildUpdates(),
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

  // Tags author like the gathering availability fields: pick an unselected tag from
  // the dropdown to add it, then remove it from the pill row underneath.
  function availableTagOptions() {
    return tagDraft.filter(option => option.checked !== true);
  }

  function selectedTagOptions() {
    return tagDraft.filter(option => option.checked === true);
  }

  function addTag(tag) {
    toggleTag(tag, true);
    tagMenuOpen = false;
  }

  function removeTag(tag) {
    toggleTag(tag, false);
  }

  function tagMenuLabel() {
    return availableTagOptions().length > 0
      ? text('FABRICATE.Admin.Manager.Component.TagsEdit.AddTag', 'Add tag')
      : text('FABRICATE.Admin.Manager.Component.TagsEdit.AllSelected', 'All tags selected');
  }

  function removeTagLabel(tag) {
    return text('FABRICATE.Admin.Manager.Component.TagsEdit.RemoveTag', 'Remove {name}').replace('{name}', tag);
  }

  async function handleSave(event) {
    event?.preventDefault();
    if (!component?.id || saving) return;
    saveFailed = false;
    const updates = buildUpdates();
    let result = false;
    try {
      result = await onSave(component.id, updates);
    } catch (err) {
      result = false;
    }
    if (result === false) saveFailed = true;
  }
</script>

<main
  class="manager-main manager-component-edit-main"
  aria-label={text('FABRICATE.Admin.Manager.Component.EditTitle', 'Edit component')}
>
  <form
    id="manager-component-edit-form"
    class="manager-component-edit-view"
    onsubmit={handleSave}
  >
    <section class="manager-task-core-card" data-component-edit-section="identity">
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Component.Identity.Title', 'Identity')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Identity.SourceBackedHint', 'This component is backed by a Foundry item. Changes to its source item’s name, image, or description will be reflected here.')}</p>
        </div>
      </div>
      <div class="manager-task-core-grid">
        <div class="manager-task-media-column">
          <span
            class="manager-task-image-picker is-source-linked"
            data-component-locked-image
            title={text('FABRICATE.Admin.Manager.Component.Identity.SourceLockedImageTooltip', "This image comes from the linked Foundry item and can't be edited here.")}
            aria-label={text('FABRICATE.Admin.Manager.Component.Identity.SourceLockedImage', 'Image provided by the linked Foundry item')}
          >
            <img src={componentImage(component)} alt="" />
            <i class="fas fa-lock" aria-hidden="true"></i>
          </span>
        </div>
        <div class="manager-task-identity-fields">
          <div class="manager-field manager-component-readonly-field">
            <span class="manager-component-readonly-label">
              <i class="fas fa-lock" aria-hidden="true" title={text('FABRICATE.Admin.Manager.Component.Identity.LockedFieldTooltip', "Provided by the linked Foundry item and can't be edited here.")}></i>
              <span>{text('FABRICATE.Admin.Manager.Component.Identity.NameLabel', 'Name')}</span>
            </span>
            <p class="manager-component-readonly-value" data-component-edit-field="name">{component?.name || '—'}</p>
          </div>

          <div class="manager-field manager-component-readonly-field">
            <span class="manager-component-readonly-label">
              <i class="fas fa-lock" aria-hidden="true" title={text('FABRICATE.Admin.Manager.Component.Identity.LockedFieldTooltip', "Provided by the linked Foundry item and can't be edited here.")}></i>
              <span>{text('FABRICATE.Admin.Manager.Component.Identity.DescriptionLabel', 'Description')}</span>
            </span>
            <p class="manager-component-readonly-value is-multiline" data-component-edit-field="description">{component?.description || '—'}</p>
          </div>
        </div>
      </div>
    </section>

    {#if showTags}
      <section class="manager-task-core-card" data-component-edit-section="tags">
        <div class="manager-task-card-heading">
          <div>
            <h3>{text('FABRICATE.Admin.Manager.Component.TagsEdit.Title', 'Tags')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.TagsEdit.Hint', 'Toggle the item tags that apply to this component.')}</p>
          </div>
        </div>
        {#if tagDraft.length > 0}
          <div class="manager-field manager-availability-multi" data-component-edit-tags>
            <div
              class="manager-availability-picker"
              use:dismissOnOutsideClick={{
                enabled: tagMenuOpen,
                onDismiss: () => { tagMenuOpen = false; }
              }}
            >
              <button
                type="button"
                class="manager-availability-menu-button"
                aria-haspopup="listbox"
                aria-expanded={tagMenuOpen}
                data-component-edit-tag-menu
                onclick={() => tagMenuOpen = !tagMenuOpen}
                disabled={saving}
              >
                <span>{tagMenuLabel()}</span>
                <i class="fas fa-chevron-down" aria-hidden="true"></i>
              </button>
              {#if tagMenuOpen}
                <div class="manager-availability-menu" role="listbox" aria-label={text('FABRICATE.Admin.Manager.Component.TagsEdit.Title', 'Tags')}>
                  {#if availableTagOptions().length > 0}
                    {#each availableTagOptions() as option (option.tag)}
                      <button
                        type="button"
                        class="manager-availability-option"
                        role="option"
                        aria-selected="false"
                        data-component-edit-tag-option={option.tag}
                        onclick={() => addTag(option.tag)}
                      >
                        <i class="fas fa-tag" aria-hidden="true"></i>
                        <span>{option.tag}</span>
                      </button>
                    {/each}
                  {:else}
                    <span class="manager-availability-empty">{text('FABRICATE.Admin.Manager.Component.TagsEdit.AllSelected', 'All tags selected')}</span>
                  {/if}
                </div>
              {/if}
            </div>
            <div class="manager-availability-pill-row" data-component-edit-tag-pills>
              {#if selectedTagOptions().length > 0}
                {#each selectedTagOptions() as option (option.tag)}
                  <span class="manager-availability-pill" data-component-edit-tag-pill={option.tag}>
                    <i class="fas fa-tag" aria-hidden="true"></i>
                    <span>{option.tag}</span>
                    <button type="button" class="manager-availability-remove" aria-label={removeTagLabel(option.tag)} onclick={() => removeTag(option.tag)} disabled={saving}>
                      <i class="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted manager-availability-any">{text('FABRICATE.Admin.Manager.Component.TagsEdit.NoneSelected', 'No tags applied')}</span>
              {/if}
            </div>
          </div>
        {:else}
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.TagsEdit.NoTags', 'No tags are defined for this system yet.')}</p>
        {/if}
        </section>
      {/if}

      {#if showEssences}
        <section class="manager-task-core-card" data-component-edit-section="essences">
          <div class="manager-task-card-heading">
            <div>
              <h3>{text('FABRICATE.Admin.Manager.Component.EssencesEdit.Title', 'Essences')}</h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.EssencesEdit.Hint', 'Set how much of each essence this component contributes.')}</p>
            </div>
          </div>
          {#if essenceDraft.length > 0}
            <div class="manager-component-essence-grid">
              {#each essenceDraft as option (option.id)}
                <article class="manager-component-essence-card" data-component-edit-essence={option.id}>
                  <button
                    type="button"
                    class="manager-icon-button"
                    onclick={() => adjustEssence(option.id, -1)}
                    aria-label={text('FABRICATE.Admin.Items.Editor.DecrementEssence', 'Decrement {name}').replace('{name}', option.name)}
                    title={text('FABRICATE.Admin.Items.Editor.DecrementEssence', 'Decrement {name}').replace('{name}', option.name)}
                    disabled={saving}
                  >
                    <i class="fas fa-minus" aria-hidden="true"></i>
                  </button>

                  <input
                    class="manager-component-essence-quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={option.quantity}
                    aria-label={text('FABRICATE.Admin.Items.Editor.QuantityLabel', 'Quantity for {name}').replace('{name}', option.name)}
                    oninput={(event) => setEssenceQuantity(option.id, event.currentTarget.value)}
                    disabled={saving}
                  />

                  <button
                    type="button"
                    class="manager-icon-button"
                    onclick={() => adjustEssence(option.id, 1)}
                    aria-label={text('FABRICATE.Admin.Items.Editor.IncrementEssence', 'Increment {name}').replace('{name}', option.name)}
                    title={text('FABRICATE.Admin.Items.Editor.IncrementEssence', 'Increment {name}').replace('{name}', option.name)}
                    disabled={saving}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                  </button>

                  <span class="manager-component-essence-icon" aria-hidden="true">
                    <i class={option.icon || 'fas fa-mortar-pestle'}></i>
                  </span>

                  <strong class="manager-component-essence-name">{option.name}</strong>
                </article>
              {/each}
            </div>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.EssencesEdit.NoEssences', 'No essences are defined for this system yet.')}</p>
          {/if}
        </section>
      {/if}

    {#if saveFailed}
      <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Component.SaveFailed', 'Save failed. Try again or refresh the manager.')}</p>
    {/if}
  </form>
</main>
