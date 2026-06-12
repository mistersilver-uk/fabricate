<!-- Svelte 5 runes mode -->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { evaluateEnvironmentReadiness } from './environmentReadiness.js';

  let {
    environment = null,
    composition = { counts: {} },
    onSelectRecord = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const readiness = $derived(evaluateEnvironmentReadiness(environment || {}, composition || {}));
  const issuesBy = $derived({
    critical: readiness.issues.filter(issue => issue.severity === 'critical'),
    warning: readiness.issues.filter(issue => issue.severity === 'warning'),
    info: readiness.issues.filter(issue => issue.severity === 'info')
  });

  const CHECK_LABELS = {
    hasName: ['CheckName', 'Has a name'],
    hasDescription: ['CheckDescription', 'Has a description'],
    hasBiome: ['CheckBiome', 'Has at least one biome'],
    hasDanger: ['CheckDanger', 'Has a danger level'],
    hasCompositionMode: ['CheckCompositionMode', 'Has a composition mode'],
    hasAvailableTask: ['CheckAvailableTask', 'Has at least one available task'],
    noStaleIncluded: ['CheckNoStale', 'Has no stale included tasks or events']
  };
  const ISSUE_LABELS = {
    noAvailableTasks: ['IssueNoAvailableTasks', 'No tasks are available to players.'],
    activeNoComposition: ['IssueActiveNoComposition', 'Environment is active but has no valid task composition.'],
    staleIncluded: ['IssueStaleIncluded', 'Included task or event no longer matches the environment.'],
    noScene: ['IssueNoScene', 'No scene is linked.'],
    noEventsAtDanger: ['IssueNoEventsAtDanger', 'Danger is set but no events are available.'],
    taskNoDescription: ['IssueTaskNoDescription', 'Available task has no player-facing description.'],
    locallyExcluded: ['IssueLocallyExcluded', 'Some tasks or events are excluded locally.']
  };
  const RECORD_ISSUE_LABELS = {
    staleIncluded: {
      task: ['IssueStaleIncludedTask', 'The task "{name}" no longer matches this environment.'],
      event: ['IssueStaleIncludedEvent', 'The event "{name}" no longer matches this environment.']
    },
    taskNoDescription: {
      task: ['IssueTaskNoDescriptionTask', 'The task "{name}" has no player-facing description.']
    }
  };

  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${meta[0]}`, meta[1]);
  }
  function issueTitle(issue) {
    const recordKind = issue.recordKind === 'event' ? 'event' : 'task';
    const recordMeta = issue.recordName ? RECORD_ISSUE_LABELS[issue.id]?.[recordKind] : null;
    if (recordMeta) {
      return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${recordMeta[0]}`, recordMeta[1])
        .replace('{name}', issue.recordName);
    }
    const meta = ISSUE_LABELS[issue.id] || [issue.id, issue.id];
    const base = text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${meta[0]}`, meta[1]);
    return issue.recordName ? `${recordKind === 'event' ? 'Event' : 'Task'} "${issue.recordName}": ${base}` : base;
  }
</script>

<section class="manager-environment-tab manager-environment-validation" data-environment-tab="validation" aria-label={text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Title', 'Validation')}>
  <section class="manager-environment-card" data-validation-section="readiness">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Readiness', 'Environment readiness')}</h3>
    <ul class="manager-environment-check-list">
      {#each readiness.checks as check (check.id)}
        <li class={`manager-environment-check ${check.satisfied ? 'is-satisfied' : 'is-unsatisfied'}`} data-check={check.id} data-satisfied={check.satisfied}>
          <i class={check.satisfied ? 'fas fa-circle-check' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
          <span>{checkLabel(check.id)}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="manager-environment-card" data-validation-section="issues">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Issues', 'Issues')}</h3>
    {#if readiness.issues.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.NoIssues', 'No issues detected.')}</p>
    {:else}
      {#each ['critical', 'warning', 'info'] as severity (severity)}
        {#if issuesBy[severity].length > 0}
          <ul class="manager-environment-issue-list" data-issue-severity={severity}>
            {#each issuesBy[severity] as issue, index (issue.id + index)}
              <li class={`manager-environment-issue is-${severity}`} data-issue={issue.id}>
                <span class={`manager-chip ${severity === 'critical' ? 'is-danger' : severity === 'warning' ? 'is-warning' : 'is-neutral'}`}>{text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.Severity.${severity}`, severity)}</span>
                <span class="manager-environment-issue-title">{issueTitle(issue)}</span>
                {#if issue.recordId}
                  <button type="button" class="manager-button manager-environment-issue-action" onclick={() => onSelectRecord(issue.recordKind, issue.recordId)}>
                    {issue.recordKind === 'event' ? text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewEvent', 'View event') : text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewTask', 'View task')}
                  </button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      {/each}
    {/if}
  </section>
</section>
