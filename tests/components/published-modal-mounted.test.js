/**
 * The published `Modal` on Fabricate's real Svelte runtime (issue 2656), through a fresh seam
 * registered with the adapter's own table, under the Fabricate window root it needs, with the
 * module sheet loaded: `open` drawing and removing the dialog only through `update`, the names the
 * companion's strings give it, its two content slots kept across a close, `onClose` reached by the
 * close control, Escape and outside presses, the focus it never moves, the dialog hosted by the
 * `overlayHost` option, the nearest `.fabricate-app` and the standalone layer, a second window,
 * every refusal the entry adds, and both View Lab specimens.
 * Limit: happy-dom activates no button on a key, so a press by key is its click.
 * Limit: happy-dom's synchronous `dispatchEvent` runs no microtask checkpoint between listeners, so
 * no clause here claims what Foundry does after a close made inside `onClose`.
 */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';

import { Window } from 'happy-dom';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { readStylesheet } from '../../scripts/lib/stylesheetSource.js';
import { getCaseById } from '../../scripts/lib/viewLabCases.js';
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
  recordEscapes,
  settle,
  shippedSeam,
} from '../helpers/publishedComponentModules.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  BODY_TEXT,
  DIALOG,
  DONE_LABEL,
  OPENER_LABEL,
  mountModalSpecimen,
} from '../view-lab/fixtures/publishedModalSpecimen.js';

const REPOSITORY = resolve(import.meta.dirname, '../..');
const REFUSAL = 'Fabricate | published components: ';
const LAYER = '.fabricate.fabricate-standalone-overlay';
const DIALOG_HOOK = '[data-manager-modal]';
const REQUIRED = Object.freeze({ title: 'Rename the reagent', closeLabel: 'Close' });
const UNPUBLISHED = Object.freeze([
  'width',
  'dialogProps',
  'trapFocus',
  'initialFocus',
  'footerLayout',
  'onSubmit',
  'class',
  'data-x',
]);
const SELECT = Object.freeze({
  options: [
    { value: 'flask', label: 'Flask' },
    { value: 'vial', label: 'Vial' },
  ],
  ariaLabel: 'Vessel',
});
const PICKER = Object.freeze({
  value: 'fas fa-flask',
  ariaLabel: 'Reagent icon',
  listLabel: 'Reagent icons',
  searchLabel: 'Search reagent icons',
  noMatchesText: 'No reagent icon matches.',
});

const harness = createMountedComponentHarness({
  repoRoot: REPOSITORY,
  tmpPrefix: 'fabricate-published-modal-',
  rawModules: PUBLISHED_RAW_MODULES,
  runeModules: PUBLISHED_RUNE_MODULES,
  compiledModules: PUBLISHED_COMPILED_MODULES,
  componentPath: 'src/ui/svelte/published/PublishedComponentHost.svelte',
});

let seamParts;
let reports;
let escaped;
let shells;
let handles;
let teardowns;
let stopRecording;
let sheet;

/** A fresh seam; a mount nested in another's slot shares its parent's, as a companion's does. */
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
  seamParts = { createPublishedComponents, runtime, components };
  sheet = document.createElement('style');
  sheet.textContent = readStylesheet();
  document.head.append(sheet);
  stopRecording = recordEscapes((error) => {
    escaped.push(error);
  });
});

after(() => {
  stopRecording();
  sheet.remove();
  return harness.teardown();
});

beforeEach(() => {
  reports = [];
  escaped = [];
  shells = [];
  handles = [];
  teardowns = [];
});

afterEach(() => {
  for (const teardown of teardowns) teardown();
  for (const handle of handles) handle.destroy();
  for (const shell of shells) shell.remove();
  assert.ok(!document.querySelector(LAYER), 'no standalone layer outlives its dialog');
  assert.ok(!document.querySelector(DIALOG_HOOK), 'no dialog outlives its mount');
  assert.deepEqual(escaped, [], 'nothing was thrown past the seam');
});

/**
 * An open dialog over `REQUIRED` and both slots, recording `onClose`, mounted with `props` into
 * `target` through `api`: its handle, its props, an `update` that passes them again beside `next`,
 * the recorded calls, and the seam, for a mount nested in its slots.
 */
function mountModal(
  props = {},
  { target = fabricateTarget(shells, 'fabricate fabricate-app'), overlayHost, api = ui() } = {}
) {
  const close = recorder();
  const base = {
    ...REQUIRED,
    open: true,
    body: true,
    footer: true,
    onClose: close.record,
    ...props,
  };
  const handle = api.mount('Modal', { target, props: base, overlayHost });
  handles.push(handle);
  flushSync();
  return {
    api,
    target,
    handle,
    base,
    update: (next = {}) => {
      const done = handle.update({ ...base, ...next });
      flushSync();
      return done;
    },
    calls: close.calls,
  };
}

/** Mounts the published `name` with `props` into a new element of `slot`, through `api`. */
function mountIn(api, slot, name, props) {
  const target = slot.ownerDocument.createElement('div');
  slot.append(target);
  const handle = api.mount(name, { target, props });
  handles.push(handle);
  flushSync();
  return { target, handle };
}

const doc = (node) => node.ownerDocument;
const dialogIn = (owner = document) => owner.querySelector(DIALOG_HOOK);
const closeIn = (owner = document) => dialogIn(owner).querySelector('[data-manager-modal-close]');
const listboxIn = (owner = document) => owner.querySelector('[role="listbox"]');

/** A cancelable, composed keydown of `key` on `element`. */
function press(element, key, init = {}) {
  const { KeyboardEvent } = doc(element).defaultView;
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...init,
  });
  element.dispatchEvent(event);
  flushSync();
  return event;
}

/** A bubbling `type` mouse event on `element`. */
function pointer(element, type) {
  const { MouseEvent } = doc(element).defaultView;
  element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
  flushSync();
}

/** Every bubbling `type` event `nodes` hear, each as `<name>:<key or tag>`. */
function hearing(type, nodes) {
  const heard = [];
  const stops = nodes.map(([name, node]) => {
    const listen = (event) => {
      heard.push(`${name}:${event.key ?? event.target?.tagName}`);
    };
    node.addEventListener(type, listen);
    return () => node.removeEventListener(type, listen);
  });
  return {
    heard,
    stop: () => {
      for (const stop of stops) stop();
    },
  };
}

/** A positioned element of the companion's own, attached inside the Fabricate window `shell`. */
function companionHost(shell) {
  const host = doc(shell).createElement('section');
  host.style.position = 'relative';
  shell.append(host);
  return host;
}

/** A button of the companion's own in `slot`. */
function companionButton(slot, attributes = {}) {
  const button = doc(slot).createElement('button');
  button.type = 'button';
  button.textContent = 'Probe';
  for (const [name, value] of Object.entries(attributes)) button.setAttribute(name, value);
  slot.append(button);
  return button;
}

/** The refusal `mount` throws for `props`, with nothing rendered. */
function assertRefused(props, tail, target = fabricateTarget(shells), overlayHost = undefined) {
  assert.throws(() => ui().mount('Modal', { target, props, overlayHost }), {
    name: 'TypeError',
    message: REFUSAL + tail,
  });
  assert.equal(target.childNodes.length, 0, 'nothing is rendered');
}

const required = () => ({ ...REQUIRED, onClose: () => {} });

describe('the published Modal opens and closes only through update', () => {
  it('draws nothing in target while closed, and one empty element there and the dialog in the host once open', async () => {
    const { target, update } = mountModal({ open: false });
    await settle();
    assert.equal(target.children.length, 0, 'target holds no element while closed');
    assert.ok(!dialogIn(), 'no dialog');
    assert.equal(update({ open: true }), true);
    await settle();
    assert.equal(target.children.length, 1, 'one element of Fabricate’s in target');
    assert.equal(target.firstElementChild.childNodes.length, 0, 'and it is empty');
    const dialog = dialogIn();
    assert.ok(!target.contains(dialog), 'the dialog is drawn outside target');
    assert.ok(dialog.parentElement.parentElement === target.parentElement, 'in the chain’s host');
  });

  it('throws M9 for an update that omits title, and leaves the dialog drawn', async () => {
    const { handle, base } = mountModal();
    await settle();
    const { title, ...untitled } = base;
    assert.equal(title, REQUIRED.title);
    assert.throws(() => handle.update(untitled), {
      name: 'TypeError',
      message: `${REFUSAL}Modal requires a non-empty "title"`,
    });
    flushSync();
    assert.equal(dialogIn()?.getAttribute('aria-label'), REQUIRED.title, 'still drawn');
  });

  it('leaves no container in the host and no standalone layer once an update closes it', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { update } = mountModal({}, { target });
    await settle();
    assert.equal(target.parentElement.children.length, 2, 'target and the container');
    update({ open: false });
    await settle();
    assert.ok(!dialogIn(), 'no dialog');
    assert.equal(target.parentElement.children.length, 1, 'no container in the app root');
    const standalone = mountModal({}, { target: fabricateTarget(shells, 'fabricate') });
    await settle();
    assert.ok(document.querySelector(LAYER), 'the standalone layer while open');
    standalone.update({ open: false });
    await settle();
    assert.ok(!document.querySelector(LAYER), 'no standalone layer once closed');
  });

  it('leaves exactly one dialog and one container after open, close and open', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const { update } = mountModal({}, { target });
    await settle();
    update({ open: false });
    await settle();
    update({ open: true });
    await settle();
    assert.equal(document.querySelectorAll(DIALOG_HOOK).length, 1);
    assert.equal(target.parentElement.children.length, 2, 'target and one container');
  });

  it('leaves no panel in the host when a press on the close control closes it with a slot-mounted published Select’s list open', async () => {
    const { api, handle, update } = mountModal({
      onClose: () => update({ open: false }),
    });
    await settle();
    const { target } = mountIn(api, handle.slot('body'), 'Select', { ...SELECT, onChange() {} });
    target.querySelector('button').click();
    flushSync();
    await settle();
    assert.ok(listboxIn(), 'the list is open');
    pointer(closeIn(), 'mousedown');
    closeIn().click();
    flushSync();
    await settle();
    assert.ok(!dialogIn(), 'the companion closed the dialog');
    assert.ok(!listboxIn(), 'no list is left in the host');
  });

  it('leaves a slot-mounted published Select’s list open in the host when an update closes the dialog, as the group states', async () => {
    const { api, handle, update } = mountModal();
    await settle();
    const { target } = mountIn(api, handle.slot('body'), 'Select', { ...SELECT, onChange() {} });
    target.querySelector('button').click();
    flushSync();
    await settle();
    assert.ok(listboxIn(), 'the list is open');
    update({ open: false });
    flushSync();
    await settle();
    assert.ok(!dialogIn(), 'the dialog is gone');
    assert.ok(listboxIn(), 'the list stays until its mount closes it or is destroyed');
  });

  it('leaves no dialog, container or layer when destroyed while open', async () => {
    const { handle } = mountModal({}, { target: fabricateTarget(shells, 'fabricate') });
    await settle();
    const dialog = dialogIn();
    const container = dialog.parentElement;
    handle.destroy();
    await settle();
    assert.ok(!dialog.isConnected && !container.isConnected, 'no dialog and no container');
    assert.ok(!document.querySelector(LAYER), 'no layer');
    assert.deepEqual(reports, []);
  });
});

describe('the published Modal refuses', () => {
  it('a missing required key or an empty title (M9), and an onClose that is no function (M17)', () => {
    for (const key of ['title', 'closeLabel', 'onClose']) {
      const props = required();
      delete props[key];
      assertRefused(props, `Modal requires a non-empty "${key}"`);
    }
    assertRefused({ ...required(), title: '' }, 'Modal requires a non-empty "title"');
    for (const onClose of ['', 'x']) {
      assertRefused({ ...required(), onClose }, '"onClose" must be a function');
    }
  });

  it('a slot value that is no boolean (M15)', () => {
    for (const key of ['body', 'footer']) {
      assertRefused({ ...required(), [key]: 'x' }, `"${key}" is a slot and takes true or false`);
    }
  });

  it('every unpublished prop, class and a data-* key (M8)', () => {
    for (const key of UNPUBLISHED) {
      assertRefused({ ...required(), [key]: 'x' }, `"${key}" is not a prop of Modal`);
    }
  });

  it('a target outside a Fabricate window (M16), and an overlayHost of another document (M18)', async () => {
    assertRefused(required(), 'Modal needs a Fabricate window ancestor', companionTarget(shells));
    const other = new Window({ url: 'http://localhost/other' });
    try {
      assertRefused(
        required(),
        "overlayHost must be an element in the target's document",
        fabricateTarget(shells),
        other.document.createElement('section')
      );
    } finally {
      await other.happyDOM.close();
    }
  });
});

describe('the published Modal names', () => {
  it('its dialog by title alone, its heading and subtitle, and its close control by closeLabel', async () => {
    mountModal({ subtitle: 'Flask of quicksilver' });
    await settle();
    const dialog = dialogIn();
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(dialog.getAttribute('aria-label'), REQUIRED.title);
    assert.ok(!dialog.hasAttribute('aria-describedby'), 'no description');
    const heading = dialog.querySelector('h3');
    assert.equal(heading.textContent.trim(), REQUIRED.title);
    const subtitle = heading.nextElementSibling;
    assert.equal(subtitle?.textContent.trim(), 'Flask of quicksilver', 'beneath the title');
    assert.equal(closeIn().getAttribute('aria-label'), REQUIRED.closeLabel);
    assert.equal(closeIn().getAttribute('data-tooltip-text'), REQUIRED.closeLabel, 'its tooltip');
  });

  it('draws no copy of its own and calls no game.i18n while it mounts, opens, updates and closes', async () => {
    const { game } = globalThis;
    const saved = game.i18n;
    const asked = [];
    const record = (key) => {
      asked.push(key);
      return key;
    };
    game.i18n = { localize: record, format: record, has: () => true };
    try {
      const { update } = mountModal({ open: false, closeLabel: 'Dismiss' });
      update({ open: true });
      await settle();
      update({ open: true, title: 'Rename the tool' });
      await settle();
      assert.ok(!document.body.textContent.includes('Close'), 'no copy of Fabricate’s own');
      update({ open: false });
      await settle();
    } finally {
      game.i18n = saved;
    }
    assert.deepEqual(asked, []);
  });
});

describe('the published Modal slots', () => {
  it('are the same elements across updates, detached while closed and attached again with their content live', async () => {
    const { handle, update } = mountModal();
    await settle();
    const [body, footer] = [handle.slot('body'), handle.slot('footer')];
    const pressed = [];
    const button = companionButton(body);
    button.addEventListener('click', () => {
      pressed.push('body');
    });
    assert.ok(dialogIn().contains(body) && dialogIn().contains(footer), 'both in the dialog');
    update({ title: 'Rename the tool' });
    assert.ok(handle.slot('body') === body && handle.slot('footer') === footer, 'kept on update');
    update({ open: false });
    await settle();
    assert.ok(!body.isConnected && !footer.isConnected, 'detached while closed');
    assert.ok(handle.slot('body') === body, 'still the same element');
    update({ open: true });
    await settle();
    assert.ok(dialogIn().contains(body) && dialogIn().contains(footer), 'attached again');
    assert.ok(body.contains(button), 'with its content');
    button.click();
    assert.deepEqual(pressed, ['body'], 'and its listener still fires');
  });

  it('draws no band for an omitted slot, and no form', async () => {
    const { update } = mountModal({ footer: false });
    await settle();
    assert.ok(dialogIn().querySelector('.manager-modal-body'), 'the body band');
    assert.ok(!dialogIn().querySelector('.manager-modal-footer'), 'no footer band');
    update({ body: false, footer: false });
    await settle();
    assert.ok(!dialogIn().querySelector('.manager-modal-body'), 'no body band');
    assert.ok(!dialogIn().querySelector('form'), 'no form');
    assert.ok(dialogIn().querySelector('h3'), 'the header alone');
  });
});

describe('closing the published Modal', () => {
  it('calls onClose once with no argument on a close-control click, and stays open until an update closes it', async () => {
    const { calls, update } = mountModal();
    await settle();
    closeIn().click();
    flushSync();
    assert.deepEqual(calls, [[]]);
    await settle();
    assert.ok(dialogIn(), 'Fabricate does not close it');
    update({ open: false });
    await settle();
    assert.ok(!dialogIn(), 'the companion’s update does');
  });

  for (const key of ['Enter', ' ']) {
    it(`calls nothing on a keydown of ${JSON.stringify(key)} on the close control, and claims no key`, async () => {
      const { calls } = mountModal();
      await settle();
      const event = press(closeIn(), key);
      assert.deepEqual(calls, []);
      assert.equal(event.defaultPrevented, false);
    });
  }

  it('reports an onClose that throws, and stays drawn and live', async () => {
    const failure = new Error('the companion refused to close');
    const { update } = mountModal({
      onClose() {
        throw failure;
      },
    });
    await settle();
    closeIn().click();
    flushSync();
    await settle();
    assert.deepEqual(reports, [[CALLBACK_REPORT, 'Modal', 'onClose', failure]]);
    assert.ok(dialogIn(), 'still drawn');
    assert.equal(update(), true, 'still live');
  });

  it('calls nothing on mount, update, destroy, or a press inside the dialog', async () => {
    const { calls, handle, update } = mountModal();
    await settle();
    const inside = companionButton(handle.slot('body'));
    pointer(inside, 'mousedown');
    inside.click();
    pointer(dialogIn(), 'mousedown');
    update({ title: 'Rename the tool' });
    update({ open: false });
    update({ open: true });
    await settle();
    handle.destroy();
    await settle();
    assert.deepEqual(calls, []);
  });
});

for (const closeOnOutsideClick of [true, false]) {
  describe(`Escape in the published Modal with closeOnOutsideClick ${closeOnOutsideClick}`, () => {
    const open = async (props = {}, options = {}) => {
      const mounted = mountModal({ closeOnOutsideClick, ...props }, options);
      await settle();
      return mounted;
    };

    it('on the close control calls onClose once, is prevented, and reaches no bubbling listener on the host or the window', async () => {
      const { calls } = await open();
      const host = dialogIn().parentElement;
      const keys = hearing('keydown', [
        ['host', host],
        ['above', host.parentElement],
        ['window', document.defaultView],
      ]);
      let event;
      try {
        event = press(closeIn(), 'Escape');
      } finally {
        keys.stop();
      }
      assert.deepEqual(calls, [[]]);
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(keys.heard, []);
    });

    it('calls onClose again on a repeat, and nothing for a composing Escape', async () => {
      const { calls } = await open();
      press(closeIn(), 'Escape');
      press(closeIn(), 'Escape', { repeat: true });
      press(closeIn(), 'Escape', { isComposing: true });
      assert.equal(calls.length, 2);
    });

    it('leaves an Escape on an expanded button in the body slot to it, a document capture listener collapsing it included', async () => {
      const { calls, handle } = await open();
      const expanded = companionButton(handle.slot('body'), { 'aria-expanded': 'true' });
      const keys = hearing('keydown', [['window', document.defaultView]]);
      const collapse = (event) => {
        if (event.key === 'Escape') expanded.setAttribute('aria-expanded', 'false');
      };
      let held;
      let collapsed;
      try {
        held = press(expanded, 'Escape');
        expanded.setAttribute('aria-expanded', 'true');
        document.addEventListener('keydown', collapse, { capture: true });
        collapsed = press(expanded, 'Escape');
      } finally {
        document.removeEventListener('keydown', collapse, { capture: true });
        keys.stop();
      }
      assert.equal(expanded.getAttribute('aria-expanded'), 'false', 'the listener collapsed it');
      assert.deepEqual(calls, []);
      assert.equal(held.defaultPrevented || collapsed.defaultPrevented, false);
      assert.deepEqual(keys.heard, ['window:Escape', 'window:Escape'], 'and does not stop it');
    });

    it('keeps onClose uncalled when a slot listener stops Escape', async () => {
      const { calls, handle } = await open();
      const button = companionButton(handle.slot('body'));
      button.addEventListener('keydown', (event) => event.stopPropagation());
      press(button, 'Escape');
      assert.deepEqual(calls, []);
    });

    it('prevents an Escape in a published SearchField in the body slot and calls onClose once', async () => {
      const { api, calls, handle } = await open();
      const { target } = mountIn(api, handle.slot('body'), 'SearchField', {
        ariaLabel: 'Search reagents',
      });
      const event = press(target.querySelector('input'), 'Escape');
      assert.equal(event.defaultPrevented, true);
      assert.deepEqual(calls, [[]]);
    });

    it('calls nothing for an Escape on a closed published Select or IconPicker trigger in the body slot', async () => {
      const { api, calls, handle } = await open();
      for (const [name, props] of [
        ['Select', SELECT],
        ['IconPicker', PICKER],
      ]) {
        const { target } = mountIn(api, handle.slot('body'), name, { ...props, onChange() {} });
        press(target.querySelector('button'), 'Escape');
      }
      assert.deepEqual(calls, []);
    });

    it(
      closeOnOutsideClick
        ? 'closes an opened published IconPicker’s list on an Escape in its query field, and calls onClose once'
        : 'closes an opened published IconPicker’s list on an Escape in its query field, and calls nothing',
      async () => {
        const { api, calls, handle } = await open();
        const { target } = mountIn(api, handle.slot('body'), 'IconPicker', {
          ...PICKER,
          onChange() {},
        });
        target.querySelector('button').click();
        flushSync();
        await settle();
        const field = document.querySelector('[role="dialog"]:not([data-manager-modal]) input');
        assert.ok(field, 'the list is open with its query field');
        press(field, 'Escape');
        await settle();
        assert.ok(!document.querySelector('[role="dialog"]:not([data-manager-modal])'), 'closed');
        assert.equal(calls.length, closeOnOutsideClick ? 1 : 0);
      }
    );

    it(
      closeOnOutsideClick
        ? 'calls onClose once for an Escape on the page, which it does not stop'
        : 'calls nothing for an Escape on the page',
      async () => {
        const { calls } = await open();
        const keys = hearing('keydown', [['window', document.defaultView]]);
        let event;
        try {
          event = press(document.body, 'Escape');
        } finally {
          keys.stop();
        }
        assert.equal(calls.length, closeOnOutsideClick ? 1 : 0);
        assert.equal(event.defaultPrevented, false);
        assert.deepEqual(keys.heard, ['window:Escape']);
      }
    );
  });
}

describe('outside presses on the published Modal', () => {
  for (const closeOnOutsideClick of [true, false]) {
    it(`calls onClose ${closeOnOutsideClick ? 'once' : 'never'} for a mousedown on the host outside the dialog with ${closeOnOutsideClick}`, async () => {
      const target = fabricateTarget(shells, 'fabricate fabricate-app');
      const overlayHost = companionHost(target.parentElement);
      const { calls } = mountModal({ closeOnOutsideClick }, { target, overlayHost });
      await settle();
      pointer(overlayHost, 'mousedown');
      assert.equal(calls.length, closeOnOutsideClick ? 1 : 0);
    });
  }

  it('calls onClose before the click reaches a companion opener outside the dialog', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const opener = companionButton(target.parentElement);
    const order = [];
    opener.addEventListener('click', () => {
      order.push('click');
    });
    const onClose = () => {
      order.push('close');
    };
    mountModal({ onClose }, { target });
    await settle();
    pointer(opener, 'mousedown');
    opener.click();
    assert.deepEqual(order, ['close', 'click']);
  });

  /** An open dialog with a published Select in its body slot, its list opened from the trigger. */
  async function withOpenSelect(closeOnOutsideClick, selectHost) {
    const mounted = mountModal({ closeOnOutsideClick });
    await settle();
    const slot = mounted.handle.slot('body');
    const target = doc(slot).createElement('div');
    slot.append(target);
    const overlayHost = selectHost?.(slot);
    const props = { ...SELECT, onChange() {} };
    handles.push(mounted.api.mount('Select', { target, props, overlayHost }));
    flushSync();
    target.querySelector('button').click();
    flushSync();
    await settle();
    return { ...mounted, list: listboxIn() };
  }

  for (const closeOnOutsideClick of [true, false]) {
    it(`calls onClose ${closeOnOutsideClick ? 'once' : 'never'} for a mousedown on a slot-mounted Select’s list with ${closeOnOutsideClick}`, async () => {
      const { calls, list } = await withOpenSelect(closeOnOutsideClick, null);
      assert.ok(!dialogIn().contains(list), 'the list is drawn outside the dialog');
      pointer(list, 'mousedown');
      assert.equal(calls.length, closeOnOutsideClick ? 1 : 0);
    });

    it(`calls nothing for a mousedown or an Escape in that Select’s list when its overlayHost is in the slot, with ${closeOnOutsideClick}`, async () => {
      const { calls, list } = await withOpenSelect(closeOnOutsideClick, (slot) =>
        companionHost(slot)
      );
      assert.ok(dialogIn().contains(list), 'the list is drawn inside the dialog');
      pointer(list, 'mousedown');
      press(list, 'Escape');
      assert.deepEqual(calls, []);
    });
  }
});

describe('focus and the published Modal', () => {
  it('moves no focus as it opens or as an update closes it, and leaves Tab to the browser', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const opener = companionButton(target.parentElement);
    opener.focus();
    const { update } = mountModal({ open: false }, { target });
    update({ open: true });
    await settle();
    assert.ok(document.activeElement === opener, 'focus stays on the opener as it opens');
    assert.equal(press(closeIn(), 'Tab').defaultPrevented, false, 'Tab is not prevented');
    update({ open: false });
    await settle();
    assert.ok(document.activeElement === opener, 'and as it closes');
  });
});

describe('the published Modal hosts its dialog', () => {
  it('in the overlayHost option', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { handle } = mountModal({}, { target, overlayHost });
    await settle();
    assert.ok(dialogIn().parentElement.parentElement === overlayHost, 'the option hosts it');
    handle.destroy();
    assert.equal(overlayHost.children.length, 0, 'destroy leaves no container');
  });

  it('in the nearest .fabricate-app above target when no overlayHost is passed', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    mountModal({}, { target });
    await settle();
    assert.ok(dialogIn().parentElement.parentElement === target.parentElement, 'the app root');
    assert.ok(!document.querySelector(LAYER), 'no standalone layer is made');
  });

  it('in the standalone layer under a Fabricate frame with no app root', async () => {
    mountModal({}, { target: fabricateTarget(shells, 'fabricate') });
    await settle();
    const layer = document.querySelector(LAYER);
    assert.ok(layer?.parentElement === document.body, 'a layer on the target’s body');
    assert.ok(layer.contains(dialogIn()));
  });

  it('gives a published mount in its slot an overlay host by that mount’s own chain', async () => {
    const target = fabricateTarget(shells, 'fabricate fabricate-app');
    const overlayHost = companionHost(target.parentElement);
    const { api, handle } = mountModal({}, { target, overlayHost });
    await settle();
    const nested = mountIn(api, handle.slot('body'), 'Select', { ...SELECT, onChange() {} });
    nested.target.querySelector('button').click();
    flushSync();
    await settle();
    const container = listboxIn().closest('[role="dialog"]').parentElement;
    assert.ok(!dialogIn().contains(container), 'not inside the dialog');
    assert.ok(container.parentElement === target.parentElement, 'the app root above its target');
  });
});

describe('the published Modal in a second window', () => {
  let second;

  beforeEach(() => {
    second = new Window({ url: 'http://localhost/detached' });
  });

  afterEach(async () => {
    await second.happyDOM.close();
  });

  /** A target under a Fabricate window frame in the second window's own document. */
  function detachedTarget() {
    const owner = second.document;
    const shell = owner.createElement('section');
    shell.className = 'fabricate';
    const target = owner.createElement('div');
    shell.append(target);
    owner.body.append(shell);
    return target;
  }

  it('draws its dialog in that document’s layer', async () => {
    mountModal({}, { target: detachedTarget() });
    await settle();
    const layer = second.document.querySelector(LAYER);
    assert.ok(layer?.parentElement === second.document.body, "the second document's body");
    assert.ok(layer.contains(dialogIn(second.document)), 'the dialog is in it');
    assert.ok(!dialogIn(), 'nothing is drawn in this window');
  });

  it('calls onClose there for a close click, an outside mousedown and an Escape in the dialog', async () => {
    const { calls } = mountModal({}, { target: detachedTarget() });
    await settle();
    closeIn(second.document).click();
    flushSync();
    pointer(second.document.body, 'mousedown');
    const event = press(closeIn(second.document), 'Escape');
    assert.equal(calls.length, 3);
    assert.equal(event.defaultPrevented, true);
  });
});

describe('the modal View Lab specimen cases against the DOM the fixture draws', () => {
  const count = (selector) => document.querySelectorAll(selector).length;

  /** The fixture's ground, which is the overlay host, with its opener and the dialog's target. */
  function drawFixture() {
    const ground = document.createElement('div');
    ground.setAttribute('data-lab-modal', '');
    const opener = document.createElement('div');
    opener.setAttribute('data-lab-modal-open', '');
    const target = document.createElement('div');
    ground.append(opener, target);
    fabricateTarget(shells, 'fabricate fabricate-app').append(ground);
    const api = ui();
    teardowns.push(mountModalSpecimen({ mount: api.mount, ground, opener, target }));
    flushSync();
    return { ground, opener: () => opener.querySelector('button') };
  }

  /** Runs each of the case's steps on the one element it names; a key is pressed, Enter clicks. */
  async function runSteps(viewCase) {
    for (const [at, step] of viewCase.steps.entries()) {
      assert.equal(count(step.selector), 1, `step ${at} names one element`);
      const node = document.querySelector(step.selector);
      node.focus();
      const event = press(node, step.press);
      if (step.press === 'Enter' && !event.defaultPrevented) node.click();
      flushSync();
      await settle();
    }
  }

  for (const { id, reached } of [
    {
      id: 'manager-published-modal-specimen',
      reached: () => document.querySelector('[data-lab-modal-footer] button'),
    },
    { id: 'manager-published-modal-close', reached: (fixture) => fixture.opener() },
  ]) {
    const viewCase = getCaseById(id);

    it(`${id} waits on exactly one element once its steps have run`, async () => {
      const fixture = drawFixture();
      await settle();
      assert.equal(count(viewCase.expectSelector), 0, 'not before the steps');
      await runSteps(viewCase);
      assert.equal(count(viewCase.expectSelector), 1, 'one element after them');
      assert.ok(document.querySelector(viewCase.expectSelector) === reached(fixture));
      for (const selector of [
        viewCase.expectCenterHit,
        ...viewCase.expectLayout.controls.map((control) => control.selector),
      ]) {
        assert.equal(count(selector), 1, `${selector} names one element`);
      }
    });
  }

  it('draws the specimen’s strings, and keeps a press on the opener from reopening the dialog that press closed', async () => {
    const { opener } = drawFixture();
    assert.equal(opener().textContent.trim(), OPENER_LABEL);
    opener().click();
    flushSync();
    await settle();
    assert.equal(dialogIn().getAttribute('aria-label'), DIALOG.title);
    assert.ok(dialogIn().textContent.includes(BODY_TEXT), 'the body paragraph');
    for (const type of ['pointerdown', 'mousedown']) pointer(opener(), type);
    opener().click();
    flushSync();
    await settle();
    assert.ok(!dialogIn(), 'the press closed it and its click did not reopen it');
    opener().click();
    flushSync();
    await settle();
    assert.ok(dialogIn(), 'a later press opens it');
  });

  it('closes through the fixture’s close path from the footer button', async () => {
    const { ground, opener } = drawFixture();
    opener().click();
    flushSync();
    await settle();
    const done = document.querySelector('[data-lab-modal-footer] button');
    assert.equal(done.textContent.trim(), DONE_LABEL);
    assert.ok(document.activeElement === done, 'opening focused the footer button');
    done.click();
    flushSync();
    await settle();
    assert.ok(!dialogIn(), 'closed');
    assert.equal(ground.getAttribute('data-lab-modal-closed'), '1');
    assert.ok(document.activeElement === opener(), 'focus is back on the opener');
  });
});
