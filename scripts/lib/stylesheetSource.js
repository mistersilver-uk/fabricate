/**
 * The one reader of the module sheet (issue 1711): `styles/fabricate.css` and the sibling partials
 * it `@import`s, joined in import order. An entry with no import is its own text. Every function
 * takes `readFile(repoRelativePath)`, returning text or `undefined`, so one git side or another
 * checkout reads through the same loader; it defaults to this checkout.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

export const STYLESHEET_ENTRY = 'styles/fabricate.css';

/** A partial's repo-relative path. A pattern, so a deleted or renamed partial still matches. */
export const STYLESHEET_PART_PATTERN = /^styles\/fabricate-[a-z0-9-]+\.css$/u;

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const COMMENT = /\/\*[\s\S]*?\*\//gu;
const IMPORT_RULE = /@import\s+url\(\s*(["'])([^"']*)\1\s*\)\s*;/gu;
const PART_NAME = /^fabricate-[a-z0-9-]+\.css$/u;
const ANY_IMPORT = /@import\b/iu;

const isSheetPath = (file) => file === STYLESHEET_ENTRY || STYLESHEET_PART_PATTERN.test(file);

/** How many loader functions are reading: a checkout reader hands sheet paths only to them. */
let loaderReads = 0;

function asLoader(read) {
  loaderReads += 1;
  try {
    return read();
  } finally {
    loaderReads -= 1;
  }
}

/**
 * A reader of the checkout at `root`, `undefined` for a file it does not hold. It refuses a path
 * outside `root`, and a sheet path unless a loader function here is the one reading.
 */
export function checkoutReader(root = REPO_ROOT) {
  const base = resolve(root);
  return (file) => {
    const target = resolve(base, file);
    if (!target.startsWith(base + sep)) throw new Error(`${file} is outside ${base}`);
    if (loaderReads === 0 && isSheetPath(relative(base, target).split(sep).join('/'))) {
      throw new Error(`${file} is read through readStylesheet(), not a checkout reader`);
    }
    try {
      return readFileSync(target, 'utf8');
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
  if (ANY_IMPORT.test(code.replaceAll(IMPORT_RULE, ''))) {
    throw new Error(`${STYLESHEET_ENTRY} holds an @import the loader cannot read`);
  }
  const names = [...code.matchAll(IMPORT_RULE)].map((match) => match[2]);
  if (names.length === 0) return [];
  const bad = names.find((name) => !PART_NAME.test(name));
  if (bad) throw new Error(`${STYLESHEET_ENTRY} imports "${bad}", not a sibling fabricate-*.css`);
  if (code.replaceAll(IMPORT_RULE, '').trim() !== '') {
    throw new Error(`${STYLESHEET_ENTRY} holds rules beside its @import lines`);
  }
  return names.map((name) => `styles/${name}`);
}

const lineCount = (text) =>
  text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);

/**
 * The entry's own text and each partial it imports as `{file, text}`, `text` being `undefined`
 * for a missing partial: what a structural check reads. `entry` is `undefined` with no entry.
 */
export function stylesheetSources(readFile = readRepoFile) {
  return asLoader(() => {
    const entry = readFile(STYLESHEET_ENTRY);
    if (entry === undefined) return { entry, parts: [] };
    const parts = stylesheetImports(entry).map((file) => ({ file, text: readFile(file) }));
    return { entry, parts };
  });
}

function partTexts(readFile) {
  const { entry, parts } = stylesheetSources(readFile);
  if (entry === undefined) return;
  if (parts.length === 0) return [{ file: STYLESHEET_ENTRY, text: entry }];
  for (const { file, text } of parts) {
    if (text === undefined)
      throw new Error(`${STYLESHEET_ENTRY} imports ${file}, which is missing`);
  }
  return parts;
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
