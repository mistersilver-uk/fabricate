/** `runCaseSteps` (issue 2350) drives a fake page: each verb's dispatch, and each refusal it throws. */
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runCaseSteps } from '../scripts/lib/viewLabSteps.js';

const RAIL = '.manager-nav-button';

/** A page whose `elements` map each selector to the names of the elements it matches. */
function fakePage({ elements = {}, rail = [] } = {}) {
  const actions = [];
  const page = { actions, settles: 0 };
  const act = (selector, target, verb) => async (value) => {
    actions.push({ selector, target, verb, value });
  };
  const locatorOver = (selector, entries) => ({
    count: async () => entries.length,
    allInnerTexts: async () => [...entries],
    filter: ({ hasText }) =>
      locatorOver(
        selector,
        entries.filter((text) => hasText.test(text))
      ),
    first: () => ({
      click: act(selector, entries[0], 'click'),
      fill: act(selector, entries[0], 'fill'),
      selectOption: act(selector, entries[0], 'select'),
      press: act(selector, entries[0], 'press'),
      scrollIntoViewIfNeeded: act(selector, entries[0], 'scroll'),
      setInputFiles: async (path) => {
        actions.push({ selector, verb: 'upload', path, value: readFileSync(path, 'utf8') });
      },
    }),
  });
  page.locator = (selector) =>
    locatorOver(selector, selector === RAIL ? rail : (elements[selector] ?? []));
  page.evaluate = async () => {
    page.settles += 1;
  };
  return page;
}

test('dispatches each object verb to its Playwright action and settles after every step', async () => {
  const page = fakePage({ elements: { '#pick': ['pick'], '#name': ['name'], '#row': ['row'] } });
  await runCaseSteps(
    page,
    [
      { selector: '#pick', select: '10' },
      { selector: '#name', fill: 'Iron' },
      { selector: '#row', scroll: true },
      { selector: '#row', press: 'Enter' },
      { selector: '#row' },
      { selector: '#row', modifiers: 'Shift' },
    ],
    { label: 'verbs' }
  );
  assert.deepEqual(
    page.actions.map(({ verb, value }) => [verb, value]),
    [
      ['select', '10'],
      ['fill', 'Iron'],
      ['scroll', undefined],
      ['press', 'Enter'],
      ['click', {}],
      ['click', { modifiers: ['Shift'] }],
    ]
  );
  assert.equal(page.settles, 6);
});

test('an object step that matches nothing throws rather than capturing the screen underneath', async () => {
  await assert.rejects(
    runCaseSteps(fakePage(), [{ selector: '#absent' }], { label: 'missing' }),
    /^Error: missing: nothing matches "#absent" — the case cannot reach its view state$/
  );
});

test('refuses a modifier paired with a verb, an unknown modifier and an unknown key', async () => {
  const page = fakePage({ elements: { '#row': ['row'] } });
  await assert.rejects(
    runCaseSteps(page, [{ selector: '#row', modifiers: 'Shift', fill: 'x' }], { label: 'paired' }),
    /paired: step for "#row" pairs `modifiers` with `fill`/
  );
  await assert.rejects(
    runCaseSteps(page, [{ selector: '#row', modifiers: ['Shift', 'Hyper'] }], { label: 'unknown' }),
    /unknown: step for "#row" names unknown modifier\(s\) "Hyper"/
  );
  await assert.rejects(
    runCaseSteps(page, [{ selector: '#row', press: 'Escape' }], { label: 'key' }),
    /key: step for "#row" names unknown key "Escape"/
  );
  assert.deepEqual(page.actions, [], 'no refused step may act on the page');
});

test('an upload writes its payload under scratch, and throws without one', async () => {
  const page = fakePage({ elements: { '#file': ['file'] } });
  await assert.rejects(
    runCaseSteps(page, [{ selector: '#file', upload: '{}' }], { label: 'no-scratch' }),
    /no-scratch: step for "#file" uploads a file, and no scratch directory was given/
  );

  const scratch = mkdtempSync(join(tmpdir(), 'view-lab-steps-'));
  try {
    await runCaseSteps(page, [{ selector: '#file', upload: '{"a":1}' }], {
      label: 'upload',
      scratch,
    });
    assert.deepEqual(page.actions, [
      { selector: '#file', verb: 'upload', path: join(scratch, 'upload.json'), value: '{"a":1}' },
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('a string step clicks the rail entry its label starts, escaping the label', async () => {
  const page = fakePage({ rail: ['Recipe Books 3', 'Recipes 12', 'Items (all)'] });
  await runCaseSteps(page, ['Recipes', 'Items (all)'], { label: 'rail' });
  assert.deepEqual(
    page.actions.map(({ selector, target }) => [selector, target]),
    [
      [RAIL, 'Recipes 12'],
      [RAIL, 'Items (all)'],
    ]
  );
});

test('a string step that names no rail entry lists the entries that exist', async () => {
  const page = fakePage({ rail: ['Recipes\n 12', 'Components'] });
  await assert.rejects(runCaseSteps(page, ['Essences'], { label: 'rail-miss' }), (error) => {
    assert.match(
      error.message,
      /^rail-miss: no "\.manager-nav-button" element labelled "Essences"/
    );
    assert.match(error.message, /available: "Recipes 12", "Components"$/);
    return true;
  });
});
