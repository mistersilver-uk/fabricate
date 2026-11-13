/**
 * `SHARED_PRIMITIVES` membership is a decision no test derives (issue 1628): dropping an entry
 * alone leaves every mounted suite green, and a later hand-rolled suite then takes a silent
 * `# cancelled`. So membership is ratcheted by removal against the base commit: an entry the base
 * list carried and the working tree's does not fails, unless `JUSTIFIED_REMOVALS` records why.
 * Additions are always allowed. The comparison reuses the merge-base ratchet engine; it inverts the
 * engine's grain (which tolerates a fall) by reporting each removed entry as a new head entry.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  compareToBase,
  readHeadFile,
  REPO_ROOT,
  reportComparison,
} from '../helpers/mergeBaseRatchet.js';
import { declaredConstant, parseModule, literalStrings, walkNodes } from '../helpers/moduleAst.js';

const FAMILY = 'shared-primitive-membership';
const LIST_FILE = 'tests/components/mounted-harness-primitive-allowlist.test.js';
const LIST_NAME = 'SHARED_PRIMITIVES';

/**
 * Entries that may leave the list, each with the reviewed reason. Empty today. Add a path here, in
 * the same change that removes it, with why the component no longer needs a mount suite to name it.
 */
const JUSTIFIED_REMOVALS = new Map();

/** Every path the `SHARED_PRIMITIVES` array literal spells in `text`, or `[]` when absent. */
function membersOf(text) {
  if (text === undefined) return [];
  const { ast } = parseModule(text);
  if (!declaredConstant(ast, LIST_NAME)) return [];
  for (const node of walkNodes(ast)) {
    if (node.type === 'VariableDeclarator' && node.id?.name === LIST_NAME && node.init) {
      return literalStrings(node.init);
    }
  }
  return [];
}

const measure = (readFile) =>
  membersOf(readFile(LIST_FILE)).map((member) => ({
    file: LIST_FILE,
    id: `${LIST_NAME} no longer lists ${member}`,
    member,
  }));

/** The engine flags what is new at head; a removed entry is made "new" by dropping base's side. */
const pair = (baseEntries, headEntries, justified = JUSTIFIED_REMOVALS) => {
  const kept = new Set(headEntries.map((entry) => entry.member));
  return {
    base: [],
    head: baseEntries.filter(
      (entry) => !kept.has(entry.member) && !(justified.get(entry.member) ?? '').trim()
    ),
  };
};

const compareMembership = (options = {}) =>
  compareToBase({
    family: FAMILY,
    corpusRoot: LIST_FILE,
    include: (file) => file === LIST_FILE,
    measure,
    pair,
    headMarkers: false,
    ...options,
  });

test('no SHARED_PRIMITIVES entry is removed without a recorded reason', (t) => {
  const result = reportComparison(
    t,
    compareMembership(),
    `Removing an entry from ${LIST_NAME} silently unguards every mounted suite that renders it. ` +
      'Keep the entry, or add it to JUSTIFIED_REMOVALS in this file with the reason it may go.',
    { markers: false }
  );
  assert.deepEqual(result.failures ?? [], [], 'no membership regression against base');
  if (!result.skipped) t.diagnostic(`compared with base ${result.base.slice(0, 12)}`);
});

test('the list reads as a populated array, so the ratchet is not vacuous', () => {
  const members = membersOf(readHeadFile(REPO_ROOT, LIST_FILE));
  assert.ok(members.length >= 40, `only ${members.length} entries parsed from ${LIST_NAME}`);
  assert.ok(members.every((m) => m.startsWith('src/ui/svelte/') && m.endsWith('.svelte')));
  assert.ok(members.includes('src/ui/svelte/components/Modal.svelte'));
});

test('every justified removal states a reason', () => {
  for (const [path, reason] of JUSTIFIED_REMOVALS) {
    assert.ok(String(reason).trim() !== '', `${path} is justified without a reason`);
  }
});

test('a removal is reported, a justified one is not, and an addition never is', () => {
  const entry = (member) => ({ id: `${LIST_NAME} no longer lists ${member}`, member });
  const [a, b, c] = ['a.svelte', 'b.svelte', 'c.svelte'].map(entry);
  assert.deepEqual(pair([a, b], [a]).head, [b]);
  assert.deepEqual(pair([a, b], [a], new Map([['b.svelte', 'folded into a']])).head, []);
  assert.deepEqual(pair([a, b], [a], new Map([['b.svelte', '  ']])).head, [b]);
  assert.deepEqual(pair([a], [a, c]).head, []);
});
