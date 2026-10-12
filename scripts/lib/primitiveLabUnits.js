/**
 * How the PR capture names a design-library unit (issue 2413): the target key grammar, and the
 * `library.html` region scanner that both the selection and the capture read the library with.
 * Dependency-free, so the `select` job can load it with no packages installed.
 */
import { Buffer } from 'node:buffer';

/** The design-system library, relative to the repository root. */
export const LIBRARY_PATH = 'openspec/specs/design-system/library.html';

/** At most this many distinct units are captured in one run; the rest are named as overflow. */
export const MAX_LIBRARY_UNITS = 24;

/** The key that stands for one unit per catalogue section, derived at capture time. */
export const COVERAGE_KEY = 'coverage';

export const rowKey = (section, index) => `row:${section}/${index}`;
export const entryKey = (entry) => `entry:${entry}`;
export const unitKey = (entry, unit) => `unit:${entry}.${unit}`;
/** A path is escaped (`%` and `,`, as `decodeURIComponent` reads them) so no key holds a comma. */
export const unlocatedKey = (file, count) =>
  `unlocated:${file.replaceAll('%', '%25').replaceAll(',', '%2C')}:${count}`;

/** The key a deleted row still selects its unit by: its `(spec, cap)` address. */
export function addressKey(spec, cap) {
  const json = JSON.stringify([spec, cap ?? null]);
  // eslint-disable-next-line unicorn/prefer-uint8array-base64 -- Node 22, the floor, has no Uint8Array#toBase64.
  return `addr:${Buffer.from(json).toString('base64url')}`;
}

const KEY_GRAMMAR = Object.freeze([
  ['row', /^row:([\w-]+)\/(\d+)$/, (match) => ({ section: match[1], index: Number(match[2]) })],
  ['entry', /^entry:(\d+)$/, (match) => ({ entry: Number(match[1]) })],
  ['unit', /^unit:(\d+)\.(\d+)$/, (match) => ({ entry: Number(match[1]), unit: Number(match[2]) })],
  ['addr', /^addr:([\w-]+)$/, (match) => decodeAddress(match[1])],
  ['coverage', /^coverage$/, () => ({})],
  ['unlocated', /^unlocated:(.+):(\d+)$/, (match) => unlocatedFields(match)],
]);

function unlocatedFields([, file, count]) {
  try {
    return { file: decodeURIComponent(file), count: Number(count) };
  } catch {
    return null;
  }
}

function decodeAddress(encoded) {
  try {
    // eslint-disable-next-line unicorn/prefer-uint8array-base64 -- Node 22 has no Uint8Array.fromBase64.
    const [spec, cap] = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    return typeof spec === 'string' ? { spec, cap: typeof cap === 'string' ? cap : null } : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} key A target key.
 * @returns {object|null} `{kind, …}` with the key's own fields, or null when it is malformed.
 */
export function parseTargetKey(key) {
  for (const [kind, pattern, fields] of KEY_GRAMMAR) {
    const match = pattern.exec(key);
    if (!match) continue;
    const parsed = fields(match);
    return parsed ? { kind, ...parsed } : null;
  }
  return null;
}

/** The comma-separated form the workflow carries, and back. */
export const formatTargets = (keys) => keys.join(',');
export const parseTargets = (text) => [
  ...new Set(
    String(text ?? '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
  ),
];

/** One resolved element's identity: its entry ordinal, and its unit ordinal or `spec`. */
export const elementId = ({ entry, unit }) => `${entry}.${unit ?? 'spec'}`;

/**
 * Deduplicate resolved targets by element, in the order given (highest signal first), and keep the
 * first `max` elements; the rest are overflow, in that same order.
 *
 * @param {{key: string, element: {entry: number, unit: number|null}}[]} resolved Resolved targets.
 * @param {number} [max] The cap.
 * @returns {{units: object[], overflow: object[]}} Each `{element, keys, …first target's fields}`.
 */
export function capDistinctUnits(resolved, max = MAX_LIBRARY_UNITS) {
  const groups = new Map();
  for (const { key, ...target } of resolved) {
    const id = elementId(target.element);
    if (!groups.has(id)) groups.set(id, { ...target, id, keys: [] });
    const { keys } = groups.get(id);
    if (!keys.includes(key)) keys.push(key);
  }
  const ordered = [...groups.values()];
  return { units: ordered.slice(0, max), overflow: ordered.slice(max) };
}

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style']);
const TAG_NAME = /<(\/?)([a-zA-Z][\w-]*)/y;
const CLASS_PATTERN = /(?:^|\s)class\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/** The index of the `>` that ends a tag's attributes, skipping any inside quotes; -1 when none. */
function tagEnd(text, from) {
  let quote = null;
  for (let index = from; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === '>') return index;
  }
  return -1;
}

/** The next tag at or after `from`, comments skipped, or null when none is left. */
function nextTag(text, from) {
  let at = text.indexOf('<', from);
  while (at !== -1) {
    if (text.startsWith('<!--', at)) {
      const close = text.indexOf('-->', at + 4);
      if (close === -1) return null;
      at = text.indexOf('<', close + 3);
      continue;
    }
    TAG_NAME.lastIndex = at;
    const match = TAG_NAME.exec(text);
    const end = match ? tagEnd(text, TAG_NAME.lastIndex) : -1;
    if (end !== -1) {
      const [, closing, name] = match;
      const attributes = text.slice(TAG_NAME.lastIndex, end);
      return {
        index: at,
        closing: closing === '/',
        name: name.toLowerCase(),
        attributes,
        end: end + 1,
      };
    }
    at = text.indexOf('<', at + 1);
  }
  return null;
}

function classTokens(attributes) {
  const match = CLASS_PATTERN.exec(attributes);
  return new Set((match?.[1] ?? match?.[2] ?? '').split(/\s+/).filter(Boolean));
}

/** A line-number lookup for character offsets, 1-based. */
function lineIndex(text) {
  const starts = [0];
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) {
    starts.push(index + 1);
  }
  return (offset) => {
    let low = 0;
    let high = starts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
}

/** The raw markup between an opening tag ending at `from` and its balanced close. */
function innerMarkup(text, from, name) {
  const pattern = new RegExp(String.raw`<(\/?)${name}\b[^>]*>`, 'gi');
  pattern.lastIndex = from;
  let depth = 1;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return text.slice(from, match.index);
  }
  return text.slice(from);
}

function divKind(tokens, stack) {
  if (tokens.has('spec')) return 'spec';
  if (tokens.has('unit')) return 'unit';
  const parent = stack.at(-1);
  return tokens.has('spec-head') && parent?.kind === 'spec' && parent.open === 0
    ? 'spec-head'
    : 'div';
}

function openDiv(state, attributes, line) {
  const kind = divKind(classTokens(attributes), state.stack);
  const frame = { kind, open: 0 };
  if (kind === 'spec') {
    const index = state.entries.length;
    frame.entry = { key: entryKey(index), index, start: line, heading: null, units: 0 };
    state.entries.push(frame.entry);
  }
  const owner = state.stack.findLast((candidate) => candidate.kind === 'spec')?.entry;
  if (kind === 'unit' && owner) {
    const index = owner.units++;
    frame.unit = { key: unitKey(owner.index, index), entry: owner.index, index, start: line };
    Object.assign(frame.unit, { end: line, caption: null });
    state.units.push(frame.unit);
  }
  state.stack.push(frame);
}

function closeDiv(state, line) {
  const frame = state.stack.pop();
  if (frame?.unit) frame.unit.end = line;
}

/** Record an entry's heading or a unit's caption when this element is the one that carries it. */
function readLabel(state, name, attributes, inner) {
  const top = state.stack.at(-1);
  if (!top || top.open !== 0) return;
  if (name === 'h4' && top.kind === 'spec-head') {
    const entry = state.stack.at(-2).entry;
    entry.heading ??= inner();
  } else if (top.unit && top.unit.caption === null && classTokens(attributes).has('cap')) {
    top.unit.caption = inner();
  }
}

/** Close each entry at the line before the next entry opener or `</section>`. */
function closeEntries(entries, sectionEnds, lastLine) {
  const boundaries = [...entries.map((entry) => entry.start), ...sectionEnds].sort((a, b) => a - b);
  for (const entry of entries) {
    const next = boundaries.find((line) => line > entry.start);
    entry.end = next === undefined ? lastLine : next - 1;
  }
}

function closeTag(state, name, line) {
  if (name === 'div') closeDiv(state, line);
  else if (name === 'section') state.sectionEnds.push(line);
  else {
    const top = state.stack.at(-1);
    if (top) top.open = Math.max(0, top.open - 1);
  }
}

/** Apply one tag to the scan, returning where the search for the next tag starts. */
function readTag(state, text, tag, line) {
  const { closing, name, attributes, end } = tag;
  if (closing) {
    closeTag(state, name, line);
    return end;
  }
  if (RAW_TEXT_ELEMENTS.has(name)) return end + innerMarkup(text, end, name).length;
  if (name === 'div') {
    openDiv(state, attributes, line);
    return end;
  }
  const top = state.stack.at(-1);
  readLabel(state, name, attributes, () => innerMarkup(text, end, name));
  if (top && !VOID_ELEMENTS.has(name) && !attributes.endsWith('/')) top.open += 1;
  return end;
}

/**
 * Scan `library.html` into entry and unit regions by balanced `<div>` depth over class tokens.
 *
 * @param {string} text The library's source.
 * @returns {{entries: {key: string, index: number, start: number, end: number, heading:
 *   string|null}[], units: {key: string, entry: number, index: number, start: number, end: number,
 *   caption: string|null}[]}} Regions over 1-based lines, with raw heading and caption markup.
 */
export function scanLibraryRegions(text) {
  const lineOf = lineIndex(text);
  const state = { stack: [], entries: [], units: [], sectionEnds: [] };
  let from = 0;
  for (let tag = nextTag(text, from); tag; tag = nextTag(text, from)) {
    from = readTag(state, text, tag, lineOf(tag.index));
  }
  closeEntries(state.entries, state.sectionEnds, lineOf(text.length));
  return { entries: state.entries.map(({ units, ...entry }) => entry), units: state.units };
}
