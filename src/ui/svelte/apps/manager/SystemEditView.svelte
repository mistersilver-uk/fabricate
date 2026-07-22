<!-- Svelte 5 runes mode -->
<!--
  System Overview page. A full-width tabbed shell (mirroring the environment
  editor's EnvironmentEditView) with two tabs: Settings (the system settings form
  and the issue 454 system-blocker banner) and Validation (the kind-grouped validation
  issue list rendered by SystemOverviewView). The standalone "Overview" route was
  folded in here; the Settings tab is the default, and callers that want the
  validation list open pass `requestedTab='validation'`. GM-only by construction:
  the whole crafting manager admin is GM-scoped.
-->
<script>
  import { tick } from 'svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropData } from '../../util/dropUtils.js';
  import IconPicker from '../../components/IconPicker.svelte';
  import SystemEditorTabs from './system/SystemEditorTabs.svelte';
  import CharacterPrerequisitesCard from './system/CharacterPrerequisitesCard.svelte';
  import SystemOverviewView from './SystemOverviewView.svelte';
  import {
    mapModifierToPrerequisite,
    mapPrerequisiteToModifier,
    stripExpressionSigil
  } from '../../../../systems/characterModifierPrerequisiteCopy.js';

  let {
    selectedSystem = null,
    // True when the system carries a `blocks:'system'` validation issue. Drives a
    // GM-only full-width callout above the identity card on the Settings tab. The
    // whole crafting manager admin is GM-scoped, so this is GM-only by
    // construction.
    systemBlocked = false,
    // The `evaluateSystemValidation` report driving the Validation tab's
    // kind-grouped issue list and the tab's open-issue badge.
    validationReport = { issues: [], counts: { critical: 0, warning: 0, info: 0, blockers: 0 }, blocksSystem: false },
    // The tab the page should open on. The parent bumps `requestedTab` (and a
    // matching nonce) to request the Validation tab — e.g. from the blocker banner
    // link or a folded-in overview deep link.
    requestedTab = 'settings',
    // Bumped by the parent alongside `requestedTab` so re-requesting the same tab
    // (or re-selecting the same system) still re-applies the requested tab.
    requestedTabNonce = 0,
    onSelectIssue = () => {},
    onShowSystemOverview = () => {},
    onSaveDetails = () => {},
    // Lift the identity draft (Name + Description) up to the root so the Manager
    // route-exit guard can persist it on a Save-and-navigate. Emitted on every
    // input, mirroring the essence/component `onDraftChange` → root draft pattern.
    onDetailsChange = () => {},
    // Report the local dirty state up so the root can gate the route-exit guard. This
    // is the root's ONLY dirtiness signal: the comparison is against the live
    // `selectedSystem` projection and only this view holds the typed inputs, so the
    // root cannot re-derive it from the lifted draft alone.
    onDirtyChange = () => {},
    // Bumped by the root (discard branch of the guard) to force the local inputs to
    // re-seed from the persisted system even when the system id is unchanged. A
    // counter rather than a flag, so a second discard on the SAME system still
    // registers as a change (the `requestedTabNonce` idiom above).
    reseedNonce = 0,
    onToggleFeature = async () => true,
    characterModifierLibrary = [],
    characterModifierPresetsSupported = false,
    onAddCharacterModifier = async () => null,
    onUpdateCharacterModifier = async () => {},
    onDeleteCharacterModifier = async () => {},
    onSeedCharacterModifierPresets = async () => {},
    characterPrerequisiteLibrary = [],
    characterPrerequisitePresetsSupported = false,
    onAddCharacterPrerequisite = async () => null,
    onUpdateCharacterPrerequisite = async () => {},
    onDeleteCharacterPrerequisite = async () => {},
    onSeedCharacterPrerequisitePresets = async () => {},
    currencyUnits = [],
    currencyPresetsSupported = false,
    currencySpendStrategy = 'actorProperty',
    currencyProviderId = '',
    currencyMacros = { canAfford: '', increment: '', decrement: '' },
    currencyProviderOptions = [],
    onAddCurrencyUnit = async () => null,
    onUpdateCurrencyUnit = async () => {},
    onDeleteCurrencyUnit = async () => {},
    onAddCurrencySubUnit = async () => {},
    onUpdateCurrencySubUnit = async () => {},
    onDeleteCurrencySubUnit = async () => {},
    onSeedCurrencyPresets = async () => {},
    onSetCurrencySpendStrategy = async () => {},
    onSetCurrencyProvider = async () => {},
    onSetCurrencyMacro = async () => {},
    onClearCurrencyMacro = async () => {},
    onToggleCurrency = async () => {},
    onToggleTime = async () => {}
  } = $props();

  // Settings is the default tab. A bumped `requestedTabNonce` re-applies the
  // parent's `requestedTab` (so the blocker-link / folded-in overview deep link
  // can force the Validation tab open even when this page is already mounted, and
  // re-selecting the same system resets the tab sensibly).
  let activeTab = $state('settings');
  let appliedRequestNonce = $state(-1);
  $effect(() => {
    if (requestedTabNonce !== appliedRequestNonce) {
      appliedRequestNonce = requestedTabNonce;
      activeTab = requestedTab === 'validation' ? 'validation' : 'settings';
    }
  });

  const validationCounts = $derived(
    validationReport?.counts || { critical: 0, warning: 0, info: 0, blockers: 0 }
  );
  const validationBadges = $derived([
    ...(validationCounts.critical > 0 ? [{ label: String(validationCounts.critical), tone: 'danger' }] : []),
    ...(validationCounts.warning > 0 ? [{ label: String(validationCounts.warning), tone: 'warning' }] : [])
  ]);
  const tabBadges = $derived({ validation: validationBadges });

  const CURRENCY_SPEND_STRATEGY_OPTIONS = [
    { value: 'actorProperty', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorProperty', fallback: 'Actor data path', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorPropertyHint', hintFallback: 'Read and spend coins at a flat actor data path (e.g. dnd5e currency).' },
    { value: 'actorInventory', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorInventory', fallback: 'Actor inventory', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorInventoryHint', hintFallback: 'Use a preconfigured provider that reads and spends coins from the actor inventory (e.g. pf2e).' },
    { value: 'macro', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyMacro', fallback: 'Macro', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyMacroHint', hintFallback: 'Drive currency with your own macros; the macro receives the actor and does whatever it needs.' }
  ];
  const CURRENCY_MACRO_FIELDS = [
    { key: 'canAfford', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroCanAfford', labelFallback: 'Can afford macro', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroCanAffordHint', hintFallback: 'Runs to gate the craft; return true (or { canAfford: true }) when the actor can pay.' },
    { key: 'increment', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroIncrement', labelFallback: 'Increment macro', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroIncrementHint', hintFallback: 'Reserved for a future refund flow — configured now but not yet invoked.' },
    { key: 'decrement', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDecrement', labelFallback: 'Decrement macro', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDecrementHint', hintFallback: 'Runs after a successful craft to spend the currency cost.' }
  ];

  // Resolve each configured macro UUID to a { name, img, missing } display, mirroring the
  // RecipeContextRail/EnvironmentSummaryInspector linked-document pattern.
  let currencyMacroDocs = $state({});

  function setCurrencyMacroDoc(key, doc) {
    currencyMacroDocs = { ...currencyMacroDocs, [key]: doc };
  }

  // Kick off async resolution for one macro field; returns the synchronous placeholder. The
  // async branches each live in their own callback so this helper stays shallow.
  function resolveMacroFieldDoc(key, uuid, isCancelled) {
    const placeholder = { uuid, name: '', img: '', missing: false };
    if (typeof globalThis.fromUuid !== 'function') {
      return { ...placeholder, missing: true };
    }
    Promise.resolve(globalThis.fromUuid(uuid))
      .then(doc => {
        if (isCancelled()) return;
        setCurrencyMacroDoc(
          key,
          doc
            ? { uuid, name: String(doc.name || ''), img: String(doc.img || ''), missing: false }
            : { ...placeholder, missing: true }
        );
      })
      .catch(() => {
        if (!isCancelled()) setCurrencyMacroDoc(key, { ...placeholder, missing: true });
      });
    return placeholder;
  }

  $effect(() => {
    const macros = currencyMacros || {};
    const next = {};
    let cancelled = false;
    const isCancelled = () => cancelled;
    for (const field of CURRENCY_MACRO_FIELDS) {
      const uuid = String(macros[field.key] || '').trim();
      if (uuid) next[field.key] = resolveMacroFieldDoc(field.key, uuid, isCancelled);
    }
    currencyMacroDocs = next;
    return () => { cancelled = true; };
  });

  function currencyMacroDisplay(key) {
    return currencyMacroDocs[key] || null;
  }

  // Each empty macro drop zone needs a field-specific accessible name; otherwise the three zones
  // (canAfford/increment/decrement) expose an identical "Drag a macro here to link it." label and
  // are indistinguishable to assistive tech. Compose the visible field label with the drop hint.
  function currencyMacroDropZoneLabel(field) {
    const fieldLabel = text(field.labelKey, field.labelFallback);
    const composed = localize('FABRICATE.Admin.Manager.CurrencyUnits.MacroDropZoneLabel', {
      field: fieldLabel
    });
    if (composed && composed !== 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDropZoneLabel') {
      return composed;
    }
    return `${fieldLabel}: ${text('FABRICATE.Admin.Manager.CurrencyUnits.MacroDropHint', 'Drag a macro here to link it.')}`;
  }

  async function handleCurrencyMacroDrop(key, data) {
    const { uuid, type } = resolveDropData(data);
    if (type !== 'Macro' || !uuid) return;
    await onSetCurrencyMacro(key, uuid);
  }

  let characterModifierEditingId = $state('');
  let currencyExpandedUnitId = $state('');
  let currencySubUnitSelections = $state({});
  const ROLL_EXPRESSION_PATTERN_UI = /\bd\d|[*/()]/;

  // Whole-section collapse (issue 768) — a session-local Set keyed by section name
  // ('modifiers' | 'prerequisites' | 'currency'), mirroring ComponentsBrowserView's
  // `collapsedCategories`. In-memory only: preserved across store refresh, reset on
  // system switch, NEVER persisted. Distinct from the prerequisites card's per-item
  // accordion (`openId`) — this is a section-level wrapper. Collapse is opt-IN: a
  // section absent from the set is expanded.
  let collapsedSections = $state(new Set());
  let lastCollapseSystemId = $state(null);
  $effect(() => {
    const currentId = selectedSystem?.id ?? null;
    if (currentId !== lastCollapseSystemId) {
      lastCollapseSystemId = currentId;
      collapsedSections = new Set();
    }
  });
  function toggleSectionCollapsed(section) {
    const next = new Set(collapsedSections);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    collapsedSections = next;
  }
  function isSectionCollapsed(section) {
    return collapsedSections.has(section);
  }
  function expandSection(section) {
    if (!collapsedSections.has(section)) return;
    const next = new Set(collapsedSections);
    next.delete(section);
    collapsedSections = next;
  }

  // Cross-list copy (issue 768). A copy is an ADD into the destination store via
  // its existing (normalizing, id-generating) add op, then the new entry is opened
  // in edit mode in the target card so the dropped pass/fail-or-roll logic is an
  // honest, visible gap rather than a silent loss. `copyAnnouncement` drives a
  // shared aria-live region; a nonce forces the prerequisites card to open the
  // freshly-added entry even when its id-run is unchanged.
  let copyAnnouncement = $state('');
  let prereqRequestOpenId = $state('');
  let prereqRequestOpenNonce = $state(0);

  function announceCopy(name) {
    copyAnnouncement = localize('FABRICATE.Admin.Manager.ListErgonomics.CopiedAnnouncement', {
      name: String(name || '').trim()
    });
    if (
      !copyAnnouncement ||
      copyAnnouncement === 'FABRICATE.Admin.Manager.ListErgonomics.CopiedAnnouncement'
    ) {
      copyAnnouncement = `Copied ${String(name || '').trim()} and icon — set the condition.`;
    }
  }

  // The copied entry opens in edit mode in the OTHER section (Prereqs sit below
  // Modifiers, Modifiers above Prereqs), so for the long-list case this feature
  // targets it can land off-screen — the aria-live confirmation would then be the
  // ONLY signal (invisible to a sighted GM). After the target editor renders, scroll
  // the new row into view and move focus to its first editable field so the visible
  // confirmation matches the announced one. Scoped to this page's root (bound below)
  // so a query never crosses into another mounted manager instance.
  let pageRoot = $state(null);
  async function revealCopiedEntry(selector) {
    await tick();
    const node = pageRoot?.querySelector?.(selector);
    if (!node) return;
    node.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    const focusTarget = node.querySelector?.('input, select, textarea');
    focusTarget?.focus?.();
  }

  async function handleCopyModifierToPrerequisite(entry) {
    const created = await onAddCharacterPrerequisite(mapModifierToPrerequisite(entry));
    if (!created?.id) return;
    expandSection('prerequisites');
    prereqRequestOpenId = created.id;
    prereqRequestOpenNonce += 1;
    announceCopy(entry?.label);
    await revealCopiedEntry(`[data-system-character-prerequisite="${created.id}"]`);
  }

  async function handleCopyPrerequisiteToModifier(entry) {
    const created = await onAddCharacterModifier(mapPrerequisiteToModifier(entry));
    if (!created?.id) return;
    expandSection('modifiers');
    characterModifierEditingId = created.id;
    announceCopy(entry?.name);
    await revealCopiedEntry(`[data-system-character-modifier="${created.id}"]`);
  }

  const gatheringEnabled = $derived(selectedSystem?.features?.gathering === true);
  const currencyEnabled = $derived(selectedSystem?.requirements?.currency?.enabled === true);
  // Time requirements default ON (issue 714): an absent flag reads as enabled, so only
  // an explicit GM opt-out (`enabled === false`) turns the toggle off.
  const timeRequirementsEnabled = $derived(selectedSystem?.requirements?.time?.enabled !== false);

  async function handleToggleCurrency() {
    await onToggleCurrency(!currencyEnabled);
  }

  async function handleToggleTime() {
    await onToggleTime(!timeRequirementsEnabled);
  }

  // A system with no registered provider has nothing to drive the actorInventory strategy: the
  // resolved provider id is empty and its canonical ladder is empty. The store guards against
  // wiping the GM's units, and the editor surfaces a steer-to-macro callout in that case.
  const currencyHasProviders = $derived(currencyProviderOptions.length > 0);

  // Show the provider select only under the actorInventory strategy on a system that ships a
  // provider; otherwise the actorInventory branch renders the no-provider callout.
  const currencyShowProviderBranch = $derived(
    currencySpendStrategy === 'actorInventory' && currencyHasProviders
  );

  // Under the actorInventory strategy the selected provider owns the denomination ladder, so
  // currency units are provider-managed and read-only — editing them would desync the engine's
  // affordability/baseValue math from the system's real coin values. A no-provider system is never
  // read-only because its units stay GM-owned.
  const currencyUnitsReadOnly = $derived(currencyShowProviderBranch);

  // Under the macro strategy the configured macros own all conversion via unit abbreviations, so a
  // unit's `contains` breakdown is unused. The per-unit editor collapses to label/abbreviation/icon
  // and the whole sub-unit section (heading, add control, chips, warnings) is removed. Sub-units
  // only drive the engine under actorProperty (their `contains` feeds base-value and change-making).
  const currencyMacroMode = $derived(currencySpendStrategy === 'macro');

  function currencyProviderLabel() {
    const match = currencyProviderOptions.find((option) => option.id === currencyProviderId);
    return (
      match?.label ||
      text('FABRICATE.Admin.Manager.CurrencyUnits.Provider', 'Provider')
    );
  }

  function currencyProviderManagedHint() {
    return localize('FABRICATE.Admin.Manager.CurrencyUnits.ProviderManagedHint', {
      provider: currencyProviderLabel()
    });
  }

  // The strategy select renders one shared hint that reflects the selected strategy, so the GM
  // sees the actor-data-path / actor-inventory / macro guidance inline as they switch.
  function currencySpendStrategyHint() {
    const option = CURRENCY_SPEND_STRATEGY_OPTIONS.find((entry) => entry.value === currencySpendStrategy)
      || CURRENCY_SPEND_STRATEGY_OPTIONS[0];
    return text(option.hintKey, option.hintFallback);
  }

  function characterModifierIsRoll(entry) {
    return Boolean(entry?.expression) && ROLL_EXPRESSION_PATTERN_UI.test(entry.expression);
  }

  // The collapsed summary row shows the expression with its leading `@` sigil
  // stripped for a cleaner inline read (the raw `@`-prefixed value stays in the
  // editor's Expression field — only the DISPLAY strips it).
  function characterModifierExpressionDisplay(entry) {
    return stripExpressionSigil(entry?.expression);
  }

  async function handleAddCharacterModifier() {
    const entry = await onAddCharacterModifier();
    if (entry?.id) characterModifierEditingId = entry.id;
  }

  async function handleDeleteCharacterModifier(modifierId) {
    await onDeleteCharacterModifier(modifierId);
    if (characterModifierEditingId === modifierId) characterModifierEditingId = '';
  }

  async function handleAddCurrencyUnit() {
    const unit = await onAddCurrencyUnit();
    if (unit?.id) currencyExpandedUnitId = unit.id;
  }

  async function handleDeleteCurrencyUnit(unitId) {
    await onDeleteCurrencyUnit(unitId);
    if (currencyExpandedUnitId === unitId) currencyExpandedUnitId = '';
  }

  function currencyUnitLabel(unitId) {
    const unit = currencyUnits.find(entry => entry.id === unitId);
    return unit?.label || unit?.abbreviation || unitId;
  }

  function currencyUnitIcon(unitId) {
    const unit = currencyUnits.find(entry => entry.id === unitId);
    return unit?.icon || 'fa-solid fa-coins';
  }

  // Mirror of canAddCurrencySubUnit in src/systems/currencyProfile.js: a unit (plus everything it
  // transitively contains) reachable from the parent and from the child must be disjoint, or adding
  // the edge would give the parent two conversion paths to some node.
  function currencyReachableUnitIds(startUnitId) {
    const reachable = new Set();
    const stack = [startUnitId];
    while (stack.length > 0) {
      const currentId = stack.pop();
      if (!currentId || reachable.has(currentId)) continue;
      reachable.add(currentId);
      const unit = currencyUnits.find(entry => entry.id === currentId);
      for (const contained of unit?.contains || []) {
        stack.push(contained.unitId);
      }
    }
    return reachable;
  }

  function currencyCanAddSubUnit(parentUnitId, subUnitId) {
    if (!parentUnitId || !subUnitId || parentUnitId === subUnitId) return false;
    const parent = currencyUnits.find(entry => entry.id === parentUnitId);
    const child = currencyUnits.find(entry => entry.id === subUnitId);
    if (!parent || !child) return false;
    const parentReachable = currencyReachableUnitIds(parentUnitId);
    const childReachable = currencyReachableUnitIds(subUnitId);
    for (const id of childReachable) {
      if (parentReachable.has(id)) return false;
    }
    return true;
  }

  function currencyUnitSubUnitOptions(unitId) {
    return currencyUnits
      .filter(entry => currencyCanAddSubUnit(unitId, entry.id))
      .map(entry => ({ id: entry.id, label: entry.label || entry.id, abbreviation: entry.abbreviation || '' }));
  }

  function currencySelectedSubUnit(unitId) {
    const options = currencyUnitSubUnitOptions(unitId);
    const selected = currencySubUnitSelections[unitId] || '';
    return options.some(option => option.id === selected) ? selected : options[0]?.id || '';
  }

  function updateCurrencySubUnitSelection(unitId, value) {
    currencySubUnitSelections = { ...currencySubUnitSelections, [unitId]: value };
  }

  async function handleAddCurrencySubUnit(unitId) {
    const subUnitId = currencySelectedSubUnit(unitId);
    if (!subUnitId) return;
    await onAddCurrencySubUnit(unitId, subUnitId);
    updateCurrencySubUnitSelection(unitId, '');
  }

  $effect(() => {
    if (currencyExpandedUnitId && !currencyUnits.some(unit => unit.id === currencyExpandedUnitId)) {
      currencyExpandedUnitId = '';
    }
  });

  let systemNameValue = $state('');
  let systemDescriptionValue = $state('');

  // Seed the local inputs from the persisted system on IDENTITY change only (or a
  // root-driven `reseedNonce` bump on discard), never on every `selectedSystem`
  // reference change. The admin store publishes `viewState` twice on refresh (a
  // sync publish then an async-enriched publish with a NEW `selectedSystem` object
  // of the same id); a reference-triggered reseed would overwrite the GM's
  // un-saved keystrokes on that second publish (and on any unrelated mid-edit
  // refresh, e.g. a feature toggle). Gating on id/nonce keeps the typed value and
  // lets `detailsDirty` clear naturally after Save re-publishes the projection.
  let lastSeededSystemId = $state(null);
  let appliedReseedNonce = $state(0);
  $effect(() => {
    const currentId = selectedSystem?.id ?? null;
    if (currentId !== lastSeededSystemId || reseedNonce !== appliedReseedNonce) {
      lastSeededSystemId = currentId;
      appliedReseedNonce = reseedNonce;
      systemNameValue = selectedSystem?.name ?? '';
      systemDescriptionValue = selectedSystem?.description ?? '';
    }
  });

  const detailsDirty = $derived(
    (systemNameValue ?? '') !== (selectedSystem?.name ?? '') ||
      (systemDescriptionValue ?? '') !== (selectedSystem?.description ?? '')
  );

  // One-way up: mirror the typed values into the root draft and report dirtiness so
  // the route-exit guard can Save (from the lifted draft) or Discard on navigate.
  $effect(() => {
    onDetailsChange(systemNameValue, systemDescriptionValue);
  });
  $effect(() => {
    onDirtyChange(detailsDirty);
  });

  const featureDefinitions = [
    { systemKey: 'gathering', storeKey: 'gathering', icon: 'fas fa-wheat-awn', labelKey: 'FABRICATE.Admin.Manager.Feature.Gathering', fallback: 'Gathering', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Gathering', hintFallback: 'Shows gathering environments and player gathering flows for this system.' },
    { systemKey: 'salvage', storeKey: 'salvage', icon: 'fas fa-recycle', labelKey: 'FABRICATE.Admin.Manager.Feature.Salvage', fallback: 'Salvage', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Salvage', hintFallback: 'Enables component salvage and the salvage check configuration for this system.' },
    { systemKey: 'essences', storeKey: 'essences', icon: 'fas fa-flask', labelKey: 'FABRICATE.Admin.Manager.Feature.Essences', fallback: 'Essences', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Essences', hintFallback: 'Enables essence definitions and essence requirements.' },
    { systemKey: 'multiStepRecipes', storeKey: 'multiStepRecipes', icon: 'fas fa-diagram-project', labelKey: 'FABRICATE.Admin.Manager.Feature.MultiStepRecipes', fallback: 'Multi-step recipes', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.MultiStepRecipes', hintFallback: 'Enables explicit recipe steps and step-level requirements.' },
    { systemKey: 'propertyMacros', storeKey: 'propertyMacros', icon: 'fas fa-code', labelKey: 'FABRICATE.Admin.Manager.Feature.PropertyMacros', fallback: 'Property macros', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.PropertyMacros', hintFallback: 'Allows macro-backed component property behavior.' },
    { systemKey: 'effectTransfer', storeKey: 'effectTransfer', icon: 'fas fa-wand-sparkles', labelKey: 'FABRICATE.Admin.Manager.Feature.EffectTransfer', fallback: 'Effect transfer', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.EffectTransfer', hintFallback: 'Allows crafted results to inherit effects from source components.' },
    { systemKey: 'chatOutput', storeKey: 'chatOutput', icon: 'fas fa-comment', labelKey: 'FABRICATE.Admin.Manager.Feature.ChatOutput', fallback: 'Chat output', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.ChatOutput', hintFallback: 'Posts a summary chat card after crafting and gathering attempts.' }
  ];

  const visibleFeatures = $derived(featureDefinitions.filter(feature => hasFeatureKey(selectedSystem, feature.systemKey)));

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function hasFeatureKey(system, featureKey) {
    return Object.prototype.hasOwnProperty.call(system?.features || {}, featureKey);
  }

  function handleSubmit(event) {
    event.preventDefault();
    onSaveDetails(systemNameValue, systemDescriptionValue);
  }

  async function handleToggleFeature(feature) {
    const next = !(selectedSystem?.features?.[feature.systemKey] === true);
    await onToggleFeature(feature.storeKey, next);
  }
</script>

{#if selectedSystem}
  <div class="manager-environment-edit-view manager-system-edit-view" data-system-editor bind:this={pageRoot}>
    <SystemEditorTabs {activeTab} badges={tabBadges} onSelect={(tab) => { activeTab = tab; }} />

    <div class="manager-environment-workspace manager-system-workspace is-inspector-hidden">
      <div
        class="manager-environment-tab-panel manager-system-tab-panel"
        role="tabpanel"
        id={`system-panel-${activeTab}`}
        aria-labelledby={`system-tab-${activeTab}`}
      >
      {#if activeTab === 'settings'}
  <main class="manager-main manager-system-edit-main" aria-label={text('FABRICATE.Admin.Manager.SystemEdit.Title', 'System settings')}>
    <section class="manager-section-header">
      <div class="manager-heading">
        <p class="manager-kicker">{selectedSystem.name}</p>
        <h2 class="manager-title">{text('FABRICATE.Admin.Manager.SystemEdit.EditBaseSettings', 'Edit base settings')}</h2>
        <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.SystemEdit.EditBaseSettingsHint', 'Changes use the existing admin store persistence and confirmation flows.')}</p>
      </div>
    </section>

    <form class="manager-system-edit-form" onsubmit={handleSubmit}>
      <div class="visually-hidden" role="status" aria-live="polite" data-list-copy-announcement>{copyAnnouncement}</div>
      {#if systemBlocked}
        <div class="manager-environment-comp-callout manager-system-edit-blocker" role="note" data-system-edit-blocker>
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
          <div class="manager-system-edit-blocker-copy">
            <strong>{text('FABRICATE.Admin.Manager.SystemEdit.BlockerTitle', 'This system has a blocker')}</strong>
            <span>{text('FABRICATE.Admin.Manager.SystemEdit.BlockerBody', 'Players cannot see or use any of this system\'s recipes until the blocker is resolved. Open the system overview to review and fix it.')}</span>
          </div>
          <button type="button" class="manager-button manager-system-edit-blocker-link" data-system-edit-blocker-link onclick={() => { activeTab = 'validation'; onShowSystemOverview(); }}>
            {text('FABRICATE.Admin.Manager.SystemEdit.BlockerLink', 'Open system overview')}
          </button>
        </div>
      {/if}
      <section class="manager-edit-card">
        <div class="manager-edit-card-heading">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.SystemEdit.Identity', 'Identity')}</h3>
          <!--
            The heading is `justify-content: space-between`, so the chip must share a
            flex-end action group with the Save button to hug it (the house idiom every
            other dirty chip uses); a bare third child would float mid-heading.
          -->
          <div class="manager-action-group">
            {#if detailsDirty}
              <span class="manager-chip is-warning" data-system-details-dirty>{text('FABRICATE.Admin.Manager.SystemEdit.Dirty', 'Unsaved')}</span>
            {/if}
            <button type="submit" class="manager-button is-primary">
              <i class="fas fa-save" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.SystemEdit.SaveDetails', 'Save details')}</span>
            </button>
          </div>
        </div>
        <div class="manager-edit-grid">
          <label class="manager-field" for="manager-system-name">
            <span>{text('FABRICATE.Admin.SystemSettings.Name', 'Name')}</span>
            <input id="manager-system-name" type="text" bind:value={systemNameValue} />
          </label>
          <label class="manager-field is-wide" for="manager-system-description">
            <span>{text('FABRICATE.Admin.SystemSettings.Description', 'Description')}</span>
            <textarea id="manager-system-description" rows="4" bind:value={systemDescriptionValue}></textarea>
          </label>
        </div>
      </section>

      <section class="manager-edit-card" data-edit-control="advanced-options">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.SystemEdit.OptionalFeatures', 'Optional features')}</h3>
        <div class="manager-toggle-list">
          {#each visibleFeatures as feature (feature.systemKey)}
            <div class="manager-feature-tile" data-feature-key={feature.systemKey}>
              <span
                class={`manager-feature-tile-icon ${selectedSystem.features?.[feature.systemKey] === true ? 'is-on' : 'is-off'}`}
                aria-hidden="true"
              ><i class={feature.icon}></i></span>
              <div class="manager-feature-tile-body">
                <div class="manager-feature-tile-head">
                  <strong>{text(feature.labelKey, feature.fallback)}</strong>
                  <button
                    type="button"
                    class={`manager-status-toggle ${selectedSystem.features?.[feature.systemKey] === true ? 'is-on' : 'is-off'}`}
                    aria-pressed={selectedSystem.features?.[feature.systemKey] === true}
                    aria-label={text(feature.labelKey, feature.fallback)}
                    onclick={() => handleToggleFeature(feature)}
                  >
                    <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                    <span class="manager-status-toggle-label">{selectedSystem.features?.[feature.systemKey] === true
                      ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                      : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span>
                  </button>
                </div>
                <small>{text(feature.hintKey, feature.hintFallback)}</small>
              </div>
            </div>
          {/each}
          <div class="manager-feature-tile" data-feature-key="time">
            <span class={`manager-feature-tile-icon ${timeRequirementsEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true"><i class="fas fa-clock"></i></span>
            <div class="manager-feature-tile-body">
              <div class="manager-feature-tile-head">
                <strong>{text('FABRICATE.Admin.Manager.Feature.Time', 'Time requirements')}</strong>
                <button
                  type="button"
                  class={`manager-status-toggle ${timeRequirementsEnabled ? 'is-on' : 'is-off'}`}
                  aria-pressed={timeRequirementsEnabled}
                  aria-label={text('FABRICATE.Admin.Manager.Feature.Time', 'Time requirements')}
                  data-system-time-toggle
                  onclick={handleToggleTime}
                >
                  <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                  <span class="manager-status-toggle-label">{timeRequirementsEnabled
                    ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                    : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span>
                </button>
              </div>
              <small>{text('FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Time', 'Enables recipe and step duration (time requirement) authoring, and applies those durations when crafting.')}</small>
            </div>
          </div>
          <div class="manager-feature-tile" data-feature-key="currency">
            <span class={`manager-feature-tile-icon ${currencyEnabled ? 'is-on' : 'is-off'}`} aria-hidden="true"><i class="fas fa-coins"></i></span>
            <div class="manager-feature-tile-body">
              <div class="manager-feature-tile-head">
                <strong>{text('FABRICATE.Admin.Manager.Feature.Currency', 'Currency')}</strong>
                <button
                  type="button"
                  class={`manager-status-toggle ${currencyEnabled ? 'is-on' : 'is-off'}`}
                  aria-pressed={currencyEnabled}
                  aria-label={text('FABRICATE.Admin.Manager.Feature.Currency', 'Currency')}
                  data-system-currency-toggle
                  onclick={handleToggleCurrency}
                >
                  <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                  <span class="manager-status-toggle-label">{currencyEnabled
                    ? text('FABRICATE.Admin.Manager.SystemEdit.FeatureOn', 'On')
                    : text('FABRICATE.Admin.Manager.SystemEdit.FeatureOff', 'Off')}</span>
                </button>
              </div>
              <small>{text('FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Currency', 'Enables step currency requirements and the currency configuration for this system.')}</small>
            </div>
          </div>
        </div>
      </section>

      {#if gatheringEnabled}
        {@const modifiersCollapsed = isSectionCollapsed('modifiers')}
        <section class="manager-edit-card manager-character-modifier-card" class:is-section-collapsed={modifiersCollapsed} data-system-character-modifiers aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Title', 'Character modifiers')}>
          <header class="manager-character-modifier-card-header">
            <button
              type="button"
              class="manager-section-collapse-toggle"
              aria-expanded={!modifiersCollapsed}
              aria-controls="manager-section-body-modifiers"
              aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.ToggleSection', 'Collapse or expand this section')}
              data-section-collapse="modifiers"
              onclick={() => toggleSectionCollapsed('modifiers')}
            >
              <i class={`fa-solid ${modifiersCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'}`} aria-hidden="true"></i>
            </button>
            <div class="manager-character-modifier-card-header-copy">
              <h3 class="manager-card-title">
                <i class="fa-solid fa-user-gear" aria-hidden="true"></i>
                {text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Title', 'Character modifiers')}
              </h3>
              <p class="manager-muted">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Hint', 'Define reusable actor-driven modifiers for this system\'s d100 gathering rows and events.')}</p>
            </div>
            <div class="manager-character-modifier-card-header-actions">
              <button type="button" class="manager-button is-primary" onclick={handleAddCharacterModifier}>
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                {text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Add', 'Add character modifier')}
              </button>
              <button type="button"
                      class="manager-button"
                      disabled={!characterModifierPresetsSupported}
                      data-tooltip={!characterModifierPresetsSupported ? text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.SeedPresetsUnsupported', 'Preset seeding is only available for dnd5e or pf2e worlds.') : null}
                      onclick={onSeedCharacterModifierPresets}>
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                {text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.SeedPresets', 'Seed presets')}
              </button>
            </div>
          </header>
          {#if !modifiersCollapsed}
          <div id="manager-section-body-modifiers" class="manager-section-body">
          {#if characterModifierLibrary.length === 0}
            <p class="manager-muted manager-character-modifier-empty">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Empty', 'No character modifiers yet.')}</p>
          {:else}
            <ul class="manager-character-modifier-list">
              {#each characterModifierLibrary as entry (entry.id)}
                {@const modifierOpen = characterModifierEditingId === entry.id}
                {@const modifierExpression = characterModifierExpressionDisplay(entry)}
                <li class="manager-modifier-item" class:is-open={modifierOpen} data-system-character-modifier={entry.id}>
                  <div class="manager-modifier-header">
                    <button
                      type="button"
                      class="manager-modifier-summary"
                      aria-expanded={modifierOpen}
                      aria-controls={`character-modifier-body-${entry.id}`}
                      data-toggle-character-modifier
                      onclick={() => characterModifierEditingId = modifierOpen ? '' : entry.id}
                    >
                      <i class={`fa-solid ${modifierOpen ? 'fa-chevron-down' : 'fa-chevron-right'} manager-modifier-chevron`} aria-hidden="true"></i>
                      <span class="manager-modifier-icon"><i class={entry.icon || 'fa-solid fa-user'} aria-hidden="true"></i></span>
                      <span class="manager-modifier-label">{entry.label}</span>
                      {#if characterModifierIsRoll(entry)}
                        <span class="manager-chip manager-character-modifier-roll-tag">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RollTag', 'Roll')}</span>
                      {/if}
                      {#if modifierExpression}
                        <span class="manager-modifier-expression" data-character-modifier-expression>
                          <i class="fa-solid fa-arrow-right-long" aria-hidden="true"></i>
                          {modifierExpression}
                        </span>
                      {/if}
                    </button>
                    <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.CopyToPrerequisites', 'Copy to prerequisites')} data-tooltip={text('FABRICATE.Admin.Manager.ListErgonomics.CopyToPrerequisites', 'Copy to prerequisites')} data-copy-to-prerequisite={entry.id} onclick={() => handleCopyModifierToPrerequisite(entry)}>
                      <i class="fa-solid fa-user-shield" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Delete', 'Delete character modifier')} onclick={() => handleDeleteCharacterModifier(entry.id)}>
                      <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                  </div>

                  {#if modifierOpen}
                    <div class="manager-modifier-body manager-character-modifier-editor" id={`character-modifier-body-${entry.id}`}>
                      <div class="manager-modifier-name-row">
                        <div class="manager-field manager-modifier-icon-field">
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Icon', 'Icon')}</span>
                          <IconPicker
                            value={entry.icon || 'fa-solid fa-user'}
                            buttonTitle={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.ChangeIcon', 'Change icon')}
                            onChange={(iconClass) => onUpdateCharacterModifier(entry.id, { icon: iconClass })}
                          />
                        </div>
                        <label class="manager-field manager-modifier-label-field">
                          <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Label', 'Label')}</span>
                          <input type="text" value={entry.label} oninput={(event) => onUpdateCharacterModifier(entry.id, { label: event.currentTarget.value })} />
                        </label>
                      </div>
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression', 'Expression')}</span>
                        <input type="text" value={entry.expression} oninput={(event) => onUpdateCharacterModifier(entry.id, { expression: event.currentTarget.value })} />
                      </label>
                      <div class="manager-character-modifier-actions">
                        <button type="button" class="manager-button" onclick={() => characterModifierEditingId = ''}>{text('FABRICATE.Admin.Manager.Done', 'Done')}</button>
                        <button type="button" class="manager-button is-danger" onclick={() => handleDeleteCharacterModifier(entry.id)}>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Delete', 'Delete character modifier')}</button>
                      </div>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
          </div>
          {/if}
        </section>
      {/if}

      <CharacterPrerequisitesCard
        library={characterPrerequisiteLibrary}
        presetsSupported={characterPrerequisitePresetsSupported}
        onAdd={onAddCharacterPrerequisite}
        onUpdate={onUpdateCharacterPrerequisite}
        onDelete={onDeleteCharacterPrerequisite}
        onSeedPresets={onSeedCharacterPrerequisitePresets}
        collapsed={isSectionCollapsed('prerequisites')}
        onToggleCollapsed={() => toggleSectionCollapsed('prerequisites')}
        onCopyToModifier={gatheringEnabled ? handleCopyPrerequisiteToModifier : null}
        requestOpenId={prereqRequestOpenId}
        requestOpenNonce={prereqRequestOpenNonce}
      />

      {#if currencyEnabled}
      {@const currencyCollapsed = isSectionCollapsed('currency')}
      <section class="manager-edit-card manager-currency-unit-card" class:is-section-collapsed={currencyCollapsed} data-system-currency-units aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.Title', 'Currency units')}>
        <header class="manager-character-modifier-card-header">
          <button
            type="button"
            class="manager-section-collapse-toggle"
            aria-expanded={!currencyCollapsed}
            aria-controls="manager-section-body-currency"
            aria-label={text('FABRICATE.Admin.Manager.ListErgonomics.ToggleSection', 'Collapse or expand this section')}
            data-section-collapse="currency"
            onclick={() => toggleSectionCollapsed('currency')}
          >
            <i class={`fa-solid ${currencyCollapsed ? 'fa-chevron-right' : 'fa-chevron-down'}`} aria-hidden="true"></i>
          </button>
          <div class="manager-character-modifier-card-header-copy">
            <h3 class="manager-card-title">
              <i class="fa-solid fa-coins" aria-hidden="true"></i>
              {text('FABRICATE.Admin.Manager.CurrencyUnits.Title', 'Currency units')}
            </h3>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.CurrencyUnits.Hint', 'Define actor currency paths and denomination breakdowns for this crafting system.')}</p>
          </div>
          {#if !currencyUnitsReadOnly}
            <div class="manager-character-modifier-card-header-actions">
              <button type="button" class="manager-button is-primary" onclick={handleAddCurrencyUnit}>
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                {text('FABRICATE.Admin.Manager.CurrencyUnits.Add', 'Add currency unit')}
              </button>
              <button type="button"
                      class="manager-button"
                      disabled={!currencyPresetsSupported}
                      data-tooltip={!currencyPresetsSupported ? text('FABRICATE.Admin.Manager.CurrencyUnits.SeedPresetsUnsupported', 'Preset seeding is only available for dnd5e or pf2e worlds.') : null}
                      onclick={onSeedCurrencyPresets}>
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                {text('FABRICATE.Admin.Manager.CurrencyUnits.SeedPresets', 'Seed presets')}
              </button>
            </div>
          {/if}
        </header>

        {#if !currencyCollapsed}
        <div id="manager-section-body-currency" class="manager-section-body">
        <div class="manager-currency-strategy" data-system-currency-strategy>
          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategy', 'Spend strategy')}</span>
            <select
              value={currencySpendStrategy}
              data-system-currency-strategy-select
              onchange={(event) => onSetCurrencySpendStrategy(event.currentTarget.value)}
            >
              {#each CURRENCY_SPEND_STRATEGY_OPTIONS as option (option.value)}
                <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
              {/each}
            </select>
            <small data-system-currency-strategy-hint>{currencySpendStrategyHint()}</small>
          </label>

          {#if currencyShowProviderBranch}
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Provider', 'Provider')}</span>
              <select
                value={currencyProviderId}
                data-system-currency-provider-select
                onchange={(event) => onSetCurrencyProvider(event.currentTarget.value)}
              >
                {#each currencyProviderOptions as option (option.id)}
                  <option value={option.id}>{option.label}</option>
                {/each}
              </select>
              <small>{text('FABRICATE.Admin.Manager.CurrencyUnits.ProviderHint', 'A preconfigured adapter that reads and spends coins from the actor inventory.')}</small>
            </label>
          {:else if currencySpendStrategy === 'actorInventory'}
            <div class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Provider', 'Provider')}</span>
              <div class="manager-currency-subunit-warning manager-environment-comp-callout" role="note" data-system-currency-no-provider>
                <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.NoProviders', 'No preconfigured providers for this system — use the Macro strategy instead.')}</span>
              </div>
            </div>
          {:else if currencyMacroMode}
            <div class="manager-currency-macro-zones manager-currency-macro-row" data-system-currency-macros>
                {#each CURRENCY_MACRO_FIELDS as field (field.key)}
                  {@const macroDoc = currencyMacroDisplay(field.key)}
                  <div class="manager-field manager-currency-macro-field">
                    <span>{text(field.labelKey, field.labelFallback)}</span>
                    {#if macroDoc}
                      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                      <div
                        class="manager-environment-scene-linked"
                        data-system-currency-macro={field.key}
                        role="group"
                        aria-label={text(field.labelKey, field.labelFallback)}
                        title={text('FABRICATE.Admin.Manager.CurrencyUnits.MacroReplaceHint', 'Drop a macro to replace it, or right-click to unlink.')}
                        use:dragDrop={{ onDrop: (data) => handleCurrencyMacroDrop(field.key, data), activeClass: 'is-drop-active' }}
                        oncontextmenu={(event) => { event.preventDefault(); onClearCurrencyMacro(field.key); }}
                        onmousedown={(event) => { if (event.button === 2) { event.preventDefault(); onClearCurrencyMacro(field.key); } }}
                      >
                        {#if macroDoc.missing}
                          <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-triangle-exclamation"></i></span>
                          <span class="manager-environment-scene-name manager-muted" data-system-currency-macro-missing>{text('FABRICATE.Admin.Manager.CurrencyUnits.MacroMissing', 'Macro unresolved')}</span>
                        {:else}
                          {#if macroDoc.img}
                            <img class="manager-environment-scene-thumb" src={macroDoc.img} alt="" />
                          {:else}
                            <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-scroll"></i></span>
                          {/if}
                          <span class="manager-environment-scene-name">{macroDoc.name || macroDoc.uuid}</span>
                        {/if}
                        <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.MacroUnlink', 'Unlink macro')} title={text('FABRICATE.Admin.Manager.CurrencyUnits.MacroUnlink', 'Unlink macro')} onclick={(event) => { event.stopPropagation(); onClearCurrencyMacro(field.key); }}><i class="fas fa-link-slash" aria-hidden="true"></i></button>
                      </div>
                    {:else}
                      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                      <div
                        class="manager-component-source-drop-zone manager-currency-macro-drop-zone"
                        data-system-currency-macro-dropzone={field.key}
                        role="group"
                        aria-label={currencyMacroDropZoneLabel(field)}
                        use:dragDrop={{ onDrop: (data) => handleCurrencyMacroDrop(field.key, data), activeClass: 'is-drop-active' }}
                      >
                        <i class="fas fa-scroll" aria-hidden="true"></i>
                        <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.MacroDropHint', 'Drag a macro here to link it.')}</span>
                      </div>
                    {/if}
                    <small>{text(field.hintKey, field.hintFallback)}</small>
                  </div>
                {/each}
              </div>
          {/if}
        </div>

        {#if currencyUnitsReadOnly}
          <div
            class="manager-currency-subunit-warning manager-environment-comp-callout manager-currency-provider-managed-callout"
            role="note"
            data-system-currency-provider-managed
          >
            <i class="fa-solid fa-circle-info" aria-hidden="true"></i>
            <div class="manager-currency-provider-managed-copy">
              <strong>{text('FABRICATE.Admin.Manager.CurrencyUnits.ProviderManagedTitle', 'Provider-managed denominations')}</strong>
              <span>{currencyProviderManagedHint()}</span>
            </div>
          </div>
          {#if currencyUnits.length === 0}
            <p class="manager-muted manager-character-modifier-empty">{text('FABRICATE.Admin.Manager.CurrencyUnits.Empty', 'No currency units yet.')}</p>
          {:else}
            <ul class="manager-character-modifier-list manager-currency-provider-managed-list manager-currency-provider-managed-grid">
              {#each currencyUnits as unit (unit.id)}
                <li class="manager-character-modifier-row" data-system-currency-unit={unit.id}>
                  <div class="manager-currency-provider-managed-summary">
                    <span class="manager-character-modifier-icon"><i class={unit.icon || 'fa-solid fa-coins'} aria-hidden="true"></i></span>
                    <div class="manager-currency-readonly-fields">
                      <div class="manager-currency-readonly-field">
                        <span class="manager-currency-readonly-label">{text('FABRICATE.Admin.Manager.CurrencyUnits.Label', 'Label')}</span>
                        <span class="manager-currency-readonly-value" data-system-currency-readonly-label>{unit.label || unit.id}</span>
                      </div>
                      <div class="manager-currency-readonly-field">
                        <span class="manager-currency-readonly-label">{text('FABRICATE.Admin.Manager.CurrencyUnits.Abbreviation', 'Abbreviation')}</span>
                        <span class="manager-currency-readonly-value" data-system-currency-abbreviation>{unit.abbreviation || '—'}</span>
                      </div>
                      <div class="manager-currency-readonly-field">
                        <span class="manager-currency-readonly-label">{text('FABRICATE.Admin.Manager.CurrencyUnits.Denomination', 'Coin denomination')}</span>
                        <span class="manager-currency-readonly-value" data-system-currency-denomination>{unit.denomination || unit.id}</span>
                      </div>
                    </div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {:else if currencyUnits.length === 0}
          <p class="manager-muted manager-character-modifier-empty">{text('FABRICATE.Admin.Manager.CurrencyUnits.Empty', 'No currency units yet.')}</p>
        {:else}
          <ul class="manager-character-modifier-list">
            {#each currencyUnits as unit (unit.id)}
              {@const expanded = currencyExpandedUnitId === unit.id}
              {@const subUnitOptions = currencyUnitSubUnitOptions(unit.id)}
              <li class="manager-character-modifier-row" data-system-currency-unit={unit.id}>
                {#if expanded}
                  <div class="manager-character-modifier-editor">
                    <div class="manager-edit-grid manager-currency-edit-grid">
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Label', 'Label')}</span>
                        <input type="text" value={unit.label} oninput={(event) => onUpdateCurrencyUnit(unit.id, { label: event.currentTarget.value })} />
                      </label>
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Abbreviation', 'Abbreviation')}</span>
                        <input type="text" value={unit.abbreviation} oninput={(event) => onUpdateCurrencyUnit(unit.id, { abbreviation: event.currentTarget.value })} />
                      </label>
                      <div class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Icon', 'Icon')}</span>
                        <IconPicker
                          value={unit.icon || 'fa-solid fa-coins'}
                          buttonTitle={text('FABRICATE.Admin.Manager.CurrencyUnits.ChangeIcon', 'Change icon')}
                          onChange={(iconClass) => onUpdateCurrencyUnit(unit.id, { icon: iconClass })}
                        />
                      </div>
                    </div>

                    {#if currencyMacroMode}
                      <small class="manager-currency-macro-note" role="note" data-system-currency-unit-macro-note>{text('FABRICATE.Admin.Manager.CurrencyUnits.MacroConversionHint', 'Conversion between this unit and others is handled by your configured currency macros, matched by abbreviation.')}</small>
                    {:else}
                      <div class="manager-edit-grid manager-currency-detail-grid">
                        <label class="manager-field">
                          <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.ActorPath', 'Actor data path')}</span>
                          <input type="text" value={unit.actorPath} placeholder="system.currency.gp" oninput={(event) => onUpdateCurrencyUnit(unit.id, { actorPath: event.currentTarget.value })} />
                        </label>
                        {#if subUnitOptions.length > 0}
                          <div class="manager-currency-subunit-builder">
                            <label class="manager-field">
                              <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit', 'Add sub-unit')}</span>
                              <select
                                value={currencySelectedSubUnit(unit.id)}
                                onchange={(event) => updateCurrencySubUnitSelection(unit.id, event.currentTarget.value)}
                              >
                                {#each subUnitOptions as option (option.id)}
                                  <option value={option.id}>{option.label}{option.abbreviation ? ` (${option.abbreviation})` : ''}</option>
                                {/each}
                              </select>
                            </label>
                            <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit', 'Add sub-unit')} onclick={() => handleAddCurrencySubUnit(unit.id)}>
                              <i class="fa-solid fa-plus" aria-hidden="true"></i>
                            </button>
                          </div>
                        {:else}
                          <div class="manager-field">
                            <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit', 'Add sub-unit')}</span>
                            <div class="manager-currency-subunit-warning" role="note">
                              <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                              {#if currencyUnits.length <= 1}
                                <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.NoOtherUnits', 'Add another currency unit before defining a breakdown.')}</span>
                              {:else}
                                <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.NoEligibleSubUnits', 'No eligible sub-units — every other unit already breaks down into this one.')}</span>
                              {/if}
                            </div>
                          </div>
                        {/if}
                      </div>

                      <div class="manager-currency-subunit-section">
                        <p class="manager-card-title manager-currency-subunit-heading">{text('FABRICATE.Admin.Manager.CurrencyUnits.SubUnits', 'Sub-units')}</p>
                        {#if (unit.contains || []).length > 0}
                          <div class="manager-availability-pill-row" aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.SubUnits', 'Sub-units')}>
                            {#each unit.contains as contained (contained.unitId)}
                              <span class="manager-availability-pill is-currency" data-system-currency-subunit={contained.unitId}>
                                <i class={currencyUnitIcon(contained.unitId)} aria-hidden="true"></i>
                                <span>{currencyUnitLabel(contained.unitId)}</span>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  class="manager-availability-pill-amount"
                                  value={contained.amount}
                                  aria-label={`${currencyUnitLabel(contained.unitId)} ${text('FABRICATE.Admin.Manager.CurrencyUnits.SubUnitAmount', 'Sub-unit amount').toLowerCase()}`}
                                  oninput={(event) => onUpdateCurrencySubUnit(unit.id, contained.unitId, event.currentTarget.value)}
                                />
                                <button type="button" class="manager-availability-remove" aria-label={`${text('FABRICATE.Admin.Manager.CurrencyUnits.RemoveSubUnit', 'Remove sub-unit')} (${currencyUnitLabel(contained.unitId)})`} onclick={() => onDeleteCurrencySubUnit(unit.id, contained.unitId)}>
                                  <i class="fas fa-xmark" aria-hidden="true"></i>
                                </button>
                              </span>
                            {/each}
                          </div>
                        {:else}
                          <p class="manager-muted">{text('FABRICATE.Admin.Manager.CurrencyUnits.NoSubUnits', 'This unit is a base denomination.')}</p>
                        {/if}
                      </div>
                    {/if}

                    <div class="manager-character-modifier-actions">
                      <button type="button" class="manager-button" onclick={() => currencyExpandedUnitId = ''}>{text('FABRICATE.Admin.Manager.Done', 'Done')}</button>
                      <button type="button" class="manager-button is-danger" onclick={() => handleDeleteCurrencyUnit(unit.id)}>{text('FABRICATE.Admin.Manager.CurrencyUnits.Delete', 'Delete currency unit')}</button>
                    </div>
                  </div>
                {:else}
                  <div class="manager-character-modifier-summary">
                    <span class="manager-character-modifier-icon"><i class={unit.icon || 'fa-solid fa-coins'} aria-hidden="true"></i></span>
                    <span class="manager-character-modifier-label">{unit.label || unit.id}</span>
                    <span class="manager-chip">{(unit.contains || []).length} {text('FABRICATE.Admin.Manager.CurrencyUnits.SubUnitCount', 'sub-units')}</span>
                    <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.Edit', 'Edit currency unit')} onclick={() => currencyExpandedUnitId = unit.id}>
                      <i class="fa-solid fa-pen" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.Delete', 'Delete currency unit')} onclick={() => handleDeleteCurrencyUnit(unit.id)}>
                      <i class="fa-solid fa-trash" aria-hidden="true"></i>
                    </button>
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        </div>
        {/if}
      </section>
      {/if}
    </form>
  </main>
      {:else if activeTab === 'validation'}
        <SystemOverviewView report={validationReport} {onSelectIssue} />
      {/if}
      </div>
    </div>
  </div>
{/if}
