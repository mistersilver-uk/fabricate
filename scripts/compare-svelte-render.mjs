#!/usr/bin/env node
/**
 * Compare what every `src/**\/*.svelte` component RENDERS against a base ref.
 *
 * Written for the Prettier-formats-components change (issue 923) and kept for the reformat
 * follow-ups after it. A mechanical reformat is only safe if it is render-neutral, and neither
 * the test suite nor a source diff can tell you that: whitespace between elements is significant
 * in Svelte markup, whitespace inside an element's attribute list is not, and the source diff for
 * the two looks the same. So this compiles both sides and compares the compiler's own output.
 *
 * WHAT IS COMPARED, and why the static HTML alone is not enough
 * ------------------------------------------------------------
 * The obvious signal is the `$.from_html(...)` / `$.from_svg(...)` template each component builds
 * its static skeleton from. That signal alone is too narrow, and quietly so: a run of DYNAMIC
 * text is not part of it. Svelte compiles `{a}{b}` to a template literal assigned at runtime —
 *
 *     $.set_text(text_4, `${a ?? ''}${b ?? ''}`);
 *
 * — so a newline introduced between those two interpolations lands INSIDE that literal and never
 * touches `from_html`. Comparing only the static skeletons reports such a file as identical.
 * Sites in this repository drift exactly that way under Prettier, and the narrow comparison
 * cannot see any of them.
 *
 * This therefore collects, per component:
 *
 *   - `templates` — EVERY template literal in the generated module: static skeletons and runtime
 *     text/attribute/class/style literals alike.
 *   - `emissions` — every generated statement that writes to the DOM (`$.set_attribute`,
 *     `$.set_class`, `$.set_style`, `$.set_text`, `$.toggle_class`, `$.clsx`, direct
 *     `textContent`/`nodeValue` assignment, …). This is where a dynamic class, style or attribute
 *     expression drifts.
 *   - `css` — the compiled stylesheet, whitespace-normalised. Rewrapped CSS text is not a render
 *     change; a changed declaration is.
 *   - `code` — the whole generated module, normalised. A file that differs here while matching
 *     the three signals above is reported as `other`: a real difference, but not a render one.
 *
 * NORMALISATION — this is what separates signal from noise, and it is deliberate:
 *
 *   - Whitespace in CODE is removed where it is not lexically required (kept as one space only
 *     between two word characters). The code printer preserves some of the source's own line
 *     breaks, so without this every rewrapped call reads as a difference.
 *   - Whitespace in the TEXT of a template literal is preserved byte for byte. That is the whole
 *     signal: it is what reaches the DOM.
 *   - The CODE INSIDE a `${…}` interpolation is normalised recursively, because it is evaluated,
 *     not rendered.
 *   - Quoted strings are canonicalised to their VALUE. Prettier's `singleQuote` setting flips
 *     `'it\'s'` to `"it's"`, which changes the generated module without changing one byte of what
 *     the user sees.
 *   - Svelte's `svelte-<hash>` scoping class is masked. The hash derives from the component's
 *     style text, so reformatting a `<style>` block renames it consistently on both sides.
 *
 * ON READING THE RESULT. A reported `templates`/`emissions` drift means a whitespace text node
 * appears or disappears in the DOM. That is not automatically a bug: the repository already
 * ships that shape on `main` — `src/ui/svelte/apps/journal/ActionsPanel.svelte` compiles to a
 * newline between adjacent interpolations and renders correctly in real Foundry — which is
 * evidence that the `white-space` inherited at Fabricate's actual mount points collapses such a
 * run. Note the ground: it is that observation, NOT any claim that Svelte collapses the newline.
 * Svelte does not; the newline reaches the DOM, and CSS is what collapses it. Nor is the mount
 * point ours to control, so a `white-space` audit of this repository's own stylesheets cannot
 * settle it. What it IS, always, is a change no other gate in this repository can see, so it
 * wants an explicit look and, where it matters, a committed assertion.
 *
 * USAGE
 *   node scripts/compare-svelte-render.mjs [--base <ref>] [--json] [--fail-on-drift]
 *                                          [--filter <substring>]
 *
 *   --base <ref>      ref to compare against (default: origin/main)
 *   --filter <text>   only compare components whose path contains <text>
 *   --json            emit the full record as JSON instead of a summary
 *   --fail-on-drift   exit 1 when any render drift is found (default: report and exit 0)
 *
 * EXIT CODES. 2 is kept distinct from 1 so a caller can tell "could not compare" apart from
 * "compared, and found drift":
 *
 *   0   compared at least one component and found nothing blocking (or found drift, without
 *       `--fail-on-drift`)
 *   1   render drift, with `--fail-on-drift`
 *   2   the run could not compare — the base ref does not resolve, no component was compared, or
 *       a component failed to compile on either side
 *
 * A run that compares NOTHING is a failure here, not a pass. It used to be a pass, and silently:
 * `--base` naming an unresolvable ref made `readAtRef` report every component as absent from the
 * base, so the run printed `compared=0`, listed all ~240 components as `new`, and exited 0 EVEN
 * under `--fail-on-drift`. That is this script's own instance of the vacuous gate issue 923
 * exists to remove — a check reporting success while checking nothing. The CI shape is the
 * dangerous one: `actions/checkout` fetches a single commit by default, so `origin/main` — this
 * script's default base — is frequently absent there.
 */
import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileComponent } from './lib/svelteCompilerWarnings.js';
import { listSvelteComponents, toRepositoryPaths } from './lib/svelteComponentFiles.js';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

/** Generated statements that write to the DOM. A drift in one of these is a render difference. */
const EMISSION_ANCHORS = [
  '$.set_attribute',
  '$.set_attributes',
  '$.set_class',
  '$.set_svg_class',
  '$.set_style',
  '$.set_text',
  '$.set_value',
  '$.set_checked',
  '$.set_selected',
  '$.set_custom_element_data',
  '$.toggle_class',
  '$.clsx',
  '$.attr',
  '.textContent',
  '.nodeValue',
  '.innerHTML',
];

const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

/** Characters that open a run whose contents are opaque to the statement splitter. */
const LITERAL_DELIMITERS = new Set(["'", '"', '`']);

/** Characters that end a statement, at parenthesis depth 0. */
const STATEMENT_BREAKS = new Set([';', '{', '}']);

function parseArgs(argv) {
  const options = { base: 'origin/main', json: false, failOnDrift: false, filter: '' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case '--base': {
        options.base = argv[++index];
        break;
      }
      case '--filter': {
        options.filter = argv[++index];
        break;
      }
      case '--json': {
        options.json = true;
        break;
      }
      case '--fail-on-drift': {
        options.failOnDrift = true;
        break;
      }
      default: {
        throw new Error(`unknown argument: ${arg}`);
      }
    }
  }
  if (!options.base) throw new Error('--base needs a ref');
  return options;
}

/**
 * The suffixes that make a file executable on this platform.
 *
 * On Windows an executable is `<name><PATHEXT entry>`, and the list is ordered — `.EXE` before
 * `.CMD` — so a directory holding both resolves the way the OS itself would. Elsewhere the bare
 * name is the whole story.
 */
function executableExtensions() {
  if (process.platform !== 'win32') return [''];
  return (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
}

/** True when `candidate` is a file this process could execute. */
function isExecutableFile(candidate) {
  if (!statSync(candidate, { throwIfNoEntry: false })?.isFile()) return false;
  // Windows has no execute bit — `accessSync(X_OK)` there answers for readability instead, so the
  // PATHEXT match above is the real test.
  if (process.platform === 'win32') return true;
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * The absolute path of a command, found by walking `PATH` here rather than leaving the lookup to
 * the OS at spawn time.
 *
 * Passing a bare `'git'` to `execFileSync` delegates resolution to `PATH` as it stands when the
 * child is spawned, which is SonarCloud's `javascript:S4036` ("make sure the PATH variable only
 * contains fixed, unwriteable directories"): whatever `git` that search lands on runs with this
 * process's privileges, and a writable or relative `PATH` entry earlier in the list wins. Doing
 * the walk here fixes the executable for the whole run and lets it be checked first — relative
 * entries (`.`, `bin`, the classic hijack vector) are skipped outright, which the OS search would
 * happily honour.
 *
 * Failure throws rather than returning null: a run that cannot find git cannot compare anything,
 * and the top-level handler turns that into exit 2 with git's absence named, instead of the
 * misleading "base ref does not resolve" the old swallowed spawn produced.
 */
function resolveExecutable(command) {
  const extensions = executableExtensions();
  for (const entry of (process.env.PATH ?? '').split(path.delimiter)) {
    const directory = entry.replaceAll(/^"|"$/g, '');
    if (!directory || !path.isAbsolute(directory)) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, command + extension);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  throw new Error(`could not find "${command}" in any absolute PATH directory`);
}

/**
 * The two git reads this script needs, bound to one absolute git executable resolved up front.
 *
 * Both spawn through `execFile`, never a shell: `^` and `{}` are shell metacharacters and nothing
 * here is quoted, and an MSYS shell additionally rewrites the `<ref>:<path>` argument on Windows.
 */
function createGitCommands() {
  const git = resolveExecutable('git');
  // `maxBuffer` defaults to `execFileSync`'s own documented default, so a caller that does not
  // care states nothing and gets exactly what a bare call would have given it.
  const read = (args, maxBuffer = 1024 * 1024) => {
    try {
      return execFileSync(git, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return null;
    }
  };

  return {
    /**
     * Resolve a ref to a commit SHA, or null when it does not resolve in this repository.
     *
     * `^{commit}` makes this reject a ref that exists but does not name a commit, and `--quiet`
     * turns the failure into a plain exit code so the caller can word its own message.
     */
    resolveCommit: (ref) =>
      // `^{commit}` is git's own peel-to-a-commit revision syntax, written literally into the
      // argument. It is not a `${…}` placeholder that lost its dollar sign, which is what
      // no-incorrect-template-string-interpolation reads it as — a false positive, and "fixing"
      // it to `${commit}` would interpolate an undefined binding and break the preflight.
      // eslint-disable-next-line unicorn/no-incorrect-template-string-interpolation
      read(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])?.trim() ?? null,

    /**
     * `git show <ref>:<path>`, or null when the path does not exist there.
     *
     * Every failure reads as "absent from the base", which is only sound because `main` has
     * already proved the ref resolves. Without that preflight an unresolvable ref makes EVERY
     * component look new and the whole run vacuous.
     */
    readAtRef: (ref, relativePath) => read(['show', `${ref}:${relativePath}`], 64 * 1024 * 1024),
  };
}

/**
 * Decode the one escape sequence introduced by the `\` immediately before `index`.
 *
 * `index` addresses the character AFTER the backslash, and `next` is the index one past the whole
 * sequence — variable-length, which is why this reports it rather than letting the caller guess.
 *
 * `String.fromCodePoint`, not `fromCharCode`: identical for every value these two forms can carry
 * (`\uXXXX` caps at U+FFFF, `\xNN` at U+00FF, and a lone surrogate is a valid argument to both),
 * and it is the one that stays correct if an astral escape ever reaches here.
 */
function decodeEscape(body, index) {
  const escape = body[index];
  if (escape === 'u' && body[index + 1] === '{') {
    const end = body.indexOf('}', index);
    return {
      text: String.fromCodePoint(Number.parseInt(body.slice(index + 2, end), 16)),
      next: end + 1,
    };
  }
  if (escape === 'u') {
    return {
      text: String.fromCodePoint(Number.parseInt(body.slice(index + 1, index + 5), 16)),
      next: index + 5,
    };
  }
  if (escape === 'x') {
    return {
      text: String.fromCodePoint(Number.parseInt(body.slice(index + 1, index + 3), 16)),
      next: index + 3,
    };
  }
  // A backslash before a real newline is a line continuation and contributes nothing.
  if (escape === '\n') return { text: '', next: index + 1 };
  return { text: SIMPLE_ESCAPES[escape] ?? escape, next: index + 1 };
}

/**
 * Decode a JS string literal (quotes included) to its value, so quote style stops mattering.
 *
 * A `while` over an explicit cursor rather than a `for` counter: the cursor advances by whatever
 * the escape at hand consumed, and a `for` header that claims `index++` while the body overrides
 * it lies about the step (SonarCloud's `javascript:S2310`).
 */
function decodeString(literal) {
  const body = literal.slice(1, -1);
  let value = '';
  let index = 0;
  while (index < body.length) {
    if (body[index] !== '\\') {
      value += body[index];
      index += 1;
      continue;
    }
    const { text, next } = decodeEscape(body, index + 1);
    value += text;
    index = next;
  }
  return value;
}

/** True when a comment — `//` or `/*` — opens at these two adjacent characters. */
function opensComment(char, next) {
  return char === '/' && (next === '/' || next === '*');
}

/**
 * Index one past the comment opening at `index`.
 *
 * A line comment stops ON its newline rather than after it, so the whitespace rule below still
 * gets to decide whether that newline joins two words.
 */
function endOfComment(code, index) {
  if (code[index + 1] === '/') {
    const end = code.indexOf('\n', index);
    return end === -1 ? code.length : end;
  }
  const end = code.indexOf('*/', index + 2);
  return end === -1 ? code.length : end + 2;
}

/** Index one past the run of whitespace starting at `index`. */
function endOfWhitespace(code, index) {
  let end = index;
  while (end < code.length && /\s/.test(code[end])) end++;
  return end;
}

/**
 * Index one past the closing delimiter of the `'`, `"` or `` ` `` run starting at `index`.
 *
 * A backslash consumes the character after it, and an unterminated run reports one past the input
 * so the caller's cursor still advances past the end.
 */
function endOfDelimited(code, index) {
  const delimiter = code[index];
  let end = index + 1;
  while (end < code.length && code[end] !== delimiter) end += code[end] === '\\' ? 2 : 1;
  return end + 1;
}

/**
 * What a run of whitespace between these two characters contributes to the normalised output.
 *
 * A space only between two word characters, where it is lexically required (`return x`).
 * Everywhere else the printer's line breaks are cosmetic, so they are dropped rather than
 * collapsed to a space — collapsing would keep `( (` distinct from `((`.
 */
function joiningWhitespace(previous, following) {
  const joinsWords = Boolean(previous) && /[\w$]/.test(previous) && /[\w$]/.test(following ?? '');
  return joinsWords ? ' ' : '';
}

/**
 * Index one past the `}` closing the `${…}` interpolation whose body starts at `start`.
 *
 * Brace depth is counted, and any nested quoted or template run is skipped wholesale so a brace
 * inside a string cannot unbalance the scan. Skipped, not parsed: the caller normalises the whole
 * interpolation body recursively, which is what handles the nested literal properly.
 */
function endOfInterpolation(code, start) {
  let end = start;
  let depth = 1;
  while (end < code.length && depth > 0) {
    const char = code[end];
    if (LITERAL_DELIMITERS.has(char)) {
      end = endOfDelimited(code, end);
      continue;
    }
    if (char === '{') depth++;
    else if (char === '}') depth--;
    end++;
  }
  return end;
}

/**
 * Read the template literal starting at `index`, normalising only the code inside its `${…}`
 * interpolations.
 *
 * Collecting into `templates` happens here, and after the loop, so a literal nested inside an
 * interpolation — pushed by the recursive `normalise` below — is collected before the literal
 * containing it.
 *
 * @returns {{ literal: string, next: number }} the literal as it should be emitted, and the index
 *   one past it
 */
function readTemplateLiteral(code, index, templates) {
  let literal = '`';
  let at = index + 1;
  while (at < code.length) {
    const char = code[at];
    if (char === '\\') {
      literal += char + code[at + 1];
      at += 2;
      continue;
    }
    if (char === '`') {
      literal += '`';
      at += 1;
      break;
    }
    if (char === '$' && code[at + 1] === '{') {
      const start = at + 2;
      const end = endOfInterpolation(code, start);
      // The interpolated expression is evaluated, never rendered, so normalise it as code.
      literal += `\${${normalise(code.slice(start, end - 1), templates)}}`;
      at = end;
      continue;
    }
    // Template TEXT: byte for byte. This is the signal the whole script exists for.
    literal += char;
    at += 1;
  }
  if (templates) templates.push(literal);
  return { literal, next: at };
}

/**
 * Normalise generated JS and collect its template literals.
 *
 * Hand-rolled rather than parsed. The input is machine-generated, so the lexical states are the
 * simple ones, and this keeps the script free of a JS-parser dependency. It walks characters and
 * recurses into `${…}` interpolations, which is what lets template TEXT stay byte-exact while the
 * expressions inside it are normalised like any other code.
 *
 * The body is a dispatch over which lexical run starts here; each run's scanning rules live in
 * its own helper above, so this stays a table of cases rather than one nested scanner.
 */
function normalise(code, templates = null) {
  let out = '';
  let index = 0;

  while (index < code.length) {
    const char = code[index];

    if (opensComment(char, code[index + 1])) {
      index = endOfComment(code, index);
      continue;
    }
    if (/\s/.test(char)) {
      const end = endOfWhitespace(code, index);
      out += joiningWhitespace(out.at(-1), code[end]);
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = endOfDelimited(code, index);
      out += JSON.stringify(decodeString(code.slice(index, end)));
      index = end;
      continue;
    }
    if (char === '`') {
      const { literal, next } = readTemplateLiteral(code, index, templates);
      out += literal;
      index = next;
      continue;
    }
    out += char;
    index++;
  }
  return out;
}

/**
 * Parenthesis/bracket depth after `char`, floored at 0 so an unbalanced closer cannot go negative
 * and strand the splitter above depth 0 forever.
 */
function nextParenDepth(depth, char) {
  if (char === '(' || char === '[') return depth + 1;
  if (char === ')' || char === ']') return Math.max(0, depth - 1);
  return depth;
}

/**
 * Split normalised code into statements, so each DOM write is one comparable unit.
 *
 * Breaks on `;`, `{` and `}`, but only at parenthesis/bracket depth 0. Brace depth is
 * deliberately NOT tracked: breaking on braces is what gives statement granularity inside a
 * function body, and without it a whole component function is a single chunk — which makes the
 * emission signal indistinguishable from the whole module. Paren depth IS tracked, so a
 * `$.template_effect(() => { … })` stays atomic: the effect body is one DOM write and its
 * internals travel with it.
 */
function statements(normalised) {
  const chunks = [];
  let current = '';
  let parenDepth = 0;
  let index = 0;
  while (index < normalised.length) {
    const char = normalised[index];
    if (LITERAL_DELIMITERS.has(char)) {
      // Literals are opaque here — they were normalised already and may contain any punctuation.
      const end = endOfDelimited(normalised, index);
      current += normalised.slice(index, end);
      index = end;
      continue;
    }
    parenDepth = nextParenDepth(parenDepth, char);
    if (parenDepth === 0 && STATEMENT_BREAKS.has(char)) {
      chunks.push(current.trim());
      current = '';
    } else {
      current += char;
    }
    index++;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/**
 * Order two Svelte compiler warning codes by codepoint, independently of the host locale.
 *
 * This inventory is not a cross-commit signal — `renderCategories` compares only `templates`,
 * `emissions` and `css`, and `compareComponent` reads the head side's `warnings` alone. It is the
 * head-side warning inventory `printReport` prints and `--json` serializes, so the order must be
 * locale-INDEPENDENT for two runs on different machines to stay diffable. `localeCompare` would
 * make it depend on the host's collation, so it is deliberately not used here.
 *
 * `String(…)` first, because the bare `.sort()` this replaces coerces with `ToString` before
 * comparing: a relational comparator over the raw values diverges from it on non-strings
 * (`[10, 9].sort()` is `[10, 9]`, while comparing the numbers gives `[9, 10]`). `warning.code` is
 * a string today and nothing pins that, so the coercion is made explicit rather than assumed.
 */
function compareWarningCodes(a, b) {
  const left = String(a);
  const right = String(b);
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * The compiled-render fingerprint of one component.
 *
 * The compile itself goes through `scripts/lib/svelteCompilerWarnings.js`, which reads the
 * build's options out of `svelte.config.js`. That matters for the `warnings` field below: it is
 * the same signal `scripts/check-svelte-warnings.mjs` and `svelte.config.js`'s `onwarn` produce,
 * and three independent `compile()` calls with three private option sets is how a baseline goes
 * quietly wrong.
 *
 * `css: 'external'` is the one deliberate departure from the build's own `css: 'injected'`.
 * Under `injected` the compiler returns `result.css === null` and folds the stylesheet into a
 * string literal inside the JS, which would collapse the separate `css` signal below into the
 * whole-module `code` fallback and turn every rewrapped CSS declaration into a reported
 * difference — the exact noise this script normalises away everywhere else.
 *
 * It is not a new risk taken on. Svelte's `css` option DEFAULTS to `'external'`, and this
 * function's pre-change call passed no `css` key — so `{ css: 'external' }` reproduces the
 * behaviour this script has always had, byte for byte, and merely says so out loud now that
 * the rest of the options come from `svelte.config.js`.
 *
 * The override is confined to where the stylesheet is EMITTED, not whether it is ANALYSED, so
 * the `warnings` field above is unaffected — which `tests/svelte-warning-scope.test.js` asserts
 * over sources that actually warn (one CSS, one a11y) rather than leaving to this comment.
 */
function fingerprint(source, filename) {
  const result = compileComponent(source, filename, { css: 'external' });
  const maskHash = (text) => text.replaceAll(/svelte-[\da-z]+/g, 'svelte-HASH');
  const templates = [];
  const code = normalise(maskHash(result.js.code), templates);
  return {
    templates,
    emissions: statements(code).filter((statement) =>
      EMISSION_ANCHORS.some((anchor) => statement.includes(anchor))
    ),
    css: maskHash(result.css?.code ?? '')
      .replaceAll(/\s+/g, ' ')
      .trim(),
    code,
    warnings: result.warnings.map((warning) => warning.code).sort(compareWarningCodes),
  };
}

/**
 * Every positional difference between two ordered signal lists.
 *
 * Positional, not a longest-common-subsequence diff: a component that gains or loses an element
 * shifts everything after it and reports as a wide drift, which is the right alarm for the
 * question this script asks. Reformat-only changes preserve length and order, so the alignment
 * holds for the case it is built for.
 */
function differences(left, right) {
  const found = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) found.push({ index, base: left[index], head: right[index] });
  }
  return found;
}

/**
 * Show the window around the first differing character, not the first 200 identical ones.
 *
 * The empty-string defaults cover the one-sided case: `differences` reports an index present on
 * only one side, so the other arrives as `undefined`.
 */
function window_(base = '', head = '') {
  let at = 0;
  while (at < base.length && at < head.length && base[at] === head[at]) at++;
  const from = Math.max(0, at - 60);
  return {
    at,
    base: JSON.stringify(base.slice(from, at + 90)),
    head: JSON.stringify(head.slice(from, at + 90)),
  };
}

/** Why an unresolvable base ref is fatal, and what to do about it on CI. */
function reportUnresolvableBase(base) {
  console.error(`compare-svelte-render: base ref "${base}" does not resolve to a commit here.`);
  console.error('  Nothing can be compared against it, so this run fails instead of reporting');
  console.error('  a clean sweep over zero comparisons.');
  console.error(
    `  On CI, actions/checkout fetches a single commit by default: use fetch-depth: 0, or fetch` +
      ` the ref explicitly (git fetch origin ${base}), before running this.`
  );
}

/** The components to compare: every one under `src/`, narrowed by `--filter`. */
function collectComponents(filter) {
  return toRepositoryPaths(repoRoot, listSvelteComponents(path.join(repoRoot, 'src'))).filter(
    (relative) => !filter || relative.includes(filter)
  );
}

/** The empty record every comparison accumulates into. */
function createReport(base, baseCommit, componentCount) {
  return {
    base,
    // The resolved SHA, because `--base origin/main` is a moving target: without it a recorded
    // report cannot say WHICH commit it found clean.
    baseCommit,
    components: componentCount,
    compared: 0,
    added: [],
    failed: [],
    drift: [],
    other: [],
    warnings: { total: 0, files: [] },
  };
}

/**
 * Every render-signal difference between the two sides of one component, in report order.
 *
 * `code` is deliberately absent: it is the fallback signal the caller consults only when this
 * comes back empty.
 */
function renderCategories(base, head) {
  const categories = Array.from(differences(base.templates, head.templates), (delta) => ({
    kind: 'templates',
    index: delta.index,
    ...window_(delta.base, delta.head),
  }));
  for (const delta of differences(base.emissions, head.emissions)) {
    categories.push({ kind: 'emissions', index: delta.index, ...window_(delta.base, delta.head) });
  }
  if (base.css !== head.css) categories.push({ kind: 'css', ...window_(base.css, head.css) });
  return categories;
}

/** Compare one component against the base ref, recording the outcome in `report`. */
function compareComponent(git, base, relative, report) {
  let headFingerprint;
  try {
    headFingerprint = fingerprint(readFileSync(path.join(repoRoot, relative), 'utf8'), relative);
  } catch (error) {
    report.failed.push({ file: relative, side: 'head', message: error.message });
    return;
  }
  if (headFingerprint.warnings.length > 0) {
    report.warnings.total += headFingerprint.warnings.length;
    report.warnings.files.push({ file: relative, codes: headFingerprint.warnings });
  }

  const baseSource = git.readAtRef(base, relative);
  if (baseSource === null) {
    report.added.push(relative);
    return;
  }
  let baseFingerprint;
  try {
    baseFingerprint = fingerprint(baseSource, relative);
  } catch (error) {
    report.failed.push({ file: relative, side: 'base', message: error.message });
    return;
  }
  report.compared++;

  const categories = renderCategories(baseFingerprint, headFingerprint);
  if (categories.length > 0) report.drift.push({ file: relative, categories });
  else if (baseFingerprint.code !== headFingerprint.code) {
    report.other.push({ file: relative, ...window_(baseFingerprint.code, headFingerprint.code) });
  }
}

/** One drift entry: every category it drifted in, with the window around each first difference. */
function printDriftEntry(entry) {
  for (const category of entry.categories) {
    console.log(`  drift ${entry.file} [${category.kind} #${category.index ?? 0}]`);
    console.log(`    base: ${category.base}`);
    console.log(`    head: ${category.head}`);
  }
}

/** The human-readable form of the report: a summary line, then one block per finding. */
function printReport(report) {
  console.log(
    `base=${report.base} components=${report.components} compared=${report.compared}` +
      ` drift=${report.drift.length} other=${report.other.length}`
  );
  console.log(`svelte_compiler_warnings=${report.warnings.total} over ${report.components} files`);
  for (const entry of report.warnings.files) {
    console.log(`  warn  ${entry.file}: ${entry.codes.join(', ')}`);
  }
  for (const file of report.added) console.log(`  new   ${file} (absent from ${report.base})`);
  for (const entry of report.failed) {
    console.log(`  FAIL  ${entry.side} ${entry.file}: ${entry.message}`);
  }
  for (const entry of report.drift) printDriftEntry(entry);
  for (const entry of report.other) {
    console.log(`  other ${entry.file}`);
    console.log(`    base: ${entry.base}`);
    console.log(`    head: ${entry.head}`);
  }
}

/** The process exit code this report earns. See the EXIT CODES note at the top of the file. */
function exitCodeFor(report, options) {
  if (report.failed.length > 0) return 2;
  // Same rule as the base-ref preflight, applied to the outcome rather than the input: a run that
  // compared nothing proves nothing, so it must not read as a pass. The usual cause is a
  // `--filter` that matches no component.
  if (report.compared === 0) {
    const scope = options.filter ? ` matching --filter "${options.filter}"` : '';
    console.error(
      `compare-svelte-render: compared 0 of ${report.components} components${scope} against` +
        ` ${options.base} — a run that compares nothing cannot detect drift, so it fails rather` +
        ' than reporting clean.'
    );
    return 2;
  }
  return options.failOnDrift && report.drift.length > 0 ? 1 : 0;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const git = createGitCommands();

  // Preflight, before any compilation: an unresolvable base is a failed run, not a clean one.
  const baseCommit = git.resolveCommit(options.base);
  if (!baseCommit) {
    reportUnresolvableBase(options.base);
    return 2;
  }

  const components = collectComponents(options.filter);
  const report = createReport(options.base, baseCommit, components.length);
  for (const relative of components) compareComponent(git, options.base, relative, report);

  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);

  return exitCodeFor(report, options);
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`compare-svelte-render: ${error.message}`);
  console.error(
    'usage: node scripts/compare-svelte-render.mjs [--base <ref>] [--filter <substring>]' +
      ' [--json] [--fail-on-drift]'
  );
  process.exitCode = 2;
}
