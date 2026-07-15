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
    // Alchemy Simple mode (issue 554): render a FIXED two-slot view — a labeled
    // "On success" result set + a reserved, undeletable "On a failed check" set —
    // instead of the generic add/remove group list. Decoupled from `complex`.
    alchemySimple = false,
    componentOptions = [],
    // Result routing (routed systems only). `ingredientSets` is this scope's set
    // list (read to build per-result-set options + current assignments);
    // `outcomeTierOptions` is the system's routed-check tiers. Ingredient-mode
    // assignment is written via onAssignIngredientSet(groupId, setId, assigned).
    routingProvider = null,
    ingredientSets = [],
    outcomeTierOptions = [],
    outcomeTiersDefined = false,
    // Progressive systems award this group's results in order; forwarded to the
    // group card so it renders drag-reorder handles on the result rows.
    progressive = false,
    onAssignIngredientSet = () => {},
    onChange = () => {},
    // Deep-link from a progressive row's read-only difficulty badge to the component
    // editor's Difficulty card.
    onOpenComponent = () => {},
    idPrefix = ''
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // Generate an id eagerly at add time (rather than relying on the store's
  // normalization at save) so a brand-new result set is immediately routable.
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

  // Result routing lives in the group HEAD (the "Produced on outcome" / "Produced by"
  // assignment), which only renders when the group is chromed — so a routed system
  // always needs chrome, even for a single group, or it would lose its routing control.
  const isRouted = $derived(routingProvider === 'check' || routingProvider === 'ingredientSet');

  // Rendering complexity is EMERGENT from structure (issue 643): multiple result
  // groups get the set chrome; a single, NON-routed result group renders CHROMELESS
  // (no "Set 1" box). Routed modes (check/ingredients) keep chrome regardless of count
  // so their per-group routing head stays available. No stored Simple/Complex flag.
  const effectiveComplex = $derived(groups.length > 1 || isRouted);

  // Simple mode shows exactly one chromeless group bound to the first group. If
  // none exists yet, synthesize an empty placeholder for editing.
  const simpleGroup = $derived(groups[0] || { results: [] });

  // Preserve the existing group's id/name (referenced by routing) by spreading it
  // under the edit. Only synthesize a fresh id-less group when none exists yet —
  // never write a freshly-synthesized group over an existing one.
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

  // Alchemy Simple two-slot view. The success set is the first non-failure group
  // (mirroring `simpleGroup`); the failure set is the reserved `role: 'failure'`
  // group, synthesized empty for display when absent. On either card's edit both
  // slots are reconstructed (spread-to-preserve id/name like `updateSimpleGroup`),
  // stamping `role: 'failure'` onto the failure slot — persist-on-first-edit.
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
    <!-- Alchemy Simple: exactly two labeled result sets (success + reserved failure);
         no add-set, no remove on either. -->
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
    <div class="manager-recipe-section-empty">
      <p class="manager-recipe-section-empty-title">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmpty', 'No results yet')}</p>
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.ResultsEmptyHint', 'Add a set of items this recipe can produce.')}</p>
      <button type="button" class="manager-button is-dashed manager-recipe-add-full" data-recipe-add="result-set" onclick={() => addGroup()}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
      </button>
    </div>
  {:else}
    <!-- Results has NO OR relationship between groups (§C2): the producing group is
         chosen at craft time by outcome/routing, so no OR divider sits between them. -->
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
            onAssignIngredientSet={(setId, assigned) =>
              onAssignIngredientSet(group?.id || null, setId, assigned)}
            onChange={(nextGroup) => updateGroup(index, nextGroup)}
            onRemove={() => removeGroup(index)}
          />
        </li>
      {/each}
    </ul>
    <button type="button" class="manager-button is-dashed manager-recipe-add-full" data-recipe-add="result-set" onclick={() => addGroup()}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
    </button>
  {/if}
</section>
