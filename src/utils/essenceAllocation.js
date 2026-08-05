/**
 * Shared essence allocation (issue 917) — how the units a player draws from carrier stacks
 * turn into essence amounts delivered to ONE ingredient set's essence block.
 *
 * Within a single set's essence block a consumed unit credits every essence it carries to
 * every essence requirement in that block, so funding the block is a joint problem over the
 * whole block rather than a per-requirement draw. That is why the arithmetic lives here once
 * and is shared by the model (which consumes the allocation) and the read side (which
 * suggests and renders it): a second copy would drift, and "the tiles show exactly what is
 * consumed" would stop being true by construction.
 *
 * This module is deliberately IMPORT-FREE. `IngredientSet.js` imports it, and the hand-rolled
 * mounted-component harnesses copy that module raw, so any transitive import would have to be
 * copied into every harness allowlist reaching it — an omission there HANGS the mounted suites
 * (reported as `# cancelled`, never `# fail`) instead of failing loudly. Keep it a leaf.
 *
 * Vocabulary, fixed here because several callers share it:
 *
 * - **carrier** — one inventory stack that can fund the block: `{ itemKey, perUnit, ownedUnits }`.
 *   `itemKey` is an index into the ALREADY-RESOLVED ledger, never a uuid to resolve — nothing
 *   here reads a document, so the public facade cannot become a cross-actor document probe.
 *   `perUnit` is the essence map one unit of that stack delivers; `ownedUnits` is the units
 *   left after every component/tag group has claimed, not the raw stack quantity.
 * - **allocation** — `{ [itemKey]: units }`, the units the block draws from each carrier.
 * - **delivered** — `{ [essenceId]: amount }`, what an allocation actually yields.
 *
 * Everything here is pure and deterministic: no clock, no randomness, and no dependence on the
 * order of the `carriers` array (see {@link greedyAllocate}).
 */

/**
 * Coerce a count of item units. Units are whole stacks, so a fractional value floors, and
 * anything unusable (absent key, `NaN`, `Infinity`, negative) reads as zero rather than
 * poisoning the arithmetic downstream.
 *
 * @param {unknown} value
 * @returns {number} a whole number of units, `>= 0`
 */
function unitsOf(value) {
  const units = Number(value);
  if (!Number.isFinite(units) || units <= 0) return 0;
  return Math.floor(units);
}

/**
 * Coerce an essence amount. Unlike units these are not forced whole — an authored essence
 * amount is the GM's number and this module never rounds it — but unusable values read as zero.
 *
 * @param {unknown} value
 * @returns {number} an essence amount, `>= 0`
 */
function amountOf(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

/**
 * Read one item key out of a `{ itemKey: units }` map. An absent key contributes 0 — that is
 * the documented "an absent key contributes nothing and is dropped" rule, and it is what keeps
 * a stale allocation naming a spent or deleted stack harmless.
 *
 * @param {Record<string, number>|null|undefined} map
 * @param {unknown} itemKey
 * @returns {number}
 */
function unitsFor(map, itemKey) {
  if (typeof itemKey !== 'string' || itemKey === '') return 0;
  if (!map || typeof map !== 'object') return 0;
  return unitsOf(map[itemKey]);
}

/**
 * Entries of an essence map, tolerant of the absent/garbage shapes a stored flag can hold.
 *
 * @param {Record<string, number>|null|undefined} essences
 * @returns {Array<[string, unknown]>}
 */
function essenceEntries(essences) {
  if (!essences || typeof essences !== 'object') return [];
  return Object.entries(essences);
}

/**
 * Add `entries` (scaled by `multiplier`) into an essence-id totals map, dropping unusable ids
 * and non-positive amounts. One accumulator serves both the requirement totals and the
 * delivered totals so the two can never normalize differently.
 *
 * @param {Map<string, number>} totals - mutated in place
 * @param {Array<[unknown, unknown]>} entries
 * @param {number} [multiplier]
 * @returns {Map<string, number>} `totals`
 */
function accumulate(totals, entries, multiplier = 1) {
  for (const [rawId, rawAmount] of entries) {
    const essenceId = typeof rawId === 'string' ? rawId.trim() : '';
    const amount = amountOf(rawAmount) * multiplier;
    if (essenceId === '' || amount <= 0) continue;
    totals.set(essenceId, (totals.get(essenceId) ?? 0) + amount);
  }
  return totals;
}

/**
 * Normalize the two shapes a caller legitimately holds into `[essenceId, need]` pairs: the
 * `essencePool.requirements` array (`{ essenceId, need }`, where `amount` is accepted as the
 * model-side alias) or a bare `{ [essenceId]: need }` map.
 *
 * @param {Array<{essenceId: string, need?: number, amount?: number}>|Record<string, number>} requirements
 * @returns {Array<[unknown, unknown]>}
 */
function requirementEntries(requirements) {
  if (!Array.isArray(requirements)) return essenceEntries(requirements);
  return requirements.map((requirement) => [
    requirement?.essenceId,
    requirement?.need ?? requirement?.amount,
  ]);
}

/**
 * Total need per essence id. Two requirements naming the same essence share one pool, so their
 * needs SUM here — `[Radiant 2, Radiant 2]` is a need of 4, not of 2. Which requirement is short
 * when the pool cannot cover that total is an attribution question the caller owns; this module
 * only answers whether the block as a whole is funded.
 *
 * @param {Array<object>|Record<string, number>} requirements
 * @returns {Map<string, number>} essence id to total need, positive entries only
 */
function totalRequired(requirements) {
  return accumulate(new Map(), requirementEntries(requirements));
}

/**
 * The carriers, defensively. A non-array is an empty ledger, not a crash.
 *
 * @param {Array<object>|null|undefined} carriers
 * @returns {Array<object>}
 */
function carrierList(carriers) {
  return Array.isArray(carriers) ? carriers : [];
}

/**
 * Sum what an allocation actually delivers: every allocated carrier's `perUnit` map scaled by
 * the units allocated to it.
 *
 * A carrier the allocation does not name contributes nothing — the allocation is never topped
 * up from unallocated stacks, because the player's stepper values ARE the consumption plan.
 *
 * @param {Record<string, number>} allocation - `{ [itemKey]: units }`
 * @param {Array<{itemKey: string, perUnit: Record<string, number>}>} carriers
 * @returns {Record<string, number>} `{ [essenceId]: amount }`
 */
export function deliveredEssences(allocation, carriers) {
  const delivered = new Map();

  for (const carrier of carrierList(carriers)) {
    const units = unitsFor(allocation, carrier?.itemKey);
    if (units <= 0) continue;
    accumulate(delivered, essenceEntries(carrier?.perUnit), units);
  }

  return Object.fromEntries(delivered);
}

/**
 * The essence requirements an allocation does not cover.
 *
 * An empty array means the block is funded. Entries come back in requirement order (first
 * mention of each essence id wins the position), so a caller can render them without sorting.
 *
 * @param {Record<string, number>} allocation - `{ [itemKey]: units }`
 * @param {Array<{itemKey: string, perUnit: Record<string, number>}>} carriers
 * @param {Array<object>|Record<string, number>} requirements
 * @returns {Array<{essenceId: string, need: number, have: number}>} unmet requirements only
 */
export function allocationShortfall(allocation, carriers, requirements) {
  const delivered = deliveredEssences(allocation, carriers);
  const shortfall = [];

  for (const [essenceId, need] of totalRequired(requirements)) {
    const have = amountOf(delivered[essenceId]);
    if (have < need) shortfall.push({ essenceId, need, have });
  }

  return shortfall;
}

/**
 * Clamp a player-supplied allocation to what is actually available.
 *
 * `availableUnits` is authoritative and is the units left AFTER the non-essence plan has
 * claimed, so a stepper can never allocate into an infeasible state. An item key the map does
 * not know is dropped rather than trusted: that is what makes a stale allocation naming a spent
 * or deleted stack, or an allocation forged against another actor's inventory, a no-op. Entries
 * clamping to zero are removed so the result stays a minimal, comparable map.
 *
 * @param {Record<string, number>} allocation - `{ [itemKey]: units }`
 * @param {Record<string, number>} availableUnits - `{ [itemKey]: units }`
 * @returns {Record<string, number>} the clamped allocation, positive entries only
 */
export function clampAllocation(allocation, availableUnits) {
  const clamped = new Map();

  for (const [itemKey, requested] of Object.entries(allocation ?? {})) {
    const units = Math.min(unitsOf(requested), unitsFor(availableUnits, itemKey));
    if (units > 0) clamped.set(itemKey, units);
  }

  return Object.fromEntries(clamped);
}

/**
 * Build the per-carrier capacity reader for one {@link greedyAllocate} run.
 *
 * When `availableUnits` is supplied it is authoritative, exactly as in {@link clampAllocation}:
 * a carrier absent from it has no capacity. When it is omitted entirely each carrier's own
 * `ownedUnits` is its capacity, which is the convenient two-argument form.
 *
 * @param {Record<string, number>|null|undefined} availableUnits
 * @returns {(carrier: object) => number}
 */
function capacityReader(availableUnits) {
  const authoritative = Boolean(availableUnits) && typeof availableUnits === 'object';
  return (carrier) => {
    const itemKey = carrier?.itemKey;
    if (typeof itemKey !== 'string' || itemKey === '') return 0;
    return authoritative ? unitsFor(availableUnits, itemKey) : unitsOf(carrier?.ownedUnits);
  };
}

/**
 * Score one candidate unit of a carrier against the need still outstanding.
 *
 * `score` is `Σ_e min(perUnit_e, remainingNeed_e)` — capped, so a carrier is never rewarded for
 * essence the block no longer needs. `overshoot` is the mirror term `Σ_e max(0, perUnit_e -
 * remainingNeed_e)`: the essence this unit would waste, counting essences the block never asked
 * for at all.
 *
 * @param {object} carrier
 * @param {Map<string, number>} remaining
 * @param {number} ownedUnits
 * @returns {{itemKey: string, perUnit: object, ownedUnits: number, score: number, overshoot: number}}
 */
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

/**
 * The tie-break, as a strict "is `candidate` preferred over `incumbent`" predicate:
 * **(score desc, least overshoot, ownedUnits desc, itemKey lexicographic)**.
 *
 * Two things about it are load-bearing.
 *
 * Overshoot is a TIE-BREAK among equal-score carriers and never a filter. Used as a filter it
 * would refuse a `{Radiant: 3}` stack against a need of `{Radiant: 1}` and report a perfectly
 * craftable recipe as impossible.
 *
 * The four keys make a TOTAL order over carriers (item keys are unique within a ledger), which
 * is what makes the result identical under any permutation of the `carriers` array. Foundry
 * collections reorder between reads, and without a total order the suggested allocation — and
 * the requirement rail rendered from it — would flap between renders.
 *
 * @param {{score: number, overshoot: number, ownedUnits: number, itemKey: string}} candidate
 * @param {{score: number, overshoot: number, ownedUnits: number, itemKey: string}} incumbent
 * @returns {boolean}
 */
function isBetterPick(candidate, incumbent) {
  if (candidate.score !== incumbent.score) return candidate.score > incumbent.score;
  if (candidate.overshoot !== incumbent.overshoot) return candidate.overshoot < incumbent.overshoot;
  if (candidate.ownedUnits !== incumbent.ownedUnits) {
    return candidate.ownedUnits > incumbent.ownedUnits;
  }
  return candidate.itemKey < incumbent.itemKey;
}

/**
 * Pick the single best next unit, or `null` when no carrier with capacity left contributes
 * anything to the outstanding need.
 *
 * @param {Array<object>} carriers
 * @param {Map<string, number>} remaining
 * @param {(carrier: object) => number} capacityFor
 * @param {Map<string, number>} allocation - units drawn so far
 * @returns {object|null}
 */
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

/**
 * Subtract one unit of a carrier from the outstanding need, forgetting essences that reach zero
 * so the loop's "anything left?" test is just `remaining.size`.
 *
 * @param {Map<string, number>} remaining - mutated in place
 * @param {Record<string, number>} perUnit
 */
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

/**
 * Suggest an allocation that funds the block: repeatedly take the single best next unit until
 * nothing is outstanding, or until no remaining carrier can contribute.
 *
 * **Feasibility, not minimality.** This finds *an* allocation satisfying the block whenever one
 * exists, so no craft is ever wrongly reported impossible. The guarantee is unconditional
 * because there is no budget to spend: any carrier with capacity contributing to a still-needed
 * essence scores above zero, so the loop stops short only when every carrier with capacity left
 * contributes nothing to the shortfall — which is exactly the case where consuming the entire
 * ledger would fall short too.
 *
 * It does NOT minimise units consumed. Six needs of 1 against carriers `{e1,e2,e3,e4}`,
 * `{e1,e2,e3}` and `{e4,e5,e6}` takes the score-4 carrier first and spends 3 units where 2 would
 * do. That is accepted: the result is a SUGGESTION the player edits per carrier before crafting,
 * and no single allocated unit is individually redundant there, so no shrink pass would fix it.
 * The capped score plus the least-overshoot tie-break keep the allocation irredundant by
 * construction — the best available score never rises as the loop proceeds, so a later pick can
 * never subsume an earlier one — which is why there is no second pass.
 *
 * @param {Array<object>|Record<string, number>} requirements - `essencePool.requirements`, or a
 *   bare `{ [essenceId]: need }` map
 * @param {Array<{itemKey: string, perUnit: Record<string, number>, ownedUnits?: number}>} carriers
 * @param {Record<string, number>} [availableUnits] - authoritative per-item capacity; when
 *   omitted, each carrier's own `ownedUnits` is used
 * @returns {Record<string, number>} `{ [itemKey]: units }`, positive entries only
 */
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
