<!-- Svelte 5 runes mode -->
<!--
  Manager — Travel tab "Regions" section. Paginated, searchable accordion list
  of the selected system's gathering regions, mirroring the Parties tab. Each
  row header shows a fixed region icon, the region name, and chips for the
  number of environments that include the region and the number of parties
  whose current region is set to it. Selecting a row (which also expands it)
  surfaces the region's details in the inspector; the expanded body itself is
  intentionally blank.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import RegionEnvironmentsEditor from './RegionEnvironmentsEditor.svelte';

  let {
    regions = [],
    selectedRegionId = '',
    environments = [],
    saving = false,
    onSelectRegion = () => {},
    onAddEnvironment = () => {},
    onRemoveEnvironment = () => {}
  } = $props();

  const PAGE_SIZE = 6;
  const REGION_ICON = 'fas fa-map-location-dot';

  let searchTerm = $state('');
  let pageIndex = $state(0);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const filteredRegions = $derived(
    normalizedSearch
      ? regions.filter(region => String(region.name || '').toLowerCase().includes(normalizedSearch))
      : regions
  );

  // Keep the page index in range as the filtered set shrinks.
  $effect(() => {
    if (pageIndex > 0 && pageIndex * PAGE_SIZE >= filteredRegions.length) {
      pageIndex = 0;
    }
  });

  const pagedRegions = $derived(filteredRegions.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE));

  function selectRow(regionId) {
    onSelectRegion(regionId === selectedRegionId ? '' : regionId);
  }

  function onRowKeydown(event, regionId) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectRow(regionId);
  }

  function countLabel(count, oneKey, oneFallback, manyKey, manyFallback) {
    if (count === 1) return text(oneKey, oneFallback);
    return text(manyKey, manyFallback).replace('{count}', String(count));
  }

  function environmentCountLabel(region) {
    return countLabel(
      region?.environmentCount ?? 0,
      'FABRICATE.Admin.Manager.Travel.Regions.EnvironmentCountOne', '1 environment',
      'FABRICATE.Admin.Manager.Travel.Regions.EnvironmentCount', '{count} environments'
    );
  }

  function partyCountLabel(region) {
    return countLabel(
      region?.partyCount ?? 0,
      'FABRICATE.Admin.Manager.Travel.Regions.PartyCountOne', '1 party',
      'FABRICATE.Admin.Manager.Travel.Regions.PartyCount', '{count} parties'
    );
  }
</script>

<div
  class="manager-gathering-panel manager-travel-regions"
  id="travel-panel-regions"
  role="tabpanel"
  aria-labelledby="travel-tab-regions"
  data-travel-panel="regions"
>
  <section class="manager-toolbar manager-travel-regions-toolbar" aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.Filters', 'Region filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.Travel.Regions.SearchPlaceholder', 'Search regions...')}
        aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.SearchLabel', 'Search regions')}
      />
    </label>
  </section>

  {#if filteredRegions.length === 0}
    <p class="manager-muted manager-travel-regions-empty">
      {regions.length === 0
        ? text('FABRICATE.Admin.Manager.Travel.Regions.Empty', 'No regions yet.')
        : text('FABRICATE.Admin.Manager.Travel.Regions.NoMatches', 'No regions match your search.')}
    </p>
  {:else}
    <div class="manager-travel-regions-list" role="list">
      {#each pagedRegions as region (region.id)}
        {@const isExpanded = region.id === selectedRegionId}
        <div
          class={`manager-travel-regions-row ${isExpanded ? 'is-expanded is-selected' : ''}`}
          role="listitem"
          data-manager-travel-region-id={region.id}
        >
          <div
            class="manager-travel-regions-header"
            role="button"
            tabindex="0"
            aria-expanded={isExpanded}
            onclick={() => selectRow(region.id)}
            onkeydown={(event) => onRowKeydown(event, region.id)}
          >
            <div class="manager-travel-regions-left">
              <span class="manager-travel-regions-icon" aria-hidden="true"><i class={REGION_ICON}></i></span>
              <span class="manager-travel-regions-name">{region.name}</span>
              {#if !region.enabled}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</span>
              {/if}
              <span class="manager-chip is-neutral manager-travel-regions-count-chip">
                <i class="fas fa-seedling" aria-hidden="true"></i>
                <span>{environmentCountLabel(region)}</span>
              </span>
              <span class="manager-chip is-neutral manager-travel-regions-count-chip">
                <i class="fas fa-people-group" aria-hidden="true"></i>
                <span>{partyCountLabel(region)}</span>
              </span>
            </div>
            <span class="manager-travel-regions-chevron" aria-hidden="true">
              <i class={isExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}></i>
            </span>
          </div>

          {#if isExpanded}
            <div class="manager-travel-regions-editor" data-manager-region-editor>
              <RegionEnvironmentsEditor
                {region}
                {environments}
                {saving}
                onAdd={onAddEnvironment}
                onRemove={onRemoveEnvironment}
              />
            </div>
          {/if}
        </div>
      {/each}
    </div>

    <Pagination
      totalCount={filteredRegions.length}
      pageSize={PAGE_SIZE}
      {pageIndex}
      pageSizeOptions={[PAGE_SIZE]}
      onPageChange={(next) => pageIndex = next}
    />
  {/if}
</div>
