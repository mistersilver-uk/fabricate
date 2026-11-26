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
  ITERATIVE_ISSUE_NAMED_KEYS,
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

/** A localizer that reads `en.json`, as the shell's does, and gives `fallback` for an unknown key. */
const english = (key, fallback) => lookup(key) ?? fallback;
const named = (code, name) => ({
  code,
  message: 'headless',
  ...(code.endsWith('Action') || code === 'iterativeCheckUnavailable'
    ? { actionName: name }
    : { counterName: name }),
});

test('a named issue reads its counter or action in each of the seven sentences', () => {
  const sentence = (code, name) => iterativeIssueSentence(named(code, name), english);
  assert.equal(
    sentence('iterativeUnknownCounter', 'Rust'),
    'Rust is not a counter this recipe can use.'
  );
  assert.equal(
    sentence('iterativeInvalidNumber', 'Heat'),
    'Heat has a start, start formula, bound or target that cannot be read.'
  );
  assert.equal(sentence('iterativeBoundsInverted', 'Heat'), "Heat's minimum is above its maximum.");
  assert.equal(
    sentence('iterativeStartOutOfBounds', 'Heat'),
    'Heat starts outside its minimum or maximum.'
  );
  assert.equal(
    sentence('iterativeExpressionBoundUnset', 'Heat'),
    "An expression reads Heat's minimum, maximum or target, which is not set."
  );
  assert.equal(
    sentence('iterativeUnknownAction', 'anneal'),
    'anneal is not a crafting action in this system.'
  );
  assert.equal(
    sentence('iterativeCheckUnavailable', 'Stoke'),
    'Stoke rolls a check, but the routed crafting check has no roll formula.'
  );
});

test('an unnamed issue, or a named code with no name, reads the unnamed sentence', () => {
  for (const code of Object.keys(ITERATIVE_ISSUE_NAMED_KEYS)) {
    const unnamed = lookup(ITERATIVE_ISSUE_KEYS[code]);
    assert.equal(iterativeIssueSentence({ code, message: 'headless' }, english), unnamed, code);
    assert.equal(iterativeIssueSentence(named(code, ''), english), unnamed, code);
    assert.equal(iterativeIssueSentence({ code, counterName: 7, actionName: 7 }, english), unnamed);
  }
});

test('a name never changes a code with no named sentence', () => {
  const issue = { code: 'iterativeNoSuccessRule', message: 'headless', counterName: 'Heat' };
  assert.equal(
    iterativeIssueSentence(issue, english),
    lookup(ITERATIVE_ISSUE_KEYS.iterativeNoSuccessRule)
  );
});

test('an unresolved named key reads the unnamed message and never a literal placeholder', () => {
  const unnamedOnly = (key, fallback) => (key.endsWith('Named') ? fallback : `${fallback}!`);
  const sentence = iterativeIssueSentence(named('iterativeUnknownCounter', 'Rust'), unnamedOnly);
  assert.equal(sentence, 'headless!');
  const blank = (key, fallback) => (key.endsWith('Named') ? '' : fallback);
  assert.equal(iterativeIssueSentence(named('iterativeUnknownAction', 'x'), blank), 'headless');
});

test('a name is filled verbatim, whatever replacement pattern it contains', () => {
  const sentence = iterativeIssueSentence(
    named('iterativeBoundsInverted', 'Cost $& $1 $$'),
    english
  );
  assert.equal(sentence, "Cost $& $1 $$'s minimum is above its maximum.");
  const action = iterativeIssueSentence(named('iterativeUnknownAction', '$`x'), english);
  assert.equal(action, '$`x is not a crafting action in this system.');
});

test('each named key is a code of the unnamed map, in its namespace, with its own placeholder', () => {
  const actionCodes = new Set(['iterativeUnknownAction', 'iterativeCheckUnavailable']);
  assert.equal(Object.keys(ITERATIVE_ISSUE_NAMED_KEYS).length, 7);
  for (const [code, key] of Object.entries(ITERATIVE_ISSUE_NAMED_KEYS)) {
    assert.ok(Object.hasOwn(ITERATIVE_ISSUE_KEYS, code), `${code} is not an iterative code`);
    const pascal = `${code[0].toUpperCase()}${code.slice(1)}`;
    assert.equal(key, `FABRICATE.Admin.Manager.SystemOverview.Issue${pascal}Named`);
    const sentence = lookup(key);
    assert.equal(typeof sentence, 'string', `${key} is missing from lang/en.json`);
    const [wanted, other] = actionCodes.has(code)
      ? ['{action}', '{counter}']
      : ['{counter}', '{action}'];
    assert.equal(sentence.split(wanted).length, 2, `${key} names ${wanted} once`);
    assert.ok(!sentence.includes(other), `${key} must not name ${other}`);
  }
});
