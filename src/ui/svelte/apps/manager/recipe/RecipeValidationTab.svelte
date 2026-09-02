<!-- Svelte 5 runes mode -->
<!--
  Validation tab for the recipe editor (issue 643 §E rebuild). The prototype's
  grouped, bordered, tagged row stack: checks are grouped (Ingredients / Results /
  Resolution / Requirements), each group an uppercase icon-led label over a shared
  1px-bordered container of rows. Each row carries a three-state status — pass /
  warn / block — derived from the OWNING issue's `severity` + `blocks === 'enable'`,
  the merged issue text as a `detail` sub-line, and the View deep-link on the right
  (the separate "Issues" card is retired, §E3).

  Deviation 1 (issue 643): this reuses the ONE `evaluateRecipeReadiness` evaluator
  the rail's mini-list also reads — it does NOT introduce a second `recipeValidationGroups`
  evaluator that could disagree. The category map below is display metadata only.

  The MARKUP is `EditorValidationSurface`'s since issue 1444: this file computes the readiness
  and hands over title, intro, summary, counts, groups and labels. Every `data-*` hook the tab
  shipped is preserved through `hookAttrs`, `countAttrs`, `viewDataAttr` and each row's own
  `dataAttrs`, so nothing reading this surface — the smoke harness, `recipe-edit-mounted`,
  `recipe-validation-tab` — has to learn a new name.
-->
<script>
  import EditorValidationSurface from '../EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { localizeActivationIssue } from '../../../../../utils/recipeActivationMessages.js';
  import { evaluateRecipeReadiness } from './recipeReadiness.js';

  let {
    recipe = null,
    componentTagOptions = [],
    routingProvider = null,
    routedOutcomeTierOptions = [],
    alchemy = null,
    signatureConflicts = [],
    onSelectIssue = () => {},
  } = $props();

  function text(key, fallback) {
    const translated = localize(key);
    return translated && translated !== key ? translated : fallback;
  }

  const readiness = $derived(
    evaluateRecipeReadiness(recipe || {}, {
      systemComponents: componentTagOptions,
      routingProvider,
      routedOutcomeTierOptions,
      alchemy,
      signatureConflicts,
    })
  );

  const CHECK_LABELS = {
    hasName: ['CheckName', 'Has a name'],
    hasIngredientSet: ['CheckIngredientSet', 'Every step has at least one ingredient set'],
    hasResultGroup: ['CheckResultGroup', 'Every step has at least one result set'],
    stepsNamed: ['CheckStepsNamed', 'Every step is named'],
    noDuplicateMatches: ['CheckNoDuplicateMatches', 'No duplicate component or tag matches'],
    noRequirementOverlap: ['CheckNoRequirementOverlap', 'No overlapping ingredient requirements'],
    routedResultGroupsRouted: [
      'CheckRoutedResultGroupsRouted',
      'Every check-mode result set is assigned a check outcome',
    ],
    routedOutcomeTiersProduced: [
      'CheckRoutedOutcomeTiersProduced',
      'Every check success outcome produces a result set',
    ],
    alchemyResultSelection: ['CheckAlchemyResultSelection', 'Resolves to exactly one result set'],
    noSignatureCollision: [
      'CheckNoSignatureCollision',
      'No ingredient-signature collision with another recipe',
    ],
  };
  const ISSUE_LABELS = {
    noName: ['IssueNoName', 'The recipe needs a name.'],
    noIngredientSet: ['IssueNoIngredientSet', 'A step has no ingredient set.'],
    noResultGroup: ['IssueNoResultGroup', 'A step has no result set.'],
    disabledIncomplete: [
      'IssueDisabledIncomplete',
      'The recipe is disabled and cannot be enabled until its requirements are complete.',
    ],
    duplicateAlternative: [
      'IssueDuplicateAlternative',
      'An OR group repeats the same component or tag match.',
    ],
    duplicateRequirement: [
      'IssueDuplicateRequirement',
      'A set repeats the same ingredient requirement.',
    ],
    requirementOverlap: [
      'IssueRequirementOverlap',
      'Two requirements in a set can be satisfied by the same component (ambiguous).',
    ],
    unroutedResultGroup: [
      'IssueUnroutedResultGroup',
      'A result set is not assigned to any check outcome and will never be produced.',
    ],
    unproducedOutcomeTier: [
      'IssueUnproducedOutcomeTier',
      'A check outcome is not assigned to any result set, so it produces nothing.',
    ],
    alchemyResultSelection: [
      'IssueAlchemyResultSelection',
      'An alchemy recipe must resolve to exactly one result set before it can be enabled.',
    ],
  };

  // Display grouping (metadata only — the evaluator is untouched). A check id not
  // listed falls into "requirements".
  const CHECK_CATEGORY = {
    hasIngredientSet: 'ingredients',
    noDuplicateMatches: 'ingredients',
    noRequirementOverlap: 'ingredients',
    hasResultGroup: 'results',
    routedResultGroupsRouted: 'results',
    routedOutcomeTiersProduced: 'results',
    alchemyResultSelection: 'resolution',
    hasName: 'requirements',
    stepsNamed: 'requirements',
    noSignatureCollision: 'requirements',
  };

  // The negative issue id(s) that own each check, so an unsatisfied check can borrow
  // that issue's severity, blocking flag, text and deep-link target.
  const CHECK_TO_ISSUES = {
    hasName: ['noName'],
    hasIngredientSet: ['noIngredientSet'],
    hasResultGroup: ['noResultGroup'],
    noDuplicateMatches: ['duplicateAlternative', 'duplicateRequirement'],
    noRequirementOverlap: ['requirementOverlap'],
    routedResultGroupsRouted: ['unroutedResultGroup'],
    routedOutcomeTiersProduced: ['unproducedOutcomeTier'],
    alchemyResultSelection: ['alchemyResultSelection'],
    noSignatureCollision: ['signatureCollision'],
  };

  const GROUP_ORDER = [
    ['ingredients', 'GroupIngredients', 'Ingredients', 'fas fa-flask'],
    ['results', 'GroupResults', 'Results', 'fas fa-box-open'],
    ['resolution', 'GroupResolution', 'Resolution', 'fas fa-dice-d20'],
    ['requirements', 'GroupRequirements', 'Requirements', 'fas fa-clipboard-check'],
  ];

  function checkLabel(id) {
    const meta = CHECK_LABELS[id] || [id, id];
    return text(`FABRICATE.Admin.Manager.Recipe.Validation.${meta[0]}`, meta[1]);
  }

  function issueTitle(issue) {
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

  /**
   * The two per-row hooks this tab has always emitted, as the bag the surface spreads.
   *
   * Built conditionally rather than with `undefined` values, because the surface spreads this
   * onto the row element and "the attribute is absent" and "the attribute is present and empty"
   * are different DOM states to a `[data-issue]` presence selector — which is what every
   * consumer of these two uses.
   *
   * @param {string} checkId the check row's id, empty for an issue-only row
   * @param {boolean} satisfied whether the check holds
   * @param {string} issueId the owning issue's id, empty when the check holds
   * @returns {object} the row's `data-*` bag
   */
  function rowAttrs(checkId, satisfied, issueId) {
    const attrs = {};
    if (checkId) attrs['data-satisfied'] = satisfied;
    if (issueId) attrs['data-issue'] = issueId;
    return attrs;
  }

  // Build one row per check, borrowing the owning issue when the check fails.
  const rows = $derived.by(() => {
    // Function-local bookkeeping scratch, discarded when the $derived.by returns.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const usedIssueIds = new Set();
    const checkRows = readiness.checks.map((check) => {
      const owners = CHECK_TO_ISSUES[check.id] || [];
      const issue = check.satisfied
        ? null
        : readiness.issues.find((entry) => owners.includes(entry.id)) || null;
      if (issue) usedIssueIds.add(issue);
      const status = check.satisfied
        ? 'pass'
        : issue && (issue.blocks === 'enable' || issue.severity === 'critical')
          ? 'block'
          : 'warn';
      return {
        id: check.id,
        category: CHECK_CATEGORY[check.id] || 'requirements',
        status,
        title: checkLabel(check.id),
        detail: issue ? issueTitle(issue) : '',
        dataAttrs: rowAttrs(check.id, check.satisfied, issue ? issue.id : ''),
        target: issue ? issue.target || '' : '',
      };
    });
    // Any issue not attached to a check row (e.g. `disabledIncomplete`) becomes its
    // own row, grouped by its deep-link target so nothing is lost when the Issues
    // card is retired.
    const targetGroup = {
      ingredients: 'ingredients',
      results: 'results',
      overview: 'requirements',
    };
    const orphanRows = readiness.issues
      .filter((issue) => !usedIssueIds.has(issue))
      .map((issue) => ({
        id: '',
        category: targetGroup[issue.target] || 'requirements',
        status: issue.blocks === 'enable' || issue.severity === 'critical' ? 'block' : 'warn',
        title: issueTitle(issue),
        detail: '',
        dataAttrs: rowAttrs('', false, issue.id),
        target: issue.target || '',
      }));
    return [...checkRows, ...orphanRows];
  });

  const groups = $derived(
    GROUP_ORDER.map(([id, labelKey, labelFallback, icon]) => ({
      id,
      icon,
      label: text(`FABRICATE.Admin.Manager.Recipe.Validation.${labelKey}`, labelFallback),
      rows: rows.filter((row) => row.category === id),
    })).filter((group) => group.rows.length > 0)
  );

  // --- The aggregate summary (issue 676) -----------------------------------------
  // Rehomed from the deleted RecipeContextRail, which showed it only while this very tab
  // was open. The grouped rows below say what each check does; nothing said the
  // at-a-glance STATE, so this is a header over them, not a duplicate of them.
  //
  // It reads the SAME `readiness` object the rows are built from — literally the one
  // `$derived` above, not a second call — so "the aggregate can never disagree with the
  // list" is structural rather than a convention someone has to remember. Blocking =
  // critical issues (they block enabling); passing = the satisfied structural checks.
  const criticalIssues = $derived(
    (readiness?.issues || []).filter((issue) => issue.severity === 'critical')
  );
  const warningIssues = $derived(
    (readiness?.issues || []).filter((issue) => issue.severity === 'warning')
  );
  const passingCount = $derived(
    (readiness?.checks || []).filter((check) => check.satisfied).length
  );
  const warningCount = $derived(warningIssues.length);
  const blockingCount = $derived(criticalIssues.length);
  const summaryStatus = $derived(
    blockingCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'clear'
  );
  const summaryMeta = $derived(
    summaryStatus === 'blocked'
      ? {
          icon: 'fas fa-circle-xmark',
          title: text(
            'FABRICATE.Admin.Manager.Recipe.Validation.SummaryBlocked',
            'Cannot be enabled'
          ),
          sub: text(
            'FABRICATE.Admin.Manager.Recipe.Validation.SummaryBlockedSub',
            'Clear every blocking issue before this recipe can be enabled.'
          ),
        }
      : summaryStatus === 'warning'
        ? {
            icon: 'fas fa-triangle-exclamation',
            title: text(
              'FABRICATE.Admin.Manager.Recipe.Validation.SummaryWarnings',
              'Enabled with warnings'
            ),
            sub: text(
              'FABRICATE.Admin.Manager.Recipe.Validation.SummaryWarningsSub',
              'Saves and enables — review the warnings when you can.'
            ),
          }
        : {
            icon: 'fas fa-circle-check',
            title: text('FABRICATE.Admin.Manager.Recipe.Validation.SummaryAllClear', 'All clear'),
            sub: text(
              'FABRICATE.Admin.Manager.Recipe.Validation.SummaryAllClearSub',
              'Every structural check passes. Ready to enable.'
            ),
          }
  );

  // The pill WORD per status. The three status ICONS this table also used to carry are the
  // surface's own — glyph for glyph, `fa-circle-check` / `fa-triangle-exclamation` /
  // `fa-circle-exclamation` — so they are no longer restated here where a second copy could
  // drift from the one that renders.
  const STATUS_LABELS = {
    pass: ['StatusPass', 'PASS'],
    warn: ['StatusWarn', 'WARNING'],
    block: ['StatusBlock', 'BLOCKS ENABLE'],
  };

  function statusPill(status) {
    const meta = STATUS_LABELS[status] || STATUS_LABELS.pass;
    return text(`FABRICATE.Admin.Manager.Recipe.Validation.${meta[0]}`, meta[1]);
  }

  const statusLabels = $derived({
    pass: statusPill('pass'),
    warn: statusPill('warn'),
    block: statusPill('block'),
  });

  const tabTitle = $derived(text('FABRICATE.Admin.Manager.Recipe.Validation.Title', 'Validation'));
</script>

<EditorValidationSurface
  title={tabTitle}
  intro={text(
    'FABRICATE.Admin.Manager.Recipe.Validation.Intro',
    'A recipe saves even while incomplete, but only enables when every blocking issue is cleared.'
  )}
  summary={{
    status: summaryStatus,
    icon: summaryMeta.icon,
    title: summaryMeta.title,
    sub: summaryMeta.sub,
  }}
  counts={{ passing: passingCount, warnings: warningCount, blocking: blockingCount }}
  countLabels={{
    passing: text('FABRICATE.Admin.Manager.Recipe.Validation.CountPassing', 'Passing'),
    warnings: text('FABRICATE.Admin.Manager.Recipe.Validation.CountWarnings', 'Warnings'),
    blocking: text('FABRICATE.Admin.Manager.Recipe.Validation.CountBlocking', 'Blocking'),
  }}
  {groups}
  {statusLabels}
  viewDataAttr="data-recipe-issue-view"
  viewLabel={text('FABRICATE.Admin.Manager.Recipe.Validation.View', 'View')}
  hookAttrs={{
    root: { 'data-recipe-tab': 'validation', 'aria-label': tabTitle },
    summaryRow: { 'data-recipe-section': 'validation-summary' },
    summary: { 'data-recipe-validation-summary': summaryStatus },
    counts: { 'data-recipe-validation-counts': '' },
  }}
  countAttrs={{
    passing: { 'data-recipe-count-passing': '' },
    warnings: { 'data-recipe-count-warnings': '' },
    blocking: { 'data-recipe-count-blocking': '' },
  }}
  {onSelectIssue}
/>
