/**
 * The module sheet's cut into partials (issue 1711): an anchor matches one top-level line, a
 * comment anchor cuts at its comment block's first line, a cut inside a block throws, and the
 * parts join back to the sheet byte for byte.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { cutStylesheet, stylesheetEntry } from '../scripts/lib/stylesheetCut.js';
import { readStylesheet } from '../scripts/lib/stylesheetSource.js';

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
