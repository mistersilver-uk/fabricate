<!-- Svelte 5 runes mode -->
<!--
  The GM Knowledge surface (issue 785): a three-pane rail · roster · detail audit
  of the party's RUNTIME recipe knowledge for the selected crafting system. It is
  the play-state counterpart to Books & Scrolls (which authors recipe items) and
  Access (which grants visibility), and it operates on per-character OWNED COPIES,
  never on definitions.

  Layout note: this `<main>` is `display: contents` (see `styles/fabricate.css`),
  so its two children become the second and third columns of `.manager-body`,
  which the `knowledge` view re-templates to `220px 250px minmax(0, 1fr)`. The
  shared `<aside class="manager-inspector">` is suppressed for this route in
  `CraftingSystemManagerRoot.svelte`; the CSS column release and that suppression
  are ONE decision expressed twice, so leaving either out reinstates an empty
  300px strip.

  Armed-confirmation ownership: exactly ONE armed token exists at a time, keyed on
  the target DOCUMENT ID (never a row index — the projection re-publishes
  asynchronously from actor/item hooks). It is dropped on character selection
  change, tab switch, roster-search change, any executed action, `Escape`, `blur`,
  arming a different row, and any publish that no longer contains the armed id.
  There is no auto-disarm timer.

  Props:
   - knowledge: the top-level `viewState.knowledge` projection (or null).
   - selectedSystemName: kicker copy.
   - onSelectActor(actorId)
   - onExpend(actorId, itemId) / onDelete(actorId, itemId) / onErase(actorId, recipeId)
   - onResetSystem(actorId) / onResetAll(actorId)
-->
<script>
  import EmptyState from './EmptyState.svelte';
  import { localize } from '../../util/foundryBridge.js';
  import Medallion from '../../components/Medallion.svelte';
  import KnowledgeTabs from './knowledge/KnowledgeTabs.svelte';
  import KnowledgeRoster from './knowledge/KnowledgeRoster.svelte';
  import KnowledgeRecipeItemsTab from './knowledge/KnowledgeRecipeItemsTab.svelte';
  import KnowledgeLearnedRecipesTab from './knowledge/KnowledgeLearnedRecipesTab.svelte';
  import {
    KNOWLEDGE_TAB_LEARNED_RECIPES,
    KNOWLEDGE_TAB_RECIPE_ITEMS,
    filterKnowledgeRoster,
  } from './knowledge/knowledgeStudio.js';

  let {
    knowledge = null,
    selectedSystemName = '',
    onSelectActor = () => {},
    onExpend = () => {},
    onDelete = () => {},
    onErase = () => {},
    onResetSystem = () => {},
    onResetAll = () => {},
  } = $props();

  let searchTerm = $state('');
  let armedToken = $state('');
  // Seeded ONCE from the store's `defaultTab` (itself resolved once on surface
  // entry from the DEFINITION count). Never a live `$derived` over that count: a
  // GM authoring the system's first recipe item on another surface would flip
  // 0 → 1 and yank the open tab — silently disarming any armed row with it.
  let activeTab = $state(KNOWLEDGE_TAB_RECIPE_ITEMS);
  let tabSeeded = $state(false);
  let panelElement = $state(null);

  const characters = $derived(knowledge?.characters || []);
  const visibleCharacters = $derived(filterKnowledgeRoster(characters, searchTerm));
  const selectedCharacter = $derived(knowledge?.selectedCharacter || null);
  const ownedCopies = $derived(selectedCharacter?.ownedCopies || []);
  const learnedRecipes = $derived(selectedCharacter?.learnedRecipes || []);

  $effect(() => {
    const defaultTab = knowledge?.defaultTab;
    if (tabSeeded || !knowledge?.active || !defaultTab) return;
    activeTab = defaultTab;
    tabSeeded = true;
  });

  // Disarm on character change. Reading the id inside the effect is what makes the
  // rule hold for a selection driven by the STORE (e.g. the projection falling back
  // to the first character) as well as one driven by a roster click.
  let lastActorId = $state('');
  $effect(() => {
    const actorId = knowledge?.selectedActorId || '';
    if (actorId === lastActorId) return;
    lastActorId = actorId;
    armedToken = '';
  });

  // Disarm when a re-projection no longer contains the armed id. Without this the
  // token would survive and the next click would execute against whatever row now
  // occupies that identity.
  $effect(() => {
    if (!armedToken) return;
    const [action, id] = armedToken.split(':');
    const stillPresent =
      action === 'delete'
        ? ownedCopies.some((copy) => copy.itemId === id)
        : learnedRecipes.some((row) => row.recipeId === id);
    if (!stillPresent) armedToken = '';
  });

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function handleSearch(term) {
    searchTerm = term;
    armedToken = '';
  }

  function handleSelectActor(actorId) {
    armedToken = '';
    onSelectActor(actorId);
  }

  function handleTabChange(tabId) {
    armedToken = '';
    activeTab = tabId;
  }

  function arm(token) {
    armedToken = token;
  }

  function disarm(token) {
    if (armedToken === token) armedToken = '';
  }

  // A DESTRUCTIVE action unmounts the row that held focus, so focus would land on
  // `<body>`; it is moved to the owning tab panel instead.
  function afterAction() {
    armedToken = '';
    panelElement?.focus?.();
  }

  // Expend is NOT destructive: the row survives, so its own button keeps focus. Moving
  // focus here would make a keyboard GM re-tab back to the row after every single
  // charge of a five-use copy. Only the armed token is cleared.
  function handleExpend(itemId) {
    armedToken = '';
    onExpend(selectedCharacter?.id || '', itemId);
  }

  function handleDelete(itemId) {
    onDelete(selectedCharacter?.id || '', itemId);
    afterAction();
  }

  function handleErase(recipeId) {
    onErase(selectedCharacter?.id || '', recipeId);
    afterAction();
  }
</script>

<main class="manager-main manager-knowledge-main" data-knowledge-view>
  <KnowledgeRoster
    characters={visibleCharacters}
    totalCount={characters.length}
    selectedActorId={knowledge?.selectedActorId || ''}
    {searchTerm}
    onSearch={handleSearch}
    onSelect={handleSelectActor}
  />

  <section
    class="manager-knowledge-detail"
    aria-label={text('FABRICATE.Admin.Manager.Knowledge.DetailLabel', 'Character knowledge')}
  >
    {#if !selectedCharacter}
      <EmptyState
        icon="fas fa-user"
        title={text('FABRICATE.Admin.Manager.Knowledge.NoSelectionTitle', 'Select a character')}
        hint={text(
          'FABRICATE.Admin.Manager.Knowledge.NoSelectionHint',
          'Pick a player character to review the recipe items they carry and the recipes they have learned.'
        )}
        dataAttr="data-knowledge-no-selection"
      />
    {:else}
      <header class="manager-knowledge-detail-header" data-knowledge-detail-header>
        <div class="manager-knowledge-detail-identity">
          <Medallion src={selectedCharacter.img} icon="fas fa-user" size={50} alt="" />
          <div class="manager-knowledge-detail-copy">
            <p class="manager-kicker">{selectedSystemName}</p>
            <h2 class="manager-knowledge-detail-name" title={selectedCharacter.name}>
              {selectedCharacter.name}
            </h2>
          </div>
        </div>

        <div class="manager-knowledge-fact-cluster" data-knowledge-facts>
          <div class="manager-fact" data-knowledge-fact="items">
            <span class="manager-fact-line"
              ><strong>{selectedCharacter.itemCount}</strong>
              <span class="manager-fact-label"
                >{text('FABRICATE.Admin.Manager.Knowledge.FactItems', 'Recipe items')}</span
              ></span
            >
          </div>
          <div class="manager-fact" data-knowledge-fact="learned">
            <span class="manager-fact-line"
              ><strong>{selectedCharacter.learnedCount}</strong>
              <span class="manager-fact-label"
                >{text('FABRICATE.Admin.Manager.Knowledge.FactLearned', 'Learned recipes')}</span
              ></span
            >
          </div>
          {#if selectedCharacter.otherSystemCount > 0}
            <div class="manager-fact" data-knowledge-fact="other-systems">
              <span class="manager-fact-line"
                ><strong>{selectedCharacter.otherSystemCount}</strong>
                <span class="manager-fact-label"
                  >{text(
                    'FABRICATE.Admin.Manager.Knowledge.FactOtherSystems',
                    'Other systems'
                  )}</span
                ></span
              >
            </div>
          {/if}
          {#if selectedCharacter.orphanCount > 0}
            <div class="manager-fact" data-knowledge-fact="orphans">
              <span class="manager-fact-line"
                ><strong>{selectedCharacter.orphanCount}</strong>
                <span class="manager-fact-label"
                  >{text('FABRICATE.Admin.Manager.Knowledge.FactOrphans', 'Orphaned entries')}</span
                ></span
              >
            </div>
          {/if}
        </div>

        <div
          class="manager-knowledge-reset-actions"
          role="group"
          aria-label={text(
            'FABRICATE.Admin.Manager.Knowledge.ResetActions',
            'Knowledge reset actions'
          )}
        >
          <button
            type="button"
            class="manager-button is-danger"
            data-knowledge-reset="system"
            onclick={() => {
              armedToken = '';
              onResetSystem(selectedCharacter.id);
            }}
          >
            <i class="fas fa-rotate-left" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Knowledge.ResetSystem', 'Reset this system')}</span
            >
          </button>
          <button
            type="button"
            class="manager-button is-danger"
            data-knowledge-reset="all"
            onclick={() => {
              armedToken = '';
              onResetAll(selectedCharacter.id);
            }}
          >
            <i class="fas fa-eraser" aria-hidden="true"></i>
            <span>{text('FABRICATE.Admin.Manager.Knowledge.ResetAll', 'Reset all systems')}</span>
          </button>
        </div>
      </header>

      <KnowledgeTabs
        {activeTab}
        itemCount={ownedCopies.length}
        learnedCount={learnedRecipes.length}
        onChange={handleTabChange}
      />

      <div
        class="manager-editor-tab-panel manager-knowledge-panel"
        role="tabpanel"
        tabindex="-1"
        bind:this={panelElement}
        id={`knowledge-panel-${activeTab}`}
        aria-labelledby={`knowledge-tab-${activeTab}`}
        data-knowledge-panel={activeTab}
      >
        {#if activeTab === KNOWLEDGE_TAB_LEARNED_RECIPES}
          <KnowledgeLearnedRecipesTab
            {learnedRecipes}
            {armedToken}
            onErase={handleErase}
            onArm={arm}
            onDisarm={disarm}
          />
        {:else}
          <KnowledgeRecipeItemsTab
            copies={ownedCopies}
            hasPartyPoolHazard={selectedCharacter.hasPartyPoolHazard === true}
            {armedToken}
            onExpend={handleExpend}
            onDelete={handleDelete}
            onArm={arm}
            onDisarm={disarm}
          />
        {/if}
      </div>
    {/if}
  </section>
</main>
