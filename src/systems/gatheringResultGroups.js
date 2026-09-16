import { Result } from '../models/Result.js';

function normalizeResult(result, id) {
  const normalized = Result.fromJSON({ ...result, id }).toJSON();
  if (result && typeof result === 'object' && Object.hasOwn(result, 'quantity')) {
    normalized.quantity = result.quantity;
  }
  return normalized;
}

/**
 * Normalize gathering result groups through the canonical Result serialization contract.
 * Callers own missing-id policy because persisted writes need random ids while read-time
 * composition needs stable fallbacks.
 *
 * @param {unknown} groups Raw result groups.
 * @param {object} [options]
 * @param {(kind: 'group'|'result', groupIndex: number, resultIndex?: number) => string} [options.createId]
 * @param {string} [options.fallbackPrefix]
 * @returns {Array<object>}
 */
export function normalizeGatheringResultGroups(
  groups,
  { createId = null, fallbackPrefix = 'gathering' } = {}
) {
  const list = Array.isArray(groups) ? groups : [];
  const idFor = (kind, groupIndex, resultIndex = null) => {
    const supplied =
      typeof createId === 'function' ? String(createId(kind, groupIndex, resultIndex) || '') : '';
    if (supplied) return supplied;
    const suffix =
      resultIndex === null ? String(groupIndex + 1) : `${groupIndex + 1}-${resultIndex + 1}`;
    return `${fallbackPrefix}-${kind}-${suffix}`;
  };

  return list.map((group, groupIndex) => {
    const checkOutcomeIds = (Array.isArray(group?.checkOutcomeIds) ? group.checkOutcomeIds : [])
      .map((id) => String(id ?? '').trim())
      .filter(Boolean);
    return {
      id: String(group?.id || idFor('group', groupIndex)),
      name: String(group?.name || `Result Group ${groupIndex + 1}`),
      ...(group?.role === 'failure' && { role: 'failure' }),
      ...(checkOutcomeIds.length > 0 && { checkOutcomeIds }),
      results: (Array.isArray(group?.results) ? group.results : []).map((result, resultIndex) =>
        normalizeResult(result, result?.id || idFor('result', groupIndex, resultIndex))
      ),
    };
  });
}
