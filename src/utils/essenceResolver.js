import { getFabricateFlag } from '../config/flags.js';
import { readStackQuantity } from '../systems/itemStackQuantity.js';

import { findComponentByName } from './componentNameMatch.js';
import { itemHasComponentIdentityFlag, resolveComponentForItem } from './sourceUuid.js';

function normalizeEssences(essences = {}) {
  const normalized = {};
  if (!essences || typeof essences !== 'object') return normalized;

  for (const [rawType, rawQuantity] of Object.entries(essences)) {
    const type = String(rawType || '').trim();
    if (!type) continue;

    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;

    normalized[type] = (normalized[type] || 0) + quantity;
  }

  return normalized;
}

function hasEssences(essences) {
  return Object.keys(essences || {}).length > 0;
}

export function findMatchingComponent(item, components = [], systemId) {
  if (!item || !Array.isArray(components)) return null;

  // Deterministic precedence: the list-aware, system-scoped identity/source-ref resolver is
  // authoritative; name is a compatibility fallback for components created before source refs
  // existed (its closure is deferred to issue 557).
  const resolved = resolveComponentForItem(item, components, systemId);
  if (resolved) return resolved;

  // Suppress the cross-system NAME fallback for an item that already carries a durable component
  // identity (issue 538).
  if (itemHasComponentIdentityFlag(item)) return null;

  // Case-INSENSITIVE name fallback via the shared helper (warn-once telemetry, issue 540).
  return findComponentByName(item, components, { caseSensitive: false, systemId });
}

/** Resolve the essences a submitted/available item contributes. */
export function resolveItemEssences(
  item,
  components = [],
  systemId = null,
  resolveComponent = findMatchingComponent
) {
  const flaggedEssences = normalizeEssences(getFabricateFlag(item, 'essences', {}));
  if (hasEssences(flaggedEssences)) return flaggedEssences;

  const component = resolveComponent(item, components, systemId);
  return normalizeEssences(component?.essences || {});
}

export function accumulateItemEssences(
  items = [],
  {
    components = [],
    systemId,
    multiplyByQuantity = false,
    resolveComponent = findMatchingComponent,
  } = {}
) {
  const accumulated = {};

  for (const item of items || []) {
    const essences = resolveItemEssences(item, components, systemId, resolveComponent);
    const multiplier = multiplyByQuantity ? readStackQuantity(item) : 1;

    for (const [type, quantity] of Object.entries(essences)) {
      accumulated[type] = (accumulated[type] || 0) + quantity * multiplier;
    }
  }

  return accumulated;
}

/**
 * Accumulate essences from PRE-BUCKETED alchemy submission records — the true bucket-once essence
 * path (issue 578).
 */
export function accumulateSubmissionEssences(records = [], { components = [] } = {}) {
  const accumulated = {};
  const byId = new Map();
  for (const component of Array.isArray(components) ? components : []) {
    if (component?.id != null) byId.set(component.id, component);
  }

  for (const record of records || []) {
    const flaggedEssences = normalizeEssences(getFabricateFlag(record?.item, 'essences', {}));
    let essences;
    if (hasEssences(flaggedEssences)) {
      essences = flaggedEssences;
    } else {
      const component = record?.componentId == null ? null : byId.get(record.componentId);
      essences = normalizeEssences(component?.essences || {});
    }

    for (const [type, quantity] of Object.entries(essences)) {
      accumulated[type] = (accumulated[type] || 0) + quantity;
    }
  }

  return accumulated;
}
