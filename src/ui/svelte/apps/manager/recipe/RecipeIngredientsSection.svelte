<!-- Svelte 5 runes mode -->
<!--
  Ingredient-sets section for a single recipe scope (the recipe, or one step). It owns the
  set-level add/remove and forwards every edit upward as a whole replacement array via
  `onChange(nextSets)`; the store normalizes through `Recipe.fromJSON`, so new sets, groups and
  options are appended id-less and nothing here hand-assigns an id. `idPrefix` namespaces the
  `data-recipe-section` marker per instance.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeIngredientSetCard from './RecipeIngredientSetCard.svelte';
  import Button from '../../../components/Button.svelte';
  import {
    defaultSetName,
    duplicateIngredientSet,
    rendersBare,
    withSoleEntry,
  } from './setDrafts.js';
  import { addIngredientSet } from './recipeRoutingEdits.js';

  let {
    ingredientSets = [],
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    tagComponentCounts = null,
    currencyUnits = [],
    // Whether the system's currency feature is enabled, gating the kind menu's Currency entry and
    // the read-only rendering of existing currency requirements. Forwarded to every set card.
    currencyEnabled = true,
    showSetName = true,
    // Whether this system's mode allows more than one ingredient set — not simple/progressive,
    // which are structurally 1×1, and not alchemy, which forces one. It gates the "Add ingredient
    // set" affordance, the ONLY promotion path to a multi-set recipe.
    canAddSet = false,
    onChange = () => {},
    idPrefix = '',
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const sets = $derived(Array.isArray(ingredientSets) ? ingredientSets : []);

  // Rendering complexity is EMERGENT from structure, with no stored Simple/Complex flag: a
  // single set (or none yet) renders CHROMELESS, its requirements on the tab background.
  const effectiveComplex = $derived(!rendersBare(sets.length));

  // Simple mode binds one chromeless set to the first, synthesizing an empty one when absent;
  // the first edit writes the single-element array back and materializes a real set.
  const simpleSet = $derived(sets[0] || { ingredientGroups: [] });

  function updateSet(index, nextSet) {
    onChange(sets.map((set, i) => (i === index ? nextSet : set)));
  }

  function addSet() {
    onChange(addIngredientSet(sets));
  }

  function removeSet(index) {
    onChange(sets.filter((_, i) => i !== index));
  }

  // The copy is inserted right after the original so it reads as related.
  function duplicateSet(index) {
    const source = sets[index];
    if (!source) return;
    const copy = duplicateIngredientSet(source);
    onChange([...sets.slice(0, index + 1), copy, ...sets.slice(index + 1)]);
  }
</script>

<section class="manager-recipe-ingredients-section" data-recipe-section={`${idPrefix}ingredients`}>
  {#if !effectiveComplex}
    <!-- A single set, or none yet, renders CHROMELESS. The "Add ingredient set" button below
         is the only promotion path, so it shows only where the mode allows more than one. -->
    <div class="manager-recipe-ingredient-set-simple">
      <RecipeIngredientSetCard
        set={simpleSet}
        chromeless={true}
        {componentOptions}
        {essenceOptions}
        {itemTags}
        {tagComponentCounts}
        {currencyUnits}
        {currencyEnabled}
        onChange={(nextSet) => onChange(withSoleEntry(sets, nextSet))}
      />
    </div>
    {#if canAddSet}
      <Button role="dashed" fullWidth data-recipe-add="ingredient-set" onclick={() => addSet()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add ingredient set')}</span>
      </Button>
    {/if}
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
            {tagComponentCounts}
            {currencyUnits}
            {currencyEnabled}
            {showSetName}
            defaultName={defaultSetName(index)}
            onChange={(nextSet) => updateSet(index, nextSet)}
            onRemove={() => removeSet(index)}
            onDuplicate={() => duplicateSet(index)}
          />
        </li>
      {/each}
    </ul>
    <Button role="dashed" fullWidth data-recipe-add="ingredient-set" onclick={() => addSet()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add ingredient set')}</span>
    </Button>
  {/if}
</section>
