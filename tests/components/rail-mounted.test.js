/** Issue 1782 — the library's `<Rail>`, one section of a right-hand inspector column. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const RAIL_PATH = 'src/ui/svelte/components/Rail.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-rail-',
  compiledModules: [RAIL_PATH],
  componentPath: RAIL_PATH,
});

const body = createRawSnippet(() => ({ render: () => '<p data-rail-body="">Usage</p>' }));

/** The element an `aria-labelledby` names, read the way an accessibility tree reads it. */
const labelOf = (element) =>
  globalThis.document.querySelector(`[id="${element.getAttribute('aria-labelledby')}"]`);

describe('Rail', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('is an unnamed section when it has no label, carrying the caller class and its hooks', async () => {
    const root = await harness.mount({ class: 'is-caller', children: body, 'data-probe': '' });
    const rail = root.querySelector('.fab-rail');
    assert.equal(rail.tagName, 'SECTION');
    assert.ok(rail.classList.contains('is-caller'), 'the caller class is appended');
    assert.ok(rail.hasAttribute('data-probe'), 'the rest spread lands on the root');
    assert.ok(!rail.hasAttribute('role'), 'an unlabelled section takes no role');
    assert.ok(!rail.hasAttribute('aria-labelledby') && !rail.hasAttribute('aria-label'));
    assert.ok(!rail.querySelector('.fab-rail-label'), 'no kicker without a label');
    assert.equal(rail.querySelector('[data-rail-body]').textContent, 'Usage');
  });

  it('is a group named by its kicker, which opens the section, and never a region', async () => {
    const root = await harness.mount({ label: 'Source', children: body });
    const rail = root.querySelector('.fab-rail');
    assert.equal(rail.getAttribute('role'), 'group', 'a labelled section is never a region');
    const kicker = rail.firstElementChild;
    assert.ok(kicker.classList.contains('fab-rail-label'), 'the kicker opens the section');
    assert.equal(kicker.tagName, 'P', 'the kicker is a paragraph, never a heading');
    assert.equal(kicker.textContent, 'Source');
    assert.ok(labelOf(rail) === kicker, 'the kicker names the group');
    assert.ok(!rail.hasAttribute('aria-label'), 'one naming route, never two');
  });

  it('gives each labelled section its own kicker id', async () => {
    await harness.mount({ label: 'Source', children: body });
    await harness.mount({ label: 'Usage', children: body });
    const rails = [...globalThis.document.querySelectorAll('.fab-rail[role="group"]')];
    assert.equal(rails.length, 2);
    assert.deepEqual(
      rails.map((rail) => labelOf(rail)?.textContent),
      ['Source', 'Usage'],
      'two sections on one rail must not share a name'
    );
  });
});
