<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's per-ACTIVITY route: `checks-crafting`, `checks-salvage`, `checks-gathering`
  and `checks-validation` are rail ROUTES and this renders whichever is open. `activity` is a
  PROP, not internal state — the rail owns the highlight, the breadcrumb and the deep link.

  Each activity's check is a singleton whose shape follows its resolution mode, so a route is a
  single editor page rather than a list. The five sections, which render in which mode, the
  dot-and-count contract, the "switched off" predicate and the right rail's contents are stated
  in `openspec/specs/ui-system-studio/spec.md` → "GM Checks Studio". Dots and rail badges are
  computed on the LIVE DRAFT; the enable gate is not, and the Validation route says so.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../../../components/EmptyState.svelte';
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
    issueControl,
    readinessModeForSlot,
    sectionForIssue,
  } from './checksReadiness.js';
  import { convertCountingFormula } from './countFormulaConversion.js';
  import Callout from '../../../components/Callout.svelte';
  import Notice from '../../../components/Notice.svelte';
  import CheckModeCallout from './CheckModeCallout.svelte';
  import { focusValidationTarget } from '../validationFocus.js';
  import { announceValidationOutcome } from '../validationAnnouncement.js';
  import InspectorCard from '../../../components/InspectorCard.svelte';
  import { checkIssueText, convertActionCopy } from './checksCopy.js';
  import {
    activityWordFor,
    failurePolicyInertNote as inertNoteFor,
    recordNounFor,
    recordNounPluralFor,
    subsystemModeLabel as modeLabelFor,
  } from './checksActivityCopy.js';
  import { issueRowStatus } from './checksValidationRows.js';
  import {
    buildCheckModifierContext,
    resolveActiveCraftingCheckFormula,
    resolveActiveGatheringCheckFormula,
    resolveActiveSalvageCheckFormula,
    makeRollDataExpressionResolver,
    resolveCheckModifierContribution,
    resolveEligibleModifierIds,
    resolveModifierPolicy,
  } from '../../../../../systems/checkModifierResolver.js';
  import {
    DEFAULT_RECORD_ID,
    NO_ACTOR_ID,
    buildPreviewCheckArgs,
    buildPreviewRecords,
    cloneRollData,
    listPreviewActors,
    resolvePreviewActor,
    runCheckPreview,
  } from './checkPreview.js';
  import {
    buildOddsModel,
    buildReadoutModel,
    countPreviewPlacement,
    labelPreviewRecords,
    previewAbstention,
    previewActorNote,
    previewEnumeration,
    previewSignature,
    previewTrack,
  } from './checkPreviewModel.js';
  import {
    formatPreviewDifficulties,
    parsePreviewDifficulties,
  } from '../../../../../systems/progressiveCheckSandbox.js';
  import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';

  // `resolutionMode` picks the crafting editor; the three `craftingCheck*` props are its drafts.
  let {
    // Which activity route is open, owned by the router.
    activity = 'crafting',
    resolutionMode = 'simple',
    alchemyCheckMode = 'none',
    craftingCheck = null,
    craftingCheckSimple = null,
    craftingCheckProgressive = null,
    // The system `craftingCheck.consumption` block; alchemy uses its own `consumeOnFail` instead.
    craftingConsumption = null,
    // Salvage's OWN failure consumption, whose defaults are both traps, so the store projects them.
    salvageConsumption = null,
    // The per-activity FAILURE-RESULT POLICY, read from the PERSISTED system: it live-persists.
    craftingFailureResultPolicy = 'perRecord',
    salvageFailureResultPolicy = 'perRecord',
    gatheringFailureResultPolicy = 'perRecord',
    // The gathering row the rail's `PREVIEW AS` selector has chosen, or `null`; the On-failure
    // section cross-references THAT row's `task.failureOutcome` read-only, this screen being
    // system-level, and renders its stated no-record state without one.
    previewedGatheringTask = null,
    onOpenGatheringTask = () => {},
    // The ONE system-level modifier library, READ-ONLY here; Checks owns only the SELECTION.
    modifiers = [],
    // Crafting's SELECTION, rendered even where the catalogue reaches no roll, per `inertCause`.
    craftingDefaultModifierPolicy = 'addAll',
    craftingDefaultModifierIds = [],
    // The pick cap. `null`, NOT a number: absence is "unlimited", and a numeric default would
    // impose a bound nobody authored.
    craftingMaxModifierPicks = null,
    // The same triple for salvage and for gathering.
    salvageDefaultModifierPolicy = 'addAll',
    salvageDefaultModifierIds = [],
    salvageMaxModifierPicks = null,
    gatheringDefaultModifierPolicy = 'addAll',
    gatheringDefaultModifierIds = [],
    gatheringMaxModifierPicks = null,
    // The three system-level alchemy flags the engine honours, as live-persisting toggles.
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
    // The raw records overrides live on, outside any check draft (issue 2078): every managed
    // component (read for salvage) and every gathering task (read for gathering).
    components = [],
    gatheringTasks = [],
    // Tool-breakage authority: `checkDriven` adds the per-trigger break-tools toggle.
    breakageAuthority = 'toolSpecific',
    // Feature flags: salvage is always on, gathering only when `features.gathering === true`.
    features = {},
    activation = {},
    // The draft model lives ABOVE the route — one dirty set, one plural Save — reflected here.
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
    // A section the ROUTER wants opened: it travels WITH the route rather than being set on a
    // component instance the router is about to hand a different `activity`.
    requestedSection = '',
    // Its IDENTITY: a request is an EVENT, and latching on the section VALUE swallows a repeat.
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
  // The alchemy check-mode selector, at the TOP of the crafting route's roll section, STAGING
  // the mode on the root's draft and swapping the editor below. "NO CHECK" IS NOT A MODE
  // HERE: the persisted enum still carries `none`, but a third radio made the on/off decision
  // and the shape decision one control. Off is the switch.
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

  // Failure consumption toggle states, on the normalizer's own defaults, so OFF is not inverted.
  const consumeIngredientsOnFail = $derived(
    craftingConsumption?.consumeIngredientsOnFail !== false
  );
  const breakToolsOnFail = $derived(craftingConsumption?.breakToolsOnFail === true);

  // Salvage's own pair, on the SALVAGE normalizer's defaults and key names: the first wrong
  // INVERTS an authored OFF rather than merely losing it.
  const consumeComponentOnFail = $derived(salvageConsumption?.consumeComponentOnFail !== false);
  const salvageBreakToolsOnFail = $derived(salvageConsumption?.breakToolsOnFail === true);

  // Only `routedByCheck` uses the tier-routing editor, and alchemy has a dedicated FIRST
  // branch, so `craftingAlchemy` wins before these two can match — but they still INCLUDE the
  // alchemy cases, so `validationSections` picks the right draft. Do not tighten them.
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

  // Which crafting check this mode actually rolls, and whether it has an authored formula,
  // through the shared five-mode selector rather than a local ternary with no alchemy `none`
  // case. Fed from the DRAFTS, the GM editing those formulas here.
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

  // The TWO reasons a catalogue reaches no roll, in the order they become answerable, as a
  // guard chain rather than nested ternaries. It reads the DRAFT; the store's projection
  // reads the PERSISTED system, and both must exist.
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
  // Gathering d100 is NOT a `noCheck` — the drop-chance roll IS its check — so it has its own
  // cause, with no seam for modifiers.
  const gatheringModifierInertCause = $derived(
    gatheringResolutionMode === 'd100' ? 'noModifierSupport' : inertCauseFor(activeGatheringCheck)
  );

  // The eligibility bag, from the SAME builder the engine uses; subject `null`, this route
  // validating the SYSTEM's selection.
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
  // The gathering check's shape is the economy's mode: d100 is the fixed read-only roll.
  const gatheringD100 = $derived(gatheringResolutionMode === 'd100');
  const gatheringProgressive = $derived(gatheringResolutionMode === 'progressive');
  const gatheringRouted = $derived(gatheringResolutionMode === 'routed');

  // Optional features the rail already drops, so this answers only for the Validation summary.
  const salvageEnabled = $derived(features?.salvage !== false);
  const gatheringEnabled = $derived(features?.gathering === true);

  // Crafting honours the system breakage authority; the other two only under their flag.
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

  // The AUTHORED mode's own name, from `checksActivityCopy.js`.
  const subsystemModeLabel = (vocabulary, mode) => modeLabelFor(vocabulary, mode, text);

  // One group per in-play subsystem, against its own draft and mode. Salvage is omitted when
  // its feature is off; GATHERING IS NOT OMITTED UNDER d100, validating a selection that
  // reaches no roll being the one owned path for reporting that.
  const validationSections = $derived.by(() => {
    const list = [
      {
        subsystem: 'crafting',
        // THE SLOT, not the resolution mode: one resolver chooses the check AND its rules.
        mode: readinessModeForSlot(activeCraftingCheck.slot),
        // What the GM SELECTED, in the picker's OWN words; the readiness mode would name a mode no
        // editor offers.
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
        components,
      });
    }
    if (gatheringEnabled) {
      list.push({
        subsystem: 'gathering',
        mode: readinessModeForSlot(activeGatheringCheck.slot),
        authoredMode: subsystemModeLabel('gathering', gatheringResolutionMode),
        check: gatheringProgressive ? gatheringCheckProgressive : gatheringCheckRouted,
        modifierContext: buildCheckModifierContext(draftSystem, 'gathering', null),
        gatheringTasks,
      });
    }
    return list;
  });

  // THE SECTION STRIP: membership, counts and dots all derive from the SAME readiness pass.
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
  // The evaluation the active editor stack authors, stated on the stack for its captures.
  const activeEvaluation = $derived(normalizeCheckEvaluation(activeCheck?.evaluation));
  const evaluationAttrs = $derived({
    'data-checks-evaluation-product': activeEvaluation.product,
    'data-checks-evaluation-direction': activeEvaluation.direction,
    'data-checks-target-source': activeEvaluation.target.source,
    'data-checks-adjustment-kind': activeEvaluation.target.adjustmentKind,
  });

  // The Preview-as actor, route-independent so the Validation route names it too.
  let previewActorId = $state(NO_ACTOR_ID);
  const previewActor = $derived(resolvePreviewActor(previewActorId));
  // The Preview-as actor as the editors' character-value fields and strips read it: a copy.
  const previewCharacter = $derived(
    previewActor ? { name: previewActor.name, rollData: cloneRollData(previewActor) } : null
  );

  const activeReadiness = $derived(
    activeActivity
      ? evaluateCheckReadiness(activeCheck || {}, {
          mode: activeMode,
          modifierContext: activeActivity.modifierContext,
          activity: activeActivity.subsystem,
          previewActor: previewCharacter,
          components: activeActivity.components,
          gatheringTasks: activeActivity.gatheringTasks,
        })
      : { checks: [], issues: [], transient: [] }
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
  // GATHERING `d100` IS THE ONLY INERT ROUTE: alchemy `none` is an OFF check, so `routeIsOff`
  // owns it and offers the way back.
  const routeIsInert = $derived(activity === 'gathering' && gatheringD100);
  // The check-OFF state, distinct from INERT: inert is what the MODE does, off is what the GM
  // chose, and the predicate is per activity for the reason "GM Checks Studio" gives.
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
  // The last router request honoured, latched by NONCE, or the effect below drags the strip
  // back the instant the GM clicks anything else; latching on the VALUE is the mirror defect,
  // and `-1` rather than `0` so a first request carrying nonce 0 still lands.
  let adoptedSectionNonce = $state(-1);
  // A section the route does not render must not stay selected, and a NEW router request wins
  // where the route offers it, carrying a deep link across its own route change.
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

  // The Validation rail's "All checks" card, from the SAME pass the route's groups use.
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
        components: row.components,
        gatheringTasks: row.gatheringTasks,
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

  // THE VALIDATION ROW ACTION: this studio's own root, so focus resolves inside THIS route.
  let checksRoot = $state(null);

  // WHAT THE LIVE REGION SAYS: the ACTION'S OUTCOME, not a count, a row action changing no tally.
  let issueAnnouncement = $state('');

  // The destination SECTION PANEL, the focus fallback for a route-only row — the majority here.
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
   * the destination panel exists by the time the focus helper's `queueMicrotask` runs its query;
   * everything after that belongs to `validationAnnouncement.js`. A ROUTE-ONLY ROW IS NORMAL
   * HERE, so the helper resolves `null` and the SECTION PANEL takes the keyboard — leaving focus
   * where it was is not the alternative, the row's button being unmounted by the route change.
   *
   * @param {{activity?: string, section?: string}} target the ROUTE the row carries.
   * @param {string} [focusTarget] the CONTROL's `data-validation-target` value, if it named one.
   * @param {string} [status] A sentence announced ahead of the destination, as Convert's is.
   */
  function selectIssue(target, focusTarget, status = '') {
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
        issueAnnouncement = sentence && status ? `${status} ${sentence}` : sentence;
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

  // THE SECTION NOTICES and THE PANE HEADING, both required by
  // `openspec/specs/ui-system-studio/spec.md` → "GM Checks Studio". The notices read the SAME
  // `activeReadiness` pass the strip's dot is counted from and renders the SAME exported copy
  // the Validation route does; the heading is keyed on the SECTION, the activity being named
  // by the rail, the breadcrumb and the route title.
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

  // WHAT THE FORMULA CARD'S `WHAT ACTUALLY GETS ROLLED` INSET RESTATES: check modifiers are
  // added automatically and never appear in the formula text, so the field a GM types into is
  // not the expression the engine rolls. Fed from the SAME `resolveEligibleModifierIds` pass
  // the section strip counts from. IT MAPS TO THE VIEW SHAPE, and that is the contract:
  // `CheckFormulaFields` takes `[{ id, name, icon }]` where a persistence entry carries
  // `label`, so raw entries rendered `undefined` into every chip's span. Mapped HERE because
  // the component is presentational and its prop is the seam.
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

  // The activity's own words, from `checksActivityCopy.js`.
  const recordNoun = $derived(recordNounFor(activity, text));
  const activityWord = $derived(activityWordFor(activity, text));
  const recordNounPlural = $derived(recordNounPluralFor(activity, text));

  // The failure-result policy of the activity on screen, read by its card and the readout alike.
  const activeFailureResultPolicy = $derived(
    activity === 'salvage'
      ? salvageFailureResultPolicy
      : activity === 'gathering'
        ? gatheringFailureResultPolicy
        : craftingFailureResultPolicy
  );

  // The readout's consumption rows read the ACTIVITY'S OWN failure policy: salvage its item pair
  // and alchemy's simple check its own flag; gathering's rows ignore it (checkReadoutModel.js).
  const previewConsumption = $derived.by(() => {
    if (activity === 'salvage') {
      return { consumeOnFail: consumeComponentOnFail, breakToolsOnFail: salvageBreakToolsOnFail };
    }
    const alchemySimple = craftingAlchemy && alchemyCheckMode === 'simple';
    const consumeOnFail = alchemySimple ? alchemyConsumeOnFail !== false : consumeIngredientsOnFail;
    return { consumeOnFail, breakToolsOnFail };
  });

  const failurePolicyInertNote = $derived(
    inertNoteFor(
      { activity, gatheringD100, resolutionMode, craftingProgressive, salvageProgressive },
      text
    )
  );

  // THE ROLL SECTION'S MODE CALLOUT, in the activity's own vocabulary and on `roll` alone.
  const calloutMode = $derived.by(() => {
    if (activity === 'salvage') return salvageResolutionMode;
    if (activity === 'gathering') return gatheringResolutionMode;
    return resolutionMode;
  });

  // Transient warnings explain themselves here but never feed a dot, badge or tally. Every notice
  // is amber, so blocking issues sort first, as the Validation tab orders its rows (issue 2082).
  const sectionNotices = $derived(
    [...activeReadiness.issues, ...activeReadiness.transient]
      .filter((issue) => sectionForIssue(issue.id) === activeSection)
      .sort((a, b) => blockingRank(a) - blockingRank(b))
      .map((issue) => ({
        id: issue.id,
        // `countFaceMissing` is raised once per face kind, so the kind keeps each notice distinct.
        key: issue.data?.kind ? `${issue.id}:${issue.data.kind}` : issue.id,
        ...checkIssueText(issue.id, issue.data, text),
        action: noticeAction(issue),
      }))
  );
  function blockingRank(issue) {
    return issueRowStatus(issue) === 'block' ? 0 : 1;
  }
  const reviewLabel = text('FABRICATE.Admin.Manager.Checks.Validation.Review', 'Review');

  /** A notice's Review: the control its issue names, else its section, as a Validation row's View. */
  function reviewIssue(issue) {
    selectIssue({ activity, section: activeSection }, issueControl(issue));
  }

  /** The draft writer of the check an activity rolls, chosen as `validationSections` chooses it. */
  function checkWriterFor(subsystem) {
    if (subsystem === 'salvage') {
      if (salvageRouted) return onUpdateSalvageCheckRouted;
      return salvageProgressive ? onUpdateSalvageCheckProgressive : onUpdateSalvageCheckSimple;
    }
    if (subsystem === 'gathering') {
      return gatheringProgressive
        ? onUpdateGatheringCheckProgressive
        : onUpdateGatheringCheckRouted;
    }
    if (craftingRouted) return onUpdateCraftingCheck;
    return craftingProgressive ? onUpdateCraftingCheckProgressive : onUpdateCraftingCheckSimple;
  }

  /**
   * Convert a summing counting formula (issue 2006): staged into the draft, so Save applies it and
   * Discard restores the summing check, then the roll section opens on `Count successes`.
   */
  function convertCheck(subsystem) {
    const section = validationSections.find((row) => row.subsystem === subsystem);
    if (!section?.check) return;
    checkWriterFor(subsystem)(convertCountingFormula(section.check));
    const status = text(
      'FABRICATE.Admin.Manager.Checks.Count.Convert.Status',
      'Converted to count successes. The original formula and DCs are kept.'
    );
    selectIssue({ activity: subsystem, section: 'roll' }, 'checks-product', status);
  }

  /** A notice's one action: Convert where its issue converts, else Review. */
  function noticeAction(issue) {
    const copy = convertActionCopy(issue);
    if (!copy) return { label: reviewLabel, onClick: () => reviewIssue(issue) };
    return {
      label: text(...copy.label),
      description: text(...copy.description),
      onClick: () => convertCheck(activity),
    };
  }

  // ONE previewed record, three readers, so it lives HERE; two copies is how two surfaces
  // disagree about which record is previewed.
  let previewRecordId = $state(DEFAULT_RECORD_ID);
  let previewResult = $state(null);
  let previewRolling = $state(false);

  const previewActors = $derived(activity === 'validation' ? [] : listPreviewActors());

  // THE PROGRESSIVE PREVIEW SANDBOX: a progressive histogram needs an ORDERED list of result
  // difficulties, and that list is SANDBOX STATE ON THE CHECK rather than a record's. Read
  // from the live DRAFT, written back through the usual callback, read by nothing else.
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

  const previewRecords = $derived(
    labelPreviewRecords(
      buildPreviewRecords({
        check: activeCheck,
        defaultLabel: text('FABRICATE.Admin.Manager.Checks.PreviewAs.DefaultRecord', 'Default'),
      }),
      { evaluation: activeEvaluation, progressive: isProgressive },
      text
    )
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
  const previewAbstaining = $derived(previewAbstention(previewPlan, previewCharacter));
  // The same context the runner is handed: it places the modifiers, so a histogram computed
  // without this describes a formula nothing rolls.
  const previewModifier = $derived(previewPlan.args?.craftingModifier ?? null);
  // The previewed actor's flat check-modifier total, which a roll-under strip adds to its target.
  const previewModifierTotal = $derived.by(() => {
    if (!previewActor || !previewModifier) return 0;
    const { scalar } = resolveCheckModifierContribution(
      previewModifier,
      makeRollDataExpressionResolver(previewActor)
    );
    return Number.isFinite(scalar) ? scalar : 0;
  });

  const enumeration = $derived(previewEnumeration(previewPlan, previewAbstaining));
  // `resolved === false` is EXACTLY the unresolved-roll-data refusal, from one signal.
  const previewResolved = $derived(enumeration.reason !== 'unresolved-roll-data');
  // The reachable total range the two-band strip is drawn across; null when the formula is not
  // enumerable, the editor falling back to a window around the DC.
  const previewTrackRange = $derived(previewTrack(enumeration));

  const previewSandbox = $derived({
    difficulties: previewDifficulties,
    awardMode: activeCheck?.awardMode || 'equal',
  });

  const oddsModel = $derived(
    buildOddsModel(
      { plan: previewPlan, enumeration, abstention: previewAbstaining, sandbox: previewSandbox },
      text
    )
  );

  const previewModel = $derived(
    buildReadoutModel(
      {
        plan: previewPlan,
        result: previewResult,
        rolling: previewRolling,
        resolved: previewResolved,
        abstention: previewAbstaining,
        actorName: previewActor?.name ?? '',
        activity,
        activityLabel: activityWord,
        recordNoun,
        failureResultPolicy: activeFailureResultPolicy,
        consumption: previewConsumption,
        sandbox: previewSandbox,
      },
      text
    )
  );

  // A rolled result describes ONE (formula, actor, record, target) tuple, so any move drops it.
  const previewSignatureNow = $derived(
    previewSignature({
      activity,
      mode: activeMode,
      plan: previewPlan,
      actorId: previewActorId,
      record: previewRecord,
      tier: activeCheck?.tiers?.find((tier) => tier.id === previewRecord?.id),
    })
  );
  let adoptedPreviewSignature = $state('');
  $effect(() => {
    if (previewSignatureNow === adoptedPreviewSignature) return;
    adoptedPreviewSignature = previewSignatureNow;
    previewResult = null;
  });
  // A record the check no longer offers must not stay selected.
  $effect(() => {
    if (previewRecords.length === 0) return;
    if (previewRecords.some((record) => record.id === previewRecordId)) return;
    previewRecordId = previewRecords[0].id;
  });

  async function rollPreview() {
    if (previewRolling || previewAbstaining) return;
    const rolledFor = previewSignatureNow;
    previewRolling = true;
    try {
      const result = await runCheckPreview(previewPlan);
      // A result from inputs that have since changed never publishes.
      if (previewSignatureNow === rolledFor) previewResult = result;
    } finally {
      previewRolling = false;
    }
  }

  function selectPreviewRecord(id) {
    previewRecordId = id;
  }

  // A counting Formula card's inset and reading: this preview's placement and its own odds model.
  const countPreview = $derived({ placement: countPreviewPlacement(previewPlan), odds: oddsModel });

  // Spread rather than restated at ten call sites: the prop list IS the contract.
  const routedPreviewProps = $derived({
    previewRecords,
    previewRecordId: previewRecord?.id ?? '',
    previewDcOverride: previewRecord?.dc ?? null,
    previewLabel: previewRecord?.name ?? '',
    previewCharacter,
    previewModifierTotal,
    trackMin: previewTrackRange.min,
    trackMax: previewTrackRange.max,
    countPreview,
    onSelectPreviewRecord: selectPreviewRecord,
  });
  const simplePreviewProps = $derived({
    previewRecords,
    previewRecordId: previewRecord?.id ?? '',
    previewLabel: previewRecord?.name ?? '',
    trackMin: previewTrackRange.min,
    trackMax: previewTrackRange.max,
    previewCharacter,
    previewModifierTotal,
    countPreview,
    onSelectPreviewRecord: selectPreviewRecord,
  });
  const previewActorSummary = $derived(
    previewActorNote({ plan: previewPlan, actor: previewActor }, text)
  );
</script>

<!-- Rendered in BOTH crafting branches from one definition, including where the library
     reaches no roll: a card that disappears reports nothing. -->
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

<!-- Salvage and gathering render the SAME card against their own selection, all three
     read-only in the library and editable in the eligibility control and rule grid. -->
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
     branch from ONE definition. Which policy and which saver it reaches are resolved HERE
     from `activity`, so no call site can pair crafting's value with salvage's saver. -->
{#snippet failurePolicyCard()}
  <CheckFailurePolicy
    {activity}
    {recordNoun}
    {recordNounPlural}
    inertNote={failurePolicyInertNote}
    value={activeFailureResultPolicy}
    onChange={(next) => {
      if (activity === 'salvage') return onUpdateSalvageFailureResultPolicy(next);
      if (activity === 'gathering') return onUpdateGatheringFailureResultPolicy(next);
      return onUpdateCraftingFailureResultPolicy(next);
    }}
  />
{/snippet}

<!-- GATHERING'S On-failure SECTION, from ONE definition for both gathering branches. IT
     RENDERS NO CONSUMPTION TOGGLES, a data fact rather than an omission: gathering has no
     `consumption` block, and what it has is `task.failureOutcome`, cross-referenced here. -->
{#snippet gatheringOnFailureSection()}
  {@render failurePolicyCard()}
  <!-- NEUTRAL, not info: that tint is for LIVE state and this reports the product. -->
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
        THE ROW ACTION'S LIVE REGION, HOSTED HERE rather than in the validation surface: a row
        action routes to another ACTIVITY, unmounting the validation panel — live region included
        — in the update that was supposed to announce. So the `aria-live` element is ALWAYS in the
        DOM, outside the validation branch, with its own `{#if}` inside it. A THIRD CHILD OF THIS
        TWO-ROW GRID IS SAFE because `.visually-hidden` is `position: absolute`.
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
             destination, the button it was activated from being unmounted by the route change, so
             without this focus falls to `<body>`. `-1`, the panel being programmatic. -->
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`checks-panel-${activity === 'validation' ? 'validation' : activeSection}`}
      aria-labelledby={activity === 'validation' ? undefined : `checks-section-${activeSection}`}
      tabindex="-1"
      data-keyboard-focus="true"
      bind:this={sectionPanel}
    >
      <!-- The section's warning dot, explained IN the panel and first in it, as the prototype
           draws it: amber, title over detail, with a Review action. -->
      {#if activity !== 'validation' && !routeIsOff && sectionNotices.length > 0}
        <div class="manager-checks-section-notices" data-checks-section-notices={activeSection}>
          {#each sectionNotices as issue (issue.key)}
            <Notice
              tone="warning"
              title={issue.title}
              detail={issue.detail}
              action={issue.action}
              dataAttr="data-checks-section-notice"
              dataValue={issue.id}
            />
          {/each}
        </div>
      {/if}

      {#if paneHead && !routeIsOff}
        <header class="manager-checks-pane-head" data-checks-pane-head={activeSection}>
          <h2 class="manager-checks-pane-title">{paneHead.title}</h2>
          <p class="manager-checks-pane-lead">{paneHead.lead}</p>
        </header>
      {/if}

      <!-- WHAT THIS MODE DOES stays a callout: it documents the mode, where a notice reports
           THIS check's state. -->
      {#if activity !== 'validation' && !routeIsOff && activeSection === 'roll'}
        <CheckModeCallout
          {activity}
          mode={calloutMode}
          {alchemyCheckMode}
          outcomeCount={outcomeCount ?? 0}
        />
      {/if}

      {#if activity === 'validation'}
        <ChecksValidationTab
          sections={validationSections}
          previewActor={previewCharacter}
          {dirty}
          {dirtyActivities}
          onSelectIssue={selectIssue}
          onConvert={convertCheck}
        />
      {:else if routeIsOff}
        <!-- The check is optional and the GM turned it off, so the way back on is IN the panel. -->
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
        <div class="manager-checks-editor-stack" data-checks-panel="crafting" {...evaluationAttrs}>
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
            <!-- ALCHEMY RENDERS IT TOO: `alchemy simple` is one of the two crafting modes where the
                             reserved `role: 'failure'` group is a LIVE award, and alchemy's own `consumeOnFail`
                             below substitutes for the generic consumption pair, not for this. -->
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
                  icon="fas fa-hammer"
                  section="alchemy-break-tools-on-fail"
                  field="breakToolsOnFail"
                  title={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.BreakToolsOnFail',
                    'Break tools on a failed brew'
                  )}
                  sub={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.BreakToolsOnFailDesc',
                    'A matched brew that fails its check breaks the tools it uses, the same as a failed crafting check. Off by default.'
                  )}
                  toggleLabel={text(
                    'FABRICATE.Admin.SystemSettings.Alchemy.BreakToolsOnFail',
                    'Break tools on a failed brew'
                  )}
                  on={breakToolsOnFail}
                  onToggle={(next) => onUpdateCraftingConsumption({ breakToolsOnFail: next })}
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

          <!-- There is no alchemy `none` branch here: an off alchemy check is an OFF check rather
                         than an inert mode, so it takes the shared `routeIsOff` empty state above. -->
          {#if craftingRouted}
            <CraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              {recordNounPlural}
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
                     `manager-checks-page` class, which a test asserts is absent here. -->
        <div class="manager-checks-editor-stack" data-checks-panel="crafting" {...evaluationAttrs}>
          {#if craftingRouted}
            <CraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              {recordNounPlural}
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
              {previewCharacter}
              {countPreview}
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
            <!-- TWO TOP-LEVEL CARDS plus the note the screen ends with, and no wrapping card: it named
                             a policy the design does not name, and the pane head already says what a failed
                             check costs. `data-failure-consumption` rides the bare list wrapper, which the
                             smoke's anchor and two suites resolve against. -->
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
        <div class="manager-checks-editor-stack" data-checks-panel="salvage" {...evaluationAttrs}>
          {#if salvageRouted}
            <CraftingCheckEditor
              {appliedModifiers}
              modifierPolicy={appliedModifierPolicy}
              {recordNoun}
              {recordNounPlural}
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
              {previewCharacter}
              {countPreview}
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
            <!-- SALVAGE'S On-failure SECTION. The "nothing to set here" empty state it used to render
                             was true of the screen and false of the data, both flags being persisted and
                             reachable from no editor. -->
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
            <!-- d100 RENDERS Modifiers: the card is the one owned path for reporting that a selection
                             reaches no roll. -->
            {@render gatheringModifierCard()}
          {:else if activeSection === 'on-failure'}
            <!-- On-failure renders under d100 too: the policy is per ACTIVITY, not per mode, so hiding
                             it under the one selectable mode hides it always. -->
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
        <div class="manager-checks-editor-stack" data-checks-panel="gathering" {...evaluationAttrs}>
          {#if gatheringProgressive}
            <ProgressiveCraftingCheckEditor
              {previewCharacter}
              {countPreview}
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
              {recordNounPlural}
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
  /* Layout only: each notice is the shared `Notice` primitive and states its own appearance. */
  .manager-checks-section-notices {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin-bottom: var(--fab-space-3);
  }
</style>
