<!-- Svelte 5 runes mode -->
<!--
  Ingredient-sets section for a single recipe scope (recipe-level for single-step
  recipes, or one step for multi-step). Renders the list of sets via
  RecipeIngredientSetCard and owns the set-level add/remove, forwarding every edit
  upward as a whole replacement array via `onChange(nextSets)`. The parent maps
  that to the scope patch (`{ ingredientSets: nextSets }`), and the store
  normalizes through `Recipe.fromJSON` (assigning ids to new sets/groups). So new
  sets/groups/options are appended id-less; nothing here hand-assigns ids.

  `idPrefix` namespaces the `data-recipe-section` marker so single-step vs.
  per-step instances are distinguishable in tests.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeIngredientSetCard from './RecipeIngredientSetCard.svelte';

  let {
    ingredientSets = [],
    complex = true,
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    currencyUnits = [],
    onChange = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const sets = $derived(Array.isArray(ingredientSets) ? ingredientSets : []);

  // Defensive: never let the simple (chromeless, single-set) render hide extra
  // sets. Trimming to one set is the confirmed store path; if a recipe is somehow
  // flagged simple while still holding >1 set (e.g. imported data), fall back to
  // the full list so the first edit can't silently drop set[1..].
  const effectiveComplex = $derived(complex || sets.length > 1);

  // Simple mode shows exactly one chromeless set bound to the first set. If none
  // exists yet, synthesize an empty placeholder for editing; the first edit writes
  // the whole single-element array back so the scope materializes a real set.
  const simpleSet = $derived(sets[0] || { ingredientGroups: [] });

  function updateSimpleSet(nextSet) {
    onChange([nextSet]);
  }

  function updateSet(index, nextSet) {
    onChange(sets.map((set, i) => (i === index ? nextSet : set)));
  }

  function addSet() {
    onChange([...sets, { name: '', ingredientGroups: [] }]);
  }

  function removeSet(index) {
    onChange(sets.filter((_, i) => i !== index));
  }
</script>

<section class="manager-task-core-card manager-recipe-section" data-recipe-section={`${idPrefix}ingredients`}>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.IngredientsSection', 'Ingredients')}</h3>
    </div>
  </div>
  {#if !effectiveComplex}
    <div class="manager-recipe-ingredient-set-simple">
      <RecipeIngredientSetCard
        set={simpleSet}
        chromeless={true}
        {componentOptions}
        {essenceOptions}
        {itemTags}
        {currencyUnits}
        onChange={(nextSet) => updateSimpleSet(nextSet)}
      />
    </div>
  {:else if sets.length === 0}
    <div class="manager-recipe-section-empty">
      <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.IngredientsEmpty', 'No ingredients yet')}</p>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.IngredientsEmptyHint', 'Add a set of ingredients required to craft this recipe.')}</p>
      <button type="button" class="manager-button" data-recipe-add="ingredient-set" onclick={() => addSet()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add set')}</span>
      </button>
    </div>
  {:else}
    <ul class="manager-recipe-ingredient-sets">
      {#each sets as set, index (set?.id || index)}
        <li class="manager-recipe-ingredient-set-item">
          {#if index > 0}
            <div class="manager-recipe-ingredient-set-or" aria-hidden="true">
              <span>{text('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>
            </div>
          {/if}
          <RecipeIngredientSetCard
            {set}
            {componentOptions}
            {essenceOptions}
            {itemTags}
            {currencyUnits}
            onChange={(nextSet) => updateSet(index, nextSet)}
            onRemove={() => removeSet(index)}
          />
        </li>
      {/each}
    </ul>
    <button type="button" class="manager-button" data-recipe-add="ingredient-set" onclick={() => addSet()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add set')}</span>
    </button>
  {/if}
</section>
