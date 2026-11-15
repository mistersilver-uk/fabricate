/**
 * Every `src/` module is reachable from a shipped entry or is listed as known-dead (issue 1732).
 * Reachability follows static imports, `.svelte` script imports and literal `import()`, from the
 * entry the Vite library build bundles (`module.json` loads only that bundle). The ledger
 * `src-module-reachability.txt` is exact and removal-only: it names every unreachable file, and a
 * file leaves it by being deleted or wired in, never by being added.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { byCodePoint } from './helpers/codePointOrder.js';
import { collectSources, repoRoot } from './helpers/sourceScan.js';
import { walkStaticImports } from './helpers/staticImportGraph.js';

const LEDGER = 'tests/src-module-reachability.txt';
const MAIN = 'src/main.js';

/** Below this the walk has stopped following imports; the real graph reaches ~1,150 files. */
const REACHED_FLOOR = 1000;

const read = (file) => readFileSync(resolve(repoRoot, file), 'utf8');

/** The entries the Vite build bundles, checked against what `module.json` loads. */
function shippedEntries() {
  // ratchet-exempt(source-pin): reads the build config to find its entry, asserts nothing about its style
  const config = read('vite.config.js');
  const entry = /entry:\s*resolve\(import\.meta\.dirname,\s*'([^']+)'\)/u.exec(config)?.[1];
  const fileName = /fileName:\s*'([^']+)'/u.exec(config)?.[1];
  assert.ok(entry && fileName, 'vite.config.js no longer names a library entry and fileName');
  const { esmodules } = JSON.parse(read('module.json'));
  assert.deepEqual(
    esmodules,
    [`${fileName}.js`],
    'module.json loads something the library build does not emit, so its entry is not the whole graph'
  );
  return [entry];
}

function ledger() {
  return read(LEDGER)
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'));
}

function srcFiles() {
  // ratchet-exempt(source-pin): lists the src/ modules and asserts nothing about their text
  const corpus = collectSources(resolve(repoRoot, 'src'), {
    extensions: ['.js', '.mjs', '.svelte'],
  });
  return Object.keys(corpus).sort(byCodePoint);
}

function walk() {
  const { files, computed } = walkStaticImports(repoRoot, shippedEntries(), {
    svelte: true,
    dynamic: true,
  });
  return { reached: new Set(files), computed };
}

test('the walk is live: main.js is reachable and so is most of src/', () => {
  const { reached } = walk();
  assert.ok(reached.has(MAIN));
  assert.ok(reached.size > REACHED_FLOOR, `only ${reached.size} files reached`);
  assert.ok(reached.has('src/ui/publishedComponents.svelte.js'));
  assert.ok(reached.has('src/ui/svelte/components/Rail.svelte'), 'a lazy import() is not followed');
});

test('src/ has no import() whose specifier is not a literal', () => {
  assert.deepEqual(walk().computed, [], 'a computed import() makes reachability unknowable');
});

test('every unreachable src/ module is in the ledger, and the ledger names only unreachable ones', () => {
  const { reached } = walk();
  const files = srcFiles();
  // ratchet-exempt(source-pin): a membership check on the module listing, not on any module's text
  assert.ok(files.includes(MAIN), 'the src listing no longer contains main.js');
  const unreachable = files.filter((file) => !reached.has(file));
  const listed = ledger();
  assert.deepEqual(
    unreachable.filter((file) => !listed.includes(file)),
    [],
    `unreachable from ${MAIN}: delete it, wire it in, or (never) list it in ${LEDGER}`
  );
  assert.deepEqual(
    listed.filter((file) => !existsSync(resolve(repoRoot, file))),
    [],
    `${LEDGER} lists a file that no longer exists; remove the row`
  );
  assert.deepEqual(
    listed.filter((file) => reached.has(file)),
    [],
    `${LEDGER} lists a file that is reachable again; remove the row`
  );
  assert.deepEqual([...listed].sort(byCodePoint), listed, `${LEDGER} must stay sorted`);
  assert.equal(new Set(listed).size, listed.length, `${LEDGER} has a duplicate row`);
});
