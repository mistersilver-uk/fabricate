/**
 * A scoped `<style>` block may not carry a rule naming a class its own component never emits
 * (issue 1573). The compiler's `css_unused_selector` warning goes blind once a template carries a
 * dynamic `class` expression, so this runs the sheet's own dead-rule engine per component instead.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, posix, sep } from 'node:path';
import test from 'node:test';

import { parse } from 'svelte/compiler';

import { buildLiveClassSet, deadRuleBlocks } from '../scripts/lib/stylesheetLiveClasses.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import { repoRoot } from './helpers/sourceScan.js';

/** The removal-only residue: `<component path>  <selector>` lines (two spaces), each still dead and still there. */
const RESIDUE_FILE = join(repoRoot, 'tests/svelte-scoped-dead-selectors.txt');

/** Every `.svelte` file under `src/`, as repo-relative POSIX paths. */
function svelteFiles() {
  return readdirSync(join(repoRoot, 'src'), { recursive: true })
    .filter((entry) => entry.endsWith('.svelte'))
    .map((entry) => `src/${entry.split(sep).join('/')}`)
    .sort(byCodePoint);
}

/** Blank every `:global(...)` run, balanced: it targets markup this component does not own. */
function withoutGlobals(css) {
  let out = '';
  let index = 0;
  for (
    let open = css.indexOf(':global(', index);
    open !== -1;
    open = css.indexOf(':global(', index)
  ) {
    let depth = 0;
    let end = open + ':global'.length;
    for (; end < css.length; end += 1) {
      if (css[end] === '(') depth += 1;
      else if (css[end] === ')' && --depth === 0) break;
    }
    out += css.slice(index, open) + ' '.repeat(end + 1 - open);
    index = end + 1;
  }
  return out + css.slice(index);
}

/** A component's text with its own `<style>` body blanked, so a rule cannot keep itself live. */
function withoutStyle(source) {
  const { css } = parse(source, { modern: true });
  if (!css) return source;
  const { start, end } = css.content;
  return `${source.slice(0, start)}${' '.repeat(end - start)}${source.slice(end)}`;
}

/** Every `.svelte` and `.js` file under `src/`, blanked of style, keyed by repo-relative path. */
function corpusFiles() {
  const files = {};
  for (const entry of readdirSync(join(repoRoot, 'src'), { recursive: true })) {
    if (!/\.(?:svelte|js)$/u.test(entry)) continue;
    const file = `src/${entry.split(sep).join('/')}`;
    // ratchet-exempt(source-pin): the live-class corpus; nothing here asserts a file's shape
    const text = readFileSync(join(repoRoot, file), 'utf8');
    files[file] = file.endsWith('.svelte') ? withoutStyle(text) : text;
  }
  return files;
}

const RELATIVE_SPECIFIER = /(?:from|import)\s*['"](\.[^'"]+)['"]/gu;

/** The repo files a file's relative imports name, resolved against the corpus. */
function importsOf(file, files) {
  const found = [];
  for (const match of files[file].matchAll(RELATIVE_SPECIFIER)) {
    const base = posix.normalize(posix.join(posix.dirname(file), match[1]));
    const hit = [base, `${base}.js`, `${base}/index.js`].find((name) => name in files);
    if (hit) found.push(hit);
  }
  return found;
}

/**
 * The files a component's classes can come from besides its own markup: every file that imports
 * it (callers pass `class` strings there) and every `.js` module it or those callers reach
 * (helpers such as `segmentClass` or `riskClass`), followed transitively.
 */
function evidenceFor(file, files, importers) {
  const picked = new Set(importers.get(file));
  const queue = [file, ...picked];
  while (queue.length > 0) {
    for (const next of importsOf(queue.shift(), files)) {
      if (!next.endsWith('.js') || picked.has(next)) continue;
      picked.add(next);
      queue.push(next);
    }
  }
  picked.delete(file);
  return picked;
}

/** A class name built by interpolation or concatenation: `risk-${value}`, `'is-' + tone`. */
const DYNAMIC_PREFIX = /([A-Za-z][\w-]*-)\$\{|['"`]([A-Za-z][\w-]*-)['"`]\s*\+/gu;

/** A complete class token written inside a template literal, ahead of its first interpolation. */
const TEMPLATE_LITERAL = /`([^`]*)`/gu;

/** The shortest prefix that says anything: `is-` and `has-` pass, a lone `a-` does not. */
const MIN_PREFIX_LENGTH = 3;

/**
 * The live set, widened by every class prefix the evidence builds dynamically.
 *
 * The sheet engine only reads interpolation inside a `class` attribute, so a helper returning
 * `risk-${value}` or a `class` prop carrying `is-${tone}` leaves no evidence at all. A prefix is
 * deliberately generous, state-class prefixes included: this gate may miss a dead rule, but it
 * must not name a live one.
 */
function withDynamicPrefixes(live, texts) {
  const prefixes = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(DYNAMIC_PREFIX)) {
      const prefix = match[1] ?? match[2];
      if (prefix.length >= MIN_PREFIX_LENGTH) prefixes.add(prefix);
    }
  }
  const exact = new Set();
  for (const text of texts) {
    for (const template of text.matchAll(TEMPLATE_LITERAL)) {
      const tokens = template[1].replaceAll(/\$\{[^}]*\}/gu, '\u{0}').split(/\s+/u);
      for (const token of tokens.slice(0, -1))
        if (/^[A-Za-z][\w-]*$/u.test(token)) exact.add(token);
    }
  }
  const viaPrefix = (name) =>
    exact.has(name) || [...prefixes].some((prefix) => name.startsWith(prefix));
  return {
    ...live,
    has: (name) => live.has(name) || viaPrefix(name),
    hasLiteral: (name) => live.hasLiteral(name) || viaPrefix(name),
  };
}

/**
 * The dead scoped rules of one component, as `<selector>` strings.
 *
 * The style comes from the compiler's own parse, so a docblock that merely mentions `<style>` is
 * never mistaken for one. The live set is built from the component with that block blanked out,
 * plus the `extra` sources that can hand it classes.
 *
 * @param {string} file Repo-relative path, which decides how comments are stripped.
 * @param {string} source The component text.
 * @param {Record<string, string>} [extra] Further live-class evidence, keyed by path.
 * @returns {string[]}
 */
function deadScopedSelectors(file, source, extra = {}) {
  const { css } = parse(source, { modern: true });
  if (!css) return [];
  const styleBody = source.slice(css.content.start, css.content.end);
  const sources = { ...extra, [file]: withoutStyle(source) };
  const live = withDynamicPrefixes(
    buildLiveClassSet({ sources, coreClasses: [] }),
    Object.values(sources)
  );
  return deadRuleBlocks(withoutGlobals(styleBody), live).map((block) =>
    block.selector.replaceAll(/\s+/gu, ' ')
  );
}

/** The residue as a map of `component -> Set(selector)`, so a typo in the file fails loudly. */
function readResidue() {
  const residue = new Map();
  // ratchet-exempt(source-pin): reads the removal-only residue list, not a src/ file's shape
  for (const line of readFileSync(RESIDUE_FILE, 'utf8').split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    const gap = line.indexOf('  ');
    const file = line.slice(0, gap);
    if (!residue.has(file)) residue.set(file, new Set());
    residue.get(file).add(line.slice(gap + 2).trim());
  }
  return residue;
}

/** Every component's dead scoped selectors, measured once. */
function measure() {
  const files = corpusFiles();
  const importers = new Map();
  for (const file of Object.keys(files)) {
    for (const target of importsOf(file, files)) {
      if (!importers.has(target)) importers.set(target, []);
      importers.get(target).push(file);
    }
  }
  const found = new Map();
  for (const file of svelteFiles()) {
    const extra = Object.fromEntries(
      [...evidenceFor(file, files, importers)].map((name) => [name, files[name]])
    );
    // ratchet-exempt(source-pin): feeds the compiler's parse and the live-class scan, never pinned
    const dead = deadScopedSelectors(file, readFileSync(join(repoRoot, file), 'utf8'), extra);
    if (dead.length > 0) found.set(file, new Set(dead));
  }
  return found;
}

const measured = measure();
const residue = readResidue();

test('the scan is alive, so a clean answer cannot be an empty one', () => {
  const files = svelteFiles();
  assert.ok(files.length > 100, `only ${files.length} components were found under src/`);
  const withStyle = files.filter((file) => {
    // ratchet-exempt(source-pin): counts components carrying a style block, asserts no text
    return parse(readFileSync(join(repoRoot, file), 'utf8'), { modern: true }).css;
  });
  assert.ok(withStyle.length > 50, `only ${withStyle.length} components carry a <style> block`);
});

test('no component carries a dead scoped selector beyond the listed residue', () => {
  const fresh = [];
  for (const [file, selectors] of measured) {
    for (const selector of selectors) {
      if (!residue.get(file)?.has(selector)) fresh.push(`${file}  ${selector}`);
    }
  }
  assert.deepEqual(
    fresh,
    [],
    'these scoped rules name a class their component never emits, so they match nothing. Delete' +
      ' them. The residue file is removal-only: do not add to it'
  );
});

test('every residue entry is still dead and still exists', () => {
  const stale = [];
  for (const [file, selectors] of residue) {
    for (const selector of selectors) {
      if (!measured.get(file)?.has(selector)) stale.push(`${file}  ${selector}`);
    }
  }
  assert.deepEqual(
    stale,
    [],
    'these residue lines no longer match a dead selector (fixed, renamed or gone). Remove them' +
      ' from tests/svelte-scoped-dead-selectors.txt'
  );
});

test('a dead selector inserted beside dynamic classes is caught', () => {
  const component = (extra) =>
    [
      '<script>',
      "  let { kind = 'a' } = $props();",
      '</script>',
      '<div class="box kind-{kind}"><span class="label">x</span></div>',
      '<style>',
      '  .box { color: red; }',
      '  .kind-a { color: blue; }',
      '  .label { color: green; }',
      `  ${extra}`,
      '</style>',
    ].join('\n');
  assert.deepEqual(deadScopedSelectors('src/Probe.svelte', component('')), []);
  assert.deepEqual(
    deadScopedSelectors('src/Probe.svelte', component('.orphaned { color: red; }')),
    ['.orphaned']
  );
});

test('a docblock that mentions <style> does not hide or invent a block', () => {
  const source = `<!-- this component has no <style> of its own -->
<div class="a"></div>`;
  assert.deepEqual(deadScopedSelectors('src/Probe.svelte', source), []);
});
