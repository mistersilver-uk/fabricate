<!-- Svelte 5 runes mode -->
<!--
  Crafting > Settings page (issue 511). The system-level crafting rules that used
  to live on the System Overview page: the recipe resolution mode, the salvage
  resolution mode (when the salvage feature is on), and the recipe visibility
  strategy. This surface is gated behind experimental features (the whole Crafting
  nav group is), so these controls are only reachable while that setting is on.

  Live-apply: resolution changes route through the store's confirm-then-migrate
  flow (reverting the radio if the GM cancels), and the visibility card applies
  each field immediately. Per-recipe-item use/learn caps are NOT here — they are
  authored per item on the Books & Scrolls page.

  Props:
   - selectedSystem: the projected selected crafting system.
   - onSetResolutionMode(mode): confirm + migrate; resolves false when cancelled.
   - onSetSalvageResolutionMode(mode): confirm; resolves false when cancelled.
   - onSaveVisibilityConfig(patch): live-apply a visibility-strategy patch.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import ResolutionModeCard from './ResolutionModeCard.svelte';
  import SystemRecipeVisibilityCard from './recipe/SystemRecipeVisibilityCard.svelte';
  import { resolutionModeOptions, salvageResolutionModeOptions } from './resolutionModeOptions.js';

  let {
    selectedSystem = null,
    onSetResolutionMode = () => {},
    onSetSalvageResolutionMode = () => {},
    onSaveVisibilityConfig = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  let systemResolutionModeValue = $state('simple');
  let systemSalvageResolutionModeValue = $state('simple');

  $effect(() => {
    systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
    systemSalvageResolutionModeValue = selectedSystem?.salvageResolutionMode ?? 'simple';
  });

  async function handleResolutionModeChange(nextValue) {
    const nextMode = nextValue || 'simple';
    systemResolutionModeValue = nextMode;
    const didApply = await onSetResolutionMode(nextMode);
    if (didApply === false) {
      systemResolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
    }
  }

  async function handleSalvageResolutionModeChange(nextValue) {
    const previousValue = systemSalvageResolutionModeValue;
    const nextMode = nextValue || 'progressive';
    systemSalvageResolutionModeValue = nextMode;
    const didApply = await onSetSalvageResolutionMode(nextMode);
    if (didApply === false) {
      systemSalvageResolutionModeValue = previousValue;
    }
  }
</script>

{#if selectedSystem}
  <main class="manager-main manager-crafting-settings-main" data-crafting-settings aria-label={text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle', 'Crafting settings')}>
    <section class="manager-section-header">
      <div class="manager-heading">
        <p class="manager-kicker">{selectedSystem.name}</p>
        <h2 class="manager-title">{text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsPlaceholderTitle', 'Crafting settings')}</h2>
        <p class="manager-subtitle">{text('FABRICATE.Admin.Manager.Crafting.CraftingTabs.SettingsHint', 'System-level crafting rules: resolution mode and recipe visibility.')}</p>
      </div>
    </section>

    <section class="manager-edit-card">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.SystemSettings.ResolutionMode', 'Recipe resolution mode')}</h3>
      <div class="manager-edit-grid">
        <ResolutionModeCard
          cardId="manager-crafting-resolution-mode"
          legendKey="FABRICATE.Admin.SystemSettings.ResolutionMode"
          legendFallback="Recipe resolution mode"
          hintKey="FABRICATE.Admin.Manager.SystemEdit.ResolutionModeHint"
          hintFallback="Changing resolution mode migrates recipes to the new mode where possible and only deletes recipes that cannot be migrated, after a confirmation that reports the counts."
          options={resolutionModeOptions}
          selectedValue={systemResolutionModeValue}
          groupName="manager-crafting-resolution-mode"
          dataAttr="data-crafting-resolution-mode"
          optionDataAttr="data-crafting-resolution-mode-option"
          onChange={handleResolutionModeChange}
        />
        {#if selectedSystem.features?.salvage === true}
          <ResolutionModeCard
            legendKey="FABRICATE.Admin.SystemSettings.SalvageResolutionMode"
            legendFallback="Salvage resolution mode"
            hintKey="FABRICATE.Admin.SystemSettings.SalvageResolutionModeHint"
            hintFallback="Salvage has one ingredient, so only progressive and routed-by-check apply. Components incompatible with the new salvage mode will have salvage disabled."
            options={salvageResolutionModeOptions}
            selectedValue={systemSalvageResolutionModeValue}
            groupName="manager-crafting-salvage-resolution-mode"
            dataAttr="data-crafting-salvage-resolution-mode"
            optionDataAttr="data-crafting-salvage-resolution-mode-option"
            onChange={handleSalvageResolutionModeChange}
          />
        {/if}
      </div>
    </section>

    {#if selectedSystem.resolutionMode !== 'alchemy'}
      <SystemRecipeVisibilityCard
        recipeVisibility={selectedSystem.recipeVisibility}
        showKnowledgeOptions={selectedSystem.showRecipeVisibilityKnowledgeOptions}
        onSave={onSaveVisibilityConfig}
      />
    {/if}
  </main>
{/if}
