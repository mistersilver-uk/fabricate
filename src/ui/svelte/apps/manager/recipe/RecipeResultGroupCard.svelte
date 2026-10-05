<!-- Svelte 5 runes mode -->
<!--
  One result group, each item a `PickerRow` naming a component, a currency or a taught recipe, with
  a fixed or rolled amount, drawn through the result-side `ChoiceGroup`, which also draws a choice
  group's box; or on a progressive stage a component with a DC and an Edit link in its `trailing`.
  Emitted as a shallow-updated copy through `onChange(nextGroup)`. On a recipe every item it
  creates carries an id and its kind's empty subject (`RecipeResultAdder`), and focus moves to its
  name field; on a gathering task it names the picked component. An empty group or an unnamed item
  is gated at the save path (`Recipe.validate`), not here, and on a non-terminal step an empty group
  is a finished state rather than a draft (issue 1907).

  Invariants:
  - Rows are keyed by item id, because a row's Fixed | Rolled state is per instance — pinned by
    `tests/components/recipe-result-card-mounted.test.js`.
  - A row's amount error is the save path's own floor, `quantityFormulaErrors` (`resultRows.js`).
-->
<script>
  import { localizeOr } from '../../../util/localizeOr.js';
  import { isChoiceGroup } from '../../../../../utils/choiceGroupShape.js';
  import ChoiceGroup from './ChoiceGroup.svelte';
  import PickerRow from './PickerRow.svelte';
  import { emptyResult, fromValue, toValue } from './pickerRowKinds.js';
  import { newDraftId as newId } from './resultGroupEdits.js';
  import { componentCatalogue, withAddedResult } from './resultRows.js';
  import RecipeResultAdder from './RecipeResultAdder.svelte';
  import RecipeRoutingAssignment from './RecipeRoutingAssignment.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import RecipeStageComplicationBand from './RecipeStageComplicationBand.svelte';

  let {
    group = {},
    chromeless = false,
    componentOptions = [],
    // `'recipe'` draws the `Result` adder over `resultKinds` (`recipeResultKinds(…)`), appending an
    // empty row; any other surface, a gathering task's, picks a component and raises a fixed row
    // already producing it. Only a recipe's flat rows are reward rows.
    surface = 'gathering',
    resultKinds = null,
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

  const recipeSurface = $derived(surface === 'recipe');
  const offer = $derived(
    recipeSurface && resultKinds
      ? resultKinds
      : { kinds: ['component'], readonlyKinds: [], catalogue: componentCatalogue(componentOptions) }
  );
  const kinds = $derived(progressive ? ['component'] : offer.kinds);
  const componentPickerOptions = $derived(
    (componentOptions || []).map(({ id, name, img }) => ({ id, label: name, img }))
  );

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

  // Spread the existing group so its id and name, which routing references, survive.
  function setName(name) {
    onChange({ ...group, name });
  }

  let root = $state(null);
  // The control focus moves to once the row at `at` renders: `at` -1 is the set's adder.
  let pendingFocus = null;
  const FIRST_CONTROL = 'button:not([disabled]), input:not([disabled])';

  // An unwrapped group remounts as its last alternative under that alternative's id, taking the
  // focused remove with it, so focus moves to the survivor's `or…`.
  function updateItem(index, nextItem) {
    if (isChoiceGroup(results[index]) && !isChoiceGroup(nextItem)) {
      pendingFocus = { at: index, selector: '.manager-recipe-or-trigger' };
    }
    onChange({ ...group, results: results.map((item, i) => (i === index ? nextItem : item)) });
  }

  // A removed row's focus moves to the row taking its place, else the one before, else the adder.
  function removeItem(index) {
    const at = Math.min(index, results.length - 2);
    pendingFocus = { at, selector: at < 0 ? '[data-recipe-add]' : FIRST_CONTROL };
    onChange({ ...group, results: results.filter((_, i) => i !== index) });
  }

  // Always appends, the row naming its own subject: a recipe set never bumps a quantity, and a
  // progressive award loop ignores `quantity`, so repeating a component asks for more of it.
  function addItem(kind) {
    const added = progressive ? { id: newId(), componentId: null } : emptyResult(kind, newId());
    pendingFocus = { at: results.length, selector: '[data-recipe-option-search]' };
    onChange({ ...group, results: [...results, added] });
  }

  // The card holds the pending focus because the control that asked for it may not survive the
  // edit: a progressive set's first stage moves the adder into the list's footer, a new instance.
  // `results` is read first so the effect tracks every edit; the focus is a task, so it lands
  // after a menu hands focus back to its trigger.
  $effect(() => {
    const count = results.length;
    if (!root || !pendingFocus || count <= pendingFocus.at) return;
    const { at, selector } = pendingFocus;
    pendingFocus = null;
    setTimeout(() => {
      const rows = root?.querySelectorAll('[data-recipe-result-item], [data-recipe-result-group]');
      (at < 0 ? root : rows?.[at])?.querySelector(selector)?.focus();
    }, 0);
  });

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
  bind:this={root}
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
            {kinds}
            catalogue={offer.catalogue}
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
          <ChoiceGroup
            side="result"
            group={item}
            {offer}
            reward={recipeSurface}
            onChange={(next) => updateItem(index, next)}
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
  {#if recipeSurface}
    <RecipeResultAdder
      {kinds}
      label={progressive
        ? localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultStage', 'Add result stage')
        : ''}
      onAdd={addItem}
    />
  {:else}
    <SearchablePopover
      options={componentPickerOptions}
      pickerClass="manager-recipe-component-picker manager-recipe-add-component"
      triggerClass="fabricate-button is-dashed manager-recipe-add-component-trigger manager-recipe-add-result"
      triggerIcon="fas fa-plus"
      triggerLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
      ariaLabel={localizeOr('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
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
      onSelect={(id) => onChange({ ...group, results: withAddedResult(results, id, newId()) })}
    />
  {/if}
{/snippet}

<style>
  .manager-recipe-ingredient-set.is-reserved {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
