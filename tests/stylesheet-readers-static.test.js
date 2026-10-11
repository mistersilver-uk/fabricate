/**
 * Every script and test reads the module sheet through `readStylesheet()` (issue 1711): no tracked
 * file outside `ALLOWED` names the sheet or a partial in a file-read call, and none reads it
 * through a Vite `?raw`/`?inline` import or a Playwright `addStyleTag({ path })`.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { repoRoot } from './helpers/sourceScan.js';

/** The loader, and this file's own offender cases. */
const ALLOWED = new Set([
  'scripts/lib/stylesheetSource.js',
  'tests/stylesheet-readers-static.test.js',
]);
const SHEET = String.raw`fabricate(?:-[\w-]+)?\.css`;
const READ = String.raw`\b(?:read(?!Stylesheet)\w*|createReadStream|openSync)\s*\(`;
const ARGS = String.raw`(?:[^;()]|\((?:[^;()]|\([^;()]*\))*\))*`;
const READ_CALL = new RegExp(`${READ}(${ARGS})`, 'gu');
const NAMES_SHEET = new RegExp(SHEET, 'u');
const SHEET_BINDING = new RegExp(String.raw`\b(?:const|let|var)\s+(\w+)\s*=[^;\n]*${SHEET}`, 'gu');
const RAW_IMPORT = /styles\/[\w.-]+\.css\?(?:raw|inline)\b/u;
const PATH_STYLE_TAG = /addStyleTag\(\s*\{[^}]*\bpath\b\s*[:,}]/u;

/** Whether `text` reads the sheet other than through the loader, directly or via a bound path. */
function readsSheet(text) {
  if (RAW_IMPORT.test(text) || PATH_STYLE_TAG.test(text)) return true;
  if ([...text.matchAll(READ_CALL)].some(([, args]) => NAMES_SHEET.test(args))) return true;
  return [...text.matchAll(SHEET_BINDING)].some(([, name]) =>
    new RegExp(String.raw`${READ}${name}\b`, 'u').test(text)
  );
}

const offenders = (sources) =>
  Object.entries(sources)
    .filter(([file, text]) => !ALLOWED.has(file) && readsSheet(text))
    .map(([file]) => file);

test('the check names each way past the loader, and passes the loader itself', () => {
  const cases = {
    'tests/direct.js': `readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');`,
    'tests/joined.js': `const css = read(join(root, 'styles', 'fabricate-tokens.css'));`,
    'tests/bound.js': `const cssPath = resolve(root, 'styles/fabricate.css');\nreadFileSync(cssPath);`,
    'tests/raw.js': `import css from '../styles/fabricate.css?raw';`,
    'tests/tag.js': `await page.addStyleTag({ path });`,
    'tests/loader.js': `const sheet = readStylesheet();\nconst entry = 'styles/fabricate.css';`,
    'tests/content.js': `await page.addStyleTag({ content: css });`,
  };
  assert.deepEqual(offenders(cases), Object.keys(cases).slice(0, 5));
});

test('no tracked script or test reads the module sheet outside the loader', () => {
  const files = execFileSync('git', ['ls-files', '-z', '--', 'scripts', 'tests'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((file) => /\.(?:m?js|svelte|html)$/u.test(file));
  assert.ok(files.length > 1000, 'the scan reached scripts/ and tests/');
  const sources = Object.fromEntries(
    files.map((file) => [file, readFileSync(path.join(repoRoot, file), 'utf8')])
  );
  assert.deepEqual(offenders(sources), []);
});
