import { getFabricateFlag } from '../config/flags.js';

import { resolveComponentForItem } from './sourceUuid.js';

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

  // Deterministic precedence: the list-aware, system-scoped identity/source-ref
  // resolver is authoritative; name is a compatibility fallback for components
  // created before source refs existed (its closure is deferred to issue 557).
  const resolved = resolveComponentForItem(item, components, systemId);
  if (resolved) return resolved;

  return (
    components.find(
      (component) =>
        component?.name &&
        item?.name &&
        String(item.name).toLowerCase() === String(component.name).toLowerCase()
    ) || null
  );
}

export function resolveItemEssences(item, components = [], systemId) {
  const flaggedEssences = normalizeEssences(getFabricateFlag(item, 'essences', {}));
  if (hasEssences(flaggedEssences)) return flaggedEssences;

  const component = findMatchingComponent(item, components, systemId);
  return normalizeEssences(component?.essences || {});
}

export function accumulateItemEssences(
  items = [],
  { components = [], systemId, multiplyByQuantity = false } = {}
) {
  const accumulated = {};

  for (const item of items || []) {
    const essences = resolveItemEssences(item, components, systemId);
    const multiplier = multiplyByQuantity ? Math.max(1, Number(item?.system?.quantity) || 1) : 1;

    for (const [type, quantity] of Object.entries(essences)) {
      accumulated[type] = (accumulated[type] || 0) + quantity * multiplier;
    }
  }

  return accumulated;
}
