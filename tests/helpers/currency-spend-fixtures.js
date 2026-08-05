/**
 * Shared currency spend/refund fixtures (issue 902).
 *
 * The defect these fixtures exist for is currency CREATION: a timed craft whose currency
 * spend never settled recorded the intended plan on its run, and cancelling refunded it.
 * Reproducing that needs two things no shipped preset or existing fixture supplies:
 *
 *   1. **A failure injected at the `spender.spend` seam, not by underfunding.**
 *      `checkCurrencySpends` runs over every aggregated group and aborts BEFORE any
 *      mutation, so an underfunded actor never reaches `markStepPrepared` and a test
 *      built that way reads identically before and after the fix.
 *      {@link makeDelegatingCoinSpender} passes every `check` and fails a nominated
 *      `spend` (or `refund`) instead.
 *   2. **A currency profile with TWO distinct terminal base units.**
 *      `aggregateCurrencySpends` groups by terminal base unit (`meta.baseUnitId`), and
 *      both shipped presets (`DND5E_CURRENCY_PRESETS`, `PF2E_CURRENCY_PRESETS`) build one
 *      connected `coins` DAG whose only terminal is `cp` — so they can only ever produce
 *      ONE group. {@link TWO_TERMINAL_CURRENCY_UNITS} authors two disconnected branches.
 *      Assert `aggregateCurrencySpends(spends, profile).length === 2` before asserting
 *      money: a typo'd unit id or two branches sharing a terminal collapse to one group
 *      SILENTLY (`aggregateCurrencySpends` just `continue`s).
 *
 * These live in `tests/helpers/` deliberately: that directory is outside the `npm test`
 * glob, so it may hold a fixture module but never a `.test.js`.
 */

/**
 * A dnd5e-shaped single-branch profile: `gp` contains 10 `sp`, and `sp` is the ONLY
 * terminal base unit. Any set of spends over these units aggregates to exactly ONE group,
 * which is what makes this the shape reachable in a default-configured world.
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
 * Two DISCONNECTED denomination branches, so the profile has two distinct terminal base
 * units (`sp` and `shard`) and a spend naming one unit from each aggregates to two groups:
 *
 *   gp -> 10 sp        (terminal base unit: sp)
 *   gem -> 5 shard     (terminal base unit: shard)
 *
 * Disconnection is the point. Two branches that shared a terminal (the `gp -> sp` /
 * `ep -> sp` shape) would collapse back to one group and the two-group precondition would
 * fail — which is exactly why every test asserts that precondition mechanically.
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

/**
 * Build a crafting-system stub whose `requirements.currency` drives the actorProperty
 * spend strategy over the supplied units.
 *
 * @param {{ id?: string, units?: object[], features?: object, components?: object[] }} [options]
 */
export function makeCurrencyCraftingSystem({
  id = 'sys-currency',
  units = SINGLE_TERMINAL_CURRENCY_UNITS,
  features = {},
  components = [],
} = {}) {
  return {
    id,
    resolutionMode: 'simple',
    features: { craftingChecks: false, essences: false, refundOnPlayerCancel: true, ...features },
    craftingCheck: { enabled: false, consumption: {} },
    components,
    requirements: {
      currency: { enabled: true, spendStrategy: 'actorProperty', units, macros: {} },
    },
  };
}

/**
 * A delegating coin-spender spy over a real spender.
 *
 * Every method is recorded and then delegated, so the underlying actor I/O is genuine and
 * a balance assertion means something. `failSpendFor` / `failRefundFor` nominate group
 * REPRESENTATIVE unit ids whose call returns `{ valid: false }` WITHOUT delegating — the
 * seam-level failure injection that `checkCurrencySpends` cannot reach.
 *
 * `refund` is implemented deliberately. `refundCurrencySpends` returns
 * `'Currency refund is not available on this actor.'` for EVERY group when the spender has
 * no `refund`, so a spy copied from the spend-only precedent in
 * `tests/crafting-currency-spend.test.js` makes the whole refund dead and "cancel mints
 * nothing" then passes for the wrong reason.
 *
 * @param {object} base - a real spender (e.g. `new ActorPropertyCoinSpender()`).
 * @param {{ failSpendFor?: string[], failRefundFor?: string[] }} [options]
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
 * A crafting actor that holds currency at `system.currency.*` and records every
 * `actor.update(...)` payload, so a test can assert "no currency write in either
 * direction" as well as a balance.
 *
 * Use a DISTINCTIVE non-zero starting balance: a zero baseline makes "unchanged",
 * "never written" and "path not modelled" indistinguishable.
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
    return value;
  }

  async update(payload) {
    this.updates.push({ ...payload });
    for (const [path, value] of Object.entries(payload)) {
      const key = String(path).split('.').pop();
      this.system.currency[key] = value;
    }
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
