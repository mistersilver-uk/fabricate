/**
 * The pull request body structure the screenshot publisher and gate share (issue 1174): where the
 * managed screenshot blocks are, and which lines form Screenshots sections.
 */

/** A managed-block delimiter counts only as a whole line, as `upsertScreenshotsBlock` writes it. */
const BLOCK_MARKER_LINE = /^[ \t]*<!-- fabricate:screenshots:(start|end) -->[ \t]*$/;

/** List-item and blockquote markers in front of a fence, which still renders as one. */
const CONTAINER_PREFIX = /^(?:[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+|[ \t]*>[ \t]?)+/;

/** A fence opener; CommonMark forbids a backtick in a backtick fence's info string. */
const FENCE_OPENER = /^ {0,3}(`{3,}(?=[^`]*$)|~{3,})/;
const FENCE_CLOSER = /^[ \t]*(`{3,}|~{3,})[ \t]*$/;

const TOP_LEVEL_HEADING = /^#{1,2}\s/;
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*$/;
const NEXT_HEADING_PATTERN = /^(#{1,6})\s/;

const fenceText = (line) => line.replace(CONTAINER_PREFIX, '');

/** The line closing a fence `run` opened at `from`, or -1. */
function closerIndex(lines, from, run) {
  for (let index = from + 1; index < lines.length; index += 1) {
    const closer = FENCE_CLOSER.exec(fenceText(lines[index]))?.[1];
    if (closer && closer[0] === run[0] && closer.length >= run.length) return index;
  }
  return -1;
}

/**
 * Which lines sit inside a closed code fence. An opener nothing closes is ordinary text, and once
 * one is found unclosed no later opener of its character and at least its length is searched.
 */
function fencedLines(lines) {
  const fenced = lines.map(() => false);
  const unclosedFrom = { '`': Infinity, '~': Infinity };
  for (let index = 0; index < lines.length; index += 1) {
    const run = FENCE_OPENER.exec(fenceText(lines[index]))?.[1];
    if (!run || run.length >= unclosedFrom[run[0]]) continue;
    const close = closerIndex(lines, index, run);
    if (close === -1) {
      unclosedFrom[run[0]] = run.length;
      continue;
    }
    fenced.fill(true, index, close + 1);
    index = close;
  }
  return fenced;
}

/** Each line of `text` with its offsets, whether a fence holds it, and the delimiter it is. */
function scanLines(text) {
  const raw = String(text ?? '').split('\n');
  const lines = raw.map((entry) => (entry.endsWith('\r') ? entry.slice(0, -1) : entry));
  const fenced = fencedLines(lines);
  let offset = 0;
  return lines.map((line, index) => {
    const start = offset;
    offset += raw[index].length + 1;
    const marker = fenced[index] ? null : (BLOCK_MARKER_LINE.exec(line)?.[1] ?? null);
    return { line, fenced: fenced[index], marker, start, end: start + line.length };
  });
}

/** Whether a line is an ATX heading opening a "Screenshots" section. */
function isScreenshotsHeading(line) {
  const heading = HEADING_PATTERN.exec(line);
  return Boolean(heading) && /^screenshots?\b/i.test(heading[2].trim());
}

/** The first line in `[from, limit)` carrying the `kind` delimiter, or -1. */
function markerIndex(lines, from, limit, kind) {
  for (let index = from; index < limit; index += 1) {
    if (lines[index].marker === kind) return index;
  }
  return -1;
}

/**
 * The last line of a block with no end delimiter: the last non-blank line before the next start
 * delimiter or the first unfenced ATX level-1 or level-2 heading after its own Screenshots heading.
 */
function unterminatedLastLine(lines, first, limit) {
  let index = first + 1;
  while (index < limit && lines[index].line.trim() === '') index += 1;
  if (index < limit && isScreenshotsHeading(lines[index].line)) index += 1;
  let last = first;
  for (; index < limit; index += 1) {
    const { line, fenced } = lines[index];
    if (!fenced && TOP_LEVEL_HEADING.test(line)) break;
    if (line.trim() !== '') last = index;
  }
  return last;
}

/**
 * Every managed block's `{ start, end, terminated }` character span, one per start delimiter: it
 * closes at the first end delimiter before the next start delimiter, and an end delimiter no start
 * opened is ordinary text.
 */
export function locateManagedBlocks(text) {
  const lines = scanLines(text);
  const spans = [];
  let from = markerIndex(lines, 0, lines.length, 'start');
  while (from !== -1) {
    const next = markerIndex(lines, from + 1, lines.length, 'start');
    const limit = next === -1 ? lines.length : next;
    const end = markerIndex(lines, from + 1, limit, 'end');
    const last = end === -1 ? unterminatedLastLine(lines, from, limit) : end;
    spans.push({ start: lines[from].start, end: lines[last].end, terminated: end !== -1 });
    from = next;
  }
  return spans;
}

/** The body with every span blanked out, line count preserved. */
export function maskSpans(text, spans) {
  let masked = text;
  for (const { start, end } of spans) {
    const blanked = masked.slice(start, end).replaceAll(/[^\n]/g, ' ');
    masked = `${masked.slice(0, start)}${blanked}${masked.slice(end)}`;
  }
  return masked;
}

/**
 * The body with its first managed block replaced and every later one deleted with the blank lines
 * in front of it, so text between blocks survives; `null` when it holds no block.
 */
export function replaceManagedBlocks(text, replacement) {
  const spans = locateManagedBlocks(text);
  if (spans.length === 0) return null;
  const pieces = [text.slice(0, spans[0].start), replacement];
  for (let index = 1; index < spans.length; index += 1) {
    const previousEnd = spans[index - 1].end;
    let start = spans[index].start;
    while (start > previousEnd && /\s/.test(text[start - 1])) start -= 1;
    pieces.push(text.slice(previousEnd, start));
  }
  pieces.push(text.slice(spans.at(-1).end));
  return pieces.join('');
}

/** The body of the section a heading opens, up to the next heading of the same or a higher level. */
function sectionBody(lines, headingIndex, level) {
  const collected = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const next = NEXT_HEADING_PATTERN.exec(lines[index]);
    if (next && next[1].length <= level) break;
    collected.push(lines[index]);
  }
  return collected.join('\n');
}

/** Every "Screenshots" section of a body, read past fenced lines so a fence hides nothing. */
export function screenshotSections(body) {
  const lines = scanLines(body)
    .filter((entry) => !entry.fenced)
    .map((entry) => entry.line);
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!isScreenshotsHeading(lines[index])) continue;
    sections.push(sectionBody(lines, index, HEADING_PATTERN.exec(lines[index])[1].length));
  }
  return sections;
}
