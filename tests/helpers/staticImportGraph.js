/**
 * Walk a module's static `import` and `export … from` specifiers, transitively, over repository
 * files: each relative specifier is followed, and every other one is reported where it is written.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parse as parseSvelte } from 'svelte/compiler';

import { parseModule, walkNodes } from './moduleAst.js';

const SPECIFIER_NODES = new Set([
  'ImportDeclaration',
  'ExportNamedDeclaration',
  'ExportAllDeclaration',
]);

/** The scripts of a `.svelte` component as one program body: instance and module blocks. */
function svelteBodies(source) {
  const { instance, module } = parseSvelte(source, { modern: true });
  return [module, instance].flatMap((script) => script?.content.body ?? []);
}

/**
 * One file's specifiers in source order: static ones, plus with `dynamic` the literal `import()`
 * calls, whose non-literal ones come back in `computed` rather than being dropped. With `svelte`
 * a `.svelte` file's script blocks are read too.
 */
function specifiersOf(file, source, { dynamic }) {
  const bodies = file.endsWith('.svelte') ? svelteBodies(source) : parseModule(source).ast.body;
  const specifiers = bodies
    .filter((node) => SPECIFIER_NODES.has(node.type) && node.source)
    .map((node) => node.source.value);
  let computed = 0;
  if (dynamic) {
    for (const node of bodies.flatMap((body) => [...walkNodes(body)])) {
      if (node.type !== 'ImportExpression') continue;
      if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
        specifiers.push(node.source.value);
      } else {
        computed += 1;
      }
    }
  }
  return { specifiers, computed };
}

/**
 * @param {string} root Absolute repository root.
 * @param {string[]} entries Repository-relative POSIX paths to start from.
 * @param {{follows?: (file: string) => boolean, svelte?: boolean, dynamic?: boolean}} [options]
 *   `follows` picks which reached repository files to read. `svelte` also reads `.svelte` script
 *   blocks and `dynamic` also follows literal `import('…')`; both are off by default.
 * @returns {{files: string[], bare: {from: string, specifier: string}[], computed:
 *   {from: string, count: number}[]}} Every repository file reached, entries included, every
 *   non-relative specifier with the file that wrote it, and every file with non-literal `import()`.
 */
export function walkStaticImports(
  root,
  entries,
  { follows = () => true, svelte = false, dynamic = false } = {}
) {
  const files = new Set();
  const bare = [];
  const computed = [];
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.shift();
    if (files.has(file)) continue;
    files.add(file);
    if (!follows(file) || !(svelte ? /\.(?:m?js|svelte)$/ : /\.m?js$/).test(file)) continue;
    const read = specifiersOf(file, readFileSync(path.join(root, file), 'utf8'), {
      dynamic,
    });
    if (read.computed > 0) computed.push({ from: file, count: read.computed });
    for (const specifier of read.specifiers) {
      if (!specifier.startsWith('.')) {
        bare.push({ from: file, specifier });
        continue;
      }
      queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)));
    }
  }
  return { files: [...files], bare, computed };
}
