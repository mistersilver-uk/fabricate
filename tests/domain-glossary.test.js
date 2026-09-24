/** `DOMAIN.md` glossary entries, their `docs/domain/` notes, and the rows they rebuild. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  glossaryProblems,
  headingSlugs,
  sentenceLines,
  slugify,
  termRowText,
} from '../scripts/lib/domainGlossary.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RECORDS = 'docs/domain/records.md';
const SECTION = 'Aggregates and Records';

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

const scaffold = (glossary) =>
  `# Domain\n\n## Ubiquitous Language\n\n### ${SECTION}\n\n${glossary}\n\n` +
  '### Acquisition, Knowledge, and Resolution Terms\n\nKept prose.\n\n' +
  '## Remaining Drift to Track\n\nDrift line one.\nDrift line two.\n\n## Open Questions\n\nNone.\n';

const ALPHA_ROW =
  '| **Alpha Record** | The first record. It keeps `a \\| b` apart. A second note line. | `Alpha` | spec/a.md |';
const BETA_ROW =
  '| **Beta** | The second record. **Bold opener** follows. | `Beta`. Mapped twice. | spec/b.md |';

/** A converted glossary of two entries, and the notes they link to. */
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

describe('a rebuilt row', () => {
  const reader = () => ({ domain, readNote: readerOf(notesOf(notes)) });

  it('joins an entry and its notes back into the row, `|` re-escaped', () => {
    assert.equal(termRowText('Alpha Record', reader()), ALPHA_ROW);
    assert.equal(termRowText('Beta', reader()), BETA_ROW);
  });

  it('puts named sentence indices back in place, and only when they are named', () => {
    const picked = {
      domain: edit(domain, 'The first record.\n', 'The first record.\nA second note line.\n'),
      readNote: readerOf(notesOf(edit(notes, 'apart.\nA second note line.\n', 'apart.\n'))),
    };
    const overrides = { 'Alpha Record': [1, 3] };
    assert.equal(termRowText('Alpha Record', { ...picked, overrides }), ALPHA_ROW);
    assert.notEqual(termRowText('Alpha Record', picked), ALPHA_ROW);
  });

  it('is null for a term with no entry, or no notes section', () => {
    assert.equal(termRowText('Gamma', reader()), null);
    const betaless = edit(notes, /## Beta[\s\S]*$/u.exec(notes)[0], '');
    assert.equal(termRowText('Beta', { domain, readNote: readerOf(notesOf(betaless)) }), null);
  });
});
