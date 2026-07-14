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
    showSalvage = false,
    salvageResolutionMode = 'simple',
    salvageOutcomeNames = [],
    componentOptions = [],
    saving = false,
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {}
  } = $props();

  let tagDraft = $state([]);
  let essenceDraft = $state([]);
  // Deep clone of component.salvage so edits never mutate the upstream card. Only
  // the authoring fields (resultGroups, outcomeRouting, dcOverride) are edited
  // here; the remaining salvage fields (enabled, ingredientQuantity, toolIds, …)
  // are preserved and spread back through buildUpdates so a save never drops them.
  let salvageDraft = $state(cloneSalvage(null));
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
    showSalvage ? salvageSignature() : '',
    dirty ? 'dirty' : 'clean'
  ].join(''));

  $effect(() => {
    if (componentKey === lastComponentKey) return;
    tagDraft = cloneTagOptions(tagOptions);
    essenceDraft = cloneEssenceOptions(essenceOptions);
    salvageDraft = cloneSalvage(component?.salvage);
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

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // Deep clone the persisted salvage shape into an editable draft. Authoring only
  // touches resultGroups/outcomeRouting/dcOverride, but the remaining fields are
  // kept verbatim so buildUpdates can spread them back and never drop them.
  function cloneSalvage(salvage) {
    const source = salvage && typeof salvage === 'object' ? salvage : {};
    return {
      ...source,
      dcOverride: source.dcOverride ?? null,
      outcomeRouting:
        source.outcomeRouting && typeof source.outcomeRouting === 'object'
          ? { ...source.outcomeRouting }
          : {},
      resultGroups: (Array.isArray(source.resultGroups) ? source.resultGroups : []).map(group => ({
        ...group,
        id: group?.id || newId(),
        name: group?.name || '',
        results: (Array.isArray(group?.results) ? group.results : []).map(result => ({
          ...result,
          id: result?.id || newId(),
          componentId: result?.componentId || '',
          quantity: clampSalvageQuantity(result?.quantity)
        }))
      }))
    };
  }

  function clampSalvageQuantity(value) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }

  function salvageSignature() {
    return JSON.stringify({
      resultGroups: salvageDraft.resultGroups,
      outcomeRouting: salvageDraft.outcomeRouting,
      dcOverride: salvageDraft.dcOverride
    });
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
    if (showSalvage && salvageSignature() !== JSON.stringify({
      resultGroups: cloneSalvage(component?.salvage).resultGroups,
      outcomeRouting: cloneSalvage(component?.salvage).outcomeRouting,
      dcOverride: cloneSalvage(component?.salvage).dcOverride
    })) return true;
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
    if (showSalvage) {
      // Spread the preserved (unedited) salvage fields first, then overwrite the
      // three authored fields so enabled/ingredientQuantity/toolIds survive a save.
      updates.salvage = {
        ...salvageDraft,
        resultGroups: salvageDraft.resultGroups,
        outcomeRouting: salvageDraft.outcomeRouting,
        dcOverride: salvageDraft.dcOverride
      };
    }
    return updates;
  }

  function buildDraftSummary() {
    return {
      id: component?.id || '',
      name: component?.name || '',
      tagCount: tagDraft.filter(opt => opt.checked).length,
      essenceCount: essenceDraft.filter(opt => clampComponentEssenceQuantity(opt.quantity) > 0).length,
      salvageGroupCount: showSalvage ? salvageDraft.resultGroups.length : 0,
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

  // Salvage authoring mutators. Each writes a fresh salvageDraft (preserving the
  // untouched fields) so the draftSignature effect re-emits onDraftChange.
  const salvageShowDcOverride = $derived(
    salvageResolutionMode === 'simple' || salvageResolutionMode === 'routed'
  );

  function setSalvage(next) {
    salvageDraft = { ...salvageDraft, ...next };
  }

  function addSalvageGroup() {
    setSalvage({
      resultGroups: [...salvageDraft.resultGroups, { id: newId(), name: '', results: [] }]
    });
  }

  function removeSalvageGroup(groupId) {
    setSalvage({
      resultGroups: salvageDraft.resultGroups.filter(group => group.id !== groupId)
    });
  }

  function updateSalvageGroup(groupId, patch) {
    setSalvage({
      resultGroups: salvageDraft.resultGroups.map(group =>
        group.id === groupId ? { ...group, ...patch } : group
      )
    });
  }

  function addSalvageResult(groupId) {
    updateSalvageGroupResults(groupId, results => [
      ...results,
      { id: newId(), componentId: componentOptions[0]?.id || '', quantity: 1 }
    ]);
  }

  function removeSalvageResult(groupId, resultId) {
    updateSalvageGroupResults(groupId, results => results.filter(result => result.id !== resultId));
  }

  function updateSalvageResult(groupId, resultId, patch) {
    updateSalvageGroupResults(groupId, results =>
      results.map(result => (result.id === resultId ? { ...result, ...patch } : result))
    );
  }

  function updateSalvageGroupResults(groupId, mutate) {
    setSalvage({
      resultGroups: salvageDraft.resultGroups.map(group =>
        group.id === groupId ? { ...group, results: mutate(group.results || []) } : group
      )
    });
  }

  function setSalvageRoute(outcomeName, groupId) {
    const next = { ...salvageDraft.outcomeRouting };
    if (groupId) next[outcomeName] = groupId;
    else delete next[outcomeName];
    setSalvage({ outcomeRouting: next });
  }

  function setSalvageDcOverride(rawValue) {
    const trimmed = String(rawValue ?? '').trim();
    if (trimmed === '') {
      setSalvage({ dcOverride: null });
      return;
    }
    const numeric = Number(trimmed);
    setSalvage({ dcOverride: Number.isFinite(numeric) ? numeric : null });
  }

  function salvageComponentName(componentId) {
    return componentOptions.find(option => option.id === componentId)?.name || '';
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

    {#if showSalvage}
      <section class="manager-task-core-card" data-component-edit-section="salvage" data-salvage-section>
        <div class="manager-task-card-heading">
          <div>
            <h3>{text('FABRICATE.Admin.Manager.Component.Salvage.Title', 'Salvage')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Salvage.Hint', 'Configure what this component yields when it is salvaged.')}</p>
          </div>
        </div>

        <div class="manager-field" data-salvage-result-groups>
          <span class="manager-component-readonly-label">
            <span>{text('FABRICATE.Admin.Manager.Component.Salvage.ResultGroups', 'Result groups')}</span>
          </span>
          {#if salvageDraft.resultGroups.length > 0}
            <ul class="manager-recipe-ingredient-sets">
              {#each salvageDraft.resultGroups as group, groupIndex (group.id)}
                <li class="manager-recipe-ingredient-set-item" data-salvage-group={group.id}>
                  <div class="manager-salvage-group-header">
                    <input
                      type="text"
                      class="manager-input"
                      value={group.name}
                      placeholder={text('FABRICATE.Admin.Manager.Component.Salvage.GroupNamePlaceholder', 'Group {n}').replace('{n}', String(groupIndex + 1))}
                      aria-label={text('FABRICATE.Admin.Manager.Component.Salvage.GroupName', 'Result group name')}
                      data-salvage-group-name
                      oninput={(event) => updateSalvageGroup(group.id, { name: event.currentTarget.value })}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      class="manager-icon-button is-danger"
                      aria-label={text('FABRICATE.Admin.Manager.Component.Salvage.RemoveGroup', 'Remove result group')}
                      data-remove-salvage-group
                      onclick={() => removeSalvageGroup(group.id)}
                      disabled={saving}
                    >
                      <i class="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                  </div>

                  {#if (group.results || []).length > 0}
                    <ul class="manager-salvage-result-list">
                      {#each group.results as result (result.id)}
                        <li class="manager-salvage-result-row" data-salvage-result={result.id}>
                          <select
                            class="manager-input"
                            value={result.componentId}
                            aria-label={text('FABRICATE.Admin.Manager.Component.Salvage.ResultComponent', 'Result component')}
                            data-salvage-result-component
                            onchange={(event) => updateSalvageResult(group.id, result.id, { componentId: event.currentTarget.value })}
                            disabled={saving}
                          >
                            <option value="">{text('FABRICATE.Admin.Manager.Component.Salvage.SelectComponent', 'Select a component')}</option>
                            {#each componentOptions as option (option.id)}
                              <option value={option.id}>{option.name}</option>
                            {/each}
                          </select>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            class="manager-input manager-salvage-result-quantity"
                            value={result.quantity}
                            aria-label={text('FABRICATE.Admin.Manager.Component.Salvage.ResultQuantity', 'Quantity for {name}').replace('{name}', salvageComponentName(result.componentId))}
                            data-salvage-result-quantity
                            oninput={(event) => updateSalvageResult(group.id, result.id, { quantity: clampSalvageQuantity(event.currentTarget.value) })}
                            disabled={saving}
                          />
                          <button
                            type="button"
                            class="manager-icon-button is-danger"
                            aria-label={text('FABRICATE.Admin.Manager.Component.Salvage.RemoveResult', 'Remove result')}
                            data-remove-salvage-result
                            onclick={() => removeSalvageResult(group.id, result.id)}
                            disabled={saving}
                          >
                            <i class="fas fa-xmark" aria-hidden="true"></i>
                          </button>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Salvage.NoResults', 'No results in this group yet.')}</p>
                  {/if}

                  <button
                    type="button"
                    class="manager-button"
                    data-add-salvage-result
                    onclick={() => addSalvageResult(group.id)}
                    disabled={saving}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.Manager.Component.Salvage.AddResult', 'Add result')}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Salvage.NoGroups', 'No result groups yet.')}</p>
          {/if}
          <button
            type="button"
            class="manager-button"
            data-add-salvage-group
            onclick={() => addSalvageGroup()}
            disabled={saving}
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Component.Salvage.AddGroup', 'Add group')}</span>
          </button>
        </div>

        {#if salvageResolutionMode === 'routed'}
          <div class="manager-field" data-salvage-routing>
            <span class="manager-component-readonly-label">
              <span>{text('FABRICATE.Admin.Manager.Component.Salvage.Routing', 'Outcome routing')}</span>
            </span>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Salvage.RoutingHint', 'Map each check outcome to the result group it awards.')}</p>
            {#if salvageOutcomeNames.length > 0}
              <div class="manager-salvage-routing-list">
                {#each salvageOutcomeNames as outcomeName (outcomeName)}
                  <label class="manager-salvage-routing-row">
                    <span>{outcomeName}</span>
                    <select
                      class="manager-input"
                      value={salvageDraft.outcomeRouting[outcomeName] || ''}
                      data-salvage-route={outcomeName}
                      onchange={(event) => setSalvageRoute(outcomeName, event.currentTarget.value)}
                      disabled={saving}
                    >
                      <option value="">{text('FABRICATE.Admin.Manager.Component.Salvage.Unrouted', 'Unrouted')}</option>
                      {#each salvageDraft.resultGroups as group, groupIndex (group.id)}
                        <option value={group.id}>{group.name || text('FABRICATE.Admin.Manager.Component.Salvage.GroupNamePlaceholder', 'Group {n}').replace('{n}', String(groupIndex + 1))}</option>
                      {/each}
                    </select>
                  </label>
                {/each}
              </div>
            {:else}
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Salvage.NoOutcomes', 'The routed salvage check has no outcome tiers to route yet.')}</p>
            {/if}
          </div>
        {/if}

        {#if salvageShowDcOverride}
          <label class="manager-field" data-salvage-dc-override>
            <span class="manager-component-readonly-label">
              <span>{text('FABRICATE.Admin.Manager.Component.Salvage.DcOverride', 'DC override')}</span>
            </span>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Salvage.DcOverrideHint', 'Leave blank to use the system salvage check default.')}</p>
            <input
              type="number"
              step="1"
              class="manager-input"
              value={salvageDraft.dcOverride === null || salvageDraft.dcOverride === undefined ? '' : salvageDraft.dcOverride}
              aria-label={text('FABRICATE.Admin.Manager.Component.Salvage.DcOverride', 'DC override')}
              oninput={(event) => setSalvageDcOverride(event.currentTarget.value)}
              disabled={saving}
            />
          </label>
        {/if}
      </section>
    {/if}

    {#if saveFailed}
      <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Component.SaveFailed', 'Save failed. Try again or refresh the manager.')}</p>
    {/if}
  </form>
</main>
