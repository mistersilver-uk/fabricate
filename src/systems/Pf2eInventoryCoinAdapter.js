/**
 * The pf2e coin adapter behind `ActorInventoryCoinSpender`, which resolves it by `game.system.id`.
 * pf2e keeps coins as treasure Items aggregated on `actor.inventory.coins`, not at a flat
 * `system.currency.*` path, so `actorProperty` cannot spend them. `removeCoins(coins,
 * { byValue = true })` makes its own change, never goes negative and resolves `false` when funds
 * are short: pass one denomination count, run no change-making, and treat `false` as authoritative.
 */
export class Pf2eInventoryCoinAdapter {
  /** The coin aggregate, or `null` for an actor with no pf2e inventory (a misconfiguration). */
  readCoins(actor) {
    const coins = actor?.inventory?.coins;
    if (!coins) return null;
    return {
      copperValue: Number(coins.copperValue) || 0,
      pp: Number(coins.pp) || 0,
      gp: Number(coins.gp) || 0,
      sp: Number(coins.sp) || 0,
      cp: Number(coins.cp) || 0,
    };
  }

  /** Spend one denomination's count; `removeCoins` makes its own change. */
  async spend(actor, { unit, amount } = {}) {
    const denomination = String(unit?.denomination || unit?.id || '').trim();
    if (!denomination) {
      return { valid: false, message: 'Currency unit has no pf2e denomination.' };
    }
    const count = Math.trunc(Number(amount) || 0);
    if (count <= 0) return { valid: true };
    if (typeof actor?.inventory?.removeCoins !== 'function') {
      return { valid: false, message: 'Currency is not available on this actor.' };
    }
    const removed = await actor.inventory.removeCoins({ [denomination]: count });
    if (removed === false) {
      return { valid: false, message: 'Insufficient currency.' };
    }
    return { valid: true };
  }

  /**
   * Refund one denomination's count, the inverse of `spend` (issue 848); pf2e's `addCoins` returns
   * void, makes no change and never fails on sufficiency.
   */
  async addCoins(actor, { unit, amount } = {}) {
    const denomination = String(unit?.denomination || unit?.id || '').trim();
    if (!denomination) {
      return { valid: false, message: 'Currency unit has no pf2e denomination.' };
    }
    const count = Math.trunc(Number(amount) || 0);
    if (count <= 0) return { valid: true };
    if (typeof actor?.inventory?.addCoins !== 'function') {
      return { valid: false, message: 'Currency is not available on this actor.' };
    }
    await actor.inventory.addCoins({ [denomination]: count });
    return { valid: true };
  }
}
