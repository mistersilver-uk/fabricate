function defaultRandomID() {
  return (
    globalThis.foundry?.utils?.randomID?.() ??
    globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  );
}

/**
 * Normalize one raw currency-unit entry into the canonical
 * `{ id, label, abbreviation, icon, actorPath, denomination?, contains[] }` shape.
 *
 * `actorPath` locates the numeric balance under the `actorProperty` strategy. `denomination` (a
 * real coin key, e.g. pf2e `cp`/`sp`/`gp`/`pp`) locates the coin under the `actorInventory` +
 * `provider` strategy and is only emitted when present. The `contains[]` sub-unit list is
 * deduplicated by child id and drops any entry without a positive integer amount. Returns `null`
 * for a non-object entry or one that resolves to an empty id.
 *
 * @param {object} [entry]
 * @param {() => string} [randomID] - id factory used when the entry has no id.
 * @returns {object|null}
 */
export function normalizeCurrencyUnit(entry = {}, randomID = defaultRandomID) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || randomID()).trim();
  if (!id) return null;
  const label = String(entry.label || entry.name || id).trim() || id;
  const abbreviation = String(entry.abbreviation || entry.abbr || id).trim() || id;
  const actorPath = String(entry.actorPath || entry.path || '').trim();
  const denomination = String(entry.denomination || '').trim();
  const contains = Array.isArray(entry.contains)
    ? entry.contains
        .map((contained) => {
          const unitId = String(contained?.unitId || contained?.id || '').trim();
          const amount = Number(contained?.amount);
          if (!unitId || !Number.isFinite(amount) || amount <= 0) return null;
          return { unitId, amount: Math.trunc(amount) };
        })
        .filter((contained) => contained && contained.amount > 0)
    : [];
  const dedupedContains = [];
  const seenUnitIds = new Set();
  for (const contained of contains) {
    if (seenUnitIds.has(contained.unitId)) continue;
    seenUnitIds.add(contained.unitId);
    dedupedContains.push(contained);
  }
  const unit = {
    id,
    label,
    abbreviation,
    icon: String(entry.icon || '').trim(),
    actorPath,
    contains: dedupedContains,
  };
  if (denomination) unit.denomination = denomination;
  return unit;
}

/**
 * The three peer top-level currency spend strategies (`requirements.currency.spendStrategy`):
 *
 * - `actorProperty` (default) — units located by `actorPath`, spent via `actor.update`.
 * - `actorInventory` — a preconfigured provider (filtered by `game.system.id`) owns the
 *   denomination ladder; units located by `denomination`.
 * - `macro` — the GM supplies custom `canAfford`/`decrement` macros (the macro receives the actor
 *   and does whatever it likes), with units keyed by `abbreviation`.
 *
 * @type {Set<string>}
 */
export const SPEND_STRATEGIES = new Set(['actorProperty', 'actorInventory', 'macro']);
const PF2E_DENOMINATIONS = new Set(['pp', 'gp', 'sp', 'cp']);

/**
 * Ordered keys of the custom currency macro set (`requirements.currency.macros`). `canAfford` gates
 * the craft and `decrement` performs the spend; `increment` is reserved for a future refund flow
 * and is never invoked. Used by the normalizer and the macro spender to iterate the macro slots.
 *
 * @type {string[]}
 */
export const CURRENCY_MACRO_KEYS = ['canAfford', 'increment', 'decrement'];

// The provider/macro settings only carry meaning under their owning strategy (`providerId` for
// `actorInventory`, `macros` for `macro`), but they are always persisted so flipping the strategy
// never loses a previously configured provider or macro set. Kept flat (single object literal) so
// the normalizer's cognitive complexity stays low.
function normalizeInventorySettings(currency = {}) {
  const providerId = String(currency?.providerId || '').trim();
  const rawMacros = currency?.macros && typeof currency.macros === 'object' ? currency.macros : {};
  const macros = {};
  for (const key of CURRENCY_MACRO_KEYS) {
    macros[key] = String(rawMacros[key] || '').trim();
  }
  return { providerId, macros };
}

// The macro spend behaviour used to live under `actorInventory` as `inventoryMode: 'macro'`. Macro
// spending is not inventory-specific (the macro gets the actor and does whatever), so it is now a
// peer top-level strategy. This shim maps the one legacy nesting forward; `inventoryMode` is never
// re-emitted. The PR introducing the nested model was never released, so no broader migration is
// needed.
function resolveSpendStrategy(currency = {}) {
  const raw = currency?.spendStrategy;
  if (raw === 'actorInventory' && currency?.inventoryMode === 'macro') return 'macro';
  return SPEND_STRATEGIES.has(raw) ? raw : 'actorProperty';
}

/**
 * Normalize a crafting system's `requirements.currency` config block.
 *
 * `spendStrategy` is one of `actorProperty` (default), `actorInventory`, or `macro`; any other
 * value falls back to `actorProperty`. A legacy `actorInventory` + `inventoryMode: 'macro'` config
 * is mapped forward to the peer `macro` strategy, and `inventoryMode` is dropped from the output.
 * `providerId` and the `macros` set are always normalized and persisted but only carry meaning under
 * their owning strategy (`actorInventory` and `macro` respectively), so flipping the strategy never
 * loses a previously configured provider or macro set. Legacy `provider`/`systemAdapter`/
 * single-macro-UUID fields are read-compatible elsewhere but are never re-emitted from this shape.
 *
 * @param {object} [currency]
 * @param {{ randomID?: () => string }} [options]
 * @returns {{ enabled: boolean, spendStrategy: string, providerId: string,
 *   macros: { canAfford: string, increment: string, decrement: string }, units: object[] }}
 */
export function normalizeCurrencyConfig(currency = {}, options = {}) {
  const randomID = typeof options.randomID === 'function' ? options.randomID : undefined;
  const units = Array.isArray(currency?.units)
    ? currency.units.map((entry) => normalizeCurrencyUnit(entry, randomID)).filter(Boolean)
    : [];
  const spendStrategy = resolveSpendStrategy(currency);
  const { providerId, macros } = normalizeInventorySettings(currency);
  return {
    enabled: currency?.enabled === true,
    spendStrategy,
    providerId,
    macros,
    units,
  };
}

export function findCurrencyUnit(units = [], unitId = '') {
  const id = String(unitId || '').trim();
  if (!id) return null;
  return (Array.isArray(units) ? units : []).find((unit) => unit?.id === id) || null;
}

function integerGcd(a, b) {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right > 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function integerLcm(a, b) {
  return Math.abs(Math.trunc(a * b)) / integerGcd(a, b);
}

function getByPath(object, path) {
  if (!object || !path) return;
  const foundryGetter = globalThis.foundry?.utils?.getProperty;
  if (typeof foundryGetter === 'function') return foundryGetter(object, path);
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function buildUnitMap(units) {
  return new Map((Array.isArray(units) ? units : []).map((unit) => [unit.id, unit]));
}

// Validate the raw, pre-sanitization sub-unit amounts so non-integer/non-positive
// values surface as configuration errors rather than being silently truncated.
function collectRawSubUnitErrors(rawUnits, errors) {
  for (const rawUnit of rawUnits) {
    if (!rawUnit || typeof rawUnit !== 'object' || !Array.isArray(rawUnit.contains)) continue;
    const label = String(rawUnit.label || rawUnit.name || rawUnit.id || '').trim() || rawUnit.id;
    for (const contained of rawUnit.contains) {
      const rawAmount = Number(contained?.amount);
      if (!Number.isInteger(rawAmount) || rawAmount <= 0) {
        errors.push(`Currency unit "${label}" has an invalid sub-unit amount.`);
      }
    }
  }
}

// Per-unit strategy requirement. Kept to a single shallow if/else-if ladder (one branch per
// spend strategy) so Sonar cognitive complexity stays low: macro spending matches the actor's
// coins by abbreviation, so it only needs a non-empty abbreviation; actorInventory needs a pf2e
// denomination; actorProperty needs an actor data path.
function collectUnitStrategyErrors(unit, { spendStrategy, errors }) {
  if (spendStrategy === 'macro') {
    if (!unit.abbreviation) {
      errors.push(`Currency unit "${unit.label}" is missing an abbreviation.`);
    }
    return;
  }
  if (spendStrategy === 'actorInventory') {
    const denomination = unit.denomination || unit.id;
    if (!PF2E_DENOMINATIONS.has(denomination)) {
      errors.push(
        `Currency unit "${unit.label}" must map to a pf2e denomination (pp, gp, sp, or cp).`
      );
    }
    return;
  }
  if (!unit.actorPath) {
    errors.push(`Currency unit "${unit.label}" is missing an actor data path.`);
  }
}

function collectUnitErrors(unit, { spendStrategy, byId, errors }) {
  collectUnitStrategyErrors(unit, { spendStrategy, errors });
  for (const contained of unit.contains) {
    if (contained.unitId === unit.id) {
      errors.push(`Currency unit "${unit.label}" cannot contain itself.`);
    }
    if (!byId.has(contained.unitId)) {
      errors.push(`Currency unit "${unit.label}" contains unknown unit "${contained.unitId}".`);
    }
  }
}

/**
 * Collect every unit id reachable from `startId` (inclusive) by walking `contains[]`. Cycle-safe via
 * a visited set so a circular graph terminates. The returned set always includes `startId` itself.
 *
 * @param {Map<string, object>} byId
 * @param {string} startId
 * @returns {Set<string>}
 */
function collectReachableUnitIds(byId, startId) {
  const reachable = new Set();
  const stack = [startId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId || reachable.has(currentId)) continue;
    reachable.add(currentId);
    const unit = byId.get(currentId);
    for (const contained of unit?.contains || []) {
      stack.push(contained.unitId);
    }
  }
  return reachable;
}

// A single unit's decomposition must reach each descendant by exactly one path; two distinct paths
// to the same node (e.g. P->C and P->A->B->C, or a P->sp + P->ep->sp diamond) let the resolver sum
// the same node twice. This per-unit DFS flags the first descendant it re-enters via a second path.
// It is intentionally scoped to one unit's subtree, so a node legitimately shared by two DIFFERENT
// parents (gp->sp and ep->sp) is fine. Cycles are reported separately by the resolver, so this walk
// short-circuits on the active path to stay terminating.
function collectConflictingPathErrors(byId, unit, errors) {
  const visited = new Set();
  const onPath = new Set();
  function walk(unitId) {
    if (onPath.has(unitId)) return;
    if (visited.has(unitId)) {
      errors.push(`Currency unit "${unit.label}" has conflicting conversion paths to "${unitId}".`);
      return;
    }
    visited.add(unitId);
    onPath.add(unitId);
    for (const contained of byId.get(unitId)?.contains || []) {
      walk(contained.unitId);
    }
    onPath.delete(unitId);
  }
  visited.add(unit.id);
  onPath.add(unit.id);
  for (const contained of unit.contains) {
    walk(contained.unitId);
  }
}

function resolveUnitContents(unit, ancestry, { errors, resolveUnit }) {
  let baseUnitId = null;
  let baseValue = 0;
  for (const contained of unit.contains) {
    const child = resolveUnit(contained.unitId, [...ancestry, unit.id]);
    if (!child) continue;
    if (baseUnitId && child.baseUnitId !== baseUnitId) {
      errors.push(`Currency unit "${unit.label}" mixes incompatible base units.`);
      continue;
    }
    baseUnitId = child.baseUnitId;
    baseValue += contained.amount * child.baseValue;
  }
  if (!baseUnitId || baseValue <= 0) {
    errors.push(`Currency unit "${unit.label}" cannot resolve to a base unit.`);
  }
  return { baseUnitId, baseValue };
}

/**
 * Build the recursive base-value resolver for a unit map. A unit with no `contains[]` is a terminal
 * base unit (`baseValue: 1`); a parent multiplies each child's amount by the child's base value, so
 * the whole `contains[]` graph collapses to integer base values (e.g. cp=1, sp=10, gp=100). The
 * resolver is memoized and detects cycles, pushing a circular-reference error and returning `null`
 * for any unit on a cycle.
 *
 * @param {Map<string, object>} byId
 * @param {string[]} errors - mutable error accumulator.
 * @returns {{ resolveUnit: (unitId: string, ancestry?: string[]) => object|null, resolved: Map }}
 */
function buildUnitResolver(byId, errors) {
  const resolving = new Set();
  const resolved = new Map();
  function resolveUnit(unitId, ancestry = []) {
    if (resolved.has(unitId)) return resolved.get(unitId);
    const unit = byId.get(unitId);
    if (!unit) return null;
    if (resolving.has(unitId)) {
      errors.push(
        `Currency units contain a circular reference: ${[...ancestry, unitId].join(' -> ')}.`
      );
      return null;
    }
    resolving.add(unitId);
    const result =
      unit.contains.length === 0
        ? { baseUnitId: unit.id, baseValue: 1 }
        : resolveUnitContents(unit, ancestry, { errors, resolveUnit });
    resolving.delete(unitId);
    resolved.set(unitId, result);
    return result;
  }
  return { resolveUnit, resolved };
}

// Macro spending drives the craft through GM macros, so the engine must be able to gate
// (canAfford) and deduct (decrement); both are required. `increment` is reserved for a future
// refund flow and stays optional.
function collectMacroConfigErrors(macros, errors) {
  const safeMacros = macros && typeof macros === 'object' ? macros : {};
  if (!String(safeMacros.canAfford || '').trim()) {
    errors.push('A "can afford" currency macro is required for macro spending.');
  }
  if (!String(safeMacros.decrement || '').trim()) {
    errors.push('A "decrement" currency macro is required for macro spending.');
  }
}

/**
 * Validate a currency unit profile and resolve every unit's integer base value.
 *
 * Always-on checks: at least one unit, unique ids, positive-integer sub-unit amounts, no
 * self-containment, every sub-unit reference resolves, the graph is acyclic, and every connected
 * branch resolves to exactly one terminal base unit. The per-unit field requirement is conditional
 * on `spendStrategy`:
 *
 * - `actorProperty`: each unit must define an `actorPath`.
 * - `actorInventory`: each unit's `denomination` (defaulting to its id) must be a pf2e coin key
 *   (`pp`/`gp`/`sp`/`cp`).
 * - `macro`: each unit must have a non-empty `abbreviation` (macros match coins by abbreviation),
 *   and the config-level `canAfford` and `decrement` macros must be set (`increment` optional).
 *
 * @param {object[]} [units]
 * @param {{ spendStrategy?: string,
 *   macros?: { canAfford?: string, increment?: string, decrement?: string } }} [options]
 * @returns {{ valid: boolean, errors: string[], units: object[], metadata: Map }}
 */
export function validateCurrencyProfile(units = [], options = {}) {
  const spendStrategy = SPEND_STRATEGIES.has(options?.spendStrategy)
    ? options.spendStrategy
    : 'actorProperty';
  const rawUnits = Array.isArray(units) ? units : [];
  const normalizedUnits = rawUnits.map((entry) => normalizeCurrencyUnit(entry)).filter(Boolean);
  const byId = buildUnitMap(normalizedUnits);
  const errors = [];
  if (normalizedUnits.length === 0) {
    errors.push('No currency units are configured.');
  }
  if (byId.size !== normalizedUnits.length) {
    errors.push('Currency unit IDs must be unique.');
  }
  collectRawSubUnitErrors(rawUnits, errors);
  for (const unit of normalizedUnits) {
    collectUnitErrors(unit, { spendStrategy, byId, errors });
    collectConflictingPathErrors(byId, unit, errors);
  }
  if (spendStrategy === 'macro') {
    collectMacroConfigErrors(options?.macros, errors);
  }

  const { resolveUnit, resolved } = buildUnitResolver(byId, errors);
  for (const unit of normalizedUnits) {
    resolveUnit(unit.id);
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    units: normalizedUnits,
    metadata: resolved,
  };
}

export function formatCurrencyRequirement(requirement, units = []) {
  const unit = findCurrencyUnit(units, requirement?.unit);
  const label = unit?.abbreviation || unit?.label || requirement?.unit || '';
  return `${requirement?.amount ?? 0} ${label}`.trim();
}

export function readCurrencyBalances(actor, units = []) {
  const balances = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    const raw = getByPath(actor, unit.actorPath);
    // A missing/undefined path means the actor simply has none of this denomination
    // (e.g. an NPC or a custom denomination the actor never carries) and is read as 0,
    // falling through to the normal insufficient-currency path. Only a value that is
    // PRESENT but non-numeric (an object, an unparseable string) is a hard failure.
    if (raw === undefined || raw === null) {
      balances.set(unit.id, 0);
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      return {
        valid: false,
        message: `Currency unit "${unit.label || unit.id}" is not available on ${actor?.name || 'actor'}.`,
        balances,
      };
    }
    balances.set(unit.id, Math.max(0, Math.trunc(value)));
  }
  return { valid: true, balances };
}

export function currencyTotalForBase(balances, profile, baseUnitId) {
  let total = 0;
  for (const [unitId, amount] of balances.entries()) {
    const meta = profile.metadata.get(unitId);
    if (meta?.baseUnitId === baseUnitId) total += amount * meta.baseValue;
  }
  return total;
}

function distributeChange(balances, amount, unitsByValue) {
  let remaining = amount;
  for (const { unit, value } of unitsByValue) {
    const count = Math.floor(remaining / value);
    if (count <= 0) continue;
    balances.set(unit.id, (balances.get(unit.id) || 0) + count);
    remaining -= count * value;
  }
  return remaining === 0;
}

function buildSpendLadders(profile, requiredMeta) {
  const relevantUnits = profile.units
    .filter((unit) => profile.metadata.get(unit.id)?.baseUnitId === requiredMeta.baseUnitId)
    .map((unit) => ({ unit, value: profile.metadata.get(unit.id).baseValue }));
  const spendableLowerUnits = relevantUnits
    .filter((entry) => entry.value <= requiredMeta.baseValue)
    .sort((left, right) => right.value - left.value || left.unit.id.localeCompare(right.unit.id));
  const higherUnits = relevantUnits
    .filter((entry) => entry.value > requiredMeta.baseValue)
    .sort((left, right) => left.value - right.value || left.unit.id.localeCompare(right.unit.id));
  return { spendableLowerUnits, higherUnits };
}

function spendLowerUnits(nextBalances, requiredBase, spendableLowerUnits) {
  let remaining = requiredBase;
  for (const { unit, value } of spendableLowerUnits) {
    if (remaining <= 0) break;
    const available = nextBalances.get(unit.id) || 0;
    const count = Math.min(available, Math.floor(remaining / value));
    if (count <= 0) continue;
    nextBalances.set(unit.id, available - count);
    remaining -= count * value;
  }
  return remaining;
}

// Change from breaking a higher coin is returned only in denominations at or below the
// required unit, largest first. Returning change in a denomination LARGER than the
// requirement unit (e.g. handing back electrum when spending silver on the dnd5e ladder)
// is surprising and widely disliked, so the change target set is restricted to the same
// and smaller denominations. This stays provably complete: the overpay is always less
// than the broken higher coin's value, the required unit and every smaller unit are in
// the set, and the value-1 base unit guarantees the remainder distributes fully.
function breakHigherUnits(nextBalances, startingRemaining, higherUnits, changeUnits) {
  let remaining = startingRemaining;
  for (const { unit, value } of higherUnits) {
    while (remaining > 0 && (nextBalances.get(unit.id) || 0) > 0) {
      nextBalances.set(unit.id, (nextBalances.get(unit.id) || 0) - 1);
      if (value >= remaining) {
        const overpay = value - remaining;
        remaining = 0;
        if (overpay > 0) distributeChange(nextBalances, overpay, changeUnits);
        break;
      }
      remaining -= value;
    }
    if (remaining <= 0) break;
  }
  return remaining;
}

function buildSpendUpdates(profile, requiredMeta, nextBalances, originalBalances) {
  const updates = {};
  for (const unit of profile.units) {
    const meta = profile.metadata.get(unit.id);
    if (meta?.baseUnitId !== requiredMeta.baseUnitId) continue;
    const nextAmount = nextBalances.get(unit.id) || 0;
    if (nextAmount !== originalBalances.get(unit.id)) {
      updates[unit.actorPath] = nextAmount;
    }
  }
  return updates;
}

/**
 * Compute the batched `actor.update(...)` payload that spends a currency requirement under the
 * `actorProperty` strategy, making change across configured denominations.
 *
 * Validates the profile, confirms the requirement unit exists, checks affordability against the
 * actor's held balances (converted to the unit's terminal base value), then spends lower
 * denominations first and breaks higher ones as needed, returning change only in denominations at
 * or below the required unit. Returns `{ valid: false, message }` when the profile is invalid, the
 * unit is unknown, or funds are insufficient; otherwise `{ valid: true, updates, formatted }` where
 * `updates` maps each changed unit's `actorPath` to its new balance.
 *
 * @param {object} actor
 * @param {{ unit: string, amount: number }} requirement
 * @param {object[]} [units]
 * @returns {{ valid: boolean, message?: string, updates?: object, formatted?: string }}
 */
export function buildCurrencySpendUpdates(actor, requirement, units = []) {
  const profile = validateCurrencyProfile(units);
  if (!profile.valid) {
    return {
      valid: false,
      message: `Currency configuration is invalid: ${profile.errors.join('; ')}`,
    };
  }
  const requiredUnit = findCurrencyUnit(profile.units, requirement?.unit);
  if (!requiredUnit) {
    return {
      valid: false,
      message: `Currency unit "${requirement?.unit || ''}" is not configured.`,
    };
  }
  const requiredMeta = profile.metadata.get(requiredUnit.id);
  const requiredAmount = Math.max(0, Math.trunc(Number(requirement?.amount || 0)));
  if (requiredAmount <= 0) return { valid: true, updates: {} };

  const balanceResult = readCurrencyBalances(actor, profile.units);
  if (!balanceResult.valid) return { valid: false, message: balanceResult.message };

  const availableBase = currencyTotalForBase(
    balanceResult.balances,
    profile,
    requiredMeta.baseUnitId
  );
  const requiredBase = requiredAmount * requiredMeta.baseValue;
  if (availableBase < requiredBase) {
    return {
      valid: false,
      message: `Insufficient currency. Requires ${formatCurrencyRequirement(requirement, profile.units)}.`,
    };
  }

  const { spendableLowerUnits, higherUnits } = buildSpendLadders(profile, requiredMeta);
  const nextBalances = new Map(balanceResult.balances);
  let remaining = spendLowerUnits(nextBalances, requiredBase, spendableLowerUnits);
  remaining = breakHigherUnits(nextBalances, remaining, higherUnits, spendableLowerUnits);

  if (remaining > 0) {
    return {
      valid: false,
      message: `Insufficient currency. Requires ${formatCurrencyRequirement(requirement, profile.units)}.`,
    };
  }

  const updates = buildSpendUpdates(profile, requiredMeta, nextBalances, balanceResult.balances);
  return {
    valid: true,
    updates,
    formatted: formatCurrencyRequirement(requirement, profile.units),
  };
}

/**
 * Decide whether sub-unit `subUnitId` may be added as a direct child of `parentUnitId`.
 *
 * Eligibility rule: `reachable(parent) ∩ reachable(child) = ∅`, where `reachable(X)` is `X` plus
 * everything transitively reachable through `contains[]`. A non-empty intersection means adding the
 * edge would give the parent two distinct decomposition paths to some node (subsuming self,
 * already-contained, cycle, and the descendant/diamond cases). It still allows a node legitimately
 * shared by two different parents, because each parent's reachable set is computed over its own
 * subtree.
 *
 * @param {object[]} [units]
 * @param {string} [parentUnitId]
 * @param {string} [subUnitId]
 * @returns {boolean}
 */
export function canAddCurrencySubUnit(units = [], parentUnitId = '', subUnitId = '') {
  const parentId = String(parentUnitId || '').trim();
  const childId = String(subUnitId || '').trim();
  if (!parentId || !childId || parentId === childId) return false;
  const normalizedUnits = (Array.isArray(units) ? units : [])
    .map((entry) => normalizeCurrencyUnit(entry))
    .filter(Boolean);
  const byId = buildUnitMap(normalizedUnits);
  if (!byId.has(parentId) || !byId.has(childId)) return false;

  const parentReachable = collectReachableUnitIds(byId, parentId);
  const childReachable = collectReachableUnitIds(byId, childId);
  for (const id of childReachable) {
    if (parentReachable.has(id)) return false;
  }
  return true;
}

export function currencySubUnitOptions(units = [], parentUnitId = '') {
  return (Array.isArray(units) ? units : [])
    .filter((unit) => canAddCurrencySubUnit(units, parentUnitId, unit?.id))
    .map((unit) => ({
      id: unit.id,
      label: unit.label || unit.id,
      abbreviation: unit.abbreviation || unit.id,
    }));
}

export function currencyBaseValueScale(units = []) {
  const profile = validateCurrencyProfile(units);
  if (!profile.valid) return null;
  let scale = 1;
  for (const meta of profile.metadata.values()) {
    scale = integerLcm(scale, meta.baseValue || 1);
  }
  return scale;
}
