<!-- Svelte 5 runes mode -->
<!--
  The GM essence EDITOR (issue 1036): three tabs — Identity, On craft, Validation — beside
  the shell's own inspector column, which the manager root fills with the live
  `EssenceBehaviorPreview`.

  This component is the editor's DRAFT owner and its form. Everything visual belongs to the
  three tab bodies under `essences/`; what is here is the draft, the dirty computation, the
  save, and the two async resolutions the tabs cannot do for themselves (the macro's display
  name, and the `type !== 'script'` check on a dropped macro).

  ── EVERY TAB PROP MUST ALSO BE FORWARDED HERE ────────────────────────────────────
  This file is the essence equivalent of the `RecipeEditView` wrapper: a prop a tab declares
  but this file does not pass silently takes its default, which for an editor means "renders
  as if nothing were authored". Adding a field to a tab means adding it here too.

  ── THE FORM ID IS A CONTRACT ─────────────────────────────────────────────────────
  `id="manager-essence-edit-form"` is what the manager root's header Save button — now the
  shared `ComponentEditorHeader`, wearing this studio's own hooks — submits through
  `form="manager-essence-edit-form"`. Both halves must survive verbatim: drop either and
  Save silently stops working. The header renders in the SHELL's action bar, not here,
  which is why this file does not import it.
-->
<script>
  import EssenceEditorTabs from './essences/EssenceEditorTabs.svelte';
  import EssenceIdentityTab from './essences/EssenceIdentityTab.svelte';
  import EssenceOnCraftTab from './essences/EssenceOnCraftTab.svelte';
  import EssenceValidationTab from './essences/EssenceValidationTab.svelte';
  import {
    DEFAULT_ESSENCE_ICON,
    normalizeEssenceColorToken,
    normalizeEssenceIcon,
  } from '../../util/essenceIcons.js';
  import { localize } from '../../util/foundryBridge.js';
  import { resolveDropUuid } from '../../util/dropUtils.js';
  import {
    MACRO_DROP_REJECTED_NOT_SCRIPT,
    evaluateMacroDrop,
    resolveMacroName,
  } from '../../../../utils/macroReference.js';
  import { essenceEditorValidation } from '../../../../utils/essenceValidation.js';
  import { essenceOnCraftCount } from './essences/essenceStudio.js';

  let {
    essence = null,
    managedItemOptions = [],
    showSourceUi = false,
    showPropertyMacroUi = false,
    saving = false,
    onSave = () => {},
    onDirtyChange = () => {},
    onDraftChange = () => {},
    onImportSourceDrop = null,
    // The clipboard seam for the linked source's copy-uuid action (issue 1036, maintainer
    // round 2). Null-by-default rather than a no-op: `ItemDropZone` renders the copy button
    // only when it is given a handler, so an absent seam hides the control instead of
    // shipping one that silently does nothing.
    onCopySourceUuid = null,
  } = $props();

  let activeTab = $state('identity');
  let draftId = $state('');
  let name = $state('');
  let description = $state('');
  let icon = $state(DEFAULT_ESSENCE_ICON);
  // The optional per-essence colour (issue 917). '' is the first-class "unset" state: the
  // essence then renders in the theme accent, which is what every essence rendered as
  // before, so an unauthored system needs no migration.
  let colorToken = $state('');
  let enabled = $state(true);
  let propertyMacroUuid = $state('');
  let sourceComponentId = $state('');
  let sourceTouched = $state(false);
  let saveFailed = $state(false);
  let macroWarning = $state('');
  let macroName = $state('');
  let macroMissing = $state(false);
  let lastEssenceId = $state(null);
  let lastDirty = $state(false);
  let lastDraftSignature = $state('');

  const isNew = $derived(!essence?.id);
  const selectedSource = $derived(
    sourceComponentId
      ? managedItemOptions.find((item) => item.id === sourceComponentId) || null
      : null
  );
  const dirty = $derived(isDirty());
  const validName = $derived(Boolean(name.trim()));
  const draftSummary = $derived(buildDraftSummary());
  const draftSignature = $derived(
    [
      draftSummary.id,
      draftSummary.name,
      draftSummary.description,
      draftSummary.icon,
      draftSummary.colorToken || '',
      draftSummary.enabled ? 'on' : 'off',
      draftSummary.propertyMacroUuid || '',
      draftSummary.sourceComponentId,
      draftSummary.sourceName,
      draftSummary.sourceState,
      draftSummary.dirty ? 'dirty' : 'clean',
      draftSummary.validName ? 'valid' : 'invalid',
      showSourceUi ? 'source' : 'no-source',
      showPropertyMacroUi ? 'macro' : 'no-macro',
      macroName,
    ].join('')
  );

  const onCraftCount = $derived(
    essenceOnCraftCount(draftSummary, {
      effectTransferEnabled: showSourceUi,
      propertyMacrosEnabled: showPropertyMacroUi,
    })
  );
  const validationContext = $derived({
    propertyMacrosEnabled: showPropertyMacroUi,
    effectTransferEnabled: showSourceUi,
    // `null` while resolution is still in flight, which PASSES: a spinner must not read as
    // a defect. Only a proven miss reports `false`.
    macroResolved: propertyMacroUuid ? !macroMissing : null,
    sourceState: draftSummary.sourceState,
    componentUsageCount: essence?.componentUsageCount || 0,
    recipeUsageCount: essence?.recipeUsageCount || 0,
  });
  // The tab badge's two numbers, from the SAME pure evaluator the Validation tab renders,
  // so the badge and the tab can never disagree about how many issues there are.
  const validationCounts = $derived(
    essenceEditorValidation(draftSummary, validationContext).counts
  );

  $effect(() => {
    const nextEssenceId = essence?.id || '__new__';
    if (nextEssenceId === lastEssenceId) return;
    draftId = essence?.id || '';
    name = essence?.name || '';
    description = essence?.description || '';
    icon = normalizeEssenceIcon(essence?.icon || DEFAULT_ESSENCE_ICON);
    colorToken = normalizeEssenceColorToken(essence?.colorToken) || '';
    enabled = essence?.enabled !== false;
    propertyMacroUuid = essence?.propertyMacroUuid || '';
    sourceComponentId = sourceIdentity(essence);
    sourceTouched = false;
    saveFailed = false;
    macroWarning = '';
    activeTab = 'identity';
    lastEssenceId = nextEssenceId;
  });

  // The macro's display NAME, resolved cancellably. The `cancelled` latch inside
  // `resolveMacroName` is what stops a slow lookup of the OLD uuid landing after a fast
  // lookup of the new one and naming a macro that is no longer linked.
  $effect(() => {
    const uuid = propertyMacroUuid;
    return resolveMacroName(uuid, ({ name: resolved, missing }) => {
      macroName = resolved;
      macroMissing = missing;
    });
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
    return Boolean(
      essence?.sourceName ||
      essence?.sourceItemUuid ||
      essence?.sourceComponentId ||
      essence?.associatedSystemItemId
    );
  }

  function draftSourceState() {
    if (!showSourceUi) return 'none';
    if (!sourceComponentId) {
      return !sourceTouched && hasStoredSourceEvidence() ? essence?.sourceState || 'stale' : 'none';
    }
    if (!selectedSource) return 'stale';
    if (selectedSource.originItemUuid || selectedSource.registeredItemUuid) return 'linked';
    return 'missing';
  }

  function storedSourceName() {
    if (!showSourceUi || sourceTouched) return '';
    return essence?.sourceName || essence?.sourceItemUuid || '';
  }

  function buildUpdates() {
    const updates = {
      name: name.trim(),
      description,
      icon: normalizeEssenceIcon(icon),
      // Always sent, so clearing an authored colour persists as null rather than leaving
      // the stored value untouched. `enabled` and `propertyMacroUuid` follow the same rule:
      // the store's `updateEssence` is presence-gated on `hasOwnProperty`, and both have a
      // meaningful FALSY value (`false` disables, `null` unlinks).
      colorToken: normalizeEssenceColorToken(colorToken),
      enabled: enabled !== false,
    };
    if (showPropertyMacroUi) updates.propertyMacroUuid = propertyMacroUuid || null;
    if (showSourceUi && (isNew || sourceTouched)) {
      updates.sourceComponentId = sourceComponentId || null;
    }
    return updates;
  }

  function buildDraftSummary() {
    const normalizedIcon = normalizeEssenceIcon(icon);
    const sourceStateId = draftSourceState();
    const resolvedSourceName = showSourceUi
      ? selectedSource?.name || (sourceComponentId ? sourceComponentId : storedSourceName())
      : '';
    return {
      id: draftId || '',
      updates: buildUpdates(),
      name:
        name.trim() ||
        text('FABRICATE.Admin.Manager.Essence.CreateInspectorTitle', 'New essence draft'),
      description,
      icon: normalizedIcon,
      colorToken: normalizeEssenceColorToken(colorToken),
      enabled: enabled !== false,
      propertyMacroUuid: propertyMacroUuid || null,
      // The RESOLVED macro name, not the uuid. `draftSignature` already re-fires on
      // `macroName`, so the summary was recomputed every time the name resolved and then
      // emitted without it — and the manager root's live preview, having nothing else to
      // pass, printed "Runs Macro.lab-aether-binding" where the design shows "Runs Ember
      // Infusion". It is empty while resolution is in flight, and
      // `projectEssenceBehaviourFacts` falls back to "the linked property macro" then.
      macroName,
      // The two derived capability facts the preview, the tab badge and the row all read.
      // Named exactly as `adminStore._buildEssenceCards` emits them, so the live draft and
      // a persisted card are interchangeable everywhere they are consumed.
      hasEffectTransfer: showSourceUi && sourceStateId !== 'none',
      hasPropertyMacro: showPropertyMacroUi && Boolean(propertyMacroUuid),
      sourceComponentId: showSourceUi ? sourceComponentId || '' : '',
      sourceName: resolvedSourceName,
      sourceState: showSourceUi ? sourceStateId : 'none',
      componentUsageCount: essence?.componentUsageCount || 0,
      componentUsageItems: essence?.componentUsageItems || [],
      recipeUsageCount: essence?.recipeUsageCount || 0,
      deleteBlocked: essence?.deleteBlocked === true,
      dirty,
      validName,
    };
  }

  function isDirty() {
    if (isNew) {
      return Boolean(
        name.trim() ||
        description.trim() ||
        normalizeEssenceIcon(icon) !== DEFAULT_ESSENCE_ICON ||
        colorToken ||
        enabled === false ||
        propertyMacroUuid ||
        (showSourceUi && sourceComponentId)
      );
    }
    return (
      name !== (essence?.name || '') ||
      description !== (essence?.description || '') ||
      normalizeEssenceIcon(icon) !== normalizeEssenceIcon(essence?.icon || DEFAULT_ESSENCE_ICON) ||
      normalizeEssenceColorToken(colorToken) !== normalizeEssenceColorToken(essence?.colorToken) ||
      (enabled !== false) !== (essence?.enabled !== false) ||
      (propertyMacroUuid || '') !== (essence?.propertyMacroUuid || '') ||
      (showSourceUi && (sourceTouched || sourceComponentId !== sourceIdentity(essence)))
    );
  }

  // A throw is a failure exactly as a `false` return is, so both mark the draft failed in
  // their own branch. The save is still awaited exactly once — an extra async hop here
  // would move the failure notice a microtask later than the mounted route tests observe it.
  async function handleSave(event) {
    event.preventDefault();
    if (!validName || saving) return;
    saveFailed = false;
    const updates = buildUpdates();
    try {
      const result = await onSave(draftId || null, updates);
      if (result === false) saveFailed = true;
    } catch {
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

  // The `type !== 'script'` rejection. It is HERE and not in the drop predicate: a payload's
  // `type` is the document NAME (`'Macro'`), and the macro's own type needs `await
  // fromUuid`, which a synchronous predicate cannot do. `evaluateMacroDrop` fails OPEN when
  // there is no resolver, so the View Lab and mounted tests can still author a link.
  async function handleMacroDrop(data) {
    macroWarning = '';
    const uuid = resolveDropUuid(data);
    const result = await evaluateMacroDrop(uuid);
    if (result.accepted) {
      propertyMacroUuid = result.uuid;
      return;
    }
    macroWarning =
      result.reason === MACRO_DROP_REJECTED_NOT_SCRIPT
        ? text(
            'FABRICATE.Admin.Manager.Essence.Macro.NotScript',
            'That macro is not a script macro, so Fabricate cannot run it. Change its type to Script and drop it again.'
          )
        : text(
            'FABRICATE.Admin.Manager.Essence.Macro.Unresolved',
            'That macro could not be found. Drop a macro from this world or an installed compendium.'
          );
  }
</script>

<main
  class="manager-main manager-essence-edit-main"
  aria-label={isNew
    ? text('FABRICATE.Admin.Manager.Essence.CreateTitle', 'Create essence')
    : text('FABRICATE.Admin.Manager.Essence.EditTitle', 'Edit essence')}
>
  <EssenceEditorTabs
    {activeTab}
    {onCraftCount}
    blockingCount={validationCounts.blocking}
    warningCount={validationCounts.warnings}
    onChange={(tab) => (activeTab = tab)}
  />

  <form id="manager-essence-edit-form" class="manager-essence-edit-view" onsubmit={handleSave}>
    <div
      class="manager-essence-tab-panel"
      id={`essence-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`essence-tab-${activeTab}`}
      tabindex="-1"
    >
      {#if activeTab === 'identity'}
        <EssenceIdentityTab
          {name}
          {description}
          {icon}
          {colorToken}
          {enabled}
          {saving}
          onNameChange={(value) => (name = value)}
          onDescriptionChange={(value) => (description = value)}
          onIconChange={(value) => (icon = value)}
          onColourChange={(value) => (colorToken = normalizeEssenceColorToken(value) || '')}
          onEnabledChange={(value) => (enabled = value !== false)}
        />
      {:else if activeTab === 'oncraft'}
        <EssenceOnCraftTab
          {sourceComponentId}
          {selectedSource}
          storedSourceName={storedSourceName()}
          macroUuid={propertyMacroUuid}
          {macroName}
          {macroMissing}
          {macroWarning}
          disabledEssence={enabled === false}
          {managedItemOptions}
          effectTransferEnabled={showSourceUi}
          propertyMacrosEnabled={showPropertyMacroUi}
          {saving}
          onSourceSelect={(itemId) => {
            sourceComponentId = itemId || '';
            sourceTouched = true;
          }}
          onSourceDrop={handleSourceDrop}
          onSourceClear={() => {
            sourceComponentId = '';
            sourceTouched = true;
          }}
          {onCopySourceUuid}
          onMacroDrop={handleMacroDrop}
          onMacroUnlink={() => {
            propertyMacroUuid = '';
            macroWarning = '';
          }}
        />
      {:else}
        <EssenceValidationTab essence={draftSummary} context={validationContext} />
      {/if}
    </div>

    {#if saveFailed}
      <p class="manager-muted manager-form-warning" role="alert">
        {text(
          'FABRICATE.Admin.Manager.Essence.SaveFailed',
          'Save failed. Check for duplicate or blank names and try again.'
        )}
      </p>
    {/if}
  </form>
</main>

<style>
  /* Route-level placement — the two-track template and the route's own overflow — is
     GLOBAL (`.fabricate-manager[data-manager-view="essence-edit"] .manager-main`), because
     a scoped child block cannot reach a shell container rule. What is scoped here is only
     what belongs to the tab body itself. */
  .manager-essence-tab-panel {
    min-height: 0;
  }
</style>
