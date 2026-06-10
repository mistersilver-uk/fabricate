<!-- Svelte 5 runes mode -->
<!--
  GatheringRegionQuickList is the canonical region authoring surface for the
  gathering `Travel` route. It uses a region list + detail layout: the left list
  selects/creates/deletes regions, the right detail pane edits the selected
  region's name, description, image, enabled, secret, and biomes (chosen from the
  system biome vocabulary). All edits round-trip through `onUpdateRegion`, which
  merge-patches over the existing record so unedited fields (sort, sceneMappings,
  modifiers) survive untouched. Delete is destructive and routes through the
  store's confirm dialog with referenced-by evidence.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    regions = [],
    systemId = '',
    saving = false,
    biomeOptions = [],
    onCreateRegion = () => {},
    onRenameRegion = () => {},
    onToggleRegionEnabled = () => {},
    onUpdateRegion = () => {},
    onDeleteRegion = () => {},
    onPickImagePath = null
  } = $props();

  let createInput = $state('');
  let selectedRegionId = $state('');

  const DEFAULT_REGION_IMAGE_DIR = 'icons/environment/';

  function text(key, fallback, data) {
    const translated = localize(key, data);
    return translated && translated !== key ? translated : (fallback ?? key);
  }

  function optId(option) { return String(option?.id ?? option ?? '').trim(); }
  function optLabel(option) { return String(option?.label ?? option?.id ?? option ?? '').trim(); }

  const regionList = $derived(Array.isArray(regions) ? regions : []);
  const selectedRegion = $derived(
    regionList.find(region => region.id === selectedRegionId)
    || regionList[0]
    || null
  );

  // Keep the local selection valid as the list changes (create/delete/system swap).
  $effect(() => {
    if (regionList.length === 0) {
      if (selectedRegionId) selectedRegionId = '';
      return;
    }
    if (!regionList.some(region => region.id === selectedRegionId)) {
      selectedRegionId = regionList[0].id;
    }
  });

  const selectedBiomes = $derived(Array.isArray(selectedRegion?.biomes) ? selectedRegion.biomes : []);
  const availableBiomes = $derived(biomeOptions.filter(option => !selectedBiomes.includes(optId(option))));

  function biomeLabel(id) {
    return optLabel(biomeOptions.find(option => optId(option) === id)) || id;
  }
  function biomeColorStyle(id) {
    const option = biomeOptions.find(entry => optId(entry) === id);
    const hex = /^#[0-9a-fA-F]{6}$/.test(option?.customColor || '') ? option.customColor : '';
    const token = String(option?.colorToken || 'sage').replace(/^--fab-tag-/, '');
    return `--fab-chip-color: ${hex || `var(--fab-tag-${token})`}`;
  }

  function submitCreate(event) {
    event.preventDefault();
    const name = createInput.trim();
    if (!name) return;
    onCreateRegion(systemId, name);
    createInput = '';
  }

  function commitName(region, event) {
    const value = event.currentTarget.value.trim();
    if (!value || value === region.name) return;
    onRenameRegion(systemId, region.id, value);
  }

  function commitDescription(region, event) {
    const value = event.currentTarget.value;
    if (value === (region.description || '')) return;
    onUpdateRegion(systemId, region.id, { description: value });
  }

  function addBiome(event) {
    const id = String(event.currentTarget.value || '').trim();
    event.currentTarget.value = '';
    if (!id || !selectedRegion) return;
    if (selectedBiomes.includes(id)) return;
    onUpdateRegion(systemId, selectedRegion.id, { biomes: [...selectedBiomes, id] });
  }

  function removeBiome(id) {
    if (!selectedRegion) return;
    onUpdateRegion(systemId, selectedRegion.id, { biomes: selectedBiomes.filter(value => value !== id) });
  }

  async function chooseImage() {
    if (typeof onPickImagePath !== 'function' || !selectedRegion) return;
    const value = await onPickImagePath(selectedRegion.img || DEFAULT_REGION_IMAGE_DIR);
    if (value) onUpdateRegion(systemId, selectedRegion.id, { img: value });
  }
</script>

<section class="manager-travel-regions" aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.SectionLabel', 'Regions')}>
  <header class="manager-travel-regions-header">
    <span class="manager-travel-regions-title">
      <i class="fas fa-map-location-dot" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Travel.Regions.SectionLabel', 'Regions')}</span>
    </span>
  </header>

  <form class="manager-travel-region-create" onsubmit={submitCreate}>
    <input
      class="manager-travel-region-create-input"
      bind:value={createInput}
      placeholder={text('FABRICATE.Admin.Manager.Travel.Regions.CreatePlaceholder', 'New region name')}
      aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.CreateLabel', 'New region name')}
    />
    <button type="submit" class="manager-button" disabled={saving || !createInput.trim()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Travel.Regions.Create', 'Add region')}</span>
    </button>
  </form>

  {#if regionList.length === 0}
    <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.Regions.Empty', 'No regions yet.')}</p>
  {:else}
    <div class="manager-travel-region-layout">
      <ul class="manager-travel-region-list" aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.ListLabel', 'Regions')}>
        {#each regionList as region (region.id)}
          <li class="manager-travel-region-row" data-region-id={region.id}>
            <button
              type="button"
              class={`manager-travel-region-select ${selectedRegion?.id === region.id ? 'is-selected' : ''}`}
              aria-pressed={selectedRegion?.id === region.id}
              data-region-select={region.id}
              onclick={() => (selectedRegionId = region.id)}
            >
              <span class="manager-travel-region-select-name">{region.name}</span>
              {#if region.secret}
                <i class="fas fa-eye-slash manager-travel-region-secret-flag" aria-hidden="true" title={text('FABRICATE.Admin.Manager.Travel.Regions.SecretChip', 'Secret')}></i>
              {/if}
              {#if !region.enabled}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.Regions.DisabledChip', 'Disabled')}</span>
              {/if}
            </button>
            <button
              type="button"
              class="manager-icon-button is-danger"
              title={text('FABRICATE.Admin.Manager.Travel.Regions.Delete', 'Delete region')}
              aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.DeleteNamed', 'Delete {name}', { name: region.name }).replace('{name}', region.name)}
              disabled={saving}
              onclick={() => onDeleteRegion(systemId, region.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </li>
        {/each}
      </ul>

      {#if selectedRegion}
        <div class="manager-travel-region-detail" data-region-detail={selectedRegion.id}>
          <div class="manager-travel-region-detail-head">
            <button
              type="button"
              class="manager-travel-region-image"
              aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.ChooseImage', 'Choose region image')}
              onclick={chooseImage}
              disabled={typeof onPickImagePath !== 'function'}
            >
              <img src={selectedRegion.img || 'icons/svg/direction.svg'} alt="" />
              <i class="fas fa-pen" aria-hidden="true"></i>
            </button>
            <div class="manager-travel-region-detail-toggles">
              <button
                type="button"
                class={`manager-status-toggle ${selectedRegion.enabled ? 'is-on' : 'is-off'}`}
                data-region-field="enabled"
                aria-pressed={selectedRegion.enabled}
                aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.EnabledToggle', 'Toggle region enabled')}
                disabled={saving}
                onclick={() => onToggleRegionEnabled(systemId, selectedRegion.id, !selectedRegion.enabled)}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">
                  {selectedRegion.enabled
                    ? text('FABRICATE.Admin.Manager.Travel.Regions.EnabledChip', 'Enabled')
                    : text('FABRICATE.Admin.Manager.Travel.Regions.DisabledChip', 'Disabled')}
                </span>
              </button>
              <button
                type="button"
                class={`manager-status-toggle ${selectedRegion.secret ? 'is-on' : 'is-off'}`}
                data-region-field="secret"
                aria-pressed={selectedRegion.secret}
                aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.SecretToggle', 'Toggle region secret')}
                disabled={saving}
                onclick={() => onUpdateRegion(systemId, selectedRegion.id, { secret: !selectedRegion.secret })}
              >
                <span class="manager-status-toggle-track" aria-hidden="true"><span class="manager-status-toggle-knob"></span></span>
                <span class="manager-status-toggle-label">
                  {selectedRegion.secret
                    ? text('FABRICATE.Admin.Manager.Travel.Regions.SecretChip', 'Secret')
                    : text('FABRICATE.Admin.Manager.Travel.Regions.RevealedChip', 'Revealed')}
                </span>
              </button>
            </div>
          </div>

          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Travel.Regions.NameLabel', 'Name')}</span>
            <input
              class="manager-travel-region-name"
              data-region-field="name"
              value={selectedRegion.name}
              onblur={(event) => commitName(selectedRegion, event)}
              onkeydown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </label>

          <label class="manager-field">
            <span>{text('FABRICATE.Admin.Manager.Travel.Regions.DescriptionLabel', 'Description')}</span>
            <textarea
              class="manager-travel-region-description"
              data-region-field="description"
              value={selectedRegion.description || ''}
              onblur={(event) => commitDescription(selectedRegion, event)}
            ></textarea>
          </label>

          <div class="manager-field manager-travel-region-biomes" data-region-field="biomes">
            <span>{text('FABRICATE.Admin.Manager.Travel.Regions.BiomesLabel', 'Biomes')}</span>
            <p class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Regions.BiomesHint', 'The terrain in this region, drawn from the system biome vocabulary.')}</p>
            {#if availableBiomes.length > 0}
              <select aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.AddBiome', 'Add biome')} onchange={addBiome}>
                <option value="">{text('FABRICATE.Admin.Manager.Travel.Regions.AddBiome', 'Add biome')}</option>
                {#each availableBiomes as option (optId(option))}
                  <option value={optId(option)}>{optLabel(option)}</option>
                {/each}
              </select>
            {/if}
            <div class="manager-availability-pill-row">
              {#if selectedBiomes.length > 0}
                {#each selectedBiomes as id (id)}
                  <span class="manager-availability-pill is-biome" style={biomeColorStyle(id)}>
                    <span>{biomeLabel(id)}</span>
                    <button
                      type="button"
                      class="manager-availability-remove"
                      aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.RemoveBiome', 'Remove {name}', { name: biomeLabel(id) }).replace('{name}', biomeLabel(id))}
                      onclick={() => removeBiome(id)}
                    ><i class="fas fa-xmark" aria-hidden="true"></i></button>
                  </span>
                {/each}
              {:else}
                <span class="manager-muted">{text('FABRICATE.Admin.Manager.Travel.Regions.NoBiomes', 'No biomes selected')}</span>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </div>
  {/if}
</section>
