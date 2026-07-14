<!-- Svelte 5 runes mode -->
<!--
  Grant-access inspector for the selected recipe (Books & Scrolls `restricted`
  visibility mode). Two independent rosters — Characters and Players — each with
  its own search box and a fixed-size pager. Toggling any row grants or revokes
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
  import { localize } from '../../util/foundryBridge.js';
  import { DEFAULT_CRAFTING_IMAGE } from '../../util/craftingImageDefaults.js';
  import { getRecipeCategoryLabel } from '../../../../utils/recipeCategories.js';
  import RosterRow from './RosterRow.svelte';

  // Fixed roster page size (design: 6 per roster). A search box appears only when
  // the roster is longer than one page.
  const ROSTER_PAGE_SIZE = 6;

  let {
    recipe = null,
    characters = [],
    players = [],
    onSaveAccess = () => {}
  } = $props();

  let charQuery = $state('');
  let playerQuery = $state('');
  let charPage = $state(0);
  let playerPage = $state(0);

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

  function recipeImage() {
    return recipe?.recipeItemImg || recipe?.img || DEFAULT_CRAFTING_IMAGE;
  }

  function categoryLabel() {
    return getRecipeCategoryLabel(recipe?.category, localize);
  }

  function matches(name, query) {
    const q = (query || '').trim().toLowerCase();
    return !q || String(name || '').toLowerCase().includes(q);
  }

  // Reset each roster to page 1 whenever its own search term changes, so a filter
  // never leaves the viewer on an out-of-range page.
  $effect(() => {
    charQuery;
    charPage = 0;
  });
  $effect(() => {
    playerQuery;
    playerPage = 0;
  });

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
  const playerRows = $derived((players || []).map((player) => ({
    id: player.id,
    name: player.name,
    subtitle: player.role || text('FABRICATE.Admin.Manager.Access.RolePlayer', 'Player'),
    icon: 'fas fa-user',
    iconColor: player.color || ''
  })));
  const characterRows = $derived((characters || []).map((character) => ({
    id: character.id,
    name: character.name,
    subtitle: character.subtitle || '',
    icon: 'fas fa-user',
    iconColor: ''
  })));

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
      showSearch: characterRows.length > ROSTER_PAGE_SIZE,
      query: charQuery,
      searchPlaceholder: text('FABRICATE.Admin.Manager.Access.SearchCharacters', 'Search characters…'),
      onSearch: (value) => (charQuery = value),
      slice: charSlice,
      page: charPage,
      onPrev: () => (charPage = Math.max(0, charPage - 1)),
      onNext: () => (charPage += 1),
      granted: grantedCharacterIds,
      onToggle: toggleCharacter,
      dataAttr: 'data-access-character-row'
    },
    {
      key: 'players',
      title: text('FABRICATE.Admin.Manager.Access.Players', 'Players'),
      icon: 'fas fa-user-group',
      showSearch: playerRows.length > ROSTER_PAGE_SIZE,
      query: playerQuery,
      searchPlaceholder: text('FABRICATE.Admin.Manager.Access.SearchPlayers', 'Search players…'),
      onSearch: (value) => (playerQuery = value),
      slice: playerSlice,
      page: playerPage,
      onPrev: () => (playerPage = Math.max(0, playerPage - 1)),
      onNext: () => (playerPage += 1),
      granted: grantedPlayerIds,
      onToggle: togglePlayer,
      dataAttr: 'data-access-player-row'
    }
  ]);

  function totalPages(count) {
    return Math.max(1, Math.ceil(count / ROSTER_PAGE_SIZE));
  }
</script>

<div class="manager-access-inspector" data-access-inspector>
  {#if !recipe}
    <div class="manager-empty">
      <div>
        <i class="fas fa-hand-pointer" aria-hidden="true"></i>
        <h3>{text('FABRICATE.Admin.Manager.Access.NoSelectionTitle', 'Select a recipe')}</h3>
        <p>{text('FABRICATE.Admin.Manager.Access.NoSelectionHint', 'Choose a recipe to grant access to characters or players.')}</p>
      </div>
    </div>
  {:else}
    <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Access.GrantTitle', 'Grant access')}</p>
    <div class="manager-inspector-title-row">
      <span class="manager-inspector-icon" aria-hidden="true"><img class="manager-recipe-thumb" src={recipeImage()} alt="" /></span>
      <div class="manager-inspector-copy">
        <span class="manager-inspector-name" title={recipe.name}>{recipe.name}</span>
        <span class="manager-chip manager-access-category">{categoryLabel()}</span>
      </div>
    </div>
    <div class="manager-access-summary">
      <span class={`manager-chip ${characterCount + playerCount === 0 ? 'is-danger' : 'is-active'}`} data-access-summary>
        <i class="fas fa-users" aria-hidden="true"></i>
        <span>{summaryLabel}</span>
      </span>
    </div>

    {#each sections as section (section.key)}
      <section class="manager-access-roster" data-access-roster={section.key}>
        <div class="manager-access-roster-head">
          <i class={section.icon} aria-hidden="true"></i>
          <span>{section.title}</span>
        </div>
        {#if section.showSearch}
          <label class="manager-search manager-access-roster-search">
            <i class="fas fa-search" aria-hidden="true"></i>
            <input
              type="search"
              value={section.query}
              oninput={(event) => section.onSearch(event.currentTarget.value)}
              placeholder={section.searchPlaceholder}
              aria-label={section.searchPlaceholder}
              data-access-roster-search={section.key}
            />
          </label>
        {/if}
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
                ariaLabel={text('FABRICATE.Admin.Manager.Access.ToggleNamed', 'Toggle access for {name}').replace('{name}', row.name)}
                dataAttr={section.dataAttr}
              />
            {/each}
          </div>
          {#if section.slice.filtered.length > ROSTER_PAGE_SIZE}
            <div class="manager-access-roster-pager" data-access-roster-pager={section.key}>
              <span class="manager-access-roster-pager-label">
                {text('FABRICATE.Admin.Manager.Pagination.PageOf', 'Page {page} of {total}')
                  .replace('{page}', section.page + 1)
                  .replace('{total}', totalPages(section.slice.filtered.length))}
              </span>
              <span class="manager-access-roster-pager-nav">
                <button
                  type="button"
                  class="manager-icon-button"
                  data-access-roster-prev={section.key}
                  aria-label={text('FABRICATE.Admin.Manager.Pagination.Previous', 'Previous page')}
                  disabled={section.page === 0}
                  onclick={section.onPrev}
                >
                  <i class="fas fa-chevron-left" aria-hidden="true"></i>
                </button>
                <button
                  type="button"
                  class="manager-icon-button"
                  data-access-roster-next={section.key}
                  aria-label={text('FABRICATE.Admin.Manager.Pagination.Next', 'Next page')}
                  disabled={section.page >= totalPages(section.slice.filtered.length) - 1}
                  onclick={section.onNext}
                >
                  <i class="fas fa-chevron-right" aria-hidden="true"></i>
                </button>
              </span>
            </div>
          {/if}
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

  .manager-access-category {
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

  .manager-access-roster-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  .manager-access-roster-pager-label {
    font-size: 0.72rem;
    color: var(--fab-text-subtle);
  }

  .manager-access-roster-pager-nav {
    display: flex;
    gap: var(--fab-space-2);
  }
</style>
