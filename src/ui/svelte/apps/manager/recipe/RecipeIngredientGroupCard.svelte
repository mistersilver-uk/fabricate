<!-- Svelte 5 runes mode -->
<!--
  One requirement inside a set (the data model still calls it an `ingredientGroup`), satisfied by
  ANY one of its alternatives. Two or more render linked by a "— or —" separator inside a
  bracketed box; a single alternative renders as a bare row. The requirement emits a
  shallow-updated copy via `onChange(nextGroup)` and is dropped entirely via `onRemove()`.

  The add-affordances diverge by SHAPE — a bare row keeps ONE compact "or…" popover inline, a box
  carries four explicit dashed adders at its foot — and both append a real OR ALTERNATIVE for the
  row's own picker to fill in. Which kinds are offered, how the panel and the adders are worded
  and why, are stated in `openspec/specs/ui-entity-editors/spec.md` → "Adding a requirement, and
  adding an alternative"; the `data-recipe-add` token family is PRESERVED on the choices.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  // The add-new essence offer reaches a row as its catalogue's `offered` flag. `essenceOptions`
  // itself stays unfiltered, because `hasEssences` gates the whole essence match type on it.
  import { visibleEssenceOptions } from '../../../../model/essenceValidation.js';
  import { currencyUnitIcon, currencyUnitLabel } from '../../../util/recipeCurrency.js';
  import PickerRow from './PickerRow.svelte';
  import SearchablePopover from '../../../components/SearchablePopover.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  // The ONE kind table, shared with the row's plate and kind select: the `or…` menu's entries and
  // the choice group's adders read their glyph, tint class and one-word name from it.
  import { fromValue, kindMarkClass, kindMeta, toValue } from './pickerRowKinds.js';

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

  // What every row of this requirement may offer and name: the kinds the adders offer, the
  // currency read-only face once its feature is off, and one catalogue per kind.
  const kinds = $derived([
    'component',
    'tags',
    ...(hasEssences ? ['essence'] : []),
    ...(canAddCost ? ['currency'] : []),
  ]);
  const readonlyKinds = $derived(currencyEnabled ? [] : ['currency']);
  const catalogue = $derived.by(() => {
    const offered = new Set(visibleEssenceOptions(essenceOptions).map((essence) => essence.id));
    return {
      component: (componentOptions || []).map((item) => ({
        id: item.id,
        label: item.name,
        img: item.img,
        icon: 'fas fa-cube',
      })),
      tags: (itemTags || []).map((tag) => ({ id: tag, label: tag, icon: 'fas fa-tag' })),
      essence: (essenceOptions || []).map((essence) => ({
        id: essence.id,
        label: essence.name,
        icon: essence.icon || 'fas fa-flask-vial',
        offered: offered.has(essence.id),
      })),
      currency: (currencyUnits || []).map((unit) => ({
        id: unit.id,
        label: currencyUnitLabel(currencyUnits, unit.id),
        icon: currencyUnitIcon(currencyUnits, unit.id),
      })),
    };
  });

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
    icon: kindMarkClass(kind),
    label: text(kindMeta(kind).labelKey, kindMeta(kind).label),
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
    ariaLabel={orMenuLabel}
    triggerTitle={text(
      'FABRICATE.Admin.Manager.Recipe.OrTriggerHint',
      'Accept another kind of ingredient in place of this one.'
    )}
    panelLabel={orMenuLabel}
    searchPlaceholder={text(
      'FABRICATE.Admin.Manager.Recipe.OrSearchPlaceholder',
      'Search options...'
    )}
    searchLabel={orMenuLabel}
    emptyHint={text('FABRICATE.Admin.Manager.Recipe.NoComponentsDefined', 'No components defined')}
    showChevron={false}
    showSearch={false}
    triggerHasPopup="listbox"
    popoverTitle={orMenuLabel}
    popoverClass="manager-recipe-or-popover"
    minWidth={150}
    maxWidth={150}
    onSelect={(type) => appendAlternative(type)}
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
        <PickerRow
          value={toValue(option)}
          {kinds}
          {catalogue}
          {readonlyKinds}
          onChange={(value) => updateOption(index, fromValue(option, value))}
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
        <i class={kindMeta('component').icon} aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AltComponent', 'alt component')}</span>
      </ManagerButton>
      <ManagerButton
        role="dashed"
        data-recipe-add="alternative-tag"
        onclick={() => appendAlternative('tags')}
      >
        <i class={kindMeta('tags').icon} aria-hidden="true"></i>
        <span>{text('FABRICATE.Admin.Manager.Recipe.AltTag', 'alt tag')}</span>
      </ManagerButton>
      {#if hasEssences}
        <ManagerButton
          role="dashed"
          data-recipe-add="alternative-essence"
          onclick={() => appendAlternative('essence')}
        >
          <i class={kindMeta('essence').icon} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AltEssence', 'alt essence')}</span>
        </ManagerButton>
      {/if}
      {#if canAddCost}
        <ManagerButton
          role="dashed"
          data-recipe-add="alternative-cost"
          onclick={() => appendAlternative('currency')}
        >
          <i class={kindMeta('currency').icon} aria-hidden="true"></i>
          <span>{text('FABRICATE.Admin.Manager.Recipe.AltCurrency', 'alt currency')}</span>
        </ManagerButton>
      {/if}
    </div>
  {:else}
    <!-- Bare requirement: a single row with the "or…" popover inline at its right end. -->
    <div class="manager-recipe-ingredient-requirement-options">
      {#each options as option, index (index)}
        <PickerRow
          value={toValue(option)}
          {kinds}
          {catalogue}
          {readonlyKinds}
          convert={orMenu}
          onChange={(value) => updateOption(index, fromValue(option, value))}
          onRemove={() => removeOption(index)}
        />
      {/each}
    </div>
  {/if}
</div>
