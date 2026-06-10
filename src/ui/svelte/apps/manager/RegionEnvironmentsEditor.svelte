<!-- Svelte 5 runes mode -->
<!--
  Expanded-body editor for a region row on the Travel > Regions tab. Two
  columns: available environments (not in the region) on the left with an Add
  button, and included environments (in the region) on the right with a Remove
  button. Add/Remove toggle the region "tag" on the environment's
  includedRegionIds; each list is searchable and paginated independently.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    region = null,
    environments = [],
    saving = false,
    onAdd = () => {},
    onRemove = () => {}
  } = $props();

  const PAGE_SIZE = 6;
  const FALLBACK_ICON = 'fas fa-seedling';

  let availableSearch = $state('');
  let availablePage = $state(0);
  let includedSearch = $state('');
  let includedPage = $state(0);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const regionId = $derived(region?.id || '');

  function inRegion(environment) {
    return Array.isArray(environment?.includedRegionIds) && environment.includedRegionIds.includes(regionId);
  }

  const includedEnvironments = $derived(environments.filter(inRegion));
  const availableEnvironments = $derived(environments.filter(environment => !inRegion(environment)));

  function filterByName(list, term) {
    const normalized = term.trim().toLowerCase();
    return normalized
      ? list.filter(environment => String(environment.name || '').toLowerCase().includes(normalized))
      : list;
  }

  const filteredAvailable = $derived(filterByName(availableEnvironments, availableSearch));
  const filteredIncluded = $derived(filterByName(includedEnvironments, includedSearch));

  // Keep page indices in range as the filtered sets change.
  $effect(() => {
    if (availablePage > 0 && availablePage * PAGE_SIZE >= filteredAvailable.length) availablePage = 0;
  });
  $effect(() => {
    if (includedPage > 0 && includedPage * PAGE_SIZE >= filteredIncluded.length) includedPage = 0;
  });

  const pagedAvailable = $derived(filteredAvailable.slice(availablePage * PAGE_SIZE, (availablePage + 1) * PAGE_SIZE));
  const pagedIncluded = $derived(filteredIncluded.slice(includedPage * PAGE_SIZE, (includedPage + 1) * PAGE_SIZE));
</script>

{#if region}
  <div class="manager-region-env-editor" data-manager-region-env-editor={regionId}>
    <section class="manager-region-env-column" data-region-env-column="available">
      <h4 class="manager-card-subtitle"><i class="fas fa-circle-plus" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.Regions.AvailableEnvironments', 'Available environments')}</h4>
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          bind:value={availableSearch}
          placeholder={text('FABRICATE.Admin.Manager.Travel.Regions.EnvSearchPlaceholder', 'Search environments...')}
          aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.EnvSearchLabel', 'Search environments')}
        />
      </label>
      {#if filteredAvailable.length === 0}
        <p class="manager-muted">
          {availableEnvironments.length === 0
            ? text('FABRICATE.Admin.Manager.Travel.Regions.NoAvailableEnvironments', 'All environments are in this region.')
            : text('FABRICATE.Admin.Manager.Travel.Regions.NoEnvironmentMatches', 'No environments match your search.')}
        </p>
      {:else}
        <ul class="manager-region-env-list" role="list">
          {#each pagedAvailable as environment (environment.id)}
            <li class="manager-region-env-row" data-environment-id={environment.id}>
              <span class="manager-travel-region-thumb" aria-hidden="true">
                {#if environment.img}<img src={environment.img} alt="" />{:else}<i class={FALLBACK_ICON}></i>{/if}
              </span>
              <span class="manager-region-env-name">{environment.name}</span>
              {#if environment.enabled === false}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</span>
              {/if}
              <button
                type="button"
                class="manager-icon-button manager-region-env-add"
                aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.AddEnvironment', 'Add environment to region')}
                title={text('FABRICATE.Admin.Manager.Travel.Regions.AddEnvironment', 'Add environment to region')}
                disabled={saving}
                onclick={() => onAdd(environment.id, regionId)}
              >
                <i class="fas fa-plus" aria-hidden="true"></i>
              </button>
            </li>
          {/each}
        </ul>
        <Pagination
          totalCount={filteredAvailable.length}
          pageSize={PAGE_SIZE}
          pageIndex={availablePage}
          pageSizeOptions={[PAGE_SIZE]}
          onPageChange={(next) => availablePage = next}
        />
      {/if}
    </section>

    <section class="manager-region-env-column" data-region-env-column="included">
      <h4 class="manager-card-subtitle"><i class="fas fa-circle-check" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.Regions.IncludedEnvironments', 'Included environments')}</h4>
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          bind:value={includedSearch}
          placeholder={text('FABRICATE.Admin.Manager.Travel.Regions.EnvSearchPlaceholder', 'Search environments...')}
          aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.EnvSearchLabel', 'Search environments')}
        />
      </label>
      {#if filteredIncluded.length === 0}
        <p class="manager-muted">
          {includedEnvironments.length === 0
            ? text('FABRICATE.Admin.Manager.Travel.Regions.NoIncludedEnvironments', 'No environments are in this region yet.')
            : text('FABRICATE.Admin.Manager.Travel.Regions.NoEnvironmentMatches', 'No environments match your search.')}
        </p>
      {:else}
        <ul class="manager-region-env-list" role="list">
          {#each pagedIncluded as environment (environment.id)}
            <li class="manager-region-env-row" data-environment-id={environment.id}>
              <span class="manager-travel-region-thumb" aria-hidden="true">
                {#if environment.img}<img src={environment.img} alt="" />{:else}<i class={FALLBACK_ICON}></i>{/if}
              </span>
              <span class="manager-region-env-name">{environment.name}</span>
              {#if environment.enabled === false}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</span>
              {/if}
              <button
                type="button"
                class="manager-icon-button is-danger manager-region-env-remove"
                aria-label={text('FABRICATE.Admin.Manager.Travel.Regions.RemoveEnvironment', 'Remove environment from region')}
                title={text('FABRICATE.Admin.Manager.Travel.Regions.RemoveEnvironment', 'Remove environment from region')}
                disabled={saving}
                onclick={() => onRemove(environment.id, regionId)}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </li>
          {/each}
        </ul>
        <Pagination
          totalCount={filteredIncluded.length}
          pageSize={PAGE_SIZE}
          pageIndex={includedPage}
          pageSizeOptions={[PAGE_SIZE]}
          onPageChange={(next) => includedPage = next}
        />
      {/if}
    </section>
  </div>
{/if}
