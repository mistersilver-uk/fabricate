<!-- Svelte 5 runes mode -->
<!--
  Per-activity modifier SELECTION editor (issues 770, 1055, 1095, 1117).

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
    3. The DEFAULT ELIGIBLE SET (`defaultModifierIds`) — which catalogue entries this
       activity applies, toggled per row by the eligibility control.

  THE ELIGIBILITY CONTROL IS THE CHECKBOX; THE PILL IS PRESENTATIONAL (issue 1095, DN9).
  `SelectionCheckbox` is the accessible control and carries the accessible name;
  `StatusPill` renders the state word beside it and is inert. They are ADJACENT and NEVER
  NESTED — an interactive control inside an interactive pill lands invalid DOM, the same
  trap `ArmedDangerButton.svelte`'s header warns about. The not-selected state differs by
  more than colour: the checkbox itself is unchecked and the pill's word AND glyph both
  change, so the distinction survives a monochrome render.

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
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import Chip from '../Chip.svelte';
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
    // mode rolls no check at all) or 'noFormula' (a check slot exists but has no
    // authored roll formula). One boolean cannot carry this, and the two need different
    // remedies, so the cause is passed rather than derived from a flag.
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
      desc: 'Each recipe picks which modifiers apply, on its Overview tab; the picks are summed. Recipes that pick nothing use the default set above.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectCrafting',
      cap: 'The most modifiers a recipe author may pick for one recipe. Leave it empty for no limit. Lowering it below what a recipe already picked keeps the recipe intact but rolls only the first modifiers it picked, up to this many.',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroBySubjectCrafting',
      intro:
        'Which modifiers apply when a recipe does not pick its own. A recipe can pick its own set on its Overview tab.',
    },
    salvage: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectSalvage',
      label: 'By component',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectSalvageDesc',
      desc: 'Each component picks which modifiers apply, on its Salvage tab; the picks are summed. Components that pick nothing use the default set above.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectSalvage',
      cap: 'The most modifiers a component may pick for one salvage. Leave it empty for no limit. Lowering it below what a component already picked keeps the component intact but rolls only the first modifiers it picked, up to this many.',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroBySubjectSalvage',
      intro:
        'Which modifiers apply when a component does not pick its own. A component can pick its own set on its Salvage tab.',
    },
    gathering: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectGathering',
      label: 'By gathering task',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectGatheringDesc',
      desc: 'Each gathering task picks which modifiers apply, in the gathering library; the picks are summed. Tasks that pick nothing use the default set above.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectGathering',
      cap: 'The most modifiers a gathering task may pick. Leave it empty for no limit. Lowering it below what a task already picked keeps the task intact but rolls only the first modifiers it picked, up to this many.',
      introKey:
        'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroBySubjectGathering',
      intro:
        'Which modifiers apply when a gathering task does not pick its own. A task can pick its own set in the gathering library.',
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
  const policyOptions = $derived([
    {
      value: 'addAll',
      icon: 'fas fa-layer-group',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAll',
      fallback: 'Add all',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyAddAllDesc',
      descFallback: 'Sum every eligible modifier into the check roll.',
    },
    {
      value: 'highest',
      icon: 'fas fa-arrow-up-wide-short',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighest',
      fallback: 'Highest',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHighestDesc',
      descFallback:
        'Use only the single best eligible modifier, ranked by its average — so a 1d4 (2.5) beats a flat +2, and the winner is added as dice.',
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
        'The player picks from the default set at roll time on an interactive attempt; the picks are summed and added to the roll. Other attempts pick the best legal selection.',
    },
  ]);

  // The ELIGIBILITY vocabulary: four words, one per rule, because the rule decides what
  // "on" MEANS for an entry. `Applied` is unconditional, `Considered` enters a maximum,
  // `Selectable` is offered to the player, and `Picked per subject` is offered to the
  // record being resolved. One word for all four would have to be vague enough to be true
  // of every one of them, which is exactly how "Enabled" says nothing.
  //
  // Each state is a DIFFERENT StatusPill tone AND a different glyph, and the not-selected
  // state below changes both, so the distinction is never carried by colour alone.
  const ELIGIBILITY_COPY = {
    addAll: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityApplied',
      label: 'Applied',
      tone: 'success',
      icon: 'fas fa-circle-check',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroAddAll',
      intro: 'Every modifier switched on here is added to the roll. Every attempt uses this set.',
    },
    highest: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityConsidered',
      label: 'Considered',
      tone: 'accent',
      icon: 'fas fa-arrow-up-wide-short',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroHighest',
      intro:
        'The modifiers switched on here are compared by their average — only the best of them is added. Every attempt uses this set.',
    },
    playerPicks: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilitySelectable',
      label: 'Selectable',
      tone: 'info',
      icon: 'fas fa-hand-pointer',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityIntroPlayerPicks',
      intro:
        'Which modifiers the player chooses from at roll time. Every attempt in this system offers this set.',
    },
    bySubject: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityBySubject',
      label: 'Picked per subject',
      tone: 'warning',
      icon: 'fas fa-scroll',
      introKey: '',
      intro: '',
    },
  };

  // The NOT-selected vocabulary, keyed off the rule for the same reason the ON one is:
  // "Not applied" is the negation of `Applied` and of nothing else, so under the other
  // three rules it was one OFF word answering four different ON words — the row said
  // "Selectable" or "Considered" when on and "Not applied" when off, which are not the two
  // ends of one statement. The GLYPH and TONE stay constant across all four, deliberately:
  // the not-selected state has to read as one state at a glance, and it is the WORD that
  // completes the sentence the rule started.
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
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityOffBySubject',
      label: 'Not picked by default',
    },
  };
  const NOT_ELIGIBLE_TONE = 'subtle';
  const NOT_ELIGIBLE_ICON = 'fas fa-circle-minus';

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
        'The check for this resolution mode has no roll formula yet, so nothing here is rolled. Author one above and these modifiers are added to it automatically.',
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
  // What the default set IS depends on the rule, and the four readings are materially
  // different decisions. Under `bySubject` the sentence also depends on the ACTIVITY,
  // because the record doing the picking is a recipe, a component or a gathering task.
  const eligibilityIntro = $derived(
    selectedPolicy === 'bySubject'
      ? { key: subjectCopy.introKey, fallback: subjectCopy.intro }
      : { key: eligibility.introKey, fallback: eligibility.intro }
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

  const notEligible = $derived({
    ...(NOT_ELIGIBLE_COPY[selectedPolicy] || NOT_ELIGIBLE_COPY.addAll),
    tone: NOT_ELIGIBLE_TONE,
    icon: NOT_ELIGIBLE_ICON,
  });

  function eligibilityStateOf(id) {
    return defaultIds.includes(id) ? eligibility : notEligible;
  }

  function eligibilityLabelOf(id) {
    const state = eligibilityStateOf(id);
    return text(state.key, state.label);
  }
</script>

<section
  class="manager-inspector-card"
  data-crafting-modifier-catalogue={activity}
  data-check-modifier-activity={activity}
>
  <h3 class="manager-card-title">
    {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueHeading', 'Check modifiers')}
  </h3>
  <p class="manager-muted">
    {text(
      'FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueIntro',
      'Named character modifiers added to the check roll automatically, as flavoured [Modifiers] terms — flat ones as one + N term, and a rolling one as its own dice term, so the dice show on the card. Each expression resolves against the acting character (e.g. @abilities.med.mod). The library is authored once in System settings › Modifiers and shared by crafting, salvage and gathering; each decides which entries apply.'
    )}
  </p>

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
          'Progressive and routed gathering are disabled pending issue 683, so no gathering configuration you can choose today rolls a formula. Anything you set here is saved and starts applying when those modes ship.'
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

  {#if library.length > 0 && eligibilityIntro.fallback}
    <!-- The eligibility sentence for the ACTIVE rule, ABOVE the rows it governs. It states
         what switching an entry on MEANS under the rule the GM just chose, so it has to sit
         where that switching happens: below the rule grid it landed ~500px under the
         controls it explains and read as a footnote about the pick cap. The rule grid
         re-renders this sentence the moment the rule changes, so "it would describe a rule
         they are about to change" is not a risk the position creates. -->
    <p
      class="manager-muted"
      id={ELIGIBILITY_INTRO_ID}
      data-crafting-modifier-defaults={selectedPolicy}
    >
      {text(eligibilityIntro.key, eligibilityIntro.fallback)}
    </p>
  {/if}

  <div class="manager-modifier-catalogue" data-crafting-modifier-rows>
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
      <div class="manager-character-modifier-row" data-crafting-modifier-row={modifier.id}>
        <!-- READ-ONLY on EVERY activity (issue 1117). The library is authored once, in
             System settings › Modifiers; a second editor for the same rows is how two
             screens come to disagree about which one wrote last, and crafting having one
             while salvage and gathering did not was that asymmetry made visible. The
             eligibility control below is NOT part of this: which entries an activity
             applies is exactly what this screen owns. -->
        <div class="manager-modifier-readonly-row">
          <i
            class={modifier.icon || DEFAULT_MODIFIER_ICON}
            aria-hidden="true"
            data-crafting-modifier-readonly-icon
          ></i>
          <span class="manager-modifier-readonly-label" data-crafting-modifier-readonly="label"
            >{modifier.label || modifier.id}</span
          >
          <code
            class="manager-modifier-readonly-expression"
            data-crafting-modifier-readonly="expression">{modifier.expression || '—'}</code
          >
          {#if boundsChipLabel(modifier)}
            <Chip tone="neutral" mono class="manager-modifier-bounds-chip"
              >{boundsChipLabel(modifier)}</Chip
            >
          {/if}
          {#if modifier.isRollExpression}
            <!-- A rolling entry is APPENDED AS DICE to this check's formula (issue 1118), so
                 the chip is a neutral fact about the entry rather than a warning about it:
                 the dice reach the roll, animate and show on the card. It was `warning` while
                 a check could only append a scalar and readiness blocked such an entry; that
                 rule is retired, so the tone follows it. -->
            <Chip tone="neutral" class="manager-modifier-roll-chip" data-crafting-modifier-roll
              >{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierRollTag', 'Rolls dice')}</Chip
            >
          {/if}
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

        <!-- The ELIGIBILITY control, on ALL THREE activities. The checkbox IS the control
             and carries the accessible name; the pill beside it repeats the state as a word
             for sighted users and is HIDDEN from assistive technology, because the checkbox's
             own accessible name already ends in that word — leaving both in the tree read the
             state twice ("Medicine — Applied, checkbox, Applied"). They are siblings, never
             nested. The `aria-describedby` points at the ACTIVE RULE's eligibility sentence
             above, which is what makes "Applied" mean something to a reader who never sees the
             rule grid. -->
        <div class="manager-modifier-eligibility" data-crafting-modifier-eligibility={modifier.id}>
          <SelectionCheckbox
            size="sm"
            checked={defaultIds.includes(modifier.id)}
            ariaLabel={`${modifier.label || modifier.id} — ${eligibilityLabelOf(modifier.id)}`}
            aria-describedby={eligibilityIntro.fallback ? ELIGIBILITY_INTRO_ID : undefined}
            data-crafting-modifier-eligibility-input={modifier.id}
            onChange={(checked) => toggleDefault(modifier.id, checked)}
          />
          <span class="manager-modifier-eligibility-pill" aria-hidden="true">
            <StatusPill
              tone={eligibilityStateOf(modifier.id).tone}
              icon={eligibilityStateOf(modifier.id).icon}
              label={eligibilityLabelOf(modifier.id)}
            />
          </span>
        </div>
      </div>
    {/each}
    {#if onEditLibrary}
      <button
        type="button"
        class="manager-button"
        data-crafting-modifier-edit-link
        onclick={() => onEditLibrary()}
      >
        <i class="fas fa-pen-to-square" aria-hidden="true"></i>
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEditCatalogue',
          'Edit these modifiers in System settings'
        )}
      </button>
    {/if}
  </div>

  <h4 class="manager-modifier-subheading">
    {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyHeading', 'Combination rule')}
  </h4>
  <!-- TWO columns, so the group is a 2x2. This is explicit maintainer feedback on the
       three-up layout that stood here: at this much copy per card — a name plus a
       two-clause sentence naming who selects, when, and how the picks reduce — three
       columns packs too much text into each card, so the layout drops to two.
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
    legend="Combination rule"
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
         from the reduction it is bounding. -->
    <h4 class="manager-modifier-subheading">{maxPicksLabel}</h4>
    <p class="manager-muted" id={MAX_PICKS_HINT_ID}>
      {text(maxPicksCopy.key, maxPicksCopy.fallback)}
    </p>
    <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. It carries no
         caption span either — the `<h4>` above IS this field's visible label, and a second
         "Maximum picks" directly under the first would be the same words twice. The
         Stepper's `ariaLabel` repeats that heading verbatim, so the accessible name still
         starts with the visible one (WCAG 2.5.3). -->
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
  {/if}
</section>

<style>
  .manager-modifier-catalogue {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-block: 0.5rem 1rem;
  }

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

  /* The row container, the icon/label name-row, and the `@` expression field all reuse
     the global manager-character-modifier-row / manager-modifier-name-row /
     manager-prerequisite-path-input classes (styles/fabricate.css) so the Checks-tab
     catalogue reads as the same design language as the System-tab modifier list. Only
     the expression + delete line needs a local rule. */
  .manager-modifier-expression-row {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
  }

  .manager-modifier-field-expression {
    flex: 1 1 auto;
  }

  .manager-modifier-remove {
    flex: 0 0 auto;
  }

  /* The bounds pair: two narrow steppers on their own line. `max-width` per field for the
     reason the pick cap states — a two-character numeric field has no intrinsic width, so
     `fill` alone would stretch each across half the card. */
  .manager-modifier-bounds-row {
    display: flex;
    gap: var(--fab-space-2);
    margin-top: 0.35rem;
  }

  .manager-modifier-bound-field {
    flex: 0 0 auto;
    max-width: 160px;
  }

  .manager-modifier-bounds-error {
    margin-block: 0.35rem 0;
    color: var(--fab-danger-text);
    font-size: 0.68rem;
    line-height: 1.4;
  }

  /* Read-only entry (salvage, gathering): identity, expression and bounds on one line. */
  .manager-modifier-readonly-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--fab-space-2);
    align-items: center;
  }

  .manager-modifier-readonly-label {
    font-weight: 600;
  }

  .manager-modifier-readonly-expression {
    color: var(--fab-text-subtle);
    font-size: 0.68rem;
  }

  /* The eligibility control and its pill: ADJACENT siblings, never nested. */
  .manager-modifier-eligibility {
    display: flex;
    gap: var(--fab-space-2);
    align-items: center;
    margin-top: 0.35rem;
  }

  /* The `aria-hidden` wrapper the pill sits in contributes NO box: the pill stays a direct
     flex item of the row above, so the wrapper changes the accessibility tree and nothing
     else. */
  .manager-modifier-eligibility-pill {
    display: contents;
  }

  .manager-modifier-subheading {
    margin-block: 1rem 0.35rem;
  }

  /* The inert notice sits at the TOP of the card, above the catalogue it invalidates,
     and is warning-toned rather than muted: everything below it is authoring that
     currently reaches no roll, which is not a footnote. Mirrors
     `.manager-resolution-mode-note`'s icon-beside-text shape (RadioCardGroup) so the
     two read as the same kind of statement. */
  .manager-modifier-inert {
    display: flex;
    gap: var(--fab-space-2);
    margin-block: 0.5rem 0;
    padding: var(--fab-space-2) var(--fab-space-3);
    border: 1px solid var(--fab-warning-border);
    border-radius: 8px;
    color: var(--fab-warning-text);
    background: var(--fab-warning-soft);
    font-size: 0.7rem;
    line-height: 1.45;
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
    max-width: 160px;
    margin-top: 0.35rem;
  }
</style>
