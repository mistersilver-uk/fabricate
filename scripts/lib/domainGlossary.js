/** `DOMAIN.md` glossary entries, their notes under `docs/domain/`, and the gate over both. */
import { isTableRow, splitRow } from './markdownTables.js';
import { endsSentence } from './markdownWraps.js';

/** Each glossary section of `DOMAIN.md` and the notes file its entries link to. */
const SECTION_FILES = {
  'Aggregates and Records': 'docs/domain/records.md',
  'Acquisition, Knowledge, and Resolution Terms': 'docs/domain/terms.md',
};

/**
 * The Definition sentences an entry shows where the first alone misstates or part-states its term:
 * a leading count, or ascending 1-based indices. Rebuilding a row reads the indices back.
 */
export const DEFINITION_SENTENCES = {
  'Aggregates and Records': {
    Component: 2,
    'Phantom-Run `resolved`': 2,
    'Inventory Card / System Participation': 2,
    'Player Result Order': 2,
    'Result Order Asymmetry': 3,
    'Manager Navigation Surface / Provider Seam': 2,
    'Rail Marker Family': 2,
    'World Defaults': [1, 10],
    'System Membership Record': 3,
    'World Identity Snapshot': 2,
  },
};

/** The headings whose moved body is replaced by a one-line pointer into `docs/domain/`. */
const POINTER_HEADINGS = [
  'Remaining Drift to Track',
  'Research Notes',
  'Current Realm Resolution (Phase 1 shipped)',
];

const TABLE_OPEN = [
  '<!-- markdownlint-disable markdownlint-sentences-per-line -->',
  '',
  '| Term | Definition | Canonical Mapping | Spec Reference |',
  '| --- | --- | --- | --- |',
];
const TABLE_CLOSE = ['', '<!-- markdownlint-enable markdownlint-sentences-per-line -->'];
const MAPPING = 'Canonical mapping:';
const SPEC = 'Spec reference:';
const LINK_LINE = /^\[Notes\]\((docs\/domain\/[\w-]+\.md)#([^)\s]+)\)$/u;
const DOMAIN_LINK = /\]\((docs\/domain\/[\w-]+\.md)(?:#([^)\s]*))?\)/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const ATX = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;
/** A line opening a block construct, which a line lifted out of a table cell must never do. */
const BLOCK_START =
  /^(?: {4}|\t|[-+*](?:\s|$)|#{1,6}(?:\s|$)|>|\d{1,9}[.)](?:\s|$)|\||`{3}|~{3}|[=-]+\s*$|<|\[[^\]]*\]:|(?:[*_]\s*){3,}$)/u;
/** Terminal punctuation and any closing marks after it; `:` and `;` never end a split sentence. */
const TERMINAL = /[.!?][*_)\]"'”’]*$/u;
/** The opening of the next sentence: a capital, or bold, emphasis or code before one. */
const SENTENCE_START = /^(?:[A-Z]|\*\*[A-Z`_]|_[A-Z]|`)/u;
/** Words whose trailing `.` the sentences-per-line rule never splits after. */
const IGNORED_WORDS = ['eg.', 'e.g.', 'etc.', 'ex.', 'ie.', 'i.e.', 'vs.'];
const TICK = '`';

/** Every ATX heading outside a fence, as `{ index, level, text }`. */
function headings(markdown) {
  const found = [];
  let fence = null;
  for (const [index, line] of markdown.split('\n').entries()) {
    const opening = FENCE.exec(line)?.[1];
    if (opening && (fence === null || opening.startsWith(fence))) {
      fence = fence === null ? opening[0] : null;
      continue;
    }
    const match = fence === null && ATX.exec(line);
    if (match) found.push({ index, level: match[1].length, text: match[2] });
  }
  return found;
}

/** A heading's anchor as GitHub derives it, before deduplication. */
export function slugify(text) {
  return text
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replaceAll(' ', '-');
}

/** Anchors for `texts` in order, a repeat taking `-1`, `-2` and so on. */
function dedupedSlugs(texts) {
  const seen = new Map();
  return texts.map((text) => {
    const slug = slugify(text);
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    return count === 0 ? slug : `${slug}-${count}`;
  });
}

/** Every heading anchor in `markdown`. */
export function headingSlugs(markdown) {
  return dedupedSlugs(headings(markdown).map(({ text }) => text));
}

/** The index after the code span opening at `start` as the lint rule reads it, or -1. */
function ruleCodeSpanEnd(line, start) {
  let index = start + 1;
  while (line[index] === '`') {
    index += 1;
    if (index === line.length) return -1;
  }
  index = line.indexOf('`', index);
  while (index !== -1 && line[index - 1] === '\\') index = line.indexOf('`', index + 1);
  if (index === -1) return -1;
  while (line[index] === '`') {
    index += 1;
    if (index === line.length) return -1;
  }
  return index;
}

/** Whether the sentences-per-line rule reads a sentence end at `line[index]`. */
function ruleSplitsAt(line, index) {
  if (!/^\. [A-Z]$/u.test(line.slice(index, index + 3))) return false;
  const before = line.slice(0, index + 1).toLowerCase();
  return IGNORED_WORDS.every((word) => !before.endsWith(word));
}

/** The index of the space before `line`'s second sentence by the lint rule's reading, or -1. */
function ruleBreakAt(line) {
  if (/^\s*#/u.test(line)) return -1;
  let index = /^\s*\d+\./u.test(line) ? line.indexOf('.') + 1 : 0;
  while (index < line.length - 2) {
    if (line[index] === '`') index = ruleCodeSpanEnd(line, index);
    if (index === -1 || index >= line.length - 2) return -1;
    if (ruleSplitsAt(line, index)) return index + 1;
    index += 1;
  }
  return -1;
}

/** `line` split wherever the sentences-per-line rule would split it. */
function ruleLines(line) {
  const lines = [];
  let rest = line;
  for (let at = ruleBreakAt(rest); at !== -1; at = ruleBreakAt(rest)) {
    lines.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  return [...lines, rest];
}

/** The index after the code span opening at `start`, or after its backticks when unclosed. */
function codeSpanEnd(text, start) {
  const run = /^`+/u.exec(text.slice(start))[0].length;
  const closing = new RegExp(`(?<!${TICK})${TICK.repeat(run)}(?!${TICK})`, 'u');
  const close = closing.exec(text.slice(start + run));
  return close ? start + run + close.index + run : start + run;
}

/** Whether the space at `text[index]` sits between two sentences. */
function breaksSentence(text, index) {
  const before = text.slice(0, index);
  return (
    TERMINAL.test(before) && endsSentence(before) && SENTENCE_START.test(text.slice(index + 1))
  );
}

/**
 * `text` one sentence per line: split at each sentence end, including before a sentence opening
 * with bold, emphasis or code, then wherever the sentences-per-line rule would still split.
 */
export function sentenceLines(text) {
  const breaks = [-1];
  let index = 0;
  while (index < text.length) {
    if (text[index] === '`') {
      index = codeSpanEnd(text, index);
      continue;
    }
    if (text[index] === ' ' && breaksSentence(text, index)) breaks.push(index);
    index += 1;
  }
  breaks.push(text.length);
  return breaks.slice(1).flatMap((end, at) => ruleLines(text.slice(breaks[at] + 1, end)));
}

const unescapePipes = (cell) => cell.replaceAll(String.raw`\|`, '|');
const escapePipes = (cell) => cell.replaceAll('|', String.raw`\|`);

/** The `[start, end)` line range of the body under heading `text`, or null when absent. */
function sectionRange(markdown, text, level) {
  const all = headings(markdown);
  const at = all.findIndex((heading) => heading.text === text && heading.level === level);
  if (at === -1) return null;
  const next = all.slice(at + 1).find((heading) => heading.level <= level);
  const end = next ? next.index : markdown.split('\n').length;
  return { start: all[at].index + 1, end };
}

/** The body rows of the table under `### <section>`, as raw lines. */
function tableRows(markdown, section) {
  const range = sectionRange(markdown, section, 3);
  if (!range) return null;
  const lines = markdown.split('\n').slice(range.start, range.end);
  return lines.filter((line) => isTableRow(line)).slice(2);
}

/** The 1-based positions `1..count`. */
const leading = (count) => Array.from({ length: count }, (_, at) => at + 1);

/** Whether `order` is a non-empty ascending list of 1-based indices into `total` sentences. */
const ascendingWithin = (order, total) =>
  order.length > 0 &&
  order.every(
    (index, at) => Number.isInteger(index) && index > (order[at - 1] ?? 0) && index <= total
  );

/** One table row split into its entry and notes parts, with `\|` unescaped. */
function splitTableRow(row, sentences = 1) {
  const [term, definition, mapping, spec] = splitRow(row).map(unescapePipes);
  const heading = term.replace(/^\*\*(.*)\*\*$/u, '$1');
  const lines = sentenceLines(definition);
  const shown = Array.isArray(sentences) ? sentences : leading(sentences);
  if (Array.isArray(sentences) && !ascendingWithin(sentences, lines.length)) {
    throw new Error(`"${heading}" names no ascending indices of its ${lines.length} sentences`);
  }
  return {
    heading,
    definition: lines.filter((_, at) => shown.includes(at + 1)),
    rest: lines.filter((_, at) => !shown.includes(at + 1)),
    mapping: sentenceLines(`${MAPPING} ${mapping}`.trimEnd()),
    spec: sentenceLines(`${SPEC} ${spec}`.trimEnd()),
  };
}

/** A paragraph's cell text with its label stripped. */
const cellOf = (lines, label) => lines.join(' ').slice(label.length).replace(/^ /u, '');

/**
 * The table row an entry and its notes section rebuild to, `|` re-escaped: the entry's sentences
 * sit at the `order` indices when it names them, and lead the notes' otherwise.
 */
function rebuildRow(entry, notes, order) {
  const shown = Array.isArray(order) ? order : leading(entry.definition.length);
  const [picked, rest] = [[...entry.definition], [...notes.rest]];
  const definition = Array.from({ length: picked.length + rest.length }, (_, at) =>
    shown.includes(at + 1) ? picked.shift() : rest.shift()
  );
  const cells = [
    `**${entry.heading}**`,
    definition.join(' '),
    cellOf(notes.mapping, MAPPING),
    cellOf(notes.spec, SPEC),
  ].map(escapePipes);
  return `| ${cells.join(' | ')} |`;
}

/** The notes file text for `title` and its sections, in the one canonical layout. */
function serializeNotes(title, sections) {
  const blocks = sections.map(({ heading, rest, mapping, spec }) =>
    [`## ${heading}`, rest.join('\n'), mapping.join('\n'), spec.join('\n')]
      .filter(Boolean)
      .join('\n\n')
  );
  const text = [`# ${title}`, ...blocks].join('\n\n');
  return `${text}\n`;
}

/** A notes file's `##` sections, and its non-blank lines before the first as `{ index, line }`. */
function parseNotes(text) {
  const preamble = [];
  const sections = [];
  let paragraph = 'rest';
  for (const [index, line] of text.split('\n').entries()) {
    const heading = /^## (.+)$/u.exec(line);
    if (heading) {
      sections.push({ heading: heading[1], rest: [], mapping: [], spec: [] });
      paragraph = 'rest';
    } else if (line !== '' && sections.length === 0) {
      preamble.push({ index, line });
    } else if (line !== '') {
      if (line.startsWith(MAPPING)) paragraph = 'mapping';
      if (line.startsWith(SPEC)) paragraph = 'spec';
      sections.at(-1)[paragraph].push(line);
    }
  }
  return { preamble, sections };
}

/** One `####` entry's parts, with a `problem` naming how its shape is wrong, if it is. */
function parseEntry(lines, heading, section) {
  const body = lines.slice(heading.index + 1);
  const definition = [];
  let at = 1;
  while (at < body.length && body[at] !== '') definition.push(body[at++]);
  const link = LINK_LINE.exec(body[at + 1] ?? '');
  const shaped = link && body[0] === '' && body.slice(at + 2).every((line) => line === '');
  return {
    section,
    heading: heading.text,
    definition,
    link: link ? { file: link[1], anchor: link[2] } : null,
    line: heading.index,
    lastLine: heading.index + at + 2,
    problem: shaped ? null : `the entry "${heading.text}" is not heading, definition, link line`,
  };
}

/** The `####` entries under each glossary section of `DOMAIN.md`, in document order. */
function parseEntries(domain) {
  const lines = domain.split('\n');
  return Object.keys(SECTION_FILES).flatMap((section) => {
    const range = sectionRange(domain, section, 3);
    if (!range) return [];
    const inside = headings(domain).filter(
      ({ index, level }) => level === 4 && index >= range.start && index < range.end
    );
    return inside.map((heading, at) => {
      const end = inside[at + 1]?.index ?? range.end;
      return parseEntry(lines.slice(0, end), heading, section);
    });
  });
}

/**
 * The rebuilt table row for glossary `term`, or null when it has no entry and notes section.
 * `overrides` defaults to the `DEFINITION_SENTENCES` of the entry's section.
 */
export function termRowText(term, { domain, readNote, overrides }) {
  const entry = parseEntries(domain).find((candidate) => candidate.heading === term);
  const notes = entry?.link && readNote(entry.link.file);
  const section = notes && parseNotes(notes).sections.find(({ heading }) => heading === term);
  if (!section) return null;
  return rebuildRow(entry, section, (overrides ?? DEFINITION_SENTENCES[entry.section])?.[term]);
}

/** Code spans removed, so markup inside them is not counted as markup. */
const withoutCode = (line) => line.replaceAll(/(`+)[^`]*?\1/gu, '');
const count = (text, token) => text.split(token).length - 1;

/** Why a definition is not 1–3 complete sentences with balanced inline markup, if it is not. */
function definitionProblems({ heading, definition }) {
  const problems = [];
  if (definition.length === 0 || definition.length > 3) problems.push('is not 1–3 lines');
  if (definition.some((line) => !endsSentence(line))) {
    problems.push('has a line ending mid-sentence');
  }
  const bare = definition.map(withoutCode).join(' ');
  if (count(bare, '**') % 2 !== 0) problems.push('has unbalanced `**`');
  if (count(bare, '(') !== count(bare, ')')) problems.push('has unbalanced parentheses');
  if (count(definition.join(' '), '`') % 2 !== 0) problems.push('has unbalanced backticks');
  return problems.map((problem) => `the definition of "${heading}" ${problem}`);
}

/** The first index where two lists differ, or -1 when they are equal. */
function firstMismatch(left, right) {
  let at = 0;
  while (at < Math.max(left.length, right.length) && left[at] === right[at]) at += 1;
  return at < Math.max(left.length, right.length) ? at : -1;
}

/** Why a section's entries and its notes file do not map one to one, if they do not. */
function pairingProblems(section, entries, readNote) {
  const file = SECTION_FILES[section];
  const text = readNote(file);
  if (text === null) return [`${file} is missing`];
  const { preamble, sections } = parseNotes(text);
  const notes = sections.map(({ heading }) => heading);
  const terms = entries.map(({ heading }) => heading);
  const anchors = dedupedSlugs([section, ...terms]).slice(1);
  const problems = preamble
    .filter(({ index, line }) => index !== 0 || line !== `# ${section}`)
    .map(({ index }) => `${file} line ${index + 1} sits outside any section`);
  const at = firstMismatch(notes, terms);
  if (at !== -1) {
    problems.push(`${file} section ${at + 1} is "${notes[at]}" where the entry is "${terms[at]}"`);
  }
  for (const [index, { heading, link }] of entries.entries()) {
    if (link && (link.file !== file || link.anchor !== anchors[index])) {
      problems.push(`the link line of "${heading}" must be ${file}#${anchors[index]}`);
    }
  }
  return problems;
}

/** Why a `docs/domain/` link does not resolve to a file and one of its headings, if it does not. */
function linkProblems(domain, readNote) {
  const problems = [];
  for (const [, file, anchor] of domain.matchAll(DOMAIN_LINK)) {
    const text = readNote(file);
    if (text === null) problems.push(`${file} does not exist`);
    else if (anchor !== undefined && !headingSlugs(text).includes(anchor)) {
      problems.push(`${file}#${anchor} names no heading`);
    }
  }
  return problems;
}

/** The pointer lines under each of `POINTER_HEADINGS`, as `{ heading, index, links }`. */
function pointers(domain) {
  const lines = domain.split('\n');
  return POINTER_HEADINGS.flatMap((heading) => {
    const range = [2, 3].map((level) => sectionRange(domain, heading, level)).find(Boolean);
    if (!range) return [];
    return lines
      .map((line, index) => ({ heading, index, links: [...line.matchAll(DOMAIN_LINK)] }))
      .filter(({ index, links }) => index >= range.start && index < range.end && links.length > 0);
  });
}

/** Why the pointers are not one per required heading, one link each, and nowhere else. */
function pointerProblems(domain, required) {
  const found = pointers(domain);
  const problems = POINTER_HEADINGS.flatMap((heading) => {
    const own = found.filter((pointer) => pointer.heading === heading).length;
    const wanted = required.includes(heading) ? 'exactly one' : 'at most one';
    const fits = own === 1 || (own === 0 && wanted === 'at most one');
    return fits ? [] : [`"${heading}" carries ${own} pointers, not ${wanted}`];
  });
  for (const { heading, links } of found) {
    if (links.length !== 1) {
      problems.push(`a pointer under "${heading}" carries ${links.length} links`);
    }
  }
  const placed = new Set(found.map(({ index }) => index));
  for (const [index, line] of domain.split('\n').entries()) {
    if (line.includes('](docs/domain/') && !LINK_LINE.test(line) && !placed.has(index)) {
      problems.push(`line ${index + 1} links into docs/domain/ outside any pointer heading`);
    }
  }
  return problems;
}

/** Every way `DOMAIN.md` and its notes break the glossary contract; `[]` when they do not. */
export function glossaryProblems({ domain, readNote, floors = {}, pointerHeadings = [] }) {
  const entries = parseEntries(domain);
  const problems = entries.flatMap((entry) => [
    ...(entry.problem ? [entry.problem] : []),
    ...definitionProblems(entry),
  ]);
  for (const section of Object.keys(SECTION_FILES)) {
    const own = entries.filter((entry) => entry.section === section);
    if (own.length > 0) problems.push(...pairingProblems(section, own, readNote));
  }
  const linkLines = domain.split('\n').filter((line) => LINK_LINE.test(line)).length;
  if (linkLines !== entries.length) {
    problems.push(`${linkLines} link lines for ${entries.length} entries`);
  }
  for (const [file, floor] of Object.entries(floors)) {
    const linked = entries.filter(({ section }) => SECTION_FILES[section] === file).length;
    if (linked < floor) problems.push(`${file} has ${linked} entries, under its floor of ${floor}`);
  }
  return [
    ...problems,
    ...linkProblems(domain, readNote),
    ...pointerProblems(domain, pointerHeadings),
  ];
}

/**
 * `domain` with the table under `### <section>` turned into entries, plus that section's notes;
 * `overrides` maps a term to its `DEFINITION_SENTENCES` value.
 */
export function convertSection(domain, section, overrides = {}) {
  const file = SECTION_FILES[section];
  const rows = file ? tableRows(domain, section) : null;
  if (!rows || rows.length === 0) throw new Error(`no glossary table under "${section}"`);
  const terms = rows.map((row) => splitTableRow(row).heading);
  const unknown = Object.keys(overrides).filter((term) => !terms.includes(term));
  if (unknown.length > 0) throw new Error(`overrides name no row under "${section}": ${unknown}`);
  const split = rows.map((row, at) => splitTableRow(row, overrides[terms[at]] ?? 1));
  const anchors = dedupedSlugs([section, ...terms]).slice(1);
  const entries = split.map(({ heading, definition }, at) =>
    [`#### ${heading}`, '', ...definition, '', `[Notes](${file}#${anchors[at]})`].join('\n')
  );
  const lines = domain.split('\n');
  const start = lines.indexOf(TABLE_OPEN[0], sectionRange(domain, section, 3).start);
  const end = lines.indexOf(TABLE_CLOSE[1], start);
  const converted = lines.toSpliced(start, end - start + 1, entries.join('\n\n')).join('\n');
  return { domain: converted, file, notes: serializeNotes(section, split) };
}

/** The 1-based number of the first line where two texts differ. */
const firstDifference = (actual, expected) =>
  firstMismatch(actual.split('\n'), expected.split('\n')) + 1;

/** Each pointer's replacement block, and the notes lines each block consumes by file. */
function pointerBlocks(domain, notes) {
  const swaps = new Map();
  const used = new Map();
  const problems = [];
  for (const { index, links } of pointers(domain)) {
    const [, file, anchor] = links[0];
    const text = notes[file];
    const all = text ? headings(text) : [];
    const target = text && all[headingSlugs(text).indexOf(anchor)];
    if (!target) {
      problems.push(`the pointer on line ${index + 1} resolves to no moved block`);
      continue;
    }
    const lines = text.split('\n');
    const next = all.find((h) => h.index > target.index && h.level <= target.level);
    const end = next ? next.index : lines.length;
    const block = lines.slice(target.index + 1, end);
    while (block[0] === '') block.shift();
    while (block.at(-1) === '') block.pop();
    swaps.set(index, block);
    const marks = used.get(file) ?? new Set();
    for (let line = target.index; line < end; line += 1) marks.add(line);
    used.set(file, marks);
  }
  return { swaps, used, problems };
}

/** Why a moved-block file carries a line no pointer consumed, other than its title. */
function unconsumedLines(path, text, marks) {
  return text
    .split('\n')
    .map((line, at) => ({ line, at }))
    .filter(({ line, at }) => line !== '' && !(at === 0 && line.startsWith('# ')) && !marks.has(at))
    .map(({ at }) => `${path} line ${at + 1} is left over`);
}

/** Why each `docs/domain/` file is not wholly consumed by the reconstruction or unchanged. */
function leftoverProblems({ notes, baseNotes, file, section, sections, used }) {
  return Object.entries(notes).flatMap(([path, text]) => {
    if (path === file) {
      const canonical = serializeNotes(section, sections);
      if (text === canonical) return [];
      return [`${path} line ${firstDifference(text, canonical)} is left over`];
    }
    if (used.has(path)) return unconsumedLines(path, text, used.get(path));
    return text === baseNotes[path] ? [] : [`${path} changed but no reconstruction consumes it`];
  });
}

/** Every line lifted out of a table cell that opens a block construct. */
function blockStartProblems(entries, sections) {
  const lifted = [
    ...entries.flatMap(({ definition }) => definition),
    ...sections.flatMap(({ rest, mapping, spec }) => [
      ...rest,
      ...mapping.slice(1),
      ...spec.slice(1),
    ]),
  ];
  return lifted
    .filter((line) => BLOCK_START.test(line))
    .map((line) => `a line lifted from a cell opens a block: ${line.slice(0, 60)}`);
}

/** The whole-document reconstruction of the base from the converted `domain` and its notes. */
function reconstruct({ domain, entries, rows, swaps, reversePairs }) {
  const replaced = new Map(swaps);
  if (entries.length > 0) {
    replaced.set(entries[0].line, [...TABLE_OPEN, ...rows, ...TABLE_CLOSE]);
    for (let line = entries[0].line + 1; line <= entries.at(-1).lastLine; line += 1) {
      replaced.set(line, []);
    }
  }
  let text = domain
    .split('\n')
    .flatMap((line, index) => replaced.get(index) ?? [line])
    .join('\n');
  const problems = [];
  for (const { current, base } of reversePairs) {
    const found = count(text, current);
    if (found === 1) text = text.replace(current, () => base);
    else problems.push(`a reverse pair matches ${found} times: ${current.slice(0, 60)}`);
  }
  return { text, problems };
}

/**
 * Proves `domain` and `notes` rebuild `base` byte for byte, from the working files alone.
 * `notes` and `baseNotes` map `docs/domain/*.md` paths to text; each `reversePairs` entry swaps a
 * `current` string, which must occur once, back to its `base` text. `overrides` is as for
 * `convertSection`.
 */
export function verifyConversion({
  base,
  domain,
  notes,
  baseNotes = {},
  section,
  reversePairs,
  overrides = {},
}) {
  const file = SECTION_FILES[section];
  const baseRows = file ? tableRows(base, section) : null;
  if (!baseRows || baseRows.length === 0 || !sectionRange(domain, section, 3)) {
    const problems = [`"${section}" is no glossary section with base rows`];
    return { problems, rows: 0, rebuilt: 0 };
  }
  const entries = parseEntries(domain).filter((entry) => entry.section === section);
  const { sections } = parseNotes(notes[file] ?? '');
  const size = baseRows.length;
  const problems = [
    [entries.length, 'entries'],
    [entries.filter(({ link }) => link).length, 'link lines'],
    [sections.length, 'notes sections'],
  ]
    .filter(([found]) => found !== size)
    .map(([found, what]) => `${found} ${what} for ${size} base rows`);
  const rows = entries.map((entry, at) =>
    sections[at]?.heading === entry.heading
      ? rebuildRow(entry, sections[at], overrides[entry.heading])
      : ''
  );
  const { swaps, used, problems: unresolved } = pointerBlocks(domain, notes);
  const rebuilt = reconstruct({ domain, entries, rows, swaps, reversePairs: reversePairs ?? [] });
  if (rebuilt.text !== base) {
    const line = firstDifference(rebuilt.text, base);
    problems.push(`the reconstruction differs from the base at line ${line}`);
  }
  problems.push(
    ...entries.flatMap(({ problem }) => (problem ? [problem] : [])),
    ...unresolved,
    ...rebuilt.problems,
    ...leftoverProblems({ notes, baseNotes, file, section, sections, used }),
    ...blockStartProblems(entries, sections)
  );
  const matching = rows.filter((row, at) => row === baseRows[at]).length;
  return { problems, rows: size, rebuilt: matching };
}
