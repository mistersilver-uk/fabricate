<!-- Svelte 5 runes mode -->
<!--
  One result item inside a result group — the component this recipe produces plus
  a quantity. Result items have no name/tags/currency (unlike ingredient
  alternatives), so this mirrors only the `component` branch of
  RecipeIngredientOption: an image-only SearchablePopover trigger to pick/swap the
  component, the resolved component name beside it, a capped quantity input, and a
  remove control. Items have no id of their own, so the parent keys them by index
  and owns the option list; this row emits the whole updated item via
  `onChange(nextItem)` (spreading the existing item so a normalized id and any
  unknown fields survive the first edit).

  In `progressive` mode the quantity input is hidden: the progressive award loop
  ignores `quantity` and awards each ordered entry once, so the GM expresses "more
  of X" by listing X again (and prioritises via drag-reorder) rather than via a
  count. The component picker and remove control stay.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    item = {},
    componentOptions = [],
    // Hide the quantity input — progressive results are an ordered, quantity-less
    // list (see the parent RecipeResultGroupCard's addItem/reorder handling).
    progressive = false,
    onChange = () => {},
    onRemove = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const componentId = $derived(item?.componentId || '');
  const quantity = $derived(Number(item?.quantity) > 0 ? Number(item.quantity) : 1);

  const selectedComponent = $derived(
    componentId ? (componentOptions || []).find(option => option.id === componentId) || null : null
  );

  // The picker lists every system component; the trigger resolves the current id
  // to its name/image so a chosen component reads back clearly.
  const componentPickerOptions = $derived(
    (componentOptions || []).map(option => ({ id: option.id, label: option.name, img: option.img }))
  );

  // Spread the existing item so a normalized id (and any unknown fields) survive.
  function chooseComponent(id) {
    onChange({ ...item, componentId: id });
  }

  // Quantities are capped at 9999 (four digits) and floored to 1 — more of a
  // single component is not a meaningful result, and it keeps the input narrow.
  function setQuantity(value) {
    const next = Number(value);
    onChange({ ...item, quantity: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1 });
  }
</script>

<div class="manager-recipe-ingredient-option-row" data-recipe-option data-recipe-result-item>
  <div class="manager-recipe-option-target">
    <div class="manager-recipe-option-component">
      <SearchablePopover
        options={componentPickerOptions}
        value={componentId}
        pickerClass="manager-recipe-component-picker"
        triggerClass="manager-button manager-recipe-component-trigger"
        triggerImg={selectedComponent?.img || ''}
        triggerIcon={selectedComponent ? '' : 'fas fa-cube'}
        triggerLabel={selectedComponent ? '' : text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        triggerTitle={selectedComponent?.name || ''}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
        searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
        emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
        onChoose={(id) => chooseComponent(id)}
      />
      {#if selectedComponent}
        <span class="manager-recipe-component-name">{selectedComponent.name}</span>
      {/if}
    </div>
  </div>

  <div class="manager-recipe-option-controls">
    {#if !progressive}
      <input
        type="number"
        min="1"
        max="9999"
        class="manager-recipe-option-quantity"
        data-recipe-option-quantity
        aria-label={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
        value={quantity}
        onchange={(e) => setQuantity(e.target.value)}
      />
    {/if}

    <button
      type="button"
      class="manager-icon-button is-danger manager-recipe-option-remove"
      data-recipe-remove="result-item"
      aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
      title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
      onclick={() => onRemove()}
    ><i class="fas fa-minus" aria-hidden="true"></i></button>
  </div>
</div>
