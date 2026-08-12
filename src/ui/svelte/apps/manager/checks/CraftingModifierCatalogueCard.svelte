<!-- Svelte 5 runes mode -->
<!--
  Per-activity modifier SELECTION editor (issues 770, 1055, 1095, 1117, 1096).

  A crafting system defines ONE named modifier library — e.g. Medicine, Alchemy, Herbalism
  for a DC20 healing salve — each an authored roll-data expression (`@abilities.med.mod`)
  with optional bounds. That library lives on the SYSTEM (`CraftingSystem.modifiers`) and
  is authored in ONE place: System settings > Modifiers.

  THIS CARD AUTHORS NO ENTRY, ON ANY ACTIVITY (issue 1117). Crafting used to, which made
  the Checks screen a second editor for a system-level library and made salvage and
  gathering second-class states of that asymmetry. All three now render the library
  read-only with one deep link to the surface that owns it, and what stays here is the
  SELECTION — which entries this activity applies and how they combine — because that is
  genuinely per-activity.

  ── TWO CARDS, AND THE ROW IS ONE LINE (issue 1096, maintainer parity round) ──────────

  This surface is rebuilt against the standalone Checks Studio prototype, and the
  differences it closes were invisible to the parity harness for a stated reason: no lab
  system authored a modifier library, so `modifier-entry-row` sat marked `unreachable`,
  the rows never rendered, and nothing about them was measured. Everything AROUND them
  matched, so the screen reported clean. `tests/view-lab/world/labContent.js` now seeds
  runework's library, the marking is gone, and the row and its parts are measured.

  What changed, each of it a value read off the prototype rather than chosen here:

    - TWO studio cards, `Named modifiers` and `How they combine`, each with a real head
      (sentence-case title + description) rather than one card under two uppercase
      micro-labels. The uppercase-kicker correction landed on every other screen in this
      studio and never reached this one.
    - The deep link sits in the FIRST card's HEAD, top right, link-styled. It was a
      full-width button at the foot of the rows, which reads as a list-extending action —
      the one thing this card explicitly cannot do.
    - ONE ROW PER ENTRY, single line: glyph tile, name, expression, bounds chip, and the
      eligibility control at the right end. It was a two-line bordered sub-card — a name
      row, then a second row carrying a checkbox and a pill.
    - THE PILL IS THE CONTROL. It was presentational, sat beside a `SelectionCheckbox`,
      and was hidden from assistive technology because the checkbox already said the
      state. There is no checkbox now: the pill is a real `aria-pressed` toggle button
      carrying the row's accessible name, which is the one control the design draws.
      Never NESTED in anything interactive — an interactive control inside an interactive
      control lands invalid DOM, the trap `ArmedDangerButton.svelte`'s header warns about.
      The not-selected state differs by more than colour: the dot goes unlit AND the word
      changes, so the distinction survives a monochrome render.
    - THE LIBRARY NOTE CLOSES THE CARD instead of opening it, in the prototype's own
      words. Ours was a much longer paragraph at the top, above the rows it qualifies.
    - THE CARD DESCRIPTION IS RULE-KEYED, because the prototype's is: `Mark which of the
      system's modifiers this check applies` under `addAll`, a comparison sentence under
      `highest`, and a "may choose from" sentence naming the picker under the two rules
      that defer. That sentence IS this card's eligibility explanation, so it keeps the
      `data-crafting-modifier-defaults` hook and the `aria-describedby` wiring the pill
      needs; it simply sits where the design puts it.

  THE ELIGIBILITY VOCABULARY IS THE PROTOTYPE'S THREE WORDS, not our four. `bySubject`
  used to read `Picked per subject` / `Not picked by default`; it now reads `Selectable` /
  `Not selectable`, the same pair `playerPicks` uses. That is forced rather than preferred:
  the prototype's own `By recipe` description — which this card is required to ship
  verbatim — says "from the modifiers you mark SELECTABLE", so a row reading anything else
  would make the sentence beside it untrue about our own control.

  The card authors three things, and none of them is an entry:

    1. The COMBINATION RULE (`defaultModifierPolicy`) — who selects the eligible
       modifiers, and how they reduce to the one number appended to the check roll:
         - Add all:      sum the activity's default set. Nobody selects.
         - Highest:      the single largest of it (a deterministic max, not a pool).
         - By subject:   the RECIPE / COMPONENT / GATHERING TASK selects, at authoring time.
         - Player picks: the PLAYER selects, at roll time; the picks sum.
       `MODIFIER_POLICIES` in the resolver is the source of that list and its order;
       `policyDefersSelection` is the source of which two defer the selection.
    2. The PICK CAP (`maxModifierPicks`) — how many modifiers the deferred-to party may
       pick. It bounds the two selecting rules only, and ABSENT means unlimited, which is
       why the control's empty state is a real value rather than a blank to be defaulted.
       It sits in the SECOND card, under the rule grid, because that is the card whose
       rules it bounds — and where the prototype draws it.
    3. The DEFAULT ELIGIBLE SET (`defaultModifierIds`) — which catalogue entries this
       activity applies, toggled per row by the eligibility pill.

  Sibling of the failure-consumption card. Rendered for every sub-tab — INCLUDING the ones
  where the library cannot reach a roll, because a library that silently does nothing
  is the defect this card must report rather than hide. `inertCause` names which of the two
  reasons applies (there were three until issue 1094 retired the roll-formula
  placeholder and, with it, the "you forgot to reference it" cause).

  Controlled component: it renders the passed props and emits a partial SELECTION patch via
  `onChange`, which the store merges into this activity's check block. It cannot emit a
  library patch at all — the store's check-modifier saver no longer accepts one.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import Chip from '../Chip.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import {
    normalizeModifierPolicy,
    policyDefersSelection,
    resolveMaxModifierPicks,
    resolveModifierBounds,
  } from '../../../../../systems/checkModifierResolver.js';
  import { MODIFIER_POLICY_OPTION_ATTR } from './modifierPolicyAttrs.js';

  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';
  // The cap hint is the ONLY place "empty means unlimited" is stated, and the Stepper's
  // blank field cannot state it, so the input takes the hint as its description rather
  // than leaving a screen-reader user with an unexplained empty number field.
  const MAX_PICKS_HINT_ID = 'manager-crafting-modifier-max-picks-hint';

  let {
    // Which activity's SELECTION this card edits: 'crafting' | 'salvage' | 'gathering'.
    // It decides the `bySubject` label vocabulary and whether the gathering disambiguation
    // and dormancy notices render. Since issue 1117 it decides nothing about EDITABILITY:
    // the library rows are read-only and the eligibility control and rule grid are
    // editable, on all three.
    activity = 'crafting',
    modifiers = [],
    defaultModifierPolicy = 'addAll',
    defaultModifierIds = [],
    // The cap on how many modifiers a SELECTING rule may pick (issue 1055). ABSENT is a
    // real value — "unlimited" — so this prop is deliberately `null` by default and no
    // call site may coerce it to a number: `resolveMaxModifierPicks` decides what absence
    // means, and it must decide the same thing here as it does in the engine.
    maxModifierPicks = null,
    // Why the catalogue reaches no roll, or '' when it does: 'noCheck' (this resolution
    // mode rolls no check at all), 'noFormula' (a check slot exists but has no authored
    // roll formula) or 'noModifierSupport' (the mode rolls, but takes no modifiers yet —
    // gathering d100). One boolean cannot carry this, and each needs a different remedy,
    // so the cause is passed rather than derived from a flag.
    inertCause = '',
    // Whether this activity's whole check-modifier seam is DORMANT (issue 1095, decision
    // 8): gathering's formula-rolled modes are rendered disabled pending issue 683, so no
    // GM-selectable configuration reaches them. Rendered as its own notice naming the
    // reason, ALONGSIDE `inertCause` rather than instead of it — "d100 rolls no check" and
    // "the other two modes cannot be chosen yet" are different facts with different fixes.
    dormant = false,
    // Navigate to the surface where the library is authored (System settings > Modifiers).
    // Rendered on every activity now that the rows are read-only everywhere; a null default
    // keeps the card mountable in isolation.
    onEditLibrary = null,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The `bySubject` rule's LABEL is per-activity while its TOKEN is not: the rule always
  // means "the record being resolved picks, at authoring time", and that record is a
  // recipe, a component or a gathering task. One vocabulary map rather than three rule
  // lists, so `MODIFIER_POLICIES` stays the single source of the option set and its order.
  const SUBJECT_COPY = {
    crafting: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectCrafting',
      label: 'By recipe',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectCraftingDesc',
      desc: 'Each recipe takes up to a number you set from the modifiers you mark selectable.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectCrafting',
      cap: 'The most modifiers a recipe author may pick for one recipe. Leave it empty for no limit. Lowering it below what a recipe already picked keeps the recipe intact but rolls only the first modifiers it picked, up to this many.',
      leadKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroBySubjectCrafting',
      lead: 'Mark which of the system’s modifiers the recipe may choose from.',
    },
    salvage: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectSalvage',
      label: 'By component',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectSalvageDesc',
      desc: 'Each component takes up to a number you set from the modifiers you mark selectable.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectSalvage',
      cap: 'The most modifiers a component may pick for one salvage. Leave it empty for no limit. Lowering it below what a component already picked keeps the component intact but rolls only the first modifiers it picked, up to this many.',
      leadKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroBySubjectSalvage',
      lead: 'Mark which of the system’s modifiers the component may choose from.',
    },
    gathering: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectGathering',
      label: 'By gathering task',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectGatheringDesc',
      desc: 'Each gathering task takes up to a number you set from the modifiers you mark selectable.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectGathering',
      cap: 'The most modifiers a gathering task may pick. Leave it empty for no limit. Lowering it below what a task already picked keeps the task intact but rolls only the first modifiers it picked, up to this many.',
      leadKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroBySubjectGathering',
      lead: 'Mark which of the system’s modifiers the gathering task may choose from.',
    },
  };

  const subjectCopy = $derived(SUBJECT_COPY[activity] || SUBJECT_COPY.crafting);

  // Icon vocabulary for the four combination rules: Add all stacks the whole eligible
  // set, Highest sorts and takes the top one, By subject hands the selection to the
  // record being resolved (a scroll — the document being authored), and Player picks hands
  // it to the player at roll time (the manager's "manual choice" glyph). Both glyphs are
  // Font Awesome FREE (`fontAwesomeFreeClassicIcons.js`, generated from FA Free 6.7.2):
  // Foundry bundles FA Pro, so a Pro glyph would render, but a community package is not
  // licensed to use one.
  //
  // The ORDER mirrors `MODIFIER_POLICIES`, which declares itself to be in
  // authoring-surface order; the two selecting rules therefore sit adjacent, which is
  // what the 2x2 grid below reads as a pair.
  //
  // EVERY DESCRIPTION IS THE PROTOTYPE'S OWN SENTENCE (issue 1096). Ours were longer and
  // differently worded, and three of them described the mechanism ("the picks are
  // summed", "Recipes that pick nothing use the default set above") where the design
  // describes the decision. Each names the eligibility word the rule puts on the rows
  // above, which is what ties the two cards together.
  const policyOptions = $derived([
    {
      value: 'addAll',
      icon: 'fas fa-layer-group',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAll',
      fallback: 'Add all',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAllDesc',
      descFallback:
        'Every modifier you mark applied is summed into the roll — nothing is chosen at the table.',
    },
    {
      value: 'highest',
      icon: 'fas fa-arrow-up-wide-short',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighest',
      fallback: 'Highest',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighestDesc',
      descFallback:
        'The modifiers you mark considered are compared and only the largest is added — a deterministic maximum.',
    },
    {
      value: 'bySubject',
      icon: 'fas fa-scroll',
      labelKey: subjectCopy.labelKey,
      fallback: subjectCopy.label,
      descKey: subjectCopy.descKey,
      descFallback: subjectCopy.desc,
    },
    {
      value: 'playerPicks',
      icon: 'fas fa-hand-pointer',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicks',
      fallback: 'Player picks',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyPlayerPicksDesc',
      descFallback:
        'The player takes up to a number you set from the modifiers you mark selectable, at roll time.',
    },
  ]);

  // The ELIGIBILITY vocabulary: THREE words, one per KIND of rule, because the rule
  // decides what "on" MEANS for an entry. `Applied` is unconditional, `Considered` enters
  // a maximum, and `Selectable` is offered to whoever the rule defers to — the player at
  // roll time, or the record being resolved at authoring time. One word for all of them
  // would have to be vague enough to be true of every one, which is exactly how "Enabled"
  // says nothing.
  //
  // `bySubject` shares `playerPicks`'s word rather than owning a fourth (`Picked per
  // subject`, issue 1095). The prototype's own `By recipe` description — shipped verbatim
  // above — reads "from the modifiers you mark selectable", so a row saying anything else
  // makes that sentence untrue about the control beside it.
  const ELIGIBILITY_COPY = {
    addAll: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityApplied',
      label: 'Applied',
      leadKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroAddAll',
      lead: 'Mark which of the system’s modifiers this check applies.',
    },
    highest: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityConsidered',
      label: 'Considered',
      leadKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroHighest',
      lead: 'Mark which of the system’s modifiers are compared — only the largest of them is added.',
    },
    playerPicks: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilitySelectable',
      label: 'Selectable',
      leadKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroPlayerPicks',
      lead: 'Mark which of the system’s modifiers the player may choose from.',
    },
    bySubject: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilitySelectable',
      label: 'Selectable',
      leadKey: '',
      lead: '',
    },
  };

  // The NOT-selected vocabulary, keyed off the rule for the same reason the ON one is:
  // "Not applied" is the negation of `Applied` and of nothing else, so under the other
  // rules it was one OFF word answering several different ON words — the row said
  // "Selectable" or "Considered" when on and "Not applied" when off, which are not the two
  // ends of one statement.
  const NOT_ELIGIBLE_COPY = {
    addAll: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityOff',
      label: 'Not applied',
    },
    highest: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityOffHighest',
      label: 'Not considered',
    },
    playerPicks: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityOffPlayerPicks',
      label: 'Not selectable',
    },
    bySubject: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityOffPlayerPicks',
      label: 'Not selectable',
    },
  };

  // Why the catalogue reaches no roll. Each cause has its own remedy, so each has its
  // own sentence — "the modifiers do nothing" with no reason is not actionable. Both
  // sentences name the REAL remaining cause and, per issue 1094, neither names a
  // placeholder: modifiers are added to the check roll automatically, so a GM told to
  // reference one would be told to do something that does nothing.
  const INERT_COPY = {
    noCheck: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertNoCheck',
      fallback:
        'This resolution mode rolls no check, so nothing here is applied. Change the resolution mode to one that rolls a check.',
    },
    noFormula: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertNoFormula',
      fallback:
        'The check for this resolution mode has no roll formula yet, so nothing here is rolled. Author one on The roll section and these modifiers are added to it automatically.',
    },
    // GATHERING d100 ONLY, and it exists because `noCheck` is FALSE here. The d100 rolled
    // against each drop's chance IS this mode's check; what it lacks is a seam to add
    // modifiers to. Under `noCheck`'s sentence a GM was told the mode rolls nothing and
    // instructed to switch to one that rolls — wrong on the first clause, and pointing at
    // the two gathering modes nobody can select on the second.
    noModifierSupport: {
      key: 'FABRICATE.Admin.Manager.Checks.Gathering.ModifierInertNoModifierSupport',
      fallback:
        'The d100 roll against each drop’s chance is this mode’s check, and it cannot take check modifiers yet, so nothing selected here changes it.',
    },
  };

  const library = $derived(Array.isArray(modifiers) ? modifiers : []);
  // Normalized through the resolver's OWN rule vocabulary rather than a local copy of
  // it. The literal `['addAll','highest','byRecipe','playerPicks']` that stood here was
  // a hand-maintained mirror of `VALID_POLICIES` — a mirror that has to be edited in
  // lockstep is exactly the drift issue 855 was. It is also what makes a world still
  // carrying the pre-1095 `byRecipe` select `bySubject` here.
  const selectedPolicy = $derived(normalizeModifierPolicy(defaultModifierPolicy) ?? 'addAll');
  // Whether the selected rule defers the selection to someone else, and therefore whether
  // the cap means anything at all. Asked of the resolver rather than re-derived from a
  // local `['bySubject','playerPicks']` membership test, for the same reason as above.
  const defersSelection = $derived(policyDefersSelection(selectedPolicy));
  const eligibility = $derived(ELIGIBILITY_COPY[selectedPolicy] || ELIGIBILITY_COPY.addAll);
  // The cap means a different thing under each selecting rule — a bound on the SUBJECT
  // author at edit time, or a bound on the PLAYER at roll time — so the hint is keyed by
  // the rule rather than written once and left ambiguous. Only the two rules
  // `policyDefersSelection` admits can appear here, which is why there is no third entry.
  const maxPicksCopy = $derived(
    selectedPolicy === 'bySubject'
      ? { key: subjectCopy.capKey, fallback: subjectCopy.cap }
      : selectedPolicy === 'playerPicks'
        ? {
            key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksPlayerPicks',
            fallback:
              'The most modifiers a player may pick at roll time. Leave it empty for no limit. A limit of 1 is the single-pick behaviour: the player chooses one modifier from the default set.',
          }
        : null
  );
  // Routed through the resolver so the field shows the bound the ENGINE would apply: a
  // stored `0`, `-2` or `"three"` all read as unlimited there, and a field that rendered
  // them verbatim would report a cap that truncates nothing. `Infinity` → `null` is the
  // Stepper's unset value, which is what makes "unlimited" a blank field rather than a
  // magic number the GM has to know.
  const maxPicksLimit = $derived(resolveMaxModifierPicks({ maxModifierPicks }));
  const maxPicksValue = $derived(Number.isFinite(maxPicksLimit) ? maxPicksLimit : null);
  const maxPicksLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicks', 'Maximum picks')
  );
  // THE CARD'S DESCRIPTION, and it depends on the rule because the prototype's does. What
  // marking an entry MEANS is the whole subject of this card, and the four readings are
  // materially different decisions; under `bySubject` the sentence also depends on the
  // ACTIVITY, because the record doing the picking is a recipe, a component or a task.
  const cardLead = $derived(
    selectedPolicy === 'bySubject'
      ? { key: subjectCopy.leadKey, fallback: subjectCopy.lead }
      : { key: eligibility.leadKey, fallback: eligibility.lead }
  );
  // KEYED BY ACTIVITY, not a module-level literal. This component is instantiated three
  // times — crafting, salvage and gathering — and a hardcoded id is unique only because the
  // three panels happen to be mutually exclusive today. A duplicate DOM id silently sends
  // every `aria-describedby` on the page to whichever copy rendered first, which is a
  // screen-reader-only defect no frame would show.
  const ELIGIBILITY_INTRO_ID = $derived(`manager-${activity}-modifier-eligibility-intro`);
  // Gated on the catalogue being NON-EMPTY as well as on the cause. The notice reports a
  // CATALOGUE that reaches no roll, and an empty catalogue is not one: a fresh crafting
  // system is `simple` + `rollFormula: ''`, so an ungated notice put a permanent warning
  // callout ("These modifiers reach no roll… Author one above") directly above the
  // empty-catalogue empty state, warning about nothing on first contact with the tab.
  // `RecipeOverviewTab` already gates its equivalent banner on `hasModifierCatalogue`;
  // this is the same rule, on the surface that owns the catalogue.
  const inert = $derived(library.length > 0 ? INERT_COPY[inertCause] || null : null);
  const defaultIds = $derived(Array.isArray(defaultModifierIds) ? defaultModifierIds : []);

  // ── The three SELECTION writes, and the whole of what this card persists ────────────
  // Each emits a partial patch the store merges into THIS activity's check block. None of
  // them can touch the library (issue 1117): that is authored in System settings, and the
  // store's check-modifier saver no longer accepts a library key at all.
  function selectPolicy(policy) {
    onChange({ defaultModifierPolicy: policy });
  }

  function selectMaxPicks(next) {
    onChange({ maxModifierPicks: next });
  }

  function toggleDefault(id, checked) {
    const next = checked
      ? [...new Set([...defaultIds, id])]
      : defaultIds.filter((defaultId) => defaultId !== id);
    onChange({ defaultModifierIds: next });
  }

  // The read-only bounds chip, e.g. `-1 to +5`. Signed on BOTH ends: a modifier is a
  // signed contribution, so a bare `5` reads as a value rather than as a bonus. The two
  // half-bounded readings are separate sentences because "at most" and "at least" are not
  // the same promise, and an unbounded entry renders no chip at all rather than the word
  // "unbounded" on every row of a catalogue that mostly is.
  function boundsChipLabel(modifier) {
    const { min, max } = resolveModifierBounds(modifier);
    if (min === null && max === null) return '';
    const signed = (value) => (value < 0 ? `${value}` : `+${value}`);
    if (min !== null && max !== null) return `${signed(min)} to ${signed(max)}`;
    if (max !== null) {
      return `${text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierBoundsAtMost', 'At most')} ${signed(max)}`;
    }
    return `${text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierBoundsAtLeast', 'At least')} ${signed(min)}`;
  }

  // Which BLOCKING bounds fault this entry has, or `''`. Both make the entry contribute 0
  // until it is repaired, matching the refuse posture gathering's drop modifiers already
  // take, and the row says so where the GM authored it; the Validation route reports the
  // same two facts as `modifierBoundsInverted` / `modifierBoundsUnsafe`, both `critical`.
  //
  // TWO CAUSES, TWO SENTENCES. "Your minimum is above your maximum" and "this number cannot
  // appear in a roll formula" need different repairs, and `1e21` is not an inversion.
  function boundsFault(modifier) {
    const bounds = resolveModifierBounds(modifier);
    if (bounds.inverted) return 'inverted';
    return bounds.unsafe ? 'unsafe' : '';
  }

  const notEligible = $derived(NOT_ELIGIBLE_COPY[selectedPolicy] || NOT_ELIGIBLE_COPY.addAll);

  function isEligible(id) {
    return defaultIds.includes(id);
  }

  function eligibilityLabelOf(id) {
    const state = isEligible(id) ? eligibility : notEligible;
    return text(state.key, state.label);
  }
</script>

<!-- CARD ONE: the library, read-only, with the selection control on each row. -->
<section
  class="manager-inspector-card manager-checks-card"
  data-crafting-modifier-catalogue={activity}
  data-check-modifier-activity={activity}
>
  <!-- The head carries the deep link at its top right, which is where the design puts the
       one action this card has. It was a full-width button under the rows, in the slot
       every other list in this studio fills with its "add a row" control — a shape that
       promises exactly the thing this card cannot do. -->
  <div class="manager-checks-card-head">
    <div class="manager-checks-card-head-body">
      <div class="manager-checks-card-heading">
        <!-- `Named modifiers`, which is the prototype's word for this list (issue 1096). It
             is a DIFFERENT key from `ModifierCatalogueHeading`, which the gathering task
             editor also renders: there the heading disambiguates a task's check-modifier
             pick from the character modifiers on its drop rows, and "Check modifiers" is
             the right word for that. One key serving two meanings is how a rename breaks a
             screen nobody looked at. -->
        <h3 class="manager-checks-card-title">
          {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierNamedHeading', 'Named modifiers')}
        </h3>
        {#if onEditLibrary}
          <ManagerButton
            class="manager-checks-card-head-link"
            data-crafting-modifier-edit-link
            onclick={() => onEditLibrary()}
          >
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEditCatalogue',
              'Edit in system settings'
            )}
            <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
          </ManagerButton>
        {/if}
      </div>
      <!-- The RULE'S OWN SENTENCE, in the description slot. It states what marking an entry
           MEANS under the rule the GM just chose, which is why it sits above the rows that
           do the marking rather than under the grid that sets the rule — where it read as a
           footnote about the pick cap. It keeps the `aria-describedby` target id: the pill's
           accessible name ends in "Applied", and this is what makes that word mean
           something to a reader who never sees the rule grid. -->
      <p
        class="manager-checks-card-description"
        id={ELIGIBILITY_INTRO_ID}
        data-crafting-modifier-defaults={selectedPolicy}
      >
        {text(cardLead.key, cardLead.fallback)}
      </p>
    </div>
  </div>

  <div class="manager-checks-card-body is-stack" data-crafting-modifier-rows>
    {#if activity === 'gathering'}
      <!-- The disambiguation is a NAMING rule, and it is stated in BOTH directions. No
           surface shows both concepts at once, so a sentence that only said "this is the
           check-modifier one" would be answering a question the screen never raises. -->
      <p class="manager-muted" data-gathering-modifier-disambiguation>
        {text(
          'FABRICATE.Admin.Manager.Checks.Gathering.ModifierDisambiguation',
          'These are check modifiers: they add to a rolled gathering formula in progressive and routed resolution. They are not the gathering library’s character modifiers, which shift a drop’s percentage chance in d100 resolution and never apply to a rolled formula.'
        )}
      </p>
    {/if}

    {#if dormant}
      <p class="manager-modifier-inert" role="note" data-check-modifier-dormant>
        <i class="fa-solid fa-clock" aria-hidden="true"></i>
        <span>
          <strong
            >{text(
              'FABRICATE.Admin.Manager.Checks.Gathering.ModifierDormantHeading',
              'Not in use yet'
            )}</strong
          >
          {text(
            'FABRICATE.Admin.Manager.Checks.Gathering.ModifierDormantBody',
            'Progressive and routed gathering are not available yet, so no gathering configuration you can choose today rolls a formula. Anything you set here is saved and starts applying as soon as those modes ship.'
          )}
        </span>
      </p>
    {/if}

    {#if inert}
      <p class="manager-modifier-inert" role="note" data-crafting-modifier-inert={inertCause}>
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
        <span>
          <strong
            >{text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierInertHeading',
              'These modifiers reach no roll'
            )}</strong
          >
          {text(inert.key, inert.fallback)}
        </span>
      </p>
    {/if}

    {#if library.length === 0}
      <!-- ONE sentence, on every activity. It branched on who owned the entries while
           crafting authored them; now nothing on this screen adds one, so the instruction
           is the same everywhere and it names the surface that does. -->
      <p class="manager-muted" data-crafting-modifier-empty="linked">
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueEmptyLinked',
          'This system has no modifiers yet. They are defined once, in System settings › Modifiers.'
        )}
      </p>
    {/if}

    {#each library as modifier (modifier.id)}
      <!-- ONE ROW, ONE LINE, and it is a DIRECT child of the rows list so the list's own
           6px rhythm separates entries rather than a wrapper's. READ-ONLY on EVERY activity
           (issue 1117): the library is authored once, in System settings › Modifiers, and a
           second editor for the same rows is how two screens come to disagree about which
           one wrote last. The eligibility pill at the end is NOT part of that — which
           entries an activity applies is exactly what this screen owns. -->
      <div class="manager-modifier-readonly-row" data-crafting-modifier-row={modifier.id}>
        <span class="manager-modifier-readonly-glyph" aria-hidden="true">
          <i class={modifier.icon || DEFAULT_MODIFIER_ICON} data-crafting-modifier-readonly-icon
          ></i>
        </span>
        <span class="manager-modifier-readonly-label" data-crafting-modifier-readonly="label"
          >{modifier.label || modifier.id}</span
        >
        <code
          class="manager-modifier-readonly-expression"
          data-crafting-modifier-readonly="expression">{modifier.expression || '—'}</code
        >
        {#if boundsChipLabel(modifier)}
          <Chip density="row" class="manager-modifier-bounds-chip">{boundsChipLabel(modifier)}</Chip
          >
        {/if}
        {#if modifier.isRollExpression}
          <!-- A rolling entry is APPENDED AS DICE to this check's formula (issue 1118), so
               the chip is a neutral fact about the entry rather than a warning about it:
               the dice reach the roll, animate and show on the card. It was `warning` while
               a check could only append a scalar and readiness blocked such an entry; that
               rule is retired, so the tone follows it. -->
          <Chip density="row" class="manager-modifier-roll-chip" data-crafting-modifier-roll
            >{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierRollTag', 'Rolls dice')}</Chip
          >
        {/if}

        <!-- THE ELIGIBILITY CONTROL, and it is the pill itself (issue 1096). A real
             `aria-pressed` toggle button, carrying the row's accessible name and pointed at
             the rule's sentence in the card head above. It is the LAST thing on the row and
             nothing interactive nests inside it. The off state changes the word AND unlights
             the dot, so it is never carried by colour alone. -->
        <button
          type="button"
          class="manager-modifier-eligibility"
          class:is-on={isEligible(modifier.id)}
          aria-pressed={isEligible(modifier.id)}
          aria-label={`${modifier.label || modifier.id} — ${eligibilityLabelOf(modifier.id)}`}
          aria-describedby={cardLead.fallback ? ELIGIBILITY_INTRO_ID : undefined}
          data-crafting-modifier-eligibility={modifier.id}
          data-crafting-modifier-eligibility-input={modifier.id}
          onclick={() => toggleDefault(modifier.id, !isEligible(modifier.id))}
        >
          <span class="manager-modifier-eligibility-dot" aria-hidden="true"></span>
          {eligibilityLabelOf(modifier.id)}
        </button>
      </div>

      {#if boundsFault(modifier)}
        <p
          class="manager-modifier-bounds-error"
          role="note"
          data-crafting-modifier-bounds-invalid={modifier.id}
          data-crafting-modifier-bounds-cause={boundsFault(modifier)}
        >
          {#if boundsFault(modifier) === 'inverted'}
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierBoundsInverted',
              'This modifier’s minimum is above its maximum, so it adds nothing to the roll until you fix the two values.'
            )}
          {:else}
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierBoundsUnsafe',
              'This modifier’s bound is too large or too small to appear in a roll formula, so it adds nothing to the roll until you fix it.'
            )}
          {/if}
        </p>
      {/if}
    {/each}

    <!-- THE NOTE THAT CLOSES THE CARD. It was a much longer paragraph at the TOP, above the
         rows it qualifies, and it opened the screen with four clauses of mechanism. This is
         the prototype's own sentence, in the prototype's own place: a standing pointer to
         the surface that owns the entries, read after the entries rather than before them. -->
    <p class="manager-modifier-library-note" role="note" data-crafting-modifier-library-note>
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      <span>
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierLibraryNote',
          'These are defined once for the whole crafting system, in system settings — this check only decides which of them apply and how.'
        )}
      </span>
    </p>
  </div>
</section>

<!-- CARD TWO: how the marked entries reduce to the one number the roll gets. Its own studio
     card, as the design draws it — it was an uppercase micro-label inside the card above,
     which is the treatment this studio retired everywhere else. -->
<section class="manager-inspector-card manager-checks-card" data-crafting-modifier-policy-card>
  <div class="manager-checks-card-head">
    <div class="manager-checks-card-head-body">
      <h3 class="manager-checks-card-title">
        {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading', 'How they combine')}
      </h3>
      <p class="manager-checks-card-description">
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyLead',
          'Which of the named modifiers reach the roll, and how they are added up.'
        )}
      </p>
    </div>
  </div>

  <div class="manager-checks-card-body">
    <!-- TWO columns, so the group is a 2x2. This is explicit maintainer feedback on the
         three-up layout that stood here: at this much copy per card — a name plus a
         sentence naming who selects, when, and how the picks reduce — three columns packs
         too much text into each card, so the layout drops to two.
         `--manager-radio-card-columns` is a FIXED track count
         (`repeat(var(…), minmax(0, 1fr))`), never `auto-fit`, so the count is the layout:
         four options at 2 columns is a clean 2x2 with no orphan row, and it puts the two
         non-selecting rules on the top row and the two selecting rules on the bottom one,
         which is the distinction the pick cap below applies to.

         It REFLOWS to 1x4 rather than overflowing at a narrow pane: the card declares
         itself a container in the style block below, so the shipped
         `@container (max-width: 620px)` rule for `.is-config-cards` now measures THIS
         card's inline size instead of the whole manager shell's. -->
    <RadioCardGroup
      legendKey="FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading"
      legend="How they combine"
      options={policyOptions}
      selectedValue={selectedPolicy}
      groupName={`check-modifier-policy-${activity}`}
      columns={2}
      dataAttr="data-crafting-modifier-policy"
      optionDataAttr={MODIFIER_POLICY_OPTION_ATTR}
      onChange={selectPolicy}
    />

    {#if defersSelection && maxPicksCopy}
      <!-- Shown under the two SELECTING rules only, because a cap on a selection nobody
           makes is a control with no effect. Membership comes from the resolver
           (`policyDefersSelection`), not from a local list, so this surface cannot drift
           from the reduction it is bounding. It sits in THIS card because these are the
           rules it bounds, and because the prototype draws it here. -->
      <div class="manager-modifier-max-picks" data-crafting-modifier-max-picks-block>
        <div class="manager-modifier-max-picks-body">
          <!-- A `<h4>`, sentence case, at the prototype's own 11.5px/600 — NOT the uppercase
               micro-label this card wore. Two of the three kickers on this screen became card
               titles; leaving the third as `MAXIMUM PICKS` would keep the exact treatment the
               rebuild removes, one block lower down. -->
          <h4 class="manager-checks-card-subheading">{maxPicksLabel}</h4>
          <p class="manager-modifier-max-picks-hint" id={MAX_PICKS_HINT_ID}>
            {text(maxPicksCopy.key, maxPicksCopy.fallback)}
          </p>
        </div>
        <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. It carries
             no caption span either — the `<h4>` beside it IS this field's visible label, and a
             second "Maximum picks" under the first would be the same words twice.
             The Stepper's `ariaLabel` repeats that heading verbatim, so the accessible name
             still starts with the visible one (WCAG 2.5.3). -->
        <div
          class="manager-field manager-modifier-max-picks-field"
          data-crafting-modifier-max-picks={maxPicksValue === null
            ? 'unlimited'
            : String(maxPicksValue)}
        >
          <Stepper
            value={maxPicksValue}
            allowUnset
            min={1}
            fill
            placeholder={text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksUnlimited',
              'Unlimited'
            )}
            {...stepperLabels(maxPicksLabel)}
            inputProps={{
              'data-crafting-modifier-max-picks-input': '',
              'aria-describedby': MAX_PICKS_HINT_ID,
            }}
            onChange={selectMaxPicks}
          />
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  /* The card is its OWN container-query context (issue 1095, D4). The shipped
     `@container (max-width: 620px)` rule that reflows a `.is-config-cards` radio grid to
     one column is UNNAMED, so it resolves against the NEAREST container — which was the
     whole `fabricate-manager` shell, i.e. it fired only when the entire manager was
     narrow, never when the centre pane alone was. Declaring the container here makes it
     measure this card, so the 2x2 rule grid reflows to 1x4 against the real ~700-760px
     pane rather than overflowing it. */
  .manager-inspector-card {
    container-type: inline-size;
  }

  /* ── THE ROW'S CHIPS ARE `Chip` AT `density="row"`, NOT STYLED HERE ───────────────────
     A first pass restated the row scale's GEOMETRY here — padding, radius, fill, colour,
     type — the way the manager restates `ToggleCard`'s and `Callout`'s elsewhere in this
     studio, by pairing the chip primitive's own root class with each chip's `class` prop
     inside a local `:global(...)` rule. It RENDERED correctly: this block and `Chip.svelte`'s
     own scoped block are both unlayered — `styles/fabricate.css` imports at `layer(modules)`
     (Foundry imports a module stylesheet into that layer; `tests/view-lab/cascade.css`
     mirrors it) and could never have won this fight, but a caller's OWN scoped `<style>` is
     not that sheet — so ordinary specificity decided it, and the four-class local rule beat
     the primitive's own two-or-three. That is exactly the problem: a second,
     correctly-rendering implementation of the one chip's geometry is what issue 883 retired,
     and `manager-layout.test.js`'s hand-rolled-chip ratchet greps every file but the
     primitive's own for that root class for that reason — rendering right was never the bar,
     one owner is. `Chip.svelte`'s `density="row"` prop is that one owner's variant.

     What stays here is layout CONTEXT rather than the chip's own geometry: `flex: 0 0 auto`
     keeps both chips from shrinking below their content when the row is narrow, which is a
     property of this row's flex layout, not of a chip. */
  .manager-modifier-readonly-row :global(.manager-modifier-bounds-chip),
  .manager-modifier-readonly-row :global(.manager-modifier-roll-chip) {
    flex: 0 0 auto;
  }

  /* THE RULE GRID'S OWN GUTTER, on this card only. `RadioCardGroup` is shared and its 12px
     gutter is one value across the manager, while the prototype draws 10px here — and 11px
     on the Outcomes screen's otherwise identical group, which is the mockup disagreeing with
     itself rather than a second scale to adopt. So this states the measured value where it is
     measured and leaves the primitive alone. Same unlayered-`:global()` route as the chips
     above, for the same cascade reason. */
  .manager-inspector-card :global(.manager-resolution-mode-options) {
    gap: 10px;
  }

  .manager-modifier-bounds-error {
    margin-block: 0 0.15rem;
    color: var(--fab-danger-text);
    font-size: 0.68rem;
    line-height: 1.4;
  }

  /* The inert and dormant notices sit at the TOP of the rows list, above the catalogue they
     invalidate, and are warning-toned rather than muted: everything below is authoring that
     currently reaches no roll, which is not a footnote. Mirrors
     `.manager-resolution-mode-note`'s icon-beside-text shape (RadioCardGroup) so the
     two read as the same kind of statement. */
  .manager-modifier-inert {
    display: flex;
    /* Without this the flex default `stretch` gives the icon a box as tall as the whole
       callout, and its glyph centres inside that — so on a three-line note the icon floats
       halfway down instead of sitting beside the sentence it introduces. */
    align-items: flex-start;
    gap: var(--fab-space-2);
    margin-block: 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-warning-border);
    border-radius: 8px;
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
    font-size: 0.7rem;
    line-height: 1.45;
  }

  .manager-modifier-inert > i {
    /* Share the paragraph's line box so the glyph lands ON the first line rather than at
       the top of it — Font Awesome states its own line-height, which sits the glyph high. */
    flex: 0 0 auto;
    line-height: inherit;
  }

  .manager-modifier-inert strong {
    /* The heading and its sentence share one line box so the note stays a paragraph,
       not a two-block callout competing with the card title above it. */
    margin-right: 0.25rem;
  }

  /* The cap is a one-to-three-digit field, and the card is a full-width inspector panel,
     so `fill` alone would stretch a stepper across ~700px for two characters. `Stepper`'s
     header names this exact case: where the slot has no intrinsic width, cap it in the
     LAYOUT context rather than dropping `fill` (an unfilled `.fab-stepper` is still a
     flex item and `align-items: stretch` widens it to the same box anyway). 160px is the
     width the other four such call sites use. */
  .manager-modifier-max-picks-field {
    flex: 0 0 auto;
    width: 160px;
    max-width: 160px;
    margin: 0;
  }
</style>
