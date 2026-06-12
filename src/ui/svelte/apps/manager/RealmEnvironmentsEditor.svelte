<!-- Svelte 5 runes mode -->
<!--
  Expanded-body editor for a realm row on the Travel > Realms tab. Two
  columns: available environments (not in the realm) on the left with an Add
  button, and included environments (in the realm) on the right with a Remove
  button. Add/Remove toggle the realm "tag" on the environment's
  includedRealmIds; each list is searchable and paginated independently.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';

  let {
    realm = null,
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

  const realmId = $derived(realm?.id || '');

  function inRealm(environment) {
    return Array.isArray(environment?.includedRealmIds) && environment.includedRealmIds.includes(realmId);
  }

  const includedEnvironments = $derived(environments.filter(inRealm));
  const availableEnvironments = $derived(environments.filter(environment => !inRealm(environment)));

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

{#if realm}
  <div class="manager-realm-env-editor" data-manager-realm-env-editor={realmId}>
    <section class="manager-realm-env-column" data-realm-env-column="available">
      <h4 class="manager-card-subtitle"><i class="fas fa-circle-plus" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.Realms.AvailableEnvironments', 'Available environments')}</h4>
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          bind:value={availableSearch}
          placeholder={text('FABRICATE.Admin.Manager.Travel.Realms.EnvSearchPlaceholder', 'Search environments...')}
          aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.EnvSearchLabel', 'Search environments')}
        />
      </label>
      {#if filteredAvailable.length === 0}
        <p class="manager-muted">
          {availableEnvironments.length === 0
            ? text('FABRICATE.Admin.Manager.Travel.Realms.NoAvailableEnvironments', 'All environments are in this realm.')
            : text('FABRICATE.Admin.Manager.Travel.Realms.NoEnvironmentMatches', 'No environments match your search.')}
        </p>
      {:else}
        <ul class="manager-realm-env-list" role="list">
          {#each pagedAvailable as environment (environment.id)}
            <li class="manager-realm-env-row" data-environment-id={environment.id}>
              <span class="manager-travel-region-thumb" aria-hidden="true">
                {#if environment.img}<img src={environment.img} alt="" />{:else}<i class={FALLBACK_ICON}></i>{/if}
              </span>
              <span class="manager-realm-env-name">{environment.name}</span>
              {#if environment.enabled === false}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</span>
              {/if}
              <button
                type="button"
                class="manager-icon-button manager-realm-env-add"
                aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.AddEnvironment', 'Add environment to realm')}
                title={text('FABRICATE.Admin.Manager.Travel.Realms.AddEnvironment', 'Add environment to realm')}
                disabled={saving}
                onclick={() => onAdd(environment.id, realmId)}
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

    <section class="manager-realm-env-column" data-realm-env-column="included">
      <h4 class="manager-card-subtitle"><i class="fas fa-circle-check" aria-hidden="true"></i> {text('FABRICATE.Admin.Manager.Travel.Realms.IncludedEnvironments', 'Included environments')}</h4>
      <label class="manager-search">
        <i class="fas fa-search" aria-hidden="true"></i>
        <input
          type="search"
          bind:value={includedSearch}
          placeholder={text('FABRICATE.Admin.Manager.Travel.Realms.EnvSearchPlaceholder', 'Search environments...')}
          aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.EnvSearchLabel', 'Search environments')}
        />
      </label>
      {#if filteredIncluded.length === 0}
        <p class="manager-muted">
          {includedEnvironments.length === 0
            ? text('FABRICATE.Admin.Manager.Travel.Realms.NoIncludedEnvironments', 'No environments are in this realm yet.')
            : text('FABRICATE.Admin.Manager.Travel.Realms.NoEnvironmentMatches', 'No environments match your search.')}
        </p>
      {:else}
        <ul class="manager-realm-env-list" role="list">
          {#each pagedIncluded as environment (environment.id)}
            <li class="manager-realm-env-row" data-environment-id={environment.id}>
              <span class="manager-travel-region-thumb" aria-hidden="true">
                {#if environment.img}<img src={environment.img} alt="" />{:else}<i class={FALLBACK_ICON}></i>{/if}
              </span>
              <span class="manager-realm-env-name">{environment.name}</span>
              {#if environment.enabled === false}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</span>
              {/if}
              <button
                type="button"
                class="manager-icon-button is-danger manager-realm-env-remove"
                aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.RemoveEnvironment', 'Remove environment from realm')}
                title={text('FABRICATE.Admin.Manager.Travel.Realms.RemoveEnvironment', 'Remove environment from realm')}
                disabled={saving}
                onclick={() => onRemove(environment.id, realmId)}
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
