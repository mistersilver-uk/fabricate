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
  import RecipeEssenceRequirements from './RecipeEssenceRequirements.svelte';
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
  const essences = $derived(set?.essences && typeof set.essences === 'object' ? set.essences : {});

  const componentPickerOptions = $derived(
    (componentOptions || []).map(item => ({ id: item.id, label: item.name, img: item.img }))
  );

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

  function updateEssences(nextEssences) {
    onChange({ ...set, essences: nextEssences });
  }

  // The requirement's "or…" popover offers Essence under its OWN heading, because an
  // essence requirement is NOT an OR alternative: there is no essence match type, and
  // `IngredientSet.essences` is an AND requirement on the whole SET. Choosing it seeds
  // the first essence the set does not already require, at amount 1; the per-set
  // essence editor below refines it.
  //
  // The SET owns `essences`, so the set is the only thing that can say whether another
  // essence can still be added. It hands the requirement cards exactly the addable ones
  // — once this is empty the popover drops the choice entirely, rather than offering an
  // entry whose handler would silently return.
  const addableEssenceOptions = $derived(
    (essenceOptions || []).filter((essence) => !(essence.id in essences))
  );

  function addEssenceRequirement() {
    const next = addableEssenceOptions[0];
    if (!next) return;
    updateEssences({ ...essences, [next.id]: 1 });
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
    <div class="manager-recipe-ingredient-set-groups">
      {#each groups as group, index (group?.id || index)}
        {#if index > 0}
          <div class="manager-recipe-ingredient-and-separator" aria-hidden="true">
            <span>{text('FABRICATE.Admin.Manager.Recipe.And', 'AND')}</span>
          </div>
        {/if}
        <RecipeIngredientGroupCard
          {group}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          {addableEssenceOptions}
          onChange={(nextGroup) => updateGroup(index, nextGroup)}
          onRemove={() => removeGroup(index)}
          onAddEssenceRequirement={addEssenceRequirement}
        />
      {/each}
    </div>
  {/if}

  <div class="manager-recipe-ingredient-set-add">
    <SearchablePopover
      options={componentPickerOptions}
      pickerClass="manager-recipe-component-picker manager-recipe-add-component"
      triggerClass="manager-button is-subtle manager-recipe-add-component-trigger"
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
      class="manager-button is-subtle"
      data-recipe-add="tag-requirement"
      onclick={() => addTagRequirement()}
    >
      <i class="fas fa-tags" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddTagRequirement', 'Add tag requirement')}</span>
    </button>
    {#if (currencyUnits || []).length > 0}
      <button
        type="button"
        class="manager-button is-subtle"
        data-recipe-add="cost"
        onclick={() => addCurrencyRequirement()}
      >
        <i class="fa-solid fa-coins" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddCost', 'Add cost')}</span>
      </button>
    {/if}
  </div>

  {#if (essenceOptions || []).length > 0}
    <RecipeEssenceRequirements
      {essences}
      {essenceOptions}
      onChange={updateEssences}
    />
  {/if}
</div>
