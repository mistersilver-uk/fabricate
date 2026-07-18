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
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Whether the system's currency feature is enabled. Gates the "Add cost" affordances
    // and the read-only rendering of existing currency requirements; forwarded to every
    // set card, or it silently drops to its default.
    currencyEnabled = true,
    showSetName = true,
    // Whether this system's mode allows more than one ingredient set (i.e. NOT
    // simple/progressive, which are structurally 1×1, and NOT alchemy, which forces
    // a single set). Gates the "Add ingredient set" affordance in the single-set
    // (chromeless) view — the ONLY promotion path to a multi-set recipe now that the
    // Simple/Complex toggle is gone (issue 643). Complexity itself is EMERGENT from
    // the set count, never a stored toggle.
    canAddSet = false,
    onChange = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Generate an id eagerly at add time (rather than at save normalization) so a
  // new set is immediately routable in the Results tab.
  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // The default display name for an unnamed set ("Set 1", "Set 2", …) — shown in
  // the editable name field (so usable unnamed sets are not hidden behind a
  // placeholder) and read-only in check mode.
  function defaultSetName(index) {
    return `${text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')} ${index + 1}`;
  }

  const sets = $derived(Array.isArray(ingredientSets) ? ingredientSets : []);

  // Rendering complexity is EMERGENT from structure (issue 643): a recipe renders as
  // multi-set ONLY when it holds more than one set. A single set (or none yet) renders
  // CHROMELESS — its requirements sit directly on the tab background with no "Set 1"
  // bounding box. There is no stored Simple/Complex flag driving this any more.
  const effectiveComplex = $derived(sets.length > 1);

  // Simple mode shows exactly one chromeless set bound to the first set. If none
  // exists yet, synthesize an empty placeholder for editing; the first edit writes
  // the whole single-element array back so the scope materializes a real set.
  const simpleSet = $derived(sets[0] || { ingredientGroups: [] });

  // Materialize the single Simple set with a stable id (eager, like addSet), so it
  // is immediately routable in the Results tab. Spread the existing set so its
  // id/unknown fields survive; only mint a fresh id when none exists yet.
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

  // Duplicate a set to speed up routed-by-ingredient recipes where alternatives
  // differ by only a requirement or two. Deep-clone via JSON so the copy shares no
  // references with the original, then re-mint the set + group ids (groups carry
  // ids; options do not). The routing assignment that ties a set to a result group
  // (`resultGroupId`/`resultMapping`) is dropped so the copy starts unassigned —
  // it is meant to be edited and re-routed, not to silently share the original's
  // output. The copy is inserted right after the original so it reads as related.
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
    <!-- A single ingredient set (or none authored yet) renders CHROMELESS: the
         requirements sit directly on the tab background with no "Set 1" box. The
         "Add ingredient set" button below is the only way to promote to a multi-set
         recipe, so it shows only where the mode allows more than one set. -->
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
      <button type="button" class="manager-button is-dashed manager-recipe-add-full" data-recipe-add="ingredient-set" onclick={() => addSet()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add ingredient set')}</span>
      </button>
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
    <button type="button" class="manager-button is-dashed manager-recipe-add-full" data-recipe-add="ingredient-set" onclick={() => addSet()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddIngredientSet', 'Add ingredient set')}</span>
    </button>
  {/if}
</section>
