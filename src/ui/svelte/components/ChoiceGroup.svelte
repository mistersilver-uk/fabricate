<!-- Svelte 5 runes mode -->
<!--
  The choice group: one requirement inside a set (the data model's `ingredientGroup`), satisfied by
  ANY one of its alternatives. Two or more render linked by a "— or —" separator inside the
  `Any one of` box, whose member rows draw no convert control; a single alternative renders as a
  bare `PickerRow allowAny`. It emits a shallow-updated copy via `onChange(nextGroup)` and is
  dropped entirely via `onRemove()`.

  The bare row's `or…` and the box's one `Alternative` adder open the same kind menu, one heading
  per side over one subset in one order, and both append an OR alternative for the row's own field
  to name. Their wording is `openspec/specs/ui-entity-editors/spec.md` → "Adding a requirement, and
  adding an alternative".

  `side="result"` draws the result-side form (issue 1773): `group` is one result entry and `offer`
  its set's `{ kinds, readonlyKinds, catalogue }`. A flat result is a bare row, whose `or…` converts
  it on a `reward` set; a choice group is the box under `ChoiceGroupAwardHeader`, its rolled members
  carrying `PickerRowRangeCell`, and a member removed down to one unwraps it (`resultGroupEdits.js`).
-->
<script>
  // The add-new essence offer reaches a row as its catalogue's `offered` flag. `essenceOptions`
  // itself stays unfiltered, because `hasEssences` gates the whole essence match type on it.
  import { visibleEssenceOptions } from '../../model/essenceValidation.js';
  import { currencyUnitIcon, currencyUnitLabel } from '../util/recipeCurrency.js';
  import PickerRow from './PickerRow.svelte';
  import KindAdder from './KindAdder.svelte';
  import {
    emptyIngredientOption,
    fromValue,
    offeredIngredientKinds,
    subjectName,
    toValue,
  } from './pickerRowKinds.js';
  import { isChoiceGroup, rangeProblems } from '../../../utils/choiceGroupShape.js';
  import { localizeOr } from '../util/localizeOr.js';
  import { createPendingFocus } from '../util/pendingFocus.js';
  import ChoiceGroupAwardHeader from './ChoiceGroupAwardHeader.svelte';
  import PickerRowRangeCell from './PickerRowRangeCell.svelte';
  import {
    chooserOf,
    convertToGroup,
    keepingRange,
    withAlternative,
    withRange,
    withoutAlternative,
  } from './resultGroupEdits.js';
  import { resultAmountInvalid } from './resultRows.js';

  let {
    group = {},
    componentOptions = [],
    itemTags = [],
    // `{ [tag]: number }` of components carrying each tag exactly; `null` draws no counts.
    tagComponentCounts = null,
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

  // What every row of this requirement may offer and name: the kinds the kind menu offers, the
  // currency read-only face once its feature is off, and one catalogue per kind.
  const kinds = $derived(
    offeredIngredientKinds({ essenceOptions, currencyUnits, currencyEnabled })
  );
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
      tags: (itemTags || []).map((tag) => ({
        id: tag,
        label: tag,
        icon: 'fas fa-tag',
        ...(tagComponentCounts && {
          count: Object.hasOwn(tagComponentCounts, tag) ? tagComponentCounts[tag] : 0,
        }),
      })),
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

  // The kind menu's one heading per side, shared by the bare row's `or…` and the box's adder.
  const menuHeading = $derived(
    side === 'result'
      ? localizeOr('FABRICATE.Admin.Manager.Recipe.AddAnAlternative', 'Add an alternative')
      : localizeOr('FABRICATE.Admin.Manager.Recipe.AcceptInstead', 'Accept instead')
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

  // Choosing a kind appends an alternative carrying its kind and no value, and focus moves to its
  // name field once the caller hands that entry back; a removed member's moves to the member taking
  // its place, else the one before. The next group that does not hold the entry disarms the focus,
  // so a refused write never moves it.
  let root = $state(null);
  const pendingFocus = createPendingFocus();
  const NAME_FIELD = '[data-recipe-option-search], [data-recipe-add-tag]';
  const FIRST_CONTROL = 'button:not([disabled]), input:not([disabled])';
  const focusOn = (at, entry, selector = NAME_FIELD) => pendingFocus.arm({ at, entry, selector });

  // Whether `entries[at]` is `entry`: the same id where it carries one (a result member), else the
  // same unnamed subject (an id-less ingredient option).
  function holds(entries, at, entry) {
    const arrived = entries[at];
    if (!arrived) return false;
    if (entry.id) return arrived.id === entry.id;
    const [now, then] = [toValue(arrived), toValue(entry)];
    return now.kind === then.kind && now.id === then.id && String(now.tags) === String(then.tags);
  }

  function selectKind(type) {
    const option = emptyIngredientOption(type);
    focusOn(options.length, option);
    onChange({ ...group, options: [...options, option] });
  }

  const members = $derived(isChoiceGroup(group) ? group.alternatives : []);

  // Runs once per group the caller hands back.
  $effect(() => {
    const entries = side === 'result' ? members : options;
    pendingFocus.settle(
      ({ at, entry }) => holds(entries, at, entry),
      ({ at, selector }) => {
        const row = root?.querySelectorAll('[data-recipe-option]')[at];
        row?.querySelector(selector)?.focus();
      }
    );
  });

  const rolled = $derived(chooserOf(group) === 'rolled');
  // The ladder's problems as of the last committed bound: a bound being typed keeps the ones
  // stated before it, so a half-typed number does not flash an overlap.
  let held = $state(null);
  const problems = $derived(held ?? (rolled ? rangeProblems(members) : []));
  // An alternative is named as its row names itself: its subject, else its kind's word.
  const nameOf = (entry) => subjectName(toValue(entry), offer.catalogue, localizeOr);

  const RANGE_PROBLEMS = {
    fraction: [
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RangeFraction',
      'Its range must run between whole numbers.',
    ],
    inverted: [
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.RangeInverted',
      'Its lowest roll is above its highest.',
    ],
  };

  function problemText(problem) {
    const [key, fallback] = RANGE_PROBLEMS[problem?.code] ?? [];
    if (key) return localizeOr(key, fallback);
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
    const next = convertToGroup(group, kind);
    focusOn(1, next.alternatives[1]);
    onChange(next);
  }

  function addMember(kind) {
    const next = withAlternative(group, kind);
    focusOn(members.length, next.alternatives[members.length]);
    onChange(next);
  }

  function updateMember(index, next) {
    onChange({ ...group, alternatives: members.map((m, i) => (i === index ? next : m)) });
  }

  // One left unwraps, and the card moves focus to the survivor; none left drops the group.
  function removeMember(index) {
    const next = withoutAlternative(group, index);
    if (isChoiceGroup(next)) {
      const at = Math.min(index, next.alternatives.length - 1);
      focusOn(at, next.alternatives[at], FIRST_CONTROL);
    }
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
      onChange={(range) => {
        held ??= problems;
        updateMember(index, withRange(entry, range));
      }}
      onCommit={() => (held = null)}
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
    data-recipe-result-member={member ? '' : undefined}
    data-recipe-result-item={member ? undefined : ''}
    allowAny={reward && !member}
    {menuHeading}
    menuHint={localizeOr(
      'FABRICATE.Admin.Manager.Recipe.ChoiceGroup.ConvertHint',
      'Offer another reward in place of this one.'
    )}
    trailing={member && rolled ? rangeTrailing : null}
    onSelect={convert}
    onChange={(value) =>
      member
        ? updateMember(index, keepingRange(entry, fromValue(entry, value)))
        : onChange(fromValue(entry, value))}
    onRemove={() => (member ? removeMember(index) : onRemove())}
  />
{/snippet}

<!-- The box's one adder, over the kind menu the bare row's `or…` opens. -->
{#snippet alternativeAdder(adderKinds, onAdd)}
  <div class="manager-recipe-requirement-adds">
    <KindAdder
      kinds={adderKinds}
      word={localizeOr('FABRICATE.Admin.Manager.Recipe.AlternativeAdder', 'Alternative')}
      name={localizeOr('FABRICATE.Admin.Manager.Recipe.AddAnAlternative', 'Add an alternative')}
      heading={menuHeading}
      hook="alternative"
      triggerHook="alternative"
      menuClass="manager-recipe-or-menu"
      {onAdd}
    />
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
    {@render alternativeAdder(offer.kinds, addMember)}
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
      {@render alternativeAdder(kinds, selectKind)}
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
            {menuHeading}
            onSelect={selectKind}
            onChange={(value) => updateOption(index, fromValue(option, value))}
            onRemove={() => removeOption(index)}
          />
        {/each}
      </div>
    {/if}
  </div>
{/if}
