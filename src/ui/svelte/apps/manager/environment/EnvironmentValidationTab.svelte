<!-- Svelte 5 runes mode -->
<!--
  The environment editor's Validation tab, on the shared `EditorValidationSurface` (issue 1517).

  It was the last hand-rolled validation screen in the manager: two bordered cards, a tick/cross
  check list and a severity-chipped issue list, with no verdict and no counts. That arrangement was
  ADJUDICATED at issue 1444 as a different surface rather than an unconverted one, and issue 1517
  overturns that ruling deliberately — `spec.md`'s "Validation is one screen everywhere" now asks
  for the same verdict, the same counts rail and the same grouped rows on every editor, so a second
  arrangement here is the thing the requirement forbids rather than an exemption from it. The
  overturn is recorded where the old ruling lived, in `scripts/lib/designSystemPrimitives.js`.

  ── THREE THINGS THE ADOPTION HAD TO ANSWER ──────────────────────────────────────────────────

  (a) `severity: 'info'` HAS NO HOME IN THE ROW VOCABULARY, so it collapses to `warn` HERE.
  `environmentReadiness.js` emits `info` for the two notes that state a fact without grading it —
  a picked record that does not match, and a locally excluded one — and the surface's row words are
  `pass | warn | block` only. Fed `info` verbatim the row would draw a GREEN TICK beside "composes
  anyway" and a pill reading `undefined`. The collapse is a PRESENTATION mapping in this file,
  exactly where `checks/ChecksValidationTab` maps `critical` to `block`; `environmentReadiness.js`
  is not edited, because `info` is still the right domain severity and the tab badge counts read
  it. The two notes are therefore amber and they feed the Warnings count. The count vocabulary is
  closed, so there is no Info tile and none is invented.

  (b) TWO VERBS DOWN ONE LIST. The deep link says "View task" beside "View event", and the
  surface's `viewLabel` is a single scalar — so a naive conversion would replace two distinct
  accessible names with one "View". Each row carries its own `viewLabel` KEY instead, which the
  surface prefers over its default. Both `lang/en.json` keys keep their consumer and both names
  survive.

  (c) `onSelectRecord(kind, id)` TAKES TWO ARGUMENTS. That is what the surface's two-field row
  contract is for: `target` is the ROUTE and `focusTarget` the CONTROL, passed positionally, so
  this tab spends them as its own `(kind, recordId)` pair with no adapter and no composite string.
  The reuse is deliberate rather than a type violation — this deep link OPENS A DIFFERENT RECORD
  on another tab; it is not the focus move the other five surfaces wire, and there is no control
  on this tab to move focus to.

  Only an issue that names a record carries either field, so the View button renders on exactly
  the rows it rendered before. `viewDataAttr` carries the route, which reproduces
  `data-environment-issue-action="task"` and `="event"` verbatim — the `data-` prefix is part of
  the prop's VALUE, because the surface uses it as the whole attribute name.
-->
<script>
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { evaluateEnvironmentReadiness } from './environmentReadiness.js';

  let { environment = null, composition = { counts: {} }, onSelectRecord = () => {} } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const readiness = $derived(evaluateEnvironmentReadiness(environment || {}, composition || {}));

  const CHECK_LABELS = {
    hasName: ['CheckName', 'Has a name'],
    hasDescription: ['CheckDescription', 'Has a description'],
    hasBiome: ['CheckBiome', 'Has at least one biome'],
    hasDanger: ['CheckDanger', 'Has a danger level'],
    hasCompositionMode: ['CheckCompositionMode', 'Has a composition mode'],
    hasAvailableTask: ['CheckAvailableTask', 'Has at least one available task'],
  };
  const ISSUE_LABELS = {
    noAvailableTasks: ['IssueNoAvailableTasks', 'No tasks are available to players.'],
    activeNoComposition: [
      'IssueActiveNoComposition',
      'Environment is active but has no valid task composition.',
    ],
    staleIncluded: [
      'IssueStaleIncluded',
      'An included task or event does not match this environment, and composes anyway.',
    ],
    noScene: ['IssueNoScene', 'No scene is linked.'],
    noEventsAtDanger: ['IssueNoEventsAtDanger', 'Danger is set but no events are available.'],
    taskNoDescription: [
      'IssueTaskNoDescription',
      'Available task has no player-facing description.',
    ],
    locallyExcluded: ['IssueLocallyExcluded', 'Some tasks or events are excluded locally.'],
  };
  const RECORD_ISSUE_LABELS = {
    staleIncluded: {
      task: [
        'IssueStaleIncludedTask',
        'The task "{name}" does not match this environment, and composes anyway.',
      ],
      event: [
        'IssueStaleIncludedEvent',
        'The event "{name}" does not match this environment, and composes anyway.',
      ],
    },
    taskNoDescription: {
      task: ['IssueTaskNoDescriptionTask', 'The task "{name}" has no player-facing description.'],
    },
  };

  /** The two verbs the deep link renders, as keys the surface resolves per row. */
  const VIEW_LABEL_KEYS = {
    task: 'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewTask',
    event: 'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewEvent',
  };

  function recordKind(issue) {
    return issue.recordKind === 'event' ? 'event' : 'task';
  }

  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${meta[0]}`, meta[1]);
  }
  function issueTitle(issue) {
    const kind = recordKind(issue);
    const recordMeta = issue.recordName ? RECORD_ISSUE_LABELS[issue.id]?.[kind] : null;
    if (recordMeta) {
      return text(
        `FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${recordMeta[0]}`,
        recordMeta[1]
      ).replace('{name}', issue.recordName);
    }
    const meta = ISSUE_LABELS[issue.id] || [issue.id, issue.id];
    const base = text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${meta[0]}`, meta[1]);
    return issue.recordName
      ? `${kind === 'event' ? 'Event' : 'Task'} "${issue.recordName}": ${base}`
      : base;
  }

  /**
   * One issue's ROW status. See (a) in the header: `info` is not a row word, and collapsing it to
   * `pass` would put a green tick beside a note that says something composes anyway.
   *
   * @param {string} severity the domain severity, unchanged on the row's own `data-` hook
   * @returns {string} one of the surface's three row words
   */
  function issueStatus(severity) {
    return severity === 'critical' ? 'block' : 'warn';
  }

  const counts = $derived({
    passing: readiness.checks.filter((check) => check.satisfied).length,
    warnings: readiness.issues.filter((issue) => issue.severity !== 'critical').length,
    blocking: readiness.issues.filter((issue) => issue.severity === 'critical').length,
  });

  const readinessRows = $derived(
    readiness.checks.map((check) => ({
      id: check.id,
      title: checkLabel(check.id),
      status: check.satisfied ? 'pass' : 'warn',
      dataAttrs: { 'data-satisfied': String(check.satisfied) },
    }))
  );

  // A ROW ID IS UNIQUE WITHIN ITS GROUP, which is a constraint the card list did not have: the
  // surface keys each row by `group-id`, and two issue ids repeat by design — one `staleIncluded`
  // per non-matching record and one `taskNoDescription` per undescribed task. The record id
  // disambiguates them; the `data-issue` hook keeps the bare issue id, which is what selectors
  // and the smoke harness read.
  //
  // A GROUP WITH NO ROWS STILL STATES ITS RESULT. An empty issue list used to say "No issues
  // detected." in so many words, and a filtered-away group would replace that with a heading over
  // nothing — so the sentence becomes a passing row rather than disappearing.
  const issueRows = $derived.by(() => {
    if (readiness.issues.length === 0) {
      return [
        {
          id: 'noIssues',
          title: text(
            'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.NoIssues',
            'No issues detected.'
          ),
          status: 'pass',
          dataAttrs: { 'data-environment-no-issues': '' },
        },
      ];
    }
    return readiness.issues.map((issue) => {
      const kind = recordKind(issue);
      return {
        id: issue.recordId ? `${issue.id}-${issue.recordId}` : issue.id,
        title: issueTitle(issue),
        status: issueStatus(issue.severity),
        dataAttrs: { 'data-issue': issue.id, 'data-issue-severity': issue.severity },
        ...(issue.recordId
          ? { target: kind, focusTarget: issue.recordId, viewLabel: VIEW_LABEL_KEYS[kind] }
          : {}),
      };
    });
  });

  // Readiness first, then issues: the order the two cards were drawn in, kept as the group order.
  const groups = $derived([
    {
      id: 'readiness',
      icon: 'fas fa-clipboard-check',
      label: text(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Readiness',
        'Environment readiness'
      ),
      dataAttrs: { 'data-validation-section': 'readiness' },
      rows: readinessRows,
    },
    {
      id: 'issues',
      icon: 'fas fa-triangle-exclamation',
      label: text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Issues', 'Issues'),
      dataAttrs: { 'data-validation-section': 'issues' },
      rows: issueRows,
    },
  ]);

  const summary = $derived.by(() => {
    if (counts.blocking > 0) {
      return {
        status: 'block',
        title: text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.SummaryBlocked',
          'Cannot be enabled'
        ),
        sub: text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.SummaryBlockedSub',
          'Clear every blocking issue before this environment can be enabled.'
        ),
      };
    }
    if (counts.warnings > 0) {
      return {
        status: 'warn',
        title: text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.SummaryWarnings',
          'Enabled with warnings'
        ),
        sub: text(
          'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.SummaryWarningsSub',
          'Saves and enables — review the warnings when you can.'
        ),
      };
    }
    return {
      status: 'pass',
      title: text(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.SummaryAllClear',
        'All clear'
      ),
      sub: text(
        'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.SummaryAllClearSub',
        'Every readiness check passes. Ready to enable.'
      ),
    };
  });

  const tabTitle = $derived(
    text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Title', 'Validation')
  );
</script>

<EditorValidationSurface
  title={tabTitle}
  intro={text(
    'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Intro',
    'An environment saves even while incomplete, but only enables when every blocking issue is cleared.'
  )}
  {summary}
  {counts}
  countLabels={{
    passing: text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.CountPassing', 'Passing'),
    warnings: text(
      'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.CountWarnings',
      'Warnings'
    ),
    blocking: text(
      'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.CountBlocking',
      'Blocking'
    ),
  }}
  {groups}
  statusLabels={{
    pass: text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.StatusPass', 'Pass'),
    warn: text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.StatusWarn', 'Warning'),
    block: text(
      'FABRICATE.Admin.Manager.EnvironmentEditor.Validation.StatusBlock',
      'Blocks enable'
    ),
  }}
  viewDataAttr="data-environment-issue-action"
  hookAttrs={{
    root: { 'data-environment-tab': 'validation', 'aria-label': tabTitle },
  }}
  onSelectIssue={(kind, id) => onSelectRecord(kind, id)}
/>
