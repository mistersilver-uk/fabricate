/**
 * A summing check whose typed formula counts successes, and the staged Convert that rebuilds it as
 * a structured count (issue 2006). Pure and Foundry-free; the accepted grammar is the subset of
 * Foundry V13.351 and V14.367 die modifiers whose count this Studio reproduces exactly.
 */
import { countFacePredicates, extremeFace } from '../../../../../systems/countEvaluation.js';
import {
  normalizeCheckEvaluation,
  normalizeNullableSuccesses,
} from '../../../../../systems/normalize/checkEvaluation.js';
import { trimString as trimmed } from '../../../../../utils/scalars.js';

/** The one convertible shape: a die term, a directional `cs`, a same-side `x`, a worst-side `df`. */
const COUNTING_FORMULA =
  /^(?<pool>\d+|\(\s*@[-.\w]+\s*\)|@\{[-.\w]+\})d(?<die>\d+)(?<explode>xo?(?:(?:[<>]=?|=)?\d+)?)?cs(?<cmp>[<>]=?|=)?(?<threshold>\d+|@\{[-.\w]+\}|@[-.\w]+(?![-.\w]))(?<cancel>df(?:[<>]=?|=)?\d+)?$/i;

// A path stops before a die term, so `@poold10cs>=8` still shows the counting die it was meant as.
const ROLL_DATA_PATH = /@\{[^}]*\}|@[\w.-]+?(?=d\d|[^\w.-]|$)/g;
const DIE_TERM = /\d*d\d+((?:[a-z]+|[\d<>=]+)*)/gi;
const COUNTING_MODIFIER = /cs|cf|even|odd/i;

/** Whether a die term's modifier run carries `cs`, `cf`, `even` or `odd`, in any case. */
export function formulaCountsSuccesses(formula) {
  const neutral = trimmed(formula).replaceAll(ROLL_DATA_PATH, '0');
  return [...neutral.matchAll(DIE_TERM)].some((term) => COUNTING_MODIFIER.test(term[1]));
}

const SIDES = Object.freeze({
  '>=': ['over', 'meet'],
  '>': ['over', 'exceed'],
  '<=': ['under', 'meet'],
  '<': ['under', 'exceed'],
});

/** `[direction, thresholdMode]`; bare or `=` counts only the die's extreme face. */
function countSide(cmp, threshold, die) {
  if (cmp && cmp !== '=') return SIDES[cmp];
  if (!/^\d+$/.test(threshold)) return null;
  if (Number(threshold) === die) return SIDES['>='];
  return Number(threshold) === 1 ? SIDES['<='] : null;
}

// A `from` face reads toward its own side: `>` / `<` move the stated face one step inward.
const FROM_STEP = Object.freeze({ '>=': 0, '<=': 0, '>': 1, '<': -1 });

/**
 * One face rule off `x…` or `df…`: `{ kind, value }`, or null when the modifier is not the
 * extreme face or a `from` face on `side` (the side whose faces it reads toward).
 */
function faceRule(raw, { die, extreme, extremeKind, side }) {
  const [, cmp = '', digits] = /^(?:xo?|df)([<>]=?|=)?(\d+)?$/i.exec(raw);
  if (digits === undefined) return extreme === die ? { kind: extremeKind, value: null } : null;
  const value = Number(digits);
  if (cmp === '' || cmp === '=')
    return value === extreme ? { kind: extremeKind, value: null } : null;
  if (cmp[0] !== side) return null;
  const from = value + FROM_STEP[cmp];
  return from >= 1 && from <= die ? { kind: 'from', value: from } : null;
}

/** The face rules and pool inputs of a parsed formula, or null where a part does not convert. */
function parsedRules(groups, die, [direction, thresholdMode]) {
  const toward = direction === 'under' ? '<' : '>';
  const away = direction === 'under' ? '>' : '<';
  const explode = groups.explode
    ? faceRule(groups.explode, {
        die,
        extreme: extremeFace(die, direction),
        extremeKind: 'best',
        side: toward,
      })
    : undefined;
  const cancel = groups.cancel
    ? faceRule(groups.cancel, {
        die,
        extreme: extremeFace(die, direction === 'under' ? 'over' : 'under'),
        extremeKind: 'worst',
        side: away,
      })
    : undefined;
  if (explode === null || cancel === null) return null;
  const once = /^xo/i.test(groups.explode ?? '');
  return { direction, thresholdMode, explode: explode && { ...explode, once }, cancel };
}

/** Whether a face both qualifies and cancels, which Foundry scores −1 and the count scores 0. */
function cancelOverlaps({ die, direction, thresholdMode, cancel }, threshold) {
  const { qualifies, cancels } = countFacePredicates({
    die,
    threshold,
    direction,
    comparison: thresholdMode,
    explode: null,
    cancel,
  });
  for (let face = 1; face <= die; face += 1) if (qualifies(face) && cancels(face)) return true;
  return false;
}

/**
 * The structured count a formula maps to exactly — `{ die, base, threshold, direction,
 * thresholdMode, explode, cancel }` with an absent rule `undefined` — or null when it does not.
 */
export function parseCountingFormula(formula) {
  const groups = COUNTING_FORMULA.exec(trimmed(formula))?.groups;
  const die = Number(groups?.die);
  if (!groups || die < 2) return null;
  const side = countSide(groups.cmp, groups.threshold, die);
  const rules = side && parsedRules(groups, die, side);
  if (!rules) return null;
  const literal = /^\d+$/.test(groups.threshold);
  if (rules.cancel && !literal) return null;
  const threshold = literal ? String(Number(groups.threshold)) : groups.threshold;
  if (rules.cancel && cancelOverlaps({ die, ...rules }, Number(threshold))) return null;
  const pool = groups.pool.replaceAll(/[()\s]/g, '');
  return { die, base: /^\d+$/.test(pool) ? String(Number(pool)) : pool, threshold, ...rules };
}

/** The count a DC becomes, `dc + 1` where the summed check passed only above it (ruling R1). */
const requiredFrom = (dc, exceed) => Number(dc) + (exceed ? 1 : 0);
const inRange = (value) => Number.isInteger(value) && value >= 0 && value <= 20;

/** Every required count Convert writes: the check's own, then each tier with none authored. */
function copiedCounts(check, exceed) {
  const tiers = Array.isArray(check?.tiers) ? check.tiers : [];
  return [
    requiredFrom(check?.dc, exceed),
    ...tiers
      .filter((tier) => normalizeNullableSuccesses(tier?.successes) === null)
      .map((tier) => requiredFrom(tier?.dc, exceed)),
  ];
}

const nameOf = (record) => trimmed(record?.name) || String(record?.id ?? '');
const keepsOnlyDc = (record) =>
  ![null, undefined, ''].includes(record?.dcOverride) &&
  normalizeNullableSuccesses(record?.successesOverride) === null;

/** Components or tasks overriding the DC alone, which then take the check's successes needed. */
function dcOnlyOverrides(activity, { components, gatheringTasks }) {
  const list = (records) => (Array.isArray(records) ? records : []);
  if (activity === 'salvage') {
    return list(components)
      .filter((component) => component?.salvage?.enabled === true)
      .filter((component) => keepsOnlyDc(component.salvage))
      .map(nameOf);
  }
  if (activity !== 'gathering') return [];
  return list(gatheringTasks)
    .filter((task) => task?.resolutionMode === 'routed' && keepsOnlyDc(task))
    .map(nameOf);
}

/**
 * Whether a summing check offers Convert, as the facts its warning states: `convertible`, plus
 * `exceed`, `dynamic`, the first `outOfRange` count and the `overrides` Convert leaves behind.
 * Only a sum/over fixed-target check graded against a DC (simple or routed) measured the count.
 */
export function planCountConversion(check, { mode, activity = '', records = {} } = {}) {
  const evaluation = normalizeCheckEvaluation(check?.evaluation);
  const exceed = check?.thresholdMode === 'exceed';
  const dynamic = check?.dcMode === 'dynamic';
  const graded = mode === 'simple' || mode === 'routed';
  const summedOver = evaluation.direction === 'over' && evaluation.target.source === 'fixed';
  if (!graded || !summedOver || (dynamic && exceed) || !parseCountingFormula(check?.rollFormula)) {
    return { convertible: false };
  }
  const outOfRange = copiedCounts(check, exceed).find((count) => !inRange(count));
  if (outOfRange !== undefined) return { convertible: false, outOfRange };
  const overrides = dcOnlyOverrides(activity, records).join(', ');
  return {
    convertible: true,
    ...(exceed && { exceed }),
    ...(dynamic && { dynamic }),
    ...(overrides && { overrides }),
  };
}

/** A rule Convert found, or the rule switched off with its faces and repeat kept. */
function convertedRule(current, parsed) {
  if (!parsed) return { ...current, enabled: false };
  const faces = { kind: parsed.kind, value: parsed.value ?? current.faces.value };
  return 'once' in current ? { enabled: true, faces, once: parsed.once } : { enabled: true, faces };
}

/**
 * The check Convert stages: a count with the parsed pool, direction and per-die test, and the
 * DCs copied as successes needed (`+1` for `exceed`, ruling R1) onto the check and every tier
 * with none authored. The formula, DCs, overrides and the rest of the pool are kept.
 */
export function convertCountingFormula(check) {
  const parsed = parseCountingFormula(check?.rollFormula);
  if (!parsed) return check;
  const exceed = check?.thresholdMode === 'exceed';
  const evaluation = normalizeCheckEvaluation(check?.evaluation);
  const pool = {
    ...evaluation.pool,
    die: parsed.die,
    base: parsed.base,
    threshold: parsed.threshold,
    required: requiredFrom(check.dc, exceed),
    explode: convertedRule(evaluation.pool.explode, parsed.explode),
    cancel: convertedRule(evaluation.pool.cancel, parsed.cancel),
  };
  const tiers = Array.isArray(check.tiers)
    ? check.tiers.map((tier) =>
        normalizeNullableSuccesses(tier?.successes) === null
          ? { ...tier, successes: requiredFrom(tier?.dc, exceed) }
          : tier
      )
    : check.tiers;
  return {
    ...check,
    thresholdMode: parsed.thresholdMode,
    evaluation: { ...evaluation, product: 'count', direction: parsed.direction, pool },
    ...(Array.isArray(tiers) && { tiers }),
  };
}
