<!-- Svelte 5 runes mode -->
<!--
  Validation tab for the recipe editor: a readiness checklist plus
  severity-grouped issues. Mirrors EnvironmentValidationTab — the pure
  `evaluateRecipeReadiness` evaluator returns stable check/issue ids, which this
  tab maps to localized copy. An issue's "View" deep-links by switching the active
  tab via `onSelectIssue(target)`. Uses the shared generic `.manager-editor-*`
  validation classes.
-->
<script>
  import { localize } from '../../../util/foundryBridge.js';
  import { localizeActivationIssue } from '../../../../../systems/recipeActivationMessages.js';
  import { evaluateRecipeReadiness } from './recipeReadiness.js';

  let {
    recipe = null,
    componentTagOptions = [],
    // Routed check-mode authoring inputs: the recipe's routing provider and the
    // system's success-filtered routed-check outcome tiers {id,name}. Used to flag
    // unrouted result groups and unproduced success tiers.
    routingProvider = null,
    routedOutcomeTierOptions = [],
    // Alchemy enable-blocker inputs (issue 549): the alchemy context ({ checkMode })
    // for an alchemy system (null otherwise) and the cross-recipe signature conflicts
    // touching this recipe, precomputed via SignatureValidator. Drive the alchemy
    // result-selection and signature-collision blocker rows.
    alchemy = null,
    signatureConflicts = [],
    onSelectIssue = () => {}
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const readiness = $derived(evaluateRecipeReadiness(recipe || {}, {
    systemComponents: componentTagOptions,
    routingProvider,
    routedOutcomeTierOptions,
    alchemy,
    signatureConflicts
  }));
  const issuesBy = $derived({
    critical: readiness.issues.filter(issue => issue.severity === 'critical'),
    warning: readiness.issues.filter(issue => issue.severity === 'warning'),
    info: readiness.issues.filter(issue => issue.severity === 'info')
  });

  const CHECK_LABELS = {
    hasName: ['CheckName', 'Has a name'],
    hasIngredientSet: ['CheckIngredientSet', 'Every step has at least one ingredient set'],
    hasResultGroup: ['CheckResultGroup', 'Every step has at least one result set'],
    stepsNamed: ['CheckStepsNamed', 'Every step is named'],
    noDuplicateMatches: ['CheckNoDuplicateMatches', 'No duplicate component or tag matches'],
    noRequirementOverlap: ['CheckNoRequirementOverlap', 'No overlapping ingredient requirements'],
    routedResultGroupsRouted: ['CheckRoutedResultGroupsRouted', 'Every check-mode result set is assigned a check outcome'],
    routedOutcomeTiersProduced: ['CheckRoutedOutcomeTiersProduced', 'Every check success outcome produces a result set'],
    alchemyResultSelection: ['CheckAlchemyResultSelection', 'Resolves to exactly one result set'],
    noSignatureCollision: ['CheckNoSignatureCollision', 'No ingredient-signature collision with another recipe']
  };
  const ISSUE_LABELS = {
    noName: ['IssueNoName', 'The recipe needs a name.'],
    noIngredientSet: ['IssueNoIngredientSet', 'A step has no ingredient set.'],
    noResultGroup: ['IssueNoResultGroup', 'A step has no result set.'],
    disabledIncomplete: ['IssueDisabledIncomplete', 'The recipe is disabled and cannot be enabled until its requirements are complete.'],
    duplicateAlternative: ['IssueDuplicateAlternative', 'An OR group repeats the same component or tag match.'],
    duplicateRequirement: ['IssueDuplicateRequirement', 'A set repeats the same ingredient requirement.'],
    requirementOverlap: ['IssueRequirementOverlap', 'Two requirements in a set can be satisfied by the same component (ambiguous).'],
    unroutedResultGroup: ['IssueUnroutedResultGroup', 'A result set is not assigned to any check outcome and will never be produced.'],
    unproducedOutcomeTier: ['IssueUnproducedOutcomeTier', 'A check outcome is not assigned to any result set, so it produces nothing.'],
    alchemyResultSelection: ['IssueAlchemyResultSelection', 'An alchemy recipe must resolve to exactly one result set before it can be enabled.']
  };

  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.Recipe.Validation.${meta[0]}`, meta[1]);
  }
  function issueTitle(issue) {
    // A signature collision carries dynamic, id-free params (the other recipe, the
    // shared component names); reuse the RecipeActivation localizer (issue 550) so the
    // tab row reads identically to the enable-failure toast.
    if (issue.id === 'signatureCollision') {
      return localizeActivationIssue(
        { code: issue.code, params: issue.params, message: issue.message },
        localize
      );
    }
    const meta = ISSUE_LABELS[issue.id] || [issue.id, issue.id];
    const base = text(`FABRICATE.Admin.Manager.Recipe.Validation.${meta[0]}`, meta[1]);
    return issue.stepName ? `${issue.stepName}: ${base}` : base;
  }
</script>

<section class="manager-recipe-tab manager-recipe-validation" data-recipe-tab="validation" aria-label={text('FABRICATE.Admin.Manager.Recipe.Validation.Title', 'Validation')}>
  <section class="manager-task-core-card" data-validation-section="readiness">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Validation.Readiness', 'Recipe readiness')}</h3>
    <ul class="manager-editor-check-list">
      {#each readiness.checks as check (check.id)}
        <li class={`manager-editor-check ${check.satisfied ? 'is-satisfied' : 'is-unsatisfied'}`} data-check={check.id} data-satisfied={check.satisfied}>
          <i class={check.satisfied ? 'fas fa-circle-check' : 'fas fa-circle-xmark'} aria-hidden="true"></i>
          <span>{checkLabel(check.id)}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="manager-task-core-card" data-validation-section="issues">
    <h3 class="manager-card-title">{text('FABRICATE.Admin.Manager.Recipe.Validation.Issues', 'Issues')}</h3>
    {#if readiness.issues.length === 0}
      <p class="manager-muted">{text('FABRICATE.Admin.Manager.Recipe.Validation.NoIssues', 'No issues detected.')}</p>
    {:else}
      {#each ['critical', 'warning', 'info'] as severity (severity)}
        {#if issuesBy[severity].length > 0}
          <ul class="manager-recipe-issue-list" data-issue-severity={severity}>
            {#each issuesBy[severity] as issue, index (issue.id + index)}
              <li class={`manager-editor-issue is-${severity}`} data-issue={issue.id}>
                <span class={`manager-chip ${severity === 'critical' ? 'is-danger' : severity === 'warning' ? 'is-warning' : 'is-neutral'}`}>{text(`FABRICATE.Admin.Manager.Recipe.Validation.Severity.${severity}`, severity)}</span>
                <span class="manager-recipe-issue-title">{issueTitle(issue)}</span>
                {#if issue.target}
                  <button type="button" class="manager-button manager-recipe-issue-action" data-recipe-issue-view={issue.target} onclick={() => onSelectIssue(issue.target)}>
                    {text('FABRICATE.Admin.Manager.Recipe.Validation.View', 'View')}
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
