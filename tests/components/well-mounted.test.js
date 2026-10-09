/** Issue 2008 — the library's `<Well>`, the one container level below a card. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const WELL_PATH = 'src/ui/svelte/components/Well.svelte';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-well-',
  compiledModules: [WELL_PATH, 'src/ui/svelte/components/Kicker.svelte'],
  componentPath: WELL_PATH,
});

const body = createRawSnippet(() => ({ render: () => '<p data-well-body="">Ingredients</p>' }));

describe('Well', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('renders its body in a plain element carrying the caller class and every rest attribute', async () => {
    const root = await harness.mount({
      class: 'is-caller',
      children: body,
      role: 'group',
      'aria-labelledby': 'title-id',
      'data-probe': '',
    });
    const well = root.querySelector('.fab-well');
    assert.equal(well.tagName, 'DIV', 'a well adds no landmark');
    assert.ok(well.classList.contains('is-caller'), 'the caller class is appended');
    assert.equal(well.getAttribute('role'), 'group');
    assert.equal(well.getAttribute('aria-labelledby'), 'title-id');
    assert.ok(well.hasAttribute('data-probe'));
    assert.equal(well.querySelector('[data-well-body]').textContent, 'Ingredients');
    assert.ok(!well.querySelector('.fab-kicker'), 'no kicker without a label');
  });

  it('draws its label as the head kicker and is named by it', async () => {
    const root = await harness.mount({ label: 'Ingredients', children: body });
    const well = root.querySelector('.fab-well');
    assert.equal(well.querySelector('.fab-kicker').textContent.trim(), 'Ingredients');
    assert.equal(well.getAttribute('role'), 'group');
    assert.equal(well.getAttribute('aria-label'), 'Ingredients');
  });
});
