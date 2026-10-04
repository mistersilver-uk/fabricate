/**
 * The interface says "result set" (issue 1516): no `lang/en.json` value says "result group", and
 * every English fallback stated beside a key whose value says "result set" reads exactly as that
 * value. A pair is found by shape rather than by helper name, so `text`, `format`, `localize` and
 * `localizeOr` calls and the `[key, fallback]` / `{…Key, …Fallback}` tables all count. No source
 * string outside the recorded migrations says "result group", whatever shape spells it.
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
const RESULT_GROUP = /\bresult groups?\b/i;

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
const PAIRS = CORPUS.flatMap(([file, ast]) => [...fallbackPairs(ast)].map((p) => ({ file, ...p })));

/** Keys whose value says a bare "set", so the result-set filter never reaches them. */
const BARE_SET_KEYS = [
  'FABRICATE.Admin.Manager.Recipe.CountResultGroups',
  'FABRICATE.Admin.Manager.Recipe.CountResultGroupsOne',
  'FABRICATE.Admin.Manager.Component.SalvageEditor.GroupNamePlaceholder',
  'FABRICATE.Admin.Manager.Component.SalvageEditor.NoResults',
];

/** The store's gathering validator messages and the parser reading them back: a recorded migration. */
const RESULT_GROUP_ALLOWED = [
  'src/ui/model/environmentValidation.js: progressive result group requires at least one result',
  'src/ui/model/environmentValidation.js: requires at least one result group|exactly one result group',
  'src/ui/model/environmentValidation.js: result group "([^"]+)"',
  'src/ui/model/environmentValidation.js: result groups require names',
  'src/ui/svelte/stores/adminStore.js:  Direct mode requires exactly one result group',
  'src/ui/svelte/stores/adminStore.js:  result group ',
  'src/ui/svelte/stores/adminStore.js:  result group "',
  'src/ui/svelte/stores/adminStore.js: " allows at most one matching result group',
  'src/ui/svelte/stores/adminStore.js: " requires exactly one matching result group',
];

/** What a node spells: a string literal, a regex pattern, a template chunk or Svelte markup text. */
function spelledText(node) {
  const spellers = {
    Literal: () => (typeof node.value === 'string' ? node.value : node.regex?.pattern),
    TemplateElement: () => node.value.cooked ?? node.value.raw,
    Text: () => node.data,
  };
  return spellers[node.type]?.();
}

describe('result set wording (issue 1516)', () => {
  it('no en.json value says result group', () => {
    const offenders = [...LEAVES].filter(([, value]) => RESULT_GROUP.test(value));
    assert.deepEqual(offenders, []);
  });

  it('no source string says result group outside the recorded migrations', () => {
    const found = new Set();
    for (const [file, ast] of CORPUS) {
      for (const node of walkNodes(ast)) {
        const text = spelledText(node);
        if (RESULT_GROUP.test(text ?? '')) found.add(`${file}: ${text}`);
      }
    }
    // Equality, so an allowance whose string has gone fails too and is dropped rather than kept.
    assert.deepEqual(found, new Set(RESULT_GROUP_ALLOWED));
  });

  it('every bare "set" key this issue migrated keeps a fallback that reads as its value', () => {
    for (const key of BARE_SET_KEYS) {
      const fallbacks = [...new Set(PAIRS.filter((p) => p.key === key).map((p) => p.fallback))];
      assert.deepEqual(fallbacks, [LEAVES.get(key)], key);
    }
  });

  it('every fallback for a key that says result set reads exactly as its en.json value', () => {
    const failures = [];
    const covered = new Set();
    for (const { file, key, fallback } of PAIRS) {
      const value = LEAVES.get(key);
      if (!RESULT_SET.test(value)) continue;
      covered.add(key);
      if (fallback !== value) failures.push(`${file}: ${key} "${fallback}" !== "${value}"`);
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
