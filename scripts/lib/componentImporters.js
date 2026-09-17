/** Who imports this file — measured against the tree, so a claim about it can be checked. */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** The extensions whose contents are read for imports. */
const CODE_FILE_PATTERN = /\.(?:js|mjs|svelte)$/;

/** A line whose first non-space characters open or continue a comment. */
const COMMENT_ONLY_LINE = /^\s*(?:\*|\/\/|\/\*|<!--|-->)/;

/**
 * The tail of an import statement: the quoted specifier that follows `from`, or the one that
 * follows a side-effect `import` or a dynamic `import(`.
 */
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*)(['"])(\.[^'"]*)\1/g;

/** Order two strings by code point, ascending. */
function byCodePoint(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** Every file beneath `root`, as repository-relative POSIX paths. */
function listFiles(absoluteRoot, relativeRoot) {
  const found = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const childAbsolute = path.join(absoluteRoot, entry.name);
    const childRelative = `${relativeRoot}/${entry.name}`;
    if (entry.isDirectory()) found.push(...listFiles(childAbsolute, childRelative));
    else found.push(childRelative);
  }
  return found;
}

/** The specifiers one file imports, resolved to repository-relative POSIX paths. */
function resolvedTargets(repoRoot, file) {
  const source = readFileSync(path.join(repoRoot, file), 'utf8')
    .split(/\r?\n/)
    .filter((line) => !COMMENT_ONLY_LINE.test(line))
    .join('\n');
  const directory = path.posix.dirname(file);
  const targets = [];
  IMPORT_SPECIFIER.lastIndex = 0;
  let match = IMPORT_SPECIFIER.exec(source);
  while (match !== null) {
    targets.push(path.posix.normalize(path.posix.join(directory, match[2])));
    match = IMPORT_SPECIFIER.exec(source);
  }
  return targets;
}

/** Measure the import graph under `sourceRoot` and answer who imports a given file. */
export function measureImporters(repoRoot, sourceRoot = 'src') {
  const files = listFiles(path.join(repoRoot, sourceRoot), sourceRoot);
  const known = new Set(files);
  const importers = new Map();
  let importEdgeCount = 0;

  const codeFiles = files.filter((candidate) => CODE_FILE_PATTERN.test(candidate));
  for (const file of codeFiles) {
    for (const target of resolvedTargets(repoRoot, file)) {
      if (target === file || !known.has(target)) continue;
      if (!importers.has(target)) importers.set(target, new Set());
      importers.get(target).add(file);
      importEdgeCount += 1;
    }
  }

  return {
    /** The files that import `file`, in code-point order. */
    importersOf: (file) => [...(importers.get(file) ?? [])].sort(byCodePoint),

    /** Every resolved import edge in the walked root. */
    importEdgeCount,

    /** Files walked, so a consumer can prove the walk reached the tree at all. */
    fileCount: files.length,
  };
}
