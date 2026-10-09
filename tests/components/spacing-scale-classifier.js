/**
 * The absolute spacing classifier (issue 1523): whether one spacing value is on the published
 * scale, and the Svelte files held to it. `spacing-scale-ratchet.test.js` runs it over `<style>`
 * blocks and `spacing-scale-markup.test.js` over styles set in markup.
 */
import { pixelValuesIn, resolveValueCandidates } from '../helpers/styleBlockScan.js';

import { isExemptSpacingPixels, isSpacingScaleToken } from './spacing-known-literals.js';

/** The Svelte files held to the scale: the manager, the shared components and the player apps. */
export const SVELTE_SCOPE_ROOTS = Object.freeze(['src/ui/svelte/']);

export const inSvelteScope = (file) =>
  file.endsWith('.svelte') && SVELTE_SCOPE_ROOTS.some((root) => file.startsWith(root));

/**
 * A length in ANY unit the spacing scale never publishes, which the pixel scan cannot see: a
 * number followed by a percent sign or by letters other than `px` (`em`, `dvh`, `pt`, `cqw`, ...).
 * A leading minus is part of the length, but a hyphen inside an identifier (`--fab-space-2xs`) is
 * not.
 */
const NON_PIXEL_LENGTH =
  /(?<![\w.]|\w-)(?:\d+(?:\.\d+)?|\.\d+)(?:(?!px(?![\w-]))[a-z]+|%)(?![\w-])/giu;

/** The arithmetic functions inside which an exempt literal could be multiplied past its band. */
const MATH_FUNCTION = /(?<![\w-])(calc|min|max|clamp)\(/giu;

/** The arguments of each outermost `calc`/`min`/`max`/`clamp` in `value`, with its name. */
function mathCallsIn(value) {
  const calls = [];
  for (let from = 0; ; ) {
    MATH_FUNCTION.lastIndex = from;
    const match = MATH_FUNCTION.exec(value);
    if (match === null) return calls;
    const start = match.index + match[0].length;
    let depth = 1;
    let index = start;
    for (; index < value.length && depth > 0; index += 1) {
      if (value[index] === '(') depth += 1;
      else if (value[index] === ')') depth -= 1;
    }
    calls.push({ name: match[1].toLowerCase(), inner: value.slice(start, index - 1) });
    from = index;
  }
}

/** A `calc()` operand list that is plain arithmetic once the scale is substituted. */
const ARITHMETIC = /^[\d\s.+\-*/()]+$/u;

/** The value of plain `+ - * /` arithmetic over numbers, or null when it does not parse. */
function evaluate(text) {
  const tokens = text.match(/\d*\.?\d+|[-+*/()]/gu) ?? [];
  let at = 0;
  const factor = () => {
    const token = tokens[at++];
    if (token === '-') return -factor();
    if (token !== '(') return Number(token);
    const inner = sum();
    at += 1;
    return inner;
  };
  const product = () => {
    let value = factor();
    while (tokens[at] === '*' || tokens[at] === '/') {
      value = tokens[at++] === '*' ? value * factor() : value / factor();
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (tokens[at] === '+' || tokens[at] === '-') {
      value = tokens[at++] === '+' ? value + product() : value - product();
    }
    return value;
  };
  const value = sum();
  return at === tokens.length && Number.isFinite(value) ? value : null;
}

/** What `inner` computes to with each scale token at its pixel value, or null when it cannot. */
function scaleArithmetic(inner, scale) {
  const text = inner
    .replaceAll(/var\(\s*(--[\w-]+)\s*\)/gu, (reference, name) => scale.get(name) ?? reference)
    .replaceAll(/(\d)px/gu, '$1');
  return ARITHMETIC.test(text) ? evaluate(text) : null;
}

/** The published scale, each token at its single pixel value. */
export function scaleOf(definitions) {
  return new Map(
    [...definitions]
      .filter(([name, values]) => isSpacingScaleToken(name) && values.length === 1)
      .map(([name, [value]]) => [name, String(Number.parseFloat(value))])
  );
}

/** A style corpus's private custom properties (the scale removed) and its scale, for the classifier. */
export const spacingContext = (styleCorpus) => ({
  definitions: new Map([...styleCorpus.definitions].filter(([name]) => !isSpacingScaleToken(name))),
  scale: scaleOf(styleCorpus.definitions),
});

/**
 * Every length in one spacing value that is not on the scale: a pixel literal outside the spec's
 * two exemptions, found through any private custom property, a non-pixel length in any unit, an
 * exempt literal used as an arithmetic operand, or arithmetic that computes off the scale.
 *
 * @param {string} value A declaration's raw value text.
 * @param {Map<string, string[]>} definitions Custom properties, the scale already removed.
 * @param {Map<string, string>} scale Each scale token's pixel value.
 */
export function offScaleLengthsIn(value, definitions, scale) {
  const steps = new Set([0, ...[...scale.values()].map(Number)]);
  const found = new Set();
  for (const candidate of resolveValueCandidates(value, definitions).candidates) {
    for (const pixels of pixelValuesIn(candidate)) {
      if (!isExemptSpacingPixels(pixels)) found.add(`${pixels}px`);
    }
    for (const [length] of candidate.matchAll(NON_PIXEL_LENGTH)) found.add(length);
    // An exempt literal is only exempt standing alone: `calc(1px * 13)` is a 13px gap. The one
    // arithmetic the exemptions allow is a sign flip, which carries no pixel literal at all.
    for (const { name, inner } of mathCallsIn(candidate)) {
      for (const pixels of pixelValuesIn(inner)) {
        if (isExemptSpacingPixels(pixels)) found.add(`${pixels}px in ${name}()`);
      }
      const computed = scaleArithmetic(inner, scale);
      if (computed !== null && !steps.has(Math.abs(computed))) {
        found.add(`${name}() = ${computed}px`);
      }
    }
  }
  return [...found];
}
