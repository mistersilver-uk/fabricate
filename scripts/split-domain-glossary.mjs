#!/usr/bin/env node
/**
 * One-shot converter from a `DOMAIN.md` glossary table to per-term entries and notes.
 * `--section "<heading>"` converts one table in place; adding `--verify` instead proves, from the
 * working files alone, that they rebuild `DOMAIN.md` byte for byte as it stood at
 * `git merge-base HEAD origin/main`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { convertSection, DEFINITION_SENTENCES, verifyConversion } from './lib/domainGlossary.js';
import { resolveExecutable } from './lib/resolveExecutable.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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

/** The git executable, resolved once to an absolute path in an absolute `PATH` directory. */
const GIT_EXECUTABLE = resolveExecutable('git');

const git = (...args) => execFileSync(GIT_EXECUTABLE, args, { cwd: ROOT, encoding: 'utf8' });

/** Every working-tree `docs/domain/*.md`, keyed by its repository-relative path. */
function readNotes() {
  const directory = path.join(ROOT, 'docs', 'domain');
  if (!existsSync(directory)) return {};
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.md'))
      .map((name) => [`docs/domain/${name}`, readFileSync(path.join(directory, name), 'utf8')])
  );
}

/** Every `docs/domain/*.md` at commit `base`, keyed by its repository-relative path. */
function readBaseNotes(base) {
  return Object.fromEntries(
    git('ls-tree', '--name-only', base, 'docs/domain/')
      .split('\n')
      .filter((file) => file.endsWith('.md'))
      .map((file) => [file, git('show', `${base}:${file}`)])
  );
}

function verify(section) {
  if (!GIT_EXECUTABLE) {
    console.error('could not find "git" in any absolute PATH directory');
    return 2;
  }
  const base = git('merge-base', 'HEAD', 'origin/main').trim();
  const { problems, rows, rebuilt } = verifyConversion({
    base: git('show', `${base}:DOMAIN.md`),
    domain: readFileSync(path.join(ROOT, 'DOMAIN.md'), 'utf8'),
    notes: readNotes(),
    baseNotes: readBaseNotes(base),
    section,
    reversePairs: REVERSE_PAIRS,
    overrides: DEFINITION_SENTENCES,
  });
  const dirty = git('status', '--porcelain', '--', 'DOMAIN.md', 'docs/domain').trim() !== '';
  console.log(`base ${base}`);
  console.log(
    `verified ${git('rev-parse', 'HEAD').trim()}${dirty ? ' plus uncommitted changes' : ''}`
  );
  console.log(`rows: ${rebuilt}/${rows} rebuilt`);
  for (const problem of problems) console.error(`FAIL ${problem}`);
  return problems.length === 0 && rows > 0 && rebuilt === rows ? 0 : 1;
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
  options: { section: { type: 'string' }, verify: { type: 'boolean' } },
});
if (!values.section) {
  console.error('usage: split-domain-glossary.mjs --section "<heading>" [--verify]');
  process.exit(2);
}
process.exit(values.verify ? verify(values.section) : convert(values.section));
