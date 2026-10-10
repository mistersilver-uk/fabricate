/**
 * The one reader of the module sheet (issue 1711): `styles/fabricate.css` and the sibling partials
 * it `@import`s, joined in import order. An entry with no import is its own text. Every function
 * takes `readFile(repoRelativePath)`, returning text or `undefined`, so one git side or another
 * checkout reads through the same loader; it defaults to this checkout.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const STYLESHEET_ENTRY = 'styles/fabricate.css';

/** A partial's repo-relative path. A pattern, so a deleted or renamed partial still matches. */
export const STYLESHEET_PART_PATTERN = /^styles\/fabricate-[a-z0-9-]+\.css$/u;

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const COMMENT = /\/\*[\s\S]*?\*\//gu;
const IMPORT_RULE = /@import\s+url\(\s*(["'])([^"']*)\1\s*\)\s*;/gu;
const PART_NAME = /^fabricate-[a-z0-9-]+\.css$/u;

/** A reader of the checkout at `root`, `undefined` for a file it does not hold. */
export function checkoutReader(root = REPO_ROOT) {
  return (file) => {
    try {
      return readFileSync(join(root, file), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
  };
}

const readRepoFile = checkoutReader();

/** `file` as the logical sheet's path when it is the entry or a partial, else unchanged. */
export function logicalStylesheetPath(file) {
  return STYLESHEET_PART_PATTERN.test(file) ? STYLESHEET_ENTRY : file;
}

/**
 * The repo-relative partials `entryText` imports, in order; none for a sheet without an import.
 * An import of anything but a sibling `fabricate-<name>.css`, or rules beside imports, throw.
 */
export function stylesheetImports(entryText) {
  const code = String(entryText).replaceAll(COMMENT, '');
  const names = [...code.matchAll(IMPORT_RULE)].map((match) => match[2]);
  if (names.length === 0) return [];
  const bad = names.find((name) => !PART_NAME.test(name));
  if (bad) throw new Error(`${STYLESHEET_ENTRY} imports "${bad}", not a sibling fabricate-*.css`);
  if (code.replaceAll(IMPORT_RULE, '').trim() !== '') {
    throw new Error(`${STYLESHEET_ENTRY} holds rules beside its @import lines`);
  }
  return names.map((name) => `styles/${name}`);
}

const lineCount = (text) => text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

function partTexts(readFile) {
  const entry = readFile(STYLESHEET_ENTRY);
  if (entry === undefined) return;
  const files = stylesheetImports(entry);
  if (files.length === 0) return [{ file: STYLESHEET_ENTRY, text: entry }];
  return files.map((file) => {
    const text = readFile(file);
    if (text === undefined)
      throw new Error(`${STYLESHEET_ENTRY} imports ${file}, which is missing`);
    return { file, text };
  });
}

/**
 * Each file the joined text is made of, in order, as `{file, startLine, lineCount}`; the entry
 * alone when it imports nothing, and `[]` when `readFile` has no entry.
 */
export function stylesheetParts(readFile = readRepoFile) {
  let startLine = 1;
  return (partTexts(readFile) ?? []).map(({ file, text }) => {
    const part = { file, startLine, lineCount: lineCount(text) };
    startLine += part.lineCount;
    return part;
  });
}

/** The module sheet's text: its partials joined in import order, or `undefined` with no entry. */
export function readStylesheet(readFile = readRepoFile) {
  return partTexts(readFile)
    ?.map(({ text }) => text)
    .join('');
}

/** The physical `{file, line}` of 1-based `line` of the joined text. */
export function locateStylesheetLine(line, readFile = readRepoFile) {
  const part = stylesheetParts(readFile).find(
    ({ startLine, lineCount: count }) => line >= startLine && line < startLine + count
  );
  if (!part) throw new RangeError(`line ${line} is outside ${STYLESHEET_ENTRY}`);
  return { file: part.file, line: line - part.startLine + 1 };
}
