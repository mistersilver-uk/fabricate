<!-- Svelte 5 runes mode -->
<!--
  Per-activity modifier SELECTION editor.

  A crafting system defines ONE named modifier library, authored in ONE place, which this card
  deep-links to. THIS CARD AUTHORS NO ENTRY, ON ANY ACTIVITY: two editors for one array is how
  two screens come to disagree about which wrote last. What stays here is the SELECTION, which is
  genuinely per-activity — the COMBINATION RULE (`defaultModifierPolicy`), the PICK CAP
  (`maxModifierPicks`, where ABSENT is a real value meaning unlimited) and the DEFAULT ELIGIBLE
  SET (`defaultModifierIds`). `MODIFIER_POLICIES` and `policyDefersSelection` in the resolver are
  the sources for the rule list, its order and which two rules defer.

  The two cards, the six-label eligibility vocabulary, where the rule-keyed description sits, the
  2x2-to-1x4 reflow and the single empty-library sentence are all required by
  `openspec/specs/ui-integration/spec.md` → "Checks studio — combination rule and pick cap".

  Rendered for every sub-tab, INCLUDING the ones where the library cannot reach a roll, because a
  library that silently does nothing is the defect this card must report rather than hide.
  Controlled: it emits a partial SELECTION patch and cannot emit a library patch at all.
-->
<script>
  import Field from '../../../components/Field.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import Stepper from '../../../components/Stepper.svelte';
  import { stepperLabels } from '../../../components/stepperLabels.js';
  import Chip from '../../../components/Chip.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import ModifierLibraryRow from '../ModifierLibraryRow.svelte';
  import {
    normalizeModifierPolicy,
    policyDefersSelection,
    resolveMaxModifierPicks,
    resolveModifierBounds,
  } from '../../../../../systems/checkModifierResolver.js';
  import { MODIFIER_POLICY_OPTION_ATTR } from './modifierPolicyAttrs.js';

  const DEFAULT_MODIFIER_ICON = 'fa-solid fa-dice-d20';
  // The cap hint is the ONLY place "empty means unlimited" is stated and a blank number field
  // cannot state it, so the input takes the hint as its accessible description.
  const MAX_PICKS_HINT_ID = 'manager-crafting-modifier-max-picks-hint';

  let {
    // Which activity's SELECTION this card edits: the `bySubject` label vocabulary and whether
    // the gathering notices render, and NOTHING about editability.
    activity = 'crafting',
    modifiers = [],
    defaultModifierPolicy = 'addAll',
    defaultModifierIds = [],
    // The cap on how many modifiers a SELECTING rule may pick. ABSENT is a real value, so no
    // call site may coerce it: `resolveMaxModifierPicks` decides what absence means.
    maxModifierPicks = null,
    // Why the catalogue reaches no roll, or '' when it does. Each cause needs a different
    // remedy, so it is passed rather than derived from one boolean.
    inertCause = '',
    // Whether this activity's whole check-modifier seam is DORMANT. Its own notice, ALONGSIDE
    // `inertCause`: the two are different facts with different fixes.
    dormant = false,
    // Navigate to the surface where the library is authored; a null default keeps the card
    // mountable in isolation.
    onEditLibrary = null,
    onChange = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  // The `bySubject` rule's LABEL is per-activity while its TOKEN is not. One vocabulary map
  // rather than three rule lists, so `MODIFIER_POLICIES` stays the single source of the order.
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

  // Icon vocabulary for the four combination rules. THE GLYPH TEST IS WHETHER FOUNDRY CAN
  // RENDER IT, not whether the name is free: a module is licensed to write a configuration
  // Foundry resolves to a premium icon and not to bundle the icon, and Fabricate ships no font.
  // The ORDER mirrors `MODIFIER_POLICIES`, so the two selecting rules sit adjacent and the 2x2
  // grid reads them as a pair, and each description names the eligibility word the rule puts on
  // the rows above.
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

  // The ELIGIBILITY vocabulary: THREE words, one per KIND of rule, and `bySubject` SHARES
  // `playerPicks`'s rather than owning a fourth. Both are required by the spec section the
  // header names.
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

  // The NOT-selected vocabulary, keyed off the rule for the same reason the ON one is: an off
  // word is the negation of ONE on word and of no other.
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

  // Why the catalogue reaches no roll: each cause has its own remedy and so its own sentence,
  // and none names a placeholder, modifiers being added to the roll automatically.
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
    // GATHERING d100 ONLY, and it exists because `noCheck` is FALSE here: the d100 against
    // each drop's chance IS this mode's check, lacking only a seam for modifiers.
    noModifierSupport: {
      key: 'FABRICATE.Admin.Manager.Checks.Gathering.ModifierInertNoModifierSupport',
      fallback:
        'The d100 roll against each drop’s chance is this mode’s check, and it cannot take check modifiers yet, so nothing selected here changes it.',
    },
  };

  const library = $derived(Array.isArray(modifiers) ? modifiers : []);
  // Normalized through the resolver's OWN rule vocabulary rather than a local mirror of it,
  // which is also what makes a world still carrying the legacy `byRecipe` select `bySubject`.
  const selectedPolicy = $derived(normalizeModifierPolicy(defaultModifierPolicy) ?? 'addAll');
  // Whether the selected rule defers the selection, and so whether the cap means anything at
  // all. Asked of the resolver rather than re-derived from a local membership test.
  const defersSelection = $derived(policyDefersSelection(selectedPolicy));
  const eligibility = $derived(ELIGIBILITY_COPY[selectedPolicy] || ELIGIBILITY_COPY.addAll);
  // The cap means a different thing under each selecting rule, so the hint is keyed by rule;
  // only the two `policyDefersSelection` admits can appear, hence no third entry.
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
  // Routed through the resolver so the field shows the bound the ENGINE would apply, where a
  // stored `0`, `-2` or `"three"` all read as unlimited. `Infinity` → `null` is the Stepper's
  // unset value, which makes "unlimited" a blank field.
  const maxPicksLimit = $derived(resolveMaxModifierPicks({ maxModifierPicks }));
  const maxPicksValue = $derived(Number.isFinite(maxPicksLimit) ? maxPicksLimit : null);
  const maxPicksLabel = $derived(
    text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierMaxPicks', 'Maximum picks')
  );
  // THE CARD'S DESCRIPTION, keyed by RULE — what marking an entry MEANS is this card's whole
  // subject — and additionally by ACTIVITY under `bySubject`.
  const cardLead = $derived(
    selectedPolicy === 'bySubject'
      ? { key: subjectCopy.leadKey, fallback: subjectCopy.lead }
      : { key: eligibility.leadKey, fallback: eligibility.lead }
  );
  // KEYED BY ACTIVITY, not a module-level literal: this component is instantiated three times,
  // and a duplicate DOM id silently re-points every `aria-describedby` on the page.
  const ELIGIBILITY_INTRO_ID = $derived(`manager-${activity}-modifier-eligibility-intro`);
  // Gated on the catalogue being NON-EMPTY as well as on the cause: the notice reports a
  // CATALOGUE that reaches no roll, and an empty one is not that, so an ungated notice warned
  // about nothing on first contact with the tab.
  const inert = $derived(library.length > 0 ? INERT_COPY[inertCause] || null : null);
  const defaultIds = $derived(Array.isArray(defaultModifierIds) ? defaultModifierIds : []);

  // The three SELECTION writes, the whole of what this card persists. None can touch the
  // library: the store's check-modifier saver accepts no library key at all.
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

  // The read-only bounds chip, signed on BOTH ends because a modifier is a signed contribution.
  // An unbounded entry renders no chip rather than the word on every row of a catalogue that
  // mostly is.
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

  // Which BLOCKING bounds fault this entry has, or `''`. Both make it contribute 0 until
  // repaired, and the Validation route reports the same two. TWO CAUSES, TWO SENTENCES.
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
<InspectorCard
  class="manager-checks-card"
  data-crafting-modifier-catalogue={activity}
  data-check-modifier-activity={activity}
>
  <!-- The head carries the deep link at its top right. A full-width button under the rows sits
       in the slot every other list in this studio fills with its "add a row" control. -->
  <div class="manager-checks-card-head">
    <div class="manager-checks-card-head-body">
      <div class="manager-checks-card-heading">
        <!-- `Named modifiers`, a DIFFERENT key from `ModifierCatalogueHeading`, which the gathering
             task editor renders to disambiguate a task's check-modifier pick from its drop rows'
             character modifiers. One key serving two meanings is how a rename breaks a screen. -->
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
      <!-- The RULE'S OWN SENTENCE, above the rows that do the marking rather than under the grid
           that sets the rule, where it read as a footnote about the pick cap. It keeps the
           `aria-describedby` target id, which makes the pill's state word mean something. -->
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
      <!-- The disambiguation is a NAMING rule stated in BOTH directions: no surface shows both
           concepts at once, so one direction answers a question the screen never raises. -->
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
      <!-- ONE sentence on every activity, naming the surface that does add an entry, since
           nothing on this screen does. -->
      <p class="manager-muted" data-crafting-modifier-empty="linked">
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierCatalogueEmptyLinked',
          'This world has no modifiers yet. They are defined once, in System settings › Modifiers.'
        )}
      </p>
    {/if}

    {#each library as modifier (modifier.id)}
      <!-- ONE ROW, ONE LINE, a DIRECT child of the rows list so the list's own rhythm separates
           entries, and READ-ONLY on EVERY activity. The eligibility pill at the end is NOT part of
           that: which entries an activity applies is what this screen owns. -->
      <!-- THE ROW IS `ModifierLibraryRow`. The Tool Studio's check-bonus picker draws the same
           world modifier library and calls the same row, which stops two screens presenting one
           concept from two copies. -->
      <ModifierLibraryRow
        as="div"
        icon={modifier.icon || DEFAULT_MODIFIER_ICON}
        label={modifier.label || modifier.id}
        expression={modifier.expression}
        rowAttributes={{ 'data-crafting-modifier-row': modifier.id }}
        iconAttributes={{ 'data-crafting-modifier-readonly-icon': true }}
        labelAttributes={{ 'data-crafting-modifier-readonly': 'label' }}
        expressionAttributes={{ 'data-crafting-modifier-readonly': 'expression' }}
      >
        {#if boundsChipLabel(modifier)}
          <Chip density="row" class="manager-modifier-bounds-chip">{boundsChipLabel(modifier)}</Chip
          >
        {/if}
        {#if modifier.isRollExpression}
          <!-- A rolling entry is APPENDED AS DICE to this check's formula, so the chip is a
               neutral fact about the entry rather than a warning: the dice reach the roll,
               animate and show on the card. -->
          <Chip density="row" class="manager-modifier-roll-chip" data-crafting-modifier-roll
            >{text('FABRICATE.Admin.Manager.Checks.Crafting.ModifierRollTag', 'Rolls dice')}</Chip
          >
        {/if}

        <!-- THE ELIGIBILITY CONTROL, and it IS the pill: a real `aria-pressed` toggle button carrying
             the row's accessible name, pointed at the rule's sentence above, last on the row, with
             nothing interactive nested inside it. The off state changes the word AND unlights the dot,
             so it is never carried by colour alone. -->
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
      </ModifierLibraryRow>

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

    <!-- THE NOTE THAT CLOSES THE CARD: a standing pointer to the surface that owns the entries,
         read AFTER them rather than opening the screen with clauses of mechanism. -->
    <p class="manager-modifier-library-note" role="note" data-crafting-modifier-library-note>
      <i class="fas fa-circle-info" aria-hidden="true"></i>
      <span>
        {text(
          'FABRICATE.Admin.Manager.Checks.Crafting.ModifierLibraryNote',
          'These are defined once for the whole world, in system settings — this check only decides which of them apply and how.'
        )}
      </span>
    </p>
  </div>
</InspectorCard>

<!-- CARD TWO: how the marked entries reduce to the one number the roll gets, in its own studio
     card rather than under an uppercase micro-label this studio retired everywhere else. -->
<InspectorCard class="manager-checks-card" data-crafting-modifier-policy-card="">
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
    <!-- TWO columns, so the group is a 2x2: at this much copy per card, three columns packs too
         much text into each. `--manager-radio-card-columns` is a FIXED track count, never
         `auto-fit`, so the count IS the layout — four options at 2 columns is a clean 2x2 with no
         orphan row, and it puts the two selecting rules together, which is the distinction the pick
         cap applies to. It REFLOWS to 1x4 rather than overflowing at a narrow pane, the card
         declaring itself a container in the style block below. -->
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
      <!-- Shown under the two SELECTING rules only, a cap on a selection nobody makes being a
           control with no effect. Membership comes from the resolver, not a local list, so
           this surface cannot drift from the reduction it bounds. -->
      <div class="manager-modifier-max-picks" data-crafting-modifier-max-picks-block>
        <div class="manager-modifier-max-picks-body">
          <!-- A sentence-case `<h4>`, NOT the uppercase micro-label this card wore: the other
               kickers on this screen became card titles. -->
          <h4 class="manager-checks-card-subheading">{maxPicksLabel}</h4>
          <p class="manager-modifier-max-picks-hint" id={MAX_PICKS_HINT_ID}>
            {text(maxPicksCopy.key, maxPicksCopy.fallback)}
          </p>
        </div>
        <!-- `<div>`, not `<label>`: see the NAMING contract in `Stepper.svelte`. No caption
             span either — the `<h4>` beside it IS this field's visible label — and the
             Stepper's `ariaLabel` repeats that heading verbatim, so the accessible name still
             starts with the visible one (WCAG 2.5.3 Label in Name). -->
        <Field
          as="div"
          class="manager-modifier-max-picks-field"
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
        </Field>
      </div>
    {/if}
  </div>
</InspectorCard>

<style>
  /* The card is its OWN container-query context. The shipped `@container (max-width: 620px)`
     rule that reflows a `.is-config-cards` radio grid is UNNAMED, so it resolves against the
     NEAREST container — the whole `fabricate-manager` shell — and fired only when the entire
     manager was narrow. Declaring the container here makes it measure this card.

     `:global()` AND ANCHORED ON THE TWO CARDS' OWN HOOKS: both cards are `<InspectorCard>`s, so
     `manager-inspector-card` is written by that primitive and a scoped rule stopped matching —
     SILENTLY, because an `<i class={…}>` in this component makes every class selector in the
     block possibly-matching, so it was emitted with the hash attached and
     `lint:svelte:warnings` reported nothing. Measured against Svelte 5.56.3: a REGULAR element
     carrying a spread or an expression `class` does that, and the same attribute on a COMPONENT
     tag does not.

     Anchored on the two `data-` hooks rather than on the `.manager-checks-card` modifier the
     cards share, because that modifier has eleven other sites across seven components and
     `container-type` creates a containment context rather than painting — widening it would
     silently re-point every unnamed `@container` query inside all of them, which is this
     block's own defect inverted. An attribute weighs the same as a class, so each half stays
     at (0,2,0) and the two match exactly the elements the scoped form matched. */
  :global(.manager-inspector-card[data-crafting-modifier-catalogue]),
  :global(.manager-inspector-card[data-crafting-modifier-policy-card]) {
    container-type: inline-size;
  }

  /* THE ROW'S CHIPS ARE `Chip` AT `density="row"`, NOT STYLED HERE. Restating the row scale's
     GEOMETRY here RENDERS correctly — this block and `Chip.svelte`'s own scoped block are both
     unlayered, where `styles/fabricate.css` imports at `layer(modules)` and could never win, so
     ordinary specificity decides it and a local four-class rule beats the primitive's own. That
     is exactly the problem: a second, correctly-rendering implementation of one chip's geometry
     is what `manager-layout.test.js`'s hand-rolled-chip ratchet greps every non-primitive file
     for. Rendering right was never the bar; one owner is.

     What stays here is layout CONTEXT rather than the chip's geometry: `flex: 0 0 auto` keeps
     both chips from shrinking below their content, which is a property of this row's flex
     layout.

     RE-ANCHORED ON THE CARD, for the reason the rule above records: the row moved into
     `ModifierLibraryRow`, so `.manager-modifier-readonly-row` carries THAT component's hash and
     the scoped ancestor half stopped matching. Anchored on this card's own hook, each half
     stays at the (0,3,0) the scoped form had. */
  :global(.manager-inspector-card[data-crafting-modifier-catalogue] .manager-modifier-bounds-chip),
  :global(.manager-inspector-card[data-crafting-modifier-catalogue] .manager-modifier-roll-chip) {
    flex: 0 0 auto;
  }

  /* THE RULE GRID'S OWN GUTTER, on this card only: `RadioCardGroup`'s gutter is one shared
     value across the manager, and the design's differs here and differs again on the Outcomes
     screen's otherwise identical group — the mockup disagreeing with itself rather than a
     second scale to adopt. So this states the measured value where it is measured and leaves
     the primitive alone, by the same unlayered `:global()` route the chips above take, anchored
     per card for the reason the container rule states. Each half stays at (0,3,0). */
  :global(
    .manager-inspector-card[data-crafting-modifier-catalogue] .manager-resolution-mode-options
  ),
  :global(
    .manager-inspector-card[data-crafting-modifier-policy-card] .manager-resolution-mode-options
  ) {
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
     reaches no roll, which is not a footnote. Mirrors `.manager-resolution-mode-note`'s
     icon-beside-text shape so the two read as the same kind of statement. */
  .manager-modifier-inert {
    display: flex;
    /* Without this the flex default `stretch` gives the icon a box as tall as the callout and
       centres the glyph in it, floating it halfway down a three-line note. */
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
    /* Share the paragraph's line box so the glyph lands ON the first line: Font Awesome states
       its own line-height, which sits the glyph high. */
    flex: 0 0 auto;
    line-height: inherit;
  }

  .manager-modifier-inert strong {
    /* The heading and its sentence share one line box, so the note stays a paragraph. */
    margin-right: 0.25rem;
  }

  /* The cap is a one-to-three-digit field in a full-width inspector panel, so `fill` alone
     would stretch a stepper across ~700px for two characters. `Stepper`'s header names this
     case: where the slot has no intrinsic width, cap it in the LAYOUT context rather than
     dropping `fill`, an unfilled `.fab-stepper` still being a stretched flex item. 160px is
     the width the other four such call sites use.

     `:global(...)` chained with `.manager-field`, because this class sits on a `<Field>` and a
     scoped rule cannot reach a class a component hands to a child. The compound is not
     decoration: it restores the (0,2,0) the scoped form had. */
  :global(.manager-field.manager-modifier-max-picks-field) {
    flex: 0 0 auto;
    width: 160px;
    max-width: 160px;
    margin: 0;
  }
</style>
