<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import FeatureCardStack from './FeatureCardStack.svelte';

  let { selectedSystem = null, store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  let nameValue = $state(selectedSystem?.name ?? '');
  // svelte-ignore state_referenced_locally
  let descriptionValue = $state(selectedSystem?.description ?? '');

  $effect(() => {
    nameValue = selectedSystem?.name ?? '';
    descriptionValue = selectedSystem?.description ?? '';
  });

  function handleSave() {
    store.saveSystemDetails(nameValue, descriptionValue, selectedSystem?.advancedOptionsEnabled ?? true);
  }
</script>

<section class="admin-panel">
  {#if selectedSystem}
    <h3>{localize('FABRICATE.Admin.SystemSettings.Title')}</h3>
    <div class="system-meta-grid">
      <div class="form-group span-2">
        <label for="fab-system-name">{localize('FABRICATE.Admin.SystemSettings.Name')}</label>
        <input id="fab-system-name" type="text" bind:value={nameValue} />
      </div>
      <div class="form-group span-2">
        <label for="fab-system-description">{localize('FABRICATE.Admin.SystemSettings.Description')}</label>
        <textarea id="fab-system-description" rows="4" bind:value={descriptionValue}></textarea>
      </div>
      <div class="form-group span-2">
        <label class="checkbox-label">
          <input
            type="checkbox"
            checked={selectedSystem.advancedOptionsEnabled}
            onchange={(e) => store.toggleAdvancedOptions(e.target.checked)}
          />
          {localize('FABRICATE.Admin.SystemSettings.AdvancedOptions')}
        </label>
        <p class="hint">{localize('FABRICATE.Admin.SystemSettings.AdvancedOptionsHint')}</p>
      </div>
    </div>
    <div class="inline-actions">
      <button type="button" onclick={handleSave}>
        <i class="fas fa-save"></i> {localize('FABRICATE.Admin.SystemSettings.SaveDetails')}
      </button>
    </div>

    {#if selectedSystem.advancedOptionsEnabled}
      <FeatureCardStack {selectedSystem} {store} {services} />
    {:else}
      <p class="hint">{localize('FABRICATE.Admin.SystemSettings.AdvancedDisabled')}</p>
    {/if}
  {:else}
    <div class="fabricate-empty">
      <i class="fas fa-layer-group"></i>
      <h3>{localize('FABRICATE.Admin.SystemSettings.NoSystemSelected')}</h3>
      <p>{localize('FABRICATE.Admin.SystemSettings.NoSystemSelectedHint')}</p>
    </div>
  {/if}
</section>
