<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ToggleCard from './ToggleCard.svelte';
  import {
    GENERAL_COMPONENT_CATEGORY,
    getComponentCategoryLabel,
    getEffectiveComponentCategories,
    normalizeComponentCategory
  } from '../../../../utils/componentCategories.js';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import {
    adjustComponentEssenceQuantity,
    clampComponentEssenceQuantity
  } from '../../util/componentEditor.js';
  import {
    SALVAGE_DC_CUSTOM,
    buildSalvageDcOptions,
    resolveSalvageDcSelection,
    salvageDcOverrideForSelection
  } from './component/salvageDcPresets.js';

  let {
    component = null,
    tagOptions = [],
    essenceOptions = [],
    showTags = false,
    showEssences = false,
    showSalvage = false,
    categoryOptions = [],
    salvageResolutionMode = 'simple',
    salvageOutcomeNames = [],
    // Whether the SYSTEM's salvage check is enabled. With salvageResolutionMode this
    // is the second axis the four brief presentations are derived from — they are a
    // projection of these two, not a model (decision 2). No new persisted token.
    salvageCheckEnabled = false,
    // `salvageCraftingCheck.simple.tiers` — the DC preset source in EVERY resolution
    // mode, routed included (decision 7, case 5). There is no `.routed.tiers` sibling.
    salvageCheckTiers = [],
    salvageCheckDcMode = 'static',
    salvageCheckDc = 0,
    componentOptions = [],
    saving = false,
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onManageCheckPresets = () => {}
  } = $props();

  let tagDraft = $state([]);
  let categoryDraft = $state(GENERAL_COMPONENT_CATEGORY);
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
    // `category` is NOT a salvage field, so it gets its own term here rather than
    // riding in salvageSignature(). Same one-list principle as that allowlist: an
    // authored field missing from the signature means the editor never re-emits its
    // draft, so the root's dirty state and Save never see it (issue 676).
    categoryDraft,
    essenceDraft.map(opt => `${opt.id}:${opt.quantity}`).sort().join(','),
    showSalvage ? salvageSignature() : '',
    dirty ? 'dirty' : 'clean'
  ].join(''));

  $effect(() => {
    if (componentKey === lastComponentKey) return;
    tagDraft = cloneTagOptions(tagOptions);
    categoryDraft = normalizeComponentCategory(component?.category);
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

  // `general` first, then the system's authored vocabulary. The reserved bucket is
  // never persisted in `categoryOptions`, so it is prepended here rather than being
  // expected in the incoming list.
  const effectiveCategoryOptions = $derived(getEffectiveComponentCategories(categoryOptions));

  function categoryLabel(category) {
    return getComponentCategoryLabel(category, localize);
  }

  function setCategory(value) {
    categoryDraft = normalizeComponentCategory(value);
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
      // Default FALSE, matching `_normalizeSalvage` (issue 676, decision 6). Do NOT
      // copy the `!== false` shape of `allowPlayerResultReorder` below — that would
      // default this to TRUE, flipping every component in every world to salvageable
      // on first render and saving it back.
      //
      // Its other job is normalizing the DIRTY-CHECK BASELINE (see the note below):
      // leave the key absent and `enabled`, now in salvageSignatureOf's allowlist,
      // compares `false` against `undefined` forever, so toggling off→on never
      // returns to clean.
      enabled: source.enabled === true,
      // Default TRUE (issue 651), matching the model. `...source` above already
      // preserves a persisted value, so this is purely about the ABSENT key.
      //
      // Its load-bearing job is normalizing the DIRTY-CHECK BASELINE, not rendering:
      // `isDirty()` compares the draft's signature against `cloneSalvage(component.salvage)`.
      // Leave the key absent and a component that has never been toggled has an
      // `undefined` baseline, so toggling off then back ON leaves the editor stuck
      // DIRTY forever (`true` never re-equals `undefined`) — Save stays enabled with
      // nothing to save, and the exit guard nags on a no-op edit.
      allowPlayerResultReorder: source.allowPlayerResultReorder !== false,
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

  // `difficulty` is projected onto the component options; a component that has never
  // been given one reads null and the badge says so rather than showing a spurious 0.
  function salvageResultDifficulty(componentId) {
    const option = componentOptions.find((opt) => opt.id === componentId);
    const numeric = Number(option?.difficulty);
    return Number.isFinite(numeric) ? numeric : null;
  }

  function clampSalvageQuantity(value) {
    const numeric = Math.trunc(Number(value));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
  }

  // The dirty-check allowlist: every AUTHORED salvage field must appear here or the
  // Save button never enables for it and the GM's edit is silently discarded on exit.
  // That is exactly what happened when `allowPlayerResultReorder` was added (issue 651):
  // persistence worked (buildUpdates spreads the draft), but nothing could be saved
  // because nothing was ever dirty.
  //
  // Taking a salvage OBJECT (rather than reading `salvageDraft` and having isDirty()
  // hand-build a matching literal) means there is ONE list, not two that must be kept
  // in sync. The two-list shape is what let this drift in the first place.
  function salvageSignatureOf(salvage) {
    return JSON.stringify({
      // The per-component salvage gate (issue 676). Omit it and the 651 bug returns
      // verbatim for this field: the GM flips the toggle, nothing is ever dirty, Save
      // never enables, and the edit is silently discarded on exit.
      enabled: salvage.enabled,
      resultGroups: salvage.resultGroups,
      outcomeRouting: salvage.outcomeRouting,
      dcOverride: salvage.dcOverride,
      allowPlayerResultReorder: salvage.allowPlayerResultReorder
    });
  }

  function salvageSignature() {
    return salvageSignatureOf(salvageDraft);
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
    if (categoryDraft !== normalizeComponentCategory(component?.category)) return true;
    if (showTags && !tagsAreEqual(tagDraft, tagOptions)) return true;
    if (showEssences && !essencesAreEqual(essenceDraft, essenceOptions)) return true;
    if (showSalvage && salvageSignature() !== salvageSignatureOf(cloneSalvage(component?.salvage)))
      return true;
    return false;
  }

  function buildUpdates() {
    const updates = {};
    updates.category = categoryDraft;
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
        dcOverride: salvageDraft.dcOverride,
        allowPlayerResultReorder: salvageDraft.allowPlayerResultReorder
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
  // ---------------------------------------------------------------------------
  // The four presentations, DERIVED from the two-axis model (decision 2).
  //
  // Fabricate's real model is `salvageResolutionMode ∈ {simple, progressive, routed}`
  // plus the off/on axis on the salvage check. The brief's four presentations are a
  // read-only projection of those two — no persisted token changes, no migration.
  // The brief's own descriptors for them are deliberately absent from this code.
  // ---------------------------------------------------------------------------

  const salvageEnabled = $derived(salvageDraft.enabled === true);
  const salvageHasGroups = $derived(salvageDraft.resultGroups.length > 0);
  const salvageProgressive = $derived(salvageResolutionMode === 'progressive');
  const salvageRouted = $derived(salvageResolutionMode === 'routed');
  // The DC control belongs to modes that compare a roll against a DC. `progressive`
  // spends a roll down a list instead, so it shows read-only per-result DC chips.
  const salvageShowDcOverride = $derived(
    salvageCheckEnabled && (salvageResolutionMode === 'simple' || salvageRouted)
  );

  // RULING A (issue 676). What collapses when salvage is OFF is the chrome that only
  // has meaning once salvage RUNS — mode/DC/routing/reorder. The result-group editor
  // stays usable.
  //
  // This is not cosmetic. `data-add-salvage-group` is the ONLY add-group control in
  // the entire codebase and it lives INSIDE the group editor. Collapse the whole body
  // and: off → body collapsed → add-group hidden → resultGroups can never reach 1 →
  // the toggle is disabled forever. Salvage would be unenablable for every new
  // component and every existing one with no groups. The prototype dodges this only
  // because its `salvageOn` defaults ON, which decision 6 correctly rejects.
  const salvageShowChrome = $derived(salvageEnabled);

  // Decision 8(c): UX only — NOT the invariant. The invariant is the normalizer clamp
  // (`_normalizeSalvage`) plus the removal-path auto-disable in removeSalvageGroup.
  const salvageToggleDisabled = $derived(saving || !salvageHasGroups);

  // The off-body copy MUST branch. "Enable it above to define what it yields" is only
  // true once groups exist; at zero groups it points at a toggle that is (correctly)
  // disabled, so it is actively misleading.
  const salvageDisabledNotice = $derived(
    salvageHasGroups
      ? text('FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledHasGroups', 'Salvage is disabled for this component. Enable it above to define what it yields when broken down.')
      : text('FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledNoGroups', 'There is nothing to enable yet. Add a result group below to describe what this component yields, then enable salvage.')
  );

  const salvageToggleHint = $derived(
    salvageHasGroups
      ? text('FABRICATE.Admin.Manager.Component.SalvageEditor.EnableSub', 'Players can break this component down into the result groups below.')
      : text('FABRICATE.Admin.Manager.Component.SalvageEditor.EnableBlockedSub', 'Add at least one result group before enabling salvage.')
  );

  // --- DC control (decision 7 + its five cases) ---
  const salvageDcOptions = $derived(buildSalvageDcOptions({
    tiers: salvageCheckTiers,
    dcMode: salvageCheckDcMode,
    systemDc: salvageCheckDc,
    systemDefaultLabel: (dc) => text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefault', 'System default — DC {dc}').replace('{dc}', String(dc)),
    systemDefaultDynamicLabel: () => text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcSystemDefaultDynamic', 'System default — set by macro'),
    tierLabel: (name, dc) => text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcTier', '{name} — DC {dc}').replace('{name}', name).replace('{dc}', String(dc)),
    customLabel: () => text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcCustom', 'Custom…')
  }));
  // Pure derivation from the PERSISTED value — never an $effect that writes back. An
  // off-tier `dcOverride: 14` against a tier list with no DC 14 selects Custom… and
  // displays 14 verbatim; it must never snap to the nearest tier, and rendering must
  // never mark the editor dirty (AC8a).
  const salvageDcSelection = $derived(resolveSalvageDcSelection(salvageDraft.dcOverride, salvageCheckTiers));
  const salvageDcShowCustomInput = $derived(salvageDcSelection === SALVAGE_DC_CUSTOM);

  function setSalvageDcSelection(selection) {
    setSalvage({ dcOverride: salvageDcOverrideForSelection(selection, salvageDraft.dcOverride) });
  }

  function setSalvage(next) {
    salvageDraft = { ...salvageDraft, ...next };
  }

  function addSalvageGroup() {
    setSalvage({
      resultGroups: [...salvageDraft.resultGroups, { id: newId(), name: '', results: [] }]
    });
  }

  // Decision 8(b), issue 676 — defence in depth behind the normalizer clamp.
  //
  // This path used to be UNFLOORED: it never touched `enabled`, and buildUpdates()
  // full-spreads, so enable-at-one-group → delete-that-group → Save persisted
  // `{enabled: true, resultGroups: []}` — violating Component Requirement 5 through
  // the sanctioned flow's exact reverse, and then DISABLING the toggle that would
  // undo it (stuck ON). Forcing `enabled: false` in the SAME staged setSalvage keeps
  // the correction inside isDirty()/draftSignature so Save sees it.
  //
  // House precedent: `_disableInvalidSalvageConfigs` does exactly this.
  function removeSalvageGroup(groupId) {
    const resultGroups = salvageDraft.resultGroups.filter(group => group.id !== groupId);
    setSalvage({
      resultGroups,
      ...(resultGroups.length === 0 ? { enabled: false } : {})
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

    <section class="manager-task-core-card" data-component-edit-section="category">
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Component.Category.Title', 'Category')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Category.Hint', 'Group this component in the component directory. Component categories are separate from recipe categories.')}</p>
        </div>
      </div>
      <label class="manager-field">
        <span>{text('FABRICATE.Admin.Manager.Component.Category.Label', 'Component category')}</span>
        <select
          class="manager-input"
          value={categoryDraft}
          data-component-edit-category
          aria-label={text('FABRICATE.Admin.Manager.Component.Category.Label', 'Component category')}
          onchange={(event) => setCategory(event.currentTarget.value)}
          disabled={saving}
        >
          {#each effectiveCategoryOptions as option (option)}
            <option value={option}>{categoryLabel(option)}</option>
          {/each}
        </select>
      </label>
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
            <h3>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Title', 'Salvage')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Hint', 'Configure what this component yields when it is salvaged.')}</p>
          </div>
        </div>

        <!-- The per-component salvage gate (issue 676). It was persisted, normalized
             and a live runtime gate long before any control wrote it, so a component
             auto-disabled by `_disableInvalidSalvageConfigs` was permanently
             unsalvageable from the UI. This toggle is the fix.

             The zero-groups explanation renders as VISIBLE `sub`-line text, never via
             `toggleTitle`: that lands a native `title` on a DISABLED <button>, which
             receives no mouse events, so the tooltip never appears in any browser —
             and no mounted test would notice, because the attribute IS in the DOM. -->
        <ToggleCard
          variant="is-info"
          icon="fas fa-recycle"
          section="salvage-enabled"
          field="salvageEnabled"
          title={text('FABRICATE.Admin.Manager.Component.SalvageEditor.Enable', 'Salvage this component')}
          sub={salvageToggleHint}
          subAttr="data-salvage-enabled-hint"
          toggleLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.Enable', 'Salvage this component')}
          on={salvageEnabled}
          disabled={salvageToggleDisabled}
          onToggle={(next) => setSalvage({ enabled: next === true })}
        />

        {#if !salvageEnabled}
          <p class="manager-muted" data-salvage-disabled-notice>{salvageDisabledNotice}</p>
        {/if}

        <div class="manager-field" data-salvage-result-groups>
          <span class="manager-component-readonly-label">
            <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.ResultGroups', 'Result groups')}</span>
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
                      placeholder={text('FABRICATE.Admin.Manager.Component.SalvageEditor.GroupNamePlaceholder', 'Group {n}').replace('{n}', String(groupIndex + 1))}
                      aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.GroupName', 'Result group name')}
                      data-salvage-group-name
                      oninput={(event) => updateSalvageGroup(group.id, { name: event.currentTarget.value })}
                      disabled={saving}
                    />
                    <button
                      type="button"
                      class="manager-icon-button is-danger"
                      aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.RemoveGroup', 'Remove result group')}
                      data-remove-salvage-group
                      onclick={() => removeSalvageGroup(group.id)}
                      disabled={saving}
                    >
                      <i class="fas fa-xmark" aria-hidden="true"></i>
                    </button>
                  </div>

                  {#if (group.results || []).length > 0}
                    <ul class="manager-salvage-result-list">
                      {#each group.results as result, resultIndex (result.id)}
                        <li class="manager-salvage-result-row" data-salvage-result={result.id}>
                          {#if salvageResolutionMode === 'progressive'}
                            <!-- Ordinal + read-only difficulty badge (issue 651 D3's
                                 condition). Progressive salvage spends the roll DOWN this
                                 list, so without these the list is a set of bare selects
                                 with no visible order — and the reorder-permission card
                                 above would govern something the GM cannot see.
                                 Read-only because `component.difficulty` belongs to the
                                 RESULT component, whose own editor owns its save
                                 lifecycle; this surface is editing a different component. -->
                            <span
                              class="manager-salvage-result-ordinal"
                              data-salvage-result-ordinal={String(resultIndex + 1)}
                              aria-hidden="true">{resultIndex + 1}</span
                            >
                          {/if}
                          <select
                            class="manager-input"
                            value={result.componentId}
                            aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.ResultComponent', 'Result component')}
                            data-salvage-result-component
                            onchange={(event) => updateSalvageResult(group.id, result.id, { componentId: event.currentTarget.value })}
                            disabled={saving}
                          >
                            <option value="">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.SelectComponent', 'Select a component')}</option>
                            {#each componentOptions as option (option.id)}
                              <option value={option.id}>{option.name}</option>
                            {/each}
                          </select>
                          {#if salvageResolutionMode === 'progressive'}
                            <span
                              class="manager-chip is-info manager-salvage-result-difficulty"
                              data-salvage-result-difficulty={salvageResultDifficulty(result.componentId) === null
                                ? ''
                                : String(salvageResultDifficulty(result.componentId))}
                            >
                              <i class="fas fa-gauge-high" aria-hidden="true"></i>
                              <span>{salvageResultDifficulty(result.componentId) === null
                                ? text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyUnset', 'No difficulty')
                                : `${text('FABRICATE.Admin.Manager.Component.SalvageEditor.Difficulty', 'Difficulty')} ${salvageResultDifficulty(result.componentId)}`}</span>
                            </span>
                          {/if}
                          <input
                            type="number"
                            min="1"
                            step="1"
                            class="manager-input manager-salvage-result-quantity"
                            value={result.quantity}
                            aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.ResultQuantity', 'Quantity for {name}').replace('{name}', salvageComponentName(result.componentId))}
                            data-salvage-result-quantity
                            oninput={(event) => updateSalvageResult(group.id, result.id, { quantity: clampSalvageQuantity(event.currentTarget.value) })}
                            disabled={saving}
                          />
                          <button
                            type="button"
                            class="manager-icon-button is-danger"
                            aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.RemoveResult', 'Remove result')}
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
                    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.NoResults', 'No results in this group yet.')}</p>
                  {/if}

                  <button
                    type="button"
                    class="manager-button"
                    data-add-salvage-result
                    onclick={() => addSalvageResult(group.id)}
                    disabled={saving}
                  >
                    <i class="fas fa-plus" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.AddResult', 'Add result')}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.NoGroups', 'No result groups yet.')}</p>
          {/if}
          <button
            type="button"
            class="manager-button"
            data-add-salvage-group
            onclick={() => addSalvageGroup()}
            disabled={saving}
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.AddGroup', 'Add group')}</span>
          </button>
        </div>

        <!-- RULING A: everything below is CHROME — it only has meaning once salvage
             runs, so it collapses when salvage is off. The result-group editor above
             deliberately does NOT, because it owns the only add-group control. -->
        {#if salvageShowChrome && salvageRouted}
          <div class="manager-field" data-salvage-routing>
            <span class="manager-component-readonly-label">
              <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Routing', 'Outcome routing')}</span>
            </span>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.RoutingHint', 'Map each check outcome to the result group it awards.')}</p>
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
                      <option value="">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Unrouted', 'Unrouted')}</option>
                      {#each salvageDraft.resultGroups as group, groupIndex (group.id)}
                        <option value={group.id}>{group.name || text('FABRICATE.Admin.Manager.Component.SalvageEditor.GroupNamePlaceholder', 'Group {n}').replace('{n}', String(groupIndex + 1))}</option>
                      {/each}
                    </select>
                  </label>
                {/each}
              </div>
            {:else}
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.NoOutcomes', 'The routed salvage check has no outcome tiers to route yet.')}</p>
            {/if}
          </div>
        {/if}

        {#if salvageShowChrome && salvageProgressive}
          <!-- Reorder-permission card (issue 651), at the END of the salvage block for
               the same reason as the recipe Results tab: the policy reads after the list
               it governs. Progressive-only — the flag has no meaning in the simple/routed
               salvage modes, which award a whole group rather than spending down a list. -->
          <ToggleCard
            variant="is-info"
            icon="fas fa-arrow-down-a-z"
            section="salvage-allow-player-result-reorder"
            field="salvageAllowPlayerResultReorder"
            title={text('FABRICATE.Admin.Manager.Component.SalvageReorder.Title', 'Allow player result re-ordering')}
            sub={text('FABRICATE.Admin.Manager.Component.SalvageReorder.Sub', 'Players may set their own stage order for this salvage, which is remembered and used every time they salvage this component.')}
            toggleLabel={text('FABRICATE.Admin.Manager.Component.SalvageReorder.Toggle', 'Allow player result re-ordering')}
            on={salvageDraft.allowPlayerResultReorder !== false}
            disabled={saving}
            onToggle={(next) => setSalvage({ allowPlayerResultReorder: next === true })}
          />
        {/if}

        {#if salvageShowChrome && salvageShowDcOverride}
          <div class="manager-field" data-salvage-dc-override>
            <span class="manager-component-readonly-label">
              <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverride', 'DC override')}</span>
            </span>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverrideHint', 'Leave blank to use the system salvage check default.')}</p>
            <!-- Presets are the SYSTEM'S authored salvage check tiers (decision 7),
                 never a hard-coded DC list — that would misreport the world's real
                 DCs. Storage is unchanged: null = system default, else an integer. -->
            <select
              class="manager-input"
              value={salvageDcSelection}
              data-salvage-dc-preset
              aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcOverride', 'DC override')}
              onchange={(event) => setSalvageDcSelection(event.currentTarget.value)}
              disabled={saving}
            >
              {#each salvageDcOptions as option (option.value)}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
            {#if salvageDcShowCustomInput}
              <input
                type="number"
                step="1"
                class="manager-input"
                value={salvageDraft.dcOverride === null || salvageDraft.dcOverride === undefined ? '' : salvageDraft.dcOverride}
                aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.DcCustomLabel', 'Custom salvage DC')}
                data-salvage-dc-custom
                oninput={(event) => setSalvageDcOverride(event.currentTarget.value)}
                disabled={saving}
              />
            {/if}
            <!-- Kept by decision 7 (it replaced the hard-coded tier list, not this
                 link). The zero-authored-tiers case is the COMMON one and is exactly
                 why it exists: with no presets to choose, this is the way forward. -->
            <button
              type="button"
              class="manager-button manager-salvage-manage-presets"
              data-salvage-manage-presets
              onclick={() => onManageCheckPresets()}
              disabled={saving}
            >
              <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.ManagePresets', 'Manage presets')}</span>
            </button>
          </div>
        {/if}
      </section>
    {/if}

    {#if saveFailed}
      <p class="manager-muted manager-form-warning">{text('FABRICATE.Admin.Manager.Component.SaveFailed', 'Save failed. Try again or refresh the manager.')}</p>
    {/if}
  </form>
</main>
