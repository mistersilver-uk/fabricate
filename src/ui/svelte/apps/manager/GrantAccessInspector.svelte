<!-- Svelte 5 runes mode -->
<!--
  Grant-access inspector for the selected recipe (Books & Scrolls `restricted`
  visibility mode). Two independent rosters — Characters and Players — each with
  its own search box and the shared pagination bar. Toggling any row grants or revokes
  that character/player independently and persists the FULL access snapshot via
  onSaveAccess (characters and players are separate arrays). Grant state is read
  from `recipe.access`, so searching or paging never loses a grant.

  Props:
   - recipe: the selected recipe row ({ id, name, img, category, access, accessSummary }).
   - characters: player-character roster [{ id, name, img, subtitle? }].
   - players: world-user roster [{ id, name, role?, color? }].
   - onSaveAccess(recipeId, { characterIds, playerIds }): persists the full snapshot.
-->
<script>
  import Chip from '../../components/Chip.svelte';
  import Medallion from '../../components/Medallion.svelte';
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import { resolveRecipeImage } from '../../util/craftingImageDefaults.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';
  import RosterRow from './RosterRow.svelte';
  import Pagination from '../../components/Pagination.svelte';
  import ManagerSearchField from '../../components/ManagerSearchField.svelte';
  import { createRecipeAccessBrowserState } from '../../../../utils/managerBrowserViewState.js';

  // Fixed roster page size (design: 6 per roster).
  //
  // THE SEARCH FIELD IS UNCONDITIONAL (issue 1513). It used to render only where the roster
  // was longer than one page, which withheld it from exactly the rosters a GM reads most: a
  // world of six characters drew no way to find one by name at all, and a field that appears
  // when a seventh actor joins reads as a layout glitch rather than as a capability. Nothing
  // about finding a name by typing it depends on how many names there are.
  //
  // THE PAGER KEEPS ITS THRESHOLD, and that is not an inconsistency: a bar that can only say
  // "Page 1 of 1" states nothing the list beneath it does not already show. The shared
  // primitive computes it identically — with showPageSize={false} and this page size, its own
  // totalCount > minPageSize gate is > 6, the same number the hand-rolled bar tested.
  const ROSTER_PAGE_SIZE = 6;

  let {
    recipe = null,
    characters = [],
    players = [],
    onSaveAccess = () => {},
    // ── THE TWO ROSTERS' VIEW-STATE IS LIFTED (issue 1438) ───────────────────────────────
    // This inspector stays mounted while the selected recipe changes, so neither query has
    // ever been lost to picking another row — and it still is not, because the lifted object
    // is not keyed by recipe. What it did not survive is leaving the Access route, which
    // unmounts the whole branch; the root owns the slot so the trip out and back keeps both
    // terms and both pages.
    browserState = $bindable(null),
  } = $props();

  let ownBrowserState = $state(createRecipeAccessBrowserState());
  const ui = $derived(browserState ?? ownBrowserState);

  const charQuery = $derived(String(ui.characterSearchTerm || ''));
  const playerQuery = $derived(String(ui.playerSearchTerm || ''));
  const charPage = $derived(ui.characterPageIndex || 0);
  const playerPage = $derived(ui.playerPageIndex || 0);

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const grantedCharacterIds = $derived(new Set(recipe?.access?.characterIds || []));
  const grantedPlayerIds = $derived(new Set(recipe?.access?.playerIds || []));

  const characterCount = $derived(grantedCharacterIds.size);
  const playerCount = $derived(grantedPlayerIds.size);

  const summaryLabel = $derived(
    characterCount + playerCount === 0
      ? text('FABRICATE.Admin.Manager.Access.NoOneYet', 'No one has access yet')
      : text('FABRICATE.Admin.Manager.Access.Summary', '{chars} characters · {players} players')
          .replace('{chars}', characterCount)
          .replace('{players}', playerCount)
  );

  function categoryLabel() {
    return getRecipeCategoryLabel(recipe?.category, localize);
  }

  function matches(name, query) {
    const q = (query || '').trim().toLowerCase();
    return (
      !q ||
      String(name || '')
        .toLowerCase()
        .includes(q)
    );
  }

  // Each roster returns to page 1 when its own search term changes, so a filter never leaves
  // the viewer on an out-of-range page. It is done in the SEARCH HANDLER below rather than in
  // an effect over the term, because an effect also runs on mount: against the lifted state
  // that would reset the restored page on every return to this route, which is the exact
  // failure the lift exists to remove. `onSearch` is the only writer of either term, so the
  // two are equivalent everywhere except on that first run.

  function persist(characterIds, playerIds) {
    if (!recipe?.id) return;
    onSaveAccess(recipe.id, { characterIds, playerIds });
  }

  function toggleCharacter(id, next) {
    const characterIds = next
      ? Array.from(new Set([...grantedCharacterIds, id]))
      : [...grantedCharacterIds].filter((x) => x !== id);
    persist(characterIds, [...grantedPlayerIds]);
  }

  function togglePlayer(id, next) {
    const playerIds = next
      ? Array.from(new Set([...grantedPlayerIds, id]))
      : [...grantedPlayerIds].filter((x) => x !== id);
    persist([...grantedCharacterIds], playerIds);
  }

  // Player roster rows show the user's human-readable role as the subtitle and tint the
  // leading icon with that user's Foundry colour, both sourced from the game users data.
  // The roster is `game.users.players` — GM-free by construction — so the only roles
  // that appear are Player and Trusted Player. A GM is never a grantable target: the
  // runtime predicate already returns true for any GM viewer before it reads
  // `playerIds`, so granting one would do nothing.
  const playerRows = $derived(
    (players || []).map((player) => ({
      id: player.id,
      name: player.name,
      subtitle: player.role || text('FABRICATE.Admin.Manager.Access.RolePlayer', 'Player'),
      icon: 'fas fa-user',
      iconColor: player.color || '',
    }))
  );
  const characterRows = $derived(
    (characters || []).map((character) => ({
      id: character.id,
      name: character.name,
      subtitle: character.subtitle || '',
      icon: 'fas fa-user',
      iconColor: '',
    }))
  );

  function pageSlice(rows, query, page) {
    const filtered = rows.filter((row) => matches(row.name, query));
    const start = page * ROSTER_PAGE_SIZE;
    return { filtered, visible: filtered.slice(start, start + ROSTER_PAGE_SIZE) };
  }

  const charSlice = $derived(pageSlice(characterRows, charQuery, charPage));
  const playerSlice = $derived(pageSlice(playerRows, playerQuery, playerPage));

  // Two section descriptors drive a single markup block so the Characters and
  // Players rosters share one implementation (no duplicated section markup).
  const sections = $derived([
    {
      key: 'characters',
      title: text('FABRICATE.Admin.Manager.Access.Characters', 'Characters'),
      icon: 'fas fa-user',
      query: charQuery,
      searchPlaceholder: text(
        'FABRICATE.Admin.Manager.Access.SearchCharacters',
        'Search characters…'
      ),
      onSearch: (value) => {
        ui.characterSearchTerm = value;
        ui.characterPageIndex = 0;
      },
      slice: charSlice,
      page: charPage,
      onPageChange: (index) => (ui.characterPageIndex = index),
      granted: grantedCharacterIds,
      onToggle: toggleCharacter,
      dataAttr: 'data-access-character-row',
    },
    {
      key: 'players',
      title: text('FABRICATE.Admin.Manager.Access.Players', 'Players'),
      icon: 'fas fa-user-group',
      query: playerQuery,
      searchPlaceholder: text('FABRICATE.Admin.Manager.Access.SearchPlayers', 'Search players…'),
      onSearch: (value) => {
        ui.playerSearchTerm = value;
        ui.playerPageIndex = 0;
      },
      slice: playerSlice,
      page: playerPage,
      onPageChange: (index) => (ui.playerPageIndex = index),
      granted: grantedPlayerIds,
      onToggle: togglePlayer,
      dataAttr: 'data-access-player-row',
    },
  ]);
</script>

<div class="manager-access-inspector" data-access-inspector>
  {#if !recipe}
    <EmptyState
      icon="fas fa-hand-pointer"
      title={text('FABRICATE.Admin.Manager.Access.NoSelectionTitle', 'Select a recipe')}
      hint={text(
        'FABRICATE.Admin.Manager.Access.NoSelectionHint',
        'Choose a recipe to grant access to characters or players.'
      )}
    />
  {:else}
    <p class="manager-kicker">
      {text('FABRICATE.Admin.Manager.Access.GrantTitle', 'Grant access')}
    </p>
    <div class="manager-inspector-title-row">
      <span class="manager-inspector-icon" aria-hidden="true"
        ><Medallion art={resolveRecipeImage(recipe)} alt="" icon="fas fa-scroll" size={46} /></span
      >
      <div class="manager-inspector-copy">
        <span class="manager-inspector-name" title={recipe.name}>{recipe.name}</span>
        <Chip class="manager-access-category">{categoryLabel()}</Chip>
      </div>
    </div>
    <div class="manager-access-summary">
      <Chip
        tone={characterCount + playerCount === 0 ? 'danger' : 'active'}
        icon="fas fa-users"
        data-access-summary
      >
        <span>{summaryLabel}</span>
      </Chip>
    </div>

    {#each sections as section (section.key)}
      <section class="manager-access-roster" data-access-roster={section.key}>
        <div class="manager-access-roster-head">
          <i class={section.icon} aria-hidden="true"></i>
          <span>{section.title}</span>
        </div>
        <ManagerSearchField
          class="manager-access-roster-search"
          value={section.query}
          onInput={(next) => section.onSearch(next)}
          placeholder={section.searchPlaceholder}
          ariaLabel={section.searchPlaceholder}
          inputAttrs={{ 'data-access-roster-search': section.key }}
        />
        {#if section.slice.filtered.length === 0}
          <p class="manager-access-roster-empty" data-access-roster-empty={section.key}>
            {text('FABRICATE.Admin.Manager.Access.NoMatches', 'No matches')}
          </p>
        {:else}
          <div class="manager-access-roster-rows">
            {#each section.slice.visible as row (row.id)}
              <RosterRow
                name={row.name}
                subtitle={row.subtitle}
                icon={row.icon}
                iconColor={row.iconColor || ''}
                granted={section.granted.has(row.id)}
                onToggle={(next) => section.onToggle(row.id, next)}
                ariaLabel={text(
                  'FABRICATE.Admin.Manager.Access.ToggleNamed',
                  'Toggle access for {name}'
                ).replace('{name}', row.name)}
                dataAttr={section.dataAttr}
              />
            {/each}
          </div>
          <!-- THE SHARED PAGER (issue 1513), replacing a hand-rolled label-plus-two-arrows bar
               that restated the primitive's own arithmetic, its own disabled rule and the same
               three Pagination.* strings. It gains the range line — "Showing 7–8 of 8" — which
               the hand-rolled bar never drew, and showPageSize={false} keeps a per-page selector
               out of a 300px inspector column, which is the mode that prop exists for.

               IT STAYS INSIDE [data-access-roster], and that placement is load-bearing: this
               screen draws TWO of these bars and the primitive stamps a bare
               data-pagination-prev/-next with no per-instance key, so the roster section is the
               only thing that tells the two apart. The retired data-access-roster-prev/-next
               hooks carried the key themselves; a reader of either addresses it by ancestor
               now. -->
          <Pagination
            totalCount={section.slice.filtered.length}
            pageSize={ROSTER_PAGE_SIZE}
            pageIndex={section.page}
            showPageSize={false}
            onPageChange={section.onPageChange}
          />
        {/if}
      </section>
    {/each}
  {/if}
</div>

<style>
  .manager-access-inspector {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-3);
  }

  .manager-access-summary {
    margin-bottom: var(--fab-space-1);
  }

  /* The category pill is a `Chip` (issue 883), so this component's scoping hash is not
     on it. Reach it through `:global`, nested under a selector that DOES carry it. */
  .manager-inspector-copy :global(.manager-access-category) {
    align-self: flex-start;
  }

  .manager-access-roster {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-access-roster-head {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--fab-text-subtle);
  }

  .manager-access-roster-rows {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
  }

  .manager-access-roster-empty {
    margin: 0;
    font-size: 0.74rem;
    color: var(--fab-text-subtle);
  }
</style>
