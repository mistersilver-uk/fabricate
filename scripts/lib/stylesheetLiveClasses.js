/**
 * Which classes `styles/fabricate.css` still has a customer for, and which rule blocks do not.
 *
 * WHY THIS EXISTS. `styles/fabricate.css` is a 26k-line global sheet that has outlived several
 * generations of markup, so a large share of it targets class names nothing emits any more. A rule
 * that matches no element cannot move a pixel, which makes deleting it the one CSS change with no
 * visual risk — but only if "matches no element" is decided mechanically rather than by eye. This
 * module is that decision, and it is shared: issue 1498 deletes the dead blocks with it, and
 * `tests/styles-dead-classes.test.js` re-runs the same functions on every `npm test` so the set
 * cannot grow back.
 *
 * ── WHY IT DOES NOT READ `collectStyleCorpus` ────────────────────────────────────────────────
 * `tests/helpers/styleBlockScan.js` walks `.svelte`, `.css` and `.scss`. That is right for a
 * DECLARATION scan and wrong for this one: 115 `class="…"` sites and every `classes:` array on the
 * `src/ui/*.svelte.js` application shells live in `.js` files, and a live-class set that cannot see
 * them would report the classes those shells put on real Foundry windows as dead. So the source
 * side walks `src` itself, at `.js`, `.mjs` and `.svelte`. The SHEET side does reuse that helper —
 * `stripCssComments` and `splitSelectorList` — because a hand-rolled `String#split(',')` shreds
 * `:is([type="text"], [type="number"])` into two fragments, the second of which is not a selector.
 *
 * ── THE FOUR LIVENESS RULES ──────────────────────────────────────────────────────────────────
 * 1. LITERAL TOKENS. Every identifier-shaped run inside a string literal, a template literal's
 *    static text, a `class="…"` attribute, a `class:x` directive or a `:global(.x)` selector is a
 *    live class name. Comments are stripped FIRST, per region, so a class named only in prose is
 *    not live — `Stepper.svelte` names `manager-checks-outcome-row` in a `<style>` comment and must
 *    not thereby keep it alive.
 * 2. CONSTRUCTED CLASSES. A class attribute holding an interpolation is expanded: module-level
 *    `const` strings and frozen string maps that the interpolation reaches are substituted, so
 *    `${GM_CARD_BLOCK}__label` becomes a literal and `${block}__section` becomes both chat blocks.
 *    Every static fragment of the token ALSO becomes a WILDCARD AT ITS OWN POSITION — a prefix
 *    matches sheet classes starting with it, a suffix those ending with it, an infix those
 *    containing it. That positional rule is not decoration: the chat cards build `${block}__section`
 *    with the dynamic part FIRST, and a prefix-only rule would have called 15 live
 *    `fabricate-craft-chat__*` classes dead with no View Lab frame able to show it. A token that is
 *    nothing but a hole contributes NO wildcard — it would match the entire sheet — and is reported
 *    by {@link buildLiveClassSet} for manual disposition instead.
 * 3. FOUNDRY CORE CLASSES. Names Foundry itself puts in the DOM are live by the explicit
 *    {@link FOUNDRY_CORE_CLASSES} allow-list. The gate checks the list back against the sheet so it
 *    cannot drift into naming classes the sheet no longer styles.
 * 4. STATE CLASSES. An `is-`/`has-` class is never widened by a positional wildcard: one
 *    `is-${state}` site would otherwise license every `.is-*` rule in the sheet. It is live either
 *    as a literal, or through a base class BESIDE it that some site writes a dynamic state class
 *    onto — which is what keeps `.manager-danger-tag-pill.is-hazardous` alive from
 *    `class={`manager-danger-tag-pill is-${tag}`}` without licensing anything else.
 *
 * ── WHY RESOLUTION IS ADDITIVE, NEVER SUBSTITUTIVE ───────────────────────────────────────────
 * A resolved hole contributes its values AND still contributes its hole. That is not caution for
 * its own sake; it is a measured defect. `is-${count === 'warnings' ? 'warning' : count}` reaches
 * two string literals, both of them COMPARISON operands rather than values, and a resolver that
 * treated them as the answer condemned the live `.manager-recipe-rail-count.is-passing` and
 * `.is-blocking` rules — `count` runs over `['passing', 'warnings', 'blocking']`. Nothing short of
 * evaluating the expression can tell a comparison operand from a value, so the hole survives its
 * own resolution and the wildcard covers what the resolver could not see.
 *
 * A rule block is dead only when EVERY selector in its list is dead, and a selector is dead when
 * any of its compounds names a class that is not live. One live selector keeps the whole block.
 */

import { collectWorkingTreeSources, stripComments } from '../../tests/helpers/sourceScan.js';
import { splitSelectorList, stripCssComments } from '../../tests/helpers/styleBlockScan.js';

/** The roots whose text decides liveness. Only `src` ships; nothing else emits a class. */
export const LIVE_CLASS_SOURCE_ROOTS = Object.freeze(['src']);

/** The extensions walked under {@link LIVE_CLASS_SOURCE_ROOTS}. `.js` is the load-bearing one. */
export const LIVE_CLASS_SOURCE_EXTENSIONS = Object.freeze(['.js', '.mjs', '.svelte']);

/**
 * Class names Foundry VTT emits into the DOM around, or inside, a Fabricate application.
 *
 * These are live by fiat because no Fabricate source file writes them: core's `ApplicationV2`
 * frame, its form and dialog partials, and its grid helpers do. The list is deliberately EXPLICIT
 * rather than a prefix negation, so adding to it is a visible edit, and
 * `tests/styles-dead-classes.test.js` fails when an entry no longer has a selector in the sheet —
 * which is what stops it from silently becoming a place to park a name and move on.
 */
export const FOUNDRY_CORE_CLASSES = Object.freeze([
  'checkbox-label',
  'dialog-buttons',
  'form-footer',
  'form-group',
  'hint',
  'span-2',
  'window-content',
]);

/**
 * The marker standing in for an interpolation whose value could not be resolved.
 *
 * A control character rather than a printable one, because an expanded attribute value is split on
 * whitespace afterwards: a marker that could occur inside a class name would invent a token, and a
 * marker that split as whitespace would lose the POSITION the wildcard rule is named for.
 */
const HOLE = '\u{0}';

/** Identifier-shaped runs, which is the shape every CSS class name in this repository has. */
const IDENTIFIER_RUN = /[A-Za-z_][\w-]*/gu;

/** A `class` attribute, in markup or inside an HTML template literal. */
const CLASS_ATTRIBUTE = /(?<![\w-])class\s*=\s*/gu;

/** A Svelte `class:name` directive; the directive's name IS the class. */
const CLASS_DIRECTIVE = /(?<![\w-])class:([A-Za-z_][\w-]*)/gu;

/** A `:global(.name)` escape hatch in a Svelte scoped style. */
const GLOBAL_SELECTOR = /:global\(\s*\.([A-Za-z_][\w-]*)/gu;

/** A `const`/`let`/`var` binding, captured for {@link constantDefinitions}. */
const BINDING = /(?:^|[;{})\s])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/gu;

/** A quoted string literal, spelled once so the equality pattern below can reuse it. */
const QUOTED = '(?:\'[^\']*\'|"[^"]*")';

/**
 * A string literal that is an OPERAND of an equality test, not a value the expression yields.
 *
 * `is-${count === 'warnings' ? 'warning' : count}` reaches three string literals and only two of
 * them are candidate values; the third is what `count` is being COMPARED to. Harvesting it built
 * `is-warnings`, a class that is never written. Blanking the comparison before the literal sweep
 * removes that whole family of false candidates, and it removes nothing real: a value is not
 * spelled on the left of an equality operator.
 */
const EQUALITY_OPERAND = new RegExp(
  String.raw`(?:[!=]==?\s*${QUOTED})|(?:${QUOTED}\s*[!=]==?)`,
  'gu'
);
/** A quoted string literal, for the catch-all literal channel. */
const STRING_LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/gu;

/** A class token in a selector: a dot followed by a name, with the dot dropped. */
const CLASS_TOKEN = /\.(-?[A-Za-z_][\w-]*)/gu;

/** The three characters that open a JavaScript string, for the two delimiter scanners. */
const QUOTE_CHARACTERS = new Set(["'", '"', '`']);

/** Where a selector's compounds end: a descendant space or an explicit combinator. */
const COMBINATOR = new Set([' ', '\t', '\n', '\r', '>', '+', '~']);

/** Functional pseudo-classes whose arguments are not evidence about their own compound. */
const FUNCTIONAL_PSEUDO = /:(?:is|not|where|has|matches|any)\(/iu;

/** Fragments too short, or too generic, to be usable as a wildcard. See rule 2 and rule 4. */
const MIN_WILDCARD_FRAGMENT = 3;

/** State-class prefixes; rule 4 governs these and rule 2's wildcard never does. */
const STATE_PREFIXES = Object.freeze(['is-', 'has-']);

/** How many patterns one attribute value may expand to before its holes are kept as holes. */
const MAX_PATTERN_EXPANSION = 512;

/** How deep constant resolution follows one identifier into another. */
const MAX_RESOLUTION_DEPTH = 6;

/**
 * Blank a source file's comments, PER REGION, preserving every offset.
 *
 * Per region rather than per line, because the three comment syntaxes this repository writes are
 * not interchangeable and applying the wrong one eats real code. Two slashes are not a comment
 * delimiter in Svelte markup, so a line reading `<a class="manager-link" href="https://x">` loses
 * its class to a JavaScript stripper, and a `url(https://x)` in a `<style>` block loses the same
 * way. So markup gets HTML comments only, `<script>` gets the JavaScript stripper, and `<style>`
 * gets the CSS one.
 *
 * @param {string} file Repo-relative path; only its extension is read.
 * @param {string} source The file's text.
 * @returns {string} The text with comment characters replaced by spaces, offsets intact.
 */
export function stripSourceComments(file, source) {
  const text = String(source ?? '');
  if (!file.endsWith('.svelte')) return stripComments(text);

  let out = blankHtmlComments(text);
  for (const region of embeddedRegions(out)) {
    const body = out.slice(region.start, region.end);
    const stripped = region.kind === 'style' ? stripCssComments(body) : stripComments(body);
    out = out.slice(0, region.start) + stripped + out.slice(region.end);
  }
  return out;
}

/**
 * Replace HTML comment runs with spaces, keeping newlines so line numbers survive.
 *
 * @param {string} text
 * @returns {string}
 */
function blankHtmlComments(text) {
  let out = '';
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf('<!--', index);
    if (open === -1) return out + text.slice(index);
    out += text.slice(index, open);
    const close = text.indexOf('-->', open + 4);
    const end = close === -1 ? text.length : close + 3;
    for (let scan = open; scan < end; scan += 1) out += text[scan] === '\n' ? '\n' : ' ';
    index = end;
  }
  return out;
}

/**
 * The `<script>` and `<style>` bodies of a Svelte file, as `{kind, start, end}` spans.
 *
 * @param {string} text
 * @returns {Array<{kind: string, start: number, end: number}>}
 */
function embeddedRegions(text) {
  const regions = [];
  for (const kind of ['script', 'style']) {
    const open = new RegExp(String.raw`<${kind}\b[^<>]*>`, 'gu');
    for (let match = open.exec(text); match; match = open.exec(text)) {
      const start = match.index + match[0].length;
      const close = text.indexOf(`</${kind}>`, start);
      regions.push({ kind, start, end: close === -1 ? text.length : close });
    }
  }
  return regions;
}

/**
 * Every source file whose text decides liveness, as `{ repo-relative path: text }`.
 *
 * @returns {Record<string, string>}
 */
export function collectLiveClassSources() {
  return collectWorkingTreeSources([...LIVE_CLASS_SOURCE_ROOTS], [...LIVE_CLASS_SOURCE_EXTENSIONS]);
}

/**
 * The index of the quote closing the string literal that opens at `from`.
 *
 * The two delimiter scanners below — {@link matchingDelimiter} and {@link statementEnd} — each ran
 * their own copy of this loop, differing only in what they counted OUTSIDE a string. Shared so the
 * escape rule is stated once: a backslash consumes the next character whatever it is, which is what
 * stops `'it{s'` and `"a;b"` from being read as structure.
 *
 * Callers pass the index of the opening quote and assign the result back to their own cursor, whose
 * own increment then steps past the closer. An UNTERMINATED literal answers with the last index
 * rather than throwing, so the caller's loop still ends at `text.length` and reports the same
 * "ran off the end" answer it did before.
 *
 * @param {string} text
 * @param {number} from Index of the opening quote character.
 * @returns {number} The index of the closing quote, or the last index when there is none.
 */
function skipQuotedRun(text, from) {
  const quote = text[from];
  for (let scan = from + 1; scan < text.length; scan += 1) {
    if (text[scan] === '\\') scan += 1;
    else if (text[scan] === quote) return scan;
  }
  return text.length - 1;
}

/**
 * The index just past the delimiter closing the one that opens at `from`.
 *
 * Quote-aware and nesting-aware, so a brace inside a string and a nested object literal both close
 * where they should.
 *
 * @param {string} text
 * @param {number} from Index of the opening delimiter.
 * @param {string} open
 * @param {string} close
 * @returns {number} The index just past the matching delimiter, or `text.length`.
 */
function matchingDelimiter(text, from, open, close) {
  let depth = 0;
  for (let scan = from; scan < text.length; scan += 1) {
    const character = text[scan];
    if (QUOTE_CHARACTERS.has(character)) {
      scan = skipQuotedRun(text, scan);
      continue;
    }
    if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return scan + 1;
    }
  }
  return text.length;
}

/**
 * The index of the backtick closing a template literal whose body starts at `from`.
 *
 * Written rather than delegated to {@link matchingDelimiter} because a template literal's opener
 * and closer are the SAME character, so there is no depth to count: what has to be skipped instead
 * is a backslash escape and a whole substitution, which may itself contain a nested template.
 *
 * @param {string} text
 * @param {number} from Index just past the opening backtick.
 * @returns {number} The index of the closing backtick, or `text.length`.
 */
function templateLiteralEnd(text, from) {
  for (let scan = from; scan < text.length; scan += 1) {
    const character = text[scan];
    if (character === '\\') scan += 1;
    else if (character === '$' && text[scan + 1] === '{') {
      scan = matchingDelimiter(text, scan + 1, '{', '}') - 1;
    } else if (character === '`') return scan;
  }
  return text.length;
}

/**
 * The index of the quote closing an attribute value whose body starts at `from`.
 *
 * An interpolation is skipped whole, so an attribute whose expression contains the same quote
 * character ends at its own closing quote rather than at the one inside that expression.
 *
 * @param {string} text
 * @param {number} from Index just past the opening quote.
 * @param {string} quote The opening quote character.
 * @returns {number} The index of the closing quote, or `text.length`.
 */
function quotedValueEnd(text, from, quote) {
  for (let scan = from; scan < text.length; scan += 1) {
    const character = text[scan];
    if (character === '$' && text[scan + 1] === '{') {
      scan = matchingDelimiter(text, scan + 1, '{', '}') - 1;
    } else if (character === '{') scan = matchingDelimiter(text, scan, '{', '}') - 1;
    else if (character === quote) return scan;
  }
  return text.length;
}

/**
 * Split a quoted attribute value into its static parts and its interpolation expressions.
 *
 * Both interpolation syntaxes are read, because both spell a class in this repository: the
 * dollar-brace form in a JavaScript template literal (`CraftingChatCard.js`) and the bare-brace
 * form in Svelte markup.
 *
 * @param {string} value The raw text between the attribute's quotes.
 * @returns {{parts: string[], holes: string[]}} `parts.length === holes.length + 1`.
 */
function splitInterpolations(value) {
  const parts = [];
  const holes = [];
  let literal = '';
  let index = 0;
  while (index < value.length) {
    const dollar = value[index] === '$' && value[index + 1] === '{';
    if (dollar || value[index] === '{') {
      const open = dollar ? index + 1 : index;
      const end = matchingDelimiter(value, open, '{', '}');
      parts.push(literal);
      holes.push(value.slice(open + 1, end - 1));
      literal = '';
      index = end;
      continue;
    }
    literal += value[index];
    index += 1;
  }
  parts.push(literal);
  return { parts, holes };
}

/**
 * Every `class=` value in one file, as a `{parts, holes}` template.
 *
 * A braced `class={expr}` form contributes the string and template literals INSIDE `expr`, which is
 * how a ternary of two string literals and a template literal both reach the same expansion path as
 * a quoted attribute.
 *
 * @param {string} text Comment-stripped source.
 * @returns {Array<{parts: string[], holes: string[]}>}
 */
function classAttributeTemplates(text) {
  const templates = [];
  CLASS_ATTRIBUTE.lastIndex = 0;
  for (let match = CLASS_ATTRIBUTE.exec(text); match; match = CLASS_ATTRIBUTE.exec(text)) {
    const at = match.index + match[0].length;
    const opener = text[at];
    if (opener === '"' || opener === "'") {
      templates.push(splitInterpolations(text.slice(at + 1, quotedValueEnd(text, at + 1, opener))));
    } else if (opener === '{') {
      const end = matchingDelimiter(text, at, '{', '}');
      templates.push(...quotedTemplatesIn(text.slice(at + 1, end - 1)));
    }
  }
  return templates;
}

/**
 * The string and template literals inside an expression, each as a `{parts, holes}` template.
 *
 * @param {string} expression
 * @returns {Array<{parts: string[], holes: string[]}>}
 */
function quotedTemplatesIn(expression) {
  const templates = [];
  let index = 0;
  while (index < expression.length) {
    const character = expression[index];
    if (character === "'" || character === '"') {
      const close = expression.indexOf(character, index + 1);
      const end = close === -1 ? expression.length : close;
      templates.push({ parts: [expression.slice(index + 1, end)], holes: [] });
      index = end + 1;
      continue;
    }
    if (character === '`') {
      const end = templateLiteralEnd(expression, index + 1);
      templates.push(splitInterpolations(expression.slice(index + 1, end)));
      index = end + 1;
      continue;
    }
    index += 1;
  }
  return templates;
}

/**
 * The right-hand sides of every binding in one file, keyed by name.
 *
 * Several right-hand sides per name are kept rather than the last one winning: a name bound twice
 * in one module has two candidate values and both are evidence.
 *
 * @param {string} text Comment-stripped source.
 * @returns {Map<string, string[]>}
 */
function constantDefinitions(text) {
  const definitions = new Map();
  BINDING.lastIndex = 0;
  for (let match = BINDING.exec(text); match; match = BINDING.exec(text)) {
    const start = match.index + match[0].length;
    const rhs = text.slice(start, statementEnd(text, start));
    const existing = definitions.get(match[1]);
    if (existing) existing.push(rhs);
    else definitions.set(match[1], [rhs]);
  }
  return definitions;
}

/**
 * The index of the semicolon or closing bracket ending the statement that starts at `from`.
 *
 * @param {string} text
 * @param {number} from
 * @returns {number}
 */
function statementEnd(text, from) {
  let depth = 0;
  for (let scan = from; scan < text.length; scan += 1) {
    const character = text[scan];
    if (QUOTE_CHARACTERS.has(character)) {
      scan = skipQuotedRun(text, scan);
      continue;
    }
    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) {
      if (depth === 0) return scan;
      depth -= 1;
    } else if (character === ';' && depth === 0) return scan;
  }
  return text.length;
}

/**
 * The bare identifiers an expression names, with quoted text removed first.
 *
 * @param {string} expression
 * @returns {string[]}
 */
function identifiersIn(expression) {
  const bare = expression.replaceAll(STRING_LITERAL, ' ').replaceAll(/`[^`]*`/gu, ' ');
  return [...bare.matchAll(/[A-Za-z_$][\w$]*/gu)].map((match) => match[0]);
}

/**
 * The string values one expression can take, as patterns in which {@link HOLE} marks a part that
 * could not be resolved.
 *
 * Deliberately a UNION over everything the expression reaches rather than an evaluation of it: the
 * shapes that build a class here are a ternary, a frozen-map lookup and an `Object.hasOwn` guard,
 * and a union answers all three without a parser. It is a union of CANDIDATES, never a claim to
 * exhaustiveness — see the module note on why the hole survives its own resolution.
 *
 * A frozen map needs no entry parser of its own, and issue 1498 shipped one anyway: a `key: 'value'`
 * matcher that no mutation could red, because {@link quotedTemplatesIn} sweeps EVERY quoted run of
 * the expression first. `{ craft: 'lambda-chat' }` therefore yields its value through the same
 * channel a bare string literal takes, and the matcher could only re-add a subset of that. Do not
 * reintroduce it to keep a quoted KEY out of the union either: it never removed anything, it only
 * added, so the keys were candidates with it in place too.
 *
 * @param {string} expression
 * @param {Map<string, string[]>} definitions
 * @param {Set<string>} seen Identifiers already being resolved, so a cycle terminates.
 * @param {number} depth
 * @returns {Set<string>} Empty when nothing in the expression could be resolved.
 */
function resolvePatterns(expression, definitions, seen, depth = 0) {
  const patterns = new Set();
  if (depth > MAX_RESOLUTION_DEPTH) return patterns;
  const candidateText = expression.replaceAll(EQUALITY_OPERAND, ' ');
  for (const template of quotedTemplatesIn(candidateText)) {
    for (const pattern of expandTemplate(template, definitions, seen, depth + 1)) {
      patterns.add(pattern);
    }
  }
  for (const name of identifiersIn(expression)) {
    if (seen.has(name)) continue;
    seen.add(name);
    for (const rhs of definitions.get(name) ?? []) {
      for (const pattern of resolvePatterns(rhs, definitions, seen, depth + 1))
        patterns.add(pattern);
    }
    seen.delete(name);
  }
  return patterns;
}

/**
 * Substitute a template's holes with everything they can resolve to, AND with {@link HOLE}.
 *
 * Both, always. The hole is what the positional wildcard is derived from, and dropping it the
 * moment a resolution succeeds is what condemned two live rules; see the module note. The expansion
 * is capped, and a template that crosses {@link MAX_PATTERN_EXPANSION} keeps its remaining holes as
 * holes — which degrades to a wildcard rather than to an omission.
 *
 * @param {{parts: string[], holes: string[]}} template
 * @param {Map<string, string[]>} definitions
 * @param {Set<string>} seen
 * @param {number} depth
 * @returns {string[]} One pattern per combination.
 */
function expandTemplate(template, definitions, seen, depth = 0) {
  let patterns = [template.parts[0]];
  for (const [position, hole] of template.holes.entries()) {
    const resolved =
      depth > MAX_RESOLUTION_DEPTH ? new Set() : resolvePatterns(hole, definitions, seen, depth);
    const candidates = [HOLE, ...resolved];
    const fills =
      patterns.length * candidates.length <= MAX_PATTERN_EXPANSION ? candidates : [HOLE];
    const tail = template.parts[position + 1];
    patterns = patterns.flatMap((prefix) => fills.map((fill) => prefix + fill + tail));
  }
  return patterns;
}

/** Whether a class name is a state class, which rule 4 governs and rule 2 never widens. */
function isStateClass(name) {
  return STATE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Whether a static fragment may become a wildcard.
 *
 * The state prefixes are excluded BY NAME and not merely by length: rule 4 reserves state classes
 * to their own compound, and an `is-` prefix wildcard would license every `.is-*` rule in the sheet
 * from one dynamic state-class site. Short fragments are excluded for the same reason at less
 * extreme scale — a two-character prefix is not evidence about anything.
 *
 * @param {string} fragment
 * @returns {boolean}
 */
function isUsableFragment(fragment) {
  if (fragment.length < MIN_WILDCARD_FRAGMENT) return false;
  if (STATE_PREFIXES.includes(fragment)) return false;
  return /[A-Za-z]/u.test(fragment);
}

/**
 * Turn one whitespace-delimited token of an expanded class attribute into live evidence.
 *
 * @param {string} token
 * @param {{literals: Set<string>, wildcards: object[]}} sink
 */
function recordEvidence(token, sink) {
  if (!token.includes(HOLE)) {
    if (token.length > 0) sink.literals.add(token);
    return;
  }
  const fragments = token.split(HOLE);
  for (const [position, fragment] of fragments.entries()) {
    if (!isUsableFragment(fragment)) continue;
    let kind = 'infix';
    if (position === 0) kind = 'prefix';
    else if (position === fragments.length - 1) kind = 'suffix';
    sink.wildcards.push({ kind, fragment });
  }
}

/**
 * Record the co-occurrence that rule 4 needs: which base classes a dynamic state class lands on.
 *
 * A dynamic state token such as `is-${tag}` gets no wildcard, so on its own it is evidence for
 * nothing. But it is never written on its own: it is written BESIDE a literal base class in the
 * same attribute, and that pairing is exactly what the sheet's `.base.is-value` rules encode. So
 * `class={`manager-danger-tag-pill is-${tag}`}` opens `manager-danger-tag-pill` to any state class
 * and opens NOTHING else — which keeps the six danger-tier pills alive without licensing every
 * `.is-*` rule in the sheet.
 *
 * @param {string[]} tokens One expanded pattern's whitespace-delimited tokens.
 * @param {{stateOpen: Set<string>}} sink
 */
function recordStateOpening(tokens, sink) {
  const dynamicState = tokens.some(
    (token) => token.includes(HOLE) && STATE_PREFIXES.includes(token.split(HOLE)[0])
  );
  if (!dynamicState) return;
  for (const token of tokens) {
    if (!token.includes(HOLE) && token.length > 0 && !isStateClass(token))
      sink.stateOpen.add(token);
  }
}

/**
 * Record the class attributes whose interpolation contributes no positional evidence at all.
 *
 * Two shapes qualify, and both need a human: a token that is nothing but a hole, which as a wildcard
 * would match the whole sheet; and a hole behind a bare state prefix, which rule 4 forbids widening
 * for the same reason. The check runs against
 * the STRICT expansion — the one that keeps a hole only where resolution genuinely failed — so a
 * site whose value the resolver can name does not appear here.
 *
 * @param {{parts: string[], holes: string[]}} template
 * @param {Map<string, string[]>} definitions
 * @param {string} origin
 * @param {{dynamic: Set<string>}} sink
 */
function reportUnresolvedTokens(template, definitions, origin, sink) {
  const unresolved = template.holes.map(
    (hole) => resolvePatterns(hole, definitions, new Set()).size === 0
  );
  if (!unresolved.includes(true)) return;
  let pattern = template.parts[0];
  for (const [position, isUnresolved] of unresolved.entries()) {
    pattern += (isUnresolved ? HOLE : 'x') + template.parts[position + 1];
  }
  for (const token of pattern.split(/\s+/u)) {
    const fragments = token.split(HOLE);
    if (token.includes(HOLE) && fragments.every((fragment) => !isUsableFragment(fragment))) {
      sink.dynamic.add(origin);
    }
  }
}

/**
 * Harvest one file's live evidence into `sink`.
 *
 * @param {string} file
 * @param {string} source
 * @param {{literals: Set<string>, wildcards: object[], dynamic: Set<string>,
 *   stateOpen: Set<string>}} sink
 */
function harvestFile(file, source, sink) {
  const text = stripSourceComments(file, source);
  const definitions = constantDefinitions(text);

  for (const match of text.matchAll(STRING_LITERAL)) {
    for (const run of (match[1] ?? match[2] ?? '').matchAll(IDENTIFIER_RUN)) {
      sink.literals.add(run[0]);
    }
  }
  for (const match of text.matchAll(CLASS_DIRECTIVE)) sink.literals.add(match[1]);
  for (const match of text.matchAll(GLOBAL_SELECTOR)) sink.literals.add(match[1]);

  for (const template of classAttributeTemplates(text)) {
    for (const part of template.parts) {
      for (const run of part.matchAll(IDENTIFIER_RUN)) sink.literals.add(run[0]);
    }
    for (const pattern of expandTemplate(template, definitions, new Set())) {
      const tokens = pattern.split(/\s+/u);
      for (const token of tokens) recordEvidence(token, sink);
      recordStateOpening(tokens, sink);
    }
    const origin = `${file}: class="${template.parts.join('<dynamic>')}"`;
    reportUnresolvedTokens(template, definitions, origin, sink);
  }
}

/**
 * Order two strings by code point. Explicit because the default sort's comparator stringifies,
 * which SonarCloud flags, and `localeCompare` would make the order depend on the host locale.
 *
 * @param {string} left
 * @param {string} right
 * @returns {number} negative, zero or positive, per the `Array#sort` contract
 */
function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/** Collapse identical wildcards, so the report reads as a set and in a stable order. */
function dedupeWildcards(wildcards) {
  const seen = new Map();
  for (const wildcard of wildcards) seen.set(`${wildcard.kind} ${wildcard.fragment}`, wildcard);
  return [...seen.values()].sort((left, right) =>
    byCodePoint(`${left.kind} ${left.fragment}`, `${right.kind} ${right.fragment}`)
  );
}

/** Whether one positional wildcard admits `name`. */
function matchesWildcard(name, { kind, fragment }) {
  if (kind === 'prefix') return name.startsWith(fragment);
  if (kind === 'suffix') return name.endsWith(fragment);
  return name.includes(fragment);
}

/**
 * The live-class set: everything the source tree can put on an element, as a membership test.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.sources] `{ path: text }`; defaults to the working tree.
 * @param {readonly string[]} [options.coreClasses] Rule 3's allow-list.
 * @returns {{
 *   has: (name: string) => boolean,
 *   hasLiteral: (name: string) => boolean,
 *   literals: Set<string>,
 *   stateOpenBases: Set<string>,
 *   wildcards: Array<{kind: string, fragment: string}>,
 *   coreClasses: Set<string>,
 *   dynamicTokens: string[],
 * }}
 */
export function buildLiveClassSet({ sources, coreClasses = FOUNDRY_CORE_CLASSES } = {}) {
  const corpus = sources ?? collectLiveClassSources();
  const sink = { literals: new Set(), wildcards: [], dynamic: new Set(), stateOpen: new Set() };
  for (const [file, source] of Object.entries(corpus)) harvestFile(file, source, sink);

  const core = new Set(coreClasses);
  const wildcards = dedupeWildcards(sink.wildcards);
  return {
    literals: sink.literals,
    stateOpenBases: sink.stateOpen,
    wildcards,
    coreClasses: core,
    dynamicTokens: [...sink.dynamic].sort(byCodePoint),
    hasLiteral: (name) => sink.literals.has(name) || core.has(name),
    has(name) {
      if (sink.literals.has(name) || core.has(name)) return true;
      return wildcards.some((wildcard) => matchesWildcard(name, wildcard));
    },
  };
}

/**
 * Split a selector into its compounds, at top-level combinators only.
 *
 * Top level matters: a space inside a functional pseudo-class or an attribute value is not a
 * combinator, and splitting there would invent compounds that name classes nothing requires.
 *
 * @param {string} selector One item of a selector list.
 * @returns {string[]}
 */
export function compoundsOf(selector) {
  const compounds = [];
  let current = '';
  let parens = 0;
  let brackets = 0;
  for (const character of selector) {
    switch (character) {
      case '(': {
        parens += 1;
        break;
      }
      case ')': {
        parens -= 1;
        break;
      }
      case '[': {
        brackets += 1;
        break;
      }
      case ']': {
        {
          brackets -= 1;
          // No default
        }
        break;
      }
    }
    if (parens === 0 && brackets === 0 && COMBINATOR.has(character)) {
      if (current.trim().length > 0) compounds.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  if (current.trim().length > 0) compounds.push(current.trim());
  return compounds;
}

/** Blank the arguments of every functional pseudo-class in a compound. */
function stripFunctionalArguments(compound) {
  let out = '';
  let depth = 0;
  for (const character of compound) {
    if (character === '(') depth += 1;
    if (depth === 0) out += character;
    if (character === ')') depth -= 1;
  }
  return out;
}

/**
 * The class names one compound requires at its TOP level.
 *
 * Classes inside a functional pseudo-class are excluded, and that is a correctness point rather
 * than a simplification: a `:not()` argument is a class the element must NOT carry, so counting it
 * as a requirement would delete a rule that still matches every element it ever matched.
 *
 * @param {string} compound
 * @returns {string[]}
 */
export function compoundClasses(compound) {
  const bare = FUNCTIONAL_PSEUDO.test(compound) ? stripFunctionalArguments(compound) : compound;
  return [...bare.matchAll(CLASS_TOKEN)].map((match) => match[1]);
}

/**
 * The classes of one selector that are not live — empty when the selector still matches.
 *
 * @param {string} selector One item of a selector list.
 * @param {{has: (name: string) => boolean, hasLiteral?: (name: string) => boolean,
 *   stateOpenBases?: Set<string>}} liveSet
 * @returns {string[]}
 */
export function deadClassesIn(selector, liveSet) {
  const literalOnly = liveSet.hasLiteral ?? liveSet.has.bind(liveSet);
  const stateOpen = liveSet.stateOpenBases ?? new Set();
  const dead = [];
  for (const compound of compoundsOf(selector)) {
    const classes = compoundClasses(compound);
    const bases = classes.filter((name) => !isStateClass(name));
    for (const name of classes) {
      if (!isStateClass(name)) {
        if (!liveSet.has(name)) dead.push(name);
        continue;
      }
      // Rule 4. A state class answers to the LITERAL channel — no positional wildcard may widen it,
      // or the dynamic `is-` sites would license every `.is-*` rule in the sheet from one
      // interpolation — or to a base class beside it that some site writes a dynamic state class
      // onto. A compound with no base class at all (`strong.is-disabled`) has nothing to judge the
      // state against and is kept: deleting is the direction a later gate cannot undo.
      const viaBase = bases.length === 0 || bases.some((base) => stateOpen.has(base));
      if (!literalOnly(name) && !viaBase) dead.push(name);
    }
  }
  return dead;
}

/**
 * Every rule in a stylesheet, as `{selector, line, endLine, start, end}`.
 *
 * At-rules are containers, not rules: their prelude is a query, not a selector, so a block whose
 * prelude starts with an at sign is walked into and never reported. Offsets are into the ORIGINAL
 * text, since `stripCssComments` blanks in place.
 *
 * @param {string} css Raw stylesheet text.
 * @returns {Array<{selector: string, line: number, endLine: number, start: number, end: number}>}
 */
export function ruleBlocks(css) {
  const scan = stripCssComments(css);
  const rules = [];
  const stack = [];
  let prelude = '';
  let preludeStart = 0;
  let started = false;
  let line = 1;
  let preludeLine = 1;
  // A code-UNIT index loop, not `for…of`: every offset here is sliced back out of the ORIGINAL
  // `css` by the caller, and spreading a string iterates code POINTS, so one astral character
  // anywhere above a rule would shift every offset after it. `String#entries` does not exist at
  // all, which is how the autofixed form announced itself.
  // eslint-disable-next-line unicorn/no-for-loop -- see above: the index is the deliverable
  for (let index = 0; index < scan.length; index += 1) {
    const character = scan[index];
    if (character === '\n') line += 1;
    if (character === '{' || character === '}' || (character === ';' && stack.length === 0)) {
      if (character === '{') {
        const selector = prelude.trim().replaceAll(/\s+/gu, ' ');
        stack.push({ selector, start: preludeStart, line: preludeLine });
      } else if (character === '}') {
        const open = stack.pop();
        if (open && !open.selector.startsWith('@')) {
          rules.push({ ...open, endLine: line, end: index + 1 });
        }
      }
      prelude = '';
      started = false;
      continue;
    }
    if (!started && !/\s/u.test(character)) {
      started = true;
      preludeStart = index;
      preludeLine = line;
    }
    if (started) prelude += character;
  }
  return rules;
}

/**
 * Every class name the stylesheet declares a selector for.
 *
 * @param {string} css Raw stylesheet text.
 * @returns {Set<string>}
 */
export function declaredClasses(css) {
  const declared = new Set();
  for (const rule of ruleBlocks(css)) {
    for (const selector of splitSelectorList(rule.selector)) {
      for (const compound of compoundsOf(selector)) {
        for (const name of compoundClasses(compound)) declared.add(name);
      }
    }
  }
  return declared;
}

/**
 * The rule blocks whose every selector names a class nothing emits.
 *
 * "Every selector" is the whole point: one live item in a selector list keeps the block, because
 * deleting it would take styling away from an element that still exists. The blocks come back in
 * source order with the offsets a deletion needs and the class names that condemned them, so a
 * caller can both act on the answer and explain it.
 *
 * @param {string} css Raw stylesheet text.
 * @param {{has: (name: string) => boolean}} liveSet Anything answering `has`, including a `Set`.
 * @param {object} [options]
 * @param {(name: string) => boolean} [options.exempt] Classes to treat as live regardless.
 * @returns {Array<{selector: string, line: number, endLine: number, start: number, end: number,
 *   deadClasses: string[]}>}
 */
export function deadRuleBlocks(css, liveSet, { exempt = () => false } = {}) {
  // The exemption is layered over BOTH membership tests, and the rest of the live set is carried
  // through: a bare `{ has }` wrapper silently drops `hasLiteral` and `stateOpenBases`, which reads
  // as rule 4 being far stricter than it is and condemns six live danger-tier pills.
  const live = {
    ...liveSet,
    has: (name) => exempt(name) || liveSet.has(name),
    hasLiteral: (name) => exempt(name) || (liveSet.hasLiteral ?? liveSet.has).call(liveSet, name),
  };
  const dead = [];
  for (const rule of ruleBlocks(css)) {
    const perSelector = splitSelectorList(rule.selector).map((selector) =>
      deadClassesIn(selector, live)
    );
    if (perSelector.some((classes) => classes.length === 0)) continue;
    dead.push({ ...rule, deadClasses: [...new Set(perSelector.flat())].sort(byCodePoint) });
  }
  return dead;
}

/**
 * The offset a deletion should start at so the rule's own comment goes with it.
 *
 * Attached means DIRECTLY above, with at most one newline between the comment's end and the rule. A
 * comment separated by a blank line is a section banner describing the rules that follow, most of
 * which usually survive, so taking it would delete the surviving rules' documentation.
 *
 * @param {string} css Raw stylesheet text.
 * @param {number} start The rule's own start offset.
 * @returns {number} `start`, or the offset of the comment attached above it.
 */
export function attachedCommentStart(css, start) {
  let scan = start;
  let newlines = 0;
  while (scan > 0 && /\s/u.test(css[scan - 1])) {
    if (css[scan - 1] === '\n') newlines += 1;
    scan -= 1;
  }
  if (newlines > 1 || scan < 2 || css.slice(scan - 2, scan) !== '*/') return start;
  const open = css.lastIndexOf('/*', scan - 2);
  return open === -1 ? start : open;
}
