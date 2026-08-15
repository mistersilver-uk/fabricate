<!-- Svelte 5 runes mode -->
<!--
  Manager — World > Parties. A paged, searchable list of CARDS, one per party, each
  fully expanded: there is no accordion any more.

  This pane owns its own scroll, as the prototype does, so the intro, search bar and
  match counter scroll away with a tall page. The pager is a sibling footer outside that
  scroller: it stays visible, spans the whole content area and never covers a card.

  Store validation errors are routed to the CARD that issued the failing mutation:
  the pane records that party id and hands the duplicate-member message to its member
  list and the duplicate-travel-actor message to its travel-actor panel. An error with
  no field context — every rejected ENABLE takes that path — renders once above the
  list, as does a field error whose card is no longer on the page.
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import PartyExpandedBody from './PartyExpandedBody.svelte';
  import { localize } from '../../util/foundryBridge.js';

  let {
    parties = [],
    systemId = '',
    systemRealms = [],
    actorOptions = [],
    saving = false,
    travelError = null,
    travelFieldErrors = {},
    // Root always supplies the real selected-system gate. Defaulting to available preserves
    // this component's established direct-mount/API behaviour for isolated consumers.
    realmOverridesAvailable = true,
    realmOverridesUnavailableHint = '',
    onCreateParty = () => {},
    onSetRealmOverride = () => {},
    onClearRealmOverride = () => {},
    onRenameParty = () => {},
    onSetPartyEnabled = () => {},
    onDeleteParty = () => {},
    onAddMember = () => {},
    onRemoveMember = () => {},
    onMoveMember = () => {},
    onSetTravelActor = () => {},
    onClearTravelActor = () => {},
  } = $props();

  const PAGE_SIZE_OPTIONS = [2, 4, 6, 10];

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(4);
  let scroller = $state(null);
  // Bumped on every page / page-size change; each card watches it and shuts any open
  // travel-actor picker, move drawer or add panel.
  let closeToken = $state(0);
  // `_travelErrorState` carries no party id, so which card issued the failing mutation
  // is component-held state.
  let errorPartyId = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const showSearch = $derived(parties.length > 1);

  // Dropping below two parties unmounts the search bar, so the query must go with it:
  // otherwise deleting a party while a filter is active strands the pane in the
  // no-match state with no control left that can clear it.
  $effect(() => {
    if (!showSearch && searchTerm !== '') searchTerm = '';
  });

  function matchesQuery(party, needle) {
    if (
      String(party.name || '')
        .toLowerCase()
        .includes(needle)
    )
      return true;
    if (
      String(party.travelActor?.name || '')
        .toLowerCase()
        .includes(needle)
    )
      return true;
    return (party.memberCards || []).some((member) =>
      String(member.name || '')
        .toLowerCase()
        .includes(needle)
    );
  }

  const normalizedSearch = $derived(searchTerm.trim().toLowerCase());
  const filteredParties = $derived(
    normalizedSearch ? parties.filter((party) => matchesQuery(party, normalizedSearch)) : parties
  );

  // Keep the page index in range as the filtered set shrinks.
  $effect(() => {
    if (pageIndex > 0 && pageIndex * pageSize >= filteredParties.length) {
      pageIndex = 0;
    }
  });

  const pagedParties = $derived(
    filteredParties.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
  );

  const memberError = $derived(travelFieldErrors?.members || '');
  const travelActorError = $derived(travelFieldErrors?.travelActor || '');
  const hasFieldError = $derived(!!memberError || !!travelActorError);
  const errorCardOnPage = $derived(pagedParties.some((party) => party.id === errorPartyId));
  const paneError = $derived(
    travelError && (!hasFieldError || !errorCardOnPage) ? travelError : ''
  );

  const matchCountLabel = $derived(
    text('FABRICATE.Admin.Manager.World.Parties.Search.Count', '{matched} of {total}')
      .replace('{matched}', String(filteredParties.length))
      .replace('{total}', String(parties.length))
  );

  const noMatchHint = $derived(
    text(
      'FABRICATE.Admin.Manager.World.Parties.NoMatch',
      'No party, member or travel actor matches “{query}”.'
    ).replace('{query}', searchTerm.trim())
  );

  function scrollPaneToTop() {
    if (!scroller) return;
    scroller.scrollTop = 0;
  }

  function resetToFirstPage() {
    pageIndex = 0;
    scrollPaneToTop();
  }

  function onSearchInput(event) {
    searchTerm = event.currentTarget.value;
    resetToFirstPage();
  }

  function goToPage(next) {
    pageIndex = next;
    closeToken += 1;
    scrollPaneToTop();
  }

  function changePageSize(next) {
    pageSize = next;
    closeToken += 1;
    resetToFirstPage();
  }

  // Every card mutation records its own party id first, so a rejection lands on the
  // card that caused it and on no other.
  function note(partyId) {
    errorPartyId = partyId;
  }
</script>

<div
  class="manager-travel-parties"
  id="travel-panel-parties"
  role="region"
  aria-labelledby="manager-world-nav-parties"
  data-travel-panel="parties"
>
  <div class="manager-travel-parties-content" bind:this={scroller}>
    <p class="manager-travel-parties-intro">
      {text(
        'FABRICATE.Admin.Manager.World.Parties.Intro',
        'Parties belong to the world, not to a crafting system. Gathering and travel both read them, in every system. A character belongs to one enabled party at a time, and can be moved between them. A party needs one travel actor before it can be enabled: a single actor that stands for the whole party on the map.'
      )}
    </p>

    {#if parties.length === 0}
      <EmptyState
        icon="fas fa-users"
        title={text('FABRICATE.Admin.Manager.World.Parties.Empty.Title', 'No parties yet')}
        hint={text(
          'FABRICATE.Admin.Manager.World.Parties.Empty.Body',
          'Gathering still runs: a character in no party has no current realm, so ungated environments stay open and location-gated ones stay out of reach. Create a party when you want realm gating to apply.'
        )}
        dataAttr="data-travel-parties-none"
      >
        <button
          type="button"
          class="manager-travel-parties-create"
          data-manager-party-create
          disabled={saving}
          onclick={() => onCreateParty()}
        >
          <i class="fas fa-plus" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.World.Parties.Empty.Action', 'Create a party')}</span
          >
        </button>
      </EmptyState>
    {:else}
      {#if showSearch}
        <div class="manager-travel-parties-search">
          <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
          <input
            class="manager-travel-parties-query"
            type="search"
            value={searchTerm}
            oninput={onSearchInput}
            placeholder={text(
              'FABRICATE.Admin.Manager.World.Parties.Search.Placeholder',
              'Search by party, member or travel actor'
            )}
            aria-label={text(
              'FABRICATE.Admin.Manager.World.Parties.Search.Label',
              'Search parties'
            )}
            aria-describedby="manager-world-parties-match-count"
          />
          <span
            class="manager-travel-parties-count"
            id="manager-world-parties-match-count"
            data-manager-party-match-count
            aria-live="polite"
          >
            {matchCountLabel}
          </span>
        </div>
      {/if}

      {#if paneError}
        <p
          class="manager-travel-parties-summary-error"
          data-manager-party-summary-error
          role="alert"
        >
          {paneError}
        </p>
      {/if}

      {#if filteredParties.length === 0}
        <EmptyState filtered hint={noMatchHint} dataAttr="data-travel-parties-no-match" />
      {:else}
        <div
          class="manager-travel-parties-list"
          role="list"
          aria-label={text('FABRICATE.Admin.Manager.World.Parties.ListLabel', 'Parties')}
        >
          {#each pagedParties as party (party.id)}
            <div
              class="manager-travel-parties-row"
              class:is-disabled={party.enabled !== true}
              role="listitem"
              data-manager-travel-party-id={party.id}
            >
              <PartyExpandedBody
                {party}
                {parties}
                {actorOptions}
                {saving}
                {systemId}
                {systemRealms}
                {closeToken}
                {realmOverridesAvailable}
                {realmOverridesUnavailableHint}
                memberError={errorPartyId === party.id ? memberError : ''}
                travelActorError={errorPartyId === party.id ? travelActorError : ''}
                onRename={(id, name) => {
                  note(id);
                  onRenameParty(id, name);
                }}
                onSetEnabled={(id, enabled) => {
                  note(id);
                  onSetPartyEnabled(id, enabled);
                }}
                onDelete={(id) => {
                  note(id);
                  onDeleteParty(id);
                }}
                onAddMember={(id, uuid) => {
                  note(id);
                  onAddMember(id, uuid);
                }}
                onRemoveMember={(id, uuid) => {
                  note(id);
                  onRemoveMember(id, uuid);
                }}
                onMoveMember={(from, to, uuid) => {
                  note(from);
                  onMoveMember(from, to, uuid);
                }}
                onSetTravelActor={(id, uuid) => {
                  note(id);
                  onSetTravelActor(id, uuid);
                }}
                onClearTravelActor={(id) => {
                  note(id);
                  onClearTravelActor(id);
                }}
                onSetRealmOverride={(id, sys, ids) => {
                  note(id);
                  onSetRealmOverride(id, sys, ids);
                }}
                onClearRealmOverride={(id, sys) => {
                  note(id);
                  onClearRealmOverride(id, sys);
                }}
              />
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  {#if filteredParties.length > 0}
    <div class="manager-travel-parties-pagination" data-manager-party-pagination>
      <!-- This footer deliberately sits OUTSIDE `.manager-travel-parties-content`: the
           content scrolls, while the pagination controls remain in a full-width sibling
           bar like the other manager studios. -->
      <Pagination
        persistent={true}
        totalCount={filteredParties.length}
        {pageSize}
        {pageIndex}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
      />
    </div>
  {/if}
</div>

<style>
  /* Theme-ROOT tokens only (`--fab-mv2-*` is declared on `.fabricate-manager`). The
     content child is the pane's scroller; the paginator remains its sibling below. */
  .manager-travel-parties {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .manager-travel-parties-content {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    padding: 14px 18px 26px;
    overflow: auto;
  }

  .manager-travel-parties-intro {
    margin: 0 0 13px;
    color: var(--fab-text-muted);
    font-family: var(--font-primary);
    font-size: 11px;
    font-weight: 400;
    line-height: 1.6;
  }

  .manager-travel-parties-search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    margin-bottom: 11px;
    padding: 0 11px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-0);
  }

  .manager-travel-parties-search > i {
    color: var(--fab-text-subtle);
    font-size: 10px;
  }

  input.manager-travel-parties-query {
    flex: 1;
    min-width: 0;
    min-height: 0;
    padding: 0;
    border: none;
    color: var(--fab-text);
    background: transparent;
    font-family: var(--font-primary);
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-travel-parties-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9.5px;
    font-weight: 500;
  }

  .manager-travel-parties-summary-error {
    margin: 0 0 11px;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-danger-border);
    border-radius: 8px;
    color: var(--fab-danger-text);
    background: var(--fab-danger-soft);
    font-family: var(--font-primary);
    font-size: 11px;
    font-weight: 500;
  }

  .manager-travel-parties-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .manager-travel-parties-row {
    padding: 13px;
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    background: var(--fab-bg-2);
  }

  .manager-travel-parties-row.is-disabled {
    border-color: var(--fab-border-strong);
  }

  .manager-travel-parties-create {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 15px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 8px;
    color: var(--fab-on-accent);
    background: var(--fab-accent);
    font-family: var(--font-primary);
    font-size: 11.5px;
    font-weight: 700;
  }

  .manager-travel-parties-create > i {
    font-size: 10px;
  }
</style>
