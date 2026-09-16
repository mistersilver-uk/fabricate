/**
 * Wraps the Item Piles public API (`game.itempiles.API`) for currency, merchant and container
 * reads. Enabled only when the module is active at `MINIMUM_VERSION` or above AND the crafting
 * system sets `features.itemPiles` (`integrations/spec.md` § Integration Principles).
 */

const MINIMUM_VERSION = '3.1.0';

/** `actual >= required` over numeric `major.minor.patch` segments only. */
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
 * One singleton, exposed as `game.fabricate.getItemPilesIntegration()` after `fabricate.ready`.
 * Every method other than `detect` and `isEnabled` requires `available === true` and throws otherwise.
 */
export class ItemPilesIntegration {
  /**
   * Set `available` and `detectedVersion`. Called at startup before `fabricate.ready`; an absent
   * module is silent, a below-minimum one warns.
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

  /** Item Piles is available AND this crafting system opted in. */
  isEnabled(system) {
    return this.available && system?.features?.itemPiles === true;
  }

  /** False when any denomination falls short, and false rather than throwing when the API call fails. */
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

  /** Remove currency; only a non-empty abbreviation with a positive amount is sent. */
  async deductCurrency(actor, currencies) {
    this._assertAvailable();
    // `removeCurrencies` takes an object keyed by abbreviation.
    const currencyMap = {};
    for (const { abbreviation, amount } of currencies) {
      const abbr = String(abbreviation || '').trim();
      if (abbr && Number(amount) > 0) {
        currencyMap[abbr] = Number(amount);
      }
    }
    await game.itempiles.API.removeCurrencies(actor, currencyMap);
  }

  /** Merchant stock, or `[]` when the API call fails. */
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

  /** Container contents, or `[]` when the API call fails. */
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

  _assertAvailable() {
    if (!this.available) {
      throw new Error('Fabricate | ItemPilesIntegration: Item Piles is not available');
    }
  }
  available = false;
  detectedVersion = null;
}

export { MINIMUM_VERSION as ITEM_PILES_MINIMUM_VERSION };
