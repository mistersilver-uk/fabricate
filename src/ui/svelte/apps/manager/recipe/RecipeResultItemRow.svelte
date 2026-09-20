<!-- Svelte 5 runes mode -->
<!--
  One result item inside a result group — the component this recipe produces plus a quantity.
  Result items have no name/tags/currency, so this mirrors only the `component` branch of
  `RecipeIngredientOption`: one `SearchablePopover` trigger carrying the component's image AND
  name, a capped quantity stepper and a remove control. Items have no id of their own, so the
  parent keys them by index and owns the option list, and this row emits the whole updated item
  via `onChange(nextItem)`.

  In `progressive` mode the quantity input is hidden, because the progressive award loop ignores
  `quantity` and awards each ordered entry once. A progressive row instead shows the component's
  DIFFICULTY and its COMPLICATIONS read-only, with a deep link out —
  `openspec/specs/ui-integration/spec.md` → "Progressive UI" and its `### Requirements`
  requirement 16 state both, including why neither is edited in place.

  A progressive row is a `SortableList` row (issue 1512), so the list draws the grip, the ordinal,
  the rocker and the delete around this content; the complication band is
  `RecipeStageComplicationBand.svelte`, rendered as the list's body, which is what makes it
  full-bleed. The × below is therefore the flat row's only.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import Stepper from '../../../components/Stepper.svelte';

  let {
    item = {},
    componentOptions = [],
    // Hide the quantity input: progressive results are an ordered, quantity-less list.
    progressive = false,
    onChange = () => {},
    onRemove = () => {},
    // Deep link to the component editor's Difficulty card; the badge here is read-only.
    onOpenComponent = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const componentId = $derived(item?.componentId || '');
  const quantity = $derived(Number(item?.quantity) > 0 ? Number(item.quantity) : 1);

  const selectedComponent = $derived(
    componentId
      ? (componentOptions || []).find((option) => option.id === componentId) || null
      : null
  );

  // The picker lists every system component; the trigger resolves the current id for display.
  const componentPickerOptions = $derived(
    (componentOptions || []).map((option) => ({
      id: option.id,
      label: option.name,
      img: option.img,
    }))
  );

  // `difficulty` is projected onto the component options; one never given reads as unset, not 0.
  const difficulty = $derived(
    Number.isFinite(Number(selectedComponent?.difficulty))
      ? Number(selectedComponent.difficulty)
      : null
  );

  // Spread the existing item so a normalized id (and any unknown fields) survive.
  function chooseComponent(id) {
    onChange({ ...item, componentId: id });
  }

  // Quantities are capped at four digits and floored to 1, which keeps the input narrow.
  function setQuantity(value) {
    const next = Number(value);
    onChange({ ...item, quantity: Number.isFinite(next) && next > 0 ? Math.min(9999, next) : 1 });
  }
</script>

<div class="manager-recipe-ingredient-option-row" data-recipe-option data-recipe-result-item>
  <div class="manager-recipe-option-target">
    <div class="manager-recipe-option-component">
      <!-- The image AND the name live INSIDE one trigger, in EVERY mode (issue 676) —
               the same shape the ingredient rows and the salvage yield picker now use. The
               progressive row was migrated first and the flat row kept an image-only trigger
               with the name as loose text beside it; that split meant the same picker had two
               anatomies depending on a mode the picker itself has nothing to do with. The
               trigger sizes to the name's length, so it never grows into the trailing cluster.
               `manager-recipe-stage-trigger` remains as the stage-row marker only — the
               trigger anatomy no longer depends on it. -->
      <SearchablePopover
        options={componentPickerOptions}
        value={componentId}
        pickerClass="manager-recipe-component-picker"
        triggerClass={`fabricate-button manager-button manager-recipe-component-trigger${progressive ? ' manager-recipe-stage-trigger' : ''}`}
        triggerImg={selectedComponent?.img || ''}
        triggerIcon={selectedComponent ? '' : 'fas fa-cube'}
        triggerLabel={selectedComponent?.name ||
          text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        valueClass={progressive
          ? 'manager-recipe-stage-trigger-name'
          : 'manager-recipe-component-name'}
        triggerTitle={selectedComponent?.name || ''}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
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
        onChoose={(id) => chooseComponent(id)}
      />
    </div>
  </div>

  <div class="manager-recipe-option-controls">
    {#if progressive}
      <!-- READ-ONLY `DC n`, then a SEPARATE "Edit ↗" — the salvage stage row's shape
               (issue 676). It was a "DIFFICULTY" micro-label plus one combined
               `Difficulty 4 ↗` chip, which made a read-only fact look like the control that
               changes it. `component.difficulty` has four consumers and the component
               editor's Difficulty card owns its save/discard lifecycle, so the fact is
               read-only here and the link is the only route to changing it. The DC always
               renders (it anchors the trailing cluster); the Edit link needs a chosen
               component. -->
      <span
        class="manager-recipe-stage-dc"
        data-recipe-result-difficulty={difficulty === null ? '' : String(difficulty)}
        >{difficulty === null
          ? text('FABRICATE.Admin.Manager.Recipe.DifficultyUnset', 'No difficulty')
          : `${text('FABRICATE.Admin.Manager.Recipe.DifficultyShort', 'DC')} ${difficulty}`}</span
      >

      {#if selectedComponent}
        <button
          type="button"
          data-keyboard-focus="true"
          class="manager-recipe-stage-edit"
          data-recipe-result-edit={componentId}
          aria-label={`${text('FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty', 'Edit difficulty on the component')} — ${selectedComponent.name}`}
          title={text(
            'FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty',
            'Edit difficulty on the component'
          )}
          onclick={() => onOpenComponent(componentId)}
        >
          <span>{text('FABRICATE.Admin.Manager.Recipe.EditDifficulty', 'Edit')}</span>
          <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
        </button>
      {/if}
    {/if}

    {#if !progressive}
      <!-- The same shared Stepper the Ingredients rows use (−/value/+), not a bare
               number input, so a produced quantity is edited identically to an ingredient
               quantity. -->
      <Stepper
        value={quantity}
        min={1}
        max={9999}
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
        decrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityDecrement',
          'Decrease quantity'
        )}
        incrementLabel={text(
          'FABRICATE.Admin.Manager.Recipe.QuantityIncrement',
          'Increase quantity'
        )}
        inputProps={{
          'data-recipe-option-quantity': '',
          class: 'fab-stepper-input manager-recipe-option-quantity',
        }}
        onChange={(value) => setQuantity(value)}
      />
    {/if}

    {#if !progressive}
      <!-- A subtle × (§C7), never a loud red fa-minus. A progressive row's delete is the list's
           own, so it trails the rocker instead of preceding it (issue 1512). -->
      <button
        type="button"
        data-keyboard-focus="true"
        class="manager-recipe-result-remove manager-recipe-option-remove"
        data-recipe-remove="result-item"
        aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
        title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
        onclick={() => onRemove()}><i class="fas fa-times" aria-hidden="true"></i></button
      >
    {/if}
  </div>
</div>
