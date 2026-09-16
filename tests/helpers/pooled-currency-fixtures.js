/**
 * Shared fixtures for the POOLED currency balance and debit (issue 1342).
 *
 * They live here rather than inside one suite because two suites need them — the pooled pair's own
 * behaviour, and the `balance` macro key that lets a `macro` world answer the same question — and
 * because a second copy of a three-rung ladder plus an actor fake is exactly the near-identical
 * block the new-code duplication gate fails.
 *
 * `tests/helpers/` is outside the `npm test` glob, so it may hold a fixture module but never a
 * `.test.js`.
 */

/**
 * A three-rung ladder: `gp` -> 10 `sp` -> 10 `cp`, so `gp` prices at 100 copper and the TERMINAL
 * BASE UNIT is `cp`.
 *
 * The three rungs are what make the pooled debit's denomination rule testable at all. On a
 * two-rung ladder the over-charge the base-unit rule prevents is small enough to be mistaken for
 * rounding; at `baseValue = 100` a per-payer ceiling is worth up to 99 copper per actor and shows
 * up as a plainly wrong number.
 */
export const POOLED_LADDER = [
  {
    id: 'gp',
    label: 'Gold',
    abbreviation: 'gp',
    actorPath: 'system.currency.gp',
    contains: [{ unitId: 'sp', amount: 10 }],
  },
  {
    id: 'sp',
    label: 'Silver',
    abbreviation: 'sp',
    actorPath: 'system.currency.sp',
    contains: [{ unitId: 'cp', amount: 10 }],
  },
  { id: 'cp', label: 'Copper', abbreviation: 'cp', actorPath: 'system.currency.cp', contains: [] },
];

/** The full macro set, so a `macro`-strategy fixture is valid unless a test removes a key. */
export const POOLED_MACROS = Object.freeze({
  canAfford: 'Macro.afford',
  decrement: 'Macro.dec',
  increment: 'Macro.inc',
  balance: 'Macro.bal',
});

/**
 * An actor holding coins at `system.currency.*` that records every `actor.update(...)` payload.
 *
 * Separate from `CurrencyCraftingActorFake` because the pooled assertions are about a SET: every
 * fixture actor needs a distinct name and id so a ledger row can be attributed, and the suites
 * assert on `totalCopper()` — the whole ladder branch in one denomination — rather than on a
 * single rung, since the point of a base-unit debit is that it makes change across rungs.
 */
export class PooledActorFake {
  /**
   * @param {string} name
   * @param {{ gp?: number, sp?: number, cp?: number }} [currency]
   */
  constructor(name, currency = {}) {
    this.id = `actor-${name}`;
    this.uuid = `Actor.${name}`;
    this.name = name;
    this.isOwner = true;
    this.items = [];
    this.system = { currency: { gp: 0, sp: 0, cp: 0, ...currency } };
    this.updates = [];
  }

  /** The actor's whole `gp`/`sp`/`cp` branch, priced in copper. */
  totalCopper() {
    const { gp, sp, cp } = this.system.currency;
    return Number(gp) * 100 + Number(sp) * 10 + Number(cp);
  }

  async update(payload) {
    this.updates.push({ ...payload });
    for (const [path, value] of Object.entries(payload)) {
      this.system.currency[String(path).split('.').pop()] = value;
    }
    // Resolves THE DOCUMENT, as a real `Document#update` does when it applied a change:
    // `ActorPropertyCoinSpender.refund` judges its write by this return (issue 1301).
    return this;
  }
}

/** Seams for one pooled call, named only where they differ from the default world. */
export function pooledSeams({
  units = POOLED_LADDER,
  spendStrategy = 'actorProperty',
  macros = {},
  ...rest
} = {}) {
  return {
    getCurrencyConfig: () => ({ spendStrategy, providerId: '', macros, units }),
    ...rest,
  };
}

/**
 * A spender double wrapping a real one, recording every call and failing nominated ones.
 *
 * `failSpendAt` / `failRefundAt` nominate a 1-based CALL INDEX rather than an actor or a unit,
 * because every pooled payment names the same unit — the terminal base one — so a unit-keyed
 * injection (the shape `makeDelegatingCoinSpender` uses for aggregated groups) could not select
 * the second payer's leg from the first's.
 */
export function makePooledSpenderSpy(base, { failSpendAt = [], failRefundAt = [] } = {}) {
  const spendCalls = [];
  const refundCalls = [];
  const readCalls = [];
  return {
    spendCalls,
    refundCalls,
    readCalls,
    readCoins(actor, ctx) {
      readCalls.push({ actor: actor?.name ?? null, caller: ctx?.caller ?? null });
      return base.readCoins(actor, ctx);
    },
    async spend(actor, requirement, ctx) {
      spendCalls.push({
        actor: actor?.name ?? null,
        unit: requirement?.unit?.id ?? null,
        amount: requirement?.amount ?? null,
        caller: ctx?.caller ?? null,
      });
      if (failSpendAt.includes(spendCalls.length)) {
        return { valid: false, message: `Spend refused for ${actor?.name}.` };
      }
      return base.spend(actor, requirement, ctx);
    },
    async refund(actor, requirement, ctx) {
      refundCalls.push({
        actor: actor?.name ?? null,
        unit: requirement?.unit?.id ?? null,
        amount: requirement?.amount ?? null,
      });
      if (failRefundAt.includes(refundCalls.length)) {
        return { valid: false, message: `Refund refused for ${actor?.name}.` };
      }
      return base.refund(actor, requirement, ctx);
    },
  };
}
