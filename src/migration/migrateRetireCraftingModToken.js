/**
 * 1.21.0 — Retire the Fabricate-owned check-modifier placeholder from every stored roll
 * formula (issue 1094; pure, clone-first, idempotent, version-gated).
 *
 * WHY THIS EXISTS. Before this change a check-modifier catalogue only reached the roll if
 * the GM ALSO typed a Fabricate-specific token into the formula; the shipped code
 * conceded it, carrying a whole `noPlaceholder` inert cause and two notice surfaces whose
 * only job was to report "you forgot the token". The scalar now APPENDS as one flavoured
 * `+ N[Modifiers]` term, exactly the way tool bonuses append, so the token has nothing
 * left to do. This migration takes it off disk; `stripRetiredModifierPlaceholder` removes
 * any that survives — hand-edited, imported, or seeded by a fixture — so it can never
 * double-count.
 *
 * TWO BEHAVIOUR CHANGES, COUNTED AND SURFACED. Neither is a no-op, and both are recorded
 * in `destructive-changes-and-migrations` as behaviour changes:
 *
 * 1. THE INERT GO LIVE. A system with an authored catalogue whose active check formula
 *    never spent the token was INERT. After this migration every such world silently
 *    starts adding those modifiers to every crafting roll. The remedy — stated in the GM
 *    notice — is to clear `defaultModifierIds`, or move to a rule whose set resolves to
 *    0, to preserve the previous total.
 * 2. SIGN INVERSION AND MULTIPLE-OCCURRENCE COLLAPSE. The retired substitution wrapped the
 *    scalar in parentheses precisely so a negative stayed valid arithmetic, so
 *    `1d20 - <token>` rolled `1d20 - (3)`. The same world now rolls `1d20 + 3[Modifiers]`:
 *    −3 becomes +3, a 2×scalar swing in the crafter's favour. A formula carrying the token
 *    TWICE moves from double-counting to counting once.
 *
 * A TOKEN THAT IS NOT TOP-LEVEL ADDITIVE IS LEFT UNTOUCHED ON DISK AND REPORTED. The rule is
 * the PREDICATE `describeRetiredModifierPlaceholder` states — bracket depth 0, an operator
 * run of at most one, and an additive or absent successor — not a list of shapes, and the
 * reason is ARITHMETIC rather than syntax. An appended `+ N[Modifiers]` term lands at the
 * end of the WHOLE formula, so lifting the token out is only sound where the two positions
 * are interchangeable. `(2 + <token> + 4) * 3` strips to a perfectly VALID `(2 + 4) * 3`
 * that totals 21 where it used to total 27; refusing is the only lossless answer, and this
 * migration's job is to TELL THE GM, not to repair.
 *
 * THE STRUCTURAL RESIDUE CHECK IS PART OF THAT REFUSAL, and it is why the strip goes
 * through `planRetiredPlaceholderStrip` rather than a local rewrite. An authored formula may
 * end in an operator (`1d20 - <token> -`), and persisting `1d20 -` would make every later
 * craft throw inside `new Roll(...)` as a rolled — therefore CONSUMING — permanent failure,
 * with the shim unable to notice because no token remains. The shim rejects such a residue
 * BEFORE consulting any dice engine, so the rejection still holds on this path, which
 * passes no engine at all.
 *
 * SALVAGE AND GATHERING ARE SWEPT DEFENSIVELY. Neither ever authored the token and neither
 * passes a modifier context to its runner, so stripping changes no total there. But an
 * imported bundle can carry one, a survivor would be stripped by the runtime shim anyway,
 * and leaving it on disk would only mislead a GM reading the field.
 *
 * PURE AND CLONE-FIRST. The runner spread-merges a migration's return value
 * (`data = { ...data, ...result }`), so this returns `{ systems, _retiredCraftingModCounts }`
 * rather than mutating the runner's payload. Clone-first is also what makes the no-throw
 * guarantee total: the runner restores its pre-migration checkpoint only on the FATAL
 * branch — a non-fatal throw is a bare `console.warn` and the pass continues to persist —
 * so an in-place migration that threw halfway would persist a half-applied world.
 *
 * `_retiredCraftingModCounts` IS A TRANSIENT REPORTING FIELD, not persisted data. The
 * runner captures it for the GM notice and `delete`s it before the settings write, the
 * same contract `_migratedCatalystCount` and `_unifiedRegionSystems` use. A migration
 * CANNOT report through the runner's return value: `MigrationRunner.run()` returns a fixed
 * object literal in three places, and the loop's spread merges a returned key into the DATA
 * payload, never into the summary.
 *
 * Mutated setting key: `craftingSystems` (and only it).
 *
 * Idempotent: a second pass finds no token and changes nothing — including on a formula
 * left untouched for a non-additive placement, which is reported again and rewritten never.
 *
 * Downgrade target `1.20.0` is DATA-lossless but BEHAVIOUR-lossy, and the registry entry
 * says so rather than claiming the usual "lands on that release's own schema". A world
 * downgraded to `1.20.0` finds its formulas intact and its catalogue intact, but that build
 * resolves modifiers ONLY through the token it no longer has, so check modifiers stop
 * contributing until a GM re-adds it by hand.
 */

import {
  resolveActiveCraftingCheckFormula,
  resolveEligibleModifierIds,
} from '../systems/craftingModifierResolver.js';
import {
  describeRetiredModifierPlaceholder,
  planRetiredPlaceholderStrip,
} from '../utils/craftingCheckExpression.js';

/**
 * Every check block and slot swept, in the order a GM reads them. Gathering has no
 * `simple` slot — its non-formula mode is `d100`, which authors nothing.
 */
const SWEPT_CHECK_SLOTS = Object.freeze([
  ['craftingCheck', Object.freeze(['simple', 'routed', 'progressive'])],
  ['salvageCraftingCheck', Object.freeze(['simple', 'routed', 'progressive'])],
  ['gatheringCraftingCheck', Object.freeze(['progressive', 'routed'])],
]);

/**
 * The legacy read alias. `rollExpression` was the routed check's original formula key and
 * is still read as a fallback, so a bundle carrying one carries a live formula — sweeping
 * only `rollFormula` would leave the token reachable through the alias.
 */
const ROUTED_LEGACY_FORMULA_KEY = 'rollExpression';

/** The formula keys swept on each slot; only `routed` carries the legacy alias. */
function formulaKeysFor(slot) {
  return slot === 'routed' ? ['rollFormula', ROUTED_LEGACY_FORMULA_KEY] : ['rollFormula'];
}

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/** A zeroed count bag. Named so the three producers below cannot drift on key spelling. */
function emptyCounts() {
  return { inert: 0, subtractive: 0, repeated: 0, untouched: 0 };
}

/** Whether any count in a bag is non-zero — the gate on reporting a system at all. */
export function hasRetiredCraftingModFindings(counts) {
  return (
    Number(counts?.inert) > 0 ||
    Number(counts?.subtractive) > 0 ||
    Number(counts?.repeated) > 0 ||
    Number(counts?.untouched) > 0
  );
}

/**
 * Retire the token from ONE formula field, counting what it found.
 *
 * The order is deliberate: classify, count, and only then rewrite — so a formula that was
 * counted is described by its PRE-strip text, and a non-additive placement returns before
 * any write.
 *
 * The strip is called with an explicitly NULL dice engine, so a data migration's output can
 * never depend on whether a Foundry global happened to be installed — which it IS in the
 * View Lab, where every migration runs on every build. That makes the shim's STRUCTURAL
 * residue check, which runs before any engine is consulted, the only guard on what this
 * function writes; it is an invariant rather than a validation for exactly that reason.
 */
function retireFormulaField(config, key, counts) {
  const authored = config?.[key];
  if (typeof authored !== 'string') return;
  const plan = planRetiredPlaceholderStrip(authored, null);
  if (plan.outcome === 'absent') return;
  // REFUSED covers both the non-additive placements and a residue that would be
  // structurally incomplete. Both leave the field exactly as authored and are counted, so
  // the GM is told about a check that will not roll until they rewrite it.
  if (plan.outcome === 'refused') {
    counts.untouched += 1;
    return;
  }
  if (plan.placement.subtractive) counts.subtractive += 1;
  if (plan.placement.occurrences > 1) counts.repeated += 1;
  // `plan.formula` is `''` for a placeholder-only formula, which is the correct thing to
  // persist: the readers report "no formula" for it rather than rolling `new Roll('')`.
  config[key] = plan.formula;
}

/**
 * Count the ONE formula whose modifiers are about to go live: the check the system's
 * resolution mode ACTUALLY rolls, authored, non-empty, and never spending the token, on a
 * system that has a catalogue to contribute.
 *
 * Scoped to the ACTIVE slot rather than all three, because the inert-goes-live change is a
 * statement about what this world will now roll — a token-free `progressive` formula on a
 * `simple` system changes nothing and would only inflate the notice.
 *
 * Gated on a non-empty RESOLVED ELIGIBLE SET, not merely a non-empty catalogue. The notice
 * this count drives tells the GM their modifiers have started applying and offers a remedy
 * (clear the default set); a system whose set already resolves to nothing has had nothing
 * start applying, so counting it would state a change that did not happen and prescribe a
 * remedy already in force. `resolveEligibleModifierIds` is asked rather than
 * `defaultModifierIds.length` so the answer matches what the engine will actually roll:
 * ids absent from the catalogue are dropped, and under `byRecipe` the source is the
 * recipe's pick — which no migration can see, so that rule is counted on the system set it
 * falls back to.
 *
 * Must run BEFORE the strip, or a formula that DID spend the token would be counted as
 * having never spent one.
 */
function countInertActiveCraftingCheck(system) {
  const check = _isPlainObject(system?.craftingCheck) ? system.craftingCheck : null;
  if (!check) return 0;
  const eligible = resolveEligibleModifierIds({
    catalogue: check.checkModifiers,
    systemPolicy: check.defaultModifierPolicy,
    defaultModifierIds: check.defaultModifierIds,
    maxModifierPicks: check.maxModifierPicks,
  });
  if (eligible.length === 0) return 0;
  const active = resolveActiveCraftingCheckFormula(system);
  if (active.slot === null) return 0;
  const authored =
    typeof active.config?.rollFormula === 'string' ? active.config.rollFormula.trim() : '';
  if (authored === '') return 0;
  return describeRetiredModifierPlaceholder(authored).present ? 0 : 1;
}

/**
 * Apply the whole 1.21.0 transform to ONE system, returning what it found.
 *
 * The argument is mutated in place, so callers must hand over a structure they already own
 * (a clone). Splitting the per-system transform out this way is what lets the world-setting
 * migration below and the export-payload upcast in `migrateExportPayload.js` share one
 * derivation instead of maintaining two copies of it: an export bundle carries exactly one
 * system, so there is nothing to group.
 *
 * IT DELIBERATELY DOES NOT SEED A MISSING CHECK BLOCK, the same call
 * `migrateMaxModifierPicks` and `migrateRetireProgressiveAllowPlayerReorder` make, for the
 * same reason: a block that does not exist carries no formula, so there is no storage churn
 * to spend for zero observable change.
 *
 * @param {unknown} system - one raw crafting system, mutated in place.
 * @returns {{ inert: number, subtractive: number, repeated: number, untouched: number }}
 */
export function applyRetireCraftingModToken(system) {
  const counts = emptyCounts();
  if (!_isPlainObject(system)) return counts;

  counts.inert = countInertActiveCraftingCheck(system);

  for (const [blockKey, slots] of SWEPT_CHECK_SLOTS) {
    const block = _isPlainObject(system[blockKey]) ? system[blockKey] : null;
    if (!block) continue;
    for (const slot of slots) {
      const config = _isPlainObject(block[slot]) ? block[slot] : null;
      if (!config) continue;
      for (const key of formulaKeysFor(slot)) retireFormulaField(config, key, counts);
    }
  }

  return counts;
}

/** The GM-facing name of a system, falling back to its id and then to a stable label. */
function systemLabel(system) {
  const name = typeof system?.name === 'string' ? system.name.trim() : '';
  if (name) return name;
  const id = typeof system?.id === 'string' ? system.id.trim() : '';
  return id || 'Unnamed system';
}

/**
 * Runner entry point.
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @returns {{ systems: Array<object>, _retiredCraftingModCounts?: Array<object> }}
 */
export function migrateRetireCraftingModToken(data = {}) {
  const systems = structuredClone(data.systems ?? null);

  if (!Array.isArray(systems)) {
    return { systems: data.systems };
  }

  const reported = [];
  for (const system of systems) {
    const counts = applyRetireCraftingModToken(system);
    if (hasRetiredCraftingModFindings(counts)) {
      reported.push({ system: systemLabel(system), ...counts });
    }
  }

  return { systems, _retiredCraftingModCounts: reported };
}
