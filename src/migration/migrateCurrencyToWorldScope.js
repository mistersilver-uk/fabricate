/**
 * 1.26.0 — Lift the currency configuration from every crafting system to world scope
 * (issue 1278; pure, idempotent, version-gated).
 *
 * WHY THIS EXISTS. Before 1278 the whole currency configuration — the coin ladder, the spend
 * strategy, the selected provider and the GM macro set — lived on each crafting system at
 * `requirements.currency`. That was the wrong scope: a world runs exactly ONE Foundry game
 * system, so there is exactly one way actors store coins, and two crafting systems cannot
 * meaningfully disagree about how to read the same actor's purse. The configuration now lives
 * in the `currencyConfig` world setting, and a crafting system keeps only
 * `requirements.currency.enabled` — whether it PARTICIPATES.
 *
 * Without this migration the reader would find an empty world config in every upgraded world
 * and every authored currency cost would silently stop resolving, because the reader no longer
 * looks at the system block at all.
 *
 * HOW UNITS ARE RECONCILED — union-merge, keyed by unit `id`, first system wins.
 * The union is not arbitrary: recipe currency options (`match.unit`) and salvage currency
 * requirements store unit **ids**, so a unit that is dropped orphans every reference to it.
 * Taking the union preserves the most references; keying by id (rather than by label) is what
 * makes the merge reference-preserving at all. On an id collision the earlier system's
 * definition wins, because picking either is arbitrary and "first" is at least deterministic
 * and order-stable across re-runs.
 *
 * The scalar settings — `spendStrategy`, `providerId`, `macros` — cannot be unioned, so they are
 * adopted from the first system that had currency ENABLED. A system with currency switched off
 * never configured those fields deliberately, so preferring an enabled system's choice is the
 * one signal available. If no system has currency enabled, the first system carrying any
 * currency block supplies them, and failing that the normalizer's defaults apply.
 *
 * Mutated setting keys: `currencyConfig` (created) and `craftingSystems` (shrunk).
 *
 * IDEMPOTENT, and the guard is load-bearing. Once the world config carries units, this is a
 * no-op for the config: a second run must never re-merge stale system blocks over a ladder the
 * GM has since edited (they may have deliberately deleted a unit). The per-system shrink stays
 * unconditional, because it is already idempotent — a system reduced to `{ enabled }` has
 * nothing left to strip.
 *
 * Never throws: every level is guarded, and a malformed system, requirements block or unit is
 * skipped rather than repaired. Repair is the normalizer's job, not this migration's.
 */

import { isPlainObject, clone } from './migrationHelpers.js';

const SCALAR_KEYS = ['spendStrategy', 'providerId', 'macros'];

/**
 * Read one system's legacy currency block, if it has one.
 * @param {object} system
 * @returns {object|null}
 */
function legacyCurrencyBlock(system) {
  if (!isPlainObject(system)) return null;
  const requirements = system.requirements;
  if (!isPlainObject(requirements)) return null;
  const currency = requirements.currency;
  return isPlainObject(currency) ? currency : null;
}

/**
 * Build the world currency config by unioning every system's units by id.
 *
 * @param {Array<object>} systems
 * @returns {{ spendStrategy?: string, providerId?: string, macros?: object, units: object[] }}
 */
export function buildWorldCurrencyConfig(systems) {
  const list = Array.isArray(systems) ? systems : [];
  const units = [];
  const seen = new Set();
  let scalars = null;
  let scalarsFromEnabled = false;

  for (const system of list) {
    const currency = legacyCurrencyBlock(system);
    if (!currency) continue;

    const enabled = currency.enabled === true;
    // Scalars: prefer the first ENABLED system, but fall back to the first system carrying a
    // currency block at all, so a world where every system is switched off still keeps the
    // strategy its GM configured rather than silently reverting to `actorProperty`.
    if (!scalarsFromEnabled && (enabled || scalars === null)) {
      const picked = {};
      for (const key of SCALAR_KEYS) {
        if (currency[key] !== undefined) picked[key] = clone(currency[key]);
      }
      // Legacy provider/adapter fields are read-compatible inputs the shared normalizer knows
      // how to map forward, so carry them across rather than resolving them here.
      if (currency.provider !== undefined) picked.provider = currency.provider;
      if (currency.systemAdapter !== undefined) picked.systemAdapter = currency.systemAdapter;
      if (currency.inventoryMode !== undefined) picked.inventoryMode = currency.inventoryMode;
      scalars = picked;
      scalarsFromEnabled = enabled;
    }

    const systemUnits = Array.isArray(currency.units) ? currency.units : [];
    for (const unit of systemUnits) {
      if (!isPlainObject(unit)) continue;
      const id = String(unit.id || '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      units.push(clone(unit));
    }
  }

  return { ...(scalars || {}), units };
}

/**
 * Reduce every system's `requirements.currency` to the participation flag alone.
 *
 * @param {Array<object>} systems
 * @returns {Array<object>} a new array; unchanged systems are returned by reference
 */
export function stripSystemCurrencyConfig(systems) {
  const list = Array.isArray(systems) ? systems : [];
  return list.map((system) => {
    const currency = legacyCurrencyBlock(system);
    if (!currency) return system;
    const keys = Object.keys(currency);
    // Already shrunk — leave the reference alone so the runner's change detection stays honest.
    if (keys.length === 0 || (keys.length === 1 && keys[0] === 'enabled')) return system;
    return {
      ...system,
      requirements: {
        ...system.requirements,
        currency: { enabled: currency.enabled === true },
      },
    };
  });
}

/**
 * @param {{ systems: Array<object>, currencyConfig: object }} data
 * @returns {{ systems: Array<object>, currencyConfig: object }}
 */
export function migrateCurrencyToWorldScope(data = {}) {
  const systems = Array.isArray(data.systems) ? data.systems : [];
  const existing = isPlainObject(data.currencyConfig) ? data.currencyConfig : {};

  // The idempotence guard: a populated world ladder is authoritative and is never re-merged.
  const alreadyMigrated = Array.isArray(existing.units) && existing.units.length > 0;
  let currencyConfig = existing;
  if (!alreadyMigrated) {
    const built = buildWorldCurrencyConfig(systems);
    // Return the ORIGINAL object when there was nothing to lift. The runner detects change by
    // JSON comparison, so emitting a freshly-built `{ units: [] }` over a stored `{}` would
    // register as a change and write the setting in every world that has never used currency —
    // churn that shows up as an unexplained write in an otherwise no-op upgrade.
    const liftedAnything = built.units.length > 0 || Object.keys(built).length > 1;
    currencyConfig = liftedAnything ? built : existing;
  }

  return {
    systems: stripSystemCurrencyConfig(systems),
    currencyConfig,
  };
}
