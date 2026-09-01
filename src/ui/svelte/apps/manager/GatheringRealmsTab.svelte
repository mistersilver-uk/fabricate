<!-- Svelte 5 runes mode -->
<!--
  Manager — selected-system Travel > Realms section. Paginated, searchable accordion list
  of the selected system's gathering realms, mirroring the Parties tab. Each
  row header shows a fixed realm icon, the realm name, and chips for the
  number of environments that include the realm and the number of parties
  whose current realm is set to it. Selecting a row (which also expands it)
  surfaces the realm's details in the inspector; the expanded body itself is
  intentionally blank.
-->
<script>
  import Chip from './Chip.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import RealmEnvironmentsEditor from './RealmEnvironmentsEditor.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import ManagerToolbar from '../../components/ManagerToolbar.svelte';
  import { createTravelRealmsBrowserState } from '../../../../utils/managerBrowserViewState.js';

  let {
    realms = [],
    selectedRealmId = '',
    environments = [],
    saving = false,
    onSelectRealm = () => {},
    onAddEnvironment = () => {},
    onRemoveEnvironment = () => {},
    // ── THE VIEW-STATE IS LIFTED (issue 1438) ────────────────────────────────────────────
    // Realms has no editor route — a realm is authored in the inspector — so the trip that
    // destroyed this state is the World > Travel sub-tab switch to Map region links and any
    // navigation off the Travel route. Both unmount this component. The page-to-the-selection
    // sentinel is lifted with the rest: left local it re-initialises on the remount and pages
    // away from the restored page, which reads as the page not surviving at all.
    browserState = $bindable(null),
    // The expanded row's environment pickers, owned by the root and threaded through, because
    // collapsing the row unmounts them and this tab unmounts underneath them.
    realmEnvironmentsBrowserState = $bindable(null),
  } = $props();

  const PAGE_SIZE = 6;
  const REALM_ICON = 'fas fa-map-location-dot';

  let ownBrowserState = $state(createTravelRealmsBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const searchTerm = $derived(String(ui.searchTerm || ''));
  const pageIndex = $derived(ui.pageIndex || 0);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const filteredRealms = $derived(
    normalizedSearch
      ? realms.filter((realm) =>
          String(realm.name || '')
            .toLowerCase()
            .includes(normalizedSearch)
        )
      : realms
  );

  // Keep the page index in range as the filtered set shrinks.
  $effect(() => {
    if (pageIndex > 0 && pageIndex * PAGE_SIZE >= filteredRealms.length) {
      ui.pageIndex = 0;
    }
  });

  // When the selection changes (e.g. a freshly created realm is auto-selected),
  // page to it so it's visible. Guarded so manual pagination/search isn't fought.
  $effect(() => {
    if (!selectedRealmId || selectedRealmId === ui.navigatedSelectionId) return;
    ui.navigatedSelectionId = selectedRealmId;
    const index = filteredRealms.findIndex((realm) => realm.id === selectedRealmId);
    if (index < 0) return;
    const targetPage = Math.floor(index / PAGE_SIZE);
    if (targetPage !== pageIndex) ui.pageIndex = targetPage;
  });

  const pagedRealms = $derived(
    filteredRealms.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE)
  );

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
      'FABRICATE.Admin.Manager.Travel.Realms.EnvironmentCountOne',
      '1 environment',
      'FABRICATE.Admin.Manager.Travel.Realms.EnvironmentCount',
      '{count} environments'
    );
  }

  function partyCountLabel(realm) {
    return countLabel(
      realm?.partyCount ?? 0,
      'FABRICATE.Admin.Manager.Travel.Realms.PartyCountOne',
      '1 party',
      'FABRICATE.Admin.Manager.Travel.Realms.PartyCount',
      '{count} parties'
    );
  }
</script>

<div
  class="manager-gathering-panel manager-travel-realms"
  id="travel-panel-realms"
  role="region"
  aria-labelledby="manager-travel-nav-realms"
  data-travel-panel="realms"
>
  <ManagerToolbar
    class="manager-travel-realms-toolbar"
    ariaLabel={text('FABRICATE.Admin.Manager.Travel.Realms.Filters', 'Realm filters')}
  >
    <ManagerSearchField
      value={searchTerm}
      onInput={(next) => (ui.searchTerm = next)}
      placeholder={text(
        'FABRICATE.Admin.Manager.Travel.Realms.SearchPlaceholder',
        'Search realms...'
      )}
      ariaLabel={text('FABRICATE.Admin.Manager.Travel.Realms.SearchLabel', 'Search realms')}
    />
  </ManagerToolbar>

  {#if filteredRealms.length === 0}
    <EmptyState
      compact
      icon={realms.length === 0 ? 'fas fa-earth-americas' : 'fas fa-magnifying-glass'}
      title={realms.length === 0
        ? text('FABRICATE.Admin.Manager.Travel.Realms.Empty', 'No realms yet.')
        : text('FABRICATE.Admin.Manager.Travel.Realms.NoMatches', 'No realms match your search.')}
      dataAttr="data-travel-realms-empty"
    />
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
              <span class="manager-travel-realms-icon" aria-hidden="true"
                ><i class={REALM_ICON}></i></span
              >
              <span class="manager-travel-realms-name">{realm.name}</span>
              {#if !realm.enabled}
                <Chip tone="disabled"
                  >{text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}</Chip
                >
              {/if}
              <Chip tone="neutral" icon="fas fa-seedling" class="manager-travel-realms-count-chip">
                <span>{environmentCountLabel(realm)}</span>
              </Chip>
              <Chip
                tone="neutral"
                icon="fas fa-people-group"
                class="manager-travel-realms-count-chip"
              >
                <span>{partyCountLabel(realm)}</span>
              </Chip>
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
                bind:browserState={realmEnvironmentsBrowserState}
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
      onPageChange={(next) => (ui.pageIndex = next)}
    />
  {/if}
</div>
