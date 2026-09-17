<!-- Svelte 5 runes mode -->
<!--
  Validation tab for the recipe editor: checks grouped (Ingredients / Results / Resolution /
  Requirements), each group an uppercase icon-led label over a bordered container of rows. Each
  row carries a three-state status — pass / warn / block — derived from the OWNING issue's
  `severity` plus `blocks === 'enable'`, the merged issue text as a `detail` sub-line and a View
  deep link.

  It reuses the ONE `evaluateRecipeReadiness` evaluator the rail's mini-list also reads rather
  than introducing a second one that could disagree; the category map below is display metadata
  only. The MARKUP is `EditorValidationSurface`'s, and every `data-*` hook this tab shipped is
  preserved through `hookAttrs`, `countAttrs`, `viewDataAttr` and each row's own `dataAttrs`.
-->
<script>
  import EditorValidationSurface from '../../../components/EditorValidationSurface.svelte';
  import { localize } from '../../../util/foundryBridge.js';
  import { localizeActivationIssue } from '../../../../../utils/recipeActivationMessages.js';
  import {
    countRecipeReadiness,
    evaluateRecipeReadiness,
    recipeValidationRowStates,
  } from './recipeReadiness.js';

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

  // Display grouping only. A check id not listed falls into "requirements".
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
   * The two per-row hooks this tab has always emitted, as the bag the surface spreads. Built
   * conditionally rather than with `undefined` values, because absent and present-but-empty are
   * different DOM states to the `[data-issue]` presence selector every consumer uses.
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

  // WHICH GROUP AN ISSUE-ONLY ROW JOINS, by the route it deep-links to: it has no check for
  // `CHECK_CATEGORY` to place it, so its destination does.
  const ISSUE_TARGET_GROUP = {
    ingredients: 'ingredients',
    results: 'results',
    overview: 'requirements',
  };

  // ONE ROW PER CHECK, borrowing the owning issue when the check fails, then one row per issue no
  // check claimed. The pairing and the STATUS come from {@link recipeValidationRowStates} and
  // this maps them onto copy, taking the status verbatim so the tab strip's badge cannot report
  // a number this list contradicts.
  const rows = $derived(
    recipeValidationRowStates(readiness).map(({ checkId, issue, status }) => ({
      id: checkId,
      category: checkId
        ? CHECK_CATEGORY[checkId] || 'requirements'
        : ISSUE_TARGET_GROUP[issue?.target] || 'requirements',
      status,
      title: checkId ? checkLabel(checkId) : issueTitle(issue),
      detail: checkId && issue ? issueTitle(issue) : '',
      dataAttrs: rowAttrs(checkId, checkId ? status === 'pass' : false, issue ? issue.id : ''),
      target: issue ? issue.target || '' : '',
      // The CONTROL half, forwarded verbatim rather than derived: `recipeReadiness.js` alone
      // knows WHICH requirement or result set a failing check is about.
      focusTarget: issue ? issue.focusTarget || '' : '',
    }))
  );

  const groups = $derived(
    GROUP_ORDER.map(([id, labelKey, labelFallback, icon]) => ({
      id,
      icon,
      label: text(`FABRICATE.Admin.Manager.Recipe.Validation.${labelKey}`, labelFallback),
      rows: rows.filter((row) => row.category === id),
    })).filter((group) => group.rows.length > 0)
  );

  // THE AGGREGATE SUMMARY. The grouped rows below say what each check does; nothing said the
  // at-a-glance STATE, so this is a header over them rather than a duplicate of them.
  //
  // THE COUNTS ARE A TALLY OF THE ROWS ABOVE, not a second reading of `readiness` beside them.
  // Reading the same object is NOT enough, because the rows are not the issues: `stepsNamed` has
  // no `CHECK_TO_ISSUES` entry, so an unnamed step paints an amber row that raised no issue and
  // the verdict read "All clear" over it; and a `blocks: 'enable'` issue graded `warning` draws a
  // BLOCK row while counting as a warning, which this producer cannot reach today only because
  // all seven such issues are also `critical`. `countRecipeReadiness` tallies the SAME row states
  // the list is built from, and the editor shell's tab badge reads that one function too.
  const counts = $derived(countRecipeReadiness(readiness));
  const summaryStatus = $derived(
    counts.blocking > 0 ? 'blocked' : counts.warnings > 0 ? 'warning' : 'clear'
  );
  const summaryMeta = $derived(
    summaryStatus === 'blocked'
      ? {
          icon: 'fas fa-circle-xmark',
          title: text('FABRICATE.Admin.Manager.Validation.SummaryBlocked', 'Cannot be enabled'),
          sub: text(
            'FABRICATE.Admin.Manager.Recipe.Validation.SummaryBlockedSub',
            'Clear every blocking issue before this recipe can be enabled.'
          ),
        }
      : summaryStatus === 'warning'
        ? {
            icon: 'fas fa-triangle-exclamation',
            title: text(
              'FABRICATE.Admin.Manager.Validation.SummaryWarnings',
              'Enabled with warnings'
            ),
            sub: text(
              'FABRICATE.Admin.Manager.Validation.SummaryWarningsSub',
              'Saves and enables — review the warnings when you can.'
            ),
          }
        : {
            icon: 'fas fa-circle-check',
            title: text('FABRICATE.Admin.Manager.Validation.SummaryAllClear', 'All clear'),
            sub: text(
              'FABRICATE.Admin.Manager.Recipe.Validation.SummaryAllClearSub',
              'Every structural check passes. Ready to enable.'
            ),
          }
  );

  // THE PILL WORDS AND THE COUNT WORDS ARE NOT PASSED AT ALL: they are `EditorValidationSurface`'s
  // shared vocabulary, so the words this tab renders and the words every other validation surface
  // renders are one string each. The three status ICONS are shared the same way.
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
  {counts}
  {groups}
  viewDataAttr="data-recipe-issue-view"
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
