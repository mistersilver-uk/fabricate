<!-- Svelte 5 runes mode -->
<!--
  Result-groups section for a single recipe scope (the recipe, or one step). It owns the
  group-level add/remove and forwards every edit upward as a whole replacement array via
  `onChange(nextGroups)`; the store normalizes through `Recipe.fromJSON`, so new groups and items
  are appended id-less and nothing here hand-assigns an id.

  Outcome routing references a group by id and roll-table selection by name, so every edit path
  SPREADS the existing group rather than synthesizing a fresh one over it. Empty groups and
  component-less items are gated at the model/save path, so one rendered here mid-edit is
  expected. `idPrefix` namespaces the `data-recipe-section` marker per instance.
-->
<script>
  import EmptyState from '../../../components/EmptyState.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeResultGroupCard from './RecipeResultGroupCard.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';

  let {
    resultGroups = [],
    // Alchemy Simple mode: a FIXED two-slot view — a labeled "On success" set plus a reserved,
    // undeletable "On a failed check" set — instead of the generic add/remove list.
    alchemySimple = false,
    componentOptions = [],
    // Result routing (routed systems only): `ingredientSets` builds the per-result-set options
    // and assignments, `outcomeTierOptions` is the system's routed-check tiers.
    routingProvider = null,
    ingredientSets = [],
    outcomeTierOptions = [],
    outcomeTiersDefined = false,
    // Forwarded to each group card's third empty hint. A tab prop not ALSO forwarded here
    // silently defaults, which is why the whole chain is spelled out.
    failureResultsAllowed = false,
    // Progressive systems award this group's results in order; forwarded to the group card.
    progressive = false,
    onAssignIngredientSet = () => {},
    onChange = () => {},
    // Deep link from a progressive row's difficulty badge to the component editor.
    onOpenComponent = () => {},
    idPrefix = '',
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // An id eagerly at add time, rather than at the store's save normalization, so a brand-new
  // result set is immediately routable.
  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  const groups = $derived(Array.isArray(resultGroups) ? resultGroups : []);
  const sets = $derived(Array.isArray(ingredientSets) ? ingredientSets : []);
  const tierOptions = $derived(Array.isArray(outcomeTierOptions) ? outcomeTierOptions : []);

  function setDisplayName(set, index) {
    const name = String(set?.name || '').trim();
    return name || `${text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')} ${index + 1}`;
  }

  // Ingredient-set options for one group: a set routes to at most one, so an already-routed
  // set is disabled.
  function ingredientOptionsFor(group) {
    return sets.map((set, index) => ({
      id: set.id,
      name: setDisplayName(set, index),
      disabled: !!set.resultGroupId && set.resultGroupId !== group.id,
    }));
  }

  function assignedSetIdsFor(group) {
    return sets.filter((set) => set.resultGroupId === group.id).map((set) => set.id);
  }

  // Outcome-tier options for one group: a tier assigned to another (by INDEX, which an
  // unsaved id-less group still has) is disabled.
  function tierOptionsFor(index) {
    const elsewhere = new Set(
      groups
        .filter((_, i) => i !== index)
        .flatMap((group) => (Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : []))
    );
    return tierOptions.map((tier) => ({
      id: tier.id,
      name: tier.name,
      disabled: elsewhere.has(tier.id),
    }));
  }

  // Result routing lives in the group HEAD, which only renders when the group is chromed, so a
  // routed system always needs chrome or it loses its routing control.
  const isRouted = $derived(routingProvider === 'check' || routingProvider === 'ingredientSet');

  // Rendering complexity is EMERGENT from structure, with no stored Simple/Complex flag: several
  // groups get the set chrome, a single NON-routed group renders chromeless, and a routed mode
  // keeps chrome whatever the count so its routing head stays available.
  const effectiveComplex = $derived(groups.length > 1 || isRouted);

  // Simple mode binds one chromeless group to the first, synthesizing an empty one if absent.
  const simpleGroup = $derived(groups[0] || { results: [] });

  // Spread the existing group under the edit so its routing-referenced id and name survive, and
  // synthesize a fresh one ONLY when none exists.
  function updateSimpleGroup(nextGroup) {
    if (groups.length > 0) {
      onChange([{ ...groups[0], ...nextGroup, id: groups[0].id || nextGroup?.id || newId() }]);
      return;
    }
    onChange([{ ...nextGroup, id: nextGroup?.id || newId() }]);
  }

  function updateGroup(index, nextGroup) {
    onChange(groups.map((group, i) => (i === index ? nextGroup : group)));
  }

  // Alchemy Simple two-slot view: the success set is the first non-failure group and the failure
  // set the reserved `role: 'failure'` one, synthesized empty when absent. Either card's edit
  // reconstructs both slots, spreading to preserve id and name — persist-on-first-edit.
  const alchemySuccessGroup = $derived(
    groups.find((group) => group?.role !== 'failure') || groups[0] || { results: [] }
  );
  const alchemyFailureGroup = $derived(
    groups.find((group) => group?.role === 'failure') || { role: 'failure', results: [] }
  );

  function updateAlchemyPair(slot, nextGroup) {
    const success =
      slot === 'success'
        ? {
            ...alchemySuccessGroup,
            ...nextGroup,
            id: alchemySuccessGroup.id || nextGroup?.id || newId(),
          }
        : { ...alchemySuccessGroup, id: alchemySuccessGroup.id || newId() };
    const failure =
      slot === 'failure'
        ? {
            ...alchemyFailureGroup,
            ...nextGroup,
            role: 'failure',
            id: alchemyFailureGroup.id || nextGroup?.id || newId(),
          }
        : { ...alchemyFailureGroup, role: 'failure', id: alchemyFailureGroup.id || newId() };
    onChange([success, failure]);
  }

  function addGroup() {
    onChange([...groups, { id: newId(), name: '', checkOutcomeIds: [], results: [] }]);
  }

  function removeGroup(index) {
    onChange(groups.filter((_, i) => i !== index));
  }
</script>

<section class="manager-recipe-results-section" data-recipe-section={`${idPrefix}results`}>
  {#if alchemySimple}
    <!-- Alchemy Simple: two labeled result sets, no add-set and no remove on either. -->
    <div class="manager-recipe-result-set-alchemy-simple" data-recipe-result-alchemy-simple>
      <RecipeResultGroupCard
        group={alchemySuccessGroup}
        {componentOptions}
        {onOpenComponent}
        hideRemove={true}
        staticLabel={text('FABRICATE.Admin.Manager.Recipe.AlchemyOnSuccess', 'On success')}
        onChange={(nextGroup) => updateAlchemyPair('success', nextGroup)}
      />
      <RecipeResultGroupCard
        group={alchemyFailureGroup}
        {componentOptions}
        {onOpenComponent}
        reserved={true}
        hideRemove={true}
        roleAccent="warning"
        staticLabel={text('FABRICATE.Admin.Manager.Recipe.AlchemyOnFailure', 'On a failed check')}
        onChange={(nextGroup) => updateAlchemyPair('failure', nextGroup)}
      />
    </div>
  {:else if !effectiveComplex}
    <!-- Simple mode: a single result group with no Set-N label, remove, or add-set. -->
    <div class="manager-recipe-result-set-simple" data-recipe-result-simple>
      <RecipeResultGroupCard
        group={simpleGroup}
        chromeless={true}
        {componentOptions}
        {progressive}
        {onOpenComponent}
        onChange={(nextGroup) => updateSimpleGroup(nextGroup)}
      />
    </div>
  {:else if groups.length === 0}
    <EmptyState
      compact
      icon="fas fa-gift"
      title={text('FABRICATE.Admin.Manager.Recipe.ResultsEmpty', 'No results yet')}
      hint={text(
        'FABRICATE.Admin.Manager.Recipe.ResultsEmptyHint',
        'Add a set of items this recipe can produce.'
      )}
      contextClass="manager-recipe-tab-empty"
    >
      <ManagerButton
        role="dashed"
        fullWidth
        data-recipe-add="result-set"
        onclick={() => addGroup()}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
      </ManagerButton>
    </EmptyState>
  {:else}
    <!-- Results has NO OR relationship between groups: the producing one is chosen at craft
         time by routing, so no OR divider sits between them. -->
    <ul class="manager-recipe-result-groups">
      {#each groups as group, index (group?.id || index)}
        <li class="manager-recipe-result-group-item">
          <RecipeResultGroupCard
            {group}
            {componentOptions}
            {routingProvider}
            {progressive}
            {onOpenComponent}
            ingredientSetOptions={ingredientOptionsFor(group)}
            assignedIngredientSetIds={assignedSetIdsFor(group)}
            outcomeTierOptions={tierOptionsFor(index)}
            {outcomeTiersDefined}
            {failureResultsAllowed}
            onAssignIngredientSet={(setId, assigned) =>
              onAssignIngredientSet(group?.id || null, setId, assigned)}
            onChange={(nextGroup) => updateGroup(index, nextGroup)}
            onRemove={() => removeGroup(index)}
          />
        </li>
      {/each}
    </ul>
    <ManagerButton role="dashed" fullWidth data-recipe-add="result-set" onclick={() => addGroup()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
    </ManagerButton>
  {/if}
</section>
