/** The Validation tab's words for the iterative readiness codes (issue 3009). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  ITERATIVE_READINESS_CODES,
  ITERATIVE_READINESS_MESSAGES,
} from '../src/systems/iterative/iterativeReadiness.js';
import {
  ITERATIVE_ISSUE_KEYS,
  iterativeIssueSentence,
  overviewIssueGroup,
} from '../src/ui/svelte/apps/manager/iterative/iterativeIssueCopy.js';

const LANG = JSON.parse(readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8'));

const lookup = (key) => key.split('.').reduce((node, part) => node?.[part], LANG);

test('the map names every iterative readiness code and no other', () => {
  const byName = (left, right) => left.localeCompare(right);
  assert.deepEqual(
    Object.keys(ITERATIVE_ISSUE_KEYS).sort(byName),
    [...ITERATIVE_READINESS_CODES].sort(byName)
  );
});

test('each code has its own key, and its English is the headless sentence', () => {
  const keys = Object.values(ITERATIVE_ISSUE_KEYS);
  assert.equal(new Set(keys).size, keys.length, 'no two codes share a key');
  const sentences = [];
  for (const [code, key] of Object.entries(ITERATIVE_ISSUE_KEYS)) {
    const sentence = lookup(key);
    assert.equal(typeof sentence, 'string', `${key} is missing from lang/en.json`);
    assert.equal(sentence, ITERATIVE_READINESS_MESSAGES[code], `${code} reads differently`);
    sentences.push(sentence);
  }
  assert.equal(new Set(sentences).size, sentences.length, 'no two codes read alike');
});

test('each key sits in the SystemOverview namespace, named after its code', () => {
  for (const [code, key] of Object.entries(ITERATIVE_ISSUE_KEYS)) {
    const pascal = `${code[0].toUpperCase()}${code.slice(1)}`;
    assert.equal(key, `FABRICATE.Admin.Manager.SystemOverview.Issue${pascal}`);
  }
});

test('the Validation group and link labels for the library exist', () => {
  for (const name of ['GroupCounter', 'GroupAction', 'LinkCounter', 'LinkAction']) {
    assert.equal(typeof lookup(`FABRICATE.Admin.Manager.SystemOverview.${name}`), 'string', name);
  }
});

test('overviewIssueGroup lists an issue under its library entity, else its kind', () => {
  const table = [
    [{ kind: 'system', entityKind: 'counter' }, 'counter'],
    [{ kind: 'system', entityKind: 'action' }, 'action'],
    [{ kind: 'system', entityKind: 'system' }, 'system'],
    [{ kind: 'system' }, 'system'],
    [{ kind: 'recipe', entityKind: 'recipe' }, 'recipe'],
    // Only a `system` issue is regrouped; a recipe issue never reads as a counter or an action.
    [{ kind: 'recipe', entityKind: 'counter' }, 'recipe'],
    [{ kind: 'task', entityKind: 'action' }, 'task'],
    [{ kind: 'salvage' }, 'salvage'],
    [{}, undefined],
    [null, undefined],
  ];
  for (const [issue, group] of table) {
    assert.equal(overviewIssueGroup(issue), group, JSON.stringify(issue));
  }
});

test('iterativeIssueSentence localizes an iterative code and falls back to the issue message', () => {
  const asked = [];
  const text = (key, fallback) => {
    asked.push(key);
    return `${fallback}!`;
  };
  assert.equal(
    iterativeIssueSentence({ code: 'iterativeNoCounters', message: 'headless' }, text),
    'headless!'
  );
  assert.deepEqual(asked, [ITERATIVE_ISSUE_KEYS.iterativeNoCounters]);
  assert.equal(iterativeIssueSentence({ code: 'noName', message: 'x' }, text), '');
  assert.equal(iterativeIssueSentence({ code: 'toString' }, text), '');
  assert.equal(iterativeIssueSentence(null, text), '');
  assert.equal(asked.length, 1, 'a code that is not iterative never reaches the localizer');
});
