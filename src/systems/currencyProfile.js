import { getCurrencyPresetsForAdapter } from '../config/currencyPresets.js';
import { getByPath } from '../utils/objectPath.js';

function defaultRandomID() {
  return (
    globalThis.foundry?.utils?.randomID?.() ??
    globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  );
}

// A generated unit id (`randomID()`'s 16 chars, or the crypto fallback's 10) is 10+ alphanumerics;
// short semantic ids such as the preset `cp`/`sp`/`gp` fail this guard, so a hand-authored
// abbreviation equal to one is preserved.
function isGeneratedUnitId(value) {
  return /^[A-Za-z0-9]{10,}$/.test(value);
}

/**
 * Normalize one raw unit to `{ id, label, abbreviation, icon, actorPath, denomination?,
 * contains[] }`, or `null` for a non-object or empty id. `actorPath` locates the balance under
 * `actorProperty`, `denomination` (emitted only when present) under `actorInventory`; `contains[]`
 * is deduplicated by child id and keeps positive integer amounts only.
 * `abbreviation` defaults to `''`, never to the id; a stored abbreviation equal to a generated id
 * self-heals to `''`, while one equal to a short semantic id is kept.
 */
export function normalizeCurrencyUnit(entry = {}, randomID = defaultRandomID) {
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || randomID()).trim();
  if (!id) return null;
  const label = String(entry.label || entry.name || id).trim() || id;
  const rawAbbreviation = String(entry.abbreviation || entry.abbr || '').trim();
  const abbreviation =
    rawAbbreviation && !(rawAbbreviation === id && isGeneratedUnitId(id)) ? rawAbbreviation : '';
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
 * The three peer spend strategies (`currencyConfig.spendStrategy`, world scope since issue 1278):
 * `actorProperty` (default; units by `actorPath`, spent via `actor.update`), `actorInventory` (a
 * provider filtered by `game.system.id` owns the ladder; units by `denomination`) and `macro` (GM
 * `canAfford`/`decrement` macros, units by `abbreviation`; `increment` and `balance` optional).
 */
export const SPEND_STRATEGIES = new Set(['actorProperty', 'actorInventory', 'macro']);
const PF2E_DENOMINATIONS = new Set(['pp', 'gp', 'sp', 'cp']);

/**
 * The macro slots, in render order: `canAfford` gates, `decrement` spends, `increment` refunds a
 * player-cancel (issue 848) and `balance` reports holdings (issue 1342). `balance` needs no
 * migration: `CurrencyConfigStore.load()` normalizes every read, so an older world reads
 * `balance: ''`. Keys are appended, never inserted, so `WorldCurrencyTab.svelte` fields keep place.
 */
export const CURRENCY_MACRO_KEYS = ['canAfford', 'increment', 'decrement', 'balance'];

// Provider and macro settings persist under every strategy, so flipping the strategy never loses
// a configured provider or macro set.
function normalizeInventorySettings(currency = {}) {
  const providerId = String(currency?.providerId || '').trim();
  const rawMacros = currency?.macros && typeof currency.macros === 'object' ? currency.macros : {};
  const macros = {};
  for (const key of CURRENCY_MACRO_KEYS) {
    macros[key] = String(rawMacros[key] || '').trim();
  }
  return { providerId, macros };
}

// Legacy read alias: `actorInventory` + `inventoryMode: 'macro'` maps forward to the peer `macro`
// strategy, and `inventoryMode` is never re-emitted. The nested model was never released, so no
// broader migration is needed.
function resolveSpendStrategy(currency = {}) {
  const raw = currency?.spendStrategy;
  if (raw === 'actorInventory' && currency?.inventoryMode === 'macro') return 'macro';
  return SPEND_STRATEGIES.has(raw) ? raw : 'actorProperty';
}

/**
 * Normalize a raw currency config block. Since issue 1278 it has no persisted shape of its own:
 * `normalizeWorldCurrencyConfig` strips `enabled` for the world setting, and a legacy per-system
 * block is accepted for the migration and the export upcast. An unknown `spendStrategy` falls back
 * to `actorProperty`. Legacy `provider`/`systemAdapter`/single-macro fields are never re-emitted.
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

/**
 * Normalize the world `currencyConfig` setting: `normalizeCurrencyConfig` without `enabled`, which
 * is per crafting system, so a world flag and a system flag can never disagree.
 */
export function normalizeWorldCurrencyConfig(config = {}, options = {}) {
  // Legacy `provider: 'system'` + `systemAdapter` configs now reach normalization only here, via
  // the 1.26.0 world migration or the export upcast, so their resolution moved with them.
  const legacyAdapter =
    config?.provider === 'system' && ['dnd5e', 'pf2e'].includes(config?.systemAdapter)
      ? config.systemAdapter
      : '';
  const units = Array.isArray(config?.units) ? config.units : [];
  const seededUnits = units.length > 0 ? units : getCurrencyPresetsForAdapter(legacyAdapter);
  // A legacy pf2e adapter implies `actorInventory` when no strategy was persisted; dnd5e maps to
  // the default `actorProperty`.
  const legacyAdapterSpendStrategy = { pf2e: 'actorInventory', dnd5e: 'actorProperty' };
  const spendStrategy =
    config?.spendStrategy || legacyAdapterSpendStrategy[legacyAdapter] || undefined;

  const { enabled: _ignored, ...rest } = normalizeCurrencyConfig(
    { ...config, spendStrategy, units: seededUnits },
    options
  );
  return rest;
}

export function findCurrencyUnit(units = [], unitId = '') {
  const id = String(unitId || '').trim();
  if (!id) return null;
  return (Array.isArray(units) ? units : []).find((unit) => unit?.id === id) || null;
}

/**
 * Every string a unit answers to, in display precedence, declared once and read both ways:
 * `currencyUnitDisplayName` takes the first non-empty and `resolveCurrencyUnitByName` matches all,
 * so a name Fabricate prints is a name it accepts (issue 1342). Reads tolerate `abbr` and `name`
 * as `normalizeCurrencyUnit` does.
 */
const CURRENCY_UNIT_NAME_FIELDS = Object.freeze([
  (unit) => String(unit?.abbreviation || unit?.abbr || '').trim(),
  (unit) => String(unit?.label || unit?.name || '').trim(),
  (unit) => String(unit?.id || '').trim(),
]);

/**
 * A unit's display name: `abbreviation`, then `label`, then `id`; the single home of that chain,
 * so a craft and a companion refusal name a coin alike. `''` when the unit names itself nowhere.
 */
export function currencyUnitDisplayName(unit) {
  for (const read of CURRENCY_UNIT_NAME_FIELDS) {
    const value = read(unit);
    if (value) return value;
  }
  return '';
}

/**
 * Resolve a unit from a human-written id, abbreviation or label (issue 1342), the inverse of
 * `currencyUnitDisplayName`. Two tiers, in order: an exact `id` match wins outright, so id callers
 * are unaffected and a label can never shadow another unit's durable id; otherwise every name
 * folds into one case-insensitive tier, abbreviation level with label, since a caller cannot know
 * which field Fabricate printed.
 * More than one match sets `ambiguous` and answers the first in ladder order, never resolving it
 * silently: a caller consumes by the id a read returns. A unit with no `id` is skipped.
 */
export function resolveCurrencyUnitByName(units = [], name = '') {
  const wanted = String(name ?? '').trim();
  if (!wanted) return { unit: null, ambiguous: false };

  const exact = findCurrencyUnit(units, wanted);
  if (exact) return { unit: exact, ambiguous: false };

  const folded = wanted.toLowerCase();
  const matches = (Array.isArray(units) ? units : []).filter(
    (unit) =>
      String(unit?.id || '').trim() !== '' &&
      CURRENCY_UNIT_NAME_FIELDS.some((read) => {
        const value = read(unit);
        return value !== '' && value.toLowerCase() === folded;
      })
  );
  return { unit: matches[0] ?? null, ambiguous: matches.length > 1 };
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

// Per-unit strategy requirement: `macro` needs an abbreviation, `actorInventory` a pf2e
// denomination and `actorProperty` an actor data path.
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

/** Every unit id reachable from `startId` through `contains[]`, inclusive; cycle-safe. */
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

// One unit's decomposition must reach each descendant by exactly one path, or the resolver sums a
// node twice (a P->sp + P->ep->sp diamond). Scoped to one unit's subtree, so a node shared by two
// different parents is fine; cycles are reported by the resolver.
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
 * The memoized, cycle-detecting base-value resolver: a unit with no `contains[]` is a terminal
 * base unit (`baseValue: 1`) and a parent sums amount times child base value (cp=1, sp=10,
 * gp=100). A unit on a cycle records an error and resolves `null`.
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

// `canAfford` and `decrement` are required for macro spending. `increment` stays optional (such a
// world cannot refund a cancel, which reports the failure), and so does `balance` (issue 1342):
// requiring it would invalidate every existing macro ladder at craft time, while its absence only
// makes the pooled read answer "cannot see".
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
 * Validate a unit profile and resolve every unit's integer base value. Always: at least one unit,
 * unique ids, positive-integer sub-unit amounts, no self-containment, resolvable references, an
 * acyclic graph and one terminal base unit per branch. Per strategy: `actorProperty` needs an
 * `actorPath`, `actorInventory` a pf2e denomination (defaulting to the id), and `macro` an
 * abbreviation plus the `canAfford` and `decrement` macros.
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

/**
 * Format a requirement as `<amount> <label>` via `currencyUnitDisplayName`; only an id no longer
 * in `units` renders raw, since a stale id reads better than a blank cost.
 */
export function formatCurrencyRequirement(requirement, units = []) {
  const unit = findCurrencyUnit(units, requirement?.unit);
  const label = currencyUnitDisplayName(unit) || requirement?.unit || '';
  return `${requirement?.amount ?? 0} ${label}`.trim();
}

export function readCurrencyBalances(actor, units = []) {
  const balances = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    const raw = getByPath(actor, unit.actorPath);
    // A missing path reads as 0 (the actor holds none of this denomination) and falls through
    // to the insufficient path; only a present but non-numeric value is a hard failure.
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

/**
 * A base-unit amount decomposed into whole coins, largest first (issue 1342): 15003 cp on a
 * `gp -> sp -> cp` ladder is 150 gp, 3 cp. Pooled takes are reported in the terminal base unit,
 * and a share converted to the caller's unit would be fractional; a decomposition is exact and sums
 * back. Ordered as `buildSpendLadders` orders (value descending, then `id`), and restricted to one
 * ladder's units. `[]` for a non-positive amount or a `baseUnitId` naming no unit.
 */
export function decomposeBaseAmount(baseAmount, profile, baseUnitId) {
  let remaining = Math.trunc(Number(baseAmount) || 0);
  if (remaining <= 0) return [];
  const ladder = (profile?.units || [])
    .filter((unit) => profile?.metadata?.get(unit.id)?.baseUnitId === baseUnitId)
    .map((unit) => ({ unit, value: profile.metadata.get(unit.id).baseValue }))
    .filter((entry) => Number.isFinite(entry.value) && entry.value > 0)
    .sort((left, right) => right.value - left.value || left.unit.id.localeCompare(right.unit.id));
  const share = [];
  for (const { unit, value } of ladder) {
    const count = Math.floor(remaining / value);
    if (count <= 0) continue;
    share.push({ unitId: unit.id, unitLabel: currencyUnitDisplayName(unit), amount: count });
    remaining -= count * value;
    if (remaining <= 0) break;
  }
  return share;
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

// Change from breaking a higher coin is returned only in denominations at or below the required
// unit, largest first (no electrum back for silver). Still complete: the overpay is below the
// broken coin's value and the value-1 base unit absorbs any remainder.
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
 * The `actorProperty` spend payload: check affordability in base value, spend lower denominations
 * first, then break higher ones, with change at or below the required unit. `{ valid: false,
 * message }` for an invalid profile, unknown unit or shortfall; otherwise `{ valid: true,
 * updates, formatted }`, `updates` keyed by `actorPath`.
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
 * The `actorProperty` refund payload, the inverse of `buildCurrencySpendUpdates` (issues 847, 848):
 * it adds `amount` of the requirement's own denomination back, making no change, so the total
 * base value is restored even if the spend broke higher coins.
 */
export function buildCurrencyRefundUpdates(actor, requirement, units = []) {
  const profile = validateCurrencyProfile(units);
  if (!profile.valid) {
    return {
      valid: false,
      message: `Currency configuration is invalid: ${profile.errors.join('; ')}`,
    };
  }
  const unit = findCurrencyUnit(profile.units, requirement?.unit);
  if (!unit) {
    return {
      valid: false,
      message: `Currency unit "${requirement?.unit || ''}" is not configured.`,
    };
  }
  const amount = Math.max(0, Math.trunc(Number(requirement?.amount || 0)));
  if (amount <= 0) return { valid: true, updates: {} };

  const balanceResult = readCurrencyBalances(actor, profile.units);
  if (!balanceResult.valid) return { valid: false, message: balanceResult.message };

  const current = balanceResult.balances.get(unit.id) || 0;
  return {
    valid: true,
    updates: { [unit.actorPath]: current + amount },
    formatted: formatCurrencyRequirement(requirement, profile.units),
  };
}

/**
 * Whether `subUnitId` may become a direct child of `parentUnitId`: only when the two reachable sets
 * are disjoint, which rules out self, duplicates, cycles and diamonds while allowing a node shared
 * by two different parents.
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

/**
 * The picker's eligible sub-units as `{ id, label, abbreviation }`; `label` falls back to the id
 * and `abbreviation` to the display-name chain.
 */
export function currencySubUnitOptions(units = [], parentUnitId = '') {
  return (Array.isArray(units) ? units : [])
    .filter((unit) => canAddCurrencySubUnit(units, parentUnitId, unit?.id))
    .map((unit) => ({
      id: unit.id,
      label: unit.label || unit.id,
      abbreviation: currencyUnitDisplayName(unit),
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
