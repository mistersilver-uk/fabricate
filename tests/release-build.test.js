import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import { zipDirectory } from '../scripts/lib/zip.js';
import {
  ARCHIVE_CHUNK_GATE_LABEL,
  ARCHIVE_GATE_SKIPPED_MESSAGE,
  archiveNameMismatchMessage,
  releaseZipName
} from '../scripts/lib/releaseZipChunks.js';
// Imported, never retyped, for two reasons. A retyped copy would silently stop matching the day
// the sentence in src/ is reworded; and each of these literals is referenced by nothing except its
// own console write, so a copy living in this file would still match a bundle that write had been
// stripped out of — which is exactly the regression the stale-entry assertion below has to catch.
import {
  DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
  STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE
} from '../src/utils/deferredEntryNotice.js';

const { rewriteModuleJson, getRequiredFiles, validateDist, getFlag, parseReleaseVersionOptions, applyReleaseUrls } = await import('../scripts/release.js');

// ───────────────────────────────────────────────────────────────────────────
// rewriteModuleJson() tests
// ───────────────────────────────────────────────────────────────────────────

test('rewriteModuleJson strips dist/ prefix from esmodules', () => {
  const manifest = {
    id: 'fabricate',
    esmodules: ['dist/main.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, ['main.js']);
});

test('rewriteModuleJson strips dist/ prefix from multiple esmodules', () => {
  const manifest = {
    esmodules: ['dist/main.js', 'dist/vendor.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, ['main.js', 'vendor.js']);
});

test('rewriteModuleJson leaves esmodules without dist/ prefix unchanged', () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, ['main.js']);
});

test('rewriteModuleJson preserves styles paths unchanged', () => {
  const manifest = {
    esmodules: [],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.styles, ['styles/fabricate.css']);
});

test('rewriteModuleJson preserves languages paths unchanged', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [{ lang: 'en', name: 'English', path: 'lang/en.json' }],
    packs: []
  };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.languages[0].path, 'lang/en.json');
});

test('rewriteModuleJson normalizes legacy .db pack paths', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [
      { name: 'sample-pack', path: 'packs/sample-pack-v1.db', type: 'Item' }
    ]
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.packs[0].path, 'packs/sample-pack-v1');
});

test('rewriteModuleJson leaves pack paths without .db suffix unchanged', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [
      { name: 'test-pack', path: 'packs/test-pack', type: 'Item' }
    ]
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.packs[0].path, 'packs/test-pack');
});

test('rewriteModuleJson preserves non-path fields on packs', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [
      { name: 'sample-pack', label: 'Sample Pack', path: 'packs/sample-pack-v1.db', type: 'Item', system: 'dnd5e' }
    ]
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.packs[0].name, 'sample-pack');
  assert.equal(result.packs[0].label, 'Sample Pack');
  assert.equal(result.packs[0].type, 'Item');
  assert.equal(result.packs[0].system, 'dnd5e');
});

test('rewriteModuleJson preserves non-path top-level fields', () => {
  const manifest = {
    id: 'fabricate',
    title: 'Fabricate',
    version: '0.1.0',
    esmodules: ['dist/main.js'],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: [],
    url: 'https://example.com',
    manifest: 'https://example.com/module.json',
    download: 'https://example.com/module.zip'
  };
  const result = rewriteModuleJson(manifest);
  assert.equal(result.id, 'fabricate');
  assert.equal(result.title, 'Fabricate');
  assert.equal(result.version, '0.1.0');
  assert.equal(result.url, 'https://example.com');
});

test('rewriteModuleJson does not mutate the original manifest', () => {
  const manifest = {
    esmodules: ['dist/main.js'],
    styles: [],
    languages: [],
    packs: [{ name: 'test', path: 'packs/test.db', type: 'Item' }]
  };
  rewriteModuleJson(manifest);
  assert.equal(manifest.esmodules[0], 'dist/main.js');
  assert.equal(manifest.packs[0].path, 'packs/test.db');
});

test('rewriteModuleJson handles missing optional fields gracefully', () => {
  const manifest = { id: 'fabricate', version: '1.0.0' };
  const result = rewriteModuleJson(manifest);
  assert.deepEqual(result.esmodules, []);
  assert.deepEqual(result.styles, []);
  assert.deepEqual(result.languages, []);
  assert.deepEqual(result.packs, []);
  assert.equal(result.id, 'fabricate');
});

// ───────────────────────────────────────────────────────────────────────────
// release version option tests
// ───────────────────────────────────────────────────────────────────────────

test('getFlag returns a flag value and ignores following flags', () => {
  assert.equal(getFlag(['--dist-version', '0.2.0-rc.1'], '--dist-version'), '0.2.0-rc.1');
  assert.equal(getFlag(['--dist-version', '--no-zip'], '--dist-version'), null);
});

test('parseReleaseVersionOptions preserves mutating source version intent', () => {
  const result = parseReleaseVersionOptions(['--version', '0.2.0-rc.1']);
  assert.equal(result.sourceVersion, '0.2.0-rc.1');
  assert.equal(result.distVersion, null);
  assert.equal(result.releaseVersion, '0.2.0-rc.1');
});

test('parseReleaseVersionOptions supports dist-only version intent', () => {
  const result = parseReleaseVersionOptions(['--dist-version', '0.2.0-rc.1']);
  assert.equal(result.sourceVersion, null);
  assert.equal(result.distVersion, '0.2.0-rc.1');
  assert.equal(result.releaseVersion, '0.2.0-rc.1');
});

test('parseReleaseVersionOptions rejects simultaneous source and dist version flags', () => {
  assert.throws(
    () => parseReleaseVersionOptions(['--version', '0.2.0-rc.1', '--dist-version', '0.2.0-rc.1']),
    /mutually exclusive/
  );
});

// ───────────────────────────────────────────────────────────────────────────
// applyReleaseUrls() tests — issue #627 task 3.6
//
// The release artefact's in-zip module.json must bake the repository's LATEST-release manifest URL
// (never version-pinned, never a channel URL) so public clients are not manifest-rewrite-prompted on
// every update, while `download` stays version-pinned so the artefact fetches its own archive.
// ───────────────────────────────────────────────────────────────────────────

test('applyReleaseUrls bakes the LATEST-release manifest URL, not a version-pinned one', () => {
  const manifest = applyReleaseUrls({}, '1.5.0');
  assert.equal(
    manifest.manifest,
    'https://github.com/mistersilver-uk/fabricate/releases/latest/download/module.json'
  );
  // The manifest URL must be stable across releases: it must NOT carry the version anywhere.
  assert.ok(!manifest.manifest.includes('1.5.0'), 'manifest URL must not be version-pinned');
  assert.ok(manifest.manifest.includes('/releases/latest/'), 'manifest URL must be the latest-release URL');
});

test('applyReleaseUrls keeps the download URL version-pinned', () => {
  const manifest = applyReleaseUrls({}, '1.5.0');
  assert.equal(
    manifest.download,
    'https://github.com/mistersilver-uk/fabricate/releases/download/v1.5.0/fabricate-v1.5.0.zip'
  );
  assert.ok(manifest.download.includes('/v1.5.0/'), 'download URL must be pinned to the version tag');
});

test('applyReleaseUrls never points at an S3 channel feed', () => {
  const manifest = applyReleaseUrls({}, '2.0.0-beta.3');
  // Neither URL may be a channel (S3) URL — both stay on the GitHub releases host.
  for (const url of [manifest.manifest, manifest.download]) {
    assert.ok(url.startsWith('https://github.com/mistersilver-uk/fabricate/releases/'), url);
    assert.ok(!url.includes('modules/'), `must not be a channel feed URL: ${url}`);
    assert.ok(!url.includes('amazonaws.com'), `must not be an S3 URL: ${url}`);
  }
  // A prerelease build still pins its own download but keeps the stable latest-release manifest.
  assert.equal(
    manifest.download,
    'https://github.com/mistersilver-uk/fabricate/releases/download/v2.0.0-beta.3/fabricate-v2.0.0-beta.3.zip'
  );
  assert.ok(manifest.manifest.endsWith('/releases/latest/download/module.json'));
});

test('applyReleaseUrls mutates and returns the same manifest, preserving other fields', () => {
  const original = { id: 'fabricate', version: '1.5.0', esmodules: ['main.js'] };
  const result = applyReleaseUrls(original, '1.5.0');
  assert.equal(result, original, 'returns the same object it mutated');
  assert.equal(result.id, 'fabricate');
  assert.deepEqual(result.esmodules, ['main.js']);
});

// ───────────────────────────────────────────────────────────────────────────
// Build-wiring integration tests: ONE real build, several things proved about it.
//
// The pure unit tests above cannot catch a DELETED (or mis-gated) call site inside release.js's
// main(). Only a real spawn can, and a real spawn is the expensive thing here — so the build is
// memoised and every wiring assertion below reads the SAME dist/ and the same captured stdout.
// The memo, not test declaration order, is what makes that safe.
// ───────────────────────────────────────────────────────────────────────────

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// A version no other string in the tree can collide with. That matters: the tracked version 0.1.0
// occurs in dist/main.js for entirely unrelated reasons (a data-migration step is labelled 0.1.0),
// so asserting the REAL version against the bundle would pass whether or not the define reached it.
const WIRE_VERSION = '9.9.9-wiretest';
let wireBuild;

/**
 * Run the real `--dist-version <v> --no-zip` build ONCE and hand back its stdout.
 *
 * `stdio` pipes rather than ignores because two of the assertions below are about what the script
 * PRINTS. The inner `npx vite build` inherits this pipe, so its output is in here too.
 *
 * @returns {string} Everything the build wrote to stdout.
 */
function buildWithoutZip() {
  wireBuild ??= execFileSync(
    process.execPath,
    ['scripts/release.js', '--dist-version', WIRE_VERSION, '--no-zip'],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return wireBuild;
}

// The download URL is the effective mutation-catcher — the tracked source module.json already
// carries a latest-release *manifest*, but its download URL is the latest one, so a missing call
// site leaves dist with a non-version-pinned download and this fails.
test('release.js --dist-version wires the release URLs into the built dist/module.json', () => {
  const trackedManifestPath = join(REPO_ROOT, 'module.json');
  const trackedBefore = readFileSync(trackedManifestPath, 'utf8');

  buildWithoutZip();

  const built = JSON.parse(readFileSync(join(REPO_ROOT, 'dist', 'module.json'), 'utf8'));
  const expected = applyReleaseUrls({}, WIRE_VERSION);
  assert.equal(built.version, WIRE_VERSION, '--dist-version must set the built version');
  assert.equal(built.manifest, expected.manifest, 'built manifest must be the latest-release URL');
  assert.equal(built.download, expected.download, 'built download must be the version-pinned URL');

  // --dist-version must NOT mutate the tracked source module.json (only --version is allowed to).
  assert.equal(
    readFileSync(trackedManifestPath, 'utf8'),
    trackedBefore,
    'tracked module.json must be untouched by a --dist-version build'
  );
});

/** Regex-escape a literal so it can be matched inside a minified bundle. */
function escapeForRegExp(text) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pin BOTH that a module console literal reached the bundle AND the level it is written at.
 *
 * THE LEVEL NEEDS ITS OWN ASSERTION, and the first version of this file wrongly believed presence
 * implied it: `vite.config.js` declares `console.log`/`info`/`debug` pure, but
 * `manualPureFunctions` lets Rolldown drop a call only when its RETURN VALUE IS UNUSED. The
 * deferred-load line is written from a concise arrow (`log: (error) => console.error(MSG, error)`)
 * whose value IS the call's, so that one survives at any level and `includes` alone cannot see a
 * regression — measured, by rebuilding at `console.info` with the old assertion still green. The
 * stale-entry line is a bare statement and genuinely does strip. Asserting the CALL covers both.
 *
 * @param {string} bundle The built `dist/main.js`.
 * @param {string} literal The exported console literal, imported from src/ rather than retyped.
 * @param {'error'|'warn'} level The level this line must be written at.
 * @param {string} what Names the line, for the failure message.
 * @returns {void}
 */
function assertBundleConsoleLine(bundle, literal, level, what) {
  // Asserted BEFORE the includes(): an accidentally empty literal makes `includes('')` true for
  // any input at all, which is a green test proving nothing.
  assert.equal(typeof literal, 'string', `${what}: the console literal must be a string`);
  assert.ok(literal.length > 0, `${what}: the console literal must be non-empty`);
  assert.ok(
    bundle.includes(literal),
    `${what}: the literal must reach dist/main.js — its absence means the write was tree-shaken` +
      ' out of the published build entirely'
  );

  // Minifiers may either bind the literal to a name or inline it at the call site. Both shapes
  // pin the level; accepting both keeps this from failing on a formatting choice while still
  // failing on every level change. (Rolldown currently binds it.)
  const quoted = `["'\`]${escapeForRegExp(literal)}["'\`]`;
  if (new RegExp(`console\\.${level}\\(\\s*${quoted}`).test(bundle)) return;
  const bound = bundle.match(new RegExp(`([A-Za-z_$][\\w$]*)\\s*=\\s*${quoted}`));
  assert.ok(
    bound,
    `${what}: the literal is neither bound to an identifier nor inlined at a console call, so` +
      ' this assertion cannot locate the write — update it against the current minifier output'
  );
  // `assert.ok(regex.test(...))` rather than `assert.match(bundle, ...)`, for READABILITY. The
  // actual value is `dist/main.js` — 1.7 MB of minified bundle — and `node:assert` inspects the
  // actual to build its failure report, so one `assert.match` failure here makes `node --test`
  // emit a FAILURE REPORT of roughly 23,000 characters that still never names the console level it
  // found. That size belongs to the REPORT, not to the printed bundle: Node caps the printed
  // excerpt at the first 10,000 characters of the actual and closes it with a `... N more
  // characters` tail, and the runner prints that capped excerpt twice — once in the assertion
  // message, once in the AssertionError dump. This 1.7 MB actual and the 300 KB `src/main.js`
  // actual guarded by `tests/item-directory-manager-launch.test.js` therefore produce reports of
  // much the same size. The message below carries the diagnosis instead. A local choice for a
  // whole-bundle actual, not a rule about `assert.match`.
  assert.ok(
    new RegExp(`console\\.${level}\\(\\s*${bound[1]}\\b`).test(bundle),
    `${what}: must be written at console.${level} in the built bundle`
  );
}

// Issue 1565. BUNDLE-level assertions, not spy-level ones, and that distinction is the whole
// point: a unit test's `log` spy passes at any level, so the only thing that can hold the line on
// the LEVEL of the module's own console writes is the built artefact.
test('the built bundle carries the version this build shipped, and both console lines at their levels', () => {
  buildWithoutZip();
  const bundle = readFileSync(join(REPO_ROOT, 'dist', 'main.js'), 'utf8');

  assert.ok(
    bundle.includes(WIRE_VERSION),
    'release.js must set FABRICATE_BUILD_VERSION so vite bakes the SHIPPED version into the bundle'
  );
  assertBundleConsoleLine(
    bundle,
    DEFERRED_CHUNK_LOAD_CONSOLE_MESSAGE,
    'error',
    'the deferred-load console line'
  );
  assertBundleConsoleLine(
    bundle,
    STALE_ENTRY_SCRIPT_CONSOLE_MESSAGE,
    'warn',
    'the stale-entry console line'
  );
});

// D11: `npm run build` is `--no-zip`, so the archive gate has nothing to check. It must say so and
// still exit 0 — a build that produced no archive reports that the proof did not run, never a pass.
test('a --no-zip build reports the archive gate as skipped and still succeeds', () => {
  const stdout = buildWithoutZip();
  assert.ok(
    stdout.includes(ARCHIVE_GATE_SKIPPED_MESSAGE),
    `the skip line must be on stdout; got:\n${stdout.slice(-2000)}`
  );
  // execFileSync throws on a non-zero exit, so reaching here at all is the exit-0 assertion; this
  // pins the successful build's own verdict alongside it.
  assert.ok(stdout.includes('Build complete. dist/ is valid.'), 'the build itself must succeed');
});

// D9's negative composition proof. release.js's main() takes no `deps` and does
// `rm -rf dist` -> build -> zip in one pass, so nothing can hand the build path a short archive.
// `--validate-only` returns before the build, which is what makes this constructible at all.
//
// It asserts the GATE'S OWN MESSAGE and the missing member's NAME, never merely a non-zero exit:
// that same branch also exits 1 from validateDist, so a status check alone would pass just as
// happily if the gate had been deleted and dist/ merely happened to be incomplete.
test('release.js --validate-only fails on an existing archive short a referenced chunk', async () => {
  buildWithoutZip();
  const distDir = join(REPO_ROOT, 'dist');
  // The archive carries its OWN entry script, referencing a chunk name this test chooses, so the
  // assertion does not depend on whatever content hashes the real build happened to emit.
  const missingChunk = 'chunks/absent-DEADBEEF.js';
  const staging = await mkdtemp(join(tmpdir(), 'fab-short-archive-'));
  const stagedZip = join(distDir, releaseZipName(WIRE_VERSION));
  try {
    await writeFile(join(staging, 'main.js'), `import "./${missingChunk}";\n`);
    await writeFile(join(staging, 'module.json'), readFileSync(join(distDir, 'module.json')));
    zipDirectory(staging, stagedZip);

    // `assert.throws` does not hand back the error, and the error is the entire evidence here:
    // its `status`, and the message the script printed before it.
    let error;
    try {
      execFileSync(
        process.execPath,
        ['scripts/release.js', '--validate-only', '--dist-version', WIRE_VERSION],
        { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
      );
    } catch (thrown) {
      error = thrown;
    }
    assert.ok(error, 'a short archive must fail the command, and it exited 0');
    assert.equal(error.status, 1, 'a short archive must fail with exit status 1');
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    assert.ok(output.includes(ARCHIVE_CHUNK_GATE_LABEL), `must be the archive gate's own refusal; got:\n${output}`);
    assert.ok(output.includes(missingChunk), `must name the missing member; got:\n${output}`);
    // And it must NOT be validateDist's refusal wearing the gate's clothes.
    assert.ok(output.includes('dist/ is valid.'), 'dist/ itself must have passed validation first');
  } finally {
    // Leave dist/ exactly as the build left it: the staged archive is this test's only addition.
    await rm(stagedZip, { force: true });
    await rm(staging, { recursive: true, force: true });
  }
});

// Issue 1565, r3 review finding 5. THE SKIP LINE IS ONLY HONEST WHEN dist/ HOLDS NO ARCHIVE.
// The archive name carries a version and `--dist-version` never touches the tracked module.json,
// so a bare `npm run release:validate` after such a build derives `fabricate-v0.1.0.zip`, misses
// the archive that was actually produced, and used to print "this build produced no archive" —
// exiting 0 and silently skipping the one check the maintainer ran the command for.
test('release.js --validate-only refuses rather than reporting a skip when dist/ holds an archive under another name', async () => {
  buildWithoutZip();
  const distDir = join(REPO_ROOT, 'dist');
  const otherVersion = '9.9.9-othername';
  const otherZip = join(distDir, releaseZipName(otherVersion));
  try {
    // Deliberately NOT a readable archive: the refusal must come from the name mismatch, before
    // anything opens it. A zip reader's own complaint would be a different (and later) failure.
    await writeFile(otherZip, 'not a real archive');

    let error;
    try {
      execFileSync(
        process.execPath,
        ['scripts/release.js', '--validate-only', '--dist-version', WIRE_VERSION],
        { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }
      );
    } catch (thrown) {
      error = thrown;
    }
    assert.ok(error, 'a derived-name miss over a populated dist/ must fail the command');
    assert.equal(error.status, 1);
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    assert.ok(
      output.includes(archiveNameMismatchMessage(releaseZipName(WIRE_VERSION), [releaseZipName(otherVersion)])),
      `must be the gate's own name-mismatch refusal, naming both names; got:\n${output}`
    );
    assert.ok(
      !output.includes(ARCHIVE_GATE_SKIPPED_MESSAGE),
      'and must not also claim this build produced no archive'
    );
  } finally {
    await rm(otherZip, { force: true });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// getRequiredFiles() tests
// ───────────────────────────────────────────────────────────────────────────

test('getRequiredFiles returns esmodule paths', () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('main.js'), 'should include main.js');
});

test('getRequiredFiles returns styles paths', () => {
  const manifest = {
    esmodules: [],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('styles/fabricate.css'), 'should include styles path');
});

test('getRequiredFiles returns language paths', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [{ lang: 'en', name: 'English', path: 'lang/en.json' }],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('lang/en.json'), 'should include language path');
});

test('getRequiredFiles includes module.json itself', () => {
  const manifest = { esmodules: [], styles: [], languages: [], packs: [] };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('module.json'), 'should include module.json');
});

test('getRequiredFiles returns all entries from full manifest', () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [{ path: 'lang/en.json' }],
    packs: [{ path: 'packs/sample-pack-v1' }]
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('main.js'));
  assert.ok(files.includes('styles/fabricate.css'));
  assert.ok(files.includes('lang/en.json'));
  assert.ok(files.includes('packs/sample-pack-v1'));
  assert.ok(files.includes('module.json'));
});

test('getRequiredFiles returns pack paths', () => {
  const manifest = {
    esmodules: [],
    styles: [],
    languages: [],
    packs: [{ path: 'packs/sample-pack-v1' }]
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('packs/sample-pack-v1'), 'should include pack path');
});

test('getRequiredFiles handles multiple esmodules', () => {
  const manifest = {
    esmodules: ['main.js', 'vendor.js'],
    styles: [],
    languages: [],
    packs: []
  };
  const files = getRequiredFiles(manifest);
  assert.ok(files.includes('main.js'));
  assert.ok(files.includes('vendor.js'));
});

// ───────────────────────────────────────────────────────────────────────────
// validateDist() tests
// ───────────────────────────────────────────────────────────────────────────

async function makeTempDist(files, moduleJson) {
  const dir = await mkdtemp(join(tmpdir(), 'fabricate-dist-'));

  for (const file of files) {
    const fullPath = join(dir, file);
    const dirPath = join(fullPath, '..');
    await mkdir(dirPath, { recursive: true });
    await writeFile(fullPath, 'placeholder');
  }

  if (moduleJson !== undefined) {
    await writeFile(join(dir, 'module.json'), JSON.stringify(moduleJson));
  }

  return dir;
}

test('validateDist returns success when all required files are present', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [{ path: 'lang/en.json' }],
    packs: [{ path: 'packs/sample-pack-v1' }]
  };
  const distManifest = { ...manifest, id: 'fabricate', version: '0.1.0' };
  const dir = await makeTempDist(['main.js', 'styles/fabricate.css', 'lang/en.json', 'packs/sample-pack-v1/CURRENT'], distManifest);
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, true);
    assert.equal(result.missing.length, 0);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when a pack path is missing', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: [],
    languages: [],
    packs: [{ path: 'packs/sample-pack-v1' }]
  };
  const distManifest = { ...manifest, id: 'fabricate', version: '0.1.0' };
  const dir = await makeTempDist(['main.js'], distManifest);
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(f => f.includes('sample-pack-v1')), `Expected missing to include pack path, got: ${result.missing}`);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when a required file is missing', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [],
    packs: []
  };
  // Only create main.js, not fabricate.css
  const distManifest = { ...manifest, id: 'fabricate', version: '0.1.0' };
  const dir = await makeTempDist(['main.js'], distManifest);
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(f => f.includes('fabricate.css')), `Expected missing to include fabricate.css, got: ${result.missing}`);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when module.json is missing', async () => {
  const manifest = { esmodules: ['main.js'], styles: [], languages: [], packs: [] };
  const dir = await makeTempDist(['main.js']);
  // No module.json written
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.some(f => f.includes('module.json')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when module.json is invalid JSON', async () => {
  const manifest = { esmodules: ['main.js'], styles: [], languages: [], packs: [] };
  const dir = await makeTempDist(['main.js']);
  await writeFile(join(dir, 'module.json'), 'not valid json {{{');
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.toLowerCase().includes('module.json')));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('validateDist returns failure when multiple files are missing', async () => {
  const manifest = {
    esmodules: ['main.js'],
    styles: ['styles/fabricate.css'],
    languages: [{ path: 'lang/en.json' }],
    packs: []
  };
  const distManifest = { id: 'fabricate' };
  const dir = await makeTempDist([], distManifest); // nothing in dist
  try {
    const result = await validateDist(dir, manifest);
    assert.equal(result.valid, false);
    assert.ok(result.missing.length >= 3);
  } finally {
    await rm(dir, { recursive: true });
  }
});
