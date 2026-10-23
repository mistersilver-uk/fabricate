/**
 * `SetCard` (issue 2512): the set's name and kebab, the reserved and bare forms, and where focus
 * goes when a set is removed. `createRawSnippet` is imported by path so the snippets share the
 * mounted component's runtime.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { createRawSnippet, flushSync, tick } from '../../node_modules/svelte/src/index-client.js';
import {
  FOUNDRY_BRIDGE_RAW_MODULES,
  LOCALIZE_OR_RAW_MODULES,
} from '../helpers/foundryBridgeModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const RAW_MODULES = [
  ...FOUNDRY_BRIDGE_RAW_MODULES,
  ...LOCALIZE_OR_RAW_MODULES,
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/util/actionMenuLayout.js',
  'src/ui/svelte/util/overlayHost.js',
];
const COMPILED_MODULES = [
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/components/ActionMenu.svelte',
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/components/SetCard.svelte',
];

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-set-card-',
  rawModules: RAW_MODULES,
  compiledModules: COMPILED_MODULES,
  componentPath: 'src/ui/svelte/components/SetCard.svelte',
});

const HOST_PATH = 'tests/fixtures/set-card/SetCardListHost.svelte';
const listHarness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-set-card-list-',
  rawModules: RAW_MODULES,
  compiledModules: [...COMPILED_MODULES, HOST_PATH],
  componentPath: HOST_PATH,
});

const snippet = (html) => createRawSnippet(() => ({ render: () => html }));

async function settle() {
  flushSync();
  await tick();
  await new Promise((done) => setTimeout(done, 0));
  flushSync();
}

function fire(node, type) {
  node.dispatchEvent(new node.ownerDocument.defaultView.Event(type, { bubbles: true }));
}

/** Type `value` into `field` and fire `type`, as the browser does after an edit. */
function edit(field, value, type) {
  field.value = value;
  fire(field, type);
  flushSync();
}

async function openMenu(card) {
  card.querySelector('[data-set-card-actions]').click();
  await settle();
}

const menuItem = (target, label) =>
  [...target.querySelectorAll('[role="menuitem"]')].find(
    (item) => item.textContent.trim() === label
  );

describe('SetCard: the name field', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('draws the kicker, the named field and the rest spread after the class', async () => {
    const target = await harness.mount({
      kicker: 'Ingredient set',
      name: 'Gold',
      namePlaceholder: 'Set 1',
      nameLabel: 'Ingredient set name',
      nameProps: { 'data-recipe-set-field': 'name' },
      class: 'is-extra',
      'data-recipe-set': '',
    });
    const card = target.querySelector('.fabricate-set-card');
    assert.ok(card.classList.contains('is-extra'), 'the caller class extends the root');
    assert.ok(card.hasAttribute('data-recipe-set'), 'a rest hook reaches the root');
    assert.equal(card.querySelector('.fab-kicker').textContent, 'Ingredient set');
    const field = card.querySelector('input.fabricate-set-card-name');
    assert.equal(field.value, 'Gold');
    assert.equal(field.getAttribute('aria-label'), 'Ingredient set name');
    assert.equal(field.getAttribute('placeholder'), 'Set 1');
    assert.equal(field.getAttribute('data-recipe-set-field'), 'name');
  });

  it('names the field for its kicker by default, and titles it with the full name', async () => {
    let target = await harness.mount({ kicker: 'Result set', name: 'A very long blade name' });
    let field = target.querySelector('input.fabricate-set-card-name');
    assert.equal(field.getAttribute('aria-label'), 'Result set name');
    assert.equal(field.getAttribute('title'), 'A very long blade name');
    harness.remount();
    target = await harness.mount({ kicker: 'Ingredient set', namePlaceholder: 'Set 2' });
    field = target.querySelector('input.fabricate-set-card-name');
    assert.equal(field.getAttribute('aria-label'), 'Ingredient set name');
    assert.ok(!field.hasAttribute('title'), 'an unnamed set has no title to repeat');
  });

  it("draws a step lower under surface 'inset'", async () => {
    const target = await harness.mount({ name: 'Gold', surface: 'inset' });
    assert.ok(target.querySelector('.fabricate-set-card').classList.contains('is-inset'));
    harness.remount();
    const plain = await harness.mount({ name: 'Gold' });
    assert.ok(!plain.querySelector('.fabricate-set-card').classList.contains('is-inset'));
  });

  it("renames on change, and an input event alone emits nothing under 'change'", async () => {
    const renamed = [];
    const target = await harness.mount({
      name: 'Gold',
      nameLabel: 'Set name',
      onRename: (next) => {
        renamed.push(next);
      },
    });
    const field = target.querySelector('input.fabricate-set-card-name');
    edit(field, 'Gol', 'input');
    assert.deepEqual(renamed, [], 'typing alone writes nothing');
    edit(field, 'Golden', 'change');
    assert.deepEqual(renamed, ['Golden']);
  });

  it("renames on every input under renameOn 'input'", async () => {
    const renamed = [];
    const target = await harness.mount({
      name: 'Gold',
      nameLabel: 'Set name',
      renameOn: 'input',
      onRename: (next) => {
        renamed.push(next);
      },
    });
    const field = target.querySelector('input.fabricate-set-card-name');
    edit(field, 'G', 'input');
    edit(field, 'Gr', 'input');
    assert.deepEqual(renamed, ['G', 'Gr']);
  });

  it('restores the name when onRename refuses the edit', async () => {
    const target = await harness.mount({
      name: 'Gold',
      nameLabel: 'Set name',
      onRename: (next) => (next.trim() ? undefined : false),
    });
    const field = target.querySelector('input.fabricate-set-card-name');
    edit(field, ' '.repeat(3), 'change');
    assert.equal(field.value, 'Gold', 'a refused rename restores the stored name');
    edit(field, 'Silver', 'change');
    assert.equal(field.value, 'Silver', 'an accepted one stays as typed');
  });

  it('inerts the field and the kebab when disabled', async () => {
    const target = await harness.mount({
      name: 'Gold',
      nameLabel: 'Set name',
      disabled: true,
      actions: [{ id: 'remove', label: 'Remove', danger: true }],
    });
    assert.ok(target.querySelector('input.fabricate-set-card-name').disabled);
    assert.ok(target.querySelector('[data-set-card-actions]').disabled);
  });

  it('places meta in the head, then sources, the rows, the adder and the note', async () => {
    const target = await harness.mount({
      name: 'Ring',
      nameLabel: 'Result set name',
      meta: snippet('<span data-meta>3</span>'),
      sources: snippet('<span data-sources>Produced by</span>'),
      children: snippet('<p data-rows>rows</p>'),
      adder: snippet('<button type="button" data-adder>Result</button>'),
      note: snippet('<p data-note>shared</p>'),
    });
    const card = target.querySelector('.fabricate-set-card');
    const head = card.querySelector('.fabricate-set-card-head');
    assert.ok(
      Boolean(head.querySelector(':scope > .fabricate-set-card-meta > [data-meta]')),
      'meta is in the head'
    );
    assert.deepEqual(
      [...card.children].map((child) => child.className),
      [
        'fabricate-set-card-head',
        'fabricate-set-card-sources',
        'fabricate-set-card-body',
        'fabricate-set-card-adder',
        'fabricate-set-card-note',
      ]
    );
  });
});

describe('SetCard: the kebab', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('names the kebab for the set and emits the chosen id, stamping each item’s hooks', async () => {
    const chosen = [];
    const target = await harness.mount({
      name: 'Gold',
      nameLabel: 'Set name',
      actions: [
        {
          id: 'duplicate',
          label: 'Duplicate',
          data: { 'data-recipe-duplicate': 'ingredient-set' },
        },
        {
          id: 'remove',
          label: 'Remove',
          danger: true,
          data: { 'data-recipe-remove': 'ingredient-set' },
        },
      ],
      onAction: (id) => {
        chosen.push(id);
      },
    });
    const trigger = target.querySelector('[data-set-card-actions]');
    assert.equal(trigger.getAttribute('aria-label'), 'Actions for Gold');
    await openMenu(target);
    assert.ok(
      Boolean(target.querySelector('[role="menuitem"][data-recipe-duplicate="ingredient-set"]'))
    );
    const remove = target.querySelector('[role="menuitem"][data-recipe-remove="ingredient-set"]');
    assert.ok(remove.classList.contains('is-danger'));
    remove.click();
    await settle();
    assert.deepEqual(chosen, ['remove']);
  });

  it('names an unnamed set’s kebab by its placeholder, and draws no kebab without actions', async () => {
    let target = await harness.mount({
      namePlaceholder: 'Set 2',
      nameLabel: 'Set name',
      actions: [{ id: 'remove', label: 'Remove' }],
    });
    assert.equal(
      target.querySelector('[data-set-card-actions]').getAttribute('aria-label'),
      'Actions for Set 2'
    );
    harness.remount();
    target = await harness.mount({ name: 'Gold', nameLabel: 'Set name' });
    assert.ok(!target.querySelector('[data-set-card-actions]'), 'no actions, no kebab');
  });
});

describe('SetCard: the reserved and bare forms', () => {
  before(() => harness.setup());
  after(() => harness.teardown());
  afterEach(() => harness.remount());

  it('draws the reserved role with a lock, a static name and a badge, and no field or kebab', async () => {
    const target = await harness.mount({
      variant: 'reserved',
      tone: 'danger',
      kicker: 'Result set',
      name: 'On a failed check',
      nameLabel: 'Result set name',
      nameProps: { 'data-recipe-result-set-static-label': '' },
      actions: [{ id: 'remove', label: 'Remove', danger: true }],
      sources: snippet('<span data-sources>Produced by a failed check</span>'),
    });
    const card = target.querySelector('.fabricate-set-card');
    assert.ok(card.classList.contains('is-reserved') && card.classList.contains('is-danger'));
    assert.ok(!card.querySelector('input'), 'a reserved set has no name field');
    assert.ok(!card.querySelector('[data-set-card-actions]'), 'nor a kebab');
    const name = card.querySelector('[data-recipe-result-set-static-label]');
    assert.ok(name.classList.contains('fabricate-set-card-name'));
    assert.equal(name.textContent, 'On a failed check');
    assert.ok(Boolean(name.querySelector('i.fa-lock')), 'the lock says which sets are reserved');
    const badge = card.querySelector('[data-set-card-reserved]');
    assert.equal(badge.textContent, 'reserved role');
    assert.ok(badge.classList.contains('is-danger'), 'the badge takes the danger tone');
    assert.ok(
      card.querySelector('.fabricate-set-card-sources').nextElementSibling.contains(badge),
      'the badge follows the sources line'
    );
  });

  it('draws a success-toned reserved badge in the default tone', async () => {
    const target = await harness.mount({
      variant: 'reserved',
      tone: 'success',
      name: 'On success',
      nameLabel: 'Result set name',
      reservedLabel: 'reserved',
    });
    const badge = target.querySelector('[data-set-card-reserved]');
    assert.equal(badge.textContent, 'reserved');
    assert.ok(!badge.classList.contains('is-danger'));
  });

  it('draws only the rows and the adder in the bare form', async () => {
    const target = await harness.mount({
      variant: 'bare',
      name: 'Gold',
      nameLabel: 'Set name',
      actions: [{ id: 'remove', label: 'Remove' }],
      sources: snippet('<span data-sources>Produced by</span>'),
      children: snippet('<p data-rows>rows</p>'),
      adder: snippet('<button type="button" data-adder>Component</button>'),
      note: snippet('<p data-note>note</p>'),
    });
    const card = target.querySelector('.fabricate-set-card');
    assert.ok(card.classList.contains('is-bare'));
    assert.deepEqual(
      [...card.children].map((child) => child.className),
      ['fabricate-set-card-body', 'fabricate-set-card-adder']
    );
  });
});

describe('SetCard: focus after a removal', () => {
  before(() => listHarness.setup());
  after(() => listHarness.teardown());
  afterEach(() => listHarness.remount());

  const cardOf = (target, id) => target.querySelector(`[data-host-set="${id}"]`);
  const focused = (node) => Boolean(node) && document.activeElement === node;

  async function remove(target, id) {
    await openMenu(cardOf(target, id));
    menuItem(target, 'Remove').click();
    await settle();
  }

  it('binds each card’s root', async () => {
    const target = await listHarness.mount({ names: ['Gold', 'Silver'] });
    assert.equal(target.querySelector('[data-host-bound]').textContent, '2');
  });

  it('moves focus to the next card’s name, else the previous card’s', async () => {
    const target = await listHarness.mount({ names: ['Gold', 'Silver', 'Copper'] });
    await remove(target, 's1');
    assert.ok(!cardOf(target, 's1'), 'the set is gone');
    assert.ok(focused(cardOf(target, 's2').querySelector('input')), 'the next card’s name');

    await remove(target, 's2');
    assert.ok(focused(cardOf(target, 's0').querySelector('input')), 'the previous card’s name');
  });

  it('moves focus to the scope’s fallback when no card remains', async () => {
    const target = await listHarness.mount({ names: ['Gold'] });
    await remove(target, 's0');
    assert.ok(document.activeElement.hasAttribute('data-set-card-remove-fallback'));
  });

  it('skips a neighbour with no name field', async () => {
    const target = await listHarness.mount({ names: ['Gold', 'Silver', 'Ruin'], reservedAt: 2 });
    await remove(target, 's1');
    assert.ok(focused(cardOf(target, 's0').querySelector('input')), 'past the reserved card');
  });

  it('re-finds the scope’s fallback when the removal re-renders the list bare', async () => {
    const target = await listHarness.mount({ names: ['Gold', 'Silver'], collapse: 'fallback' });
    await remove(target, 's0');
    assert.ok(cardOf(target, 's1').classList.contains('is-bare'), 'the survivor is drawn bare');
    assert.ok(
      document.activeElement.hasAttribute('data-host-bare-add'),
      'the bare branch’s own Add, not the body'
    );
  });

  it('falls back to the scope’s first adder when the bare branch stamps no fallback', async () => {
    const target = await listHarness.mount({ names: ['Gold', 'Silver'], collapse: 'adder' });
    await remove(target, 's1');
    assert.ok(document.activeElement.matches('[data-recipe-add="item"]'), 'the bare set’s adder');
  });

  it('leaves focus to the menu after an item that is not danger', async () => {
    const target = await listHarness.mount({ names: ['Gold', 'Silver'] });
    await openMenu(cardOf(target, 's1'));
    menuItem(target, 'Duplicate').click();
    await settle();
    assert.ok(
      focused(cardOf(target, 's1').querySelector('[data-set-card-actions]')),
      'Duplicate keeps no card from the document, so the menu returns focus to its trigger'
    );
  });

  it('leaves focus to the menu when the caller keeps the card', async () => {
    const target = await listHarness.mount({ names: ['Gold', 'Silver'], refuse: true });
    await remove(target, 's0');
    assert.ok(Boolean(cardOf(target, 's0')), 'the refused set stays');
    assert.ok(
      focused(cardOf(target, 's0').querySelector('[data-set-card-actions]')),
      'the menu returns focus to its trigger'
    );
  });
});
