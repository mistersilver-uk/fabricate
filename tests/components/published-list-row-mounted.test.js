/**
 * The published `ListRow` on Fabricate's real Svelte runtime (issue 2784), through a fresh seam
 * registered with the adapter's own table, under a Fabricate window root: the read-only row it
 * draws without `onOpen`, the whole-row button it draws with it, named by its own text, each
 * published key's mark and its removal on `update`, a press and its argument-free `onOpen`, the
 * native `disabled`, the rest keys on the root, and every refusal the entry adds.
 * Limit: happy-dom does not press a button on Enter or Space, so a press is a `click`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  CALLBACK_REPORT,
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  companionTarget,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const REFUSAL = 'Fabricate | published components: ';
const NAME = 'Iron ingot';
const ROOT = 'fabricate-list-row';

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-list-row-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let targets;
let stopRecording;

const ui = () =>
  shippedSeam({
    ...seamParts,
    report: (...args) => {
      reports.push(args);
    },
  });

before(async () => {
  await harness.setup();
  const { publishedComponentRuntime: runtime, COMPONENTS: components } =
    await harness.loadRuneModule(PUBLISHED_ADAPTER);
  const { createPublishedComponents } = await harness.loadRawModule(PUBLISHED_SEAM);
  seamParts = { createPublishedComponents, runtime, components, loaders: harnessLoaders(harness) };
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  targets = [];
});

afterEach(() => {
  for (const shell of targets) shell.remove();
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/** A row mounted with `props` over a name: its target, its handle, `row()` and `button()`. */
function mountRow(props = {}) {
  const target = fabricateTarget(targets);
  const handle = ui().mount('ListRow', { target, props: { name: NAME, ...props } });
  return {
    target,
    handle,
    row: () => target.querySelector(`.${ROOT}`),
    button: () => target.querySelector('button'),
  };
}

/** A row with a recording `onOpen`, which draws the whole-row button. */
function mountOpenable(props = {}) {
  const press = recorder();
  return { ...mountRow({ onOpen: press.record, ...props }), calls: press.calls };
}

/** A class list in one order, so two forms that write the same set compare equal. */
const sorted = (list) => [...list].sort((left, right) => left.localeCompare(right));
const authoredClasses = (node) => [...node.classList].filter((name) => !name.startsWith('svelte-'));
const textOf = (node, selector) => node.querySelector(selector)?.textContent ?? null;
/** The row's glyph mark, drawn where it has no art. */
const glyphOf = (node) => node.querySelector(':scope .fab-medallion i');

/** The refusal `mount` throws for `props` over a name, with nothing rendered. */
function assertRefused(props, tail) {
  const target = fabricateTarget(targets);
  assert.throws(() => ui().mount('ListRow', { target, props: { name: NAME, ...props } }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

describe('the published ListRow without onOpen', () => {
  it('draws one read-only row: the mark, the name, the detail and the quantity, and nothing focusable', async () => {
    const { target, handle, row } = mountRow({ detail: '2 lb', quantity: 3 });
    await settle();
    assert.equal(target.children.length, 1, 'one element drawn directly in target');
    assert.ok(row() === target.firstElementChild, 'and it is the row');
    assert.deepEqual(authoredClasses(row()), [ROOT]);
    assert.equal(row().getAttribute('data-list-row'), 'dense');
    assert.equal(textOf(row(), '.fabricate-list-row-name'), NAME);
    assert.equal(row().querySelector('.fabricate-list-row-name').getAttribute('title'), NAME);
    assert.equal(textOf(row(), '.fabricate-list-row-detail'), '2 lb');
    assert.equal(textOf(row(), '.fabricate-list-row-quantity'), '3');
    assert.deepEqual(authoredClasses(glyphOf(row())), ['fas', 'fa-box'], 'the default glyph');
    assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 0);
    handle.destroy();
    assert.equal(target.childNodes.length, 0);
    assert.deepEqual(reports, []);
  });

  it('draws a quantity of 0, and no detail or quantity element for an omitted one', async () => {
    const zero = mountRow({ quantity: 0 });
    const bare = mountRow();
    await settle();
    assert.equal(textOf(zero.row(), '.fabricate-list-row-quantity'), '0');
    assert.equal(textOf(bare.row(), '.fabricate-list-row-quantity'), null);
    assert.equal(textOf(bare.row(), '.fabricate-list-row-detail'), null);
    zero.handle.destroy();
    bare.handle.destroy();
  });

  it('draws art as the mark, else the glyph, and its text never as markup', async () => {
    const art = mountRow({ art: 'icons/svg/item-bag.svg', icon: 'fas fa-gem' });
    const glyph = mountRow({ icon: 'fas fa-gem', name: 'Rename <b>Iron</b>' });
    await settle();
    const portrait = art.row().querySelector(':scope .fab-medallion img');
    assert.equal(portrait.getAttribute('src'), 'icons/svg/item-bag.svg');
    assert.equal(portrait.getAttribute('alt'), '', 'decorative');
    assert.ok(!glyphOf(art.row()), 'and no glyph beside it');
    assert.deepEqual(authoredClasses(glyphOf(glyph.row())), ['fas', 'fa-gem']);
    assert.equal(glyphOf(glyph.row()).getAttribute('aria-hidden'), 'true');
    assert.equal(textOf(glyph.row(), '.fabricate-list-row-name'), 'Rename <b>Iron</b>');
    assert.ok(!glyph.target.querySelector('b'), 'never parsed as markup');
    art.handle.destroy();
    glyph.handle.destroy();
  });

  // Each form's root: the read-only row's, and the button's, whose update keeps `onOpen`.
  const FORMS = Object.freeze([
    ['the read-only row', mountRow, [ROOT], {}],
    ['the button row', mountOpenable, [ROOT, 'is-form'], { onOpen() {} }],
  ]);
  for (const [form, mount, base, kept] of FORMS) {
    for (const [claim, props, classes] of [
      ['tone positive', { tone: 'positive' }, ['is-positive']],
      ['tone danger', { tone: 'danger' }, ['is-danger']],
      ['tone neutral', { tone: 'neutral' }, []],
      ['a tone outside its set', { tone: 'warning' }, []],
      ['muted', { muted: true }, ['is-muted']],
    ]) {
      it(`writes ${JSON.stringify(classes)} beside ${form}'s root for ${claim}, and an update without it removes it`, async () => {
        const { handle, row } = mount(props);
        await settle();
        const node = row();
        assert.deepEqual(sorted(authoredClasses(node)), sorted([...base, ...classes]));
        assert.equal(handle.update({ name: NAME, ...kept }), true);
        await settle();
        assert.ok(row() === node, 'the same root');
        assert.deepEqual(sorted(authoredClasses(node)), sorted(base), 'replace, not merge');
        handle.destroy();
      });
    }
  }

  it('writes the tint on the mark, and an update without it removes it', async () => {
    const { handle, row } = mountRow({ tint: 'azure' });
    await settle();
    const mark = row().querySelector(':scope .fab-medallion');
    assert.equal(mark.getAttribute('data-medallion-tint'), 'azure');
    assert.equal(mark.style.getPropertyValue('--fab-medallion-tint'), 'var(--fab-tag-azure)');
    assert.equal(handle.update({ name: NAME }), true);
    await settle();
    assert.ok(!mark.hasAttribute('data-medallion-tint'), 'the hook is removed');
    assert.equal(mark.style.getPropertyValue('--fab-medallion-tint'), '', 'so is the token');
    handle.destroy();
  });

  it('lands a rest data attribute on the root, where its own data-list-row wins', async () => {
    const { handle, row } = mountRow({ 'data-acme-reagent': 'iron', 'data-list-row': 'mine' });
    await settle();
    assert.equal(row().getAttribute('data-acme-reagent'), 'iron');
    assert.equal(row().getAttribute('data-list-row'), 'dense');
    handle.destroy();
  });
});

describe('the published ListRow with onOpen', () => {
  it('draws the whole row as one native button, typed, marked for keyboard focus, holding the row’s text', async () => {
    const { target, handle, row, button } = mountOpenable({ detail: '2 lb', quantity: 3 });
    await settle();
    assert.deepEqual(authoredClasses(row()), [ROOT, 'is-form']);
    assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
    const drawn = button();
    assert.ok(drawn.parentElement === row(), 'a child of the row');
    assert.deepEqual(authoredClasses(drawn), ['fabricate-list-row-open']);
    assert.equal(drawn.getAttribute('type'), 'button');
    assert.equal(drawn.getAttribute('data-keyboard-focus'), 'true');
    assert.equal(drawn.disabled, false);
    for (const absent of ['aria-pressed', 'aria-describedby', 'aria-label', 'role']) {
      assert.ok(!drawn.hasAttribute(absent), `no ${absent}`);
    }
    assert.equal(textOf(drawn, '.fabricate-list-row-name'), NAME);
    assert.equal(textOf(drawn, '.fabricate-list-row-detail'), '2 lb');
    assert.equal(textOf(drawn, '.fabricate-list-row-quantity'), '3');
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('returns from mount with the button row drawn in full, its form class on the root', () => {
    const { handle, row, button } = mountOpenable({ name: NAME });
    assert.ok(Boolean(button()), 'the button, with no settle');
    assert.deepEqual(sorted(authoredClasses(row())), sorted([ROOT, 'is-form']));
    handle.destroy();
  });

  it('draws the read-only row again on an update that omits onOpen, and the button on one that passes it', async () => {
    const { target, handle, row, button } = mountRow();
    await settle();
    const readOnly = row();
    assert.ok(!button(), 'no button without onOpen');
    assert.equal(handle.update({ name: NAME, onOpen() {} }), true);
    await settle();
    assert.ok(Boolean(button()), 'the button with it');
    assert.ok(row().classList.contains('is-form'));
    assert.ok(row() === readOnly, 'drawn in the same row');
    assert.equal(handle.update({ name: NAME }), true);
    await settle();
    assert.ok(!button(), 'and none again');
    assert.deepEqual(authoredClasses(row()), [ROOT]);
    assert.ok(row() === readOnly, 'the row is kept');
    assert.equal(target.children.length, 1);
    handle.destroy();
  });

  for (const [selected, pressed] of [
    [true, 'true'],
    [false, 'false'],
  ]) {
    it(`writes aria-pressed "${pressed}" for selected ${selected}, and an update without it removes it`, async () => {
      const { handle, button } = mountOpenable({ selected });
      await settle();
      const node = button();
      assert.equal(node.getAttribute('aria-pressed'), pressed);
      assert.equal(handle.update({ name: NAME, onOpen() {} }), true);
      await settle();
      assert.ok(button() === node, 'the same button node');
      assert.ok(!node.hasAttribute('aria-pressed'), 'removed, on that node');
      handle.destroy();
    });
  }

  it('reads a selected that is no boolean as pressed only when it is true, and null as absent', async () => {
    const { handle, button } = mountOpenable({ selected: 'true' });
    await settle();
    assert.equal(button().getAttribute('aria-pressed'), 'false');
    assert.equal(handle.update({ name: NAME, onOpen() {}, selected: null }), true);
    await settle();
    assert.ok(!button().hasAttribute('aria-pressed'), 'null writes no aria-pressed');
    handle.destroy();
  });

  it('lands a rest data attribute on the button row’s root, where its own data-list-row wins', async () => {
    const { handle, row, button } = mountOpenable({
      'data-acme-reagent': 'iron',
      'data-list-row': 'mine',
    });
    await settle();
    assert.ok(button().parentElement === row(), 'the root that holds the button');
    assert.equal(row().getAttribute('data-acme-reagent'), 'iron');
    assert.equal(row().getAttribute('data-list-row'), 'dense');
    assert.ok(!button().hasAttribute('data-acme-reagent'), 'and not the button');
    handle.destroy();
  });

  it('mounts the docs section’s worked list as written, the pressed row keeping its button and focus', async () => {
    const reagents = [
      { id: 'iron', name: 'Iron ingot', kind: 'Metal', quantity: 3, img: 'icons/svg/item-bag.svg' },
      { id: 'salt', name: 'Ember salt', kind: 'Mineral', quantity: 1, img: '' },
    ];
    const list = fabricateTarget(targets);
    const fabUi = ui();
    let selectedId = null;
    const props = (reagent) => ({
      name: reagent.name,
      detail: reagent.kind,
      quantity: reagent.quantity,
      art: reagent.img,
      selected: reagent.id === selectedId,
      onOpen: () => select(reagent.id),
      'data-acme-reagent': reagent.id,
    });
    const rows = reagents.map((reagent) => {
      const target = list.ownerDocument.createElement('li');
      list.append(target);
      return fabUi.mount('ListRow', { target, props: props(reagent) });
    });
    function select(id) {
      selectedId = id;
      for (const [index, row] of rows.entries()) row.update(props(reagents[index]));
    }
    await settle();
    const buttons = () => [...list.querySelectorAll('button')];
    const salt = buttons()[1];
    salt.focus();
    salt.click();
    await settle();
    assert.deepEqual(
      buttons().map((node) => node.getAttribute('aria-pressed')),
      ['false', 'true']
    );
    assert.ok(buttons()[1] === salt && document.activeElement === salt, 'the same focused button');
    assert.equal(salt.closest('[data-acme-reagent]').getAttribute('data-acme-reagent'), 'salt');
    for (const row of rows) row.destroy();
    assert.deepEqual(reports, []);
  });
});

describe('the published ListRow names', () => {
  it('names its button by its own text: the name, then the detail and the quantity', async () => {
    const { handle, button } = mountOpenable({ detail: '2 lb', quantity: 3 });
    await settle();
    assert.equal(
      button().textContent.replaceAll(/\s+/g, ''),
      `${NAME}2 lb3`.replaceAll(/\s+/g, '')
    );
    assert.ok(!button().hasAttribute('aria-label'), 'and no other name source');
    assert.equal(button().querySelector('.fabricate-list-row-name').getAttribute('title'), NAME);
    assert.equal(glyphOf(button()).getAttribute('aria-hidden'), 'true', 'the mark says nothing');
    handle.destroy();
  });
});

describe('a press on the published ListRow', () => {
  it('calls onOpen once, with no argument, though the component hands it the click', async () => {
    const { handle, calls, button } = mountOpenable();
    await settle();
    button().click();
    assert.deepEqual(calls, [[]], 'once, with an empty argument list');
    button().querySelector('.fabricate-list-row-name').click();
    assert.equal(calls.length, 2, 'and on a press of its text');
    handle.destroy();
    assert.deepEqual(reports, []);
  });

  it('keeps the same focused button across an update, and calls only the newest function', async () => {
    const { handle, calls, button } = mountOpenable();
    await settle();
    const node = button();
    node.focus();
    assert.ok(document.activeElement === node, 'the button takes focus');
    const next = recorder();
    assert.equal(handle.update({ name: 'Ember salt', onOpen: next.record, selected: true }), true);
    await settle();
    assert.ok(button() === node, 'the same button node');
    assert.equal(textOf(node, '.fabricate-list-row-name'), 'Ember salt');
    assert.ok(document.activeElement === node, 'focus stays on it');
    node.click();
    assert.deepEqual([calls, next.calls], [[], [[]]], 'the earlier function is not called again');
    handle.destroy();
  });

  const failure = new Error('the companion selection failed');
  it('reports an onOpen that throws once, and stays drawn and live', async () => {
    const { handle, button } = mountOpenable({
      onOpen: () => {
        throw failure;
      },
    });
    await settle();
    button().click();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'ListRow', 'onOpen', failure]]);
    assert.ok(Boolean(button()), 'the button is still drawn');
    handle.destroy();
  });
});

describe('the published ListRow, disabled', () => {
  it('writes the native attribute, calls nothing, and enables on an update', async () => {
    const { handle, calls, button } = mountOpenable({ disabled: true });
    await settle();
    assert.equal(button().disabled, true);
    assert.ok(!button().hasAttribute('aria-disabled'), 'no ARIA form of it');
    button().click();
    assert.deepEqual(calls, [], 'a press calls nothing');
    const next = recorder();
    assert.equal(handle.update({ name: NAME, onOpen: next.record }), true);
    await settle();
    assert.equal(button().disabled, false);
    button().click();
    assert.deepEqual(next.calls, [[]]);
    handle.destroy();
  });
});

describe('what the published ListRow refuses', () => {
  for (const key of [
    'density',
    'layout',
    'markSize',
    'truncateName',
    'inset',
    'detailAlign',
    'bodyBasis',
    'openProps',
    'nameClass',
    'leading',
    'badges',
    'meta',
    'children',
    'trailing',
    'class',
    'title',
    'aria-label',
    'aria-pressed',
  ]) {
    it(`refuses ${key}, which it does not publish (M13)`, () => {
      assertRefused({ [key]: 'x' }, `"${key}" is not a data attribute`);
    });
  }

  for (const [claim, props, tail] of [
    ['an absent name (M9)', { name: undefined }, 'ListRow requires a non-empty "name"'],
    ['an empty name (M9)', { name: '' }, 'ListRow requires a non-empty "name"'],
    ['a string for onOpen (M17)', { onOpen: 'open' }, '"onOpen" must be a function'],
  ]) {
    it(`refuses ${claim}, and renders nothing`, () => {
      assertRefused(props, tail);
    });
  }

  it('refuses a target with no Fabricate window ancestor (M16)', () => {
    const target = companionTarget(targets);
    assert.throws(() => ui().mount('ListRow', { target, props: { name: NAME } }), {
      name: 'TypeError',
      message: `${REFUSAL}ListRow needs a Fabricate window ancestor`,
    });
    assert.equal(target.childNodes.length, 0);
  });
});
