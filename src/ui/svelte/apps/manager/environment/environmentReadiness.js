/**
 * Pure environment readiness + issue evaluation for the gathering environment
 * editor. Consumes the draft environment and the composition view-model
 * (`adminStore._buildEnvironmentCompositionViewModel`) and returns structured
 * checks/issues with stable ids; the UI layer maps ids to localized copy. No
 * Svelte, Foundry, or store dependencies so it stays unit-testable.
 *
 * @typedef {{ id: string, satisfied: boolean }} ReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info', blocks?: 'enable', recordKind?: 'task' | 'event', recordId?: string, recordName?: string }} ReadinessIssue
 */

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function tagList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

/**
 * @param {object} environment Draft environment.
 * @param {object} composition Composition view-model `{ counts, tasks, events }`.
 * @returns {{ checks: ReadinessCheck[], issues: ReadinessIssue[] }}
 */
export function evaluateEnvironmentReadiness(environment = {}, composition = {}) {
  const counts = composition?.counts || {};
  const tasks = Array.isArray(composition?.tasks) ? composition.tasks : [];
  const events = Array.isArray(composition?.events) ? composition.events : [];

  const hasName = Boolean(trimmed(environment?.name));
  const hasDescription = Boolean(trimmed(environment?.description));
  const hasBiome = tagList(environment?.biomes ?? environment?.biome).length > 0;
  const hasDanger = Boolean(trimmed(environment?.dangerLevel))
    || tagList(environment?.dangerTags ?? environment?.risk).length > 0
    || Boolean(trimmed(environment?.risk));
  const hasCompositionMode = environment?.compositionMode === 'manual' || environment?.compositionMode === 'automatic' || environment?.compositionMode === undefined;
  const hasAvailableTask = Number(counts.availableTasks || 0) > 0;
  // The store's tally of `includedNotMatching` rows. Since issue 1315 those rows COMPOSE
  // (manual mode has no match filter), so this is "how many picked records do not match" —
  // a note, not a fault, which is why the issue it raises is `info` rather than `critical`.
  const includedNotMatching = Number(counts.includedNotMatchingTasks || 0) + Number(counts.includedNotMatchingEvents || 0);
  // Deliberately NOT a readiness check. The state is only ever assigned in manual mode, so a
  // checklist item would tick vacuously in automatic and sit permanently unticked in manual for
  // any GM using the feature as designed — telling them a correct environment falls short of
  // something. The `info` issue below states the fact without grading it.

  const checks = [
    { id: 'hasName', satisfied: hasName },
    { id: 'hasDescription', satisfied: hasDescription },
    { id: 'hasBiome', satisfied: hasBiome },
    { id: 'hasDanger', satisfied: hasDanger },
    { id: 'hasCompositionMode', satisfied: hasCompositionMode },
    { id: 'hasAvailableTask', satisfied: hasAvailableTask }
  ];

  const issues = [];
  const active = environment?.enabled !== false;

  if (!hasAvailableTask) {
    issues.push({ id: 'noAvailableTasks', severity: active ? 'critical' : 'warning', blocks: 'enable' });
  }
  if (active && !hasAvailableTask) {
    issues.push({ id: 'activeNoComposition', severity: 'critical', blocks: 'enable' });
  }
  // `info`, NOT `critical` (issue 1315). Manual mode composes exactly the GM's picked
  // list with no match filter, so a picked record that does not match still runs — it is a
  // deliberate choice, not stale state. Raising a critical error here told the GM to undo
  // the thing the product's own contract invites, which is worse than not checking at all.
  // The issue survives as a NOTE because the fact is still worth surfacing: the Included
  // list would otherwise show a non-matching pick identically to a matching one. It carries
  // no `blocks: 'enable'` (it never did) and must not gain one — this state composes, so it
  // cannot be a reason to refuse enabling.
  //
  // This literal STAYS a literal (issue 1321). Its neighbours in the editor now import
  // `ENVIRONMENT_INCLUDED_COMPOSITION_STATES` from `src/systems/gatheringComposition.js`;
  // this one deliberately does not, for two reasons. It tests a SINGLE state rather than
  // membership of a set, so there is no set to share — and this module's contract, stated
  // at the top of the file, is that it has no Svelte, Foundry or store dependencies and
  // therefore no import graph to grow. The guard is
  // `tests/systems/gatheringComposition.test.js`, which calls the exported predicate once
  // per state in the vocabulary rather than trusting this line to notice a rename.
  for (const entry of [...tasks, ...events]) {
    if (entry.compositionState === 'includedNotMatching') {
      issues.push({ id: 'staleIncluded', severity: 'info', recordKind: entry.kind, recordId: entry.id, recordName: entry.record?.name || entry.id });
    }
  }

  if (!trimmed(environment?.sceneUuid)) {
    issues.push({ id: 'noScene', severity: 'warning' });
  }
  if (hasDanger && Number(counts.availableEvents || 0) === 0) {
    issues.push({ id: 'noEventsAtDanger', severity: 'warning' });
  }
  for (const entry of tasks) {
    if (entry.runtimeState === 'available' && !trimmed(entry.record?.description)) {
      issues.push({ id: 'taskNoDescription', severity: 'warning', recordKind: 'task', recordId: entry.id, recordName: entry.record?.name || entry.id });
    }
  }

  const excluded = Number(counts.excludedTasks || 0) + Number(counts.excludedEvents || 0);
  if (excluded > 0) {
    issues.push({ id: 'locallyExcluded', severity: 'info' });
  }

  return { checks, issues };
}

export function countIssues(issues = [], severity) {
  return issues.filter(issue => issue.severity === severity).length;
}

/**
 * THE ONE READING OF A READINESS RESULT (issue 1517).
 *
 * Three screens report this environment's validation state — the Validation tab's counts rail,
 * the editor tab strip's badge and the summary inspector's two chips — and before this function
 * they counted three different populations with two different definitions of "warning". The tab
 * counted ISSUES while drawing rows for CHECKS, so an unsatisfied check with no issue behind it
 * (a missing description, a missing biome) painted an amber row the rail said nothing about and
 * the verdict called "All clear"; and the badge counted `severity === 'warning'` where the tab
 * counted `!== 'critical'`, so an `info`-only environment showed no badge over a rail reading
 * "Warnings: 2". Both are one defect: a count is a reading of a result, and there was no one
 * place that read it.
 *
 * WHAT COUNTS AS WHAT, and it is the vocabulary the shared validation surface draws rather than
 * the domain's own severities:
 *
 *  - every CHECK contributes — satisfied to `passing`, unsatisfied to `warnings`. An unsatisfied
 *    readiness check is exactly an amber row, so it is exactly a warning.
 *  - every ISSUE contributes — one that BLOCKS ENABLING, or is `critical`, to `blocking`, and
 *    every other one, `warning` and `info` alike, to `warnings`. `info` has no tile of its own
 *    and the count vocabulary is closed; collapsing it here is what makes the badge and the rail
 *    agree, whichever of the two a GM is looking at.
 *  - an EMPTY issue list contributes one `passing`. "No issues detected." is a result the tab
 *    draws as a passing row rather than as a heading over an empty group, and the rail counts
 *    what the rows show.
 *
 * `blocks: 'enable'` rather than severity for the blocking tally, because that is the question
 * the tile and the verdict both answer — see {@link blocksEnable}. A disabled environment with
 * no available task downgrades to `severity: 'warning'` while still carrying `blocks: 'enable'`,
 * and it cannot be enabled; a tile reading 0 beside a verdict reading "Cannot be enabled" would
 * be the same contradiction one rung down.
 *
 * @param {{checks?: ReadinessCheck[], issues?: ReadinessIssue[]}} readiness
 * @returns {{passing: number, warnings: number, blocking: number}}
 */
export function countReadiness(readiness = {}) {
  const checks = Array.isArray(readiness?.checks) ? readiness.checks : [];
  const issues = Array.isArray(readiness?.issues) ? readiness.issues : [];
  const blocking = issues.filter(issue => issue.blocks === 'enable' || issue.severity === 'critical');
  return {
    passing: checks.filter(check => check.satisfied).length + (issues.length === 0 ? 1 : 0),
    warnings: checks.filter(check => !check.satisfied).length + (issues.length - blocking.length),
    blocking: blocking.length
  };
}

/**
 * Whether anything refuses to let this environment be enabled.
 *
 * THE VERDICT'S OWN QUESTION, and it is not a severity ranking (issue 1517). `noAvailableTasks`
 * is `critical` on an active environment and `warning` on a disabled one — the same missing
 * task, graded by how loud it needs to be — but it carries `blocks: 'enable'` in both states,
 * because an environment with no available task cannot be enabled either way. Reading the verdict
 * off severity told the GM of a disabled, taskless environment that it "Saves and enables"; it
 * does not.
 *
 * @param {ReadinessIssue[]} [issues]
 * @returns {boolean}
 */
export function blocksEnable(issues = []) {
  return issues.some(issue => issue.blocks === 'enable');
}
