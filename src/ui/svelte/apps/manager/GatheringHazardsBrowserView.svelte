<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    hazards = [],
    environments = [],
    selectedHazardId = '',
    selectedSystemId = '',
    gatheringConfig = null,
    panelId = 'manager-gathering-panel-hazards',
    labelledBy = 'manager-gathering-nav-hazards',
    onSelectHazard = () => {},
    onCreateHazard = () => {},
    onEditHazard = () => {},
    onDuplicateHazard = () => {},
    onDeleteHazard = () => {},
    onToggleHazardEnabled = () => {}
  } = $props();

  let searchTerm = $state('');
  let statusFilter = $state('all');
  let regionFilter = $state('all');
  let biomeFilter = $state('all');
  let dangerFilter = $state('all');
  let lastSystemId = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(10);

  const hazardList = $derived(Array.isArray(hazards) ? hazards : []);
  const environmentList = $derived(Array.isArray(environments) ? environments : []);
  const systemConfig = $derived(gatheringConfig?.systems?.[selectedSystemId] || {});
  const normalizedSearchTerm = $derived(searchTerm.trim().toLowerCase());
  const regionOptions = $derived(uniqueSorted([
    ...hazardList.flatMap(hazard => Array.isArray(hazard.regions)
      ? hazard.regions
      : (hazard.region ? [hazard.region] : [])),
    ...vocabularyIds(systemConfig.vocabularies?.regions?.values)
  ]));
  const biomeOptions = $derived(uniqueSorted([
    ...hazardList.flatMap(hazard => Array.isArray(hazard.biomes) ? hazard.biomes : []),
    ...vocabularyIds(systemConfig.vocabularies?.biomes?.values)
  ]));
  const dangerOptions = $derived(uniqueSorted([
    'safe',
    'hazardous',
    'dangerous',
    'deadly',
    ...hazardList.flatMap(hazard => Array.isArray(hazard.dangerTags) ? hazard.dangerTags : [])
  ]));
  const filteredHazards = $derived(hazardList.filter(hazard => {
    const dangerTags = Array.isArray(hazard.dangerTags) ? hazard.dangerTags : [];
    const haystack = `${hazardName(hazard)} ${hazard.description || ''} ${dangerTags.join(' ')}`.toLowerCase();
    const matchesSearch = !normalizedSearchTerm || haystack.includes(normalizedSearchTerm);
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && hazard.enabled !== false)
      || (statusFilter === 'disabled' && hazard.enabled === false);
    const hazardRegions = Array.isArray(hazard.regions)
      ? hazard.regions
      : (hazard.region ? [hazard.region] : []);
    const matchesRegion = regionFilter === 'all' || hazardRegions.includes(regionFilter);
    const hazardBiomes = Array.isArray(hazard.biomes) ? hazard.biomes : [];
    const matchesBiome = biomeFilter === 'all' || hazardBiomes.includes(biomeFilter);
    const matchesDanger = dangerFilter === 'all' || dangerTags.includes(dangerFilter);
    return matchesSearch && matchesStatus && matchesRegion && matchesBiome && matchesDanger;
  }));
  const filtersActive = $derived(
    normalizedSearchTerm.length > 0
    || statusFilter !== 'all'
    || regionFilter !== 'all'
    || biomeFilter !== 'all'
    || dangerFilter !== 'all'
  );
  const paginatedHazards = $derived(filteredHazards.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

  $effect(() => {
    if (selectedSystemId === lastSystemId) return;
    searchTerm = '';
    statusFilter = 'all';
    regionFilter = 'all';
    biomeFilter = 'all';
    dangerFilter = 'all';
    pageIndex = 0;
    lastSystemId = selectedSystemId;
  });

  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredHazards.length) {
      pageIndex = 0;
    }
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function stackedLabel(key, fallback) {
    return `${text(key, fallback)}:`;
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }

  function vocabularyIds(values = []) {
    return (Array.isArray(values) ? values : []).map(value => typeof value === 'object' ? value.id : value);
  }

  function optionLabel(kind, id) {
    const options = kind === 'biome'
      ? systemConfig.vocabularies?.biomes?.values
      : systemConfig.vocabularies?.regions?.values;
    const option = (Array.isArray(options) ? options : []).find(value => String(value?.id || value) === String(id || ''));
    return String(option?.label || option?.id || id || '').trim();
  }

  function dangerLabel(tag) {
    const key = `FABRICATE.Admin.Manager.Environment.Hazards.DangerTag.${tag}`;
    return text(key, tag.charAt(0).toUpperCase() + tag.slice(1));
  }

  function hazardName(hazard) {
    return String(hazard?.name || text('FABRICATE.Admin.Manager.Environment.Hazards.UnnamedHazard', 'Unnamed hazard')).trim();
  }

  function hazardImage(hazard) {
    return hazard?.img || 'icons/svg/hazard.svg';
  }

  function dropRateLabel(hazard) {
    const rate = Number(hazard?.dropRate);
    if (!Number.isFinite(rate)) return text('FABRICATE.Admin.Manager.Environment.Hazards.NoDropRate', '—');
    return `${Math.max(1, Math.min(100, Math.floor(rate)))}%`;
  }

  function activeEnvironmentCount(hazard) {
    if (!hazard?.id) return 0;
    const hazardId = String(hazard.id);
    return environmentList.filter(environment => {
      if (String(environment?.craftingSystemId || '') !== String(selectedSystemId || '')) return false;
      const enabledIds = Array.isArray(environment?.enabledHazardIds) ? environment.enabledHazardIds.map(String) : [];
      return enabledIds.includes(hazardId);
    }).length;
  }

  function clearFilters() {
    searchTerm = '';
    statusFilter = 'all';
    regionFilter = 'all';
    biomeFilter = 'all';
    dangerFilter = 'all';
  }
</script>

<div
  class="manager-gathering-panel manager-gathering-panel-hazards"
  id={panelId}
  role="tabpanel"
  aria-labelledby={labelledBy}
  data-gathering-hazards-browser
>
  <section class="manager-toolbar manager-hazard-toolbar" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.Filters', 'Gathering hazard filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.Environment.Hazards.SearchPlaceholder', 'Search gathering hazards...')}
        aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.SearchLabel', 'Search gathering hazards')}
      />
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
      <select value={statusFilter} onchange={(event) => statusFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.Hazards.StatusAll', 'All hazards')}</option>
        <option value="active">{text('FABRICATE.Admin.Manager.StatusActive', 'Active')}</option>
        <option value="disabled">{text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled')}</option>
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Environment.Region', 'Region')}</span>
      <select value={regionFilter} onchange={(event) => regionFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.RegionAll', 'All regions')}</option>
        {#each regionOptions as region (region)}
          <option value={region}>{optionLabel('region', region) || region}</option>
        {/each}
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>
      <select value={biomeFilter} onchange={(event) => biomeFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.BiomeAll', 'All biomes')}</option>
        {#each biomeOptions as biome (biome)}
          <option value={biome}>{optionLabel('biome', biome) || biome}</option>
        {/each}
      </select>
    </label>
    <label class="manager-filter">
      <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.DangerTag.Label', 'Danger')}</span>
      <select value={dangerFilter} onchange={(event) => dangerFilter = event.currentTarget.value}>
        <option value="all">{text('FABRICATE.Admin.Manager.Environment.Hazards.DangerAll', 'All danger tags')}</option>
        {#each dangerOptions as tag (tag)}
          <option value={tag}>{dangerLabel(tag)}</option>
        {/each}
      </select>
    </label>
    <span class="manager-chip">{text('FABRICATE.Admin.Manager.SearchCount', '{shown} of {total}').replace('{shown}', filteredHazards.length).replace('{total}', hazardList.length)}</span>
    {#if filtersActive}
      <button type="button" class="manager-button manager-clear-filters" data-clear-filters="gathering-hazards" onclick={clearFilters}>
        <i class="fas fa-times" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</span>
      </button>
    {/if}
  </section>

  <section class="manager-table-scroll" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.Table', 'Gathering hazards table')}>
    {#if hazardList.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.EmptyTitle', 'No gathering hazards yet')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Environment.Hazards.EmptyHint', 'Create reusable hazards before attaching them to environments.')}</p>
          <button type="button" class="manager-button is-primary" onclick={() => onCreateHazard(selectedSystemId)}>
            <i class="fas fa-plus" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Environment.Hazards.Create', 'Create gathering hazard')}</span>
          </button>
        </div>
      </div>
    {:else if filteredHazards.length === 0}
      <div class="manager-empty">
        <div>
          <i class="fas fa-search" aria-hidden="true"></i>
          <h3>{text('FABRICATE.Admin.Manager.Environment.Hazards.EmptySearchTitle', 'No hazards match these filters')}</h3>
          <p>{text('FABRICATE.Admin.Manager.Environment.Hazards.EmptySearchHint', 'Clear search and filters to show all hazards in this system.')}</p>
          <button type="button" class="manager-button" onclick={clearFilters}>{text('FABRICATE.Admin.Manager.ClearFilters', 'Clear filters')}</button>
        </div>
      </div>
    {:else}
      <div class="manager-gathering-hazards-table" role="table" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.TableShort', 'Gathering hazards')}>
        <div class="manager-table-head manager-gathering-hazard-table-head" role="row">
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Hazards.Column.Hazard', 'Hazard')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Hazards.DangerTags', 'Danger')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Region', 'Region')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Hazards.DropRate', 'Drop rate')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Environment.Hazards.Environments', 'Environments')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.StatusFilter', 'Status')}</span>
          <span role="columnheader">{text('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}</span>
        </div>
        {#each paginatedHazards as hazard (hazard.id)}
          <div class={`manager-gathering-hazard-row ${selectedHazardId === hazard.id ? 'is-selected' : ''}`} role="row" aria-selected={selectedHazardId === hazard.id} data-gathering-hazard-id={hazard.id}>
            <button type="button" class="manager-gathering-hazard-identity" onclick={() => onSelectHazard(hazard.id)} role="cell">
              <img class="manager-gathering-hazard-thumb" src={hazardImage(hazard)} alt="" />
              <span class="manager-system-copy">
                <span class="manager-system-name" title={hazardName(hazard)}>{hazardName(hazard)}</span>
                {#if hazard.description}
                  <span class="manager-system-description" title={hazard.description}>{hazard.description}</span>
                {:else}
                  <span class="manager-system-description">{text('FABRICATE.Admin.Manager.NoDescription', 'No description')}</span>
                {/if}
              </span>
            </button>
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Environment.Hazards.DangerTags', 'Danger')}>
              {#if Array.isArray(hazard.dangerTags) && hazard.dangerTags.length > 0}
                <span class="manager-chip-row">
                  {#each hazard.dangerTags as tag (tag)}
                    <span class={`manager-danger-tag-pill is-${tag}`}>{dangerLabel(tag)}</span>
                  {/each}
                </span>
              {:else}
                <span class="manager-chip">{text('FABRICATE.Admin.Manager.Environment.Hazards.AnyDanger', 'Any danger')}</span>
              {/if}
            </span>
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Environment.Region', 'Region')}>
              {#if (Array.isArray(hazard.regions) ? hazard.regions : (hazard.region ? [hazard.region] : [])).length > 0}
                <span class="manager-muted">{(Array.isArray(hazard.regions) ? hazard.regions : [hazard.region]).map(region => optionLabel('region', region) || region).join(', ')}</span>
              {:else}
                <span class="manager-chip">{text('FABRICATE.Admin.Manager.Environment.Hazards.AnyRegion', 'Any region')}</span>
              {/if}
            </span>
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Environment.Biome', 'Biome')}>
              <span class="manager-muted">{(Array.isArray(hazard.biomes) && hazard.biomes.length > 0) ? hazard.biomes.map(biome => optionLabel('biome', biome) || biome).join(', ') : text('FABRICATE.Admin.Manager.Environment.Hazards.AnyBiome', 'Any biome')}</span>
            </span>
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Environment.Hazards.DropRate', 'Drop rate')}>
              <strong>{dropRateLabel(hazard)}</strong>
            </span>
            <span role="cell" class="manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Environment.Hazards.Environments', 'Environments')}>
              <strong>{activeEnvironmentCount(hazard)}</strong>
            </span>
            <span role="cell" class="manager-labeled-cell manager-status-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.StatusFilter', 'Status')}>
              <button
                type="button"
                class={`manager-status-toggle ${hazard.enabled === false ? 'is-off' : 'is-on'}`}
                aria-pressed={hazard.enabled !== false}
                aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.ToggleNamed', 'Toggle {name}').replace('{name}', hazardName(hazard))}
                onclick={(event) => { event.stopPropagation(); onToggleHazardEnabled(selectedSystemId, hazard.id, hazard.enabled === false); }}
                onkeydown={(event) => event.stopPropagation()}
              >
                <span class="manager-status-toggle-track" aria-hidden="true">
                  <span class="manager-status-toggle-knob"></span>
                </span>
                <span class="manager-status-toggle-label">
                  {hazard.enabled === false ? text('FABRICATE.Admin.Manager.StatusOff', 'Off') : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
                </span>
              </button>
            </span>
            <span role="cell" class="manager-action-group manager-labeled-cell" data-label={stackedLabel('FABRICATE.Admin.Manager.Column.Actions', 'Actions')}>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.EditNamed', 'Edit {name}').replace('{name}', hazardName(hazard))} title={text('FABRICATE.Admin.Manager.Environment.Hazards.Edit', 'Edit hazard')} onclick={() => onEditHazard(hazard.id)}>
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.DuplicateNamed', 'Duplicate {name}').replace('{name}', hazardName(hazard))} title={text('FABRICATE.Admin.Manager.Environment.Hazards.Duplicate', 'Duplicate hazard')} onclick={() => onDuplicateHazard(selectedSystemId, hazard.id)}>
                <i class="fas fa-copy" aria-hidden="true"></i>
              </button>
              <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Environment.Hazards.DeleteNamed', 'Delete {name}').replace('{name}', hazardName(hazard))} title={text('FABRICATE.Admin.Manager.Environment.Hazards.Delete', 'Delete hazard')} onclick={() => onDeleteHazard(selectedSystemId, hazard.id)}>
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <Pagination
    totalCount={filteredHazards.length}
    {pageSize}
    {pageIndex}
    onPageChange={(next) => pageIndex = next}
    onPageSizeChange={(next) => { pageSize = next; pageIndex = 0; }}
  />
</div>
