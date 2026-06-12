/**
 * ItemPilesIntegration
 *
 * Wraps the Item Piles public API (game.itempiles.API) to provide:
 *  - Module detection and version gating (>= 3.1.0)
 *  - Currency affordability checks
 *  - Currency deduction
 *  - Merchant stock reading
 *  - Container contents reading
 *
 * All interactions use game.itempiles.API exclusively.
 * The integration is enabled only when both:
 *   1. Item Piles is installed and active
 *   2. The crafting system has features.itemPiles === true
 */

const MINIMUM_VERSION = '3.1.0';

/**
 * Compare two semver strings. Returns true if actual >= required.
 * Only handles numeric major.minor.patch segments.
 * @param {string} actual
 * @param {string} required
 * @returns {boolean}
 */
function meetsMinimumVersion(actual, required) {
  const parse = (v) =>
    [
      ...String(v || '0')
        .split('.')
        .map((n) => Number.parseInt(n, 10) || 0)
        .slice(0, 3),
      0,
      0,
      0,
    ].slice(0, 3);

  const [aMaj, aMin, aPat] = parse(actual);
  const [rMaj, rMin, rPat] = parse(required);

  if (aMaj !== rMaj) return aMaj > rMaj;
  if (aMin !== rMin) return aMin > rMin;
  return aPat >= rPat;
}

/**
 * Provides first-class integration with the Item Piles module.
 *
 * Fabricate instantiates one singleton of this class and makes it available
 * via `game.fabricate.getItemPilesIntegration()` after the `fabricate.ready`
 * hook fires.
 *
 * Before using any method other than {@link ItemPilesIntegration#detect} or
 * {@link ItemPilesIntegration#isEnabled}, confirm that `available` is `true`.
 * All data-access methods throw if called when Item Piles is not available.
 *
 * @example
 * Hooks.once('fabricate.ready', async () => {
 *   const integration = game.fabricate.getItemPilesIntegration();
 *   if (!integration.available) return;
 *
 *   const actor = game.actors.getName('Seraphine the Herbalist');
 *   const canAfford = await integration.canAfford(actor, [{ abbreviation: 'gp', amount: 50 }]);
 *   console.log('Can afford?', canAfford);
 * });
 */
export class ItemPilesIntegration {
  /**
   * Detect whether Item Piles is installed, active, and meets the minimum version.
   *
   * Sets `available` and `detectedVersion`. Must be called during Fabricate
   * initialisation (after `game` is available). You do not need to call this
   * manually; Fabricate calls it at startup before the `fabricate.ready` hook fires.
   *
   * When the module is absent, `available` is set to `false` silently.
   * When the module is present but below {@link ITEM_PILES_MINIMUM_VERSION},
   * a warning is logged and `available` is set to `false`.
   *
   * @returns {void}
   *
   * @example
   * // Fabricate calls this automatically. You can inspect the result afterwards:
   * Hooks.once('fabricate.ready', () => {
   *   const integration = game.fabricate.getItemPilesIntegration();
   *   console.log(integration.available);        // true or false
   *   console.log(integration.detectedVersion);  // e.g. '3.2.1' or null
   * });
   */
  detect() {
    const module = game.modules?.get('item-piles');
    if (!module?.active) {
      this.available = false;
      this.detectedVersion = null;
      return;
    }

    const version = module.version || module.data?.version || null;
    if (!version || !meetsMinimumVersion(version, MINIMUM_VERSION)) {
      this.available = false;
      this.detectedVersion = version;
      console.warn(
        `Fabricate | Item Piles integration: version ${version} does not meet minimum ${MINIMUM_VERSION}`
      );
      return;
    }

    this.available = true;
    this.detectedVersion = version;
    console.log(`Fabricate | Item Piles integration: detected v${version}`);
  }

  /**
   * Returns `true` when Item Piles is available **and** the crafting system
   * has `features.itemPiles === true`.
   *
   * Use this to guard any custom integration logic before calling
   * {@link ItemPilesIntegration#canAfford},
   * {@link ItemPilesIntegration#getMerchantItems}, or
   * {@link ItemPilesIntegration#getContainerContents}.
   *
   * @param {object} system - A normalised crafting system object, as returned
   *   by `CraftingSystemManager.getSystem()`.
   * @returns {boolean}
   *
   * @example
   * Hooks.once('fabricate.ready', () => {
   *   const integration = game.fabricate.getItemPilesIntegration();
   *   const mgr = game.fabricate.getCraftingSystemManager();
   *   const system = mgr.getSystem('alchemy-system-id');
   *
   *   if (integration.isEnabled(system)) {
   *     console.log('Item Piles is active for this system.');
   *   }
   * });
   */
  isEnabled(system) {
    return this.available && system?.features?.itemPiles === true;
  }

  /**
   * Check whether an actor holds sufficient currency for the requested amounts.
   *
   * Reads the actor's current currency balances via
   * `game.itempiles.API.getActorCurrencies` and compares each required
   * denomination against the held amount. Returns `false` if any denomination
   * falls short, or if the API call throws.
   *
   * @param {Actor} actor - The Foundry actor to check.
   * @param {Array<{abbreviation: string, amount: number}>} currencies - Array
   *   of currency requirements. `abbreviation` must match the Item Piles
   *   denomination key exactly (e.g. `'gp'`, `'sp'`).
   * @returns {Promise<boolean>} `true` if all requirements are met; `false`
   *   otherwise or if the API call fails.
   * @throws {Error} If Item Piles is not available (`available === false`).
   *
   * @example
   * Hooks.once('fabricate.ready', async () => {
   *   const integration = game.fabricate.getItemPilesIntegration();
   *   const actor = game.actors.getName('Seraphine the Herbalist');
   *
   *   const affordable = await integration.canAfford(actor, [
   *     { abbreviation: 'gp', amount: 50 }
   *   ]);
   *   console.log(affordable ? 'Can afford.' : 'Not enough gold.');
   * });
   */
  async canAfford(actor, currencies) {
    this._assertAvailable();
    try {
      const result = await game.itempiles.API.getActorCurrencies(actor);
      if (!Array.isArray(result)) return false;

      for (const requirement of currencies) {
        const abbr = String(requirement.abbreviation || '')
          .trim()
          .toLowerCase();
        const needed = Number(requirement.amount) || 0;
        if (needed <= 0) continue;

        const held = result.find(
          (c) =>
            String(c.abbreviation || '')
              .trim()
              .toLowerCase() === abbr
        );
        const heldAmount = Number(held?.quantity ?? held?.amount ?? 0);
        if (heldAmount < needed) return false;
      }
      return true;
    } catch (error) {
      console.error('Fabricate | ItemPilesIntegration.canAfford failed', error);
      return false;
    }
  }

  /**
   * Deduct currency from an actor via the Item Piles API.
   *
   * Sends a currency map to `game.itempiles.API.removeCurrencies`. Only
   * entries with a non-empty `abbreviation` and a positive `amount` are
   * included. Fabricate calls this automatically after a successful craft when
   * the recipe has a `currencyCost` and the system has `features.itemPiles`
   * enabled.
   *
   * @param {Actor} actor - The Foundry actor to deduct from.
   * @param {Array<{abbreviation: string, amount: number}>} currencies - Array
   *   of currency amounts to remove.
   * @returns {Promise<void>}
   * @throws {Error} If Item Piles is not available (`available === false`).
   *
   * @example
   * Hooks.once('fabricate.ready', async () => {
   *   const integration = game.fabricate.getItemPilesIntegration();
   *   const actor = game.actors.getName('Seraphine the Herbalist');
   *
   *   await integration.deductCurrency(actor, [
   *     { abbreviation: 'gp', amount: 50 }
   *   ]);
   * });
   */
  async deductCurrency(actor, currencies) {
    this._assertAvailable();
    // Build the currency object expected by removeCurrencies.
    // Item Piles removeCurrencies expects an object keyed by abbreviation.
    const currencyMap = {};
    for (const { abbreviation, amount } of currencies) {
      const abbr = String(abbreviation || '').trim();
      if (abbr && Number(amount) > 0) {
        currencyMap[abbr] = Number(amount);
      }
    }
    await game.itempiles.API.removeCurrencies(actor, currencyMap);
  }

  /**
   * Read the current stock of a merchant actor via the Item Piles API.
   *
   * Returns an empty array if the call fails or the merchant has no stock.
   *
   * @param {Actor} merchantActor - A Foundry actor configured as an Item Piles
   *   merchant.
   * @returns {Promise<Item[]>} Array of Foundry `Item` objects from the
   *   merchant's stock.
   * @throws {Error} If Item Piles is not available (`available === false`).
   *
   * @example
   * Hooks.once('fabricate.ready', async () => {
   *   const integration = game.fabricate.getItemPilesIntegration();
   *   const supplier = game.actors.getName('Grimble the Alchemist Supplier');
   *
   *   const stock = await integration.getMerchantItems(supplier);
   *   stock.forEach(item => console.log(item.name));
   * });
   */
  async getMerchantItems(merchantActor) {
    this._assertAvailable();
    try {
      const items = await game.itempiles.API.getMerchantItems(merchantActor);
      return Array.isArray(items) ? items : [];
    } catch (error) {
      console.error('Fabricate | ItemPilesIntegration.getMerchantItems failed', error);
      return [];
    }
  }

  /**
   * Read the contents of a container actor via the Item Piles API.
   *
   * Useful for treating shared storage or crafting-station inventories as
   * ingredient sources in multi-step recipes or custom crafting workflows.
   * Returns an empty array if the call fails or the container is empty.
   *
   * @param {Actor} containerActor - A Foundry actor configured as an Item Piles
   *   container.
   * @returns {Promise<Item[]>} Array of Foundry `Item` objects from the
   *   container.
   * @throws {Error} If Item Piles is not available (`available === false`).
   *
   * @example
   * Hooks.once('fabricate.ready', async () => {
   *   const integration = game.fabricate.getItemPilesIntegration();
   *   const chest = game.actors.getName('Party Chest');
   *
   *   const contents = await integration.getContainerContents(chest);
   *   console.log(`Party chest holds ${contents.length} item type(s).`);
   * });
   */
  async getContainerContents(containerActor) {
    this._assertAvailable();
    try {
      const contents = await game.itempiles.API.getItemPileItems(containerActor);
      return Array.isArray(contents) ? contents : [];
    } catch (error) {
      console.error('Fabricate | ItemPilesIntegration.getContainerContents failed', error);
      return [];
    }
  }

  /** @private */
  _assertAvailable() {
    if (!this.available) {
      throw new Error('Fabricate | ItemPilesIntegration: Item Piles is not available');
    }
  }
  available = false;
  detectedVersion = null;
}

export { MINIMUM_VERSION as ITEM_PILES_MINIMUM_VERSION };
