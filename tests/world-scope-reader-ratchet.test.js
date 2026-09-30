/**
 * Bounds the raw reads of a crafting system's `components`, `essenceDefinitions` and `tools` under
 * `src/` (issue 1370) against the base commit: no changed file may gain an unmarked one. A read
 * that must stay raw carries `// ratchet-exempt(world-scope): <reason>` at its line, naming one of
 * the `REASONS` below; a file-head marker excuses nothing. Engine: `mergeBaseRatchet.js`.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  compareToBase,
  parseMarkers,
  reportComparison,
  siteMarker,
} from './helpers/mergeBaseRatchet.js';
import { collectSources, repoRoot, stripComments } from './helpers/sourceScan.js';
import { createTempGitRepo } from './helpers/temp-git-repo.js';

const FAMILY = 'world-scope';
const CORPUS_ROOT = 'src';

/** Below this many raw reads in the whole tree the matcher has stopped seeing them (~170 today). */
const MATCH_FLOOR = 120;

/**
 * The matcher: a DOT access, or a BRACKET access with a string literal. The bracket form is the one
 * place a receiver IS required, and only to tell `system['components']` from an ARRAY LITERAL.
 */
const MATCHER = /(?:\.|[\w$)\]]\[\s*['"])(?:components|essenceDefinitions|tools)\b/g;
const READ_NAME = /(?:components|essenceDefinitions|tools)$/u;

/** The directories the sweep did not enter, and the file whose bare string constants are JSON paths. */
const EXCLUDED_PREFIXES = Object.freeze(['src/ui/', 'src/migration/']);
const PATH_CONSTANT_FILES = Object.freeze(new Set(['src/systems/worldScopeReferenceRewrite.js']));
const STRING_CONSTANT_LINE = /^\s*'[^']*',?\s*$/;

/** Every reason a raw read may still be here; a marker's reason starts with one of these codes. */
const REASONS = Object.freeze({
  writer:
    "the manager's own authoring and writer surface: a reader repoint would make the manager " +
    'write to a merged read row instead of the persisted record',
  'authoring-accessor':
    '`getItems` is the authoring and browse accessor the world catalogue routes take over',
  basis:
    'the Valid Id BASIS, which is deliberately NOT membership-filtered and must never be narrowed',
  restamp: 'the durable-identity restamp, whose subject is the persisted record',
  'pre-persist':
    'the pre-persist alchemy injector, which validates a not-yet-saved system against itself',
  'destructive-basis':
    'a destructive prune basis: widening or narrowing it deletes real data, so it reads the ' +
    'persisted record',
  import: 'the import path builds the system from the in-system arrays for every field',
  'rewrite-walk':
    'the shared reference walk rewrites the raw payload in place, so it reads the in-system ' +
    'arrays that payload carries',
  export: 'the export path writes the in-system arrays at schema 6',
  guard:
    'an `Array.isArray` GUARD whose consequent IS repointed; the guard asks what the record ' +
    'carries, which is a different question from what the reader reads',
  parameter: 'this module takes the candidate set as a PARAMETER and needs no change',
  'not-a-system':
    'the receiver is not a crafting system — a validation result, a chat view-model, a task, a ' +
    'memo guard tuple or a paged browser model',
});

const inCorpus = (file) =>
  file.startsWith(`${CORPUS_ROOT}/`) &&
  file.endsWith('.js') &&
  EXCLUDED_PREFIXES.every((prefix) => !file.startsWith(prefix));

/** Each matched line's raw reads, counted per read name: `{line, text, name, count}`. */
function rawReads(file, text) {
  const skipConstants = PATH_CONSTANT_FILES.has(file);
  return stripComments(text)
    .split('\n')
    .flatMap((line, index) => {
      if (skipConstants && STRING_CONSTANT_LINE.test(line)) return [];
      const counts = new Map();
      for (const [match] of line.matchAll(MATCHER)) {
        const name = READ_NAME.exec(match)[0];
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return [...counts].map(([name, count]) => ({
        line: index + 1,
        text: line.trim(),
        name,
        count,
      }));
    });
}

/**
 * One entry per unmarked raw read: keyed by its line's text, netted on the read name, so a
 * reformat or a moved line is not an offender. A read whose line carries a reasoned marker is
 * not counted, so a file's count is the reads that give no reason.
 */
function measureRawReads(readFile, listFiles) {
  return listFiles().flatMap((file) => {
    const text = readFile(file);
    if (text === undefined) return [];
    const marked = text.includes(`ratchet-exempt(${FAMILY})`);
    return rawReads(file, text)
      .filter((read) => !marked || !siteMarker(file, text, FAMILY, read.line))
      .map((read) => ({
        file,
        id: `raw ${read.name} read \`${read.text}\``,
        value: read.name,
        amount: read.count,
        lines: [read.line],
      }));
  });
}

const compareRawReads = (options = {}) =>
  compareToBase({
    family: FAMILY,
    corpusRoot: CORPUS_ROOT,
    include: inCorpus,
    measure: measureRawReads,
    headMarkers: false,
    ...options,
  });

const GUIDANCE =
  "A raw read of a crafting system's `components`, `essenceDefinitions` or `tools` bypasses the " +
  'world-scope read union: repoint it at `resolvedComponentsFor`, `resolvedEssencesFor` or ' +
  '`resolvedToolsFor`. If it must stay raw, mark its line, or the comment line right above it, ' +
  'with a reason that starts with a REASONS code from tests/world-scope-reader-ratchet.test.js ' +
  `(${Object.keys(REASONS).join(', ')}).`;

/** The working tree's corpus: every scanned file and its text. */
function treeCorpus() {
  // ratchet-exempt(source-pin): scans src/ for the matcher's floor and marker reasons, not its text
  const sources = collectSources(resolve(repoRoot, CORPUS_ROOT), { extensions: ['.js'] });
  return Object.entries(sources).filter(([file]) => inCorpus(file));
}

describe('the world-scope reader ratchet', () => {
  it('no changed file under src/ gains an unmarked raw read against the base commit', (t) => {
    const result = reportComparison(t, compareRawReads(), GUIDANCE);
    if (result.compared) t.diagnostic(`compared ${result.changedCount} changed path(s)`);
  });

  it('still finds its floor of raw reads, and every marker names a known reason', (t) => {
    let matches = 0;
    const unknown = [];
    for (const [file, text] of treeCorpus()) {
      for (const read of rawReads(file, text)) matches += read.count;
      for (const marker of parseMarkers(file, text)) {
        if (marker.family !== FAMILY) continue;
        const [code] = marker.reason.split(/[\s,:;]/u, 1);
        if (!Object.hasOwn(REASONS, code)) unknown.push(`${file}:${marker.line} ${marker.reason}`);
      }
    }
    t.diagnostic(`${matches} raw reads in the tree`);
    assert.ok(
      matches >= MATCH_FLOOR,
      `only ${matches} raw reads found, below the floor of ${MATCH_FLOOR}; a matcher that stopped ` +
        'matching would look exactly like this'
    );
    assert.deepEqual(unknown, [], `a world-scope marker's reason starts with a REASONS code`);
  });

  it('matches a RAW read and stops matching a REPOINTED one', () => {
    const raw = 'const components = Array.isArray(system?.components) ? system.components : [];';
    const repointed = 'const components = resolvedComponentsFor(system);';
    assert.equal(raw.match(MATCHER)?.length, 2, 'the premise: a raw read really is matchable');
    assert.equal(repointed.match(MATCHER), null, 'and a repointed one is not');
    assert.equal('essences.componentsOf(x)'.match(MATCHER), null, '`\\b` bounds the match');
    assert.equal('a.essenceDefinitions'.match(MATCHER)?.length, 1);
  });

  it('strips comments before matching, so prose describing a retired read is not a site', () => {
    const commented = '// reads system.components directly\nconst x = 1;';
    assert.equal(stripComments(commented).match(MATCHER), null);
    assert.equal(commented.match(MATCHER)?.length, 1, 'the premise: the prose WOULD have matched');
  });
});

const repos = [];
after(() => {
  for (const repo of repos) repo.dispose();
});

/** A repository whose first commit holds `files`; the gate compares its working tree with it. */
function srcRepo(files) {
  const repo = createTempGitRepo('world-scope-ratchet-');
  repos.push(repo);
  repo.write(files);
  const first = repo.commitAll('base');
  const compare = () => compareRawReads({ cwd: repo.dir, env: { RATCHET_BASE: first } });
  return { write: repo.write, compare };
}

const lines = (...rows) => `${rows.join('\n')}\n`;
const READ = 'const tools = system.tools;';
const MARKED = `${READ} // ratchet-exempt(world-scope): writer`;

describe('the world-scope ratchet on a temporary repository', () => {
  it('wiring: an injected raw read fails the gate, which a repointed one does not', (t) => {
    const repo = srcRepo({ 'src/a.js': lines('export const a = 1;') });
    repo.write({ 'src/a.js': lines('export const a = resolvedToolsFor(system);') });
    assert.deepEqual(repo.compare().failures, []);
    repo.write({ 'src/a.js': lines('export const a = 1;', READ) });
    const result = repo.compare();
    assert.deepEqual(result.failures, [`src/a.js: raw tools read \`${READ}\` is new (1)`]);
    assert.throws(() => reportComparison(t, result, GUIDANCE), /world-scope: 1 regression/);
  });

  it('both legs: a new file with a raw read, and a file that already reads gaining one', () => {
    const repo = srcRepo({ 'src/old.js': lines('const components = system.components;') });
    repo.write({
      'src/new.js': lines(READ),
      'src/old.js': lines('const components = system.components;', 'use(system.components);'),
    });
    assert.deepEqual(repo.compare().failures, [
      `src/new.js: raw tools read \`${READ}\` is new (1)`,
      'src/old.js: raw components read `use(system.components);` is new (1)',
    ]);
  });

  it('a reformat or a moved line is netted on the read name, not an offender', () => {
    const repo = srcRepo({ 'src/a.js': lines('function f() {', `  ${READ}`, '}', 'const x = 1;') });
    repo.write({
      'src/a.js': lines(
        'const x = 1;',
        'function f() {',
        '  const tools =',
        '    system.tools;',
        '}'
      ),
    });
    const result = repo.compare();
    assert.deepEqual(result.failures, []);
    assert.equal(result.netted.length, 1);
  });

  it('sentinel: a changed corpus file compares, and a change outside the corpus is a skip', () => {
    const repo = srcRepo({
      'src/a.js': lines(READ),
      'src/ui/b.js': lines('export const b = 1;'),
      'README.md': 'x\n',
    });
    repo.write({ 'src/ui/b.js': lines(READ), 'README.md': 'y\n' });
    assert.equal(repo.compare().skipped, 'corpus-unchanged');
    repo.write({ 'src/a.js': lines(READ, 'export const touched = 1;') });
    const result = repo.compare();
    assert.equal(result.compared, true);
    assert.deepEqual(result.failures, []);
  });

  it('a reasoned marker at the read exempts it, and an empty one fails', () => {
    const repo = srcRepo({ 'src/a.js': lines('export {};'), 'src/b.js': lines('export {};') });
    repo.write({
      'src/a.js': lines('export {};', MARKED, '// ratchet-exempt(world-scope): guard', READ),
      'src/b.js': lines('export {};', `${READ} // ratchet-exempt(world-scope):`),
    });
    const result = repo.compare();
    assert.deepEqual(result.exempted, [], 'a marked read is not counted at all');
    assert.deepEqual(result.failures, [
      `src/b.js: raw tools read \`${READ}\` is new (1); its ratchet-exempt marker gives no reason`,
      'src/b.js:2 has a ratchet-exempt(world-scope) marker with no reason; write why the ' +
        'regression is legitimate after the colon',
    ]);
  });

  it('a marker excuses its own read only: not a copy of the line, and not from the file head', () => {
    const repo = srcRepo({ 'src/a.js': lines('export {};', MARKED) });
    repo.write({ 'src/a.js': lines('export {};', MARKED, READ) });
    assert.deepEqual(repo.compare().failures, [`src/a.js: raw tools read \`${READ}\` is new (1)`]);
    repo.write({
      'src/a.js': lines(
        '// ratchet-exempt(world-scope): writer',
        'export {};',
        MARKED,
        'use(system.tools);'
      ),
    });
    assert.deepEqual(repo.compare().failures, [
      'src/a.js: raw tools read `use(system.tools);` is new (1)',
    ]);
  });

  it('negative proof on the real tree: a new raw tools read in a marked file fails', () => {
    const file = 'src/systems/manager/toolSources.js';
    // ratchet-exempt(source-pin): a real file as the gate's corpus, to prove a new read in it fails
    const text = readFileSync(resolve(repoRoot, file), 'utf8');
    assert.ok(rawReads(file, text).length > 0, 'the premise: this file reads `tools` raw today');
    const repo = srcRepo({ [file]: text });
    repo.write({ [file]: `${text}export const extra = (system) => system.tools;\n` });
    assert.deepEqual(repo.compare().failures, [
      `${file}: raw tools read \`export const extra = (system) => system.tools;\` is new (1)`,
    ]);
  });
});
