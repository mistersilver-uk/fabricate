/**
 * Build-output gate for issue #150.
 *
 * The GM-only crafting-system-manager subtree is deferred behind a dynamic
 * import() in src/main.js so non-GM players never download/parse it at module
 * init. This gate proves the split survived the build: the eager entry
 * (dist/main.js) must NOT carry the manager marker, and exactly the manager
 * lives in a separate on-demand chunk instead.
 *
 * Run this AFTER `npm run build` (it reads dist/), never as a `node --test`
 * unit test — `npm test` has no build step, so a dist-reading node test would
 * false-pass on a stale dist/ or hard-fail on a clean checkout.
 *
 * MARKER. The marker is the window-id STRING LITERAL
 * `fabricate-crafting-system-manager` (SvelteCraftingSystemManagerApp.svelte.js).
 * vite.config.js builds with minify + mangle, so identifiers such as
 * `CraftingSystemManagerRoot` are renamed in dist/ and cannot be asserted on.
 * The string literal survives mangling and is unique to the manager subtree.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argv, exit } from 'node:process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MANAGER_MARKER = 'fabricate-crafting-system-manager';

/**
 * Recursively collect every emitted `.js` path under a dist directory.
 * @param {string} dir absolute directory to walk
 * @returns {string[]} absolute `.js` file paths
 */
function collectJsFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectJsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Verify the manager subtree split out of the eager entry.
 * @param {string} distDir absolute dist/ directory
 * @returns {{ ok: boolean, errors: string[], eagerEntry: string, chunkFiles: string[] }}
 */
export function verifyManagerChunkSplit(distDir) {
  const errors = [];
  const mainPath = join(distDir, 'main.js');

  if (!existsSync(mainPath)) {
    return { ok: false, errors: [`missing ${relative(ROOT, mainPath)} — run \`npm run build\` first`], eagerEntry: mainPath, chunkFiles: [] };
  }

  if (readFileSync(mainPath, 'utf8').includes(MANAGER_MARKER)) {
    errors.push(
      `dist/main.js still contains the manager marker "${MANAGER_MARKER}" — the GM manager subtree was inlined into the eager entry`
    );
  }

  const chunkFiles = collectJsFiles(distDir).filter(p => p !== mainPath);
  const carriers = chunkFiles.filter(p => readFileSync(p, 'utf8').includes(MANAGER_MARKER));
  if (carriers.length === 0) {
    errors.push(
      `no separate dist/ chunk contains the manager marker "${MANAGER_MARKER}" — the deferred chunk was not emitted`
    );
  }

  return { ok: errors.length === 0, errors, eagerEntry: mainPath, chunkFiles: carriers };
}

const isMain = argv[1] && fileURLToPath(import.meta.url) === argv[1];
if (isMain) {
  const distDir = join(ROOT, 'dist');
  const result = verifyManagerChunkSplit(distDir);
  if (result.ok) {
    const names = result.chunkFiles.map(p => relative(distDir, p)).join(', ');
    console.log(`Manager chunk split OK: dist/main.js is free of "${MANAGER_MARKER}"; it lives in ${names}.`);
  } else {
    console.error('Manager chunk split gate FAILED:');
    for (const e of result.errors) console.error(`  - ${e}`);
    exit(1);
  }
}
