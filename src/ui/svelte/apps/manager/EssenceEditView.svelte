<!-- Svelte 5 runes mode -->
<!--
  THE SYSTEM ESSENCE RULES EDITOR (issues 1036 and 1372).

  It is the system-scope half of the essence model: a world record holds the essence's identity
  and every crafting system that has the essence resolves the same one, and THIS screen holds what
  that essence does on craft in ONE system.

  ── IT HAS TWO SHAPES, AND THE FORK IS "IS THERE A SHARED DEFINITION" ─────────────
  `rulesMode` is `scopedKnown && !isNew` — the world catalogue holds this essence, so there IS a
  record that owns its identity. Then the editor is the two-tab rules screen: `Essence rules` and
  `Validation`, and the rules tab is the shared-definition callout, the per-system enable switch,
  the two behaviour cards each carrying its own inherit switch, and the copy-to-other-systems
  action.

  Otherwise — a CREATE draft, or a world corpus that cannot answer — it is the shipped three-tab
  editor with its Identity tab. That is not a hedge: a create draft's in-system record is the only
  record there is, so there is no shared layer for an identity edit to contradict, and the moment
  it is saved the world corpus answers for it and it is the rules screen forever after.

  ── IDENTITY IS NOT EDITABLE FROM A SYSTEM, AND THE ABSENCE IS THE FEATURE ────────
  `ui-integration/spec.md` `### GM World Essence Screens` requirement 10. A name, glyph, colour or
  description edited here would rename the essence in every other system holding it, from a screen
  titled with one of them. The route to those fields is the callout's `Edit shared definition`,
  which opens the world essence entry editor — the surface that owns them — and it is the ONLY
  route this screen offers to them.

  ── THIS COMPONENT IS THE EDITOR'S DRAFT OWNER AND ITS FORM ───────────────────────
  Everything visual belongs to the tab bodies under `essences/` and the shared cards under
  `scoped/`; what is here is the draft, the dirty computation, the save, and the two async
  resolutions the tabs cannot do for themselves (the macro's display name, and the
  `type !== 'script'` check on a dropped macro).

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

  ── WHAT IS BUFFERED AND WHAT IS NOT ──────────────────────────────────────────────
  The in-system record's fields — including `enabled` — accumulate in this draft and land on
  Save. The MEMBERSHIP writes do not: adding this essence to the system and switching a section
  between inherited and overridden are actions on a world-scope record this draft does not
  describe, and each lands immediately, exactly as `### Scoped entity editor patterns`
  requirement 14 states for the world entry editors.
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
  import {
    ESSENCE_EDITOR_TABS,
    ESSENCE_RULES_TABS,
    essenceOnCraftCount,
  } from './essences/essenceStudio.js';
  import Callout from './Callout.svelte';
  import ToggleCard from './ToggleCard.svelte';
  import CopyRulesCard from './scoped/CopyRulesCard.svelte';
  import MembershipActions from './scoped/MembershipActions.svelte';
  import SharedDefinitionCallout from './scoped/SharedDefinitionCallout.svelte';
  import {
    essenceInheritHeading,
    essenceSectionNote,
    essenceSectionValueName,
  } from './scoped/essenceScoped.js';

  let {
    scope = null,
    actions = null,
    systems = [],
    systemId = '',
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
    // THE ROUTE OUT TO THE SHARED DEFINITION (issue 1372, maintainer parity round 7). A page
    // cannot navigate, so the shell supplies this and it opens `world-essence-entry` on this
    // essence. Null-by-default for the same reason as the clipboard seam above: the callout
    // hides the exit rather than shipping a button that does nothing.
    onOpenSharedDefinition = null,
  } = $props();

  let activeTab = $state('rules');
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

  // ── THE WORLD-SCOPE JOIN ────────────────────────────────────────────────────────────────
  // Every one of these is guarded on `scopedKnown`, which is false for an unreadable corpus, for
  // a new draft, and for an essence the world catalogue does not hold — the last being an
  // ordinary state, because the in-system array still decides its own rows while
  // `## CraftingSystem` requirement 36 holds. In every one of those the editor renders exactly as
  // it did before this change.
  const activeSystemId = $derived(String(systemId || ''));
  const worldEntry = $derived(
    essence?.id ? ((scope?.entries ?? []).find((entry) => entry.id === essence.id) ?? null) : null
  );
  const scopedKnown = $derived(
    scope?.available === true && activeSystemId !== '' && worldEntry !== null
  );
  const systemRow = $derived(
    (worldEntry?.systems ?? []).find((row) => row.systemId === activeSystemId) ?? null
  );
  const member = $derived(systemRow?.member === true);
  const inheritedMap = $derived(systemRow?.inherited ?? {});
  const systemName = $derived(
    (Array.isArray(systems) ? systems : []).find((system) => system?.id === activeSystemId)?.name ||
      activeSystemId
  );
  // AN ABSENT `inherit` KEY READS AS INHERITING, matching `isSectionInherited`. So the lock is on
  // by default for a member, which is the correct default: a fresh membership record inherits
  // every section, and an editor that presented an edit affordance for it would offer to change
  // a value the system does not own.
  const lockedSections = $derived({
    effectSource: scopedKnown && member && inheritedMap.effectSource !== false,
    macro: scopedKnown && member && inheritedMap.macro !== false,
  });
  const worldDefaultNames = $derived({
    effectSource: essenceSectionValueName(worldEntry?.defaults?.effectSource),
    macro: essenceSectionValueName(worldEntry?.defaults?.macro),
  });
  const inheritNotes = $derived({
    effectSource: essenceSectionNote({
      inherited: inheritedMap.effectSource !== false,
      worldName: worldDefaultNames.effectSource,
      section: 'effectSource',
      format: formatted,
    }),
    macro: essenceSectionNote({
      inherited: inheritedMap.macro !== false,
      worldName: worldDefaultNames.macro,
      section: 'macro',
      format: formatted,
    }),
  });
  // The bold head sentence of each inherit row. It names the SYSTEM, which the tab body is not
  // handed, so it is composed here and passed down beside the notes.
  const inheritHeadings = $derived({
    effectSource: essenceInheritHeading({
      inherited: inheritedMap.effectSource !== false,
      systemName,
      format: formatted,
    }),
    macro: essenceInheritHeading({
      inherited: inheritedMap.macro !== false,
      systemName,
      format: formatted,
    }),
  });
  const sharedWithCount = $derived(Math.max(0, (Number(worldEntry?.membershipCount) || 0) - 1));

  const isNew = $derived(!essence?.id);
  // THE FORK. See the header note: a shared definition exists, so identity is not this screen's
  // to edit and the rules screen is what renders.
  const rulesMode = $derived(scopedKnown && !isNew);
  const editorTabs = $derived(rulesMode ? ESSENCE_RULES_TABS : ESSENCE_EDITOR_TABS);
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
    ].join('')
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
    // The five system-scope checks are armed ONLY when the world corpus can answer them.
    // `membershipKnown: false` is what keeps the shipped seven-check tab byte-identical for an
    // essence the world catalogue does not hold.
    membershipKnown: scopedKnown,
    member,
    enabledHere: enabled !== false,
    sectionInherited: inheritedMap,
    resolvedEffectSource: sourceComponentId || worldDefaultNames.effectSource,
    resolvedMacro: propertyMacroUuid || worldDefaultNames.macro,
    componentCarrierCount: essence?.componentUsageCount || 0,
    systemName,
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
    // THE FIRST TAB OF WHICHEVER SET IS RENDERING. A fixed `'identity'` would open the rules
    // screen on a tab its own strip does not contain, and the panel would render the
    // validation fallback under a strip showing `Essence rules` as selected.
    activeTab = editorTabs[0].id;
    lastEssenceId = nextEssenceId;
  });

  // THE STRIP AND THE PANEL CANNOT DISAGREE. `rulesMode` can flip after mount — the world corpus
  // is published asynchronously and an editor opened before it arrives starts on the create
  // editor's tab set — and the seed effect above only re-runs when the ESSENCE changes, so
  // without this the strip would render `Essence rules | Validation` with neither selected while
  // the panel rendered whichever body the stale token happened to reach.
  $effect(() => {
    if (editorTabs.some((tab) => tab.id === activeTab)) return;
    activeTab = editorTabs[0].id;
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

  function formatted(key, fallback, data) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(data ?? {})) {
      result = result.replaceAll(`{${token}}`, String(value));
    }
    return result;
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
  <!--
    ONE HEAD ELEMENT, AND IT IS LOAD-BEARING RATHER THAN TIDINESS.

    `styles/fabricate.css:2448` gives this route's `<main>` `grid-template-rows: auto minmax(0,
    1fr)` — EXACTLY TWO rows, the tab strip and the form. A third child of `<main>` lands in an
    implicit third row and the form then overlaps the tab strip: measured in the View Lab, the tab
    button was visible, enabled and stable and every click on it was intercepted by
    `<form id="manager-essence-edit-form">`, which is a screen a GM cannot change tabs on. The
    wrapper keeps the grid at two children whatever this head grows to carry.
  -->
  <div class="manager-essence-edit-head">
    <EssenceEditorTabs
      tabs={editorTabs}
      {activeTab}
      {onCraftCount}
      blockingCount={validationCounts.blocking}
      warningCount={validationCounts.warnings}
      onChange={(tab) => (activeTab = tab)}
    />
  </div>

  <form id="manager-essence-edit-form" class="manager-essence-edit-view" onsubmit={handleSave}>
    <div
      class="manager-essence-tab-panel"
      id={`essence-panel-${activeTab}`}
      role="tabpanel"
      aria-labelledby={`essence-tab-${activeTab}`}
      tabindex="-1"
      data-keyboard-focus="true"
    >
      {#if activeTab === 'validation'}
        <EssenceValidationTab essence={draftSummary} context={validationContext} />
      {:else if activeTab === 'identity'}
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
      {:else}
        <div class="manager-essence-rules-stack">
          {#if rulesMode}
            <!-- WHAT THIS SCREEN DOES NOT OWN, STATED FIRST, with the one route to it. -->
            <SharedDefinitionCallout
              name={essence?.name ?? ''}
              icon={normalizeEssenceIcon(essence?.icon || DEFAULT_ESSENCE_ICON)}
              tint={normalizeEssenceColorToken(essence?.colorToken) || ''}
              pillLabel={text(
                'FABRICATE.Admin.Manager.Scoped.Essence.WorldDefinitionPill',
                'World definition'
              )}
              note={sharedWithCount === 1
                ? text(
                    'FABRICATE.Admin.Manager.Scoped.Essence.IdentityBannerOne',
                    'Name, icon and colour are world vocabulary, shared with one other system. What it does on craft is set here.'
                  )
                : formatted(
                    'FABRICATE.Admin.Manager.Scoped.Essence.IdentityBanner',
                    'Name, icon and colour are world vocabulary, shared with {count} other systems. What it does on craft is set here.',
                    { count: sharedWithCount }
                  )}
              actionLabel={text(
                'FABRICATE.Admin.Manager.Scoped.Essence.EditSharedDefinition',
                'Edit shared definition'
              )}
              disabled={saving}
              onOpen={onOpenSharedDefinition
                ? () => onOpenSharedDefinition(essence?.id ?? '')
                : null}
            />

            {#if member}
              <!-- THE PER-SYSTEM ENABLE SWITCH, ON ITS OWN CARD. It used to share a grey slab
                 with the remove action and both inherit toggles, unlabelled, so the loudest
                 switch on the screen said only `Off` and never what it was off FOR. -->
              <ToggleCard
                icon=""
                title={formatted(
                  'FABRICATE.Admin.Manager.Essence.EnabledIn',
                  'Enabled in {system}',
                  { system: systemName }
                )}
                sub={text(
                  'FABRICATE.Admin.Manager.Essence.EnabledInHint',
                  'Components in this system can carry it, and recipes can require it.'
                )}
                on={enabled !== false}
                disabled={saving}
                section="enabled"
                field="essence-enabled"
                subAttr="data-essence-enabled-state"
                toggleLabel={enabled !== false
                  ? text('FABRICATE.Admin.Manager.Essence.DisableThis', 'Disable this essence')
                  : text('FABRICATE.Admin.Manager.Essence.EnableThis', 'Enable this essence')}
                onToggle={(next) => (enabled = next !== false)}
              />
            {:else}
              <!-- THE BLOCK STATE. No membership record means nothing in this system reads any
                 of the values below, so the editor says so and offers the one action that
                 changes it. -->
              <Callout
                tone="warning"
                text={formatted(
                  'FABRICATE.Admin.Manager.Scoped.Essence.NoRulesHere',
                  'No rules in {system}. Add it here to give this system its own record; it inherits every world default until you override a section.',
                  { system: systemName }
                )}
                dataAttr="data-essence-scope-state"
                dataValue="no-membership"
              />
              <MembershipActions
                entityType="essence"
                entityId={essence?.id ?? ''}
                systemId={activeSystemId}
                entityName={essence?.name ?? ''}
                {systemName}
                member={false}
                disabled={saving}
                onAdd={() => actions?.addToSystem?.(essence?.id, activeSystemId)}
              />
            {/if}
          {/if}

          <EssenceOnCraftTab
            scoped={rulesMode}
            inheritable={rulesMode && member}
            {inheritedMap}
            {inheritHeadings}
            onToggleInherit={(section, next) =>
              actions?.setSectionInherited?.(essence?.id, activeSystemId, section, next)}
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
            {lockedSections}
            {inheritNotes}
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

          {#if rulesMode && member}
            <!-- REUSE. A one-time clone into another system's own rules, never a live link,
               and the sentence beside the button says so. -->
            <CopyRulesCard
              {systems}
              currentSystemId={activeSystemId}
              icon="fas fa-copy"
              title={text('FABRICATE.Admin.Manager.Scoped.Essence.ReuseTitle', 'Reuse these rules')}
              blurb={text(
                'FABRICATE.Admin.Manager.Scoped.Essence.ReuseBlurb',
                'Copies the effect source and macro into another system’s own rules. One-time shortcut, not a live link.'
              )}
              actionLabel={text(
                'FABRICATE.Admin.Manager.Scoped.Essence.ReuseAction',
                'Copy to other systems…'
              )}
              disabled={saving}
              onCopy={(targets) =>
                actions?.copyMembership?.(essence?.id, activeSystemId, targets) ?? false}
            />
          {/if}
        </div>
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
  /* The `auto` grid row this route declares, holding the tab strip. See the note in the markup:
     a third child of `<main>` lands in an implicit row and the form overlaps the strip. */
  .manager-essence-edit-head {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The rules tab's own stack. The behaviour cards arrive inside `EssenceOnCraftTab`'s stack,
     so this one spaces the callout, the enable card, that group and the reuse card by the same
     step — one ladder down the page rather than two that happen to agree. */
  .manager-essence-rules-stack {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
    min-width: 0;
  }

  /* Route-level placement — the two-track template and the route's own overflow — is
     GLOBAL (`.fabricate-manager[data-manager-view="essence-edit"] .manager-main`), because
     a scoped child block cannot reach a shell container rule. What is scoped here is only
     what belongs to the tab body itself. */
  .manager-essence-tab-panel {
    min-height: 0;
  }
</style>
