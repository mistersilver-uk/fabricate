<!-- Svelte 5 runes mode -->
<!--
  The choice group: one requirement inside a set (the data model's `ingredientGroup`), satisfied by
  ANY one of its alternatives. Two or more render linked by a "— or —" separator inside the
  `Any one of` box, whose member rows draw no convert control; a single alternative renders as a
  bare `PickerRow allowAny`. It emits a shallow-updated copy via `onChange(nextGroup)` and is
  dropped entirely via `onRemove()`.

  The bare row's `or…` menu and the box's `alt <kind>` adders both read `kindMenuItems(kinds)`,
  so they offer one subset in one order, and both append an OR alternative for the row's own field
  to name. Their wording is `openspec/specs/ui-entity-editors/spec.md` → "Adding a requirement, and
  adding an alternative"; the `data-recipe-add` token family is preserved on both.

  `side="result"` draws the result-side form (issue 1773): `group` is one result entry and `offer`
  its set's `{ kinds, readonlyKinds, catalogue }`. A flat result is a bare row, whose `or…` converts
  it on a `reward` set; a choice group is the box under `ChoiceGroupAwardHeader`, its rolled members
  carrying `PickerRowRangeCell`, and a member removed down to one unwraps it (`resultGroupEdits.js`).
-->
<script>
  // The add-new essence offer reaches a row as its catalogue's `offered` flag. `essenceOptions`
  // itself stays unfiltered, because `hasEssences` gates the whole essence match type on it.
  import { visibleEssenceOptions } from '../../../../model/essenceValidation.js';
  import { currencyUnitIcon, currencyUnitLabel } from '../../../util/recipeCurrency.js';
  import PickerRow from './PickerRow.svelte';
  import Button from '../../../components/Button.svelte';
  import { fromValue, kindMenuItems, toValue } from './pickerRowKinds.js';
  import { isChoiceGroup } from '../../../../../utils/choiceGroupShape.js';
  import { localizeOr } from '../../../util/localizeOr.js';
  import ChoiceGroupAwardHeader from './ChoiceGroupAwardHeader.svelte';
  import PickerRowRangeCell from './PickerRowRangeCell.svelte';
  import {
    chooserOf,
    convertToGroup,
    rangeProblems,
    withAlternative,
    withRange,
    withoutAlternative,
  } from './resultGroupEdits.js';
  import { resultAmountInvalid } from './resultRows.js';

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
    // The result-side form: its set's `{ kinds, readonlyKinds, catalogue }`, and whether its rows
    // are a recipe's rewards, which open their bodies and convert into a choice group.
    side = 'ingredient',
    offer = { kinds: ['component'], readonlyKinds: [], catalogue: {} },
    reward = false,
    onChange = () => {},
    onRemove = () => {},
  } = $props();

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

  // The box's adders: the kind menu's own list, worded `alt <kind>`. The currency adder's hook
  // says `cost`, as the set's own currency adder does.
  const ADDERS = {
    component: [
      'alternative-component',
      'FABRICATE.Admin.Manager.Recipe.AltComponent',
      'alt component',
    ],
    tags: ['alternative-tag', 'FABRICATE.Admin.Manager.Recipe.AltTag', 'alt tag'],
    essence: ['alternative-essence', 'FABRICATE.Admin.Manager.Recipe.AltEssence', 'alt essence'],
    currency: ['alternative-cost', 'FABRICATE.Admin.Manager.Recipe.AltCurrency', 'alt currency'],
    knowledge: [
      'alternative-knowledge',
      'FABRICATE.Admin.Manager.Recipe.AltKnowledge',
      'alt knowledge',
    ],
  };
  // A result group's adders offer its set's kinds, a reward's currency hooked by its own tone.
  const adders = $derived(
    kindMenuItems(side === 'result' ? offer.kinds : kinds).map(({ id, icon, tone }) => {
      const [marker, key, fallback] = ADDERS[id];
      const hook = side === 'result' ? `alternative-${tone}` : marker;
      return { id, icon, marker: hook, label: localizeOr(key, fallback) };
    })
  );

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

  // Choosing a kind turns the bare row into the box, unmounting the `or…` trigger focus would
  // return to, so focus moves to the new alternative's name field once the caller hands it back.
  let root = $state(null);
  let focusAlternativeAt = -1;
  const NAME_FIELD = '[data-recipe-option-search], [data-recipe-add-tag]';

  function selectKind(type) {
    focusAlternativeAt = options.length;
    appendAlternative(type);
  }

  const members = $derived(isChoiceGroup(group) ? group.alternatives : []);

  // The entry count is read first, so the effect tracks it even while no focus is pending.
  $effect(() => {
    const count = side === 'result' ? members.length : options.length;
    if (!root || focusAlternativeAt < 0 || count <= focusAlternativeAt) return;
    const row = root.querySelectorAll('[data-recipe-option]')[focusAlternativeAt];
    focusAlternativeAt = -1;
    row?.querySelector(NAME_FIELD)?.focus();
  });

  const rolled = $derived(chooserOf(group) === 'rolled');
  const problems = $derived(rolled ? rangeProblems(members) : []);
  const nameOf = (entry) =>
    offer.catalogue?.[entry?.kind ?? 'component']?.find((item) => item.id === toValue(entry).id)
      ?.label || localizeOr('FABRICATE.Admin.Manager.Recipe.UnnamedResult', 'this result');

  function problemText(problem) {
    if (problem?.code === 'inverted') {
      return localizeOr(
        'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RangeInverted',
        'Its lowest roll is above its highest.'
      );
    }
    if (problem?.code !== 'overlap') return '';
    return localizeOr(
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RangeOverlap',
      'Its range overlaps the range of {name}.',
      { name: nameOf(members[problem.with]) }
    );
  }

  // The bare row's `or…` keeps the row's id as the group's, so this instance and its pending
  // focus survive the conversion.
  function convert(kind) {
    focusAlternativeAt = 1;
    onChange(convertToGroup(group, kind));
  }

  function addMember(kind) {
    focusAlternativeAt = members.length;
    onChange(withAlternative(group, kind));
  }

  function updateMember(index, next) {
    onChange({ ...group, alternatives: members.map((m, i) => (i === index ? next : m)) });
  }

  function removeMember(index) {
    const next = withoutAlternative(group, index);
    if (next) onChange(next);
    else onRemove();
  }
</script>

<!-- One result row: the bare row its set lists, or a member of the box (`index` from 0). -->
{#snippet resultRow(entry, index)}
  {@const member = index >= 0}
  {#snippet rangeTrailing()}
    <PickerRowRangeCell
      range={entry?.selectionRange}
      name={nameOf(entry)}
      problem={problemText(problems[index])}
      onChange={(range) => updateMember(index, withRange(entry, range))}
    />
  {/snippet}
  <PickerRow
    value={toValue(entry)}
    kinds={offer.kinds}
    catalogue={offer.catalogue}
    readonlyKinds={offer.readonlyKinds}
    rollable
    {reward}
    clearable={false}
    removeHook={member ? 'result-alternative' : 'result-item'}
    invalid={resultAmountInvalid(entry, localizeOr)}
    class={reward ? 'is-result is-reward' : 'is-result'}
    {...member ? { 'data-recipe-result-member': '' } : { 'data-recipe-result-item': '' }}
    allowAny={reward && !member}
    menuHeading={localizeOr(
      'FABRICATE.Admin.Manager.Recipe.AddAnAlternative',
      'Add an alternative'
    )}
    menuHint={localizeOr(
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.ConvertHint',
      'Offer another reward in place of this one.'
    )}
    trailing={member && rolled ? rangeTrailing : null}
    onSelect={convert}
    onChange={(value) =>
      member ? updateMember(index, fromValue(entry, value)) : onChange(fromValue(entry, value))}
    onRemove={() => (member ? removeMember(index) : onRemove())}
  />
{/snippet}

{#snippet alternativeAdders(onAdd)}
  <div class="manager-recipe-requirement-adds">
    {#each adders as adder (adder.id)}
      <Button role="dashed" data-recipe-add={adder.marker} onclick={() => onAdd(adder.id)}>
        <i class={adder.icon} aria-hidden="true"></i>
        <span>{adder.label}</span>
      </Button>
    {/each}
  </div>
{/snippet}

{#if side === 'result' && !isChoiceGroup(group)}
  {@render resultRow(group, -1)}
{:else if side === 'result'}
  <div
    bind:this={root}
    class="manager-recipe-ingredient-requirement has-alternatives is-result-group"
    data-recipe-result-group={group.id || ''}
  >
    <ChoiceGroupAwardHeader {group} {onChange} />
    <div class="manager-recipe-ingredient-requirement-options manager-recipe-result-group-members">
      {#each members as entry, index (entry?.id || index)}
        {#if index > 0}
          <div class="manager-recipe-ingredient-or-separator" aria-hidden="true">
            <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>
          </div>
        {/if}
        {@render resultRow(entry, index)}
      {/each}
    </div>
    {@render alternativeAdders(addMember)}
  </div>
{:else}
  <div
    bind:this={root}
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
          <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.AnyOneOf', 'Any one of')}</span>
        </span>
        <span class="manager-recipe-any-one-of-hint manager-muted"
          >{anyOneOfHint ||
            localizeOr(
              'FABRICATE.Admin.Manager.Recipe.AnyOneOfHint',
              'crafter picks a component or a tagged item'
            )}</span
        >
      </div>
      <div class="manager-recipe-ingredient-requirement-options">
        {#each options as option, index (index)}
          {#if index > 0}
            <div class="manager-recipe-ingredient-or-separator" aria-hidden="true">
              <span>{localizeOr('FABRICATE.Admin.Manager.Recipe.Or', 'OR')}</span>
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
      <!-- Inside an `Any one of` box every adder appends an alternative, hence `alt <kind>`. -->
      {@render alternativeAdders(appendAlternative)}
    {:else}
      <!-- Bare requirement: a single row with the "or…" menu inline at its right end. -->
      <div class="manager-recipe-ingredient-requirement-options">
        {#each options as option, index (index)}
          <PickerRow
            value={toValue(option)}
            {kinds}
            {catalogue}
            {readonlyKinds}
            allowAny
            onSelect={selectKind}
            onChange={(value) => updateOption(index, fromValue(option, value))}
            onRemove={() => removeOption(index)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}
