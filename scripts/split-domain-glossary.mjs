#!/usr/bin/env node
/**
 * One-shot converter from a `DOMAIN.md` glossary table to per-term entries and notes.
 * `--section "<heading>"` converts one table in place; adding `--verify <base-dir>` instead proves,
 * from the working files alone, that they rebuild `<base-dir>/DOMAIN.md` byte for byte.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { convertSection, verifyConversion } from './lib/domainGlossary.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Leading-sentence counts for terms whose first sentence alone misstates or part-states them. */
const DEFINITION_SENTENCES = {
  'Aggregates and Records': {
    'Phantom-Run `resolved`': 2,
    'Inventory Card / System Participation': 2,
    'Result Order Asymmetry': 3,
    'Manager Navigation Surface / Provider Seam': 2,
    'Rail Marker Family': 2,
    'World Defaults': 2,
    'System Membership Record': 3,
    'World Identity Snapshot': 2,
  },
};

const SCOPE_SENTENCE =
  'The notes under `docs/domain/` that each entry below links to are part of this document.';

/** Every other edit to `DOMAIN.md`, as its text now and the base text it replaced. */
const REVERSE_PAIRS = [
  {
    current: `## Ubiquitous Language\n\n${SCOPE_SENTENCE}\n\n`,
    base: '## Ubiquitous Language\n\n',
  },
  {
    current: '`DOMAIN.md` (**Prepared Consumption**)',
    base: '`DOMAIN.md:51` (**Prepared Consumption**)',
  },
  { current: '`DOMAIN.md` (**Projection Tier**)', base: '`DOMAIN.md:161` (**Projection Tier**)' },
];

/** Every `docs/domain/*.md` under `root`, keyed by its repository-relative path. */
function readNotes(root) {
  const directory = path.join(root, 'docs', 'domain');
  if (!existsSync(directory)) return {};
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.md'))
      .map((name) => [`docs/domain/${name}`, readFileSync(path.join(directory, name), 'utf8')])
  );
}

function verify(section, baseDirectory) {
  const { problems, rows, rebuilt } = verifyConversion({
    base: readFileSync(path.join(baseDirectory, 'DOMAIN.md'), 'utf8'),
    domain: readFileSync(path.join(ROOT, 'DOMAIN.md'), 'utf8'),
    notes: readNotes(ROOT),
    baseNotes: readNotes(baseDirectory),
    section,
    reversePairs: REVERSE_PAIRS,
  });
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const dirty = git('status', '--porcelain', '--', 'DOMAIN.md', 'docs/domain') !== '';
  console.log(`verified ${git('rev-parse', 'HEAD')}${dirty ? ' plus uncommitted changes' : ''}`);
  console.log(`rows: ${rebuilt}/${rows} rebuilt`);
  for (const problem of problems) console.error(`FAIL ${problem}`);
  return problems.length === 0 && rows > 0 ? 0 : 1;
}

function convert(section) {
  const domainPath = path.join(ROOT, 'DOMAIN.md');
  const result = convertSection(
    readFileSync(domainPath, 'utf8'),
    section,
    DEFINITION_SENTENCES[section] ?? {}
  );
  writeFileSync(domainPath, result.domain);
  writeFileSync(path.join(ROOT, result.file), result.notes);
  console.log(`converted "${section}" into ${result.file}`);
  return 0;
}

const { values } = parseArgs({
  options: { section: { type: 'string' }, verify: { type: 'string' } },
});
if (!values.section) {
  console.error('usage: split-domain-glossary.mjs --section "<heading>" [--verify <base-dir>]');
  process.exit(2);
}
process.exit(values.verify ? verify(values.section, values.verify) : convert(values.section));
