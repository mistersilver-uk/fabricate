/** The rules editor's Progressive DC card stages its value through its host (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  callRecorder,
  cardText,
  componentCardHarness,
} from '../helpers/componentEditViewModules.js';

const harness = componentCardHarness('ComponentDifficultyCard');

const SECTION = '[data-component-edit-section="difficulty"]';

async function mountWith(difficulty, extra = {}) {
  const { calls: staged, record } = callRecorder();
  const target = await harness.mount({
    text: cardText,
    difficulty,
    onDifficultyChange: record('difficulty'),
    ...extra,
  });
  return { staged, section: target.querySelector(SECTION) };
}

describe('ComponentDifficultyCard', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('stages the stepped value, and null once it drops below 1', async () => {
    const { staged, section } = await mountWith(1);
    assert.equal(section.querySelector('[data-stepper-input]').value, '1');
    section.querySelector('[data-stepper-increment]').click();
    section.querySelector('[data-stepper-decrement]').click();
    assert.deepEqual(staged, [
      ['difficulty', 2],
      ['difficulty', null],
    ]);
    harness.remount();
  });

  it('draws an unset DC at 0 and stages 1 on the first step up', async () => {
    const { staged, section } = await mountWith(null);
    assert.equal(section.querySelector('[data-stepper-input]').value, '0');
    section.querySelector('[data-stepper-increment]').click();
    assert.deepEqual(staged, [['difficulty', 1]]);
    harness.remount();
  });

  it('follows a new difficulty from its host', async () => {
    const { section } = await mountWith(2);
    assert.equal(section.querySelector('[data-stepper-input]').value, '2');
    await harness.setProps({ difficulty: 7 });
    assert.equal(section.querySelector('[data-stepper-input]').value, '7');
    harness.remount();
  });

  it('is inert while saving', async () => {
    const { staged, section } = await mountWith(4, { saving: true });
    section.querySelector('[data-stepper-increment]').click();
    assert.deepEqual(staged, []);
    assert.ok(section.querySelector('[data-stepper-input]').disabled, 'the input is disabled');
    harness.remount();
  });
});
