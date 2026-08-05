<!-- Svelte 5 runes mode -->
<!--
  The Knowledge surface's searchable character roster (issue 785). Player
  characters only — the same roster the Access surface uses — with no
  show-NPCs toggle; an NPC's knowledge state stays reachable through the
  `game.fabricate.resetActorKnowledge` API.

  Each row is a REAL button carrying the actor's portrait (`Medallion`, 34px,
  decorative `alt=""` because the name is adjacent text), the name, and an
  "N item(s) · M learned" meta line. A character with nothing tracked renders a
  dimmed "Nothing tracked" meta instead.

  Props:
   - characters: already-filtered roster rows.
   - totalCount: unfiltered roster size (drives the empty-vs-no-match branch).
   - selectedActorId, searchTerm.
   - onSearch(term), onSelect(actorId).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../EmptyState.svelte';
  import Medallion from '../../../components/Medallion.svelte';

  let {
    characters = [],
    totalCount = 0,
    selectedActorId = '',
    searchTerm = '',
    onSearch = () => {},
    onSelect = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function metaFor(character) {
    return text(
      'FABRICATE.Admin.Manager.Knowledge.RosterMeta',
      '{items} item(s) · {learned} learned'
    )
      .replace('{items}', String(character?.itemCount ?? 0))
      .replace('{learned}', String(character?.learnedCount ?? 0));
  }
</script>

<section
  class="manager-knowledge-roster"
  aria-label={text('FABRICATE.Admin.Manager.Knowledge.RosterLabel', 'Characters')}
>
  <!-- The `flex: 0 0 auto` roster override is authored against
       `.manager-knowledge-roster .manager-search`, alongside the Access roster's
       identical one, so this needs no class of its own. -->
  <label class="manager-search">
    <i class="fas fa-search" aria-hidden="true"></i>
    <input
      type="search"
      value={searchTerm}
      oninput={(event) => onSearch(event.currentTarget.value)}
      placeholder={text(
        'FABRICATE.Admin.Manager.Knowledge.SearchPlaceholder',
        'Search characters...'
      )}
      aria-label={text('FABRICATE.Admin.Manager.Knowledge.SearchLabel', 'Search characters')}
      data-knowledge-search
    />
  </label>

  <div class="manager-knowledge-roster-scroll">
    {#if totalCount === 0}
      <EmptyState
        compact
        icon="fas fa-user-slash"
        title={text('FABRICATE.Admin.Manager.Knowledge.RosterEmptyTitle', 'No player characters')}
        hint={text(
          'FABRICATE.Admin.Manager.Knowledge.RosterEmptyHint',
          'Assign a player character in this world to audit its recipe knowledge.'
        )}
      />
    {:else if characters.length === 0}
      <EmptyState
        compact
        icon="fas fa-search"
        title={text(
          'FABRICATE.Admin.Manager.Knowledge.RosterNoMatchTitle',
          'No characters match this search'
        )}
        hint={text(
          'FABRICATE.Admin.Manager.Knowledge.RosterNoMatchHint',
          'Clear the search to show every player character.'
        )}
      />
    {:else}
      <!-- Plain button stack rather than a list/listitem pairing: the row IS the
           control, and a `<button role="listitem">` both loses its button semantics
           and makes its `aria-pressed` selection state unsupported. The section's
           own `aria-label` names the group. -->
      <div class="manager-knowledge-roster-list">
        {#each characters as character (character.id)}
          <button
            type="button"
            class="manager-knowledge-roster-row"
            class:is-selected={character.id === selectedActorId}
            class:is-untracked={character.tracked !== true}
            aria-pressed={character.id === selectedActorId}
            data-knowledge-actor={character.id}
            onclick={() => onSelect(character.id)}
          >
            <Medallion src={character.img} icon="fas fa-user" size={34} alt="" />
            <span class="manager-knowledge-roster-copy">
              <strong class="manager-knowledge-roster-name" title={character.name}
                >{character.name}</strong
              >
              {#if character.tracked === true}
                <small class="manager-knowledge-roster-meta">{metaFor(character)}</small>
              {:else}
                <small class="manager-knowledge-roster-meta" data-knowledge-untracked>
                  {text('FABRICATE.Admin.Manager.Knowledge.NothingTracked', 'Nothing tracked')}
                </small>
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</section>
