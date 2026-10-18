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
  import { tick } from 'svelte';
  import EmptyState from '../../../components/EmptyState.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import RecipeResultGroupCard from './RecipeResultGroupCard.svelte';
  import Button from '../../../components/Button.svelte';
  import Callout from '../../../components/Callout.svelte';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import { rendersBare, setDisplayName, withSoleEntry } from './setDrafts.js';
  import { buildRoutingModel } from './recipeRoutingModel.js';
  import { assignCandidates, inboundChips } from './resultSetSources.js';
  import {
    addResultGroup,
    alchemySlots,
    routeTier,
    withFailureSet,
    withResultSlot,
  } from './recipeRoutingEdits.js';

  let {
    resultGroups = [],
    // The two-slot editor instead of the add/remove list: the reserved "On success" set, and the
    // reserved "On a failed check" set only while "Award results on a failed check" is on.
    alchemySimple = false,
    componentOptions = [],
    // The card's `surface` and `resultKinds`: `'recipe'` with what a result row offers and names,
    // forwarded to every group card; a gathering task passes neither.
    surface = 'gathering',
    resultKinds = null,
    // Result routing (routed systems only): `ingredientSets` are the sets that route, and
    // `outcomeTierOptions` the routed-check tiers the failure-result policy offers, out of
    // `routedOutcomeTiers`, every tier the system defines, which names a tier that does not route.
    routingProvider = null,
    ingredientSets = [],
    outcomeTierOptions = [],
    routedOutcomeTiers = [],
    // `routedMinimum`'s output, which strikes a success tier below the recipe's minimum.
    routedMinimum = {},
    outcomeTiersDefined = false,
    // Forwarded to each group card's third empty hint. A tab prop not ALSO forwarded here
    // silently defaults, which is why the whole chain is spelled out.
    failureResultsAllowed = false,
    // Progressive systems award this group's results in order; forwarded to the group card.
    progressive = false,
    // Whether this scope is the recipe, or the TERMINAL step of a multi-step recipe. Only a
    // terminal scope must produce, so an empty group elsewhere is legal (issue 1907). Defaults
    // true so a caller with no step concept keeps today's danger-toned empty panel.
    isTerminalStep = true,
    onAssignIngredientSet = () => {},
    onChange = () => {},
    // Deep link from a progressive row's difficulty badge to the component editor.
    onOpenComponent = () => {},
    // The failure-results callout's link to the Checks tab, drawn while the policy forbids them.
    onOpenChecks = () => {},
    idPrefix = '',
  } = $props();

  const groups = $derived(Array.isArray(resultGroups) ? resultGroups : []);
  const sets = $derived(Array.isArray(ingredientSets) ? ingredientSets : []);
  const tierOptions = $derived(Array.isArray(outcomeTierOptions) ? outcomeTierOptions : []);

  // Result routing lives in the group HEAD, which only renders when the group is chromed, so a
  // routed system always needs chrome or it loses its routing control.
  const isRouted = $derived(routingProvider === 'check' || routingProvider === 'ingredientSet');

  const routing = $derived(
    buildRoutingModel({
      provider: routingProvider,
      ingredientSets: sets,
      resultGroups: groups,
      tiers: tierOptions,
      rankedTiers: Array.isArray(routedOutcomeTiers) ? routedOutcomeTiers : [],
      setName: setDisplayName,
      ...routedMinimum,
    })
  );
  const tierNames = $derived(
    new Map(
      (Array.isArray(routedOutcomeTiers) ? routedOutcomeTiers : []).map((t) => [t.id, t.name])
    )
  );
  const defaultHint = $derived(
    localizeOr('FABRICATE.Admin.Manager.Recipe.RoutingDefault', 'default')
  );
  const deletedTier = $derived(
    localizeOr('FABRICATE.Admin.Manager.Recipe.RoutingDeletedTier', 'Deleted outcome tier')
  );
  // Assigning the first tier ends the default route for every other tier (`tierRoute`).
  const assignNote = $derived(
    routingProvider === 'check' && !groups.some((group) => group?.checkOutcomeIds?.length > 0)
      ? localizeOr(
          'FABRICATE.Admin.Manager.Recipe.RoutingAssignNote',
          'Assigning a tier stops the other tiers reaching a result set by default.'
        )
      : ''
  );
  const FALLBACK_HOWS = new Set(['fallback', 'single', 'name']);

  /** The group at `index`'s `RouteSources` rows: what reaches it, and what Assign offers. */
  function routeRows(group, index) {
    const model = routing;
    const chips = inboundChips({ model, index, group, provider: routingProvider, tierNames });
    return {
      sources: chips.map((chip) => ({
        id: chip.id,
        label: chip.name ?? deletedTier,
        removable: chip.explicit || chip.nonRouting,
        hint: FALLBACK_HOWS.has(chip.how) ? defaultHint : undefined,
        nonRouting: chip.nonRouting,
      })),
      candidates: assignCandidates({ model, index, groups, groupName: setDisplayName }).map(
        (candidate) => ({ id: candidate.id, label: candidate.name, routedTo: candidate.routedTo })
      ),
      assigned: chips.filter((chip) => chip.explicit).map((chip) => chip.id),
      sharedCount: model.inbound[index]?.length ?? 0,
      unreachable: model.unreachable.includes(index),
    };
  }

  const NOT_ROUTED = {
    sources: [],
    candidates: [],
    assigned: [],
    sharedCount: 0,
    unreachable: false,
  };
  const rows = $derived(groups.map((group, i) => (isRouted ? routeRows(group, i) : NOT_ROUTED)));

  // An ingredient set routes by its own `resultGroupId`; a tier is listed by one group alone, so
  // an add moves it here and writes nothing when this group is already its only lister.
  function route(group, index, id, add) {
    if (routingProvider === 'ingredientSet') {
      onAssignIngredientSet(group?.id || null, id, add);
      return;
    }
    if (add) {
      const next = routeTier(groups, id, index);
      if (next !== groups) onChange(next);
      return;
    }
    const listed = Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : [];
    updateGroup(index, { ...group, checkOutcomeIds: listed.filter((tierId) => tierId !== id) });
  }

  // Rendering complexity is EMERGENT from structure, with no stored Simple/Complex flag: several
  // groups get the set chrome, a single NON-routed group renders chromeless, and a routed mode
  // keeps chrome whatever the count so its routing head stays available.
  const effectiveComplex = $derived(!rendersBare(groups.length, { routed: isRouted }));

  // Simple mode binds one chromeless group to the first, synthesizing an empty one if absent.
  const simpleGroup = $derived(groups[0] || { results: [] });

  function updateGroup(index, nextGroup) {
    onChange(groups.map((group, i) => (i === index ? nextGroup : group)));
  }

  // The two-slot view. A card's edit writes the success set, and the failure set only when it
  // exists, spreading each to preserve its id and name; only the toggle adds or removes it.
  const alchemy = $derived(alchemySlots(groups));
  const failureBlocked = $derived(!alchemy.failure && !failureResultsAllowed);
  let twoSlotRoot = $state(null);

  function updateAlchemyPair(slot, nextGroup) {
    onChange(withResultSlot(groups, slot, nextGroup));
  }

  // Under a forbidding policy the switch disables once the set is gone, so focus moves to the link.
  async function toggleFailureSet(on) {
    const next = withFailureSet(groups, on);
    if (next === groups) return;
    onChange(next);
    if (on || failureResultsAllowed) return;
    await tick();
    twoSlotRoot?.querySelector('[data-recipe-failure-results-checks]')?.focus();
  }

  function addGroup() {
    onChange(addResultGroup(groups));
  }

  function removeGroup(index) {
    onChange(groups.filter((_, i) => i !== index));
  }
</script>

<section
  class="manager-recipe-results-section"
  data-recipe-section={`${idPrefix}results`}
  data-set-card-scope
>
  {#if alchemySimple}
    <!-- The success set, the failure set once opted into, then the toggle; no add-set or kebab. -->
    <div
      class="manager-recipe-result-set-alchemy-simple"
      data-recipe-result-alchemy-simple
      bind:this={twoSlotRoot}
    >
      <RecipeResultGroupCard
        group={alchemy.success}
        {componentOptions}
        {surface}
        {resultKinds}
        {onOpenComponent}
        reservedRole="success"
        staticLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.AlchemyOnSuccess', 'On success')}
        onChange={(nextGroup) => updateAlchemyPair('success', nextGroup)}
      />
      {#if alchemy.failure}
        <RecipeResultGroupCard
          group={alchemy.failure}
          {componentOptions}
          {surface}
          {resultKinds}
          {onOpenComponent}
          {failureResultsAllowed}
          reservedRole="failure"
          staticLabel={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.AlchemyOnFailure',
            'On a failed check'
          )}
          onChange={(nextGroup) => updateAlchemyPair('failure', nextGroup)}
        />
      {/if}
      <ToggleCard
        variant=""
        icon=""
        section={`${idPrefix}failure-results`}
        field="failureResults"
        title={localizeOr(
          'FABRICATE.Admin.Manager.Recipe.FailureResultsTitle',
          'Award results on a failed check'
        )}
        sub={localizeOr(
          'FABRICATE.Admin.Manager.Recipe.FailureResultsSub',
          'Adds an “On a failed check” result set; turning it off removes the set and its results.'
        )}
        on={Boolean(alchemy.failure)}
        disabled={failureBlocked}
        toggleTitle={failureBlocked
          ? localizeOr(
              'FABRICATE.Admin.Manager.Recipe.FailureResultsBlockedTooltip',
              'This system produces nothing on a failed check, so there is no failure set to add.'
            )
          : ''}
        onToggle={toggleFailureSet}
      />
      {#if !failureResultsAllowed}
        <Callout
          tone="neutral"
          title={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.FailureResultsPolicyTitle',
            'Failed checks produce nothing on this system'
          )}
          text={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.FailureResultsPolicyText',
            'To award results on a failed check, set “Produce a result on a failed check” to Decided per recipe or Always on the crafting check’s On failure section.'
          )}
          data-recipe-failure-results-policy
        >
          {#snippet actions()}
            <Button role="ghost" data-recipe-failure-results-checks onclick={() => onOpenChecks()}>
              <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
              <span
                >{localizeOr(
                  'FABRICATE.Admin.Manager.Recipe.FailureResultsOpenChecks',
                  'Open the crafting check'
                )}</span
              >
            </Button>
          {/snippet}
        </Callout>
      {/if}
    </div>
  {:else if !effectiveComplex}
    <!-- Simple mode: a single result group with no Set-N label, remove, or add-set. -->
    <div class="manager-recipe-result-set-simple" data-recipe-result-simple>
      <RecipeResultGroupCard
        group={simpleGroup}
        chromeless={true}
        {componentOptions}
        {surface}
        {resultKinds}
        {progressive}
        {isTerminalStep}
        {onOpenComponent}
        onChange={(nextGroup) => onChange(withSoleEntry(groups, nextGroup))}
      />
    </div>
  {:else if groups.length === 0}
    <EmptyState
      compact
      icon="fas fa-gift"
      title={localizeOr('FABRICATE.Admin.Manager.Recipe.ResultsEmpty', 'No results yet')}
      hint={localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ResultsEmptyHint',
        'Add a set of items this recipe can produce.'
      )}
      contextClass="manager-recipe-tab-empty"
    >
      <Button
        role="dashed"
        fullWidth
        data-recipe-add="result-set"
        data-set-card-remove-fallback
        onclick={() => addGroup()}
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
      </Button>
    </EmptyState>
  {:else}
    <!-- Results has NO OR relationship between groups: the producing one is chosen at craft
         time by routing, so no OR divider sits between them. -->
    <ul class="manager-recipe-result-groups">
      {#each groups as group, index (group?.id || index)}
        <li class="manager-recipe-result-group-item">
          <RecipeResultGroupCard
            {group}
            setIndex={index}
            {componentOptions}
            {surface}
            {resultKinds}
            {routingProvider}
            {progressive}
            {isTerminalStep}
            {onOpenComponent}
            sources={rows[index].sources}
            candidates={rows[index].candidates}
            assigned={rows[index].assigned}
            sharedCount={rows[index].sharedCount}
            unreachable={rows[index].unreachable}
            {assignNote}
            {outcomeTiersDefined}
            {failureResultsAllowed}
            onRoute={(id, add) => route(group, index, id, add)}
            onChange={(nextGroup) => updateGroup(index, nextGroup)}
            onRemove={() => removeGroup(index)}
          />
        </li>
      {/each}
    </ul>
    <Button
      role="dashed"
      fullWidth
      data-recipe-add="result-set"
      data-set-card-remove-fallback
      onclick={() => addGroup()}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
      <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultSet', 'Add result set')}</span>
    </Button>
  {/if}
</section>
