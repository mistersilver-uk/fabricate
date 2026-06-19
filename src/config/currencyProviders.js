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
 * @property {string} id
 * @property {string} label
 * @property {string[]} systems - Foundry system ids this provider applies to.
 * @property {() => object} buildAdapter - factory for the coin adapter (readCoins/spend).
 */

import { Pf2eInventoryCoinAdapter } from '../systems/Pf2eInventoryCoinAdapter.js';

/** @type {CurrencyProvider[]} */
const CURRENCY_PROVIDERS = Object.freeze([
  Object.freeze({
    id: 'pf2e-inventory',
    label: 'Pathfinder 2e inventory',
    systems: Object.freeze(['pf2e']),
    buildAdapter: () => new Pf2eInventoryCoinAdapter(),
  }),
]);

/**
 * Providers registered for a Foundry system, in registration order. Systems with no provider
 * (e.g. dnd5e) return an empty list — the editor shows an empty-list callout steering the GM to
 * macro mode.
 *
 * @param {string} foundrySystemId
 * @returns {CurrencyProvider[]}
 */
export function getCurrencyProvidersForFoundrySystem(foundrySystemId) {
  const id = String(foundrySystemId || '').trim();
  if (!id) return [];
  return CURRENCY_PROVIDERS.filter((provider) => provider.systems.includes(id));
}

/**
 * The default provider id for a system: the first registered provider, or `''` when the system
 * has none.
 *
 * @param {string} foundrySystemId
 * @returns {string}
 */
export function getDefaultProviderId(foundrySystemId) {
  return getCurrencyProvidersForFoundrySystem(foundrySystemId)[0]?.id || '';
}

/**
 * Resolve a provider by id within a system. Falls back to the system's default provider when the
 * stored id does not match (e.g. a config from a system that since changed providers), and returns
 * `null` when the system has no providers at all.
 *
 * @param {string} providerId
 * @param {string} foundrySystemId
 * @returns {CurrencyProvider|null}
 */
export function resolveProvider(providerId, foundrySystemId) {
  const providers = getCurrencyProvidersForFoundrySystem(foundrySystemId);
  if (providers.length === 0) return null;
  const id = String(providerId || '').trim();
  return providers.find((provider) => provider.id === id) || providers[0];
}
