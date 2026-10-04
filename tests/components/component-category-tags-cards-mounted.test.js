/** The rules editor's Category and Tags cards report every pick to their host (issue 1522). */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  callRecorder,
  cardFormat,
  cardText,
  componentCardHarness,
} from '../helpers/componentEditViewModules.js';
import { chooseSelectOption } from '../helpers/select-control.js';

const harness = componentCardHarness('ComponentCategoryTagsCards');

function props(overrides = {}) {
  const { calls, record } = callRecorder();
  return {
    calls,
    props: {
      text: cardText,
      format: cardFormat,
      systemLabel: 'Smithing',
      categorySelectValue: 'material',
      categorySelectOptions: [
        { value: 'material', label: 'Material' },
        { value: 'reagent', label: 'Reagent' },
      ],
      categoryNote: { tone: 'subtle', state: 'own', icon: 'fas fa-circle', text: 'Own category' },
      hasWorldEntry: true,
      worldTags: ['metal', 'heavy'],
      worldMutedTags: ['heavy'],
      tagDraft: [
        { tag: 'herb', checked: false },
        { tag: 'ore', checked: true },
      ],
      onCategorySelect: record('category'),
      onToggleTag: record('tag'),
      ...overrides,
    },
  };
}

describe('ComponentCategoryTagsCards', () => {
  before(() => harness.setup());
  after(() => harness.teardown());

  it('reports a category choice and each tag toggle with its next state', async () => {
    const { calls, props: mounted } = props();
    const target = await harness.mount(mounted);

    chooseSelectOption(target, '[data-component-edit-category]', 'reagent');

    target.querySelector('[data-component-edit-tag-toggle="herb"]').click();
    target.querySelector('[data-component-edit-tag-toggle="ore"]').click();
    assert.deepEqual(calls, [
      ['category', 'reagent'],
      ['tag', 'herb', true],
      ['tag', 'ore', false],
    ]);
    harness.remount();
  });

  it('draws the world run read-only with its muted paint, and the note and subtitles it is given', async () => {
    const target = await harness.mount(props({ categoryLocked: true }).props);
    const world = [...target.querySelectorAll('[data-component-edit-world-tag]')];
    assert.deepEqual(
      world.map((chip) => [
        chip.dataset.componentEditWorldTag,
        chip.dataset.componentWorldTagMuted,
      ]),
      [
        ['metal', 'false'],
        ['heavy', 'true'],
      ]
    );
    assert.ok(
      world.every((chip) => chip.tagName !== 'BUTTON'),
      'the world run is not a control'
    );
    assert.ok(Boolean(target.querySelector('[data-component-edit-category-locked]')));
    assert.equal(
      target.querySelector('[data-component-edit-category-note="own"]').textContent.trim(),
      'Own category'
    );
    assert.equal(
      target.querySelector('[data-component-own-tags-label]').textContent,
      'Smithing’s tags'
    );
    assert.match(
      target.querySelector('[data-component-edit-section="tags"]').textContent,
      /Smithing’s own are the ones in effect/
    );
    harness.remount();
  });

  it('withholds the world group without a world entry and disables the tags while saving', async () => {
    const target = await harness.mount(props({ hasWorldEntry: false, saving: true }).props);
    assert.ok(
      !target.querySelector('[data-component-edit-section="world-tags"]'),
      'no world group'
    );
    const toggles = [...target.querySelectorAll('[data-component-edit-tag-toggle]')];
    assert.equal(toggles.length, 2);
    assert.ok(toggles.every((toggle) => toggle.disabled));
    harness.remount();
  });
});
