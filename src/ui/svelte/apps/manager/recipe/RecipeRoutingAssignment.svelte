<!-- Svelte 5 runes mode -->
<!--
  Multi-select-with-chips used by routed result sets to assign what routes to a
  result group: in Ingredient mode the recipe's ingredient sets, in Check mode the
  system's routed-check outcome tiers. Selected entries render as dismissable
  chips; the add-picker (a SearchablePopover) lists only entries that are neither
  already selected here nor disabled (already assigned to another result set).

  Controlled: emits one id at a time via onAdd(id) / onRemove(id). The parent owns
  the source of truth (ingredientSet.resultGroupId or resultGroup.checkOutcomeIds).

  Props:
    options     — [{ id, name, disabled? }] full candidate list
    selectedIds — string[] ids assigned to this result set
    label       — section label
    addLabel    — add-trigger text/aria
    placeholder — search placeholder
    emptyHint   — shown when there are no candidates at all
    onAdd(id) / onRemove(id)
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    options = [],
    selectedIds = [],
    label = '',
    addLabel = '',
    placeholder = '',
    emptyHint = '',
    onAdd = () => {},
    onRemove = () => {}
  } = $props();

  const selected = $derived(Array.isArray(selectedIds) ? selectedIds : []);
  const all = $derived(Array.isArray(options) ? options : []);

  function nameFor(id) {
    return all.find((option) => option.id === id)?.name || id;
  }

  // Chips, in assignment order. Unknown ids (e.g. a renamed/removed source) still
  // render so the GM can see and clear a stale assignment.
  const chips = $derived(selected.map((id) => ({ id, name: nameFor(id) })));

  // Pickable = not already selected here and not disabled (assigned elsewhere).
  const pickerOptions = $derived(
    all
      .filter((option) => !selected.includes(option.id) && !option.disabled)
      .map((option) => ({ id: option.id, label: option.name }))
  );
</script>

<div class="manager-recipe-routing-assignment" data-recipe-routing-assignment>
  {#if label}
    <span class="manager-recipe-routing-assignment-label">{label}</span>
  {/if}

  {#if all.length === 0}
    <p class="manager-muted manager-recipe-routing-assignment-empty">{emptyHint}</p>
  {:else}
    <div class="manager-recipe-routing-assignment-chips">
      {#each chips as chip (chip.id)}
        <span class="manager-chip is-active manager-recipe-routing-chip" data-routing-chip={chip.id}>
          <span class="manager-recipe-routing-chip-label">{chip.name}</span>
          <button
            type="button"
            class="manager-recipe-routing-chip-remove"
            data-routing-chip-remove
            aria-label={localize('FABRICATE.Admin.Manager.Recipe.RoutingRemove') ||
              `Remove ${chip.name}`}
            title={chip.name}
            onclick={() => onRemove(chip.id)}
          ><i class="fas fa-times" aria-hidden="true"></i></button>
        </span>
      {/each}

      <SearchablePopover
        options={pickerOptions}
        pickerClass="manager-recipe-component-picker manager-recipe-routing-picker"
        triggerClass="manager-button is-subtle manager-recipe-routing-add-trigger"
        triggerIcon="fas fa-plus"
        triggerLabel={addLabel}
        triggerAriaLabel={addLabel}
        triggerAddMarker="routing-option"
        dialogAriaLabel={addLabel}
        searchPlaceholder={placeholder}
        searchAriaLabel={placeholder}
        emptyHint={emptyHint}
        showChevron={false}
        onChoose={(id) => onAdd(id)}
      />
    </div>
  {/if}
</div>
