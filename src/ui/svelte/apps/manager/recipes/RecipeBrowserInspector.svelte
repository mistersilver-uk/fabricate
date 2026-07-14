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
     the existing RecipeItemInspector.

  The row-derivation helpers below (structure label, step / result counts,
  requirements summary) moved here with it — the root had no other caller.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Medallion from '../../../components/Medallion.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import { resolveRecipeImage } from '../../../util/craftingImageDefaults.js';

  let {
    selectedRecipe = null,
    recipeCount = 0,
    componentCount = 0,
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

  function formatCount(keySingular, fallbackSingular, keyPlural, fallbackPlural, count) {
    const key = count === 1 ? keySingular : keyPlural;
    const fallback = count === 1 ? fallbackSingular : fallbackPlural;
    return `${count} ${text(key, fallback)}`;
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

  function ingredientCount(recipe) {
    return recipe?.ingredientCount ?? recipe?.ingredients?.length ?? 0;
  }

  function toolCount(recipe) {
    return recipe?.toolCount ?? recipe?.tools?.length ?? 0;
  }

  function stepCount(recipe) {
    return recipe?.stepCount ?? 0;
  }

  function resultGroupCount(recipe) {
    return recipe?.resultGroupCount ?? 0;
  }

  function structureLabel(recipe) {
    const labels = {
      multiStep: text('FABRICATE.Admin.Manager.Recipe.MultiStep', 'Multi-step'),
      singleStep: text('FABRICATE.Admin.Manager.Recipe.SingleStep', 'Single step'),
      simple: text('FABRICATE.Admin.Manager.Recipe.Simple', 'Simple')
    };
    return labels[recipe?.structureKey] || (recipe?.isSimple
      ? text('FABRICATE.Admin.Manager.Recipe.Simple', 'Simple')
      : text('FABRICATE.Admin.Manager.Recipe.Advanced', 'Advanced'));
  }

  function stepRequirementSummary(step) {
    if (!step) return text('FABRICATE.Admin.Manager.Recipe.NoRequirements', 'No requirements');
    if (step.hasAlternatives) {
      return text('FABRICATE.Admin.Manager.Recipe.AlternativeSets', '{count} alternative sets')
        .replace('{count}', step.ingredientSetCount || step.ingredientSetSummaries?.length || 0);
    }
    const ingredients = step.ingredientCount || 0;
    const tools = step.toolCount || 0;
    const ingredientLabel = formatCount(
      'FABRICATE.Admin.Manager.Recipe.Ingredient',
      'ingredient',
      'FABRICATE.Admin.Manager.Recipe.Ingredients',
      'ingredients',
      ingredients
    );
    if (tools <= 0) return ingredientLabel;
    const toolLabel = formatCount(
      'FABRICATE.Admin.Manager.Recipe.Tool',
      'tool',
      'FABRICATE.Admin.Manager.Recipe.Tools',
      'tools',
      tools
    );
    return `${ingredientLabel}, ${toolLabel}`;
  }

  function requirementsSummary(recipe) {
    const steps = Array.isArray(recipe?.requirementsPreview) ? recipe.requirementsPreview : [];
    if (steps.length > 1) {
      return text('FABRICATE.Admin.Manager.Recipe.StepRequirements', '{count} steps')
        .replace('{count}', steps.length);
    }
    if (steps.length === 1) return stepRequirementSummary(steps[0]);
    return stepRequirementSummary({
      ingredientCount: ingredientCount(recipe),
      toolCount: toolCount(recipe),
      ingredientSetCount: 1
    });
  }

  function requirementsPreviewItems(recipe) {
    const steps = Array.isArray(recipe?.requirementsPreview) ? recipe.requirementsPreview : [];
    if (steps.length > 0) {
      return steps.map(step => ({
        id: step.id,
        label: step.name,
        value: stepRequirementSummary(step)
      }));
    }
    return [
      {
        id: 'ingredients',
        label: text('FABRICATE.Admin.Manager.Recipe.Ingredients', 'ingredients'),
        value: ingredientCount(recipe)
      },
      {
        id: 'tools',
        label: text('FABRICATE.Admin.Manager.Recipe.Tools', 'tools'),
        value: toolCount(recipe)
      }
    ];
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
    <div class="manager-fact-grid">
      {#if showRecipeCategories}
        <div class="manager-fact" data-recipe-fact="category">
          <span class="manager-fact-line"><strong>{selectedRecipe.category || text('FABRICATE.Admin.Manager.Recipe.General', 'General')}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Recipe.Category', 'Category')}</span></span>
        </div>
      {/if}
      <div class="manager-fact" data-recipe-fact="structure">
        <span class="manager-fact-line"><strong>{structureLabel(selectedRecipe)}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Recipe.Structure', 'Structure')}</span></span>
      </div>
      <div class="manager-fact" data-recipe-fact="steps">
        <span class="manager-fact-line"><strong>{stepCount(selectedRecipe)}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Recipe.Steps', 'Steps')}</span></span>
      </div>
      <div class="manager-fact" data-recipe-fact="result-groups">
        <span class="manager-fact-line"><strong>{resultGroupCount(selectedRecipe)}</strong> <span class="manager-fact-label">{text('FABRICATE.Admin.Manager.Recipe.ResultGroups', 'Result groups')}</span></span>
      </div>
    </div>
    {#if showVisibilitySummary}
      <p class="manager-muted">
        <strong>{text('FABRICATE.Admin.Manager.Recipe.PlayerVisibility', 'Player visibility')}:</strong>
        {selectedRecipe.visibilitySummary}
      </p>
    {/if}
  </section>

  <section class="manager-inspector-card">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Requirements', 'Requirements')}</h3>
    <p class="manager-muted">{requirementsSummary(selectedRecipe)}</p>
    <div class="manager-requirements-list">
      {#each requirementsPreviewItems(selectedRecipe) as item (item.label)}
        <div class="manager-requirement-row">
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      {/each}
    </div>
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
