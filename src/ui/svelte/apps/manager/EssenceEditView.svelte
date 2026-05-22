<!-- Svelte 5 runes mode -->
<script>
  import EssenceSourceSelector from '../../components/EssenceSourceSelector.svelte';
  import IconPicker from '../../components/IconPicker.svelte';
  import { DEFAULT_ESSENCE_ICON, getEssenceIconOption, normalizeEssenceIcon } from '../../util/essenceIcons.js';
  import { localize } from '../../util/foundryBridge.js';

  let {
    essence = null,
    managedItemOptions = [],
    showSourceUi = false,
    saving = false,
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onImportSourceDrop = null
  } = $props();

  let draftId = $state('');
  let name = $state('');
  let description = $state('');
  let icon = $state(DEFAULT_ESSENCE_ICON);
  let sourceComponentId = $state('');
  let sourceTouched = $state(false);
  let saveFailed = $state(false);
  let lastEssenceId = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');

  const isNew = $derived(!essence?.id);
  const selectedSource = $derived(sourceComponentId
    ? managedItemOptions.find(item => item.id === sourceComponentId) || null
    : null);
  const selectedIconOption = $derived(getEssenceIconOption(normalizeEssenceIcon(icon)));
  const selectedIconLabel = $derived(selectedIconOption?.label || text('FABRICATE.Admin.Manager.Essence.CustomIcon', 'Custom icon'));
  const sourceState = $derived(essenceSourceState());
  const dirty = $derived(isDirty());
  const validName = $derived(Boolean(name.trim()));
  const draftSummary = $derived(buildDraftSummary());
  const draftSignature = $derived([
    draftSummary.id,
    draftSummary.name,
    draftSummary.description,
    draftSummary.icon,
    draftSummary.sourceComponentId,
    draftSummary.sourceName,
    draftSummary.sourceState,
    draftSummary.dirty ? 'dirty' : 'clean',
    draftSummary.validName ? 'valid' : 'invalid',
    showSourceUi ? 'source' : 'no-source'
  ].join('\u001f'));

  $effect(() => {
    const nextEssenceId = essence?.id || '__new__';
    if (nextEssenceId === lastEssenceId) return;
    draftId = essence?.id || '';
    name = essence?.name || '';
    description = essence?.description || '';
    icon = normalizeEssenceIcon(essence?.icon || DEFAULT_ESSENCE_ICON);
    sourceComponentId = sourceIdentity(essence);
    sourceTouched = false;
    saveFailed = false;
    lastEssenceId = nextEssenceId;
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

  function sourceIdentity(definition) {
    return definition?.sourceComponentId || definition?.associatedSystemItemId || '';
  }

  function hasStoredSourceEvidence() {
    return Boolean(essence?.sourceName || essence?.sourceItemUuid || essence?.sourceComponentId || essence?.associatedSystemItemId);
  }

  function essenceSourceState() {
    const state = draftSourceState();
    if (state === 'linked') {
      return {
        label: text('FABRICATE.Admin.Manager.Essence.SourceLinked', 'Linked source'),
        className: 'is-active'
      };
    }
    if (state === 'missing') {
      return {
        label: text('FABRICATE.Admin.Manager.Essence.SourceMissing', 'Source item missing'),
        className: 'is-warning'
      };
    }
    if (state === 'stale') {
      return {
        label: text('FABRICATE.Admin.Manager.Essence.SourceStale', 'Source unresolved'),
        className: 'is-warning'
      };
    }
    return {
      label: text('FABRICATE.Admin.Manager.Essence.SourceNone', 'No source'),
      className: 'is-disabled'
    };
  }

  function draftSourceState() {
    if (!showSourceUi) return 'none';
    if (!sourceComponentId) {
      return !sourceTouched && hasStoredSourceEvidence() ? essence?.sourceState || 'stale' : 'none';
    }
    if (!selectedSource) return 'stale';
    if (selectedSource.sourceItemUuid || selectedSource.sourceUuid) return 'linked';
    return 'missing';
  }

  function buildDraftSummary() {
    const normalizedIcon = normalizeEssenceIcon(icon);
    const sourceStateId = draftSourceState();
    return {
      id: draftId || '',
      name: name.trim() || text('FABRICATE.Admin.Manager.Essence.CreateInspectorTitle', 'New essence draft'),
      description,
      icon: normalizedIcon,
      sourceComponentId: showSourceUi ? sourceComponentId || '' : '',
      sourceName: showSourceUi
        ? selectedSource?.name || (sourceComponentId ? sourceComponentId : !sourceTouched ? (essence?.sourceName || essence?.sourceItemUuid || '') : '')
        : '',
      sourceState: showSourceUi && !sourceComponentId && !sourceTouched && hasStoredSourceEvidence()
        ? essence?.sourceState || 'stale'
        : (showSourceUi ? sourceStateId : 'none'),
      componentUsageCount: essence?.componentUsageCount || 0,
      deleteBlocked: essence?.deleteBlocked === true,
      dirty,
      validName
    };
  }

  function isDirty() {
    if (isNew) {
      return Boolean(name.trim() || description.trim() || normalizeEssenceIcon(icon) !== DEFAULT_ESSENCE_ICON || (showSourceUi && sourceComponentId));
    }
    return name !== (essence?.name || '')
      || description !== (essence?.description || '')
      || normalizeEssenceIcon(icon) !== normalizeEssenceIcon(essence?.icon || DEFAULT_ESSENCE_ICON)
      || (showSourceUi && (sourceTouched || sourceComponentId !== sourceIdentity(essence)));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!validName || saving) return;
    saveFailed = false;
    const updates = {
      name: name.trim(),
      description,
      icon: normalizeEssenceIcon(icon)
    };
    if (showSourceUi && (isNew || sourceTouched)) {
      updates.sourceComponentId = sourceComponentId || null;
    }
    let result = false;
    try {
      result = await onSave(draftId || null, updates);
    } catch (err) {
      result = false;
    }
    if (result === false) {
      saveFailed = true;
    }
  }

  async function handleSourceDrop(data) {
    if (!onImportSourceDrop) return;
    const item = await onImportSourceDrop(data);
    if (item?.id) {
      sourceComponentId = item.id;
      sourceTouched = true;
    }
  }
</script>

<main class="manager-main manager-essence-edit-main" aria-label={isNew
  ? text('FABRICATE.Admin.Manager.Essence.CreateTitle', 'Create essence')
  : text('FABRICATE.Admin.Manager.Essence.EditTitle', 'Edit essence')}>
  <form id="manager-essence-edit-form" class="manager-essence-edit-view" onsubmit={handleSave}>
    <section class="manager-edit-card manager-essence-identity-card">
      <div class="manager-edit-card-heading">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.Identity', 'Identity')}</h3>
      </div>

      <div class="manager-essence-edit-grid">
        <div class="manager-essence-icon-panel">
          <span class="manager-essence-field-label">{text('FABRICATE.Admin.Manager.Essence.Icon', 'Icon')}</span>
          <span class="manager-essence-icon-preview" aria-hidden="true">
            <i class={normalizeEssenceIcon(icon)}></i>
          </span>
          <div class="manager-essence-icon-actions">
            <IconPicker
              value={icon}
              disabled={saving}
              buttonTitle={text('FABRICATE.Admin.Manager.Essence.ChangeIcon', 'Change icon')}
              onChange={(iconClass) => { icon = iconClass; }}
            />
            <button type="button" class="manager-button" onclick={() => { icon = DEFAULT_ESSENCE_ICON; }} disabled={saving || normalizeEssenceIcon(icon) === DEFAULT_ESSENCE_ICON}>
              <i class="fas fa-undo" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Essence.ClearIcon', 'Clear icon')}</span>
            </button>
          </div>
          <span class="manager-essence-icon-copy">
            <strong>{selectedIconLabel}</strong>
            <small>{normalizeEssenceIcon(icon) === DEFAULT_ESSENCE_ICON
              ? text('FABRICATE.Admin.Manager.Essence.DefaultIconLabel', 'Default essence icon')
              : text('FABRICATE.Admin.Manager.Essence.IconLabel', 'Selected icon')}</small>
          </span>
        </div>

        <div class="manager-essence-core-fields">
          <label class="manager-field" for="manager-essence-edit-name">
            <span>{text('FABRICATE.Admin.Manager.Essence.Name', 'Name')}</span>
            <input id="manager-essence-edit-name" type="text" value={name} oninput={(event) => name = event.currentTarget.value} placeholder={text('FABRICATE.Admin.Manager.Essence.NamePlaceholder', 'Essence name')} disabled={saving} required />
          </label>

          <label class="manager-field" for="manager-essence-edit-description">
            <span>{text('FABRICATE.Admin.Manager.Essence.Description', 'Description')}</span>
            <textarea id="manager-essence-edit-description" rows="5" value={description} oninput={(event) => description = event.currentTarget.value} placeholder={text('FABRICATE.Admin.Manager.Essence.DescriptionPlaceholder', 'Description')} disabled={saving}></textarea>
          </label>
        </div>
      </div>

      {#if showSourceUi}
        <div class="manager-essence-source-panel">
          <div class="manager-edit-card-heading">
            <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Essence.Source', 'Source')}</h3>
            <span class={`manager-chip ${sourceState.className}`}>{sourceState.label}</span>
          </div>
          <div class="manager-essence-source-stack">
            <div class="manager-essence-source-summary">
              {#if selectedSource}
                <img class="manager-essence-source-thumb" src={selectedSource.img || 'icons/svg/item-bag.svg'} alt="" />
              {:else}
                <span class="manager-essence-source-thumb is-empty" aria-hidden="true">
                  <i class="fas fa-link"></i>
                </span>
              {/if}
              <div class="manager-essence-source-copy">
                {#if selectedSource}
                  <strong>{selectedSource.name}</strong>
                  <p class="manager-muted">{selectedSource.sourceItemUuid || text('FABRICATE.Admin.Manager.Essence.SourceNoUuid', 'This component has no source item UUID.')}</p>
                {:else if essence?.sourceName || essence?.sourceItemUuid || essence?.sourceComponentId}
                  <strong>{essence.sourceName || essence.sourceComponentId || essence.sourceItemUuid}</strong>
                  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Essence.SourceEvidenceHint', 'Stored source evidence remains readable until you clear or repair it.')}</p>
                {:else}
                  <strong>{text('FABRICATE.Admin.Manager.Essence.SourceNone', 'No source')}</strong>
                  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Essence.SourceEditHint', 'Pick or drop a managed component to provide the effect-transfer source.')}</p>
                {/if}
              </div>
              {#if selectedSource || sourceComponentId || hasStoredSourceEvidence()}
                <button type="button" class="manager-icon-button" onclick={() => { sourceComponentId = ''; sourceTouched = true; }} aria-label={text('FABRICATE.Admin.Features.Essences.ClearSourceItem', 'Clear source item')} title={text('FABRICATE.Admin.Features.Essences.ClearSourceItem', 'Clear source item')}>
                  <i class="fas fa-times" aria-hidden="true"></i>
                </button>
              {/if}
            </div>

            <div class="manager-essence-source-drop-zone">
              <EssenceSourceSelector
                value={null}
                items={managedItemOptions}
                onDrop={handleSourceDrop}
                onSelect={(itemId) => { sourceComponentId = itemId || ''; sourceTouched = true; }}
                onClear={() => { sourceComponentId = ''; sourceTouched = true; }}
              />
            </div>
          </div>
        </div>
      {/if}

      {#if saveFailed}
        <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Essence.SaveFailed', 'Save failed. Check for duplicate or blank names and try again.')}</p>
      {/if}
    </section>
  </form>
</main>
