<!--
  Grant-access inspector for the selected recipe (Books & Scrolls `restricted` visibility mode). Two
  independent rosters — Characters and Players — each with its own search box and the shared
  pagination bar. Toggling any row grants or revokes independently and persists the FULL access
  snapshot through `onSaveAccess(recipeId, { characterIds, playerIds })`; grant state is read from
  `recipe.access`, so searching or paging never loses a grant.
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
  import { createRecipeAccessBrowserState } from '../../../model/managerBrowserViewState.js';

  // Fixed roster page size (design: 6 per roster). THE SEARCH FIELD IS UNCONDITIONAL WITH RESPECT
  // TO IT (issue 1513): gating on it withheld the field from exactly the rosters a GM reads most,
  // so the markup gates only on the UNFILTERED roster being non-empty. THE PAGER KEEPS ITS
  // THRESHOLD, because a bar that can only say "Page 1 of 1" states nothing the list does not.
  const ROSTER_PAGE_SIZE = 6;

  let {
    recipe = null,
    characters = [],
    players = [],
    onSaveAccess = () => {},
    // THE TWO ROSTERS' VIEW-STATE IS LIFTED (issue 1438). Neither query was ever lost to picking
    // another row, and still is not, because the lifted object is not keyed by recipe; what it did
    // not survive is leaving the Access route, which unmounts the branch.
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

  // Each roster returns to page 1 when its own term changes, in the SEARCH HANDLER rather than an
  // effect over the term: an effect also runs on mount, which against the lifted state would reset
  // the restored page on every return. `onSearch` is the only writer, so the two are otherwise
  // equivalent.

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

  // The roster is `game.users.players`, GM-free by construction, so only Player and Trusted Player
  // appear. A GM is never a grantable target: the runtime predicate returns true for any GM viewer
  // before it reads `playerIds`.
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

  // THE TWO PAGERS' LANDMARK NAMES (issue 1513), composed from the roster's own title, because
  // this screen draws two `Pagination` regions in one column and a landmark list is navigated by
  // name. Composed from a template key rather than concatenated fragments: word order is a
  // translator's decision.
  function rosterLandmarks(title) {
    return {
      label: text('FABRICATE.Admin.Manager.Access.RosterPagination', '{roster} pagination').replace(
        '{roster}',
        title
      ),
      navLabel: text(
        'FABRICATE.Admin.Manager.Access.RosterPageNavigation',
        '{roster} page navigation'
      ).replace('{roster}', title),
    };
  }

  // Two descriptors drive one markup block, so the rosters share one implementation.
  const sections = $derived([
    {
      key: 'characters',
      title: text('FABRICATE.Admin.Manager.Access.Characters', 'Characters'),
      icon: 'fas fa-user',
      rows: characterRows,
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
      rows: playerRows,
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
        <!-- A SEARCH OVER SOMETHING (issue 1513): the gate reads the UNFILTERED rows, never
             `slice.filtered`, because a field that removed itself once a query matched nothing
             would trap the GM with no way to clear the term they typed. -->
        {#if section.rows.length > 0}
          <ManagerSearchField
            class="manager-access-roster-search"
            value={section.query}
            onInput={(next) => section.onSearch(next)}
            placeholder={section.searchPlaceholder}
            ariaLabel={section.searchPlaceholder}
            inputAttrs={{ 'data-access-roster-search': section.key }}
          />
        {/if}
        {#if section.slice.filtered.length === 0}
          <!-- THE SHARED NO-STATE PRIMITIVE IN ITS QUIET FORM (issue 1515): the column already has
               a boundary drawn around it, and `openspec/specs/design-system/spec.md` rules such an
               emptiness a NOTE rather than a panel. -->
          <EmptyState
            note
            title={text('FABRICATE.Admin.Manager.Access.NoMatches', 'No matches')}
            dataAttr="data-access-roster-empty"
            dataValue={section.key}
          />
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
          <!-- THE SHARED PAGER (issue 1513); `showPageSize={false}` keeps a per-page selector out
               of a 300px column, which is the mode that prop exists for. IT STAYS INSIDE
               [data-access-roster], and that placement is load-bearing: the primitive stamps a
               bare `data-pagination-prev`/`-next` with no per-instance key, so the roster section
               is the only thing that tells the two bars apart FOR A TEST OR A CAPTURE. A
               screen-reader user cannot reach the ancestor, which is what `label`/`navLabel`
               answer. -->
          <Pagination
            totalCount={section.slice.filtered.length}
            pageSize={ROSTER_PAGE_SIZE}
            pageIndex={section.page}
            showPageSize={false}
            label={rosterLandmarks(section.title).label}
            navLabel={rosterLandmarks(section.title).navLabel}
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
</style>
