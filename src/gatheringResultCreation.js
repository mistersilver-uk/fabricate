/**
 * The gathering award seam, split out of `main.js` so it is runtime-importable under `node --test`.
 * It turns a task's authored result rows into owned Items: resolve each to its award source, then
 * stack onto an owned quantity item or create a new document.
 * THE DURABLE-IDENTITY STACK GUARD IS THE LOAD-BEARING PART (issue 556) — a fresh award is handed
 * the awarding system's resolved component set and id, so it is never folded into an owned item
 * that resolves to a DIFFERENT component through a transitive `_stats.duplicateSource`.
 */

import { stampItemDataRoleIdentity } from './config/flags.js';
// Routed onto the configured stack-quantity path (issue 1024) but deliberately NOT consolidated
// onto `createOrStackComponentItem`: the absent-field default and this path's own stack-match
// resolution both differ, so merging them is its own change.
import {
  hasStackQuantity,
  readStoredStackQuantity,
  setStackQuantity,
  updateStackQuantity,
} from './systems/itemStackQuantity.js';
import { resolvedComponentsFor } from './systems/scopedEntityReads.js';
import { findStackableMatch } from './utils/sourceUuid.js';

export function flattenGatheringResults(resultGroups = []) {
  return resultGroups.flatMap((group) => (Array.isArray(group?.results) ? group.results : []));
}

// Resolve the awarding system's component set exactly as `resolveGatheringResultSource` does. The
// stack guard must be handed this set and `system.id`, or a fresh award can be folded into an owned
// item resolving to a different component (issue 556).
export function resolveGatheringSystemComponents(system, craftingSystemManager) {
  const own = resolvedComponentsFor(system);
  if (own.length > 0) return own;
  return resolvedComponentsFor(craftingSystemManager?.getSystem?.(system?.id));
}

/**
 * Resolve a result row to the thing that will be awarded, as `{ source, componentId }`.
 * `componentId` is non-null ONLY when the award resolved through a MANAGED COMPONENT, because the
 * identity stamp (issue 780) keys off that fact and not off what the row authored — a row may carry
 * an `itemUuid` AND a `componentId`. An `itemUuid` that fails to resolve falls back to the component
 * lookup, matching the `registeredItemUuid` branch, which otherwise silently dropped the award.
 */
export function resolveGatheringResultAward(result, system, craftingSystemManager) {
  if (result?.itemUuid) {
    const resolved = resolveUuidSync(result.itemUuid);
    if (resolved) return { source: resolved, componentId: null };
  }
  const componentId = result?.componentId || result?.systemItemId;
  const component =
    resolvedComponentsFor(system).find((entry) => entry.id === componentId) ??
    resolvedComponentsFor(craftingSystemManager?.getSystem?.(system?.id)).find(
      (entry) => entry.id === componentId
    ) ??
    null;
  if (!component) return { source: null, componentId: null };
  if (component.registeredItemUuid) {
    return {
      source: resolveUuidSync(component.registeredItemUuid) ?? component,
      componentId: component.id,
    };
  }
  return { source: component, componentId: component.id };
}

export function resolveGatheringResultSource(result, system, craftingSystemManager) {
  return resolveGatheringResultAward(result, system, craftingSystemManager).source;
}

/** Human-readable identity for a result row that could not be resolved to an award. */
export function describeUnresolvedResult(result) {
  return (
    stringOrNull(result?.itemUuid) ||
    stringOrNull(result?.componentId) ||
    stringOrNull(result?.systemItemId) ||
    stringOrNull(result?.id) ||
    'an unnamed result row'
  );
}

function stringOrNull(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

/**
 * Resolve every row up front so an unresolvable one is caught BEFORE anything is created.
 * Answers `{ awards, unresolved }`, the latter describing rows with no award source.
 */
function resolveAllResults(resultGroups, system, craftingSystemManager) {
  const awards = [];
  const unresolved = [];
  for (const result of flattenGatheringResults(resultGroups)) {
    const award = resolveGatheringResultAward(result, system, craftingSystemManager);
    if (!award.source) {
      unresolved.push(describeUnresolvedResult(result));
      continue;
    }
    awards.push({ result, ...award });
  }
  return { awards, unresolved };
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

/**
 * `componentId` is carried so a ref built BEFORE creation still has an identity: a planned award
 * resolving to a bare component has no `uuid` yet, and a uuid-only identity made downstream discard
 * every such award, emptying the chat card and run journal for a gather that did award items.
 */
export function gatheringRunItemRef(actor, item, quantity = 1, componentId = null) {
  const ref = {
    actorUuid: actor?.uuid ?? null,
    itemUuid: item?.uuid ?? item?.registeredItemUuid ?? null,
    quantity: Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1,
  };
  // ONLY the resolved award may supply this. A created Foundry Item's `id` is a
  // document id, not a component id, so falling back to it would stamp a bogus identity.
  const id = stringOrNull(componentId);
  if (id) ref.componentId = id;
  const name = stringOrNull(item?.name);
  const img = stringOrNull(item?.img);
  if (name) ref.name = name;
  if (img) ref.img = img;
  return ref;
}

export function createGatheringResultCreator(craftingSystemManager) {
  return {
    // Unresolved rows are DIAGNOSTICS, not a quietly shortened list. The engine turns them into a
    // blocked, misconfigured start BEFORE the node and stamina are committed, so a broken drop
    // reference costs the player nothing and can be retried once the GM fixes it.
    async plan({ actor, system, resultGroups = [] } = {}) {
      const { awards, unresolved } = resolveAllResults(resultGroups, system, craftingSystemManager);
      if (unresolved.length > 0) {
        return {
          diagnostics: unresolved.map((reference) => ({
            code: 'RESULT_SOURCE_UNRESOLVED',
            messageKey: 'FABRICATE.Gathering.Diagnostics.ResultSourceUnresolved',
            message: `Gathering result could not be resolved to an item: ${reference}`,
          })),
        };
      }
      return awards.map((award) =>
        gatheringRunItemRef(actor, award.source, award.result.quantity, award.componentId)
      );
    },

    async create({ actor, system, resultGroups = [] } = {}) {
      const { awards, unresolved } = resolveAllResults(resultGroups, system, craftingSystemManager);
      // `plan` already blocked this attempt, so reaching here means the two disagreed. Throw
      // rather than create a partial award: a half-granted gather is worse than a loud failure.
      if (unresolved.length > 0) {
        const error = new Error(
          `Fabricate | Refusing to award a gathering result with unresolved sources: ${unresolved.join(', ')}`
        );
        error.code = 'RESULT_SOURCE_UNRESOLVED';
        throw error;
      }

      const created = [];
      for (const award of awards) {
        const { result, source, componentId } = award;

        const itemData = source.toObject?.() ?? {
          name: source.name ?? 'Gathered Item',
          img: source.img ?? 'icons/svg/item-bag.svg',
          type: source.type ?? 'loot',
          system: source.system
            ? (globalThis.foundry?.utils?.deepClone?.(source.system) ?? { ...source.system })
            : {},
        };
        itemData.system ??= {};
        if (hasStackQuantity(itemData) || result.quantity) {
          setStackQuantity(itemData, Number(result.quantity || 1));
        }
        if (source.uuid) {
          globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
        }

        // Stamp the awarded component's durable per-system identity (issue 780) on the CREATED
        // item. NEVER `source.id` — in the `registeredItemUuid` case that is a Foundry Item id.
        // The gate is the RESOLVER's `componentId`, never a raw `result.componentId`: a row may
        // carry both an `itemUuid` and a `componentId`, so only "the award resolved AS that
        // component" may stamp. The stack branch never touches `itemData`, so this is create-only.
        if (componentId) {
          stampItemDataRoleIdentity(itemData, system?.id, 'componentId', componentId);
        }

        // Never fold an award into an owned item that resolves to a DIFFERENT component (issue
        // 556), so hand the stack guard the resolved component set and the system id.
        const stackComponents = resolveGatheringSystemComponents(system, craftingSystemManager);
        const existing = findStackableMatch(
          normalizeFoundryCollection(actor.items),
          source,
          stackComponents,
          system?.id
        );
        if (existing) {
          // `absentDefault` 0, not 1: this site has always read a missing stack quantity as zero,
          // unlike every other stacking site, so an award onto a field-less item authors exactly it.
          const next =
            readStoredStackQuantity(existing, { absentDefault: 0 }) +
            Number(result.quantity || 1);
          await updateStackQuantity(existing, next);
          created.push(gatheringRunItemRef(actor, existing, result.quantity, componentId));
          continue;
        }

        const [item] = await actor.createEmbeddedDocuments('Item', [itemData]);
        if (item) created.push(gatheringRunItemRef(actor, item, result.quantity, componentId));
      }
      return created;
    },
  };
}
