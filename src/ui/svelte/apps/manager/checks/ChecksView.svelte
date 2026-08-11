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
  import RadioCardGroup from '../RadioCardGroup.svelte';
  import ToggleCard from '../ToggleCard.svelte';
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
  import { checkIssueCopy } from './checksCopy.js';
  import {
    buildCheckModifierContext,
    resolveActiveCraftingCheckFormula,
    resolveActiveGatheringCheckFormula,
    resolveActiveSalvageCheckFormula,
    resolveEligibleModifierIds,
  } from '../../../../../systems/checkModifierResolver.js';

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
    // The ONE system-level check-modifier catalogue (issue 770, reshaped by 1055 and
    // moved up by 1095). It is shared by all three activities and edited on the crafting
    // route only; salvage and gathering render its entries read-only.
    checkModifiers = [],
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
    onOpenActivity = () => {},
    onToggleCheckActive = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  /** The Validation route's own sentence for a readiness issue — the same one, not a copy. */
  function issueSentence(id) {
    const copy = checkIssueCopy(id);
    return text(copy.key, copy.fallback);
  }

  // The system-level alchemy check-mode selector (issue 554). For an alchemy
  // system this renders at the TOP of the crafting route's roll section, above the
  // per-mode editor: none (no check → the read-only "resolves without a check" notice),
  // simple (the pass/fail editor), or tiered (the routed outcome-tier editor).
  // Selecting a mode persists live via `onSetAlchemyCheckMode` (spread + refresh
  // in the store), swapping the editor below. Labels/copy reuse the shared
  // SystemSettings.Alchemy.CheckMode* strings. The icons read as "no roll at all",
  // "one roll" and "a staircase of outcome tiers".
  const ALCHEMY_CHECK_MODE_OPTIONS = [
    {
      value: 'none',
      icon: 'fas fa-ban',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNone',
      fallback: 'No check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeNoneDesc',
      descFallback:
        'A matched brew always succeeds and produces its single result set. No crafting check.',
    },
    {
      value: 'simple',
      icon: 'fas fa-dice-d20',
      labelKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimple',
      fallback: 'Simple check',
      descKey: 'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeSimpleDesc',
      descFallback:
        'A mandatory pass/fail check. On a pass the success result set is produced; on a fail the reserved failure result set is.',
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
  const alchemyNone = $derived(craftingAlchemy && alchemyCheckMode === 'none');

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
  const gatheringModifierInertCause = $derived(inertCauseFor(activeGatheringCheck));

  // The one bag the readiness evaluator resolves eligibility through, built by the SAME
  // builder the engine threads to its check runners rather than a second literal of the
  // same shape (issue 1095). The subject is `null`: this route validates the SYSTEM's
  // selection, and no individual recipe, component or task is in scope here.
  const draftSystem = $derived({
    checkModifiers,
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
        // What the GM SELECTED, for display. It is a different vocabulary from the readiness
        // mode on purpose — that one collapses every no-check mode to `none`, and a rail row
        // reading "Gathering · none" names a mode no economy editor offers.
        authoredMode: craftingAlchemy ? alchemyCheckMode : resolutionMode,
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
        authoredMode: salvageResolutionMode,
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
        authoredMode: gatheringResolutionMode,
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
  const routeIsInert = $derived(
    (activity === 'crafting' && alchemyNone) || (activity === 'gathering' && gatheringD100)
  );
  // The check-OFF state: a check the GM has switched off. Distinct from INERT — inert is
  // what the MODE does and cannot be undone here, off is what the GM chose and the panel's
  // whole job is to offer the way back.
  //
  // The predicate is "this route has a LIVE Active toggle and it is not on", and it is the
  // same three-way rule the rail's own toggle is gated by, restated here rather than
  // inferred from `optional` alone. `optional` does not mean the same thing per activity: on
  // gathering it is `mode === 'd100'`, which is the mode with NO toggle at all — so an
  // `optional && !enabled` reading collapsed the d100 route to the "turn this check on"
  // empty state and took the shipped d100 explanation off the screen, for a check nobody can
  // turn on. Alchemy `none` is the mirror case on crafting.
  const routeIsOff = $derived.by(() => {
    const state = activation?.[activity];
    if (!state || state.enabled === true) return false;
    if (activity === 'gathering') return state.mode !== 'd100';
    return state.optional === true && state.none !== true;
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

  // The read-only catalogue rows on salvage and gathering link back to the ONE route that
  // authors them. It routes rather than opening a second editor: two editors for one
  // catalogue is how two screens come to disagree about which wrote last.
  function goToCraftingCatalogue() {
    onOpenActivity('crafting', 'modifiers');
  }

  const configTitle = text('FABRICATE.Admin.Manager.Checks.Configuration', 'Configuration');
  const pageKicker = text('FABRICATE.Admin.Manager.Checks.PageKicker', 'One per system');
  const page = $derived(PAGES[activity] || PAGES.crafting);

  // The AUTHORED mode, for the "{section} does not apply in {mode} mode" copy — not the
  // readiness mode. Those are different vocabularies on purpose (`readinessModeForSlot`
  // collapses every no-check mode to `none`), and naming the readiness one here would tell a
  // GM standing on the gathering route that Triggers "does not apply in none mode" when the
  // mode they selected is called d100.
  const routeModeLabel = $derived.by(() => {
    if (activity === 'salvage') return salvageResolutionMode;
    if (activity === 'gathering') return gatheringResolutionMode;
    if (craftingAlchemy) return alchemyCheckMode;
    return resolutionMode;
  });
  const modeLabel = $derived(routeModeLabel || resolutionMode);

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
  const activeSectionIssues = $derived(
    activeReadiness.issues
      .filter((issue) => sectionForIssue(issue.id) === activeSection)
      .map((issue) => ({
        id: issue.id,
        tone: issue.severity === 'critical' ? 'warning' : 'info',
        text: issueSentence(issue.id),
      }))
  );
</script>

<!-- Rendered in BOTH crafting branches (alchemy and non-alchemy) from one definition.
     The card renders wherever the crafting route's Modifiers section does, including the
     two states where the catalogue reaches no roll — a catalogue that reaches no roll is
     the defect, and a card that disappears reports nothing. A snippet rather than a second
     call site: the prop list is the contract, and two copies of it drift (and count
     against the new-code duplication gate). -->
{#snippet craftingModifierCard()}
  <CraftingModifierCatalogueCard
    activity="crafting"
    {checkModifiers}
    defaultModifierPolicy={craftingDefaultModifierPolicy}
    defaultModifierIds={craftingDefaultModifierIds}
    maxModifierPicks={craftingMaxModifierPicks}
    inertCause={craftingModifierInertCause}
    onChange={onUpdateCraftingCheckModifiers}
  />
{/snippet}

<!-- Salvage and gathering render the SAME card against their own selection (issue 1095).
     The catalogue rows are read-only there — one surface authors the entries — while the
     eligibility control and the combination-rule grid stay fully editable, because
     deciding which entries apply and how they combine is what each activity owns. -->
{#snippet salvageModifierCard()}
  <CraftingModifierCatalogueCard
    activity="salvage"
    {checkModifiers}
    defaultModifierPolicy={salvageDefaultModifierPolicy}
    defaultModifierIds={salvageDefaultModifierIds}
    maxModifierPicks={salvageMaxModifierPicks}
    inertCause={salvageModifierInertCause}
    onEditCatalogue={goToCraftingCatalogue}
    onChange={onUpdateSalvageCheckModifiers}
  />
{/snippet}

{#snippet gatheringModifierCard()}
  <CraftingModifierCatalogueCard
    activity="gathering"
    {checkModifiers}
    defaultModifierPolicy={gatheringDefaultModifierPolicy}
    defaultModifierIds={gatheringDefaultModifierIds}
    maxModifierPicks={gatheringMaxModifierPicks}
    inertCause={gatheringModifierInertCause}
    dormant
    onEditCatalogue={goToCraftingCatalogue}
    onChange={onUpdateGatheringCheckModifiers}
  />
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
      <!-- The section's own warning dot, explained IN the panel (DN8). It sits above the
           section content rather than inside each branch: every activity route, every mode
           and every section reaches this one insertion point, and a per-branch copy would be
           five places for a sentence to go missing from. -->
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
            <button
              type="button"
              class="manager-button is-primary"
              data-checks-turn-on
              onclick={() => onToggleCheckActive(activity, true)}
            >
              <i class="fas fa-power-off" aria-hidden="true"></i>
              <span>{text('FABRICATE.Admin.Manager.Checks.Off.TurnOn', 'Turn this check on')}</span>
            </button>
          </EmptyState>
        </div>
      {:else if activity === 'crafting' && craftingAlchemy}
        <div class="manager-checks-editor-stack" data-checks-panel="crafting">
          {#if activeSection === 'roll'}
            <section class="manager-inspector-card">
              <h3 class="manager-card-title">
                {text('FABRICATE.Admin.SystemSettings.Alchemy.CheckModeHeading', 'Alchemy check')}
              </h3>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.SystemSettings.Alchemy.CheckModeIntro',
                  'Choose how a matched brew is resolved: with no check, a simple pass/fail check, or a tiered routed check.'
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
            <section class="manager-inspector-card" data-alchemy-behaviour>
              <h3 class="manager-card-title">
                {text(
                  'FABRICATE.Admin.SystemSettings.Alchemy.BehaviourHeading',
                  'Alchemy behaviour'
                )}
              </h3>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.SystemSettings.Alchemy.BehaviourIntro',
                  'How brewing rewards discovery, treats failed attempts, and remembers dead ends. These apply regardless of the check mode above.'
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

          {#if alchemyNone && ['roll', 'outcomes', 'triggers'].includes(activeSection)}
            <section class="manager-inspector-card" data-alchemy-none-readonly>
              <p class="manager-kicker">{pageKicker}</p>
              <h2 class="manager-card-title">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.AlchemyNoneTitle',
                  'Resolves without a check'
                )}
              </h2>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.AlchemyNoneLead',
                  'This alchemy system is set to “No check”, so a matched brew always succeeds and produces its single result set. There is nothing to configure here. Choose Simple or Tiered above to author a crafting check.'
                )}
              </p>
            </section>
          {:else if craftingRouted}
            <CraftingCheckEditor
              value={craftingCheck}
              {resolutionMode}
              section={activeSection}
              breakageAuthority={craftingBreakageAuthority}
              onChange={onUpdateCraftingCheck}
            />
          {:else if craftingSimple}
            <SimpleCraftingCheckEditor
              value={craftingCheckSimple}
              section={activeSection}
              breakageAuthority={craftingBreakageAuthority}
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
              value={craftingCheck}
              {resolutionMode}
              section={activeSection}
              breakageAuthority={craftingBreakageAuthority}
              onChange={onUpdateCraftingCheck}
            />
          {:else if craftingSimple}
            <SimpleCraftingCheckEditor
              value={craftingCheckSimple}
              section={activeSection}
              breakageAuthority={craftingBreakageAuthority}
              onChange={onUpdateCraftingCheckSimple}
            />
          {:else}
            <ProgressiveCraftingCheckEditor
              value={craftingCheckProgressive}
              section={activeSection}
              breakageAuthority={craftingBreakageAuthority}
              onChange={onUpdateCraftingCheckProgressive}
            />
          {/if}

          {#if activeSection === 'on-failure'}
            <section class="manager-inspector-card" data-failure-consumption>
              <h3 class="manager-card-title">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.FailureConsumptionHeading',
                  'Failure consumption policy'
                )}
              </h3>
              <p class="manager-muted">
                {text(
                  'FABRICATE.Admin.Manager.Checks.Crafting.FailureConsumptionIntro',
                  'What happens to a recipe’s ingredients and tools when its crafting check fails. Salvage failures follow their own separate policy.'
                )}
              </p>
              <div class="manager-checks-flag-list">
                <ToggleCard
                  variant="is-info"
                  icon="fas fa-fire-flame-curved"
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
                  onToggle={(next) =>
                    onUpdateCraftingConsumption({ consumeIngredientsOnFail: next })}
                />
                <ToggleCard
                  variant="is-info"
                  icon="fas fa-hammer-crash"
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
            </section>
          {/if}

          {#if activeSection === 'modifiers'}
            {@render craftingModifierCard()}
          {/if}
        </div>
      {:else if activity === 'salvage'}
        <div class="manager-checks-editor-stack" data-checks-panel="salvage">
          {#if salvageRouted}
            <CraftingCheckEditor
              value={salvageCheckRouted}
              showTiers={false}
              section={activeSection}
              breakageAuthority={salvageBreakageAuthority}
              onChange={onUpdateSalvageCheckRouted}
            />
          {:else if salvageProgressive}
            <ProgressiveCraftingCheckEditor
              value={salvageCheckProgressive}
              section={activeSection}
              breakageAuthority={salvageBreakageAuthority}
              onChange={onUpdateSalvageCheckProgressive}
            />
          {:else if salvageSimple}
            <SimpleCraftingCheckEditor
              value={salvageCheckSimple}
              showDcSource={false}
              section={activeSection}
              breakageAuthority={salvageBreakageAuthority}
              onChange={onUpdateSalvageCheckSimple}
            />
          {/if}
          {#if activeSection === 'modifiers'}
            {@render salvageModifierCard()}
          {/if}
          {#if activeSection === 'on-failure'}
            {@render inapplicableSection(
              text('FABRICATE.Admin.Manager.Checks.Sections.OnFailure', 'On failure')
            )}
          {/if}
        </div>
      {:else if activity === 'gathering' && gatheringD100}
        <div class="manager-checks-page" data-checks-panel="gathering" data-gathering-d100-readonly>
          {#if activeSection === 'roll'}
            <section class="manager-inspector-card">
              <p class="manager-kicker">{pageKicker}</p>
              <h2 class="manager-card-title">
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
              <h3 class="manager-card-title">{configTitle}</h3>
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
              value={gatheringCheckProgressive}
              section={activeSection}
              breakageAuthority={gatheringBreakageAuthority}
              onChange={onUpdateGatheringCheckProgressive}
            />
          {:else if gatheringRouted}
            <CraftingCheckEditor
              value={gatheringCheckRouted}
              showTiers={false}
              section={activeSection}
              breakageAuthority={gatheringBreakageAuthority}
              onChange={onUpdateGatheringCheckRouted}
            />
          {/if}
          {#if activeSection === 'modifiers'}
            {@render gatheringModifierCard()}
          {/if}
          {#if activeSection === 'on-failure'}
            {@render inapplicableSection(
              text('FABRICATE.Admin.Manager.Checks.Sections.OnFailure', 'On failure')
            )}
          {/if}
        </div>
      {:else}
        <div class="manager-checks-page" data-checks-panel={activity}>
          <section class="manager-inspector-card">
            <p class="manager-kicker">{pageKicker}</p>
            <h2 class="manager-card-title">{page.title}</h2>
            <p class="manager-muted">{page.lead}</p>
          </section>
          <section class="manager-inspector-card">
            <h3 class="manager-card-title">{configTitle}</h3>
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
      onToggleActive={(enabled) => onToggleCheckActive(activity, enabled)}
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
