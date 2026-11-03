/**
 * Issue 2892 — the published `ToggleCard`'s switch described by its sub line, read in Chromium's
 * own accessibility tree on the markup the seam draws, under the module sheet: in both semantics
 * the switch's name stays the title and its description is the sub text, and a card with no sub
 * line describes nothing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { publishedAxPage } from '../helpers/publishedAxPage.js';

const TITLE = 'Spend when this stage begins';
const SUB = 'The ingredient is used up as the stage starts.';
const CARD = { title: TITLE, on: false, onToggle() {} };

const CASES = Object.freeze([
  ['pressed', 'ToggleCard', { ...CARD, sub: SUB }],
  ['switch', 'ToggleCard', { ...CARD, sub: SUB, on: true, semantics: 'switch' }],
  ['bare', 'ToggleCard', CARD],
]);

let page;

before(async () => {
  page = await publishedAxPage({
    tmpPrefix: 'fabricate-toggle-card-description-rendered-',
    cases: CASES,
  });
});

after(async () => {
  await page?.close();
});

const switchOf = (id) => page.axOf(`[data-case="${id}"] button`);

describe('the published ToggleCard’s switch in Chromium', () => {
  for (const [id, role] of [
    ['pressed', 'button'],
    ['switch', 'switch'],
  ]) {
    it(`keeps the title as its name and reads the sub line as its description, as a ${role}`, async () => {
      assert.deepEqual(await switchOf(id), { role, name: TITLE, description: SUB });
    });
  }

  it('describes nothing without a sub line', async () => {
    assert.deepEqual(await switchOf('bare'), { role: 'button', name: TITLE, description: '' });
  });
});
