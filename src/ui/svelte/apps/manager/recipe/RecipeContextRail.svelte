<!-- Svelte 5 runes mode -->
<!--
  The recipe editor's context rail (issue 643 §4b). It occupies the shell's existing
  `.manager-inspector` column — it is NOT a second nested grid, which would overflow
  `.manager-recipe-row` at the smoke harness's primary width.

  The rail's TOP section is MODE-CONDITIONAL, driven by the system's canonical
  `visibilityMode` through `craftingEffect(mode)` — the same single source of truth
  the nav and Crafting Settings already use:

    restricted  (showAccess)       → who this recipe is granted to + Manage access ↗
    item/knowledge (showBooksScrolls) → the books/scrolls teaching it + Open Books & Scrolls ↗
    global      (neither)          → no section: a globally-visible system grants no
                                     per-recipe access and uses no books.

  It is READ-ONLY in every mode. Authoring lives on the owning screen: the Access tab
  owns grants, Books & Scrolls owns membership. There is deliberately NO drop zone and
  no "Link another" here — that was a second authoring path for the same many-to-many.

  Two rules the rail must not break:
   - It NEVER resolves access ids. The store hands it resolved rows
     (`resolveRecipeAccess`), because a granted id resolves over EVERY world actor,
     not the player-character roster.
   - "Who plays this character" is a SET. `controlledBy` is the union of assigned-
     character and OWNER grants, and `sharedWithAllPlayers` (ownership.default >=
     OWNER) means the grant reaches the whole table — so the sub-line says "Shared
     with all players", never "Played by <one name>".

  Below the mode-conditional section, in EVERY mode: step mode and the validation
  mini-list. (Category lives on the Overview tab, not the rail — issue 643.) There is
  no Simple/Complex toggle — recipe complexity is emergent from the ingredient-set
  count, so it is authored on the Ingredients tab, not here.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js';
  import SegmentedControl from '../SegmentedControl.svelte';

  let {
    recipe = null,
    // The recipe editor's live active tab. The rail adds a validation summary card +
    // count table ONLY while the Validation tab is open (§G4).
    activeTab = 'overview',
    // The system's craftingEffect matrix row ({ showAccess, showBooksScrolls, ... }).
    // NOT named `effect`: a variable of that name makes the compiler read `$effect(...)`
    // below as a store subscription (`$` + `effect`) and the component dies at mount.
    visibilityEffect = { showAccess: false, showBooksScrolls: true },
    // Resolved (never id-only) access rows for the RESTRICTED branch. The store
    // resolves these; unresolvable ids are dropped from display and never persisted
    // away, because the rail is read-only.
    accessPlayers = [],
    accessCharacters = [],
    recipeItemDefinitions = [],
    multiStepEnabled = false,
    // { checks, issues } from the pure readiness evaluator — the same one the
    // Validation tab renders, so the mini-list can never disagree with the tab.
    readiness = { checks: [], issues: [] },
    onRemoveRecipeItem = () => {},
    onEnterMultiStep = () => {},
    onRevertToSingleStep = () => {},
    onOpenItem = () => {},
    onOpenAccess = () => {},
    onOpenBooksScrolls = () => {},
    onSelectIssue = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // --- Books & scrolls ("Appears in") -------------------------------------------
  // The recipe↔recipe-item link is many-to-many: a recipe can be taught by several
  // books. There is NO book/scroll `kind` — RecipeItemDefinition manages every
  // recipe item regardless of Foundry item type, so no kind chip is rendered.
  const linkedDefinitionIds = $derived(
    Array.isArray(recipe?.recipeItemIds) && recipe.recipeItemIds.length > 0
      ? recipe.recipeItemIds.map((id) => String(id))
      : (recipe?.recipeItemId ? [String(recipe.recipeItemId)] : [])
  );

  const linkedDefinitions = $derived(
    linkedDefinitionIds
      .map((id) => (recipeItemDefinitions || []).find((def) => String(def.id) === id) || null)
      .filter(Boolean)
  );

  // Resolve each book's underlying item document for a live thumb/name + the
  // missing-state, keyed by definition id.
  let resolvedByDefId = $state({});
  $effect(() => {
    void recipe?.id;
    const defs = linkedDefinitions;
    if (typeof globalThis.fromUuid !== 'function') {
      const next = {};
      for (const def of defs) {
        const uuid = String(def?.originItemUuid || '');
        if (!uuid) next[def.id] = { name: '', img: '', missing: true };
      }
      resolvedByDefId = next;
      return;
    }
    let cancelled = false;
    Promise.all(
      defs.map(async (def) => {
        const uuid = String(def?.originItemUuid || '');
        if (!uuid) return [def.id, { name: '', img: '', missing: true }];
        try {
          const doc = await Promise.resolve(globalThis.fromUuid(uuid));
          if (!doc) return [def.id, { name: '', img: '', missing: true }];
          return [def.id, { name: String(doc.name || ''), img: String(doc.img || ''), missing: false }];
        } catch {
          return [def.id, { name: '', img: '', missing: true }];
        }
      })
    ).then((entries) => {
      if (!cancelled) resolvedByDefId = Object.fromEntries(entries);
    });
    return () => { cancelled = true; };
  });

  function definitionName(def) {
    return resolvedByDefId[def.id]?.name || def?.name || String(def?.originItemUuid || '');
  }
  function definitionImg(def) {
    return resolvedByDefId[def.id]?.img || def?.img || DEFAULT_RECIPE_IMAGE;
  }
  function definitionMissing(def) {
    return resolvedByDefId[def.id]?.missing === true;
  }
  function unlinkDefinition(def) {
    if (def?.id) onRemoveRecipeItem(def.id);
  }
  function openItem(def) {
    const uuid = String(def?.originItemUuid || '');
    if (uuid) onOpenItem(uuid);
  }

  // --- Access (restricted mode) --------------------------------------------------
  // The sub-line rule (§4b). Empty → NO sub-line: no invented attribution.
  // sharedWithAllPlayers wins over any names, because it means everyone controls the
  // actor and naming one player would tell the GM the opposite of the truth.
  function controllerSubline(character) {
    if (character?.sharedWithAllPlayers === true) {
      return text('FABRICATE.Admin.Manager.Recipe.Rail.SharedWithAllPlayers', 'Shared with all players');
    }
    const controllers = Array.isArray(character?.controlledBy) ? character.controlledBy : [];
    if (controllers.length === 0) return '';
    if (controllers.length === 1) {
      return `${text('FABRICATE.Admin.Manager.Recipe.Rail.PlayedBy', 'Played by')} ${controllers[0].name}`;
    }
    if (controllers.length === 2) {
      return `${text('FABRICATE.Admin.Manager.Recipe.Rail.PlayedBy', 'Played by')} ${controllers[0].name}, ${controllers[1].name}`;
    }
    return `${text('FABRICATE.Admin.Manager.Recipe.Rail.PlayedBy', 'Played by')} ${controllers[0].name} +${controllers.length - 1}`;
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

  // Category authoring moved to the Overview tab (prototype §5.1); the rail no
  // longer carries a category control (issue 643 G-note).

  // --- Step mode -----------------------------------------------------------------
  const isMultiStep = $derived((recipe?.steps?.length ?? 0) >= 1);

  const STEP_MODE_OPTIONS = [
    {
      value: 'single',
      icon: 'fas fa-square',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.SingleStep',
      fallback: 'Single step'
    },
    {
      value: 'multi',
      icon: 'fas fa-list-ol',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.MultiStep',
      fallback: 'Multi-step'
    }
  ];

  function selectStepMode(next) {
    const multi = next === 'multi';
    if (multi === isMultiStep) return;
    if (multi) onEnterMultiStep();
    else onRevertToSingleStep();
  }

  // Recipe complexity is EMERGENT from structure now (issue 643): a recipe is
  // multi-set purely by having more than one ingredient set, so the rail carries no
  // Simple/Complex toggle. The "Add ingredient set" affordance on the Ingredients tab
  // is the only promotion path.

  // --- Validation mini-list ------------------------------------------------------
  // Groups off the SAME pure evaluator the Validation tab renders. "All clear" is a
  // pill, not an empty list, so a clean recipe reads as a positive state.
  const criticalIssues = $derived(
    (readiness?.issues || []).filter((issue) => issue.severity === 'critical')
  );
  const warningIssues = $derived(
    (readiness?.issues || []).filter((issue) => issue.severity === 'warning')
  );
  const allClear = $derived(criticalIssues.length === 0 && warningIssues.length === 0);
  // The rail always renders the full check list (§G2), so read it directly.
  const railChecks = $derived(Array.isArray(readiness?.checks) ? readiness.checks : []);

  // --- Validation summary (§G4) --------------------------------------------------
  // Shown only on the Validation tab: a status medallion + a Passing/Warnings/Blocking
  // count table, derived from the SAME readiness output the mini-list uses — never a
  // second evaluator. Blocking = critical issues (they block enabling); passing = the
  // satisfied structural checks.
  const showValidationSummary = $derived(activeTab === 'validation');
  const passingCount = $derived(railChecks.filter((check) => check.satisfied).length);
  const warningCount = $derived(warningIssues.length);
  const blockingCount = $derived(criticalIssues.length);
  const summaryStatus = $derived(
    blockingCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'clear'
  );
  const summaryMeta = $derived(
    summaryStatus === 'blocked'
      ? {
          icon: 'fas fa-circle-xmark',
          title: text('FABRICATE.Admin.Manager.Recipe.Rail.SummaryBlocked', 'Cannot be enabled'),
          sub: text('FABRICATE.Admin.Manager.Recipe.Rail.SummaryBlockedSub', 'Clear every blocking issue before this recipe can be enabled.')
        }
      : summaryStatus === 'warning'
        ? {
            icon: 'fas fa-triangle-exclamation',
            title: text('FABRICATE.Admin.Manager.Recipe.Rail.SummaryWarnings', 'Enabled with warnings'),
            sub: text('FABRICATE.Admin.Manager.Recipe.Rail.SummaryWarningsSub', 'Saves and enables — review the warnings when you can.')
          }
        : {
            icon: 'fas fa-circle-check',
            title: text('FABRICATE.Admin.Manager.Recipe.Rail.SummaryAllClear', 'All clear'),
            sub: text('FABRICATE.Admin.Manager.Recipe.Rail.SummaryAllClearSub', 'Every structural check passes. Ready to enable.')
          }
  );

  const CHECK_LABELS = {
    hasName: ['CheckName', 'Has a name'],
    hasIngredientSet: ['CheckIngredientSet', 'Every step has at least one ingredient set'],
    hasResultGroup: ['CheckResultGroup', 'Every step has at least one result set'],
    stepsNamed: ['CheckStepsNamed', 'Every step is named'],
    noDuplicateMatches: ['CheckNoDuplicateMatches', 'No duplicate component or tag matches'],
    noRequirementOverlap: ['CheckNoRequirementOverlap', 'No overlapping ingredient requirements'],
    routedResultGroupsRouted: ['CheckRoutedResultGroupsRouted', 'Every check-mode result set is assigned a check outcome'],
    routedOutcomeTiersProduced: ['CheckRoutedOutcomeTiersProduced', 'Every check success outcome produces a result set'],
    alchemyResultSelection: ['CheckAlchemyResultSelection', 'Resolves to exactly one result set'],
    noSignatureCollision: ['CheckNoSignatureCollision', 'No ingredient-signature collision with another recipe']
  };

  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.Recipe.Validation.${meta[0]}`, meta[1]);
  }
</script>

{#if recipe && showValidationSummary}
  <!-- §G4: the Validation tab's rail summary — a status medallion + a
       Passing/Warnings/Blocking count table, off the same readiness output. -->
  <section class="manager-recipe-rail-section" data-recipe-section="validation-summary">
    <div class={`manager-recipe-rail-summary is-${summaryStatus}`} data-recipe-validation-summary={summaryStatus}>
      <span class="manager-recipe-rail-summary-medallion" aria-hidden="true">
        <i class={summaryMeta.icon}></i>
      </span>
      <span class="manager-recipe-rail-summary-title">{summaryMeta.title}</span>
      <span class="manager-recipe-rail-summary-sub manager-muted">{summaryMeta.sub}</span>
    </div>
    <ul class="manager-recipe-rail-counts" data-recipe-validation-counts>
      <li class="manager-recipe-rail-count is-passing">
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        <span class="manager-recipe-rail-count-label">{text('FABRICATE.Admin.Manager.Recipe.Rail.CountPassing', 'Passing')}</span>
        <span class="manager-recipe-rail-count-value" data-recipe-count-passing>{passingCount}</span>
      </li>
      <li class="manager-recipe-rail-count is-warning">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <span class="manager-recipe-rail-count-label">{text('FABRICATE.Admin.Manager.Recipe.Rail.CountWarnings', 'Warnings')}</span>
        <span class="manager-recipe-rail-count-value" data-recipe-count-warnings>{warningCount}</span>
      </li>
      <li class="manager-recipe-rail-count is-blocking">
        <i class="fas fa-circle-xmark" aria-hidden="true"></i>
        <span class="manager-recipe-rail-count-label">{text('FABRICATE.Admin.Manager.Recipe.Rail.CountBlocking', 'Blocking')}</span>
        <span class="manager-recipe-rail-count-value" data-recipe-count-blocking>{blockingCount}</span>
      </li>
    </ul>
  </section>
{/if}

{#if visibilityEffect?.showAccess}
  <!-- RESTRICTED: who this recipe is granted to. Read-only — the Access tab is the
       canonical editor and this deep-links to it. -->
  <section class="manager-recipe-rail-section" data-recipe-section="access">
    <!-- A bare card title, like every other card in this rail. NOT
         `.manager-inspector-title-row`: that is a `44px | 1fr` grid built for a
         medallion + copy pair, so a lone heading lands in the 44px column and wraps
         one word per line ("WHO / CAN / CRAFT / THIS"). -->
    <h3 class="manager-recipe-rail-label">{text('FABRICATE.Admin.Manager.Recipe.Rail.AccessTitle', 'Who can craft this')}</h3>

    {#if hasAccessGrants}
      {#if (accessPlayers || []).length > 0}
        <p class="manager-kicker" id="manager-recipe-access-players">{text('FABRICATE.Admin.Manager.Recipe.Rail.PlayersWithAccess', 'Players with access')}</p>
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
        <p class="manager-kicker" id="manager-recipe-access-characters">{text('FABRICATE.Admin.Manager.Recipe.Rail.CharactersWithAccess', 'Characters with access')}</p>
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
      <p class="manager-muted" data-recipe-access-empty>{text('FABRICATE.Admin.Manager.Recipe.Rail.NoAccessGrants', 'No player or character has been granted this recipe yet.')}</p>
    {/if}

    <button type="button" class="manager-button" data-recipe-open-access onclick={() => onOpenAccess()}>
      <i class="fas fa-user-shield" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.Rail.ManageAccess', 'Manage access')}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  </section>
{/if}

{#if visibilityEffect?.showBooksScrolls}
  <!-- ITEM / KNOWLEDGE: the books & scrolls that teach this recipe. A SUMMARY, not an
       editor: a recipe is ADDED to a book from the book's own editor, so there is no
       drop zone and no "Link another" here. Each row can still be removed (that is a
       removal from THIS recipe's membership, not authoring a new one). -->
  <section class="manager-recipe-rail-section" data-recipe-section="recipe-item">
    <h3 class="manager-recipe-rail-label">{text('FABRICATE.Admin.Manager.Recipe.Rail.AppearsIn', 'Appears in')}</h3>
    {#if linkedDefinitions.length > 0}
      <ul class="manager-recipe-item-links" data-recipe-item-links aria-label={text('FABRICATE.Admin.Manager.Recipe.RecipeItemLinks', 'Linked recipe items')}>
        {#each linkedDefinitions as def (def.id)}
          <li
            class="manager-environment-scene-linked"
            data-recipe-item-linked
            data-recipe-item-link={def.id}
          >
            {#if definitionMissing(def)}
              <span class="manager-environment-scene-thumb is-placeholder" aria-hidden="true"><i class="fas fa-suitcase"></i></span>
              <span class="manager-environment-scene-name manager-muted" data-recipe-item-missing>{text('FABRICATE.Admin.Manager.Recipe.RecipeItemMissing', 'Recipe item unresolved')}</span>
            {:else}
              <img class="manager-environment-scene-thumb" src={definitionImg(def)} alt="" />
              <button type="button" class="manager-environment-scene-name" onclick={() => openItem(def)} title={text('FABRICATE.Admin.Manager.Recipe.OpenItem', 'Open item')}>{definitionName(def)}</button>
            {/if}
            <button
              type="button"
              class="manager-icon-button is-danger"
              aria-label={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')}
              title={text('FABRICATE.Admin.Manager.Recipe.UnlinkItem', 'Unlink recipe item')}
              onclick={() => unlinkDefinition(def)}
            ><i class="fas fa-link-slash" aria-hidden="true"></i></button>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="manager-recipe-rail-empty-card" data-recipe-item-empty>
        <span class="manager-recipe-rail-empty-medallion" aria-hidden="true"><i class="fas fa-book"></i></span>
        <span class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.Rail.AppearsInEmpty', 'Not in any book or scroll yet.')}</span>
      </div>
    {/if}

    <button type="button" class="manager-button" data-recipe-open-books onclick={() => onOpenBooksScrolls()}>
      <i class="fas fa-book" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.Rail.OpenBooksScrolls', 'Open Books & Scrolls')}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  </section>
{/if}

{#if recipe}
  {#if multiStepEnabled || isMultiStep}
    <section class="manager-recipe-rail-section" data-recipe-section="recipe-step-mode">
      <h3 class="manager-recipe-rail-label">{text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}</h3>
      <SegmentedControl
        options={STEP_MODE_OPTIONS}
        value={isMultiStep ? 'multi' : 'single'}
        groupName="manager-recipe-step-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}
        optionDataAttr="data-recipe-step-mode-option"
        onChange={selectStepMode}
      />
    </section>
  {/if}

  <section class="manager-recipe-rail-section" data-recipe-section="recipe-validation">
    <div class="manager-recipe-rail-label-row">
      <h3 class="manager-recipe-rail-label">{text('FABRICATE.Admin.Manager.Recipe.Validation.Title', 'Validation')}</h3>
      {#if allClear}
        <span class="manager-chip is-active" data-recipe-validation-clear>
          <i class="fas fa-circle-check" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.Rail.AllClear', 'All clear')}</span>
        </span>
      {/if}
    </div>
    <!-- The POSITIVE-state list (§G2): the full check list always renders — passing
         checks read green — not only the failing ones. -->
    <ul class="manager-recipe-rail-checks" data-recipe-validation-issues>
      {#each railChecks as check (check.id)}
        <li
          class={`manager-recipe-rail-check ${check.satisfied ? 'is-satisfied' : 'is-unsatisfied'}`}
          data-recipe-rail-check={check.id}
          data-satisfied={check.satisfied}
        >
          <i class={check.satisfied ? 'fas fa-circle-check' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
          <span>{checkLabel(check.id)}</span>
        </li>
      {/each}
    </ul>
    {#if !allClear}
      <button type="button" class="manager-button is-ghost" data-recipe-open-validation onclick={() => onSelectIssue('validation')}>
        <i class="fas fa-list-check" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.Rail.ReviewValidation', 'Review validation')}</span>
      </button>
    {/if}
  </section>
{/if}

<style>
  /* One continuous rail (§G1): bare sections with an uppercase micro-label over their
     content, not five stacked `.manager-inspector-card` boxes. */
  .manager-recipe-rail-section {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    padding-bottom: var(--fab-space-3);
    border-bottom: 1px solid var(--fab-border);
  }

  .manager-recipe-rail-section:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .manager-recipe-rail-label {
    margin: 0;
    color: var(--fab-text-subtle);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .manager-recipe-rail-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--fab-space-2);
  }

  /* §G4: the Validation-tab summary card (52px status medallion + title + sub-line). */
  .manager-recipe-rail-summary {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--fab-space-1);
    padding: var(--fab-space-4) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 12px;
    text-align: center;
  }

  .manager-recipe-rail-summary-medallion {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    margin-bottom: var(--fab-space-1);
    border-radius: 13px;
    font-size: 1.35rem;
  }

  .manager-recipe-rail-summary.is-clear .manager-recipe-rail-summary-medallion {
    color: var(--fab-success);
    background: var(--fab-success-soft);
  }

  .manager-recipe-rail-summary.is-warning .manager-recipe-rail-summary-medallion {
    color: var(--fab-warning);
    background: var(--fab-warning-soft);
  }

  .manager-recipe-rail-summary.is-blocked .manager-recipe-rail-summary-medallion {
    color: var(--fab-danger);
    background: var(--fab-danger-soft);
  }

  .manager-recipe-rail-summary.is-clear {
    border-color: var(--fab-success-border);
  }

  .manager-recipe-rail-summary.is-warning {
    border-color: var(--fab-warning-border);
  }

  .manager-recipe-rail-summary.is-blocked {
    border-color: var(--fab-danger-border);
  }

  .manager-recipe-rail-summary-title {
    font-family: var(--fab-font-serif);
    font-size: 1rem;
    font-weight: 600;
  }

  .manager-recipe-rail-summary-sub {
    font-size: 0.72rem;
  }

  /* The Passing / Warnings / Blocking count table (three mono counts). */
  .manager-recipe-rail-counts {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-recipe-rail-count {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    font-size: 0.78rem;
  }

  .manager-recipe-rail-count-label {
    flex: 1 1 auto;
  }

  .manager-recipe-rail-count-value {
    flex: 0 0 auto;
    font-family: var(--fab-font-mono);
    font-weight: 700;
  }

  .manager-recipe-rail-count.is-passing > i {
    color: var(--fab-success);
  }

  .manager-recipe-rail-count.is-warning > i {
    color: var(--fab-warning);
  }

  .manager-recipe-rail-count.is-blocking > i {
    color: var(--fab-danger);
  }

  .manager-recipe-rail-checks {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .manager-recipe-rail-check {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-1) var(--fab-space-2);
    border: 1px solid var(--fab-border);
    border-radius: 7px;
    font-size: 0.76rem;
  }

  .manager-recipe-rail-check.is-satisfied > i {
    color: var(--fab-success);
  }

  .manager-recipe-rail-check.is-unsatisfied > i {
    color: var(--fab-danger);
  }

  /* "Appears in" empty state: a bordered card with a book medallion (§G5). */
  .manager-recipe-rail-empty-card {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-border);
    border-radius: 9px;
  }

  .manager-recipe-rail-empty-medallion {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    color: var(--fab-text-subtle);
    background: var(--fab-bg-3);
  }

  .manager-recipe-access-list {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin: 0 0 var(--fab-space-2);
    padding: 0;
    list-style: none;
  }

  .manager-recipe-access-row {
    display: flex;
    align-items: center;
    gap: var(--fab-space-2);
    min-width: 0;
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

  .manager-recipe-rail-issues {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-1);
    margin: 0 0 var(--fab-space-2);
    padding: 0;
    list-style: none;
  }

  .manager-recipe-rail-issue {
    display: flex;
    align-items: flex-start;
    gap: var(--fab-space-2);
    color: var(--fab-text-secondary);
    font-size: 0.72rem;
  }

  .manager-recipe-rail-issue i {
    margin-top: 2px;
    color: var(--fab-danger-text);
    font-size: 0.66rem;
  }
</style>
