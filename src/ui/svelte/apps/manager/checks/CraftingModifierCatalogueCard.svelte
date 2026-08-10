<!-- Svelte 5 runes mode -->
<!--
  Check-modifier catalogue + per-activity selection editor (issues 770, 1055, 1095).

  A crafting system defines ONE named catalogue of check modifiers — e.g. Medicine,
  Alchemy, Herbalism for a DC20 healing salve — each an authored roll-data expression
  (`@abilities.med.mod`) with optional bounds. That catalogue lives on the SYSTEM
  (`CraftingSystem.checkModifiers`), and crafting, salvage and gathering each select over
  it with their own combination rule and default eligible set.

  THE CARD IS ACTIVITY-AWARE, AND ONLY THE ENTRY EDITOR IS GATED (issue 1095).

    - CRAFTING owns the catalogue: the icon picker, label, `@`-prefixed expression input,
      the new absence-preserving `min`/`max` pair, delete and `+ Add modifier` all render
      here. It is deliberately NOT read-only — the prototype's read-only Modifiers row is
      authority for salvage and gathering, and adopting it on crafting would DELETE the
      shipped editor.
    - SALVAGE and GATHERING render each entry read-only, with a bounds chip and a link
      back to the crafting tab where the catalogue is authored.
    - On ALL THREE, the per-entry ELIGIBILITY control and the combination-rule grid stay
      fully editable, because deciding which entries apply and how they combine is exactly
      what each activity owns.

  The card authors three things:

    1. The COMBINATION RULE (`defaultModifierPolicy`) — who selects the eligible
       modifiers, and how they reduce to the one number appended to the check roll:
         - Add all:      sum the activity's default set. Nobody selects.
         - Highest:      the single largest of it (a deterministic max, not a pool).
         - By subject:   the RECIPE / COMPONENT / GATHERING ROW selects, at authoring time.
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
  where the catalogue cannot reach a roll, because a catalogue that silently does nothing
  is the defect this card must report rather than hide. `inertCause` names which of the two
  reasons applies (there were three until issue 1094 retired the roll-formula
  placeholder and, with it, the "you forgot to reference it" cause).

  Controlled component: it renders the passed props and emits a partial patch via
  `onChange` — the store splits the system-level `checkModifiers` from this activity's
  selection keys and writes both in one `updateSystem`, and the whole arrays are replaced
  on write (removing an entry persists without a `-=`).
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import IconPicker from '../../../components/IconPicker.svelte';
  import SelectionCheckbox from '../../../components/SelectionCheckbox.svelte';
  import StatusPill from '../../../components/StatusPill.svelte';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import Chip from '../Chip.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import RollDataExpressionInput from '../RollDataExpressionInput.svelte';
  import {
    normalizeModifierPolicy,
    policyDefersSelection,
    resolveMaxModifierPicks,
    resolveModifierBounds,
  } from '../../../../../systems/checkModifierResolver.js';
  import { MODIFIER_POLICY_OPTION_ATTR } from './modifierPolicyAttrs.js';

  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';
  const DEFAULTS_LABEL_ID = 'manager-crafting-modifier-defaults-label';
  // The cap hint is the ONLY place "empty means unlimited" is stated, and the Stepper's
  // blank field cannot state it, so the input takes the hint as its description rather
  // than leaving a screen-reader user with an unexplained empty number field.
  const MAX_PICKS_HINT_ID = 'manager-crafting-modifier-max-picks-hint';

  let {
    // Which activity's SELECTION this card edits: 'crafting' | 'salvage' | 'gathering'.
    // It decides the `bySubject` label vocabulary, whether the entry editor renders, and
    // whether the gathering disambiguation and dormancy notices render. It never decides
    // whether the eligibility control or the rule grid render — those are on all three.
    activity = 'crafting',
    checkModifiers = [],
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
    // Navigate to the surface where the catalogue is authored. Rendered only where the
    // entries are read-only; a null default keeps the card mountable in isolation.
    onEditCatalogue = null,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The `bySubject` rule's LABEL is per-activity while its TOKEN is not: the rule always
  // means "the record being resolved picks, at authoring time", and that record is a
  // recipe, a component or a gathering row. One vocabulary map rather than three rule
  // lists, so `MODIFIER_POLICIES` stays the single source of the option set and its order.
  const SUBJECT_COPY = {
    crafting: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectCrafting',
      label: 'By recipe',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectCraftingDesc',
      desc: 'Each recipe picks which modifiers apply, on its Overview tab; the picks are summed. Recipes that pick nothing use the default set below.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectCrafting',
      cap: 'The most modifiers a recipe author may pick for one recipe. Leave it empty for no limit. Lowering it below what a recipe already picked keeps the recipe intact but rolls only the first modifiers it picked, up to this many.',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroBySubjectCrafting',
      intro:
        'Which modifiers apply when a recipe does not pick its own. A recipe can pick its own set on its Overview tab.',
    },
    salvage: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectSalvage',
      label: 'By component',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectSalvageDesc',
      desc: 'Each component picks which modifiers apply, on its Salvage tab; the picks are summed. Components that pick nothing use the default set below.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectSalvage',
      cap: 'The most modifiers a component may pick for one salvage. Leave it empty for no limit. Lowering it below what a component already picked keeps the component intact but rolls only the first modifiers it picked, up to this many.',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroBySubjectSalvage',
      intro:
        'Which modifiers apply when a component does not pick its own. A component can pick its own set on its Salvage tab.',
    },
    gathering: {
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectGathering',
      label: 'By gathering row',
      descKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierPolicyBySubjectGatheringDesc',
      desc: 'Each gathering task picks which modifiers apply, in the gathering library; the picks are summed. Tasks that pick nothing use the default set below.',
      capKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicksBySubjectGathering',
      cap: 'The most modifiers a gathering task may pick. Leave it empty for no limit. Lowering it below what a task already picked keeps the task intact but rolls only the first modifiers it picked, up to this many.',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroBySubjectGathering',
      intro:
        'Which modifiers apply when a gathering task does not pick its own. A task can pick its own set in the gathering library.',
    },
  };

  const subjectCopy = $derived(SUBJECT_COPY[activity] || SUBJECT_COPY.crafting);
  // CRAFTING alone owns the catalogue ENTRIES. The eligibility control and the rule grid
  // below are deliberately outside this gate.
  const entriesEditable = $derived(activity === 'crafting');

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
      descFallback: 'Use only the single largest eligible modifier (a deterministic maximum).',
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
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroAddAll',
      intro: 'Every modifier switched on here is added to the roll. Every attempt uses this set.',
    },
    highest: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityConsidered',
      label: 'Considered',
      tone: 'accent',
      icon: 'fas fa-arrow-up-wide-short',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroHighest',
      intro:
        'The modifiers switched on here are compared — only the largest of them is added. Every attempt uses this set.',
    },
    playerPicks: {
      key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilitySelectable',
      label: 'Selectable',
      tone: 'info',
      icon: 'fas fa-hand-pointer',
      introKey: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierDefaultsIntroPlayerPicks',
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

  const NOT_ELIGIBLE_COPY = {
    key: 'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEligibilityOff',
    label: 'Not applied',
    tone: 'subtle',
    icon: 'fas fa-circle-minus',
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
        'The check for this resolution mode has no roll formula yet, so nothing here is rolled. Author one above and these modifiers are added to it automatically.',
    },
  };

  const modifiers = $derived(Array.isArray(checkModifiers) ? checkModifiers : []);
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
  // because the record doing the picking is a recipe, a component or a gathering row.
  const defaultsIntro = $derived(
    selectedPolicy === 'bySubject'
      ? { key: subjectCopy.introKey, fallback: subjectCopy.intro }
      : { key: eligibility.introKey, fallback: eligibility.intro }
  );
  // Gated on the catalogue being NON-EMPTY as well as on the cause. The notice reports a
  // CATALOGUE that reaches no roll, and an empty catalogue is not one: a fresh crafting
  // system is `simple` + `rollFormula: ''`, so an ungated notice put a permanent warning
  // callout ("These modifiers reach no roll… Author one above") directly above the
  // empty-catalogue empty state, warning about nothing on first contact with the tab.
  // `RecipeOverviewTab` already gates its equivalent banner on `hasModifierCatalogue`;
  // this is the same rule, on the surface that owns the catalogue.
  const inert = $derived(modifiers.length > 0 ? INERT_COPY[inertCause] || null : null);
  const defaultIds = $derived(Array.isArray(defaultModifierIds) ? defaultModifierIds : []);

  const minLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierMin', 'Minimum'));
  const maxLabel = $derived(text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierMax', 'Maximum'));
  const unboundedLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierBoundsUnbounded', 'Unbounded')
  );

  function newId() {
    return globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto.randomUUID();
  }

  function emitModifiers(next) {
    onChange({ checkModifiers: next });
  }

  function addModifier() {
    emitModifiers([
      ...modifiers,
      { id: newId(), label: '', icon: DEFAULT_MODIFIER_ICON, expression: '' },
    ]);
  }

  // A bare roll-data path with no leading `@`, e.g. `abilities.med.mod`. ONLY these
  // get the sigil re-added on write; anything else is stored verbatim.
  function updateModifier(id, patch) {
    emitModifiers(
      modifiers.map((modifier) => (modifier.id === id ? { ...modifier, ...patch } : modifier))
    );
  }

  // `Stepper` reports a clamped number, or `null` when an `allowUnset` field is cleared.
  // `null` is written as an EXPLICIT key rather than dropped, for the same reason the pick
  // cap is: absence is the "unbounded" value, so clearing the field has to be able to
  // REMOVE an existing bound, and a patch that omitted the key would leave the old one in
  // place. The normalizer attaches the key only for a finite number, so a `null` round-trips
  // to key-absent, which is what unbounded IS.
  function updateBound(id, key, next) {
    updateModifier(id, { [key]: next });
  }

  function removeModifier(id) {
    // Dropping the entry from the catalogue also drops it from the default set so a
    // dangling default id never lingers (the normalizer would drop it anyway). Both go in
    // ONE patch, so the store writes them in one `updateSystem` rather than reading the
    // system twice and building the second write from a pre-first snapshot.
    onChange({
      checkModifiers: modifiers.filter((modifier) => modifier.id !== id),
      ...(defaultIds.includes(id) && {
        defaultModifierIds: defaultIds.filter((defaultId) => defaultId !== id),
      }),
    });
  }

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

  // An authored `min > max` is BLOCKING, not silently reordered: the entry contributes 0
  // until it is repaired, matching the refuse posture gathering's drop modifiers already
  // take. The row says so where the GM authored it; the Validation route reports the same
  // fact as a critical `modifierBoundsInverted`.
  function boundsInverted(modifier) {
    return resolveModifierBounds(modifier).inverted;
  }

  function eligibilityStateOf(id) {
    return defaultIds.includes(id) ? eligibility : NOT_ELIGIBLE_COPY;
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
      'Named character modifiers added to the check roll automatically, as one + N[Modifiers] term. Each expression resolves against the acting character (e.g. @abilities.med.mod). One catalogue is shared by crafting, salvage and gathering; each decides which entries apply.'
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

  <div class="manager-modifier-catalogue" data-crafting-modifier-rows>
    {#if modifiers.length === 0}
      <p class="manager-muted" data-crafting-modifier-empty>
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueEmpty',
          'No check modifiers yet. Add one to make it available to the checks in this system.'
        )}
      </p>
    {/if}
    {#each modifiers as modifier (modifier.id)}
      <div class="manager-character-modifier-row" data-crafting-modifier-row={modifier.id}>
        {#if entriesEditable}
          <div class="manager-modifier-name-row">
            <div
              class="manager-field manager-modifier-icon-field"
              data-crafting-modifier-field="icon"
            >
              <span class="manager-recipe-micro-label"
                >{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierIcon', 'Icon')}</span
              >
              <IconPicker
                value={modifier.icon || DEFAULT_MODIFIER_ICON}
                buttonTitle={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.ModifierChangeIcon',
                  'Change icon'
                )}
                onChange={(iconClass) => updateModifier(modifier.id, { icon: iconClass })}
              />
            </div>
            <label class="manager-field manager-modifier-label-field">
              <span class="manager-recipe-micro-label"
                >{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierLabel', 'Label')}</span
              >
              <input
                type="text"
                data-crafting-modifier-field="label"
                value={modifier.label || ''}
                placeholder={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.ModifierLabelPlaceholder',
                  'Medicine'
                )}
                oninput={(event) =>
                  updateModifier(modifier.id, { label: event.currentTarget.value })}
              />
            </label>
          </div>
          <div class="manager-modifier-expression-row">
            <label class="manager-field manager-modifier-field-expression">
              <span class="manager-recipe-micro-label"
                >{text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.ModifierExpression',
                  'Expression'
                )}</span
              >
              <RollDataExpressionInput
                dataField="crafting-modifier"
                inputAttrs={{ 'data-crafting-modifier-field': 'expression' }}
                value={modifier.expression}
                placeholder="abilities.med.mod"
                onChange={(expression) => updateModifier(modifier.id, { expression })}
              />
            </label>
            <button
              type="button"
              class="manager-icon-button is-danger manager-modifier-remove"
              data-crafting-modifier-remove={modifier.id}
              title={text(
                'FABRICATE.Admin.Manager.Checks.Crafting.ModifierRemove',
                'Remove modifier'
              )}
              aria-label={text(
                'FABRICATE.Admin.Manager.Checks.Crafting.ModifierRemove',
                'Remove modifier'
              )}
              onclick={() => removeModifier(modifier.id)}
            >
              <i class="fas fa-trash" aria-hidden="true"></i>
            </button>
          </div>
          <!-- The bounds pair sits on its OWN row, after the expression, rather than
               beside it. At a real ~700-760px pane a third field on the expression line
               compresses the expression input — the one field whose content is long and
               whose truncation is silent — so the row reflows to two lines instead. -->
          <div class="manager-modifier-bounds-row" data-crafting-modifier-bounds={modifier.id}>
            <div class="manager-field manager-modifier-bound-field">
              <span class="manager-recipe-micro-label">{minLabel}</span>
              <Stepper
                value={resolveModifierBounds(modifier).min}
                allowUnset
                fill
                placeholder={unboundedLabel}
                {...stepperLabels(minLabel)}
                inputProps={{ 'data-crafting-modifier-field': 'min' }}
                onChange={(next) => updateBound(modifier.id, 'min', next)}
              />
            </div>
            <div class="manager-field manager-modifier-bound-field">
              <span class="manager-recipe-micro-label">{maxLabel}</span>
              <Stepper
                value={resolveModifierBounds(modifier).max}
                allowUnset
                fill
                placeholder={unboundedLabel}
                {...stepperLabels(maxLabel)}
                inputProps={{ 'data-crafting-modifier-field': 'max' }}
                onChange={(next) => updateBound(modifier.id, 'max', next)}
              />
            </div>
          </div>
        {:else}
          <!-- READ-ONLY entry (salvage, gathering). The catalogue is authored once, on
               crafting; showing a second editor for the same rows would let two screens
               disagree about which one wrote last. The eligibility control below is NOT
               part of this gate. -->
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
          </div>
        {/if}

        {#if boundsInverted(modifier)}
          <p
            class="manager-modifier-bounds-error"
            role="note"
            data-crafting-modifier-bounds-invalid={modifier.id}
          >
            {text(
              'FABRICATE.Admin.Manager.Checks.Crafting.ModifierBoundsInverted',
              'This modifier’s minimum is above its maximum, so it adds nothing to the roll until you fix the two values.'
            )}
          </p>
        {/if}

        <!-- The ELIGIBILITY control, on ALL THREE activities. The checkbox IS the control
             and carries the accessible name; the pill beside it is presentational and
             repeats the state as a word. They are siblings, never nested. -->
        <div class="manager-modifier-eligibility" data-crafting-modifier-eligibility={modifier.id}>
          <SelectionCheckbox
            size="sm"
            checked={defaultIds.includes(modifier.id)}
            ariaLabel={`${modifier.label || modifier.id} — ${eligibilityLabelOf(modifier.id)}`}
            data-crafting-modifier-eligibility-input={modifier.id}
            onChange={(checked) => toggleDefault(modifier.id, checked)}
          />
          <StatusPill
            tone={eligibilityStateOf(modifier.id).tone}
            icon={eligibilityStateOf(modifier.id).icon}
            label={eligibilityLabelOf(modifier.id)}
          />
        </div>
      </div>
    {/each}
    {#if entriesEditable}
      <button type="button" class="manager-button" data-crafting-modifier-add onclick={addModifier}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        {text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierAdd', 'Add modifier')}
      </button>
    {:else if onEditCatalogue}
      <button
        type="button"
        class="manager-button"
        data-crafting-modifier-edit-link
        onclick={() => onEditCatalogue()}
      >
        <i class="fas fa-pen-to-square" aria-hidden="true"></i>
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierEditCatalogue',
          'Edit these modifiers on the Crafting check'
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

  {#if modifiers.length > 0 && defaultsIntro.fallback}
    <!-- The eligibility sentence for the ACTIVE rule. It sits BELOW the rule grid, because
         it explains what switching an entry on means under the rule the GM just chose;
         above the grid it would describe a rule they were about to change. -->
    <p
      class="manager-muted"
      id={DEFAULTS_LABEL_ID}
      data-crafting-modifier-defaults={selectedPolicy}
    >
      {text(defaultsIntro.key, defaultsIntro.fallback)}
    </p>
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
