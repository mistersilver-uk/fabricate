<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's per-ACTIVITY route: `checks-crafting`, `checks-salvage`, `checks-gathering`
  and `checks-validation` are rail ROUTES and this component renders whichever one is open.
  `activity` is therefore a prop rather than internal state — the rail owns the highlight, the
  breadcrumb and the deep link, and a second copy here would be a second source of truth for
  which screen the GM is on.

  A system has exactly one crafting, one salvage and one gathering check, each a singleton whose
  shape follows its resolution mode, so an activity route is a single editor page rather than a
  list: no create action, no "no checks yet" empty state.

  The five sections (The roll / Outcomes / Triggers / Modifiers / On failure), which of them
  render in which mode, the dot-and-count contract, the "switched off" predicate and the right
  rail's contents are all stated in `openspec/specs/ui-integration/spec.md` → "GM Checks Studio".
  The section dots and the rail badges the parent derives from the same pass are computed on the
  LIVE DRAFT, so a GM sees the consequence of an edit before saving; the enable gate is not, and
  the Validation route says so.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../EmptyState.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import RadioCardGroup from '../../../components/RadioCardGroup.svelte';
  import ToggleCard from '../../../components/ToggleCard.svelte';
  import CheckFailurePolicy from './CheckFailurePolicy.svelte';
  import ChecksEditorTabs from './ChecksEditorTabs.svelte';
  import ChecksRightMenu from './ChecksRightMenu.svelte';
  import CraftingCheckEditor from './CraftingCheckEditor.svelte';
  import SimpleCraftingCheckEditor from './SimpleCraftingCheckEditor.svelte';
  import ProgressiveCraftingCheckEditor from './ProgressiveCraftingCheckEditor.svelte';
  import CraftingModifierCatalogueCard from './CraftingModifierCatalogueCard.svelte';
  import ChecksValidationTab from './ChecksValidationTab.svelte';
  import {
    CHECK_SECTION_IDS,
    evaluateCheckReadiness,
    readinessModeForSlot,
    sectionForIssue,
  } from './checksReadiness.js';
  import Callout from '../Callout.svelte';
  import CheckModeCallout from './CheckModeCallout.svelte';
  import { focusValidationTarget } from '../validationFocus.js';
  import { announceValidationOutcome } from '../validationAnnouncement.js';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { checkIssueCopy, interpolate } from './checksCopy.js';
  import {
    buildCheckModifierContext,
    resolveActiveCraftingCheckFormula,
    resolveActiveGatheringCheckFormula,
    resolveActiveSalvageCheckFormula,
    resolveEligibleModifierIds,
    resolveModifierPolicy,
  } from '../../../../../systems/checkModifierResolver.js';
  import {
    DEFAULT_RECORD_ID,
    NO_ACTOR_ID,
    buildPreviewCheckArgs,
    buildPreviewRecords,
    listPreviewActors,
    resolvePreviewActor,
    runCheckPreview,
    terseBreakdown,
  } from './checkPreview.js';
  import {
    describeFormulaEnumerability,
    enumeratePassFailOdds,
    enumerateProgressiveOdds,
    enumerateRoutedOdds,
    SANDBOX_ABSENT,
  } from './checkOdds.js';
  import {
    formatPreviewDifficulties,
    parsePreviewDifficulties,
  } from '../../../../../systems/progressiveCheckSandbox.js';

  // `resolutionMode` selects which crafting check editor renders, and the three `craftingCheck*`
  // props are the drafts the manager root owns. Salvage drives the same editors.
  let {
    // Which activity route is open. Owned by the router, never by this component.
    activity = 'crafting',
    resolutionMode = 'simple',
    alchemyCheckMode = 'none',
    craftingCheck = null,
    craftingCheckSimple = null,
    craftingCheckProgressive = null,
    // The system-level `craftingCheck.consumption` block. Alchemy resolves consumption through
    // its own `consumeOnFail` flag, so these toggles are hidden there.
    craftingConsumption = null,
    // Salvage's OWN failure consumption. Both defaults are traps, so the store projects them
    // explicitly rather than letting this component re-derive them.
    salvageConsumption = null,
    // The FAILURE-RESULT POLICY per activity, the orthogonal produce axis to the consumption
    // toggles, read from the PERSISTED system because it live-persists on select.
    craftingFailureResultPolicy = 'perRecord',
    salvageFailureResultPolicy = 'perRecord',
    gatheringFailureResultPolicy = 'perRecord',
    // The gathering row the rail's `PREVIEW AS` selector has chosen, or `null`. The On-failure
    // section cross-references THAT row's `task.failureOutcome` read-only, this screen being
    // system-level; with no selection it renders its stated no-record state.
    previewedGatheringTask = null,
    onOpenGatheringTask = () => {},
    // The ONE system-level modifier library, rendered READ-ONLY for every activity and linked to
    // the one surface that authors it, System settings > Modifiers. Checks owns the SELECTION.
    modifiers = [],
    // Crafting's own SELECTION over that catalogue, persisted live and rendered for every mode
    // including the ones where the catalogue reaches no roll, which `inertCause` reports.
    craftingDefaultModifierPolicy = 'addAll',
    craftingDefaultModifierIds = [],
    // The cap on how many modifiers a selecting rule may pick. `null`, NOT a number: absence is
    // the "unlimited" value, and a numeric default would impose a bound nobody authored.
    craftingMaxModifierPicks = null,
    // The same triple for salvage and for gathering.
    salvageDefaultModifierPolicy = 'addAll',
    salvageDefaultModifierIds = [],
    salvageMaxModifierPicks = null,
    gatheringDefaultModifierPolicy = 'addAll',
    gatheringDefaultModifierIds = [],
    gatheringMaxModifierPicks = null,
    // The three system-level alchemy flags the engine honours, as live-persisting toggles.
    // Defaults mirror the manager normalizer (all three ON).
    alchemyLearnOnCraft = true,
    alchemyConsumeOnFail = true,
    alchemyShowAttemptHistory = true,
    salvageResolutionMode = 'simple',
    salvageCheckSimple = null,
    salvageCheckRouted = null,
    salvageCheckProgressive = null,
    gatheringResolutionMode = 'd100',
    gatheringCheckProgressive = null,
    gatheringCheckRouted = null,
    // Tool-breakage authority: every editor shows the unified CheckTriggers editor, and
    // `checkDriven` additionally exposes the per-trigger break-tools toggle.
    breakageAuthority = 'toolSpecific',
    // Feature flags: salvage is always on, gathering only when `features.gathering === true`.
    features = {},
    activation = {},
    // The draft model lives ABOVE the route: the root owns one dirty set across the four
    // activities and one plural Save, and these two reflect it read-only.
    dirty = false,
    dirtyActivities = [],
    onUpdateCraftingCheck = () => {},
    onUpdateCraftingCheckSimple = () => {},
    onUpdateCraftingCheckProgressive = () => {},
    onUpdateSalvageCheckSimple = () => {},
    onUpdateSalvageCheckRouted = () => {},
    onUpdateSalvageCheckProgressive = () => {},
    onUpdateGatheringCheckProgressive = () => {},
    onUpdateGatheringCheckRouted = () => {},
    onSetAlchemyCheckMode = () => {},
    onUpdateCraftingConsumption = () => {},
    onUpdateSalvageConsumption = () => {},
    onUpdateCraftingFailureResultPolicy = () => {},
    onUpdateSalvageFailureResultPolicy = () => {},
    onUpdateGatheringFailureResultPolicy = () => {},
    onUpdateCraftingCheckModifiers = () => {},
    onUpdateSalvageCheckModifiers = () => {},
    onUpdateGatheringCheckModifiers = () => {},
    onUpdateAlchemyFlags = () => {},
    // A section the ROUTER wants opened: it has to travel WITH the route rather than be set on
    // a component instance the router is about to hand a different `activity`.
    requestedSection = '',
    // The IDENTITY of that request. A router request is an EVENT and needs a serial number:
    // latching on the section VALUE swallows a repeat of it.
    requestedSectionNonce = 0,
    // Route to another activity, for the catalogue link and the Validation deep links.
    foundrySystemId = '',
    onOpenActivity = () => {},
    // Navigate to the system editor's Modifiers section, the one surface authoring the library.
    onOpenModifierLibrary = () => {},
    onToggleCheckActive = () => {},
  } = $props();

  function text(key, fallback, data) {
    const translated = localize(key, data);
    return translated && translated !== key ? translated : fallback;
  }

  /** The Validation route's own sentence for a readiness issue — the same one, not a copy. */
  function issueSentence(id, data) {
    const copy = checkIssueCopy(id);
    return interpolate(text(copy.key, copy.fallback, data), data);
  }

  // The alchemy check-mode selector, at the TOP of the crafting route's roll section. Selecting
  // a mode STAGES it on the root's draft and swaps the editor below.
  //
  // "NO CHECK" IS NOT A MODE HERE: the persisted enum still carries `none`, but offering it as a
  // third radio made the on/off decision and the shape decision one control. Off is the switch.
  const ALCHEMY_CHECK_MODE_OPTIONS = [
    {
      value: 'simple',
      icon: 'fas fa-dice-d20',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimple',
      fallback: 'Simple check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimpleDesc',
      descFallback:
        'A pass/fail check you can switch off. On a pass the success result set is produced; on a fail the reserved failure result set is.',
    },
    {
      value: 'tiered',
      icon: 'fas fa-stairs',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTiered',
      fallback: 'Tiered check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTieredDesc',
      descFallback:
        'A mandatory routed check. Each success outcome tier routes to its assigned result set, exactly like routed-by-check.',
    },
  ];

  // Failure consumption toggle states, read with the manager normalizer's own defaults —
  // `consumeIngredientsOnFail` ON, `breakToolsOnFail` OFF — so an authored OFF is not inverted.
  const consumeIngredientsOnFail = $derived(
    craftingConsumption?.consumeIngredientsOnFail !== false
  );
  const breakToolsOnFail = $derived(craftingConsumption?.breakToolsOnFail === true);

  // Salvage's own pair, read with the SALVAGE normalizer's defaults and key names: getting the
  // first wrong INVERTS an authored OFF rather than merely losing it.
  const consumeComponentOnFail = $derived(salvageConsumption?.consumeComponentOnFail !== false);
  const salvageBreakToolsOnFail = $derived(salvageConsumption?.breakToolsOnFail === true);

  // Only `routedByCheck` uses the tier-routing editor. Alchemy has a dedicated FIRST branch in
  // the crafting render, so `craftingAlchemy` wins before these two can match — but they still
  // INCLUDE the alchemy cases, so `validationSections` picks the right draft. Do not tighten
  // them without re-checking that.
  const craftingAlchemy = $derived(resolutionMode === 'alchemy');
  const craftingRouted = $derived(
    resolutionMode === 'routedByCheck' || (craftingAlchemy && alchemyCheckMode === 'tiered')
  );
  const craftingSimple = $derived(
    resolutionMode === 'simple' ||
      resolutionMode === 'routedByIngredients' ||
      (craftingAlchemy && alchemyCheckMode === 'simple')
  );
  const craftingProgressive = $derived(resolutionMode === 'progressive');

  // Which crafting check this mode actually rolls, and whether it carries an authored formula.
  // Resolved through the shared five-mode selector rather than a local ternary, a copy of which
  // had no case for alchemy `none` and reported a slot formula the mode never reaches. Fed from
  // the DRAFTS, because the GM is editing those formulas on this very route.
  const activeCraftingCheck = $derived(
    resolveActiveCraftingCheckFormula({
      resolutionMode,
      alchemy: { checkMode: alchemyCheckMode },
      craftingCheck: {
        simple: craftingCheckSimple,
        routed: craftingCheck,
        progressive: craftingCheckProgressive,
      },
    })
  );

  // The TWO reasons a catalogue reaches no roll, in the order they become answerable: no check,
  // then no formula. A guard chain rather than nested ternaries, and the ORDER is the point. It
  // reads the DRAFT; the store's projection reads the PERSISTED system, and both must exist.
  function inertCauseFor(active) {
    if (!active.slot) return 'noCheck';
    if (!active.checkUsable) return 'noFormula';
    return '';
  }

  const craftingModifierInertCause = $derived(inertCauseFor(activeCraftingCheck));

  // The same derivation for the other two activities: all three return one shape.
  const activeSalvageCheck = $derived(
    resolveActiveSalvageCheckFormula({
      salvageResolutionMode,
      salvageCraftingCheck: {
        simple: salvageCheckSimple,
        routed: salvageCheckRouted,
        progressive: salvageCheckProgressive,
      },
    })
  );
  const salvageModifierInertCause = $derived(inertCauseFor(activeSalvageCheck));

  const activeGatheringCheck = $derived(
    resolveActiveGatheringCheckFormula(
      {
        gatheringCraftingCheck: {
          progressive: gatheringCheckProgressive,
          routed: gatheringCheckRouted,
        },
      },
      gatheringResolutionMode
    )
  );
  // Gathering's d100 mode is NOT a `noCheck`: the d100 against each drop's chance IS that mode's
  // check, with no seam to add modifiers to, so it gets its own cause.
  const gatheringModifierInertCause = $derived(
    gatheringResolutionMode === 'd100' ? 'noModifierSupport' : inertCauseFor(activeGatheringCheck)
  );

  // The one bag the readiness evaluator resolves eligibility through, from the SAME builder the
  // engine uses. The subject is `null`: this route validates the SYSTEM's selection.
  const draftSystem = $derived({
    modifiers,
    craftingCheck: {
      defaultModifierPolicy: craftingDefaultModifierPolicy,
      defaultModifierIds: craftingDefaultModifierIds,
      maxModifierPicks: craftingMaxModifierPicks,
    },
    salvageCraftingCheck: {
      defaultModifierPolicy: salvageDefaultModifierPolicy,
      defaultModifierIds: salvageDefaultModifierIds,
      maxModifierPicks: salvageMaxModifierPicks,
    },
    gatheringCraftingCheck: {
      defaultModifierPolicy: gatheringDefaultModifierPolicy,
      defaultModifierIds: gatheringDefaultModifierIds,
      maxModifierPicks: gatheringMaxModifierPicks,
    },
  });

  const salvageRouted = $derived(salvageResolutionMode === 'routed');
  const salvageProgressive = $derived(salvageResolutionMode === 'progressive');
  const salvageSimple = $derived(
    salvageResolutionMode === 'simple' || salvageResolutionMode === 'alchemy'
  );
  // The gathering check's shape is the economy's resolution mode: d100 is the fixed roll,
  // read-only, and progressive/routed are editable.
  const gatheringD100 = $derived(gatheringResolutionMode === 'd100');
  const gatheringProgressive = $derived(gatheringResolutionMode === 'progressive');
  const gatheringRouted = $derived(gatheringResolutionMode === 'routed');

  // Optional features, and the rail already drops their children, so this route answers only
  // for the Validation summary. Salvage defaults on, gathering off.
  const salvageEnabled = $derived(features?.salvage !== false);
  const gatheringEnabled = $derived(features?.gathering === true);

  // Crafting honours the system breakage authority; salvage and gathering do so only under
  // their feature flag, and otherwise stay `toolSpecific`.
  const craftingBreakageAuthority = $derived(breakageAuthority);
  const salvageBreakageAuthority = $derived(salvageEnabled ? breakageAuthority : 'toolSpecific');
  const gatheringBreakageAuthority = $derived(
    features?.gathering === true ? breakageAuthority : 'toolSpecific'
  );

  const PAGES = {
    crafting: {
      title: text('FABRICATE.Admin.Manager.Checks.Crafting.PageTitle', 'Crafting check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.PageLead',
        "A system has a single crafting check. Its shape is determined by the system's resolution mode and preserved when you switch modes."
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Crafting.ConfigHint',
        'Roll, difficulty, and outcome settings for the crafting check will appear here.'
      ),
    },
    salvage: {
      title: text('FABRICATE.Admin.Manager.Checks.Salvage.PageTitle', 'Salvage check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.PageLead',
        "A system has a single salvage check. Its shape is determined by the system's salvage resolution mode and preserved when you switch modes."
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Salvage.ConfigHint',
        'Roll, difficulty, and outcome settings for the salvage check will appear here.'
      ),
    },
    gathering: {
      title: text('FABRICATE.Admin.Manager.Checks.Gathering.PageTitle', 'Gathering check'),
      lead: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.PageLead',
        'A system has a single gathering check. In d100 mode it is the fixed d100 roll and is not editable; progressive and routed modes let you define it. Per-task tuning adjusts the difficulty, not the roll.'
      ),
      configHint: text(
        'FABRICATE.Admin.Manager.Checks.Gathering.ConfigHint',
        'Roll, difficulty, and outcome settings for the gathering check will appear here.'
      ),
    },
  };

  // The AUTHORED mode, for the "does not apply in {mode} mode" copy and the Validation rail's
  // rows — deliberately NOT the readiness mode, which collapses every no-check mode to `none`
  // and would name a mode no economy editor offers.
  //
  // IT IS LOCALIZED, through the SAME strings the rest of the manager uses: the authored token
  // is an internal identifier and the three subsystems spell one concept three ways, so printing
  // it raw put two camelCase tokens for one mode in one rail card.
  const SUBSYSTEM_MODE_LABELS = {
    crafting: {
      simple: ['FABRICATE.Admin.SystemSettings.ResolutionSimple', 'Simple'],
      routedByIngredients: [
        'FABRICATE.Admin.Manager.ResolutionRoutedByIngredients',
        'Routed by ingredients',
      ],
      routedByCheck: ['FABRICATE.Admin.Manager.ResolutionRoutedByCheck', 'Routed by check'],
      progressive: ['FABRICATE.Admin.SystemSettings.ResolutionProgressive', 'Progressive'],
      alchemy: ['FABRICATE.Admin.SystemSettings.ResolutionAlchemy', 'Alchemy'],
    },
    // Alchemy's row names the ALCHEMY CHECK MODE, the choice deciding what alchemy rolls.
    alchemy: {
      none: ['FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNone', 'No check'],
      simple: ['FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimple', 'Simple check'],
      tiered: ['FABRICATE.Admin.SystemSettings.Alchemy.CheckModeTiered', 'Tiered check'],
    },
    salvage: {
      simple: ['FABRICATE.Admin.SystemSettings.SalvageResolutionSimple', 'Simple'],
      progressive: ['FABRICATE.Admin.SystemSettings.SalvageResolutionProgressive', 'Progressive'],
      routed: ['FABRICATE.Admin.SystemSettings.SalvageResolutionRouted', 'Routed by check'],
    },
    gathering: {
      d100: ['FABRICATE.Admin.Manager.Economy.Resolution.D100', 'd100 roll'],
      progressive: ['FABRICATE.Admin.Manager.Economy.Resolution.Progressive', 'Progressive'],
      routed: ['FABRICATE.Admin.Manager.Economy.Resolution.Routed', 'Routed by check'],
    },
  };

  /** The GM-facing name of an authored mode. An unmapped token falls back to the token itself,
   *  so a mode added to a picker without a row here reads as unfinished, not as another mode. */
  function subsystemModeLabel(vocabulary, mode) {
    const entry = SUBSYSTEM_MODE_LABELS[vocabulary]?.[mode];
    return entry ? text(entry[0], entry[1]) : String(mode || '');
  }

  // One group per in-play subsystem, against its own draft and mode. Salvage is omitted when its
  // feature is off; GATHERING IS NOT OMITTED UNDER d100, validating a selection that reaches no
  // roll being the one owned path for reporting that.
  const validationSections = $derived.by(() => {
    const list = [
      {
        subsystem: 'crafting',
        // THE SLOT, not the resolution mode: `resolveActiveCraftingCheckFormula` chooses both
        // the check handed over and the rules it is evaluated under.
        mode: readinessModeForSlot(activeCraftingCheck.slot),
        // What the GM SELECTED, for display, in the mode picker's OWN words — a different
        // vocabulary from the readiness mode, which would name a mode no editor offers.
        authoredMode: craftingAlchemy
          ? subsystemModeLabel('alchemy', alchemyCheckMode)
          : subsystemModeLabel('crafting', resolutionMode),
        check: craftingRouted
          ? craftingCheck
          : craftingProgressive
            ? craftingCheckProgressive
            : craftingCheckSimple,
        modifierContext: buildCheckModifierContext(draftSystem, 'crafting', null),
      },
    ];
    if (salvageEnabled) {
      list.push({
        subsystem: 'salvage',
        mode: readinessModeForSlot(activeSalvageCheck.slot),
        authoredMode: subsystemModeLabel('salvage', salvageResolutionMode),
        check: salvageRouted
          ? salvageCheckRouted
          : salvageProgressive
            ? salvageCheckProgressive
            : salvageCheckSimple,
        modifierContext: buildCheckModifierContext(draftSystem, 'salvage', null),
      });
    }
    if (gatheringEnabled) {
      list.push({
        subsystem: 'gathering',
        mode: readinessModeForSlot(activeGatheringCheck.slot),
        authoredMode: subsystemModeLabel('gathering', gatheringResolutionMode),
        check: gatheringProgressive ? gatheringCheckProgressive : gatheringCheckRouted,
        modifierContext: buildCheckModifierContext(draftSystem, 'gathering', null),
      });
    }
    return list;
  });

  // THE SECTION STRIP. Membership, counts and dots all derive from the SAME readiness pass the
  // rail badge and the Validation route read, so the three cannot disagree.
  const SECTION_META = {
    roll: { icon: 'fas fa-dice-d20', labelKey: 'Roll', labelFallback: 'The roll' },
    outcomes: { icon: 'fas fa-code-branch', labelKey: 'Outcomes', labelFallback: 'Outcomes' },
    triggers: { icon: 'fas fa-bolt', labelKey: 'Triggers', labelFallback: 'Triggers' },
    modifiers: { icon: 'fas fa-user-group', labelKey: 'Modifiers', labelFallback: 'Modifiers' },
    'on-failure': {
      icon: 'fas fa-heart-crack',
      labelKey: 'OnFailure',
      labelFallback: 'On failure',
    },
  };

  const activeActivity = $derived(validationSections.find((row) => row.subsystem === activity));
  const activeCheck = $derived(activeActivity?.check || null);
  const activeMode = $derived(activeActivity?.mode || '');

  const activeReadiness = $derived(
    activeActivity
      ? evaluateCheckReadiness(activeCheck || {}, {
          mode: activeMode,
          modifierContext: activeActivity.modifierContext,
          activity: activeActivity.subsystem,
        })
      : { checks: [], issues: [] }
  );

  const issuesBySection = $derived.by(() => {
    const tally = Object.fromEntries(CHECK_SECTION_IDS.map((id) => [id, 0]));
    for (const issue of activeReadiness.issues) {
      const section = sectionForIssue(issue.id);
      if (section) tally[section] += 1;
    }
    return tally;
  });

  // What each activity ROLLS, per its own mode.
  const routeIsRouted = $derived(
    (activity === 'crafting' && craftingRouted) ||
      (activity === 'salvage' && salvageRouted) ||
      (activity === 'gathering' && gatheringRouted)
  );
  // GATHERING `d100` IS THE ONLY INERT ROUTE: alchemy `none` is the OFF state of an optional
  // check rather than a mode, so it belongs to `routeIsOff` below, which offers the way back.
  const routeIsInert = $derived(activity === 'gathering' && gatheringD100);
  // The check-OFF state, distinct from INERT: inert is what the MODE does, off is what the GM
  // chose. The predicate is stated per activity rather than inferred from `optional` alone —
  // `openspec/specs/ui-integration/spec.md` → "GM Checks Studio" says why.
  const routeIsOff = $derived.by(() => {
    // ALCHEMY ANSWERS FROM ITS OWN MODE, BEFORE THE ACTIVATION BAG: `activation` defaults to
    // `{}`, and with no crafting state the checks below return false, which dropped an alchemy
    // `none` mount into the mode branch with no option selected and no editor at all.
    if (activity === 'crafting' && craftingAlchemy && alchemyCheckMode === 'none') return true;
    const state = activation?.[activity];
    if (!state || state.enabled === true) return false;
    if (activity === 'gathering') return state.mode !== 'd100';
    return state.optional === true;
  });

  const outcomeCount = $derived.by(() => {
    if (!routeIsRouted || !activeCheck) return null;
    const key = activeCheck.type === 'fixed' ? 'fixedOutcomes' : 'relativeOutcomes';
    return Array.isArray(activeCheck[key]) ? activeCheck[key].length : 0;
  });
  const triggerCount = $derived.by(() => {
    if (routeIsInert || !activeCheck) return null;
    const triggers = activeCheck?.checkBreakage?.triggers;
    return Array.isArray(triggers) ? triggers.length : 0;
  });
  const modifierCount = $derived(
    activeActivity ? resolveEligibleModifierIds(activeActivity.modifierContext).length : null
  );

  const sections = $derived.by(() => {
    if (activity === 'validation') return [];
    const counts = {
      roll: null,
      outcomes: outcomeCount,
      triggers: triggerCount,
      modifiers: modifierCount,
      'on-failure': null,
    };
    // An OFF check collapses to ONE section: four sections of empty states is not information.
    const ids = routeIsOff ? ['roll'] : CHECK_SECTION_IDS;
    return ids.map((id) => ({
      id,
      icon: SECTION_META[id].icon,
      labelKey: `FABRICATE.Admin.Manager.Checks.Sections.${SECTION_META[id].labelKey}`,
      labelFallback: SECTION_META[id].labelFallback,
      count: counts[id],
      issues: routeIsOff ? 0 : issuesBySection[id],
    }));
  });

  let activeSection = $state('roll');
  // The last router request honoured, latched by NONCE. Some latch is required or the effect
  // below drags the strip back the instant the GM clicks anything else; latching on the VALUE is
  // the mirror defect. `-1` rather than `0`, so a first request carrying nonce 0 still lands.
  let adoptedSectionNonce = $state(-1);
  // A section the current route does not render must not stay selected. A NEW router request
  // wins where the route offers it, which carries a Validation deep link across its own route
  // change.
  $effect(() => {
    if (activity === 'validation') return;
    if (
      requestedSection &&
      requestedSectionNonce !== adoptedSectionNonce &&
      sections.some((section) => section.id === requestedSection)
    ) {
      adoptedSectionNonce = requestedSectionNonce;
      activeSection = requestedSection;
      return;
    }
    if (!sections.some((section) => section.id === activeSection)) activeSection = 'roll';
  });

  // The Validation rail's "All checks" card: one row per in-play activity, from the SAME pass
  // the route's groups use, so the rail and the list beside it cannot disagree.
  const SUBSYSTEM_ICONS = {
    crafting: 'fas fa-hammer',
    salvage: 'fas fa-recycle',
    gathering: 'fas fa-seedling',
  };
  const allChecksSummary = $derived(
    validationSections.map((row) => {
      const readiness = evaluateCheckReadiness(row.check || {}, {
        mode: row.mode,
        modifierContext: row.modifierContext,
        activity: row.subsystem,
      });
      const label = text(
        `FABRICATE.Admin.Manager.Checks.Tabs.${row.subsystem[0].toUpperCase()}${row.subsystem.slice(1)}`,
        row.subsystem
      );
      const state =
        readiness.issues.length === 0
          ? text('FABRICATE.Admin.Manager.Checks.Validation.RailClean', 'Clean')
          : text(
              'FABRICATE.Admin.Manager.Checks.Validation.RailIssues',
              '{count} to review'
            ).replace('{count}', String(readiness.issues.length));
      return {
        id: row.subsystem,
        icon: SUBSYSTEM_ICONS[row.subsystem] || 'fas fa-dice-d20',
        label: `${label} · ${state}`,
        detail: [row.authoredMode, row.check?.rollFormula || ''].filter(Boolean).join(' · '),
      };
    })
  );

  // THE VALIDATION ROW ACTION. This studio's own root, so `focusValidationTarget` resolves a
  // `data-validation-target` inside THIS route rather than anywhere in the manager window.
  let checksRoot = $state(null);

  // WHAT THE LIVE REGION SAYS: the ACTION'S OUTCOME, not a count — a row action changes no
  // tally, so a count would recite an unchanged number.
  let issueAnnouncement = $state('');

  // The destination SECTION PANEL, the focus fallback for a route-only row — the majority path
  // here, most registered issues carrying no control address.
  let sectionPanel = $state(null);

  /** The activity's own name, from the rail's key, so one word is not spelt two ways. */
  function activityLabel(id) {
    const key = `FABRICATE.Admin.Manager.Checks.Tabs.${id[0].toUpperCase()}${id.slice(1)}`;
    return text(key, id);
  }

  /** The section's own name, from the strip's table for the same reason. */
  function sectionLabel(id) {
    const meta = SECTION_META[id];
    if (!meta) return '';
    return text(`FABRICATE.Admin.Manager.Checks.Sections.${meta.labelKey}`, meta.labelFallback);
  }

  /**
   * Deep-link from the Validation route to the control that raised an issue: open the ACTIVITY
   * and the SECTION owning the gap, THEN move focus to the offending control.
   *
   * THE ORDER IS THE MECHANISM. `onOpenActivity` is the router's own synchronous state write, so
   * the destination panel exists by the time the focus helper's `queueMicrotask` runs its query.
   * Everything after that belongs to `validationAnnouncement.js`, for all five hosts.
   *
   * A ROUTE-ONLY ROW IS NORMAL HERE, so the helper resolves `null` and the SECTION PANEL takes
   * the keyboard. Leaving focus where it was is not the alternative: the row's button is
   * unmounted by the route change, so focus would fall to `<body>`.
   *
   * @param {{activity?: string, section?: string}} target the ROUTE the row carries.
   * @param {string} [focusTarget] the CONTROL's `data-validation-target` value, if it named one.
   */
  function selectIssue(target, focusTarget) {
    if (!target?.activity) return;
    const section = target.section || 'roll';
    onOpenActivity(target.activity, section);
    announceValidationOutcome({
      root: checksRoot,
      routeLabel: [activityLabel(target.activity), sectionLabel(section)]
        .filter(Boolean)
        .join(' — '),
      focus: () => focusValidationTarget(checksRoot, focusTarget),
      fallbackPanel: sectionPanel,
      announce: (sentence) => {
        issueAnnouncement = sentence;
      },
    });
  }

  const configTitle = text('FABRICATE.Admin.Manager.Checks.Configuration', 'Configuration');
  const pageKicker = text('FABRICATE.Admin.Manager.Checks.PageKicker', 'One per system');
  const page = $derived(PAGES[activity] || PAGES.crafting);

  const routeModeLabel = $derived.by(() => {
    if (activity === 'salvage') return subsystemModeLabel('salvage', salvageResolutionMode);
    if (activity === 'gathering') return subsystemModeLabel('gathering', gatheringResolutionMode);
    if (craftingAlchemy) return subsystemModeLabel('alchemy', alchemyCheckMode);
    return subsystemModeLabel('crafting', resolutionMode);
  });
  const modeLabel = $derived(routeModeLabel || subsystemModeLabel('crafting', resolutionMode));

  // THE SECTION-LEVEL CALLOUT and THE PANE HEADING, both required by
  // `openspec/specs/ui-integration/spec.md` → "GM Checks Studio". The callout reads the SAME
  // `activeReadiness` pass the strip's dot is counted from and renders the SAME exported copy
  // the Validation route renders, so the two cannot describe one issue differently. The pane
  // heading is keyed on the SECTION, the activity already being named by the rail, the
  // breadcrumb and the route title; the Outcomes sentence varies with the mode.
  const outcomesLead = $derived.by(() => {
    if (routeIsRouted)
      return text(
        'FABRICATE.Admin.Manager.Checks.Sections.OutcomesLeadRouted',
        'What each result of the roll produces. A record binds its result groups to the tiers set here.'
      );
    if (activeMode === 'progressive')
      return text(
        'FABRICATE.Admin.Manager.Checks.Sections.OutcomesLeadProgressive',
        'How the rolled value is spent down an ordered list of results.'
      );
    return text(
      'FABRICATE.Admin.Manager.Checks.Sections.OutcomesLeadSimple',
      'A simple check has exactly two outcomes.'
    );
  });

  const paneHead = $derived.by(() => {
    if (activity === 'validation') return null;
    const HEADS = {
      roll: [
        text('FABRICATE.Admin.Manager.Checks.Sections.Roll', 'The roll'),
        text(
          'FABRICATE.Admin.Manager.Checks.Sections.RollLead',
          'How this system turns an attempt into a result — the formula that is rolled and the difficulty it is measured against. Any modifier set on the Modifiers section is added to this roll automatically; it does not appear in the formula.'
        ),
      ],
      outcomes: [
        text('FABRICATE.Admin.Manager.Checks.Sections.Outcomes', 'Outcomes'),
        outcomesLead,
      ],
      triggers: [
        text('FABRICATE.Admin.Manager.Checks.Sections.Triggers', 'Triggers'),
        text(
          'FABRICATE.Admin.Manager.Checks.Sections.TriggersLead',
          'Conditions that override what the roll would otherwise produce. Each one watches a die group, the roll total or the applied modifier.'
        ),
      ],
      modifiers: [
        text('FABRICATE.Admin.Manager.Checks.Sections.Modifiers', 'Modifiers'),
        text(
          'FABRICATE.Admin.Manager.Checks.Sections.ModifiersLead',
          'Named character values that are added to the roll automatically, whenever the crafter has them. Nothing needs to be written into the formula.'
        ),
      ],
      'on-failure': [
        text('FABRICATE.Admin.Manager.Checks.Sections.OnFailure', 'On failure'),
        text(
          'FABRICATE.Admin.Manager.Checks.Sections.OnFailureLead',
          'What a failed check costs the character.'
        ),
      ],
    };
    const entry = HEADS[activeSection];
    return entry ? { title: entry[0], lead: entry[1] } : null;
  });

  // WHAT THE FORMULA CARD'S `WHAT ACTUALLY GETS ROLLED` INSET RESTATES. Check modifiers are
  // added to the roll automatically and never appear in the formula text, so the field a GM
  // types into is not the expression the engine rolls. Fed from the SAME
  // `resolveEligibleModifierIds` pass the section strip counts `Modifiers` from.
  //
  // IT MAPS TO THE VIEW SHAPE, and that is the contract. `CheckFormulaFields` takes
  // `[{ id, name, icon }]` where a persistence entry carries `label`, so handing the raw entries
  // through rendered `undefined` into every chip's span — three chips whose whole contribution
  // was an `aria-hidden` glyph, with no accessible name at all. Mapped HERE rather than by
  // reading `label` in the component, because the component is presentational and its prop is
  // the seam. The `|| entry.id` fallback is the catalogue card's own: a label is optional in the
  // persisted shape, so a chip must still name something.
  const appliedModifiers = $derived.by(() => {
    const context = activeActivity?.modifierContext;
    if (!context) return [];
    const eligible = new Set(resolveEligibleModifierIds(context));
    return (Array.isArray(context.catalogue) ? context.catalogue : [])
      .filter((entry) => eligible.has(entry?.id))
      .map((entry) => ({ id: entry.id, name: entry.label || entry.id, icon: entry.icon || '' }));
  });
  const appliedModifierPolicy = $derived(
    activeActivity ? resolveModifierPolicy(activeActivity.modifierContext) : 'addAll'
  );

  // THE RECORD NOUN: what this activity rolls a check FOR, in the activity's own word.
  // Hard-coding one activity's noun is how a gathering screen comes to talk about recipes, and
  // it is localized rather than derived from the route id, because a noun is copy.
  const RECORD_NOUNS = {
    crafting: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Crafting', 'recipe'],
    salvage: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Salvage', 'salvageable item'],
    gathering: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Gathering', 'gathering task'],
  };
  const recordNoun = $derived.by(() => {
    const entry = RECORD_NOUNS[activity] || RECORD_NOUNS.crafting;
    return text(entry[0], entry[1]);
  });

  // The PLURAL of the same noun, sentence-initial: the `always` card's clause begins a
  // sentence, and the three activities do not pluralize alike.
  const RECORD_NOUNS_PLURAL = {
    crafting: ['FABRICATE.Admin.Manager.Checks.RecordNoun.CraftingPlural', 'Recipes'],
    salvage: ['FABRICATE.Admin.Manager.Checks.RecordNoun.SalvagePlural', 'Salvageable items'],
    gathering: ['FABRICATE.Admin.Manager.Checks.RecordNoun.GatheringPlural', 'Gathering tasks'],
  };
  const recordNounPlural = $derived.by(() => {
    const entry = RECORD_NOUNS_PLURAL[activity] || RECORD_NOUNS_PLURAL.crafting;
    return text(entry[0], entry[1]);
  });

  // WHERE THE POLICY HAS NO REACH, and why: neither `routedByIngredients` nor `progressive` has
  // an outcome tier or a reserved failure group to mark, so a stated reason renders rather than
  // a control that silently does nothing.
  const failurePolicyInertNote = $derived.by(() => {
    if (activity === 'gathering') {
      return gatheringD100
        ? text(
            'FABRICATE.Admin.Manager.Checks.FailureResults.InertGatheringD100',
            'The d100 gathering roll has no failure outcome to produce — and routed and progressive gathering are not available yet. This setting is kept and takes effect when they are.'
          )
        : '';
    }
    if (activity === 'crafting' && resolutionMode === 'routedByIngredients') {
      return text(
        'FABRICATE.Admin.Manager.Checks.FailureResults.InertRoutedByIngredients',
        'In routed-by-ingredients mode the check has no outcome tiers to mark as failures, so nothing here can be produced on a failed check. This setting is kept, and applies again if you switch to a mode that has them.'
      );
    }
    const progressive =
      (activity === 'crafting' && craftingProgressive) ||
      (activity === 'salvage' && salvageProgressive);
    return progressive
      ? text(
          'FABRICATE.Admin.Manager.Checks.FailureResults.InertProgressive',
          'A progressive check spends its rolled value down one ordered list of results, so it has no failure outcome to produce. This setting is kept, and applies again if you switch to a mode that has one.'
        )
      : '';
  });

  // THE ROLL SECTION'S MODE CALLOUT: the AUTHORED mode in that activity's own vocabulary, for
  // the reason `routeModeLabel` gives, and on `roll` alone, because it is about A ROLL.
  const calloutMode = $derived.by(() => {
    if (activity === 'salvage') return salvageResolutionMode;
    if (activity === 'gathering') return gatheringResolutionMode;
    return resolutionMode;
  });

  const activeSectionIssues = $derived(
    activeReadiness.issues
      .filter((issue) => sectionForIssue(issue.id) === activeSection)
      .map((issue) => ({
        id: issue.id,
        tone: issue.severity === 'critical' ? 'warning' : 'info',
        text: issueSentence(issue.id, issue.data),
      }))
  );

  // THE SIMULATOR, THE ODDS HISTOGRAM AND THE PREVIEWED RECORD — ONE selection, three readers,
  // so it lives HERE. Two components holding their own copy is how two surfaces come to
  // disagree about which record is being previewed.
  let previewActorId = $state(NO_ACTOR_ID);
  let previewRecordId = $state(DEFAULT_RECORD_ID);
  let previewResult = $state(null);
  let previewRolling = $state(false);

  const dcWord = text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC');
  const unroutedLabel = text('FABRICATE.Admin.Manager.Checks.Odds.Unrouted', 'No outcome');

  const previewActors = $derived(activity === 'validation' ? [] : listPreviewActors());
  const previewActor = $derived(resolvePreviewActor(previewActorId));

  // THE PROGRESSIVE PREVIEW SANDBOX: a progressive histogram cannot be drawn without an ORDERED
  // list of result difficulties, and that list is SANDBOX STATE ON THE CHECK rather than a
  // record's, this screen previewing what a CHECK does. Read from the live DRAFT and written
  // back through the usual update callback; nothing else reads it and the exporter strips it.
  const isProgressive = $derived(activeMode === 'progressive');
  const previewDifficulties = $derived(
    isProgressive && Array.isArray(activeCheck?.preview?.difficulties)
      ? activeCheck.preview.difficulties
      : []
  );
  const previewDifficultiesText = $derived(formatPreviewDifficulties(previewDifficulties));

  /** Which progressive draft this route's sandbox edit belongs to. */
  const PROGRESSIVE_UPDATERS = {
    crafting: (next) => onUpdateCraftingCheckProgressive(next),
    salvage: (next) => onUpdateSalvageCheckProgressive(next),
    gathering: (next) => onUpdateGatheringCheckProgressive(next),
  };

  function updatePreviewDifficulties(raw) {
    if (!isProgressive || !activeCheck) return;
    const update = PROGRESSIVE_UPDATERS[activity];
    if (!update) return;
    update({ ...activeCheck, preview: { difficulties: parsePreviewDifficulties(raw) } });
  }

  // A progressive check has no DC, so labelling its records with one would invent a number.
  const recordsCarryDc = $derived(!isProgressive);
  const previewRecords = $derived(
    buildPreviewRecords({
      check: activeCheck,
      defaultLabel: text('FABRICATE.Admin.Manager.Checks.PreviewAs.DefaultRecord', 'Default'),
    }).map((record) => ({
      ...record,
      label: [record.name, recordsCarryDc ? `${dcWord} ${record.dc}` : '']
        .filter(Boolean)
        .join(' · '),
    }))
  );
  const previewRecord = $derived(
    previewRecords.find((record) => record.id === previewRecordId) ?? previewRecords[0] ?? null
  );

  const previewPlan = $derived(
    buildPreviewCheckArgs({
      activity,
      mode: activeMode,
      draft: activeCheck,
      system: draftSystem,
      subject: null,
      actor: previewActor,
      record: previewRecord,
    })
  );
  const previewFormula = $derived(String(previewPlan.formula ?? '').trim());
  // THE SAME CONTEXT THE RUNNER IS HANDED: it appends the resolved scalar itself, so a
  // histogram computed without this context describes a formula nothing rolls.
  const previewModifier = $derived(previewPlan.args?.craftingModifier ?? null);

  const enumeration = $derived(
    previewFormula === ''
      ? { enumerable: false, reason: 'no-dice' }
      : describeFormulaEnumerability(previewFormula, previewActor, {
          craftingModifier: previewModifier,
        })
  );
  // `resolved === false` is EXACTLY the unresolved-roll-data refusal, read from the same signal
  // the enumerability check reads first, so the two can never disagree.
  const previewResolved = $derived(enumeration.reason !== 'unresolved-roll-data');

  // The reachable total range the simple check's two-band strip is drawn across; null when the
  // formula is not enumerable, the editor falling back to a window around the DC.
  const previewTrack = $derived.by(() => {
    if (!enumeration.enumerable) return { min: null, max: null };
    // THE REACHABLE TOTALS, off the enumeration rather than recomputed from a remainder: a
    // bounded rolling modifier contributes a clamped die, so there is no single remainder.
    const totals = enumeration.outcomes.map((outcome) => outcome.total);
    return { min: Math.min(...totals), max: Math.max(...totals) };
  });

  /**
   * The odds view-model. Every branch either enumerates or states why it did not.
   *
   * @returns {object} The model `CheckOddsPanel` renders.
   */
  function buildOddsModel() {
    const kind = previewPlan.kind;
    if (!kind) return { kind: null };
    if (enumeration.enumerable !== true) {
      return { kind, enumerable: false, reason: enumeration.reason };
    }
    const { faces, combinations, outcomes } = enumeration;
    if (kind === 'routed') {
      const rows = enumerateRoutedOdds({ outcomes, args: previewPlan.args }).map((row) => ({
        id: row.id || 'unrouted',
        label: row.name || unroutedLabel,
        percent: row.percent,
        success: row.success,
      }));
      return { kind, enumerable: true, faces, combinations, rows };
    }
    if (kind === 'progressive') return buildProgressiveOdds(outcomes, faces, combinations);
    const rows = enumeratePassFailOdds({
      outcomes,
      args: {
        dc: previewPlan.dc,
        comparison: previewPlan.args.thresholdMode === 'exceed' ? 'exceed' : 'meet',
        triggers: previewPlan.args.triggers,
      },
    }).map((row) => ({
      id: row.id,
      label: row.success
        ? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')
        : text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure'),
      percent: row.percent,
      success: row.success,
    }));
    return { kind, enumerable: true, faces, combinations, rows };
  }

  /**
   * Progressive bucketing, by AWARD COUNT rather than by tier. An empty sandbox is a stated
   * absence with the control named, never an invented sample.
   *
   * @param {Array<object>} outcomes The enumerated outcome space.
   * @param {?number} faces The die's face count, for a single-die formula.
   * @param {number} combinations How many assignments the space holds.
   * @returns {object} The model.
   */
  function buildProgressiveOdds(outcomes, faces, combinations) {
    if (previewDifficulties.length === 0) {
      return { kind: 'progressive', enumerable: false, reason: SANDBOX_ABSENT };
    }
    const rows = enumerateProgressiveOdds({
      outcomes,
      difficulties: previewDifficulties,
      awardMode: activeCheck?.awardMode || 'equal',
    }).map((row) => ({
      id: row.id,
      label: text('FABRICATE.Admin.Manager.Checks.Odds.AwardCount', '{awarded} of {of}')
        .replace('{awarded}', String(row.awarded))
        .replace('{of}', String(row.of)),
      percent: row.percent,
      success: row.awarded > 0,
    }));
    return { kind: 'progressive', enumerable: true, faces, combinations, rows };
  }

  const oddsModel = $derived(buildOddsModel());

  /** The matched band card: the tier the result object actually names. */
  function buildBandCard(result) {
    if (!result) return { name: '', detail: '', success: false };
    const success = result.success === true;
    if (previewPlan.kind === 'routed') {
      return {
        name:
          result.outcome ||
          text('FABRICATE.Admin.Manager.Checks.Simulator.NoOutcome', 'No outcome tier'),
        detail: success
          ? text(
              'FABRICATE.Admin.Manager.Checks.Simulator.BandSuccess',
              'Counts as a success · the result group bound to this tier is produced.'
            )
          : text(
              'FABRICATE.Admin.Manager.Checks.Simulator.BandFailure',
              'Counts as a failure · nothing is produced.'
            ),
        success,
      };
    }
    if (previewPlan.kind === 'progressive') {
      return {
        name: text('FABRICATE.Admin.Manager.Checks.Simulator.AwardValue', 'Awards {value}').replace(
          '{value}',
          String(result.value ?? 0)
        ),
        detail: text(
          'FABRICATE.Admin.Manager.Checks.Simulator.AwardDetail',
          'The value is spent down the recipe’s ordered results, each costing its own difficulty.'
        ),
        success: true,
      };
    }
    return {
      name: success
        ? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')
        : text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure'),
      detail: success
        ? text(
            'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessDesc',
            'The roll reaches the DC, and the recipe’s result group is produced in full.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailureDesc',
            'The roll misses the DC; nothing is produced, and the failure policy decides the cost.'
          ),
      success,
    };
  }

  /**
   * The "What happens" rows, each read off the SAME result object the engine would act on.
   *
   * @param {object|null} result The runner result.
   * @returns {Array<object>} `IconFactRow` inputs.
   */
  function buildPreviewFacts(result) {
    if (!result) return [];
    const facts = [];
    const success = result.success === true;
    facts.push({
      id: 'result-group',
      icon: 'fas fa-box-open',
      title: text('FABRICATE.Admin.Manager.Checks.Simulator.FactResults', 'Result group produced'),
      subtitle: success
        ? buildBandCard(result).name
        : text('FABRICATE.Admin.Manager.Checks.Simulator.FactResultsNone', 'None'),
    });
    if (activity !== 'gathering') {
      const consumes = success || consumeIngredientsOnFail;
      facts.push({
        id: 'ingredients',
        icon: 'fas fa-fire-flame-curved',
        title: text(
          'FABRICATE.Admin.Manager.Checks.Simulator.FactIngredients',
          'Ingredients consumed'
        ),
        subtitle: consumes
          ? text('FABRICATE.Admin.Manager.Checks.Simulator.FactAsListed', 'as listed')
          : text('FABRICATE.Admin.Manager.Checks.Simulator.FactNotConsumed', 'kept'),
      });
    }
    if (result.data?.breakTools === true || (!success && breakToolsOnFail)) {
      facts.push({
        id: 'tools',
        icon: 'fas fa-hammer',
        title: text('FABRICATE.Admin.Manager.Checks.Simulator.FactTools', 'Required tools break'),
        subtitle: '',
      });
    }
    if (result.data?.tierStepApplied) {
      const step = result.data.tierStepApplied;
      facts.push({
        id: 'tier-step',
        icon: 'fas fa-arrow-up-right-dots',
        title: text(
          'FABRICATE.Admin.Manager.Checks.Simulator.FactTierStep',
          'A trigger moved the tier by {steps}'
        ).replace('{steps}', String(step.steps)),
        subtitle: step.stepClamped
          ? text(
              'FABRICATE.Admin.Manager.Checks.Simulator.FactTierStepClamped',
              'clamped at the end of the tier list'
            )
          : '',
      });
    }
    if (result.data?.minTierFailed) {
      facts.push({
        id: 'min-tier',
        icon: 'fas fa-ban',
        title: text(
          'FABRICATE.Admin.Manager.Checks.Simulator.FactMinTier',
          'Blocked by the recipe’s minimum success tier'
        ),
        subtitle: '',
      });
    }
    return facts;
  }

  const previewModel = $derived.by(() => {
    const total = Number(previewResult?.data?.total);
    const band = buildBandCard(previewResult);
    return {
      kind: previewPlan.kind,
      hasFormula: previewFormula !== '',
      dynamicDc: previewPlan.dynamicDc === true,
      resolved: previewResolved,
      rolling: previewRolling,
      result: previewResult,
      total: Number.isFinite(total) ? total : null,
      dc: previewPlan.dc,
      margin:
        previewPlan.kind === 'progressive' || !Number.isFinite(total)
          ? null
          : total - previewPlan.dc,
      breakdown: terseBreakdown(previewResult, previewActor?.name ?? ''),
      // The die the medallion is captioned with, off the result's own dice bag.
      dieLabel: previewResult?.data?.diceGroups?.[0]?.group
        ? `d${String(previewResult.data.diceGroups[0].group).split('d')[1]}`
        : '',
      bandName: band.name,
      bandDetail: band.detail,
      bandSuccess: band.success,
      facts: buildPreviewFacts(previewResult),
    };
  });

  // A rolled result describes ONE (formula, actor, record) tuple, so it is dropped when any
  // of the three moves.
  const previewSignature = $derived(
    [
      activity,
      activeMode,
      previewFormula,
      previewActorId,
      previewRecord?.id ?? '',
      previewPlan.dc,
    ].join('\0')
  );
  let adoptedPreviewSignature = $state('');
  $effect(() => {
    if (previewSignature === adoptedPreviewSignature) return;
    adoptedPreviewSignature = previewSignature;
    previewResult = null;
  });
  // A record the check no longer offers must not stay selected.
  $effect(() => {
    if (previewRecords.length === 0) return;
    if (previewRecords.some((record) => record.id === previewRecordId)) return;
    previewRecordId = previewRecords[0].id;
  });

  async function rollPreview() {
    if (previewRolling) return;
    previewRolling = true;
    try {
      previewResult = await runCheckPreview(previewPlan);
    } finally {
      previewRolling = false;
    }
  }

  function selectPreviewRecord(id) {
    previewRecordId = id;
  }

  // Spread rather than restated at ten call sites: the prop list IS the contract.
  const routedPreviewProps = $derived({
    previewRecords,
    previewRecordId: previewRecord?.id ?? '',
    previewDcOverride: previewRecord?.dc ?? null,
    previewLabel: previewRecord?.name ?? '',
    onSelectPreviewRecord: selectPreviewRecord,
  });
  const simplePreviewProps = $derived({
    previewRecords,
    previewRecordId: previewRecord?.id ?? '',
    previewLabel: previewRecord?.name ?? '',
    trackMin: previewTrack.min,
    trackMax: previewTrack.max,
    onSelectPreviewRecord: selectPreviewRecord,
  });
  const previewActorSummary = $derived(
    previewActor
      ? ''
      : text(
          'FABRICATE.Admin.Manager.Checks.PreviewAs.NoActorHint',
          'With no actor selected every roll-data key reads as 0.'
        )
  );
</script>

<!-- Rendered in BOTH crafting branches from one definition, including the two states where
     the library reaches no roll: a card that disappears reports nothing. -->
{#snippet craftingModifierCard()}
  <CraftingModifierCatalogueCard
    activity="crafting"
    {modifiers}
    defaultModifierPolicy={craftingDefaultModifierPolicy}
    defaultModifierIds={craftingDefaultModifierIds}
    maxModifierPicks={craftingMaxModifierPicks}
    inertCause={craftingModifierInertCause}
    onEditLibrary={onOpenModifierLibrary}
    onChange={onUpdateCraftingCheckModifiers}
  />
{/snippet}

<!-- Salvage and gathering render the SAME card against their own selection. All three render
     the library READ-ONLY while the eligibility control and the rule grid stay editable. -->
{#snippet salvageModifierCard()}
  <CraftingModifierCatalogueCard
    activity="salvage"
    {modifiers}
    defaultModifierPolicy={salvageDefaultModifierPolicy}
    defaultModifierIds={salvageDefaultModifierIds}
    maxModifierPicks={salvageMaxModifierPicks}
    inertCause={salvageModifierInertCause}
    onEditLibrary={onOpenModifierLibrary}
    onChange={onUpdateSalvageCheckModifiers}
  />
{/snippet}

{#snippet gatheringModifierCard()}
  <CraftingModifierCatalogueCard
    activity="gathering"
    {modifiers}
    defaultModifierPolicy={gatheringDefaultModifierPolicy}
    defaultModifierIds={gatheringDefaultModifierIds}
    maxModifierPicks={gatheringMaxModifierPicks}
    inertCause={gatheringModifierInertCause}
    dormant
    onEditLibrary={onOpenModifierLibrary}
    onChange={onUpdateGatheringCheckModifiers}
  />
{/snippet}

<!-- The failure-RESULT policy card, rendered by all three activity routes AND the alchemy
     branch from ONE definition. Which policy and which saver it reaches are resolved HERE from
     `activity`, so no call site can pair crafting's value with salvage's saver. -->
{#snippet failurePolicyCard()}
  <CheckFailurePolicy
    {activity}
    {recordNoun}
    {recordNounPlural}
    inertNote={failurePolicyInertNote}
    value={activity === 'salvage'
      ? salvageFailureResultPolicy
      : activity === 'gathering'
        ? gatheringFailureResultPolicy
        : craftingFailureResultPolicy}
    onChange={(next) => {
      if (activity === 'salvage') return onUpdateSalvageFailureResultPolicy(next);
      if (activity === 'gathering') return onUpdateGatheringFailureResultPolicy(next);
      return onUpdateCraftingFailureResultPolicy(next);
    }}
  />
{/snippet}

<!-- GATHERING'S On-failure SECTION, from ONE definition for both gathering branches. IT
     RENDERS NO CONSUMPTION TOGGLES, which is a data fact rather than an omission: gathering has
     no `consumption` block at all, and what it has is `task.failureOutcome`, authored on the
     task and cross-referenced here read-only. -->
{#snippet gatheringOnFailureSection()}
  {@render failurePolicyCard()}
  <!-- NEUTRAL, not info: the info tint is reserved for a note about LIVE state, and this
       sentence reports the product rather than this record. -->
  <Callout
    tone="neutral"
    text={text(
      'FABRICATE.Admin.Manager.Checks.FailureResults.GatheringDormant',
      'Routed and progressive gathering are still being built, so nothing on this screen changes what a failed gathering attempt does yet. What you set here is kept and takes effect when they arrive.'
    )}
    dataAttr="data-gathering-failure-dormant"
  />
  <InspectorCard data-gathering-failure-outcome="">
    <h3 class="manager-checks-card-title">
      {text(
        'FABRICATE.Admin.Manager.Checks.FailureResults.FailureOutcomeTitle',
        'Failure feedback'
      )}
    </h3>
    <p class="manager-muted">
      {text(
        'FABRICATE.Admin.Manager.Checks.FailureResults.FailureOutcomeLead',
        'A gathering task can say what happens when an attempt turns up nothing — a line of text, or a macro. It is authored on the task itself.'
      )}
    </p>
    {#if previewedGatheringTask}
      <p class="manager-muted" data-gathering-failure-outcome-value>
        <strong>{previewedGatheringTask.name}</strong> ·
        {previewedGatheringTask.failureOutcome?.mode === 'macro'
          ? text('FABRICATE.Admin.Manager.Checks.FailureResults.FailureOutcomeMacro', 'Macro')
          : previewedGatheringTask.failureOutcome?.mode === 'text'
            ? text('FABRICATE.Admin.Manager.Checks.FailureResults.FailureOutcomeText', 'Text')
            : text('FABRICATE.Admin.Manager.Checks.FailureResults.FailureOutcomeNone', 'Not set')}
      </p>
    {:else}
      <p class="manager-muted" data-gathering-failure-outcome-empty>
        {text(
          'FABRICATE.Admin.Manager.Checks.FailureResults.FailureOutcomeNoRecord',
          'Choose a gathering task under Preview as to open its failure feedback.'
        )}
      </p>
    {/if}
    <ManagerButton
      data-gathering-failure-outcome-link
      disabled={!previewedGatheringTask}
      onclick={() => onOpenGatheringTask(previewedGatheringTask?.id || '')}
    >
      <i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>
      <span
        >{text(
          'FABRICATE.Admin.Manager.Checks.FailureResults.FailureOutcomeOpen',
          'Open this task'
        )}</span
      >
    </ManagerButton>
  </InspectorCard>
{/snippet}

<!-- The one place a section that cannot apply is answered, naming the MODE. -->
{#snippet inapplicableSection(sectionLabel)}
  <EmptyState
    icon="fas fa-circle-minus"
    dataAttr="data-checks-section-empty"
    dataValue={activeSection}
    title={text('FABRICATE.Admin.Manager.Checks.Sections.InapplicableTitle', 'Nothing to set here')}
    hint={text(
      'FABRICATE.Admin.Manager.Checks.Sections.InapplicableHint',
      '{section} does not apply in {mode} mode.'
    )
      .replace('{section}', sectionLabel)
      .replace('{mode}', modeLabel)}
  />
{/snippet}

<div
  class="manager-environment-edit-view"
  data-environment-editor
  data-checks-editor
  bind:this={checksRoot}
>
  <!--
      THE ROW ACTION'S LIVE REGION, HOSTED HERE rather than in the validation surface: a row action
      routes to another ACTIVITY, unmounting the whole validation panel — live region included — in
      the same update that was supposed to announce. So the element carrying `aria-live` is ALWAYS
      in the DOM, outside the validation branch, with its own `{#if}` inside it. A THIRD CHILD OF
      THIS TWO-ROW GRID IS SAFE because `.visually-hidden` is `position: absolute` and so is not a
      grid item; it is addressed by a `data-` hook, so it joins no pinned class family.
    -->
  <div class="visually-hidden" role="status" aria-live="polite" data-checks-issue-announcement>
    {#if issueAnnouncement}{issueAnnouncement}{/if}
  </div>
  {#if activity !== 'validation'}
    <ChecksEditorTabs
      {sections}
      {activeSection}
      onSelect={(section) => {
        activeSection = section;
      }}
    />
  {/if}

  <div class="manager-environment-workspace">
    <!-- `tabindex="-1"` and `data-keyboard-focus="true"` are the ROUTE-ONLY row's focus
         destination: the button it was activated from is unmounted by the route change, so without
         this focus falls to `<body>`. `-1` rather than `0`, the panel being a programmatic
         destination and not a tab stop. -->
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`checks-panel-${activity === 'validation' ? 'validation' : activeSection}`}
      aria-labelledby={activity === 'validation' ? undefined : `checks-section-${activeSection}`}
      tabindex="-1"
      data-keyboard-focus="true"
      bind:this={sectionPanel}
    >
      {#if paneHead && !routeIsOff}
        <header class="manager-checks-pane-head" data-checks-pane-head={activeSection}>
          <h2 class="manager-checks-pane-title">{paneHead.title}</h2>
          <p class="manager-checks-pane-lead">{paneHead.lead}</p>
        </header>
      {/if}

      <!-- The section's warning dot, explained IN the panel, above the section content rather
           than inside each branch, so every route reaches one insertion point. -->
      <!-- WHAT THIS MODE DOES reads first: it is a standing statement about the mode, where an
           issue callout is about THIS check. -->
      {#if activity !== 'validation' && !routeIsOff && activeSection === 'roll'}
        <CheckModeCallout
          {activity}
          mode={calloutMode}
          {alchemyCheckMode}
          outcomeCount={outcomeCount ?? 0}
        />
      {/if}

      {#if activity !== 'validation' && !routeIsOff && activeSectionIssues.length > 0}
        <div class="manager-checks-section-callouts" data-checks-section-callouts={activeSection}>
          <!-- The tone is DERIVED and both values stand: a readiness issue is a statement about
               the live record, which is what `info` is for, and a critical one is the hazard
               `warning` names. -->
          {#each activeSectionIssues as issue (issue.id)}
            <Callout
              tone={issue.tone}
              text={issue.text}
              dataAttr="data-checks-section-callout"
              dataValue={issue.id}
            />
          {/each}
        </div>
      {/if}

      {#if activity === 'validation'}
        <ChecksValidationTab
          sections={validationSections}
          {dirty}
          {dirtyActivities}
          onSelectIssue={selectIssue}
        />
      {:else if routeIsOff}
        <!-- The check is optional and the GM turned it off, so the way back on is IN the
             panel. -->
        <div class="manager-checks-page" data-checks-panel={activity} data-checks-off>
          <EmptyState
            icon="fas fa-dice-d20"
            dataAttr="data-checks-off-empty"
            title={text('FABRICATE.Admin.Manager.Checks.Off.Title', 'This activity needs no check')}
            hint={text(
              'FABRICATE.Admin.Manager.Checks.Off.Lead',
              'This system can roll a check here, but it is switched off. Every attempt that meets its requirements succeeds outright — no formula, no DC, no failure policy.'
            )}
          >
            <ManagerButton
              role="primary"
              data-checks-turn-on
              onclick={() => onToggleCheckActive(activity, true)}
            >
              <i class="fas fa-power-off" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Checks.Off.TurnOn', 'Turn this check on')}</span>
            </ManagerButton>
          </EmptyState>
        </div>
      {:else if activity === 'crafting' && craftingAlchemy}
        <div class="manager-checks-editor-stack" data-checks-panel="crafting">
          {#if activeSection === 'roll'}
            <InspectorCard>
              <h3 class="manager-checks-card-title">
                {text('FABRICATE.Admin.SystemSettings.Alchemy.CheckModeHeading', 'Alchemy check')}
              </h3>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeIntro',
                  'Choose the shape of the check a matched brew rolls: a simple pass/fail check, or a tiered routed check. Use the Active switch to resolve brews without a check at all.'
                )}
              </p>
              <RadioCardGroup
                legendKey="FABRICATE.Admin.SystemSettings.Alchemy.CheckModeHeading"
                legend="Alchemy check"
                options={ALCHEMY_CHECK_MODE_OPTIONS}
                selectedValue={alchemyCheckMode}
                groupName="crafting-alchemy-checkmode"
                columns={2}
                dataAttr="data-crafting-alchemy-checkmode"
                optionDataAttr="data-crafting-alchemy-checkmode-option"
                onChange={(mode) => onSetAlchemyCheckMode(mode)}
              />
            </InspectorCard>
          {/if}

          {#if activeSection === 'on-failure'}
            <!-- ALCHEMY RENDERS IT TOO: `alchemy simple` is one of the two crafting modes
                 where the reserved `role: 'failure'` group is a LIVE award. Alchemy's own
                 `consumeOnFail` stays below — it substitutes for the generic consumption
                 pair, not for this. -->
            {@render failurePolicyCard()}
            <InspectorCard data-alchemy-behaviour="">
              <h3 class="manager-checks-card-title">
                {text(
                  'FABRICATE.Admin.SystemSettings.Alchemy.BehaviourHeading',
                  'Alchemy behaviour'
                )}
              </h3>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.SystemSettings.Alchemy.BehaviourIntro',
                  'How brewing rewards discovery, treats failed attempts, and remembers dead ends. These apply whatever alchemy check mode is set on The roll section.'
                )}
              </p>
              <div class="manager-checks-flag-list">
                <ToggleCard
                  variant="is-info"
                  icon="fas fa-book"
                  section="alchemy-learn-on-craft"
                  field="learnOnCraft"
                  title={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.LearnOnCraft',
                    'Learn a recipe when its ingredients are matched'
                  )}
                  sub={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.LearnOnCraftDesc',
                    'A matched brew records the recipe as discovered for that player, whether the check passes or fails. Off by default.'
                  )}
                  toggleLabel={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.LearnOnCraft',
                    'Learn a recipe when its ingredients are matched'
                  )}
                  on={alchemyLearnOnCraft}
                  onToggle={(next) => onUpdateAlchemyFlags({ learnOnCraft: next })}
                />
                <ToggleCard
                  variant="is-info"
                  icon="fas fa-fire-flame-curved"
                  section="alchemy-consume-on-fail"
                  field="consumeOnFail"
                  title={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.ConsumeOnFail',
                    'Consume ingredients on a failed brew'
                  )}
                  sub={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.ConsumeOnFailDesc',
                    'A matched brew that fails its check consumes the submitted ingredients, the same as an unmatched fizzle. On by default.'
                  )}
                  toggleLabel={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.ConsumeOnFail',
                    'Consume ingredients on a failed brew'
                  )}
                  on={alchemyConsumeOnFail}
                  onToggle={(next) => onUpdateAlchemyFlags({ consumeOnFail: next })}
                />
                <ToggleCard
                  variant="is-info"
                  icon="fas fa-clock-rotate-left"
                  section="alchemy-show-attempt-history"
                  field="showAttemptHistoryToPlayers"
                  title={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.ShowAttemptHistory',
                    'Show attempt history to players'
                  )}
                  sub={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.ShowAttemptHistoryDesc',
                    'Record dead-end attempts so a player sees which ingredient combinations produced no reaction. On by default.'
                  )}
                  toggleLabel={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.ShowAttemptHistory',
                    'Show attempt history to players'
                  )}
                  on={alchemyShowAttemptHistory}
                  onToggle={(next) => onUpdateAlchemyFlags({ showAttemptHistoryToPlayers: next })}
                />
              </div>
            </InspectorCard>
          {/if}

          <!-- There is no alchemy `none` branch here: an alchemy system whose check is off is an
               OFF check rather than an inert mode, so it takes the shared `routeIsOff` empty
               state above, with its "Turn this check on" button. -->
          {#if craftingRouted}
            <CraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              value={craftingCheck}
              {resolutionMode}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={craftingBreakageAuthority}
              {...routedPreviewProps}
              onChange={onUpdateCraftingCheck}
            />
          {:else if craftingSimple}
            <SimpleCraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              value={craftingCheckSimple}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={craftingBreakageAuthority}
              {...simplePreviewProps}
              onChange={onUpdateCraftingCheckSimple}
            />
          {/if}

          {#if activeSection === 'modifiers'}
            {@render craftingModifierCard()}
          {/if}
        </div>
      {:else if activity === 'crafting' && (craftingRouted || craftingSimple || craftingProgressive)}
        <!-- Non-alchemy crafting: the per-mode editor plus the system-level failure consumption
             policy. The wrapper keeps `data-checks-panel="crafting"` but deliberately NOT the
             `manager-checks-page` class, which a test asserts is absent once the editor
             renders. -->
        <div class="manager-checks-editor-stack" data-checks-panel="crafting">
          {#if craftingRouted}
            <CraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              value={craftingCheck}
              {resolutionMode}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={craftingBreakageAuthority}
              {...routedPreviewProps}
              onChange={onUpdateCraftingCheck}
            />
          {:else if craftingSimple}
            <SimpleCraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              value={craftingCheckSimple}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={craftingBreakageAuthority}
              {...simplePreviewProps}
              onChange={onUpdateCraftingCheckSimple}
            />
          {:else}
            <ProgressiveCraftingCheckEditor
              {recordNoun}
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              value={craftingCheckProgressive}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={craftingBreakageAuthority}
              onChange={onUpdateCraftingCheckProgressive}
            />
          {/if}

          {#if activeSection === 'on-failure'}
            {@render failurePolicyCard()}
            <!-- TWO TOP-LEVEL CARDS plus the note the screen ends with, and no wrapping
                 `Failure consumption policy` card: it named a policy the design does not name,
                 and the pane head already says what a failed check costs.
                 `data-failure-consumption` rides the bare list wrapper so the smoke's anchor,
                 the mounted suites' lookup and the alchemy absence check all keep resolving. -->
            <div class="manager-checks-flag-list" data-failure-consumption>
              <ToggleCard
                icon="fas fa-fire"
                section="failure-consume-ingredients"
                field="consumeIngredientsOnFail"
                title={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.ConsumeIngredientsOnFail',
                  'Consume ingredients on a failed check'
                )}
                sub={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.ConsumeIngredientsOnFailDesc',
                  'The recipe’s ingredients are used up even when the crafting check fails. On by default.'
                )}
                toggleLabel={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.ConsumeIngredientsOnFail',
                  'Consume ingredients on a failed check'
                )}
                on={consumeIngredientsOnFail}
                onToggle={(next) => onUpdateCraftingConsumption({ consumeIngredientsOnFail: next })}
              />
              <ToggleCard
                icon="fas fa-hammer"
                section="failure-break-tools"
                field="breakToolsOnFail"
                title={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.BreakToolsOnFail',
                  'Break tools on a failed check'
                )}
                sub={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.BreakToolsOnFailDesc',
                  'Required tools break when the crafting check fails. Off by default.'
                )}
                toggleLabel={text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.BreakToolsOnFail',
                  'Break tools on a failed check'
                )}
                on={breakToolsOnFail}
                onToggle={(next) => onUpdateCraftingConsumption({ breakToolsOnFail: next })}
              />
            </div>
            <!-- The last thing on the screen, saying where the two policies this screen does
                 NOT govern actually live. -->
            <!-- NEUTRAL, the shared strip's own default: a pointer to two other screens rather
                 than a note about live state. -->
            <Callout
              tone="neutral"
              text={text(
                'FABRICATE.Admin.Manager.Checks.Crafting.FailureSalvageNote',
                'Salvage failures follow their own separate policy on the Salvage check. An individual trigger can also break tools on its own — see Triggers.'
              )}
              dataAttr="data-failure-salvage-note"
            />
          {/if}

          {#if activeSection === 'modifiers'}
            {@render craftingModifierCard()}
          {/if}
        </div>
      {:else if activity === 'salvage'}
        <div class="manager-checks-editor-stack" data-checks-panel="salvage">
          {#if salvageRouted}
            <CraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              value={salvageCheckRouted}
              showTiers={false}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={salvageBreakageAuthority}
              {...routedPreviewProps}
              onChange={onUpdateSalvageCheckRouted}
            />
          {:else if salvageProgressive}
            <ProgressiveCraftingCheckEditor
              {recordNoun}
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              value={salvageCheckProgressive}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={salvageBreakageAuthority}
              onChange={onUpdateSalvageCheckProgressive}
            />
          {:else if salvageSimple}
            <SimpleCraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              value={salvageCheckSimple}
              showDcSource={false}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={salvageBreakageAuthority}
              {...simplePreviewProps}
              onChange={onUpdateSalvageCheckSimple}
            />
          {/if}
          {#if activeSection === 'modifiers'}
            {@render salvageModifierCard()}
          {/if}
          {#if activeSection === 'on-failure'}
            <!-- SALVAGE'S On-failure SECTION. The "nothing to set here" empty state it used
                 to render was true of the screen and false of the data:
                 `consumeComponentOnFail` and `breakToolsOnFail` were persisted and reachable
                 from no editor. -->
            {@render failurePolicyCard()}
            <div class="manager-checks-flag-list" data-salvage-failure-consumption>
              <ToggleCard
                icon="fas fa-fire"
                section="salvage-failure-consume-component"
                field="consumeComponentOnFail"
                title={text(
                  'FABRICATE.Admin.Manager.Checks.SalvageFailure.ConsumeComponentOnFail',
                  'Consume the item on a failed check'
                )}
                sub={text(
                  'FABRICATE.Admin.Manager.Checks.SalvageFailure.ConsumeComponentOnFailDesc',
                  'The item being salvaged is used up even when the salvage check fails. On by default.'
                )}
                toggleLabel={text(
                  'FABRICATE.Admin.Manager.Checks.SalvageFailure.ConsumeComponentOnFail',
                  'Consume the item on a failed check'
                )}
                on={consumeComponentOnFail}
                onToggle={(next) => onUpdateSalvageConsumption({ consumeComponentOnFail: next })}
              />
              <ToggleCard
                icon="fas fa-hammer"
                section="salvage-failure-break-tools"
                field="breakToolsOnFail"
                title={text(
                  'FABRICATE.Admin.Manager.Checks.SalvageFailure.BreakToolsOnFail',
                  'Break tools on a failed check'
                )}
                sub={text(
                  'FABRICATE.Admin.Manager.Checks.SalvageFailure.BreakToolsOnFailDesc',
                  'Required tools break when the salvage check fails. Off by default.'
                )}
                toggleLabel={text(
                  'FABRICATE.Admin.Manager.Checks.SalvageFailure.BreakToolsOnFail',
                  'Break tools on a failed check'
                )}
                on={salvageBreakToolsOnFail}
                onToggle={(next) => onUpdateSalvageConsumption({ breakToolsOnFail: next })}
              />
            </div>
          {/if}
        </div>
      {:else if activity === 'gathering' && gatheringD100}
        <div class="manager-checks-page" data-checks-panel="gathering" data-gathering-d100-readonly>
          {#if activeSection === 'roll'}
            <InspectorCard>
              <p class="manager-kicker">{pageKicker}</p>
              <h2 class="manager-checks-card-title">
                {text('FABRICATE.Admin.Manager.Checks.Gathering.D100Title', 'Fixed d100 roll')}
              </h2>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Gathering.D100Lead',
                  'In d100 mode the gathering check is a fixed d100 roll against each drop’s chance. There is nothing to configure here.'
                )}
              </p>
            </InspectorCard>
            <InspectorCard>
              <h3 class="manager-checks-card-title">{configTitle}</h3>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Gathering.D100Hint',
                  'Switch the gathering economy to progressive or routed resolution to define an editable check. Per-task tuning adjusts difficulty, not the roll.'
                )}
              </p>
            </InspectorCard>
          {:else if activeSection === 'modifiers'}
            <!-- d100 RENDERS Modifiers rather than hiding it: the card is the one owned path
                 for reporting that a selection reaches no roll. -->
            {@render gatheringModifierCard()}
          {:else if activeSection === 'on-failure'}
            <!-- On-failure renders under d100 too: the policy is persisted per ACTIVITY rather
                 than per mode, so hiding it under the one selectable mode hides it always. -->
            {@render gatheringOnFailureSection()}
          {:else}
            {@render inapplicableSection(
              text(
                `FABRICATE.Admin.Manager.Checks.Sections.${SECTION_META[activeSection].labelKey}`,
                SECTION_META[activeSection].labelFallback
              )
            )}
          {/if}
        </div>
      {:else if activity === 'gathering'}
        <div class="manager-checks-editor-stack" data-checks-panel="gathering">
          {#if gatheringProgressive}
            <ProgressiveCraftingCheckEditor
              {recordNoun}
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              value={gatheringCheckProgressive}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={gatheringBreakageAuthority}
              onChange={onUpdateGatheringCheckProgressive}
            />
          {:else if gatheringRouted}
            <CraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              value={gatheringCheckRouted}
              showTiers={false}
              section={activeSection}
              {foundrySystemId}
              breakageAuthority={gatheringBreakageAuthority}
              {...routedPreviewProps}
              onChange={onUpdateGatheringCheckRouted}
            />
          {/if}
          {#if activeSection === 'modifiers'}
            {@render gatheringModifierCard()}
          {/if}
          {#if activeSection === 'on-failure'}
            {@render gatheringOnFailureSection()}
          {/if}
        </div>
      {:else}
        <div class="manager-checks-page" data-checks-panel={activity}>
          <InspectorCard>
            <p class="manager-kicker">{pageKicker}</p>
            <h2 class="manager-checks-card-title">{page.title}</h2>
            <p class="manager-muted">{page.lead}</p>
          </InspectorCard>
          <InspectorCard>
            <h3 class="manager-checks-card-title">{configTitle}</h3>
            <p class="manager-muted">{page.configHint}</p>
          </InspectorCard>
        </div>
      {/if}
    </div>

    <ChecksRightMenu
      activeTab={activity}
      activation={activation?.[activity]}
      checkOff={routeIsOff}
      {activeCheck}
      {outcomeCount}
      {triggerCount}
      {modifierCount}
      issueCount={activeReadiness.issues.length}
      allChecks={allChecksSummary}
      {previewActors}
      {previewRecords}
      {previewActorId}
      {previewActorSummary}
      previewRecordId={previewRecord?.id ?? ''}
      {previewDifficultiesText}
      previewIsProgressive={isProgressive}
      preview={previewModel}
      odds={oddsModel}
      onSelectPreviewActor={(id) => (previewActorId = id)}
      onSelectPreviewRecord={selectPreviewRecord}
      onEditPreviewDifficulties={updatePreviewDifficulties}
      onRollPreview={rollPreview}
      onToggleActive={(enabled) => onToggleCheckActive(activity, enabled)}
      onOpen={(target, section) => onOpenActivity(target, section)}
    />
  </div>
</div>

<style>
  /* Layout only: the strip is the shared `Callout` primitive and states its own appearance. */
  .manager-checks-section-callouts {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin-bottom: var(--fab-space-3);
  }
</style>
