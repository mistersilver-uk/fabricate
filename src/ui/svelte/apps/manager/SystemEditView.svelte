<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
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
    onAddCurrencyUnit = async () => null,
    onUpdateCurrencyUnit = async () => {},
    onDeleteCurrencyUnit = async () => {},
    onAddCurrencySubUnit = async () => {},
    onUpdateCurrencySubUnit = async () => {},
    onDeleteCurrencySubUnit = async () => {},
    onSeedCurrencyPresets = async () => {}
  } = $props();

  let characterModifierEditingId = $state('');
  let currencyExpandedUnitId = $state('');
  let currencySubUnitSelections = $state({});
  const ROLL_EXPRESSION_PATTERN_UI = /\bd\d|[*/()]/;

  const gatheringEnabled = $derived(selectedSystem?.features?.gathering === true);

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
        </header>

        {#if currencyUnits.length === 0}
          <p class="manager-muted manager-character-modifier-empty">{text('FABRICATE.Admin.Manager.CurrencyUnits.Empty', 'No currency units yet.')}</p>
        {:else}
          <ul class="manager-character-modifier-list">
            {#each currencyUnits as unit (unit.id)}
              {@const expanded = currencyExpandedUnitId === unit.id}
              {@const subUnitOptions = currencyUnitSubUnitOptions(unit.id)}
              <li class="manager-character-modifier-row" data-system-currency-unit={unit.id}>
                {#if expanded}
                  <div class="manager-character-modifier-editor">
                    <div class="manager-edit-grid">
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
                      <label class="manager-field is-wide">
                        <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.ActorPath', 'Actor data path')}</span>
                        <input type="text" value={unit.actorPath} placeholder="system.currency.gp" oninput={(event) => onUpdateCurrencyUnit(unit.id, { actorPath: event.currentTarget.value })} />
                      </label>
                    </div>

                    <div class="manager-currency-subunit-builder">
                      <label class="manager-field">
                        <span>{text('FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit', 'Add sub-unit')}</span>
                        <select
                          value={currencySelectedSubUnit(unit.id)}
                          disabled={subUnitOptions.length === 0}
                          onchange={(event) => updateCurrencySubUnitSelection(unit.id, event.currentTarget.value)}
                        >
                          {#each subUnitOptions as option (option.id)}
                            <option value={option.id}>{option.label} ({option.abbreviation})</option>
                          {/each}
                        </select>
                      </label>
                      <button type="button" class="manager-icon-button" disabled={subUnitOptions.length === 0} aria-label={text('FABRICATE.Admin.Manager.CurrencyUnits.AddSubUnit', 'Add sub-unit')} onclick={() => handleAddCurrencySubUnit(unit.id)}>
                        <i class="fa-solid fa-plus" aria-hidden="true"></i>
                      </button>
                    </div>

                    {#if subUnitOptions.length === 0}
                      {#if currencyUnits.length <= 1}
                        <span class="manager-availability-empty">{text('FABRICATE.Admin.Manager.CurrencyUnits.NoOtherUnits', 'Add another currency unit before defining a breakdown.')}</span>
                      {:else}
                        <span class="manager-availability-empty">{text('FABRICATE.Admin.Manager.CurrencyUnits.NoEligibleSubUnits', 'No eligible sub-units — every other unit already breaks down into this one.')}</span>
                      {/if}
                    {/if}

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
