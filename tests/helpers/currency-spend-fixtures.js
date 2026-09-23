/**
 * Shared currency spend/refund fixtures (issue 902). The defect these fixtures exist for is
 * currency CREATION: a timed craft whose currency spend never settled recorded the intended plan on
 * its run, and cancelling refunded it.
 */

/**
 * A dnd5e-shaped single-branch profile: `gp` contains 10 `sp`, and `sp` is the ONLY terminal base
 * unit.
 */
export const SINGLE_TERMINAL_CURRENCY_UNITS = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  },
  { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp', contains: [] },
];

/**
 * Two DISCONNECTED denomination branches, so the profile has two distinct terminal base units (`sp`
 * and `shard`) and a spend naming one unit from each aggregates to two groups:. gp -> 10 sp
 * (terminal base unit: sp) gem -> 5 shard (terminal base unit: shard)
 */
export const TWO_TERMINAL_CURRENCY_UNITS = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  },
  { id: 'sp', label: 'Silver', abbreviation: 'sp', actorPath: 'system.currency.sp', contains: [] },
  {
    id: 'gem',
    label: 'Gem',
    abbreviation: 'gem',
    actorPath: 'system.currency.gem',
    contains: [{ unitId: 'shard', amount: 5 }],
  },
  {
    id: 'shard',
    label: 'Shard',
    abbreviation: 'shard',
    actorPath: 'system.currency.shard',
    contains: [],
  },
];

/** Build a crafting-system stub that PARTICIPATES in currency (issue 1278). */
export function makeCurrencyCraftingSystem({
  id = 'sys-currency',
  features = {},
  components = [],
  enabled = true,
} = {}) {
  return {
    id,
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false, refundOnPlayerCancel: true, ...features },
    craftingCheck: { enabled: false, consumption: {} },
    components,
    requirements: {
      currency: { enabled },
    },
  };
}

/** Build the WORLD currency configuration (issue 1278) that the runtime reads the ladder from. */
export function makeWorldCurrencyConfig({
  units = SINGLE_TERMINAL_CURRENCY_UNITS,
  spendStrategy = 'actorProperty',
  providerId = '',
  macros = { canAfford: '', increment: '', decrement: '' },
} = {}) {
  return { spendStrategy, providerId, macros, units };
}

/**
 * A `getCurrencyConfigStore`-shaped stub for the `game.fabricate` global, so a fixture that drives
 * the runtime through the global (rather than an injected seam) still resolves a ladder.
 *
 * @param {object} [config] - a {@link makeWorldCurrencyConfig} result
 */
export function makeCurrencyConfigStoreStub(config = makeWorldCurrencyConfig()) {
  return { get: () => config };
}

/**
 * A delegating coin-spender spy over a real spender.
 *
 * @param {object} base - a real spender (e.g. `new ActorPropertyCoinSpender()`).
 */
export function makeDelegatingCoinSpender(base, { failSpendFor = [], failRefundFor = [] } = {}) {
  const checkCalls = [];
  const spendCalls = [];
  const refundCalls = [];
  return {
    checkCalls,
    spendCalls,
    refundCalls,
    readCoins(actor, ctx) {
      return base.readCoins(actor, ctx);
    },
    check(actor, requirement, ctx) {
      checkCalls.push({ unit: requirement?.unit?.id ?? null, amount: requirement?.amount ?? null });
      return base.check(actor, requirement, ctx);
    },
    async spend(actor, requirement, ctx) {
      const unitId = requirement?.unit?.id ?? null;
      spendCalls.push({ unit: unitId, amount: requirement?.amount ?? null });
      if (failSpendFor.includes(unitId)) {
        return { valid: false, message: `Spend refused for ${unitId}.` };
      }
      return base.spend(actor, requirement, ctx);
    },
    async refund(actor, requirement, ctx) {
      const unitId = requirement?.unit?.id ?? null;
      refundCalls.push({ unit: unitId, amount: requirement?.amount ?? null });
      if (failRefundFor.includes(unitId)) {
        return { valid: false, message: `Refund refused for ${unitId}.` };
      }
      return base.refund(actor, requirement, ctx);
    },
  };
}

/**
 * A crafting actor that holds currency at `system.currency.*` and records every `actor.update(...)`
 * payload, so a test can assert "no currency write in either direction" as well as a balance.
 */
export class CurrencyCraftingActorFake {
  /**
   * @param {string} name
   * @param {{ currency?: Record<string, number>, isOwner?: boolean }} [options]
   */
  constructor(name, { currency = {}, isOwner = true } = {}) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.isOwner = isOwner;
    this.items = [];
    this.system = { currency: { gp: 0, sp: 0, gem: 0, shard: 0, ...currency } };
    this.updates = [];
    this.created = [];
    this._flags = {};
  }

  getFlag(namespace, key) {
    return this._flags?.[namespace]?.[key];
  }

  async setFlag(namespace, key, value) {
    this._flags[namespace] = this._flags[namespace] || {};
    this._flags[namespace][key] = value;
    return this;
  }

  async update(payload) {
    this.updates.push({ ...payload });
    for (const [path, value] of Object.entries(payload)) {
      const key = String(path).split('.').pop();
      this.system.currency[key] = value;
    }
    // Resolves THE DOCUMENT, as a real `Document#update` does when it applied a change (issue
    // 1301).
    return this;
  }

  async createEmbeddedDocuments(_type, data) {
    const created = (data || []).map((entry, index) => ({
      id: `created-${this.created.length + index}`,
      uuid: `Item.created-${this.created.length + index}`,
      name: entry?.name ?? 'Created',
      img: entry?.img ?? null,
      system: { quantity: entry?.system?.quantity ?? 1 },
      effects: [],
    }));
    this.created.push(...created);
    return created;
  }
}
