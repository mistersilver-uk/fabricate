<!--
  The Knowledge surface's searchable character roster: player characters only, the same roster the
  Access surface uses, with no show-NPCs toggle — an NPC's knowledge state stays reachable through
  the `game.fabricate.resetActorKnowledge` API. Each row is a REAL button carrying the portrait, the
  name and an "N item(s) · M learned" meta line, or a dimmed "Nothing tracked".

  Props: characters (already filtered), totalCount (unfiltered, drives empty-vs-no-match),
  selectedActorId, searchTerm, onSearch(term), onSelect(actorId), loading (the snapshot read is in
  flight: a compact loading panel replaces every other claim), error (the read failed: the search
  field renders alone, because an empty or no-match panel would describe a finished read).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../../../components/EmptyState.svelte';
  import Avatar from '../../../components/Avatar.svelte';
  import ManagerSearchField from '../../../components/ManagerSearchField.svelte';

  let {
    characters = [],
    totalCount = 0,
    selectedActorId = '',
    searchTerm = '',
    onSearch = () => {},
    onSelect = () => {},
    loading = false,
    error = false,
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
  <!-- The `flex: 0 0 auto` override is authored against `.manager-knowledge-roster .manager-search`,
       beside the Access roster's identical one, so this needs no class of its own. -->
  <ManagerSearchField
    value={searchTerm}
    onInput={(next) => onSearch(next)}
    placeholder={text(
      'FABRICATE.Admin.Manager.Knowledge.SearchPlaceholder',
      'Search characters...'
    )}
    ariaLabel={text('FABRICATE.Admin.Manager.Knowledge.SearchLabel', 'Search characters')}
    inputAttrs={{ 'data-knowledge-search': '' }}
  />

  <div class="manager-knowledge-roster-scroll">
    {#if loading}
      <EmptyState
        compact
        icon="fas fa-spinner fa-spin"
        title={text(
          'FABRICATE.Admin.Manager.Knowledge.RosterLoadingTitle',
          'Loading player characters...'
        )}
        dataAttr="data-knowledge-roster-loading"
      />
    {:else if error}
      <!-- The detail pane carries the failure notice; the roster makes no claim at all. -->
    {:else if totalCount === 0}
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
      <!-- A plain button stack, not list/listitem: `<button role="listitem">` loses its button
           semantics and its `aria-pressed`. The section's own `aria-label` names the group. -->
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
            <Avatar art={character.img} name={character.name} size={34} alt="" />
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
