/**
 * The module sheet is one logical file to every gate (issue 1711): the merge-base ratchets on both
 * sides of a split, the working-tree walk, the integrity check, and View Lab case selection.
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { stylesheetIntegrityFailures } from '../scripts/lib/stylesheetIntegrity.js';
import {
  STYLESHEET_ENTRY,
  checkoutReader,
  readStylesheet,
} from '../scripts/lib/stylesheetSource.js';
import {
  hasUiChanges,
  mapChangedFilesToCases,
  rendersCapture,
} from '../scripts/lib/viewLabCases.js';

import {
  STYLE_CORPUS,
  compareDesignSystem,
  emptyMarkerFailure,
  gateOver,
  styleCorpusOf,
} from './helpers/designSystemRatchet.js';
import { collectWorkingTreeSources } from './helpers/sourceScan.js';
import { mapReader, splitSheet } from './helpers/splitStylesheet.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const TOKENS = ':root {\n  --fab-x: 1px;\n}\n\n';
const RULES = '.fabricate .a {\n  outline: none;\n}\n';
const OFFENDER = '\n.fabricate .b {\n  outline: none;\n}\n';
const SINGLE = { [STYLESHEET_ENTRY]: TOKENS + RULES };
const SPLIT = splitSheet({ tokens: TOKENS, rules: RULES });

/** A design-system gate over the style corpus: each rule declaring `outline: none` is a site. */
const OUTLINE_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  styleCorpusOf(readFile, files)
    .declarations.filter(({ property, value }) => property === 'outline' && value === 'none')
    .map(({ file, line }) => ({ file, line, id: 'outline: none' }))
);

/** A throwaway repository committing `base`, whose head is edited and compared by `gate`. */
function repoAt(t, base) {
  const repo = createTempGitRepo('fabricate-logical-sheet-');
  t.after(() => repo.dispose());
  repo.write(base);
  const sha = repo.commitAll('base');
  return {
    dir: repo.dir,
    write: (files) => repo.write(files),
    remove: (...files) => {
      for (const file of files) rmSync(path.join(repo.dir, file));
    },
    compare: (gate = OUTLINE_GATE) =>
      compareDesignSystem({ ...gate, cwd: repo.dir, env: { RATCHET_BASE: sha } }),
  };
}

/** Every line a comparison reports, to prove no partial path ever became an entry key. */
const reported = (result) => [
  ...result.failures,
  ...result.shrank,
  ...result.netted,
  ...result.exempted,
];

const namesNoPartial = (result) =>
  assert.ok(
    reported(result).every((line) => !/styles\/fabricate-[a-z0-9-]+\.css: /u.test(line)),
    reported(result).join('\n')
  );

test('(a) single at base, split at head: compared, with no failure', (t) => {
  const repo = repoAt(t, SINGLE);
  repo.write(SPLIT);
  const result = repo.compare();
  assert.equal(result.compared, true);
  assert.deepEqual(result.failures, []);
  namesNoPartial(result);
});

test('(b) split at base, a partial-only edit adding an offender fails rather than skipping', (t) => {
  const repo = repoAt(t, SPLIT);
  repo.write({ 'styles/fabricate-rules.css': RULES + OFFENDER });
  const sheetOnly = { ...OUTLINE_GATE, include: (file) => file === STYLESHEET_ENTRY };
  for (const gate of [OUTLINE_GATE, sheetOnly]) {
    const result = repo.compare(gate);
    assert.equal(result.compared, true, result.reason);
    assert.equal(result.failures.length, 1, result.failures.join('\n'));
    assert.match(result.failures[0], /^styles\/fabricate\.css: outline: none/u);
  }
});

test('(c) a reasoned marker in a partial excuses its site; an empty one names the partial line', (t) => {
  const repo = repoAt(t, SINGLE);
  const marked = (reason) =>
    splitSheet({
      tokens: TOKENS,
      rules: `${RULES}\n/* ratchet-exempt(design-system):${reason} */\n.fabricate .b {\n  outline: none;\n}\n`,
    });
  repo.write(marked(' a focus ring the host draws'));
  const excused = repo.compare();
  assert.deepEqual(excused.failures, []);
  assert.deepEqual(excused.exempted, [
    'styles/fabricate-rules.css:6 outline: none: a focus ring the host draws',
  ]);
  repo.write(marked(''));
  assert.ok(
    repo.compare().failures.includes(emptyMarkerFailure('styles/fabricate-rules.css', 5)),
    'the empty marker is reported at its partial line'
  );
});

test('(d) a partial renamed, added or removed with an entry edit stays one file', (t) => {
  const repo = repoAt(t, SPLIT);
  repo.remove('styles/fabricate-rules.css');
  repo.write(
    splitSheet({ tokens: TOKENS, rest: RULES, extra: '.fabricate .c {\n  margin: 0;\n}\n' })
  );
  const moved = repo.compare();
  assert.equal(moved.compared, true);
  assert.deepEqual(moved.failures, []);
  namesNoPartial(moved);
  repo.remove('styles/fabricate-rest.css', 'styles/fabricate-extra.css');
  repo.write(splitSheet({ tokens: TOKENS }));
  const removed = repo.compare();
  assert.deepEqual(removed.failures, []);
  assert.deepEqual(removed.shrank, ['styles/fabricate.css: outline: none is gone (was 1)']);
});

test('(e) split at base, single at head: compared, with no failure', (t) => {
  const repo = repoAt(t, SPLIT);
  repo.remove('styles/fabricate-tokens.css', 'styles/fabricate-rules.css');
  repo.write(SINGLE);
  const result = repo.compare();
  assert.equal(result.compared, true);
  assert.deepEqual(result.failures, []);
  namesNoPartial(result);
});

test('(f) a fabricate-*.css the entry does not import fails the integrity check, not a ratchet', (t) => {
  const repo = repoAt(t, SPLIT);
  repo.write({ 'styles/fabricate-stray.css': OFFENDER });
  const result = repo.compare();
  assert.deepEqual(reported(result), []);
  const styles = ['styles/fabricate.css', ...Object.keys(SPLIT), 'styles/fabricate-stray.css'];
  assert.deepEqual(stylesheetIntegrityFailures(checkoutReader(repo.dir), styles), [
    'styles/fabricate-stray.css is not imported by styles/fabricate.css',
  ]);
});

test('the integrity check holds the entry to imports and each partial to its shape', () => {
  const files = {
    ...splitSheet(
      { one: '.fabricate .a {}\n', two: '.fabricate .b {}' },
      {
        entryPrefix: '/* ratchet-exempt(lint): nothing reads this */\n',
      }
    ),
    'styles/fabricate-three.css': `@import url("x.css");\r\n${'.fabricate .c {}\n'.repeat(4001)}`,
  };
  files['styles/fabricate.css'] +=
    '@import url("fabricate-three.css");\n@import url("fabricate-one.css");\n';
  assert.deepEqual(stylesheetIntegrityFailures(mapReader(files), Object.keys(files)), [
    'styles/fabricate.css carries a marker or stylelint directive, which no rule sees',
    'styles/fabricate-two.css does not end with a newline',
    'styles/fabricate-three.css holds an @import',
    'styles/fabricate-three.css holds a carriage return',
    'styles/fabricate-three.css is 4002 lines, over 4000',
    'styles/fabricate-one.css is imported more than once',
  ]);
  assert.deepEqual(stylesheetIntegrityFailures(mapReader(SPLIT), Object.keys(SPLIT)), []);
  assert.deepEqual(stylesheetIntegrityFailures(mapReader(SINGLE), Object.keys(SINGLE)), []);
});

test('a split tree walks as exactly one key holding the joined text', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'fabricate-logical-walk-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [file, text] of Object.entries(SPLIT)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  const corpus = collectWorkingTreeSources([path.join(root, 'styles')], ['.css']);
  assert.equal(Object.keys(corpus).length, 1, Object.keys(corpus).join(', '));
  const [[key, text]] = Object.entries(corpus);
  assert.ok(key.endsWith('styles/fabricate.css'), key);
  assert.equal(text, readStylesheet(mapReader(SPLIT)));
});

const selectedIds = (files) => mapChangedFilesToCases(files).map(({ id }) => id);

test('an edit to any partial selects what an edit to the sheet selects', () => {
  const sheet = selectedIds([STYLESHEET_ENTRY]);
  assert.ok(sheet.length > 0, 'the sheet selects cases');
  const partials = [
    'styles/fabricate-tokens.css',
    'styles/fabricate-manager-shell.css',
    'styles/fabricate-gone.css',
  ];
  for (const partial of partials) {
    assert.deepEqual(selectedIds([partial]), sheet, partial);
    assert.equal(rendersCapture([partial]), rendersCapture([STYLESHEET_ENTRY]), partial);
    assert.equal(hasUiChanges([partial]), hasUiChanges([STYLESHEET_ENTRY]), partial);
  }
  assert.deepEqual(selectedIds(partials), sheet, 'several partials select the sheet’s cases once');
});
