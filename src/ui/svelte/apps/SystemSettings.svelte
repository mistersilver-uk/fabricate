<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';
  import FeatureCardStack from './FeatureCardStack.svelte';

  let { selectedSystem = null, store, services = null } = $props();

  // svelte-ignore state_referenced_locally
  let nameValue = $state(selectedSystem?.name ?? '');
  // svelte-ignore state_referenced_locally
  let descriptionValue = $state(selectedSystem?.description ?? '');
  // svelte-ignore state_referenced_locally
  let resolutionModeValue = $state(selectedSystem?.resolutionMode ?? 'simple');
  let detailsSaveTimer = null;

  $effect(() => {
    if (detailsSaveTimer) {
      clearTimeout(detailsSaveTimer);
      detailsSaveTimer = null;
    }
    nameValue = selectedSystem?.name ?? '';
    descriptionValue = selectedSystem?.description ?? '';
    resolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
  });

  function flushDetailsSave() {
    if (detailsSaveTimer) {
      clearTimeout(detailsSaveTimer);
      detailsSaveTimer = null;
    }
    store.saveSystemDetails(nameValue, descriptionValue, selectedSystem?.advancedOptionsEnabled ?? true);
  }

  function scheduleDetailsSave() {
    if (detailsSaveTimer) clearTimeout(detailsSaveTimer);
    detailsSaveTimer = setTimeout(() => {
      detailsSaveTimer = null;
      store.saveSystemDetails(nameValue, descriptionValue, selectedSystem?.advancedOptionsEnabled ?? true);
    }, 250);
  }

  async function handleResolutionModeChange(event) {
    const nextMode = event.target.value || 'simple';
    resolutionModeValue = nextMode;
    const didApply = await store.setResolutionMode(nextMode);
    if (!didApply) {
      resolutionModeValue = selectedSystem?.resolutionMode ?? 'simple';
    }
  }
</script>

<section class="admin-panel">
  {#if selectedSystem}
    <h3>{localize('FABRICATE.Admin.SystemSettings.Title')}</h3>
    <div class="system-meta-grid">
      <div class="form-group span-2">
        <label for="fab-system-name">{localize('FABRICATE.Admin.SystemSettings.Name')}</label>
        <input
          id="fab-system-name"
          type="text"
          bind:value={nameValue}
          oninput={scheduleDetailsSave}
          onblur={flushDetailsSave}
        />
      </div>
      <div class="form-group span-2">
        <label for="fab-system-description">{localize('FABRICATE.Admin.SystemSettings.Description')}</label>
        <textarea
          id="fab-system-description"
          rows="4"
          bind:value={descriptionValue}
          oninput={scheduleDetailsSave}
          onblur={flushDetailsSave}
        ></textarea>
      </div>
      <div class="form-group span-2">
        <label for="fab-system-resolution-mode">{localize('FABRICATE.Admin.SystemSettings.ResolutionMode')}</label>
        <select
          id="fab-system-resolution-mode"
          value={resolutionModeValue}
          onchange={handleResolutionModeChange}
        >
          <option value="simple">{localize('FABRICATE.Admin.SystemSettings.ResolutionSimple')}</option>
          <option value="mapped">{localize('FABRICATE.Admin.SystemSettings.ResolutionMapped')}</option>
          <option value="tiered">{localize('FABRICATE.Admin.SystemSettings.ResolutionTiered')}</option>
          <option value="progressive">{localize('FABRICATE.Admin.SystemSettings.ResolutionProgressive')}</option>
          <option value="alchemy">{localize('FABRICATE.Admin.SystemSettings.ResolutionAlchemy')}</option>
        </select>
        <p class="hint">{localize('FABRICATE.Admin.SystemSettings.ResolutionModeHint')}</p>
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
