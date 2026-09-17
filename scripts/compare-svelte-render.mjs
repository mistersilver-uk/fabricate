#!/usr/bin/env node
/** Compare what every `src/**\/*.svelte` component renders against a base ref. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveExecutable } from './lib/resolveExecutable.js';
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

/** The two git reads this script needs, bound to one absolute git executable resolved up front. */
function createGitCommands() {
  // Fatal here, unlike in the benchmark envelope: a run that cannot find git cannot compare
  // anything, and the top-level handler turns this into exit 2 with git's absence named, instead
  // of the misleading "base ref does not resolve" a swallowed spawn produced.
  const git = resolveExecutable('git');
  if (!git) throw new Error('could not find "git" in any absolute PATH directory');
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
    /** Resolve a ref to a commit SHA, or null when it does not resolve in this repository. */
    resolveCommit: (ref) =>
      // `^{commit}` is git's own peel-to-a-commit revision syntax, written literally into the
      // argument. It is not a `${…}` placeholder that lost its dollar sign, which is what
      // no-incorrect-template-string-interpolation reads it as — a false positive, and "fixing"
      // it to `${commit}` would interpolate an undefined binding and break the preflight.
      // eslint-disable-next-line unicorn/no-incorrect-template-string-interpolation
      read(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`])?.trim() ?? null,

    /** `git show <ref>:<path>`, or null when the path does not exist there. */
    readAtRef: (ref, relativePath) => read(['show', `${ref}:${relativePath}`], 64 * 1024 * 1024),
  };
}

/** Decode the one escape sequence introduced by the `\` immediately before `index`. */
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

/** Decode a JS string literal (quotes included) to its value, so quote style stops mattering. */
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

/** Index one past the comment opening at `index`. */
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

/** Index one past the closing delimiter of the `'`, `"` or `` ` `` run starting at `index`. */
function endOfDelimited(code, index) {
  const delimiter = code[index];
  let end = index + 1;
  while (end < code.length && code[end] !== delimiter) end += code[end] === '\\' ? 2 : 1;
  return end + 1;
}

/** What a run of whitespace between these two characters contributes to the normalised output. */
function joiningWhitespace(previous, following) {
  const joinsWords = Boolean(previous) && /[\w$]/.test(previous) && /[\w$]/.test(following ?? '');
  return joinsWords ? ' ' : '';
}

/** Index one past the `}` closing the `${…}` interpolation whose body starts at `start`. */
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

/** Normalise generated JS and collect its template literals. */
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

/** Split normalised code into statements, so each DOM write is one comparable unit. */
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

/** Order two Svelte compiler warning codes by codepoint, independently of the host locale. */
function compareWarningCodes(a, b) {
  const left = String(a);
  const right = String(b);
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** The compiled-render fingerprint of one component. */
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

/** Every positional difference between two ordered signal lists. */
function differences(left, right) {
  const found = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index++) {
    if (left[index] !== right[index]) found.push({ index, base: left[index], head: right[index] });
  }
  return found;
}

/** Show the window around the first differing character, not the first 200 identical ones. */
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

/** Every render-signal difference between the two sides of one component, in report order. */
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
  // compared nothing proves nothing, so it must not read as a pass.
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
