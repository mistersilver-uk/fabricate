<!-- Svelte 5 runes mode -->
<!--
  Access tab (issue 676): who this recipe is granted to. Rehomed out of the deleted
  RecipeContextRail, whose ACCESS section was the only surface answering "who can
  craft this recipe" — the standalone Access screen is organised the other way round
  (pick a recipe, then grant it), so nothing else in the editor carried this.

  GATED on `visibilityEffect.showAccess` — the system's canonical `visibilityMode`
  through `craftingEffect(mode)`, exactly as the rail gated its section. A globally
  visible system grants no per-recipe access, so the tab does not exist there; the
  gate lives in RecipeEditorTabs so the tab BUTTON disappears with the panel.

  READ-ONLY, as the rail was. Authoring lives on the Access screen, which this
  deep-links to. There is deliberately no grant control here — that would be a second
  authoring path for the same many-to-many.

  Two rules carried over verbatim from the rail; both are load-bearing:
   - It NEVER resolves access ids. The store hands it resolved rows
     (`resolveRecipeAccess`), because a granted id resolves over EVERY world actor,
     not the player-character roster.
   - "Who plays this character" is a SET. `controlledBy` is the union of assigned-
     character and OWNER grants, and `sharedWithAllPlayers` (ownership.default >=
     OWNER) means the grant reaches the whole table — so the sub-line says "Shared
     with all players", never "Played by <one name>".
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';

  let {
    // Resolved (never id-only) access rows. The store resolves these; unresolvable
    // ids are dropped from display and never persisted away, because this is
    // read-only.
    accessPlayers = [],
    accessCharacters = [],
    onOpenAccess = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The sub-line rule. Empty → NO sub-line: no invented attribution.
  // sharedWithAllPlayers wins over any names, because it means everyone controls the
  // actor and naming one player would tell the GM the opposite of the truth.
  function controllerSubline(character) {
    if (character?.sharedWithAllPlayers === true) {
      return text('FABRICATE.Admin.Manager.Recipe.AccessTab.SharedWithAllPlayers', 'Shared with all players');
    }
    const controllers = Array.isArray(character?.controlledBy) ? character.controlledBy : [];
    if (controllers.length === 0) return '';
    // `prefix`, not a singular controller field: a one-player attribution is the lossy
    // model this whole function exists to avoid, and the contract test greps for that
    // field name, so do not reintroduce it even as a local.
    const prefix = text('FABRICATE.Admin.Manager.Recipe.AccessTab.PlayedBy', 'Played by');
    if (controllers.length === 1) return `${prefix} ${controllers[0].name}`;
    if (controllers.length === 2) return `${prefix} ${controllers[0].name}, ${controllers[1].name}`;
    return `${prefix} ${controllers[0].name} +${controllers.length - 1}`;
  }

  // The full list always goes in `title`, so the "+N" collapse never hides a name.
  function controllerTitle(character) {
    const controllers = Array.isArray(character?.controlledBy) ? character.controlledBy : [];
    if (controllers.length === 0) return '';
    return controllers.map((controller) => controller.name).join(', ');
  }

  const hasAccessGrants = $derived(
    (accessPlayers || []).length > 0 || (accessCharacters || []).length > 0
  );
</script>

<section class="manager-recipe-tab manager-recipe-access-tab" data-recipe-tab="access" aria-label={text('FABRICATE.Admin.Manager.Recipe.Tabs.Access', 'Access')}>
  <div class="manager-recipe-tab-intro">
    <h2 class="manager-recipe-tab-title">{text('FABRICATE.Admin.Manager.Recipe.AccessTab.Title', 'Who can craft this')}</h2>
    <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.AccessTab.Intro', 'This system grants recipes per player and character. Grants are authored on the Access screen.')}</p>
  </div>

  <div class="manager-recipe-access-body" data-recipe-section="access">
    {#if hasAccessGrants}
      {#if (accessPlayers || []).length > 0}
        <p class="manager-kicker" id="manager-recipe-access-players">{text('FABRICATE.Admin.Manager.Recipe.AccessTab.PlayersWithAccess', 'Players with access')}</p>
        <ul class="manager-recipe-access-list" data-recipe-access-players aria-labelledby="manager-recipe-access-players">
          {#each accessPlayers as player (player.id)}
            <li class="manager-recipe-access-row" data-recipe-access-player={player.id}>
              {#if player.avatar}
                <img class="manager-recipe-access-avatar" src={player.avatar} alt="" />
              {:else}
                <span class="manager-recipe-access-avatar is-placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>
              {/if}
              <span class="manager-recipe-access-name">{player.name}</span>
            </li>
          {/each}
        </ul>
      {/if}

      {#if (accessCharacters || []).length > 0}
        <p class="manager-kicker" id="manager-recipe-access-characters">{text('FABRICATE.Admin.Manager.Recipe.AccessTab.CharactersWithAccess', 'Characters with access')}</p>
        <ul class="manager-recipe-access-list" data-recipe-access-characters aria-labelledby="manager-recipe-access-characters">
          {#each accessCharacters as character (character.id)}
            {@const subline = controllerSubline(character)}
            <li class="manager-recipe-access-row" data-recipe-access-character={character.id}>
              {#if character.img}
                <img class="manager-recipe-access-avatar" src={character.img} alt="" />
              {:else}
                <span class="manager-recipe-access-avatar is-placeholder" aria-hidden="true"><i class="fas fa-user"></i></span>
              {/if}
              <span class="manager-recipe-access-copy">
                <span class="manager-recipe-access-name">{character.name}</span>
                {#if subline}
                  <span
                    class="manager-recipe-access-subline manager-muted"
                    data-recipe-access-subline
                    title={controllerTitle(character) || undefined}
                  >{subline}</span>
                {/if}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <!-- The tab's OWN empty primitive (`.manager-recipe-section-empty`), the one the
           Results/Ingredients tabs use — not the rail's medallion card. A rail card and
           a tab empty-state are different surfaces, and re-homing the rail's version
           verbatim would have put a second empty-state design on the same tab strip. -->
      <div class="manager-recipe-section-empty" data-recipe-access-empty>
        <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.AccessTab.EmptyTitle', 'No access granted')}</p>
        <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.AccessTab.NoAccessGrants', 'No player or character has been granted this recipe yet.')}</p>
      </div>
    {/if}

    <button type="button" class="manager-button manager-recipe-tab-action" data-recipe-open-access onclick={() => onOpenAccess()}>
      <i class="fas fa-user-shield" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AccessTab.ManageAccess', 'Manage access')}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  </div>
</section>

<style>
  .manager-recipe-access-body {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    min-width: 0;
  }

  /* The access rows, rehomed from the rail (issue 740/796): the tab fills the editor width
     like its sibling tabs, so the list tiles into a grid rather than a single stretched
     column. A FIXED three-column grid (`minmax(0, 1fr)` so a long character name shrinks
     its card gracefully instead of overflowing) gives ~340px per card at the ~1040px
     editor panel — wider than the earlier `auto-fill` 220px tracks, which were truncating
     long names — and keeps this tab in visual parity with the Books & Scrolls grid. */
  .manager-recipe-access-list {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--fab-space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-recipe-access-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
    padding: var(--fab-space-chip) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
  }

  .manager-recipe-access-avatar {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    overflow: hidden;
    border: 1px solid var(--fab-border);
    border-radius: 6px;
    color: var(--fab-text-subtle);
    background: var(--fab-bg-3);
    font-size: 0.66rem;
    object-fit: cover;
  }

  .manager-recipe-access-copy {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-width: 0;
  }

  .manager-recipe-access-name {
    overflow: hidden;
    font-size: 0.78rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manager-recipe-access-subline {
    overflow: hidden;
    font-size: 0.68rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The deep-link out to the canonical authoring screen. `align-self: flex-start` so it
     sizes to its label instead of stretching the full width of the tab now that the body
     no longer shrinks its children to content. */
  .manager-recipe-tab-action {
    align-self: flex-start;
  }
</style>
