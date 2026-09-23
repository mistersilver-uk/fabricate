/**
 * A CSS declaration scanner over BOTH stylesheets the product ships (issue 1391). WHY THE RESULT IS
 * A UNION, NOT A SUBSTITUTION ─────────────────────────────────────── Substitution is not monotone:
 * it REMOVES text as well as adding it.
 */

import { collectWorkingTreeSources } from './sourceScan.js';

/** The roots holding shipped CSS. `src` for Svelte scoped blocks, `styles` for the global sheet. */
export const STYLE_CORPUS_ROOTS = Object.freeze(['src', 'styles']);

/**
 * `.scss` is listed because `lint:css` globs `styles/**\/*.{css,scss}` and
 * `collectWorkingTreeSources` takes an explicit list with NO default — omitting it would silently
 * skip a future file that stylelint does gate, which is the one direction of error nobody notices.
 */
export const STYLE_CORPUS_EXTENSIONS = Object.freeze(['.svelte', '.css', '.scss']);

/** The cap on `var()` chain depth. */
export const MAX_VAR_CHAIN_DEPTH = 8;

/**
 * The cap on the combinations produced from ONE text in ONE round. A value naming k tokens, each
 * defined m times, expands to m**k texts per round.
 */
const MAX_VALUE_CANDIDATES = 512;

/** A line that is nothing but a `<style …>` opening tag. */
const STYLE_OPEN_LINE = /^\s*<style\b[^<>]*>\s*$/;

/** A line that is nothing but the matching close. */
const STYLE_CLOSE_LINE = /^\s*<\/style>\s*$/;

/** One `property: value` pair, anchored to a real declaration boundary. */
const DECLARATION = /(?:^|[;{}])\s*(--[\w-]+|[a-zA-Z][\w-]*)\s*:\s*([^;{}]*)/g;

/**
 * A pixel literal, on a NUMERIC boundary. IT IS SIGN-BLIND, deliberately unfixed and stated here
 * because the next customer is the spacing gate.
 */
const PIXEL_LITERAL = /(?<![\w.])(\d+(?:\.\d+)?|\.\d+)px\b/gi;

/**
 * Replace `source` with same-length text in which everything OUTSIDE a `<style>` block is
 * spaces, so a Svelte file can be scanned as CSS without moving a single character.
 *
 * @param {string} source A `.svelte` file's text.
 * @returns {string} Same length, same newlines, CSS only.
 */
export function maskNonStyleRegions(source) {
  let inside = false;
  return String(source ?? '')
    .split('\n')
    .map((line) => {
      if (!inside) {
        if (STYLE_OPEN_LINE.test(line)) inside = true;
        return ' '.repeat(line.length);
      }
      if (STYLE_CLOSE_LINE.test(line)) {
        inside = false;
        return ' '.repeat(line.length);
      }
      return line;
    })
    .join('\n');
}

/**
 * Blank `/* … *\/` comment text, preserving every offset.
 *
 * @returns {string} Same length, comment text replaced by spaces.
 */
export function stripCssComments(css) {
  const text = String(css ?? '');
  let out = '';
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('/*', index);
    if (open === -1) return out + text.slice(index);
    out += text.slice(index, open);
    const close = text.indexOf('*/', open + 2);
    const end = close === -1 ? text.length : close + 2;
    for (let scan = open; scan < end; scan += 1) out += text[scan] === '\n' ? '\n' : ' ';
    index = end;
  }
  return out;
}

/**
 * The CSS a single file contributes, offsets intact.
 *
 * @param {string} file Repo-relative path, used only to pick the extraction rule.
 * @param {string} source The file's text.
 * @returns {string} Comment-stripped CSS, positionally identical to `source`.
 */
export function styleTextFor(file, source) {
  const css = file.endsWith('.svelte') ? maskNonStyleRegions(source) : source;
  return stripCssComments(css);
}

/** Every shipped stylesheet as `{ repo-relative path: CSS text }`, in code-point path order. */
export function collectStyleCorpus({
  roots = STYLE_CORPUS_ROOTS,
  extensions = STYLE_CORPUS_EXTENSIONS,
} = {}) {
  const corpus = {};
  for (const [file, source] of Object.entries(collectWorkingTreeSources([...roots], [...extensions]))) {
    const css = styleTextFor(file, source);
    if (css.trim().length > 0) corpus[file] = css;
  }
  return corpus;
}

/** Zero-based newline offsets, so an index can become a line number without re-slicing. */
function newlineOffsets(text) {
  const offsets = [];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    offsets.push(index);
  }
  return offsets;
}

/** The 1-based line holding `index`, by binary search over `offsets`. */
function lineAt(offsets, index) {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (offsets[middle] < index) low = middle + 1;
    else high = middle;
  }
  return low + 1;
}

/**
 * Every `property: value` declaration in one file's CSS.
 *
 * @param {string} file Repo-relative path, echoed onto each record.
 * @param {string} css Comment-stripped, offset-preserving CSS.
 */
export function declarationsIn(file, css) {
  const offsets = newlineOffsets(css);
  const found = [];
  DECLARATION.lastIndex = 0;
  for (let match = DECLARATION.exec(css); match !== null; match = DECLARATION.exec(css)) {
    found.push({
      file,
      line: lineAt(offsets, match.index + match[0].indexOf(match[1])),
      property: match[1],
      value: match[2].trim(),
    });
  }
  return found;
}

/** Every custom property DEFINITION in the corpus, as `name -> distinct value texts`. */
function addDefinition(definitions, name, value) {
  const existing = definitions.get(name);
  if (!existing) {
    definitions.set(name, [value]);
    return;
  }
  if (!existing.includes(value)) existing.push(value);
}

export function collectCustomProperties(corpus) {
  const definitions = new Map();
  for (const [file, css] of Object.entries(corpus)) {
    for (const declaration of declarationsIn(file, css)) {
      if (!declaration.property.startsWith('--')) continue;
      addDefinition(definitions, declaration.property, declaration.value);
    }
  }
  return definitions;
}

/**
 * `collectCustomProperties` re-parses every declaration in the corpus, so a caller that scans
 * several times over one corpus pays a full pass each time.
 */
const definitionCache = new WeakMap();

function definitionsFor(corpus) {
  const held = definitionCache.get(corpus);
  if (held !== undefined) return held;
  const definitions = collectCustomProperties(corpus);
  definitionCache.set(corpus, definitions);
  return definitions;
}

/**
 * Every index in `text` holding a comma that separates TOP-LEVEL items — one outside `()`, outside
 * `[]` and outside a quoted string. Nesting is the whole reason this exists rather than
 * `String#split(',')`.
 *
 * @returns {number[]} Ascending indexes; empty when the text holds no top-level comma.
 */
function topLevelCommas(text) {
  const indexes = [];
  let parentheses = 0;
  let brackets = 0;
  let quote = null;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (character === '\\') index += 1;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses = Math.max(0, parentheses - 1);
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets = Math.max(0, brackets - 1);
    else if (character === ',' && parentheses === 0 && brackets === 0) indexes.push(index);
  }
  return indexes;
}

/** The first top-level comma, or -1 — the single cut cutting `var(--a, F)` into name and fallback. */
function topLevelComma(text) {
  const [first] = topLevelCommas(text);
  return first ?? -1;
}

/**
 * A selector LIST split into the individual selectors the cascade applies SEPARATELY.
 *
 * @param {string} selector A rule's whole selector list, as `rulesIn`-style callers report it.
 * @returns {string[]} Each item, trimmed, in source order.
 */
export function splitSelectorList(selector) {
  const items = [];
  let start = 0;
  for (const cut of [...topLevelCommas(selector), selector.length]) {
    items.push(selector.slice(start, cut).trim());
    start = cut + 1;
  }
  return items;
}

/**
 * Every RULE in one comment-stripped stylesheet, as `{ selector, body, line }` (issue 1497).
 *
 * @param {string} css Comment-stripped CSS, offsets intact — from {@link styleTextFor}.
 */
export function rulesIn(css) {
  const rules = [];
  const stack = [];
  let prelude = '';
  let preludeStarted = false;
  let line = 1;
  let preludeLine = 1;
  for (let index = 0; index < css.length; index += 1) {
    const character = css[index];
    if (character === '\n') line += 1;
    if (character === '{') {
      const trimmed = prelude.trim().replace(/\s+/gu, ' ');
      stack.push({ selector: trimmed, start: index + 1, line: preludeLine });
      prelude = '';
      preludeStarted = false;
      preludeLine = line;
      continue;
    }
    if (character === '}') {
      const open = stack.pop();
      if (open && !open.selector.startsWith('@')) {
        rules.push({ selector: open.selector, body: css.slice(open.start, index), line: open.line });
      }
      prelude = '';
      preludeStarted = false;
      preludeLine = line;
      continue;
    }
    if (character === ';' && stack.length === 0) {
      prelude = '';
      preludeStarted = false;
      preludeLine = line;
      continue;
    }
    if (!preludeStarted && !/\s/u.test(character)) {
      preludeStarted = true;
      preludeLine = line;
    }
    prelude += character;
  }
  return rules;
}

/** The index just past the `)` that closes the `(` at or after `from`, or -1 when nothing does. */
function closingParenthesis(text, from) {
  let depth = 0;
  for (let scan = from; scan < text.length; scan += 1) {
    if (text[scan] === '(') depth += 1;
    else if (text[scan] === ')') {
      depth -= 1;
      if (depth === 0) return scan + 1;
    }
  }
  return -1;
}

/**
 * Every `var()` call in `text` that is not nested inside another one, with its name and its
 * fallback.
 */
export function varReferencesIn(text) {
  const references = [];
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf('var(', index);
    if (start === -1) break;
    if (start > 0 && /[\w-]/.test(text[start - 1])) {
      index = start + 4;
      continue;
    }
    const end = closingParenthesis(text, start + 3);
    if (end === -1) break;
    const inner = text.slice(start + 4, end - 1);
    const comma = topLevelComma(inner);
    references.push({
      start,
      end,
      name: (comma === -1 ? inner : inner.slice(0, comma)).trim(),
      fallback: comma === -1 ? null : inner.slice(comma + 1).trim(),
    });
    index = end;
  }
  return references;
}

/** Every text one reference may stand for, or `null` when nothing in the corpus defines it. */
function substitutionsFor(reference, definitions) {
  const options = new Set(definitions.get(reference.name));
  if (reference.fallback !== null) options.add(reference.fallback);
  return options.size === 0 ? null : [...options];
}

/** Substitute every top-level reference in `text` once, in all combinations. */
function expandOnce(text, definitions) {
  const references = varReferencesIn(text);
  if (references.length === 0) return [];
  let combinations = [[]];
  for (const reference of references) {
    const options = substitutionsFor(reference, definitions) ?? [text.slice(reference.start, reference.end)];
    combinations = combinations.flatMap((prefix) => options.map((option) => [...prefix, option]));
    if (combinations.length > MAX_VALUE_CANDIDATES) {
      throw new Error(
        `resolving "${text}" produced more than ${MAX_VALUE_CANDIDATES} candidate texts. That is ` +
          'a corpus this scanner was not sized for, not a pass: truncating the candidate set ' +
          'would make the scan answer "no banned value here" for the wrong reason. Raise ' +
          'MAX_VALUE_CANDIDATES deliberately, or narrow what the caller scans.'
      );
    }
  }
  return combinations.map((combination) => {
    let out = '';
    let cursor = 0;
    for (const [position, reference] of references.entries()) {
      out += text.slice(cursor, reference.start) + combination[position];
      cursor = reference.end;
    }
    return out + text.slice(cursor);
  });
}

/**
 * Expand every text in `frontier` once, returning only the results `candidates` had not already
 * seen — and adding them to it.
 *
 * @param {Set<string>} candidates Mutated in place.
 */
function expandFrontier(frontier, definitions, candidates) {
  const fresh = [];
  for (const text of frontier) {
    for (const produced of expandOnce(text, definitions)) {
      if (candidates.has(produced)) continue;
      candidates.add(produced);
      fresh.push(produced);
    }
  }
  return fresh;
}

/**
 * Every text `value` may stand for, INCLUDING `value` itself, resolving `var()` to a fixed point.
 *
 * @param {string} value A declaration's raw value text.
 * @param {Map<string, string[]>} definitions From {@link collectCustomProperties}.
 */
export function resolveValueCandidates(value, definitions, { maxDepth = MAX_VAR_CHAIN_DEPTH } = {}) {
  const candidates = new Set([value]);
  let frontier = [value];
  let depth = 0;
  while (frontier.length > 0) {
    if (depth >= maxDepth) return { candidates: [...candidates], depth, capReached: true };
    const fresh = expandFrontier(frontier, definitions, candidates);
    if (fresh.length === 0) break;
    depth += 1;
    frontier = fresh;
  }
  return { candidates: [...candidates], depth, capReached: false };
}

/** Every pixel literal in `text`, as numbers. */
export function pixelValuesIn(text) {
  const values = [];
  PIXEL_LITERAL.lastIndex = 0;
  for (
    let match = PIXEL_LITERAL.exec(text);
    match !== null;
    match = PIXEL_LITERAL.exec(text)
  ) {
    values.push(Number(match[1]));
  }
  return values;
}

/**
 * For each wanted pixel value that any candidate carries, the SHORTEST candidate carrying it.
 *
 * @returns {Array<[number, string]>} ascending by value.
 */
function shortestCarriers(candidates, accept) {
  const carriers = new Map();
  for (const candidate of candidates) {
    for (const pixels of pixelValuesIn(candidate)) {
      if (!accept(pixels)) continue;
      const held = carriers.get(pixels);
      if (held === undefined || candidate.length < held.length) carriers.set(pixels, candidate);
    }
  }
  return [...carriers].sort((left, right) => left[0] - right[0]);
}

/** The key a property name is MATCHED on, which is not the name it is REPORTED under. */
function propertyKey(name) {
  return name.startsWith('--') ? name : name.toLowerCase();
}

/**
 * Scan a corpus for declarations of `properties` carrying a pixel value `accept` wants, through
 * `var()`.
 *
 * @param {Record<string, string>} options.corpus From {@link collectStyleCorpus}.
 * @param {readonly string[]} options.properties Properties to scan, e.g. `['height']`.
 * @param {(pixels: number) => boolean} options.accept Which pixel values are findings.
 * @param {(name: string) => boolean} [options.opaqueProperty] Custom properties NOT substituted.
 * @returns {{ occurrences: Array<{file: string, line: number, property: string, value: number, raw:
 * string, resolved: string}>, declarations: Array<{file: string, line: number, property: string,
 * value: string}>, maxDepth: number, capReached: string[], }} `occurrences` holds one entry per
 * (declaration, matched value) pair; `resolved` is the shortest candidate text actually carrying
 * the value, which for an indirect hit is a text the source line does not contain.
 */
export function scanPixelDeclarations({
  corpus,
  properties,
  accept,
  opaqueProperty,
  maxDepth = MAX_VAR_CHAIN_DEPTH,
}) {
  const wanted = new Set([...properties].map(propertyKey));
  const visible = definitionsFor(corpus);
  const definitions =
    opaqueProperty === undefined
      ? visible
      : new Map([...visible].filter(([name]) => !opaqueProperty(name)));
  const declarations = [];
  const occurrences = [];
  const capReached = [];
  let observedDepth = 0;

  for (const [file, css] of Object.entries(corpus)) {
    for (const declaration of declarationsIn(file, css)) {
      if (!wanted.has(propertyKey(declaration.property))) continue;
      declarations.push(declaration);
      const resolution = resolveValueCandidates(declaration.value, definitions, { maxDepth });
      observedDepth = Math.max(observedDepth, resolution.depth);
      if (resolution.capReached) capReached.push(`${file}:${declaration.line}`);
      for (const [value, resolved] of shortestCarriers(resolution.candidates, accept)) {
        occurrences.push({
          file,
          line: declaration.line,
          property: declaration.property,
          value,
          raw: declaration.value,
          resolved,
        });
      }
    }
  }

  return { occurrences, declarations, maxDepth: observedDepth, capReached };
}

/**
 * Scan a corpus for declarations of `properties` carrying any of `values` in pixels, through
 * `var()`.
 *
 * @param {Record<string, string>} options.corpus From {@link collectStyleCorpus}.
 * @param {readonly string[]} options.properties Properties to scan, e.g. `['height']`.
 * @param {readonly number[]} options.values Pixel values to find, e.g. `[32, 36, 40]`.
 */
export function scanPixelValues({ corpus, properties, values, maxDepth = MAX_VAR_CHAIN_DEPTH }) {
  const banned = new Set(values);
  return scanPixelDeclarations({
    corpus,
    properties,
    accept: (pixels) => banned.has(pixels),
    maxDepth,
  });
}
