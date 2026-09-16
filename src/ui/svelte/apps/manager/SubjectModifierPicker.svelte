<!-- Svelte 5 runes mode -->
<!--
  The SUBJECT's own check-modifier pick, for salvage and gathering (issue 1095).

  Under the `bySubject` combination rule the pick lives on the record being resolved, and
  there are three such records. This component is the shared surface for the two NEW ones —
  `Component.salvage` and `GatheringTask` — rather than a second and third copy of the same
  markup.

  THE RECIPE SITE IS NOT CONVERTED, AND THE MISMATCH IS NAMED RATHER THAN ASSERTED. The
  semantics are isomorphic — three states, one pick list, one cap — so "it has a tri-state
  the others do not need" is not on its own a reason: a tri-state SELECT and a two-state
  CHECKBOX are two presentations of one contract, and this component could take the
  presentation as a prop. The concrete mismatch is `changeModifierSetMode`
  (`RecipeOverviewTab`): moving Inherit → Custom SEEDS the recipe's pick from the system
  default set, truncated to the cap, so "customize" starts from what the recipe was already
  rolling rather than from nothing. This component's toggle deliberately does the OPPOSITE
  and authors `[]`, because a component or a task turning the switch on has stated that it
  picks its own and seeding it would author picks the GM never made. Reconciling those two
  is a behaviour decision about the recipe surface, not a refactor, and it is DEFERRED —
  three surfaces, one contract, two authored starting states, and the third
  (`RecipeOverviewTab`'s) is the one with shipped frames and shipped tests.

  ONE COMPONENT RATHER THAN TWO COPIES, deliberately: the pick's semantics are subtle in
  exactly the way a copy gets wrong. An ABSENT array inherits the activity's default set; an
  AUTHORED EMPTY array is a real pick of zero and adds nothing to the roll. The two are
  different rolls, not a presence check, and a second implementation that collapsed them
  would fail silently. The toggle below IS that distinction, made visible.

  IT NAMES THE SUBJECT, and the noun is a prop rather than the word "record". "Check
  modifiers for this record" leaks the internal name for the abstraction these two share
  onto a screen where the GM is editing a component or a gathering task and no such
  abstraction is visible. The copy map below is the same shape
  `CraftingModifierCatalogueCard`'s `SUBJECT_COPY` uses, so the two surfaces name the same
  subject the same way.

  THE ACTIVITY'S MARK BOUNDS THE PICK, and this is the ONE rule all three `bySubject` hosts
  now share — `RecipeOverviewTab` applies the identical intersection to its own picker. Under
  `bySubject` the check's `defaultModifierIds` is not merely a default to inherit: it is the
  set the Checks studio marks "Selectable", so `options ∩ inheritedIds` is what this picker
  offers. It BOUNDS, it does not PRUNE — an id authored while it was marked and since
  un-marked stays on the record untouched, draws no chip, does not consume the cap, and
  returns the moment the activity marks it again — and `resolveEligibleModifierIds` applies
  the same intersection at roll time, so the offer and the roll agree. A note states the
  suppressed count so a vanished chip is never silently swallowed.

  THE INHERITED SET IS NAMED. Under inheritance the pill row has nothing to author, so it is
  hidden and the inherited entries are listed instead — the recipe picker's own rule, and its
  note says why: "inheriting" with no names told the GM nothing about what this record
  actually rolls. The names are joined by `foundryBridge.formatList` and interpolated into a
  `{list}` PLACEHOLDER on the sentence, never concatenated onto the end of a localized
  string: "x, y and z" is a language rule (separator, conjunction and Oxford comma all vary
  by locale, which is why `items.join(', ')` is wrong even in English), and a sentence whose
  tail is glued on at render time cannot be reordered by a translator.

  The cap is a SYSTEM fact this record cannot change, so it is stated STANDING rather than
  only once the GM hits it and the add button has already gone dead, with the at-cap clause
  appended when it is reached — the same treatment the recipe picker gives it.

  Props:
   - options: the world catalogue (`{id,label,icon?}[]`). An empty one hides everything.
   - selectedIds: the AUTHORED pick, or `null` when the record inherits.
   - inheritedIds: the ACTIVITY's MARK over that catalogue. Named under inheritance (ids
     naming nothing in `options` are dropped, exactly as the resolver drops them) AND the
     bound on what may be picked under authorship. A non-array is the unknown-basis
     sentinel: nothing is filtered and the whole catalogue is offered.
   - maxPicks: the activity's `maxModifierPicks`, or `null` for unlimited. Never coerced —
     `resolveMaxModifierPicks` owns what absence means.
   - disabled: while the editor is saving.
   - subject: which record is picking — `component` (salvage) or `task` (gathering).
   - testId: the `data-subject-modifier-*` hook prefix, so a test can tell salvage's picker
     from gathering's.
   - onChange(nextIdsOrNull): `null` restores inheritance; an array (including an empty one)
     authors a pick.
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

  // One vocabulary map, two subjects. Every sentence on this surface names the record being
  // edited, and the two records are a COMPONENT (its salvage check) and a gathering TASK
  // (the gathering check) — which is also why the inherit sentences name the activity's
  // check rather than "the system": the default set is per-activity, and a GM reading
  // "the system default set" on the salvage tab would look for it on the wrong screen.
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

  // The OFFER is the activity's mark, per the header. A non-array `inheritedIds` is the
  // unknown-basis sentinel `_normalizeCheckModifierSelection` uses for `validIds`: filter
  // nothing rather than let an unknown basis silently empty the menu.
  const eligibleOptions = $derived(
    Array.isArray(inheritedIds)
      ? options.filter((option) => inheritedIds.includes(option?.id))
      : options
  );
  const eligibleIds = $derived(new Set(eligibleOptions.map((option) => option?.id)));
  const pickedEligible = $derived(picked.filter((id) => eligibleIds.has(id)));
  // The cap counts what the GM can SEE: a suppressed pick that consumed a slot would
  // deaden the add button against chips that are not on screen to remove.
  const suppressedCount = $derived(picked.length - pickedEligible.length);

  // Routed through the resolver so this surface bounds what the ENGINE bounds: a stored
  // `0`, `-2` or `"three"` all read as unlimited there, and a picker that trusted them
  // verbatim would refuse picks the roll would have honoured.
  const capLimit = $derived(resolveMaxModifierPicks({ maxModifierPicks: maxPicks }));
  const capBounded = $derived(Number.isFinite(capLimit));
  const atCap = $derived(capBounded && pickedEligible.length >= capLimit);

  // A cap of exactly 1 gets its own sentence rather than "up to 1 check modifiers",
  // following the pair `RecipeOverviewTab` already uses. `localize`'s interpolating form
  // carries the same fallback contract as `text`: the fallback substitutes the count itself
  // so an unlocalized build reads identically rather than printing a raw brace.
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

  // A vanished chip is ACCOUNTED FOR, never silently swallowed: the note states how many
  // and that they return. It reuses the RECIPE's key pair rather than minting a fourth and
  // fifth subject-named string, the same reuse the menu label two blocks below already
  // makes of `Recipe.CraftingModifierAdd` — the sentence names no subject, and the field
  // heading directly above it has already named which check is meant.
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
  // WHICH ZERO THE PILL ROW IS SHOWING, the recipe picker's rule applied to the surface it
  // shares. The row draws no chip both when the record authored a pick of nothing and when
  // every pick it authored is currently suppressed, and its placeholder is also its
  // `aria-live` summary — one sentence for two states. "Nothing is added" is true of the
  // first and flatly contradicts the note beneath it in the second, which says those same
  // picks are kept. The ALL-suppressed sentence reuses the RECIPE key for the reason the
  // note above already reuses its pair: it names no subject.
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

  // WHEN THE NOTE IS WORTH SAYING SEPARATELY. It explains the suppression a GM can see
  // PART of — some chips drawn, some missing. Once every pick is suppressed the placeholder
  // above IS that explanation, word for word from "the check no longer marks them
  // selectable" on, so rendering both reads the same sentence to a GM twice in the one
  // state where both are guaranteed to co-occur.
  const showSuppressedNote = $derived(suppressedCount > 0 && !allPicksSuppressed);

  // `aria-describedby` takes a LIST: a reader told only the cap would never hear that some
  // of this record's own picks are missing from the row it is reading. It tracks the note's
  // own condition, so the group is never described by an element that is not rendered.
  const describedBy = $derived(
    [capBounded ? CAP_HINT_ID : '', showSuppressedNote ? SUPPRESSED_ID : '']
      .filter(Boolean)
      .join(' ')
  );

  // The inherited entries, BY NAME. Resolved against `options` and dropped when unknown,
  // which is what the resolver does with the same ids — so this line cannot promise a
  // modifier the roll would not apply.
  //
  // Joined by `formatList`, the ACTIVE language's list conventions, exactly as
  // `RecipeOverviewTab` joins the same set for the same sentence: a hand-rolled
  // `join(', ')` renders "Medicine, Herbalism kit" where the recipe surface — one rule,
  // three subjects — renders "Medicine and Herbalism kit", so the two would disagree in
  // English before any translation was attempted.
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

  // The list is a `{list}` PLACEHOLDER, not a runtime value concatenated onto a localized
  // sentence: the position of a list inside its sentence is a translator's decision, and a
  // caller that appends it has already made that decision for every language. Same
  // fallback contract as `capText` — the fallback substitutes the list itself, so an
  // unlocalized build reads identically rather than printing a raw brace.
  const inheritText = $derived.by(() => {
    if (!inheritedNames) return text(copy.inheritEmptyKey, copy.inheritEmpty);
    const translated = localize(copy.inheritKey, { list: inheritedNames });
    if (translated && translated !== copy.inheritKey) return translated;
    return copy.inherit.replace('{list}', inheritedNames);
  });

  function toggleAuthored(checked) {
    // Turning it ON authors an EMPTY array — a real pick of zero, which is the honest
    // starting state for "this record picks its own". Turning it OFF restores inheritance
    // by clearing the key, which is a different roll, not the same one.
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
      <!-- PRESENTATIONAL. The `SelectionCheckbox` carries the whole accessible name in its
           own `aria-label`, so this copy of the same words is `aria-hidden` — the rule
           `ui-integration/spec.md` states for the catalogue card's eligibility pill ("One
           of the two, never both"), applied to the surface it also governs. It is not a
           `<label for>` either: `SelectionCheckbox`'s default wrapper already renders its
           own `<label>` around the input, and a second one would nest labels. -->
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
        <!-- Only when a stored pick is currently un-marked AND at least one survives, so an
             ordinary record carries no standing warning and the all-suppressed row is not
             told the same thing twice. The count rides the attribute as well as the
             sentence: the sentence is localized, and a test reading it would assert a
             translation. -->
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
