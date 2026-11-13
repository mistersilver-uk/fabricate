/**
 * The caller and importer counts the register and the library SPELL, re-derived from the tree
 * (issues 1481, 1579).
 *
 * A prose count is a claim about the import graph that nothing re-measured, so one was false the
 * day after it was true. The KIND of a count is decided by the words after it, which is the
 * decision issue 1481 left open:
 *
 *   - `N importers`, `N importing files` count the files that import the component;
 *   - `N render sites` counts the `<Component>` nodes across `src/`;
 *   - `N callers`, `N call sites` is deliberately either, because both ship (`Field`: "81 call
 *     sites across 23 components"; `FilterBar`: "14 callers", which are its importers);
 *   - `independent` marks a JUDGED subset, so it is bounded by the measurement rather than equal
 *     to it, because a wrapper that forwards its props is an importer and not an independent one.
 *
 * `src/ui/publishedComponents.svelte.js`, the seam's adapter, is an importer a spelled count may
 * leave out: the register says "11 importing files beside the published seam's adapter".
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { measureImporters } from '../scripts/lib/componentImporters.js';
import {
  DESIGN_SYSTEM_PRIMITIVES,
  NOT_A_PRIMITIVE,
} from '../scripts/lib/designSystemPrimitives.js';
import { listSvelteComponents, toRepositoryPaths } from '../scripts/lib/svelteComponentFiles.js';

import { readDesignLibrary } from './helpers/designLibrary.js';
import { componentAstOf } from './helpers/parsedSource.js';
import { walkTemplate } from './helpers/primitiveAdoptionContract.js';

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The seam's adapter: an importer of every published component, and no screen. */
const SEAM_ADAPTER = 'src/ui/publishedComponents.svelte.js';

const NUMBER_WORDS = new Map(
  [
    'zero one two three four five six seven eight nine ten',
    'eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty',
  ]
    .join(' ')
    .split(' ')
    .map((word, value) => [word, value])
);

/** A spelled count: the number, whether it is `independent`, and the noun that gives its kind. */
const SPELLED_COUNT = new RegExp(
  String.raw`(?:<b>)?\b(\d+|${[...NUMBER_WORDS.keys()].join('|')})\s+(independent\s+|direct\s+)?` +
    String.raw`(importers?|importing files|callers|call sites|render sites)\b`,
  'giu'
);

const COMPONENTS = toRepositoryPaths(REPO_ROOT, listSvelteComponents(path.join(REPO_ROOT, 'src')));
const GRAPH = measureImporters(REPO_ROOT);

/** `<Tag>` component nodes per component name across `src/`, and the files that hold them. */
const RENDERS = new Map();
for (const file of COMPONENTS) {
  walkTemplate(componentAstOf(file).fragment, (node) => {
    if (node.type !== 'Component') return;
    const entry = RENDERS.get(node.name) ?? { sites: 0, files: new Set() };
    entry.sites += 1;
    entry.files.add(file);
    RENDERS.set(node.name, entry);
  });
}

/** The one component a name or path suffix names, or `null` where it names none or several. */
function componentNamed(name) {
  const matches = COMPONENTS.filter((file) => file === name || file.endsWith(`/${name}`));
  return matches.length === 1 ? matches[0] : null;
}

/** What the tree says about one component: its importers with and without the seam's adapter. */
function measureComponent(file) {
  const importers = GRAPH.importersOf(file);
  const rendered = RENDERS.get(path.basename(file, '.svelte')) ?? { sites: 0, files: new Set() };
  return {
    importers,
    withoutAdapter: importers.filter((importer) => importer !== SEAM_ADAPTER),
    sites: rendered.sites,
    renderingFiles: rendered.files.size,
  };
}

/** The integer a spelled number stands for. */
const valueOf = (spelling) => NUMBER_WORDS.get(spelling.toLowerCase()) ?? Number(spelling);

/** Every spelled count in `text`, with its position, number, kind noun and qualifier. */
function spelledCountsIn(text) {
  return [...text.matchAll(SPELLED_COUNT)].map((found) => ({
    at: found.index,
    end: found.index + found[0].length,
    spelling: found[1],
    stated: valueOf(found[1]),
    judged: found[2] !== undefined,
    kind: found[3].toLowerCase(),
  }));
}

/** The measured figures a spelled count of this kind may equal. */
function acceptedFigures(measured, { kind }) {
  const importers = [measured.importers.length, measured.withoutAdapter.length];
  if (/^importer|importing/u.test(kind)) return importers;
  if (kind === 'render sites') return [measured.sites];
  return [...importers, measured.sites];
}

/** Why a spelled count disagrees with the tree, or `null` where it agrees. */
function disagreement(subject, count) {
  const measured = measureComponent(subject);
  const accepted = acceptedFigures(measured, count);
  const agrees = count.judged
    ? count.stated >= 1 && count.stated <= Math.max(...accepted)
    : accepted.includes(count.stated);
  if (agrees) return null;
  return (
    `${subject} is spelled with "${count.spelling} ${count.kind}" and the tree has ` +
    `${measured.importers.length} importers (${measured.withoutAdapter.length} without the seam's ` +
    `adapter) and ${measured.sites} render sites`
  );
}

/** Every disagreement over `text`, each count measured against `subjectOf(count)`. */
function disagreementsIn(text, subjectOf) {
  return spelledCountsIn(text).flatMap((count) => {
    const subject = subjectOf(count);
    const found = subject === null ? null : disagreement(subject, count);
    return found === null ? [] : [found];
  });
}

const MANIFEST_ROWS = [...DESIGN_SYSTEM_PRIMITIVES, ...NOT_A_PRIMITIVE];

const whyText = (row) => [row.why].flat().join(' ');

test('the spelled-count scan reads a populated register, library and tree', () => {
  assert.ok(COMPONENTS.length > 300, `the walk found ${COMPONENTS.length} components`);
  assert.ok(RENDERS.get('Chip')?.sites > 100, 'the render tally is not reaching the call sites');
  const spelledInRegister = DESIGN_SYSTEM_PRIMITIVES.flatMap((row) =>
    spelledCountsIn(whyText(row))
  );
  assert.ok(
    spelledInRegister.length >= 25,
    `the register spells ${spelledInRegister.length} counts, so the notation changed and this ` +
      'guard reads none of them'
  );
});

test('the count patterns read every spelling the register and library use', () => {
  const found = spelledCountsIn(
    'with 6 callers, five independent importers, Two importers, <b>31 importers</b>, ' +
      '11 importing files and 69 render sites over four call sites; 2 importerless'
  );
  assert.deepEqual(
    found.map((count) => [count.stated, count.kind, count.judged]),
    [
      [6, 'callers', false],
      [5, 'importers', true],
      [2, 'importers', false],
      [31, 'importers', false],
      [11, 'importing files', false],
      [69, 'render sites', false],
      [4, 'call sites', false],
    ]
  );
});

test('a spelled count is refused when it disagrees with the tree, and an independent one when it exceeds it', () => {
  const chip = 'src/ui/svelte/components/Chip.svelte';
  const importers = GRAPH.importersOf(chip).length;
  assert.deepEqual(
    disagreementsIn(`${importers} importers`, () => chip),
    []
  );
  assert.equal(disagreementsIn(`${importers + 1} importers`, () => chip).length, 1);
  assert.equal(disagreementsIn(`${importers + 1} independent importers`, () => chip).length, 1);
  assert.deepEqual(
    disagreementsIn(`${importers - 1} independent importers`, () => chip),
    []
  );
});

test('(register) every caller and importer count a member row spells is the tree’s', () => {
  const problems = MANIFEST_ROWS.flatMap((row) =>
    disagreementsIn(whyText(row), () => row.path).map((problem) => `${row.path}: ${problem}`)
  );
  assert.deepEqual(
    problems,
    [],
    'a register row spells a count the import graph does not support. State the measured ' +
      'figure, or word the claim without a numeral where the component is churned enough that the ' +
      'figure would be a manifest edit on every unrelated PR.'
  );
});

/** A library `<span class="cite">` with no inline style: the entry's own evidence line. */
const ENTRY_CITE = /<span class="cite">(.*?)<\/span>/gsu;

/** A bolded component the cite names, `<b>Chip.svelte</b>` or `<b>components/Chip.svelte</b>`. */
const BOLD_COMPONENT = /<b>([\w/]+\.svelte)<\/b>/gu;

/**
 * The component a count in a cite is about: the nearest one named before it, or the first one
 * named after it where the cite leads with the count (`91 importers · Chip.svelte`).
 */
function citeSubject(text, count) {
  const named = [...text.matchAll(BOLD_COMPONENT)];
  const before = named.findLast((found) => found.index < count.at);
  const subject = before ?? named.find((found) => found.index >= count.end);
  return subject === undefined ? null : componentNamed(subject[1]);
}

/** A shipped-surface bullet: `read from <code>X.svelte</code>'s $props(), at N importing files`. */
const READ_FROM = /read from <code>([\w/]+\.svelte)<\/code>/u;

const library = readDesignLibrary();

test('(library) every count an entry cite spells is the tree’s', () => {
  const cites = [...library.matchAll(ENTRY_CITE)].map((found) => found[1]);
  const problems = cites.flatMap((text) =>
    disagreementsIn(text, (count) => citeSubject(text, count))
  );
  assert.ok(cites.length > 50, `the library has ${cites.length} cites, so the pattern is dead`);
  assert.deepEqual(
    problems,
    [],
    'a library cite spells a count the import graph does not support. library.html is the ' +
      'specification a reader trusts, and a measured figure goes stale with the next import.'
  );
});

test('(library) every count a shipped-surface bullet spells is the tree’s', () => {
  const bullets = library.split('\n').filter((line) => READ_FROM.test(line));
  const problems = bullets.flatMap((line) => {
    const subject = componentNamed(READ_FROM.exec(line)[1]);
    return disagreementsIn(line.slice(line.search(READ_FROM)), () => subject);
  });
  assert.ok(bullets.length >= 8, `the library has ${bullets.length} bullets that name a source`);
  assert.deepEqual(problems, [], 'a shipped-surface bullet spells a count the tree does not have');
});
