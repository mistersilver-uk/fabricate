/**
 * THE ARCHIVE-COMPLETENESS GATE (issue 1565).
 *
 * The defect this exists for: a client holding a cached entry script asks for a hashed chunk the
 * installed package no longer contains. Nothing in the release path proved the reverse case —
 * that an archive we PUBLISH carries every file its own entry script asks for. `validateDist`
 * checks only manifest-listed files, and `verifyManagerChunkSplit` reads `dist/`, not the
 * archive, so a packaging regression that dropped `chunks/` would have shipped with green gates.
 *
 * WHY THE POSITIVE CASES USE THE REAL `zipDirectory`. A gate that reads archives has to be
 * proven against archives a real producer made, because the interesting failures are all in the
 * member names: `zip -r` writes bare POSIX names, bsdtar `tar -a` on Windows writes `./`-prefixed
 * ones, and `Compress-Archive` has historically written backslashes. The real producer here emits
 * only the first shape, so the other two are HAND-BUILT central directories further down — the
 * only honest way to exercise a name shape this machine cannot produce.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import test, { after } from 'node:test';

import { zipDirectory } from '../scripts/lib/zip.js';
import {
  ARCHIVE_CHUNK_GATE_LABEL,
  ARCHIVE_GATE_SKIPPED_MESSAGE,
  archiveNameMismatchMessage,
  assertArchiveChunkCompleteness,
  extractModuleReferences,
  findMissingChunkReferences,
  isReleaseZipName,
  normalizeArchiveMemberName,
  releaseZipName,
} from '../scripts/lib/releaseZipChunks.js';

// AT MODULE SCOPE, so no execution order can get past it. Every negative row below asserts the
// gate's own label as an `includes` FRAGMENT, and `includes('')` is true of any string at all — so
// an accidentally empty label would make each of those rows pass over any message, or none. The
// same guard the console literals carry in `tests/release-build.test.js`, for the same reason.
assert.equal(typeof ARCHIVE_CHUNK_GATE_LABEL, 'string', 'the gate label must be a string');
assert.ok(
  ARCHIVE_CHUNK_GATE_LABEL.length > 0,
  'the gate label must be non-empty, or every includes() of it below is vacuously true'
);

/**
 * Run `act` and hand back the error it threw. `assert.throws` returns nothing, and every negative
 * proof here has to inspect the MESSAGE: several distinct refusals live in one function, and
 * "it threw" cannot tell them apart.
 *
 * @param {() => unknown} act The call under test.
 * @returns {Error} The thrown error.
 */
function captureThrow(act) {
  try {
    act();
  } catch (error) {
    return error;
  }
  throw new assert.AssertionError({ message: 'expected the call to throw, and it did not' });
}

/**
 * Build a `dist/`-shaped tree and zip it with the REAL producer, ONCE PER DISTINCT TREE.
 *
 * Memoised on the tree object because several rows check different manifests against the same
 * archive, and `zipDirectory` shells out to the platform zip with `stdio: 'inherit'` — so each
 * extra call is both a subprocess and a block of "adding: ..." noise in the test log.
 *
 * @param {Record<string, string>} files Archive-relative POSIX paths to file contents.
 * @returns {Promise<string>} Absolute path to the archive.
 */
const archives = new Map();
const archiveRoots = [];
async function realArchive(files) {
  if (archives.has(files)) return archives.get(files);
  const root = await mkdtemp(join(tmpdir(), 'fab-zip-chunks-'));
  archiveRoots.push(root);
  const distDir = join(root, 'dist');
  await mkdir(distDir, { recursive: true });
  for (const [relative, contents] of Object.entries(files)) {
    const target = join(distDir, ...relative.split('/'));
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, contents);
  }
  const zipPath = join(root, 'fabricate-v9.9.9-gate.zip');
  zipDirectory(distDir, zipPath);
  archives.set(files, zipPath);
  return zipPath;
}

after(async () => {
  await Promise.all(archiveRoots.map((root) => rm(root, { recursive: true, force: true })));
});

/** An entry script that statically imports one chunk and dynamically imports another. */
const ENTRY_WITH_TWO_CHUNKS = [
  'import { a } from "./chunks/stepperLabels-B55zKjAi.js";',
  'const open = () => import("./chunks/SvelteCraftingSystemManagerApp.svelte-CBQCGwzn.js");',
  'export { a, open };',
].join('\n');

const COMPLETE_TREE = Object.freeze({
  'module.json': JSON.stringify({ id: 'fabricate', esmodules: ['main.js'] }),
  'main.js': ENTRY_WITH_TWO_CHUNKS,
  'chunks/stepperLabels-B55zKjAi.js': 'export const a = 1;\n',
  'chunks/SvelteCraftingSystemManagerApp.svelte-CBQCGwzn.js': 'export const show = () => {};\n',
});

/** The tree above with the dynamically imported chunk dropped, and nothing else changed. */
const SHORT_TREE = Object.freeze(
  Object.fromEntries(
    Object.entries(COMPLETE_TREE).filter(
      ([name]) => name !== 'chunks/SvelteCraftingSystemManagerApp.svelte-CBQCGwzn.js'
    )
  )
);

// ───────────────────────────────────────────────────────────────────────────
// The archive assertion, over archives the real producer made.
//
// One table, because every row is the same three steps over a different tree and manifest, and a
// per-row copy of them is exactly the near-identical block the duplication gate fails.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Each row: what it is, the tree to zip, the manifest to check it against, and either `null` for
 * "must not throw" or the substrings the thrown message MUST carry. A row that expects a failure
 * names the GATE and the offending MEMBER, never merely "it threw" — several distinct refusals
 * live in this one function and a bare rejection cannot tell them apart.
 */
const ARCHIVE_ROWS = [
  {
    name: 'a complete archive passes',
    tree: COMPLETE_TREE,
    manifest: { esmodules: ['main.js'] },
    expect: null,
  },
  {
    name: 'an archive short a referenced chunk fails, naming the missing member',
    tree: SHORT_TREE,
    manifest: { esmodules: ['main.js'] },
    expect: [
      ARCHIVE_CHUNK_GATE_LABEL,
      'chunks/SvelteCraftingSystemManagerApp.svelte-CBQCGwzn.js',
      'main.js',
    ],
  },
  {
    name: 'an entry member absent from the archive fails, naming the entry',
    tree: COMPLETE_TREE,
    manifest: { esmodules: ['not-shipped.js'] },
    expect: [ARCHIVE_CHUNK_GATE_LABEL, 'not-shipped.js', 'absent'],
  },
  {
    name: 'absent esmodules fails rather than passing vacuously',
    tree: COMPLETE_TREE,
    manifest: { id: 'fabricate' },
    expect: [ARCHIVE_CHUNK_GATE_LABEL, 'esmodules'],
  },
  {
    name: 'empty esmodules fails rather than passing vacuously',
    tree: COMPLETE_TREE,
    manifest: { esmodules: [] },
    expect: [ARCHIVE_CHUNK_GATE_LABEL, 'esmodules'],
  },
  {
    name: 'an entry that references nothing at all fails as unread rather than passing',
    tree: {
      'module.json': '{}',
      'main.js': 'export const noop = () => {};\n',
    },
    manifest: { esmodules: ['main.js'] },
    expect: [ARCHIVE_CHUNK_GATE_LABEL, 'main.js', 'no module files'],
  },
  {
    name: 'a chunk reachable only through another chunk is still required',
    tree: {
      'module.json': '{}',
      'main.js': 'import "./chunks/first-AAAA.js";\n',
      'chunks/first-AAAA.js': 'import "./second-BBBB.js";\nexport const a = 1;\n',
    },
    manifest: { esmodules: ['main.js'] },
    expect: [ARCHIVE_CHUNK_GATE_LABEL, 'chunks/second-BBBB.js', 'chunks/first-AAAA.js'],
  },
  {
    // r3 review finding 7. The read predicate used to be `.js`-only, so a `main.mjs` entry was
    // never read and this archive — which is COMPLETE — was refused as "read but references
    // nothing", a message naming the wrong cause entirely.
    name: 'an entry named .mjs is read rather than reported as referencing nothing',
    tree: {
      'module.json': '{}',
      'main.mjs': 'import "./chunks/first-AAAA.js";\n',
      'chunks/first-AAAA.js': 'export const a = 1;\n',
    },
    manifest: { esmodules: ['main.mjs'] },
    expect: null,
  },
  {
    name: 'a .mjs entry short a chunk names the missing member, not the unread refusal',
    tree: {
      'module.json': '{}',
      'main.mjs': 'import "./chunks/gone-AAAA.js";\n',
    },
    manifest: { esmodules: ['main.mjs'] },
    expect: [ARCHIVE_CHUNK_GATE_LABEL, 'chunks/gone-AAAA.js', 'main.mjs'],
  },
  {
    name: 'every listed entry is checked, not only the first',
    tree: COMPLETE_TREE,
    manifest: { esmodules: ['main.js', 'also-missing.js'] },
    expect: [ARCHIVE_CHUNK_GATE_LABEL, 'also-missing.js', 'absent'],
  },
];

for (const row of ARCHIVE_ROWS) {
  test(`assertArchiveChunkCompleteness: ${row.name}`, async () => {
    const zipPath = await realArchive(row.tree);
    const run = () => assertArchiveChunkCompleteness({ zipPath, manifest: row.manifest });
    if (row.expect === null) {
      run();
      return;
    }
    const error = captureThrow(run);
    for (const fragment of row.expect) {
      assert.ok(
        error.message.includes(fragment),
        `message must carry ${JSON.stringify(fragment)}; got: ${error.message}`
      );
    }
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Member-name shapes this machine's producer cannot emit, as hand-built archives.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Write a minimal STORED (method 0) zip whose member names are written VERBATIM, in both the
 * local headers and the central directory. `zipDirectory` cannot produce a `./`-prefixed or
 * backslash-separated name on this platform, so the only way to exercise those shapes is to
 * write the central directory by hand.
 *
 * @param {string} zipPath Absolute path of the archive to create.
 * @param {Array<[string, string]>} members Verbatim member names with their contents.
 * @returns {void}
 */
function writeStoredZip(zipPath, members) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, contents] of members) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.from(contents, 'utf8');
    const sum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04_03_4b_50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    localParts.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02_01_4b_50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10); // stored
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06_05_4b_50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);
  writeFileSync(zipPath, Buffer.concat([...localParts, central, eocd]));
}

/**
 * The two producer shapes, as the member names each would write for the SAME complete tree, plus
 * the directory entry a real producer also records. If normalisation were dropped, `readEntry`'s
 * exact-name match would miss the entry script and the gate would refuse a complete archive.
 */
const HAND_BUILT_SHAPES = [
  {
    name: 'bsdtar-style ./-prefixed member names',
    members: [
      ['./main.js', 'import "./chunks/only-ZZZZ.js";\n'],
      ['./chunks/', ''],
      ['./chunks/only-ZZZZ.js', 'export const a = 1;\n'],
    ],
  },
  {
    name: 'Compress-Archive-style backslash-separated member names',
    members: [
      ['main.js', 'import "./chunks/only-ZZZZ.js";\n'],
      ['chunks\\only-ZZZZ.js', 'export const a = 1;\n'],
    ],
  },
];

for (const shape of HAND_BUILT_SHAPES) {
  test(`assertArchiveChunkCompleteness accepts ${shape.name}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'fab-zip-shapes-'));
    try {
      const zipPath = join(root, 'fabricate-v9.9.9-shape.zip');
      writeStoredZip(zipPath, shape.members);
      assertArchiveChunkCompleteness({ zipPath, manifest: { esmodules: ['main.js'] } });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('a hand-built archive short its one chunk still fails, whatever the name shape', async () => {
  const root = await mkdtemp(join(tmpdir(), 'fab-zip-shapes-'));
  try {
    const zipPath = join(root, 'fabricate-v9.9.9-shape.zip');
    writeStoredZip(zipPath, [['./main.js', 'import "./chunks/only-ZZZZ.js";\n']]);
    const error = captureThrow(() =>
      assertArchiveChunkCompleteness({ zipPath, manifest: { esmodules: ['./main.js'] } })
    );
    assert.ok(error.message.includes('chunks/only-ZZZZ.js'), error.message);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// The pure parts.
// ───────────────────────────────────────────────────────────────────────────

test('normalizeArchiveMemberName folds every producer shape onto one name', () => {
  assert.equal(normalizeArchiveMemberName('main.js'), 'main.js');
  assert.equal(normalizeArchiveMemberName('./main.js'), 'main.js');
  assert.equal(normalizeArchiveMemberName('chunks\\only.js'), 'chunks/only.js');
  assert.equal(normalizeArchiveMemberName('.\\chunks\\only.js'), 'chunks/only.js');
});

test('normalizeArchiveMemberName rejects the directory entries a producer also records', () => {
  // A directory member carries no data, so treating one as a file would have the gate try to read
  // bytes that do not exist.
  assert.equal(normalizeArchiveMemberName('chunks/'), null);
  assert.equal(normalizeArchiveMemberName('./chunks/'), null);
  assert.equal(normalizeArchiveMemberName('chunks\\'), null);
  assert.equal(normalizeArchiveMemberName(''), null);
  assert.equal(normalizeArchiveMemberName('./'), null);
});

test('extractModuleReferences resolves a specifier against the referring member, not the root', () => {
  assert.deepEqual(extractModuleReferences('main.js', 'import "./chunks/a-1.js";'), [
    'chunks/a-1.js',
  ]);
  // The interesting case: a chunk's own sibling import is NOT a root-relative path.
  assert.deepEqual(extractModuleReferences('chunks/a-1.js', 'import "./b-2.js";'), [
    'chunks/b-2.js',
  ]);
  assert.deepEqual(extractModuleReferences('chunks/a-1.js', 'import "../vendor/c-3.js";'), [
    'vendor/c-3.js',
  ]);
});

test('extractModuleReferences ignores a relative string that is not a module reference', () => {
  // Measured against a real `dist/`: the manager chunk carries the literal
  // "../library/LibraryCard.svelte", which is data, not something the host ever fetches.
  assert.deepEqual(extractModuleReferences('chunks/a-1.js', 'const p = "../library/Card.svelte";'), []);
  assert.deepEqual(extractModuleReferences('main.js', 'const p = "icons/svg/item-bag.svg";'), []);
});

test('extractModuleReferences reports each referenced member once', () => {
  const source = 'import "./chunks/a-1.js";\nconst l = () => import("./chunks/a-1.js");';
  assert.deepEqual(extractModuleReferences('main.js', source), ['chunks/a-1.js']);
});

test('findMissingChunkReferences returns an empty missing list for an entry that references nothing', () => {
  // The OTHER direction from the archive row above: the pure helper is right to report nothing
  // missing here, and it is the archive assertion that refuses a zero-reference entry as unread.
  const result = findMissingChunkReferences({
    entryNames: ['main.js'],
    memberNames: ['main.js'],
    readMember: () => 'export const noop = () => {};',
  });
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.referenced, []);
  assert.deepEqual(result.entriesAbsent, []);
});

test('findMissingChunkReferences follows references transitively and attributes each miss', () => {
  const texts = {
    'main.js': 'import "./chunks/a-1.js";',
    'chunks/a-1.js': 'import "./b-2.js";\nimport "./c-3.js";',
    'chunks/b-2.js': 'export const b = 1;',
  };
  const result = findMissingChunkReferences({
    entryNames: ['main.js'],
    memberNames: Object.keys(texts),
    readMember: (name) => texts[name],
  });
  assert.deepEqual(result.missing, [{ name: 'chunks/c-3.js', referencedBy: 'chunks/a-1.js' }]);
  assert.deepEqual(result.referenced.toSorted(), [
    'chunks/a-1.js',
    'chunks/b-2.js',
    'chunks/c-3.js',
  ]);
});

test('findMissingChunkReferences survives a reference cycle and still reaches both members', () => {
  const texts = {
    'main.js': 'import "./chunks/a-1.js";',
    'chunks/a-1.js': 'import "./b-2.js";',
    'chunks/b-2.js': 'import "./a-1.js";',
  };
  const result = findMissingChunkReferences({
    entryNames: ['main.js'],
    memberNames: Object.keys(texts),
    readMember: (name) => texts[name],
  });
  assert.deepEqual(result.missing, []);
  // Not just "it returned": both cycle members must have been REACHED, or a walk that bailed out
  // of the cycle early would look identical here.
  assert.deepEqual(result.referenced.toSorted(), ['chunks/a-1.js', 'chunks/b-2.js']);

  // r3 review finding 4. Terminating here rests on the walk's `visited` check, and removing it
  // makes the loop spin SYNCHRONOUSLY and forever — which `node --test`'s timeout cannot
  // interrupt, because that is a timer and the event loop never turns. CI would hang to the job
  // timeout while the queue grew without limit. The walk therefore also refuses once it has
  // dequeued more members than the archive holds, so a broken guard fails fast and named. That
  // bound is unreachable through this API while the guard works (only present members are ever
  // enqueued, at most once each), so it is proved by mutation control rather than asserted here.
});

test('the name-mismatch refusal names both archive names and does not read as a skip', () => {
  // r3 review finding 5's message, checked here as a unit; `tests/release-build.test.js` proves
  // `release.js` actually exits non-zero with it.
  const message = archiveNameMismatchMessage('fabricate-v0.1.0.zip', ['fabricate-v1.9.5.zip']);
  assert.ok(message.includes(ARCHIVE_CHUNK_GATE_LABEL), 'must carry the gate label');
  assert.ok(message.includes('fabricate-v0.1.0.zip'), 'must name the archive it looked for');
  assert.ok(message.includes('fabricate-v1.9.5.zip'), 'must name the archive it found');
  assert.ok(
    !/\bskipp/i.test(message),
    `a present-but-differently-named archive is a refusal, not a skip: ${message}`
  );
});

test('isReleaseZipName recognises a published archive and nothing else', () => {
  assert.ok(isReleaseZipName(releaseZipName('1.9.5')));
  assert.ok(isReleaseZipName(releaseZipName('9.9.9-wiretest')));
  // The names that share dist/ with it, none of which are an archive under another version.
  for (const name of ['module.json', 'main.js', 'fabricate.zip', 'fabricate-v1.9.5.zip.map']) {
    assert.ok(!isReleaseZipName(name), `${name} must not read as a published archive`);
  }
});

test('findMissingChunkReferences reports an absent entry rather than reading it', () => {
  const result = findMissingChunkReferences({
    entryNames: ['main.js'],
    memberNames: ['module.json'],
    readMember: () => {
      throw new Error('an absent entry must never be read');
    },
  });
  assert.deepEqual(result.entriesAbsent, ['main.js']);
});

test('releaseZipName is the single source of the published archive name', () => {
  assert.equal(releaseZipName('1.9.5'), 'fabricate-v1.9.5.zip');
  assert.equal(releaseZipName('2.0.0-beta.3'), 'fabricate-v2.0.0-beta.3.zip');
});

test('the skip message says the gate did not run rather than that it passed', () => {
  // The spec requires a build that produces no archive to report that the proof did not run.
  assert.ok(ARCHIVE_GATE_SKIPPED_MESSAGE.includes(ARCHIVE_CHUNK_GATE_LABEL));
  assert.match(ARCHIVE_GATE_SKIPPED_MESSAGE, /skipp/i);
  assert.ok(
    !/\bok\b|passed|complete\b/i.test(ARCHIVE_GATE_SKIPPED_MESSAGE),
    `the skip line must not read as a pass: ${ARCHIVE_GATE_SKIPPED_MESSAGE}`
  );
});
