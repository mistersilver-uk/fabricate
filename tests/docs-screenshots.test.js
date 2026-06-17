import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const docsDir = join(root, 'docs');
const screenshotsDir = join(docsDir, 'img', 'screenshots');

// Directories under docs/ that are generated or vendored, never authored — they
// must not count as references (otherwise a stale build artefact could keep a
// deleted screenshot "alive").
const IGNORED_DOCS_DIRS = new Set(['_site', 'vendor', '.jekyll-cache', 'node_modules']);
const DOC_TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.html']);

/**
 * Recursively collect authored doc source files (markdown + html), skipping the
 * generated/vendored trees in {@link IGNORED_DOCS_DIRS}.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function collectDocFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DOCS_DIRS.has(entry.name)) continue;
      files.push(...await collectDocFiles(join(dir, entry.name)));
    } else if (DOC_TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      files.push(join(dir, entry.name));
    }
  }
  return files;
}

const screenshotFiles = (await readdir(screenshotsDir))
  .filter(file => extname(file).toLowerCase() === '.webp')
  .sort((a, b) => a.localeCompare(b, 'en'));

const docFiles = await collectDocFiles(docsDir);
const referenced = new Set();
for (const file of docFiles) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/screenshots\/([a-zA-Z0-9_-]+\.webp)/g)) {
    referenced.add(match[1]);
  }
}

// Guard against deleted documentation screenshots silently creeping back in.
// Every committed screenshot must earn its place by being referenced from an
// authored docs page; an orphaned .webp (e.g. one re-added from a smoke run
// after its docs reference was removed) fails this test. The smoke harness only
// writes frames to the transient test-results/ directory, so a screenshot
// reaching docs/img/screenshots/ is always a deliberate curation — this keeps
// that set honest. See docs/agents/smoke-harness.md for the curation workflow.
test('every committed docs screenshot is referenced by an authored docs page', () => {
  const orphans = screenshotFiles.filter(file => !referenced.has(file));
  assert.deepEqual(
    orphans,
    [],
    `Unreferenced docs screenshot(s) in docs/img/screenshots/ — reference them from a docs page or delete the file(s): ${orphans.join(', ')}`
  );
});

test('every docs screenshot reference resolves to a committed file', () => {
  const present = new Set(screenshotFiles);
  const dangling = [...referenced].filter(file => !present.has(file)).sort((a, b) => a.localeCompare(b, 'en'));
  assert.deepEqual(
    dangling,
    [],
    `Docs reference screenshot file(s) missing from docs/img/screenshots/: ${dangling.join(', ')}`
  );
});
