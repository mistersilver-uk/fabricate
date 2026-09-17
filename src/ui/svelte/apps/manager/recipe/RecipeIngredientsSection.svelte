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
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    ingredientSets = [],
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Whether the system's currency feature is enabled, gating the "Add cost" affordances and
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

  // An id eagerly at add time, so a new set is immediately routable in the Results tab.
  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // The default display name for an unnamed set, in the editable field so an unnamed set is
  // not hidden behind a placeholder, and read-only in check mode.
  function defaultSetName(index) {
    return `${text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')} ${index + 1}`;
  }

  const sets = $derived(Array.isArray(ingredientSets) ? ingredientSets : []);

  // Rendering complexity is EMERGENT from structure, with no stored Simple/Complex flag: a
  // single set (or none yet) renders CHROMELESS, its requirements on the tab background.
  const effectiveComplex = $derived(sets.length > 1);

  // Simple mode binds one chromeless set to the first, synthesizing an empty one when absent;
  // the first edit writes the single-element array back and materializes a real set.
  const simpleSet = $derived(sets[0] || { ingredientGroups: [] });

  // Materialize the single Simple set with an eager id so it is immediately routable, spreading
  // the existing set so its id and unknown fields survive.
  function updateSimpleSet(nextSet) {
    const base = sets[0] || {};
    onChange([{ ...base, ...nextSet, id: base.id || nextSet?.id || newId() }]);
  }

  function updateSet(index, nextSet) {
    onChange(sets.map((set, i) => (i === index ? nextSet : set)));
  }

  function addSet() {
    onChange([...sets, { id: newId(), name: '', ingredientGroups: [] }]);
  }

  function removeSet(index) {
    onChange(sets.filter((_, i) => i !== index));
  }

  // Duplicate a set, for routed-by-ingredient recipes whose alternatives differ by a requirement
  // or two. Deep-cloned so the copy shares no reference, with the set and group ids re-minted and
  // the routing assignment DROPPED, so the copy starts unassigned rather than silently sharing
  // the original's output. It is inserted right after the original so it reads as related.
  function duplicateSet(index) {
    const source = sets[index];
    if (!source) return;
    const cloned = JSON.parse(JSON.stringify(source));
    cloned.id = newId();
    cloned.ingredientGroups = Array.isArray(cloned.ingredientGroups)
      ? cloned.ingredientGroups.map((group) => ({ ...group, id: newId() }))
      : [];
    cloned.resultGroupId = null;
    cloned.resultMapping = [];
    cloned.name = source?.name?.trim()
      ? `${source.name} (${text('FABRICATE.Admin.Manager.Recipe.SetCopySuffix', 'Copy')})`
      : '';
    onChange([...sets.slice(0, index + 1), cloned, ...sets.slice(index + 1)]);
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
        {currencyUnits}
        {currencyEnabled}
        onChange={(nextSet) => updateSimpleSet(nextSet)}
      />
    </div>
    {#if canAddSet}
      <ManagerButton
        role="dashed"
        fullWidth
        data-recipe-add="ingredient-set"
        onclick={() => addSet()}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add ingredient set')}</span>
      </ManagerButton>
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
    <ManagerButton
      role="dashed"
      fullWidth
      data-recipe-add="ingredient-set"
      onclick={() => addSet()}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add ingredient set')}</span>
    </ManagerButton>
  {/if}
</section>
