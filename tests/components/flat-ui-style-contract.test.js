import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const specPath = resolve(repoRoot, 'spec/003-ui-integration.md');
const productRoots = [
  resolve(repoRoot, 'src/ui'),
  resolve(repoRoot, 'styles')
];
const allowedExtensions = new Set(['.js', '.svelte', '.css']);
const gradientPattern = /\b(?:linear|radial|conic)-gradient\s*\(/;

function collectProductFiles(rootPath) {
  const files = [];

  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const fullPath = resolve(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectProductFiles(fullPath));
      continue;
    }

    if (allowedExtensions.has(extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Flat UI style contract', () => {
  it('enshrines a no-gradient flat style rule in the UI spec', () => {
    const specSource = readFileSync(specPath, 'utf8');

    assert.ok(
      specSource.includes("must not use `linear-gradient`, `radial-gradient`, or `conic-gradient`"),
      'the UI spec should explicitly forbid gradient backgrounds in product UI'
    );
    assert.ok(
      specSource.includes('Use solid colors or RGBA fills'),
      'the UI spec should require flat solid or RGBA surfaces'
    );
    assert.ok(
      specSource.includes('blur-based glass effects'),
      'the UI spec should reject blur-heavy glass styling for product UI surfaces'
    );
  });

  it('contains no gradients in product UI source files', () => {
    const offenders = productRoots
      .flatMap((rootPath) => collectProductFiles(rootPath))
      .filter((filePath) => gradientPattern.test(readFileSync(filePath, 'utf8')))
      .map((filePath) => relative(repoRoot, filePath))
      .sort();

    assert.deepEqual(
      offenders,
      [],
      `product UI files should not contain gradients, but found: ${offenders.join(', ')}`
    );
  });
});
