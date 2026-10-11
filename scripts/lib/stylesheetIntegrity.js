/**
 * The module sheet's structure (issue 1711): the entry holds only sibling imports and plain
 * comments, every `styles/fabricate-*.css` is imported exactly once, and each partial holds no
 * import, ends in a newline without CRLF, and stays within `STYLESHEET_PART_LIMIT` lines.
 */
import {
  STYLESHEET_ENTRY,
  STYLESHEET_PART_PATTERN,
  stylesheetSources,
} from './stylesheetSource.js';

export const STYLESHEET_PART_LIMIT = 4000;

const COMMENT = /\/\*[\s\S]*?\*\//gu;
const IMPORT_LINE = /^@import url\("fabricate-[a-z0-9-]+\.css"\);$/u;
const DIRECTIVE = /ratchet-exempt\(|stylelint-(?:disable|enable)/u;

function entryFailures(entry) {
  const failures = [];
  const comments = entry.match(COMMENT) ?? [];
  if (comments.some((comment) => DIRECTIVE.test(comment))) {
    failures.push(
      `${STYLESHEET_ENTRY} carries a marker or stylelint directive, which no rule sees`
    );
  }
  const stray = entry
    .replaceAll(COMMENT, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !IMPORT_LINE.test(line));
  return [
    ...failures,
    ...stray.map((line) => `${STYLESHEET_ENTRY} holds "${line}", not an @import of a partial`),
  ];
}

function partFailures(file, text) {
  const failures = [];
  if (/@import\b/u.test(text.replaceAll(COMMENT, ''))) failures.push(`${file} holds an @import`);
  if (text.includes('\r')) failures.push(`${file} holds a carriage return`);
  if (!text.endsWith('\n')) failures.push(`${file} does not end with a newline`);
  const lines = text.split('\n').length - 1;
  if (lines > STYLESHEET_PART_LIMIT) {
    failures.push(`${file} is ${lines} lines, over ${STYLESHEET_PART_LIMIT}`);
  }
  return failures;
}

/** Every structural failure of the sheet `readFile` sees, given the repo-relative `styles/` files. */
export function stylesheetIntegrityFailures(readFile, stylesFiles) {
  let sources;
  try {
    sources = stylesheetSources(readFile);
  } catch (error) {
    return [error.message];
  }
  const { entry, parts } = sources;
  if (entry === undefined) return [`${STYLESHEET_ENTRY} is missing`];
  const failures = parts.length > 0 ? entryFailures(entry) : [];
  const seen = new Set();
  const partsFailures = parts.flatMap(({ file, text }) => {
    const twice = seen.has(file) ? [`${file} is imported more than once`] : [];
    seen.add(file);
    const own = text === undefined ? [`${file} is imported but missing`] : partFailures(file, text);
    return [...twice, ...own];
  });
  const unimported = stylesFiles
    .filter((path) => STYLESHEET_PART_PATTERN.test(path) && !seen.has(path))
    .map((file) => `${file} is not imported by ${STYLESHEET_ENTRY}`);
  return [...failures, ...partsFailures, ...unimported];
}
