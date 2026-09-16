<!-- Svelte 5 runes mode -->
<!--
  One ingredient set. A recipe is satisfied by ANY one set (OR across sets); a
  set requires EVERY requirement (AND) plus its per-set essence amounts. This
  renders the set name, its requirements (via RecipeIngredientGroupCard), the two
  "Add component" / "Add tag requirement" controls, the per-set essence editor
  (only when the system has essences), and a remove-set button.

  THE FOUR ADDERS EACH CREATE A KIND AND NOTHING ELSE (issue 1373, maintainer round 5).
  `Add component` used to open a popover: the GM picked a component and the requirement was
  born holding it, with its kind then fixed for the life of the row. `proto:2315` draws four
  plain dashed chips — `Add component / Add tag / Add essence / Add currency` — and
  `proto:4698` appends `blankReq(kind)` for each, which is a row carrying its kind and an empty
  ref. The value is named in the ROW, by a field that can also clear and re-name it.

  It emits a shallow-updated copy via `onChange(nextSet)`; new requirements are appended with
  an eager id, their single option id-less for the store to normalize.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // (The add-new essence OFFER used to be projected here through `selectableEssenceOptions`,
  // because `Add essence requirement` was a PICKER. It creates an unnamed essence row now —
  // issue 1373's maintainer round 5 — so the offer lives in `RecipeIngredientOption`'s own
  // field, and the adder gates on the unfiltered roster for the reason issue 1036/2 gives:
  // a system whose essences are all disabled must keep the match type.)
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
    // Whether the system's currency feature is enabled. The normalizer seeds preset units
    // even for a disabled system, so the "Add cost" affordance gates on this flag too;
    // existing currency requirements still render (read-only) when it is false.
    currencyEnabled = true,
    // Routed check-mode recipes route by the check outcome, not by a named
    // ingredient set, so the set name is hidden there (showSetName = false).
    showSetName = true,
    // The default display name for an unnamed set ("Set 1"): shown in the editable
    // field when the set has no explicit name, and read-only in check mode.
    defaultName = '',
    // Threaded straight through to every group card: the note beside its `Any one of` pill.
    // See `RecipeIngredientGroupCard` for why a caller would replace it. Empty everywhere but
    // the Tool repair set, so no recipe or downtime call site moves.
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

  // The editable name field shows the explicit name, or the default when unset, so
  // a usable unnamed set is not hidden behind a placeholder.
  const displayName = $derived(set?.name?.trim() ? set.name : defaultName);

  const groups = $derived(Array.isArray(set?.ingredientGroups) ? set.ingredientGroups : []);

  // Cost is authorable only when the currency feature is enabled AND the system has units.
  const canAddCost = $derived(currencyEnabled && (currencyUnits || []).length > 0);
  // And an essence requirement only when the system has essences at all (issue 1036/2 keeps
  // this on the unfiltered roster; see the import note above).
  const canAddEssence = $derived((essenceOptions || []).length > 0);

  /**
   * Append a requirement of one kind, holding no value.
   *
   * Every adder lands here (`proto:4698`), so the four cannot drift into four shapes: what
   * differs between them is the empty match the kind needs, and nothing else. The requirement
   * carries an eager id because the set keys its children by it; the OPTION stays id-less for
   * the store to normalize, as it always has.
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

  // THE DEDUPE-AND-BUMP IS GONE WITH THE POPOVER THAT NEEDED IT. `Add component` used to
  // choose a component, so it could see that the set already required that one and bump its
  // quantity instead of appending a second requirement the Validation tab would flag. The
  // adder names no component now, so there is nothing to compare: a GM who names the same
  // component twice gets the Validation tab's `duplicateRequirement` issue, which is the
  // honest place for a check the adder can no longer make. `RecipeIngredientGroupCard` records
  // the identical reasoning for its own alternative adders.
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
        <!-- Check mode: the set name is irrelevant to routing, so show the neutral
             default name read-only rather than a user-set value. -->
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
    <!-- §B7: requirements stack with no invented "AND" hairline dividers — every
         requirement in a set is AND'd, which the tab intro copy already states. -->
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

  <!-- `Add component / Add tag / Add essence / Add currency` (`proto:2315`), in the kind order
       the row's own select offers. The `data-recipe-add` token family is PRESERVED across the
       conversion — this file drives roughly twenty-five call sites through it — so `cost` and
       `essence-requirement` still name the currency and essence adders even though the labels
       they carry are the design's shorter ones. -->
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
      <!-- §B6: the set-level essence add. Essence is a first-class match type (issue 649), so
           this appends a single-option essence GROUP — an AND-required requirement, preserving
           the old per-set semantics — and an essence may repeat across groups. -->
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
