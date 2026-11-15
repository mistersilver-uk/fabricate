/**
 * The Jekyll pages under `docs/` (issue 1734). Each page opens with a front-matter block carrying
 * `layout` and `title`, and each Kramdown callout attribute `{: .note }` stands on its own line,
 * so a page that the strict build accepts still renders its callout and its navigation entry.
 * `docs/domain/` is excluded by `_config.yml`; the generated `_site`, vendor and dependency trees
 * are not authored pages.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_ROOT = path.join(REPO_ROOT, 'docs');

/** Directories the site never publishes as authored pages. */
const SKIPPED_DIRECTORIES = new Set(['_site', 'vendor', 'node_modules', 'domain']);

/** Keys the layout and the navigation read from a page's front matter. */
const REQUIRED_KEYS = ['layout', 'title'];

/** A whole Kramdown attribute line: `{: .note }`, `{: .fs-6 .fw-300 }`. */
const ATTRIBUTE_LINE = /^\{:[^{}]*\}$/;

/**
 * Every Markdown page under a directory, relative to the repository root.
 * @param {string} directory Absolute directory to walk.
 * @returns {string[]} Absolute paths of the `.md` files found.
 */
function markdownPages(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : markdownPages(full);
    }
    return entry.name.endsWith('.md') ? [full] : [];
  });
}

/**
 * The front-matter block of a page, read line by line: the block must open on the first line and
 * close on a later `---`, and each key sits at column zero.
 * @param {string} text The page's contents.
 * @returns {{ok: true, keys: Set<string>} | {ok: false, reason: string}} The keys, or why none.
 */
function frontMatterOf(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { ok: false, reason: 'does not open with a --- line' };
  const close = lines.indexOf('---', 1);
  if (close === -1) return { ok: false, reason: 'the front-matter block never closes' };
  const keys = new Set(
    lines
      .slice(1, close)
      .map((line) => /^([A-Za-z_][\w-]*):/.exec(line)?.[1])
      .filter(Boolean)
  );
  return { ok: true, keys };
}

/**
 * Every line of a page, with fenced code blocks skipped so a literal example is not a callout.
 * @param {string} text The page's contents.
 * @returns {{line: number, text: string}[]} The prose lines, numbered from one.
 */
function proseLines(text) {
  let fenced = false;
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return [];
    }
    return fenced ? [] : [{ line: index + 1, text: line }];
  });
}

/**
 * The problems a page has with its front matter, as readable strings.
 * @param {string} text The page's contents.
 * @returns {string[]} One entry per missing or malformed element.
 */
function frontMatterProblems(text) {
  const parsed = frontMatterOf(text);
  if (!parsed.ok) return [parsed.reason];
  return REQUIRED_KEYS.filter((key) => !parsed.keys.has(key)).map((key) => `no ${key}: key`);
}

/**
 * The callout attribute lines that do not stand alone, as `line N: text`.
 * @param {string} text The page's contents.
 * @returns {string[]} One entry per attribute glued to other prose.
 */
function gluedAttributesIn(text) {
  return proseLines(text)
    .filter(({ text: line }) => line.includes('{:') && !ATTRIBUTE_LINE.test(line.trim()))
    .map(({ line, text: content }) => `line ${line}: ${content.trim()}`);
}

const PAGES = markdownPages(DOCS_ROOT).map((file) => ({
  file: path.relative(REPO_ROOT, file).split(path.sep).join('/'),
  text: readFileSync(file, 'utf8'),
}));

test('the page walk covers the authored docs and nothing generated', () => {
  assert.ok(PAGES.length > 50, `the walk found only ${PAGES.length} pages`);
  assert.ok(
    PAGES.every(({ file }) => !file.startsWith('docs/domain/') && !file.includes('/_site/')),
    'domain notes and the built site are not pages'
  );
});

test('every docs page opens with front matter carrying layout and title', () => {
  const broken = PAGES.flatMap(({ file, text }) =>
    frontMatterProblems(text).map((problem) => `${file}: ${problem}`)
  );
  assert.deepEqual(broken, [], 'a page without this front matter loses its layout and nav entry');
});

test('every Kramdown callout attribute stands on its own line', () => {
  const glued = PAGES.flatMap(({ file, text }) =>
    gluedAttributesIn(text).map((found) => `${file}:${found}`)
  );
  assert.deepEqual(
    glued,
    [],
    'a callout attribute must sit on its own line or Kramdown renders it as body text'
  );
});

test('the front-matter check refuses a missing key, a missing block and an unclosed block', () => {
  assert.deepEqual(frontMatterProblems('---\nlayout: default\ntitle: X\n---\n# Hi\n'), []);
  assert.deepEqual(frontMatterProblems('---\nlayout: default\n---\n'), ['no title: key']);
  assert.deepEqual(frontMatterProblems('# Hi\n'), ['does not open with a --- line']);
  assert.deepEqual(frontMatterProblems('---\nlayout: default\ntitle: X\n'), [
    'the front-matter block never closes',
  ]);
});

test('the callout check sees a glued attribute and ignores a standalone one or a code fence', () => {
  assert.deepEqual(gluedAttributesIn('{: .note }\n> Body\n'), []);
  assert.deepEqual(gluedAttributesIn('Some text. {: .note }\n'), ['line 1: Some text. {: .note }']);
  assert.deepEqual(gluedAttributesIn('> Quote\n{: .warning }\n'), []);
  assert.deepEqual(gluedAttributesIn('```\nliteral {: .note }\n```\n'), []);
});
