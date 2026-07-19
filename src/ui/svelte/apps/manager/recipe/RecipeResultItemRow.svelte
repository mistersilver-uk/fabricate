<!-- Svelte 5 runes mode -->
<!--
  One result item inside a result group — the component this recipe produces plus
  a quantity. Result items have no name/tags/currency (unlike ingredient
  alternatives), so this mirrors only the `component` branch of
  RecipeIngredientOption: one SearchablePopover trigger carrying the component's image
  AND name (sized to the name — issue 676) to pick/swap it, a capped quantity stepper,
  and a remove control. Items have no id of their own, so the parent keys them by index
  and owns the option list; this row emits the whole updated item via
  `onChange(nextItem)` (spreading the existing item so a normalized id and any
  unknown fields survive the first edit).

  In `progressive` mode the quantity input is hidden: the progressive award loop
  ignores `quantity` and awards each ordered entry once, so the GM expresses "more
  of X" by listing X again (and prioritises via reorder) rather than via a count.
  The component picker and remove control stay.

  Progressive rows also show the component's DIFFICULTY as a READ-ONLY badge with a
  deep-link to the component editor — never an inline stepper. `component.difficulty`
  is consumed by progressive recipes, progressive salvage, progressive gathering AND
  the system-validation blocker, so editing it here would either write across an
  aggregate boundary immediately (bypassing both dirty guards) or make "Save recipe"
  silently persist a *Component* change.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';
  import Stepper from '../../../components/Stepper.svelte';

  let {
    item = {},
    componentOptions = [],
    // Hide the quantity input — progressive results are an ordered, quantity-less
    // list (see the parent RecipeResultGroupCard's addItem/reorder handling).
    progressive = false,
    onChange = () => {},
    onRemove = () => {},
    // Deep-link to the component editor's Difficulty card. The difficulty badge is
    // read-only here by design (see the note above).
    onOpenComponent = () => {},
    // Optional reorder controls (progressive only): the parent's up/down buttons,
    // rendered to the RIGHT of the difficulty badge — after the component's DC, before
    // the remove control — so a stage reads left-to-right as handle · component · DC ·
    // reorder · remove (issue 643). Absent (a flat row) in every other mode.
    reorderControls = null
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

  // `difficulty` is projected onto the component options; a component that has never
  // been given one reads as unset rather than as a fabricated 0.
  const difficulty = $derived(
    Number.isFinite(Number(selectedComponent?.difficulty)) ? Number(selectedComponent.difficulty) : null
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
      <!-- The image AND the name live INSIDE one trigger, in EVERY mode (issue 676) —
           the same shape the ingredient rows and the salvage yield picker now use. The
           progressive row was migrated first and the flat row kept an image-only trigger
           with the name as loose text beside it; that split meant the same picker had two
           anatomies depending on a mode the picker itself has nothing to do with. The
           trigger sizes to the name's length, so it never grows into the trailing cluster.
           `manager-recipe-stage-trigger` remains as the STAGE-row marker only — the
           trigger anatomy no longer depends on it. -->
      <SearchablePopover
        options={componentPickerOptions}
        value={componentId}
        pickerClass="manager-recipe-component-picker"
        triggerClass={`manager-button manager-recipe-component-trigger${progressive ? ' manager-recipe-stage-trigger' : ''}`}
        triggerImg={selectedComponent?.img || ''}
        triggerIcon={selectedComponent ? '' : 'fas fa-cube'}
        triggerLabel={selectedComponent?.name || text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        valueClass={progressive ? 'manager-recipe-stage-trigger-name' : 'manager-recipe-component-name'}
        triggerTitle={selectedComponent?.name || ''}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
        searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
        emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
        onChoose={(id) => chooseComponent(id)}
      />
    </div>
  </div>

  <div class="manager-recipe-option-controls">
    {#if progressive}
      <!-- READ-ONLY `DC n`, then a SEPARATE "Edit ↗" — the salvage stage row's shape
           (issue 676). It was a "DIFFICULTY" micro-label plus one combined
           `Difficulty 4 ↗` chip, which made a read-only FACT look like the control that
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
          : `${text('FABRICATE.Admin.Manager.Recipe.DifficultyShort', 'DC')} ${difficulty}`}</span>

      {#if selectedComponent}
        <button
          type="button"
          class="manager-recipe-stage-edit"
          data-recipe-result-edit={componentId}
          aria-label={`${text('FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty', 'Edit difficulty on the component')} — ${selectedComponent.name}`}
          title={text('FABRICATE.Admin.Manager.Recipe.OpenComponentDifficulty', 'Edit difficulty on the component')}
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
        decrementLabel={text('FABRICATE.Admin.Manager.Recipe.QuantityDecrement', 'Decrease quantity')}
        incrementLabel={text('FABRICATE.Admin.Manager.Recipe.QuantityIncrement', 'Increase quantity')}
        inputProps={{ 'data-recipe-option-quantity': '', class: 'fab-stepper-input manager-recipe-option-quantity' }}
        onChange={(value) => setQuantity(value)}
      />
    {/if}

    {#if reorderControls}
      {@render reorderControls()}
    {/if}

    <!-- A subtle × (§C7), never a loud red fa-minus. -->
    <button
      type="button"
      class="manager-recipe-result-remove manager-recipe-option-remove"
      data-recipe-remove="result-item"
      aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
      title={text('FABRICATE.Admin.Manager.Recipe.RemoveResultItem', 'Remove item')}
      onclick={() => onRemove()}
    ><i class="fas fa-times" aria-hidden="true"></i></button>
  </div>
</div>
