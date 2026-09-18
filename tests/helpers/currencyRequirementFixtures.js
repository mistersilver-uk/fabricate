/** Shared currency-REQUIREMENT fixtures (issue 1493). */

/** The default `actorProperty` spend strategy every fixture manager is built with. */
export const ACTOR_PROPERTY_STRATEGY = 'actorProperty';

/**
 * A one-unit gold ladder that RESOLVES: the unit names an actor data path, so the
 * affordance layer can read a balance off an actor and a cost has a real verdict.
 */
export const SPENDABLE_GOLD_UNITS = Object.freeze([
  Object.freeze({ id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp' }),
]);

/** The same ladder with the actor path CLEARED: present but unusable. */
export const UNSPENDABLE_GOLD_UNITS = Object.freeze([
  Object.freeze({ id: 'gp', label: 'Gold', abbreviation: 'gp' }),
]);

/** A minimal crafting system with currency requirements ENABLED and every other feature off. */
export function makeCurrencySystem(systemId) {
  return {
    id: systemId,
    features: { itemTags: false, essences: false },
    components: [],
    managedItems: [],
    tools: [],
    essenceDefinitions: [],
    requirements: { currency: { enabled: true } },
  };
}

/**
 * A `RecipeManager` over a currency-enabled system and an injected world ladder.
 *
 * @param {Function} RecipeManager The class, imported by the caller after its Foundry globals are
 * installed.
 * @param {object[]} [options.units] The world's currency ladder.
 * @returns {object} the manager
 */
export function makeCurrencyRecipeManager(
  RecipeManager,
  {
    systemId = 'sys-currency',
    units = SPENDABLE_GOLD_UNITS,
    spendStrategy = ACTOR_PROPERTY_STRATEGY,
  } = {}
) {
  const system = makeCurrencySystem(systemId);
  const manager = new RecipeManager({
    getCraftingSystemManager: () => ({ getSystem: (id) => (id === systemId ? system : null) }),
    currencyConfigStore: { get: () => ({ spendStrategy, units: [...units] }) },
  });
  // Deliberately NOT stamped onto the manager.
  return manager;
}

/**
 * A purse-carrying actor. The pack is empty by default, so only the coin can settle a group
 * offering "these items OR this cost".
 */
export function makePurseActor({ id = 'purse', gp = 0, items = [] } = {}) {
  return { id, items, system: { currency: { gp } } };
}

/** A currency ingredient OPTION for an authored group. */
export function currencyOption(amount, unit = 'gp') {
  return { match: { type: 'currency', unit, amount }, quantity: 1 };
}
