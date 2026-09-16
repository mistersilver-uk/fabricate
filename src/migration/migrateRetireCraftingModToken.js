/**
 * `1.21.0` — retire the Fabricate-owned check-modifier placeholder from every stored roll formula
 * (issue 1094; spec § Check-Modifier Placeholder Retirement Migration owns every rule below,
 * including why a token it cannot lift out is left untouched and REPORTED).
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
 * Retire the token from ONE field: classify, count, then rewrite, so a counted formula is described
 * by its PRE-strip text. The NULL dice engine keeps the output free of any Foundry global, leaving
 * the STRUCTURAL residue check as the only guard on what this writes (requirement 3).
 */
function retireFormulaField(config, key, counts) {
  const authored = config?.[key];
  if (typeof authored !== 'string') return;
  const plan = planRetiredPlaceholderStrip(authored, null);
  if (plan.outcome === 'absent') return;
  // REFUSED covers a non-additive placement and a structurally incomplete residue alike.
  if (plan.outcome === 'refused') {
    counts.untouched += 1;
    return;
  }
  if (plan.placement.subtractive) counts.subtractive += 1;
  if (plan.placement.occurrences > 1) counts.repeated += 1;
  // `''` for a placeholder-only formula: the readers then report "no formula".
  config[key] = plan.formula;
}

/**
 * Count the ONE formula whose modifiers are about to go live, gated on a non-empty RESOLVED ELIGIBLE
 * SET rather than a non-empty catalogue (requirement 5). Must run BEFORE the strip.
 */
function countInertActiveCraftingCheck(system) {
  const check = _isPlainObject(system?.craftingCheck) ? system.craftingCheck : null;
  if (!check) return 0;
  // The context is BUILT by the shared builder, never hand-mirrored, and `null` for the subject
  // because no migration can see a recipe's pick. THE `??` CHAIN MUST COVER ALL THREE LIBRARY
  // LOCATIONS this world may be at (issues 1095, 1117): the spread is unconditional, so a missing
  // key would write `modifiers: undefined` over a real one and the failure is a silent count of 0.
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
 * Apply the whole `1.21.0` transform to ONE system, mutated in place, shared with
 * `migrateExportPayload.js`. It DELIBERATELY DOES NOT SEED A MISSING CHECK BLOCK (requirement 6).
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

/** The four notice clauses, in reading order, indexed by the keys {@link emptyCounts} declares. */
const NOTICE_CLAUSES = Object.freeze([
  Object.freeze([
    'inert',
    'Inert',
    // The remedy names CLEARING THE DEFAULT SET and nothing else (requirement 5).
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
 * Compose the one-time GM notice: totals, affected systems, message and channel. LIFTED OUT OF
 * `src/main.js` deliberately, and SEVERITY IS PER FINDING — `untouched` is the only count that
 * leaves a BROKEN world, so it alone is a PERMANENT warning (requirement 5).
 */
export function buildRetiredCraftingModNotice(reported, format) {
  const entries = Array.isArray(reported) ? reported : [];

  // Belt and braces over the runner's own coercion: a NaN passes the `count <= 0` gate below and
  // would render "NaN formula(s)" to the GM as this migration's one visible output.
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
