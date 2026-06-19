<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dragDrop } from '../../actions/dragDrop.js';
  import { resolveDropData } from '../../util/dropUtils.js';
  import IconPicker from '../../components/IconPicker.svelte';

  let {
    selectedSystem = null,
    onSaveDetails = () => {},
    onSetResolutionMode = async () => true,
    onToggleFeature = async () => true,
    characterModifierLibrary = [],
    characterModifierPresetsSupported = false,
    onAddCharacterModifier = async () => null,
    onUpdateCharacterModifier = async () => {},
    onDeleteCharacterModifier = async () => {},
    onSeedCharacterModifierPresets = async () => {},
    currencyUnits = [],
    currencyPresetsSupported = false,
    currencySpendStrategy = 'actorProperty',
    currencyInventoryMode = 'provider',
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
    onSetCurrencyInventoryMode = async () => {},
    onSetCurrencyProvider = async () => {},
    onSetCurrencyMacro = async () => {},
    onClearCurrencyMacro = async () => {}
  } = $props();

  const CURRENCY_SPEND_STRATEGY_OPTIONS = [
    { value: 'actorProperty', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorProperty', fallback: 'Actor data path' },
    { value: 'actorInventory', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyActorInventory', fallback: 'Actor inventory' }
  ];
  const CURRENCY_INVENTORY_MODE_OPTIONS = [
    { value: 'provider', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.InventoryModeProvider', fallback: 'Preconfigured provider' },
    { value: 'macro', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.InventoryModeMacro', fallback: 'Custom macros' }
  ];
  const CURRENCY_MACRO_FIELDS = [
    { key: 'canAfford', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroCanAfford', labelFallback: 'Can afford macro', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroCanAffordHint', hintFallback: 'Runs to gate the craft; return true (or { canAfford: true }) when the actor can pay.' },
    { key: 'increment', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroIncrement', labelFallback: 'Increment macro', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroIncrementHint', hintFallback: 'Reserved for a future refund flow — configured now but not yet invoked.' },
    { key: 'decrement', labelKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDecrement', labelFallback: 'Decrement macro', hintKey: 'FABRICATE.Admin.Manager.CurrencyUnits.MacroDecrementHint', hintFallback: 'Runs after a successful craft to spend the currency cost.' }
  ];

  // Resolve each configured macro UUID to a { name, img, missing } display, mirroring the
  // RecipeItemInspector/EnvironmentSummaryInspector linked-document pattern.
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

  const gatheringEnabled = $derived(selectedSystem?.features?.gathering === true);

  // A system with no registered provider must not be offered (or steered into) provider mode:
  // entering it resolves an empty provider id whose canonical ladder is empty. The store now
  // guards against wiping units, but the editor should not surface the dead option either. Hide
  // the `provider` choice when there are no providers so the only inventory source is `macro`.
  const currencyHasProviders = $derived(currencyProviderOptions.length > 0);
  const currencyInventoryModeOptions = $derived(
    currencyHasProviders
      ? CURRENCY_INVENTORY_MODE_OPTIONS
      : CURRENCY_INVENTORY_MODE_OPTIONS.filter((option) => option.value !== 'provider')
  );
  // The mode the select renders. When the system has no providers, present `macro` regardless of any
  // legacy `provider` value persisted in config so the control never shows an unselectable option.
  const currencyInventoryModeSelected = $derived(
    !currencyHasProviders && currencyInventoryMode === 'provider' ? 'macro' : currencyInventoryMode
  );

  // The effective inventory branch the GM is actually operating in. A no-provider system with a
  // stale `provider` value behaves as macro mode everywhere (display, read-only, sub-unit collapse).
  const currencyEffectiveInventoryMode = $derived(currencyInventoryModeSelected);

  // No-provider systems never show the provider branch — even if config still carries
  // inventoryMode === 'provider' from legacy state — so the GM sees the macro fields instead.
  const currencyShowProviderBranch = $derived(
    currencyEffectiveInventoryMode === 'provider' && currencyHasProviders
  );

  // In provider inventory mode the selected provider owns the denomination ladder, so currency
  // units are provider-managed and read-only — editing them would desync the engine's
  // affordability/baseValue math from the system's real coin values. A no-provider system is never
  // read-only because its units stay GM-owned.
  const currencyUnitsReadOnly = $derived(
    currencySpendStrategy === 'actorInventory' && currencyShowProviderBranch
  );

  // In macro inventory mode the configured macros own all conversion via unit abbreviations, so a
  // unit's `contains` breakdown is unused. The per-unit editor collapses to label/abbreviation/icon
  // and the whole sub-unit section (heading, add control, chips, warnings) is removed.
  // Sub-units only drive the engine in actorProperty mode (their `contains` feeds base-value and
  // change-making). In macro mode the configured macros own conversion via unit abbreviations, so
  // the per-unit editor collapses to label/abbreviation/icon and the whole sub-unit section is gone.
  const currencyMacroMode = $derived(
    currencySpendStrategy === 'actorInventory' && currencyEffectiveInventoryMode === 'macro'
  );

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

  function characterModifierIsRoll(entry) {
    return Boolean(entry?.expression) && ROLL_EXPRESSION_PATTERN_UI.test(entry.expression);
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

  function currencyUnitCanReach(startUnitId, targetUnitId, seen = new Set()) {
    if (!startUnitId || seen.has(startUnitId)) return false;
    if (startUnitId === targetUnitId) return true;
    seen.add(startUnitId);
    const unit = currencyUnits.find(entry => entry.id === startUnitId);
    return (unit?.contains || []).some(entry => currencyUnitCanReach(entry.unitId, targetUnitId, seen));
  }

  function currencyCanAddSubUnit(parentUnitId, subUnitId) {
    if (!parentUnitId || !subUnitId || parentUnitId === subUnitId) return false;
    const parent = currencyUnits.find(entry => entry.id === parentUnitId);
    const child = currencyUnits.find(entry => entry.id === subUnitId);
    if (!parent || !child) return false;
    if ((parent.contains || []).some(entry => entry.unitId === subUnitId)) return false;
    return !currencyUnitCanReach(subUnitId, parentUnitId);
  }

  function currencyUnitSubUnitOptions(unitId) {
    return currencyUnits
      .filter(entry => currencyCanAddSubUnit(unitId, entry.id))
      .map(entry => ({ id: entry.id, label: entry.label || entry.id, abbreviation: entry.abbreviation || entry.id }));
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
  let systemResolutionModeValue = $state('simple');

  $effect(() => {
    systemNameValue = selectedSystem?.name ?? '';
    systemDescriptionValue = selectedSystem?.description ?? '';
    systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
  });

  const featureDefinitions = [
    { systemKey: 'gathering', storeKey: 'gathering', labelKey: 'FABRICATE.Admin.Manager.Feature.Gathering', fallback: 'Gathering', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Gathering', hintFallback: 'Shows gathering environments and player gathering flows for this system.' },
    { systemKey: 'essences', storeKey: 'essences', labelKey: 'FABRICATE.Admin.Manager.Feature.Essences', fallback: 'Essences', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.Essences', hintFallback: 'Enables essence definitions and essence requirements.' },
    { systemKey: 'multiStepRecipes', storeKey: 'multiStepRecipes', labelKey: 'FABRICATE.Admin.Manager.Feature.MultiStepRecipes', fallback: 'Multi-step recipes', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.MultiStepRecipes', hintFallback: 'Enables explicit recipe steps and step-level requirements.' },
    { systemKey: 'propertyMacros', storeKey: 'propertyMacros', labelKey: 'FABRICATE.Admin.Manager.Feature.PropertyMacros', fallback: 'Property macros', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.PropertyMacros', hintFallback: 'Allows macro-backed component property behavior.' },
    { systemKey: 'effectTransfer', storeKey: 'effectTransfer', labelKey: 'FABRICATE.Admin.Manager.Feature.EffectTransfer', fallback: 'Effect transfer', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.EffectTransfer', hintFallback: 'Allows crafted results to inherit effects from source components.' },
    { systemKey: 'chatOutput', storeKey: 'chatOutput', labelKey: 'FABRICATE.Admin.Manager.Feature.ChatOutput', fallback: 'Chat output', hintKey: 'FABRICATE.Admin.Manager.SystemEdit.FeatureHint.ChatOutput', hintFallback: 'Posts a summary chat card after crafting and gathering attempts.' }
  ];

  const resolutionModeOptions = [
    { value: 'simple', labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionSimple', fallback: 'Simple' },
    { value: 'mapped', labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionMapped', fallback: 'Routed by ingredients' },
    { value: 'tiered', labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionTiered', fallback: 'Routed by check outcome' },
    { value: 'progressive', labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionProgressive', fallback: 'Progressive' },
    { value: 'alchemy', labelKey: 'FABRICATE.Admin.SystemSettings.ResolutionAlchemy', fallback: 'Alchemy' }
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

  async function handleResolutionModeChange(event) {
    const nextMode = event.currentTarget.value || 'simple';
    systemResolutionModeValue = nextMode;
    const didApply = await onSetResolutionMode(nextMode);
    if (didApply === false) {
      systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
    }
  }

  async function handleToggleFeature(feature) {
    const next = !(selectedSystem?.features?.[feature.systemKey] === true);
    await onToggleFeature(feature.storeKey, next);
  }
</script>

{#if selectedSystem}
  <main class="manager-main manager-system-edit-main" aria-label={text('FABRICATE.Admin.Manager.SystemEdit.Title', 'System settings')}>
    <section class="manager-section-header">
      <div class="manager-heading">
        <p class="manager-kicker">{selectedSystem.name}</p>
        <h2 class="manager-title">{text('FABRICATE.Admin.Manager.SystemEdit.EditBaseSettings', 'Edit base settings')}</h2>
        <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.SystemEdit.EditBaseSettingsHint', 'Changes use the existing admin store persistence and confirmation flows.')}</p>
      </div>
    </section>

    <form class="manager-system-edit-form" onsubmit={handleSubmit}>
      <section class="manager-edit-card">
        <div class="manager-edit-card-heading">
          <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.SystemEdit.Identity', 'Identity')}</h3>
          <button type="submit" class="manager-button is-primary">
            <i class="fas fa-save" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.SystemEdit.SaveDetails', 'Save details')}</span>
          </button>
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
          <label class="manager-field" for="manager-system-resolution-mode">
            <span>{text('FABRICATE.Admin.SystemSettings.ResolutionMode', 'Resolution mode')}</span>
            <select id="manager-system-resolution-mode" value={systemResolutionModeValue} onchange={handleResolutionModeChange}>
              {#each resolutionModeOptions as option (option.value)}
                <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
              {/each}
            </select>
            <small>{text('FABRICATE.Admin.Manager.SystemEdit.ResolutionModeHint', 'Changing resolution mode uses the current destructive confirmation and cleanup behavior.')}</small>
          </label>
        </div>
      </section>

      <section class="manager-edit-card" data-edit-control="advanced-options">
        <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.SystemEdit.OptionalFeatures', 'Optional features')}</h3>
        {#if visibleFeatures.length > 0}
          <div class="manager-toggle-list">
            {#each visibleFeatures as feature (feature.systemKey)}
              <div class="manager-feature-tile" data-feature-key={feature.systemKey}>
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
            {/each}
          </div>
        {:else}
          <p class="manager-muted">{text('FABRICATE.Admin.Manager.SystemEdit.NoFeatureToggles', 'No optional feature toggles are present on this system.')}</p>
        {/if}
      </section>

      {#if gatheringEnabled}
        <section class="manager-edit-card manager-character-modifier-card" data-system-character-modifiers aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Title', 'Character modifiers')}>
          <header class="manager-character-modifier-card-header">
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
          {#if characterModifierLibrary.length === 0}
            <p class="manager-muted manager-character-modifier-empty">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Empty', 'No character modifiers yet.')}</p>
          {:else}
            <ul class="manager-character-modifier-list">
              {#each characterModifierLibrary as entry (entry.id)}
                <li class="manager-character-modifier-row" data-system-character-modifier={entry.id}>
                  {#if characterModifierEditingId === entry.id}
                    <div class="manager-character-modifier-editor">
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Label', 'Label')}</span>
                        <input type="text" value={entry.label} oninput={(event) => onUpdateCharacterModifier(entry.id, { label: event.currentTarget.value })} />
                      </label>
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Icon', 'Icon')}</span>
                        <input type="text" value={entry.icon} oninput={(event) => onUpdateCharacterModifier(entry.id, { icon: event.currentTarget.value })} />
                      </label>
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Expression', 'Expression')}</span>
                        <input type="text" value={entry.expression} oninput={(event) => onUpdateCharacterModifier(entry.id, { expression: event.currentTarget.value })} />
                      </label>
                      <div class="manager-character-modifier-actions">
                        <button type="button" class="manager-button" onclick={() => characterModifierEditingId = ''}>{text('FABRICATE.Admin.Manager.Done', 'Done')}</button>
                        <button type="button" class="manager-button is-danger" onclick={() => handleDeleteCharacterModifier(entry.id)}>{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Delete', 'Delete character modifier')}</button>
                      </div>
                    </div>
                  {:else}
                    <div class="manager-character-modifier-summary">
                      <span class="manager-character-modifier-icon"><i class={entry.icon || 'fa-solid fa-user'} aria-hidden="true"></i></span>
                      <span class="manager-character-modifier-label">{entry.label}</span>
                      {#if characterModifierIsRoll(entry)}
                        <span class="manager-chip manager-character-modifier-roll-tag">{text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.RollTag', 'Roll')}</span>
                      {/if}
                      <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Edit', 'Edit character modifier')} onclick={() => characterModifierEditingId = entry.id}>
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                      </button>
                      <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Gathering.CharacterModifiers.Delete', 'Delete character modifier')} onclick={() => handleDeleteCharacterModifier(entry.id)}>
                        <i class="fa-solid fa-trash" aria-hidden="true"></i>
                      </button>
                    </div>
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}

      <section class="manager-edit-card manager-currency-unit-card" data-system-currency-units aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.Title', 'Currency units')}>
        <header class="manager-character-modifier-card-header">
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
            <small>{text('FABRICATE.Admin.Manager.CurrencyUnits.SpendStrategyHint', 'Choose how this system reads and spends actor currency.')}</small>
          </label>

          {#if currencySpendStrategy === 'actorInventory'}
            <label class="manager-field">
              <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.InventoryMode', 'Inventory source')}</span>
              <select
                value={currencyInventoryModeSelected}
                data-system-currency-inventory-mode-select
                onchange={(event) => onSetCurrencyInventoryMode(event.currentTarget.value)}
              >
                {#each currencyInventoryModeOptions as option (option.value)}
                  <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
                {/each}
              </select>
              <small>{text('FABRICATE.Admin.Manager.CurrencyUnits.InventoryModeHint', 'Use a preconfigured provider for your system, or drive currency with custom macros.')}</small>
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
            {:else}
              {#if !currencyHasProviders && currencyInventoryMode === 'provider'}
                <div class="manager-field">
                  <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.Provider', 'Provider')}</span>
                  <div class="manager-currency-subunit-warning manager-environment-comp-callout" role="note" data-system-currency-no-provider>
                    <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
                    <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.NoProviders', 'No preconfigured providers for this system — use custom macros instead.')}</span>
                  </div>
                </div>
              {/if}
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
                        class="manager-component-source-drop-zone"
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
            <ul class="manager-character-modifier-list manager-currency-provider-managed-list">
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
                                  <option value={option.id}>{option.label} ({option.abbreviation})</option>
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
      </section>
    </form>
  </main>
{/if}
