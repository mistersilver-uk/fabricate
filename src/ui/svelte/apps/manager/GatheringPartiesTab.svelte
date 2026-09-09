<!-- Svelte 5 runes mode -->
<!--
  Manager — World > Parties. A paged, searchable list of CARDS, one per party, each
  fully expanded: there is no accordion any more.

  This pane owns its own scroll, as the prototype does, so the intro, search bar and
  match counter scroll away with a tall page. The pager is a squared-off, full-bleed
  sibling footer outside that scroller: it stays visible, spans the whole content area,
  never covers a card, and appears only once the matched set reaches the smallest page
  size (three).

  Store validation errors are routed to the CARD that issued the failing mutation:
  the pane records that party id and hands the duplicate-member message to its member
  list and the duplicate-travel-actor message to its travel-actor panel. An error with
  no field context — every rejected ENABLE takes that path — renders once above the
  list, as does a field error whose card is no longer on the page.
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import Notice from '../../components/Notice.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import PartyExpandedBody from './PartyExpandedBody.svelte';
  import { tick } from 'svelte';
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

  // A party card is TALL — head, member list, add control and a travel-actor column —
  // so the page sizes step in threes rather than the manager's usual 10/25/50 table
  // rhythm, and the smallest is also the threshold at which the footer appears.
  const PAGE_SIZE_OPTIONS = [3, 6, 9];
  // DERIVED, not restated. The rule is "the footer appears at the smallest offered size";
  // a second literal could drift from the first and only the page-size list would notice.
  const PAGER_THRESHOLD = PAGE_SIZE_OPTIONS[0];

  let searchTerm = $state('');
  let pageIndex = $state(0);
  let pageSize = $state(3);
  let scroller = $state(null);
  // Bumped on every page / page-size change; each card watches it and shuts any open
  // travel-actor picker, move drawer or add panel.
  let closeToken = $state(0);
  // `_travelErrorState` carries no party id, so which card issued the failing mutation
  // is component-held state.
  let errorPartyId = $state('');
  // Confirmation-bearing actions return `false` both when the GM cancels and when a real store
  // attempt fails validation. While one is pending, a saving pulse or changed error state proves
  // the action crossed the confirmation boundary; without either signal, `false` means cancel and
  // the pre-existing error must stay attributed to its original card.
  let pendingActionId = $state(0);
  let pendingPreviousPartyId = $state('');
  let pendingErrorSignature = $state('');
  let pendingActionExecuted = $state(false);

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

  // The footer appears at the smallest page size and not before. Under it there is one
  // page by construction, so a full pager bar would be three inert controls stating
  // "Showing 1–2 of 2 · Page 1 of 1" — chrome describing a list the GM can already see
  // in full. It is gated on the FILTERED set, the same set every number in the bar
  // counts, so the bar never outlives the rows it describes.
  const showPager = $derived(filteredParties.length >= PAGER_THRESHOLD);

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

  // `ManagerSearchField` hands its caller the NEXT VALUE rather than the event (issue 1515);
  // it has already written the string, so this only has to react to it.
  function onSearchInput(next) {
    searchTerm = next;
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

  function errorSignature() {
    return JSON.stringify([travelError, travelFieldErrors || {}]);
  }

  $effect(() => {
    if (!pendingActionId) return;
    if (saving || errorSignature() !== pendingErrorSignature) {
      pendingActionExecuted = true;
    }
  });

  function noteConfirmedAction(partyId, action) {
    pendingActionId += 1;
    const actionId = pendingActionId;
    pendingPreviousPartyId = errorPartyId;
    pendingErrorSignature = errorSignature();
    pendingActionExecuted = false;
    const result = action();
    if (!result || typeof result.then !== 'function') {
      if (result !== false) errorPartyId = partyId;
      return result;
    }
    return result.then(async (resolved) => {
      await tick();
      if (pendingActionId !== actionId) return resolved;
      errorPartyId = resolved !== false || pendingActionExecuted ? partyId : pendingPreviousPartyId;
      pendingActionId = 0;
      return resolved;
    });
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
        'Parties belong to the world, not to a crafting system. Gathering and travel both read them, in every system. A character belongs to one enabled party at a time, and can be moved between them. A travel actor is the single actor that stands for the whole party on the map; a party without one is still a party, it simply has no current realm.'
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
        <!-- THE SHARED SEARCH FIELD (issue 1515), which `ManagerSearchField`'s own docblock
             listed as one of five hand-rolled twins it declined to convert because doing so
             "would be a re-skin rather than a conversion — a change with visible output and its
             own review". This is that review: the row was a bordered 32px box holding a
             `fa-magnifying-glass` and a borderless `<input>`, restating the shipped pill's
             geometry in a second place at a second set of numbers.

             WHAT THE ROW STILL OWNS IS THE MATCH COUNTER. The primitive is the field and
             nothing else, so this element keeps its flex layout and its trailing live region —
             the pane's only announcement that a query narrowed the list — and drops the border,
             the height, the corner and the fill the field now paints for itself.

             THE INPUT KEEPS BOTH OF ITS OWN ATTRIBUTES through `inputAttrs`, because the rest
             spread belongs to the `<label>`: the capture hook the View Lab case types into, and
             the `aria-describedby` that ties the field to that counter. -->
        <div class="manager-travel-parties-search">
          <ManagerSearchField
            value={searchTerm}
            onInput={onSearchInput}
            placeholder={text(
              'FABRICATE.Admin.Manager.World.Parties.Search.Placeholder',
              'Search by party, member or travel actor'
            )}
            ariaLabel={text('FABRICATE.Admin.Manager.World.Parties.Search.Label', 'Search parties')}
            inputAttrs={{
              'data-manager-party-search': '',
              'aria-describedby': 'manager-world-parties-match-count',
            }}
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

      <!-- THE PANE'S REFUSAL BANNER IS THE SHARED NOTICE (issue 1515). It already carried
           `role="alert"`, and `openspec/specs/design-system/spec.md` routes a strip carrying
           that role to a BLOCKING notice — the one form that keeps it — so this is a conversion
           rather than a re-decision. The bespoke `<p>` restated the primitive's danger edge,
           fill, corner and ink at its own numbers; what it could not restate is the glyph and
           the type scale, which is why the two looked like two different things. -->
      {#if paneError}
        <div class="manager-travel-parties-summary">
          <Notice
            blocking
            tone="danger"
            title={paneError}
            dataAttr="data-manager-party-summary-error"
          />
        </div>
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
                  void noteConfirmedAction(id, () => onDeleteParty(id));
                }}
                onAddMember={(id, uuid) => {
                  void noteConfirmedAction(id, () => onAddMember(id, uuid));
                }}
                onRemoveMember={(id, uuid) => {
                  note(id);
                  onRemoveMember(id, uuid);
                }}
                onMoveMember={(from, to, uuid) => {
                  void noteConfirmedAction(from, () => onMoveMember(from, to, uuid));
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

  {#if showPager}
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
  /* Theme-ROOT tokens only (`--fab-manager-*` is declared inside `.fabricate-manager`). The
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

  /* THE ROW IS LAYOUT NOW AND NOTHING ELSE (issue 1515). It used to BE the field — a bordered
     32px box on `--fab-bg-0` at an 8px corner, holding a bare glyph and a borderless input
     pinned to its height because Foundry core gives every input an `--input-height` that
     overflows a hand-built row. `ManagerSearchField` paints all of that, at the shipped 34px
     rung, so what is left here is a flex row holding the field and the match counter. */
  .manager-travel-parties-search {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 11px;
  }

  .manager-travel-parties-count {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-family: var(--fab-font-mono);
    font-size: 9.5px;
    font-weight: 500;
  }

  /* The refusal banner's SLOT. `<Notice>` paints its own edge, fill, corner, glyph and type
     and declares `margin: 0`, because separation from what sits beneath a notice is the
     caller's layout — so this rule is the caller's layout and nothing else, at the same 11px
     the bespoke `<p>` it replaces put between itself and the first card. */
  .manager-travel-parties-summary {
    margin: 0 0 11px;
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
