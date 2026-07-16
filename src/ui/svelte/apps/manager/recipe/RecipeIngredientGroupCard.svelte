<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an
  `ingredientGroup`). A requirement is satisfied by ANY one of its alternatives
  (OR), so when it has two or more alternatives they render linked by a "— or —"
  separator inside a bracketed box; a single-alternative requirement renders as a
  bare row (no box). The requirement emits a shallow-updated copy via
  `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  The add-affordances diverge by shape (issue 643): a BARE single-alternative row
  keeps ONE compact "or…" popover inline at its right end, while a multi-alternative
  BOX carries explicit dashed add-buttons at its foot (Add component / tag / cost /
  essence). Both drive the same append semantics: every choice is a real OR
  ALTERNATIVE appended to THIS requirement for the row's own picker to fill in — since
  essence is now a first-class ingredient match type (issue 649), "component OR
  essence" is genuinely authorable and the popover is a single flat "Accept instead"
  list rather than the old two-heading Accept-instead / Require-as-well split.

  Currency appears only when the system configures units; Essence appears only when the
  system enables essences at all (`essenceOptions.length > 0`) — an OR essence may
  repeat across groups, so it is NOT gated on system-minus-already-required.

  The `data-recipe-add` token family (`alternative-component` / `alternative-tag` /
  `alternative-essence` / `alternative-currency`) is PRESERVED on the choices.
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
    // The system's essences ({ id, name, icon }). Non-empty unlocks the essence OR
    // alternative (an essence match option appended to THIS requirement). Empty means
    // the system has no essences, so the choice is not offered at all.
    essenceOptions = [],
    onChange = () => {},
    onRemove = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const options = $derived(Array.isArray(group?.options) ? group.options : []);
  const hasAlternatives = $derived(options.length >= 2);
  const hasEssences = $derived((essenceOptions || []).length > 0);

  // The accessible name for the trigger, the dialog and its search field. The menu is a
  // single flat "Accept instead" list of real OR alternatives (issue 649).
  const orMenuLabel = $derived(
    text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')
  );

  // The flat "Accept instead" choices, each carrying its own `data-recipe-add` token.
  // No option groups — a single ungrouped bucket (optionGroups: []) so SearchablePopover
  // renders no lone heading. Currency appears only when the system configures units;
  // essence only when the system enables essences.
  const orMenuOptions = $derived([
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
    ...(hasEssences
      ? [
          {
            id: 'essence',
            addMarker: 'alternative-essence',
            icon: 'fas fa-flask-vial',
            label: text('FABRICATE.Admin.Manager.Recipe.AddAlternativeEssence', 'Add alternative essence')
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
  // alternative takes the first configured unit and an essence alternative the first
  // configured essence so their amount input is usable at once.
  function appendAlternative(type) {
    if (type === 'essence') {
      const firstEssence = (essenceOptions || [])[0]?.id || '';
      onChange({
        ...group,
        options: [...options, { quantity: 1, match: { type: 'essence', essenceId: firstEssence, amount: 1 } }]
      });
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
    optionGroups={[]}
    pickerClass="manager-recipe-or-picker"
    triggerClass="manager-chip manager-recipe-or-trigger"
    triggerIcon="fas fa-code-branch"
    triggerLabel={text('FABRICATE.Admin.Manager.Recipe.OrTrigger', 'or…')}
    triggerAriaLabel={orMenuLabel}
    triggerTitle={text('FABRICATE.Admin.Manager.Recipe.OrTriggerHint', 'Accept another kind of ingredient in place of this one.')}
    dialogAriaLabel={orMenuLabel}
    searchPlaceholder={text('FABRICATE.Admin.Manager.Recipe.OrSearchPlaceholder', 'Search options...')}
    searchAriaLabel={orMenuLabel}
    emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
    showChevron={false}
    showSearch={false}
    popoverClass="manager-recipe-or-popover"
    minWidth={220}
    maxWidth={340}
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
          {essenceOptions}
          canRemove={true}
          onChange={(nextOption) => updateOption(index, nextOption)}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
    <!-- The multi-alternative box uses explicit dashed add-buttons (issue 643),
         modelled on the set-level add row, instead of the compact "or…" popover the
         bare rows keep. They reuse the same append semantics: each button appends a real
         OR alternative to THIS requirement (component / tag / currency / essence).
         Currency shows only when the system configures units, essence only when the
         system enables essences, and the `data-recipe-add` marker family is preserved on
         each button. -->
    <div class="manager-recipe-requirement-adds">
      <button
        type="button"
        class="manager-button is-dashed"
        data-recipe-add="alternative-component"
        onclick={() => appendAlternative('component')}
      >
        <i class="fas fa-cube" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddComponent', 'Add component')}</span>
      </button>
      <button
        type="button"
        class="manager-button is-dashed"
        data-recipe-add="alternative-tag"
        onclick={() => appendAlternative('tags')}
      >
        <i class="fas fa-tags" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AddTagRequirement', 'Add tag requirement')}</span>
      </button>
      {#if (currencyUnits || []).length > 0}
        <button
          type="button"
          class="manager-button is-dashed"
          data-recipe-add="alternative-cost"
          onclick={() => appendAlternative('currency')}
        >
          <i class="fa-solid fa-coins" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AddCost', 'Add cost')}</span>
        </button>
      {/if}
      {#if hasEssences}
        <button
          type="button"
          class="manager-button is-dashed"
          data-recipe-add="alternative-essence"
          onclick={() => appendAlternative('essence')}
        >
          <i class="fas fa-flask-vial" aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AddAlternativeEssence', 'Add alternative essence')}</span>
        </button>
      {/if}
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
          {essenceOptions}
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
