<!-- Svelte 5 runes mode -->
<!--
  Manager — Travel tab "Parties" section. Paginated, searchable accordion list
  of Fabricate parties styled after the gathering tools browser.

  - Selecting (clicking / Enter / Space) a row expands it AND marks it the
    selected party (lifted to the manager store via onSelectParty) so the right
    inspector can show its details. Selection and expansion are the same state:
    the selected party's row is the expanded one.
  - The row header shows the travel-actor image (or a default icon), the party
    name, an enabled/disabled chip and a region selection-mode chip on the left,
    and the party's current region plus a searchable region-override popover
    (RegionOverridePicker) on the right.
  - The expanded accordion body is intentionally empty for now.

  Uses a `.manager-travel-parties-*` (plural) class namespace to stay clear of
  the legacy `.manager-travel-party-*` rules from the superseded travel view.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import Pagination from '../../components/Pagination.svelte';
  import RegionOverridePicker from './RegionOverridePicker.svelte';

  let {
    parties = [],
    systemId = '',
    systemRegions = [],
    selectedPartyId = '',
    onSelectParty = () => {},
    onSetRegionOverride = () => {},
    onClearRegionOverride = () => {}
  } = $props();

  const PAGE_SIZE = 6;

  let searchTerm = $state('');
  let pageIndex = $state(0);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const filteredParties = $derived(
    normalizedSearch
      ? parties.filter(party => String(party.name || '').toLowerCase().includes(normalizedSearch))
      : parties
  );

  // Keep the page index in range as the filtered set shrinks.
  $effect(() => {
    if (pageIndex > 0 && pageIndex * PAGE_SIZE >= filteredParties.length) {
      pageIndex = 0;
    }
  });

  const pagedParties = $derived(filteredParties.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE));

  function selectRow(party) {
    onSelectParty(party.id === selectedPartyId ? '' : party.id);
  }

  function onRowKeydown(event, party) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectRow(party);
  }

  function overrideValue(party) {
    if (party?.overrideMode === 'manual' && Array.isArray(party.overrideRegionIds) && party.overrideRegionIds.length > 0) {
      return party.overrideRegionIds[0];
    }
    return '';
  }

  function chooseOverride(party, regionId) {
    if (regionId) {
      onSetRegionOverride(party.id, systemId, [regionId]);
    } else {
      onClearRegionOverride(party.id, systemId);
    }
  }

  function memberCountLabel(party) {
    const count = party?.memberCount ?? 0;
    if (count === 1) return text('FABRICATE.Admin.Manager.Travel.MemberCountOne', '1 member');
    return text('FABRICATE.Admin.Manager.Travel.MemberCount', '{count} members').replace('{count}', String(count));
  }
</script>

<div
  class="manager-gathering-panel manager-travel-parties"
  id="travel-panel-parties"
  role="tabpanel"
  aria-labelledby="travel-tab-parties"
  data-travel-panel="parties"
>
  <section class="manager-toolbar manager-travel-parties-toolbar" aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.Filters', 'Party filters')}>
    <label class="manager-search">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="search"
        bind:value={searchTerm}
        placeholder={text('FABRICATE.Admin.Manager.Travel.Parties.SearchPlaceholder', 'Search parties...')}
        aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.SearchLabel', 'Search parties')}
      />
    </label>
  </section>

  {#if filteredParties.length === 0}
    <p class="manager-muted manager-travel-parties-empty">
      {parties.length === 0
        ? text('FABRICATE.Admin.Manager.Travel.Parties.Empty', 'No parties yet.')
        : text('FABRICATE.Admin.Manager.Travel.Parties.NoMatches', 'No parties match your search.')}
    </p>
  {:else}
    <div class="manager-travel-parties-list" role="list">
      {#each pagedParties as party (party.id)}
        {@const isExpanded = party.id === selectedPartyId}
        <div
          class={`manager-travel-parties-row ${isExpanded ? 'is-expanded is-selected' : ''}`}
          role="listitem"
          data-manager-travel-party-id={party.id}
        >
          <div
            class="manager-travel-parties-header"
            role="button"
            tabindex="0"
            aria-pressed={isExpanded}
            aria-expanded={isExpanded}
            onclick={() => selectRow(party)}
            onkeydown={(event) => onRowKeydown(event, party)}
          >
            <div class="manager-travel-parties-left">
              {#if party.travelActor?.img}
                <img class="manager-travel-parties-thumb" src={party.travelActor.img} alt="" />
              {:else}
                <span class="manager-travel-parties-thumb manager-travel-parties-thumb-fallback" aria-hidden="true">
                  <i class="fas fa-user"></i>
                </span>
              {/if}
              <span class="manager-travel-parties-name">{party.name}</span>
              <span class={`manager-chip ${party.enabled ? 'is-active' : 'is-disabled'}`}>
                {party.enabled
                  ? text('FABRICATE.Admin.Manager.Travel.EnabledChip', 'Enabled')
                  : text('FABRICATE.Admin.Manager.Travel.DisabledChip', 'Disabled')}
              </span>
              <span class="manager-chip is-neutral manager-travel-parties-members-chip" title={memberCountLabel(party)} aria-label={memberCountLabel(party)}>
                <i class="fas fa-users" aria-hidden="true"></i>
                <span>{party.memberCount ?? 0}</span>
              </span>
            </div>

            <div class="manager-travel-parties-right">
              <RegionOverridePicker
                value={overrideValue(party)}
                regions={systemRegions}
                onChoose={(regionId) => chooseOverride(party, regionId)}
              />

              <span class="manager-travel-parties-chevron" aria-hidden="true">
                <i class={isExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'}></i>
              </span>
            </div>
          </div>

          {#if isExpanded}
            <div class="manager-travel-parties-editor" data-manager-travel-party-editor></div>
          {/if}
        </div>
      {/each}
    </div>

    <Pagination
      totalCount={filteredParties.length}
      pageSize={PAGE_SIZE}
      {pageIndex}
      pageSizeOptions={[PAGE_SIZE]}
      onPageChange={(next) => pageIndex = next}
    />
  {/if}
</div>
