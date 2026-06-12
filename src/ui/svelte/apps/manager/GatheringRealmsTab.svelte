<!-- Svelte 5 runes mode -->
<!--
  Manager — Travel tab "Realms" section. Paginated, searchable accordion list
  of the selected system's gathering realms, mirroring the Parties tab. Each
  row header shows a fixed realm icon, the realm name, and chips for the
  number of environments that include the realm and the number of parties
  whose current realm is set to it. Selecting a row (which also expands it)
  surfaces the realm's details in the inspector; the expanded body itself is
  intentionally blank.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import RealmEnvironmentsEditor from './RealmEnvironmentsEditor.svelte';

  let {
    realms = [],
    selectedRealmId = '',
    environments = [],
    saving = false,
    onSelectRealm = () => {},
    onAddEnvironment = () => {},
    onRemoveEnvironment = () => {}
  } = $props();

  const PAGE_SIZE = 6;
  const REALM_ICON = 'fas fa-map-location-dot';

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let lastNavigatedSelection = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const filteredRealms = $derived(
    normalizedSearch
      ? realms.filter(realm => String(realm.name || '').toLowerCase().includes(normalizedSearch))
      : realms
  );

  // Keep the page index in range as the filtered set shrinks.
  $effect(() => {
    if (pageIndex > 0 && pageIndex * PAGE_SIZE >= filteredRealms.length) {
      pageIndex = 0;
    }
  });

  // When the selection changes (e.g. a freshly created realm is auto-selected),
  // page to it so it's visible. Guarded so manual pagination/search isn't fought.
  $effect(() => {
    if (!selectedRealmId || selectedRealmId === lastNavigatedSelection) return;
    lastNavigatedSelection = selectedRealmId;
    const index = filteredRealms.findIndex(realm => realm.id === selectedRealmId);
    if (index < 0) return;
    const targetPage = Math.floor(index / PAGE_SIZE);
    if (targetPage !== pageIndex) pageIndex = targetPage;
  });

  const pagedRealms = $derived(filteredRealms.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE));

  function selectRow(realmId) {
    onSelectRealm(realmId === selectedRealmId ? '' : realmId);
  }

  function onRowKeydown(event, realmId) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectRow(realmId);
  }

  function countLabel(count, oneKey, oneFallback, manyKey, manyFallback) {
    if (count === 1) return text(oneKey, oneFallback);
    return text(manyKey, manyFallback).replace('{count}', String(count));
  }

  function environmentCountLabel(realm) {
    return countLabel(
      realm?.environmentCount ?? 0,
      'FABRICATE.Admin.Manager.Travel.Realms.EnvironmentCountOne', '1 environment',
      'FABRICATE.Admin.Manager.Travel.Realms.EnvironmentCount', '{count} environments'
    );
  }

  function partyCountLabel(realm) {
    return countLabel(
      realm?.partyCount ?? 0,
      'FABRICATE.Admin.Manager.Travel.Realms.PartyCountOne', '1 party',
      'FABRICATE.Admin.Manager.Travel.Realms.PartyCount', '{count} parties'
    );
  }
</script>

<div
  class="manager-gathering-panel manager-travel-realms"
  id="travel-panel-realms"
  role="tabpanel"
  aria-labelledby="travel-tab-realms"
  data-travel-panel="realms"
>
  <section class="manager-toolbar manager-travel-realms-toolbar" aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.Filters', 'Realm filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.Travel.Realms.SearchPlaceholder', 'Search realms...')}
        aria-label={text('FABRICATE.Admin.Manager.Travel.Realms.SearchLabel', 'Search realms')}
      />
    </label>
  </section>

  {#if filteredRealms.length === 0}
    <p class="manager-muted manager-travel-realms-empty">
      {realms.length === 0
        ? text('FABRICATE.Admin.Manager.Travel.Realms.Empty', 'No realms yet.')
        : text('FABRICATE.Admin.Manager.Travel.Realms.NoMatches', 'No realms match your search.')}
    </p>
  {:else}
    <div class="manager-travel-realms-list" role="list">
      {#each pagedRealms as realm (realm.id)}
        {@const isExpanded = realm.id === selectedRealmId}
        <div
          class={`manager-travel-realms-row ${isExpanded ? 'is-expanded is-selected' : ''}`}
          role="listitem"
          data-manager-travel-realm-id={realm.id}
        >
          <div
            class="manager-travel-realms-header"
            role="button"
            tabindex="0"
            aria-expanded={isExpanded}
            onclick={() => selectRow(realm.id)}
            onkeydown={(event) => onRowKeydown(event, realm.id)}
          >
            <div class="manager-travel-realms-left">
              <span class="manager-travel-realms-icon" aria-hidden="true"><i class={REALM_ICON}></i></span>
              <span class="manager-travel-realms-name">{realm.name}</span>
              {#if !realm.enabled}
                <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</span>
              {/if}
              <span class="manager-chip is-neutral manager-travel-realms-count-chip">
                <i class="fas fa-seedling" aria-hidden="true"></i>
                <span>{environmentCountLabel(realm)}</span>
              </span>
              <span class="manager-chip is-neutral manager-travel-realms-count-chip">
                <i class="fas fa-people-group" aria-hidden="true"></i>
                <span>{partyCountLabel(realm)}</span>
              </span>
            </div>
            <span class="manager-travel-realms-chevron" aria-hidden="true">
              <i class={isExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}></i>
            </span>
          </div>

          {#if isExpanded}
            <div class="manager-travel-realms-editor" data-manager-realm-editor>
              <RealmEnvironmentsEditor
                {realm}
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
      totalCount={filteredRealms.length}
      pageSize={PAGE_SIZE}
      {pageIndex}
      pageSizeOptions={[PAGE_SIZE]}
      onPageChange={(next) => pageIndex = next}
    />
  {/if}
</div>
