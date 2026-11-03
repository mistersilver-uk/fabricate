/**
 * `ToggleCard`'s switch described by its sub line in Fabricate's own use (issue 2892), mounted
 * directly with the in-app props the published seam does not take: a non-blank `sub` is the
 * switch's `aria-describedby`, disabled too, and a non-blank `toggleTitle` keeps the native title
 * as the description and writes none.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-toggle-card-description-',
  compiledModules: [
    'src/ui/svelte/components/StatusToggle.svelte',
    'src/ui/svelte/components/ToggleCard.svelte',
  ],
  componentPath: 'src/ui/svelte/components/ToggleCard.svelte',
});

const SUB = 'Recipes and salvage in this system can require it.';

before(() => harness.setup());
after(() => harness.teardown());

/** The switch and the sub line of a card mounted with `props`. */
async function cardWith(props) {
  const target = await harness.mount({ title: 'Enabled', on: true, ...props });
  return {
    toggle: target.querySelector('button'),
    subLine: target.querySelector('.manager-recipe-status-sub'),
  };
}

describe('ToggleCard in Fabricate’s own windows', () => {
  for (const disabled of [false, true]) {
    it(`describes the ${disabled ? 'disabled' : 'enabled'} switch by its sub line`, async () => {
      const { toggle, subLine } = await cardWith({ sub: SUB, disabled });
      assert.ok(subLine.id, 'the sub line has an id');
      assert.equal(toggle.getAttribute('aria-describedby'), subLine.id);
      assert.equal(toggle.disabled, disabled);
    });
  }

  it('keeps a toggleTitle as the switch’s description and writes no aria-describedby', async () => {
    const reason = 'Save this Tool before changing its enabled state.';
    const { toggle, subLine } = await cardWith({ sub: SUB, toggleTitle: reason, disabled: true });
    assert.equal(toggle.getAttribute('title'), reason);
    assert.ok(!toggle.hasAttribute('aria-describedby'), 'the title is not displaced');
    assert.ok(!subLine.hasAttribute('id'));
  });

  it('describes it by its sub line again once the toggleTitle is blank', async () => {
    const { toggle, subLine } = await cardWith({ sub: SUB, toggleTitle: '' });
    assert.ok(!toggle.hasAttribute('title'));
    assert.equal(toggle.getAttribute('aria-describedby'), subLine.id);
  });
});
