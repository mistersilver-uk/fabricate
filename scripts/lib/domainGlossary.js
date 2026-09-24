/** `DOMAIN.md` glossary entries, their notes under `docs/domain/`, and the gate over both. */
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
  'Acquisition, Knowledge, and Resolution Terms': {
    Harvesting: 3,
    'Choice Group': 3,
    'Contention Component': 2,
    'Tier Stepping': 2,
    'Section Inheritance': [1, 6],
    'Provider (vocabulary boundary)': 2,
    'Depleted Behavior (task/node config; node-driven marker swap)': 2,
    'Gathering Event': 2,
    Inert: 2,
  },
};

/** The headings whose moved body is replaced by a one-line pointer into `docs/domain/`. */
const POINTER_HEADINGS = [
  'Remaining Drift to Track',
  'Research Notes',
  'Current Realm Resolution (Phase 1 shipped)',
];

const MAPPING = 'Canonical mapping:';
const SPEC = 'Spec reference:';
const LINK_LINE = /^\[Notes\]\((docs\/domain\/[\w-]+\.md)#([^)\s]+)\)$/u;
const DOMAIN_LINK = /\]\((docs\/domain\/[\w-]+\.md)(?:#([^)\s]*))?\)/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;
const ATX = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/u;

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

/** The 1-based positions `1..count`. */
const leading = (count) => Array.from({ length: count }, (_, at) => at + 1);

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

/** Why the entries fall under a per-file floor or under `totalFloor` in all, if they do. */
function floorProblems(entries, floors, totalFloor) {
  const problems = Object.entries(floors).flatMap(([file, floor]) => {
    const linked = entries.filter(({ section }) => SECTION_FILES[section] === file).length;
    return linked < floor ? [`${file} has ${linked} entries, under its floor of ${floor}`] : [];
  });
  if (entries.length < totalFloor) {
    problems.push(`${entries.length} entries in all, under the floor of ${totalFloor}`);
  }
  return problems;
}

/** Every way `DOMAIN.md` and its notes break the glossary contract; `[]` when they do not. */
export function glossaryProblems({
  domain,
  readNote,
  floors = {},
  totalFloor = 0,
  pointerHeadings = [],
}) {
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
  return [
    ...problems,
    ...floorProblems(entries, floors, totalFloor),
    ...linkProblems(domain, readNote),
    ...pointerProblems(domain, pointerHeadings),
  ];
}
