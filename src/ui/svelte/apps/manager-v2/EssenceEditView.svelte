<!-- Svelte 5 runes mode -->
<script>
  import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';
  import IconPicker from '../../components/IconPicker.svelte';
  import { DEFAULT_ESSENCE_ICON, normalizeEssenceIcon } from '../../util/essenceIcons.js';
  import { localize } from '../../util/foundryBridge.js';

  let {
    essence = null,
    managedItemOptions = [],
    showSourceUi = false,
    saving = false,
    onSave = () => {},
    onCancel = () => {},
    onDirtyChange = () => {},
    onImportSourceDrop = null
  } = $props();

  let draftId = $state('');
  let name = $state('');
  let description = $state('');
  let icon = $state(DEFAULT_ESSENCE_ICON);
  let sourceComponentId = $state('');
  let saveFailed = $state(false);
  let lastEssenceId = $state(null);
  let lastDirty = $state(false);

  const isNew = $derived(!essence?.id);
  const selectedSource = $derived(sourceComponentId
    ? managedItemOptions.find(item => item.id === sourceComponentId) || null
    : null);
  const sourceState = $derived(essenceSourceState(essence));
  const dirty = $derived(isDirty());

  $effect(() => {
    const nextEssenceId = essence?.id || '__new__';
    if (nextEssenceId === lastEssenceId) return;
    draftId = essence?.id || '';
    name = essence?.name || '';
    description = essence?.description || '';
    icon = normalizeEssenceIcon(essence?.icon || DEFAULT_ESSENCE_ICON);
    sourceComponentId = sourceIdentity(essence);
    saveFailed = false;
    lastEssenceId = nextEssenceId;
  });

  $effect(() => {
    if (dirty === lastDirty) return;
    lastDirty = dirty;
    onDirtyChange(dirty);
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function sourceIdentity(definition) {
    return definition?.sourceComponentId || definition?.associatedSystemItemId || '';
  }

  function essenceSourceState(definition) {
    const state = definition?.sourceState || 'none';
    if (state === 'linked') {
      return {
        label: text('FABRICATE.Admin.ManagerV2.Essence.SourceLinked', 'Linked source'),
        className: 'is-active'
      };
    }
    if (state === 'missing') {
      return {
        label: text('FABRICATE.Admin.ManagerV2.Essence.SourceMissing', 'Source item missing'),
        className: 'is-warning'
      };
    }
    if (state === 'stale') {
      return {
        label: text('FABRICATE.Admin.ManagerV2.Essence.SourceStale', 'Source unresolved'),
        className: 'is-warning'
      };
    }
    return {
      label: text('FABRICATE.Admin.ManagerV2.Essence.SourceNone', 'No source'),
      className: 'is-disabled'
    };
  }

  function isDirty() {
    if (isNew) {
      return Boolean(name.trim() || description.trim() || normalizeEssenceIcon(icon) !== DEFAULT_ESSENCE_ICON || (showSourceUi && sourceComponentId));
    }
    return name !== (essence?.name || '')
      || description !== (essence?.description || '')
      || normalizeEssenceIcon(icon) !== normalizeEssenceIcon(essence?.icon || DEFAULT_ESSENCE_ICON)
      || (showSourceUi && sourceComponentId !== sourceIdentity(essence));
  }

  function saveLabel() {
    if (saving) return text('FABRICATE.Admin.ManagerV2.Essence.Saving', 'Saving...');
    return isNew
      ? text('FABRICATE.Admin.ManagerV2.Essence.Create', 'Create essence')
      : text('FABRICATE.Admin.ManagerV2.Essence.Save', 'Save essence');
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!name.trim()) return;
    saveFailed = false;
    const updates = {
      name: name.trim(),
      description,
      icon: normalizeEssenceIcon(icon)
    };
    if (showSourceUi) {
      updates.sourceComponentId = sourceComponentId || null;
    }
    const result = await onSave(draftId || null, updates);
    if (result === false) {
      saveFailed = true;
    }
  }

  async function handleSourceDrop(data) {
    if (!onImportSourceDrop) return;
    const item = await onImportSourceDrop(data);
    if (item?.id) {
      sourceComponentId = item.id;
    }
  }
</script>

<main class="manager-v2-main manager-v2-essence-edit-main" aria-label={text('FABRICATE.Admin.ManagerV2.Essence.EditTitle', 'Edit essence')}>
  <section class="manager-v2-section-header">
    <div class="manager-v2-heading">
      <p class="manager-v2-kicker">{text('FABRICATE.Admin.ManagerV2.Essence.EditKicker', 'Essence editor')}</p>
      <h2 class="manager-v2-title">{isNew ? text('FABRICATE.Admin.ManagerV2.Essence.CreateTitle', 'Create essence') : text('FABRICATE.Admin.ManagerV2.Essence.EditTitle', 'Edit essence')}</h2>
      <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.Essence.EditHint', 'Edit identity, icon, and source linkage for the selected essence definition.')}</p>
    </div>
    {#if dirty}
      <span class="manager-v2-chip is-warning">{text('FABRICATE.Admin.ManagerV2.Essence.Dirty', 'Unsaved')}</span>
    {/if}
  </section>

  <form class="manager-v2-essence-edit-view" onsubmit={handleSave}>
    <section class="manager-v2-edit-card manager-v2-essence-identity-card">
      <div class="manager-v2-edit-card-heading">
        <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Essence.Identity', 'Identity')}</h3>
        <div class="manager-v2-action-group">
          <button type="button" class="manager-v2-button" onclick={onCancel} disabled={saving}>
            <i class="fas fa-times" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.Essence.Cancel', 'Cancel')}</span>
          </button>
          <button type="submit" class="manager-v2-button is-primary" disabled={!name.trim() || saving}>
            <i class={saving ? 'fas fa-spinner fa-spin' : 'fas fa-save'} aria-hidden="true"></i>
            <span>{saveLabel()}</span>
          </button>
        </div>
      </div>

      <div class="manager-v2-essence-edit-grid">
        <div class="manager-v2-essence-icon-control">
          <span class="manager-v2-essence-icon-preview" aria-hidden="true">
            <i class={normalizeEssenceIcon(icon)}></i>
          </span>
          <IconPicker
            value={icon}
            buttonTitle={text('FABRICATE.Admin.ManagerV2.Essence.ChooseIcon', 'Choose icon')}
            onChange={(iconClass) => { icon = iconClass; }}
          />
          <small>{text('FABRICATE.Admin.ManagerV2.Essence.IconClassHint', 'Current icon: {icon}').replace('{icon}', normalizeEssenceIcon(icon))}</small>
        </div>

        <label class="manager-v2-field" for="manager-v2-essence-edit-name">
          <span>{text('FABRICATE.Admin.ManagerV2.Essence.Name', 'Name')}</span>
          <input id="manager-v2-essence-edit-name" type="text" value={name} oninput={(event) => name = event.currentTarget.value} placeholder={text('FABRICATE.Admin.ManagerV2.Essence.NamePlaceholder', 'Essence name')} />
        </label>

        <label class="manager-v2-field is-wide" for="manager-v2-essence-edit-description">
          <span>{text('FABRICATE.Admin.ManagerV2.Essence.Description', 'Description')}</span>
          <textarea id="manager-v2-essence-edit-description" rows="5" value={description} oninput={(event) => description = event.currentTarget.value} placeholder={text('FABRICATE.Admin.ManagerV2.Essence.DescriptionPlaceholder', 'Description')}></textarea>
        </label>
      </div>

      {#if saveFailed}
        <p class="manager-v2-muted manager-v2-form-warning">{text('FABRICATE.Admin.ManagerV2.Essence.SaveFailed', 'Save failed. Check for duplicate or blank names and try again.')}</p>
      {/if}
    </section>

    {#if showSourceUi}
      <section class="manager-v2-edit-card manager-v2-essence-source-card">
        <div class="manager-v2-edit-card-heading">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.Essence.Source', 'Source')}</h3>
          <span class={`manager-v2-chip ${sourceState.className}`}>{sourceState.label}</span>
        </div>
        <div class="manager-v2-essence-source-edit">
          <EssenceSourceSelector
            value={selectedSource}
            items={managedItemOptions}
            onDrop={handleSourceDrop}
            onSelect={(itemId) => { sourceComponentId = itemId || ''; }}
            onClear={() => { sourceComponentId = ''; }}
          />
          <div class="manager-v2-essence-source-copy">
            {#if selectedSource}
              <strong>{selectedSource.name}</strong>
              <p class="manager-v2-muted">{selectedSource.sourceItemUuid || text('FABRICATE.Admin.ManagerV2.Essence.SourceNoUuid', 'This component has no source item UUID.')}</p>
            {:else if essence?.sourceName || essence?.sourceItemUuid || essence?.sourceComponentId}
              <strong>{essence.sourceName || essence.sourceComponentId || essence.sourceItemUuid}</strong>
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Essence.SourceEvidenceHint', 'Stored source evidence remains readable until you clear or repair it.')}</p>
              {#if sourceComponentId}
                <button type="button" class="manager-v2-button" onclick={() => { sourceComponentId = ''; }}>
                  <i class="fas fa-times" aria-hidden="true"></i>
                  <span>{text('FABRICATE.Admin.Features.Essences.ClearSourceItem', 'Clear source item')}</span>
                </button>
              {/if}
            {:else}
              <strong>{text('FABRICATE.Admin.ManagerV2.Essence.SourceNone', 'No source')}</strong>
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Essence.SourceEditHint', 'Pick or drop a managed component to provide the effect-transfer source.')}</p>
            {/if}
          </div>
        </div>
      </section>
    {/if}
  </form>
</main>
