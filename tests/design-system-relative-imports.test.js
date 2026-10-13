/**
 * Every static relative import under `src/` resolves to a file. A missing target is a plain
 * failure here; left to the component harness it surfaces as `# cancelled N`, and lint is silent
 * on it because `import-x/no-unresolved` is scoped to `.js` and `.mjs`, never `.svelte`.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_FILE = /\.(?:svelte|js)$/;
const RELATIVE_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.{1,2}\/[^'"\n]+)\1/g;

/** @param {string} directory absolute directory @returns {string[]} source files beneath it */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    return SOURCE_FILE.test(entry.name) ? [absolute] : [];
  });
}

test('every static relative import under src resolves to a file', () => {
  const files = sourceFiles(path.join(REPO_ROOT, 'src'));
  assert.ok(files.length > 500, `only ${files.length} source files walked`);

  const unresolved = files.flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(RELATIVE_SPECIFIER)]
      .map((match) => match[2])
      .filter((specifier) => !existsSync(path.resolve(path.dirname(file), specifier)))
      .map((specifier) => `${path.relative(REPO_ROOT, file)} imports ${specifier}`)
  );
  assert.deepEqual(unresolved, [], 'these relative imports resolve to no file');
});
