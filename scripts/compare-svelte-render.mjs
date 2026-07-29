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
 * Exit codes: 0 clean (or drift without `--fail-on-drift`), 1 drift, 2 a component failed to
 * compile on either side.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'svelte/compiler';
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

const SIMPLE_ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' };

function parseArgs(argv) {
  const options = { base: 'origin/main', json: false, failOnDrift: false, filter: '' };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--base') options.base = argv[++index];
    else if (arg === '--filter') options.filter = argv[++index];
    else if (arg === '--json') options.json = true;
    else if (arg === '--fail-on-drift') options.failOnDrift = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.base) throw new Error('--base needs a ref');
  return options;
}

/** `git show <ref>:<path>`, or null when the path does not exist there. */
function readAtRef(ref, relativePath) {
  try {
    // execFile, not a shell: an MSYS shell rewrites the `<ref>:<path>` argument on Windows.
    return execFileSync('git', ['show', `${ref}:${relativePath}`], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
}

/** Decode a JS string literal (quotes included) to its value, so quote style stops mattering. */
function decodeString(literal) {
  const body = literal.slice(1, -1);
  let value = '';
  for (let index = 0; index < body.length; index++) {
    if (body[index] !== '\\') {
      value += body[index];
      continue;
    }
    const escape = body[++index];
    if (escape === 'u') {
      if (body[index + 1] === '{') {
        const end = body.indexOf('}', index);
        value += String.fromCodePoint(Number.parseInt(body.slice(index + 2, end), 16));
        index = end;
      } else {
        value += String.fromCharCode(Number.parseInt(body.slice(index + 1, index + 5), 16));
        index += 4;
      }
    } else if (escape === 'x') {
      value += String.fromCharCode(Number.parseInt(body.slice(index + 1, index + 3), 16));
      index += 2;
    } else if (escape === '\n') {
      // line continuation: contributes nothing
    } else {
      value += SIMPLE_ESCAPES[escape] ?? escape;
    }
  }
  return value;
}

/**
 * Normalise generated JS and collect its template literals.
 *
 * Hand-rolled rather than parsed. The input is machine-generated, so the lexical states are the
 * simple ones, and this keeps the script free of a JS-parser dependency. It walks characters and
 * recurses into `${…}` interpolations, which is what lets template TEXT stay byte-exact while the
 * expressions inside it are normalised like any other code.
 */
function normalise(code, templates = null) {
  let out = '';
  let index = 0;

  // Whitespace is only meaningful between two word characters (`return x`). Everywhere else the
  // printer's line breaks are cosmetic, so they are dropped rather than collapsed to a space —
  // collapsing would keep `( (` distinct from `((`.
  const appendWhitespace = (following) => {
    const previous = out.at(-1);
    if (previous && /[\w$]/.test(previous) && /[\w$]/.test(following)) out += ' ';
  };

  while (index < code.length) {
    const char = code[index];
    const next = code[index + 1];

    if (char === '/' && next === '/') {
      const end = code.indexOf('\n', index);
      index = end === -1 ? code.length : end;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = code.indexOf('*/', index + 2);
      index = end === -1 ? code.length : end + 2;
      continue;
    }
    if (/\s/.test(char)) {
      let end = index;
      while (end < code.length && /\s/.test(code[end])) end++;
      appendWhitespace(code[end] ?? '');
      index = end;
      continue;
    }
    if (char === "'" || char === '"') {
      let end = index + 1;
      while (end < code.length) {
        if (code[end] === '\\') end += 2;
        else if (code[end] === char) break;
        else end++;
      }
      out += JSON.stringify(decodeString(code.slice(index, end + 1)));
      index = end + 1;
      continue;
    }
    if (char === '`') {
      let literal = '`';
      index++;
      while (index < code.length) {
        const current = code[index];
        if (current === '\\') {
          literal += current + code[index + 1];
          index += 2;
          continue;
        }
        if (current === '`') {
          literal += '`';
          index++;
          break;
        }
        if (current === '$' && code[index + 1] === '{') {
          const start = index + 2;
          let end = start;
          let depth = 1;
          while (end < code.length && depth > 0) {
            const inner = code[end];
            if (inner === '{') depth++;
            else if (inner === '}') depth--;
            else if (inner === '`') {
              // A nested template literal: skip it wholesale so its braces cannot unbalance the
              // interpolation scan. The recursive call below normalises it properly.
              end++;
              while (end < code.length && code[end] !== '`') end += code[end] === '\\' ? 2 : 1;
            } else if (inner === "'" || inner === '"') {
              const quote = inner;
              end++;
              while (end < code.length && code[end] !== quote) end += code[end] === '\\' ? 2 : 1;
            }
            end++;
          }
          // The interpolated expression is evaluated, never rendered, so normalise it as code.
          literal += `\${${normalise(code.slice(start, end - 1), templates)}}`;
          index = end;
          continue;
        }
        // Template TEXT: byte for byte. This is the signal the whole script exists for.
        literal += current;
        index++;
      }
      if (templates) templates.push(literal);
      out += literal;
      continue;
    }
    out += char;
    index++;
  }
  return out;
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
    if (char === "'" || char === '"' || char === '`') {
      // Literals are opaque here — they were normalised already and may contain any punctuation.
      let end = index + 1;
      while (end < normalised.length && normalised[end] !== char) {
        end += normalised[end] === '\\' ? 2 : 1;
      }
      current += normalised.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === '(' || char === '[') parenDepth++;
    else if (char === ')' || char === ']') parenDepth = Math.max(0, parenDepth - 1);
    if (parenDepth === 0 && (char === ';' || char === '{' || char === '}')) {
      chunks.push(current.trim());
      current = '';
      index++;
      continue;
    }
    current += char;
    index++;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.filter(Boolean);
}

/** The compiled-render fingerprint of one component. */
function fingerprint(source, filename) {
  const result = compile(source, { filename, generate: 'client', dev: false });
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
    warnings: result.warnings.map((warning) => warning.code).sort(),
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

/** Show the window around the first differing character, not the first 200 identical ones. */
function window_(base, head) {
  const left = base ?? '';
  const right = head ?? '';
  let at = 0;
  while (at < left.length && at < right.length && left[at] === right[at]) at++;
  const from = Math.max(0, at - 60);
  return {
    at,
    base: JSON.stringify(left.slice(from, at + 90)),
    head: JSON.stringify(right.slice(from, at + 90)),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  const components = toRepositoryPaths(
    repoRoot,
    listSvelteComponents(path.join(repoRoot, 'src'))
  ).filter((relative) => !options.filter || relative.includes(options.filter));

  const report = {
    base: options.base,
    components: components.length,
    compared: 0,
    added: [],
    failed: [],
    drift: [],
    other: [],
    warnings: { total: 0, files: [] },
  };

  for (const relative of components) {
    let head;
    try {
      head = fingerprint(readFileSync(path.join(repoRoot, relative), 'utf8'), relative);
    } catch (error) {
      report.failed.push({ file: relative, side: 'head', message: error.message });
      continue;
    }
    if (head.warnings.length > 0) {
      report.warnings.total += head.warnings.length;
      report.warnings.files.push({ file: relative, codes: head.warnings });
    }

    const baseSource = readAtRef(options.base, relative);
    if (baseSource === null) {
      report.added.push(relative);
      continue;
    }
    let base;
    try {
      base = fingerprint(baseSource, relative);
    } catch (error) {
      report.failed.push({ file: relative, side: 'base', message: error.message });
      continue;
    }
    report.compared++;

    const categories = [];
    for (const delta of differences(base.templates, head.templates)) {
      categories.push({ kind: 'templates', index: delta.index, ...window_(delta.base, delta.head) });
    }
    for (const delta of differences(base.emissions, head.emissions)) {
      categories.push({ kind: 'emissions', index: delta.index, ...window_(delta.base, delta.head) });
    }
    if (base.css !== head.css) categories.push({ kind: 'css', ...window_(base.css, head.css) });

    if (categories.length > 0) report.drift.push({ file: relative, categories });
    else if (base.code !== head.code) {
      report.other.push({ file: relative, ...window_(base.code, head.code) });
    }
  }

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
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
    for (const entry of report.drift) {
      for (const category of entry.categories) {
        console.log(`  drift ${entry.file} [${category.kind} #${category.index ?? 0}]`);
        console.log(`    base: ${category.base}`);
        console.log(`    head: ${category.head}`);
      }
    }
    for (const entry of report.other) {
      console.log(`  other ${entry.file}`);
      console.log(`    base: ${entry.base}`);
      console.log(`    head: ${entry.head}`);
    }
  }

  if (report.failed.length > 0) return 2;
  return options.failOnDrift && report.drift.length > 0 ? 1 : 0;
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
