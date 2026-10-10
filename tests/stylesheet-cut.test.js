/**
 * The module sheet's cut into partials (issue 1711): an anchor matches one top-level line, a
 * comment anchor cuts at its comment block's first line, a cut inside a block throws, and the
 * parts join back to the sheet byte for byte.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { STYLESHEET_CUT, cutStylesheet, stylesheetEntry } from '../scripts/lib/stylesheetCut.js';
import {
  checkoutReader,
  readStylesheet,
  stylesheetSources,
} from '../scripts/lib/stylesheetSource.js';

import { byCodePoint } from './helpers/codePointOrder.js';
import { repoRoot } from './helpers/sourceScan.js';
import { mapReader, splitSheet } from './helpers/splitStylesheet.js';

const SHEET = [
  ':root {',
  '  --fab-x: 1px;',
  '}',
  '',
  '/* ---------- */',
  '',
  '/* Chat cards */',
  '.fabricate .chat {',
  '  color: var(--fab-x);',
  '}',
  '',
  '@container fabricate-manager (max-width: 10px) {',
  '  .fabricate .rule {',
  '    margin: 0;',
  '  }',
  '}',
  '',
  '.fabricate .rule {',
  '  content: "{";',
  '}',
  '',
].join('\n');

const TABLE = [
  { partial: 'fabricate-tokens.css', kind: 'start' },
  { partial: 'fabricate-chat.css', kind: 'comment', text: 'Chat cards' },
  { partial: 'fabricate-rules.css', kind: 'rule', text: '.fabricate .rule {' },
];

test('a comment anchor cuts at its block’s first line and a rule anchor at its top-level line', () => {
  const parts = cutStylesheet(SHEET, TABLE);
  assert.deepEqual(
    parts.map(({ partial, startLine }) => [partial, startLine]),
    [
      ['fabricate-tokens.css', 1],
      ['fabricate-chat.css', 5],
      ['fabricate-rules.css', 18],
    ]
  );
  assert.equal(parts.map(({ text }) => text).join(''), SHEET);
});

test('the written entry and partials read back as the sheet through the loader', () => {
  const parts = cutStylesheet(SHEET, TABLE);
  const files = splitSheet(
    Object.fromEntries(parts.map(({ partial, text }) => [partial.slice(10, -4), text]))
  );
  assert.equal(files['styles/fabricate.css'], stylesheetEntry(parts));
  assert.equal(readStylesheet(mapReader(files)), SHEET);
});

test('an anchor matching no top-level line, or more than one, throws', () => {
  const absent = [
    ...TABLE.slice(0, 2),
    { partial: 'fabricate-x.css', kind: 'rule', text: '.nope {' },
  ];
  assert.throws(
    () => cutStylesheet(SHEET, absent),
    /fabricate-x\.css: "\.nope \{" must match one top-level line; matched none/
  );
  const twice = `${SHEET}.fabricate .rule {\n  margin: 1px;\n}\n`;
  assert.throws(() => cutStylesheet(twice, TABLE), /fabricate-rules\.css: .* matched 18, 21/);
});

test('a cut that falls inside a block, or out of order, throws', () => {
  const nested = [TABLE[0], { partial: 'fabricate-inner.css', kind: 'comment', text: 'inside' }];
  const inBlock = SHEET.replace('  --fab-x: 1px;', '  /* inside */\n  --fab-x: 1px;');
  assert.throws(
    () => cutStylesheet(inBlock, nested),
    /fabricate-inner\.css: "inside" must match one top-level line/
  );
  const midList = SHEET.replace('\n.fabricate .rule {', '\n.fabricate .other,\n.fabricate .rule {');
  assert.throws(
    () => cutStylesheet(midList, TABLE),
    /fabricate-rules\.css: the cut at line 19 is not on a top-level rule boundary/
  );
  assert.throws(
    () => cutStylesheet(SHEET, [TABLE[0], TABLE[2], TABLE[1]]),
    /fabricate-chat\.css starts before fabricate-rules\.css ends/
  );
});

const CLI_FILES = [
  'scripts/split-stylesheet.mjs',
  'scripts/lib/stylesheetCut.js',
  'scripts/lib/stylesheetSource.js',
];

/** A throwaway checkout holding the cut script and this sheet unsplit, and a runner of the script. */
function checkoutWithScript(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-split-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of CLI_FILES) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(path.join(repoRoot, file), path.join(root, file));
  }
  mkdirSync(path.join(root, 'styles'));
  writeFileSync(path.join(root, 'styles/fabricate.css'), readStylesheet());
  const run = (...args) =>
    spawnSync(process.execPath, [path.join(root, CLI_FILES[0]), ...args], { encoding: 'utf8' });
  const styles = () => readdirSync(path.join(root, 'styles')).sort(byCodePoint);
  return { root, run, styles };
}

test('the cut script prints its cut under --check and refuses any other argument', (t) => {
  const checkout = checkoutWithScript(t);
  const checked = checkout.run('--check');
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(checked.stdout.trim().split('\n').length, STYLESHEET_CUT.length);
  assert.deepEqual(checkout.styles(), ['fabricate.css'], '--check writes nothing');
  for (const args of [['--out', '../elsewhere'], ['--root=/'], ['styles/fabricate.css']]) {
    const refused = checkout.run(...args);
    assert.notEqual(refused.status, 0, args.join(' '));
    assert.match(refused.stderr, /ERR_PARSE_ARGS/u, args.join(' '));
  }
});

test('the cut script writes partials that join to the sheet, and keeps a commented entry', (t) => {
  const checkout = checkoutWithScript(t);
  const read = checkoutReader(checkout.root);
  const original = readStylesheet(read);
  assert.equal(checkout.run().status, 0);
  const partials = STYLESHEET_CUT.map(({ partial }) => partial);
  assert.deepEqual(checkout.styles(), ['fabricate.css', ...partials].sort(byCodePoint));
  assert.ok(readStylesheet(read) === original, 'the written partials join to the sheet');
  const { entry } = stylesheetSources(read);
  assert.equal(entry, stylesheetEntry(cutStylesheet(original)));
  const commented = `/* The tokens come first. */\n${entry}`;
  writeFileSync(path.join(checkout.root, 'styles/fabricate.css'), commented);
  assert.equal(checkout.run().status, 0);
  assert.equal(stylesheetSources(read).entry, commented, 'a re-cut keeps the entry as it is');
  assert.ok(readStylesheet(read) === original, 'and rewrites the same partials');
  writeFileSync(
    path.join(checkout.root, 'styles/fabricate.css'),
    entry.split('\n').slice(1).join('\n')
  );
  const drifted = checkout.run();
  assert.notEqual(drifted.status, 0);
  assert.match(drifted.stderr, /imports other partials than the cut/u);
});
