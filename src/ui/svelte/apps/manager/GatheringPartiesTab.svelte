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
    and the party's current region plus a searchable region-override popover on
    the right (a dropdown does not scale to games with many regions).
  - The expanded accordion body is intentionally empty for now.

  Uses a `.manager-travel-parties-*` (plural) class namespace to stay clear of
  the legacy `.manager-travel-party-*` rules from the superseded travel view,
  and reuses the shared `.manager-travel-picker`/`-popover` picker styling.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';
  import { dismissOnOutsideClick } from '../../actions/dismissOnOutsideClick.js';
  import Pagination from '../../components/Pagination.svelte';

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
  let openOverridePartyId = $state('');
  let overrideSearch = $state('');
  let overrideSearchInput = $state(null);

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

  const normalizedOverrideSearch = $derived(overrideSearch.trim().toLowerCase());
  const filteredOverrideRegions = $derived(
    normalizedOverrideSearch
      ? systemRegions.filter(region => String(region.name || '').toLowerCase().includes(normalizedOverrideSearch))
      : systemRegions
  );

  // Focus the override search field when its popover opens.
  $effect(() => {
    if (openOverridePartyId && overrideSearchInput) overrideSearchInput.focus();
  });

  function selectRow(party) {
    onSelectParty(party.id === selectedPartyId ? '' : party.id);
    closeOverride();
  }

  function onRowKeydown(event, party) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    selectRow(party);
  }

  function toggleOverride(event, party) {
    event.stopPropagation();
    if (openOverridePartyId === party.id) {
      closeOverride();
    } else {
      openOverridePartyId = party.id;
      overrideSearch = '';
    }
  }

  function closeOverride() {
    openOverridePartyId = '';
    overrideSearch = '';
  }

  function chooseOverride(party, regionId) {
    if (regionId) {
      onSetRegionOverride(party.id, systemId, [regionId]);
    } else {
      onClearRegionOverride(party.id, systemId);
    }
    closeOverride();
  }

  function regionNameById(regionId) {
    return systemRegions.find(region => region.id === regionId)?.name || '';
  }

  function overrideTriggerLabel(party) {
    if (party?.overrideMode === 'manual' && Array.isArray(party.overrideRegionIds) && party.overrideRegionIds.length > 0) {
      return regionNameById(party.overrideRegionIds[0])
        || text('FABRICATE.Admin.Manager.Travel.Parties.OverrideStale', 'Unknown region');
    }
    return text('FABRICATE.Admin.Manager.Travel.Parties.OverrideAuto', 'Auto');
  }

  function currentRegionLabel(party) {
    const regions = party?.currentRegionEvidence?.regions || [];
    if (regions.length === 0) {
      return text('FABRICATE.Admin.Manager.Travel.Parties.NoCurrentRegion', 'No current region');
    }
    return regions.map(region => region.name).filter(Boolean).join(', ');
  }

  function modeChipLabel(party) {
    return party?.overrideMode === 'manual'
      ? text('FABRICATE.Admin.Manager.Travel.Parties.ModeManual', 'Manual')
      : text('FABRICATE.Admin.Manager.Travel.Parties.ModeAuto', 'Auto');
  }

  function isCurrentOverride(party, regionId) {
    return party?.overrideMode === 'manual'
      && Array.isArray(party.overrideRegionIds)
      && party.overrideRegionIds.includes(regionId);
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
              <span class="manager-chip is-neutral manager-travel-parties-mode-chip">
                <i class={party.overrideMode === 'manual' ? 'fas fa-hand-pointer' : 'fas fa-wand-magic-sparkles'} aria-hidden="true"></i>
                <span>{modeChipLabel(party)}</span>
              </span>
            </div>

            <div class="manager-travel-parties-right">
              <span class="manager-travel-parties-current-region" title={currentRegionLabel(party)}>
                {currentRegionLabel(party)}
              </span>

              <div
                class="manager-travel-picker manager-travel-parties-override"
                use:dismissOnOutsideClick={{ enabled: openOverridePartyId === party.id, onDismiss: closeOverride }}
              >
                <button
                  type="button"
                  class="manager-button manager-travel-picker-trigger manager-travel-parties-override-trigger"
                  aria-haspopup="dialog"
                  aria-expanded={openOverridePartyId === party.id}
                  aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}
                  onclick={(event) => toggleOverride(event, party)}
                  onkeydown={(event) => event.stopPropagation()}
                >
                  <i class="fas fa-location-crosshairs" aria-hidden="true"></i>
                  <span>{overrideTriggerLabel(party)}</span>
                  <i class={openOverridePartyId === party.id ? 'fas fa-chevron-up' : 'fas fa-chevron-down'} aria-hidden="true"></i>
                </button>

                {#if openOverridePartyId === party.id}
                  <div
                    class="manager-travel-popover"
                    role="dialog"
                    aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}
                    onclick={(event) => event.stopPropagation()}
                    onkeydown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeOverride(); } }}
                  >
                    <div class="manager-travel-popover-search">
                      <input
                        bind:this={overrideSearchInput}
                        bind:value={overrideSearch}
                        type="text"
                        placeholder={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchPlaceholder', 'Search regions...')}
                        aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideSearchLabel', 'Search regions')}
                      />
                    </div>
                    <div class="manager-travel-popover-options" role="listbox" aria-label={text('FABRICATE.Admin.Manager.Travel.Parties.OverrideLabel', 'Current region override')}>
                      <button
                        type="button"
                        class="manager-travel-option"
                        role="option"
                        aria-selected={party.overrideMode !== 'manual'}
                        onclick={() => chooseOverride(party, null)}
                      >
                        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
                        <span class="manager-travel-option-name">{text('FABRICATE.Admin.Manager.Travel.Parties.OverrideAuto', 'Auto')}</span>
                      </button>
                      {#each filteredOverrideRegions as region (region.id)}
                        <button
                          type="button"
                          class="manager-travel-option"
                          role="option"
                          aria-selected={isCurrentOverride(party, region.id)}
                          title={region.name}
                          onclick={() => chooseOverride(party, region.id)}
                        >
                          <i class="fas fa-map-location-dot" aria-hidden="true"></i>
                          <span class="manager-travel-option-name">{region.name}</span>
                          {#if !region.enabled}
                            <span class="manager-chip is-disabled">{text('FABRICATE.Admin.Manager.Travel.Parties.OverrideDisabledSuffix', '(disabled)')}</span>
                          {/if}
                        </button>
                      {:else}
                        <p class="manager-travel-empty-hint">{text('FABRICATE.Admin.Manager.Travel.Parties.NoRegionMatches', 'No regions match your search.')}</p>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

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
