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

  Below the mode-conditional section, in EVERY mode: category, recipe mode, step mode
  and the validation mini-list.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { DEFAULT_RECIPE_IMAGE } from '../../../util/recipeImageIcons.js';
  import SegmentedControl from '../SegmentedControl.svelte';

  let {
    recipe = null,
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
    complex = false,
    multiSetAllowed = false,
    // Alchemy recipes always have exactly one ingredient set and derive their result
    // shape from the system-level alchemy.checkMode, so Simple/Complex never applies.
    hideComplexToggle = false,
    // { checks, issues } from the pure readiness evaluator — the same one the
    // Validation tab renders, so the mini-list can never disagree with the tab.
    readiness = { checks: [], issues: [] },
    onSetComplexity = () => {},
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

  // --- Step mode / recipe mode ---------------------------------------------------
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

  const RECIPE_MODE_OPTIONS = [
    {
      value: 'simple',
      icon: 'fas fa-equals',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.SimpleMode',
      fallback: 'Simple'
    },
    {
      value: 'complex',
      icon: 'fas fa-diagram-project',
      labelKey: 'FABRICATE.Admin.Manager.Recipe.ComplexMode',
      fallback: 'Complex'
    }
  ];

  function selectStepMode(next) {
    const multi = next === 'multi';
    if (multi === isMultiStep) return;
    if (multi) onEnterMultiStep();
    else onRevertToSingleStep();
  }

  // Complex is gated on the system's resolution mode (multiSetAllowed); a recipe that
  // is already complex can always stay complex (and be inspected or reverted).
  const complexAllowed = $derived(!hideComplexToggle && (multiSetAllowed || complex));

  function selectComplexity(next) {
    const wantComplex = next === 'complex';
    if (wantComplex === complex) return;
    if (wantComplex && !complexAllowed) return;
    onSetComplexity(wantComplex);
  }

  // --- Validation mini-list ------------------------------------------------------
  // Groups off the SAME pure evaluator the Validation tab renders. "All clear" is a
  // pill, not an empty list, so a clean recipe reads as a positive state.
  const criticalIssues = $derived(
    (readiness?.issues || []).filter((issue) => issue.severity === 'critical')
  );
  const warningIssues = $derived(
    (readiness?.issues || []).filter((issue) => issue.severity === 'warning')
  );
  const failingChecks = $derived(
    (readiness?.checks || []).filter((check) => check.satisfied === false)
  );
  const allClear = $derived(criticalIssues.length === 0 && warningIssues.length === 0);

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

{#if visibilityEffect?.showAccess}
  <!-- RESTRICTED: who this recipe is granted to. Read-only — the Access tab is the
       canonical editor and this deep-links to it. -->
  <section class="manager-inspector-card" data-recipe-section="access">
    <!-- A bare card title, like every other card in this rail. NOT
         `.manager-inspector-title-row`: that is a `44px | 1fr` grid built for a
         medallion + copy pair, so a lone heading lands in the 44px column and wraps
         one word per line ("WHO / CAN / CRAFT / THIS"). -->
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Rail.AccessTitle', 'Who can craft this')}</h3>

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
  <section class="manager-inspector-card" data-recipe-section="recipe-item">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Rail.AppearsIn', 'Appears in')}</h3>
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
      <p class="manager-muted" data-recipe-item-empty>{text('FABRICATE.Admin.Manager.Recipe.Rail.AppearsInEmpty', 'No book or scroll teaches this recipe yet.')}</p>
    {/if}

    <button type="button" class="manager-button" data-recipe-open-books onclick={() => onOpenBooksScrolls()}>
      <i class="fas fa-book" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.Rail.OpenBooksScrolls', 'Open Books & Scrolls')}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  </section>
{/if}

{#if recipe}
  {#if complexAllowed}
    <!-- Multi-set authoring is gated by `Recipe.complex` PLUS the mode's structural
         constraints — never by resolutionMode alone. A system whose mode forbids
         multiple sets crafts one set into one result, so the toggle would offer no
         real choice and is hidden entirely. -->
    <section class="manager-inspector-card" data-recipe-section="recipe-mode">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.RecipeMode', 'Recipe mode')}</h3>
      <SegmentedControl
        options={RECIPE_MODE_OPTIONS}
        value={complex ? 'complex' : 'simple'}
        groupName="manager-recipe-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.RecipeMode', 'Recipe mode')}
        optionDataAttr="data-recipe-mode-option"
        onChange={selectComplexity}
      />
      <p class="manager-muted manager-environment-mode-hint">{complex
        ? text('FABRICATE.Admin.Manager.Recipe.ComplexHint', 'Author multiple ingredient sets and result sets.')
        : text('FABRICATE.Admin.Manager.Recipe.SimpleHint', 'One set of ingredients makes one result.')}</p>
    </section>
  {/if}

  {#if multiStepEnabled || isMultiStep}
    <section class="manager-inspector-card" data-recipe-section="recipe-step-mode">
      <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}</h3>
      <SegmentedControl
        options={STEP_MODE_OPTIONS}
        value={isMultiStep ? 'multi' : 'single'}
        groupName="manager-recipe-step-mode"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.StepMode', 'Step mode')}
        optionDataAttr="data-recipe-step-mode-option"
        onChange={selectStepMode}
      />
      <p class="manager-muted manager-environment-mode-hint">{isMultiStep
        ? text('FABRICATE.Admin.Manager.Recipe.MultiStepHint', 'Author an ordered list of named steps in the editor.')
        : text('FABRICATE.Admin.Manager.Recipe.SingleStepHint', 'The recipe is crafted in a single step.')}</p>
    </section>
  {/if}

  <section class="manager-inspector-card" data-recipe-section="recipe-validation">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Validation.Title', 'Validation')}</h3>
    {#if allClear}
      <span class="manager-chip is-active" data-recipe-validation-clear>
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.Rail.AllClear', 'All clear')}</span>
      </span>
    {:else}
      <ul class="manager-recipe-rail-issues" data-recipe-validation-issues>
        {#each failingChecks as check (check.id)}
          <li class="manager-recipe-rail-issue" data-recipe-rail-check={check.id}>
            <i class="fas fa-circle-xmark" aria-hidden="true"></i>
            <span>{checkLabel(check.id)}</span>
          </li>
        {/each}
      </ul>
      <button type="button" class="manager-button" data-recipe-open-validation onclick={() => onSelectIssue('validation')}>
        <i class="fas fa-list-check" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.Rail.ReviewValidation', 'Review validation')}</span>
      </button>
    {/if}
  </section>
{/if}

<style>
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
