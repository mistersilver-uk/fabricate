import { getCurrencyPresetsForAdapter } from '../config/currencyPresets.js';
import { getByPath } from '../utils/objectPath.js';

function defaultRandomID() {
  return (
    globalThis.foundry?.utils?.randomID?.() ??
    globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  );
}

// A generated unit id has the shape produced by `defaultRandomID`: `foundry.utils.randomID()`
// returns 16 alphanumeric chars and the crypto fallback returns 10 hex chars, so any id of 10+
// alphanumeric characters is treated as machine-generated. Short, semantic ids (e.g. the preset
// coin keys `cp`/`sp`/`ep`/`gp`/`pp`) deliberately fail this guard so a hand-authored abbreviation
// that intentionally equals such an id is preserved.
function isGeneratedUnitId(value) {
  return /^[A-Za-z0-9]{10,}$/.test(value);
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
 * `abbreviation` is optional and defaults to the empty string when unauthored — it is never
 * defaulted to, or persisted as, the unit `id`. A stored `abbreviation` that strictly equals the
 * unit `id` is self-healed back to `''` when the id has the generated shape (see
 * {@link isGeneratedUnitId}); a hand-authored abbreviation that equals a short semantic id (e.g. a
 * preset coin key) is left intact.
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
 * The three peer top-level currency spend strategies (`currencyConfig.spendStrategy`, world
 * scope since issue 1278):
 *
 * - `actorProperty` (default) — units located by `actorPath`, spent via `actor.update`.
 * - `actorInventory` — a preconfigured provider (filtered by `game.system.id`) owns the
 *   denomination ladder; units located by `denomination`.
 * - `macro` — the GM supplies custom `canAfford`/`decrement` macros (the macro receives the actor
 *   and does whatever it likes), with units keyed by `abbreviation`. `increment` (refund) and
 *   `balance` (holdings read) are optional peers of those two.
 *
 * @type {Set<string>}
 */
export const SPEND_STRATEGIES = new Set(['actorProperty', 'actorInventory', 'macro']);
const PF2E_DENOMINATIONS = new Set(['pp', 'gp', 'sp', 'cp']);

/**
 * Ordered keys of the custom currency macro set (`requirements.currency.macros`). `canAfford` gates
 * the craft, `decrement` performs the spend, `increment` performs the refund on a player-cancel
 * reversal (issue 848), and `balance` REPORTS holdings rather than acting on them (issue 1342).
 * Used by the normalizer, the editor and the macro spender to iterate the macro slots.
 *
 * ## `balance` needs no migration, and this is where that is recorded
 *
 * {@link normalizeCurrencyConfig} iterates THIS array, and `CurrencyConfigStore.load()` normalizes
 * on EVERY read — it never trusts the stored shape. So a world persisted before `balance` existed
 * reads back with `macros.balance: ''` the first time anything asks for its config, with no
 * migration step and no `migrationVersion` advance. Do not add one: a migration here would rewrite
 * every world's setting to produce the value the normalizer already produces for free.
 *
 * The keys are APPENDED rather than inserted, because the array is the render order of the macro
 * fields in `WorldCurrencyTab.svelte`, and the three shipped fields should not move under a GM who
 * knows where they are.
 *
 * @type {string[]}
 */
export const CURRENCY_MACRO_KEYS = ['canAfford', 'increment', 'decrement', 'balance'];

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
 * Normalize a raw currency config block.
 *
 * Since issue 1278 this describes no PERSISTED shape of its own: the only production caller is
 * `normalizeWorldCurrencyConfig` below, which strips `enabled` and hands the rest to the world
 * `currencyConfig` setting. It still accepts a legacy per-system block verbatim, which is what
 * lets the migration and the export upcast feed it one.
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
 *   macros: { canAfford: string, increment: string, decrement: string, balance: string },
 *   units: object[] }}
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
 * Normalize the WORLD currency configuration (the `currencyConfig` world setting).
 *
 * Identical to {@link normalizeCurrencyConfig} except that it carries no `enabled` flag.
 * Participation is a per-crafting-system decision (`requirements.currency.enabled`); the world
 * config only describes WHAT the currency is — the coin ladder, how coins are read and spent, the
 * selected provider, and the GM macro set. Keeping `enabled` out of this shape is what stops a
 * world-level flag and a system-level flag from ever disagreeing.
 *
 * @param {object} [config]
 * @param {{ randomID?: () => string }} [options]
 * @returns {{ spendStrategy: string, providerId: string,
 *   macros: { canAfford: string, increment: string, decrement: string, balance: string },
 *   units: object[] }}
 */
export function normalizeWorldCurrencyConfig(config = {}, options = {}) {
  // Legacy `provider: 'system'` + `systemAdapter` configs used to be resolved by
  // CraftingSystemManager, back when currency lived on the crafting system. That block can now
  // only reach normalization here — carried up by the 1.26.0 world migration or by the export
  // upcast — so the resolution moved with it rather than being dropped.
  const legacyAdapter =
    config?.provider === 'system' && ['dnd5e', 'pf2e'].includes(config?.systemAdapter)
      ? config.systemAdapter
      : '';
  const units = Array.isArray(config?.units) ? config.units : [];
  const seededUnits = units.length > 0 ? units : getCurrencyPresetsForAdapter(legacyAdapter);
  // A legacy pf2e adapter seeded units that read and spend through the actor INVENTORY rather
  // than a flat actor property, so carry that intent forward as the actorInventory strategy when
  // no explicit strategy was persisted. A legacy dnd5e adapter maps to the default actorProperty.
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
 * EVERY string a currency unit answers to, in DISPLAY PRECEDENCE, declared exactly once.
 *
 * One list, read in two directions. {@link currencyUnitDisplayName} takes the FIRST non-empty
 * entry — the shipped `abbreviation` -> `label` -> `id` chain, which was spelled out at three
 * separate sites before this list existed. {@link resolveCurrencyUnitByName} takes ALL of them and
 * matches a caller's string against the set.
 *
 * Deriving the reverse direction from the forward one is the whole point, and it is a correctness
 * property rather than tidiness: a name Fabricate PRINTED must be a name Fabricate ACCEPTS. If the
 * two field sets were chosen independently, a unit could render as "Gold Pieces" on one surface and
 * then be unresolvable when a caller handed that exact string back — which is precisely the
 * asymmetry the pooled holdings read exposed for currency (issue 1342).
 *
 * The reads are tolerant in the same places {@link normalizeCurrencyUnit} is tolerant
 * (`abbr` beside `abbreviation`, `name` beside `label`), so a raw, not-yet-normalized unit
 * resolves by the same names its normalized form would.
 */
const CURRENCY_UNIT_NAME_FIELDS = Object.freeze([
  (unit) => String(unit?.abbreviation || unit?.abbr || '').trim(),
  (unit) => String(unit?.label || unit?.name || '').trim(),
  (unit) => String(unit?.id || '').trim(),
]);

/**
 * The human name of a unit — `abbreviation`, then `label`, then `id`, first non-empty wins.
 *
 * The single home of a chain that was written out at three sites: the requirement formatter here,
 * the sub-unit picker projection below, and `currencyAffordance`'s shortfall messages. A GM
 * reading "you need 50 gp" from a craft and "50 gp" from a companion refusal must be reading the
 * same derivation, not two that happen to agree.
 *
 * @param {object|null} unit A currency unit, raw or normalized.
 * @returns {string} The display name, or `''` when the unit names itself in no way at all.
 */
export function currencyUnitDisplayName(unit) {
  for (const read of CURRENCY_UNIT_NAME_FIELDS) {
    const value = read(unit);
    if (value) return value;
  }
  return '';
}

/**
 * Resolve a unit from a string a HUMAN wrote — its id, its abbreviation or its label.
 *
 * The inverse of {@link currencyUnitDisplayName}, and the counterpart to
 * {@link findCurrencyUnit}, which matches an id and only an id. It exists because a caller that
 * authors requirements the way a person speaks — "gold", "gp", "Gold Pieces" — otherwise cannot
 * name a coin at all, while the component and tool axes of the same request resolve their names
 * case-insensitively. One request should not mean two different things by "name" (issue 1342).
 *
 * ## Two tiers, and the order is load-bearing
 *
 * 1. **An exact `id` match wins outright**, through {@link findCurrencyUnit} itself, so a caller
 *    that already passes a unit id gets BYTE-IDENTICAL behaviour to before this function existed
 *    — whatever labels the world carries. That is what makes tier 2 purely additive rather than a
 *    change of meaning. It also protects a world whose ids are ordinary words: an id is the GM's
 *    durable handle for a coin and survives a rename, where a label is display text that can be
 *    retyped at any moment, so letting another unit's LABEL shadow this unit's ID would let an
 *    unrelated edit silently redirect a working caller. That is the same durable-identity-beats-
 *    display-name precedence the component matcher already applies.
 * 2. **Otherwise every name folds into ONE tier**, compared case-insensitively after trimming, the
 *    way the component definition index folds its own name lookup. Abbreviation does NOT beat
 *    label, deliberately: {@link currencyUnitDisplayName} renders whichever of the two is present,
 *    so a caller holding a string Fabricate printed cannot know which field it came from. Ranking
 *    them would resolve a genuine collision by a coin flip that looks authoritative; keeping them
 *    level makes the collision VISIBLE.
 *
 * ## Ambiguity is reported, never resolved silently
 *
 * When more than one unit answers to the folded name — two units sharing a label, or one unit's
 * label colliding with another's abbreviation — `ambiguous` is `true` and `unit` is the first in
 * ladder order. The caller decides what that means. A pooled holdings read surfaces it on the
 * reading's own `ambiguous` field, exactly as it does for a component name that matches in two
 * crafting systems, because a caller is liable to CONSUME by the id a read handed back and a
 * quietly chosen coin is a quietly chosen debit.
 *
 * A unit with no `id` is skipped: it is unaddressable by any caller, so resolving a name to it
 * could only produce a lookup that then misses.
 *
 * @param {object[]} [units] The world coin ladder, raw or normalized.
 * @param {string} [name] The caller's string.
 * @returns {{ unit: object|null, ambiguous: boolean }}
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
// (canAfford) and deduct (decrement); both are required. `increment` performs the player-cancel
// refund (issue 848) and stays OPTIONAL — a system with no increment macro simply cannot refund a
// macro-mode cancel (the reversal reports the failure rather than aborting).
//
// `balance` (issue 1342) stays OPTIONAL on exactly that precedent, and the precedent is what makes
// the choice safe rather than lenient: requiring it would make every world that already authored a
// valid macro ladder INVALID at craft time, because `validateCurrencyProfile` is the same gate the
// engine's afford check and deduction run through. A missing `balance` macro costs a world only the
// pooled holdings read, which answers "cannot see" and blocks nothing.
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
 *   and the config-level `canAfford` and `decrement` macros must be set (`increment` and
 *   `balance` optional).
 *
 * @param {object[]} [units]
 * @param {{ spendStrategy?: string,
 *   macros?: { canAfford?: string, increment?: string, decrement?: string, balance?: string }
 *   }} [options]
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

/**
 * Format a currency requirement as `<amount> <label>` for display.
 *
 * Resolves the requirement's unit id to a human label through the chain `abbreviation` (when
 * authored), then `label`, so a well-formed requirement never surfaces the raw unit id (a resolved
 * unit always carries a non-empty label). The one exception is a degenerate orphaned reference: when
 * `requirement.unit` names an id no longer present in `units`, the raw id is rendered verbatim as a
 * last resort, because a stale id reads better than a blank cost.
 *
 * @param {{ unit?: string, amount?: number }} requirement
 * @param {object[]} [units]
 * @returns {string}
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

/**
 * A base-unit amount expressed in the DENOMINATIONS A TABLE ACTUALLY SPEAKS (issue 1342).
 *
 * The inverse of {@link currencyTotalForBase}, and the reason it exists is a seam rather than a
 * convenience. A pooled currency take is settled and reported in the world's TERMINAL BASE UNIT —
 * `pooledLedgerRow` in `currencyAffordance.js` stamps every payer's line with `baseUnit.id` — while
 * the caller asked in its own denomination. So a 250 gp cost split across three sheets comes back
 * as three copper figures, and a companion drawing them beside the request it made prints
 * "250 gp: 15000, 10000, 0" over three different scales.
 *
 * Expressing a payer's share back in the CALLER's single unit is the thing this deliberately does
 * NOT do, and `companionPooledConsumption.js` records why: 150 cp is 1.5 gp, and a three-way split
 * of one coin does not sum back to one in floating point. A DECOMPOSITION has neither problem. It
 * is exact in integers, it sums back to the base amount by construction, and it is how a person
 * would say the number out loud.
 *
 * ## GREEDY, LARGEST FIRST, AND THE TIE-BREAK IS THE ONE THIS MODULE ALREADY USES
 *
 * The ordering is `buildSpendLadders`' own — descending `baseValue`, then `id` — so a world with
 * two units of equal value decomposes the same way it spends. `distributeChange` above is the same
 * walk over the same ordering; this returns the tally rather than writing balances.
 *
 * ## IT ANSWERS THE UNITS OF ONE LADDER ONLY
 *
 * Units are filtered to those sharing `baseUnitId`, exactly as `currencyTotalForBase` filters, so a
 * world running two unrelated ladders cannot have one bleed into the other's change. A `baseUnitId`
 * naming no terminal unit answers `[]` rather than inventing a denomination for the amount.
 *
 * @param {number} baseAmount The amount, counted in the terminal base unit.
 * @param {{units: object[], metadata: Map<string, {baseUnitId: string, baseValue: number}>}} profile
 * @param {string} baseUnitId The terminal base unit the amount is counted in.
 * @returns {Array<{unitId: string, unitLabel: string, amount: number}>} Largest denomination
 *   first, omitting every unit that takes none of it; `[]` for a non-positive or unresolvable
 *   amount.
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
 * Compute the batched `actor.update(...)` payload that REFUNDS a currency requirement under the
 * `actorProperty` strategy — the exact inverse of {@link buildCurrencySpendUpdates}. A refund makes
 * no change: it simply adds `amount` of the requirement's own denomination back to the actor's
 * held balance, so a `5 gp` spend refunds `5 gp` (net base-value neutral even if the original spend
 * had to break higher coins for change). Used by the player-cancel reversal (issue 848) and shared
 * with the GM cancel/reverse (issue 847).
 *
 * @param {object} actor
 * @param {{ unit: string, amount: number }} requirement
 * @param {object[]} [units]
 * @returns {{ valid: boolean, message?: string, updates?: object, formatted?: string }}
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

/**
 * List the units eligible to become a direct sub-unit of `parentUnitId` (see
 * {@link canAddCurrencySubUnit}), each projected to `{ id, label, abbreviation }` for the picker.
 * Both display fields resolve through a fallback so neither renders empty: `label` falls back to the
 * id, and `abbreviation` resolves through `abbreviation`, then `label`, then `id`.
 *
 * @param {object[]} [units]
 * @param {string} [parentUnitId]
 * @returns {{ id: string, label: string, abbreviation: string }[]}
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
