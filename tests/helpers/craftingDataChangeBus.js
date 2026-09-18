/**
 * A `globalThis.Hooks` fake with the five shipped store subscriptions already attached (issue 1078
 * part B1).
 */
import { INVALIDATION_STORES, STORE_DOMAINS } from '../../src/systems/invalidationDomains.js';
import {
  CRAFTING_DATA_CHANGED_HOOK,
  readCraftingDataFallbackCount,
  resetCraftingDataFallbackCount,
  subscribeCraftingDataChange,
} from '../../src/ui/svelte/util/foundryBridge.js';

/** Every store the taxonomy names, in declaration order. */
export const TAXONOMY_STORES = Object.freeze(Object.values(INVALIDATION_STORES));

/**
 * Install a Hooks fake on `globalThis` and attach one shipped subscription per store.
 *
 * @param {boolean} [options.subscribe=true] Attach the store subscriptions. `false` gives a bare
 * bus, for a case that wants to observe emissions without any consumer.
 * @returns {object} The bus handle.
 */
export function installCraftingDataBus({ subscribe = true } = {}) {
  const handlers = new Map();
  let nextId = 0;
  /** @type {{name: string, payload: unknown}[]} */
  const emitted = [];

  const hooks = {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Map());
      nextId += 1;
      handlers.get(name).set(nextId, fn);
      return nextId;
    },
    off(name, id) {
      handlers.get(name)?.delete(id);
    },
    callAll(name, payload) {
      emitted.push({ name, payload });
      // Snapshot iteration, exactly as Foundry's own `Hooks.callAll` does, so a listener
      // unsubscribing mid-dispatch cannot starve a later one.
      for (const fn of [...(handlers.get(name)?.values() ?? [])]) fn(payload);
    },
  };

  const previousHooks = globalThis.Hooks;
  globalThis.Hooks = hooks;

  const reloads = Object.fromEntries(TAXONOMY_STORES.map((store) => [store, 0]));
  const unsubscribes = subscribe
    ? TAXONOMY_STORES.map((store) =>
        subscribeCraftingDataChange(
          () => {
            reloads[store] += 1;
          },
          { domains: STORE_DOMAINS[store] }
        )
      )
    : [];

  resetCraftingDataFallbackCount();

  return {
    hooks,
    /** Per-store delivery counts since the last {@link reset}. */
    reloads,
    /** The stores that were reloaded at least once, in taxonomy order. */
    reloadedStores: () => TAXONOMY_STORES.filter((store) => reloads[store] > 0),
    /** Every scoped-signal payload emitted since the last {@link reset}. */
    scopedEmissions: () =>
      emitted.filter((entry) => entry.name === CRAFTING_DATA_CHANGED_HOOK).map((e) => e.payload),
    /** Every payload emitted on one named hook since the last {@link reset}. */
    emissionsOf: (name) =>
      emitted.filter((entry) => entry.name === name).map((entry) => entry.payload),
    /** How many deliveries have routed broadly because the payload named no domain. */
    fallbackCount: () => readCraftingDataFallbackCount(),
    /** Clear every counter and log, so a case can WARM first and then assert from a baseline. */
    reset() {
      for (const store of TAXONOMY_STORES) reloads[store] = 0;
      emitted.length = 0;
      resetCraftingDataFallbackCount();
    },
    restore() {
      for (const unsubscribe of unsubscribes) unsubscribe();
      if (previousHooks === undefined) delete globalThis.Hooks;
      else globalThis.Hooks = previousHooks;
    },
  };
}
