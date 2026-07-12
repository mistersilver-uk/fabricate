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

/**
 * Resolve the essences a submitted/available item contributes.
 *
 * The item's own `flags.fabricate.essences` take precedence; absent those, the
 * component the item resolves to (via `resolveComponent`) supplies its
 * component-defined essences.
 *
 * @param {Item|object|null} item
 * @param {Array<object>} [components] - The candidate component set of ONE system.
 * @param {string|null|undefined} [systemId] - That system's id (durable-flag scope).
 * @param {(item: object, components: Array<object>, systemId: string|null|undefined) => object|null} [resolveComponent] -
 *   The component resolver. Defaults to {@link findMatchingComponent} (tiers 1-3 +
 *   name), preserving today's behavior for gathering/inventory/standard-crafting
 *   callers. The alchemy craft path injects {@link resolveAlchemySubmissionComponent}
 *   (which adds the bare-`registeredItemUuid` tier) so essence attribution resolves
 *   to the same component the submission collector bucketed the item to.
 * @returns {object} The normalized essence map.
 */
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
    const multiplier = multiplyByQuantity ? Math.max(1, Number(item?.system?.quantity) || 1) : 1;

    for (const [type, quantity] of Object.entries(essences)) {
      accumulated[type] = (accumulated[type] || 0) + quantity * multiplier;
    }
  }

  return accumulated;
}

/**
 * Accumulate essences from PRE-BUCKETED alchemy submission records — the
 * true bucket-once essence path (issue 578). Each record already carries the
 * `componentId` the submission collector ({@link resolveAlchemySubmissions})
 * bucketed the item to, tier-4-aware, so essence attribution reads the exact same
 * id group counting reads and cannot diverge from the signature gate.
 *
 * The item's own `flags.fabricate.essences` still take precedence (mirroring
 * {@link resolveItemEssences}); absent those, the record's `componentId` looks up
 * the component in `components` and its component-defined essences are used. Each
 * record counts as one unit (the workbench expands a stack into one submission per
 * unit), matching the per-unit occurrence model of the signature matcher.
 *
 * @param {Array<{item: object, componentId: string|null}>} records
 * @param {{ components?: Array<object>, systemId?: string|null|undefined }} [options]
 * @returns {object} The normalized, accumulated essence map.
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
