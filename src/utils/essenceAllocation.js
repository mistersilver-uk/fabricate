/**
 * How carrier units become one essence block's delivered amounts (issue 917), shared by the model
 * and the read side. Pure, deterministic and order-independent. Import-free: the mounted harnesses
 * copy `IngredientSet.js` raw, where a missing import hangs the suite as `# cancelled`.
 */

function unitsOf(value) {
  const units = Number(value);
  if (!Number.isFinite(units) || units <= 0) return 0;
  return Math.floor(units);
}

function amountOf(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

function unitsFor(map, itemKey) {
  if (typeof itemKey !== 'string' || itemKey === '') return 0;
  if (!map || typeof map !== 'object') return 0;
  return unitsOf(map[itemKey]);
}

/** Tolerates the garbage a stored flag can hold. */
function essenceEntries(essences) {
  if (!essences || typeof essences !== 'object') return [];
  return Object.entries(essences);
}

/** Drops unusable ids and non-positive amounts. */
function accumulate(totals, entries, multiplier = 1) {
  for (const [rawId, rawAmount] of entries) {
    const essenceId = typeof rawId === 'string' ? rawId.trim() : '';
    const amount = amountOf(rawAmount) * multiplier;
    if (essenceId === '' || amount <= 0) continue;
    totals.set(essenceId, (totals.get(essenceId) ?? 0) + amount);
  }
  return totals;
}

/** `essencePool.requirements` (`need`, or the model's `amount`) or a need-by-essence-id map. */
function requirementEntries(requirements) {
  if (!Array.isArray(requirements)) return essenceEntries(requirements);
  return requirements.map((requirement) => [
    requirement?.essenceId,
    requirement?.need ?? requirement?.amount,
  ]);
}

function totalRequired(requirements) {
  return accumulate(new Map(), requirementEntries(requirements));
}

function carrierList(carriers) {
  return Array.isArray(carriers) ? carriers : [];
}

/** Each allocated carrier's `perUnit` map times its allocated units. */
export function deliveredEssences(allocation, carriers) {
  const delivered = new Map();

  for (const carrier of carrierList(carriers)) {
    const units = unitsFor(allocation, carrier?.itemKey);
    if (units <= 0) continue;
    accumulate(delivered, essenceEntries(carrier?.perUnit), units);
  }

  return Object.fromEntries(delivered);
}

/** The essence requirements an allocation does not cover. */
export function allocationShortfall(allocation, carriers, requirements) {
  const delivered = deliveredEssences(allocation, carriers);
  const shortfall = [];

  for (const [essenceId, need] of totalRequired(requirements)) {
    const have = amountOf(delivered[essenceId]);
    if (have < need) shortfall.push({ essenceId, need, have });
  }

  return shortfall;
}

/** Clamp a player-supplied allocation to what is actually available. */
export function clampAllocation(allocation, availableUnits) {
  const clamped = new Map();

  for (const [itemKey, requested] of Object.entries(allocation ?? {})) {
    const units = Math.min(unitsOf(requested), unitsFor(availableUnits, itemKey));
    if (units > 0) clamped.set(itemKey, units);
  }

  return Object.fromEntries(clamped);
}

function capacityReader(availableUnits) {
  const authoritative = Boolean(availableUnits) && typeof availableUnits === 'object';
  return (carrier) => {
    const itemKey = carrier?.itemKey;
    if (typeof itemKey !== 'string' || itemKey === '') return 0;
    return authoritative ? unitsFor(availableUnits, itemKey) : unitsOf(carrier?.ownedUnits);
  };
}

function scoreCarrier(carrier, remaining, ownedUnits) {
  let score = 0;
  let overshoot = 0;

  for (const [rawId, rawAmount] of essenceEntries(carrier?.perUnit)) {
    const essenceId = typeof rawId === 'string' ? rawId.trim() : '';
    const perUnit = amountOf(rawAmount);
    const need = remaining.get(essenceId) ?? 0;
    score += Math.min(perUnit, need);
    overshoot += Math.max(0, perUnit - need);
  }

  return { itemKey: carrier.itemKey, perUnit: carrier.perUnit, ownedUnits, score, overshoot };
}

/** Score desc, least overshoot, `ownedUnits` desc, then `itemKey` lexicographic. */
function isBetterPick(candidate, incumbent) {
  if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
  if (candidate.overshoot !== incumbent.overshoot) return candidate.overshoot < incumbent.overshoot;
  if (candidate.ownedUnits !== incumbent.ownedUnits) {
    return candidate.ownedUnits > incumbent.ownedUnits;
  }
  return candidate.itemKey < incumbent.itemKey;
}

/** `null` when no carrier with capacity contributes to the outstanding need. */
function selectCarrier(carriers, remaining, capacityFor, allocation) {
  let best = null;

  for (const carrier of carriers) {
    const ownedUnits = capacityFor(carrier);
    if ((allocation.get(carrier?.itemKey) ?? 0) >= ownedUnits) continue;
    const candidate = scoreCarrier(carrier, remaining, ownedUnits);
    if (candidate.score <= 0) continue;
    if (best === null || isBetterPick(candidate, best)) best = candidate;
  }

  return best;
}

/** Forgets essences that reach zero, so "anything left?" is `remaining.size`. */
function drawDown(remaining, perUnit) {
  for (const [rawId, rawAmount] of essenceEntries(perUnit)) {
    const essenceId = typeof rawId === 'string' ? rawId.trim() : '';
    const need = remaining.get(essenceId);
    if (need === undefined) continue;
    const left = need - amountOf(rawAmount);
    if (left > 0) remaining.set(essenceId, left);
    else remaining.delete(essenceId);
  }
}

/** Take the best next unit until nothing is outstanding or no carrier can contribute. */
export function greedyAllocate(requirements, carriers, availableUnits) {
  const remaining = totalRequired(requirements);
  const ledger = carrierList(carriers);
  const capacityFor = capacityReader(availableUnits);
  const allocation = new Map();

  while (remaining.size > 0) {
    const pick = selectCarrier(ledger, remaining, capacityFor, allocation);
    if (pick === null) break;
    allocation.set(pick.itemKey, (allocation.get(pick.itemKey) ?? 0) + 1);
    drawDown(remaining, pick.perUnit);
  }

  return Object.fromEntries(allocation);
}
