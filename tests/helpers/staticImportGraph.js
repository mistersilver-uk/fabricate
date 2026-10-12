/**
 * Walk a module's static `import` and `export … from` specifiers, transitively, over repository
 * files: each relative specifier is followed, and every other one is reported where it is written.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parseModule } from './moduleAst.js';

const SPECIFIER_NODES = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

/** One module's static specifiers, in source order. */
function staticSpecifiers(source) {
  return parseModule(source)
    .ast.body.filter((node) => SPECIFIER_NODES.has(node.type) && node.source)
    .map((node) => node.source.value);
}

/**
 * @param {string} root Absolute repository root.
 * @param {string[]} entries Repository-relative POSIX paths to start from.
 * @param {{follows?: (file: string) => boolean}} [options] Which reached repository files to read.
 * @returns {{files: string[], bare: {from: string, specifier: string}[]}} Every repository file
 *   reached, entries included, and every non-relative specifier with the file that wrote it.
 */
export function walkStaticImports(root, entries, { follows = () => true } = {}) {
  const files = new Set();
  const bare = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (files.has(file)) continue;
    files.add(file);
    if (!follows(file) || !/\.m?js$/.test(file)) continue;
    for (const specifier of staticSpecifiers(readFileSync(path.join(root, file), 'utf8'))) {
      if (!specifier.startsWith('.')) {
        bare.push({ from: file, specifier });
        continue;
      }
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    }
  }
  return { files: [...files], bare };
}
