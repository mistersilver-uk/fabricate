/**
 * The environment editor's pure validation layer: the empty projection, the save-rejection report
 * the editor renders inline, and the per-field draft normalizers. No Foundry global, no store and
 * no closure read — every input arrives as an argument (issue 1708).
 */

export function emptyEnvironmentState(canShowEnvironmentsTab = false, error = null) {
  return {
    canShowEnvironmentsTab,
    environmentsLoading: false,
    environmentsError: error,
    environments: [],
    selectedEnvironmentId: '',
    environmentDraft: null,
    environmentDraftDirty: false,
    environmentDraftIsNew: false,
    environmentSaving: false,
    environmentSaveError: null,
    environmentValidationState: null,
  };
}

export function environmentErrorMessage(err) {
  if (!err) return null;
  if (Array.isArray(err.errors) && err.errors.length > 0) {
    return err.errors.join('\n');
  }
  return err.message || String(err);
}

function environmentValidationMessages(err) {
  if (!err) return [];
  if (Array.isArray(err.errors)) {
    return err.errors
      .map((error) => (typeof error === 'string' ? error : error?.message))
      .filter(Boolean);
  }
  const message = environmentErrorMessage(err);
  return message ? [message] : [];
}

function fieldSelectorForPath(path) {
  if (!path) return null;
  const escaped = String(path)
    .replaceAll('\\', '\\\\')
    .replaceAll('"', String.raw`\"`);
  return `[data-environment-field="${escaped}"]`;
}

function validationSummary(count, localizeFn) {
  const key =
    count === 1
      ? 'FABRICATE.Admin.Environments.ValidationSummaryOne'
      : 'FABRICATE.Admin.Environments.ValidationSummary';
  return (
    localizeFn?.(key, { count }) ||
    (count === 1
      ? 'Resolve 1 validation issue before saving.'
      : `Resolve ${count} validation issues before saving.`)
  );
}

export function buildEnvironmentValidationState(err, draft, localizeFn, attempt) {
  const messages = environmentValidationMessages(err);
  if (messages.length === 0) return null;

  const structuredErrors = Array.isArray(err?.fieldErrors) ? err.fieldErrors : [];
  const inferenceContext = createEnvironmentValidationInferenceContext();
  const errors = messages.map((message, index) => {
    const structured = structuredErrors[index] || {};
    const inferred = inferEnvironmentValidationTarget(message, draft, inferenceContext);
    const path =
      structured.path || structured.fieldPath || structured.field || inferred?.path || null;
    const taskId = structured.taskId || inferred?.taskId || null;
    const fieldSelector = structured.fieldSelector || fieldSelectorForPath(path);
    return {
      message,
      path,
      taskId,
      fieldSelector,
      id: path
        ? `environment-validation-${domIdFromPath(path)}-${index}`
        : `environment-validation-${index}`,
    };
  });

  return {
    summary: validationSummary(errors.length, localizeFn),
    errors,
    firstInvalidField: errors.find((error) => error.fieldSelector) || errors[0] || null,
    attempt,
  };
}

function createEnvironmentValidationInferenceContext() {
  return {
    groupNameOccurrences: new Map(),
  };
}

function inferEnvironmentValidationTarget(
  message,
  draft,
  context = createEnvironmentValidationInferenceContext()
) {
  const task = findTaskForValidationMessage(message, draft);
  const lower = String(message || '').toLowerCase();

  if (/at least one task before it can be enabled/.test(lower)) return { path: 'enabled' };
  if (/selection requires|selectionmode/.test(lower)) return { path: 'environment.selectionMode' };
  if (/craftingsystemid/.test(lower)) return { path: 'environment.craftingSystemId' };

  if (!task) return null;
  const prefix = `task.${task.id}`;

  if (/routed resolution requires resultselection|resultselection\.provider/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultSelection.provider` };
  }

  if (/visibility gate requires formula and threshold/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.visibility.formula` };
  }

  const timeUnit = lower.match(/timerequirement\.(minutes|hours|days|months|years)/)?.[1];
  if (timeUnit) return { taskId: task.id, path: `${prefix}.timeRequirement.${timeUnit}` };
  if (/timerequirement must include a positive duration/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.timeRequirement.minutes` };
  }

  if (/failureoutcome\.mode/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.failureOutcome.mode` };
  }
  if (/failureoutcome text mode requires text/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.failureOutcome.text` };
  }
  if (/failureoutcome macro mode requires macrouuid/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.failureOutcome.macroUuid` };
  }

  const resultGroupName = message.match(/result group "([^"]+)"/)?.[1];
  if (resultGroupName) {
    const group = resolveResultGroupValidationTarget({
      task,
      groupName: resultGroupName,
      duplicate: / duplicates "/i.test(message),
      context,
    });
    return {
      taskId: task.id,
      path: group ? `${prefix}.resultGroups.${group.id}.name` : `${prefix}.resultGroups`,
    };
  }
  if (/result groups require names/.test(lower)) {
    const group = resolveResultGroupValidationTarget({
      task,
      groupName: '',
      context,
    });
    return {
      taskId: task.id,
      path: group ? `${prefix}.resultGroups.${group.id}.name` : `${prefix}.resultGroups`,
    };
  }
  if (/requires at least one result group|exactly one result group/.test(lower)) {
    return { taskId: task.id, path: `${prefix}.resultGroups` };
  }
  if (/progressive result group requires at least one result/.test(lower)) {
    const group = Array.isArray(task.resultGroups) ? task.resultGroups[0] : null;
    return {
      taskId: task.id,
      path: group ? `${prefix}.resultGroups.${group.id}.results` : `${prefix}.resultGroups`,
    };
  }

  const resultId = message.match(/progressive result "([^"]+)"/)?.[1];
  if (resultId) return { taskId: task.id, path: `${prefix}.result.${resultId}.componentId` };

  return { taskId: task.id, path: `${prefix}.name` };
}

function resolveResultGroupValidationTarget({ task, groupName, duplicate = false, context }) {
  const groups = Array.isArray(task?.resultGroups) ? task.resultGroups : [];
  const normalizedName = normalizeValidationGroupName(groupName);
  const matches = groups.filter(
    (group) => normalizeValidationGroupName(group?.name) === normalizedName
  );
  if (matches.length === 0) return null;

  const occurrenceKey = `${task?.id || 'task'}:${duplicate ? 'duplicate' : 'named'}:${normalizedName}`;
  const previous = context.groupNameOccurrences.get(occurrenceKey);
  const defaultIndex = duplicate && matches.length > 1 ? 1 : 0;
  const index = previous === undefined ? defaultIndex : previous + 1;
  context.groupNameOccurrences.set(occurrenceKey, index);
  return matches[Math.min(index, matches.length - 1)] || matches[0];
}

function normalizeValidationGroupName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function findTaskForValidationMessage(message, draft) {
  const tasks = Array.isArray(draft?.tasks) ? draft.tasks : [];
  const taskName = String(message || '').match(/Task "([^"]+)"/)?.[1];
  if (taskName) {
    return tasks.find((task) => task?.name === taskName) || tasks[0] || null;
  }
  return tasks[0] || null;
}

function domIdFromPath(path) {
  return String(path || 'field').replaceAll(/[^a-zA-Z0-9_-]+/g, '-');
}

export function normalizeDraftBlindSelection(value) {
  if (!value || typeof value !== 'object') return null;
  const weights =
    value.weights && typeof value.weights === 'object'
      ? Object.fromEntries(
          Object.entries(value.weights)
            .map(([key, weight]) => [String(key), Number(weight)])
            .filter(([, weight]) => Number.isFinite(weight))
        )
      : {};
  if (Object.keys(weights).length === 0) return null;
  return { weights };
}

function normalizeDraftDropRateAdjustmentValue(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < -100 || number > 100 || number === 0) return null;
  return number;
}

export function normalizeDraftDropRateAdjustmentMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([id, adjustment]) => [
        String(id || '').trim(),
        normalizeDraftDropRateAdjustmentValue(adjustment),
      ])
      .filter(([id, adjustment]) => id && adjustment !== null)
  );
}

export function normalizeDraftTaskDropRateAdjustments(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([taskId, rowAdjustments]) => [
        String(taskId || '').trim(),
        normalizeDraftDropRateAdjustmentMap(rowAdjustments),
      ])
      .filter(([taskId, rowAdjustments]) => taskId && Object.keys(rowAdjustments).length > 0)
  );
}

export function normalizeDraftTaskDropRateAdjustmentsEnabled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([taskId, enabled]) => [String(taskId || '').trim(), enabled])
      .filter(([taskId, enabled]) => taskId && enabled === false)
  );
}

export function normalizeDraftEventDropRateAdjustmentsEnabled(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([eventId, enabled]) => [String(eventId || '').trim(), enabled])
      .filter(([eventId, enabled]) => eventId && enabled === false)
  );
}
