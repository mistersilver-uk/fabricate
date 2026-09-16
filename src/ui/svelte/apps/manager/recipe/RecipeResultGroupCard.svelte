<!-- Svelte 5 runes mode -->
<!--
  One result group. A recipe produces ANY one group's items, the producing group being chosen at
  craft time by outcome routing; each group is a flat list of component + quantity. This renders
  the group name, its items, an "Add item" picker and a remove-group button, and emits a
  shallow-updated copy via `onChange(nextGroup)` with new items appended id-less for the store to
  normalize. Empty groups and component-less items are gated at the model/save path
  (`Recipe.validate`), not at readiness, so an empty group being edited here is expected.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeResultItemRow from './RecipeResultItemRow.svelte';
  import RecipeRoutingAssignment from './RecipeRoutingAssignment.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import IconButton from '../../../components/IconButton.svelte';

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
    onAssignIngredientSet = () => {},
    onChange = () => {},
    onRemove = () => {},
    // Deep link from a progressive row's read-only difficulty badge to the component editor.
    onOpenComponent = () => {},
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

  // THE CONTROL HALF of the validation row action. An unrouted-result-set warning is about THIS
  // set's routing, so the card is the destination and `recipeReadiness.js` addresses it as
  // `result-group-<id>` — the same literal on both sides, held together behaviourally by the pair
  // of gates that file's header names. An id-less draft group gets no address.
  const validationTarget = $derived(group?.id ? `result-group-${group.id}` : undefined);

  const results = $derived(Array.isArray(group?.results) ? group.results : []);

  // Drag-reorder state (progressive only), local so it survives the store refresh that follows
  // every persisted edit. Native HTML5 drag: the card is both source and target.
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

  // Order is load-bearing in progressive mode, so reorder cannot be drag-only: these are real
  // buttons, disabled at the ends, and the position change is announced through the aria-live
  // region below.
  let announcement = $state('');

  function componentNameFor(item) {
    const match = (componentOptions || []).find((option) => option.id === item?.componentId);
    return match?.name || text('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result');
  }

  function moveItem(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= results.length) return;

    // Read the name BEFORE the move: once the parent round-trips, `results[index]` is the item
    // that swapped INTO this slot, so announcing afterwards can name the wrong result.
    const name = componentNameFor(results[index]);
    const total = results.length;
    reorderItem(index, target);

    // ONE key with three placeholders rather than a concatenation: a sentence assembled from
    // fragments cannot be translated.
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

  // Adding a component the group already produces bumps that item's quantity rather than
  // appending a duplicate. Progressive is the exception: its award loop ignores `quantity`
  // entirely, so repeating a component IS how the GM asks for more of it — always append.
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

  // THE THREE-WAY EMPTY HINT, a guard chain rather than nested ternaries, and its ORDER is the
  // point: "there are no tiers" must be answered before "none can be offered", or a system with
  // no outcome tiers at all would be told to change a policy.
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
    <!-- Danger-bordered dashed panel: an outcome that produces nothing is a gap. -->
    <div class="manager-recipe-result-empty" data-recipe-result-empty>
      <p class="manager-muted">
        {text(
          'FABRICATE.Admin.Manager.Recipe.ResultSetEmptyPanel',
          'Nothing produced on this outcome.'
        )}
      </p>
    </div>
  {:else}
    <div class="manager-recipe-ingredient-set-groups">
      {#each results as item, index (item?.id || index)}
        {#if progressive}
          <!-- Progressive: the whole card is the drag SOURCE, so the ghost is the full row, and
               the drop TARGET. Drag is a mouse-only enhancement, and a progressive row carries
               no quantity field and no text input, so dragging from anywhere on it is safe. -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="manager-recipe-result-row is-reorderable"
            data-recipe-result-row
            draggable="true"
            ondragstart={() => {
              dragIndex = index;
            }}
            ondragend={() => {
              dragIndex = -1;
            }}
            ondragover={(event) => event.preventDefault()}
            ondrop={(event) => {
              event.preventDefault();
              handleResultDrop(index);
            }}
          >
            <RecipeResultItemRow
              {item}
              {componentOptions}
              {progressive}
              {onOpenComponent}
              onChange={(nextItem) => updateItem(index, nextItem)}
              onRemove={() => removeItem(index)}
            >
              {#snippet leadingControls()}
                <!-- Grip, then a SEPARATE order badge, the salvage stage row's shape: stacked
                     inside one handle it read as a decorated grip rather than as the stage
                     number the award loop spends down. A SNIPPET rather than the card's own
                     first two children, so a stage carrying a complication band can put them on
                     the band's line — as the card's leading flex items they pushed the
                     full-bleed band ~58px in. -->
                <span
                  class="manager-recipe-stage-grip"
                  aria-hidden="true"
                  title={text('FABRICATE.Admin.Manager.Recipe.DragResult', 'Drag to reorder')}
                  ><i class="fas fa-grip-vertical" aria-hidden="true"></i></span
                >
                <span
                  class="manager-recipe-stage-ordinal"
                  data-recipe-result-ordinal={String(index + 1)}
                  aria-hidden="true">{index + 1}</span
                >
              {/snippet}
              {#snippet reorderControls()}
                <!-- Reorder lives to the RIGHT of the component's DC, after the DC + Edit pair
                     and before the remove control. Drag is an ENHANCEMENT; these chevrons are
                     the accessible path, disabled at the ends, and they share the salvage stage
                     row's rocker geometry — see the shared rule in styles/fabricate.css. -->
                <span class="manager-recipe-stage-reorder" data-recipe-result-move>
                  <button
                    type="button"
                    class="manager-recipe-stage-move"
                    data-recipe-result-move-up
                    aria-label={`${text('FABRICATE.Admin.Manager.Recipe.MoveResultUp', 'Move up')} — ${componentNameFor(item)}`}
                    title={text('FABRICATE.Admin.Manager.Recipe.MoveResultUp', 'Move up')}
                    disabled={index === 0}
                    onclick={() => moveItem(index, -1)}
                    ><i class="fas fa-chevron-up" aria-hidden="true"></i></button
                  >
                  <button
                    type="button"
                    class="manager-recipe-stage-move"
                    data-recipe-result-move-down
                    aria-label={`${text('FABRICATE.Admin.Manager.Recipe.MoveResultDown', 'Move down')} — ${componentNameFor(item)}`}
                    title={text('FABRICATE.Admin.Manager.Recipe.MoveResultDown', 'Move down')}
                    disabled={index === results.length - 1}
                    onclick={() => moveItem(index, 1)}
                    ><i class="fas fa-chevron-down" aria-hidden="true"></i></button
                  >
                </span>
              {/snippet}
            </RecipeResultItemRow>
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
    <p class="visually-hidden" aria-live="polite" data-recipe-result-order-status>{announcement}</p>
  {/if}

  <div class="manager-recipe-ingredient-set-add">
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
      emptyHint={text(
        'FABRICATE.Admin.Manager.Recipe.NoComponentsDefined',
        'No components defined'
      )}
      showChevron={false}
      onChoose={(id) => addItem(id)}
    />
  </div>
</div>

<style>
  .manager-recipe-ingredient-set.is-reserved {
    border-color: var(--fab-warning-border);
    background: var(--fab-warning-soft);
  }
</style>
