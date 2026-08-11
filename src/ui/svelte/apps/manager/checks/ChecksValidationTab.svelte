<!-- Svelte 5 runes mode -->
<!--
  The Checks Studio's Validation ROUTE (issue 1096; it was a tab).

  It renders through the shared `EditorValidationSurface` rather than its own markup: that
  primitive's props are already exactly this surface's needs — a summary medallion, three
  counters, and severity-tagged rows grouped by owner — and the recipe editor's validation
  tab has been on it since issue 883. Selecting an issue deep-links to the owning ACTIVITY
  route AND the section that owns the control, through the one
  `CHECK_ISSUE_SECTIONS` map the section dots and the rail badge also read.

  ## The hero states the unsaved condition (DN4)

  The badges, dots and counters on this screen are a DRAFT PREVIEW: they are computed on
  the live draft so a GM sees the consequence of an edit before saving. The ENABLE gate is
  not — it reads committed state. So a draft that clears every blocking issue must NOT be
  reported as "Ready to enable", because enabling would act on a system that still carries
  the old, unsaved state. The hero says so explicitly instead of claiming readiness for
  state that is not persisted.

  `sections` is the list of in-play subsystem checks resolved by ChecksView:
  `[{ subsystem, mode, check, modifierContext }]`. A subsystem that is switched off is
  omitted upstream.
-->
<script>
  import EditorValidationSurface from '../EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { checkIssueCopy, checkTickCopy } from './checksCopy.js';
  import { evaluateCheckReadiness, sectionForIssue } from './checksReadiness.js';

  let { sections = [], dirty = false, dirtyActivities = [], onSelectIssue = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
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
  function issueTitle(id) {
    const copy = checkIssueCopy(id);
    return text(copy.key, copy.fallback);
  }

  const evaluated = $derived(
    sections.map((section) => ({
      subsystem: section.subsystem,
      readiness: evaluateCheckReadiness(section.check || {}, {
        mode: section.mode,
        modifierContext: section.modifierContext ?? null,
      }),
    }))
  );

  const counts = $derived.by(() => {
    let passing = 0;
    let warnings = 0;
    let blocking = 0;
    for (const { readiness } of evaluated) {
      passing += readiness.checks.filter((check) => check.satisfied).length;
      warnings += readiness.issues.filter((issue) => issue.severity !== 'critical').length;
      blocking += readiness.issues.filter((issue) => issue.severity === 'critical').length;
    }
    return { passing, warnings, blocking };
  });

  // ONE row per check tick and per issue, in that order, so a group reads as "what holds"
  // followed by "what does not". An issue's row carries the deep-link target; a satisfied
  // tick has nowhere to go.
  //
  // A group with NEITHER still states its result (issue 1096). That is a reachable state, not
  // a hypothetical: a gathering check in `d100` mode with no eligible check modifiers reports
  // no tick and no issue, and an unfiltered map then drew a `GATHERING CHECK` heading with a
  // rule under it and nothing else — a heading over emptiness, where the surface it replaced
  // said "No issues detected." in so many words. The group is kept rather than dropped
  // because its ABSENCE would read as "gathering was not evaluated", which is a different and
  // equally wrong claim.
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
        title: issueTitle(issue.id),
        status: issue.severity === 'critical' ? 'block' : 'warn',
        target: { activity: subsystem, section: sectionForIssue(issue.id) },
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

  // The hero. Three states, and the UNSAVED one is not a decoration: `evaluateCheckReadiness`
  // above ran against the live DRAFT, while enabling the system reads what is committed, so
  // a clean draft is not evidence that the system may be enabled.
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

<div class="manager-checks-validation-route" data-checks-panel="validation">
  <EditorValidationSurface
    title={text('FABRICATE.Admin.Manager.Checks.Validation.Title', 'Validation')}
    intro={text(
      'FABRICATE.Admin.Manager.Checks.Validation.Intro',
      'A crafting system saves even while incomplete, but only enables when every blocking issue is cleared.'
    )}
    {summary}
    {counts}
    countLabels={{
      passing: text('FABRICATE.Admin.Manager.Checks.Validation.CountPassing', 'Passing'),
      warnings: text('FABRICATE.Admin.Manager.Checks.Validation.CountWarnings', 'Warnings'),
      blocking: text('FABRICATE.Admin.Manager.Checks.Validation.CountBlocking', 'Blocking'),
    }}
    {groups}
    statusLabels={{
      pass: text('FABRICATE.Admin.Manager.Checks.Validation.StatusPass', 'Pass'),
      warn: text('FABRICATE.Admin.Manager.Checks.Validation.StatusWarn', 'Warning'),
      block: text('FABRICATE.Admin.Manager.Checks.Validation.StatusBlock', 'Blocks enable'),
    }}
    rowDataAttr="data-checks-validation-check"
    {onSelectIssue}
  />
</div>
