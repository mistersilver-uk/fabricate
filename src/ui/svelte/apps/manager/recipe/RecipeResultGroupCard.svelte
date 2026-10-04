<!-- Svelte 5 runes mode -->
<!--
  One result group, each item a `PickerRow` naming a component with a fixed or rolled amount, or on
  a progressive stage a DC and an Edit link in its `trailing`, emitted as a shallow-updated copy
  through `onChange(nextGroup)` with an id and a `componentId` on every item it creates. An empty
  group or a component-less item is gated at the save path (`Recipe.validate`), not here, and on a
  non-terminal step an empty group is a finished state rather than a draft (issue 1907).

  Invariants:
  - Rows are keyed by item id, because a row's Fixed | Rolled state is per instance — pinned by
    `tests/components/recipe-result-card-mounted.test.js`.
  - A row's amount error is the save path's own floor, `quantityFormulaErrors` (`resultRows.js`).
-->
<script>
  import { localizeOr } from '../../../util/localizeOr.js';
  import PickerRow from './PickerRow.svelte';
  import { fromValue, toValue } from './pickerRowKinds.js';
  import { componentCatalogue, resultAmountInvalid, withAddedResult } from './resultRows.js';
  import RecipeRoutingAssignment from './RecipeRoutingAssignment.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import RecipeStageComplicationBand from './RecipeStageComplicationBand.svelte';

  let {
    group = {},
    chromeless = false,
    componentOptions = [],
    // Routed result routing (non-chromeless only): 'ingredientSet' assigns ingredient sets
    // (`ingredientSet.resultGroupId`), 'check' assigns routed-check outcome tiers
    // (`group.checkOutcomeIds`), and otherwise a free-text result-set name is shown.
    routingProvider = null,
    ingredientSetOptions = [],
    assignedIngredientSetIds = [],
    // POLICY-CONDITIONAL: success-filtered when `craftingCheck.failureResultPolicy` forbids
    // failure results and unfiltered when it permits them, so a result set binds to a
    // failure-marked tier exactly where the engine routes one. `recipeReadiness` reads the SAME
    // swap, so the picker and the readiness warnings cannot disagree.
    outcomeTierOptions = [],
    // Whether the routed check has ANY outcome tier: with `outcomeTierOptions` empty it tells
    // "no tiers authored yet" from "tiers exist but none is offerable" for the empty hint.
    outcomeTiersDefined = false,
    // Whether the failure-result policy permits results on a failed check. Its ONLY use here is
    // the third empty hint: marking a tier Success is not the only remedy under a forbidding
    // policy, and allowing failure results is the one a ruined-output recipe wants.
    failureResultsAllowed = false,
    // Alchemy Simple two-slot editor. `staticLabel` replaces the free-text name input with a
    // fixed header label; `reserved` marks the failure slot with a warning icon; `roleAccent`
    // tones the static label; `hideRemove` suppresses the remove button on both slots.
    staticLabel = '',
    reserved = false,
    roleAccent = '',
    hideRemove = false,
    // Progressive systems award the group's results in ORDER — the award loop spends the check
    // budget down the list — so each row grows a reorder affordance. Other modes render as-is.
    progressive = false,
    // Whether this card's scope is the recipe, or the terminal step of a multi-step recipe. Only
    // a terminal scope must produce, so an empty group elsewhere is authored intent (issue 1907).
    isTerminalStep = true,
    onAssignIngredientSet = () => {},
    onChange = () => {},
    onRemove = () => {},
    // Deep link from a progressive row's read-only difficulty badge to the component editor.
    onOpenComponent = () => {},
  } = $props();

  // THE CONTROL HALF of the validation row action. An unrouted-result-set warning is about THIS
  // set's routing, so the card is the destination and `recipeReadiness.js` addresses it as
  // `result-group-<id>` — the same literal on both sides, held together behaviourally by the pair
  // of gates that file's header names. An id-less draft group gets no address.
  const validationTarget = $derived(group?.id ? `result-group-${group.id}` : undefined);

  const results = $derived(Array.isArray(group?.results) ? group.results : []);

  // A splice emits the reordered group; the drag and keyboard halves are the list's (issue 1512).
  function reorderItem(from, to) {
    if (from === to || from < 0 || to < 0 || from >= results.length || to >= results.length) return;
    const next = results.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...group, results: next });
  }

  // Both halves of reorder are the list's now (issue 1512), and so are the read-the-name-first
  // rule this file established, the focus move and the polite live region.
  function componentNameFor(item) {
    const match = (componentOptions || []).find((option) => option.id === item?.componentId);
    return match?.name || localizeOr('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result');
  }

  // The band's content, decided here because the same filter decides whether the row draws a body
  // at all (issue 1512): `alwaysOpen` renders the body snippet for every row, so a stage whose
  // component authors no crafting complication would otherwise draw an empty padded box. The
  // unredacted authored list off the projection the difficulty badge reads, filtered to crafting
  // because a salvage-only complication says nothing about a recipe stage.
  function stageComplicationsFor(item) {
    const match = (componentOptions || []).find((option) => option.id === item?.componentId);
    return Array.isArray(match?.complications)
      ? match.complications.filter((complication) => complication?.activities?.crafting === true)
      : [];
  }

  // Routing provider: 'ingredientSet' is Ingredient routing; 'check'
  // routes by the system crafting-check outcome.
  const isIngredientRouting = $derived(routingProvider === 'ingredientSet');
  const isCheckRouting = $derived(routingProvider === 'check');
  const checkOutcomeIds = $derived(
    Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : []
  );

  function addOutcomeTier(id) {
    if (checkOutcomeIds.includes(id)) return;
    onChange({ ...group, checkOutcomeIds: [...checkOutcomeIds, id] });
  }

  function removeOutcomeTier(id) {
    onChange({ ...group, checkOutcomeIds: checkOutcomeIds.filter((tierId) => tierId !== id) });
  }

  // A result names a component and nothing else until `Result.kind` lands (issue 1773).
  const RESULT_KINDS = ['component'];
  const catalogue = $derived(componentCatalogue(componentOptions));

  function componentFor(item) {
    return (componentOptions || []).find((option) => option.id === item?.componentId) || null;
  }

  // `difficulty` is projected onto the component options; one never given reads as unset, not 0.
  function difficultyOf(component) {
    const difficulty = Number(component?.difficulty);
    return component && Number.isFinite(difficulty) ? difficulty : null;
  }

  // A stage's delete names its component, as a flat row's remove does.
  const removeNameFor = (item) =>
    localizeOr('FABRICATE.Admin.Manager.Recipe.RemoveNamed', 'Remove {name}', {
      name: componentNameFor(item),
    });

  const componentPickerOptions = $derived(
    (componentOptions || []).map((option) => ({
      id: option.id,
      label: option.name,
      img: option.img,
    }))
  );

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // Spread the existing group so its id and name, which routing references, survive.
  function setName(name) {
    onChange({ ...group, name });
  }

  function updateItem(index, nextItem) {
    onChange({ ...group, results: results.map((item, i) => (i === index ? nextItem : item)) });
  }

  function removeItem(index) {
    onChange({ ...group, results: results.filter((_, i) => i !== index) });
  }

  // Progressive always appends: its award loop ignores `quantity` entirely, so repeating a
  // component IS how the GM asks for more of it.
  function addItem(id) {
    if (progressive) {
      onChange({ ...group, results: [...results, { id: newId(), componentId: id }] });
      return;
    }
    onChange({ ...group, results: withAddedResult(results, id, newId()) });
  }

  // THE THREE-WAY EMPTY HINT, a guard chain rather than nested ternaries, and its ORDER is the
  // point: "there are no tiers" must be answered before "none can be offered", or a system with
  // no outcome tiers at all would be told to change a policy.
  const outcomeTierEmptyHint = $derived.by(() => {
    if (!outcomeTiersDefined) {
      return localizeOr(
        'FABRICATE.Admin.Manager.Recipe.RoutingNoOutcomeTiers',
        'Define outcome tiers in the routed crafting check first.'
      );
    }
    if (!failureResultsAllowed) {
      return localizeOr(
        'FABRICATE.Admin.Manager.Recipe.RoutingNoSuccessOutcomeTiersPolicy',
        'Every outcome tier on this check is a failure, and this system produces nothing on a failed check. Mark a tier as a Success, or let failed checks produce a result on the crafting check’s On failure section.'
      );
    }
    return localizeOr(
      'FABRICATE.Admin.Manager.Recipe.RoutingNoSuccessOutcomeTiers',
      'No outcome tier is marked as a Success. Mark one as Success in the crafting check to route a result set to it.'
    );
  });
</script>

<div
  class={`manager-recipe-ingredient-set ${chromeless ? 'is-chromeless' : ''} ${reserved ? 'is-reserved' : ''}`}
  data-recipe-set
  data-recipe-result-set-id={group?.id || ''}
  data-validation-target={validationTarget}
  tabindex="-1"
  data-keyboard-focus="true"
>
  {#if !chromeless}
    <div class="manager-recipe-ingredient-set-head">
      {#if staticLabel}
        <div
          class={`manager-recipe-result-set-static-label ${roleAccent ? `is-${roleAccent}` : ''}`}
          data-recipe-result-set-static-label
        >
          {#if reserved}
            <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          {/if}
          <span>{staticLabel}</span>
        </div>
      {:else if isIngredientRouting}
        <RecipeRoutingAssignment
          options={ingredientSetOptions}
          selectedIds={assignedIngredientSetIds}
          label={localizeOr('FABRICATE.Admin.Manager.Recipe.RoutingIngredientSets', 'Produced by')}
          addLabel={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RoutingAddIngredientSet',
            'Add ingredient set'
          )}
          placeholder={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RoutingSearchIngredientSets',
            'Search ingredient sets...'
          )}
          emptyHint={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RoutingNoIngredientSets',
            'Add a named ingredient set first.'
          )}
          onAdd={(id) => onAssignIngredientSet(id, true)}
          onRemove={(id) => onAssignIngredientSet(id, false)}
        />
      {:else if isCheckRouting}
        <RecipeRoutingAssignment
          options={outcomeTierOptions}
          selectedIds={checkOutcomeIds}
          label={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RoutingOutcomeTiers',
            'Produced on outcome'
          )}
          addLabel={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RoutingAddOutcomeTier',
            'Add outcome'
          )}
          placeholder={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RoutingSearchOutcomeTiers',
            'Search outcomes...'
          )}
          emptyHint={outcomeTierEmptyHint}
          onAdd={(id) => addOutcomeTier(id)}
          onRemove={(id) => removeOutcomeTier(id)}
        />
      {:else}
        <input
          type="text"
          class="manager-recipe-ingredient-set-name"
          data-recipe-result-set-field="name"
          placeholder={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.ResultSetNamePlaceholder',
            'Result set name'
          )}
          value={group?.name || ''}
          onchange={(e) => setName(e.target.value)}
          aria-label={localizeOr('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')}
        />
      {/if}
      {#if !hideRemove && !reserved}
        <IconButton
          class="is-danger"
          data-recipe-remove="result-set"
          ariaLabel={localizeOr(
            'FABRICATE.Admin.Manager.Recipe.RemoveResultSet',
            'Remove result set'
          )}
          title={localizeOr('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set')}
          onclick={() => onRemove()}><i class="fas fa-trash" aria-hidden="true"></i></IconButton
        >
      {/if}
    </div>
  {/if}

  {#if results.length === 0 && !isTerminalStep}
    <p class="manager-muted" data-recipe-result-empty>
      {localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ResultSetEmptyIntermediatePanel',
        'Nothing produced on this step — it only advances the craft.'
      )}
    </p>
  {:else if results.length === 0}
    <!-- Danger-bordered dashed panel: an outcome that produces nothing is a gap. -->
    <div class="manager-recipe-result-empty" data-recipe-result-empty>
      <p class="manager-muted">
        {localizeOr(
          'FABRICATE.Admin.Manager.Recipe.ResultSetEmptyPanel',
          'Nothing produced on this outcome.'
        )}
      </p>
    </div>
  {:else}
    {#if progressive}
      <!-- Progressive is an ordered list, so it is the shared one (issue 1512). The band is the
           list's body rather than part of the row's content, because it is full-bleed, and
           `alwaysOpen` renders it with no disclosure since a stage's band is not something a GM
           opens. The delete is the list's own, so it trails the rocker as the specimen states;
           `removeData` keeps `data-recipe-remove="result-item"`, the hook the mounted suites and
           the smoke harness address a stage's delete by. -->
      <SortableList
        items={results}
        itemLabel={componentNameFor}
        numbered
        alwaysOpen
        removable
        onReorder={(from, to) => reorderItem(from, to)}
        onRemove={(item) => removeItem(results.indexOf(item))}
        removeData={(item) => ({
          'data-recipe-remove': 'result-item',
          ariaLabel: removeNameFor(item),
          title: removeNameFor(item),
        })}
        rowClass={(item) =>
          stageComplicationsFor(item).length > 0
            ? 'manager-recipe-stage-row has-band'
            : 'manager-recipe-stage-row'}
        rowData={() => ({ 'data-recipe-result-row': '' })}
      >
        {#snippet row(item, index)}
          <PickerRow
            value={toValue(item)}
            kinds={RESULT_KINDS}
            {catalogue}
            amount={false}
            removable={false}
            class="is-result"
            data-recipe-result-item=""
            onChange={(value) => updateItem(index, fromValue(item, value))}
          >
            {#snippet trailing()}
              {@render stageControls(item)}
            {/snippet}
          </PickerRow>
        {/snippet}
        {#snippet body(item)}
          <RecipeStageComplicationBand
            complications={stageComplicationsFor(item)}
            componentId={item?.componentId || ''}
          />
        {/snippet}
        {#snippet footer()}
          <li class="manager-recipe-ingredient-set-add">{@render resultAdder()}</li>
        {/snippet}
      </SortableList>
    {:else}
      <div class="manager-recipe-ingredient-set-groups">
        {#each results as item, index (item?.id || index)}
          <PickerRow
            value={toValue(item)}
            kinds={RESULT_KINDS}
            {catalogue}
            rollable
            clearable={false}
            removeHook="result-item"
            invalid={resultAmountInvalid(item, localizeOr)}
            class="is-result"
            data-recipe-result-item=""
            onChange={(value) => updateItem(index, fromValue(item, value))}
            onRemove={() => removeItem(index)}
          />
        {/each}
      </div>
    {/if}
  {/if}

  <!-- The adder follows the empty message (issue 1512): a footer of a list that is not rendered
       cannot render, so at zero results and on every non-progressive set it is this sibling. -->
  {#if !progressive || results.length === 0}
    <div class="manager-recipe-ingredient-set-add">{@render resultAdder()}</div>
  {/if}
</div>

<!-- A stage's read-only `DC n` and its separate Edit deep link: the component editor's Difficulty
     card owns `component.difficulty`, so the link is the only route to changing it. -->
{#snippet stageControls(item)}
  {@const component = componentFor(item)}
  {@const difficulty = difficultyOf(component)}
  <span
    class="manager-recipe-stage-dc"
    data-recipe-result-difficulty={difficulty === null ? '' : String(difficulty)}
    >{difficulty === null
      ? localizeOr('FABRICATE.Admin.Manager.Recipe.DifficultyUnset', 'No difficulty')
      : `${localizeOr('FABRICATE.Admin.Manager.Recipe.DifficultyShort', 'DC')} ${difficulty}`}</span
  >
  {#if component}
    <button
      type="button"
      data-keyboard-focus="true"
      class="manager-recipe-stage-edit"
      data-recipe-result-edit={item.componentId}
      aria-label={`${localizeOr('FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty', 'Edit difficulty on the component')} — ${component.name}`}
      title={localizeOr(
        'FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty',
        'Edit difficulty on the component'
      )}
      onclick={() => onOpenComponent(item.componentId)}
    >
      <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.EditDifficulty', 'Edit')}</span>
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
    </button>
  {/if}
{/snippet}

{#snippet resultAdder()}
  <SearchablePopover
    options={componentPickerOptions}
    pickerClass="manager-recipe-component-picker manager-recipe-add-component"
    triggerClass="fabricate-button is-dashed manager-recipe-add-component-trigger manager-recipe-add-result"
    triggerIcon="fas fa-plus"
    triggerLabel={progressive
      ? localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultStage', 'Add result stage')
      : localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
    ariaLabel={progressive
      ? localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultStage', 'Add result stage')
      : localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
    triggerAddMarker="result-item"
    panelLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
    searchPlaceholder={localizeOr(
      'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
      'Search components...'
    )}
    searchLabel={localizeOr(
      'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
      'Search components...'
    )}
    emptyHint={localizeOr(
      'FABRICATE.Admin.Manager.Recipe.NoComponentsDefined',
      'No components defined'
    )}
    showChevron={false}
    onSelect={(id) => addItem(id)}
  />
{/snippet}

<style>
  .manager-recipe-ingredient-set.is-reserved {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
