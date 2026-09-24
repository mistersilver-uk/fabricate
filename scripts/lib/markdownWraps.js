/** Hard-wrap detection and joining for Markdown authored one sentence per line. */

/**
 * The line endings that finish a sentence, written down because two readings of "ends a sentence"
 * differ by over 100 sites here.
 */
const SENTENCE_END = /(?:[.!?…][`*_)\]}"'”’»]*|[:;])$/u;

/** Trailing words whose `.` is not a sentence end: the list the markdownlint rule itself ignores. */
const ABBREVIATION = /(?:^|[\s(["'])(?:e\.g|eg|i\.e|ie|etc|ex|vs)\.$/iu;

/** Lines whose own shape forbids a join, tested after the blockquote prefix is stripped. */
const OPAQUE = [
  /^ {0,3}#{1,6}(?:\s|$)/u, // ATX heading
  /^\s*\|/u, // table row
  /^\s*\{:/u, // kramdown block attribute, e.g. `{: .note }`
  /^\s*\[[^\]]*\]:\s/u, // link-reference definition
  /^\s*(?:-{2,}|={1,}|\*{3,}|_{3,})\s*$/u, // thematic break or setext underline
  /^\s*<[/!a-zA-Z]/u, // raw HTML block line
];

/** Additionally forbidden as the CONTINUATION: joining these swallows the construct they open. */
const OPAQUE_AS_CONTINUATION = [/^\s*(?:[-*+]|\d+[.)])(?:\s|$)/u];

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/u;
const FRONT_MATTER_OPEN = /^---\s*$/u;
const FRONT_MATTER_CLOSE = /^(?:---|\.\.\.)\s*$/u;
/** A trailing hard break (two spaces or a backslash) is a rendered `<br>`, not a wrap. */
const HARD_BREAK = /(?: {2,}|\\)$/u;
/** One level of blockquote marker at the start of a line. */
const QUOTE_MARKER = /^ {0,3}>[ \t]?/u;

/** Split a line into its blockquote depth and the body inside it. */
function stripQuote(line) {
  let depth = 0;
  let body = line;
  for (let marker = QUOTE_MARKER.exec(body); marker; marker = QUOTE_MARKER.exec(body)) {
    depth += 1;
    body = body.slice(marker[0].length);
  }
  return { depth, body };
}

/** The index after a leading front-matter block, or 0 when there is none. */
function frontMatterEnd(lines) {
  if (lines.length === 0 || !FRONT_MATTER_OPEN.test(lines[0])) return 0;
  for (let index = 1; index < lines.length; index += 1) {
    if (FRONT_MATTER_CLOSE.test(lines[index])) return index + 1;
  }
  return 0;
}

/** Whether `body` closes an open fence: the same marker, at least as long, and nothing else. */
function closesFence(body, fence) {
  return new RegExp(String.raw`^ {0,3}${fence[0]}{${fence.length},}\s*$`, 'u').test(body);
}

/**
 * Per-line kind: `'meta'` for front matter, fenced content and HTML comments, else `'prose'`.
 * All three are block states, not line prefixes — a comment's second line has no `<!--` on it.
 */
function classifyLines(lines) {
  const kinds = Array.from({ length: lines.length }, () => 'prose');
  const start = frontMatterEnd(lines);
  for (let index = 0; index < start; index += 1) kinds[index] = 'meta';

  let fence = null;
  let comment = false;
  for (let index = start; index < lines.length; index += 1) {
    const { body } = stripQuote(lines[index]);
    if (fence !== null) {
      kinds[index] = 'meta';
      if (closesFence(body, fence)) fence = null;
      continue;
    }
    if (comment) {
      kinds[index] = 'meta';
      if (body.includes('-->')) comment = false;
      continue;
    }
    const opening = FENCE_OPEN.exec(body);
    if (opening) {
      fence = opening[1];
      kinds[index] = 'meta';
      continue;
    }
    if (body.includes('<!--')) {
      kinds[index] = 'meta';
      comment = !body.includes('-->');
    }
  }
  return kinds;
}

/** Whether `body` ends a sentence rather than breaking one. */
export function endsSentence(body) {
  return SENTENCE_END.test(body) && !ABBREVIATION.test(body);
}

/** Whether line `index` (0-based) is prose continuing into line `index + 1`. */
function continuesInto(lines, kinds, index) {
  if (kinds[index] !== 'prose' || kinds[index + 1] !== 'prose') return false;
  const here = stripQuote(lines[index]);
  const next = stripQuote(lines[index + 1]);
  // A `>` paragraph break, and the boundary between quoted and unquoted text, are both structure.
  if (here.depth !== next.depth) return false;
  const current = here.body.trimEnd();
  const following = next.body.trim();
  if (current.trim() === '' || following === '') return false;
  if (HARD_BREAK.test(here.body)) return false;
  if (OPAQUE.some((shape) => shape.test(current))) return false;
  if ([...OPAQUE, ...OPAQUE_AS_CONTINUATION].some((shape) => shape.test(following))) return false;
  return !endsSentence(current);
}

/** The 1-based numbers of the lines that continue into the next line mid-sentence. */
export function wrappedSites(text) {
  const lines = String(text).split('\n');
  const kinds = classifyLines(lines);
  const sites = [];
  for (let index = 0; index + 1 < lines.length; index += 1) {
    if (continuesInto(lines, kinds, index)) sites.push(index + 1);
  }
  return sites;
}

/** `text` with every wrapped sentence rejoined by a single space. */
export function joinWraps(text) {
  const lines = String(text).split('\n');
  const kinds = classifyLines(lines);
  const output = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (current === null) current = lines[index];
    else current = `${current.replace(/\s+$/u, '')} ${stripQuote(lines[index]).body.trim()}`;
    if (index + 1 < lines.length && continuesInto(lines, kinds, index)) continue;
    output.push(current);
    current = null;
  }
  return output.join('\n');
}
