/** `DOMAIN.md` glossary entries, their `docs/domain/` notes, and the one-shot conversion proof. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  convertSection,
  glossaryProblems,
  headingSlugs,
  sentenceLines,
  slugify,
  termRowText,
  verifyConversion,
} from '../scripts/lib/domainGlossary.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS = 'docs/domain/records.md';
const HISTORY = 'docs/domain/history.md';
const SECTION = 'Aggregates and Records';
const TERMS = 'Acquisition, Knowledge, and Resolution Terms';

/** Minimum entries per notes file, so a gate over an emptied glossary cannot pass. */
const FLOORS = { [RECORDS]: 50, 'docs/domain/terms.md': 130 };
const TOTAL_FLOOR = 150;

/** The headings whose moved body leaves exactly one pointer into `docs/domain/`. */
const POINTER_HEADINGS = [
  'Current Realm Resolution (Phase 1 shipped)',
  'Remaining Drift to Track',
  'Research Notes',
];

const readRepoNote = (file) => {
  const absolute = path.join(ROOT, file);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : null;
};

/** `text` with `from` replaced by `to`, failing if the edit would change nothing. */
function edit(text, from, to) {
  assert.ok(text.includes(from), `the fixture carries ${JSON.stringify(from)}`);
  const changed = text.replace(from, () => to);
  assert.notEqual(changed, text, 'the edit changed the fixture');
  return changed;
}

const table = (rows) =>
  [
    '<!-- markdownlint-disable markdownlint-sentences-per-line -->',
    '',
    '| Term | Definition | Canonical Mapping | Spec Reference |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    '<!-- markdownlint-enable markdownlint-sentences-per-line -->',
  ].join('\n');

const scaffold = (glossary) =>
  `# Domain\n\n## Ubiquitous Language\n\n### ${SECTION}\n\n${glossary}\n\n` +
  '### Acquisition, Knowledge, and Resolution Terms\n\nKept prose.\n\n' +
  '## Remaining Drift to Track\n\nDrift line one.\nDrift line two.\n\n## Open Questions\n\nNone.\n';

const document = (rows) => scaffold(table(rows));

const ALPHA_ROW =
  '| **Alpha Record** | The first record. It keeps `a \\| b` apart. A second note line. | `Alpha` | spec/a.md |';
const BASE = document([
  ALPHA_ROW,
  '| **Beta** | The second record. **Bold opener** follows. | `Beta`. Mapped twice. | spec/b.md |',
]);

/** What converting `BASE` writes, spelled out so the gate fixtures outlive the converter. */
const domain = scaffold(
  [
    '#### Alpha Record',
    '',
    'The first record.',
    '',
    '[Notes](docs/domain/records.md#alpha-record)',
    '',
    '#### Beta',
    '',
    'The second record.',
    '',
    '[Notes](docs/domain/records.md#beta)',
  ].join('\n')
);
const notes = [
  `# ${SECTION}`,
  '',
  '## Alpha Record',
  '',
  'It keeps `a | b` apart.',
  'A second note line.',
  '',
  'Canonical mapping: `Alpha`',
  '',
  'Spec reference: spec/a.md',
  '',
  '## Beta',
  '',
  '**Bold opener** follows.',
  '',
  'Canonical mapping: `Beta`.',
  'Mapped twice.',
  '',
  'Spec reference: spec/b.md',
  '',
].join('\n');

const notesOf = (text) => ({ [RECORDS]: text });
const readerOf = (files) => (file) => files[file] ?? null;
const gate = (text, files = notesOf(notes), options = {}) =>
  glossaryProblems({ domain: text, readNote: readerOf(files), floors: { [RECORDS]: 2 }, ...options });
const verify = (overrides = {}) =>
  verifyConversion({ base: BASE, domain, notes: notesOf(notes), section: SECTION, ...overrides });

/** Asserts `problems` holds one naming `reason`. */
function assertReports(problems, reason) {
  assert.ok(
    problems.some((problem) => problem.includes(reason)),
    `expected a problem naming ${JSON.stringify(reason)}, got ${JSON.stringify(problems)}`
  );
}

describe('the real glossary', () => {
  it('meets the entry contract with its notes', () => {
    const real = readFileSync(path.join(ROOT, 'DOMAIN.md'), 'utf8');
    const options = { floors: FLOORS, totalFloor: TOTAL_FLOOR, pointerHeadings: POINTER_HEADINGS };
    assert.deepEqual(glossaryProblems({ domain: real, readNote: readRepoNote, ...options }), []);
  });
});

describe('heading slugs follow the GitHub algorithm', () => {
  const pinned = {
    'Phantom-Run `resolved`': 'phantom-run-resolved',
    'Inventory Card / System Participation': 'inventory-card--system-participation',
    'Legacy Result-Selection Provider Removal (`1.6.0`)': 'legacy-result-selection-provider-removal-160',
    'Depleted Behavior (task/node config; node-driven marker swap)':
      'depleted-behavior-tasknode-config-node-driven-marker-swap',
    'Ingredient Assignment Cost (`searchStats`)': 'ingredient-assignment-cost-searchstats',
    'D&D 5e 2024 Crafting': 'dd-5e-2024-crafting',
  };
  for (const [heading, slug] of Object.entries(pinned)) {
    it(heading, () => assert.equal(slugify(heading), slug));
  }
  it('a repeated heading takes a numbered suffix, and a fenced one is no heading', () => {
    assert.deepEqual(headingSlugs('## Foo\n\n```\n## Foo\n```\n\n## Foo\n'), ['foo', 'foo-1']);
  });
});

describe('sentence splitting', () => {
  it('splits before a bold, emphasis or code opener, never inside code or after e.g.', () => {
    assert.deepEqual(sentenceLines('One. **Two** here. _Three_ too. `four` last.'), [
      'One.',
      '**Two** here.',
      '_Three_ too.',
      '`four` last.',
    ]);
    assert.deepEqual(sentenceLines('Keep `a. B` whole, e.g. This stays.'), [
      'Keep `a. B` whole, e.g. This stays.',
    ]);
  });
});

describe('the conversion', () => {
  it('writes exactly the entries and notes the gate fixtures use', () => {
    assert.deepEqual(convertSection(BASE, SECTION), { domain, file: RECORDS, notes });
    assert.deepEqual(gate(domain), []);
  });

  it('takes an override count of leading sentences, and throws on an override naming no row', () => {
    const two = convertSection(BASE, SECTION, { Beta: 2 });
    assert.match(two.domain, /^The second record\.\n\*\*Bold opener\*\* follows\.$/mu);
    assert.throws(() => convertSection(BASE, SECTION, { Gamma: 2 }), /Gamma/u);
  });

  it('takes ascending sentence indices, which rebuild the base row only when named', () => {
    const overrides = { 'Alpha Record': [1, 3] };
    const picked = convertSection(BASE, SECTION, overrides);
    assert.match(picked.domain, /^The first record\.\nA second note line\.\n\n\[Notes\]/mu);
    assert.match(picked.notes, /^## Alpha Record\n\nIt keeps `a \| b` apart\.\n\nCanonical/mu);
    const files = notesOf(picked.notes);
    const proof = (extra) =>
      verifyConversion({ base: BASE, domain: picked.domain, notes: files, section: SECTION, ...extra });
    assert.deepEqual(proof({ overrides: { [SECTION]: overrides } }), {
      problems: [],
      rows: 2,
      rebuilt: 2,
    });
    assertReports(proof({}).problems, 'differs from the base');
    const reader = { domain: picked.domain, readNote: readerOf(files), overrides };
    assert.equal(termRowText('Alpha Record', reader), ALPHA_ROW);
  });

  it('throws on indices that are not ascending sentences of their row', () => {
    assert.throws(() => convertSection(BASE, SECTION, { Beta: [2, 1] }), /Beta/u);
    assert.throws(() => convertSection(BASE, SECTION, { Beta: [3] }), /Beta/u);
  });
});

describe('the gate fails in every direction it claims', () => {
  const definition = (to) => gate(edit(domain, 'The second record.\n', to));
  const betaNotes = () => /## Beta[\s\S]*$/u.exec(notes)[0];
  const cases = [
    ['an entry with no notes section', 'where the entry is "Beta"', () =>
      gate(domain, notesOf(edit(notes, betaNotes(), '')))],
    ['a notes section with no entry', 'is "Gamma" where', () =>
      gate(domain, notesOf(`${notes}\n## Gamma\n\nCanonical mapping: g\n\nSpec reference: s\n`))],
    ['a notes line before the first section', 'line 3 sits outside any section', () =>
      gate(domain, notesOf(edit(notes, `# ${SECTION}\n\n`, `# ${SECTION}\n\nA stray line.\n\n`)))],
    ['a missing notes file', 'is missing', () => gate(domain, {})],
    ['a link line into another file', 'link line of "Beta" must be', () =>
      gate(edit(domain, 'records.md#beta', 'terms.md#beta'))],
    ['a link line whose anchor is not its own heading', 'link line of "Beta" must be', () =>
      gate(edit(domain, 'records.md#beta)', 'records.md#alpha-record)'))],
    ['an entry that is not heading, definition, link line', 'not heading, definition, link', () =>
      gate(edit(domain, '#### Beta\n\n', '#### Beta\n'))],
    ['a definition over three lines', 'is not 1–3 lines', () =>
      definition('One.\nTwo.\nThree.\nFour.\n')],
    ['a definition line ending mid-sentence', 'ending mid-sentence', () =>
      definition('The second record\n')],
    ['unbalanced bold', 'unbalanced `**`', () => definition('The **second record.\n')],
    ['unbalanced parentheses', 'unbalanced parentheses', () => definition('The (second record.\n')],
    ['unbalanced backticks', 'unbalanced backticks', () => definition('The `second record.\n')],
    ['more link lines than entries', '3 link lines for 2 entries', () =>
      gate(edit(domain, 'Kept prose.', 'Kept prose.\n\n[Notes](docs/domain/records.md#beta)'))],
    ['a docs/domain link outside any pointer heading', 'outside any pointer heading', () =>
      gate(edit(domain, 'Kept prose.', 'Kept [prose](docs/domain/records.md#beta).'))],
    ['a required pointer that is missing', '0 pointers, not exactly one', () =>
      gate(domain, undefined, { pointerHeadings: ['Remaining Drift to Track'] })],
    ['a pointer carrying two links', 'carries 2 links', () =>
      gate(edit(domain, 'Drift line one.', '[a](docs/domain/records.md) [b](docs/domain/records.md)'))],
    ['a pointer that resolves to no file', 'history.md does not exist', () =>
      gate(edit(domain, 'Drift line one.', 'Moved to [history](docs/domain/history.md#drift).'))],
    ['a link whose anchor names no heading', 'records.md#nowhere names no heading', () =>
      gate(edit(domain, 'Drift line one.', 'Moved to [notes](docs/domain/records.md#nowhere).'))],
    ['an entry count under its floor', 'under its floor of 3', () =>
      glossaryProblems({ domain, readNote: readerOf(notesOf(notes)), floors: { [RECORDS]: 3 } })],
    ['a total entry count under its floor', '2 entries in all, under the floor of 3', () =>
      glossaryProblems({ domain, readNote: readerOf(notesOf(notes)), totalFloor: 3 })],
  ];
  for (const [name, reason, run] of cases) {
    it(name, () => assertReports(run(), reason));
  }
});

describe('the conversion proof', () => {
  it('rebuilds every row and the whole base document', () => {
    assert.deepEqual(verify(), { problems: [], rows: 2, rebuilt: 2 });
  });

  it('reverses each enumerated edit, and fails on a pair that does not match once', () => {
    const retargeted = edit(domain, 'Kept prose.', 'Kept prose, retargeted.');
    const pair = { current: 'Kept prose, retargeted.', base: 'Kept prose.' };
    assert.deepEqual(verify({ domain: retargeted, reversePairs: [pair] }).problems, []);
    assertReports(verify({ domain: retargeted }).problems, 'differs from the base');
    assertReports(verify({ reversePairs: [pair] }).problems, 'matches 0 times');
  });

  it('counts a row whose notes carry a reversed edit as rebuilt', () => {
    const retargeted = edit(notes, 'A second note line.', 'A retargeted note line.');
    const pair = { current: 'A retargeted note line.', base: 'A second note line.' };
    const result = verify({ notes: notesOf(retargeted), reversePairs: [pair] });
    assert.deepEqual(result, { problems: [], rows: 2, rebuilt: 2 });
  });

  const history = '# History\n\n## Remaining Drift to Track\n\nDrift line one.\nDrift line two.\n';
  const pointed = () =>
    edit(
      domain,
      'Drift line one.\nDrift line two.',
      'Moved to [history](docs/domain/history.md#remaining-drift-to-track).'
    );
  const withHistory = (text) =>
    verify({ domain: pointed(), notes: { ...notesOf(notes), [HISTORY]: text } });

  it('rebuilds every converted section while proving a later one', () => {
    const gamma = '| **Gamma** | The third term. It follows. | `Gamma` | spec/g.md |';
    const both = edit(BASE, 'Kept prose.', table([gamma]));
    const records = convertSection(both, SECTION);
    const terms = convertSection(records.domain, TERMS);
    const files = { [RECORDS]: records.notes, [terms.file]: terms.notes };
    const proof = (extra) =>
      verifyConversion({ base: both, domain: terms.domain, notes: files, section: TERMS, ...extra });
    assert.deepEqual(proof(), { problems: [], rows: 1, rebuilt: 1 });
    const edited = { ...files, [RECORDS]: edit(records.notes, 'second note', 'secOnd note') };
    assertReports(proof({ notes: edited }).problems, 'differs from the base');
  });

  it('swaps a pointer back for its moved block', () => {
    assert.deepEqual(withHistory(history).problems, []);
  });

  const failures = [
    ['a one-byte notes edit', 'differs from the base', () =>
      verify({ notes: notesOf(edit(notes, 'second note', 'secOnd note')) })],
    ['a dropped entry', '1 entries for 2 base rows', () =>
      verify({ domain: edit(domain, /\n\n#### Beta[^#]*#beta\)/u.exec(domain)[0], '') })],
    ['a stray line after an entry', 'not heading, definition, link line', () =>
      verify({ domain: edit(domain, '#alpha-record)', '#alpha-record)\nStray.') })],
    ['a zero-row section', 'no glossary section with base rows', () =>
      verify({ base: document([]) })],
    ['a section that names no heading', 'no glossary section with base rows', () =>
      verify({ section: 'No Such Section' })],
    ['a reordered notes line', 'differs from the base', () =>
      verify({
        notes: notesOf(
          edit(notes, 'It keeps `a | b` apart.\nA second note line.', 'A second note line.\nIt keeps `a | b` apart.')
        ),
      })],
    ['a reordered moved line', 'differs from the base', () =>
      withHistory(edit(history, 'one.\nDrift line two.', 'two.\nDrift line one.'))],
    ['an added stray notes line', `${RECORDS} line 3 is left over`, () =>
      verify({ notes: notesOf(edit(notes, `# ${SECTION}\n\n`, `# ${SECTION}\n\nA stray line.\n\n`)) })],
    ['an added stray moved-file line', `${HISTORY} line 8 is left over`, () =>
      withHistory(`${history}\n# Stray\n`)],
    ['a changed notes file nothing consumes', 'no reconstruction consumes it', () =>
      verify({ notes: { ...notesOf(notes), 'docs/domain/terms.md': 'Stray.\n' } })],
  ];
  for (const [name, reason, run] of failures) {
    it(`fails on ${name}`, () => assertReports(run().problems, reason));
  }

  it('fails on a notes line opening a block construct, though it rebuilds exactly', () => {
    const base = document(['| **Gamma** | The third record. ```raw``` spans three ticks. | g | s |']);
    const fenced = convertSection(base, SECTION);
    assert.match(fenced.notes, /^```raw``` spans three ticks\.$/mu);
    const result = verifyConversion({
      base,
      domain: fenced.domain,
      notes: notesOf(fenced.notes),
      section: SECTION,
    });
    assert.equal(result.rebuilt, 1, 'the row still rebuilds byte for byte');
    assertReports(result.problems, 'opens a block');
  });
});
