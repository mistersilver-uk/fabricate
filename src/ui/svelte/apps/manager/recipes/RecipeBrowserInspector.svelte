<!-- Svelte 5 runes mode -->
<!--
  The recipe LIBRARY's inspector (issue 643), extracted verbatim-in-behaviour out of
  the ~7,100-line CraftingSystemManagerRoot's inlined `{:else if currentView ===
  'recipes'}` aside. It renders into the shell's existing `.manager-inspector`
  column — this component does NOT own a grid, so it cannot introduce the nested
  second inspector that overflows the row at 1280px.

  Two placement rules, both load-bearing:
   - it lives under `apps/manager/recipes/`, NOT `apps/manager/recipe/`, because the
     screenshot map's RECIPE_EDIT_MATCHES globs the latter and would republish the
     five recipe-EDITOR frames instead of the browser frame;
   - it is named RecipeBrowserInspector, not RecipeInspector, to avoid colliding with
     the recipe EDITOR's own frames.

  Contents (brief §3.3): hero (image + name + category/status chips + flavour), a 2x2
  STAT grid (Ingredients / Results / Steps / Crafting check), a REQUIRES list and a
  PRODUCES list — both icon-chip + name + mono quantity rows built from the recipe's
  real ingredient options and result items — then the recipe actions.

  Produces is not optional garnish: a recipe library inspector that cannot tell the GM
  what the recipe makes is not finished, and an empty list is a DANGER row ("a
  successful craft makes nothing"), not a blank.

  The walk over execution scopes -> sets -> groups -> options lives in the pure
  `recipeBrowserModel.js` (`buildRecipeRequirementRows` / `buildRecipeProduceRows`), so
  it is unit tested without a DOM and is written once for both lists.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';
  import { getRecipeCategoryLabel } from '../../../../../utils/recipeCategories.js';
  import {
    buildRecipeProduceRows,
    buildRecipeRequirementRows,
    buildRecipeRoutingModel,
    groupProduceRowsByResultGroup
  } from '../../../../../utils/recipeBrowserModel.js';

  let {
    selectedRecipe = null,
    recipeCount = 0,
    componentCount = 0,
    // The SYSTEM's resolution mode. In `routedByIngredients` the chosen ingredient set
    // routes to a result group, so the inspector pairs a set dropdown with a result-set
    // dropdown; every other mode renders the flat Requires / Produces lists.
    resolutionMode = '',
    // The system's components and essences, used ONLY to resolve the names and images
    // of the ids the recipe references. The inspector reads; it never authors.
    componentOptions = [],
    essenceOptions = [],
    showRecipeCategories = false,
    showVisibilitySummary = false,
    onEdit = () => {},
    onDuplicate = () => {},
    onDelete = () => {},
    onAddComponents = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  function recipeImage(recipe) {
    return recipe?.recipeItemImg || resolveRecipeImage(recipe);
  }

  // The 2x2 stat grid asks the four questions a GM actually has about a recipe they
  // are looking at: what does it take, what does it make, how many steps, and what do
  // I have to roll. (The old grid answered Category / Structure / Steps / Result-groups
  // — two of which are restatements of the row the GM just clicked.)
  //
  // `results` is the one stat with a DANGER state: a recipe that produces nothing is
  // not merely unfinished, it is a successful craft that makes nothing.
  const CHECK_LABELS = {
    dc: ['FABRICATE.Admin.Manager.Recipe.CheckDcValue', 'DC {dc}'],
    dynamic: ['FABRICATE.Admin.Manager.Recipe.CheckDynamicShort', 'Dynamic'],
    progressive: ['FABRICATE.Admin.Manager.Recipe.CheckProgressive', 'Progressive'],
    ingredients: ['FABRICATE.Admin.Manager.Recipe.CheckByIngredients', 'By ingredients'],
    none: ['FABRICATE.Admin.Manager.Recipe.CheckNone', 'No check']
  };

  function checkValue(recipe) {
    const summary = recipe?.checkSummary || { kind: 'none', dc: null };
    const [labelKey, fallback] = CHECK_LABELS[summary.kind] || CHECK_LABELS.none;
    return format(labelKey, fallback, { dc: summary.dc ?? '' });
  }

  const stats = $derived(
    selectedRecipe
      ? [
          {
            id: 'ingredients',
            value: selectedRecipe.ingredientCount ?? 0,
            // `Recipe.Ingredients` is the LOWERCASE count word ("2 ingredients"); the
            // sentence-case section noun is `IngredientsSection`.
            label: text('FABRICATE.Admin.Manager.Recipe.IngredientsSection', 'Ingredients'),
            tone: ''
          },
          {
            id: 'results',
            value: selectedRecipe.resultItemCount ?? 0,
            label: text('FABRICATE.Admin.Manager.Recipe.Results', 'Results'),
            tone: (selectedRecipe.resultItemCount ?? 0) === 0 ? 'danger' : ''
          },
          {
            id: 'steps',
            value: selectedRecipe.stepCount ?? 0,
            label: text('FABRICATE.Admin.Manager.Recipe.Steps', 'Steps'),
            tone: ''
          },
          {
            id: 'check',
            value: checkValue(selectedRecipe),
            label: text('FABRICATE.Admin.Manager.Recipe.CraftingCheck', 'Crafting check'),
            // A system that cannot roll for this recipe is a WARNING, exactly as the row's
            // pill says. `ingredients` is not: it is a working, roll-free configuration.
            tone: selectedRecipe.checkSummary?.kind === 'none' ? 'warning' : ''
          }
        ]
      : []
  );

  // Requires / Produces are derived by the pure model (filter/sort/group live there
  // too), so the walk over steps -> sets -> groups -> options exists once and is unit
  // tested without a DOM.
  const requirementRows = $derived(
    selectedRecipe
      ? buildRecipeRequirementRows(selectedRecipe, { componentOptions, essenceOptions })
      : []
  );
  const produceRows = $derived(
    selectedRecipe ? buildRecipeProduceRows(selectedRecipe, { componentOptions }) : []
  );
  // Every produced row is listed, TONED BY ROLE. A `role: 'failure'` group is the reserved
  // alchemy-Simple group — what a FAILED craft makes — and it exists ONLY there; the routed
  // modes produce nothing at all on a failure, so no failure row is ever invented for them.
  //
  // Filtering the failure group out (as this did) made an alchemy recipe's failure output
  // invisible in the one surface whose job is to say what a recipe makes. It is rendered as
  // a danger-bordered row instead, so it can never be mistaken for a success output.
  //
  // The empty-Produces warning still keys on the SUCCESS rows: a recipe whose only group is
  // the failure group still makes nothing when the craft succeeds, and the GM is told so.
  // Routed-by-ingredients pairing (issue 643): the ingredient sets, the result groups,
  // and the set→group routing each set carries. The set and result-set dropdowns are
  // driven by ONE selection (the ingredient set), so choosing either keeps both in sync.
  const routingModel = $derived(
    selectedRecipe ? buildRecipeRoutingModel(selectedRecipe) : { sets: [], groups: [] }
  );
  const isRoutedByIngredients = $derived(resolutionMode === 'routedByIngredients');
  // Progressive awards its ONE result group's items in authoring ORDER, spending the
  // check budget by each component's difficulty and awarding each entry once — so the
  // list is an ordered priority queue, not a bulk output. The inspector reflects that:
  // no "Result Group 1" pill (there is exactly one group), no quantity (each is awarded
  // once), the component's DC instead, and repeats kept in place because order matters.
  const isProgressive = $derived(resolutionMode === 'progressive');
  // Routed by check: each result group is routed to a check-outcome tier, so Produces is
  // grouped UNDER each tier's group rather than dumped into one flat list with a pill per
  // row. The group heading names the tier; its rows drop the redundant per-row pill.
  const isRoutedByCheck = $derived(resolutionMode === 'routedByCheck');

  function produceGroupLabel(group, index) {
    return (
      group.groupName || `${text('FABRICATE.Admin.Manager.Recipe.ResultSetLabel', 'Result set')} ${index + 1}`
    );
  }

  // The per-component progressive DC label ("DC 12"), or the unset-difficulty note.
  function progressiveDcLabel(row) {
    return row.difficulty === null
      ? text('FABRICATE.Admin.Manager.Recipe.DifficultyUnset', 'No difficulty')
      : format('FABRICATE.Admin.Manager.Recipe.CheckDcValue', 'DC {dc}', { dc: row.difficulty });
  }
  // Show the paired dropdowns only when the mode routes by ingredients AND there are
  // recipe-level ingredient sets to route; otherwise the flat lists render unchanged.
  const routedPairing = $derived(isRoutedByIngredients && routingModel.sets.length > 0);

  let selectedRoutingSetId = $state(null);
  // Re-seed the selection whenever the inspected recipe's set list changes (a new recipe,
  // or an edit), defaulting to the first set. Guards against a stale id from a prior recipe.
  $effect(() => {
    const ids = routingModel.sets.map((set) => set.id);
    if (!ids.includes(selectedRoutingSetId)) {
      selectedRoutingSetId = ids[0] ?? null;
    }
  });

  const selectedRoutingSet = $derived(
    routingModel.sets.find((set) => set.id === selectedRoutingSetId) || null
  );
  const selectedRoutingGroupId = $derived(selectedRoutingSet?.groupId ?? null);

  // When pairing is active, REQUIRES shows only the selected set's requirements and
  // PRODUCES only its routed result group's items; otherwise the whole lists render.
  const visibleRequirementRows = $derived(
    routedPairing
      ? requirementRows.filter((row) => row.setId === selectedRoutingSetId)
      : requirementRows
  );
  const visibleProduceRows = $derived(
    routedPairing
      ? produceRows.filter((row) => row.groupId === selectedRoutingGroupId)
      : produceRows
  );
  const successRows = $derived(visibleProduceRows.filter((row) => !row.failure));
  // Produces grouped by result group (routed-by-check only); flat list otherwise.
  const producedGroups = $derived(
    isRoutedByCheck ? groupProduceRowsByResultGroup(visibleProduceRows) : []
  );

  function selectRoutingSet(setId) {
    if (routingModel.sets.some((set) => set.id === setId)) selectedRoutingSetId = setId;
  }

  // The ingredient-set dropdown option label, with a positional fallback for an unnamed
  // set ("Set 1"). It drives BOTH lists: the selected set filters Requires and its routed
  // result group filters Produces, so a second dropdown would be redundant.
  function routingSetLabel(set, index) {
    return set.name || `${text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')} ${index + 1}`;
  }

  const UNNAMED_COMPONENT = 'FABRICATE.Admin.Manager.Recipe.UnknownComponent';

  function requirementName(row) {
    if (row.kind === 'tags') {
      const tags = (row.tags || []).join(', ');
      if (!tags) return text('FABRICATE.Admin.Manager.Recipe.NoTagsSet', 'No tags set');
      return row.tagMatch === 'all'
        ? format('FABRICATE.Admin.Manager.Recipe.TagsAll', 'All of: {tags}', { tags })
        : format('FABRICATE.Admin.Manager.Recipe.TagsAny', 'Any of: {tags}', { tags });
    }
    if (row.kind === 'currency') {
      return format('FABRICATE.Admin.Manager.Recipe.CurrencyCost', '{amount} {unit}', {
        amount: row.amount,
        unit: row.unit
      });
    }
    if (row.kind === 'essence') {
      return row.name || text('FABRICATE.Admin.Manager.Recipe.UnknownEssence', 'Unknown essence');
    }
    return row.name || text(UNNAMED_COMPONENT, 'Unknown component');
  }

  // The quantity column is a MONO numeric. A currency row already carries its amount in
  // the name ("25 gp"), so it has no separate quantity to show.
  function requirementQuantity(row) {
    if (row.kind === 'currency') return '';
    return `×${row.quantity}`;
  }

  function produceName(row) {
    return row.name || text(UNNAMED_COMPONENT, 'Unknown component');
  }
</script>

{#if selectedRecipe}
  <!--
    The inspector is ONE column on the panel background, not a stack of boxes. It used to
    wrap every section in a bordered panel card under its own heading — five cards, inside a
    panel, inside a window — and invented a details heading for a stat grid that needs no
    title. Sections are now uppercase micro-labels sitting directly on the background; only
    the things that ARE objects (stat tiles, flow rows) keep a box.
  -->
  <section class="manager-recipe-browser-inspector" data-recipe-inspector>
    <p class="manager-recipe-browser-inspector-label">{text('FABRICATE.Admin.Manager.Recipe.Selected', 'Selected recipe')}</p>

    <div class="manager-recipe-browser-inspector-hero">
      <Medallion src={recipeImage(selectedRecipe)} icon="fas fa-scroll" size={52} />
      <div class="manager-recipe-browser-inspector-identity">
        <h2 class="manager-inspector-name" title={selectedRecipe.name}>{selectedRecipe.name}</h2>
        <!--
          TWO chips on one line: what it is, and whether it is on. The third chip used to be
          "Unlocked" — a pill for a NON-state, which forced the row to wrap — and the status
          chip said "Active" while the row's switch inches away said "On", giving the same
          state two names on one screen. Locked keeps its pill (a real state); Incomplete /
          Can't enable appear only when true.
        -->
        <div class="manager-chip-row">
          {#if showRecipeCategories}
            <!-- Through the SAME label helper the rows use: a recipe with no category
                 (or the reserved `general`) is localized, not rendered raw. -->
            <span class="manager-chip" data-recipe-category>
              {getRecipeCategoryLabel(selectedRecipe.category, localize)}
            </span>
          {/if}
          <StatusPill
            tone={selectedRecipe.enabled === false ? 'subtle' : 'success'}
            icon="fas fa-circle"
            label={selectedRecipe.enabled === false
              ? text('FABRICATE.Admin.Manager.StatusOff', 'Off')
              : text('FABRICATE.Admin.Manager.StatusOn', 'On')}
          />
          {#if selectedRecipe.locked}
            <StatusPill tone="accent" icon="fas fa-lock" label={text('FABRICATE.Admin.Manager.Recipe.Locked', 'Locked')} />
          {/if}
          {#if selectedRecipe.incomplete}
            <StatusPill
              tone={selectedRecipe.enabled === false ? 'danger' : 'warning'}
              icon={selectedRecipe.enabled === false ? 'fas fa-circle-exclamation' : 'fas fa-pen-ruler'}
              label={selectedRecipe.enabled === false
                ? text('FABRICATE.Admin.Manager.Recipe.CantEnable', "Can't enable")
                : text('FABRICATE.Admin.Manager.Recipe.Incomplete', 'Incomplete')}
            />
          {/if}
        </div>
      </div>
    </div>

    <!-- The flavour text, whole. It used to be cut at 160 characters, in the one panel
         with the room to show it. -->
    <p class="manager-recipe-browser-inspector-flavour">
      {selectedRecipe.description || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>

    <!-- The four questions a GM has about the recipe they just clicked: what does it
         take, what does it make, how many steps, what do they roll. No heading — a 2x2
         grid of labelled numbers does not need one. -->
    <div class="manager-recipe-stat-grid">
      {#each stats as stat (stat.id)}
        <div class="manager-recipe-stat" data-recipe-fact={stat.id}>
          <strong class={`manager-recipe-stat-value ${stat.tone ? `is-${stat.tone}` : ''}`}>{stat.value}</strong>
          <span class="manager-recipe-stat-label">{stat.label}</span>
        </div>
      {/each}
    </div>

    {#if showVisibilitySummary}
      <p class="manager-muted">
        <strong>{text('FABRICATE.Admin.Manager.Recipe.PlayerVisibility', 'Player visibility')}:</strong>
        {selectedRecipe.visibilitySummary}
      </p>
    {/if}

    <p class="manager-recipe-browser-inspector-label">{text('FABRICATE.Admin.Manager.Recipe.Requires', 'Requires')}</p>
    {#if routedPairing}
      <!-- Routed by ingredients: the chosen set is the route, so a dropdown picks which
           set's requirements to show — and drives the paired result-set dropdown below. -->
      <select
        class="manager-recipe-route-select"
        data-recipe-route="ingredient-set"
        value={selectedRoutingSetId}
        aria-label={text('FABRICATE.Admin.Manager.Recipe.SelectIngredientSet', 'Select ingredient set')}
        onchange={(event) => selectRoutingSet(event.currentTarget.value)}
      >
        {#each routingModel.sets as set, index (set.id)}
          <option value={set.id}>{routingSetLabel(set, index)}</option>
        {/each}
      </select>
    {/if}
    {#snippet requirementRow(row)}
      <div class="manager-recipe-flow-row" data-recipe-requirement={row.kind}>
        <span class="manager-recipe-flow-icon" aria-hidden="true">
          {#if row.img}
            <img src={row.img} alt="" />
          {:else}
            <i class={row.icon}></i>
          {/if}
        </span>
        <span class="manager-recipe-flow-name">{requirementName(row)}</span>
        <span class="manager-recipe-flow-qty">{requirementQuantity(row)}</span>
      </div>
    {/snippet}
    {#if visibleRequirementRows.length === 0}
      <p class="manager-muted" data-recipe-requires-empty>{text('FABRICATE.Admin.Manager.Recipe.NoRequirements', 'No requirements')}</p>
    {:else}
      <div class="manager-recipe-flow-list">
        {#each visibleRequirementRows as req (req.id)}
          {#if req.type === 'anyOf'}
            <!-- A multi-option requirement is satisfied by ANY ONE of its members, so
                 they are drawn as EQUAL peers inside one bordered group — none promoted
                 above the others. -->
            <div class="manager-recipe-flow-anyof" data-recipe-requirement="anyOf">
              <span class="manager-recipe-flow-anyof-label">
                <i class="fas fa-code-branch" aria-hidden="true"></i>
                {text('FABRICATE.Admin.Manager.Recipe.AnyOneOf', 'Any one of')}
              </span>
              {#each req.members as member (member.id)}
                {@render requirementRow(member)}
              {/each}
            </div>
          {:else}
            {@render requirementRow(req)}
          {/if}
        {/each}
      </div>
    {/if}

    <p class="manager-recipe-browser-inspector-label">{text('FABRICATE.Admin.Manager.Recipe.Produces', 'Produces')}</p>
    <!--
      One produced row, TONED BY ROLE. `showGroupPill` is false when the row already sits
      under a result-group heading (routed-by-check) or the group is otherwise identified
      (progressive DC, routed-by-ingredients dropdown), so the pill is not doubled up.
    -->
    {#snippet produceRow(row, showGroupPill)}
      <div
        class={`manager-recipe-flow-row ${row.failure ? 'is-failure' : 'is-produced'}`}
        data-recipe-produces={row.failure ? 'failure' : 'success'}
      >
        <span class="manager-recipe-flow-icon" aria-hidden="true">
          {#if row.img}
            <img src={row.img} alt="" />
          {:else}
            <i class="fas fa-cube"></i>
          {/if}
        </span>
        <span class="manager-recipe-flow-name">{produceName(row)}</span>
        {#if isProgressive}
          <!-- Progressive: the component's DC (its ordered "cost"), not a redundant
               single-group pill. -->
          <span
            class="manager-recipe-flow-group manager-recipe-flow-dc"
            data-recipe-produces-dc={row.difficulty === null ? '' : String(row.difficulty)}
          >{progressiveDcLabel(row)}</span>
        {:else if showGroupPill && row.groupName && !routedPairing}
          <!-- The GM-authored group name, toned by the role it plays. Fabricate's outcome
               tiers are authored, so the NAME is the recipe's; the tone is not. -->
          <span class={`manager-recipe-flow-group ${row.failure ? 'is-failure' : 'is-success'}`}>{row.groupName}</span>
        {/if}
        {#if !isProgressive}
          <!-- Progressive ignores quantity (each entry is awarded once), so a "×1" there
               would read as if all results are produced together — omitted. -->
          <span class="manager-recipe-flow-qty">×{row.quantity}</span>
        {/if}
      </div>
    {/snippet}
    <div class="manager-recipe-flow-list">
      {#if isRoutedByCheck}
        <!-- Routed by check: group the produced items UNDER each result group (the tier),
             heading each with the group name, instead of one flat list of rows each wearing
             a "Result Group N" pill. -->
        {#each producedGroups as group, index (group.groupId)}
          <div class="manager-recipe-produces-group" data-recipe-produces-group={group.groupId}>
            <span
              class={`manager-recipe-flow-group manager-recipe-produces-group-head ${group.failure ? 'is-failure' : 'is-success'}`}
            >{produceGroupLabel(group, index)}</span>
            {#each group.rows as row (row.id)}
              {@render produceRow(row, false)}
            {/each}
          </div>
        {/each}
      {:else}
        {#each visibleProduceRows as row (row.id)}
          {@render produceRow(row, true)}
        {/each}
      {/if}
      {#if successRows.length === 0}
        <!-- Not "unfinished": a recipe with no SUCCESS results is a successful craft that
             makes nothing — true even when a failure group is listed above. -->
        <p class="manager-recipe-flow-empty" data-recipe-produces-empty>
          <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.NoResults', 'No results — a successful craft makes nothing.')}</span>
        </p>
      {/if}
    </div>

    <!--
      The point of the inspector: three full-width buttons (issue 643). `Edit recipe` is
      the accent/peach primary and the loudest thing on the panel; Duplicate is a dark
      secondary above it; Delete is a dark button below with danger-red text and a subtly
      danger-tinted border — NOT a plain text link, so a GM never fires it by reflex, but
      still clearly a real, full-width action rather than a demoted afterthought.
    -->
    <div class="manager-recipe-browser-inspector-actions">
      <button type="button" class="manager-button manager-recipe-browser-inspector-duplicate" data-recipe-action="duplicate" onclick={() => onDuplicate()}>
        <i class="fas fa-copy" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.Duplicate', 'Duplicate recipe')}</span>
      </button>
      <button type="button" class="manager-button manager-recipe-browser-inspector-edit" data-recipe-action="edit" onclick={() => onEdit()}>
        <i class="fas fa-pen" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.Edit', 'Edit recipe')}</span>
      </button>
      <button type="button" class="manager-button manager-recipe-browser-inspector-delete" data-recipe-action="delete" onclick={() => onDelete()}>
        <i class="fas fa-trash" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.Delete', 'Delete recipe')}</span>
      </button>
    </div>
  </section>
{:else if recipeCount === 0}
  <section class="manager-setup-card" aria-label={text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Title', 'Set up recipes')}>
    <div class="manager-setup-card-header">
      <i class="fas fa-scroll" aria-hidden="true"></i>
      <div>
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Kicker', 'Recipe setup')}</p>
        <h3>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Title', 'Set up recipes')}</h3>
      </div>
    </div>
    {#if componentCount > 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Hint', 'Create the first recipe for this system after its reusable components are available.')}</p>
      <ol class="manager-setup-list">
        <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.StepStructure', 'Choose the recipe structure supported by the selected system.')}</li>
        <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.StepRequirements', 'Add ingredient sets, tools, and any visibility or timing requirements.')}</li>
        <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.StepResults', 'Define result groups and enable the recipe when it is ready for players.')}</li>
      </ol>
    {:else}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsHint', 'Add components before creating recipes so ingredients, tools, and results have reusable items to reference.')}</p>
      <ol class="manager-setup-list">
        <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsStepComponents', 'Open Components and drop world, compendium, pack, or folder items into this system.')}</li>
        <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsStepOrganize', 'Review component names, source links, tags, essences, and difficulty metadata.')}</li>
        <li>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.NoComponentsStepRecipes', 'Return to Recipes and build requirements and results from those components.')}</li>
      </ol>
    {/if}
    <div class="manager-setup-links" aria-label={text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Resources', 'Recipe resources')}>
      {#if componentCount <= 0}
        <button type="button" class="manager-button is-primary" onclick={() => onAddComponents()}>
          <i class="fas fa-boxes" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.AddComponents', 'Add components')}</span>
        </button>
      {/if}
      <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/recipes" target="_blank" rel="noreferrer">
        <i class="fas fa-book-open" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.RecipeDocs', 'Recipe docs')}</span>
      </a>
      <a class="manager-button" href="https://mistersilver-uk.github.io/fabricate/quickstart" target="_blank" rel="noreferrer">
        <i class="fas fa-circle-question" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.EmptySetup.Quickstart', 'Quickstart')}</span>
      </a>
    </div>
  </section>
{:else}
  <div class="manager-empty">
    <div>
      <i class="fas fa-scroll" aria-hidden="true"></i>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.SelectRecipe', 'Select a recipe')}</h3>
      <p>{text('FABRICATE.Admin.Manager.Recipe.InspectorHint', 'The inspector shows recipe status, structure, and requirements for the selected row.')}</p>
    </div>
  </div>
{/if}
