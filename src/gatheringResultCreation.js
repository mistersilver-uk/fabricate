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

import { stampItemDataRoleIdentity } from './config/flags.js';
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

/**
 * Resolve a result row to the thing that will be awarded.
 *
 * Returns `{ source, componentId }`. `componentId` is non-null ONLY when the award
 * resolved through a MANAGED COMPONENT — the identity stamp (issue 780) keys off
 * that fact, not off what the row happened to author. A row can carry an `itemUuid`
 * AND a `componentId` (every d100 drop row does), so "the row named a component" and
 * "the award resolved as that component" are different questions and only the second
 * one may stamp.
 *
 * An `itemUuid` that fails to resolve now FALLS BACK to the component lookup instead
 * of giving up. That asymmetry was a real defect: the `registeredItemUuid` branch
 * below has always fallen back to the bare component, while the `itemUuid` branch
 * returned null and the caller silently dropped the award.
 */
export function resolveGatheringResultAward(result, system, craftingSystemManager) {
  if (result?.itemUuid) {
    const resolved = resolveUuidSync(result.itemUuid);
    if (resolved) return { source: resolved, componentId: null };
  }
  const componentId = result?.componentId || result?.systemItemId;
  const component =
    (system?.components ?? []).find((entry) => entry.id === componentId) ??
    craftingSystemManager
      ?.getSystem?.(system?.id)
      ?.components?.find((entry) => entry.id === componentId) ??
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
 * Resolve every row up front so an unresolvable one is caught BEFORE anything is
 * created. Returns `{ awards, unresolved }`; `unresolved` holds the descriptions of
 * rows with no award source.
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
 * `componentId` is carried so a ref built BEFORE creation still has an identity. A
 * planned award that resolves to a bare component has no `uuid` yet — the document
 * does not exist until `create` runs — and a uuid-only identity meant every such
 * planned award was discarded downstream, emptying the chat card and run journal for
 * a gather that really did award items.
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
    // Reports UNRESOLVED rows as diagnostics rather than quietly returning a short
    // list. The engine turns diagnostics into a blocked, misconfigured start, which
    // happens BEFORE the node and stamina are committed — so a broken drop reference
    // costs the player nothing and can be retried once the GM fixes it. Dropping the
    // row instead (the old behaviour) spent the node and told nobody.
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
      // `plan` already blocked this attempt, so reaching here means the two disagreed.
      // Throw rather than create a partial award: a half-granted gather is worse than a
      // loud one, and silence here is exactly what hid this class of bug.
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
        if (itemData.system.quantity !== undefined || result.quantity) {
          itemData.system.quantity = Number(result.quantity || 1);
        }
        if (source.uuid) {
          globalThis.foundry?.utils?.setProperty?.(itemData, 'flags.core.sourceId', source.uuid);
        }

        // Stamp the awarded component's durable per-system identity (issue 780) on the
        // CREATED award item so a gathered part resolves to its OWN component through the
        // identity tier once #601 removes the name fallback. NEVER `source.id`: in the
        // `registeredItemUuid` case `source` is the registered source Item, whose id is a
        // Foundry Item id, not the component id.
        //
        // The gate is `componentId` from the RESOLVER — i.e. "this award really is that
        // managed component" — not a raw `result.componentId` read. A row can carry both an
        // `itemUuid` and a `componentId` (every d100 drop row does), so a uuid-resolved award
        // with a stray componentId still stamps nothing, while a row whose uuid failed and
        // fell back to its component now correctly DOES stamp. Reading the row directly would
        // get both cases wrong. The stack branch below never touches `itemData`, so this
        // stays create-only.
        if (componentId) {
          stampItemDataRoleIdentity(itemData, system?.id, 'componentId', componentId);
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
