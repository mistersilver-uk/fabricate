/**
 * Pure environment readiness + issue evaluation for the gathering environment
 * editor. Consumes the draft environment and the composition view-model
 * (`adminStore._buildEnvironmentCompositionViewModel`) and returns structured
 * checks/issues with stable ids; the UI layer maps ids to localized copy. No
 * Svelte, Foundry, or store dependencies so it stays unit-testable.
 *
 * @typedef {{ id: string, satisfied: boolean }} ReadinessCheck
 * @typedef {{ id: string, severity: 'critical' | 'warning' | 'info', recordKind?: 'task' | 'event', recordId?: string, recordName?: string }} ReadinessIssue
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
  const staleIncluded = Number(counts.unavailableTasks || 0) + Number(counts.unavailableEvents || 0);
  const noStaleIncluded = staleIncluded === 0;

  const checks = [
    { id: 'hasName', satisfied: hasName },
    { id: 'hasDescription', satisfied: hasDescription },
    { id: 'hasBiome', satisfied: hasBiome },
    { id: 'hasDanger', satisfied: hasDanger },
    { id: 'hasCompositionMode', satisfied: hasCompositionMode },
    { id: 'hasAvailableTask', satisfied: hasAvailableTask },
    { id: 'noStaleIncluded', satisfied: noStaleIncluded }
  ];

  const issues = [];
  const active = environment?.enabled !== false;

  if (!hasAvailableTask) {
    issues.push({ id: 'noAvailableTasks', severity: 'critical' });
  }
  if (active && !hasAvailableTask) {
    issues.push({ id: 'activeNoComposition', severity: 'critical' });
  }
  for (const entry of [...tasks, ...events]) {
    if (entry.compositionState === 'includedButUnavailable') {
      issues.push({ id: 'staleIncluded', severity: 'critical', recordKind: entry.kind, recordId: entry.id, recordName: entry.record?.name || entry.id });
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
