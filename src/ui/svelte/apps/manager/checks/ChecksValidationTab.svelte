<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's Validation ROUTE.

  It renders through the shared `EditorValidationSurface` rather than its own markup: that
  primitive's props are already exactly this surface's needs — a summary medallion, three
  counters, and severity-tagged rows grouped by owner. Selecting an issue deep-links to the
  owning ACTIVITY route AND the section owning the control, through the one
  `CHECK_ISSUE_SECTIONS` map the section dots and the rail badge also read.

  THE HERO STATES THE UNSAVED CONDITION. The badges, dots and counters here are a DRAFT
  PREVIEW, computed on the live draft so a GM sees the consequence of an edit before saving;
  the ENABLE gate reads COMMITTED state. So a draft that clears every blocking issue must NOT
  be reported as "Ready to enable", because enabling would act on the old, unsaved state.

  `sections` is the list of in-play subsystem checks resolved by `ChecksView`; a subsystem that
  is switched off is omitted upstream.
-->
<script>
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { checkIssueCopy, checkTickCopy, interpolate } from './checksCopy.js';
  import { evaluateCheckReadiness, sectionForIssue } from './checksReadiness.js';

  let { sections = [], dirty = false, dirtyActivities = [], onSelectIssue = () => {} } = $props();

  function text(key, fallback, data) {
    const translated = localize(key, data);
    return translated && translated !== key ? translated : fallback;
  }

  const SUBSYSTEM_LABELS = {
    crafting: ['SubsystemCrafting', 'Crafting check'],
    salvage: ['SubsystemSalvage', 'Salvage check'],
    gathering: ['SubsystemGathering', 'Gathering check'],
  };
  const SUBSYSTEM_ICONS = {
    crafting: 'fas fa-hammer',
    salvage: 'fas fa-recycle',
    gathering: 'fas fa-seedling',
  };
  function subsystemLabel(subsystem) {
    const meta = SUBSYSTEM_LABELS[subsystem] || [subsystem, subsystem];
    return text(`FABRICATE.Admin.Manager.Checks.Validation.${meta[0]}`, meta[1]);
  }
  function checkLabel(id) {
    const copy = checkTickCopy(id);
    return text(copy.key, copy.fallback);
  }
  // `data` is the optional interpolation payload an issue carries when its sentence names
  // something. The English fallback is interpolated by hand, so a world with no localization
  // still reads the names rather than a literal `{names}`.
  function issueTitle(id, data) {
    const copy = checkIssueCopy(id);
    return interpolate(text(copy.key, copy.fallback, data), data);
  }

  const evaluated = $derived(
    sections.map((section) => ({
      subsystem: section.subsystem,
      readiness: evaluateCheckReadiness(section.check || {}, {
        mode: section.mode,
        modifierContext: section.modifierContext ?? null,
        activity: section.subsystem,
      }),
    }))
  );

  /**
   * WHICH CONTROL EACH ISSUE NAMES — the `data-validation-target` half of a row's address,
   * keyed by ISSUE ID rather than by section, because a section is not one control: `roll`
   * renders the formula field and the Difficulty card, and only the field is ever the offender.
   * A row's `target` is the ROUTE, resolved through `CHECK_ISSUE_SECTIONS`.
   *
   * ROUTE-ONLY IS A STATED OUTCOME, NEVER A SILENT ONE: a row with no entry here still renders
   * a View button and changes route, simply focusing nothing, and the mounted suite asserts
   * which of the two shapes a given row is. Every registered issue id is accounted for below,
   * with the reason where there is no control to name:
   *
   *  | issue id                        | section   | address              |
   *  |---------------------------------|-----------|----------------------|
   *  | noRollFormula                   | roll      | checks-roll-formula  |
   *  | retiredPlaceholderBreaksFormula | roll      | checks-roll-formula  |
   *  | retiredPlaceholderInFormula     | roll      | checks-roll-formula  |
   *  | danglingTierStepTarget          | triggers  | checks-triggers      |
   *  | multipleTierStepTargets         | triggers  | checks-triggers      |
   *  | unnamedOutcome                  | outcomes  | route-only (a)       |
   *  | noSuccessOutcome                | outcomes  | route-only (a)       |
   *  | rangeInvalid                    | outcomes  | route-only (a)       |
   *  | rangeOverlap                    | outcomes  | route-only (a)       |
   *  | rangeGap                        | outcomes  | route-only (a)       |
   *  | modifierBoundsInverted          | modifiers | route-only (b)       |
   *  | modifierBoundsUnsafe            | modifiers | route-only (b)       |
   *  | modifierExpressionInvalid       | modifiers | route-only (b)       |
   *  | modifiersInertNoCheck           | modifiers | route-only (c)       |
   *  | modifiersInertNoModifierSupport | modifiers | route-only (c)       |
   *  | modifiersInertNoFormula         | modifiers | route-only (c)       |
   *
   * (a) The Outcomes section's tier rows are authored INLINE in the routed and simple check
   *     editors, which are not this change's to stamp; each of the five is about one tier
   *     among several anyway, and the row carries no tier id to pick it out with.
   * (b) The offending control is a row of the modifier catalogue card, again one row among
   *     several, and the issue names the modifiers in its own sentence instead.
   * (c) These three say the SELECTION cannot reach a roll at all — the remedy is the mode or
   *     the formula, not a control on the section the row routes to — so there is nothing on
   *     the destination to point at.
   *
   * The two addresses, and the files that carry them:
   *
   *  - `checks-roll-formula` -> `CheckFormulaFields.svelte`, the roll formula input
   *  - `checks-triggers`     -> `CheckTriggers.svelte`, the trigger list itself, which is a
   *                             SET-level destination: both trigger issues are about the tier
   *                             targets across the whole list, and each trigger's own tier
   *                             control sits inside a collapsed disclosure.
   *
   * @type {Readonly<Record<string, string>>}
   */
  const CHECK_ISSUE_CONTROLS = Object.freeze({
    noRollFormula: 'checks-roll-formula',
    retiredPlaceholderBreaksFormula: 'checks-roll-formula',
    retiredPlaceholderInFormula: 'checks-roll-formula',
    danglingTierStepTarget: 'checks-triggers',
    multipleTierStepTargets: 'checks-triggers',
  });

  // ONE row per check tick and per issue, BUILT in that order, so a group reads as "what holds"
  // then "what does not". An issue's row carries the deep-link target; a satisfied tick has
  // nowhere to go.
  //
  // BUILT IS NOT RENDERED: `EditorValidationSurface` sorts each group's rows with `block` first
  // and a `critical` issue maps to `block`, so a critical issue RISES ABOVE EVERY TICK in its
  // group — the requirement being met, not a defect. Everything else is one rank there, so
  // below the criticals the order this function authors is the order the tab draws.
  //
  // A group with NEITHER still states its result, which is a reachable state: a gathering check
  // in `d100` mode with no eligible modifiers reports no tick and no issue, and an unfiltered
  // map drew a heading over emptiness. Dropping the group instead would read as "gathering was
  // not evaluated", a different and equally wrong claim.
  function rowsFor(subsystem, readiness) {
    const rows = [
      ...readiness.checks.map((check) => ({
        id: check.id,
        title: checkLabel(check.id),
        status: check.satisfied ? 'pass' : 'warn',
        dataAttrs: { 'data-subsystem': subsystem, 'data-satisfied': String(check.satisfied) },
      })),
      ...readiness.issues.map((issue) => ({
        id: issue.id,
        title: issueTitle(issue.id, issue.data),
        status: issue.severity === 'critical' ? 'block' : 'warn',
        target: { activity: subsystem, section: sectionForIssue(issue.id) },
        // NO KEY rather than an empty one for a route-only row: the host resolves any
        // non-empty string, so `focusTarget: ''` would report as focus-wired while focusing
        // nothing.
        ...(CHECK_ISSUE_CONTROLS[issue.id] ? { focusTarget: CHECK_ISSUE_CONTROLS[issue.id] } : {}),
        dataAttrs: {
          'data-subsystem': subsystem,
          'data-issue': issue.id,
          'data-issue-severity': issue.severity,
        },
      })),
    ];
    if (rows.length > 0) return rows;
    return [
      {
        id: 'noIssues',
        title: text('FABRICATE.Admin.Manager.Checks.Validation.NoIssues', 'No issues detected.'),
        status: 'pass',
        dataAttrs: { 'data-subsystem': subsystem, 'data-checks-no-issues': subsystem },
      },
    ];
  }

  const groups = $derived(
    evaluated.map(({ subsystem, readiness }) => ({
      id: subsystem,
      icon: SUBSYSTEM_ICONS[subsystem] || 'fas fa-dice-d20',
      label: subsystemLabel(subsystem),
      dataAttrs: { 'data-checks-validation-section': subsystem },
      rows: rowsFor(subsystem, readiness),
    }))
  );

  // THE RAIL IS A TALLY OF THE ROWS ABOVE IT, and is declared after them for that reason.
  // Counting the readiness objects instead misses two states the tab can reach: an unsatisfied
  // check whose subsystem raised no matching issue paints an amber row nothing tallied, and a
  // subsystem with no tick and no issue draws the synthesised "No issues detected." PASS row.
  // Counting what is RENDERED closes both without either half knowing about the other.
  const counts = $derived.by(() => {
    const tally = { passing: 0, warnings: 0, blocking: 0 };
    for (const group of groups) {
      for (const row of group.rows) {
        if (row.status === 'pass') tally.passing += 1;
        else if (row.status === 'block') tally.blocking += 1;
        else tally.warnings += 1;
      }
    }
    return tally;
  });

  // The hero. Three states, and the UNSAVED one is not decoration: readiness ran against the
  // live DRAFT while enabling reads what is COMMITTED, so a clean draft is not evidence.
  const summary = $derived.by(() => {
    if (counts.blocking > 0) {
      return {
        status: 'block',
        title: text('FABRICATE.Admin.Manager.Checks.Validation.HeroBlocked', 'Blocking issues'),
        sub: text(
          'FABRICATE.Admin.Manager.Checks.Validation.HeroBlockedSub',
          'This system saves while incomplete, but it will not enable until every blocking issue is cleared.'
        ),
      };
    }
    if (dirty) {
      const names = dirtyActivities.map((id) => subsystemLabel(id)).join(', ');
      return {
        status: 'warn',
        title: text(
          'FABRICATE.Admin.Manager.Checks.Validation.HeroUnsaved',
          'Clean, but not saved yet'
        ),
        sub: text(
          'FABRICATE.Admin.Manager.Checks.Validation.HeroUnsavedSub',
          'These results describe your unsaved edits to {activities}. Enabling the system reads what is saved, so save the checks before enabling.'
        ).replace('{activities}', names),
      };
    }
    return {
      status: 'pass',
      title: text('FABRICATE.Admin.Manager.Checks.Validation.HeroReady', 'Ready to enable'),
      sub: text(
        'FABRICATE.Admin.Manager.Checks.Validation.HeroReadySub',
        'Every activity check in this system is complete and consistent.'
      ),
    };
  });
</script>

<!-- THE COUNT AND PILL WORDS ARE NOT PASSED: they are the vocabulary
     `EditorValidationSurface` already defaults to, and a second home for them is what the
     design-system requirement's "lives once" sentence forbids. -->
<div class="manager-checks-validation-route" data-checks-panel="validation">
  <EditorValidationSurface
    title={text('FABRICATE.Admin.Manager.Checks.Validation.Title', 'Validation')}
    intro={text(
      'FABRICATE.Admin.Manager.Checks.Validation.Intro',
      'A crafting system saves even while incomplete, but only enables when every blocking issue is cleared.'
    )}
    {summary}
    {counts}
    {groups}
    rowDataAttr="data-checks-validation-check"
    {onSelectIssue}
  />
</div>
