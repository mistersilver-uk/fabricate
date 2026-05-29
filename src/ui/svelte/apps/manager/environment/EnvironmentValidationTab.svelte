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
  const counts = $derived(composition?.counts || {});
  const selectionMode = $derived(environment?.selectionMode || 'targeted');
  const issuesBy = $derived({
    critical: readiness.issues.filter(issue => issue.severity === 'critical'),
    warning: readiness.issues.filter(issue => issue.severity === 'warning'),
    info: readiness.issues.filter(issue => issue.severity === 'info')
  });

  const CHECK_LABELS = {
    hasName: ['CheckName', 'Has a name'],
    hasDescription: ['CheckDescription', 'Has a description'],
    hasRegion: ['CheckRegion', 'Has a region or is set to "any region"'],
    hasBiome: ['CheckBiome', 'Has at least one biome'],
    hasDanger: ['CheckDanger', 'Has a danger level'],
    hasCompositionMode: ['CheckCompositionMode', 'Has a composition mode'],
    hasAvailableTask: ['CheckAvailableTask', 'Has at least one available task'],
    noStaleIncluded: ['CheckNoStale', 'Has no stale included records']
  };
  const ISSUE_LABELS = {
    noAvailableTasks: ['IssueNoAvailableTasks', 'No tasks are available to players.'],
    activeNoComposition: ['IssueActiveNoComposition', 'Environment is active but has no valid task composition.'],
    staleIncluded: ['IssueStaleIncluded', 'Included record no longer matches the environment.'],
    noScene: ['IssueNoScene', 'No scene is linked.'],
    noHazardsAtDanger: ['IssueNoHazardsAtDanger', 'Danger is set but no hazards are available.'],
    taskNoDescription: ['IssueTaskNoDescription', 'Available task has no player-facing description.'],
    hiddenNonMatching: ['IssueHiddenNonMatching', 'Some records are hidden because they do not match.'],
    locallyExcluded: ['IssueLocallyExcluded', 'Some records are excluded locally.']
  };

  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${meta[0]}`, meta[1]);
  }
  function issueTitle(issue) {
    const meta = ISSUE_LABELS[issue.id] || [issue.id, issue.id];
    const base = text(`FABRICATE.Admin.Manager.EnvironmentEditor.Validation.${meta[0]}`, meta[1]);
    return issue.recordName ? `${base} (${issue.recordName})` : base;
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

  <section class="manager-environment-card" data-validation-section="runtime-preview">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.RuntimePreview', 'Runtime preview')}</h3>
    <p class="manager-environment-runtime-preview" data-selection-mode={selectionMode}>
      {#if selectionMode === 'blind'}
        {text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.BlindPreview', 'Players will see a generic Gather action. The system will select from {n} hidden available tasks unless tasks have been revealed.').replace('{n}', String(counts.availableTasks || 0))}
      {:else}
        {text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.TargetedPreview', 'Players will choose from {n} visible gathering tasks.').replace('{n}', String(counts.availableTasks || 0))}
      {/if}
    </p>
    <div class="manager-fact-grid manager-fact-grid-inline">
      <div class="manager-fact"><strong>{counts.availableTasks || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.AvailableTasks', 'Available tasks')}</span></div>
      <div class="manager-fact"><strong>{counts.availableHazards || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.AvailableHazards', 'Available hazards')}</span></div>
      <div class="manager-fact"><strong>{counts.excludedHazards || 0}</strong><span>{text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ExcludedHazards', 'Excluded hazards')}</span></div>
    </div>
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
                    {text('FABRICATE.Admin.Manager.EnvironmentEditor.Validation.ViewRecord', 'View record')}
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
