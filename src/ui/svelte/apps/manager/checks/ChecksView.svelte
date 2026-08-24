<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's per-ACTIVITY route (issue 1096).

  It used to be one view holding four TABS. Those four are now rail ROUTES — `checks-crafting`,
  `checks-salvage`, `checks-gathering`, `checks-validation` — and this component renders
  whichever one is open. `activity` is therefore a prop, not internal state: the rail owns
  the highlight, the breadcrumb and the deep link, and a component that also kept its own
  copy would be a second source of truth for which screen the GM is on.

  A system has exactly one crafting, one salvage and one gathering check — each a singleton
  whose shape is determined by its resolution mode and preserved per mode when modes are
  switched. So an activity route is a single editor page, not a list: there is no create
  action and no "no checks yet" empty state.

  ## The five sections

  Each activity route renders a section STRIP — The roll / Outcomes / Triggers / Modifiers /
  On failure — and one section's content at a time.

  OUTCOMES RENDERS IN EVERY MODE, hosting that mode's own outcome model: the two-outcome
  pass/fail card on `simple`, the `awardMode` selector on `progressive`, the band strip plus
  the tier rows on `routed`. Its count badge is emitted only where there is a tier list to
  count, so `simple` and `progressive` render it unbadged. That is not a stylistic choice:
  `awardMode` is the ONLY authoring control a progressive check has beyond the formula, so
  hiding Outcomes on progressive would remove `CheckAwardMode` from the UI entirely, and no
  unit test would have seen it go.

  Modifiers renders in every mode too, INCLUDING the two that roll nothing — gathering
  `d100` and alchemy `none`. Issue 1055 made the catalogue card render in exactly those two
  states so it can report `noCheck`, and hiding the section it lives in would undo that on
  the one surface a GM consults to find out whether a check works. Any section that cannot
  apply renders the shared `EmptyState` naming the mode rather than blanking the route.

  ## Draft preview, committed enable

  The section dots (and the rail badges the parent derives from the same pass) are computed
  on the LIVE DRAFT, so a GM sees the consequence of an edit before saving. The enable gate
  is not: it reads committed state, and the Validation route says so.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import EmptyState from '../EmptyState.svelte';
  import ManagerButton from '../../../components/ManagerButton.svelte';
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import ToggleCard from '../ToggleCard.svelte';
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

  // `resolutionMode` is the selected system's recipe resolution mode and selects
  // which crafting check editor renders: routed → the outcome-tier editor;
  // simple/alchemy → the simple pass/fail editor; progressive → the formula +
  // crit editor (no DC). `craftingCheck` is the routed draft, `craftingCheckSimple`
  // the simple draft, and `craftingCheckProgressive` the progressive draft (all
  // owned/persisted by the manager root), each with a matching update callback.
  // `salvageResolutionMode` + the salvage drafts drive the Salvage route's editor
  // (simple/routed reuse the crafting editors with recipe-specific bits hidden;
  // progressive reuses the crafting progressive editor).
  let {
    // Which activity route is open. Owned by the router, never by this component.
    activity = 'crafting',
    resolutionMode = 'simple',
    alchemyCheckMode = 'none',
    craftingCheck = null,
    craftingCheckSimple = null,
    craftingCheckProgressive = null,
    // Failure consumption policy (issue 712): the system-level `craftingCheck.consumption`
    // block ({ consumeIngredientsOnFail, breakToolsOnFail }), edited by two live-persisting
    // toggles in the non-alchemy crafting route. The engine applies it on every failed
    // crafting check (and mirrors it for salvage); alchemy resolves consumption through its
    // own `consumeOnFail` flag instead, so these toggles are hidden in alchemy mode.
    craftingConsumption = null,
    // Salvage's OWN failure consumption ({ consumeComponentOnFail, breakToolsOnFail }),
    // persisted since 1.7.0 and reachable from NO editor until issue 1098. The Salvage
    // On-failure section is its first authoring surface. Both defaults are traps —
    // `consumeComponentOnFail` defaults ON, `breakToolsOnFail` defaults OFF — so the
    // store projects them explicitly rather than letting this component re-derive them.
    salvageConsumption = null,
    // The FAILURE-RESULT POLICY per activity (issue 1098): 'never' | 'perRecord' |
    // 'always'. The orthogonal produce axis to the consumption toggles beside it. Read
    // from the PERSISTED system rather than a draft, because it live-persists on select
    // exactly as the consumption toggles do.
    craftingFailureResultPolicy = 'perRecord',
    salvageFailureResultPolicy = 'perRecord',
    gatheringFailureResultPolicy = 'perRecord',
    // The gathering row the rail's `PREVIEW AS` record selector has chosen (issue 1098,
    // DN10), or `null` when none is. The On-failure section cross-references THAT row's
    // `task.failureOutcome` read-only, because this screen is system-level and a system
    // carries many gathering rows — a cross-reference with no subject would have to pick
    // one arbitrarily.
    //
    // IT IS `null` ON EVERY CALL SITE TODAY. The `PREVIEW AS` panel on `main` is a
    // pre-roll card with no control; the selector arrives with the outcome-preview
    // simulator (issue 1097). The cross-reference therefore renders its stated no-record
    // state — which is the state DN10 specifies for exactly this case — and becomes live
    // by threading one prop once that selector exists.
    previewedGatheringTask = null,
    onOpenGatheringTask = () => {},
    // The ONE system-level modifier library (issue 770, reshaped by 1055, moved up by 1095,
    // unified with the gathering character-modifier library by 1117). This screen renders it
    // READ-ONLY for every activity, crafting included, and links to the one surface that
    // authors it: System settings > Modifiers. What Checks owns is the SELECTION.
    modifiers = [],
    // Crafting's own SELECTION over that catalogue: which entries it applies
    // (`defaultModifierIds`), how they combine (`defaultModifierPolicy`) and how many a
    // selecting rule may pick (`maxModifierPicks`). Persisted live via
    // `onUpdateCraftingCheckModifiers`. Rendered for every crafting mode, including
    // the ones where the catalogue reaches no roll — that is what `inertCause` reports.
    craftingDefaultModifierPolicy = 'addAll',
    craftingDefaultModifierIds = [],
    // The cap on how many modifiers a selecting rule may pick (issue 1055). `null`, NOT a
    // number: absence is the "unlimited" value, and a numeric default here would impose a
    // bound the GM never authored on every system that has not been asked.
    craftingMaxModifierPicks = null,
    // The same triple for salvage and for gathering (issue 1095). New: before that change
    // neither activity had a modifier seam at all.
    salvageDefaultModifierPolicy = 'addAll',
    salvageDefaultModifierIds = [],
    salvageMaxModifierPicks = null,
    gatheringDefaultModifierPolicy = 'addAll',
    gatheringDefaultModifierIds = [],
    gatheringMaxModifierPicks = null,
    // Alchemy behaviour flags (issue 713): the three system-level alchemy flags the engine
    // already honours, as live-persisting toggles. Defaults mirror the manager normalizer
    // (all three ON; learnOnCraft joined them in issue 966).
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
    // Tool-breakage authority (issue 419): each editor always shows the unified
    // CheckTriggers editor; under `checkDriven` it also exposes the per-trigger
    // break-tools toggle.
    breakageAuthority = 'toolSpecific',
    // Feature flags gate which subsystem check-breakage controls are reachable:
    // salvage is always on; gathering only when features.gathering === true.
    features = {},
    activation = {},
    // The draft model lives ABOVE the route (issue 1096): the root owns one dirty set
    // across the four activities and one plural Save. These two are read-only reflections
    // of it, for the Validation hero's unsaved condition.
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
    // A section the ROUTER wants opened, which is how a Validation deep link survives the
    // route change it triggers: selecting an issue on Validation routes to another activity,
    // and the section it names has to travel with the route rather than be set on a
    // component instance the router is about to hand a different `activity`.
    requestedSection = '',
    // The IDENTITY of that request (issue 1096). A router request is an EVENT, and an event
    // needs a serial number: latching on the section VALUE strands a repeat. Deep-link to
    // `roll`, click Triggers, deep-link to `roll` again and the second request equalled the
    // latch, so it was swallowed and the GM stayed on Triggers — with cross-activity deep
    // links the common case, that is the ordinary path, not an edge. The router bumps this on
    // every request, so a repeat of the same section is a NEW request and lands.
    requestedSectionNonce = 0,
    // Route to another activity — used by the read-only catalogue's "edit the catalogue"
    // link and by the Validation route's deep links.
    foundrySystemId = '',
    onOpenActivity = () => {},
    // Navigate to the system editor's Modifiers section — the one surface that authors the
    // library. Every activity's card links here now (issue 1117), so there is no
    // crafting-only branch left for it to be absent on.
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

  // The system-level alchemy check-mode selector (issue 554). For an alchemy
  // system this renders at the TOP of the crafting route's roll section, above the
  // per-mode editor: simple (the pass/fail editor) or tiered (the routed outcome-tier
  // editor). Selecting a mode STAGES it on the root's draft — `Save checks` applies it —
  // and swaps the editor below. Labels/copy reuse the shared
  // SystemSettings.Alchemy.CheckMode* strings. The icons read as "one roll" and "a
  // staircase of outcome tiers".
  //
  // "NO CHECK" IS NOT A MODE HERE ANY MORE. The persisted enum still carries `none` — it is
  // what the engine dispatches on, and it is what the rail's Active switch writes when the
  // GM turns the check off — but offering it as a third radio made the on/off decision and
  // the shape decision one control, so the studio had to answer "can this be turned off?"
  // with "no, pick a different mode". Off is now the switch, and this selector answers only
  // the question a mode should: what shape is the check.
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

  // Failure consumption policy toggle states (issue 712). `consumeIngredientsOnFail`
  // defaults ON (`!== false`), `breakToolsOnFail` defaults OFF (`=== true`), matching
  // the manager normalizer so an authored-OFF system does not read back ON.
  const consumeIngredientsOnFail = $derived(
    craftingConsumption?.consumeIngredientsOnFail !== false
  );
  const breakToolsOnFail = $derived(craftingConsumption?.breakToolsOnFail === true);

  // Salvage's own pair (issue 1098), read with the SALVAGE normalizer's defaults, which
  // are not crafting's key names: `consumeComponentOnFail` defaults ON (`!== false`) and
  // `breakToolsOnFail` defaults OFF (`=== true`). Getting the first one wrong inverts an
  // authored OFF rather than merely losing it.
  const consumeComponentOnFail = $derived(salvageConsumption?.consumeComponentOnFail !== false);
  const salvageBreakToolsOnFail = $derived(salvageConsumption?.breakToolsOnFail === true);

  // Only `routedByCheck` uses the tier-routing CraftingCheckEditor. `routedByIngredients`
  // authors its optional pass/fail check via the shared SimpleCraftingCheckEditor
  // (bound to `craftingCheck.simple`), alongside `simple`/`alchemy`.
  // Alchemy is handled by a dedicated first branch in the crafting render (a top-of-route
  // none/simple/tiered selector above the matching editor), so `craftingAlchemy` wins
  // before `craftingRouted`/`craftingSimple` can match. Those two deriveds still include
  // the alchemy cases so `validationSections` selects the right draft (routed for tiered,
  // simple for simple) — do not tighten them without re-checking that.
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

  // Which crafting check this system's resolution mode actually rolls, and whether it
  // carries an authored formula. Resolved through the shared five-mode selector rather
  // than a local rollFormula ternary (issue 1055): a copy had no case for alchemy at
  // `checkMode: 'none'`, which rolls nothing at all, so it reported the tiered/simple
  // slot's formula for a mode that never reaches it.
  //
  // Fed from the DRAFTS, not the persisted system: the GM is editing those formulas on
  // this very route, and a notice that lags behind the field above it is worse than none.
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

  // The TWO reasons a check-modifier catalogue reaches no roll, in the order they become
  // answerable: no check at all, then no formula. Written as a guard chain rather than
  // nested ternaries — the SonarCloud gate fails those, and the ordering is the point.
  // This derivation reads the DRAFT inputs because the GM is editing these formulas here.
  // The store's separate projection reads the PERSISTED system and is consumed by the
  // recipe editor and overview surfaces, which reflect only saved state. Both must exist:
  // the store cannot see unsaved drafts, and the checks card must reflect them immediately
  // for responsive feedback (issue 1055).
  function inertCauseFor(active) {
    if (!active.slot) return 'noCheck';
    if (!active.checkUsable) return 'noFormula';
    return '';
  }

  const craftingModifierInertCause = $derived(inertCauseFor(activeCraftingCheck));

  // The same derivation for the other two activities (issue 1095), through the two
  // sibling resolvers rather than a second copy of the crafting one — all three return
  // the same shape so `inertCauseFor` can answer for any of them.
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
  // Gathering's d100 mode is NOT a `noCheck`. The d100 rolled against each drop's chance IS
  // that mode's check — the roll simply has no seam to add modifiers to yet — so it gets its
  // own cause rather than the generic one, whose sentence claims the mode rolls nothing and
  // tells the GM to switch to a mode that rolls. `resolveActiveGatheringCheckFormula` returns
  // a null slot for it because no sub-config is AUTHORED, which is a different question.
  const gatheringModifierInertCause = $derived(
    gatheringResolutionMode === 'd100' ? 'noModifierSupport' : inertCauseFor(activeGatheringCheck)
  );

  // The one bag the readiness evaluator resolves eligibility through, built by the SAME
  // builder the engine threads to its check runners rather than a second literal of the
  // same shape (issue 1095). The subject is `null`: this route validates the SYSTEM's
  // selection, and no individual recipe, component or task is in scope here.
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
  // The gathering check's shape is the gathering economy's resolution mode. d100
  // is the fixed roll (read-only, no editor); progressive/routed are editable.
  const gatheringD100 = $derived(gatheringResolutionMode === 'd100');
  const gatheringProgressive = $derived(gatheringResolutionMode === 'progressive');
  const gatheringRouted = $derived(gatheringResolutionMode === 'routed');

  // Salvage and gathering are optional features. The rail already drops their children
  // when the feature is off, so this route only has to answer for the Validation summary.
  // Salvage defaults on; gathering is opt-in (defaults off).
  const salvageEnabled = $derived(features?.salvage !== false);
  const gatheringEnabled = $derived(features?.gathering === true);

  // Subsystem-gated breakage authority. Crafting honours the system authority;
  // salvage and gathering only do so when their feature is enabled — otherwise they
  // stay toolSpecific.
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

  // The AUTHORED mode, for the "{section} does not apply in {mode} mode" copy and for the
  // Validation rail's `ALL CHECKS` rows — not the readiness mode. Those are different
  // vocabularies on purpose (`readinessModeForSlot` collapses every no-check mode to `none`),
  // and naming the readiness one here would tell a GM standing on the gathering route that
  // Triggers "does not apply in none mode" when the mode they selected is called d100.
  //
  // IT IS LOCALIZED, and through the SAME strings the rest of the manager already uses
  // (issue 1096). The authored token is an internal identifier, and the three subsystems
  // spell one concept three ways: crafting stores `routedByCheck`, salvage stores `routed`
  // and gathering stores `routed`. Printing those raw put `Crafting · Clean routedByCheck`
  // directly above `Salvage · Clean routed` in one rail card — two camelCase tokens for one
  // mode — while the window's own header badge two panels away said "Routed by check".
  // Reusing the mode pickers' own labels is what makes those three surfaces one vocabulary.
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
    // Alchemy's row names the ALCHEMY CHECK MODE, because that is the choice which decides
    // what alchemy rolls; `alchemy` alone would say nothing about the check being validated.
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

  /**
   * The GM-facing name of an authored mode. An unmapped token falls back to the token
   * itself rather than to a wrong label, so a mode added to a picker without a row here
   * reads as unfinished instead of as another mode.
   */
  function subsystemModeLabel(vocabulary, mode) {
    const entry = SUBSYSTEM_MODE_LABELS[vocabulary]?.[mode];
    return entry ? text(entry[0], entry[1]) : String(mode || '');
  }

  // The Validation route aggregates per-check validation: one group per in-play
  // subsystem, each evaluated against its active draft and resolution mode. Salvage
  // is omitted when its feature is off. GATHERING IS NOT OMITTED UNDER d100
  // (issue 1095): a GM can author a check-modifier selection on the gathering check in
  // any mode, and under d100 that selection reaches no roll. Validating it is the one
  // owned path for reporting that.
  const validationSections = $derived.by(() => {
    const list = [
      {
        subsystem: 'crafting',
        // THE SLOT, not the resolution mode. The check handed over and the rules it is
        // evaluated under are BOTH chosen by `resolveActiveCraftingCheckFormula` — see
        // `readinessModeForSlot` for what a second mapping cost here.
        mode: readinessModeForSlot(activeCraftingCheck.slot),
        // What the GM SELECTED, for display, in the mode picker's OWN words. It is a
        // different vocabulary from the readiness mode on purpose — that one collapses every
        // no-check mode to `none`, and a rail row reading "Gathering · none" names a mode no
        // economy editor offers.
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

  // ── The section strip ───────────────────────────────────────────────────────────────
  //
  // Membership, counts and dots are all derived from the SAME readiness pass the rail
  // badge and the Validation route read, so the three cannot disagree.
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

  // What each activity ROLLS, per its own mode. The two inert states — gathering `d100`
  // and alchemy `none` — have no formula, no tiers and no triggers to author.
  const routeIsRouted = $derived(
    (activity === 'crafting' && craftingRouted) ||
      (activity === 'salvage' && salvageRouted) ||
      (activity === 'gathering' && gatheringRouted)
  );
  // GATHERING `d100` IS THE ONLY INERT ROUTE LEFT. Alchemy `none` used to join it here, on
  // the reading that a mode rolling nothing has nothing to author. It is now the OFF state
  // of an optional check rather than a mode of its own, so it belongs to `routeIsOff` below
  // — which offers the way back — and counting it inert would have suppressed the trigger
  // count for a check the GM can switch on from this very panel.
  const routeIsInert = $derived(activity === 'gathering' && gatheringD100);
  // The check-OFF state: a check the GM has switched off. Distinct from INERT — inert is
  // what the MODE does and cannot be undone here, off is what the GM chose and the panel's
  // whole job is to offer the way back.
  //
  // The predicate is "this route has a LIVE Active toggle and it is not on", and it is the
  // same rule the rail's own toggle is gated by, restated here rather than inferred from
  // `optional` alone. `optional` does not mean the same thing per activity: on gathering it
  // is `mode === 'd100'`, which is the mode with NO toggle at all — so an
  // `optional && !enabled` reading collapsed the d100 route to the "turn this check on"
  // empty state and took the shipped d100 explanation off the screen, for a check nobody can
  // turn on. On crafting, alchemy at `checkMode: 'none'` is precisely the state this SHOULD
  // catch: `optional` is true and `enabled` is false, so it lands on the turn-on empty state.
  const routeIsOff = $derived.by(() => {
    // ALCHEMY ANSWERS FROM ITS OWN MODE, BEFORE THE ACTIVATION BAG. Off-ness for alchemy is
    // fully derivable from `alchemyCheckMode`, which this component already has, so tying it
    // to an optional prop is a seam that breaks the day a caller omits or staleness that bag:
    // `activation` defaults to `{}`, and with no crafting state the checks below return false
    // — which dropped an alchemy `none` mount into the mode branch, rendering the selector
    // with NO option selected and (there being no `{:else}` on the editor chain) no editor at
    // all. The retired `alchemyNone` branch used to absorb that; nothing else would.
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
    // An optional check that is OFF collapses to ONE section: there is nothing to author
    // until it is turned back on, and four sections of empty states is not information.
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
  // The last router request this component has already honoured, latched by its NONCE rather
  // than by the section it names. Some latch is required: without one the effect below would
  // re-apply the standing `requestedSection` on every recomputation and pull the strip back
  // to it the instant the GM clicked anything else — a router request is an EVENT, not a
  // standing instruction, and treating it as the latter makes the strip unusable. Latching on
  // the VALUE overcorrects into the mirror defect: a repeated request for a section already
  // adopted is indistinguishable from the standing one and gets swallowed.
  //
  // `-1` rather than `0`, so the router's very first request — which may legitimately carry
  // nonce 0 — is still a request this component has not honoured.
  let adoptedSectionNonce = $state(-1);
  // A section the current route does not render must not stay selected: switching from a
  // routed crafting check to an OFF simple one would otherwise leave the strip pointing at
  // a section that renders nothing at all. A NEW router request wins where the route offers
  // it, which is what carries a Validation deep link across the route change it triggers.
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

  // The Validation rail's "All checks" card: one row per in-play activity, each stating
  // its mode, its formula and whether anything is outstanding. It is evaluated from the
  // SAME pass the route's groups are, so the rail and the list beside it cannot disagree.
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

  /** Deep-link from the Validation route to the control that raised an issue. */
  function selectIssue(target) {
    if (!target?.activity) return;
    onOpenActivity(target.activity, target.section || 'roll');
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

  // ── The section-level Callout (issue 1096, DN8) ─────────────────────────────────────
  //
  // The strip's warning dot says a section has an open issue; this says WHAT. Without it the
  // GM's only route to the sentence is to leave the route for Validation and deep-link back
  // — a dot that can only be explained somewhere else is a signal with no legend.
  //
  // It is the SAME `activeReadiness` pass the dot is counted from, bucketed by the same
  // `sectionForIssue`, and the SAME copy the Validation route renders (one exported map, not
  // a second set of sentences), so the two surfaces cannot describe one issue differently.
  //
  // Tone splits on the severity the Validation route already splits on: a `critical` issue
  // BLOCKS enabling the system, which is the hazard `warning` is for; a non-blocking one is
  // guidance about how this check will behave, which is `info`.
  // ── The PANE heading (issue 1096) ───────────────────────────────────────────────────
  //
  // The studio opened straight onto a card: nothing on the screen said what the section
  // was for, so a GM arriving on Outcomes read `Check type` as the page. The prototype
  // heads every section pane with a title and one sentence, and this is that pair.
  //
  // Keyed on the SECTION, not the activity, because the section is what the pane shows;
  // the activity is already named by the rail, the breadcrumb and the route title. The
  // Outcomes sentence varies with the mode, which is the one place the two meet: a routed
  // check routes result groups to tiers, a simple one has exactly two outcomes, and a
  // progressive one spends a value down a list.
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

  // ── What the formula card's `WHAT ACTUALLY GETS ROLLED` inset restates ──────────────
  //
  // Check modifiers are added to the roll AUTOMATICALLY and never appear in the formula
  // text, so the field a GM types into is not the expression the engine rolls. The inset
  // shows the difference, and it is fed from the SAME `resolveEligibleModifierIds` pass the
  // section strip counts `Modifiers` from — a second derivation here would let one screen
  // say three modifiers apply while the other drew two chips.
  //
  // IT MAPS TO THE VIEW SHAPE, and that is the contract rather than a convenience.
  // `CheckFormulaFields` documents its prop as `[{ id, name, icon }]` — a persistence entry
  // is `{ id, label, expression, isRollExpression, icon?, min?, max? }` — and this
  // derivation used to hand the raw entries straight through. `label` is not `name`, so
  // every chip rendered `undefined` into an empty span and the inset read
  // `1d20 + @prof + [icon] + [icon] + [icon]`: three modifiers whose whole contribution to
  // the sentence was a glyph, and, since the glyph is `aria-hidden`, three chips with NO
  // accessible name at all.
  //
  // Mapped HERE rather than by reading `label` in the component, because the component is
  // presentational and its prop is the seam: `checkPreview.js` builds `{ id, name, … }`
  // view models for the same screen, one editor already forwards this prop through three
  // layers, and a component that reached into a persistence field would tie the rail's
  // markup to the storage shape. The `|| entry.id` fallback is the catalogue card's own
  // (`modifier.label || modifier.id`) — a label is optional in the persisted shape, so a
  // chip must still name something.
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

  // ── The RECORD NOUN (issue 1096) ────────────────────────────────────────────────────
  //
  // What this activity rolls a check FOR, in the activity's own word. The Difficulty card
  // says "A fixed DC for every {record}", and hard-coding one activity's noun is how a
  // gathering screen comes to talk about recipes. It is localized rather than derived from
  // the route id, because a noun is copy.
  const RECORD_NOUNS = {
    crafting: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Crafting', 'recipe'],
    salvage: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Salvage', 'salvageable item'],
    gathering: ['FABRICATE.Admin.Manager.Checks.RecordNoun.Gathering', 'gathering task'],
  };
  const recordNoun = $derived.by(() => {
    const entry = RECORD_NOUNS[activity] || RECORD_NOUNS.crafting;
    return text(entry[0], entry[1]);
  });

  // The PLURAL of the same noun, sentence-initial (issue 1098). The failure-result
  // policy's `always` card ends "…{records} without one produce nothing", which begins a
  // sentence, so a lower-case singular cannot be reused with an `s` bolted on — and the
  // three activities do not pluralize alike ("salvageable items", "gathering tasks").
  const RECORD_NOUNS_PLURAL = {
    crafting: ['FABRICATE.Admin.Manager.Checks.RecordNoun.CraftingPlural', 'Recipes'],
    salvage: ['FABRICATE.Admin.Manager.Checks.RecordNoun.SalvagePlural', 'Salvageable items'],
    gathering: ['FABRICATE.Admin.Manager.Checks.RecordNoun.GatheringPlural', 'Gathering tasks'],
  };
  const recordNounPlural = $derived.by(() => {
    const entry = RECORD_NOUNS_PLURAL[activity] || RECORD_NOUNS_PLURAL.crafting;
    return text(entry[0], entry[1]);
  });

  // WHERE THE POLICY HAS NO REACH, and why (issue 1098, DN11). The prototype's card ends
  // "Applies to every resolution mode", which is not true of this data model: neither
  // `routedByIngredients` nor `progressive` has an outcome tier or a reserved failure
  // group to mark, and gathering's whole routed path is dormant pending issue 683. The
  // clause is therefore NOT adopted, and a stated reason is rendered in its place — a
  // control that silently does nothing is the outcome this note exists to avoid.
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

  // ── The roll section's mode callout (issue 1096) ────────────────────────────────────
  //
  // The AUTHORED mode for whichever activity is open, in that activity's own vocabulary —
  // the same three fields `routeModeLabel` reads, for the same reason: crafting stores
  // `routedByCheck` where salvage and gathering both store `routed`, so one shared token
  // would name the wrong mode on two routes out of three.
  //
  // It renders on `roll` alone. The callout explains what the mode does with A ROLL, and
  // that statement belongs at the top of the section that authors the roll rather than
  // repeated above every section's cards.
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

  // ── The simulator, the odds histogram and the previewed record (issue 1097) ─────────
  //
  // ONE selection, three readers. The rail's "Preview as" card offers it, the simulator
  // rolls against it and the Outcomes section's band strip is drawn against it — so it
  // lives HERE rather than in any of the three. Two components each holding their own
  // copy is how two surfaces come to disagree about which record is being previewed, and
  // the strip's dual `aria-valuetext` reading ("17 — DC +5 against Uncommon Craft") is a
  // claim about the record the simulator is actually using.
  let previewActorId = $state(NO_ACTOR_ID);
  let previewRecordId = $state(DEFAULT_RECORD_ID);
  let previewResult = $state(null);
  let previewRolling = $state(false);

  const dcWord = text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC');
  const unroutedLabel = text('FABRICATE.Admin.Manager.Checks.Odds.Unrouted', 'No outcome');

  const previewActors = $derived(activity === 'validation' ? [] : listPreviewActors());
  const previewActor = $derived(resolvePreviewActor(previewActorId));

  // ── The progressive PREVIEW SANDBOX (issue 1097) ────────────────────────────────────
  //
  // A progressive check awards by spending its rolled value down an ORDERED list of result
  // difficulties, so its histogram cannot be drawn without one. That list is SANDBOX STATE
  // ON THE CHECK — the GM types an order for this experiment — and not a real record's:
  // this screen previews what a CHECK does, not what a recipe will do, and a Preview-as
  // record supplies a DC rather than an outcome.
  //
  // It is read from the live DRAFT, so the histogram moves with the field, and written back
  // through the SAME per-activity update callback every other progressive edit uses, so it
  // saves with them and survives a reload. Nothing else reads it: no engine path, no
  // readiness rule, and the exporter strips it.
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

  // A progressive check has no DC at all, so labelling its records with one would invent a
  // number the mode does not have.
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
  // THE SAME CONTEXT THE RUNNER IS HANDED, threaded to the two derivations that describe
  // the roll rather than perform it. `buildPreviewCheckArgs` gives the runner an authored
  // formula plus this context and the runner appends the resolved scalar itself, so a
  // histogram or an `avg` computed without it describes a formula nothing rolls.
  const previewModifier = $derived(previewPlan.args?.craftingModifier ?? null);

  const enumeration = $derived(
    previewFormula === ''
      ? { enumerable: false, reason: 'no-dice' }
      : describeFormulaEnumerability(previewFormula, previewActor, {
          craftingModifier: previewModifier,
        })
  );
  // `resolved === false` is EXACTLY the unresolved-roll-data refusal: the enumerability
  // check reads that signal first, so the two can never disagree about whether this
  // formula reduces to a number for this actor.
  const previewResolved = $derived(enumeration.reason !== 'unresolved-roll-data');

  // The reachable total range, which is what the simple check's two-band strip is drawn
  // across. Null when the formula is not enumerable; the editor then falls back to a
  // window around the DC rather than drawing a track it cannot justify.
  const previewTrack = $derived.by(() => {
    if (!enumeration.enumerable) return { min: null, max: null };
    // THE REACHABLE TOTALS, read off the enumeration rather than recomputed as
    // `1 + remainder .. faces + remainder`. There is no single remainder any more: a bounded
    // rolling check modifier contributes a clamped die, so the floor and ceiling are the
    // extremes of the joint space and nothing shorter states them.
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
   * Progressive bucketing, by AWARD COUNT rather than by tier.
   *
   * The ordered difficulties are the check's OWN preview sandbox, not a record's: this
   * screen previews what a CHECK does, and a Preview-as record supplies a DC rather than an
   * outcome. An empty sandbox is a stated absence with the control named, never an invented
   * sample — see `src/systems/progressiveCheckSandbox.js`.
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
   * The "What happens" rows, every one of them read off the SAME result object the engine
   * would act on. Nothing here is inferred from the draft.
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
        icon: 'fas fa-hammer-crash',
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
      // The die the medallion is captioned with, read off the result's own dice bag rather
      // than parsed out of the formula a second time.
      dieLabel: previewResult?.data?.diceGroups?.[0]?.group
        ? `d${String(previewResult.data.diceGroups[0].group).split('d')[1]}`
        : '',
      bandName: band.name,
      bandDetail: band.detail,
      bandSuccess: band.success,
      facts: buildPreviewFacts(previewResult),
    };
  });

  // A rolled result describes ONE (formula, actor, record) tuple. Leaving it on screen
  // after any of those changes would show a total no current configuration produces, so
  // the identity of what was rolled is latched and the readout is dropped when it moves.
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
  // A record the current check no longer offers must not stay selected: switching modes,
  // or deleting the tier a GM was previewing against, would otherwise leave the `<select>`
  // showing a value none of its options carries.
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

  // Spread rather than restated at each of the ten editor call sites. The prop list IS the
  // contract, and ten copies of it drift — and count against the new-code duplication gate.
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

<!-- Rendered in BOTH crafting branches (alchemy and non-alchemy) from one definition.
     The card renders wherever the crafting route's Modifiers section does, including the
     two states where the library reaches no roll — a library that reaches no roll is
     the defect, and a card that disappears reports nothing. A snippet rather than a second
     call site: the prop list is the contract, and two copies of it drift (and count
     against the new-code duplication gate). -->
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

<!-- Salvage and gathering render the SAME card against their own selection (issue 1095).
     Since issue 1117 the crafting card above is identical in kind: all three render the
     library read-only — one surface authors the entries — while the eligibility control and
     the combination-rule grid stay fully editable, because deciding which entries apply and
     how they combine is what each activity owns. -->
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

<!-- The failure-RESULT policy card, rendered by all three activity routes AND by the
     alchemy branch, from ONE definition (issue 1098). A snippet rather than four call
     sites: the prop list is the contract, four copies of it drift, and near-identical
     blocks are what the new-code duplication gate fails on. Which activity's policy and
     which saver it reaches are resolved here from `activity`, so no call site can pair
     crafting's value with salvage's saver. -->
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

<!-- GATHERING'S On-failure SECTION, rendered from ONE definition by both gathering
     branches — `d100` and the two formula-rolled modes — because the section's content is
     the same in all three and only the inert note inside the policy card differs.

     IT RENDERS NO CONSUMPTION TOGGLES, and that is a data fact rather than an omission:
     gathering has no `consumption` block at all, on the check or on the task. What it has
     instead is `task.failureOutcome`, the text/macro feedback a failed attempt dispatches,
     which is authored on the task and is cross-referenced here read-only. -->
{#snippet gatheringOnFailureSection()}
  {@render failurePolicyCard()}
  <Callout
    tone="info"
    text={text(
      'FABRICATE.Admin.Manager.Checks.FailureResults.GatheringDormant',
      'Routed and progressive gathering are still being built, so nothing on this screen changes what a failed gathering attempt does yet. What you set here is kept and takes effect when they arrive.'
    )}
    dataAttr="data-gathering-failure-dormant"
  />
  <section class="manager-inspector-card" data-gathering-failure-outcome>
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
  </section>
{/snippet}

<!-- The one place a section that cannot apply is answered, so the copy names the MODE
     rather than saying "nothing here" five times over. -->
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

<div class="manager-environment-edit-view" data-environment-editor data-checks-editor>
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
    <div
      class="manager-environment-tab-panel"
      role="tabpanel"
      id={`checks-panel-${activity === 'validation' ? 'validation' : activeSection}`}
      aria-labelledby={activity === 'validation' ? undefined : `checks-section-${activeSection}`}
    >
      {#if paneHead && !routeIsOff}
        <header class="manager-checks-pane-head" data-checks-pane-head={activeSection}>
          <h2 class="manager-checks-pane-title">{paneHead.title}</h2>
          <p class="manager-checks-pane-lead">{paneHead.lead}</p>
        </header>
      {/if}

      <!-- The section's own warning dot, explained IN the panel (DN8). It sits above the
           section content rather than inside each branch: every activity route, every mode
           and every section reaches this one insertion point, and a per-branch copy would be
           five places for a sentence to go missing from. -->
      <!-- WHAT THIS MODE DOES. Above the section's own issue callouts: this one is a
           standing statement about the mode, and an issue callout is about THIS check, so
           the general fact reads before the particular one. -->
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
        <!-- The check is optional and the GM turned it off. The way back on is IN the
             panel, because a dead end with the remedy somewhere else is the state this
             primitive exists to avoid. -->
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
            <section class="manager-inspector-card">
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
            </section>
          {/if}

          {#if activeSection === 'on-failure'}
            <!-- ALCHEMY RENDERS IT TOO (issue 1098). `alchemy simple` is one of the two
                 crafting modes where the reserved `role: 'failure'` group is a LIVE award,
                 so omitting the policy here would hide the control from a mode it actually
                 governs. Alchemy's own consumption flag (`consumeOnFail`) stays below,
                 where it already lived — it is alchemy's substitute for the generic
                 consumption pair, not for this. -->
            {@render failurePolicyCard()}
            <section class="manager-inspector-card" data-alchemy-behaviour>
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
                  icon="fas fa-book-sparkles"
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
            </section>
          {/if}

          <!-- There is no alchemy `none` branch here. An alchemy system whose check is off
               is an OFF check, not an inert mode, so it takes the shared `routeIsOff` empty
               state above — the one with the "Turn this check on" button — exactly as an
               optional crafting or salvage check does. The read-only "Resolves without a
               check" card that used to sit here told the GM to pick a mode that no longer
               exists in the selector, and it was unreachable the moment `none` started
               reporting `optional: true`. -->
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
        <!-- Non-alchemy crafting: the per-mode editor plus the system-level failure
             consumption policy (issue 712). The wrapper keeps `data-checks-panel="crafting"`
             (the tests key on it) but deliberately NOT the `manager-checks-page` class,
             which the routed test asserts is absent once the editor renders. -->
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
            <!-- TWO TOP-LEVEL CARDS, as the prototype draws them, plus the note it ends the
                 screen with. The `Failure consumption policy` card that used to wrap them was
                 invented here: it named a policy the design does not name, and the pane head
                 above already says what a failed check costs the character. `data-failure-
                 consumption` rides the bare list wrapper so the smoke's anchor, the mounted
                 suites' lookup and the alchemy absence check all keep resolving.

                 The glyphs are the prototype's `fa-fire` and `fa-hammer` — the arguably more
                 precise `fa-hammer-crash` / `fa-fire-flame-curved` were an exemption, and it
                 has been overruled: the prototype is the authority for appearance. -->
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
            <!-- The sentence the wrapper's description used to carry, restored to where the
                 prototype puts it: the last thing on the screen, and it says where the two
                 policies this screen does NOT govern actually live. -->
            <Callout
              tone="info"
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
            <!-- SALVAGE'S FIRST On-failure SECTION (issue 1098). It rendered the
                 "nothing to set here" empty state, which was true of the screen and false
                 of the data: `consumeComponentOnFail` and `breakToolsOnFail` have been
                 persisted since 1.7.0 and were reachable from no editor, and the
                 failure-result policy is new. -->
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
            <section class="manager-inspector-card">
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
            </section>
            <section class="manager-inspector-card">
              <h3 class="manager-checks-card-title">{configTitle}</h3>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Gathering.D100Hint',
                  'Switch the gathering economy to progressive or routed resolution to define an editable check. Per-task tuning adjusts difficulty, not the roll.'
                )}
              </p>
            </section>
          {:else if activeSection === 'modifiers'}
            <!-- d100 RENDERS Modifiers rather than hiding it (decision 8). The card is the
                 one owned path for reporting that a selection reaches no roll, and it
                 carries the dormancy notice; hiding it would take the report away from the
                 state that needs it most. -->
            {@render gatheringModifierCard()}
          {:else if activeSection === 'on-failure'}
            <!-- On-failure renders under d100 too, for the same reason Modifiers does: the
                 policy is persisted per ACTIVITY, not per mode, so hiding it under the one
                 mode a GM can currently select would hide it always. -->
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
          <section class="manager-inspector-card">
            <p class="manager-kicker">{pageKicker}</p>
            <h2 class="manager-checks-card-title">{page.title}</h2>
            <p class="manager-muted">{page.lead}</p>
          </section>
          <section class="manager-inspector-card">
            <h3 class="manager-checks-card-title">{configTitle}</h3>
            <p class="manager-muted">{page.configHint}</p>
          </section>
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
  /* Layout only. The strip itself is the shared `Callout` primitive and states its own
     appearance; this stacks one or more of them above the section content. */
  .manager-checks-section-callouts {
    display: flex;
    flex-direction: column;
    gap: var(--fab-space-2);
    margin-bottom: var(--fab-space-3);
  }
</style>
