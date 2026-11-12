/**
 * The reference scanner behind `tests/lang-keys-no-orphans.test.js` (issues 1631, 1639).
 *
 * A `FABRICATE.*` literal is read in one of two ways. A COMPLETE reference ends where the key
 * does, so it credits exactly that leaf. A COMPOSED reference stops at a template opener
 * (`FABRICATE.A.B.${key}`), a trailing dot (`'FABRICATE.A.B.'`) or a partial segment
 * (`FABRICATE.A.Check${id}`): the scanner cannot read what the site appends, so it must not credit
 * the whole subtree. A leaf under a composed base is credited only when the suffix it would need
 * is spelled somewhere the composing site can see — its own file or a file it imports by relative
 * path — and every composed base is reported by name so the unverified surface stays visible.
 */
import { dirname, posix } from 'node:path';

/** Capture a maximal `FABRICATE.<seg>(.<seg>)*` dotted literal. */
export const REFERENCE = /FABRICATE\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*/g;

const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** The literal run that follows the first `${...}` at `open` (its balanced close), or `''`. */
function tailAfterInterpolation(text, open) {
  if (!text.startsWith('${', open)) return '';
  let depth = 0;
  let index = open + 1;
  for (; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}' && --depth === 0) break;
  }
  return /^[A-Za-z0-9_]*/.exec(text.slice(index + 1))[0];
}

/** How a reference ends: `segment` (`.${`, `.'`), `partial` (`${` straight after a segment), or a leaf. */
function composition(text, end) {
  const next = text.slice(end, end + 3);
  if (next.startsWith('${')) return { kind: 'partial', tail: tailAfterInterpolation(text, end) };
  if (/^\.(?:\$\{|['"`])/.test(next)) {
    return { kind: 'segment', tail: tailAfterInterpolation(text, end + 1) };
  }
  return null;
}

const escapeRegex = (value) => value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** A word-bounded, first-letter-case-insensitive matcher for one suffix token. */
function tokenMatcher(token) {
  const head = token[0];
  const flexible = /[A-Za-z]/.test(head) ? `[${head.toUpperCase()}${head.toLowerCase()}]` : head;
  return new RegExp(`(?<![A-Za-z0-9_])${flexible}${escapeRegex(token.slice(1))}(?![A-Za-z0-9_])`);
}

/** Whether `token` is spelled whole, or as a quoted stem plus a literal suffix the site appends. */
function spelledIn(token, visibleText) {
  if (tokenMatcher(token).test(visibleText)) return true;
  for (let cut = 1; cut < token.length; cut += 1) {
    const stem = token.slice(0, cut);
    const suffix = token.slice(cut);
    if (!/^[A-Z]/.test(suffix)) continue;
    const stemQuoted = new RegExp(`['"\`]${escapeRegex(stem)}['"\`]`);
    const suffixLiteral = new RegExp(`(?:['"\`}])${escapeRegex(suffix)}(?:['"\`$])`);
    if (stemQuoted.test(visibleText) && suffixLiteral.test(visibleText)) return true;
  }
  return false;
}

/** The listed `.js`/`.svelte` files a source file imports by relative path. */
function importedFiles(file, text, fileSet) {
  const found = [];
  for (const match of text.matchAll(RELATIVE_IMPORT)) {
    const target = posix.normalize(posix.join(dirname(file), match[1]));
    for (const candidate of [target, `${target}.js`, `${target}.svelte`]) {
      if (fileSet.has(candidate)) found.push(candidate);
    }
  }
  return found;
}

/**
 * Scan the source files for references.
 *
 * @returns {{exact: Set<string>, composed: Array<{base: string, partial: boolean, file: string}>,
 *   visible: (file: string) => string}}
 */
export function scanReferences(files, readFile) {
  const fileSet = new Set(files);
  const exact = new Set();
  const composed = [];
  const texts = new Map();
  for (const file of files) {
    const text = readFile(file);
    if (text === undefined) continue;
    texts.set(file, text);
    for (const match of text.matchAll(REFERENCE)) {
      const kind = composition(text, match.index + match[0].length);
      if (kind) {
        composed.push({ base: match[0], partial: kind.kind === 'partial', tail: kind.tail, file });
      } else exact.add(match[0]);
    }
  }
  const memo = new Map();
  /** The text the composing site can see: its own file plus its direct relative imports. */
  const visible = (file) => {
    if (!memo.has(file)) {
      const own = texts.get(file) ?? '';
      const imports = importedFiles(file, own, fileSet).map((f) => texts.get(f) ?? '');
      memo.set(file, [own, ...imports].join('\n'));
    }
    return memo.get(file);
  };
  return { exact, composed, visible };
}

/** Whether a composed reference can produce `leaf`; `null` when the leaf is not under its base. */
function produces(reference, leaf, visibleText) {
  const { base, partial, tail } = reference;
  const lead = partial ? base : `${base}.`;
  if (!leaf.startsWith(lead)) return null;
  let token = leaf.slice(lead.length).split('.', 1)[0];
  if (token === '') return null;
  if (tail) {
    if (!token.endsWith(tail) || token === tail) return false;
    token = token.slice(0, -tail.length);
  }
  return spelledIn(token, visibleText);
}

/** The leaves no reference credits, plus the composed bases the scan could not verify. */
export function unreferencedLeaves(leaves, files, readFile) {
  const { exact, composed, visible } = scanReferences(files, readFile);
  const orphans = leaves.filter((leaf) => {
    if (isCoveredBy(exact, leaf)) return false;
    return composed.every(
      (reference) => !(produces(reference, leaf, visible(reference.file)) === true)
    );
  });
  return {
    orphans,
    unverified: [...new Set(composed.map((reference) => reference.base))].sort((a, b) =>
      a < b ? -1 : Number(a > b)
    ),
  };
}

function isCoveredBy(prefixes, leaf) {
  for (const prefix of prefixes) {
    if (leaf === prefix || leaf.startsWith(`${prefix}.`)) return true;
  }
  return false;
}
