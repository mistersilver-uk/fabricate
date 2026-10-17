<!-- Svelte 5 runes mode -->
<!--
  One ingredient set in `SetCard`. A recipe is satisfied by ANY one set; a set requires EVERY
  requirement plus its per-set essence amounts. This renders the set name, its requirements, the
  one dashed `Ingredient` adder over the kind menu, and Duplicate and Remove behind the kebab.

  THE ADDER CREATES A KIND AND NOTHING ELSE, appending a row that carries its kind and an empty
  ref for the ROW's own field to name, clear and re-name, and focus moves to that field. It emits
  a shallow-updated copy via `onChange(nextSet)`; new requirements are appended with an eager id,
  their single option id-less for the store to normalize.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // No essence offer projection here: the adder creates an unnamed row and the choice group
  // applies the offer to the row's catalogue. The adder gates on the unfiltered roster, because a
  // system whose essences are all disabled must keep the match type.
  import ChoiceGroup from '../../../components/ChoiceGroup.svelte';
  import KindAdder from '../../../components/KindAdder.svelte';
  import SetCard from '../../../components/SetCard.svelte';
  import { localizeOr } from '../../../util/localizeOr.js';
  import { newDraftId as newId } from '../../../util/draftId.js';
  import { createPendingFocus } from '../../../util/pendingFocus.js';
  import {
    emptyIngredientOption,
    offeredIngredientKinds,
  } from '../../../components/pickerRowKinds.js';

  let {
    set = {},
    chromeless = false,
    componentOptions = [],
    essenceOptions = [],
    itemTags = [],
    tagComponentCounts = null,
    currencyUnits = [],
    // Whether the system's currency feature is enabled. Preset units are seeded even for a
    // disabled system, so the Currency kind gates on this flag and not on unit presence.
    currencyEnabled = true,
    // The display name of an unnamed set, "Set N".
    defaultName = '',
    // Threaded straight through to every choice group: the note beside its `Any one of` pill, and
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

  // The explicit name or the default when unset, so an unnamed set is not a placeholder.
  const displayName = $derived(set?.name?.trim() ? set.name : defaultName);

  const groups = $derived(Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : []);

  // The kind select's own subset, essence gated on the UNFILTERED roster (see the import note).
  const kinds = $derived(
    offeredIngredientKinds({ essenceOptions, currencyUnits, currencyEnabled })
  );

  // The id of the requirement whose name field takes focus once the caller hands it back; the next
  // set that does not hold it disarms it, so a refused write never moves focus. Rooted at the card
  // because the groups container does not exist while the set is empty.
  let root = $state(null);
  const pendingFocus = createPendingFocus();

  /**
   * Append a requirement of one kind, holding no value. The requirement carries an eager id
   * because the set keys its children by it; the OPTION stays id-less for the store to normalize.
   */
  function addRequirement(kind) {
    const id = newId();
    pendingFocus.arm(id);
    onChange({
      ...set,
      ingredientGroups: [...groups, { id, options: [emptyIngredientOption(kind)] }],
    });
  }

  $effect(() => {
    const held = groups;
    pendingFocus.settle(
      (id) => held.some((group) => group?.id === id),
      (id) =>
        root
          ?.querySelector(`[data-recipe-group-id="${id}"]`)
          ?.querySelector('[data-recipe-option-search], [data-recipe-add-tag]')
          ?.focus()
    );
  });

  const addAnIngredient = $derived(
    localizeOr('FABRICATE.Admin.Manager.Recipe.AddAnIngredient', 'Add an ingredient')
  );

  function setName(name) {
    onChange({ ...set, name });
  }

  const actions = $derived([
    {
      id: 'duplicate',
      label: text('FABRICATE.Admin.Manager.Recipe.DuplicateIngredientSet', 'Duplicate set'),
      icon: 'fas fa-clone',
      data: { 'data-recipe-duplicate': 'ingredient-set' },
    },
    {
      id: 'remove',
      label: text('FABRICATE.Admin.Manager.Recipe.RemoveIngredientSet', 'Remove set'),
      icon: 'fas fa-trash',
      danger: true,
      data: { 'data-recipe-remove': 'ingredient-set' },
    },
  ]);

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

<SetCard
  bind:element={root}
  variant={chromeless ? 'bare' : 'default'}
  kicker={localizeOr('FABRICATE.Common.SetCard.Kicker.IngredientSet', 'Ingredient set')}
  name={displayName}
  namePlaceholder={text('FABRICATE.Admin.Manager.Recipe.SetNamePlaceholder', 'Set name')}
  nameProps={{ 'data-recipe-set-field': 'name' }}
  onRename={setName}
  {actions}
  onAction={(id) => {
    if (id === 'duplicate') onDuplicate();
    else if (id === 'remove') onRemove();
  }}
  data-recipe-set
  data-recipe-set-id={set?.id || ''}
>
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
        <ChoiceGroup
          {group}
          {componentOptions}
          {itemTags}
          {tagComponentCounts}
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
  {#snippet adder()}
    <KindAdder
      {kinds}
      word={localizeOr('FABRICATE.Admin.Manager.Recipe.IngredientAdder', 'Ingredient')}
      name={addAnIngredient}
      heading={addAnIngredient}
      hook="ingredient"
      triggerHook="ingredient"
      menuClass="manager-recipe-or-menu manager-recipe-ingredient-menu"
      onAdd={addRequirement}
    />
  {/snippet}
</SetCard>
