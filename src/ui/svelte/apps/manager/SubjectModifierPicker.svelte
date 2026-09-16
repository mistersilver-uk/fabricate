<!--
  The SUBJECT's own check-modifier pick, for salvage and gathering (issue 1095). Under the
  `bySubject` combination rule the pick lives on the record being resolved, and this is the shared
  surface for the two new ones — `Component.salvage` and `GatheringTask`.

  Props:
  | prop | values | default | contract |
  | --- | --- | --- | --- |
  | `options` / `selectedIds` / `inheritedIds` | `{id,label,icon?}[]`, `string[]`\|`null`, `string[]` | `[]`, `null`, `[]` | the world catalogue (an empty one hides everything), the AUTHORED pick (`null` inherits), and the ACTIVITY's MARK over that catalogue. A non-array `inheritedIds` is the unknown-basis sentinel: nothing is filtered and the whole catalogue is offered. |
  | `maxPicks` / `disabled` / `subject` / `testId` | | `null`, `false`, `'component'` | the activity's `maxModifierPicks`, NEVER coerced, since `resolveMaxModifierPicks` owns what absence means; whether the editor is saving; which record is picking, because every sentence names it; and the `data-subject-modifier-*` hook prefix |
  | `onChange(nextIdsOrNull)` | | | `null` restores inheritance; an array, empty included, authors a pick |

  Invariants:
  - An ABSENT array inherits the activity's default set; an AUTHORED EMPTY array is a real pick of
    zero. The two are different rolls, not a presence check, and the toggle IS that distinction.
  - THE ACTIVITY'S MARK BOUNDS THE PICK, the rule all three `bySubject` hosts share: the offer is
    `options ∩ inheritedIds`. It BOUNDS, it does not PRUNE — an id authored while marked and since
    un-marked stays on the record, draws no chip, does not consume the cap, and returns when the
    activity marks it again — and `resolveEligibleModifierIds` applies the same intersection at roll
    time. THE INHERITED SET IS NAMED through `foundryBridge.formatList` into a `{list}` PLACEHOLDER,
    never concatenated, because separator, conjunction and Oxford comma vary by locale.
  - The recipe site is NOT converted: `changeModifierSetMode` in `RecipeOverviewTab` SEEDS the pick
    from the system default set where this toggle authors `[]`, which is a behaviour decision.
-->
<script>
  import Field from '../../components/Field.svelte';
  import { formatList, localize } from '../../util/foundryBridge.js';
  import ModifierPillSelect from '../../components/ModifierPillSelect.svelte';
  import SelectionCheckbox from '../../components/SelectionCheckbox.svelte';
  import { resolveMaxModifierPicks } from '../../../../systems/checkModifierResolver.js';

  let {
    options = [],
    selectedIds = null,
    inheritedIds = [],
    maxPicks = null,
    disabled = false,
    subject = 'component',
    testId = 'subject-modifier',
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The inherit sentences name the ACTIVITY's check, since the default set is per-activity.
  const SUBJECT_COPY = {
    component: {
      headingKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierHeadingComponent',
      heading: 'Check modifiers for this component',
      authorKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierAuthorComponent',
      author: 'Pick check modifiers for this component',
      inheritKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierInheritComponent',
      inherit: 'Inheriting the salvage check’s default set: {list}',
      inheritEmptyKey:
        'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierInheritEmptyComponent',
      inheritEmpty:
        'The salvage check’s default set is empty, so no check modifier applies to this component.',
      emptySetKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierEmptySetComponent',
      emptySet: 'No modifiers — nothing is added to this component’s salvage check roll.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierCapComponent',
      cap: 'This system lets a component pick up to {count} check modifiers.',
      capOneKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierCapOneComponent',
      capOne: 'This system lets a component pick one check modifier.',
    },
    task: {
      headingKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierHeadingTask',
      heading: 'Check modifiers for this task',
      authorKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierAuthorTask',
      author: 'Pick check modifiers for this task',
      inheritKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierInheritTask',
      inherit: 'Inheriting the gathering check’s default set: {list}',
      inheritEmptyKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierInheritEmptyTask',
      inheritEmpty:
        'The gathering check’s default set is empty, so no check modifier applies to this task.',
      emptySetKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierEmptySetTask',
      emptySet: 'No modifiers — nothing is added to this task’s gathering check roll.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierCapTask',
      cap: 'This system lets a task pick up to {count} check modifiers.',
      capOneKey: 'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierCapOneTask',
      capOne: 'This system lets a task pick one check modifier.',
    },
  };

  const copy = $derived(SUBJECT_COPY[subject] || SUBJECT_COPY.component);
  const LABEL_ID = $derived(`${testId}-label`);
  const CAP_HINT_ID = $derived(`${testId}-cap-hint`);
  const SUPPRESSED_ID = $derived(`${testId}-suppressed`);

  const authored = $derived(Array.isArray(selectedIds));
  const picked = $derived(authored ? selectedIds : []);

  // The OFFER is the activity's mark, per the header; an unknown basis filters nothing rather than
  // silently emptying the menu.
  const eligibleOptions = $derived(
    Array.isArray(inheritedIds)
      ? options.filter((option) => inheritedIds.includes(option?.id))
      : options
  );
  const eligibleIds = $derived(new Set(eligibleOptions.map((option) => option?.id)));
  const pickedEligible = $derived(picked.filter((id) => eligibleIds.has(id)));
  // The cap counts what the GM can SEE, or the add button deadens against invisible chips.
  const suppressedCount = $derived(picked.length - pickedEligible.length);

  // Routed through the resolver so this surface bounds what the ENGINE bounds.
  const capLimit = $derived(resolveMaxModifierPicks({ maxModifierPicks: maxPicks }));
  const capBounded = $derived(Number.isFinite(capLimit));
  const atCap = $derived(capBounded && pickedEligible.length >= capLimit);

  // A cap of exactly 1 gets its own sentence, following `RecipeOverviewTab`'s pair.
  const capText = $derived.by(() => {
    if (capLimit === 1) return text(copy.capOneKey, copy.capOne);
    const translated = localize(copy.capKey, { count: capLimit });
    if (translated && translated !== copy.capKey) return translated;
    return copy.cap.replace('{count}', String(capLimit));
  });
  const capReachedText = $derived(
    text(
      'FABRICATE.Admin.Manager.Checks.Crafting.SubjectModifierCapReached',
      'Remove one to pick another.'
    )
  );

  // A vanished chip is ACCOUNTED FOR: the note states how many and that they return. It reuses the
  // RECIPE's key pair, because the sentence names no subject.
  const SUPPRESSED_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierSuppressed';
  const suppressedText = $derived.by(() => {
    if (suppressedCount === 1) {
      return text(
        'FABRICATE.Admin.Manager.Recipe.CraftingModifierSuppressedOne',
        'One chosen modifier is hidden because the check no longer marks it selectable. It is kept and returns if the check marks it again.'
      );
    }
    const translated = localize(SUPPRESSED_KEY, { count: suppressedCount });
    if (translated && translated !== SUPPRESSED_KEY) return translated;
    return `${suppressedCount} chosen modifiers are hidden because the check no longer marks them selectable. They are kept and return if the check marks them again.`;
  });
  // WHICH ZERO THE PILL ROW IS SHOWING: two states draw no chip, and the placeholder is also the
  // `aria-live` summary.
  const allPicksSuppressed = $derived(pickedEligible.length === 0 && suppressedCount > 0);
  const ALL_SUPPRESSED_KEY = 'FABRICATE.Admin.Manager.Recipe.CraftingModifierAllSuppressed';
  const emptyRowText = $derived(
    allPicksSuppressed
      ? text(
          ALL_SUPPRESSED_KEY,
          'All chosen modifiers are currently hidden — the check no longer marks them selectable. They are kept and return if the check marks them again.'
        )
      : text(copy.emptySetKey, copy.emptySet)
  );

  // WHEN THE NOTE IS WORTH SAYING SEPARATELY: it explains a suppression a GM can see PART of; once
  // every pick is suppressed the placeholder above IS that explanation.
  const showSuppressedNote = $derived(suppressedCount > 0 && !allPicksSuppressed);

  // `aria-describedby` takes a LIST, and tracks the note's own condition, so the group is never
  // described by an element that is not rendered.
  const describedBy = $derived(
    [capBounded ? CAP_HINT_ID : '', showSuppressedNote ? SUPPRESSED_ID : '']
      .filter(Boolean)
      .join(' ')
  );

  // The inherited entries BY NAME, resolved against `options` and dropped when unknown, exactly as
  // the resolver treats the same ids, so this line cannot promise a modifier the roll would skip.
  const inheritedNames = $derived(
    formatList(
      (Array.isArray(inheritedIds) ? inheritedIds : [])
        .map((id) => options.find((option) => option?.id === id))
        .filter(Boolean)
        .map(
          (option) =>
            option.label ||
            text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierUnnamed', 'Unnamed modifier')
        )
    )
  );

  // A `{list}` PLACEHOLDER, never concatenated: a list's position in its sentence is a
  // translator's decision.
  const inheritText = $derived.by(() => {
    if (!inheritedNames) return text(copy.inheritEmptyKey, copy.inheritEmpty);
    const translated = localize(copy.inheritKey, { list: inheritedNames });
    if (translated && translated !== copy.inheritKey) return translated;
    return copy.inherit.replace('{list}', inheritedNames);
  });

  function toggleAuthored(checked) {
    // ON authors an EMPTY array, a real pick of zero; OFF clears the key and restores inheritance.
    onChange(checked ? [] : null);
  }

  function togglePick(id, checked) {
    const next = checked ? [...new Set([...picked, id])] : picked.filter((entry) => entry !== id);
    onChange(next);
  }
</script>

{#if options.length > 0}
  <Field as="div" class="is-wide" data-subject-modifier-picker={testId}>
    <span class="manager-recipe-micro-label" id={LABEL_ID}>
      {text(copy.headingKey, copy.heading)}
    </span>
    <div class="manager-subject-modifier-mode">
      <SelectionCheckbox
        size="sm"
        checked={authored}
        {disabled}
        ariaLabel={text(copy.authorKey, copy.author)}
        data-subject-modifier-authored={authored ? 'custom' : 'inherit'}
        onChange={toggleAuthored}
      />
      <!-- PRESENTATIONAL: `SelectionCheckbox` carries the whole accessible name, so this copy is
           `aria-hidden` — `ui-integration/spec.md`'s "one of the two, never both". Not a
           `<label for>` either, since the primitive renders its own. -->
      <span class="manager-muted" aria-hidden="true">
        {text(copy.authorKey, copy.author)}
      </span>
    </div>

    {#if authored}
      <!-- The OFFER is the activity's mark; `selectedIds` stays the WHOLE authored pick, so
           an un-marked id finds no option to draw a chip from and survives every edit. -->
      <ModifierPillSelect
        options={eligibleOptions}
        selectedIds={picked}
        {disabled}
        addDisabled={atCap}
        {testId}
        {describedBy}
        labelledBy={LABEL_ID}
        menuLabel={text('FABRICATE.Admin.Manager.Recipe.CraftingModifierAdd', 'Add modifier')}
        allSelectedLabel={text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPillAllSelected',
          'All modifiers selected.'
        )}
        noneSelectedLabel={emptyRowText}
        onToggle={togglePick}
      />
      {#if capBounded}
        <!-- Stated STANDING, not only once the menu button has already gone dead. -->
        <p
          class="manager-muted"
          id={CAP_HINT_ID}
          data-subject-modifier-cap={atCap ? 'reached' : 'available'}
        >
          {capText}{atCap ? ` ${capReachedText}` : ''}
        </p>
      {/if}
      {#if showSuppressedNote}
        <!-- Only when a stored pick is un-marked AND at least one survives, so an ordinary record
             carries no standing warning. The count rides the attribute too, because a test reading
             the sentence would assert a translation. -->
        <p
          class="manager-muted"
          id={SUPPRESSED_ID}
          data-subject-modifier-suppressed={suppressedCount}
        >
          {suppressedText}
        </p>
      {/if}
    {:else}
      <p class="manager-muted" data-subject-modifier-inherited>
        {inheritText}
      </p>
    {/if}
  </Field>
{/if}

<style>
  .manager-subject-modifier-mode {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    margin-block: 0.25rem;
  }
</style>
