<!-- Svelte 5 runes mode -->
<!--
  Manager — Travel tab "Map Region Links" section (central column). A selectable
  list of every Foundry Scene Region on the currently active scene: each row
  shows the scene region's colour swatch + name (the selectable header) plus a
  searchable picker to link it to a Fabricate region. Selecting a row surfaces
  its detail (parties present) in the right inspector; the parent auto-selects
  the first region. Empty states cover "no active scene" and "scene has no
  regions".
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import MapRegionLinkPicker from './MapRegionLinkPicker.svelte';

  let {
    sceneRegions = [],
    sceneUuid = '',
    selectedRegionUuid = '',
    regions = [],
    saving = false,
    onSelect = () => {},
    onSetLink = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function onRowKeydown(event, regionUuid) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(regionUuid);
  }
</script>

<div
  class="manager-gathering-panel manager-travel-map-links"
  id="travel-panel-map"
  role="tabpanel"
  aria-labelledby="travel-tab-map"
  data-travel-panel="map"
>
  {#if !sceneUuid}
    <p class="manager-muted manager-travel-map-links-empty">
      {text('FABRICATE.Admin.Manager.Travel.MapLinks.NoScene', 'Activate a scene to link its regions.')}
    </p>
  {:else if sceneRegions.length === 0}
    <p class="manager-muted manager-travel-map-links-empty">
      {text('FABRICATE.Admin.Manager.Travel.MapLinks.NoRegions', 'The active scene has no regions.')}
    </p>
  {:else}
    <div class="manager-map-link-list" role="list">
      {#each sceneRegions as sceneRegion (sceneRegion.sceneRegionUuid)}
        {@const isSelected = sceneRegion.sceneRegionUuid === selectedRegionUuid}
        <div
          class={`manager-map-link-row ${isSelected ? 'is-selected' : ''}`}
          role="listitem"
          data-manager-map-region-uuid={sceneRegion.sceneRegionUuid}
        >
          <div
            class="manager-map-link-header"
            role="button"
            tabindex="0"
            aria-pressed={isSelected}
            onclick={() => onSelect(sceneRegion.sceneRegionUuid)}
            onkeydown={(event) => onRowKeydown(event, sceneRegion.sceneRegionUuid)}
          >
            <span
              class="manager-map-link-swatch"
              style={sceneRegion.color ? `background:${sceneRegion.color};` : ''}
              aria-hidden="true"
            ></span>
            <span class="manager-map-link-name">
              {sceneRegion.name || text('FABRICATE.Admin.Manager.Travel.MapLinks.UnnamedRegion', 'Unnamed region')}
            </span>
          </div>
          <div class="manager-map-link-picker-cell">
            <MapRegionLinkPicker
              value={sceneRegion.linkedRegionId}
              {regions}
              disabled={saving}
              onChoose={(regionId) => onSetLink(sceneRegion.sceneRegionUuid, regionId)}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
