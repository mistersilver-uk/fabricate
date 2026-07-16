<!-- Svelte 5 runes mode -->
<!--
  One ingredient set. A recipe is satisfied by ANY one set (OR across sets); a
  set requires EVERY requirement (AND) plus its per-set essence amounts. This
  renders the set name, its requirements (via RecipeIngredientGroupCard), the two
  "Add component" / "Add tag requirement" controls, the per-set essence editor
  (only when the system has essences), and a remove-set button.

  Component-vs-tags is chosen at creation: "Add component" picks a component from
  a popover and appends a requirement born populated with that component;
  "Add tag requirement" appends an empty tag requirement to fill inline. It emits
  a shallow-updated copy via `onChange(nextSet)`; new requirements/options are
  appended id-less for the store to normalize.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeIngredientGroupCard from './RecipeIngredientGroupCard.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    set = {},
    chromeless = false,
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Routed check-mode recipes route by the check outcome, not by a named
    // ingredient set, so the set name is hidden there (showSetName = false).
    showSetName = true,
    // The default display name for an unnamed set ("Set 1"): shown in the editable
    // field when the set has no explicit name, and read-only in check mode.
    defaultName = '',
    onChange = () => {},
    onRemove = () => {},
    onDuplicate = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // The editable name field shows the explicit name, or the default when unset, so
  // a usable unnamed set is not hidden behind a placeholder.
  const displayName = $derived(set?.name?.trim() ? set.name : defaultName);

  const groups = $derived(Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : []);

  const componentPickerOptions = $derived(
    (componentOptions || []).map(item => ({ id: item.id, label: item.name, img: item.img }))
  );

  // The set-level "Add essence requirement" picker offers EVERY system essence: an
  // essence is now a first-class ingredient match type (issue 649), so the set-add
  // appends a single-option essence GROUP (an AND-required requirement, preserving the
  // old per-set semantics) and an essence may legitimately repeat across groups.
  const essencePickerOptions = $derived(
    (essenceOptions || [])
      .map((essence) => ({ id: essence.id, label: essence.name, icon: essence.icon || 'fas fa-flask-vial' }))
  );

  function addEssenceGroup(id) {
    if (!id) return;
    onChange({
      ...set,
      ingredientGroups: [...groups, { id: newId(), options: [{ quantity: 1, match: { type: 'essence', essenceId: id, amount: 1 } }] }]
    });
  }

  function setName(name) {
    onChange({ ...set, name });
  }

  function updateGroup(index, nextGroup) {
    onChange({ ...set, ingredientGroups: groups.map((group, i) => (i === index ? nextGroup : group)) });
  }

  function removeGroup(index) {
    onChange({ ...set, ingredientGroups: groups.filter((_, i) => i !== index) });
  }

  // Adding a component the set already requires as its own single-component
  // requirement bumps that requirement's quantity by 1 (capped) rather than
  // appending a duplicate requirement, which the Validation tab would flag.
  function addComponentRequirement(id) {
    const existingIndex = groups.findIndex(
      (group) =>
        Array.isArray(group?.options) &&
        group.options.length === 1 &&
        group.options[0]?.match?.type === 'component' &&
        group.options[0].match.componentId === id
    );
    if (existingIndex !== -1) {
      const existing = groups[existingIndex];
      const option = existing.options[0];
      const nextQuantity = Math.min(9999, (Number(option.quantity) > 0 ? Number(option.quantity) : 1) + 1);
      onChange({
        ...set,
        ingredientGroups: groups.map((group, i) =>
          i === existingIndex ? { ...existing, options: [{ ...option, quantity: nextQuantity }] } : group
        )
      });
      return;
    }
    onChange({
      ...set,
      ingredientGroups: [...groups, { id: newId(), options: [{ quantity: 1, match: { type: 'component', componentId: id } }] }]
    });
  }

  function addTagRequirement() {
    onChange({
      ...set,
      ingredientGroups: [...groups, { id: newId(), options: [{ quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }] }]
    });
  }

  // A currency requirement is a one-option group born with the first configured
  // unit (or empty) and an amount of 1, refined inline in the requirement editor.
  function addCurrencyRequirement() {
    const firstUnit = (currencyUnits || [])[0]?.id || '';
    onChange({
      ...set,
      ingredientGroups: [...groups, { id: newId(), options: [{ quantity: 1, match: { type: 'currency', unit: firstUnit, amount: 1 } }] }]
    });
  }

</script>

<div class={`manager-recipe-ingredient-set ${chromeless ? 'is-chromeless' : ''}`} data-recipe-set data-recipe-set-id={set?.id || ''}>
  {#if !chromeless}
    <div class="manager-recipe-ingredient-set-head">
      {#if showSetName}
        <input
          type="text"
          class="manager-recipe-ingredient-set-name"
          data-recipe-set-field="name"
          placeholder={text('FABRICATE.Admin.Manager.Recipe.SetNamePlaceholder', 'Set name')}
          value={displayName}
          onchange={(e) => setName(e.target.value)}
          aria-label={text('FABRICATE.Admin.Manager.Recipe.SetLabel', 'Set')}
        />
      {:else}
        <!-- Check mode: the set name is irrelevant to routing, so show the neutral
             default name read-only rather than a user-set value. -->
        <span class="manager-recipe-ingredient-set-name is-readonly" data-recipe-set-default-name
          >{defaultName}</span
        >
      {/if}
      <button
        type="button"
        class="manager-icon-button"
        data-recipe-duplicate="ingredient-set"
        aria-label={text('FABRICATE.Admin.Manager.Recipe.DuplicateIngredientSet', 'Duplicate set')}
        title={text('FABRICATE.Admin.Manager.Recipe.DuplicateIngredientSet', 'Duplicate set')}
        onclick={() => onDuplicate()}
      ><i class="fas fa-clone" aria-hidden="true"></i></button>
      <button
        type="button"
        class="manager-icon-button is-danger"
        data-recipe-remove="ingredient-set"
        aria-label={text('FABRICATE.Admin.Manager.Recipe.RemoveIngredientSet', 'Remove set')}
        title={text('FABRICATE.Admin.Manager.Recipe.RemoveIngredientSet', 'Remove set')}
        onclick={() => onRemove()}
      ><i class="fas fa-trash" aria-hidden="true"></i></button>
    </div>
  {/if}

  {#if groups.length === 0}
    <p class="manager-muted manager-recipe-ingredient-set-empty">{text('FABRICATE.Admin.Manager.Recipe.SetEmptyHint', 'Add a component or a tag requirement this set must satisfy.')}</p>
  {:else}
    <!-- §B7: requirements stack with no invented "AND" hairline dividers — every
         requirement in a set is AND'd, which the tab intro copy already states. -->
    <div class="manager-recipe-ingredient-set-groups">
      {#each groups as group, index (group?.id || index)}
        <RecipeIngredientGroupCard
          {group}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          {essenceOptions}
          onChange={(nextGroup) => updateGroup(index, nextGroup)}
          onRemove={() => removeGroup(index)}
        />
      {/each}
    </div>
  {/if}

  <div class="manager-recipe-ingredient-set-add">
    <SearchablePopover
      options={componentPickerOptions}
      pickerClass="manager-recipe-component-picker manager-recipe-add-component"
      triggerClass="manager-button is-dashed manager-recipe-add-component-trigger"
      triggerIcon="fas fa-cube"
      triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddComponent', 'Add component')}
      triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddComponent', 'Add component')}
      triggerAddMarker="component"
      dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.PickComponent', 'Pick component')}
      searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
      searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.ComponentSearchPlaceholder', 'Search components...')}
      emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
      showChevron={false}
      onChoose={(id) => addComponentRequirement(id)}
    />
    <button
      type="button"
      class="manager-button is-dashed"
      data-recipe-add="tag-requirement"
      onclick={() => addTagRequirement()}
    >
      <i class="fas fa-tags" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddTagRequirement', 'Add tag requirement')}</span>
    </button>
    {#if (essenceOptions || []).length > 0}
      <!-- §B6: the set-level essence add. Essence is now a first-class match type
           (issue 649), so this appends a single-option essence GROUP (AND-required,
           preserving the old per-set semantics). The picker offers every system
           essence; an essence may repeat across groups. -->
      <SearchablePopover
        options={essencePickerOptions}
        pickerClass="manager-recipe-essence-picker"
        triggerClass="manager-button is-dashed manager-recipe-essence-trigger"
        triggerIcon="fas fa-flask-vial"
        triggerLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssenceRequirement', 'Add essence requirement')}
        triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssenceRequirement', 'Add essence requirement')}
        triggerAddMarker="essence-requirement"
        dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AddEssenceRequirement', 'Add essence requirement')}
        searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
        searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.EssenceSearchPlaceholder', 'Search essences...')}
        emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoEssencesDefined', 'No essences defined')}
        showChevron={false}
        onChoose={(id) => addEssenceGroup(id)}
      />
    {/if}
    {#if (currencyUnits || []).length > 0}
      <button
        type="button"
        class="manager-button is-dashed"
        data-recipe-add="cost"
        onclick={() => addCurrencyRequirement()}
      >
        <i class="fa-solid fa-coins" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddCost', 'Add cost')}</span>
      </button>
    {/if}
  </div>
</div>
