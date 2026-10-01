<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's Validation ROUTE, rendered through the shared `EditorValidationSurface`
  rather than its own markup. Selecting an issue deep-links to the owning ACTIVITY route AND the
  section owning the control, through the one `CHECK_ISSUE_SECTIONS` map the section dots and the
  rail badge also read.

  THE HERO STATES THE UNSAVED CONDITION: the badges, dots and counters are a DRAFT PREVIEW while
  the ENABLE gate reads COMMITTED state, so a draft that clears every blocking issue must NOT be
  reported as "Ready to enable". `sections` is the list of in-play subsystem checks `ChecksView`
  resolves; a subsystem that is switched off is omitted upstream. A transient warning names the
  Preview-as actor: it renders as a row but is never counted in the tally or the hero. A summing
  formula that converts carries `Convert to count successes` in place of View, which calls
  `onConvert(subsystem)`; the host stages the conversion (issue 2006).
-->
<script>
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { checkIssueText, checkTickCopy, convertActionCopy } from './checksCopy.js';
  import { evaluateCheckReadiness, issueControl, sectionForIssue } from './checksReadiness.js';
  import { checksValidationRowStates, issueRowStatus } from './checksValidationRows.js';

  let {
    sections = [],
    // The Preview-as character `{ name, rollData }`, or null.
    previewActor = null,
    dirty = false,
    dirtyActivities = [],
    onSelectIssue = () => {},
    onConvert = () => {},
  } = $props();

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

  const evaluated = $derived(
    sections.map((section) => ({
      subsystem: section.subsystem,
      readiness: evaluateCheckReadiness(section.check || {}, {
        mode: section.mode,
        modifierContext: section.modifierContext ?? null,
        activity: section.subsystem,
        previewActor,
        components: section.components,
        gatheringTasks: section.gatheringTasks,
      }),
    }))
  );

  // ONE ROW PER FAULT (issue 2083): `checksValidationRowStates` pairs a failing check with the
  // issue it owns, so the readiness checklist line keeps its tick or cross on the SAME row the
  // issue's severity and sentence render on, rather than adding a second "Warning" row beside it.
  // BUILT IS NOT RENDERED: under `issuesFirst` the surface sorts each group blocking, then
  // warning, then pass, so every issue rises above every tick (issue 2130), and within a rank the
  // order authored here is the order drawn.
  //
  // A group with NEITHER still states its result, which is reachable: a gathering check in
  // `d100` mode with no eligible modifiers reports no tick and no issue, and dropping the group
  // would read as "gathering was not evaluated", a different and equally wrong claim.
  function convertAction(subsystem, issue) {
    const copy = convertActionCopy(issue);
    if (!copy) return {};
    const onAction = () => onConvert(subsystem);
    return { action: { labelKey: copy.label[0], descriptionKey: copy.description[0], onAction } };
  }

  function issueRow(subsystem, issue, { transient = false, checkId = '', status } = {}) {
    const control = issueControl(issue);
    return {
      id: checkId || issue.id,
      ...checkIssueText(issue.id, issue.data, text),
      status: status ?? issueRowStatus(issue),
      transient,
      target: { activity: subsystem, section: sectionForIssue(issue.id) },
      // NO KEY rather than an empty one for a route-only row: the host resolves any non-empty
      // string, so `focusTarget: ''` would report as focus-wired while focusing nothing.
      ...(control ? { focusTarget: control } : {}),
      ...convertAction(subsystem, issue),
      dataAttrs: {
        'data-subsystem': subsystem,
        'data-issue': issue.id,
        'data-issue-severity': issue.severity,
        ...(checkId && { 'data-satisfied': 'false' }),
        ...(transient && { 'data-issue-transient': '' }),
      },
    };
  }

  // `status` rides from `checksValidationRowStates` rather than defaulting to 'pass' here: an
  // unsatisfied check no issue claims is a WARN cross, never a false-green pass (issue 2106 review).
  function tickRow(subsystem, checkId, satisfied, status) {
    return {
      id: checkId,
      title: checkLabel(checkId),
      status,
      dataAttrs: { 'data-subsystem': subsystem, 'data-satisfied': String(satisfied) },
    };
  }

  function rowsFor(subsystem, readiness) {
    const rows = [
      ...checksValidationRowStates(readiness).map(({ checkId, satisfied, issue, status }) =>
        issue
          ? issueRow(subsystem, issue, { checkId, status })
          : tickRow(subsystem, checkId, satisfied, status)
      ),
      ...(readiness.transient ?? []).map((issue) =>
        issueRow(subsystem, issue, { transient: true })
      ),
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

  // THE RAIL IS A TALLY OF THE ROWS ABOVE IT, declared after them for that reason: counting
  // the readiness objects instead misses an unsatisfied check whose subsystem raised no
  // matching issue, and a subsystem with no tick and no issue whose PASS row is synthesised.
  const counts = $derived.by(() => {
    const tally = { passing: 0, warnings: 0, blocking: 0 };
    for (const group of groups) {
      for (const row of group.rows) {
        if (row.transient) continue;
        if (row.status === 'pass') tally.passing += 1;
        else if (row.status === 'block') tally.blocking += 1;
        else tally.warnings += 1;
      }
    }
    return tally;
  });

  // The hero. Four states, and the UNSAVED one is not decoration: readiness ran against the
  // live DRAFT while enabling reads what is COMMITTED.
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
    if (counts.warnings > 0) {
      return {
        status: 'warn',
        title: text('FABRICATE.Admin.Manager.Validation.SummaryWarnings', 'Enabled with warnings'),
        sub: text(
          'FABRICATE.Admin.Manager.Validation.SummaryWarningsSub',
          'Saves and enables — review the warnings when you can.'
        ),
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
     `EditorValidationSurface` defaults to, and a second home is what the design-system
     requirement's "lives once" sentence forbids. -->
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
    issuesFirst={true}
    {onSelectIssue}
  />
</div>
