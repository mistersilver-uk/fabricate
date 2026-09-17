<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an `ingredientGroup`), satisfied by
  ANY one of its alternatives. Two or more render linked by a "— or —" separator inside a
  bracketed box; a single alternative renders as a bare row. The requirement emits a
  shallow-updated copy via `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  The add-affordances diverge by SHAPE — a bare row keeps ONE compact "or…" popover inline, a box
  carries four explicit dashed adders at its foot — and both append a real OR ALTERNATIVE for the
  row's own picker to fill in. Which kinds are offered, how the panel and the adders are worded
  and why, are stated in `openspec/specs/ui-integration/spec.md` → "Adding a requirement, and
  adding an alternative"; the `data-recipe-add` token family is PRESERVED on the choices.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // No essence OFFER projection here: the adder seeds nothing, so the offer lives where the
  // choice is made, in `RecipeIngredientOption`'s own field. `essenceOptions` stays UNFILTERED,
  // because `hasEssences` gates the whole essence match TYPE on it and filtering would take
  // essence requirements away from a system whose essences are all disabled.
  import RecipeIngredientOption from './RecipeIngredientOption.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  // The ONE kind table, shared with the row's plate and kind select: the `or…` menu's entries and
  // the choice group's adders read their glyph, tint class and one-word name from it.
  import { ingredientKindMarkClass, ingredientKindMeta } from './ingredientKindMeta.js';

  let {
    group = {},
    componentOptions = [],
    itemTags = [],
    currencyUnits = [],
    // Whether the system's currency feature is enabled. Preset units are seeded even for a
    // disabled system, so the add-affordances gate on this flag and not on unit presence.
    currencyEnabled = true,
    // The system's essences ({ id, name, icon }); non-empty unlocks the essence OR alternative.
    essenceOptions = [],
    // WHAT THE `Any one of` PILL'S NOTE SAYS: a Tool's REPAIR set is a different sentence about
    // the same shape, and this note is the only place the two differ. Empty falls through to the
    // recipe editor's own copy, so every other call site is byte-identical.
    anyOneOfHint = '',
    onChange = () => {},
    onRemove = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // THE CONTROL HALF of the validation row action. A duplicate-alternative, duplicate-requirement
  // or requirement-overlap issue is about THIS requirement rather than one field inside it, so the
  // card is the destination and `recipeReadiness.js` addresses it as `ingredient-group-<id>` — the
  // same literal written on both sides rather than imported, because sharing it would put the
  // producer in the closure of the four suites that mount this card. The pair is held together
  // BEHAVIOURALLY instead: `recipe-validation-tab.test.js` reads the address the producer hands
  // the row action and `recipe-edit-mounted.test.js` resolves it onto this element.
  //
  // An un-normalized group carries no id, so it gets no address and the producer emits a
  // route-only issue; `undefined` removes the attribute rather than writing a matchable empty.
  const validationTarget = $derived(group?.id ? `ingredient-group-${group.id}` : undefined);

  const options = $derived(Array.isArray(group?.options) ? group.options : []);
  const hasAlternatives = $derived(options.length >= 2);
  const hasEssences = $derived((essenceOptions || []).length > 0);
  // A currency alternative is authorable only when the feature is enabled AND units exist.
  const canAddCost = $derived(currencyEnabled && (currencyUnits || []).length > 0);

  // The accessible name for the trigger, the dialog and its search field.
  const orMenuLabel = $derived(
    text('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')
  );

  // THE FOUR CHOICES. Each entry is ONE WORD, the kind it appends, from the same table the row's
  // kind select reads; the verb lives once in the panel's `Accept instead` header. The glyph
  // carries `manager-recipe-option-mark is-<kind>`, the SAME class the row's plate and chosen chip
  // wear, so the menu's tints are the row's tints by construction — `SearchablePopover` renders an
  // option's `icon` as the whole `class` attribute of its `<i>`, which is what allows that. No
  // option groups, so `SearchablePopover` renders no lone heading.
  const orMenuChoice = (kind, addMarker) => ({
    id: kind,
    addMarker,
    icon: ingredientKindMarkClass(kind),
    label: text(ingredientKindMeta(kind).labelKey, ingredientKindMeta(kind).label),
  });
  const orMenuOptions = $derived([
    orMenuChoice('component', 'alternative-component'),
    orMenuChoice('tags', 'alternative-tag'),
    ...(hasEssences ? [orMenuChoice('essence', 'alternative-essence')] : []),
    ...(canAddCost ? [orMenuChoice('currency', 'alternative-currency')] : []),
  ]);

  function updateOption(index, nextOption) {
    onChange({
      ...group,
      options: options.map((option, i) => (i === index ? nextOption : option)),
    });
  }

  // Removing the LAST alternative drops the whole requirement.
  function removeOption(index) {
    if (options.length <= 1) {
      onRemove();
      return;
    }
    onChange({ ...group, options: options.filter((_, i) => i !== index) });
  }

  /**
   * A NEW ALTERNATIVE IS A KIND AND NOTHING ELSE. Seeding a currency alternative with the first
   * configured unit authors a choice the GM did not make, and the same one every time, which is
   * how a set ends up requiring gold pieces nobody asked for.
   *
   * @param {'component'|'tags'|'essence'|'currency'} type
   */
  function appendAlternative(type) {
    if (type === 'essence') {
      onChange({
        ...group,
        options: [
          ...options,
          { quantity: 1, match: { type: 'essence', essenceId: '', amount: 1 } },
        ],
      });
      return;
    }
    if (type === 'tags') {
      onChange({
        ...group,
        options: [...options, { quantity: 1, match: { type: 'tags', tags: [], tagMatch: 'any' } }],
      });
      return;
    }
    if (type === 'currency') {
      onChange({
        ...group,
        options: [...options, { quantity: 1, match: { type: 'currency', unit: '', amount: 1 } }],
      });
      return;
    }
    onChange({
      ...group,
      options: [...options, { quantity: 1, match: { type: 'component', componentId: null } }],
    });
  }
</script>

{#snippet orMenu()}
  <SearchablePopover
    options={orMenuOptions}
    optionGroups={[]}
    pickerClass="manager-recipe-or-picker"
    triggerClass="manager-recipe-or-trigger"
    triggerIcon="fa-solid fa-code-branch"
    triggerLabel={text('FABRICATE.Admin.Manager.Recipe.OrTrigger', 'or…')}
    triggerAriaLabel={orMenuLabel}
    triggerTitle={text(
      'FABRICATE.Admin.Manager.Recipe.OrTriggerHint',
      'Accept another kind of ingredient in place of this one.'
    )}
    dialogAriaLabel={orMenuLabel}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Recipe.OrSearchPlaceholder',
      'Search options...'
    )}
    searchAriaLabel={orMenuLabel}
    emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
    showChevron={false}
    showSearch={false}
    triggerHasPopup="listbox"
    popoverTitle={orMenuLabel}
    popoverClass="manager-recipe-or-popover"
    minWidth={150}
    maxWidth={150}
    onChoose={(type) => appendAlternative(type)}
  />
{/snippet}

<div
  class="manager-recipe-ingredient-requirement"
  class:has-alternatives={hasAlternatives}
  data-recipe-group
  data-recipe-group-id={group?.id || ''}
  data-validation-target={validationTarget}
  tabindex="-1"
  data-keyboard-focus="true"
>
  {#if hasAlternatives}
    <!-- ANY ONE OF box: an accent-bordered container with a header pill and hint. -->
    <div class="manager-recipe-any-one-of-head">
      <span class="manager-recipe-any-one-of-pill" data-recipe-any-one-of>
        <i class="fas fa-code-branch" aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AnyOneOf', 'Any one of')}</span>
      </span>
      <span class="manager-recipe-any-one-of-hint manager-muted"
        >{anyOneOfHint ||
          text(
            'FABRICATE.Admin.Manager.Recipe.AnyOneOfHint',
            'crafter picks a component or a tagged item'
          )}</span
      >
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
          {currencyEnabled}
          {essenceOptions}
          canRemove={true}
          onChange={(nextOption) => updateOption(index, nextOption)}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
    <!-- THE CHOICE GROUP'S OWN ADDERS: dashed accent chips reading `alt <kind>`, in the kind
         order the row's own select offers, because inside an `ANY ONE OF` group every one of
         them appends an ALTERNATIVE. The `data-recipe-add` marker family is preserved. -->
    <div class="manager-recipe-requirement-adds">
      <ManagerButton
        role="dashed"
        data-recipe-add="alternative-component"
        onclick={() => appendAlternative('component')}
      >
        <i class={ingredientKindMeta('component').icon} aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AltComponent', 'alt component')}</span>
      </ManagerButton>
      <ManagerButton
        role="dashed"
        data-recipe-add="alternative-tag"
        onclick={() => appendAlternative('tags')}
      >
        <i class={ingredientKindMeta('tags').icon} aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AltTag', 'alt tag')}</span>
      </ManagerButton>
      {#if hasEssences}
        <ManagerButton
          role="dashed"
          data-recipe-add="alternative-essence"
          onclick={() => appendAlternative('essence')}
        >
          <i class={ingredientKindMeta('essence').icon} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AltEssence', 'alt essence')}</span>
        </ManagerButton>
      {/if}
      {#if canAddCost}
        <ManagerButton
          role="dashed"
          data-recipe-add="alternative-cost"
          onclick={() => appendAlternative('currency')}
        >
          <i class={ingredientKindMeta('currency').icon} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AltCurrency', 'alt currency')}</span>
        </ManagerButton>
      {/if}
    </div>
  {:else}
    <!-- Bare requirement: a single row with the "or…" popover inline at its right end. -->
    <div class="manager-recipe-ingredient-requirement-options">
      {#each options as option, index (index)}
        <RecipeIngredientOption
          {option}
          {componentOptions}
          {itemTags}
          {currencyUnits}
          {currencyEnabled}
          {essenceOptions}
          canRemove={true}
          orControl={orMenu}
          onChange={(nextOption) => updateOption(index, nextOption)}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
  {/if}
</div>
