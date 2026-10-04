/**
 * Local `text` helpers (issue 1521): `src/ui/svelte/util/localizeOr.js` is the one implementation, so
 * no design-system member defines its own and no changed `src/` file newly defines one. A merge-base
 * gate (engine: `mergeBaseRatchet.js`): a file may keep the helper it already has, and may not add one.
 */
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { DESIGN_SYSTEM_PRIMITIVES } from '../scripts/lib/designSystemPrimitives.js';

import { compareToBase, reportComparison } from './helpers/mergeBaseRatchet.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const FAMILY = 'text-helper';
const CORPUS_ROOT = 'src';
const TEXT_HELPER = /\b(function\s+text\s*\(|(const|let)\s+text\s*=)/;

/** Below this many defining files the matcher has stopped seeing them (~200 today). */
const MATCH_FLOOR = 150;

const inCorpus = (file) => file.startsWith(`${CORPUS_ROOT}/`) && /\.(svelte|m?js)$/u.test(file);

/** One entry per file that defines a local `text` helper. */
function measureTextHelpers(readFile, listFiles) {
  return listFiles().flatMap((file) => {
    const text = readFile(file);
    const match = text === undefined ? null : TEXT_HELPER.exec(text);
    if (!match) return [];
    const line = text.slice(0, match.index).split('\n').length;
    return [{ file, id: 'local text helper', value: 'text-helper', amount: 1, lines: [line] }];
  });
}

const compareTextHelpers = (options = {}) =>
  compareToBase({
    family: FAMILY,
    corpusRoot: CORPUS_ROOT,
    include: inCorpus,
    measure: measureTextHelpers,
    headMarkers: false,
    siteMarkers: true,
    ...options,
  });

const GUIDANCE =
  'Import `localizeOr` from `src/ui/svelte/util/localizeOr.js` instead of defining a local `text` ' +
  'helper. If one must stay, mark its line with `// ratchet-exempt(text-helper): <reason>`.';

// ratchet-exempt(source-pin): scans src/ for the matcher's floor and the members, not their text
const sources = collectSources(`${repoRoot}/src`);

describe('the text-helper ratchet', () => {
  it('no changed src/ file newly defines a local text helper', (t) => {
    const result = reportComparison(t, compareTextHelpers(), GUIDANCE);
    if (result.compared) t.diagnostic(`compared ${result.changedCount} changed path(s)`);
  });

  it('the pattern matches each helper shape and nothing that merely reads a `text`', () => {
    for (const shape of ['function text(key) {}', 'const text = (k) => k;', 'let text= input;']) {
      assert.ok(TEXT_HELPER.test(shape), shape);
    }
    for (const shape of ['const textual = 1;', 'node.text(k);', '{ text: copy }', 'subtext = 1']) {
      assert.ok(!TEXT_HELPER.test(shape), shape);
    }
  });

  it('still finds its floor of defining files', (t) => {
    const defining = Object.keys(sources).filter(
      (file) => inCorpus(file) && TEXT_HELPER.test(sources[file])
    );
    t.diagnostic(`${defining.length} files define a local text helper`);
    assert.ok(
      defining.length >= MATCH_FLOOR,
      `only ${defining.length} defining files found, below the floor of ${MATCH_FLOOR}; a matcher ` +
        'that stopped matching would look exactly like this'
    );
  });

  it('no design-system member defines a local text helper', () => {
    const members = DESIGN_SYSTEM_PRIMITIVES.map((row) => row.path);
    assert.ok(members.length > 50, 'the manifest still lists its members');
    assert.ok(
      members.every((file) => Object.hasOwn(sources, file)),
      'every member is a scanned file'
    );
    assert.deepEqual(
      members.filter((file) => TEXT_HELPER.test(sources[file])),
      [],
      'a member localizes through `localizeOr`'
    );
  });
});

const repos = [];
after(() => {
  for (const repo of repos) repo.dispose();
});

/** A repository whose first commit holds `files`; the gate compares its working tree with it. */
function srcRepo(files) {
  const repo = createTempGitRepo('text-helper-ratchet-');
  repos.push(repo);
  repo.write(files);
  const first = repo.commitAll('base');
  const compare = () => compareTextHelpers({ cwd: repo.dir, env: { RATCHET_BASE: first } });
  return { write: repo.write, compare };
}

describe('the text-helper ratchet on a temporary repository', () => {
  it('wiring: a new file defining a helper fails the gate', (t) => {
    const repo = srcRepo({ 'src/a.svelte': '<p>a</p>\n' });
    repo.write({ 'src/a.svelte': '<p>a changed</p>\n' });
    assert.deepEqual(repo.compare().failures, []);
    repo.write({
      'src/b.svelte': '<script>\n  function text(key) {\n    return key;\n  }\n</script>\n',
    });
    const result = repo.compare();
    assert.deepEqual(result.failures, ['src/b.svelte: local text helper is new (1)']);
    assert.throws(() => reportComparison(t, result, GUIDANCE), /text-helper: 1 regression/);
  });

  it('a deleted helper reports shrank, and a kept one is not an offender', () => {
    const helper = 'const text = (key) => key;\n';
    const repo = srcRepo({ 'src/a.js': helper, 'src/b.js': helper });
    repo.write({
      'src/a.js': 'export const a = 1;\n',
      'src/b.js': `${helper}export const b = 1;\n`,
    });
    const result = repo.compare();
    assert.deepEqual(result.failures, []);
    assert.equal(result.shrank.length, 1);
    assert.match(result.shrank[0], /src\/a\.js/);
  });
});
