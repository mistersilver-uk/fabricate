<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ToggleCard from './ToggleCard.svelte';
  import Stepper from '../../components/Stepper.svelte';
  import SearchablePopover from './SearchablePopover.svelte';
  import ComponentIdentityStrip from './component/ComponentIdentityStrip.svelte';
  import {
    GENERAL_COMPONENT_CATEGORY,
    getComponentCategoryLabel,
    getEffectiveComponentCategories,
    normalizeComponentCategory
  } from '../../../../utils/componentCategories.js';
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
  import { salvageResolutionModeOptions } from './resolutionModeOptions.js';

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
    // Progressive difficulty, rehomed out of the deleted right-rail inspector into the
    // body (decision 4). It is STAGED, not written on change: the value lives in the
    // manager root's `componentDifficultyDraft` and persists with the rest of the
    // editor on Save. It is a SIBLING of `salvage`, not part of `updates.salvage`.
    showDifficulty = false,
    difficulty = null,
    onDifficultyChange = () => {},
    // Source actions. Delegated straight through to the store's services — they COMMIT
    // IMMEDIATELY and are never staged (see ComponentIdentityStrip's header note).
    onReplaceSource = () => {},
    onUnlinkSource = () => {},
    onOpenSource = () => {},
    onCopySourceUuid = () => {},
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onManageCheckPresets = () => {},
    // "Edit ↗" on a progressive salvage result row: opens the referenced YIELD
    // component's editor. The root wires this to `editComponent(otherId)`, which routes
    // through confirmRouteExit — NOT `setView('component-edit')`, which no-ops without
    // a selectedSystem and would prompt the discard dialog then change nothing.
    onOpenComponent = () => {}
  } = $props();

  let tagDraft = $state([]);
  let categoryDraft = $state(GENERAL_COMPONENT_CATEGORY);
  let essenceDraft = $state([]);
  // Deep clone of component.salvage so edits never mutate the upstream card. Only
  // the authoring fields (resultGroups, outcomeRouting, dcOverride) are edited
  // here; the remaining salvage fields (enabled, ingredientQuantity, toolIds, …)
  // are preserved and spread back through buildUpdates so a save never drops them.
  let salvageDraft = $state(cloneSalvage(null));
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
    saveFailed = false;
    // The DC control's Custom… choice is transient UI state, not draft data. Reset it
    // with the drafts, or opening a second component would inherit the first's open
    // custom input and misreport a system-default DC as custom.
    salvageDcCustomSelected = false;
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

  // Blank when unset; otherwise the staged number. Read straight off the prop — the
  // draft itself lives in the manager root, so there is nothing to seed here.
  const difficultyInputValue = $derived(difficulty === null || difficulty === undefined ? '' : difficulty);

  // Stage on input so the editor's dirty state and Save button track edits live. Blank
  // / sub-1 / non-integer / invalid stages null (cleared); a valid value stages the
  // truncated integer. Final coercion also happens on Save.
  function handleDifficultyInput(raw) {
    const trimmed = String(raw ?? '').trim();
    const parsed = Number(trimmed);
    onDifficultyChange(
      trimmed === '' || !Number.isFinite(parsed) || parsed < 1 ? null : Math.trunc(parsed)
    );
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
  //
  // This is ALSO the zero-group explanation for the disabled toggle, which is why it is
  // body copy and not a `title` on the toggle: a DISABLED <button> receives no mouse
  // events, so a tooltip there never appears in any browser — and a mounted test could
  // not tell, because the attribute would be in the DOM. It used to be said twice (here
  // AND on the enable card's sub-line); the card is gone and this is the one copy.
  const salvageDisabledNotice = $derived(
    salvageHasGroups
      ? text('FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledHasGroups', 'Salvage is disabled for this component. Enable it above to define what it yields when broken down.')
      : text('FABRICATE.Admin.Manager.Component.SalvageEditor.DisabledNoGroups', 'There is nothing to enable yet. Add a result below to describe what this component yields, then enable salvage.')
  );

  // The salvage mode, displayed READ-ONLY (it is a SYSTEM-level setting, authored on
  // the Crafting Settings screen — this route only reports it).
  //
  // Without it the panel silently changes shape — routing rows, ordinals, and the DC
  // control appearing and vanishing — driven by a setting the GM cannot see from here,
  // with nothing saying which mode they are in. Reuses `salvageResolutionModeOptions`,
  // which already carries "Routed by check" as `routed`'s label: the persisted token is
  // never displayed, and this is the list whose comment records that.
  const salvageModeOption = $derived(
    salvageResolutionModeOptions.find((option) => option.value === salvageResolutionMode) || null
  );
  const salvageModeLabel = $derived(
    salvageModeOption ? text(salvageModeOption.labelKey, salvageModeOption.fallback) : ''
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
  // The PERSISTED value derives the selection — never an $effect that writes back. An
  // off-tier `dcOverride: 14` against a tier list with no DC 14 selects Custom… and
  // displays 14 verbatim; it must never snap to the nearest tier, and rendering must
  // never mark the editor dirty (AC8a).
  //
  // But the persisted value ALONE cannot drive the control, because `Custom…` and
  // `System default` both persist a `dcOverride` of `null`. Deriving visibility purely
  // from storage made Custom… DEAD from the state every component starts in: pick it →
  // stages null → selection derives back to `system` → the input never renders → the
  // GM can never author a custom DC. That is a regression of a capability `main` ships
  // today (a plain number input accepting any DC) and it contradicts decision 7 and
  // this change's own canonical requirement ("a Custom… option exposing an arbitrary
  // integer"). The zero-authored-tiers case — the COMMON one — is where it bites
  // hardest: two options, one of them inert.
  //
  // So the GM's CHOICE is staged separately from the value. It is intentionally NOT in
  // the draft: choosing Custom… without typing a number changes nothing persisted, so
  // it must not make the editor dirty.
  let salvageDcCustomSelected = $state(false);
  const salvageDcSelection = $derived(
    salvageDcCustomSelected
      ? SALVAGE_DC_CUSTOM
      : resolveSalvageDcSelection(salvageDraft.dcOverride, salvageCheckTiers)
  );
  const salvageDcShowCustomInput = $derived(salvageDcSelection === SALVAGE_DC_CUSTOM);

  function setSalvageDcSelection(selection) {
    // Sticky only while Custom… is the live choice; picking a tier or the system
    // default hands control back to the persisted value.
    salvageDcCustomSelected = selection === SALVAGE_DC_CUSTOM;
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

  // ── PROGRESSIVE SALVAGE IS ONE GROUP, WHOSE `results` ARE THE STAGES ─────────────
  // Read `CraftingEngine.js` `_resolveSalvageGroups` before touching any of this:
  //
  //     if (mode === 'progressive') {
  //       const group = allGroups[0];          // ONLY the first group
  //       const authored = group.results || []; // its RESULTS are the ordered stages
  //
  // So progressive's model is a SINGLE group whose result list is the ordered stage
  // list; `resultGroups[1..]` are dead data the engine never reads, and the order that
  // decides what a player is awarded is the order WITHIN `resultGroups[0].results`.
  //
  // That is why this surface renders progressive as a flat ordered list with no group
  // chrome: the groups are a storage detail here, not a thing to author. The redesign
  // prototype models the same screen as one-group-per-stage and maps `groups.map(g =>
  // g.results[0])` — porting THAT mapping literally would have authored stage 2+ into
  // groups the engine never reads, silently awarding only the first stage forever.
  // The presentation is the prototype's; the mapping is the engine's.
  const salvageStageGroup = $derived(salvageDraft.resultGroups[0] || null);
  const salvageStages = $derived(salvageStageGroup?.results || []);

  // Append a stage, creating the backing group on first use. This is ALSO the control
  // that takes a zero-group component to one group, so it is what keeps Ruling A's
  // invariant true in progressive mode: without it, `enabled` could never be set
  // (the normalizer clamps `enabled` to false at zero groups) and salvage would be
  // permanently unenablable for every progressive component.
  function addSalvageStage() {
    const stage = { id: newId(), componentId: componentOptions[0]?.id || '', quantity: 1 };
    if (!salvageStageGroup) {
      setSalvage({ resultGroups: [{ id: newId(), name: '', results: [stage] }] });
      return;
    }
    updateSalvageGroupResults(salvageStageGroup.id, (results) => [...results, stage]);
  }

  // Removing the LAST stage removes the empty group with it, so the normalizer's
  // groups-based clamp (`enabled && resultGroups.length > 0`) can still see the
  // component as empty and force `enabled: false`. Leave the empty group behind and the
  // draft persists `{enabled: true, resultGroups: [{results: []}]}` — one group, so the
  // clamp holds enabled ON, while the engine awards nothing. Same defence in depth as
  // `removeSalvageGroup` (decision 8b), reached by the progressive path.
  function removeSalvageStage(resultId) {
    if (!salvageStageGroup) return;
    const results = salvageStages.filter((result) => result.id !== resultId);
    if (results.length === 0) {
      removeSalvageGroup(salvageStageGroup.id);
      return;
    }
    updateSalvageGroupResults(salvageStageGroup.id, () => results);
  }

  // Reorder is the AUTHORING act in progressive mode — the list order is the spend
  // order. Clamped at the ends rather than wrapping.
  function moveSalvageStage(index, delta) {
    const target = index + delta;
    if (!salvageStageGroup) return;
    if (target < 0 || target >= salvageStages.length) return;
    const results = [...salvageStages];
    const [moved] = results.splice(index, 1);
    results.splice(target, 0, moved);
    updateSalvageGroupResults(salvageStageGroup.id, () => results);
  }

  // Drag-reorder. `draggingStageIndex` is transient UI state and deliberately outside
  // the draft: picking a row up and dropping it where it started must not mark the
  // editor dirty.
  let draggingStageIndex = $state(null);

  function onStageDragStart(index) {
    draggingStageIndex = index;
  }

  function onStageDrop(index) {
    const from = draggingStageIndex;
    draggingStageIndex = null;
    if (from === null || from === index) return;
    moveSalvageStage(from, index - from);
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

  function salvageComponentOption(componentId) {
    return componentId ? componentOptions.find(option => option.id === componentId) || null : null;
  }

  // The yield picker's option list (issue 676). `img` is projected onto every component
  // option by the manager root, and `icon` is the fallback for a component whose linked
  // item has no art: SearchablePopover renders a raw <img> ONLY when `img` is truthy, so
  // an art-less component reads as a cube glyph rather than a broken-image box.
  const salvageComponentPickerOptions = $derived(
    (componentOptions || []).map(option => ({
      id: option.id,
      label: option.name,
      img: option.img || '',
      icon: option.img ? '' : 'fas fa-cube'
    }))
  );

  function toggleTag(tag, checked) {
    const next = tagDraft.map(entry => entry.tag === tag ? { ...entry, checked: checked === true } : entry);
    tagDraft = next;
  }

  function toggleTagLabel(tag, checked) {
    return checked
      ? text('FABRICATE.Admin.Manager.Component.TagsEdit.RemoveTag', 'Remove {name}').replace('{name}', tag)
      : text('FABRICATE.Admin.Manager.Component.TagsEdit.ApplyTag', 'Apply {name}').replace('{name}', tag);
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
    <!-- Source actions delegate straight through and COMMIT IMMEDIATELY; they never
         enter isDirty()/draftSignature/buildUpdates(). See the strip's header note:
         routing a source swap through `updateItem` would skip the durable-identity
         restamping and strand `flags.fabricate.roles[systemId].componentId` on the OLD
         item, with no test failing. -->
    <ComponentIdentityStrip
      {component}
      {saving}
      {onReplaceSource}
      {onUnlinkSource}
      {onOpenSource}
      {onCopySourceUuid}
    />

    <!-- Heading LEFT, control RIGHT, on one line (issue 676). A label stacked above a
         full-width select made a one-word choice occupy a whole panel and read as the
         start of a form; the category is a single inline decision, so it renders as one.
         The visible `<h3>` is the control's label, so the select keeps its `aria-label`
         rather than a stacked `<span>` that would duplicate the heading to a screen
         reader. -->
    <section class="manager-component-panel manager-component-inline-panel" data-component-edit-section="category">
      <div class="manager-task-card-heading">
        <div>
          <h3>{text('FABRICATE.Admin.Manager.Component.Category.Title', 'Category')}</h3>
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.Category.Hint', 'Groups this component in the browser. Unlike tags, a component has one category.')}</p>
        </div>
        <select
          class="manager-input manager-component-inline-control"
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
      </div>
    </section>

    {#if showDifficulty}
      <!-- "This component's Progressive DC" (issue 676). Rehomed out of the deleted
           right-rail inspector (decision 4, "nothing may be lost").
           `data-component-edit-section="difficulty"` is PRESERVED VERBATIM:
           `scripts/foundry-test-run.mjs` locates `[data-component-edit-section="difficulty"] input`
           and fills it, and that step is not waivable. `Stepper` renders a real
           `<input type="number">`, so that selector still resolves.

           ── WHY THIS IS A SIBLING SECTION AND NOT INSIDE SALVAGE ──────────────────
           The redesign prototype renders this card INSIDE the salvage panel, gated on
           the SALVAGE mode being progressive. Fabricate cannot: this value is
           `component.difficulty`, and the manager root gates the section on the
           system's CRAFTING `resolutionMode` (`componentDifficultyShown`), which is a
           different axis. Nesting it under salvage would hide it for every
           progressive-CRAFTING system whose salvage is simple or disabled — the exact
           configuration the smoke harness drives when it fills this input.

           STAGED, not written on change — the value rides the editor's draft and
           persists on Save, so it contributes to the dirty state and the exit guard.
           It is a SIBLING of `salvage`, never part of `updates.salvage`. -->
      <section
        class="manager-component-panel manager-component-inline-panel"
        data-component-edit-section="difficulty"
      >
        <div class="manager-task-card-heading">
          <div>
            <!-- The card title uses its OWN key. `Component.ProgressiveDifficulty` is a SHORT
                 label shared with the browser badge (`${label} ${difficulty}` -> "Progressive
                 difficulty 2") and the evidence row, so it must not carry this sentence. -->
            <h3>{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyCardTitle', 'This component’s Progressive DC')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyHint', 'Set once here — shown read-only wherever this component appears as a progressive result. Each salvage yield below carries its own DC, edited in its component.')}</p>
          </div>
          <!-- `manager-task-card-heading-control` opts this wrapper OUT of the heading's
               `> div { flex: 1 1 200px }` copy-block rule, which out-specifies the
               wrapper's own `flex: 0 0 auto` and otherwise grows it to half the row —
               stranding the stepper mid-card with dead space to its right. -->
          <div class="manager-component-inline-stepper manager-task-card-heading-control">
            <span class="manager-component-micro-label">{text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyMicro', 'DC')}</span>
            <Stepper
              value={difficultyInputValue === '' ? 0 : difficultyInputValue}
              min={0}
              max={35}
              ariaLabel={text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyLabel', 'Difficulty value')}
              decrementLabel={text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyDecrement', 'Decrease difficulty')}
              incrementLabel={text('FABRICATE.Admin.Manager.Component.ProgressiveDifficultyIncrement', 'Increase difficulty')}
              disabled={saving}
              onChange={(next) => handleDifficultyInput(next)}
            />
          </div>
        </div>
      </section>
    {/if}

    {#if showTags}
      <!-- TOGGLE PILLS, not an add-menu (issue 676). Tags are a small, fixed, system-
           authored vocabulary, and the question the GM is answering is "which of these
           apply?" — a set of toggles shows the whole vocabulary AND the answer at once.
           The old dropdown + removable-pill-row was Gathering's vehicle, borrowed for a
           different question: it hid the vocabulary behind a menu, so the common state
           (a system with four tags) rendered as "Add tag ▾ / No tags applied" — a
           control that says nothing about what is on offer, and two interactions per
           tag instead of one. -->
      <section class="manager-component-panel" data-component-edit-section="tags">
        <div class="manager-task-card-heading">
          <div>
            <h3>{text('FABRICATE.Admin.Manager.Component.TagsEdit.Title', 'Tags')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.TagsEdit.Hint', 'Toggle the item tags that apply to this component.')}</p>
          </div>
        </div>
        {#if tagDraft.length > 0}
          <div class="manager-component-tag-toggles" data-component-edit-tags>
            {#each tagDraft as option (option.tag)}
              <!-- `aria-pressed` is the state, not a class: this is a toggle button, and
                   the checked/unchecked ICON is decorative reinforcement of it. -->
              <button
                type="button"
                class={`manager-component-tag-toggle ${option.checked ? 'is-on' : ''}`}
                aria-pressed={option.checked === true}
                data-component-edit-tag-toggle={option.tag}
                data-component-tag-checked={option.checked === true}
                onclick={() => toggleTag(option.tag, option.checked !== true)}
                disabled={saving}
              >
                <i class="fas fa-tag" aria-hidden="true"></i>
                <span>{option.tag}</span>
                <i
                  class={option.checked ? 'fas fa-circle-check' : 'far fa-circle'}
                  aria-hidden="true"
                ></i>
              </button>
            {/each}
          </div>
        {:else}
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.TagsEdit.NoTags', 'This system defines no item tags.')}</p>
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
                <!-- IDENTITY FIRST, then the stepper (issue 676, brief §C5). The card was
                     one 5-column run rendering −, qty, +, icon, name: the control came
                     before the thing it counted, and nothing distinguished a contributed
                     essence from an untouched one. `is-inactive` carries that tint. -->
                <article
                  class={`manager-component-essence-card ${Number(option.quantity) > 0 ? 'is-active' : 'is-inactive'}`}
                  data-component-edit-essence={option.id}
                  data-component-essence-active={Number(option.quantity) > 0}
                >
                  <div class="manager-component-essence-identity">
                    <span class="manager-component-essence-icon" aria-hidden="true">
                      <i class={option.icon || 'fas fa-mortar-pestle'}></i>
                    </span>
                    <strong class="manager-component-essence-name" title={option.name}>{option.name}</strong>
                  </div>

                  <div class="manager-component-essence-stepper">
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
                  </div>
                </article>
              {/each}
            </div>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.EssencesEdit.NoEssences', 'No essences are defined for this system yet.')}</p>
          {/if}
        </section>
      {/if}

    <!-- The yield picker, shared by BOTH salvage result rows (issue 676). A `{#snippet}`
         rather than a new `.svelte` file for two reasons: the two call sites differ only
         in which group they write to, and a new component would have to be registered in
         every mount harness that renders this tree (a missing entry HANGS the suite
         rather than failing it). SearchablePopover is already in all of them.

         WHY NOT A `<select>`: the native control could show the component's NAME but never
         its IMAGE, so the GM picked yields from a text list while every other component
         surface in the studio shows the art. The trigger wraps the image AND the name —
         one target, both facts — and the popover is portaled to `.fabricate-manager`, so
         it escapes the panel's `overflow: hidden` (a naive absolute popover clips).

         There is deliberately no "clear" entry, matching RecipeResultItemRow: the select's
         old blank `<option>` only ever produced a result that names no component, and the
         row's × removes it properly. -->
    {#snippet salvageComponentPicker(groupId, result)}
      {@const selected = salvageComponentOption(result.componentId)}
      <span class="manager-salvage-component-field" data-salvage-result-component>
        <SearchablePopover
          options={salvageComponentPickerOptions}
          value={result.componentId}
          disabled={saving}
          pickerClass="manager-salvage-component-picker"
          triggerClass="manager-button manager-salvage-component-trigger"
          triggerImg={selected?.img || ''}
          triggerIcon={selected?.img ? '' : 'fas fa-cube'}
          triggerLabel={selected?.name || text('FABRICATE.Admin.Manager.Component.SalvageEditor.SelectComponent', 'Select a component')}
          valueClass="manager-salvage-component-name"
          triggerTitle={selected?.name || ''}
          triggerAriaLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.ResultComponent', 'Result component')}
          dialogAriaLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.ResultComponent', 'Result component')}
          searchPlaceholder={text('FABRICATE.Admin.Manager.Component.SalvageEditor.ComponentSearchPlaceholder', 'Search components...')}
          searchAriaLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.ComponentSearchPlaceholder', 'Search components...')}
          emptyHint={text('FABRICATE.Admin.Manager.Component.SalvageEditor.NoComponentsDefined', 'No components defined')}
          onChoose={(id) => updateSalvageResult(groupId, result.id, { componentId: id })}
        />
      </span>
    {/snippet}

    {#if showSalvage}
      <section class="manager-component-panel" data-component-edit-section="salvage" data-salvage-section>
        <!-- THE HEADING IS THE CONTROL ROW (issue 676): mode pill · divider · ENABLED ·
             toggle, all on the heading line. It used to be a heading with the pill, and
             then a whole separate "Salvage this component" ToggleCard below it — two
             stacked rows of chrome restating one fact before any content, on a panel
             whose actual subject is the yield list. -->
        <div class="manager-task-card-heading">
          <div>
            <h3>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Title', 'Salvage')}</h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Hint', 'What this component yields when it is broken down.')}</p>
          </div>
          <!-- `data-recipe-section` / `data-recipe-field` are ToggleCard's hooks, kept
               verbatim now the toggle is hand-rolled into the heading: they are what the
               AC4/AC9/AC10 suites drive, and those pin the salvage ENABLEMENT rulings
               (the dirty-baseline, the zero-group deadlock, the removal clamp) rather
               than the vehicle. Renaming them would have silently unpinned all of it. -->
          <!-- `manager-task-card-heading-control`: see the DC card's note. Without it the
               heading's `> div` copy-block rule grows this cluster to half the row and the
               pill/ENABLED/toggle left-align inside the grown box. -->
          <div
            class="manager-component-heading-controls manager-task-card-heading-control"
            data-recipe-section="salvage-enabled"
          >
            {#if salvageModeLabel}
              <!-- Read-only: the mode is a SYSTEM setting, authored on Crafting Settings.
                   It names the mode that decides this panel's shape, which the GM
                   otherwise cannot see from this route. `routed` is displayed as "Routed
                   by check"; the persisted token is never shown.

                   EXEMPT FROM RULING A, deliberately (it is NOT gated on
                   `salvageShowChrome`). Ruling A collapses the chrome that only has
                   meaning once salvage RUNS — mode/DC/routing/reorder. The mode PILL is
                   not that: it names the shape of the editor the GM is looking at right
                   now, and the result editor below stays authorable while salvage is
                   off. Hiding it meant authoring an ordered progressive list, or a
                   routed set of groups, with nothing on screen saying which — precisely
                   when the panel is at its most confusing. -->
              <span class="manager-chip is-info manager-salvage-mode-pill" data-salvage-mode={salvageResolutionMode}>
                {#if salvageModeOption?.icon}
                  <i class={salvageModeOption.icon} aria-hidden="true"></i>
                {/if}
                <span>{salvageModeLabel}</span>
              </span>
              <span class="manager-component-heading-divider" aria-hidden="true"></span>
            {/if}
            <span class="manager-component-micro-label">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.EnabledMicro', 'Enabled')}</span>
            <!-- The per-component salvage gate (issue 676). It was persisted, normalized
                 and a live runtime gate long before any control wrote it, so a component
                 auto-disabled by `_disableInvalidSalvageConfigs` was permanently
                 unsalvageable from the UI. This toggle is the fix.

                 The zero-groups explanation is VISIBLE body copy
                 (`[data-salvage-disabled-notice]`), never a `title` on this button: a
                 DISABLED <button> receives no mouse events, so a tooltip would never
                 appear in any browser — and no mounted test would notice, because the
                 attribute IS in the DOM. -->
            <!-- `is-on`/`is-off` mirror ToggleCard's switch exactly: same class pair,
                 same `aria-pressed`, so the toggle this replaced is a no-op DOM diff at
                 the control itself. -->
            <button
              type="button"
              class={`manager-status-toggle ${salvageEnabled ? 'is-on' : 'is-off'}`}
              data-recipe-field="salvageEnabled"
              aria-pressed={salvageEnabled}
              aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.Enable', 'Salvage this component')}
              disabled={salvageToggleDisabled}
              onclick={() => setSalvage({ enabled: !salvageEnabled })}
            >
              <span class="manager-status-toggle-track"><span class="manager-status-toggle-knob"></span></span>
            </button>
          </div>
        </div>

        {#if !salvageEnabled}
          <p class="manager-muted" data-salvage-disabled-notice>{salvageDisabledNotice}</p>
        {/if}

        <!-- The banner and the reorder policy sit ABOVE the list, not after it (issue
             676): both describe what the ORDER MEANS, and the order is the thing being
             authored below. The reorder card used to render at the very bottom, after
             "Add group" — the GM read the policy governing the list only after they had
             finished writing it. -->
        {#if salvageShowChrome && salvageProgressive}
          <p class="manager-component-info-banner" data-salvage-roll-budget>
            <i class="fas fa-dice-d20" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.RollBudget', 'Roll budget flows down the list · each stage consumes its difficulty before the next is recovered')}</span>
          </p>

          <!-- Progressive-only: the flag has no meaning in the simple/routed salvage
               modes, which award a whole group rather than spending down a list. -->
          <ToggleCard
            variant="is-info"
            icon="fas fa-arrow-down-a-z"
            section="salvage-allow-player-result-reorder"
            field="salvageAllowPlayerResultReorder"
            title={text('FABRICATE.Admin.Manager.Component.SalvageReorder.Title', 'Allow player result re-ordering')}
            sub={text('FABRICATE.Admin.Manager.Component.SalvageReorder.Sub', 'Let players drag the salvage order at the table; off keeps this GM order fixed.')}
            toggleLabel={text('FABRICATE.Admin.Manager.Component.SalvageReorder.Toggle', 'Allow player result re-ordering')}
            on={salvageDraft.allowPlayerResultReorder !== false}
            disabled={saving}
            onToggle={(next) => setSalvage({ allowPlayerResultReorder: next === true })}
          />
        {/if}

        <div class="manager-field" data-salvage-result-groups>
        {#if salvageProgressive}
          <!-- PROGRESSIVE: an ordered list of SINGLE results, with no group chrome.
               See `salvageStageGroup` for why the groups are still the storage and why
               this list is `resultGroups[0].results`. -->
          <span class="manager-component-readonly-label">
            <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Results', 'Results')}</span>
          </span>
          {#if salvageStages.length > 0}
            <ul class="manager-salvage-stage-list">
              {#each salvageStages as result, stageIndex (result.id)}
                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                <li
                  class={`manager-salvage-stage-row ${draggingStageIndex === stageIndex ? 'is-dragging' : ''}`}
                  data-salvage-result={result.id}
                  data-salvage-stage={String(stageIndex + 1)}
                  draggable={saving ? 'false' : 'true'}
                  ondragstart={() => onStageDragStart(stageIndex)}
                  ondragover={(event) => event.preventDefault()}
                  ondrop={(event) => { event.preventDefault(); onStageDrop(stageIndex); }}
                  ondragend={() => { draggingStageIndex = null; }}
                >
                  <span class="manager-salvage-stage-grip" aria-hidden="true"><i class="fas fa-grip-vertical"></i></span>
                  <span
                    class="manager-salvage-result-ordinal"
                    data-salvage-result-ordinal={String(stageIndex + 1)}
                    aria-hidden="true">{stageIndex + 1}</span
                  >
                  {@render salvageComponentPicker(salvageStageGroup.id, result)}

                  <!-- NO QUANTITY HERE (issue 676). Progressive is an ordered list of
                       INDIVIDUAL results: the award loop charges this entry's difficulty
                       once and awards it once, so "two of X" is authored by listing X
                       twice, never by a count. The ENGINE enforces it —
                       `CraftingEngine._resolveSalvageResultGroups` forces `quantity: 1` on
                       every awarded progressive entry, exactly as
                       `ResolutionModeService._resolveProgressive` always has for recipes.
                       The control was removed only AFTER that, so this hides nothing a
                       world can still be awarded. -->

                  <!-- READ-ONLY: `difficulty` belongs to the RESULT component, whose own
                       editor owns its save lifecycle; this surface is editing a
                       different component. The "Edit" link is the way to change it. -->
                  <span
                    class="manager-salvage-result-difficulty"
                    data-salvage-result-difficulty={salvageResultDifficulty(result.componentId) === null
                      ? ''
                      : String(salvageResultDifficulty(result.componentId))}
                  ><!-- The fallback must MATCH the lang value, or the two disagree and the
                       fallback silently describes a string nobody ever sees: `lang/en.json`
                       resolves `DifficultyUnset` to "No difficulty", so the literal "DC —"
                       here only ever rendered in a test with no i18n loaded. The recipe
                       stage row (issue 676) reads the same, which is the point. -->
                  {salvageResultDifficulty(result.componentId) === null
                      ? text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyUnset', 'No difficulty')
                      : `${text('FABRICATE.Admin.Manager.Component.SalvageEditor.DifficultyShort', 'DC')} ${salvageResultDifficulty(result.componentId)}`}</span
                  >

                  {#if result.componentId}
                    <!-- Opens the referenced YIELD component's editor — the IN-MANAGER
                         component-edit view, not the standalone SvelteComponentEditorApp
                         window. Component -> component navigation is guarded
                         (confirmComponentRouteExit deliberately has no component-edit
                         bypass), so a dirty draft prompts rather than being discarded. -->
                    <button
                      type="button"
                      class="manager-salvage-stage-edit"
                      data-salvage-result-edit={result.componentId}
                      aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.EditResult', 'Edit {name}').replace('{name}', salvageComponentName(result.componentId))}
                      title={text('FABRICATE.Admin.Manager.Component.SalvageEditor.EditDcHint', 'Set on this component in its editor')}
                      onclick={() => onOpenComponent(result.componentId)}
                      disabled={saving}
                    >
                      <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.Edit', 'Edit')}</span>
                      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
                    </button>
                  {/if}

                  <!-- Drag is an ENHANCEMENT; the chevrons are the accessible reorder
                       path and are what a keyboard user gets. Disabled at the ends. -->
                  <span class="manager-salvage-stage-reorder">
                    <button
                      type="button"
                      class="manager-salvage-stage-move"
                      data-salvage-stage-up
                      aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.MoveUp', 'Move up')}
                      disabled={saving || stageIndex === 0}
                      onclick={() => moveSalvageStage(stageIndex, -1)}
                    ><i class="fas fa-chevron-up" aria-hidden="true"></i></button>
                    <button
                      type="button"
                      class="manager-salvage-stage-move"
                      data-salvage-stage-down
                      aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.MoveDown', 'Move down')}
                      disabled={saving || stageIndex === salvageStages.length - 1}
                      onclick={() => moveSalvageStage(stageIndex, 1)}
                    ><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
                  </span>

                  <button
                    type="button"
                    class="manager-icon-button is-danger"
                    aria-label={text('FABRICATE.Admin.Manager.Component.SalvageEditor.RemoveResult', 'Remove result')}
                    data-remove-salvage-result
                    onclick={() => removeSalvageStage(result.id)}
                    disabled={saving}
                  >
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Component.SalvageEditor.NoResultsYet', 'No results yet.')}</p>
          {/if}
          <!-- `data-add-salvage-group` rides this button ONLY while there is no backing
               group, because in that state this IS the add-group control: it is what
               takes a progressive component from zero groups to one, which the
               normalizer's clamp requires before `enabled` can ever be true. That is
               Ruling A's invariant in progressive mode, and it stays literally testable. -->
          <button
            type="button"
            class="manager-button"
            data-add-salvage-result
            data-add-salvage-group={salvageStageGroup ? undefined : ''}
            onclick={() => addSalvageStage()}
            disabled={saving}
          >
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Component.SalvageEditor.AddResult', 'Add result')}</span>
          </button>
        {:else}
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
                      {#each group.results as result (result.id)}
                        <li class="manager-salvage-result-row" data-salvage-result={result.id}>
                          {@render salvageComponentPicker(group.id, result)}
                          <!-- The quantity STAYS in simple/routed: these modes award the
                               whole group as authored, so a count is a real, honoured
                               field here. Only progressive drops it. -->
                          <Stepper
                            value={result.quantity}
                            min={1}
                            ariaLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.ResultQuantity', 'Quantity for {name}').replace('{name}', salvageComponentName(result.componentId))}
                            decrementLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.DecrementResult', 'Decrease quantity')}
                            incrementLabel={text('FABRICATE.Admin.Manager.Component.SalvageEditor.IncrementResult', 'Increase quantity')}
                            max={9999}
                            disabled={saving}
                            inputProps={{ 'data-salvage-result-quantity': '', class: 'fab-stepper-input manager-component-stepper-quantity' }}
                            onChange={(next) => updateSalvageResult(group.id, result.id, { quantity: clampSalvageQuantity(next) })}
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
        {/if}
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
