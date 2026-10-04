/**
 * The interface says "result set" (issue 1516): no `lang/en.json` value says "result group", and
 * every English fallback stated beside a key whose value says "result set" reads exactly as that
 * value. A pair is found by shape rather than by helper name, so `text`, `format`, `localize` and
 * `localizeOr` calls and the `[key, fallback]` / `{…Key, …Fallback}` tables all count.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import { literalStrings, walkNodes } from './helpers/moduleAst.js';
import { moduleAstOf, sourceAstEntriesUnder } from './helpers/parsedSource.js';
import { repoRoot } from './helpers/sourceScan.js';
import { keyName } from './helpers/structureShapes.js';

const lang = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
const KEY_PREFIX = 'FABRICATE.';
const RESULT_SET = /\bresult sets?\b/i;

function langLeaves(node = lang, path = []) {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'string'
      ? [[[...path, key].join('.'), value]]
      : langLeaves(value, [...path, key])
  );
}
const LEAVES = new Map(langLeaves());

/** A string the source spells in full: a literal, a `'…' + '…'` join, or a bare template. */
function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  if (node?.type === 'BinaryExpression' && node.operator === '+') {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  return undefined;
}

/** Full keys a `[key, fallback]` table entry may name: itself, or a suffix under a file prefix. */
function resolveKey(key, prefixes) {
  if (key.startsWith(KEY_PREFIX)) return LEAVES.has(key) ? [key] : [];
  return prefixes
    .map((prefix) => (prefix.endsWith('.') ? prefix + key : `${prefix}.${key}`))
    .filter((full) => LEAVES.has(full));
}

/** `text(key, fallback)` in any helper's spelling: a key argument, then a static string. */
function* callPairs(node) {
  const args = node.arguments.map(staticString);
  for (let index = 0; index + 1 < args.length; index += 1) {
    if (args[index]?.startsWith(KEY_PREFIX) && args[index + 1] !== undefined) {
      yield* resolveKey(args[index], []).map((key) => ({ key, fallback: args[index + 1] }));
    }
  }
}

function* arrayPairs(node, prefixes) {
  const [key, fallback] = node.elements.slice(0, 2).map(staticString);
  if (key === undefined || fallback === undefined) return;
  yield* resolveKey(key, prefixes).map((full) => ({ key: full, fallback }));
}

/** `{ descKey, descFallback }` or `{ labelKey, fallback }`. */
function* objectPairs(node) {
  const values = new Map(node.properties.map((entry) => [keyName(entry), entry.value]));
  for (const [name, value] of values) {
    const key = staticString(value);
    if (!/Key$|^key$/.test(name ?? '') || !key?.startsWith(KEY_PREFIX)) continue;
    const stem = name.slice(0, -'Key'.length);
    const fallback = staticString(values.get(`${stem}Fallback`) ?? values.get('fallback'));
    if (fallback !== undefined) yield* resolveKey(key, []).map((full) => ({ key: full, fallback }));
  }
}

const PAIRS_BY_TYPE = {
  CallExpression: callPairs,
  ArrayExpression: arrayPairs,
  ObjectExpression: objectPairs,
};

function* fallbackPairs(ast) {
  const prefixes = [...new Set(literalStrings(ast).filter((s) => s.startsWith(KEY_PREFIX)))];
  for (const node of walkNodes(ast)) {
    const pairs = PAIRS_BY_TYPE[node.type];
    if (pairs) yield* pairs(node, prefixes);
  }
}

const CORPUS = [
  ...sourceAstEntriesUnder('src/ui'),
  [
    'src/utils/recipeActivationMessages.js',
    moduleAstOf('src/utils/recipeActivationMessages.js').ast,
  ],
];

describe('result set wording (issue 1516)', () => {
  it('no en.json value says result group', () => {
    const offenders = [...LEAVES].filter(([, value]) => /\bresult groups?\b/i.test(value));
    assert.deepEqual(offenders, []);
  });

  it('every fallback for a key that says result set reads exactly as its en.json value', () => {
    const failures = [];
    const covered = new Set();
    for (const [file, ast] of CORPUS) {
      for (const { key, fallback } of fallbackPairs(ast)) {
        const value = LEAVES.get(key);
        if (!RESULT_SET.test(value)) continue;
        covered.add(key);
        if (fallback !== value) failures.push(`${file}: ${key} "${fallback}" !== "${value}"`);
      }
    }
    assert.deepEqual(failures, []);
    // One key per pair shape, so a walk that stops finding a shape fails rather than passing empty.
    for (const key of [
      'FABRICATE.Admin.Manager.Component.SalvageEditor.ResultGroups',
      'FABRICATE.Admin.Manager.Checks.Simulator.FactResults',
      'FABRICATE.Admin.Manager.Checks.Mode.RoutedByCheckBody',
      'FABRICATE.Admin.Manager.RecipeActivation.IssueResultGroupEmpty',
      'FABRICATE.Admin.SystemSettings.ResolutionSimpleDesc',
    ]) {
      assert.ok(covered.has(key), `no fallback pair found for ${key}`);
    }
  });
});
