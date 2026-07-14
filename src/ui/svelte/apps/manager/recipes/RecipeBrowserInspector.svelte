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
  import {
    buildRecipeProduceRows,
    buildRecipeRequirementRows
  } from '../../../../../utils/recipeBrowserModel.js';

  let {
    selectedRecipe = null,
    recipeCount = 0,
    componentCount = 0,
    // The system's components and essences, used ONLY to resolve the names and images
    // of the ids the recipe references. The inspector reads; it never authors.
    componentOptions = [],
    essenceOptions = [],
    showRecipeCategories = false,
    showVisibilitySummary = false,
    onDuplicate = () => {},
    onDelete = () => {},
    onAddComponents = () => {}
  } = $props();

  const INSPECTOR_DESCRIPTION_LIMIT = 160;

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

  function truncateDescription(description) {
    if (typeof description !== 'string') return '';
    const trimmed = description.trim();
    if (trimmed.length <= INSPECTOR_DESCRIPTION_LIMIT) return trimmed;
    return `${trimmed.slice(0, INSPECTOR_DESCRIPTION_LIMIT).trimEnd()}…`;
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
    none: ['FABRICATE.Admin.Manager.Recipe.CheckNone', '—']
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
            tone: selectedRecipe.checkSummary?.kind === 'none' ? 'muted' : ''
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
  // The recipe's success outputs. A `role: 'failure'` group is what a FAILED alchemy
  // craft makes; listing it under "Produces" would tell the GM the recipe makes
  // something when a successful craft makes nothing.
  const successRows = $derived(produceRows.filter((row) => !row.failure));

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
  <section class="manager-inspector-card" data-recipe-inspector>
    <div class="manager-inspector-title-row is-hero-large">
      <Medallion src={recipeImage(selectedRecipe)} icon="fas fa-scroll" size={56} />
      <div class="manager-inspector-copy">
        <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Recipe.Selected', 'Selected recipe')}</p>
        <h2 class="manager-inspector-name" title={selectedRecipe.name}>{selectedRecipe.name}</h2>
        <div class="manager-chip-row">
          {#if showRecipeCategories}
            <span class="manager-chip" data-recipe-category>
              {selectedRecipe.category || text('FABRICATE.Admin.Manager.Recipe.General', 'General')}
            </span>
          {/if}
          <span class={`manager-chip ${selectedRecipe.enabled === false ? 'is-disabled' : 'is-active'}`}>
            {selectedRecipe.enabled === false ? text('FABRICATE.Admin.Manager.StatusDisabled', 'Disabled') : text('FABRICATE.Admin.Manager.StatusActive', 'Active')}
          </span>
          {#if selectedRecipe.locked}
            <StatusPill tone="accent" icon="fas fa-lock" label={text('FABRICATE.Admin.Manager.Recipe.Locked', 'Locked')} />
          {:else}
            <span class="manager-chip is-active">{text('FABRICATE.Admin.Manager.Recipe.Unlocked', 'Unlocked')}</span>
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

    <p class="manager-muted">
      {truncateDescription(selectedRecipe.description) || text('FABRICATE.Admin.Manager.NoDescriptionAdded', 'No description has been added.')}
    </p>
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Details', 'Recipe details')}</h3>
    <!-- The four questions a GM has about the recipe they just clicked: what does it
         take, what does it make, how many steps, what do they roll. -->
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
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Requires', 'Requires')}</h3>
    {#if requirementRows.length === 0}
      <p class="manager-muted" data-recipe-requires-empty>{text('FABRICATE.Admin.Manager.Recipe.NoRequirements', 'No requirements')}</p>
    {:else}
      <div class="manager-recipe-flow-list">
        {#each requirementRows as row (row.id)}
          <!-- A requirement with alternatives is satisfied by ANY ONE of them, so an
               alternative row is marked as an OR — never as a second thing to bring. -->
          <div
            class={`manager-recipe-flow-row ${row.alternative ? 'is-alternative' : ''}`}
            data-recipe-requirement={row.kind}
          >
            <span class="manager-recipe-flow-icon" aria-hidden="true">
              {#if row.img}
                <img src={row.img} alt="" />
              {:else}
                <i class={row.icon}></i>
              {/if}
            </span>
            <span class="manager-recipe-flow-name">
              {#if row.alternative}<span class="manager-recipe-flow-or">{text('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>{/if}
              {requirementName(row)}
            </span>
            <span class="manager-recipe-flow-qty">{requirementQuantity(row)}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Produces', 'Produces')}</h3>
    {#if successRows.length === 0}
      <!-- Not "unfinished": a recipe with no results is a SUCCESSFUL craft that makes
           nothing. It is the one danger state in this inspector. -->
      <p class="manager-recipe-flow-empty" data-recipe-produces-empty>
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.NoResults', 'No results — a successful craft makes nothing.')}</span>
      </p>
    {:else}
      <div class="manager-recipe-flow-list">
        {#each successRows as row (row.id)}
          <div class="manager-recipe-flow-row is-produced" data-recipe-produces>
            <span class="manager-recipe-flow-icon" aria-hidden="true">
              {#if row.img}
                <img src={row.img} alt="" />
              {:else}
                <i class="fas fa-cube"></i>
              {/if}
            </span>
            <span class="manager-recipe-flow-name">{produceName(row)}</span>
            {#if row.groupName}
              <span class="manager-chip manager-recipe-flow-group">{row.groupName}</span>
            {/if}
            <span class="manager-recipe-flow-qty">×{row.quantity}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Actions', 'Recipe actions')}</h3>
    <div class="manager-inspector-actions">
      <button type="button" class="manager-button" data-recipe-action="duplicate" onclick={() => onDuplicate()}>
        <i class="fas fa-copy" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.Duplicate', 'Duplicate recipe')}</span>
      </button>
      <button type="button" class="manager-button is-danger" data-recipe-action="delete" onclick={() => onDelete()}>
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
