<!-- Svelte 5 runes mode -->
<!--
  One result group. A recipe produces ANY one group's items (the producing group
  is chosen at craft time via outcome routing / roll-table selection); each group
  is a flat list of produced items (component + quantity). This renders the group
  name, its items (via RecipeResultItemRow), an "Add item" component picker, and a
  remove-group button.

  It emits a shallow-updated copy via `onChange(nextGroup)`; new items are appended
  id-less for the store to normalize. Empty result groups (and component-less
  items) are gated at the model/save path (Recipe.validate), not the readiness /
  Validation tab — so an empty group editing in-progress here is expected, not an
  oversight.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeResultItemRow from './RecipeResultItemRow.svelte';
  import RecipeRoutingAssignment from './RecipeRoutingAssignment.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import IconButton from '../../../components/IconButton.svelte';
  import SortableList from '../../../components/SortableList.svelte';
  import RecipeStageComplicationBand from './RecipeStageComplicationBand.svelte';

  let {
    group = {},
    chromeless = false,
    componentOptions = [],
    // Routed result routing (non-chromeless only): in 'ingredientSet' mode the
    // result set is assigned ingredient sets (via onAssignIngredientSet, written
    // to ingredientSet.resultGroupId); in 'check' mode it is assigned the system's
    // routed-check outcome tiers (written to group.checkOutcomeIds). Otherwise a
    // free-text result-set name is shown.
    routingProvider = null,
    ingredientSetOptions = [],
    assignedIngredientSetIds = [],
    // POLICY-CONDITIONAL since issue 1098 (decision 7): success-filtered when the system's
    // `craftingCheck.failureResultPolicy` forbids failure results, unfiltered when it
    // permits them, so a result set can be bound to a failure-marked tier exactly where the
    // engine will route one. Resolved by the manager root, and read by `recipeReadiness`
    // from the SAME swap, so the picker and the readiness warnings cannot disagree.
    outcomeTierOptions = [],
    // Whether the routed check has ANY outcome tier (even failure-only). When
    // `outcomeTierOptions` is empty this disambiguates "no tiers authored yet" from
    // "tiers exist but none is offerable" for the empty hint.
    outcomeTiersDefined = false,
    // Whether the failure-result policy permits results on a failed check (issue 1098).
    // Its ONLY use here is the third empty hint: with tiers defined and the list still
    // empty, "none is marked as a Success" is only half the story under a forbidding
    // policy, because marking one Success is not the only remedy — allowing failure
    // results is the other, and it is the one a GM authoring a ruined-output recipe wants.
    failureResultsAllowed = false,
    // Alchemy Simple two-slot editor (issue 554). `staticLabel` replaces the free-text
    // name input with a fixed header label (used by both the "On success" and the
    // reserved "On a failed check" slots). `reserved` marks the failure slot: it adds
    // a warning icon and (with `hideRemove`) suppresses the remove button and stamps
    // `role: 'failure'` on edit (done by the parent). `roleAccent` (e.g. 'warning')
    // tones the static label. `hideRemove` suppresses the remove button on both slots.
    staticLabel = '',
    reserved = false,
    roleAccent = '',
    hideRemove = false,
    // Progressive systems award the group's results in ORDER (the award loop spends
    // the check budget down the list), so the GM needs to reorder them. When set,
    // each result row grows a drag handle wired to drag-and-drop reorder; other
    // resolution modes ignore result order and render the list unchanged.
    progressive = false,
    onAssignIngredientSet = () => {},
    onChange = () => {},
    onRemove = () => {},
    // Deep-link from a progressive row's read-only difficulty badge to the component
    // editor (component.difficulty is a Component property with four consumers).
    onOpenComponent = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // THE CONTROL HALF of the validation row action (issue 1517). An unrouted-result-set
  // warning is about THIS set's routing, so the card is the destination and
  // `recipeReadiness.js` addresses it as `result-group-<id>`. Same literal on both sides,
  // held together behaviourally by the pair of gates named in `recipeReadiness.js`'s own
  // header — `recipe-validation-tab.test.js` reads the address the `unroutedResultGroup`
  // warning emits, and `recipe-edit-mounted.test.js` finds it on this element. An id-less
  // draft group gets no address and the producer emits a route-only issue.
  const validationTarget = $derived(group?.id ? `result-group-${group.id}` : undefined);

  const results = $derived(Array.isArray(group?.results) ? group.results : []);

  // Drag-reorder state (progressive only). Local so it survives the store refresh
  // that follows every persisted edit — rows are keyed by result id. Native HTML5
  // drag: the whole card is both the drag source and the drop target, and a splice
  // emits the reordered group.
  function reorderItem(from, to) {
    if (from === to || from < 0 || to < 0 || from >= results.length || to >= results.length) return;
    const next = results.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...group, results: next });
  }

  // BOTH HALVES OF REORDER ARE `SortableList`'S NOW (issue 1512), and so is the
  // announcement: the drag source, the grip, the chevron rocker, the read-the-name-before-
  // the-move rule this file established, the focus move and the polite live region all live
  // in the one list implementation rather than in this card's copy of them.
  function componentNameFor(item) {
    const match = (componentOptions || []).find((option) => option.id === item?.componentId);
    return match?.name || text('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result');
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

  // Spread the existing group so its id/name (referenced by routing) survive.
  function setName(name) {
    onChange({ ...group, name });
  }

  function updateItem(index, nextItem) {
    onChange({ ...group, results: results.map((item, i) => (i === index ? nextItem : item)) });
  }

  function removeItem(index) {
    onChange({ ...group, results: results.filter((_, i) => i !== index) });
  }

  // Adding a component the group already produces bumps that item's quantity by 1
  // (capped) rather than appending a duplicate item. Spread the existing item so a
  // normalized id (and any unknown fields) survive the bump.
  //
  // Progressive is the exception: its award loop spends the check budget down an
  // ORDERED list, awarding each entry once (cost = the component's difficulty) and
  // ignoring `quantity` entirely. There, repeating a component IS how the GM asks
  // for more of it and prioritises it, so we always append a fresh, quantity-less
  // entry — never merge.
  function addItem(id) {
    if (progressive) {
      onChange({ ...group, results: [...results, { id: newId(), componentId: id }] });
      return;
    }
    const existingIndex = results.findIndex((item) => item?.componentId === id);
    if (existingIndex !== -1) {
      const existing = results[existingIndex];
      const nextQuantity = Math.min(
        9999,
        (Number(existing.quantity) > 0 ? Number(existing.quantity) : 1) + 1
      );
      onChange({
        ...group,
        results: results.map((item, i) =>
          i === existingIndex ? { ...existing, quantity: nextQuantity } : item
        ),
      });
      return;
    }
    onChange({ ...group, results: [...results, { id: newId(), componentId: id, quantity: 1 }] });
  }

  // THE THREE-WAY EMPTY HINT (issue 1098, decision 7). Written as a guard chain rather
  // than nested ternaries: the SonarCloud gate fails those, and the ORDER is the point —
  // "there are no tiers" has to be answered before "none of them can be offered", or a
  // recipe on a system with no outcome tiers at all would be told to change a policy.
  const outcomeTierEmptyHint = $derived.by(() => {
    if (!outcomeTiersDefined) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.RoutingNoOutcomeTiers',
        'Define outcome tiers in the routed crafting check first.'
      );
    }
    if (!failureResultsAllowed) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.RoutingNoSuccessOutcomeTiersPolicy',
        'Every outcome tier on this check is a failure, and this system produces nothing on a failed check. Mark a tier as a Success, or let failed checks produce a result on the crafting check’s On failure section.'
      );
    }
    return text(
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
          label={text('FABRICATE.Admin.Manager.Recipe.RoutingIngredientSets', 'Produced by')}
          addLabel={text(
            'FABRICATE.Admin.Manager.Recipe.RoutingAddIngredientSet',
            'Add ingredient set'
          )}
          placeholder={text(
            'FABRICATE.Admin.Manager.Recipe.RoutingSearchIngredientSets',
            'Search ingredient sets...'
          )}
          emptyHint={text(
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
          label={text('FABRICATE.Admin.Manager.Recipe.RoutingOutcomeTiers', 'Produced on outcome')}
          addLabel={text('FABRICATE.Admin.Manager.Recipe.RoutingAddOutcomeTier', 'Add outcome')}
          placeholder={text(
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
          placeholder={text(
            'FABRICATE.Admin.Manager.Recipe.ResultSetNamePlaceholder',
            'Result set name'
          )}
          value={group?.name || ''}
          onchange={(e) => setName(e.target.value)}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')}
        />
      {/if}
      {#if !hideRemove && !reserved}
        <IconButton
          class="is-danger"
          data-recipe-remove="result-set"
          ariaLabel={text('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set')}
          title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set')}
          onclick={() => onRemove()}><i class="fas fa-trash" aria-hidden="true"></i></IconButton
        >
      {/if}
    </div>
  {/if}

  {#if results.length === 0}
    <!-- Danger-bordered dashed panel (§C5): an outcome that produces nothing is a gap. -->
    <div class="manager-recipe-result-empty" data-recipe-result-empty>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Recipe.ResultSetEmptyPanel',
          'Nothing produced on this outcome.'
        )}
      </p>
    </div>
  {:else}
    {#if progressive}
      <!-- PROGRESSIVE IS AN ORDERED LIST (issue 1512), so it is the shared one. The grip,
           the 22px ordinal badge, the chevron rocker, the drag source, the keyboard reorder
           and the polite announcement are all `SortableList`'s; this card supplies the row's
           own content and the stage's complication band.

           The band is the list's BODY rather than part of the row's content, because it is
           FULL-BLEED: the list's row is a column whose LINE carries the padding, so a body
           that draws a band meets the row's own border and the band's `border-top` reads as
           a card divider (issue 1286's shape, kept). `alwaysOpen` is what renders it on
           every row with no disclosure — a stage's band is not something a GM opens.

           NO `removable`: the row's own × carries `data-recipe-remove="result-item"`, a hook
           the mounted suites address a progressive stage by, and the list's remove writes its
           own. The caller keeps the control rather than the hook being renamed. -->
      <SortableList
        items={results}
        itemLabel={componentNameFor}
        numbered
        handles
        alwaysOpen
        onReorder={(from, to) => reorderItem(from, to)}
        rowClass={() => 'manager-recipe-stage-row'}
        rowData={() => ({ 'data-recipe-result-row': '' })}
      >
        {#snippet row(item, index)}
          <RecipeResultItemRow
            {item}
            {componentOptions}
            {progressive}
            {onOpenComponent}
            onChange={(nextItem) => updateItem(index, nextItem)}
            onRemove={() => removeItem(index)}
          />
        {/snippet}
        {#snippet body(item)}
          <RecipeStageComplicationBand {componentOptions} componentId={item?.componentId || ''} />
        {/snippet}
        {#snippet footer()}
          <li class="manager-recipe-ingredient-set-add">{@render resultAdder()}</li>
        {/snippet}
      </SortableList>
    {:else}
      <div class="manager-recipe-ingredient-set-groups">
        {#each results as item, index (item?.id || index)}
          <RecipeResultItemRow
            {item}
            {componentOptions}
            onChange={(nextItem) => updateItem(index, nextItem)}
            onRemove={() => removeItem(index)}
          />
        {/each}
      </div>
    {/if}
  {/if}

  <!-- THE ADDER FOLLOWS THE EMPTY MESSAGE (issue 1512). A footer of a list that is not
       rendered cannot render either, and a surface whose empty state says "add one" with
       nothing to press is a dead end — so at zero results, and on every non-progressive
       set, the adder is this sibling. -->
  {#if !progressive || results.length === 0}
    <div class="manager-recipe-ingredient-set-add">{@render resultAdder()}</div>
  {/if}
</div>

{#snippet resultAdder()}
  <SearchablePopover
    options={componentPickerOptions}
    pickerClass="manager-recipe-component-picker manager-recipe-add-component"
    triggerClass="fabricate-button manager-button is-dashed manager-recipe-add-component-trigger manager-recipe-add-result"
    triggerIcon="fas fa-plus"
    triggerLabel={progressive
      ? text('FABRICATE.Admin.Manager.Recipe.AddResultStage', 'Add result stage')
      : text('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
    triggerAriaLabel={progressive
      ? text('FABRICATE.Admin.Manager.Recipe.AddResultStage', 'Add result stage')
      : text('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
    triggerAddMarker="result-item"
    dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
      'Search components...'
    )}
    searchAriaLabel={text(
      'FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder',
      'Search components...'
    )}
    emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
    showChevron={false}
    onChoose={(id) => addItem(id)}
  />
{/snippet}

<style>
  .manager-recipe-ingredient-set.is-reserved {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
