<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import SearchablePopover from '../SearchablePopover.svelte';
  import RecipeIngredientGroupCard from '../recipe/RecipeIngredientGroupCard.svelte';

  let {
    groups = [],
    componentOptions = [],
    itemTags = [],
    essenceOptions = [],
    currencyUnits = [],
    currencyEnabled = false,
    disabled = false,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function nextId() {
    return `repair-group-${globalThis.crypto.randomUUID()}`;
  }

  function addGroup(match) {
    onChange([...groups, { id: nextId(), name: '', options: [{ quantity: 1, match }] }]);
  }

  function updateGroup(index, nextGroup) {
    onChange(groups.map((group, groupIndex) => groupIndex === index ? nextGroup : group));
  }

  function removeGroup(index) {
    onChange(groups.filter((_, groupIndex) => groupIndex !== index));
  }

  const componentPickerOptions = $derived(
    (componentOptions || []).map((option) => ({ id: option.id, label: option.name, img: option.img }))
  );
  const essencePickerOptions = $derived(
    (essenceOptions || []).map((option) => ({ id: option.id, label: option.name, icon: option.icon || 'fas fa-flask-vial' }))
  );
  const canAddCurrency = $derived(currencyEnabled && (currencyUnits || []).length > 0);

  function addComponentGroup(componentId) {
    if (componentId) addGroup({ type: 'component', componentId });
  }

  function addTagGroup() {
    addGroup({ type: 'tags', tags: [], tagMatch: 'any' });
  }

  function addEssenceGroup(essenceId) {
    if (essenceId) addGroup({ type: 'essence', essenceId, amount: 1 });
  }

  function addCurrencyGroup() {
    addGroup({ type: 'currency', unit: currencyUnits[0]?.id || '', amount: 1 });
  }
</script>

<section class="manager-tool-repair" data-tool-repair-requirements>
  <div class="manager-tool-editor-card-heading">
    <div>
      <p class="manager-kicker">{text('FABRICATE.Admin.Manager.Tools.Editor.Repair', 'Repair materials')}</p>
      <h3>{text('FABRICATE.Admin.Manager.Tools.Editor.RepairTitle', 'Ingredient groups')}</h3>
    </div>
  </div>
  <p class="manager-muted">{text('FABRICATE.Admin.Manager.Tools.Editor.RepairHint', 'Every group is required (AND); any one option inside a group can satisfy it (OR).')}</p>

  <div class="manager-recipe-ingredient-set-add manager-tool-repair-adds">
    <span data-tool-repair-add-group="component">
      <SearchablePopover
        options={componentPickerOptions}
        pickerClass="manager-recipe-component-picker"
        triggerClass="manager-button is-dashed"
        triggerIcon="fas fa-cube"
        triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddComponent', 'Add component')}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddComponent', 'Add component')}
        dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
        searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
        searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
        emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
        showChevron={false}
        {disabled}
        onChoose={addComponentGroup}
      />
    </span>
    <button type="button" class="manager-button is-dashed" data-tool-repair-add-group="tags" onclick={addTagGroup} {disabled}>
      <i class="fas fa-tags" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddTagRequirement', 'Add tag requirement')}</span>
    </button>
    {#if essencePickerOptions.length > 0}
      <span data-tool-repair-add-group="essence">
        <SearchablePopover
          options={essencePickerOptions}
          pickerClass="manager-recipe-essence-picker"
          triggerClass="manager-button is-dashed"
          triggerIcon="fas fa-flask-vial"
          triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssenceRequirement', 'Add essence requirement')}
          triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssenceRequirement', 'Add essence requirement')}
          dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssenceRequirement', 'Add essence requirement')}
          searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
          searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
          emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoEssencesDefined', 'No essences defined')}
          showChevron={false}
          {disabled}
          onChoose={addEssenceGroup}
        />
      </span>
    {/if}
    {#if canAddCurrency}
      <button type="button" class="manager-button is-dashed" data-tool-repair-add-group="currency" onclick={addCurrencyGroup} {disabled}>
        <i class="fa-solid fa-coins" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddCost', 'Add cost')}</span>
      </button>
    {/if}
  </div>

  {#each groups as group, groupIndex (group.id || groupIndex)}
    <fieldset class="manager-tool-repair-group" data-tool-repair-group={groupIndex} {disabled}>
      <legend>{text('FABRICATE.Admin.Manager.Tools.Editor.RepairGroup', 'Required group')} {groupIndex + 1}</legend>
      <button type="button" class="manager-icon-button is-danger" aria-label={text('FABRICATE.Admin.Manager.Tools.Editor.RemoveRepairGroup', 'Remove repair group')} title={text('FABRICATE.Admin.Manager.Tools.Editor.RemoveRepairGroup', 'Remove repair group')} onclick={() => removeGroup(groupIndex)}>
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
      {#if (group.options || []).length === 0}
        <p class="manager-validation-error" role="alert">{text('FABRICATE.Admin.Manager.Tools.Editor.RepairEmpty', 'Remove this empty group and add a complete requirement.')}</p>
      {:else}
        <RecipeIngredientGroupCard
          {group}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          {currencyEnabled}
          {essenceOptions}
          onChange={(nextGroup) => updateGroup(groupIndex, nextGroup)}
          onRemove={() => removeGroup(groupIndex)}
        />
      {/if}
    </fieldset>
  {/each}
</section>
