/**
 * The gathering award seam: result rows to award sources, then stacked or created Items. The
 * load-bearing part is the stack guard (issue 556), which never folds an award into an item
 * resolving to a different component through a transitive `_stats.duplicateSource`.
 */

import { stampItemDataRoleIdentity } from './config/flags.js';
// On the configured stack-quantity path (issue 1024), deliberately NOT consolidated onto
// `createOrStackComponentItem`: the absent-field default and stack-match resolution both differ.
import {
  hasStackQuantity,
  setStackQuantity,
} from './systems/itemStackQuantity.js';
import { resolveRolledAmount } from './systems/rolledAmountResolver.js';
import { createItemReceiptCollector, receiptQuantity, writeItemAward, unconfirmedHistoryError } from './systems/runHistoryEvidence.js';
import { resolvedComponentsFor } from './systems/scopedEntityReads.js';
import { diceEngine } from './utils/rollFormulaRollability.js';
import { stringOrNull } from './utils/scalars.js';
import { findStackableMatch } from './utils/sourceUuid.js';

export function flattenGatheringResults(resultGroups = []) {
  return resultGroups.flatMap((group) => (Array.isArray(group?.results) ? group.results : []));
}

export function resolveGatheringSystemComponents(system, craftingSystemManager) {
  const own = resolvedComponentsFor(system);
  if (own.length > 0) return own;
  return resolvedComponentsFor(craftingSystemManager?.getSystem?.(system?.id));
}

/**
 * `componentId` is non-null only when the award resolved through a managed component, which the
 * identity stamp keys off (issue 780). An unresolvable `itemUuid` falls back to the component.
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

export function describeUnresolvedResult(result) {
  return (
    stringOrNull(result?.itemUuid) ||
    stringOrNull(result?.componentId) ||
    stringOrNull(result?.systemItemId) ||
    stringOrNull(result?.id) ||
    'an unnamed result row'
  );
}

/** Every row resolved up front, so an unresolvable one is caught BEFORE anything is created. */
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

/** Carries `componentId`, since a planned award has no `uuid` yet. */
export function gatheringRunItemRef(actor, item, quantity = null, componentId = null) {
  const ref = {
    actorUuid: actor?.uuid ?? null,
    itemUuid: item?.uuid ?? item?.registeredItemUuid ?? null,
    quantity: receiptQuantity(quantity),
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

/**
 * What `plan()` rolled, so plan and award are one roll (issue 1645). Keyed on the row id, since
 * `create()` may get an equal clone of the task.
 */
function plannedAmounts() {
  const byId = new Map();
  const byRow = new WeakMap();
  const keyOf = (result) => stringOrNull(result?.resultRowId) ?? stringOrNull(result?.id);
  return {
    park(result, plan) {
      const key = keyOf(result);
      if (key) byId.set(key, plan);
      else byRow.set(result, plan);
    },
    read(result) {
      const key = keyOf(result);
      return key ? byId.get(key) : byRow.get(result);
    },
  };
}

export function createGatheringResultCreator(craftingSystemManager) {
  const planned = plannedAmounts();
  const resolveAmount = (result, actor) =>
    resolveRolledAmount(result, actor, { Roll: diceEngine() });
  return {
    // Diagnostics, never a shortened list: the engine blocks the start before any commit.
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
      const refs = [];
      for (const award of awards) {
        const { amount, rolled } = await resolveAmount(award.result, actor);
        planned.park(award.result, { amount, rolled });
        refs.push({
          ...gatheringRunItemRef(actor, award.source, amount ?? 1, award.componentId),
          resultRowId: award.result.resultRowId ?? null, sourceItemUuid: award.source.uuid ?? null,
          ...(rolled && { rolled }),
        });
      }
      return refs;
    },

    async create({ actor, system, resultGroups = [] } = {}) {
      const { awards, unresolved } = resolveAllResults(resultGroups, system, craftingSystemManager);
      // `plan` should have blocked this; throw rather than half-grant.
      if (unresolved.length > 0) {
        const error = new Error(
          `Fabricate | Refusing to award a gathering result with unresolved sources: ${unresolved.join(', ')}`
        );
        error.code = 'RESULT_SOURCE_UNRESOLVED';
        throw error;
      }

      const receipts = createItemReceiptCollector();
      try {
      for (const award of awards) {
        const { result, source, componentId } = award;
        const { amount, rolled } = planned.read(result) ?? (await resolveAmount(result, actor));
        const quantity = receiptQuantity(amount ?? 1);
        if (quantity === null) throw unconfirmedHistoryError('Invalid gathering award quantity');
        if (quantity === 0) continue;
        const identity = { actorUuid: actor.uuid, componentId, resultRowId: result.resultRowId ?? null,
          sourceItemUuid: source.uuid ?? null, ...(rolled && { rolled }) };

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
          setStackQuantity(itemData, quantity);
        }
        if (source.uuid) {
          globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
        }

        // Create-only (issue 780), from the resolver's `componentId`; never `source.id`, which can
        // be an Item id.
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
        await writeItemAward({ actor, itemData, existing, quantity, absentDefault: 0,
          receiptCollector: receipts, receiptIdentity: identity });
      }
      } catch (error) { throw receipts.failure(error); }
      return receipts.snapshot();
    },
  };
}
