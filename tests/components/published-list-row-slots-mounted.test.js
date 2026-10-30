/**
 * The published `ListRow`'s `leading`, `badges`, `meta` and `trailing` content slots (issue 2843)
 * on Fabricate's real Svelte runtime, through a fresh seam registered with the adapter's own table,
 * under a Fabricate window root: each `<span>` slot element in its place, its draw, update and
 * removal, the move an `onOpen` toggle or a form flip makes with the element kept connected, the
 * button's name order and description, and the press each slot does or does not reach.
 * Limit: happy-dom paints no layer, so which element a point lands on is `list-row-rendered.test.js`'s.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { recorder } from '../helpers/publishedComponentFakes.js';
import {
  PUBLISHED_ADAPTER,
  PUBLISHED_COMPILED_MODULES,
  PUBLISHED_RAW_MODULES,
  PUBLISHED_RUNE_MODULES,
  PUBLISHED_SEAM,
  fabricateTarget,
  harnessLoaders,
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';

const NAME = 'Moonpetal tincture';
const ROOT = 'fabricate-list-row';
const IN_BUTTON = Object.freeze(['leading', 'badges', 'meta']);
const KEYS = Object.freeze([...IN_BUTTON, 'trailing']);
const HOST = (key) => `fabricate-list-row-${key}`;

const harness = createMountedComponentHarness({
  repoRoot: resolve(import.meta.dirname, '../..'),
  tmpPrefix: 'fabricate-published-list-row-slots-',
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
  assert.deepEqual(reports, [], 'nothing was reported');
});

/** A row mounted over a name with `props`, `slots` of its four keys requested, through `fabUi`. */
function mountRow(props = {}, slots = [], fabUi = ui()) {
  const target = fabricateTarget(targets);
  const requested = Object.fromEntries(slots.map((key) => [key, true]));
  const handle = fabUi.mount('ListRow', { target, props: { name: NAME, ...requested, ...props } });
  const keep = { name: NAME, ...requested, ...props };
  return {
    target,
    handle,
    keep,
    row: () => target.querySelector(`.${ROOT}`),
    host: (key) => target.querySelector(`.${HOST(key)}`),
    button: () => target.querySelector('button.fabricate-list-row-open'),
  };
}

/** Appends the companion's one element, a `<span>` of `text`, to the slot element of `key`. */
function draw(handle, key, text = `${key} text`) {
  const element = handle.slot(key).ownerDocument.createElement('span');
  element.textContent = text;
  handle.slot(key).append(element);
  return element;
}

/** Appends the companion's one control to the `trailing` slot element, as its group states it. */
function drawControl(handle) {
  const control = handle.slot('trailing').ownerDocument.createElement('button');
  control.type = 'button';
  control.setAttribute('data-keyboard-focus', 'true');
  control.textContent = 'Edit';
  handle.slot('trailing').append(control);
  return control;
}

/** `props` with an `onOpen` when `open`, and without the key otherwise, as an `update` omits it. */
function opening(props, open) {
  const next = { ...props };
  delete next.onOpen;
  return open ? { ...next, onOpen() {} } : next;
}

/** The text of `node` with its whitespace gone, so a name compares as the words it holds. */
const wordsOf = (node) => node.textContent.replaceAll(/\s+/g, '');

describe('each published ListRow slot, drawn', () => {
  for (const key of KEYS) {
    for (const [form, props] of [
      ['the read-only row', {}],
      ['the button row', { onOpen() {} }],
    ]) {
      it(`draws a <span> ${key} slot element in ${form}, holding the companion's element`, async () => {
        const { handle, row, host } = mountRow(props, [key]);
        await settle();
        const slot = handle.slot(key);
        assert.equal(slot.localName, 'span');
        assert.equal(slot.getAttribute('style'), 'display: contents;', 'no other attribute');
        const line = draw(handle, key);
        assert.ok(row().contains(slot) && slot.contains(line), 'drawn in the row');
        if (key === 'trailing' && !props.onOpen) {
          assert.ok(!host(key), 'bare, without the wrapper');
          assert.ok(slot.parentElement.parentElement === row(), 'a direct child of the root');
        } else {
          assert.ok(host(key).contains(slot), `in the ${HOST(key)} wrapper`);
        }
        handle.destroy();
      });
    }
  }

  it('draws each slot where its group states it', async () => {
    const { handle, row, host, button } = mountRow({ onOpen() {} }, KEYS);
    await settle();
    const [leading, badges, meta, trailing] = KEYS.map((key) => host(key));
    assert.ok(leading.parentElement === button(), 'leading is the first child of the button');
    assert.ok(button().firstElementChild === leading, 'before the name');
    assert.ok(badges.previousElementSibling.matches('.fabricate-list-row-name'), 'badges follow');
    assert.ok(badges.parentElement.matches('.fabricate-list-row-head'), 'the name on its line');
    assert.ok(meta.parentElement.matches('.fabricate-list-row-body'), 'meta beneath that line');
    assert.ok(trailing.parentElement === row(), 'trailing is a child of the root');
    assert.ok(row().firstElementChild === button(), 'after the button');
    assert.ok(trailing.previousElementSibling === button(), 'the control beside it');
    handle.destroy();
  });

  it('draws the selectable form at its inset for leading, badges and meta, and not for trailing alone', async () => {
    for (const key of KEYS) {
      const { handle, row } = mountRow({}, [key]);
      await settle();
      assert.equal(row().classList.contains('is-form'), key !== 'trailing', key);
      handle.destroy();
    }
  });

  it('draws nothing focusable of its own, with every slot requested', async () => {
    const { target, handle } = mountRow({ onOpen() {} }, KEYS);
    await settle();
    assert.equal(target.querySelectorAll('button, a, input, [tabindex]').length, 1);
    handle.destroy();
  });

  it('ignores art, icon and tint while leading is requested, and draws the mark again without it', async () => {
    const props = { art: 'icons/svg/item-bag.svg', icon: 'fas fa-flask', tint: 'amber' };
    const { handle, row } = mountRow(props, ['leading']);
    await settle();
    assert.ok(!row().querySelector('.fab-medallion'), 'no mark');
    assert.ok(!row().querySelector('img, i'), 'no art or glyph');
    assert.equal(handle.update({ name: NAME, ...props }), true);
    await settle();
    assert.ok(row().querySelector('.fab-medallion'), 'the mark follows leading');
    handle.destroy();
  });

  it('refuses a value that is not a boolean for each key (M15), and renders nothing', () => {
    for (const key of KEYS) {
      for (const value of ['yes', 1, null]) {
        const target = fabricateTarget(targets);
        assert.throws(
          () => ui().mount('ListRow', { target, props: { name: NAME, [key]: value } }),
          {
            name: 'TypeError',
            message: new RegExp(`"${key}" is a slot and takes true or false$`),
          }
        );
        assert.equal(target.childNodes.length, 0);
      }
    }
  });

  it('still refuses children and openProps', () => {
    for (const key of ['children', 'openProps']) {
      const target = fabricateTarget(targets);
      assert.throws(() => ui().mount('ListRow', { target, props: { name: NAME, [key]: true } }), {
        name: 'TypeError',
        message: new RegExp(`"${key}" is not a data attribute$`),
      });
      assert.equal(target.childNodes.length, 0);
    }
  });
});

describe('a published mount in a published ListRow slot', () => {
  it('holds a Medallion in leading, a Chip in badges and an IconButton in trailing, ended with the row', async () => {
    const fabUi = ui();
    const { handle, host, button } = mountRow(
      { onOpen() {} },
      ['leading', 'badges', 'trailing'],
      fabUi
    );
    await settle();
    const nested = [
      ['leading', 'Medallion', { icon: 'fas fa-flask', size: 30 }, '.fab-medallion'],
      ['badges', 'Chip', { children: 'Fresh', tone: 'positive' }, '.manager-chip'],
      [
        'trailing',
        'IconButton',
        { icon: 'fas fa-pen', ariaLabel: 'Rename Moonpetal tincture', size: '24', onclick() {} },
        'button',
      ],
    ].map(([key, name, props, root]) => {
      const mountTarget = handle.slot(key).ownerDocument.createElement('span');
      handle.slot(key).append(mountTarget);
      return { key, root, mountTarget, mounted: fabUi.mount(name, { target: mountTarget, props }) };
    });
    await settle();
    for (const { key, root, mountTarget } of nested) {
      assert.ok(host(key).contains(mountTarget.querySelector(root)), `${key} holds its mount`);
    }
    assert.ok(button().contains(host('leading')) && !button().contains(host('trailing')));
    handle.destroy();
    await settle();
    for (const { key, mountTarget, mounted } of nested) {
      assert.equal(mountTarget.childNodes.length, 0, `the ${key} mount ended with the row`);
      assert.equal(mounted.update({}), false, 'and is no longer live');
    }
  });
});

describe('each published ListRow slot, updated and removed', () => {
  for (const key of KEYS) {
    it(`detaches the ${key} element with its content on an update that omits it, and attaches the same one again`, async () => {
      const { handle, host, keep } = mountRow({ onOpen() {} }, [key]);
      await settle();
      const slot = handle.slot(key);
      const line = draw(handle, key);
      const without = { ...keep };
      delete without[key];
      assert.equal(handle.update(without), true);
      await settle();
      assert.ok(!host(key), 'no host');
      assert.equal(slot.isConnected, false, 'the slot element is detached');
      assert.ok(handle.slot(key) === slot && slot.contains(line), 'kept, with its content');
      assert.equal(handle.update(keep), true);
      await settle();
      assert.ok(slot.isConnected && slot.contains(line), 'the same element, attached again');
      assert.ok(host(key).contains(slot));
      handle.destroy();
    });

    it(`keeps the ${key} element in place while an update changes the name, detail, quantity or selection`, async () => {
      const { handle, host, keep } = mountRow({ onOpen() {} }, [key]);
      await settle();
      const place = host(key);
      const slot = handle.slot(key);
      const line = draw(handle, key);
      for (const next of [
        { detail: 'Stage 2 of 3' },
        { quantity: 3 },
        { selected: true },
        { name: 'Ember salt reserve', selected: false },
      ]) {
        assert.equal(handle.update({ ...keep, ...next }), true);
        await settle();
        assert.ok(host(key) === place, 'the same host');
        assert.ok(place.contains(slot) && slot.contains(line), 'holding the same slot');
      }
      handle.destroy();
    });
  }

  it('ends every slot element with the row', async () => {
    const { handle, row } = mountRow({ onOpen() {} }, KEYS);
    await settle();
    for (const key of KEYS) draw(handle, key);
    handle.destroy();
    assert.ok(!row(), 'the row is removed');
    for (const key of KEYS) assert.equal(handle.slot(key), null, `${key} after destroy`);
  });
});

describe('the move a published ListRow makes', () => {
  /** Whether `slot` is connected, holds `line` and lies inside `place`. */
  const held = (slot, line, place) =>
    slot.isConnected && slot.contains(line) && Boolean(place?.contains(slot));

  it('moves leading, badges and meta with an onOpen toggle, keeping each element connected, its content intact and in the new wrapper', async () => {
    const { target, handle, row, host, button, keep } = mountRow({ onOpen() {} }, IN_BUTTON);
    await settle();
    const slots = IN_BUTTON.map((key) => handle.slot(key));
    const lines = IN_BUTTON.map((key) => draw(handle, key));
    const root = row();
    for (const open of [false, true, false]) {
      assert.equal(handle.update(opening(keep, open)), true);
      await settle();
      assert.equal(Boolean(button()), open, 'the button follows onOpen');
      assert.ok(row() === root, 'the one row');
      for (const [at, key] of IN_BUTTON.entries()) {
        assert.ok(held(slots[at], lines[at], host(key)), `${key} sits in the new wrapper`);
        assert.equal(target.querySelectorAll(`.${HOST(key)}`).length, 1, `one ${key} wrapper`);
        assert.equal(
          Boolean(button()?.contains(host(key))),
          open,
          `${key} in the button only with onOpen`
        );
      }
    }
    handle.destroy();
  });

  it('keeps aside where it is across the same toggle', async () => {
    const { handle, host, row, keep } = mountRow({ onOpen() {} }, ['aside', 'leading']);
    await settle();
    const aside = row().querySelector('.fabricate-list-row-aside');
    const slot = handle.slot('aside');
    for (const open of [false, true]) {
      assert.equal(handle.update(opening(keep, open)), true);
      await settle();
      assert.ok(row().querySelector('.fabricate-list-row-aside') === aside, 'the same host');
      assert.ok(aside.contains(slot), 'holding the same slot');
      assert.ok(host('leading'), 'while leading moved');
    }
    handle.destroy();
  });

  it('keeps trailing in place across an onOpen toggle while another form key holds the form', async () => {
    const { handle, host, keep } = mountRow({ onOpen() {} }, ['leading', 'trailing']);
    await settle();
    const place = host('trailing');
    const slot = handle.slot('trailing');
    const control = drawControl(handle);
    for (const open of [false, true]) {
      assert.equal(handle.update(opening(keep, open)), true);
      await settle();
      assert.ok(host('trailing') === place, 'the same wrapper');
      assert.ok(place.contains(slot) && slot.contains(control));
    }
    handle.destroy();
  });

  it('moves trailing when the form flips, in either direction, with its content intact', async () => {
    const { handle, row, host, keep } = mountRow({}, ['trailing']);
    await settle();
    const slot = handle.slot('trailing');
    const control = drawControl(handle);
    assert.ok(!host('trailing'), 'bare without the form');
    for (const flip of [{ onOpen() {} }, { meta: true }, { aside: true }, { badges: true }]) {
      assert.equal(handle.update({ ...keep, ...flip }), true);
      await settle();
      assert.ok(
        held(slot, control, host('trailing')),
        `wrapped once ${Object.keys(flip)} is asked`
      );
      assert.equal(row().classList.contains('is-form'), true);
      assert.equal(handle.update(keep), true);
      await settle();
      assert.ok(!host('trailing'), 'and bare once it is dropped');
      assert.ok(slot.isConnected && slot.contains(control), 'still connected, content intact');
      assert.ok(slot.parentElement.parentElement === row(), 'a direct child of the root again');
    }
    handle.destroy();
  });

  it('loses focus in a trailing control when asking aside moves the slot element, which the contract states', async () => {
    const { handle, host } = mountRow({}, ['trailing']);
    await settle();
    const slot = handle.slot('trailing');
    const control = drawControl(handle);
    control.focus();
    assert.ok(document.activeElement === control, 'the control holds focus');
    assert.equal(handle.update({ name: NAME, trailing: true, aside: true }), true);
    await settle();
    assert.ok(held(slot, control, host('trailing')), 'attached again, the control inside');
    assert.ok(document.activeElement !== control, 'and focus is lost');
    handle.destroy();
  });

  it('keeps focus in a trailing control across an update that moves nothing', async () => {
    const { handle, keep } = mountRow({ onOpen() {} }, ['trailing']);
    await settle();
    const control = drawControl(handle);
    control.focus();
    assert.equal(handle.update({ ...keep, selected: true, detail: 'Stage 2 of 3' }), true);
    await settle();
    assert.ok(document.activeElement === control, 'focus stays');
    handle.destroy();
  });
});

describe('what the published ListRow button reads', () => {
  it('names the button leading, the name, badges, meta, the detail and the quantity, in that order', async () => {
    const { handle, button } = mountRow(
      { onOpen() {}, detail: 'Two vials', quantity: 3 },
      IN_BUTTON
    );
    await settle();
    for (const key of IN_BUTTON) draw(handle, key, `<${key}>`);
    assert.equal(
      wordsOf(button()),
      `<leading>${NAME}<badges><meta>Two vials3`.replaceAll(/\s+/g, '')
    );
    assert.ok(!button().hasAttribute('aria-label'), 'and no other name source');
    handle.destroy();
  });

  it('describes the button by meta alone, and by nothing without it', async () => {
    const { handle, host, button } = mountRow({ onOpen() {} }, ['meta', 'leading', 'badges']);
    await settle();
    draw(handle, 'meta', 'Stage 2 of 3');
    assert.equal(button().getAttribute('aria-describedby'), host('meta').id);
    assert.equal(host('meta').textContent.trim(), 'Stage 2 of 3');
    assert.equal(handle.update({ name: NAME, onOpen() {}, leading: true, badges: true }), true);
    await settle();
    assert.ok(!button().hasAttribute('aria-describedby'), 'nothing to describe');
    handle.destroy();
  });
});

describe('a press on the published ListRow slots', () => {
  it('calls onOpen once for a click in leading, badges or meta, as it does for the name', async () => {
    const press = recorder();
    const { handle } = mountRow({ onOpen: press.record }, IN_BUTTON);
    await settle();
    for (const [at, key] of IN_BUTTON.entries()) {
      draw(handle, key).click();
      assert.deepEqual(press.calls.length, at + 1, `${key} calls it once`);
    }
    assert.deepEqual(press.calls, [[], [], []], 'with no argument');
    handle.destroy();
  });

  it('does not call onOpen for a click on a control in trailing, which has its own handler', async () => {
    const press = recorder();
    const own = recorder();
    const { handle } = mountRow({ onOpen: press.record }, ['trailing']);
    await settle();
    const control = drawControl(handle);
    control.addEventListener('click', own.record);
    control.click();
    assert.equal(own.calls.length, 1, 'the control’s own handler runs');
    assert.deepEqual(press.calls, [], 'and onOpen does not');
    handle.destroy();
  });
});
