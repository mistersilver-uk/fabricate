/**
 * Shared wiring for the design-system debt gates: the corpora they read, measurement caches the
 * base and head sides share, the `ratchet-exempt(design-system)` site exemption, and one call into
 * the merge-base engine. A gate is `{ include, measure }`; see `compareToBase` for `measure`.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { parse } from 'svelte/compiler';

import { byCodePoint } from './codePointOrder.js';
import { compareToBase, reportComparison, siteMarker } from './mergeBaseRatchet.js';
import { collectWorkingTreeSources } from './sourceScan.js';
import {
  collectCustomProperties,
  declarationsIn,
  rulesIn,
  styleTextFor,
} from './styleBlockScan.js';
import { lineOf, walkElements } from './svelteTemplateScan.js';
import { copyTempGitRepo, createTempGitRepo } from './temp-git-repo.js';

export const DESIGN_SYSTEM_FAMILY = 'design-system';

function corpusOf(roots, extensions) {
  const include = (file) =>
    roots.some((root) => file.startsWith(`${root}/`)) &&
    extensions.some((extension) => file.endsWith(extension));
  return Object.freeze({ roots, extensions, include });
}

/** The global sheet and every Svelte scoped block. */
export const STYLE_CORPUS = corpusOf(['src', 'styles'], ['.svelte', '.css', '.scss']);

/** Every UI template. */
export const TEMPLATE_CORPUS = corpusOf(['src/ui/svelte'], ['.svelte']);

/** Every JavaScript module under `src/`. */
export const MODULE_CORPUS = corpusOf(['src'], ['.js']);

/** The design-system manifest, which a gate reading its rows reads on each side. */
export const MANIFEST_PATH = 'scripts/lib/designSystemPrimitives.json';
export const MANIFEST_CORPUS = corpusOf(['scripts/lib'], ['designSystemPrimitives.json']);

/** The manifest's member and recorded non-member rows, as one side's `readFile` gives them. */
export function manifestRows(readFile) {
  const manifest = JSON.parse(readFile(MANIFEST_PATH) ?? '{}');
  return [...(manifest.designSystemPrimitives ?? []), ...(manifest.notAPrimitive ?? [])];
}

/** A trigger set spanning several corpora, for a gate whose measure reads each of them. */
export const inAny =
  (...corpora) =>
  (file) =>
    corpora.some((corpus) => corpus.include(file));

const trees = new Map();

/** The working tree over `corpora`, as the `readFile` and `listFiles` a measure takes. */
export function workingTree(...corpora) {
  const key = corpora.map((corpus) => `${corpus.roots}|${corpus.extensions}`).join('+');
  if (!trees.has(key)) {
    const sources = {};
    for (const { roots, extensions } of corpora) {
      Object.assign(sources, collectWorkingTreeSources([...roots], [...extensions]));
    }
    const files = Object.keys(sources).sort(byCodePoint);
    trees.set(key, { readFile: (file) => sources[file], listFiles: () => [...files] });
  }
  return trees.get(key);
}

const styleFiles = new Map();

function styleFile(file, source) {
  const key = `${file}\u{0}${source}`;
  if (!styleFiles.has(key)) {
    const css = styleTextFor(file, source);
    const rules = css.trim() === '' ? [] : rulesIn(css).map((rule) => ({ ...rule, file }));
    styleFiles.set(key, { css, rules });
  }
  return styleFiles.get(key);
}

function buildStyleCorpus(entries) {
  const styles = {};
  const sources = {};
  const rules = [];
  for (const [file, source] of entries) {
    const analysed = styleFile(file, source);
    if (analysed.css.trim() === '') continue;
    styles[file] = analysed.css;
    sources[file] = source;
    rules.push(...analysed.rules);
  }
  const declarations = rules.flatMap((rule) =>
    declarationsIn(rule.file, rule.body).map((declaration) => ({
      ...declaration,
      line: rule.line,
      at: rule.bodyLine + declaration.line - 1,
      selector: rule.selector,
      context: rule.context,
    }))
  );
  return { styles, sources, rules, declarations, definitions: collectCustomProperties(styles) };
}

const styleCorpora = new Map();

/**
 * The style corpus one side holds: each file's CSS and source, its rules, its declarations (`line`
 * is the rule's, `at` the declaration's own) and the custom-property definitions `var()` resolves
 * against, all read through `readFile`, so a base measurement resolves against base definitions.
 */
export function styleCorpusOf(readFile, files) {
  const entries = [];
  const digest = createHash('sha256');
  for (const file of files.filter((path) => STYLE_CORPUS.include(path)).sort(byCodePoint)) {
    const source = readFile(file);
    if (source === undefined) continue;
    entries.push([file, source]);
    digest.update(`${file}\u{0}${source}\u{0}`);
  }
  const key = digest.digest('hex');
  if (!styleCorpora.has(key)) styleCorpora.set(key, buildStyleCorpus(entries));
  return styleCorpora.get(key);
}

const parsedTexts = new Map();

/** Every UI template among `files`, as `{ file, source, ast }`, each distinct text parsed once. */
export function templatesOf(readFile, files) {
  return files
    .filter((path) => TEMPLATE_CORPUS.include(path))
    .sort(byCodePoint)
    .flatMap((file) => {
      const source = readFile(file);
      if (source === undefined) return [];
      if (!parsedTexts.has(source)) {
        try {
          parsedTexts.set(source, parse(source, { modern: true }));
        } catch (error) {
          throw new Error(`${file} failed to parse: ${error.message}`, { cause: error });
        }
      }
      return [{ file, source, ast: parsedTexts.get(source) }];
    });
}

const MARKER_TEXT = /ratchet-exempt\(/u;

/** Whether a reasoned `ratchet-exempt(design-system)` marker sits at `line` or right above it. */
export function exemptAt(file, text, line) {
  if (typeof text !== 'string' || !MARKER_TEXT.test(text)) return false;
  return siteMarker(file, text, DESIGN_SYSTEM_FAMILY, line) !== null;
}

/** Every `<select>` element the templates render, with its line. */
export function nativeSelectSites(templates) {
  const found = [];
  for (const { file, source, ast } of templates) {
    walkElements(ast.fragment, (element) => {
      if (element.type !== 'RegularElement' || element.name.toLowerCase() !== 'select') return;
      found.push({ file, line: lineOf(source, element.start) });
    });
  }
  return found;
}

/**
 * Compare one gate with the base commit over the whole corpus its measure reads. Each entry is a
 * site, which a reasoned marker excuses only when the site is new to base; a gate may override.
 */
export function compareDesignSystem({ include, measure, ...options }) {
  return compareToBase({
    family: DESIGN_SYSTEM_FAMILY,
    corpusRoot: '.',
    include,
    measure,
    scope: 'corpus',
    headMarkers: false,
    siteMarkers: true,
    ...options,
  });
}

/** Compare `gate` with the base commit and report it to `t`, throwing on any regression. */
export function checkGate(t, gate, guidance) {
  const result = reportComparison(t, compareDesignSystem(gate), guidance);
  if (result.compared) t.diagnostic(`compared with base ${result.base.slice(0, 12)}`);
  return result;
}

/** Each distinct base, committed once per process; a case writes only to its own copy of it. */
const baseRepos = new Map();

function baseRepoFor(files) {
  const key = JSON.stringify(Object.entries(files).sort(([a], [b]) => byCodePoint(a, b)));
  if (!baseRepos.has(key)) {
    if (baseRepos.size === 0) {
      process.once('exit', () => {
        for (const { repo } of baseRepos.values()) repo.dispose();
      });
    }
    const repo = createTempGitRepo('design-system-ratchet-base-');
    repo.write(files);
    baseRepos.set(key, { repo, base: repo.commitAll('base') });
  }
  return baseRepos.get(key);
}

/** A throwaway repository whose one commit holds `files`, comparing gates against that commit. */
export function gateRepo(t, files) {
  const { repo: template, base } = baseRepoFor(files);
  const repo = copyTempGitRepo(template, 'design-system-ratchet-');
  t.after(() => repo.dispose());
  return {
    write: (changes) => repo.write(changes),
    compare: (gate) => compareDesignSystem({ ...gate, cwd: repo.dir, env: { RATCHET_BASE: base } }),
  };
}

/**
 * Prove a gate against throwaway repositories: each case writes `head` over `base` and expects
 * exactly `failures`. A case with `skipped` expects the gate to skip with that code instead.
 */
export function assertGateCases(t, gate, base, cases) {
  for (const { head, failures, skipped } of cases) {
    const repo = gateRepo(t, base);
    repo.write(head);
    const result = repo.compare(gate);
    if (skipped) assert.equal(result.skipped, skipped, JSON.stringify(head));
    else assert.deepEqual(result.failures, failures, JSON.stringify(head));
  }
}

/** The failure `compareToBase` reports for an empty marker at `file:line`. */
export const emptyMarkerFailure = (file, line) =>
  `${file}:${line} has a ratchet-exempt(${DESIGN_SYSTEM_FAMILY}) marker with no reason; write why ` +
  'the regression is legitimate after the colon';

const entryOf = ({ line, ...site }) => ({ ...site, lines: [line] });

/**
 * A gate over `corpora`, whose `find(readFile, files)` gives the offending `{ file, line, id,
 * value? }` sites of one side; a reasoned marker at a site new to base excuses it.
 */
export const gateOver = (corpora, find) => ({
  include: inAny(...corpora),
  measure: (readFile, listFiles) => find(readFile, listFiles()).map(entryOf),
});

/** Fail when a scan saw fewer than `floor` candidates: a broken scan, not a clean tree. */
export function assertFloor(label, scanned, floor) {
  assert.ok(
    scanned >= floor,
    `${label}: the scan looked at only ${scanned} candidates, below the floor of ${floor}. A wrong ` +
      'root, an extractor that stopped matching or a filter excluding everything all read as ' +
      'nothing to report, so this is a broken scan rather than a clean tree.'
  );
}
