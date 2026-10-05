/**
 * The gathering task editor's readiness (issue 1522): the rows its Validation tab draws, which its
 * tab badge and its Results notices also read. The blocking rows are exactly `validation.errors`,
 * the evaluation the header Save reads; the warnings are evaluated over the draft. `text(key,
 * fallback)` is the editor's localizer, and this file is the one copy map the rows and notices share.
 */

/** The groups, in the editor's tab order; Requirements runs no check, so it has none. */
const GROUPS = [
  {
    id: 'overview',
    labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Tabs.Overview',
    label: 'Overview',
    icon: 'fas fa-circle-info',
  },
  {
    id: 'results',
    labelKey: 'FABRICATE.Admin.Manager.Environment.Tasks.Tabs.Results',
    label: 'Results',
    icon: 'fas fa-box-open',
  },
];

/** The control a failing name row focuses: the Overview name input writes it as a literal. */
export const TASK_NAME_TARGET = 'gathering-task-name';

const RESULT_MODES = new Set(['d100', 'straight', 'routed']);

function hasRepeatedComponent(dropRows) {
  const ids = dropRows.map((row) => row?.componentId).filter(Boolean);
  return new Set(ids).size < ids.length;
}

/** The tab a failing row routes to, `{ id, labelKey, label, icon }`, or null. */
export function gatheringTaskIssueTab(id) {
  return GROUPS.find((group) => group.id === id) ?? null;
}

function messages(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
}

/**
 * The rows, string-free: `{ id, group, status, message? }`. The store's `nameErrors` is the
 * Overview row, and every other error in `errors` is a Results row; Progressive runs no results
 * check, so it draws no passing Results row. A check that does not apply is dropped.
 */
export function gatheringTaskReadiness({
  task = null,
  mode = 'd100',
  validation = null,
  routedOutcomeTiers = [],
  rewardRules = null,
} = {}) {
  const nameErrors = messages(validation?.nameErrors);
  const nameError = nameErrors[0] ?? null;
  const resultErrors = messages(validation?.errors).filter((error) => !nameErrors.includes(error));
  const dropRows = Array.isArray(task?.dropRows) ? task.dropRows : [];

  const rows = [
    nameError
      ? { id: 'name', group: 'overview', status: 'block', message: nameError }
      : { id: 'name', group: 'overview', status: 'pass' },
    ...resultErrors.map((message, index) => ({
      id: `result-${index + 1}`,
      group: 'results',
      status: 'block',
      message,
    })),
  ];
  if (resultErrors.length === 0 && RESULT_MODES.has(mode)) {
    rows.push({ id: 'results', group: 'results', status: 'pass' });
  }
  if (mode === 'routed') {
    const tiers = Array.isArray(routedOutcomeTiers) ? routedOutcomeTiers : [];
    rows.push({ id: 'routedTiers', group: 'results', status: tiers.length > 0 ? 'pass' : 'warn' });
  }
  if (mode === 'd100' && rewardRules?.rewardSelectionMode !== 'allDrops') {
    rows.push({
      id: 'rewardRule',
      group: 'results',
      status: hasRepeatedComponent(dropRows) ? 'warn' : 'pass',
    });
  }
  return {
    rows,
    counts: {
      passing: rows.filter((row) => row.status === 'pass').length,
      warnings: rows.filter((row) => row.status === 'warn').length,
      blocking: rows.filter((row) => row.status === 'block').length,
    },
  };
}

/** The one copy map: each row's title in its passing and its failing branch. */
function copyFor(text, mode) {
  const dropRules = mode === 'd100';
  return {
    name: [
      text('FABRICATE.Admin.Manager.Environment.Tasks.Validation.NamePass', 'It has a name'),
      text('FABRICATE.Admin.Manager.Environment.Tasks.Validation.NameFail', 'It needs a name'),
    ],
    results: [
      dropRules
        ? text(
            'FABRICATE.Admin.Manager.Environment.Tasks.Validation.DropRulesPass',
            'Every drop rule is complete'
          )
        : text(
            'FABRICATE.Admin.Manager.Environment.Tasks.Validation.ResultSetsPass',
            'Every result set is complete'
          ),
      dropRules
        ? text(
            'FABRICATE.Admin.Manager.Environment.Tasks.Validation.DropRuleFail',
            'A drop rule is incomplete'
          )
        : text(
            'FABRICATE.Admin.Manager.Environment.Tasks.Validation.ResultSetFail',
            'The result sets are incomplete'
          ),
    ],
    routedTiers: [
      text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Validation.RoutedTiersPass',
        'The gathering check defines outcome tiers'
      ),
      text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Results.NoRoutedTiers',
        'Define outcome tiers in the gathering check before routing result sets.'
      ),
    ],
    rewardRule: [
      text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Validation.RewardRulePass',
        'Each component has one drop row'
      ),
      text(
        'FABRICATE.Admin.Manager.Environment.Tasks.RewardRuleNotice',
        'Multiple drop rows use this component. Current drop rules may award only one matching row.'
      ),
    ],
  };
}

/** The Results notice's title: how many Results rows block save. */
function blockingNoticeTitle(text, count) {
  return count === 1
    ? text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Results.ValidationBlocksSaveOne',
        '1 result issue blocks save'
      )
    : text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Results.ValidationBlocksSave',
        '{count} result issues block save'
      ).replace('{count}', String(count));
}

const SUMMARY_ICONS = {
  pass: 'fas fa-circle-check',
  warn: 'fas fa-triangle-exclamation',
  block: 'fas fa-circle-xmark',
};

/** The verdict, in Save's words: a gathering task is gated by Save, not by an enable switch. */
function summaryFor(text, counts) {
  if (counts.blocking > 0) {
    return {
      status: 'block',
      icon: SUMMARY_ICONS.block,
      title: text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Validation.SummaryBlocked',
        'Cannot be saved'
      ),
      sub: text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Validation.SummaryBlockedSub',
        'Clear every blocking issue before this task can be saved.'
      ),
    };
  }
  if (counts.warnings > 0) {
    return {
      status: 'warn',
      icon: SUMMARY_ICONS.warn,
      title: text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Validation.SummaryWarnings',
        'Saves with warnings'
      ),
      sub: text(
        'FABRICATE.Admin.Manager.Environment.Tasks.Validation.SummaryWarningsSub',
        'It saves — review the warnings when you can.'
      ),
    };
  }
  return {
    status: 'pass',
    icon: SUMMARY_ICONS.pass,
    title: text('FABRICATE.Admin.Manager.Validation.SummaryAllClear', 'All clear'),
    sub: text(
      'FABRICATE.Admin.Manager.Environment.Tasks.Validation.SummaryAllClearSub',
      'Every check passes. Ready to save.'
    ),
  };
}

/** A failing row's address; a passing row has nothing to fix, so it draws no View. */
function addressOf(row) {
  if (row.status === 'pass') return {};
  return row.id === 'name'
    ? { target: 'overview', focusTarget: TASK_NAME_TARGET }
    : { target: 'results' };
}

/**
 * Everything the editor draws from one readiness: the surface's counts, grouped rows and verdict,
 * the Validation tab's marks, and the Results notices — the blocking count and the warning rows.
 */
export function gatheringTaskValidation(context, text) {
  const { rows, counts } = gatheringTaskReadiness(context);
  const copy = copyFor(text, context?.mode);
  const presented = rows.map((row) => {
    const [pass, fail] = copy[row.id.startsWith('result-') ? 'results' : row.id];
    return {
      id: row.id,
      group: row.group,
      status: row.status,
      title: row.status === 'pass' ? pass : fail,
      detail: row.status === 'block' && row.id !== 'name' ? row.message : '',
      ...addressOf(row),
    };
  });
  const resultsBlocking = presented.filter(
    (row) => row.group === 'results' && row.status === 'block'
  ).length;
  return {
    counts,
    summary: summaryFor(text, counts),
    groups: GROUPS.map((group) => ({
      id: group.id,
      label: text(group.labelKey, group.label),
      icon: group.icon,
      rows: presented.filter((row) => row.group === group.id),
    })).filter((group) => group.rows.length > 0),
    marks: [
      counts.blocking > 0 && { label: String(counts.blocking), tone: 'danger' },
      counts.warnings > 0 && { label: String(counts.warnings), tone: 'warning' },
    ].filter(Boolean),
    blockingNotice: resultsBlocking > 0 ? blockingNoticeTitle(text, resultsBlocking) : '',
    warnings: presented.filter((row) => row.status === 'warn'),
  };
}
