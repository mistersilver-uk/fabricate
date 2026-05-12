<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ProviderExpressionInput from '../../components/ProviderExpressionInput.svelte';

  let {
    selectedSystem = null,
    onSaveDetails = () => {},
    onSetResolutionMode = async () => true,
    onToggleAdvancedOptions = async () => true,
    onToggleFeature = async () => true,
    characterModifierLibrary = [],
    characterModifierPresetsSupported = false,
    onAddCharacterModifier = async () => null,
    onUpdateCharacterModifier = async () => {},
    onDeleteCharacterModifier = async () => {},
    onSeedCharacterModifierPresets = async () => {}
  } = $props();

  let characterModifierEditingId = $state('');
  const ROLL_EXPRESSION_PATTERN_UI = /\bd\d|[*/()]/;

  const gatheringEnabled = $derived(selectedSystem?.features?.gathering === true);

  function characterModifierIsRoll(entry) {
    return Boolean(entry?.expression) && ROLL_EXPRESSION_PATTERN_UI.test(entry.expression);
  }

  function characterModifierProviderLabel(provider) {
    if (provider === 'pf2e') return text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.ProviderPf2e', 'Pathfinder 2e');
    if (provider === 'macro') return text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.ProviderMacro', 'Macro');
    return text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.ProviderDnd5e', 'D&D 5e');
  }

  async function handleAddCharacterModifier() {
    const entry = await onAddCharacterModifier();
    if (entry?.id) characterModifierEditingId = entry.id;
  }

  async function handleDeleteCharacterModifier(modifierId) {
    await onDeleteCharacterModifier(modifierId);
    if (characterModifierEditingId === modifierId) characterModifierEditingId = '';
  }

  let systemNameValue = $state('');
  let systemDescriptionValue = $state('');
  let systemResolutionModeValue = $state('simple');

  $effect(() => {
    systemNameValue = selectedSystem?.name ?? '';
    systemDescriptionValue = selectedSystem?.description ?? '';
    systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
  });

  const featureDefinitions = [
    { systemKey: 'gathering', storeKey: 'gathering', labelKey: 'FABRICATE.Admin.ManagerV2.Feature.Gathering', fallback: 'Gathering', hintKey: 'FABRICATE.Admin.ManagerV2.SystemEdit.FeatureHint.Gathering', hintFallback: 'Shows gathering environments and player gathering flows for this system.' },
    { systemKey: 'essences', storeKey: 'essences', labelKey: 'FABRICATE.Admin.ManagerV2.Feature.Essences', fallback: 'Essences', hintKey: 'FABRICATE.Admin.ManagerV2.SystemEdit.FeatureHint.Essences', hintFallback: 'Enables essence definitions and essence requirements.' },
    { systemKey: 'multiStepRecipes', storeKey: 'multiStepRecipes', labelKey: 'FABRICATE.Admin.ManagerV2.Feature.MultiStepRecipes', fallback: 'Multi-step recipes', hintKey: 'FABRICATE.Admin.ManagerV2.SystemEdit.FeatureHint.MultiStepRecipes', hintFallback: 'Enables explicit recipe steps and step-level requirements.' },
    { systemKey: 'propertyMacros', storeKey: 'propertyMacros', labelKey: 'FABRICATE.Admin.ManagerV2.Feature.PropertyMacros', fallback: 'Property macros', hintKey: 'FABRICATE.Admin.ManagerV2.SystemEdit.FeatureHint.PropertyMacros', hintFallback: 'Allows macro-backed component property behavior.' },
    { systemKey: 'effectTransfer', storeKey: 'effectTransfer', labelKey: 'FABRICATE.Admin.ManagerV2.Feature.EffectTransfer', fallback: 'Effect transfer', hintKey: 'FABRICATE.Admin.ManagerV2.SystemEdit.FeatureHint.EffectTransfer', hintFallback: 'Allows crafted results to inherit effects from source components.' }
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
    onSaveDetails(
      systemNameValue,
      systemDescriptionValue,
      selectedSystem?.advancedOptionsEnabled ?? true
    );
  }

  async function handleResolutionModeChange(event) {
    const nextMode = event.currentTarget.value || 'simple';
    systemResolutionModeValue = nextMode;
    const didApply = await onSetResolutionMode(nextMode);
    if (didApply === false) {
      systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
    }
  }

  async function handleToggleAdvancedOptions(event) {
    const checkbox = event.currentTarget;
    const didApply = await onToggleAdvancedOptions(checkbox.checked);
    if (didApply === false) {
      checkbox.checked = selectedSystem?.advancedOptionsEnabled !== false;
    }
  }

  async function handleToggleFeature(feature, event) {
    const checkbox = event.currentTarget;
    const didApply = await onToggleFeature(feature.storeKey, checkbox.checked);
    if (didApply === false) {
      checkbox.checked = selectedSystem?.features?.[feature.systemKey] === true;
    }
  }
</script>

{#if selectedSystem}
  <main class="manager-v2-main manager-v2-system-edit-main" aria-label={text('FABRICATE.Admin.ManagerV2.SystemEdit.Title', 'System settings')}>
    <section class="manager-v2-section-header">
      <div class="manager-v2-heading">
        <p class="manager-v2-kicker">{selectedSystem.name}</p>
        <h2 class="manager-v2-title">{text('FABRICATE.Admin.ManagerV2.SystemEdit.EditBaseSettings', 'Edit base settings')}</h2>
        <p class="manager-v2-subtitle">{text('FABRICATE.Admin.ManagerV2.SystemEdit.EditBaseSettingsHint', 'Changes use the existing admin store persistence and confirmation flows.')}</p>
      </div>
    </section>

    <form class="manager-v2-system-edit-form" onsubmit={handleSubmit}>
      <section class="manager-v2-edit-card">
        <div class="manager-v2-edit-card-heading">
          <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.SystemEdit.Identity', 'Identity')}</h3>
          <button type="submit" class="manager-v2-button is-primary">
            <i class="fas fa-save" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.ManagerV2.SystemEdit.SaveDetails', 'Save details')}</span>
          </button>
        </div>
        <div class="manager-v2-edit-grid">
          <label class="manager-v2-field" for="manager-v2-system-name">
            <span>{text('FABRICATE.Admin.SystemSettings.Name', 'Name')}</span>
            <input id="manager-v2-system-name" type="text" bind:value={systemNameValue} />
          </label>
          <label class="manager-v2-field is-wide" for="manager-v2-system-description">
            <span>{text('FABRICATE.Admin.SystemSettings.Description', 'Description')}</span>
            <textarea id="manager-v2-system-description" rows="4" bind:value={systemDescriptionValue}></textarea>
          </label>
          <label class="manager-v2-field" for="manager-v2-system-resolution-mode">
            <span>{text('FABRICATE.Admin.SystemSettings.ResolutionMode', 'Resolution mode')}</span>
            <select id="manager-v2-system-resolution-mode" value={systemResolutionModeValue} onchange={handleResolutionModeChange}>
              {#each resolutionModeOptions as option}
                <option value={option.value}>{text(option.labelKey, option.fallback)}</option>
              {/each}
            </select>
            <small>{text('FABRICATE.Admin.ManagerV2.SystemEdit.ResolutionModeHint', 'Changing resolution mode uses the current destructive confirmation and cleanup behavior.')}</small>
          </label>
        </div>
      </section>

      <section class="manager-v2-edit-card">
        <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.SystemEdit.Visibility', 'Advanced visibility')}</h3>
        <label class="manager-v2-toggle-row" data-edit-control="advanced-options">
          <input type="checkbox" checked={selectedSystem.advancedOptionsEnabled !== false} onchange={handleToggleAdvancedOptions} />
          <span class="manager-v2-toggle-copy">
            <strong>{text('FABRICATE.Admin.SystemSettings.AdvancedOptions', 'Show advanced options')}</strong>
            <small>{text('FABRICATE.Admin.SystemSettings.AdvancedOptionsHint', 'Show advanced configuration panels for the selected system.')}</small>
          </span>
        </label>
      </section>

      <section class="manager-v2-edit-card">
        <h3 class="manager-v2-card-title">{text('FABRICATE.Admin.ManagerV2.SystemEdit.OptionalFeatures', 'Optional features')}</h3>
        {#if visibleFeatures.length > 0}
          <div class="manager-v2-toggle-list">
            {#each visibleFeatures as feature}
              <label class="manager-v2-toggle-row" data-feature-key={feature.systemKey}>
                <input
                  type="checkbox"
                  checked={selectedSystem.features?.[feature.systemKey] === true}
                  onchange={(event) => handleToggleFeature(feature, event)}
                />
                <span class="manager-v2-toggle-copy">
                  <strong>{text(feature.labelKey, feature.fallback)}</strong>
                  <small>{text(feature.hintKey, feature.hintFallback)}</small>
                </span>
              </label>
            {/each}
          </div>
        {:else}
          <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.SystemEdit.NoFeatureToggles', 'No optional feature toggles are present on this system.')}</p>
        {/if}
      </section>

      {#if gatheringEnabled}
        <section class="manager-v2-edit-card manager-v2-character-modifier-card" data-system-character-modifiers aria-label={text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Title', 'Character modifiers')}>
          <header class="manager-v2-character-modifier-card-header">
            <div class="manager-v2-character-modifier-card-header-copy">
              <h3 class="manager-v2-card-title">
                <i class="fa-solid fa-user-gear" aria-hidden="true"></i>
                {text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Title', 'Character modifiers')}
              </h3>
              <p class="manager-v2-muted">{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Hint', 'Define reusable actor-driven modifiers for this system\'s d100 gathering rows and hazards.')}</p>
            </div>
            <div class="manager-v2-character-modifier-card-header-actions">
              <button type="button" class="manager-v2-action" onclick={handleAddCharacterModifier}>
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                {text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Add', 'Add character modifier')}
              </button>
              <button type="button"
                      class="manager-v2-action"
                      disabled={!characterModifierPresetsSupported}
                      data-tooltip={!characterModifierPresetsSupported ? text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.SeedPresetsUnsupported', 'Preset seeding is only available for dnd5e or pf2e worlds.') : null}
                      onclick={onSeedCharacterModifierPresets}>
                <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
                {text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.SeedPresets', 'Seed presets')}
              </button>
            </div>
          </header>
          {#if characterModifierLibrary.length === 0}
            <p class="manager-v2-muted manager-v2-character-modifier-empty">{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Empty', 'No character modifiers yet.')}</p>
          {:else}
            <ul class="manager-v2-character-modifier-list">
              {#each characterModifierLibrary as entry (entry.id)}
                <li class="manager-v2-character-modifier-row" data-system-character-modifier={entry.id}>
                  {#if characterModifierEditingId === entry.id}
                    <div class="manager-v2-character-modifier-editor">
                      <label class="manager-v2-field">
                        <span>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Label', 'Label')}</span>
                        <input type="text" value={entry.label} oninput={(event) => onUpdateCharacterModifier(entry.id, { label: event.currentTarget.value })} />
                      </label>
                      <label class="manager-v2-field">
                        <span>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Icon', 'Icon')}</span>
                        <input type="text" value={entry.icon} oninput={(event) => onUpdateCharacterModifier(entry.id, { icon: event.currentTarget.value })} />
                      </label>
                      <ProviderExpressionInput
                        provider={entry.provider}
                        expression={entry.expression}
                        macroUuid={entry.macroUuid}
                        idPrefix={`character-modifier-${entry.id}`}
                        onProviderChange={(value) => onUpdateCharacterModifier(entry.id, { provider: value })}
                        onExpressionChange={(value) => onUpdateCharacterModifier(entry.id, { expression: value })}
                        onMacroUuidChange={(value) => onUpdateCharacterModifier(entry.id, { macroUuid: value })}
                      />
                      <div class="manager-v2-character-modifier-actions">
                        <button type="button" class="manager-v2-action" onclick={() => characterModifierEditingId = ''}>{text('FABRICATE.Admin.ManagerV2.Done', 'Done')}</button>
                        <button type="button" class="manager-v2-action manager-v2-action-danger" onclick={() => handleDeleteCharacterModifier(entry.id)}>{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Delete', 'Delete character modifier')}</button>
                      </div>
                    </div>
                  {:else}
                    <div class="manager-v2-character-modifier-summary">
                      <span class="manager-v2-character-modifier-icon"><i class={entry.icon || 'fa-solid fa-user'} aria-hidden="true"></i></span>
                      <span class="manager-v2-character-modifier-label">{entry.label}</span>
                      <span class="manager-v2-chip manager-v2-character-modifier-provider">{characterModifierProviderLabel(entry.provider)}</span>
                      {#if characterModifierIsRoll(entry)}
                        <span class="manager-v2-chip manager-v2-character-modifier-roll-tag">{text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.RollTag', 'Roll')}</span>
                      {/if}
                      <button type="button" class="manager-v2-icon-button" aria-label={text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Edit', 'Edit character modifier')} onclick={() => characterModifierEditingId = entry.id}>
                        <i class="fa-solid fa-pen" aria-hidden="true"></i>
                      </button>
                      <button type="button" class="manager-v2-icon-button manager-v2-icon-button-danger" aria-label={text('FABRICATE.Admin.ManagerV2.Gathering.CharacterModifiers.Delete', 'Delete character modifier')} onclick={() => handleDeleteCharacterModifier(entry.id)}>
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
    </form>
  </main>
{/if}
