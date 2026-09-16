/**
 * `1.21.0` — retire the Fabricate-owned check-modifier placeholder from every stored roll formula
 * (issue 1094; spec § Check-Modifier Placeholder Retirement Migration). Pure, clone-first,
 * idempotent, version-gated. A TOKEN IT CANNOT LIFT OUT IS LEFT UNTOUCHED AND REPORTED, for an
 * ARITHMETIC reason: an appended term lands at the end of the WHOLE formula, so `(2 + <token> + 4)
 * * 3` would strip to a VALID `(2 + 4) * 3` totalling 21 where it totalled 27.
 */

import {
  buildCheckModifierContext,
  resolveActiveCraftingCheckFormula,
  resolveEligibleModifierIds,
} from '../systems/checkModifierResolver.js';
import {
  describeRetiredModifierPlaceholder,
  planRetiredPlaceholderStrip,
} from '../utils/craftingCheckExpression.js';

import { finishMigrationNotice, localizeNoticeClause } from './migrationNoticeDetail.js';

/** Every check block and slot swept. Gathering has no `simple` slot — its `d100` authors nothing. */
const SWEPT_CHECK_SLOTS = Object.freeze([
  ['craftingCheck', Object.freeze(['simple', 'routed', 'progressive'])],
  ['salvageCraftingCheck', Object.freeze(['simple', 'routed', 'progressive'])],
  ['gatheringCraftingCheck', Object.freeze(['progressive', 'routed'])],
]);

/** The legacy read alias: sweeping only `rollFormula` would leave the token reachable through it. */
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
 * Retire the token from ONE field, counting what it found: classify, count, then rewrite, so a
 * counted formula is described by its PRE-strip text. The strip is called with an explicitly NULL
 * dice engine, so the output cannot depend on a Foundry global — which the View Lab installs — and
 * the shim's STRUCTURAL residue check is therefore the only guard on what this writes.
 */
function retireFormulaField(config, key, counts) {
  const authored = config?.[key];
  if (typeof authored !== 'string') return;
  const plan = planRetiredPlaceholderStrip(authored, null);
  if (plan.outcome === 'absent') return;
  // REFUSED covers both a non-additive placement and a structurally incomplete residue. Both leave
  // the field exactly as authored and are counted, so the GM is told about a check that will not
  // roll until they rewrite it.
  if (plan.outcome === 'refused') {
    counts.untouched += 1;
    return;
  }
  if (plan.placement.subtractive) counts.subtractive += 1;
  if (plan.placement.occurrences > 1) counts.repeated += 1;
  // `plan.formula` is `''` for a placeholder-only formula, which is the correct thing to persist:
  // the readers report "no formula" rather than rolling `new Roll('')`.
  config[key] = plan.formula;
}

/**
 * Count the ONE formula whose modifiers are about to go live: the check the system's mode ACTUALLY
 * rolls, authored, never spending the token, on a system with a catalogue.
 * Gated on a non-empty RESOLVED ELIGIBLE SET rather than a non-empty catalogue, because a system
 * whose set already resolves to nothing has had nothing start applying — counting it would state a
 * change that did not happen. Must run BEFORE the strip, or a formula that DID spend the token
 * would count as never having.
 */
function countInertActiveCraftingCheck(system) {
  const check = _isPlainObject(system?.craftingCheck) ? system.craftingCheck : null;
  if (!check) return 0;
  // The context is BUILT by the shared builder, not hand-mirrored, which is how this count would
  // otherwise stop matching what the engine resolves. `null` for the subject is the point of the
  // third argument: no migration can see a recipe's pick, so `bySubject` falls back to the system set.
  //
  // THE LIBRARY IS LIFTED FROM WHICHEVER OF ITS THREE LOCATIONS THIS WORLD IS AT (issues 1095, 1117):
  // this is `1.21.0` and the runner walks in version order, so on a first pass the library still
  // lives inside `craftingCheck` rather than where the shared builder reads it. THE `??` CHAIN MUST
  // COVER ALL THREE — the spread is unconditional, so a system carrying no library key would write
  // `modifiers: undefined` OVER a real one, and the failure is a silent count of 0.
  const eligible = resolveEligibleModifierIds(
    buildCheckModifierContext(
      {
        ...system,
        modifiers: check.checkModifiers ?? system.checkModifiers ?? system.modifiers,
      },
      'crafting',
      null
    )
  );
  if (eligible.length === 0) return 0;
  const active = resolveActiveCraftingCheckFormula(system);
  if (active.slot === null) return 0;
  const authored =
    typeof active.config?.rollFormula === 'string' ? active.config.rollFormula.trim() : '';
  if (authored === '') return 0;
  return describeRetiredModifierPlaceholder(authored).present ? 0 : 1;
}

/**
 * Apply the whole `1.21.0` transform to ONE system, mutated in place. Split out so the world-setting
 * migration and `migrateExportPayload.js` share ONE derivation. IT DELIBERATELY DOES NOT SEED A
 * MISSING CHECK BLOCK, the same call two siblings make: a block that does not exist carries no
 * formula, so there is no storage churn to spend.
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

/**
 * The four count clauses of the GM notice, in the order a GM reads them, indexed by the SAME keys
 * {@link emptyCounts} declares, so a clause can never report a count it does not name.
 */
const NOTICE_CLAUSES = Object.freeze([
  Object.freeze([
    'inert',
    'Inert',
    // The remedy names CLEARING THE DEFAULT SET, and nothing else. An earlier draft offered "choose
    // a combination rule whose set resolves to 0", which names no rule that does that: every rule
    // reduces the same eligible set, so switching between them cannot zero it.
    '{count} check(s) had modifiers that never reached the roll and now apply — to keep the previous total, clear the Default modifiers set on those systems.',
  ]),
  Object.freeze([
    'subtractive',
    'Subtractive',
    '{count} formula(s) subtracted the modifier and now add it.',
  ]),
  Object.freeze([
    'repeated',
    'Repeated',
    '{count} formula(s) counted it more than once and now count it once.',
  ]),
  Object.freeze([
    'untouched',
    'UntouchedDetail',
    '{count} formula(s) were left exactly as authored because the placeholder sat where it could not be removed safely; those checks will not roll until you rewrite them.',
  ]),
]);

/** The toast's lead and untouched fallbacks; the console detail leads with the full sentence. */
const NOTICE_LEAD_FALLBACK =
  'Fabricate now adds check modifiers to crafting-check rolls automatically and removed the old placeholder from: {systems}.';
const NOTICE_LEAD_DETAIL_FALLBACK =
  'Fabricate now adds check modifiers to every crafting-check roll automatically, so the roll-formula placeholder they used to need has been removed from these systems: {systems}.';
const NOTICE_UNTOUCHED_FALLBACK =
  '{count} formula(s) could not be updated and will not roll until you rewrite them.';

const NOTICE_KEY_PREFIX = 'FABRICATE.Migration.RetireCheckModifierPlaceholder.';

/**
 * Compose the one-time GM notice: totals, affected systems, message and channel.
 * LIFTED OUT OF `src/main.js` DELIBERATELY, because this arithmetic IS the notice and that file
 * cannot be imported by a unit test — source-text greps pin a DISPATCH but not a sum, a clause
 * selection or a join, and three semantic mutations survived a green suite while it lived there.
 * THE CLAUSES ARE SEPARATE KEYS, JOINED ONLY WHEN NON-ZERO, and SEVERITY IS PER FINDING:
 * `untouched` is the only count that leaves a BROKEN world, so it is a PERMANENT warning while
 * everything else is `info`. That matters mechanically too — `installFoundryShim` routes `warn` to a
 * console error that FAILS a View Lab capture, and one failed case fails the whole job.
 */
export function buildRetiredCraftingModNotice(reported, format) {
  const entries = Array.isArray(reported) ? reported : [];

  // `MigrationRunner` already coerces the transient report, so this is belt and braces — but a NaN
  // would not be caught by the `count <= 0` gate below (every comparison against NaN is false), so
  // it would render "NaN formula(s)" to the GM as the migration's one visible output.
  const totals = emptyCounts();
  for (const entry of entries) {
    for (const [countKey] of NOTICE_CLAUSES) {
      const count = Number(entry?.[countKey]);
      if (Number.isFinite(count)) totals[countKey] += count;
    }
  }

  const systems = entries
    .map((entry) => String(entry?.system ?? ''))
    .filter((name) => name !== '')
    .join(', ');

  const clause = (suffix, data, template) =>
    localizeNoticeClause(format, `${NOTICE_KEY_PREFIX}${suffix}`, data, template);
  const toast = [clause('Lead', { systems }, NOTICE_LEAD_FALLBACK)];
  const detail = [clause('LeadDetail', { systems }, NOTICE_LEAD_DETAIL_FALLBACK)];
  if (totals.untouched > 0) {
    toast.push(clause('Untouched', { count: totals.untouched }, NOTICE_UNTOUCHED_FALLBACK));
  }
  for (const [countKey, langKey, fallback] of NOTICE_CLAUSES) {
    if (totals[countKey] > 0) detail.push(clause(langKey, { count: totals[countKey] }, fallback));
  }

  const permanent = totals.untouched > 0;
  return {
    totals,
    systems,
    ...finishMigrationNotice(toast, detail, format),
    severity: permanent ? 'warn' : 'info',
    permanent,
  };
}

/** The GM-facing name of a system, falling back to its id and then to a stable label. */
function systemLabel(system) {
  const name = typeof system?.name === 'string' ? system.name.trim() : '';
  if (name) return name;
  const id = typeof system?.id === 'string' ? system.id.trim() : '';
  return id || 'Unnamed system';
}

/** Runner entry point. */
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
