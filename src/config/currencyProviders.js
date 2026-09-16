/**
 * Preconfigured actor-inventory currency providers.
 *
 * A provider is a named, system-scoped bundle that knows how to read and spend coins from a
 * Foundry actor's inventory. The GM picks a provider (filtered by `game.system.id`) under the
 * `actorInventory` spend strategy's `provider` inventory mode; the alternative `macro` mode lets
 * the GM supply custom macros instead. This mirrors the pure, Foundry-free helper naming in
 * `currencyPresets.js`.
 *
 * `providerId` is stored and selectable, but the runtime still resolves the actual adapter by
 * `game.system.id` (one provider per system today). `providerId` becomes load-bearing only when a
 * system gains a second provider — no over-engineering now.
 *
 * @typedef {object} CurrencyProvider
 * @property {string[]} systems - Foundry system ids this provider applies to.
 * @property {() => object} buildAdapter - factory for the coin adapter (readCoins/spend).
 * @property {object[]} canonicalUnits - the provider-owned, frozen denomination ladder.
 */

import { Pf2eInventoryCoinAdapter } from '../systems/Pf2eInventoryCoinAdapter.js';

import { getCurrencyPresetsForFoundrySystem } from './currencyPresets.js';

const CURRENCY_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'pf2e-inventory',
    label: 'Pathfinder 2e inventory',
    systems: Object.freeze(['pf2e']),
    buildAdapter: () => new Pf2eInventoryCoinAdapter(),
    // A provider owns its denomination ladder, so the engine's affordability/baseValue math always
    // tracks the system's real coin values. pf2e reuses the existing pf2e preset ladder (the
    // canonical pp/gp/sp/cp tree).
    canonicalUnits: getCurrencyPresetsForFoundrySystem('pf2e'),
  }),
]);

/** Providers registered for a Foundry system, in registration order. */
export function getCurrencyProvidersForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (!id) return [];
  return CURRENCY_PROVIDERS.filter((provider) => provider.systems.includes(id));
}

/**
 * The default provider id for a system: the first registered provider, or `''` when the system has
 * none.
 */
export function getDefaultProviderId(foundrySystemId) {
  return getCurrencyProvidersForFoundrySystem(foundrySystemId)[0]?.id || '';
}

/** Resolve a provider by id within a system. */
export function resolveProvider(providerId, foundrySystemId) {
  const providers = getCurrencyProvidersForFoundrySystem(foundrySystemId);
  if (providers.length === 0) return null;
  const id = String(providerId || '').trim();
  return providers.find((provider) => provider.id === id) || providers[0];
}

/** The canonical, frozen currency unit ladder a provider owns by id. */
export function getProviderCanonicalUnits(providerId) {
  const id = String(providerId || '').trim();
  if (!id) return EMPTY_CANONICAL_UNITS;
  const provider = CURRENCY_PROVIDERS.find((entry) => entry.id === id);
  return provider?.canonicalUnits || EMPTY_CANONICAL_UNITS;
}

const EMPTY_CANONICAL_UNITS = Object.freeze([]);
