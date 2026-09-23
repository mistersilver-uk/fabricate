<!-- Svelte 5 runes mode -->
<!--
  One ingredient set. A recipe is satisfied by ANY one set; a set requires EVERY requirement plus
  its per-set essence amounts. This renders the set name, its requirements, the four dashed
  adders, the per-set essence editor and a remove-set button.

  THE FOUR ADDERS EACH CREATE A KIND AND NOTHING ELSE, appending a row that carries its kind and
  an empty ref for the ROW's own field to name, clear and re-name. It emits a shallow-updated
  copy via `onChange(nextSet)`; new requirements are appended with an eager id, their single
  option id-less for the store to normalize.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // No essence OFFER projection here: the adder creates an unnamed row, so the offer lives in
  // `RecipeIngredientOption`'s own field and the adder gates on the UNFILTERED roster, because a
  // system whose essences are all disabled must keep the match type.
  import RecipeIngredientGroupCard from './RecipeIngredientGroupCard.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import IconButton from '../../../components/IconButton.svelte';

  let {
    set = {},
    chromeless = false,
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Whether the system's currency feature is enabled. Preset units are seeded even for a
    // disabled system, so the "Add cost" affordance gates on this flag and not on unit presence.
    currencyEnabled = true,
    // Routed check-mode recipes route by the check outcome, so the set name is hidden there.
    showSetName = true,
    // The default display name for an unnamed set, read-only in check mode.
    defaultName = '',
    // Threaded straight through to every group card: the note beside its `Any one of` pill, and
    // empty everywhere but the Tool repair set.
    anyOneOfHint = '',
    onChange = () => {},
    onRemove = () => {},
    onDuplicate = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  function newId() {
    const random = globalThis.foundry?.utils?.randomID;
    return typeof random === 'function' ? random() : Math.random().toString(36).slice(2, 12);
  }

  // The explicit name or the default when unset, so an unnamed set is not a placeholder.
  const displayName = $derived(set?.name?.trim() ? set.name : defaultName);

  const groups = $derived(Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : []);

  // Cost is authorable only when the currency feature is enabled AND the system has units.
  const canAddCost = $derived(currencyEnabled && (currencyUnits || []).length > 0);
  // And an essence requirement only when the system has essences at all, on the UNFILTERED
  // roster — see the import note above.
  const canAddEssence = $derived((essenceOptions || []).length > 0);

  /**
   * Append a requirement of one kind, holding no value. Every adder lands here, so the four
   * cannot drift into four shapes. The requirement carries an eager id because the set keys its
   * children by it; the OPTION stays id-less for the store to normalize.
   *
   * @param {object} match the empty match for the kind being added
   */
  function addRequirement(match) {
    onChange({
      ...set,
      ingredientGroups: [...groups, { id: newId(), options: [{ quantity: 1, match }] }],
    });
  }

  function setName(name) {
    onChange({ ...set, name });
  }

  function updateGroup(index, nextGroup) {
    onChange({
      ...set,
      ingredientGroups: groups.map((group, i) => (i === index ? nextGroup : group)),
    });
  }

  function removeGroup(index) {
    onChange({ ...set, ingredientGroups: groups.filter((_, i) => i !== index) });
  }

  // THE DEDUPE-AND-BUMP IS GONE WITH THE POPOVER THAT NEEDED IT: the adder names no component,
  // so there is nothing to compare and a GM who names one twice gets the Validation tab's
  // `duplicateRequirement` issue — the honest place for a check the adder cannot make.
</script>

<div
  class={`manager-recipe-ingredient-set ${chromeless ? 'is-chromeless' : ''}`}
  data-recipe-set
  data-recipe-set-id={set?.id || ''}
>
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
        <!-- Check mode: the set name is irrelevant to routing, so the neutral default shows
             read-only rather than a user-set value. -->
        <span class="manager-recipe-ingredient-set-name is-readonly" data-recipe-set-default-name
          >{defaultName}</span
        >
      {/if}
      <IconButton
        data-recipe-duplicate="ingredient-set"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.DuplicateIngredientSet', 'Duplicate set')}
        title={text('FABRICATE.Admin.Manager.Recipe.DuplicateIngredientSet', 'Duplicate set')}
        onclick={() => onDuplicate()}><i class="fas fa-clone" aria-hidden="true"></i></IconButton
      >
      <IconButton
        class="is-danger"
        data-recipe-remove="ingredient-set"
        ariaLabel={text('FABRICATE.Admin.Manager.Recipe.RemoveIngredientSet', 'Remove set')}
        title={text('FABRICATE.Admin.Manager.Recipe.RemoveIngredientSet', 'Remove set')}
        onclick={() => onRemove()}><i class="fas fa-trash" aria-hidden="true"></i></IconButton
      >
    </div>
  {/if}

  {#if groups.length === 0}
    <p class="manager-muted manager-recipe-ingredient-set-empty">
      {text(
        'FABRICATE.Admin.Manager.Recipe.SetEmptyHint',
        'Add a component or a tag requirement this set must satisfy.'
      )}
    </p>
  {:else}
    <!-- Requirements stack with no invented "AND" dividers: the tab intro already says they
         are AND'd. -->
    <div class="manager-recipe-ingredient-set-groups">
      {#each groups as group, index (group?.id || index)}
        <RecipeIngredientGroupCard
          {group}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          {currencyEnabled}
          {essenceOptions}
          {anyOneOfHint}
          onChange={(nextGroup) => updateGroup(index, nextGroup)}
          onRemove={() => removeGroup(index)}
        />
      {/each}
    </div>
  {/if}

  <!-- The four adders, in the kind order the row's own select offers. The `data-recipe-add`
       token family is PRESERVED across roughly twenty-five call sites, so `cost` and
       `essence-requirement` still name the currency and essence adders. -->
  <div class="manager-recipe-ingredient-set-add">
    <ManagerButton
      role="dashed"
      data-recipe-add="component"
      onclick={() => addRequirement({ type: 'component', componentId: null })}
    >
      <i class="fas fa-cube" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddComponent', 'Add component')}</span>
    </ManagerButton>
    <ManagerButton
      role="dashed"
      data-recipe-add="tag-requirement"
      onclick={() => addRequirement({ type: 'tags', tags: [], tagMatch: 'any' })}
    >
      <i class="fas fa-tags" aria-hidden="true"></i>
      <span>{text('FABRICATE.Admin.Manager.Recipe.AddTagShort', 'Add tag')}</span>
    </ManagerButton>
    {#if canAddEssence}
      <!-- The set-level essence add appends a single-option essence GROUP, an AND-required
           requirement, and an essence may repeat across groups. -->
      <ManagerButton
        role="dashed"
        data-recipe-add="essence-requirement"
        onclick={() => addRequirement({ type: 'essence', essenceId: '', amount: 1 })}
      >
        <i class="fas fa-flask-vial" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddEssenceShort', 'Add essence')}</span>
      </ManagerButton>
    {/if}
    {#if canAddCost}
      <ManagerButton
        role="dashed"
        data-recipe-add="cost"
        onclick={() => addRequirement({ type: 'currency', unit: '', amount: 1 })}
      >
        <i class="fa-solid fa-coins" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddCurrency', 'Add currency')}</span>
      </ManagerButton>
    {/if}
  </div>
</div>
