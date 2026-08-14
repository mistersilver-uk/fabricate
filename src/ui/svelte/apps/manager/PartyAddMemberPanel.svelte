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
  `!== false` test would admit every NPC in a world whose projection ever regressed,
  pass every fixture, and trip no gate.

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
        {#if actor.img}
          <span class="manager-party-add-portrait" aria-hidden="true"
            ><img src={actor.img} alt="" /></span
          >
        {:else}
          <i class="fas fa-user" aria-hidden="true"></i>
        {/if}
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

  input.manager-party-add-query {
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

  .manager-party-add-candidate > i {
    flex: 0 0 auto;
    width: 14px;
    color: var(--fab-text-muted);
    font-size: 11px;
  }

  .manager-party-add-portrait {
    display: inline-flex;
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border-radius: 6px;
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

  /* Written as a descendant of the row so it outranks the leading-glyph rule above,
     which also matches this element as a direct `i` child. */
  .manager-party-add-candidate > i.manager-party-add-plus {
    width: auto;
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
