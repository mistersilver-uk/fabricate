<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's Validation ROUTE, rendered through the shared `EditorValidationSurface`
  rather than its own markup. Selecting an issue deep-links to the owning ACTIVITY route AND the
  section owning the control, through the one `CHECK_ISSUE_SECTIONS` map the section dots and the
  rail badge also read.

  THE HERO STATES THE UNSAVED CONDITION: the badges, dots and counters are a DRAFT PREVIEW while
  the ENABLE gate reads COMMITTED state, so a draft that clears every blocking issue must NOT be
  reported as "Ready to enable". `sections` is the list of in-play subsystem checks `ChecksView`
  resolves; a subsystem that is switched off is omitted upstream.
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
   * WHICH CONTROL EACH ISSUE NAMES — the `data-validation-target` half of a row's address, keyed
   * by ISSUE ID rather than by section, because a section is not one control: `roll` renders the
   * formula field and the Difficulty card, and only the field is ever the offender. A row's
   * `target` is the ROUTE, resolved through `CHECK_ISSUE_SECTIONS`.
   *
   * ROUTE-ONLY IS A STATED OUTCOME, NEVER A SILENT ONE: such a row still renders a View button
   * and changes route, focusing nothing, and the mounted suite asserts which shape a row is.
   * Most ids are route-only — an Outcomes issue is about one tier among several authored INLINE
   * with no id on the row, a bounds or expression fault NAMES the entries itself, and an
   * inert-selection issue's remedy is the mode or the formula. The two addresses are
   * `checks-roll-formula` and the SET-level `checks-triggers`.
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
  // then "what does not"; an issue's row carries the deep-link target and a satisfied tick has
  // nowhere to go. BUILT IS NOT RENDERED: `EditorValidationSurface` sorts each group with
  // `block` first and a `critical` issue maps to `block`, so it RISES ABOVE EVERY TICK — the
  // requirement being met, not a defect — and everything else is one rank, so below the
  // criticals the order authored here is the order drawn.
  //
  // A group with NEITHER still states its result, which is reachable: a gathering check in
  // `d100` mode with no eligible modifiers reports no tick and no issue, and dropping the group
  // would read as "gathering was not evaluated", a different and equally wrong claim.
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
