<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../util/foundryBridge.js';

  let { system, onUpdateTeaserConfig } = $props();

  const teaserConfig = $derived(system?.teaserConfig || { enabled: false, discoveryMode: 'threshold', fragments: [] });

  function handleTeaserToggle(event) {
    onUpdateTeaserConfig?.({ ...teaserConfig, enabled: event.target.checked });
  }

  function handleDiscoveryModeChange(event) {
    onUpdateTeaserConfig?.({ ...teaserConfig, discoveryMode: event.target.value });
  }

  function addFragment() {
    const newFragment = {
      id: `frag-${Date.now()}`,
      name: localize('FABRICATE.Teaser.FragmentName'),
      linkedItemUuid: null,
      recipeIds: [],
      progressValue: 25
    };
    onUpdateTeaserConfig?.({ ...teaserConfig, fragments: [...(teaserConfig.fragments || []), newFragment] });
  }

  function removeFragment(fragId) {
    onUpdateTeaserConfig?.({ ...teaserConfig, fragments: (teaserConfig.fragments || []).filter(f => f.id !== fragId) });
  }
</script>

<section class="admin-panel">
  <h3>{localize('FABRICATE.Admin.Rules.Title')}</h3>

  <div class="teaser-config-section">
    <h4>{localize('FABRICATE.Teaser.Title')}</h4>

    <div class="form-group">
      <label>
        <input
          type="checkbox"
          checked={teaserConfig.enabled}
          onchange={handleTeaserToggle}
        />
        {localize('FABRICATE.Teaser.Enable')}
      </label>
    </div>

    {#if teaserConfig.enabled}
      <div class="form-group">
        <label for="teaser-discovery-mode">{localize('FABRICATE.Teaser.DiscoveryMode')}</label>
        <select
          id="teaser-discovery-mode"
          value={teaserConfig.discoveryMode}
          onchange={handleDiscoveryModeChange}
        >
          <option value="threshold">{localize('FABRICATE.Teaser.ModeThreshold')}</option>
          <option value="fragments">{localize('FABRICATE.Teaser.ModeFragments')}</option>
          <option value="both">{localize('FABRICATE.Teaser.ModeBoth')}</option>
        </select>
      </div>

      {#if teaserConfig.discoveryMode === 'fragments' || teaserConfig.discoveryMode === 'both'}
        <div class="fragment-list">
          <h5>{localize('FABRICATE.Teaser.Fragments')}</h5>
          {#each (teaserConfig.fragments || []) as fragment (fragment.id)}
            <div class="fragment-row">
              <span class="fragment-name">{fragment.name}</span>
              <span class="fragment-uuid">{fragment.linkedItemUuid || '—'}</span>
              <span class="fragment-progress">{fragment.progressValue}%</span>
              <button
                type="button"
                class="fragment-remove-btn"
                onclick={() => removeFragment(fragment.id)}
                title={localize('FABRICATE.Teaser.RemoveFragment')}
              >
                <i class="fas fa-trash"></i>
              </button>
            </div>
          {/each}
          <button
            type="button"
            class="add-fragment-btn"
            onclick={addFragment}
          >
            <i class="fas fa-plus"></i>
            {localize('FABRICATE.Teaser.AddFragment')}
          </button>
        </div>
      {/if}
    {/if}
  </div>
</section>
