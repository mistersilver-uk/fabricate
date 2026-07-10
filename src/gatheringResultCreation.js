/**
 * @module gatheringResultCreation
 *
 * The gathering award/result-creation seam, split out of `main.js` so it is
 * runtime-importable in tests (`main.js` statically imports CSS and cannot load
 * under `node --test`). It owns how a gathering task's authored result rows become
 * owned Items on an actor: resolving each result to its award source, and either
 * stacking it onto an existing owned quantity item or creating a new document.
 *
 * The durable-identity stack guard is the load-bearing behaviour here (issue 556):
 * a fresh award is handed the awarding system's resolved component set + system id
 * so it is never folded into an owned item that resolves to a DIFFERENT component
 * via a transitive `_stats.duplicateSource`. Foundry globals (`fromUuidSync`,
 * `foundry.utils`) stay localized inside these helpers; the crafting-system manager
 * is injected.
 */

import { findStackableMatch } from './utils/sourceUuid.js';

export function flattenGatheringResults(resultGroups = []) {
  return resultGroups.flatMap((group) => (Array.isArray(group?.results) ? group.results : []));
}

// Resolve the awarding system's component set the SAME way `resolveGatheringResultSource`
// does — the in-memory `system.components`, falling back to the manager-loaded system's
// components when the passed system carries none. The gathering stack guard
// (`findStackableMatch`) must be handed this exact set + `system.id` so a fresh award is
// never folded into an owned item that resolves to a different component (issue 556).
export function resolveGatheringSystemComponents(system, craftingSystemManager) {
  const own = Array.isArray(system?.components) ? system.components : [];
  if (own.length > 0) return own;
  const resolved = craftingSystemManager?.getSystem?.(system?.id)?.components;
  return Array.isArray(resolved) ? resolved : [];
}

export function resolveGatheringResultSource(result, system, craftingSystemManager) {
  if (result?.itemUuid) return resolveUuidSync(result.itemUuid);
  const componentId = result?.componentId || result?.systemItemId;
  const component =
    (system?.components ?? []).find((entry) => entry.id === componentId) ??
    craftingSystemManager
      ?.getSystem?.(system?.id)
      ?.components?.find((entry) => entry.id === componentId) ??
    null;
  if (!component) return null;
  if (component.sourceUuid) return resolveUuidSync(component.sourceUuid) ?? component;
  return component;
}

export function resolveUuidSync(uuid) {
  if (!uuid || typeof globalThis.fromUuidSync !== 'function') return null;
  try {
    return globalThis.fromUuidSync(uuid) ?? null;
  } catch (_err) {
    return null;
  }
}

export function normalizeFoundryCollection(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === 'function') return Array.from(collection.values());
  if (typeof collection[Symbol.iterator] === 'function') return Array.from(collection);
  return [];
}

export function gatheringRunItemRef(actor, item, quantity = 1) {
  return {
    actorUuid: actor?.uuid ?? null,
    itemUuid: item?.uuid ?? item?.sourceUuid ?? null,
    quantity: Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1,
  };
}

export function createGatheringResultCreator(craftingSystemManager) {
  return {
    async plan({ actor, system, resultGroups = [] } = {}) {
      return flattenGatheringResults(resultGroups)
        .map((result) => {
          const source = resolveGatheringResultSource(result, system, craftingSystemManager);
          return source ? gatheringRunItemRef(actor, source, result.quantity) : null;
        })
        .filter(Boolean);
    },

    async create({ actor, system, resultGroups = [] } = {}) {
      const created = [];
      for (const result of flattenGatheringResults(resultGroups)) {
        const source = resolveGatheringResultSource(result, system, craftingSystemManager);
        if (!source) continue;

        const itemData = source.toObject?.() ?? {
          name: source.name ?? 'Gathered Item',
          img: source.img ?? 'icons/svg/item-bag.svg',
          type: source.type ?? 'loot',
          system: source.system
            ? (globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system })
            : {},
        };
        itemData.system ??= {};
        if (itemData.system.quantity !== undefined || result.quantity) {
          itemData.system.quantity = Number(result.quantity || 1);
        }
        if (source.uuid) {
          globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
        }

        // Stack onto an existing matching item (same source UUID chain) that uses
        // a quantity field, rather than creating a duplicate document — but never fold
        // an award into an owned item that resolves to a DIFFERENT component (issue 556),
        // so hand the guard the resolved component set + system id.
        const stackComponents = resolveGatheringSystemComponents(system, craftingSystemManager);
        const existing = findStackableMatch(
          normalizeFoundryCollection(actor.items),
          source,
          stackComponents,
          system?.id
        );
        if (existing) {
          const next = Number(existing.system?.quantity || 0) + Number(result.quantity || 1);
          await existing.update({ 'system.quantity': next });
          created.push(gatheringRunItemRef(actor, existing, result.quantity));
          continue;
        }

        const [item] = await actor.createEmbeddedDocuments('Item', [itemData]);
        if (item) created.push(gatheringRunItemRef(actor, item, result.quantity));
      }
      return created;
    },
  };
}
