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
    onOpenComponent = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function format(key, fallback, replacements) {
    let result = text(key, fallback);
    for (const [token, value] of Object.entries(replacements)) {
      result = result.replace(`{${token}}`, value);
    }
    return result;
  }

  const results = $derived(Array.isArray(group?.results) ? group.results : []);

  // Drag-reorder state (progressive only). Local so it survives the store refresh
  // that follows every persisted edit — rows are keyed by result id. Native HTML5
  // drag: the whole card is both the drag source and the drop target, and a splice
  // emits the reordered group.
  let dragIndex = $state(-1);

  function reorderItem(from, to) {
    if (from === to || from < 0 || to < 0 || from >= results.length || to >= results.length) return;
    const next = results.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...group, results: next });
  }

  function handleResultDrop(targetIndex) {
    if (dragIndex >= 0 && dragIndex !== targetIndex) reorderItem(dragIndex, targetIndex);
    dragIndex = -1;
  }

  // Reorder was DRAG-ONLY, with an aria-hidden grip on a draggable div and no keyboard
  // path at all — a live accessibility hole, since order is load-bearing in progressive
  // mode (the award loop spends the check budget down the list). These are real buttons,
  // disabled at the ends, and the position change is announced through the aria-live
  // region below (issue 643 §6).
  let announcement = $state('');

  function componentNameFor(item) {
    const match = (componentOptions || []).find((option) => option.id === item?.componentId);
    return match?.name || text('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result');
  }

  function moveItem(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= results.length) return;

    // Read the name BEFORE the move. `reorderItem` emits the reordered group, and once
    // the parent round-trips the new prop `results[index]` is the item that swapped INTO
    // this slot — so announcing after the move can name the wrong result.
    const name = componentNameFor(results[index]);
    const total = results.length;
    reorderItem(index, target);

    // ONE key with three placeholders, not a concatenation of "moved to position" + "of":
    // word order is not universal, and a sentence assembled from fragments cannot be
    // translated.
    announcement = format(
      'FABRICATE.Admin.Manager.Recipe.ResultMoveAnnouncement',
      '{name} moved to position {position} of {total}',
      { name, position: target + 1, total }
    );
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

<div class={`manager-recipe-ingredient-set ${chromeless ? 'is-chromeless' : ''} ${reserved ? 'is-reserved' : ''}`} data-recipe-set data-recipe-result-set-id={group?.id || ''}>
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
      {#if !hideRemove && !reserved}
        <button
          type="button"
          class="manager-icon-button is-danger"
          data-recipe-remove="result-set"
          aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set')}
          title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultSet', 'Remove result set')}
          onclick={() => onRemove()}
        ><i class="fas fa-trash" aria-hidden="true"></i></button>
      {/if}
    </div>
  {/if}

  {#if results.length === 0}
    <p class="manager-muted manager-recipe-ingredient-set-empty">{text('FABRICATE.Admin.Manager.Recipe.ResultSetEmptyHint', 'Add an item this recipe produces.')}</p>
  {:else}
    <div class="manager-recipe-ingredient-set-groups">
      {#each results as item, index (item?.id || index)}
        {#if progressive}
          <!-- Progressive: the whole card is the drag SOURCE (so the drag ghost is
               the full row, not just the grip) and the drop TARGET; the grip + order
               pip stay as a visual affordance. Drag is a mouse-only enhancement.
               Progressive rows carry no quantity field (the row hides it) and no text
               input, so dragging from anywhere on the card is safe — order +
               repetition are the only authored inputs. -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="manager-recipe-result-row is-reorderable"
            data-recipe-result-row
            draggable="true"
            ondragstart={() => { dragIndex = index; }}
            ondragend={() => { dragIndex = -1; }}
            ondragover={(event) => event.preventDefault()}
            ondrop={(event) => { event.preventDefault(); handleResultDrop(index); }}
          >
            <span
              class="manager-environment-comp-handle"
              aria-hidden="true"
              title={text('FABRICATE.Admin.Manager.Recipe.DragResult', 'Drag to reorder')}
            >
              <i class="fas fa-grip-vertical" aria-hidden="true"></i>
              <span class="manager-environment-comp-order">{index + 1}</span>
            </span>
            <span class="manager-recipe-result-move" data-recipe-result-move>
              <button
                type="button"
                class="manager-icon-button"
                data-recipe-result-move-up
                aria-label={`${text('FABRICATE.Admin.Manager.Recipe.MoveResultUp', 'Move up')} — ${componentNameFor(item)}`}
                title={text('FABRICATE.Admin.Manager.Recipe.MoveResultUp', 'Move up')}
                disabled={index === 0}
                onclick={() => moveItem(index, -1)}
              ><i class="fas fa-chevron-up" aria-hidden="true"></i></button>
              <button
                type="button"
                class="manager-icon-button"
                data-recipe-result-move-down
                aria-label={`${text('FABRICATE.Admin.Manager.Recipe.MoveResultDown', 'Move down')} — ${componentNameFor(item)}`}
                title={text('FABRICATE.Admin.Manager.Recipe.MoveResultDown', 'Move down')}
                disabled={index === results.length - 1}
                onclick={() => moveItem(index, 1)}
              ><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
            </span>
            <RecipeResultItemRow
              {item}
              {componentOptions}
              {progressive}
              {onOpenComponent}
              onChange={(nextItem) => updateItem(index, nextItem)}
              onRemove={() => removeItem(index)}
            />
          </div>
        {:else}
          <RecipeResultItemRow
            {item}
            {componentOptions}
            onChange={(nextItem) => updateItem(index, nextItem)}
            onRemove={() => removeItem(index)}
          />
        {/if}
      {/each}
    </div>
  {/if}

  {#if progressive}
    <p class="sr-only" aria-live="polite" data-recipe-result-order-status>{announcement}</p>
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

<style>
  /* Alchemy Simple two-slot editor: a fixed header label replacing the free-text
     result-set name input (issue 554). The reserved failure slot tones warning. */
  .manager-recipe-result-set-static-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 auto;
    min-width: 0;
    font-family: var(--font-primary);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--fab-mv2-text, var(--fab-text));
  }

  .manager-recipe-result-set-static-label.is-warning {
    color: var(--fab-warning-text);
  }

  .manager-recipe-result-set-static-label i {
    font-size: 0.8rem;
  }

  .manager-recipe-ingredient-set.is-reserved {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
