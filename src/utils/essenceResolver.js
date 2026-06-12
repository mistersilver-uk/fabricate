import { getFabricateFlag } from '../config/flags.js';

import { itemMatchesComponentSource } from './sourceUuid.js';

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

function findMatchingComponent(item, components = []) {
  if (!item || !Array.isArray(components)) return null;

  // Deterministic precedence: source references are authoritative; name is a
  // compatibility fallback for components created before source refs existed.
  const sourceMatch = components.find((component) => itemMatchesComponentSource(item, component));
  if (sourceMatch) return sourceMatch;

  return (
    components.find(
      (component) =>
        component?.name &&
        item?.name &&
        String(item.name).toLowerCase() === String(component.name).toLowerCase()
    ) || null
  );
}

export function resolveItemEssences(item, components = []) {
  const flaggedEssences = normalizeEssences(getFabricateFlag(item, 'essences', {}));
  if (hasEssences(flaggedEssences)) return flaggedEssences;

  const component = findMatchingComponent(item, components);
  return normalizeEssences(component?.essences || {});
}

export function accumulateItemEssences(
  items = [],
  { components = [], multiplyByQuantity = false } = {}
) {
  const accumulated = {};

  for (const item of items || []) {
    const essences = resolveItemEssences(item, components);
    const multiplier = multiplyByQuantity ? Math.max(1, Number(item?.system?.quantity) || 1) : 1;

    for (const [type, quantity] of Object.entries(essences)) {
      accumulated[type] = (accumulated[type] || 0) + quantity * multiplier;
    }
  }

  return accumulated;
}
