/**
 * Foundry-touching coin adapter for spending pf2e currency through the inventory API.
 *
 * This is the pf2e entry behind the generic {@link ActorInventoryCoinSpender}: the
 * spender resolves a per-system adapter by `game.system.id` and delegates `readCoins`
 * and `spend` to it. The adapter isolates the unavoidable system-specific bit (pf2e's
 * inventory API) so the spender, the engine, and the pure currency-profile helpers stay
 * Foundry-free and unit-testable.
 *
 * Modern Pathfinder 2e does NOT store coins at a flat `system.currency.*` data path;
 * coins are inventory treasure Items aggregated on `actor.inventory.coins` (a
 * `CoinsPF2e`) and mutated through `actor.inventory.removeCoins(...)`. The flat
 * `actorPath` + `actor.update()` model used by the `actorProperty` strategy therefore
 * cannot spend pf2e coins.
 *
 * `actor.inventory.removeCoins(coins, { byValue = true })` makes its own change (it
 * breaks higher denominations), validates sufficiency, never lets a balance go negative,
 * and resolves to `false` when funds are insufficient. So Fabricate must NOT run its own
 * change-making on this path: pass a single denomination count and let `removeCoins`
 * handle the breakdown. The `false` return is the authoritative insufficient-funds signal.
 */
export class Pf2eInventoryCoinAdapter {
  /**
   * Read the actor's coin aggregate.
   *
   * Fails loudly (returns `null`) when the actor has no pf2e inventory — a non-pf2e
   * actor on the actorInventory spend strategy is a misconfiguration, not a silent no-op.
   *
   * @param {object} actor
   * @returns {{ copperValue: number, pp: number, gp: number, sp: number, cp: number } | null}
   */
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

  /**
   * Spend a single denomination's worth of coins through the pf2e inventory API,
   * letting `removeCoins` make its own change across denominations.
   *
   * @param {object} actor
   * @param {{ unit: object, amount: number }} requirement - `unit` carries the resolved
   *   currency-profile unit (with `denomination`); `amount` is the count of that unit.
   * @returns {Promise<{ valid: boolean, message?: string }>}
   */
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
}
