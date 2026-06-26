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
  import SearchablePopover from '../SearchablePopover.svelte';

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
    outcomeTierOptions = [],
    // Whether the routed check has ANY outcome tier (even failure-only). When the
    // success-filtered `outcomeTierOptions` is empty this disambiguates "no tiers
    // authored yet" from "tiers exist but none is a Success" for the empty hint.
    outcomeTiersDefined = false,
    onAssignIngredientSet = () => {},
    onChange = () => {},
    onRemove = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const results = $derived(Array.isArray(group?.results) ? group.results : []);

  // Mirror RecipeItemInspector: 'ingredientSet' is Ingredient routing; 'check'
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
    (componentOptions || []).map(option => ({ id: option.id, label: option.name, img: option.img }))
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
  function addItem(id) {
    const existingIndex = results.findIndex((item) => item?.componentId === id);
    if (existingIndex !== -1) {
      const existing = results[existingIndex];
      const nextQuantity = Math.min(9999, (Number(existing.quantity) > 0 ? Number(existing.quantity) : 1) + 1);
      onChange({
        ...group,
        results: results.map((item, i) => (i === existingIndex ? { ...existing, quantity: nextQuantity } : item))
      });
      return;
    }
    onChange({ ...group, results: [...results, { id: newId(), componentId: id, quantity: 1 }] });
  }
</script>

<div class={`manager-recipe-ingredient-set ${chromeless ? 'is-chromeless' : ''}`} data-recipe-set data-recipe-result-set-id={group?.id || ''}>
  {#if !chromeless}
    <div class="manager-recipe-ingredient-set-head">
      {#if isIngredientRouting}
        <RecipeRoutingAssignment
          options={ingredientSetOptions}
          selectedIds={assignedIngredientSetIds}
          label={text('FABRICATE.Admin.Manager.Recipe.RoutingIngredientSets', 'Produced by')}
          addLabel={text('FABRICATE.Admin.Manager.Recipe.RoutingAddIngredientSet', 'Add ingredient set')}
          placeholder={text('FABRICATE.Admin.Manager.Recipe.RoutingSearchIngredientSets', 'Search ingredient sets...')}
          emptyHint={text('FABRICATE.Admin.Manager.Recipe.RoutingNoIngredientSets', 'Add a named ingredient set first.')}
          onAdd={(id) => onAssignIngredientSet(id, true)}
          onRemove={(id) => onAssignIngredientSet(id, false)}
        />
      {:else if isCheckRouting}
        <RecipeRoutingAssignment
          options={outcomeTierOptions}
          selectedIds={checkOutcomeIds}
          label={text('FABRICATE.Admin.Manager.Recipe.RoutingOutcomeTiers', 'Produced on outcome')}
          addLabel={text('FABRICATE.Admin.Manager.Recipe.RoutingAddOutcomeTier', 'Add outcome')}
          placeholder={text('FABRICATE.Admin.Manager.Recipe.RoutingSearchOutcomeTiers', 'Search outcomes...')}
          emptyHint={outcomeTiersDefined
            ? text(
                'FABRICATE.Admin.Manager.Recipe.RoutingNoSuccessOutcomeTiers',
                'No outcome tier is marked as a Success. Mark one as Success in the crafting check to route a result set to it.'
              )
            : text(
                'FABRICATE.Admin.Manager.Recipe.RoutingNoOutcomeTiers',
                'Define outcome tiers in the routed crafting check first.'
              )}
          onAdd={(id) => addOutcomeTier(id)}
          onRemove={(id) => removeOutcomeTier(id)}
        />
      {:else}
        <input
          type="text"
          class="manager-recipe-ingredient-set-name"
          data-recipe-result-set-field="name"
          placeholder={text('FABRICATE.Admin.Manager.Recipe.ResultSetNamePlaceholder', 'Result set name')}
          value={group?.name || ''}
          onchange={(e) => setName(e.target.value)}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')}
        />
      {/if}
      <button
        type="button"
        class="manager-icon-button is-danger"
        data-recipe-remove="result-set"
        aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set')}
        title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set')}
        onclick={() => onRemove()}
      ><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>
  {/if}

  {#if results.length === 0}
    <p class="manager-muted manager-recipe-ingredient-set-empty">{text('FABRICATE.Admin.Manager.Recipe.ResultSetEmptyHint', 'Add an item this recipe produces.')}</p>
  {:else}
    <div class="manager-recipe-ingredient-set-groups">
      {#each results as item, index (index)}
        <RecipeResultItemRow
          {item}
          {componentOptions}
          onChange={(nextItem) => updateItem(index, nextItem)}
          onRemove={() => removeItem(index)}
        />
      {/each}
    </div>
  {/if}

  <div class="manager-recipe-ingredient-set-add">
    <SearchablePopover
      options={componentPickerOptions}
      pickerClass="manager-recipe-component-picker manager-recipe-add-component"
      triggerClass="manager-button is-subtle manager-recipe-add-component-trigger"
      triggerIcon="fas fa-cube"
      triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
      triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddResultItem', 'Add item')}
      triggerAddMarker="result-item"
      dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
      searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
      searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
      emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
      showChevron={false}
      onChoose={(id) => addItem(id)}
    />
  </div>
</div>
