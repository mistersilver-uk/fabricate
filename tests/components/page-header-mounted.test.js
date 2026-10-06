/** Issue 1777 — the library's `<PageHeader>`: a breadcrumb trail, a heading and two snippets. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet } from '../../node_modules/svelte/src/index-client.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const PAGE_HEADER = 'src/ui/svelte/components/PageHeader.svelte';

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-page-header-',
  rawModules: [...FOUNDRY_BRIDGE_RAW_MODULES, ...LOCALIZE_OR_RAW_MODULES],
  compiledModules: ['src/ui/svelte/components/Kicker.svelte', PAGE_HEADER],
  componentPath: PAGE_HEADER,
});

const identity = createRawSnippet(() => ({
  render: () => '<div data-probe-identity=""><h2>Smith’s Hammer</h2></div>',
}));
const actions = createRawSnippet(() => ({
  render: () => '<div data-probe-actions=""><button type="button">Save</button></div>',
}));

const headerIn = (root) => root.querySelector('header');
const trailOf = (root) =>
  [...root.querySelectorAll(':scope .manager-breadcrumbs > :not(i)')].map((crumb) => [
    crumb.tagName.toLowerCase(),
    crumb.textContent,
  ]);

describe('PageHeader', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('roots at its own class, appends the caller class and spreads the rest on the root', async () => {
    const root = await harness.mount({ title: 'Tool Rules', class: 'is-caller', 'data-probe': '' });
    const header = headerIn(root);
    assert.deepEqual([...header.classList], ['fabricate-page-header', 'is-caller']);
    assert.ok(header.hasAttribute('data-probe'), 'the rest spread lands on the root');
    assert.equal(root.querySelectorAll('header').length, 1, 'one header element');
  });

  it('draws a crumb with onSelect as a button and one without as a span, chevrons between', async () => {
    const calls = [];
    const root = await harness.mount({
      breadcrumbs: [
        {
          label: 'Crafting Systems',
          onSelect: (...args) => {
            calls.push(['systems', args.length]);
          },
        },
        {
          label: 'Alchemy',
          onSelect: (...args) => {
            calls.push(['system', args.length]);
          },
        },
        { label: 'Hammer', title: 'Smith’s Hammer', 'data-probe-leaf': '' },
      ],
    });
    const trail = root.querySelector('.manager-breadcrumbs');
    assert.equal(trail.tagName.toLowerCase(), 'nav');
    assert.equal(trail.getAttribute('aria-label'), 'Breadcrumbs', 'the trail is a named nav');
    assert.deepEqual(trailOf(root), [
      ['button', 'Crafting Systems'],
      ['button', 'Alchemy'],
      ['span', 'Hammer'],
    ]);
    assert.equal(trail.querySelectorAll('i.fa-chevron-right[aria-hidden="true"]').length, 2);
    for (const button of trail.querySelectorAll('button')) {
      assert.equal(button.getAttribute('type'), 'button', 'a crumb never submits a form');
      button.click();
    }
    assert.deepEqual(
      calls,
      [
        ['systems', 0],
        ['system', 0],
      ],
      'each crumb calls with no argument'
    );
    const leaf = trail.querySelector('span');
    assert.equal(leaf.getAttribute('title'), 'Smith’s Hammer', 'a crumb key lands as attribute');
    assert.ok(leaf.hasAttribute('data-probe-leaf'), 'a crumb hook lands on its element');
  });

  it('declares each crumb button focused, marks the leaf current, and forwards only hooks', async () => {
    const root = await harness.mount({
      breadcrumbs: [
        {
          label: 'Crafting Systems',
          onSelect: () => {},
          id: 'collides',
          kind: 'root',
          type: 'submit',
          'data-keyboard-focus': 'false',
          'aria-describedby': 'probe-hint',
        },
        { label: 'Tool Rules', onSelect: () => {} },
      ],
    });
    const buttons = [...root.querySelectorAll(':scope .manager-breadcrumbs button')];
    for (const button of buttons) {
      assert.equal(button.dataset.keyboardFocus, 'true', 'a hook cannot opt a crumb out');
      assert.equal(button.getAttribute('type'), 'button', 'a hook cannot make a crumb submit');
    }
    assert.deepEqual(
      [...buttons[0].attributes].map((attribute) => attribute.name).sort(byCodePoint),
      ['aria-describedby', 'data-keyboard-focus', 'type'],
      'only data-*, aria-* and title keys land; label, onSelect, id and kind never do'
    );
    assert.deepEqual(
      buttons.map((button) => button.getAttribute('aria-current')),
      [null, 'page'],
      'the last crumb, and only it, is the current page'
    );
  });

  it('draws no trail at all without breadcrumbs', async () => {
    const root = await harness.mount({ title: 'Tool Rules' });
    assert.ok(!root.querySelector('nav'), 'no empty nav is drawn');
  });

  it('draws the kicker, the title and the subtitle inside the heading block', async () => {
    const root = await harness.mount({
      kicker: 'Browse',
      title: 'Tool Rules',
      subtitle: 'Which Tools this system uses.',
    });
    const heading = headerIn(root).querySelector(':scope > .manager-heading');
    assert.ok(Boolean(heading), 'the heading block is the root’s first child');
    assert.equal(
      heading.querySelector(':scope .manager-page-kicker [data-page-kicker]').textContent,
      'Browse'
    );
    assert.equal(heading.querySelector('h1.manager-title').textContent, 'Tool Rules');
    assert.equal(
      heading.querySelector('p.manager-subtitle').textContent,
      'Which Tools this system uses.'
    );
  });

  it('draws no kicker, title or subtitle element for an empty one', async () => {
    const root = await harness.mount({});
    assert.ok(!root.querySelector('.manager-page-kicker'), 'no kicker wrapper');
    assert.ok(!root.querySelector('.manager-title'), 'no title');
    assert.ok(!root.querySelector('.manager-subtitle'), 'no subtitle');
  });

  it('renders the identity snippet in place of the title and subtitle', async () => {
    const root = await harness.mount({ identity, title: 'Tool Rules', subtitle: 'Unused' });
    const heading = headerIn(root).querySelector(':scope > .manager-heading');
    assert.ok(Boolean(heading.querySelector('[data-probe-identity]')), 'the identity is drawn');
    assert.ok(!root.querySelector('.manager-title'), 'the identity replaces the title');
    assert.ok(!root.querySelector('.manager-subtitle'), 'the identity replaces the subtitle');
  });

  it('renders the actions snippet as the root’s trailing child', async () => {
    const root = await harness.mount({ title: 'Tool Rules', actions });
    const header = headerIn(root);
    assert.deepEqual(
      [...header.children].map((child) => child.matches('.manager-heading, [data-probe-actions]')),
      [true, true],
      'two children: the heading block and the actions'
    );
    assert.ok(header.lastElementChild.hasAttribute('data-probe-actions'), 'the actions trail');
    assert.ok(
      !root.querySelector(':scope .manager-heading [data-probe-actions]'),
      'outside the heading'
    );
  });
});
