/**
 * Shared currency-REQUIREMENT fixtures (issue 1493).
 *
 * Distinct from `currency-spend-fixtures.js`, which is about the spend/refund ledger. What
 * these build is the evaluation side: a `RecipeManager` whose crafting system has currency
 * enabled, over an injected world ladder, plus the purse-carrying actor a currency
 * requirement is evaluated against.
 *
 * The block below was copied into four suites — `craftability-evaluation`,
 * `shopping-list-aggregator`, `requirement-rail-mounted` and `consumption-plan-panel-mounted`
 * — which is the shape SonarCloud's duplication gate measures. It normalizes literals, so
 * differing system ids and gold amounts do not make two copies distinct, and it scores
 * density PER DIFF, so a small hotfix fails a density a large feature branch passes.
 * `tests/**` counts exactly like `src/**`.
 *
 * `RecipeManager` is taken as an explicit PARAMETER rather than imported here. Every suite
 * that uses these fixtures installs the Foundry globals `RecipeManager` loads against and
 * then imports it dynamically; a static import in this module would be hoisted above that
 * setup and load it too early.
 *
 * These live in `tests/helpers/`, which is outside the `npm test` glob — it may hold a
 * fixture module but never a `.test.js`.
 */

/** The default `actorProperty` spend strategy every fixture manager is built with. */
export const ACTOR_PROPERTY_STRATEGY = 'actorProperty';

/**
 * A one-unit gold ladder that RESOLVES: the unit names an actor data path, so the
 * affordance layer can read a balance off an actor and a cost has a real verdict.
 */
export const SPENDABLE_GOLD_UNITS = Object.freeze([
  Object.freeze({ id: 'gp', label: 'Gold', abbreviation: 'gp', actorPath: 'system.currency.gp' }),
]);

/**
 * The same ladder with the actor path CLEARED: present but unusable. This is what
 * `validateCurrencyProfile` rejects, and the state a currency requirement must report as a
 * configuration REASON rather than as an affordability shortfall — telling a player
 * carrying a thousand gold that they cannot pay is the defect, not the fix.
 */
export const UNSPENDABLE_GOLD_UNITS = Object.freeze([
  Object.freeze({ id: 'gp', label: 'Gold', abbreviation: 'gp' }),
]);

/**
 * A minimal crafting system with currency requirements ENABLED and every other feature off.
 *
 * @param {string} systemId
 * @returns {object}
 */
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
 * Both scopes go through the CONSTRUCTOR seams rather than the `game.fabricate` global,
 * because these fixtures vary the world half per test while a suite normally shares one
 * global.
 *
 * @param {Function} RecipeManager The class, imported by the caller after its Foundry
 *   globals are installed.
 * @param {object} [options]
 * @param {string} [options.systemId]
 * @param {object[]} [options.units] The world's currency ladder.
 * @param {string} [options.spendStrategy]
 * @returns {object} the manager, with `system` attached for a caller that needs to mutate it
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
  manager.system = system;
  return manager;
}

/**
 * A purse-carrying actor. The pack is empty by default, so only the coin can settle a
 * group offering "these items OR this cost".
 *
 * @param {object} [options]
 * @param {string} [options.id]
 * @param {number} [options.gp]
 * @param {object[]} [options.items]
 * @returns {object}
 */
export function makePurseActor({ id = 'purse', gp = 0, items = [] } = {}) {
  return { id, items, system: { currency: { gp } } };
}

/**
 * A currency ingredient OPTION for an authored group.
 *
 * @param {number} amount
 * @param {string} [unit]
 * @returns {object}
 */
export function currencyOption(amount, unit = 'gp') {
  return { match: { type: 'currency', unit, amount }, quantity: 1 };
}
