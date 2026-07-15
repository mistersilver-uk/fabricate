<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an
  `ingredientGroup`). A requirement is satisfied by ANY one of its alternatives
  (OR), so when it has two or more alternatives they render linked by a "— or —"
  separator inside a bracketed box; a single-alternative requirement renders as a
  bare row (no box). The requirement emits a shallow-updated copy via
  `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  The loose per-row and footer add-buttons are replaced by ONE "or…" popover per
  requirement (issue 643). It offers what Fabricate can actually honour, under TWO
  headings — because the four choices do not all mean the same thing:

   - "Accept instead" — Component / Tag / Currency: the THREE real ingredient match
     types (`src/models/match/matchTypes.js`), each appended to THIS requirement as a
     new OR alternative for the row's own picker to fill in.
   - "Require as well" — Essence: there is NO essence match type. An essence
     requirement is a property of the ingredient SET (`IngredientSet.essences`), an
     AND requirement, not an OR alternative — so it sits under its own heading and
     bubbles up to the set rather than being mislabelled as an alternative. It is
     offered only while the set can still take one (`addableEssenceOptions`): once the
     set requires every essence the system defines, the choice would do nothing, and an
     entry that no-ops on click is worse than an absent entry.

  The split is an ACCESSIBILITY contract, not decoration: the trigger, dialog and
  search field therefore carry a NEUTRAL accessible name. Naming the whole control
  "Accept instead" and then handing a screen-reader user a control that adds an AND
  requirement would be a lie in exactly the place the visible headings prevent one.

  The `data-recipe-add` token family (`alternative-component` / `alternative-tag` /
  `alternative-essence` / `alternative-currency`) is PRESERVED on the four choices.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import RecipeIngredientOption from './RecipeIngredientOption.svelte';
  import SearchablePopover from '../SearchablePopover.svelte';

  let {
    group = {},
    componentOptions = [],
    itemTags = [],
    currencyUnits = [],
    // The essences the owning SET can still be given — the system's essences MINUS the
    // ones it already requires, computed by the set (which owns `essences`). Non-empty
    // is what unlocks the popover's per-SET essence choice, which is bubbled up rather
    // than appended here. Empty means the set already requires every essence the system
    // has, so the choice would be a no-op and is not offered at all: a menu entry that
    // does nothing when clicked is worse than an absent one.
    addableEssenceOptions = [],
    onChange = () => {},
    onRemove = () => {},
    onAddEssenceRequirement = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const options = $derived(Array.isArray(group?.options) ? group.options : []);
  const hasAlternatives = $derived(options.length >= 2);

  // The NEUTRAL accessible name for the trigger, the dialog and its search field. The
  // menu's two headings carry the meaning; naming the control after only one of them
  // would tell a screen-reader user "Accept instead" and then hand them the essence
  // choice, which adds an AND requirement to the set.
  const orMenuLabel = $derived(
    text('FABRICATE.Admin.Manager.Recipe.OrMenuLabel', 'Add an alternative or an extra requirement')
  );

  // The two headings. `accept-instead` holds the real OR alternatives; `require-as-well`
  // holds the one choice that is an AND requirement on the owning SET.
  const orMenuGroups = $derived([
    {
      id: 'accept-instead',
      label: text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')
    },
    ...((addableEssenceOptions || []).length > 0
      ? [
          {
            id: 'require-as-well',
            label: text('FABRICATE.Admin.Manager.Recipe.RequireAsWell', 'Require as well')
          }
        ]
      : [])
  ]);

  // The four choices, each carrying its own `data-recipe-add` token and its heading.
  // Currency appears only when the system configures units, and Essence only while the
  // owning set can still take one — so the menu never offers a choice that the system
  // cannot honour or that would do nothing.
  const orMenuOptions = $derived([
    {
      id: 'component',
      group: 'accept-instead',
      addMarker: 'alternative-component',
      icon: 'fas fa-cube',
      label: text('FABRICATE.Admin.Manager.Recipe.AddAlternativeComponent', 'Add alternative component')
    },
    {
      id: 'tags',
      group: 'accept-instead',
      addMarker: 'alternative-tag',
      icon: 'fas fa-tags',
      label: text('FABRICATE.Admin.Manager.Recipe.AddAlternativeTagRequirement', 'Add alternative tag requirement')
    },
    ...((currencyUnits || []).length > 0
      ? [
          {
            id: 'currency',
            group: 'accept-instead',
            addMarker: 'alternative-currency',
            icon: 'fa-solid fa-coins',
            label: text('FABRICATE.Admin.Manager.Recipe.AddAlternativeCost', 'Add alternative cost')
          }
        ]
      : []),
    ...((addableEssenceOptions || []).length > 0
      ? [
          {
            id: 'essence',
            group: 'require-as-well',
            addMarker: 'alternative-essence',
            icon: 'fas fa-flask-vial',
            label: text('FABRICATE.Admin.Manager.Recipe.AddSetEssenceRequirement', 'Require an essence on this set')
          }
        ]
      : [])
  ]);

  function updateOption(index, nextOption) {
    onChange({ ...group, options: options.map((option, i) => (i === index ? nextOption : option)) });
  }

  // Removing an alternative removes that option; removing the LAST alternative
  // drops the whole requirement.
  function removeOption(index) {
    if (options.length <= 1) {
      onRemove();
      return;
    }
    onChange({ ...group, options: options.filter((_, i) => i !== index) });
  }

  // A new alternative is born EMPTY (the row's own picker fills it in); a currency
  // alternative takes the first configured unit so its amount input is usable at once.
  function appendAlternative(type) {
    if (type === 'essence') {
      onAddEssenceRequirement();
      return;
    }
    if (type === 'tags') {
      onChange({ ...group, options: [...options, { quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }] });
      return;
    }
    if (type === 'currency') {
      const firstUnit = (currencyUnits || [])[0]?.id || '';
      onChange({
        ...group,
        options: [...options, { quantity: 1, match: { type: 'currency', unit: firstUnit, amount: 1 } }]
      });
      return;
    }
    onChange({
      ...group,
      options: [...options, { quantity: 1, match: { type: 'component', componentId: null } }]
    });
  }
</script>

{#snippet orMenu()}
  <SearchablePopover
    options={orMenuOptions}
    optionGroups={orMenuGroups}
    pickerClass="manager-recipe-or-picker"
    triggerClass="manager-chip manager-recipe-or-trigger"
    triggerIcon="fas fa-code-branch"
    triggerLabel={text('FABRICATE.Admin.Manager.Recipe.OrTrigger', 'or…')}
    triggerAriaLabel={orMenuLabel}
    triggerTitle={text('FABRICATE.Admin.Manager.Recipe.OrTriggerHint', 'Accept another kind of ingredient in place of this one, or require an essence on the whole set.')}
    dialogAriaLabel={orMenuLabel}
    searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.OrSearchPlaceholder', 'Search options...')}
    searchAriaLabel={orMenuLabel}
    emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
    showChevron={false}
    minWidth={220}
    maxWidth={300}
    onChoose={(type) => appendAlternative(type)}
  />
{/snippet}

<div
  class="manager-recipe-ingredient-requirement"
  class:has-alternatives={hasAlternatives}
  data-recipe-group
  data-recipe-group-id={group?.id || ''}
>
  {#if hasAlternatives}
    <!-- ANY ONE OF box (§B2): an accent-bordered container with a header pill + hint;
         the crafter picks any one of the alternatives inside. -->
    <div class="manager-recipe-any-one-of-head">
      <span class="manager-recipe-any-one-of-pill" data-recipe-any-one-of>
        <i class="fas fa-code-branch" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AnyOneOf', 'Any one of')}</span>
      </span>
      <span class="manager-recipe-any-one-of-hint manager-muted">{text('FABRICATE.Admin.Manager.Recipe.AnyOneOfHint', 'crafter picks a component or a tagged item')}</span>
    </div>
    <div class="manager-recipe-ingredient-requirement-options">
      {#each options as option, index (index)}
        {#if index > 0}
          <div class="manager-recipe-ingredient-or-separator" aria-hidden="true">
            <span>{text('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>
          </div>
        {/if}
        <RecipeIngredientOption
          {option}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          canRemove={true}
          onChange={(nextOption) => updateOption(index, nextOption)}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
    <div class="manager-recipe-requirement-adds">
      {@render orMenu()}
    </div>
  {:else}
    <!-- Bare requirement (§B1): a single row with the "or…" popover inline at its
         right end. -->
    <div class="manager-recipe-ingredient-requirement-options">
      {#each options as option, index (index)}
        <RecipeIngredientOption
          {option}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          canRemove={true}
          showRequiredTag={true}
          orControl={orMenu}
          onChange={(nextOption) => updateOption(index, nextOption)}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
  {/if}
</div>
