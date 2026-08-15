<!-- Svelte 5 runes mode -->
<!--
  The in-flow "add a member" panel on a World > Parties card.

  Deliberately NOT a `SearchablePopover`: the prototype's panel is a block in the
  member column that grows the card, and a portaled popover cannot express that.

  It keeps Fabricate's THREE distinct empty reasons, which issue 1024 separated on
  purpose and which the prototype collapses into one (wrong) sentence:
    1. no player-character actors are configured at all — names the module setting;
    2. every configured character is already a member of this party;
    3. the search matches none of the remaining candidates.

  Membership comes from the projected `isPlayerCharacter` flag the manager app
  computes from the GM-configured actor types, tested STRICTLY (`=== true`): a
  `!== false` test would admit every NPC in a world whose projection ever regressed.
  Only ONE fixture shape can tell the two predicates apart — an actor carrying no
  `isPlayerCharacter` KEY, which `=== true` rejects and `!== false` admits — so the
  candidate-annotation test in `tests/components/party-expanded-body.test.js` keeps an
  unprojected actor in its actor list for exactly that purpose (issue 1024). Every
  `isPlayerCharacter: false` fixture is excluded by both and guards nothing.

  Choosing a candidate who already belongs to another party is the MOVE path — the
  store confirms and moves rather than adding a second membership, because an actor
  may be associated with at most one enabled party.
-->
<script>
  import { localize } from '../../util/foundryBridge.js';

  let {
    partyName = '',
    actorOptions = [],
    memberUuids = [],
    otherPartyNameByUuid = {},
    saving = false,
    // The id of the card's duplicate-member error, when one is live. It lands on this
    // panel's `role="group"` root because THIS panel is what a rejected add leaves on
    // screen: the card's other two anchors — the member `<ul>` and the closed-panel add
    // button — are each absent in exactly that state on a zero-member party, which would
    // orphan the message the add attempt produced.
    describedById = '',
    onAdd = () => {},
    onClose = () => {},
  } = $props();

  let query = $state('');

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const memberSet = $derived(new Set(memberUuids));
  const playerCharacters = $derived(
    actorOptions.filter((actor) => actor.isPlayerCharacter === true)
  );
  const available = $derived(playerCharacters.filter((actor) => !memberSet.has(actor.uuid)));
  const normalizedQuery = $derived(query.trim().toLowerCase());
  const candidates = $derived(
    normalizedQuery
      ? available.filter((actor) =>
          String(actor.name || '')
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : available
  );

  // THREE reasons, in precedence order. Which one shows is the whole point.
  const emptyReason = $derived.by(() => {
    if (candidates.length > 0) return '';
    if (playerCharacters.length === 0)
      return text(
        'FABRICATE.Admin.Manager.World.Parties.Members.NoActorsConfigured',
        'No player-character actors are available to add. Fabricate counts the actor types listed under Player Character Actor Types in its module settings — add yours there if a character is missing.'
      );
    if (available.length === 0)
      return text(
        'FABRICATE.Admin.Manager.World.Parties.Members.AllAlreadyMembers',
        'Every character is already in this party.'
      );
    return text(
      'FABRICATE.Admin.Manager.World.Parties.Members.NoAddMatches',
      'No characters match your search.'
    );
  });

  const emptyReasonKind = $derived.by(() => {
    if (candidates.length > 0) return '';
    if (playerCharacters.length === 0) return 'no-actors-configured';
    if (available.length === 0) return 'all-already-members';
    return 'no-search-match';
  });

  function candidateMeta(actor) {
    const otherParty = otherPartyNameByUuid[actor.uuid];
    if (otherParty) {
      return text(
        'FABRICATE.Admin.Manager.World.Parties.Members.CandidateInParty',
        'In {name} — adding moves them'
      ).replace('{name}', otherParty);
    }
    return text('FABRICATE.Admin.Manager.World.Parties.Members.CandidateUnassigned', 'In no party');
  }
</script>

<div
  class="manager-party-add-panel"
  data-manager-party-add
  role="group"
  aria-label={text(
    'FABRICATE.Admin.Manager.World.Parties.Members.AddPanelLabel',
    'Add a member to {name}'
  ).replace('{name}', partyName)}
  aria-describedby={describedById || undefined}
>
  <div class="manager-party-add-search">
    <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
    <input
      class="manager-party-add-query"
      type="search"
      bind:value={query}
      placeholder={text(
        'FABRICATE.Admin.Manager.World.Parties.Members.AddSearchPlaceholder',
        'Search characters'
      )}
      aria-label={text(
        'FABRICATE.Admin.Manager.World.Parties.Members.AddSearchLabel',
        'Search characters to add'
      )}
    />
    <button type="button" class="manager-party-add-done" onclick={() => onClose()}>
      {text('FABRICATE.Admin.Manager.World.Parties.Members.AddDone', 'Done')}
    </button>
  </div>

  <div class="manager-party-add-list">
    {#each candidates as actor (actor.uuid)}
      <button
        type="button"
        class="manager-party-add-candidate"
        data-manager-party-candidate={actor.uuid}
        disabled={saving}
        onclick={() => onAdd(actor.uuid)}
      >
        <!-- ONE fixed tile holding EITHER the portrait or the fallback glyph, which is
             `PartyMemberRow.svelte:117-119`'s shape. Rendered as two SIBLING leading
             elements of different widths (a 20px span, a 14px `<i>`) the candidate names
             in a mixed portrait set start at two different indents down one list. -->
        <span class="manager-party-add-portrait" aria-hidden="true">
          {#if actor.img}<img src={actor.img} alt="" />{:else}<i class="fas fa-user"></i>{/if}
        </span>
        <span class="manager-party-add-copy">
          <span class="manager-party-add-name">{actor.name}</span>
          <span class="manager-party-add-meta">{candidateMeta(actor)}</span>
        </span>
        <i class="fas fa-plus manager-party-add-plus" aria-hidden="true"></i>
      </button>
    {/each}
    {#if emptyReason}
      <p class="manager-party-add-empty" data-manager-party-add-empty={emptyReasonKind}>
        {emptyReason}
      </p>
    {/if}
  </div>
</div>

<style>
  /* Theme-ROOT tokens only. Prototype geometry: accent-bordered radius-10 panel on
     `--fab-bg-1`, a 30px search row, and a 190px scrolling candidate list. */
  .manager-party-add-panel {
    padding: 10px;
    border: 1px solid var(--fab-accent-border);
    border-radius: 10px;
    background: var(--fab-bg-1);
  }

  .manager-party-add-search {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    margin-bottom: 8px;
    padding: 0 10px;
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    background: var(--fab-bg-0);
  }

  .manager-party-add-search > i {
    color: var(--fab-text-subtle);
    font-size: 10px;
  }

  /* `align-self: stretch` with `height: auto` pins the input to the 30px ROW. Foundry
     core gives every input `height: var(--input-height)` (~32px), which overflows the
     row top and bottom — invisible until focus, when the ring is drawn around the
     overflowing box rather than around the field a GM can see. */
  input.manager-party-add-query {
    flex: 1;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    height: auto;
    padding: 0;
    border: none;
    color: var(--fab-text);
    background: transparent;
    font-family: var(--font-primary);
    font-size: 11.5px;
    font-weight: 500;
  }

  .manager-party-add-done {
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    color: var(--fab-text-subtle);
    background: none;
    font-family: var(--font-primary);
    font-size: 10px;
    font-weight: 600;
  }

  .manager-party-add-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 190px;
    overflow: auto;
  }

  .manager-party-add-candidate {
    display: flex;
    align-items: center;
    gap: 9px;
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--fab-border);
    border-radius: 8px;
    background: var(--fab-bg-2);
    text-align: left;
  }

  .manager-party-add-candidate:hover {
    border-color: var(--fab-accent-border);
    background: var(--fab-surface-soft);
  }

  /* The tile is the row's ONLY leading element, portrait or not, so every candidate name
     starts at the same indent. It carries no fill: the fallback glyph is framed by the
     row, which already has one. */
  .manager-party-add-portrait {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    color: var(--fab-text-muted);
    font-size: 10px;
    overflow: hidden;
  }

  .manager-party-add-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .manager-party-add-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .manager-party-add-name {
    overflow: hidden;
    color: var(--fab-text);
    font-family: var(--font-primary);
    font-size: 11.5px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-party-add-meta {
    overflow: hidden;
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 9.5px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The row's one direct `<i>` child, now that the leading glyph lives inside the portrait
     tile — so this needs no specificity workaround to outrank a leading-glyph rule. */
  .manager-party-add-plus {
    flex: 0 0 auto;
    color: var(--fab-text-subtle);
    font-size: 9px;
  }

  .manager-party-add-empty {
    margin: 0;
    padding: 12px;
    color: var(--fab-text-subtle);
    font-family: var(--font-primary);
    font-size: 10.5px;
    font-weight: 400;
    line-height: 1.5;
    text-align: center;
  }
</style>
