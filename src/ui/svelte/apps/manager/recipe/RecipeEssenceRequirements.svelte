<!-- Svelte 5 runes mode -->
<!--
  Per-set essence requirements editor. The set's `essences` is a plain map
  `{ essenceId: quantity }`; this renders one row per entry (essence picker +
  quantity + remove) plus an "Add essence" picker. Every edit emits a fresh map
  via `onChange(nextEssences)`. Rendered only by the set card when the system has
  essences defined.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';

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

  // The add-picker lists essences not already required by this set.
  const availableEssenceOptions = $derived(
    (essenceOptions || [])
      .filter(def => !Object.prototype.hasOwnProperty.call(essences || {}, def.id))
      .map(def => ({ id: def.id, label: def.name, icon: def.icon || 'fas fa-flask' }))
  );

  const essencesEmptyHint = $derived(
    (essenceOptions || []).length === 0
      ? text('FABRICATE.Admin.Manager.Recipe.NoEssencesDefined', 'No essences defined')
      : text('FABRICATE.Admin.Manager.Recipe.AllEssencesAdded', 'All essences added')
  );

  function addEssence(id) {
    if (!id || Object.prototype.hasOwnProperty.call(essences || {}, id)) return;
    onChange({ ...essences, [id]: 1 });
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

<div class="manager-recipe-ingredient-essences" data-recipe-section-essences>
  <h4 class="manager-recipe-ingredient-essences-title">{text('FABRICATE.Admin.Manager.Recipe.Essences', 'Essences')}</h4>
  {#if entries.length > 0}
    <ul class="manager-recipe-essence-rows">
      {#each entries as [essenceId, quantity] (essenceId)}
        <li class="manager-recipe-essence-row" data-recipe-essence-id={essenceId}>
          <span class="manager-recipe-essence-label">
            <i class={essenceIcon(essenceId)} aria-hidden="true"></i>{essenceName(essenceId)}
          </span>
          <label class="manager-field manager-recipe-essence-quantity-field">
            <span class="manager-recipe-visually-hidden">{text('FABRICATE.Admin.Manager.Recipe.Quantity', 'Quantity')}</span>
            <input
              type="number"
              min="1"
              class="manager-recipe-essence-quantity"
              data-recipe-essence-quantity
              value={Number(quantity) > 0 ? Number(quantity) : 1}
              onchange={(e) => setQuantity(essenceId, e.target.value)}
            />
          </label>
          <button
            type="button"
            class="manager-icon-button is-danger"
            data-recipe-remove="essence"
            aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveEssence', 'Remove essence')}
            title={text('FABRICATE.Admin.Manager.Recipe.RemoveEssence', 'Remove essence')}
            onclick={() => removeEssence(essenceId)}
          ><i class="fas fa-trash" aria-hidden="true"></i></button>
        </li>
      {/each}
    </ul>
  {/if}
  <SearchablePopover
    options={availableEssenceOptions}
    pickerClass="manager-recipe-essence-picker"
    triggerClass="manager-button is-subtle manager-recipe-essence-trigger"
    triggerIcon="fas fa-flask"
    triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssence', 'Add essence')}
    triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssence', 'Add essence')}
    dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssence', 'Add essence')}
    searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
    searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
    emptyHint={essencesEmptyHint}
    onChoose={(id) => addEssence(id)}
  />
</div>
