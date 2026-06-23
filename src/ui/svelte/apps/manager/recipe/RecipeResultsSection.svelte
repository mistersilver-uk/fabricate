<!-- Svelte 5 runes mode -->
<!--
  Result-groups section for a single recipe scope (recipe-level for single-step
  recipes, or one step for multi-step). Renders the list of groups via
  RecipeResultGroupCard and owns the group-level add/remove, forwarding every edit
  upward as a whole replacement array via `onChange(nextGroups)`. The parent maps
  that to the scope patch (`{ resultGroups: nextGroups }`), and the store
  normalizes through `Recipe.fromJSON` (assigning ids to new groups/items). So new
  groups/items are appended id-less; nothing here hand-assigns ids.

  Outcome routing / result mapping reference a group by id, and roll-table result
  selection references a group by name, so every edit path spreads the existing
  group rather than synthesizing a fresh one over it (see updateSimpleGroup) — that
  keeps id/name (and any unknown fields) alive across the first edit.

  Empty result groups (and component-less items) are gated at the model/save path
  (Recipe.validate), not the readiness / Validation tab, so an empty group rendered
  here mid-edit is expected rather than an oversight.

  `idPrefix` namespaces the `data-recipe-section` marker so single-step vs.
  per-step instances are distinguishable in tests.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeResultGroupCard from './RecipeResultGroupCard.svelte';

  let {
    resultGroups = [],
    complex = true,
    componentOptions = [],
    // Result routing (routed systems only). `ingredientSets` is this scope's set
    // list (read to build per-result-set options + current assignments);
    // `outcomeTierOptions` is the system's routed-check tiers. Ingredient-mode
    // assignment is written via onAssignIngredientSet(groupId, setId, assigned).
    routingProvider = null,
    ingredientSets = [],
    outcomeTierOptions = [],
    onAssignIngredientSet = () => {},
    onChange = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const groups = $derived(Array.isArray(resultGroups) ? resultGroups : []);
  const sets = $derived(Array.isArray(ingredientSets) ? ingredientSets : []);
  const tierOptions = $derived(Array.isArray(outcomeTierOptions) ? outcomeTierOptions : []);

  function setDisplayName(set, index) {
    const name = String(set?.name || '').trim();
    return name || `${text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')} ${index + 1}`;
  }

  // Ingredient-set options for one result group: a set already routed to another
  // group is disabled (a set routes to at most one result group).
  function ingredientOptionsFor(group) {
    return sets.map((set, index) => ({
      id: set.id,
      name: setDisplayName(set, index),
      disabled: !!set.resultGroupId && set.resultGroupId !== group.id
    }));
  }

  function assignedSetIdsFor(group) {
    return sets.filter((set) => set.resultGroupId === group.id).map((set) => set.id);
  }

  // Outcome-tier options for one result group: a tier assigned to another group
  // (by index, robust for not-yet-saved id-less groups) is disabled.
  function tierOptionsFor(index) {
    const elsewhere = new Set(
      groups
        .filter((_, i) => i !== index)
        .flatMap((group) => (Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : []))
    );
    return tierOptions.map((tier) => ({
      id: tier.id,
      name: tier.name,
      disabled: elsewhere.has(tier.id)
    }));
  }

  // Defensive: never let the simple (chromeless, single-group) render hide extra
  // groups. Trimming to one group is the confirmed store path; if a recipe is
  // somehow flagged simple while still holding >1 group, fall back to the full
  // list so the first edit can't silently drop group[1..].
  const effectiveComplex = $derived(complex || groups.length > 1);

  // Simple mode shows exactly one chromeless group bound to the first group. If
  // none exists yet, synthesize an empty placeholder for editing.
  const simpleGroup = $derived(groups[0] || { results: [] });

  // Preserve the existing group's id/name (referenced by routing) by spreading it
  // under the edit. Only synthesize a fresh id-less group when none exists yet —
  // never write a freshly-synthesized group over an existing one.
  function updateSimpleGroup(nextGroup) {
    if (groups.length > 0) {
      onChange([{ ...groups[0], ...nextGroup }]);
      return;
    }
    onChange([nextGroup]);
  }

  function updateGroup(index, nextGroup) {
    onChange(groups.map((group, i) => (i === index ? nextGroup : group)));
  }

  function addGroup() {
    onChange([...groups, { name: '', results: [] }]);
  }

  function removeGroup(index) {
    onChange(groups.filter((_, i) => i !== index));
  }
</script>

<section class="manager-task-core-card manager-recipe-section" data-recipe-section={`${idPrefix}results`}>
  <div class="manager-task-card-heading">
    <div>
      <h3>{text('FABRICATE.Admin.Manager.Recipe.ResultsSection', 'Results')}</h3>
    </div>
  </div>
  {#if !effectiveComplex}
    <!-- Simple mode: a single result group with no Set-N label, remove, or add-set. -->
    <div class="manager-recipe-result-set-simple" data-recipe-result-simple>
      <RecipeResultGroupCard
        group={simpleGroup}
        chromeless={true}
        {componentOptions}
        onChange={(nextGroup) => updateSimpleGroup(nextGroup)}
      />
    </div>
  {:else if groups.length === 0}
    <div class="manager-recipe-section-empty">
      <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmpty', 'No results yet')}</p>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmptyHint', 'Add a set of items this recipe can produce.')}</p>
      <button type="button" class="manager-button" data-recipe-add="result-set" onclick={() => addGroup()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
      </button>
    </div>
  {:else}
    <ul class="manager-recipe-ingredient-sets">
      {#each groups as group, index (group?.id || index)}
        <li class="manager-recipe-ingredient-set-item">
          {#if index > 0}
            <div class="manager-recipe-ingredient-set-or" aria-hidden="true">
              <span>{text('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>
            </div>
          {/if}
          <RecipeResultGroupCard
            {group}
            {componentOptions}
            {routingProvider}
            ingredientSetOptions={ingredientOptionsFor(group)}
            assignedIngredientSetIds={assignedSetIdsFor(group)}
            outcomeTierOptions={tierOptionsFor(index)}
            onAssignIngredientSet={(setId, assigned) =>
              onAssignIngredientSet(group?.id || null, setId, assigned)}
            onChange={(nextGroup) => updateGroup(index, nextGroup)}
            onRemove={() => removeGroup(index)}
          />
        </li>
      {/each}
    </ul>
    <button type="button" class="manager-button" data-recipe-add="result-set" onclick={() => addGroup()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
    </button>
  {/if}
</section>
