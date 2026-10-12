/**
 * The Primitive Lab catalogue reader, dependency-free so the PR capture's `select` job can load it
 * with no packages installed (issue 2413). `primitiveLabSmoke.js` re-exports it for `lab:check`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** The catalogue directory, relative to the repository root. */
export const CATALOGUE_DIRECTORY = 'tests/view-lab/primitives/catalogue';

/**
 * The catalogue's `*.json` files in code-point order, read non-recursively to match the page's
 * non-recursive `import.meta.glob`.
 *
 * @param {string} root Absolute repository root.
 * @returns {string[]} File names, extension included.
 */
export function catalogueFiles(root) {
  return readdirSync(path.join(root, CATALOGUE_DIRECTORY))
    .filter((name) => name.endsWith('.json'))
    .sort((left, right) => (left < right ? -1 : Number(left > right)));
}

/**
 * @param {string|null} text A catalogue file's source.
 * @returns {object[]|null} Its rows, or null when it is missing, malformed or not an array.
 */
export function parseCatalogueRows(text) {
  try {
    const parsed = text === null ? null : JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Every catalogue row, each carrying the file and index it was written at.
 *
 * @param {string} root Absolute repository root.
 * @returns {{file: string, index: number, row: object}[]} Rows in file then declaration order.
 */
export function catalogueEntries(root) {
  return catalogueFiles(root).flatMap((file) => {
    const parsed = JSON.parse(readFileSync(path.join(root, CATALOGUE_DIRECTORY, file), 'utf8'));
    if (!Array.isArray(parsed)) {
      throw new TypeError(`${CATALOGUE_DIRECTORY}/${file} is not an array of catalogue rows`);
    }
    return parsed.map((row, index) => ({ file, index, row }));
  });
}
