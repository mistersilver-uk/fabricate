/** The payload `ComponentEditView` saves: each section flag decides which keys it writes (issue 2758). */
import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { componentEditViewHarness } from '../helpers/componentEditViewModules.js';

const harness = componentEditViewHarness('fabricate-component-save-payload-');

const TAG_OPTIONS = [
  { tag: 'ore', checked: true },
  { tag: 'ingot', checked: false },
];

// `ash` is offered but carried at zero, so the save must leave it out of the map.
const ESSENCE_OPTIONS = [
  { id: 'fire', name: 'Fire', icon: 'fas fa-fire', enabled: true, quantity: 2 },
  { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', enabled: true, quantity: 0 },
  { id: 'ash', name: 'Ash', icon: 'fas fa-smog', enabled: true, quantity: 0 },
];

const SALVAGE = { enabled: true, resultGroups: [] };

/** A mounted editor's props, and the list every save appends `[id, updates]` to. */
function props(overrides = {}) {
  const saves = [];
  return {
    saves,
    props: {
      component: {
        id: 'comp-1',
        name: 'Dragon Scale',
        category: 'metal',
        tags: [],
        essences: {},
        salvage: SALVAGE,
      },
      tagOptions: TAG_OPTIONS,
      essenceOptions: ESSENCE_OPTIONS,
      showSalvage: false,
      salvageResolutionMode: 'simple',
      onSave: (id, updates) => {
        saves.push([id, updates]);
        return true;
      },
      ...overrides,
    },
  };
}

/** Submits the editor's form, the way the header's Save does, and returns the last payload. */
async function saveAndRead(target, saves) {
  target
    .querySelector('#manager-component-edit-form')
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
  flushSync();
  assert.equal(saves.length, 1, 'the save reached onSave');
  return saves[0][1];
}

const tagToggle = (target, tag) =>
  target.querySelector(`[data-component-edit-tag-toggle="${tag}"]`);
const essenceIncrement = (target, id) =>
  target.querySelector(`[data-component-edit-essence="${id}"] [data-stepper-increment]`);

describe('ComponentEditView — the save payload follows the section flags (issue 2758)', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  // A throwing assertion must not leave a mounted tree for the next test.
  afterEach(() => harness.remount());

  // With `showTags` off the chip still renders and toggles, but the save drops the tag; this pins
  // the save, not the chip.
  it('with the tags section off, a save carries no tags key even when options are checked', async () => {
    const { props: mountProps, saves } = props({ showTags: false });
    const target = await harness.mount(mountProps);

    tagToggle(target, 'ingot').click();
    flushSync();
    assert.equal(
      tagToggle(target, 'ingot').dataset.componentTagChecked,
      'true',
      'negative control: the GM checked a tag, so the draft did change'
    );

    const updates = await saveAndRead(target, saves);
    assert.equal(Object.hasOwn(updates, 'tags'), false, 'the tags key is absent');
  });

  it('with the tags section on, a save carries exactly the checked tags', async () => {
    const { props: mountProps, saves } = props({ showTags: true });
    const target = await harness.mount(mountProps);

    tagToggle(target, 'ingot').click();
    tagToggle(target, 'ore').click();
    flushSync();

    const updates = await saveAndRead(target, saves);
    assert.deepEqual(updates.tags, ['ingot']);
  });

  it('with the essences section off, a save carries no essences key', async () => {
    const { props: mountProps, saves } = props({ showEssences: false });
    const target = await harness.mount(mountProps);

    assert.equal(
      target.querySelector('[data-component-edit-essence="earth"]'),
      null,
      'negative control: the essence card is not drawn'
    );

    const updates = await saveAndRead(target, saves);
    assert.equal(Object.hasOwn(updates, 'essences'), false, 'the essences key is absent');
  });

  it('with the essences section on, a save carries the quantity map and drops a zero', async () => {
    const { props: mountProps, saves } = props({ showEssences: true });
    const target = await harness.mount(mountProps);

    essenceIncrement(target, 'earth').click();
    flushSync();

    const updates = await saveAndRead(target, saves);
    assert.deepEqual(updates.essences, { fire: 2, earth: 1 });
    assert.equal(
      Object.hasOwn(updates.essences, 'ash'),
      false,
      'an essence left at zero is absent, not stored as 0'
    );
  });

  it('every save carries the category and an array of complications, whatever the flags', async () => {
    const { props: mountProps, saves } = props({ showTags: false, showEssences: false });
    const target = await harness.mount(mountProps);

    const updates = await saveAndRead(target, saves);
    assert.equal(updates.category, 'metal');
    assert.deepEqual(updates.complications, [], 'an empty complications list is still written');
  });

  it('with the salvage section off, a save carries no salvage key', async () => {
    const { props: mountProps, saves } = props({ showSalvage: false });
    const target = await harness.mount(mountProps);

    const updates = await saveAndRead(target, saves);
    assert.equal(Object.hasOwn(updates, 'salvage'), false, 'the salvage key is absent');
  });

  it('with the salvage section on, a save carries every persisted salvage field', async () => {
    const authored = {
      enabled: true,
      resultGroups: [
        {
          id: 'grp-1',
          name: 'Scraps',
          results: [{ id: 'res-1', componentId: 'cmp-scrap', quantity: 2 }],
        },
      ],
      outcomeRouting: { Success: 'grp-1' },
    };
    const { props: mountProps, saves } = props({
      showSalvage: true,
      component: {
        id: 'comp-1',
        name: 'Dragon Scale',
        category: 'metal',
        tags: [],
        essences: {},
        salvage: authored,
      },
    });
    const target = await harness.mount(mountProps);

    const updates = await saveAndRead(target, saves);
    // The draft fills normalizer defaults (overrides, reorder), so pin the authored keys only.
    for (const [key, value] of Object.entries(authored)) {
      assert.deepEqual(updates.salvage[key], value, `${key} survives the save`);
    }
    assert.equal(
      Object.hasOwn(updates.salvage, 'checkModifierIds'),
      false,
      'and no pick key is added'
    );
  });

  it('with the salvage section on, an absent check-modifier pick is deleted, never written as null', async () => {
    const { props: mountProps, saves } = props({ showSalvage: true });
    const target = await harness.mount(mountProps);

    const updates = await saveAndRead(target, saves);
    assert.equal(
      Object.hasOwn(updates.salvage, 'checkModifierIds'),
      false,
      'an absent pick is deleted, never written as null'
    );
  });

  it('with the salvage section on, an authored check-modifier pick is carried verbatim', async () => {
    const { props: mountProps, saves } = props({
      showSalvage: true,
      component: {
        id: 'comp-1',
        name: 'Dragon Scale',
        category: 'metal',
        tags: [],
        essences: {},
        salvage: { ...SALVAGE, checkModifierIds: ['mod-a'] },
      },
    });
    const target = await harness.mount(mountProps);

    const updates = await saveAndRead(target, saves);
    assert.deepEqual(updates.salvage.checkModifierIds, ['mod-a']);
  });
});
