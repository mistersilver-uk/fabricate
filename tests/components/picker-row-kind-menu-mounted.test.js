/**
 * `PickerRowKindMenu`'s copy is the caller's (issue 1773): the ingredient side keeps "Accept
 * instead" and its hint, and a result row passes its own eyebrow and hint.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import {
  createMountedComponentHarness,
  KIND_MENU_COMPILED_MODULES,
  KIND_MENU_RAW_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
} from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-kind-menu-',
  rawModules: [
    ...KIND_MENU_RAW_MODULES,
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/apps/manager/recipe/pickerRowKinds.js',
  ],
  compiledModules: KIND_MENU_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/apps/manager/recipe/PickerRowKindMenu.svelte',
});

const settle = () => new Promise((done) => setTimeout(done, 0));

async function openMenu(props) {
  const target = await harness.mount({ kinds: ['component', 'currency', 'knowledge'], ...props });
  const trigger = target.querySelector('.manager-recipe-or-trigger');
  trigger.click();
  await settle();
  const heading = target.ownerDocument.querySelector('.manager-action-menu-heading');
  return { trigger, heading: heading?.textContent.trim() ?? null };
}

before(() => harness.setup());
after(() => harness.teardown());
afterEach(() => harness.remount());

describe('PickerRowKindMenu: the caller’s eyebrow and hint', () => {
  it('reads the ingredient side’s copy when the caller passes none', async () => {
    const { trigger, heading } = await openMenu({});
    assert.equal(heading, 'Accept instead');
    assert.equal(trigger.getAttribute('aria-label'), 'Accept instead');
    assert.equal(
      trigger.getAttribute('title'),
      'Accept another kind of ingredient in place of this one.'
    );
  });

  it('heads the panel, names the trigger and titles it with a result row’s copy', async () => {
    const { trigger, heading } = await openMenu({
      heading: 'Add an alternative',
      hint: 'Offer another reward in place of this one.',
    });
    assert.equal(heading, 'Add an alternative');
    assert.equal(trigger.getAttribute('aria-label'), 'Add an alternative');
    assert.equal(trigger.getAttribute('title'), 'Offer another reward in place of this one.');
    const entries = [...trigger.ownerDocument.querySelectorAll('[role="menuitem"]')];
    assert.deepEqual(
      entries.map((entry) => entry.textContent.trim()),
      ['Component', 'Currency', 'Recipe knowledge']
    );
  });
});
