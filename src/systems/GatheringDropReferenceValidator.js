function componentList(systemOrComponents = null) {
  if (Array.isArray(systemOrComponents)) return systemOrComponents;
  if (Array.isArray(systemOrComponents?.components)) return systemOrComponents.components;
  if (Array.isArray(systemOrComponents?.items)) return systemOrComponents.items;
  return [];
}

function componentIds(systemOrComponents = null) {
  return new Set(
    componentList(systemOrComponents)
      .map((component) => String(component?.id || '').trim())
      .filter(Boolean)
  );
}

function taskLabel(task = {}, index = 0) {
  return String(task?.name || task?.id || `Task ${index + 1}`).trim();
}

function rowLabel(row = {}, index = 0) {
  return String(row?.name || row?.id || `row ${index + 1}`).trim();
}

function isItemDocument(document) {
  if (!document) return false;
  const documentName = document.documentName || document.constructor?.documentName || '';
  if (documentName) return documentName === 'Item';
  return true;
}

async function defaultAsyncUuidResolver(uuid) {
  if (!uuid) return null;
  try {
    if (typeof globalThis.fromUuid === 'function') {
      const document = await globalThis.fromUuid(uuid);
      if (document) return document;
    }
    if (typeof globalThis.fromUuidSync === 'function') {
      return globalThis.fromUuidSync(uuid) || null;
    }
  } catch {
    return null;
  }
  return null;
}

function defaultSyncUuidResolver(uuid) {
  if (!uuid || typeof globalThis.fromUuidSync !== 'function') return;
  try {
    return globalThis.fromUuidSync(uuid) || null;
  } catch {
    return null;
  }
}

function normalizeTasks(tasks = []) {
  return Array.isArray(tasks) ? tasks : [];
}

function normalizeRows(task = {}) {
  return Array.isArray(task?.dropRows ?? task?.itemDrops) ? (task.dropRows ?? task.itemDrops) : [];
}

function baseDropErrors(row, label) {
  const errors = [];
  const quantity = Number(row?.quantity);
  const dropRate = Number(row?.dropRate);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push(`${label} quantity must be positive`);
  }
  if (!Number.isInteger(dropRate) || dropRate < 0 || dropRate > 100) {
    errors.push(`${label} dropRate must be an integer from 0 to 100`);
  }
  return errors;
}

function shouldValidateRow(row, validateDisabledRows) {
  return validateDisabledRows || row?.enabled !== false;
}

/**
 * Validate gathering task drop row targets with an async UUID resolver.
 *
 * @param {object} options
 * @param {object[]} options.tasks Gathering tasks.
 * @param {object|object[]} options.system Owning system or component list.
 * @param {string} [options.systemId] Owning system id for diagnostics.
 * @param {Function} [options.resolveUuid] Async UUID resolver.
 * @param {boolean} [options.requireAtLeastOneEnabled=true] Require each task to have an enabled row.
 * @param {boolean} [options.validateDisabledRows=true] Validate disabled row targets too.
 * @returns {Promise<string[]>}
 */
export async function validateGatheringDropReferences({
  tasks = [],
  system = null,
  systemId = '',
  resolveUuid = defaultAsyncUuidResolver,
  requireAtLeastOneEnabled = true,
  validateDisabledRows = true,
  validateBasics = true,
} = {}) {
  const ids = componentIds(system);
  const hasComponentContext = system !== null && system !== undefined;
  const errors = [];
  const prefix = systemId ? `System "${systemId}" ` : '';

  for (const [taskIndex, task] of normalizeTasks(tasks).entries()) {
    const rows = normalizeRows(task);
    const label = `${prefix}Task "${taskLabel(task, taskIndex)}"`;
    if (requireAtLeastOneEnabled && !rows.some((row) => row?.enabled !== false)) {
      errors.push(`${label} requires at least one drop row`);
    }
    for (const [rowIndex, row] of rows.entries()) {
      if (!shouldValidateRow(row, validateDisabledRows)) continue;
      const dropLabel = `${label} drop row "${rowLabel(row, rowIndex)}"`;
      const componentId = String(row?.componentId || '').trim();
      const itemUuid = String(row?.itemUuid || '').trim();
      if (validateBasics) errors.push(...baseDropErrors(row, dropLabel));
      if (componentId) {
        if (hasComponentContext && !ids.has(componentId)) {
          errors.push(`${dropLabel} references unknown componentId "${componentId}"`);
        }
        continue;
      }
      if (!itemUuid) {
        errors.push(`${dropLabel} requires componentId or itemUuid`);
        continue;
      }
      const document = await resolveUuid(itemUuid);
      if (!isItemDocument(document)) {
        errors.push(`${dropLabel} itemUuid "${itemUuid}" does not resolve to an Item`);
      }
    }
  }

  return errors;
}

/**
 * Validate gathering task drop row targets when only synchronous UUID lookup is available.
 * If no sync resolver exists, item UUID rows are treated as unknown rather than invalid.
 *
 * @param {object} options
 * @returns {string[]}
 */
export function validateGatheringDropReferencesSync({
  tasks = [],
  system = null,
  systemId = '',
  resolveUuid = defaultSyncUuidResolver,
  requireAtLeastOneEnabled = true,
  validateDisabledRows = true,
  validateBasics = true,
} = {}) {
  const ids = componentIds(system);
  const hasComponentContext = system !== null && system !== undefined;
  const errors = [];
  const prefix = systemId ? `System "${systemId}" ` : '';

  for (const [taskIndex, task] of normalizeTasks(tasks).entries()) {
    const rows = normalizeRows(task);
    const label = `${prefix}Task "${taskLabel(task, taskIndex)}"`;
    if (requireAtLeastOneEnabled && !rows.some((row) => row?.enabled !== false)) {
      errors.push(`${label} requires at least one drop row`);
    }
    for (const [rowIndex, row] of rows.entries()) {
      if (!shouldValidateRow(row, validateDisabledRows)) continue;
      const dropLabel = `${label} drop row "${rowLabel(row, rowIndex)}"`;
      const componentId = String(row?.componentId || '').trim();
      const itemUuid = String(row?.itemUuid || '').trim();
      if (validateBasics) errors.push(...baseDropErrors(row, dropLabel));
      if (componentId) {
        if (hasComponentContext && !ids.has(componentId)) {
          errors.push(`${dropLabel} references unknown componentId "${componentId}"`);
        }
        continue;
      }
      if (!itemUuid) {
        errors.push(`${dropLabel} requires componentId or itemUuid`);
        continue;
      }
      const document = resolveUuid(itemUuid);
      if (document !== undefined && !isItemDocument(document)) {
        errors.push(`${dropLabel} itemUuid "${itemUuid}" does not resolve to an Item`);
      }
    }
  }

  return errors;
}
