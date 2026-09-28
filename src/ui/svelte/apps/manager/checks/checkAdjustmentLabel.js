/**
 * Difficulty-adjustment labels (`+5`, `−2`, `×½`) and their parser. Pure; the Studio's formatted
 * Steppers pass both, so every label a GM sees types back to the value it names.
 */
import { numberOrNull } from '../../../../../utils/scalars.js';

const MINUS = '−';
const TIMES = '×';
const EPSILON = 1e-9;

/** The named multipliers, each with the glyph its label uses. */
const FRACTIONS = Object.freeze([
  [1 / 2, '½'],
  [1 / 3, '⅓'],
  [1 / 4, '¼'],
  [1 / 5, '⅕'],
]);

/** The multiply kind's stepping stops, ascending: ×⅕, ×¼, ×⅓, ×½, ×1 and ×2. */
export const MULTIPLIER_STOPS = Object.freeze([1 / 5, 1 / 4, 1 / 3, 1 / 2, 1, 2]);

function decimal(value) {
  return String(Number(value.toFixed(4)));
}

/** The label for one adjustment of `kind`; `''` for an absent or non-finite value. */
export function formatCheckAdjustment(kind, value) {
  const number = numberOrNull(value);
  if (number === null) return '';
  if (kind === 'multiply') {
    const named = FRACTIONS.find(([fraction]) => Math.abs(fraction - number) < EPSILON);
    return `${TIMES}${named ? named[1] : decimal(number)}`;
  }
  if (number > 0) return `+${decimal(number)}`;
  if (number < 0) return `${MINUS}${decimal(-number)}`;
  return '0';
}

function readMagnitude(text) {
  const glyph = FRACTIONS.find(([, symbol]) => symbol === text);
  if (glyph) return glyph[0];
  const ratio = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (ratio) return Number(ratio[2]) === 0 ? NaN : Number(ratio[1]) / Number(ratio[2]);
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}

/**
 * The value a typed label names, or NaN for text that names none or for a multiplier that is not
 * above zero. It accepts every label {@link formatCheckAdjustment} emits plus plain forms: `½`,
 * `1/2`, `0.5`, `x0.5`, `-2`.
 */
export function parseCheckAdjustment(kind, text) {
  let source = String(text ?? '')
    .trim()
    .replaceAll(MINUS, '-');
  if (kind === 'multiply') source = source.replace(/^[×xX*]\s*/, '');
  const sign = /^[+-]/.exec(source)?.[0] ?? '';
  const magnitude = readMagnitude(source.slice(sign.length).trim());
  if (!Number.isFinite(magnitude)) return NaN;
  // A multiplier must be above zero, as the runtime's `isValidTargetAdjustment` requires.
  if (kind === 'multiply' && (sign === '-' || !(magnitude > 0))) return NaN;
  return sign === '-' ? -magnitude : magnitude;
}

/**
 * The previewed tier's `{ name, adjustment }` reading under a character-value `evaluation`, or null
 * when the check is not graded against one or the tier sets no adjustment.
 */
export function previewTierAdjustment(evaluation, tier) {
  const target = evaluation?.target;
  if (target?.source !== 'attribute' || !tier) return null;
  const adjustment = formatCheckAdjustment(target.adjustmentKind, tier.adjustment);
  return adjustment ? { name: tier.name || '', adjustment } : null;
}
