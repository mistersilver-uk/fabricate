/**
 * The module-sheet loader (issue 1711): its contract over a single and a split sheet, the
 * cross-file Stylelint rules over the joined text, and byte identity with the base when a change
 * alters the import list.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import postcssScss from 'postcss-scss';
import stylelint from 'stylelint';

import {
  STYLESHEET_ENTRY,
  checkoutReader,
  locateStylesheetLine,
  logicalStylesheetPath,
  readStylesheet,
  stylesheetImports,
  stylesheetParts,
  stylesheetSources,
} from '../scripts/lib/stylesheetSource.js';

import { readBaseFiles, resolveRatchetBase } from './helpers/mergeBaseRatchet.js';
import { mapReader, splitSheet } from './helpers/splitStylesheet.js';

const SINGLE = { [STYLESHEET_ENTRY]: '.fabricate .a {\n  color: red;\n}\n' };
const SPLIT = splitSheet(
  { tokens: ':root {\n  --fab-x: 1px;\n}\n\n', rules: '.fabricate .a {\n  margin: 0;\n}\n' },
  { entryPrefix: '/* The tokens, then the rules. */\n' }
);

test('an entry with no import is returned as it is, one part covering every line', () => {
  const read = mapReader(SINGLE);
  assert.equal(readStylesheet(read), SINGLE[STYLESHEET_ENTRY]);
  assert.deepEqual(stylesheetParts(read), [{ file: STYLESHEET_ENTRY, startLine: 1, lineCount: 3 }]);
  assert.deepEqual(locateStylesheetLine(3, read), { file: STYLESHEET_ENTRY, line: 3 });
});

test('a split entry reads as its partials joined in import order, each line located', () => {
  const read = mapReader(SPLIT);
  assert.equal(
    readStylesheet(read),
    SPLIT['styles/fabricate-tokens.css'] + SPLIT['styles/fabricate-rules.css']
  );
  assert.deepEqual(stylesheetParts(read), [
    { file: 'styles/fabricate-tokens.css', startLine: 1, lineCount: 4 },
    { file: 'styles/fabricate-rules.css', startLine: 5, lineCount: 3 },
  ]);
  assert.deepEqual(locateStylesheetLine(4, read), { file: 'styles/fabricate-tokens.css', line: 4 });
  assert.deepEqual(locateStylesheetLine(5, read), { file: 'styles/fabricate-rules.css', line: 1 });
  assert.throws(() => locateStylesheetLine(8, read), RangeError);
});

test('no entry reads as nothing; a missing, foreign or mixed import throws', () => {
  assert.equal(readStylesheet(mapReader({})), undefined);
  assert.deepEqual(stylesheetParts(mapReader({})), []);
  const missing = { ...SPLIT, 'styles/fabricate-rules.css': undefined };
  assert.throws(
    () => readStylesheet(mapReader(missing)),
    /imports styles\/fabricate-rules\.css, which is missing/
  );
  assert.throws(() => stylesheetImports('@import url("../other.css");\n'), /not a sibling/);
  assert.throws(
    () => stylesheetImports('@import url("fabricate-a.css");\n.x {}\n'),
    /rules beside/
  );
  assert.deepEqual(stylesheetImports('/* @import url("fabricate-a.css"); */\n.x {}\n'), []);
  for (const form of [
    '@import "x.css";',
    '@import url(x.css);',
    '@import url("x.css") layer(modules);',
    '@IMPORT url("x.css");',
  ]) {
    assert.throws(
      () => stylesheetImports(`${form}\n.x {}\n`),
      /holds an @import the loader cannot read/,
      form
    );
  }
});

test('an empty part counts no lines', () => {
  const files = { ...SPLIT, 'styles/fabricate-tokens.css': '' };
  assert.deepEqual(
    stylesheetParts(mapReader(files)).map(({ lineCount }) => lineCount),
    [0, 3]
  );
});

test('a checkout reader reads another tree, and a partial path maps to the entry', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-stylesheet-source-'));
  try {
    for (const [file, text] of Object.entries(SPLIT)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    assert.equal(readStylesheet(checkoutReader(root)), readStylesheet(mapReader(SPLIT)));
    assert.equal(checkoutReader(root)('styles/absent.css'), undefined);
    for (const file of [
      'styles/fabricate.css',
      'styles/fabricate-rules.css',
      './styles/fabricate.css',
      'styles//fabricate.css',
      'styles/../styles/fabricate-x.css',
    ]) {
      assert.throws(() => checkoutReader(root)(file), /read through readStylesheet\(\)/, file);
    }
    for (const file of ['../outside.css', '/etc/hosts', 'styles/../../outside.css']) {
      assert.throws(() => checkoutReader(root)(file), /is outside/, file);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assert.equal(logicalStylesheetPath('styles/fabricate-gone.css'), STYLESHEET_ENTRY);
  assert.equal(logicalStylesheetPath('styles/other.css'), 'styles/other.css');
});

/**
 * What compares one part of the sheet with another, which a per-file lint cannot: Stylelint's
 * `no-duplicate-selectors`, and a repeated `@keyframes` name, for which Stylelint has no rule.
 */
async function crossFileWarnings(code) {
  const config = { rules: { 'no-duplicate-selectors': true } };
  const { results } = await stylelint.lint({ code, config });
  const warnings = results.flatMap((result) => result.warnings.map((warning) => warning.text));
  const names = new Set();
  postcssScss.parse(code).walkAtRules('keyframes', (rule) => {
    if (names.has(rule.params)) warnings.push(`@keyframes ${rule.params} is declared twice`);
    names.add(rule.params);
  });
  return warnings;
}

test('the joined module sheet repeats no selector and no keyframes name', async () => {
  assert.deepEqual(await crossFileWarnings(readStylesheet()), []);
});

test('the cross-file pass catches a repeat that only the joined text holds', async () => {
  const twice = splitSheet({
    one: '.fabricate .a {\n  margin: 0;\n}\n\n@keyframes fab-spin {\n  to { opacity: 1; }\n}\n',
    two: '.fabricate .a {\n  padding: 0;\n}\n\n@keyframes fab-spin {\n  to { opacity: 0; }\n}\n',
  });
  const warnings = await crossFileWarnings(readStylesheet(mapReader(twice)));
  assert.equal(warnings.length, 2, warnings.join('\n'));
  assert.ok(warnings.some((text) => /no-duplicate-selectors/u.test(text)));
  assert.ok(warnings.some((text) => /@keyframes fab-spin is declared twice/u.test(text)));
});

test('a change to the import list joins to the base sheet byte for byte', (t) => {
  const base = resolveRatchetBase();
  if (base.skipped) {
    t.diagnostic(`skipped (${base.skipped}): ${base.reason}`);
    return;
  }
  const readBase = (file) => readBaseFiles(base, [file]).get(file);
  const baseEntry = readBase(STYLESHEET_ENTRY);
  const head = checkoutReader();
  const headImports = stylesheetSources(head).parts.map(({ file }) => file);
  const sameImports =
    baseEntry !== undefined && stylesheetImports(baseEntry).join('\n') === headImports.join('\n');
  if (baseEntry === undefined || headImports.length === 0 || sameImports) {
    t.diagnostic('the base has no sheet, the head is not split, or the import list is unchanged');
    return;
  }
  assert.ok(
    readStylesheet(head) === readStylesheet(readBase),
    'the joined sheet differs from base'
  );
});
