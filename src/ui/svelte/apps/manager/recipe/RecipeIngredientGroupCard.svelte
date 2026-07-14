<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an
  `ingredientGroup`). A requirement is satisfied by ANY one of its alternatives
  (OR), so when it has two or more alternatives they render linked by a "— or —"
  separator inside a bracketed box; a single-alternative requirement renders as a
  bare row (no box). The requirement emits a shallow-updated copy via
  `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  The loose per-row and footer add-buttons are replaced by ONE "or…" popover per
  requirement (issue 643). It offers what Fabricate can actually honour:

   - "Accept instead" — Component / Tag / Currency: the THREE real ingredient match
     types (`src/models/match/matchTypes.js`), each appended to THIS requirement as a
     new OR alternative for the row's own picker to fill in.
   - "Require as well" — Essence: there is NO essence match type. An essence
     requirement is a property of the ingredient SET (`IngredientSet.essences`), an
     AND requirement, not an OR alternative — so it is offered under its own heading
     and bubbles up to the set rather than being mislabelled as an alternative.

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
    // Non-empty only when the system has essences: unlocks the popover's per-SET
    // essence requirement, which is bubbled up rather than appended here.
    essenceOptions = [],
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

  // The four choices, each carrying its own `data-recipe-add` token. Currency and
  // essence appear only when the system actually configures them, so the menu never
  // offers a choice the system cannot honour.
  const acceptInsteadOptions = $derived([
    {
      id: 'component',
      addMarker: 'alternative-component',
      icon: 'fas fa-cube',
      label: text('FABRICATE.Admin.Manager.Recipe.AddAlternativeComponent', 'Add alternative component')
    },
    {
      id: 'tags',
      addMarker: 'alternative-tag',
      icon: 'fas fa-tags',
      label: text('FABRICATE.Admin.Manager.Recipe.AddAlternativeTagRequirement', 'Add alternative tag requirement')
    },
    ...((currencyUnits || []).length > 0
      ? [
          {
            id: 'currency',
            addMarker: 'alternative-currency',
            icon: 'fa-solid fa-coins',
            label: text('FABRICATE.Admin.Manager.Recipe.AddAlternativeCost', 'Add alternative cost')
          }
        ]
      : []),
    ...((essenceOptions || []).length > 0
      ? [
          {
            id: 'essence',
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

<div
  class="manager-recipe-ingredient-requirement"
  class:has-alternatives={hasAlternatives}
  data-recipe-group
  data-recipe-group-id={group?.id || ''}
>
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
    <SearchablePopover
      options={acceptInsteadOptions}
      pickerClass="manager-recipe-or-picker"
      triggerClass="manager-chip manager-recipe-or-trigger"
      triggerIcon="fas fa-code-branch"
      triggerLabel={text('FABRICATE.Admin.Manager.Recipe.OrTrigger', 'or…')}
      triggerAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')}
      triggerTitle={text('FABRICATE.Admin.Manager.Recipe.AcceptInsteadHint', 'Accept another kind of ingredient in place of this one.')}
      dialogAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')}
      searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')}
      searchAriaLabel={text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')}
      emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
      showChevron={false}
      minWidth={200}
      maxWidth={280}
      onChoose={(type) => appendAlternative(type)}
    />
  </div>
</div>
