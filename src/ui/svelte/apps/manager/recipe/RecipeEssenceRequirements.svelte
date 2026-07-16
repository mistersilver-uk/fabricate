<!-- Svelte 5 runes mode -->
<!--
  Per-set essence requirements, rendered as essence-tinted REQUIREMENT ROWS matching
  the prototype (issue 643 §B3) rather than a docked "Essences" sub-block. The set's
  `essences` is a plain map `{ essenceId: quantity }`; each entry is one row: a lead
  chip + essence medallion + "<name> essence" + a "met by any components carrying this
  essence" sub-line + an ESSENCE tag + a quantity stepper + a remove ×.

  Essences live on the SET, not on an ingredient group (there is NO essence match
  type — issue 649), so this stays a dedicated per-set list rather than being folded
  into the AND'd `ingredientGroups`. Adding an essence is done from the set's
  "Add essence requirement" control (RecipeIngredientSetCard); this component only
  renders and edits existing entries, emitting a fresh map via `onChange`.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';

  let {
    essences = {},
    essenceOptions = [],
    onChange = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const entries = $derived(Object.entries(essences || {}));

  const essenceById = $derived(new Map((essenceOptions || []).map(def => [def.id, def])));

  function essenceName(id) {
    return essenceById.get(id)?.name || id;
  }
  function essenceIcon(id) {
    return essenceById.get(id)?.icon || 'fas fa-flask';
  }

  function setQuantity(id, value) {
    const next = Number(value);
    onChange({ ...essences, [id]: Number.isFinite(next) && next > 0 ? next : 1 });
  }

  function removeEssence(id) {
    const next = { ...essences };
    delete next[id];
    onChange(next);
  }
</script>

{#if entries.length > 0}
  <ul class="manager-recipe-essence-rows" data-recipe-section-essences>
    {#each entries as [essenceId, quantity] (essenceId)}
      <li class="manager-recipe-ingredient-option-row is-essence manager-recipe-essence-row" data-recipe-essence-id={essenceId}>
        <span class="manager-recipe-option-lead is-essence" aria-hidden="true">
          <i class="fas fa-flask-vial"></i>
        </span>
        <span class="manager-recipe-essence-medallion" aria-hidden="true">
          <i class={essenceIcon(essenceId)}></i>
        </span>
        <div class="manager-recipe-option-target manager-recipe-essence-copy">
          <span class="manager-recipe-essence-name">{essenceName(essenceId)} {text('FABRICATE.Admin.Manager.Recipe.EssenceRowSuffix', 'essence')}</span>
          <span class="manager-recipe-essence-subline manager-muted">{text('FABRICATE.Admin.Manager.Recipe.EssenceMetBy', 'met by any components carrying this essence')}</span>
        </div>
        <div class="manager-recipe-option-controls">
          <span class="manager-recipe-req-tag is-essence" data-recipe-req-tag="essence">{text('FABRICATE.Admin.Manager.Recipe.EssenceTypeLabel', 'Essence')}</span>
          <Stepper
            value={Number(quantity) > 0 ? Number(quantity) : 1}
            min={1}
            max={9999}
            ariaLabel={text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}
            decrementLabel={text('FABRICATE.Admin.Manager.Recipe.QuantityDecrement', 'Decrease quantity')}
            incrementLabel={text('FABRICATE.Admin.Manager.Recipe.QuantityIncrement', 'Increase quantity')}
            inputProps={{ 'data-recipe-essence-quantity': '', class: 'fab-stepper-input manager-recipe-essence-quantity' }}
            onChange={(value) => setQuantity(essenceId, value)}
          />
          <button
            type="button"
            class="manager-recipe-option-remove"
            data-recipe-remove="essence"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveEssence', 'Remove essence')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveEssence', 'Remove essence')}
            onclick={() => removeEssence(essenceId)}
          ><i class="fas fa-xmark" aria-hidden="true"></i></button>
        </div>
      </li>
    {/each}
  </ul>
{/if}
