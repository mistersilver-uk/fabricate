<!-- Svelte 5 runes mode -->
<!--
  Validation tab for the Checks editor: a per-subsystem readiness checklist plus
  severity-grouped issues for the crafting, salvage, and gathering checks. Mirrors
  RecipeValidationTab — the pure `evaluateCheckReadiness` evaluator returns stable
  check/issue ids, which this tab maps to localized copy. This is the canonical
  place a GM sees what is wrong with a check; the individual editors no longer
  print these messages inline. Uses the shared generic `.manager-editor-*`
  validation classes.

  `sections` is the list of in-play subsystem checks resolved by ChecksView:
  `[{ subsystem: 'crafting'|'salvage'|'gathering', mode, check }]`. Subsystems that
  are switched off (or the read-only gathering d100 roll) are omitted upstream.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { evaluateCheckReadiness } from './checksReadiness.js';

  let { sections = [] } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const SUBSYSTEM_LABELS = {
    crafting: ['SubsystemCrafting', 'Crafting check'],
    salvage: ['SubsystemSalvage', 'Salvage check'],
    gathering: ['SubsystemGathering', 'Gathering check']
  };
  const CHECK_LABELS = {
    hasRollFormula: ['CheckHasRollFormula', 'Has a roll formula'],
    outcomesNamed: ['CheckOutcomesNamed', 'Every outcome tier is named'],
    hasSuccessOutcome: ['CheckHasSuccessOutcome', 'At least one outcome is a Success'],
    rangesValid: ['CheckRangesValid', 'Every tier range is valid'],
    rangesNoOverlap: ['CheckRangesNoOverlap', 'No tier ranges overlap']
  };
  const ISSUE_LABELS = {
    noRollFormula: ['IssueNoRollFormula', 'This check has no roll formula; it will not resolve until one is set.'],
    unnamedOutcome: ['IssueUnnamedOutcome', 'Name every outcome tier — an unnamed tier cannot be routed to a result group.'],
    noSuccessOutcome: ['IssueNoSuccessOutcome', "No outcome tier is marked as a Success — successful crafts can't route to a result set. Mark at least one tier as Success."],
    rangeInvalid: ['IssueRangeInvalid', 'Some tiers have a start greater than their end.'],
    rangeOverlap: ['IssueRangeOverlap', 'Some tier ranges overlap. Each value range must be unique.']
  };

  function subsystemLabel(subsystem) {
    const meta = SUBSYSTEM_LABELS[subsystem] || [subsystem, subsystem];
    return text(`FABRICATE.Admin.Manager.Checks.Validation.${meta[0]}`, meta[1]);
  }
  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.Checks.Validation.${meta[0]}`, meta[1]);
  }
  function issueTitle(id) {
    const meta = ISSUE_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.Checks.Validation.${meta[0]}`, meta[1]);
  }

  const evaluated = $derived(
    sections.map((section) => ({
      subsystem: section.subsystem,
      readiness: evaluateCheckReadiness(section.check || {}, { mode: section.mode })
    }))
  );
</script>

<section
  class="manager-recipe-tab manager-checks-validation-tab"
  data-checks-panel="validation"
  data-recipe-tab="validation"
  aria-label={text('FABRICATE.Admin.Manager.Checks.Validation.Title', 'Validation')}
>
  {#if evaluated.length === 0}
    <p class="manager-muted">
      {text('FABRICATE.Admin.Manager.Checks.Validation.EmptyHint', 'Issues across the crafting, salvage, and gathering checks will be listed here.')}
    </p>
  {:else}
    {#each evaluated as { subsystem, readiness } (subsystem)}
      {@const issuesBy = {
        critical: readiness.issues.filter((issue) => issue.severity === 'critical'),
        warning: readiness.issues.filter((issue) => issue.severity === 'warning'),
        info: readiness.issues.filter((issue) => issue.severity === 'info')
      }}
      <section class="manager-task-core-card" data-checks-validation-section={subsystem}>
        <h3 class="manager-card-title">{subsystemLabel(subsystem)}</h3>

        <ul class="manager-editor-check-list">
          {#each readiness.checks as check (check.id)}
            <li
              class={`manager-editor-check ${check.satisfied ? 'is-satisfied' : 'is-unsatisfied'}`}
              data-subsystem={subsystem}
              data-check={check.id}
              data-satisfied={check.satisfied}
            >
              <i class={check.satisfied ? 'fas fa-circle-check' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
              <span>{checkLabel(check.id)}</span>
            </li>
          {/each}
        </ul>

        {#if readiness.issues.length === 0}
          <p class="manager-muted" data-checks-no-issues={subsystem}>
            {text('FABRICATE.Admin.Manager.Checks.Validation.NoIssues', 'No issues detected.')}
          </p>
        {:else}
          {#each ['critical', 'warning', 'info'] as severity (severity)}
            {#if issuesBy[severity].length > 0}
              <ul class="manager-recipe-issue-list" data-issue-severity={severity}>
                {#each issuesBy[severity] as issue, index (issue.id + index)}
                  <li class={`manager-editor-issue is-${severity}`} data-subsystem={subsystem} data-issue={issue.id}>
                    <span class={`manager-chip ${severity === 'critical' ? 'is-danger' : severity === 'warning' ? 'is-warning' : 'is-neutral'}`}>
                      {text(`FABRICATE.Admin.Manager.Checks.Validation.Severity.${severity}`, severity)}
                    </span>
                    <span class="manager-recipe-issue-title">{issueTitle(issue.id)}</span>
                  </li>
                {/each}
              </ul>
            {/if}
          {/each}
        {/if}
      </section>
    {/each}
  {/if}
</section>
